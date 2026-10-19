---
name: sync-ios
description: "Use this skill to sync or catch up the native iOS app (apps/ios): adapt a web/core/root-schema/gateway change into Swift, assess whether a commit or range affects iOS, review web–iOS parity before commit, or read the parity/ios-* sweep branches. Not for native-first iOS features with no web source (apps/ios/design.md governs) or the Expo/Android client in apps/mobile (mobile-feature-delivery)."
compatibility: Requires pattadar-platform Bun parity scripts and Swift PattadarKit tooling. Never uses simulator/device/cloud/deployment commands.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-10-09"
---

# Sync iOS

This is the on-demand counterpart to the post-commit parity automation
(`.githooks/post-commit` → `scripts/ios-parity-sync.sh`, which lands each sweep
on a `parity/ios-<short>` branch). Port web changes into the native app; do not
redesign it from a web diff.

Not this skill: token or type decisions (`design-system-governance`) or API
contract design (`backend-contract-change`); native-first iOS features with no
web source have no owning skill yet.

`scripts/parity-map.json`, read by `scripts/parity-check.ts` and run in CI,
decides bands, twins and asserted token roles. The contract
(`docs/specs/2026-08-22-web-ios-parity-contract.md`) gives the buckets and the
reasons. Where they disagree (the contract asserts 4 token roles, the map 8),
follow the map and report the drift for runbook-consistency.

## Workflow

1. Catch up first. List `git branch --list 'parity/ios-*'` (unreviewed:
   `--no-merged main`), `.parity/queue` and `.parity/ledger.jsonl`. Report
   unreviewed sweeps first. Never re-port a SHA that already has a branch or
   ledger entry; read it with `git log -p parity/ios-<short> -- apps/ios docs/parity`
   instead. A branch whose tip is still its own SHA is an interrupted sweep (it
   lists as merged when that SHA is on main): report it, do not delete it. If
   `.parity/lock/pid` names a dead process the automation is wedged (every
   commit only queues): report it; do not break the lock or run the sweeper,
   because each sweep spends model budget.
2. Resolve the range: the one asked for, else each queued SHA on its own diff,
   then the working tree.
3. Run `bun run scripts/parity-check.ts <range> --json` (no range = working
   tree vs HEAD).
4. Read the contract, `scripts/parity-map.json` and `apps/ios/design.md`.
5. Take each file's band (ADAPT / NOTE / IGNORE) from parity-check. Sort only
   ADAPT hunks into the contract's five buckets; NOTE gets a report line and no
   Swift. Exception: the native Services screen (`ServicesScreen.swift`) uses
   `Query.web` and `Mutation.web` through `Queries.nativeServices` (`servicesOffered`,
   `properties { cards }`, `orders`) and `Mutations.nativeOrderService`
   (`orderService`), so a `web360.py` change to those is bucket 2 for iOS.
   Before calling any `web360.py` hunk NOTE, run
   `grep -n 'web {' apps/ios/PattadarKit/Sources/PattadarKit/Networking/Queries.swift`.
6. Before writing, run `git status --porcelain -- apps/ios packages/core/vectors`.
   If a target file is already modified, or another session owns `apps/ios`, do
   not edit in place: report a proposed patch, or work on `parity/ios-<short>`
   in a throwaway worktree as the sweeper does. Never stage `apps/ios` wholesale.
7. Port ADAPT work natively into the twin `parity-map.json` names, with a
   PattadarKit test. A bucket-1 rule also gets a `scripts/emit-vectors.ts` case
   and regenerated vectors (`bun run scripts/emit-vectors.ts`).
8. Verify with `swift test` in `apps/ios/PattadarKit` and re-run parity-check.
   Remove `apps/ios/PattadarKit/.swiftpm` and `apps/ios/PattadarKit/.build`
   only if this run created them (always, in a throwaway worktree). Write
   `docs/parity/<short>.md` when requested.

## Boundaries

Never run `apps/ios/verify.sh`, `xcrun devicectl`, `xcrun simctl`, deploy/cloud/
Terraform commands, or install on a device. Never add `Query.web`/`Mutation.web` calls
beyond the Services exception, or invent screens, tabs, tables, or schema. The parity
contract allows writes to `apps/ios/**`, regenerated
`packages/core/vectors/**`, `scripts/emit-vectors.ts` when the shared vector
source must change, and `docs/parity/**`. Do not write elsewhere. An Expo twin
of an ADAPT change is a hand-off to mobile-feature-delivery, not work here.

## Report order

1. Backlog: unreviewed sweep branches, queued SHAs, lock state.
2. Adapted → Swift file, bucket, test.
3. Noted, not built → reason.
4. NEEDS-FOUNDER → evidence, recommendation, alternatives, tradeoffs, rollback,
   and the exact approval Reddy must give.
5. Expo follow-ups → mobile-feature-delivery.
6. `swift test` and parity-check results, what was not verified, and any
   cache, branch or worktree left behind.
