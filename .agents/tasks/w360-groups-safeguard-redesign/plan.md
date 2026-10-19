# Implementation Plan: W360 Families & groups (/app/groups), Safeguard tab, filters and Print

Approved by Reddy ("proceed") against `.local/ux-audits/2026-10-03-families-inactivity-safeguard/board.html`
(markers 1–7), plus his follow-up: "filters are missing, global buttons like print are missing."

## Ground rules for the implementer (read first)

- Work in the main tree `/Users/reddy.sh/reddy.sh/projects/pattadar-platform`. There is no worktree. Use absolute paths.
- Don't commit or push. Don't start or stop the dev server. It is the user's, and it answers on `http://localhost:5173`; `:5180` is down.
- The working tree is dirty with other people's in-flight work. `ui.tsx`, `w360.css`, `Tools.tsx` (the new Fence tab), `RecordHead.tsx`, `Properties.tsx`, `docs/specs/TODO-one-platform.md`, `design.md` and more all have uncommitted changes. Make only additive, targeted `str_replace` edits. Never rewrite these files wholesale. Never revert, reformat or "clean up" hunks you did not write. Before each edit, re-read the region, because other tasks (`.agents/tasks/*`) may be touching the tree.
- `Groups.tsx` has no uncommitted changes today. Note that `.agents/tasks/member-details/design.md` plans a later `?m=` member drawer in the same MembersTab and `select()`/`clearSelection()`. The changes below stay compatible with it: `select()` and `clearSelection()` drop extra params instead of replacing the query.
- Standards: one font token, weights 400/700 only, `tabular-nums` for digits, DD/MM/YYYY dates (`ddmmyyyy`), tokens only (no colour literals), and shared components from `apps/web/src/w360/ui.tsx`. No page-local copies.
- Copy: the only new words are "Safeguard", "needs action" and "set". Everything else below reuses words already on this screen or on Properties, and each one is cited.
- Baseline on the current tree, before any change:
  - `cd apps/web && bun run typecheck` passes.
  - `bun run scripts/shared-components-tests.ts` passes. It notes the user's own lowered counts for RecordNotes, Tools cell, Orders and RecordPhotos. Leave those numbers alone.

## Design decisions (recorded once, with rationale)

D1. **The tab rides in `?tab=`**, the pattern Tools uses (`Tools.tsx` `choose`). Values are `members` (the default, so it is deleted from the URL), `properties`, `safeguard` and `activity`.
- An unknown value, or `safeguard` on a group type without a family tree, falls back to Members.
- `?g=` stays as is. Choosing a different group deletes `tab`, so it lands on Members, which is today's behaviour through the `key` remount.
- The internal id `holdings` is renamed to `properties`. Ids now show in the URL, and design.md § App vocabulary says "Properties", not "holdings".

D2. **TabStrip and TabPanel are lifted into `ui.tsx`.** This is item 4 of `docs/specs/TODO-one-platform.md`.
- Counts print as RecordTabs prints them: zero is printed and dimmed with `n zero` (`RecordHead.tsx:116-128`, `w360.css:951-955`).
- The new optional `status` slot draws a glyph (`aria-hidden`) and a word. The word is part of the tab's accessible name.

D3. **The safeguard state rules live in a pure, unit-tested module**, `apps/web/src/w360/groupsView.ts`. The same goes for the member facet rules. The pattern is `combinedList.ts` with `combinedList.test.ts`.

D4. **Tab status uses Reddy's literal rule.**
- `needs action` (glyph `!`, state `warn`) when `inactiveContactGaps > 0`, or `inactivityStage === 'delivery_attention'`, or `inactivityStage !== 'active'`.
- Otherwise `set` (glyph `✓`, state `good`).
- The `closed_*` stages also count as "non-active" under this rule. See decision point DP-1.

D5. **Stage chips use StatusChip** (`ui.tsx:454`), mapped as follows:

| Stage | StatusChip state |
|---|---|
| `active` | `good` |
| `reminder_1`, `reminder_2`, `final_reminder` | `warn` |
| `family_selected`, `family_all`, `family_exhausted` | `warn` |
| `delivery_attention` | `bad` |
| `closed_head`, `closed_family` | `unknown` |
| missing or unrecognised ("Monitoring") | `unknown` |

The routine reminder stages lose the danger-red `Chip tone="alert"`.

D6. **SectionHead is imported from `./RecordHead`**, as the non-record `Orders.tsx:26` already does. It is not moved, so `RecordHead.tsx` (which has uncommitted changes) stays untouched.

D7. **The group header becomes a CSS grid** (`.grouphead`) instead of the `flexWrap: 'nowrap'` row (`Groups.tsx:401`).
- Desktop places glyph, name and facts on the left, with the link and kebab spanning both rows.
- At ≤640px the order is: glyph, name and kebab on line 1; then the facts; then "See its N properties".
- `SectionHead` can't do this, because its actions wrap to a third line with the kebab after the link.

