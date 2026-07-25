/**
 * @pattadar/tokens — design tokens for the Pattadar platform.
 *
 * PLACEHOLDER BRAND PALETTE — adjust once, here. Both the MUI theme
 * (apps/web) and the React Native Paper theme (apps/mobile) derive from
 * this file, so a change here propagates to both heads.
 *
 * Palette intent: professional and restrained, land/earth-inspired —
 * deep green primary, warm neutral surfaces, conventional semantic hues.
 */

// ---------------------------------------------------------------------------
// Primitive scales
// ---------------------------------------------------------------------------

/** Deep green primary ramp (50 = lightest, 900 = darkest). */
export const green = {
  50: '#f0f5f1',
  100: '#dbe8dd',
  200: '#b8d2bd',
  300: '#8fb798',
  400: '#639a71',
  500: '#3f7d51',
  600: '#2e6540',
  700: '#245234',
  800: '#1c4029',
  900: '#142f1f',
} as const;

/** Warm neutral ramp — surfaces, borders, text. */
export const neutral = {
  0: '#ffffff',
  50: '#faf9f7',
  100: '#f3f1ed',
  200: '#e7e3dc',
  300: '#d5cfc5',
  400: '#b0a89b',
  500: '#8a8174',
  600: '#665f54',
  700: '#4a443b',
  800: '#322d26',
  900: '#1e1b16',
  1000: '#121009',
} as const;

/** Semantic accent hues (single anchor value each; tints derived in themes). */
export const semantic = {
  success: '#2e7d32',
  warning: '#b3730d',
  error: '#b3261e',
  info: '#1e5f8a',
} as const;

// ---------------------------------------------------------------------------
// Colour schemes (light / dark)
// ---------------------------------------------------------------------------

export interface ColorScheme {
  /** Primary brand colour and its interaction states. */
  primary: string;
  primaryHover: string;
  primaryActive: string;
  onPrimary: string;
  /** Page and surface backgrounds. */
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  /** Text. */
  textPrimary: string;
  textSecondary: string;
  textDisabled: string;
  /** Semantic. */
  success: string;
  warning: string;
  error: string;
  info: string;
}

export const light: ColorScheme = {
  primary: green[600],
  primaryHover: green[700],
  primaryActive: green[800],
  onPrimary: neutral[0],
  background: neutral[50],
  surface: neutral[0],
  surfaceRaised: neutral[0],
  border: neutral[200],
  textPrimary: neutral[900],
  textSecondary: neutral[600],
  textDisabled: neutral[400],
  success: semantic.success,
  warning: semantic.warning,
  error: semantic.error,
  info: semantic.info,
};

export const dark: ColorScheme = {
  primary: green[400],
  primaryHover: green[300],
  primaryActive: green[200],
  onPrimary: neutral[1000],
  background: neutral[1000],
  surface: neutral[900],
  surfaceRaised: neutral[800],
  border: neutral[700],
  textPrimary: neutral[100],
  textSecondary: neutral[400],
  textDisabled: neutral[600],
  success: '#66bb6a',
  warning: '#e0a63f',
  error: '#e57373',
  info: '#64a6d4',
};

export const schemes = { light, dark } as const;
export type SchemeName = keyof typeof schemes;

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

export const typography = {
  /** System-first stack; swap in a brand face later without touching themes. */
  fontFamily:
    "'Inter', -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontFamilyMono:
    "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  size: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22,
    xxl: 28,
    display: 36,
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.7,
  },
} as const;

// ---------------------------------------------------------------------------
// Spacing, radii, elevation
// ---------------------------------------------------------------------------

/** 4px base grid. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 4,
  md: 8,
  lg: 12,
  pill: 999,
} as const;

/**
 * Elevation as CSS box-shadows (web). Mobile maps the same keys to
 * Paper/RN elevation levels (0 / 1 / 3 / 6).
 */
export const elevation = {
  none: 'none',
  low: '0 1px 2px rgba(30, 27, 22, 0.08)',
  medium: '0 2px 8px rgba(30, 27, 22, 0.12)',
  high: '0 8px 24px rgba(30, 27, 22, 0.16)',
} as const;

export const tokens = {
  green,
  neutral,
  semantic,
  schemes,
  typography,
  spacing,
  radii,
  elevation,
} as const;

export type Tokens = typeof tokens;
