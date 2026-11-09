import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TagMark } from '../../components/Brand';
import { PrimaryButton, SecondaryButton } from '../../components/Controls';
import { registerForPush } from '../../notifications';
import { useSession } from '../../session';
import { color, font, gutter, type } from '../../theme';

function Note({ title, body, time, dim }: { title: string; body: string; time: string; dim?: boolean }) {
  return (
    <View style={[styles.note, dim && { opacity: 0.55, marginHorizontal: 12 }]}>
      <View style={styles.appIcon}>
        <TagMark size={26} hole={color.ink} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.noteHead}>
          <Text style={styles.noteApp}>keropromo</Text>
          <Text style={styles.noteTime}>{time}</Text>
        </View>
        <Text style={styles.noteTitle}>{title}</Text>
        <Text style={styles.noteBody}>{body}</Text>
      </View>
    </View>
  );
}

export default function NotificationsStep() {
  const { finishOnboarding, api } = useSession();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async (askPush: boolean) => {
    setBusy(true);
    setError(null);
    try {
      // A permissão é pedida só depois de explicar o porquê, nunca ao abrir o app.
      const token = askPush ? await registerForPush() : null;
      await finishOnboarding();
      if (token) await api.updateMe({ pushToken: token });
      // O guard do layout raiz troca para as abas assim que `onboarded` muda.
    } catch (e) {
      setError((e as Error).message || 'Verifique sua conexão e tente de novo.');
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      {/* Mesmo esqueleto da boas-vindas: bloco escuro cheio no topo, texto e ações embaixo. */}
      <View style={[styles.hero, { paddingTop: insets.top + 16 }]}>
        <View style={styles.steps} accessibilityRole="progressbar" accessibilityLabel="Etapa 3 de 3">
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.step, { backgroundColor: color.paper }]} />
          ))}
        </View>
        <View style={styles.art} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Text style={styles.clock}>20:41</Text>
          <View style={{ gap: 8 }}>
            <Note title="Caiu 52%: Air fryer 4L digital" body="De R$ 519 por R$ 249 no Mercado Livre. Menor preço em 90 dias." time="agora" />
            <Note title="Seu alerta: fone bluetooth" body="Achamos por R$ 189 na Amazon (−34%)." time="há 2 h" dim />
          </View>
        </View>
      </View>

      <View style={{ paddingTop: 32, paddingBottom: insets.bottom + 12 }}>
        <View style={styles.copy}>
          <Text style={[type.display, { color: color.ink, fontSize: 30, lineHeight: 34 }]} accessibilityRole="header">
            Quer saber na hora?
          </Text>
          <Text style={[type.body, { color: color.inkMuted }]}>Só te avisamos de oferta quente nas categorias que você escolheu, e dos alertas que você criar. No máximo 5 por dia.</Text>
          {error ? (
            <Text style={[type.caption, { color: color.ink }]} accessibilityLiveRegion="assertive">
              {error}
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          <PrimaryButton label="Ativar notificações" onPress={() => finish(true)} loading={busy} />
          <SecondaryButton label="Agora não" onPress={() => finish(false)} disabled={busy} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  hero: { flex: 1, backgroundColor: color.ink, paddingHorizontal: gutter },
  steps: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, height: 4, borderRadius: 2 },
  art: { flex: 1, justifyContent: 'center', gap: 24, paddingBottom: 16 },
  clock: { fontFamily: font.display, fontSize: 64, lineHeight: 68, color: color.paper, textAlign: 'center', letterSpacing: -2 },
  note: { backgroundColor: color.paper, borderRadius: 22, padding: 14, flexDirection: 'row', gap: 12 },
  appIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  noteHead: { flexDirection: 'row', justifyContent: 'space-between' },
  noteApp: { fontFamily: font.semibold, fontSize: 13, color: color.ink },
  noteTime: { fontFamily: font.body, fontSize: 13, color: color.inkMuted },
  noteTitle: { fontFamily: font.semibold, fontSize: 15, color: color.ink },
  noteBody: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: color.inkMuted },
  copy: { paddingHorizontal: 24, gap: 12 },
  actions: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 12, gap: 8 },
});
