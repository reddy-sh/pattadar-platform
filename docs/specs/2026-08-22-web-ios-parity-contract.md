# Web → iOS parity — the contract

Date: 2026-08-22
Scope: `packages/core`, `apps/web`, `apps/ios`, `services/api`, `services/gateway`

## Why

Two apps ship the same product from codebases that cannot share a line of code:
`apps/web` (React + MUI + TypeScript) and `apps/ios` (native Swift 6 / SwiftUI
+ `PattadarKit`). Every land rule, GraphQL document, design token and shared
noun therefore exists **twice**, kept in step by hand.

It has already failed. `docs/specs/2026-08-14-vault-parity-design.md` records web
and iOS having grown two tables, two shelf taxonomies and two names —
"Documents" and "Vault" — for the same thing, so nobody could tell someone where
their deed was without first asking which device they were holding.

This file is the standing answer: what crosses from web to iOS, what must never
cross, and who decides the rest. It is read by `scripts/parity-check.ts`, by the
canonical `.kiro/skills/sync-ios` workflow, and by the detached post-commit
runner.

## The twin map

`PattadarKit` mirrors `packages/core` nearly module-for-module. These pairs are
the contract; the machine-readable copy is `scripts/parity-map.json`.

| `packages/core/src/…` | `PattadarKit/Sources/PattadarKit/…` |
|---|---|
| `land/units.ts` | `Land/Units.swift` |
| `land/area.ts` | `Land/Area.swift` |
| `land/geo.ts` | `Land/Geo.swift`, `Land/PlaceQuery.swift` |
| `land/boundaryFile.ts` | `Land/Boundary.swift` |
| `land/villages.ts` | `Land/VillageNames.swift` |
| `land/landcalc.ts`, `land/scale.ts` | `Land/Boundary.swift` |
| `land/photos.ts`, `land/photoScreening.ts` | `Land/DocumentMatch.swift` |
| `records/completeness.ts` | `Land/Readiness.swift` |
| `records/docFamilies.ts` | `Format/DocSpine.swift` |
| `format/date.ts`, `format/dob.ts` | `Format/Display.swift` |
| `format/inr.ts` | `Format/Display.swift` |
| `format/docName.ts` | `Format/DocumentKind.swift` |
| `api/operations.ts` | `Networking/Queries.swift` |
| `api/client.ts`, `api/network.ts` | `Networking/PattadarAPI.swift` |

A module with no twin is not a defect — it may be genuinely web-only. It is a
defect when a twin **exists** and only one side moved.

### Recorded exceptions inside a twinned module

A twinned module may still hold members that are deliberately one-sided. Record
them here, so the next sweep does not re-open a closed question.

- **`land/landcalc.ts` → `cornerLabel`, `ringSides`, `compassPoint`** — web-only
  presentation helpers for the boundary-tracing UI (`RecordBoundary`,
  `FenceStudio`). iOS takes side lengths and bearings server-derived through
  `FMBGeometry.swift`, so no Swift twin is owed. *Decided 13/09/2026.*

  Checked rather than assumed: core's `ringSides().metres` is haversine
  (`ringPerimM`, R=6371000) while Swift's `boundarySideMetres` projects
  equirectangularly. At parcel scale the two agree to **~1.6 ppm** — 0.1 mm on a
  64 m side, orders of magnitude below what either head prints. Revisit only if
  a native screen begins computing side lengths for a user-traced ring.

