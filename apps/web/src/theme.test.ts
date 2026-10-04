/**
 * The MUI theme, built from the palette pack, against the theme it replaced.
 *
 * theme.before.json is apps/web/src/theme.ts as it rendered on 03/10/2026,
 * when every colour was written into this app by hand. The theme is now
 * built from @pattadar/tokens; it must paint the same colours, type and shape
 * except for what CHANGED lists — each of them a change made on purpose and
 * recorded in packages/tokens/src/palette/palette.test.ts as well.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseColour, registry, sameColour } from '@pattadar/tokens';
import { theme } from './theme';

const BEFORE = JSON.parse(readFileSync(join(import.meta.dir, 'theme.before.json'), 'utf8'));

/** Path → the value it paints now. Everything else must equal BEFORE. */
const CHANGED: Record<string, unknown> = {
  // MUI keys the scheme on <html data-scheme>, and opens in Dark.
  colorSchemeSelector: 'data-scheme',
  defaultColorScheme: 'dark',
  // One wash strength (14%) for MUI and W360 alike.
  'colorSchemes.light.primary.container': 'rgba(170, 89, 16, 0.14)',
  'colorSchemes.dark.primary.container': 'rgba(254, 134, 15, 0.14)',
  // 04/10/2026: the coral told from the error red by lightness — deepened in
  // Light, lightened in Dark (MUI derives .light and .dark from .main).
  'colorSchemes.light.secondary.main': '#751e2d',
  'colorSchemes.light.secondary.light': 'rgb(144, 75, 87)',
  'colorSchemes.light.secondary.dark': 'rgb(81, 21, 31)',
  'colorSchemes.light.secondary.container': 'rgba(117, 30, 45, 0.14)',
  'colorSchemes.light.secondary.onContainer': '#751e2d',
  'colorSchemes.dark.secondary.main': '#fca48d',
  'colorSchemes.dark.secondary.light': 'rgb(252, 182, 163)',
  'colorSchemes.dark.secondary.dark': 'rgb(176, 114, 98)',
  'colorSchemes.dark.secondary.container': 'rgba(252, 164, 141, 0.14)',
  'colorSchemes.dark.secondary.onContainer': '#fca48d',
  // 04/10/2026: Light's warning held off the action amber by lightness.
  'colorSchemes.light.warning.main': '#72480b',
  'colorSchemes.light.warning.light': 'rgb(142, 108, 59)',
  'colorSchemes.light.warning.dark': 'rgb(79, 50, 7)',
  // 04/10/2026: dark text on the Dark red (6.24:1; white was 3.16:1).
  'colorSchemes.dark.error.contrastText': '#180600',
};

const isColour = (v: unknown) => {
  if (typeof v !== 'string') return false;
  try { parseColour(v); return true; } catch { return false; }
};

/** Same value; colours compare as colours, so '#fff' equals '#ffffff'. */
const same = (a: unknown, b: unknown) => (isColour(a) && isColour(b) ? sameColour(a as string, b as string) : Object.is(a, b));

function leaves(value: unknown, path: string[] = []): Array<[string, unknown]> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([k, v]) => leaves(v, [...path, k]));
  }
  return [[path.join('.'), value]];
}

const t = theme as unknown as {
  colorSchemeSelector: string;
  defaultColorScheme: string;
  colorSchemes: Record<string, { palette: Record<string, unknown> }>;
  shape: unknown;
  typography: Record<string, unknown>;
};

function now(path: string): unknown {
  const [head, ...rest] = path.split('.');
  let v: unknown =
    head === 'colorSchemes' ? { ...Object.fromEntries(Object.entries(t.colorSchemes).map(([k, s]) => [k, s.palette])) } : (t as Record<string, unknown>)[head];
  for (const k of rest) v = (v as Record<string, unknown> | undefined)?.[k];
  return v;
}

describe('theme.ts paints what it painted before the palette pack', () => {
  for (const [path, before] of leaves(BEFORE).filter(([p]) => !p.startsWith('$about'))) {
    test(path, () => {
      const value = now(path);
      if (path in CHANGED) {
        expect(same(before, CHANGED[path])).toBe(false);
        expect(same(value, CHANGED[path])).toBe(true);
      } else {
        expect({ path, value: same(value, before) ? before : value }).toEqual({ path, value: before });
      }
    });
  }

  test('every CHANGED path is one the old theme had', () => {
    const known = new Set(leaves(BEFORE).map(([p]) => p));
    for (const path of Object.keys(CHANGED)) expect(known.has(path)).toBe(true);
  });
});

describe('every registered scheme is a complete MUI scheme', () => {
  test('one MUI scheme per registered scheme, and nothing else', () => {
    expect(Object.keys(t.colorSchemes).sort()).toEqual(registry.schemes.map((s) => s.id).sort());
    expect(t.defaultColorScheme).toBe(registry.defaults.web);
  });

  for (const s of registry.schemes) {
    test(`${s.id} carries MUI's defaults and the pack's own roles`, () => {
      const p = t.colorSchemes[s.id].palette as Record<string, any>;
      // What MUI reads while it derives its variables; a hand-written custom
      // scheme lacked these and threw inside createTheme.
      expect(p.common).toBeDefined();
      expect(p.grey?.[100]).toBeDefined();
      expect(p.action?.hover).toBeDefined();
      for (const slot of ['primary', 'secondary', 'error', 'warning', 'info', 'success']) {
        expect([slot, typeof p[slot]?.light, typeof p[slot]?.dark]).toEqual([slot, 'string', 'string']);
      }
      expect(p.mode).toBe(s.mode);
      expect(p.background.raised).toBe(s.palette.raised);
      expect(p.text.muted).toBe(s.palette.ink3);
      expect(p.dividerStrong).toBe(s.palette.lineStrong);
      expect(p.focus).toBe(s.palette.focus);
      expect(p.focusHalo).toBe(s.palette.focusHalo);
      expect(p.error.container).toBe(s.palette.dangerWash);
      expect(p.chrome).toEqual(s.palette.chrome);
      if (s.palette.decor) expect(p.decor).toEqual(s.palette.decor);
    });
  }
});
