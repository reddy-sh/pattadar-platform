/**
 * Bloom — Pattadar's own palette (design.md § Theme): warm paper, one amber
 * action colour, typography-led.
 *
 * Dark is the canonical scheme. Each value notes the oklch it was converted
 * from (it used to live in apps/web/src/styles/tokens.css); the conversions
 * match design.md's "≈" values exactly. Three of them sit outside sRGB —
 * the focus amber, the danger red and the first bloom — and are clipped to
 * the hex an sRGB screen already showed.
 *
 * Light is the warm-tinted derivation design.md § Light scheme describes.
 *
 * Ratios in the comments are WCAG contrast on this scheme's own ground unless
 * they say otherwise; scripts/palette-tests.ts measures every one of them.
 */
import { pageChrome, type SchemePalette } from './roles';

const DARK_INK = {
  ground: '#0d0504', // oklch(13% 0.018 35)
  surface: '#170c09', // oklch(17% 0.020 35)
  ink: '#f3ede7', // oklch(95% 0.010 70) · 17.37:1
  // oklch(61% 0.015 50) · 5.31:1, 5.05:1 on surface and 4.57:1 on raised,
  // where pills, table heads and tiles draw it. It was oklch(58.5%), #847974,
  // 4.11:1 on raised; before that oklch(58%), #827873, 4.46:1 on cards
  // (TODO-one-platform #17).
  ink3: '#8b817b',
  accent: '#fe860f', // oklch(74% 0.180 55) · 8.29:1
  line: '#312622', // oklch(28% 0.018 40)
  focus: '#ffa03c', // oklch(82% 0.180 55), clipped to sRGB · 9.94:1
  raised: '#241714', // oklch(22% 0.022 35)
  lineStrong: '#54433e', // oklch(40% 0.025 40)
  ink2: '#bfb5ae', // oklch(78% 0.015 60)

  onAccent: '#180600', // oklch(15% 0.040 50) · 8.11:1 on accent
  accentWash: 'rgba(254, 134, 15, 0.14)',
  onAccentWash: '#fe860f',
};

export const bloomDark: SchemePalette = {
  ...DARK_INK,

  // Coral lightened to oklch(80% 0.110 35) · 10.41:1, so it is told from
  // danger by lightness (1.63:1) and not by hue alone. It was oklch(68% 0.220
  // 18), #ff4a63, 1.04:1 against the red: a coral chip read as an error.
  secondary: '#fca48d',
  onSecondary: '#180600', // 10.17:1
  secondaryWash: 'rgba(252, 164, 141, 0.14)',
  onSecondaryWash: '#fca48d', // 8.43:1 on the wash

  danger: '#ff5453', // oklch(70% 0.220 25), clipped to sRGB
  // Dark text on the red, as every other Dark fill carries: 6.24:1. It was
  // white, what MUI derives for this red, 3.16:1 — large bold text only.
  onDanger: '#180600',
  dangerWash: 'rgba(255, 84, 83, 0.12)',
  ok: '#61c568', // oklch(74% 0.160 145)
  onOk: 'rgba(0, 0, 0, 0.87)', // MUI's derived contrast text, kept as it renders
  // Gold, held off the action amber's hue so "needs attention" never reads as
  // "do this". W360 drew oklch(80% 0.140 75) ≈ #f2af48 here; design.md's
  // value wins.
  warn: '#f5ae39',
  onWarn: '#180600',
  info: '#82bad5', // muted slate, oklch(76% 0.070 230) — the one cool seam
  onInfo: '#180600',

  focusHalo: DARK_INK.ground,

  chrome: pageChrome(DARK_INK),
  // Re-derived on the Bloom hue family 2026-08-14 and validated on surface:
  // 7.90 8.67 4.43 11.47 5.78 7.83. Slots 1 and 3 are the two warm hues and
  // are separated by lightness (1.78:1; 1.69:1 under simulated deuteranopia).
  chart: ['#fe860f', '#3ebfc6', '#da4053', '#8cda8f', '#ba71cb', '#80aace'],
  status: {
    good: '#61c568', // 9.32:1
    warning: '#f5ae39', // 10.57:1
    serious: '#fd6844', // 6.96:1
    critical: '#ff5453', // 6.39:1
  },
  // The marketing surface's ambient blooms. bloom1 is oklch(74% 0.220 50),
  // clipped to sRGB.
  decor: {
    accentSoft: '#c9a187', // oklch(74% 0.060 55)
    bloom1: '#ff7400',
    bloom2: '#e52754', // oklch(60% 0.220 15)
  },
};

