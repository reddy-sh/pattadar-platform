/**
 * Every colour scheme, measured — `bun run scripts/palette-tests.ts`.
 *
 * Discovered automatically by the `scripts/*-tests.ts` loop in
 * .github/workflows/ci.yml and nightly.yml.
 *
 * The palette pack (packages/tokens/src/palette) is where every colour the
 * apps paint comes from. This holds each registered scheme to the role
 * contract (every role present and parseable) and to WCAG contrast
 * (packages/tokens/src/palette/gate.ts: 4.5:1 text, 7:1 body text where a
 * scheme is AAA, 3:1 focus rings and chart series), then prints the report a
 * reviewer reads before accepting a palette.
 *
 * KNOWN_FAILURES is a ratchet: a pair may stay below its floor only while it
 * is listed here with its reason, and a listed pair that starts passing fails
 * this script until its entry is deleted. The list can only shrink.
 *
 * It also holds each app's generated theme-init.js, and the tag that loads it,
 * to what scripts/emit-theme-init.ts would write from the pack today (PT-4).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  evaluatePalette,
  menuSchemes,
  missingRoles,
  pageChrome,
  registry,
  schemes,
  type PairResult,
  type SchemePalette,
} from '../packages/tokens/src';
import { expectedFiles, ROOT } from './lib/theme-init';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) {
    failures += 1;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

interface Known {
  scheme: string;
  pair: string;
  reason: string;
}

// Empty since 03/10/2026, when the muted ink of TODO-one-platform #17 was
// nudged to clear 4.5:1 on the page and on cards in Dark and Light. It held
// that ink's four pairs until then.
const KNOWN_FAILURES: Known[] = [];

// ── Self-test: a gate that cannot fail proves nothing ──────────────────────

{
  const base = {
    ground: '#ffffff', surface: '#ffffff', ink: '#000000', ink3: '#444444', accent: '#003b73', line: '#000000', focus: '#000000',
    raised: '#f2f2f2', lineStrong: '#000000', ink2: '#222222',
    onAccent: '#ffffff', accentWash: '#d9ecff', onAccentWash: '#001c38',
  };
  const good: SchemePalette = {
    ...base,
    secondary: '#5a1a78', onSecondary: '#ffffff', secondaryWash: '#f4ddff', onSecondaryWash: '#2c003e',
    danger: '#a40000', onDanger: '#ffffff', dangerWash: '#ffe0e0',
    ok: '#006b3c', onOk: '#ffffff', warn: '#6b4f00', onWarn: '#ffffff', info: '#004f6b', onInfo: '#ffffff',
    focusHalo: '#ffffff',
    chrome: pageChrome(base),
    chart: ['#003b73', '#006c72', '#97182f', '#387d3d', '#793887', '#426a8c'],
    status: { good: '#006b3c', warning: '#6b4f00', serious: '#a82700', critical: '#a40000' },
  };
  const bad: SchemePalette = { ...good, ink2: '#b0b0b0', focus: '#ffe8c8', chart: ['#eeeeee', ...good.chart.slice(1)] as unknown as SchemePalette['chart'] };
  const failed = (p: SchemePalette) => evaluatePalette(p).filter((r) => !r.ok).map((r) => r.pair);
  check('PT-0 the gate passes a palette that clears every rule', failed(good).length === 0, failed(good).join(', '));
  check(
    'PT-0 the gate fails pale ink, a swallowed focus ring and a faint chart series',
    ['ink2 on ground', 'focus on surface', 'chart[1] on surface'].every((p) => failed(bad).includes(p)),
    failed(bad).join(', '),
  );
  const broken = { ...good, accent: 'oklch(55% 0.13 55)', ink: undefined } as unknown as SchemePalette;
  check('PT-0 the role check catches a missing and an unparseable role', missingRoles(broken).length === 2, missingRoles(broken).join(', '));
}

// ── The registry ───────────────────────────────────────────────────────────

const ids = schemes.map((s) => s.id);
check('PT-3 at least Light, Dark and High Contrast are registered', ['light', 'dark', 'highContrast'].every((id) => ids.includes(id as never)), ids.join(', '));
check('PT-3 scheme ids are unique', new Set(ids).size === ids.length, ids.join(', '));
const orders = menuSchemes().map((s) => s.menuOrder);
check('PT-3 menu positions are unique', new Set(orders).size === orders.length, orders.join(', '));
check('PT-3 the web default is a registered scheme', ids.includes(registry.defaults.web), registry.defaults.web);
check('PT-3 the University default is a registered scheme', ids.includes(registry.defaults.university), registry.defaults.university);
check(
  "PT-3 Android's default is 'system' or a registered scheme",
  registry.defaults.android === 'system' || ids.includes(registry.defaults.android as never),
  registry.defaults.android,
);
const print = schemes.find((s) => s.id === registry.print);
check('PT-3 the print scheme is a registered light scheme', print?.mode === 'light', registry.print);
// Ids travel into storage keys, an HTML attribute and a CSS attribute
// selector; a plain identifier is safe in all three.
check('PT-3 scheme ids are plain identifiers', ids.every((id) => /^[a-z][A-Za-z0-9]*$/.test(id)), ids.join(', '));

// ── theme-init.js matches the pack ─────────────────────────────────────────
//
// The first-paint script is generated from the registry. A committed copy that
// has drifted paints the wrong ground before the app loads, or migrates into a
// scheme that no longer exists.
for (const { path, content } of expectedFiles()) {
  let now = '';
  try { now = readFileSync(join(ROOT, path), 'utf8'); } catch { /* missing */ }
  check(
    `PT-4 ${path} is what scripts/emit-theme-init.ts writes`,
    now === content,
    'run `bun run scripts/emit-theme-init.ts` and commit the result',
  );
}

