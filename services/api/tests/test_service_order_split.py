"""The owner's service order page and the desk's, split (service order spec §7, §12).

Real PostgreSQL in a throwaway schema, through the same harness as
test_capabilities_settlement.py. The owner reads a requester view and holds
only requester moves; dispatch, assignment and relaying belong to the desk.
"""
import asyncio
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from test_capabilities_settlement import database  # noqa: E402
from src import capabilities as c, ticketing as t, web360 as w  # noqa: E402

FILE = "0b9f2a4e-1c3d-4e5f-8a7b-9c0d1e2f3a4b"


async def _setup(pool, monkeypatch, *, status="placed", quoted=1180.0, due="", status_at=""):
    """One order on owner-a's property, the desk tables, and desk-admin."""
    monkeypatch.setenv("PLATFORM_ADMIN_UIDS", "desk-admin")

    async def no_desk_read(*args, **kwargs):
        return None
    monkeypatch.setattr(w, "_desk_read", no_desk_read)

    async def stub_send(*args, **kwargs):
        return {"provider": "stub", "status": "logged", "error": ""}
    monkeypatch.setattr(w, "_send", stub_send)
    async with pool.connection() as conn:
        for stmt in w.associates.DDL:
            await conn.execute(stmt)
        await conn.execute(
            "INSERT INTO work_requests (id,owner_user_id,kind,title,entity_id,status,stage,"
            "quoted,payee_share,due_date,created_at,status_at,area_label) VALUES"
            " ('ticket-a','owner-a','ec','Encumbrance certificate','record-a',%s,0,%s,0.9,%s,%s,%s,"
            "'Podili, Prakasam')",
            (status, quoted, due, status_at or w._now_iso(), status_at or w._now_iso()))
        await w._event(conn, "owner-a", "ticket-a", kind="status", action="place",
                       to_status="placed", headline="You placed this order",
                       detail="BR-5388 · ordered from rec-6881f2b14af4")


def test_the_owner_reads_a_requester_view_with_no_desk_working(monkeypatch):
    async def run():
        async with database() as pool:
            await _setup(pool, monkeypatch, due="01/01/2026")
            m = w.WebMutation()
            assert await m.fund_ticket("owner-a", "ticket-a")
            # The desk sends it out: a dispatch row, a status move, a payment row.
            assert await m.desk_dispatch_ticket("desk-admin", "ticket-a", "worker@example.com",
                                                person_name="Ravi Kumar")
            view = await w.WebQuery().ticket("owner-a", "ticket-a")
            assert not hasattr(view, "dispatches") and not hasattr(view, "dispatch_state")
            kinds = {(e.kind, e.action) for e in view.events}
            assert ("dispatch", "") not in kinds and ("payment", "") not in kinds
            assert ("status", "dispatch") not in kinds
            # Stored ids never reach the owner, even on rows written before the fix.
            assert all(e.detail == "" for e in view.events if e.kind not in ("message", "refused"))
            assert "BR-" not in json.dumps([e.__dict__ for e in view.events], default=str)
            # `sent` is the desk's word; the owner still reads Placed.
            assert view.status == "sent" and view.status_label == "Placed"
            assert set(view.can) <= set(t.OWNER_ACTIONS)
            assert view.can == ["cancel", "message", "nudge"]   # overdue since 01/01/2026
            assert view.overdue_days > 0 and view.asked_at == ""
            # The desk sees everything the owner does not.
            desk = await w.WebQuery().desk_ticket("desk-admin", "ticket-a")
            assert desk and len(desk.dispatches) == 1
            assert {e.kind for e in desk.events} >= {"dispatch", "payment", "status"}
            assert any("BR-" in e.detail for e in desk.events)
            assert "withdraw" in desk.can and "cancel" not in desk.can
            assert await w.WebQuery().desk_ticket("owner-a", "ticket-a") is None
    asyncio.run(run())


