import { formatBRL, STORE_NAMES } from '@keropromo/core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Alert as RNAlert, FlatList, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Alert } from '../../api';
import { Icon } from '../../components/Icon';
import { PressableScale } from '../../components/PressableScale';
import { EmptyState, ErrorState, SkeletonList } from '../../components/States';
import { useSession } from '../../session';
import { color, font, gutter, radius, type } from '../../theme';
import { useAsync } from '../../useAsync';

function describe(a: Alert): string {
  const parts: string[] = [];
  if (a.maxPrice != null) parts.push(`Até ${formatBRL(a.maxPrice)}`);
  if (a.minTier === 'hot') parts.push('só oferta quente (40% ou mais)');
  else if (a.minTier === 'promo') parts.push('25% ou mais');
  parts.push(a.stores.length ? a.stores.map((s) => STORE_NAMES[s]).join(', ') : 'qualquer loja');
  const text = parts.join(' · ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function Alerts() {
  const { api } = useSession();
  const { data, error, loading, reload, setData } = useAsync(() => api.alerts().then((r) => r.alerts), []);
  // Recarrega ao voltar da tela "Novo alerta".
  useFocusEffect(useCallback(() => void reload(), [])); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (a: Alert, enabled: boolean) => {
    setData((list) => list?.map((x) => (x.id === a.id ? { ...x, enabled } : x)));
    try {
      await api.updateAlert(a.id, { enabled });
    } catch {
      setData((list) => list?.map((x) => (x.id === a.id ? { ...x, enabled: !enabled } : x)));
    }
  };

  const remove = (a: Alert) =>
    RNAlert.alert('Apagar alerta?', `"${a.term}" deixa de ser vigiado.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          await api.deleteAlert(a.id).catch(() => undefined);
          reload();
        },
      },
    ]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={data ?? []}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={[type.display, { color: color.ink, fontSize: 32 }]} accessibilityRole="header">
                Alertas
              </Text>
              <PressableScale onPress={() => router.push('/alert-new')} accessibilityRole="button" style={styles.newButton}>
                <Icon name="plus" size={16} stroke={color.paper} width={2.4} />
                <Text style={styles.newText}>Novo alerta</Text>
              </PressableScale>
            </View>
            <Text style={[type.body, { color: color.inkMuted, fontSize: 15, lineHeight: 22 }]}>Te avisamos quando algo que você quer bater o preço que você definiu.</Text>
          </View>
        }
        renderItem={({ item: a }) => (
          <PressableScale onLongPress={() => remove(a)} accessibilityHint="Toque e segure para apagar" style={styles.card}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.term}>{a.term}</Text>
              <Text style={[type.caption, { color: color.inkMuted, fontSize: 14, lineHeight: 20 }]}>{describe(a)}</Text>
            </View>
            <Switch
              value={a.enabled}
              onValueChange={(v) => toggle(a, v)}
              trackColor={{ true: color.ink, false: color.line }}
              thumbColor={color.surface}
              ios_backgroundColor={color.line}
              accessibilityLabel={`Alerta de ${a.term}`}
            />
          </PressableScale>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          loading && !data ? (
            <SkeletonList rows={2} />
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : (
            <EmptyState title="Nenhum alerta ainda." body={'Crie um, por exemplo "air fryer até R$ 300", e a gente vigia pra você.'} />
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  list: { paddingHorizontal: gutter, paddingBottom: 32 },
  header: { paddingTop: 12, paddingBottom: 20, gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  newButton: { height: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: color.ink, flexDirection: 'row', alignItems: 'center', gap: 6 },
  newText: { fontFamily: font.semibold, fontSize: 15, color: color.paper },
  card: { backgroundColor: color.surface, borderRadius: radius.card, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  term: { fontFamily: font.semibold, fontSize: 17, color: color.ink },
});
