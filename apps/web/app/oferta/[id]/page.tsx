import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DiscountBadge } from '../../../components/OfferCard';
import { api, brl, timeAgo } from '../../../lib/api';
import { OfferActions } from './OfferActions';
import { PriceChart } from './PriceChart';
import s from './oferta.module.css';

export const revalidate = 300;

async function load(id: string) {
  // Visão pública (como o Google vê). Quem é Pro recebe a versão completa no navegador.
  return api.offer(decodeURIComponent(id), 300).catch(() => null);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const data = await load((await params).id);
  if (!data) return { title: 'Oferta não encontrada' };
  const o = data.offer;
  return {
    title: `${o.title}: histórico de preço e desconto real`,
    description: `${o.title} com ${o.discountPct}% de desconto no ${o.storeName}, com o histórico de preço do produto.`,
  };
}

export default async function OfertaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await load(id);
  if (!data) notFound();
  const { offer: o, history, historyDays } = data;
  const open = !o.locked && o.price != null && o.referencePrice != null;

  return (
    <div className="container" style={{ paddingTop: 28 }}>
      <nav aria-label="Caminho" className={s.crumbs}>
        <Link href="/ofertas">Ofertas</Link> <span>/</span> <span>{o.title}</span>
      </nav>
      <div className={s.top}>
        <div className={s.photo}>{o.imageUrl ? <img src={o.imageUrl} alt={o.title} /> : null}</div>
        <div className={s.info}>
          <div className={s.meta}>
            <DiscountBadge offer={o} />
            <span className="muted">
              {o.storeName} · detectada {timeAgo(o.detectedAt)}
            </span>
          </div>
          <h1 className={s.title}>{o.title}</h1>

          {open ? (
            <>
              <div className={s.priceRow}>
                <span className={`price ${s.price}`}>{brl(o.price!)}</span>
                <span className="strike" style={{ fontSize: 20 }}>
                  {brl(o.referencePrice!)}
                </span>
              </div>
              <div className={s.tiles}>
                <div className="card">
                  <span className="price">−{o.discountPct}%</span>
                  <span className="muted">{o.verified ? 'abaixo do preço normal' : 'segundo a loja'}</span>
                </div>
                <div className="card">
                  <span className="price">{brl(Math.round((o.referencePrice! - o.price!) / 100) * 100)}</span>
                  <span className="muted">de economia</span>
                </div>
                <div className="card">
                  <span className="price">{o.lowestIn90d ? 'Menor' : brl(o.referencePrice!)}</span>
                  <span className="muted">{o.lowestIn90d ? 'preço em 90 dias' : 'preço normal'}</span>
                </div>
              </div>
            </>
          ) : null}

          <OfferActions id={o.id} publicLocked={!open} storeName={o.storeName} url={o.url} />
          <span className="muted" style={{ fontSize: 13 }}>
            Preço pode mudar a qualquer momento; confira na loja.
          </span>
        </div>
      </div>

      {open && history.length > 1 ? (
        <section className={`card ${s.history}`}>
          <div className={s.historyHead}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Histórico de preço</h2>
            <span className="muted">{historyDays} dias</span>
          </div>
          <PriceChart points={history} reference={o.referencePrice!} hot={o.tier === 'hot'} />
          <div className={s.historyFoot}>
            <span className="muted">Normal: {brl(o.referencePrice!)}</span>
            <strong>Hoje: {brl(o.price!)}</strong>
          </div>
          {historyDays < 90 ? (
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              No grátis, o histórico mostra {historyDays} dias.{' '}
              <Link href="/pro" className="link" style={{ color: 'var(--ink)' }}>
                Ver 90 dias com o Pro
              </Link>
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
