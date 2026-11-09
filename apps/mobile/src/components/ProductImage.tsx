import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { color } from '../theme';

/** Foto do produto sobre fundo pedra; sem foto, fica só o fundo. */
export function ProductImage({ uri, style }: { uri: string | null; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.box, style]}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" transition={150} accessible={false} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: color.stone, overflow: 'hidden' },
});
