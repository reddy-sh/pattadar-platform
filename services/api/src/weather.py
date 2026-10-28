"""Area rainfall for one record: the Rainfall card on a record's Location tab.

Source: NASA POWER (https://power.larc.nasa.gov), community "AG", no key. Its
weather sits on a ½° × ⅝° grid (MERRA-2; about 55 × 65 km here) and runs 2 to
7 days behind, so this is AREA rainfall, never field rainfall, and there is no
forecast. The card says both (approved by Reddy, 23/10/2026).

Privacy: the record's point is snapped to its grid cell BEFORE anything leaves
the server. NASA is sent the cell centre, never the parcel, the record id or
the owner, and the cache below is keyed by cell alone, so it holds nothing
personal. Every record in the same cell shares one answer.

A provider GET is read-only and safe to repeat, but it is never repeated
automatically: a failure is remembered for FAILED_MINUTES and only the
owner's Try again (`retry`) asks again sooner.
"""
from __future__ import annotations

import calendar
import logging
import math
from datetime import date, datetime, timedelta, timezone

POWER = "https://power.larc.nasa.gov/api/temporal"
TIMEOUT_S = 15.0
DAILY_HOURS = 6           # recent days are refreshed after this
FAILED_MINUTES = 10       # a failure is not asked about again sooner (except Try again)
RECENT_DAYS = 92          # read hourly (see fetch_daily); covers MERRA-2's lag
NORMAL_YEARS = (1991, 2020)
SEASON_MONTH = 6          # the season runs from 1 June (south-west monsoon)
FILL = -999.0
LAT_STEP, LON_STEP = 0.5, 0.625
IST = timezone(timedelta(hours=5, minutes=30))
SOURCE = "NASA POWER"
# The cache kind for recent days. Bumped whenever how days are read changes,
# so a cell cached by an older build is read again instead of being served:
# "daily" rows were written before the GEOS-IT ×24 fix (see fetch_daily).
DAILY_KIND = "daily/v2"

DDL = [
    """CREATE TABLE IF NOT EXISTS weather_cell (
        cell_lat   DOUBLE PRECISION NOT NULL,
        cell_lon   DOUBLE PRECISION NOT NULL,
        kind       TEXT NOT NULL,                  -- DAILY_KIND | normal
        state      TEXT NOT NULL DEFAULT 'done',   -- done | failed
        payload    JSONB,
        fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (cell_lat, cell_lon, kind)
    )""",
]

_log = logging.getLogger("pattadar")


def cell(lat: float, lon: float) -> tuple[float, float]:
    """The centre of the POWER grid cell the point falls in."""
    clat = round(round(lat / LAT_STEP) * LAT_STEP, 3)
    clon = round(round((lon + 180) / LON_STEP) * LON_STEP - 180, 3)
    return clat, clon


def cell_label(clat: float, clon: float) -> str:
    ns = "N" if clat >= 0 else "S"
    ew = "E" if clon >= 0 else "W"
    return f"{abs(clat):.2f}° {ns}, {abs(clon):.2f}° {ew}"


def season_start(today: date) -> date:
    y = today.year if today.month >= SEASON_MONTH else today.year - 1
    return date(y, SEASON_MONTH, 1)


def daily_start(today: date) -> date:
    """First day of the month eleven months back: covers the season and the
    last twelve months together."""
    m = today.month - 11
    y = today.year
    while m < 1:
        m += 12
        y -= 1
    return date(y, m, 1)


async def _get(path: str, params: dict) -> dict:
    """One GET to POWER. Replaced in tests."""
    import httpx
    async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
        r = await client.get(f"{POWER}/{path}", params=params)
        r.raise_for_status()
        return r.json()


def _units(body: dict, param: str, want: str) -> None:
    got = ((body.get("parameters") or {}).get(param) or {}).get("units")
    if got != want:
        raise ValueError(f"POWER {param} came in {got!r}, expected {want!r}")


async def fetch_daily(clat: float, clon: float, start: date, end: date) -> dict:
    """{YYYY-MM-DD: {rain, tmax, tmin}} for days POWER has filled in.

    Two sources, because POWER's daily endpoint is wrong for its newest days.
    Recent days come from GEOS-IT (near real time) until MERRA-2 catches up,
    and for those the daily endpoint reports rainfall 24 times too high: on
    15/10/2026 at 16.0° N, 80.0° E it said 744 mm where the hourly endpoint's
    24 hours add up to 31 mm (checked 23/10/2026). MERRA-2 days agree with the
    monthly totals. MERRA-2 runs one to two months behind, so the last
    RECENT_DAYS are summed from hourly values, and an older daily window that
    still contains GEOS-IT is refused rather than shown: a wrong rainfall
    figure is worse than none."""
    split = end - timedelta(days=RECENT_DAYS)
    out: dict = {}
    if start <= split:
        out.update(await _fetch_merra_days(clat, clon, start, split))
    out.update(await _fetch_hourly_days(clat, clon, max(start, split + timedelta(days=1)), end))
    return out


