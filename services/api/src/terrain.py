"""Water flow for one parcel: drainage lines, drainage areas and bore-point suggestions.

The Hydrogeology chip on a record's Location tab asks for this. It is the
validated prototype (docs/specs/water-flow/prototype/water_flow.py) moved into
the API, one parcel at a time, with the arithmetic untouched: the fixtures in
docs/specs/2026-10-13-water-flow-layer.md § Tests check that it still gives the
same pins. The spec's batch job (services/terrain, static line chunks on S3) is
the production shape; this computes on request from the elevation tiles and
caches the answer per boundary. On a laptop the tiles are a folder
(TERRAIN_DEM_DIR); in AWS they are an S3 prefix (TERRAIN_DEM_BUCKET, keys
dem/{source}/{file}) fetched on first use into a disk cache, and each reading
runs in one low-priority child process so the API keeps answering.

shortcut: computes per parcel inside the API task (minutes at its CPU share,
cached per boundary); Reddy accepted this for production on 28/10/2026.
Replace with the services/terrain batch job and S3 line chunks when parcels
outgrow one reading at a time.

The heavy libraries (numpy, scipy, rasterio, shapely, pysheds) are imported
inside `compute`, so an API without requirements-terrain.txt still starts and
answers "unavailable" instead of failing to boot.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import multiprocessing
import os
import re
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool

# ---------------------------------------------------------------- constants (all from the validation)
WINDOW_DEG = 0.1          # hydrology window: parcel centre ±0.1° (about ±11 km), so upslope areas near the parcel are exact
LINE_CELLS = 10           # a line where more than 10 cells (about 0.9 ha) drain through; this matched the consultant's lines
MIN_CANDIDATE_HA = 5      # bore candidates need at least 5 ha draining to them
AGREE_M = 30              # another map "agrees" when it has a line within 30 m
MAIN_STREAM_HA = 100      # "main stream" = a line with at least 100 ha draining
MAIN_STREAM_SEARCH_M = 300
PIN_SPACING_M = 50
FLAT_M, SLOPED_M = 10, 20 # spread of ground height within 1 km (95th − 5th percentile)
VIEW_KM = 3.2             # lines are kept within this distance of the parcel centre
SOURCES = ["srtm", "nasadem", "aw3d30", "copernicus"]
MAPS = ["combined"] + SOURCES
FAMILIES = {"SRTM family": ["srtm", "nasadem"], "AW3D30": ["aw3d30"], "Copernicus": ["copernicus"]}   # SRTM and NASADEM are one measurement
D8 = {64: (-1, 0), 128: (-1, 1), 1: (0, 1), 2: (1, 1), 4: (1, 0), 8: (1, -1), 16: (0, -1), 32: (-1, -1)}  # pysheds default dirmap

# Bumped when the arithmetic or the thresholds change, so cached answers recompute.
DATA_VERSION = "v1"

# Where the 1° tiles live (laid out by docs/specs/water-flow/prototype/download_dem.py).
DEM_DIR_ENV = "TERRAIN_DEM_DIR"
# In AWS: the bucket holding the same layout under dem/; TERRAIN_DEM_DIR is then
# only the disk cache the tiles are fetched into.
DEM_BUCKET_ENV = "TERRAIN_DEM_BUCKET"
DEM_PREFIX = "dem"
# Readings run in a child process (False in the database tests, whose stand-in
# `compute` cannot cross a process boundary).
SUBPROCESS = True

# A parcel bigger than this is not a parcel this window can answer for: its
# edge would sit near the window's, where upslope areas are cut short.
MAX_EXTENT_DEG = 0.03
MAX_POINTS = 2000
# Every 1° tile the elevation set holds touches India.
LAT_RANGE, LON_RANGE = (5.0, 38.0), (67.0, 98.0)


class TerrainUnavailable(Exception):
    """The answer cannot be computed here, for a reason the owner can be told."""


class TilesMissing(TerrainUnavailable):
    """The bucket has no tile for this area yet. Stored as a failure, not as
    'unavailable', so publishing the tiles later is picked up by Try again or
    once the row goes stale."""


def dem_dir() -> str | None:
    """The elevation folder, or None when this host has none. The default is
    where docs/specs/water-flow/README.md says the founder's copy lives. With a
    bucket configured it is the cache the tiles are fetched into."""
    if os.environ.get(DEM_BUCKET_ENV, "").strip():
        # shortcut: unbounded cache in the container layer (≤ the published box, ~3.7 GB for
        # Andhra Pradesh); cap it or use a host volume before publishing beyond one state.
        return os.path.expanduser(os.environ.get(DEM_DIR_ENV, "").strip() or "~/.cache/pattadar-dem")
    d = os.path.expanduser(os.environ.get(DEM_DIR_ENV, "").strip() or "~/india-ref-data-crawlings/elevation")
    return d if os.path.isdir(os.path.join(d, "srtm")) else None


_s3 = None   # one S3 client per process (the reading child's)


def _fetch_tile(path: str) -> bool:
    """Bring one tile from the bucket into the cache; False when the bucket has
    no such tile. A no-op without a bucket (the laptop folder is complete)."""
    bucket = os.environ.get(DEM_BUCKET_ENV, "").strip()
    if not bucket or os.path.exists(path):
        return os.path.exists(path)
    global _s3
    from botocore.exceptions import ClientError
    if _s3 is None:
        import boto3
        _s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION") or None)
    src, name = path.split(os.sep)[-2:]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    part = f"{path}.part-{os.getpid()}"
    try:
        _s3.download_file(bucket, f"{DEM_PREFIX}/{src}/{name}", part)
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey"):
            return False
        raise
    os.replace(part, path)   # whole tiles only: a crash mid-download leaves a .part, never a short tile
    return True


def _lower_priority() -> None:
    """The child's start: below the API's CPU priority, and one thread per
    library so a reading does not thrash the task's CPU share."""
    os.nice(10)
    for v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "NUMBA_NUM_THREADS", "GDAL_NUM_THREADS"):
        os.environ[v] = "1"


