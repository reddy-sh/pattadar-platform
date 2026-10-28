"""The Rainfall card (services/api/src/weather.py): grid-cell snapping, the
season arithmetic, the per-cell cache, failure handling, and who may ask.

NASA POWER is never called: `weather._get` is replaced by a fake. The database
tests run against real PostgreSQL in a throwaway schema (TEST_PG_DSN in CI)
and skip locally when none is reachable, like test_terrain.py.
"""
import asyncio
import os
import secrets
import sys
from contextlib import asynccontextmanager
from datetime import date, timedelta
from pathlib import Path

import psycopg
import pytest
from psycopg import sql
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import weather as wx, web360 as w

TODAY = date(2026, 10, 23)
# A pin inside the 15.5° N, 79.375° E cell, and a boundary in the same cell.
PIN = "15.6630,79.3220"
RING = "15.6620,79.3210;15.6620,79.3230;15.6640,79.3230;15.6640,79.3210"
BASE = [
    "CREATE TABLE passbooks (id TEXT PRIMARY KEY, owner_user_id TEXT)",
    "CREATE TABLE parcels (id TEXT PRIMARY KEY, passbook_id TEXT,"
    " geo_point TEXT DEFAULT '', boundary TEXT DEFAULT '')",
    "CREATE TABLE properties (id TEXT PRIMARY KEY, owner_user_id TEXT,"
    " geo_point TEXT DEFAULT '', boundary TEXT DEFAULT '')",
]
NORMAL_MM = {m: 100.0 for m in range(1, 13)}   # 100 mm every month, every year


class FakePower:
    """Answers POWER's two endpoints and records every request."""

    def __init__(self, rain_per_day=2.0, last=TODAY - timedelta(days=3)):
        self.calls, self.fail, self.rain, self.last = [], False, rain_per_day, last
        self.daily_sources, self.hourly_units = ["MERRA2"], "mm/hour"

    async def __call__(self, path, params):
        self.calls.append((path, params))
        if self.fail:
            raise RuntimeError("POWER is down")
        if path == "monthly/point":
            vals = {}
            for y in range(params["start"], params["end"] + 1):
                for m in range(1, 13):
                    vals[f"{y}{m:02d}"] = NORMAL_MM[m]
                vals[f"{y}13"] = 1200.0
            return {"properties": {"parameter": {"PRECTOTCORR_SUM": vals}}}
        start = date(int(params["start"][:4]), int(params["start"][4:6]), int(params["start"][6:]))
        end = date(int(params["end"][:4]), int(params["end"][4:6]), int(params["end"][6:]))
        if path == "hourly/point":
            rain, temp = {}, {}
            d = start
            while d <= end:
                for h in range(24):
                    k = d.strftime("%Y%m%d") + f"{h:02d}"
                    filled = d <= self.last
                    rain[k] = self.rain / 24 if filled else -999.0
                    temp[k] = (24.0 + h * 0.5) if filled else -999.0   # 24.0 … 35.5 °C
                d += timedelta(days=1)
            return {"header": {"sources": ["GEOSIT"]},
                    "parameters": {"PRECTOTCORR": {"units": self.hourly_units}, "T2M": {"units": "C"}},
                    "properties": {"parameter": {"PRECTOTCORR": rain, "T2M": temp}}}
        rain, tmax, tmin = {}, {}, {}
        d = start
        while d <= end:
            k = d.strftime("%Y%m%d")
            filled = d <= self.last
            rain[k] = self.rain if filled else -999.0
            tmax[k] = 33.0 + (d.day % 3) if filled else -999.0
            tmin[k] = 24.0 - (d.day % 2) if filled else -999.0
            d += timedelta(days=1)
        return {"header": {"sources": self.daily_sources},
                "parameters": {"PRECTOTCORR": {"units": "mm/day"}},
                "properties": {"parameter": {"PRECTOTCORR": rain, "T2M_MAX": tmax, "T2M_MIN": tmin}}}


# ---------------------------------------------------------------- pure arithmetic

def test_a_point_is_snapped_to_its_power_grid_cell_before_it_leaves():
    assert wx.cell(15.6630, 79.3220) == (15.5, 79.375)
    assert wx.cell(15.76, 79.65) == (16.0, 79.375)
    assert wx.cell(15.76, 79.70) == (16.0, 80.0)
    assert wx.cell(16.0, 80.0) == (16.0, 80.0)
    assert wx.cell_label(15.5, 79.375) == "15.50° N, 79.38° E"


def test_the_season_starts_on_the_first_of_june():
    assert wx.season_start(date(2026, 10, 23)) == date(2026, 6, 1)
    assert wx.season_start(date(2026, 6, 1)) == date(2026, 6, 1)
    assert wx.season_start(date(2027, 3, 4)) == date(2026, 6, 1)
    assert wx.daily_start(date(2026, 10, 23)) == date(2025, 11, 1)
    assert wx.daily_start(date(2027, 5, 31)) == date(2026, 6, 1)   # still covers the season


