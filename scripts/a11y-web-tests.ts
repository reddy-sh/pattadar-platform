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

import { registry, type SchemePalette } from '../packages/tokens/src';
import { theme as webTheme } from '../apps/web/src/theme';
import { theme as universityTheme } from '../apps/university/src/theme';

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

// The theme is built from the palette pack, so these read the BUILT theme —
// what MUI will actually paint — rather than the text of theme.ts, which no
// longer spells a single slot. Every registered scheme must reach MUI with all
// six slots, each one the pack's colour and not a factory default.
const SLOT_ROLE = {
  primary: 'accent', secondary: 'secondary', error: 'danger', success: 'ok', warning: 'warn', info: 'info',
} as const satisfies Record<string, keyof SchemePalette>;

const built = webTheme as unknown as {
  colorSchemeSelector?: string;
  defaultColorScheme?: string;
  colorSchemes: Record<string, { palette: Record<string, { main?: string }> } | undefined>;
};

for (const [slot, role] of Object.entries(SLOT_ROLE)) {
  const missing = registry.schemes
    .filter((s) => built.colorSchemes[s.id]?.palette[slot]?.main?.toLowerCase() !== s.palette[role].toLowerCase())
    .map((s) => `${s.id}: ${built.colorSchemes[s.id]?.palette[slot]?.main ?? 'undefined'} (pack ${s.palette[role]})`);
  check(
    `M3-1 palette slot '${slot}' is the pack's ${role} on every scheme`,
    missing.length === 0,
    `${missing.join('; ')} — an undefined slot silently becomes MUI's factory blue or purple`,
  );
}

const registered = registry.schemes.map((s) => s.id).sort();
check(
  'M3-2 the theme carries every registered scheme, keyed on data-scheme, Dark by default',
  built.colorSchemeSelector === 'data-scheme' &&
    built.defaultColorScheme === registry.defaults.web &&
    JSON.stringify(Object.keys(built.colorSchemes).sort()) === JSON.stringify(registered),
  `selector ${built.colorSchemeSelector}, default ${built.defaultColorScheme}, schemes ${Object.keys(built.colorSchemes).join(', ')} — Light, Dark and High Contrast are user-switchable schemes, not a mode flag`,
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
  // apps/web/src/theme.ts is not here: every scheme, and since 03/10/2026 the
  // High Contrast focus ring too, comes from @pattadar/tokens.
  //
  // Leaflet paints onto a canvas over map imagery and cannot resolve a CSS var.
  // The selection and hover colours are read off the tokens when drawn; what
  // is counted is the magnitude ramp, the edges and the mesh, which are
  // measured against the imagery rather than the page, and the fallbacks for a
  // page with no scheme yet.
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
//
// Stylesheets are held to it as well as TS/TSX: W360's colour slots are aliases
// of MUI's variables, so a `--mui-*` name is no longer exempt — it is checked
// against what the built theme emits. An alias of a palette variable must be
// emitted in every registered scheme: one missing from a scheme does not fail
// to resolve there, it silently shows Dark's value from the root.

/** A stylesheet's comments are block comments only — `//` is a URL there. */
const stripCssComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '');

