"""saveRecord with deed facts (docs/specs/2026-10-04-assistant-write-actions.md §4.1),
against real PostgreSQL.

Every rule in §4.1 item 7: the deed fields round-trip through record(id) and the
card, a bad stake is refused on create and on update, a repeated source_ref
answers with the record that holds it, two POSTs with one x-idempotency-key
make one row, another uid can neither see nor change the record, and the audit
line carries origin=assistant.

Set TEST_PG_DSN to the CI database. Every connection's search_path is limited
to a throwaway schema, so no application table is read or written. The
idempotency flow also needs the `idempotency_keys` table main.py writes to,
and skips when that database is unavailable.
"""
import asyncio
import json
import os
import secrets
import sys
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import psycopg
import pytest
from psycopg import sql
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import audit as a, main, web360 as w


_DEED = ("reg_doc_no TEXT NOT NULL DEFAULT '', sro TEXT NOT NULL DEFAULT '',"
         " reg_date TEXT NOT NULL DEFAULT '', purchase_date TEXT NOT NULL DEFAULT '',"
         " boundary_north TEXT NOT NULL DEFAULT '', boundary_south TEXT NOT NULL DEFAULT '',"
         " boundary_east TEXT NOT NULL DEFAULT '', boundary_west TEXT NOT NULL DEFAULT '',"
         " source_ref TEXT NOT NULL DEFAULT '', boundary TEXT NOT NULL DEFAULT '',"
         " geo_point TEXT NOT NULL DEFAULT '', shape TEXT NOT NULL DEFAULT '',"
         " address TEXT NOT NULL DEFAULT '', archived BOOLEAN NOT NULL DEFAULT false,"
         " litigation BOOLEAN NOT NULL DEFAULT false,"
         " market_value DOUBLE PRECISION NOT NULL DEFAULT 0,"
         " purchase_price DOUBLE PRECISION NOT NULL DEFAULT 0,"
         " stake TEXT NOT NULL DEFAULT 'owned', created_at TEXT NOT NULL DEFAULT ''")

