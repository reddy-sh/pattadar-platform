/**
 * WCAG 2.x contrast, computed from palette values rather than eyeballed.
 *
 * `contrastRatio(fg, bg)` composites a translucent foreground over its
 * background first, so a wash or a scrim is measured as it actually paints.
 * The background itself must be opaque (it is composited over white if it is
 * not, and the report says so).
 */

export interface Rgba {
  /** 0–255 */
  r: number;
  g: number;
  b: number;
  /** 0–1 */
  a: number;
}

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*([^)]*)\)$/i;

/** Parse `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb(r, g, b)`,
 *  `rgba(r, g, b, a)` and the space form `rgb(r g b / a)`. Throws on
 *  anything else: a palette value that cannot be parsed is a defect, not a
 *  colour to skip. */
export function parseColour(value: string): Rgba {
  const v = value.trim();
  const hex = v.match(HEX);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const rgb = v.match(RGB);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length === 3 || parts.length === 4) {
      const [r, g, b] = parts.slice(0, 3).map((p) => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p)));
      const alpha = parts[3];
      const a = alpha === undefined ? 1 : alpha.endsWith('%') ? parseFloat(alpha) / 100 : parseFloat(alpha);
      if ([r, g, b, a].every((x) => Number.isFinite(x))) return { r, g, b, a };
    }
  }
  throw new Error(`not an sRGB colour: ${value}`);
}

/** Paint `fg` over `bg` (source-over). The result is opaque if `bg` is. */
export function composite(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a + bg.a * (1 - fg.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (f: number, b: number) => (f * fg.a + b * bg.a * (1 - fg.a)) / a;
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a };
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

/** WCAG relative luminance of an opaque colour. */
export function relativeLuminance(c: Rgba): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** WCAG contrast ratio of `fg` drawn on `bg`, 1–21. */
export function contrastRatio(fg: string, bg: string): number {
  const back = parseColour(bg);
  const opaqueBack = back.a < 1 ? composite(back, WHITE) : back;
  const front = composite(parseColour(fg), opaqueBack);
  const [x, y] = [relativeLuminance(front), relativeLuminance(opaqueBack)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** `#rrggbb` of an opaque colour, for reports and generated CSS. */
export function toHex(c: Rgba): string {
  const ch = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${ch(c.r)}${ch(c.g)}${ch(c.b)}`;
}

/** True when two colours are the same to within `tolerance` per 0–255
 *  channel (and 0.01 alpha). A hex conversion of an oklch value can differ
 *  from another tool's by a rounding step. */
export function sameColour(a: string, b: string, tolerance = 0): boolean {
  const [x, y] = [parseColour(a), parseColour(b)];
  return (
    Math.abs(x.r - y.r) <= tolerance &&
    Math.abs(x.g - y.g) <= tolerance &&
    Math.abs(x.b - y.b) <= tolerance &&
    Math.abs(x.a - y.a) <= 0.01
  );
}
