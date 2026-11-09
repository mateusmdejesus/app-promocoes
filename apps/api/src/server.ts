import { randomInt, randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import Fastify, { type FastifyRequest } from 'fastify';
import { CATEGORIES, LIMITS, planFor, PRICES, type Plan } from '@keropromo/core';
import { z } from 'zod';
import { normalizeEmail, type AppleVerifier, type EmailSender } from './auth';
import type { DevPix, PixProvider } from './billing';
import { hotOffers, personalFeed, search, toDTO } from './feed';
import type { Repo } from './repo';

const DAY_MS = 86_400_000;
const category = z.enum(CATEGORIES);
const store = z.enum(['mercadolivre', 'amazon', 'magalu', 'aliexpress', 'kabum', 'demo']);
const tier = z.enum(['none', 'promo', 'hot']);

const alertBody = z.object({
  term: z.string().trim().min(2).max(80),
  maxPrice: z.number().int().positive().optional(),
  minTier: tier.default('none'),
  stores: z.array(store).default([]),
  enabled: z.boolean().default(true),
});

export interface ServerDeps {
  clock?: () => Date;
  email: EmailSender;
  /** Sem ele, "Entrar com Apple" responde 503 (falta configurar APPLE_BUNDLE_ID). */
  apple?: AppleVerifier;
  /** Valor esperado no cabeçalho Authorization do webhook do RevenueCat. */
  revenuecatAuth?: string;
  /** Libera /v1/dev/grant-pro para testar o Pro antes de existir loja. Nunca em produção. */
  allowDevPurchases?: boolean;
  /** Pix (Mercado Pago, ou o modo de teste). */
  pix?: PixProvider;
  /** Endereço público da API, para o Mercado Pago avisar pagamentos. */
  publicUrl?: string;
  /** Sites que podem chamar a API pelo navegador (ex.: https://keropromo.com.br). */
  webOrigins?: string[];
}

const PLAN_DAYS = { monthly: 30, yearly: 365 } as const;
const PIX_TTL_MIN = 30;

/** Eventos do RevenueCat que estendem o acesso até `expiration_at_ms`. */
const GRANTING_EVENTS = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'SUBSCRIPTION_EXTENDED', 'TEMPORARY_ENTITLEMENT_GRANT']);

