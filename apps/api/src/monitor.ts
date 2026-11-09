import {
  analyzePrice,
  canPush,
  formatBRL,
  HISTORY_WINDOW_DAYS,
  matchesAlert,
  STORE_NAMES,
  type PriceAnalysis,
  type Product,
  type PushReason,
  type Tier,
} from '@keropromo/core';
import type { StoreAdapter } from './adapters/types';
import type { PushMessage, PushSender } from './push';
import type { Repo } from './repo';

const DAY_MS = 86_400_000;
/** Mesmo sem mudança de preço, grava um ponto a cada 6 h para o histórico ter densidade. */
const HEARTBEAT_MS = 6 * 3_600_000;
const TIER_RANK: Record<Tier, number> = { none: 0, promo: 1, hot: 2 };

export interface MonitorResult {
  scanned: number;
  newDeals: number;
  pushesSent: number;
  errors: string[];
}

interface NewDeal {
  product: Product;
  analysis: PriceAnalysis;
}

/**
 * Uma varredura: pergunta o preço de tudo em cada loja, grava o histórico,
 * recalcula o desconto real e notifica quem deve ser notificado.
 */
export async function runMonitor(repo: Repo, adapters: StoreAdapter[], sender: PushSender, now = new Date(), opts: { notify?: boolean } = {}): Promise<MonitorResult> {
  const result: MonitorResult = { scanned: 0, newDeals: 0, pushesSent: 0, errors: [] };
  const deals: NewDeal[] = [];

  for (const adapter of adapters) {
    let listings;
    try {
      listings = await adapter.fetchListings(now);
    } catch (e) {
      // Uma loja fora do ar não pode derrubar as outras.
      result.errors.push(`${adapter.store}: ${(e as Error).message}`);
      continue;
    }
    for (const s of listings) {
      result.scanned++;
      const product = repo.upsertProduct(adapter.store, s);
      const last = repo.lastPricePoint(product.id);
      const current = { price: s.price, listPrice: s.listPrice, at: now };
      const priceChanged = !last || last.price !== s.price;
      if (priceChanged || now.getTime() - last.at.getTime() >= HEARTBEAT_MS) repo.addPricePoint(product.id, current);

      const history = repo.history(product.id, new Date(now.getTime() - HISTORY_WINDOW_DAYS * DAY_MS), now);
      const analysis = analyzePrice(current, history, now);
      const prev = repo.getOffer(product.id);
      const detectedAt = !prev || prev.analysis.price !== analysis.price ? now : prev.detectedAt;
      repo.saveOffer(product.id, analysis, detectedAt, now);

      // É novidade se subiu de faixa, ou se já era promoção e caiu ainda mais.
      const improved = !prev || TIER_RANK[analysis.tier] > TIER_RANK[prev.analysis.tier] || analysis.price < prev.analysis.price;
      if (analysis.tier !== 'none' && improved) deals.push({ product, analysis });
    }
  }

  result.newDeals = deals.length;
  if (opts.notify !== false && deals.length > 0) result.pushesSent = await notify(repo, deals, sender, now);
  return result;
}

async function notify(repo: Repo, deals: NewDeal[], sender: PushSender, now: Date): Promise<number> {
  const alerts = repo.alerts();
  const messages: Array<PushMessage & { userId: string; productId: string; reason: PushReason }> = [];

  for (const { userId, token } of repo.pushTargets()) {
    const interests = new Set(repo.categories(userId));
    const userAlerts = alerts.filter((a) => a.userId === userId);
    let sentToday = repo.pushesSince(userId, new Date(now.getTime() - DAY_MS));

    // Melhores ofertas primeiro: se o limite diário estourar, cortam-se as piores.
    for (const d of [...deals].sort((a, b) => b.analysis.discountPct - a.analysis.discountPct)) {
      const candidate = { title: d.product.title, store: d.product.store, price: d.analysis.price, tier: d.analysis.tier };
      const alert = userAlerts.find((a) => matchesAlert(a, candidate));
      const reason: PushReason | undefined = alert ? 'alert_match' : d.analysis.tier === 'hot' && interests.has(d.product.category) ? 'hot_in_interest' : undefined;
      if (!reason) continue;
      if (!canPush({ sentLast24h: sentToday, lastSentForProduct: repo.lastPushFor(userId, d.product.id) }, now, reason)) continue;

      const store = STORE_NAMES[d.product.store];
      const price = formatBRL(d.analysis.price);
      const ref = formatBRL(d.analysis.referencePrice);
      messages.push({
        userId,
        productId: d.product.id,
        reason,
        to: token,
        title: alert ? `Seu alerta: ${alert.term}` : `Caiu ${d.analysis.discountPct}%: ${shorten(d.product.title)}`,
        body: alert ? `Achamos por ${price} no ${store} (−${d.analysis.discountPct}%).` : `De ${ref} por ${price} no ${store}.${d.analysis.lowestInWindow ? ' Menor preço em 90 dias.' : ''}`,
        data: { productId: d.product.id },
      });
      sentToday++;
    }
  }

  if (messages.length === 0) return 0;
  const ok = await sender.send(messages.map(({ to, title, body, data }) => ({ to, title, body, data })));
  let sent = 0;
  messages.forEach((m, i) => {
    if (ok[i]) (repo.recordPush(m.userId, m.productId, m.reason, now), sent++);
  });
  return sent;
}

function shorten(title: string, max = 40): string {
  if (title.length <= max) return title;
  const cut = title.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(',') > 20 ? cut.lastIndexOf(',') : cut.lastIndexOf(' ')).trim();
}
