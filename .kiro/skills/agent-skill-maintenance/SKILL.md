---
name: agent-skill-maintenance
description: Use this skill when creating, reviewing, evaluating, pruning or debugging triggering of Pattadar Agent Skills in .kiro/skills or .claude/skills, Kiro steering or .claude/rules, Kiro hooks, skill catalog, skill-evals registries or scripts/validate-*.py, or measuring a skill against a baseline. Prefer it over skill-creator for Pattadar skills. Not for client settings, permissions, MCP servers or Claude Code harness hooks, or skills outside this repo.
compatibility: Requires pattadar-platform .kiro configuration and Python 3, plus the untracked .claude copy when mirroring. Trigger and output quality need fresh Kiro or Claude Code sessions; static CI cannot prove them.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-10-09"
  upstream-inspiration: anthropics/skills-skill-creator
---

# Agent Skill Maintenance

Own the portfolio as a system, not a pile of prompts. Keep one canonical package
per workflow, precise trigger boundaries, progressive disclosure, and measured
benefit over a no-skill or previous-version baseline.

Not this skill: client extensions such as Kiro powers or Claude Code plugins.

## Workflow

1. Capture intent, triggering contexts/near-misses, expected output, safety
   boundary, dependencies, and why this belongs in a skill rather than
   steering/rules, hook, CI, runbook, or ordinary agent judgment.
2. Audit adjacent skills (Pattadar, global `~/.kiro/skills`, and any built-in
   or third-party skills the client loads) and cross-tool copies before
   creating anything. Prefer composition or a thin adapter over duplicated full
   instructions.
3. The portfolio is frozen (`.kiro/skills/README.md` Portfolio status): add,
   merge or delete a skill only on Reddy's explicit request, and record it there.
4. Two trees. `.kiro` is canonical (git, validators, Kiro hook); `.claude` is the
   untracked copy Claude Code loads (`git ls-files .claude` is empty, so nothing
   there can be restored from git). Edit only `.kiro`, then run
   `python3 scripts/sync-claude-from-kiro.py` to regenerate `.claude/rules`,
   `.claude/skills` and `.claude/skill-evals`; it backs up what it replaces under
   `.local/claude-sync-backup/`, and `--check` reports drift without writing.
   Never edit `.claude` by hand. Its Claude Code adaptations (the
   `pattadar-security-review` rename, `.claude/rules` without `inclusion: always`
   frontmatter, the Read tool instead of `create_artifact`, and the rest) are
   generic transforms in that script plus wording rules in
   `scripts/claude-adaptations.txt`. When a `.kiro` edit breaks a rule the sync
   stops: update the rule, and ask Reddy before adding a new difference.
5. Draft/modify `SKILL.md`; put conditional details in one-level `references/`.
6. Read `references/evaluation-method.md`. The central
   `.kiro/skill-evals/portfolio.json` is the canonical pilot fixture registry;
   `.kiro/skill-evals/collisions.json` owns multi-skill routing/stop cases.
   Score Claude Code runs against `.claude/skill-evals` (its names match the
   renamed copy) or map names explicitly when scoring against `.kiro`.
7. Run `python3 scripts/validate-agent-governance.py` (it checks `.kiro` only;
   the Kiro PostFileSave hook never runs under Claude Code), then parse each
   edited frontmatter in both trees with `yaml.safe_load`. Test with-skill vs
   baseline/old-skill in clean sessions. Store raw runs under ignored
   `.kiro/skill-eval-workspace/`, never in skill-creator's `<skill>-workspace/`
   sibling, which git does not ignore. Static CI validates schemas only and
   cannot prove discovery or routing in either client. CI's backend
   `pytest scripts/tests` also fails when a `.kiro` edit breaks a
   `scripts/claude-adaptations.txt` rule.
8. Add objective assertions after first outputs, record timing/tokens when
   available, grade with evidence, compare, get human feedback, and iterate.
9. Update catalog, metadata verification date, provenance, adapters and CI/hook
   coverage. Propose removing superseded packages; delete only after Reddy's
   explicit confirmation, and back up `.claude` first.

## Safety and quality

Never import/execute third-party skill code blindly. Review license, provenance,
dependencies, network/file effects, scripts, prompts, and hidden automation.
Skills must not authorize actions beyond the user's intent. Keep the main file
lean and generalize from eval failures rather than patching to prompts.
