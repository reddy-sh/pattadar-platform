/**
 * One face, every surface — `bun run scripts/typography-tests.ts`.
 *
 * Discovered automatically by the `scripts/*-tests.ts` loop in
 * .github/workflows/ci.yml and nightly.yml.
 *
 * design.md § Typography (founder decision, 27/09/2026): Atkinson Hyperlegible
 * is the only face in apps/web and apps/university — weights 400 and 700 plus
 * 400 italic, one token (`--font-sans`) that the roots name and everything else
 * inherits. Until that decision the four-face system WAS the design, and no
 * check anywhere looked at a font family: the Area calculator's mono "1 ACRES ="
 * inside a sans card was correct by every rule that existed.
 *
 * This proves what the SOURCE declares. It cannot see what a browser draws —
 * the user-agent stylesheet's monospace for <textarea>/<code>/<kbd>/<pre>, or
 * third-party CSS such as Leaflet's Helvetica and Lucida Console — so
 * tests/e2e-app/specs/26-one-font.spec.ts reads the computed face of every
 * visible text node on the signed-in and public routes.
 *
 * Out of scope, and tracked in docs/specs/TODO-one-platform.md: native iOS,
 * Expo, and the jsPDF exports (`doc.setFont('helvetica')` is a PDF core font,
 * not CSS, and is not read here).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { lineAt, stripComments, stripCssComments, walk } from './lib/source-scan';

const ROOT = join(import.meta.dir, '..');
const abs = (p: string) => join(ROOT, p);
const read = (p: string) => readFileSync(abs(p), 'utf8');
const rel = (p: string) => relative(ROOT, p);

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) {
    failures += 1;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
/** How many offenders each failure lists; `TY_MAX=500` prints them all. */
const listed = (items: string[], max = Number(process.env.TY_MAX) || 25) =>
  `\n    ${items.slice(0, max).join('\n    ')}${items.length > max ? `\n    … and ${items.length - max} more` : ''}`;

// ── What design.md § Typography allows ──────────────────────────────────────