BASE = [
    """CREATE TABLE audit_events (id TEXT PRIMARY KEY, actor TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL DEFAULT '', target TEXT NOT NULL DEFAULT '',
        details TEXT NOT NULL DEFAULT '', timestamp TEXT NOT NULL DEFAULT '')""",
    "CREATE TABLE groups (id TEXT PRIMARY KEY, owner_user_id TEXT, type TEXT DEFAULT 'family',"
    " name TEXT DEFAULT '', created_at TEXT DEFAULT '')",
    "CREATE TABLE passbooks (id TEXT PRIMARY KEY, owner_user_id TEXT, pattadar_no TEXT DEFAULT '',"
    " owner_name TEXT DEFAULT '', district TEXT DEFAULT '', mandal TEXT DEFAULT '',"
    " village TEXT DEFAULT '', state TEXT DEFAULT '', group_id TEXT DEFAULT '',"
    " created_at TEXT DEFAULT '')",
    "CREATE TABLE parcels (id TEXT PRIMARY KEY, passbook_id TEXT, survey_no TEXT,"
    " subdivision TEXT DEFAULT '', extent DOUBLE PRECISION DEFAULT 0,"
    " classification TEXT DEFAULT 'agri', status TEXT DEFAULT 'owned',"
    " loan_amount DOUBLE PRECISION DEFAULT 0, " + _DEED + ")",
    "CREATE TABLE properties (id TEXT PRIMARY KEY, owner_user_id TEXT, type TEXT DEFAULT 'flat',"
    " label TEXT DEFAULT '', locality TEXT DEFAULT '', city TEXT DEFAULT '',"
    " district TEXT DEFAULT '', khata_no TEXT DEFAULT '', owner_name TEXT DEFAULT '',"
    " holding_status TEXT DEFAULT 'owned', land_area DOUBLE PRECISION DEFAULT 0,"
    " land_unit TEXT DEFAULT 'Sq.yd', builtup_area DOUBLE PRECISION DEFAULT 0,"
    " builtup_unit TEXT DEFAULT 'Sq.ft', current_value DOUBLE PRECISION DEFAULT 0,"
    " group_id TEXT DEFAULT '', survey_no TEXT NOT NULL DEFAULT '', " + _DEED + ")",
    "CREATE UNIQUE INDEX uq_properties_owner_source ON properties (owner_user_id, source_ref)"
    " WHERE source_ref <> ''",
    "CREATE TABLE property_owners (id TEXT PRIMARY KEY, property_id TEXT, owner_name TEXT,"
    " user_id TEXT DEFAULT '', group_id TEXT DEFAULT '', share_pct DOUBLE PRECISION DEFAULT 0,"
    " role TEXT DEFAULT 'owner', is_current BOOLEAN DEFAULT true, created_at TEXT DEFAULT '')",
    "CREATE TABLE record_owners (id TEXT PRIMARY KEY, owner_user_id TEXT, record_id TEXT,"
    " name TEXT, parentage TEXT DEFAULT '', address TEXT DEFAULT '', role TEXT DEFAULT 'Owner',"
    " is_current BOOLEAN DEFAULT true, acquired_via TEXT DEFAULT '', sort INT DEFAULT 0,"
    " created_at TEXT DEFAULT '', photo_ref TEXT DEFAULT '')",
    "CREATE TABLE record_transfers (id TEXT PRIMARY KEY, owner_user_id TEXT, record_id TEXT,"
    " kind TEXT, deed_document_id TEXT, deed_no TEXT, sro TEXT, registered_on TEXT,"
    " prior_transfer_id TEXT, note TEXT, source TEXT, verified BOOLEAN, sort INT,"
    " created_at TEXT)",
    "CREATE TABLE record_transfer_parties (id TEXT PRIMARY KEY, owner_user_id TEXT,"
    " transfer_id TEXT, side TEXT, owner_id TEXT DEFAULT '', name TEXT, sort INT DEFAULT 0,"
    " created_at TEXT DEFAULT '')",
    # What record(id) counts and reads beside the row itself.
    "CREATE TABLE documents (id TEXT PRIMARY KEY, owner_user_id TEXT, name TEXT DEFAULT '', shelf TEXT DEFAULT '', doc_type TEXT DEFAULT '', sort INT DEFAULT 0,"
    " record_id TEXT DEFAULT '', parcel_id TEXT DEFAULT '', property_id TEXT DEFAULT '',"
    " created_at TEXT DEFAULT '')",
    "CREATE TABLE document_record_links (id TEXT PRIMARY KEY, owner_user_id TEXT,"
    " document_id TEXT, record_id TEXT, created_at TEXT DEFAULT '')",
    "CREATE TABLE land_features (id TEXT PRIMARY KEY, entity_id TEXT,"
    " condition_state TEXT DEFAULT 'good')",
    "CREATE TABLE record_people (id TEXT PRIMARY KEY, record_id TEXT)",
    "CREATE TABLE work_requests (id TEXT PRIMARY KEY, entity_id TEXT, closed BOOLEAN DEFAULT false)",
    "CREATE TABLE parcel_photos (id TEXT PRIMARY KEY, parcel_id TEXT, media_kind TEXT,"
    " captured_at TEXT, captured_by TEXT, owner_user_id TEXT)",
    "CREATE TABLE property_photos (id TEXT PRIMARY KEY, property_id TEXT, media_kind TEXT,"
    " captured_at TEXT, captured_by TEXT, owner_user_id TEXT)",
    "CREATE TABLE notes (id TEXT PRIMARY KEY, entity_id TEXT, owner_user_id TEXT,"
    " body TEXT, author TEXT, created_at TEXT)",
    "CREATE TABLE record_tags (id TEXT PRIMARY KEY, owner_user_id TEXT, entity_type TEXT,"
    " entity_id TEXT, tag TEXT, created_at TEXT DEFAULT '')",
    "CREATE TABLE combined_properties (id TEXT PRIMARY KEY, owner_user_id TEXT, name TEXT)",
    "CREATE TABLE combined_property_members (combined_property_id TEXT, owner_user_id TEXT,"
    " parcel_id TEXT, property_id TEXT)",
    "CREATE TABLE purchase_lots (id TEXT PRIMARY KEY, record_id TEXT, bought_on TEXT, sort INT,"
    " paid DOUBLE PRECISION DEFAULT 0)",
    # main.py's master columns this suite's records are read and written through.
    "ALTER TABLE parcels ADD COLUMN acquisition_source TEXT NOT NULL DEFAULT 'sale',"
    " ADD COLUMN guideline_value DOUBLE PRECISION NOT NULL DEFAULT 0,"
    " ADD COLUMN stamp_duty DOUBLE PRECISION NOT NULL DEFAULT 0,"
    " ADD COLUMN encumbrance_status TEXT NOT NULL DEFAULT '', ADD COLUMN ec_status TEXT NOT NULL DEFAULT '',"
    " ADD COLUMN ec_date TEXT NOT NULL DEFAULT '', ADD COLUMN mutation_status TEXT NOT NULL DEFAULT '',"
    " ADD COLUMN litigation_note TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE properties ADD COLUMN acquisition_mode TEXT NOT NULL DEFAULT 'purchase',"
    " ADD COLUMN guideline_value DOUBLE PRECISION NOT NULL DEFAULT 0,"
    " ADD COLUMN ghmc_assessment_no TEXT NOT NULL DEFAULT '', ADD COLUMN ec_status TEXT NOT NULL DEFAULT '',"
    " ADD COLUMN ec_date TEXT NOT NULL DEFAULT '', ADD COLUMN mutation_status TEXT NOT NULL DEFAULT '',"
    " ADD COLUMN litigation_note TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE passbooks ADD COLUMN father_husband_name TEXT DEFAULT '', ADD COLUMN photo TEXT DEFAULT ''",
    "ALTER TABLE record_transfer_parties ADD COLUMN parentage TEXT DEFAULT '', ADD COLUMN address TEXT DEFAULT '',"
    " ADD COLUMN extent DOUBLE PRECISION DEFAULT 0, ADD COLUMN extent_unit TEXT DEFAULT '',"
    " ADD COLUMN share_num INT DEFAULT 0, ADD COLUMN share_den INT DEFAULT 0, ADD COLUMN is_gpa BOOLEAN DEFAULT false",
    *w.rm.DDL,
    # What the Overview's compliance check reads (web360._record_compliance).
    "ALTER TABLE documents ADD COLUMN reading_id TEXT DEFAULT ''",
    "CREATE TABLE registered_documents (id TEXT PRIMARY KEY, owner_user_id TEXT, doc_type TEXT DEFAULT '')",
    "CREATE TABLE land_expenses (id TEXT PRIMARY KEY, owner_user_id TEXT, entity_id TEXT,"
    " category TEXT DEFAULT '', title TEXT DEFAULT '', spent_on TEXT DEFAULT '',"
    " has_receipt BOOLEAN DEFAULT false)",
    *w.governance.DDL,
    # The read-only public-record corpus a `pr:` ref must name (land.real_estate_records).
    "CREATE TABLE real_estate_records (rid TEXT, s_no INT, doc_no TEXT, year INT,"
    " sro_name TEXT, village TEXT, survey_no TEXT, plot_no TEXT, house_no TEXT,"
    " extent_val NUMERIC, extent_unit TEXT, property_type TEXT, land_class TEXT,"
    " transaction_type TEXT, txn_class TEXT, market_value BIGINT, consideration_value BIGINT,"
    " reg_date DATE, exec_date DATE, boundary_north TEXT, boundary_south TEXT,"
    " boundary_east TEXT, boundary_west TEXT, PRIMARY KEY (rid, s_no))",
]

