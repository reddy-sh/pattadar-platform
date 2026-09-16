---
name: prioritize-tasks
description: Use this skill when the user supplies an explicit task list and wants it ordered, cut, or scoped against stated deadlines, capacity, or competing goals. Do not use it for active incidents, security/privacy acceptance, architecture decisions, release approval, migrations, or provider activation; those belong to specialist governance skills.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
---

# Prioritize Tasks

Turn a messy list into a clear order of work. Be brief and interactive, and show
results in compact tables. Ask one thing at a time only when required information
is missing; if the user already supplied a complete list and constraints, start
classifying immediately.

## Workflow

1. Gather every task, including small or nagging items. If needed, ask short
   questions about deadlines, who is waiting, the goal served, and capacity.
2. Pick one framework from the table below and explain the choice in one line.
   Combine frameworks only when the second one resolves a real ambiguity.
3. Put every item in a box. For an uncertain item, ask one focused question.
4. Show the grouped table, then a numbered top 3–5 "do next" list. Suggest a
   protected time block for the most important item.
5. Stress-test for the pitfalls below and name what is delayed, delegated, or
   dropped.

## Framework selection

| Situation | Framework |
|---|---|
| Personal daily list reacting to pings | Eisenhower |
| Fixed time/capacity and agreement on cuts | MoSCoW |
| Initiatives competing for payoff | Value vs. Effort |
| Many ideas, then scope lock | Value vs. Effort, then MoSCoW |

## Boxes

### Eisenhower

- Urgent + important: do now.
- Important, not urgent: schedule and protect it.
- Urgent, not important: batch or delegate.
- Neither: delete.

### MoSCoW

- Must: required for this deadline.
- Should: important but not deadline-critical.
- Could: optional if capacity remains.
- Won't: explicitly out of scope this round; do not disguise it as Could.

### Value vs. Effort

- High value, low effort: quick wins.
- High value, high effort: planned big bets.
- Low value, low effort: fillers only if time remains.
- Low value, high effort: cut.

## Pitfalls

Flag recency bias, sunk cost, unclear goals, and too many Musts/quick wins. If
priorities change, ask what gets delayed or dropped, remind the user to notify
anyone affected, and rerun the remaining list.

## Brainstorm mode

If the user wants to explore rather than decide, generate options first without
ranking them. Move to classification only after the idea-generation phase ends.