export function buildServer(repo: Repo, deps: ServerDeps) {
  const clock = deps.clock ?? (() => new Date());
  const app = Fastify({ logger: false });
  if (deps.webOrigins?.length) app.register(cors, { origin: deps.webOrigins, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });

  app.setErrorHandler((err: Error, _req, reply) => {
    if (err instanceof z.ZodError) return reply.status(400).send({ error: 'invalid_request', issues: err.issues });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    return reply.status(status).send({ error: status === 500 ? 'internal_error' : err.message });
  });

  const fail = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });
  const bearer = (req: FastifyRequest) => {
    const h = req.headers.authorization;
    return h?.startsWith('Bearer ') ? h.slice(7) : undefined;
  };
  const optionalUser = (req: FastifyRequest): string | undefined => {
    const t = bearer(req);
    return t ? repo.userIdBySecret(t) : undefined;
  };
  const userOf = (req: FastifyRequest): string => {
    const id = optionalUser(req);
    if (!id) throw fail(401, 'unauthorized');
    return id;
  };
  const planOf = (userId: string | undefined): Plan => (userId ? planFor(repo.account(userId)?.proUntil, clock()) : 'free');

  /**
   * Depois de provar a identidade (e-mail ou Apple): se já existe conta com ela, entra nela;
   * se quem chama tem uma conta anônima, a identidade passa a ser dela (mantém interesses e alertas);
   * senão, cria uma conta nova.
   */
  const signIn = (req: FastifyRequest, found: string | undefined, attach: (userId: string) => void, create: () => string) => {
    const now = clock();
    const caller = optionalUser(req);
    let userId = found;
    let isNew = false;
    if (!userId && caller && repo.isAnonymous(caller)) {
      attach(caller);
      userId = caller;
    }
    if (!userId) {
      userId = create();
      isNew = true;
    }
    if (caller && caller !== userId && repo.categories(userId).length === 0) repo.setCategories(userId, repo.categories(caller));
    return { userId, token: repo.createSession(userId, now), isNew };
  };

  app.get('/health', async () => ({ ok: true }));

  // ---------- conta ----------

  // Conta anônima do aparelho, usada até a pessoa se identificar no onboarding.
  app.post('/v1/users', async (_req, reply) => {
    const u = repo.createUser(clock());
    return reply.status(201).send({ userId: u.id, secret: u.secret });
  });

  app.post('/v1/auth/email/start', async (req, reply) => {
    const email = normalizeEmail(z.object({ email: z.string().trim().email().max(200) }).parse(req.body).email);
    const now = clock();
    const last = repo.lastEmailCodeAt(email);
    if (last && now.getTime() - last.getTime() < 30_000) return reply.status(429).send({ error: 'Espere alguns segundos para pedir outro código.' });
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    repo.saveEmailCode(email, code, now);
    await deps.email.sendCode(email, code);
    return reply.status(204).send();
  });

  app.post('/v1/auth/email/verify', async (req) => {
    const body = z.object({ email: z.string().trim().email().max(200), code: z.string().trim().regex(/^\d{6}$/) }).parse(req.body);
    const email = normalizeEmail(body.email);
    const check = repo.checkEmailCode(email, body.code, clock());
    if (check === 'wrong') throw fail(400, 'Código incorreto.');
    if (check === 'expired') throw fail(400, 'Código expirado. Peça um novo.');
    return signIn(
      req,
      repo.userByEmail(email),
      (id) => repo.setEmail(id, email),
      () => repo.createIdentifiedUser(clock(), { email }),
    );
  });

  app.post('/v1/auth/apple', async (req) => {
    if (!deps.apple) throw fail(503, 'Entrar com Apple ainda não está configurado.');
    const { identityToken } = z.object({ identityToken: z.string().min(10) }).parse(req.body);
    const id = await deps.apple.verify(identityToken).catch(() => {
      throw fail(401, 'Não foi possível confirmar sua conta Apple.');
    });
    const byEmail = id.email ? repo.userByEmail(id.email) : undefined;
    // Mesma pessoa que já tinha entrado por e-mail: a Apple passa a valer para essa conta.
    if (!repo.userByApple(id.sub) && byEmail && !repo.account(byEmail)?.hasApple) repo.setAppleSub(byEmail, id.sub);
    return signIn(
      req,
      repo.userByApple(id.sub) ?? byEmail,
      (uid) => {
        repo.setAppleSub(uid, id.sub);
        if (id.email && !byEmail) repo.setEmail(uid, id.email);
      },
      () => repo.createIdentifiedUser(clock(), { appleSub: id.sub, email: id.email && !byEmail ? id.email : undefined }),
    );
  });

  app.post('/v1/auth/logout', async (req, reply) => {
    const t = bearer(req);
    if (t) repo.deleteSession(t);
    return reply.status(204).send();
  });

  app.get('/v1/me', async (req) => {
    const userId = userOf(req);
    const acc = repo.account(userId)!;
    const plan = planOf(userId);
    return {
      userId,
      email: acc.email ?? null,
      hasApple: acc.hasApple,
      identified: !!acc.email || acc.hasApple,
      plan,
      proUntil: plan === 'pro' ? acc.proUntil!.toISOString() : null,
      limits: { ...LIMITS[plan], checksPerMonth: Number.isFinite(LIMITS[plan].checksPerMonth) ? LIMITS[plan].checksPerMonth : null },
      categories: repo.categories(userId),
    };
  });

  app.put('/v1/me', async (req) => {
    const userId = userOf(req);
    const body = z.object({ categories: z.array(category).optional(), pushToken: z.string().max(300).nullable().optional() }).parse(req.body);
    if (body.categories) repo.setCategories(userId, body.categories);
    if (body.pushToken !== undefined) repo.setPushToken(userId, body.pushToken);
    return { categories: repo.categories(userId) };
  });

  // Exclusão de conta dentro do app: a Apple exige.
  app.delete('/v1/me', async (req, reply) => {
    repo.deleteUser(userOf(req));
    return reply.status(204).send();
  });

  // ---------- assinatura ----------

  app.get('/v1/plans', async () => ({
    plans: [
      { id: 'yearly', price: PRICES.yearly, perMonth: Math.round(PRICES.yearly / 12) },
      { id: 'monthly', price: PRICES.monthly, perMonth: PRICES.monthly },
    ],
  }));

  // O RevenueCat chama isto a cada compra, renovação ou expiração (app_user_id = nosso userId).
  app.post('/v1/webhooks/revenuecat', async (req, reply) => {
    if (!deps.revenuecatAuth || req.headers.authorization !== deps.revenuecatAuth) return reply.status(401).send({ error: 'unauthorized' });
    const { event } = z
      .object({ event: z.object({ type: z.string(), app_user_id: z.string(), expiration_at_ms: z.number().nullable().optional() }).passthrough() })
      .parse(req.body);
    if (GRANTING_EVENTS.has(event.type) && event.expiration_at_ms) repo.setProUntil(event.app_user_id, new Date(event.expiration_at_ms));
    else if (event.type === 'EXPIRATION') repo.setProUntil(event.app_user_id, null);
    // CANCELLATION não tira o acesso: a pessoa usa até o fim do período pago.
    return reply.status(200).send({ ok: true });
  });

  app.post('/v1/dev/grant-pro', async (req, reply) => {
    if (!deps.allowDevPurchases) return reply.status(404).send({ error: 'not_found' });
    const userId = userOf(req);
    const { period } = z.object({ period: z.enum(['monthly', 'yearly']) }).parse(req.body);
    repo.setProUntil(userId, new Date(clock().getTime() + (period === 'yearly' ? 365 : 30) * DAY_MS));
    return { plan: 'pro' };
  });

  // ---------- Pix (site) ----------

  const chargeDTO = (c: { id: string; period: string; amount: number; qrCode: string; status: string; expiresAt: Date }, now: Date) => ({
    id: c.id,
    period: c.period,
    amount: c.amount,
    qrCode: c.qrCode,
    status: c.status === 'pending' && c.expiresAt.getTime() < now.getTime() ? 'expired' : c.status,
    expiresAt: c.expiresAt.toISOString(),
    test: deps.pix?.name === 'dev',
  });

  /** Consulta o provedor e libera o Pro se o Pix foi pago. Usado pelo webhook e pela consulta do site. */
  const syncCharge = async (id: string) => {
    const c = repo.pixCharge(id);
    if (!c || !deps.pix || c.status === 'approved') return c;
    const status = await deps.pix.getStatus(c.providerId);
    if (status === 'approved') repo.markPixPaid(c.id, clock(), PLAN_DAYS[c.period]);
    else if (status !== 'pending') repo.setPixStatus(c.id, status);
    return repo.pixCharge(id);
  };

  app.post('/v1/billing/pix', async (req, reply) => {
    if (!deps.pix) throw fail(503, 'Pagamento por Pix ainda não está configurado.');
    const userId = userOf(req);
    const acc = repo.account(userId)!;
    if (!acc.email && !acc.hasApple) throw fail(400, 'Crie sua conta antes de assinar.');
    const { period } = z.object({ period: z.enum(['monthly', 'yearly']) }).parse(req.body);
    const now = clock();
    const id = randomUUID();
    const expiresAt = new Date(now.getTime() + PIX_TTL_MIN * 60_000);
    const created = await deps.pix
      .createPix({
        amountCents: PRICES[period],
        description: period === 'yearly' ? 'keropromo Pro anual' : 'keropromo Pro mensal',
        payerEmail: acc.email ?? `${userId}@usuarios.keropromo.com.br`,
        externalRef: id,
        expiresAt,
        notificationUrl: deps.publicUrl ? `${deps.publicUrl}/v1/webhooks/mercadopago` : undefined,
      })
      .catch((e: Error) => {
        throw fail(502, e.message);
      });
    const charge = { id, userId, period, amount: PRICES[period], provider: deps.pix.name, providerId: created.providerId, qrCode: created.qrCode, status: 'pending', expiresAt, createdAt: now };
    repo.savePixCharge(charge);
    return reply.status(201).send({ charge: chargeDTO(charge, now) });
  });

  app.get('/v1/billing/pix/:id', async (req, reply) => {
    const userId = userOf(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const c = repo.pixCharge(id);
    if (!c || c.userId !== userId) return reply.status(404).send({ error: 'not_found' });
    const fresh = await syncCharge(id).catch(() => c);
    return { charge: chargeDTO(fresh ?? c, clock()), plan: planOf(userId) };
  });

  // O Mercado Pago avisa aqui; a gente confirma consultando o pagamento direto na API dele.
  app.post('/v1/webhooks/mercadopago', async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const body = (req.body ?? {}) as { type?: string; data?: { id?: string | number } };
    const providerId = String(body.data?.id ?? q['data.id'] ?? q.id ?? '');
    const c = providerId ? repo.pixChargeByProviderId(providerId) : undefined;
    if (c) await syncCharge(c.id).catch(() => undefined);
    return reply.status(200).send({ ok: true });
  });

  // Modo de teste: "paga" um Pix de teste.
  app.post('/v1/dev/pix/:id/pay', async (req, reply) => {
    if (!deps.allowDevPurchases || deps.pix?.name !== 'dev') return reply.status(404).send({ error: 'not_found' });
    const userId = userOf(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const c = repo.pixCharge(id);
    if (!c || c.userId !== userId) return reply.status(404).send({ error: 'not_found' });
    (deps.pix as DevPix).paid.add(c.providerId);
    await syncCharge(id);
    return { plan: planOf(userId) };
  });

  // ---------- ofertas ----------

  app.get('/v1/offers/hot', async (req) => ({ offers: hotOffers(repo, planOf(optionalUser(req)), clock()) }));

  app.get('/v1/feed', async (req) => {
    const userId = userOf(req);
    const q = z.object({ category: category.optional() }).parse(req.query);
    return { offers: personalFeed(repo, userId, planOf(userId), clock(), { category: q.category }) };
  });

  app.get('/v1/search', async (req) => {
    const userId = userOf(req);
    const { q } = z.object({ q: z.string().trim().min(1).max(80) }).parse(req.query);
    const now = clock();
    const offers = search(repo, q, planOf(userId), now);
    // A busca é um sinal de interesse: guarda o termo e a categoria do melhor resultado.
    repo.addEvent(userId, { kind: 'search', query: q, category: offers[0]?.category, at: now });
    return { offers };
  });

  app.get('/v1/offers/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const offer = repo.getOffer(id);
    if (!offer) return reply.status(404).send({ error: 'not_found' });
    const plan = planOf(optionalUser(req));
    const now = clock();
    const dto = toDTO(offer, plan, now);
    const days = LIMITS[plan].historyDays;
    return {
      offer: dto,
      historyDays: days,
      history: dto.locked ? [] : repo.dailyLows(id, new Date(now.getTime() - days * DAY_MS)),
    };
  });

  app.post('/v1/events', async (req, reply) => {
    const userId = userOf(req);
    const body = z.object({ kind: z.enum(['view', 'click_out', 'save', 'dismiss']), productId: z.string().min(1) }).parse(req.body);
    const offer = repo.getOffer(body.productId);
    if (!offer) return reply.status(404).send({ error: 'not_found' });
    repo.addEvent(userId, { kind: body.kind, productId: body.productId, category: offer.product.category, at: clock() });
    return reply.status(204).send();
  });

  // ---------- alertas ----------

  app.get('/v1/alerts', async (req) => ({ alerts: repo.alerts(userOf(req)).map(publicAlert) }));

  app.post('/v1/alerts', async (req, reply) => {
    const userId = userOf(req);
    const body = alertBody.parse(req.body);
    if (body.maxPrice === undefined && body.minTier === 'none') {
      return reply.status(400).send({ error: 'Defina um preço máximo ou um desconto mínimo.' });
    }
    const plan = planOf(userId);
    if (repo.alerts(userId).length >= LIMITS[plan].alerts) {
      return reply.status(402).send({ error: plan === 'free' ? 'O plano grátis tem 1 alerta. Com o Pro, são ilimitados.' : 'Limite de alertas atingido.', upgrade: plan === 'free' });
    }
    return reply.status(201).send({ alert: publicAlert(repo.createAlert(userId, body, clock())) });
  });

  app.patch('/v1/alerts/:id', async (req, reply) => {
    const userId = userOf(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const patch = alertBody.partial().parse(req.body);
    const a = repo.updateAlert(userId, id, patch);
    return a ? { alert: publicAlert(a) } : reply.status(404).send({ error: 'not_found' });
  });

  app.delete('/v1/alerts/:id', async (req, reply) => {
    const userId = userOf(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    return repo.deleteAlert(userId, id) ? reply.status(204).send() : reply.status(404).send({ error: 'not_found' });
  });

  return app;
}

function publicAlert(a: { id: string; term: string; maxPrice?: number; minTier: string; stores: string[]; enabled: boolean }) {
  return { id: a.id, term: a.term, maxPrice: a.maxPrice ?? null, minTier: a.minTier, stores: a.stores, enabled: a.enabled };
}
