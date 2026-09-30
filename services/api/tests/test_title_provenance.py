"""The title-provenance graph: transfers, per-party extent and share, and the
rules that keep somebody else's chain out of yours.

A chain of title is the highest-consequence thing this application stores: it is
the answer to "who owns this land, and how did they come to". These tests are
about the claims the contract is allowed to make, not about its plumbing —

  · a split (one seller, two buyers) and a merge (two sellers, one buyer) must
    both be expressible, because both happen on real deeds;
  · an extent belongs to the party who RECEIVED it, never to the giver;
  · a share the paper did not state must not appear as one;
  · nothing may be read, linked or edited across account boundaries;
  · a chain may not be made to loop, because a looping chain has no root and
    every reader of it walks forever.

Set TEST_PG_DSN to the CI database. Every connection's search_path is limited to
a throwaway schema, so no application table is read or written.
"""
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
from src import audit as a, web360 as w  # noqa: E402


# Only what the transfer surface touches: the two new tables, the owners it
# links to, and the records/passbooks _record_kind checks ownership against.
BASE = [
    "CREATE TABLE passbooks (id TEXT PRIMARY KEY,owner_user_id TEXT,group_id TEXT DEFAULT '')",
    "CREATE TABLE parcels (id TEXT PRIMARY KEY,passbook_id TEXT,survey_no TEXT,"
    "subdivision TEXT DEFAULT '')",
    "CREATE TABLE properties (id TEXT PRIMARY KEY,owner_user_id TEXT,label TEXT DEFAULT '',"
    "group_id TEXT DEFAULT '')",
    "CREATE TABLE registered_documents (id TEXT PRIMARY KEY,owner_user_id TEXT,"
    "parcel_id TEXT DEFAULT '',property_id TEXT DEFAULT '')",
    "CREATE TABLE documents (id TEXT PRIMARY KEY,owner_user_id TEXT,record_id TEXT DEFAULT '',"
    "parcel_id TEXT DEFAULT '',property_id TEXT DEFAULT '',reading_id TEXT DEFAULT '')",
]

# The rest of what delete_records sweeps. Present so the record-deletion test
# drives the real mutation rather than a stand-in for it; each is only as wide
# as that sweep needs.
SWEPT = [
    "CREATE TABLE document_record_links (id TEXT PRIMARY KEY,owner_user_id TEXT,"
    "document_id TEXT,record_id TEXT,created_at TEXT DEFAULT '')",
    "CREATE TABLE share_links (id TEXT PRIMARY KEY,document_id TEXT)",
    "CREATE TABLE document_versions (id TEXT PRIMARY KEY,document_id TEXT)",
    "CREATE TABLE record_tags (id TEXT PRIMARY KEY,entity_id TEXT)",
    "CREATE TABLE parcel_photos (id TEXT PRIMARY KEY,parcel_id TEXT)",
    "CREATE TABLE property_photos (id TEXT PRIMARY KEY,property_id TEXT)",
    "CREATE TABLE work_requests (id TEXT PRIMARY KEY,owner_user_id TEXT,entity_id TEXT,"
    "closed BOOLEAN DEFAULT false)",
    "CREATE TABLE ticket_deliverables (id TEXT PRIMARY KEY,ticket_id TEXT)",
    "CREATE TABLE ticket_dispatches (id TEXT PRIMARY KEY,ticket_id TEXT)",
    "CREATE TABLE service_payments (id TEXT PRIMARY KEY,owner_user_id TEXT,ticket_id TEXT,"
    "note TEXT DEFAULT '')",
    "CREATE TABLE service_batches (id TEXT PRIMARY KEY,owner_user_id TEXT,record_id TEXT)",
    "CREATE TABLE boundary_marks (id TEXT PRIMARY KEY,record_id TEXT)",
    "CREATE TABLE record_people (id TEXT PRIMARY KEY,record_id TEXT)",
    "CREATE TABLE people_payments (id TEXT PRIMARY KEY,record_id TEXT)",
    "CREATE TABLE purchase_lots (id TEXT PRIMARY KEY,record_id TEXT)",
    "CREATE TABLE capital_costs (id TEXT PRIMARY KEY,record_id TEXT)",
    "CREATE TABLE waiting_items (id TEXT PRIMARY KEY,record_id TEXT)",
    "CREATE TABLE land_features (id TEXT PRIMARY KEY,entity_id TEXT)",
    "CREATE TABLE land_expenses (id TEXT PRIMARY KEY,entity_id TEXT)",
    "CREATE TABLE notes (id TEXT PRIMARY KEY,entity_id TEXT)",
]


