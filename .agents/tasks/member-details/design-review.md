# Design review: member details (revision 4)

Reviewed: `.agents/tasks/member-details/design.md` revision 4 (03/10/2026), against the working tree. Document review only; no builds or tests run. The revision-3 review this file replaces is summarised in the spec's §15.

Verdict: **CHANGES_REQUESTED** (0 HIGH, 4 MEDIUM, 6 NIT).

Revision 4 closes all 13 revision-3 findings, and the checks the prompt asked for hold:

- **Interaction model:** decided (drawer plus `?m=`), argued against RecordPeople's `PersonDrawer`, the Groups `?g=` pattern and the route alternative, and left open to Reddy as D1.
- **Backend:** existing data (§7.1) is kept apart from the new `memberDetail` query (§7.2), and the new query is blocked on D2. Authorization is in SQL (owner and group join). The vault, ciphertext and read-back columns are never selected. A leak test is specified.
- **Viewer reuse:** the shared `PaperPreview`/`useScan` with additive props, no page-local viewer.
- **States:** A11y, empty, loading, error and responsive states are concrete.
- **Reserved decisions:** split into "proceeds" and "blocked".

Four problems remain. Each is a path the source shows would misbehave as written: two in history and close, two in the kebab inside the drawer.

## Findings

### 1. MEDIUM: deep link, then a Family link, then ✕ re-opens the drawer

Where: §4.2 `open`/`close`, AC 17, AC 23.

A deep link `[g&m=A]` has no history state, so its depth is 0. Activating "Father" calls `open('Father', 'link')`, which pushes `[g&m=Father]` with `memberDepth: 0 + 1 = 1`. Then ✕, Esc or the scrim runs `close()`. With `d = 1` that is `navigate(-1)`, which lands on `[g&m=A]`. `m` is still set, so the drawer re-opens on A. A successful Remove of Father on the same path does the same thing, because it uses the same `close()`. AC 17 starts from `[g]` and AC 23 closes straight from the deep link, so neither test catches this case.

Fix: record in the pushed state whether the base entry already had `m`, and strip it once the pop lands.

```ts
type MemberNav = { memberDepth?: number; baseHasM?: boolean };
function open(id: string, from: 'row' | 'link') {
  const s = location.state as MemberNav | null;
  const depth = from === 'link' ? (s?.memberDepth ?? 0) + 1 : 1;
  // A link from a deep-linked entry (depth 0 with m set) lands, on close, on an entry that still has m.
  const baseHasM = from === 'link' ? (s?.baseHasM ?? (!s?.memberDepth && params.has('m'))) : false;
  setParams(withM(params, id), { state: { memberDepth: depth, baseHasM } });
}
const stripOnLand = useRef(false);
function close(opts?: { then?: () => void }) {
  const s = location.state as MemberNav | null;
  const d = s?.memberDepth ?? 0;
  origin.current = null;
  if (d > 0) { stripOnLand.current = !!s?.baseHasM; navigate(-d); }
  else setParams(withoutM(params), { replace: true });
  opts?.then?.();
}
useEffect(() => {                        // runs once the pop has landed
  if (stripOnLand.current && (location.state as MemberNav | null)?.memberDepth == null) {
    stripOnLand.current = false;
    setParams(withoutM(params), { replace: true });
  }
}, [location.key]);
```

Add **AC 24:** load `?g=<g>&m=A`, activate Father, press ✕. The URL has no `m`, the drawer stays closed, and focus is on A's name button. Back does not re-open the drawer. Add the same case to §10's sealed list.

### 2. MEDIUM: Esc on a kebab opened with the mouse still closes the whole drawer

Where: §4.3 item 1 (the chosen guard), F8, AC 21.

The new guard stands aside only when `document.activeElement` is inside a `[role="menu"]` outside the panel. A mouse click opens the menu with `takeFocus.current = false` (`ui.tsx:1008-1011`), so no item takes focus. In Chromium, focus stays on the kebab button, which is **inside** the panel. In WebKit, focus stays wherever it was before the click, often `.drawerbody`, also inside the panel. Either way the guard does not fire. Esc then reaches the capture-phase trap, which calls `tryClose`, so the drawer closes and `m` is dropped. `Menu`'s own window listener closes the menu too. F8 promises "Esc … inside the drawer's kebab closes only the menu", and AC 21 tests only a keyboard-opened menu.

Fix: key the step-aside on "a W360 menu is open", not on where focus is, for every key except Tab:

