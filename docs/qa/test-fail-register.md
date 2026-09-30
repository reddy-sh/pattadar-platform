# The `test.fail()` register

**Status: inventory, 26/09/2026. Every severity below is a proposal, not an
accepted grade.** No marker in this register has an owner, a ticket or an agreed
priority, and nothing here has been approved by Reddy. Severity is impact and
priority is agreed urgency; this file offers the first and deliberately leaves
the second blank.

What this is: one row per executable `test.fail()` marker in `tests/e2e-app` and
`tests/e2e-web360`, with the test's own sentence, a condensation of what its
comment says the owner is owed, and the cause location the comment names. The
markers are the suites' defect log. Rule 5 of `tests/e2e-app/AUTHORING.md` is
what produced them: a defect found becomes a `test.fail()` naming its cause,
never a softened assertion and never a deleted scenario. Nothing aggregated them
until now, which is why a wrong count could sit in project documentation
unchallenged.

This is a register, not a repair. No marker was removed and no defect was fixed
in the course of writing it.

**Path convention.** Spec files are written relative to `tests/` — `e2e-app/…`
and `e2e-web360/…`. Cause locations are quoted as the marker comments write them,
which is relative to the app source: `w360/…` and `pages/…` resolve under
`apps/web/src/`, and screen files such as `Reader.tsx`, `Shared.tsx`, `Shelf.tsx`,
`Orders.tsx` and `RecordBoundary.tsx` live in `apps/web/src/w360/pages/`.
`documents/storage.ts` is `apps/web/src/pages/documents/storage.ts`. The spec line
numbers were verified; the application lines are the comments' claims and were not.

## How the count was taken

A marker is a line that calls `test.fail(` and is not itself a comment. Several
files discuss `test.fail()` in prose — file headers, notes explaining why a
particular finding was *not* marked — so a raw string count over the specs
returns 144 for `e2e-app` against 118 real markers. Counting raw occurrences is
how the figure of 152 entered the documentation.

Re-derive the totals from the repository root:

```sh
# 127 — every executable marker in both suites
grep -rn 'test\.fail(' tests/e2e-app/specs tests/e2e-web360/specs \
  | grep -vE ':[0-9]+:[[:space:]]*(//|\*|/\*)' | wc -l

# 118 — e2e-app only
grep -rn 'test\.fail(' tests/e2e-app/specs \
  | grep -vE ':[0-9]+:[[:space:]]*(//|\*|/\*)' | wc -l

# 46 bare
grep -rnE '^[[:space:]]*test\.fail\(\);[[:space:]]*$' tests/e2e-app/specs | wc -l

# 68 declaration form
grep -rnE '^[[:space:]]*test\.fail\(' tests/e2e-app/specs \
  | grep -v 'test\.fail();' | wc -l

# 4 conditional inline
grep -rn 'test\.fail(' tests/e2e-app/specs \
  | grep -vE ':[0-9]+:[[:space:]]*(//|\*|/\*)' \
  | grep -vE ':[0-9]+:[[:space:]]*test\.fail\(' | wc -l

# per-file counts, both suites
grep -rn 'test\.fail(' tests/e2e-app/specs tests/e2e-web360/specs \
  | grep -vE ':[0-9]+:[[:space:]]*(//|\*|/\*)' \
  | cut -d: -f1 | sort | uniq -c | sort -rn
```

The exclusion is safe in both directions. No marker in either suite begins with
`//`, `*` or `/*`, and no line puts a real `test.fail(` after a `//` on the same
line — checked with `grep -rnE '[^[:space:]/*].*//.*test\.fail\('`, which matches
nothing.

**Reconciliation.** These commands return 118 across 23 of the 29 `e2e-app` spec
files — 46 bare, 68 declaration, 4 conditional inline, all four conditionals in
`23-resilience.spec.ts` — and 9 in `e2e-web360`, distributed `gap-shell` 3,
`gap-services` 2, and one each in `crud-360`, `gap-maps`, `gap-vault` and
`ux-record-combined`. That agrees with `docs/qa/tester-onboarding.md` exactly.
No discrepancy to report.

**Markers are not the same as failing cases.** The four conditionals sit inside
loops over the 24-row `SCREENS` table in `23-resilience.spec.ts`, so they expand
at run time: 12 rows carry `namesWait: false` (sweep 2, marker at `:371`) and one
row carries `noFailure` (sweeps 3, 4 and 5, markers at `:416`, `:460`, `:496`),
which is 15 expected-failing cases from 4 markers. No declaration-form marker is
loop-generated — none uses a template-literal title. So the 118 `e2e-app`
markers give 129 expected-failing cases in the desktop `app` project.

**Measured 26/09/2026, full run of `e2e-app`:** a run reports **138**
expected-failure cases, not 129. The extra 9 come from the `phone` project, where
a marker on a `@phone`-tagged test runs a second time. `e2e-web360`'s 9 markers
are counted in its own run, not this one. An earlier draft of this paragraph
reached 138 by adding the two suites together. The total was right, but the
arithmetic behind it was not. Quote whichever number answers the question, and
say which.

## Summary by spec file

Forms: **B** bare `test.fail();`, **D** declaration `test.fail('title', async …)`,
**C** conditional inline `if (…) test.fail();`.

| Spec file | Markers | Forms | Product area |
|---|---|---|---|
| `e2e-app/22-account.spec.ts` | 11 | 11 D | Account, consent and erasure |
| `e2e-app/12-reader.spec.ts` | 10 | 10 B | Paper reader and share cards |
| `e2e-app/08-record-money.spec.ts` | 8 | 8 D | Record money, expenses, export |
| `e2e-app/13-services.spec.ts` | 7 | 7 B | Services and requesting work |
| `e2e-app/23-resilience.spec.ts` | 7 | 3 D, 4 C | Waiting and failure across all screens |
| `e2e-app/24-responsive.spec.ts` | 7 | 7 D | Phone layout and tap targets |
| `e2e-app/10-record-photos.spec.ts` | 6 | 6 B | Record photos and provenance |
| `e2e-app/11-vault.spec.ts` | 6 | 6 D | Vault wall and shelves |
| `e2e-app/15-wallet.spec.ts` | 6 | 6 D | Wallet and ledger |
| `e2e-app/18-shared.spec.ts` | 6 | 6 D | Shared kits and recipient doors |
| `e2e-app/19-sections-legacy.spec.ts` | 6 | 6 B | Previous app (legacy sections) |
| `e2e-app/16-maps.spec.ts` | 5 | 5 D | Portfolio map and find |
| `e2e-app/21-routing.spec.ts` | 5 | 5 D | Routing, deep links, 404, boundaries |
| `e2e-app/04-record-shell.spec.ts` | 4 | 4 D | Record 360 shell and header |
| `e2e-app/07-record-people.spec.ts` | 4 | 4 B | Record people and payments |
| `e2e-app/09-record-boundary.spec.ts` | 4 | 4 B | Record boundary and corners |
| `e2e-app/01-shell.spec.ts` | 4 | 4 D | App shell, jump box, assistant |
| `e2e-app/14-ticket.spec.ts` | 3 | 3 D | One job (service detail) |
| `e2e-app/02-dashboard.spec.ts` | 2 | 2 B | Dashboard panels |
| `e2e-app/05-record-papers.spec.ts` | 2 | 2 B | Record papers and filing |
| `e2e-app/06-record-features.spec.ts` | 2 | 2 B | Record features |
| `e2e-app/20-public-auth.spec.ts` | 2 | 2 B | Public doors and sign-in |
| `e2e-app/03-properties.spec.ts` | 1 | 1 B | Properties list and facets |
| `e2e-web360/gap-shell.spec.ts` | 3 | 3 B | Previous app shell, live wiring |
| `e2e-web360/gap-services.spec.ts` | 2 | 2 B | Requesting work, live uploads |
| `e2e-web360/crud-360.spec.ts` | 1 | 1 B | Filing a paper, live storage |
| `e2e-web360/gap-maps.spec.ts` | 1 | 1 B | Boundary, live writes |
| `e2e-web360/gap-vault.spec.ts` | 1 | 1 B | Share links, live rows |
| `e2e-web360/ux-record-combined.spec.ts` | 1 | 1 B | Record tab controls, tap targets |
| **Total** | **127** | 46 B, 68 D, 4 C, plus 9 B in `e2e-web360` | 23 of 29 `e2e-app` files, 6 of 19 `e2e-web360` spec files |

