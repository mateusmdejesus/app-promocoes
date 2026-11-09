import { CATEGORIES, CATEGORY_NAMES, type Category } from '@keropromo/core';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert as RNAlert, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip, ListRow, PrimaryButton } from '../../components/Controls';
import { Icon } from '../../components/Icon';
import { PressableScale } from '../../components/PressableScale';
import { registerForPush } from '../../notifications';
import { useSession } from '../../session';
import { color, font, gutter, radius, type } from '../../theme';

/** Páginas legais. Trocar pelo domínio definitivo antes de publicar. */
const LEGAL_URL = 'https://keropromo.com.br';
const MANAGE_URL = Platform.OS === 'ios' ? 'https://apps.apple.com/account/subscriptions' : 'https://play.google.com/store/account/subscriptions';

export default function Profile() {
  const { api, me, refreshMe, signOut, deleteAccount } = useSession();
  const [picked, setPicked] = useState<Set<Category>>(new Set(me?.categories ?? []));
  const [notice, setNotice] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      refreshMe().catch(() => undefined);
    }, [refreshMe]),
  );
  useEffect(() => {
    if (me) setPicked(new Set(me.categories));
  }, [me]);

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
      setNotice('Notificações ativadas.');
    } else {
      // Se a pessoa já recusou, só os Ajustes do sistema podem reativar.
      Linking.openSettings();
    }
  };

  const confirmDelete = () =>
    RNAlert.alert('Excluir sua conta?', 'Apagamos seus dados, interesses e alertas. Se você tem o Pro, cancele também a assinatura na loja.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => deleteAccount().catch((e) => setNotice((e as Error).message)) },
    ]);

  const pro = me?.plan === 'pro';
  const identity = me?.email ?? (me?.hasApple ? 'Conta Apple' : 'Sem e-mail');

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ gap: 4 }}>
          <Text style={[type.display, { color: color.ink, fontSize: 32 }]} accessibilityRole="header">
            Perfil
          </Text>
          <Text style={[type.body, { color: color.inkMuted }]}>{identity}</Text>
        </View>

        <View style={[styles.plan, pro && styles.planPro]}>
          <Text style={[styles.planName, pro && { color: color.paper }]}>{pro ? 'keropromo Pro' : 'Plano grátis'}</Text>
          <Text style={[type.body, { color: pro ? '#D9D2C6' : color.inkMuted, fontSize: 15, lineHeight: 22 }]}>
            {pro
              ? `Ofertas quentes na hora, alertas ilimitados e 90 dias de histórico. Renova em ${new Date(me!.proUntil!).toLocaleDateString('pt-BR')}.`
              : 'Ofertas quentes aparecem para você 1 hora depois. Com o Pro, você vê na hora e recebe o aviso.'}
          </Text>
          {pro ? (
            <PressableScale onPress={() => Linking.openURL(MANAGE_URL)} accessibilityRole="link" style={styles.manage}>
              <Text style={styles.manageText}>Gerenciar assinatura</Text>
              <Icon name="chevron" size={18} stroke={color.paper} width={2} />
            </PressableScale>
          ) : (
            <PrimaryButton label="Conhecer o Pro" onPress={() => router.push('/plans')} style={{ marginTop: 8 }} />
          )}
        </View>

        <View style={{ gap: 12 }}>
          <Text style={[type.title, { color: color.ink }]}>Seus interesses</Text>
          <Text style={[type.body, { color: color.inkMuted, fontSize: 15, lineHeight: 22 }]}>
            Ordenam o "Pra você" e decidem quais ofertas quentes viram notificação. O app também aprende com o que você abre e salva aqui dentro.
          </Text>
          <View style={styles.chips}>
            {CATEGORIES.map((c) => (
              <Chip key={c} label={CATEGORY_NAMES[c]} selected={picked.has(c)} onPress={() => toggle(c)} />
            ))}
          </View>
        </View>

        <View>
          <Text style={[type.title, { color: color.ink, marginBottom: 4 }]}>Ajustes</Text>
          <ListRow title="Notificações" subtitle={notice ?? 'No máximo 5 por dia, nada entre 23h e 8h'} onPress={enablePush} />
          <ListRow title="Termos de Uso" onPress={() => Linking.openURL(`${LEGAL_URL}/termos`)} />
          <ListRow title="Política de Privacidade" onPress={() => Linking.openURL(`${LEGAL_URL}/privacidade`)} />
          <ListRow title="Sair" onPress={() => signOut()} />
          <ListRow title="Excluir conta" subtitle="Apaga seus dados do keropromo" onPress={confirmDelete} last />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  content: { paddingHorizontal: gutter, paddingTop: 12, paddingBottom: 48, gap: 32 },
  plan: { backgroundColor: color.surface, borderRadius: radius.card, padding: 20, gap: 6 },
  planPro: { backgroundColor: color.ink },
  planName: { fontFamily: font.display, fontSize: 22, color: color.ink, letterSpacing: -0.4 },
  manage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#3A342D', paddingTop: 8 },
  manageText: { fontFamily: font.semibold, fontSize: 16, color: color.paper },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
