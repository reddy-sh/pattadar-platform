"""The Hydrogeology (water flow) layer: boundary parsing, the cached background
reading, who may ask, and — where the founder's fixtures and the elevation
maps are on this machine — that the API reproduces the validated prototype.

The database tests run against real PostgreSQL in a throwaway schema (set
TEST_PG_DSN in CI) with the reading itself replaced by a fake: the arithmetic
is checked by the fixture test, which needs the 26 GB of elevation tiles and
the private fixtures, kept outside the repo, so it skips everywhere else.
"""
import asyncio
import json
import os
import secrets
import sys
import threading
from contextlib import asynccontextmanager
from pathlib import Path

import psycopg
import pytest
from psycopg import sql
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import terrain as t, web360 as w

BASE = [
    "CREATE TABLE passbooks (id TEXT PRIMARY KEY, owner_user_id TEXT)",
    "CREATE TABLE parcels (id TEXT PRIMARY KEY, passbook_id TEXT, boundary TEXT DEFAULT '')",
    "CREATE TABLE properties (id TEXT PRIMARY KEY, owner_user_id TEXT, boundary TEXT DEFAULT '')",
]
RING = "15.6620,79.3210;15.6620,79.3230;15.6640,79.3230;15.6640,79.3210"


def fake_result(ring, root):
    pin = {"rank": 1, "lat": 15.663, "lon": 79.322, "confidence": "high", "upslope_ha": 30.0,
           "agree": 3, "catchment": None}
    return {"parcel": {"centroid": [15.663, 79.322], "area_ha": 4.6, "relief_1km_m": 23.5,
                       "terrain": "sloped"}, "thresholds": {},
            "sources": {m: {"lines": {"type": "FeatureCollection", "features": []},
                            "points": [pin] if m != "copernicus" else [], "main_stream": None}
                        for m in t.MAPS}}


@asynccontextmanager
async def database(monkeypatch, compute=fake_result):
    dsn = os.getenv("TEST_PG_DSN",
                    "host=localhost port=5432 dbname=postgres user=rhub password=rhub-dev-pwd")
    name = "test_terrain_" + secrets.token_hex(8)
    try:
        admin = await psycopg.AsyncConnection.connect(dsn, autocommit=True)
    except psycopg.OperationalError:
        if os.getenv("TEST_PG_DSN"):
            raise
        pytest.skip("Local test PostgreSQL unavailable; set TEST_PG_DSN in CI")
    await admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(name)))

    async def configure(conn):
        await conn.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(name)))

    pool = AsyncConnectionPool(dsn, min_size=1, max_size=4, open=False, configure=configure,
                               kwargs={"autocommit": True, "row_factory": dict_row})
    old_pool, old_uid = w._pool, w._uid_of
    monkeypatch.setattr(t, "compute", compute)
    monkeypatch.setattr(t, "SUBPROCESS", False)   # the stand-in cannot cross a process boundary
    monkeypatch.setattr(t, "dem_dir", lambda: "/elevation")
    monkeypatch.setattr(t, "_slot", None)
    try:
        await pool.open()
        await pool.wait()
        w.bind(pool, lambda info: info)
        async with pool.connection() as conn:
            for stmt in BASE + t.DDL:
                await conn.execute(stmt)
            await conn.execute("INSERT INTO passbooks VALUES ('pb-a','owner-a'),('pb-b','owner-b')")
            await conn.execute("INSERT INTO parcels VALUES ('rec-one','pb-a',%s),('rec-bare','pb-a','')", (RING,))
            await conn.execute("INSERT INTO properties VALUES ('rec-flat','owner-a',%s),('rec-two','owner-a',%s)", (RING, RING))
        yield pool
    finally:
        w.bind(old_pool, old_uid)
        await pool.close()
        await admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(name)))
        await admin.close()


async def settle():
    """Let every reading started by the last call finish."""
    while t._tasks:
        await asyncio.gather(*list(t._tasks))


async def rows(pool):
    async with pool.connection() as conn:
        cur = await conn.execute("SELECT record_id, state FROM terrain_parcel_result ORDER BY record_id")
        return [(r["record_id"], r["state"]) for r in await cur.fetchall()]


def test_parse_boundary_reads_both_formats_and_refuses_what_it_cannot_answer():
    assert t.parse_boundary(RING)[0] == (79.321, 15.662)
    kml = "<kml><coordinates>79.321,15.662,0 79.323,15.662,0 79.323,15.664,0</coordinates></kml>"
    assert t.parse_boundary(kml) == [(79.321, 15.662), (79.323, 15.662), (79.323, 15.664)]
    for bad, why in [("15.66,79.32;15.67,79.32", "corners"),
                     ("51.5,-0.1;51.5,-0.09;51.51,-0.09", "outside"),
                     ("15.0,79.0;15.0,79.2;15.2,79.2", "too large"),
                     ("15.66,79.32;nan,79.33;15.67,79.33", "outside")]:
        with pytest.raises(ValueError, match=why):
            t.parse_boundary(bad)


