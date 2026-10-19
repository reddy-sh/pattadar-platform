"""Service requests from chat: the model names what was asked for, a card
prices it, only the user's click places it.

Covers the tool (resolves 'saved_in_chat' from this chat's stored save cards,
never from the model), the event guard, the run wiring (incognito has no tool
and no event), the stored offer's forward-only state machine for both kinds,
the endpoints (PUT both kinds, GET split + total_cost_usd), the chat-level
certified-copy follow-up, and the per-chat cost sum. No network, no database.
"""
import asyncio
from uuid import UUID, uuid4

import pytest
from claude_agent_sdk import AssistantMessage, ResultMessage, ToolResultBlock, ToolUseBlock, UserMessage

from src.adapters import agent_runtime
from src.adapters.conversation_store import (
    SERVICE_TRANSITIONS,
    proposal_out,
    saved_records_from_rows,
    update_proposal,
)
from src.adapters.mcp.ui import ProposalSink, build_ui_tools
from src.config import AssistantConfig
from src.domain import billing, service_orders, tool_policy
from src.domain.follow_ups import CERTIFIED_LABEL, CERTIFIED_PROMPT, chat_follow_ups
from src.domain.scope_policy import evaluate_scope

SERVICE = tool_policy.SERVICE_TOOL_QUALIFIED

SAVED_ROW = {
    "id": "11111111-1111-1111-1111-111111111111", "kind": "records", "status": "saved",
    "draft": {"type": "proposal", "items": [
        {"index": 0, "title": "Plot 14, KONDAPUR", "village": "KONDAPUR", "survey_no": "214/2"},
        {"index": 1, "title": None, "village": "GUNADALA", "survey_no": "12"},
        {"index": 2, "title": "Failed one"},
    ]},
    "results": [
        {"index": 0, "record_id": "rec-1", "error": None},
        {"index": 1, "record_id": "rec-2", "error": None},
        {"index": 2, "record_id": None, "error": "network"},
    ],
}


def _saved(rows=(SAVED_ROW,)):
    async def read():
        return saved_records_from_rows(list(rows))
    return read


def _tool(saved=None, sink=None, allow=True):
    tools = build_ui_tools([], [], allow_proposals=allow, service_proposals=sink, saved_records=saved)
    return {tool.name: tool for tool in tools}


# ── stored save cards → saved records ────────────────────────────────

def test_saved_records_come_only_from_saved_results_of_save_cards():
    dismissed = {**SAVED_ROW, "id": "x", "status": "dismissed",
                 "results": [{"index": 0, "record_id": "rec-9"}]}
    service = {**SAVED_ROW, "id": "y", "kind": "service"}
    again = {**SAVED_ROW, "id": "z"}  # same record ids saved twice → listed once
    assert saved_records_from_rows([SAVED_ROW, dismissed, service, again]) == [
        {"record_id": "rec-1", "title": "Plot 14, KONDAPUR"},
        {"record_id": "rec-2", "title": "GUNADALA, 12"},
    ]


# ── the tool ─────────────────────────────────────────────────────────

def test_saved_in_chat_resolves_to_this_chats_saved_records_and_orders_nothing():
    sink = ProposalSink()
    tool = _tool(_saved(), sink)["propose_service_order"]
    result = asyncio.run(tool.handler({
        "services": ["certified copy", "  Certified   copy ", "EC for 30 years"],
        "records": "saved_in_chat", "note": "urgent\x00please",
    }))
    assert result["content"][0]["text"] == tool_policy.SERVICE_TOOL_RESULT
    assert "do not say it was ordered" in result["content"][0]["text"]
    proposal = sink.take()
    assert sink.take() is None
    assert proposal["type"] == "service_proposal" and proposal["status"] == "draft"
    assert [r["record_id"] for r in proposal["records"]] == ["rec-1", "rec-2"]
    assert proposal["requested"] == ["certified copy", "EC for 30 years"], "deduped, whitespace folded"
    assert proposal["note"] == "urgent please"
    assert "rec-1" not in result["content"][0]["text"], "the card body never goes through the model"


