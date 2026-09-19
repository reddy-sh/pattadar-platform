# Service layout and naming

The convention every backend service in this repository follows, and the reasons
each rule exists. Rules here are about **finding** code: a name that makes you
open a file to learn what it does has failed.

Applies to `services/api`, `services/gateway`, `services/assistant`. Client
naming lives with the client delivery skills.

## The rules

### 1. The package root is `src/`

Every service is `services/<name>/src/`, imported as `src.*`, started as
`uvicorn src.main:app`. The gateway used `app/` until 2026-09; two of three
services already used `src/`, so the odd one moved.

### 2. `main.py` is the composition root

It wires configuration, lifespan, routers and middleware. When a service is
small its HTTP handlers may still live there — but a handler in `main.py` is a
handler that has not yet found its home, not a design choice to imitate.

### 3. The directory carries the layer, the filename carries the thing

No redundant prefixes. `routes/storage.py`, never `routes_storage.py`, and never
`routes/storage_routes.py`.

| Directory | Holds | Must not |
| --- | --- | --- |
| `domain/` | pure rules and vocabulary | do I/O, import a provider SDK |
| `routes/` | HTTP surfaces | contain business rules |
| `providers/` | calls to an external model provider | be imported outside its own service |
| `adapters/` | everything else outbound: stores, runtimes, tool servers | contain HTTP handlers |
| `ports.py` | the seams the service depends on | import a concrete adapter |

### 4. `snake_case`, and no jammed compounds

`village_map.py`, not `villagemap.py`. Acronyms and product terms stay intact:
`cognito_jwt.py`, `web360.py`, `fmb_geometry.py`.

### 5. A module plus its adapter becomes a package

When `x.py` acquires an `x_provider.py`, make `x/` with `__init__.py` re-exporting
the public surface. Two siblings sharing a prefix is the signal.

### 6. Names say what a thing is, not what layer invented it

- `schemas.py` for request/response types. Never `models.py` in a codebase where
  "model" already means an LLM.
- `database.py`, not `db.py`.
- `attachment_store.py`, not `attachments.py`, when it is persistence.
- A file called `*_service.py` usually means "I could not decide": prefer the
  noun (`storage.py`) with the HTTP surface in `routes/storage.py`.
- No module alias that contradicts the filename. `import model_catalog as
  model_registry` is banned; it made the catalog look like it was owned here.

### 7. Class names match their file

`prompt_repository.py` holds `PromptRepository`. If the class is a `*Service` and
the file is a `*_repository`, one of them is wrong.

### 8. Tests mirror source

`tests/test_<module>.py`. A test that loads a module by filesystem path pins that
path — grep for `spec_from_file_location` before moving anything.

## What is deliberately NOT renamed

These are contracts. Renaming one is a coordinated change across clients,
telemetry and stored data, never a tidy-up:

| Kind | Examples |
| --- | --- |
| HTTP paths | `/import-passbook`, `/api/chat/stream` |
| MCP server keys and tool names | `pattadar_ui`, `mcp__pattadar_records__*` |
| SSE event names | `token`, `thinking`, `tool_end`, `_result` |
| Queue operation names | `import-registered-document` — written into queued rows |
| Tables and columns | `document_read_jobs`, `platform_models`, `r_conversations` |
| Environment variables | `ANTHROPIC_API_KEY`, `CRON_SECRET`, `PUBLIC_RECORDS_*` |
| Log and metric keys | `ai.usage`, `model_registry.*`, `tool_calls_total{server=}` |
| S3 object keys | `{owner}/{node}/{version}`, `assistant/` prefix |

The `model_registry.*` log keys are the clearest case: the module is now
`model_catalog.py` and the class is `ModelCatalog`, but the log keys stayed,
because something may be alerting on them.

## Current layout

```
services/api/src/
  main.py                  composition root (still holds most handlers)
  ai_reading/              AI document reading — see ai-system.md
    routes.py operations.py prompts.py usage.py config.py consent.py ports.py
    jobs.py                the durable queue and document_read_jobs
    providers/anthropic.py the only provider call in this service
  account.py associates.py capabilities.py ticketing.py notify.py
  payments.py payments_provider.py     (candidate for a payments/ package)
  village_map.py fmb_geometry.py web360.py

services/gateway/src/
  main.py database.py auth.py cognito_jwt.py local_issuer.py
  storage.py               storage domain logic
  public_graphql.py        the one parsed anonymous mutation surface
  routes/                  account.py capabilities.py storage.py proxy.py
  ai_catalog/              routes.py providers/{base,anthropic}.py

services/assistant/src/
  main.py                  composition root + HTTP/SSE transport
  config.py schemas.py ports.py telemetry.py account_export.py
  domain/                  scope_policy.py tool_policy.py sse_events.py
  adapters/
    agent_runtime.py       Claude Agent SDK glue
    mcp/                   ui.py records.py  ← both MCP servers, nothing else
    model_catalog.py prompt_repository.py
    attachment_store.py conversation_store.py
  public_records/          the read-only corpus behind the record tools
```

## Known deviations

| Deviation | Why it stands |
| --- | --- |
| `api/src/main.py` is ~6.7k lines and `web360.py` ~7.8k | splitting them needs route-level tests first |
| `api` handlers are not in a `routes/` package | same reason |
| `payments.py` + `payments_provider.py` not yet a package | `payments.py` carries a dual-import fallback for direct execution; needs its own change |
| assistant routes live in `main.py` | a guard test asserts the scope gate precedes attachment, prompt and model work *in that file* |

## Enforcement

`scripts/ai-boundary-guard.py` enforces the AI-specific placement rules and
verifies that every path named in `ai-inventory.yaml` exists. The rest of this
document is reviewed by hand.
