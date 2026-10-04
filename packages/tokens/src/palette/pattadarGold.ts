/**
 * Pattadar Gold — the signature light scheme: ivory cards on a cool grey-green
 * page, charcoal-green ink, one bronze-gold action colour, and a charcoal
 * header with a gold rule under it.
 *
 * Its anchors are the Pattadar Gold sample of the appearance study
 * (apps/web/src/pages/landing/ThemeSamplesPage.tsx, retired on 03/10/2026 when
 * this scheme replaced it): the page #eceeeb, the ivory #fffefa, the ink
 * #222923, the muted #536058, the action #75510b with white text, the selected
 * wash #f8edcf, and the header's #202521 with #d9bf72 and #d4b663 for its gold
 * dot and rule. Everything else is derived here and measured by
 * scripts/palette-tests.ts like every other scheme.
 *
 * Warning is held off the gold hue (rust, oklch hue 55, against the action's
 * 77) so "needs attention" never reads as "do this". Ratios are WCAG contrast
 * on this scheme's ground unless they say otherwise.
 */
import { bloomLight } from './bloom';
import type { SchemePalette } from './roles';

export const pattadarGold: SchemePalette = {
  ground: '#eceeeb', // cool grey-green paper, oklch(94.7% 0.005 135)
  surface: '#fffefa', // ivory, oklch(99.7% 0.005 95)
  raised: '#f3f4f0',
  line: '#c5cbc2',
  lineStrong: '#a9b1a6',

  ink: '#222923', // charcoal green, oklch(27.2% 0.015 149) · 12.77:1
  ink2: '#3f4a42', // 7.93:1
  ink3: '#536058', // 5.66:1, 6.54:1 on surface

  accent: '#75510b', // bronze gold, oklch(46.3% 0.092 77) · 6.12:1
  onAccent: '#ffffff', // 7.15:1 on the accent
  accentWash: '#f8edcf', // the selected fill
  onAccentWash: '#5d4009', // 8.17:1 on the wash (the accent itself is 6.13:1)

  secondary: '#2e5e4e', // deep green, oklch(44.3% 0.059 170) · 6.37:1
  onSecondary: '#ffffff',
  secondaryWash: '#dfeae4',
  onSecondaryWash: '#1f4637',

  danger: '#b3261e', // oklch(50.1% 0.178 29) · 5.60:1
  onDanger: '#ffffff',
  dangerWash: 'rgba(179, 38, 30, 0.12)',
  ok: '#22693a', // 5.71:1
  onOk: '#ffffff',
  warn: '#9a4d00', // rust, oklch(50.6% 0.126 55) · 5.24:1 — off the gold hue
  onWarn: '#ffffff',
  info: '#2f6474', // slate teal, the one cool seam · 5.63:1
  onInfo: '#ffffff',

  // oklch(58.8% 0.115 80): lighter than the action, as Bloom's rings are.
  // 3.60:1 on the page and 4.16:1 on ivory.
  focus: '#a07415',
  focusHalo: '#eceeeb',

  // The charcoal header. Every pair is measured on its own background.
  chrome: {
    bg: '#202521',
    surface: '#2b312c', // the jump-to search · ink 12.70:1
    raised: '#343b34', // a hovered button, the avatar
    ink: '#fafaf4', // 14.87:1
    ink2: '#d7d9cd', // icon buttons · 10.90:1
    inkMuted: '#b9bdb1', // placeholder and glyphs · 8.14:1, 6.95:1 on the search
    accent: '#d9bf72', // the wordmark's gold dot · 8.64:1
    onAccent: '#202521', // the notification count on gold · 8.64:1
    accentWash: 'rgba(217, 191, 114, 0.18)',
    onAccentWash: '#e8d391', // 7.00:1 on the wash
    line: '#73796d',
    lineStrong: '#8e9488',
    rule: '#d4b663', // the gold rule under the header
    ruleWidth: '2px',
    focus: '#d9bf72', // 8.64:1
  },

  // Light's validated series, on near-identical paper: 4.44 6.14 8.37 4.99
  // 7.63 5.67 on ivory. Status is this scheme's own good, warning and
  // critical, with a serious step between (6.56:1 on ivory).
  chart: bloomLight.chart,
  status: {
    good: '#22693a',
    warning: '#9a4d00',
    serious: '#a33a12',
    critical: '#b3261e',
  },
};
