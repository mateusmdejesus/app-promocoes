import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const TIMING = { duration: 120, easing: EASE_OUT };

/**
 * Feedback de toque: encolhe para 0,97 ao encostar o dedo (não ao soltar),
 * 120 ms com ease-out forte, na thread de UI (sem re-render do React).
 * Com "Reduzir movimento", troca a escala por uma leve queda de opacidade.
 */
export function PressableScale({ style, children, onPressIn, onPressOut, disabled, ...rest }: Props) {
  const reduced = useReducedMotion();
  const pressed = useSharedValue(0);
  const animated = useAnimatedStyle(() => {
    const p = pressed.get();
    return reduced ? { opacity: 1 - 0.3 * p } : { transform: [{ scale: 1 - 0.03 * p }] };
  });

  return (
    <AnimatedPressable
      {...rest}
      style={[style, animated]}
      disabled={disabled}
      pressRetentionOffset={{ top: 16, bottom: 16, left: 16, right: 16 }}
      onPressIn={(e) => {
        pressed.set(withTiming(1, TIMING));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.set(withTiming(0, TIMING));
        onPressOut?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}
