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
// Exported as two full palettes (light/dark) for the MUI 9
// `colorSchemes` CSS-variables API.
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