def test_owner_moves_are_requester_moves_only(monkeypatch):
    async def run():
        async with database() as pool:
            await _setup(pool, monkeypatch)
            m = w.WebMutation()
            for gone in ("dispatch_ticket", "revoke_dispatch", "start_ticket", "add_deliverable",
                         "assign_request", "assign_associate"):
                assert not hasattr(m, gone), gone
            assert not hasattr(w.WebQuery(), "associates_for_ticket")
            assert not hasattr(w.WebQuery(), "assignable")
            # The machine refuses an owner dispatch even if some path tried it.
            async with w._ticket_transaction() as conn:
                row = await w._ticket_row(conn, "owner-a", "ticket-a", lock=True)
                assert await w._move(conn, "owner-a", row, "dispatch") == ""
            # Desk writes answer a non-admin exactly like a missing order.
            assert await m.desk_start_ticket("owner-a", "ticket-a") is False
            assert await m.desk_add_deliverable("owner-a", "ticket-a", "paper", "EC") == ""
            assert await m.desk_post_ticket_message("owner-a", "ticket-a", "hello") is False
    asyncio.run(run())


def test_a_message_carries_files_and_reaches_the_desk_inbox_once_a_day(monkeypatch):
    async def run():
        async with database() as pool:
            await _setup(pool, monkeypatch)
            m = w.WebMutation()
            f = w.MessageFile(file_ref=FILE, file_name="receipt.pdf",
                              mime_type="application/pdf", size_bytes=2048)
            assert await m.post_ticket_message("owner-a", "ticket-a", "", attachments=[f])
            assert await m.post_ticket_message("owner-a", "ticket-a", "where are you on this?")
            # Failure paths: nothing at all, a ref that is not a storage node, too many.
            assert not await m.post_ticket_message("owner-a", "ticket-a", "  ")
            assert not await m.post_ticket_message(
                "owner-a", "ticket-a", "x", attachments=[w.MessageFile(file_ref="rec-1")])
            assert not await m.post_ticket_message("owner-a", "ticket-a", "x", attachments=[f] * 11)
            assert not await m.post_ticket_message("owner-b", "ticket-a", "not yours")
            view = await w.WebQuery().ticket("owner-a", "ticket-a")
            # Both land in the same second, so they are matched by content.
            msgs = {e.detail: e for e in view.events if e.kind == "message"}
            assert [a.file_name for a in msgs[""].attachments] == ["receipt.pdf"]
            assert msgs["where are you on this?"].attachments == []
            assert msgs["where are you on this?"].actor_kind == "owner"
            async with pool.connection() as conn:
                tasks = await (await conn.execute(
                    "SELECT kind, ticket_id FROM desk_tasks")).fetchall()
            assert [(r["kind"], r["ticket_id"]) for r in tasks] == [("owner_message", "ticket-a")]
            # The desk answers on the same thread, as the desk.
            assert await m.desk_post_ticket_message("desk-admin", "ticket-a", "Finding a surveyor")
            view = await w.WebQuery().ticket("owner-a", "ticket-a")
            desk = [e for e in view.events if e.kind == "message" and e.actor_kind == "system"]
            assert [(e.actor_label, e.detail) for e in desk] == [
                ("Pattadar desk", "Finding a surveyor")]
    asyncio.run(run())


def test_asking_for_an_update_is_quiet_or_late_once_a_day_and_flags_the_desk(monkeypatch):
    async def run():
        async with database() as pool:
            await _setup(pool, monkeypatch, quoted=0)
            m = w.WebMutation()
            # Fresh order: nothing to ask about yet.
            assert not await m.nudge_ticket("owner-a", "ticket-a")
            async with pool.connection() as conn:
                # Quiet for months, and nothing to pay (no price was agreed).
                await conn.execute("UPDATE work_requests SET status_at='2026-01-01T09:00:00', cost=0")
            view = await w.WebQuery().ticket("owner-a", "ticket-a")
            assert "nudge" in view.can
            assert await m.nudge_ticket("owner-a", "ticket-a")
            assert not await m.nudge_ticket("owner-a", "ticket-a")      # once a day
            assert not await m.nudge_ticket("owner-b", "ticket-a")      # not theirs
            view = await w.WebQuery().ticket("owner-a", "ticket-a")
            assert "nudge" not in view.can and view.asked_at
            line = [e for e in view.events if e.kind == "nudge"]
            assert [e.headline for e in line] == ["You asked Pattadar desk for an update"]
            async with pool.connection() as conn:
                tasks = await (await conn.execute("SELECT kind FROM desk_tasks")).fetchall()
            assert [r["kind"] for r in tasks] == ["update_asked"]
            desk = await w.WebQuery().desk_ticket("desk-admin", "ticket-a")
            assert desk.job.asked_at
    asyncio.run(run())


