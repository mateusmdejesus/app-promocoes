import { beforeEach, describe, expect, it } from 'vitest';
import type { ListingSnapshot, StoreAdapter } from '../src/adapters/types';
import { DemoAdapter } from '../src/adapters/demo';
import { openDb } from '../src/db';
import { runMonitor } from '../src/monitor';
import { LogPushSender } from '../src/push';
import { Repo } from '../src/repo';
import { buildServer } from '../src/server';
import { LogEmailSender, type AppleVerifier } from '../src/auth';
import { DevPix } from '../src/billing';

let email: LogEmailSender;
/** Apple de mentira: o "token" é o próprio sub; "bad" é rejeitado. */
const fakeApple: AppleVerifier = { verify: async (t) => { if (t.startsWith('bad')) throw new Error('x'); const [sub, mail] = t.split('|'); return { sub: sub!, email: mail }; } };
let pix: DevPix;
const serverAt = (now?: Date) => buildServer(repo, { clock: now ? () => now : undefined, email, apple: fakeApple, revenuecatAuth: 'rc-secret', allowDevPurchases: true, pix });

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
  email = new LogEmailSender();
  pix = new DevPix();
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

  it('Pro recebe oferta quente na hora; grátis recebe o alerta com 1 h de atraso', async () => {
    await stableHistory();
    const app = serverAt(new Date(T0 + 30 * DAY));
    const a = (await app.inject({ method: 'POST', url: '/v1/users' })).json();
    const b = (await app.inject({ method: 'POST', url: '/v1/users' })).json();
    const c = (await app.inject({ method: 'POST', url: '/v1/users' })).json();
    const auth = (u: { secret: string }) => ({ authorization: `Bearer ${u.secret}` });

    await app.inject({ method: 'PUT', url: '/v1/me', headers: auth(a), payload: { categories: ['casa'], pushToken: 'tok-a' } });
    await app.inject({ method: 'PUT', url: '/v1/me', headers: auth(b), payload: { categories: ['games'], pushToken: 'tok-b' } });
    await app.inject({ method: 'PUT', url: '/v1/me', headers: auth(c), payload: { categories: ['games'], pushToken: 'tok-c' } });
    const created = await app.inject({ method: 'POST', url: '/v1/alerts', headers: auth(b), payload: { term: 'air fryer', maxPrice: 30000 } });
    expect(created.statusCode).toBe(201);

    // A assina o Pro; B e C ficam no grátis.
    await app.inject({ method: 'POST', url: '/v1/dev/grant-pro', headers: auth(a), payload: { period: 'monthly' } });

    const now = new Date(T0 + 30 * DAY);
    store.set('af', 'Air Fryer 4L Digital', 'casa', 24900);
    const r = await runMonitor(repo, [store], sender, now);

    // Pro recebe a oferta quente na hora. O alerta de B (grátis) fica na fila por 1 h.
    expect(r.pushesSent).toBe(1);
    expect(sender.sent.map((m) => m.to)).toEqual(['tok-a']);
    expect(sender.sent[0]!.body).toContain('De R$ 519 por R$ 249');

    // 1 h depois, preço mantido: sai a notificação atrasada de B. A não recebe de novo.
    const r2 = await runMonitor(repo, [store], sender, new Date(now.getTime() + 61 * 60_000));
    expect(r2.pushesSent).toBe(1);
    expect(sender.sent.at(-1)).toMatchObject({ to: 'tok-b', title: 'Seu alerta: air fryer' });

    // Cai mais um pouco: é novidade, mas o mesmo produto não repete em 7 dias.
    store.set('af', 'Air Fryer 4L Digital', 'casa', 23900);
    const r3 = await runMonitor(repo, [store], sender, new Date(now.getTime() + 2 * 3_600_000));
    expect(r3.newDeals).toBe(1);
    expect(r3.pushesSent).toBe(0);
    expect(sender.sent).toHaveLength(2);
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
    const app = serverAt(now);

    const u = (await app.inject({ method: 'POST', url: '/v1/users' })).json();
    const headers = { authorization: `Bearer ${u.secret}` };
    await app.inject({ method: 'PUT', url: '/v1/me', headers, payload: { categories: ['eletronicos'] } });

    const hot = (await app.inject({ method: 'GET', url: '/v1/offers/hot' })).json();
    expect(hot.offers.map((o: { id: string }) => o.id)).toEqual(['mercadolivre:af']);

    // Quem escolheu eletrônicos vê o fone (34%) antes da air fryer (52%).
    const feed = (await app.inject({ method: 'GET', url: '/v1/feed', headers })).json();
    expect(feed.offers.map((o: { id: string }) => o.id)).toEqual(['mercadolivre:fone', 'mercadolivre:af']);

    // Grátis: a oferta quente acabou de aparecer, então chega travada (sem preço nem link).
    const locked = (await app.inject({ method: 'GET', url: '/v1/offers/mercadolivre:af', headers })).json();
    expect(locked.offer).toMatchObject({ locked: true, price: null, url: null, discountPct: 52 });
    expect(locked.history).toEqual([]);
    expect(feed.offers[0]).toMatchObject({ locked: false, price: 18900 });

    // Pro: tudo liberado, com 90 dias de histórico.
    await app.inject({ method: 'POST', url: '/v1/dev/grant-pro', headers, payload: { period: 'yearly' } });
    const detail = (await app.inject({ method: 'GET', url: '/v1/offers/mercadolivre:af', headers })).json();
    expect(detail.offer).toMatchObject({ locked: false, price: 24900, referencePrice: 51900, tier: 'hot', storeName: 'Mercado Livre' });
    expect(detail.historyDays).toBe(90);
    expect(detail.history.length).toBeGreaterThan(20);

    // 1 h depois, quem é grátis também vê, mas com só 7 dias de histórico.
    const later = (await serverAt(new Date(now.getTime() + 61 * 60_000)).inject({ method: 'GET', url: '/v1/offers/mercadolivre:af' })).json();
    expect(later.offer.locked).toBe(false);
    expect(later.historyDays).toBe(7);
    expect(later.history.length).toBeLessThanOrEqual(8);

    const found = (await app.inject({ method: 'GET', url: '/v1/search?q=air%20fr', headers })).json();
    expect(found.offers).toHaveLength(1);

    expect((await app.inject({ method: 'POST', url: '/v1/events', headers, payload: { kind: 'click_out', productId: 'mercadolivre:af' } })).statusCode).toBe(204);
  });

  it('exige autenticação e valida alertas', async () => {
    const app = serverAt();
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

describe('lojas', () => {
  it('ofertas de uma loja que saiu de STORES saem do ar', async () => {
    await stableHistory();
    store.set('af', 'Air Fryer 4L Digital', 'casa', 24900, 51900);
    await runMonitor(repo, [store], sender, new Date(T0 + 30 * DAY));
    expect(repo.getOffer('mercadolivre:af')).toBeTruthy();
    expect(repo.pruneOffersExcept(['mercadolivre'])).toBe(0);
    expect(repo.pruneOffersExcept(['amazon'])).toBeGreaterThan(0);
    expect(repo.getOffer('mercadolivre:af')).toBeFalsy();
  });
});

describe('vitrine', () => {
  it('quentes e feed filtram por categoria (aba "Casa e eletro") e aceitam limite', async () => {
    await stableHistory();
    const now = new Date(T0 + 30 * DAY);
    store.set('af', 'Air Fryer 4L Digital', 'casa', 24900, 51900);
    store.set('fone', 'Fone Bluetooth Over-ear', 'eletronicos', 14900, 28900);
    await runMonitor(repo, [store], sender, now);
    const app = serverAt(now);
    const hot = async (qs: string) => (await app.inject({ method: 'GET', url: `/v1/offers/hot${qs}` })).json().offers as Array<{ category: string }>;
    expect((await hot('')).length).toBe(2);
    expect((await hot('?categories=eletro,casa')).map((o) => o.category)).toEqual(['casa']);
    expect((await hot('?limit=1')).length).toBe(1);
    expect((await app.inject({ method: 'GET', url: '/v1/offers/hot?categories=nada' })).statusCode).toBe(400);
    const u = (await app.inject({ method: 'POST', url: '/v1/users' })).json();
    const feed = (await app.inject({ method: 'GET', url: '/v1/feed?categories=eletro,casa', headers: { authorization: `Bearer ${u.secret}` } })).json();
    expect(feed.offers.map((o: { category: string }) => o.category)).toEqual(['casa']);
  });
});

describe('contas', () => {
  it('login por e-mail com código: conta anônima vira a conta da pessoa e mantém os interesses', async () => {
    const app = serverAt();
    const anon = (await app.inject({ method: 'POST', url: '/v1/users' })).json();
    const anonH = { authorization: `Bearer ${anon.secret}` };
    await app.inject({ method: 'PUT', url: '/v1/me', headers: anonH, payload: { categories: ['games'] } });

    expect((await app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email: 'Ana@Exemplo.com ' } })).statusCode).toBe(204);
    // Pedir outro código logo em seguida é bloqueado.
    expect((await app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email: 'ana@exemplo.com' } })).statusCode).toBe(429);
    const code = email.last.get('ana@exemplo.com')!;
    const wrong = code === '000000' ? '111111' : '000000';
    expect((await app.inject({ method: 'POST', url: '/v1/auth/email/verify', headers: anonH, payload: { email: 'ana@exemplo.com', code: wrong } })).statusCode).toBe(400);

    const ok = (await app.inject({ method: 'POST', url: '/v1/auth/email/verify', headers: anonH, payload: { email: 'ana@exemplo.com', code } })).json();
    expect(ok).toMatchObject({ userId: anon.userId, isNew: false });
    const me = (await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${ok.token}` } })).json();
    expect(me).toMatchObject({ email: 'ana@exemplo.com', identified: true, plan: 'free', categories: ['games'] });
    // O código vale uma vez só.
    expect((await app.inject({ method: 'POST', url: '/v1/auth/email/verify', payload: { email: 'ana@exemplo.com', code } })).statusCode).toBe(400);
  });

  it('conta da casa (PRO_EMAILS) é Pro sem pagamento; as outras continuam grátis', async () => {
    repo = new Repo(openDb(':memory:'), { proEmails: [' Casa@X.com '] });
    const app = serverAt(new Date(T0));
    const login = async (addr: string) => {
      await app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email: addr } });
      const r = (await app.inject({ method: 'POST', url: '/v1/auth/email/verify', payload: { email: addr, code: email.last.get(addr) } })).json();
      return (await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${r.token}` } })).json();
    };
    expect(await login('casa@x.com')).toMatchObject({ plan: 'pro' });
    expect(await login('outra@x.com')).toMatchObject({ plan: 'free' });
  });

  it('entrar de novo em outro aparelho cai na mesma conta; Apple com o mesmo e-mail também', async () => {
    const app = serverAt(new Date(T0));
    await app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email: 'bia@x.com' } });
    const first = (await app.inject({ method: 'POST', url: '/v1/auth/email/verify', payload: { email: 'bia@x.com', code: email.last.get('bia@x.com') } })).json();
    expect(first.isNew).toBe(true);

    const app2 = serverAt(new Date(T0 + 60_000));
    await app2.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email: 'bia@x.com' } });
    const again = (await app2.inject({ method: 'POST', url: '/v1/auth/email/verify', payload: { email: 'bia@x.com', code: email.last.get('bia@x.com') } })).json();
    expect(again).toMatchObject({ userId: first.userId, isNew: false });

    const apple = (await app.inject({ method: 'POST', url: '/v1/auth/apple', payload: { identityToken: 'apple-sub-1|bia@x.com' } })).json();
    expect(apple.userId).toBe(first.userId);
    const appleAgain = (await app.inject({ method: 'POST', url: '/v1/auth/apple', payload: { identityToken: 'apple-sub-1' } })).json();
    expect(appleAgain.userId).toBe(first.userId);
    expect((await app.inject({ method: 'POST', url: '/v1/auth/apple', payload: { identityToken: 'bad-token-xyz' } })).statusCode).toBe(401);

    // Sair invalida só a sessão daquele aparelho.
    await app.inject({ method: 'POST', url: '/v1/auth/logout', headers: { authorization: `Bearer ${apple.token}` } });
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${apple.token}` } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${first.token}` } })).statusCode).toBe(200);

    // Excluir a conta apaga tudo.
    expect((await app.inject({ method: 'DELETE', url: '/v1/me', headers: { authorization: `Bearer ${first.token}` } })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${again.token}` } })).statusCode).toBe(401);
  });
});

describe('assinatura', () => {
  it('webhook do RevenueCat liga e desliga o Pro; grátis tem 1 alerta', async () => {
    const now = new Date(T0);
    const app = serverAt(now);
    const u = (await app.inject({ method: 'POST', url: '/v1/users' })).json();
    const headers = { authorization: `Bearer ${u.secret}` };
    const hook = (type: string, exp?: number) =>
      app.inject({ method: 'POST', url: '/v1/webhooks/revenuecat', headers: { authorization: 'rc-secret' }, payload: { event: { type, app_user_id: u.userId, expiration_at_ms: exp ?? null } } });

    expect((await app.inject({ method: 'POST', url: '/v1/alerts', headers, payload: { term: 'tenis', minTier: 'hot' } })).statusCode).toBe(201);
    const second = await app.inject({ method: 'POST', url: '/v1/alerts', headers, payload: { term: 'fone', minTier: 'hot' } });
    expect(second.statusCode).toBe(402);
    expect(second.json().upgrade).toBe(true);

    expect((await app.inject({ method: 'POST', url: '/v1/webhooks/revenuecat', headers: { authorization: 'errado' }, payload: {} })).statusCode).toBe(401);
    await hook('INITIAL_PURCHASE', T0 + 30 * DAY);
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers })).json().plan).toBe('pro');
    expect((await app.inject({ method: 'POST', url: '/v1/alerts', headers, payload: { term: 'fone', minTier: 'hot' } })).statusCode).toBe(201);

    await hook('CANCELLATION');
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers })).json().plan).toBe('pro');
    await hook('EXPIRATION');
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers })).json().plan).toBe('free');

    const plans = (await app.inject({ method: 'GET', url: '/v1/plans' })).json();
    expect(plans.plans).toEqual([
      { id: 'yearly', price: 11900, perMonth: 992 },
      { id: 'monthly', price: 1490, perMonth: 1490 },
    ]);
  });
});

describe('Pix no site', () => {
  async function signedUser(app: ReturnType<typeof serverAt>, mail: string) {
    await app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email: mail } });
    const s = (await app.inject({ method: 'POST', url: '/v1/auth/email/verify', payload: { email: mail, code: email.last.get(mail) } })).json();
    return { authorization: `Bearer ${s.token}` };
  }

  it('cobra, libera o Pro quando pago e não soma dias duas vezes', async () => {
    const now = new Date(T0);
    const app = serverAt(now);
    const headers = await signedUser(app, 'pix@x.com');

    const created = await app.inject({ method: 'POST', url: '/v1/billing/pix', headers, payload: { period: 'monthly' } });
    expect(created.statusCode).toBe(201);
    const charge = created.json().charge;
    expect(charge).toMatchObject({ amount: 1490, status: 'pending', test: true });
    expect(charge.qrCode).toContain('14.90');

    const pending = (await app.inject({ method: 'GET', url: `/v1/billing/pix/${charge.id}`, headers })).json();
    expect(pending).toMatchObject({ plan: 'free', charge: { status: 'pending' } });

    expect((await app.inject({ method: 'POST', url: `/v1/dev/pix/${charge.id}/pay`, headers })).json().plan).toBe('pro');
    // Consultar de novo (como faz o site) não soma mais 30 dias.
    await app.inject({ method: 'GET', url: `/v1/billing/pix/${charge.id}`, headers });
    const me = (await app.inject({ method: 'GET', url: '/v1/me', headers })).json();
    expect(new Date(me.proUntil).getTime()).toBe(T0 + 30 * DAY);

    // Renovar antes de vencer soma a partir do fim do período atual.
    const second = (await app.inject({ method: 'POST', url: '/v1/billing/pix', headers, payload: { period: 'yearly' } })).json().charge;
    await app.inject({ method: 'POST', url: `/v1/dev/pix/${second.id}/pay`, headers });
    const me2 = (await app.inject({ method: 'GET', url: '/v1/me', headers })).json();
    expect(new Date(me2.proUntil).getTime()).toBe(T0 + (30 + 365) * DAY);
  });

  it('exige conta identificada e não mostra cobrança de outra pessoa', async () => {
    const app = serverAt(new Date(T0));
    const anon = (await app.inject({ method: 'POST', url: '/v1/users' })).json();
    expect((await app.inject({ method: 'POST', url: '/v1/billing/pix', headers: { authorization: `Bearer ${anon.secret}` }, payload: { period: 'monthly' } })).statusCode).toBe(400);
    const a = await signedUser(app, 'a@x.com');
    const b = await signedUser(serverAt(new Date(T0 + 60_000)), 'b@x.com');
    const charge = (await app.inject({ method: 'POST', url: '/v1/billing/pix', headers: a, payload: { period: 'monthly' } })).json().charge;
    expect((await app.inject({ method: 'GET', url: `/v1/billing/pix/${charge.id}`, headers: b })).statusCode).toBe(404);
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
