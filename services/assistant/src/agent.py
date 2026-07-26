"""LangGraph agent for the Pattadar Assistant — stateful ReAct agent.

Ported from the predecessor's api/assistant/agent.py. Differences:
- MCP is optional and OFF by default (MCP_URL empty): the agent runs with
  only its built-in navigate/page-action tools. The MCP client wiring stays
  so a gateway can be plugged in later via MCP_URL.
- The Jira instructions block in _build_contextual_prompt is deleted
  (predecessor-only). The "Plain Language Only" rule is kept VERBATIM — it is a
  product invariant.
- The baseline navigation lookup covers the Pattadar web shell routes.
"""

import asyncio
import json
import logging
from typing import Optional

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AnyMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool as langgraph_tool
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.prebuilt import create_react_agent
from langgraph.prebuilt.chat_agent_executor import AgentState

from .config import AssistantConfig
from .prompt_service import PromptService

_log = logging.getLogger("pattadar.assistant.agent")

from . import model_registry as _mr


class AssistantAgent:
    """Manages the LangGraph agent lifecycle with per-model agent instances."""

    def __init__(self, config: AssistantConfig):
        self.config = config
        self._checkpointer: Optional[AsyncPostgresSaver] = None
        self._checkpointer_cm = None
        self._mcp_client: Optional[MultiServerMCPClient] = None
        self._mcp_tools: list = []
        self._cached_prompt: str = ""

    async def initialize(self) -> None:
        """Set up checkpointer and MCP tools. Agents are built per-request for hot-reload."""
        _log.info("Initializing Assistant service...")

        # 1. PostgreSQL checkpointer
        _log.info(
            "Connecting checkpointer to host=%s port=%s dbname=%s",
            self.config.pg_host, self.config.pg_port, self.config.pg_database,
        )
        try:
            self._checkpointer_cm = AsyncPostgresSaver.from_conn_string(
                self.config.async_db_uri
            )
            self._checkpointer = await self._checkpointer_cm.__aenter__()
            await self._checkpointer.setup()
            _log.info("Checkpointer ready (PostgreSQL)")
        except Exception:
            _log.exception(
                "FATAL: Checkpointer setup failed — assistant will not work. "
                "Ensure the database '%s' exists and is accessible.",
                self.config.pg_database,
            )
            raise

        # 2. Load prompt from DB (or fall back to the built-in default)
        await self.refresh_prompt()

        # 3. MCP tools (optional — MCP_URL unset is the supported no-MCP path).
        # Loaded in background so startup completes quickly and health probes pass.
        if not (self.config.mcp_url or "").strip():
            _log.info("MCP_URL unset — running with built-in tools only")
        else:
            asyncio.create_task(self._load_mcp_tools())

        _log.info("Pattadar Assistant initialized (agents built per-request)")

    async def _load_mcp_tools(self, max_retries: int = 5) -> None:
        """Load MCP tools with retry — the MCP gateway may start after the assistant."""
        server_config: dict = {
            "url": self.config.mcp_url,
            "transport": "streamable_http",
            "terminate_on_close": False,
        }
        if self.config.mcp_auth_token:
            server_config["headers"] = {
                "Authorization": f"Bearer {self.config.mcp_auth_token}",
            }
        for attempt in range(1, max_retries + 1):
            try:
                self._mcp_client = MultiServerMCPClient(
                    {"platform": server_config}
                )
                self._mcp_tools = await self._mcp_client.get_tools()
                _log.info("MCP tools loaded: %d tools (attempt %d)", len(self._mcp_tools), attempt)
                return
            except Exception as e:
                if attempt < max_retries:
                    delay = min(30, 2 ** attempt)
                    _log.warning(
                        "MCP tools unavailable (attempt %d/%d, retry in %ds): %s",
                        attempt, max_retries, delay, e,
                    )
                    await asyncio.sleep(delay)
                else:
                    _log.warning(
                        "MCP tools unavailable after %d attempts (MCP server may be down): %s",
                        max_retries, e, exc_info=True,
                    )

    async def refresh_prompt(self) -> None:
        """Refresh the cached prompt from DB. Call before each chat request."""
        self._cached_prompt = await PromptService.get_instance().get("assistant")

    @staticmethod
    def _dynamic_prompt(state: AgentState, config: RunnableConfig) -> list[AnyMessage]:
        """Dynamic prompt that reads system_prompt from config on every call.

        This ensures the contextual prompt (with live app context) is always
        applied fresh — even on follow-up messages in the same conversation.
        """
        system_prompt = config["configurable"].get("system_prompt", "")
        return [{"role": "system", "content": system_prompt}] + state["messages"]

    @staticmethod
    def _build_navigate_tool(navigation: list[dict]):
        """Build a navigate_user tool with the current navigation context baked in."""
        # Shell-level routes that are ALWAYS reachable regardless of what
        # navigation snapshot (if any) the frontend sent. These mirror the
        # Pattadar web AppShell sidebar.
        nav_lookup: dict[str, str] = {
            "dashboard": "/app",
            "home": "/app",
            "parcels": "/app/parcels",
            "passbooks": "/app/passbooks",
            "properties": "/app/properties",
            "documents": "/app/documents",
            "deeds": "/app/deeds",
            "groups": "/app/groups",
            "family": "/app/groups",
            "invitations": "/app/invitations",
            "wallet": "/app/wallet",
            "sro offices": "/app/sro",
            "sro": "/app/sro",
            "stamp duty": "/app/stamp-duty",
            "market value": "/app/market-value",
            "calculator": "/app/calculator",
            "notifications": "/app/notifications",
            "audit": "/app/audit",
            "admin": "/app/admin",
            "profile": "/app/profile",
        }
        # App-specific menu items override the baseline by label so the LLM
        # prefers in-app navigation when there's a collision.
        def _flatten(items: list[dict]) -> None:
            for item in items:
                label = (item.get("label") or "").strip().lower()
                path = item.get("path", "")
                if label and path:
                    nav_lookup[label] = path
                children = item.get("children", [])
                if children:
                    _flatten(children)
        _flatten(navigation)

        @langgraph_tool
        def navigate_user(page: str) -> str:
            """Navigate the user's browser to a specific page in the app.

            Use this when the user asks to "go to", "open", "show me", or "navigate to" a page.
            The page parameter should be the name of a sidebar menu item (e.g. "Parcels", "Documents", "Wallet").
            This performs instant SPA navigation without page reload.
            """
            target = page.strip().lower()
            # Exact match
            if target in nav_lookup:
                return json.dumps({"action": "navigate", "path": nav_lookup[target], "label": page})
            # Partial / fuzzy match
            for label, path in nav_lookup.items():
                if target in label or label in target:
                    return json.dumps({"action": "navigate", "path": path, "label": label})
            # Fallback: treat as a raw path
            if page.startswith("/"):
                return json.dumps({"action": "navigate", "path": page, "label": page})
            return json.dumps({"error": f"Page '{page}' not found in navigation. Available: {', '.join(nav_lookup.keys())}"})

        return navigate_user

    @staticmethod
    def _build_action_tools():
        """Fire-and-forget tools that act on the app the user is currently viewing.

        Each returns a JSON {"action", "args"} envelope. The /api/chat/stream
        SSE loop forwards it to the browser as an `action` event, which the
        open app handles via a `shell-action` listener. Generic verbs only —
        the app decides how to interpret them for its own UI.
        """
        @langgraph_tool
        def set_filter(field: str, value: str) -> str:
            """Filter the data shown on the current page by a column/field value.

            Use when the user asks to filter, search within, or narrow down a
            list or table that is on screen.
            """
            return json.dumps({"action": "set_filter", "args": {"field": field, "value": value}})

        @langgraph_tool
        def open_record(record_id: str) -> str:
            """Open a specific record/row in the current app by its id.

            Use when the user asks to open, view details of, or select a
            specific item on screen.
            """
            return json.dumps({"action": "open_record", "args": {"id": record_id}})

        @langgraph_tool
        def fill_field(field: str, value: str) -> str:
            """Fill a form field on the current page with a value (does not submit).

            Use when the user asks to enter, set, or type a value into a field
            on screen.
            """
            return json.dumps({"action": "fill_field", "args": {"field": field, "value": value}})

        @langgraph_tool
        def submit_form(form: str = "") -> str:
            """Submit the form currently on screen.

            Use only when the user explicitly asks to submit, save, or apply
            the form. The app may ask the user to confirm before committing.
            """
            return json.dumps({"action": "submit_form", "args": {"form": form}})

        return [set_filter, open_record, fill_field, submit_form]

    def _build_agent(self, model: str, tools: list | None = None):
        """Build a LangGraph agent with a dynamic prompt."""
        llm = ChatAnthropic(
            model=model,
            anthropic_api_key=self.config.anthropic_api_key,
            streaming=True,
            max_tokens=16000,
            thinking={"type": "enabled", "budget_tokens": 10000},
        )
        return create_react_agent(
            llm,
            tools=tools if tools is not None else self._mcp_tools,
            checkpointer=self._checkpointer,
            prompt=self._dynamic_prompt,
        )

    async def _ensure_mcp_tools(self) -> None:
        """Lazy retry: if MCP tools failed at startup, try once more."""
        if not self._mcp_tools and (self.config.mcp_url or "").strip():
            _log.info("MCP tools empty — attempting lazy reload...")
            await self._load_mcp_tools(max_retries=2)

    def get_agent(self, model: str | None = None, navigation: list[dict] | None = None):
        """Get agent for a specific model, built with the latest cached prompt."""
        m = model or self.config.model
        if not _mr.get_registry().is_supported(m):
            m = self.config.model
        # Always register the navigate_user tool — even when the frontend's
        # navigation snapshot is empty the user can still ask to go to shell
        # pages (Dashboard / Parcels / Wallet / ...), which the tool's
        # baseline lookup handles.
        extra_tools = [self._build_navigate_tool(navigation or [])] + self._build_action_tools()
        return self._build_agent(m, tools=self._mcp_tools + extra_tools)

    def get_agent_with_servers(self, model: str | None = None, enabled_servers: list[str] | None = None, navigation: list[dict] | None = None):
        """Get agent, optionally filtering MCP tools by server namespace."""
        # Same rationale as get_agent: navigate_user is always available.
        extra_tools = [self._build_navigate_tool(navigation or [])] + self._build_action_tools()

        if enabled_servers is None:
            base_tools = self._mcp_tools
        else:
            base_tools = [
                t for t in self._mcp_tools
                if any(t.name.startswith(f"{ns}_") for ns in enabled_servers)
            ]
            if not base_tools:
                base_tools = self._mcp_tools

        all_tools = base_tools + extra_tools
        m = model or self.config.model
        if not _mr.get_registry().is_supported(m):
            m = self.config.model
        return self._build_agent(m, tools=all_tools)

    def _build_contextual_prompt(self, application_context: dict) -> str:
        """Merge static system prompt with live page awareness context.

        The frontend sends a PageSnapshot with four layers:
          1. Identity — app + page (path, menuItem)
          2. Navigation — full sidebar menu tree (all pages the user can visit)
          3. Insights — visible UI components (tables, charts, forms, errors, metrics)
          4. API calls — recent authFetch calls (endpoint, method, status, latency)
        """
        base = self._cached_prompt
        if not application_context:
            return base

        # Accept both new "insights" key and legacy "components" key
        insights = application_context.get("insights") or application_context.get("components", [])
        app = application_context.get("app") or {}
        page = application_context.get("page") or {}
        navigation = application_context.get("navigation", [])
        api_calls = application_context.get("apiCalls", [])

        # Skip if nothing to show
        if not app and not insights and not api_calls and not navigation:
            return base

        lines = ["\n\n## What the User Sees Right Now"]
        if app:
            lines.append(
                f"The user is currently in **{app.get('name', 'Unknown')}**."
            )
        page_label = page.get("menuItem") or page.get("path", "/")
        if not app and insights:
            page_label = insights[0].get("label", page_label)
        lines.append(f"They are viewing: **{page_label}**")

        # ── Audience & Voice ─────────────────────────────────────────────
        # The in-app assistant serves the *end user* of the app, not a
        # developer. Everything below (endpoints, latencies, internal
        # service names) is context for the model to reason with — it must
        # never be narrated back to the user.
        lines.append(
            "\n## How to Speak Here — Plain Language Only\n"
            "You are talking to a **business user of this app**, not an engineer. In your "
            "replies, NEVER volunteer or explain technical/implementation details: API routes "
            "or endpoints, HTTP methods or status codes, response times/latency, internal "
            "service names, sagas, GraphQL, polling, or how the system works \"under the "
            "hood\". Do NOT produce sections like \"What's Happening Under the Hood\". The "
            "technical context in this prompt is for YOUR understanding only — use it silently "
            "to answer accurately and to drive actions. Speak only about what the app does for "
            "the user, in plain, everyday language.\n"
            "(The one exception is a Jira ticket you create for developers: its description may "
            "carry technical hints, since that is a developer artifact, not conversation.)"
        )

        # ── Navigation ────────────────────────────────────────────────────
        if navigation:
            def _fmt_nav(items: list, indent: int = 0) -> list[str]:
                out = []
                for item in items:
                    label = item.get("label", "?")
                    path = item.get("path", "/")
                    prefix = "  " * indent + "- "
                    out.append(f"{prefix}**{label}** (`{path}`)")
                    children = item.get("children", [])
                    if children:
                        out.extend(_fmt_nav(children, indent + 1))
                return out

            lines.append("\n### Sidebar Navigation — Pages the User Can Visit")
            lines.extend(_fmt_nav(navigation))
            lines.append(
                "\n**You have a `navigate_user` tool.** When the user mentions a page by "
                "name (e.g. 'go to Parcels', 'open Documents'), call `navigate_user` to "
                "take them there instantly. NEVER say 'I cannot navigate'."
            )

        # ── API calls (what the page fetched) ────────────────────────────
        if api_calls:
            lines.append("\n### API Calls Made by This Page")
            for call in api_calls[:15]:
                status = call.get("status", "?")
                duration = call.get("durationMs")
                dur_str = f" ({duration}ms)" if duration else ""
                lines.append(
                    f"- `{call.get('method', 'GET')} {call.get('endpoint', '?')}` → {status}{dur_str}"
                )
            lines.append(
                "\n**Internal only — never surface to the user.** This tells YOU which data "
                "the page loaded and how, so you can answer accurately and drive actions. Do "
                "NOT mention endpoints, methods, status codes, or response times to the user."
            )

        # ── Errors ───────────────────────────────────────────────────────
        errors = [c for c in insights if c.get("type") == "error"]
        if errors:
            lines.append("\n### Errors on Screen")
            for err in errors:
                d = err.get("data", {})
                if isinstance(d, dict):
                    lines.append(
                        f"- **{err.get('label', 'Error')}**: {d.get('message', 'Unknown')} "
                        f"(endpoint: {d.get('endpoint', 'N/A')}, code: {d.get('code', 'N/A')})"
                    )
            lines.append(
                "\nThe user can see these errors. If they ask about errors, "
                "explain them in plain language using this information."
            )

        # ── Tables / data ────────────────────────────────────────────────
        tables = [c for c in insights if c.get("type") == "table"]
        if tables:
            lines.append("\n### Data on Screen")
            for t in tables:
                meta = t.get("meta", {}) if isinstance(t.get("meta"), dict) else {}
                raw = t.get("data")
                if isinstance(raw, dict):
                    total = int(raw.get("rowCount") or raw.get("totalRows") or 0)
                    cols = raw.get("columns") or meta.get("columns", [])
                    col_names = [str(c) for c in cols] if isinstance(cols, list) else []
                    lines.append(
                        f"- **{t.get('label', 'Table')}**: {total} rows, columns: {', '.join(col_names)}"
                    )
                    # Include sample data
                    for key in ("rows", "items", "records"):
                        sample_data = raw.get(key)
                        if isinstance(sample_data, list) and sample_data:
                            lines.append(f"  Sample: {json.dumps(sample_data[:20], default=str)[:2000]}")
                            break
                else:
                    total = meta.get("totalRows", len(raw) if isinstance(raw, list) else 0)
                    cols = meta.get("columns", [])
                    lines.append(
                        f"- **{t.get('label', 'Table')}**: {total} rows, columns: {', '.join(str(c) for c in cols)}"
                    )
                    sample = raw[:5] if isinstance(raw, list) else []
                    if sample:
                        lines.append(f"  Sample: {json.dumps(sample, default=str)[:500]}")

        # ── Charts ───────────────────────────────────────────────────────
        charts = [c for c in insights if c.get("type") == "chart"]
        if charts:
            lines.append("\n### Charts on Screen")
            for ch in charts:
                meta = ch.get("meta", {}) if isinstance(ch.get("meta"), dict) else {}
                lines.append(f"- **{ch.get('label', 'Chart')}** ({meta.get('chartType', 'chart')})")

        # ── Forms ────────────────────────────────────────────────────────
        forms = [c for c in insights if c.get("type") == "form"]
        if forms:
            lines.append("\n### Forms on Screen")
            for f in forms:
                lines.append(f"- **{f.get('label', 'Form')}**: {json.dumps(f.get('data', {}), default=str)[:300]}")

        # ── Metrics ──────────────────────────────────────────────────────
        metrics = [c for c in insights if c.get("type") == "metric"]
        if metrics:
            lines.append("\n### Metrics on Screen")
            for m in metrics:
                lines.append(f"- **{m.get('label', 'Metric')}**: {m.get('data')}")

        lines.append(
            "\nUse this context to give specific, informed answers. "
            "Reference the actual data, error messages, and application details when relevant. "
            "Do not ask the user for information that is already in the context above."
        )

        return base + "\n".join(lines)

    @property
    def agent(self):
        """Default agent (backward compatible)."""
        return self.get_agent()

    async def shutdown(self) -> None:
        """Clean up resources."""
        if self._mcp_client:
            try:
                await self._mcp_client.__aexit__(None, None, None)
            except Exception:
                pass
        if self._checkpointer_cm:
            try:
                await self._checkpointer_cm.__aexit__(None, None, None)
            except Exception:
                pass
        _log.info("Pattadar Assistant agents shut down")
