"""Save offers: the model proposes, a card confirms, only the user's click saves.

Covers the tool (re-reads rows, ignores the model's copy of facts), the run
wiring (incognito has no tool and no event), the event guard, the stored
offer's forward-only state machine, and the two HTTP endpoints, with fakes for
the SDK, the corpus and PostgreSQL. No network.
"""
import asyncio
import json
from uuid import UUID, uuid4

import pytest
from claude_agent_sdk import AssistantMessage, ResultMessage, ToolResultBlock, ToolUseBlock, UserMessage

from src.adapters import agent_runtime
from src.adapters.conversation_store import PROPOSAL_TRANSITIONS, proposal_out, update_proposal
from src.adapters.mcp.ui import ProposalSink, build_ui_tools
from src.config import AssistantConfig
from src.domain import tool_policy
from src.public_records.exceptions import ToolInputError

PROPOSE = tool_policy.PROPOSAL_TOOL_QUALIFIED
ROW = {
    "rid": "AP0808", "s_no": 1, "doc_no": "1234", "year": 2019, "sro_name": "KUKATPALLY",
    "village": "KONDAPUR", "survey_no": "214/2", "plot_no": "14", "extent_val": 200,
    "extent_unit": "sq_yards", "land_class": "", "property_type": "", "market_value": 1850000,
    "consideration_value": 2400000, "reg_date": "2019-03-12", "sellers": ["K. NARAYANA"],
    "buyers": ["R. RAMAIAH"], "boundary_north": "ROAD 30FT", "boundary_south": "PLOT 15",
    "boundary_east": "PLOT 13", "boundary_west": "OPEN LAND",
}


class Corpus:
    """Answers get_record_by_rid like the read-only service does."""

    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    async def get_record_by_rid(self, rid, s_no=None):
        self.calls.append((rid, s_no))
        if rid == "BAD":
            raise ToolInputError("This document has more than 200 property rows")
        return [row for row in self.rows if row["rid"] == rid and (s_no is None or row["s_no"] == s_no)]


def _propose_tool(corpus, sink, allow=True):
    tools = build_ui_tools([], [], records_service=corpus, proposals=sink, allow_proposals=allow)
    return {tool.name: tool for tool in tools}


# ── the tool ─────────────────────────────────────────────────────────

def test_the_tool_rereads_rows_and_the_model_text_says_nothing_was_saved():
    corpus, sink = Corpus([ROW]), ProposalSink()
    tool = _propose_tool(corpus, sink)["propose_add_records"]
    result = asyncio.run(tool.handler({
        "records": [{"rid": "AP0808", "s_no": 1}, {"rid": "MISSING", "s_no": 1}, {"rid": "BAD"}],
        "stake": "managed",
    }))
    assert result["content"][0]["text"] == tool_policy.PROPOSAL_TOOL_RESULT
    assert "do not say it was saved" in result["content"][0]["text"]
    assert corpus.calls == [("AP0808", 1), ("MISSING", 1), ("BAD", None)]
    proposal = sink.take()
    assert sink.take() is None
    assert proposal["stake"] == "managed" and len(proposal["items"]) == 1, "unknown rids drop out"
    item = proposal["items"][0]
    assert item["buyer_name"] == "R. RAMAIAH" and item["village"] == "KONDAPUR"
    assert item["source_ref"] == "pr:AP0808:1"
    assert "KONDAPUR" not in result["content"][0]["text"], "the card body never goes through the model"


def test_facts_typed_by_the_model_are_refused_by_the_schema_and_ignored_by_the_code():
    sink = ProposalSink()
    tool = _propose_tool(Corpus([ROW]), sink)["propose_add_records"]
    assert tool.input_schema["properties"]["records"]["items"]["additionalProperties"] is False
    assert set(tool.input_schema["properties"]) == {"records", "stake"}
    asyncio.run(tool.handler({"records": [{"rid": "AP0808", "s_no": 1, "buyer_name": "MALLORY"}]}))
    assert sink.take()["items"][0]["buyer_name"] == "R. RAMAIAH"


