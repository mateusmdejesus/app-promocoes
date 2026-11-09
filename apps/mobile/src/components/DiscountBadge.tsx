import type { Tier } from '@keropromo/core';
import { StyleSheet, Text, View } from 'react-native';
import { color, font, radius } from '../theme';

/**
 * ≥ 25%: contorno. ≥ 40%: fundo laranja com "quente".
 * Texto sobre o laranja é sempre tinta (branco não passa contraste).
 */
export function DiscountBadge({ pct, tier, size = 'm', inverse = false }: { pct: number; tier: Tier; size?: 's' | 'm'; inverse?: boolean }) {
  if (tier === 'none') return null;
  const hot = tier === 'hot';
  return (
    <View
      style={[styles.base, size === 's' && styles.small, hot ? styles.hot : styles.promo, !hot && inverse && { borderColor: color.paper }]}
      accessible
      accessibilityLabel={`${pct}% de desconto${hot ? ', oferta quente' : ''}`}
    >
      <Text style={[styles.text, size === 's' && styles.textSmall, !hot && inverse && { color: color.paper }]}>
        −{pct}%{hot ? ' quente' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.badge, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  small: { paddingHorizontal: 8, paddingVertical: 4 },
  promo: { borderWidth: 1.5, borderColor: color.ink },
  hot: { backgroundColor: color.signal },
  text: { fontFamily: font.displayBold, fontSize: 15, lineHeight: 18, color: color.ink },
  textSmall: { fontSize: 14, lineHeight: 17 },
});
