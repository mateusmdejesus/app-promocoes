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
  /**
   * `proEmails`: contas da casa (equipe, testes) que são sempre Pro, sem pagamento.
   * Vem da variável PRO_EMAILS; nunca de algo que o usuário possa mandar.
   */
  private proEmails: Set<string>;
  constructor(
    private db: DB,
    opts: { proEmails?: string[]; now?: () => number } = {},
  ) {
    this.proEmails = new Set((opts.proEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean));
    this.now = opts.now ?? Date.now;
  }
  private now: () => number;

  // ---------- produtos e preços ----------

  upsertProduct(store: StoreId, s: ListingSnapshot): Product {
    const existing = this.db.prepare('SELECT id FROM products WHERE store = ? AND external_id = ?').get(store, s.externalId) as Row | undefined;
    const id = existing ? String(existing.id) : `${store}:${s.externalId}`;
    this.db
      .prepare(
        `INSERT INTO products (id, store, external_id, title, category, url, image_url, seller) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, category = excluded.category, url = excluded.url, image_url = excluded.image_url, seller = excluded.seller`,
      )
      .run(id, store, s.externalId, s.title, s.category, s.url, s.imageUrl ?? null, s.seller ?? null);
    return { id, store, externalId: s.externalId, title: s.title, category: s.category, url: s.url, imageUrl: s.imageUrl, seller: s.seller };
  }

  productCount(): number {
    return n((this.db.prepare('SELECT COUNT(*) AS c FROM products').get() as Row).c);
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
    const h = sha256(secret);
    const r = (this.db.prepare('SELECT user_id AS id FROM sessions WHERE token_hash = ?').get(h) ?? this.db.prepare('SELECT id FROM users WHERE secret_hash = ?').get(h)) as Row | undefined;
    return r ? String(r.id) : undefined;
  }

  /** Abre uma sessão de login e devolve o token (o banco guarda só o hash). */
  createSession(userId: string, now: Date): string {
    const token = randomBytes(32).toString('base64url');
    this.db.prepare('INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)').run(sha256(token), userId, now.getTime());
    return token;
  }

  deleteSession(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  }

  /** Cria um usuário já identificado (sem o segredo anônimo antigo). */
  createIdentifiedUser(now: Date, ident: { email?: string; appleSub?: string }): string {
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO users (id, secret_hash, email, apple_sub, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, sha256(randomBytes(32).toString('base64url')), ident.email ?? null, ident.appleSub ?? null, now.getTime());
    return id;
  }

  userByEmail(email: string): string | undefined {
    const r = this.db.prepare('SELECT id FROM users WHERE email = ?').get(email) as Row | undefined;
    return r ? String(r.id) : undefined;
  }

  userByApple(sub: string): string | undefined {
    const r = this.db.prepare('SELECT id FROM users WHERE apple_sub = ?').get(sub) as Row | undefined;
    return r ? String(r.id) : undefined;
  }

  /** Tira do ar as ofertas de lojas que saíram de STORES (o histórico de preço fica guardado). */
  pruneOffersExcept(stores: string[]): number {
    if (stores.length === 0) return 0;
    const marks = stores.map(() => '?').join(',');
    return n(this.db.prepare(`DELETE FROM offers WHERE product_id IN (SELECT id FROM products WHERE store NOT IN (${marks}))`).run(...stores).changes);
  }

  account(userId: string): { email?: string; hasApple: boolean; proUntil?: Date } | undefined {
    const r = this.db.prepare('SELECT email, apple_sub, pro_until FROM users WHERE id = ?').get(userId) as Row | undefined;
    if (!r) return undefined;
    const email = (r.email ?? undefined) as string | undefined;
    let proUntil = r.pro_until == null ? undefined : new Date(n(r.pro_until));
    // Conta da casa: Pro sempre, renovado a cada consulta (1 ano à frente).
    if (email && this.proEmails.has(email.toLowerCase())) proUntil = new Date(this.now() + 365 * 86_400_000);
    return { email, hasApple: r.apple_sub != null, proUntil };
  }

  /** Conta anônima que ainda não tem e-mail nem Apple pode receber a identidade. */
  isAnonymous(userId: string): boolean {
    const a = this.account(userId);
    return !!a && !a.email && !a.hasApple;
  }

  setEmail(userId: string, email: string): void {
    this.db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, userId);
  }

  setAppleSub(userId: string, sub: string): void {
    this.db.prepare('UPDATE users SET apple_sub = ? WHERE id = ?').run(sub, userId);
  }

  setProUntil(userId: string, until: Date | null): boolean {
    return n(this.db.prepare('UPDATE users SET pro_until = ? WHERE id = ?').run(until?.getTime() ?? null, userId).changes) > 0;
  }

  /** Exclusão de conta (exigência da Apple): apaga tudo do usuário. */
  deleteUser(userId: string): void {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }

  // ---------- cobranças Pix ----------

  savePixCharge(c: PixCharge): void {
    this.db
      .prepare('INSERT INTO pix_charges (id, user_id, period, amount, provider, provider_id, qr_code, status, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(c.id, c.userId, c.period, c.amount, c.provider, c.providerId, c.qrCode, c.status, c.expiresAt.getTime(), c.createdAt.getTime());
  }

  pixCharge(id: string): PixCharge | undefined {
    const r = this.db.prepare('SELECT * FROM pix_charges WHERE id = ?').get(id) as Row | undefined;
    return r ? toCharge(r) : undefined;
  }

  pixChargeByProviderId(providerId: string): PixCharge | undefined {
    const r = this.db.prepare('SELECT * FROM pix_charges WHERE provider_id = ?').get(providerId) as Row | undefined;
    return r ? toCharge(r) : undefined;
  }

  /**
   * Marca como paga e estende o Pro a partir do fim do período atual (ou de agora).
   * Só uma vez por cobrança: chamadas repetidas (webhook + consulta) não somam dias.
   */
  markPixPaid(id: string, now: Date, days: number): boolean {
    const changed = n(this.db.prepare("UPDATE pix_charges SET status = 'approved', paid_at = ? WHERE id = ? AND status != 'approved'").run(now.getTime(), id).changes) > 0;
    if (!changed) return false;
    const c = this.pixCharge(id)!;
    const current = this.account(c.userId)?.proUntil;
    const base = current && current.getTime() > now.getTime() ? current.getTime() : now.getTime();
    this.setProUntil(c.userId, new Date(base + days * 86_400_000));
    return true;
  }

  setPixStatus(id: string, status: string): void {
    this.db.prepare("UPDATE pix_charges SET status = ? WHERE id = ? AND status != 'approved'").run(status, id);
  }

  // ---------- código por e-mail ----------

  saveEmailCode(email: string, code: string, now: Date, ttlMin = 10): void {
    this.db
      .prepare(
        `INSERT INTO email_codes (email, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)
         ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = excluded.created_at`,
      )
      .run(email, sha256(`${email}:${code}`), now.getTime() + ttlMin * 60_000, now.getTime());
  }

  lastEmailCodeAt(email: string): Date | undefined {
    const r = this.db.prepare('SELECT created_at FROM email_codes WHERE email = ?').get(email) as Row | undefined;
    return r ? new Date(n(r.created_at)) : undefined;
  }

  /** Confere o código. Máximo de 5 tentativas; o código vale uma vez só. */
  checkEmailCode(email: string, code: string, now: Date): 'ok' | 'wrong' | 'expired' {
    const r = this.db.prepare('SELECT code_hash, expires_at, attempts FROM email_codes WHERE email = ?').get(email) as Row | undefined;
    if (!r || n(r.expires_at) < now.getTime() || n(r.attempts) >= 5) return 'expired';
    if (r.code_hash !== sha256(`${email}:${code}`)) {
      this.db.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE email = ?').run(email);
      return 'wrong';
    }
    this.db.prepare('DELETE FROM email_codes WHERE email = ?').run(email);
    return 'ok';
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

  queuePush(p: { userId: string; productId: string; reason: string; title: string; body: string; price: number; sendAfter: Date }): void {
    // Uma notificação pendente por produto e pessoa basta.
    this.db.prepare('DELETE FROM pending_pushes WHERE user_id = ? AND product_id = ?').run(p.userId, p.productId);
    this.db
      .prepare('INSERT INTO pending_pushes (user_id, product_id, reason, title, body, price, send_after) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(p.userId, p.productId, p.reason, p.title, p.body, p.price, p.sendAfter.getTime());
  }

  hasQueuedPush(userId: string, productId: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM pending_pushes WHERE user_id = ? AND product_id = ?').get(userId, productId);
  }

  /** Retira da fila as notificações cujo atraso já passou. */
  takeDuePushes(now: Date): Array<{ userId: string; productId: string; reason: string; title: string; body: string; price: number }> {
    const rows = this.db.prepare('SELECT * FROM pending_pushes WHERE send_after <= ?').all(now.getTime()) as Row[];
    this.db.prepare('DELETE FROM pending_pushes WHERE send_after <= ?').run(now.getTime());
    return rows.map((r) => ({ userId: String(r.user_id), productId: String(r.product_id), reason: String(r.reason), title: String(r.title), body: String(r.body), price: n(r.price) }));
  }

  pushToken(userId: string): string | undefined {
    const r = this.db.prepare('SELECT push_token FROM users WHERE id = ?').get(userId) as Row | undefined;
    return r?.push_token == null ? undefined : String(r.push_token);
  }
}

export interface PixCharge {
  id: string;
  userId: string;
  period: 'monthly' | 'yearly';
  amount: number;
  provider: string;
  providerId: string;
  qrCode: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  paidAt?: Date;
}

function toCharge(r: Row): PixCharge {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    period: r.period as PixCharge['period'],
    amount: n(r.amount),
    provider: String(r.provider),
    providerId: String(r.provider_id),
    qrCode: String(r.qr_code),
    status: String(r.status),
    expiresAt: new Date(n(r.expires_at)),
    createdAt: new Date(n(r.created_at)),
    paidAt: r.paid_at == null ? undefined : new Date(n(r.paid_at)),
  };
}

const OFFER_SELECT = `SELECT o.*, p.store, p.external_id, p.title, p.category, p.url, p.image_url, p.seller
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
      seller: r.seller == null ? undefined : String(r.seller),
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