def _ddl_for(*tables: str) -> list[str]:
    """The real DDL for the named tables, straight out of web360 — so these
    tests run against the shipped schema rather than a hand-copied guess of it."""
    want = []
    for stmt in w._DDL:
        text = stmt if isinstance(stmt, str) else str(stmt)
        # CREATE TABLE, its indexes, and the ALTER statements that add columns
        # later — a table assembled from only its CREATE is not the shipped one.
        if any(f"EXISTS {t} (" in text or f"ON {t} (" in text
               or f"ALTER TABLE {t} " in text for t in tables):
            want.append(text)
    return want


@asynccontextmanager
async def database():
    dsn = os.getenv(
        "TEST_PG_DSN",
        "host=localhost port=5432 dbname=postgres user=rhub password=rhub-dev-pwd")
    name = "test_prov_" + secrets.token_hex(8)
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
            for stmt in (BASE + SWEPT + list(a.DDL)
                         + _ddl_for("record_owners", "record_transfers",
                                    "record_transfer_parties")):
                await conn.execute(stmt)
            # One parcel owned by owner-a, one property owned by somebody else.
            await conn.execute(
                "INSERT INTO passbooks (id,owner_user_id) VALUES ('pb-a','owner-a')")
            await conn.execute(
                "INSERT INTO parcels (id,passbook_id,survey_no) VALUES ('rec-a','pb-a','77')")
            await conn.execute(
                "INSERT INTO properties (id,owner_user_id,label)"
                " VALUES ('rec-x','owner-b','Not yours')")
        yield pool
    finally:
        w.bind(old_pool, old_uid)
        await pool.close()
        await admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(name)))
        await admin.close()


def _run(body):
    """Each test is one coroutine against one throwaway schema."""
    import asyncio

    async def wrapper():
        async with database() as pool:
            await body(w.WebMutation(), w.WebQuery(), pool)

    asyncio.run(wrapper())


# ── What the graph must be able to say ────────────────────────────────

def test_one_seller_to_two_buyers_is_one_event_with_two_measured_targets():
    """A split. The deed is ONE event; the two buyers are two targets of it,
    each with the area they actually received. Filing this as two transfers
    would claim the land changed hands twice."""
    async def body(m, q, _pool):
        tid = await m.add_transfer("owner-a", record_id="rec-a", kind="sale",
                                   deed_no="2056/2010", sro="Narasaraopet")
        assert tid
        await m.set_transfer_party("owner-a", transfer_id=tid, side="from", name="Nagaiah")
        await m.set_transfer_party("owner-a", transfer_id=tid, side="to", name="Buyer One",
                                   extent=2.5, extent_unit="ac")
        await m.set_transfer_party("owner-a", transfer_id=tid, side="to", name="Buyer Two",
                                   extent=1.5, extent_unit="ac")

        view = await q.transfers("owner-a", record_id="rec-a")
        assert view.count == 1
        t = view.transfers[0]
        assert [p.name for p in t.from_parties] == ["Nagaiah"]
        assert {p.name: p.extent for p in t.to_parties} == {"Buyer One": 2.5, "Buyer Two": 1.5}
        # The label the graph draws on each edge.
        assert {p.extent_label() for p in t.to_parties} == {"2.50 ac", "1.50 ac"}
    _run(body)


