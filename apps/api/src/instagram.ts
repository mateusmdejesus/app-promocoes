/**
 * Instagram da conta de Criador (Graph API da Meta, login unificado).
 * O token do "usuário do sistema" começa com EAA/EAG e funciona em graph.facebook.com;
 * um token do login do Instagram (IGAA) funciona em graph.instagram.com.
 *
 * Números por post (visualizações, alcance, salvamentos, compartilhamentos) dependem da
 * permissão instagram_manage_insights. Sem ela, a Meta responde erro #10 e o Estúdio mostra
 * os números como indisponíveis, sem quebrar o resto.
 */

export interface IgAccount {
  id: string;
  username: string;
  name?: string;
  followers: number;
  follows: number;
  mediaCount: number;
  pictureUrl?: string;
}

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

export interface IgComment {
  id: string;
  text: string;
  username: string;
  timestamp: string;
  likes: number;
  hidden: boolean;
  replies: Array<{ id: string; text: string; username: string; timestamp: string }>;
}

const VERSION = 'v23.0';
const MEDIA_INSIGHTS = ['views', 'reach', 'saved', 'shares', 'total_interactions'] as const;

export class InstagramClient {
  private host: string;
  private cache = new Map<string, { at: number; value: unknown }>();
  /** null = ainda não sabemos; false = a Meta recusou (falta instagram_manage_insights). */
  insightsAllowed: boolean | null = null;
  private insightsDeniedAt = 0;

  constructor(
    private token: string,
    private userId: string,
    private fetchImpl: typeof fetch = fetch,
    private cacheMs = 5 * 60_000,
    /** Onde guardar o token permanente da Página (sobrevive a reinícios e ao vencimento do token de 60 dias). */
    private store?: { get(): string | undefined; set(token: string): void },
  ) {
    this.host = token.startsWith('IG') ? 'https://graph.instagram.com' : 'https://graph.facebook.com';
  }

  /**
   * Token de usuário do Facebook vence (1 h, ou 60 dias se estendido). O token da Página ligada ao
   * Instagram, tirado de um token de 60 dias, não vence. Aqui trocamos um pelo outro e guardamos.
   * Se não der (token já vencido, por exemplo), usamos o token de Página guardado antes.
   */
  async init(): Promise<string> {
    if (this.host.includes('graph.instagram.com')) return 'token do Instagram (graph.instagram.com)';
    try {
      const r = await this.call<{ data: Array<{ id: string; name: string; access_token?: string; instagram_business_account?: { id: string } }> }>('me/accounts', {
        params: { fields: 'id,name,access_token,instagram_business_account', limit: '100' },
      });
      const page = r.data.find((p) => p.instagram_business_account?.id === this.userId && p.access_token);
      if (page?.access_token) {
        this.token = page.access_token;
        this.store?.set(page.access_token);
        return `token da Página "${page.name}" (não vence)`;
      }
    } catch {
      // Token de usuário vencido ou de usuário do sistema (que já não vence): segue abaixo.
    }
    const saved = this.store?.get();
    if (saved && saved !== this.token) {
      this.token = saved;
      return 'token de Página guardado no banco';
    }
    return 'token configurado em IG_ACCESS_TOKEN';
  }

