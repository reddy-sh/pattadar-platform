/**
 * One component per concern — `bun run scripts/shared-components-tests.ts`.
 *
 * Discovered automatically by the `scripts/*-tests.ts` loop in
 * .github/workflows/ci.yml and nightly.yml.
 *
 * design.md § App-surface rules, "One component per concern" (founder
 * decision, 27/09/2026): a W360 screen composes apps/web/src/w360/ui.tsx and
 * never re-implements one of its components inside a page file. The Area
 * calculator's result card is the case that started this — a hand-built
 * `section.card` with its own eyebrow, value and table, beside the `Card`,
 * `KV` and `Cell` that ui.tsx already exports — and nothing counted it.
 *
 * This is a RATCHET, not a cleanup, on the model of the colour-literal budget
 * in scripts/a11y-web-tests.ts: each file below may keep the hand-built count
 * it has today and not one more, and a file that is not listed may have none.
 * The backlog that brings these numbers down is docs/specs/TODO-one-platform.md;
 * when a file's count drops, lower its budget in the same change.
 *
 * What is counted — only concerns that ALREADY have a shared component:
 *   card    an element whose class list starts with `card`   → ui.tsx Card
 *   cell    a hand-written `.k` label span (strip/kv rows)    → ui.tsx Cell / KV
 *   blank   a hand-built `.blank` empty/failed state          → ui.tsx Empty / Failed
 *   tabs    a page-local `role="tablist"`                     → the next copy lifts a
 *           TabStrip into ui.tsx instead (there are two today)
 *   shadow  a page defining a component with a ui.tsx export's name
 * Form fields, segmented controls and tables have no shared component yet, so
 * they are not budgeted here; they are TODO items 5–7.
 */
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { lineAt, stripComments, walk } from './lib/source-scan';

