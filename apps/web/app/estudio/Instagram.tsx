'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, type IgComment, type IgMedia, type IgOverview } from '../../lib/api';
import s from './estudio.module.css';

const num = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('pt-BR'));
const date = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const pct = (a?: number, b?: number) => (a != null && b ? `${((a / b) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—');
const kind = (m: IgMedia) => (m.productType === 'REELS' ? 'Reels' : m.type === 'CAROUSEL_ALBUM' ? 'Carrossel' : m.type === 'IMAGE' ? 'Foto' : 'Vídeo');
const firstLine = (c: string) => c.split('\n')[0]!.slice(0, 90) || 'Sem legenda';

/** Carrega a conta e os posts uma vez para as duas abas (Instagram e Comentários). */
export function useInstagram() {
  const [data, setData] = useState<IgOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = (fresh = false) => {
    setLoading(true);
    setError(null);
    api
      .instagram(fresh)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Não deu para falar com o Instagram agora.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => load(), []);
  return { data, error, loading, reload: () => load(true) };
}

type Ig = ReturnType<typeof useInstagram>;

export function InstagramView({ ig }: { ig: Ig }) {
  const { data, error, loading, reload } = ig;
  const [sort, setSort] = useState<'recent' | 'views' | 'engagement'>('recent');
  const media = useMemo(() => {
    const list = [...(data?.media ?? [])];
    const eng = (m: IgMedia) => (m.insights?.reach ? (m.insights.totalInteractions ?? m.likes + m.comments) / m.insights.reach : 0);
    if (sort === 'views') list.sort((a, b) => (b.insights?.views ?? 0) - (a.insights?.views ?? 0));
    if (sort === 'engagement') list.sort((a, b) => eng(b) - eng(a));
    return list;
  }, [data, sort]);

  if (error) return <IgError text={error} onRetry={reload} />;
  if (!data) return <p className={s.muted}>{loading ? 'Carregando o Instagram…' : ''}</p>;
  const { account, totals } = data;
  const chart = [...data.media].reverse().slice(-14);
  const maxViews = Math.max(1, ...chart.map((m) => m.insights?.views ?? 0));

  const kpis: Array<[string, number | null, string]> = [
    ['Visualizações', totals.views, `nos últimos ${totals.posts} posts`],
    ['Contas alcançadas', totals.reach, 'somando os posts'],
    ['Salvamentos', totals.saved, 'sinal de conteúdo útil'],
    ['Compartilhamentos', totals.shares, 'o que mais espalha'],
  ];

  return (
    <>
      <header className={s.head}>
        <div className={s.igAccount}>
          {account.pictureUrl ? <img src={account.pictureUrl} alt="" className={s.avatar} /> : null}
          <div>
            <h1 className={s.hello}>@{account.username}</h1>
            <span className={s.muted}>
              {num(account.followers)} seguidores · {num(account.mediaCount)} posts
            </span>
          </div>
        </div>
        <button type="button" className={s.ghost} onClick={reload} disabled={loading}>
          {loading ? 'Atualizando…' : 'Atualizar'}
        </button>
      </header>

      {!data.insightsAvailable ? <p className={s.notice}>A Meta ainda não liberou os números (visualizações, alcance, salvamentos). Curtidas e comentários aparecem normalmente.</p> : null}

      <section className={s.kpis}>
        {kpis.map(([label, value, hint]) => (
          <div key={label} className={s.card}>
            <span className={s.kpiLabel}>{label}</span>
            <span className={s.kpiValue}>{num(value)}</span>
            <span className={s.kpiHint}>{hint}</span>
          </div>
        ))}
      </section>

      <section className={s.card}>
        <div className={s.cardHead}>
          <h2>Visualizações por post</h2>
          <span className={s.muted}>
            {num(totals.likes)} curtidas · {num(totals.comments)} comentários
          </span>
        </div>
        <div className={s.chart} role="img" aria-label="Visualizações dos últimos posts, do mais antigo ao mais novo">
          {chart.map((m) => (
            <a key={m.id} href={m.permalink} target="_blank" rel="noopener noreferrer" className={s.barCol} title={`${date(m.timestamp)} · ${num(m.insights?.views)} visualizações`}>
              <span className={s.barVal}>{num(m.insights?.views)}</span>
              <span className={s.barFill} style={{ height: `${Math.max(3, ((m.insights?.views ?? 0) / maxViews) * 100)}%` }} />
              <span className={s.barLabel}>{date(m.timestamp)}</span>
            </a>
          ))}
        </div>
      </section>

      <section className={s.card}>
        <div className={s.cardHead}>
          <h2>Posts</h2>
          <select className={s.miniSelect} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Ordenar posts">
            <option value="recent">Mais recentes</option>
            <option value="views">Mais vistos</option>
            <option value="engagement">Maior engajamento</option>
          </select>
        </div>
        <div className={s.igTable}>
          <div className={`${s.igRow} ${s.igHead}`}>
            <span>Post</span>
            <span>Visualizações</span>
            <span>Alcance</span>
            <span>Curtidas</span>
            <span>Coment.</span>
            <span>Salvos</span>
            <span>Compart.</span>
            <span>Engaj.</span>
          </div>
          {media.map((m) => (
            <a key={m.id} href={m.permalink} target="_blank" rel="noopener noreferrer" className={s.igRow}>
              <span className={s.igPost}>
                <span className={s.igThumb}>{m.thumbnailUrl ? <img src={m.thumbnailUrl} alt="" loading="lazy" /> : null}</span>
                <span className={s.igCaption}>
                  <strong>{firstLine(m.caption)}</strong>
                  <span className={s.muted}>
                    {date(m.timestamp)} · {kind(m)}
                  </span>
                </span>
              </span>
              <span>{num(m.insights?.views)}</span>
              <span>{num(m.insights?.reach)}</span>
              <span>{num(m.likes)}</span>
              <span>{num(m.comments)}</span>
              <span>{num(m.insights?.saved)}</span>
              <span>{num(m.insights?.shares)}</span>
              <span>{pct(m.insights?.totalInteractions ?? m.likes + m.comments, m.insights?.reach)}</span>
            </a>
          ))}
        </div>
      </section>
    </>
  );
}

export function CommentsView({ ig }: { ig: Ig }) {
  const { data, error, reload } = ig;
  const posts = (data?.media ?? []).filter((m) => m.comments > 0);
  const [selected, setSelected] = useState<string | null>(null);
  const current = selected ?? posts[0]?.id ?? null;

  if (error) return <IgError text={error} onRetry={reload} />;
  if (!data) return <p className={s.muted}>Carregando…</p>;

  return (
    <>
      <header className={s.head}>
        <h1 className={s.hello}>Comentários</h1>
      </header>
      {posts.length === 0 ? (
        <p className={s.muted}>Nenhum comentário nos últimos posts.</p>
      ) : (
        <div className={s.commentsGrid}>
          <ul className={s.postPick}>
            {posts.map((m) => (
              <li key={m.id}>
                <button type="button" className={s.postPickItem} aria-current={current === m.id ? 'true' : undefined} onClick={() => setSelected(m.id)}>
                  <span className={s.igThumb}>{m.thumbnailUrl ? <img src={m.thumbnailUrl} alt="" loading="lazy" /> : null}</span>
                  <span className={s.igCaption}>
                    <strong>{firstLine(m.caption)}</strong>
                    <span className={s.muted}>
                      {date(m.timestamp)} · {m.comments} comentário{m.comments === 1 ? '' : 's'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {current ? <Thread key={current} mediaId={current} /> : null}
        </div>
      )}
    </>
  );
}

function Thread({ mediaId }: { mediaId: string }) {
  const [list, setList] = useState<IgComment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = (fresh = false) =>
    api
      .igComments(mediaId, fresh)
      .then((r) => setList(r.comments))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Não deu para carregar.'));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaId]);

  if (error) return <p className={s.notice}>{error}</p>;
  if (!list) return <p className={s.muted}>Carregando comentários…</p>;
  return (
    <ul className={`${s.card} ${s.thread}`}>
      {list.map((c) => (
        <CommentItem key={c.id} c={c} onReplied={() => load(true)} />
      ))}
    </ul>
  );
}

function CommentItem({ c, onReplied }: { c: IgComment; onReplied: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(`@${c.username} `);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api.igReply(c.id, text.trim());
      setOpen(false);
      onReplied();
    } catch (ex) {
      setErr(ex instanceof ApiError ? ex.message : 'Não deu para responder.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className={s.comment}>
      <div className={s.commentTop}>
        <strong>@{c.username}</strong>
        <span className={s.muted}>{new Date(c.timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <p>{c.text}</p>
      {c.replies.map((r) => (
        <div key={r.id} className={s.reply}>
          <strong>@{r.username}</strong> {r.text}
        </div>
      ))}
      {open ? (
        <form onSubmit={send} className={s.replyForm}>
          <input value={text} onChange={(e) => setText(e.target.value)} autoFocus aria-label={`Responder @${c.username}`} />
          <button type="submit" className={s.primary} disabled={busy}>
            {busy ? 'Enviando…' : 'Responder'}
          </button>
        </form>
      ) : (
        <button type="button" className={s.linkBtn} onClick={() => setOpen(true)}>
          Responder
        </button>
      )}
      {err ? <span className={s.notice}>{err}</span> : null}
    </li>
  );
}

function IgError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className={s.card}>
      <p className={s.notice}>{text}</p>
      <button type="button" className={s.ghost} onClick={onRetry}>
        Tentar de novo
      </button>
    </div>
  );
}