  private async call<T>(path: string, init: { method?: string; params?: Record<string, string> } = {}): Promise<T> {
    const qs = init.params ? `?${new URLSearchParams(init.params)}` : '';
    const res = await this.fetchImpl(`${this.host}/${VERSION}/${path}${qs}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${this.token}` },
    });
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & T;
    if (!res.ok || body.error) {
      const err = new Error(`Instagram: ${body.error?.message ?? res.status}`) as Error & { code?: number };
      err.code = body.error?.code;
      throw err;
    }
    return body;
  }

  private async cached<T>(key: string, fn: () => Promise<T>, fresh = false): Promise<T> {
    const hit = this.cache.get(key);
    if (!fresh && hit && Date.now() - hit.at < this.cacheMs) return hit.value as T;
    const value = await fn();
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  account(fresh = false): Promise<IgAccount> {
    return this.cached(
      'account',
      async () => {
        const a = await this.call<{ id: string; username: string; name?: string; followers_count?: number; follows_count?: number; media_count?: number; profile_picture_url?: string }>(this.userId, {
          params: { fields: 'id,username,name,followers_count,follows_count,media_count,profile_picture_url' },
        });
        return { id: a.id, username: a.username, name: a.name, followers: a.followers_count ?? 0, follows: a.follows_count ?? 0, mediaCount: a.media_count ?? 0, pictureUrl: a.profile_picture_url };
      },
      fresh,
    );
  }

  /** Números de um post. null quando a Meta não libera (sem permissão ou post antigo demais). */
  async insights(mediaId: string): Promise<IgInsights | null> {
    if (this.insightsAllowed === false && Date.now() - this.insightsDeniedAt < 3_600_000) return null;
    try {
      const r = await this.call<{ data: Array<{ name: string; values?: Array<{ value: number }>; total_value?: { value: number } }> }>(`${mediaId}/insights`, {
        params: { metric: MEDIA_INSIGHTS.join(',') },
      });
      this.insightsAllowed = true;
      const get = (n: string) => {
        const m = r.data.find((x) => x.name === n);
        return m ? (m.total_value?.value ?? m.values?.[0]?.value) : undefined;
      };
      return { views: get('views'), reach: get('reach'), saved: get('saved'), shares: get('shares'), totalInteractions: get('total_interactions') };
    } catch (e) {
      if ((e as { code?: number }).code === 10) {
        this.insightsAllowed = false;
        this.insightsDeniedAt = Date.now();
      }
      return null;
    }
  }

  /** Últimos posts com curtidas, comentários e (se liberado) os números. */
  media(limit = 24, fresh = false): Promise<IgMedia[]> {
    return this.cached(
      `media:${limit}`,
      async () => {
        const r = await this.call<{
          data: Array<{ id: string; caption?: string; media_type: string; media_product_type?: string; timestamp: string; permalink: string; thumbnail_url?: string; media_url?: string; like_count?: number; comments_count?: number }>;
        }>(`${this.userId}/media`, {
          params: { fields: 'id,caption,media_type,media_product_type,timestamp,permalink,thumbnail_url,media_url,like_count,comments_count', limit: String(limit) },
        });
        // Números de todos os posts ao mesmo tempo (um pedido por post).
        const insights = await Promise.all(r.data.map((m) => this.insights(m.id)));
        const out: IgMedia[] = [];
        for (const [i, m] of r.data.entries()) {
          out.push({
            id: m.id,
            caption: m.caption ?? '',
            type: m.media_type,
            productType: m.media_product_type ?? '',
            timestamp: m.timestamp,
            permalink: m.permalink,
            thumbnailUrl: m.thumbnail_url ?? (m.media_type === 'VIDEO' ? undefined : m.media_url),
            likes: m.like_count ?? 0,
            comments: m.comments_count ?? 0,
            insights: insights[i] ?? null,
          });
        }
        return out;
      },
      fresh,
    );
  }

  comments(mediaId: string, fresh = false): Promise<IgComment[]> {
    return this.cached(
      `comments:${mediaId}`,
      async () => {
        const r = await this.call<{
          data: Array<{ id: string; text: string; username?: string; timestamp: string; like_count?: number; hidden?: boolean; replies?: { data: Array<{ id: string; text: string; username?: string; timestamp: string }> } }>;
        }>(`${mediaId}/comments`, { params: { fields: 'id,text,username,timestamp,like_count,hidden,replies{id,text,username,timestamp}', limit: '50' } });
        return r.data.map((c) => ({
          id: c.id,
          text: c.text,
          username: c.username ?? '',
          timestamp: c.timestamp,
          likes: c.like_count ?? 0,
          hidden: c.hidden === true,
          replies: (c.replies?.data ?? []).map((x) => ({ id: x.id, text: x.text, username: x.username ?? '', timestamp: x.timestamp })),
        }));
      },
      fresh,
    );
  }

  async reply(commentId: string, message: string): Promise<{ id: string }> {
    const r = await this.call<{ id: string }>(`${commentId}/replies`, { method: 'POST', params: { message } });
    // O próximo carregamento dos comentários já vem com a resposta.
    this.dropComments();
    return r;
  }

  /** Esconde (ou mostra de novo) um comentário no post. Quem comentou não fica sabendo. */
  async hide(commentId: string, hide: boolean): Promise<void> {
    await this.call(commentId, { method: 'POST', params: { hide: String(hide) } });
    this.dropComments();
  }

  private dropComments() {
    for (const k of [...this.cache.keys()]) if (k.startsWith('comments:')) this.cache.delete(k);
  }
}
