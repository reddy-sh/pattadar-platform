/**
 * "Emerald & Gold" MUI theme derived from @pattadar/tokens — Material Design 3
 * role mapping over the brand palette (2026-07-26 UX redesign spec).
 *
 * CSS theme variables are enabled with a CLASS colour-scheme selector so both
 * schemes ship in one stylesheet AND `useColorScheme().setMode` works (the
 * default 'media' selector makes setMode a no-op). Toggling: any component
 * calls `useColorScheme()` and sets mode 'light' | 'dark' | 'system'.
 *
 * M3 mapping:
 *  - primary emerald + primaryContainer (selected states, tonal buttons)
 *  - secondary gold — RESERVED: wallet, hero glass, focus rings, accents
 *  - tertiary teal rides on `info`; warning orange stays reserved (tax/EC)
 *  - state layers: hover 8%, focus/pressed 12%
 *  - shape: 12 default · 16 cards · 20 dialogs · full pills/chips/buttons
 *  - motion: 200ms standard / 250ms emphasized on cubic-bezier(0.2, 0, 0, 1)
 *  - focus-visible: 2px GOLD ring, 2px offset, everywhere
 */
import { createTheme } from '@mui/material/styles';
import { motion, radii, schemes, typography } from '@pattadar/tokens';
import type { ColorScheme } from '@pattadar/tokens';

declare module '@mui/material/styles' {
  interface PaletteColor {
    /** M3 container role (soft fill for selected states / tonal surfaces). */
    container?: string;
    /** Readable text/icon colour on `container`. */
    onContainer?: string;
  }
  interface SimplePaletteColorOptions {
    container?: string;
    onContainer?: string;
  }
}

declare module '@mui/material/Button' {
  interface ButtonPropsVariantOverrides {
    /** M3 filled-tonal button — primaryContainer fill, quiet emphasis. */
    tonal: true;
  }
}

