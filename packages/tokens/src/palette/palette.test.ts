/**
 * The palette pack against what the apps painted before it existed.
 *
 * BEFORE is a frozen record of the values the two web theme engines rendered
 * on 03/10/2026: MUI's (apps/web/src/theme.ts) and W360's (the `--w-*`
 * blocks in apps/web/src/w360/w360.css, with Bloom's oklch tokens converted
 * to sRGB). Every role must equal what rendered then — unless CHANGES lists
 * it, with the old value, the new one and why. CHANGES is the list a reviewer
 * reads to see every visible colour difference the pack introduces.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { bloomDark, bloomLight } from './bloom';
import { contrastRatio, sameColour } from './contrast';
import { highContrast } from './highContrast';
import { pattadarGold } from './pattadarGold';
import { isSchemeId, menuSchemes, registry, schemeById, schemes, type SchemeId } from './registry';
import { COLOUR_ROLES, type ColourRole, type SchemePalette } from './roles';

type Seen = { mui?: string; w360?: string };

const BEFORE: Record<'light' | 'dark' | 'highContrast', Partial<Record<ColourRole, Seen>>> = {
  light: {
    ground: { mui: '#f9f6f2', w360: '#f9f6f2' },
    surface: { mui: '#fdfcf9', w360: '#fdfcf9' },
    raised: { w360: '#f2ece5' },
    line: { mui: '#e3ddd8', w360: '#e3ddd8' },
    lineStrong: { w360: '#cbc2ba' },
    ink: { mui: '#261d1a', w360: '#261d1a' },
    ink2: { mui: '#615956', w360: '#615956' },
    ink3: { w360: '#7d736e' },
    accent: { mui: '#aa5910', w360: '#aa5910' },
    onAccent: { mui: '#ffffff', w360: '#fffaf4' },
    // W360's Light wash was never redeclared: it mixed the DARK amber at 14%.
    accentWash: { mui: 'rgba(170, 89, 16, 0.08)', w360: 'rgba(254, 134, 15, 0.14)' },
    onAccentWash: { mui: '#8c4a11' },
    secondary: { mui: '#b23645' },
    onSecondary: { mui: '#ffffff' },
    secondaryWash: { mui: 'rgba(178, 54, 69, 0.08)' },
    onSecondaryWash: { mui: '#8f2b37' },
    danger: { mui: '#be222a', w360: '#be222a' },
    onDanger: { mui: '#ffffff' },
    dangerWash: { w360: 'rgba(255, 84, 83, 0.12)' },
    ok: { mui: '#27762f', w360: '#27762f' },
    onOk: { mui: '#ffffff' },
    warn: { mui: '#905d00', w360: '#905d00' },
    onWarn: { mui: '#ffffff' },
    info: { mui: '#3d6a7f', w360: '#3d6a7f' },
    onInfo: { mui: '#ffffff' },
    // W360 drew Light's ring in the Dark-only --color-focus.
    focus: { w360: '#ffa03c' },
  },
  dark: {
    ground: { mui: '#0d0504', w360: '#0d0504' },
    surface: { mui: '#170c09', w360: '#170c09' },
    raised: { w360: '#241714' },
    line: { mui: '#312622', w360: '#312622' },
    lineStrong: { w360: '#54433e' },
    ink: { mui: '#f3ede7', w360: '#f3ede7' },
    ink2: { mui: '#bfb5ae', w360: '#bfb5ae' },
    ink3: { w360: '#827873' },
    accent: { mui: '#fe860f', w360: '#fe860f' },
    onAccent: { mui: '#180600', w360: '#180600' },
    accentWash: { mui: 'rgba(254, 134, 15, 0.16)', w360: 'rgba(254, 134, 15, 0.14)' },
    onAccentWash: { mui: '#fe860f' },
    secondary: { mui: '#ff4a63' },
    onSecondary: { mui: '#180600' },
    secondaryWash: { mui: 'rgba(255, 74, 99, 0.16)' },
    onSecondaryWash: { mui: '#ff4a63' },
    danger: { mui: '#ff5453', w360: '#ff5453' },
    onDanger: { mui: '#ffffff' },
    dangerWash: { w360: 'rgba(255, 84, 83, 0.12)' },
    ok: { mui: '#61c568', w360: '#61c568' },
    onOk: { mui: 'rgba(0, 0, 0, 0.87)' },
    // W360: oklch(80% 0.140 75).
    warn: { mui: '#f5ae39', w360: '#f2af48' },
    onWarn: { mui: '#180600' },
    // W360: oklch(76% 0.070 230), the same colour.
    info: { mui: '#82bad5', w360: '#82bad5' },
    onInfo: { mui: '#180600' },
    focus: { w360: '#ffa03c' },
  },
  highContrast: {
    ground: { mui: '#ffffff', w360: '#ffffff' },
    surface: { mui: '#ffffff', w360: '#ffffff' },
    raised: { w360: '#f2f2f2' },
    line: { mui: '#000000', w360: '#000000' },
    lineStrong: { w360: '#000000' },
    ink: { mui: '#000000', w360: '#000000' },
    ink2: { mui: '#1f1f1f', w360: '#171717' },
    ink3: { w360: '#292929' },
    accent: { mui: '#003b73', w360: '#003b73' },
    onAccent: { mui: '#ffffff', w360: '#ffffff' },
    accentWash: { mui: '#d9ecff', w360: '#d9ecff' },
    onAccentWash: { mui: '#001c38' },
    secondary: { mui: '#5a1a78' },
    onSecondary: { mui: '#ffffff' },
    secondaryWash: { mui: '#f4ddff' },
    onSecondaryWash: { mui: '#2c003e' },
    danger: { mui: '#a40000', w360: '#780000' },
    onDanger: { mui: '#ffffff' },
    dangerWash: { w360: '#ffe0e0' },
    ok: { mui: '#006b3c', w360: '#005a20' },
    onOk: { mui: '#ffffff' },
    warn: { mui: '#6b4f00', w360: '#6b3d00' },
    onWarn: { mui: '#ffffff' },
    info: { mui: '#004f6b', w360: '#004f6e' },
    onInfo: { mui: '#ffffff' },
    // MUI: CssBaseline's black 3px ring with a white halo. W360: a blue ring.
    focus: { mui: '#000000', w360: '#005fcc' },
    focusHalo: { mui: '#ffffff' },
  },
};

interface Change {
  scheme: 'light' | 'dark' | 'highContrast';
  role: ColourRole;
  /** Which engine paints differently from today. */
  surface: 'mui' | 'w360';
  after: string;
  why: string;
}

