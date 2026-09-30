"""Combined properties: the aggregate, against real PostgreSQL.

A combined property is several records an owner holds as one piece of ground.
The thing that makes it safe is what it does NOT do, so that is most of what is
tested here: the member records, their papers, their boundaries and their own
ledgers are untouched by every write, and deleting the holding gives them back
whole.

Set TEST_PG_DSN to the CI database. Every connection's search_path is limited to
a throwaway schema, so no application table is read or written.
"""
import asyncio
import math
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
from src import audit as a, web360 as w


# Only the columns these resolvers actually read. `_cards` SELECTs * from both
# registers and reaches for the rest with .get(), so a narrow fixture is honest
# rather than lucky.
BASE = [
    """CREATE TABLE audit_events (id TEXT PRIMARY KEY, actor TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL DEFAULT '', target TEXT NOT NULL DEFAULT '',
        details TEXT NOT NULL DEFAULT '', timestamp TEXT NOT NULL DEFAULT '')""",
    """CREATE TABLE passbooks (id TEXT PRIMARY KEY, owner_user_id TEXT,
        pattadar_no TEXT DEFAULT '', owner_name TEXT DEFAULT '', village TEXT DEFAULT '',
        mandal TEXT DEFAULT '', district TEXT DEFAULT '', state TEXT DEFAULT '',
        group_id TEXT DEFAULT '')""",
    """CREATE TABLE parcels (id TEXT PRIMARY KEY, passbook_id TEXT, survey_no TEXT,
        subdivision TEXT DEFAULT '', extent DOUBLE PRECISION DEFAULT 0,
        classification TEXT DEFAULT 'agri', status TEXT DEFAULT 'owned',
        stake TEXT DEFAULT 'owned', archived BOOLEAN DEFAULT false,
        market_value DOUBLE PRECISION DEFAULT 0, purchase_price DOUBLE PRECISION DEFAULT 0,
        loan_amount DOUBLE PRECISION DEFAULT 0, guideline_value DOUBLE PRECISION DEFAULT 0,
        reg_doc_no TEXT DEFAULT '', sro TEXT DEFAULT '', litigation BOOLEAN DEFAULT false,
        geo_point TEXT DEFAULT '', shape TEXT DEFAULT '', boundary TEXT DEFAULT '',
        address TEXT DEFAULT '', created_at TEXT DEFAULT '')""",
    """CREATE TABLE properties (id TEXT PRIMARY KEY, owner_user_id TEXT,
        label TEXT DEFAULT '', type TEXT DEFAULT 'open_plot', holding_status TEXT DEFAULT 'owned',
        stake TEXT DEFAULT 'owned', archived BOOLEAN DEFAULT false, khata_no TEXT DEFAULT '',
        owner_name TEXT DEFAULT '', locality TEXT DEFAULT '', city TEXT DEFAULT '',
        district TEXT DEFAULT '', land_area DOUBLE PRECISION DEFAULT 0,
        land_unit TEXT DEFAULT 'Sq.yd', builtup_area DOUBLE PRECISION DEFAULT 0,
        builtup_unit TEXT DEFAULT 'Sq.ft', market_value DOUBLE PRECISION DEFAULT 0,
        current_value DOUBLE PRECISION DEFAULT 0, purchase_price DOUBLE PRECISION DEFAULT 0,
        reg_doc_no TEXT DEFAULT '', sro TEXT DEFAULT '', litigation BOOLEAN DEFAULT false,
        geo_point TEXT DEFAULT '', shape TEXT DEFAULT '', boundary TEXT DEFAULT '',
        address TEXT DEFAULT '', group_id TEXT DEFAULT '', created_at TEXT DEFAULT '')""",
    """CREATE TABLE documents (id TEXT PRIMARY KEY, owner_user_id TEXT,
        record_id TEXT DEFAULT '', parcel_id TEXT DEFAULT '', property_id TEXT DEFAULT '',
        passbook_id TEXT DEFAULT '',
        reading_id TEXT DEFAULT '', name TEXT DEFAULT '', title TEXT DEFAULT '',
        subtitle TEXT DEFAULT '', shelf TEXT DEFAULT '', page_count INTEGER DEFAULT 0,
        file_ref TEXT DEFAULT '', mime_type TEXT DEFAULT '', sort INTEGER DEFAULT 0,
        doc_type TEXT DEFAULT '', size_bytes BIGINT DEFAULT 0, source TEXT DEFAULT '',
        created_at TEXT DEFAULT '')""",
    """CREATE TABLE document_versions (id TEXT PRIMARY KEY, document_id TEXT,
        version INTEGER DEFAULT 1, made_on TEXT DEFAULT '')""",
    """CREATE TABLE record_tags (id TEXT PRIMARY KEY, owner_user_id TEXT DEFAULT '',
        entity_type TEXT DEFAULT '', entity_id TEXT DEFAULT '', tag TEXT DEFAULT '',
        created_at TEXT DEFAULT '')""",
    """CREATE TABLE share_links (id TEXT PRIMARY KEY, owner_user_id TEXT DEFAULT '',
        document_id TEXT DEFAULT '', revoked BOOLEAN DEFAULT false)""",
    "CREATE TABLE parcel_photos (id TEXT PRIMARY KEY, parcel_id TEXT, owner_user_id TEXT DEFAULT '', media_kind TEXT DEFAULT 'photo')",
    "CREATE TABLE property_photos (id TEXT PRIMARY KEY, property_id TEXT, owner_user_id TEXT DEFAULT '', media_kind TEXT DEFAULT 'photo')",
    "CREATE TABLE land_features (id TEXT PRIMARY KEY, entity_id TEXT, owner_user_id TEXT DEFAULT '', label TEXT DEFAULT '', sort INTEGER DEFAULT 0)",
    """CREATE TABLE land_expenses (id TEXT PRIMARY KEY, owner_user_id TEXT DEFAULT '',
        entity_type TEXT DEFAULT '', entity_id TEXT DEFAULT '', title TEXT DEFAULT '',
        subtitle TEXT DEFAULT '', kind TEXT DEFAULT 'running', category TEXT DEFAULT 'other',
        amount DOUBLE PRECISION DEFAULT 0, spent_on TEXT DEFAULT '', paid_by TEXT DEFAULT '',
        vendor TEXT DEFAULT '', note TEXT DEFAULT '', on_label TEXT DEFAULT '',
        on_icon TEXT DEFAULT '', recoverable BOOLEAN DEFAULT false,
        recoverable_note TEXT DEFAULT '', has_receipt BOOLEAN DEFAULT false,
        fiscal_year TEXT DEFAULT '', invoice_no TEXT DEFAULT '', warranty_until TEXT DEFAULT '',
        receipt_file_ref TEXT DEFAULT '', receipt_file_name TEXT DEFAULT '',
        receipt_mime_type TEXT DEFAULT '', receipt_size_bytes BIGINT DEFAULT 0,
        created_at TEXT DEFAULT '')""",
]

