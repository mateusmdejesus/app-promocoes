import type { Category, Plan, StoreId, Tier } from '@keropromo/core';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://app-promocoes-production.up.railway.app';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://keropromo.com.br';

export interface Offer {
  id: string;
  title: string;
  category: Category;
  store: StoreId;
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

/** Produto na página "Vigiando". Preços em centavos. */
export interface Watch {
  id: string;
  title: string;
  category: Category;
  storeName: string;
  imageUrl: string | null;
  url: string | null;
  price: number | null;
  lowestPrice: number | null;
  targetPrice: number | null;
  reached: boolean;
  locked: boolean;
  offer: { discountPct: number; tier: Tier } | null;
  watchedAt: string;
}

export interface ProductHit {
  id: string;
  title: string;
  storeName: string;
  imageUrl: string | null;
  price: number | null;
  category: Category;
  locked: boolean;
  watching: boolean;
}

export type BrowseSort = 'relevance' | 'discount' | 'price_asc' | 'price_desc' | 'newest';

export interface BrowseFilters {
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
  offers: Offer[];
  total: number;
  facets: { stores: Array<{ name: string; count: number }>; categories: Array<{ category: Category; count: number }> };
}

export type PostSlot = '12h' | '19h';
export type PostFormat = 'achado' | 'gica';
export type PostStatus = 'ideia' | 'roteiro' | 'gravado' | 'postado';

/** Post do cronograma do Estúdio. */
export interface Post {
  id: string;
  date: string;
  slot: PostSlot;
  format: PostFormat;
  theme: string | null;
  title: string;
  hook: string | null;
  script: string | null;
  caption: string | null;
  hashtags: string | null;
  filming: string | null;
  productId: string | null;
  status: PostStatus;
  notes: string | null;
  updatedAt: string;
}

export type Deal = Offer & { pageUrl: string; lowest90: number | null; historyDays: number };

export interface IgInsights {
  views?: number;
  reach?: number;
  saved?: number;
  shares?: number;
  totalInteractions?: number;
}
export interface IgMedia {
  id: string;
  caption: string;
  type: string;
  productType: string;
  timestamp: string;
  permalink: string;
  thumbnailUrl?: string;
  likes: number;
  comments: number;
  insights: IgInsights | null;
}
export interface IgOverview {
  account: { id: string; username: string; name?: string; followers: number; follows: number; mediaCount: number; pictureUrl?: string };
  media: IgMedia[];
  insightsAvailable: boolean;
  totals: { posts: number; likes: number; comments: number; views: number | null; reach: number | null; saved: number | null; shares: number | null };
}
export interface IgComment {
  id: string;
  text: string;
  username: string;
  timestamp: string;
  likes: number;
  replies: Array<{ id: string; text: string; username: string; timestamp: string }>;
}

export interface Me {
  userId: string;
  email: string | null;
  identified: boolean;
  plan: Plan;
  proUntil: string | null;
  categories: Category[];
}

export interface PixCharge {
  id: string;
  period: 'monthly' | 'yearly';
  amount: number;
  qrCode: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';
  expiresAt: string;
  test: boolean;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const TOKEN_KEY = 'keropromo.token';
/** Cookie só de sinal (sem o token): avisa o servidor do site que a pessoa entrou (ver middleware.ts). */
export const SIGNED_IN_COOKIE = 'kp_in';
export const token = {
  get: () => (typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY)),
  set: (t: string) => {
    window.localStorage.setItem(TOKEN_KEY, t);
    document.cookie = `${SIGNED_IN_COOKIE}=1; path=/; max-age=31536000; samesite=lax; secure`;
  },
  clear: () => {
    window.localStorage.removeItem(TOKEN_KEY);
    document.cookie = `${SIGNED_IN_COOKIE}=; path=/; max-age=0; samesite=lax; secure`;
  },
};

export async function call<T>(method: string, path: string, body?: unknown, init?: { auth?: boolean; revalidate?: number }): Promise<T> {
  const t = init?.auth === false ? null : token.get();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    ...(init?.revalidate !== undefined ? { next: { revalidate: init.revalidate } } : { cache: 'no-store' as const }),
  });
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, json.error && json.error !== 'invalid_request' ? json.error : 'Algo deu errado. Tente de novo.');
  return json as T;
}

