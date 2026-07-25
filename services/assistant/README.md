# Assistant (services/assistant)

In-app AI assistant. **Phase 3** — nothing is ported yet; this README records the porting
contract.

Ported from rhub `api/assistant` (`agent.py`, `main.py`, `config.py`, `model_registry.py`,
`telemetry.py`) plus `api/common/prompt_service.py`.

## Key facts to preserve

- **No MCP in v1**: with `MCP_URL` unset the assistant runs on its built-in
  navigate/page-action tools only. v1 ships with no MCP gateway.
- **Plain Language Only**: the prompt rule in `agent.py` must be preserved — the assistant
  never narrates endpoints, latencies, sagas, or other internals to users.
- **SSE streaming**: responses stream over SSE and must not be buffered by any proxy in
  front (ALB/CloudFront config must pass streams through).
- **PG trap**: the code's default database is `rhub`, but deployments use `hub` — always set
  `PG_DATABASE` explicitly.
- **Model catalog**: read from `platform_models` with a 30s cache, so super-admin model
  toggles propagate without a restart.

## TODO(Phase 3)

- Port the service into this directory.
- Wire the assistant panel into the web shell.
- Page-awareness context (assistant knows which screen the user is on).
- Super-admin Models screen in the web app.