/** Every value that paints differently from BEFORE, and why. */
const CHANGES: Change[] = [
  { scheme: 'light', role: 'onAccent', surface: 'w360', after: '#ffffff', why: 'design.md: white text on the Light amber' },
  { scheme: 'light', role: 'accentWash', surface: 'mui', after: 'rgba(170, 89, 16, 0.14)', why: 'one wash strength (14%) for both engines' },
  { scheme: 'light', role: 'accentWash', surface: 'w360', after: 'rgba(170, 89, 16, 0.14)', why: 'mixed from the Light amber, not the Dark one' },
  { scheme: 'light', role: 'secondary', surface: 'mui', after: '#751e2d', why: 'coral deepened so it is told from danger by lightness (1.74:1); it was 1.02:1 against the red' },
  { scheme: 'light', role: 'secondaryWash', surface: 'mui', after: 'rgba(117, 30, 45, 0.14)', why: 'one wash strength (14%), of the deepened coral' },
  { scheme: 'light', role: 'onSecondaryWash', surface: 'mui', after: '#751e2d', why: 'the deepened coral itself reads 7.67:1 on its wash' },
  { scheme: 'light', role: 'warn', surface: 'mui', after: '#72480b', why: 'bronze held off the action amber by lightness (1.57:1); #905d00 was 1.11:1 against it' },
  { scheme: 'light', role: 'warn', surface: 'w360', after: '#72480b', why: 'bronze held off the action amber by lightness (1.57:1); #905d00 was 1.11:1 against it' },
  { scheme: 'light', role: 'dangerWash', surface: 'w360', after: 'rgba(190, 34, 42, 0.12)', why: 'mixed from the Light red, not the Dark one' },
  { scheme: 'light', role: 'focus', surface: 'w360', after: '#c9690c', why: 'the Dark ring was 1.88:1 on Light paper; this is 3.54:1' },
  { scheme: 'dark', role: 'accentWash', surface: 'mui', after: 'rgba(254, 134, 15, 0.14)', why: 'one wash strength (14%) for both engines' },
  { scheme: 'dark', role: 'secondary', surface: 'mui', after: '#fca48d', why: 'coral lightened so it is told from danger by lightness (1.63:1); it was 1.04:1 against the red' },
  { scheme: 'dark', role: 'secondaryWash', surface: 'mui', after: 'rgba(252, 164, 141, 0.14)', why: 'one wash strength (14%), of the lightened coral' },
  { scheme: 'dark', role: 'onSecondaryWash', surface: 'mui', after: '#fca48d', why: 'the lightened coral, as before the coral itself' },
  { scheme: 'dark', role: 'onDanger', surface: 'mui', after: '#180600', why: 'white on the Dark red was 3.16:1; dark text is 6.24:1, as every other Dark fill carries' },
  { scheme: 'dark', role: 'warn', surface: 'w360', after: '#f5ae39', why: "design.md's Dark warning" },
  { scheme: 'highContrast', role: 'ink2', surface: 'w360', after: '#1f1f1f', why: "design.md's High Contrast secondary text" },
  { scheme: 'highContrast', role: 'danger', surface: 'w360', after: '#a40000', why: "design.md's High Contrast error" },
  { scheme: 'highContrast', role: 'ok', surface: 'w360', after: '#006b3c', why: "design.md's High Contrast success" },
  { scheme: 'highContrast', role: 'warn', surface: 'w360', after: '#6b4f00', why: "design.md's High Contrast warning" },
  { scheme: 'highContrast', role: 'info', surface: 'w360', after: '#004f6b', why: "design.md's High Contrast info" },
  { scheme: 'highContrast', role: 'focus', surface: 'w360', after: '#000000', why: 'one two-tone ring (black, white halo) for both engines' },
  { scheme: 'light', role: 'ink3', surface: 'w360', after: '#736964', why: 'muted ink cleared 4.5:1 on neither paper (4.28 and 4.49), then not on raised (4.17); TODO-one-platform #17' },
  { scheme: 'dark', role: 'ink3', surface: 'w360', after: '#8b817b', why: 'muted ink was 4.46:1 on cards, then 4.11:1 on raised; TODO-one-platform #17' },
];

