import { beforeEach, describe, expect, it } from 'vitest';
import type { ListingSnapshot, StoreAdapter } from '../src/adapters/types';
import { DemoAdapter } from '../src/adapters/demo';
import { openDb } from '../src/db';
import { runMonitor } from '../src/monitor';
import { LogPushSender } from '../src/push';
import { Repo } from '../src/repo';
import { buildServer } from '../src/server';

const DAY = 86_400_000;
const T0 = new Date('2026-09-01T15:00:00Z').getTime();

/** Loja controlada pelo teste. */
class FakeStore implements StoreAdapter {
  store = 'mercadolivre' as const;
  items = new Map<string, ListingSnapshot>();
  set(id: string, title: string, category: ListingSnapshot['category'], price: number, listPrice?: number) {
    this.items.set(id, { externalId: id, title, category, price, listPrice, url: `https://loja/${id}` });
  }
  async fetchListings() {
    return [...this.items.values()];
  }
}

let repo: Repo;
let store: FakeStore;
let sender: LogPushSender;

/** 30 dias de preço estável, um ponto por dia. */
async function stableHistory() {
  for (let d = 0; d < 30; d++) await runMonitor(repo, [store], sender, new Date(T0 + d * DAY), { notify: false });
}

beforeEach(() => {
  repo = new Repo(openDb(':memory:'));
  store = new FakeStore();
  sender = new LogPushSender();
  store.set('af', 'Air Fryer 4L Digital', 'casa', 51900);
  store.set('fone', 'Fone Bluetooth Over-ear', 'eletronicos', 28900);
  store.set('tenis', 'Tênis de Corrida', 'esporte', 40000, 64000);
});

describe('monitor', () => {
  it('detecta queda real e ignora "de" inflado', async () => {
    await stableHistory();
    const now = new Date(T0 + 30 * DAY);
    store.set('af', 'Air Fryer 4L Digital', 'casa', 24900, 51900); // −52% real
    store.set('tenis', 'Tênis de Corrida', 'esporte', 36000, 64000); // loja diz −44%, real é −10%
    const r = await runMonitor(repo, [store], sender, now);

    expect(r.newDeals).toBe(1);
    const af = repo.getOffer('mercadolivre:af')!;
    expect(af.analysis).toMatchObject({ discountPct: 52, tier: 'hot', verified: true, lowestInWindow: true });
    const tenis = repo.getOffer('mercadolivre:tenis')!;
    expect(tenis.analysis.tier).toBe('none');
    expect(tenis.analysis.inflatedListPrice).toBe(true);
  });

  it('notifica por interesse e por alerta, sem repetir o mesmo produto', async () => {
    await stableHistory();
    const app = buildServer(repo, () => new Date(T0 + 30 * DAY));
    const a = (await app.inject({ method: 'POST', url: '/v1/users' })).json();
    const b = (await app.inject({ method: 'POST', url: '/v1/users' })).json();
    const c = (await app.inject({ method: 'POST', url: '/v1/users' })).json();
    const auth = (u: { secret: string }) => ({ authorization: `Bearer ${u.secret}` });

    await app.inject({ method: 'PUT', url: '/v1/me', headers: auth(a), payload: { categories: ['casa'], pushToken: 'tok-a' } });
    await app.inject({ method: 'PUT', url: '/v1/me', headers: auth(b), payload: { categories: ['games'], pushToken: 'tok-b' } });
    await app.inject({ method: 'PUT', url: '/v1/me', headers: auth(c), payload: { categories: ['games'], pushToken: 'tok-c' } });
    const created = await app.inject({ method: 'POST', url: '/v1/alerts', headers: auth(b), payload: { term: 'air fryer', maxPrice: 30000 } });
    expect(created.statusCode).toBe(201);

    const now = new Date(T0 + 30 * DAY);
    store.set('af', 'Air Fryer 4L Digital', 'casa', 24900);
    const r = await runMonitor(repo, [store], sender, now);

    expect(r.pushesSent).toBe(2);
    expect(sender.sent.map((m) => m.to).sort()).toEqual(['tok-a', 'tok-b']);
    expect(sender.sent.find((m) => m.to === 'tok-b')!.title).toBe('Seu alerta: air fryer');
    expect(sender.sent.find((m) => m.to === 'tok-a')!.body).toContain('De R$ 519 por R$ 249');

    // Cai mais um pouco 1 h depois: é novidade, mas o mesmo produto não repete em 7 dias.
    store.set('af', 'Air Fryer 4L Digital', 'casa', 23900);
    const r2 = await runMonitor(repo, [store], sender, new Date(now.getTime() + 3_600_000));
    expect(r2.newDeals).toBe(1);
    expect(r2.pushesSent).toBe(0);
  });

  it('uma loja com erro não derruba a varredura', async () => {
    const broken: StoreAdapter = { store: 'amazon', fetchListings: async () => { throw new Error('timeout'); } };
    const r = await runMonitor(repo, [broken, store], sender, new Date(T0));
    expect(r.errors).toEqual(['amazon: timeout']);
    expect(r.scanned).toBe(3);
  });
});

