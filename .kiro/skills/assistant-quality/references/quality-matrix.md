# Assistant Quality Matrix

Paths are under `services/assistant/`. Text marked † describe uncommitted
feat/holdings work seen on 09/10/2026; re-verify them when it lands or is dropped.

| Dimension | Required evidence |
|---|---|
| Scope | `src/domain/scope_policy.py` `evaluate_scope` runs in `src/main.py` before attachment reads, prompt load and the SDK stream (order asserted in `tests/test_public_records_runtime.py`) |
| Identity/data | owner-scoped conversation/attachments; browser context is data, not authority |
| Transcript | PostgreSQL is the only transcript: a run leaves nothing under `~/.claude/projects`. † `src/adapters/agent_runtime.py` passes `extra_args={"no-session-persistence": None}`; HEAD lacks it and no test asserts it yet |
| Tools | built-ins disabled; exact UI/read-only record allowlists; only `mcp__pattadar_ui__*` results emit actions |
| Offers † | `proposal`/`service_proposal` save and order offers are code-built confirmation cards, never `action` commands, never in incognito; the browser saves or orders only after the user confirms and reports via `PUT /api/proposals/{id}` |
| Grounding | source limits/uncertainty; public records not identity/title/current-government proof |
| Durability | PostgreSQL messages/run state/session metadata; duplicate/busy/completed behavior; † a superseded turn (Regenerate, Edit & resend) is deleted and its run kept `failed`/`superseded` so the id never replays |
| Incognito † | `POST /api/chat/incognito/stream` writes no conversation, message, run or attachment row; browser-sent history anchors scope only through user turns that pass the gate; no attachments |
| Streaming | only `src/domain/sse_events.py` `CLIENT_EVENTS` reach the client (a published contract), keepalive preamble, terminal `[DONE]` |
| Failure | disconnect/provider failure persisted; no silent replay or duplicate action; † a known provider failure surfaces as an `error` event with a `src/domain/billing.py` code such as `credit_exhausted` |
| Model | admin `platform_models` catalog decides what is on offer and an empty catalog refuses; a browser-supplied model is honoured only if enabled there; effective model recorded. Whether end users may pick a model at all is Reddy's decision; ask before accepting a picker (HEAD ignores the field; the † picker honours enabled picks) |
| Cost/performance | bounded transcript/context, tokens/latency tracked, no accidental retries |

Start with the existing assistant suite (CI runs all of `services/assistant/tests`),
then add focused tests rather than calling a provider. Subjective response review
requires redacted synthetic cases and human feedback.
