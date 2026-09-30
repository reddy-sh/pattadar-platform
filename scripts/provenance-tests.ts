/**
 * Data provenance — nothing invented may reach a screen, and nothing that did
 * may come back. `bun run scripts/provenance-tests.ts`.
 *
 * Discovered automatically by the `scripts/*-tests.ts` loop in
 * .github/workflows/ci.yml and nightly.yml.
 *
 * What went wrong, and why each check below exists:
 *
 *  1. `packages/core/src/sample/data.ts` was a 599-line invented estate — a
 *     named owner with a masked Aadhaar reference and a street address, nine
 *     khatas and survey numbers, rupee valuations, family members with phone
 *     numbers and birthdates, an audit trail of things nobody did, and a wallet
 *     holding ₹12,500. It shipped in the browser bundle. It is now shape
 *     templates: ids, enum members and zeros. Check group A keeps it that way.
 *
 *  2. `useWallet()` returned that wallet directly — the one hook that bypassed
 *     `emptyLike` — so /legacy/wallet printed five payments nobody made, to a
 *     signed-in owner, under the heading "Recent transactions". Check group B
 *     bans the shape of that bug rather than the one instance of it.
 *
 *  3. Six surfaces told the owner they were looking at sample data. Five of
 *     them were wrong: no sample row has painted since 2026-07-26, so what they
 *     actually had on screen was nothing. Check group C keeps the one true
 *     sentence and the untrue ones dead.
 *
 *  4. Four seed scripts and the e2e purge read APP_PG_DSN with a localhost
 *     default and no check, and one of them stamps generated base fields onto
 *     records that were merely empty. Check group D requires the gate.
 *
 * These are static checks. They prove the fabrications cannot be reached from
 * source; they do not prove a rendered screen is correct — that is
 * tests/e2e-app/specs/19-sections-legacy.spec.ts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/**
 * A scanner, not a regex — the same decision ux-guards.ts documents at its own
 * copy, for the same reason: a block-comment regex cannot tell a comment from a
 * string, so `['application/pdf', 'image/*']` opens a "comment" at the `/*`
 * inside the MIME pattern and everything to the next `*''/` disappears before
 * the checks see it. Assertions then pass by inspecting nothing.
 *
 * It matters twice as much here, because the checks below assert on the ABSENCE
 * of strings that this file's own comments — and the comments of the files it
 * reads — necessarily quote.
 */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += c;
      i += 1;
      while (i < src.length) {
        if (src[i] === '\\') {
          out += src.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += src[i];
        if (src[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}
const code = (p: string) => stripComments(read(p));

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) {
    failures += 1;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ── A · the shape templates hold no values ─────────────────────────────────
//
// An id is structure: the detail pages look rows up by it (`sampleParcels.find`,
// `sampleDocuments.filter`), and a missed lookup silently changes which branch a
// screen renders. A union member is structure too — the compiler needs it.
// Everything else must be empty or zero.

const TEMPLATES = 'packages/core/src/sample/data.ts';
const templateSrc = code(TEMPLATES);

/** `pb-1`, `par-3`, `prop-2`, `rd-5`, `mem-9`, `wt-4` … */
const ID_SHAPE = /^[a-z]{2,4}-\d+$/;
/** Union members the TS types require, plus the module's own import path. */
const ALLOWED_LITERALS = new Set([
  './types',
  'open_plot', 'flat', 'commercial', 'independent_house', 'villa', 'rental', 'other',
  'family', 'partnership', 'company', 'huf', 'trust',
  'credit', 'debit',
]);

const literals = [...templateSrc.matchAll(/'([^'\\]*)'/g)].map((m) => m[1]);
const offending = literals.filter(
  (s) => s !== '' && !ID_SHAPE.test(s) && !ALLOWED_LITERALS.has(s),
);
check(
  'A1 the shape templates carry no realistic string values',
  offending.length === 0,
  offending.length
    ? `${offending.length} value(s) that are not an id or a union member: ${
      [...new Set(offending)].slice(0, 6).map((s) => `'${s}'`).join(', ')}`
    : '',
);

// Numbers, with the string contents taken out first so an id's digits are not
// mistaken for a figure.
const withoutStrings = templateSrc.replace(/'[^'\\]*'/g, "''");
const numbers = [...withoutStrings.matchAll(/\b\d+(?:\.\d+)?\b/g)].map((m) => m[0]);
const nonZero = numbers.filter((n) => Number(n) !== 0);
check(
  'A2 every figure in the shape templates is zero',
  nonZero.length === 0,
  nonZero.length
    ? `a template with a plausible figure in it is a fabrication waiting for one edit: ${
      [...new Set(nonZero)].slice(0, 6).join(', ')}`
    : '',
);

check(
  'A3 the templates say what they are',
  /SHAPE TEMPLATES/.test(read(TEMPLATES)),
  'the header is how the next person knows not to refill it',
);

// ── B · emptyLike is never bypassed ────────────────────────────────────────

const liveOrSample = code('apps/web/src/data/useLiveOrSample.ts');
const famData = code('apps/web/src/pages/families/familiesData.ts');
const webHooks = code('apps/web/src/data/hooks.ts');

for (const [name, src] of [
  ['useLiveOrSample', liveOrSample],
  ['familiesData.useFamLive', famData],
] as const) {
  check(
    `B1 ${name} zero-fills its template rather than serving it`,
    /q\.data \?\? emptyLike\(sample\)/.test(src),
    '`q.data ?? sample` is a one-token edit that arms every template in the bundle',
  );
}

// The shape of the bug, not the one instance: any hook handing a bundled
// template back as `data` without passing it through emptyLike first.
for (const [label, src] of [
  ['data/hooks.ts', webHooks],
  ['familiesData.ts', famData],
] as const) {
  const direct = [...src.matchAll(/data:\s*(sample[A-Z]\w*)/g)].map((m) => m[1]);
  check(
    `B2 ${label} returns no bundled template as data`,
    direct.length === 0,
    direct.join(', '),
  );
}

check(
  'B3 useWallet zero-fills (it is the hook that did not)',
  /export function useWallet[\s\S]{0,200}emptyLike\(sampleWallet\)/.test(webHooks),
);
check(
  'B4 useWallet claims no failed read',
  !/export function useWallet[\s\S]{0,200}isSample: true/.test(webHooks),
  'no read is attempted, so a "Service unreachable" chip would be a second untruth',
);
check(
  'B5 the audit trail still refuses a bundled fallback',
  /useAuditTrail[\s\S]{0,600}\[\],\s*\)/.test(webHooks),
  'fabricated audit rows are the one fallback that can never be acceptable',
);

// ── C · one vocabulary for "the live read failed", and it is true ───────────

const UNREACHABLE_SITES = [
  'apps/web/src/components/PageHeader.tsx',
  'apps/web/src/pages/detail/ParcelDetailPage.tsx',
  'apps/web/src/pages/detail/PassbookDetailPage.tsx',
  'apps/web/src/pages/detail/PropertyDetailPage.tsx',
  'apps/web/src/pages/families/GroupDetail.tsx',
  // pages/tools/MarketValueTool.tsx left with the rest of the legacy Tools
  // screen. Its replacement, w360/pages/Tools.tsx, says an outage with the
  // W360 `Failed` state ("… did not load") rather than this sentence, and is
  // held to the no-sample-claims rule by its own C3 check below.
  'apps/web/src/pages/documents/RegisteredDeedsTab.tsx',
];

check(
  'C1 the sentence is defined once, beside the flag that raises it',
  /export const UNREACHABLE_NOTE =/.test(liveOrSample)
    && /export const UNREACHABLE_LABEL =/.test(liveOrSample),
);

for (const f of UNREACHABLE_SITES) {
  check(`C2 ${f} takes the shared wording`, /UNREACHABLE_(NOTE|LABEL)/.test(code(f)));
}

// The five untrue spellings. Each claimed sample data over a screen showing
// none; `getByText` in the e2e suite would find them again the day one returns.
const UNTRUE = [
  'Sample data — the live service is not reachable.',
  'showing bundled sample data',
  "label=\"Sample data\"",
  "label='Sample data'",
  ' · sample data',
];
for (const f of UNREACHABLE_SITES) {
  const src = code(f);
  const found = UNTRUE.filter((s) => src.includes(s));
  check(
    `C3 ${f} claims no sample data`,
    found.length === 0,
    found.join(' | '),
  );
}
{
  // The redrawn Tools screen carries the three reference reads the legacy one
  // did. It must not bring back a sample-data claim, nor the "bundled fee
  // schedule" caption that sat over an empty picker (test-fail-register 1605).
  const f = 'apps/web/src/w360/pages/Tools.tsx';
  const src = code(f);
  const found = [...UNTRUE, 'bundled fee schedule'].filter((s) => src.includes(s));
  check(`C3 ${f} claims no sample data`, found.length === 0, found.join(' | '));
}

// ── C · the wallet screen ──────────────────────────────────────────────────

const walletPage = code('apps/web/src/pages/WalletPage.tsx');
check(
  'C4 the wallet history has a designed empty branch',
  /wallet\.transactions\.length === 0/.test(walletPage),
  'an empty tbody under "Recent transactions" is a shrug, not an answer',
);
check(
  'C5 the wallet screen hardcodes no money',
  !/₹\s*[\d,]/.test(walletPage),
  'every figure on this screen comes from the hook, which has none',
);

// ── C · the landing page's invented figures stay labelled ──────────────────
//
// design.md byte-freezes landing copy, so the scripted assistant exchange is
// not this change's to remove. What must not happen quietly is the LABEL
// coming off it. The invented portfolio card was removed on 27/09/2026
// (design.md § Copy freeze); it must not return without its label either.

const landing = code('apps/web/src/pages/landing/landingContent.ts');
check(
  "C6 the landing page still marks its scripted exchange 'sample conversation'",
  landing.includes('· sample conversation'),
  'survey numbers in a scripted chat on a public page; the word "sample" is what makes them honest',
);
check(
  'C7 the invented portfolio card has not come back unlabelled',
  !/₹\s*[\d,]{5,}/.test(landing) || landing.includes('Land portfolio · sample'),
  'an invented rupee total on the public front page must say it is a sample',
);

// ── D · no seeder can write to a database that is not local ────────────────

const GATED = [
  'scripts/seed-web360.py',
  'scripts/seed-demo-data.py',
  'scripts/seed-record-features.py',
  'scripts/seed-company-members.py',
  'scripts/purge-e2e-records.py',
];
for (const f of GATED) {
  const src = read(f);
  check(`D1 ${f} imports the gate`, /from seed_guard import require_local_dsn/.test(src));
  check(
    `D2 ${f} calls the gate before it connects`,
    src.indexOf('require_local_dsn(DSN') > 0
      && src.indexOf('require_local_dsn(DSN') < src.indexOf('psycopg.connect'),
    'the check has to run before the connection, or it is decoration',
  );
}

const guard = read('scripts/seed_guard.py');
check(
  'D3 the gate allows loopback and the container gateway, and nothing else',
  /LOCAL_HOSTS = frozenset\(\{[^}]*"localhost"[^}]*\}\)/.test(guard)
    && !/\*/.test(guard.split('LOCAL_HOSTS')[1]?.split('})')[0] ?? '*'),
);
check(
  'D4 the override is an exact phrase, not a truthy flag',
  /OVERRIDE_VALUE = "yes-write-invented-rows-to-this-database"/.test(guard),
  'a seeder aimed at a shared database is a decision, not a keystroke',
);

console.log(failures === 0 ? 'PROVENANCE TESTS PASS' : `PROVENANCE TESTS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