_executor: ProcessPoolExecutor | None = None


def _offload(ring, root):
    """`compute` in the low-priority child (spawned, never forked: the API
    process holds a connection pool and an event loop)."""
    global _executor
    if not SUBPROCESS:
        return asyncio.to_thread(compute, ring, root)
    if _executor is None:
        # A fresh child per reading: its ~0.95 GiB goes back as soon as it is done.
        _executor = ProcessPoolExecutor(max_workers=1, mp_context=multiprocessing.get_context("spawn"),
                                        initializer=_lower_priority, max_tasks_per_child=1)
    return asyncio.wait_for(asyncio.get_running_loop().run_in_executor(_executor, compute, ring, root),
                            READING_TIMEOUT_S)


def _kill_child() -> None:
    """A reading that outlived READING_TIMEOUT_S: stop its child and start clean."""
    global _executor
    ex, _executor = _executor, None
    if ex is not None:
        for proc in list((getattr(ex, "_processes", None) or {}).values()):
            proc.kill()
        ex.shutdown(wait=False, cancel_futures=True)


# ---------------------------------------------------------------- the cached, background reading
#
# One row per record and boundary: an edited boundary hashes differently and
# recomputes. The reading is free and repeatable (no provider, no money), so a
# row stuck "running" by a restart is simply started again once it is stale.

