"""Holder (WHO) and holding (WHICH), decision memo 06/10/2026.

Against the throwaway-schema PostgreSQL of test_combined_property: owner-a has
four parcels on khata pb-a (rec-one, rec-two, rec-far, rec-managed) and a flat
(rec-flat). Groups, members and users are added here.
"""
import asyncio
import types

import pytest

from src import main, web360 as w
from tests.test_combined_property import database
from tests.test_title_provenance import SWEPT, _ddl_for

EXTRA = [
    """CREATE TABLE groups (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL DEFAULT 'family', name TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT '')""",
    """CREATE TABLE family_members (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL DEFAULT '', group_id TEXT NOT NULL DEFAULT '',
        is_self BOOLEAN NOT NULL DEFAULT false)""",
    "CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '')",
    """CREATE TABLE platform_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '',
        updated_by TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '')""",
    "INSERT INTO users (id, name) VALUES ('owner-a', 'Ravi Telukutla')",
    "INSERT INTO groups (id, owner_user_id, type, name, created_at) VALUES"
    " ('g-fam', 'owner-a', 'family', 'Telukutla Family', '2026-01-01'),"
    " ('g-gpa', 'owner-a', 'family', 'Grandfather''s estate', '2026-01-02'),"
    " ('g-other', 'owner-b', 'family', 'Not yours', '2026-01-03')",
    "INSERT INTO family_members (id, owner_user_id, name, group_id, is_self) VALUES"
    " ('fm-self', 'owner-a', 'owner-a', 'g-fam', true),"
    " ('fm-1', 'owner-a', 't. saraswathi', 'g-fam', false)",
    "UPDATE passbooks SET group_id='g-fam' WHERE id='pb-a'",
    "ALTER TABLE passbooks ADD COLUMN IF NOT EXISTS created_at TEXT DEFAULT ''",
    "ALTER TABLE family_members ADD COLUMN IF NOT EXISTS parcel_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE family_members ADD COLUMN IF NOT EXISTS share_pct REAL NOT NULL DEFAULT 0",
]


