import type { Category, StoreId, Tier } from '@keropromo/core';

/** Endereço da API. Em desenvolvimento, use o IP da sua máquina na rede local. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3333';

export interface Offer {
  id: string;
  title: string;
  category: Category;
  store: StoreId;
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

export interface Alert {
  id: string;
  term: string;
  maxPrice: number | null;
  minTier: Tier;
  stores: StoreId[];
  enabled: boolean;
}

export type NewAlert = Omit<Alert, 'id' | 'maxPrice'> & { maxPrice?: number };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function createApi(getSecret: () => string | null) {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const secret = getSecret();
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return undefined as T;
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new ApiError(res.status, typeof json.error === 'string' ? json.error : 'Algo deu errado.');
    return json as T;
  }

  return {
    register: () => call<{ userId: string; secret: string }>('POST', '/v1/users'),
    updateMe: (patch: { categories?: Category[]; pushToken?: string | null }) => call<{ categories: Category[] }>('PUT', '/v1/me', patch),
    me: () => call<{ userId: string; categories: Category[] }>('GET', '/v1/me'),
    hot: () => call<{ offers: Offer[] }>('GET', '/v1/offers/hot'),
    feed: (category?: Category) => call<{ offers: Offer[] }>('GET', `/v1/feed${category ? `?category=${category}` : ''}`),
    search: (q: string) => call<{ offers: Offer[] }>('GET', `/v1/search?q=${encodeURIComponent(q)}`),
    offer: (id: string) => call<{ offer: Offer; history: Array<{ day: string; price: number }> }>('GET', `/v1/offers/${encodeURIComponent(id)}`),
    event: (kind: 'view' | 'click_out' | 'save' | 'dismiss', productId: string) => call<void>('POST', '/v1/events', { kind, productId }),
    alerts: () => call<{ alerts: Alert[] }>('GET', '/v1/alerts'),
    createAlert: (a: NewAlert) => call<{ alert: Alert }>('POST', '/v1/alerts', a),
    updateAlert: (id: string, patch: Partial<NewAlert>) => call<{ alert: Alert }>('PATCH', `/v1/alerts/${id}`, patch),
    deleteAlert: (id: string) => call<void>('DELETE', `/v1/alerts/${id}`),
  };
}

export type Api = ReturnType<typeof createApi>;

export function timeAgo(iso: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}