def test_named_ids_keep_a_saved_title_and_otherwise_carry_none():
    sink = ProposalSink()
    tool = _tool(_saved(), sink)["propose_service_order"]
    asyncio.run(tool.handler({"services": ["mutation"], "records": ["rec-2", "rec-77", "rec-2"]}))
    assert sink.take()["records"] == [
        {"record_id": "rec-2", "title": "GUNADALA, 12"}, {"record_id": "rec-77", "title": None}]


def test_nothing_saved_in_chat_is_an_error_and_no_card():
    sink = ProposalSink()
    tool = _tool(_saved(rows=()), sink)["propose_service_order"]
    result = asyncio.run(tool.handler({"services": ["certified copy"], "records": "saved_in_chat"}))
    assert result["is_error"] is True and sink.take() is None


def test_unreadable_saved_records_fail_closed_for_saved_in_chat_only():
    async def broken():
        raise RuntimeError("db down")
    sink = ProposalSink()
    tool = _tool(broken, sink)["propose_service_order"]
    assert asyncio.run(tool.handler({"services": ["x"], "records": "saved_in_chat"}))["is_error"] is True
    assert not asyncio.run(tool.handler({"services": ["x"], "records": ["rec-5"]})).get("is_error")
    assert sink.take()["records"] == [{"record_id": "rec-5", "title": None}]


@pytest.mark.parametrize("args", [
    {"services": [], "records": "saved_in_chat"},
    {"services": ["a"] * 1 + [f"s{i}" for i in range(8)], "records": "saved_in_chat"},
    {"services": ["copy"], "records": "everything"},
    {"services": ["copy"], "records": ["<script>"]},
    {"services": ["copy"], "records": [f"r{i}" for i in range(11)]},
    {"services": ["   "], "records": ["rec-1"]},
])
def test_bad_arguments_are_refused(args):
    sink = ProposalSink()
    result = asyncio.run(_tool(_saved(), sink)["propose_service_order"].handler(args))
    assert result["is_error"] is True and sink.take() is None


def test_the_schema_takes_words_and_records_never_prices_or_offer_keys():
    schema = _tool(_saved())["propose_service_order"].input_schema
    assert set(schema["properties"]) == {"services", "records", "note"}
    assert schema["additionalProperties"] is False
    assert schema["properties"]["services"]["maxItems"] == service_orders.MAX_SERVICES


def test_an_incognito_tool_surface_has_no_service_request():
    names = set(_tool(_saved(), allow=False))
    assert "propose_service_order" not in names and len(names) == 5
    # A saved chat without a records service still gets the service request.
    assert "propose_service_order" in _tool(_saved())


# ── the event guard ──────────────────────────────────────────────────

def _proposal():
    sink = ProposalSink()
    asyncio.run(_tool(_saved(), sink)["propose_service_order"].handler(
        {"services": ["certified copy"], "records": "saved_in_chat"}))
    return sink.take()


def test_service_event_only_for_the_service_tool_and_never_in_incognito():
    proposal = _proposal()
    event = tool_policy.service_proposal_event(proposal, SERVICE, incognito=False)
    assert event == {
        "type": "service_proposal", "id": proposal["id"], "status": "draft",
        "records": [{"record_id": "rec-1", "title": "Plot 14, KONDAPUR"},
                    {"record_id": "rec-2", "title": "GUNADALA, 12"}],
        "requested": ["certified copy"], "note": None,
    }
    assert tool_policy.service_proposal_event(proposal, SERVICE, incognito=True) is None
    assert tool_policy.service_proposal_event(proposal, tool_policy.PROPOSAL_TOOL_QUALIFIED, incognito=False) is None
    assert tool_policy.service_proposal_event(proposal, "mcp__pattadar_records__get_record_by_rid", incognito=False) is None
    assert tool_policy.action_event('{"action": "order_service"}', SERVICE) is None


@pytest.mark.parametrize("mutate", [
    lambda p: p.update(id=None),
    lambda p: p.update(records=[]),
    lambda p: p.update(records=[{"record_id": "r"}] * 11),
    lambda p: p.update(requested=[]),
    lambda p: p.update(requested=[{"__html": "x"}]),
    lambda p: p["records"][0].update(record_id={"__html": "x"}),
])
def test_a_malformed_service_proposal_is_dropped(mutate):
    proposal = _proposal()
    mutate(proposal)
    assert tool_policy.service_proposal_event(proposal, SERVICE, incognito=False) is None