DDL = [
    """CREATE TABLE IF NOT EXISTS terrain_parcel_result (
        record_id     TEXT NOT NULL,
        data_version  TEXT NOT NULL,
        boundary_hash TEXT NOT NULL,
        state         TEXT NOT NULL DEFAULT 'running',  -- running | done | unavailable | failed
        result        JSONB,
        reason        TEXT NOT NULL DEFAULT '',
        computed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (record_id, data_version, boundary_hash)
    )""",
]
STALE_MINUTES = 10
# A reading takes ~65 s in AWS; one that is still going after this is stuck.
READING_TIMEOUT_S = 8 * 60
_slot: asyncio.Semaphore | None = None   # one reading at a time: ~25 s on a laptop, ~65 s and ~0.95 GiB at the AWS api's share
_tasks: set = set()                      # keeps running tasks referenced until they finish
_inflight: set = set()                   # keys queued or running here, so a stale re-claim never starts a second copy


def _view(state: str, reason: str = "", data: dict | None = None) -> dict:
    status = {"done": "ready", "running": "computing"}.get(state, state)
    return {"status": status, "reason": reason, "data": json.dumps(data, separators=(",", ":")) if data else ""}


def _slice(result: dict, source: str) -> dict:
    """One map's answer, plus every map's best pin for the comparison."""
    summary = []
    for m in MAPS:
        pts = result["sources"][m]["points"]
        best = pts[0] if pts else None
        summary.append({"map": m, "confidence": best and best["confidence"],
                        "upslope_ha": best and best["upslope_ha"], "agree": best and best["agree"]})
    return {"parcel": result["parcel"], "map": source, **result["sources"][source], "summary": summary}


async def reading(pool, record_id: str, boundary: str, source: str, retry: bool = False) -> dict:
    """{status: ready|computing|unavailable|failed, reason, data} for one owned record.

    The caller has already checked the record is the user's. `retry` is the
    owner pressing Try again: a failed answer is read again at once instead of
    waiting out STALE_MINUTES (polls never pass it, so they never re-run one)."""
    if source not in MAPS:
        raise ValueError("Unknown elevation map.")
    try:
        ring = parse_boundary(boundary)
    except ValueError as e:
        return _view("unavailable", "Save a boundary first." if not boundary.strip() else f"The {e}.")
    root = dem_dir()
    if not root:
        return _view("unavailable", "Elevation maps are not installed on this server.")
    key = (record_id, DATA_VERSION, hashlib.sha256(boundary.strip().encode()).hexdigest()[:32])
    async with pool.connection() as conn:
        cur = await conn.execute(
            "SELECT state, result, reason, computed_at > now() - make_interval(mins => %s) AS fresh"
            " FROM terrain_parcel_result WHERE record_id=%s AND data_version=%s AND boundary_hash=%s",
            (STALE_MINUTES, *key))
        row = await cur.fetchone()
        retrying = retry and row is not None and row["state"] == "failed"
        if row and (row["state"] in ("done", "unavailable") or (row["fresh"] and not retrying)):
            if row["state"] == "done":
                return _view("done", data=_slice(row["result"], source))
            return _view(row["state"], row["reason"])
        # Claim it: a new row, or a stale running/failed one. Two tabs asking at
        # once both reach here; only the one whose write lands starts a reading.
        cur = await conn.execute(
            "INSERT INTO terrain_parcel_result (record_id, data_version, boundary_hash) VALUES (%s,%s,%s)"
            " ON CONFLICT (record_id, data_version, boundary_hash) DO UPDATE"
            " SET state='running', result=NULL, reason='', computed_at=now()"
            " WHERE terrain_parcel_result.state IN ('running','failed')"
            " AND (terrain_parcel_result.computed_at <= now() - make_interval(mins => %s)"
            "      OR (%s AND terrain_parcel_result.state = 'failed'))"
            " RETURNING 1", (*key, STALE_MINUTES, retrying))
        claimed = await cur.fetchone()
    if claimed and key not in _inflight:
        _inflight.add(key)
        t = asyncio.get_running_loop().create_task(_run(pool, key, ring, root))
        _tasks.add(t)
        t.add_done_callback(_tasks.discard)
        t.add_done_callback(lambda _t: _inflight.discard(key))
    return _view("running")


