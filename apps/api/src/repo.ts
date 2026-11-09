import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AlertRule, Category, PriceAnalysis, PricePoint, Product, StoreId, Tier, UserEvent, EventKind } from '@keropromo/core';
import type { DB } from './db';
import type { ListingSnapshot } from './adapters/types';

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v);

export interface OfferRow {
  product: Product;
  analysis: PriceAnalysis;
  detectedAt: Date;
}

export interface Alert extends AlertRule {
  id: string;
  userId: string;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Todas as consultas ao banco ficam aqui. */
export class Repo {
  constructor(private db: DB) {}

  // ---------- produtos e preços ----------

  upsertProduct(store: StoreId, s: ListingSnapshot): Product {
    const existing = this.db.prepare('SELECT id FROM products WHERE store = ? AND external_id = ?').get(store, s.externalId) as Row | undefined;
    const id = existing ? String(existing.id) : `${store}:${s.externalId}`;
    this.db
      .prepare(
        `INSERT INTO products (id, store, external_id, title, category, url, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, category = excluded.category, url = excluded.url, image_url = excluded.image_url`,
      )
      .run(id, store, s.externalId, s.title, s.category, s.url, s.imageUrl ?? null);
    return { id, store, externalId: s.externalId, title: s.title, category: s.category, url: s.url, imageUrl: s.imageUrl };
  }

  lastPricePoint(productId: string): PricePoint | undefined {
    const r = this.db.prepare('SELECT price, list_price, at FROM price_points WHERE product_id = ? ORDER BY at DESC LIMIT 1').get(productId) as Row | undefined;
    return r ? toPoint(r) : undefined;
  }

  addPricePoint(productId: string, p: PricePoint): void {
    this.db.prepare('INSERT INTO price_points (product_id, price, list_price, at) VALUES (?, ?, ?, ?)').run(productId, p.price, p.listPrice ?? null, p.at.getTime());
  }

  history(productId: string, since: Date, before: Date): PricePoint[] {
    return (this.db.prepare('SELECT price, list_price, at FROM price_points WHERE product_id = ? AND at >= ? AND at < ? ORDER BY at').all(productId, since.getTime(), before.getTime()) as Row[]).map(toPoint);
  }

  /** Menor preço de cada dia, para o gráfico do app. */
  dailyLows(productId: string, since: Date): Array<{ day: string; price: number }> {
    return (
      this.db
        .prepare(
          `SELECT date(at / 1000, 'unixepoch', '-3 hours') AS day, MIN(price) AS price
           FROM price_points WHERE product_id = ? AND at >= ? GROUP BY day ORDER BY day`,
        )
        .all(productId, since.getTime()) as Row[]
    ).map((r) => ({ day: String(r.day), price: n(r.price) }));
  }

  // ---------- ofertas ----------

  getOffer(productId: string): OfferRow | undefined {
    const r = this.db.prepare(`${OFFER_SELECT} WHERE o.product_id = ?`).get(productId) as Row | undefined;
    return r ? toOffer(r) : undefined;
  }

  saveOffer(productId: string, a: PriceAnalysis, detectedAt: Date, now: Date): void {
    this.db
      .prepare(
        `INSERT INTO offers (product_id, price, reference_price, discount_pct, tier, verified, inflated, lowest, history_days, detected_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(product_id) DO UPDATE SET price = excluded.price, reference_price = excluded.reference_price,
           discount_pct = excluded.discount_pct, tier = excluded.tier, verified = excluded.verified, inflated = excluded.inflated,
           lowest = excluded.lowest, history_days = excluded.history_days, detected_at = excluded.detected_at, updated_at = excluded.updated_at`,
      )
      .run(productId, a.price, a.referencePrice, a.discountPct, a.tier, +a.verified, +a.inflatedListPrice, +a.lowestInWindow, a.historyDays, detectedAt.getTime(), now.getTime());
  }

  /** Ofertas ativas (25% ou mais), opcionalmente filtradas. */
  activeOffers(filter: { category?: Category; tier?: Tier } = {}): OfferRow[] {
    const where = ["o.tier != 'none'"];
    const args: Array<string> = [];
    if (filter.category) (where.push('p.category = ?'), args.push(filter.category));
    if (filter.tier) (where.push('o.tier = ?'), args.push(filter.tier));
    return (this.db.prepare(`${OFFER_SELECT} WHERE ${where.join(' AND ')}`).all(...args) as Row[]).map(toOffer);
  }

  clicksSince(since: Date): Map<string, number> {
    const rows = this.db.prepare("SELECT product_id, COUNT(*) AS c FROM events WHERE kind = 'click_out' AND at >= ? GROUP BY product_id").all(since.getTime()) as Row[];
    return new Map(rows.map((r) => [String(r.product_id), n(r.c)]));
  }

  // ---------- usuários ----------

  createUser(now: Date): { id: string; secret: string } {
    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    this.db.prepare('INSERT INTO users (id, secret_hash, created_at) VALUES (?, ?, ?)').run(id, sha256(secret), now.getTime());
    return { id, secret };
  }

  userIdBySecret(secret: string): string | undefined {
    const r = this.db.prepare('SELECT id FROM users WHERE secret_hash = ?').get(sha256(secret)) as Row | undefined;
    return r ? String(r.id) : undefined;
  }

