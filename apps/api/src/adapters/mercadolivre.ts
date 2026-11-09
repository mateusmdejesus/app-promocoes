import type { Category } from '@keropromo/core';
import type { ListingSnapshot, StoreAdapter } from './types';

/**
 * Coletor do Mercado Livre pela API oficial (developers.mercadolivre.com.br).
 * Usa o acesso renovado automaticamente pelo MercadoLivreAuth (ver mercadolivreAuth.ts).
 *
 * Duas fontes, porque a busca (/sites/MLB/search) responde 403 para aplicações novas:
 * 1. Mais vendidos por categoria (/highlights) + preço de cada anúncio (/items?ids=) ou
 *    produto de catálogo (/products/{id}).
 * 2. Busca por termo, se estiver liberada.
 * Uma fonte com erro não derruba as outras; só dá erro se nada funcionar.
 */
const HIGHLIGHTS: Array<{ id: string; category: Category }> = [
  { id: 'MLB1000', category: 'eletronicos' }, // Eletrônicos, áudio e vídeo
  { id: 'MLB1051', category: 'eletronicos' }, // Celulares e telefones
  { id: 'MLB1648', category: 'eletronicos' }, // Informática
  { id: 'MLB1144', category: 'games' },
  { id: 'MLB5726', category: 'casa' }, // Eletrodomésticos
  { id: 'MLB1574', category: 'casa' }, // Casa, móveis e decoração
  { id: 'MLB1430', category: 'moda' }, // Calçados, roupas e bolsas
  { id: 'MLB1246', category: 'beleza' },
  { id: 'MLB1276', category: 'esporte' },
  { id: 'MLB1384', category: 'bebe' },
  { id: 'MLB1071', category: 'pet' },
  { id: 'MLB1403', category: 'mercado' }, // Alimentos e bebidas
];

const SEARCHES: Array<{ q: string; category: Category }> = [
  { q: 'air fryer', category: 'casa' },
  { q: 'fone bluetooth', category: 'eletronicos' },
  { q: 'smart tv', category: 'eletronicos' },
  { q: 'controle ps5', category: 'games' },
  { q: 'perfume', category: 'beleza' },
];

interface MlItem {
  id: string;
  title: string;
  price: number;
  original_price?: number | null;
  permalink: string;
  thumbnail?: string;
  status?: string;
}

/** Anúncio dentro de um produto de catálogo (/products/{id}/items). */
interface MlProductItem {
  item_id: string;
  price: number;
  original_price?: number | null;
  condition?: string;
}

const MAX_PRODUCTS_PER_CATEGORY = 12;

interface MlProduct {
  id: string;
  name: string;
  permalink?: string;
  pictures?: Array<{ url: string }>;
  buy_box_winner?: { item_id: string; price: number; original_price?: number | null } | null;
}

export interface MercadoLivreOptions {
  auth: { accessToken(): Promise<string> };
  /** Transforma o link do produto em link de afiliado, se configurado. */
  affiliateLink?: (permalink: string) => string;
  fetchImpl?: typeof fetch;
}

const API = 'https://api.mercadolibre.com';
const toCents = (v: number) => Math.round(v * 100);
const https = (u?: string) => u?.replace(/^http:/, 'https:');

export class MercadoLivreAdapter implements StoreAdapter {
  store = 'mercadolivre' as const;
  constructor(private opts: MercadoLivreOptions) {}

  private async get<T>(path: string): Promise<T> {
    const f = this.opts.fetchImpl ?? fetch;
    const token = await this.opts.auth.accessToken();
    const res = await f(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`${res.status} em ${path.split('?')[0]}`);
    return (await res.json()) as T;
  }

  private link(permalink: string) {
    return this.opts.affiliateLink ? this.opts.affiliateLink(permalink) : permalink;
  }