Six `e2e-app` spec files carry no marker: `00-harness`, `12b-paper-preview`,
`17-villages`, `25-live-smoke`, `zz-drawer-shots`, `zz-toast-probe`.

## Proposed severity scale

Proposed, for the owner to accept or change. Reasoning is stated once per cluster
in the next section and not repeated per row.

| Grade | Meaning |
|---|---|
| **S1** | The owner can lose record data irrecoverably, be told something false about their own land records as settled fact, or have work filed twice. |
| **S2** | A write fails silently or a screen states something untrue that the owner would act on, but the record itself is intact and recoverable. |
| **S3** | The owner is blocked, misdirected, or excluded — keyboard, screen reader, tap target, phone overflow, dead control. |
| **S4** | Wording, separator or formatting defect that misleads nobody about a fact. |

## Proposed grouping

### Clusters — one cause, several markers

Fix these as units. Of the 127 markers, 44 sit in these ten clusters, so the
backlog is smaller than the count suggests.

| Cluster | Cause | Markers | Proposed |
|---|---|---|---|
| **Waiting state with no noun** | `Loading` takes a `what` so the waiting word matches the failure word (`ui.tsx:646-652`); these screens pass none | `23-resilience:371` (12 screens), `23-resilience:388`, `23-resilience:900`, `08-record-money:1673`, `10-record-photos:1711`, `11-vault:1273`, `15-wallet:865`, `22-account:361` | S3, and S2 for `23-resilience:388` |
| **Failure drawn as emptiness** | `Orders.tsx:284` drops `error`; `:300` reads an absent array as "nothing has been corrected" | `04-record-shell:1379`, `13-services:953`, `23-resilience:416`, `23-resilience:460`, `23-resilience:496` | **S1** |
| **Dead upload guard** | `uploadToDrive` always throws and never resolves falsy (`storage.ts:50`), so every `if (!node)` branch behind it is unreachable | `13-services:2805`, `10-record-photos:1502`, `14-ticket:2101`, `gap-services:159`, `gap-services:180` | S2, and **S1** for `gap-services:180` |
| **Legacy rail points at the new app** | `AppShell.tsx:75-90` paths all begin `/app/`; `:146-147` therefore matches nothing under `/legacy/` | `19-sections-legacy:488`, `19-sections-legacy:500`, `21-routing:1109`, `gap-shell:125`, `gap-shell:151` | S3 |
| **Redirect discards the query** | `routes.tsx:295-335` hardcode `<Navigate to>` and drop incoming search params | `19-sections-legacy:889`, `19-sections-legacy:901`, `21-routing:852`, `gap-shell:172` | S3 |
| **Tap targets below the floor** | `w360.css:221-231` (`.iconbtn` 32px), `:378-395` and `:540-565` (`.btn`) | `24-responsive:1448`, `24-responsive:1462`, `24-responsive:1476`, `24-responsive:1493`, `ux-record-combined:352` | S3 |
| **Inline grid beats the stylesheet** | Column tracks set as inline style, so the `max-width: 900px` rule cannot win — `Shared.tsx:86-87`, `Reader.tsx:394` | `18-shared:822`, `24-responsive:547`, `24-responsive:606`, `12-reader:1744` | S3 |
| **Lapsed link reads as live** | `Reader.tsx:625` with `_days_until`'s `max(0, …)` (`web360.py:1488`); `Vault.tsx:50-80` parses the date itself and disagrees | `12-reader:1094`, `gap-vault:314` | S2 |
| **Unconfirmed boundary wipe** | `RecordBoundary.tsx:913-919` writes `ring: []` on one click; `web360.py:4298` overwrites with no history row | `09-record-boundary:1282`, `gap-maps:172` | **S1** |
| **Search box dies with the map** | The panel and its only search box are gated on `cards.length > 0` (`Properties.tsx:1034`) | `16-maps:867`, `16-maps:1264` | S3 |

Fourteen markers are second recordings of a cause already held elsewhere. Four of
those pairs cross the two harnesses on purpose — `12-reader:1094`/`gap-vault:314`,
`09-record-boundary:1282`/`gap-maps:172`, `13-services:2805`/`gap-services:159`,
`19-sections-legacy:488`/`gap-shell:151` — because the sealed suite can stage a
state the live suite cannot, and the live suite proves the write the sealed one
cannot. Both copies must be deleted together when the cause is fixed.

### Date rendering and date arithmetic

Grouped explicitly because the repository has one date rule — DD/MM/YYYY
everywhere — and one helper, `ddmmyyyy` at `ui.tsx:128`. Three of these are that
helper not being called; three are the date absent or computed wrongly.

| Marker | Nature | Proposed |
|---|---|---|
| `18-shared:629` | Server date printed raw where every other W360 screen runs it through `ddmmyyyy`; `Vault.tsx:77` writes the same sentence correctly | S2 |
| `08-record-money:820` | Export filename takes the day from UTC, so a sheet saved in the evening in India is named for the day before | S2 |
| `22-account:306` | Recorded choices never say what day they were recorded, though `acceptedAt` is read | S3 |
| `22-account:690` | A deletion request under way never says when it was asked for, though `createdAt` is in the type and in every answer | S3 |
| `12-reader:1094`, `gap-vault:314` | Days-left arithmetic floors at zero, so a link that lapsed reads "expires tomorrow" | S2 |
| `12-reader:1064` | A last-opened date printed unconditionally, including when there is none | S4 |
| `07-record-people:499` | Payment row drops the date and the method the query already asked for | S2 |

The first four are likely one sitting: call the existing helper, pass the field
the query already selects. The arithmetic pair needs a decision about where the
clamp belongs — client or `_days_until` — and should be taken with the sharing
owner, because the sentence is about a live access credential.

### Accessibility naming and non-text cues

Grouped explicitly for the same reason: several are one convention applied in one
more place.

| Marker | Nature | Proposed |
|---|---|---|
| `07-record-people:520` | Payment direction lives only in an `aria-hidden` glyph and a colour; the module already settled this at `w360/ui.tsx:766-769` | S3 |
| `23-resilience:388` | The Title shelf has no live region at all (`Shelf.tsx:109`), so a screen reader is told nothing while a shelf loads | S2 |
| Waiting-state cluster above | `Loading` with no `what`: announced as "Loading…" over somebody's land records | S3 |
| `10-record-photos:396` | A refused thumbnail nests a button inside a button | S3 |
| `24-responsive:383` | The phone drawer is modal in every respect except keeping focus; `useFocusTrap` already exists at `Dialog.tsx:50` | S3 |
| `09-record-boundary:410` | Tab out of a boundary row loses the keyboard, because a re-created `html` prop re-parents the node | S3 |
| `16-maps:643` | Taking a pin with the keyboard drops focus, because raising a path re-parents it | S3 |
| `15-wallet:762` | The reason the button is off lives in a `title` attribute, which only a hovering mouse ever sees | S3 |
| `19-sections-legacy:488`, `gap-shell:151` | Nothing in a twelve-item menu is marked current, by text or by `aria-current` | S3 |
| Tap-target cluster above | 32px and ~36px controls below the 40px floor the suite sets and the 44pt the iOS client honours | S3 |

