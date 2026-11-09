import { STORE_NAMES, type StoreId, type Tier } from '@keropromo/core';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, PrimaryButton, TextButton } from '../components/Controls';
import { PressableScale } from '../components/PressableScale';
import { useSession } from '../session';
import { color, font, gutter, radius, type } from '../theme';

const LEVELS: Array<{ tier: Tier; label: string }> = [
  { tier: 'none', label: 'Qualquer' },
  { tier: 'promo', label: '25% ou +' },
  { tier: 'hot', label: '40% ou +' },
];
const STORES: StoreId[] = ['mercadolivre', 'amazon', 'magalu', 'aliexpress', 'kabum'];

/** "R$ 1.299,90" → 129990 centavos. */
function parsePrice(text: string): number | undefined {
  const digits = text.replace(/[^\d,]/g, '').replace(',', '.');
  const v = Number.parseFloat(digits);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : undefined;
}

function Field({ label, ...input }: { label: string } & React.ComponentProps<typeof TextInput>) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...input}
        accessibilityLabel={label}
        placeholderTextColor={color.inkMuted}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, focused && styles.inputFocused]}
      />
    </View>
  );
}

export default function NewAlert() {
  const { api } = useSession();
  const insets = useSafeAreaInsets();
  const [term, setTerm] = useState('');
  const [price, setPrice] = useState('');
  const [minTier, setMinTier] = useState<Tier>('none');
  const [stores, setStores] = useState<StoreId[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxPrice = parsePrice(price);
  const valid = term.trim().length >= 2 && (maxPrice !== undefined || minTier !== 'none');

  const toggleStore = (s: StoreId) => setStores((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createAlert({ term: term.trim(), maxPrice, minTier, stores, enabled: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.head}>
          <Text style={[type.title, { color: color.ink, fontSize: 24 }]} accessibilityRole="header">
            Novo alerta
          </Text>
          <TextButton label="Cancelar" onPress={() => router.back()} />
        </View>

        <Field label="O que você procura?" value={term} onChangeText={setTerm} placeholder="ex.: air fryer" autoFocus autoCapitalize="none" returnKeyType="next" />
        <Field label="Preço máximo" value={price} onChangeText={setPrice} placeholder="R$ 300" keyboardType="decimal-pad" />

        <View style={{ gap: 8 }}>
          <Text style={styles.label}>Desconto mínimo</Text>
          <View style={styles.segment} accessibilityRole="radiogroup">
            {LEVELS.map((l) => {
              const on = minTier === l.tier;
              return (
                <PressableScale
                  key={l.tier}
                  onPress={() => (Haptics.selectionAsync(), setMinTier(l.tier))}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={[styles.segmentItem, on && styles.segmentOn]}
                >
                  <Text style={[styles.segmentText, on && { fontFamily: font.semibold }]}>{l.label}</Text>
                </PressableScale>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={styles.label}>Lojas</Text>
          <View style={styles.chips}>
            <Chip label="Todas" selected={stores.length === 0} onPress={() => setStores([])} />
            {STORES.map((s) => (
              <Chip key={s} label={STORE_NAMES[s]} selected={stores.includes(s)} onPress={() => toggleStore(s)} />
            ))}
          </View>
        </View>

        {!valid && term.trim().length >= 2 ? <Text style={[type.caption, { color: color.inkMuted }]}>Defina um preço máximo ou um desconto mínimo.</Text> : null}
        {error ? (
          <Text style={[type.caption, { color: color.ink }]} accessibilityLiveRegion="assertive">
            {error}
          </Text>
        ) : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <PrimaryButton label="Criar alerta" onPress={save} disabled={!valid} loading={busy} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter, paddingTop: 20, paddingBottom: 24, gap: 20 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { ...type.label, color: color.ink },
  input: { height: 48, borderRadius: radius.field, backgroundColor: color.stone, paddingHorizontal: 14, fontFamily: font.body, fontSize: 16, color: color.ink, borderWidth: 2, borderColor: 'transparent' },
  inputFocused: { backgroundColor: color.surface, borderColor: color.ink },
  segment: { flexDirection: 'row', backgroundColor: color.stone, borderRadius: radius.field, padding: 4, gap: 4 },
  segmentItem: { flex: 1, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: color.surface },
  segmentText: { fontFamily: font.body, fontSize: 14, color: color.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footer: { paddingHorizontal: gutter, paddingTop: 8 },
});
