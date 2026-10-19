---
name: compliance-evidence
description: "Use this skill when collecting, reviewing, packaging or mapping Pattadar SOC 2, DPDP, GDPR, privacy, access-review, backup/restore, incident, consent, vendor or change-management evidence without overstating implemented or deployed controls. Not for running a restore (platform-lifecycle) or diagnosing a live incident (incident-triage)."
compatibility: Requires docs/compliance, runbooks, workflows, and redacted evidence. This is evidence/process support, not legal advice or automatic live-system collection.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-10-09"
---

# Compliance Evidence

Build an auditable evidence trail while preserving the distinction between
code, configured infrastructure, applied state, operational execution, and
legal/organizational approval.

Not this skill: Custodian cost/tagging findings (cloud-cost-governance),
building or migrating consent/erasure behaviour (backend-contract-change,
safe-data-migration), security review of a privacy change
(security-review), or release GO/NO-GO (release-readiness).

## Workflow

1. Read `references/evidence-map.md`; identify control, period, environment,
   evidence owner, source, freshness, retention, and reviewer.
2. Use only artifacts the user supplies or that already exist locally/in the
   repo. Never run `gh run download`, `aws`, `scripts/recovery-drill.py` or a
   workflow yourself: for each missing artifact name its source and the read an
   operator would run (Source column), then wait for approval per
   `.kiro/steering/pattadar-safety.md`. Prefer a receipt of execution over
   configuration screenshots when execution matters.
3. Map evidence to the control and note gaps/compensating controls. Checked
   historical tasks and Terraform declarations are not deployment evidence.
4. Keep raw artifacts out of git: working copies go in
   `.local/compliance-evidence/<yyyy-mm-dd>-<control>/` (`.local/` is
   gitignored); long-term retention location is Reddy's decision — ask, do not
   pick one. `docs/compliance/` and `incidents/` are not gitignored, so they get
   only a redacted index (control, date, status, SHA-256, where the raw copy is
   kept).
   Never write secrets, tokens, Aadhaar/deed content, private owner
   inventories, affected-user lists, account IDs, ARNs or unnecessary resource
   identifiers (snapshot ids, endpoints) to a tracked file or a reply. Report
   every raw artifact left in `.local/` as intentionally retained.
5. Produce evidence index, control status per layer (see the map's status
   rules), exceptions, owner, next due date, and the sign-off still needed.

Do not make legal conclusions, call live systems, or manufacture evidence.
Evidence acceptance and compliance/organizational sign-off are Reddy's; present
the index and wait.
