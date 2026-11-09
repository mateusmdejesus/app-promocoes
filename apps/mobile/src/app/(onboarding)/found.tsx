import { CATEGORIES, CATEGORY_NAMES, formatBRL, type Category } from '@keropromo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Offer } from '../../api';
import { CircleButton, PrimaryButton, TextButton } from '../../components/Controls';
import { DiscountBadge } from '../../components/DiscountBadge';
import { useSession } from '../../session';
import { color, font, gutter, type } from '../../theme';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** Tempo mínimo da tela "procurando": rápido demais parece que nada aconteceu. */
const MIN_THINKING_MS = 1400;

type State = { kind: 'thinking' } | { kind: 'error'; message: string } | { kind: 'done'; offers: Offer[] };

function joinNames(cats: Category[]): string {
  const names = cats.map((c) => CATEGORY_NAMES[c]);
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
}

/**
 * Entre o quiz e o pedido de notificação, como o "Thinking carefully…" +
 * resultado personalizado do Headspace: mostra o valor antes de pedir permissão.
 */
export default function Found() {
  const { categories } = useLocalSearchParams<{ categories?: string }>();
  const picked = (categories ?? '').split(',').filter((c): c is Category => (CATEGORIES as readonly string[]).includes(c));
  const { api, saveInterests } = useSession();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<State>({ kind: 'thinking' });

  const run = useCallback(async () => {
    setState({ kind: 'thinking' });
    const started = Date.now();
    try {
      await saveInterests(picked);
      const { offers } = await api.feed();
      const mine = offers.filter((o) => picked.includes(o.category));
      await new Promise((r) => setTimeout(r, Math.max(0, MIN_THINKING_MS - (Date.now() - started))));
      setState({ kind: 'done', offers: mine });
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message || 'Verifique sua conexão.' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  useEffect(() => {
    run();
  }, [run]);

  const next = () => router.push({ pathname: '/notifications', params: { categories } });

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.steps} accessibilityRole="progressbar" accessibilityLabel="Etapa 2 de 3">
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.step, { backgroundColor: i < 2 ? color.paper : '#3A342D' }]} />
        ))}
      </View>

      {state.kind === 'thinking' ? (
        <View style={styles.center} accessibilityLiveRegion="polite">
          <ActivityIndicator color={color.paper} />
          <Text style={styles.thinking}>Procurando promoções em {joinNames(picked)}…</Text>
        </View>
      ) : state.kind === 'error' ? (
        <View style={styles.center}>
          <Text style={styles.thinking}>Não deu pra buscar agora.</Text>
          <Text style={styles.muted}>{state.message}</Text>
          <TextButton label="Tentar de novo" onPress={run} />
        </View>
      ) : (
        <Result offers={state.offers} picked={picked} />
      )}

      <View style={styles.footer}>
        <CircleButton icon="back" label="Voltar" onPress={() => router.back()} background="#2A2520" iconColor={color.paper} />
        <PrimaryButton label="Continuar" icon="next" inverse onPress={next} disabled={state.kind !== 'done'} style={{ flex: 1, marginLeft: 12 }} />
      </View>
    </View>
  );
}

function Result({ offers, picked }: { offers: Offer[]; picked: Category[] }) {
  const hot = offers.filter((o) => o.tier === 'hot').length;
  const enter = (delay: number) => FadeInDown.delay(delay).duration(320).easing(EASE_OUT).reduceMotion(ReduceMotion.System);

  if (offers.length === 0) {
    return (
      <View style={styles.result}>
        <Text style={styles.kicker}>Agora em {joinNames(picked)}</Text>
        <Text style={styles.headline}>Nada com 25% ou mais neste momento.</Text>
        <Text style={styles.muted}>Promoção boa aparece e some rápido. A gente vigia por você e avisa quando surgir.</Text>
      </View>
    );
  }

  return (
    <View style={styles.result}>
      <Animated.View entering={FadeIn.duration(250)} accessible accessibilityLabel={`${offers.length} promoções com 25% ou mais agora, ${hot} quentes.`}>
        <Text style={styles.kicker}>Agora em {joinNames(picked)}</Text>
        <Text style={styles.count}>{offers.length}</Text>
        <Text style={styles.headline}>{offers.length === 1 ? 'promoção' : 'promoções'} com 25% ou mais</Text>
        {hot > 0 ? (
          <View style={styles.hotRow}>
            <View style={styles.dot} />
            <Text style={styles.hotText}>{hot === 1 ? '1 delas é quente: 40% ou mais' : `${hot} delas são quentes: 40% ou mais`}</Text>
          </View>
        ) : null}
      </Animated.View>

      <View style={styles.preview}>
        {offers.slice(0, 3).map((o, i) => (
          <Animated.View key={o.id} entering={enter(200 + i * 60)} style={styles.card}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {o.title}
              </Text>
              <Text style={styles.cardMeta}>
                {formatBRL(o.price)} · {o.storeName}
              </Text>
            </View>
            <DiscountBadge pct={o.discountPct} tier={o.tier} size="s" inverse />
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ink, paddingHorizontal: gutter },
  steps: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, height: 4, borderRadius: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 12 },
  thinking: { fontFamily: font.display, fontSize: 24, lineHeight: 30, color: color.paper, textAlign: 'center', letterSpacing: -0.5 },
  muted: { ...type.body, color: '#B9B2A6' },
  result: { flex: 1, justifyContent: 'flex-start', paddingTop: 48, gap: 28 },
  kicker: { fontFamily: font.medium, fontSize: 15, color: '#B9B2A6' },
  count: { fontFamily: font.display, fontSize: 112, lineHeight: 112, color: color.paper, letterSpacing: -5, marginTop: 8 },
  headline: { fontFamily: font.display, fontSize: 26, lineHeight: 30, color: color.paper, letterSpacing: -0.6 },
  hotRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.signal },
  hotText: { fontFamily: font.body, fontSize: 15, color: '#D9D2C6' },
  preview: { gap: 8 },
  card: { backgroundColor: '#24201B', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { fontFamily: font.medium, fontSize: 15, color: color.paper },
  cardMeta: { fontFamily: font.body, fontSize: 13, color: '#B9B2A6' },
  footer: { flexDirection: 'row', alignItems: 'center' },
});
