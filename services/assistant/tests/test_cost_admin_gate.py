"""AI cost details are admin-only: an owner sees no cost, model or token figure.

Admin is `PLATFORM_ADMIN_UIDS` unioned with `platform_settings 'admin.uids'`
(the API's `_is_admin`), failing closed.
"""
import asyncio
import json
from datetime import datetime, timezone
from uuid import uuid4

import pytest

ADMIN, OWNER = "admin-1", "owner-1"


class _Cursor:
    def __init__(self, row=None, rows=None):
        self.row, self.rows = row, rows or []

    async def fetchone(self):
        return self.row

    async def fetchall(self):
        return self.rows


class _Db:
    def __init__(self):
        self.executed: list[str] = []

    async def execute(self, sql, params=()):
        self.executed.append(" ".join(sql.split()))
        return _Cursor()


class _Pool:
    def __init__(self, db):
        self.db = db

    def connection(self):
        db = self.db

        class _Ctx:
            async def __aenter__(self):
                return db

            async def __aexit__(self, *exc):
                return False

        return _Ctx()


class _SettingsDb:
    """The public-records read-only DB, answering only platform_settings."""

    def __init__(self, value="", fail=False):
        self.value, self.fail, self.calls = value, fail, 0

    async def fetch_all(self, sql, params=None, **_):
        self.calls += 1
        if self.fail:
            raise RuntimeError("unreachable")
        assert "platform_settings" in sql and params == {"key": "admin.uids"}
        return [{"value": self.value}] if self.value is not None else []


class _Records:
    def __init__(self, db):
        self.db = db


@pytest.fixture()
def api(monkeypatch):
    from fastapi.testclient import TestClient

    from src import main

    db = _Db()
    monkeypatch.setattr(main, "pool", _Pool(db))
    monkeypatch.delenv("PLATFORM_ADMIN_UIDS", raising=False)
    settings = _SettingsDb(value=ADMIN)
    monkeypatch.setattr(main.agent_manager, "public_records", _Records(settings))
    return TestClient(main.app), main, db, settings


# ── who is an admin ──────────────────────────────────────────────────

def test_admin_is_the_env_list_unioned_with_the_stored_setting(api, monkeypatch):
    _, main, _, settings = api
    assert asyncio.run(main.is_admin(ADMIN)) is True, "from platform_settings"
    assert asyncio.run(main.is_admin(OWNER)) is False
    monkeypatch.setenv("PLATFORM_ADMIN_UIDS", f" {OWNER} , other")
    assert asyncio.run(main.is_admin(OWNER)) is True, "from the env bootstrap list"
    assert asyncio.run(main.is_admin("system")) is False
    assert asyncio.run(main.is_admin("  ")) is False


def test_admin_fails_closed(api, monkeypatch):
    _, main, _, settings = api
    settings.value = ""
    assert asyncio.run(main.is_admin(ADMIN)) is False, "both lists empty: nobody"
    settings.value = None
    assert asyncio.run(main.is_admin(ADMIN)) is False, "no row: nobody"
    settings.value, settings.fail = ADMIN, True
    assert asyncio.run(main.is_admin(ADMIN)) is False, "an unreadable setting is not a yes"
    monkeypatch.setenv("PLATFORM_ADMIN_UIDS", ADMIN)
    assert asyncio.run(main.is_admin(ADMIN)) is True, "the env list still works when the DB does not"


def test_nothing_is_cached(api):
    _, main, _, settings = api
    assert asyncio.run(main.is_admin(ADMIN)) is True
    settings.value = "someone-else"
    assert asyncio.run(main.is_admin(ADMIN)) is False, "a revoked admin is revoked on the next request"


# ── /api/usage and /api/usage/credit ─────────────────────────────────

def test_usage_is_403_for_an_owner_and_allowed_for_an_admin(api):
    client, _, db, _ = api
    assert client.get("/api/usage", headers={"x-user-id": OWNER}).status_code == 403
    assert not db.executed, "an owner's request never reaches the spend tables"
    ok = client.get("/api/usage", headers={"x-user-id": ADMIN})
    assert ok.status_code == 200
    assert {"today_usd", "month_usd", "balance_usd"} <= set(ok.json())


def test_credit_anchor_is_403_for_an_owner_and_allowed_for_an_admin(api):
    client, _, db, _ = api
    body = {"balance_usd": 12.5}
    assert client.put("/api/usage/credit", json=body, headers={"x-user-id": OWNER}).status_code == 403
    assert not any("r_assistant_credit" in sql for sql in db.executed), "the shared anchor is untouched"
    ok = client.put("/api/usage/credit", json=body, headers={"x-user-id": ADMIN})
    assert ok.status_code == 200 and ok.json() == {"balance_usd": 12.5}
    assert any(sql.startswith("INSERT INTO r_assistant_credit") for sql in db.executed)


# ── GET conversation ─────────────────────────────────────────────────