None of this is a WCAG conformance statement. Full validation needs manual
assistive-technology testing and expert review.

### By defect class

| Class | Markers |
|---|---|
| Outage drawn as an answer about the owner's records | `04-record-shell:1379`, `13-services:685`, `13-services:953`, `13-services:2746`, `23-resilience:416`, `23-resilience:460`, `23-resilience:496`, `gap-shell` stub sweep context |
| Silent write failure — refusal read as success | `07-record-people:917`, `09-record-boundary:654`, `09-record-boundary:953`, `10-record-photos:1502`, `12-reader:1419`, `12-reader:1620`, `13-services:2805`, `14-ticket:2101`, `23-resilience:773`, `crud-360:999` |
| Wrong data shown or a false claim | `02-dashboard:454`, `02-dashboard:487`, `03-properties:642`, `04-record-shell:342`, `05-record-papers:1026`, `06-record-features:297`, `08-record-money:840`, `08-record-money:1142`, `10-record-photos:1787`, `10-record-photos:1810`, `14-ticket:2524`, `15-wallet:407`, `18-shared:371`, `19-sections-legacy:1605`, `22-account:324`, `22-account:461` |
| Unguarded destructive action or non-idempotent retry | `09-record-boundary:1282`, `13-services:2787`, `22-account:704`, `gap-maps:172`, `gap-services:180` |
| Navigation and deep links | `01-shell:753`, `16-maps:723`, `19-sections-legacy:500`, `19-sections-legacy:889`, `19-sections-legacy:901`, `21-routing:852`, `21-routing:935`, `21-routing:1109`, `21-routing:1215`, `gap-shell:125`, `gap-shell:172` |
| Date formatting and arithmetic | see the date section above |
| Accessibility naming and non-text cues | see the accessibility section above |
| Phone layout and tap targets | `12-reader:1744`, `18-shared:822`, `24-responsive:383`, `24-responsive:547`, `24-responsive:606`, `24-responsive:1448`, `24-responsive:1462`, `24-responsive:1476`, `24-responsive:1493`, `ux-record-combined:352` |
| Dead or missing control | `01-shell:1169`, `04-record-shell:728`, `08-record-money:1656`, `11-vault:540`, `15-wallet:667`, `19-sections-legacy:889`, `22-account:949`, `24-responsive` tap targets |
| Missing empty state | `11-vault:227`, `15-wallet:805`, `19-sections-legacy:616` |
| Copy, separator and plural hygiene | `11-vault:1290`, `12-reader:1050`, `12-reader:1064`, `15-wallet:649`, `18-shared:393`, `18-shared:499`, `18-shared:642`, `22-account:676` |

### Highest-severity clusters

Four, in the order I would put them to the owner.

1. **Failure drawn as emptiness on the audit trail** — 5 markers, one cause at
   `Orders.tsx:284,300`. A refused read tells an owner their record has never
   been corrected, on the one tab whose stated promise is that nothing is ever
   removed from it, and with no Try again to disprove it. Proposed **S1**: the
   screen makes a settled-fact claim about a land record's history that is the
   opposite of the truth.
2. **Unconfirmed boundary wipe** — 2 markers, one cause at
   `RecordBoundary.tsx:913-919`. One click writes an empty ring; the server
   overwrites the column with no history row, so surveyed corners are
   unrecoverable. Proposed **S1**: irreversible loss of the most expensive data
   on a record, and the app already asks twice before deleting a photo.
3. **Work filed twice after a failed upload** — 2 markers,
   `13-services:2787` and `gap-services:180`, rooted in the dead upload guard.
   The first leaves the owner to retry blind and file the job a second time; the
   second re-uploads bytes already filed, and `add_paper` has no dedupe.
   Proposed **S1**: duplicate orders spend money and duplicate papers pollute the
   record, with no undo on either.
4. **A verdict nobody recognises drawn as confirmed** — `18-shared:371`, at
   `Shared.tsx:253`, where the fallback for an unknown verdict is the confirmed
   tick. The audience is a buyer, a bank or a surveyor reading somebody else's
   papers through a share door. Proposed **S1**: the one default a screen about
   what nobody has confirmed must never take.

## The register

### `e2e-app/01-shell.spec.ts` — app shell, jump box, assistant

| Line | Form | The test's sentence | What the owner is owed | Cause named | Sev |
|---|---|---|---|---|---|
| 753 | D | Enter never opens a record that does not match the words in the box | Stale hits cleared, or held back from Enter, while the words under them have changed | `Shell.tsx:277`, `:327`, `:234`; `api.ts:573` | S2 |
| 932 | D | the shortcut the jump box advertises is one this keyboard has | The shortcut their own machine uses, or no hint at all — most of this audience has no ⌘ key | `Shell.tsx:268` vs `:138` | S3 |
| 1159 | D | the question I typed survives the assistant being unreachable | Their own words back, in the box or on screen above the notice | `AssistantPanel.tsx:193-196`, `:138` | S2 |
| 1169 | D | the assistant can be tried again after it has failed once | A way to ask again once the line is back up; one failed send currently kills the panel for the session | `AssistantPanel.tsx:112`, `:194`, `:323` | S3 |

### `e2e-app/02-dashboard.spec.ts` — dashboard panels

| Line | Form | The test's sentence | What the owner is owed | Cause named | Sev |
|---|---|---|---|---|---|
| 454 | B | a village worth nothing is not "where the value sits" | Bars worth nothing are not bars; fall through to the sentence the panel already has | `Dashboard.tsx:309`, `:320`; `web360.py:2414-2419` | S2 |
| 487 | B | a portfolio nobody has priced is not told it was free | No purchase price on file says so — a dash, never a rupee figure nobody entered, which makes market value read as pure gain | `Dashboard.tsx:329`; `web360.py:2408`; helper at `ui.tsx:90-98` | S2 |

### `e2e-app/03-properties.spec.ts` — properties list and facets

| Line | Form | The test's sentence | What the owner is owed | Cause named | Sev |
|---|---|---|---|---|---|
| 642 | B | a facet counts what clicking it will actually show, search and all | Send `q` with the server query like everything else that narrows the list; the popover currently promises records a click cannot produce | `Properties.tsx:384-390`, `:415`, `:480-489`; invariant at `:5-7` | S2 |

### `e2e-app/04-record-shell.spec.ts` — record 360 shell and header

| Line | Form | The test's sentence | What the owner is owed | Cause named | Sev |
|---|---|---|---|---|---|
| 342 | D | a record nobody has measured says so instead of printing 0.00 ac | "Not measured" in words, the way the three unknowns beside it already read | `RecordPapers.tsx:456-461`; `PropertyActions.tsx:384` | S2 |
| 402 | D | the tags on a record are shown on the record they describe | The record's tags beside its status capsules, as the same chips the paper rows use | `RecordPapers.tsx:227-271`, `:348`; `w360/api.ts:320` | S3 |
| 728 | D | an archived record offers the way back rather than a second archiving | "Unarchive this record" on an archived record; there is currently no way back from the screen it lands on | `RecordPapers.tsx:253-269`, `:267`, `:427` | S3 |
| 1379 | D | an audit trail that did not load says so, rather than that nothing was ever corrected | The failure said out loud with its reason and a way to ask again, as the component above it already does | `Orders.tsx:284`, `:300`; precedent `:274` | **S1** |

### `e2e-app/05-record-papers.spec.ts` — record papers and filing

