---
name: sync-ios
description: Thin Claude adapter for the canonical Pattadar iOS parity skill. Use for /sync-ios, catching iOS up, checking whether a web/core/API/gateway change affects the phone, or reviewing a commit/range before merge.
---

# Sync iOS — Claude adapter

The canonical workflow is `.kiro/skills/sync-ios/SKILL.md`. Read and follow it,
then read `docs/specs/2026-08-22-web-ios-parity-contract.md` and
`apps/ios/design.md`. Treat `$ARGUMENTS` as the optional commit/range; empty means
the working tree.

Do not duplicate or override the canonical procedure here. In particular, never
run `apps/ios/verify.sh`, `xcrun devicectl`, `xcrun simctl`, Terraform, AWS, or
deployment commands, and never invent `Query.web` Swift calls or product
screens. Report ADAPT / NOTE / IGNORE, NEEDS-FOUNDER, and `swift test` evidence
in the canonical order.
