---
name: cloud-cost-governance
description: "Use this skill for Pattadar AWS and platform spend: cost analysis, idle resources, stale snapshots, allocation tags, Cloud Custodian policy/findings/schedules, parked-versus-running cost, or safe cost-reduction options. Analysis only, from static evidence; never make AWS calls or run Terraform/Custodian/workflows without Reddy's approval. Not for running park/up/down or restores (platform-lifecycle) or Claude Code token spend (ecc:cost-tracking)."
compatibility: Requires pattadar-platform repository context. Optional live analysis requires explicitly approved AWS/Terraform/Cloud Custodian access.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-10-09"
---

# Cloud Cost Governance

Analyze repository configuration first. Do not query AWS, install tools,
initialize Terraform, run Custodian, dispatch workflows, or mutate resources
unless Reddy separately approves the exact command.

## Workflow

1. Clarify environment, region, time range, currency, and decision needed.
2. Label evidence as static config, dated recorded state, historical estimate,
   generated local artifact, or explicitly approved live billing/inventory data.
   Code is not live state: `docs/specs/TODO-prod-persistent-pending.md` lists
   prod persistent changes still unapplied, so never credit them as savings.
3. For Custodian policies/findings, tagging coverage, schedule, role, or summary
   behavior, read `references/custodian-governance.md`. For running/parked cost
   architecture, recorded state or estimates, read
   `references/cost-architecture.md`. Load neither for a simple question about
   this skill's approval boundary.
4. Separate runtime, persistent/parked, standalone University, and
   usage-variable costs.
5. Correlate findings with configured architecture; findings are evidence to
   investigate, never permission to remediate. Never list the newest
   `pattadar-<env>-pg-final-*` snapshot per environment as a quick win or
   cleanup candidate: `scripts/platform-up.sh` restores from it and creates an
   empty database when none exists. Older ones are pruned only with Reddy's
   approval, through platform-lifecycle. Send `security.yml` findings to
   pattadar-security-review.
6. Rank options by value, confidence, effort, reversibility, dependencies, and
   evidence required, and state user-facing effects (parking takes prod
   offline; see the reference). Prefer reviewed runbooks over ad-hoc commands.

## Approval gate

Before anything that contacts AWS/GitHub or invokes Terraform/Custodian, show
Reddy the exact command, scope, environment (never the account ID), region(s),
date range, side effects and API/network calls, data exposure, reversibility,
expected evidence, and why it is non-mutating; then wait for his approval.
Custodian `--dryrun` still calls AWS. Terraform `init` downloads providers and
`plan` reads live state. An approval never covers a later mutating step; that
needs a fresh confirmation immediately before execution.

## Hard prohibitions

Never add Custodian actions/Lambda remediation; run platform up/down, destroy,
delete, resize, unassociate, retag, or transition resources (execution belongs
to platform-lifecycle, IaC edits to infrastructure-change); follow the stale
`-target` down-flow text named in `references/cost-architecture.md`; or expose
secrets, tokens, account IDs, unnecessary resource identifiers, or billing data
beyond what the analysis needs. Estimates must state assumptions and evidence
class.

## Output

Use a compact table: observation, evidence, cost mechanism, confidence, rough
impact, safety/dependencies, and human next step. Separate quick wins from items
requiring operational or security review.
