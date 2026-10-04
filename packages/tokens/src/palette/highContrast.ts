/**
 * High Contrast — the low-vision reading mode (design.md § High Contrast
 * scheme). Deliberately light-based rather than a more saturated brand skin:
 * white reading surfaces, black text and rules, a dark-blue action colour, and
 * a focus ring that grows to a two-tone 3px ring.
 *
 * The semantic slots follow design.md's table. W360 used to draw several of
 * them darker (danger #780000, ok #005a20, warn #6b3d00, info #004f6e,
 * secondary text #171717) and its own blue focus ring (#005fcc); one scheme
 * now serves both, in design.md's values.
 */
import { bloomLight } from './bloom';
import { pageChrome, type SchemePalette } from './roles';

const INK = {
  ground: '#ffffff',
  surface: '#ffffff',
  ink: '#000000', // 21:1
  ink3: '#292929', // 14.55:1
  accent: '#003b73', // dark blue · 11.21:1
  line: '#000000',
  // The ring is black with a white halo outside it, so it reads on white
  // paper, on a dark-blue button and over imagery alike.
  focus: '#000000',
  raised: '#f2f2f2',
  lineStrong: '#000000',
  ink2: '#1f1f1f', // 16.48:1

  onAccent: '#ffffff',
  accentWash: '#d9ecff',
  onAccentWash: '#001c38',
};

export const highContrast: SchemePalette = {
  ...INK,

  secondary: '#5a1a78', // plum · 11.33:1
  onSecondary: '#ffffff',
  secondaryWash: '#f4ddff',
  onSecondaryWash: '#2c003e',

  danger: '#a40000', // 8.14:1
  onDanger: '#ffffff',
  dangerWash: '#ffe0e0',
  ok: '#006b3c', // 6.63:1
  onOk: '#ffffff',
  warn: '#6b4f00', // 7.65:1
  onWarn: '#ffffff',
  info: '#004f6b', // 9.01:1
  onInfo: '#ffffff',

  focusHalo: '#ffffff',

  chrome: pageChrome(INK),
  // Charts and status hues in High Contrast are the Light ones, as they were
  // when the chart hooks mapped High Contrast to Light.
  chart: bloomLight.chart,
  status: bloomLight.status,
};
