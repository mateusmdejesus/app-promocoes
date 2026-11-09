import type { Category, PriceAnalysis } from './types';

export interface RankableOffer {
  analysis: PriceAnalysis;
  category: Category;
  /** Quando o preço atual foi detectado. */
  detectedAt: Date;
  /** Cliques "ir para a loja" nas últimas 24 h, de todos os usuários. */
  recentClicks: number;
}

const HOUR_MS = 3_600_000;
/** A "temperatura" de uma oferta cai pela metade a cada 12 h. */
const FRESHNESS_HALF_LIFE_H = 12;

/**
 * Pontuação global de uma oferta (0 a ~100), igual para todo mundo.
 * Usada para "Quentes agora" e como base do feed personalizado.
 */
export function offerScore(o: RankableOffer, now: Date): number {
  const a = o.analysis;
  if (a.tier === 'none') return 0;

  let score = a.discountPct; // 25..100
  if (a.lowestInWindow) score += 12;
  if (a.verified) score += 8;
  else score -= 10; // desconto que só a loja afirma vale menos
  if (a.inflatedListPrice) score -= 5;
  score += Math.min(10, Math.log2(1 + o.recentClicks) * 2);

  const ageH = Math.max(0, (now.getTime() - o.detectedAt.getTime()) / HOUR_MS);
  const freshness = Math.pow(0.5, ageH / FRESHNESS_HALF_LIFE_H);
  return Math.max(0, score * (0.4 + 0.6 * freshness));
}