#: What the Properties list and delete_records read beyond the holding fixture.
WIDER = [
    *[f"ALTER TABLE {t} ADD COLUMN IF NOT EXISTS {c}"
      for t in ("parcel_photos", "property_photos")
      for c in ("file_ref TEXT DEFAULT ''", "is_cover BOOLEAN DEFAULT false",
                "sort INTEGER DEFAULT 0", "created_at TEXT DEFAULT ''",
                "captured_at TEXT DEFAULT ''", "captured_by TEXT DEFAULT ''")],
    "CREATE TABLE registered_documents (id TEXT PRIMARY KEY,owner_user_id TEXT,"
    "parcel_id TEXT DEFAULT '',property_id TEXT DEFAULT '')",
    *[stmt.replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ") for stmt in SWEPT],
    *_ddl_for("record_owners", "record_transfers", "record_transfer_parties"),
    # The master record's claims and columns (saveRecord writes through them).
    *w.rm.DDL,
    *[f"ALTER TABLE notes ADD COLUMN IF NOT EXISTS {c}"
      for c in ("owner_user_id TEXT DEFAULT ''", "body TEXT DEFAULT ''",
                "author TEXT DEFAULT ''", "created_at TEXT DEFAULT ''")],
    *[f"ALTER TABLE {t} ADD COLUMN IF NOT EXISTS {c}" for t in ("parcels", "properties")
      for c in ("purchase_date TEXT DEFAULT ''", "reg_date TEXT DEFAULT ''")],
    "ALTER TABLE purchase_lots ADD COLUMN IF NOT EXISTS bought_on TEXT DEFAULT ''",
    "ALTER TABLE purchase_lots ADD COLUMN IF NOT EXISTS sort INTEGER DEFAULT 0",
    "ALTER TABLE purchase_lots ADD COLUMN IF NOT EXISTS owner_user_id TEXT DEFAULT ''",
    "ALTER TABLE purchase_lots ADD COLUMN IF NOT EXISTS paid DOUBLE PRECISION DEFAULT 0",
    # The register's facts (web360 `_register_facts`): who looks after each
    # record and the pattadar's parentage.
    *[f"ALTER TABLE record_people ADD COLUMN IF NOT EXISTS {c}"
      for c in ("owner_user_id TEXT DEFAULT ''", "person_name TEXT DEFAULT ''",
                "role TEXT DEFAULT ''", "sort INTEGER DEFAULT 0", "created_at TEXT DEFAULT ''")],
    "ALTER TABLE passbooks ADD COLUMN IF NOT EXISTS father_husband_name TEXT DEFAULT ''",
]


async def _setup(pool):
    async with pool.connection() as conn:
        for stmt in EXTRA + WIDER:
            await conn.execute(stmt)


def run(coro_fn):
    async def go():
        async with database() as pool:
            await _setup(pool)
            await coro_fn(pool)
    asyncio.run(go())


def test_cards_carry_holder_and_holding_and_filter_by_holding():
    async def body(pool):
        m, q = w.WebMutation(), w.WebQuery()
        cid = await m.create_combined_property("owner-a", "Thota farm", ["rec-one", "rec-two"], "")
        page = await q.properties("owner-a")
        by = {c.id: c for c in page.cards}
        assert by["rec-one"].group_id == "g-fam"
        assert by["rec-one"].group_name == "Telukutla Family"
        assert by["rec-one"].holder_label == "Telukutla Family"
        assert (by["rec-one"].holding_id, by["rec-one"].holding_name) == (cid, "Thota farm")
        assert by["rec-flat"].group_name == "" and by["rec-flat"].holder_label == "In your own name"
        assert by["rec-flat"].holding_id == ""

        facets = {f.key: f for f in page.facets}
        assert facets["group"].label == "Holder"
        assert facets["holding"].label == "Holding"
        assert [(o.key, o.label, o.count) for o in facets["holding"].options] == [
            (cid, "Thota farm", 2), (w.NOT_IN_HOLDING, "Not in a holding", 3)]

        only = await q.properties("owner-a", holdings=[cid])
        assert sorted(c.id for c in only.cards) == ["rec-one", "rec-two"]
        assert only.active_count == 1 and "Thota farm" in only.filter_summary
        loose = await q.properties("owner-a", holdings=[w.NOT_IN_HOLDING])
        assert sorted(c.id for c in loose.cards) == ["rec-far", "rec-flat", "rec-managed"]

        detail = await q.record("owner-a", "rec-one")
        assert (detail.group_id, detail.holder_label) == ("g-fam", "Telukutla Family")
    run(body)


def test_cards_carry_the_registers_facts_from_this_account_only():
    async def body(pool):
        async with pool.connection() as conn:
            await conn.execute("UPDATE passbooks SET father_husband_name='T. Venkaiah' WHERE id='pb-a'")
            await conn.execute(
                "INSERT INTO record_people (id, owner_user_id, record_id, person_name, role, sort)"
                " VALUES ('rp-1','owner-a','rec-one','K. Ramaiah','Caretaker',1),"
                " ('rp-2','owner-a','rec-one','S. Rao','Agent',2),"
                " ('rp-x','owner-b','rec-one','Not yours','Agent',0)")
            # The pattadar on the Owners list is not an "other" owner.
            await conn.execute(
                "INSERT INTO record_owners (id, owner_user_id, record_id, name, is_current) VALUES"
                " ('ro-1','owner-a','rec-one','t.  saraswathi',true),"
                " ('ro-2','owner-a','rec-one','T. Mallika',true),"
                " ('ro-3','owner-a','rec-one','Sold to someone',false)")
            # Two registrations on the Money tab: what was paid is their sum.
            await conn.execute(
                "INSERT INTO purchase_lots (id, owner_user_id, record_id, paid, bought_on, sort) VALUES"
                " ('pl-1','owner-a','rec-one',500000,'2019-03-01',1),"
                " ('pl-2','owner-a','rec-one',700000,'2020-04-01',2)")
        await w.WebMutation().save_record("owner-a", w.RecordInput(id="rec-one", sro="Markapur"))

        by = {c.id: c for c in (await w.WebQuery().properties("owner-a")).cards}
        one, far, flat = by["rec-one"], by["rec-far"], by["rec-flat"]
        assert (one.manager_line, one.manager_count) == ("K. Ramaiah · Caretaker", 2)
        assert one.co_owner_count == 1
        assert one.parentage == "T. Venkaiah" and flat.parentage == ""
        assert one.purchase_price == 1200000 and one.created_at
        assert (one.last_activity_by, one.last_activity_action) == ("You", "record.corrected")
        assert one.last_activity_at
        # A parcel with nothing of its own on the trail still shows its khata's
        # newest change, and nothing at all is '' rather than a guess.
        assert far.manager_line == "" and far.co_owner_count == 0
        assert flat.last_activity_at == "" and flat.last_activity_by == ""
    run(body)


def test_holding_facet_is_empty_until_a_holding_exists():
    async def body(pool):
        page = await w.WebQuery().properties("owner-a")
        assert {f.key: f for f in page.facets}["holding"].options == []
    run(body)


def test_holding_says_who_holds_its_properties():
    async def body(pool):
        m, q = w.WebMutation(), w.WebQuery()
        async with pool.connection() as conn:
            await conn.execute("UPDATE properties SET group_id='g-gpa', stake='owned' WHERE id='rec-flat'")
        cid = await m.create_combined_property(
            "owner-a", "Mangalakunta farm", ["rec-one", "rec-two", "rec-flat"], "")
        view = await q.combined_property("owner-a", cid)
        assert [(h.group_id, h.name, h.count) for h in view.held_by] == [
            ("g-fam", "Telukutla Family", 2), ("g-gpa", "Grandfather's estate", 1)]
        assert {mem.record_id: mem.holder_label for mem in view.members} == {
            "rec-one": "Telukutla Family", "rec-two": "Telukutla Family",
            "rec-flat": "Grandfather's estate"}
    run(body)


def test_setting_a_parcels_holder_moves_its_whole_khata():
    async def body(pool):
        m, q = w.WebMutation(), w.WebQuery()
        preview = await q.holder_change("owner-a", ["rec-one"], "g-gpa")
        assert preview.holder_label == "Grandfather's estate"
        assert [(r.id, r.requested) for r in preview.records][0] == ("rec-one", True)
        assert sorted(r.id for r in preview.records if not r.requested) == [
            "rec-far", "rec-managed", "rec-two"]
        assert preview.sibling_count == 3
        async with pool.connection() as conn:          # the preview wrote nothing
            pb = await (await conn.execute("SELECT group_id FROM passbooks WHERE id='pb-a'")).fetchone()
            assert pb["group_id"] == "g-fam"

        done = await m.set_record_holder("owner-a", ["rec-one", "rec-flat"], "g-gpa")
        assert done.sibling_count == 3
        assert {r.id: r.from_holder_label for r in done.records}["rec-flat"] == "In your own name"
        assert {r.id: r.from_group_id for r in done.records}["rec-one"] == "g-fam"
        async with pool.connection() as conn:
            pb = await (await conn.execute("SELECT group_id FROM passbooks WHERE id='pb-a'")).fetchone()
            pr = await (await conn.execute("SELECT group_id FROM properties WHERE id='rec-flat'")).fetchone()
            assert (pb["group_id"], pr["group_id"]) == ("g-gpa", "g-gpa")
            trail = await (await conn.execute(
                "SELECT action, target FROM audit_events ORDER BY timestamp")).fetchall()
            assert ("assign_land_to_group", "pb-a") in {(t["action"], t["target"]) for t in trail}

        back = await m.set_record_holder("owner-a", ["rec-flat"], "")
        assert back.holder_label == "In your own name" and back.group_id == ""
        with pytest.raises(ValueError, match="no longer in your account"):
            await m.set_record_holder("owner-a", ["rec-flat"], "g-other")
        with pytest.raises(ValueError, match="no longer in your account"):
            await m.set_record_holder("owner-a", ["rec-theirs"], "")
        with pytest.raises(ValueError, match="at least one"):
            await m.set_record_holder("owner-a", [], "")
    run(body)


def test_a_holding_goes_with_its_last_property():
    async def body(pool):
        m, q = w.WebMutation(), w.WebQuery()
        cid = await m.create_combined_property("owner-a", "Estate", ["rec-one", "rec-two"], "")
        assert await m.save_combined_expense("owner-a", cid, "Well", 9000, "01/07/2026", "capital")
        # One left: still there, and incomplete.
        assert await m.delete_records("owner-a", ["rec-two"]) == 1
        assert (await q.combined_property("owner-a", cid)).is_complete is False
        # The last one: the holding and its own costs go; nothing else does.
        assert await m.delete_records("owner-a", ["rec-one"]) == 1
        assert await q.combined_property("owner-a", cid) is None
        async with pool.connection() as conn:
            for table in ("combined_properties", "combined_property_expenses"):
                n = await (await conn.execute(f"SELECT count(*) AS n FROM {table}")).fetchone()
                assert n["n"] == 0, table
            n = await (await conn.execute("SELECT count(*) AS n FROM parcels")).fetchone()
            assert n["n"] == 3          # rec-far, rec-managed, rec-theirs
    run(body)


def test_a_delete_says_which_holdings_it_empties_and_sweeps_only_those():
    async def body(pool):
        m, q = w.WebMutation(), w.WebQuery()
        cid = await m.create_combined_property("owner-a", "Estate", ["rec-one", "rec-two"], "")
        assert await m.save_combined_expense("owner-a", cid, "Well", 9000, "01/07/2026", "capital")
        assert await m.save_combined_expense("owner-a", cid, "Fence", 1000, "02/07/2026", "capital")
        stray = await m.create_combined_property("owner-a", "Stray", ["rec-far", "rec-flat"], "")
        async with pool.connection() as conn:
            # Emptied some other way, before this delete: not this delete's to take.
            await conn.execute(
                "DELETE FROM combined_property_members WHERE combined_property_id=%s", (stray,))
        # One of two leaves the holding standing: nothing to warn about.
        assert await q.delete_impact("owner-a", ["rec-one"]) == []
        both = await q.delete_impact("owner-a", ["rec-one", "rec-two"])
        assert [(h.id, h.name, h.expense_total, h.expense_count) for h in both] == [
            (cid, "Estate", 10000.0, 2)]
        assert await m.delete_records("owner-a", ["rec-two"]) == 1
        last = await q.delete_impact("owner-a", ["rec-one"])
        assert [(h.name, h.expense_total) for h in last] == [("Estate", 10000.0)]
        assert await m.delete_records("owner-a", ["rec-one"]) == 1
        async with pool.connection() as conn:
            left = await (await conn.execute("SELECT id FROM combined_properties")).fetchall()
            assert [r["id"] for r in left] == [stray]
    run(body)


def test_a_khata_is_its_number_in_its_village_not_one_passbook_row():
    async def body(pool):
        m, q = w.WebMutation(), w.WebQuery()
        async with pool.connection() as conn:
            # Two more rows for khata 30877 in Katragunta (a cloned save, a
            # second scan) — one with a parcel, one with none — and a khata
            # with the same number in another village.
            await conn.execute(
                "INSERT INTO passbooks (id,owner_user_id,pattadar_no,village,group_id) VALUES"
                " ('pb-a2','owner-a','30877',' katragunta ','g-fam'),"
                " ('pb-a3','owner-a','30877','Katragunta','g-fam'),"
                " ('pb-x','owner-a','30877','Elsewhere','g-fam')")
            await conn.execute(
                "INSERT INTO parcels (id,passbook_id,survey_no,extent,created_at) VALUES"
                " ('rec-five','pb-a2','79',4,'2026-01-08T00:00:00'),"
                " ('rec-else','pb-x','12',1,'2026-01-09T00:00:00')")
            khatas = await main._group_khatas(conn, "owner-a", "g-fam")
            # One entry for 30877/Katragunta (three rows), one for Elsewhere.
            assert sorted((k.village.strip(), k.parcel_count) for k in khatas) == [
                ("Elsewhere", 1), ("Katragunta", 5)]
        preview = await q.holder_change("owner-a", ["rec-one"], "g-gpa")
        assert "rec-five" in {r.id for r in preview.records if not r.requested}
        assert "rec-else" not in {r.id for r in preview.records}
        await m.set_record_holder("owner-a", ["rec-one"], "g-gpa")
        async with pool.connection() as conn:
            rows = await (await conn.execute(
                "SELECT id, group_id FROM passbooks WHERE owner_user_id='owner-a' ORDER BY id")).fetchall()
            assert {r["id"]: r["group_id"] for r in rows} == {
                "pb-a": "g-gpa", "pb-a2": "g-gpa", "pb-a3": "g-gpa", "pb-x": "g-fam"}
    run(body)


def test_moving_a_khata_names_the_member_shares_it_leaves_behind():
    async def body(pool):
        m, q = w.WebMutation(), w.WebQuery()
        async with pool.connection() as conn:
            await conn.execute(
                "UPDATE family_members SET parcel_id='rec-two', share_pct=25 WHERE id='fm-1'")
        preview = await q.holder_change("owner-a", ["rec-one"], "g-gpa")
        assert [(s.member_id, s.member_name, s.group_id, s.group_name, s.record_id,
                 s.record_title, s.share_pct) for s in preview.member_shares] == [
            ("fm-1", "t. saraswathi", "g-fam", "Telukutla Family", "rec-two", "Sy 78", 25.0)]
        # Staying with the same group leaves every share where it was.
        assert (await q.holder_change("owner-a", ["rec-one"], "g-fam")).member_shares == []
        done = await m.set_record_holder("owner-a", ["rec-one"], "")
        assert [s.member_id for s in done.member_shares] == ["fm-1"]
    run(body)


def test_one_time_cleanups_are_marker_guarded():
    async def body(pool):
        m = w.WebMutation()
        cid = await m.create_combined_property("owner-a", "Empty", ["rec-one", "rec-two"], "")
        keep = await m.create_combined_property("owner-a", "Kept", ["rec-far", "rec-flat"], "")
        async with pool.connection() as conn:
            # Emptied by a raw delete, the way rows were left before this change.
            await conn.execute("DELETE FROM combined_property_members WHERE combined_property_id=%s", (cid,))
            assert await main._drop_empty_holdings_once(conn) == "deleted:1"
            assert await main._drop_empty_holdings_once(conn) == "already"
            left = await (await conn.execute("SELECT id FROM combined_properties")).fetchall()
            assert [r["id"] for r in left] == [keep]

            # Portfolio groups: a busy one aborts everything and leaves no marker.
            await conn.execute(
                "INSERT INTO groups (id, owner_user_id, type, name) VALUES"
                " ('g-wallet', 'owner-a', 'portfolio', 'Wallet'),"
                " ('g-busy', 'owner-a', 'portfolio', 'Busy')")
            await conn.execute(
                "INSERT INTO family_members (id, owner_user_id, name, group_id, is_self) VALUES"
                " ('fm-w', 'owner-a', 'owner-a', 'g-wallet', true),"
                " ('fm-b', 'owner-a', 'Sita', 'g-busy', false)")
            assert await main._retire_portfolio_groups(conn) == "aborted"
            assert not await main._marked(conn, main.PORTFOLIO_RETIRE_MARKER)
            n = await (await conn.execute(
                "SELECT count(*) AS n FROM groups WHERE type='portfolio'")).fetchone()
            assert n["n"] == 2
            # Emptied, it runs once: groups and their own self rows go.
            await conn.execute("DELETE FROM family_members WHERE id='fm-b'")
            assert await main._retire_portfolio_groups(conn) == "deleted:2"
            assert await main._retire_portfolio_groups(conn) == "already"
            n = await (await conn.execute(
                "SELECT count(*) AS n FROM family_members WHERE group_id IN ('g-wallet','g-busy')")).fetchone()
            assert n["n"] == 0
    run(body)


def test_group_lists_its_khatas_and_flags_a_pattadar_who_is_not_a_member():
    async def body(pool):
        m = w.WebMutation()
        cid = await m.create_combined_property("owner-a", "Thota farm", ["rec-one", "rec-two"], "")
        async with pool.connection() as conn:
            await conn.execute("UPDATE properties SET group_id='g-fam', owner_name='K. Rao' WHERE id='rec-flat'")
            khatas = await main._group_khatas(conn, "owner-a", "g-fam")
            built = await main._group_built(conn, "owner-a", "g-fam")
            assert len(khatas) == 1
            k = khatas[0]
            assert (k.khata_no, k.pattadar_name, k.village, k.parcel_count) == (
                "30877", "T. Saraswathi", "Katragunta", 4)
            assert k.extent == pytest.approx(67.0)
            # "T. Saraswathi" matches member "t. saraswathi" exactly, ignoring case.
            assert k.pattadar_not_member is False
            assert [(h.id, h.name) for h in k.holdings] == [(cid, "Thota farm")]
            assert {p.title: p.holding_id for p in k.parcels}["Sy 77"] == cid
            assert [(b.title, b.pattadar_name, b.pattadar_not_member) for b in built] == [
                ("Flat 4B", "K. Rao", True)]
            # A near-miss is still a miss: no guessing.
            await conn.execute("UPDATE passbooks SET owner_name='T Saraswathi' WHERE id='pb-a'")
            assert (await main._group_khatas(conn, "owner-a", "g-fam"))[0].pattadar_not_member
            # Another group of the same owner holds none of it.
            assert await main._group_khatas(conn, "owner-a", "g-gpa") == []
    run(body)


def test_unknown_and_retired_group_types_are_refused():
    info = types.SimpleNamespace(
        context={"request": types.SimpleNamespace(headers={"x-user-id": "owner-a"})})
    assert "portfolio" not in main.GROUP_TYPES
    for bad in ("portfolio", "wallet", ""):
        with pytest.raises(ValueError, match="Choose what kind of group"):
            asyncio.run(main.Mutation().create_group(info, type=bad, name="X"))


def test_group_index_counts_what_the_group_page_counts():
    """Families & groups' card and the group page it opens print one number.

    The page reads `properties(groups:[id])`; the index reads `_group_holdings`.
    An archived parcel and a flat are the two cases that used to split them.
    """
    async def body(pool):
        async with pool.connection() as conn:
            await conn.execute("UPDATE parcels SET archived=true WHERE id='rec-far'")
            await conn.execute("UPDATE properties SET group_id='g-fam' WHERE id='rec-flat'")
        page = await w.WebQuery().properties("owner-a", groups=["g-fam"])
        to_acres = {"ac": 1.0, "sq.yd": 1 / 4840, "sq.ft": 1 / 43560}
        acres = sum(c.extent * to_acres[c.extent_unit] for c in page.cards)
        async with pool.connection() as conn:
            parcels, props, ext = await main._group_holdings(conn, "owner-a", "g-fam")
        assert "rec-far" not in {c.id for c in page.cards}
        assert parcels + props == len(page.cards)
        assert props == 1
        assert ext == pytest.approx(acres)
    run(body)
