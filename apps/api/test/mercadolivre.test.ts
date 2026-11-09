import { describe, expect, it } from 'vitest';
import { MercadoLivreAdapter } from '../src/adapters/mercadolivre';
import { openDb } from '../src/db';
import { MercadoLivreAuth } from '../src/mercadolivreAuth';

/** Mercado Livre falso: cada renovação devolve um refresh token novo (como o real). */
function fakeMl() {
  let n = 0;
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/oauth/token')) {
      const body = new URLSearchParams(init!.body as string);
      calls.push(body.get('refresh_token')!);
      n++;
      return Response.json({ access_token: `acc-${n}`, refresh_token: `ref-${n}`, expires_in: 21600 });
    }
    if (url.includes('/sites/MLB/search')) return new Response('forbidden', { status: 403 });
    if (url.includes('/highlights/MLB/category/MLB1000')) {
      return Response.json({ content: [{ id: 'MLB1', type: 'ITEM' }, { id: 'MLB9', type: 'PRODUCT' }] });
    }
    if (url.includes('/highlights/')) return Response.json({ content: [] });
    if (url.includes('/items?ids=MLB1,')) return Response.json([{ code: 200, body: { id: 'MLB1', title: 'Air fryer 4L', price: 249, original_price: 519, permalink: 'https://ml/1', thumbnail: 'http://img/1' } }, { code: 404, body: null }]);
    if (url.includes('/items?ids=MLB1&')) {
      return Response.json([{ code: 200, body: { id: 'MLB1', title: 'Air fryer 4L', price: 249, original_price: 519, permalink: 'https://ml/1', thumbnail: 'http://img/1' } }]);
    }
    if (url.includes('/products/MLB9/items')) return Response.json({ results: [{ item_id: 'MLB10' }] });
    if (url.includes('/items?ids=MLB10')) {
      return Response.json([{ code: 200, body: { id: 'MLB10', title: 'Fone X', price: 99.9, original_price: null, permalink: 'https://ml/10', thumbnail: 'http://img/10' } }]);
    }
    return new Response('nope', { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe('Mercado Livre: acesso renovado', () => {
  it('usa o refresh token inicial, guarda o novo e reaproveita o acesso até vencer', async () => {
    const db = openDb(':memory:');
    const ml = fakeMl();
    let clock = 0;
    const auth = new MercadoLivreAuth({ clientId: 'id', clientSecret: 'sec', db, bootstrapRefreshToken: 'ref-0', fetchImpl: ml.fetchImpl, now: () => clock });

    expect(await auth.accessToken()).toBe('acc-1');
    expect(ml.calls).toEqual(['ref-0']);
    expect(await auth.accessToken()).toBe('acc-1'); // ainda válido: não renova
    expect(ml.calls).toHaveLength(1);

    // Perto de vencer (menos de 1 minuto): renova e usa o refresh token novo.
    clock = 21_600_000 - 30_000;
    expect(await auth.accessToken()).toBe('acc-2');
    expect(ml.calls).toEqual(['ref-0', 'ref-1']);

    // Depois de reiniciar o servidor, continua com o último refresh token salvo no banco.
    const reboot = new MercadoLivreAuth({ clientId: 'id', clientSecret: 'sec', db, bootstrapRefreshToken: 'ref-0', fetchImpl: ml.fetchImpl, now: () => clock });
    expect(await reboot.accessToken()).toMatch(/^acc-/);
    expect(ml.calls.at(-1)).toBe('ref-2');
  });

  it('várias buscas ao mesmo tempo fazem uma única renovação', async () => {
    const db = openDb(':memory:');
    const ml = fakeMl();
    const auth = new MercadoLivreAuth({ clientId: 'id', clientSecret: 'sec', db, bootstrapRefreshToken: 'ref-0', fetchImpl: ml.fetchImpl });
    const adapter = new MercadoLivreAdapter({ auth, fetchImpl: ml.fetchImpl });
    const [a, b] = await Promise.all([adapter.fetchListings(), adapter.fetchListings()]);
    expect(a[0]!.price).toBe(24900);
    expect(a[0]!.imageUrl).toBe('https://img/1');
    expect(a.find((l) => l.externalId === 'MLB10')!.price).toBe(9990);
    expect(b).toHaveLength(a.length);
    expect(ml.calls).toHaveLength(1);
  });

  it('sem conexão, erro claro em vez de chamada vazia', async () => {
    const auth = new MercadoLivreAuth({ clientId: 'id', clientSecret: 'sec', db: openDb(':memory:') });
    await expect(auth.accessToken()).rejects.toThrow(/ML_REFRESH_TOKEN/);
  });
});