def test_two_sellers_to_one_buyer_is_one_event_with_two_sources():
    """A merge — two co-owners conveying together. The buyer received the whole
    thing once, not once per seller."""
    async def body(m, q, _pool):
        tid = await m.add_transfer("owner-a", record_id="rec-a", kind="sale")
        await m.set_transfer_party("owner-a", transfer_id=tid, side="from", name="Brother One")
        await m.set_transfer_party("owner-a", transfer_id=tid, side="from", name="Brother Two")
        await m.set_transfer_party("owner-a", transfer_id=tid, side="to", name="Single Buyer",
                                   extent=4.0, extent_unit="ac")

        t = (await q.transfers("owner-a", record_id="rec-a")).transfers[0]
        assert len(t.from_parties) == 2
        assert len(t.to_parties) == 1
        assert t.to_parties[0].extent == 4.0
    _run(body)


def test_an_extent_is_never_carried_by_the_giving_side():
    """Extent answers "how much did this person GET". Accepting it on the giving
    side would let one event state two different areas and leave no way to say
    which is the land that moved."""
    async def body(m, q, _pool):
        tid = await m.add_transfer("owner-a", record_id="rec-a")
        await m.set_transfer_party("owner-a", transfer_id=tid, side="from", name="Giver",
                                   extent=99.0, extent_unit="ac", share_num=1, share_den=2)
        t = (await q.transfers("owner-a", record_id="rec-a")).transfers[0]
        assert t.from_parties[0].extent == 0
        assert t.from_parties[0].extent_unit == ""
        assert t.from_parties[0].share_label() == ""
    _run(body)


def test_a_share_the_paper_did_not_state_is_not_invented():
    """A half-written fraction is no fraction. 1/0 and 0/2 are both "unstated",
    not "one half" — and an unmeasured extent renders as nothing rather than 0,
    because an unknown area is not an area of zero."""
    async def body(m, q, _pool):
        tid = await m.add_transfer("owner-a", record_id="rec-a")
        await m.set_transfer_party("owner-a", transfer_id=tid, side="to", name="Half",
                                   share_num=1, share_den=2)
        await m.set_transfer_party("owner-a", transfer_id=tid, side="to", name="Broken",
                                   share_num=1, share_den=0)
        t = (await q.transfers("owner-a", record_id="rec-a")).transfers[0]
        labels = {p.name: (p.share_label(), p.extent_label()) for p in t.to_parties}
        assert labels["Half"] == ("1/2", "")
        assert labels["Broken"] == ("", "")
    _run(body)


def test_a_party_pointing_at_nobody_is_refused():
    """An endpoint with neither a name nor a link to an owner is a line on the
    graph attached to nothing."""
    async def body(m, _q, _pool):
        tid = await m.add_transfer("owner-a", record_id="rec-a")
        assert await m.set_transfer_party("owner-a", transfer_id=tid, side="to") == ""
    _run(body)


def test_a_linked_owner_labels_the_node_even_when_only_the_id_was_sent():
    """The graph must be able to draw a name. Linking by id is how one person
    stays one node across five deeds, so the name is fetched rather than
    demanded twice."""
    async def body(m, q, _pool):
        oid = await m.add_owner("owner-a", record_id="rec-a", name="Sankara Reddy")
        tid = await m.add_transfer("owner-a", record_id="rec-a")
        await m.set_transfer_party("owner-a", transfer_id=tid, side="to", owner_id=oid)
        t = (await q.transfers("owner-a", record_id="rec-a")).transfers[0]
        assert t.to_parties[0].name == "Sankara Reddy"
        assert t.to_parties[0].owner_id == oid
    _run(body)


# ── Whose chain it is ─────────────────────────────────────────────────

def test_a_transfer_cannot_be_filed_against_somebody_elses_record():
    async def body(m, _q, _pool):
        assert await m.add_transfer("owner-a", record_id="rec-x") == ""
    _run(body)


