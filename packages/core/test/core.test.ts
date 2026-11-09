import { describe, expect, it } from 'vitest';
import {
  analyzePrice,
  canPush,
  categoryAffinity,
  formatBRL,
  matchesAlert,
  offerScore,
  personalScore,
  tierFor,
  type PricePoint,
} from '../src';

const DAY = 86_400_000;
const now = new Date('2026-11-09T15:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY);

/** Um ponto por dia, de `from` dias atrás até ontem, sempre ao mesmo preço. */
function flatHistory(price: number, from = 60): PricePoint[] {
  return Array.from({ length: from }, (_, i) => ({ price, at: daysAgo(from - i) }));
}

describe('tierFor', () => {
  it('segue as regras do produto: 25% promoção, 40% quente', () => {
    expect(tierFor(24)).toBe('none');
    expect(tierFor(25)).toBe('promo');
    expect(tierFor(39)).toBe('promo');
    expect(tierFor(40)).toBe('hot');
  });
});

describe('analyzePrice', () => {
  it('calcula o desconto real contra o preço normal observado', () => {
    const a = analyzePrice({ price: 24900, listPrice: 51900, at: now }, flatHistory(51900));
    expect(a.verified).toBe(true);
    expect(a.referencePrice).toBe(51900);
    expect(a.discountPct).toBe(52);
    expect(a.tier).toBe('hot');
    expect(a.lowestInWindow).toBe(true);
  });

  it('desmascara o "de" inflado: loja diz 50% mas o normal era quase o mesmo preço', () => {
    // Produto sempre custou R$ 120; loja anuncia "de R$ 200 por R$ 100".
    const a = analyzePrice({ price: 10000, listPrice: 20000, at: now }, flatHistory(12000));
    expect(a.inflatedListPrice).toBe(true);
    expect(a.discountPct).toBe(16);
    expect(a.tier).toBe('none');
  });

  it('ignora a subida de preço de véspera ao calcular a referência', () => {
    const history = [...flatHistory(10000), { price: 18000, at: new Date(now.getTime() - 3 * 3_600_000) }];
    const a = analyzePrice({ price: 7000, at: now }, history);
    expect(a.referencePrice).toBe(10000);
    expect(a.discountPct).toBe(30);
  });

  it('sem histórico, usa o "de" da loja e marca como não verificado', () => {
    const a = analyzePrice({ price: 6000, listPrice: 10000, at: now }, []);
    expect(a.verified).toBe(false);
    expect(a.discountPct).toBe(40);
  });

  it('sem histórico e sem "de", não inventa desconto', () => {
    const a = analyzePrice({ price: 6000, at: now }, []);
    expect(a.discountPct).toBe(0);
    expect(a.tier).toBe('none');
  });
});

describe('offerScore', () => {
  const analysis = analyzePrice({ price: 24900, at: now }, flatHistory(51900));
  it('oferta nova vale mais que a mesma oferta antiga', () => {
    const fresh = offerScore({ analysis, category: 'casa', detectedAt: now, recentClicks: 0 }, now);
    const old = offerScore({ analysis, category: 'casa', detectedAt: daysAgo(2), recentClicks: 0 }, now);
    expect(fresh).toBeGreaterThan(old);
  });
  it('sem desconto, pontuação zero', () => {
    const none = analyzePrice({ price: 51900, at: now }, flatHistory(51900));
    expect(offerScore({ analysis: none, category: 'casa', detectedAt: now, recentClicks: 50 }, now)).toBe(0);
  });
});

describe('personalização', () => {
  it('interesse declarado e cliques puxam a categoria para cima', () => {
    const aff = categoryAffinity(['games'], [{ kind: 'click_out', category: 'casa', at: now }], now);
    expect(aff.games).toBe(1);
    expect(aff.casa).toBeGreaterThan(aff.moda);
    expect(aff.moda).toBeCloseTo(0.1);
  });
  it('descartar uma categoria derruba a afinidade', () => {
    const aff = categoryAffinity(['moda', 'casa'], [{ kind: 'dismiss', category: 'moda', at: now }, { kind: 'dismiss', category: 'moda', at: now }], now);
    expect(aff.moda).toBeLessThan(aff.casa);
  });
  it('busca recente impulsiona títulos que batem', () => {
    const aff = categoryAffinity([], [], now);
    const withSearch = personalScore(50, 'casa', 'Air Fryer 4L Digital', aff, ['fryer']);
    const without = personalScore(50, 'casa', 'Air Fryer 4L Digital', aff, []);
    expect(withSearch).toBeGreaterThan(without);
  });
});

describe('alertas', () => {
  const rule = { term: 'air fryer', maxPrice: 30000, minTier: 'none' as const, stores: [], enabled: true };
  it('casa termo sem acento e preço máximo', () => {
    expect(matchesAlert(rule, { title: 'Air Fryer 4L Digital Mondial', store: 'mercadolivre', price: 24900, tier: 'promo' })).toBe(true);
    expect(matchesAlert(rule, { title: 'Air Fryer 4L', store: 'amazon', price: 31000, tier: 'hot' })).toBe(false);
    expect(matchesAlert(rule, { title: 'Fritadeira elétrica', store: 'amazon', price: 20000, tier: 'hot' })).toBe(false);
  });
  it('respeita lojas e desconto mínimo', () => {
    const r = { ...rule, stores: ['amazon' as const], minTier: 'hot' as const };
    expect(matchesAlert(r, { title: 'Air Fryer', store: 'mercadolivre', price: 20000, tier: 'hot' })).toBe(false);
    expect(matchesAlert(r, { title: 'Air Fryer', store: 'amazon', price: 20000, tier: 'promo' })).toBe(false);
    expect(matchesAlert(r, { title: 'Air Fryer', store: 'amazon', price: 20000, tier: 'hot' })).toBe(true);
  });
  it('alerta sem preço e sem desconto mínimo nunca dispara', () => {
    expect(matchesAlert({ ...rule, maxPrice: undefined }, { title: 'Air Fryer', store: 'amazon', price: 1, tier: 'hot' })).toBe(false);
  });
});

describe('notificações', () => {
  const afternoon = new Date('2026-11-09T18:00:00Z'); // 15h em Brasília
  const night = new Date('2026-11-10T03:00:00Z'); // 0h em Brasília
  it('limita a 5 por dia', () => {
    expect(canPush({ sentLast24h: 4 }, afternoon, 'hot_in_interest')).toBe(true);
    expect(canPush({ sentLast24h: 5 }, afternoon, 'alert_match')).toBe(false);
  });
  it('não repete o mesmo produto em 7 dias', () => {
    expect(canPush({ sentLast24h: 0, lastSentForProduct: new Date(afternoon.getTime() - 3 * DAY) }, afternoon, 'alert_match')).toBe(false);
  });
  it('silêncio noturno vale para ofertas gerais, não para alertas', () => {
    expect(canPush({ sentLast24h: 0 }, night, 'hot_in_interest')).toBe(false);
    expect(canPush({ sentLast24h: 0 }, night, 'alert_match')).toBe(true);
  });
});

describe('formatBRL', () => {
  it('formata em reais', () => {
    expect(formatBRL(24900)).toBe('R$ 249');
    expect(formatBRL(2490)).toBe('R$ 24,90');
    expect(formatBRL(129900)).toBe('R$ 1.299');
  });
});
