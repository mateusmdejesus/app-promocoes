import type { Category } from '@keropromo/core';
import type { ListingSnapshot, StoreAdapter } from './types';

/**
 * Coletor da Lomadee (rede de afiliados com várias lojas: Shopee, Lojas REDE, Mondial...).
 * API: GET https://api.lomadee.com.br/affiliate/products, chave no cabeçalho `x-api-key`
 * (escopo products:read). Limite: 60 chamadas por minuto por chave.
 *
 * Só aparecem produtos das marcas a que a conta de afiliado tem acesso.
 * O cadastro de afiliado é só a chave de acesso aos dados: o link é o da loja.
 */
const SEARCHES: Array<{ q: string; category: Category }> = [
  { q: 'smart tv', category: 'eletro' },
  { q: 'geladeira', category: 'eletro' },
  { q: 'máquina de lavar', category: 'eletro' },
  { q: 'micro-ondas', category: 'eletro' },
  { q: 'fogão', category: 'eletro' },
  { q: 'ar condicionado', category: 'eletro' },
  { q: 'aspirador', category: 'eletro' },
  { q: 'air fryer', category: 'casa' },
  { q: 'liquidificador', category: 'casa' },
  { q: 'cafeteira', category: 'casa' },
  { q: 'panela', category: 'casa' },
  { q: 'jogo de cama', category: 'casa' },
  { q: 'celular', category: 'eletronicos' },
  { q: 'notebook', category: 'eletronicos' },
  { q: 'fone bluetooth', category: 'eletronicos' },
  { q: 'smartwatch', category: 'eletronicos' },
  { q: 'console', category: 'games' },
  { q: 'tênis', category: 'esporte' },
  { q: 'bicicleta', category: 'esporte' },
  { q: 'perfume', category: 'beleza' },
  { q: 'protetor solar', category: 'beleza' },
  { q: 'mochila', category: 'moda' },
  { q: 'relógio', category: 'moda' },
  { q: 'brinquedo', category: 'bebe' },
  { q: 'fralda', category: 'bebe' },
  { q: 'ração', category: 'pet' },
  { q: 'whey', category: 'mercado' },
  { q: 'livro', category: 'livros' },
];

const PER_SEARCH = 50;

interface LmdImage {
  url?: string;
}
interface LmdOption {
  name?: string;
  available?: boolean;
  seller?: string;
  images?: LmdImage[];
  pricing?: Array<{ listPrice?: number | null; price?: number | null }>;
}
export interface LmdProduct {
  id: string;
  organizationId?: string;
  available?: boolean;
  name: string;
  url?: string;
  images?: LmdImage[];
  options?: LmdOption[];
}

export interface LomadeeOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  /** Para o log da primeira varredura (conferir unidade de preço e lojas). */
  log?: (msg: string) => void;
}

const API = 'https://api.lomadee.com.br';

/**
 * A documentação usa centavos nos filtros de preço, mas o exemplo de resposta não diz a unidade.
 * Regra: se algum preço do lote tem casas decimais, o lote está em reais; senão, em centavos.
 */
export function pricesInReais(products: LmdProduct[]): boolean {
  for (const p of products)
    for (const o of p.options ?? [])
      for (const pr of o.pricing ?? []) {
        if (pr.price != null && !Number.isInteger(pr.price)) return true;
        if (pr.listPrice != null && !Number.isInteger(pr.listPrice)) return true;
      }
  return false;
}

/** Melhor oferta de um produto: a opção disponível mais barata. */
export function toListing(p: LmdProduct, category: Category, reais: boolean): ListingSnapshot | null {
  if (p.available === false || !p.url) return null;
  const cents = (v: number) => (reais ? Math.round(v * 100) : Math.round(v));
  let best: { price: number; list?: number; opt: LmdOption } | null = null;
  for (const opt of p.options ?? []) {
    if (opt.available === false) continue;
    for (const pr of opt.pricing ?? []) {
      if (!pr.price || pr.price <= 0) continue;
      const price = cents(pr.price);
      if (!best || price < best.price) best = { price, list: pr.listPrice ? cents(pr.listPrice) : undefined, opt };
    }
  }
  if (!best) return null;
  const image = p.images?.find((i) => i.url)?.url ?? best.opt.images?.find((i) => i.url)?.url;
  return {
    externalId: p.id,
    title: p.name,
    category,
    price: best.price,
    listPrice: best.list && best.list > best.price ? best.list : undefined,
    url: p.url,
    imageUrl: image?.replace(/^http:/, 'https:'),
    seller: best.opt.seller?.trim() || undefined,
  };
}

export class LomadeeAdapter implements StoreAdapter {
  store = 'lomadee' as const;
  private logged = false;
  constructor(private opts: LomadeeOptions) {}

  private async search(q: string): Promise<LmdProduct[]> {
    const f = this.opts.fetchImpl ?? fetch;
    const url = `${API}/affiliate/products?search=${encodeURIComponent(q)}&isAvailable=true&limit=${PER_SEARCH}&page=1`;
    const res = await f(url, { headers: { 'x-api-key': this.opts.apiKey, Accept: 'application/json' } });
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 160);
      throw new Error(`${res.status} em /affiliate/products ${body}`);
    }
    const json = (await res.json()) as { data?: LmdProduct[] };
    return json.data ?? [];
  }

  async fetchListings(): Promise<ListingSnapshot[]> {
    const byId = new Map<string, ListingSnapshot>();
    const errors: string[] = [];
    for (const s of SEARCHES) {
      let products: LmdProduct[];
      try {
        products = await this.search(s.q);
      } catch (e) {
        const msg = (e as Error).message;
        errors.push(`"${s.q}": ${msg}`);
        // Chave errada (401), sem permissão (403) ou limite (429): não adianta insistir agora.
        if (/^(401|403|429)/.test(msg)) break;
        continue;
      }
      const reais = pricesInReais(products);
      if (!this.logged && products.length > 0) {
        this.logged = true;
        const p = products[0]!;
        const pr = p.options?.[0]?.pricing?.[0];
        (this.opts.log ?? console.log)(
          `[lomadee] exemplo: "${p.name.slice(0, 60)}" price=${pr?.price} listPrice=${pr?.listPrice} seller=${p.options?.[0]?.seller} org=${p.organizationId} (lido em ${reais ? 'reais' : 'centavos'}) url=${p.url}`,
        );
      }
      for (const p of products) {
        const l = toListing(p, s.category, reais);
        if (l && !byId.has(l.externalId)) byId.set(l.externalId, l);
      }
    }
    const sellers = [...new Set([...byId.values()].map((l) => l.seller ?? '?'))];
    console.log(`[lomadee] ${byId.size} produtos de ${sellers.length} lojas (${sellers.slice(0, 8).join(', ')}${sellers.length > 8 ? '...' : ''})${errors.length ? `; falhas: ${errors.slice(0, 3).join('; ')}` : ''}`);
    if (byId.size === 0) throw new Error(`Lomadee sem dados. ${errors.slice(0, 2).join('; ')}`);
    return [...byId.values()];
  }
}
