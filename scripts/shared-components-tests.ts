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
 *   tabs    a page-local `role="tablist"`                     → ui.tsx TabStrip / TabPanel
 *   shadow  a page defining a component with a ui.tsx export's name
 *   segmented a page-local `.segmented` control                → ui.tsx Segmented / ViewToggle
 * Form fields and tables have no shared component yet, so they are not
 * budgeted here; they are TODO items 5 and 7.
 *
 * The SC-H checks below hold every /app page to design.md § Page head
 * (founder, 09/10/2026): one `PageHead`, no top-level eyebrow, commands as
 * `HeadActions` (one filled primary, at most two secondaries, ⋮), view
 * toggles and search in the toolbar band, a named browser tab, and a summary
 * line of figures on every top-level rail page (SC-H11). They are
 * not ratchets: the standard is absolute, and a failure lists each page that
 * has not adopted it yet.
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

type Kind = 'card' | 'cell' | 'blank' | 'tabs' | 'shadow' | 'segmented';
type Counts = Record<Kind, number>;
const KINDS: Kind[] = ['card', 'cell', 'blank', 'tabs', 'shadow', 'segmented'];
const zero = (): Counts => ({ card: 0, cell: 0, blank: 0, tabs: 0, shadow: 0, segmented: 0 });

/** Where each hand-built concern should come from instead. */
const OWNER: Record<Kind, string> = {
  card: 'ui.tsx Card (it takes className, aside and busy)',
  cell: 'ui.tsx Cell for a strip, KV for key/value rows',
  blank: 'ui.tsx Empty or Failed',
  tabs: 'ui.tsx TabStrip (with TabPanel); route tabs are RecordTabs/HoldingTabs',
  shadow: 'the ui.tsx export of the same name, or a new name if it is truly different',
  segmented: 'ui.tsx Segmented (ViewToggle for Grid / List / Table / Map)',
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
  const where: Record<Kind, number[]> = { card: [], cell: [], blank: [], tabs: [], shadow: [], segmented: [] };
  const hit = (kind: Kind, index: number) => { counts[kind] += 1; where[kind].push(lineAt(s, index)); };
  for (const m of s.matchAll(/className=(?:"|'|\{\s*`|\{\s*['"])card(?=[\s"'`])/g)) hit('card', m.index!);
  for (const m of s.matchAll(/className=(?:"|'|\{\s*['"])k(?=["'])/g)) hit('cell', m.index!);
  for (const m of s.matchAll(/className=(?:"|'|\{\s*`|\{\s*['"])blank(?=[\s"'`])/g)) hit('blank', m.index!);
  for (const m of s.matchAll(/role=(?:"|'|\{\s*['"])tablist["']/g)) hit('tabs', m.index!);
  for (const m of s.matchAll(/className=(?:"|'|\{\s*`|\{\s*['"])segmented(?=[\s"'`])/g)) hit('segmented', m.index!);
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
     const notACard = <div className="cardhead" />;
     const seg = <div className="segmented" role="group" />;
     const notSeg = <div className="segmented-ish" />;`,
    shared,
  );
  check(
    'SC-0 the counter counts cards, cells, blanks, tab lists, shadows and segmented controls — and skips comments and look-alikes',
    counts.card === 2 && counts.cell === 1 && counts.blank === 1 && counts.tabs === 1 && counts.shadow === 2
      && counts.segmented === 1,
    JSON.stringify(counts),
  );
}

// ── Today's counts. Lower a number when the file improves; never raise one ──
//
// `segmented` recorded 09/10/2026, when Segmented and ViewToggle were lifted
// into ui.tsx (content-header audit F15); the Page head adoption brings the
// view toggles and Services' Open / All down first.
// Recorded 27/09/2026 from the working tree. A hand-built card is not wrong in
// itself — `button.card.addcard` is a real variant — but every new one is a
// question the reviewer should see: why is this not <Card>?

const BUDGET: Record<string, Partial<Counts>> = {
  'apps/web/src/w360/pages/Audit.tsx': { card: 1 },
  'apps/web/src/w360/pages/Holding.tsx': { card: 1 },
  'apps/web/src/w360/pages/Dashboard.tsx': { card: 2 },
  'apps/web/src/w360/pages/Desk.tsx': { card: 1 },
  'apps/web/src/w360/pages/DeskAssociates.tsx': { card: 1 },
  'apps/web/src/w360/pages/DeskCoverage.tsx': { card: 1 },
  'apps/web/src/w360/pages/Notifications.tsx': { card: 2 },
  'apps/web/src/w360/pages/Orders.tsx': { card: 3 },
  'apps/web/src/w360/pages/OwnerChain.tsx': { card: 2 },
  // Defines its own `Card`, shadowing ui.tsx's.
  'apps/web/src/w360/pages/Properties.tsx': { shadow: 1 },
  'apps/web/src/w360/pages/RecipientAccess.tsx': { card: 6 },
  'apps/web/src/w360/pages/RecordFeatures.tsx': { card: 3 },
  'apps/web/src/w360/pages/RecordHead.tsx': { card: 1 },
  'apps/web/src/w360/pages/RecordMoney.tsx': { card: 3 },
  'apps/web/src/w360/pages/RecordNotes.tsx': { card: 1 },
  'apps/web/src/w360/pages/RecordPapers.tsx': { card: 2 },
  'apps/web/src/w360/pages/RecordPeople.tsx': { card: 5 },
  'apps/web/src/w360/pages/RecordPhotos.tsx': { card: 6 },
  'apps/web/src/w360/pages/Shared.tsx': { card: 1 },
  'apps/web/src/w360/pages/Ticket.tsx': { card: 2 },
  // AreaResult and the guideline-rate card (item 7); the fencing strip's cells.
  'apps/web/src/w360/pages/Tools.tsx': { card: 1, cell: 1 },
  'apps/web/src/w360/pages/Wallet.tsx': { card: 1 },
  // Loading stand-ins mirror the real cards' boxes on purpose.
  // Skeletons mirror the real cards' boxes on purpose (design.md § Loading):
  // SkTable, SkPaper and the map/record stand-ins each draw one.
  'apps/web/src/w360/skeletons.tsx': { card: 7, cell: 1 },
  'apps/web/src/w360/BoundaryMeasurementsCard.tsx': { segmented: 1 },
  'apps/web/src/w360/pages/Reader.tsx': { segmented: 1 },
  'apps/web/src/w360/paper/PaperPreview.tsx': { segmented: 1 },
};

const shared = uiExports(readFileSync(UI, 'utf8'));
check('SC-0 ui.tsx exports the shared components this counts against', ['Card', 'KV', 'Cell', 'Empty', 'Failed', 'TabStrip', 'TabPanel'].every((n) => shared.has(n)), [...shared].join(', '));

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

// ── SC-H: design.md § Page head (founder, 09/10/2026) ──────────────────────
//
// Every /app page opens with one `PageHead`. These read each `<PageHead …>`
// opening tag with a scanner that respects braces and strings (a `>` inside
// `() => x` must not end the tag), so a check reads the props a page passes.

/** Each `<PageHead` in `src`: its opening tag, the body up to `</PageHead>`
 *  (empty when self-closing), and the line it starts on. */
export function pageHeads(src: string, name = 'PageHead'): { tag: string; body: string; line: number }[] {
  const out: { tag: string; body: string; line: number }[] = [];
  const re = new RegExp(`<${name}\\b`, 'g');
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let i = m.index + m[0].length;
    let depth = 0;
    let selfClosing = false;
    while (i < src.length) {
      const c = src[i];
      if (c === '"' || c === "'" || c === '`') {
        const q = c;
        i += 1;
        while (i < src.length && src[i] !== q) i += src[i] === '\\' ? 2 : 1;
      } else if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (depth === 0 && c === '/' && src[i + 1] === '>') { selfClosing = true; i += 2; break; }
      else if (depth === 0 && c === '>') { i += 1; break; }
      i += 1;
    }
    const tag = src.slice(m.index, i);
    let body = '';
    if (!selfClosing) {
      const close = src.indexOf(`</${name}>`, i);
      body = close < 0 ? '' : src.slice(i, close);
    }
    out.push({ tag, body, line: lineAt(src, m.index) });
  }
  return out;
}

/** The text of one `name=` prop in an opening tag: `"…"`, or `{…}` balanced. */
export function propOf(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}=`).exec(tag);
  if (!m) return undefined;
  let i = m.index + m[0].length;
  const open = tag[i];
  if (open === '"' || open === "'") return tag.slice(i, tag.indexOf(open, i + 1) + 1);
  if (open !== '{') return undefined;
  let depth = 0;
  const start = i;
  for (; i < tag.length; i += 1) {
    const c = tag[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      i += 1;
      while (i < tag.length && tag[i] !== q) i += tag[i] === '\\' ? 2 : 1;
      continue;
    }
    if (c === '{') depth += 1;
    if (c === '}') { depth -= 1; if (depth === 0) return tag.slice(start, i + 1); }
  }
  return tag.slice(start);
}

/** JSX inside a prop's expression: `<Tag` or `<>`, not a `<` comparison. */
const hasJsx = (expr: string) => /<(?:[A-Za-z]|>)/.test(expr);

/** `expr` with each identifier it names that `src` declares as `const name =`
 *  followed by that initializer, one level deep. A head passed as a variable
 *  (`actions={headActions}`) is then read as the literal it stands for. */
export function expand(src: string, expr: string): string {
  let out = expr;
  // Values only: not a property read (`holding.name`) or an object key (`label:`).
  const code = expr.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, "''");
  const ids = [...code.matchAll(/(?<![.\w$])[A-Za-z_$][\w$]*(?![\w$]|:)/g)].map((m) => m[0]);
  for (const id of new Set(ids)) {
    const m = new RegExp(`\\bconst ${id.replace(/\$/g, '\\$')}\\b[^=;]*=`).exec(src);
    if (!m) continue;
    let i = m.index + m[0].length;
    let depth = 0;
    const start = i;
    for (; i < src.length; i += 1) {
      const c = src[i];
      if (c === '"' || c === "'" || c === '`') {
        const q = c;
        i += 1;
        while (i < src.length && src[i] !== q) i += src[i] === '\\' ? 2 : 1;
        continue;
      }
      if (c === '{' || c === '(' || c === '[') depth += 1;
      else if (c === '}' || c === ')' || c === ']') depth -= 1;
      if (depth < 0 || (depth === 0 && c === ';')) break;
    }
    out += `\n${src.slice(start, i)}`;
  }
  return out;
}

/** A `HeadActions` literal with its `icon: <Glyph … />` values taken out: an
 *  icon is data the head draws, not a hand-placed button. What is left with
 *  JSX in it is a hand-built command. */
const withoutIcons = (expr: string) => expr.replace(/\bicon:\s*<[A-Za-z][\s\S]*?\/>/g, 'icon: null');

// Self-test: the scanner reads props through arrows and nested braces.
{
  const sample = `const a = <PageHead title="Docs" actions={{ primary: { label: 'Add', icon: <AddOutlined sx={{ fontSize: 17 }} />, onClick: () => go(x > 1) } }} />;
    const b = <PageHead eyebrow="Account" title={greet} actions={<button className="btn primary">Go</button>}>
      <p className="lede">Words</p>
    </PageHead>;`;
  const heads = pageHeads(sample);
  check('SC-H0 the head scanner finds each PageHead, its props and its children',
    heads.length === 2
      && propOf(heads[0].tag, 'title') === '"Docs"'
      && !hasJsx(withoutIcons(propOf(heads[0].tag, 'actions') ?? '<x'))
      && hasJsx(propOf(heads[0].tag, 'actions') ?? '')
      && heads[0].body === ''
      && hasJsx(withoutIcons(propOf(heads[1].tag, 'actions') ?? ''))
      && propOf(heads[1].tag, 'eyebrow') === '"Account"'
      && heads[1].body.includes('lede'),
    JSON.stringify(heads.map((h) => h.tag.slice(0, 40))));
  const sections = pageHeads(`<SectionHead title="Media" controls={box} actions={acts} />`, 'SectionHead');
  check('SC-H0 the head scanner reads a SectionHead the same way',
    sections.length === 1 && propOf(sections[0].tag, 'controls') === '{box}');
  const declared = `const headActions: HeadActions = { secondaries: [{ label: 'A' }, { label: 'B' }, { label: 'C' }], primary: { label: 'P', onClick: () => go({ x: 1 }) } };
    const x = <PageHead title="T" actions={busy ? undefined : headActions} />;`;
  const tag = pageHeads(declared)[0].tag;
  check('SC-H0 a head passed as a variable is read as the literal it names',
    (expand(declared, propOf(tag, 'actions') ?? '').match(/\blabel:/g) ?? []).length === 4);
}

/** The PageHeads one exported screen draws: from `export function name(` to
 *  the first function-closing `}` at column 0. Undefined when there is no
 *  such export. Takes the RAW source and strips comments after slicing: a
 *  stripped multi-line `{/* … *\/}` leaves a `}` at column 0 mid-function. */
export function headsOfExport(src: string, name: string): ReturnType<typeof pageHeads> | undefined {
  const at = src.search(new RegExp(`(?:^|\\n)export function ${name}\\(`));
  if (at < 0) return undefined;
  const end = src.indexOf('\n}\n', at + 1);
  return pageHeads(stripComments(src.slice(at, end < 0 ? undefined : end)));
}

/** A `summary` prop that can state figures: present, and not only the
 *  loading placeholder or an explicit nothing. */
const statesFigures = (expr: string | undefined) =>
  expr !== undefined && !/^\{\s*(?:<Sk\b[^>]*\/>|undefined|null)\s*\}$/.test(expr);

// Self-test: SC-H11 reads each exported screen's own heads, on PageHead only.
{
  const sample = `export function Two() {
  if (busy) return <PageHead title="Two" summary={<Sk w="18rem" h="1rem" r="var(--radius-xs)" />} />;
  return <PageHead title="Two" summary={line || undefined} />;
}
export function Bare() {
  if (busy) return <PageHead title="Bare" summary={<Sk w="18rem" />} />;
  return <main><PageHead title="Bare" info="x" /><Card summary="not a head" /></main>;
}
`;
  const facts = (name: string) => headsOfExport(sample, name)?.some((h) => statesFigures(propOf(h.tag, 'summary')));
  check('SC-H11 the summary scan reads each exported screen apart, and a placeholder alone states nothing',
    facts('Two') === true && facts('Bare') === false && headsOfExport(sample, 'Gone') === undefined
      && headsOfExport(sample, 'Bare')?.length === 2,
    JSON.stringify({ two: facts('Two'), bare: facts('Bare') }));
}

{
  const ui = stripComments(readFileSync(UI, 'utf8'));
  // The component itself carries the standard: slots, the actions order and
  // the phone ⋮. Pages cannot get these wrong if PageHead gets them right.
  check('SC-H1 PageHead exposes every slot of the standard',
    /export function PageHead\(\{[\s\S]*?\bcrumbs\b[\s\S]*?\bsummary\b[\s\S]*?\bmeta\b[\s\S]*?\btabs\b[\s\S]*?\bdocTitle\b/.test(ui)
      && /export interface HeadActions\b/.test(ui));
  check('SC-H1 head actions draw secondaries, then the filled primary, then the ⋮ last',
    /function HeadActionsRow[\s\S]*?shown\.map[\s\S]*?primary && <HeadButton a=\{primary\} primary[\s\S]*?<Menu/.test(ui));
  check('SC-H1 under 600px the secondaries move into the ⋮, and never more than two are drawn',
    /function HeadActionsRow[\s\S]*?useNarrow\(PHONE_PX\)[\s\S]*?const shown = phone \? \[\] : secondaries\.slice\(0, 2\)[\s\S]*?const moved = secondaries\.slice\(shown\.length\)/.test(ui));
  check('SC-H1 head secondaries are keyed by position, so a command whose label flips keeps focus',
    /shown\.map\(\(a, i\) => <HeadButton key=\{i\}/.test(ui));
  check('SC-H1 a secondary moved into the ⋮ hands its ref to the ⋮, so focus comes back there',
    /for \(const a of moved\) setRef\(a\.ref/.test(ui) && /triggerRef=\{(?:overflowRef \|\| )?moved\.some\(\(a\) => a\.ref\)/.test(ui));
  check('SC-H1 a detail head is typed without a filled primary',
    /\{ crumbs: CrumbStep\[\]; eyebrow\?: never; actions\?: DetailActions \}/.test(ui)
      && /export type DetailActions = Omit<HeadActions, 'primary'> & \{ primary\?: never \}/.test(ui));
  check('SC-H1 the band orders tally, search, sort, view',
    /function BandTools[\s\S]*?tally[\s\S]*?\{search\}\{sort\}\{view\}/.test(ui));
  check('SC-H1 one PageHead API: no free children, no hand-built actions, no free band slot',
    !/function PageHead\([\s\S]*?\bchildren\b[\s\S]*?\n\}/.test(ui.slice(ui.indexOf('export function PageHead('), ui.indexOf('export const PlaceLine')))
      && !/actions\?: HeadActions \| ReactNode/.test(ui) && !/\btrailing\b/.test(ui));
  check('SC-H1 the view toggle is one shared component, Grid · List · Table · Map',
    /const VIEW_ORDER[^=]*= \['grid', 'list', 'table', 'map'\]/.test(ui) && /export function ViewToggle\b/.test(ui));
}

{
  // Which titles are top-level: every rail label (the Shell's literal labels,
  // plus the two drawn from constants).
  const shell = stripComments(readFileSync(join(W360, 'Shell.tsx'), 'utf8'));
  const rail = new Set([
    ...[...shell.matchAll(/\{\s*to:\s*'\/[^']*',\s*label:\s*'([^']+)'/g)].map((m) => m[1]),
    'Holdings', 'Pattadar desk',
  ]);
  check('SC-H0 the rail has labels to compare', rail.size >= 15, String(rail.size));

  // The page files: every W360 screen, plus the live /app route outside it.
  // The Document reader is design.md's named exception (its own bar); the
  // skeletons mirror heads on purpose; ui.tsx is the component. The share
  // recipient's page is public (/share/:token, /work/:token), outside /home
  // and its shell, with its own brand bar.
  const EXEMPT_HEAD = new Set([
    'apps/web/src/w360/pages/Reader.tsx', 'apps/web/src/w360/skeletons.tsx',
    'apps/web/src/w360/pages/RecipientAccess.tsx',
  ]);
  const pageFiles = [
    ...files,
    join(ROOT, 'apps/web/src/pages/AccountDataPage.tsx'),
  ];

  const handBuilt: string[] = [];
  const topEyebrow: string[] = [];
  const legacyActions: string[] = [];
  const tooMany: string[] = [];
  const headControls: string[] = [];
  const untitledTab: string[] = [];
  const children: string[] = [];
  const guidance: string[] = [];

  for (const f of pageFiles) {
    const key = rel(f);
    const src = stripComments(readFileSync(f, 'utf8'));
    if (!EXEMPT_HEAD.has(key)) {
      for (const m of src.matchAll(/className=(?:"|'|\{\s*`|\{\s*['"])pagehead(?=[\s"'`])|<h1[\s>]/g)) {
        handBuilt.push(`${key}:${lineAt(src, m.index!)}`);
      }
    }
    // Standing guidance printed as a sentence, under the head or anywhere.
    for (const m of src.matchAll(/className=(?:"|'|\{\s*['"`])lede(?=[\s"'`])/g)) guidance.push(`${key}:${lineAt(src, m.index!)}`);
    for (const h of pageHeads(src)) {
      const at = `${key}:${h.line}`;
      const titleExpr = propOf(h.tag, 'title') ?? '';
      const literal = /^["']([^"']*)["']$|^\{\s*'([^']*)'\s*\}$/.exec(titleExpr);
      let title = literal ? (literal[1] ?? literal[2]) : '';
      if (/HOLDING_WORD\.many/.test(titleExpr)) title = 'Holdings';
      if (/\bHEAD\.title\b/.test(titleExpr)) title = /const HEAD = \{\s*title: '([^']+)'/.exec(src)?.[1] ?? '';
      const top = rail.has(title) || key.endsWith('/Dashboard.tsx');
      if (top && propOf(h.tag, 'eyebrow') !== undefined) topEyebrow.push(`${at} "${title || 'Home'}"`);

      // A head passed as a variable or a call is read as what it names.
      const actions = propOf(h.tag, 'actions');
      const named = actions && expand(src, actions);
      if (named && hasJsx(withoutIcons(named))) legacyActions.push(at);
      if (named) {
        const sec = /secondaries:\s*(?:[^[]*?\?\s*)?\[([\s\S]*?)\]/.exec(named)?.[1] ?? '';
        const n = (sec.match(/\blabel:/g) ?? []).length;
        const filled = (named.match(/\bbtn primary\b/g) ?? []).length;
        if (n > 2 || filled > 1) tooMany.push(`${at} (${n} secondaries, ${filled} hand-filled)`);
      }
      // Every slot, not only the actions: a toggle in the pill or the summary
      // is still a view control in the head.
      if (/\bsegmented\b|ViewToggle|Segmented|BandSearch|<input\b|SortCycle/.test(expand(src, h.tag))) headControls.push(at);
      if (hasJsx(titleExpr) && propOf(h.tag, 'docTitle') === undefined) untitledTab.push(at);
      if (h.body.trim()) children.push(at);
    }
    // A tab's SectionHead holds commands only: its search, year, view, scope
    // or segmented choice is the band's (design.md § Page head slot 5).
    for (const h of pageHeads(src, 'SectionHead')) {
      const controls = propOf(h.tag, 'controls');
      // A hidden file picker the primary opens (Location) is not a control.
      if (controls && /\bsegmented\b|ViewToggle|Segmented|BandSearch|<input\b(?![^>]*type="file")|SortCycle|YearSelect|MultiSelect|<select\b|className="search"/
        .test(expand(src, controls))) headControls.push(`${key}:${h.line} (SectionHead controls)`);
    }
  }

  check('SC-H2 every /app page draws its head with PageHead — no hand-built `.pagehead` or <h1>',
    handBuilt.length === 0,
    `${handBuilt.length}:\n    ${handBuilt.join('\n    ')}\n  design.md § Page head; the Document reader is the one named exception.`);
  check('SC-H3 no top-level page has an eyebrow (V2)', topEyebrow.length === 0,
    `\n    ${topEyebrow.join('\n    ')}`);
  check('SC-H4 head commands are HeadActions data, not hand-placed buttons', legacyActions.length === 0,
    `${legacyActions.length}:\n    ${legacyActions.join('\n    ')}\n  actions={{ primary, secondaries, overflow }}`);
  check('SC-H5 at most one filled primary and two visible secondaries', tooMany.length === 0,
    `\n    ${tooMany.join('\n    ')}`);
  check('SC-H6 view toggles, search, sort, year and scope live in the toolbar band, not a page or section head', headControls.length === 0,
    `\n    ${headControls.join('\n    ')}\n  FacetFilter/ToolbarBand: search, sort, view`);
  check('SC-H7 a head whose title is not plain text names the tab (docTitle)', untitledTab.length === 0,
    `\n    ${untitledTab.join('\n    ')}`);
  check('SC-H8 nothing is drawn as PageHead children — use summary, meta or info', children.length === 0,
    `${children.length}:\n    ${children.join('\n    ')}`);
  check('SC-H9 no standing guidance printed under a title (`.lede`) — it goes behind the ⓘ', guidance.length === 0,
    `\n    ${guidance.join('\n    ')}`);
}

{
  // SC-H10: the routes, not the file walk, say which screens are /app pages.
  // Every element under the signed-in layout route (`id: 'app'`) in
  // routes.tsx is either a redirect, a tab
  // drawn under its parent's head (a nested `children`), a named exception,
  // or a file that composes `PageHead`. A screen that draws no head at all —
  // which SC-H2 cannot see, since it looks only for hand-built ones — fails.
  const SRC = join(ROOT, 'apps/web/src');
  const routes = stripComments(readFileSync(join(SRC, 'routes.tsx'), 'utf8'));
  const ROUTE_EXEMPT: Record<string, string> = {
    'apps/web/src/w360/Shell.tsx': 'the frame every /app page sits in',
    'apps/web/src/w360/pages/Reader.tsx': 'named exception: the full-bleed Document reader bar',
    'apps/web/src/pages/PaymentsCheckout.tsx': 'named exception: checkout keeps its own bar',
    'apps/web/src/w360/pages/MapFind.tsx': 'a redirect to Properties, not a screen',
  };
  const lazyFile = new Map<string, string>();
  for (const m of routes.matchAll(/const (\w+) = lazy\(\(\) =>\s*import\('\.\/([^']+)'\)/g)) {
    lazyFile.set(m[1], `apps/web/src/${m[2]}.tsx`);
  }
  const from = routes.indexOf("id: 'app',");
  const to = routes.indexOf("path: '/legacy',", from);
  // Fail loudly: a missing anchor would slice an empty block and pass vacuously.
  if (from < 0 || to < 0) throw new Error("SC-H10: routes.tsx lost its `id: 'app',` layout route or the `/legacy` tree after it");
  const block = routes.slice(from, to);
  // A nested `children` entry is drawn under its parent's head only when it
  // is one of the parent's tabs (Record.tsx / Holding.tsx draw the head for a
  // tab and hand a flow — order, request — the whole page).
  const tabsOf = (file: string, list: string) => {
    const t = stripComments(readFileSync(join(W360, 'pages', file), 'utf8'));
    const at = t.indexOf(`export const ${list}`);
    const body = t.slice(at, t.indexOf('\n];', at));
    return [...body.matchAll(/\b(?:to|path): '([^']*)'/g)].map((m) => m[1]);
  };
  const tabPaths = new Set([...tabsOf('RecordHead.tsx', 'TABS'), ...tabsOf('Holding.tsx', 'HOLDING_TABS')]);
  check('SC-H10 the record and holding tab lists are readable', tabPaths.has('') && tabPaths.has('site-features') && tabPaths.has('fmb'),
    [...tabPaths].join(','));
  const nested = new Set<string>();
  // Where each nested `children` list sits in `block`, so SC-H11 can read
  // the top-level routes only (`holdings/:id` has a `services` tab too).
  const inner: Array<[number, number]> = [];
  const kids = [...block.matchAll(/children:\s*\[/g)].slice(1);
  for (const k of kids) {
    let depth = 0;
    let i = k.index! + k[0].length - 1;
    const start = i;
    for (; i < block.length; i += 1) {
      if (block[i] === '[') depth += 1;
      if (block[i] === ']') { depth -= 1; if (depth === 0) break; }
    }
    inner.push([start, i]);
    for (const m of block.slice(start, i).matchAll(/\{\s*(?:index: true|path: '([^']*)'),\s*element: suspended\((\w+)\)/g)) {
      if (tabPaths.has(m[1] ?? '')) nested.add(m[2]);
    }
  }
  const screens = new Set([...block.matchAll(/suspended\((\w+)\)/g)].map((m) => m[1]));
  const noHead: string[] = [];
  // A component routes.tsx defines itself: a redirect, or a wrapper that
  // hands over to a lazy screen — never a page of its own.
  for (const m of block.matchAll(/element:\s*<(\w+)/g)) {
    const name = m[1];
    if (name === 'Navigate' || name === 'RequireAuth') continue;
    const at = routes.search(new RegExp(`\\nfunction ${name}\\(`));
    const body = at < 0 ? '' : routes.slice(at, routes.indexOf('\n}\n', at));
    if (!/<Navigate\b|suspended\(/.test(body) || /<h1[\s>]/.test(body)) noHead.push(`routes.tsx ${name}`);
    for (const s of body.matchAll(/suspended\((\w+)\)/g)) screens.add(s[1]);
  }
  for (const name of screens) {
    const file = lazyFile.get(name);
    if (!file) { noHead.push(`routes.tsx ${name} (no lazy import found)`); continue; }
    if (nested.has(name) || ROUTE_EXEMPT[file]) continue;
    if (!/<PageHead\b/.test(stripComments(readFileSync(join(ROOT, file), 'utf8')))) noHead.push(`${file} (${name})`);
  }
  check('SC-H10 the routes read: every /app element is a redirect, a tab, a named exception or a PageHead screen',
    screens.size >= 40 && lazyFile.size >= 40, `${screens.size} screens, ${lazyFile.size} lazy imports`);
  check('SC-H10 every /app screen in routes.tsx composes PageHead', noHead.length === 0,
    `${noHead.length}:\n    ${noHead.join('\n    ')}\n  design.md § Page head; the named exceptions are ${Object.keys(ROUTE_EXEMPT).join(', ')}`);

  // SC-H11: design.md § Page head, slot 3 "Summary" (founder, 09/10/2026).
  // Every top-level rail page states the account's figures under its title,
  // as Properties does ("1 property · 5.00 ac"). Each rail entry in Shell.tsx
  // is followed through its top-level route in routes.tsx to the screen's own
  // exported function — Orders.tsx holds two rail screens, so a file-wide
  // read could not tell them apart — and one of that function's PageHeads
  // must pass a `summary` that is more than the loading placeholder.
  const NOTHING_TO_COUNT: Record<string, string> = {
    '/help': 'four fixed cards and no read: there is no figure to state',
  };
  const exportOf = new Map<string, string>();
  for (const m of routes.matchAll(/const (\w+) = lazy\(\(\) =>\s*import\('\.\/[^']+'\)\.then\(\(?m\)?\s*=>\s*\(\{\s*default:\s*m\.(\w+)/g)) {
    exportOf.set(m[1], m[2]);
  }
  const routeOf = new Map<string, string>();
  for (const m of block.matchAll(/\{\s*path: '([^']*)',\s*element: suspended\((\w+)\)/g)) {
    if (inner.some(([a, b]) => m.index! > a && m.index! < b)) continue;
    routeOf.set(`/${m[1]}`, m[2]);
  }
  const shellSrc = stripComments(readFileSync(join(W360, 'Shell.tsx'), 'utf8'));
  const railPaths = [...new Set([...shellSrc.matchAll(/\bto:\s*'(\/[^']*)'/g)].map((m) => m[1]))];
  const noSummary: string[] = [];
  for (const path of railPaths) {
    if (NOTHING_TO_COUNT[path]) continue;
    const screen = routeOf.get(path);
    const file = screen && lazyFile.get(screen);
    const name = screen && exportOf.get(screen);
    if (!file || !name) { noSummary.push(`${path} (no top-level route, lazy import or export in routes.tsx)`); continue; }
    const heads = headsOfExport(readFileSync(join(ROOT, file), 'utf8'), name);
    if (!heads?.length) noSummary.push(`${path} → ${file} ${name} (no PageHead inside the exported function)`);
    else if (!heads.some((h) => statesFigures(propOf(h.tag, 'summary')))) noSummary.push(`${path} → ${file} ${name}`);
  }
  check('SC-H11 the rail reads: every /app rail entry is found, and each named exception is still on it',
    railPaths.length >= 20 && Object.keys(NOTHING_TO_COUNT).every((p) => railPaths.includes(p)),
    `${railPaths.length} rail paths: ${railPaths.join(', ')}`);
  check('SC-H11 every top-level rail page passes a `summary` (its figures) to its PageHead', noSummary.length === 0,
    `${noSummary.length}:\n    ${noSummary.join('\n    ')}\n  design.md § Page head, "Summary": "{N} {things} · {total}" from the page's own reads; `
    + `first-run empty draws none. Nothing to count: ${Object.entries(NOTHING_TO_COUNT).map(([p, why]) => `${p} (${why})`).join('; ')}`);
}

// SC-S / SC-T: the section head and the table standard (founder, 10/10/2026:
// "apply the same standards across the platform"). A section's heading is
// SectionHead (RecordHead.tsx) — title, one line of figures, guidance behind
// its ⓘ — never a hand-built `.sechead`; a data table pages with TablePager
// and labels its footer total with a row header.
{
  const src = files.map((f) => [f.replace(`${ROOT}/`, ''), readFileSync(f, 'utf8')] as const);
  const handHeads = src.filter(([f, t]) => !f.endsWith('pages/RecordHead.tsx') && /className="sechead"/.test(t)).map(([f]) => f);
  check('SC-S1 every section heading is SectionHead, never a hand-built .sechead', handHeads.length === 0,
    `${handHeads.length}: ${handHeads.join(', ')}`);
  const localPagers = src.filter(([, t]) => /Rows per page|Per page"|vault-pagination/.test(t)).map(([f]) => f);
  check('SC-T1 a table pages with the shared TablePager, never a page-local pager', localPagers.length === 0,
    `${localPagers.length}: ${localPagers.join(', ')}`);
  // Every data table can be ticked (design.md § Tables). The exceptions are
  // bounded tables that are not records of anything: calculators, fixed
  // readouts, loading stand-ins and a 2-5 row settings list. Drift, not an
  // exemption: RecordMoney's Purchase table lists registrations and still has
  // no ticks, total or pager (13/10/2026 tab action-bars audit) — Reddy's call.
  const NOT_DATA = ['skeletons.tsx', 'FenceParts.tsx', 'BoundaryMeasurementsCard.tsx', 'ScanFirst.tsx',
    'pages/IntelligenceAdmin.tsx', 'pages/RecordMoney.tsx'];
  const unticked = src.filter(([f, t]) => /className="rectable/.test(t)
    && !NOT_DATA.some((n) => f.endsWith(n)) && !/SelectAllBox|selection=\{/.test(t)).map(([f]) => f);
  check('SC-T3 every data table has tick boxes (SelectAllBox) — size and "no bulk action" are not exemptions',
    unticked.length === 0, `${unticked.length}: ${unticked.join(', ')}`);
  // Every collection page offers Grid · Table (design.md § Tables). Ledgers and
  // reference tables (Wallet, Tools, GeographyAdmin, DeskCoverage) are table-only.
  const COLLECTIONS = ['Properties', 'Groups', 'Vault', 'Shelf', 'Orders', 'Holdings', 'Invitations', 'DeskAssociates'];
  const oneView = COLLECTIONS.filter((n) => !/<ViewToggle/.test(readFileSync(join(W360, 'pages', `${n}.tsx`), 'utf8')));
  check('SC-T4 every collection page offers the Grid · Table view toggle', oneView.length === 0,
    `${oneView.length}: ${oneView.join(', ')}`);
  // One way into ordering (design.md § Tables, "One order flow"): every
  // "Order a service" goes through orderHref, and only the order page places.
  const sideDoors = src.filter(([f, t]) => /\/(records|properties)\/[^`'"]*\/order\b/.test(t)
    || (!f.endsWith('pages/OrderLand.tsx') && /placeOrder\(/.test(t))).map(([f]) => f);
  check('SC-O1 ordering has one flow: no /records/:id/order link and no order placed outside OrderLand', sideDoors.length === 0,
    `${sideDoors.length}: ${sideDoors.join(', ')}`);
  // Loading is a skeleton of the region's own shape (design.md § Loading):
  // SkTable, SkGrid, SkRows or a page skeleton — never the generic grey box.
  const boxes = src.filter(([f, t]) => /<Loading[\s/>]/.test(t)).map(([f]) => f);
  check('SC-L1 no /app screen loads as the generic Loading box — use the region\'s skeleton', boxes.length === 0,
    `${boxes.length}: ${boxes.join(', ')}`);
  const bareFoot = src.filter(([, t]) => /<tfoot>/.test(t) && !/scope="row"/.test(t)).map(([f]) => f);
  check('SC-T2 a table footer names its total with <th scope="row">', bareFoot.length === 0,
    `${bareFoot.length}: ${bareFoot.join(', ')}`);
}

console.log(failures === 0 ? 'SHARED COMPONENT TESTS PASS' : `SHARED COMPONENT TESTS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
