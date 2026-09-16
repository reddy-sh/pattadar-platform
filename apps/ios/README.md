# Pattadar — native iOS

The maintained iOS client is native Swift/SwiftUI in this directory. The active
web client is `apps/web`. `apps/mobile` remains the Expo client for Android
and compatibility work; its features are retained, with production Bearer
transport. An Android release owner and release cadence still need assignment.
`apps/web-next` is an older parallel implementation, not the active web entry.

Most native screens use the root GraphQL schema. The existing Services screen
also reads the canonical `web` catalogue/order namespace, as authorized by the
September 2026 repair request; other W360 screen migrations remain governed by
`docs/specs/2026-08-22-web-ios-parity-contract.md`.

## Layout

| | |
|---|---|
| `PattadarKit/` | Domain + networking, as a Swift package. Testable from the CLI with no simulator. |
| `Pattadar/Sources/` | The SwiftUI app. |
| `project.yml` | XcodeGen spec — the `.xcodeproj` is generated, never committed. |

## Build

```sh
brew install xcodegen        # once
cd apps/ios && xcodegen generate
open Pattadar.xcodeproj
```

Without XcodeGen: create an iOS App target in Xcode, add `PattadarKit` as a
local package dependency, and point it at `Pattadar/Sources`.

Environment variables `PATTADAR_API_URL` and `PATTADAR_USER` override bundled
settings for development. The bundle targets the production gateway; local
schemes may target `http://127.0.0.1:8080`. Production signs in with Cognito.
Local data is scoped by token issuer and immutable subject; the gateway alone
resolves an approved legacy owner mapping.

## Safe local verification

```sh
swift test --package-path apps/ios/PattadarKit
xcodebuild -project apps/ios/Pattadar.xcodeproj -scheme Pattadar \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/pattadar-build CODE_SIGNING_ALLOWED=NO build
```

Run these from the repository root after generating the Xcode project. They do
not install onto a device or boot a simulator. `verify.sh` is founder-driven:
it also performs signed builds and installs onto a physical iPhone.

## Widgets — one Xcode sign-in away

`PattadarWidget/` ships three widgets and a Control Centre control:

| | Families | Shows |
|---|---|---|
| **Your land** | small, medium, large, inline, rectangular | Total acres, then each kind in its own unit |
| **Needs attention** | small, medium, circular, rectangular | Record-ready %, and the holdings failing a check |
| **A holding** | small, medium, rectangular | One survey number you pick, with its verdict |
| **File a paper** | Control Centre, Lock Screen | Opens the camera on a locked phone |

They read `SharedSnapshot` from the App Group and never fetch: an extension has
no credentials and a fraction of a second to draw. The app writes the snapshot
at the end of every `HomeScreen.load()`, so whatever is not in
`LandSnapshot.build` cannot appear on the Home Screen.

**Device builds need an Apple ID in Xcode** (Settings → Accounts). The App Group
`group.com.rfactory.pattadar` and the App ID `com.rfactory.pattadar.widget` do
not exist on the account yet, and automatic signing cannot create them without
one — `xcodebuild` fails with *"No Accounts: Add a new account in Accounts
settings"*. Simulator builds are unaffected, because entitlements there are
simulated.

To defer instead: comment out the `PattadarWidgetExtension` dependency and both
`CODE_SIGN_ENTITLEMENTS` lines in `project.yml`, and regenerate. The widgets
stop shipping; nothing else changes.

## Tests

```sh
cd apps/ios/PattadarKit && swift test
```

Default tests do not call a live API. Set `PATTADAR_LIVE_API_TESTS=1` only with
a disposable local database for live schema/CRUD tests. The separate real-deed
upload test additionally requires `PATTADAR_LIVE_UPLOAD_TESTS=1`; it reads a
local fixture and may call a paid extraction provider. Pure tests and shared
vectors remain the default gate.

## The rule that matters: land arithmetic may not drift

`packages/core` is the single definition of what an extent means, whether a pin
is plausible, and how a deed's area string is read. Three heads import it
directly. **Swift cannot**, so those rules exist twice here — and two
implementations of land arithmetic drift unless something forces them not to.

They have already drifted inside a single language: one screen converted extents
through `toAcres` and another wrote the raw number, so a scanned "40 Guntas"
would have been filed as forty ACRES. Across a language boundary the same
mistake is invisible until someone's holding is overstated by a factor of forty.

So the rules are pinned by generated vectors:

```sh
bun run scripts/emit-vectors.ts     # regenerate after ANY change to packages/core/src/land
cd apps/ios/PattadarKit && swift test
```

`packages/core/vectors/*.json` is the contract. The Swift tests read it through
a symlink, so there is exactly one copy. Change a rule in TypeScript without
porting it and `swift test` fails, naming the case:

```
label "Acres-Guntas" resolved to gunta, TypeScript says acre
```

That is the whole point. Do not "fix" a failure by editing the vectors — decide
which implementation is right, change that, and regenerate.

## Implemented capabilities and remaining decisions

The app includes holdings, papers and scanning, maps and boundaries, family
and groups, Cognito sign-in, service requests, a live service catalogue and
server-confirmed orders, offline filing, and widgets. The native Services
screen supports ordering an EC and survey together, keeps each confirmed
result when another fails, and uses stable idempotency keys for retries.

Real payment collection, worker-operated fulfillment, broader W360 screen
parity and the Android shipping plan still require the corresponding product
and integration work; the native screen does not report those as completed.

Pending reads and review entries are isolated by account. Signing out clears
widgets and on-screen records, invalidates delayed responses, and preserves
owned queued work for its original principal. Old offline filings with an
explicit owner migrate only after a live authenticated `me.id` establishes the
server-approved ownership mapping. Old **ownerless** `pending-reviews.json` and
`pattadar.pendingRead` data are preserved but quarantined: a mutable last-user
setting cannot establish their original owner. Recovery must establish that
owner explicitly; signing in as somebody else never adopts those scans.
