---
name: backend-contract-change
description: Use this skill when planning or implementing a Pattadar API, GraphQL, gateway, auth, storage, sharing, assistant, cron, or service-to-service contract change—including new fields, mutations, routes, identity behavior, S3 operations, and async jobs.
compatibility: Requires pattadar-platform service source and tests. Local edits/tests are allowed; production database, cloud, or deployment operations are not.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
---

# Backend Contract Change

Trace the whole contract before editing. A working resolver is incomplete if a
caller, proxy, model, rollout compatibility rule, or native contract is missed.

## Workflow

1. Read `references/contract-map.md` and classify the entry point/consumer.
2. Trace caller → operation/hook → gateway route/proxy → owning service → data
   model/bootstrap → tests. Identify web, mobile, iOS, and internal consumers.
3. Preserve trust boundaries and backward compatibility. Schema/bootstrap DDL
   is additive unless a separately reviewed migration exists; old/new tasks may
   coexist during rollout.
4. For AI readings preserve durable async jobs, authenticated polling, and no
   automatic provider retry. For storage preserve owner authorization, scan
   gates, and verbatim `{owner}/{node}/{version}` keys.
5. Add the narrowest contract tests and update generated/shared vectors only
   when the contract genuinely crosses platforms.
6. Hand final checks to `verify-change`, security analysis to `security-review`,
   and live/backfill operations to `safe-data-migration`.

## Stop conditions

Stop and ask before exposing API directly, adding `Query.web` to iOS, changing
identity/owner keys, making destructive DDL, weakening token/share scope, or
creating a new product promise/schema not present in an approved design.
