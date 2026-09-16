---
name: secret-scan
description: Use this skill before staging, committing, pushing, or opening a PR in pattadar-platform, and whenever config, environment, key, credential, Terraform variable, or CI files change, to check staged, unstaged, untracked, and optionally historical content for leaked secrets without printing secret values.
compatibility: Requires Git. Uses the installed Gitleaks CLI when available; command shape must be confirmed with `gitleaks version` and `gitleaks help`.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
---

# Secret Scan

Inspect locally and report only key name/type and location—never echo a secret.
Do not install Gitleaks, push, rewrite history, rotate credentials, or exfiltrate
files without explicit approval.

## Workflow

1. Determine scope separately:
   - staged: `git diff --cached --binary`;
   - unstaged: `git diff --binary`;
   - untracked: `git ls-files --others --exclude-standard`;
   - history: Git commits, only when requested or before a release.
2. If Gitleaks is installed, first run `gitleaks version` and `gitleaks help`.
   Current upstream CLI exposes `git`, `dir`, and `stdin`; use only commands
   shown by the installed version:
   - history/repository: `gitleaks git --redact .`;
   - working directory (includes untracked files in scope):
     `gitleaks dir --redact .`;
   - staged patch: pipe `git diff --cached --binary` to
     `gitleaks stdin --redact` when supported.
3. If Gitleaks is unavailable, inspect all three local scopes above manually.
   Look for private-key blocks, AWS keys, provider tokens, bearer tokens,
   passwords, and suspicious long encoded blobs. Do not claim this fallback is
   equivalent to Gitleaks.
4. Check staged filenames for `.env*` (except `.env.example`), `.local/**`,
   `*.pem`, `*-key.env`, `*.tfvars`, cloud credentials, and private keys.
5. Report findings with value redacted and explain coverage used. If a real
   secret entered history, treat it as compromised: recommend rotation first,
   then a separately approved history-purge plan.

## Repository-specific rules

`.gitignore` excludes `.env`, `.local/`, and `*.tfvars`; force-adding them is a
finding. Known local key material under `.local/` must never be staged. CI uses
`gitleaks/gitleaks-action@v2`, but that action does not define the local CLI
version—never assume legacy `protect`/`detect` commands exist.