#: The real DDL text, filtered rather than retyped: this is the statement the
#: API runs on every boot, so the constraints under test are the shipped ones.
COMBINED_DDL = [s for s in w._DDL if "combined_" in s or "joint_fmb" in s
                or "document_record_links" in s
                # addPaper files into the owner's Documents folder.
                or "vault_folders" in s or "folder_id" in s]

LAT0, LON0 = 16.5, 79.4
M_LAT = 110_574.0
M_LON = 111_320.0 * math.cos(math.radians(LAT0))
SIDE = 348.4          # one side of a 30-acre square, in metres


def boundary_text(x0: float, x1: float) -> str:
    """A 30-acre rectangle between two eastings, in `parcels.boundary`'s own
    format: "lat,lon;lat,lon", open, corner order."""
    corners = [(0.0, x0), (0.0, x1), (SIDE, x1), (SIDE, x0)]
    return ";".join(f"{LAT0 + y / M_LAT:.6f},{LON0 + x / M_LON:.6f}"
                    for y, x in corners)


@asynccontextmanager
async def database():
    dsn = os.getenv("TEST_PG_DSN",
                    "host=localhost port=5432 dbname=postgres user=rhub password=rhub-dev-pwd")
    name = "test_combined_" + secrets.token_hex(8)
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
                              configure=configure,
                              kwargs={"autocommit": True, "row_factory": dict_row})
    old_pool, old_uid = w._pool, w._uid_of
    try:
        await pool.open()
        await pool.wait()
        w.bind(pool, lambda info: info)
        a.bind(pool)
        async with pool.connection() as conn:
            for stmt in BASE + list(a.DDL) + COMBINED_DDL:
                await conn.execute(stmt)
            # Two thirty-acre parcels under one khata, side by side on the
            # ground: the case this feature was asked for.
            await conn.execute(
                "INSERT INTO passbooks (id,owner_user_id,pattadar_no,owner_name,village,"
                "mandal,district) VALUES ('pb-a','owner-a','30877','T. Saraswathi',"
                "'Katragunta','Markapur','Prakasam')")
            await conn.execute(
                "INSERT INTO parcels (id,passbook_id,survey_no,extent,boundary,market_value,"
                "purchase_price,created_at) VALUES ('rec-one','pb-a','77',30,%s,3000000,"
                "1000000,'2026-01-01T00:00:00')", (boundary_text(0, SIDE),))
            await conn.execute(
                "INSERT INTO parcels (id,passbook_id,survey_no,extent,boundary,market_value,"
                "purchase_price,created_at) VALUES ('rec-two','pb-a','78',30,%s,3200000,"
                "1100000,'2026-01-02T00:00:00')", (boundary_text(SIDE, 2 * SIDE),))
            # A third, forty metres clear of the others, and a flat. Its outline
            # is drawn to its recorded five acres (58.1 m across the same 348.4 m
            # depth) so the measured/recorded comparison below is testing the
            # arithmetic rather than a fixture that disagrees with itself.
            await conn.execute(
                "INSERT INTO parcels (id,passbook_id,survey_no,extent,boundary,created_at)"
                " VALUES ('rec-far','pb-a','91',5,%s,'2026-01-03T00:00:00')",
                (boundary_text(2 * SIDE + 40, 2 * SIDE + 40 + 58.1),))
            # Land the account only looks after — not theirs to combine.
            await conn.execute(
                "INSERT INTO parcels (id,passbook_id,survey_no,extent,stake,created_at)"
                " VALUES ('rec-managed','pb-a','92',2,'managed','2026-01-04T00:00:00')")
            await conn.execute(
                "INSERT INTO properties (id,owner_user_id,label,builtup_area,created_at)"
                " VALUES ('rec-flat','owner-a','Flat 4B',1450,'2026-01-05T00:00:00')")
            # Somebody else's parcel, under their own khata.
            await conn.execute(
                "INSERT INTO passbooks (id,owner_user_id) VALUES ('pb-b','owner-b')")
            await conn.execute(
                "INSERT INTO parcels (id,passbook_id,survey_no,extent,created_at)"
                " VALUES ('rec-theirs','pb-b','5',9,'2026-01-06T00:00:00')")
        yield pool
    finally:
        w.bind(old_pool, old_uid)
        await pool.close()
        await admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(name)))
        await admin.close()


