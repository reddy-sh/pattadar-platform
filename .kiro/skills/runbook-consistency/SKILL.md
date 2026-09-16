---
name: runbook-consistency
description: Use this skill to create, update, or audit Pattadar documentation and runbooks against current code and automation—especially after behavior, config, architecture, release, migration, lifecycle, security/compliance, or operational procedures change, or when asked whether docs are stale.
compatibility: Requires pattadar-platform documentation, scripts, workflows, and source. Read-only by default; never execute commands copied from runbooks.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
---

# Runbook Consistency

Compare prose with executable truth. Do not imply a control is deployed merely
because code, Terraform, or a checked checklist item exists.

## Workflow

1. Read `references/authority-map.md` and classify each document as active
   authority, implementation reference, historical design/evidence, or example.
2. Trace documented paths, commands, settings, counts, and safety claims to
   current scripts/workflows/source.
3. Search reverse references when behavior changes and update linked README,
   runbooks, architecture, specs, compliance checklist, and deprecation notes as
   one consistency change.
4. Validate links and path existence. Report contradictions instead of silently
   choosing, unless the authority order resolves them.
5. Produce a compact drift table or focused patch. Mark estimates, examples,
   pending deployment, external evidence, and legal review explicitly.

## Safety

Never execute runbook commands during a documentation audit. Never copy secrets,
production IDs, private owner inventories, or PII into docs. Use specialized
skills (`release-readiness`, `safe-data-migration`, `platform-lifecycle`,
`security-review`, `cloud-cost-governance`) as factual sources rather than
repeating their full procedures.