ME, OTHER = "owner-a", "owner-b"


@asynccontextmanager
async def database():
    dsn = os.getenv("TEST_PG_DSN", "host=localhost port=5432 dbname=postgres user=rhub password=rhub-dev-pwd")
    name = "test_deed_" + secrets.token_hex(8)
    try:
        admin = await psycopg.AsyncConnection.connect(dsn, autocommit=True)
    except psycopg.OperationalError:
        if os.getenv("TEST_PG_DSN"):
            raise
        pytest.skip("Local test PostgreSQL unavailable; set TEST_PG_DSN in CI")
    await admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(name)))

    async def configure(conn):
        await conn.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(name)))

    pool = AsyncConnectionPool(dsn, min_size=1, max_size=6, open=False,
        configure=configure, kwargs={"autocommit": True, "row_factory": dict_row})
    old_pool, old_uid, old_audit, old_pr = w._pool, w._uid_of, a._pool, w.rm.PR_TABLE
    w.rm.PR_TABLE = "real_estate_records"       # resolved in the throwaway schema
    try:
        await pool.open(); await pool.wait()
        w.bind(pool, lambda info: info)
        a.bind(pool)
        async with pool.connection() as conn:
            for stmt in BASE + list(a.DDL):
                await conn.execute(stmt)
        yield pool
    finally:
        w.bind(old_pool, old_uid)
        a.bind(old_audit)
        w.rm.PR_TABLE = old_pr
        await pool.close()
        await admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(name)))
        await admin.close()


