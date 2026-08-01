import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from 'react-native-paper';

/**
 * A floating surface that is real Liquid Glass where the OS provides it, and an
 * ordinary opaque surface everywhere else.
 *
 * Liquid Glass is a native effect (UIGlassEffect / SwiftUI's `glassEffect`),
 * so it cannot be drawn by React Native's JS view layer — a translucent
 * background with a blur is an imitation, not the material: it does not refract
 * what is behind it, does not pick up the specular edge, and does not respond
 * to motion. `expo-glass-effect` hands the work to the system view instead.
 *
 * WHERE IT BELONGS. Apple's guidance is that glass is for the floating layer —
 * controls that sit ABOVE content — and never for the content itself. It needs
 * something worth refracting underneath, so a sheet over a map earns it and a
 * card on a flat background does not. Glass is also never stacked on glass.
 *
 * The fallback is deliberately not a blur. On a device without the effect the
 * honest answer is a solid surface that meets contrast on its own, rather than
 * translucency the platform cannot make legible.
 */
export function GlassSurface({
  children,
  style,
  /** 'regular' has more presence; 'clear' lets more of the content through. */
  variant = 'regular',
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'regular' | 'clear';
}) {
  const theme = useTheme();
  // iOS 26+ only; the module reports false on older iOS and on Android.
  const available = Platform.OS === 'ios' && isLiquidGlassAvailable();

  if (!available) {
    return (
      <View style={[styles.base, { backgroundColor: theme.colors.surface }, style]}>{children}</View>
    );
  }
  return (
    <GlassView
      glassEffectStyle={variant}
      // The app has its own light/dark handling, so the glass is told which
      // scheme it is sitting in rather than guessing from the system.
      colorScheme={theme.dark ? 'dark' : 'light'}
      style={[styles.base, style]}
    >
      {children}
    </GlassView>
  );
}

/** True when this device can actually render the material. */
export const liquidGlassAvailable = () => Platform.OS === 'ios' && isLiquidGlassAvailable();

const styles = StyleSheet.create({
  // Glass reads as a distinct floating layer, which needs a real corner radius
  // and clipping — a square-edged sheet reads as part of the content.
  base: { borderRadius: 22, overflow: 'hidden' },
});