| Line | Form | The test's sentence | What the owner is owed | Cause named | Sev |
|---|---|---|---|---|---|
| 339 | B | unfiling the last paper on a shelf leaves the filter stranded on a shelf that is gone | When the shelf a filter names leaves the wall, let the filter go; the remaining papers are otherwise unreachable without a reload | `RecordPapers.tsx:210`, `:213-217` | S2 |
| 1026 | B | a scan the reader answered for but could not name is filed as "Other" | Treat the classifier's `other` as no label and file under the file's own name, as the unread path already does | `paperFiling.ts:55-67`, remedy at `paperFiling.ts:32-35`; `docTypes.ts:75-82`; `documents/upload.ts:123-142` | S2 |

### `e2e-app/06-record-features.spec.ts` — record features

| Line | Form | The test's sentence | What the owner is owed | Cause named | Sev |
|---|---|---|---|---|---|
| 297 | B | a name with no date behind it is not hung off the repair count | The photographer named separately or not at all; a name welded to the repair count reads as the thing needing repair | `RecordFeatures.tsx:291-292`; `web360.py:2944-2946` | S3 |
| 1706 | B | an empty hanger stops claiming an order it has no cards to keep | The ordering footnote drawn only where there are cards for it to describe, not over the skeleton or the error panel | `RecordFeatures.tsx:381-399`; precedent `:645` | S4 |

### `e2e-app/07-record-people.spec.ts` — record people and payments

| Line | Form | The test's sentence | What the owner is owed | Cause named | Sev |
|---|---|---|---|---|---|
| 288 | B | somebody remembered from a closed job says what they did here | The compact row gets the role fallback the card branch already has; the role is stored, selected, then dropped for every row the list exists to hold | `RecordPeople.tsx:366-377`, card at `:272`; `web360.py:2359-2388`; `w360/api.ts:335` | S3 |
| 499 | B | a payment says how the money moved and when | The method and the date on the row, or those two fields dropped from the query — cash and UPI are currently the same row | `RecordPeople.tsx:478-498`; `w360/api.ts:338`; `web360.py:2967-2968` | S2 |
| 520 | B | a payment row says which way the money went to somebody who cannot see the arrow | The direction in the accessibility tree — a word in the row or a label on the glyph; colour is the only other cue and it is a red-green pair | `RecordPeople.tsx:481-487`; precedent `w360/ui.tsx:766-769` | S3 |
| 917 | B | a rename that cannot be sent says why it could not be sent | The server's reason in the toast, which already takes it; the same bare `catch` sits on the add and the removal | `RecordPeople.tsx:122-123`, also `:90`, `:141`; `w360/Toast.tsx:51`, `:122` | S2 |

### `e2e-app/08-record-money.spec.ts` — record money, expenses, export

| Line | Form | The test's sentence | What the owner is owed | Cause named | Sev |
|---|---|---|---|---|---|
| 820 | D | the cost sheet is named for the day I saved it, not for yesterday in London | The financial year and the day taken from the owner's own clock on the file they keep | `RecordMoney.tsx:177` | S2 |
| 840 | D | a registration with no price on it does not make the page deny the purchase exists | The gain sentence suppressed rather than a purchase denied; one flag currently covers two different unknowns | `RecordMoney.tsx:113`; `web360.py:3233` | S2 |
| 863 | D | a loss is exported as a number the spreadsheet can add up | The formula guard applied to text cells only — a number has nowhere to hide an injection | `RecordMoney.tsx:156`; `RecordExpenses.tsx:359` | S3 |
| 1142 | D | a let flat still says what the tenant owes back | The owed-back cell in both shapes of the strip, under the guard the other shape already has | `RecordExpenses.tsx:423`, `:437`; `web360.py:3278` | S2 |
| 1644 | D | a row I can claim back says what is owed and to whom | The row's own note, so the figure in the strip has visible working | `RecordExpenses.tsx:494` | S3 |
| 1656 | D | a mistyped row can be taken out of the ledger again | A row menu with Delete on it; the resolver and the mutation hook both exist already | `web360.py` resolver; `w360/api.ts:791` | S3 |
| 1673 | D | the wait names the thing it is waiting for, the way the failure does | A `what` on `Loading`, so the waiting word matches the failure word beside it | `RecordExpenses.tsx:334`; `RecordMoney.tsx:83`; contract at `ui.tsx:646-652` | S3 |
| 1690 | D | the year I chose stays chosen while that year is loading | The select showing what was chosen while the new year loads, as the same file does for its own rate | `RecordExpenses.tsx:396`; `w360/api.ts:504`; `ui.tsx:425`; precedent `RecordMoney.tsx:379` | S3 |

### `e2e-app/09-record-boundary.spec.ts` — record boundary and corners

| Line | Form | The test's sentence | What the owner is owed | Cause named | Sev |
|---|---|---|---|---|---|
| 410 | B | a side pinned from the keyboard leaves the keyboard inside the tip | A stable `html` prop — hold it in a memo — so focus is not re-parented out of the row | `RecordBoundary.tsx:303-310`, `:721-727`, `:1204`; `MapCanvas.tsx:1486` | S3 |
| 654 | B | accepting a moved position tells the owner it worked | The mutation's real field read back, rather than a key that is never in the answer | `w360/api.ts:855` vs `RecordBoundary.tsx:164` | S2 |
| 953 | B | a refused "mark every corner" says so, instead of doing nothing in silence | The returned count read the way every other write on the screen reads its answer | `RecordBoundary.tsx:1329-1332`; `web360.py:4467` | S2 |
| 1282 | B | removing a saved boundary asks a second time before it wipes it | A second deliberate confirmation, using the dialog the module already has | `RecordBoundary.tsx:913-919`; file's own promise at `:1-6` | **S1** |

### `e2e-app/10-record-photos.spec.ts` — record photos and provenance

| Line | Form | The test's sentence | What the owner is owed | Cause named | Sev |
|---|---|---|---|---|---|
| 396 | B | a thumbnail that could not be read stays one button, not a button inside a button | The failed thumb rendered as a mark rather than a nested control | `RecordPhotos.tsx:532-537`; `ui.tsx:264-276`, nested button at `:273` | S3 |
| 1502 | B | an upload the storage refuses tells the owner what happened to their file | The same red line the rest of the app gives, instead of an unhandled rejection in the console | `filePhotos.ts:77-80`; `storage.ts:58-65`; `RecordPhotos.tsx:404` | S2 |
| 1588 | B | a photo whose fileRef is a legacy file name offers a Download that can never work | The control saying why it cannot work, the treatment the neighbouring branch already gives | `RecordPhotos.tsx:722-723`, precedent `:765`; `storage.ts:13` | S3 |
| 1711 | B | the wait says which of this screen's things has not arrived | A `what` on `Loading`, matching the failure noun the same screen already uses | `RecordPhotos.tsx:251`, `:252`; contract at `ui.tsx:646-647` | S3 |
| 1787 | B | the checklist does not print half a sentence about facts the row does not carry | The line drawn only where the row carries the fact — this is the one panel whose whole job is to be believed | `RecordPhotos.tsx:55`, `:57` | S2 |
| 1810 | B | the checklist does not tick a box the row says is false | A line the row cannot support is not drawn, or is not drawn as satisfied | `RecordPhotos.tsx:52-58`, `:106-113` | S2 |

### `e2e-app/11-vault.spec.ts` — vault wall and shelves

