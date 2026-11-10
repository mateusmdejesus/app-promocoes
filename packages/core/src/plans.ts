import type { Tier } from './types';

export type Plan = 'free' | 'pro';
export type BillingPeriod = 'monthly' | 'yearly';

/** Preços em centavos (decididos pelo dono do produto). Sem período de teste. */
export const PRICES: Record<BillingPeriod, number> = { monthly: 1490, yearly: 11900 };

export interface PlanLimits {
  /** Quantos alertas a pessoa pode ter. */
  alerts: number;
  /** Dias de histórico de preço visíveis. */
  historyDays: number;
  /** Atraso para ver uma oferta quente (40%+) depois que ela aparece. */
  hotDelayMin: number;
  /** Recebe notificação instantânea de oferta quente nas categorias escolhidas. */
  hotPush: boolean;
  /** Consultas "esse desconto é real?" por mês. */
  checksPerMonth: number;
}

export const LIMITS: Record<Plan, PlanLimits> = {
  free: { alerts: 1, historyDays: 7, hotDelayMin: 60, hotPush: false, checksPerMonth: 3 },
  pro: { alerts: 200, historyDays: 90, hotDelayMin: 0, hotPush: true, checksPerMonth: Infinity },
};

export function planFor(proUntil: Date | undefined, now: Date): Plan {
  return proUntil && proUntil.getTime() > now.getTime() ? 'pro' : 'free';
}

/**
 * No plano grátis, a oferta quente só é liberada `hotDelayMin` minutos depois
 * de aparecer. Devolve o momento em que libera, ou undefined se já está liberada.
 */
export function lockedUntil(plan: Plan, tier: Tier, detectedAt: Date, now: Date): Date | undefined {
  const delay = LIMITS[plan].hotDelayMin;
  if (tier !== 'hot' || delay <= 0) return undefined;
  const at = new Date(detectedAt.getTime() + delay * 60_000);
  return at.getTime() > now.getTime() ? at : undefined;
}