def test_a_holding_is_made_of_records_and_refuses_anything_else():
    async def run():
        async with database() as pool:
            m, q = w.WebMutation(), w.WebQuery()

            # One record is not a holding; fifty-one is not one either.
            assert await m.create_combined_property("owner-a", "Estate", ["rec-one"], "") == ""
            assert await m.create_combined_property("owner-a", "", ["rec-one", "rec-two"], "") == ""
            # Another owner's record, and land this account only manages.
            assert await m.create_combined_property(
                "owner-a", "Estate", ["rec-one", "rec-theirs"], "") == ""
            assert await m.create_combined_property(
                "owner-a", "Estate", ["rec-one", "rec-managed"], "") == ""
            # Nothing was written by any of those refusals.
            async with pool.connection() as conn:
                left = await (await conn.execute(
                    "SELECT count(*) AS n FROM combined_properties")).fetchone()
                assert left["n"] == 0

            cid = await m.create_combined_property(
                "owner-a", "Kondapur Estate", ["rec-one", "rec-two"],
                "Two khatas, one fence")
            assert cid.startswith("cp-")

            view = await q.combined_property("owner-a", cid)
            assert view.name == "Kondapur Estate"
            assert view.member_count == 2
            assert view.is_complete
            # 60 acres, summed from the members — and said in acres only,
            # because there is no built-up area in this holding to add.
            assert view.farm_extent == pytest.approx(60.0)
            assert view.built_extent == 0
            # The extent, and nothing else: the record count reaches the screen
            # through the tabs and the totals, and carrying it here too made the
            # header say "2 records" three times.
            assert view.extent_line == "60.00 ac"
            # One village for both parcels, so it keeps its full address rather
            # than being counted as "1 village".
            assert view.place_line == "Katragunta, Markapur, Prakasam"
            assert view.market_value == pytest.approx(6_200_000)
            assert [mem.title for mem in view.members] == ["Sy 77", "Sy 78"]
            assert all(mem.ground == "surveyed" for mem in view.members)

            # It is nobody else's holding, and its id tells a stranger nothing.
            assert await q.combined_property("owner-b", cid) is None
            assert await q.combined_properties("owner-b") == []
            assert await m.update_combined_property("owner-b", cid, "Mine now") is False
            assert await m.delete_combined_property("owner-b", cid) is False
            assert (await q.combined_property("owner-a", cid)).name == "Kondapur Estate"
    asyncio.run(run())


