import Fastify, { type FastifyRequest } from 'fastify';
import { CATEGORIES, HISTORY_WINDOW_DAYS } from '@keropromo/core';
import { z } from 'zod';
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

export function buildServer(repo: Repo, clock: () => Date = () => new Date()) {
  const app = Fastify({ logger: false });

  app.setErrorHandler((err: Error, _req, reply) => {
    if (err instanceof z.ZodError) return reply.status(400).send({ error: 'invalid_request', issues: err.issues });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    return reply.status(status).send({ error: status === 500 ? 'internal_error' : err.message });
  });

  /** Autenticação simples por segredo do aparelho (Authorization: Bearer <segredo>). */
  const userOf = (req: FastifyRequest): string => {
    const h = req.headers.authorization;
    const id = h?.startsWith('Bearer ') ? repo.userIdBySecret(h.slice(7)) : undefined;
    if (!id) throw Object.assign(new Error('unauthorized'), { statusCode: 401 });
    return id;
  };

  app.get('/health', async () => ({ ok: true }));

  // Cadastro anônimo do aparelho. O app guarda o segredo no armazenamento seguro.
  app.post('/v1/users', async (_req, reply) => {
    const u = repo.createUser(clock());
    return reply.status(201).send({ userId: u.id, secret: u.secret });
  });

  app.put('/v1/me', async (req) => {
    const userId = userOf(req);
    const body = z.object({ categories: z.array(category).optional(), pushToken: z.string().max(300).nullable().optional() }).parse(req.body);
    if (body.categories) repo.setCategories(userId, body.categories);
    if (body.pushToken !== undefined) repo.setPushToken(userId, body.pushToken);
    return { categories: repo.categories(userId) };
  });

  app.get('/v1/me', async (req) => {
    const userId = userOf(req);
    return { userId, categories: repo.categories(userId) };
  });

  app.get('/v1/offers/hot', async () => ({ offers: hotOffers(repo, clock()) }));

  app.get('/v1/feed', async (req) => {
    const userId = userOf(req);
    const q = z.object({ category: category.optional() }).parse(req.query);
    return { offers: personalFeed(repo, userId, clock(), { category: q.category }) };
  });

  app.get('/v1/search', async (req) => {
    const userId = userOf(req);
    const { q } = z.object({ q: z.string().trim().min(1).max(80) }).parse(req.query);
    const now = clock();
    const offers = search(repo, q, now);
    // A busca é um sinal de interesse: guarda o termo e a categoria do melhor resultado.
    repo.addEvent(userId, { kind: 'search', query: q, category: offers[0]?.category, at: now });
    return { offers };
  });

  app.get('/v1/offers/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const offer = repo.getOffer(id);
    if (!offer) return reply.status(404).send({ error: 'not_found' });
    const since = new Date(clock().getTime() - HISTORY_WINDOW_DAYS * DAY_MS);
    return { offer: toDTO(offer), history: repo.dailyLows(id, since) };
  });

  app.post('/v1/events', async (req, reply) => {
    const userId = userOf(req);
    const body = z.object({ kind: z.enum(['view', 'click_out', 'save', 'dismiss']), productId: z.string().min(1) }).parse(req.body);
    const offer = repo.getOffer(body.productId);
    if (!offer) return reply.status(404).send({ error: 'not_found' });
    repo.addEvent(userId, { kind: body.kind, productId: body.productId, category: offer.product.category, at: clock() });
    return reply.status(204).send();
  });

  app.get('/v1/alerts', async (req) => ({ alerts: repo.alerts(userOf(req)).map(publicAlert) }));

  app.post('/v1/alerts', async (req, reply) => {
    const userId = userOf(req);
    const body = alertBody.parse(req.body);
    if (body.maxPrice === undefined && body.minTier === 'none') {
      return reply.status(400).send({ error: 'Defina um preço máximo ou um desconto mínimo.' });
    }
    if (repo.alerts(userId).length >= 30) return reply.status(400).send({ error: 'Limite de 30 alertas.' });
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