describe('API', () => {
  it('feed personalizado, ofertas quentes, detalhe e busca', async () => {
    await stableHistory();
    const now = new Date(T0 + 30 * DAY);
    store.set('af', 'Air Fryer 4L Digital', 'casa', 24900); // −52%
    store.set('fone', 'Fone Bluetooth Over-ear', 'eletronicos', 18900); // −34%
    await runMonitor(repo, [store], sender, now, { notify: false });
    const app = buildServer(repo, () => now);

    const u = (await app.inject({ method: 'POST', url: '/v1/users' })).json();
    const headers = { authorization: `Bearer ${u.secret}` };
    await app.inject({ method: 'PUT', url: '/v1/me', headers, payload: { categories: ['eletronicos'] } });

    const hot = (await app.inject({ method: 'GET', url: '/v1/offers/hot' })).json();
    expect(hot.offers.map((o: { id: string }) => o.id)).toEqual(['mercadolivre:af']);

    // Quem escolheu eletrônicos vê o fone (34%) antes da air fryer (52%).
    const feed = (await app.inject({ method: 'GET', url: '/v1/feed', headers })).json();
    expect(feed.offers.map((o: { id: string }) => o.id)).toEqual(['mercadolivre:fone', 'mercadolivre:af']);

    const detail = (await app.inject({ method: 'GET', url: '/v1/offers/mercadolivre:af' })).json();
    expect(detail.offer).toMatchObject({ price: 24900, referencePrice: 51900, tier: 'hot', storeName: 'Mercado Livre' });
    expect(detail.history.length).toBeGreaterThan(20);

    const found = (await app.inject({ method: 'GET', url: '/v1/search?q=air%20fr', headers })).json();
    expect(found.offers).toHaveLength(1);

    expect((await app.inject({ method: 'POST', url: '/v1/events', headers, payload: { kind: 'click_out', productId: 'mercadolivre:af' } })).statusCode).toBe(204);
  });

  it('exige autenticação e valida alertas', async () => {
    const app = buildServer(repo);
    expect((await app.inject({ method: 'GET', url: '/v1/feed' })).statusCode).toBe(401);
    const u = (await app.inject({ method: 'POST', url: '/v1/users' })).json();
    const headers = { authorization: `Bearer ${u.secret}` };
    const bad = await app.inject({ method: 'POST', url: '/v1/alerts', headers, payload: { term: 'air fryer' } });
    expect(bad.statusCode).toBe(400);
    const ok = (await app.inject({ method: 'POST', url: '/v1/alerts', headers, payload: { term: 'tenis', minTier: 'hot' } })).json();
    const off = (await app.inject({ method: 'PATCH', url: `/v1/alerts/${ok.alert.id}`, headers, payload: { enabled: false } })).json();
    expect(off.alert.enabled).toBe(false);
    expect((await app.inject({ method: 'DELETE', url: `/v1/alerts/${ok.alert.id}`, headers })).statusCode).toBe(204);
  });
});

describe('loja de exemplo', () => {
  it('com 60 dias de histórico gera ofertas verificadas e pega os "de" inflados', async () => {
    const demo = new DemoAdapter();
    for (let t = T0; t <= T0 + 60 * DAY; t += 6 * 3_600_000) await runMonitor(repo, [demo], sender, new Date(t), { notify: false });
    const offers = repo.activeOffers();
    expect(offers.every((o) => o.analysis.verified && o.analysis.discountPct >= 25)).toBe(true);
    // Produtos "mentirosos" anunciam −37% o tempo todo; sem queda real, não aparecem.
    const liar = repo.getOffer('demo:d04')!;
    expect(liar.analysis.inflatedListPrice).toBe(true);
  });
});
