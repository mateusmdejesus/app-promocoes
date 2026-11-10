'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, type CommentLabel, type CommentStatus, type Inbox, type InboxComment, type InboxPost } from '../../lib/api';
import s from './estudio.module.css';

const LABELS: Array<[CommentLabel, string, string]> = [
  ['reclamacao', 'Reclamação', 'Reclamações'],
  ['pergunta', 'Pergunta', 'Perguntas'],
  ['lead', 'Lead', 'Leads'],
  ['elogio', 'Elogio', 'Elogios'],
  ['spam', 'Spam', 'Spam'],
  ['outro', 'Outro', 'Outros'],
];
const one = (l: CommentLabel) => LABELS.find((x) => x[0] === l)![1];
const many = (l: CommentLabel, n: number) => (n === 1 ? one(l).toLowerCase() : LABELS.find((x) => x[0] === l)![2].toLowerCase());
const ICON: Record<CommentLabel, string> = { reclamacao: '!', pergunta: '?', lead: '$', elogio: '♥', spam: '×', outro: '·' };

function ago(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ontem' : `${d} dias`;
}
/** Link de miniatura do Instagram vence; sem imagem, fica só o fundo. */
const hideImg = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.display = 'none';
};
const firstLine = (c: string) => c.split('\n')[0]!.slice(0, 80) || 'Sem legenda';

/** Resumo do post no estilo "2 reclamações · 1 lead · 3 perguntas" (só o que importa). */
function summary(p: InboxPost) {
  const parts = (['reclamacao', 'lead', 'pergunta', 'elogio'] as CommentLabel[]).filter((l) => p.labels[l] > 0).map((l) => `${p.labels[l]} ${many(l, p.labels[l])}`);
  return parts.join(' · ') || `${p.comments} comentário${p.comments === 1 ? '' : 's'}`;
}

