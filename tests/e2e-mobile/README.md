# tests/e2e-mobile — three Maestro flows, run by hand

Compatibility-client smoke flows for `apps/mobile` (Expo). They are **not run by
any workflow and not gated**, and the reason is below rather than left implied.

| flow | what it drives |
|---|---|
| `01_app_launch.yaml` | the app launches and reaches the signed-in dashboard (`Namaste`) |
| `02_tabs_navigation.yaml` | all five tabs — Passbooks, Holdings, Family, More, Home |
| `03_account_flow.yaml` | the account sheet opens from the avatar and closes again |

## Running them

Three things have to be true first, and none of them is a file in this repo.

1. **The `maestro` binary**, installed per [Maestro's own install
   instructions](https://docs.maestro.dev/getting-started/installing-maestro).
   It is a JVM tool with its own release channel; nothing in `bun.lock` pins it,
   so the version you get is the version you installed.
2. **A booted simulator or emulator** with the app installed. `launchApp` needs
   an installed bundle, not a Metro URL.
3. **`APP_ID`** — every flow opens with `appId: ${APP_ID}`, so the id is the
   caller's decision, and the right value depends on how the app got onto the
   device:

   | how the app is installed | `APP_ID` |
   |---|---|
   | a development or EAS build of `apps/mobile` | `com.pattadar.app` (`apps/mobile/app.json`) |
   | Expo Go | `host.exp.Exponent` — Maestro then drives Expo Go, not Pattadar |

Then, from the repository root:

```sh
./scripts/start-mobile.sh ios            # or: android
APP_ID=com.pattadar.app maestro test tests/e2e-mobile
```

`maestro test` on the directory runs all three in filename order. One flow at a
time is `maestro test tests/e2e-mobile/01_app_launch.yaml`.

## Why there is no CI job

- **No runner has the device.** `ubuntu-latest` has no iOS simulator, and
  booting an Android emulator there needs nested virtualisation plus several
  minutes per run. `macos-15` has simulators but is billed at ten times the
  Linux rate, which makes this the most expensive job in the repository for the
  smallest assertion count in it.
- **There is nothing to install yet.** `apps/mobile` has no `eas.json` and no
  checked-in `ios/`/`android/` project, so a workflow would have to
  `expo prebuild` and build a native app before Maestro had a bundle to launch —
  minutes of work, a signing decision, and a build path nothing else in CI
  exercises.
- **The flows assume a signed-in account with data.** `01_app_launch.yaml` waits
  for `Namaste` and `02_tabs_navigation.yaml` for populated tab headings. There
  is no sealed fixture layer here as there is in `tests/e2e-app`, so a green run
  needs a real session against a real backend.

Standing this up is a CI-minutes and mobile-credentials decision, not a
refactor. It belongs to the repository owner.

## Why there is no `package.json` here

`tests/*` is a workspace glob in the root `package.json`, so a `package.json` in
this directory becomes a Bun workspace member — and `bun.lock` records the
workspace set. Adding one and running `bun install --frozen-lockfile` gives:

```
error: lockfile had changes, but lockfile is frozen
```

That is the first step of all four CI jobs, so a convenience script here would
break `ci.yml` and `nightly.yml` outright until `bun.lock` was regenerated and
committed. The two commands above need no package manifest, so this file is the
runner.

If a scripted runner is wanted later, regenerating `bun.lock` alongside it is the
owner's call — `--frozen-lockfile` exists precisely so that an unreviewed
lockfile change cannot ride along with a test helper.
