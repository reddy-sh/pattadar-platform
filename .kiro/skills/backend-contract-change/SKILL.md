---
name: backend-contract-change
description: "Use this skill when planning, designing or implementing a Pattadar API, GraphQL (root or `Query.web`), gateway, auth, storage, sharing, assistant route/SSE, cron or service-to-service contract change (new fields, mutations, routes, identity behaviour, S3 operations, async jobs), including 'design the API for X'. Not for assistant quality acceptance cases (assistant-quality) or live backfills (safe-data-migration)."
compatibility: Requires pattadar-platform service source and tests. Local edits/tests are allowed; production database, cloud, or deployment operations are not.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-10-09"
---

# Backend Contract Change

Trace the whole contract before editing. A working resolver is incomplete if a
caller, proxy, model, rollout compatibility rule, or native contract is missed.
`services/api` trusts the gateway's `x-user-id` and never validates sign-in
tokens itself. Not this skill: Terraform (infrastructure-change).

## Workflow

1. Read `references/contract-map.md` and classify the entry point/consumer.
2. Trace caller → operation/hook → gateway route/proxy → owning service → data
   model/bootstrap → tests. Identify web, mobile, iOS, and internal consumers.
3. Preserve trust boundaries and backward compatibility. Schema/bootstrap DDL
   is additive unless a separately reviewed migration exists; old/new tasks may
   coexist during rollout.
4. For AI readings preserve durable async jobs, authenticated polling, and no
   automatic provider retry. For storage, new keys are `{node}/{version}` with
   no owner; authorization is decided in SQL (`_access`), never by key prefix;
   reads use the version row's `object_key`, so legacy
   `{owner}/{node}/{version}` objects keep their keys.
5. Add the narrowest contract tests and update generated/shared vectors only
   when the contract genuinely crosses platforms.
6. Hand final checks to `verify-change`; every create/read/update/delete/
   add-content operation, failure path included, to `functional-acceptance`
   (legs it cannot run are reported NOT_RUN, not passed); ADAPT iOS
   work to `sync-ios`; security analysis to `security-review`;
   assistant quality/acceptance cases to `assistant-quality` (this skill owns
   the SSE/route/schema implementation); live/backfill operations to
   `safe-data-migration`.

## Stop conditions

Stop and ask before exposing API directly, adding `Query.web` use to iOS
beyond the four Services-screen fields in the map, changing
identity/owner keys, making destructive DDL, weakening token/share scope, or
creating a new product promise/schema not present in an approved design.