async def _run(pool, key, ring, root) -> None:
    global _slot
    from psycopg.types.json import Jsonb
    _slot = _slot or asyncio.Semaphore(1)
    result, state, reason = None, "done", ""
    async with _slot:
        try:
            result = await _offload(ring, root)
        except TilesMissing as e:
            state, reason = "failed", str(e)
        except TerrainUnavailable as e:
            state, reason = "unavailable", str(e)
        except Exception as e:
            global _executor
            if isinstance(e, asyncio.TimeoutError):
                _kill_child()
            elif isinstance(e, BrokenProcessPool):   # the child died (out of memory): start a fresh one next time
                _executor = None
            logging.getLogger("pattadar").exception("water-flow reading failed for %s", key[0])
            state, reason = "failed", "The hydrogeology reading failed. Try again in a few minutes."
    async with pool.connection() as conn:
        await conn.execute(
            "UPDATE terrain_parcel_result SET state=%s, result=%s, reason=%s, computed_at=now()"
            " WHERE record_id=%s AND data_version=%s AND boundary_hash=%s",
            (state, Jsonb(result) if result else None, reason, *key))
        # Older boundaries' answers are never read again.
        await conn.execute(
            "DELETE FROM terrain_parcel_result WHERE record_id=%s"
            " AND (data_version, boundary_hash) <> (%s, %s)", key)


def parse_boundary(text: str) -> list[tuple[float, float]]:
    """A record's boundary ("lat,lng;lat,lng;…") or a KML polygon, as [(lon, lat), …].

    Raises ValueError on anything that is not a small parcel inside India."""
    m = re.search(r"<coordinates>(.*?)</coordinates>", text or "", re.S)
    if m:   # KML: lon,lat[,alt]
        ring = [tuple(map(float, c.split(",")[:2])) for c in m.group(1).split()]
    else:
        ring = []
        for p in (text or "").strip().split(";"):
            if p.strip():
                la, lo = (float(v) for v in p.split(",")[:2])
                ring.append((lo, la))
    if len(ring) < 3 or len(ring) > MAX_POINTS:
        raise ValueError("boundary needs 3 to 2000 corners")
    for lo, la in ring:
        if not (math.isfinite(lo) and math.isfinite(la)
                and LAT_RANGE[0] <= la <= LAT_RANGE[1] and LON_RANGE[0] <= lo <= LON_RANGE[1]):
            raise ValueError("boundary is outside the elevation maps")
    los, las = [p[0] for p in ring], [p[1] for p in ring]
    if max(los) - min(los) > MAX_EXTENT_DEG or max(las) - min(las) > MAX_EXTENT_DEG:
        raise ValueError("boundary is too large for a hydrogeology reading")
    return ring


def tile_path(root, src, la, lo):
    if src == "srtm":
        return f"/vsigzip/{root}/srtm/N{la:02d}E{lo:03d}.hgt.gz"
    if src == "nasadem":
        return f"{root}/nasadem/NASADEM_HGT_n{la:02d}e{lo:03d}.tif"
    if src == "aw3d30":
        return f"{root}/aw3d30/ALPSMLC30_N{la:03d}E{lo:03d}_DSM.tif"
    return f"{root}/copernicus/Copernicus_DSM_COG_10_N{la:02d}_00_E{lo:03d}_00_DEM.tif"


