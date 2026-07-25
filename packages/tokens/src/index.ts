/**
 * @pattadar/tokens — design tokens for the Pattadar platform.
 *
 * "EMERALD & GOLD" BRAND PALETTE. Both the MUI theme (apps/web) and the
 * React Native Paper theme (apps/mobile) derive from this file, so a change
 * here propagates to both heads.
 *
 * Palette intent: deep emerald green (land, fertility, trust) as the primary
 * hue; gold/amber (property, wealth, premium) as the second hue. Warm ivory
 * surfaces in light mode, green-tinted charcoal in dark mode. Orange is
 * RESERVED for warnings — the properties domain wears amber-gold, never orange.
 */

// ---------------------------------------------------------------------------
// Primitive scales
// ---------------------------------------------------------------------------

/** Deep emerald primary ramp, anchored at 600 = #146C43 (50 = lightest). */
export const green = {
  50: '#edf7f1',
  100: '#d6ecdf',
  200: '#acdac0',
  300: '#7cc29d',
  400: '#4ea678',
  500: '#26875a',
  600: '#146c43',
  700: '#0f5735',
  800: '#0c4429',
  900: '#08321e',
} as const;

/** Gold/amber second ramp — properties, wealth, premium accents. */
export const gold = {
  50: '#fbf6e7',
  100: '#f5e8c4',
  200: '#efd68f',
  300: '#f0c24b',
  400: '#d9a833',
  500: '#c9a227',
  600: '#b8860b',
  700: '#96700e',
  800: '#75570d',
  900: '#54400c',
} as const;

/** Warm ivory/stone neutral ramp — light-mode surfaces, borders, text. */
export const neutral = {
  0: '#ffffff',
  50: '#f4f8f4', // green-tinted ivory — the founder wants green FELT, not accented
  100: '#e9f1e9',
  200: '#dbe7da',
  300: '#d2cec0',
  400: '#ada894',
  500: '#878271',
  600: '#635f52',
  700: '#47443a',
  800: '#2e2c25',
  900: '#1c1b16',
  1000: '#121009',
} as const;

/** Green-tinted charcoal ramp — dark-mode backgrounds and surfaces. */
export const charcoal = {
  background: '#0f2318', // deep emerald-charcoal — unmistakably green, never black
  surface: '#153024',
  surfaceRaised: '#1b3d2d',
  border: '#2b4a39',
  borderStrong: '#3d6450',
} as const;

/**
 * Status hues (good / warning / serious / critical) — reserved meanings,
 * always shipped with an icon + label, never reused as chart series.
 * Orange lives HERE (warning), nowhere else.
 */
export const status = {
  light: {
    good: '#2e7d32',
    warning: '#b45309',
    serious: '#c43e1c',
    critical: '#a61b1b',
  },
  dark: {
    good: '#6fcf97',
    warning: '#e8a13d',
    serious: '#e8714a',
    critical: '#ef6a6a',
  },
} as const;

/** Back-compat semantic aliases (single anchor value each). */
export const semantic = {
  success: status.light.good,
  warning: status.light.warning,
  error: status.light.critical,
  info: '#0083a0',
} as const;

// ---------------------------------------------------------------------------
// Chart palette — validated with the dataviz six-checks validator.
// Fixed slot order (follows the entity, never cycled):
//   1 emerald · 2 gold · 3 teal · 4 terracotta · 5 plum · 6 slate
// Light validated on #FAF9F6, dark on #121713 — ALL CHECKS PASS both modes
// (worst adjacent CVD ΔE 13.8 light / 9.8 dark; normal-vision 22.0 / 16.3).
// ---------------------------------------------------------------------------

export const chartCategorical = {
  light: ['#146C43', '#B8860B', '#0083A0', '#C96040', '#83368F', '#5E8DC9'],
  dark: ['#45A97C', '#A6790F', '#0097B2', '#C86A4E', '#8F4EA8', '#5F8DD1'],
} as const;

/** Chart surfaces the palettes were validated against. */
export const chartSurface = { light: '#faf9f6', dark: '#121713' } as const;

// ---------------------------------------------------------------------------
// Colour schemes (light / dark)
// ---------------------------------------------------------------------------