async def _fetch_merra_days(clat: float, clon: float, start: date, end: date) -> dict:
    body = await _get("daily/point", {
        "parameters": "PRECTOTCORR,T2M_MAX,T2M_MIN", "community": "AG",
        "latitude": clat, "longitude": clon, "format": "JSON",
        "start": start.strftime("%Y%m%d"), "end": end.strftime("%Y%m%d")})
    sources = (body.get("header") or {}).get("sources") or []
    if any(s != "MERRA2" and s != "POWER" for s in sources):
        raise ValueError(f"POWER daily window still holds near-real-time data: {sources}")
    _units(body, "PRECTOTCORR", "mm/day")
    p = body["properties"]["parameter"]
    out: dict = {}
    for k, rain in (p.get("PRECTOTCORR") or {}).items():
        if rain is None or rain <= FILL:
            continue
        tmax = (p.get("T2M_MAX") or {}).get(k)
        tmin = (p.get("T2M_MIN") or {}).get(k)
        out[f"{k[:4]}-{k[4:6]}-{k[6:8]}"] = {
            "rain": float(rain),
            "tmax": None if tmax is None or tmax <= FILL else float(tmax),
            "tmin": None if tmin is None or tmin <= FILL else float(tmin)}
    return out


async def _fetch_hourly_days(clat: float, clon: float, start: date, end: date) -> dict:
    """Days built from POWER's hourly values (local solar time). A day counts
    only when all 24 hours are filled in: a part-day total would read as a
    dry day."""
    body = await _get("hourly/point", {
        "parameters": "PRECTOTCORR,T2M", "community": "AG",
        "latitude": clat, "longitude": clon, "format": "JSON",
        "start": start.strftime("%Y%m%d"), "end": end.strftime("%Y%m%d")})
    _units(body, "PRECTOTCORR", "mm/hour")
    p = body["properties"]["parameter"]
    rain_h, temp_h = p.get("PRECTOTCORR") or {}, p.get("T2M") or {}
    by_day: dict[str, list] = {}
    for k, rain in rain_h.items():
        if rain is None or rain <= FILL:
            continue
        t = temp_h.get(k)
        by_day.setdefault(k[:8], []).append(
            (float(rain), None if t is None or t <= FILL else float(t)))
    out: dict = {}
    for k, hours in by_day.items():
        if len(hours) < 24:
            continue
        temps = [t for _, t in hours if t is not None]
        out[f"{k[:4]}-{k[4:6]}-{k[6:8]}"] = {
            "rain": round(sum(r for r, _ in hours), 2),
            "tmax": max(temps) if temps else None,
            "tmin": min(temps) if temps else None}
    return out


async def fetch_normal(clat: float, clon: float) -> dict:
    """{"1".."12": mean monthly rainfall in mm over NORMAL_YEARS}."""
    body = await _get("monthly/point", {
        "parameters": "PRECTOTCORR_SUM", "community": "AG",
        "latitude": clat, "longitude": clon, "format": "JSON",
        "start": NORMAL_YEARS[0], "end": NORMAL_YEARS[1]})
    sums: dict[int, list[float]] = {m: [] for m in range(1, 13)}
    for k, v in (body["properties"]["parameter"].get("PRECTOTCORR_SUM") or {}).items():
        m = int(k[4:6])
        if 1 <= m <= 12 and v is not None and v > FILL:   # month 13 is the year's total
            sums[m].append(float(v))
    if not all(sums.values()):
        raise ValueError("POWER returned no rainfall normal for this cell")
    return {str(m): sum(v) / len(v) for m, v in sums.items()}