def test_card_values_are_plain_data():
    proposal = _proposal()
    proposal["records"][0]["title"] = {"__html": "<img onerror=x>"}
    proposal["note"] = 5
    event = tool_policy.service_proposal_event(proposal, SERVICE, incognito=False)
    assert event["records"][0]["title"] is None and event["note"] is None


# ── the run wiring ───────────────────────────────────────────────────

class _FakeClient:
    def __init__(self, options):
        self.options = options

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def query(self, messages, session_id=None):
        self.prompt = [item async for item in messages]

    async def receive_response(self):
        tool = self.options.mcp_servers["pattadar_ui"]["tools"].get("propose_service_order")
        args = {"services": ["certified copy"], "records": "saved_in_chat"}
        yield AssistantMessage(content=[ToolUseBlock(id="toolu_s", name=SERVICE, input=args)], model="m")
        if tool is None:
            text, error = "No such tool available", True
        else:
            out = await tool.handler(args)
            text, error = out["content"][0]["text"], bool(out.get("is_error"))
        yield UserMessage(content=[ToolResultBlock(tool_use_id="toolu_s", content=text, is_error=error)])
        yield ResultMessage(subtype="success", duration_ms=1, duration_api_ms=1, is_error=False,
                            num_turns=1, session_id="s", result="Review the card.")


def _run(monkeypatch, incognito):
    def fake_server(navigation, forms=None, **kwargs):
        return {"tools": {tool.name: tool for tool in build_ui_tools(navigation, forms, **kwargs)}}

    monkeypatch.setattr(agent_runtime, "build_ui_server", fake_server)
    monkeypatch.setattr(agent_runtime, "ClaudeSDKClient", _FakeClient)
    agent = agent_runtime.AssistantAgent(AssistantConfig())
    seen = {}
    original = agent._options

    def spy(*args, **kwargs):
        seen["options"] = original(*args, **kwargs)
        return seen["options"]

    monkeypatch.setattr(agent, "_options", spy)

    async def collect():
        return [event async for event in agent.stream(
            content="request certified copies of these", transcript=[], model="claude-sonnet-4-6",
            prompt_context="", navigation=[], session_id="s", incognito=incognito,
            saved_records=_saved())]

    return asyncio.run(collect()), seen["options"]


def test_a_saved_chat_run_emits_one_service_proposal_after_the_tool_ends(monkeypatch):
    events, options = _run(monkeypatch, incognito=False)
    types = [event["type"] for event in events]
    assert types.index("tool_end") < types.index("service_proposal")
    card = next(event for event in events if event["type"] == "service_proposal")
    assert [r["record_id"] for r in card["records"]] == ["rec-1", "rec-2"]
    assert SERVICE in options.allowed_tools


def test_an_incognito_run_has_no_service_tool_and_no_card(monkeypatch):
    events, options = _run(monkeypatch, incognito=True)
    assert "service_proposal" not in [event["type"] for event in events]
    assert SERVICE not in options.allowed_tools
    assert "propose_service_order" not in options.mcp_servers["pattadar_ui"]["tools"]
    prompt = " ".join(options.system_prompt.split())
    assert "call propose_service_order" in prompt
    assert "Never say anything was ordered, requested or applied for" in prompt
    assert tool_policy.INCOGNITO_SERVICE_TEXT in prompt


# ── the stored offer ─────────────────────────────────────────────────

class _Cursor:
    def __init__(self, row=None, rowcount=0, rows=None):
        self.row, self.rowcount, self.rows = row, rowcount, rows or []

    async def fetchone(self):
        return self.row

    async def fetchall(self):
        return self.rows


