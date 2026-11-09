import { CATEGORIES, type Category } from './types';

/**
 * Sinais de comportamento DENTRO do app. Não lemos nada de outros apps
 * (o sistema não permite e a LGPD proíbe); o perfil vem só daqui.
 */
export type EventKind = 'view' | 'click_out' | 'save' | 'dismiss' | 'search';

export interface UserEvent {
  kind: EventKind;
  category?: Category;
  /** Para buscas: o texto buscado. */
  query?: string;
  at: Date;
}

const EVENT_WEIGHT: Record<EventKind, number> = {
  view: 0.2,
  click_out: 1,
  save: 1.5,
  dismiss: -1,
  search: 0.6,
};

/** Interesse escolhido no onboarding vale como um sinal forte e permanente. */
const DECLARED_INTEREST_WEIGHT = 2;
/** Comportamento perde metade do peso a cada 14 dias. */
const HALF_LIFE_DAYS = 14;
const DAY_MS = 86_400_000;

export type Affinity = Record<Category, number>;

/**
 * Afinidade do usuário por categoria, normalizada entre 0 e 1.
 * Categorias sem nenhum sinal ficam com um piso baixo para o feed
 * ainda mostrar coisas novas de vez em quando.
 */
export function categoryAffinity(declared: Category[], events: UserEvent[], now: Date): Affinity {
  const raw = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Affinity;
  for (const c of declared) raw[c] += DECLARED_INTEREST_WEIGHT;
  for (const e of events) {
    if (!e.category) continue;
    const ageDays = Math.max(0, (now.getTime() - e.at.getTime()) / DAY_MS);
    raw[e.category] += EVENT_WEIGHT[e.kind] * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
  }
  const max = Math.max(...Object.values(raw));
  const FLOOR = 0.1;
  const out = {} as Affinity;
  for (const c of CATEGORIES) {
    const v = max > 0 ? Math.max(0, raw[c]) / max : 0;
    out[c] = FLOOR + (1 - FLOOR) * v;
  }
  return out;
}

/** Termos buscados recentemente, para dar um empurrão em títulos que batem. */
export function recentSearchTerms(events: UserEvent[], now: Date, maxAgeDays = 30): string[] {
  const terms = new Set<string>();
  for (const e of events) {
    if (e.kind !== 'search' || !e.query) continue;
    if (now.getTime() - e.at.getTime() > maxAgeDays * DAY_MS) continue;
    for (const t of tokenize(e.query)) if (t.length >= 3) terms.add(t);
  }
  return [...terms];
}

/** Minúsculas, sem acento, só letras e números. */
export function tokenize(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Pontuação do feed "Pra você": oferta global × afinidade do usuário. */
export function personalScore(baseScore: number, category: Category, title: string, affinity: Affinity, searchTerms: string[]): number {
  if (baseScore <= 0) return 0;
  const words = new Set(tokenize(title));
  const searchBoost = searchTerms.some((t) => words.has(t)) ? 1.3 : 1;
  return baseScore * (0.3 + affinity[category]) * searchBoost;
}
