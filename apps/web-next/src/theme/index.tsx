'use client';

import merge from 'lodash/merge';
import { useMemo, useEffect } from 'react';

import CssBaseline from '@mui/material/CssBaseline';
import {
  createTheme,
  useColorScheme,
  ThemeProvider as MuiThemeProvider,
} from '@mui/material/styles';
import type { Theme, Components } from '@mui/material/styles';

import { motion, radii } from '@pattadar/tokens';

import { useSettingsContext } from 'src/components/settings';

// system
import { shadows } from './shadows';
import { typography } from './typography';
import { customShadows } from './custom-shadows';
import type { CustomShadows } from './custom-shadows';
import { lightPalette, darkPalette, highContrastPalette } from './palette';
// options
import { componentsOverrides } from './overrides';
import NextAppDirEmotionCacheProvider from './next-emotion-cache';

// ----------------------------------------------------------------------
// MUI 9 theme: `colorSchemes` + CSS variables with a CLASS selector so all
// three schemes ship in one stylesheet. Settings exposes one canonical choice,
// mapped to MUI's mode and color-scheme APIs by ModeSync below.
//
// Functional seams ported from the old apps/web theme.ts (pages depend on
// them): palette.primary.container/onContainer (set in palette.ts), the
// 'tonal' Button variant, `.tnum` / `.rowActions` utility classes, the
// prefers-reduced-motion guard and bottom-center snackbars.
//
// This file is also the ground the shared component kit (`src/components/kit/*`)
// stands on, which is why five otherwise component-shaped decisions live here.
// The kit is forbidden from writing a radius, a duration or a control height of
// its own, so the theme has to be the single place those are true:
//
//   · `shape.borderRadius` is the spec's 12, not 8. It is the multiplier behind
//     every numeric `sx borderRadius` in the app, so it has to be right before
//     anything token-driven is written against it.
//   · `transitions` carries the spec's 200/250 on the emphasized-decelerate
//     curve, sourced from the `motion` token rather than retyped, so a surface
//     that claims to ride the standard duration actually does.
//   · Button and IconButton carry the M3 40 / 32 / 44 heights, which is what
//     lets a kit control never set a height inline and never leave a tap target
//     under 44x44 — icon buttons ship at 30/40 otherwise.
//   · The High-Contrast Card override finally names a `borderStyle`. Without
//     one, the 2px black border it asks for is simply never painted, and the
//     scheme that exists for legibility loses every card edge.
//   · `.kit-focusable` is a convenience focus ring for feature code. Kit
//     primitives compose their own and do not depend on it; High Contrast's
//     stronger ring is declared after it so it still wins.
//
// Contract: docs/specs/2026-09-14-web-component-kit-contract.md
// Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
// ----------------------------------------------------------------------

declare module '@mui/material/styles' {
  interface ColorSchemeOverrides {
    highContrast: true;
  }
  interface PaletteColor {
    lighter: string;
    darker: string;
    /** Soft container fill for selected states / tonal surfaces. */
    container?: string;
    /** Readable text/icon colour on `container`. */
    onContainer?: string;
  }
  interface SimplePaletteColorOptions {
    lighter?: string;
    darker?: string;
    container?: string;
    onContainer?: string;
  }
  interface Palette {
    shadowChannel: string;
  }
  interface PaletteOptions {
    shadowChannel?: string;
  }
  interface TypeBackground {
    neutral: string;
  }
  interface Theme {
    customShadows: CustomShadows;
  }
  interface ThemeOptions {
    customShadows?: CustomShadows;
  }
  interface TypographyVariants {
    fontSecondaryFamily: string;
    fontWeightSemiBold: number;
  }
  interface TypographyVariantsOptions {
    fontSecondaryFamily?: string;
    fontWeightSemiBold?: number;
  }
}

declare module '@mui/material/Button' {
  interface ButtonPropsVariantOverrides {
    /** Filled-tonal button — soft primary fill, quiet emphasis. */
    tonal: true;
    /** Minimals soft variant (styled in overrides/components/button.js). */
    soft: true;
  }
}

// ----------------------------------------------------------------------

