# Verification — Holdings naming (iteration 1, 03/10/2026)

Branch `main`, in place. Nothing committed or pushed. The index holds only the 14 `git mv` renames (`git diff --cached --stat`: 14 files, 0 insertions, 0 deletions). Untracked new or renamed files: `apps/web/src/w360/holdingList{,.test}.ts`, `apps/web/src/w360/holdingPath.ts`, `tests/e2e-app/specs/28-holding-overview.spec.ts`, `29-holdings-list.spec.ts`, `apps/mobile/src/app/holdings.tsx`, `apps/mobile/src/app/holding/[id].tsx` (the two redirects). No old path reappeared (`combinedList.ts`, `pages/Combined*.tsx`, `(tabs)/holdings.tsx` target etc. checked absent after the renames).

## What changed

### A. Web
- **Files (git mv):** `pages/Combined.tsx` → `Holdings.tsx`, `CombinedProperty.tsx` → `Holding.tsx`, `CombinedActions/Ledger/Fmb.tsx` → `HoldingActions/Ledger/Fmb.tsx`. `combinedList{,.test}.ts` → `holdingList{,.test}.ts` (plain `mv`, untracked).
- **Identifiers:** every name in plan items 1–3. The api.ts type is `HoldingCard`; hooks are `useHoldings`, `useHolding`, `useHoldingPapers`, and so on. The frame and tabs are `Holding`, `HoldingHead`, `HoldingTabs`, `HOLDING_TABS`, `tabForHolding` and `useHoldingCtx`. List helpers are `holdingSummary`, `sortHoldings`, `holdingFacets`, `matchesHolding`, `holdingCsvRows`, `HOLDING_PARAM` and `HOLDING_SORTS`. The prop and local `combined` is now `holding`. Verbs (`CombineDialog`, `canCombine`, `?combine=1`) and the "Combined map" tab label are unchanged.
- **Routes:** `/app/holdings` and `/app/holdings/:id/{surveys,papers,fmb,expenses,services}`. `FromCombined` in `routes.tsx` is registered for `combined` and `combined/*` under `/app`, inside `RequireAuth`, and redirects with `replace`, keeping the id, tab, `search` and `hash`.
  - **Deviation from the plan, noted for the reviewer:** `holdingsPathFrom` lives in a new import-free module, `apps/web/src/w360/holdingPath.ts`, not in `holdingList.ts`. `routes.tsx` imports it eagerly, and `holdingList.ts` imports `ui.tsx` (MUI and icons). Putting it there would have pulled `ui.tsx` into the first chunk, the landing and sign-in pages included. It is unit-tested from `holdingList.test.ts`, and VOC-6 allows it.
- **Links moved to `/app/holdings`:** Shell rail, RecordHead crumbs, Properties post-create nav, Vault "Open holding", every link inside the Holding frame and the Ledger.
- **Vault facets:** the FacetKey `combined` is now `holding`. The facets are React state only: no URL key and no storage. **There was no `combined` URL key to dual-read.** A comment records that a future URL key must accept `combined` on read.
- **Server boundary kept:** the comment sits above `// ── Holdings ──` in `api.ts`, with the same note beside Vault's `l.kind === 'combined'` uses.
- **Audit labels** in `packages/core/src/format/audit.ts`: "Created / Edited / Deleted a holding", "Changed the records in a holding", "Recorded / Removed a holding cost". The keys are unchanged.
- **Guards:**
  - `shared-components-tests.ts`: budget paths and the owner text.
  - `ux-guards.ts`: the web block reads `Holding.tsx` and `HOLDING_TABS`.
  - `vocab-tests.ts`:
    - VOC-5 path updated.
    - VOC-2 now scans `packages/core/src` too.
    - VOC-3 widened to all of `apps/web/src`, legacy included.
    - New VOC-6 for routes, and new VOC-7 for iOS.
