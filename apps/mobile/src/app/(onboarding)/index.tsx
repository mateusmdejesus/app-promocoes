import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { TagMark } from '../../components/Brand';
import { PrimaryButton } from '../../components/Controls';
import { color, font, gutter, type } from '../../theme';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/** Etiqueta grande da ilustração, com o desconto escrito nela. */
function BigTag() {
  return (
    <View style={styles.bigTag}>
      <Svg width={232} height={120} viewBox="0 0 232 120" style={StyleSheet.absoluteFill}>
        <Path d="M44 0H220a12 12 0 0 1 12 12V108a12 12 0 0 1-12 12H44L0 60Z" fill={color.signal} />
        <Circle cx={38} cy={60} r={9} fill={color.ink} />
      </Svg>
      <Text style={styles.bigTagText}>−52%</Text>
    </View>
  );
}

/**
 * Boas-vindas. Estrutura das referências (Uber Eats / Headspace): um bloco
 * de imagem cheio ocupando o topo e o texto + ação presos embaixo, sem vazio.
 * A "imagem" aqui é o próprio produto: um preço caindo de verdade.
 */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  // O risco sobre o preço antigo é a única animação: explica o que o app faz.
  const strike = useSharedValue(0);
  useEffect(() => {
    strike.set(withDelay(450, withTiming(1, { duration: 380, easing: EASE_OUT, reduceMotion: ReduceMotion.System })));
  }, [strike]);
  const strikeStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: strike.get() }] }));

  return (
    <View style={styles.screen}>
      <View style={[styles.hero, { paddingTop: insets.top + 12 }]}>
        <View style={styles.brandRow} accessibilityRole="header" accessibilityLabel="keropromo">
          <TagMark size={26} hole={color.ink} />
          <Text style={styles.brandWord}>keropromo</Text>
        </View>

        <View style={styles.receipt} accessible accessibilityLabel="Exemplo: air fryer de 519 reais por 249 reais, 52% de desconto, menor preço em 90 dias.">
          <Text style={styles.product}>Air fryer 4L digital · Mercado Livre</Text>
          <View style={styles.oldWrap}>
            <Text style={styles.oldPrice}>R$ 519</Text>
            <Animated.View style={[styles.strike, strikeStyle]} />
          </View>
          <Animated.Text entering={FadeInDown.delay(700).duration(320).easing(EASE_OUT).reduceMotion(ReduceMotion.System)} style={styles.newPrice}>
            R$ 249
          </Animated.Text>
          <Animated.View entering={FadeIn.delay(900).duration(300).reduceMotion(ReduceMotion.System)} style={styles.factRow}>
            <View style={styles.dot} />
            <Text style={styles.fact}>Menor preço dos últimos 90 dias</Text>
          </Animated.View>
        </View>

        <BigTag />
      </View>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={[type.display, styles.title]} accessibilityRole="header">
          Promoção de verdade, na hora que ela aparece.
        </Text>
        <Text style={[type.body, { color: color.inkMuted }]}>A gente vigia as lojas o dia todo e te avisa quando o preço cai de verdade.</Text>
        <PrimaryButton label="Começar" icon="next" onPress={() => router.push('/interests')} style={{ marginTop: 12 }} />
        <Text style={styles.legal}>Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  hero: { flex: 1, backgroundColor: color.ink, paddingHorizontal: gutter, overflow: 'visible', zIndex: 1 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  brandWord: { fontFamily: font.display, fontSize: 22, letterSpacing: -0.7, color: color.paper },
  receipt: { flex: 1, justifyContent: 'center', gap: 4, paddingBottom: 72 },
  product: { fontFamily: font.medium, fontSize: 15, color: '#B9B2A6' },
  oldWrap: { alignSelf: 'flex-start', justifyContent: 'center', marginTop: 8 },
  oldPrice: { fontFamily: font.display, fontSize: 34, lineHeight: 40, color: '#8A8278', letterSpacing: -1 },
  strike: { position: 'absolute', left: -4, right: -4, height: 3, backgroundColor: color.signal, borderRadius: 2, transformOrigin: 'left' },
  newPrice: { fontFamily: font.display, fontSize: 88, lineHeight: 92, color: color.paper, letterSpacing: -3.5 },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.signal },
  fact: { fontFamily: font.body, fontSize: 15, color: '#D9D2C6' },
  // A etiqueta atravessa a divisa entre o bloco escuro e o papel.
  bigTag: { position: 'absolute', right: 8, bottom: -40, width: 232, height: 120, transform: [{ rotate: '-8deg' }], justifyContent: 'center', paddingLeft: 66 },
  bigTagText: { fontFamily: font.display, fontSize: 54, color: color.ink, letterSpacing: -2 },
  sheet: { paddingHorizontal: 24, paddingTop: 72, gap: 12 },
  title: { color: color.ink, fontSize: 32, lineHeight: 35, paddingRight: 24 },
  legal: { fontFamily: font.body, fontSize: 12, lineHeight: 16, color: color.inkMuted, textAlign: 'center' },
});
