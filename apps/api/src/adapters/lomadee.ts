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
  // Termos específicos: "geladeira" sozinho traz brinquedo e peça (conferido na API real).
  { q: 'smart tv', category: 'eletro' },
  { q: 'geladeira frost free', category: 'eletro' },
  { q: 'geladeira duplex', category: 'eletro' },
  { q: 'lavadora de roupas', category: 'eletro' },
  { q: 'fogão 4 bocas', category: 'eletro' },
  { q: 'micro-ondas', category: 'eletro' },
  { q: 'ar condicionado', category: 'eletro' },
  { q: 'aspirador de pó', category: 'eletro' },
  { q: 'fritadeira air fryer', category: 'casa' },
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
  /** Em reais. Às vezes vem como texto ("259.90"). */
  pricing?: Array<{ listPrice?: number | string | null; price?: number | string | null }>;
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
  /** Para o log da primeira varredura (conferir preços e lojas). */
  log?: (msg: string) => void;
  /** Pausa entre chamadas, para ficar abaixo de 60 por minuto (padrão 1,1 s; 0 nos testes). */
  delayMs?: number;
}

const API = 'https://api.lomadee.com.br';

/** Reais (número ou texto) para centavos; 0 quando não dá para ler. Conferido na API real: sempre reais. */
const cents = (v: number | string | null | undefined): number => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : (v ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

const KNOWN_HOSTS: Record<string, string> = { 'shopee.com.br': 'Shopee' };

/** Nome da loja pelo endereço do produto, quando a lista de marcas não tem a loja. */
export function storeFromUrl(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.replace(/^(www|loja|shop)\./, '');
    if (KNOWN_HOSTS[host]) return KNOWN_HOSTS[host];
    const label = host.split('.')[0];
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : undefined;
  } catch {
    return undefined;
  }
}

/** Melhor oferta de um produto: a opção disponível mais barata. `store` é o nome da loja (marca). */
export function toListing(p: LmdProduct, category: Category, store?: string): ListingSnapshot | null {
  if (p.available === false || !p.url) return null;
  let best: { price: number; list?: number; opt: LmdOption } | null = null;
  for (const opt of p.options ?? []) {
    if (opt.available === false) continue;
    for (const pr of opt.pricing ?? []) {
      const price = cents(pr.price);
      if (!price) continue;
      if (!best || price < best.price) best = { price, list: cents(pr.listPrice) || undefined, opt };
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
    // A loja é a marca da Lomadee (ex.: Shopee); `option.seller` é o vendedor dentro dela.
    seller: store ?? storeFromUrl(p.url),
  };
}

export class LomadeeAdapter implements StoreAdapter {
  store = 'lomadee' as const;
  private logged = false;
  /** organizationId -> nome da marca (loja), renovado a cada 24 h. */
  private brands: { at: number; names: Map<string, string> } | null = null;
  constructor(private opts: LomadeeOptions) {}

  private lastCall = 0;
  private async get<T>(path: string): Promise<T> {
    const wait = this.lastCall + (this.opts.delayMs ?? 1100) - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastCall = Date.now();
    const f = this.opts.fetchImpl ?? fetch;
    const res = await f(`${API}${path}`, { headers: { 'x-api-key': this.opts.apiKey, Accept: 'application/json' } });
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 160);
      throw new Error(`${res.status} em ${path.split('?')[0]} ${body}`);
    }
    return (await res.json()) as T;
  }

  private async search(q: string): Promise<LmdProduct[]> {
    const json = await this.get<{ data?: LmdProduct[] }>(`/affiliate/products?search=${encodeURIComponent(q)}&isAvailable=true&limit=${PER_SEARCH}&page=1`);
    return json.data ?? [];
  }

  /** Nomes das lojas (escopo brands:read). Sem ele, o nome sai do endereço do produto. */
  private async brandNames(): Promise<Map<string, string>> {
    if (this.brands && Date.now() - this.brands.at < 86_400_000) return this.brands.names;
    const names = new Map<string, string>();
    try {
      for (let page = 1; page <= 15; page++) {
        const r = await this.get<{ data?: Array<{ id: string; name: string }>; pagination?: { totalPages?: number } }>(`/affiliate/brands?limit=20&page=${page}`);
        for (const b of r.data ?? []) if (b.id && b.name) names.set(b.id, b.name.trim());
        if (page >= (r.pagination?.totalPages ?? 1)) break;
      }
    } catch (e) {
      console.warn(`[lomadee] sem lista de marcas (${(e as Error).message}); nome da loja pelo endereço.`);
    }
    this.brands = { at: Date.now(), names };
    return names;
  }

  async fetchListings(): Promise<ListingSnapshot[]> {
    const byId = new Map<string, ListingSnapshot>();
    const errors: string[] = [];
    const brands = await this.brandNames();
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
      if (!this.logged && products.length > 0) {
        this.logged = true;
        const p = products[0]!;
        const pr = p.options?.[0]?.pricing?.[0];
        (this.opts.log ?? console.log)(
          `[lomadee] exemplo: "${p.name.slice(0, 60)}" price=${pr?.price} listPrice=${pr?.listPrice} loja=${brands.get(p.organizationId ?? '') ?? storeFromUrl(p.url ?? '')} url=${p.url}`,
        );
      }
      for (const p of products) {
        const l = toListing(p, s.category, brands.get(p.organizationId ?? ''));
        if (l && !byId.has(l.externalId)) byId.set(l.externalId, l);
      }
    }
    const sellers = [...new Set([...byId.values()].map((l) => l.seller ?? '?'))];
    console.log(`[lomadee] ${byId.size} produtos de ${sellers.length} lojas (${sellers.slice(0, 8).join(', ')}${sellers.length > 8 ? '...' : ''})${errors.length ? `; falhas: ${errors.slice(0, 3).join('; ')}` : ''}`);
    if (byId.size === 0) throw new Error(`Lomadee sem dados. ${errors.slice(0, 2).join('; ')}`);
    return [...byId.values()];
  }
}
