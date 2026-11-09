import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Offer } from '../../api';
import { Icon } from '../../components/Icon';
import { OfferRow } from '../../components/Offer';
import { EmptyState, ErrorState } from '../../components/States';
import { useSession } from '../../session';
import { color, font, gutter, radius } from '../../theme';

export default function Search() {
  const { api } = useSession();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Offer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Busca enquanto digita, com 300 ms de espera para não disparar a cada letra.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setResults(null);
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const r = await api.search(term);
        if (alive) (setResults(r.offers), setError(null));
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    }, 300);
    return () => ((alive = false), clearTimeout(t));
  }, [q, api, attempt]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.bar}>
        <View style={[styles.field, focused && styles.fieldFocused]}>
          <Icon name="search" size={18} stroke={color.inkMuted} width={2} />
          <TextInput
            value={q}
            onChangeText={setQ}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Buscar produto ou loja"
            placeholderTextColor={color.inkMuted}
            style={styles.input}
            autoFocus
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Buscar produto ou loja"
          />
        </View>
      </View>
      <FlatList
        data={results ?? []}
        keyExtractor={(o) => o.id}
        renderItem={({ item }) => <OfferRow offer={item} />}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: 32 }}
        ListEmptyComponent={
          error ? (
            <ErrorState message={error} onRetry={() => setAttempt((n) => n + 1)} />
          ) : results ? (
            <EmptyState title="Nenhuma promoção com esse nome agora." body="Crie um alerta na aba Alertas e a gente te avisa quando aparecer." />
          ) : (
            <EmptyState title="O que você está procurando?" body="Só mostramos produtos com 25% ou mais de desconto real." />
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  bar: { paddingHorizontal: gutter, paddingTop: 12, paddingBottom: 8 },
  field: { height: 48, borderRadius: radius.field, backgroundColor: color.stone, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderWidth: 2, borderColor: 'transparent' },
  fieldFocused: { backgroundColor: color.surface, borderColor: color.ink },
  input: { flex: 1, fontFamily: font.body, fontSize: 16, color: color.ink, height: '100%' },
});
