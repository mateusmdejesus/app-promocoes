import { categoryAffinity, lockedUntil, offerScore, personalScore, recentSearchTerms, storeLabel, tokenize, type Category, type Plan, type Tier } from '@keropromo/core';
import type { OfferRow, Repo } from './repo';

const DAY_MS = 86_400_000;

/**
 * O formato que o app recebe. Preços em centavos.
 * Oferta quente no plano grátis chega `locked`: sem preço e sem link até `unlocksAt`.
 */
export interface OfferDTO {
  id: string;
  title: string;
  category: Category;
  store: string;
  storeName: string;
  url: string | null;
  imageUrl: string | null;
  price: number | null;
  referencePrice: number | null;
  locked: boolean;
  unlocksAt: string | null;
  discountPct: number;
  tier: Tier;
  verified: boolean;
  lowestIn90d: boolean;
  detectedAt: string;
}

export function toDTO(o: OfferRow, plan: Plan, now: Date): OfferDTO {
  const until = lockedUntil(plan, o.analysis.tier, o.detectedAt, now);
  return {
    locked: !!until,
    unlocksAt: until?.toISOString() ?? null,
    id: o.product.id,
    title: o.product.title,
    category: o.product.category,
    store: o.product.store,
    storeName: storeLabel(o.product),
    url: until ? null : o.product.url,
    imageUrl: o.product.imageUrl ?? null,
    price: until ? null : o.analysis.price,
    referencePrice: until ? null : o.analysis.referencePrice,
    discountPct: o.analysis.discountPct,
    tier: o.analysis.tier,
    verified: o.analysis.verified,
    lowestIn90d: o.analysis.lowestInWindow,
    detectedAt: o.detectedAt.toISOString(),
  };
}

function scored(repo: Repo, offers: OfferRow[], now: Date) {
  const clicks = repo.clicksSince(new Date(now.getTime() - DAY_MS));
  return offers.map((o) => ({ o, base: offerScore({ analysis: o.analysis, category: o.product.category, detectedAt: o.detectedAt, recentClicks: clicks.get(o.product.id) ?? 0 }, now) }));
}

/** "Quentes agora": as melhores ofertas de 40% ou mais, iguais para todos. */
export function hotOffers(repo: Repo, plan: Plan, now: Date, limit = 10, categories?: readonly Category[]): OfferDTO[] {
  const offers = repo.activeOffers({ tier: 'hot' }).filter((o) => !categories || categories.includes(o.product.category));
  return scored(repo, offers, now)
    .sort((a, b) => b.base - a.base)
    .slice(0, limit)
    .map((x) => toDTO(x.o, plan, now));
}