def test_nothing_found_is_an_error_and_no_card():
    sink = ProposalSink()
    tool = _propose_tool(Corpus([]), sink)["propose_add_records"]
    result = asyncio.run(tool.handler({"records": [{"rid": "NOPE", "s_no": 1}]}))
    assert result["is_error"] is True and sink.take() is None
    bad = asyncio.run(tool.handler({"records": [{"rid": "AP0808"}], "stake": "mine"}))
    assert bad["is_error"] is True


def test_an_incognito_tool_surface_has_no_save_offer():
    names = set(_propose_tool(Corpus([ROW]), ProposalSink(), allow=False))
    assert "propose_add_records" not in names and len(names) == 5
    # No records service, no tool either.
    assert "propose_add_records" not in {t.name for t in build_ui_tools([], allow_proposals=True)}


# ── the event guard ──────────────────────────────────────────────────

def _proposal():
    sink = ProposalSink()
    asyncio.run(_propose_tool(Corpus([ROW]), sink)["propose_add_records"].handler(
        {"records": [{"rid": "AP0808", "s_no": 1}]}))
    return sink.take()


def test_proposal_event_only_for_the_propose_tool_and_never_in_incognito():
    proposal = _proposal()
    event = tool_policy.proposal_event(proposal, PROPOSE, incognito=False)
    assert event["type"] == "proposal" and event["status"] == "draft" and event["stake"] is None
    assert event["items"][0]["kind"] == "property" and event["items"][0]["extent_unit"] == "sq.yd"
    assert tool_policy.proposal_event(proposal, PROPOSE, incognito=True) is None
    assert tool_policy.proposal_event(proposal, "mcp__pattadar_records__get_record_by_rid", incognito=False) is None
    assert tool_policy.proposal_event(proposal, "mcp__pattadar_ui__navigate_user", incognito=False) is None


@pytest.mark.parametrize("mutate", [
    lambda p: p.update(stake="mine"),
    lambda p: p.update(items=[]),
    lambda p: p.update(items=p["items"] * 11),
    lambda p: p["items"][0].update(kind="<script>"),
    lambda p: p["items"][0].update(extent_unit="cents"),
    lambda p: p["items"][0].update(rid=None),
    lambda p: p.update(id=None),
])
def test_a_malformed_proposal_is_dropped(mutate):
    proposal = _proposal()
    mutate(proposal)
    assert tool_policy.proposal_event(proposal, PROPOSE, incognito=False) is None


def test_values_in_a_card_are_plain_data():
    proposal = _proposal()
    proposal["items"][0]["title"] = {"__html": "<img onerror=x>"}
    proposal["items"][0]["extent"] = "200"
    event = tool_policy.proposal_event(proposal, PROPOSE, incognito=False)
    assert event["items"][0]["title"] is None and event["items"][0]["extent"] is None


def test_a_save_offer_can_never_become_an_auto_run_action():
    for action in ("propose_write", "proposal", "save_record"):
        envelope = json.dumps({"action": action, "args": {"form": "x"}, "proposal": {}})
        assert tool_policy.action_event(envelope, PROPOSE) is None


# ── the run wiring ───────────────────────────────────────────────────

class _FakeClient:
    """Plays one propose_add_records call through the real tool handler."""

    def __init__(self, options):
        self.options = options

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def query(self, messages, session_id=None):
        self.prompt = [item async for item in messages]

    async def receive_response(self):
        tools = self.options.mcp_servers["pattadar_ui"]["tools"]
        propose = tools.get("propose_add_records")
        yield AssistantMessage(content=[ToolUseBlock(
            id="toolu_1", name=PROPOSE, input={"records": [{"rid": "AP0808", "s_no": 1}]})], model="m")
        if propose is None:
            text, error = "No such tool available", True
        else:
            out = await propose.handler({"records": [{"rid": "AP0808", "s_no": 1}]})
            text, error = out["content"][0]["text"], bool(out.get("is_error"))
        yield UserMessage(content=[ToolResultBlock(tool_use_id="toolu_1", content=text, is_error=error)])
        yield ResultMessage(subtype="success", duration_ms=1, duration_api_ms=1, is_error=False,
                            num_turns=1, session_id="s", result="Review the card.")


