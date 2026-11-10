'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '../../components/Session';
import { api, ApiError, brl, type Deal, type Post, type PostSlot, type PostStatus } from '../../lib/api';
import s from './estudio.module.css';

/** Campanha de Black Friday: 11 a 30 de novembro, 2 posts por dia. */
const CAMPAIGN_FROM = '2026-11-11';
const CAMPAIGN_TO = '2026-11-30';
const BLACK_FRIDAY = '2026-11-27';
const SLOTS: PostSlot[] = ['12h', '19h'];
const STATUS: Array<[PostStatus, string]> = [
  ['ideia', 'Ideia'],
  ['roteiro', 'Roteiro pronto'],
  ['gravado', 'Gravado'],
  ['postado', 'Postado'],
];
const STATUS_LABEL = Object.fromEntries(STATUS) as Record<PostStatus, string>;

const todayBR = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const dayLabel = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' }).replace('.', '');
const campaignDays = () => {
  const out: string[] = [];
  for (let d = CAMPAIGN_FROM; d <= CAMPAIGN_TO; d = addDays(d, 1)) out.push(d);
  return out;
};

type View = 'overview' | 'calendar' | 'deals';

export default function Estudio() {
  const { me, ready } = useSession();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [view, setView] = useState<View>('overview');
  const [posts, setPosts] = useState<Post[]>([]);
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [editing, setEditing] = useState<{ date: string; slot: PostSlot } | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!me?.identified) return setAllowed(false);
    api
      .adminMe()
      .then(() => setAllowed(true))
      .catch(() => setAllowed(false));
  }, [ready, me]);

  const load = useCallback(() => {
    api.adminPosts(CAMPAIGN_FROM, CAMPAIGN_TO).then((r) => setPosts(r.posts));
    api
      .adminDeals(12)
      .then((r) => setDeals(r.deals))
      .catch(() => setDeals([]));
  }, []);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  const byId = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts]);

  if (allowed === null) return <div className={s.shell} />;
  if (!allowed) {
    return (
      <div className={`${s.shell} ${s.center}`}>
        <div className={s.gate}>
          <span className={s.brand}>keropromo Estúdio</span>
          <p>Área restrita da equipe.</p>
          {me?.identified ? null : (
            <Link href="/entrar" className={s.primary}>
              Entrar
            </Link>
          )}
          <Link href="/ofertas" className={s.ghost}>
            Voltar para o site
          </Link>
        </div>
      </div>
    );
  }

  const save = async (date: string, slot: PostSlot, body: Partial<Post>) => {
    const r = await api.savePost(date, slot, body);
    setPosts((cur) => [...cur.filter((p) => p.id !== r.post.id), r.post].sort((a, b) => a.id.localeCompare(b.id)));
    return r.post;
  };

  return (
    <div className={s.shell}>
      <aside className={s.sidebar}>
        <div className={s.brandRow}>
          <span className={s.mark} aria-hidden />
          <span className={s.brand}>Estúdio</span>
        </div>
        <nav className={s.nav} aria-label="Estúdio">
          {(
            [
              ['overview', 'Visão geral'],
              ['calendar', 'Cronograma'],
              ['deals', 'Achados do dia'],
            ] as Array<[View, string]>
          ).map(([v, label]) => (
            <button key={v} type="button" className={s.navItem} aria-current={view === v ? 'page' : undefined} onClick={() => setView(v)}>
              {label}
            </button>
          ))}
          <span className={s.navLabel}>Redes</span>
          <span className={`${s.navItem} ${s.soon}`}>
            Instagram <em>em breve</em>
          </span>
          <span className={`${s.navItem} ${s.soon}`}>
            Comentários <em>em breve</em>
          </span>
          <span className={`${s.navItem} ${s.soon}`}>
            TikTok <em>em breve</em>
          </span>
        </nav>
        <Link href="/ofertas" className={s.back}>
          ← Voltar para o site
        </Link>
      </aside>

      <main className={s.main}>
        {view === 'overview' ? (
          <Overview posts={posts} byId={byId} deals={deals} onOpen={setEditing} onSeeAll={() => setView('calendar')} onSeeDeals={() => setView('deals')} name={(me?.email?.split('@')[0] ?? '').replace(/^./, (c) => c.toUpperCase())} />
        ) : view === 'calendar' ? (
          <Calendar byId={byId} onOpen={setEditing} />
        ) : (
          <Deals deals={deals} />
        )}
      </main>

      {editing ? <PostEditor key={`${editing.date}/${editing.slot}`} date={editing.date} slot={editing.slot} post={byId.get(`${editing.date}/${editing.slot}`)} onSave={save} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function Overview({
  posts,
  byId,
  deals,
  onOpen,
  onSeeAll,
  onSeeDeals,
  name,
}: {
  posts: Post[];
  byId: Map<string, Post>;
  deals: Deal[] | null;
  onOpen: (e: { date: string; slot: PostSlot }) => void;
  onSeeAll: () => void;
  onSeeDeals: () => void;
  name: string;
}) {
  const today = todayBR();
  const total = campaignDays().length * SLOTS.length;
  const count = (st: PostStatus[]) => posts.filter((p) => st.includes(p.status)).length;
  const toBF = daysBetween(today, BLACK_FRIDAY);
  const hour = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }));
  const hello = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const firstDay = today < CAMPAIGN_FROM ? CAMPAIGN_FROM : today;
  const next = Array.from({ length: 7 }, (_, i) => addDays(firstDay, i)).filter((d) => d <= CAMPAIGN_TO);

  const kpis: Array<[string, number, string]> = [
    ['Roteiros prontos', count(['roteiro', 'gravado', 'postado']), 'com roteiro escrito'],
    ['Gravados', count(['gravado', 'postado']), 'prontos para postar'],
    ['Postados', count(['postado']), 'no ar'],
    ['Posts no cronograma', posts.length, `de ${total} até 30/11`],
  ];

  return (
    <>
      <header className={s.head}>
        <div>
          <span className={s.live}>
            <i /> Campanha Black Friday
          </span>
          <h1 className={s.hello}>
            {hello}
            {name ? `, ${name}` : ''}
          </h1>
        </div>
        <div className={s.countdown}>
          <strong>{toBF > 0 ? toBF : toBF === 0 ? 'Hoje' : '—'}</strong>
          <span>{toBF > 0 ? `dia${toBF === 1 ? '' : 's'} para a Black Friday (27/11)` : toBF === 0 ? 'é Black Friday' : 'Black Friday passou'}</span>
        </div>
      </header>

      <section className={s.kpis}>
        {kpis.map(([label, value, hint]) => (
          <div key={label} className={s.card}>
            <span className={s.kpiLabel}>{label}</span>
            <span className={s.kpiValue}>{value}</span>
            <div className={s.bar}>
              <span style={{ width: `${Math.min(100, Math.round((value / total) * 100))}%` }} />
            </div>
            <span className={s.kpiHint}>{hint}</span>
          </div>
        ))}
      </section>

      <section className={s.grid2}>
        <div className={s.card}>
          <div className={s.cardHead}>
            <h2>Hoje</h2>
            <span className={s.muted}>{dayLabel(firstDay)}</span>
          </div>
          <div className={s.todayList}>
            {SLOTS.map((slot) => {
              const p = byId.get(`${firstDay}/${slot}`);
              return (
                <button key={slot} type="button" className={s.todayItem} onClick={() => onOpen({ date: firstDay, slot })}>
                  <span className={s.slot}>{slot}</span>
                  <span className={s.todayBody}>
                    <span className={s.rowTop}>
                      <Format f={p?.format ?? (slot === '12h' ? 'achado' : 'gica')} />
                      {p ? <Status st={p.status} /> : <span className={s.muted}>vazio</span>}
                    </span>
                    <strong>{p?.title ?? 'Sem post ainda'}</strong>
                    {p?.hook ? <span className={s.hook}>“{p.hook}”</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={s.card}>
          <div className={s.cardHead}>
            <h2>Achados de hoje</h2>
            <button type="button" className={s.linkBtn} onClick={onSeeDeals}>
              Ver todos ↗
            </button>
          </div>
          <ul className={s.dealList}>
            {(deals ?? []).slice(0, 5).map((d) => (
              <li key={d.id} className={s.deal}>
                <span className={s.thumb}>{d.imageUrl ? <img src={d.imageUrl} alt="" loading="lazy" /> : null}</span>
                <span className={s.dealBody}>
                  <span className={s.dealTitle}>{d.title}</span>
                  <span className={s.muted}>
                    {d.storeName} · {d.price != null ? brl(d.price) : ''}
                  </span>
                </span>
                <span className={s.pct}>−{d.discountPct}%</span>
              </li>
            ))}
            {deals && deals.length === 0 ? <li className={s.muted}>Nenhum achado agora.</li> : null}
          </ul>
        </div>
      </section>

      <section className={s.card}>
        <div className={s.cardHead}>
          <h2>Próximos 7 dias</h2>
          <button type="button" className={s.linkBtn} onClick={onSeeAll}>
            Cronograma completo ↗
          </button>
        </div>
        <div className={s.week}>
          {next.map((d) => (
            <div key={d} className={`${s.dayCol} ${d === BLACK_FRIDAY ? s.bf : ''}`}>
              <span className={s.dayName}>{dayLabel(d)}</span>
              {SLOTS.map((slot) => {
                const p = byId.get(`${d}/${slot}`);
                return (
                  <button key={slot} type="button" className={`${s.chipPost} ${p ? s[`st_${p.status}`] : s.empty}`} onClick={() => onOpen({ date: d, slot })}>
                    <span>{slot}</span>
                    <span className={s.chipTitle}>{p?.title ?? '+'}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <section className={`${s.card} ${s.connect}`}>
        <div>
          <h2>Instagram</h2>
          <p className={s.muted}>Conecte sua conta de Criador para ver visualizações, salvamentos, comentários e publicar os Reels daqui.</p>
        </div>
        <span className={s.soonTag}>em breve</span>
      </section>
    </>
  );
}

function Calendar({ byId, onOpen }: { byId: Map<string, Post>; onOpen: (e: { date: string; slot: PostSlot }) => void }) {
  const today = todayBR();
  return (
    <>
      <header className={s.head}>
        <h1 className={s.hello}>Cronograma</h1>
        <div className={s.legend}>
          {STATUS.map(([st, label]) => (
            <span key={st} className={s.legendItem}>
              <i className={s[`dot_${st}`]} /> {label}
            </span>
          ))}
        </div>
      </header>
      <div className={s.table}>
        {campaignDays().map((d) => (
          <div key={d} className={`${s.tRow} ${d === today ? s.today : ''} ${d === BLACK_FRIDAY ? s.bf : ''}`}>
            <span className={s.tDay}>
              {dayLabel(d)}
              {d === BLACK_FRIDAY ? <em>Black Friday</em> : d === today ? <em>hoje</em> : null}
            </span>
            {SLOTS.map((slot) => {
              const p = byId.get(`${d}/${slot}`);
              return (
                <button key={slot} type="button" className={s.tCell} onClick={() => onOpen({ date: d, slot })}>
                  <span className={s.rowTop}>
                    <span className={s.slot}>{slot}</span>
                    <Format f={p?.format ?? (slot === '12h' ? 'achado' : 'gica')} />
                    {p ? <Status st={p.status} /> : null}
                  </span>
                  <span className={s.cellTitle}>{p?.title ?? <span className={s.muted}>+ adicionar</span>}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

function Deals({ deals }: { deals: Deal[] | null }) {
  return (
    <>
      <header className={s.head}>
        <div>
          <h1 className={s.hello}>Achados do dia</h1>
          <p className={s.muted}>Maiores descontos agora no keropromo, sem repetir produto dos últimos 14 dias. É daqui que o agente escolhe o produto do “achado”.</p>
        </div>
      </header>
      <div className={s.dealGrid}>
        {(deals ?? []).map((d) => (
          <a key={d.id} href={d.pageUrl} target="_blank" rel="noopener noreferrer" className={`${s.card} ${s.dealCard}`}>
            <span className={s.dealImg}>{d.imageUrl ? <img src={d.imageUrl} alt="" loading="lazy" /> : null}</span>
            <span className={s.pct}>−{d.discountPct}%</span>
            <span className={s.dealTitle}>{d.title}</span>
            <span className={s.muted}>
              {d.storeName} · {d.price != null ? brl(d.price) : ''}
              {d.referencePrice ? ` (de ${brl(d.referencePrice)})` : ''}
            </span>
            <span className={s.muted}>
              {d.verified ? 'Desconto conferido no histórico' : `Desconto informado pela loja · ${d.historyDays} dia(s) de histórico`}
            </span>
          </a>
        ))}
      </div>
    </>
  );
}

function Format({ f }: { f: Post['format'] }) {
  return <span className={`${s.format} ${f === 'achado' ? s.fAchado : s.fGica}`}>{f === 'achado' ? 'Achado' : 'Black Fraude'}</span>;
}

function Status({ st }: { st: PostStatus }) {
  return (
    <span className={s.status}>
      <i className={s[`dot_${st}`]} /> {STATUS_LABEL[st]}
    </span>
  );
}

function PostEditor({
  date,
  slot,
  post,
  onSave,
  onClose,
}: {
  date: string;
  slot: PostSlot;
  post?: Post;
  onSave: (date: string, slot: PostSlot, body: Partial<Post>) => Promise<Post>;
  onClose: () => void;
}) {
  const [f, setF] = useState<Partial<Post>>(
    post ?? { format: slot === '12h' ? 'achado' : 'gica', title: '', status: 'ideia', hook: '', script: '', caption: '', hashtags: '', filming: '' },
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: keyof Post) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((cur) => ({ ...cur, [k]: e.target.value }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e?: React.FormEvent, status?: PostStatus) => {
    e?.preventDefault();
    if (!f.title?.trim()) return setMsg('Dê um título ao post.');
    setBusy(true);
    setMsg(null);
    try {
      const body = { ...f, ...(status ? { status } : {}) };
      delete (body as Partial<Post>).id;
      delete (body as Partial<Post>).date;
      delete (body as Partial<Post>).slot;
      delete (body as Partial<Post>).updatedAt;
      const saved = await onSave(date, slot, body);
      setF(saved);
      setMsg('Salvo.');
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Não deu para salvar.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setMsg(`${what} copiado.`);
  };
  const words = (f.script ?? '').trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className={s.overlay} onClick={onClose}>
      <form className={s.drawer} onClick={(e) => e.stopPropagation()} onSubmit={submit} aria-label={`Post de ${dayLabel(date)} às ${slot}`}>
        <div className={s.drawerHead}>
          <div>
            <span className={s.muted}>
              {dayLabel(date)} · {slot}
            </span>
            <input className={s.titleInput} value={f.title ?? ''} onChange={set('title')} placeholder="Título do post" aria-label="Título" />
          </div>
          <button type="button" className={s.close} onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className={s.fieldsRow}>
          <label className={s.field}>
            <span>Formato</span>
            <select value={f.format} onChange={set('format')}>
              <option value="achado">Achado do dia (lo-fi, 20–40 s)</option>
              <option value="gica">Black Fraude (GICA, 60–90 s)</option>
            </select>
          </label>
          <label className={s.field}>
            <span>Status</span>
            <select value={f.status} onChange={set('status')}>
              {STATUS.map(([st, label]) => (
                <option key={st} value={st}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className={s.field}>
          <span>Tema da semana</span>
          <input value={f.theme ?? ''} onChange={set('theme')} placeholder="Ex.: A Black Fraude existe" />
        </label>
        <label className={s.field}>
          <span>Gancho (primeiros 3 segundos)</span>
          <textarea rows={2} value={f.hook ?? ''} onChange={set('hook')} />
        </label>
        <label className={s.field}>
          <span className={s.fieldHead}>
            Roteiro <em>{words} palavras · ~{Math.round(words / 2.5)} s</em>
            <button type="button" className={s.linkBtn} onClick={() => copy(f.script ?? '', 'Roteiro')}>
              Copiar
            </button>
          </span>
          <textarea rows={12} value={f.script ?? ''} onChange={set('script')} />
        </label>
        <label className={s.field}>
          <span>O que filmar</span>
          <textarea rows={3} value={f.filming ?? ''} onChange={set('filming')} />
        </label>
        <label className={s.field}>
          <span className={s.fieldHead}>
            Legenda
            <button type="button" className={s.linkBtn} onClick={() => copy(`${f.caption ?? ''}\n\n${f.hashtags ?? ''}`.trim(), 'Legenda e hashtags')}>
              Copiar com hashtags
            </button>
          </span>
          <textarea rows={4} value={f.caption ?? ''} onChange={set('caption')} />
        </label>
        <label className={s.field}>
          <span>Hashtags</span>
          <input value={f.hashtags ?? ''} onChange={set('hashtags')} />
        </label>

        <div className={s.drawerFoot}>
          <span className={s.muted} role="status">
            {msg}
          </span>
          {f.status !== 'gravado' && f.status !== 'postado' ? (
            <button type="button" className={s.ghost} disabled={busy} onClick={() => submit(undefined, 'gravado')}>
              Marcar gravado
            </button>
          ) : f.status === 'gravado' ? (
            <button type="button" className={s.ghost} disabled={busy} onClick={() => submit(undefined, 'postado')}>
              Marcar postado
            </button>
          ) : null}
          <button type="submit" className={s.primary} disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}
