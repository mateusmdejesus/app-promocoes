import { formatBRL } from '@keropromo/core';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { timeAgo } from '../../api';
import { CircleButton, PrimaryButton } from '../../components/Controls';
import { DiscountBadge } from '../../components/DiscountBadge';
import { PriceChart } from '../../components/PriceChart';
import { ProductImage } from '../../components/ProductImage';
import { ErrorState, SkeletonList } from '../../components/States';
import { useSession } from '../../session';
import { color, font, gutter, radius, type } from '../../theme';
import { useAsync } from '../../useAsync';

export default function OfferDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useSession();
  const insets = useSafeAreaInsets();
  const { data, error, loading, reload } = useAsync(() => api.offer(id), [id]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.event('view', id).catch(() => undefined);
  }, [api, id]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!data) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 8, paddingHorizontal: gutter, gap: 16 }]}>
        <CircleButton icon="back" label="Voltar" onPress={back} background={color.surface} />
        {loading ? <SkeletonList rows={0} /> : <ErrorState message={error ?? 'Oferta não encontrada.'} onRetry={reload} />}
      </View>
    );
  }

  const { offer, history } = data;
  const goToStore = () => {
    api.event('click_out', offer.id).catch(() => undefined);
    Linking.openURL(offer.url);
  };
  const toggleSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!saved) api.event('save', offer.id).catch(() => undefined);
    setSaved(!saved);
  };
  const share = () => Share.share({ message: `${offer.title} por ${formatBRL(offer.price)} (−${offer.discountPct}%) no ${offer.storeName}: ${offer.url}` });
  const minPrice = Math.min(...history.map((h) => h.price), offer.price);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}>
        <View>
          <ProductImage uri={offer.imageUrl} style={{ height: 300 + insets.top }} />
          <View style={[styles.topBar, { top: insets.top + 8 }]}>
            <CircleButton icon="back" label="Voltar" onPress={back} background={color.surface} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <CircleButton icon="share" label="Compartilhar" onPress={share} background={color.surface} />
              <CircleButton icon="heart" label={saved ? 'Remover dos salvos' : 'Salvar'} onPress={toggleSave} background={saved ? color.stone : color.surface} />
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.metaRow}>
            <DiscountBadge pct={offer.discountPct} tier={offer.tier} size="s" />
            <Text style={styles.meta}>
              {offer.storeName} · {timeAgo(offer.detectedAt)}
            </Text>
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {offer.title}
          </Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatBRL(offer.price)}</Text>
            <Text style={styles.was} accessibilityLabel={`antes ${formatBRL(offer.referencePrice)}`}>
              {formatBRL(offer.referencePrice)}
            </Text>
          </View>
          {!offer.verified ? <Text style={styles.meta}>Desconto informado pela loja. Ainda estamos juntando o histórico deste produto.</Text> : null}
        </View>

        <View style={styles.why}>
          <Text style={[type.label, { color: color.ink, fontFamily: font.semibold }]} accessibilityRole="header">
            Por que é uma boa oferta
          </Text>
          <View style={styles.tiles}>
            <View style={styles.tile}>
              <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>−{offer.discountPct}%</Text>
              <Text style={styles.tileLabel}>{offer.verified ? 'abaixo do preço normal' : 'segundo a loja'}</Text>
            </View>
            <View style={styles.tile}>
              <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{formatBRL(offer.referencePrice - offer.price)}</Text>
              <Text style={styles.tileLabel}>de economia</Text>
            </View>
            <View style={styles.tile}>
              <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{offer.lowestIn90d ? 'Menor' : formatBRL(offer.referencePrice)}</Text>
              <Text style={styles.tileLabel}>{offer.lowestIn90d ? 'preço em 90 dias' : 'preço normal'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={[type.label, { color: color.ink, fontFamily: font.semibold }]}>Histórico de preço</Text>
            <Text style={styles.meta}>90 dias</Text>
          </View>
          <PriceChart points={history} reference={offer.referencePrice} hot={offer.tier === 'hot'} />
          <View style={styles.cardHead}>
            <Text style={styles.meta}>Normal: {formatBRL(offer.referencePrice)}</Text>
            <Text style={[type.caption, { color: color.ink, fontFamily: font.semibold }]}>
              {offer.price <= minPrice ? `Hoje: ${formatBRL(offer.price)}, o menor` : `Hoje: ${formatBRL(offer.price)}`}
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.cta, { paddingBottom: insets.bottom + 12 }]}>
        <PrimaryButton label="Ir para a loja" icon="external" onPress={goToStore} />
        <Text style={styles.disclosure}>Link de parceiro: podemos ganhar comissão, você não paga nada a mais.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  body: { paddingHorizontal: gutter, paddingTop: 20, gap: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { ...type.caption, color: color.inkMuted },
  title: { fontFamily: font.semibold, fontSize: 20, lineHeight: 26, color: color.ink, marginTop: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  price: { fontFamily: font.display, fontSize: 40, lineHeight: 46, letterSpacing: -1.2, color: color.ink },
  was: { fontFamily: font.body, fontSize: 16, color: color.inkMuted, textDecorationLine: 'line-through' },
  why: { marginHorizontal: gutter, marginTop: 24, gap: 10 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, backgroundColor: color.surface, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12, gap: 2 },
  tileValue: { fontFamily: font.display, fontSize: 20, lineHeight: 24, color: color.ink, letterSpacing: -0.4 },
  tileLabel: { fontFamily: font.body, fontSize: 12, lineHeight: 16, color: color.inkMuted },
  card: { marginHorizontal: gutter, marginTop: 12, backgroundColor: color.surface, borderRadius: radius.card, padding: 16, gap: 10 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: color.paper, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, paddingHorizontal: gutter, paddingTop: 12, gap: 8 },
  disclosure: { ...type.caption, fontSize: 12, lineHeight: 16, color: color.inkMuted, textAlign: 'center' },
});
