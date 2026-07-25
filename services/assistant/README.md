# Assistant (services/assistant)

In-app AI assistant. **Ported** — FastAPI service in `src/` (port 8080), image
`pattadar/assistant` in ECR. See `.env.example` for the env contract.

Ported from rhub `api/assistant` (`agent.py`, `main.py`, `config.py`, `model_registry.py`,
`telemetry.py`, `conversations.py`, `attachments.py`, `models.py`) plus
`api/common/prompt_service.py` (now `src/prompt_service.py`, with a built-in default
pattadar prompt when the `agent_prompts` table/row is absent).

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

## TODO(Phase 3 remainder)

- Page-awareness context (assistant knows which screen the user is on) — the
  service accepts `application_context` already; the web panel doesn't send it yet.
- Super-admin Models screen in the web app.
