/**
 * @pattadar/tokens — Pattadar's design tokens.
 *
 * The colour schemes live in ./palette: role-based palettes (Bloom Light,
 * Bloom Dark, High Contrast), the registry that names them and picks each
 * app's default, and the contrast gate scripts/palette-tests.ts runs over
 * every one of them. design.md § Theme describes the schemes. ./mui turns
 * them into MUI colour schemes; apps/web's theme.ts is built with it.
 *
 * Beside them: the one font stack, the 4px spacing grid, radii and motion.
 * apps/mobile reads spacing and radii; its theme and University's move onto
 * the palette in the steps listed in docs/specs/TODO-one-platform.md.
 *
 * Chart series and status hues are per scheme (`palette.chart`,
 * `palette.status`); apps/web's chart hooks read the active scheme's.
 */
export * from './palette';
export * from './mui';

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

/**
 * The one face (design.md § Typography): the same stack as `--font-sans` in
 * apps/web/src/styles/tokens.css and apps/university/tokens.css —
 * scripts/typography-tests.ts fails when the copies differ. apps/web's MUI
 * theme imports it from here. apps/web and apps/university self-host the face
 * through @fontsource/atkinson-hyperlegible. Expo (system face + Menlo) and
 * iOS (SF + New York) keep their own type until docs/specs/TODO-one-platform.md
 * is done. There is no mono token.
 */
export const FONT_SANS = '"Atkinson Hyperlegible", system-ui, sans-serif';

export const typography = {
  fontFamily: FONT_SANS,
} as const;

// ---------------------------------------------------------------------------
// Spacing, radii, motion
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

export const tokens = {
  typography,
  spacing,
  radii,
  motion,
} as const;

export type Tokens = typeof tokens;
