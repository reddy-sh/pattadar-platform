# Verification Matrix

Verified against `.github/workflows/ci.yml`, `.github/workflows/nightly.yml`
and repository manifests on 09/10/2026. CI is authoritative when this file drifts.

`ci.yml` runs on every pull request and push to `main`: `web`, `backend`
(pytest, the AI boundary guard, then `tests/e2e-web360` default and maps
configs), `ios`, `terraform-fmt`, `terraform-validate` (one job per root),
`secrets-scan`, and `dependency-scan` (advisory, `continue-on-error`).
`nightly.yml` adds one `tests/e2e-app` shard. Which jobs are required to merge
is a GitHub setting, not in the repo; do not claim it.

## TypeScript/web/core

```sh
bun run typecheck
bun test packages/core packages/tokens apps/web/src apps/mobile/tests apps/university/src
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
changes—not for a documentation-only patch. After a `package.json` or `bun.lock`
change, first run `bun install --frozen-lockfile` (it downloads packages and
writes `node_modules`; say so): CI's `web`, `backend` and `ios` jobs run it.

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
| Fast UI states/routes/responsiveness | `tests/e2e-app` | Sealed only in the `app` and `phone` projects (`cd tests/e2e-app && bun run test`; every `/api` call is intercepted). The `live` project (`bun run test:live`, or a bare `playwright test`) is unsealed: it mints a real token from the local gateway and reads founder data, so it needs explicit approval. Never loosen the seal. Nightly, one shard of eight; not in `ci.yml`. `phone` runs WebKit, so a machine needs both `chromium` and `webkit` installed. |
| Real API/DB wiring and mutations | default `tests/e2e-web360` | Requires a disposable PostgreSQL `TEST_PG_DSN`; starts its own API/bundle. |
| Boundary/portfolio/village maps | `tests/e2e-web360/maps.config.ts` | These specs are excluded from the default config. |
| Public capability/account-data fixture flow | `tests/e2e-web360/capabilities.config.ts` | Run only when that public surface changes. |
| Expo compatibility flows | `tests/e2e-mobile/*.yaml` | Maestro, run by a human only, with approval: `tests/e2e-mobile/README.md` boots a simulator through `scripts/start-mobile.sh` (`xcrun simctl`) and needs a signed-in account on a real backend. Otherwise report NOT_RUN. |

Read `tests/e2e-app/AUTHORING.md` before adding sealed scenarios. Do not start
`e2e-app` servers itself; the suite expects the existing portal.

## Python services (CI)

```sh
.local/api-venv/bin/python -m pytest services/api/tests -q
.local/gateway-venv/bin/python -m pytest services/gateway/tests -q
.local/assistant-venv/bin/python -m pytest services/assistant/tests -q
.local/api-venv/bin/python scripts/ai-boundary-guard.py --selftest
.local/api-venv/bin/python scripts/ai-boundary-guard.py
.local/api-venv/bin/python -m pytest scripts/tests -q
```

CI runs the whole assistant directory, not a named subset. If a venv is
missing, report that rather than silently using a different interpreter or
dependency set. A new model, provider, prompt-behaviour or client-retry change
also updates `docs/architecture/ai-inventory.yaml` in the same change and is a
reserved decision (`docs/architecture/ai-system.md`): present the evidence and
wait for Reddy.

Without a database, DB suites skip rather than fail: the ones that provision
PostgreSQL skip when `initdb`/`pg_ctl` are missing or the user is root. The `TEST_PG_DSN` ones, when
it is unset, fall back to the local stack's server (`localhost:5432`, user
`rhub`, database `postgres`) and create throwaway schemas there; they skip only
when it is unreachable, so say so before running them. List them with
`grep -rlE 'pytest\.skip\(.*(postgres|PostgreSQL|TEST_PG_DSN|initdb)|test_(invitation_security|payments) import' services/*/tests`
(the last pattern catches suites that borrow another file's fixture).
Skipped DB tests are BLOCKED, not PASS. On macOS, prefix pytest with
`LC_ALL=C`, or the ephemeral clusters fail to start. An `initdb` error after
that is usually orphaned shared memory: see the shared-memory note in
`.claude/skills/test-governance/references/harness-map.md`.

## iOS/parity (CI)

```sh
bun run scripts/emit-vectors.ts --check
bun run scripts/parity-check.ts   # working tree vs HEAD; CI passes <base>..<head>
(cd apps/ios/PattadarKit && swift test)
```

CI additionally installs xcodegen, generates `apps/ios/Pattadar.xcodeproj`, and
runs an unsigned generic iOS Simulator build. Run that broader check only when
project/build integration changed and the required Xcode tooling is available.
When SF Symbol names change, run `apps/ios/check-symbols.sh` (macOS, not in CI),
then delete the `/tmp/pattadar-symbols.txt` and `/tmp/pattadar-symcheck.swift`
it writes. Never run `apps/ios/verify.sh`: it installs a signed build on a
physical iPhone and a simulator. Reddy runs it; report device delivery NOT_RUN.

## Docker images (not in CI)

CI builds no images. The first `linux/arm64` build is `deploy.yml`, after merge
to `main`, and it pushes to ECR. For a Dockerfile, base-image or Python
requirement change, and only with approval (it pulls base images and packages
and uses disk):

```sh
docker buildx build --platform linux/arm64 services/<api|gateway|assistant>
```

Never add `--push`. Without approval report it NOT_RUN.

## Terraform (CI)

```sh
terraform -chdir=infra/terraform fmt -check -recursive
```

That is the only Terraform check to run without approval. `init` needs it
(`.claude/rules/pattadar-safety.md`): first show the roots, this exact loop,
the provider downloads and the `.terraform` writes, then wait for Reddy. Every
env root declares an S3 backend, so never drop `-backend=false`.

```sh
for root in $(cd infra/terraform && find envs -mindepth 2 -maxdepth 2 -type d); do
  terraform -chdir="infra/terraform/$root" init -backend=false
  terraform -chdir="infra/terraform/$root" validate
done
```

The loop covers the same five roots as CI's `terraform-validate` matrix,
including `envs/prod/university`. Without approval report validate NOT_RUN;
CI is the gate. Plan/apply are never validation.

## Documentation/skills/workflows

- Check referenced paths and relative links.
- Parse JSON/YAML/frontmatter locally without executing documented commands.
- For Agent Skills, steering, hooks and evals, run
  `python3 scripts/validate-agent-governance.py`. It runs
  `validate-agent-skills.py --strict` and `validate-skill-evals.py`, then its own
  catalog, steering, hook and orphan-reference checks, over `.kiro` only. CI runs
  it as the first step of the web job. It never reads `.claude`, and the Kiro
  hook does not run under Claude Code: for the `.claude` copy follow the two-trees
  step in `agent-skill-maintenance`.
- Use `git diff --check HEAD` for whitespace/conflict markers in tracked files.
  Untracked files, including all of `.claude`, need
  `git ls-files -o --exclude-standard -z | xargs -0 grep -nIE '[[:blank:]]$|^(<<<<<<<|>>>>>>>)( |$)'`.