- **Docs:**
  - `design.md` § App vocabulary note and the tab-layout line.
  - A note at the top of § Screens in `docs/specs/2026-09-25-combined-properties.md`. The dated file and body are kept.
  - `docs/specs/TODO-one-platform.md`.
  - `docs/qa/test-fail-register.md` and `tester-onboarding.md` (`ux-record-holding`).
  - `.kiro/skills/architecture-trace/references/system-map.md` and `.kiro/skills/heuristic-ux-audit/references/web-heuristics.md`.
  - `scripts/parity-map.json` has no Combined or Holding path entries, so it needed no edit.
- **e2e specs:**
  - Renamed: `27-holding-map`, `28-holding-overview`, `29-holdings-list`, e2e-web360 `holdings.spec.ts` and `ux-record-holding.spec.ts`.
  - URLs updated in those files and in `26-one-font:105` and `04-record-shell:545`.
  - Two new redirect tests: 29 for the list with query and hash, 28 for a member with tab, query and hash.

### B. iOS (XcodeGen; `sources: [Pattadar/Sources, …]` directories, `.xcodeproj` gitignored, so no project.yml edit needed)
- **git mv:** `HoldingsScreen.swift` → `PropertiesScreen.swift`, `HoldingDetailScreen.swift` → `PropertyDetailScreens.swift`, `AddHoldingScreen.swift` → `AddFromScanScreen.swift`, `HoldingPhotosSection.swift` → `PropertyPhotosSection.swift`.
- **Types:**

  | Old | New |
  |---|---|
  | `Holding` | `PropertyRecord` |
  | `HoldingFilter` / `HoldingGrouping` / `HoldingSort` | `PropertyFilter` / `PropertyGrouping` / `PropertySort` |
  | `HoldingsScreen` | `PropertiesScreen` |
  | `HoldingRow` | `PropertyRow` |
  | `HoldingHeroCard` | `PropertyHeroCard` |
  | `HoldingFilterSheet` | `PropertyFilterSheet` |
  | `HoldingDetailScreen` | `ParcelDetailScreen` |
  | `AddHoldingScreen` | `AddFromScanScreen` |
  | `HoldingPhotoGallery` / `HoldingPhotoStrip` | `PropertyPhotoGallery` / `PropertyPhotoStrip` |
  | `HoldingDestination` | `PropertyDestination` |

  These are app-target only. The PattadarKit public API, the widget intent and entity types, the deep-link tokens and the storage keys are unchanged (plan Decision 7).
- **Copy:** 37 user-visible strings now say property, properties or parcel instead of holding. These include the two named in the task (`PropertiesScreen` "This property is no longer on file.", `AddDocumentSheet` "…a paper, not a property…"), the widgets ("A property", "Choose a property", "Every property on file…", "All properties in order") and `PattadarKit` `Readiness.swift`'s blurb noun. `ReadinessTests` now expects `"1 property"`.
- **Docs:** `apps/ios/design.md:40` and the `apps/ios/README.md` widget table ("A property").
- **VOC-7** fails on any Swift string literal that says holding or holdings. It reads the strings inside `\(…)` interpolations as well. The only exceptions are the deep-link tokens in `SharedSnapshot.swift` and `"PattadarHolding"` in `HoldingWidget.swift`.
- **Not added to iOS:** the Holdings feature.

### C. Expo
- **git mv:** `(tabs)/holdings.tsx` → `(tabs)/properties.tsx` (default export `PropertiesScreen`) and `holding/[id].tsx` → `property/[id].tsx` (default export `PropertyDetailScreen`). In `(tabs)/_layout.tsx`, `name="properties"`.
- **Hrefs:** 19 rewritten across index, family, passbooks, properties, `group/[id]`, portfolio, `property/[id]` and `lib/homeInsights.ts`.
- **New redirect routes outside `(tabs)`:**
  - `app/holdings.tsx` → `/properties`, keeping all params.
  - `app/holding/[id].tsx` → `/property/[id]`, keeping `id` and `kind`.
- **Copy in `property/[id].tsx`:**
  - `<Section title="Property">`.
  - The fallback title "Property".
  - "This property is no longer available."
  - "See all properties of this owner".
  - "Remove from this property…".
  - "…already attached to this property."
  - "Couldn't delete this property".
