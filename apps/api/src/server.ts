import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import cors from '@fastify/cors';
import Fastify, { type FastifyRequest } from 'fastify';
import { CATEGORIES, LIMITS, lockedUntil, planFor, PRICES, storeLabel, type Plan } from '@keropromo/core';
import { z } from 'zod';
import { normalizeEmail, type AppleVerifier, type EmailSender } from './auth';
import type { DevPix, PixProvider } from './billing';
import { browse, hotOffers, personalFeed, search, searchProducts, toDTO, type OfferDTO } from './feed';
import { MAX_WATCHES, targetLimit, watchList } from './watches';
import type { InstagramClient } from './instagram';
import { classifyByRules, priorityFor, templateReplies, type CommentAi } from './commentAi';
import { COMMENT_LABELS, COMMENT_STATUSES, POST_FORMATS, POST_SLOTS, POST_STATUSES, type CommentState, type Repo } from './repo';

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
  /** Estúdio: e-mails de administrador e chave do agente (cabeçalho x-admin-key). */
  adminEmails?: string[];
  adminApiKey?: string;
  /** Site, para links de produto no Estúdio. */
  siteUrl?: string;
  /** Instagram da conta de Criador, para o Estúdio. */
  instagram?: InstagramClient;
  /** Claude para os comentários. Sem ele, regras simples e respostas prontas. */
  commentAi?: CommentAi;
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

  // `categories` (separadas por vírgula) filtra, ex.: a aba "Casa e eletro" do site; `limit` até 60.
  const listQuery = z.object({
    limit: z.coerce.number().int().min(1).max(60).optional(),
    categories: z
      .string()
      .optional()
      .transform((v) => (v ? v.split(',').filter(Boolean) : undefined))
      .pipe(z.array(category).optional()),
  });

  app.get('/v1/offers/hot', async (req) => {
    const q = listQuery.parse(req.query);
    return { offers: hotOffers(repo, planOf(optionalUser(req)), clock(), q.limit ?? 10, q.categories) };
  });

  app.get('/v1/feed', async (req) => {
    const userId = userOf(req);
    const q = z.object({ category: category.optional() }).and(listQuery).parse(req.query);
    return { offers: personalFeed(repo, userId, planOf(userId), clock(), { category: q.category, categories: q.categories, limit: q.limit }) };
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

  // Produto com promoção (oferta) ou sem (produto vigiado que ainda não está em promoção).
  app.get('/v1/offers/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const userId = optionalUser(req);
    const plan = planOf(userId);
    const now = clock();
    const offer = repo.getOffer(id);
    let dto: OfferDTO;
    if (offer && offer.analysis.tier !== 'none') {
      dto = toDTO(offer, plan, now);
    } else {
      const product = repo.productById(id);
      const last = product ? repo.lastPricePoint(id) : undefined;
      if (!product || !last) return reply.status(404).send({ error: 'not_found' });
      dto = {
        id: product.id,
        title: product.title,
        category: product.category,
        store: product.store,
        storeName: storeLabel(product),
        url: product.url,
        imageUrl: product.imageUrl ?? null,
        price: last.price,
        referencePrice: null,
        locked: false,
        unlocksAt: null,
        discountPct: 0,
        tier: 'none',
        verified: false,
        lowestIn90d: false,
        detectedAt: last.at.toISOString(),
      };
    }
    const days = LIMITS[plan].historyDays;
    const watch = userId ? repo.isWatching(userId, id) : undefined;
    return {
      offer: dto,
      historyDays: days,
      history: dto.locked ? [] : repo.dailyLows(id, new Date(now.getTime() - days * DAY_MS)),
      watching: watch ? { targetPrice: watch.targetPrice ?? null } : null,
    };
  });

  // ---------- Estúdio (só administradores) ----------

  const sameKey = (a: string, b: string) => {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  };
  /** Administrador = e-mail em ADMIN_EMAILS logado, ou o agente com x-admin-key. */
  const requireAdmin = (req: FastifyRequest) => {
    const key = req.headers['x-admin-key'];
    if (deps.adminApiKey && typeof key === 'string' && sameKey(key, deps.adminApiKey)) return;
    const userId = optionalUser(req);
    const email = userId ? repo.account(userId)?.email?.toLowerCase() : undefined;
    if (!email || !(deps.adminEmails ?? []).includes(email)) throw fail(404, 'not_found');
  };
  const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

  app.get('/v1/admin/me', async (req) => {
    requireAdmin(req);
    return { admin: true };
  });

  app.get('/v1/admin/posts', async (req) => {
    requireAdmin(req);
    const q = z.object({ from: day, to: day }).parse(req.query);
    return { posts: repo.posts(q.from, q.to) };
  });

  const postBody = z.object({
    format: z.enum(POST_FORMATS).optional(),
    theme: z.string().max(200).nullable().optional(),
    title: z.string().min(1).max(200).optional(),
    hook: z.string().max(600).nullable().optional(),
    script: z.string().max(8000).nullable().optional(),
    caption: z.string().max(3000).nullable().optional(),
    hashtags: z.string().max(600).nullable().optional(),
    filming: z.string().max(3000).nullable().optional(),
    productId: z.string().max(200).nullable().optional(),
    status: z.enum(POST_STATUSES).optional(),
    notes: z.string().max(3000).nullable().optional(),
  });

  /** Cria ou atualiza o post de um dia e horário (o agente usa a mesma rota). */
  app.put('/v1/admin/posts/:date/:slot', async (req) => {
    requireAdmin(req);
    const { date, slot } = z.object({ date: day, slot: z.enum(POST_SLOTS) }).parse(req.params);
    const body = postBody.parse(req.body ?? {});
    const id = `${date}/${slot}`;
    const cur = repo.post(id);
    if (!cur && (!body.title || !body.format)) throw fail(400, 'Post novo precisa de title e format.');
    const pick = <K extends keyof typeof body>(k: K, fallback: unknown) => (body[k] === undefined ? fallback : body[k]);
    return {
      post: repo.upsertPost(
        {
          id,
          date,
          slot,
          format: pick('format', cur?.format) as (typeof POST_FORMATS)[number],
          theme: pick('theme', cur?.theme ?? null) as string | null,
          title: pick('title', cur?.title) as string,
          hook: pick('hook', cur?.hook ?? null) as string | null,
          script: pick('script', cur?.script ?? null) as string | null,
          caption: pick('caption', cur?.caption ?? null) as string | null,
          hashtags: pick('hashtags', cur?.hashtags ?? null) as string | null,
          filming: pick('filming', cur?.filming ?? null) as string | null,
          productId: pick('productId', cur?.productId ?? null) as string | null,
          status: pick('status', cur?.status ?? 'ideia') as (typeof POST_STATUSES)[number],
          notes: pick('notes', cur?.notes ?? null) as string | null,
        },
        clock(),
      ),
    };
  });

  app.delete('/v1/admin/posts/:date/:slot', async (req, reply) => {
    requireAdmin(req);
    const { date, slot } = z.object({ date: day, slot: z.enum(POST_SLOTS) }).parse(req.params);
    repo.deletePost(`${date}/${slot}`);
    return reply.status(204).send();
  });

  /** Achados para os vídeos: maiores descontos agora, sem repetir produto das últimas 2 semanas. */
  app.get('/v1/admin/deals', async (req) => {
    requireAdmin(req);
    const q = z.object({ limit: z.coerce.number().int().min(1).max(50).optional(), categories: z.string().optional() }).parse(req.query);
    const now = clock();
    const since = new Date(now.getTime() - 14 * DAY_MS).toISOString().slice(0, 10);
    const used = repo.featuredProductsSince(since);
    const cats = q.categories?.split(',').filter(Boolean);
    const site = deps.siteUrl ?? 'https://keropromo.com.br';
    const deals = repo
      .activeOffers()
      .filter((o) => !used.has(o.product.id) && (!cats || cats.includes(o.product.category)))
      .sort((a, b) => b.analysis.discountPct - a.analysis.discountPct || b.detectedAt.getTime() - a.detectedAt.getTime())
      .slice(0, q.limit ?? 12)
      .map((o) => {
        const lows = repo.dailyLows(o.product.id, new Date(now.getTime() - 90 * DAY_MS));
        return {
          ...toDTO(o, 'pro', now),
          pageUrl: `${site}/oferta/${encodeURIComponent(o.product.id)}`,
          lowest90: lows.length ? Math.min(...lows.map((l) => l.price)) : null,
          historyDays: lows.length,
        };
      });
    return { deals };
  });

  // ---------- Estúdio: Instagram ----------

  const ig = () => {
    if (!deps.instagram) throw fail(503, 'Instagram não conectado: falta IG_ACCESS_TOKEN e IG_USER_ID no servidor.');
    return deps.instagram;
  };
  const igFail = (e: unknown) => fail(502, (e as Error).message);

  /** Conta + últimos posts com curtidas, comentários e números (se a Meta liberar). */
  app.get('/v1/admin/instagram', async (req) => {
    requireAdmin(req);
    const { fresh, limit } = z.object({ fresh: z.coerce.boolean().optional(), limit: z.coerce.number().int().min(1).max(50).optional() }).parse(req.query);
    const client = ig();
    const [account, media] = await Promise.all([client.account(fresh), client.media(limit ?? 24, fresh)]).catch((e) => {
      throw igFail(e);
    });
    const sum = (f: (m: (typeof media)[number]) => number | undefined) => media.reduce((t, m) => t + (f(m) ?? 0), 0);
    return {
      account,
      media,
      insightsAvailable: client.insightsAllowed === true,
      totals: {
        posts: media.length,
        likes: sum((m) => m.likes),
        comments: sum((m) => m.comments),
        views: client.insightsAllowed ? sum((m) => m.insights?.views) : null,
        reach: client.insightsAllowed ? sum((m) => m.insights?.reach) : null,
        saved: client.insightsAllowed ? sum((m) => m.insights?.saved) : null,
        shares: client.insightsAllowed ? sum((m) => m.insights?.shares) : null,
      },
    };
  });

  app.get('/v1/admin/instagram/media/:id/comments', async (req) => {
    requireAdmin(req);
    const { id } = z.object({ id: z.string().regex(/^\d+$/) }).parse(req.params);
    const { fresh } = z.object({ fresh: z.coerce.boolean().optional() }).parse(req.query);
    return { comments: await ig().comments(id, fresh).catch((e) => Promise.reject(igFail(e))) };
  });

  const commentId = z.object({ id: z.string().regex(/^\d+$/) });

  app.post('/v1/admin/instagram/comments/:id/reply', async (req) => {
    requireAdmin(req);
    const { id } = commentId.parse(req.params);
    const { message } = z.object({ message: z.string().trim().min(1).max(2200) }).parse(req.body);
    const r = await ig().reply(id, message).catch((e) => Promise.reject(igFail(e)));
    repo.setCommentState(id, { status: 'respondido' }, clock());
    return r;
  });

  /**
   * Caixa de entrada: comentários dos posts recentes, cada um com tipo (reclamação, pergunta,
   * lead, elogio, spam), prioridade e situação (a revisar, respondido, ignorado).
   * Comentário novo é classificado uma vez só e fica guardado.
   */
  app.get('/v1/admin/instagram/inbox', async (req) => {
    requireAdmin(req);
    const { fresh } = z.object({ fresh: z.coerce.boolean().optional() }).parse(req.query);
    const client = ig();
    const [account, media] = await Promise.all([client.account(fresh), client.media(24, fresh)]).catch((e) => {
      throw igFail(e);
    });
    const posts = media.filter((m) => m.comments > 0).slice(0, 12);
    const lists = await Promise.all(posts.map((m) => client.comments(m.id, fresh).catch(() => [])));
    const me = account.username.toLowerCase();
    const all = posts.flatMap((m, i) => lists[i]!.filter((c) => c.username.toLowerCase() !== me).map((c) => ({ ...c, mediaId: m.id })));
    const states = repo.commentStates(all.map((c) => c.id));
    const now = clock();
    const answeredByMe = (c: (typeof all)[number]) => c.replies.some((r) => r.username.toLowerCase() === me);

    // Sem tipo ainda, ou (com IA ligada) marcado só pelas regras e nunca corrigido à mão.
    const needsLabel = (st?: CommentState) => !st?.label || (!!deps.commentAi && !st.byAi && !st.manual);
    const missing = all.filter((c) => needsLabel(states.get(c.id)));
    let ai = new Map<string, { label: (typeof COMMENT_LABELS)[number]; priority: 'alta' | 'media' | 'baixa' }>();
    if (deps.commentAi && missing.length) {
      ai = await deps.commentAi.classify(missing.slice(0, 80)).catch((e) => {
        req.log.warn({ err: (e as Error).message }, 'IA dos comentários falhou; usando regras');
        return ai;
      });
    }
    for (const c of all) {
      const cur = states.get(c.id);
      const got = ai.get(c.id);
      if (!cur?.label || (got && needsLabel(cur))) {
        const cls = got ?? classifyByRules(c.text);
        states.set(c.id, repo.setCommentState(c.id, { mediaId: c.mediaId, ...cls, byAi: !!got, status: cur?.status ?? (answeredByMe(c) ? 'respondido' : 'novo') }, now));
      } else if (cur.status === 'novo' && answeredByMe(c)) {
        // Respondeu pelo app do Instagram: já conta como feito.
        states.set(c.id, repo.setCommentState(c.id, { status: 'respondido' }, now));
      }
    }

    const comments = all.map((c) => {
      const st = states.get(c.id)!;
      return { ...c, status: st.status, label: st.label ?? 'outro', priority: st.priority ?? 'baixa', byAi: st.byAi, answeredByMe: answeredByMe(c) };
    });
    return {
      account: { username: account.username, pictureUrl: account.pictureUrl },
      aiEnabled: !!deps.commentAi,
      posts: posts.map((m) => {
        const mine = comments.filter((c) => c.mediaId === m.id);
        const count = (l: string) => mine.filter((c) => c.label === l).length;
        return {
          id: m.id,
          caption: m.caption,
          permalink: m.permalink,
          thumbnailUrl: m.thumbnailUrl,
          timestamp: m.timestamp,
          likes: m.likes,
          comments: m.comments,
          novos: mine.filter((c) => c.status === 'novo').length,
          labels: Object.fromEntries(COMMENT_LABELS.map((l) => [l, count(l)])),
        };
      }),
      comments,
    };
  });

  /** Marca um ou vários comentários (situação e/ou tipo). */
  app.post('/v1/admin/instagram/comments/state', async (req) => {
    requireAdmin(req);
    const body = z
      .object({ ids: z.array(z.string().regex(/^\d+$/)).min(1).max(500), status: z.enum(COMMENT_STATUSES).optional(), label: z.enum(COMMENT_LABELS).optional() })
      .parse(req.body);
    const patch: Partial<CommentState> = { status: body.status };
    if (body.label) Object.assign(patch, { label: body.label, priority: priorityFor(body.label), byAi: false, manual: true });
    const now = clock();
    return { updated: body.ids.map((id) => repo.setCommentState(id, patch, now)) };
  });

  /** Esconde do post (ou mostra de novo). Esconder também tira da fila "a revisar". */
  app.post('/v1/admin/instagram/comments/:id/hide', async (req) => {
    requireAdmin(req);
    const { id } = commentId.parse(req.params);
    const { hide } = z.object({ hide: z.boolean() }).parse(req.body);
    await ig().hide(id, hide).catch((e) => Promise.reject(igFail(e)));
    return { state: repo.setCommentState(id, hide ? { status: 'ignorado' } : {}, clock()) };
  });

  /** 3 respostas sugeridas. Com IA, ficam guardadas (refresh=true pede outras). */
  app.post('/v1/admin/instagram/comments/:id/suggest', async (req) => {
    requireAdmin(req);
    const { id } = commentId.parse(req.params);
    const { mediaId, refresh } = z.object({ mediaId: z.string().regex(/^\d+$/), refresh: z.boolean().optional() }).parse(req.body);
    const client = ig();
    const [media, list] = await Promise.all([client.media(24), client.comments(mediaId)]).catch((e) => {
      throw igFail(e);
    });
    const c = list.find((x) => x.id === id);
    if (!c) throw fail(404, 'Comentário não encontrado nesse post.');
    const st = repo.commentStates([id]).get(id);
    const label = st?.label ?? classifyByRules(c.text).label;
    if (!deps.commentAi) return { suggestions: templateReplies({ username: c.username, label }), ai: false };
    if (st?.suggestions?.length && !refresh) return { suggestions: st.suggestions, ai: true };
    const caption = media.find((m) => m.id === mediaId)?.caption ?? '';
    const suggestions = await deps.commentAi
      .suggest({ id, username: c.username, text: c.text, label, caption, replies: c.replies.map((r) => `@${r.username}: ${r.text}`) })
      .catch((e) => {
        req.log.warn({ err: (e as Error).message }, 'IA das respostas falhou');
        return [] as string[];
      });
    if (!suggestions.length) return { suggestions: templateReplies({ username: c.username, label }), ai: false };
    repo.setCommentState(id, { mediaId, suggestions }, clock());
    return { suggestions, ai: true };
  });

  // ---------- vitrine com filtros ----------

  const csv = z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined));
  const cents = z.coerce.number().int().min(0).max(10_000_000).optional();

  app.get('/v1/browse', async (req) => {
    const userId = userOf(req);
    const q = z
      .object({
        q: z.string().trim().max(80).optional(),
        stores: csv,
        categories: csv.pipe(z.array(category).optional()),
        minPrice: cents,
        maxPrice: cents,
        minDiscount: z.coerce.number().int().min(0).max(100).optional(),
        sort: z.enum(['relevance', 'discount', 'price_asc', 'price_desc', 'newest']).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        offset: z.coerce.number().int().min(0).max(5000).optional(),
      })
      .parse(req.query);
    return browse(repo, userId, planOf(userId), clock(), q);
  });

  // ---------- produtos vigiados e meta de preço ----------

  /** Busca qualquer produto acompanhado (com ou sem promoção) para vigiar. */
  app.get('/v1/products/search', async (req) => {
    const userId = userOf(req);
    const { q } = z.object({ q: z.string().trim().min(2).max(80) }).parse(req.query);
    const plan = planOf(userId);
    const now = clock();
    return {
      products: searchProducts(repo, q).map((p) => {
        const o = repo.getOffer(p.id);
        const locked = !!(o && lockedUntil(plan, o.analysis.tier, o.detectedAt, now));
        return { ...p, price: locked ? null : p.price, locked, watching: !!repo.isWatching(userId, p.id) };
      }),
    };
  });

  app.get('/v1/watches', async (req) => {
    const userId = userOf(req);
    const plan = planOf(userId);
    return { watches: watchList(repo, userId, plan, clock()), limits: { targets: targetLimit(plan) } };
  });

  /** Salva o produto para vigiar; `targetPrice` (centavos) liga a meta de preço, `null` tira. */
  app.put('/v1/watches/:productId', async (req, reply) => {
    const userId = userOf(req);
    if (repo.isAnonymous(userId)) throw fail(403, 'Entre com seu e-mail para vigiar produtos.');
    const { productId } = z.object({ productId: z.string().min(1) }).parse(req.params);
    const body = z.object({ targetPrice: z.number().int().min(1).max(10_000_000).nullable().optional() }).parse(req.body ?? {});
    if (!repo.productById(productId)) return reply.status(404).send({ error: 'not_found' });
    const current = repo.isWatching(userId, productId);
    const counts = repo.watchCounts(userId);
    if (!current && counts.total >= MAX_WATCHES) throw fail(409, `Você já vigia ${MAX_WATCHES} produtos. Remova algum para salvar outro.`);
    const target = body.targetPrice === undefined ? (current?.targetPrice ?? null) : body.targetPrice;
    const plan = planOf(userId);
    if (target != null && current?.targetPrice == null && counts.withTarget >= targetLimit(plan)) {
      throw fail(402, plan === 'pro' ? `Você chegou ao limite de ${targetLimit(plan)} metas.` : 'No plano grátis dá para ter 1 meta de preço. Com o Pro, você cria quantas quiser.');
    }
    repo.saveWatch(userId, productId, target, clock());
    return reply.status(204).send();
  });

  app.delete('/v1/watches/:productId', async (req, reply) => {
    const userId = userOf(req);
    const { productId } = z.object({ productId: z.string().min(1) }).parse(req.params);
    repo.deleteWatch(userId, productId);
    return reply.status(204).send();
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
