---
name: runbook-consistency
description: "Use this skill to write, update, retire, or audit Pattadar docs and runbooks (docs/runbooks, docs/architecture, docs/compliance, READMEs) against current code and automation: 'write or update a runbook', 'document this', 'are the docs stale?', or after behavior, config or procedure changes. Prefer it over generic document-writing skills. Not for executing a runbook (its owner skill) or explaining or diagramming how Pattadar works (architecture-trace)."
compatibility: Requires pattadar-platform documentation, scripts, workflows, and source. Read-only by default; never execute commands copied from runbooks.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-10-09"
---

# Runbook Consistency

Compare prose with executable truth. Do not imply a control is deployed merely
because code, Terraform, or a checked checklist item exists.

## Where docs go

Follow `references/authority-map.md` and the `README.md` repository layout
table: procedures in `docs/runbooks/`, architecture in `docs/architecture.md`
or `docs/architecture/`, compliance in `docs/compliance/`, testing in
`docs/qa/`. Never create `docs/RUNBOOK.md`, `docs/CONTRIBUTING.md`,
`docs/CODEMAPS/`, `docs/GUIDES/` or a root `CLAUDE.md`, and never write a
connector or MCP-hosted document unless asked.

Use it after architecture, release, migration, lifecycle or security/compliance changes too. Prefer it over generic documentation, codemap or onboarding skills and agents. Not this skill: executing a runbook (platform-lifecycle, safe-data-migration, release-readiness, incident-triage, provider-activation, reference-data-ingestion) or packaging compliance evidence (compliance-evidence).

## Workflow

1. Read `references/authority-map.md`, place each document at one of its five
   levels, and split its claims into facts and rules.
2. Trace documented paths, commands, settings, counts, and safety claims to
   current scripts/workflows/source.
3. Search reverse references when behavior changes and update linked README,
   runbooks, architecture, specs, compliance checklist, and deprecation notes as
   one consistency change.
4. Validate links and path existence. Report contradictions instead of silently
   choosing, unless the authority map resolves them.
5. Produce a compact drift table or focused patch. Mark estimates, examples,
   pending deployment, external evidence, and legal review explicitly.

## Creating or retiring a doc

A new runbook goes in `docs/runbooks/`, marks every step that
`.kiro/steering/pattadar-safety.md` gates (AWS, GitHub/provider, Terraform,
deploy, migration, restore, thaw, store/device, live or production data) as
needing Reddy's approval for that environment, and ends with
Verify and Roll back sections, as `docs/runbooks/village-maps-publish.md` does.
Link it from the docs that route to it (`README.md`, service READMEs, related
runbooks). Retire a doc by marking it historical or superseded and fixing its
reverse references in the same change; delete only when asked.

## Safety

Never execute commands copied from runbooks or docs, and never run a runbook
from this skill; its owner skill runs it under the approval gates in
`.kiro/steering/pattadar-safety.md`. Never copy secrets, production IDs, private
owner inventories, or PII into docs. Never edit a rule to match code (see the
authority map); report the mismatch for Reddy.

Skills route work; they are not evidence, and their prose can be stale, so take
facts from the repo. Owners: `release-readiness`, `safe-data-migration`,
`platform-lifecycle`, `incident-triage`, `security-review`,
`cloud-cost-governance`; for architecture, compliance and test docs,
`architecture-trace`, `compliance-evidence` and `test-governance`.