export interface ColorScheme {
  /** Primary brand colour and its interaction states. */
  primary: string;
  primaryHover: string;
  primaryActive: string;
  onPrimary: string;
  /** Soft emerald container (selected nav pill, subtle fills). */
  primaryContainer: string;
  onPrimaryContainer: string;
  /** Gold accent (properties, wealth, premium). */
  accent: string;
  accentContainer: string;
  onAccentContainer: string;
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
  primaryContainer: green[100],
  onPrimaryContainer: green[800],
  accent: gold[600],
  accentContainer: gold[100],
  onAccentContainer: gold[800],
  background: neutral[50],
  surface: neutral[0],
  surfaceRaised: neutral[0],
  border: neutral[200],
  textPrimary: neutral[900],
  textSecondary: neutral[600],
  textDisabled: neutral[400],
  success: status.light.good,
  warning: status.light.warning,
  error: status.light.critical,
  info: '#0083a0',
};

export const dark: ColorScheme = {
  primary: green[400],
  primaryHover: green[300],
  primaryActive: green[200],
  onPrimary: charcoal.background,
  primaryContainer: 'rgba(78, 166, 120, 0.16)',
  onPrimaryContainer: green[300],
  accent: gold[300],
  accentContainer: 'rgba(240, 194, 75, 0.14)',
  onAccentContainer: gold[200],
  background: charcoal.background,
  surface: charcoal.surface,
  surfaceRaised: charcoal.surfaceRaised,
  border: charcoal.border,
  textPrimary: '#e9ece9',
  textSecondary: '#a3aca5',
  textDisabled: '#5f6a62',
  success: status.dark.good,
  warning: status.dark.warning,
  error: status.dark.critical,
  info: '#4fb3c9',
};

export const schemes = { light, dark } as const;
export type SchemeName = keyof typeof schemes;

// ---------------------------------------------------------------------------
// Gold-glass treatment — the "gold glassy, shiny" surface used SPARINGLY
// (portfolio hero, wallet balance, key stat tiles). Everything else stays
// clean matte. Consumed by apps/web <GlassCard>.
// ---------------------------------------------------------------------------

export interface GlassTone {
  /** Translucent surface fill (over blur). */
  surface: string;
  /** Opaque-ish fallback when backdrop-filter is unsupported. */
  surfaceFallback: string;
  /** 1px gradient border stops (border-box gradient trick). */
  borderStops: [string, string, string];
  /** Radial sheen highlight colour. */
  sheen: string;
  shadow: string;
}

export const glass = {
  light: {
    gold: {
      surface: 'rgba(255, 250, 236, 0.62)',
      surfaceFallback: '#fdf8ea',
      borderStops: ['rgba(201,162,39,0.75)', 'rgba(240,194,75,0.28)', 'rgba(184,134,11,0.65)'],
      sheen: 'rgba(240, 194, 75, 0.30)',
      shadow: '0 8px 28px rgba(117, 87, 13, 0.16)',
    },
    emerald: {
      surface: 'rgba(240, 250, 244, 0.62)',
      surfaceFallback: '#eef8f2',
      borderStops: ['rgba(20,108,67,0.55)', 'rgba(124,194,157,0.25)', 'rgba(15,87,53,0.5)'],
      sheen: 'rgba(124, 194, 157, 0.28)',
      shadow: '0 8px 28px rgba(12, 68, 41, 0.14)',
    },
  },
  dark: {
    gold: {
      surface: 'rgba(46, 42, 28, 0.55)',
      surfaceFallback: '#26231a',
      borderStops: ['rgba(240,194,75,0.55)', 'rgba(240,194,75,0.12)', 'rgba(201,162,39,0.45)'],
      sheen: 'rgba(240, 194, 75, 0.16)',
      shadow: '0 10px 32px rgba(0, 0, 0, 0.45)',
    },
    emerald: {
      surface: 'rgba(24, 40, 31, 0.55)',
      surfaceFallback: '#17251d',
      borderStops: ['rgba(78,166,120,0.5)', 'rgba(78,166,120,0.12)', 'rgba(38,135,90,0.4)'],
      sheen: 'rgba(78, 166, 120, 0.15)',
      shadow: '0 10px 32px rgba(0, 0, 0, 0.45)',
    },
  },
} as const;

export type GlassToneName = keyof typeof glass.light;

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
  xl: 16,
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
  gold,
  neutral,
  charcoal,
  semantic,
  status,
  chartCategorical,
  chartSurface,
  glass,
  schemes,
  typography,
  spacing,
  radii,
  elevation,
} as const;

export type Tokens = typeof tokens;