- **Aadhaar vault (`api/operations.ts` → `LINK_AADHAAR_CARD_MUTATION`)** — the
  web and core now keep the full number only as vault ciphertext, show the last
  4 digits, retire the server reveals and link an opt-in kept card with
  `linkAadhaarCard`. No iOS behaviour changed: only a doc comment in
  `DocSpine.swift` (its example digits) and the `DocSpineTests.swift` fixture
  became synthetic. Reddy approved one more iOS source edit as a deviation
  from the design's "no iOS source change": an inert
  `Queries.linkAadhaarCard` twin of `LINK_AADHAAR_CARD_MUTATION`, with no
  caller, so the `operations.ts` twin check passes. Recorded here, each open
  for Reddy:
  - *Deviation:* iOS reads Aadhaar through the synchronous
    `POST /extract-aadhaar` route, not a durable async job with authenticated
    status polls. The server makes its failure shape safe (the "Nothing was
    saved." 503) but not durable. Moving iOS to `extract-aadhaar-async` plus
    `import-status` is a `sync-ios` follow-up and a decision for Reddy.
  - *Known divergence:* iOS has an on-device tap-to-reveal of the full number
    read from the user's own scan (`PattadarKit/Format/DocSpine.swift`
    `firstIdentityNumber`, used by `AllDetailsScreen.swift:108`; the
    `DocumentViewer.swift` reveal toggle, ~336–384). It conflicts with "show
    only the last 4 digits", though the full number never comes from the
    server. Retire it (removing the reveal, `firstIdentityNumber` and its
    `DocSpineTests`) or accept it as on-device only: a decision for Reddy.
  - *Follow-ups (`sync-ios`):* an iOS card opt-in with the safe
    `Aadhaar card.<ext>` name that calls the existing
    `Queries.linkAadhaarCard`; a `link_aadhaar_card` "Kept an Aadhaar card"
    label in `Display.swift`'s audit map.
  - *Follow-up (`mobile-feature-delivery`):* an Expo card opt-in with
    `linkAadhaarCard`. Expo's reveal/copy UI is already removed.
  - *Web-only, 03/10/2026 (iOS follow-up via `sync-ios`):* web now files a
    kept card in Documents under *person › Aadhaar* (family spec FM-009/010).
    The server does the filing, so an iOS caller of `Queries.linkAadhaarCard`
    gets it too. `linkAadhaarCard` takes optional `mimeType`/`sizeBytes`, but
    core's `LINK_AADHAAR_CARD_MUTATION` and its Swift twin are unchanged; web
    sends both from a web-local string. Still for iOS: show
    `VaultFolder.personId` and `Paper.aadhaarCard` (both `Query.web`, so NOTE
    only), and the Trash-on-remove step.

## Three bands of change

Not every web change has an iOS consequence, and pretending otherwise is how an
automation starts producing noise.

**ADAPT** — write Swift.
- `packages/core/**` — the shared rules.
- `services/api/src/main.py` — the **iOS-facing root schema**.
- `services/gateway/**` — auth and transport, which iOS uses identically.
- `apps/web/src/data/hooks.ts` — head of the GraphQL hand-copy chain.
- `apps/web/src/styles/tokens.css`, root `design.md` — but only the three
  crossing things, see below.

**NOTE** — record it in the report, write no code.
- `apps/web/src/w360/**` and `services/api/src/web360.py`. See the schema split.
- `docs/specs/**` — a spec is a decision to read, not a diff to port.

**IGNORE** — say nothing.
- `infra/**`, `tests/**`, `scripts/seed-*.py`, `.github/**`
- `apps/web/src/pages/landing/**`, `apps/web/src/styles/site.css` — marketing.
- `apps/mobile/**` — the older Expo head, out of scope here.

## The schema split — why most W360 work has nothing to mirror

`services/api/src/web360.py` mounts its own `Query.web` / `Mutation.web`
namespace, and says so in its docstring: `main.py` "is **the iOS-facing schema**
and is edited by a different workstream." `Networking/Queries.swift` contains
zero `web { … }` selections — iOS reads the root schema only.

So a W360 screen cannot be ported by writing SwiftUI. It needs a decision first:
lift the resolvers into the root schema, or teach iOS to read `Query.web`. That
is a product and architecture call.

**Never invent `Query.web` calls in Swift.** File the change as a NOTE naming the
capability and the reason, and move on. The accumulating notes in `docs/parity/`
are the evidence for making that decision later.

## The five triage buckets

Every changed hunk in an ADAPT path falls into one of these.

**1. Mirror exactly.** A `packages/core` rule with a `PattadarKit` twin. Port the
rule, add the case to `scripts/emit-vectors.ts`, and let `VectorTests` pin it.
A rule ported without a vector is a rule that will drift again.

**2. Mirror the API contract.** A root-schema change — new field, renamed field,
new enum case, changed nullability — reaches `Networking/Models.swift` and
`Networking/Queries.swift`. Remember what `Queries.swift` warns: *"A selection
set naming a field the schema does not have fails the WHOLE query, not just that
field."* Add fields against the schema, not against the database.

**3. Mirror the capability, natively.** A new user-facing ability on a web screen
that has an iOS twin gets built the platform way. Web's `navigateLink()` returns a
Google Maps directions URL (`https://www.google.com/maps/dir/?api=1&destination=…`)
because a browser has nothing better; iOS would open a map item or the Google Maps
app natively. Same capability, different mechanism, not vectored — porting the URL
builder to Swift would be the wrong answer. Since Reddy's decision of 03/10/2026
every web hand-off (corners, sides, the W04 whole-parcel item, the FMB viewer) is
Google Maps directions with coordinates only; the device-sniffed `mapsLink()` is
gone.

