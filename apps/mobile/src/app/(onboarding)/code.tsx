import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { afterSignIn } from '../../afterSignIn';
import { FlowFooter } from '../../components/Controls';
import { PressableScale } from '../../components/PressableScale';
import { useSession } from '../../session';
import { color, font, gutter, type } from '../../theme';

const LENGTH = 6;
const RESEND_SECONDS = 30;

/**
 * Código por e-mail. Padrão da tela de verificação do Uber Eats: um único campo
 * escondido (preenchimento automático do iOS/Android funciona) desenhado como células.
 */
export default function Code() {
  const { email = '', mode = 'signup' } = useLocalSearchParams<{ email?: string; mode?: 'signup' | 'login' }>();
  const session = useSession();
  const insets = useSafeAreaInsets();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(RESEND_SECONDS);
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const verify = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      await afterSignIn(await session.api.verifyEmail(email, value), session, mode);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError((e as Error).message);
      setCode('');
      setBusy(false);
      input.current?.focus();
    }
  };

  const onChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, LENGTH);
    setCode(digits);
    setError(null);
    if (digits.length === LENGTH) verify(digits);
  };

  const resend = async () => {
    setWait(RESEND_SECONDS);
    setError(null);
    await session.api.startEmail(email).catch((e) => setError((e as Error).message));
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.content, { paddingTop: insets.top + 24 }]}>
        <View style={{ gap: 8 }}>
          <Text style={[type.display, styles.title]} accessibilityRole="header">
            Digite o código de 6 dígitos
          </Text>
          <Text style={[type.body, { color: color.inkMuted }]}>
            Enviamos para <Text style={{ color: color.ink, fontFamily: font.medium }}>{email}</Text>
          </Text>
        </View>
        <Pressable onPress={() => router.back()} accessibilityRole="link" hitSlop={8} style={{ alignSelf: 'flex-start' }}>
          <Text style={styles.link}>Trocar e-mail</Text>
        </Pressable>

        <Pressable onPress={() => input.current?.focus()} accessible={false} style={styles.cells}>
          {Array.from({ length: LENGTH }, (_, i) => {
            const active = focused && !busy && i === Math.min(code.length, LENGTH - 1);
            return (
              <View key={i} style={[styles.cell, active && styles.cellActive]}>
                <Text style={[styles.digit, busy && { color: color.inkDisabled }]}>{code[i] ?? ''}</Text>
              </View>
            );
          })}
        </Pressable>
        <TextInput
          ref={input}
          value={code}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={LENGTH}
          autoFocus
          editable={!busy}
          accessibilityLabel={`Código de ${LENGTH} dígitos`}
          style={styles.hidden}
        />
        {error ? (
          <Text style={[type.caption, { color: color.ink }]} accessibilityLiveRegion="assertive">
            {error}
          </Text>
        ) : null}

        <PressableScale onPress={resend} disabled={wait > 0} accessibilityRole="button" style={styles.resend}>
          <Text style={[styles.resendText, wait > 0 && { color: color.inkDisabled }]}>
            {wait > 0 ? `Reenviar código (0:${String(wait).padStart(2, '0')})` : 'Reenviar código'}
          </Text>
        </PressableScale>
      </View>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <FlowFooter onBack={() => router.back()} onNext={() => verify(code)} nextDisabled={code.length < LENGTH} loading={busy} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  content: { flex: 1, paddingHorizontal: gutter, gap: 16 },
  title: { color: color.ink, fontSize: 26, lineHeight: 31 },
  link: { fontFamily: font.body, fontSize: 16, color: color.ink, textDecorationLine: 'underline' },
  cells: { flexDirection: 'row', gap: 8, marginTop: 12 },
  cell: { flex: 1, maxWidth: 52, height: 56, borderRadius: 12, backgroundColor: color.stone, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  cellActive: { backgroundColor: color.surface, borderColor: color.ink },
  digit: { fontFamily: font.display, fontSize: 24, color: color.ink },
  hidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  resend: { alignSelf: 'flex-start', height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: color.stone, justifyContent: 'center', marginTop: 8 },
  resendText: { fontFamily: font.medium, fontSize: 15, color: color.ink },
  footer: { paddingHorizontal: gutter, paddingTop: 8 },
});
