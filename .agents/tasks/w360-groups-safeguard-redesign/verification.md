# Verification: W360 Families & groups, Safeguard tab, filters and Print

Run 03/10/2026 against the main working tree (uncommitted, dirty with other in-flight work), sealed harness only,
dev server `http://localhost:5173` (the user's, not started or stopped). Nothing was committed or pushed.

## What changed (files this task touched)

- `apps/web/src/w360/ui.tsx`: new `// ── Tabs` section with `TabStrip` (optional `status` slot), `TabPanel`,
  `TabStripTab`, `TabStripStatus`. Additive. The `react` type import gained `KeyboardEvent as ReactKeyboardEvent`.
- `apps/web/src/w360/w360.css`: additive `.tabs .tabstatus*`, `.schip-lines .schip` (wrap), `.grouphead*`
  grid, and a ≤640px `.safeguardtab .infotip-body` anchor.
- `apps/web/src/w360/pages/Groups.tsx`: Safeguard tab, `?tab=`, header grid, outlined New group, Print,
  Members `FacetFilter`, page-local TabStrip/`SAFEGUARD_STAGE`/`cap` removed, header comment fixed.
- `apps/web/src/w360/pages/Tools.tsx`: page-local `TabStrip`/`Panel` removed, uses the `ui.tsx` ones. No other hunk.
- New `apps/web/src/w360/groupsView.ts` + `groupsView.test.ts` (pure rules, unit-tested).
- `scripts/shared-components-tests.ts`: Groups entry removed (0 cards, 0 tabs), Tools `tabs: 1` removed,
  `OWNER.tabs` and header doc updated, SC-0 now requires `TabStrip` and `TabPanel` exports.
- New `tests/e2e-app/specs/30-groups.spec.ts` (permanent, 21 tests over the app and phone projects).
- `tests/e2e-app/specs/07-record-people.spec.ts`: the stale "/app/groups is a signpost" comment was rewritten.
  Comment only.
- Docs: `design.md` § App vocabulary row + approval line; `docs/specs/TODO-one-platform.md` item 4;
  `docs/specs/2026-09-19-family-household-management-functional-design.md` § 19 Groups.tsx bullet.

## Reddy's mid-loop change (applied)

The tab draws "Safeguard" and a glyph only (`!` incomplete, `✓` set). The word is the glyph's `title` tooltip,
and through the button's `aria-label` it is the end of the accessible name: "Safeguard, needs action" /
"Safeguard, set". It is never visible text. A visually hidden span was tried first. Chromium computed it as
"Safeguard , needs action" because an absolutely positioned box inserts a space, so it was replaced by
`aria-label`. design.md's vocabulary row was corrected to match (the "always printed" drift). The notifier
Dialog's code and copy were left untouched, as instructed.

## Commands and results

| # | Command | Result |
|---|---|---|
| 1 | `cd apps/web && bun run typecheck` | exit 0 (after the final change) |
| 2 | `bun test apps/web/src/w360/groupsView.test.ts` | 7 pass, 0 fail |
| 3 | `bun test packages/core packages/tokens apps/web/src apps/mobile/tests apps/university/src` | 748 pass, 0 fail |
| 4 | every `scripts/*-tests.ts` (a11y-web, aadhaar-digits, area, cache-eviction, contrast-helper, contrast, fence, geo, hooks, lifecycle, palette, plural, provenance, screening, shared-components, typography, url-scheme, village, vocab) | all exit 0, all PASS (after the final change) |
| 5 | `bun run scripts/icon-guard.ts`, `bun run scripts/ux-guards.ts` | ICON GUARD PASSES, UX GUARDS PASS |
| 6 | `playwright test specs/30-groups.spec.ts --project=app --project=phone` | **21 passed** (after the final change) |
| 7 | `playwright test specs/26-one-font.spec.ts --project=app --project=phone` | 104 passed |
| 8 | `playwright test specs/21-routing.spec.ts -g "groups\|every address" --project=app` | 12 passed, 2 failed, both pre-existing and unrelated (see below) |
| 9 | `playwright test specs/19-sections-legacy.spec.ts -g tool --project=app` | 44 passed, 1 failed, pre-existing and unrelated (see below) |
| 10 | `playwright test specs/24-responsive.spec.ts --project=phone` | 55 passed, 45 failed, environment-wide (see below) |
| 11 | `playwright test specs/07-record-people.spec.ts -g "legacy/groups\|PersonDialog\|person" --project=app`, run BEFORE the comment edit | 33 passed, 4 failed (RecordPeople hanger: link/rename editors). Not a Groups surface, and the edit is comment-only |
| 12 | `specs/01-shell.spec.ts -g "Families"` | "No tests found": no title names it. The rail entry is a row in a parametrised table (01-shell.spec.ts:82) |
| 13 | `apps/web: vite build --outDir .local/groups-scratch/dist` | ✓ built. Written outside `apps/web/dist`, which pre-existed and was left untouched. Deleted afterwards |

Every Playwright run used `APP_WEB_URL=http://localhost:5173 --reporter=line --output=<repo>/.local/pw-groups-out`.
Nothing ran against e2e-web360 or the `live` project.

### Failures judged not caused by this change, with evidence

- **21-routing**
  - `/app/desk/associates/as-ravi` crashes with `TypeError … trainingNote.trim` in `<Person>`. This is desk code
    with in-flight edits by others.
  - The order flow `?service=ec&step=tell` misses its step.
  - Neither touches Groups, Tools or TabStrip.
- **19-sections-legacy "guideline rates are named as reference figures"**
  - The asserted copy "These are reference guideline values published by the AP Registration…" no longer exists
    anywhere in `apps/web/src/w360`.
  - It was removed by the user's uncommitted Tools.tsx work. This task's Tools hunks only swap the tab strip.
  - All other tool-tab tests (five tabs, `?tab=`, Arrow keys) pass.
- **24-responsive (45 failures)**
  - Almost all are "The screen logged errors", from a sealed-world `400 (Bad Request)` that fires on `/app`
    (Dashboard), `/app/tools`, `/app/audit`, `/app/profile` and others alike, plus the desk `trainingNote.trim`
    crash.
  - The Dashboard does not render any code this task changed.
  - An isolated re-run of `/app`, `/app/groups` and `/app/tools` shows the same 400 on all three.
  - The first full run happened while another agent's Playwright run shared the dev server. In that run even
    30-groups (21/21 a minute earlier and after) failed 7, which shows how heavily the environment was loaded.
  - The overflow this change could cause on /app/groups is covered directly by 30-groups' two @phone
    no-sideways-scroll tests, which pass.

## Functional acceptance (sealed e2e-app, `30-groups.spec.ts`)

| Operation | Status | Proof |
|---|---|---|
| Safeguard tab, incomplete | worked | tab order Members · Properties · Safeguard · Activity, Members selected. Tab name "Safeguard, needs action", glyph `!` with title "needs action", the word not in innerText. Heading "Inactivity safeguard", chip "Active", last-active 20/09/2026, the warn line, ⓘ description. `?tab=safeguard` set |
| Safeguard tab, complete | worked | "Safeguard, set", glyph `✓` titled "set", no warning drawn |
| Reminder stage is warn, not danger | worked | `.schip.warn` "First reminder sent", tab needs action |
| Partnership has no Safeguard tab; deep link falls back | worked | |
| `?tab=` deep link; changing group lands on Members | worked | |
| Arrow/Home/End keyboard | worked | |
| Configure notifiers → save | worked | one `setNotifiers` call `{g, ids: []}`, dialog closes, toast |
| Configure notifiers → **failure** | worked | GraphQL error: dialog stays, alert "That notifier order could not be saved. Nothing has changed." |
| Add a person (Members) | worked (open/cancel only) | lazy PersonDialog "Add person" opens and Cancel closes. **Saving through PersonDialog (addMember) UNVERIFIED** in this harness. 07-record-people covers that form on /legacy/groups |
| Filter: Relationship, Status; tally; filtered-to-nothing + Clear filters; chip remove; Clear all | worked | 3 of 3 → 1 of 3 shown; Spouse+Invited → "No members match these filters"; restored |
| No filter for a one-row table | worked | |
| Remove a member from a filtered table (+ failure) | worked | one `removeMember {id: m-wife}`; refused → dialog stays with alert |
| New group outlined; one filled button per view; create (+ failure) | worked | `.btn.primary` count 1 on Members ("Add a person") and on Safeguard ("Configure notifiers"); `createGroup` 1 call + toast; refused → typed name kept |
| Header kebab Edit / Delete (+ failures) | worked | `updateGroup` and `deleteGroup` 1 call each; refused → dialogs stay |
| Print | worked | `window.print` stub called once. In print media the Aadhaar cell is visible and masked (`XXXXXXXX1234`); `document.body.innerText` has no `\d{12}` and no `\d{4} \d{4} \d{4}` run; Add a person, + Filter and Print are hidden; the tab strip stays |
| Phone header wrap | worked | kebab on the name's line, facts below, link below the facts, no sideways scroll |
| Phone Safeguard tab | worked | no sideways scroll. This found and fixed two real overflows: the nowrap warn chip (71px) and the hidden-but-laid-out ⓘ tip (27px) |

## In-browser checks (sealed AFTER capture, temporary spec deleted)

- Focus ring and status colour on the focused Safeguard tab (`after/groups-tab-focus.json`, keyboard-focused):

  | Scheme | Ring | Status glyph | Background | Face |
  |---|---|---|---|---|
  | Dark | `auto 2px rgb(243,141,42)` | `rgb(245,174,57)` | `rgb(23,12,9)` | Atkinson Hyperlegible |
  | Light | `auto 2px rgb(164,89,23)` | `rgb(144,93,0)` | `rgb(253,252,249)` | Atkinson Hyperlegible |
  | High Contrast | `solid 3px rgb(0,56,110)` | `rgb(107,79,0)` | `rgb(255,255,255)` | Atkinson Hyperlegible |

  The status colours are the existing `--w-warn` tokens, which `contrast-tests.ts` already gates. The ratios
  were not computed separately here.
- Print preview: `after/groups-print-app-full.png` (print media, Members tab).
- BEFORE | AFTER board: `.local/ux-audits/2026-10-03-families-inactivity-safeguard/after/before-after.png`.
- `git status --short --untracked-files=all tests/ | shasum` was `916ef93f…` before and after the temporary
  capture spec.

## Final capture and check run (03/10/2026, after 13:05)

- Review issues 1 and 2 fixed in `30-groups.spec.ts` (comment at :70-71, title at :130). Comment/title only.
- Sealed AFTER captures re-taken at 13:09 (both states, app 1512 and phone 390, Members and Safeguard tab) with a
  temporary `zz-ux-audit-families-after.spec.ts`, then deleted. `git status … tests/ | shasum` was `916ef93f…`
  before and after. Board re-rendered: `after/before-after.png`. The BEFORE captures used the audit's own fixture
  ("Sample family", 6 properties); the AFTER ones use 30-groups' fixture ("Telukutla Family", no properties).
- At ~13:13 another in-flight change began renaming `Combined*.tsx` → `Holding*.tsx` (staged renames, routes.tsx
  not yet updated). After that:
  - `apps/web` typecheck: exit 1, 20 errors, all in routes.tsx, Holding*.tsx and Properties.tsx (missing
    `./Combined*` modules). None in Groups.tsx, ui.tsx, groupsView.ts or Tools.tsx.
  - Guards: every `scripts/*-tests.ts` passes except `shared-components-tests.ts` (SC-1: Holding.tsx and
    HoldingLedger.tsx budgets) and `vocab-tests.ts` (ENOENT Combined.tsx); `ux-guards.ts` ENOENT
    CombinedProperty.tsx; `icon-guard.ts` passes. `typography-tests.ts` passes.
  - `groupsView.test.ts`: 7 pass.
  - `30-groups.spec.ts` re-run: 21 failed, every one on Vite's 500 "Failed to resolve import ./w360/pages/Combined
    from src/routes.tsx". Last green run (21/21) is the one above, before the comment/title edit.

## Not verified

- PersonDialog save (addMember round trip) on /app/groups.
- Real API, DB and gateway (`e2e-web360` needs an approved disposable `TEST_PG_DSN`). No contract changed.
- CI, deployment, production.
- Full WCAG conformance, which needs manual assistive-technology testing.
- The pre-existing failures above were not root-caused, because they belong to other in-flight work.

## Open decisions for Reddy (from the plan, not built)

- DP-1: `closed_*` stages currently read "needs action" per the literal rule.
- DP-2: Export.
- DP-3: Search.
- DP-4: Sort.
- DP-5: an "Email verified" facet.
- DP-6: filters on the Properties and Activity tabs.
- DP-8: SectionHeads on the other tabs.
- DP-9: Print scope.
- DP-10: notifier editor as a Drawer.
- DP-11: the view toggle.
- DP-7 is done: Reddy approved the tab, and the vocabulary row was added.
- Follow-up noted: the excluded-member line in the notifier dialog (Groups.tsx, `note accent`) uses the accent
  while the Safeguard tab uses warn chips. Left as is, per instruction.