def _deed(**over) -> w.RecordInput:
    """A property the way the assistant's card sends it (contract C1)."""
    base = dict(
        kind="property", title="Plot 12, Katragunta", classification="open_plot",
        stake="owned", village="Katragunta", mandal="Markapur", district="Prakasam",
        extent=200.0, extent_unit="sq.yd", market_value=900000.0, purchase_price=750000.0,
        survey_no="214/2", doc_no="1234/2019", sro="Markapur", reg_date="2019-07-18",
        boundary_north="Road", boundary_south="Plot 13", boundary_east="Canal",
        boundary_west="Plot 11", seller_name="K. Ramaiah", buyer_name="T. Sankara Reddy",
        owner_name="T. Sankara Reddy", source_ref="pr:AP0808201900001234:1",
        origin="assistant")
    base.update(over)
    return w.RecordInput(**base)


async def _save(uid: str, inp: w.RecordInput) -> str:
    return await w.WebMutation().save_record(uid, inp)


async def _corpus(pool, ref: str, **cols) -> None:
    """One public-record row for `ref` ('pr:<rid>:<s_no>')."""
    _, rid, sno = ref.split(":")
    cols = {"rid": rid, "s_no": int(sno), **cols}
    async with pool.connection() as conn:
        await conn.execute(
            sql.SQL("INSERT INTO real_estate_records ({}) VALUES ({})").format(
                sql.SQL(", ").join(map(sql.Identifier, cols)),
                sql.SQL(", ").join(sql.Placeholder() * len(cols))), list(cols.values()))


async def _rows(pool, query: str, args=()) -> list:
    async with pool.connection() as conn:
        return await (await conn.execute(query, args)).fetchall()


# ── Round trip ────────────────────────────────────────────────────────

