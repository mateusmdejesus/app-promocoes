import { categoryAffinity, offerScore, personalScore, recentSearchTerms, STORE_NAMES, tokenize, type Category, type Tier } from '@keropromo/core';
import type { OfferRow, Repo } from './repo';

const DAY_MS = 86_400_000;

/** O formato que o app recebe. Preços em centavos. */
export interface OfferDTO {
  id: string;
  title: string;
  category: Category;
  store: string;
  storeName: string;
  url: string;
  imageUrl: string | null;
  price: number;
  referencePrice: number;
  discountPct: number;
  tier: Tier;
  verified: boolean;
  lowestIn90d: boolean;
  detectedAt: string;
}

export function toDTO(o: OfferRow): OfferDTO {
  return {
    id: o.product.id,
    title: o.product.title,
    category: o.product.category,
    store: o.product.store,
    storeName: STORE_NAMES[o.product.store],
    url: o.product.url,
    imageUrl: o.product.imageUrl ?? null,
    price: o.analysis.price,
    referencePrice: o.analysis.referencePrice,
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
export function hotOffers(repo: Repo, now: Date, limit = 10): OfferDTO[] {
  return scored(repo, repo.activeOffers({ tier: 'hot' }), now)
    .sort((a, b) => b.base - a.base)
    .slice(0, limit)
    .map((x) => toDTO(x.o));
}

/** "Pra você": todas as promoções, ordenadas pelo gosto do usuário. */
export function personalFeed(repo: Repo, userId: string, now: Date, opts: { category?: Category; limit?: number } = {}): OfferDTO[] {
  const events = repo.events(userId, new Date(now.getTime() - 90 * DAY_MS));
  const affinity = categoryAffinity(repo.categories(userId), events, now);
  const terms = recentSearchTerms(events, now);
  return scored(repo, repo.activeOffers({ category: opts.category }), now)
    .map((x) => ({ o: x.o, s: personalScore(x.base, x.o.product.category, x.o.product.title, affinity, terms) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, opts.limit ?? 50)
    .map((x) => toDTO(x.o));
}

export function search(repo: Repo, query: string, now: Date): OfferDTO[] {
  const want = tokenize(query);
  if (want.length === 0) return [];
  const hits = repo.activeOffers().filter((o) => {
    const have = tokenize(o.product.title);
    // Aceita prefixo para a busca funcionar enquanto a pessoa digita ("air fr").
    return want.every((w) => have.some((h) => h.startsWith(w)));
  });
  return scored(repo, hits, now)
    .sort((a, b) => b.base - a.base)
    .map((x) => toDTO(x.o));
}
