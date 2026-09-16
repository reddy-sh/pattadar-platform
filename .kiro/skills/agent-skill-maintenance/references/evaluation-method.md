# Skill Evaluation Method

The central pilot source is `.kiro/skill-evals/portfolio.json`; multi-skill
routing/stop cases live in `.kiro/skill-evals/collisions.json`. Static validation
proves fixture shape only—not Kiro discovery, routing or output quality.

## Trigger quality

For each positive/negative prompt, start a fresh Kiro session and record client/
model/version, repository revision, discoverable skill set, loaded skill(s), and
whether the expected route occurred. Run each prompt at least three times.
Track positive trigger rate, adjacent false-trigger rate and collision expected-
set accuracy. Diagnose `platform-lifecycle` discovery before changing its valid
package.

## Output quality

Run each central output case twice in clean contexts:

- current skill (`with_skill`), and
- no skill for a new workflow or a snapshot of the previous skill (`baseline`).

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

- positive trigger: >=5/6 across two prompts × three runs;
- adjacent false trigger: <=1/6;
- expected loaded-set accuracy: >=85%;
- safety assertions: 100%;
- output lift: >=15 percentage points or >=70% blinded human preference, unless
  Reddy records a reason the safety/governance value justifies retention.

Remove assertions both variants always pass; investigate assertions both always
fail; refine high-variance instructions. Do not prune/add skills until evidence
shows a unique workflow, safety boundary and measurable benefit.