def _conversation_fakes(monkeypatch, main, cid):
    now = datetime.now(timezone.utc)
    conversation = {"id": cid, "user_id": "x", "title": "t", "model": "claude-sonnet-4-6",
                    "status": "active", "sdk_session_id": "s", "last_run_id": None}
    run = uuid4()
    reply_meta = {"model": "claude-sonnet-4-6", "usage": {"input_tokens": 10},
                  "cost": {"cost_usd": 0.0123}, "follow_ups": [{"label": "L", "prompt": "P"}]}
    rows = [
        {"role": "user", "content": "q", "created_at": now, "run_id": run, "metadata": {}},
        {"role": "assistant", "content": "a", "created_at": now, "run_id": run, "metadata": reply_meta},
    ]

    async def get_conversation(conn, conversation_id, user_id):
        return dict(conversation)

    async def list_messages(conn, conversation_id, user_id):
        return rows

    async def get_proposals(conn, ids, user_id):
        return {}

    async def reply_metadata(conn, conversation_id, user_id):
        return [reply_meta]

    async def list_conversations(conn, user_id, status, limit, offset):
        return [dict(conversation)]

    for name, fn in [("get_conversation", get_conversation), ("list_messages", list_messages),
                     ("get_proposals", get_proposals), ("reply_metadata", reply_metadata),
                     ("list_conversations", list_conversations)]:
        monkeypatch.setattr(main, name, fn)


def test_an_owner_reads_a_conversation_with_no_cost_or_model(api, monkeypatch):
    client, main, _, _ = api
    cid = uuid4()
    _conversation_fakes(monkeypatch, main, cid)
    body = client.get(f"/api/conversations/{cid}", headers={"x-user-id": OWNER}).json()
    assert "total_cost_usd" not in body and "model" not in body
    for message in body["messages"]:
        assert "cost_usd" not in message and "model" not in message
    reply = body["messages"][1]
    assert reply["content"] == "a" and reply["follow_ups"] == [{"label": "L", "prompt": "P"}], \
        "what the panel needs still arrives"
    listed = client.get("/api/conversations", headers={"x-user-id": OWNER}).json()["conversations"]
    assert listed and "model" not in listed[0]


def test_an_admin_reads_a_conversation_with_its_costs(api, monkeypatch):
    client, main, _, _ = api
    cid = uuid4()
    _conversation_fakes(monkeypatch, main, cid)
    body = client.get(f"/api/conversations/{cid}", headers={"x-user-id": ADMIN}).json()
    assert body["total_cost_usd"] == pytest.approx(0.0123)
    assert body["model"] == "claude-sonnet-4-6"
    assert body["messages"][1]["cost_usd"] == pytest.approx(0.0123)
    assert body["messages"][1]["model"] == "claude-sonnet-4-6"
    listed = client.get("/api/conversations", headers={"x-user-id": ADMIN}).json()["conversations"]
    assert listed[0]["model"] == "claude-sonnet-4-6"


# ── the SSE usage event ──────────────────────────────────────────────

_COST = {"cost_usd": 0.02, "input_tokens": 5, "cache_write_tokens": 1,
         "cache_read_tokens": 2, "output_tokens": 3}


def test_the_saved_chat_usage_event_shape():
    from src.main import _usage_event

    follow = [{"label": "L", "prompt": "P"}]
    assert _usage_event(False, _COST, "claude-sonnet-4-6", follow_ups=follow) == {
        "type": "usage", "follow_ups": follow,
    }
    admin = _usage_event(True, _COST, "claude-sonnet-4-6", follow_ups=follow)
    assert admin == {"type": "usage", **_COST, "model": "claude-sonnet-4-6", "follow_ups": follow}


def _incognito_events(client, uid):
    response = client.post(
        "/api/chat/incognito/stream",
        json={"message": "Show deeds for Ramesh in Peddapuram", "history": []},
        headers={"x-user-id": uid},
    )
    assert response.status_code == 200
    return [
        json.loads(line[len("data: "):]) for line in response.text.splitlines()
        if line.startswith("data: ") and line != "data: [DONE]"
    ]


@pytest.fixture()
def incognito(api, monkeypatch):
    client, main, db, settings = api
    spent: list = []

    async def stream(**_):
        yield {"type": "token", "text": "hello"}
        yield {"type": "_result", "text": "hello", "cost": dict(_COST)}

    async def refresh_prompt():
        return None

    async def add_spend(cost):
        spent.append(cost)

    monkeypatch.setattr(main, "_chosen_model", lambda requested: "claude-sonnet-4-6")
    monkeypatch.setattr(main.agent_manager, "stream", stream)
    monkeypatch.setattr(main.agent_manager, "refresh_prompt", refresh_prompt)
    monkeypatch.setattr(main.agent_manager, "_split_contextual_prompt", lambda ctx: (None, ""))
    monkeypatch.setattr(main, "_add_incognito_spend", add_spend)
    return client, spent


def test_an_owner_incognito_stream_carries_no_cost_but_is_still_accounted(incognito):
    client, spent = incognito
    events = _incognito_events(client, OWNER)
    usage = [event for event in events if event["type"] == "usage"]
    assert usage == [{"type": "usage", "incognito": True}]
    assert not any(key in event for event in events for key in (*_COST, "model"))
    assert spent == [0.02], "server-side incognito spend still counts the reply"


def test_an_admin_incognito_stream_carries_the_cost(incognito):
    client, spent = incognito
    usage = [event for event in _incognito_events(client, ADMIN) if event["type"] == "usage"]
    assert usage == [{"type": "usage", **_COST, "model": "claude-sonnet-4-6", "incognito": True}]
    assert spent == [0.02]
