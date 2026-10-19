"""In-process MCP server: the tools that drive the Pattadar UI.

Five browser commands, plus two offers that never command the browser:
``propose_add_records`` puts a save card in front of the user (a ``proposal``
event) and saves nothing; ``propose_service_order`` puts a service request
card (a ``service_proposal`` event) and orders nothing. Both are registered
only for saved chats; an incognito run is built without them
(allow_proposals=False).

Registered under the ``pattadar_ui`` key in
``ClaudeAgentOptions.mcp_servers``, so every tool here reaches the model as
``mcp__pattadar_ui__*``. That prefix is load-bearing: it is how the runtime
tells a UI command apart from record data when deciding what may move the
user's browser.

Runs inside this process. No UI tool is exposed as a network MCP server.
"""
from __future__ import annotations

import json
import logging
from collections import deque
from typing import Any, Awaitable, Callable

from claude_agent_sdk import ToolAnnotations, create_sdk_mcp_server, tool as sdk_tool

from ...domain.record_drafts import MAX_PROPOSAL_ITEMS, STAKES, build_proposal, parse_proposal_args
from ...domain.service_orders import (
    MAX_NOTE, MAX_SERVICE_RECORDS, MAX_SERVICE_TEXT, MAX_SERVICES, SAVED_IN_CHAT,
    build_service_proposal, parse_service_args, resolve_records,
)
from ...domain.tool_policy import (
    MAX_FIELD_VALUE_CHARS,
    PROPOSAL_TOOL,
    PROPOSAL_TOOL_RESULT,
    SERVICE_TOOL,
    SERVICE_TOOL_RESULT,
    declared_field,
    declared_form,
    safe_form_fields,
    safe_navigation,
)
from ...public_records.exceptions import PublicRecordsError

_log = logging.getLogger("pattadar.assistant.ui")

_PROPOSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "records": {
            "type": "array",
            "minItems": 1,
            "maxItems": MAX_PROPOSAL_ITEMS,
            "items": {
                "type": "object",
                "properties": {
                    "rid": {"type": "string", "maxLength": 64},
                    "s_no": {"type": "integer", "minimum": 0},
                },
                "required": ["rid"],
                "additionalProperties": False,
            },
        },
        "stake": {"type": "string", "enum": list(STAKES)},
    },
    "required": ["records"],
    "additionalProperties": False,
}


_SERVICE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "services": {
            "type": "array",
            "minItems": 1,
            "maxItems": MAX_SERVICES,
            "items": {"type": "string", "maxLength": MAX_SERVICE_TEXT},
        },
        "records": {
            "anyOf": [
                {"type": "string", "enum": [SAVED_IN_CHAT]},
                {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": MAX_SERVICE_RECORDS,
                    "items": {"type": "string", "maxLength": 64},
                },
            ],
        },
        "note": {"type": "string", "maxLength": MAX_NOTE},
    },
    "required": ["services", "records"],
    "additionalProperties": False,
}

#: Returns the records this conversation's save cards stored, owner-checked:
#: [{record_id, title}]. Injected by the HTTP layer (it owns the database).
SavedRecords = Callable[[], Awaitable[list[dict[str, Any]]]]


class ProposalSink:
    """Hands proposals from the tool handler to the stream translator.

    The model reads only PROPOSAL_TOOL_RESULT; the card body travels here, in
    process, so its rows never cost model tokens or pass through model text.
    One sink per run, drained in the order the tool calls finished.
    """

    def __init__(self) -> None:
        self._queue: deque[dict[str, Any]] = deque()

    def put(self, proposal: dict[str, Any]) -> None:
        self._queue.append(proposal)

    def take(self) -> dict[str, Any] | None:
        return self._queue.popleft() if self._queue else None


def _error(text: str) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": text}], "is_error": True}


async def _reread_rows(records_service: Any, refs: list[tuple[str, int | None]]) -> list[dict[str, Any]]:
    """Each named deed, read again from the read-only corpus. Unknown ones drop out."""
    rows: list[dict[str, Any]] = []
    for rid, s_no in refs:
        if len(rows) >= MAX_PROPOSAL_ITEMS:
            break
        try:
            found = await records_service.get_record_by_rid(rid, s_no)
        except PublicRecordsError:
            continue
        rows.extend(row for row in found if isinstance(row, dict))
    return rows[:MAX_PROPOSAL_ITEMS]