def test_an_unpaid_order_is_not_offered_or_assigned_while_payments_are_on(monkeypatch):
    async def run():
        async with database() as pool:
            await _setup(pool, monkeypatch)
            from src import payments
            monkeypatch.setattr(payments, "enabled", lambda: True)
            m = w.WebMutation()
            with pytest.raises(ValueError, match="not paid"):
                await m.desk_dispatch_ticket("desk-admin", "ticket-a", "worker@example.com")
            async with w._ticket_transaction() as conn:
                row = await w._ticket_row(conn, "owner-a", "ticket-a", lock=True)
                assert await w._move(conn, "owner-a", row, "assign", actor_kind="system") == ""
            async with pool.connection() as conn:
                refused = await (await conn.execute(
                    "SELECT headline FROM ticket_events WHERE kind='refused'")).fetchall()
                assert refused[-1]["headline"] == "A move was refused: not paid yet"
                sent = await (await conn.execute("SELECT count(*) AS n FROM ticket_dispatches")).fetchone()
                assert sent["n"] == 0
            # A refused desk move is desk working: the owner does not read it.
            view = await w.WebQuery().ticket("owner-a", "ticket-a")
            assert all(e.kind != "refused" for e in view.events)
            assert "nudge" not in view.can   # paying is the next step, not asking
    asyncio.run(run())


def test_desk_assign_says_why_it_refuses(monkeypatch):
    async def run():
        async with database() as pool:
            await _setup(pool, monkeypatch)
            m = w.WebMutation()
            with pytest.raises(ValueError, match="not on the roster"):
                await m.desk_assign("desk-admin", "ticket-a", "as-nobody")
            assert await m.desk_assign("owner-a", "ticket-a", "as-nobody") is False
            async with pool.connection() as conn:
                await conn.execute("UPDATE work_requests SET closed=true, status='cancelled'")
            with pytest.raises(ValueError, match="closed"):
                await m.desk_assign("desk-admin", "ticket-a", "as-nobody")
    asyncio.run(run())


def test_the_desk_relays_start_and_delivery_in_the_owners_trail(monkeypatch):
    async def run():
        async with database() as pool:
            await _setup(pool, monkeypatch, status="assigned")
            async with pool.connection() as conn:
                await conn.execute("UPDATE work_requests SET assignee='Ravi Kumar'")
            m = w.WebMutation()
            assert await m.desk_start_ticket("desk-admin", "ticket-a")
            did = await m.desk_add_deliverable("desk-admin", "ticket-a", "paper", "EC 1996-2026",
                                               file_ref=FILE, file_name="ec.pdf")
            assert did
            view = await w.WebQuery().ticket("owner-a", "ticket-a")
            assert view.status == "submitted" and view.status_label == "Waiting on you"
            lines = [(e.kind, e.headline, e.actor_kind) for e in view.events]
            assert ("status", "Ravi Kumar started work", "system") in lines
            assert ("deliverable", "Ravi Kumar delivered “EC 1996-2026”", "system") in lines
            assert view.can == ["accept", "cancel", "message", "send_back"]
            async with pool.connection() as conn:
                via = await (await conn.execute(
                    "SELECT submitted_via FROM ticket_deliverables WHERE id=%s", (did,))).fetchone()
            assert via["submitted_via"] == "desk"
    asyncio.run(run())


def test_on_site_reads_in_progress_and_a_closed_order_drops_the_number(monkeypatch):
    async def run():
        async with database() as pool:
            await _setup(pool, monkeypatch, status="on_site")
            view = await w.WebQuery().ticket("owner-a", "ticket-a")
            assert view.status_label == "In progress"
            assert "accepted" not in w._CONTACT_STATUSES
            assert "jobs_open" not in w.AssignedPerson.__annotations__
            # Another customer's business volume never reaches an owner.
            assert "jobs_open" not in w.AssignedResourceTrust.__annotations__
            # Rating needs accepted work with a known provider, nothing less.
            async with pool.connection() as conn:
                await conn.execute("CREATE TABLE IF NOT EXISTS associate_reviews (id TEXT PRIMARY KEY,"
                                   "associate_id TEXT,ticket_id TEXT UNIQUE,owner_user_id TEXT,rating INT,"
                                   "note TEXT,created_at TEXT,updated_at TEXT)")
                await conn.execute("UPDATE work_requests SET assignee_ref='as-ravi',"
                                   " status='cancelled', closed=true")
            assert not await w.WebMutation().rate_associate("owner-a", "ticket-a", 5)
    asyncio.run(run())