def test_season_total_is_compared_with_the_normal_to_the_same_day():
    days = {}
    d = date(2025, 11, 1)
    while d <= date(2026, 10, 20):
        days[d.isoformat()] = {"rain": 2.0, "tmax": 33.0, "tmin": 24.0}
        d += timedelta(days=1)
    normal = {str(m): 100.0 for m in range(1, 13)}
    got = wx.summarise(days, normal, TODAY)
    assert got["as_of"] == "2026-10-20"
    assert (got["last7_mm"], got["last30_mm"]) == (14.0, 60.0)
    season_days = (date(2026, 10, 20) - date(2026, 6, 1)).days + 1     # 142
    assert got["season_mm"] == round(2.0 * season_days, 1)
    assert got["normal_mm"] == round(400 + 100 * 20 / 31, 1)          # Jun–Sep + 20/31 of Oct
    assert got["season_pct"] == round((284 - (400 + 100 * 20 / 31)) / (400 + 100 * 20 / 31) * 100)
    assert [m["month"] for m in got["months"]][0] == "2025-11"
    assert len(got["months"]) == 12 and got["months"][-1]["month"] == "2026-10"
    assert (got["t_max7"], got["t_min7"]) == (33.0, 24.0)


# ---------------------------------------------------------------- the database

@asynccontextmanager
async def database(monkeypatch, power):
    dsn = os.getenv("TEST_PG_DSN",
                    "host=localhost port=5432 dbname=postgres user=rhub password=rhub-dev-pwd")
    name = "test_weather_" + secrets.token_hex(8)
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
    monkeypatch.setattr(wx, "_get", power)
    real_reading = wx.reading
    monkeypatch.setattr(wx, "reading",
                        lambda pool, lat, lon, retry=False, today=None:
                        real_reading(pool, lat, lon, retry, today or TODAY))
    try:
        await pool.open()
        await pool.wait()
        w.bind(pool, lambda info: info)
        async with pool.connection() as conn:
            for stmt in BASE + wx.DDL:
                await conn.execute(stmt)
            await conn.execute("INSERT INTO passbooks VALUES ('pb-a','owner-a'),('pb-b','owner-b')")
            await conn.execute(
                "INSERT INTO parcels VALUES ('rec-pin','pb-a',%s,''),('rec-ring','pb-a','',%s),"
                "('rec-bare','pb-a','','')", (PIN, RING))
            await conn.execute("INSERT INTO properties VALUES ('rec-flat','owner-a',%s,'')", (PIN,))
        yield pool
    finally:
        w.bind(old_pool, old_uid)
        await pool.close()
        await admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(name)))
        await admin.close()


async def cache_rows(pool):
    async with pool.connection() as conn:
        cur = await conn.execute("SELECT * FROM weather_cell ORDER BY kind")
        return await cur.fetchall()


def test_ready_figures_and_only_the_grid_cell_is_sent(monkeypatch):
    power = FakePower()

    async def run():
        async with database(monkeypatch, power) as pool:
            v = await w.WebQuery().rainfall("owner-a", "rec-pin")
            assert v.status == "ready" and v.source == "NASA POWER"
            assert v.as_of == "2026-10-20" and v.season_from == "2026-06-01"
            assert (v.last7_mm, v.last30_mm) == (14.0, 60.0)
            assert v.cell_label == "15.50° N, 79.38° E" and len(v.months) == 12
            for _, params in power.calls:
                assert (params["latitude"], params["longitude"]) == (15.5, 79.375)
                assert "15.663" not in repr(params) and "79.322" not in repr(params)
            # The cache knows the cell and nothing about the owner or the record.
            rows = await cache_rows(pool)
            assert [r["kind"] for r in rows] == [wx.DAILY_KIND, "normal"]
            assert set(rows[0]) == {"cell_lat", "cell_lon", "kind", "state", "payload", "fetched_at"}
    asyncio.run(run())


def test_records_in_the_same_cell_share_one_answer(monkeypatch):
    power = FakePower()

    async def run():
        async with database(monkeypatch, power) as pool:
            q = w.WebQuery()
            assert (await q.rainfall("owner-a", "rec-pin")).status == "ready"
            assert (await q.rainfall("owner-a", "rec-ring")).status == "ready"   # boundary centre
            assert (await q.rainfall("owner-a", "rec-flat")).status == "ready"   # a property
            assert [c[0] for c in power.calls] == ["monthly/point", "daily/point", "hourly/point"]
            # Six hours on, only the recent days are asked for again.
            async with pool.connection() as conn:
                await conn.execute("UPDATE weather_cell SET fetched_at = now() - interval '7 hours'")
            await q.rainfall("owner-a", "rec-pin")
            assert [c[0] for c in power.calls[3:]] == ["daily/point", "hourly/point"]
    asyncio.run(run())