/** "Pra você": todas as promoções, ordenadas pelo gosto do usuário. */
export function personalFeed(
  repo: Repo,
  userId: string,
  plan: Plan,
  now: Date,
  opts: { category?: Category; categories?: readonly Category[]; limit?: number } = {},
): OfferDTO[] {
  const events = repo.events(userId, new Date(now.getTime() - 90 * DAY_MS));
  const affinity = categoryAffinity(repo.categories(userId), events, now);
  const terms = recentSearchTerms(events, now);
  const offers = repo.activeOffers({ category: opts.category }).filter((o) => !opts.categories || opts.categories.includes(o.product.category));
  return scored(repo, offers, now)
    .map((x) => ({ o: x.o, s: personalScore(x.base, x.o.product.category, x.o.product.title, affinity, terms) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, opts.limit ?? 50)
    .map((x) => toDTO(x.o, plan, now));
}

export function search(repo: Repo, query: string, plan: Plan, now: Date): OfferDTO[] {
  const want = tokenize(query);
  if (want.length === 0) return [];
  const hits = repo.activeOffers().filter((o) => {
    const have = tokenize(o.product.title);
    // Aceita prefixo para a busca funcionar enquanto a pessoa digita ("air fr").
    return want.every((w) => have.some((h) => h.startsWith(w)));
  });
  return scored(repo, hits, now)
    .sort((a, b) => b.base - a.base)
    .map((x) => toDTO(x.o, plan, now));
}

const matches = (want: string[], title: string) => {
  if (want.length === 0) return true;
  const have = tokenize(title);
  return want.every((w) => have.some((h) => h.startsWith(w)));
};

export type BrowseSort = 'relevance' | 'discount' | 'price_asc' | 'price_desc' | 'newest';

/** Filtros da vitrine. Preços em centavos; `stores` são nomes de loja como aparecem no site ("Shopee"). */
export interface BrowseQuery {
  q?: string;
  stores?: string[];
  categories?: Category[];
  minPrice?: number;
  maxPrice?: number;
  minDiscount?: number;
  sort?: BrowseSort;
  limit?: number;
  offset?: number;
}

export interface BrowseResult {
  offers: OfferDTO[];
  total: number;
  /** Opções para os filtros, contadas sobre as ofertas que batem com busca, preço e desconto. */
  facets: { stores: Array<{ name: string; count: number }>; categories: Array<{ category: Category; count: number }> };
}

/** Vitrine com filtros: busca, loja, categoria, faixa de preço, desconto mínimo e ordem. */
export function browse(repo: Repo, userId: string, plan: Plan, now: Date, q: BrowseQuery): BrowseResult {
  const want = tokenize(q.q ?? '');
  const base = repo.activeOffers().filter(
    (o) =>
      matches(want, o.product.title) &&
      (q.minPrice == null || o.analysis.price >= q.minPrice) &&
      (q.maxPrice == null || o.analysis.price <= q.maxPrice) &&
      (q.minDiscount == null || o.analysis.discountPct >= q.minDiscount),
  );

  const storeCount = new Map<string, number>();
  const catCount = new Map<Category, number>();
  for (const o of base) {
    const s = storeLabel(o.product);
    storeCount.set(s, (storeCount.get(s) ?? 0) + 1);
    catCount.set(o.product.category, (catCount.get(o.product.category) ?? 0) + 1);
  }

  const filtered = base.filter(
    (o) => (!q.stores?.length || q.stores.includes(storeLabel(o.product))) && (!q.categories?.length || q.categories.includes(o.product.category)),
  );

  const sort = q.sort ?? 'relevance';
  let ordered: OfferRow[];
  if (sort === 'relevance') {
    const events = repo.events(userId, new Date(now.getTime() - 90 * DAY_MS));
    const affinity = categoryAffinity(repo.categories(userId), events, now);
    const terms = recentSearchTerms(events, now);
    ordered = scored(repo, filtered, now)
      .map((x) => ({ o: x.o, s: personalScore(x.base, x.o.product.category, x.o.product.title, affinity, terms) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.o);
  } else {
    const key: Record<Exclude<BrowseSort, 'relevance'>, (o: OfferRow) => number> = {
      discount: (o) => -o.analysis.discountPct,
      price_asc: (o) => o.analysis.price,
      price_desc: (o) => -o.analysis.price,
      newest: (o) => -o.detectedAt.getTime(),
    };
    ordered = [...filtered].sort((a, b) => key[sort](a) - key[sort](b));
  }

  const offset = q.offset ?? 0;
  const limit = q.limit ?? 40;
  return {
    offers: ordered.slice(offset, offset + limit).map((o) => toDTO(o, plan, now)),
    total: ordered.length,
    facets: {
      stores: [...storeCount].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      categories: [...catCount].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    },
  };
}

/** Busca entre todos os produtos acompanhados (com ou sem promoção), para vigiar qualquer um. */
export function searchProducts(repo: Repo, query: string, limit = 30): Array<{ id: string; title: string; storeName: string; imageUrl: string | null; price: number; category: Category }> {
  const want = tokenize(query);
  if (want.length === 0) return [];
  return repo
    .productsWithPrice()
    .filter((x) => matches(want, x.product.title))
    .sort((a, b) => a.price - b.price)
    .slice(0, limit)
    .map((x) => ({ id: x.product.id, title: x.product.title, storeName: storeLabel(x.product), imageUrl: x.product.imageUrl ?? null, price: x.price, category: x.product.category }));
}
