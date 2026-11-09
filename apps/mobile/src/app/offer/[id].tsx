import { formatBRL } from '@keropromo/core';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { timeAgo, unlockLabel, type Offer } from '../../api';
import { CircleButton, PrimaryButton, TextButton } from '../../components/Controls';
import { DiscountBadge } from '../../components/DiscountBadge';
import { Icon } from '../../components/Icon';
import { PriceChart } from '../../components/PriceChart';
import { ProductImage } from '../../components/ProductImage';
import { ErrorState, SkeletonList } from '../../components/States';
import { useSession } from '../../session';
import { color, font, gutter, radius, type } from '../../theme';
import { useAsync } from '../../useAsync';

type Unlocked = Offer & { price: number; referencePrice: number; url: string };
const isUnlocked = (o: Offer): o is Unlocked => !o.locked && o.price != null && o.referencePrice != null && o.url != null;

export default function OfferDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, me } = useSession();
  const insets = useSafeAreaInsets();
  // Recarrega quando o plano muda (ex.: acabou de assinar na tela de planos).
  const { data, error, loading, reload } = useAsync(() => api.offer(id), [id, me?.plan]);
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

  const { offer, history, historyDays } = data;
  const open = isUnlocked(offer) ? offer : null;
  const toggleSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!saved) api.event('save', offer.id).catch(() => undefined);
    setSaved(!saved);
  };
  const share = () =>
    Share.share({ message: open ? `${open.title} por ${formatBRL(open.price)} (−${open.discountPct}%) no ${open.storeName}: ${open.url}` : `${offer.title} com ${offer.discountPct}% no keropromo` });

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
          {open ? (
            <>
              <View style={styles.priceRow}>
                <Text style={styles.price}>{formatBRL(open.price)}</Text>
                <Text style={styles.was} accessibilityLabel={`antes ${formatBRL(open.referencePrice)}`}>
                  {formatBRL(open.referencePrice)}
                </Text>
              </View>
              {!open.verified ? <Text style={styles.meta}>Desconto informado pela loja. Ainda estamos juntando o histórico deste produto.</Text> : null}
            </>
          ) : null}
        </View>

        {open ? <Facts offer={open} /> : <LockedCard offer={offer} />}

        {open ? (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={[type.label, { color: color.ink, fontFamily: font.semibold }]}>Histórico de preço</Text>
              <Text style={styles.meta}>{historyDays} dias</Text>
            </View>
            <PriceChart points={history} reference={open.referencePrice} hot={open.tier === 'hot'} />
            <View style={styles.cardHead}>
              <Text style={styles.meta}>Normal: {formatBRL(open.referencePrice)}</Text>
              <Text style={[type.caption, { color: color.ink, fontFamily: font.semibold }]}>Hoje: {formatBRL(open.price)}</Text>
            </View>
            {me?.plan !== 'pro' ? (
              <View style={styles.upsell}>
                <Text style={[type.caption, { color: color.inkMuted, flex: 1 }]}>No grátis, o histórico mostra {historyDays} dias.</Text>
                <TextButton label="Ver 90 dias com Pro" onPress={() => router.push('/plans')} />
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.cta, { paddingBottom: insets.bottom + 12 }]}>
        {open ? (
          <PrimaryButton
            label={`Ir para ${open.storeName}`}
            icon="external"
            onPress={() => {
              api.event('click_out', open.id).catch(() => undefined);
              Linking.openURL(open.url);
            }}
          />
        ) : (
          <PrimaryButton label="Ver agora com o Pro" onPress={() => router.push('/plans')} />
        )}
      </View>
    </View>
  );
}

/** "Por que é uma boa oferta" (padrão "Why this recommendation" do Headspace). */
function Facts({ offer }: { offer: Unlocked }) {
  const tiles = [
    { value: `−${offer.discountPct}%`, label: offer.verified ? 'abaixo do preço normal' : 'segundo a loja' },
    // Economia arredondada para reais inteiros: cabe no quadro e é o que a pessoa lembra.
    { value: formatBRL(Math.round((offer.referencePrice - offer.price) / 100) * 100), label: 'de economia' },
    offer.lowestIn90d ? { value: 'Menor', label: 'preço em 90 dias' } : { value: formatBRL(offer.referencePrice), label: 'preço normal' },
  ];
  return (
    <View style={styles.why}>
      <Text style={[type.label, { color: color.ink, fontFamily: font.semibold }]} accessibilityRole="header">
        Por que é uma boa oferta
      </Text>
      <View style={styles.tiles}>
        {tiles.map((t) => (
          <View key={t.label} style={styles.tile}>
            <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {t.value}
            </Text>
            <Text style={styles.tileLabel}>{t.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Oferta quente ainda reservada ao Pro: explica o atraso e oferece o Pro. */
function LockedCard({ offer }: { offer: Offer }) {
  return (
    <View style={styles.locked} accessibilityLiveRegion="polite">
      <View style={styles.lockIcon}>
        <Icon name="lock" size={22} stroke={color.paper} width={2} />
      </View>
      <Text style={styles.lockedTitle}>Oferta quente acabou de aparecer.</Text>
      <Text style={[type.body, { color: '#D9D2C6' }]}>
        Quem é Pro já está vendo o preço e o link. No plano grátis, ela {offer.unlocksAt ? unlockLabel(offer.unlocksAt).toLowerCase() : 'libera em breve'}, se ainda estiver valendo.
      </Text>
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
  upsell: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, marginTop: 4 },
  locked: { marginHorizontal: gutter, marginTop: 20, backgroundColor: color.ink, borderRadius: radius.card, padding: 20, gap: 8 },
  lockIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2A2520', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  lockedTitle: { fontFamily: font.display, fontSize: 22, lineHeight: 28, color: color.paper, letterSpacing: -0.4 },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: color.paper, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, paddingHorizontal: gutter, paddingTop: 12 },
});
