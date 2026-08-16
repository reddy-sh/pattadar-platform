"""Property photos — the parcel-photo contract, applied to the Property entity.

Everything here runs through the real GraphQL schema against the local
Postgres (skips cleanly when the phone-local stack is down), because the
whole point is the ownership scoping and the one-cover rule — both of which
live in SQL, not in Python.
"""

import asyncio
import sys
import uuid
from pathlib import Path

import psycopg
import pytest
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import main

try:
    with psycopg.connect(main.DSN, connect_timeout=2):
        DB_AVAILABLE = True
except Exception:
    DB_AVAILABLE = False


class _FakeRequest:
    """Just enough request for _uid_from_info: gateway-injected identity."""

    def __init__(self, uid: str):
        self.headers = {"x-user-id": uid}


async def _gql(query: str, uid: str, **variables):
    result = await main.schema.execute(
        query, variable_values=variables or None,
        context_value={"request": _FakeRequest(uid)})
    return result


def _run(fn):
    """One test flow on a private pool swapped into main.pool, with the
    schema ensured and this flow's rows cleaned away afterwards."""
    if not DB_AVAILABLE:
        pytest.skip("local Postgres not available")

    async def wrapper():
        pool = AsyncConnectionPool(
            conninfo=main.DSN, min_size=1, max_size=2, open=False,
            kwargs={"row_factory": dict_row, "autocommit": True})
        await pool.open(wait=True, timeout=5)
        prev, main.pool = main.pool, pool
        uid = "photo-test-" + uuid.uuid4().hex[:8]
        try:
            async with pool.connection() as conn:
                # The feature's own DDL (IF NOT EXISTS) — full init_db seeds
                # reference data and is far too heavy for a unit test.
                await main.ensure_property_photos_schema(conn)
            await fn(uid, pool)
        finally:
            main.pool = prev
            try:
                async with pool.connection() as conn:
                    await conn.execute(
                        "DELETE FROM property_photos WHERE owner_user_id LIKE 'photo-test-%'")
                    await conn.execute(
                        "DELETE FROM properties WHERE owner_user_id LIKE 'photo-test-%'")
            finally:
                await pool.close()

    asyncio.run(wrapper())


async def _make_property(pool, uid, label="Test plot"):
    pid = "prop-" + uuid.uuid4().hex[:10]
    async with pool.connection() as conn:
        await conn.execute(
            "INSERT INTO properties (id, owner_user_id, label) VALUES (%s,%s,%s)",
            (pid, uid, label))
    return pid


ADD = """
mutation Add($propertyId: String!, $fileRef: String!, $caption: String!,
             $latitude: Float, $longitude: Float) {
  addPropertyPhoto(propertyId: $propertyId, fileRef: $fileRef,
                   caption: $caption, latitude: $latitude, longitude: $longitude) {
    id propertyId fileRef category caption latitude longitude isCover capturedBy
  }
}
"""

LIST = """
query List($propertyId: String!) {
  propertyPhotos(propertyId: $propertyId) {
    id fileRef caption isCover
  }
}
"""


def test_add_then_list_roundtrip():
    async def flow(uid, pool):
        pid = await _make_property(pool, uid)
        added = await _gql(ADD, uid, propertyId=pid, fileRef="node-1",
                           caption="north boundary", latitude=17.4, longitude=78.5)
        assert not added.errors
        photo = added.data["addPropertyPhoto"]
        assert photo["propertyId"] == pid
        assert photo["fileRef"] == "node-1"
        assert photo["category"] == "general"
        assert photo["capturedBy"] == uid
        assert photo["isCover"] is False  # never auto-covered

        listed = await _gql(LIST, uid, propertyId=pid)
        assert not listed.errors
        assert [p["fileRef"] for p in listed.data["propertyPhotos"]] == ["node-1"]

    _run(flow)


def test_missing_location_reads_as_missing():
    async def flow(uid, pool):
        pid = await _make_property(pool, uid)
        added = await _gql(ADD, uid, propertyId=pid, fileRef="n", caption="")
        assert not added.errors
        assert added.data["addPropertyPhoto"]["latitude"] is None
        assert added.data["addPropertyPhoto"]["longitude"] is None

    _run(flow)


def test_cannot_add_to_someone_elses_property():
    async def flow(uid, pool):
        pid = await _make_property(pool, uid)
        thief = uid + "-thief"
        added = await _gql(ADD, thief, propertyId=pid, fileRef="x", caption="")
        assert added.errors
        assert added.data is None or added.data.get("addPropertyPhoto") is None

    _run(flow)


def test_listing_is_owner_scoped():
    async def flow(uid, pool):
        pid = await _make_property(pool, uid)
        await _gql(ADD, uid, propertyId=pid, fileRef="mine", caption="")
        other = await _gql(LIST, uid + "-other", propertyId=pid)
        assert not other.errors
        assert other.data["propertyPhotos"] == []

    _run(flow)


def test_cover_moves_and_stays_unique():
    async def flow(uid, pool):
        pid = await _make_property(pool, uid)
        a = (await _gql(ADD, uid, propertyId=pid, fileRef="a", caption="")).data["addPropertyPhoto"]
        b = (await _gql(ADD, uid, propertyId=pid, fileRef="b", caption="")).data["addPropertyPhoto"]

        set_cover = "mutation S($id: String!) { setPropertyCoverPhoto(id: $id) }"
        first = await _gql(set_cover, uid, id=a["id"])
        assert not first.errors and first.data["setPropertyCoverPhoto"] is True
        second = await _gql(set_cover, uid, id=b["id"])
        assert not second.errors and second.data["setPropertyCoverPhoto"] is True

        listed = (await _gql(LIST, uid, propertyId=pid)).data["propertyPhotos"]
        covers = {p["id"]: p["isCover"] for p in listed}
        assert covers == {a["id"]: False, b["id"]: True}

        # A stranger cannot move the cover.
        stranger = await _gql(set_cover, uid + "-x", id=a["id"])
        assert stranger.errors

    _run(flow)


def test_update_touches_only_supplied_fields():
    async def flow(uid, pool):
        pid = await _make_property(pool, uid)
        a = (await _gql(ADD, uid, propertyId=pid, fileRef="a",
                        caption="original")).data["addPropertyPhoto"]
        upd = """
        mutation U($id: String!, $category: String) {
          updatePropertyPhoto(id: $id, category: $category) { id category caption }
        }
        """
        out = await _gql(upd, uid, id=a["id"], category="boundary")
        assert not out.errors
        assert out.data["updatePropertyPhoto"]["category"] == "boundary"
        # Caption was never mentioned — it must survive.
        assert out.data["updatePropertyPhoto"]["caption"] == "original"

    _run(flow)


def test_delete_own_photo_and_not_others():
    async def flow(uid, pool):
        pid = await _make_property(pool, uid)
        a = (await _gql(ADD, uid, propertyId=pid, fileRef="a", caption="")).data["addPropertyPhoto"]

        delete = "mutation D($id: String!) { deletePropertyPhoto(id: $id) }"
        stranger = await _gql(delete, uid + "-x", id=a["id"])
        assert not stranger.errors
        assert stranger.data["deletePropertyPhoto"] is False

        mine = await _gql(delete, uid, id=a["id"])
        assert mine.data["deletePropertyPhoto"] is True
        assert (await _gql(LIST, uid, propertyId=pid)).data["propertyPhotos"] == []

    _run(flow)
