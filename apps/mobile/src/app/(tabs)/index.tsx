import { CATEGORY_NAMES, type Category } from '@keropromo/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Offer } from '../../api';
import { Wordmark } from '../../components/Brand';
import { Chip, SectionHeader } from '../../components/Controls';
import { Icon } from '../../components/Icon';
import { OfferHeroCard, OfferRow } from '../../components/Offer';
import { PressableScale } from '../../components/PressableScale';
import { EmptyState, ErrorState, SkeletonList } from '../../components/States';
import { useSession } from '../../session';
import { color, gutter, radius, type } from '../../theme';
import { useAsync } from '../../useAsync';

export default function Home() {
  const { api } = useSession();
  const [category, setCategory] = useState<Category | undefined>(undefined);
  const { data, error, loading, refreshing, reload, refresh } = useAsync(async () => {
    const [me, hot, feed] = await Promise.all([api.me(), api.hot(), api.feed(category)]);
    return { mine: me.categories, hot: hot.offers, feed: feed.offers };
  }, [category]);

  // Chips: "Pra você" + as categorias que a pessoa escolheu.
  const chips: Array<Category | undefined> = [undefined, ...(data?.mine ?? [])];
  const hot = category ? (data?.hot ?? []).filter((o) => o.category === category) : (data?.hot ?? []);
  const hotIds = new Set(hot.slice(0, 3).map((o) => o.id));
  const rest = (data?.feed ?? []).filter((o) => !hotIds.has(o.id));

  const header = (
    <View style={styles.header}>
      <View style={styles.topRow}>
        <Wordmark />
      </View>
      <PressableScale onPress={() => router.navigate('/search')} accessibilityRole="search" accessibilityLabel="Buscar produto ou loja" style={styles.search}>
        <Icon name="search" size={18} stroke={color.inkMuted} width={2} />
        <Text style={[type.body, { color: color.inkMuted }]}>Buscar produto ou loja</Text>
      </PressableScale>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsScroll}>
        {chips.map((c) => (
          <Chip key={c ?? 'all'} label={c ? CATEGORY_NAMES[c] : 'Pra você'} selected={category === c} onPress={() => setCategory(c)} />
        ))}
      </ScrollView>

      {hot.length > 0 ? (
        <View style={{ gap: 12, marginTop: 24 }}>
          <SectionHeader title="Quentes agora" />
          {hot.length === 1 ? (
            <OfferHeroCard offer={hot[0]!} />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={300 + 12} decelerationRate="fast" contentContainerStyle={{ gap: 12, paddingHorizontal: gutter }} style={{ marginHorizontal: -gutter }}>
              {hot.slice(0, 3).map((o) => (
                <OfferHeroCard key={o.id} offer={o} width={300} />
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}
      {rest.length > 0 ? (
        <View style={{ marginTop: 24, marginBottom: 4 }}>
          <SectionHeader title={category ? CATEGORY_NAMES[category] : 'Pra você'} />
        </View>
      ) : null}
    </View>
  );

  let body = null;
  if (loading && !data) body = <SkeletonList />;
  else if (error && !data) body = <ErrorState message={error} onRetry={reload} />;
  else if (data && hot.length === 0 && rest.length === 0)
    body = <EmptyState title="Nada com 25% ou mais agora." body="A gente segue vigiando. Puxe para atualizar ou crie um alerta para o que você quer." />;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList<Offer>
        data={body ? [] : rest}
        keyExtractor={(o) => o.id}
        renderItem={({ item }) => <OfferRow offer={item} />}
        ListHeaderComponent={header}
        ListEmptyComponent={body ?? undefined}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={color.ink} />}
        contentInsetAdjustmentBehavior="automatic"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  list: { paddingHorizontal: gutter, paddingBottom: 32 },
  header: { paddingTop: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginBottom: 16 },
  search: { height: 48, borderRadius: radius.field, backgroundColor: color.stone, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  chipsScroll: { marginHorizontal: -gutter, marginTop: 16 },
  chips: { gap: 8, paddingHorizontal: gutter },
});