const LIGHT_INK = {
  ground: '#f9f6f2', // oklch(97.5% 0.006 70)
  surface: '#fdfcf9',
  ink: '#261d1a', // 15.31:1
  // oklch(52.9% 0.015 48) · 4.96:1, 5.20:1 on surface and 4.55:1 on raised.
  // It was oklch(54.9%), #796f6a, 4.17:1 on raised; before that #7d736e,
  // under 4.5:1 on both papers, the same muted-ink defect as Dark's
  // (TODO-one-platform #17).
  ink3: '#736964',
  // The amber darkened to oklch(55% 0.13 55) so white text clears 4.5:1
  // (5.07:1 on white, 4.70:1 on ground).
  accent: '#aa5910',
  line: '#e3ddd8',
  // oklch(62% 0.15 55): lighter than the action amber, as Dark's focus is,
  // and 3.54:1 on ground. Light used to inherit Dark's #ffa03c, which is
  // 1.88:1 on this paper — a ring nobody could see.
  focus: '#c9690c',
  raised: '#f2ece5',
  lineStrong: '#cbc2ba',
  ink2: '#615956', // 6.35:1

  // White, as design.md says. W360 drew #fffaf4.
  onAccent: '#ffffff',
  // 14% of this scheme's own amber. W360's Light wash used to be mixed from
  // the Dark amber, and MUI's container was 8%.
  accentWash: 'rgba(170, 89, 16, 0.14)',
  onAccentWash: '#8c4a11',
};

export const bloomLight: SchemePalette = {
  ...LIGHT_INK,

  // Coral deepened to oklch(38% 0.120 15) · 9.84:1, so it is told from
  // danger by lightness (1.74:1). It was #b23645, 1.02:1 against the red.
  secondary: '#751e2d',
  onSecondary: '#ffffff', // 10.61:1
  secondaryWash: 'rgba(117, 30, 45, 0.14)',
  onSecondaryWash: '#751e2d', // 7.67:1 on the wash

  danger: '#be222a', // 5.65:1
  onDanger: '#ffffff',
  // 12% of this scheme's own red; it used to be mixed from the Dark red.
  dangerWash: 'rgba(190, 34, 42, 0.12)',
  ok: '#27762f', // 5.24:1
  onOk: '#ffffff',
  // Bronze, oklch(44% 0.090 70) · 7.36:1, held off the action amber by
  // lightness (1.57:1) as well as hue. It was #905d00, 1.11:1 against the
  // amber, so "needs attention" read as "do this".
  warn: '#72480b',
  onWarn: '#ffffff',
  info: '#3d6a7f', // muted slate · 5.47:1
  onInfo: '#ffffff',

  focusHalo: LIGHT_INK.ground,

  chrome: pageChrome(LIGHT_INK),
  // Validated on surface: 4.37 6.04 8.23 3.64 7.50 5.57. Slot 4 is
  // oklch(60% 0.13 140): it was #387d3d, the status green's twin (1.12:1
  // against #27762f), and is now 1.51:1 apart from it.
  chart: ['#b3621e', '#006c72', '#97182f', '#539344', '#793887', '#426a8c'],
  status: {
    good: '#27762f', // 5.24:1 · 5.65:1 with white
    warning: '#72480b', // 7.36:1 · 7.93:1 with white
    serious: '#a82700', // 6.60:1 · 7.11:1 with white
    critical: '#be222a', // 5.65:1 · 6.08:1 with white
  },
};
