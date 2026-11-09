import type { Category } from '@keropromo/core';
import type { ListingSnapshot, StoreAdapter } from './types';

/**
 * Coletor do Mercado Livre pela API oficial (developers.mercadolivre.com.br).
 * Usa o acesso renovado automaticamente pelo MercadoLivreAuth (ver mercadolivreAuth.ts).
 *
 * Duas fontes, porque a busca (/sites/MLB/search) responde 403 para aplicações novas:
 * 1. Mais vendidos por categoria (/highlights) + preço pelos anúncios de cada produto de
 *    catálogo (/products/{id}/items). Ver fromHighlights.
 * 2. Busca por termo, se estiver liberada.
 * Uma fonte com erro não derruba as outras; só dá erro se nada funcionar.
 */
/**
 * `expand`: também lê as subcategorias (até esse número), com menos produtos em cada.
 * Usado em Eletro e Casa, para a aba "Casa e eletro" ter geladeira, lavadora, fogão, TV etc.
 */
const HIGHLIGHTS: Array<{ id: string; category: Category; expand?: number }> = [
  { id: 'MLB1000', category: 'eletronicos' }, // Eletrônicos, áudio e vídeo
  { id: 'MLB1051', category: 'eletronicos' }, // Celulares e telefones
  { id: 'MLB1648', category: 'eletronicos' }, // Informática
  { id: 'MLB1144', category: 'games' },
  { id: 'MLB5726', category: 'eletro', expand: 12 }, // Eletrodomésticos (geladeira, lavadora, fogão...)
  { id: 'MLB1002', category: 'eletro' }, // Televisores
  { id: 'MLB1574', category: 'casa', expand: 8 }, // Casa, móveis e decoração (inclui cozinha)
  { id: 'MLB1430', category: 'moda' }, // Calçados, roupas e bolsas
  { id: 'MLB1246', category: 'beleza' },
  { id: 'MLB1276', category: 'esporte' },
  { id: 'MLB1384', category: 'bebe' },
  { id: 'MLB1071', category: 'pet' },
  { id: 'MLB1403', category: 'mercado' }, // Alimentos e bebidas
  { id: 'MLB1039', category: 'eletronicos' }, // Câmeras e acessórios
  { id: 'MLB263532', category: 'casa' }, // Ferramentas
  { id: 'MLB1500', category: 'casa' }, // Construção
  { id: 'MLB3937', category: 'moda' }, // Joias e relógios
  { id: 'MLB264586', category: 'beleza' }, // Saúde
  { id: 'MLB1132', category: 'bebe' }, // Brinquedos e hobbies
  { id: 'MLB1196', category: 'livros' }, // Livros, revistas e comics
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

const MAX_PRODUCTS_PER_CATEGORY = 20;
const MAX_PRODUCTS_PER_SUBCATEGORY = 10;

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

  /** Nome, foto e link mudam pouco: guardados para não pedir de novo a cada varredura. */
  private productInfo = new Map<string, { name: string; url: string; imageUrl?: string }>();
  /** O Mercado Livre pediu para ir mais devagar (429): para a varredura atual. */
  private rateLimited = false;

  private async get<T>(path: string): Promise<T> {
    if (this.rateLimited) throw new Error(`429 em ${path.split('?')[0]} (aguardando a próxima varredura)`);
    const f = this.opts.fetchImpl ?? fetch;
    const token = await this.opts.auth.accessToken();
    const res = await f(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 429) this.rateLimited = true;
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
  /** Subcategorias de uma categoria (mudam pouco: guardadas). */
  private children = new Map<string, string[]>();
  private async subcategories(id: string, max: number): Promise<string[]> {
    let ids = this.children.get(id);
    if (!ids) {
      const c = await this.get<{ children_categories?: Array<{ id: string }> }>(`/categories/${id}`);
      ids = (c.children_categories ?? []).map((x) => x.id);
      this.children.set(id, ids);
    }
    return ids.slice(0, max);
  }

  private async fromHighlights(cat: { id: string; category: Category }, max = MAX_PRODUCTS_PER_CATEGORY): Promise<ListingSnapshot[]> {
    const h = await this.get<{ content?: Array<{ id: string; type: string }> }>(`/highlights/MLB/category/${cat.id}`);
    const content = h.content ?? [];
    const ids = [...new Set(content.filter((c) => c.type === 'PRODUCT').map((c) => c.id))].slice(0, max);
    const out: ListingSnapshot[] = [];
    let failures = 0;
    let sample = '';

    for (const id of ids) {
      try {
        const offers = await this.get<{ results?: MlProductItem[] }>(`/products/${id}/items`);
        const active = (offers.results ?? []).filter((o) => o.price > 0 && (o.condition ?? 'new') === 'new');
        if (active.length === 0) continue;
        const best = active.reduce((m, o) => (o.price < m.price ? o : m));
        let info = this.productInfo.get(id);
        if (!info) {
          const p = await this.get<MlProduct>(`/products/${id}`);
          // O permalink de produto de catálogo costuma vir vazio (""), então o "||" e não "??".
          info = { name: p.name, url: this.link(p.permalink || `https://www.mercadolivre.com.br/p/${id}`), imageUrl: https(p.pictures?.[0]?.url) };
          this.productInfo.set(id, info);
        }
        out.push({
          externalId: id,
          title: info.name,
          category: cat.category,
          price: toCents(best.price),
          listPrice: best.original_price ? toCents(best.original_price) : undefined,
          url: info.url,
          imageUrl: info.imageUrl,
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
    this.rateLimited = false;

    for (const cat of HIGHLIGHTS) {
      if (this.rateLimited) {
        errors.push('limite de chamadas do Mercado Livre (429): resto fica para a próxima varredura');
        break;
      }
      try {
        for (const l of await this.fromHighlights(cat)) byId.set(l.externalId, l);
      } catch (e) {
        errors.push(`destaques ${cat.id}: ${(e as Error).message}`);
      }
      if (!cat.expand) continue;
      let subs: string[] = [];
      try {
        subs = await this.subcategories(cat.id, cat.expand);
      } catch (e) {
        errors.push(`subcategorias ${cat.id}: ${(e as Error).message}`);
      }
      for (const sub of subs) {
        if (this.rateLimited) break;
        try {
          for (const l of await this.fromHighlights({ id: sub, category: cat.category }, MAX_PRODUCTS_PER_SUBCATEGORY)) {
            if (!byId.has(l.externalId)) byId.set(l.externalId, l);
          }
        } catch (e) {
          errors.push(`destaques ${sub}: ${(e as Error).message}`);
        }
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
