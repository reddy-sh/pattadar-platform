"""The assistant's MCP tool servers — both of them, and nothing else.

Two in-process servers, created through the Claude Agent SDK and served over an
in-memory transport. Neither is exposed on a network, and no external MCP server
is configured.

| module | server key | tools | class |
| --- | --- | --- | --- |
| ``ui`` | ``pattadar_ui`` | 5 + 1 | intent: may propose a browser action; ``propose_add_records`` (saved chats only) shows a confirmation card |
| ``records`` | ``pattadar_records`` | 8 | read-only reference data |

The **server key** is the part that matters. The SDK builds tool names as
``mcp__<key>__<tool>`` from the key used in ``ClaudeAgentOptions.mcp_servers``,
not from the ``name=`` passed to ``create_sdk_mcp_server``. Those keys are set in
``adapters/agent_runtime.py`` and mirrored by the allowlist in
``domain/tool_policy.py``; changing one without the other breaks both.

Everything the model is allowed to call lives here. If you are looking for "the
MCP", this directory is the whole answer.
"""
from .records import build_public_record_tools, build_public_records_server
from .ui import ProposalSink, build_ui_server, build_ui_tools

__all__ = [
    "ProposalSink",
    "build_public_record_tools",
    "build_public_records_server",
    "build_ui_server",
    "build_ui_tools",
]