def test_someone_elses_record_gets_nothing_and_asks_nobody(monkeypatch):
    power = FakePower()

    async def run():
        async with database(monkeypatch, power) as pool:
            q = w.WebQuery()
            assert await q.rainfall("owner-b", "rec-pin") is None
            assert await q.rainfall("owner-b", "rec-flat") is None
            assert await q.rainfall("owner-a", "no-such-record") is None
            assert power.calls == [] and await cache_rows(pool) == []
    asyncio.run(run())


def test_a_record_with_no_location_says_so_without_asking(monkeypatch):
    power = FakePower()

    async def run():
        async with database(monkeypatch, power):
            v = await w.WebQuery().rainfall("owner-a", "rec-bare")
            assert (v.status, v.reason) == ("unavailable", "Set a pin or save a boundary first.")
            assert power.calls == []
    asyncio.run(run())


def test_a_failure_is_not_retried_until_try_again(monkeypatch):
    power = FakePower()
    power.fail = True

    async def run():
        async with database(monkeypatch, power) as pool:
            q = w.WebQuery()
            v = await q.rainfall("owner-a", "rec-pin")
            assert v.status == "failed" and "Try again" in v.reason
            assert "POWER is down" not in v.reason          # the cause stays in the log
            assert len(power.calls) == 1
            # A second view inside FAILED_MINUTES asks nobody.
            assert (await q.rainfall("owner-a", "rec-pin")).status == "failed"
            assert len(power.calls) == 1
            # Try again asks at once.
            power.fail = False
            assert (await q.rainfall("owner-a", "rec-pin", retry=True)).status == "ready"
    asyncio.run(run())


def test_stale_figures_are_served_when_power_is_down(monkeypatch):
    power = FakePower()

    async def run():
        async with database(monkeypatch, power) as pool:
            q = w.WebQuery()
            assert (await q.rainfall("owner-a", "rec-pin")).status == "ready"
            async with pool.connection() as conn:
                await conn.execute("UPDATE weather_cell SET fetched_at = now() - interval '7 hours'")
            power.fail = True
            v = await q.rainfall("owner-a", "rec-pin")
            assert v.status == "ready" and v.as_of == "2026-10-20"
            n = len(power.calls)
            # Back-dated, so the next view does not wait on POWER again at once.
            await q.rainfall("owner-a", "rec-pin")
            assert len(power.calls) == n
    asyncio.run(run())


def test_recent_days_come_from_hourly_values_and_older_ones_from_merra2(monkeypatch):
    power = FakePower()

    async def run():
        async with database(monkeypatch, power):
            v = await w.WebQuery().rainfall("owner-a", "rec-pin")
            assert v.status == "ready"
            daily = next(p for path, p in power.calls if path == "daily/point")
            hourly = next(p for path, p in power.calls if path == "hourly/point")
            split = TODAY - timedelta(days=wx.RECENT_DAYS)
            assert daily["start"] == "20251101" and daily["end"] == split.strftime("%Y%m%d")
            assert hourly["start"] == (split + timedelta(days=1)).strftime("%Y%m%d")
            assert hourly["end"] == TODAY.strftime("%Y%m%d")
            assert (v.last7_mm, v.t_max7, v.t_min7) == (14.0, 35.5, 24.0)
    asyncio.run(run())


def test_a_daily_window_still_holding_near_real_time_data_is_refused(monkeypatch):
    power = FakePower()
    power.daily_sources = ["MERRA2", "GEOSIT"]

    async def run():
        async with database(monkeypatch, power):
            v = await w.WebQuery().rainfall("owner-a", "rec-pin")
            assert v.status == "failed" and v.last7_mm is None
    asyncio.run(run())


def test_unexpected_units_are_refused(monkeypatch):
    power = FakePower()
    power.hourly_units = "mm/day"

    async def run():
        async with database(monkeypatch, power):
            assert (await w.WebQuery().rainfall("owner-a", "rec-pin")).status == "failed"
    asyncio.run(run())


def test_days_cached_by_an_older_build_are_read_again(monkeypatch):
    power = FakePower()

    async def run():
        async with database(monkeypatch, power) as pool:
            from psycopg.types.json import Jsonb
            async with pool.connection() as conn:   # a fresh row in the old, ×24 shape
                await conn.execute(
                    "INSERT INTO weather_cell (cell_lat, cell_lon, kind, payload)"
                    " VALUES (15.5, 79.375, 'daily', %s)",
                    (Jsonb({"2026-10-20": {"rain": 744.0, "tmax": 33.0, "tmin": 24.0}}),))
            v = await w.WebQuery().rainfall("owner-a", "rec-pin")
            assert v.status == "ready" and v.last7_mm == 14.0
            assert "hourly/point" in [c[0] for c in power.calls]
    asyncio.run(run())