const PACK: Record<'light' | 'dark' | 'highContrast', SchemePalette> = {
  light: bloomLight,
  dark: bloomDark,
  highContrast,
};

describe('the pack paints what the apps painted, except the listed changes', () => {
  for (const scheme of ['light', 'dark', 'highContrast'] as const) {
    for (const [role, seen] of Object.entries(BEFORE[scheme]) as [ColourRole, Seen][]) {
      test(`${scheme} ${role}`, () => {
        const now = PACK[scheme][role];
        for (const surface of ['mui', 'w360'] as const) {
          const before = seen[surface];
          if (before === undefined) continue;
          const change = CHANGES.find((c) => c.scheme === scheme && c.role === role && c.surface === surface);
          if (change) {
            // A listed change really is a change, and the pack holds its new value.
            expect(sameColour(before, change.after)).toBe(false);
            expect(sameColour(now, change.after)).toBe(true);
          } else {
            expect({ surface, value: now }).toEqual({ surface, value: sameColour(now, before) ? now : before });
          }
        }
      });
    }
  }

  test('every listed change names a value that was really painted', () => {
    for (const c of CHANGES) expect(BEFORE[c.scheme][c.role]?.[c.surface]).toBeDefined();
  });

  test('the chart and status hues are the ones the chart hooks read', () => {
    // Light slot 4 moved off the status green on 04/10/2026 (it was #387d3d).
    expect([...bloomLight.chart]).toEqual(['#b3621e', '#006c72', '#97182f', '#539344', '#793887', '#426a8c']);
    expect([...bloomDark.chart]).toEqual(['#fe860f', '#3ebfc6', '#da4053', '#8cda8f', '#ba71cb', '#80aace']);
    expect(bloomLight.status).toEqual({ good: '#27762f', warning: '#72480b', serious: '#a82700', critical: '#be222a' });
    expect(bloomDark.status).toEqual({ good: '#61c568', warning: '#f5ae39', serious: '#fd6844', critical: '#ff5453' });
    // High Contrast charts were drawn in Light's hues, and still are.
    expect(highContrast.chart).toEqual(bloomLight.chart);
    expect(highContrast.status).toEqual(bloomLight.status);
  });

  // Colours that must never be mistaken for each other are told apart by
  // lightness, not hue alone (the chart rule, applied to the roles too).
  test('secondary is apart from danger, warning from the action colour, and chart green from status green', () => {
    const apart = (a: string, b: string) => contrastRatio(a, b);
    for (const p of [bloomLight, bloomDark]) {
      expect(apart(p.secondary, p.danger)).toBeGreaterThanOrEqual(1.5);
    }
    expect(apart(bloomLight.accent, bloomLight.warn)).toBeGreaterThanOrEqual(1.5);
    expect(apart(bloomLight.chart[3], bloomLight.status.good)).toBeGreaterThanOrEqual(1.5);
  });

  test("status good/warning/critical are each scheme's ok/warn/danger", () => {
    for (const p of [bloomLight, bloomDark]) {
      expect(sameColour(p.status.good, p.ok)).toBe(true);
      expect(sameColour(p.status.warning, p.warn)).toBe(true);
      expect(sameColour(p.status.critical, p.danger)).toBe(true);
    }
  });

  test('only High Contrast draws a focus halo; elsewhere it is the ground', () => {
    expect(sameColour(bloomLight.focusHalo, bloomLight.ground)).toBe(true);
    expect(sameColour(bloomDark.focusHalo, bloomDark.ground)).toBe(true);
  });

  test('Bloom and High Contrast draw the header in their page colours', () => {
    for (const p of [bloomLight, bloomDark, highContrast]) {
      expect(p.chrome).toEqual({
        bg: p.ground, surface: p.surface, raised: p.raised, ink: p.ink, ink2: p.ink2, inkMuted: p.ink3,
        accent: p.accent, onAccent: p.onAccent, accentWash: p.accentWash, onAccentWash: p.onAccentWash,
        line: p.line, lineStrong: p.lineStrong, rule: p.line, ruleWidth: '1px', focus: p.focus,
      });
    }
  });
});