```ts
const at = document.activeElement;
if (el && at && !el.contains(at) && at.closest('[aria-modal="true"]')) return;
// A menu raised from inside the panel owns Escape and the arrows, however it was opened.
if (e.key !== 'Tab' && document.querySelector('.w360 .menu-list [role="menu"]')) return;
```

This is still a no-op when no menu list is mounted. Extend AC 21 with a mouse variant: click the kebab, press Esc, and the menu is gone while the drawer and `m` remain. Run it in both the Chromium and WebKit projects.

### 3. MEDIUM: Remove success briefly re-mounts the drawer, so where focus ends up is down to timing

Where: §4.2 "After a successful Remove", §4.3 Focus return ("`doRemove` therefore ends … with `close()` and then `requestAnimationFrame(...)`"), AC 11.

`doRemove` sets `setRemoving(null)` (`Groups.tsx:645`). In the usual path the drawer was opened from the row, so `d = 1`, and `close()` is `navigate(-1)`. That is `history.go`, which settles on a later `popstate`, not in the same render. In between, `m` is still set and no dialog state remains, so `drawerShown` is true. The drawer re-mounts for the removed member and shows the cached person, or "not in this group" after the invalidation. Its seal then inerts the page. If the `requestAnimationFrame` fires before the pop lands, `addPersonRef.focus()` does nothing, because the target is inert (the `Drawer.tsx` header comment documents this). Focus then comes from the seal's restore on unmount, so it depends on timing. A drawer opened from the row and closed with ✕ also stays on screen until the pop lands.

Fix: hide the drawer the moment `close()` is called, without waiting for the URL.

```ts
const [closingId, setClosingId] = useState<string | null>(null);
if (closingId && closingId !== memberId) setClosingId(null);       // reset once m has changed
const drawerShown = !!memberId && memberId !== closingId && !form && !removing && !invited && !preview;
function close(opts?) { setClosingId(memberId ?? null); /* …then the history logic of finding 1… */ }
// doRemove, when removing.id === memberId: close(); setRemoving(null); requestAnimationFrame(() => addPersonRef.current?.focus());
```

`close()` and `setRemoving(null)` are then batched in one commit, so the drawer never re-mounts. State the order in §4.3, and make AC 11 assert that `.drawer` is never visible after the confirmation closes (poll for one frame).

### 4. MEDIUM: the portalled menu sits outside the `aria-modal` panel, which VoiceOver can hide

Where: §4.3 item 1, §4.4, D10.

The panel is `role="dialog" aria-modal="true"` (`Drawer.tsx`). `Menu` portals its list to `document.querySelector('.w360')` (`ui.tsx:1050`), which is outside that dialog. Safari/VoiceOver, including iOS where the phone project's users are, honours `aria-modal` by limiting navigation to the dialog's subtree. So the menu items can be unreachable or never announced, even though they hold DOM focus. No W360 drawer has a menu today (the spec says so itself), so nothing in the repo shows this works. §12 lists screen-reader output as unverified, yet D10 recommends the kebab over the text-button option, which carries no such risk.

Fix (pick one, and record it under D10):

- (a) Give `Menu` an optional portal target and use the open panel when there is one: `const host = ref.current?.closest<HTMLElement>('[role="dialog"]') ?? document.querySelector('.w360') ?? document.body`.
  - `.w360 .drawer` has no `transform`, `filter` or `contain` (`w360.css:2463-2475`). A `position: fixed` list therefore still positions against the viewport and is not clipped by `overflow: hidden`. Its `z-index: 60` stacks within the panel.
  - Focus is then inside the panel, so the finding 2 guard (any open menu, non-Tab keys) is what keeps Esc from closing the drawer.
  - Add a manual VoiceOver check (Safari macOS and iOS) to the delivery evidence.
- (b) Take D10's alternative: text buttons from `memberActions(p).filter(a => a.id !== 'edit')`. This needs no `Menu` in the drawer and no change to `useFocusTrap`.

### 5. NIT: a click on the portalled menu's header opens the drawer

Where: §4.1, the `<tr onClick>` guard.

React portals bubble synthetic events through the React tree, so a click anywhere in a row kebab's portalled list reaches the `<tr>` handler. The menu items call `stopPropagation`, but the `.menuhead` header (`ui.tsx:1023`) does not. It also sits outside `[role="menu"]`, so the `closest('button,a,input,[role="menu"]')` check misses it, and clicking the person's name in the open menu opens their drawer. Fix: start the handler with `if (!(e.currentTarget as Node).contains(e.target as Node)) return;`, which ignores every portal-originated click.

