import { describe, expect, it } from 'vitest';
import { LomadeeAdapter, pricesInReais, toListing, type LmdProduct } from '../src/adapters/lomadee';

const product = (over: Partial<LmdProduct> = {}): LmdProduct => ({
  id: 'p1',
  organizationId: 'org1',
  available: true,
  name: 'Air Fryer 4L',
  url: 'https://loja.com/air-fryer',
  images: [{ url: 'http://img/1.jpg' }],
  options: [
    { available: true, seller: 'Mondial', pricing: [{ price: 30990, listPrice: 51990 }] },
    { available: true, seller: 'Mondial', pricing: [{ price: 28990, listPrice: 51990 }] },
    { available: false, seller: 'Mondial', pricing: [{ price: 100, listPrice: 51990 }] },
  ],
  ...over,
});

describe('Lomadee', () => {
  it('pega a opção disponível mais barata, com loja, foto e "de"', () => {
    expect(toListing(product(), 'casa', false)).toEqual({
      externalId: 'p1',
      title: 'Air Fryer 4L',
      category: 'casa',
      price: 28990,
      listPrice: 51990,
      url: 'https://loja.com/air-fryer',
      imageUrl: 'https://img/1.jpg',
      seller: 'Mondial',
    });
  });

  it('descobre se os preços vêm em reais ou centavos', () => {
    expect(pricesInReais([product()])).toBe(false);
    const reais = product({ options: [{ seller: 'X', pricing: [{ price: 289.9, listPrice: 519.9 }] }] });
    expect(pricesInReais([reais])).toBe(true);
    expect(toListing(reais, 'casa', true)).toMatchObject({ price: 28990, listPrice: 51990 });
  });

  it('ignora indisponível, sem link ou sem preço; "de" menor que o preço é descartado', () => {
    expect(toListing(product({ available: false }), 'casa', false)).toBeNull();
    expect(toListing(product({ url: '' }), 'casa', false)).toBeNull();
    expect(toListing(product({ options: [{ pricing: [{ price: 0 }] }] }), 'casa', false)).toBeNull();
    expect(toListing(product({ options: [{ seller: 'X', pricing: [{ price: 500, listPrice: 400 }] }] }), 'casa', false)?.listPrice).toBeUndefined();
  });

  it('manda a chave no cabeçalho e para na hora se a chave não tem permissão', async () => {
    const calls: Array<{ url: string; key: string | null }> = [];
    const ok = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), key: new Headers(init?.headers).get('x-api-key') });
      return Response.json({ data: [product()] });
    }) as typeof fetch;
    const listings = await new LomadeeAdapter({ apiKey: 'k1', fetchImpl: ok, log: () => undefined }).fetchListings();
    expect(listings).toHaveLength(1);
    expect(calls[0]!.key).toBe('k1');
    expect(calls[0]!.url).toContain('/affiliate/products?search=smart%20tv&isAvailable=true&limit=50');

    let n = 0;
    const forbidden = (async () => {
      n++;
      return Response.json({ success: false, message: 'Insufficient scope', code: 'FORBIDDEN' }, { status: 403 });
    }) as typeof fetch;
    await expect(new LomadeeAdapter({ apiKey: 'k', fetchImpl: forbidden }).fetchListings()).rejects.toThrow(/403/);
    expect(n).toBe(1);
  });
});
