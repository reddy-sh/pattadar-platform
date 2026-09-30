"""Web-360's audit trail and the atomicity of a record delete, against real PostgreSQL.

Set TEST_PG_DSN to the CI database. Every connection's search_path is limited
to a throwaway schema, so no application table is read or written.
"""
import asyncio
import os
import secrets
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import psycopg
import pytest
from psycopg import sql
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import audit as a, ticketing as t, web360 as w


BASE = [
    """CREATE TABLE audit_events (id TEXT PRIMARY KEY, actor TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL DEFAULT '', target TEXT NOT NULL DEFAULT '',
        details TEXT NOT NULL DEFAULT '', timestamp TEXT NOT NULL DEFAULT '')""",
    "CREATE TABLE passbooks (id TEXT PRIMARY KEY,owner_user_id TEXT,group_id TEXT DEFAULT '')",
    "CREATE TABLE parcels (id TEXT PRIMARY KEY,passbook_id TEXT,survey_no TEXT,subdivision TEXT DEFAULT '')",
    "CREATE TABLE properties (id TEXT PRIMARY KEY,owner_user_id TEXT,label TEXT DEFAULT '',group_id TEXT DEFAULT '')",
    """CREATE TABLE documents (id TEXT PRIMARY KEY,owner_user_id TEXT,record_id TEXT DEFAULT '',
        parcel_id TEXT DEFAULT '',property_id TEXT DEFAULT '',reading_id TEXT DEFAULT '')""",
    "CREATE TABLE registered_documents (id TEXT PRIMARY KEY,owner_user_id TEXT,parcel_id TEXT DEFAULT '',property_id TEXT DEFAULT '')",
    "CREATE TABLE document_record_links (id TEXT PRIMARY KEY,owner_user_id TEXT,"
    "document_id TEXT,record_id TEXT,created_at TEXT DEFAULT '')",
    "CREATE TABLE share_links (id TEXT PRIMARY KEY,document_id TEXT)",
    "CREATE TABLE document_versions (id TEXT PRIMARY KEY,document_id TEXT)",
    "CREATE TABLE record_tags (id TEXT PRIMARY KEY,entity_id TEXT)",
    "CREATE TABLE parcel_photos (id TEXT PRIMARY KEY,parcel_id TEXT)",
    "CREATE TABLE property_photos (id TEXT PRIMARY KEY,property_id TEXT)",
    "CREATE TABLE work_requests (id TEXT PRIMARY KEY,owner_user_id TEXT,entity_id TEXT,"
    "kind TEXT DEFAULT 'ec',title TEXT DEFAULT 'EC',entity_type TEXT DEFAULT 'record',"
    "assignee TEXT DEFAULT '',cost DOUBLE PRECISION DEFAULT 0,stage INT DEFAULT 0,"
    "needs_you BOOLEAN DEFAULT false,note TEXT DEFAULT '',due_date TEXT DEFAULT '',"
    "closed BOOLEAN DEFAULT false,created_at TEXT DEFAULT '',params TEXT DEFAULT '{}',"
    "area_key TEXT DEFAULT '',area_label TEXT DEFAULT '',status TEXT DEFAULT '',"
    "status_at TEXT DEFAULT '',quoted DOUBLE PRECISION DEFAULT 0,"
    "payee_share DOUBLE PRECISION DEFAULT 0,assignee_ref TEXT DEFAULT '',"
    "outcome_note TEXT DEFAULT '',batch_id TEXT DEFAULT '')",
    "CREATE TABLE service_batches (id TEXT PRIMARY KEY,owner_user_id TEXT,record_id TEXT)",
    "CREATE TABLE boundary_marks (id TEXT PRIMARY KEY,record_id TEXT)",
    "CREATE TABLE record_people (id TEXT PRIMARY KEY,record_id TEXT)",
    # The ownership chain and the title-provenance graph are swept with the
    # record too, so the happy path needs them present.
    "CREATE TABLE record_owners (id TEXT PRIMARY KEY,record_id TEXT)",
    "CREATE TABLE record_transfers (id TEXT PRIMARY KEY,owner_user_id TEXT,record_id TEXT,"
    "prior_transfer_id TEXT DEFAULT '')",
    "CREATE TABLE record_transfer_parties (id TEXT PRIMARY KEY,owner_user_id TEXT,"
    "transfer_id TEXT)",
    "CREATE TABLE people_payments (id TEXT PRIMARY KEY,record_id TEXT)",
    "CREATE TABLE purchase_lots (id TEXT PRIMARY KEY,record_id TEXT)",
    "CREATE TABLE capital_costs (id TEXT PRIMARY KEY,record_id TEXT)",
    "CREATE TABLE waiting_items (id TEXT PRIMARY KEY,record_id TEXT)",
    "CREATE TABLE land_features (id TEXT PRIMARY KEY,entity_id TEXT)",
    "CREATE TABLE land_expenses (id TEXT PRIMARY KEY,entity_id TEXT)",
]