const cssFiles = walk(WEB, /\.css$/);
const declared = new Set<string>();
for (const f of cssFiles) {
  for (const m of stripCssComments(read(f)).matchAll(/(--[a-zA-Z][\w-]*)\s*:/g)) declared.add(m[1]);
}
for (const f of TS_AND_TSX) {
  const src = read(f);
  for (const m of src.matchAll(/(--[a-zA-Z][\w-]*)\s*:/g)) declared.add(m[1]);
  // A style object's quoted key, and a property set from script
  // (`el.style.setProperty('--ox', …)`, the map labels' nudge).
  for (const m of src.matchAll(/['"`](--[a-zA-Z][\w-]*)['"`]\s*:/g)) declared.add(m[1]);
  for (const m of src.matchAll(/setProperty\(\s*['"`](--[a-zA-Z][\w-]*)/g)) declared.add(m[1]);
}

const registeredIds = registry.schemes.map((s) => s.id as string);

/** Every `--mui-*` variable a built theme emits, and which schemes emit it. */
function emittedBy(theme: unknown): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const sheets = (theme as {
    generateStyleSheets: () => Array<Record<string, Record<string, unknown>>>;
  }).generateStyleSheets();
  for (const sheet of sheets) {
    for (const [selector, decls] of Object.entries(sheet)) {
      const ids = registeredIds.filter((id) => selector.includes(`[data-scheme="${id}"]`));
      // The root's own variables (shape, spacing, z-index …) hold in every scheme.
      const holds = ids.length ? ids : selector.includes(':root') ? registeredIds : [];
      for (const name of Object.keys(decls)) {
        if (!name.startsWith('--mui-')) continue;
        const set = out.get(name) ?? new Set<string>();
        for (const id of holds) set.add(id);
        out.set(name, set);
      }
    }
  }
  return out;
}
const muiEmitted = emittedBy(webTheme);
check('M3-6 the built theme emits its CSS variables', muiEmitted.size > 0, 'generateStyleSheets() returned none — the check below would prove nothing');

const unresolved = new Set<string>();
const sources: Array<[string, string]> = [
  ...TS_AND_TSX.map((f) => [f, stripComments(read(f))] as [string, string]),
  ...cssFiles.map((f) => [f, stripCssComments(read(f))] as [string, string]),
];
for (const [f, src] of sources) {
  for (const m of src.matchAll(/var\(\s*(--[a-zA-Z][\w-]*)/g)) {
    const name = m[1];
    // `var(--mui-palette-${slot})` names its variable at run time; there is
    // nothing here to check it against.
    if (src.startsWith('${', (m.index ?? 0) + m[0].length)) continue;
    const ok = name.startsWith('--mui-') ? muiEmitted.has(name) : declared.has(name);
    if (!ok) unresolved.add(`${name} (${rel(f)})`);
  }
}
check(
  'M3-6 every var(--token) used in apps/web resolves to a declaration',
  unresolved.size === 0,
  [...unresolved].slice(0, 6).join(', '),
);

// The marketing wrapper is the one place that pins a scheme: every `.site`
// wears data-scheme="dark" (checked below), so its aliases only have to
// resolve in Dark. Anything else follows the reader's choice.
const PINNED: Record<string, string> = { '.site': 'dark' };
const partial: string[] = [];
for (const f of cssFiles) {
  const css = stripCssComments(read(f));
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1].trim().replace(/\s+/g, ' ');
    const needed = PINNED[selector] ? [PINNED[selector]] : registeredIds;
    for (const m of rule[2].matchAll(/(--[a-zA-Z][\w-]*)\s*:\s*var\(\s*(--mui-palette-[\w-]+)\s*\)/g)) {
      const missing = needed.filter((id) => !muiEmitted.get(m[2])?.has(id));
      if (missing.length) partial.push(`${m[1]} → ${m[2]} missing in ${missing.join(', ')} (${rel(f)} ${selector})`);
    }
  }
}
check(
  'M3-6 every alias of a palette variable resolves in every scheme it can be read in',
  partial.length === 0,
  partial.slice(0, 6).join('; '),
);

const unpinned: string[] = [];
for (const f of TS_AND_TSX) {
  for (const tag of openingTags(stripComments(read(f)), 'div')) {
    const cls = /className="([^"]*)"/.exec(tag)?.[1].split(/\s+/) ?? [];
    if (cls.includes('site') && !/data-scheme="dark"/.test(tag)) unpinned.push(rel(f));
  }
}
check(
  'M3-6 every marketing wrapper (.site) wears data-scheme="dark"',
  unpinned.length === 0,
  `${unpinned.join(', ')} — its --color-* aliases would follow the app's scheme, and the ambient blooms exist in Dark only`,
);

// The `--color-*` aliases exist inside `.site` and nowhere else, so only the
// marketing pages may read them. Declared at all, they pass the check above
// wherever they are read; FileViewer read them from the signed-in app until
// 03/10/2026, when they still sat on :root.
const MARKETING = /^apps\/web\/src\/(pages\/(landing|pricing|auth|legal)\/|pages\/(InvitePage|ActivePage)\.tsx$|styles\/site\.css$)/;
const outside = sources
  .filter(([f, src]) => /var\(\s*--color-/.test(src) && !MARKETING.test(rel(f)))
  .map(([f]) => rel(f));
check(
  'M3-6 only the marketing pages read the marketing --color-* aliases',
  outside.length === 0,
  `${outside.join(', ')} — outside .site they resolve to nothing; use --mui-palette-* (or --w-* inside W360)`,
);

// ── 5 · University reads the same schemes ──────────────────────────────────
//
// apps/university draws with its own stylesheet, not with MUI components: its
// `--color-*` names (apps/university/tokens.css, and the header's own in
// src/styles.css) are aliases of the variables its MUI theme emits
// (apps/university/src/theme.ts). Every name it reads must be declared, and
// every palette variable it reads must be emitted in every scheme — one a
// scheme lacks shows the root's Light value there, silently.

const UNIVERSITY = join(ROOT, 'apps/university');
const uniEmitted = emittedBy(universityTheme);
const uniCss = [join(UNIVERSITY, 'tokens.css'), ...walk(join(UNIVERSITY, 'src'), /\.css$/)];
const uniCode = walk(join(UNIVERSITY, 'src'), /\.tsx?$/);
const uniDeclared = new Set<string>();
for (const f of uniCss) {
  for (const m of stripCssComments(read(f)).matchAll(/(--[a-zA-Z][\w-]*)\s*:/g)) uniDeclared.add(m[1]);
}
for (const f of uniCode) {
  const src = read(f);
  for (const m of src.matchAll(/['"`](--[a-zA-Z][\w-]*)['"`]\s*:/g)) uniDeclared.add(m[1]);
  for (const m of src.matchAll(/setProperty\(\s*['"`](--[a-zA-Z][\w-]*)/g)) uniDeclared.add(m[1]);
}
const uniUnresolved = new Set<string>();
for (const [f, src] of [
  ...uniCss.map((f) => [f, stripCssComments(read(f))] as [string, string]),
  ...uniCode.map((f) => [f, stripComments(read(f))] as [string, string]),
]) {
  for (const m of src.matchAll(/var\(\s*(--[a-zA-Z][\w-]*)/g)) {
    if (src.startsWith('${', (m.index ?? 0) + m[0].length)) continue;
    const ok = m[1].startsWith('--mui-') ? uniEmitted.has(m[1]) : uniDeclared.has(m[1]);
    if (!ok) uniUnresolved.add(`${m[1]} (${rel(f)})`);
  }
}
check(
  'M3-7 every var(--token) used in apps/university resolves to a declaration',
  uniUnresolved.size === 0,
  [...uniUnresolved].slice(0, 6).join(', '),
);

const uniPartial = new Set<string>();
for (const f of uniCss) {
  for (const m of stripCssComments(read(f)).matchAll(/var\(\s*(--mui-palette-[\w-]+)/g)) {
    const missing = registeredIds.filter((id) => !uniEmitted.get(m[1])?.has(id));
    if (missing.length) uniPartial.add(`${m[1]} missing in ${missing.join(', ')} (${rel(f)})`);
  }
}
check(
  'M3-7 every palette variable apps/university reads is emitted in every scheme',
  uniPartial.size === 0,
  [...uniPartial].slice(0, 6).join('; '),
);

const uniLiterals = [...stripCssComments(read(join(UNIVERSITY, 'tokens.css')))
  .matchAll(/(?:oklch|oklab|rgba?|hsla?)\(|#[0-9a-fA-F]{3,8}\b/g)].length;
check(
  'M3-7 apps/university/tokens.css declares no colour of its own',
  uniLiterals === 0,
  `${uniLiterals} colour literal(s) — every colour there is an alias of the palette pack's`,
);

console.log(failures === 0 ? 'A11Y WEB TESTS PASS' : `A11Y WEB TESTS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
