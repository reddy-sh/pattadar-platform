---
name: infrastructure-change
description: "Use this skill when designing, implementing, or reviewing Pattadar Terraform/IaC in infra/terraform: modules, env roots, outputs/remote state, IAM, security groups, ALB/CloudFront/WAF routing, ECS/RDS/S3/KMS/Cognito, alarms, schedulers, or GitHub OIDC. Not for operating platform up/down/restore (platform-lifecycle) or Terraform provider/version bumps (dependency-change)."
compatibility: Requires infra/terraform and CI. Static source edits are allowed once any reserved design below is approved; init (even -backend=false)/plan/live AWS/apply/destroy require explicit approval under their own safety gates.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-10-09"
---

# Infrastructure Change

Own infrastructure design and source compatibility. `platform-lifecycle` owns
planned operation of existing up/down/thaw/restore flows.
Not this skill: a security-only review (pattadar-security-review) or enabling an IdP or other external provider (provider-activation).

Stop before writing Terraform for a new AWS service, data store, trust boundary,
cost-bearing resource, or persistent-layer change: present the design, cost,
alternatives and rollback (`architecture-trace`, `cloud-cost-governance`) and
wait for Reddy's architecture and budget approval (`reddy-governance`).

## Workflow

1. Read `references/change-gates.md`; identify the layer, every root in the
   `ci.yml` terraform-validate matrix (currently five), remote-state contracts,
   resource ownership, region/provider alias, and current consumers of
   outputs/secrets.
2. Trace trust and traffic paths (CloudFront/ALB listeners/SGs/tasks/RDS/S3),
   failure/rollback behavior, cost/availability implications, and deployment
   compatibility while old/new tasks coexist.
3. Keep persistent resources stable unless migration evidence exists. Prefer
   additive outputs and avoid state-address churn; plan moved/import blocks when
   identity changes.
4. Update examples/runbooks/CI together and compose with `pattadar-security-review`,
   `cloud-cost-governance`, `dependency-change`, `backend-contract-change` (a
   service consumes it) and `test-governance` (CI/harness) as applicable.
5. Use `verify-change`: run `terraform fmt -check -recursive` in
   `infra/terraform` and `bun run scripts/aadhaar-digits-tests.ts`. Before
   `terraform -chdir=infra/terraform/<root> init -backend=false` and validate,
   show the roots, command, provider downloads and `.terraform` writes, then
   wait for approval; without it, report validate NOT_RUN with CI
   terraform-validate as the gate. Never init with a backend to validate; a
   backend init, plan or live read needs its own approval.

AWS account IDs: never echo one. The guard above fails on 12-digit runs in
tracked files (`git ls-files`; an untracked new file is not scanned), so
derive the ID in remote-state/provider config (`data.aws_caller_identity`, a
variable); a `backend` block cannot, so a new root's `backend.tf` needs a
reviewed `PATH_ALLOW` entry with its reason, like the existing roots.

Never do manual state surgery (`terraform state rm/mv`, CLI import); use
reviewed `moved`/`import` blocks. Never apply/destroy, dispatch workflows, or
call AWS during an IaC source task without a separate exact approval.
