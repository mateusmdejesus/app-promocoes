import { describe, expect, it } from 'vitest';
import { InstagramClient } from '../src/instagram';

/** Graph API falsa: só a Página ligada ao Instagram devolve números. */
function fakeGraph() {
  const seen: string[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const auth = new Headers(init?.headers).get('authorization') ?? '';
    seen.push(auth);
    if (url.includes('/me/accounts')) {
      return Response.json({ data: [{ id: '1', name: 'Outra', access_token: 'PAGE-OUTRA' }, { id: '2', name: 'Mateus', access_token: 'PAGE-MATEUS', instagram_business_account: { id: '178' } }] });
    }
    if (url.includes('/178/media')) return Response.json({ data: [{ id: '9', caption: 'oi', media_type: 'VIDEO', media_product_type: 'REELS', timestamp: '2026-11-01T10:00:00+0000', permalink: 'p', thumbnail_url: 't', like_count: 5, comments_count: 2 }] });
    if (url.includes('/9/insights')) {
      if (auth !== 'Bearer PAGE-MATEUS') return Response.json({ error: { message: '(#10) sem permissão', code: 10 } }, { status: 400 });
      return Response.json({ data: [{ name: 'views', values: [{ value: 3207 }] }, { name: 'reach', values: [{ value: 2101 }] }, { name: 'saved', values: [{ value: 9 }] }, { name: 'shares', values: [{ value: 14 }] }] });
    }
    return Response.json({ error: { message: 'nope', code: 100 } }, { status: 400 });
  }) as typeof fetch;
  return { f, seen };
}

describe('Instagram do Estúdio', () => {
  it('troca o token de usuário pelo da Página ligada ao Instagram, guarda e traz os números', async () => {
    const g = fakeGraph();
    let saved: string | undefined;
    const ig = new InstagramClient('EAA-usuario', '178', g.f, 0, { get: () => saved, set: (t) => (saved = t) });
    expect(await ig.init()).toContain('Página "Mateus"');
    expect(saved).toBe('PAGE-MATEUS');
    const [m] = await ig.media(5);
    expect(m).toMatchObject({ likes: 5, comments: 2, insights: { views: 3207, reach: 2101, saved: 9, shares: 14 } });
    expect(ig.insightsAllowed).toBe(true);
  });

  it('sem conseguir trocar (token vencido), usa o token de Página guardado; sem permissão, números ficam null', async () => {
    const g = fakeGraph();
    const broken = (async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes('/me/accounts') ? Response.json({ error: { message: 'expirou', code: 190 } }, { status: 400 }) : g.f(input, init)) as typeof fetch;
    const ig = new InstagramClient('EAA-vencido', '178', broken, 0, { get: () => 'PAGE-MATEUS', set: () => undefined });
    expect(await ig.init()).toBe('token de Página guardado no banco');
    expect((await ig.media(5))[0]!.insights?.views).toBe(3207);

    const semPermissao = new InstagramClient('EAA-sistema', '178', broken, 0);
    await semPermissao.init();
    expect((await semPermissao.media(5))[0]!.insights).toBeNull();
    expect(semPermissao.insightsAllowed).toBe(false);
  });
});
