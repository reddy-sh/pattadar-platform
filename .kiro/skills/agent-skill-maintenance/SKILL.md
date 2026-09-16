---
name: agent-skill-maintenance
description: Use this skill when creating, adapting, reviewing, evaluating, debugging discovery/triggering, or pruning Pattadar Agent Skills, steering, hooks, catalogs, cross-tool adapters, or skill validators; and when measuring whether a skill improves outcomes versus a baseline.
compatibility: Requires pattadar-platform .kiro configuration and Python 3. Actual Kiro trigger/output runs require fresh sessions and cannot be proven by static CI alone.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
  upstream-inspiration: anthropics/skills-skill-creator
---

# Agent Skill Maintenance

Own the portfolio as a system, not a pile of prompts. Keep one canonical package
per workflow, precise trigger boundaries, progressive disclosure, and measured
benefit over a no-skill or previous-version baseline.

## Workflow

1. Capture intent, triggering contexts/near-misses, expected output, safety
   boundary, dependencies, and why this belongs in a skill rather than steering,
   hook, CI, runbook, or ordinary agent judgment.
2. Audit adjacent skills and cross-tool copies before creating anything. Prefer
   composition or a thin adapter over duplicated full instructions.
3. Draft/modify `SKILL.md`; put conditional details in one-level `references/`.
4. Read `references/evaluation-method.md`. The central
   `.kiro/skill-evals/portfolio.json` is the canonical pilot fixture registry;
   `.kiro/skill-evals/collisions.json` owns multi-skill routing/stop cases.
5. Run static validators, then test with-skill vs baseline/old-skill in clean
   sessions. Store raw runs under ignored `.kiro/skill-eval-workspace/`; static
   CI validates schemas only and cannot prove Kiro discovery or model routing.
6. Add objective assertions after first outputs, record timing/tokens when
   available, grade with evidence, compare, get human feedback, and iterate.
7. Update catalog, metadata verification date, provenance, adapters, CI/hook
   coverage, and remove superseded packages.

## Safety and quality

Never import/execute third-party skill code blindly. Review license, provenance,
dependencies, network/file effects, scripts, prompts, and hidden automation.
Skills must not authorize actions beyond the user's intent. Keep the main file
lean and generalize from eval failures rather than patching to prompts.