const ROOT = join(import.meta.dir, '..');
const W360 = join(ROOT, 'apps/web/src/w360');
const UI = join(W360, 'ui.tsx');
const rel = (p: string) => relative(ROOT, p);

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) {
    failures += 1;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

type Kind = 'card' | 'cell' | 'blank' | 'tabs' | 'shadow';
type Counts = Record<Kind, number>;
const KINDS: Kind[] = ['card', 'cell', 'blank', 'tabs', 'shadow'];
const zero = (): Counts => ({ card: 0, cell: 0, blank: 0, tabs: 0, shadow: 0 });

/** Where each hand-built concern should come from instead. */
const OWNER: Record<Kind, string> = {
  card: 'ui.tsx Card (it takes className, aside and busy)',
  cell: 'ui.tsx Cell for a strip, KV for key/value rows',
  blank: 'ui.tsx Empty or Failed',
  tabs: 'a TabStrip lifted into ui.tsx — this would be the third copy',
  shadow: 'the ui.tsx export of the same name, or a new name if it is truly different',
};

/** The components ui.tsx exports: capitalised names without an underscore
 *  (`Card`, `KV`), not constants (`ORDER_STAGES`). */
function uiExports(src: string): Set<string> {
  const names = new Set<string>();
  for (const m of src.matchAll(/export\s+(?:function|const|class)\s+([A-Z][A-Za-z0-9]*)\b/g)) names.add(m[1]);
  return names;
}

function countIn(source: string, shared: Set<string>): { counts: Counts; where: Record<Kind, number[]> } {
  const s = stripComments(source);
  const counts = zero();
  const where: Record<Kind, number[]> = { card: [], cell: [], blank: [], tabs: [], shadow: [] };
  const hit = (kind: Kind, index: number) => { counts[kind] += 1; where[kind].push(lineAt(s, index)); };
  for (const m of s.matchAll(/className=(?:"|'|\{\s*`|\{\s*['"])card(?=[\s"'`])/g)) hit('card', m.index!);
  for (const m of s.matchAll(/className=(?:"|'|\{\s*['"])k(?=["'])/g)) hit('cell', m.index!);
  for (const m of s.matchAll(/className=(?:"|'|\{\s*`|\{\s*['"])blank(?=[\s"'`])/g)) hit('blank', m.index!);
  for (const m of s.matchAll(/role=(?:"|'|\{\s*['"])tablist["']/g)) hit('tabs', m.index!);
  for (const m of s.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:function\s+([A-Z][A-Za-z0-9]*)\s*[(<]|const\s+([A-Z][A-Za-z0-9]*)\s*(?::[^=]+)?=\s*(?:\(|memo\(|forwardRef\())/g)) {
    const name = m[1] ?? m[2];
    if (shared.has(name)) hit('shadow', m.index! + (m[0].startsWith('\n') ? 1 : 0));
  }
  return { counts, where };
}

// ── Self-test: a counter that cannot count proves nothing ──────────────────
{
  const shared = new Set(['Card', 'Empty']);
  const { counts } = countIn(
    `// <section className="card">  (a comment is not a card)
     function Card() { return null; }
     const Empty = () => null;
     const x = <section className="card pad-lg"><span className="k">A</span><div className="blank boxed" /></section>;
     const y = <div className={\`card \${z}\`} role="tablist" />;
     const notACard = <div className="cardhead" />;`,
    shared,
  );
  check(
    'SC-0 the counter counts cards, cells, blanks, tab lists and shadows — and skips comments and look-alikes',
    counts.card === 2 && counts.cell === 1 && counts.blank === 1 && counts.tabs === 1 && counts.shadow === 2,
    JSON.stringify(counts),
  );
}

// ── Today's counts. Lower a number when the file improves; never raise one ──
//
// Recorded 27/09/2026 from the working tree. A hand-built card is not wrong in
// itself — `button.card.addcard` is a real variant — but every new one is a
// question the reviewer should see: why is this not <Card>?

const BUDGET: Record<string, Partial<Counts>> = {
  'apps/web/src/w360/pages/Audit.tsx': { card: 1 },
  'apps/web/src/w360/pages/HoldingLedger.tsx': { card: 1 },
  'apps/web/src/w360/pages/Holding.tsx': { card: 2 },
  'apps/web/src/w360/pages/Dashboard.tsx': { card: 2 },
  'apps/web/src/w360/pages/Desk.tsx': { card: 1 },
  'apps/web/src/w360/pages/DeskAssociates.tsx': { card: 2 },
  'apps/web/src/w360/pages/DeskCoverage.tsx': { card: 2 },
  // One of the two page-local tab strips (TODO item 4).
  'apps/web/src/w360/pages/Groups.tsx': { card: 1, tabs: 1 },
  'apps/web/src/w360/pages/Notifications.tsx': { card: 2 },
  'apps/web/src/w360/pages/OrderLand.tsx': { card: 1 },
  'apps/web/src/w360/pages/Orders.tsx': { card: 4 },
  'apps/web/src/w360/pages/OwnerChain.tsx': { card: 2 },
  // Defines its own `Card`, shadowing ui.tsx's.
  'apps/web/src/w360/pages/Properties.tsx': { card: 1, shadow: 1 },
  'apps/web/src/w360/pages/RecipientAccess.tsx': { card: 6 },
  'apps/web/src/w360/pages/RecordExpenses.tsx': { card: 1 },
  'apps/web/src/w360/pages/RecordFeatures.tsx': { card: 3 },
  'apps/web/src/w360/pages/RecordHead.tsx': { card: 1 },
  'apps/web/src/w360/pages/RecordMoney.tsx': { card: 3 },
  'apps/web/src/w360/pages/RecordNotes.tsx': { card: 2 },
  'apps/web/src/w360/pages/RecordPapers.tsx': { card: 2 },
  'apps/web/src/w360/pages/RecordPeople.tsx': { card: 5 },
  'apps/web/src/w360/pages/RecordPhotos.tsx': { card: 8 },
  'apps/web/src/w360/pages/Shared.tsx': { card: 1 },
  'apps/web/src/w360/pages/Shelf.tsx': { card: 1 },
  'apps/web/src/w360/pages/Ticket.tsx': { card: 7 },
  // AreaResult and the guideline-rate card (item 7); the fencing strip's cells;
  // the second page-local tab strip (item 4).
  'apps/web/src/w360/pages/Tools.tsx': { card: 2, cell: 4, tabs: 1 },
  'apps/web/src/w360/pages/Vault.tsx': { card: 1 },
  'apps/web/src/w360/pages/Wallet.tsx': { card: 1 },
  // Loading stand-ins mirror the real cards' boxes on purpose.
  'apps/web/src/w360/skeletons.tsx': { card: 5, cell: 1 },
};

const shared = uiExports(readFileSync(UI, 'utf8'));
check('SC-0 ui.tsx exports the shared components this counts against', ['Card', 'KV', 'Cell', 'Empty', 'Failed'].every((n) => shared.has(n)), [...shared].join(', '));

const files = walk(W360, /\.tsx$/).filter((f) => f !== UI);
check('SC-0 the scan reached the W360 screens', files.length >= 60, `${files.length} files`);

// `--print` writes today's counts as a BUDGET literal. It exists to record a
// baseline, never to raise one: a higher number is a new hand-built copy.
if (process.argv.includes('--print')) {
  const snapshot: Record<string, Partial<Counts>> = {};
  for (const f of files.sort()) {
    const { counts } = countIn(readFileSync(f, 'utf8'), shared);
    const kept = Object.fromEntries(KINDS.filter((k) => counts[k] > 0).map((k) => [k, counts[k]]));
    if (Object.keys(kept).length) snapshot[rel(f)] = kept;
  }
  for (const [file, counts] of Object.entries(snapshot)) {
    console.log(`  '${file}': { ${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(', ')} },`);
  }
  process.exit(0);
}

const over: string[] = [];
const under: string[] = [];
for (const f of files) {
  const key = rel(f);
  const { counts, where } = countIn(readFileSync(f, 'utf8'), shared);
  const budget = BUDGET[key] ?? {};
  for (const kind of KINDS) {
    const allowed = budget[kind] ?? 0;
    if (counts[kind] > allowed) {
      over.push(`${key}: ${kind} ${counts[kind]} > ${allowed} (lines ${where[kind].join(', ')}) — use ${OWNER[kind]}`);
    } else if (counts[kind] < allowed) {
      under.push(`${key}: ${kind} ${counts[kind]} < ${allowed}`);
    }
  }
}
for (const key of Object.keys(BUDGET)) {
  if (!files.some((f) => rel(f) === key)) under.push(`${key}: file is gone — delete its budget`);
}

check(
  'SC-1 no W360 file hand-builds more of a shared component than it did on 27/09/2026',
  over.length === 0,
  `\n    ${over.join('\n    ')}\n  design.md § "One component per concern": compose ui.tsx; extend it with a prop rather than copying it.`,
);
if (under.length) {
  console.log(`NOTE: counts went down — lower these budgets in scripts/shared-components-tests.ts:\n    ${under.join('\n    ')}`);
}

console.log(failures === 0 ? 'SHARED COMPONENT TESTS PASS' : `SHARED COMPONENT TESTS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
