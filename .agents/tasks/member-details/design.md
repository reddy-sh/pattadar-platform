# Design: member details in Families & groups (W360 web)

Status: proposed, revision 4 (resolves the revision-3 design review `design-review.md`, 4 MEDIUM + 9 NIT findings; responses in §15), 03/10/2026. Revision `0ace64b` + working tree. Nothing has been implemented.

Owner request (Reddy): "Click on the user, should show the details and attached documents as well. Please use the existing design standards / heuristic-ux-audit to view the users. Do the best design please."

## Audit board (deliverables, kept)

- `/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.agents/tasks/member-details/compare.png` shows the two screens side by side. It is 1600 px wide and is the image for chat.
- `/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.agents/tasks/member-details/board.png` is the full board: findings, drift, changes and guardrails.
- `/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.agents/tasks/member-details/board.html` is the text version of both images.
- `evidence/` holds the sealed captures at 1512 and 390: the members table, the kebab menu open, and click/focus JSON. They are fixture records only and contain no real data.

The board is in this task folder rather than `.local/ux-audits/` because the step asked for it here. It is three levels below the repo root, so the tokens link resolves.

## 1. Summary

The members table cannot open a person today. Each row has one focusable control, the kebab, and clicking the name does nothing (`evidence/groups-members-app-click.json`). The only way to read a person's details is **Edit**, which opens the MUI edit form. Most PersonType fields never appear read-only. A kept Aadhaar card is stored and linked (`aadhaar_candidates.card_node_id/card_version_id`), but no web or core file reads those pointers.

The audit also found two defects in the table itself:

- At 390 (WebKit), **Born** shows ISO dates such as `1975-06-10`.
- The phone view hides five columns with no scroll cue.

The proposal is a read-only **member drawer**:

- **Trigger:** the person's name in the table, which becomes a real button.
- **Deep link:** `/app/groups?g=<group>&m=<member>`.
- **Content:** identity, family links, the heir's share, documents (the kept Aadhaar card first) and recent activity.
- **Opening a document:** the shared `PaperPreview`/`scan` stack, never a page-local viewer.

**Edit** opens the existing `PersonDialog`. The drawer's kebab is the row's own action list.

## 2. Requirements

### Functional

- F1. Clicking a member's name, or anywhere on a non-control area of the row, opens that member's details. So does Enter or Space on the name button.
- F2. The details view has a deep link. Reload, copy-paste and Back all behave predictably (§4.2).
- F3. **Identity.** The view shows:
  - name, photo or initial, relationship or role, and a "You" marker for the self row;
  - date of birth as DD/MM/YYYY, gender and minor status;
  - phone and email, each with its verification state;
  - present address, marital status, bio;
  - Aadhaar as the masked last 4 only (`XXXX XXXX 1234`).
- F4. **Family links** (family-type groups only): father, mother and spouse are links that open that person's details. A spouse who is not a member of the group (`spouseName`/`spouseContact`/`spouseStatus`) shows as text. Guardian name and contact show for a minor.
- F5. **Share** (heirs only): share %, the parcel it applies to or "whole estate", "Held as", verification status, the heir's own confirmation ("Confirmed by them" or "Asked for a correction: …") and invite status.
- F6. **Documents.**
  - The kept Aadhaar card, when there is one: its name, type "Identity", date added, size, and Open and Download.
  - Phase 2, Reddy decision D3: other documents attached to the member.
  - The member photo is an avatar, not a document (§5.5).
- F7. **Activity:** the five most recent `groupActivity` events targeting this member, and a link to the group's Activity tab.
- F8. **Actions:** Edit opens the existing `PersonDialog`. The kebab has the same items as the row kebab less Edit, both built from one pure `memberActions(m)` in `groupsData.ts` (§4.3 item 1). Esc or Tab inside the drawer's kebab closes only the menu and returns focus to the kebab; the drawer stays open (one additive guard in the shared `useFocusTrap`, §4.3 item 1).
- F9. **Empty states:**
  - No documents and no Aadhaar on file: "No documents for this person", with **Scan Aadhaar** (opens PersonDialog). Phase 2 adds **Attach a document**.
  - An Aadhaar number on file but no kept card: the mask shows, with the line "Card not kept".
- F10. **States:** loading, a failed read (with retry), member not found (for example a stale `?m=`), a refused card read, a card in the trash, and a failed card metadata read.

### Non-functional

- Shared components only:
  - `ui.tsx`: `KV`, `Chip`, `StatusChip`, `State`, `Empty`, `Failed`, `Loading`, `Menu`, `Icon`, `ddmmyyyy`, `plural`, `initialsOf`;
  - `Drawer.tsx`: `Drawer`;
  - `paper/`: `PaperPreview`, `useScan`, `ScanView`;
  - `Dialog.tsx` / `PropertyActions.tsx`: `ConfirmDialog`.
  No page-local card, empty state, key/value row or viewer. `scripts/shared-components-tests.ts` budgets must not rise. `Groups.tsx` is at `{ card: 1, tabs: 1 }`.
- Type and format:
  - Atkinson Hyperlegible through `--font-sans` only, at weights 400 and 700, with `tabular-nums` on digits (dates, sizes, the mask, %).
  - DD/MM/YYYY everywhere.
  - Icons from `@mui/icons-material` only. Glyphs come through the existing `Icon` map (`identity`, `paper`, `person`; `ui.tsx:201-228`). The two control icons, `EditOutlined` and `FileDownloadOutlined`, are per-file deep imports, as `ComplianceAdmin.tsx` and `CombinedLedger.tsx` already do. No icon font, no new `Icon` map key, so `scripts/icon-guard.ts` stays green.
- Stack: React 19.2, MUI 9.2 (only through the already-lazy PersonDialog), TanStack Query 5, react-router. No new dependency.
- Privacy:
  - The full Aadhaar number never reaches the client.
  - The card's bytes pass only through gateway `/storage/files/{node}/content`, which authorizes in SQL by owner. No new storage route.
- Performance: one extra GraphQL read per opened member, plus one gateway metadata read when a card exists. The members table query is unchanged.

### Acceptance criteria

1. On `/app/groups?g=<id>`, each member's name is a `<button class="rowopen">` named "Open <name>". Tab reaches it before that row's kebab.
2. Activating it opens a drawer titled with the member's name, with the eyebrow `<Group name> · Members`. The URL gains `m=<memberId>`.
3. Loading `/app/groups?g=<g>&m=<m>` directly opens the drawer for that member.
4. Esc, the header ✕, the scrim and the browser's Back button each close the drawer. Focus returns to that member's name button for all three entry paths: the name button, a click on the row's Born cell, and a deep link or reload. If that button is gone (the member was removed), focus goes to "Add a person".
5. A DOB of `1979-04-02` renders `02/04/1979` in Chromium (app project) and WebKit (phone project), in both the table and the drawer. A card `createdAt` of `2026-09-30T20:00:00Z` renders `01/10/2026` in the sealed harness, which already pins `timezoneId: 'Asia/Kolkata'` (`tests/e2e-app/playwright.config.ts:69`). Timestamps are local dates (§4.6).
6. A member whose record has `last4='4321'`, `origin='scan'` and a `created_at` of `2026-09-30T20:00:00Z` shows `XXXX XXXX 4321` with the note "Read from the card · 01/10/2026", in both the app (Chromium) and phone (WebKit) projects. The API serializes it as `recordedAt: "2026-09-30T20:00:00+00:00"` (ISO 8601 with a `T` and an explicit `+00:00`, §7.2), never the space-separated `str(datetime)` form. `origin='typed'` reads "Typed · <date>". Once UUIDs are stripped, no `memberDetail` response contains a 12-digit Aadhaar-shaped run, and none contains the fixture's synthetic full number in any spelling (§10). `scripts/aadhaar-digits-tests.ts` stays green.
7. A member with a kept card lists "Aadhaar card.pdf · Identity · <DD/MM/YYYY> · <size>":
   - **Open** shows the pinned version (`?version=<cardVersionId>`) in the shared preview drawer;
   - **Download** saves the same version under its stored name.
