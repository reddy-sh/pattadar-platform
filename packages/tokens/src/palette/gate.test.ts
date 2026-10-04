import { describe, expect, test } from 'bun:test';

import { bloomDark, bloomLight } from './bloom';
import { evaluatePalette, missingRoles } from './gate';
import { highContrast } from './highContrast';
import { schemes } from './registry';
import { pageChrome, type SchemePalette } from './roles';

const failing = (p: SchemePalette, level: 'AA' | 'AAA' = 'AA') =>
  evaluatePalette(p, level).filter((r) => !r.ok).map((r) => r.pair);

/** A palette that clears every rule with room to spare. */
const GOOD_BASE = {
  ground: '#ffffff', surface: '#ffffff', ink: '#000000', ink3: '#444444', accent: '#003b73', line: '#000000', focus: '#000000',
  raised: '#f2f2f2', lineStrong: '#000000', ink2: '#222222',
  onAccent: '#ffffff', accentWash: '#d9ecff', onAccentWash: '#001c38',
};
const GOOD: SchemePalette = {
  ...GOOD_BASE,
  secondary: '#5a1a78', onSecondary: '#ffffff', secondaryWash: '#f4ddff', onSecondaryWash: '#2c003e',
  danger: '#a40000', onDanger: '#ffffff', dangerWash: '#ffe0e0',
  ok: '#006b3c', onOk: '#ffffff', warn: '#6b4f00', onWarn: '#ffffff', info: '#004f6b', onInfo: '#ffffff',
  focusHalo: '#ffffff',
  chrome: pageChrome(GOOD_BASE),
  chart: ['#003b73', '#006c72', '#97182f', '#387d3d', '#793887', '#426a8c'],
  status: { good: '#006b3c', warning: '#6b4f00', serious: '#a82700', critical: '#a40000' },
};

describe('evaluatePalette', () => {
  test('passes a palette that clears every rule', () => {
    expect(failing(GOOD)).toEqual([]);
    expect(failing(GOOD, 'AAA')).toEqual([]);
  });

  test('fails pale ink and names each pair', () => {
    const pale = { ...GOOD, ink2: '#b0b0b0' };
    expect(failing(pale)).toEqual(['ink2 on ground', 'ink2 on surface', 'ink2 on raised']);
  });

  test('fails a focus ring the page swallows, and text on its own accent', () => {
    const bad = { ...GOOD, focus: '#ffd9a0', onAccent: '#1f3b5a' };
    expect(failing(bad)).toEqual(['onAccent on accent', 'focus on ground', 'focus on surface']);
  });

  test('a chart series under 3:1 fails by slot', () => {
    const bad = { ...GOOD, chart: ['#003b73', '#eeeeee', '#97182f', '#387d3d', '#793887', '#426a8c'] as const };
    expect(failing(bad)).toEqual(['chart[2] on surface']);
  });

  test('a header whose ink it cannot carry fails on the chrome pairs', () => {
    const bad = { ...GOOD, chrome: { ...GOOD.chrome, bg: '#202521' } };
    expect(failing(bad)).toEqual([
      'chrome.ink on chrome.bg', 'chrome.ink2 on chrome.bg', 'chrome.inkMuted on chrome.bg', 'chrome.accent on chrome.bg',
      'chrome.focus on chrome.bg',
    ]);
  });

  test('a header field or count the header cannot carry fails on its own pair', () => {
    const bad = { ...GOOD, chrome: { ...GOOD.chrome, surface: '#202521', onAccent: '#1f3b5a' } };
    expect(failing(bad)).toEqual(['chrome.ink on chrome.surface', 'chrome.inkMuted on chrome.surface', 'chrome.onAccent on chrome.accent']);
  });

  test('AAA holds body ink to 7:1', () => {
    const grey = { ...GOOD, ink2: '#666666' }; // 5.74:1 on white
    expect(failing(grey, 'AA')).toEqual([]);
    expect(failing(grey, 'AAA')).toEqual(['ink2 on ground', 'ink2 on surface', 'ink2 on raised']);
  });

  test('reported pairs never fail', () => {
    const results = evaluatePalette({ ...GOOD, onDanger: '#a40000' });
    const info = results.find((r) => r.pair === 'onDanger on danger')!;
    expect(info.min).toBe(0);
    expect(info.ok).toBe(true);
    expect(info.ratio).toBeCloseTo(1, 5);
  });
});

describe('the real schemes', () => {
  test('clear every floor', () => {
    for (const s of schemes) {
      const bad = evaluatePalette(s.palette, s.textLevel).filter((r) => !r.ok).map((r) => r.pair);
      expect({ scheme: s.id, bad }).toEqual({ scheme: s.id, bad: [] });
    }
  });

  test('High Contrast clears AAA body text', () => {
    expect(failing(highContrast, 'AAA').filter((p) => p.startsWith('ink'))).toEqual([]);
  });

  test('the Light focus ring clears 3:1 where the old one was 1.88:1', () => {
    const ring = evaluatePalette(bloomLight).filter((r) => r.role === 'focus');
    expect(ring.every((r) => r.ok && r.ratio >= 3.5)).toBe(true);
  });

  test('muted ink clears 4.5:1 on the page and on cards, where it was 4.28–4.49:1 (TODO-one-platform #17)', () => {
    for (const p of [bloomDark, bloomLight]) {
      for (const pair of ['ink3 on ground', 'ink3 on surface']) {
        const r = evaluatePalette(p).find((x) => x.pair === pair)!;
        expect({ pair, ok: r.ratio >= 4.5 }).toEqual({ pair, ok: true });
      }
    }
    // The smallest step that clears it: neither is more than 0.1:1 over.
    expect(evaluatePalette(bloomDark).find((x) => x.pair === 'ink3 on surface')!.ratio).toBeLessThan(4.6);
    expect(evaluatePalette(bloomLight).find((x) => x.pair === 'ink3 on ground')!.ratio).toBeLessThan(4.6);
  });
});

describe('missingRoles', () => {
  test('a complete palette has none', () => {
    for (const s of schemes) expect(missingRoles(s.palette)).toEqual([]);
    expect(missingRoles(GOOD)).toEqual([]);
  });

  test('names what is missing or unparseable', () => {
    const broken = {
      ...GOOD,
      focus: undefined,
      accent: 'oklch(55% 0.13 55)',
      chart: GOOD.chart.slice(0, 5),
      chrome: { ...GOOD.chrome, ruleWidth: 'thin' },
      status: { good: '#000000' },
      decor: { accentSoft: '#c9a187' },
    } as unknown as SchemePalette;
    expect(missingRoles(broken)).toEqual([
      'accent (not sRGB: oklch(55% 0.13 55))',
      'focus (missing)',
      'chrome.ruleWidth (a CSS px length)',
      'chart (six series)',
      'status.warning (missing)',
      'status.serious (missing)',
      'status.critical (missing)',
      'decor.bloom1 (missing)',
      'decor.bloom2 (missing)',
    ]);
  });
});
