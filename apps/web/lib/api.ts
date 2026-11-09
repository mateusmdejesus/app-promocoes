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
export const token = {
  get: () => (typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY)),
  set: (t: string) => window.localStorage.setItem(TOKEN_KEY, t),
  clear: () => window.localStorage.removeItem(TOKEN_KEY),
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

export const api = {
  hot: (revalidate?: number) => call<{ offers: Offer[] }>('GET', '/v1/offers/hot', undefined, { revalidate }),
  feed: () => call<{ offers: Offer[] }>('GET', '/v1/feed'),
  /** Versão da oferta para quem está logado, buscada pelo próprio site (ver app/api/o). */
  offerForMe: async (id: string) => {
    const t = token.get();
    const res = await fetch(`/api/o/${encodeURIComponent(id)}`, { headers: t ? { Authorization: `Bearer ${t}` } : {}, cache: 'no-store' });
    if (!res.ok) throw new ApiError(res.status, 'Algo deu errado. Tente de novo.');
    return (await res.json()) as { offer: Offer };
  },
  offer: (id: string, revalidate?: number) =>
    call<{ offer: Offer; historyDays: number; history: Array<{ day: string; price: number }> }>('GET', `/v1/offers/${encodeURIComponent(id)}`, undefined, { revalidate }),
  me: () => call<Me>('GET', '/v1/me'),
  startEmail: (email: string) => call<void>('POST', '/v1/auth/email/start', { email }),
  verifyEmail: (email: string, code: string) => call<{ userId: string; token: string; isNew: boolean }>('POST', '/v1/auth/email/verify', { email, code }),
  logout: () => call<void>('POST', '/v1/auth/logout'),
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
