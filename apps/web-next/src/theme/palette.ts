import { alpha } from '@mui/material/styles';
import { brand, gold, schemes } from '@pattadar/tokens';

// ----------------------------------------------------------------------
// Pattadar palette on the Minimals structure.
//
// Brand colors come from @pattadar/tokens (single source shared with the
// mobile Paper theme): primary = Material-standard blue ramp, secondary =
// gold/amber (properties, wealth). The grey ramp and the status ramps
// (info/success/warning/error) stay the Minimals values because the kit's
// component overrides depend on their lighter..darker steps.
//
// Exported as three full palettes (light/dark/high contrast) for the MUI 9
// `colorSchemes` CSS-variables API.
//
// M3 container roles. Every tonal surface in the component kit — status
// chips, stat tiles, the selection bar, zero states — is painted from a
// `container` / `onContainer` pair rather than from a hand-mixed alpha, so
// the four status hues carry the pair that primary and secondary already
// get from @pattadar/tokens. The pairs are re-spread into each scheme
// instead of being set once on the shared `base` object: high contrast
// deliberately redefines all four hues outright, and a shared definition
// would leave it silently wearing the light tints.
//
// The three schemes reach the same goal by different means. Light uses flat
// tints of each `.main`, each checked at >= 4.5:1 against its `onContainer`.
// Dark uses translucent fills — the same trick `darkPalette.background
// .neutral` already plays — so one chip reads correctly whether it sits on
// `background.default`, on `background.paper` or on a raised card; opaque
// hexes would have to be retuned per surface. High contrast pairs plain
// white with plain black and leans on the 2px border its consumers draw,
// which is what separates the chip from the white ground behind it.
// ----------------------------------------------------------------------

export const grey = {
  0: '#FFFFFF',
  100: '#F9FAFB',
  200: '#F4F6F8',
  300: '#DFE3E8',
  400: '#C4CDD5',
  500: '#919EAB',
  600: '#637381',
  700: '#454F5B',
  800: '#212B36',
  900: '#161C24',
};

// Primary — Pattadar brand blue (tokens.brand, anchored at 600 = #1976D2).
export const primary = {
  lighter: brand[50],
  light: brand[300],
  main: brand[600],
  dark: brand[700],
  darker: brand[900],
  contrastText: '#FFFFFF',
};

// Secondary — Pattadar gold (tokens.gold; properties, wealth, premium).
export const secondary = {
  lighter: gold[100],
  light: gold[300],
  main: gold[600],
  dark: gold[700],
  darker: gold[900],
  contrastText: '#FFFFFF',
};

export const info = {
  lighter: '#CAFDF5',
  light: '#61F3F3',
  main: '#00B8D9',
  dark: '#006C9C',
  darker: '#003768',
  contrastText: '#FFFFFF',
};

export const success = {
  lighter: '#D3FCD2',
  light: '#77ED8B',
  main: '#22C55E',
  dark: '#118D57',
  darker: '#065E49',
  contrastText: '#ffffff',
};

export const warning = {
  lighter: '#FFF5CC',
  light: '#FFD666',
  main: '#FFAB00',
  dark: '#B76E00',
  darker: '#7A4100',
  contrastText: grey[800],
};

export const error = {
  lighter: '#FFE9D5',
  light: '#FFAC82',
  main: '#FF5630',
  dark: '#B71D18',
  darker: '#7A0916',
  contrastText: '#FFFFFF',
};

export const common = {
  black: '#000000',
  white: '#FFFFFF',
};

export const action = {
  hover: alpha(grey[500], 0.08),
  selected: alpha(grey[500], 0.16),
  disabled: alpha(grey[500], 0.8),
  disabledBackground: alpha(grey[500], 0.24),
  focus: alpha(grey[500], 0.24),
  hoverOpacity: 0.08,
  disabledOpacity: 0.48,
};

const base = {
  secondary,
  info,
  success,
  warning,
  error,
  grey,
  common,
  divider: alpha(grey[500], 0.2),
  action,
};

// ----------------------------------------------------------------------

export const lightPalette = {
  ...base,
  primary: {
    ...primary,
    // Seam: soft container fill for selected states / tonal surfaces.
    container: schemes.light.primaryContainer,
    onContainer: schemes.light.onPrimaryContainer,
  },
  secondary: {
    ...secondary,
    container: schemes.light.accentContainer,
    onContainer: schemes.light.onAccentContainer,
  },
  // Status containers — flat tints of each `.main`, paired with a text colour
  // that clears 4.5:1 on them. Re-spread here, never on `base` (see header).
  info: {
    ...info,
    container: '#D8ECFB',
    onContainer: '#0B3A5D',
  },
  success: {
    ...success,
    container: '#DCEFE0',
    onContainer: '#12401D',
  },
  warning: {
    ...warning,
    container: '#FDEBCF',
    onContainer: '#4A2F03',
  },
  error: {
    ...error,
    container: '#FBDDDC',
    onContainer: '#5A1512',
  },
  text: {
    primary: grey[800],
    secondary: grey[600],
    disabled: grey[500],
  },
  background: {
    paper: '#FFFFFF',
    default: '#FFFFFF',
    neutral: grey[200],
  },
  action: {
    ...action,
    active: grey[600],
  },
  // rgb channel the shadow builders reference via CSS variables so a single
  // shadows/customShadows definition adapts per color scheme.
  shadowChannel: '145 158 171', // grey[500]
};

