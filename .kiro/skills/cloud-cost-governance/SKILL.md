---
name: cloud-cost-governance
description: Use this skill for Pattadar AWS cost analysis, idle-resource review, stale snapshots, allocation tags, Cloud Custodian policy/findings/schedule questions, parked-versus-running platform cost, or safe cost-reduction options. Default to static/report-only evidence; never make AWS calls or run Terraform/Custodian/workflows without explicit approval.
compatibility: Requires pattadar-platform repository context. Optional live analysis requires explicitly approved AWS/Terraform/Cloud Custodian access.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
---

# Cloud Cost Governance

Analyze repository configuration first. Do not query AWS, install tools,
initialize Terraform, run Custodian, dispatch workflows, or mutate resources
unless the user separately approves the exact command.

## Workflow

1. Clarify environment, region, time range, currency, and decision needed.
2. Label evidence as static config, historical estimate, generated local
   artifact, or explicitly approved live billing/inventory data.
3. For Custodian policies/findings, tagging coverage, schedule, role, or summary
   behavior, read `references/custodian-governance.md`. For running/parked cost
   architecture or estimates, read `references/cost-architecture.md`. Load
   neither for a simple question about this skill's approval boundary.
4. Separate runtime, persistent/parked, and usage-variable costs.
5. Correlate findings with configured architecture; findings are evidence to
   investigate, never permission to remediate.
6. Rank options by value, confidence, effort, reversibility, dependencies, and
   evidence required. Prefer reviewed runbooks over ad-hoc commands.

## Approval gate

Before anything that contacts AWS/GitHub or invokes Terraform/Custodian, show
the exact command, account/environment, region(s), date range, scope, API/network
effects, expected output, and why it is non-mutating; then wait for approval.
Custodian `--dryrun` still calls AWS. Terraform `init` downloads providers and
`plan` reads live state.

## Hard prohibitions

Never add Custodian actions/Lambda remediation; run platform up/down, destroy,
delete, resize, unassociate, retag, or transition resources as an audit action;
use stale `-target` down-flow guidance; or expose account/resource/billing data
unnecessarily. Estimates must state assumptions and evidence class.

## Output

Use a compact table: observation, evidence, cost mechanism, confidence, rough
impact, safety/dependencies, and human next step. Separate quick wins from items
requiring operational or security review.
