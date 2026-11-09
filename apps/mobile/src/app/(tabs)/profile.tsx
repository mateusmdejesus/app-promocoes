import { CATEGORIES, CATEGORY_NAMES, type Category } from '@keropromo/core';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip, ListRow } from '../../components/Controls';
import { ErrorState, SkeletonList } from '../../components/States';
import { registerForPush } from '../../notifications';
import { useSession } from '../../session';
import { color, gutter, type } from '../../theme';
import { useAsync } from '../../useAsync';

/** Páginas legais. Trocar pelo domínio definitivo antes de publicar. */
const LEGAL_URL = 'https://keropromo.app';

export default function Profile() {
  const { api } = useSession();
  const { data, error, loading, reload } = useAsync(() => api.me(), []);
  const [picked, setPicked] = useState<Set<Category>>(new Set());
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (data) setPicked(new Set(data.categories));
  }, [data]);

  const toggle = async (c: Category) => {
    const next = new Set(picked);
    next.has(c) ? next.delete(c) : next.add(c);
    if (next.size === 0) return; // pelo menos um interesse
    Haptics.selectionAsync();
    setPicked(next);
    try {
      await api.updateMe({ categories: [...next] });
    } catch {
      setPicked(picked);
    }
  };

  const enablePush = async () => {
    const token = await registerForPush();
    if (token) {
      await api.updateMe({ pushToken: token });
      setSaved('Notificações ativadas.');
    } else {
      // Se a pessoa já recusou, só os Ajustes do sistema podem reativar.
      Linking.openSettings();
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[type.display, { color: color.ink, fontSize: 32 }]} accessibilityRole="header">
          Perfil
        </Text>

        <View style={{ gap: 12 }}>
          <Text style={[type.title, { color: color.ink }]}>Seus interesses</Text>
          <Text style={[type.body, { color: color.inkMuted, fontSize: 15, lineHeight: 22 }]}>
            Ordenam o "Pra você" e decidem quais ofertas quentes viram notificação. O app também aprende com o que você abre e salva aqui dentro.
          </Text>
          {loading && !data ? (
            <SkeletonList rows={1} />
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : (
            <View style={styles.chips}>
              {CATEGORIES.map((c) => (
                <Chip key={c} label={CATEGORY_NAMES[c]} selected={picked.has(c)} onPress={() => toggle(c)} />
              ))}
            </View>
          )}
        </View>

        <View>
          <Text style={[type.title, { color: color.ink, marginBottom: 4 }]}>Ajustes</Text>
          <ListRow title="Notificações" subtitle={saved ?? 'No máximo 5 por dia, nada entre 23h e 8h'} onPress={enablePush} />
          <ListRow title="Termos de Uso" onPress={() => Linking.openURL(LEGAL_URL + '/termos')} />
          <ListRow title="Política de Privacidade" onPress={() => Linking.openURL(LEGAL_URL + '/privacidade')} last />
        </View>

        <Text style={[type.caption, { color: color.inkMuted }]}>
          Os links para as lojas são de parceiros: o keropromo pode ganhar uma comissão quando você compra, sem custo a mais para você.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  content: { paddingHorizontal: gutter, paddingTop: 12, paddingBottom: 48, gap: 32 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
