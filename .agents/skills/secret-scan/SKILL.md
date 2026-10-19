---
name: secret-scan
description: "Use this skill before staging, committing, pushing or opening a PR in pattadar-platform, and whenever config, env, key, credential, signing, Terraform variable or CI files change, to scan staged, unstaged, untracked and optionally historical content for leaked secrets without printing values. No npx or registry scanners without approval. Not for threat review (pattadar-security-review) or rotating a leaked credential (provider-activation)."
compatibility: Requires Git. Uses the installed Gitleaks CLI when available; confirm command shape with `gitleaks version`, `gitleaks git --help` and `gitleaks dir --help`.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-10-09"
---

# Secret Scan

Inspect locally and report only rule/key type and file:line—never echo a secret.
Never print content that may hold one: no `git diff`/`git show` patches, and
never `cat` or Read a suspected file. Do not install Gitleaks, run npx/registry
scanners, push, rewrite history, rotate credentials, or exfiltrate files
without explicit approval.

Run from the repository root so `.gitleaks.toml` (default rules plus an
allowlist for public `ap/markapuram/...` village-map ids) loads; elsewhere pass
`-c <root>/.gitleaks.toml`. Widening that allowlist is a security change
(`pattadar-security-review`).

## Workflow

1. List scope by name only, separately:
   - staged: `git diff --cached --name-only`;
   - unstaged: `git diff --name-only`;
   - untracked: `git ls-files --others --exclude-standard`;
   - history: Git commits, only when requested or before a release.
2. If Gitleaks is installed, run `gitleaks version` and confirm flags with
   `gitleaks git --help` and `gitleaks dir --help`; use only what the installed
   version shows:
   - staged: `gitleaks git --pre-commit --staged --redact -v --no-banner .`;
   - unstaged: `gitleaks git --pre-commit --redact -v --no-banner .`;
   - untracked files that could be committed:
     `git ls-files -z --others --exclude-standard | xargs -0 -r -n1 gitleaks dir --redact -v --no-banner -c .gitleaks.toml`;
   - history: `gitleaks git --redact -v --no-banner .`.
   Without `-v` Gitleaks prints only a count. Do not run `gitleaks dir .` on the
   tree: it reads gitignored local keys (`.local/`, tfvars) and worktrees; if
   used, report ignored-path hits (`git check-ignore -q`) separately as expected
   local material. `gitleaks stdin` is a last resort: it flags removed lines and
   gives no file:line. Binaries are covered only by the name check in step 4.
3. If Gitleaks is unavailable, search without printing values (path:line only):
   `git grep --cached -I -n -E -e '<pattern>' | cut -d: -f1,2` (staged) and
   `git grep --untracked -I -n -E -e '<pattern>' | cut -d: -f1,2` (working tree
   plus untracked), for `-----BEGIN [A-Z ]*PRIVATE KEY`, `AKIA[0-9A-Z]{16}`,
   `(ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{36}|github_pat_`, `sk-ant-`,
   `Bearer [A-Za-z0-9._~+/=-]{20,}`, and, with `-i`, the noisy
   `(password|passwd|secret|api_?key|token)[a-z0-9_]*.?[[:space:]]*[:=]`. Label each hit
   with its pattern. Do not claim this fallback is equivalent to Gitleaks.
4. Check staged and untracked names for `.env*` (except `.env.example`),
   `.local/**`, `*.pem`, `*-key.env`, `*.tfvars`, `*.p8`, `*.p12`,
   `*.mobileprovision`, cloud credentials, and private keys.
5. Report findings redacted, with the coverage used and any scope not scanned.
6. Stop on any finding in staged, unstaged or about-to-be-staged content, or on
   a scope that could not be scanned: do not stage, commit, push or open a PR;
   present the redacted findings and coverage and wait for Reddy. If a real
   secret entered history, treat it as compromised: rotation first
   (`provider-activation`), then a separately approved history-purge plan.

## Repository-specific rules

`.gitignore` excludes `.env`, `.env.*` (except `.env.example`), `.local/`, and
`*.tfvars`; force-adding them is a finding. `*.p8`, `*.p12`, `*.mobileprovision`
and `*.pem` are ignored only under `apps/mobile`, so elsewhere (e.g. `apps/ios`)
only step 4 catches them. Known local key material under `.local/` must never be
staged. No local hook scans before a push: `.githooks` has only `post-commit`, and CI
runs `gitleaks/gitleaks-action` (pinned to a commit SHA, tagged v2) only after
commits reach GitHub. Never assume legacy `protect`/`detect` commands exist.