def test_one_record_belongs_to_one_holding():
    async def run():
        async with database() as pool:
            m, q = w.WebMutation(), w.WebQuery()
            cid = await m.create_combined_property("owner-a", "First", ["rec-one", "rec-two"], "")
            assert cid
            # rec-two is taken, so the second holding is refused outright rather
            # than created without it — two holdings each counting the same
            # thirty acres is the one thing this must never allow.
            assert await m.create_combined_property(
                "owner-a", "Second", ["rec-two", "rec-far"], "") == ""
            async with pool.connection() as conn:
                rows = await (await conn.execute(
                    "SELECT count(*) AS n FROM combined_properties")).fetchone()
                assert rows["n"] == 1

            # Membership is replaced whole. Swapping rec-two out frees it.
            assert await m.set_combined_members("owner-a", cid, ["rec-one", "rec-far"])
            second = await m.create_combined_property("owner-a", "Second", ["rec-two", "rec-flat"], "")
            assert second
            view = await q.combined_property("owner-a", second)
            assert view.parcel_count == 1 and view.property_count == 1
            # A flat's slab and a parcel's acres are reported apart, never added.
            assert view.farm_extent == pytest.approx(30.0)
            assert view.built_extent == pytest.approx(1450.0)
            assert view.extent_line == "30.00 ac · 1,450 Sq.ft built"

            # A replacement that is refused leaves the holding exactly as it was.
            assert await m.set_combined_members("owner-a", cid, ["rec-one", "rec-theirs"]) is False
            assert [mem.record_id for mem in (await q.combined_property("owner-a", cid)).members] \
                == ["rec-one", "rec-far"]
    asyncio.run(run())


def test_deleting_the_holding_gives_every_record_back_whole():
    async def run():
        async with database() as pool:
            m, q = w.WebMutation(), w.WebQuery()
            cid = await m.create_combined_property("owner-a", "Estate", ["rec-one", "rec-two"], "")
            async with pool.connection() as conn:
                await conn.execute(
                    "INSERT INTO documents (id,owner_user_id,record_id,name,shelf)"
                    " VALUES ('doc-one','owner-a','rec-one','FMB 77','map')")
                await conn.execute(
                    "INSERT INTO land_expenses (id,owner_user_id,entity_type,entity_id,"
                    "title,amount,kind,fiscal_year) VALUES ('exp-one','owner-a','record',"
                    "'rec-one','Mutation fee',2500,'running','2026-27')")
            assert await m.save_combined_expense(
                "owner-a", cid, "Boundary fence", 180000, "12/08/2026", "capital")

            assert await m.delete_combined_property("owner-a", cid) is True
            assert await q.combined_property("owner-a", cid) is None

            async with pool.connection() as conn:
                # The holding, its membership and its OWN costs are gone.
                for table in ("combined_properties", "combined_property_members",
                              "combined_property_expenses"):
                    n = await (await conn.execute(
                        f"SELECT count(*) AS n FROM {table}")).fetchone()
                    assert n["n"] == 0, table
                # Every record, paper and record-level cost is untouched.
                for table, expected in (("parcels", 5), ("properties", 1),
                                        ("documents", 1), ("land_expenses", 1)):
                    n = await (await conn.execute(
                        f"SELECT count(*) AS n FROM {table}")).fetchone()
                    assert n["n"] == expected, table
                kept = await (await conn.execute(
                    "SELECT boundary, extent FROM parcels WHERE id='rec-one'")).fetchone()
                assert kept["extent"] == 30 and kept["boundary"]
    asyncio.run(run())