/** Filtros das listas: até 60 ofertas e só algumas categorias (ex.: aba "Casa e eletro"). */
export interface ListQuery {
  limit?: number;
  categories?: readonly string[];
}
const qs = (q?: ListQuery) => {
  const p = new URLSearchParams();
  if (q?.limit) p.set('limit', String(q.limit));
  if (q?.categories?.length) p.set('categories', q.categories.join(','));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  hot: (revalidate?: number, q?: ListQuery) => call<{ offers: Offer[] }>('GET', `/v1/offers/hot${qs(q)}`, undefined, { revalidate }),
  feed: (q?: ListQuery) => call<{ offers: Offer[] }>('GET', `/v1/feed${qs(q)}`),
  /** Versão da oferta para quem está logado, buscada pelo próprio site (ver app/api/o). */
  offerForMe: async (id: string) => {
    const t = token.get();
    const res = await fetch(`/api/o/${encodeURIComponent(id)}`, { headers: t ? { Authorization: `Bearer ${t}` } : {}, cache: 'no-store' });
    if (!res.ok) throw new ApiError(res.status, 'Algo deu errado. Tente de novo.');
    return (await res.json()) as { offer: Offer; watching: { targetPrice: number | null } | null };
  },
  offer: (id: string, revalidate?: number) =>
    call<{ offer: Offer; historyDays: number; history: Array<{ day: string; price: number }> }>('GET', `/v1/offers/${encodeURIComponent(id)}`, undefined, { revalidate }),
  me: () => call<Me>('GET', '/v1/me'),
  adminMe: () => call<{ admin: true }>('GET', '/v1/admin/me'),
  adminPosts: (from: string, to: string) => call<{ posts: Post[] }>('GET', `/v1/admin/posts?from=${from}&to=${to}`),
  savePost: (date: string, slot: PostSlot, body: Partial<Omit<Post, 'id' | 'date' | 'slot' | 'updatedAt'>>) =>
    call<{ post: Post }>('PUT', `/v1/admin/posts/${date}/${slot}`, body),
  instagram: (fresh = false) => call<IgOverview>('GET', `/v1/admin/instagram?limit=24${fresh ? '&fresh=1' : ''}`),
  igComments: (mediaId: string, fresh = false) => call<{ comments: IgComment[] }>('GET', `/v1/admin/instagram/media/${mediaId}/comments${fresh ? '?fresh=1' : ''}`),
  igReply: (commentId: string, message: string) => call<{ id: string }>('POST', `/v1/admin/instagram/comments/${commentId}/reply`, { message }),
  adminDeals: (limit = 8) => call<{ deals: Deal[] }>('GET', `/v1/admin/deals?limit=${limit}`),
  browse: (f: BrowseFilters) => {
    const p = new URLSearchParams();
    if (f.q) p.set('q', f.q);
    if (f.stores?.length) p.set('stores', f.stores.join(','));
    if (f.categories?.length) p.set('categories', f.categories.join(','));
    if (f.minPrice != null) p.set('minPrice', String(f.minPrice));
    if (f.maxPrice != null) p.set('maxPrice', String(f.maxPrice));
    if (f.minDiscount) p.set('minDiscount', String(f.minDiscount));
    if (f.sort) p.set('sort', f.sort);
    p.set('limit', String(f.limit ?? 60));
    if (f.offset) p.set('offset', String(f.offset));
    return call<BrowseResult>('GET', `/v1/browse?${p}`);
  },
  watches: () => call<{ watches: Watch[]; limits: { targets: number } }>('GET', '/v1/watches'),
  /** `targetPrice` em centavos; `null` tira a meta; sem o campo, só salva. */
  saveWatch: (productId: string, targetPrice?: number | null) =>
    call<void>('PUT', `/v1/watches/${encodeURIComponent(productId)}`, targetPrice === undefined ? {} : { targetPrice }),
  deleteWatch: (productId: string) => call<void>('DELETE', `/v1/watches/${encodeURIComponent(productId)}`),
  searchProducts: (q: string) => call<{ products: ProductHit[] }>('GET', `/v1/products/search?q=${encodeURIComponent(q)}`),
  startEmail: (email: string) => call<void>('POST', '/v1/auth/email/start', { email }),
  verifyEmail: (email: string, code: string) => call<{ userId: string; token: string; isNew: boolean }>('POST', '/v1/auth/email/verify', { email, code }),
  logout: () => call<void>('POST', '/v1/auth/logout'),
  deleteAccount: () => call<void>('DELETE', '/v1/me'),
  createPix: (period: 'monthly' | 'yearly') => call<{ charge: PixCharge }>('POST', '/v1/billing/pix', { period }),
  pix: (id: string) => call<{ charge: PixCharge; plan: Plan }>('GET', `/v1/billing/pix/${id}`),
  devPayPix: (id: string) => call<{ plan: Plan }>('POST', `/v1/dev/pix/${id}/pay`),
  event: (kind: 'view' | 'click_out', productId: string) => call<void>('POST', '/v1/events', { kind, productId }),
};

export function brl(cents: number): string {
  const v = cents / 100;
  return `R$ ${Number.isInteger(v) ? v.toLocaleString('pt-BR') : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
}

export function unlockLabel(iso: string, now = Date.now()): string {
  const min = Math.max(1, Math.ceil((new Date(iso).getTime() - now) / 60_000));
  return `Libera em ${min} min`;
}