class _Tx:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class Db:
    def __init__(self):
        self.proposals: dict[str, dict] = {}
        self.conversations: dict[str, str] = {}
        self.messages: list[dict] = []
        self.offer_sql: list[tuple] = []

    def transaction(self):
        return _Tx()

    async def execute(self, sql, params=()):
        text = " ".join(sql.split())
        if text.startswith("SELECT id, kind, draft, status, results, holding_id FROM r_assistant_proposals WHERE id=%s"):
            row = self.proposals.get(params[0])
            return _Cursor(row if row and row["user_id"] == params[1] else None)
        if text.startswith("SELECT id, kind, draft, status, results, holding_id FROM r_assistant_proposals WHERE user_id=%s"):
            uid, ids = params
            return _Cursor(rows=[r for r in self.proposals.values() if r["user_id"] == uid and r["id"] in ids])
        if text.startswith("UPDATE r_assistant_proposals"):
            row = self.proposals[params[3]]
            row.update(status=params[0], results=params[1].obj, holding_id=params[2])
            return _Cursor(row)
        if text.startswith("SELECT id, user_id, title"):
            cid, uid = params
            return _Cursor({"id": cid, "title": "t", "status": "active"} if self.conversations.get(cid) == uid else None)
        if text.startswith("SELECT metadata FROM r_conversation_messages"):
            cid, uid = params
            return _Cursor(rows=[m for m in self.messages if m["cid"] == cid and m["uid"] == uid
                                 and m["role"] == "assistant"])
        if text.startswith("SELECT p.id, p.kind, p.draft, p.status, p.results FROM r_assistant_proposals p"):
            # chat_offer_rows: kept honest by asserting its SQL text in the
            # test, then filtered here exactly as that SQL says.
            self.offer_sql.append((text, params))
            cid, uid = params
            return _Cursor(rows=[r for r in self.proposals.values()
                                 if r.get("conversation_id") == cid and r["user_id"] == uid
                                 and self.conversations.get(cid) == r["user_id"]])
        if text.startswith("SELECT role, content, metadata, run_id, created_at"):
            cid, uid = params[0], params[1]
            return _Cursor(rows=[m for m in self.messages if m["cid"] == cid and m["uid"] == uid])
        return _Cursor()


def _stored(db, status="draft", results=None):
    proposal = _proposal()
    db.proposals[proposal["id"]] = {
        "id": proposal["id"], "user_id": "u01", "kind": "service", "draft": proposal,
        "status": status, "results": results or [],
    }
    return proposal["id"]


ORDER = {"index": 0, "record_id": "rec-1", "service": "certified_copy", "order_id": "ord-1",
         "order_ref": "PTD-0001", "error": None}


def test_service_offers_move_forward_with_ordered_and_rebuild_their_orders():
    assert SERVICE_TRANSITIONS["ordered"] == frozenset()
    db = Db()
    pid = _stored(db)
    outcome, card = asyncio.run(update_proposal(db, UUID(pid), "u01", "ordered", [ORDER]))
    assert outcome == "ok" and card["type"] == "service_proposal" and card["status"] == "ordered"
    assert card["orders"] == [ORDER]
    assert asyncio.run(update_proposal(db, UUID(pid), "u01", "ordered", [ORDER]))[0] == "ok", "a retried PUT"
    assert asyncio.run(update_proposal(db, UUID(pid), "u01", "dismissed", []))[0] == "conflict"
    assert asyncio.run(update_proposal(db, UUID(pid), "u02", "ordered", [ORDER])) == ("missing", None)


def test_the_other_kinds_status_word_is_invalid():
    db = Db()
    pid = _stored(db)
    assert asyncio.run(update_proposal(db, UUID(pid), "u01", "saved", []))[0] == "invalid"
    records_pid = "22222222-2222-2222-2222-222222222222"
    db.proposals[records_pid] = {**SAVED_ROW, "id": records_pid, "user_id": "u01", "status": "draft",
                                 "results": []}
    assert asyncio.run(update_proposal(db, UUID(records_pid), "u01", "ordered", []))[0] == "invalid"
    assert asyncio.run(update_proposal(db, UUID(records_pid), "u01", "saved",
                                       [{"index": 12, "record_id": "r"}]))[0] == "invalid"
    outcome, card = asyncio.run(update_proposal(db, UUID(records_pid), "u01", "saved",
                                                [{"index": 0, "record_id": "r", "order_ref": "x"}]))
    assert outcome == "ok" and db.proposals[records_pid]["results"] == [
        {"index": 0, "record_id": "r", "error": None}], "a save card keeps its own result shape"


def test_partial_then_ordered_and_dismissed_then_ordered():
    db = Db()
    pid = _stored(db, "dismissed")
    assert asyncio.run(update_proposal(db, UUID(pid), "u01", "partial", [{**ORDER, "error": "x"}]))[0] == "ok"
    assert asyncio.run(update_proposal(db, UUID(pid), "u01", "ordered", [ORDER]))[0] == "ok"