def _run(monkeypatch, incognito):
    def fake_server(navigation, forms=None, **kwargs):
        return {"tools": {tool.name: tool for tool in build_ui_tools(navigation, forms, **kwargs)}}

    monkeypatch.setattr(agent_runtime, "build_ui_server", fake_server)
    monkeypatch.setattr(agent_runtime, "ClaudeSDKClient", _FakeClient)
    agent = agent_runtime.AssistantAgent(AssistantConfig())
    agent.public_records = Corpus([ROW])
    seen = {}
    original = agent._options

    def spy(*args, **kwargs):
        seen["options"] = original(*args, **kwargs)
        return seen["options"]

    monkeypatch.setattr(agent, "_options", spy)

    async def collect():
        return [event async for event in agent.stream(
            content="add it to my properties", transcript=[], model="claude-sonnet-4-6",
            prompt_context="", navigation=[], session_id="s", incognito=incognito)]

    return asyncio.run(collect()), seen["options"]


def test_a_saved_chat_run_emits_one_proposal_after_the_tool_ends(monkeypatch):
    events, options = _run(monkeypatch, incognito=False)
    types = [event["type"] for event in events]
    assert types.index("tool_end") < types.index("proposal")
    proposal = next(event for event in events if event["type"] == "proposal")
    assert proposal["items"][0]["source_ref"] == "pr:AP0808:1"
    assert PROPOSE in options.allowed_tools


def test_an_incognito_run_has_no_tool_no_allowlist_entry_and_no_card(monkeypatch):
    events, options = _run(monkeypatch, incognito=True)
    assert "proposal" not in [event["type"] for event in events]
    assert PROPOSE not in options.allowed_tools
    assert "propose_add_records" not in options.mcp_servers["pattadar_ui"]["tools"]


def test_the_transcript_carries_the_rids_a_reply_showed():
    text = agent_runtime.AssistantAgent._transcript_text([
        {"role": "user", "content": "deeds for usharani bobba"},
        {"role": "assistant", "content": "Found 2.", "metadata": {"views": [{
            "kind": "table", "title": "Deeds naming “Usharani Bobba”",
            "rows": [{"rid": "AP1", "s_no": 1, "score": 1.0, "village": "GUNADALA"},
                     {"rid": "AP2", "s_no": 3, "score": 0.86}],
        }]}},
    ])
    assert "rid=AP1; s_no=1; confidence=100%; village=GUNADALA" in text
    assert "rid=AP2; s_no=3; confidence=86%" in text
    assert "data only" in text


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


class ProposalDb:
    """r_assistant_proposals (and r_conversations) in a dict."""

    def __init__(self):
        self.proposals: dict[str, dict] = {}
        self.conversations: dict[str, str] = {}
        self.messages: list[tuple] = []

    def transaction(self):
        return _Tx()

    async def execute(self, sql, params=()):
        text = " ".join(sql.split())
        if text.startswith("INSERT INTO r_assistant_proposals"):
            pid, cid, uid, draft = params[0], params[1], params[2], params[3].obj
            if self.conversations.get(cid) != uid or pid in self.proposals:
                return _Cursor(rowcount=0)
            self.proposals[pid] = {"id": pid, "user_id": uid, "draft": draft, "status": "draft", "results": []}
            return _Cursor(rowcount=1)
        if text.startswith("SELECT id, kind, draft, status, results, holding_id FROM r_assistant_proposals WHERE id=%s"):
            row = self.proposals.get(params[0])
            return _Cursor(row if row and row["user_id"] == params[1] else None)
        if text.startswith("UPDATE r_assistant_proposals"):
            row = self.proposals[params[3]]
            row.update(status=params[0], results=params[1].obj, holding_id=params[2])
            return _Cursor(row)
        if text.startswith("SELECT id, user_id, title"):
            cid, uid = params
            return _Cursor({"id": cid, "status": "active"} if self.conversations.get(cid) == uid else None)
        if text.startswith("INSERT INTO r_conversation_messages"):
            self.messages.append(params)
            return _Cursor(rowcount=1)
        return _Cursor()


def _stored(db, status="draft", results=None):
    proposal = _proposal()
    db.proposals[proposal["id"]] = {
        "id": proposal["id"], "user_id": "u01", "draft": proposal, "status": status,
        "results": results or [],
    }
    return proposal["id"]


