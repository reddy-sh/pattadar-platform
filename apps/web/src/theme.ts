/**
 * MUI theme derived from @pattadar/tokens.
 *
 * MUI v9 uses Emotion as its styling engine (Pigment CSS remains opt-in;
 * we stay on the default). CSS theme variables are enabled so both color
 * schemes ship in one stylesheet and switching is a data-attribute flip —
 * no re-render flash.
 *
 * Toggling: any component calls `useColorScheme()` from
 * '@mui/material/styles' and sets mode 'light' | 'dark' | 'system'.
 * MUI persists the choice in localStorage. The AppShell header exposes
 * the toggle. Default mode is 'system' (set on ThemeProvider in main.tsx).
 */
import { createTheme } from '@mui/material/styles';
import { radii, schemes, typography } from '@pattadar/tokens';
import type { ColorScheme } from '@pattadar/tokens';

/** Map one token scheme onto a MUI palette. */
function palette(s: ColorScheme) {
  return {
    palette: {
      primary: { main: s.primary, dark: s.primaryActive, contrastText: s.onPrimary },
      success: { main: s.success },
      warning: { main: s.warning },
      error: { main: s.error },
      info: { main: s.info },
      background: { default: s.background, paper: s.surface },
      text: {
        primary: s.textPrimary,
        secondary: s.textSecondary,
        disabled: s.textDisabled,
      },
      divider: s.border,
    },
  };
}

export const theme = createTheme({
  cssVariables: true,
  colorSchemes: {
    light: palette(schemes.light),
    dark: palette(schemes.dark),
  },
  typography: {
    fontFamily: typography.fontFamily,
    fontSize: typography.size.md,
    h1: { fontSize: typography.size.display, fontWeight: typography.weight.bold },
    h2: { fontSize: typography.size.xxl, fontWeight: typography.weight.semibold },
    h3: { fontSize: typography.size.xl, fontWeight: typography.weight.semibold },
    h4: { fontSize: typography.size.lg, fontWeight: typography.weight.semibold },
    body1: { fontSize: typography.size.md, lineHeight: typography.lineHeight.normal },
    body2: { fontSize: typography.size.sm, lineHeight: typography.lineHeight.normal },
    caption: { fontSize: typography.size.xs },
  },
  shape: {
    borderRadius: radii.md,
  },
});