def test_a_deleted_member_leaves_the_holding_short_not_silent():
    async def run():
        async with database() as pool:
            m, q = w.WebMutation(), w.WebQuery()
            cid = await m.create_combined_property("owner-a", "Estate", ["rec-one", "rec-two"], "")
            assert await m.save_combined_expense(
                "owner-a", cid, "Shared well", 90000, "01/07/2026", "capital")

            # A record deleted from Properties — nothing to do with this holding.
            async with pool.connection() as conn:
                await conn.execute("DELETE FROM parcels WHERE id='rec-two'")

            view = await q.combined_property("owner-a", cid)
            assert view.member_count == 1
            # The holding still exists and still says what it cost; it just
            # cannot pretend to be whole.
            assert view.is_complete is False
            assert view.combined_spend == pytest.approx(90000)
            assert [mem.record_id for mem in view.members] == ["rec-one"]
    asyncio.run(run())


def test_costs_carry_the_scope_they_were_recorded_at():
    async def run():
        async with database() as pool:
            m, q = w.WebMutation(), w.WebQuery()
            cid = await m.create_combined_property("owner-a", "Estate", ["rec-one", "rec-two"], "")
            async with pool.connection() as conn:
                await conn.execute(
                    "INSERT INTO land_expenses (id,owner_user_id,entity_type,entity_id,"
                    "title,amount,kind,category,fiscal_year,spent_on) VALUES"
                    " ('exp-one','owner-a','record','rec-one','Mutation fee',2500,"
                    "'running','office','2026-27','28/07/2026')")
            eid = await m.save_combined_expense(
                "owner-a", cid, "Boundary fence", 180000, "2026-08-12", "capital",
                category="fencing")
            assert eid.startswith("cpe-")

            view = await q.combined_expenses("owner-a", cid, None)
            assert view.year == "2026-27"
            assert {r.title: r.scope for r in view.rows} == {
                "Boundary fence": "combined", "Mutation fee": "record"}
            fence = next(r for r in view.rows if r.scope == "combined")
            # The ISO date the browser sends is stored the way every ledger here
            # is read, so the two rows sort against each other.
            assert fence.spent_on == "12/08/2026"
            assert fence.record_id == "" and fence.record_title == ""
            fee = next(r for r in view.rows if r.scope == "record")
            assert fee.record_id == "rec-one" and fee.record_title == "Sy 77"
            # Newest first across BOTH ledgers.
            assert [r.title for r in view.rows] == ["Boundary fence", "Mutation fee"]
            assert view.combined_spend == pytest.approx(180000)
            assert view.member_spend == pytest.approx(2500)
            assert view.spent == pytest.approx(182500)
            assert view.per_acre_running == pytest.approx(2500 / 60)

            # A combined cost cannot be reached through another owner, and
            # cannot be filed against a holding that is not yours.
            assert await m.save_combined_expense(
                "owner-b", cid, "Theirs", 1, "01/01/2026") == ""
            assert await m.delete_combined_expense("owner-b", eid) is False
            assert await m.delete_combined_expense("owner-a", eid) is True
            after = await q.combined_expenses("owner-a", cid, None)
            assert [r.title for r in after.rows] == ["Mutation fee"]
            # Deleting a combined cost left the member's own ledger alone.
            async with pool.connection() as conn:
                n = await (await conn.execute(
                    "SELECT count(*) AS n FROM land_expenses")).fetchone()
                assert n["n"] == 1
    asyncio.run(run())