8. A member with no card and no documents shows the "No documents for this person" empty state with **Scan Aadhaar**, which opens PersonDialog in edit mode.
9. Edit in the drawer opens PersonDialog with that member. After a save, the drawer re-opens with the saved values. After Cancel, it re-opens unchanged.
10. The drawer's actions equal the row kebab's for that member: the outlined **Edit** button plus a kebab holding `memberActions(m).filter(a => a.id !== 'edit')`, in the same order. A unit test calls `memberActions` for an owner self row, a pending heir with a token, a verified heir and a revoked member, and asserts the id lists.
11. Choosing "Remove from this group" in the drawer opens the existing confirmation. On success the drawer closes through the same `close()` as ✕ (§4.2), `m` is removed from the URL, and focus lands on "Add a person". Back afterwards does not re-open the drawer.
12. `memberDetail` returns `null` for a member of another owner, and for the owner's own member asked for under a different group. The drawer then shows "This person is not in this group", with no request for any card metadata, and its eyebrow still names the selected group.
13. A refused card read (gateway 403/404) shows "This file is no longer available" with no retry. A 5xx or network error shows the shared `Failed` with retry.
14. At 390 the drawer is full-screen (`min(26rem, 100vw)`), and nothing overflows horizontally.
15. The members table at 390 uses `.scroll-x.edgefade`. The "Verified" state is a text `StatusChip`, not a titled ✓.
16. Every `scripts/*-tests.ts` guard passes, along with `icon-guard`, `ux-guards`, typecheck, the new API tests and a new sealed spec.
17. With the history `[g] → [g&m=A] → [g&m=Father]` (Father opened from A's Family section), ✕, Esc or the scrim closes the drawer and the URL has no `m`. The browser's Back button instead steps back to A.
18. **Open** on the kept card shows the scan in the preview drawer and makes no `document` GraphQL request. It never shows "This document did not load" or "page 1 of 0".
19. "See all in Activity" closes the drawer and selects the Activity tab, and focus lands on that tab (`#<group>-tab-activity`). Back does not re-open the drawer.
20. Deleting the selected group (`clearSelection`) also removes `m` from the URL.
21. With the drawer's kebab open (opened by keyboard, focus on a menu item), Esc closes only the menu: focus returns to the kebab, the drawer stays open and the URL keeps `m`. Tab in the open menu also closes only the menu and leaves focus on the kebab. A second Esc then closes the drawer (AC 4).
22. After activating a Family link ("Father") and after the browser's Back within the drawer (`[g&m=A] → [g&m=Father] → Back`), `document.activeElement` is inside `.drawer` (the `.drawerbody`, or the control React kept), never `<body>`, both while the next person loads and after.
23. Loading `/app/groups?g=<g>&m=<m>` directly and then pressing ✕ leaves the URL at `?g=<g>` with no `m`, and Back does not re-open the drawer (no duplicate history entry is pushed for a deep link).

### Out of scope

- Expo and native iOS member details (NOTE for `sync-ios`).
- Showing the card's read-back fields (name, DOB, address as read): decision D4.
- Revealing the full number: retired.
- Phase 2 "Attach a document" (D3): no schema, mutation or UI work in this delivery. If Reddy approves D3a, it is a separate follow-up delivery with its own migration review.
- Changing the vocabulary (D5): no PersonDialog copy change and no `design.md` edit in this delivery.
- If Reddy refuses D2: the Documents card row and the "Card not kept" line (§11.2).
- The 2-filled-buttons-per-viewport question on the Groups page head.

## 3. Interaction decision: drawer, deep-linked by `?m=`

The two candidates were a **side drawer** over the group and a **dedicated route** (`/app/groups/:gid/members/:mid`). **The drawer is chosen.**

- **It matches how W360 opens a person.** RecordPeople says clicking any card, row or owner "opens the person's own drawer — the one place their details are edited and the one place they are removed" (`apps/web/src/w360/pages/RecordPeople.tsx:1-15`, `PersonDrawer` at :310). Documents use the same "look" drawer (`paper/PaperPreview.tsx:1-23`). A full-page route is used where the entity is a workspace with tabs (a property, `/app/records/:id`), and a person in a group is not.
- **It keeps the Groups screen's own architecture.** Groups is deliberately one route with `?g=` "so a group is still linkable" without a second read (`Groups.tsx:14-22`, `routes.tsx:417-420`). A `?m=` parameter extends that pattern. A `:mid` child route would reverse the header comment's decision.
- **It is still deep-linkable.** `?g=<group>&m=<member>` survives reload and copy-paste.
- **On a phone the drawer is already the whole screen.** `.w360 .drawer` is `width: min(26rem, 100vw)` (`w360.css:2463`).

Reddy may still prefer a route (D1). The cost would be a new route, a breadcrumb, and duplicating the group head. Nothing in the content sections below depends on the choice.

## 4. Interaction details

### 4.1 Table row (`Groups.tsx` MembersTab, about lines 767-787)

- The name cell's `<strong>` becomes the shared `.rowopen` button pattern (`w360.css:1356-1396`, used at `RecordPeople.tsx:579`):
  ```tsx
  <button type="button" className="rowopen" aria-label={`Open ${m.name || 'this person'}`}
          ref={(el) => { openers.current[m.id] = el; }} onClick={() => open(m.id)}>
    <strong>{m.name || '—'}</strong>
  </button>
  ```
  The avatar and chips stay outside the button, so the chips are not read twice.
- The `<tr>` gets `onClick={(e) => { if ((e.target as HTMLElement).closest('button,a,input,[role="menu"]')) return; if (window.getSelection()?.toString()) return; open(m.id); }}`. The selection check keeps "select a phone number to copy it" from opening the drawer. The table drops `static`, so `.datatable tbody tr { cursor: pointer }` applies (`w360.css:637-638`). The `<tr>` itself stays unfocusable: the button is the keyboard target, as WCAG 2.1.1 and the RecordPeople precedent require.
- The kebab keeps `Menu`'s stop-propagation (ui.tsx `Menu`: "Clicks stop propagation").
- `.scroll-x` becomes `.scroll-x edgefade` (`Groups.tsx:747`, `w360.css:1282`).
- The ✓ verification marks (`Groups.tsx:795, 800`) become `<StatusChip state="good">Verified</StatusChip>`. When the number or address is present but not verified, nothing is shown in the table. The drawer says "Not verified".
- Born uses `ddmmyyyy(m.dob)` from `ui.tsx` instead of `fmtLocal(m.dob, { dateOnly: true })` (`Groups.tsx:809`). `fmtLocal` appends `Z` to a date-only string (`lib/format.ts:13-14`): WebKit returns the raw ISO, and `getDate()` shifts the day west of UTC. **Do not change `fmtLocal` itself in this task.** It has other callers; record it in the report as a follow-up.

### 4.2 URL and history

- History state carries a depth: the number of member entries this tab has pushed since the drawer was last closed.
  ```ts
  type MemberNav = { memberDepth?: number };
  function open(id: string, from: 'row' | 'link') {
    const depth = from === 'link' ? ((location.state as MemberNav | null)?.memberDepth ?? 0) + 1 : 1;
    setParams(withM(params, id), { state: { memberDepth: depth } });       // push
  }
  function close(opts?: { then?: () => void }) {
    const d = (location.state as MemberNav | null)?.memberDepth ?? 0;
    origin.current = null;                                                   // §4.3 focus return
    if (d > 0) navigate(-d); else setParams(withoutM(params), { replace: true });
    opts?.then?.();
  }
  ```
  - **The drawer's open state is derived, never pushed by an effect.** `memberId = params.get('m') ?? undefined`, and `drawerShown` is computed from it (and from "no dialog or preview is up", §4.3). No `useEffect` calls `open()`. Only user gestures do: the row click and the name button with `'row'`, the Family links with `'link'`. An effect that called `open()` on a deep-linked `?m=` would push a duplicate `[g&m]` entry at depth 1, and ✕ (`navigate(-1)`) would land back on the original `?m=` entry and re-open the drawer (AC 23).
  - A deep link or reload has no state, so depth is 0 and close replaces.
  - On a phone, where the drawer is the whole screen, Back pops one entry. It closes a drawer opened from the row, or steps back one person after a family link.
  - ✕, Esc and the scrim always close the whole drawer (AC 17).
  This avoids the `[g] → [g&m] → [g]` stack in which Back re-opens a closed drawer.
- Selecting another group (`select()` in `Groups.tsx`) also deletes `m`. So does `clearSelection()` (`Groups.tsx:221-225`, run after a group is deleted), which today deletes only `g`. `GroupDetail` is keyed by group, so the drawer unmounts with it.
- After a successful Remove of the drawer's member, MembersTab calls the same `close()` (not a bare `replace`): `navigate(-d)` when `d > 0`, otherwise `replace`. The pushed member entries then sit only in forward history, so Back after Remove leaves the drawer closed and goes to whatever preceded `[g]`. Forward could still reach a removed member's `?m=`, which shows the not-found state ("This person is not in this group"); that is an honest answer for a URL that no longer resolves. `doRemove` decides "the drawer's member" by `removing.id === memberId`; a Remove from a row kebab with no `m` does not touch history (today's behaviour).
- A `?m=` with no `?g=`, or whose member is not in the selected group's `members` list: the drawer opens and `memberDetail(selected.id, m)` decides (§7). With no `?g=`, `selected` is the first group (`Groups.tsx:203-210`), so a bare `?m=` only resolves when the member is in that group. A `null` answer shows the not-found state. The URL is not rewritten, so the user can see what they followed.
- The drawer is rendered only after `groups` has settled and `selected` exists. With no groups at all, `?m=` is ignored (the page's own empty state shows).

### 4.3 The drawer (new `apps/web/src/w360/pages/MemberDrawer.tsx`)

It is a page-level composition, not a new shared component. It goes in its own file because `Groups.tsx` is already 1,630 lines.

**Where it renders.** `MemberDrawer` and the card `PaperPreview` render in MembersTab's **final** return, beside the existing `PersonDialog`, remove `Dialog` and `InviteDialog` (`Groups.tsx:866-913`). They are after MembersTab's early returns for `q.isPending` (`Loading`) and `q.isError && !q.data` (`Failed`) at `Groups.tsx:697-702`. So while the members read is pending or has failed, a `?m=` deep link shows the tab's own Loading or Failed and no drawer; the drawer appears once the table, and therefore the origin name button, exists (AC 4's deep-link path depends on this). "Add a person" (`Groups.tsx:729-735`) gains `ref={addPersonRef}`; that ref does not exist today.

**Props.** `MemberDrawer({ group, memberId, row, parcel, origin, onClose, onOpenMember, onEdit, onAction, onOpenCard, onShowActivity, initialFocus, returnFocus })`, where:

- `row` is `members.find(x => x.id === memberId)` (pending title only, §4.3 "One source of truth");
- `parcel` is `q.data?.parcels.find(x => x.id === p.parcelId)`, the same lookup the table does at `Groups.tsx:765`. MembersTab resolves it from `detail.person.parcelId` once the detail has loaded (it passes `undefined` before). `ParcelOption.surveyNo` (`familiesData.ts:141-144`) supplies "Applies to" and the `sub` line; `undefined` reads "the whole estate".

It renders the shared `Drawer` in look mode, as `PaperPreview` does (no `primary`, so no footer):

- `eyebrow={drawerEyebrow(group.name, 'Members')}`
- `title={m.name || 'This person'}`
- `sub`: one factual dot line from a pure `memberSub(p, parcel)` in `groupsData.ts`: relationship or role, "heir" or "minor", and "<n>% of <`Survey <surveyNo>` | the whole estate>". For example: "Brother · heir · 50% of the whole estate" or "Brother · heir · 50% of Survey 112/3". The sealed world's `root.members` envelope answers only the first top-level field (`world.ts:405-410`), so `parcels` arrives as `[]` there; the named-parcel case is covered by a `memberSub` unit test (§10), not by the sealed spec.
- `initialFocus`: `".drawerbody"` on a fresh open. When the drawer re-mounts after yielding (below), MembersTab passes the selector of the control that caused the yield:
  - `'[data-member-edit]'` after **Edit**, and also after the Documents empty state's **Scan Aadhaar** (once a card is kept the empty state, and its button, are gone);
  - `'[data-card-open]'` after the card preview;
  - `".drawerbody"` after a kebab dialog (Copy the invite link, a refused Remove).
  `useFocusTrap` falls back to the first focusable control when a selector misses (`Dialog.tsx:63-64`). MembersTab keeps the selector in one `useState<string>` set by whoever yields and reset to `".drawerbody"` in `close()`.
- **Focus return.** `Drawer`'s `useSealedPage` (`Drawer.tsx:91-140`, a passive `useEffect`) records `document.activeElement` at mount and restores it on unmount. It uses `returnFocus` only when that opener is disconnected. A row click (a `td` is not focusable) and a deep link both leave focus on `<body>`, which is connected, so `returnFocus` alone would not work. MembersTab therefore focuses the opener first, in a layout effect. React runs it before the child `Drawer`'s passive effect reads `activeElement`:
  ```tsx
  // MembersTab
  const returnRef = useRef<HTMLElement | null>(null);
  const origin = useRef<string | null>(null);        // the row the user started from; reset in close()
  const shownBefore = useRef(false);                 // was the drawer already shown on the previous commit?
  useLayoutEffect(() => {
    if (!drawerShown || !memberId) { shownBefore.current = false; return; }
    if (!shownBefore.current) {
      // Closed → shown (a fresh open, a deep link, or the re-mount after a yield).
      shownBefore.current = true;
      if (origin.current === null) origin.current = memberId;
      returnRef.current = addPersonRef.current;
      const el = document.activeElement;
      if (!el || el === document.body) {
        (openers.current[origin.current] ?? addPersonRef.current)?.focus({ preventScroll: true });
      }
      return;
    }
    // Same drawer, new person (a Family link, or Back/Forward within the drawer).
    // The focused link may have unmounted under Loading, and the origin button is
    // behind the inert seal, so focus() on it would do nothing. Hand focus to the
    // panel body unless React kept a control inside the panel focused.
    const body = document.querySelector<HTMLElement>('.w360 .drawer .drawerbody');
    if (body && !body.closest('.drawer')?.contains(document.activeElement)) {
      body.focus({ preventScroll: true });
    }
  }, [drawerShown, memberId]);
  ```
  - `useFocusTrap`'s initial focus does not re-run on a person switch (its deps are `[active, initialFocus, ref]` and the `Drawer` stays mounted), which is why the second branch exists. `.drawerbody` is `tabIndex={-1}` (`Drawer.tsx:262-268`), so it takes focus without becoming a Tab stop (AC 22, WCAG 2.4.3).
  - Only one W360 `Drawer` is ever mounted at a time on this page (the drawer yields to the card preview), so the selector is unambiguous.
  - `returnFocus={returnRef}` is the fallback for a removed row, so it is always "Add a person".
  - Following a parent or spouse re-renders the same mounted `Drawer` (its `key` is not the member id). The opener recorded at first mount is kept, and closing returns to the row the user started from.
  - After a yield (below), the drawer re-mounts with focus already on the control the dialog or preview restored. For PersonDialog and the kebab dialogs that is the control the drawer's seal restored when it unmounted, which is the origin name button; for the card preview it is also the name button (the member drawer unmounts first and its seal hands focus back to the name button, which the preview then records and restores). That control is connected, so the seal records it as the opener, and `initialFocus` (`[data-member-edit]`, `[data-card-open]` or `.drawerbody`) then moves focus to the right control inside the panel.
  - **After a successful Remove** the drawer does not re-mount, and the confirmation's own restore targets the removed row's (disconnected) name button. `doRemove` therefore ends, when `removing.id === memberId`, with `close()` and then `requestAnimationFrame(() => addPersonRef.current?.focus())` (AC 11). The row-kebab Remove path keeps today's behaviour; its identical focus loss is noted as a follow-up in the delivery report, not fixed here.
  - This is page-level; `Drawer.tsx` does not change.

**One source of truth for the person.** The drawer renders identity, family, share and actions from `detail.person` (call it `p`), the `memberDetail` response.

- The table row (`members.find(id)`) is used only for the title while `memberDetail` is pending, and for nothing else.
- `memberActions`, `setForm({ editing })`, `setRemoving` and `setInvited` all receive `p`.
- `PersonDialog people={members}` stays the table's list, because it is the list a parent or spouse is chosen from.
- Both queries sit under `GROUPS`, so one write refreshes both.

If Reddy refuses D2 (§11.2), the same rule holds with `members.find(id)` as the source. Not found becomes `!members.some(x => x.id === id)` once `members` has settled, and the Documents card row is not drawn.

Body order: each section has an `<h3>` (the drawer title is the `<h2>`), and each section's pairs are `KV as="dl"`:

1. **Action row:**
   - `button.btn` (outlined) **Edit** with `data-member-edit`, and `EditOutlined` (`@mui/icons-material/EditOutlined`, `sx={{ fontSize: 16 }}`, `aria-hidden`), the per-file import precedent in `ComplianceAdmin.tsx:5, 583`;
   - `Menu label="More actions for <name>" header={name} items={toItems(memberActions(p).filter(a => a.id !== 'edit'))}`.

   **The kebab inside the drawer needs one additive change to the shared trap.** No W360 drawer contains a `Menu` today (`RecordMoney`/`RecordPhotos` menus sit outside their `<Drawer>`). `Menu` portals its list to the `.w360` root (`ui.tsx:1018-1053`), outside the panel, and the list is not `aria-modal`. `useFocusTrap` listens on `document` in the capture phase (`Dialog.tsx:71-94`) and steps aside only for focus inside `[aria-modal="true"]`, so with the kebab open it would take Esc first and close the whole drawer (and its Tab branch would pull focus back to the panel's first control). `Menu`'s own handlers are `window` bubble-phase listeners (`ui.tsx:952-961`) and therefore always run after the trap.

   Chosen fix (option a): extend the step-aside guard in `apps/web/src/w360/Dialog.tsx` for keys other than Tab:
   ```ts
   const at = document.activeElement;
   if (el && at && !el.contains(at)
       && (at.closest('[aria-modal="true"]') || (e.key !== 'Tab' && at.closest('[role="menu"]')))) return;
   ```
   - **Esc** in the menu: the trap stands aside; `Menu` closes and focuses its kebab (`close(true)`); the drawer stays open, `m` stays (AC 21).
   - **Arrow keys** in the menu: the trap stands aside (it ignores them anyway); `Menu` moves between items as today.
   - **Tab / Shift-Tab** in the menu: the trap is *not* bypassed. Focus is outside the panel, so it calls `preventDefault()` and focuses the panel's first control; `Menu`'s window listener then runs `close(true)` and focuses the kebab. The deterministic result is "menu closed, focus on the kebab". Bypassing the trap for Tab too would let the browser's default Tab leave the panel when the kebab happens to be the last focusable control (a refused-card row with no Open and no Activity section), and the inert page would hand focus to browser chrome.
   - The change is additive: it only affects keys pressed while focus is in a `[role="menu"]` outside a trapped panel. With no portalled menu open it is a no-op for every existing dialog and drawer.

   Rejected (option b): rendering the secondary actions as `button.btn.sm` text buttons. Up to four extra buttons (Send the invite, Copy the invite link, Revoke access, Remove from this group) would crowd a 26rem header row, put a danger action at the same weight as Edit, and diverge from the row's kebab that the heuristic audit asked the drawer to mirror.

   `memberActions` is lifted out of MembersTab's `rowActions` closure (`Groups.tsx:658-686`) into `groupsData.ts` as a pure function, keeping the same conditions and order:
   ```ts
   export type MemberActionId = 'edit' | 'invite' | 'copy' | 'revoke' | 'remove';
   export function memberActions(m: GroupMember): { id: MemberActionId; label: string; danger?: true; rule?: true }[]
   // edit: always.
   // invite ('Send a reminder' | 'Send the invite'): heir, not verified.
   // copy: pending with a token.
   // revoke: status set, not revoked.
   // remove: always (danger, rule).
   ```
   MembersTab maps each `id` to its existing handler (`setForm`, `doInvite`, `setInvited`, `doRevoke`, `setRemoving`) in one `toItems`. The row uses every item; the drawer drops `edit`. No label string is compared.
   There is no filled button in the drawer: "Add a person" stays the tab's one filled action (design.md § Property tabs, "Fill means act").
2. **Photo / initial:** `.avatarlg`, which shows `m.photo` (a data URL) or `initialsOf(name)`. The alt is "Photo of <name>". A missing photo is decorative.
3. **Details** (`KV as="dl"`):
   - Relationship or Role;
   - Born `ddmmyyyy(dob)` and "Minor" when `isMinor`;
   - Gender, through the existing `cap()`;
   - Mobile, then `<StatusChip state="good">Verified</StatusChip>` or `<StatusChip state="unknown">Not verified</StatusChip>` (`ui.tsx:454`; states are `good | warn | bad | unknown`). No number means "not set" and no chip;
   - Email, with the same chip rule;
   - Address (`presentAddress`), Marital status, Aadhaar.

   **About** (`bio`) is not a `KV` row, because a long bio right-aligned in a `dd` reads poorly. It renders under its own `<h3>About</h3>` as a `<p>` with `white-space: pre-line` (an inline style, as the drawer body already uses for layout). When empty, it is `<p className="note">not set</p>`.
   For Aadhaar, `formatAadhaarMask(detail.aadhaar?.masked || p.aadhaarMasked)` rendered as `<span className="num" aria-hidden="true">XXXX XXXX 4321</span><span className="sr-only">ending 4321</span>` (`.num` is `w360.css:139`, `.sr-only` is `w360.css:2983`). An `aria-label` on a plain span is not reliably announced, and a reader spelling out twelve X's helps nobody.

   When `detail.aadhaar` is present, a `<span className="note num">` follows on its own line, with `<date>` = `fmtLocal(recordedAt, { dateOnly: true })`:
   - `origin='scan'`: "Read from the card · <date>";
   - `origin='typed'`: "Typed · <date>";
   - any other origin: the date alone;
   - an empty `recordedAt` drops the date and its dot.

   With no mask, the value is "not set".

   A missing value reads **"not set"** (design.md § Property tabs, "Missing reads as missing"). Rows are always drawn, so the shape is stable.
4. **Family** (when `groupTypeDef(type).hasTree`):
   - Father, Mother and Spouse are `button.link`s that call `open(otherId, 'link')`: a push with depth + 1 (§4.2), so Back returns to the previous person and ✕ still closes the whole drawer. A link whose id is not in `members` renders as text;
   - an unlinked spouse shows `spouseName · spouseContact`, with `spouseStatus` as text;
   - Guardian shows when `isMinor`;
   - no section is drawn when every value is empty and the person is not a minor.
5. **Share** (heirs only): Share `num(sharePct)%`, Applies to (`parcel.surveyNo` from the `parcel` prop, as the table's Share column at `Groups.tsx:821`, or "the whole estate" when `parcel` is undefined), Held as (`KIND_WORD`), Verification `<State>` (same mapping as the table's `memberStatusChip`), the heir's answer, and Invite (`inviteStatus`).
6. **Documents**: §5.
7. **Activity**: up to five events from `useGroupActivity(group.id)`, filtered by `e.target === m.id`, newest first (the resolver's order). It is a `.rows` `<ul>`; each `<li>` reads `cap(e.action.replace(/_/g, ' '))` · `e.details` · `fmtLocal(e.timestamp, { dateOnly: true })` in a `.note.num`. The action and detail wording is the Activity tab's (`Groups.tsx:1185-1186`); the date is deliberately **date only**, whereas the tab shows date and time (`fmtLocal(e.timestamp)`, `Groups.tsx:1188`), because a five-line summary in a 26rem panel does not need the minute and the full log is one link away. Under them sits a `button.link`, "See all in Activity". The tab is a `useState<TabId>` inside `GroupDetail` (`Groups.tsx:367`), so `MembersTab` gains a prop `onShowActivity: () => void`. `GroupDetail` passes `() => { setTab('activity'); requestAnimationFrame(() => document.getElementById(`${group.id}-tab-activity`)?.focus()); }`, and the link calls `close({ then: onShowActivity })`. With the tab on Activity, MembersTab unmounts, so the drawer cannot linger. The seal's focus restore then targets a disconnected opener, and the tab focus overrides it (AC 19).

   What this shows today, from source: the member-targeted audits are `add_member`, `invite_member` (`main.py:4607, 4713`) and the legacy `add_family_member`/`invite_family_member`. Edits are not audited, and `link_aadhaar_card` targets the Aadhaar record, not the member (`main.py:3540`), so keeping a card does **not** appear here. `groupActivity` returns the group's latest 50 events (`main.py:2031`), so an old member in a busy group may show none. That is acceptable for "recent activity". No API change is proposed.

   Fetching is cheap: the same query is already used by the Activity tab and is cached under `GROUPS`. Its states: pending shows nothing (the section waits; no skeleton for history), error omits the section (the tab owns the retry), and zero matching events omits it. It is history, and the owner has no action to take on it.

Dialogs over the drawer use the rule **"the drawer yields"**. The `Drawer` seals the page with `inert` and a focus trap (`Drawer.tsx:68-140`), and `PersonDialog` is an MUI `Dialog` portalled to `body`. Stacking them would make two focus traps fight, and Esc would close both. So for **Edit**, **Remove from this group** and **Copy the invite link**:

- MembersTab sets `form` / `removing` / `invited` exactly as the row kebab does;
- the drawer is not rendered while any of them is set;
- `m` stays in the URL;
- the drawer re-mounts when the dialog closes, if the member still exists.

For Remove, success also closes the drawer through `close()` (§4.2) and focuses "Add a person" (Focus return, above). "Send the invite / a reminder" and "Revoke access" run in place: the toast is the feedback, and the drawer's query refetches through the `GROUPS` invalidation in `useGroupWrite`.

This keeps one modal surface on screen at a time, and it reuses MembersTab's existing state and handlers unchanged, so the row and the drawer cannot drift apart.

**Why the Remove confirmation yields instead of using `Drawer`'s `over` slot.** `Drawer` has an `over` slot for "a confirmation raised from inside the panel — removing the person" (`Drawer.tsx:152-156`), and RecordPeople's `PersonDrawer` uses it (`RecordPeople.tsx:384`). It is not used here on purpose: MembersTab already owns the Remove `Dialog`, its `removing` state and its refusal handling (`Groups.tsx:643-653, 882-911`), and the same yield rule must cover PersonDialog, an MUI `Dialog` portalled to `body` that cannot sit in `over`. One rule for every dialog, reusing the existing state, beats two mechanisms. Do not "fix" this back to `over`.

Opening a document uses the same rule. The drawer yields to `PaperPreview`, and closing the preview re-mounts the member drawer.

### 4.4 Keyboard and screen reader

- The name button is Enter/Space activated and named "Open <name>". The drawer is `role="dialog"`, labelled by its title (the `Drawer` contract).
- The `Drawer` already provides the focus trap, Esc, the scrim, scroll lock and focus return (`Drawer.tsx:20-29`).
- Section heads are `<h3>`, and pairs are `<dl>` (`KV as="dl"`).
- Every icon is `aria-hidden` inside a named control. Document rows are `<ul>` with one `<li>` each. Open is a `button` named "Open <file name>", and Download is named "Download <file name>".
- Status is never colour alone: `StatusChip` and `State` carry words.

### 4.5 Responsive

- 1512: the drawer is 26rem over the group. The table stays visible behind the scrim.
- ≤ 26rem (390): the drawer is full-screen. KV rows wrap their values. The document row's meta line wraps under the name, the way `.paper-row-actions` does under 640px.
- No `fr` without `minmax(0, …)`. Nothing is fixed-height except the shared drawer.
- Long values (an email of 60 characters, an address) wrap; no ellipsis hides a fact.
  - `.w360 .kv dd, .w360 .kv .v` (`w360.css:2432`) has no wrap rule today, so `overflow-wrap: anywhere; min-width: 0;` is added to that selector once.
  - `KV` is shared app-wide, so the report names this as an app-wide change. It only adds wrapping where an unbroken value would otherwise overflow.
  - Under 700px, `.kv` rows already stack and left-align (`w360.css:5303-5306`), so at 390 every value is left-aligned.
  - The bio is a paragraph (§4.3 item 3), not a `dd`.
- Targets: Open, Download, Edit, the kebab and each family link are at least 24×24 CSS px (WCAG 2.5.8); `.btn.sm` and `.iconbtn` already meet it. Family `button.link`s sit on their own `dd`, so spacing holds.
- 200% zoom at 1512 behaves like 756 wide: the drawer stays `min(26rem, 100vw)` and scrolls inside `.drawerbody`.

### 4.6 Formatting rules (one source each)

| Value | Function | Why |
|---|---|---|
| Date-only (`dob`) | `ddmmyyyy` (`ui.tsx:136`) | string slice, no `Date` parse, so no WebKit or timezone shift |
| Timestamp (`node.createdAt`, `e.timestamp`, `aadhaar.recordedAt`) | `fmtLocal(ts, { dateOnly: true })` (`lib/format.ts:10`) | a UTC instant must show the viewer's local day; slicing it would show 30/09 for an evening-IST upload |
| Size | `formatBytes` (`@pattadar/core`) | the vault's wording |
| Share % | `num(sharePct)` + `%` (`ui.tsx`) | `en-IN` grouping, as the table |
| Aadhaar | `formatAadhaarMask` (`@pattadar/core` `format/docName.ts:69`) | turns `XXXX-XXXX-1234` into `XXXX XXXX 1234`; never receives more than 4 digits |

Every one of these renders inside `.num` (`w360.css:139`) or `.kv dd`, which already sets `font-variant-numeric: tabular-nums` (`w360.css:2432`). No new class. No other date formatter is introduced.

## 5. Documents section

### 5.1 What exists today

| Item | Where it lives | Linked to the member by |
|---|---|---|
| Kept Aadhaar card | Gateway storage node + version (`storage_nodes`/`storage_versions`, `{node}/{version}` key, SSE), saved through `POST /storage/files` as `Aadhaar card.<ext>` (`PersonDialog.tsx:255-276`) | `family_members.aadhaar_record_id` → `aadhaar_candidates.card_node_id`/`card_version_id` (`aadhaar.py:83-84, 96`), set by `linkAadhaarCard` (`main.py:3520-3541`) |
| Member photo | `family_members.photo`, a 256 px data URL (`PersonDialog.tsx:311-315`) | the member row itself |
| Any other document | `documents` rows link only to parcel, passbook or property (`main.py:481-506`, `6249-6266`) | **nothing**: no member link exists |

### 5.2 Rendering (phase 1)

The section is titled `Documents` (vocabulary: Documents, item "document", bytes "file"). It uses the `.rows boxed` list pattern from `RecordPapers.tsx:744-760`. That pattern is plain CSS, not a hand-built `card`, so it does not count against the budget.

The card row shows:

- `Icon name="identity"`;
- the file name from the gateway node (`Aadhaar card.pdf`);
- `<Chip>Identity</Chip>`;
- a `.note.num` line: `fmtLocal(node.createdAt, { dateOnly: true }) · formatBytes(node.sizeBytes)`. `formatBytes` is `@pattadar/core`'s (`records/fileKinds.ts:74`), the formatter the Documents vault uses (`Vault.tsx:18, 607`), giving "212 KB" rather than `filePhotos.mb`'s "0.2 MB". An unknown size returns `''` and is dropped with its dot;
- `button.btn.sm` **Open** with `data-card-open`, and `button.iconbtn` **Download** (`FileDownloadOutlined`, `aria-hidden`), named per §4.4.

If `node.currentVersionId !== cardVersionId`, the note gets "· kept version" and the size is **dropped** with its dot: `node.sizeBytes` is the current version's size, so it would describe a different file. The note then reads "<DD/MM/YYYY> · kept version", where the date is still `node.createdAt` (when the file was first saved). The kept version is what Open and Download use.

Card metadata comes from the client with `GET /api/gateway/storage/nodes/{cardNodeId}` (`gateway/src/routes/storage.py:405-422`). The gateway decides access in SQL (`svc._access`): the owner gets the node; a caller with only share access gets the node without its ancestors; anyone else gets 404. The response is `{ node, breadcrumb }`; the drawer reads only `node.name`, `node.mimeType`, `node.sizeBytes`, `node.createdAt`, `node.currentVersionId` and `node.trashedAt` (camelCase per `storage.py:92-106`).

It is read with `useQuery` in `groupsData.ts` as `useStorageNode(nodeId)`, key `[...GROUPS, 'member-card', nodeId]` (so member writes refresh it), `enabled: isStorageRef(nodeId)` (`pages/documents/storage.ts:13`), `staleTime: 60_000`, `retry: (n, e) => !isRefusal(e) && n < 1`, where `isRefusal` is true for a 403 or 404 (a refusal is an answer, not a fault). For everything else that matches the app default (`retry: 1`, `main.tsx:37`). Fetch goes through the same `apiFetch` the storage helpers use, so the Cognito token rides as today.

**Why not join in the API:** `storage_nodes` is the gateway's table. Locally it is a separate database (`scripts/start-local.sh:131` `GW_DB="pattadar_hub"` versus `:253` `dbname=pattadar`), and the API's own backfill treats it as optional (`main.py:5777-5791`).

### 5.3 Open and Download: reuse, with two additive props

- `paper/scan.tsx` `useScan(fileRef, version?)` appends `&version=<id>` when `version` is given. The gateway already serves pinned versions (`storage.py:511-528`, `_CACHE_PINNED`). Existing callers pass one argument and are unchanged. `version` joins the effect's dependency list, and it is appended only when `isStorageRef(version)` holds; any other value is ignored and the current version is served (the API already blanks non-UUID card ids, so this is belt and braces against a hand-edited response).
- `paper/PaperPreview.tsx` gains an alternative prop shape. Its props become `({ paperId: string } | { file: { fileRef: string; version?: string; name: string; mimeType: string; eyebrow: string } }) & { onClose; returnFocus? }`. Every branch that reads `data` today (`PaperPreview.tsx:120-215`) reads one derived `view` instead:
  ```tsx
  const doc = useDocument('paperId' in props ? props.paperId : undefined);   // disabled for a file
  const view = 'file' in props
    ? { title: props.file.name, mimeType: props.file.mimeType, pageCount: 1, subtitle: undefined,
        eyebrow: props.file.eyebrow, recordHref: undefined }
    : doc.data && { title: doc.data.title, mimeType: doc.data.mimeType, pageCount: doc.data.pageCount,
        subtitle: doc.data.subtitle || undefined,
        eyebrow: drawerEyebrow(doc.data.recordTitle || 'Your documents', 'Preview'),
        recordHref: doc.data.recordId ? `/app/papers/${props.paperId}` : undefined };
  const scan = useScan('file' in props ? props.file.fileRef : doc.data?.fileRef,
                       'file' in props ? props.file.version : undefined);
  ```
  - The `Loading` branch and both `Failed` branches render only when `'paperId' in props`. With a file, the body is the scan column from the first render, and `ScanView`'s own states carry the rest.
  - The title falls back to "Document" and the eyebrow to "Your documents · Preview" only while `view` is undefined, as today.
  - `pages` is `view?.pageCount ?? 0`, so a file reads "page 1 of 1" and shows no pager.
  - The member drawer passes `eyebrow: drawerEyebrow(<member name>, 'Documents')`.
  - Width, resize grip and zoom are unchanged. Existing callers pass `paperId` and render exactly as before.
- `pages/documents/storage.ts` `fetchFileBlob(fileRef, version?)` appends `?version=` in the same way. Download is `downloadBlob(await fetchFileBlob(nodeId, versionId), node.name)`, with `toast.bad('The file could not be downloaded. Try again.')` on failure.

`components/FileViewer.tsx` is not used. It is legacy-shell only (`FileViewerHost` is mounted in `layout/AppShell.tsx:392`, not in W360).

### 5.4 Document states

| State | Shown |
|---|---|
| No Aadhaar on file, no documents | `Empty icon="paper" title="No documents for this person"`, `action` = `button.btn` **Scan Aadhaar** (opens PersonDialog in edit mode; its existing scan box does the rest) |
| Aadhaar on file, `cardNodeId` empty | Aadhaar row in Details as usual. Documents shows `Empty` with "No documents for this person", the line "Card not kept", and **Scan Aadhaar** as above (re-scanning with the box ticked keeps the card) |
| Metadata loading | `Loading h="4rem" what="the kept card"` |
| Metadata 404/403 | Row with name "Aadhaar card", note "This file is no longer available", no Open/Download, no retry (the same answer as `useScan`'s `gone`) |
| `node.trashedAt` set | Row with note "In the trash · restore it in Documents"; Open/Download hidden. This is a UX choice, not a security control: `StorageService.content_identity` (`gateway/src/storage.py:340-375`) has no `trashed_at` filter, so the owner could still fetch the bytes |
| Metadata 5xx/network | `Failed what="The kept card" onRetry` (shared) |

### 5.5 Photo

The member photo is the avatar and is not listed under Documents: it is not a stored file, so it has no date, size or download. Changing that is D6.

### 5.6 Phase 2: "Attach a document" (Reddy decision D3)

Recommended path (D3a):

- **Schema:** an additive `ALTER TABLE documents ADD COLUMN IF NOT EXISTS member_id TEXT NOT NULL DEFAULT ''`, in `init_db` next to `property_id` (`main.py:6266`), plus a partial index `WHERE member_id <> ''`.
- **Mutation:** `createDocument` gains an optional `memberId`. The resolver verifies it with `SELECT 1 FROM family_members WHERE id=%s AND owner_user_id=%s` and raises "That person is not yours to file against" otherwise.
- **Upload:** the existing W360 path, `uploadToDrive` then `createDocumentRow`, with `docType` chosen from the identity shelf.
- **Detail query:** `memberDetail.documents` lists `documents WHERE member_id=%s AND owner_user_id=%s`.
- **Viewing:** rows open in `PaperPreview paperId=…` unchanged, and appear in the Documents vault on the Identity shelf.
- **Remove:** a row's "Remove" uses `ConfirmDialog` and `trashDocument`.

Alternatives:

- D3b: a separate `member_documents(member_id, document_id)` link table, allowing many-to-many.
- D3c: defer, so phase 1 shows only the card.

## 6. Loading, error and not-found (drawer level)

| Condition | Recoverable | User sees | Logged |
|---|---|---|---|
| `memberDetail` pending | yes | `Loading h="18rem" what="this person"` in the drawer body; the title shows the table's name if known, otherwise "This person" | no |
| GraphQL/network error | yes | `Failed what="This person's details" error onRetry={q.refetch}` | the browser only; the API logs its own exception at ERROR as today |
| `memberDetail` returns `null` (not the caller's, in another group, deleted, malformed id). `memberDetail` alone decides, even if the table row exists | no | `Empty icon="person" title="This person is not in this group"`; no metadata calls | API: none (the same as `members` returning `[]`) |
| Refetch fails while data is shown | yes | Data stays; one `p.note role="status"` reads "This could not refresh just now." (the Groups wording, `Groups.tsx:271-279`) | no |
| Edit/Remove/Invite/Revoke fail | yes | Existing MembersTab behaviour, unchanged (toast; dialog stays open) | as today |

## 7. Backend data

### 7.1 Already available (no change)

`members(groupId)` returns every PersonType field (`main.py:636-676`, resolver `1987-2008`) except a usable invite token (`without_token`). The web already selects all of them through `MEMBER_FIELDS` (`pages/families/familiesData.ts:178-182`). The data for identity, family, share, verification and status therefore already exists. `memberDetail` still returns it as `person`, so each open of the drawer reads from one source (§4.3, "One source of truth"). The table read is unchanged. `groupActivity(groupId)` already covers member targets (`main.py:2010-2030`).

### 7.2 Missing: the Aadhaar record summary, and the card pointer

PersonType has only `aadhaarMasked`. Nothing exposes `aadhaar_record_id`'s card pointers. **Add one root query** next to `members` in `services/api/src/main.py`. It is a new GraphQL contract that exposes Aadhaar card pointers, so it is **blocked until Reddy approves D2** (§11.2). Nothing in §7.2–§7.3 is built before that:

```python
@strawberry.type
class MemberAadhaarType:
    masked: str            # 'XXXX-XXXX-1234' or ''. Never more than the last 4
    origin: str            # 'scan' | 'typed' | ''
    recorded_at: str       # ISO 8601 UTC, e.g. '2026-09-30T20:00:00+00:00', or ''
    card_node_id: str      # canonical UUID or ''
    card_version_id: str   # canonical UUID or ''

@strawberry.type
class MemberDetailType:
    person: PersonType
    aadhaar: Optional[MemberAadhaarType] = None

@strawberry.field
async def member_detail(self, info, group_id: str, id: str) -> Optional[MemberDetailType]:
    ...
```

**Validation:** `group_id` and `id` are both required strings of 1 to 128 characters with no whitespace. Anything else returns `None` without touching the DB. Ids are not assumed to be UUIDs: the fixtures use `w-mem-*`.

**Why `group_id` is an argument.** The drawer's not-found copy is "This person is not in this group". Without the group in the query, a `?m=` of the owner's member in *another* group (or a `?m=` with no `?g=`, where Groups falls back to the first group, `Groups.tsx:203-210`) would open a person under the wrong group's eyebrow. The client always passes the *resolved* `selected.id`, never the raw `?g=`.

**Authorization, in SQL in this resolver.** Invariant 5 puts authorization in SQL, and the API trusts `x-user-id` only from the gateway (invariant 1):

```sql
SELECT fm.* FROM family_members fm
  JOIN groups g ON g.id = fm.group_id AND g.owner_user_id = fm.owner_user_id
 WHERE fm.id = %s AND fm.group_id = %s AND fm.owner_user_id = %s
```

If no row comes back, return `None`. Self rows get the same `_real_name`/`_self_name` substitution and `without_token` as `members` (`main.py:1999-2008`). Unlike `members`, the resolver does **not** call `ensure_self`: it is a pure read and writes nothing.

`fm.*` includes `aadhaar_enc` (`main.py:6454`). `to_type(PersonType, …)` already drops any key PersonType does not declare (`main.py:121-129`), but the resolver also deletes `aadhaar_enc` from the row dict before anything else touches it, so no later change can leak it by accident. The API test asserts no `aadhaarEnc` key in the response.

**Aadhaar summary.** The query selects explicit columns only. `vault_token`, `ciphertext`, `name`, `dob`, `gender` and `address` are **never** selected (D4):

```sql
SELECT last4, origin, created_at, card_node_id, card_version_id
  FROM aadhaar_candidates WHERE id = %s AND owner_user_id = %s
```

The id is `fm.aadhaar_record_id`. The candidate's own `masked` column is not selected: the value is derived from `last4`, with the member row's mask as the only fallback. Rules:

- `masked = 'XXXX-XXXX-' + last4` when `last4` matches `^\d{4}$`, else `fm.aadhaar_masked` if it matches `^X{4}-X{4}-\d{4}$`, else `''`.
- `recorded_at = row["created_at"].astimezone(timezone.utc).isoformat() if row["created_at"] else ""`, built explicitly in the resolver (`timezone` is already imported, `main.py:26`). It must **not** go through `to_type`'s `str(v)` (`main.py:121-129`), which yields the space-separated `2026-09-30 20:00:00+00:00` that `fmtLocal` hands to `new Date(...)` (`lib/format.ts:10-14`) and that WebKit has historically refused to parse (AC 6 runs in the phone/WebKit project). Normalizing to UTC makes the offset `+00:00` regardless of the DB session's `TimeZone`.
- `origin` is passed only when it is `'scan'` or `'typed'`, else `''`.
- The card ids are passed only if `_is_canonical_uuid`, else `''`.
- With no record id, or no row, `aadhaar = None` (`masked` then comes from PersonType).

**Errors:** no `ValueError`s. Not found is `None`. DB errors propagate as today, as a GraphQL error logged at ERROR by the existing handler.

**Audit:** the read is not audited, matching `members`. Opening the card is a gateway read, already subject to the gateway's own logging. Whether opening an identity card should write an Activity event is D7.

### 7.3 Client operation: web-local, no `packages/core` change

The groups screen keeps its GraphQL strings in `apps/web` (`familiesData.ts`, `w360/groupsData.ts`), not in `packages/core/src/api/operations.ts`. The new hook follows that pattern in `apps/web/src/w360/groupsData.ts`:

```ts
export function useMemberDetail(groupId: string | undefined, memberId: string | undefined) {
  return useQuery({
    enabled: !!groupId && !!memberId,
    queryKey: [...GROUPS, 'member', groupId ?? '', memberId ?? ''],
    queryFn: async () => (await gql<{ memberDetail: MemberDetail | null }>(
      `query($g:String!,$id:String!){ memberDetail(groupId:$g,id:$id){ person { ${MEMBER_FIELDS} } aadhaar { masked origin recordedAt cardNodeId cardVersionId } } }`,
      { g: groupId, id: memberId })).memberDetail,
    staleTime: 15_000,
  });
}
```

Its key sits under `GROUPS`, so every member write's existing invalidation (`groupsData.ts:261`) refreshes it. `staleTime` matches `useGroupActivity`. `MEMBER_FIELDS` is the existing export (`familiesData.ts:178`), so the drawer's person shape is the table's `GroupMember` and no second type is hand-written.

**Parity:** `operations.ts` does not change, so `scripts/parity-check.ts` owes no `Queries.swift` twin (`parity-map.json:121-124`). This is a NOTE for `sync-ios`: iOS and Expo have no member details. If Reddy wants the operation in core for Expo or iOS reuse (D8), add `MEMBER_DETAIL_QUERY` to `operations.ts`, plus a byte-identical `Queries.memberDetail` in `apps/ios/PattadarKit/Sources/PattadarKit/Networking/Queries.swift`, and run `bun run scripts/parity-check.ts`.

### 7.4 Gateway

There is no change. `GET /storage/nodes/{id}` and `GET /storage/files/{id}/content?version=` already authorize by owner in SQL. Forging a `cardNodeId` grants nothing (`linkAadhaarCard` docstring, `main.py:3522-3525`).

## 8. Invariant ownership

| Invariant | Enforced by | Why there |
|---|---|---|
| Only the owner sees a member, and only under its own group | `member_detail` SQL (`owner_user_id` and `group_id`, joined to the owner's group) | the API is the only layer that knows ownership; the gateway forwards identity only |
| Full Aadhaar never leaves the server | the explicit column list in `member_detail`, plus an API test that strips UUIDs, then scans for a grouped 12-digit run, the fixture's synthetic number in every spelling, and the `vaultToken`, `ciphertext` and `aadhaarEnc` keys (§10) | the UI cannot be trusted to drop what it receives |
| Card bytes only to their owner | gateway storage authorization (unchanged) | storage access is decided in SQL, never by key or pointer (invariant 5) |
| DD/MM/YYYY | `ddmmyyyy` in `ui.tsx` (string-only) | one formatter, no `Date` parsing of date-only values |
| One modal surface at a time | MembersTab renders the drawer only when no dialog or preview state is set | the drawer seal and the MUI dialog cannot share focus |
| A menu raised inside a trapped panel owns Esc and arrows | the shared `useFocusTrap` guard (`Dialog.tsx`) | the trap is the capture-phase listener that would otherwise win; fixing it per page would mean every future drawer with a kebab re-solving it |
| Focus is never on `<body>` while the drawer is shown | MembersTab's layout effect (both branches) | only MembersTab knows the origin row and when the person changed; `Drawer.tsx` stays generic |
| No history entry is pushed except by a user gesture | `open()` is called only from click/keyboard handlers; open state is derived from `?m=` | an effect-driven push is what would make ✕ re-open a deep-linked drawer |

## 9. Files

- `services/api/src/main.py`: `MemberAadhaarType`, `MemberDetailType`, `member_detail` resolver.
- `services/api/tests/test_member_detail.py` (new; uses the existing DB test fixtures pattern from `test_aadhaar_vault_db.py`).
- `apps/web/src/w360/groupsData.ts`: `useMemberDetail`, `useStorageNode`, `memberActions` and `MemberActionId`, `memberSub(p, parcel)`, and the types.
- `apps/web/src/w360/Dialog.tsx`: the additive `[role="menu"]` step-aside (non-Tab keys) in `useFocusTrap`'s keydown guard (§4.3 item 1). Shared by every W360 dialog and drawer; a no-op unless a portalled menu holds focus. `useStorageNode` lives here, not in the drawer file, so its key stays next to `GROUPS`.
- `apps/web/src/w360/pages/MemberDrawer.tsx` (new).
- `apps/web/src/w360/pages/Groups.tsx`:
  - MembersTab:
    - the `rowopen` name button and the row click;
    - `?m=` open and close, with `memberDepth`;
    - the focus layout effect, with its closed→shown and person-switch branches;
    - `ref={addPersonRef}` on "Add a person" (`Groups.tsx:729-735`; the ref is new);
    - the `parcel` lookup passed to `MemberDrawer`;
    - `doRemove`'s drawer-member branch (`close()` then focus "Add a person");
    - the `initialFocus` selector state set by each yield;
    - the `onShowActivity` prop;
    - `rowActions` replaced by `memberActions` + `toItems`;
    - rendering `MemberDrawer`/`PaperPreview` in the final return beside the existing dialogs (`Groups.tsx:866-913`), after the Loading/Failed early returns (§4.3 "Where it renders");
    - `edgefade`, `ddmmyyyy` and the Verified `StatusChip`;
  - GroupDetail passes `onShowActivity`;
  - `select()` and `clearSelection()` clear `m`.
- `apps/web/src/w360/w360.css`: `overflow-wrap: anywhere; min-width: 0;` on `.w360 .kv dd, .w360 .kv .v` (app-wide, §4.5).
- `apps/web/src/w360/paper/scan.tsx`: optional `version` on `useScan`.
- `apps/web/src/w360/paper/PaperPreview.tsx`: the `file` alternative prop.
- `apps/web/src/pages/documents/storage.ts`: optional `version` on `fetchFileBlob`.
- `tests/e2e-app/specs/29-member-details.spec.ts` (new, sealed). It uses `world.set('root.groups'|'root.members'|'root.memberDetail'|'root.groupActivity', …)` and `page.route` for `/api/gateway/storage/nodes/*` and `/content`, with fixture records only.
- Docs: `docs/specs/2026-08-15-web-360-design.md` (the Groups section gains member details), and `docs/architecture.md` if it lists GraphQL root queries. Fix the stale comment in `tests/e2e-app/specs/07-record-people.spec.ts:1432` (drift).

## 10. Testing

- **Unit (bun):**
  - `ddmmyyyy('1979-04-02') === '02/04/1979'` (already covered; add a WebKit-independent assertion that the table uses it);
  - `memberActions` id lists for the four AC 10 fixtures, and that the drawer's list is the row's minus `edit`;
  - the Aadhaar note wording for `origin` `scan`, `typed` and `''`, and for an empty `recordedAt`;
  - `memberSub` with a named parcel ("50% of Survey 112/3"), with `parcel` undefined ("the whole estate"), and for a non-heir minor (no share part). This is the named-parcel coverage, because the sealed world returns `parcels: []`;
  - the card note: "· kept version" with no size when `currentVersionId !== cardVersionId`, and date · size otherwise.
- **API (pytest):**
  - the owner gets the detail;
  - another owner's member gives `None`;
  - the owner's member asked for under the owner's other group gives `None`;
  - the read leaves `family_members` row count unchanged (no `ensure_self`);
  - a member in a group owned by someone else gives `None`;
  - a bad id gives `None` with no query;
  - `masked` derives from `last4`, and falls back to a well-formed `fm.aadhaar_masked` when `last4` is malformed;
  - `recordedAt` matches `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?\+00:00$` (a `T`, never a space), including when the test connection's session `TimeZone` is set to `Asia/Kolkata`, and is `''` when `created_at` is null;
  - non-UUID card ids blank out;
  - no full number leaks. The fixture's `aadhaar_enc` and vault row are populated, and its synthetic number is the guard-allowed `1234 1234 1234`. Every fixture phone is stored in `joinPhone`'s form, `"+91 9876543210"` with the space (`countryCodes.ts:93-96`), and the test says so in a comment: an unseparated `+919876543210` is a 12-digit run the regex below would (correctly) flag. The test:
    - serializes the response and strips `/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi`;
    - asserts no match for `(?<![\d.])\d{4}[ -]?\d{4}[ -]?\d{4}(?![\d.])`;
    - asserts none of `123412341234`, `1234 1234 1234` or `1234-1234-1234` appears;
    - asserts no `vaultToken`, `ciphertext` or `aadhaarEnc` key;
  - a self row gets name substitution.
- **Sealed e2e (`app` + `phone`):**
  - AC 1–15 and 17–23 (AC 6 in both the app and phone projects, so WebKit parses `recordedAt`);
  - AC 21: open the drawer's kebab with Enter (so a menu item has focus), press Esc, and assert the menu list is gone, `document.activeElement` is the kebab, the drawer is still visible and the URL still has `m`; repeat with Tab;
  - AC 22: activate "Father", assert `document.activeElement` is inside `.drawer` (while `memberDetail` for Father is held pending by the world, and after it resolves); then `page.goBack()` and assert the same;
  - AC 23: `page.goto('?g=…&m=…')`, click ✕, assert no `m`, then `page.goBack()` and assert the drawer is not visible;
  - AC 4 for all three entry paths (name button, Born-cell click, deep link), asserting `document.activeElement` is the name button after Esc;
  - AC 18: the card Open test asserts that no `document` GraphQL operation was sent (the world's request log) and that "did not load" is absent;
  - one Activity line in AC 5's WebKit run. The API's audit timestamps are naive `utcnow().isoformat()` strings (6-digit fractions, with `Z` appended by `fmtLocal`), and the Activity tab already depends on WebKit parsing them;
  - the provoked failure states, in `test.describe` with `allowConsole: true` per AUTHORING rule 8.
- **functional-acceptance:** the drawer is a read surface over create/update/delete actions. Run Edit (save and refused save), Remove (confirm and refusal), Invite, Revoke and card Open/Download end to end on the local stack with synthetic members, including the refused-card path. Make no paid Aadhaar read unless Reddy asks.
- **Guards:**
  - every `scripts/*-tests.ts`, including `typography-tests.ts`, `shared-components-tests.ts` and `aadhaar-digits-tests.ts`;
  - `icon-guard`, `ux-guards`, `bun run typecheck`;
  - `parity-check.ts` (expected clean for this change; the `landcalc.ts` error belongs to another session);
  - because `useFocusTrap` is shared, the full sealed `e2e-app` suite (app + phone), not only spec 29. The specs that exercise a confirmation over a drawer (`07-record-people.spec.ts`, the `over=` path) and row kebabs are the regression signal for the guard change.

## 11. Decisions for Reddy (all open)

None of these is decided by this spec. The two tables differ only in what an implementation may do before Reddy answers.

### 11.1 Proceeds on the recommendation unless Reddy says otherwise

These cover reversible, phase-1, web-only UI work. Each can be undone by reverting the web change.

| # | Decision | Recommendation | Alternatives |
|---|---|---|---|
| D1 | Drawer with `?m=` vs a dedicated route | **Drawer** (§3) | route `/app/groups/:gid/members/:mid` |
| D4 | Show the card's read-back fields (name, DOB, gender, address as read) | **No**: show the mask, how it was recorded (origin) and the date only (§4.3 item 3) | show them under "Read from the card" |
| D6 | List the member photo as a document | **No**, it is the avatar | treat it as a document |
| D7 | Write an Activity event when the owner opens or downloads a kept identity card | **Defer** to the data-security pass Reddy scheduled ("I will come to the data security later") | audit now |
| D8 | Put the query in `packages/core` for Expo and iOS reuse (needs a `Queries.swift` twin) | **No** for now (web-local; NOTE to `sync-ios`) | core + inert Swift twin, as with `linkAadhaarCard` |
| D10 | The drawer's secondary actions: a kebab, which needs the additive `[role="menu"]` guard in the shared `useFocusTrap` (`Dialog.tsx`), versus text buttons with no shared change | **Kebab + guard** (§4.3 item 1), with the full sealed suite as regression | `button.btn.sm` text buttons for Send the invite, Copy the invite link, Revoke access and Remove |
| D9 | Card preview privacy: the card image shows the full number | **Show as stored** (the owner's own file, kept by opt-in); revisit in the security pass, per "I will come to the data security later" | blur by default with "Show card" |

### 11.2 Blocked until Reddy explicitly approves

No code for these is written in this delivery until Reddy records an explicit approval.

| # | Decision | Recommendation | If refused or not yet answered |
|---|---|---|---|
| D2 | Approve the new, additive, read-only `memberDetail(groupId, id)` GraphQL root query. It exposes Aadhaar card pointers (`cardNodeId`, `cardVersionId`) and the masked record summary (§7.2) | **Approve**: owner- and group-scoped in SQL, last 4 only, no new storage path | The backend half of phase 1 (§7.2–§7.3, the API tests) waits. The UI half may still ship: the drawer renders from `members.find(id)` (§4.3), the Aadhaar row shows `p.aadhaarMasked` with no origin/date note, the Documents section shows only the existing empty state with **Scan Aadhaar**, and the "Card not kept" line is suppressed (the client cannot tell kept from not kept). The alternative contract, a nested resolver on PersonType, carries an N+1 risk on `members` |
| D3 | Other member documents ("Attach a document") | **D3a** `documents.member_id` (§5.6), as a **separate follow-up delivery** with its own migration review | No schema, mutation or UI work in this delivery. D3b (link table) and D3c (defer; phase 1 shows the card only) remain the alternatives |
| D5 | Vocabulary: "My Drive" ×3 in PersonDialog → "Documents"; the "Members" tab noun versus design.md's reserved "Member" | Change "My Drive" to "Documents"; keep "Members" here with a scoped exception in design.md § App vocabulary | No PersonDialog copy change and no `design.md` edit in this delivery; the board's marker 8 stays a finding. Alternative: rename the tab to "People" |


## 12. Not verified

- Keyboard focus rings and High Contrast on the current table.
- The members read's loading, empty and failed states (source only).
- The Light scheme.
- The proposed drawer is a schematic, not rendered.
- Contrast and target size.
- Screen-reader output.
- The `fmtLocal` timezone shift, which is inferred from source (the capture ran in one timezone).
- The capture ran against the founder's running dev server on :5173 with the sealed harness. No real data was read.
- PersonDialog's own invalidation after `linkAadhaarCard` when it is opened from the Documents empty state's **Scan Aadhaar** (the drawer relies on the `GROUPS` invalidation refreshing `memberDetail`; check it in functional acceptance).
- Whether `docs/architecture.md` lists the GraphQL root queries (§9 updates it only if it does).
- WebKit parsing of the API's naive audit timestamps in the Activity lines (covered by a new case in AC 5's WebKit run).
- The board's drawer is still a schematic; its Activity rows were corrected to events the API really writes for a member (`add_member`, `invite_member`).
- Tab-in-the-drawer's-kebab ending on the kebab (§4.3 item 1) is inferred from listener order (trap: `document` capture; `Menu`: `window` bubble), not observed; AC 21's sealed case proves it.
- That WebKit actually rejects the space-separated timestamp is not reproduced; the spec removes the risk by fixing the serialization (§7.2) rather than relying on it.

## 13. Revision 2 (self-review) changes

No design review existed, so this pass checked the spec's claims against source and closed these gaps:

- **Wrong-group leak closed.** `memberDetail` now takes `groupId` and filters `fm.group_id` in SQL (§7.2, AC 12), because Groups falls back to the first group when `?g=` is absent or stale. The resolver does not call `ensure_self`, and it drops `aadhaar_enc` from the row explicitly.
- **Timestamps vs dates.** A new §4.6 fixes one formatter per value: `ddmmyyyy` for date-only DOB, `fmtLocal(…, { dateOnly: true })` for UTC instants (card `createdAt`, activity). The earlier text sliced timestamps, which would show the previous day for an evening-IST upload. AC 5 gains a timestamp case under the harness's pinned `Asia/Kolkata`.
- **Size wording** now uses `@pattadar/core` `formatBytes` (the vault's), not `filePhotos.mb`.
- **AC 10 contradiction fixed.** The drawer kebab is `rowActions(m)` less Edit, because Edit is the drawer's outlined button.
- **Focus contract made concrete.** `returnFocus` is a `RefObject` (`Drawer.tsx:192`), so MembersTab keeps one `returnRef`; the re-mount after a yield names the exact control to re-focus (`data-member-edit`, `data-card-open`).
- **Aadhaar accessibility.** The mask is `aria-hidden` with an `.sr-only` "ending 4321", because an `aria-label` on a plain span is not reliably announced. `.tnum` (which does not exist) is replaced by the real `.num` class.
- **Activity scope stated honestly.** Only `add_member`/`invite_member` target a member; keeping a card targets the Aadhaar record and does not appear. `groupActivity` caps at 50 events. Pending and error states for that section are defined.
- **Gateway node read** documented as owner-or-share access decided in SQL, with the exact fields read and the retry rule (no retry on 403/404).
- **Row click** ignores clicks that end a text selection. Long-value wrapping, 24 px targets and 200% zoom are now stated in §4.5.
- **Icons** are clarified: `Icon` map glyphs plus two per-file `@mui/icons-material` deep imports, following existing pages.
- **Board** (`board.html`, re-rendered to `board.png` and `compare.png`): Born and Gender, Father and Spouse are separate rows; size reads "212 KB"; the kebab note reads "the row's actions, less Edit"; Activity shows real member events and "See all in Activity".

At revision 2, all of D1–D9 were open. Revision 3 splits them (§11).

## 14. Revision 3: responses to the design review

All 13 findings in `design-review.md` are addressed. None is backlogged or ignored.

| # | Sev. | Response | Where |
|---|---|---|---|
| 1 | HIGH | **Addressed.** A MembersTab `useLayoutEffect` focuses the origin row's name button (or "Add a person") when `activeElement` is `<body>`, before the `Drawer`'s passive seal records the opener. `returnRef` is now only the removed-row fallback. AC 4 covers all three entry paths, and §10 adds the sealed assertion | §4.3 Focus return, AC 4, §10 |
| 2 | HIGH | **Addressed.** History state carries `memberDepth`; `close()` calls `navigate(-depth)`. Family links push with depth + 1, so Back steps one person while ✕, Esc and the scrim close the whole drawer. New AC 17 | §4.2, §4.3 item 4, AC 17 |
| 3 | HIGH | **Addressed.** §11 is split. **11.1** (D1, D4, D6, D7, D8, D9) proceeds on the recommendation. **11.2** (D2, D3, D5) is blocked until Reddy explicitly approves, with what ships if D2 is refused. "As a follow-up in this feature" is removed from D3, Out of scope matches, and §7.2 states the D2 block | §11, §2 Out of scope, §7.2 |
| 4 | MED | **Addressed (option 1).** The drawer renders and acts on `detail.person`. The table row is only the pending title; `PersonDialog people` stays the table list. The D2-refused fallback uses `members.find(id)` under the same rule | §4.3 "One source of truth", §7.1, §6 |
| 5 | MED | **Addressed.** The `view` derivation is specified, with `useDocument(undefined)` for a file, Loading/Failed only for the `paperId` variant, and `pageCount: 1`. New AC 18 plus a sealed check that no `document` request is sent | §5.3, AC 18, §10 |
| 6 | MED | **Addressed.** `MembersTab` gets an `onShowActivity` prop, wired by `GroupDetail` to `setTab('activity')` plus focus on `#<group>-tab-activity`; the link calls `close({ then })`. New AC 19 | §4.3 item 7, §9, AC 19 |
| 7 | MED | **Addressed.** A pure `memberActions(m)` with ids lives in `groupsData.ts`; handlers are mapped by id, and the drawer filters `id !== 'edit'`. The unit test asserts id lists | F8, §4.3 item 1, AC 10, §9, §10 |
| 8 | MED | **Addressed.** The leak test strips UUIDs, uses the grouped-run regex, and asserts the synthetic `1234 1234 1234` is absent in all three spellings | AC 6, §8, §10 |
| 9 | MED | **Addressed (render).** The Aadhaar `dd` shows "Read from the card · <date>" or "Typed · <date>" from `origin`/`recordedAt` via `fmtLocal`. D4's wording now matches, AC 6 asserts it, and the board shows it | §4.3 item 3, AC 6, D4, board |
| 10 | NIT | **Addressed.** Hiding Open/Download for a trashed card is stated as UX, not security (`content_identity` has no trash filter). Removed from §12 | §5.4, §12 |
| 11 | NIT | **Addressed.** The `.kv dd, .kv .v` wrap rule is unconditional and noted as app-wide. The bio becomes its own `About` paragraph, and the existing <700px left-align is cited | §4.5, §4.3 item 3, §9 |
| 12 | NIT | **Addressed.** An explicit `retry` function; the app default `retry: 1` (`main.tsx:37`) is named | §5.2 |
| 13 | NIT | **Addressed.** `clearSelection()` deletes `m` (AC 20). Back after Remove re-opening the not-found state is documented as intended | §4.2, AC 20 |

The review's unchecked items (PersonDialog invalidation from **Scan Aadhaar**, the `docs/architecture.md` query list, WebKit audit timestamps) are carried into §12 and §10.

The board (`board.html`, re-rendered to `compare.png` and `board.png` and read back) now shows:
- the Aadhaar origin and date note;
- About as its own paragraph;
- the kebab as `memberActions(m)` less edit;
- D2, D3 and D5 marked blocked or "not in this delivery";
- the guardrail that the card half of marker 4 waits for D2;
- the close and Back behaviour at 390.

## 15. Revision 4: responses to the revision-3 design review

All 13 findings are addressed. None is backlogged or ignored. §14 is kept as the record of revision 3.

| # | Sev. | Response | Where |
|---|---|---|---|
| 1 | MED | **Addressed (option a, flagged as D10).** An additive guard in the shared `useFocusTrap` stands aside for non-Tab keys while focus is in a `[role="menu"]` outside the panel. Esc closes only the menu and refocuses the kebab; Tab is still caught by the trap and then by `Menu`, ending on the kebab. Option b (text buttons) is the stated alternative. `Dialog.tsx` is listed, and the whole sealed suite is the regression gate | F8, §4.3 item 1, §8, §9, §10, §11.1 D10, AC 21 |
| 2 | MED | **Addressed.** The layout effect splits closed→shown (origin focus, as before) from a person switch while shown, which hands focus to `.drawerbody` unless a control inside the panel kept it | §4.3 Focus return, §8, AC 22, §10 |
| 3 | MED | **Addressed.** "and the URL effect" is deleted. Open state is derived from `?m=` only; `open()` is called only by user gestures; a deep link closes with `replace` | §4.2, §8, AC 23, §10 |
| 4 | MED | **Addressed.** `recorded_at` is built as `created_at.astimezone(timezone.utc).isoformat()`, never via `to_type`'s `str()`. pytest asserts the `T…+00:00` form, including under an `Asia/Kolkata` session; AC 6 runs in both projects | §7.2, AC 6, §10 |
| 5 | NIT | **Addressed.** Remove success calls `close()` and then focuses "Add a person"; the Back-after-Remove sentence is corrected | §4.2, §4.3 Focus return and yield rule, AC 11 |
| 6 | NIT | **Addressed.** The drawer and the card preview render in MembersTab's final return beside the dialogs, after the Loading/Failed early returns; `addPersonRef` is listed as new | §4.3 "Where it renders", §9 |
| 7 | NIT | **Addressed.** `parcel` is looked up from `q.data.parcels` by `detail.person.parcelId` and passed in; a pure `memberSub` is unit-tested for the named-parcel case because the sealed world returns `parcels: []` | §4.3 Props and `sub`, item 5, §9, §10 |
| 8 | NIT | **Addressed.** `'[data-member-edit]'` after Scan Aadhaar; the selector lives in one MembersTab state reset by `close()` | §4.3 `initialFocus` |
| 9 | NIT | **Addressed.** `masked` dropped from the SELECT (derived from `last4`, fallback `fm.aadhaar_masked`). Size omitted when the kept version is not current | §7.2, §5.2, §10 |
| 10 | NIT | **Addressed.** Fixture phones use `"+91 9876543210"` (joinPhone form), stated in the test | §10 |
| 11 | NIT | **Addressed.** The restored control after the preview is the name button; `initialFocus='[data-card-open]'` then refocuses Open | §4.3 Focus return |
| 12 | NIT | **Addressed.** One paragraph says why the yield is used instead of `Drawer over=` (existing MembersTab Dialog/state; MUI PersonDialog cannot sit in `over`) | §4.3 after the yield rule |
| 13 | NIT | **Addressed (keep date only).** The "same wording" claim is narrowed to action/detail; the date-only choice is stated against the tab's date + time | §4.3 item 7 |

The board (`board.html`, re-rendered to `compare.png` and `board.png`) now also notes that Esc in the drawer's ⋮ closes only the menu, that a kept older version shows no size, and that Activity lines are date only.

Still open for Reddy: D2, D3 and D5 are blocked (§11.2); D1, D4, D6–D10 proceed on the recommendation unless Reddy says otherwise (§11.1).