def test_only_forward_moves():
    assert PROPOSAL_TRANSITIONS["saved"] == frozenset()
    assert PROPOSAL_TRANSITIONS["dismissed"] == frozenset({"saved", "partial"})
    db = ProposalDb()
    pid = _stored(db)
    done = [{"index": 0, "record_id": "rec-1", "error": None}]
    outcome, proposal = asyncio.run(update_proposal(db, UUID(pid), "u01", "saved", done))
    assert outcome == "ok" and proposal["status"] == "saved"
    assert proposal["items"][0]["record_id"] == "rec-1", "the card rebuilds with its outcome"
    assert asyncio.run(update_proposal(db, UUID(pid), "u01", "saved", done))[0] == "ok", "a retried PUT is fine"
    assert asyncio.run(update_proposal(db, UUID(pid), "u01", "dismissed", []))[0] == "conflict"
    assert asyncio.run(update_proposal(db, UUID(pid), "u02", "saved", done)) == ("missing", None)


def test_dismissed_then_undone_may_record_the_save():
    """"Not now" → Undo → Save in the open chat: the stored card must say what was saved."""
    db = ProposalDb()
    pid = _stored(db, "dismissed")
    outcome, proposal = asyncio.run(update_proposal(db, UUID(pid), "u01", "saved", [
        {"index": 0, "record_id": "rec-u", "error": None}]))
    assert outcome == "ok" and proposal["status"] == "saved"
    assert asyncio.run(update_proposal(db, UUID(pid), "u01", "draft", []))[0] == "conflict"


def test_partial_may_retry_then_finish():
    db = ProposalDb()
    pid = _stored(db, "partial", [{"index": 0, "record_id": None, "error": "network"}])
    assert asyncio.run(update_proposal(db, UUID(pid), "u01", "partial", [
        {"index": 0, "record_id": None, "error": "still failing"}]))[0] == "ok"
    assert asyncio.run(update_proposal(db, UUID(pid), "u01", "saved", [
        {"index": 0, "record_id": "rec-9", "error": None}]))[0] == "ok"
    assert asyncio.run(update_proposal(db, UUID(pid), "u01", "partial", []))[0] == "conflict"


def test_proposal_out_is_the_event_shape():
    out = proposal_out({"id": "p", "draft": {"stake": "watch", "items": [{"index": 0, "rid": "R"}]},
                        "status": "dismissed", "results": []})
    assert out == {"type": "proposal", "id": "p", "status": "dismissed", "stake": "watch",
                   "items": [{"index": 0, "rid": "R"}], "holding_id": None}


def test_a_save_card_records_its_holding_once():
    """D2: the holding the browser made is stored on the card (set once) and
    comes back on reload; a service card or a draft never takes one."""
    db = ProposalDb()
    pid = _stored(db)
    done = [{"index": 0, "record_id": "rec-1", "error": None}]
    assert asyncio.run(update_proposal(db, UUID(pid), "u01", "saved", done))[0] == "ok"
    outcome, proposal = asyncio.run(update_proposal(db, UUID(pid), "u01", "saved", done, holding_id="cp-1"))
    assert outcome == "ok" and proposal["holding_id"] == "cp-1", "same status and rows, the holding added"
    assert asyncio.run(update_proposal(db, UUID(pid), "u01", "saved", done, holding_id="cp-1"))[0] == "ok"
    assert asyncio.run(update_proposal(db, UUID(pid), "u01", "saved", done))[1]["holding_id"] == "cp-1", \
        "a later PUT without one keeps it"
    assert asyncio.run(update_proposal(db, UUID(pid), "u01", "saved", done, holding_id="cp-2"))[0] == "conflict"
    draft = _stored(db)
    assert asyncio.run(update_proposal(db, UUID(draft), "u01", "dismissed", [], holding_id="cp-1"))[0] == "invalid"


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

    db = ProposalDb()
    monkeypatch.setattr(main, "pool", _Pool(db))
    main._refine_hits.clear()
    return TestClient(main.app), main, db  # no `with`: the lifespan (real DB) never runs


