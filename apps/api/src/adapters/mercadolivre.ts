import type { Category } from '@keropromo/core';
import type { ListingSnapshot, StoreAdapter } from './types';

/**
 * Coletor do Mercado Livre pela API oficial (developers.mercadolivre.com.br).
 * Precisa de um token de acesso de um app registrado (ML_ACCESS_TOKEN).
 *
 * Ainda não foi testado contra a API real: este ambiente não tem um token.
 * Antes de ligar em produção, valide os campos com uma chamada real.
 */
const SEARCHES: Array<{ q: string; category: Category }> = [
  { q: 'air fryer', category: 'casa' },
  { q: 'cafeteira', category: 'casa' },
  { q: 'fone bluetooth', category: 'eletronicos' },
  { q: 'smart tv', category: 'eletronicos' },
  { q: 'smartwatch', category: 'eletronicos' },
  { q: 'controle ps5', category: 'games' },
  { q: 'tenis corrida', category: 'esporte' },
  { q: 'perfume', category: 'beleza' },
  { q: 'racao caes', category: 'pet' },
  { q: 'fralda', category: 'bebe' },
];

interface MlSearchItem {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  permalink: string;
  thumbnail?: string;
}

export interface MercadoLivreOptions {
  accessToken: string;
  /** Transforma o link do produto em link de afiliado, se configurado. */
  affiliateLink?: (permalink: string) => string;
  fetchImpl?: typeof fetch;
}

const toCents = (v: number) => Math.round(v * 100);

export class MercadoLivreAdapter implements StoreAdapter {
  store = 'mercadolivre' as const;
  constructor(private opts: MercadoLivreOptions) {}

  async fetchListings(): Promise<ListingSnapshot[]> {
    const f = this.opts.fetchImpl ?? fetch;
    const out: ListingSnapshot[] = [];
    for (const s of SEARCHES) {
      const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(s.q)}&limit=50`;
      const res = await f(url, { headers: { Authorization: `Bearer ${this.opts.accessToken}` } });
      if (!res.ok) throw new Error(`Mercado Livre respondeu ${res.status} para "${s.q}"`);
      const body = (await res.json()) as { results?: MlSearchItem[] };
      for (const it of body.results ?? []) {
        out.push({
          externalId: it.id,
          title: it.title,
          category: s.category,
          price: toCents(it.price),
          listPrice: it.original_price ? toCents(it.original_price) : undefined,
          url: this.opts.affiliateLink ? this.opts.affiliateLink(it.permalink) : it.permalink,
          imageUrl: it.thumbnail?.replace(/^http:/, 'https:'),
        });
      }
    }
    return out;
  }
}