def _read_window(root, src, w, s, e, n):
    """Mosaic the 1° tiles a window needs (native grid, no resampling) and cut the window out."""
    import numpy as np
    import rasterio
    from rasterio.merge import merge
    from rasterio.windows import from_bounds
    from scipy import ndimage as ndi

    tiles = [(la, lo) for la in range(math.floor(s), math.floor(n) + 1) for lo in range(math.floor(w), math.floor(e) + 1)]
    for la, lo in tiles:
        if not _fetch_tile(tile_path(root, src, la, lo).removeprefix("/vsigzip/")):
            raise TilesMissing("There is no elevation map for this area yet.")
    ds = [rasterio.open(tile_path(root, src, la, lo)) for la, lo in tiles]
    arr, tr = merge(ds) if len(ds) > 1 else (ds[0].read(), ds[0].transform)
    nod = ds[0].nodata
    for d in ds:
        d.close()
    a = arr[0].astype("float32")
    # Whole cells only: a fractional window reads rounded cells but labels them
    # at the fraction, which put everything 9–15 m off (spec pitfall 1).
    win = from_bounds(w, s, e, n, tr).round_offsets().round_lengths()
    r0, c0 = int(win.row_off), int(win.col_off)
    a = a[r0:r0 + int(win.height), c0:c0 + int(win.width)]
    tw = rasterio.windows.transform(win, tr)
    bad = (a < -1000) | (a == nod) if nod is not None else (a < -1000)
    if bad.any():   # fill voids from the nearest valid cell
        a = a[tuple(ndi.distance_transform_edt(bad, return_distances=False, return_indices=True))]
    return a, tw


