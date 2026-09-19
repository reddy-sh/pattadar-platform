"""Regression contracts for the internal-only public-record runtime."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def test_internal_public_record_contracts():
    script = r'''
import asyncio
import json
from contextlib import asynccontextmanager
from typing import Any

from claude_agent_sdk.types import PermissionResultAllow, PermissionResultDeny
from services.assistant.src.adapters.agent_runtime import AssistantAgent
from services.assistant.src.config import AssistantConfig
from services.assistant.src.domain.scope_policy import evaluate_scope
from services.assistant.src.public_records import database as database_module
from services.assistant.src.public_records.database import ReadOnlyDatabase
from services.assistant.src.public_records.exceptions import ToolInputError
from services.assistant.src.adapters.mcp import build_public_record_tools
from services.assistant.src.public_records.service import PUBLIC_RECORD_TOOL_NAMES, PublicRecordsService
from services.assistant.src.public_records.settings import PublicRecordSettings

class StubService:
    async def get_analytical_stats(self, **kwargs): return {}
    async def get_property_history(self, **kwargs): return {}
    async def search_semantic_boundaries(self, **kwargs): return []
    async def get_record_by_rid(self, *args, **kwargs): return []
    async def resolve_village(self, *args, **kwargs): return []
    async def find_properties_by_party(self, **kwargs): return []
    async def get_price_rates(self, **kwargs): return {}
    async def generate_report(self, **kwargs): return "report"

class FakeDatabase:
    def __init__(self, rows: list[dict[str, Any]]):
        self.rows = rows
        self.calls = []
    async def fetch_all(self, sql, params=None, **kwargs):
        self.calls.append((sql, params or {}))
        return list(self.rows)

class FakeCursor:
    async def fetchall(self): return [{"value": 1}]

class FakeConnection:
    def __init__(self): self.statements = []
    @asynccontextmanager
    async def transaction(self): yield
    async def execute(self, sql, params=None):
        self.statements.append((sql, params))
        return FakeCursor()
    async def close(self): pass

async def run():
    tools = build_public_record_tools(StubService())
    assert tuple(tool.name for tool in tools) == PUBLIC_RECORD_TOOL_NAMES
    for tool in tools:
        hints = tool.annotations.model_dump(by_alias=True, exclude_none=True)
        assert (hints["readOnlyHint"], hints["destructiveHint"], hints["idempotentHint"], hints["openWorldHint"]) == (True, False, True, False)

    allowed = AssistantAgent._qualified_tool_names()
    assert len(allowed) == 13
    assert {name.rsplit("__", 1)[-1] for name in allowed if "pattadar_records" in name} == set(PUBLIC_RECORD_TOOL_NAMES)
    action_json = json.dumps({"action": "navigate", "path": "/app"})
    assert AssistantAgent._action_event(action_json, "mcp__pattadar_records__get_record_by_rid") is None
    assert AssistantAgent._action_event(action_json, "mcp__pattadar_ui__navigate_user") == {"type": "action", "action": "navigate", "path": "/app"}

    agent = AssistantAgent(AssistantConfig())
    options = agent._options("claude-sonnet-4-6", [])
    assert options.tools == []
    assert options.strict_mcp_config is True
    assert options.setting_sources == []
    assert "Bash" in options.disallowed_tools
    assert isinstance(await options.can_use_tool("Bash", {}, None), PermissionResultDeny)
    assert isinstance(
        await options.can_use_tool("mcp__pattadar_records__get_record_by_rid", {"rid": "R"}, None),
        PermissionResultAllow,
    )
    hook = options.hooks["PreToolUse"][0].hooks[0]
    hook_result = await hook({"tool_name": "Bash"}, None, None)
    assert hook_result["hookSpecificOutput"]["permissionDecision"] == "deny"

    denied_scope = evaluate_scope(
        "Tell me a joke",
        {},
        has_authorized_attachment=False,
        has_prior_accepted_turn=False,
    )
    assert denied_scope.allowed is False

    unavailable = PublicRecordsService(PublicRecordSettings())
    assert await unavailable.capabilities() == {
        "ready": False,
        "status": "temporarily_unavailable",
        "tool_count": 8,
        "semantic_search_ready": False,
    }

    history = PublicRecordsService(PublicRecordSettings())
    history_db = FakeDatabase([{"rid": f"R{index}", "s_no": 1} for index in range(101)])
    history.db = history_db
    page = await history.get_property_history(rid="R", limit=100)
    assert len(page["records"]) == 100
    assert page["pagination"] == {"limit": 100, "offset": 0, "has_more": True, "next_offset": 100}
    assert "LIMIT %(page_size)s OFFSET %(page_offset)s" in history_db.calls[0][0]
    assert history_db.calls[0][1]["page_size"] == 101

    oversized = PublicRecordsService(PublicRecordSettings())
    oversized_db = FakeDatabase([{"rid": "R", "s_no": index} for index in range(201)])
    oversized.db = oversized_db
    try:
        await oversized.get_record_by_rid("R")
    except ToolInputError as exc:
        assert "more than 200" in str(exc)
    else:
        raise AssertionError("oversized document was not rejected")
    assert "LIMIT %(record_limit)s" in oversized_db.calls[0][0]
    assert oversized_db.calls[0][1]["record_limit"] == 201

    duplicate = PublicRecordsService(PublicRecordSettings())
    duplicate_db = FakeDatabase([{"rid": "R", "s_no": 1}, {"rid": "R", "s_no": 1}])
    duplicate.db = duplicate_db
    try:
        await duplicate.get_record_by_rid("R", 1)
    except ToolInputError as exc:
        assert "duplicate" in str(exc).lower()
    else:
        raise AssertionError("duplicate (rid, s_no) identity was not rejected")
    assert "LIMIT %(record_limit)s" in duplicate_db.calls[0][0]
    assert duplicate_db.calls[0][1]["record_limit"] == 2

    try:
        await oversized.generate_report(rid="R")
    except ToolInputError as exc:
        assert "more than 200" in str(exc)
    else:
        raise AssertionError("oversized dossier was not rejected")
    assert "LIMIT %(dossier_limit)s" in oversized_db.calls[1][0]

    fake_connection = FakeConnection()
    async def fake_connect(*args, **kwargs): return fake_connection
    database_module.psycopg.AsyncConnection.connect = staticmethod(fake_connect)
    read_only_db = ReadOnlyDatabase(
        PublicRecordSettings(database_dsn="configured", query_timeout_ms=4321)
    )
    rows = await read_only_db.fetch_all(
        "SELECT 1 AS value",
        local_settings={"hnsw.ef_search": 60},
    )
    assert rows == [{"value": 1}]
    assert fake_connection.statements[0][0] == "SET TRANSACTION READ ONLY"
    assert "statement_timeout" in fake_connection.statements[1][0]
    assert fake_connection.statements[1][1] == ("4321",)
    assert fake_connection.statements[2][1] == ("hnsw.ef_search", "60")
    assert fake_connection.statements[3][0] == "SELECT 1 AS value"
    try:
        await read_only_db.fetch_all("SELECT 1", local_settings={"unsafe.setting": 1})
    except ValueError:
        pass
    else:
        raise AssertionError("unsafe PostgreSQL local setting was accepted")

asyncio.run(run())
'''
    env = {**os.environ, "PYTHONPATH": str(Path.cwd())}
    subprocess.run(
        [sys.executable, "-c", script],
        check=True,
        timeout=20,
        env=env,
        capture_output=True,
        text=True,
    )

    main_source = (Path(__file__).parents[1] / "src" / "main.py").read_text()
    assert '@app.get("/api/capabilities")' in main_source
    assert "/api/mcp-servers" not in main_source
    assert '@app.get("/mcp")' not in main_source
    assert '@app.post("/mcp")' not in main_source
    scope_gate = main_source.index("decision = evaluate_scope(")
    assert scope_gate < main_source.index("build_attachment_blocks(")
    assert scope_gate < main_source.index("await agent_manager.refresh_prompt()")
    assert scope_gate < main_source.index("async for event in agent_manager.stream(")
    assert 'yield ": keepalive\\n\\n"' in main_source
    assert 'yield "data: [DONE]\\n\\n"' in main_source