def test_property_saves_every_deed_field_and_reads_it_back():
    async def run():
        async with database() as pool:
            await _corpus(pool, "pr:AP0808201900001234:1", doc_no="1234", year=2019,
                          sro_name="Markapur", reg_date="2019-07-18", txn_class="SALE")
            rid = await _save(ME, _deed())
            d = await w.WebQuery().record(ME, rid)
            assert d is not None
            assert (d.survey_no, d.doc_no, d.sro, d.reg_date) == (
                "214/2", "1234/2019", "Markapur", "2019-07-18")
            assert (d.boundary_north, d.boundary_south, d.boundary_east, d.boundary_west) == (
                "Road", "Plot 13", "Canal", "Plot 11")
            assert d.source_ref == "pr:AP0808201900001234:1"
            assert (d.stake, d.extent, d.extent_unit) == ("owned", 200.0, "sq.yd")
            assert d.bought_year == "2019"

            # The card carries them too, so a drawer that sends the form whole
            # cannot erase what it never showed.
            async with pool.connection() as conn:
                row = next(r for r in await w._cards(conn, ME) if r["id"] == rid)
            card = w._to_card(row, [])
            assert (card.survey_no, card.doc_no, card.reg_date, card.source_ref) == (
                "214/2", "1234/2019", "2019-07-18", "pr:AP0808201900001234:1")
            assert card.deed_line == "D.No 1234/2019 · Markapur SRO"

            prop = (await _rows(pool, "SELECT * FROM properties WHERE id=%s", (rid,)))[0]
            assert prop["purchase_date"] == "2019-07-18"
            assert prop["purchase_price"] == 750000.0

            # Seller → buyer, in all three places a reader looks for it.
            owners = await _rows(pool, "SELECT name, role, is_current FROM record_owners"
                                       " WHERE record_id=%s ORDER BY sort", (rid,))
            assert [(o["name"], o["role"], o["is_current"]) for o in owners] == [
                ("K. Ramaiah", "Seller", False), ("T. Sankara Reddy", "Owner", True)]
            tr = await _rows(pool, "SELECT * FROM record_transfers WHERE record_id=%s", (rid,))
            assert len(tr) == 1
            assert (tr[0]["deed_no"], tr[0]["sro"], tr[0]["registered_on"], tr[0]["source"]) == (
                "1234/2019", "Markapur", "2019-07-18", "public_records")
            sides = await _rows(pool, "SELECT side, name FROM record_transfer_parties"
                                      " WHERE transfer_id=%s ORDER BY sort", (tr[0]["id"],))
            assert [(s["side"], s["name"]) for s in sides] == [
                ("from", "K. Ramaiah"), ("to", "T. Sankara Reddy")]
            po = await _rows(pool, "SELECT owner_name, role, user_id FROM property_owners"
                                   " WHERE property_id=%s ORDER BY role", (rid,))
            assert [(p["owner_name"], p["role"], p["user_id"]) for p in po] == [
                ("T. Sankara Reddy", "owner", ME), ("K. Ramaiah", "seller", "")]
    asyncio.run(run())


def test_parcel_keeps_deed_facts_and_converts_yards_to_acres():
    async def run():
        async with database() as pool:
            rid = await _save(ME, _deed(
                kind="parcel", title="Sy 88", classification="agri", survey_no="214/2",
                extent=4840.0, extent_unit="sq.yd", source_ref="pr:AP0808201900005555:2"))
            d = await w.WebQuery().record(ME, rid)
            # The survey number given as itself wins over the title's.
            assert d.title == "Sy 214/2"
            assert d.survey_no == "214/2"
            # 4,840 sq.yd is one acre — not 4,840 acres.
            assert (d.extent, d.extent_unit) == (1.0, "ac")
            assert (d.doc_no, d.sro, d.reg_date, d.boundary_east) == (
                "1234/2019", "Markapur", "2019-07-18", "Canal")
            assert d.source_ref == "pr:AP0808201900005555:2"
            assert len(await _rows(pool, "SELECT 1 FROM record_owners WHERE record_id=%s", (rid,))) == 2
    asyncio.run(run())


def test_watching_copies_the_land_and_not_the_parties():
    async def run():
        async with database() as pool:
            rid = await _save(ME, _deed(stake="watch", owner_name=None))
            d = await w.WebQuery().record(ME, rid)
            assert (d.stake, d.doc_no, d.boundary_north) == ("watch", "1234/2019", "Road")
            assert d.owner_name == ""
            for table, col in (("record_owners", "record_id"), ("record_transfers", "record_id"),
                               ("property_owners", "property_id")):
                assert await _rows(pool, f"SELECT 1 FROM {table} WHERE {col}=%s", (rid,)) == []
    asyncio.run(run())


