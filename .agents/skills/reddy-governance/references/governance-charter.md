# Reddy Governance Charter

## Human authority

Reddy is the real human AI engineer, Chief Architect, product/technical
governance owner, and final decision authority for Pattadar. AI agents provide
analysis, options, implementation, validation, monitoring, and evidence; they do
not impersonate Reddy or self-approve reserved decisions.

## Decisions reserved for Reddy

- Architecture/trust-boundary exceptions and new platform/product promises.
- Production release/cutover, rollback, platform lifecycle and destructive work.
- Data migration/erasure, identity binding, retention and irreversible changes.
- Security/privacy risk acceptance, public exposure, IAM and secret exceptions.
- Provider production activation, live credentials, device/store operations.
- Budget/cost/availability tradeoffs and material dependency/stack changes.
- Compliance/legal claims, evidence acceptance and organizational sign-off.
- Overrides to locked design systems, frozen copy or cross-client parity rules.

## Specialist cabinet

| Area | Primary skill |
|---|---|
| Architecture/impact | `architecture-trace` |
| Documentation | `runbook-consistency` |
| Security/privacy/secrets | `pattadar-security-review`, `secret-scan` |
| Testing/evidence | `test-governance`, `verify-change`, `functional-acceptance` |
| Cleanup | `.claude/rules/change-governance.md` dimension 5; project cleanup debt: `infrastructure-change`, `cloud-cost-governance`, `runbook-consistency` |
| Product clients/design | `web-feature-delivery` (also `apps/university`), `mobile-feature-delivery`, `sync-ios`, `design-system-governance`, `heuristic-ux-audit` |
| Backend/data | `backend-contract-change`, `safe-data-migration`, `reference-data-ingestion` |
| Infra/operations | `infrastructure-change`, `platform-lifecycle`, `incident-triage` |
| Providers/assistant/AI | `provider-activation`, `assistant-quality`, `typesafe-ai` |
| Dependencies | `dependency-change` |
| Cost/compliance/release | `cloud-cost-governance`, `compliance-evidence`, `release-readiness` |
| Ordering a scoped task list | `prioritize-tasks` |
| Skill system | `agent-skill-maintenance` |

## Review cadence

- Per change: five-part change-governance watch.
- Weekly/roadmap: architecture, blockers, risks, evidence and priority review.
- Before release: exact-SHA release readiness and reserved-decision approval.
- During incidents: incident triage first; Reddy approves remediation.
- Quarterly or major change: skill portfolio/evals, access/compliance evidence,
  restore/alert exercises, cost and architecture drift.

## Status language

- **Green:** evidence exists and no decision is pending.
- **Watch:** acceptable now with owner/date and monitored risk.
- **Blocked:** required evidence/control/decision is absent.
- **Unknown:** not checked; never silently convert to green.
