---
name: web-next-cutover
description: Use this skill when bringing apps/web-next to parity with the active apps/web client, comparing repaired features, migrating routes/tests/contracts, reviewing Next.js readiness, changing WEB_ORIGIN, or planning an explicit safe cutover/removal of the deploy refusal.
compatibility: Requires both web clients, deploy workflow, contracts, and tests. Cutover/deployment remains blocked until reviewed parity evidence is complete.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
---

# Web-next Cutover

The active source of product truth is `apps/web`. `apps/web-next` is substantial
but staged; a successful Next build is not parity or permission to ship it.

## Workflow

1. Read `references/parity-matrix.md`; inventory active routes/capabilities and
   map each to a Next implementation, contract, security behavior, and test.
2. Compare identity, sharing/scoped recipient access, consent/account data,
   durable extraction, storage, payments, assistant, public/auth/legal routes,
   compatibility redirects, error/loading/empty states, and accessibility.
3. Preserve exact external/shipped URLs (including iOS payment links) and
   same-origin gateway behavior.
4. Replace removed legacy E2E coverage with retained sealed/disposable suites;
   do not restore obsolete `e2e-ux` by name without a deliberate harness design.
5. Produce a gap ledger and cutover plan: traffic topology, CloudFront/ALB
   origin, environment variables, rollback, cache/static assets, CI, release
   evidence, and removal of deploy refusal.
6. Cutover requires `security-review`, `verify-change`, `sync-ios` impact review,
   and `release-readiness` for an exact SHA.

Never flip `WEB_ORIGIN`, remove deploy guards, or deploy as part of analysis.
