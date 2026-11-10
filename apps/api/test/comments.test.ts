import { describe, expect, it } from 'vitest';
import { classifyByRules, templateReplies } from '../src/commentAi';
import { openDb } from '../src/db';
import { InstagramClient } from '../src/instagram';
import { LogEmailSender } from '../src/auth';
import { Repo } from '../src/repo';
import { buildServer } from '../src/server';

describe('classificação por regras', () => {
  it.each([
    ['isso é golpe, não chegou nada', 'reclamacao', 'alta'],
    ['manda o link pfv', 'lead', 'alta'],
    ['como funciona o aviso?', 'pergunta', 'media'],
    ['brabo demais 🔥', 'elogio', 'baixa'],
    ['ganhe dinheiro em casa, olha meu perfil', 'spam', 'baixa'],
    ['kkkk', 'outro', 'baixa'],
  ])('%s → %s', (text, label, priority) => {
    expect(classifyByRules(text)).toEqual({ label, priority });
  });

  it('respostas prontas começam com o @ e spam não tem resposta', () => {
    for (const r of templateReplies({ username: 'ana', label: 'lead' })) expect(r.startsWith('@ana ')).toBe(true);
    expect(templateReplies({ username: 'x', label: 'spam' })).toEqual([]);
  });
});

/** Instagram falso com um post e três comentários (um já respondido pelo dono). */
function fakeIg() {
  const calls: string[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url.includes('/178/media')) return Response.json({ data: [{ id: '9', caption: 'Achado do dia', media_type: 'VIDEO', media_product_type: 'REELS', timestamp: '2026-11-01T10:00:00+0000', permalink: 'p', like_count: 5, comments_count: 3 }] });
    if (url.includes('/9/insights')) return Response.json({ data: [] });
    if (url.includes('/178?')) return Response.json({ id: '178', username: 'mateusmjesus' });
    if (url.includes('/9/comments'))
      return Response.json({
        data: [
          { id: '1', text: 'isso é golpe', username: 'bia', timestamp: '2026-11-01T11:00:00+0000' },
          { id: '2', text: 'manda o link', username: 'caio', timestamp: '2026-11-01T12:00:00+0000', replies: { data: [{ id: '20', text: '@caio na bio!', username: 'mateusmjesus', timestamp: 'x' }] } },
          { id: '3', text: 'top demais', username: 'duda', timestamp: '2026-11-01T13:00:00+0000' },
        ],
      });
    if (init?.method === 'POST') return Response.json({ id: '99', success: true });
    return Response.json({ error: { message: 'nope', code: 100 } }, { status: 400 });
  }) as typeof fetch;
  return { client: new InstagramClient('EAA-x', '178', f, 0), calls };
}

describe('Estúdio: caixa de comentários', () => {
  it('classifica, marca o que já foi respondido, muda situação, esconde e sugere respostas', async () => {
    const repo = new Repo(openDb(':memory:'));
    const { client, calls } = fakeIg();
    const app = buildServer(repo, { email: new LogEmailSender(), adminApiKey: 'k', instagram: client });
    const h = { 'x-admin-key': 'k' };

    const inbox = (await app.inject({ method: 'GET', url: '/v1/admin/instagram/inbox', headers: h })).json();
    expect(inbox.aiEnabled).toBe(false);
    const byId = Object.fromEntries(inbox.comments.map((c: { id: string }) => [c.id, c]));
    expect(byId['1']).toMatchObject({ label: 'reclamacao', priority: 'alta', status: 'novo' });
    expect(byId['2']).toMatchObject({ label: 'lead', status: 'respondido', answeredByMe: true });
    expect(byId['3']).toMatchObject({ label: 'elogio', status: 'novo' });
    expect(inbox.posts[0]).toMatchObject({ id: '9', novos: 2, labels: { reclamacao: 1, lead: 1, elogio: 1 } });

    // Corrigir o tipo e marcar como feito.
    await app.inject({ method: 'POST', url: '/v1/admin/instagram/comments/state', headers: h, payload: { ids: ['3'], status: 'ignorado', label: 'pergunta' } });
    // Esconder tira da fila.
    expect((await app.inject({ method: 'POST', url: '/v1/admin/instagram/comments/1/hide', headers: h, payload: { hide: true } })).statusCode).toBe(200);
    expect(calls.some((c) => c.startsWith('POST') && c.includes('/1?hide=true'))).toBe(true);
    const again = (await app.inject({ method: 'GET', url: '/v1/admin/instagram/inbox', headers: h })).json();
    const st = Object.fromEntries(again.comments.map((c: { id: string; status: string; label: string }) => [c.id, `${c.status}/${c.label}`]));
    expect(st).toEqual({ '1': 'ignorado/reclamacao', '2': 'respondido/lead', '3': 'ignorado/pergunta' });

    const sug = (await app.inject({ method: 'POST', url: '/v1/admin/instagram/comments/1/suggest', headers: h, payload: { mediaId: '9' } })).json();
    expect(sug.ai).toBe(false);
    expect(sug.suggestions).toHaveLength(3);
    expect(sug.suggestions[0]).toMatch(/^@bia /);

    // Sem ser administrador, nada.
    expect((await app.inject({ method: 'GET', url: '/v1/admin/instagram/inbox' })).statusCode).toBe(404);
  });
});

describe('Estúdio: IA ligada depois', () => {
  it('reclassifica o que foi marcado por regra, mas respeita o tipo corrigido à mão', async () => {
    const repo = new Repo(openDb(':memory:'));
    const { client } = fakeIg();
    const h = { 'x-admin-key': 'k' };
    const semIa = buildServer(repo, { email: new LogEmailSender(), adminApiKey: 'k', instagram: client });
    await semIa.inject({ method: 'GET', url: '/v1/admin/instagram/inbox', headers: h });
    await semIa.inject({ method: 'POST', url: '/v1/admin/instagram/comments/state', headers: h, payload: { ids: ['3'], label: 'pergunta' } });

    const fakeAi = { classify: async (cs: Array<{ id: string }>) => new Map(cs.map((c) => [c.id, { label: 'lead' as const, priority: 'alta' as const }])), suggest: async () => [] };
    const comIa = buildServer(repo, { email: new LogEmailSender(), adminApiKey: 'k', instagram: client, commentAi: fakeAi as never });
    const inbox = (await comIa.inject({ method: 'GET', url: '/v1/admin/instagram/inbox', headers: h })).json();
    const got = Object.fromEntries(inbox.comments.map((c: { id: string; label: string; byAi: boolean }) => [c.id, `${c.label}/${c.byAi}`]));
    expect(got).toEqual({ '1': 'lead/true', '2': 'lead/true', '3': 'pergunta/false' });
  });
});
