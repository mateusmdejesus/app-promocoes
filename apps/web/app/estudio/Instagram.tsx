'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, type IgMedia, type IgOverview } from '../../lib/api';
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
