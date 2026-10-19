# Pattadar Agent Skills Catalog

> **Generated Claude Code copy: do not edit.** `python3 scripts/sync-claude-from-kiro.py`
> rebuilds `.claude/rules`, `.claude/skills` and `.claude/skill-evals` from the
> canonical `.kiro/steering`, `.kiro/skills` and `.kiro/skill-evals` (tracked,
> validated, run by the Kiro hook). Edit `.kiro` and rerun it; `--check` reports
> drift without writing. The copy differs from `.kiro` only on purpose:
>
> - `security-review` is renamed `pattadar-security-review` (directory,
>   frontmatter, references, eval names) so it does not shadow Claude Code's
>   built-in `/security-review`;
> - the always-on steering is `.claude/rules/*.md`, without the
>   `inclusion: always` frontmatter, and paths name `.claude/rules` and
>   `.claude/skills`;
> - Kiro wording reads as Claude Code: `heuristic-ux-audit` opens images with
>   the Read tool instead of `create_artifact`; cleanup, long runs and browser
>   work name TaskStop, Monitors, `run_in_background`, the built-in `run` and
>   Claude in Chrome; agents are plugin agents and personas; evaluation runs use
>   `claude -p`, `--permission-mode plan`, the skill listing and Skill-tool calls;
> - routing hints name Claude Code plugin and connector skills (`ecc:`,
>   `engineering:`, `design:`, `ponytail:`, Claude Docs) where `.kiro` says
>   "generic … skills";
> - this README, `agent-skill-maintenance`, its `evaluation-method.md` and the
>   eval `method` text speak from this copy's side.
>
> The first two are generic transforms in the script; the rest are wording rules
> in `scripts/claude-adaptations.txt`. The validators (`scripts/validate-*.py`)
> and the Kiro PostFileSave hook read only `.kiro`; `--check` is the only check
> of this copy.

Claude Code copy of the canonical Kiro portfolio, following the [Agent Skills specification](https://agentskills.io/specification). Each skill is one coherent workflow; invariants live in the always-on rules (`.claude/rules/*.md`; canonical `.kiro/steering`), deterministic gates in CI/hooks, and conditional detail in one-level `references/`.

## Portfolio

| Skill | Ownership |
|---|---|
| `architecture-trace` | neutral evidence-based architecture/impact tracing and diagrams |
| `reddy-governance` | Reddy's chief-architect project synthesis and human decision dashboard |
| `agent-skill-maintenance` | skill/steering/hook creation, discovery, evaluation and pruning |
| `prioritize-tasks` | ordering/cutting constrained work |
| `verify-change` | execution/reporting of smallest sufficient local checks |
| `functional-acceptance` | exercising every create/read/update/delete/add-content operation of a mutating surface end to end, including its failure path |
| `pattadar-security-review` / `secret-scan` | threat analysis / actual redacted secret detection |
| `cloud-cost-governance` | static/report-only spend, tags and Custodian findings |
| `release-readiness` | release gaps and exact-SHA go/no-go |
| `backend-contract-change` | API/GraphQL/gateway/storage/assistant contract implementation |
| `safe-data-migration` | data inventories, writer control, reconciliation and receipts |
| `incident-triage` | live-symptom diagnosis and safest next check only |
| `web-feature-delivery` | active `apps/web` feature architecture and test choice |
| `mobile-feature-delivery` | Expo compatibility client and EAS/store readiness |
| `sync-ios` | web/core/root-schema/gateway adaptation to native iOS |
| `design-system-governance` | cross-client tokens, the one web face and weights, shared-component reuse, accessibility, motion, icons and brand |
| `heuristic-ux-audit` | analysis-only heuristic UX audit of an existing web screen against design.md's Material 3 principles, delivered as side-by-side CURRENT versus standard images (chat-sized `compare.png`, full `board.png`) ahead of a short summary of what changes |
| `infrastructure-change` | Terraform/IaC design and source changes |
| `platform-lifecycle` | operation of existing up/down/park/thaw/restore flows |
| `dependency-change` | package/provider/action/base-image changes |
| `assistant-quality` | assistant prompt/policy/tool/model/grounding/durability quality |
| `test-governance` | test harness, fixture, CI coverage and flake policy |
| `provider-activation` | Cognito/email/SMS/WA/payment/Anthropic/push/store activation |
| `compliance-evidence` | SOC2/DPDP/GDPR evidence without overclaiming |
| `reference-data-ingestion` | LGD geography, AP-IGRS registration CSVs, village-map archives and public-record corpus ingestion quality |
| `runbook-consistency` | documentation/executable-behavior drift |
| `typesafe-ai` | advisory TypeSafe System One (Jev) typed-decision design within Pattadar boundaries; adapted external skill |

## Always-on watches

The four `.claude/rules/` files (`pattadar-standards.md`, `pattadar-safety.md`,
`change-governance.md`, `reddy-authority.md`) require every task to assess
documentation, architecture, security/privacy, testing/evidence, cleanup and
reserved human decisions.
Specialist skills own detailed workflows.

## Portfolio status

**Provisional.** Static validation proves package/fixture shape only. It does not
prove discovery, trigger accuracy or output benefit. Freeze additions,
deletions and merges until fresh-session pilot evidence exists. Exceptions
made while this freeze (07944a0, 16/09/2026) stands:

- `functional-acceptance` added 17/09/2026 (d707d59), `heuristic-ux-audit` on
  explicit request on 27/09/2026 and `typesafe-ai` on 30/09/2026 (both landed in
  40ac200); like the rest of the portfolio, they are unproven until their pilots run.
- `web-next-cutover` retired on 09/10/2026 at Reddy's request (removed from
  `.kiro` on 18/10/2026): `apps/web-next`, its deploy branch and `WEB_ORIGIN`
  were removed in c776cf0 (20/09/2026). Its one live rule, keeping the shipped iOS
  `/app/tickets/<id>/pay` link working through the `tickets/:id/pay` redirect,
  belongs to `web-feature-delivery` (that redirect was removed on 11/10/2026;
  see its drift note).

## Evaluation and maintenance

- Static structure: `python3 scripts/validate-agent-skills.py --strict`; portfolio fixtures: `python3 scripts/validate-skill-evals.py`; both read `.kiro` only.
- Actual trigger quality requires fresh Claude Code sessions (a new `claude -p` at the repo root, or a clean subagent; `.claude/` is untracked, so a git worktree does not contain it). Run each positive/negative prompt repeatedly and record the client version, model, enabled plugins, which skills the listing showed without a description, and whether the Skill tool loaded the skill. Keep Kiro and Claude Code results apart.
- Output quality follows with-skill versus no-skill/old-skill runs, objective assertions after first outputs, timing/tokens, evidence-based grading, and human feedback. See `agent-skill-maintenance`.
- Keep `.kiro/skills` canonical. Cross-tool copies are thin adapters, except this generated Claude Code copy (see the header).
- Ground changes in real code/runbooks/incidents; update `metadata.verified`, catalog, eval manifest and validators together.

## Upstream provenance

See `docs/agent-skills/upstream-review.md`. External patterns were adapted; no upstream executable bundle, dataset, font, renderer or template was imported.

Skills do not replace CI, security gates, operator approval, live evidence, or cleanup discipline.