def build_ui_tools(
    navigation: list[dict],
    forms: list[dict] | None = None,
    *,
    records_service: Any = None,
    proposals: ProposalSink | None = None,
    allow_proposals: bool = False,
    service_proposals: ProposalSink | None = None,
    saved_records: SavedRecords | None = None,
) -> list[Any]:
    """Build the UI SDK tool surface for one turn's navigation tree and forms.

    ``propose_add_records`` is included only with ``allow_proposals`` and a
    records service to re-read deeds from; ``propose_service_order`` only with
    ``allow_proposals`` (``saved_records`` resolves 'saved_in_chat').
    """
    nav_lookup = safe_navigation(navigation)
    form_fields = safe_form_fields(forms or [])

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
        field = declared_field(form_fields, str(args["field"]))
        if not field:
            return {"content": [{"type": "text", "text": "No such field on the visible page."}], "is_error": True}
        value = str(args["value"])
        if len(value) > MAX_FIELD_VALUE_CHARS:
            return {"content": [{"type": "text", "text": "That value is too long for this field."}], "is_error": True}
        payload = {"action": "fill_field", "args": {"field": field, "value": value}}
        return {"content": [{"type": "text", "text": json.dumps(payload)}]}

    @sdk_tool("submit_form", "Submit the visible Pattadar form after an explicit user request.", {"form": str})
    async def submit_form(args: dict[str, Any]) -> dict[str, Any]:
        form = declared_form(form_fields, str(args.get("form") or ""))
        if not form:
            return {"content": [{"type": "text", "text": "No such form on the visible page."}], "is_error": True}
        payload = {"action": "submit_form", "args": {"form": form}}
        return {"content": [{"type": "text", "text": json.dumps(payload)}]}

    tools = [navigate_user, set_filter, open_record, fill_field, submit_form]
    if not allow_proposals:
        return tools
    tools.append(_service_tool(service_proposals, saved_records))
    if records_service is None:
        return tools
    sink = proposals if proposals is not None else ProposalSink()

    @sdk_tool(
        PROPOSAL_TOOL,
        "Offer to add public-record deeds to the user's own properties. Shows a confirmation card; "
        "NOTHING is saved until the user clicks Save. Call only after the user asks to add, save, "
        "watch or track deeds, or accepts the 'Add to your properties?' offer. Pass the rid and s_no "
        "of each deed from the latest results (1-10). Pass stake only if the user said whether it is "
        "theirs (owned), one they manage (managed), or one they are watching (watch).",
        _PROPOSE_SCHEMA,
        # Read-only is the truth: the tool itself writes nothing; only the
        # user's click on the card does, through their own session.
        annotations=ToolAnnotations(
            readOnlyHint=True, destructiveHint=False, idempotentHint=False, openWorldHint=False,
        ),
    )
    async def propose_add_records(args: dict[str, Any]) -> dict[str, Any]:
        try:
            refs, stake = parse_proposal_args(args)
        except ValueError as exc:
            return _error(str(exc))
        try:
            rows = await _reread_rows(records_service, refs)
        except Exception:
            _log.exception("proposal re-read failed")
            return _error("Public records are temporarily unavailable.")
        proposal = build_proposal(rows, stake)
        if proposal is None:
            return _error("None of those deeds were found in the public records; nothing to add.")
        sink.put(proposal)
        return {"content": [{"type": "text", "text": PROPOSAL_TOOL_RESULT}]}

    tools.insert(5, propose_add_records)
    return tools


def _service_tool(service_proposals: ProposalSink | None, saved_records: SavedRecords | None) -> Any:
    sink = service_proposals if service_proposals is not None else ProposalSink()

    @sdk_tool(
        SERVICE_TOOL,
        "Offer to request documents or services (certified copies, EC, mutation, survey, legal "
        "opinion...) for the user's own records. Shows a card with the real services and prices; "
        "NOTHING is ordered until the user clicks Place request. Call only when the user asks to "
        "request, order or apply for documents or services. services: what they asked for, in "
        "their words (1-8 short phrases, no prices). records: 'saved_in_chat' for the records saved "
        "from this chat, or the ids of the user's own records they named. note: optional detail.",
        _SERVICE_SCHEMA,
        annotations=ToolAnnotations(
            readOnlyHint=True, destructiveHint=False, idempotentHint=False, openWorldHint=False,
        ),
    )
    async def propose_service_order(args: dict[str, Any]) -> dict[str, Any]:
        try:
            requested, records, note = parse_service_args(args)
        except ValueError as exc:
            return _error(str(exc))
        saved: list[dict[str, Any]] = []
        if saved_records is not None:
            try:
                saved = await saved_records()
            except Exception:
                _log.exception("saved-in-chat records could not be read")
                if records == SAVED_IN_CHAT:
                    return _error("The records saved in this chat could not be read right now.")
        resolved = resolve_records(records, saved)
        if not resolved:
            return _error(
                "No records have been saved from this chat yet. Ask which of the user's "
                "properties the request is for, or offer to save the deeds first."
            )
        proposal = build_service_proposal(resolved, requested, note)
        if proposal is None:
            return _error("Nothing to request.")
        sink.put(proposal)
        return {"content": [{"type": "text", "text": SERVICE_TOOL_RESULT}]}

    return propose_service_order


def build_ui_server(
    navigation: list[dict],
    forms: list[dict] | None = None,
    *,
    records_service: Any = None,
    proposals: ProposalSink | None = None,
    allow_proposals: bool = False,
    service_proposals: ProposalSink | None = None,
    saved_records: SavedRecords | None = None,
):
    return create_sdk_mcp_server(
        # Informational only. The tool prefix comes from the mcp_servers
        # key (pattadar_ui) in adapters/agent_runtime.py, not from this.
        name="pattadar_ui",
        version="1.0.0",
        tools=build_ui_tools(
            navigation, forms,
            records_service=records_service, proposals=proposals, allow_proposals=allow_proposals,
            service_proposals=service_proposals, saved_records=saved_records,
        ),
    )