def test_update_changes_deed_fields_and_leaves_omitted_ones_alone():
    async def run():
        async with database() as pool:
            rid = await _save(ME, _deed())
            await _save(ME, w.RecordInput(id=rid, sro="Ongole", boundary_west=""))
            d = await w.WebQuery().record(ME, rid)
            assert (d.sro, d.boundary_west) == ("Ongole", "")
            assert (d.doc_no, d.survey_no, d.reg_date, d.boundary_north) == (
                "1234/2019", "214/2", "2019-07-18", "Road")
            # Provenance is create-only.
            await _save(ME, w.RecordInput(id=rid, source_ref="pr:other:1"))
            assert (await w.WebQuery().record(ME, rid)).source_ref == "pr:AP0808201900001234:1"
            corr = await w.WebQuery().corrections(ME, rid)
            assert {(c.field, c.was, c.now) for c in corr} >= {("SRO", "Markapur", "Ongole")}
    asyncio.run(run())


# ── Refusals ──────────────────────────────────────────────────────────

def test_bad_stake_is_refused_on_create_and_on_update():
    async def run():
        async with database() as pool:
            with pytest.raises(ValueError, match="stake"):
                await _save(ME, _deed(stake="mine"))
            assert await _rows(pool, "SELECT 1 FROM properties") == []
            rid = await _save(ME, _deed(stake="managed"))
            with pytest.raises(ValueError, match="stake"):
                await _save(ME, w.RecordInput(id=rid, stake="owner"))
            assert (await w.WebQuery().record(ME, rid)).stake == "managed"
            # Each of the three is accepted.
            for stake in ("owned", "managed", "watch"):
                await _save(ME, w.RecordInput(id=rid, stake=stake))
                assert (await w.WebQuery().record(ME, rid)).stake == stake
    asyncio.run(run())


def test_other_bad_values_are_refused_not_stored():
    async def run():
        async with database() as pool:
            for bad in (dict(status="sold"), dict(reg_date="18/07/2019"),
                        dict(source_ref="x" * 65), dict(source_ref="pr:<script>"),
                        dict(origin="model"), dict(extent_unit="hectare"),
                        dict(kind="flat")):
                with pytest.raises(ValueError):
                    await _save(ME, _deed(**bad))
            assert await _rows(pool, "SELECT 1 FROM properties") == []
            assert await _rows(pool, "SELECT 1 FROM parcels") == []
    asyncio.run(run())


# ── Duplicate guard ───────────────────────────────────────────────────

def test_same_source_ref_returns_the_existing_record():
    async def run():
        async with database() as pool:
            first = await _save(ME, _deed())
            again = await _save(ME, _deed(title="Renamed"))
            # Saved as a parcel this time: still the same deed, still one record.
            as_parcel = await _save(ME, _deed(kind="parcel", classification="agri"))
            assert first == again == as_parcel
            assert len(await _rows(pool, "SELECT 1 FROM properties")) == 1
            assert await _rows(pool, "SELECT 1 FROM parcels") == []
            assert len(await _rows(pool, "SELECT 1 FROM record_owners")) == 2
            # A parcel's dedupe runs under its passbook owner.
            p1 = await _save(ME, _deed(kind="parcel", source_ref="pr:P:1"))
            assert await _save(ME, _deed(kind="parcel", source_ref="pr:P:1")) == p1
            assert len(await _rows(pool, "SELECT 1 FROM parcels")) == 1
            # Without a source_ref nothing is deduplicated: the drawer can add
            # two records that look alike.
            assert await _save(ME, _deed(source_ref=None)) != await _save(ME, _deed(source_ref=""))
            # Another account saving the same deed gets its own record.
            theirs = await _save(OTHER, _deed())
            assert theirs != first
    asyncio.run(run())


def test_same_source_ref_under_another_stake_is_refused_not_reported_saved():
    """A Watching save must not answer with the owned record (party names and
    all) as if it were saved as Watching — nor a Mine save leave a watch."""
    async def run():
        async with database() as pool:
            await _save(ME, _deed())
            with pytest.raises(ValueError, match="already in your properties as Owned"):
                await _save(ME, _deed(stake="watch"))
            await _save(ME, _deed(source_ref="pr:W:1", stake="watch"))
            with pytest.raises(ValueError, match="as Watching"):
                await _save(ME, _deed(source_ref="pr:W:1", stake="owned"))
            assert len(await _rows(pool, "SELECT 1 FROM properties")) == 2
    asyncio.run(run())