def test_titles_are_stored_in_sentence_case_and_catalogue_names_win():
    assert w._service_title("Encumbrance Certificate") == "Encumbrance certificate"
    assert w._service_title("1-b / adangal EXTRACT") == "1-B / Adangal extract"
    assert w._service_title("Corner Survey") == "Corner survey"


def _held_rows(rows):
    return sorted((r["entry"], r["amount"], r.get("payee") or "")
                  for r in rows if r["from_bucket"] == "held")


def test_cancelling_releases_money_only_to_a_provider_on_site(monkeypatch):
    """`pay_anyway` settles trips a provider made. On an order nobody has
    taken it would write a release to a blank payee, so it is ignored."""
    async def run():
        async with database() as pool:
            await _setup(pool, monkeypatch)
            m = w.WebMutation()
            assert await m.fund_ticket("owner-a", "ticket-a")
            assert await m.cancel_ticket("owner-a", "ticket-a", pay_anyway=500)
            async with pool.connection() as conn:
                rows = await w._ledger_of(conn, "owner-a", "ticket-a")
            assert _held_rows(rows) == [("return", 1180.0, "")]
            # A second press is refused, and the refusal stays off the owner's page.
            assert not await m.cancel_ticket("owner-a", "ticket-a")
            view = await w.WebQuery().ticket("owner-a", "ticket-a")
            assert all(e.kind != "refused" for e in view.events)
            assert all("A move was refused" not in e.headline for e in view.events)
    asyncio.run(run())


def test_an_on_site_provider_can_be_paid_for_the_trips_on_cancelling(monkeypatch):
    async def run():
        async with database() as pool:
            await _setup(pool, monkeypatch, status="on_site")
            async with pool.connection() as conn:
                await conn.execute("UPDATE work_requests SET assignee='Ravi Kumar', assignee_ref='as-ravi'")
            m = w.WebMutation()
            assert await m.fund_ticket("owner-a", "ticket-a")
            assert await m.cancel_ticket("owner-a", "ticket-a", pay_anyway=500)
            async with pool.connection() as conn:
                rows = await w._ledger_of(conn, "owner-a", "ticket-a")
            assert _held_rows(rows) == [("fee", 50.0, ""), ("release", 450.0, "Ravi Kumar"),
                                        ("return", 680.0, "")]
    asyncio.run(run())


def test_on_site_with_only_a_typed_name_releases_nothing(monkeypatch):
    async def run():
        async with database() as pool:
            await _setup(pool, monkeypatch, status="on_site")
            async with pool.connection() as conn:
                await conn.execute("UPDATE work_requests SET assignee='Somebody typed'")
            m = w.WebMutation()
            assert await m.fund_ticket("owner-a", "ticket-a")
            assert await m.cancel_ticket("owner-a", "ticket-a", pay_anyway=500)
            async with pool.connection() as conn:
                rows = await w._ledger_of(conn, "owner-a", "ticket-a")
            assert _held_rows(rows) == [("return", 1180.0, "")]
    asyncio.run(run())


def test_work_sent_back_can_be_chased_once_it_goes_quiet(monkeypatch):
    async def run():
        async with database() as pool:
            await _setup(pool, monkeypatch, status="changes", status_at="2026-01-01T09:00:00")
            view = await w.WebQuery().ticket("owner-a", "ticket-a")
            assert "nudge" in view.can
            assert await w.WebMutation().nudge_ticket("owner-a", "ticket-a")
            view = await w.WebQuery().ticket("owner-a", "ticket-a")
            assert "nudge" not in view.can and view.asked_at
    asyncio.run(run())


def test_the_provider_reads_who_said_it_in_their_own_words():
    assert c.provider_label({"actor_kind": "owner", "actor_label": "You"}) == "The owner"
    assert c.provider_label({"actor_kind": "system", "actor_label": "Pattadar desk"}) == "Pattadar desk"
    assert c.provider_label({"actor_kind": "worker", "actor_label": "Ravi Kumar"}) == "Ravi Kumar"
    assert c.provider_label({"actor_kind": "", "actor_label": ""}) == "Pattadar"