def test_papers_are_gathered_and_still_name_their_own_survey():
    async def run():
        async with database() as pool:
            m, q = w.WebMutation(), w.WebQuery()
            cid = await m.create_combined_property("owner-a", "Estate", ["rec-one", "rec-two"], "")
            async with pool.connection() as conn:
                await conn.execute(
                    "INSERT INTO documents (id,owner_user_id,record_id,name,shelf,created_at)"
                    " VALUES ('doc-one','owner-a','rec-one','FMB 77','map','2026-01-01')")
                # Filed by the mobile path, which writes parcel_id and no
                # record_id — the combined list must still find it.
                await conn.execute(
                    "INSERT INTO documents (id,owner_user_id,parcel_id,name,shelf,created_at)"
                    " VALUES ('doc-two','owner-a','rec-two','Sale deed 4521','title','2026-01-02')")
                # A paper on a record that is not in this holding, and one that
                # belongs to somebody else entirely.
                await conn.execute(
                    "INSERT INTO documents (id,owner_user_id,record_id,name,created_at)"
                    " VALUES ('doc-far','owner-a','rec-far','EC 91','2026-01-03')")
                await conn.execute(
                    "INSERT INTO documents (id,owner_user_id,record_id,name,created_at)"
                    " VALUES ('doc-theirs','owner-b','rec-theirs','Not yours','2026-01-04')")

            papers = await q.combined_papers("owner-a", cid)
            assert [(p.id, p.record_title) for p in papers] == [
                ("doc-one", "Sy 77"), ("doc-two", "Sy 78")]
            assert await q.combined_papers("owner-b", cid) == []
    asyncio.run(run())


def test_the_combined_map_measures_the_members_and_merges_nothing():
    async def run():
        async with database() as pool:
            m, q = w.WebMutation(), w.WebQuery()
            cid = await m.create_combined_property(
                "owner-a", "Estate", ["rec-one", "rec-two", "rec-far", "rec-flat"], "")
            fmb = await q.combined_fmb("owner-a", cid)

            assert fmb.drawn_count == 3          # the flat has no outline
            assert fmb.surveyed_count == 3
            # Every outline is still its own, in the store's own format.
            drawn = {s.record_id: s for s in fmb.shapes}
            assert len(drawn["rec-one"].ring) == 8      # four corners, flattened
            assert drawn["rec-flat"].ring == []
            assert drawn["rec-flat"].ground == "unplaced"
            assert "Flat 4B" in fmb.missing

            # Each outline carries the measurements the record's own Location
            # screen gives. Without them the combined view was strictly worse
            # than opening the two records one at a time.
            one = drawn["rec-one"]
            assert one.corners == 4
            assert len(one.side_lengths) == 4
            # A 30-acre square is 348.4 m on a side, and the ring is four of them.
            assert all(abs(m - SIDE) < 2 for m in one.side_lengths)
            assert abs(one.perimeter_m - 4 * SIDE) < 6
            assert one.measured_ac == pytest.approx(30.0, abs=0.2)
            # A member with nothing drawn measures nothing, rather than zero
            # dressed up as a figure.
            assert drawn["rec-flat"].corners == 0 and drawn["rec-flat"].side_lengths == []

            # The holding's own total, against the register's figure for the
            # same land. The flat has no outline, so it is in neither — its
            # built-up square feet are not land area and must never be summed
            # into an acreage.
            assert fmb.recorded_ac == pytest.approx(65.0)            # 30 + 30 + 5
            assert fmb.measured_ac == pytest.approx(65.0, abs=0.3)
            assert fmb.comparable is True

            verdicts = {(r.from_record_id, r.to_record_id): r for r in fmb.relations}
            side_by_side = verdicts[("rec-one", "rec-two")]
            assert side_by_side.relation == "adjoining"
            assert "Side by side" in side_by_side.detail
            assert verdicts[("rec-one", "rec-far")].relation == "apart"
            assert "apart" in verdicts[("rec-one", "rec-far")].detail

            # Two pieces of ground: the pair, and the one forty metres away.
            assert fmb.piece_count == 2
            assert "2 separate pieces" in fmb.caption
            # And the caption never claims to be an FMB anybody issued.
            assert "Not a merged or official FMB" in fmb.caption

            assert await q.combined_fmb("owner-b", cid) is None
    asyncio.run(run())


