/**
 * React Native Paper (MD3) themes derived from @pattadar/tokens — the same
 * source the MUI web theme reads, so both heads share one brand language.
 */
import { tokens } from '@pattadar/tokens';
import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

const { schemes, gold, neutral, charcoal, status } = tokens;

export const paperLight: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: schemes.light.primary,
    onPrimary: schemes.light.onPrimary,
    primaryContainer: schemes.light.primaryContainer,
    onPrimaryContainer: schemes.light.onPrimaryContainer,
    secondary: schemes.light.accent,
    onSecondary: neutral[0],
    secondaryContainer: schemes.light.accentContainer,
    onSecondaryContainer: schemes.light.onAccentContainer,
    background: schemes.light.background,
    onBackground: schemes.light.textPrimary,
    surface: schemes.light.surface,
    onSurface: schemes.light.textPrimary,
    surfaceVariant: neutral[100],
    onSurfaceVariant: schemes.light.textSecondary,
    outline: schemes.light.border,
    outlineVariant: neutral[100],
    error: status.light.critical,
    onError: neutral[0],
  },
};

export const paperDark: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: schemes.dark.primary,
    onPrimary: schemes.dark.onPrimary,
    primaryContainer: schemes.dark.primaryContainer,
    onPrimaryContainer: schemes.dark.onPrimaryContainer,
    secondary: schemes.dark.accent,
    onSecondary: 'rgba(0, 0, 0, 0.87)',
    secondaryContainer: schemes.dark.accentContainer,
    onSecondaryContainer: schemes.dark.onAccentContainer,
    background: schemes.dark.background,
    onBackground: schemes.dark.textPrimary,
    surface: schemes.dark.surface,
    onSurface: schemes.dark.textPrimary,
    surfaceVariant: charcoal.surfaceRaised,
    onSurfaceVariant: schemes.dark.textSecondary,
    outline: schemes.dark.border,
    outlineVariant: charcoal.border,
    error: status.dark.critical,
    onError: 'rgba(0, 0, 0, 0.87)',
  },
};

export const goldAccent = gold;
