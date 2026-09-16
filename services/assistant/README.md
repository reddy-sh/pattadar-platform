# Pattadar Assistant (`services/assistant`)

Deployed FastAPI service for the in-app Pattadar assistant. It is the only
assistant process: FastAPI, `ClaudeSDKClient`, five UI tools, and eight
historical public-record tools all run in this service. There is no external or
public tool server, transport endpoint, URL, token, or second process.

## Architecture and invariants

- **Runtime:** `ClaudeSDKClient` with the exact version pinned in
  `requirements.txt`; LangGraph/LangChain are not runtime dependencies.
- **Durability:** PostgreSQL owns conversations, ordered messages, idempotent
  run state, and SDK session metadata. SDK-local files are ephemeral.
- **Scope:** `src/domain_policy.py` denies out-of-scope requests before file
  content, SDK execution, or tools. Browser context is data, not authorization.
- **Models:** the administrator-owned `platform_models` catalog is authoritative;
  the browser has no model controls.
- **Tools:** built-in Claude tools are disabled. The exact allowlist contains
  five in-process UI tools and eight in-process, read-only record tools under
  the internal `pattadar_records` SDK server key.
- **Action isolation:** only `mcp__pattadar_ui__*` tool results can emit browser
  actions. Record output is always treated as data.
- **SSE:** `token`, `thinking`, `tool_start`, `tool_end`, `action`, and `error`
  remain stable, with an initial keepalive and one terminal `[DONE]`.
- **Attachments:** owner-scoped uploads are durable in PostgreSQL BYTEA or S3;
  legacy disk files remain readable during migration.
- **Public records:** the corpus connection is independent from conversation
  storage. Every query uses a read-only transaction and statement timeout.
  An outage changes `/api/capabilities` to `temporarily_unavailable` but does
  not fail service health, conversation history, uploads, or product help.
- **Legal boundary:** corpus results are historical references, not proof of
  identity, ownership, current title, or a live government lookup. `(rid,
  s_no)` is the record identity, and source extent units are never converted.

## Public-record configuration

Use `PUBLIC_RECORDS_DATABASE_URL` or `PUBLIC_RECORDS_PG_*` with a dedicated
SELECT-only PostgreSQL role. The schema/table defaults match the migrated
`land.real_estate_records`, `land.party`, and `land.boundary_vectors` corpus.
No record database setting is sent to the browser.

Semantic boundary search keeps the source bge-m3/1024-dimension/cosine contract
but is lazy and optional because the model is large. Install
`requirements-semantic.txt`, set `PUBLIC_RECORDS_EMBEDDINGS_ENABLED=1`, and
provide model cache/memory capacity. Without it, the other seven record
operations remain available and capability output explicitly reports semantic
search as unavailable.

## Local validation

```sh
python -m compileall -q services/assistant/src
python -m pytest -q services/assistant/tests/test_attachment_storage.py services/assistant/tests/test_attachment_migration.py
python -m pytest -q services/assistant/tests/test_public_records_runtime.py
bun run --filter @pattadar/web typecheck
bun run --filter @pattadar/web build
```

`./scripts/start-local.sh` starts API `:8080`, assistant `:8081`, gateway
`:8082`, and the web app. The assistant remains behind the authenticated gateway
that injects `x-user-id`.
