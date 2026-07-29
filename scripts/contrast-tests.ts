/**
 * Text contrast — `bun run scripts/contrast-tests.ts`.
 *
 * Secondary text was #8E8E93 in both themes: 2.60:1 on light surfaceVariant,
 * far under AA. It passed in dark mode, so a dark-configured test device never
 * showed it. Ratios are computed from the theme source, not eyeballed.
 *
 * The palette is read as text rather than imported — importing the theme pulls
 * in react-native, which does not parse outside the bundler.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(import.meta.dir, '../apps/mobile/src/theme/paper.ts'), 'utf8');

/** The two `colors: { … }` blocks, in file order: light then dark. */
function palettes(): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const re = /colors:\s*\{([\s\S]*?)\n  \},/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const block = m[1];
    const p: Record<string, string> = {};
    for (const line of block.split('\n')) {
      const kv = line.match(/(\w+):\s*'(#[0-9A-Fa-f]{6})'/);
      if (kv) p[kv[1]] = kv[2];
    }
    if (Object.keys(p).length) out.push(p);
  }
  return out;
}

const luminance = (hex: string) => {
  const h = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = ch.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const AA = 4.5;
let failures = 0;
const check = (name: string, got: number) => {
  if (got < AA) {
    failures += 1;
    console.error(`FAIL: ${name} — ${got.toFixed(2)}:1, needs ${AA}:1`);
  }
};

const themes = palettes();
if (themes.length < 2) {
  console.error('FAIL: could not read both palettes from paper.ts');
  process.exit(1);
}
for (const [i, c] of themes.entries()) {
  const label = i === 0 ? 'light' : 'dark';
  for (const bg of ['background', 'surface', 'surfaceVariant'] as const) {
    if (!c[bg] || !c.onSurfaceVariant) continue;
    check(`${label}: secondary text on ${bg}`, ratio(c.onSurfaceVariant, c[bg]));
  }
  // Button labels are bold 14pt+, which WCAG treats as large text at 3:1 —
  // not the 4.5:1 body-text threshold. White on iOS System Blue is 4.02:1 and
  // is Apple's own default; darkening the brand to chase a threshold that does
  // not apply would be worse, not better.
  if (c.onPrimary && c.primary) {
    const r = ratio(c.onPrimary, c.primary);
    if (r < 3) {
      failures += 1;
      console.error(`FAIL: ${label}: button label on primary — ${r.toFixed(2)}:1, needs 3:1 for large text`);
    }
  }
}

console.log(failures === 0 ? 'CONTRAST TESTS PASS' : `CONTRAST TESTS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
