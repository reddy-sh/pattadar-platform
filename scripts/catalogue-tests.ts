/**
 * One base for service information — `bun run scripts/catalogue-tests.ts`.
 *
 * Discovered automatically by the `scripts/*-tests.ts` loop in
 * .github/workflows/ci.yml.
 *
 * Reddy, 09/10/2026: services/api/src/catalogue.py SERVICE_CATALOGUE is the
 * single base for every service's name, price, deliverable, synonyms, guides,
 * filing shelf and disciplines. Clients read it through `servicesOffered`;
 * nothing else spells it out. Copies drift silently: Properties confirmed a
 * hard-coded "₹1,180 each" while the server could charge another price, the
 * six copy services filed papers to "Not sorted yet" because a hand list in
 * ticketing.py missed them, and seed.ts OFFERS claimed to mirror the server
 * with half its services.
 *
 *   CAT-0   self-tests: the parsers and scanners find what they should
 *   CAT-A   no literal catalogue price (₹1,180, price: 1_180) in apps/web/src
 *   CAT-B   no hand list of 3+ catalogue keys in apps/web/src, the iOS sources
 *           or services/api/src outside catalogue.py (allow-list below)
 *   CAT-C   governance BASELINE serviceVisuals keys = the catalogue keys
 *   CAT-D   tests/e2e-app/fixtures/seed.ts OFFERS keys and prices = the catalogue
 *
 * The catalogue is read as text, not by importing Python, so the guard runs
 * with Bun alone. Unit tests are not scanned (walk() skips *.test.ts and the
 * iOS test targets are outside the scanned roots): a test may spell a value in
 * order to assert it.
 */
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { lineAt, stripComments, walk } from './lib/source-scan';

const ROOT = join(import.meta.dir, '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) { failures += 1; console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`); }
  else console.log(`PASS: ${name}`);
};

/** Blank Python `#` comments; strings (triple-quoted included) survive and
 *  every newline is kept so line numbers hold. */