# Left out of BASE on purpose: the sweep at the end of delete_records names it,
# so its absence is how a failure is injected halfway through the twenty
# DELETEs without reaching inside the function to do it.
NOTES = "CREATE TABLE notes (id TEXT PRIMARY KEY,entity_id TEXT)"


@asynccontextmanager
async def database():
    dsn = os.getenv("TEST_PG_DSN", "host=localhost port=5432 dbname=postgres user=rhub password=rhub-dev-pwd")
    name = "test_trail_" + secrets.token_hex(8)
    try:
        admin = await psycopg.AsyncConnection.connect(dsn, autocommit=True)
    except psycopg.OperationalError:
        if os.getenv("TEST_PG_DSN"):
            raise
        pytest.skip("Local test PostgreSQL unavailable; set TEST_PG_DSN in CI")
    await admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(name)))

    async def configure(conn):
        await conn.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(name)))

    pool = AsyncConnectionPool(dsn, min_size=1, max_size=4, open=False,
        configure=configure, kwargs={"autocommit": True, "row_factory": dict_row})
    old_pool, old_uid = w._pool, w._uid_of
    try:
        await pool.open(); await pool.wait()
        w.bind(pool, lambda info: info)
        async with pool.connection() as conn:
            for stmt in BASE + list(a.DDL) + list(t.DDL):
                await conn.execute(stmt)
            await conn.execute("INSERT INTO passbooks (id,owner_user_id) VALUES ('pb-a','owner-a')")
            await conn.execute("INSERT INTO parcels (id,passbook_id,survey_no) VALUES ('record-a','pb-a','77')")
            await conn.execute("INSERT INTO properties (id,owner_user_id,label) VALUES ('record-b','owner-b','Not yours')")
        yield pool
    finally:
        w.bind(old_pool, old_uid)
        await pool.close()
        await admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(name)))
        await admin.close()


async def _drain():
    """Move everything queued onto the chain, the way the worker does."""
    while await a.run_one():
        pass


def test_history_and_corrections_survive_the_mutable_table_being_rewritten():
    async def run():
        async with database() as pool:
            a.bind(pool)
            q, conn_uid = w.WebQuery(), "owner-a"
            async with pool.connection() as conn:
                await w._audit(conn, conn_uid, "set_pin", "record-a", "Pin moved")
                await w._log_corrections(
                    conn, conn_uid, "record-a",
                    {"village": "Katragunta", "district": "Guntur"},
                    w.RecordInput(id="record-a", village="Katraguntla", district="Palnadu"))

            # Still queued, not yet chained: the owner must see it anyway, or
            # every screen would lag the change that opened it.
            assert {e.action for e in await q.record_history(conn_uid, "record-a")} == {
                "set_pin", "record.corrected"}
            await _drain()

            hist = await q.record_history(conn_uid, "record-a")
            assert [e.action for e in hist].count("record.corrected") == 2
            assert "Pin moved" in [e.detail for e in hist]
            # Who acted is said in words, never as the identity key.
            assert {e.by for e in hist} == {"You"}
            # A correction's old and new values are fields, not the JSON its
            # legacy line was stored as.
            fixes = [e for e in hist if e.action == "record.corrected"]
            assert {(e.field, e.was, e.now) for e in fixes} == {
                ("Village", "Katragunta", "Katraguntla"),
                ("District", "Guntur", "Palnadu")}
            assert {e.detail for e in fixes} == {""}
            assert {(e.field, e.was, e.now) for e in hist if e.action == "set_pin"} == {("", "", "")}
            corr = await q.corrections(conn_uid, "record-a")
            assert {(c.field, c.was, c.now) for c in corr} == {
                ("Village", "Katragunta", "Katraguntla"),
                ("District", "Guntur", "Palnadu")}

            # The legacy table is not the list any more. Rewriting it may cost a
            # line its words; it may not remove the line, or invent one.
            async with pool.connection() as conn:
                await conn.execute("DELETE FROM audit_events WHERE action='set_pin'")
                await conn.execute(
                    "UPDATE audit_events SET details='{\"field\":\"Village\",\"from\":\"\",\"to\":\"\"}'"
                    " WHERE details LIKE '%Katragunta%'")
                await conn.execute(
                    "INSERT INTO audit_events (id,actor,action,target,details,timestamp)"
                    " VALUES ('ae-forged','owner-a','add_person','record-a','Planted','2026-01-01')")
            hist = await q.record_history(conn_uid, "record-a")
            assert [e.action for e in hist].count("set_pin") == 1
            assert "add_person" not in [e.action for e in hist]
            assert [e.detail for e in hist if e.action == "set_pin"] == [""]
            assert len(await q.corrections(conn_uid, "record-a")) == 2

            # Another owner's record is still nobody else's history.
            assert await q.record_history(conn_uid, "record-b") == []
    asyncio.run(run())


