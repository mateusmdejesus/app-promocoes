import * as AppleAuthentication from 'expo-apple-authentication';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { afterSignIn } from '../../afterSignIn';
import { CircleButton, PrimaryButton } from '../../components/Controls';
import { useSession } from '../../session';
import { color, font, gutter, radius, type } from '../../theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Criar conta / entrar. Estrutura da tela de entrada do Uber Eats:
 * título, campo com rótulo em cima, um botão principal, "ou", login social, texto legal.
 */
export default function Account() {
  const { mode = 'signup' } = useLocalSearchParams<{ mode?: 'signup' | 'login' }>();
  const session = useSession();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appleOk, setAppleOk] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setAppleOk);
  }, []);

  const valid = EMAIL_RE.test(email.trim());
  const login = mode === 'login';

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await session.api.startEmail(email.trim());
      router.push({ pathname: '/code', params: { email: email.trim().toLowerCase(), mode } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const apple = async () => {
    setError(null);
    try {
      const cred = await AppleAuthentication.signInAsync({ requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL] });
      if (!cred.identityToken) throw new Error('A Apple não devolveu a identificação.');
      setBusy(true);
      await afterSignIn(await session.api.signInApple(cred.identityToken), session, mode);
    } catch (e) {
      if ((e as { code?: string }).code !== 'ERR_REQUEST_CANCELED') setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 8 }}>
          <Text style={[type.display, styles.title]} accessibilityRole="header">
            {login ? 'Entre na sua conta' : 'Crie sua conta'}
          </Text>
          <Text style={[type.body, { color: color.inkMuted }]}>
            {login ? 'Use o mesmo e-mail ou a mesma conta Apple de antes.' : 'Seus interesses, alertas e seu plano ficam salvos, mesmo se você trocar de celular.'}
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={styles.label} nativeID="email-label">
            E-mail
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="nome@exemplo.com"
            placeholderTextColor={color.inkMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            autoCorrect={false}
            returnKeyType="send"
            onSubmitEditing={() => valid && sendCode()}
            accessibilityLabelledBy="email-label"
            accessibilityLabel="E-mail"
            style={[styles.input, focused && styles.inputFocused]}
          />
        </View>
        <PrimaryButton label="Receber código" onPress={sendCode} disabled={!valid} loading={busy} />
        {error ? (
          <Text style={[type.caption, { color: color.ink }]} accessibilityLiveRegion="assertive">
            {error}
          </Text>
        ) : null}

        {appleOk ? (
          <>
            <View style={styles.or}>
              <View style={styles.line} />
              <Text style={styles.orText}>ou</Text>
              <View style={styles.line} />
            </View>
            {/* Botão oficial: a Apple exige o visual dela. */}
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={login ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN : AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={radius.button}
              style={{ height: 56 }}
              onPress={apple}
            />
          </>
        ) : null}

        <Text style={styles.legal}>Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade.</Text>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <CircleButton icon="back" label="Voltar" onPress={() => router.back()} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  content: { paddingHorizontal: gutter, paddingBottom: 24, gap: 20 },
  title: { color: color.ink, fontSize: 30, lineHeight: 34 },
  label: { ...type.label, color: color.ink },
  input: { height: 52, borderRadius: radius.field, backgroundColor: color.stone, paddingHorizontal: 14, fontFamily: font.body, fontSize: 17, color: color.ink, borderWidth: 2, borderColor: 'transparent' },
  inputFocused: { backgroundColor: color.surface, borderColor: color.ink },
  or: { flexDirection: 'row', alignItems: 'center', gap: 16, marginVertical: 4 },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: color.line },
  orText: { fontFamily: font.body, fontSize: 15, color: color.inkMuted },
  legal: { fontFamily: font.body, fontSize: 12, lineHeight: 16, color: color.inkMuted },
  footer: { paddingHorizontal: gutter, paddingTop: 8 },
});