def test_put_proposal_is_owner_checked_and_forward_only(api):
    client, _, db = api
    pid = _stored(db)
    body = {"status": "saved", "results": [{"index": 0, "record_id": "rec-1", "error": None}]}
    assert client.put(f"/api/proposals/{pid}", json=body, headers={"x-user-id": "u02"}).status_code == 404
    assert client.put(f"/api/proposals/{pid}", json=body).status_code == 401
    ok = client.put(f"/api/proposals/{pid}", json=body, headers={"x-user-id": "u01"})
    assert ok.status_code == 200 and ok.json()["status"] == "saved"
    back = client.put(f"/api/proposals/{pid}", json={"status": "dismissed", "results": []},
                      headers={"x-user-id": "u01"})
    assert back.status_code == 409
    assert client.put(f"/api/proposals/{pid}", json={"status": "draft"},
                      headers={"x-user-id": "u01"}).status_code == 422
    twice = {"status": "saved", "results": [{"index": 0}, {"index": 0}]}
    assert client.put(f"/api/proposals/{pid}", json=twice, headers={"x-user-id": "u01"}).status_code == 422


class _Records:
    def __init__(self):
        self.calls = []

    async def find_properties_by_party(self, **kwargs):
        self.calls.append(kwargs)
        return {
            "matches": [{"rid": "AP1", "s_no": 1, "matched_name": "BOBBA USHARANI", "side": "claimant",
                         "score": 1.0, "village": "KATRAGUNTA", "survey_no": "12"}],
            "total_matches": 12, "complete": True, "note": None,
            "facets": {"villages": [{"name": "KATRAGUNTA", "count": 12}], "sros": [],
                       "confidence": {"exact": 12, "high": 0, "medium": 0, "low": 0}},
            "query": {"name": "Usharani Bobba", "villages": ["KATRAGUNTA"], "sro": None,
                      "min_similarity": 0.9, "side": None},
        }


def test_refine_runs_no_model_and_saves_the_turn_to_the_named_chat(api, monkeypatch):
    client, main, db = api
    records = _Records()
    monkeypatch.setattr(main.agent_manager, "public_records", records)
    cid = str(uuid4())
    db.conversations[cid] = "u01"
    response = client.post("/api/records/party-search", headers={"x-user-id": "u01"}, json={
        "name": "Usharani Bobba", "villages": ["katraguntaa"], "min_similarity": 0.9, "conversation_id": cid,
    })
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["text"] == "Refined: 12 deeds in KATRAGUNTA at ≥90% confidence."
    view = body["view"]
    assert view["facets"]["villages"] == [{"name": "KATRAGUNTA", "count": 12}]
    assert view["query"]["villages"] == ["KATRAGUNTA"] and view["query"]["min_similarity"] == 0.9
    assert view["follow_ups"][-1]["label"] == "Add to your properties?"
    assert records.calls[0]["villages"] == ["katraguntaa"] and records.calls[0]["limit"] == 20
    roles = [params[2] for params in db.messages]
    assert roles == ["user", "assistant"]
    assert db.messages[0][3].startswith("Show deeds for Usharani Bobba in katraguntaa")
    saved_meta = db.messages[1][5].obj
    assert saved_meta["cost"] == {"cost_usd": 0} and saved_meta["views"][0]["facets"]


def test_refine_in_incognito_writes_nothing_and_offers_no_save(api, monkeypatch):
    client, main, db = api
    monkeypatch.setattr(main.agent_manager, "public_records", _Records())
    cid = str(uuid4())
    db.conversations[cid] = "u01"
    response = client.post("/api/records/party-search", headers={"x-user-id": "u01"}, json={
        "name": "Usharani Bobba", "conversation_id": cid, "incognito": True,
    })
    assert response.status_code == 200 and db.messages == []
    assert all(f["label"] != "Add to your properties?" for f in response.json()["view"]["follow_ups"])


def test_refine_guards(api, monkeypatch):
    client, main, db = api
    monkeypatch.setattr(main.agent_manager, "public_records", _Records())
    headers = {"x-user-id": "u01"}
    assert client.post("/api/records/party-search", json={"name": "x"}).status_code == 401
    assert client.post("/api/records/party-search", headers=headers,
                       json={"name": "x", "min_similarity": 0.2}).status_code == 422
    assert client.post("/api/records/party-search", headers=headers,
                       json={"name": "x", "villages": ["v"] * 11}).status_code == 422
    assert client.post("/api/records/party-search", headers=headers,
                       json={"name": "x", "conversation_id": str(uuid4())}).status_code == 404, \
        "someone else's (or no) conversation"
    assert client.post("/api/records/party-search", headers=headers,
                       json={"name": "write python code"}).status_code == 422, "same scope gate"
    main._refine_hits.clear()
    codes = [client.post("/api/records/party-search", headers=headers, json={"name": "Ramaiah"}).status_code
             for _ in range(21)]
    assert codes[:20] == [200] * 20 and codes[20] == 429


