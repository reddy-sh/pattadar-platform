"""In-process MCP server: the five tools that drive the Pattadar UI.

Registered under the ``pattadar_ui`` key in
``ClaudeAgentOptions.mcp_servers``, so every tool here reaches the model as
``mcp__pattadar_ui__*``. That prefix is load-bearing: it is how the runtime
tells a UI command apart from record data when deciding what may move the
user's browser.

Runs inside this process. No UI tool is exposed as a network MCP server.
"""
from __future__ import annotations

import json
from typing import Any

from claude_agent_sdk import create_sdk_mcp_server, tool as sdk_tool

from ...domain.tool_policy import safe_navigation


def build_ui_server(navigation: list[dict]):
    """Build the UI tool server for one turn's navigation tree."""
    nav_lookup = safe_navigation(navigation)

    @sdk_tool("navigate_user", "Navigate to a Pattadar page.", {"page": str})
    async def navigate_user(args: dict[str, Any]) -> dict[str, Any]:
        target = str(args.get("page") or "").strip().casefold()
        path = nav_lookup.get(target)
        if not path:
            for label, candidate in nav_lookup.items():
                if target and (target in label or label in target):
                    path = candidate
                    break
        if not path:
            return {"content": [{"type": "text", "text": "Page not found."}], "is_error": True}
        payload = {"action": "navigate", "path": path, "label": target}
        return {"content": [{"type": "text", "text": json.dumps(payload)}]}

    @sdk_tool("set_filter", "Filter the visible Pattadar list.", {"field": str, "value": str})
    async def set_filter(args: dict[str, Any]) -> dict[str, Any]:
        payload = {"action": "set_filter", "args": {"field": str(args["field"]), "value": str(args["value"])}}
        return {"content": [{"type": "text", "text": json.dumps(payload)}]}

    @sdk_tool("open_record", "Open a visible Pattadar record.", {"record_id": str})
    async def open_record(args: dict[str, Any]) -> dict[str, Any]:
        payload = {"action": "open_record", "args": {"id": str(args["record_id"])}}
        return {"content": [{"type": "text", "text": json.dumps(payload)}]}

    @sdk_tool("fill_field", "Fill a field in the visible Pattadar form without submitting.", {"field": str, "value": str})
    async def fill_field(args: dict[str, Any]) -> dict[str, Any]:
        payload = {"action": "fill_field", "args": {"field": str(args["field"]), "value": str(args["value"])}}
        return {"content": [{"type": "text", "text": json.dumps(payload)}]}

    @sdk_tool("submit_form", "Submit the visible Pattadar form after an explicit user request.", {"form": str})
    async def submit_form(args: dict[str, Any]) -> dict[str, Any]:
        payload = {"action": "submit_form", "args": {"form": str(args.get("form") or "")}}
        return {"content": [{"type": "text", "text": json.dumps(payload)}]}

    return create_sdk_mcp_server(
        # Informational only. The tool prefix comes from the mcp_servers
        # key (pattadar_ui) in adapters/agent_runtime.py, not from this.
        name="pattadar_ui",
        version="1.0.0",
        tools=[navigate_user, set_filter, open_record, fill_field, submit_form],
    )
