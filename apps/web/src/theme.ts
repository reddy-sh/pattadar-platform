/**
 * STOCK Material UI theme (founder decision 2026-07-26: the default MUI look
 * — font, colors, everything — per mui.com/material-ui/customization/dark-mode).
 * Default palette, default Roboto type scale, default shape/elevation; dark
 * mode is MUI's built-in dark color scheme.
 *
 * CSS theme variables are enabled with a CLASS colour-scheme selector so both
 * schemes ship in one stylesheet AND `useColorScheme().setMode` works (the
 * default 'media' selector makes setMode a no-op).
 *
 * The ONLY additions to the default theme are functional seams existing pages
 * rely on, with every colour derived from the DEFAULT palette:
 *  - `palette.primary.container` / `.onContainer` (selected fills across pages)
 *  - the 'tonal' Button variant
 *  - `.tnum` and `.rowActions` utility classes + prefers-reduced-motion guard
 *  - bottom-center snackbars
 */
import { createTheme } from '@mui/material/styles';

declare module '@mui/material/styles' {
  interface PaletteColor {
    /** Soft container fill for selected states / tonal surfaces. */
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
    /** Filled-tonal button — soft primary fill, quiet emphasis. */
    tonal: true;
  }
}

// Default MUI primary anchors (light #1976d2 / dark #90caf9) — restated here
// only to build the container fills; `main` stays the default value.
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: {
          main: '#1976d2',
          container: 'rgba(25, 118, 210, 0.08)',
          onContainer: '#1565c0',
        },
      },
    },
    dark: {
      palette: {
        primary: {
          main: '#90caf9',
          container: 'rgba(144, 202, 249, 0.16)',
          onContainer: '#90caf9',
        },
      },
    },
  },
  components: {
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
          style: ({ theme: t }) => ({
            backgroundColor: t.vars.palette.primary.container,
            color: t.vars.palette.primary.onContainer,
            '&:hover': {
              backgroundColor: `color-mix(in srgb, ${t.vars.palette.primary.main} 16%, transparent)`,
            },
            '&:active': {
              backgroundColor: `color-mix(in srgb, ${t.vars.palette.primary.main} 24%, transparent)`,
            },
            '&.Mui-disabled': {
              backgroundColor: t.vars.palette.action.disabledBackground,
              color: t.vars.palette.action.disabled,
            },
          }),
        },
      ],
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
  },
});
