import type { DB } from './db';

/**
 * Acesso à API do Mercado Livre (OAuth). O acesso vence em ~6 h e cada renovação
 * devolve um refresh token NOVO, que substitui o anterior. Por isso o último refresh
 * token fica guardado no banco (volume /data): assim o servidor continua conectado
 * mesmo depois de reiniciar. Na primeira vez, usa o ML_REFRESH_TOKEN das variáveis.
 */
const TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';
const KEY = 'ml_refresh_token';
const DEFAULT_TTL_S = 21_600;

export interface MlAuthOptions {
  clientId: string;
  clientSecret: string;
  db: DB;
  bootstrapRefreshToken?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

interface TokenBody {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  message?: string;
}

async function postToken(f: typeof fetch, body: Record<string, string>): Promise<TokenBody & { ok: boolean; status: number }> {
  const res = await f(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(body),
  });
  const json = (await res.json().catch(() => ({}))) as TokenBody;
  return { ...json, ok: res.ok, status: res.status };
}

export class MercadoLivreAuth {
  private cache: { token: string; expiresAt: number } | null = null;
  private inflight: Promise<string> | null = null;

  constructor(private o: MlAuthOptions) {}

  private now(): number {
    return this.o.now ? this.o.now() : Date.now();
  }

  private storedRefresh(): string | undefined {
    const r = this.o.db.prepare('SELECT v FROM kv WHERE k = ?').get(KEY) as { v: string } | undefined;
    return r?.v ?? this.o.bootstrapRefreshToken;
  }

  private saveRefresh(token: string): void {
    this.o.db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(KEY, token);
  }

  /** Devolve um acesso válido, renovando quando faltar menos de 1 minuto para vencer. */
  accessToken(): Promise<string> {
    if (this.cache && this.cache.expiresAt - 60_000 > this.now()) return Promise.resolve(this.cache.token);
    // Várias buscas ao mesmo tempo compartilham uma única renovação.
    this.inflight ??= this.refresh().finally(() => (this.inflight = null));
    return this.inflight;
  }

  private async refresh(): Promise<string> {
    const refresh = this.storedRefresh();
    if (!refresh) throw new Error('Mercado Livre não conectado: defina ML_REFRESH_TOKEN (ver README).');
    const f = this.o.fetchImpl ?? fetch;
    const body = await postToken(f, {
      grant_type: 'refresh_token',
      client_id: this.o.clientId,
      client_secret: this.o.clientSecret,
      refresh_token: refresh,
    });
    if (!body.ok || !body.access_token || !body.refresh_token) {
      throw new Error(`Mercado Livre recusou a renovação (${body.status}${body.message ? `: ${body.message}` : ''}).`);
    }
    this.saveRefresh(body.refresh_token);
    this.cache = { token: body.access_token, expiresAt: this.now() + (body.expires_in ?? DEFAULT_TTL_S) * 1000 };
    return body.access_token;
  }
}

/** Troca o código de autorização (uma vez só) pelo primeiro refresh token. Usado pelo script ml:connect. */
export async function exchangeAuthorizationCode(opts: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): Promise<{ refreshToken: string; accessToken: string }> {
  const f = opts.fetchImpl ?? fetch;
  const body = await postToken(f, {
    grant_type: 'authorization_code',
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    code: opts.code,
    redirect_uri: opts.redirectUri,
  });
  if (!body.ok || !body.access_token || !body.refresh_token) {
    throw new Error(`Mercado Livre recusou o código (${body.status}${body.message ? `: ${body.message}` : ''}). Os códigos valem uma vez e por pouco tempo.`);
  }
  return { refreshToken: body.refresh_token, accessToken: body.access_token };
}
