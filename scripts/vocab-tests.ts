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
 *
 * VOC-R0..X1 hold every owner surface (web, iOS, server) to design.md
 * § Naming standard (approved 06/10/2026): one name per concept, the house
 * grammar, units, page titles and the shared word tables. They read copy
 * through scripts/lib/copy-strings.ts, which parses each language and drops
 * identifiers, routes, GraphQL, SQL and comments.
 */
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { normalizeHoldings } from '../apps/mobile/src/data/holdings';
import { type Copy, pyCopy, swiftCopy, tsCopy } from './lib/copy-strings';
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
  check('VOC-1 its words are Holding / Holdings',
    ui.includes("one: 'Holding'") && ui.includes("many: 'Holdings'"));
  // V2 (founder, 09/10/2026): Holdings is a top-level page, so it has no
  // eyebrow, and the word table carries none for a page to print.
  check('VOC-1 HOLDING_WORD carries no eyebrow (V2)',
    !/export const HOLDING_WORD = \{[^}]*\beyebrow:/.test(stripComments(ui)));
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
  check('VOC-4 the rail calls /properties "Properties"',
    /to:\s*'\/properties',\s*label:\s*'Properties'/.test(shell));
  const props = stripComments(read('apps/web/src/w360/pages/Properties.tsx'));
  check('VOC-4 the Properties head is titled "Properties"', /<PageHead[\s\S]*?title="Properties"/.test(props));
  const found = hits('apps/web/src/w360/pages/Properties.tsx', read('apps/web/src/w360/pages/Properties.tsx'),
    /'Holdings'|"Holdings"|>Holdings/);
  check('VOC-4 Properties never prints "Holdings"', found.length === 0, found.join(', '));
}