def test_two_outlines_that_do_not_touch_say_so_in_the_caption():
    """The distance belongs in the line that describes the map.

    It used to take a panel of its own — a heading, a row and a capsule — to
    say "About 388 m apart", which is the same thing the caption already implied
    by calling them separate pieces. Two outlines is the case where the caption
    can carry the figure exactly, so it does.
    """
    async def run():
        async with database():
            m, q = w.WebMutation(), w.WebQuery()
            cid = await m.create_combined_property(
                "owner-a", "Two apart", ["rec-one", "rec-far"], "")
            fmb = await q.combined_fmb("owner-a", cid)
            assert fmb.drawn_count == 2
            assert [r.relation for r in fmb.relations] == ["apart"]
            assert "apart" in fmb.caption
            # The figure itself, not just the word — and no "separate pieces",
            # which is the vaguer phrasing this replaces.
            assert f"{fmb.relations[0].gap_m:,.0f} m apart" in fmb.caption
            assert "separate pieces" not in fmb.caption
            assert "Not a merged or official FMB" in fmb.caption
    asyncio.run(run())


def test_a_joint_fmb_is_one_file_linked_to_every_survey_it_covers():
    async def run():
        async with database() as pool:
            m, q = w.WebMutation(), w.WebQuery()
            cid = await m.create_combined_property(
                "owner-a", "Estate", ["rec-one", "rec-two", "rec-far"], "")

            # Refusals write nothing: no file, one survey, a non-member,
            # somebody else's holding.
            assert await m.add_joint_fmb("owner-a", cid, "  ", "FMB 77-78") == ""
            assert await m.add_joint_fmb("owner-a", cid, "node-1", "FMB",
                                         record_ids=["rec-one"]) == ""
            assert await m.add_joint_fmb("owner-a", cid, "node-1", "FMB",
                                         record_ids=["rec-one", "rec-flat"]) == ""
            assert await m.add_joint_fmb("owner-b", cid, "node-1", "FMB") == ""
            async with pool.connection() as conn:
                n = await (await conn.execute(
                    "SELECT count(*) AS n FROM documents")).fetchone()
                assert n["n"] == 0

            jid = await m.add_joint_fmb(
                "owner-a", cid, "node-1", "FMB 77-78", "application/pdf", 2048,
                record_ids=["rec-two", "rec-one"])
            assert jid.startswith("jf-")

            # One file row with links to covered surveys; the uncovered member
            # has no link.
            async with pool.connection() as conn:
                rows = await (await conn.execute(
                    "SELECT * FROM documents ORDER BY record_id")).fetchall()
                links = await (await conn.execute(
                    "SELECT record_id FROM document_record_links ORDER BY record_id")).fetchall()
            assert [r["record_id"] for r in rows] == ["rec-one"]
            assert [r["record_id"] for r in links] == ["rec-one", "rec-two"]
            assert {r["file_ref"] for r in rows} == {"node-1"}
            assert {r["shelf"] for r in rows} == {"map"}
            assert {r["joint_fmb_id"] for r in rows} == {jid}
            assert rows[0]["owner_user_id"] == "owner-a"
            assert rows[0]["subtitle"] == "Joint FMB · covers Sy 77, Sy 78"

            fmb = await q.combined_fmb("owner-a", cid)
            assert len(fmb.joint_sheets) == 1
            sheet = fmb.joint_sheets[0]
            assert sheet.id == jid and sheet.name == "FMB 77-78"
            assert sheet.record_ids == ["rec-one", "rec-two"]     # holding order
            assert sheet.record_titles == ["Sy 77", "Sy 78"]
            assert sheet.paper_ids == [rows[0]["id"], rows[0]["id"]]
            assert sheet.file_ref == "node-1"
            shapes = {s.record_id: s for s in fmb.shapes}
            assert shapes["rec-one"].sheet_title == "FMB 77-78"
            assert shapes["rec-one"].sheet_joint and shapes["rec-two"].sheet_joint
            assert not shapes["rec-far"].sheet_joint and shapes["rec-far"].sheet_id == ""
            assert fmb.sheet_count == 2
            # The drawn outlines are untouched by filing a sheet.
            assert fmb.drawn_count == 3

            # The combined file list shows the physical sheet once.
            papers = await q.combined_papers("owner-a", cid)
            assert [p.id for p in papers] == [rows[0]["id"]]

            # Only the owner can remove it, and removing it takes every copy.
            assert await m.delete_joint_fmb("owner-b", jid) is False
            assert await m.delete_joint_fmb("owner-a", jid) is True
            assert await m.delete_joint_fmb("owner-a", jid) is False
            assert (await q.combined_fmb("owner-a", cid)).joint_sheets == []
            async with pool.connection() as conn:
                n = await (await conn.execute(
                    "SELECT count(*) AS n FROM documents")).fetchone()
                assert n["n"] == 0
            while await a.run_one():
                pass
            async with pool.connection() as conn:
                trail = await (await conn.execute(
                    "SELECT action, resource_id, resource_type FROM audit_events_v2"
                    " WHERE affected_owner='owner-a' AND action='add_joint_fmb'")).fetchall()
            assert [(t["resource_id"], t["resource_type"]) for t in trail] == [
                (cid, "combined_property")]
    asyncio.run(run())