| Line | Form | The test's sentence | What the owner is owed | Cause named | Sev |
|---|---|---|---|---|---|
| 227 | D | a vault with nothing in it says one thing instead of drawing the whole wall | An empty state naming the one thing to do, rather than a full wall of chrome | `Vault.tsx:422-570` | S3 |
| 516 | D | the share log says how many papers went out and whether they were opened | The counts the row already carries — documents out, opens, last opened — drawn on the row | `Vault.tsx:121-140`, `:147`; `w360/api.ts:375` | S3 |
| 540 | D | a link that lapses tomorrow can be given more days | A way to add days back, now that the server supports it; the client hook needs the matching fix | `Vault.tsx:86-96`; `web360.py:4522-4536`; `w360/api.ts:871-875` | S2 |
| 850 | D | the picker writes an extent the way the rest of the app writes it | The same figure in the same shape wherever it appears, through the shared formatter | `Vault.tsx:218` | S4 |
| 1273 | D | a shelf that is still loading says so instead of going quiet | A waiting announcement, using the live-region skeleton written for exactly this shape | `Shelf.tsx:109`; `skeletons.tsx` `Busy` | S3 |
| 1290 | D | an empty Identity shelf says a sentence that parses | A sentence that parses for every shelf, not only the ones whose noun happens to fit | `Shelf.tsx:120` | S4 |

### `e2e-app/12-reader.spec.ts` — paper reader and share cards

| Line | Form | The test's sentence | What the owner is owed | Cause named | Sev |
|---|---|---|---|---|---|
| 372 | B | a reading that found nothing to summarise still says out loud where it was unsure | The doubts drawn even with no summary; the whole card currently hangs off the summary | `Reader.tsx:550` | S2 |
| 387 | B | Go to it must not send the owner to page 20 of a fourteen-page deed | A page the deed actually has — both paging arrows already clamp | `Reader.tsx:572`, clamps at `:511`, `:516`, screen's own claim at `:504` | S3 |
| 867 | B | bytes the file store will not name do not land in Downloads as a file nothing opens | The row's real extension or no extension at all, never a made-up one | `Reader.tsx:84` | S3 |
| 1050 | B | a link the buyer has opened once has not been opened "1 times" | The shared plural helper the rest of the module uses | `Reader.tsx:621`; helper at `ui.tsx:141`; precedent `Vault.tsx:80` | S4 |
| 1064 | B | a link nobody has opened yet does not claim a last time it was opened | The last-opened line only when there is one | `Reader.tsx:624` | S4 |
| 1094 | B | the Reader must not tell the owner a link that lapsed last month expires tomorrow | The truth about a live access credential; the vault screen parses the date itself and contradicts this one about the same row | `Reader.tsx:625`; `web360.py:1488`; `Vault.tsx:72-80` | S2 |
| 1389 | B | every shelf the vault has can be reached from the Reader | All the shelves the wall has, so a scan cannot leave one and never go back | `Reader.tsx:42` vs `ui.tsx:369` | S3 |
| 1419 | B | a rename the server declines does not close as though it saved | The refusal read from the returned Boolean, not only from a thrown error; the share path in the same file already checks | `Reader.tsx:288`, precedent `:267`; `web360.py:4915` | S2 |
| 1620 | B | a deletion the server declines does not walk the owner away as though it worked | The same check on the returned Boolean before navigating away | `Reader.tsx` `remove()`; `web360.py:5051` | S2 |
| 1744 | B | the Reader fits a phone instead of running off the side of it | A phone reader that is the scan, with the strip and inspector behind controls | `Reader.tsx:394`; only media query is print at `:60-70` | S3 |

### `e2e-app/13-services.spec.ts` — services and requesting work

| Line | Form | The test's sentence | What the owner is owed | Cause named | Sev |
|---|---|---|---|---|---|
| 685 | B | names that could not be read say so, instead of a picker with nobody in it | An outage said out loud, kept distinct from the account that genuinely has no names | `Orders.tsx:61` | S2 |
| 953 | B | an audit read that failed is not reported as nothing to report | The `Failed` branch every other list in the file has | `Orders.tsx:284` | **S1** |
| 2746 | B | a shelf whose papers could not be read says so, not that nothing is filed | A shelf that says it could not be read, so the owner knows not to re-file | `RequestWork.tsx:88`; same mistake at `Orders.tsx:284`, `OrderService.tsx:517` | S2 |
| 2766 | B | every photo on the record can be sent, not only the first twelve | Every ticked photo sent, or a visible statement that some were held back; the same cut was already fixed once | `RequestWork.tsx:347`; precedent `OrderService.tsx:520-527` | S2 |
| 2787 | B | a request that died on the way back sends the owner to look under Services before retrying | The failure branch's own words, so a blind retry does not file the job twice | `RequestWork.tsx:205` | **S1** |
| 2805 | B | an upload that died tells the owner no request was raised | The same closing words the oversize branch uses — the dead guard never runs | `RequestWork.tsx:168`; `documents/storage.ts:50-79` | S2 |
| 2826 | B | a link naming a kind nothing sells does not file a job of that kind | The kind snapped to one the catalogue actually sells | `RequestWork.tsx:82` | S3 |

### `e2e-app/14-ticket.spec.ts` — one job (service detail)

| Line | Form | The test's sentence | What the owner is owed | Cause named | Sev |
|---|---|---|---|---|---|
| 1211 | D | a job that is done does not offer to change my mind about what came back | No button at all — the server refuses the review outright, so the control promises something impossible | `web360.py:5258` | S3 |
| 2101 | D | a storage outage says the file could not be uploaded, not that I typed it wrong | The storage sentence the rest of the app gives; the intended branch is unreachable because the upload throws | `Ticket.tsx:564-565`, `:581`; `storage.ts:50` | S2 |
| 2524 | D | a job with money held against it is never told nothing is set aside | Either the paragraph suppressed or the truth stated; it currently asserts something certainly untrue of that job | `Ticket.tsx:1267-1273` | S2 |

### `e2e-app/15-wallet.spec.ts` — wallet and ledger

| Line | Form | The test's sentence | What the owner is owed | Cause named | Sev |
|---|---|---|---|---|---|
| 407 | D | the wallet never says money is set aside and, an inch below, that none is | When the total exceeds what the listed jobs account for, the screen reconciles rather than contradicting itself — the two figures come from two different reads | `Wallet.tsx:60-61`, `:78-82`; `web360.py:3590-3591`, `:3603-3617`, `:3626`; deliberate divergence at `:4118-4123`, `:4130` | S2 |
| 649 | D | a movement with no note of its own does not open its line with a stray separator | A line joined from the parts that exist; the card above it already does this | `Wallet.tsx:127-129`, precedent `:93-95`; `web360.py:2036`, `:3612-3617` | S4 |
| 667 | D | a movement that names a job lets me open that job | The reference as a link to the job, using the id the row already carries and currently uses for nothing | `Wallet.tsx:129`, `:88`; `w360/api.ts:610` | S3 |
| 762 | D | the wallet says out loud why money cannot be added, not only to a mouse that hovers | The sentence on the screen under the button, not in a `title` attribute | `Wallet.tsx:68-71` | S3 |
| 805 | D | a wallet with nothing in it says one thing, instead of drawing the whole screen around four zeroes | One thing said once, through the empty state the module already has | `Wallet.tsx:31-158`; `ui.tsx:669` | S3 |
| 865 | D | a wallet that is still loading names what it is waiting for | A `what` matching the noun the same screen gives its failure | `Wallet.tsx:40`, `:41`; contract at `ui.tsx:646-647` | S3 |

### `e2e-app/16-maps.spec.ts` — portfolio map and find

