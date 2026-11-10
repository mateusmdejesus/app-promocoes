import { LIMITS, lockedUntil, storeLabel, type Category, type Plan, type Tier } from '@keropromo/core';
import type { EmailSender } from './auth';
import type { Repo } from './repo';

/** Item da página "Vigiando". Preços em centavos. */
export interface WatchDTO {
  id: string;
  title: string;
  category: Category;
  storeName: string;
  imageUrl: string | null;
  /** Some (null) quando é oferta quente ainda travada no plano grátis. */
  url: string | null;
  price: number | null;
  lowestPrice: number | null;
  targetPrice: number | null;
  /** Preço de agora está na meta ou abaixo. */
  reached: boolean;
  locked: boolean;
  offer: { discountPct: number; tier: Tier } | null;
  watchedAt: string;
}

export function watchList(repo: Repo, userId: string, plan: Plan, now: Date): WatchDTO[] {
  return repo.watches(userId, now).map((w) => {
    const offer = repo.getOffer(w.product.id);
    const locked = !!(offer && lockedUntil(plan, offer.analysis.tier, offer.detectedAt, now));
    return {
      id: w.product.id,
      title: w.product.title,
      category: w.product.category,
      storeName: storeLabel(w.product),
      imageUrl: w.product.imageUrl ?? null,
      url: locked ? null : w.product.url,
      price: locked ? null : (w.price ?? null),
      lowestPrice: locked ? null : (w.lowest90 ?? null),
      targetPrice: w.targetPrice ?? null,
      reached: !locked && w.price != null && w.targetPrice != null && w.price <= w.targetPrice,
      locked,
      offer: offer && offer.analysis.tier !== 'none' ? { discountPct: offer.analysis.discountPct, tier: offer.analysis.tier } : null,
      watchedAt: w.createdAt.toISOString(),
    };
  });
}

export const MAX_WATCHES = 200;

/** Quantas metas de preço o plano permite (salvar sem meta não tem limite além de MAX_WATCHES). */
export const targetLimit = (plan: Plan) => LIMITS[plan].alerts;

/**
 * Depois de cada varredura: avisa por e-mail quem tem meta e o preço chegou nela.
 * Avisa uma vez por queda (de novo só se cair mais) e volta a avisar se o preço subir acima da meta e cair de novo.
 */
export async function notifyWatches(repo: Repo, email: EmailSender, siteUrl: string, now: Date): Promise<number> {
  let sent = 0;
  for (const w of repo.watchTargets()) {
    if (w.price == null) continue;
    if (w.price > w.targetPrice) {
      if (w.notifiedPrice != null) repo.setWatchNotified(w.userId, w.productId, null, now);
      continue;
    }
    if (w.notifiedPrice != null && w.price >= w.notifiedPrice) continue;
    const to = repo.account(w.userId)?.email;
    const product = repo.productById(w.productId);
    if (!to || !product) continue;
    try {
      await email.sendPriceAlert(to, {
        title: product.title,
        price: w.price,
        target: w.targetPrice,
        storeName: storeLabel(product),
        pageUrl: `${siteUrl}/oferta/${encodeURIComponent(product.id)}`,
      });
      repo.setWatchNotified(w.userId, w.productId, w.price, now);
      sent++;
    } catch (e) {
      console.warn(`[meta] falhou o aviso para ${w.userId}: ${(e as Error).message}`);
    }
  }
  return sent;
}
