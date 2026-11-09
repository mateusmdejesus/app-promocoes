import { tokenize } from './personalization';
import type { Cents, StoreId, Tier } from './types';

export interface AlertRule {
  /** Texto livre, ex.: "air fryer". Todas as palavras precisam aparecer no título. */
  term: string;
  maxPrice?: Cents;
  /** Desconto mínimo exigido. `none` = qualquer preço abaixo do máximo. */
  minTier: Tier;
  /** Vazio = qualquer loja. */
  stores: StoreId[];
  enabled: boolean;
}

export interface AlertCandidate {
  title: string;
  store: StoreId;
  price: Cents;
  tier: Tier;
}

const TIER_RANK: Record<Tier, number> = { none: 0, promo: 1, hot: 2 };

export function matchesAlert(rule: AlertRule, c: AlertCandidate): boolean {
  if (!rule.enabled) return false;
  const want = tokenize(rule.term);
  if (want.length === 0) return false;
  const have = new Set(tokenize(c.title));
  if (!want.every((w) => have.has(w))) return false;
  if (rule.stores.length > 0 && !rule.stores.includes(c.store)) return false;
  if (rule.maxPrice !== undefined && c.price > rule.maxPrice) return false;
  if (TIER_RANK[c.tier] < TIER_RANK[rule.minTier]) return false;
  // Sem preço máximo e sem desconto mínimo o alerta dispararia para tudo.
  if (rule.maxPrice === undefined && rule.minTier === 'none') return false;
  return true;
}
