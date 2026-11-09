'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { LockIcon } from '../../../components/Brand';
import { useSession } from '../../../components/Session';
import { api, brl, type Offer } from '../../../lib/api';
import s from './oferta.module.css';

/**
 * A página é gerada para o público (e para o Google). Aqui, no navegador,
 * quem é Pro busca a versão liberada de uma oferta quente travada.
 */
export function OfferActions({ id, publicLocked, storeName, url }: { id: string; publicLocked: boolean; storeName: string; url: string | null }) {
  const { me, ready } = useSession();
  const [unlocked, setUnlocked] = useState<Offer | null>(null);
  const [failed, setFailed] = useState(false);

  const unlock = useCallback(() => {
    setFailed(false);
    api
      .offerForMe(id)
      .then((r) => (r.offer.locked || !r.offer.url ? setFailed(true) : setUnlocked(r.offer)))
      .catch(() => setFailed(true));
  }, [id]);

  useEffect(() => {
    if (!me) return;
    api.event('view', id).catch(() => undefined);
    if (publicLocked && me.plan === 'pro') unlock();
  }, [me, id, publicLocked, unlock]);

  const link = unlocked?.url ?? url;
  const goButton = (href: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-lg" style={{ marginTop: 8 }} onClick={() => me && api.event('click_out', id).catch(() => undefined)}>
      Ir para {storeName} ↗
    </a>
  );

  if (!publicLocked) return link ? goButton(link) : null;

  if (unlocked && unlocked.price != null && unlocked.referencePrice != null && unlocked.url) {
    return (
      <>
        <div className={s.priceRow}>
          <span className={`price ${s.price}`}>{brl(unlocked.price)}</span>
          <span className="strike" style={{ fontSize: 20 }}>
            {brl(unlocked.referencePrice)}
          </span>
        </div>
        <span className="muted">Liberada para você pelo Pro, antes de todo mundo.</span>
        {goButton(unlocked.url)}
      </>
    );
  }

  // Visitante ou plano grátis (ou Pro ainda carregando).
  if (ready && me?.plan === 'pro') {
    if (!failed) return <span className="muted">Liberando a oferta…</span>;
    return (
      <>
        <span className="muted">Não conseguimos liberar esta oferta agora.</span>
        <button type="button" className="btn btn-primary btn-lg" style={{ marginTop: 8 }} onClick={unlock}>
          Tentar de novo
        </button>
      </>
    );
  }
  return (
    <>
      <div className={`${s.locked} dark`}>
        <span className={s.lockIcon}>
          <LockIcon size={20} />
        </span>
        <strong className="h3" style={{ color: 'var(--paper)' }}>
          Oferta quente acabou de aparecer.
        </strong>
        <p>Quem é Pro já está vendo o preço e o link. No plano grátis, ela libera 1 hora depois de surgir, se ainda estiver valendo.</p>
      </div>
      <Link href="/pro" className="btn btn-signal btn-lg" style={{ marginTop: 8 }}>
        Ver agora com o Pro
      </Link>
    </>
  );
}
