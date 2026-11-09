import type { BillingPeriod, Category, Plan, StoreId, Tier } from '@keropromo/core';

/** Endereço da API. Em desenvolvimento, use o IP da sua máquina na rede local. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3333';

export interface Offer {
  id: string;
  title: string;
  category: Category;
  store: StoreId;
  storeName: string;
  /** null quando `locked`: oferta quente ainda reservada ao Pro. */
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

export interface Alert {
  id: string;
  term: string;
  maxPrice: number | null;
  minTier: Tier;
  stores: StoreId[];
  enabled: boolean;
}

export interface Me {
  userId: string;
  email: string | null;
  hasApple: boolean;
  identified: boolean;
  plan: Plan;
  proUntil: string | null;
  limits: { alerts: number; historyDays: number; hotDelayMin: number; hotPush: boolean; checksPerMonth: number | null };
  categories: Category[];
}

export interface Session {
  userId: string;
  token: string;
  isNew: boolean;
}

export type NewAlert = Omit<Alert, 'id' | 'maxPrice'> & { maxPrice?: number };

export class ApiError extends Error {
  constructor(public status: number, message: string, public upgrade = false) {
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
    const json = (await res.json().catch(() => ({}))) as { error?: string; upgrade?: boolean };
    if (!res.ok) throw new ApiError(res.status, typeof json.error === 'string' && json.error !== 'invalid_request' ? json.error : 'Algo deu errado.', !!json.upgrade);
    return json as T;
  }

  return {
    register: () => call<{ userId: string; secret: string }>('POST', '/v1/users'),
    updateMe: (patch: { categories?: Category[]; pushToken?: string | null }) => call<{ categories: Category[] }>('PUT', '/v1/me', patch),
    me: () => call<Me>('GET', '/v1/me'),
    deleteMe: () => call<void>('DELETE', '/v1/me'),
    startEmail: (email: string) => call<void>('POST', '/v1/auth/email/start', { email }),
    verifyEmail: (email: string, code: string) => call<Session>('POST', '/v1/auth/email/verify', { email, code }),
    signInApple: (identityToken: string) => call<Session>('POST', '/v1/auth/apple', { identityToken }),
    logout: () => call<void>('POST', '/v1/auth/logout'),
    devGrantPro: (period: BillingPeriod) => call<{ plan: Plan }>('POST', '/v1/dev/grant-pro', { period }),
    hot: () => call<{ offers: Offer[] }>('GET', '/v1/offers/hot'),
    feed: (category?: Category) => call<{ offers: Offer[] }>('GET', `/v1/feed${category ? `?category=${category}` : ''}`),
    search: (q: string) => call<{ offers: Offer[] }>('GET', `/v1/search?q=${encodeURIComponent(q)}`),
    offer: (id: string) => call<{ offer: Offer; historyDays: number; history: Array<{ day: string; price: number }> }>('GET', `/v1/offers/${encodeURIComponent(id)}`),
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

/** "Libera em 42 min" / "Libera às 21:23". */
export function unlockLabel(iso: string, now = Date.now()): string {
  const min = Math.max(1, Math.ceil((new Date(iso).getTime() - now) / 60_000));
  return min < 60 ? `Libera em ${min} min` : `Libera às ${new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}