class FakeS3:
    """boto3's S3 client, as far as _fetch_tile uses it."""
    def __init__(self, tiles):
        self.tiles, self.asked = tiles, []

    def download_file(self, bucket, key, dest):
        from botocore.exceptions import ClientError
        self.asked.append((bucket, key))
        if key not in self.tiles:
            raise ClientError({"Error": {"Code": "404"}}, "HeadObject")
        Path(dest).write_bytes(self.tiles[key])


def test_in_aws_the_tiles_come_from_the_bucket_once_and_a_missing_one_says_so(monkeypatch, tmp_path):
    import boto3
    s3 = FakeS3({"dem/srtm/N15E079.hgt.gz": b"tile"})
    monkeypatch.setattr(boto3, "client", lambda name, **k: s3)
    monkeypatch.setenv(t.DEM_BUCKET_ENV, "pattadar-prod-vm-x")
    monkeypatch.setenv(t.DEM_DIR_ENV, str(tmp_path))
    root = t.dem_dir()
    assert root == str(tmp_path)   # the cache, whether or not it holds anything yet
    path = t.tile_path(root, "srtm", 15, 79).removeprefix("/vsigzip/")
    assert t._fetch_tile(path) and Path(path).read_bytes() == b"tile"
    assert t._fetch_tile(path)     # cached: the bucket is not asked again
    assert s3.asked == [("pattadar-prod-vm-x", "dem/srtm/N15E079.hgt.gz")]
    assert list(Path(path).parent.glob("*.part-*")) == []
    gone = t.tile_path(root, "copernicus", 15, 79)
    assert t._fetch_tile(gone) is False and not Path(gone).exists()


def test_without_a_bucket_only_the_local_folder_counts(monkeypatch, tmp_path):
    monkeypatch.delenv(t.DEM_BUCKET_ENV, raising=False)
    monkeypatch.setenv(t.DEM_DIR_ENV, str(tmp_path))
    assert t.dem_dir() is None                     # no srtm/ folder: "not installed"
    (tmp_path / "srtm").mkdir()
    assert t.dem_dir() == str(tmp_path)
    assert t._fetch_tile(str(tmp_path / "srtm" / "N15E079.hgt.gz")) is False


def test_a_reading_runs_once_in_the_background_and_is_then_served_from_cache(monkeypatch):
    calls = []
    release = threading.Event()   # holds the reading open while a second tab asks

    def counted(ring, root):
        calls.append(ring)
        release.wait(5)
        return fake_result(ring, root)

    async def run():
        async with database(monkeypatch, counted) as pool:
            q = w.WebQuery()
            first = await q.water_flow("owner-a", "rec-one")
            assert (first.status, first.data) == ("computing", "")
            # A second tab asking before the first reading lands starts nothing new.
            assert (await q.water_flow("owner-a", "rec-one")).status == "computing"
            release.set()
            await settle()
            ready = await q.water_flow("owner-a", "rec-one", "srtm")
            assert ready.status == "ready"
            data = json.loads(ready.data)
            assert data["map"] == "srtm" and data["points"][0]["rank"] == 1
            assert [s["map"] for s in data["summary"]] == t.MAPS
            assert data["summary"][-1]["confidence"] is None   # copernicus found no pin
            await q.water_flow("owner-a", "rec-one", "combined")
            assert len(calls) == 1
            # A property is answered the same way as a parcel.
            await q.water_flow("owner-a", "rec-flat")
            await settle()
            assert (await q.water_flow("owner-a", "rec-flat")).status == "ready"
    asyncio.run(run())


def test_someone_elses_record_gets_nothing_and_starts_nothing(monkeypatch):
    async def run():
        async with database(monkeypatch) as pool:
            q = w.WebQuery()
            assert await q.water_flow("owner-b", "rec-one") is None
            assert await q.water_flow("owner-b", "rec-flat") is None
            assert await q.water_flow("owner-a", "no-such-record") is None
            assert await rows(pool) == []
    asyncio.run(run())


def test_an_edited_boundary_reads_again_and_drops_the_old_answer(monkeypatch):
    async def run():
        async with database(monkeypatch) as pool:
            q = w.WebQuery()
            await q.water_flow("owner-a", "rec-one")
            await settle()
            async with pool.connection() as conn:
                await conn.execute("UPDATE parcels SET boundary=%s WHERE id='rec-one'",
                                   (RING.replace("79.3230", "79.3235"),))
            assert (await q.water_flow("owner-a", "rec-one")).status == "computing"
            await settle()
            assert (await q.water_flow("owner-a", "rec-one")).status == "ready"
            assert await rows(pool) == [("rec-one", "done")]
    asyncio.run(run())