Open follow-ups, not yet built on the phones (owners: `sync-ios` for iOS,
`mobile-feature-delivery` for Expo). Reddy's rule that no record text rides in a
hand-off URL applies to each of them when built:

- iOS `apps/ios/Pattadar/Sources/FMBMapSection.swift` `openInMaps`
  (`maps://…&q=Corner N`) and `PattadarKit/Format/HoldingShare.swift` share text
  (`maps.apple.com…&q=`) still go to Apple Maps.
- Expo `apps/mobile/src/app/property/[id].tsx` ("View full map", "Open in Maps",
  share text — all `maps.apple.com` with the title in `q=`) and
  `apps/mobile/src/app/(tabs)/passbooks.tsx` (address search on `maps.apple.com`)
  do the same.
- Neither phone (iOS `SetLocationScreen.swift`, Expo) finds the survey under the
  device's position on the village map, as web W04 now does.

**4. Mirror the vocabulary.** Shared nouns and thresholds must agree. The doc
family labels in `records/docFamilies.ts` say it outright: *"The Swift twin is
`documentFamily` / `familyLabel` in `PattadarKit/Format/DocSpine.swift`. The two
must agree exactly."* Screen copy is **not** in this bucket —
`Storage/SharedSnapshot.swift` notes that "'Needs attention' is a label that can
be reworded." Contractual nouns cross; prose does not.

**5. Do not cross.** `apps/ios/design.md` is explicit, and it is quoted here in
full because it is the rule most likely to be broken by an agent working from a
web diff:

> The repository root's `design.md` is the **web** system. Its macrostructures are
> web routes (`/`, `/app/*`, `/privacy`), its components are MUI, and its type is
> one face, Atkinson Hyperlegible, served by `@fontsource`. None of that crosses
> to a phone.
>
> What crosses is the **brand**, and it is exactly three things:
>
> 1. **The amber accent**, at the same values — `#FE860F` dark, `#AA5910` light.
> 2. **The warm paper**, derived from the same OKLCH ramp.
> 3. **The serif register for records.**
>
> Everything else here is native and owes the web nothing. **Do not import web
> macrostructures.** A phone screen is not a landing page.

So: no MUI components, no CSS, no `w360.css`, no route structure, no hero
treatments, no web type scale. Note the word **derived** in (2) — `Palette.ground`
is not required to equal `--w-bg`, and today it does not. Only the accent and the
semantic danger / ok / warn slots are asserted.

## Stop and ask

Anything that implies a product decision iOS has not made — a new screen, a new
tab, a schema migration, a new table, a change to what the app promises the user
— is filed in the report as **NEEDS-FOUNDER** with the evidence, and is not
invented. An agent that guesses at product produces work that must be read line
by line before it can be trusted, which is worse than no work at all.

## What may be run, and what may not

**May run:**
- `cd apps/ios/PattadarKit && swift test` — pure logic, no Xcode project, no
  simulator, no device. This is the gate.
- `bun run scripts/emit-vectors.ts`, `bun run scripts/parity-check.ts`,
  `bun run typecheck`.

**Must never run unattended:** `apps/ios/verify.sh`. It boots a simulator, does a
signed device build, and **installs onto the founder's physical iPhone**. It also
needs `Xcode-beta` and a hardcoded device UDID. It stays founder-driven, on the
founder's schedule — a build is not a delivery, and neither is a background
agent's opinion of one.

Also never: `xcrun devicectl`, `xcrun simctl`, anything under `infra/`,
`terraform`, any AWS call, any deploy.

## Where the work lands

The `post-commit` hook never edits the founder's working tree. Each sweep runs in
a throwaway worktree and lands on a branch:

```
git log -p parity/ios-<short> -- apps/ios docs/parity   # read it
git merge --no-ff parity/ios-<short>                    # take it
git worktree remove … && git branch -D parity/ios-<short>   # drop it
```

Files the agent may write: `apps/ios/**`, `packages/core/vectors/**` (only as
regenerated output), `scripts/emit-vectors.ts` (only when a shared rule needs a
new vector source case), and `docs/parity/**`. Nothing else.
