# Verification: Inactivity notifications editor follow-up (03/10/2026)

First iteration (no review.json existed). Baseline before editing: `baseline.md` (typecheck and every guard exit 0;
the Combined→Holding rename blocker was NOT present, so nothing was blocked).
Dev server: the user's Vite on http://localhost:5173 (not started or stopped by this task).

## Files changed by this task

- `apps/web/src/w360/pages/Groups.tsx`: NotifierDialog → `NotifierDrawer` in the shared Drawer; SafeguardTab gap chip
  uses `contactGapSentence`; GroupDetail passes `returnFocus`/`onMembers`; `.grouphead` children re-indented.
- `apps/web/src/w360/groupsView.ts` (+ `groupsView.test.ts`): `contactGapSentence`, `isEligibleNotifier`,
  `notifierSaveFailedText`.
- `apps/web/src/w360/groupsData.ts`: `useGroupWrite` takes `what` as string or `(vars) => string` and `reason?: boolean`;
  `useSetNotifiers` uses both (mode wording, no raw server line). Every other write unchanged.
- `apps/web/src/w360/Drawer.tsx`: optional `id` on `DrawerAction` (additive).
- `apps/web/src/w360/w360.css`: `font-size: 0.875rem` on `.w360 .share-paper-picker label` (the other two pickers'
  text is in `strong`/`small` with their own sizes, so they do not change).
- `tests/e2e-app/specs/30-groups.spec.ts`: new `the inactivity notifications editor` describe + rewritten refused-save test.
- `design.md` (one approval line under the Safeguard tab line), `docs/specs/2026-09-19-family-household-management-functional-design.md`
  (§11.2 "settings drawer" + blocked-save bullet; §19 Groups.tsx bullet).

## Commands and results (after the change)

| Check | Result |
|---|---|
| `cd apps/web && bun run typecheck` | exit 0 (no errors at all; no rename errors present) |
| `bun test apps/web/src/w360/groupsView.test.ts` | 10 pass, 0 fail (7 existing + 3 new) |
| every `scripts/*-tests.ts` (a11y-web, aadhaar-digits, area, cache-eviction, contrast-helper, contrast, fence, geo, hooks, lifecycle, palette, plural, provenance, screening, shared-components, typography, url-scheme, village, vocab) | all exit 0 |
| `bun run scripts/icon-guard.ts` / `bun run scripts/ux-guards.ts` | exit 0 / exit 0 |
| sealed `specs/30-groups.spec.ts --project=app --project=phone` | 29 passed (final run, exit 0) |
| sealed `specs/26-one-font.spec.ts --project=app --project=phone` | all passed (run together with 30-groups: 131 passed; the 2 failures in that run were 30-groups tests hit by Vite `504 Outdated Optimize Dep` console errors, dev-server dep re-optimisation; the immediate re-run of 30-groups passed 29/29) |
| sealed `specs/07-record-people.spec.ts` + `specs/08-record-money.spec.ts --project=app` (Drawer.tsx changed) | 26 failed / 189 passed. **Pre-existing**: re-run with this task's two shared edits (DrawerAction `id`, picker font-size) temporarily reverted gave the identical 26 failures (same test list), then the edits were restored. Failures are record-people/money content (e.g. a "Caretakers & staff" segment making `getByRole('button', { name: 'Caretaker' })` ambiguous, missing "bought in three lots" text) and one 08 Escape-focus test; none touch the notifier editor. |

Harness note: the editor reads `notifiers` and `members` in one GraphQL document and the World answers only a
document's first field, so the spec answers `root.notifiers` with the whole body via `World.httpError(200, { data: … })`
(documented in the spec's `notifierSettings` helper). `fixtures/` were not edited; interception stayed sealed.

## Functional acceptance (instrument: sealed tests/e2e-app, Chromium 1512 + iPhone 14 390; API intercepted)

| Operation | Status | Evidence (30-groups.spec.ts) |
|---|---|---|
| Open the editor | worked | `.drawer`, eyebrow "Telukutla Family · Safeguard", sub as accessible description, footer order [Save, Cancel], one `.btn.primary`, checked radio focused; fieldset top border only, legend 13px/700, option 14px/400/none |
| Both modes | worked | configured order opens on "in order", that radio focused, numbered row with Move/Take out; switching to together shows the read-only row with 0 buttons |
| 0-recipient state | worked | Save disabled; `.drawerwhy` "No family member has a verified email yet." and is Save's accessible description; still disabled in "in order"; warn chip text equals the Safeguard tab chip |
| Some-verified state | worked | "1 verified family email will be contacted together." + 1 read-only row; Save enabled, no why; in order empty → "Add at least one verified family email to create an order." and disabled; adding Lakshmi enables Save |
| Members link | worked | drawer closes, Members tab selected, no `tab=` in URL, Members tab focused |
| Successful save (both modes) | worked | together → `{g, ids: []}`, toast "All verified family emails will be contacted together", focus on Configure notifiers; in order → `ids: ['m-wife']`, toast "Notifier order saved" |
| Failed save (both modes) | worked | `World.gqlError('the safeguard store is down')`: alert "Contacting all verified family emails together could not be saved. Nothing has changed." / "That notifier order could not be saved. Nothing has changed."; raw server text count 0; drawer stays; Save focused after each |
| Escape and Cancel | worked | both close without a `setNotifiers` call; focus returns to Configure notifiers |
| Phone 390 | worked | each radio's centre is within its label text's first line box; no sideways scroll |

## Sealed BEFORE | AFTER captures

Temporary `tests/e2e-app/specs/zz-ux-audit-notifier-after.spec.ts` (10 passed, app + phone), then deleted.
Output retained: `.local/ux-audits/2026-10-03-inactivity-notifications-dialog/after/` — `notif-<state>-<app|phone>.png`
and `notif-facts-<state>-<project>.json` for zero-all, zero-selected, some-all, some-selected-empty, some-selected-order,
loading, save-error, focus-kbd-dark, focus-kbd-hc; `before-after.html` → `before-after.png` (1650 × 12552) pairing each
`evidence/notif-*` with its AFTER. Images were read back only through `sips -Z 1800` copies in a scratch folder (deleted).
`git status --short --untracked-files=all tests/ | shasum` before and after: `a1af2fe2…` both times (30-groups.spec.ts
is untracked, so its edited contents do not move this hash; the temp spec is gone).

## Observed, not changed (for the reviewer)

- At 1512 the failure toast sits over the drawer's footer corner, covering most of Save until dismissed
  (`after/notif-save-error-app.png`). The toast stack and drawer placement are shared (Toast.tsx/Drawer.tsx) and
  unchanged here; the spec retries by keyboard for that reason. Moving toasts is a shared, user-visible change → Reddy's call.
- The add-pool predicate (`isEligibleNotifier`) mirrors the server rule because `notifiers` returns only configured
  rows once an order exists; removing it needs a server field (backend contract change, Reddy's call). It never
  produces the gap count or wording.
- DP-1 (`safeguardNeedsAction`) untouched.

## Not verified

Real API / e2e-web360 (not permitted), screen-reader announcement, Light-scheme capture, CI.