def test_a_stake_is_preselected_only_when_the_user_said_it():
    """The model's stake can be steered by deed text it read; the user's words decide."""
    from src.domain.record_drafts import stake_said, user_text
    assert stake_said("owned", "Add the 100% confidence deed(s) to my properties.") is None
    assert stake_said("owned", "add it, it's mine") == "owned"
    assert stake_said("watch", "Please watch this deed for me") == "watch"
    assert stake_said("managed", "I manage this land for my uncle") == "managed"
    assert stake_said("owned", "please watch it") is None, "the model may not upgrade a watch to Mine"
    assert stake_said("bogus", "mine") is None
    assert user_text([{"type": "text", "text": "this is mine"}, {"type": "image"}]) == "this is mine"


def test_refine_text_never_states_a_sampled_count_as_complete():
    from src.main import _refine_summary
    from src.schemas import PartySearchRequest
    body = PartySearchRequest(name="SRINIVASA RAO", sro="VINUKONDA")
    sampled = {"total": 0, "query": {"villages": [], "sro": "VINUKONDA"}, "facets": {"sampled": True}}
    assert "0 deeds" not in _refine_summary(sampled, body)
    assert "sample" in _refine_summary(sampled, body)


# ── holding and saved stake over HTTP ────────────────────────────────

def test_put_stores_the_saved_stake_and_the_holding_and_a_reload_gets_both(api):
    client, _, db = api
    pid = _stored(db)
    headers = {"x-user-id": "u01"}
    saved = {"status": "saved", "results": [
        {"index": 0, "record_id": "rec-1", "error": None, "stake": "managed"},
        {"index": 1, "record_id": None, "error": "Not added"},
    ]}
    first = client.put(f"/api/proposals/{pid}", json=saved, headers=headers)
    assert first.status_code == 200
    assert first.json()["items"][0]["saved_stake"] == "managed"
    # The holding step reports later; its rows may differ (an older client
    # sent unselected rows without "Not added") — the finished card keeps its
    # stored outcome and only gains the holding.
    later = {"status": "saved", "holding_id": "cp-abc123", "results": [
        {"index": 0, "record_id": "rec-1", "error": None, "stake": "managed"},
        {"index": 1, "record_id": None, "error": None},
    ]}
    attached = client.put(f"/api/proposals/{pid}", json=later, headers=headers)
    assert attached.status_code == 200
    body = attached.json()
    assert body["holding_id"] == "cp-abc123"
    assert body["items"][0]["saved_stake"] == "managed"
    assert db.proposals[pid]["results"][1]["error"] == "Not added", "the stored outcome is kept"
    # Set once: a second, different holding is a conflict.
    assert client.put(f"/api/proposals/{pid}", json={**later, "holding_id": "cp-other"},
                      headers=headers).status_code == 409
    # A malformed id or stake never reaches the store.
    assert client.put(f"/api/proposals/{pid}", json={**later, "holding_id": "cp 1<"},
                      headers=headers).status_code == 422
    bad_stake = {"status": "saved", "results": [{"index": 0, "record_id": "rec-1", "stake": "boss"}]}
    assert client.put(f"/api/proposals/{pid}", json=bad_stake, headers=headers).status_code == 422


def test_a_service_card_never_takes_a_holding():
    db = ProposalDb()
    pid = _stored(db)
    db.proposals[pid]["kind"] = "service"
    order = [{"index": 0, "record_id": "rec-1", "service": "ec", "order_id": "o-1",
              "order_ref": "PTD-1", "error": None}]
    assert asyncio.run(update_proposal(db, UUID(pid), "u01", "ordered", order, holding_id="cp-1"))[0] == "invalid"
    assert asyncio.run(update_proposal(db, UUID(pid), "u01", "ordered", order))[0] == "ok"
    assert asyncio.run(update_proposal(db, UUID(pid), "u01", "ordered", order, holding_id="cp-1"))[0] == "invalid"
