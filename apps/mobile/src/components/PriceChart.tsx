import { formatBRL } from '@keropromo/core';
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { color } from '../theme';

/**
 * Menor preço de cada dia nos últimos 90 dias. A linha tracejada é o preço
 * normal (referência); o ponto laranja é hoje, só quando a oferta é quente.
 */
export function PriceChart({ points, reference, hot }: { points: Array<{ day: string; price: number }>; reference: number; hot: boolean }) {
  const [width, setWidth] = useState(0);
  const height = 96;
  const pad = 6;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices, reference);
  const max = Math.max(...prices, reference);
  const span = Math.max(1, max - min);
  const x = (i: number) => pad + (i / Math.max(1, points.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.price).toFixed(1)}`).join(' ');
  const last = points.at(-1);

  const label = last ? `Preço normal ${formatBRL(reference)}. Mínimo no período ${formatBRL(Math.min(...prices))}. Hoje ${formatBRL(last.price)}.` : 'Sem histórico ainda.';
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }} accessible accessibilityRole="image" accessibilityLabel={label}>
      {width > 0 && points.length > 1 ? (
        <Svg width={width} height={height}>
          <Line x1={0} x2={width} y1={y(reference)} y2={y(reference)} stroke={color.stone} strokeDasharray="3 4" />
          <Path d={d} stroke={color.ink} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {last ? <Circle cx={x(points.length - 1)} cy={y(last.price)} r={5} fill={hot ? color.signal : color.ink} stroke={color.ink} strokeWidth={1.5} /> : null}
        </Svg>
      ) : null}
    </View>
  );
}