  setPushToken(userId: string, token: string | null): void {
    this.db.prepare('UPDATE users SET push_token = ? WHERE id = ?').run(token, userId);
  }

  setCategories(userId: string, cats: Category[]): void {
    this.db.prepare('DELETE FROM user_categories WHERE user_id = ?').run(userId);
    const ins = this.db.prepare('INSERT INTO user_categories (user_id, category) VALUES (?, ?)');
    for (const c of new Set(cats)) ins.run(userId, c);
  }

  categories(userId: string): Category[] {
    return (this.db.prepare('SELECT category FROM user_categories WHERE user_id = ?').all(userId) as Row[]).map((r) => r.category as Category);
  }

  pushTargets(): Array<{ userId: string; token: string }> {
    return (this.db.prepare('SELECT id, push_token FROM users WHERE push_token IS NOT NULL').all() as Row[]).map((r) => ({ userId: String(r.id), token: String(r.push_token) }));
  }

  // ---------- eventos ----------

  addEvent(userId: string, e: { kind: EventKind; productId?: string; category?: Category; query?: string; at: Date }): void {
    this.db.prepare('INSERT INTO events (user_id, kind, product_id, category, query, at) VALUES (?, ?, ?, ?, ?, ?)').run(userId, e.kind, e.productId ?? null, e.category ?? null, e.query ?? null, e.at.getTime());
  }

  events(userId: string, since: Date): UserEvent[] {
    return (this.db.prepare('SELECT kind, category, query, at FROM events WHERE user_id = ? AND at >= ?').all(userId, since.getTime()) as Row[]).map((r) => ({
      kind: r.kind as EventKind,
      category: (r.category ?? undefined) as Category | undefined,
      query: (r.query ?? undefined) as string | undefined,
      at: new Date(n(r.at)),
    }));
  }

  // ---------- alertas ----------

  alerts(userId?: string): Alert[] {
    const rows = (userId ? this.db.prepare('SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at').all(userId) : this.db.prepare('SELECT * FROM alerts WHERE enabled = 1').all()) as Row[];
    return rows.map(toAlert);
  }

  createAlert(userId: string, rule: AlertRule, now: Date): Alert {
    const id = randomUUID();
    this.db.prepare('INSERT INTO alerts (id, user_id, term, max_price, min_tier, stores, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, userId, rule.term, rule.maxPrice ?? null, rule.minTier, JSON.stringify(rule.stores), +rule.enabled, now.getTime());
    return { id, userId, ...rule };
  }

  updateAlert(userId: string, id: string, patch: Partial<AlertRule>): Alert | undefined {
    const cur = this.alerts(userId).find((a) => a.id === id);
    if (!cur) return undefined;
    const next = { ...cur, ...patch };
    this.db.prepare('UPDATE alerts SET term = ?, max_price = ?, min_tier = ?, stores = ?, enabled = ? WHERE id = ? AND user_id = ?').run(next.term, next.maxPrice ?? null, next.minTier, JSON.stringify(next.stores), +next.enabled, id, userId);
    return next;
  }

  deleteAlert(userId: string, id: string): boolean {
    return n(this.db.prepare('DELETE FROM alerts WHERE id = ? AND user_id = ?').run(id, userId).changes) > 0;
  }

  // ---------- notificações ----------

  pushesSince(userId: string, since: Date): number {
    return n((this.db.prepare('SELECT COUNT(*) AS c FROM pushes WHERE user_id = ? AND at >= ?').get(userId, since.getTime()) as Row).c);
  }

  lastPushFor(userId: string, productId: string): Date | undefined {
    const r = this.db.prepare('SELECT MAX(at) AS at FROM pushes WHERE user_id = ? AND product_id = ?').get(userId, productId) as Row;
    return r.at == null ? undefined : new Date(n(r.at));
  }

  recordPush(userId: string, productId: string, reason: string, at: Date): void {
    this.db.prepare('INSERT INTO pushes (user_id, product_id, reason, at) VALUES (?, ?, ?, ?)').run(userId, productId, reason, at.getTime());
  }
}

const OFFER_SELECT = `SELECT o.*, p.store, p.external_id, p.title, p.category, p.url, p.image_url
  FROM offers o JOIN products p ON p.id = o.product_id`;

function toPoint(r: Row): PricePoint {
  return { price: n(r.price), listPrice: r.list_price == null ? undefined : n(r.list_price), at: new Date(n(r.at)) };
}

function toOffer(r: Row): OfferRow {
  return {
    product: {
      id: String(r.product_id),
      store: r.store as StoreId,
      externalId: String(r.external_id),
      title: String(r.title),
      category: r.category as Category,
      url: String(r.url),
      imageUrl: r.image_url == null ? undefined : String(r.image_url),
    },
    analysis: {
      price: n(r.price),
      referencePrice: n(r.reference_price),
      discountPct: n(r.discount_pct),
      tier: r.tier as Tier,
      verified: !!n(r.verified),
      inflatedListPrice: !!n(r.inflated),
      lowestInWindow: !!n(r.lowest),
      historyDays: n(r.history_days),
    },
    detectedAt: new Date(n(r.detected_at)),
  };
}

function toAlert(r: Row): Alert {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    term: String(r.term),
    maxPrice: r.max_price == null ? undefined : n(r.max_price),
    minTier: r.min_tier as Tier,
    stores: JSON.parse(String(r.stores)) as StoreId[],
    enabled: !!n(r.enabled),
  };
}
