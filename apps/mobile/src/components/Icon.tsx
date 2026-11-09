import Svg, { Circle, Path } from 'react-native-svg';
import { color } from '../theme';

export type IconName = 'back' | 'next' | 'share' | 'heart' | 'external' | 'plus' | 'check' | 'search' | 'bell' | 'close' | 'chevron';

const PATHS: Record<IconName, string[]> = {
  back: ['M19 12H5', 'M11 6l-6 6 6 6'],
  next: ['M5 12h14', 'M13 6l6 6-6 6'],
  share: ['M12 3v13', 'M7 8l5-5 5 5', 'M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5'],
  heart: ['M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'],
  external: ['M7 17 17 7', 'M9 7h8v8'],
  plus: ['M12 5v14', 'M5 12h14'],
  check: ['m5 12 5 5L20 7'],
  search: ['m20 20-3.5-3.5'],
  bell: ['M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.9 1.9 0 0 0 3.4 0'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  chevron: ['m9 6 6 6-6 6'],
};

/** Ícones de traço 1,8 pt, cantos arredondados (docs/design/IDENTIDADE.md). */
export function Icon({ name, size = 20, stroke = color.ink, width = 1.8, filled = false }: { name: IconName; size?: number; stroke?: string; width?: number; filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'search' && <Circle cx={11} cy={11} r={7} stroke={stroke} strokeWidth={width} />}
      {PATHS[name].map((d) => (
        <Path key={d} d={d} stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" fill={filled && name === 'heart' ? stroke : 'none'} />
      ))}
    </Svg>
  );
}
