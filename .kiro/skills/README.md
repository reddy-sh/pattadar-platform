# Pattadar Agent Skills Catalog

Canonical Kiro portfolio following the [Agent Skills specification](https://agentskills.io/specification). Each skill is one coherent workflow; invariants live in steering, deterministic gates in CI/hooks, and conditional detail in one-level `references/`.

## Portfolio

| Skill | Ownership |
|---|---|
| `architecture-trace` | neutral evidence-based architecture/impact tracing and diagrams |
| `reddy-governance` | Reddy's chief-architect project synthesis and human decision dashboard |
| `agent-skill-maintenance` | skill/steering/hook creation, discovery, evaluation and pruning |
| `prioritize-tasks` | ordering/cutting constrained work |
| `verify-change` | execution/reporting of smallest sufficient local checks |
| `functional-acceptance` | exercising every create/read/update/delete/add-content operation of a mutating surface end to end, including its failure path |
| `security-review` / `secret-scan` | threat analysis / actual redacted secret detection |
| `cloud-cost-governance` | static/report-only spend, tags and Custodian findings |
| `release-readiness` | release gaps and exact-SHA go/no-go |
| `backend-contract-change` | API/GraphQL/gateway/storage/assistant contract implementation |
| `safe-data-migration` | data inventories, writer control, reconciliation and receipts |
| `incident-triage` | live-symptom diagnosis and safest next check only |
| `web-feature-delivery` | active `apps/web` feature architecture and test choice |
| `mobile-feature-delivery` | Expo compatibility client and EAS/store readiness |
| `web-next-cutover` | staged Next parity and explicit cutover |
| `sync-ios` | web/core/root-schema/gateway adaptation to native iOS |
| `design-system-governance` | cross-client tokens, accessibility, motion, icons and brand |
| `infrastructure-change` | Terraform/IaC design and source changes |
| `platform-lifecycle` | operation of existing up/down/park/thaw/restore flows |
| `dependency-change` | package/provider/action/base-image changes |
| `assistant-quality` | assistant prompt/policy/tool/model/grounding/durability quality |
| `test-governance` | test harness, fixture, CI coverage and flake policy |
| `provider-activation` | Cognito/email/SMS/WA/payment/Anthropic/push/store activation |
| `compliance-evidence` | SOC2/DPDP/GDPR evidence without overclaiming |
| `reference-data-ingestion` | AP-IGRS/village/KML/FMB/public-record ingestion quality |
| `runbook-consistency` | documentation/executable-behavior drift |

## Always-on watches

`pattadar-standards.md`, `pattadar-safety.md`, `change-governance.md`, and
`reddy-authority.md` require every task to assess documentation, architecture,
security/privacy, testing/evidence, cleanup and reserved human decisions.
Specialist skills own detailed workflows.

## Portfolio status

**Provisional.** Static validation proves package/fixture shape only. It does not
prove Kiro discovery, trigger accuracy or output benefit. Freeze additions,
deletions and merges until fresh-session pilot evidence exists.

## Evaluation and maintenance

- Static structure: `python3 scripts/validate-agent-skills.py --strict`.
- Portfolio trigger/output fixtures: `python3 scripts/validate-skill-evals.py`.
- Actual trigger quality requires fresh Kiro sessions; run each positive/negative prompt repeatedly and record whether the skill loaded.
- Output quality follows with-skill versus no-skill/old-skill runs, objective assertions after first outputs, timing/tokens, evidence-based grading, and human feedback. See `agent-skill-maintenance`.
- New skills activate after a new Kiro session/index refresh. Static validation cannot prove discovery.
- Keep `.kiro/skills` canonical. Cross-tool copies are thin adapters only.
- Ground changes in real code/runbooks/incidents; update `metadata.verified`, catalog, eval manifest and validators together.

## Upstream provenance

See `docs/agent-skills/upstream-review.md`. External patterns were adapted; no upstream executable bundle, dataset, font, renderer or template was imported.

Skills do not replace CI, security gates, operator approval, live evidence, or cleanup discipline.