// ── Bloom Dark against its oklch source ─────────────────────────────────────
//
// The sources as apps/web/src/styles/tokens.css declared them on 03/10/2026,
// frozen here so the conversion stays checked after that file stops holding
// colour. Converted with the OKLab matrices and clipped to sRGB per channel.

function oklchToHex(lPercent: number, c: number, h: number): string {
  const L = lPercent / 100;
  const rad = (h * Math.PI) / 180;
  const [a, b] = [c * Math.cos(rad), c * Math.sin(rad)];
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const gamma = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.max(x, 0) ** (1 / 2.4) - 0.055);
  return `#${linear.map((x) => Math.round(Math.min(1, Math.max(0, gamma(x))) * 255).toString(16).padStart(2, '0')).join('')}`;
}

const OKLCH: Array<[string, string, [number, number, number]]> = [
  ['--color-paper', bloomDark.ground, [13, 0.018, 35]],
  ['--color-paper-2', bloomDark.surface, [17, 0.02, 35]],
  ['--color-paper-3', bloomDark.raised, [22, 0.022, 35]],
  ['--color-ink', bloomDark.ink, [95, 0.01, 70]],
  ['--color-ink-2', bloomDark.ink2, [78, 0.015, 60]],
  // Nudged from 58% on 03/10/2026, so muted labels clear 4.5:1 on cards, and
  // from 58.5% on 04/10/2026, so they clear it on raised too (#17).
  ['--color-ink-3', bloomDark.ink3, [61, 0.015, 50]],
  ['--color-rule', bloomDark.line, [28, 0.018, 40]],
  ['--color-rule-strong', bloomDark.lineStrong, [40, 0.025, 40]],
  ['--color-accent', bloomDark.accent, [74, 0.18, 55]],
  // Lightened from oklch(68% 0.22 18) on 04/10/2026, off the danger red.
  ['--color-accent-2', bloomDark.secondary, [80, 0.11, 35]],
  ['--color-accent-ink', bloomDark.onAccent, [15, 0.04, 50]],
  ['--color-focus', bloomDark.focus, [82, 0.18, 55]],
  ['--color-error', bloomDark.danger, [70, 0.22, 25]],
  ['--color-success', bloomDark.ok, [74, 0.16, 145]],
  ['--color-accent-soft', bloomDark.decor!.accentSoft, [74, 0.06, 55]],
  ['--color-bloom-1', bloomDark.decor!.bloom1, [74, 0.22, 50]],
  ['--color-bloom-2', bloomDark.decor!.bloom2, [60, 0.22, 15]],
  // The Light derivations design.md quotes in oklch.
  ['Light primary', bloomLight.accent, [55, 0.13, 55]],
  ['Light paper', bloomLight.ground, [97.5, 0.006, 70]],
  ['Light focus', bloomLight.focus, [62, 0.15, 55]],
  ['Light muted ink', bloomLight.ink3, [52.9, 0.015, 48]],
  ['Light secondary', bloomLight.secondary, [38, 0.12, 15]],
  ['Light warning', bloomLight.warn, [44, 0.09, 70]],
  ['Light chart slot 4', bloomLight.chart[3], [60, 0.13, 140]],
];

