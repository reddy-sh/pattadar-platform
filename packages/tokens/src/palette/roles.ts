/**
 * The roles every colour scheme defines.
 *
 * A scheme names colours by what they do (the page ground, the ink on it, the
 * one action colour), never by hue, so a palette can be replaced without any
 * screen knowing. design.md § Theme describes the schemes; this file is the
 * contract they all satisfy, and scripts/palette-tests.ts checks every
 * registered scheme against it and against the contrast rules in gate.ts.
 *
 * Values are sRGB: hex (`#rgb`, `#rrggbb`, `#rrggbbaa`) or `rgb()` / `rgba()`.
 * MUI derives hover, light and dark variants by channel maths, which needs a
 * parseable sRGB value, so oklch sources are converted once and noted beside
 * each value.
 */

/** A colour in sRGB: hex, or `rgb()` / `rgba()`. */
export type Colour = string;

/** The light/dark base MUI and the platforms build a scheme on. */
export type SchemeMode = 'light' | 'dark';

/** The top bar's own colours. Bloom and High Contrast draw the header in
 *  their page colours (`pageChrome`); a scheme with a coloured header —
 *  Pattadar Gold's charcoal — sets these apart. Every role a header control
 *  reads is here, so nothing in the bar falls back to a page colour drawn on
 *  the wrong background. */
export interface ChromeRoles {
  /** Header background. */
  bg: Colour;
  /** A field or pill sitting in the header (the jump-to search). */
  surface: Colour;
  /** A control's fill in the header: a hovered button, the avatar. */
  raised: Colour;
  ink: Colour;
  /** Icon buttons and supporting text in the header. */
  ink2: Colour;
  /** Placeholder, glyph and the quietest text in the header. */
  inkMuted: Colour;
  /** The wordmark's dot and any accent drawn in the header. */
  accent: Colour;
  /** Text on an accent fill in the header (the notification count). */
  onAccent: Colour;
  /** The pressed fill of a header control (the bell on its own page). */
  accentWash: Colour;
  onAccentWash: Colour;
  /** Borders inside the header. */
  line: Colour;
  /** A stronger border in the header (a hovered avatar). */
  lineStrong: Colour;
  /** The rule under the header. */
  rule: Colour;
  /** Width of that rule, as CSS (`'1px'`). */
  ruleWidth: string;
  /** Keyboard focus ring inside the header. */
  focus: Colour;
}

/** Status hues. Reserved meanings, always shipped with an icon and a label,
 *  never reused as chart series. */
export interface StatusHues {
  good: Colour;
  warning: Colour;
  /** The step between warning and critical; no MUI slot of its own. */
  serious: Colour;
  critical: Colour;
}

/** Six categorical series in a fixed slot order that follows the entity and is
 *  never cycled: 1 brand · 2 teal · 3 coral · 4 green · 5 plum · 6 slate. */
export type ChartSeries = readonly [Colour, Colour, Colour, Colour, Colour, Colour];

/** Colours only the marketing pages draw (the ambient blooms). Optional:
 *  a scheme the marketing pages never wear does not carry them. */
export interface DecorRoles {
  /** A desaturated accent, for quiet marks on the marketing surface. */
  accentSoft: Colour;
  /** The two ambient bloom glows behind the hero. */
  bloom1: Colour;
  bloom2: Colour;
}

export interface SchemePalette {
  // Surfaces
  /** The page itself. */
  ground: Colour;
  /** A card, a sheet, a panel on the page. */
  surface: Colour;
  /** A surface on a surface: a well, a hovered row, a nested panel. */
  raised: Colour;

  // Rules
  line: Colour;
  lineStrong: Colour;

  // Ink
  ink: Colour;
  /** Supporting text. */
  ink2: Colour;
  /** The quietest text that is still text: labels, eyebrows, units. */
  ink3: Colour;

  // The action colour
  accent: Colour;
  /** Text and icons on an accent fill. */
  onAccent: Colour;
  /** A soft accent fill for selected and tonal states. */
  accentWash: Colour;
  /** Readable text on `accentWash`. */
  onAccentWash: Colour;

  // A second hue, used sparingly
  secondary: Colour;
  onSecondary: Colour;
  secondaryWash: Colour;
  onSecondaryWash: Colour;

  // Status
  danger: Colour;
  onDanger: Colour;
  dangerWash: Colour;
  ok: Colour;
  onOk: Colour;
  warn: Colour;
  onWarn: Colour;
  info: Colour;
  onInfo: Colour;

  // Keyboard focus
  focus: Colour;
  /** The halo a two-tone ring draws outside `focus`. Only High Contrast draws
   *  one; elsewhere it equals the ground so it can never show. */
  focusHalo: Colour;

  chrome: ChromeRoles;
  chart: ChartSeries;
  status: StatusHues;
  decor?: DecorRoles;
}

/** Every flat colour role, in the order reports print them. */
export const COLOUR_ROLES = [
  'ground', 'surface', 'raised',
  'line', 'lineStrong',
  'ink', 'ink2', 'ink3',
  'accent', 'onAccent', 'accentWash', 'onAccentWash',
  'secondary', 'onSecondary', 'secondaryWash', 'onSecondaryWash',
  'danger', 'onDanger', 'dangerWash', 'ok', 'onOk', 'warn', 'onWarn', 'info', 'onInfo',
  'focus', 'focusHalo',
] as const satisfies readonly (keyof SchemePalette)[];

export type ColourRole = (typeof COLOUR_ROLES)[number];

/** Every chrome colour role (`ruleWidth` is a length, not a colour). */
export const CHROME_COLOUR_ROLES = [
  'bg', 'surface', 'raised', 'ink', 'ink2', 'inkMuted', 'accent', 'onAccent', 'accentWash', 'onAccentWash',
  'line', 'lineStrong', 'rule', 'focus',
] as const satisfies readonly (keyof ChromeRoles)[];

export const STATUS_ROLES = ['good', 'warning', 'serious', 'critical'] as const satisfies readonly (keyof StatusHues)[];

export const DECOR_ROLES = ['accentSoft', 'bloom1', 'bloom2'] as const satisfies readonly (keyof DecorRoles)[];

/** The page roles the header is drawn from when it has no colours of its own. */
export type PageChromeSource = Pick<SchemePalette,
  'ground' | 'surface' | 'raised' | 'ink' | 'ink2' | 'ink3' | 'accent' | 'onAccent' | 'accentWash' | 'onAccentWash'
  | 'line' | 'lineStrong' | 'focus'>;

/** The header in the page's own colours — what Bloom and High Contrast use. */
export function pageChrome(p: PageChromeSource): ChromeRoles {
  return {
    bg: p.ground,
    surface: p.surface,
    raised: p.raised,
    ink: p.ink,
    ink2: p.ink2,
    inkMuted: p.ink3,
    accent: p.accent,
    onAccent: p.onAccent,
    accentWash: p.accentWash,
    onAccentWash: p.onAccentWash,
    line: p.line,
    lineStrong: p.lineStrong,
    rule: p.line,
    ruleWidth: '1px',
    focus: p.focus,
  };
}
