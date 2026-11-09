import { formatBRL } from '@keropromo/core';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { timeAgo, type Offer } from '../api';
import { color, font, radius, type } from '../theme';
import { DiscountBadge } from './DiscountBadge';
import { PressableScale } from './PressableScale';
import { ProductImage } from './ProductImage';

const open = (o: Offer) => router.push({ pathname: '/offer/[id]', params: { id: o.id } });

const a11y = (o: Offer) =>
  `${o.title}. ${formatBRL(o.price)}, antes ${formatBRL(o.referencePrice)}, ${o.discountPct}% de desconto${o.tier === 'hot' ? ', oferta quente' : ''}. ${o.storeName}, ${timeAgo(o.detectedAt)}.`;

/** Card grande de "Quentes agora". */
export function OfferHeroCard({ offer, width }: { offer: Offer; width?: number }) {
  return (
    <PressableScale onPress={() => open(offer)} accessibilityRole="button" accessibilityLabel={a11y(offer)} style={[styles.hero, width ? { width } : null]}>
      <View>
        <ProductImage uri={offer.imageUrl} style={styles.heroImage} />
        <View style={styles.heroBadge}>
          <DiscountBadge pct={offer.discountPct} tier={offer.tier} />
        </View>
      </View>
      <View style={styles.heroBody}>
        <Text style={styles.meta}>
          {offer.storeName} · {timeAgo(offer.detectedAt)}
        </Text>
        <Text style={type.bodyStrong} numberOfLines={2}>
          {offer.title}
        </Text>
        <View style={styles.priceRow}>
          <Text style={[type.priceHero, styles.ink]}>{formatBRL(offer.price)}</Text>
          <Text style={styles.was}>{formatBRL(offer.referencePrice)}</Text>
        </View>
        {offer.lowestIn90d ? <Text style={styles.meta}>Menor preço dos últimos 90 dias</Text> : null}
      </View>
    </PressableScale>
  );
}

/** Linha da lista "Pra você" e da busca. */
export function OfferRow({ offer }: { offer: Offer }) {
  return (
    <PressableScale onPress={() => open(offer)} accessibilityRole="button" accessibilityLabel={a11y(offer)} style={styles.row}>
      <ProductImage uri={offer.imageUrl} style={styles.thumb} />
      <View style={styles.rowBody}>
        <Text style={styles.meta}>
          {offer.storeName} · {timeAgo(offer.detectedAt)}
        </Text>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {offer.title}
        </Text>
        <Text style={[type.priceRow, styles.ink]}>{formatBRL(offer.price)}</Text>
      </View>
      <DiscountBadge pct={offer.discountPct} tier={offer.tier} size="s" />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: color.surface, borderRadius: radius.card, overflow: 'hidden' },
  heroImage: { height: 160 },
  heroBadge: { position: 'absolute', top: 12, left: 12 },
  heroBody: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, gap: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 2 },
  was: { fontFamily: font.body, fontSize: 14, color: color.inkMuted, textDecorationLine: 'line-through' },
  meta: { ...type.caption, color: color.inkMuted },
  ink: { color: color.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  thumb: { width: 72, height: 72, borderRadius: 12 },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: font.medium, fontSize: 15, lineHeight: 20, color: color.ink },
});