def test_another_account_cannot_read_edit_or_delete_the_chain():
    """The whole surface is owner-scoped: the read answers empty, and every
    write refuses, for a caller who does not hold the record."""
    async def body(m, q, _pool):
        tid = await m.add_transfer("owner-a", record_id="rec-a", deed_no="2056/2010")
        await m.set_transfer_party("owner-a", transfer_id=tid, side="to", name="Buyer")

        assert (await q.transfers("owner-b", record_id="rec-a")).count == 0
        assert await m.set_transfer_party("owner-b", transfer_id=tid, side="to",
                                          name="Intruder") == ""
        assert await m.update_transfer("owner-b", transfer_id=tid, deed_no="forged") is False
        assert await m.delete_transfer("owner-b", transfer_id=tid) is False
        # Still exactly as its owner left it.
        t = (await q.transfers("owner-a", record_id="rec-a")).transfers[0]
        assert t.deed_no == "2056/2010"
        assert [p.name for p in t.to_parties] == ["Buyer"]
    _run(body)


def test_a_deed_reference_belonging_to_somebody_else_is_dropped():
    """A transfer may only cite a paper the caller holds; otherwise the screen
    would offer to open a stranger's document."""
    async def body(m, q, pool):
        async with pool.connection() as conn:
            await conn.execute(
                "INSERT INTO registered_documents (id,owner_user_id)"
                " VALUES ('doc-mine','owner-a'),('doc-theirs','owner-b')")
        mine = await m.add_transfer("owner-a", record_id="rec-a", deed_document_id="doc-mine")
        theirs = await m.add_transfer("owner-a", record_id="rec-a", deed_document_id="doc-theirs")
        by_id = {t.id: t for t in (await q.transfers("owner-a", record_id="rec-a")).transfers}
        assert by_id[mine].deed_document_id == "doc-mine"
        assert by_id[theirs].deed_document_id == ""
    _run(body)


def test_an_owner_on_another_record_cannot_be_linked_as_a_party():
    """`owner_id` must name an owner of THIS record. A cross-record link would
    draw somebody into a chain they are not part of."""
    async def body(m, q, pool):
        async with pool.connection() as conn:
            await conn.execute(
                "INSERT INTO parcels (id,passbook_id,survey_no) VALUES ('rec-a2','pb-a','78')")
        elsewhere = await m.add_owner("owner-a", record_id="rec-a2", name="Other Record Owner")
        tid = await m.add_transfer("owner-a", record_id="rec-a")
        # Name supplied too, so the refusal is specifically about the LINK.
        pid = await m.set_transfer_party("owner-a", transfer_id=tid, side="to",
                                         owner_id=elsewhere, name="Other Record Owner")
        assert pid
        t = (await q.transfers("owner-a", record_id="rec-a")).transfers[0]
        assert t.to_parties[0].owner_id == ""
    _run(body)


# ── The chain's shape ─────────────────────────────────────────────────

def test_a_chain_cannot_be_made_to_loop():
    """A -> B -> C, then asking A to rest on C. The server refuses: a chain that
    loops has no root, and anything walking it does not terminate."""
    async def body(m, q, _pool):
        a1 = await m.add_transfer("owner-a", record_id="rec-a", deed_no="1")
        b1 = await m.add_transfer("owner-a", record_id="rec-a", deed_no="2")
        c1 = await m.add_transfer("owner-a", record_id="rec-a", deed_no="3")
        assert await m.link_transfer_prior("owner-a", transfer_id=b1, prior_transfer_id=a1)
        assert await m.link_transfer_prior("owner-a", transfer_id=c1, prior_transfer_id=b1)
        # Closing the loop, and the degenerate self-link.
        assert await m.link_transfer_prior("owner-a", transfer_id=a1,
                                          prior_transfer_id=c1) is False
        assert await m.link_transfer_prior("owner-a", transfer_id=a1,
                                          prior_transfer_id=a1) is False
        by_id = {t.id: t for t in (await q.transfers("owner-a", record_id="rec-a")).transfers}
        assert by_id[a1].prior_transfer_id == ""
    _run(body)


