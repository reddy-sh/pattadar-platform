"""The assistant's Server-Sent Event vocabulary.

These names are a published contract: apps/web/src/assistant/AssistantPanel.tsx
switches on them, and a rename is a breaking client change, not a refactor.
They are collected here so that contract is greppable from one place rather
than inferred from string literals spread across the stream translator.

Terminal behaviour, also contractual: every stream ends with ``[DONE]`` after a
keepalive preamble, so a client can tell "finished" from "connection dropped".
"""
from __future__ import annotations

#: Incremental answer text.
TOKEN = "token"
#: Model reasoning, surfaced as an activity indicator rather than raw thought.
THINKING = "thinking"
#: A tool call started / finished.
TOOL_START = "tool_start"
TOOL_END = "tool_end"
#: A validated browser command (see domain.tool_policy.action_event).
ACTION = "action"
#: A failure the user should see.
ERROR = "error"

#: Internal frame consumed by the transport, never sent to a client.
RESULT = "_result"

#: Sent verbatim to close a stream.
DONE = "data: [DONE]\n\n"
#: Sent before the first event and while waiting, so proxies keep the stream open.
KEEPALIVE = ": keepalive\n\n"

CLIENT_EVENTS = frozenset({TOKEN, THINKING, TOOL_START, TOOL_END, ACTION, ERROR})

__all__ = [
    "ACTION", "CLIENT_EVENTS", "DONE", "ERROR", "KEEPALIVE", "RESULT",
    "THINKING", "TOKEN", "TOOL_END", "TOOL_START",
]