| Line | Form | The test's sentence | What the owner is owed | Cause named | Sev |
|---|---|---|---|---|---|
| 519 | D | the list beside the map scrolls to the record I picked out on the map | The selection scrolled into view, the idiom this codebase already uses twice | `Properties.tsx:1127`; precedents `Reader.tsx:174`, `RecordPhotos.tsx:214` | S3 |
| 643 | D | the pin I have just taken with the keyboard still has my hand on it | Focus restored after the raise, or a raise that paints rather than re-parents; clicking has no such problem | `PortfolioCanvas.tsx:354`, `:336`; precedent `Properties.tsx:624` | S3 |
| 723 | D | the record I picked is still picked when the map comes back | The picked record in the URL, so a reload does not lose it on the screen whose whole job is finding one | `Properties.tsx:362` | S3 |
| 867 | D | a search that found nothing leaves the box I typed it into, so I can fix the typo | A search box that survives an empty result | `Properties.tsx:1034` | S3 |
| 1264 | D | the phone keeps the search box over an empty result @phone | The same, at 390px, where the box is the whole screen — recorded twice by design | `Properties.tsx:1034` | S3 |

### `e2e-app/18-shared.spec.ts` — shared kits and recipient doors

| Line | Form | The test's sentence | What the owner is owed | Cause named | Sev |
|---|---|---|---|---|---|
| 371 | D | a verdict the app has never heard of is not drawn as confirmed | The cautious fallback, not the confirmed tick; the column is free text with no constraint and the resolver passes it through | `Shared.tsx:253`; `web360.py:243`, `:3735` | **S1** |
| 393 | D | a paper nobody had anything to say about is filed under its shelf and nothing else | The separator only when there is a note; the column defaults to empty | `Shared.tsx:265`; `web360.py:245`, `:3734` | S4 |
| 499 | D | a kit with four things to check reads the same way as a kit with two | One form of the count everywhere; the spelled-out "four" is a demo artefact in product copy | `Shared.tsx:310`, `:343`; `web360.py:250` | S4 |
| 629 | D | a kit prints its dates the way the rest of the app prints dates | One date format across the product, through the shared helper; the vault writes this same sentence correctly | `Shared.tsx:119`, `:180`; helper at `ui.tsx:128`, `:129-132`; precedent `Vault.tsx:77` | S2 |
| 642 | D | a kit that lapsed without a note does not trail an empty dash | The separator only when the note exists; most senders write none | `Shared.tsx:119`; `web360.py:224` | S4 |
| 822 | D | the shared inbox stacks on a phone instead of squeezing the kit into a strip @phone | The one-column inbox every other W360 screen gives below the breakpoint; the width belongs in the stylesheet | `Shared.tsx:87`; unreachable rule at `w360.css:847` | S3 |

### `e2e-app/19-sections-legacy.spec.ts` — previous app (legacy sections)

| Line | Form | The test's sentence | What the owner is owed | Cause named | Sev |
|---|---|---|---|---|---|
| 488 | B | the previous app never marks the screen I am standing on | The item they are looking at, lit | `AppShell.tsx:75-90`, `:146-147` | S3 |
| 500 | B | one tap on the previous app menu should stay inside the previous app | A menu that navigates the app it is drawn inside; one tap currently throws them out into a screen they did not ask for | `AppShell.tsx:75-90`; `routes.tsx` redirect | S3 |
| 616 | B | an empty vault should say it is empty | The same empty sentence every other shelf gives | `documents/DocumentsTab.tsx:912` | S3 |
| 889 | B | View holdings on a group card should open that group holdings | The group carried through to the destination, which can already read it — the link just never reaches it | `FamiliesGroupsPage.tsx:183`; `LandPropertiesPage.tsx:225-227` | S3 |
| 901 | B | View holdings in the group detail should open that group holdings | The same, through the second door | `GroupDetail.tsx:157` | S3 |
| ~~1605~~ | B | ~~a stamp duty tool with no fee schedule should not claim to be using one~~ | **Fixed 26/09/2026, marker removed.** Tools was redrawn at `/app/tools` (`w360/pages/Tools.tsx`) and the legacy `pages/tools/*` deleted; with no schedule the tool now says "The AP fee schedule did not load" and offers a retry. Now a passing test, "a stamp duty tool with no fee schedule says it cannot run, rather than claim one". Totals in this register are the inventory as taken and were not recounted. | ~~`tools/StampDutyTool.tsx:146-150`~~ | — |

### `e2e-app/20-public-auth.spec.ts` — public doors and sign-in

| Line | Form | The test's sentence | What the owner is owed | Cause named | Sev |
|---|---|---|---|---|---|
| 700 | B | a pool that cannot be reached is explained, not quoted | A written sentence like every other branch in that switch, not the library's literal string | `auth/cognitoNative.ts:91` | S3 |
| 883 | B | a callback explains itself in words a customer wrote, not the ones a library did | One plain sentence, the treatment the sign-in path already gives, with the raw text kept out of the owner's way | `auth/AuthCallbackPage.tsx:30`; precedent `cognitoNative.ts:51` | S3 |

### `e2e-app/21-routing.spec.ts` — routing, deep links, 404, error boundaries

| Line | Form | The test's sentence | What the owner is owed | Cause named | Sev |
|---|---|---|---|---|---|
| 852 | D | an old link that carried a filter arrives with the filter still on it | The search params preserved through the redirect, as the neighbouring route already does four lines away | `routes.tsx:295`, `:298`, `:300`, `:302`, `:330-335`; precedent `MapFind.tsx:5-8`; documented deep link at `LandPropertiesPage.tsx:9-11` | S3 |
| 935 | D | the way back off a 404 is drawn as a button wherever the 404 happens | One presentation of the not-found page everywhere | `routes.tsx:217-229` | S4 |
| 1109 | D | the previous app's own menu can get me around the previous app | A menu that navigates the app it is drawn inside | `layout/AppShell.tsx:79-90`, `:147` | S3 |
| 1141 | D | the previous app's Profile waits for the profile instead of spinning while it waits | A stable identity object for the effect that seeds the form, so the screen does not burn the main thread and log errors while it waits | `data/useLiveOrSample.ts:57`; profile page `:69-77` | S3 |
| 1215 | D | the rest of the app still works around the screen that could not load | A boundary contained to the screen, which is what the file's own comment says it is for; one dead chunk currently poisons every screen until a reload | `routes.tsx:151-159`, intent at `:142-150` | S2 |

### `e2e-app/22-account.spec.ts` — account, consent and erasure

The file numbers its own defects 1 to 11; those numbers are kept here so the two
can be read side by side. Eleven markers, eleven defects, all in one page
component and its two service reads.

| Line | Form | File's no. | The test's sentence | What the owner is owed | Cause named | Sev |
|---|---|---|---|---|---|---|
| 306 | D | 10 | my recorded choices say what day they were recorded | The day the choice was recorded, which the API already returns | `AccountDataPage.tsx:39`, `:55`; `account.py:172-173` | S3 |
| 324 | D | 11 | an account that has never been asked does not look like one that refused everything | The difference said out loud; the two states are currently drawn byte for byte alike, and the gateway treats them differently | `AccountDataPage.tsx:56`; `account.py:172-173`; `routes_account.py:31-32` | S2 |
| 361 | D | 7 | while my choices are being read the page says so instead of showing me three empty boxes | The shared waiting state with its live region, instead of a page that looks like an account that agreed to nothing | `AccountDataPage.tsx:56`; `w360/ui.tsx:648` | S2 |
| 442 | D | 1 | the choice the service cannot run without is marked required rather than left looking optional | The required purpose marked as required; without it the gateway refuses every file upload | `AccountDataPage.tsx:7-11`, `:56`; `gateway/routes_account.py:31-32` | S2 |
| 461 | D | 6 | the page stops claiming my choices are recorded the moment I change one | The confirmation cleared when the selection changes; it currently persists while a different set is ticked | `AccountDataPage.tsx:56-59` | S2 |
| 676 | D | 8 | the deletion stages are named in words rather than in the runner column names | Stage names in words, not the erasure runner's own identifiers | `AccountDataPage.tsx:76`; `scripts/erase_account.py:288-294` | S3 |
| 690 | D | 9 | a deletion request under way says when I asked for it | The date it was asked for, which is in the type and in every answer | `AccountDataPage.tsx:12`, `:76`; `account.py:230` | S3 |
| 704 | D | 5 | checking on my deletion does not throw away a choice I have not saved yet | A refresh that touches only the status, or a warning first; an unsaved consent change is currently discarded with no word said | `AccountDataPage.tsx:34`, `:39`, `:76` | S2 |
| 918 | D | 3 | a refusal that names its reason shows the reason, not "try again" | The reason the service gave; both services raise it as a structured detail the shared client already knows how to read | `AccountDataPage.tsx:30`; `routes_account.py:25`; `api/client.ts:97` | S2 |
| 933 | D | 2 | a gateway that answers with an error page says something a person can read | A readable sentence rather than a parse error reported as the reason | `AccountDataPage.tsx:27`; `api/client.ts:97` | S3 |
| 949 | D | 4 | a page that could not read my data offers me a way to try again | A Try again on the page that failed; the read happens once, on mount | `AccountDataPage.tsx:41` | S3 |

