import { describe, expect, it } from 'vitest';
import { LomadeeAdapter, storeFromUrl, toListing, type LmdProduct } from '../src/adapters/lomadee';

const product = (over: Partial<LmdProduct> = {}): LmdProduct => ({
  id: 'p1',
  organizationId: 'org1',
  available: true,
  name: 'Air Fryer 4L',
  url: 'https://loja.com/air-fryer',
  images: [{ url: 'http://img/1.jpg' }],
  options: [
    { available: true, seller: 'Vendedor A', pricing: [{ price: 309.9, listPrice: 519.9 }] },
    { seller: 'Vendedor B', pricing: [{ price: '289.90', listPrice: 519.9 }] },
    { available: false, seller: 'Vendedor C', pricing: [{ price: 1, listPrice: 519.9 }] },
  ],
  ...over,
});

describe('Lomadee', () => {
  it('pega a opção disponível mais barata (preço em reais, às vezes em texto), com loja, foto e "de"', () => {
    expect(toListing(product(), 'casa', 'Mondial')).toEqual({
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

  it('sem a marca na lista, o nome da loja sai do endereço', () => {
    expect(storeFromUrl('https://shopee.com.br/product/1/2')).toBe('Shopee');
    expect(storeFromUrl('https://www.soulier.com.br/tenis')).toBe('Soulier');
    expect(toListing(product({ url: 'https://shopee.com.br/product/1/2' }), 'casa')?.seller).toBe('Shopee');
    expect(toListing(product({ options: [{ pricing: [{ price: 49, listPrice: 99 }] }] }), 'casa')).toMatchObject({ price: 4900, listPrice: 9900 });
  });

  it('ignora indisponível, sem link ou sem preço; "de" menor que o preço é descartado', () => {
    expect(toListing(product({ available: false }), 'casa')).toBeNull();
    expect(toListing(product({ url: '' }), 'casa')).toBeNull();
    expect(toListing(product({ options: [{ pricing: [{ price: 0 }] }] }), 'casa')).toBeNull();
    expect(toListing(product({ options: [{ seller: 'X', pricing: [{ price: 5, listPrice: 4 }] }] }), 'casa')?.listPrice).toBeUndefined();
  });

  it('manda a chave no cabeçalho e para na hora se a chave não tem permissão', async () => {
    const calls: Array<{ url: string; key: string | null }> = [];
    const ok = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), key: new Headers(init?.headers).get('x-api-key') });
      if (String(input).includes('/affiliate/brands')) return Response.json({ data: [{ id: 'org1', name: 'Mondial' }], pagination: { totalPages: 1 } });
      return Response.json({ data: [product()] });
    }) as typeof fetch;
    const listings = await new LomadeeAdapter({ apiKey: 'k1', fetchImpl: ok, log: () => undefined, delayMs: 0 }).fetchListings();
    expect(listings).toHaveLength(1);
    expect(listings[0]!.seller).toBe('Mondial');
    expect(calls.every((c) => c.key === 'k1')).toBe(true);
    expect(calls[1]!.url).toContain('/affiliate/products?search=smart%20tv&isAvailable=true&limit=50');

    let n = 0;
    const forbidden = (async () => {
      n++;
      return Response.json({ success: false, message: 'Insufficient scope', code: 'FORBIDDEN' }, { status: 403 });
    }) as typeof fetch;
    await expect(new LomadeeAdapter({ apiKey: 'k', fetchImpl: forbidden, delayMs: 0 }).fetchListings()).rejects.toThrow(/403/);
    expect(n).toBe(2); // lista de marcas (falha, segue sem ela) + 1ª busca, e para
  });
});