def test_re_saving_an_archived_deed_brings_it_back():
    async def run():
        async with database() as pool:
            rid = await _save(ME, _deed())
            await w.WebMutation().archive_records(ME, [rid])
            assert await _save(ME, _deed()) == rid
            row = (await _rows(pool, "SELECT archived FROM properties WHERE id=%s", (rid,)))[0]
            assert row["archived"] is False
    asyncio.run(run())


def test_watching_never_stores_an_owner_name_even_when_sent():
    async def run():
        async with database() as pool:
            rid = await _save(ME, _deed(stake="watch", owner_name="Third Party Name",
                                        source_ref="pr:R1:1"))
            assert (await w.WebQuery().record(ME, rid)).owner_name == ""
            pid = await _save(ME, _deed(kind="parcel", stake="watch", owner_name="Third Party Name",
                                        source_ref="pr:R2:1"))
            names = await _rows(pool, "SELECT owner_name FROM passbooks pb JOIN parcels p"
                                      " ON p.passbook_id=pb.id WHERE p.id=%s", (pid,))
            assert names[0]["owner_name"] == ""
    asyncio.run(run())


def test_parcel_update_with_title_and_survey_no_sets_survey_once():
    async def run():
        async with database() as pool:
            pid = await _save(ME, _deed(kind="parcel", classification="agri", source_ref="pr:S:1"))
            await _save(ME, w.RecordInput(id=pid, title="Sy 214/2", survey_no="99/1",
                                          market_value=5.0))
            d = await w.WebQuery().record(ME, pid)
            assert d.survey_no == "99/1"
    asyncio.run(run())


def test_a_parcel_extent_resent_in_yards_logs_no_correction():
    async def run():
        async with database() as pool:
            pid = await _save(ME, _deed(kind="parcel", classification="agri", source_ref="pr:Y:1",
                                        extent=133.33, extent_unit="sq.yd"))
            await _save(ME, w.RecordInput(id=pid, extent=133.33, extent_unit="sq.yd"))
            fields = {c.field for c in await w.WebQuery().corrections(ME, pid)}
            assert not fields & {"Extent", "Extent unit"}
            await _save(ME, w.RecordInput(id=pid, extent=1.0, extent_unit="ac"))
            corr = [c for c in await w.WebQuery().corrections(ME, pid) if c.field == "Extent"]
            assert len(corr) == 1 and corr[0].now == "1.0"
    asyncio.run(run())


def test_concurrent_saves_of_one_deed_make_one_record():
    async def run():
        async with database() as pool:
            ids = await asyncio.gather(*[_save(ME, _deed(kind=k)) for k in
                                         ("property", "parcel", "property", "parcel")])
            assert len(set(ids)) == 1
            n = len(await _rows(pool, "SELECT 1 FROM properties")) + len(
                await _rows(pool, "SELECT 1 FROM parcels"))
            assert n == 1
    asyncio.run(run())


# ── Ownership ─────────────────────────────────────────────────────────

def test_another_uid_cannot_see_or_update_the_record():
    async def run():
        async with database() as pool:
            rid = await _save(ME, _deed())
            assert await w.WebQuery().record(OTHER, rid) is None
            with pytest.raises(ValueError):
                await _save(OTHER, w.RecordInput(id=rid, sro="Elsewhere", stake="watch"))
            d = await w.WebQuery().record(ME, rid)
            assert (d.sro, d.stake) == ("Markapur", "owned")
            # Nor can another uid learn the id by replaying its source_ref.
            assert await _save(OTHER, _deed()) != rid
    asyncio.run(run())


# ── Audit ─────────────────────────────────────────────────────────────

