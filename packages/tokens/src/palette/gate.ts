/**
 * The contrast rules every colour scheme is held to, and the role contract
 * check. scripts/palette-tests.ts runs both over every registered scheme;
 * the unit tests run them over fixtures so the gate is proven able to fail.
 *
 * Thresholds are WCAG 2.x: 4.5:1 for text (7:1 where a scheme is held to AAA),
 * 3:1 for meaningful non-text UI such as a focus ring or a chart series.
 * A pair with `min: 0` is reported for information and never fails.
 */
import { composite, contrastRatio, parseColour, toHex } from './contrast';
import {
  CHROME_COLOUR_ROLES,
  COLOUR_ROLES,
  DECOR_ROLES,
  STATUS_ROLES,
  type SchemePalette,
} from './roles';

export interface PairResult {
  /** `ink3 on surface`. */
  pair: string;
  /** The role being read (the foreground), for grouping. */
  role: string;
  ratio: number;
  /** The floor; 0 means the pair is reported, not gated. */
  min: number;
  ok: boolean;
}

const TEXT = 4.5;
const AAA = 7;
const NON_TEXT = 3;

/** A translucent fill as it paints on `base`. */
const over = (fill: string, base: string) => toHex(composite(parseColour(fill), parseColour(base)));

export function evaluatePalette(p: SchemePalette, textLevel: 'AA' | 'AAA' = 'AA'): PairResult[] {
  const out: PairResult[] = [];
  const pair = (role: string, fg: string, bgName: string, bg: string, min: number) => {
    const ratio = contrastRatio(fg, bg);
    out.push({ pair: `${role} on ${bgName}`, role, ratio, min, ok: min === 0 || ratio >= min });
  };
  const body = textLevel === 'AAA' ? AAA : TEXT;

  for (const role of ['ink', 'ink2'] as const) {
    for (const bg of ['ground', 'surface', 'raised'] as const) pair(role, p[role], bg, p[bg], body);
  }
  for (const role of ['ink3', 'accent', 'danger', 'ok', 'warn', 'info'] as const) {
    for (const bg of ['ground', 'surface'] as const) pair(role, p[role], bg, p[bg], TEXT);
  }
  pair('onAccent', p.onAccent, 'accent', p.accent, TEXT);
  for (const bg of ['ground', 'surface'] as const) pair('focus', p.focus, bg, p[bg], NON_TEXT);
  p.chart.forEach((c, i) => pair(`chart[${i + 1}]`, c, 'surface', p.surface, NON_TEXT));

  // The header, on its own background: the bar itself, the search field in
  // it, and a hovered control.
  pair('chrome.ink', p.chrome.ink, 'chrome.bg', p.chrome.bg, TEXT);
  pair('chrome.ink2', p.chrome.ink2, 'chrome.bg', p.chrome.bg, TEXT);
  pair('chrome.inkMuted', p.chrome.inkMuted, 'chrome.bg', p.chrome.bg, TEXT);
  pair('chrome.accent', p.chrome.accent, 'chrome.bg', p.chrome.bg, TEXT);
  pair('chrome.ink', p.chrome.ink, 'chrome.surface', p.chrome.surface, TEXT);
  pair('chrome.inkMuted', p.chrome.inkMuted, 'chrome.surface', p.chrome.surface, TEXT);
  pair('chrome.ink2', p.chrome.ink2, 'chrome.raised', p.chrome.raised, NON_TEXT);
  pair('chrome.onAccent', p.chrome.onAccent, 'chrome.accent', p.chrome.accent, TEXT);
  pair('chrome.focus', p.chrome.focus, 'chrome.bg', p.chrome.bg, NON_TEXT);

  // Reported, not gated: text on a filled control, and on the soft fills.
  pair('onSecondary', p.onSecondary, 'secondary', p.secondary, 0);
  pair('onDanger', p.onDanger, 'danger', p.danger, 0);
  pair('onOk', p.onOk, 'ok', p.ok, 0);
  pair('onWarn', p.onWarn, 'warn', p.warn, 0);
  pair('onInfo', p.onInfo, 'info', p.info, 0);
  const accentWash = over(p.accentWash, p.ground);
  pair('onAccentWash', p.onAccentWash, 'accentWash', accentWash, 0);
  pair('accent', p.accent, 'accentWash', accentWash, 0);
  pair('onSecondaryWash', p.onSecondaryWash, 'secondaryWash', over(p.secondaryWash, p.ground), 0);
  pair('danger', p.danger, 'dangerWash', over(p.dangerWash, p.ground), 0);
  pair('chrome.onAccentWash', p.chrome.onAccentWash, 'chrome.accentWash', over(p.chrome.accentWash, p.chrome.bg), 0);
  return out;
}

/** Roles that are missing or do not parse as sRGB. Empty means complete. */
export function missingRoles(p: SchemePalette): string[] {
  const bad: string[] = [];
  const colour = (name: string, v: unknown) => {
    if (typeof v !== 'string') { bad.push(`${name} (missing)`); return; }
    try { parseColour(v); } catch { bad.push(`${name} (not sRGB: ${v})`); }
  };
  const record = p as unknown as Record<string, unknown>;
  for (const role of COLOUR_ROLES) colour(role, record[role]);

  const chrome = (p.chrome ?? {}) as unknown as Record<string, unknown>;
  for (const role of CHROME_COLOUR_ROLES) colour(`chrome.${role}`, chrome[role]);
  if (typeof chrome.ruleWidth !== 'string' || !/^\d+(\.\d+)?px$/.test(chrome.ruleWidth)) {
    bad.push('chrome.ruleWidth (a CSS px length)');
  }

  if (!Array.isArray(p.chart) || p.chart.length !== 6) bad.push('chart (six series)');
  else p.chart.forEach((c, i) => colour(`chart[${i + 1}]`, c));

  const status = (p.status ?? {}) as unknown as Record<string, unknown>;
  for (const role of STATUS_ROLES) colour(`status.${role}`, status[role]);

  if (p.decor) {
    const decor = p.decor as unknown as Record<string, unknown>;
    for (const role of DECOR_ROLES) colour(`decor.${role}`, decor[role]);
  }
  return bad;
}
