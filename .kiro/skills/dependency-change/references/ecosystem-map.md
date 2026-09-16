# Dependency Ecosystem Map

| Ecosystem | Sources | Coupled validation |
|---|---|---|
| Bun/web/mobile | root/workspace `package.json`, `bun.lock`, Dockerfiles | frozen install, typecheck, tests, builds |
| Python services | `services/*/requirements*.txt`, Dockerfiles, local venvs | affected pytest suite + image import/build |
| Swift | `apps/ios/PattadarKit/Package.swift`, toolchain/XcodeGen files | `swift test`, parity, optional simulator build |
| Terraform | env/module `versions.tf`, provider locks | fmt, four-root init/validate; plan only with approval |
| GitHub Actions | `.github/workflows/*.yml` | action SHA/version review, workflow syntax |
| Container base | service/web Dockerfiles | architecture (`linux/arm64`), runtime, image build |

## Review prompts

- Is the version exact or a range, and is that intentional?
- Does Docker install from the same manifest/lock graph?
- Does the package support ARM64 and current Node/Python/Swift/Terraform?
- Are there duplicate libraries already solving the problem?
- Does it add native code, postinstall scripts, network calls, telemetry, or a
  new trust boundary?
- Which CI jobs and release artifacts change?