### `e2e-app/23-resilience.spec.ts` — waiting and failure across all screens

Four of these are conditional inline markers inside loops over the 24-row
`SCREENS` table, so they generate more failing cases than there are markers. The
table row's own `where`/`waits`/`noFailure` fields name each screen's cause line;
the register does not restate 24 rows.

| Line | Form | Cases | The test's sentence | What the owner is owed | Cause named | Sev |
|---|---|---|---|---|---|---|
| 371 | C | 12 | `<screen>` says what it is waiting for while it waits | The noun in the row's `waits` passed to `Loading`, matching what the same screen already hands `Failed` | `ui.tsx:646-652` contract; per-screen line in each row's `where` | S3 |
| 388 | D | 1 | the Title shelf tells a screen reader something is happening at all | The announcement itself, not just a noun — the skeleton rows are `aria-hidden` with no live region around them, so a screen reader hears silence | `pages/Shelf.tsx:109`; remedy at `skeletons.tsx:255` | S2 |
| 416 | C | 1 | `<screen>`, refused, says what failed and why — and offers to ask again | A `Failed` branch with the server's reason and a Try again | `Orders.tsx:284`, `:300` | **S1** |
| 460 | C | 1 | asking `<screen>` again really does ask the server again | No failure branch means no Try again either: the one screen an owner cannot re-ask from without reloading the app | `Orders.tsx:284`, `:300` | **S1** |
| 496 | C | 1 | `<screen>` behind a 500 says so, with the code in it | The same failure branch, reached through the transport error path | `Orders.tsx:284`, `:300` | **S1** |
| 773 | D | 1 | a rename the server declines does not close the drawer as though it worked | The returned Boolean checked and the toast raised, exactly as another screen in the module already does | `Reader.tsx:281-294`; precedent `RequestWork.tsx:198-201` | S2 |
| 900 | D | 1 | the maps screen says what it is waiting for while it waits | A `what` naming the village maps, the way the vault, dashboard, boundary and job screens all do | `VillageMaps.tsx:568` | S3 |

### `e2e-app/24-responsive.spec.ts` — phone layout and tap targets

Seven markers over five distinct defects, which is what the file's own header
says. Three of the tap-target markers share one cause.

| Line | Form | The test's sentence | What the owner is owed | Cause named | Sev |
|---|---|---|---|---|---|
| 383 | D | the drawer holds my Tab key while it is open, instead of walking me into the page behind it @phone | Focus kept inside the open drawer — the module's own focus-trap hook, or `inert` on the screen behind; nothing behind the scrim is currently inert | `w360/Shell.tsx:404-437`, `:118`; remedy at `w360/Dialog.tsx:50`, used by `PropertyActions.tsx:335` | S3 |
| 547 | D | I can read every word on /app/shared without dragging the page sideways @phone | The one-column inbox below the breakpoint; the inline track beats the phone rule, and the document measures wider than the screen | `pages/Shared.tsx:86`; unreachable rule at `w360.css:847-849`; suggested `.withrail.wide` beside `w360.css:815-820` | S3 |
| 606 | D | reading a deed fits a phone @phone | A phone reader that is the scan, with the page strip and inspector behind controls — three fixed tracks currently exceed the viewport before the scan gets a pixel | `pages/Reader.tsx:394`; only media query is print at `:60-70`; precedent `w360.css:2612-2618` | S3 |
| 1448 | D | the hamburger is big enough to hit with a thumb @phone | At least a 40px target below the drawer breakpoint; on a phone this button is the only way to the navigation | `w360.css:221-231` | S3 |
| 1462 | D | the buttons in the top bar are big enough to hit with a thumb @phone | The same floor, same cause | `w360.css:221-231` | S3 |
| 1476 | D | the primary button on a screen is big enough to hit with a thumb @phone | The same floor, same cause | `w360.css:221-231` | S3 |
| 1493 | D | the button that files a paper is big enough to hit with a thumb @phone | A phone-width rule lifting the default button to the floor | `w360.css:378-395` | S3 |

### `e2e-web360` — the live-wiring suite

Nine markers. Each proves its defect against a real API, a real database and
real storage, which is why several duplicate a sealed-suite marker.

| Spec and line | Form | The test's sentence | What the owner is owed | Cause named | Sev |
|---|---|---|---|---|---|
| `gap-shell:125` | B | the previous app's own rail keeps you inside the previous app | A rail whose twelve links stay inside the app they are drawn in; the only exit from the stub currently loops back into it | `layout/AppShell.tsx:79-90`; `routes.tsx:302` | S3 |
| `gap-shell:151` | B | the rail marks the screen you are actually on | Something saying where you are in a twelve-item menu — no selected pill and no `aria-current` appears on any legacy route | `AppShell.tsx:146-147` | S3 |
| `gap-shell:172` | B | View holdings on a group card shows that group's holdings, not everything you own | The group carried to a destination that can honour it; the control is dead at both ends today | `FamiliesGroupsPage.tsx:183`; `routes.tsx:295`; `w360/pages/Properties.tsx:249` | S3 |
| `gap-services:159` | B | when the second file fails to upload, the owner is told no request was raised | The plain sentence the oversize branch already ends with, instead of a raw storage error that leaves them guessing whether a surveyor is on the way | `RequestWork.tsx:168`, `:204-206`; `documents/storage.ts:50` | S2 |
| `gap-services:180` | B | a file that was already filed stops being queued, so pressing again cannot file it twice | The already-filed paper dropped from the queue; a second press re-uploads it and the resolver inserts a duplicate with no dedupe | `RequestWork.tsx:150`, `:170`; `web360.py:4601` | **S1** |
| `gap-maps:172` | B | a surveyed ring survives the first click on Remove saved boundary, and is only wiped after a second, deliberate one | The second confirmation the photo gallery and the replace path already give; the corners are unrecoverable once written | `RecordBoundary.tsx:913-919`; `web360.py:4298` | **S1** |
| `gap-vault:314` | B | the Reader does not tell the owner a link that lapsed last month expires tomorrow | A truthful statement about a live access credential; the vault screen parses the date itself and contradicts the reader about the same row today | `Reader.tsx:625`; `web360.py:1488-1498`; `Vault.tsx:50-80` | S2 |
| `ux-record-combined:352` | B | every control on a Record tab clears the 44px target floor | A token-level minimum height; the iOS client honours 44pt and the staged web kit sets it, so this client is the outlier | `w360.css:540-565`; `apps/ios/design.md:122-137` | S3 |
| `crud-360:999` | B | a paper that could not be read says so, because it needs sorting by hand | The panel held open on an error, or the sentence carried onto the page; it is currently unmounted with the message still in its state, so only the green toast is seen | `RecordPapers.tsx` `PaperDrawer.file()` | S2 |

