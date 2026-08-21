/**
 * @pattadar/tokens — design tokens for the Pattadar platform.
 *
 * INDUSTRY-STANDARD NEUTRAL PALETTE (2026-07-26, founder decision: the
 * Emerald & Gold green theme is removed). Both the MUI theme (apps/web) and
 * the React Native Paper theme (apps/mobile) derive from this file, so a
 * change here propagates to both heads.
 *
 * Palette intent: Material-standard blue as the primary hue; gold/amber
 * (property, wealth, premium) stays as the second hue. Plain neutral
 * surfaces in light mode, standard #121212 stack in dark mode. Orange is
 * RESERVED for warnings — the properties domain wears amber-gold, never orange.
 */

// ---------------------------------------------------------------------------
// Primitive scales
// ---------------------------------------------------------------------------

/** Primary brand ramp — Material-standard blue, anchored at 600 = #1976D2. */
export const brand = {
  50: '#e3f2fd',
  100: '#bbdefb',
  200: '#90caf9',
  300: '#64b5f6',
  400: '#42a5f5',
  500: '#1e88e5',
  600: '#1976d2',
  700: '#1565c0',
  800: '#0d47a1',
  900: '#0a3576',
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

/** Neutral grey ramp — light-mode surfaces, borders, text. */
export const neutral = {
  0: '#ffffff',
  50: '#f7f8fa',
  100: '#f1f3f5',
  200: '#e4e7eb',
  300: '#d1d6db',
  400: '#9aa2ab',
  500: '#6b7480',
  600: '#4f5760',
  700: '#3a4046',
  800: '#26292e',
  900: '#17191c',
  1000: '#0e0f11',
} as const;

/** Standard dark-mode ramp — Material #121212 stack. */
export const charcoal = {
  background: '#121212',
  surface: '#1e1e1e',
  surfaceRaised: '#262626',
  border: '#33363a',
  borderStrong: '#4a4e54',
} as const;

/**
 * Status hues (good / warning / serious / critical) — reserved meanings,
 * always shipped with an icon + label, never reused as chart series.
 *
 * `good` / `warning` / `critical` are the SAME values as MUI's
 * success / warning / error in apps/web/src/theme.ts (design.md § Theme).
 * They were separate values before, so a chart's "good" green and a chip's
 * success green disagreed on the same screen. `serious` is the one hue with
 * no MUI counterpart — the step between warning and critical.
 * All ratios measured on Bloom paper (#0d0504 dark / #f9f6f2 light).
 */
export const status = {
  light: {
    good: '#27762f', // 5.24:1 on paper · 5.65:1 w/ white
    warning: '#905d00', // 5.20:1 · 5.60:1 w/ white
    serious: '#a82700', // 6.60:1 · 7.11:1 w/ white
    critical: '#be222a', // 5.65:1 · 6.08:1 w/ white
  },
  dark: {
    good: '#61c568', // 9.32:1 on paper
    warning: '#f5ae39', // 10.57:1
    serious: '#fd6844', // 6.96:1
    critical: '#ff5453', // 6.39:1
  },
} as const;

/** Back-compat semantic aliases (single anchor value each). */
export const semantic = {
  success: status.light.good,
  warning: status.light.warning,
  error: status.light.critical,
  info: '#3d6a7f', // Bloom light info — the one cool seam
} as const;

// ---------------------------------------------------------------------------
// Chart palette — re-derived on the Bloom hue family 2026-08-14 (design.md).
// Fixed slot order (follows the entity, never cycled):
//   1 amber(brand) · 2 teal · 3 coral · 4 green · 5 plum · 6 slate
//
// The previous ramp led with #1976D2 and was validated against a NEUTRAL grey
// surface (#121212). Bloom's dark paper is warm near-black (#0d0504 / #170c09),
// so both the hue family and the validation surface were wrong: cold series on
// warm paper, against a contrast baseline that no longer existed.
//
// VALIDATED (measured, this palette, these surfaces):
//   · every slot ≥ 3:1 against its own surface —
//     dark  7.90 8.67 4.43 11.47 5.78 7.83  on #170c09
//     light 4.37 6.04 8.23  4.91 7.50 5.57  on #fdfcf9
//   · slots 1 and 3 are the two warm hues and so the colour-blindness risk;
//     they are separated by LIGHTNESS, not hue alone — 1.78:1 normal vision,
//     1.69:1 under simulated deuteranopia (Viénot projection).
//
// NOT RE-RUN: the full dataviz six-checks adjacent-ΔE sweep across all 15
// pairs. Contrast and the warm-pair CVD case are measured above; the complete
// sweep should be re-run before this palette carries a dense multi-series view.
// ---------------------------------------------------------------------------

export const chartCategorical = {
  light: ['#b3621e', '#006c72', '#97182f', '#387d3d', '#793887', '#426a8c'],
  dark: ['#fe860f', '#3ebfc6', '#da4053', '#8cda8f', '#ba71cb', '#80aace'],
} as const;

/** Chart surfaces the palettes were validated against (Bloom paper / paper-2). */
export const chartSurface = { light: '#fdfcf9', dark: '#170c09' } as const;

// ---------------------------------------------------------------------------
// Colour schemes (light / dark)
// ---------------------------------------------------------------------------

export interface ColorScheme {
  /** Primary brand colour and its interaction states. */
  primary: string;
  primaryHover: string;
  primaryActive: string;
  onPrimary: string;
  /** Soft primary container (selected nav pill, subtle fills). */
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
  primary: brand[600],
  primaryHover: brand[700],
  primaryActive: brand[800],
  onPrimary: neutral[0],
  primaryContainer: brand[50],
  onPrimaryContainer: brand[800],
  accent: gold[600],
  accentContainer: gold[100],
  onAccentContainer: gold[800],
  background: neutral[50],
  surface: neutral[0],
  surfaceRaised: neutral[0],
  border: neutral[200],
  // Standard neutral ink hierarchy.
  textPrimary: '#1c1e21',
  textSecondary: '#5f6368',
  textDisabled: '#9aa0a6',
  success: status.light.good,
  warning: status.light.warning,
  error: status.light.critical,
  info: '#0288d1',
};

export const dark: ColorScheme = {
  primary: brand[200],
  primaryHover: brand[100],
  primaryActive: brand[50],
  onPrimary: 'rgba(0, 0, 0, 0.87)',
  primaryContainer: 'rgba(144, 202, 249, 0.16)',
  onPrimaryContainer: brand[100],
  accent: gold[300],
  accentContainer: 'rgba(240, 194, 75, 0.14)',
  onAccentContainer: gold[200],
  background: charcoal.background,
  surface: charcoal.surface,
  surfaceRaised: charcoal.surfaceRaised,
  border: charcoal.border,
  // Standard neutral ink hierarchy over #121212.
  textPrimary: '#e8eaed',
  textSecondary: '#9aa0a6',
  textDisabled: '#5f6368',
  success: status.dark.good,
  warning: status.dark.warning,
  error: status.dark.critical,
  info: '#4fc3f7',
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
    sky: {
      surface: 'rgba(240, 246, 253, 0.62)',
      surfaceFallback: '#eef5fc',
      borderStops: ['rgba(25,118,210,0.55)', 'rgba(144,202,249,0.25)', 'rgba(13,71,161,0.5)'],
      sheen: 'rgba(144, 202, 249, 0.28)',
      shadow: '0 8px 28px rgba(13, 71, 161, 0.14)',
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
    sky: {
      surface: 'rgba(24, 32, 41, 0.55)',
      surfaceFallback: '#172029',
      borderStops: ['rgba(100,181,246,0.5)', 'rgba(100,181,246,0.12)', 'rgba(30,136,229,0.4)'],
      sheen: 'rgba(100, 181, 246, 0.15)',
      shadow: '0 10px 32px rgba(0, 0, 0, 0.45)',
    },
  },
} as const;

export type GlassToneName = keyof typeof glass.light;

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

export const typography = {
  /**
   * Roboto — the MUI default font, SELF-HOSTED (apps/web imports
   * @fontsource/roboto — the founder rule: nothing loads from third-party
   * URLs).
   */
  fontFamily: "'Roboto', 'Helvetica', 'Arial', sans-serif",
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
  /** Dialogs / hero surfaces (M3 extra-large). */
  xxl: 20,
  pill: 999,
} as const;

/**
 * Motion — M3 standard/emphasized durations on the emphasized-decelerate
 * curve. Respect `prefers-reduced-motion` at the consumer.
 */
export const motion = {
  duration: { standard: 200, emphasized: 250 },
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
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
  brand,
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
  motion,
  elevation,
} as const;

export type Tokens = typeof tokens;