### 6. NIT: "a reload has no state" is wrong

Where: §4.2 ("A deep link or reload has no state, so depth is 0 and close replaces").

Browsers keep `history.state` across a reload. A reload on `[g&m=Father]` therefore keeps `memberDepth: 2`, and `navigate(-2)` is still correct, because those entries survive the reload. The behaviour is right but the sentence is not. Change it to "A deep link opened in a new tab or pasted into the address bar has no state…", and note that a reload keeps the entry's depth.

### 7. NIT: `useStorageNode` is placed in the wrong file, and its refusal error is not typed

Where: §9 (the `Dialog.tsx` bullet ends "`useStorageNode` lives here, not in the drawer file, so its key stays next to `GROUPS`"), §5.2 `isRefusal`.

The sentence contradicts the `groupsData.ts` bullet and §5.2. Move it to the `groupsData.ts` bullet. Also, `isRefusal(e)` needs an HTTP status, but the existing storage helpers throw a bare `Error('storage 404')` (`storage.ts:157`). Specify that the query function throws `Object.assign(new Error(`storage ${res.status}`), { status: res.status })`, and that `isRefusal = (e) => (e as { status?: number })?.status === 403 || (e as { status?: number })?.status === 404`.

### 8. NIT: the D2-dependent acceptance criteria are not listed

Where: §2 Acceptance criteria, §11.2 D2.

D2 is blocked, and §11.2 says the UI half may ship without it. It does not say which ACs that half must still meet. Add one line under the ACs:

- **Need D2:** AC 6 (the origin/date note), 7, 13, 18, and the card rows of F9/F10.
- **Change under the D2 fallback:** AC 12 becomes "not in `members`", with the "Card not kept" line suppressed.
- **Unchanged:** every other AC.

### 9. NIT: §12's PersonDialog-invalidation item can be closed

Where: §12 ("PersonDialog's own invalidation after `linkAadhaarCard`…").

From source: `handleAadhaar` saves the card and calls `LINK_AADHAAR_CARD_MUTATION` inside the open dialog (`PersonDialog.tsx:217-276`), before any save. The member's `aadhaar_record_id` is written by the save mutation (`main.py:2549`), and the save's `GROUPS` invalidation (`groupsData.ts:261`) refreshes `memberDetail`. Mark the item verified. Note the existing edge as out of scope: a scan followed by Cancel leaves a kept card in Documents that no member points to.

### 10. NIT: the leak test can trip on the fixture photo

Where: §10 API leak test.

`photo` is in `MEMBER_FIELDS`, so a base64 data URL comes back in `person`. Base64 can contain a 12-digit run. Require `photo: ''` in the fixture, or strip `data:[^"]*` before scanning, along with the UUID strip.

## Verified assumptions

- `useFocusTrap` listens on `document` in the capture phase, and steps aside only when focus is outside the panel and inside `[aria-modal="true"]`. Esc calls `onClose` (`Dialog.tsx:71-94`). Initial focus has deps `[active, initialFocus, ref]`, and a missed selector falls back to the first focusable control (`:57-69`).
- `Menu`:
  - its listeners are `window` bubble-phase (`ui.tsx:989-997`);
  - Esc runs `preventDefault` plus `close(true)`, and Tab runs `close(true)` with no `preventDefault` (`:953, 960`);
  - the list is portalled to `.w360` (`:1018-1050`) with `role="menu"` on an inner div and `.menuhead` outside it (`:1022-1024`);
  - item buttons call `stopPropagation` (`:1043-1044`);
  - `.menu-list` has `z-index: 60` over the drawer's 40 (`w360.css:2714, 2466`).
- `Drawer`:
  - it renders inline, not portalled;
  - `useSealedPage` records `activeElement` at mount, inerts the siblings up the tree, and falls back to `returnFocus` only for a disconnected opener (`Drawer.tsx:84-140`);
  - `.drawerbody` is `tabIndex={-1}`;
  - with no `primary` there is no footer;
  - the `over` slot exists;
  - the panel is `aria-modal="true"`.
