/**
 * Regras de quando um usuário pode receber uma notificação.
 * Prometido na tela de permissão: só oferta quente nas categorias escolhidas
 * ou alertas criados, e no máximo 5 por dia.
 */
export const MAX_PUSHES_PER_DAY = 5;
/** Não repetir o mesmo produto para a mesma pessoa dentro deste prazo. */
export const SAME_PRODUCT_COOLDOWN_DAYS = 7;
/** Silêncio noturno, no horário de Brasília. */
export const QUIET_START_HOUR = 23;
export const QUIET_END_HOUR = 8;

export type PushReason = 'hot_in_interest' | 'alert_match';

export interface PushHistory {
  /** Envios para este usuário nas últimas 24 h. */
  sentLast24h: number;
  /** Último envio deste mesmo produto para este usuário, se houver. */
  lastSentForProduct?: Date;
}

/** Hora local em São Paulo (o Brasil não tem mais horário de verão). */
export function brasiliaHour(now: Date): number {
  return (now.getUTCHours() + 24 - 3) % 24;
}

export function isQuietHours(now: Date): boolean {
  const h = brasiliaHour(now);
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

export function canPush(history: PushHistory, now: Date, reason: PushReason): boolean {
  if (history.sentLast24h >= MAX_PUSHES_PER_DAY) return false;
  if (history.lastSentForProduct) {
    const days = (now.getTime() - history.lastSentForProduct.getTime()) / 86_400_000;
    if (days < SAME_PRODUCT_COOLDOWN_DAYS) return false;
  }
  // Alertas foram pedidos explicitamente; ofertas gerais respeitam o silêncio.
  if (reason === 'hot_in_interest' && isQuietHours(now)) return false;
  return true;
}

export function formatBRL(cents: number): string {
  const reais = cents / 100;
  const fixed = Number.isInteger(reais) ? reais.toLocaleString('pt-BR') : reais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `R$ ${fixed}`;
}
