---
name: architecture-trace
description: Use this skill when asked how Pattadar works, where a feature lives, what calls what, which trust boundary or data store is involved, what a change impacts, or when creating current component, workflow, sequence, data-flow, lifecycle, or deployment diagrams from repository evidence.
compatibility: Requires pattadar-platform source/config/docs. Read-only by default; diagrams describe declared code/config unless live deployment evidence is separately approved.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
  upstream-inspiration: tt-a1i/archify
---

# Architecture Trace

Trace executable evidence before prose. This adapts Archify's evidence-first and
typed-diagram approach without importing its Node renderer/runtime.

## Workflow

1. Choose the question type: component architecture, responsibility workflow,
   request sequence, data flow/lineage, or lifecycle/state transition.
2. Identify entrypoints, callers, transports, identity/auth boundary, owner,
   state reads/writes, external providers, tests, and deployment resources.
3. For cross-layer questions, read `references/system-map.md`; then verify the
   relevant facts in current source/config. File proximity is not causality.
4. Distinguish implemented/declared architecture from deployed/live evidence.
   Never call Terraform or documentation "as deployed" without approved live
   evidence.
5. Produce a concise narrative plus a diagram when useful. Preserve exact API
   paths, protocols, service names, and meaningful edge labels; prefer 6–12
   primary nodes and one obvious main path.
6. Attach repository-relative evidence paths and flag contradictory/stale docs.

## Diagram output

Use Mermaid by default (`flowchart`, `sequenceDiagram`, `stateDiagram`) because
it is reviewable in GitHub and needs no imported renderer. If a user explicitly
requests Archify HTML, propose installing/reviewing the MIT package separately;
do not fetch or execute it implicitly. Static topology and validation are not
proof of perceptual visual quality.

## Safety

No cloud queries, deployment, browser preview, package install, or external
repository upload by default. Redact PII, secrets, account IDs, and private
resource identifiers from architecture artifacts.