def test_failures_and_missing_inputs_say_why(monkeypatch):
    def broken(ring, root):
        raise RuntimeError("disk on fire")

    def no_tiles(ring, root):
        raise t.TerrainUnavailable("There is no elevation map for this area yet.")

    def not_published_yet(ring, root):
        raise t.TilesMissing("There is no elevation map for this area yet.")

    async def run():
        async with database(monkeypatch, broken) as pool:
            q = w.WebQuery()
            bare = await q.water_flow("owner-a", "rec-bare")
            assert (bare.status, bare.reason) == ("unavailable", "Save a boundary first.")
            with pytest.raises(ValueError, match="Unknown elevation map"):
                await q.water_flow("owner-a", "rec-one", "google")
            await q.water_flow("owner-a", "rec-one")
            await settle()
            failed = await q.water_flow("owner-a", "rec-one")
            assert failed.status == "failed" and "Try again" in failed.reason
            assert "disk" not in failed.reason          # the cause stays in the log
            # Fresh failures are not retried on every poll.
            assert t._tasks == set() and (await rows(pool)) == [("rec-one", "failed")]
            # Try again reads it again at once, and only a failed answer.
            monkeypatch.setattr(t, "compute", fake_result)
            assert (await q.water_flow("owner-a", "rec-one", retry=True)).status == "computing"
            await settle()
            assert (await q.water_flow("owner-a", "rec-one")).status == "ready"
            calls = []
            monkeypatch.setattr(t, "compute", lambda ring, root: calls.append(ring) or fake_result(ring, root))
            assert (await q.water_flow("owner-a", "rec-one", retry=True)).status == "ready"
            await settle()
            assert calls == []

            monkeypatch.setattr(t, "compute", no_tiles)
            await q.water_flow("owner-a", "rec-flat")
            await settle()
            gone = await q.water_flow("owner-a", "rec-flat")
            assert (gone.status, gone.reason) == ("unavailable", "There is no elevation map for this area yet.")

            # A tile the bucket does not have yet is a failure Try again can clear once it is published.
            monkeypatch.setattr(t, "compute", not_published_yet)
            await q.water_flow("owner-a", "rec-two")
            await settle()
            early = await q.water_flow("owner-a", "rec-two")
            assert (early.status, early.reason) == ("failed", "There is no elevation map for this area yet.")
            monkeypatch.setattr(t, "compute", fake_result)
            assert (await q.water_flow("owner-a", "rec-two", retry=True)).status == "computing"
            await settle()
            assert (await q.water_flow("owner-a", "rec-two")).status == "ready"

            monkeypatch.setattr(t, "dem_dir", lambda: None)
            nodata = await q.water_flow("owner-a", "rec-one")
            assert nodata.status == "unavailable" and "not installed" in nodata.reason
    asyncio.run(run())


# ---------------------------------------------------------------- the fixtures (founder's machine only)

ELEVATION = Path(os.path.expanduser("~/india-ref-data-crawlings/elevation"))
FIXTURES = ELEVATION / "fixtures"


@pytest.mark.parametrize("kml,expected", [
    ("sloka-farms.kml", "expected-sloka-farms.json"),
    ("owner-parcel.kml", "expected-owner-parcel.json"),
])
def test_the_api_reproduces_the_validated_prototype_on_the_fixture_parcels(kml, expected):
    if not (FIXTURES / kml).exists() or not (ELEVATION / "srtm").is_dir():
        pytest.skip("Water-flow fixtures and elevation maps live outside the repo (see docs/specs/water-flow/README.md)")
    pytest.importorskip("pysheds")
    got = t.compute(t.parse_boundary((FIXTURES / kml).read_text()), str(ELEVATION))
    want = json.loads((FIXTURES / expected).read_text())
    assert got["parcel"] == want["parcel"]
    key = lambda p: (p["rank"], p["lat"], p["lon"], p["confidence"], p["upslope_ha"], p["agree"])
    for m in t.MAPS:
        g, e = got["sources"][m], want["sources"][m]
        assert [key(p) for p in g["points"]] == [key(p) for p in e["points"]], m
        assert [p["catchment"]["area_ha"] for p in g["points"]] == [p["catchment"]["area_ha"] for p in e["points"]], m
        assert (g["main_stream"] or {}).get("upslope_ha") == (e["main_stream"] or {}).get("upslope_ha"), m
        assert len(g["lines"]["features"]) == len(e["lines"]["features"]), m
