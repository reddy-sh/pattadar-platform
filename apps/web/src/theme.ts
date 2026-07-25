/**
 * "Emerald & Gold" MUI theme derived from @pattadar/tokens.
 *
 * CSS theme variables are enabled so both color schemes ship in one
 * stylesheet and switching is a data-attribute flip. Toggling: any component
 * calls `useColorScheme()` and sets mode 'light' | 'dark' | 'system'
 * (default 'system', set on ThemeProvider in main.tsx).
 *
 * Component posture: quiet matte surfaces — Cards are elevation 0 with a 1px
 * border; Buttons keep sentence case; focus-visible draws an emerald ring.
 * The one shiny thing in the app is <GlassCard>, used sparingly.
 */
import { createTheme } from '@mui/material/styles';
import { radii, schemes, typography } from '@pattadar/tokens';
import type { ColorScheme } from '@pattadar/tokens';

/** Map one token scheme onto a MUI palette. */
function palette(s: ColorScheme) {
  return {
    palette: {
      primary: { main: s.primary, dark: s.primaryActive, contrastText: s.onPrimary },
      secondary: { main: s.accent },
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
    h1: { fontSize: typography.size.display, fontWeight: typography.weight.bold, letterSpacing: '-0.02em' },
    h2: { fontSize: typography.size.xxl, fontWeight: typography.weight.semibold, letterSpacing: '-0.01em' },
    h3: { fontSize: typography.size.xl, fontWeight: typography.weight.semibold },
    h4: { fontSize: typography.size.lg, fontWeight: typography.weight.semibold },
    h5: { fontSize: typography.size.md, fontWeight: typography.weight.semibold },
    h6: { fontSize: typography.size.md, fontWeight: typography.weight.semibold },
    subtitle1: { fontSize: typography.size.md, fontWeight: typography.weight.medium },
    subtitle2: { fontSize: typography.size.sm, fontWeight: typography.weight.medium },
    body1: { fontSize: typography.size.md, lineHeight: typography.lineHeight.normal },
    body2: { fontSize: typography.size.sm, lineHeight: typography.lineHeight.normal },
    caption: { fontSize: typography.size.xs },
    overline: {
      fontSize: 11,
      fontWeight: typography.weight.semibold,
      letterSpacing: '0.08em',
      textTransform: 'uppercase' as const,
    },
    button: { textTransform: 'none' as const, fontWeight: typography.weight.semibold },
  },
  shape: {
    borderRadius: radii.lg, // 12
  },
  components: {
    MuiButtonBase: {
      styleOverrides: {
        root: ({ theme: t }) => ({
          '&.Mui-focusVisible': {
            outline: `2px solid ${t.vars.palette.primary.main}`,
            outlineOffset: 2,
          },
        }),
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { textTransform: 'none', borderRadius: 10 },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: ({ theme: t }) => ({
          border: `1px solid ${t.vars.palette.divider}`,
          backgroundImage: 'none',
        }),
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 500 },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: ({ theme: t }) => ({
          fontWeight: 600,
          fontSize: 13,
          color: t.vars.palette.text.secondary,
          whiteSpace: 'nowrap',
        }),
      },
    },
    MuiTooltip: {
      defaultProps: { arrow: true },
    },
    MuiListSubheader: {
      styleOverrides: {
        root: {
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          lineHeight: '32px',
          backgroundColor: 'transparent',
        },
      },
    },
  },
});