def test_proposal_out_rebuilds_a_service_card_from_its_row():
    out = proposal_out({"id": "p", "kind": "service", "status": "draft", "results": [],
                        "draft": {"records": [{"record_id": "r", "title": None}], "requested": ["ec"],
                                  "note": None}})
    assert out == {"type": "service_proposal", "id": "p", "status": "draft",
                   "records": [{"record_id": "r", "title": None}], "requested": ["ec"],
                   "note": None, "orders": []}


# ── the endpoints ────────────────────────────────────────────────────

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


@pytest.fixture()
def api(monkeypatch):
    from fastapi.testclient import TestClient

    from src import main

    db = Db()
    monkeypatch.setattr(main, "pool", _Pool(db))
    return TestClient(main.app), db


def test_put_handles_a_service_card(api):
    client, db = api
    pid = _stored(db)
    headers = {"x-user-id": "u01"}
    assert client.put(f"/api/proposals/{pid}", json={"status": "ordered", "results": [ORDER]},
                      headers={"x-user-id": "u02"}).status_code == 404
    assert client.put(f"/api/proposals/{pid}", json={"status": "saved"}, headers=headers).status_code == 422
    ok = client.put(f"/api/proposals/{pid}", json={"status": "ordered", "results": [ORDER]}, headers=headers)
    assert ok.status_code == 200 and ok.json()["orders"][0]["order_ref"] == "PTD-0001"
    assert client.put(f"/api/proposals/{pid}", json={"status": "dismissed"}, headers=headers).status_code == 409


def test_get_conversation_splits_cards_and_sums_the_chat_cost(api, monkeypatch):
    client, db = api
    # The chat's cost is an admin figure (test_cost_admin_gate.py covers owners).
    monkeypatch.setenv("PLATFORM_ADMIN_UIDS", "u01")
    cid = str(uuid4())
    db.conversations[cid] = "u01"
    pid = _stored(db, "ordered", [ORDER])
    records_pid = "33333333-3333-3333-3333-333333333333"
    db.proposals[records_pid] = {**SAVED_ROW, "id": records_pid, "user_id": "u01"}
    usage = {"input_tokens": 1_000_000, "output_tokens": 0}
    db.messages = [
        {"cid": cid, "uid": "u01", "role": "user", "content": "q", "metadata": {}, "run_id": None,
         "created_at": "2026-10-04T00:00:00Z"},
        {"cid": cid, "uid": "u01", "role": "assistant", "content": "a", "run_id": None,
         "created_at": "2026-10-04T00:00:01Z",
         "metadata": {"cost": {"cost_usd": 0.0125}, "usage": usage, "proposals": [records_pid, pid],
                      "follow_ups": [{"label": CERTIFIED_LABEL, "prompt": CERTIFIED_PROMPT}]}},
        # Saved before per-request cost: priced from usage (Sonnet 4.6 input $3/M).
        {"cid": cid, "uid": "u01", "role": "assistant", "content": "b", "run_id": None,
         "created_at": "2026-10-04T00:00:02Z", "metadata": {"model": "claude-sonnet-4-6", "usage": usage}},
        {"cid": cid, "uid": "u01", "role": "assistant", "content": "refine", "run_id": None,
         "created_at": "2026-10-04T00:00:03Z", "metadata": {"cost": {"cost_usd": 0}}},
    ]
    body = client.get(f"/api/conversations/{cid}", headers={"x-user-id": "u01"}).json()
    assert body["total_cost_usd"] == pytest.approx(3.0125)
    reply = body["messages"][1]
    assert [p["id"] for p in reply["proposals"]] == [records_pid]
    assert [p["id"] for p in reply["service_proposals"]] == [pid]
    assert reply["service_proposals"][0]["orders"][0]["order_ref"] == "PTD-0001"
    assert reply["follow_ups"] == [{"label": CERTIFIED_LABEL, "prompt": CERTIFIED_PROMPT}]
    assert body["messages"][0]["follow_ups"] == [] and body["messages"][0]["service_proposals"] == []
    light = client.get(f"/api/conversations/{cid}?include_messages=false", headers={"x-user-id": "u01"}).json()
    assert light["total_cost_usd"] == pytest.approx(3.0125) and "messages" not in light
    monkeypatch.delenv("PLATFORM_ADMIN_UIDS")
    owner = client.get(f"/api/conversations/{cid}", headers={"x-user-id": "u01"}).json()
    assert "total_cost_usd" not in owner and "cost_usd" not in owner["messages"][1]
    assert owner["messages"][1]["follow_ups"] == reply["follow_ups"], "an owner keeps the cards and follow-ups"