describe('Bloom hex values are the conversions of their oklch sources', () => {
  for (const [token, hex, [l, c, h]] of OKLCH) {
    test(token, () => {
      const converted = oklchToHex(l, c, h);
      expect({ token, hex: sameColour(hex, converted, 1) ? converted : hex }).toEqual({ token, hex: converted });
    });
  }
});

// ── design.md says the same thing ──────────────────────────────────────────

const DESIGN = readFileSync(join(import.meta.dir, '../../../../design.md'), 'utf8');

describe("design.md's theme tables match the pack", () => {
  const SLOT_ROLE: Record<string, ColourRole> = {
    primary: 'accent', secondary: 'secondary', error: 'danger', success: 'ok', warning: 'warn', info: 'info',
  };
  for (const [slot, role] of Object.entries(SLOT_ROLE)) {
    test(`semantic slot ${slot}`, () => {
      const row = DESIGN.split('\n').find((line) => line.startsWith(`| ${slot} |`));
      expect(row).toBeDefined();
      const hexes = [...row!.matchAll(/`(#[0-9a-f]{6})`/gi)].map((m) => m[1].toLowerCase());
      // Columns: dark | light | Pattadar Gold | High Contrast.
      expect(hexes).toEqual([bloomDark[role], bloomLight[role], pattadarGold[role], highContrast[role]]);
    });
  }

  const TOKEN_ROLE: Record<string, string> = {
    '--color-paper': bloomDark.ground, '--color-paper-2': bloomDark.surface, '--color-paper-3': bloomDark.raised,
    '--color-ink': bloomDark.ink, '--color-ink-2': bloomDark.ink2, '--color-ink-3': bloomDark.ink3,
    '--color-rule': bloomDark.line, '--color-rule-strong': bloomDark.lineStrong, '--color-accent': bloomDark.accent,
    '--color-accent-2': bloomDark.secondary, '--color-accent-ink': bloomDark.onAccent, '--color-focus': bloomDark.focus,
    '--color-error': bloomDark.danger, '--color-success': bloomDark.ok,
  };
  for (const [token, hex] of Object.entries(TOKEN_ROLE)) {
    test(`dark ${token}`, () => {
      const line = DESIGN.split('\n').find((l) => l.startsWith(`- \`${token}\` `));
      expect(line).toBeDefined();
      expect(line!.match(/≈ (#[0-9a-f]{6})/i)?.[1].toLowerCase()).toBe(hex);
    });
  }
});

// ── The registry ───────────────────────────────────────────────────────────

describe('registry', () => {
  test('ids are unique and every scheme is complete in shape', () => {
    const ids = schemes.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of schemes) {
      for (const role of COLOUR_ROLES) expect(typeof s.palette[role]).toBe('string');
    }
  });

  test('the menu offers Light, Dark, Pattadar Gold and High Contrast, in that order', () => {
    expect(menuSchemes().map((s) => s.label)).toEqual(['Light', 'Dark', 'Pattadar Gold', 'High Contrast']);
  });

  test('defaults and the print scheme name registered schemes', () => {
    expect(isSchemeId(registry.defaults.web)).toBe(true);
    expect(isSchemeId(registry.defaults.university)).toBe(true);
    expect(registry.defaults.android === 'system' || isSchemeId(registry.defaults.android)).toBe(true);
    expect(registry.defaults).toEqual({ web: 'dark', university: 'light', android: 'system' });
    expect(schemeById(registry.print as SchemeId).mode).toBe('light');
  });

  test('High Contrast is held to AAA, the rest to AA', () => {
    expect(Object.fromEntries(schemes.map((s) => [s.id, s.textLevel]))).toEqual({
      light: 'AA', dark: 'AA', pattadar: 'AA', highContrast: 'AAA',
    });
  });

  test('isSchemeId refuses what is not registered', () => {
    expect(isSchemeId('pattadar-blue')).toBe(false);
    expect(isSchemeId(undefined)).toBe(false);
    expect(() => schemeById('nope' as SchemeId)).toThrow();
  });
});

// ── Pattadar Gold ──────────────────────────────────────────────────────────

/** An sRGB hex colour's oklch hue, in degrees. */
function hueOf(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const [r, g, b] = ch;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
}

describe('Pattadar Gold', () => {
  test('keeps the appearance study\'s anchors', () => {
    expect({
      ground: pattadarGold.ground, surface: pattadarGold.surface, raised: pattadarGold.raised, line: pattadarGold.line,
      ink: pattadarGold.ink, ink3: pattadarGold.ink3, accent: pattadarGold.accent, onAccent: pattadarGold.onAccent,
      accentWash: pattadarGold.accentWash,
    }).toEqual({
      ground: '#eceeeb', surface: '#fffefa', raised: '#f3f4f0', line: '#c5cbc2',
      ink: '#222923', ink3: '#536058', accent: '#75510b', onAccent: '#ffffff',
      accentWash: '#f8edcf',
    });
  });

  test('draws a charcoal header with a 2px gold rule', () => {
    const c = pattadarGold.chrome;
    expect({ bg: c.bg, ink: c.ink, accent: c.accent, rule: c.rule, ruleWidth: c.ruleWidth })
      .toEqual({ bg: '#202521', ink: '#fafaf4', accent: '#d9bf72', rule: '#d4b663', ruleWidth: '2px' });
  });

  test('holds warning off the gold hue, and apart from danger', () => {
    const gap = (a: string, b: string) => Math.abs(hueOf(a) - hueOf(b));
    expect(gap(pattadarGold.accent, pattadarGold.warn)).toBeGreaterThanOrEqual(20);
    expect(gap(pattadarGold.warn, pattadarGold.danger)).toBeGreaterThanOrEqual(20);
  });

  test('status good/warning/critical are its own ok/warn/danger', () => {
    expect(sameColour(pattadarGold.status.good, pattadarGold.ok)).toBe(true);
    expect(sameColour(pattadarGold.status.warning, pattadarGold.warn)).toBe(true);
    expect(sameColour(pattadarGold.status.critical, pattadarGold.danger)).toBe(true);
  });

  test('is a light scheme the menu offers third, never a default', () => {
    const entry = schemeById('pattadar');
    expect({ mode: entry.mode, label: entry.label, icon: entry.icon, menu: entry.menu, textLevel: entry.textLevel })
      .toEqual({ mode: 'light', label: 'Pattadar Gold', icon: 'gold', menu: true, textLevel: 'AA' });
    expect(Object.values(registry.defaults)).not.toContain('pattadar');
  });
});
