import { formatBRL, PRICES, type BillingPeriod } from '@keropromo/core';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { billing } from '../billing';
import { TagMark } from '../components/Brand';
import { CircleButton, PrimaryButton, SecondaryButton } from '../components/Controls';
import { Icon } from '../components/Icon';
import { PressableScale } from '../components/PressableScale';
import { useSession } from '../session';
import { color, font, gutter, radius, type } from '../theme';

const LEGAL_URL = 'https://keropromo.com.br';
const SAVING_PCT = Math.round((1 - PRICES.yearly / (PRICES.monthly * 12)) * 100);

const ROWS: Array<{ label: string; free: string; pro: string }> = [
  { label: 'Ofertas quentes (40%+)', free: '1 h depois', pro: 'Na hora' },
  { label: 'Aviso de oferta quente', free: '—', pro: 'Na hora' },
  { label: 'Alertas de produto', free: '1', pro: 'Ilimitados' },
  { label: 'Histórico de preço', free: '7 dias', pro: '90 dias' },
];

/**
 * Tela de planos. Aparece no fim do onboarding e sempre que a pessoa toca
 * em algo do Pro. Sem período de teste (decisão do produto).
 */
export default function Plans() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const onboarding = from === 'onboarding';
  const { api, refreshMe, me } = useSession();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<BillingPeriod>('yearly');
  const [storePrices, setStorePrices] = useState<Partial<Record<BillingPeriod, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    billing.storePrices().then(setStorePrices).catch(() => undefined);
  }, []);

  const price = (p: BillingPeriod) => storePrices[p] ?? formatBRL(PRICES[p]);
  const leave = () => (onboarding ? router.push('/notifications') : router.back());

  const buy = async () => {
    setBusy(true);
    setError(null);
    try {
      if ((await billing.purchase(period, api)) === 'cancelled') return;
      // O servidor libera o Pro pelo webhook da loja; pode levar alguns segundos.
      for (let i = 0; i < 5; i++) {
        if ((await refreshMe())?.plan === 'pro') break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      leave();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setError(null);
    try {
      await billing.restore();
      const m = await refreshMe();
      if (m?.plan === 'pro') leave();
      else setError('Não encontramos assinatura ativa nesta conta da loja.');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (me?.plan === 'pro' && !onboarding) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 24, paddingHorizontal: gutter, gap: 16 }]}>
        <Text style={[type.display, { color: color.ink }]}>Você já é Pro.</Text>
        <Text style={[type.body, { color: color.inkMuted }]}>Para trocar de plano ou cancelar, use os ajustes de assinatura da App Store ou do Google Play.</Text>
        <PrimaryButton label="Fechar" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={[styles.hero, { paddingTop: insets.top + 16 }]}>
          <View style={styles.heroTop}>
            <View style={styles.brand}>
              <TagMark size={24} hole={color.ink} />
              <Text style={styles.brandText}>keropromo Pro</Text>
            </View>
            {!onboarding ? <CircleButton icon="close" label="Fechar" onPress={() => router.back()} background="#2A2520" iconColor={color.paper} /> : null}
          </View>
          <Text style={styles.headline} accessibilityRole="header">
            Chegue antes de a oferta acabar.
          </Text>
          <Text style={styles.math}>Uma air fryer com 52% de desconto economiza R$ 270: paga 1 ano e meio de Pro.</Text>
        </View>

        <View style={styles.options} accessibilityRole="radiogroup">
          <PlanOption
            selected={period === 'yearly'}
            onPress={() => setPeriod('yearly')}
            title="Anual"
            price={`${price('yearly')} por ano`}
            note={`${formatBRL(Math.round(PRICES.yearly / 12))} por mês · ${SAVING_PCT}% mais barato`}
            badge="Melhor preço"
          />
          <PlanOption selected={period === 'monthly'} onPress={() => setPeriod('monthly')} title="Mensal" price={`${price('monthly')} por mês`} />
        </View>
        <View style={styles.table} accessibilityRole="summary">
          <View style={styles.tableHead}>
            <Text style={[styles.cellLabel, { color: color.inkMuted }]} />
            <Text style={[styles.col, styles.colHead]}>Grátis</Text>
            <Text style={[styles.col, styles.colHead, { color: color.ink }]}>Pro</Text>
          </View>
          {ROWS.map((r, i) => (
            <View key={r.label} style={[styles.tableRow, i < ROWS.length - 1 && styles.divider]} accessible accessibilityLabel={`${r.label}: grátis ${r.free === '—' ? 'não tem' : r.free}, Pro ${r.pro}`}>
              <Text style={styles.cellLabel}>{r.label}</Text>
              <Text style={[styles.col, { color: color.inkMuted }]}>{r.free}</Text>
              <Text style={[styles.col, styles.colPro]}>{r.pro}</Text>
            </View>
          ))}
        </View>

      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {error ? (
          <Text style={[type.caption, { color: color.ink }]} accessibilityLiveRegion="assertive">
            {error}
          </Text>
        ) : null}
        <PrimaryButton label={period === 'yearly' ? `Assinar por ${price('yearly')} por ano` : `Assinar por ${price('monthly')} por mês`} onPress={buy} loading={busy} />
        {onboarding ? <SecondaryButton label="Continuar no grátis" onPress={leave} disabled={busy} /> : null}
        <Text style={styles.fine}>
          Cobrança na sua conta da {process.env.EXPO_OS === 'android' ? 'Google Play' : 'App Store'}. Renova automaticamente; cancele quando quiser nos ajustes da loja.
        </Text>
        <View style={styles.links}>
          <Text style={styles.linkText} onPress={restore} accessibilityRole="button">
            Restaurar compras
          </Text>
          <Text style={styles.linkText} onPress={() => Linking.openURL(`${LEGAL_URL}/termos`)} accessibilityRole="link">
            Termos
          </Text>
          <Text style={styles.linkText} onPress={() => Linking.openURL(`${LEGAL_URL}/privacidade`)} accessibilityRole="link">
            Privacidade
          </Text>
        </View>
      </View>
    </View>
  );
}