export const darkPalette = {
  ...base,
  primary: {
    lighter: brand[50],
    light: brand[100],
    main: brand[200], // tokens dark scheme primary (#90caf9)
    dark: brand[400],
    darker: brand[700],
    contrastText: 'rgba(0, 0, 0, 0.87)',
    container: schemes.dark.primaryContainer,
    onContainer: schemes.dark.onPrimaryContainer,
  },
  secondary: {
    lighter: gold[50],
    light: gold[200],
    main: gold[300], // tokens dark scheme accent
    dark: gold[500],
    darker: gold[700],
    contrastText: 'rgba(0, 0, 0, 0.87)',
    container: schemes.dark.accentContainer,
    onContainer: schemes.dark.onAccentContainer,
  },
  // Status containers — translucent on purpose, the way `background.neutral`
  // below is, so one chip reads on paper, on default and over a card alike.
  info: {
    ...info,
    container: 'rgba(84,163,225,0.16)',
    onContainer: '#B9DCF7',
  },
  success: {
    ...success,
    container: 'rgba(84,214,124,0.16)',
    onContainer: '#BFE6C8',
  },
  warning: {
    ...warning,
    container: 'rgba(255,171,0,0.16)',
    onContainer: '#FFD98A',
  },
  error: {
    ...error,
    container: 'rgba(255,86,72,0.16)',
    onContainer: '#FFC0BA',
  },
  text: {
    primary: '#FFFFFF',
    secondary: grey[500],
    disabled: grey[600],
  },
  background: {
    paper: grey[800],
    default: grey[900],
    neutral: alpha(grey[500], 0.12),
  },
  action: {
    ...action,
    active: grey[500],
  },
  shadowChannel: '0 0 0', // common.black
};

// Light-derived low-vision palette. Keep the complete Minimals/Pattadar shape
// so every component can use the same semantic and custom palette tokens.
export const highContrastPalette = {
  ...base,
  primary: {
    lighter: '#D7E9F7',
    light: '#0A5C9E',
    main: '#003B73',
    dark: '#002B55',
    darker: '#001B36',
    contrastText: '#FFFFFF',
    container: '#D7E9F7',
    onContainer: '#000000',
  },
  secondary: {
    lighter: '#FFF1C2',
    light: '#9A6700',
    main: '#674600',
    dark: '#4A3200',
    darker: '#2E1F00',
    contrastText: '#FFFFFF',
    container: '#FFF1C2',
    onContainer: '#000000',
  },
  // Containers here carry no hue: tone is told by the 2px border the consumer
  // draws in this scheme, and a tinted fill would only dilute the contrast.
  info: {
    lighter: '#D7EEFF',
    light: '#0068B5',
    main: '#005A9C',
    dark: '#003F73',
    darker: '#002947',
    contrastText: '#FFFFFF',
    container: '#FFFFFF',
    onContainer: '#000000',
  },
  success: {
    lighter: '#D9F5E3',
    light: '#087A37',
    main: '#006B2D',
    dark: '#004D20',
    darker: '#003315',
    contrastText: '#FFFFFF',
    container: '#FFFFFF',
    onContainer: '#000000',
  },
  warning: {
    lighter: '#FFF1C2',
    light: '#A55B00',
    main: '#804600',
    dark: '#5C3200',
    darker: '#3D2100',
    contrastText: '#FFFFFF',
    container: '#FFFFFF',
    onContainer: '#000000',
  },
  error: {
    lighter: '#FFE0E3',
    light: '#C1122F',
    main: '#A5001D',
    dark: '#780015',
    darker: '#4D000D',
    contrastText: '#FFFFFF',
    container: '#FFFFFF',
    onContainer: '#000000',
  },
  text: {
    primary: '#000000',
    secondary: '#1A1A1A',
    disabled: '#4A4A4A',
  },
  background: {
    paper: '#FFFFFF',
    default: '#FFFFFF',
    // Not white. Table heads, the sticky-header band and every Skeleton fill
    // with `background.neutral`, and were invisible while it matched paper.
    neutral: '#EFEFEF',
  },
  divider: '#000000',
  action: {
    hover: 'rgba(0, 0, 0, 0.10)',
    selected: 'rgba(0, 59, 115, 0.18)',
    disabled: 'rgba(0, 0, 0, 0.55)',
    disabledBackground: 'rgba(0, 0, 0, 0.18)',
    focus: 'rgba(0, 59, 115, 0.30)',
    active: '#000000',
    hoverOpacity: 0.1,
    disabledOpacity: 0.55,
  },
  shadowChannel: '0 0 0',
};