/** Map one token scheme onto a MUI palette (M3 roles included). */
function palette(s: ColorScheme, mode: 'light' | 'dark') {
  return {
    palette: {
      primary: {
        main: s.primary,
        dark: s.primaryActive,
        contrastText: s.onPrimary,
        container: s.primaryContainer,
        onContainer: s.onPrimaryContainer,
      },
      secondary: {
        main: s.accent,
        container: s.accentContainer,
        onContainer: s.onAccentContainer,
      },
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
      // M3 state layers: hover 8%, focus/pressed/selected 12% — emerald-washed.
      action: {
        hover: mode === 'light' ? 'rgba(20, 108, 67, 0.05)' : 'rgba(124, 194, 157, 0.08)',
        selected: mode === 'light' ? 'rgba(20, 108, 67, 0.10)' : 'rgba(124, 194, 157, 0.14)',
        hoverOpacity: 0.08,
        focusOpacity: 0.12,
        selectedOpacity: 0.12,
        activatedOpacity: 0.12,
      },
    },
  };
}

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: palette(schemes.light, 'light'),
    dark: palette(schemes.dark, 'dark'),
  },
  // M3 motion tokens: standard 200ms / emphasized 250ms, one decelerate curve.
  transitions: {
    duration: {
      shortest: 100,
      shorter: 150,
      short: motion.duration.standard,
      standard: motion.duration.standard,
      complex: motion.duration.emphasized,
      enteringScreen: motion.duration.standard,
      leavingScreen: 150,
    },
    easing: {
      easeInOut: motion.easing,
      easeOut: 'cubic-bezier(0, 0, 0, 1)',
      easeIn: 'cubic-bezier(0.3, 0, 1, 1)',
      sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
    },
  },
  typography: {
    fontFamily: typography.fontFamily,
    fontSize: typography.size.md,
    // Display — landing hero only.
    h1: { fontSize: typography.size.display, fontWeight: typography.weight.bold, letterSpacing: '-0.02em' },
    // Headline — page titles: 28px / 700.
    h2: { fontSize: 28, fontWeight: typography.weight.bold, letterSpacing: '-0.01em', lineHeight: 1.25 },
    // Titles — card/section titles: 20 / 17, 600.
    h3: { fontSize: 20, fontWeight: typography.weight.semibold, lineHeight: 1.3 },
    h4: { fontSize: 17, fontWeight: typography.weight.semibold, lineHeight: 1.35 },
    h5: { fontSize: typography.size.md, fontWeight: typography.weight.semibold },
    h6: { fontSize: typography.size.md, fontWeight: typography.weight.semibold },
    subtitle1: { fontSize: typography.size.md, fontWeight: typography.weight.medium },
    subtitle2: { fontSize: typography.size.sm, fontWeight: typography.weight.medium },
    body1: { fontSize: typography.size.md, lineHeight: 1.55 },
    body2: { fontSize: typography.size.sm, lineHeight: 1.55 },
    caption: { fontSize: typography.size.xs },
    // Label — eyebrows, table headers: 12 / 600 / +1 tracking.
    overline: {
      fontSize: 12,
      fontWeight: typography.weight.semibold,
      letterSpacing: '0.08em',
      textTransform: 'uppercase' as const,
      lineHeight: 1.6,
    },
    button: { textTransform: 'none' as const, fontWeight: typography.weight.semibold },
  },
  shape: {
    borderRadius: radii.lg, // 12 default
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: (t) => ({
        // Global focus-visible: the 2px GOLD ring, 2px offset.
        ':focus-visible': {
          outline: `2px solid ${t.vars.palette.secondary.main}`,
          outlineOffset: '2px',
        },
        // MUI fields draw their own focused border — no inner double ring.
        '.MuiInputBase-input:focus-visible': { outline: 'none' },
        // Tabular numerals for stat figures.
        '.tnum': {
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum"',
        },
        // Row actions reveal on hover/focus — always visible on touch.
        '.rowActions': { opacity: 0, transition: `opacity 150ms ${motion.easing}` },
        '@media (hover: none)': { '.rowActions': { opacity: 1 } },
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': {
            animationDuration: '0.01ms !important',
            animationIterationCount: '1 !important',
            transitionDuration: '0.01ms !important',
          },
        },
      }),
    },
    MuiButtonBase: {
      styleOverrides: {
        root: ({ theme: t }) => ({
          '&.Mui-focusVisible': {
            outline: `2px solid ${t.vars.palette.secondary.main}`,
            outlineOffset: 2,
          },
        }),
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: radii.pill, // M3 full-rounded buttons
          minHeight: 40,
          paddingLeft: 20,
          paddingRight: 20,
        },
        sizeSmall: { minHeight: 32, paddingLeft: 14, paddingRight: 14 },
        sizeLarge: { minHeight: 48, paddingLeft: 24, paddingRight: 24 },
        startIcon: { marginRight: 8 },
        endIcon: { marginLeft: 8 },
      },
      variants: [
        {
          props: { variant: 'tonal' },
          style: ({ theme: t }) => ({
            backgroundColor: t.vars.palette.primary.container,
            color: t.vars.palette.primary.onContainer,
            '&:hover': {
              backgroundColor: `color-mix(in srgb, ${t.vars.palette.primary.main} 8%, ${t.vars.palette.primary.container})`,
            },
            '&:active': {
              backgroundColor: `color-mix(in srgb, ${t.vars.palette.primary.main} 12%, ${t.vars.palette.primary.container})`,
            },
            '&.Mui-disabled': {
              backgroundColor: t.vars.palette.action.disabledBackground,
              color: t.vars.palette.action.disabled,
            },
          }),
        },
      ],
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: ({ theme: t }) => ({
          borderRadius: radii.xl, // 16 — M3 card shape
          border: `1px solid ${t.vars.palette.divider}`,
          backgroundImage: 'none',
          // Surface tint (not shadow) marks the resting card.
          backgroundColor: t.vars.palette.background.paper,
        }),
      },
    },
    MuiChip: {
      styleOverrides: {
        root: ({ theme: t, ownerState }) => ({
          fontWeight: 500,
          ...(ownerState.variant !== 'outlined' &&
          ownerState.color &&
          ownerState.color !== 'default'
            ? {
                // M3 tonal status chips: container fill + readable on-colour.
                backgroundColor: `color-mix(in srgb, ${t.vars.palette[ownerState.color].main} 16%, transparent)`,
                color: `color-mix(in srgb, ${t.vars.palette[ownerState.color].main} 78%, ${t.vars.palette.text.primary})`,
                // Clickable tonal chips deepen the container on hover (8% layer).
                ...(ownerState.onClick || ownerState.clickable
                  ? {
                      '&:hover': {
                        backgroundColor: `color-mix(in srgb, ${t.vars.palette[ownerState.color].main} 26%, transparent)`,
                      },
                    }
                  : {}),
              }
            : {}),
        }),
        sizeSmall: { height: 24 },
        sizeMedium: { height: 32 },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: radii.xxl, // 20 — M3 dialog shape
          '&.MuiDialog-paperFullScreen': { borderRadius: 0 },
        },
        // The M3 "standard" dialog width.
        paperWidthSm: { maxWidth: 560 },
      },
    },
    MuiSnackbar: {
      defaultProps: {
        anchorOrigin: { vertical: 'bottom', horizontal: 'center' },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover .rowActions, &:focus-within .rowActions': { opacity: 1 },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { padding: '14px 16px' },
        head: ({ theme: t }) => ({
          // Table headers wear the M3 label (overline) style.
          fontWeight: typography.weight.semibold,
          fontSize: 12,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: t.vars.palette.text.secondary,
          whiteSpace: 'nowrap',
        }),
        // 52px list rows (20px line + 2×15 padding + border).
        sizeSmall: { padding: '15px 12px' },
        paddingNone: { padding: 0 },
      },
    },
    MuiTooltip: {
      defaultProps: { arrow: true },
    },
    // Interactive text = primary.main with underline on hover only.
    MuiLink: {
      defaultProps: { underline: 'hover' },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: { borderRadius: radii.lg },
      },
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