function PlanOption({ selected, onPress, title, price, note, badge }: { selected: boolean; onPress: () => void; title: string; price: string; note?: string; badge?: string }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} style={[styles.option, selected && styles.optionOn]}>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <Icon name="check" size={14} stroke={color.paper} width={3} /> : null}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.optionTitle}>{title}</Text>
          {badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.optionPrice}>{price}</Text>
        {note ? <Text style={[type.caption, { color: color.inkMuted }]}>{note}</Text> : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  hero: { backgroundColor: color.ink, paddingHorizontal: gutter, paddingBottom: 24, gap: 10 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 52 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandText: { fontFamily: font.display, fontSize: 18, color: color.paper, letterSpacing: -0.4 },
  headline: { fontFamily: font.display, fontSize: 30, lineHeight: 33, color: color.paper, letterSpacing: -0.9, marginTop: 4 },
  math: { fontFamily: font.body, fontSize: 15, lineHeight: 21, color: '#D9D2C6' },
  table: { marginHorizontal: gutter, marginTop: 12, backgroundColor: color.surface, borderRadius: radius.card, paddingHorizontal: 16, paddingVertical: 8 },
  tableHead: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  tableRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  cellLabel: { flex: 1, fontFamily: font.medium, fontSize: 14, lineHeight: 19, color: color.ink, paddingRight: 8 },
  col: { width: 78, textAlign: 'center', fontFamily: font.body, fontSize: 14 },
  colHead: { fontFamily: font.semibold, fontSize: 13, color: color.inkMuted },
  colPro: { fontFamily: font.semibold, color: color.ink },
  options: { marginHorizontal: gutter, marginTop: 16, gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: color.surface, borderRadius: radius.card, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 2, borderColor: 'transparent' },
  optionOn: { borderColor: color.ink },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: color.ink, borderColor: color.ink },
  optionTitle: { fontFamily: font.semibold, fontSize: 16, color: color.ink },
  optionPrice: { fontFamily: font.display, fontSize: 20, lineHeight: 24, color: color.ink, letterSpacing: -0.3 },
  badge: { backgroundColor: color.ink, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontFamily: font.semibold, fontSize: 11, color: color.paper },
  footer: { paddingHorizontal: gutter, paddingTop: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, backgroundColor: color.paper },
  fine: { fontFamily: font.body, fontSize: 11, lineHeight: 15, color: color.inkMuted, textAlign: 'center' },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 20 },
  linkText: { fontFamily: font.medium, fontSize: 12, color: color.ink, textDecorationLine: 'underline', paddingVertical: 6 },
});