- `.w360 .drawer` is `position: fixed`, `min(26rem, 100vw)` and `overflow: hidden`, with no transform (`w360.css:2463-2475`).
- `Groups.tsx`:
  - it is 1,630 lines;
  - `selected` falls back to `list[0]` (`:205-208`), and `select`/`clearSelection` replace, with `clearSelection` deleting only `g` (`:209-225`);
  - `tab` is `useState` in `GroupDetail` (`:365`);
  - `doRemove` and `rowActions` are as described (`:643-686`), and so are the early returns (`:697-702`);
  - "Add a person" has no ref (`:729-735`);
  - `.scroll-x` has no `edgefade`, and the table is `static` (`:747-748`);
  - the ✓ marks and the Born `fmtLocal` call are where the spec says;
  - the final return holds PersonDialog, the Remove `Dialog` and `InviteDialog` (`:866-913`);
  - the Activity tab shows `fmtLocal(e.timestamp)` with the time (`:1188`).
- `fmtLocal` appends `Z` only when there is no offset, and returns `'—'` for empty input (`lib/format.ts:11-23`).
- `ddmmyyyy`, `num`, `plural`, `initialsOf`, `Icon` (`identity`, `paper`, `person`), `StatusChip` (`:454`), `State`, `KV as="dl"`, `Empty` with `action`, `Failed` with `onRetry`, and `Loading` all exist in `ui.tsx`. `drawerEyebrow` is in `Drawer.tsx:48`.
- `PaperPreview` takes `{ paperId, onClose, returnFocus }`, and every branch reads `data` (`PaperPreview.tsx:123-277`). `useScan` fetches `?format=web` and treats 403/404 as `gone`. `fetchFileBlob(fileRef)` takes no version (`storage.ts:154-159`). `isStorageRef` is a UUID test (`storage.ts:13-14`).
- Gateway:
  - `GET /storage/nodes/{id}` authorizes through `svc._access` (owner, share or 404) and returns `{ node, breadcrumb }` with camelCase keys including `trashedAt`, `createdAt`, `sizeBytes` and `currentVersionId` (`routes/storage.py:405-422`, `storage.py:88-106`);
  - `get_node` filters by owner but not by trash (`storage.py:299-309`);
  - `/files/{id}/content?version=` pins through `content_identity` and serves `_CACHE_PINNED` (`routes/storage.py:509-524`).
- API:
  - `members` checks group ownership, calls `ensure_self`, substitutes the self name, and applies `without_token` (`main.py:1987-2008`);
  - `groupActivity` is capped at 50 (`:2010-2030`);
  - `to_type` calls `str()` on datetimes and drops undeclared keys (`:119-129`);
  - `timezone` is imported (`:26`);
  - `linkAadhaarCard` validates canonical UUIDs and audits against the candidate (`:3518-3541`).
- `aadhaar_candidates` has `last4`, `origin`, `created_at TIMESTAMPTZ`, `card_node_id`, `card_version_id`, `vault_token`, `ciphertext`, `name`, `dob`, `gender` and `address` (`aadhaar.py:62-84`). `family_members.aadhaar_record_id` and `aadhaar_enc` exist.
- PersonDialog keeps and links the card inside the dialog, before save (`PersonDialog.tsx:217-276`).
- `MEMBER_FIELDS` and `ParcelOption.surveyNo` exist (`familiesData.ts:141-144, 178-182`). `GROUPS` and its invalidation are at `groupsData.ts:64, 261`.
- The sealed world:
  - supports `AnswerFn(vars)`, `slow`/`never` answers and REST `delayMs`, so AC 22's "held pending" is feasible;
  - records calls through `calls(field)`;
  - routes a `root.<field>` answer only for the first top-level field (`world.ts:50-57, 176-194, 240-285, 395-410`).
- Spec number 29 is free. The shared-components budget for `Groups.tsx` is `{ card: 1, tabs: 1 }` (`shared-components-tests.ts:120`). react-router is 8.3.0, whose `setSearchParams` accepts `{ state, replace }`.

## Unverified or wrong assumptions

- **Wrong:** "a reload has no state". `history.state` survives a reload (finding 6).
- **Wrong:** depth 0 always means `close()` can replace safely. A Family link from a deep link breaks it (finding 1).
- **Wrong:** the menu guard covers "Esc in the drawer's kebab". It misses a mouse-opened menu (finding 2).
- **Wrong:** `close()` followed by a rAF focus is deterministic after Remove. `navigate(-d)` settles asynchronously, and the drawer re-mounts in between (finding 3).
- **Unverified:** that VoiceOver announces menu items portalled outside an `aria-modal` dialog (finding 4).
- **Now verified (was in §12):** that the PersonDialog/`linkAadhaarCard` invalidation refreshes `memberDetail` (finding 9).
- **Still unverified (carried in the spec's §12):** whether `docs/architecture.md` lists root queries; contrast, target size and High Contrast; and WebKit parsing of the naive audit timestamps, which the spec covers with a sealed case.
