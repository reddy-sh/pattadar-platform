# Dependency Ecosystem Map

| Ecosystem | Sources and pin sites | Coupled validation |
|---|---|---|
| Bun/web/mobile | root/workspace `package.json`, `bun.lock`; Bun itself at root `package.json` `packageManager` and every `bun-version:` in `.github/workflows/*.yml` (bump all together) | `bun install --frozen-lockfile`, as CI runs it (registry access, writes `node_modules`: show it and wait), typecheck, tests, builds |
| Expo native | `apps/mobile/package.json` | its `build` script is an echo (EAS builds it, CI does not), so nothing here compiles native code; route native module changes to `mobile-feature-delivery` |
| Python services | `services/*/requirements*.txt` (a mix of `==` pins and `>=` ranges), `services/*/Dockerfile`; Python in `FROM python:3.13-slim` and the `ci.yml` `backend` job's `python-version` | affected pytest suite + the Container base row |
| Anthropic | assistant `claude-agent-sdk==0.2.163`; gateway `anthropic>=0.40` (floating); api raw `httpx` in `services/api/src/ai_reading/providers/anthropic.py`. The assistant's `model_catalog.py` fallback imports `anthropic`, which its requirements do not declare | owning service tests, `docs/architecture/ai-inventory.yaml` in the same change, `python scripts/ai-boundary-guard.py --selftest` then the plain check; companions `assistant-quality`, `provider-activation`, `pattadar-security-review`, `release-readiness`. A new model, provider, prompt-behaviour or retry change is reserved: stop and ask Reddy (`docs/architecture/ai-system.md`) |
| Swift | `apps/ios/PattadarKit/Package.swift` (`swift-tools-version`, platforms), `apps/ios/project.yml` `deploymentTarget`; Xcode comes unpinned from the `macos-15` CI runner | `swift test`, parity, optional simulator build |
| Terraform | `required_providers` in `envs/*/*/main.tf` and `modules/*/versions.tf`. `.terraform.lock.hcl` is gitignored, so the constraint is the only committed pin and CI resolves providers fresh each run; committing lock files is Reddy's decision | `terraform fmt -check -recursive` in `infra/terraform`. Report validate NOT_RUN with CI's `terraform-validate` matrix (every root in `ci.yml`, currently five) as the gate. Run `terraform -chdir=infra/terraform/<root> init -backend=false && terraform -chdir=infra/terraform/<root> validate` only after showing the root, command, provider download and `.terraform` writes and getting approval; never init without `-backend=false`; plan only with approval |
| GitHub Actions | `.github/workflows/*.yml`, pinned by commit SHA with a `# vN` comment | action SHA/version review, workflow syntax |
| Container base | `services/{api,gateway,assistant}/Dockerfile` (`python:3.13-slim`) | CI builds no images; the only build is the post-merge `deploy.yml` (QEMU arm64, `buildx --push`). Locally, after stating image pulls and disk use and getting approval: `docker buildx build --platform linux/arm64 services/<svc>` with no `--push`, plus an import smoke test; otherwise report NOT_RUN |

## Repo dependency automation

- `.github/dependabot.yml` opens weekly PRs for github-actions and npm at the
  root, pip in `services/{api,gateway,assistant}`, and docker for those three
  Dockerfiles.
- `ci.yml` `dependency-scan` runs osv-scanner v1.9.2 with `continue-on-error`,
  so it is advisory: green CI does not mean no known vulnerabilities. Read its
  table for the changed package. It scans `bun.lock` and the three
  `requirements.txt` files, not `services/assistant/requirements-semantic.txt`.
- A new manifest or service needs an entry in `dependabot.yml` and in the osv
  `--lockfile` list.

## Review prompts

- Is the version exact or a range, and is that intentional?
- Does Docker install from the same manifest/lock graph?
- Does the package support ARM64 and current Node/Python/Swift/Terraform?
- Are there duplicate libraries already solving the problem?
- Does it add native code, postinstall scripts, network calls, telemetry, or a
  new trust boundary?
- Which CI jobs and release artifacts change?
