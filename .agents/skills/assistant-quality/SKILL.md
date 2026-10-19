---
name: assistant-quality
description: "Use this skill when changing or evaluating the Pattadar chat assistant in services/assistant: prompts, scope policy, model choice, tool allowlists, public-record grounding, attachments, SSE behaviour, run durability, hallucination safety, token cost or quality acceptance. Prefer it over langfuse for assistant evals. Not for implementing SSE events, routes or schemas (backend-contract-change) or deed/Aadhaar reading in services/api/src/ai_reading."
compatibility: Requires services/assistant and its tests. No live Anthropic/provider calls, model activation, or production conversation access without explicit approval.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-10-09"
---

# Assistant Quality

Evaluate both answer quality and system guarantees. A fluent answer is a failure
if it escapes domain scope, invents title/identity, leaks records, emits an
unauthorized action, or cannot be durably resumed/audited.

## Boundaries

- No live Anthropic/provider call, model or catalog activation, or production
  conversation access without explicit provider, scope and cost approval.
- A new model or provider, or a prompt-behaviour, tool-surface or client-retry
  change, is reserved (`docs/architecture/ai-system.md` "Changing anything
  here"): present evidence and wait for Reddy.
- Follow those steps in the same change: update
  `docs/architecture/ai-inventory.yaml`, then run
  `python scripts/ai-boundary-guard.py --selftest` and
  `python scripts/ai-boundary-guard.py` (CI runs both).
- Document reading (`services/api/src/ai_reading`) has no quality owner yet;
  follow `ai-system.md` and ask Reddy before changing its prompts or model.
- Not this skill: SSE/route/schema implementation (backend-contract-change; this
  skill owns their quality and acceptance cases) or ai_reading's deed/Aadhaar
  extraction prompts, `IMPORT_MODEL` and reading cost.
- Adopting Langfuse goes through dependency-change, provider-activation and Reddy.
- Never send PII or private records to an unapproved eval, enable built-in
  tools, let record tools emit browser actions, or treat historical public
  records as proof of identity/ownership/current title.

## Workflow

1. Read `references/quality-matrix.md`; classify prompt/policy/tool/model/SSE/
   storage change and affected trust boundary.
2. Build representative cases: in-domain help, out-of-scope refusal, ambiguous
   land/legal question, unavailable public records, attachment ownership,
   duplicate/busy/completed run IDs, disconnect/provider failure, UI action,
   and every other matrix row the change touches.
3. Separate deterministic assertions (event order, tool allowlist, scope,
   persistence, idempotency) from human answer-quality review (clarity,
   groundedness, usefulness, uncertainty).
4. Run the baseline and the changed prompt/policy/model on the same cases;
   record model, tokens/latency/cost assumptions, failures, and variance. A
   comparison that calls a model needs the approval above first.
5. Run local contract tests via `verify-change` (CI runs all of
   `services/assistant/tests`) plus the boundary guard.