D8. **The Members filter uses local state, not the URL**, following the Documents tab (`RecordPapers.tsx:446-470`).
- The filter is reset by the existing `key={selected.id}` remount.
- Selections for options no longer offered are dropped, as with `activeShelves` (`RecordPapers.tsx:465`).
- The filter is drawn only when the table has more than one row. A one-option filter is "the detail said twice" (`Groups.tsx:265`).

D9. **Print is the existing W360 mechanism.** `window.print()` with the shared `@media print` block (`w360.css:4410-4495`), which hides `.btn`, `.menu`, `.iconbtn`, the rail and the filter controls, keeps filter chips as provenance, and turns the page white. No new print CSS unless in-browser verification shows a defect. Print prints what is on screen: the selected group and its current tab.

## Filters and global buttons added, with what each one mirrors

`Properties.tsx` itself has **no Print button**. I checked: its page head holds the Grid/List/Map segmented control, Export and Add (`Properties.tsx:968-990`). Print exists elsewhere in W360 as a page-head action (`VillageMaps.tsx:964-966`) and as a menu item (`RecordBoundary.tsx:907-909`). So Print below mirrors `VillageMaps.tsx`, through the same mechanism as every W360 print.

| # | Added | Where | Mirrors |
|---|---|---|---|
| F1 | `FacetFilter` over the Members table: the "+ Filter" trigger, active chips, "Clear all" | MembersTab, between the note/"Add a person" row and the table | `Properties.tsx:1019-1043`, `Combined.tsx:128-143`, `RecordPapers.tsx:663-670` (shared `ui.tsx:483`) |
| F1a | Facet group **Relationship**, or **Role** for groups without a tree. Options are the exact words the column prints. | same | The column header and cell at `Groups.tsx:741` and `:786` |
| F1b | Facet group **Status**. Options are `memberStatusChip(m).label` (Active, Invited, Pending, Revoked). Offered only when some member has one. | same | The Status column at `Groups.tsx:745` and `:836-840` |
| F1c | Tally `"{shown} of {rows} shown"` | FacetFilter `tally` | `Properties.tsx:1026`, `Combined.tsx:133` |
| F1d | Filtered-to-nothing state: `Empty boxed h="12rem" icon="search" title="No members match these filters"` with `action` = `<button className="btn sm">Clear filters</button>` | MembersTab | `RecordFeatures.tsx:920`, `Orders.tsx:682-683` |
| G1 | **Print**: `<button type="button" className="btn" onClick={() => window.print()}><PrintOutlined sx={{ fontSize: 16 }} /> Print</button>` | `PageHead` actions, before "New group". Only when `list.length > 0`, because Properties draws no head actions on an empty account (`Properties.tsx:968-972`). | `VillageMaps.tsx:964-966`; head-action order "secondary before the add" from `Properties.tsx:985-990` |
| G2 | **"+ New group" outlined** (`btn`, not `btn primary`) | `PageHead` actions | `RecordHead.tsx:346-351` (header actions outlined; each tab's own action is the filled one) |

Not added. Each of these is a decision point below: Export, search, sort, the Grid/List/Map toggle, an email-verified facet, and filters on the Properties and Activity tabs.

---

## Steps

- [ ] 1. **Lift `TabStrip` and `TabPanel` into `ui.tsx`, with a per-tab status slot, and add their CSS.**
  - Add to `apps/web/src/w360/ui.tsx`, as a new `// ── Tabs ──` section after `SortCycle` (around `ui.tsx:650`, before `// ── Atoms`). Add `KeyboardEvent` to the existing `import type { … } from 'react'`.
  - The code is moved verbatim from `Groups.tsx:512-560`, with these changes:
    - The count class is `n > 0 ? 'n' : 'n zero'`, mirroring `RecordHead.tsx:128`.
    - The status span is new.
    - The doc comment keeps the existing explanation of the `role="tablist"` keyboard contract.

    ```ts
    export interface TabStripStatus { glyph: string; word: string; state: 'good' | 'warn' | 'bad' }
    export interface TabStripTab<T extends string> {
      id: T;
      label: string;
      /** A count beside the label, printed as RecordTabs prints it: zero is shown, dimmed. */
      n?: number;
      /** A status beside the label: a glyph and a word. The glyph is aria-hidden and the word
       *  is part of the tab's accessible name, so a status never rests on a glyph or colour. */
      status?: TabStripStatus;
    }
    export function TabStrip<T extends string>({ tabs, value, onChange, label, idBase }: {
      tabs: TabStripTab<T>[]; value: T; onChange: (id: T) => void; label: string; idBase: string;
    })
    // inside each <button role="tab">: {t.label}
    //   {t.n !== undefined && <span className={t.n > 0 ? 'n' : 'n zero'}>{num(t.n)}</span>}
    //   {t.status && <span className={`tabstatus ${t.status.state}`}><span className="glyph" aria-hidden>{t.status.glyph}</span> {t.status.word}</span>}
    export function TabPanel({ idBase, id, children }: { idBase: string; id: string; children: ReactNode })
    //   <div role="tabpanel" id={`${idBase}-panel-${id}`} aria-labelledby={`${idBase}-tab-${id}`}>{children}</div>
    ```

  - Add to `apps/web/src/w360/w360.css`, directly after `.w360 .tabs .n.zero` (`w360.css:955`). This is additive only.

    ```css
    /* A tab's status (TabStrip `status`): a glyph and a word, in the state's own token, not the
       accent — the accent marks the current tab, and a warning is not an action. */
    .w360 .tabs .tabstatus { display: inline-flex; align-items: center; gap: 0.25rem; margin-left: 0.3125rem; font-size: 0.8125rem; font-weight: 400; }
    .w360 .tabs .tabstatus.warn { color: var(--w-warn); }
    .w360 .tabs .tabstatus.good { color: var(--w-ok); }
    .w360 .tabs .tabstatus.bad { color: var(--w-danger); }
    .w360 .tabs .tabstatus .glyph { display: inline-grid; place-items: center; width: 1rem; height: 1rem; border: 1.5px solid currentColor; border-radius: var(--radius-pill); font-size: 0.6875rem; font-weight: 700; line-height: 1; }
    ```

    Confirm `--w-ok`, `--w-warn`, `--w-danger` and `--radius-pill` are declared in all three schemes (`grep -n "\-\-w-ok\|\-\-radius-pill" w360.css`). `a11y-web-tests.ts` fails on an undeclared var.
  - Files: `apps/web/src/w360/ui.tsx`, `apps/web/src/w360/w360.css`.
  - Verify: `cd apps/web && bun run typecheck` passes. The new exports are unused for now, which is fine.

- [ ] 2. **Make Tools use the shared strip.** Delete the page-local `TabStrip` and `Panel` (`Tools.tsx:70-126`, the `// ── Tab strip ──` section).
  - Import `TabStrip, TabPanel` from `'../ui'`, extending the existing `import { Card, Empty, Failed, Loading, PageHead, num, plural } from '../ui'`.
  - Replace both `<Panel idBase=… id=…>` uses (`Tools.tsx:663` and `:821`) with `<TabPanel …>`.
  - Remove `useRef` and `KeyboardEvent` from Tools' React imports only if nothing else in Tools uses them. `grep` first, because the user's Fence work may.
  - Don't touch any other hunk of Tools.tsx.
  - Files: `apps/web/src/w360/pages/Tools.tsx`.
  - Verify:
    - `cd apps/web && bun run typecheck` passes.
    - `cd tests/e2e-app && APP_WEB_URL=http://localhost:5173 ./node_modules/.bin/playwright test specs/19-sections-legacy.spec.ts -g "tool" --project=app --reporter=line --output=/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/pw-groups-out` passes. This covers the five tool tabs, `?tab=` and Arrow keys.

- [ ] 3. **Create the pure view module and its unit tests.**
  - Create `apps/web/src/w360/groupsView.ts`. It imports `memberStatusChip` and `relMeta` from `'../pages/families/familiesData'`, `type GroupMember` from the same place, `type GroupRow` from `'./groupsData'`, and `type FacetFilterGroup` and `type TabStripStatus` from `'./ui'`. It exports:
    - `SAFEGUARD_STAGE`, moved verbatim from `Groups.tsx:349-360`.
    - `SAFEGUARD_STATE: Record<string, 'good' | 'warn' | 'bad' | 'unknown'>`, per D5.
    - `safeguardStage(g) → { word: string; state: string }`. The word falls back to `'Monitoring'`, as today at `Groups.tsx:443`; the state falls back to `'unknown'`.
    - `safeguardNeedsAction(g) → boolean`, per D4.
    - `safeguardTabStatus(g) → TabStripStatus`, giving `{ glyph: '!', word: 'needs action', state: 'warn' }` or `{ glyph: '✓', word: 'set', state: 'good' }`.
    - `cap`, moved from `Groups.tsx:136-139`.
    - `memberRelationWord(m, hasTree)`. This is the exact cell expression from `Groups.tsx:786`: `m.isSelf && m.role ? cap(m.role) : hasTree ? relMeta(m.relation).label : m.role || '—'`.
    - `memberFacets(members, hasTree): FacetFilterGroup[]`.
      - Group `{ key: 'rel', label: hasTree ? 'Relationship' : 'Role' }`. Options are the distinct `memberRelationWord` values except `'—'`, keyed by the word, with counts, in first-seen order.
      - Group `{ key: 'status', label: 'Status' }`. Options are the distinct `memberStatusChip(m).label` values except `'—'`.
      - A group with no options is omitted.
    - `matchesMember(m, selected: Record<string, readonly string[]>, hasTree): boolean`. Options OR within a group and AND across groups. An empty selection matches.
  - Create `apps/web/src/w360/groupsView.test.ts` (`bun:test`, the style of `combinedList.test.ts`). It covers:
    - every stage's word and state, plus the unknown/empty stage;
    - `needs action` for a contact gap, for `delivery_attention`, for each reminder stage and for `closed_head`;
    - `set` for active with no gaps;
    - facets counted correctly, with no option nobody carries, and Role instead of Relationship for a non-tree group;
    - the self row reading `cap(role)`;
    - `matchesMember` OR/AND semantics, including an intersection that matches nothing.
  - Files: `apps/web/src/w360/groupsView.ts`, `apps/web/src/w360/groupsView.test.ts`.
  - Verify: `bun test apps/web/src/w360/groupsView.test.ts` passes, and `cd apps/web && bun run typecheck` passes.

- [ ] 4. **Rebuild the Groups detail: the Safeguard tab, the header grid, `?tab=`, outlined New group and Print.** Depends on steps 1 and 3. File: `apps/web/src/w360/pages/Groups.tsx`.
  1. **Imports.**
     - Add `PrintOutlined` from `@mui/icons-material/PrintOutlined`.
     - Add `StatusChip, TabStrip, TabPanel, FacetFilter` and `type TabStripTab` to the `'../ui'` import.
     - Import `SectionHead` from `'./RecordHead'` (D6).
     - Import the `groupsView` helpers, and delete the local `SAFEGUARD_STAGE` and `cap`.
     - Drop `useRef`, which only the deleted TabStrip used.
     - Keep `Chip`; the You/heir/minor tags still use it.
  2. **`Groups()`.**
     - Read `const tabParam = params.get('tab') ?? ''`.
     - In `select(id)`, `next.delete('tab')` when `id !== selected?.id`.
     - In `clearSelection()`, also `next.delete('tab')`.
     - Add `const chooseTab = (t: TabId) => { const next = new URLSearchParams(params); if (t === 'members') next.delete('tab'); else next.set('tab', t); setParams(next, { replace: true }); }`.
     - Pass `tab={tabParam}` and `onTab={chooseTab}` to `GroupDetail`.
     - Change PageHead actions (G1, G2): `<>{Print button}<button type="button" className="btn" onClick={() => setCreating(true)}><AddOutlined sx={{ fontSize: 16 }} /> New group</button></>`, still only when `list.length > 0`. Add a one-line comment citing `RecordHead.tsx:346-351` ("fill means act").
     - "Create your first group" in the empty state stays `btn primary`.
  3. **`GroupDetail`.**
     - `type TabId = 'members' | 'properties' | 'safeguard' | 'activity'`.
     - Build `tabs: TabStripTab<TabId>[]` as Members (`n: rowCount(...)`), Properties (`n: holdingCount(group)`), then, only `if (def.hasTree)`, `{ id: 'safeguard', label: 'Safeguard', status: safeguardTabStatus(group) }`, then Activity.
     - Resolve the current tab with `const tab = tabs.some((t) => t.id === raw) ? raw as TabId : 'members'`.
     - Delete the `useState` tab.
     - Delete the whole `.card.accent` safeguard box (`Groups.tsx:432-477`).
     - Render `<TabStrip tabs={tabs} value={tab} onChange={onTab} label={`${group.name} detail`} idBase={group.id} />` and `<TabPanel idBase={group.id} id={tab}>`, holding `MembersTab`, `HoldingsTab` (now `tab === 'properties'`), `SafeguardTab` and `ActivityTab`.
     - `NotifierDialog` stays where it is, opened by the existing `notifiers` state.
  4. **Header (D7).**
     - Replace the `row between`/`flexWrap: 'nowrap'` markup with `<div className="grouphead">`. Its children, in this order:
       - `<span className="avatarlg">…TypeGlyph…</span>`
       - `<h2 className="grouphead-name">{group.name}</h2>`
       - `<span className="grouphead-menu"><Menu …existing props… /></span>`
       - `<div className="grouphead-facts">` holding the existing subtitle `<p className="note">` and optional description `<p>`. Copy and comments are unchanged.
       - `{holdingCount(group) > 0 && <Link className="btn grouphead-link" to=…>See its …</Link>}`
     - Add CSS after the `.sechead` block (around `w360.css:997`, additive):

       ```css
       /* The group's identity row (Groups.tsx). A grid, so a phone can put the kebab beside the name
          and the facts and link underneath instead of squeezing the facts into a one-word column. */
       .w360 .grouphead { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto;
         grid-template-areas: "glyph name link menu" "glyph facts link menu";
         column-gap: var(--space-md); row-gap: 0.125rem; align-items: start; margin-bottom: var(--space-md); }
       .w360 .grouphead > .avatarlg { grid-area: glyph; }
       .w360 .grouphead-name { grid-area: name; margin: 0; min-width: 0; }
       .w360 .grouphead-facts { grid-area: facts; min-width: 0; }
       .w360 .grouphead-link { grid-area: link; }
       .w360 .grouphead-menu { grid-area: menu; }
       @media (max-width: 640px) {
         .w360 .grouphead { grid-template-columns: auto minmax(0, 1fr) auto;
           grid-template-areas: "glyph name menu" "facts facts facts" "link link link"; row-gap: var(--space-xs); }
         .w360 .grouphead-link { justify-self: start; }
       }
       ```

  5. **New `SafeguardTab({ group, onConfigure })`.**
     - It renders the SectionHead (markers 4–6). The `info` text is the existing sentence moved verbatim from `Groups.tsx:447`. The `actions` button changes from `btn sm` to filled, because it is this tab's own action (marker 1):

       ```tsx
       <SectionHead
         title="Inactivity safeguard"
         sub={<><StatusChip state={stage.state}>{stage.word}</StatusChip>{facts && <> {facts}</>}</>}
         info="After 6 months of inactivity: a reminder to the head, then verified family emails."
         actions={<button type="button" className="btn primary" onClick={onConfigure}>Configure notifiers</button>}
       />
       ```

     - `facts` is the existing line from `Groups.tsx:449-457`, with nothing added: `[lastActiveAt ? `You were last active ${ddmmyyyy(...)}` : '', inactivityNextAt ? `Next check ${ddmmyyyy(...)}` : ''].filter(Boolean).join(' · ')`, plus the existing `· Last outcome: …` suffix.
     - Below the head comes `<div style={{ display: 'grid', gap: 'var(--space-xs)', justifyItems: 'start' }}>` containing:
       - `{stage === 'delivery_attention' && <StatusChip state="warn">Delivery not confirmed. Contact support before retrying.</StatusChip>}`
       - `{gaps > 0 && <StatusChip state="warn">{plural(...existing words...)} a verified email before everyone can be contacted.</StatusChip>}`
     - The `div` is omitted when neither row applies. No `.accent`, no frame.
  6. **Header comment.** Fix the stale "What is deliberately NOT here: View holdings…/Land tab" paragraph (`Groups.tsx:23-29`, audit drift item 1). Say instead that the header's "See its N properties" opens `/app/properties?group=<id>` (Properties reads `?group=`, `Properties.tsx:507-512`). Then add one sentence: the detail's tabs are Members · Properties · Safeguard · Activity, the tab rides in `?tab=`, and the safeguard only exists for types with a family tree.
  - Verify:
    - `cd apps/web && bun run typecheck` passes.
    - `bun run scripts/shared-components-tests.ts` prints a NOTE that Groups card 0 < 1 and tabs 0 < 1. It must not FAIL.
    - Quick sealed smoke: `cd tests/e2e-app && APP_WEB_URL=http://localhost:5173 ./node_modules/.bin/playwright test specs/21-routing.spec.ts -g "groups|every address" --project=app --reporter=line --output=/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/pw-groups-out` passes.

- [ ] 5. **Add the Members filter (F1–F1d).** Depends on steps 3 and 4. File: `apps/web/src/w360/pages/Groups.tsx`, in `MembersTab`.
  - Add `const [sel, setSel] = useState<Record<string, string[]>>({})`.
  - Add `const facets = useMemo(() => memberFacets(members, hasTree), [members, hasTree])`.
  - Derive `active` by keeping only selected keys that are still offered (D8).
  - Derive `shown = members.filter((m) => matchesMember(m, active, hasTree))`.
  - Toggle: `(group, key) => setSel(...)`. Clear: `() => setSel({})`.
  - After the existing note/"Add a person" row, and only when `members.length > 1`, render `<FacetFilter groups={facets} selected={active} onToggle={toggle} onClear={clear} tally={`${shown.length} of ${members.length} shown`} />`.
  - Leave `cols` (column visibility) computed over **all** `members`, so filtering never makes columns jump.
  - Render rows from `shown`.
  - When `members.length > 0 && shown.length === 0`, render the F1d `Empty` instead of the table.
  - Replace the Relationship cell expression with `memberRelationWord(m, hasTree)`, so the cell and the filter use one rule.
  - Verify: `cd apps/web && bun run typecheck` passes, and `bun test apps/web/src/w360/groupsView.test.ts` passes.

- [ ] 6. **Lower the guard budgets and point the guard at the shared strip.** File: `scripts/shared-components-tests.ts`.
  - Delete the `'apps/web/src/w360/pages/Groups.tsx': { card: 1, tabs: 1 }` entry and its comment. The count is now 0/0, because the `.card.accent` box is gone.
  - Change Tools to `{ card: 2, cell: 4 }`, removing `tabs: 1`, and remove "the second page-local tab strip (item 4)" from its comment. Leave `cell: 4` as is: the drop to 1 is the user's in-progress work, not this task's.
  - Update the header doc line for `tabs` to `a page-local role="tablist" → ui.tsx TabStrip / TabPanel`.
  - Update `OWNER.tabs` to `'ui.tsx TabStrip (with TabPanel); route tabs are RecordTabs/CombinedTabs'`.
  - Add `'TabStrip'` and `'TabPanel'` to the `SC-0 ui.tsx exports …` list.
  - Verify: `bun run scripts/shared-components-tests.ts` prints `SHARED COMPONENT TESTS PASS`, with no NOTE for Groups or Tools tabs.

- [ ] 7. **Write the sealed functional-acceptance spec.** Create `tests/e2e-app/specs/30-groups.spec.ts`.
  - Follow `tests/e2e-app/AUTHORING.md`: import from `'../fixtures/harness'`, never edit `fixtures/`, give every test a behaviour sentence for a title, and no `waitForTimeout`.
  - The screen reads through the root schema, so set answers per test before `goto`:
    - `world.set('root.groups', [...])`, using full `GroupRow` objects. Read `GROUP_FIELDS_HOLDINGS` in `groupsData.ts` for the shape.
    - `root.members` with three members: self Head, a spouse who is `verified` with a masked Aadhaar such as `XXXXXXXX1234`, and a son who is `pending` with an inviteToken, so `Invited`.
    - `root.groupActivity` as `[]` and `root.notifiers` as `[]`.
    - Mutations: `root.setNotifiers`, `root.createGroup`, `root.updateGroup`, `root.deleteGroup`, `root.removeMember`.
    - `web.properties` is seeded already.
  - Failure-path tests go in a `describe` with `test.use({ allowConsole: true })` and a comment saying the error is provoked (rule 8).
  - Tests:

    | # | Title (paraphrase) | What it does and asserts |
    |---|---|---|
    | 1 | A family's safeguard is its own tab, and while a member has no verified email it says it needs action. | The tablist shows `Members`, `Properties`, `Safeguard needs action`, `Activity` in order. Members is `aria-selected`. No "Inactivity safeguard" heading on Members. Click Safeguard: h2 "Inactivity safeguard", the chip "Active", the warn line "1 member needs a verified email…", and `?tab=safeguard` in the URL. The ⓘ "About Inactivity safeguard" reveals "After 6 months of inactivity…". |
    | 2 | With every contact verified and the stage active, the tab reads set and no warning is drawn. | Tab name `Safeguard set`. |
    | 3 | A reminder stage reads as a warning, not danger. | `reminder_1`: the chip text is "First reminder sent" and the tab is `needs action`. Uses the `.schip.warn` class, with a comment saying why: no role or text distinguishes the tone. |
    | 4 | A partnership has no Safeguard tab. | |
    | 5 | `?tab=safeguard` opens the tab on arrival, and choosing another group lands on Members. | Two groups. |
    | 6 | Arrow, Home and End move between the four tabs. | |
    | 7 | Configure notifiers opens the existing dialog and saves. | `expect.poll(() => world.calls('root.setNotifiers').length).toBe(1)`. Failure path: `World.gqlError` keeps the dialog open and shows a toast with "Nothing has changed". |
    | 8 | The member filter narrows the table by relationship and status, says how many are shown, and Clear all brings everyone back. | Tally `1 of 3 shown`. Then Relationship Spouse + Status Invited gives "No members match these filters", and "Clear filters" restores 3 rows. |
    | 9 | Print hands the page to the browser's print, and the Aadhaar stays masked on paper. | `page.addInitScript` stubs `window.print` with a counter. Click Print and assert one call. Then `page.emulateMedia({ media: 'print' })`. Assert that the masked Aadhaar cell is visible, that `document.body.innerText` has no `\d{12}` run, and that "Add a person", "+ Filter" and "Print" are hidden. |
    | 10 | New group is outlined, so the tab's own action is the one filled button in view. | Counts visible `.btn.primary` in the viewport as 1 on Members and 1 on Safeguard, with a class comment. Then New group, then create: one `root.createGroup` call and a toast. Failure: `World.gqlError` keeps the dialog open with the typed name. |
    | 11 | The group's own actions still work after the header change. | Kebab → Edit: one `root.updateGroup` call. Kebab → Delete → confirm: one `root.deleteGroup` call. Failure path: the dialog stays. |
    | 12 | Removing a member from a filtered table removes that member. | Filter to Spouse, row kebab → Remove from this group → Remove: one `root.removeMember` call with the spouse id. Failure path: the dialog stays. |
    | 13 | `@phone` The group header wraps: name and menu on line 1, then the facts, then "See its N properties", and nothing pushes the page sideways. | Bounding boxes: kebab top ≈ name top, facts top > name bottom, link top > facts top. `scrollWidth - clientWidth ≤ 1`. |
    | 14 | "Add a person" still opens the member form. | Lazy PersonDialog: heading "Add person", or whatever it renders. Read `pages/families/PersonDialog.tsx`. Cancel closes it. Saving through PersonDialog is listed as UNVERIFIED if the root `addMember` answer can't be shaped without editing fixtures. |

  - Verify: `cd tests/e2e-app && APP_WEB_URL=http://localhost:5173 ./node_modules/.bin/playwright test specs/30-groups.spec.ts --project=app --project=phone --reporter=line --output=/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/pw-groups-out` passes in both projects. A real defect found gets `test.fail()` with a cause comment, per rule 5. **Don't** soften an assertion.

- [ ] 8. **Fix the stale spec comment.** In `tests/e2e-app/specs/07-record-people.spec.ts:1431-1434`, replace "…belongs to the previous interface: W360 never redrew Families & Groups, so /app/groups is a signpost and the working screen is /legacy/groups." with an accurate sentence: `/app/groups` is the W360 screen (`w360/pages/Groups.tsx`), which opens this same PersonDialog lazily from "Add a person"; these tests drive it through `/legacy/groups`, whose families hooks read the legacy GraphQL surface described below. Leave the rest of the comment and all test code unchanged.
  - Verify: `cd tests/e2e-app && APP_WEB_URL=http://localhost:5173 ./node_modules/.bin/playwright test specs/07-record-people.spec.ts -g "legacy/groups|PersonDialog|person" --project=app --reporter=line --output=/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/pw-groups-out` passes, or matches its pre-change result. Run it once before the edit to record that.

- [ ] 9. **Update the docs (runbook-consistency).**
  - `docs/specs/2026-09-19-family-household-management-functional-design.md:410` (§19 Repository evidence): the Groups.tsx bullet becomes "household detail with Members · Properties · Safeguard · Activity tabs; the Safeguard tab (family-tree types only) holds the inactivity status, its explanation behind ⓘ and the notifier-priority dialog". §11.1 is a requirement list; leave it.
  - `docs/specs/TODO-one-platform.md:55` (item 4): record that `ui.tsx` `TabStrip`/`TabPanel` now serve Tools.tsx and Groups.tsx (03/10/2026), and that the remaining work is `RouteTabs` for RecordHead/CombinedProperty. Item 10 (`:61`): change "Groups.tsx `STATE_OF`" only if it moved. It doesn't move in this plan, so leave it. This file has uncommitted user edits, so use a targeted `str_replace` only.
  - **Don't edit `design.md`.** The vocabulary row is DP-7.
  - Verify: the replaced text shows only the intended hunks under `git diff --stat`, and `rg -n "signpost" tests/e2e-app/specs/07-record-people.spec.ts` no longer matches the /app/groups sentence.

- [ ] 10. **Run the full verification.** Fix failures and rerun the failed layer. See the verify-change matrix.
  1. `cd apps/web && bun run typecheck`
  2. `bun test apps/web/src/w360/groupsView.test.ts`, then `bun test packages/core packages/tokens apps/web/src apps/mobile/tests apps/university/src`. The second is the CI web set; report any pre-existing failures unrelated to these files as such.
  3. `for s in scripts/*-tests.ts; do echo "── $s"; bun run "$s" || exit 1; done`. This includes `shared-components-tests.ts`, `typography-tests.ts`, `a11y-web-tests.ts`, `contrast-tests.ts` and `aadhaar-digits-tests.ts`.
  4. `bun run scripts/icon-guard.ts` and `bun run scripts/ux-guards.ts`.
  5. Sealed e2e, both projects, all with `APP_WEB_URL=http://localhost:5173 … --reporter=line --output=<repo>/.local/pw-groups-out`:
     - `specs/30-groups.spec.ts`
     - `specs/26-one-font.spec.ts` (one face, with the new glyph span)
     - `specs/21-routing.spec.ts -g "groups|every address"`
     - `specs/19-sections-legacy.spec.ts -g "tool"`
     - `specs/01-shell.spec.ts -g "Families"`
     - `specs/24-responsive.spec.ts`
  6. In-browser checks, through the sealed spec, not the user's session:
     - the print preview for Members and for Safeguard (`emulateMedia print`), confirming the header grid and tab status print legibly;
     - Light and High Contrast focus rings on the tabs (theme menu per evidence-capture § Interaction states);
     - the warn status contrast in all three schemes.

     Fix any defect found. Don't dismiss anything as "already working" from code alone.
  7. `cd /Users/reddy.sh/reddy.sh/projects/pattadar-platform && bun run build` (Vite build of the bundle). Mention that it writes `apps/web/dist`; remove it afterwards if it was absent before (`git status` check).
  - Expected: every command exits 0, or a pre-existing failure is shown to reproduce on the untouched files.

- [ ] 11. **Capture sealed BEFORE | AFTER (heuristic-ux-audit handoff, evidence-capture.md § 2).**
  - BEFORE is the existing `.local/ux-audits/2026-10-03-families-inactivity-safeguard/evidence/groups-{incomplete,complete}-{app,phone}-{top,full}.png`.
  - Record `git status --short --untracked-files=all tests/ | shasum` **after** step 7's permanent spec exists.
  - Write a temporary `tests/e2e-app/specs/zz-ux-audit-groups-after.spec.ts` with the same two states (one contact gap, fully set) and two fixture members, using `@phone` and `reducedMotion: 'reduce'`. It writes to `…/2026-10-03-families-inactivity-safeguard/after/`:
    - `groups-{incomplete,complete}-{app,phone}-{top,full}.png`;
    - `groups-incomplete-safeguard-{app,phone}-top.png` (the Safeguard tab selected);
    - `groups-members-filtered-app-top.png`;
    - `groups-print-app-full.png` (`emulateMedia print`).
  - Run it per evidence-capture § Run, with `APP_WEB_URL=http://localhost:5173` and `--output=<audit>/pw-output`.
  - Write `…/after/before-after.html`: a two-column page of `<img>` pairs labelled BEFORE and AFTER, one row each for incomplete-app-top, incomplete-phone-top, complete-app-top and Safeguard selected. Render it with `tests/e2e-app/node_modules/.bin/playwright screenshot --full-page --viewport-size=2040,1200 "file://…/after/before-after.html" "…/after/before-after.png"`. Read it back only through a `sips -Z 2000` copy in `scratch/`.
  - Then delete the temporary spec and `pw-output`, and re-run the shasum, which must match.
  - The final message lists the absolute paths of `before-after.png` and the AFTER captures, one per line, for the top-level agent to present.

- [ ] 12. **Change-governance report and cleanup.**
  - Remove `.local/pw-groups-out`, any `scratch/` copies you made, and `apps/web/dist` if you created it.
  - Stop nothing you didn't start. You started no server.
  - Report in five parts:
    - **Docs**: steps 8–9, and DP-7 pending.
    - **Architecture**: client-only; no route, contract, trust-boundary or data-flow change. `?tab=` is view state. `docs/architecture.md` is unaffected.
    - **Security/privacy**: Print uses the browser's own `window.print()` over the same DOM. Aadhaar renders only through `formatAadhaarMask(m.aadhaarMasked)` (server-masked), and test 9 proves there is no 12-digit run in print media. No export or new data leaves the app. Residual risk: Ctrl+P while PersonDialog is open prints that form's fields; this is browser-level and pre-existing on every screen. No auth, storage, share or identity change.
    - **Testing/evidence**: each operation from step 7 marked worked, failed or unverified. `e2e-web360` (real DB) was not run, because it needs an approved disposable `TEST_PG_DSN`; there is no contract change, so the sealed suite is the instrument. CI was not run.
    - **Cleanup**.

---

## DECISION POINTS for Reddy (not built; send back)

- **DP-1. What "set" means for closed cycles.** `closed_head` ("Confirmed by the head") and `closed_family` are not `active`, so the approved rule shows "! needs action". The server treats them, with `family_all` and `family_exhausted`, as closed (`services/api/src/main.py:2990`). Recommendation: `closed_head` → "✓ set". Built as approved until you decide.
- **DP-2. Export on Families & groups.** Properties and Combined views have Export (CSV) in the page head (`Properties.tsx:985-988`, `Combined.tsx:111-113`, shared `downloadCsv` in `ui.tsx:757`). A members export would carry names, phones, emails, DOB and masked Aadhaar out of the app: a DPDP data-export surface. It needs a privacy review and the column choice. Recommendation: not now.
- **DP-3. Search over Members.** Documents has a search box in its section head (`RecordPapers.tsx:621-630`), but design.md § App-surface rules forbids "search-as-filter layouts" beside FacetFilter, and it would need new copy ("Search members"). Recommendation: no, given group sizes.
- **DP-4. Sort.** Properties and Combined have `SortCycle` (`Properties.tsx:1034-1041`). Members has no sort today, and presets need new copy. Recommendation: no.
- **DP-5. More member facets.** "Verified email" (`emailVerified`, which drives the contact gap) and heir/minor/You (the chips at `Groups.tsx:779-781`). These are existing data, but the facet labels would be new copy. The verified-email facet would pair well with the Safeguard warning. Recommendation: add the "Email verified" facet in a follow-up, if you approve its wording.
- **DP-6. Filters on the Properties and Activity tabs.** HoldingsTab deliberately defers filtering to the real Properties screen through "See its N properties", which opens `/app/properties?group=` with every facet (`Groups.tsx` HoldingsTab comment; `Properties.tsx:507-512`). Activity has no facet data. Recommendation: none.
- **DP-7. design.md § App vocabulary.** Add a row: "Household inactivity safeguard → tab **Safeguard**, heading **Inactivity safeguard**; status words **needs action** · **set**". design.md was not edited, because that is your edit.
- **DP-8. SectionHead on Members, Properties and Activity.** Every Properties tab is headed by its own noun (design.md § Property tabs "Headings name the tab"). Doing the same here would add "Members", "Properties" and "Activity" headings, which repeat the tab labels. Recommendation: yes for consistency, as a separate change. Only Safeguard gets one now, as approved.
- **DP-9. Print scope.** Print prints what is on screen: the group, the current tab and any active filter chips, as provenance. An alternative is "Print this group", which prints Members and Safeguard together. That is a new print layout. Recommendation: keep what is on screen.
- **DP-10. Notifier editing.** It stays the modal `Dialog` (approved). Properties edits through the shared `Drawer` (`Drawer.tsx`). The member-details design (`.agents/tasks/member-details/design.md`) also introduces a drawer on this screen, so moving the notifier editor is a separate choice.
- **DP-11. The Grid/List/Map toggle** (`Properties.tsx:976-984`): not applicable. Members have no grid card or geometry, and Combined.tsx's header gives the same "a toggle with one working option is furniture" reasoning. Listed so its absence is a decision, not an omission.

## Not verified by this plan (to be settled during implementation)

- Whether Print and the filter actually render as intended. Steps 7, 10.6 and 11 must show it in the browser. The plan reads the global print CSS as covering this screen, but nothing has rendered it yet.
- Saving through PersonDialog (an `addMember` round trip) in the sealed world. It is unverified unless step 7 can answer it without editing fixtures.
- Real API, DB and gateway behaviour (`e2e-web360`), CI, and production.
