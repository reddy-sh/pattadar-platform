/**
 * Entity vocabulary + counting (CL-610..612, VOC-0..7) — `bun run scripts/vocab-tests.ts`.
 *
 * The bug this locks: Properties once said "33 items" while Home said
 * "32 parcels", because a plot was counted as an item but not as a parcel.
 * Segment counts must partition the set exactly.
 *
 * VOC-0..7 hold the clients to design.md § App vocabulary: several properties
 * held as one are a **Holding** (list: Holdings), approved by Reddy on
 * 03/10/2026 and superseding "Combined view". "Holdings" is never the
 * Properties list, and "your holdings" never means all of an owner's land.
 * The web routes say holdings too (VOC-6), and iOS — which has no Holdings
 * feature — never uses the word for one property (VOC-7). Comments are not
 * copy, so they are stripped before any of these look.
 */
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { normalizeHoldings } from '../apps/mobile/src/data/holdings';
import { lineAt, stripComments, walk } from './lib/source-scan';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) { failures += 1; console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`); }
};

const data = {
  parcels: [
    { id: 'p1', surveyNo: '81', subdivision: '4', extent: 4.6, passbookId: 'pb1', classification: 'agri' },
    { id: 'p2', surveyNo: '119', subdivision: '5', extent: 5.43, passbookId: 'pb1', classification: 'agri' },
  ],
  passbooks: [{ id: 'pb1', pattadarNo: '5001', ownerName: 'T N Reddy', village: 'Katragunta', mandal: '', district: '', groupId: '' }],
  properties: [
    { id: 'r1', type: 'open_plot', label: 'Plot 12-B', city: 'Vijayawada', district: 'Krishna', landArea: 240, landUnit: 'Sq.yd' },
  ],
  groups: [],
  documents: [],
} as never;

const rows = normalizeHoldings(data);
const parcels = rows.filter((h) => h.kind === 'parcel');
const plots = rows.filter((h) => h.kind === 'property');

// CL-611: All must be exactly Farmland + Plots — no third bucket, no double count.
check('All equals farmland plus plots', rows.length === parcels.length + plots.length,
  `${rows.length} vs ${parcels.length}+${plots.length}`);
check('every row is one kind or the other', rows.every((h) => h.kind === 'parcel' || h.kind === 'property'));
check('two parcels', parcels.length === 2, String(parcels.length));
check('one plot', plots.length === 1, String(plots.length));

// CL-612: the two kinds carry different units and must never be summed together.
const acres = parcels.reduce((s, h) => s + h.extentAcres, 0);
check('parcel acres sum on their own', Math.abs(acres - 10.03) < 0.001, String(acres));
check('a plot contributes no acres', plots.every((h) => h.extentAcres === 0),
  'adding square yards into an acre total is how 240 sq.yd becomes 240 acres');
check('a plot states its own unit', /Sq\.yd/i.test(plots[0]?.extentLabel ?? ''), plots[0]?.extentLabel);

// ── VOC: the web's words for several properties held as one ─────────────
const ROOT = join(import.meta.dir, '..');
const WEB = join(ROOT, 'apps/web/src');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/** Each place `re` matches outside a comment, as `file:line`. */
const hits = (file: string, src: string, re: RegExp) => {
  const code = stripComments(src);
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  return [...code.matchAll(g)].map((m) => `${file}:${lineAt(code, m.index ?? 0)}`);
};

// VOC-0: the scanner flags the literal and not the comment, or every check
// below proves nothing.
{
  const sample = "// Combined view, in a comment\nconst a = 1;\nconst b = 'Combined view';\n";
  const found = hits('sample', sample, /combined views?/i);
  check('VOC-0 a comment is not copy, a literal is', found.length === 1 && found[0] === 'sample:3',
    found.join(', '));
}

// VOC-1: one constant carries the noun.
{
  const ui = read('apps/web/src/w360/ui.tsx');
  check('VOC-1 HOLDING_WORD is exported from ui.tsx', /export const HOLDING_WORD\b/.test(ui));
  check('VOC-1 its words are Holding / Holdings / the definition',
    ui.includes("one: 'Holding'") && ui.includes("many: 'Holdings'")
      && ui.includes("eyebrow: 'Several properties held as one'"));
  check('VOC-1 COMBINED_WORD is gone', !/\bCOMBINED_WORD\b/.test(stripComments(ui)));
}

const sources = walk(WEB, /\.tsx?$/).map((f) => [relative(ROOT, f), readFileSync(f, 'utf8')] as const);
// packages/core too: the audit labels the web prints live there.
const coreSources = walk(join(ROOT, 'packages/core/src'), /\.tsx?$/)
  .map((f) => [relative(ROOT, f), readFileSync(f, 'utf8')] as const);

// VOC-2: the superseded words are not printed anywhere on the web.
{
  const found = [...sources, ...coreSources].flatMap(([f, src]) =>
    [...hits(f, src, /combined views?/i), ...hits(f, src, /viewed together/i)]);
  check('VOC-2 no "Combined view" or "Viewed together" in web copy', found.length === 0, found.join(', '));
}

// VOC-3: "your holdings" would read as all of an owner's land, and "a holding"
// as one property. The whole web, the /legacy screens (apps/web/src/pages)
// included since 03/10/2026. The pricing page's "a holding is one land
// parcel" plan definition is a separate commercial decision for Reddy; it
// never says any of these phrases.
{
  const found = sources.flatMap(([f, src]) =>
    hits(f, src, /your holdings|add (a|your first) holding|search holdings/i));
  check('VOC-3 no "your holdings" / "add a holding" / "search holdings" in web copy',
    found.length === 0, found.join(', '));
}

// VOC-4: Holdings is never the Properties list.
{
  const shell = stripComments(read('apps/web/src/w360/Shell.tsx'));
  check('VOC-4 the rail calls /app/properties "Properties"',
    /to:\s*'\/app\/properties',\s*label:\s*'Properties'/.test(shell));
  const props = stripComments(read('apps/web/src/w360/pages/Properties.tsx'));
  check('VOC-4 the Properties head is titled "Properties"', /<PageHead[\s\S]*?title="Properties"/.test(props));
  const found = hits('apps/web/src/w360/pages/Properties.tsx', read('apps/web/src/w360/pages/Properties.tsx'),
    /'Holdings'|"Holdings"|>Holdings/);
  check('VOC-4 Properties never prints "Holdings"', found.length === 0, found.join(', '));
}

// VOC-5: "New holding" hands off to Properties' combine hint.
{
  const list = stripComments(read('apps/web/src/w360/pages/Holdings.tsx'));
  check('VOC-5 the Holdings list links New to /app/properties?combine=1',
    /to="\/app\/properties\?combine=1"[^>]*>\s*<AddOutlined[^>]*\/>\s*New \{HOLDING_WORD\.one/.test(list));
}

// VOC-6: the web's Holdings routes say holdings, and the old address only
// survives as the redirect that keeps bookmarks working.
{
  const routes = stripComments(read('apps/web/src/routes.tsx'));
  check('VOC-6 routes declare holdings and holdings/:id',
    routes.includes("path: 'holdings'") && routes.includes("path: 'holdings/:id'"));
  check('VOC-6 the old combined/* address redirects', /path: 'combined\/\*', element: <FromCombined \/>/.test(routes));
  const allowed = new Set(['apps/web/src/routes.tsx', 'apps/web/src/w360/holdingPath.ts']);
  const found = sources.filter(([f]) => !allowed.has(f)).flatMap(([f, src]) => hits(f, src, /\/app\/combined/));
  check('VOC-6 nothing else links to /app/combined', found.length === 0, found.join(', '));
}

console.log(failures === 0 ? 'VOCAB TESTS PASS' : `VOCAB TESTS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
