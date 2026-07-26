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

import { radii } from '@pattadar/tokens';

import { useSettingsContext } from 'src/components/settings';

// system
import { shadows } from './shadows';
import { typography } from './typography';
import { customShadows } from './custom-shadows';
import type { CustomShadows } from './custom-shadows';
import { grey, lightPalette, darkPalette } from './palette';
// options
import { componentsOverrides } from './overrides';
import NextAppDirEmotionCacheProvider from './next-emotion-cache';

// ----------------------------------------------------------------------
// MUI 9 theme: `colorSchemes` + CSS variables with a CLASS selector so both
// schemes ship in one stylesheet and the kit's settings drawer switches mode
// via `useColorScheme().setMode` (synced from SettingsContext below).
//
// Functional seams ported from the old apps/web theme.ts (pages depend on
// them): palette.primary.container/onContainer (set in palette.ts), the
// 'tonal' Button variant, `.tnum` / `.rowActions` utility classes, the
// prefers-reduced-motion guard and bottom-center snackbars.
// ----------------------------------------------------------------------

declare module '@mui/material/styles' {
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
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': {
            animationDuration: '0.01ms !important',
            animationIterationCount: '1 !important',
            transitionDuration: '0.01ms !important',
          },
        },
      },
    },
    MuiButton: {
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
    MuiSnackbar: {
      defaultProps: {
        anchorOrigin: { vertical: 'bottom', horizontal: 'center' },
      },
    },
  };
}

// ----------------------------------------------------------------------

/** Keeps MUI's color scheme in sync with the kit settings drawer. */
function ModeSync() {
  const settings = useSettingsContext();

  const { mode, setMode } = useColorScheme();

  useEffect(() => {
    if (settings.themeMode && settings.themeMode !== mode) {
      setMode(settings.themeMode);
    }
  }, [settings.themeMode, mode, setMode]);

  return null;
}

// ----------------------------------------------------------------------

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const settings = useSettingsContext();

  const boldContrast = settings.themeContrast === 'bold';

  const theme = useMemo(() => {
    const created = createTheme({
      cssVariables: { colorSchemeSelector: 'class' },
      colorSchemes: {
        light: {
          palette: {
            ...lightPalette,
            ...(boldContrast && {
              background: { ...lightPalette.background, default: grey[200] },
            }),
          },
        },
        dark: { palette: darkPalette },
      },
      shadows: shadows(),
      customShadows: customShadows(),
      shape: { borderRadius: radii.md },
      typography,
    });

    created.components = merge(
      componentsOverrides(created),
      pattadarSeams(created),
      boldContrast
        ? {
            MuiCard: {
              styleOverrides: {
                root: { boxShadow: created.customShadows.z1 },
              },
            },
          }
        : {}
    );

    return created;
  }, [boldContrast]);

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
