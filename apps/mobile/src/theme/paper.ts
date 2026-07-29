/**
 * iOS HIG (Apple Standards) Theme overrides for React Native Paper.
 */
import { MD3DarkTheme, MD3LightTheme, type MD3Theme, configureFonts, useTheme } from 'react-native-paper';
import { PixelRatio, Platform } from 'react-native';

/**
 * MD3Colors (react-native-paper) is a closed `type`, not an `interface`, so it
 * cannot be extended via `declare module` merging. AppTheme adds the two
 * semantic status colors the app needs on top of it; `useAppTheme()` is the
 * typed way to read them (`useAppTheme().colors.success`).
 */
export type AppTheme = MD3Theme & {
  colors: MD3Theme['colors'] & {
    success: string;
    warning: string;
  };
};

const fontConfig = {
  fontFamily: Platform.select({ ios: 'System', default: 'sans-serif' }),
};

/**
 * RN scales `fontSize` by the OS font-scale setting (Dynamic Type / Android
 * font size) at render time, but takes `lineHeight` literally — a fixed
 * lineHeight clips large text against its line box. Scaling it by the same
 * factor keeps today's numbers unchanged at the default 100% scale while
 * growing them in step with fontSize at larger accessibility sizes.
 */
const scaledLineHeight = (px: number) => Math.round(px * PixelRatio.getFontScale());

// Map iOS Dynamic Type sizes onto Paper's MD3 scale
const iosFonts = configureFonts({
  config: {
    displayLarge: { ...fontConfig, fontSize: 34, fontWeight: '700', letterSpacing: 0, lineHeight: scaledLineHeight(41) },
    displayMedium: { ...fontConfig, fontSize: 34, fontWeight: '700', letterSpacing: 0, lineHeight: scaledLineHeight(41) },
    displaySmall: { ...fontConfig, fontSize: 28, fontWeight: '700', letterSpacing: 0, lineHeight: scaledLineHeight(34) },
    headlineLarge: { ...fontConfig, fontSize: 34, fontWeight: '700', letterSpacing: 0, lineHeight: scaledLineHeight(41) },
    headlineMedium: { ...fontConfig, fontSize: 28, fontWeight: '700', letterSpacing: 0, lineHeight: scaledLineHeight(34) },
    headlineSmall: { ...fontConfig, fontSize: 22, fontWeight: '700', letterSpacing: 0, lineHeight: scaledLineHeight(28) },
    titleLarge: { ...fontConfig, fontSize: 22, fontWeight: '700', letterSpacing: 0, lineHeight: scaledLineHeight(28) },
    titleMedium: { ...fontConfig, fontSize: 17, fontWeight: '600', letterSpacing: -0.4, lineHeight: scaledLineHeight(22) },
    titleSmall: { ...fontConfig, fontSize: 15, fontWeight: '600', letterSpacing: -0.24, lineHeight: scaledLineHeight(20) },
    bodyLarge: { ...fontConfig, fontSize: 17, fontWeight: '400', letterSpacing: -0.4, lineHeight: scaledLineHeight(22) },
    bodyMedium: { ...fontConfig, fontSize: 17, fontWeight: '400', letterSpacing: -0.4, lineHeight: scaledLineHeight(22) },
    bodySmall: { ...fontConfig, fontSize: 15, fontWeight: '400', letterSpacing: -0.24, lineHeight: scaledLineHeight(20) },
    labelLarge: { ...fontConfig, fontSize: 15, fontWeight: '500', letterSpacing: -0.24, lineHeight: scaledLineHeight(20) },
    labelMedium: { ...fontConfig, fontSize: 13, fontWeight: '400', letterSpacing: -0.08, lineHeight: scaledLineHeight(18) },
    labelSmall: { ...fontConfig, fontSize: 11, fontWeight: '500', letterSpacing: 0.06, lineHeight: scaledLineHeight(13) },
  },
});

export const paperLight: AppTheme = {
  ...MD3LightTheme,
  roundness: 3, // ~12pt rounded corners
  fonts: iosFonts,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#007AFF', // System Blue
    onPrimary: '#FFFFFF',
    primaryContainer: 'rgba(0, 122, 255, 0.12)',
    onPrimaryContainer: '#007AFF',
    background: '#F2F2F7', // iOS Grouped Background
    surface: '#FFFFFF',
    surfaceVariant: '#E5E5EA',
    // AA (4.5:1) on every surface it is used on: 5.99 on white, 5.37 on the
    // grouped background, 4.77 on surfaceVariant. The old #8E8E93 measured
    // 2.60–3.26 and carries nearly all secondary text in the app — counts,
    // owner names, dates, every empty-state body. It passed in dark mode only,
    // so testing on the dark physical device hid it completely.
    onSurfaceVariant: '#636366',
    outline: '#C6C6C8',
    outlineVariant: '#E5E5EA',
    error: '#FF3B30',
    // 5.13:1 on white, 4.59:1 on the grouped background — both pass AA.
    success: '#2e7d32',
    // 5.02:1 on white, 4.50:1 on the grouped background — both pass AA.
    warning: '#b45309',
  },
};

export const paperDark: AppTheme = {
  ...MD3DarkTheme,
  roundness: 3,
  fonts: iosFonts,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#0A84FF', // System Blue Dark
    onPrimary: '#FFFFFF',
    primaryContainer: 'rgba(10, 132, 255, 0.16)',
    onPrimaryContainer: '#0A84FF',
    background: '#000000', // True Black
    surface: '#1C1C1E', // Elevated Surface
    surfaceVariant: '#2C2C2E',
    // 4.85 on surfaceVariant, 5.93 on surface, 7.31 on black. #8E8E93 was 4.27
    // on surfaceVariant — under AA even here.
    onSurfaceVariant: '#98989D',
    outline: '#38383A',
    outlineVariant: '#2C2C2E',
    error: '#FF453A',
    // 8.95:1 on the elevated surface, 11.05:1 on true black.
    success: '#6fcf97',
    // 7.78:1 on the elevated surface, 9.6:1 on true black.
    warning: '#e8a13d',
  },
};

/**
 * Typed replacement for react-native-paper's `useTheme()` — use wherever
 * `theme.colors.success` / `theme.colors.warning` are read.
 */
export function useAppTheme(): AppTheme {
  return useTheme<AppTheme>();
}
