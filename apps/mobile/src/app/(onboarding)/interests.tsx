import { CATEGORIES, CATEGORY_NAMES, type Category } from '@keropromo/core';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlowFooter, StepBar } from '../../components/Controls';
import { Icon } from '../../components/Icon';
import { PressableScale } from '../../components/PressableScale';
import { color, font, gutter, type } from '../../theme';

export default function Interests() {
  const [picked, setPicked] = useState<Set<Category>>(new Set());

  const toggle = (c: Category) => {
    Haptics.selectionAsync();
    setPicked((s) => {
      const n = new Set(s);
      n.has(c) ? n.delete(c) : n.add(c);
      return n;
    });
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <StepBar step={1} total={2} />
        <View style={{ gap: 8 }}>
          <Text style={[type.display, styles.title]} accessibilityRole="header">
            O que você quer achar mais barato?
          </Text>
          <Text style={[type.body, { color: color.inkMuted }]}>Escolha quantas quiser. Dá pra mudar depois.</Text>
        </View>
        <View style={styles.grid}>
          {CATEGORIES.map((c) => {
            const on = picked.has(c);
            return (
              <PressableScale key={c} onPress={() => toggle(c)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={[styles.option, on ? styles.on : styles.off]}>
                <Text style={[styles.optionText, on && { color: color.paper }]}>{CATEGORY_NAMES[c]}</Text>
                {on ? <Icon name="check" size={18} stroke={color.paper} width={2.5} /> : null}
              </PressableScale>
            );
          })}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <FlowFooter
          onBack={() => router.back()}
          nextDisabled={picked.size === 0}
          onNext={() => router.push({ pathname: '/notifications', params: { categories: [...picked].join(',') } })}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  content: { paddingHorizontal: gutter, paddingTop: 16, paddingBottom: 24, gap: 28 },
  title: { color: color.ink, fontSize: 28, lineHeight: 32 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { flexBasis: '40%', flexGrow: 1, minHeight: 56, borderRadius: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  on: { backgroundColor: color.ink },
  off: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.line },
  optionText: { fontFamily: font.medium, fontSize: 15, color: color.ink, flexShrink: 1 },
  footer: { paddingHorizontal: gutter, paddingBottom: 12, paddingTop: 8 },
});
