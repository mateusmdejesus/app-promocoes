import { StyleSheet, Text, View } from 'react-native';
import { color, radius, type } from '../theme';
import { TextButton } from './Controls';

/** Esqueleto estático (sem brilho animado: carregamento é frequente). */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <View style={{ gap: 12 }} accessibilityLabel="Carregando ofertas" accessible>
      <View style={[styles.block, { height: 260, borderRadius: radius.card }]} />
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.row}>
          <View style={[styles.block, { width: 72, height: 72, borderRadius: 12 }]} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[styles.block, { height: 12, width: '50%' }]} />
            <View style={[styles.block, { height: 14, width: '85%' }]} />
            <View style={[styles.block, { height: 18, width: '30%' }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <Text style={[type.bodyStrong, styles.text]}>Não deu pra carregar agora.</Text>
      <Text style={[type.caption, styles.muted]}>{message}</Text>
      <TextButton label="Tentar de novo" onPress={onRetry} />
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.center}>
      <Text style={[type.bodyStrong, styles.text]}>{title}</Text>
      <Text style={[type.body, styles.muted]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: color.stone, borderRadius: 6 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  center: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 6 },
  text: { color: color.ink, textAlign: 'center' },
  muted: { color: color.inkMuted, textAlign: 'center' },
});
