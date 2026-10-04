/**
 * Pattadar's MUI theme · design authority: design.md
 *
 * The colours are not written here. Every scheme comes from the palette pack
 * in @pattadar/tokens (packages/tokens/src/palette): Bloom Dark (canonical),
 * its warm Light derivation, Pattadar Gold, and the light-based High Contrast
 * reading mode, plus whatever the registry adds next. `muiColorSchemes` builds each through
 * MUI's own createTheme, so a new scheme can never arrive half-filled, and
 * scripts/palette-tests.ts holds every one of them to the contrast floors
 * before it reaches this file.
 *
 * All six semantic slots are defined on every scheme. Leaving `warning`,
 * `info` or `secondary` undefined does not disable them — MUI silently falls
 * back to its factory defaults (#ed6c02 orange, #0288d1 blue, #9c27b0 purple),
 * which is how blue and purple once reached an amber app.
 *
 * CSS theme variables are keyed on `<html data-scheme="…">`
 * (colorSchemeSelector 'data-scheme'), so every scheme ships in one
 * stylesheet and `useColorScheme` switches between them. Dark is the default
 * scheme: its variables also sit on `:root`, so the page is dark before
 * anything has run. Any element can carry the same attribute to wear one
 * scheme regardless of the user's choice — the marketing and sign-in pages
 * wrap themselves in `data-scheme="dark"`.
 *
 * Functional seams preserved from the stock era (pages rely on them):
 *  - `palette.primary.container` / `.onContainer` (selected fills)
 *  - the 'tonal' Button variant
 *  - `.tnum` and `.rowActions` utility classes + prefers-reduced-motion guard
 *  - bottom-center snackbars
 */
import { createTheme } from '@mui/material/styles';
import { FONT_SANS, muiColorSchemes, registry, type ChromeRoles, type DecorRoles } from '@pattadar/tokens';

declare module '@mui/material/styles' {
  interface ColorSchemeOverrides {
    highContrast: true;
    pattadar: true;
  }
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
  interface TypeBackground {
    /** A surface on a surface: a well, a hovered row, a nested panel. */
    raised: string;
  }
  interface TypeText {
    /** The quietest text that is still text: labels, eyebrows, units. */
    muted: string;
  }
  interface Palette {
    dividerStrong: string;
    /** Keyboard focus ring, and the halo a two-tone ring draws outside it. */
    focus: string;
    focusHalo: string;
    /** The top bar's own colours. */
    chrome: ChromeRoles;
    /** The marketing surface's ambient colours (Bloom Dark only). */
    decor?: DecorRoles;
  }
  interface PaletteOptions {
    dividerStrong?: string;
    focus?: string;
    focusHalo?: string;
    chrome?: ChromeRoles;
    decor?: DecorRoles;
  }
}

declare module '@mui/material/Button' {
  interface ButtonPropsVariantOverrides {
    /** Filled-tonal button — soft primary fill, quiet emphasis. */
    tonal: true;
  }
}

/** Shared heading voice — the one face at 700, roman always, untracked. It
 *  names no family: every variant inherits `typography.fontFamily`. */
const heading = (fontWeight: number) => ({ fontWeight, letterSpacing: 0 });

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'data-scheme' },
  defaultColorScheme: registry.defaults.web,
  colorSchemes: muiColorSchemes(registry, createTheme),
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: FONT_SANS,
    // The face has 400 and 700 and nothing else. MUI's own defaults ask for
    // 300 and 500, which a browser silently draws as 400 — so say 400.
    fontWeightLight: 400,
    fontWeightRegular: 400,
    fontWeightMedium: 400,
    fontWeightBold: 700,
    h1: heading(700),
    h2: heading(700),
    h3: heading(700),
    h4: heading(700),
    h5: heading(700),
    h6: heading(700),
    button: { textTransform: 'none', fontWeight: 700, letterSpacing: 0 },
    // The eyebrow is a small uppercase label in the one face, not a second
    // face. Every PageHeader `eyebrow` and <Typography variant="overline">
    // inherits it.
    overline: {
      fontSize: '0.75rem',
      fontWeight: 400,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      lineHeight: 1.6,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // Strong, two-tone keyboard focus ring only while High Contrast is
        // active: 3px in the scheme's focus colour, with a 3px halo between it
        // and the control, so it reads on white paper, on a filled button and
        // over imagery alike. Both colours are the pack's (focus, focusHalo),
        // resolved where the ring is drawn. It outranks every component's 2px
        // ring; W360 moves it in three places and reduces it nowhere (w360.css,
        // "High Contrast strengthens every keyboard focus ring").
        '[data-scheme="highContrast"] :focus-visible': {
          outline: '3px solid var(--mui-palette-focus) !important',
          outlineOffset: '3px !important',
          boxShadow: '0 0 0 3px var(--mui-palette-focusHalo) !important',
        },
        // Stat figures line up through the face's own tabular figures, not a
        // monospace face (design.md § Typography).
        '.tnum': {
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum"',
        },
        // One face everywhere. The user-agent stylesheet gives form controls
        // a system face and code/kbd/pre/samp a monospace one; each inherits.
        'button, input, select, textarea, optgroup, code, kbd, pre, samp': {
          fontFamily: 'inherit',
        },
        // Leaflet's stylesheet sets Helvetica on the map, Lucida Console on
        // its zoom buttons and Tahoma on the popup close. `body` outranks its
        // selectors whatever order the two stylesheets load in.
        'body .leaflet-container, body .leaflet-container .leaflet-control-zoom-in, body .leaflet-container .leaflet-control-zoom-out, body .leaflet-container a.leaflet-popup-close-button': {
          fontFamily: 'inherit',
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