## Operational notes

Read these before running either suite, changing a marker, or fixing anything
this register lists.

**A marker reports RED when the defect is FIXED.** Playwright treats
`test.fail()` as expected-to-fail, so the case passes while the defect is present
and fails the moment it is repaired. Deleting the marker is therefore part of the
fix, not a follow-up: a repair that leaves the marker behind turns a green suite
red and looks like a regression. `docs/specs/2026-09-14-service-detail.md`
records this being done properly — it lists two markers to delete with the change
that fixed them, and both are gone from the specs today.

**A `test.fail()` that fails by timing out is reported as a pass.** That is why
`09-record-boundary.spec.ts` uses deliberately short assertion timeouts inside
its four marked scenarios — `:423` (2s), `:670` (2s), `:967` (2s) and `:1292`
(3s). Raising any of them to the suite default would let the marker go green on a
slow machine without the defect being present, which hides it. The same device
appears in `23-resilience.spec.ts`, where the conditionals pick the timeout off
the flag: `s.namesWait ? 20_000 : 3_000` at `:375` and `s.noFailure ? 3_000 :
20_000` at `:422`, `:465` and `:501`. Do not normalise these.

**The convention that produced all of this** is rule 5 of
`tests/e2e-app/AUTHORING.md`: a defect you find is a `test.fail()`, with a
comment naming the file and line of the cause and what the owner is owed; do not
soften an assertion to make it pass and do not delete the scenario. The comment
quality in this backlog is a direct result — most markers name the cause to the
line and several name the remedy that already exists elsewhere in the same
module.

**Not every finding is marked, on purpose.** `06-record-features.spec.ts:1136`
records a defect explicitly left unmarked because it reproduces about one run in
two, and a marker that is wrong half the time is worse than none.
`16-maps.spec.ts:56` reports a map-unmount crash the same way. Neither is in this
register's counts; both are real findings and should be tracked wherever the
marked ones are.

**Several marked scenarios were run with the marker off first.**
`12-reader.spec.ts:27` and `18-shared.spec.ts:40` both say so — the test was
confirmed to fail on the sentence it is about rather than on a locator. That is
worth preserving when any of these are touched.

## Documentation drift

### In-file header counts that contradict their own file

Verified by counting the file with the commands above. Not corrected here: this
register owns no spec file.

| Location | Header says | File holds | Detail |
|---|---|---|---|
| `12-reader.spec.ts:27` | "THIRTEEN test.fail()s" | 10 | The header enumerates thirteen causes; three have no live marker — `Reader.tsx:309` (a one-page sketch reading "1 pages"), `Reader.tsx:538` (facts hidden unless a registration date or buyer is present) and `api.ts:379` (a selected field drawn nowhere). Either they were fixed and the list was not trimmed, or the markers were dropped without the fixes. Worth resolving before anyone treats the list as the backlog. |
| `23-resilience.spec.ts:69` | "Fifteen defects are recorded across seventeen `test.fail()` blocks" | 7 markers, 18 expected-failing cases | The fifteen-defect figure is defensible: 13 unnamed-wait screens, the audit trail, the reader rename. "Seventeen blocks" matches neither reading — the file has 7 syntactic markers and generates 18 failing cases. |
| `23-resilience.spec.ts:358` | "defect (fourteen of them)" | 13 | Contradicts the same file's own header at `:72` ("Thirteen screens") and its `:25` ("twelve of the twenty-four rows"). Twelve table rows carry `namesWait: false`, plus the Maps screen at the foot of the file, which is thirteen. Fourteen is reachable only by counting *blocks* — adding the Title shelf's second, dedicated assertion at `:388` — which is the ambiguity worth settling, because the file uses the word "defect". |
| `10-record-photos.spec.ts:40` | "Eight defects are marked `test.fail()`" | 6 | The header enumerates eight; two have no marker — the stage's two unconditional chips, and the ISO capture stamp. |
| `07-record-people.spec.ts:40` | "Five test.fail()s" | 4 | The header enumerates five; the fifth, about the identity-number field's retention wording not matching what the server does with the number, has no marker. |
| `18-shared.spec.ts:40` | "FIVE test.fail()s" | 6 | Borderline, and listed for completeness: the count word says five, then the same paragraph adds "And one @phone failure", so the body enumerates all six correctly. The number alone is what misleads. |

Headers whose counts I checked and found correct: `02-dashboard.spec.ts:44`
(two), `03-properties.spec.ts:11` (one), `04-record-shell.spec.ts:27` (four),
`05-record-papers.spec.ts:43` (two), `08-record-money.spec.ts:36` (eight),
`09-record-boundary.spec.ts:30` (four), `11-vault.spec.ts:32` (six),
`13-services.spec.ts:55` (seven), `14-ticket.spec.ts:119` (three),
`15-wallet.spec.ts:53` (six), `16-maps.spec.ts:47` (five markers over four
defects), `21-routing.spec.ts:39` (five), `22-account.spec.ts:40` (eleven),
`24-responsive.spec.ts:38` (five defects as seven scenarios).
`01-shell.spec.ts`, `06-record-features.spec.ts`, `19-sections-legacy.spec.ts`
and `20-public-auth.spec.ts` claim no total, so there is nothing to contradict.
No `e2e-web360` spec header claims a marker total.

One non-marker count drift found in passing: `01-shell.spec.ts:12` promises
"Four things a reader should know" and then lists five bullets.

### Documentation outside the specs

Both were findings when this register was written, and both have since been
resolved on 26/09/2026.

- `.kiro/skills/test-governance/references/evidence-and-status.md` stated 152
  markers across 15 spec files. The raw string count is 144, and the real figure
  is 118 across 23 files. It now matches this register and
  `docs/qa/tester-onboarding.md`.
- `.kiro/skills/test-governance/references/harness-map.md` described the
  inverted-test trap for `gap-shell` correctly and claimed no total. It now also
  states both suites' totals and points here.
- `docs/specs/2026-09-14-service-detail.md` references markers at
  `01-shell.spec.ts:142-150` and `14-ticket.spec.ts:396-405` (also written
  `:401`). Both are gone — the defects were fixed and the markers deleted with
  them, which is the convention working. That document is dated historical
  evidence and should be left as it stands, not rewritten to match today's line
  numbers.

## What this register does not establish

- **No severity here is approved.** Every grade is a proposal for Reddy or the
  defect owner to accept or change, and no marker has an assignee or a ticket.
  Defect destination, severity conventions and priority ownership are all still
  open decisions in `docs/qa/tester-onboarding.md`.
- **Neither suite was run.** This is a static read of the specs. Nothing here is
  a run record, and no claim is made that any marker currently fails for the
  reason its comment gives. `12-reader.spec.ts` and `18-shared.spec.ts` assert in
  their own headers that their markers were each checked with the marker off; the
  other files make no such claim and I did not verify it.
- **Cause locations are the comments' claims, not my findings.** Every
  `file:line` in the Cause column is quoted from the marker's own comment. The
  marker lines and the spec line numbers are verified; the application source
  lines they point at are not.
- **The distinct-defect total is an estimate.** 127 markers, 44 of them inside
  the ten clusters above, with at least 14 being second recordings of a cause
  held elsewhere. I did not attempt an exact distinct-defect count, because
  deciding whether two markers are one defect is a call for the owner of the
  code.
