import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { color, font, radius, type } from '../theme';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

/** Botão principal, um por tela. Tinta sobre papel. */
export function PrimaryButton({ label, onPress, disabled, loading, icon, style }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  const off = disabled || loading;
  return (
    <PressableScale
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={[styles.primary, off && !loading && styles.primaryOff, style]}
    >
      {loading ? (
        <ActivityIndicator color={color.paper} />
      ) : (
        <>
          <Text style={[type.button, { color: disabled ? color.inkDisabled : color.paper }]}>{label}</Text>
          {icon ? <Icon name={icon} size={18} stroke={disabled ? color.inkDisabled : color.paper} width={2} /> : null}
        </>
      )}
    </PressableScale>
  );
}

/** Ação terciária: link de texto. */
export function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" style={styles.textButton} hitSlop={8}>
      <Text style={[type.label, { color: color.ink, fontFamily: font.body }]}>{label}</Text>
    </PressableScale>
  );
}

export function CircleButton({ icon, label, onPress, background = color.stone }: { icon: IconName; label: string; onPress: () => void; background?: string }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.circle, { backgroundColor: background }]}>
      <Icon name={icon} />
    </PressableScale>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} style={[styles.chip, selected ? styles.chipOn : styles.chipOff]}>
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </PressableScale>
  );
}

/** Barra de etapas do onboarding. */
export function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <View style={styles.steps} accessibilityRole="progressbar" accessibilityLabel={`Etapa ${step} de ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.step, { backgroundColor: i < step ? color.ink : color.line }]} />
      ))}
    </View>
  );
}

/** Rodapé de fluxo: voltar à esquerda, próximo à direita (padrão Uber Eats). */
export function FlowFooter({ onBack, onNext, nextLabel = 'Próximo', nextDisabled, loading }: { onBack?: () => void; onNext: () => void; nextLabel?: string; nextDisabled?: boolean; loading?: boolean }) {
  return (
    <View style={styles.footer}>
      {onBack ? <CircleButton icon="back" label="Voltar" onPress={onBack} /> : <View />}
      <PrimaryButton label={nextLabel} icon="next" onPress={onNext} disabled={nextDisabled} loading={loading} style={styles.nextPill} />
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[type.title, { color: color.ink }]} accessibilityRole="header">
        {title}
      </Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  primary: { height: 56, borderRadius: radius.button, backgroundColor: color.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20 },
  primaryOff: { backgroundColor: color.stone },
  textButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  circle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center' },
  chipOn: { backgroundColor: color.ink },
  chipOff: { borderWidth: 1, borderColor: color.line },
  chipText: { fontFamily: font.body, fontSize: 14, color: color.ink },
  chipTextOn: { fontFamily: font.semibold, color: color.paper },
  steps: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, height: 4, borderRadius: 2 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nextPill: { height: 52, borderRadius: 26 },
  section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
});