def test_audit_line_carries_origin_and_source_ref():
    async def run():
        async with database() as pool:
            rid = await _save(ME, _deed())
            pid = await _save(ME, _deed(kind="parcel", source_ref="pr:P:9", origin="drawer"))
            rows = await _rows(pool, "SELECT resource_id, action, metadata FROM audit_outbox"
                                     " WHERE resource_id = ANY(%s)", ([rid, pid],))
            by = {r["resource_id"]: r for r in rows}
            assert by[rid]["action"] == "create_property"
            meta = by[rid]["metadata"]
            meta = json.loads(meta) if isinstance(meta, str) else meta
            assert meta["origin"] == "assistant"
            assert meta["source_ref"] == "pr:AP0808201900001234:1"
            # Party names never ride into the envelope.
            assert "Ramaiah" not in json.dumps(meta) and "Sankara" not in json.dumps(meta)
            pmeta = by[pid]["metadata"]
            pmeta = json.loads(pmeta) if isinstance(pmeta, str) else pmeta
            assert (by[pid]["action"], pmeta["origin"]) == ("create_parcel", "drawer")
    asyncio.run(run())


def test_audit_spec_allowlists_origin_for_creates_only():
    assert a.filter_metadata("create_property", {"origin": "assistant", "source_ref": "pr:x:1",
                                                 "seller": "K. Ramaiah"}) == {
        "origin": "assistant", "source_ref": "pr:x:1"}
    assert a.filter_metadata("create_parcel", {"origin": "drawer"}) == {"origin": "drawer"}


# ── Idempotency: two POSTs, one key ───────────────────────────────────

try:
    with psycopg.connect(main.DSN, connect_timeout=2) as _c:
        _c.execute("SELECT 1 FROM idempotency_keys LIMIT 0")
        IDEM_DB = True
except Exception:
    IDEM_DB = False


def test_two_posts_with_one_idempotency_key_make_one_row():
    if not IDEM_DB:
        pytest.skip("idempotency_keys database not available")

    async def run():
        async with database() as pool:
            calls = []

            async def graphql_app(scope, receive, send):
                # Stands in for /graphql: runs saveRecord as the x-user-id the
                # gateway injected, and answers the way strawberry does.
                body = json.loads((await receive())["body"])
                uid = dict(scope["headers"])[b"x-user-id"].decode()
                calls.append(uid)
                rid = await _save(uid, _deed(**body["variables"]["input"]))
                out = json.dumps({"data": {"web": {"saveRecord": rid}}}).encode()
                await send({"type": "http.response.start", "status": 200,
                            "headers": [(b"content-type", b"application/json")]})
                await send({"type": "http.response.body", "body": out})

            idem_pool = AsyncConnectionPool(main.DSN, min_size=1, max_size=2, open=False,
                                            kwargs={"row_factory": dict_row, "autocommit": True})
            await idem_pool.open(wait=True, timeout=5)
            prev, main.pool = main.pool, idem_pool
            uid = "idem-deed-" + uuid.uuid4().hex[:8]
            # No source_ref, so only the key can stop the second insert.
            req = json.dumps({"query": "mutation SR($input:RecordInput!) { web { saveRecord(input:$input) } }",
                              "variables": {"input": {"source_ref": ""}}}).encode()
            headers = [(b"content-type", b"application/json"), (b"x-user-id", uid.encode()),
                       (b"x-idempotency-key", b"asst:proposal-1:0")]

            async def post():
                sent, done = [], False

                async def receive():
                    nonlocal done
                    if done:
                        return {"type": "http.disconnect"}
                    done = True
                    return {"type": "http.request", "body": req, "more_body": False}

                async def send(msg):
                    sent.append(msg)
                scope = {"type": "http", "method": "POST", "path": "/graphql", "headers": headers}
                await main.IdempotencyMiddleware(graphql_app)(scope, receive, send)
                start = next(m for m in sent if m["type"] == "http.response.start")
                body = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
                return dict(start["headers"]), json.loads(body)

            try:
                h1, b1 = await post()
                h2, b2 = await post()
                assert b1 == b2
                assert h2.get(b"x-idempotent-replay") == b"1"
                assert calls == [uid]
                assert len(await _rows(pool, "SELECT 1 FROM properties WHERE owner_user_id=%s",
                                       (uid,))) == 1
            finally:
                main.pool = prev
                async with idem_pool.connection() as conn:
                    await conn.execute("DELETE FROM idempotency_keys WHERE owner_user_id=%s", (uid,))
                await idem_pool.close()
    asyncio.run(run())
