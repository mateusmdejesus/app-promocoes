import Link from 'next/link';
import { brl, timeAgo, unlockLabel, type Offer } from '../lib/api';
import { LockIcon } from './Brand';
import styles from './OfferCard.module.css';

export function DiscountBadge({ offer, onDark }: { offer: Pick<Offer, 'discountPct' | 'tier'>; onDark?: boolean }) {
  if (offer.tier === 'none') return null;
  const hot = offer.tier === 'hot';
  return (
    <span className={`badge ${hot ? 'badge-hot' : 'badge-promo'} ${onDark ? 'badge-on-dark' : ''}`}>
      −{offer.discountPct}%{hot ? ' quente' : ''}
    </span>
  );
}

/**
 * Oferta quente travada no plano grátis: o preço aparece borrado e o botão
 * leva direto para o Pro. É o principal ponto de venda dentro da vitrine.
 */
function Locked({ offer, compact }: { offer: Offer; compact?: boolean }) {
  return (
    <div className={styles.locked}>
      <span className={styles.blurred} aria-hidden="true">
        R$ 000
      </span>
      <span className="pill-lock">
        <LockIcon />
        {offer.unlocksAt ? unlockLabel(offer.unlocksAt) : 'Só no Pro'}
      </span>
      {!compact ? <span className={styles.unlock}>Ver agora</span> : null}
    </div>
  );
}

const href = (o: Offer) => (o.locked ? '/pro' : `/oferta/${encodeURIComponent(o.id)}`);
const label = (o: Offer) =>
  o.locked || o.price == null
    ? `${o.title}. Oferta quente de ${o.discountPct}%, travada no plano grátis. Assine o Pro para ver agora.`
    : `${o.title}. ${brl(o.price)}, ${o.discountPct}% de desconto. ${o.storeName}.`;

export function OfferCard({ offer }: { offer: Offer }) {
  return (
    <Link href={href(offer)} className={`card ${styles.card}`} aria-label={label(offer)}>
      <div className={styles.photo}>
        {offer.imageUrl ? <img src={offer.imageUrl} alt="" loading="lazy" /> : null}
        <span className={styles.badgeSpot}>
          <DiscountBadge offer={offer} />
        </span>
      </div>
      <div className={styles.body}>
        <span className={styles.meta}>
          {offer.storeName} · {timeAgo(offer.detectedAt)}
        </span>
        <span className={styles.title}>{offer.title}</span>
        {offer.price == null || offer.referencePrice == null ? (
          <Locked offer={offer} />
        ) : (
          <span className={styles.priceRow}>
            <span className={`price ${styles.price}`}>{brl(offer.price)}</span>
            <span className="strike" style={{ fontSize: 14 }}>
              {brl(offer.referencePrice)}
            </span>
          </span>
        )}
      </div>
    </Link>
  );
}

export function OfferRow({ offer }: { offer: Offer }) {
  return (
    <Link href={href(offer)} className={`card ${styles.row}`} aria-label={label(offer)}>
      <div className={styles.thumb}>{offer.imageUrl ? <img src={offer.imageUrl} alt="" loading="lazy" /> : null}</div>
      <div className={styles.rowBody}>
        <span className={styles.meta}>{offer.storeName}</span>
        <span className={styles.rowTitle}>{offer.title}</span>
        <span className={styles.rowFoot}>
          {offer.price == null ? <Locked offer={offer} compact /> : <span className={`price ${styles.rowPrice}`}>{brl(offer.price)}</span>}
          <DiscountBadge offer={offer} />
        </span>
      </div>
    </Link>
  );
}