# ── the chat-level follow-up and the cost sum ────────────────────────

def test_certified_copies_are_offered_only_after_records_were_saved_in_this_chat():
    offer = chat_follow_ups(saved_records=2, service_requested=False, offered_this_turn=False, incognito=False)
    assert offer == [{"label": "Order certified copies of these deeds?", "prompt": CERTIFIED_PROMPT}]
    assert evaluate_scope(offer[0]["prompt"]).allowed
    assert chat_follow_ups(saved_records=0, service_requested=False, offered_this_turn=False, incognito=False) == []
    assert chat_follow_ups(saved_records=2, service_requested=True, offered_this_turn=False, incognito=False) == []
    assert chat_follow_ups(saved_records=2, service_requested=False, offered_this_turn=True, incognito=False) == []
    assert chat_follow_ups(saved_records=2, service_requested=False, offered_this_turn=False) == [], \
        "a caller that does not know defaults to incognito"


def test_total_cost_prefers_the_saved_figure_and_prices_old_replies_from_usage():
    usage = {"input_tokens": 1_000_000}
    assert billing.reply_cost({"cost": {"cost_usd": 0.5}, "usage": usage}) == 0.5
    assert billing.reply_cost({"model": "claude-sonnet-4-6", "usage": usage}) == 3.0
    assert billing.reply_cost({"model": "unknown", "usage": usage}) is None
    assert billing.total_cost([{"cost": {"cost_usd": 0.5}}, {"model": "unknown", "usage": usage}, None]) == 0.5


# ── 'saved_in_chat' is this chat's and this user's, read from the store ──

def _offer(db, pid, cid, uid, record_id):
    db.proposals[pid] = {
        **SAVED_ROW, "id": pid, "conversation_id": cid, "user_id": uid,
        "results": [{"index": 0, "record_id": record_id, "error": None}],
    }


def test_saved_in_chat_reads_only_this_users_saved_records_in_this_chat():
    from src.adapters.conversation_store import saved_in_chat_reader

    db = Db()
    mine, other_chat = str(uuid4()), str(uuid4())
    db.conversations[mine] = "u01"
    db.conversations[other_chat] = "u01"
    _offer(db, "p-mine", mine, "u01", "rec-mine")
    _offer(db, "p-other-chat", other_chat, "u01", "rec-other-chat")
    # Another user's row filed under this conversation id (a forged or
    # colliding id): the user check and the conversation-owner join drop it.
    _offer(db, "p-theirs", mine, "u02", "rec-theirs")

    read = saved_in_chat_reader(_Pool(db), UUID(mine), "u01", readable=True)
    assert [r["record_id"] for r in asyncio.run(read())] == ["rec-mine"]
    text, params = db.offer_sql[-1]
    assert params == (mine, "u01")
    assert "WHERE p.conversation_id=%s AND p.user_id=%s" in text
    assert "JOIN r_conversations c ON c.id = p.conversation_id AND c.user_id = p.user_id" in text

    # Another user asking for the same conversation gets nothing of u01's.
    theirs = saved_in_chat_reader(_Pool(db), UUID(mine), "u02", readable=True)
    assert asyncio.run(theirs()) == []


def test_saved_in_chat_fails_closed_when_the_offers_could_not_be_read():
    from src.adapters.conversation_store import saved_in_chat_reader

    read = saved_in_chat_reader(_Pool(Db()), uuid4(), "u01", readable=False)
    with pytest.raises(RuntimeError):
        asyncio.run(read())


def test_the_chat_run_wires_the_reader_to_this_conversation_and_user():
    """main.py hands the tool saved_in_chat_reader(pool, body.conversation_id,
    user_id, …) — not a hand-rolled read that could drop the owner check."""
    import inspect

    from src import main

    source = " ".join(inspect.getsource(main).split())
    assert "saved_in_chat_reader(pool, body.conversation_id, user_id, offer_rows is not None)" in source
    assert "chat_offer_rows(offers_conn, body.conversation_id, user_id)" in source
