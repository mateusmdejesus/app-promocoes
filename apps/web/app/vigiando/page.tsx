'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../../components/Session';
import { api, ApiError, brl, type ProductHit, type Watch } from '../../lib/api';
import s from './vigiando.module.css';

/** Produtos que a pessoa está vigiando, com meta de preço, e busca para vigiar qualquer produto acompanhado. */
export default function Vigiando() {
  const { me, ready } = useSession();
  const [items, setItems] = useState<Watch[] | null>(null);
  const [limit, setLimit] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .watches()
      .then((r) => {
        setItems(r.watches);
        setLimit(r.limits.targets);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (me?.identified) load();
  }, [me, load]);

  if (!ready) return null;
  if (!me?.identified) {
    return (
      <div className="container" style={{ paddingTop: 48, maxWidth: 640 }}>
        <h1 className="h2">Vigiando</h1>
        <p className="muted" style={{ margin: '12px 0 24px' }}>
          Salve os produtos que você quer comprar e a gente fica de olho no preço. Quando chegar no valor que você quer, você recebe um e-mail.
        </p>
        <Link href="/entrar" className="btn btn-primary btn-lg">
          Entrar para vigiar
        </Link>
      </div>
    );
  }

  const withTarget = (items ?? []).filter((w) => w.targetPrice != null).length;

  return (
    <div className="container" style={{ paddingTop: 40, maxWidth: 880 }}>
      <h1 className="h2">Vigiando</h1>
      <p className="muted" style={{ margin: '8px 0 24px' }}>
        A gente olha o preço a cada 5 minutos. Crie uma meta e receba um e-mail quando chegar nela.{' '}
        {me.plan === 'pro' ? null : (
          <>
            No grátis, {withTarget}/{limit} meta.{' '}
            <Link href="/pro" className="link" style={{ color: 'var(--ink)' }}>
              Metas ilimitadas com o Pro
            </Link>
          </>
        )}
      </p>

      <AddProduct onAdded={load} />

      {error ? <p className="error">{error}</p> : null}
      {items === null ? null : items.length === 0 ? (
        <div className={`card ${s.empty}`}>
          <strong>Nada por aqui ainda.</strong>
          <span className="muted">Procure um produto acima, ou abra qualquer oferta e toque em &quot;Vigiar&quot;.</span>
        </div>
      ) : (
        <ul className={s.list}>
          {items.map((w) => (
            <WatchItem key={w.id} w={w} onChange={load} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AddProduct({ onAdded }: { onAdded: () => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<ProductHit[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) return setHits(null);
    timer.current = setTimeout(() => {
      api
        .searchProducts(q.trim())
        .then((r) => setHits(r.products))
        .catch(() => setHits([]));
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  const add = async (id: string) => {
    await api.saveWatch(id).catch(() => undefined);
    setHits((h) => h?.map((x) => (x.id === id ? { ...x, watching: true } : x)) ?? null);
    onAdded();
  };

  return (
    <div className={s.add}>
      <input
        className={s.search}
        type="search"
        placeholder="Procure um produto para vigiar (ex.: iphone, air fryer, geladeira)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Procurar produto para vigiar"
      />
      {hits ? (
        hits.length === 0 ? (
          <p className="muted" style={{ margin: '8px 4px' }}>
            Ainda não acompanhamos esse produto. A gente vigia os mais vendidos de Mercado Livre, Shopee e mais de 20 lojas, e a lista cresce todo dia.
          </p>
        ) : (
          <ul className={s.hits}>
            {hits.map((h) => (
              <li key={h.id} className={s.hit}>
                <div className={s.thumb}>{h.imageUrl ? <img src={h.imageUrl} alt="" loading="lazy" /> : null}</div>
                <Link href={`/oferta/${encodeURIComponent(h.id)}`} className={s.hitBody}>
                  <span className={s.title}>{h.title}</span>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {h.storeName} · {h.price != null ? brl(h.price) : 'oferta quente travada'}
                  </span>
                </Link>
                <button type="button" className={`btn ${h.watching ? 'btn-soft' : 'btn-primary'}`} disabled={h.watching} onClick={() => add(h.id)}>
                  {h.watching ? 'Vigiando' : 'Vigiar'}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

function WatchItem({ w, onChange }: { w: Watch; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(w.targetPrice ? String(w.targetPrice / 100).replace('.', ',') : '');
  const [err, setErr] = useState<{ text: string; pro: boolean } | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const reais = Number(value.replace(/\./g, '').replace(',', '.'));
    const target = value.trim() === '' ? null : Math.round(reais * 100);
    if (target !== null && (!Number.isFinite(reais) || target <= 0)) return setErr({ text: 'Escreva um valor, por exemplo 299 ou 299,90.', pro: false });
    try {
      await api.saveWatch(w.id, target);
      setEditing(false);
      setErr(null);
      onChange();
    } catch (ex) {
      setErr({ text: (ex as Error).message, pro: ex instanceof ApiError && ex.status === 402 });
    }
  };

  const remove = async () => {
    await api.deleteWatch(w.id).catch(() => undefined);
    onChange();
  };

  const gap = w.price != null && w.targetPrice != null ? w.price - w.targetPrice : null;

  return (
    <li className={`card ${s.item} ${w.reached ? s.reached : ''}`}>
      <Link href={`/oferta/${encodeURIComponent(w.id)}`} className={s.thumb}>
        {w.imageUrl ? <img src={w.imageUrl} alt="" loading="lazy" /> : null}
      </Link>
      <div className={s.body}>
        <Link href={`/oferta/${encodeURIComponent(w.id)}`} className={s.title}>
          {w.title}
        </Link>
        <span className="muted" style={{ fontSize: 13 }}>
          {w.storeName}
          {w.offer ? ` · −${w.offer.discountPct}%${w.offer.tier === 'hot' ? ' quente' : ''}` : ''}
        </span>
        <div className={s.prices}>
          <span className={`price ${s.now}`}>{w.price != null ? brl(w.price) : 'Travada'}</span>
          {w.lowestPrice != null && w.price != null && w.lowestPrice < w.price ? <span className="muted">menor: {brl(w.lowestPrice)}</span> : null}
        </div>
        {editing ? (
          <form onSubmit={save} className={s.metaForm}>
            <span>R$</span>
            <input inputMode="decimal" autoFocus value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ''))} aria-label="Meta de preço em reais" placeholder="299" />
            <button className="btn btn-primary" type="submit">
              Salvar
            </button>
            <button className="btn btn-soft" type="button" onClick={() => setEditing(false)}>
              Cancelar
            </button>
          </form>
        ) : (
          <div className={s.meta}>
            {w.targetPrice != null ? (
              <span className={w.reached ? s.hitTag : s.goal}>
                {w.reached ? `Chegou na meta de ${brl(w.targetPrice)}!` : `Meta ${brl(w.targetPrice)}${gap != null && gap > 0 ? ` · faltam ${brl(gap)}` : ''}`}
              </span>
            ) : (
              <span className="muted">Sem meta</span>
            )}
            <button type="button" className={s.linkBtn} onClick={() => setEditing(true)}>
              {w.targetPrice != null ? 'Mudar meta' : 'Criar meta'}
            </button>
            <button type="button" className={s.linkBtn} onClick={remove}>
              Remover
            </button>
          </div>
        )}
        {err ? (
          <span className="error">
            {err.text}{' '}
            {err.pro ? (
              <Link href="/pro" className="link" style={{ color: 'var(--ink)' }}>
                Ver o Pro
              </Link>
            ) : null}
          </span>
        ) : null}
      </div>
      {w.url && w.reached ? (
        <a href={w.url} target="_blank" rel="noopener noreferrer" className={`btn btn-primary ${s.go}`}>
          Comprar ↗
        </a>
      ) : null}
    </li>
  );
}