// ── Every scheme: complete, and measured ───────────────────────────────────

/** Truncated, never rounded: 4.497:1 must not print as the 4.5:1 it fails. */
const ratio = (r: PairResult) => (Math.floor(r.ratio * 100) / 100).toFixed(2);
const fmt = (r: PairResult) => `${ratio(r).padStart(5)}:1 ${r.min ? `≥ ${r.min}`.padEnd(5) : 'info '} ${r.pair}`;

for (const s of schemes) {
  const missing = missingRoles(s.palette);
  check(`PT-1 ${s.id} defines every role`, missing.length === 0, missing.join(', '));

  const results = evaluatePalette(s.palette, s.textLevel);
  console.log(`\n${s.label} (${s.id}, ${s.mode}, text ${s.textLevel})`);
  for (const r of results) {
    const known = KNOWN_FAILURES.find((k) => k.scheme === s.id && k.pair === r.pair);
    const mark = r.ok ? (known ? '  STALE' : '') : known ? '  known' : '  FAIL';
    console.log(`  ${fmt(r)}${mark}`);
  }

  const unexpected = results.filter((r) => !r.ok && !KNOWN_FAILURES.some((k) => k.scheme === s.id && k.pair === r.pair));
  check(
    `PT-2 ${s.id} clears every contrast floor`,
    unexpected.length === 0,
    unexpected.map((r) => `${r.pair} ${ratio(r)}:1 < ${r.min}:1`).join('; '),
  );
}

for (const k of KNOWN_FAILURES) {
  const s = schemes.find((x) => x.id === k.scheme);
  const r = s && evaluatePalette(s.palette, s.textLevel).find((x) => x.pair === k.pair);
  check(
    `PT-2 known failure "${k.scheme}: ${k.pair}" still fails (delete the entry once it passes)`,
    !!r && !r.ok,
    r ? `${ratio(r)}:1 now clears ${r.min}:1` : 'no such scheme or pair',
  );
}

console.log(`\n${failures === 0 ? 'PALETTE TESTS PASS' : `PALETTE TESTS FAILED (${failures})`}`);
process.exit(failures === 0 ? 0 : 1);
