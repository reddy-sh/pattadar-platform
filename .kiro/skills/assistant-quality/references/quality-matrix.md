# Assistant Quality Matrix

| Dimension | Required evidence |
|---|---|
| Scope | `domain_policy.py` refuses out-of-scope before file/tool/SDK work |
| Identity/data | owner-scoped conversation/attachments; browser context is data, not authority |
| Tools | built-ins disabled; exact UI/read-only record allowlists; only UI results emit actions |
| Grounding | source limits/uncertainty; public records not identity/title/current-government proof |
| Durability | PostgreSQL messages/run state/session metadata; duplicate/busy/completed behavior |
| Streaming | stable token/thinking/tool/action/error events, keepalive, terminal DONE |
| Failure | disconnect/provider failure persisted; no silent replay or duplicate action |
| Model | admin catalog authoritative; effective model recorded; no browser model control |
| Cost/performance | bounded transcript/context, tokens/latency tracked, no accidental retries |

Start with existing selected CI contracts, then add focused tests rather than
calling a provider. Subjective response review requires redacted synthetic cases
and human feedback.
