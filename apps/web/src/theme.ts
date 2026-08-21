/**
 * Hallmark · design-system: design.md · theme: Bloom (studied-DNA) · designed-as-app
 *
 * Bloom design system (founder decision 2026-08-14 — see design.md at the
 * repo root). Supersedes the 2026-07-26 stock-MUI decision: colors and
 * typography now derive from the studied Hallmark DNA in
 * src/styles/tokens.css (dark scheme is the canonical Bloom palette; the
 * light scheme is a warm-tinted derivation documented in design.md).
 * Every hex below is a pre-computed sRGB conversion of a tokens.css oklch
 * value — MUI needs literal parseable colors for its channel math.
 *
 * ALL SIX semantic slots are defined on BOTH schemes. Leaving `warning`,
 * `info` or `secondary` undefined does not disable them — MUI silently falls
 * back to its factory defaults (#ed6c02 orange, #0288d1 blue, #9c27b0 purple),
 * which is how blue and purple reached an amber app. Every ratio in the
 * comments is measured against that scheme's `background.default`.
 *
 * CSS theme variables stay enabled with a CLASS colour-scheme selector so
 * both schemes ship in one stylesheet AND `useColorScheme().setMode` works
 * (the default 'media' selector makes setMode a no-op). Marketing surfaces
 * opt into permanent dark by wrapping themselves in `.dark.site`.
 *
 * Functional seams preserved from the stock era (pages rely on them):
 *  - `palette.primary.container` / `.onContainer` (selected fills)
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

const FONT_BODY = '"Inter", system-ui, -apple-system, sans-serif';
const FONT_DISPLAY = '"Inter Tight", "Inter", system-ui, sans-serif';
const FONT_MONO = '"JetBrains Mono", ui-monospace, "SFMono-Regular", monospace';

/** Shared heading voice — Inter Tight, tight tracking, roman always. */
const heading = (fontWeight: number, letterSpacing = '-0.02em') => ({
  fontFamily: FONT_DISPLAY,
  fontWeight,
  letterSpacing,
});

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    // Warm-light derivation of the Bloom hues (design.md § Light scheme).
    // primary is the amber darkened to oklch(55% 0.13 55) so white text
    // clears 4.5:1 (measured 5.07:1).
    light: {
      palette: {
        primary: {
          main: '#aa5910',
          contrastText: '#ffffff',
          container: 'rgba(170, 89, 16, 0.08)',
          onContainer: '#8c4a11',
        },
        // Coral (--color-accent-2) darkened for light paper — 5.56:1.
        secondary: {
          main: '#b23645',
          contrastText: '#ffffff',
          container: 'rgba(178, 54, 69, 0.08)',
          onContainer: '#8f2b37',
        },
        error: { main: '#be222a' },
        success: { main: '#27762f' },
        // Gold, held off primary's 55° so "needs attention" ≠ "do this". 5.20:1.
        warning: { main: '#905d00', contrastText: '#ffffff' },
        // Muted slate — the one cool seam, low chroma so it never competes. 5.47:1.
        info: { main: '#3d6a7f', contrastText: '#ffffff' },
        background: { default: '#f9f6f2', paper: '#fdfcf9' },
        text: { primary: '#261d1a', secondary: '#615956' },
        divider: '#e3ddd8',
      },
    },
    // Canonical Bloom dark — hex conversions of tokens.css oklch values.
    dark: {
      palette: {
        primary: {
          main: '#fe860f', // --color-accent · 8.29:1 on paper
          contrastText: '#180600', // --color-accent-ink · 8.11:1 on accent
          container: 'rgba(254, 134, 15, 0.16)',
          onContainer: '#fe860f',
        },
        // --color-accent-2 coral, unchanged from tokens.css · 6.16:1 on paper.
        secondary: {
          main: '#ff4a63',
          contrastText: '#180600',
          container: 'rgba(255, 74, 99, 0.16)',
          onContainer: '#ff4a63',
        },
        error: { main: '#ff5453' },
        success: { main: '#61c568' },
        // Gold, held off primary's 55° so "needs attention" ≠ "do this". 10.57:1.
        warning: { main: '#f5ae39', contrastText: '#180600' },
        // Muted slate — the one cool seam, low chroma so it never competes. 9.55:1.
        info: { main: '#82bad5', contrastText: '#180600' },
        background: { default: '#0d0504', paper: '#170c09' }, // paper / paper-2
        text: { primary: '#f3ede7', secondary: '#bfb5ae' }, // ink / ink-2
        divider: '#312622', // --color-rule
      },
    },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: FONT_BODY,
    h1: heading(800),
    h2: heading(700),
    h3: heading(700),
    h4: heading(700),
    h5: heading(600, '-0.01em'),
    h6: heading(600, '-0.01em'),
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: '-0.01em' },
    // Mono eyebrow — the app's half of design.md's "JetBrains Mono labels".
    // Every PageHeader `eyebrow` and <Typography variant="overline"> inherits it.
    overline: {
      fontFamily: FONT_MONO,
      fontSize: '0.75rem',
      fontWeight: 500,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      lineHeight: 1.6,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // Tabular numerals for stat figures — mono per the Bloom DNA.
        '.tnum': {
          fontFamily: FONT_MONO,
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum"',
          letterSpacing: '-0.01em',
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
      styleOverrides: {
        // Pill CTAs are the system's button voice (design.md § CTA voice).
        root: { borderRadius: 999 },
      },
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
    MuiPaper: {
      styleOverrides: {
        rounded: { borderRadius: 12 },
      },
    },
    // Hairline rule language (design.md § What pages MUST share): surfaces are
    // separated by a 1px --color-rule border, never by a drop shadow. Pass
    // `elevation` explicitly on the rare surface that must float (menus, dialogs).
    MuiCard: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: {
        root: ({ theme: t }) => ({
          backgroundImage: 'none',
          borderColor: (t.vars ?? t).palette.divider,
        }),
      },
    },
    MuiSnackbar: {
      defaultProps: {
        anchorOrigin: { vertical: 'bottom', horizontal: 'center' },
      },
    },
    // MUI derives the track from the bar's own colour — darken(primary, 0.5) on
    // dark, which is a fully saturated #7f4307. A 0%-complete bar then reads as
    // a finished amber line, and every progress track spends accent budget.
    // The track is a neutral groove; only the fill carries meaning.
    MuiLinearProgress: {
      styleOverrides: {
        root: ({ theme: t }) => ({
          backgroundColor: (t.vars ?? t).palette.action.selected,
          borderRadius: 999,
        }),
        bar: { borderRadius: 999 },
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
