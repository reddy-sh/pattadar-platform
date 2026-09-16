---
name: sync-ios
description: Use this skill when asked to sync/catch iOS up, adapt a web/core/root-schema/gateway change into native iOS, assess whether a commit/range affects the phone, or review Pattadar web–iOS parity before commit. Default to the working tree when no range is given.
compatibility: Requires pattadar-platform Bun parity scripts and Swift PattadarKit tooling. Never uses simulator/device/cloud/deployment commands.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
---

# Sync iOS

This is the Kiro on-demand counterpart to the post-commit parity automation.
The contract is authoritative; do not redesign the phone from a web diff.

## Workflow

1. Resolve the requested commit/range; empty means working tree.
2. Run or inspect `bun run scripts/parity-check.ts <range> --json` first.
3. Read `docs/specs/2026-08-22-web-ios-parity-contract.md`,
   `scripts/parity-map.json`, and `apps/ios/design.md`.
4. Classify every relevant hunk ADAPT / NOTE / IGNORE and into the contract's
   five buckets. Most W360/`Query.web` work correctly produces no Swift.
5. Port ADAPT work natively into the named twin, add PattadarKit tests, and
   regenerate vectors only when a shared rule genuinely crosses.
6. Verify with `swift test` in `apps/ios/PattadarKit`; clean root-anchored
   `.swiftpm`/`.build` artifacts afterwards. Write the parity report under
   `docs/parity/` when requested.

## Boundaries

Never run `apps/ios/verify.sh`, `xcrun devicectl`, `xcrun simctl`, deploy/cloud/
Terraform commands, or install on a device. Never invent `Query.web` calls,
screens, tabs, tables, or schema. The parity contract allows writes to `apps/ios/**`, regenerated
`packages/core/vectors/**`, `scripts/emit-vectors.ts` when the shared vector
source must change, and `docs/parity/**`. Do not write elsewhere.

## Report order

1. Adapted → Swift file/bucket.
2. Noted, not built → reason.
3. NEEDS-FOUNDER → evidence/options.
4. `swift test` and parity-check result.
