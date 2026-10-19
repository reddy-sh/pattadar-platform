# Implementation Plan: Inactivity notifications editor follow-up (approved 03/10/2026)

Source of truth: `.agents/tasks/notifier-drawer-followup/brief.md` (10 changes, constraints, verification).
Audit: `.local/ux-audits/2026-10-03-inactivity-notifications-dialog/board.html` (+ `evidence/` BEFORE captures).
Work in the MAIN tree at `/Users/reddy.sh/reddy.sh/projects/pattadar-platform`. No commit, no push, no worktree.
Touch only the files named below. Do NOT touch `Properties.tsx`, `routes.tsx`, `Holding*.tsx`, `Combined*.tsx`.
Do NOT change which stages count as "needs action" (`safeguardNeedsAction`, DP-1 is Reddy's).

## Facts found while planning (read these before item 1)

- The shared Drawer is `apps/web/src/w360/Drawer.tsx`, not `apps/web/src/components/Drawer.tsx` (that path does
  not exist). It exports `Drawer`, `DrawerAction`, `drawerEyebrow`. Footer: `primary` first, then Cancel; optional
  `primaryWhy {id,text}` pinned above the footer (`.drawerwhy`); `initialFocus` selector; `returnFocus` ref;
  Escape/scrim → `tryClose` (blocked while `busy`); body `.drawerbody` is a grid with `gap: var(--space-md)`.
- `useFocusTrap` (`apps/web/src/w360/Dialog.tsx:51-66`) re-runs its focus effect whenever `initialFocus` changes
  (deps `[active, initialFocus, ref]`). That is the seam for change 9: no Drawer change needed.
- `DrawerAction` (`Drawer.tsx:343-372`) disables itself while `pending`, which is why focus falls to `<body>` after
  a failed save (change 10). It takes no `id` today.
- The raw server line under a failed toast is the toast's `detail`, filled by `toast.bad(text, error)` →
  `reasonOf(error)` (`apps/web/src/w360/Toast.tsx:100`), called from `useGroupWrite`'s `onError`
  (`apps/web/src/w360/groupsData.ts:~268`). `useSetNotifiers` is at `groupsData.ts:347-352`.
- NotifierDialog is `apps/web/src/w360/pages/Groups.tsx:1408-1600` (centred `Dialog wide`). Its own gap filter is
  `unready` at `Groups.tsx:1431-1433`; its eligible pool is `Groups.tsx:1428-1430`; the 3 inline-margin notes are
  at ~1510, ~1517, ~1525 (+ the rows box margin ~1529); the fieldset is `className="field"` at ~1487.
- The single contact-gap source is the server's `inactiveContactGaps` on GroupRow
  (`services/api/src/main.py:1628-1633`): non-self, non-minor family members with no email, OR email not verified,
  OR `inactivity_email_consent=false`. **It includes consent**, so the shared wording must say so. The server's own
  phrase for this is "a verified email and safeguard-email consent" (`main.py:4749`); reuse it.
- Server eligibility for a notifier (`main.py:2234-2236`, and the `setNotifiers` validation at 4746-4749): email
  present, not minor, email verified, consent, channel email. The `notifiers` query returns only configured rows
  once an order exists, so the client still needs one predicate to list who can be ADDED. That predicate is kept
  (moved to `groupsView.ts`, unit-tested, documented as the server's rule), but it no longer produces any count or
  sentence: the gap count and wording come only from `group.inactiveContactGaps`. This is exactly the line the
  board cites (finding 5 → `Groups.tsx:1430-1433`, the `unready` filter). Removing the pool predicate entirely
  needs a server field (backend contract change) — out of scope, flag in the final report.
- Borderless picker to match: `.share-paper-picker` (`w360.css:5700-5717`), already used as the shared picker by
  `RecordHead.tsx:426` and `HoldingActions.tsx:265, 593`. Its label is a `1.25rem minmax(0,1fr)` grid, so the radio
  stays on its label's line at 390. `.field > label` (`w360.css:2847-2850`) is what uppercases the options today.
- `.w360 .note` has no margin reset (`w360.css:112`), so a `<p class="note">` in a grid adds the UA 1em margins.
  The Drawer callers' convention is `style={{ margin: 0 }}` (`RecordPeople.tsx:289`, `PropertyActions.tsx:1039`).
- Tab ids are `${idBase}-tab-${id}` (`ui.tsx:714`); GroupDetail passes `idBase={group.id}`, so the Members tab
  button is `#${group.id}-tab-members` (escape with `CSS.escape` if ids can contain odd characters).
- Review items already done: `30-groups.spec.ts:70-71` comment already says "through the button's aria-label",
  and `:130` is already titled "@phone the Safeguard tab fits a phone and the page never scrolls sideways".
  Leave them. Only the `.grouphead` JSX re-indent (`Groups.tsx:439-464`) remains.
- Dev server: the user's Vite on `http://localhost:5173` (5180 is down). Run sealed specs with
  `APP_WEB_URL=http://localhost:5173`. Never start/stop it. Never run e2e-web360 or `--project=live`.
- Baseline at plan time (03/10/2026): `cd apps/web && bun run typecheck` → **exit 0** (the Combined→Holding rename
  blocker is currently resolved). `shared-components-tests`, `typography-tests`, `vocab-tests`, `icon-guard`,
  `ux-guards` → exit 0. If later runs show errors ONLY in `Properties.tsx`, `routes.tsx`, `Holding*.tsx`,
  `Combined*.tsx`, or a Vite 500 "Failed to resolve import ./w360/pages/Combined…", they are the other in-flight
  rename, not this task. Some `scripts/*-tests.ts` are slow: run each with a long tool timeout, one at a time
  (`timeout(1)` is not installed on this Mac).

## Decisions (brief rationale)

- D1 Drawer copy: eyebrow `drawerEyebrow(group.name, 'Safeguard')` ("Telukutla Family · Safeguard", as the board),
  title "Inactivity notifications" (dialog name unchanged, so existing locators keep working), sub "Contacted only
  after the head misses every activity reminder." (the current first note, promoted).
- D2 No `onSubmit`/form and no `dirty`: the panel holds choices, not typed work, and Escape closed it at once before.
  Primary is `DrawerAction submit={false}`.
- D3 Shared gap sentence: `contactGapSentence(n)` in `groupsView.ts` →
  "1 member needs a verified email and safeguard-email consent before everyone can be contacted." /
  "N members need …". Used by the Safeguard tab chip AND the editor chip.
- D4 Members link: a `linkbtn` button "Open the Members tab" beside the editor's gap chip (accent text is a
  pressable link, which design.md allows; the only filled amber control stays Save). It closes the drawer, selects
  Members, and returns focus to the Members tab via the Drawer's `returnFocus`.
- D5 primaryWhy: 0 eligible (either mode) → "No family member has a verified email yet." (existing line, verbatim).
  Ordered mode with ≥1 eligible but an empty order → the existing "Add at least one verified family email to create
  an order." moves to primaryWhy too (same Drawer rule: a disabled primary says why). Save disabled when
  `!loaded || q.isError || eligible.length === 0 || (selected && current.length === 0)`.
- D6 Together mode rows: the same row markup as ordered mode (name 700 + "relation · email" note), with no number
  badge (an order number would claim an order that does not exist) and no controls. One local render helper used
  by both modes, so the two cannot drift.
- D7 Toast wording, per mode, no raw server line:
  all → "Contacting all verified family emails together could not be saved. Nothing has changed."
  (mirrors the success toast "All verified family emails will be contacted together");
  selected → "That notifier order could not be saved. Nothing has changed." (unchanged).
- D8 Focus after failure: add optional `id` to `DrawerAction` (additive shared-component prop); NotifierDialog bumps
  a `failures` counter in its catch and an effect focuses `#saveId` once `!save.isPending` (the button is enabled
  again only after react-query's state lands, so the effect waits on both).

# Steps

- [ ] 1. Record the baseline before editing.
      Run typecheck and the guard list once and write the result (exit codes, any error file paths) to
      `.agents/tasks/notifier-drawer-followup/baseline.md`, so later failures can be told apart from the rename.
      Files: `.agents/tasks/notifier-drawer-followup/baseline.md` (new, task artifact)
      Verify: `cd apps/web && bun run typecheck` and `bun run scripts/<each>-tests.ts`, `bun run scripts/icon-guard.ts`,
      `bun run scripts/ux-guards.ts` from the repo root; baseline.md lists every exit code.

- [ ] 2. Pure rules in `groupsView.ts` + unit tests (changes 5, 6 groundwork).
      Add, in a new `// ── The notifier editor` section:
      - `contactGapSentence(gaps: number): string` (D3). Inline the 1/N branch rather than importing `plural`
        from `ui.tsx`: groupsView imports only types from `./ui` today, and a value import would pull React/MUI into
        the bun unit test.
      - `isEligibleNotifier(m: { isSelf; isMinor; email; emailVerified; inactivityEmailConsent })` — the server rule
        (cite `main.py:2234-2236`), doc comment says it lists who can be ADDED and never counts the gap.
      - `notifierSaveFailedText(memberIds: readonly string[]): string` (D7, without " Nothing has changed.").
      Update the file's header bullet list. Do not touch `safeguardNeedsAction`.
      Tests in `groupsView.test.ts`: singular/plural sentence and that it contains "safeguard-email consent";
      predicate false for self, minor, empty email, unverified, no consent, true for a full adult; failure text for
      `[]` vs `['m']`.
      Files: `apps/web/src/w360/groupsView.ts`, `apps/web/src/w360/groupsView.test.ts`
      Verify: `bun test apps/web/src/w360/groupsView.test.ts` — all pass (7 existing + new).

- [ ] 3. Write-side wording (change 10, toast half).
      In `groupsData.ts` `useGroupWrite`: let `what` be `string | ((vars: V) => string)` and add option
      `reason?: boolean` (default `true`); `onError: (e, vars) => toast.bad(\`${word(vars)} Nothing has changed.\`,
      reason ? e : undefined)`. Update the doc comments (`what`, and the `quiet` note that "Only the member form sets
      this" stays true). `useSetNotifiers` → `(v) => notifierSaveFailedText(v.memberIds)` with `{ reason: false }`.
      Every other write is unchanged.
      In `Drawer.tsx` `DrawerAction`: add optional `id?: string`, passed to the `<button>`; one doc line (D8).
      Files: `apps/web/src/w360/groupsData.ts` (~241-270, 347-352), `apps/web/src/w360/Drawer.tsx` (343-372)
      Verify: `cd apps/web && bun run typecheck` exit 0 (or only baseline rename errors).

- [ ] 4. Move NotifierDialog into the shared Drawer and apply changes 1-10.
      In `Groups.tsx` (keep the component name `NotifierDialog` or rename to `NotifierDrawer`; update its one caller
      at line 483). Props become `{ group, onClose, onMembers, returnFocus }`.
      - (1) Replace `<Dialog … wide footer>` with `<Drawer eyebrow={drawerEyebrow(group.name,'Safeguard')}
        title="Inactivity notifications" sub="Contacted only after the head misses every activity reminder."
        onClose busy={save.isPending} returnFocus initialFocus={…} primaryWhy={…} primary={<DrawerAction id={saveId}
        submit={false} label="Save notification settings" working="Saving…" pending={save.isPending}
        paused={save.isPaused} disabled={…} describedBy={why ? whyId : undefined} onClick={() => void persist()} />}>`.
        Delete the old footer and the old first `<p className="note">`. Import `Drawer, DrawerAction, drawerEyebrow`
        from `'../Drawer'`; `Dialog` stays imported (other dialogs use it). Add `useEffect, useId, useRef` to the
        react import.
      - (2)+(3) The fieldset becomes `<fieldset className="share-paper-picker">` (no `field`, no maxWidth) with
        `<legend>Who should be contacted?</legend>`; each option is `<label><input type="radio" name="notifier-mode"
        …/><span>Email all family members with a verified email together</span></label>` (drop `row tight`). In
        `w360.css` add `font-size: 0.875rem;` to the existing `.w360 .share-paper-picker label` rule (5708-5711;
        harmless for the other pickers, whose `strong`/`small` set their own sizes). `accent-color` already comes
        from `.share-paper-picker input` (5712). No new weights, no colour literals.
      - (4)+(5) Delete `unready` (1431-1433). Replace the accent note (~1509-1513) with
        `{gaps > 0 && <div className="schip-lines" …same inline grid as SafeguardTab…><StatusChip state="warn">
        {contactGapSentence(gaps)}</StatusChip><button type="button" className="linkbtn" onClick={onMembers}>
        Open the Members tab</button></div>}` where `gaps = group.inactiveContactGaps || 0`.
        `eligible` = `(loaded?.members ?? []).filter(isEligibleNotifier).map(…)` (same mapping as today).
      - (6) `primaryWhy` per D5; `const whyId = useId()`. Remove the inline "No family member…" and "Add at least
        one…" notes from the body.
      - (7) Remaining notes get `style={{ margin: 0 }}` (Drawer convention) instead of `var(--space-md)` margins;
        drop the `margin` on `.rows boxed` and the `maxWidth` on the add-select `.field`.
      - (8) One local helper `notifierRow(m, lead?: ReactNode, controls?: ReactNode)` returning the existing row
        `<div>` (avatar badge only when `lead` given, `.grow` name block, controls span only when given). Ordered
        mode passes `i + 1` and the ↑/↓/Take out controls exactly as today; together mode renders
        `<p className="note" style={{margin:0}}>{plural(eligible.length,'verified family email')} will be contacted
        together.</p>` then `<div className="rows boxed">{eligible.map((m) => notifierRow(m))}</div>` when
        `eligible.length > 0`.
      - (9) `initialFocus={loaded ? 'input[name="notifier-mode"]:checked' : '.drawerbody'}`; add a comment that the
        change from one selector to the other is what re-runs useFocusTrap's focus once the settings land.
      - (10) `persist`: success unchanged (toast.ok per mode, onClose). In `catch`, `setFailures((n) => n + 1)`;
        `useEffect(() => { if (failures > 0 && !save.isPending) document.getElementById(saveId)?.focus(); },
        [failures, save.isPending, saveId])`.
      In `GroupDetail` (390-486): `const membersTab = useRef<HTMLElement | null>(null)`; pass
      `returnFocus={membersTab}` and `onMembers={() => { membersTab.current = document.getElementById(\`${group.id}-tab-members\`);
      setNotifiers(false); onTab('members'); }}`. (Opener "Configure notifiers" unmounts with the tab, so the
      Drawer's fallback is what lands focus on the Members tab.)
      In `SafeguardTab` (~531-535): replace the gap chip text with `{contactGapSentence(gaps)}`. Update its doc
      comment (497-499) to say the editor uses the same chip and sentence.
      Re-indent the `.grouphead` children (439-464) one level (review nit 4); no other change there.
      Update the Groups.tsx header comment only if it mentions the notifier dialog (it does not today).
      Files: `apps/web/src/w360/pages/Groups.tsx`, `apps/web/src/w360/w360.css` (5708-5711 only)
      Verify: `cd apps/web && bun run typecheck` exit 0 (bar baseline); `bun test apps/web/src/w360/groupsView.test.ts`.

- [ ] 5. Sealed acceptance spec (functional-acceptance in `tests/e2e-app`).
      Edit `tests/e2e-app/specs/30-groups.spec.ts`:
      - Update the tab test's gap text (line ~87) and the "set" test's negative regex (line ~98) to the new sentence
        (`/safeguard-email consent before everyone can be contacted/`).
      - Replace "Configure notifiers opens the notification settings and saves them" and the refused-write notifier
        test with a new `test.describe('the inactivity notifications editor', …)` using a local
        `CONSENTING_WIFE = { ...WIFE, inactivityEmailConsent: true }` and `world.set('root.members', …)` where needed.
        Keep `allowConsole: true` on the failure tests. Operations to exercise:
        1. Open: click Configure notifiers → `getByRole('dialog', { name: 'Inactivity notifications' })` is a
           `.drawer` (class), eyebrow "Telukutla Family · Safeguard", sub visible; footer order: first button in
           `.drawerfoot` is Save, second Cancel; after load the checked radio "Email all family members with a
           verified email together" `toBeFocused()`; the option label computes `font-size: 14px`, `font-weight: 400`,
           `text-transform: none`; the fieldset `border-top-style: solid`, other sides none; legend 13px/700.
        2. Both modes: with `root.notifiers` holding a configured row (`priority: 1, eligible: true` for m-wife) the
           editor opens on "in order" with that radio focused and a numbered row with "Move Lakshmi up"; switching to
           "together" shows the read-only row "Lakshmi" with 0 Move/Take out buttons.
        3. 0-recipient state (default seed: no consent, gaps 1): Save `toBeDisabled()`, `.drawerwhy` reads
           "No family member has a verified email yet.", Save `aria-describedby` points at it; also disabled after
           switching to "in order"; the warn chip `.schip.warn` reads the shared sentence and is identical to the
           Safeguard tab chip text.
        4. Some-verified (consenting wife, gaps 1): together lists 1 read-only row and "1 verified family email will
           be contacted together."; Save enabled, no `.drawerwhy`; "in order" with no rows shows the "Add at least one…"
           primaryWhy and Save disabled; choosing Lakshmi in "Add a verified family email" enables Save.
        5. Members link: "Open the Members tab" → drawer gone, Members tab `aria-selected=true`, URL has no `tab=`,
           Members tab `toBeFocused()`.
        6. Successful save, both modes: together → one `root.setNotifiers` call `{g: FAMILY, ids: []}`, drawer closes,
           toast "All verified family emails will be contacted together", focus back on Configure notifiers; in order →
           `ids: ['m-wife']`, toast "Notifier order saved".
        7. Failed save, both modes (`World.gqlError('the safeguard store is down')`): alert reads the D7 sentence for
           that mode, `page.getByText('the safeguard store is down')` has count 0, drawer still visible, Save
           `toBeFocused()`.
        8. Escape closes (no setNotifiers call) and focus returns to Configure notifiers; Cancel closes likewise.
        9. `@phone`: each radio's vertical centre is within its label text's line box (bounding boxes), and
           `scrollWidth - clientWidth <= 1` with the drawer open.
      - "New group is outlined …" filled-button count stays as is (it counts `main .btn.primary` with no drawer open).
      Files: `tests/e2e-app/specs/30-groups.spec.ts`
      Verify: `cd tests/e2e-app && APP_WEB_URL=http://localhost:5173 bunx playwright test specs/30-groups.spec.ts
      --project=app --project=phone --reporter=line --output=/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/pw-notif-out`
      — all pass. Also run `specs/26-one-font.spec.ts` (app+phone) and `specs/07-record-people.spec.ts` and
      `specs/08-record-money.spec.ts` (app) because Drawer.tsx changed; compare failures against baseline/pre-existing.

- [ ] 6. Docs (runbook-consistency).
      - `design.md`: under the App vocabulary approval lines (~412) add one line: the notifier editor opens in the
        shared right-side Drawer; the contact gap is one warn StatusChip with one sentence from the server's
        `inactiveContactGaps` in the tab and the editor; approved by Reddy 03/10/2026 (audit path). Do not touch the
        vocabulary row.
      - `docs/specs/2026-09-19-family-household-management-functional-design.md`: §11.2 "The settings dialog must
        provide" → "The settings drawer must provide" + one bullet that a blocked save names why and links to Members;
        §19 Groups.tsx bullet: "the notifier-priority dialog" → "the notifier editor (shared Drawer)".
      - `docs/specs/TODO-one-platform.md`: only if an item tracks this editor (grep "notifier"; currently none).
      Files: `design.md`, `docs/specs/2026-09-19-family-household-management-functional-design.md`
      Verify: re-read the edited lines; `bun run scripts/vocab-tests.ts` and `bun run scripts/typography-tests.ts` pass.

- [ ] 7. Full verification (verify-change).
      Run, one per call with long timeouts: `cd apps/web && bun run typecheck`; `bun test apps/web/src/w360/groupsView.test.ts`;
      `bun test packages/core packages/tokens apps/web/src apps/mobile/tests apps/university/src`; every
      `scripts/*-tests.ts` (a11y-web, aadhaar-digits, area, cache-eviction, contrast-helper, contrast, fence, geo,
      hooks, lifecycle, palette, plural, provenance, screening, shared-components, typography, url-scheme, village,
      vocab); `bun run scripts/icon-guard.ts`; `bun run scripts/ux-guards.ts`; the sealed specs from step 5.
      Classify every failure against `baseline.md`. Write results to
      `.agents/tasks/notifier-drawer-followup/verification.md` (commands, results, functional-acceptance table with
      the 9 operations above, failures judged pre-existing with evidence, not-verified list).
      Verify: verification.md complete; no failure attributable to the changed files.

- [ ] 8. Sealed BEFORE | AFTER captures.
      Follow `.kiro/skills/heuristic-ux-audit/references/evidence-capture.md`. A temporary
      `tests/e2e-app/specs/zz-ux-audit-notifier-after.spec.ts` captures, at 1512 (app) and 390 (phone), the same
      states as `evidence/`: zero-all, zero-selected, some-all, some-selected-order, some-selected-empty, loading,
      save-error, keyboard focus in Dark and High Contrast. Save PNGs (+ a facts JSON: drawer box, active element,
      option/legend computed styles, save disabled) to
      `.local/ux-audits/2026-10-03-inactivity-notifications-dialog/after/`, then build `after/before-after.html` →
      `after/before-after.png` pairing each `evidence/notif-*` with its AFTER, as the families audit did
      (`.local/ux-audits/2026-10-03-families-inactivity-safeguard/after/`). Read images back only through
      `sips -Z 2000` copies in a scratch dir. Record `git status --short --untracked-files=all tests/ | shasum` before
      and after; delete the temporary spec, scratch copies and `.local/pw-notif-out`.
      Files: `.local/ux-audits/2026-10-03-inactivity-notifications-dialog/after/*` (deliverable, retained)
      Verify: the shasum matches before/after; the PNGs open; the board shows Drawer, borderless picker, 14px
      sentence-case options, warn chip, focus on the checked radio, Save focused after the failed save.

- [ ] 9. Cleanup and report.
      Stop any agent-started process; delete scratch files; keep `baseline.md`, `verification.md` and the `after/`
      captures. Final report: the five governance dimensions (docs, architecture: none beyond the shared
      DrawerAction `id` and `useGroupWrite` options; security/privacy: no new data exposure, raw server message
      removed from this one toast; testing; cleanup), what was not verified (real API/e2e-web360, Light scheme
      capture if skipped, screen reader), and the residual: the add-pool predicate mirrors the server rule until the
      server sends eligibility for unconfigured members (backend change, Reddy's call). DP-1 untouched.