def test_history_names_the_desk_by_kind_and_never_by_its_principal():
    async def run():
        async with database() as pool:
            a.bind(pool)
            async with pool.connection() as conn:
                await a.record(
                    conn, action="set_boundary", actor_principal="desk-staff-7",
                    affected_owner="owner-a", resource_id="record-a",
                    actor_kind=a.ACTOR_ADMIN)
            await _drain()
            hist = await w.WebQuery().record_history("owner-a", "record-a")
            assert [(e.action, e.by) for e in hist] == [("set_boundary", "Pattadar desk")]
            assert "desk-staff-7" not in {e.by for e in hist}
    asyncio.run(run())


def test_actor_word_says_who_acted_without_the_key():
    assert w._actor_word("owner-a", "owner-a", "owner") == "You"
    assert w._actor_word("owner-a", "desk-7", "admin") == "Pattadar desk"
    assert w._actor_word("owner-a", "system", "system") == "System"
    assert w._actor_word("owner-a", "someone", "recipient") == "A recipient"
    assert w._actor_word("owner-a", "owner-b", "owner") == "Another account"
    assert w._actor_word("owner-a", "x", "") == "Someone"


def test_lot_date_stores_day_month_year():
    assert w._lot_date("2019-07-18") == "18/07/2019"
    assert w._lot_date(" 18/07/2019 ") == "18/07/2019"
    assert w._lot_date("") == ""


def test_boundary_captions_say_saved_never_surveyed():
    assert w._boundary_caption("", True, "Katragunta") == "Boundary saved · Katragunta"
    assert w._boundary_caption("", True, "") == "Boundary saved"
    assert w._map_caption("", "parcel", True) == "Boundary saved over the survey plot"


def test_a_purchase_lot_can_be_corrected_by_its_owner_only():
    async def run():
        async with database() as pool:
            a.bind(pool)
            mutation = w.WebMutation()
            async with pool.connection() as conn:
                await conn.execute(
                    "ALTER TABLE purchase_lots ADD COLUMN owner_user_id TEXT,"
                    " ADD COLUMN bought_on TEXT DEFAULT '', ADD COLUMN extent DOUBLE PRECISION DEFAULT 0,"
                    " ADD COLUMN extent_unit TEXT DEFAULT 'ac', ADD COLUMN rate DOUBLE PRECISION DEFAULT 0,"
                    " ADD COLUMN paid DOUBLE PRECISION DEFAULT 0, ADD COLUMN govt_value DOUBLE PRECISION DEFAULT 0,"
                    " ADD COLUMN seller TEXT DEFAULT '', ADD COLUMN deed_no TEXT DEFAULT '',"
                    " ADD COLUMN sro TEXT DEFAULT '', ADD COLUMN sort INT DEFAULT 1")
                await conn.execute(
                    "INSERT INTO purchase_lots (id,record_id,owner_user_id,paid,extent)"
                    " VALUES ('lot-a','record-a','owner-a',1000,1)")

            assert await mutation.update_purchase(
                "owner-a", "lot-a", "2019-07-18", 1850000, 4.3, "ac", 1200000,
                "A seller", "4412/1998", "Markapur") is True
            # Somebody else's lot id changes nothing, and neither does a negative price.
            assert await mutation.update_purchase("owner-b", "lot-a", "", 1, 1) is False
            assert await mutation.update_purchase("owner-a", "lot-a", "", -5, 1) is False

            async with pool.connection() as conn:
                lot = await (await conn.execute("SELECT * FROM purchase_lots WHERE id='lot-a'")).fetchone()
            assert (lot["bought_on"], lot["paid"], lot["extent"], lot["govt_value"]) == (
                "18/07/2019", 1850000, 4.3, 1200000)
            assert round(lot["rate"]) == round(1850000 / 4.3)
            assert (lot["seller"], lot["deed_no"], lot["sro"], lot["sort"]) == (
                "A seller", "4412/1998", "Markapur", 1)
    asyncio.run(run())


