'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from '../../../components/Session';
import { api, ApiError, brl } from '../../../lib/api';
import s from './oferta.module.css';

/** "Vigiar preço" + meta: avisa por e-mail quando o produto chegar no preço que a pessoa quer. */
export function WatchBox({ id, price }: { id: string; price: number | null }) {
  const { me, ready } = useSession();
  const [watching, setWatching] = useState<{ targetPrice: number | null } | null | undefined>(undefined);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error' | 'pro'; text: string } | null>(null);

  useEffect(() => {
    if (!me?.identified) return;
    api
      .offerForMe(id)
      .then((r) => {
        setWatching(r.watching);
        if (r.watching?.targetPrice) setValue(String(r.watching.targetPrice / 100).replace('.', ','));
      })
      .catch(() => setWatching(null));
  }, [me, id]);

  if (!ready) return null;
  if (!me?.identified) {
    return (
      <div className={`card ${s.watch}`}>
        <strong>Quer esperar baixar?</strong>
        <span className="muted">Entre para vigiar este produto e receber um e-mail quando ele chegar no preço que você quer.</span>
        <Link href="/entrar" className="btn btn-soft" style={{ alignSelf: 'flex-start' }}>
          Entrar e vigiar
        </Link>
      </div>
    );
  }
  if (watching === undefined) return null;

  const fail = (e: unknown) =>
    setMsg(e instanceof ApiError && e.status === 402 ? { kind: 'pro', text: e.message } : { kind: 'error', text: (e as Error).message || 'Algo deu errado. Tente de novo.' });

  const toggle = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (watching) {
        await api.deleteWatch(id);
        setWatching(null);
        setValue('');
      } else {
        await api.saveWatch(id);
        setWatching({ targetPrice: null });
        setMsg({ kind: 'ok', text: 'Salvo em Vigiando.' });
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const saveTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    const reais = Number(value.replace(/\./g, '').replace(',', '.'));
    const target = value.trim() === '' ? null : Math.round(reais * 100);
    if (target !== null && (!Number.isFinite(reais) || target <= 0)) {
      setMsg({ kind: 'error', text: 'Escreva um valor, por exemplo 299 ou 299,90.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await api.saveWatch(id, target);
      setWatching({ targetPrice: target });
      setMsg({ kind: 'ok', text: target ? `Pronto: te avisamos por e-mail quando chegar em ${brl(target)}.` : 'Meta removida.' });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`card ${s.watch}`}>
      <div className={s.watchHead}>
        <strong>{watching ? 'Você está vigiando este produto' : 'Vigiar o preço'}</strong>
        <button type="button" className={`btn ${watching ? 'btn-soft' : 'btn-primary'}`} onClick={toggle} disabled={busy}>
          {watching ? 'Parar de vigiar' : 'Vigiar'}
        </button>
      </div>
      {watching ? (
        <form onSubmit={saveTarget} className={s.watchForm}>
          <label htmlFor="meta">Me avisa por e-mail quando chegar em</label>
          <div className={s.watchRow}>
            <span className={s.watchPrefix}>R$</span>
            <input
              id="meta"
              inputMode="decimal"
              placeholder={price ? String(Math.floor((price * 0.85) / 100)) : '299'}
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ''))}
            />
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {watching.targetPrice ? 'Mudar meta' : 'Criar meta'}
            </button>
          </div>
        </form>
      ) : (
        <span className="muted">Salve para acompanhar o preço em Vigiando e, se quiser, criar uma meta.</span>
      )}
      {msg ? (
        <span role={msg.kind === 'ok' ? 'status' : 'alert'} className={msg.kind === 'ok' ? 'muted' : 'error'}>
          {msg.text}{' '}
          {msg.kind === 'pro' ? (
            <Link href="/pro" className="link" style={{ color: 'var(--ink)' }}>
              Ver o Pro
            </Link>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
