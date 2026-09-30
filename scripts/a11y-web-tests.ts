/**
 * apps/web accessibility and Material-3 conformance — the gate that went
 * missing. `bun run scripts/a11y-web-tests.ts`.
 *
 * Discovered automatically by the `scripts/*-tests.ts` loop in
 * .github/workflows/ci.yml and nightly.yml.
 *
 * Why this exists: design.md:7 makes Google Material 3 the interaction,
 * accessibility, layout, shape and motion authority for this product, and
 * design.md's "Design authority" section makes accessibility an OUTCOME
 * requirement rather than a quality default. Nothing measured it. The only doc
 * that wrote the gates down — docs/specs/2026-07-26-ux-redesign-m3.md:51 — is
 * marked historical, and the Playwright suite that enforced them (tests/e2e-ux)
 * was retired on 2026-09-16. scripts/ux-guards.ts has 173 checks, but 77 of them
 * point at apps/mobile and its 8 web checks are all tab layout and scroll
 * ownership. So between 2026-09-16 and today, every accessible-name, palette and
 * colour-token rule in design.md was enforced by review alone.
 *
 * What this can and cannot do. These are static checks over source: they prove
 * the source obeys rules that are checkable without a browser. Contrast ratios
 * here are computed from the theme source, the way scripts/contrast-tests.ts
 * does for mobile — not sampled from a rendered page. Target size, focus order,
 * reading order, zoom reflow and screen-reader output are NOT covered and need
 * a browser; that gap is real and is reported rather than papered over.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const WEB = join(ROOT, 'apps/web/src');
const read = (p: string) => readFileSync(p, 'utf8');
const rel = (p: string) => relative(ROOT, p);

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) {
    failures += 1;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** See scripts/provenance-tests.ts for why this is a scanner and not a regex. */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && n === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      out += c;
      i += 1;
      while (i < src.length) {
        if (src[i] === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
        out += src[i];
        if (src[i] === q) { i += 1; break; }
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function walk(dir: string, match: RegExp, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, match, out);
    else if (match.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/**
 * The opening tag of `<Name`, ending at the `>` that actually closes it.
 *
 * Written as a brace-and-quote walk because the obvious `<IconButton[^>]*>`
 * is wrong in a way that reads as a pass: `onClick={(e) => setAnchor(...)}`
 * supplies a `>` inside the tag, so the match ends at the arrow and every
 * attribute after it — including the aria-label — is invisible to the check.
 * That regex reported one unnamed icon button in this tree. There are none;
 * the one it named has carried `aria-label="Account menu"` all along.
 */
function openingTags(src: string, name: string): string[] {
  const tags: string[] = [];
  const needle = `<${name}`;
  let at = src.indexOf(needle);
  while (at !== -1) {
    // `<IconButtonish` is a different component.
    if (/[A-Za-z0-9_]/.test(src[at + needle.length] ?? '')) {
      at = src.indexOf(needle, at + needle.length);
      continue;
    }
    let i = at + needle.length;
    let depth = 0;
    let quote = '';
    while (i < src.length) {
      const c = src[i];
      if (quote) {
        if (c === '\\') i += 1;
        else if (c === quote) quote = '';
      } else if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (c === '>' && depth === 0) break;
      i += 1;
    }
    tags.push(src.slice(at, i + 1));
    at = src.indexOf(needle, i);
  }
  return tags;
}

const TSX = walk(WEB, /\.tsx$/);
const TS_AND_TSX = walk(WEB, /\.tsx?$/);

// ── 1 · every icon-only control has an accessible name ─────────────────────
//
// From the retired gate (ux-redesign-m3.md:51) and apps/ios/design.md:122-137,
// which is the only per-platform accessibility floor the repo ever wrote down.
// An icon with no name is a button a screen reader announces as "button".

for (const component of ['IconButton', 'Fab'] as const) {
  const unnamed: string[] = [];
  let total = 0;
  for (const f of TSX) {
    for (const tag of openingTags(read(f), component)) {
      total += 1;
      if (!/aria-label|aria-labelledby|title=/.test(tag)) {
        unnamed.push(`${rel(f)}: ${tag.replace(/\s+/g, ' ').slice(0, 70)}`);
      }
    }
  }
  check(
    `A11Y-1 every <${component}> in apps/web carries an accessible name (${total} found)`,
    unnamed.length === 0,
    unnamed.slice(0, 5).join(' | '),
  );
}

// A ToggleButton is named by its `value` when it sits in a labelled group, so
// the rule is one of the three names OR a value plus a group that is labelled.
const toggleUnnamed: string[] = [];
for (const f of TSX) {
  for (const tag of openingTags(read(f), 'ToggleButton')) {
    if (!/aria-label|aria-labelledby|title=|value=/.test(tag)) toggleUnnamed.push(rel(f));
  }
}
check(
  'A11Y-2 every <ToggleButton> is named or carries a value',
  toggleUnnamed.length === 0,
  toggleUnnamed.slice(0, 5).join(', '),
);

// ── 2 · all six semantic palette slots, on all three schemes ───────────────
//
// design.md's own table, and the bug behind it: "MUI does not disable an
// undefined palette slot; it substitutes its factory default. `warning`, `info`
// and `secondary` were once undefined while being used 22 times, so unrelated
// default blue and purple reached the amber system." Nothing has checked since.

const theme = stripComments(read(join(WEB, 'theme.ts')));
/** Light and Dark are `colorSchemes` entries; High Contrast is built through a
 *  separate `createTheme` call and exposed as the `highContrast` flag. */
const SCHEMES = ['light', 'dark', 'highContrast'];
const SLOTS = ['primary', 'secondary', 'error', 'success', 'warning', 'info'] as const;

for (const slot of SLOTS) {
  const defined = [...theme.matchAll(new RegExp(`\\b${slot}:\\s*\\{`, 'g'))].length;
  check(
    `M3-1 palette slot '${slot}' is defined on all three schemes`,
    defined >= SCHEMES.length,
    `found ${defined} definition(s), expected at least ${SCHEMES.length} — an undefined slot silently becomes MUI's factory blue or purple`,
  );
}

check(
  'M3-2 the three schemes are all still named in the theme',
  /colorSchemes/.test(theme) && SCHEMES.every((s) => new RegExp(`\\b${s}\\b`).test(theme)),
  'Light, Dark and High Contrast are user-switchable schemes, not a mode flag',
);

// ── 3 · colour literals stay inside the documented exceptions ──────────────
//
// design.md "No colour literals in app code" plus its named exceptions. This is
// a ratchet, not a cleanup: each file below is allowed the number of literals it
// has today and not one more, and a file that is not on the list is allowed
// none. Comments are stripped first — several of these files describe the
// superseded systems they replaced, and a rule that counts a description of a
// removed hex as the hex itself teaches people to delete the explanation.
//
// Raising a number here means either a new exception (say why at the call site
// AND in design.md) or a token that should have been used.

const LITERAL_BUDGET: Record<string, number> = {
  // The canonical MUI mapping. design.md § Exports names this file as where
  // palette values live, so it is the source, not an exception.
  'apps/web/src/theme.ts': 61,
  // Leaflet paints onto a canvas over map imagery and cannot resolve a CSS var.
  'apps/web/src/components/GeoMap.tsx': 15,
  'apps/web/src/w360/VillageCanvas.tsx': 11,
  'apps/web/src/w360/MapCanvas.tsx': 4,
  // SVG sketch strokes over imagery.
  'apps/web/src/components/FmbMapViewer.tsx': 3,
  // The avatar ramp that replaced the 14-colour Ant Design rainbow.
  'apps/web/src/lib/format.ts': 12,
  // Scrims and controls over arbitrary user media: neutral black/white only.
  'apps/web/src/components/FileViewer.tsx': 7,
  'apps/web/src/components/holdingCards.tsx': 5,
  'apps/web/src/pages/detail/common.tsx': 1,
  // Renders when the theme provider or the stylesheet is the thing that failed.
  'apps/web/src/components/ErrorBoundary.tsx': 6,
  // A printed certificate is ink on paper, not a themed surface.
  'apps/web/src/pages/TrainingCertificatePage.tsx': 4,
};

const COLOUR_LITERAL = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|rgba?\(\s*\d/g;
const overBudget: string[] = [];
const unlisted: string[] = [];

for (const f of TS_AND_TSX) {
  const key = rel(f);
  const found = [...stripComments(read(f)).matchAll(COLOUR_LITERAL)].length;
  if (found === 0) continue;
  const budget = LITERAL_BUDGET[key];
  if (budget === undefined) unlisted.push(`${key} (${found})`);
  else if (found > budget) overBudget.push(`${key}: ${found} > ${budget}`);
}

check(
  'M3-3 no new file introduces colour literals',
  unlisted.length === 0,
  unlisted.length
    ? `${unlisted.join(', ')} — resolve through palette.*, a --mui-palette-* var, or color-mix(); if it genuinely cannot, say why at the call site and add it to design.md's exception list and to LITERAL_BUDGET here`
    : '',
);
check(
  'M3-4 no exception file grows new colour literals',
  overBudget.length === 0,
  overBudget.join(', '),
);

// A literal is only ever allowed because somebody wrote down why. Every
// exception file must still carry that reasoning; design.md warns that a stale
// or absent comment is how the next redesign inherits a dead system.
for (const key of Object.keys(LITERAL_BUDGET)) {
  if (key === 'apps/web/src/theme.ts') continue;
  const src = read(join(ROOT, key));
  check(
    `M3-5 ${key} explains its colour literals`,
    /\/\*|\/\//.test(src) && /(token|palette|var\(|literal|Bloom|scrim|canvas|imagery|theme)/i.test(src),
    'an unexplained literal is indistinguishable from drift',
  );
}

// ── 4 · CSS custom properties resolve to something ─────────────────────────
//
// `var(--muted, #6b7280)` shipped in the Web360 cost panel: `--muted` has never
// been declared anywhere in this repo, so that cell always rendered its
// fallback — one cool grey in all three schemes, in a warm system, where High
// Contrast owes secondary text #171717. A var that never resolves is a colour
// literal wearing a token's clothes.

const cssFiles = walk(WEB, /\.css$/);
const declared = new Set<string>();
for (const f of [...cssFiles, ...TS_AND_TSX]) {
  for (const m of read(f).matchAll(/(--[a-zA-Z][\w-]*)\s*:/g)) declared.add(m[1]);
}
const unresolved = new Set<string>();
for (const f of TS_AND_TSX) {
  for (const m of stripComments(read(f)).matchAll(/var\(\s*(--[a-zA-Z][\w-]*)/g)) {
    // `--mui-palette-*` is emitted by MUI's CSS-variables theme at runtime and
    // is never declared in this repo. Anything else has to exist here.
    if (m[1].startsWith('--mui-')) continue;
    if (!declared.has(m[1])) unresolved.add(`${m[1]} (${rel(f)})`);
  }
}
check(
  'M3-6 every var(--token) used in apps/web resolves to a declaration',
  unresolved.size === 0,
  [...unresolved].slice(0, 6).join(', '),
);

console.log(failures === 0 ? 'A11Y WEB TESTS PASS' : `A11Y WEB TESTS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