- **Unchanged:** the query key `['pattadar','holdings']` and `@/data/holdings`.
- **`scripts/ux-guards.ts`:** 11 path references updated. CL-610's logic is unchanged.
- **Maestro `02_tabs_navigation.yaml`:** taps Properties and Groups (the real tab titles). The asserts use each screen's real header ("Passbooks", "Land & Properties", "Groups"). The old "Khata Books", "Land Parcels" and "Family & Heirs" strings exist nowhere in the screens' source. The README row is updated.

### D. Legacy web
- **`LandPropertiesPage.tsx`:**
  - Eyebrow "Your properties" (both places).
  - "Add your first property".
  - "＋ Add a property".
  - The chip "N property/properties".
  - The StatCard "Properties".
  - "Search properties…".
  - Export stem `pattadar-all-properties`.
- **`StakeDialog`:** "My stake in this property".
- **Not in the plan:** `tests/e2e-app/specs/19-sections-legacy.spec.ts:485` asserted "Add your first holding". It now asserts "Add your first property", and the test name was reworded to match. It passes.

## Commands and results

All commands were run from the repo root unless noted.

| Check | Command | Result |
|---|---|---|
| Web typecheck | `cd apps/web && bun run typecheck` | rc 0 |
| Root typecheck (all workspaces) | `bun run typecheck` | rc 0: tokens, core, university, web, mobile all "Exited with code 0" |
| Web unit | `bun test apps/web/src` | **350 pass, 0 fail** (348 before, plus the new `holdingsPathFrom` test, plus other tasks' tests) |
| Core unit | `bun test packages/core` | 188 pass, 0 fail |
| Expo unit | `bun test apps/mobile/tests` | 7 pass, 0 fail |
| Expo typecheck | `cd apps/mobile && bun run typecheck` | rc 0 (`.expo/types` is absent, so hrefs were checked by grep; see below) |
| Every guard | `for s in scripts/*-tests.ts scripts/icon-guard.ts scripts/ux-guards.ts; do bun run $s; done` | **all rc 0** (21 guards; see the list below) |
| Agent governance | `python3 scripts/validate-agent-governance.py` | 29 skills, 0 errors, 0 warnings |
| Whitespace | `git diff --check` and `git diff --cached --check` | clean |
| Vectors | `bun run scripts/emit-vectors.ts --check` | VECTORS CURRENT |
| Parity | `bun run scripts/parity-check.ts` | rc 1, with **only** the known pre-existing `[twins] packages/core/src/land/landcalc.ts changed; its twin did not`. No other error or warning. |
| PattadarKit | `cd apps/ios/PattadarKit && swift test` | **209 tests in 7 suites passed**, rc 0, including "The dashboard line names holdings rather than counting them" with the new `"1 property"` expectation |
| iOS app build | `cd apps/ios && xcodegen generate && xcodebuild -project Pattadar.xcodeproj -scheme Pattadar -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/hold-ios-dd CODE_SIGNING_ALLOWED=NO build` | **`** BUILD SUCCEEDED **`**, rc 0, 0 `error:` lines. `/tmp/hold-ios-dd` was removed afterwards. `verify.sh`, `simctl` and `devicectl` were not run. |
| Root build | `bun run build` | rc 0, web "✓ built". The chunks are now `Holdings-*.js`, `Holding-*.js`, `HoldingLedger-*.js` and `HoldingFmb-*.js`. `apps/web/dist` and `apps/university/dist` existed before (gitignored) and were rebuilt in place. |
| Maestro | not run | There is no simulator by design (`tests/e2e-mobile/README.md`). The flow was checked against the source only. |

The 21 guards: a11y-web, aadhaar-digits, area, cache-eviction, contrast-helper, contrast, fence, geo, hooks, lifecycle, palette, plural, provenance, screening, **shared-components**, **typography**, url-scheme, village, **vocab**, icon-guard ("ICON GUARD PASSES") and ux-guards ("UX GUARDS PASS", CL-610 included).

`shared-components-tests.ts` printed one NOTE, "counts went down … `RecordNotes.tsx: card 1 < 2`". That file belongs to other work, so its budget was left alone. The budgets for the renamed `HoldingLedger.tsx` and `Holding.tsx` printed no NOTE.

### Guard mutation checks (`/tmp/hold-mutate.sh`; each file restored from a backup, and vocab PASS afterwards)
| Mutation | Result |
|---|---|
| Add `const __p = "/app/combined";` to `Holdings.tsx` | VOC-6 FAIL `Holdings.tsx:56` |
| Put back "Search holdings…" in `LandPropertiesPage.tsx` | VOC-3 FAIL `LandPropertiesPage.tsx:497` |
| Put back "This holding is no longer on file." | VOC-7 FAIL `PropertiesScreen.swift:485` |
| Put back `"HOLDING" : "HOLDINGS"` inside an interpolation | VOC-7 FAIL `DocumentsScreen.swift:990` (both strings) |

Before the iOS and legacy copy was fixed, VOC-3 flagged 5 legacy lines and VOC-7 flagged 37 iOS strings. Both fell to 0 after the fix.

### Sweeps
- `grep -rnE "Combined[A-Z]|\bCombined\b|combinedList|COMBINED_|useCombined|app/combined|tabForCombined|useCombinedCtx" apps/web/src` leaves only:
  - the server names (`web.createCombinedProperty` …),
  - `FromCombined` / `holdingPath.ts` and its test,
  - the `ui.tsx` doc comment,
  - the "Combined map" label and the comments about it,
  - comments in files not otherwise touched: `w360.css`, `PortfolioCanvas.tsx`, `surveyBoundaryLayer.ts`, `BoundaryMeasurementsCard.tsx`,
  - `RecordPapers.tsx` "Combined quote" (a price, not this feature).
- `grep -rnE "'/holdings|\"/holdings|/holding/|\(tabs\)/holdings" apps/mobile/src` returns nothing outside the two redirect files. The query key and the data import remain, as intended.
- The `app/combined` match in `tests/e2e-app/specs` and `tests/e2e-web360/specs` is only in the two new redirect tests.

---

# Iteration 2 (03/10/2026): review findings fixed, e2e evidence recorded

## Review findings and what was done

| # | Finding | Done |
|---|---|---|
| 1 | The e2e evidence was not recorded | The sections below record each run with its command and result. |
| 2 | Two new failures in `04-record-shell` were not classified | Both are pre-existing and have nothing to do with this change. The cause is a test-locator race. See § 04/24. |
| 3 | Eight failures in `19-sections-legacy` were not classified | All 8 are pre-existing. Three assert copy that is not in `HEAD`. All 8 also fail on the base copy. See § Spec 19. |
| 4 | Cleanup was not done | Both Vites this task started (`:5193` and the base copy's `:5194`) are stopped. The DB is dropped. The temporary spec and `/tmp/hold-*` are removed. See § Cleanup. |
| 5 | `CombinedLedger` was left in TODO-one-platform | `docs/specs/TODO-one-platform.md:59` now says `HoldingLedger`. |
| 6 | Stale comments; CL-610 did not scan the Expo detail screen | `property/[id].tsx:392` now says "the Property section". `Properties.tsx:1450` now says "holding now exists". CL-610 now also scans `apps/mobile/src/app/property/[id].tsx` (`scripts/ux-guards.ts`). |

Leftover names in the two renamed e2e-web360 specs were also fixed. These are test text only, with no behaviour change:
- `ux-record-holding.spec.ts`: the describe "every Combined tab" is now "every Holding tab", and the doc comment's `COMBINED_TABS` is now `HOLDING_TABS`.
- `holdings.spec.ts`: an assertion message `combined …` is now `holding …`.

The `deleteCombinedProperty` GraphQL calls in both specs are server names and stay.

**Mutation check for the widened CL-610.** I put `<Section title="Holding">` back into `property/[id].tsx` and ran the guard. It printed `FAIL: CL-610 apps/mobile/src/app/property/[id].tsx does not say "holding" to the user — title="Holding"` (UX GUARDS FAILED (1)). After restoring the file from its backup (`cmp` identical), it printed `UX GUARDS PASS`.

## Re-run after the iteration-2 edits

| Check | Command | Result |
|---|---|---|
| Web typecheck | `cd apps/web && bun run typecheck` | rc 0 |
| Expo typecheck | `cd apps/mobile && bun run typecheck` | rc 0 |
| Web unit | `bun test apps/web/src` | **353 pass, 0 fail**, 22 files. Other tasks added tests since iteration 1. |
| Every guard | `for s in scripts/*-tests.ts scripts/icon-guard.ts scripts/ux-guards.ts; do bun run $s; done` | 22 PASS, 1 FAIL (details below) |
| Root build, parity, iOS | not re-run | The iteration-2 edits are two comments, one doc line, one guard file list and e2e spec text. None of them is built into the app, the parity twins or iOS. The iteration-1 results stand. |

The 22 that passed:
- **Named in the gate:** `vocab`, `typography`, `shared-components`, `icon-guard`, `ux-guards` (CL-610 included).
- **The rest:** aadhaar-digits, area, cache-eviction, contrast-helper, contrast, fence, geo, hooks, lifecycle, network-interest (new from another task), palette, plural, provenance, screening, url-scheme, village.

The one failure is `a11y-web-tests.ts`: `FAIL: M3-6 every var(--token) used in apps/web resolves to a declaration — --color-error (apps/web/src/styles/site.css)`. It is not from this task:
- `site.css:1553` (`color: var(--color-error)`) comes from commit `591e670` (feat(network), 03/10/2026 13:01).
- The uncommitted `.site { --color-…: var(--mui-…) }` alias block was written at 14:02 by concurrent landing/theme work, and it declares no `--color-error`.
- This task never touched `site.css`.
- The guard passed in iteration 1, before that concurrent edit.

## Sealed e2e-app (`:5193`, this task's Vite on the working tree)

The server was started as `cd apps/web && WEB_PORT=5193 bun run dev < /dev/null`.

### Targeted run (iteration 1, 13:32)
```
cd tests/e2e-app && APP_WEB_URL=http://localhost:5193 bunx playwright test \
  specs/27-holding-map.spec.ts specs/28-holding-overview.spec.ts specs/29-holdings-list.spec.ts \
  specs/11c-documents-files.spec.ts specs/26-one-font.spec.ts specs/19-sections-legacy.spec.ts \
  --project=app --project=phone --reporter=line --output=/tmp/hold-e2e
```
The run had 319 tests: **311 passed, 8 failed**.
- **27, 28, 29, 11c and 26 all pass**, on both app and phone. That includes the two new redirect tests:
  - `28-holding-overview:97` "an old /app/combined member link keeps its id, tab, query and hash".
  - `29-holdings-list:38` "an old /app/combined link lands on Holdings with its query and hash".
- **All 8 failures are in `19-sections-legacy`** and are classified in § Spec 19.
- The one test this task edited in 19 passes: `:485` "Add your first property".

### Spec 19: the 8 failures are pre-existing
The 8 tests are `:469`, `:528`, `:1240`, `:1251`, `:1503`, `:1530`, `:1798` and `:2204`. In iteration 2 the spec was re-run alone on both servers:
```
APP_WEB_URL=http://localhost:5193 bunx playwright test specs/19-sections-legacy.spec.ts --project=app --reporter=line
APP_WEB_URL=http://localhost:5194 bunx playwright test specs/19-sections-legacy.spec.ts --project=app --reporter=line
```
- **`:5193`, the working tree:** 137 passed and 8 failed. They are the same 8.
- **`:5194`, the base copy** (see § 04/24 for how it was built): 77 passed and 68 failed. All 8 are among the 68.
  - The base copy predates later concurrent work, such as the five-tool Tools and the fence calculator in spec 19, so it fails more.
  - It is a superset check only, not a clean baseline.

The stronger evidence is in the failures themselves. None of them involves the copy on `/legacy/parcels`, `StakeDialog`, the audit labels or the routes:

| Test | Failure | Why it is not this task |
|---|---|---|
| `:469` | `getByText('Welcome — start with one upload')` not found | The string is in no file under `apps/web/src` at `HEAD` (`git grep` count 0) |
| `:528` | `getByText('Nothing sent yet')` not found | `NotificationsPage.tsx`, not touched |
| `:1240` | "this screen reads all four reference tables at once" | Admin reference screen, not touched |
| `:1251` | `/Andhra Pradesh has full district \/ mandal \/ SRO data…/` not found | The string is not in `HEAD` (count 0) |
| `:1503` | `getByLabel('Your name')` expected "Sankara Telukutla", got "" | Profile, not touched |
| `:1530` | Google face `img` expected 2, got 0 | Profile and account button, not touched |
| `:1798` | `/These are reference guideline values published…/` not found | The string is not in `HEAD` (count 0) |
| `:2204` | `input[type="file"]` strict mode, 2 elements | Upload door, not touched |

### 04/24: compared with a reconstructed base
**How the base was built** (no `git stash` or `git checkout`):
- `/tmp/hold-base` was a full copy of the working tree with **only this task's route hunks reverted**, using `/tmp/hold-base-revert.pl`. That script turns `/app/holdings` back into `/app/combined`, restores the `combined` and `combined/:id` route paths, and drops the `FromCombined` routes.
- The copy was served on `:5194` (`bun run dev`).
- Both runs used this tree's `tests/e2e-app`.

**Commands:**
```
cd tests/e2e-app && APP_WEB_URL=http://localhost:5193 bunx playwright test specs/04-record-shell.spec.ts specs/24-responsive.spec.ts --project=app --project=phone --reporter=json > /tmp/hold-0424.json
cd tests/e2e-app && APP_WEB_URL=http://localhost:5194 bunx playwright test specs/04-record-shell.spec.ts specs/24-responsive.spec.ts --project=app --project=phone --reporter=json > /tmp/hold-0424-base.json
```

**Results:**

| Run | Rows | Failed rows | Unique (project, file:line) |
|---|---|---|---|
| Change | 411 | 151 | 137 |
| Base | 411 | 149 | 135 |

The failures per file are the same in both runs except one: app 03 28, **app 04 25 (change) vs 23 (base)**, phone 04 1, app 24 49, phone 24 48. The prior task's baseline was 136.
- **New in the change run:** `[app] 04-record-shell:1473` and `:1482`, and nothing else. **Fixed:** none.
- **Failures that mention the rail:** these are `24-responsive` `:242`, `:263`, `:375`, `:433`, `:452`, `:482`, `:517` and `:867`. All of them fail in the base too.
- **Failures that mention holdings, combined or crumbs:** none.
- **04's crumbs test** (`:523`, now `/app/holdings/cp-katragunta`) passes.

**The two "new" 04 tests are a test race, not this change.** Re-run in iteration 2, with the same tests against both servers:
```
APP_WEB_URL=http://localhost:519{3,4} bunx playwright test specs/04-record-shell.spec.ts \
  -g "neither khata nor owner|name but no khata" --project=app --repeat-each=3 --workers=1 --reporter=line
```

| Server | `:1482` "name alone" | `:1473` "neither khata nor owner" |
|---|---|---|
| `:5193` (change) | failed 3/3 | failed 1/3 |
| `:5194` (base) | **failed 3/3** | 0/3 |

A single earlier run on each server also gave `:1482` failing and `:1473` passing.

**Cause:**
- The parcel fixture's deed names the buyer "Telukutla Shankar Reddy". The record's deed card in `RecordPapers.tsx:1016` (`{ k: 'Buyer', v: deed.buyer }`, rendered as `<span class="v">`) draws that name once the deed has loaded.
- `:1482` asserts `getByText('Telukutla Shankar Reddy')` is visible and then hits a strict-mode violation: 2 elements, the deed's Buyer `span.v` and the khata/owner `p.note`.
- `:1473` asserts the name has count 0. It passes or fails depending on whether the deed card has drawn by the time it checks.

**Why this task did not cause it:**
- None of `RecordPapers.tsx`, `fixtures/world.ts` or W03 is touched by this task.
- `RecordPapers.tsx` and the fixtures are unmodified against `HEAD`.
- This task's hunk in spec 04 is only the crumbs test (`:535-556`).
- This task's hunk in `RecordHead.tsx` is only the crumb trail.

The failure belongs to the test, and fixing its locator is out of scope here. It is listed for Reddy below.

### Browser spot-check (iteration 1, 13:33)
- **Spec:** the temporary `tests/e2e-app/specs/zz-hold-naming.tmp.spec.ts`, run with `--project=app --project=phone` against `:5193`. The spec has since been deleted.
- **Result:** **2 passed**.
- **Desktop (1512×950):** the rail's "Holdings" link has `href="/app/holdings"` and opens the list. The h1 is "Holdings" and the summary reads "1 holding · 34.53 ac".
- **Phone (iPhone 14 project):** the same list, opened at `/app/holdings`.
- **Type, both projects:** the font is `"Atkinson Hyperlegible", system-ui, sans-serif`, the h1 weight 700, the note weight 400, and `tabular-nums`.
- **Redirects, both projects:**
  - `/app/combined/cp-spot/fmb?x=1#x` goes to `/app/holdings/cp-spot/fmb?x=1#x`.
  - `/app/combined/cp-spot?x=1` goes to `/app/holdings/cp-spot?x=1`, and the h1 "Banda farm" is visible.
- **Screenshots (kept here):**
  - `shot-app-holdings.png`
  - `shot-app-holding-redirect.png`
  - `shot-phone-holdings.png`
  - `shot-phone-holding-redirect.png`

## e2e-web360 (disposable DB)
**Setup:**
- `psql -d postgres` worked over the local socket.
- `createdb pattadar_holdings_e2e`, then `APP_PG_DSN="dbname=pattadar_holdings_e2e" .local/api-venv/bin/python scripts/init-test-db.py`. That command logged only the expected `aadhaar.write_path_missing` warning.

**Run:**
```
cd tests/e2e-web360 && TEST_PG_DSN="dbname=pattadar_holdings_e2e" E2E_API_PORT=18091 E2E_WEB_PORT=5196 \
  bunx playwright test specs/holdings.spec.ts specs/ux-record-holding.spec.ts --reporter=line --output=/tmp/hold-w360
```
The harness started: it built the bundle, and uvicorn ran on `127.0.0.1:18091`. **17 passed, 2 failed** (3.1 min). The 17 include `ux-record-holding:352`, the 44px tap target, which `test.fail()` marks as expected to fail and which is registered in `docs/qa/test-fail-register.md`.

1. **`holdings.spec.ts:132` failed, and is now fixed.** "two records become one holding…" hit a strict-mode violation: `getByText('34.53 ac', { exact: false })` matched both the card's `<span class="num">34.53 ac</span>` and the new page summary `<p class="note num">1 holding · 34.53 ac · ₹2.74 Cr valued</p>`.
   - The summary line comes from the earlier uncommitted Holdings content-header run. That work ships with this one, and `HEAD`'s `Combined.tsx` has no summary.
   - The fix is test-only: the assertion now uses `{ exact: true }`, with a comment saying it is the card's extent and not the summary. The app is unchanged.
2. **`ux-record-holding.spec.ts:283` failed, and is pre-existing.** "the People chain stage runs to the bottom of the window": `.ownerchain-canvas` was not found, and the People tab shows "No owners recorded yet" for `w360-p-214-2`.
   - The chain only draws when `record_owners` or `record_transfers` has rows (`RecordPeople.tsx:866-867`, `web360.py:6919-6945`).
   - Neither seed script the global setup runs (`seed-demo-data.py` and `seed-web360.py`) writes either table (grep count 0).
   - Both seed scripts, `RecordPeople.tsx` and `OwnerChain.tsx` are unmodified against `HEAD`.
   - This test is a Record test, not a Holding test. It came over unchanged from `ux-record-combined.spec.ts` in the rename.
   - It cannot pass against a fresh seed, and it is listed for Reddy.

**Rerun** of just the two tests, after the fix (with a fresh global-setup re-seed):
```
… bunx playwright test specs/holdings.spec.ts:132 specs/ux-record-holding.spec.ts:283 --reporter=line --output=/tmp/hold-w360-rr
```
The result was **1 passed** (`holdings:132`) and **1 failed** (`ux-record-holding:283`, unchanged and pre-existing). The full 19-test file was not re-run after the test-text edits: the describe title and an assertion message.

## Follow-ups for Reddy (not edited; outside the approved scope)
- **Server-side `combined` names**, for a possible future contract change:
  - GraphQL fields and operations: `combinedProperties`, `combinedProperty`, `combinedPapers`, `combinedFmb`, `combinedExpenses`, `createCombinedProperty`, `updateCombinedProperty`, `setCombinedMembers`, `deleteCombinedProperty`, `saveCombinedExpense`, `deleteCombinedExpense`.
  - The arg `combinedId` (`addJointFmb` and orders).
  - Response fields `combinedSpend`, `combinedId`, `combinedName`.
  - Values `kind: 'combined'` and `scope: 'combined'`.
  - Audit action keys `*_combined_*`.
  - The `combined_*` tables.
  - `services/api/src/combined_geometry.py` and its tests.
  - The TanStack query keys tied to those types.
  - The sealed-world fixture keys `combinedProperties` / `combinedProperty`.
- **Legacy web identifiers that still say holding for a property:**
  - `pages/holdings/`, `components/holdingCards.tsx`, and `useHoldings` / `HoldingProperty` in `data/hooks.ts` (parity "adapt" band).
  - The `interface Holding` in `LandPropertiesPage`.
  - The legacy `DashboardPage` copy "No litigation on any holding".
  - "Holding Status" in `PropertyDetailPage`, a tenure term.
- **Pricing copy:** `pricingContent.ts` and `PricingPage.tsx` define "A holding is one land parcel…" for plan limits. That is a commercial decision.
- **Landing:** `landingContent.ts:37`, "A passbook, 1-B or Adangal can describe a holding."
- **Twin types:** `HoldingKind` in core and in iOS.
- **iOS identifiers kept** (Decision 7): the PattadarKit public API, the widget intent and entity types, the deep-link tokens, the storage keys and `"PattadarHolding"`.
- **Expo:** `src/data/holdings.ts`, its local `Holding*` identifiers, and the query key `['pattadar','holdings']`.
- **Vault:** there is no facet URL key, so there was nothing to dual-read (Decision 6).
- **Pre-existing test defects found here** (not caused by this task, and not fixed):
  - `04-record-shell:1473` and `:1482`: the owner-name locator collides with the deed card's Buyer.
  - `ux-record-holding:283`: the seeds have no owners or transfers.
  - `a11y-web` M3-6 `--color-error` comes from concurrent `site.css` work.
- **Commit split:** see plan § Commit step.

## Cleanup (iteration 2)
- **Servers stopped.** This task started both Vites, judging by their command lines and start times; no other process was touched:
  - `kill 87197 87192`: the `:5193` Vite on the working tree and its `bun run dev`.
  - `kill 50463 50458`: the `:5194` Vite served from `/tmp/hold-base` and its `bun run dev`.
- **No listeners left:** `lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(5193|5194|5196|18091)\b'` returns nothing. The Playwright webServer for `:5196` and `:18091` exits with its run.
- **DB dropped:** `dropdb pattadar_holdings_e2e` returned rc 0, and `select count(*) from pg_database where datname='pattadar_holdings_e2e'` returns `0`.
- **Removed:**
  - `tests/e2e-app/specs/zz-hold-naming.tmp.spec.ts`.
  - `/tmp/hold-*`, including the `/tmp/hold-base` copy.
  - `.local/e2e-web360-dist-5196`, `tests/e2e-web360/test-results-5196`, `tests/e2e-web360/playwright-report-5196` and `tests/e2e-web360/results-5196.json`.
- **Left alone:** the other tasks' `zz-theme-*`, `zz-drawer-shots`, `zz-toast-probe` specs (`zz-ux-audit-notifier-after` was removed by its owner during this run), and the e2e-app `results.json`, `playwright-report/` and `test-results/`. Every e2e-app run here used `--reporter=line` or `--reporter=json` to stdout, so none of them overwrote those files.
- **Index:** `git diff --cached --stat` shows only the 14 `git mv` renames (see below). Nothing else is staged, and nothing is committed or pushed.
