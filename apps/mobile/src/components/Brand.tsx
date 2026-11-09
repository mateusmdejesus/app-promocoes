import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { color, font } from '../theme';

/** Símbolo da marca: etiqueta de preço. O furo assume a cor do fundo. */
export function TagMark({ size = 26, hole = color.paper, fill = color.signal }: { size?: number; hole?: string; fill?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path d="M24 8H54a6 6 0 0 1 6 6V50a6 6 0 0 1-6 6H24L4 32Z" fill={fill} />
      <Circle cx={20} cy={32} r={5} fill={hole} />
    </Svg>
  );
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="keropromo">
      <TagMark size={size + 4} />
      <Text style={[styles.word, { fontSize: size, letterSpacing: -size * 0.03 }]}>keropromo</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  word: { fontFamily: font.display, color: color.ink },
});