export function CommentsView() {
  const [data, setData] = useState<Inbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [post, setPost] = useState<string | 'all'>('all');
  const [label, setLabel] = useState<CommentLabel | 'all'>('all');
  const [done, setDone] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = (fresh = false) => {
    setLoading(true);
    setError(null);
    api
      .igInbox(fresh)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Não deu para falar com o Instagram agora.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => load(), []);

  /** Muda na tela na hora e avisa o servidor. */
  const patch = (ids: string[], p: Partial<Pick<InboxComment, 'status' | 'label' | 'hidden'>>) =>
    setData((d) => (d ? { ...d, comments: d.comments.map((c) => (ids.includes(c.id) ? { ...c, ...p } : c)) } : d));
  const setState = (ids: string[], p: { status?: CommentStatus; label?: CommentLabel }) => {
    patch(ids, p);
    api.igCommentState(ids, p).catch(() => load());
  };

  const inPost = useMemo(() => (data?.comments ?? []).filter((c) => post === 'all' || c.mediaId === post), [data, post]);
  const searched = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? inPost.filter((c) => c.text.toLowerCase().includes(t) || c.username.toLowerCase().includes(t)) : inPost;
  }, [inPost, q]);
  const byStatus = searched.filter((c) => (done ? c.status !== 'novo' : c.status === 'novo'));
  const list = byStatus
    .filter((c) => label === 'all' || c.label === label)
    .sort((a, b) => (a.priority === b.priority ? b.timestamp.localeCompare(a.timestamp) : ['alta', 'media', 'baixa'].indexOf(a.priority) - ['alta', 'media', 'baixa'].indexOf(b.priority)));

  if (error)
    return (
      <div className={s.card}>
        <p className={s.notice}>{error}</p>
        <button type="button" className={s.ghost} onClick={() => load(true)}>
          Tentar de novo
        </button>
      </div>
    );
  if (!data) return <p className={s.muted}>Carregando comentários…</p>;

  const toReview = data.comments.filter((c) => c.status === 'novo').length;
  const current = post === 'all' ? null : data.posts.find((p) => p.id === post);
  const countLabel = (l: CommentLabel) => byStatus.filter((c) => c.label === l).length;
  const postOf = (id: string) => data.posts.find((p) => p.id === id);

  return (
    <>
      <header className={s.head}>
        <div>
          <h1 className={s.hello}>Comentários</h1>
          <span className={s.muted}>
            {toReview} a revisar · {data.aiEnabled ? 'classificados pela IA' : 'classificados por regras (IA desligada)'}
          </span>
        </div>
        <div className={s.inboxTools}>
          <input className={s.search} type="search" placeholder="Buscar comentário ou @" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
          <button type="button" className={s.ghost} onClick={() => load(true)} disabled={loading}>
            {loading ? 'Atualizando…' : 'Atualizar'}
          </button>
        </div>
      </header>

      <div className={s.inbox}>
        <ul className={s.inboxPosts} aria-label="Posts">
          <li>
            <button type="button" className={s.inboxPost} aria-current={post === 'all' ? 'true' : undefined} onClick={() => setPost('all')}>
              <span className={`${s.igThumb} ${s.allThumb}`}>Tudo</span>
              <span className={s.igCaption}>
                <strong>Todos os posts</strong>
                <span className={s.muted}>{data.comments.length} comentários</span>
              </span>
              {toReview ? <span className={s.newBadge}>{toReview}</span> : null}
            </button>
          </li>
          {data.posts.map((p) => (
            <li key={p.id}>
              <button type="button" className={s.inboxPost} aria-current={post === p.id ? 'true' : undefined} onClick={() => setPost(p.id)}>
                <span className={s.igThumb}>{p.thumbnailUrl ? <img src={p.thumbnailUrl} alt="" loading="lazy" onError={hideImg} /> : null}</span>
                <span className={s.igCaption}>
                  <strong>{firstLine(p.caption)}</strong>
                  <span className={s.muted}>{summary(p)}</span>
                  <span className={s.faint}>{ago(p.timestamp)}</span>
                </span>
                {p.novos ? <span className={s.newBadge}>{p.novos} novo{p.novos === 1 ? '' : 's'}</span> : null}
              </button>
            </li>
          ))}
        </ul>

        <section className={`${s.card} ${s.panel}`}>
          {current ? (
            <div className={s.panelPost}>
              <span className={s.igThumb}>{current.thumbnailUrl ? <img src={current.thumbnailUrl} alt="" onError={hideImg} /> : null}</span>
              <div className={s.igCaption}>
                <strong>@{data.account.username}</strong>
                <span className={s.muted}>
                  {new Date(current.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · {current.likes.toLocaleString('pt-BR')} curtidas · {current.comments} comentários
                </span>
              </div>
              <a href={current.permalink} target="_blank" rel="noopener noreferrer" className={s.linkBtn}>
                Abrir no Instagram
              </a>
            </div>
          ) : null}

          <div className={s.segment} role="tablist" aria-label="Tipo">
            <button type="button" role="tab" aria-selected={label === 'all'} onClick={() => setLabel('all')}>
              Todos <em>{byStatus.length}</em>
            </button>
            {LABELS.filter(([l]) => l !== 'outro' || countLabel('outro') > 0).map(([l, , plural]) => (
              <button key={l} type="button" role="tab" aria-selected={label === l} onClick={() => setLabel(l)}>
                {plural} <em>{countLabel(l)}</em>
              </button>
            ))}
          </div>

          <div className={s.panelBar}>
            <div className={s.toggle}>
              <button type="button" aria-pressed={!done} onClick={() => setDone(false)}>
                A revisar <em>{searched.filter((c) => c.status === 'novo').length}</em>
              </button>
              <button type="button" aria-pressed={done} onClick={() => setDone(true)}>
                Feitos <em>{searched.filter((c) => c.status !== 'novo').length}</em>
              </button>
            </div>
            {!done && list.length ? (
              <button type="button" className={s.linkBtn} onClick={() => setState(list.map((c) => c.id), { status: 'ignorado' })}>
                Marcar todos como feitos
              </button>
            ) : null}
          </div>

          {list.length === 0 ? (
            <p className={`${s.muted} ${s.emptyInbox}`}>{done ? 'Nada feito por aqui ainda.' : 'Tudo em dia. Nenhum comentário para revisar aqui.'}</p>
          ) : (
            <ul className={s.cList}>
              {list.map((c) => (
                <CommentCard
                  key={c.id}
                  c={c}
                  post={post === 'all' ? postOf(c.mediaId) : undefined}
                  open={open === c.id}
                  onToggle={() => setOpen(open === c.id ? null : c.id)}
                  onState={(p) => setState([c.id], p)}
                  onHidden={(hidden) => patch([c.id], hidden ? { hidden, status: 'ignorado' } : { hidden })}
                  onReplied={(text) => {
                    setData((d) =>
                      d
                        ? {
                            ...d,
                            comments: d.comments.map((x) =>
                              x.id === c.id ? { ...x, status: 'respondido', answeredByMe: true, replies: [...x.replies, { id: `local-${Date.now()}`, text, username: d.account.username, timestamp: new Date().toISOString() }] } : x,
                            ),
                          }
                        : d,
                    );
                  }}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function CommentCard({
  c,
  post,
  open,
  onToggle,
  onState,
  onHidden,
  onReplied,
}: {
  c: InboxComment;
  post?: InboxPost;
  open: boolean;
  onToggle: () => void;
  onState: (p: { status?: CommentStatus; label?: CommentLabel }) => void;
  onHidden: (hidden: boolean) => void;
  onReplied: (text: string) => void;
}) {
  const [text, setText] = useState(`@${c.username} `);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sug, setSug] = useState<{ list: string[]; ai: boolean } | null>(null);
  const [sugLoading, setSugLoading] = useState(false);

  const suggest = (refresh = false) => {
    setSugLoading(true);
    api
      .igSuggest(c.id, c.mediaId, refresh)
      .then((r) => setSug({ list: r.suggestions, ai: r.ai }))
      .catch(() => setSug({ list: [], ai: false }))
      .finally(() => setSugLoading(false));
  };
  useEffect(() => {
    if (open && !sug && c.label !== 'spam') suggest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const send = async (message: string) => {
    if (!message.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api.igReply(c.id, message.trim());
      onReplied(message.trim());
      setText(`@${c.username} `);
    } catch (ex) {
      setErr(ex instanceof ApiError ? ex.message : 'Não deu para responder.');
    } finally {
      setBusy(false);
    }
  };
  const hide = async (h: boolean) => {
    setErr(null);
    try {
      await api.igHide(c.id, h);
      onHidden(h);
    } catch (ex) {
      setErr(ex instanceof ApiError ? ex.message : 'Não deu para ocultar.');
    }
  };

  return (
    <li className={`${s.cCard} ${open ? s.cOpen : ''}`}>
      <button type="button" className={s.cHead} onClick={onToggle} aria-expanded={open}>
        <span className={`${s.cIcon} ${s[`lb_${c.label}`]}`} aria-hidden>
          {ICON[c.label]}
        </span>
        <span className={s.cBody}>
          <span className={s.cTitle}>
            <strong>@{c.username}</strong>
            {post ? <span className={s.faint}> em “{firstLine(post.caption).slice(0, 40)}”</span> : null}
          </span>
          <span className={open ? s.cText : `${s.cText} ${s.clamp}`}>{c.text}</span>
          <span className={s.cMeta}>
            <span className={s.faint}>{ago(c.timestamp)}</span>
            <span className={`${s.pill} ${s[`lb_${c.label}`]}`}>{one(c.label)}</span>
            {c.priority === 'alta' ? <span className={`${s.pill} ${s.pAlta}`}>Alta</span> : c.priority === 'media' ? <span className={`${s.pill} ${s.pMedia}`}>Média</span> : null}
            {c.status === 'respondido' ? <span className={`${s.pill} ${s.pDone}`}>Respondido</span> : c.status === 'ignorado' ? <span className={`${s.pill} ${s.pIgnored}`}>Ignorado</span> : <span className={`${s.pill} ${s.pNew}`}>Novo</span>}
            {c.hidden ? <span className={`${s.pill} ${s.pIgnored}`}>Oculto</span> : null}
          </span>
        </span>
      </button>

      {open ? (
        <div className={s.cDetail}>
          {c.replies.map((r) => (
            <div key={r.id} className={s.reply}>
              <strong>@{r.username}</strong> {r.text}
            </div>
          ))}

          <div className={s.cActions}>
            {c.status === 'novo' ? (
              <button type="button" onClick={() => onState({ status: 'ignorado' })}>
                Ignorar
              </button>
            ) : (
              <button type="button" onClick={() => onState({ status: 'novo' })}>
                Voltar para revisar
              </button>
            )}
            <button type="button" onClick={() => hide(!c.hidden)}>
              {c.hidden ? 'Mostrar no post' : 'Ocultar'}
            </button>
            {c.label !== 'spam' ? (
              <button
                type="button"
                onClick={() => {
                  onState({ label: 'spam', status: 'ignorado' });
                  if (!c.hidden) void hide(true);
                }}
              >
                É spam
              </button>
            ) : null}
            <label className={s.relabel}>
              Tipo
              <select value={c.label} onChange={(e) => onState({ label: e.target.value as CommentLabel })}>
                {LABELS.map(([l, name]) => (
                  <option key={l} value={l}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {c.label !== 'spam' ? (
            <div className={s.aiBox}>
              <div className={s.aiHead}>
                <span>
                  <i className={s.aiSpark} aria-hidden>
                    ✦
                  </i>{' '}
                  {sug?.ai ? 'Respostas sugeridas pela IA' : 'Respostas prontas'}
                </span>
                {sug?.ai ? (
                  <button type="button" className={s.linkBtn} onClick={() => suggest(true)} disabled={sugLoading}>
                    Outras ideias
                  </button>
                ) : null}
              </div>
              {sugLoading && !sug ? <span className={s.muted}>Pensando nas respostas…</span> : null}
              {sug?.list.map((r, i) => (
                <div key={i} className={s.sug}>
                  <p>{r}</p>
                  <div>
                    <button type="button" className={s.linkBtn} onClick={() => setText(r)}>
                      Editar
                    </button>
                    <button type="button" className={s.sendBtn} onClick={() => send(r)} disabled={busy}>
                      Enviar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <form
            className={s.replyForm}
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} aria-label={`Responder @${c.username}`} />
            <button type="submit" className={s.primary} disabled={busy}>
              {busy ? 'Enviando…' : 'Responder'}
            </button>
          </form>
          {err ? <span className={s.notice}>{err}</span> : null}
        </div>
      ) : null}
    </li>
  );
}
