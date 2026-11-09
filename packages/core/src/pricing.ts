import type { Cents, PriceAnalysis, PricePoint, Tier } from './types';

/** Regras definidas pelo produto. */
export const PROMO_MIN_PCT = 25;
export const HOT_MIN_PCT = 40;

/** Janela usada para o preço normal e para "menor preço". */
export const HISTORY_WINDOW_DAYS = 90;
/** Histórico mínimo para confiar na nossa própria referência. */
export const MIN_VERIFIED_HISTORY_DAYS = 7;
/** Pontos das últimas horas não entram na referência (é a própria queda). */
const RECENT_EXCLUSION_HOURS = 24;
/** "De" anunciado mais que 15% acima do preço normal é considerado inflado. */
const INFLATION_TOLERANCE = 1.15;

const DAY_MS = 86_400_000;

export function tierFor(discountPct: number): Tier {
  if (discountPct >= HOT_MIN_PCT) return 'hot';
  if (discountPct >= PROMO_MIN_PCT) return 'promo';
  return 'none';
}

export function discountPct(price: Cents, reference: Cents): number {
  if (reference <= 0 || price >= reference) return 0;
  return Math.floor((1 - price / reference) * 100);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

/**
 * Analisa o preço atual contra o histórico.
 *
 * O desconto mostrado no app é o desconto REAL: comparado com o preço mediano
 * que a gente observou nos últimos 90 dias, não com o "de" que a loja anuncia.
 * Isso pega a tática de subir o preço antes de "dar desconto".
 *
 * Sem histórico suficiente, usa o "de" da loja e marca `verified: false`.
 */
export function analyzePrice(current: PricePoint, history: PricePoint[], now: Date = current.at): PriceAnalysis {
  const windowStart = now.getTime() - HISTORY_WINDOW_DAYS * DAY_MS;
  const inWindow = history.filter((p) => p.at.getTime() >= windowStart && p.at.getTime() <= now.getTime());
  const cutoff = now.getTime() - RECENT_EXCLUSION_HOURS * 3_600_000;
  const baseline = inWindow.filter((p) => p.at.getTime() < cutoff);

  const oldest = inWindow.reduce<number | null>((m, p) => (m === null || p.at.getTime() < m ? p.at.getTime() : m), null);
  const historyDays = oldest === null ? 0 : Math.floor((now.getTime() - oldest) / DAY_MS);

  const verified = historyDays >= MIN_VERIFIED_HISTORY_DAYS && baseline.length >= 3;
  const observedNormal = baseline.length > 0 ? median(baseline.map((p) => p.price)) : undefined;

  let referencePrice: Cents;
  if (verified && observedNormal !== undefined) {
    referencePrice = observedNormal;
  } else {
    referencePrice = current.listPrice ?? observedNormal ?? current.price;
  }

  const inflatedListPrice =
    current.listPrice !== undefined && observedNormal !== undefined && verified
      ? current.listPrice > observedNormal * INFLATION_TOLERANCE
      : false;

  const pct = discountPct(current.price, referencePrice);
  const minInWindow = Math.min(current.price, ...inWindow.map((p) => p.price));

  return {
    price: current.price,
    referencePrice,
    discountPct: pct,
    tier: tierFor(pct),
    verified,
    inflatedListPrice,
    lowestInWindow: inWindow.length > 0 && current.price <= minInWindow,
    historyDays,
  };
}