def test_deleting_one_event_does_not_cascade_away_the_rest_of_the_chain():
    """Removing a deed that others rest on drops only the link. Somebody who
    deletes a mis-entered middle deed must not lose their grandfather's."""
    async def body(m, q, _pool):
        first = await m.add_transfer("owner-a", record_id="rec-a", deed_no="1")
        second = await m.add_transfer("owner-a", record_id="rec-a", deed_no="2")
        await m.set_transfer_party("owner-a", transfer_id=first, side="to", name="Middle")
        await m.link_transfer_prior("owner-a", transfer_id=second, prior_transfer_id=first)

        assert await m.delete_transfer("owner-a", transfer_id=first) is True
        view = await q.transfers("owner-a", record_id="rec-a")
        assert [t.id for t in view.transfers] == [second]
        assert view.transfers[0].prior_transfer_id == ""
        # The deleted event's endpoints went with it.
        assert view.transfers[0].to_parties == []
    _run(body)


def test_a_reading_is_staged_and_counted_until_somebody_confirms_it():
    """An AI-proposed transfer exists but is not settled title. The view counts
    what is unconfirmed so the screen can say so, and confirming is an explicit
    write."""
    async def body(m, q, _pool):
        tid = await m.add_transfer("owner-a", record_id="rec-a", source="reading",
                                   verified=False, deed_no="2056/2010")
        view = await q.transfers("owner-a", record_id="rec-a")
        assert view.unverified_count == 1
        assert view.transfers[0].source == "reading"
        assert view.transfers[0].verified is False

        assert await m.update_transfer("owner-a", transfer_id=tid, verified=True)
        after = await q.transfers("owner-a", record_id="rec-a")
        assert after.unverified_count == 0
        assert after.transfers[0].verified is True
    _run(body)


def test_editing_one_field_of_a_transfer_does_not_blank_the_others():
    """Empty arguments are skipped, so correcting the date cannot erase the deed
    number. '-' is the explicit clear."""
    async def body(m, q, _pool):
        tid = await m.add_transfer("owner-a", record_id="rec-a", deed_no="2056/2010",
                                   sro="Narasaraopet", registered_on="2010-06-14")
        await m.update_transfer("owner-a", transfer_id=tid, registered_on="2010-06-15")
        t = (await q.transfers("owner-a", record_id="rec-a")).transfers[0]
        assert (t.deed_no, t.sro, t.registered_on) == ("2056/2010", "Narasaraopet", "2010-06-15")

        await m.update_transfer("owner-a", transfer_id=tid, sro="-")
        t = (await q.transfers("owner-a", record_id="rec-a")).transfers[0]
        assert t.sro == ""
        assert t.deed_no == "2056/2010"
    _run(body)


def test_removing_a_party_leaves_the_event_standing():
    """A deed whose buyer was entered wrongly is still a deed."""
    async def body(m, q, _pool):
        tid = await m.add_transfer("owner-a", record_id="rec-a", deed_no="2056/2010")
        pid = await m.set_transfer_party("owner-a", transfer_id=tid, side="to", name="Wrong")
        assert await m.remove_transfer_party("owner-a", party_id=pid) is True
        view = await q.transfers("owner-a", record_id="rec-a")
        assert view.count == 1
        assert view.transfers[0].to_parties == []
    _run(body)


def test_a_prior_link_cannot_reach_across_records():
    """A chain is the story of ONE piece of land. Linking to another record's
    deed would splice two unrelated histories into one graph — and the caller
    owns both records, so scoping by account alone does not catch it."""
    async def body(m, q, pool):
        async with pool.connection() as conn:
            await conn.execute(
                "INSERT INTO parcels (id,passbook_id,survey_no) VALUES ('rec-a2','pb-a','78')")
        here = await m.add_transfer("owner-a", record_id="rec-a", deed_no="here")
        elsewhere = await m.add_transfer("owner-a", record_id="rec-a2", deed_no="elsewhere")

        assert await m.link_transfer_prior("owner-a", transfer_id=here,
                                          prior_transfer_id=elsewhere) is False
        # And the same refusal at creation time.
        fresh = await m.add_transfer("owner-a", record_id="rec-a",
                                     prior_transfer_id=elsewhere)
        by_id = {t.id: t for t in (await q.transfers("owner-a", record_id="rec-a")).transfers}
        assert by_id[here].prior_transfer_id == ""
        assert by_id[fresh].prior_transfer_id == ""
    _run(body)


