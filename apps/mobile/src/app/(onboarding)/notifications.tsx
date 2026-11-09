import { CATEGORIES, type Category } from '@keropromo/core';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TagMark } from '../../components/Brand';
import { PrimaryButton, StepBar, TextButton } from '../../components/Controls';
import { registerForPush } from '../../notifications';
import { useSession } from '../../session';
import { color, font, gutter, type } from '../../theme';

export default function NotificationsStep() {
  const { categories } = useLocalSearchParams<{ categories?: string }>();
  const picked = (categories ?? '').split(',').filter((c): c is Category => (CATEGORIES as readonly string[]).includes(c));
  const { finishOnboarding, api } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async (askPush: boolean) => {
    setBusy(true);
    setError(null);
    try {
      // A permissão é pedida só depois de explicar o porquê, nunca ao abrir o app.
      const token = askPush ? await registerForPush() : null;
      await finishOnboarding(picked);
      if (token) await api.updateMe({ pushToken: token });
      // O guard do layout raiz troca para as abas assim que `onboarded` muda.
    } catch (e) {
      setError((e as Error).message || 'Verifique sua conexão e tente de novo.');
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: gutter, paddingTop: 16 }}>
        <StepBar step={2} total={2} />
      </View>

      <View style={styles.art} accessible={false} importantForAccessibility="no-hide-descendants">
        <View style={[styles.note, { transform: [{ rotate: '-1.5deg' }] }]}>
          <View style={styles.appIcon}>
            <TagMark size={26} hole={color.ink} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={styles.noteHead}>
              <Text style={styles.noteApp}>keropromo</Text>
              <Text style={styles.noteTime}>agora</Text>
            </View>
            <Text style={styles.noteTitle}>Caiu 52%: Air fryer 4L digital</Text>
            <Text style={styles.noteBody}>De R$ 519 por R$ 249 no Mercado Livre.</Text>
          </View>
        </View>
      </View>

      <View style={styles.copy}>
        <Text style={[type.display, { color: color.ink, fontSize: 30, lineHeight: 34 }]} accessibilityRole="header">
          Quer saber na hora?
        </Text>
        <Text style={[type.body, { color: color.inkMuted }]}>
          Só te avisamos de oferta quente nas categorias que você escolheu, e dos alertas que você criar. No máximo 5 por dia.
        </Text>
        {error ? (
          <Text style={[type.caption, { color: color.ink }]} accessibilityLiveRegion="assertive">
            {error}
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        <PrimaryButton label="Ativar notificações" onPress={() => finish(true)} loading={busy} />
        <TextButton label="Agora não" onPress={() => !busy && finish(false)} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  art: { flex: 1, justifyContent: 'center', paddingHorizontal: gutter },
  note: { backgroundColor: color.surface, borderRadius: 22, padding: 14, flexDirection: 'row', gap: 12 },
  appIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  noteHead: { flexDirection: 'row', justifyContent: 'space-between' },
  noteApp: { fontFamily: font.semibold, fontSize: 13, color: color.ink },
  noteTime: { fontFamily: font.body, fontSize: 13, color: color.inkMuted },
  noteTitle: { fontFamily: font.semibold, fontSize: 15, color: color.ink },
  noteBody: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: color.inkMuted },
  copy: { paddingHorizontal: 24, gap: 12 },
  actions: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 12, gap: 4 },
});