const FAMILY = 'Atkinson Hyperlegible';
const FONT_PACKAGE = '@fontsource/atkinson-hyperlegible';
/** What a stack may fall back to: generic keywords only, never a named face. */
const GENERIC = new Set(['system-ui', 'ui-sans-serif', 'sans-serif']);
/** The face ships 400 and 700. Any other weight is one the browser invents. */
const WEIGHT_OK = new Set(['400', '700', 'normal', 'bold', 'inherit']);
/** A `font-family` declaration inherits, or is a root naming the one token. */
const FAMILY_OK = new Set(['inherit', 'var(--font-sans)']);
/** A string that is a font stack, or a retired family name standing alone. */
const STACKISH =
  /\b(?:sans-serif|serif|monospace|ui-monospace|system-ui|cursive|fantasy)\b|^\s*["']?(?:JetBrains Mono|Inter Tight|Inter|Instrument Serif|Roboto|Menlo|Consolas|Courier(?: New)?|Georgia)["']?\s*$/;
const RETIRED_TOKEN = /var\(\s*--font-(?:display|body|mono|accent)\b/;

const TOKEN_FILES = ['apps/web/src/styles/tokens.css', 'apps/university/tokens.css'];
const THEME = 'apps/web/src/theme.ts';
const TOKENS_PKG = 'packages/tokens/src/index.ts';
const ENTRIES = ['apps/web/src/main.tsx', 'apps/university/src/main.tsx'];
const PACKAGES = ['apps/web/package.json', 'apps/university/package.json'];
const HTML = ['apps/web/index.html', 'apps/university/index.html'];
/** The rule at each root that names the face; everything under it inherits. */
const ROOTS: Array<[file: string, selector: string]> = [
  ['apps/web/src/w360/w360.css', '.w360'],
  ['apps/web/src/styles/site.css', '.site'],
  ['apps/web/src/pages/TrainingCertificatePage.css', '.certificatePage'],
  ['apps/university/src/styles.css', 'body'],
];

interface Problems { face: string[]; token: string[]; family: string[]; weight: string[]; stack: string[] }
const none = (): Problems => ({ face: [], token: [], family: [], weight: [], stack: [] });
const count = (p: Problems) => p.face.length + p.token.length + p.family.length + p.weight.length + p.stack.length;
const norm = (v: string) => v.trim().replace(/\s*!important$/, '').replace(/\s+/g, ' ');
const sameStack = (a: string, b: string) => norm(a).replace(/'/g, '"') === norm(b).replace(/'/g, '"');
const families = (stack: string) => stack.split(',').map((f) => f.trim().replace(/^["']|["']$/g, ''));

// ── Detectors ───────────────────────────────────────────────────────────────

function cssProblems(src: string, file: string): Problems {
  const s = stripCssComments(src);
  const at = (i: number) => `${file}:${lineAt(s, i)}`;
  const out = none();
  for (const m of s.matchAll(/@font-face\b/g)) out.face.push(`${at(m.index!)} declares its own @font-face`);
  for (const m of s.matchAll(/@import\s+(?:url\()?\s*['"]?([^'")\s;]+)/g)) {
    if (/fontsource|fonts\.(?:googleapis|gstatic)\.com|\.(?:woff2?|ttf|otf)\b/.test(m[1]) && !m[1].startsWith(FONT_PACKAGE)) {
      out.face.push(`${at(m.index!)} imports ${m[1]}`);
    }
  }
  for (const m of s.matchAll(/url\(\s*['"]?[^'")]*\.(?:woff2?|ttf|otf)\b/g)) out.face.push(`${at(m.index!)} loads a font file directly`);
  for (const m of s.matchAll(/(--[\w-]*font[\w-]*)\s*:/g)) {
    if (m[1] !== '--font-sans') out.token.push(`${at(m.index!)} declares ${m[1]} — the one font token is --font-sans`);
    else if (!TOKEN_FILES.includes(file)) out.token.push(`${at(m.index!)} redeclares --font-sans outside the token files`);
  }
  for (const m of s.matchAll(new RegExp(RETIRED_TOKEN.source, 'g'))) out.token.push(`${at(m.index!)} uses ${m[0]})`);
  for (const m of s.matchAll(/(?<![\w-])font-family\s*:\s*([^;}]+)/g)) {
    const v = norm(m[1]);
    if (!FAMILY_OK.has(v)) out.family.push(`${at(m.index!)} font-family: ${v}`);
  }
  for (const m of s.matchAll(/(?<![\w-])font\s*:\s*([^;}]+)/g)) {
    const v = norm(m[1]);
    if (v !== 'inherit' && !v.endsWith('var(--font-sans)')) out.family.push(`${at(m.index!)} font: ${v}`);
    if (v.split(/[\s/]+/).some((w) => /^\d{3}$/.test(w) && !WEIGHT_OK.has(w))) out.weight.push(`${at(m.index!)} font: ${v}`);
  }
  for (const m of s.matchAll(/(?<![\w-])font-weight\s*:\s*([^;}]+)/g)) {
    const v = norm(m[1]);
    if (!WEIGHT_OK.has(v)) out.weight.push(`${at(m.index!)} font-weight: ${v}`);
  }
  return out;
}

function tsProblems(src: string, file: string, canonical: string): Problems {
  const s = stripComments(src);
  const at = (i: number) => `${file}:${lineAt(s, i)}`;
  const out = none();
  const isTheme = file === THEME;
  for (const m of s.matchAll(/['"](@fontsource\/[^'"]+)['"]/g)) {
    if (m[1] !== FONT_PACKAGE && !m[1].startsWith(`${FONT_PACKAGE}/`)) out.face.push(`${at(m.index!)} imports ${m[1]}`);
  }
  for (const m of s.matchAll(/\bfontFamily\s*[:=]\s*([^,}\n]+)/g)) {
    const v = m[1].trim().replace(/^\{\s*/, '').replace(/\s*\}$/, '').replace(/^['"`]|['"`]$/g, '').trim();
    if (v === 'inherit' || (isTheme && v === 'FONT_SANS')) continue;
    out.family.push(`${at(m.index!)} fontFamily: ${m[1].trim()}`);
  }
  // CSS written inside a string: a print template, an SVG built as text.
  for (const m of s.matchAll(/(?<![\w-])font-family\s*:\s*([^;"'`}]+)/g)) {
    const v = norm(m[1]);
    if (!FAMILY_OK.has(v)) out.family.push(`${at(m.index!)} font-family: ${v}`);
  }
  for (const m of s.matchAll(/(?<![\w.-])font\s*:\s*(['"`])([^'"`]*)\1/g)) {
    const v = norm(m[2]);
    if (v !== 'inherit' && !v.endsWith('var(--font-sans)')) out.family.push(`${at(m.index!)} font: '${v}'`);
  }
  // A canvas cannot resolve a CSS variable, so it has to spell the face.
  for (const m of s.matchAll(/\.font\s*=\s*(['"`])([^'"`]*)\1/g)) {
    if (!m[2].includes(FAMILY)) out.family.push(`${at(m.index!)} canvas font '${m[2]}'`);
  }
  for (const m of s.matchAll(/\bfontWeight\s*[:=]\s*([^,}\n]+)/g)) {
    const v = m[1].trim();
    const numbers = [...v.matchAll(/\b(\d{3})\b/g)].map((n) => n[1]);
    const words = [...v.matchAll(/(['"])([^'"]+)\1/g)].map((q) => q[2]).filter((w) => !/^\d{3}$/.test(w));
    const bad =
      numbers.some((n) => !WEIGHT_OK.has(n)) ||
      words.some((w) => !WEIGHT_OK.has(w) && !/^fontWeight(?:Light|Regular|Medium|Bold)$/.test(w));
    if (bad) out.weight.push(`${at(m.index!)} fontWeight: ${v}`);
  }
  for (const m of s.matchAll(/\bfontWeight(?:Light|Regular|Medium|Bold)\s*:\s*(\d+)/g)) {
    if (!WEIGHT_OK.has(m[1])) out.weight.push(`${at(m.index!)} ${m[0]}`);
  }
  if (isTheme) {
    for (const m of s.matchAll(/\bheading\(\s*(\d+)/g)) if (!WEIGHT_OK.has(m[1])) out.weight.push(`${at(m.index!)} ${m[0]})`);
  }
  for (const m of s.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) {
    const text = m[2];
    const retired = text.match(RETIRED_TOKEN);
    if (retired) { out.token.push(`${at(m.index!)} uses ${retired[0]})`); continue; }
    // A package path ("…/instrument-serif/400.css") is TY-1's business.
    if (text.startsWith('@fontsource/') || !STACKISH.test(text)) continue;
    if ((isTheme || file === TOKENS_PKG) && sameStack(text, canonical)) continue;
    out.stack.push(`${at(m.index!)} spells a font stack: ${text}`);
  }
  return out;
}

function merge(into: Problems, from: Problems) {
  for (const k of Object.keys(into) as Array<keyof Problems>) into[k].push(...from[k]);
}

// ── Self-test: a detector that cannot fail proves nothing ──────────────────

{
  const bad = cssProblems(
    `.a { font-family: "JetBrains Mono", monospace; font-weight: 600; }
     .b { font: 500 1rem/1 var(--font-display); }
     :root { --font-mono: x; }
     @font-face { font-family: X; src: url(x.woff2); }`,
    'self-test.css',
  );
  check(
    'TY-0 the CSS detectors fire on a second face, a faked weight, a retired token and an @font-face',
    bad.family.length >= 3 && bad.weight.length >= 2 && bad.token.length >= 2 && bad.face.length >= 2,
    JSON.stringify(bad),
  );
  const good = cssProblems(
    `/* font-family: monospace; font-weight: 600 */
     .a { font-family: inherit; font-weight: 700; font: inherit; font-variant-numeric: tabular-nums; }
     .b { background: url(https://example.invalid/x.png); font-size: 1rem; font-feature-settings: "tnum"; }`,
    'self-test.css',
  );
  check('TY-0 the CSS detectors pass clean CSS and ignore comments', count(good) === 0, JSON.stringify(good));

  const canonical = `"${FAMILY}", system-ui, sans-serif`;
  const badTs = tsProblems(
    `import '@fontsource/inter-tight/700.css';
     const x = { fontFamily: 'monospace', fontWeight: 600, font: '12px Menlo' };
     const y = <text fontFamily="var(--font-mono)" fontWeight={500} />;
     ctx.font = '12px Arial';`,
    'self-test.tsx',
    canonical,
  );
  check(
    'TY-0 the TS detectors fire on a second face, a faked weight, a stack and a canvas font',
    badTs.face.length >= 1 && badTs.family.length >= 4 && badTs.weight.length >= 2 && badTs.stack.length >= 1 && badTs.token.length >= 1,
    JSON.stringify(badTs),
  );
  const goodTs = tsProblems(
    `// fontFamily: 'monospace', fontWeight: 600
     import '@fontsource/atkinson-hyperlegible/700.css';
     const y = { fontFamily: 'inherit', fontWeight: 700, font: 'inherit', fontVariantNumeric: 'tabular-nums' };
     const z = <text fontWeight="bold" />;
     const heading = (fontWeight: number) => ({ fontWeight });`,
    'self-test.tsx',
    canonical,
  );
  check('TY-0 the TS detectors pass clean source and ignore comments', count(goodTs) === 0, JSON.stringify(goodTs));
}

// ── The token, and every copy of it ─────────────────────────────────────────

const tokenValue = (file: string) =>
  existsSync(abs(file)) ? stripCssComments(read(file)).match(/--font-sans\s*:\s*([^;]+);/)?.[1]?.trim() ?? null : null;
const canonical = tokenValue(TOKEN_FILES[0]) ?? '';
check('TY-3 apps/web/src/styles/tokens.css declares --font-sans', !!canonical);
if (canonical) {
  const [first, ...rest] = families(canonical);
  check(
    `TY-3 --font-sans leads with ${FAMILY} and falls back to generic keywords only`,
    first === FAMILY && rest.length > 0 && rest.every((f) => GENERIC.has(f)),
    `--font-sans: ${canonical}`,
  );
}
const copies: Array<[string, string | null]> = [
  [TOKEN_FILES[1], tokenValue(TOKEN_FILES[1])],
  [THEME, stripComments(read(THEME)).match(/const FONT_SANS\s*=\s*(['"`])(.*?)\1/)?.[2] ?? null],
  [TOKENS_PKG, stripComments(read(TOKENS_PKG)).match(/\bfontFamily\s*:\s*(['"`])(.*?)\1/)?.[2] ?? null],
];
for (const [file, value] of copies) {
  check(
    `TY-3 ${file} carries the same stack as tokens.css`,
    value !== null && sameStack(value, canonical),
    `${value ?? '(not found)'} ≠ ${canonical}`,
  );
}

// ── Scan ────────────────────────────────────────────────────────────────────

const cssFiles = [...walk(abs('apps/web/src'), /\.css$/), ...walk(abs('apps/university'), /\.css$/)];
const tsFiles = [
  ...walk(abs('apps/web/src'), /\.tsx?$/),
  ...walk(abs('apps/university/src'), /\.tsx?$/),
  ...walk(abs('apps/university/scripts'), /\.tsx?$/),
];
const webCss = cssFiles.filter((f) => rel(f).startsWith('apps/web/')).length;
const webTs = tsFiles.filter((f) => rel(f).startsWith('apps/web/')).length;
const uniTs = tsFiles.length - webTs;
check(
  'TY-0 the scan reached both apps',
  webCss >= 4 && cssFiles.length - webCss >= 2 && webTs >= 150 && uniTs >= 10,
  `web css ${webCss}, university css ${cssFiles.length - webCss}, web ts ${webTs}, university ts ${uniTs}`,
);

const found = none();
for (const f of cssFiles) merge(found, cssProblems(readFileSync(f, 'utf8'), rel(f)));
for (const f of tsFiles) merge(found, tsProblems(readFileSync(f, 'utf8'), rel(f), canonical));
for (const f of HTML.filter((h) => existsSync(abs(h)))) {
  const s = read(f);
  if (/fonts\.(?:googleapis|gstatic)\.com|\.woff2?\b/.test(s)) found.face.push(`${f} loads a font from a URL`);
  for (const m of s.matchAll(/font-family\s*:\s*([^;"']+)/g)) {
    if (!FAMILY_OK.has(norm(m[1]))) found.family.push(`${f}:${lineAt(s, m.index!)} font-family: ${norm(m[1])}`);
  }
}
for (const pkg of PACKAGES) {
  const json = JSON.parse(read(pkg)) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const deps = Object.keys({ ...json.dependencies, ...json.devDependencies }).filter((d) => d.startsWith('@fontsource/'));
  for (const d of deps) if (d !== FONT_PACKAGE) found.face.push(`${pkg} depends on ${d}`);
  check(`TY-1 ${pkg} depends on ${FONT_PACKAGE}`, deps.includes(FONT_PACKAGE));
}

check(
  `TY-1 ${FONT_PACKAGE} is the only font the apps load`,
  found.face.length === 0,
  `${listed(found.face)}\n  Remove the package/import; ${FAMILY} is the one face (design.md § Typography).`,
);
check(
  'TY-2 one font token, --font-sans, declared only in the token files',
  found.token.length === 0,
  `${listed(found.token)}\n  Delete the token and let the element inherit.`,
);
check(
  'TY-4 a font family is inherited, never set by a component',
  found.family.length === 0,
  `${listed(found.family)}\n  Delete the declaration: a root names var(--font-sans) and everything inherits. Digits that must line up take font-variant-numeric: tabular-nums (.num), not a monospace face.`,
);
check(
  'TY-5 weights are 400 or 700 — the only weights the face has',
  found.weight.length === 0,
  `${listed(found.weight)}\n  500 renders as 400 and 600/800 as 700; write the weight that renders.`,
);
check(
  'TY-6 no font stack is spelled outside theme.ts and packages/tokens',
  found.stack.length === 0,
  `${listed(found.stack)}\n  Inherit instead; the stack lives in --font-sans.`,
);

// ── The roots name the face; the entries load all three files ──────────────

for (const [file, selector] of ROOTS) {
  const s = existsSync(abs(file)) ? stripCssComments(read(file)) : '';
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const bodies = [...s.matchAll(new RegExp(`(?:^|[}\\n])\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]);
  check(
    `TY-7 ${file} ${selector} names var(--font-sans)`,
    bodies.some((b) => /font-family\s*:\s*var\(--font-sans\)/.test(b)),
    'the root is what everything else inherits from; without it the browser default (a serif) shows through',
  );
}
check(
  'TY-7 theme.ts typography names FONT_SANS',
  /typography\s*:\s*\{[^}]*?\bfontFamily\s*:\s*FONT_SANS\b/s.test(stripComments(read(THEME))),
);
for (const entry of ENTRIES) {
  const s = stripComments(read(entry));
  for (const face of ['400.css', '700.css', '400-italic.css']) {
    check(`TY-8 ${entry} loads ${FONT_PACKAGE}/${face}`, s.includes(`'${FONT_PACKAGE}/${face}'`));
  }
}

console.log(failures === 0 ? 'TYPOGRAPHY TESTS PASS' : `TYPOGRAPHY TESTS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