export function stripPyComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '#') { while (i < src.length && src[i] !== '\n') i += 1; continue; }
    if (c === '"' || c === "'") {
      const q = src.startsWith(c.repeat(3), i) ? c.repeat(3) : c;
      out += q;
      i += q.length;
      while (i < src.length) {
        if (src[i] === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
        if (src.startsWith(q, i)) { out += q; i += q.length; break; }
        if (q.length === 1 && src[i] === '\n') break;
        out += src[i];
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** `{key: price}` from the SERVICE_CATALOGUE literal: each entry opens at four
 *  spaces of indent and its price sits at eight. */
export function parseCatalogue(py: string): Record<string, number> {
  const start = py.indexOf('SERVICE_CATALOGUE: dict = {');
  if (start < 0) return {};
  const end = py.indexOf('\n}\n', start);
  const block = py.slice(start, end < 0 ? undefined : end);
  const out: Record<string, number> = {};
  let key = '';
  for (const line of block.split('\n')) {
    const k = /^ {4}"(\w+)": \{$/.exec(line);
    if (k) { key = k[1]; continue; }
    const p = /^ {8}"price": ([\d_.]+),/.exec(line);
    if (p && key && !(key in out)) out[key] = Number(p[1].replaceAll('_', ''));
  }
  return out;
}

/** Each way a price can be written in owner copy or code: ₹1,180 · ₹1180 ·
 *  1_180 · price: 1180. The bare number alone is not matched; 450 or 900 also
 *  count photos and pixels. */
export function priceRegex(prices: number[]): RegExp {
  const forms = new Set<string>();
  for (const p of prices) {
    const n = String(Math.round(p));
    forms.add(`₹\\s?${Number(n).toLocaleString('en-IN').replaceAll(',', ',?')}(?![\\d,])`);
    if (n.length > 3) forms.add(`\\b${n.slice(0, -3)}_${n.slice(-3)}\\b`);
    forms.add(`\\bprice\\s*[:=]\\s*${n}(?:\\.0+)?\\b`);
  }
  return new RegExp([...forms].join('|'), 'g');
}

/** Places where `min`+ distinct catalogue keys appear as tokens within `span`
 *  lines: a quoted literal ('ec', "survey"), an object/dict key (site_visit:)
 *  or a Swift enum case (case ec). One finding per cluster. */
export function keyClusters(code: string, keys: string[], span = 12, min = 3): { line: number; keys: string[] }[] {
  const alt = keys.join('|');
  const re = new RegExp(`(['"\`])(${alt})\\1|(?:^|[{,(\\s])(${alt})\\s*:(?!:)`, 'gm');
  const toks = [...code.matchAll(re)].map((m) => ({ line: lineAt(code, m.index ?? 0), key: m[2] ?? m[3] }));
  const known = new Set(keys);
  for (const m of code.matchAll(/\bcase\s+(\.?\w+(?:\s*,\s*\.?\w+)*)/g)) {
    const line = lineAt(code, m.index ?? 0);
    for (const name of m[1].split(',').map((n) => n.trim().replace(/^\./, ''))) if (known.has(name)) toks.push({ line, key: name });
  }
  toks.sort((a, b) => a.line - b.line);
  const out: { line: number; keys: string[] }[] = [];
  let i = 0;
  while (i < toks.length) {
    let j = i;
    const seen = new Set<string>();
    while (j < toks.length && toks[j].line - toks[i].line <= span) { seen.add(toks[j].key); j += 1; }
    if (seen.size >= min) {
      // Extend through the rest of the list so one table is one finding.
      let last = j - 1;
      while (last + 1 < toks.length && toks[last + 1].line - toks[last].line <= span) { seen.add(toks[last + 1].key); last += 1; }
      out.push({ line: toks[i].line, keys: [...seen].sort() });
      i = last + 1;
    } else i += 1;
  }
  return out;
}

/** `{key: price}` from seed.ts `const OFFERS = [ … ];`. */
export function parseSeedOffers(ts: string): Record<string, number> | null {
  const start = ts.indexOf('const OFFERS = [');
  if (start < 0) return null;
  const end = ts.indexOf('\n];', start);
  const block = ts.slice(start, end < 0 ? undefined : end);
  const out: Record<string, number> = {};
  for (const m of block.matchAll(/\{\s*key:\s*'(\w+)',[^\n]*?\bprice:\s*([\d_.]+)/g)) out[m[1]] = Number(m[2].replaceAll('_', ''));
  return out;
}

/** Keys passed to `_service_visual("key", …)` inside BASELINE serviceVisuals. */
export function parseVisualKeys(py: string): string[] {
  const start = py.indexOf('"serviceVisuals": [');
  if (start < 0) return [];
  const end = py.indexOf('\n    ],', start);
  const block = py.slice(start, end < 0 ? undefined : end);
  return [...block.matchAll(/_service_visual\(\s*"(\w+)"/g)].map((m) => m[1]);
}

const same = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// ── CAT-0: self-tests. A parser that finds nothing makes every check below
// pass by inspecting nothing.
{
  const py = 'SERVICE_CATALOGUE: dict = {\n    "ec": {\n        "label": "EC",\n        "price": 1180.0,\n        "fields": [("price", 1)],\n    },\n    "survey": {\n        "price": 2_900,\n    },\n}\n';
  check('CAT-0 parseCatalogue reads keys and prices', JSON.stringify(parseCatalogue(py)) === '{"ec":1180,"survey":2900}', JSON.stringify(parseCatalogue(py)));
  const re = priceRegex([1180, 450]);
  const found = (s: string) => [...s.matchAll(re)].length;
  check('CAT-0 priceRegex finds ₹1,180 · ₹1180 · 1_180 · price: 450',
    found('a ₹1,180 b') === 1 && found('₹1180') === 1 && found('x = 1_180') === 1 && found('price: 450') === 1);
  check('CAT-0 priceRegex ignores ₹11,800 · ₹4500 · width 450', found('₹11,800') === 0 && found('₹4500') === 0 && found('width: 450') === 0);
  const ts = "const a = 1;\n// 'ec', 'survey', 'mutation' in a comment\nconst K = ['ec', 'survey',\n  'mutation'];\nconst one = o.key === 'ec';\n";
  const c = keyClusters(stripComments(ts), ['ec', 'survey', 'mutation']);
  check('CAT-0 keyClusters flags the literal list, not the comment or a lone key',
    c.length === 1 && c[0].line === 3, JSON.stringify(c));
  const obj = keyClusters('const D = {\n  ec: 1,\n  survey: 2,\n  site_visit: 3,\n};\n', ['ec', 'survey', 'site_visit']);
  check('CAT-0 keyClusters flags object keys', obj.length === 1, JSON.stringify(obj));
  const sw = keyClusters('enum K {\n  case ec, survey\n  case site_visit\n}\n', ['ec', 'survey', 'site_visit']);
  check('CAT-0 keyClusters flags Swift enum cases', sw.length === 1, JSON.stringify(sw));
  const pyc = stripPyComments('x = 1  # "ec", "survey", "mutation"\ns = "a # b"\n');
  check('CAT-0 stripPyComments drops # comments and keeps # in strings',
    !pyc.includes('survey') && pyc.includes('"a # b"') && pyc.split('\n').length === 3);
  const seed = "const OFFERS = [\n  { key: 'ec', label: 'EC', price: 1_180, group: 'R',\n    fields: [] },\n  { key: 'survey', label: 'S', price: 2_900,\n];\n";
  check('CAT-0 parseSeedOffers reads keys and prices', JSON.stringify(parseSeedOffers(seed)) === '{"ec":1180,"survey":2900}', JSON.stringify(parseSeedOffers(seed)));
  const gv = '    "serviceVisuals": [\n        _service_visual(\n            "ec",\n            "alt",\n        ),\n        _service_visual("survey", "a", "c"),\n    ],\n';
  check('CAT-0 parseVisualKeys reads visual keys', same(parseVisualKeys(gv), ['ec', 'survey']), parseVisualKeys(gv).join(','));
}

// ── The catalogue itself.
const CATALOGUE_FILE = 'services/api/src/catalogue.py';
const catalogue = parseCatalogue(read(CATALOGUE_FILE));
const KEYS = Object.keys(catalogue);
check(`catalogue parsed from ${CATALOGUE_FILE} (${KEYS.length} services)`,
  KEYS.length >= 6 && Object.values(catalogue).every((p) => Number.isFinite(p) && p > 0), JSON.stringify(catalogue));

// ── CAT-A: no catalogue price literal in web owner code.
{
  const re = priceRegex(Object.values(catalogue));
  const found = walk(join(ROOT, 'apps/web/src'), /\.tsx?$/).flatMap((f) => {
    const code = stripComments(readFileSync(f, 'utf8'));
    return [...code.matchAll(re)].map((m) => `${relative(ROOT, f)}:${lineAt(code, m.index ?? 0)} ${m[0]}`);
  });
  check('CAT-A no catalogue price literal in apps/web/src (read the offer\'s price)', found.length === 0, found.join(', '));
}

// ── CAT-B: no hand list of catalogue keys outside the catalogue.
// Each allow-listed file carries its reason. Remove an entry when its list
// becomes derived; never add one to hide a new copy.
const ALLOW_B: Record<string, string> = {
  [CATALOGUE_FILE]: 'the catalogue itself',
  'services/api/src/governance.py': 'serviceVisuals alt/caption copy is governance-owned; its key set is held to the catalogue by CAT-C',
  'apps/web/src/pages/documents/docTypes.ts': 'document-type taxonomy; ec, survey and tax_receipt are paper kinds there, not services',
};
{
  const files = [
    ...walk(join(ROOT, 'apps/web/src'), /\.tsx?$/).map((f) => [f, stripComments] as const),
    ...walk(join(ROOT, 'apps/ios/Pattadar/Sources'), /\.swift$/).map((f) => [f, stripComments] as const),
    ...walk(join(ROOT, 'apps/ios/PattadarKit/Sources'), /\.swift$/).map((f) => [f, stripComments] as const),
    ...walk(join(ROOT, 'services/api/src'), /\.py$/).map((f) => [f, stripPyComments] as const),
  ];
  const found = files.flatMap(([f, strip]) => {
    const rel = relative(ROOT, f);
    if (rel in ALLOW_B) return [];
    return keyClusters(strip(readFileSync(f, 'utf8')), KEYS).map((c) => `${rel}:${c.line} [${c.keys.join(' ')}]`);
  });
  check('CAT-B no hand list of 3+ catalogue keys outside catalogue.py (derive it from servicesOffered / SERVICE_CATALOGUE)',
    found.length === 0, `\n    ${found.join('\n    ')}`);
}

// ── CAT-C: every catalogue service has a governed visual, and only those.
{
  const visuals = parseVisualKeys(read('services/api/src/governance.py'));
  check('CAT-C governance BASELINE serviceVisuals keys = catalogue keys', visuals.length > 0 && same(visuals, KEYS),
    `visuals [${visuals.join(' ')}] vs catalogue [${KEYS.join(' ')}]`);
}

// ── CAT-D: the sealed e2e fixture answers what the server answers.
{
  // OFFERS is either a literal array or the generated catalogue.json
  // (tests/e2e-app/fixtures/catalogue-dump.py); a stale dump fails here too.
  const seed = read('tests/e2e-app/fixtures/seed.ts');
  const fromJson = /const OFFERS = CATALOGUE\.offers;/.test(seed) && /import CATALOGUE from '\.\/catalogue\.json'/.test(seed);
  const offers = fromJson
    ? Object.fromEntries((JSON.parse(read('tests/e2e-app/fixtures/catalogue.json')).offers as { key: string; price: number }[]).map((o) => [o.key, Number(o.price)]))
    : parseSeedOffers(seed);
  check(`CAT-D seed.ts OFFERS readable (${fromJson ? 'catalogue.json' : 'literal'})`, offers !== null && Object.keys(offers).length > 0);
  if (offers) {
    const keys = Object.keys(offers);
    check('CAT-D seed.ts OFFERS keys = catalogue keys', same(keys, KEYS),
      `missing [${KEYS.filter((k) => !(k in offers)).join(' ')}] extra [${keys.filter((k) => !(k in catalogue)).join(' ')}]`);
    const wrong = keys.filter((k) => k in catalogue && offers[k] !== catalogue[k]).map((k) => `${k} ${offers[k]}≠${catalogue[k]}`);
    check('CAT-D seed.ts OFFERS prices = catalogue prices', wrong.length === 0, wrong.join(', '));
  }
}

console.log(failures === 0 ? 'CATALOGUE TESTS PASS' : `CATALOGUE TESTS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