/** Pattadar functional seams ported from apps/web/src/theme.ts. */
function pattadarSeams(theme: Theme): Components<Theme> {
  const vars = theme.vars!; // always defined — cssVariables is enabled above

  return {
    MuiCssBaseline: {
      styleOverrides: {
        // Tabular numerals for stat figures.
        '.tnum': {
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum"',
        },
        // Row actions reveal on hover/focus — always visible on touch.
        '.rowActions': { opacity: 0, transition: 'opacity 150ms ease' },
        '@media (hover: none)': { '.rowActions': { opacity: 1 } },
        '.MuiTableRow-root:hover .rowActions, .MuiTableRow-root:focus-within .rowActions': {
          opacity: 1,
        },
        // Opt-in focus ring for feature code that owns its own focusable
        // element. Declared BEFORE the High Contrast rule below, which matches
        // at the same specificity and therefore needs source order to win.
        '.kit-focusable:focus-visible': {
          outline: `2px solid ${vars.palette.secondary.main}`,
          outlineOffset: 2,
        },
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': {
            animationDuration: '0.01ms !important',
            animationIterationCount: '1 !important',
            transitionDuration: '0.01ms !important',
          },
        },
        // High Contrast strengthens keyboard focus globally. Light and Dark
        // retain their normal component/browser focus treatment.
        '.highContrast :focus-visible, .highContrast .Mui-focusVisible': {
          outline: `3px solid ${vars.palette.primary.main}`,
          outlineOffset: 2,
        },
      },
    },
    MuiButton: {
      // M3 heights, so no kit control ever sets one inline. The donor kit
      // pins small to 30px and leaves medium at MUI's ~36px; both are under
      // the spec's 40 / 32.
      styleOverrides: {
        sizeMedium: { minHeight: 40 },
        sizeSmall: { minHeight: 32 },
      },
      variants: [
        {
          props: { variant: 'tonal' },
          style: {
            backgroundColor: vars.palette.primary.container,
            color: vars.palette.primary.onContainer,
            '&:hover': {
              backgroundColor: `color-mix(in srgb, ${vars.palette.primary.main} 16%, transparent)`,
            },
            '&:active': {
              backgroundColor: `color-mix(in srgb, ${vars.palette.primary.main} 24%, transparent)`,
            },
            '&.Mui-disabled': {
              backgroundColor: vars.palette.action.disabledBackground,
              color: vars.palette.action.disabled,
            },
          },
        },
      ],
    },
    MuiIconButton: {
      // 44x44 is the floor for a touch target, including the small size —
      // which keeps its 20px glyph and gains padding instead of shrinking.
      styleOverrides: {
        root: { minWidth: 44, minHeight: 44 },
        sizeSmall: { minWidth: 44, minHeight: 44, padding: 10 },
      },
    },
    MuiSnackbar: {
      defaultProps: {
        anchorOrigin: { vertical: 'bottom', horizontal: 'center' },
      },
    },
  };
}

// ----------------------------------------------------------------------

/** Maps the canonical setting to MUI's binary mode and named color scheme. */
function ModeSync() {
  const settings = useSettingsContext();
  const { mode, lightColorScheme, darkColorScheme, setMode, setColorScheme } = useColorScheme();

  useEffect(() => {
    if (!settings.settingsReady) return;

    if (settings.themeChoice === 'dark') {
      if (darkColorScheme !== 'dark') setColorScheme({ dark: 'dark' });
      if (mode !== 'dark') setMode('dark');
      return;
    }

    const lightScheme = settings.themeChoice === 'highContrast' ? 'highContrast' : 'light';
    if (lightColorScheme !== lightScheme) setColorScheme({ light: lightScheme });
    if (mode !== 'light') setMode('light');
  }, [
    settings.settingsReady,
    settings.themeChoice,
    mode,
    lightColorScheme,
    darkColorScheme,
    setMode,
    setColorScheme,
  ]);

  return null;
}

// ----------------------------------------------------------------------

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useMemo(() => {
    const created = createTheme({
      cssVariables: { colorSchemeSelector: 'class' },
      colorSchemes: {
        light: { palette: lightPalette },
        dark: { palette: darkPalette },
        highContrast: {
          palette: {
            ...highContrastPalette,
            mode: 'light',
          },
        },
      },
      shadows: shadows(),
      customShadows: customShadows(),
      shape: { borderRadius: radii.lg },
      // The spec's motion, expressed once so components can spend
      // `theme.transitions` instead of inventing a duration each time.
      transitions: {
        duration: {
          standard: motion.duration.standard,
          complex: motion.duration.emphasized,
          enteringScreen: motion.duration.standard,
          leavingScreen: motion.duration.standard,
        },
        easing: {
          easeInOut: motion.easing,
          easeOut: motion.easing,
        },
      },
      typography,
    });

    created.components = merge(componentsOverrides(created), pattadarSeams(created), {
      MuiCard: {
        styleOverrides: {
          // `borderStyle` is load-bearing: MUI's Card ships `border: 0`, so a
          // colour and a width alone paint nothing at all.
          root: created.applyStyles('highContrast', {
            boxShadow: 'none',
            borderStyle: 'solid',
            borderColor: '#000000',
            borderWidth: 2,
          }),
        },
      },
    });

    return created;
  }, []);

  return (
    <NextAppDirEmotionCacheProvider options={{ key: 'css' }}>
      <MuiThemeProvider theme={theme} defaultMode="light">
        <ModeSync />
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </NextAppDirEmotionCacheProvider>
  );
}
