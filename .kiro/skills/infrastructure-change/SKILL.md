---
name: infrastructure-change
description: Use this skill when designing, implementing, or reviewing Pattadar Terraform/IaC changes—modules, env roots, outputs/remote state, IAM, security groups, ALB/CloudFront/WAF routing, ECS/RDS/S3/KMS/Cognito, alarms, schedulers, or GitHub OIDC—rather than operating the existing platform lifecycle.
compatibility: Requires infra/terraform and CI. Static source edits are allowed; init/plan/live AWS/apply/destroy require explicit approval under their own safety gates.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
---

# Infrastructure Change

Own infrastructure design and source compatibility. `platform-lifecycle` owns
planned operation of existing up/down/thaw/restore flows.

## Workflow

1. Read `references/change-gates.md`; identify persistent/runtime root, all four
   env roots, remote-state contracts, resource ownership, region/provider alias,
   and current consumers of outputs/secrets.
2. Trace trust and traffic paths (CloudFront/ALB listeners/SGs/tasks/RDS/S3),
   failure/rollback behavior, cost/availability implications, and deployment
   compatibility while old/new tasks coexist.
3. Keep persistent resources stable unless migration evidence exists. Prefer
   additive outputs and avoid state-address churn; plan moved/import blocks when
   identity changes.
4. Update examples/runbooks/CI together and compose with `security-review`,
   `cloud-cost-governance`, and `dependency-change` as applicable.
5. Use `verify-change` for fmt/four-root validation. Explain provider downloads
   and `.terraform` writes before init; plan/live reads need explicit approval.

Never apply/destroy, dispatch workflows, mutate state, or call AWS during an IaC
source task without a separate exact approval.
