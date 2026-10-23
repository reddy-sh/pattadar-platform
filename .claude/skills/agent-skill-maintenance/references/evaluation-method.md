# Skill Evaluation Method

The central pilot source is `.kiro/skill-evals/portfolio.json`; multi-skill
routing/stop cases live in `.kiro/skill-evals/collisions.json` (Claude Code copy:
`.claude/skill-evals/`). Static validation proves fixture shape only—not
discovery, routing or output quality in Kiro or Claude Code.

## Isolation

Runs follow `.claude/rules/pattadar-safety.md`; fixtures ask for prod deploys,
teardowns and restores. Run trigger probes with `--permission-mode plan` in an
environment with no AWS, GitHub or provider credentials, and end each run at
the Skill-call decision. Run prod-action output cases as analysis only, never
with `bypassPermissions`, `--dangerously-skip-permissions` or other
auto-approval. Turn off the injected persona, session context and gate that
contaminate both variants (`PONYTAIL_DEFAULT_MODE=off`,
`ECC_SESSION_START_CONTEXT=off`, `ECC_GATEGUARD=off`).

## Trigger quality

For each positive/negative prompt, start a fresh session in the client under
test: Kiro, or Claude Code (a new `claude -p` at the repo root; `.claude` is
untracked, so a git worktree has no project skills). Record client and version,
model, repository revision, enabled plugin set and hook profile, the session's
`skill_listing` attachment (including which skills arrived without a
description because the listing budget cut them), the Skill-tool calls, and
whether the expected route occurred. Run each prompt at least three times and
keep each client's results apart (a `client` field). Track positive trigger
rate, adjacent false-trigger rate and collision expected-set accuracy. Fixtures
cannot name built-in, user or plugin skills yet (`/security-review`,
`code-review`, `skill-creator`); record such a route in the run notes and score
it as a miss when a Pattadar skill was expected.

Before diagnosing a discovery failure, parse the frontmatter with
`yaml.safe_load`: `scripts/validate-agent-skills.py` splits on the first `:`
and is not a YAML parser, so it passes an unquoted `: ` inside a description
that strict YAML rejects (the `.kiro` `platform-lifecycle` description had one
until 18/10/2026).

## Output quality

Run each central output case twice in clean contexts:

- current skill (`with_skill`), and
- no skill for a new workflow or a snapshot of the previous skill (`baseline`);
  in Claude Code, run it in a scratch copy of the repository without that
  skill's directory (or with the snapshot in its place).

After first outputs, add objective assertions where possible and a human rubric
for subjective quality. Grade PASS only with concrete evidence. Capture duration/
tokens when the client exposes them.

Raw runs belong under ignored:

```text
.kiro/skill-eval-workspace/<skill>/iteration-N/<case>/
  with_skill/outputs/
  baseline/outputs/
  grading.json
  timing.json
  feedback.json
```

Commit only separately reviewed, redacted aggregate summaries.

## Pilot thresholds

Rates are over every fixture prompt of that kind × three runs, whatever the
prompt count:

- positive trigger rate: >=83% (5/6 for two prompts);
- adjacent false-trigger rate: <=17% (1/6 for two prompts);
- expected loaded-set accuracy: >=85%;
- safety assertions: 100%;
- output lift: >=15 percentage points or >=70% blinded human preference, unless
  Reddy records a reason the safety/governance value justifies retention.

Remove assertions both variants always pass; investigate assertions both always
fail; refine high-variance instructions. Do not prune/add skills until evidence
shows a unique workflow, safety boundary and measurable benefit.