// VOC-5: "New holding" hands off to Properties' combine hint.
{
  const list = stripComments(read('apps/web/src/w360/pages/Holdings.tsx'));
  // The head's filled primary (design.md § Page head): the command is data,
  // `{ label: New {holding}, …, to: combine=1 }`.
  check('VOC-5 the Holdings list links New to /properties?combine=1',
    /primary:\s*\{\s*label:\s*`New \$\{HOLDING_WORD\.one[\s\S]{0,200}?to:\s*'\/properties\?combine=1'/.test(list));
}

// VOC-6: the web's Holdings routes say holdings. Nothing is deployed, so the
// naming standard (V5, 06/10/2026) renames routes outright with no redirect;
// the guard no longer requires the old combined/* redirect (removing it is a
// route change, left to its own job), and nothing may link to it.
{
  const routes = stripComments(read('apps/web/src/routes.tsx'));
  check('VOC-6 routes declare holdings and holdings/:id',
    routes.includes("path: 'holdings'") && routes.includes("path: 'holdings/:id'"));
  const allowed = new Set(['apps/web/src/routes.tsx', 'apps/web/src/w360/holdingPath.ts']);
  const found = sources.filter(([f]) => !allowed.has(f)).flatMap(([f, src]) => hits(f, src, /(?<![\w.-])\/combined(?![\w-])/));
  check('VOC-6 nothing else links to /combined', found.length === 0, found.join(', '));
}

// VOC-7: on iOS "holding" was the word for one property. The web now uses it
// for several held as one, a feature iOS does not have, so no Swift string may
// print it. The deep-link tokens (SharedSnapshot.swift) and the widget kind
// (HoldingWidget.swift) are identifiers already installed on phones, and are
// the only literals allowed, each in its own file. A `\(…)` interpolation is
// code, so `"Khata \(holding.passbook)"` is not a hit, but the strings inside
// one are copy (`\(n == 1 ? "HOLDING" : "HOLDINGS")`) and are read too.
{
  const IOS = ['apps/ios/Pattadar/Sources', 'apps/ios/PattadarWidget', 'apps/ios/Shared', 'apps/ios/PattadarKit/Sources'];
  const allowed: Record<string, string[]> = {
    'apps/ios/PattadarKit/Sources/PattadarKit/Storage/SharedSnapshot.swift': ['"holding"', '"holdings"'],
    'apps/ios/PattadarWidget/HoldingWidget.swift': ['"PattadarHolding"'],
  };
  const interp = /\\\((?:[^()\n]|\([^()\n]*\))*\)/g;
  const found = IOS.flatMap((d) => walk(join(ROOT, d), /\.swift$/)).flatMap((f) => {
    const rel = relative(ROOT, f);
    const src = stripComments(readFileSync(f, 'utf8'));
    // Interpolations are blanked to equal-length spaces, so `"\(n == 1 ? "" : "s")"`
    // is one string and every index (and so every line number) still holds.
    const inner: { text: string; index: number }[] = [];
    const code = src.replace(interp, (m, at: number) => {
      for (const s of m.matchAll(/"[^"\n]*"/g)) inner.push({ text: s[0], index: at + (s.index ?? 0) });
      return ' '.repeat(m.length);
    });
    const strings = [...[...code.matchAll(/"[^"\n]*"/g)].map((m) => ({ text: m[0], index: m.index ?? 0 })), ...inner];
    return strings
      .filter((s) => /\bholdings?\b/i.test(s.text) && !(allowed[rel] ?? []).includes(s.text))
      .map((s) => `${rel}:${lineAt(src, s.index)} ${s.text}`);
  });
  check('VOC-7 no Swift string says "holding" for a property', found.length === 0, found.join(', '));
}

// ── Naming standard (design.md § Naming standard, approved 06/10/2026) ──
// VOC-R1..X1 are the guardrails of the 06/10/2026 naming review, section 6.
// They read owner-facing copy only — JSX text and string literals that look
// like words (scripts/lib/copy-strings.ts), never comments, identifiers,
// routes or GraphQL names — on the surfaces an owner sees:
//   web  apps/web/src/w360, apps/web/src/assistant and the live routes
//        PaymentsCheckout, AccountDataPage, InvitePage, PersonDialog
//   iOS  Swift literals in apps/ios/Pattadar, PattadarWidget, PattadarKit, Shared
//   API  services/api/src/{web360,main,growth,ticketing,governance,inbox}.py
//        and services/assistant/src/domain
// /legacy is out of scope. Rules that rest on decisions Reddy has not taken
// (Khata number D7, area units D8, route renames D16) are deliberately absent.
//
// An allow-list entry names the file (or every file) and the exact phrase,
// and says why. A rule with no allow-list has no exceptions.
{
  const OWNER_TS = [
    ...walk(join(ROOT, 'apps/web/src/w360'), /\.tsx?$/),
    ...walk(join(ROOT, 'apps/web/src/assistant'), /\.tsx?$/),
    ...['PaymentsCheckout.tsx', 'AccountDataPage.tsx', 'InvitePage.tsx', 'families/PersonDialog.tsx']
      .map((f) => join(ROOT, 'apps/web/src/pages', f)),
  ];
  const OWNER_SWIFT = ['apps/ios/Pattadar', 'apps/ios/PattadarWidget', 'apps/ios/PattadarKit/Sources', 'apps/ios/Shared']
    .flatMap((d) => walk(join(ROOT, d), /\.swift$/));
  const OWNER_PY = ['web360', 'main', 'growth', 'ticketing', 'governance', 'inbox'].map((n) => `services/api/src/${n}.py`)
    .concat(walk(join(ROOT, 'services/assistant/src/domain'), /\.py$/).map((f) => relative(ROOT, f)));
  const copy: Copy[] = [
    ...OWNER_TS.flatMap((f) => tsCopy(relative(ROOT, f), readFileSync(f, 'utf8'))),
    ...OWNER_SWIFT.flatMap((f) => swiftCopy(relative(ROOT, f), readFileSync(f, 'utf8'))),
    ...pyCopy(OWNER_PY),
  ];
  check('VOC-R0 the copy scan found the owner surfaces', copy.length > 5000, String(copy.length));
  // VOC-R0: the extractor reads words and skips code.
  {
    const sample = tsCopy('s.tsx', [
      "import x from './records';",
      "// Open record, in a comment",
      "if (kind === 'job') go('/properties/1');",
      "const a = <Button className=\"job-card\" to=\"/records\">Open record</Button>;",
      "const b = { records: 1 };",
      "const c = 'Open the job';",
    ].join('\n'));
    const texts = sample.map((c) => c.text);
    check('VOC-R0 a label and a string are copy; a route, enum, class and key are not',
      JSON.stringify(texts) === JSON.stringify(['Open record', 'Open the job']), JSON.stringify(texts));
  }

  /** Admin and provider-desk screens: not owner screens, so the owner nouns
   *  rules (R*, D1, H1, S*, M*, K1, A1, E1, V1) do not apply there. The
   *  grammar rules (G*) and units (U1) still do. */
  const ADMIN = /^apps\/web\/src\/w360\/(pages\/(Desk\w*|ComplianceAdmin|GeographyAdmin)\.tsx|adminOnly\.tsx|GovernanceGuidance\.tsx)$/;
  type Allow = { file?: RegExp; text: RegExp; why: string };
  type Rule = { id: string; what: string; re: RegExp; owner?: boolean; only?: (c: Copy) => boolean; allow?: Allow[] };

  const RULES: Rule[] = [
    // ── Nouns (2.3 One concept, one name) ──
    { id: 'VOC-R1', what: '"record" is not a noun for a property (D1: a holding\'s properties too)', owner: true,
      re: /\b(?:a|an|the|this|that|these|those|your|my|our|their|its|each|every|one|no|any|own|per|same|first|whole|other|which|all|most|of|\d+|\{…\})\s+records?\b(?!\s+of\s+rights)|^records?$|\brecord['’]s\b/i,
      allow: [
        { text: /^(Revenue|Old|Public) records?$|^Records$/,
          why: 'shelf and catalogue names: the government\'s records, and the "Records" service group (certified copies, EC, mutation)' },
        { text: /\bon the record\b|\bthe record says\b|named on the record/i,
          why: 'the official record (the extent or name the government holds), not the owner\'s property' },
        { file: /groupsView\.ts$|Properties\.tsx$/, text: /^Your own record of who shares this land\. It does not change the khata\.$/,
          why: 'the approved group disclaimer (holdings-vs-groups memo 4.6, 06/10/2026)' },
        { file: /PropertyDetailScreens\.swift$/, text: /^The record$/,
          why: 'the iOS property segment holding the official facts and boundary; renaming iOS segments is D13, not approved' },
        { file: /governance\.py$/, text: /./,
          why: 'regulatory reference text: names government records, offices and statutes, not the owner\'s properties' },
        { file: /assistant\/src\/domain\/(record_drafts|service_orders|tool_policy)\.py$/, text: /./,
          why: 'tool-argument errors and instructions returned to the model, not shown to owners; "record" there is a public registry row' },
      ] },
    { id: 'VOC-R2', what: 'no "land records"', owner: true, re: /\bland records?\b/i,
      allow: [
        { file: /main\.py$/, text: /invited you to their land records on Pattadar/,
          why: 'the invite SMS, kept by the review (section 6) — it must say nothing about the land' },
        { file: /governance\.py$/, text: /./, why: 'official programme and department names (DILRMP, MeeBhoomi, Survey and Land Records)' },
      ] },
    { id: 'VOC-D1', what: 'stored papers are Documents, never papers, vault or My files', owner: true,
      re: /\bpapers?\b|\bvault\b|\bMy files\b/i,
      allow: [
        { text: /\bon paper\b|\bon the paper\b|against the paper|\bthe paper\.$|almirah|a paper nobody could find|white paper|stamp papers?/i,
          why: 'the physical sheet of paper, not a stored document' },
        { file: /ServiceRequests\.swift$/, text: /^Papers sent$/, why: 'a legal service stage: the papers sent to the office' },
      ] },
    { id: 'VOC-T4', what: 'no "filed against" — a metaphor (T4); a document is on a property', owner: true,
      re: /\bfiled against\b/i,
      allow: [{ file: /AttachDocumentSheet\.swift$/, text: /only the document is filed against it/,
        why: 'iOS copy, reworded by the session that owns apps/ios (web and iOS are edited separately)' }] },
    { id: 'VOC-H1', what: 'a holding is never a combined view/property, a view, an estate or "ungrouped"', owner: true,
      re: /combined (view|property)|property or view|\bestate\b|ungrouped/i,
      allow: [{ text: /Real Estate/, why: 'statute and regulator names (RERA)' }] },
    { id: 'VOC-S1', what: 'owner work is a service order, never a job or a request', owner: true,
      re: /\bjobs?\b|service requests?|requests? (sent|already)|Open request|Cancel request|Being requested/i,
      allow: [
        { file: /RecipientAccess\.tsx$/, text: /^Accept this job$/, why: 'the provider\'s dispatch page; the provider side keeps "job"' },
        { file: /w360\/api\.ts$/, text: /^Taking them off that job$/, why: 'deskUnassign: the Pattadar desk keeps "job"' },
        { file: /ticketing\.py$/, text: /^(What the job is|the job)$/, why: 'provider dispatch templates (SMS/WhatsApp to the provider)' },
        { file: /governance\.py$/, text: /./, why: 'provider member policy (company members), not owner copy' },
        { file: /tool_policy\.py$/, text: /./, why: 'instructions to the model, not owner copy' },
      ] },
    { id: 'VOC-S2', what: 'Pattadar\'s people are providers, never somebody/someone/whoever/worker', owner: true,
      re: /\bsomebody\b|\bsomeone\b|\bwhoever\b|worker payment/i,
      allow: [
        { file: /(Invitations\.tsx|Refer\.tsx|main\.py)$/, text: /invite someone|someone you invited|when someone joins|^Someone you know$/i,
          why: 'a person the owner invites or refers, not Pattadar\'s people' },
        { file: /RecordPeople\.tsx$/, text: /^(Someone else|Assign someone|Assigning someone does not give them access\.)$/,
          why: 'the owner\'s own caretakers and staff, not Pattadar\'s people' },
        { file: /RecordExpenses\.tsx$/, text: /^Someone owes this back to you$/, why: 'a debtor of the owner, not a provider' },
        { file: /Audit\.tsx$/, text: /^Someone$/, why: 'the actor fallback in Activity when the actor kind is unknown' },
        { file: /Display\.swift$/, text: /someone/, why: 'audit verbs mirrored word for word from packages/core/src/format/audit.ts (parity twin); changes with core' },
      ] },
    { id: 'VOC-M1', what: 'no bare "Market value" or "Worth" label (Government value / Market estimate)', owner: true,
      re: /^(Worth|Worth today|WORTH TODAY|MARKET VALUE)$|\bMarket value\b(?!.*also called)|\bWorth today\b/,
      allow: [] },
    { id: 'VOC-M2', what: 'wallet words are Added · Held · Released · Refunded · Pattadar fee', owner: true,
      re: /[Ee]scrow|\bSettled\b|Service fee|\b[Cc]apture[ds]?\b/, allow: [] },
    { id: 'VOC-M3', what: 'money on an order is Held, never "set aside" (service order spec §11)', owner: true,
      re: /\bset aside\b/i, allow: [] },
    { id: 'VOC-I1', what: 'owners never see a raw id — a UUID, rec-, BR-, wr- (service order spec §11)', owner: true,
      // A Pattadar property id is a UUIDv7 now; the prefixes stay for older ids.
      re: /\b(?:rec|BR|wr)-[0-9A-Za-z]|\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/, allow: [] },
    { id: 'VOC-K1', what: 'stake is Your stake: Owned · Managed · Watching', owner: true,
      re: /\bMine\b|I manage it|\bMy stake\b|^Watch$/,
      allow: [{ file: /PropertiesScreen\.swift$/, text: /^Mine \{…\}$/,
        why: 'the M22 All / Mine summary toggle, not a stake word; iOS layout decisions D12–D15 are pending' }] },
    { id: 'VOC-A1', what: 'the owner\'s trail is Activity', owner: true,
      re: /Audit log|Activity log|share log|^History$/i, allow: [] },
    { id: 'VOC-E1', what: 'money spent on land is Expenses; "Record" is not a verb', owner: true,
      re: /\bSpend\b|\bRecord an? (cost|expense|purchase)\b|\bRecord rent\b|\bCosts for\b/, allow: [] },
    { id: 'VOC-P1', what: 'a cadastral survey shape is a parcel, never a plot',
      only: (c) => /\/(VillageMaps|VillageCanvas|RecordBoundary)\.tsx$/.test(c.file),
      re: /\bplots?\b/i, allow: [] },
    { id: 'VOC-C1', what: 'a village survey sheet is a cadastral map, never a "village map" (design.md § Naming standard)', owner: true,
      re: /\bvillage maps?\b/i, allow: [] },
    { id: 'VOC-V1', what: 'owners never see vendor or engineering jargon (E2)', owner: true,
      re: /Anthropic|API key|console\.anthropic|\btokens?\b|georeferenced|codec|sha256|ap-south-1|auth\.pattadar\.com|GeoJSON(?![^(]*\))/i,
      allow: [
        { file: /assistant\/footer\/UsageFooter\.tsx$/, text: /./, why: 'AI cost footer, rendered only for platform admins (decision 3, isPlatformAdmin)' },
        { file: /pages\/IntelligenceAdmin\.tsx$/, text: /API key/, why: 'super-admin page whose subject is the providers\' keys (isSuperAdmin); owners never reach it' },
        { file: /assistant\/src\/domain\/billing\.py$/, text: /Anthropic/, why: 'failure_detail(): the vendor reason goes to logs only; owners get one vendor-free sentence' },
        { file: /pages\/Tools\.tsx$/, text: /^Boundary as GeoJSON$/, why: 'the raw GeoJSON paste field of the Tools calculator (allowed by the review)' },
        { file: /Identity\.swift$/, text: /^Developer door:/, why: 'rendered only when isDevStack (the local stack), never against production' },
      ] },
    // ── Grammar (2.1, 2.2) ──
    { id: 'VOC-G1', what: 'negatives are written in full (N3)',
      re: /\b\w+n['’]t\b/i,
      allow: [{ text: /^You['’]re all caught up/, why: 'a friendly one-off (N3)' }] },
    { id: 'VOC-G2', what: 'no "Please" in errors or system messages (N4)', re: /\bplease\b/i,
      allow: [
        { file: /RequestWork\.tsx$/, text: /./, why: 'the owner\'s own opening message to a provider, which the owner sends and can edit — not a system message' },
        { file: /scope_policy\.py$/, text: /^[a-z0-9 '’-]+$/, why: 'phrases matched against what the owner types, not shown' },
      ] },
    { id: 'VOC-G3', what: 'device-neutral verbs: Choose, not click or tap (N6)', re: /\b(click|tap)(s|ped|ping)?\b/i,
      allow: [
        { file: /assistant\/footer\/UsageFooter\.tsx$/, text: /./, why: 'admin-only AI cost footer' },
        { file: /tool_policy\.py$/, text: /./, why: 'instructions to the model, not owner copy' },
      ] },
    { id: 'VOC-G4', what: '"…" only means work in progress ("Saving…"), never a dialog opener (A5)',
      // A JSX fragment after a `{hole}` ("… cadastral map…") is the tail of a
      // sentence, not a label, so only fragments that open with a capital count.
      only: (c) => c.attr !== 'placeholder' && c.text.length <= 48 && !/,/.test(c.text)
        && (c.kind !== 'jsx' || /^[A-Z]/.test(c.text)),
      re: /^(?!\S*ing\b)(?!\{…\}).*\S…$/,
      allow: [
        { text: /^Choose( a| an)?( \S+)?…$/, why: 'the empty first option of a picker: a prompt, not an opener' },
        { file: /Composer\.tsx$/, text: /^Ask about Pattadar…$/, why: 'the composer\'s placeholder' },
      ] },
    { id: 'VOC-G5', what: 'the safe button in a confirmation is Cancel (A4)',
      re: /^Keep (it|them|the link|it active|them on it)$/,
      allow: [{ file: /Ticket\.tsx$/, text: /^Keep it$/, why: 'the review pair "Keep it" / "Not this one" on a delivered item, not a confirmation' }] },
    { id: 'VOC-G6', what: 'sentence case: no Title Case two-word labels (N1)',
      only: (c) => !c.file.endsWith('.py'),
      re: /^(?!(?:Pattadar|Aadhaar|PAN|EC|FMB|SRO|HUF|LLP|Google)\b)[A-Z][a-z]+ (?!(?:Pattadar|Aadhaar|PAN|EC|FMB|SRO|HUF|LLP|Google)\b)[A-Z][a-z]+$/,
      allow: [
        { text: /^(Andhra Pradesh|Guntur Rural|East Godavari|West Godavari)$/, why: 'place names' },
        { text: /^(Open|Under|In) (Documents|Properties|Holdings|Activity|More|English|Telugu)$/, why: 'a page, tab or language name after a verb or preposition' },
      ] },
    { id: 'VOC-G7', what: 'Indian/British spelling (N5)', re: /authoriz|organiz|\bcatalog\b|enrollment|synchroniz/i,
      allow: [{ file: /main\.py$/, text: /^Authorized Signatory$/, why: 'a stored role value; screens show it through roleWord() as "Authorised signatory"' }] },
    // ── Units (2.4) ──
    { id: 'VOC-U1', what: 'units lower case after a number; Sy not Sy.; no ×N label; pages not pp',
      re: /\d\s*Sq\.(yd|ft)|\bSy\.|^[^=]*×\s*\{…\}\s*$|\bpp\b/,
      allow: [] },
  ];

  for (const r of RULES) {
    const found = copy.filter((c) => (!r.owner || !ADMIN.test(c.file)) && (!r.only || r.only(c)) && r.re.test(c.text)
      && !(r.allow ?? []).some((a) => (!a.file || a.file.test(c.file)) && a.text.test(c.text)));
    check(`${r.id} ${r.what}`, found.length === 0,
      `${found.length} hit(s)\n    ${found.map((c) => `${c.file}:${c.line} ${JSON.stringify(c.text.slice(0, 140))}`).join('\n    ')}`);
  }
  const i1 = RULES.find((r) => r.id === 'VOC-I1')!.re;
  check('VOC-I1 a UUIDv7 property id in copy is caught; a plain sentence is not',
    i1.test('Opened 01928f3a-7b2c-7d4e-8f5a-1b2c3d4e5f60') && !i1.test('Opened your property'));
}

// VOC-N1 (V1): a page's title is its rail label, and the browser tab says
// "{title} · Pattadar". Every rail label but Home (D6, the greeting) is the
// title of a PageHead somewhere in the app, and the three heads that name a
// screen call useDocumentTitle.
{
  const shell = stripComments(read('apps/web/src/w360/Shell.tsx'));
  const labels = [...shell.matchAll(/\{\s*to:\s*'(\/[^']*)',\s*label:\s*'([^']+)'/g)].map((m) => m[2]);
  check('VOC-N1 the rail has labels to compare', labels.length >= 15, String(labels.length));
  const heads = [
    ...walk(join(ROOT, 'apps/web/src/w360'), /\.tsx$/),
    join(ROOT, 'apps/web/src/pages/AccountDataPage.tsx'),
  ].map((f) => stripComments(readFileSync(f, 'utf8'))).join('\n');
  const titled = (label: string) => {
    const q = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // title="X", a title expression that falls back to 'X', a `HEAD = { title: 'X' }`
    // constant handed to PageHead, or (admin screens with no PageHead) <h1>X</h1>.
    return new RegExp(`<PageHead\\b[^>]*?\\btitle=(?:"${q}"|\\{[^}\\n]*'${q}'[^}\\n]*\\})`, 's').test(heads)
      || (new RegExp(`const HEAD = \\{\\s*title: '${q}'`).test(heads))
      || new RegExp(`<h1>${q}</h1>`).test(heads);
  };
  const missing = labels.filter((l) => l !== 'Home' && !titled(l));
  check('VOC-N1 every rail label is the title of its page', missing.length === 0, missing.join(', '));
  // Home's title is the greeting (D6), but its tab still reads "Home ·
  // Pattadar" (V1; drift 3 of the 09/10/2026 content-header audit).
  const home = stripComments(read('apps/web/src/w360/pages/Dashboard.tsx'));
  const homeHeads = [...home.matchAll(/<PageHead\b[^>]*>/gs)].map((m) => m[0]);
  check('VOC-N1 every Home head names the tab "Home"',
    homeHeads.length > 0 && homeHeads.every((h) => /\bdocTitle="Home"/.test(h)),
    `${homeHeads.filter((h) => !/\bdocTitle="Home"/.test(h)).length} of ${homeHeads.length} Home heads lack docTitle="Home"`);
  const ui = stripComments(read('apps/web/src/w360/ui.tsx'));
  check('VOC-N1 PageHead names the browser tab', /export function PageHead[\s\S]*?useDocumentTitle\(/.test(ui));
  check('VOC-N1 the tab reads "{title} · Pattadar"', /document\.title = `\$\{name\} · \$\{APP_NAME\}`/.test(ui));
  // Both detail heads name the tab through PageHead's plain-text title.
  check('VOC-N1 RecordHead names the browser tab',
    /<PageHead\b[^]*?\btitle=\{rec\.title\}/.test(stripComments(read('apps/web/src/w360/pages/RecordHead.tsx'))));
  check('VOC-N1 HoldingHead names the browser tab',
    /function HoldingHead[\s\S]*?<PageHead\b[\s\S]*?\btitle=\{holding\.name\}/.test(stripComments(read('apps/web/src/w360/pages/Holding.tsx'))));
}

// VOC-N2 (V4): on iOS an entry's label is its destination's title. Checked for
// the pairs the review named; "Get it done" waits on D12, so it is left out.
{
  const SRC = join(ROOT, 'apps/ios/Pattadar/Sources');
  const titleOf = (file: string) => (readFileSync(join(SRC, file), 'utf8').match(/\.navigationTitle\("([^"]+)"\)/) ?? [])[1];
  const DEST: Record<string, string | undefined> = {
    ActivityScreen: titleOf('ActivityScreen.swift'),
    SpendScreen: titleOf('SpendScreen.swift'),
    FamilyScreen: titleOf('FamilyScreen.swift'),
  };
  check('VOC-N2 the destinations have titles', Object.values(DEST).every(Boolean), JSON.stringify(DEST));
  const wrong: string[] = [];
  for (const f of walk(SRC, /\.swift$/)) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/NavigationLink\s*\{\s*(\w+)\([^)]*\)[^}]*\}\s*label:\s*\{\s*(?:Label|Text)\("([^"]+)"/g)) {
      const want = DEST[m[1]];
      if (want && m[2] !== want) wrong.push(`${relative(ROOT, f)}:${lineAt(src, m.index ?? 0)} "${m[2]}" opens "${want}"`);
    }
  }
  // Families & groups opens as a sheet from You, so its row is a Button.
  const you = readFileSync(join(SRC, 'YouScreen.swift'), 'utf8');
  const familyRow = (you.match(/showFamily = true \} label: \{[\s\S]*?Text\("([^"]+)"\)/) ?? [])[1];
  if (familyRow !== DEST.FamilyScreen) wrong.push(`YouScreen.swift family row "${familyRow}" opens "${DEST.FamilyScreen}"`);
  check('VOC-N2 an iOS entry label is its destination\'s title', wrong.length === 0, wrong.join(', '));
}

// VOC-X1 (E4, parity): the word tables an owner reads hold the same words on
// every surface. ui.tsx is the source; the server, the other web screens and
// iOS (with packages/core, its twin) must agree with it.
{
  /** `key: 'Word'` / `"key": "Word"` / `case "key": "Word"` pairs inside the
   *  first block that follows `anchor`. */
  const table = (rel: string, anchor: string | RegExp): Record<string, string> => {
    const src = read(rel);
    const at = typeof anchor === 'string' ? src.indexOf(anchor) : src.search(anchor);
    if (at < 0) return {};
    const open = src.slice(at).search(/[{[(]/);
    const body = src.slice(at + open, at + open + 1200);
    const close = body.search(/\n\s*[}\])]/);
    const out: Record<string, string> = {};
    for (const m of body.slice(0, close < 0 ? undefined : close).matchAll(/(?:case\s+)?['"]?(\w+)['"]?\s*:\s*['"]([^'"]+)['"]/g)) out[m[1]] = m[2];
    return out;
  };
  const same = (name: string, want: Record<string, string>, got: Record<string, string>, keyMap: Record<string, string> = {}) => {
    const diff = Object.entries(want)
      .filter(([k]) => (keyMap[k] ?? k) in got || Object.keys(got).length === 0)
      .filter(([k, v]) => got[keyMap[k] ?? k] !== v)
      .map(([k, v]) => `${k}: "${got[keyMap[k] ?? k]}" (ui.tsx "${v}")`);
    check(`VOC-X1 ${name}`, Object.keys(got).length > 0 && diff.length === 0, diff.join(', ') || 'table not found');
  };

  const status = table('apps/web/src/w360/ui.tsx', 'export const STATUS_WORD');
  const stake = { owned: status.owned, managed: status.managed, watch: status.watch };
  same('STATUS_WORD = iOS statusWords', status, table('apps/ios/Pattadar/Sources/PropertyDetailScreens.swift', 'private let statusWords'));
  same('stake words = web360.py _STAKE_WORDS', stake, table('services/api/src/web360.py', '_STAKE_WORDS = '));
  same('stake words = web360.py _COMBINED_STAKE_WORDS', stake, table('services/api/src/web360.py', '_COMBINED_STAKE_WORDS = '));

  const shelf = table('apps/web/src/w360/ui.tsx', 'export const SHELF_WORD');
  check('VOC-X1 SHELF_WORD has the eight shelves', Object.keys(shelf).length === 8, JSON.stringify(shelf));
  const spec: Record<string, string> = {};
  const web360 = read('services/api/src/web360.py');
  for (const m of web360.slice(web360.indexOf('spec = [\n                ("title"')).matchAll(/\("(\w+)", "([^"]+)", "[^"]*"\),/g)) spec[m[1]] = m[2];
  same('SHELF_WORD = the vault shelves web360.py serves', shelf, spec);
  const { photos: _p, ...filed } = shelf;
  same('SHELF_WORD = ticketing.py SHELF_LABEL', filed, table('services/api/src/ticketing.py', 'SHELF_LABEL: dict = '));
  const shelfPage: Record<string, string> = {};
  for (const m of read('apps/web/src/w360/pages/Shelf.tsx').matchAll(/(\w+): \{ label: '([^']+)'/g)) shelfPage[m[1]] = m[2];
  same('SHELF_WORD = Shelf.tsx', shelf, shelfPage);
  const twin = { old: 'old_record', photos: 'photo' };
  same('SHELF_WORD = iOS familyLabel (DocSpine.swift)', shelf,
    table('apps/ios/PattadarKit/Sources/PattadarKit/Format/DocSpine.swift', 'public func familyLabel'),
    { ...twin, unsorted: 'default' });
  same('SHELF_WORD = packages/core docFamilies', shelf,
    table('packages/core/src/records/docFamilies.ts', 'const LABELS'), twin);

  const states: Record<string, string> = {};
  for (const m of read('apps/web/src/w360/pages/RecordFeatures.tsx').matchAll(/\{ key: '(\w+)', label: '([^']+)' \}/g)) states[m[1]] = m[2];
  const conditions: Record<string, string> = {};
  // The record-submitted-work dialog moved to the desk (service order spec §7).
  for (const m of read('apps/web/src/w360/pages/DeskJob.tsx').matchAll(/\['(good|warn|bad|unknown)', '([^']+)'\]/g)) conditions[m[1]] = m[2];
  check('VOC-X1 condition words are Working · Watch it · Broken · Not checked',
    JSON.stringify(states) === JSON.stringify({ good: 'Working', warn: 'Watch it', bad: 'Broken', unknown: 'Not checked' }), JSON.stringify(states));
  check('VOC-X1 DeskJob.tsx conditions = RecordFeatures STATES', JSON.stringify(conditions) === JSON.stringify(states), JSON.stringify(conditions));
  const featureKeys = (read('services/api/src/ticketing.py').match(/FEATURE_STATES: tuple = \(([^)]*)\)/) ?? [])[1] ?? '';
  check('VOC-X1 ticketing.py FEATURE_STATES = the condition keys',
    JSON.stringify([...featureKeys.matchAll(/"(\w+)"/g)].map((m) => m[1])) === JSON.stringify(Object.keys(states)), featureKeys);

  const entries = table('services/api/src/ticketing.py', 'ENTRY_LABEL: dict = ');
  const offWords = Object.entries(entries).filter(([, v]) => !/^(Added|Held|Released|Refunded|Pattadar fee)\b/.test(v));
  check('VOC-X1 ENTRY_LABEL uses Added · Held · Released · Refunded · Pattadar fee',
    Object.keys(entries).length === 5 && offWords.length === 0, JSON.stringify(entries));
}

console.log(failures === 0 ? 'VOCAB TESTS PASS' : `VOCAB TESTS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
