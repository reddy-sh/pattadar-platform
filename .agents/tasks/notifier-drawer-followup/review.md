# Inactivity notifications editor moved into the shared Drawer

The centred `Dialog wide` notifier editor in `Groups.tsx` is now `NotifierDrawer`, built on the shared right-side `Drawer` (`apps/web/src/w360/Drawer.tsx`; the brief's `components/Drawer.tsx` path does not exist, and the plan recorded that). All ten approved board items are in. The radio group reuses the `.share-paper-picker` borderless picker. The contact gap comes only from the server's `inactiveContactGaps`, through one `contactGapSentence` used by both the tab and the editor. A disabled Save explains itself through the Drawer's pinned `primaryWhy`. Together mode lists read-only recipient rows. A refused save keeps focus on Save and toasts a mode-specific sentence without the raw server line. The supporting changes are small and additive: an optional `id` on `DrawerAction`, a `what(vars)`/`reason` option on `useGroupWrite`, and 14px picker labels. `safeguardNeedsAction` (DP-1) is unchanged.

Watch for: after a failed save at 1512 the failure toast covers most of Save, the button that just got focus (shared Toast/Drawer placement, flagged by the coder, confirmed in the evidence). The client still mirrors the server's eligibility rule to list who can be added (`isEligibleNotifier`, confirmed). It no longer produces the gap count, but removing it needs a server field. Neither blocks this change.

**Verdict**: APPROVED

## High-level view

The editor now has the record-drawer shape the Properties flows use. The eyebrow is "Telukutla Family · Safeguard", the title stays "Inactivity notifications" so existing locators hold, the old first note became the sub line, and the footer reads Save then Cancel. Save is the only filled amber control. "Open the Members tab" is a `linkbtn`. There is no page-local dialog copy left: `NotifierDialog` and its `unready` filter are gone.

The gap has one source and one sentence. The server's `inactiveContactGaps` counts missing email, unverified email and missing consent, so the shared sentence says "a verified email and safeguard-email consent", which is the server's own phrase. Nothing beyond that is invented. The editor's remaining client predicate only fills the add-select. A doc comment and a unit test hold it to the server rule.

Save is disabled in three cases: settings not loaded, a load error, or a why line. The why line covers 0 eligible recipients in either mode ("No family member has a verified email yet.") and an empty order in ordered mode. It is wired as Save's accessible description. The Members link points the Drawer's `returnFocus` ref at the Members tab button before it closes, so focus lands on that tab and `?tab=` is cleared.

Focus and failure handling sit at the edges. First focus moves from the panel to the checked radio when settings arrive, because the `initialFocus` selector changes. A `failures` counter puts focus back on Save once the mutation stops pending. `useGroupWrite` can now word its toast per variables and drop the reason line. Only `useSetNotifiers` uses that. Every other write behaves as before.

<details>
<summary>Issues (4)</summary>

1. **Toast over the refocused Save (non-blocking, confirmed)**: at 1512 the failure toast covers most of Save, which now holds focus (`after/notif-save-error-app.png`). Keyboard users are fine, but a pointer user cannot see the button. Raise it with Reddy as a shared Toast/Drawer placement change. It does not belong in this diff.
2. **Load error disables Save without a why (non-blocking, confirmed)**: when `q.isError`, Save is disabled and `why` is empty, so the Drawer rule "a disabled primary says why" is not met. The `Failed` block with Retry sits in the body. Consider a why line such as "The current settings could not be loaded." in a later pass.
3. **Client mirror of the eligibility rule (non-blocking, confirmed)**: `isEligibleNotifier` duplicates `main.py`'s notifier rule to list who can be added. It can drift if the server rule changes. Removing it needs a server field (an eligible-candidates list on `notifiers`), which is a backend contract change and Reddy's call.
4. **DP-1 decision note (informational)**: "needs action" stage membership in `safeguardNeedsAction` is unchanged, as required. The wording and stage set remain Reddy's decision.

</details>

<details>
<summary>Details</summary>

### Drawer shape, picker and option text

The picker is `<fieldset className="share-paper-picker">`, which gives a borderless field with a top hairline and a 13px/700 legend. It has no `field` class and no groove. Each option is `<label><input type="radio"/><span>…</span></label>` inside the picker's `1.25rem minmax(0,1fr)` grid, so the radio stays on its label's first line at 390. The phone spec checks that geometry. `.field > label` no longer applies, so the uppercase is gone. The text is sentence case and inherits 400 weight. The one CSS edit adds `font-size: 0.875rem` to `.share-paper-picker label`, and `accent-color: var(--w-accent)` was already on the picker input. The other picker users (`RecordHead.tsx`, `HoldingActions.tsx`) set their own sizes on `strong`/`small`, so the label size change should not move them visually. The coder's claim here is consistent with the CSS, but no capture of those screens was taken. Inline weights are 700 only, there is no `fontFamily`, and no colour literal was added. The notes use `style={{ margin: 0 }}`, the Drawer callers' convention, in place of the three `var(--space-md)` margins, so `.drawerbody`'s grid gap does the spacing.

### Contact gap and the Members link

```
GroupRow.inactiveContactGaps ──► contactGapSentence(n) ──► warn StatusChip  (Safeguard tab)
                                                     └──► warn StatusChip + "Open the Members tab"  (editor)
notifiers.members ──► isEligibleNotifier ──► add-select / together rows   (never counts the gap)
```

Both chips read the same `GroupRow` field. The tab and the editor therefore cannot disagree, even when the row is stale compared with the freshly fetched `notifiers.members`. In that case the editor's chip count and its listed recipients can briefly differ. This is a cache-freshness edge, not a wording drift, so it is not listed as an issue. The Members link appears only when `gaps > 0`. A group with no adult non-self members shows the 0-recipient why line and no link, which matches what the server would count.

### Modes and rows

One local `notifierRow(m, lead?, controls?)` draws both modes. Ordered mode passes the number badge and the ↑/↓/Take out controls. Together mode passes neither: "N verified family emails will be contacted together." followed by bare rows. No number badge appears, because a number would imply an order. When a group has a configured order, rows whose `eligible` is false are still dropped from `current` without notice, as before. This was not introduced here.

### Failed save and focus

`persist` catches the rejection and bumps `failures`. The effect focuses `#saveId` once `!save.isPending`, which handles `DrawerAction` disabling itself while pending. The toast subject comes from `notifierSaveFailedText(memberIds)`. An empty id list (together) reads "Contacting all verified family emails together could not be saved." and an order reads "That notifier order could not be saved.". Both get " Nothing has changed." and `reason: false`, so the raw server text never renders. The spec asserts a count of 0. While the save is pending, `busy` blocks Escape and the scrim. The remaining gap is visual: see issue 1.

### Scope, folded-in items and evidence

The `.grouphead` children are re-indented. The spec comment ("through the button's aria-label", line 75) and the retitled `@phone the Safeguard tab fits a phone…` test (line 134) already existed, as the plan noted. The modified `Properties.tsx`, `routes.tsx` and `Holding*.tsx` files contain no notifier, `primaryWhy` or `DrawerAction id` content, so this task did not touch the rename files. `design.md` gains one approval line, and the functional-design spec now says "settings drawer" and updates its §19 bullet.

Per `verification.md`: typecheck exit 0, `groupsView.test.ts` 10/10, every `scripts/*-tests.ts` guard plus icon/ux guards exit 0, and sealed 30-groups 29/29 and 26-one-font passing on app and phone. Every brief functional-acceptance operation was exercised, including both failed-save modes, Escape/Cancel and the Members link. 07/08 have 26 failures. The coder showed they are pre-existing by reverting this task's two shared edits and getting an identical failure list, so they are not attributed to this diff. BEFORE/AFTER captures are in `after/`. Images were read through `sips -Z 1800` rather than the brief's 2000, a cosmetic deviation. Not verified: real API, screen reader, Light scheme, CI.

</details>

<details>
<summary>File map</summary>

- `apps/web/src/w360/pages/Groups.tsx`: `NotifierDialog` → `NotifierDrawer` (shared Drawer, picker, gap chip + Members link, primaryWhy, read-only together rows, focus handling); SafeguardTab chip via `contactGapSentence`; GroupDetail `returnFocus`/`onMembers`; `.grouphead` re-indent.
- `apps/web/src/w360/groupsView.ts` / `groupsView.test.ts`: `contactGapSentence`, `isEligibleNotifier`, `notifierSaveFailedText` + 3 tests.
- `apps/web/src/w360/groupsData.ts`: `useGroupWrite` `what` as function, `reason` option; `useSetNotifiers` uses both.
- `apps/web/src/w360/Drawer.tsx`: optional `id` on `DrawerAction`.
- `apps/web/src/w360/w360.css`: 14px `.share-paper-picker label`.
- `tests/e2e-app/specs/30-groups.spec.ts`: notifier-editor describe, rewritten refused-save test.
- `design.md`, `docs/specs/2026-09-19-family-household-management-functional-design.md`: editor description.

Full diff: `git diff -- apps/web/src/w360 design.md docs/specs/2026-09-19-family-household-management-functional-design.md` plus the untracked `groupsView*.ts` and `30-groups.spec.ts`.

</details>
