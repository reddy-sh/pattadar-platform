---
name: assistant-quality
description: Use this skill when changing or evaluating Pattadar assistant prompts, domain policy, model selection, tool allowlists, public-record grounding, attachment context, SSE events, conversation/run durability, hallucination safety, token/cost behavior, or assistant quality acceptance.
compatibility: Requires services/assistant and its tests. No live Anthropic/provider calls, model activation, or production conversation access without explicit approval.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
---

# Assistant Quality

Evaluate both answer quality and system guarantees. A fluent answer is a failure
if it escapes domain scope, invents title/identity, leaks records, emits an
unauthorized action, or cannot be durably resumed/audited.

## Workflow

1. Read `references/quality-matrix.md`; classify prompt/policy/tool/model/SSE/
   storage change and affected trust boundary.
2. Build representative cases: in-domain help, out-of-scope refusal, ambiguous
   land/legal question, unavailable public records, attachment ownership,
   duplicate/busy/completed run IDs, disconnect/provider failure, and UI action.
3. Separate deterministic assertions (event order, tool allowlist, scope,
   persistence, idempotency) from human answer-quality review (clarity,
   groundedness, usefulness, uncertainty).
4. Compare with-skill/prompt/model versions on the same cases; record model,
   tokens/latency/cost assumptions, failures, and variance.
5. Run selected local contract tests via `verify-change`. Live model calls or
   catalog activation require explicit provider/scope/cost approval.

Never send PII or private records to an unapproved eval, enable built-in tools,
let record tools emit browser actions, or treat historical public records as
proof of identity/ownership/current title.