def summarise(days: dict, normal: dict, today: date) -> dict:
    """The card's figures from cached daily values and monthly normals."""
    if not days:
        raise ValueError("no daily rainfall for this cell")
    as_of = date.fromisoformat(max(days))
    window = lambda n: [days[k] for k in sorted(days)
                        if as_of - timedelta(days=n) < date.fromisoformat(k) <= as_of]
    last7, last30 = window(7), window(30)
    start = season_start(today)
    season = sum(v["rain"] for k, v in days.items() if start <= date.fromisoformat(k) <= as_of)

    # The normal up to as_of: whole months, then the elapsed share of as_of's month.
    norm = 0.0
    d = start
    while (d.year, d.month) < (as_of.year, as_of.month):
        norm += normal[str(d.month)]
        d = date(d.year + (d.month == 12), d.month % 12 + 1, 1)
    if as_of >= start:
        dim = calendar.monthrange(as_of.year, as_of.month)[1]
        norm += normal[str(as_of.month)] * as_of.day / dim

    months = []
    d = daily_start(today)
    while (d.year, d.month) <= (today.year, today.month):
        key = f"{d.year:04d}-{d.month:02d}"
        months.append({"month": key, "mm": round(sum(v["rain"] for k, v in days.items()
                                                     if k.startswith(key)), 1),
                       "normal_mm": round(normal[str(d.month)], 1)})
        d = date(d.year + (d.month == 12), d.month % 12 + 1, 1)

    tmax = [v["tmax"] for v in last7 if v["tmax"] is not None]
    tmin = [v["tmin"] for v in last7 if v["tmin"] is not None]
    return {
        "as_of": as_of.isoformat(),
        "last7_mm": round(sum(v["rain"] for v in last7), 1),
        "last30_mm": round(sum(v["rain"] for v in last30), 1),
        "season_from": start.isoformat(),
        "season_mm": round(season, 1),
        "normal_mm": round(norm, 1),
        "season_pct": round((season - norm) / norm * 100) if norm > 0 else None,
        "t_max7": round(max(tmax), 1) if tmax else None,
        "t_min7": round(min(tmin), 1) if tmin else None,
        "months": months,
    }


def _view(status: str, reason: str = "", **figures) -> dict:
    return {"status": status, "reason": reason, "source": SOURCE, **figures}


async def _cached(pool, clat, clon, kind, max_age_minutes, retry, fetch):
    """The payload for one cell and kind: fresh from cache, fetched, or the
    last good copy when POWER fails. Raises when there is nothing to serve."""
    from psycopg.types.json import Jsonb
    async with pool.connection() as conn:
        cur = await conn.execute(
            "SELECT state, payload, EXTRACT(EPOCH FROM now() - fetched_at) / 60 AS age_min"
            " FROM weather_cell WHERE cell_lat=%s AND cell_lon=%s AND kind=%s",
            (clat, clon, kind))
        row = await cur.fetchone()
    age = float(row["age_min"]) if row else 0.0
    if row and row["state"] == "done" and (max_age_minutes is None or age < max_age_minutes):
        return row["payload"]
    if row and row["state"] == "failed" and age < FAILED_MINUTES and not retry:
        raise LookupError("recently failed")
    try:
        payload = await fetch()
    except Exception:
        _log.warning("weather: POWER %s read failed for one cell", kind, exc_info=True)
        async with pool.connection() as conn:
            if row and row["state"] == "done":
                # Stale beats nothing. Back-date the row so POWER is asked
                # again in FAILED_MINUTES, not on every view while it is down.
                await conn.execute(
                    "UPDATE weather_cell SET fetched_at = now() - make_interval(mins => %s)"
                    " WHERE cell_lat=%s AND cell_lon=%s AND kind=%s",
                    (max(0, (max_age_minutes or 0) - FAILED_MINUTES), clat, clon, kind))
                return row["payload"]
            await conn.execute(
                "INSERT INTO weather_cell (cell_lat, cell_lon, kind, state, payload)"
                " VALUES (%s,%s,%s,'failed',NULL) ON CONFLICT (cell_lat, cell_lon, kind)"
                " DO UPDATE SET state='failed', payload=NULL, fetched_at=now()",
                (clat, clon, kind))
        raise LookupError("fetch failed")
    async with pool.connection() as conn:
        await conn.execute(
            "INSERT INTO weather_cell (cell_lat, cell_lon, kind, state, payload)"
            " VALUES (%s,%s,%s,'done',%s) ON CONFLICT (cell_lat, cell_lon, kind)"
            " DO UPDATE SET state='done', payload=EXCLUDED.payload, fetched_at=now()",
            (clat, clon, kind, Jsonb(payload)))
    return payload


async def reading(pool, lat: float, lon: float, retry: bool = False,
                  today: date | None = None) -> dict:
    """The Rainfall card for one point the caller has already been allowed to read."""
    if not (lat or lon) or not (math.isfinite(lat) and math.isfinite(lon)):
        return _view("unavailable", "Set a pin or save a boundary first.")
    today = today or datetime.now(IST).date()
    clat, clon = cell(lat, lon)
    label = cell_label(clat, clon)
    try:
        normal = await _cached(pool, clat, clon, "normal", None, retry,
                               lambda: fetch_normal(clat, clon))
        days = await _cached(pool, clat, clon, DAILY_KIND, DAILY_HOURS * 60, retry,
                             lambda: fetch_daily(clat, clon, daily_start(today), today))
        figures = summarise(days, normal, today)
    except (LookupError, ValueError, KeyError):
        return _view("failed", "Rainfall could not be loaded. Try again in a few minutes.",
                     cell_label=label)
    return _view("ready", cell_label=label, **figures)