def test_features_read_an_unlooked_feature_as_unknown_and_the_walk_as_the_owners_own():
    async def run():
        async with database() as pool:
            async with pool.connection() as conn:
                await conn.execute(
                    "ALTER TABLE land_features ADD COLUMN owner_user_id TEXT,"
                    " ADD COLUMN label TEXT DEFAULT '', ADD COLUMN sort INT DEFAULT 0,"
                    " ADD COLUMN type_key TEXT DEFAULT '', ADD COLUMN attributes TEXT DEFAULT '{}',"
                    " ADD COLUMN geometry TEXT DEFAULT '{}', ADD COLUMN spec TEXT DEFAULT '',"
                    " ADD COLUMN icon TEXT DEFAULT '', ADD COLUMN category TEXT DEFAULT '',"
                    " ADD COLUMN condition TEXT DEFAULT '', ADD COLUMN condition_state TEXT DEFAULT '',"
                    " ADD COLUMN note TEXT DEFAULT '', ADD COLUMN lat DOUBLE PRECISION DEFAULT 0,"
                    " ADD COLUMN lon DOUBLE PRECISION DEFAULT 0, ADD COLUMN pin_label TEXT DEFAULT '',"
                    " ADD COLUMN actions TEXT DEFAULT '[]', ADD COLUMN schema_version INT DEFAULT 1,"
                    " ADD COLUMN version INT DEFAULT 1")
                await conn.execute(
                    "ALTER TABLE land_expenses ADD COLUMN owner_user_id TEXT,"
                    " ADD COLUMN feature_id TEXT DEFAULT '', ADD COLUMN amount DOUBLE PRECISION DEFAULT 0,"
                    " ADD COLUMN has_receipt BOOLEAN DEFAULT false, ADD COLUMN kind TEXT DEFAULT ''")
                await conn.execute(
                    "ALTER TABLE parcel_photos ADD COLUMN owner_user_id TEXT,"
                    " ADD COLUMN feature_id TEXT DEFAULT '', ADD COLUMN captured_at TEXT DEFAULT '',"
                    " ADD COLUMN captured_by TEXT DEFAULT ''")
                await conn.execute(
                    "INSERT INTO land_features (id,entity_id,owner_user_id,label,category,condition_state)"
                    " VALUES ('f-a','record-a','owner-a','Bore','water','')")
                # Somebody else's photograph filed under the same record id.
                await conn.execute(
                    "INSERT INTO parcel_photos (id,parcel_id,owner_user_id,captured_at,captured_by)"
                    " VALUES ('ph-x','record-a','owner-b','2026-09-01T10:00:00Z','Stranger')")

            got = await w.WebQuery().features("owner-a", "record-a")
            # Nobody has looked at it: unknown, never a green "good".
            assert [f.condition_state for f in got.features] == ["unknown"]
            # And a stranger's capture date and name are not this owner's walk.
            assert (got.walked_on, got.walked_by) == ("", "")

            async with pool.connection() as conn:
                await conn.execute(
                    "INSERT INTO parcel_photos (id,parcel_id,owner_user_id,captured_at,captured_by)"
                    " VALUES ('ph-a','record-a','owner-a','2026-08-12T09:00:00Z','Ramesh')")
            got = await w.WebQuery().features("owner-a", "record-a")
            assert (got.walked_on, got.walked_by) == ("2026-08-12", "Ramesh")
    asyncio.run(run())