def test_a_file_can_link_to_a_combined_view_and_a_member_independently():
    async def run():
        async with database() as pool:
            m, q = w.WebMutation(), w.WebQuery()
            cid = await m.create_combined_property(
                "owner-a", "Estate", ["rec-one", "rec-two"], "")
            did = await m.add_paper("owner-a", "", "node-1", "Drone survey",
                                    shelf="map", mime_type="application/pdf")
            assert await m.link_papers("owner-b", [did], [cid]) is False
            assert await m.link_papers("owner-a", [did], [cid]) is True
            vault = await q.vault_papers("owner-a", "all")
            assert [(p.id, p.title, p.kind) for p in vault[0].linked_properties] == [
                (cid, "Estate", "combined")]
            assert [(p.id, p.record_id, p.record_title)
                    for p in await q.combined_papers("owner-a", cid)] == [
                (did, cid, "Estate")]
            assert (await q.combined_property("owner-a", cid)).paper_count == 1

            # Linking a member adds another location without making a copy.
            assert await m.link_papers("owner-a", [did], ["rec-one"]) is True
            assert (await q.combined_property("owner-a", cid)).paper_count == 1
            assert {p.id for p in (await q.vault_papers("owner-a", "all"))[0].linked_properties} == {
                cid, "rec-one"}

            assert await m.delete_paper("owner-a", did, cid) is True
            assert {p.id for p in (await q.vault_papers("owner-a", "all"))[0].linked_properties} == {
                "rec-one"}
            group_only = await m.add_paper("owner-a", "", "node-2", "Overview",
                                           shelf="map", mime_type="application/pdf")
            assert await m.link_papers("owner-a", [group_only], [cid]) is True
            assert await m.delete_combined_property("owner-a", cid) is True
            remaining = {p.id: p for p in await q.vault_papers("owner-a", "all")}
            assert set(remaining) == {did, group_only}
            assert remaining[group_only].linked_properties == []
    asyncio.run(run())


def test_every_change_to_a_holding_is_on_the_trail():
    async def run():
        async with database() as pool:
            m = w.WebMutation()
            cid = await m.create_combined_property("owner-a", "Estate", ["rec-one", "rec-two"], "")
            assert await m.update_combined_property("owner-a", cid, "Kondapur Estate")
            assert await m.set_combined_members("owner-a", cid, ["rec-one", "rec-far"])
            assert await m.delete_combined_property("owner-a", cid)
            while await a.run_one():
                pass
            async with pool.connection() as conn:
                rows = await (await conn.execute(
                    "SELECT action, resource_id, resource_type, metadata"
                    " FROM audit_events_v2 WHERE affected_owner='owner-a'"
                    " ORDER BY occurred_at, event_id")).fetchall()
            assert [r["action"] for r in rows] == [
                "create_combined_property", "update_combined_property",
                "set_combined_members", "delete_combined_property"]
            # Filed against the holding, typed as one, and naming it in the
            # owner's own words — never listing which records were in it.
            assert {r["resource_id"] for r in rows} == {cid}
            assert {r["resource_type"] for r in rows} == {"combined_property"}
            assert rows[1]["metadata"].get("label") == "Kondapur Estate"
    asyncio.run(run())
