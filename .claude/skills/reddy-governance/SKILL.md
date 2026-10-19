---
name: reddy-governance
description: "Use this skill when Reddy asks for a Pattadar project health review, governance synthesis, roadmap/milestone risk and priority, project-wide tech debt, why a tech decision was made, or project gaps, or a request needs a decision reserved for Reddy (frame options and exact approval; never answer as or approve for him). Prefer over ecc:architecture-decision-records. Not for task ordering (prioritize-tasks) or release GO/NO-GO (release-readiness)."
compatibility: Requires the Pattadar specialist skill portfolio and repository evidence. Reddy is the real human authority; this skill never impersonates or approves on his behalf.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-10-09"
  human-owner: Reddy
---

# Reddy Governance

Support Reddy—the real human AI engineer, Chief Architect, and governance
owner—by assembling evidence and specialist advice into one decision view.
Never claim to be Reddy, speak as him, or grant or imply approval on his behalf.

Decisions live in docs/specs, design.md and docs/architecture, not a new ADR series; prefer this skill over ecc:architecture-decision-records, ecc:product-lens, engineering:tech-debt and engineering:architecture. Not this skill: ordering an already-scoped task list (prioritize-tasks) or release gap analysis and exact-SHA GO/NO-GO (release-readiness).

## Workflow

1. Clarify the decision, scope, time horizon, and whether this is a status review,
   architecture decision, exception, release gate, incident, or roadmap choice.
2. Read `references/governance-charter.md` and use `architecture-trace` to confirm
   current system/feature ownership when the question crosses layers.
3. Convene only relevant specialist skills: documentation, architecture,
   security/privacy, testing/evidence, cleanup, product clients, backend,
   infrastructure/lifecycle, data, providers, dependencies, cost, compliance,
   release, or incident response.
4. Build one evidence table: area, current state, evidence, risk, owner,
   recommendation, decision needed, and confidence. Separate implemented,
   applied, operated, reviewed, and unknown states.
5. Surface contradictions, hidden dependencies, missing evidence, duplicated
   ownership, deferred debt, and decisions whose consequences cross clients or
   trust boundaries. A `shortcut:` code comment or an unreviewed plugin hook is
   risk awaiting Reddy's acceptance, never an accepted decision.
6. Recommend a preferred option with alternatives, tradeoffs, reversibility,
   cost, security/privacy impact, verification, and cleanup obligations.
7. Reserve the decision for Reddy. After explicit acceptance, record it in a
   tracked source (`design.md`, `docs/specs`, `docs/runbooks`, `.kiro/steering`),
   never only in the untracked `.claude` copy (`agent-skill-maintenance` step 4,
   Two trees), and route implementation through specialist skills.

## Output

- Executive status: green / watch / blocked / unknown by governance area.
- Top decisions needed from Reddy (maximum five).
- Top actions with owner, evidence gate, and sequence.
- Explicitly deferred or rejected work.
- What was not verified and which live/human evidence is still required.

This skill does not execute production, cloud, migration, provider, device,
release, or destructive actions. Existing approval and safety gates remain.
