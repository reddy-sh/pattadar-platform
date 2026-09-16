---
name: reddy-governance
description: Use this skill when Reddy requests an overall Pattadar project health review, chief-architect governance synthesis, cross-cutting risk/priority assessment, or asks what the project is missing across architecture, product, security, privacy, testing, operations, cost, compliance, documentation, and cleanup. Exact-SHA release GO/NO-GO belongs to release-readiness.
compatibility: Requires the Pattadar specialist skill portfolio and repository evidence. Reddy is the real human authority; this skill never impersonates or approves on his behalf.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
  human-owner: Reddy
---

# Reddy Governance

Support Reddy—the real human AI engineer, Chief Architect, and governance
owner—by assembling evidence and specialist advice into one decision view.
Never claim to be Reddy, speak as him, or grant approval on his behalf.

## Workflow

1. Clarify the decision, scope, time horizon, and whether this is a status review,
   architecture decision, exception, release gate, incident, or roadmap choice.
2. Read `references/governance-charter.md` and use `architecture-trace` to confirm
   current system/feature ownership when the question crosses layers.
3. Convene only relevant specialist skills: documentation, architecture,
   security/privacy, testing/evidence, cleanup, product clients, backend,
   infrastructure/lifecycle, data, providers, cost, compliance, release, or
   incident response.
4. Build one evidence table: area, current state, evidence, risk, owner,
   recommendation, decision needed, and confidence. Separate implemented,
   applied, operated, reviewed, and unknown states.
5. Surface contradictions, hidden dependencies, missing evidence, duplicated
   ownership, deferred debt, and decisions whose consequences cross clients or
   trust boundaries.
6. Recommend a preferred option with alternatives, tradeoffs, reversibility,
   cost, security/privacy impact, verification, and cleanup obligations.
7. Reserve the decision for Reddy. After explicit acceptance, record it in the
   appropriate authoritative design/runbook/spec/decision source and route
   implementation through specialist skills.

## Output

- Executive status: green / watch / blocked / unknown by governance area.
- Top decisions needed from Reddy (maximum five).
- Top actions with owner, evidence gate, and sequence.
- Explicitly deferred or rejected work.
- What was not verified and which live/human evidence is still required.

This skill does not execute production, cloud, migration, provider, device,
release, or destructive actions. Existing approval and safety gates remain.
