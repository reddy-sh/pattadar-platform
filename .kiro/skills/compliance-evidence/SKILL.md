---
name: compliance-evidence
description: Use this skill when collecting, reviewing, packaging, or mapping Pattadar SOC 2, DPDP, GDPR, privacy, access-review, backup/restore, incident, consent, vendor, or change-management evidence without overstating implemented or deployed controls.
compatibility: Requires docs/compliance, runbooks, workflows, and redacted evidence. This is evidence/process support, not legal advice or automatic live-system collection.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
---

# Compliance Evidence

Build an auditable evidence trail while preserving the distinction between
code, configured infrastructure, applied state, operational execution, and
legal/organizational approval.

## Workflow

1. Read `references/evidence-map.md`; identify control, period, environment,
   evidence owner, source, freshness, retention, and reviewer.
2. Collect the minimum redacted artifact proving operation (CI/workflow receipt,
   restore result, access review, release/migration receipt, policy finding,
   audit event), not screenshots of configuration alone when execution matters.
3. Map evidence to the control and note gaps/compensating controls. Checked
   historical tasks and Terraform declarations are not deployment evidence.
4. Avoid PII/secrets/account inventories; store private artifacts only in their
   approved location and link by reference.
5. Produce evidence index, control status (implemented/applied/operated/reviewed),
   exceptions, owner, next due date, and human/legal sign-off needs.

Do not make legal conclusions, call live systems, or manufacture evidence.
