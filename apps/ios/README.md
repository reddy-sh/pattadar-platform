# Pattadar — native iOS

Swift/SwiftUI client against the **same backend** as the React Native app and
both web heads. Nothing server-side changes for it.

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

The app reads `PATTADAR_API_URL` and `PATTADAR_USER` from the environment,
defaulting to `http://127.0.0.1:8080` and `u01` — the simulator reaches the
Mac directly; a device needs the ngrok tunnel.

## Before you say it works

```sh
./verify.sh
```

Builds the iPhone simulator, the iPad simulator AND the physical phone, and
runs the package tests. A green simulator says nothing about whether the app
can be SIGNED for a device — that was reported as ready twice while the device
build failed on six signing errors.

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

Live-API tests skip themselves when nothing answers on :8080, so the suite stays
green without a backend running.

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

## What is NOT here yet

Everything except the holdings list: documents and the AI summary screen, the
map/location picker, family and estate allocation, sign-in, the passbook and
deed scanning flows. The RN app remains the shipping client.
