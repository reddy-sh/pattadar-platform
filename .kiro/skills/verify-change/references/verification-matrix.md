# Verification Matrix

Verified against `.github/workflows/ci.yml`, `.github/workflows/nightly.yml`
and repository manifests on 2026-09-27. CI is authoritative when this file drifts.

## TypeScript/web/core

```sh
bun run typecheck
bun test packages/core apps/web/src apps/mobile/tests apps/university/src
set -euo pipefail
for script in scripts/*-tests.ts; do
  echo "── $script"
  bun run "$script"
done
bun run scripts/icon-guard.ts
bun run scripts/ux-guards.ts
bun run build
```

Choose the relevant subset for a focused change; the block above mirrors the CI
web job. Use `bun run build` for build-surface, routing, bundling, or dependency
changes—not for a documentation-only patch.

Any web UI or CSS change runs the whole `scripts/*-tests.ts` loop, not a
subset: `typography-tests.ts` (one face, weights, spelled stacks),
`shared-components-tests.ts` (the page-local component ratchet) and
`a11y-web-tests.ts` (names and colour literals) are only in that loop. A change
to fonts, weights, `.num`/`.mono`/`.eyebrow` or third-party CSS also runs
`tests/e2e-app/specs/26-one-font.spec.ts` in both projects, which reads what
the browser actually draws.

## Browser suites

| Behavior | Instrument | Notes |
|---|---|---|
| Fast UI states/routes/responsiveness | `tests/e2e-app` | Sealed; every `/api` call is intercepted. Never loosen the seal. Nightly, one shard of eight; not a merge gate. `phone` runs WebKit, so a machine needs both `chromium` and `webkit` installed. |
| Real API/DB wiring and mutations | default `tests/e2e-web360` | Requires a disposable PostgreSQL `TEST_PG_DSN`; starts its own API/bundle. |
| Boundary/portfolio/village maps | `tests/e2e-web360/maps.config.ts` | These specs are excluded from the default config. |
| Public capability/account-data fixture flow | `capabilities.config.ts` | Run only when that public surface changes. |
| Expo compatibility flows | `tests/e2e-mobile/*.yaml` | Maestro YAML, run by hand; `tests/e2e-mobile/README.md` is the runner and explains why no workflow runs them. |

Read `tests/e2e-app/AUTHORING.md` before adding sealed scenarios. Do not start
`e2e-app` servers itself; the suite expects the existing portal.

## Python services (CI)

```sh
.local/api-venv/bin/python -m pytest services/api/tests -q
.local/gateway-venv/bin/python -m pytest services/gateway/tests -q
.local/assistant-venv/bin/python -m pytest services/assistant/tests -q
.local/api-venv/bin/python -m pytest scripts/tests -q
```

CI runs the whole assistant directory, not a named subset. If a venv is
missing, report that rather than silently using a different interpreter or
dependency set. When the PostgreSQL-provisioning suites error at `initdb`,
read the harness map's shared-memory note before calling it a failure.

## iOS/parity (CI)

```sh
bun run scripts/emit-vectors.ts --check
bun run scripts/parity-check.ts <base>..<head>
(cd apps/ios/PattadarKit && swift test)
```

CI additionally installs xcodegen, generates `apps/ios/Pattadar.xcodeproj`, and
runs an unsigned generic iOS Simulator build. Run that broader check only when
project/build integration changed and the required Xcode tooling is available.
Never run `apps/ios/verify.sh` unattended.

## Terraform (CI)

```sh
terraform -chdir=infra/terraform fmt -check -recursive
for root in envs/dev/persistent envs/dev/runtime envs/prod/persistent envs/prod/runtime; do
  terraform -chdir="infra/terraform/$root" init -backend=false
  terraform -chdir="infra/terraform/$root" validate
done
```

`init -backend=false` avoids backend access but downloads providers and writes
`.terraform`. It is not a zero-side-effect check. Never substitute plan/apply
for validation without a separate approval boundary.

## Documentation/skills/workflows

- Check referenced paths and relative links.
- Parse JSON/YAML/frontmatter locally without executing documented commands.
- For Agent Skills, steering, hooks and evals, run
  `python3 scripts/validate-agent-governance.py`. It runs
  `validate-agent-skills.py --strict` and `validate-skill-evals.py`, then its own
  catalog, steering, hook and adapter checks. CI runs it as the first step of the
  web job.
- Use `git diff --check` for whitespace/conflict markers.
