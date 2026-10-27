---
name: release-readiness
description: "Use this skill when preparing, reviewing, or deciding whether a Pattadar revision is ready to release, deploy, promote, or push/merge to main: a pre-deploy checklist, 'about to ship or deploy', a migration rollout, preflight, runtime-state or rollback evidence, or a production go/no-go for Reddy on an exact SHA. Not for a live outage or a failed or stuck rollout (incident-triage) or running platform up/down, thaw or restore (platform-lifecycle)."
compatibility: Requires pattadar-platform release workflows and runbooks. Live GitHub/AWS checks or deployment require separate explicit approval.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-10-26"
---

# Release Readiness

Assess gaps before a final SHA exists, or assess one exact revision. A GO/NO-GO
requires the full 40-character SHA and is a recommendation: the release decision
is Reddy's. Exploratory preparation produces a gap analysis without pretending a
revision was assessed. Local success alone is never production readiness;
external migration, IAM, provider, restore, runtime and rollback evidence must
be distinguished from code that merely exists.

A push or merge to `main` is a production release: `Deploy` runs after CI
succeeds for the push, with no path filter, and `Deploy University` runs on the
push itself. Expo and native iOS store releases are not covered (the repo has no
store release path); say so rather than implying a GO.

Prefer this skill over generic deploy checklists. Not this skill: packaging compliance evidence (compliance-evidence).

## Workflow

1. If assessing an exact revision, identify the full 40-character SHA,
   environment, and release window; reject an obsolete main revision. For early
   preparation, state that the result is a gap analysis and list the
   SHA-dependent evidence still unavailable.
2. Read `references/evidence-matrix.md` and gather evidence for that exact SHA
   when one exists, including runtime state and recorded pending changes.
3. Require relevant outputs from `verify-change`, `functional-acceptance` (for
   every create/read/update/delete/add-content surface the release changes),
   `security-review`, and `secret-scan`; do not duplicate their
   procedures.
4. Confirm migration/preflight artifacts are complete, private, fresh, and
   SHA-matched without printing owner inventories or PII.
5. Explain rollback boundaries: service/web rollback does not reverse schema or
   data migrations; `rollback-incomplete` is an incident; University has no
   automated rollback. On the one-host runtime, state the expected outage:
   about 1-2 minutes per service, with the gateway step a full outage.
6. Produce the go/no-go table with blocker, evidence, owner, and next action.

## Safety

Read repository evidence only by default. Before any GitHub/AWS call, artifact
download, image build/push, workflow dispatch, push or merge to `main`, or
`deploy-release.py --execute`, show the exact SHA, scope, environment, command,
side effects, data exposure, reversibility and expected evidence, then wait for
Reddy's explicit approval. Production mutation requires a separate confirmation
immediately before action. Bringing up a parked runtime goes to
`platform-lifecycle` and `cloud-cost-governance` under Reddy's approval; never
fold it into a release. Never print private preflight contents.