def compute(ring, root):
    """Every map's lines, suggestions and main stream for one parcel ring [(lon, lat), …]."""
    try:
        import numpy as np
        if not hasattr(np, "in1d"):   # pysheds still calls np.in1d, removed in NumPy 2
            np.in1d = lambda a, b, **k: np.isin(a, b, **k)
        from rasterio.io import MemoryFile
        from rasterio.warp import reproject, Resampling
        from rasterio import features
        from scipy import ndimage as ndi
        from shapely.geometry import Polygon, Point, mapping
        from shapely.ops import nearest_points
        from pysheds.grid import Grid
    except ImportError as e:
        raise TerrainUnavailable("Hydrogeology is not installed on this server.") from e

    c0 = Polygon(ring).centroid; cx, cy = float(c0.x), float(c0.y)   # area centroid, not the mean of corner points (pitfall 7)
    lat_m = 110570.0; lon_m = 111320.0 * math.cos(math.radians(cy))
    toxy = lambda lo, la: ((lo - cx) * lon_m, (la - cy) * lat_m)
    poly = Polygon([toxy(lo, la) for lo, la in ring]).buffer(0)
    if poly.is_empty:
        raise ValueError("boundary has no area")
    inner, outer = poly.buffer(-3), poly.buffer(AGREE_M)
    W_, S_, E_, N_ = cx - WINDOW_DEG, cy - WINDOW_DEG, cx + WINDOW_DEG, cy + WINDOW_DEG

    # Every source on one grid, the SRTM window. Each file's own georeferencing does the
    # alignment: AW3D30 is pixel-is-area, the others pixel-is-point (pitfall 3).
    dem = {}
    ref, tr = _read_window(root, "srtm", W_, S_, E_, N_); dem["srtm"] = ref; shp = ref.shape
    for s in SOURCES[1:]:
        a, t = _read_window(root, s, W_ - 0.01, S_ - 0.01, E_ + 0.01, N_ + 0.01)
        out = np.zeros(shp, "float32")
        reproject(a, out, src_transform=t, src_crs="EPSG:4326", dst_transform=tr, dst_crs="EPSG:4326", resampling=Resampling.bilinear)
        dem[s] = out
    fam_dem = [np.mean([dem["srtm"], dem["nasadem"]], axis=0), dem["aw3d30"], dem["copernicus"]]
    dem["combined"] = np.median(np.stack(fam_dem), axis=0).astype("float32")

    H, W = shp; dxm, dym = tr.a * lon_m, -tr.e * lat_m; cell_ha = dxm * dym / 1e4
    profile = dict(driver="GTiff", height=H, width=W, count=1, dtype="float32", crs="EPSG:4326", transform=tr, nodata=-9999)

    hyd = {}
    for s in MAPS:
        with MemoryFile() as mf:
            with mf.open(**profile) as d:
                d.write(dem[s], 1)
            path = mf.name
            g = Grid.from_raster(path); r = g.read_raster(path)
        fd = g.flowdir(g.resolve_flats(g.fill_depressions(g.fill_pits(r))))
        acc = g.accumulation(fd); Acells = np.asarray(acc, float); F = np.asarray(fd)
        strm = Acells > LINE_CELLS
        inflow = np.zeros(shp, int)
        for code, (dr, dc) in D8.items():
            inflow += np.roll(np.roll(strm & (F == code), dr, 0), dc, 1)
        hyd[s] = dict(g=g, fd=fd, acc=acc, A=Acells * cell_ha, strm=strm, junction=strm & (inflow >= 2))

    dist = {}
    for f, members in FAMILIES.items():
        m = np.zeros(shp, bool)
        for s in members:
            m |= hyd[s]["strm"]
        dist[f] = ndi.distance_transform_edt(~m, sampling=(dym, dxm))
    G = sum((dist[f] <= AGREE_M).astype(int) for f in dist)

    rc = lambda la, lo: ((la - tr.f) / tr.e - 0.5, (lo - tr.c) / tr.a - 0.5)
    ll = lambda r, c: (tr.f + (r + 0.5) * tr.e, tr.c + (c + 0.5) * tr.a)
    RR, RC = int(round(1000 / dym)), int(round(1000 / dxm))
    yy, xx = np.mgrid[-RR:RR + 1, -RC:RC + 1]; disk = (yy * dym) ** 2 + (xx * dxm) ** 2 <= 1000 ** 2
    cr, cc0 = [int(round(v)) for v in rc(cy, cx)]
    win = dem["combined"][cr - RR:cr + RR + 1, cc0 - RC:cc0 + RC + 1][disk]
    relief = float(np.percentile(win, 95) - np.percentile(win, 5))

    vk = VIEW_KM * 1000
    def in_view(lon, lat):
        return (np.abs((lon - cx) * lon_m) <= vk).any() and (np.abs((lat - cy) * lat_m) <= vk).any()

    def lines_for(s):
        h = hyd[s]; feats = []
        for f in h["g"].extract_river_network(h["fd"], h["acc"] > LINE_CELLS)["features"]:
            c = np.array(f["geometry"]["coordinates"], float)
            lon = c[:, 0] + 0.5 * tr.a; lat = c[:, 1] + 0.5 * tr.e      # pysheds returns cell corners; use centres
            if not in_view(lon, lat):
                continue
            r, cc = rc(lat, lon); r = np.clip(np.round(r).astype(int), 0, H - 1); cc = np.clip(np.round(cc).astype(int), 0, W - 1)
            if h["A"][r[0], cc[0]] > h["A"][r[-1], cc[-1]]:
                lon, lat, r, cc = lon[::-1], lat[::-1], r[::-1], cc[::-1]
            # The last vertex is the confluence cell and belongs to the stream below (pitfall 2).
            own = slice(0, max(1, len(r) - 1))
            up = float(h["A"][r[own], cc[own]].max())
            agree = int(sum((dist[fm][r[own], cc[own]] <= AGREE_M).mean() >= 0.6 for fm in dist))
            feats.append({"type": "Feature", "properties": {"upslope_ha": round(up, 2), "agree": agree},
                          "geometry": {"type": "LineString", "coordinates": [[round(a, 6), round(b, 6)] for a, b in zip(lon, lat)]}})
        return {"type": "FeatureCollection", "features": feats}

    def catchment(s, r, c):
        h = hyd[s]
        m = np.asarray(h["g"].catchment(x=int(c), y=int(r), fdir=h["fd"], xytype="index"), bool)
        best = None
        for geom, _ in features.shapes(m.astype("uint8"), mask=m, transform=tr):
            pg = Polygon(geom["coordinates"][0])
            if best is None or pg.area > best.area:
                best = pg
        if best is None:
            return None
        best = best.simplify(tr.a * 0.25)
        return {"area_ha": round(float(m.sum() * cell_ha), 2), "geometry": mapping(best)}

    def bearing(x, y):
        a = (math.degrees(math.atan2(x, y)) + 360) % 360
        return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][int((a + 22.5) // 45) % 8]

    def suggest(s):
        h = hyd[s]; Aha = h["A"]
        jd = ndi.distance_transform_edt(~h["junction"], sampling=(dym, dxm))
        cands = []
        for r, c in zip(*np.nonzero(h["strm"])):
            la, lo = ll(r, c); x, y = toxy(lo, la)
            if Aha[r, c] < MIN_CANDIDATE_HA or not outer.contains(Point(x, y)):
                continue
            q = Point(x, y); moved = 0.0
            if not inner.contains(q):
                q = nearest_points(inner, q)[0]; moved = Point(x, y).distance(q)
            a, j, g = float(Aha[r, c]), int(jd[r, c] <= AGREE_M), int(G[r, c])
            score = 0.5 * min(1.0, math.log10(a) / math.log10(500)) + 0.15 * j + 0.35 * g / 3 - 0.10 * (moved > 20)
            cands.append((score, q.x, q.y, a, j, g, moved, r, c))
        cands.sort(key=lambda t: -t[0]); picked = []
        for t in cands:
            if all(math.hypot(t[1] - p[1], t[2] - p[2]) >= PIN_SPACING_M for p in picked):
                picked.append(t)
            if len(picked) == 3:
                break
        pts = []
        for i, (score, x, y, a, j, g, moved, r, c) in enumerate(picked):
            conf = "high" if (g == 3 and relief >= SLOPED_M and a >= 10) else "medium" if g >= 2 else "low"
            if relief < FLAT_M and g < 3:
                conf = "low"
            why = (["two flow lines meet here"] if j else []) + [f"{g} of 3 maps agree",
                   "land around is flat" if relief < FLAT_M else "land is fairly flat" if relief < SLOPED_M else "land has a clear slope"]
            pts.append({"rank": i + 1, "lat": round(cy + y / lat_m, 6), "lon": round(cx + x / lon_m, 6), "confidence": conf,
                        "score": round(score, 3), "upslope_ha": round(a, 2), "junction": bool(j), "agree": g,
                        "families": {f: bool(dist[f][r, c] <= AGREE_M) for f in dist}, "moved_m": round(moved, 1),
                        "elevation_m": round(float(dem[s][r, c]), 1), "reason": "; ".join(why).capitalize(),
                        "catchment": catchment(s, r, c)})
        near = None; best = None
        for r, c in zip(*np.nonzero(Aha >= MAIN_STREAM_HA)):
            la, lo = ll(r, c); x, y = toxy(lo, la); d = poly.distance(Point(x, y))
            if d <= MAIN_STREAM_SEARCH_M and (best is None or d < best[0] or (d == best[0] and Aha[r, c] > best[3])):
                best = (d, x, y, Aha[r, c], r, c)
        if best:
            d, x, y, a, r, c = best
            near = {"upslope_ha": round(float(a), 1), "distance_m": round(d), "bearing": bearing(x, y), "agree": int(G[r, c]),
                    "crosses_parcel": d == 0, "catchment": catchment(s, r, c)}
        return pts, near

    out = {"parcel": {"centroid": [round(cy, 6), round(cx, 6)], "area_ha": round(poly.area / 1e4, 2),
                      "relief_1km_m": round(relief, 1), "terrain": "flat" if relief < FLAT_M else "fairly flat" if relief < SLOPED_M else "sloped"},
           "thresholds": {"line_cells": LINE_CELLS, "min_candidate_ha": MIN_CANDIDATE_HA, "agree_m": AGREE_M,
                          "main_stream_ha": MAIN_STREAM_HA, "view_km": VIEW_KM}, "sources": {}}
    for s in MAPS:
        pts, near = suggest(s)
        out["sources"][s] = {"lines": lines_for(s), "points": pts, "main_stream": near}
    return out