async def _chained(action: str) -> list:
    async with w._pool.connection() as conn:
        cur = await conn.execute(
            "SELECT affected_owner, resource_id FROM audit_events_v2 WHERE action=%s",
            (action,))
        return [(r["affected_owner"], r["resource_id"]) for r in await cur.fetchall()]


def test_money_set_aside_reaches_the_chained_trail_and_cannot_undo_itself():
    async def run():
        async with database() as pool:
            a.bind(pool)
            mutation = w.WebMutation()
            async with pool.connection() as conn:
                await conn.execute(
                    "INSERT INTO work_requests (id,owner_user_id,entity_id,status,stage,quoted)"
                    " VALUES ('ticket-a','owner-a','record-a','quoted',2,1000),"
                    " ('ticket-b','owner-a','record-a','quoted',2,400)")

            assert await mutation.fund_ticket("owner-a", "ticket-a")
            await _drain()
            assert await _chained("ticket.funded") == [("owner-a", "record-a")]

            # An audit line that cannot be written must cost the trail a line,
            # never the owner their money: the savepoint is the whole reason
            # `_audit` may swallow inside `_ticket_transaction`.
            async with pool.connection() as conn:
                await conn.execute("ALTER TABLE parcels DROP COLUMN subdivision")
            assert await mutation.fund_ticket("owner-a", "ticket-b")
            async with pool.connection() as conn:
                cur = await conn.execute(
                    "SELECT amount FROM service_payments WHERE ticket_id='ticket-b'")
                assert [r["amount"] for r in await cur.fetchall()] == [400]
    asyncio.run(run())


def test_delete_records_is_all_or_nothing_and_keeps_the_ticket_timeline():
    async def run():
        async with database() as pool:
            a.bind(pool)
            mutation = w.WebMutation()
            async with pool.connection() as conn:
                await conn.execute("INSERT INTO documents (id,owner_user_id,record_id) VALUES ('doc-a','owner-a','record-a')")
                await conn.execute("INSERT INTO record_tags (id,entity_id) VALUES ('tag-a','record-a')")
                await conn.execute("INSERT INTO parcel_photos (id,parcel_id) VALUES ('ph-a','record-a')")
                await conn.execute("INSERT INTO work_requests (id,owner_user_id,entity_id) VALUES ('ticket-a','owner-a','record-a')")
                await conn.execute(
                    "INSERT INTO ticket_events (id,ticket_id,owner_user_id,kind,headline)"
                    " VALUES ('te-a','ticket-a','owner-a','payment','Released 900')")
                await conn.execute(
                    "INSERT INTO service_payments (id,owner_user_id,ticket_id,entry,amount)"
                    " VALUES ('sp-a','owner-a','ticket-a','release',900)")

            with pytest.raises(psycopg.errors.UndefinedTable):
                await mutation.delete_records("owner-a", ["record-a"])
            async with pool.connection() as conn:
                for table in ("documents", "record_tags", "parcel_photos", "work_requests", "parcels"):
                    left = await (await conn.execute(f"SELECT count(*) AS n FROM {table}")).fetchone()
                    assert left["n"] == 1, table

            async with pool.connection() as conn:
                await conn.execute(NOTES)
            assert await mutation.delete_records("owner-a", ["record-a"]) == 1
            async with pool.connection() as conn:
                for table in ("documents", "record_tags", "parcel_photos", "work_requests", "parcels"):
                    left = await (await conn.execute(f"SELECT count(*) AS n FROM {table}")).fetchone()
                    assert left["n"] == 0, table
                # What the money did outlives the record it was spent on, and so
                # does the timeline that explains it.
                kept = await (await conn.execute("SELECT headline FROM ticket_events")).fetchall()
                assert [r["headline"] for r in kept] == ["Released 900"]
                paid = await (await conn.execute("SELECT note FROM service_payments")).fetchone()
                assert paid["note"] == "record deleted"

            await _drain()
            assert [e.action for e in await w.WebQuery().record_history("owner-a", "record-a")] == []
    asyncio.run(run())
