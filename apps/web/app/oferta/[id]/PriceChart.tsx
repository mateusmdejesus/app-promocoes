import { brl } from '../../../lib/api';

/** Gráfico de linha simples em SVG: menor preço de cada dia, linha tracejada = preço normal. */
export function PriceChart({ points, reference, hot }: { points: Array<{ day: string; price: number }>; reference: number; hot: boolean }) {
  const W = 1000;
  const H = 160;
  const pad = 10;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices, reference);
  const max = Math.max(...prices, reference);
  const span = Math.max(1, max - min);
  const x = (i: number) => pad + (i / Math.max(1, points.length - 1)) * (W - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / span) * (H - pad * 2);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.price).toFixed(1)}`).join(' ');
  const last = points[points.length - 1]!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label={`Preço normal ${brl(reference)}. Mínimo no período ${brl(Math.min(...prices))}. Hoje ${brl(last.price)}.`}>
      <line x1={0} x2={W} y1={y(reference)} y2={y(reference)} stroke="var(--stone)" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke="var(--ink)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(points.length - 1)} cy={y(last.price)} r={6} fill={hot ? 'var(--signal)' : 'var(--ink)'} stroke="var(--ink)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