def test_updating_a_transfer_cannot_point_it_at_somebody_elses_paper():
    """add_transfer validates the deed reference; the update path has to make
    the same check, or it is simply the way around it."""
    async def body(m, q, pool):
        async with pool.connection() as conn:
            await conn.execute(
                "INSERT INTO registered_documents (id,owner_user_id) VALUES ('doc-theirs','owner-b')")
        tid = await m.add_transfer("owner-a", record_id="rec-a")
        await m.update_transfer("owner-a", transfer_id=tid, deed_document_id="doc-theirs")
        t = (await q.transfers("owner-a", record_id="rec-a")).transfers[0]
        assert t.deed_document_id == ""
    _run(body)


def test_deleting_a_record_leaves_no_transfer_pointing_into_it():
    """The record sweep clears inbound prior links the way delete_transfer does.
    A dangling id would leave another chain claiming it rests on a deed that
    nothing can open."""
    async def body(m, q, pool):
        async with pool.connection() as conn:
            await conn.execute(
                "INSERT INTO parcels (id,passbook_id,survey_no) VALUES ('rec-a2','pb-a','78')")
        doomed = await m.add_transfer("owner-a", record_id="rec-a2", deed_no="doomed")
        # Reach past the record-scoping rule to create the dangling case the
        # sweep has to clean up: an older row could already hold such a link.
        survivor = await m.add_transfer("owner-a", record_id="rec-a", deed_no="survivor")
        async with pool.connection() as conn:
            await conn.execute(
                "UPDATE record_transfers SET prior_transfer_id=%s WHERE id=%s",
                (doomed, survivor))

        assert await m.delete_records("owner-a", ids=["rec-a2"]) == 1
        t = (await q.transfers("owner-a", record_id="rec-a")).transfers[0]
        assert t.prior_transfer_id == ""
    _run(body)


def test_a_chain_of_three_events_ranks_by_who_gave_to_whom():
    """A -> B, then B -> C. The middle person is both a receiver and a giver,
    which is what makes a chain a chain rather than two unrelated sales."""
    async def body(m, q, _pool):
        first = await m.add_transfer("owner-a", record_id="rec-a", deed_no="1",
                                     registered_on="1990-01-01")
        await m.set_transfer_party("owner-a", transfer_id=first, side="from", name="A")
        await m.set_transfer_party("owner-a", transfer_id=first, side="to", name="B",
                                   extent=5.0, extent_unit="ac")
        second = await m.add_transfer("owner-a", record_id="rec-a", deed_no="2",
                                      registered_on="2010-01-01")
        await m.set_transfer_party("owner-a", transfer_id=second, side="from", name="B")
        await m.set_transfer_party("owner-a", transfer_id=second, side="to", name="C",
                                   extent=5.0, extent_unit="ac")

        view = await q.transfers("owner-a", record_id="rec-a")
        # Newest deed first, which is the order the screen lists them in.
        assert [t.deed_no for t in view.transfers] == ["2", "1"]
        givers = {t.deed_no: [p.name for p in t.from_parties] for t in view.transfers}
        takers = {t.deed_no: [p.name for p in t.to_parties] for t in view.transfers}
        assert givers == {"1": ["A"], "2": ["B"]}
        assert takers == {"1": ["B"], "2": ["C"]}
    _run(body)


def test_a_party_cannot_be_removed_by_another_account():
    async def body(m, q, _pool):
        tid = await m.add_transfer("owner-a", record_id="rec-a")
        pid = await m.set_transfer_party("owner-a", transfer_id=tid, side="to", name="Buyer")
        assert await m.remove_transfer_party("owner-b", party_id=pid) is False
        t = (await q.transfers("owner-a", record_id="rec-a")).transfers[0]
        assert [p.name for p in t.to_parties] == ["Buyer"]
    _run(body)
