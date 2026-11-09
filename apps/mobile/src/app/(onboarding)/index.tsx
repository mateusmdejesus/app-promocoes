import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import { PrimaryButton } from '../../components/Controls';
import { color, font, type } from '../../theme';

/** Uma etiqueta de preço desenhada, para a ilustração de boas-vindas. */
function Tag({ w, h, label, fill, ink, stroke }: { w: number; h: number; label: string; fill: string; ink: string; stroke?: string }) {
  const tip = h * 0.34;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Path d={`M${tip + 4} 2H${w - 10}a8 8 0 0 1 8 8V${h - 10}a8 8 0 0 1-8 8H${tip + 4}L2 ${h / 2}Z`} fill={fill} stroke={stroke} strokeWidth={stroke ? 2.5 : 0} />
      <Circle cx={tip - 2} cy={h / 2} r={h * 0.07} fill={color.paper} stroke={stroke} strokeWidth={stroke ? 2.5 : 0} />
      <SvgText x={(w + tip) / 2 + 4} y={h / 2 + h * 0.15} textAnchor="middle" fontFamily={font.display} fontSize={h * 0.42} fill={ink}>
        {label}
      </SvgText>
    </Svg>
  );
}

export default function Welcome() {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.art} accessible={false} importantForAccessibility="no-hide-descendants">
        <View style={[styles.tag, { top: 40, left: 20, transform: [{ rotate: '-8deg' }] }]}>
          <Tag w={250} h={120} label="−34%" fill={color.surface} ink={color.ink} stroke={color.ink} />
        </View>
        <View style={[styles.tag, { top: 150, left: 70, transform: [{ rotate: '6deg' }] }]}>
          <Tag w={270} h={130} label="−52%" fill={color.signal} ink={color.ink} />
        </View>
        <View style={[styles.tag, { top: 285, left: 8, transform: [{ rotate: '-3deg' }] }]}>
          <Tag w={200} h={96} label="−41%" fill={color.ink} ink={color.paper} />
        </View>
      </View>
      <View style={styles.copy}>
        <Text style={[type.display, { color: color.ink }]} accessibilityRole="header">
          Promoção de verdade, na hora que ela aparece.
        </Text>
        <Text style={[type.body, { color: color.inkMuted }]}>A gente vigia as lojas o dia todo e te avisa quando o preço cai de verdade.</Text>
      </View>
      <View style={styles.actions}>
        <PrimaryButton label="Começar" onPress={() => router.push('/interests')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  art: { flex: 1, minHeight: 300 },
  tag: { position: 'absolute' },
  copy: { paddingHorizontal: 24, gap: 12 },
  actions: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 12 },
});