  private fromItem(it: MlItem, category: Category): ListingSnapshot {
    return {
      externalId: it.id,
      title: it.title,
      category,
      price: toCents(it.price),
      listPrice: it.original_price ? toCents(it.original_price) : undefined,
      url: this.link(it.permalink),
      imageUrl: https(it.thumbnail),
    };
  }

  /**
   * Mais vendidos da categoria. Para a nossa aplicação, /items responde 403, então o preço
   * vem de /products/{id}/items (anúncios do produto de catálogo) e o nome e a foto de
   * /products/{id}. USER_PRODUCT (MLBU...) também dá 403 e fica de fora.
   */
  private async fromHighlights(cat: { id: string; category: Category }): Promise<ListingSnapshot[]> {
    const h = await this.get<{ content?: Array<{ id: string; type: string }> }>(`/highlights/MLB/category/${cat.id}`);
    const content = h.content ?? [];
    const ids = [...new Set(content.filter((c) => c.type === 'PRODUCT').map((c) => c.id))].slice(0, MAX_PRODUCTS_PER_CATEGORY);
    const out: ListingSnapshot[] = [];
    let failures = 0;
    let sample = '';

    for (const id of ids) {
      try {
        const offers = await this.get<{ results?: MlProductItem[] }>(`/products/${id}/items`);
        const active = (offers.results ?? []).filter((o) => o.price > 0 && (o.condition ?? 'new') === 'new');
        if (active.length === 0) continue;
        const best = active.reduce((m, o) => (o.price < m.price ? o : m));
        const p = await this.get<MlProduct>(`/products/${id}`);
        out.push({
          externalId: id,
          title: p.name,
          category: cat.category,
          price: toCents(best.price),
          listPrice: best.original_price ? toCents(best.original_price) : undefined,
          // O permalink de produto de catálogo costuma vir vazio (""), então o "||" e não "??".
          url: this.link(p.permalink || `https://www.mercadolivre.com.br/p/${id}`),
          imageUrl: https(p.pictures?.[0]?.url),
        });
      } catch (e) {
        failures++;
        sample ||= (e as Error).message;
      }
    }

    if (out.length === 0) {
      const types = [...new Set(content.map((c) => c.type))].join(',') || 'nenhum';
      throw new Error(`destaques ${cat.id}: 0 produtos (${content.length} itens, tipos: ${types}; falhas: ${failures}${sample ? ` ex.: ${sample}` : ''})`);
    }
    return out;
  }

  private async fromSearch(s: { q: string; category: Category }): Promise<ListingSnapshot[]> {
    const body = await this.get<{ results?: MlItem[] }>(`/sites/MLB/search?q=${encodeURIComponent(s.q)}&limit=50`);
    return (body.results ?? []).map((it) => this.fromItem(it, s.category));
  }

  async fetchListings(): Promise<ListingSnapshot[]> {
    const byId = new Map<string, ListingSnapshot>();
    const errors: string[] = [];
    let searchBlocked = false;

    for (const cat of HIGHLIGHTS) {
      try {
        for (const l of await this.fromHighlights(cat)) byId.set(l.externalId, l);
      } catch (e) {
        errors.push(`destaques ${cat.id}: ${(e as Error).message}`);
      }
    }
    for (const s of SEARCHES) {
      if (searchBlocked) break;
      try {
        for (const l of await this.fromSearch(s)) if (!byId.has(l.externalId)) byId.set(l.externalId, l);
      } catch (e) {
        const msg = (e as Error).message;
        errors.push(`busca "${s.q}": ${msg}`);
        if (msg.startsWith('403')) searchBlocked = true; // bloqueada: não insiste nos outros termos
      }
    }

    if (errors.length) console.warn(`[mercadolivre] ${byId.size} produtos; falhas: ${errors.slice(0, 5).join('; ')}${errors.length > 5 ? ` (+${errors.length - 5})` : ''}`);
    if (byId.size === 0) throw new Error(`Mercado Livre sem dados. ${errors.slice(0, 3).join('; ')}`);
    return [...byId.values()];
  }
}
