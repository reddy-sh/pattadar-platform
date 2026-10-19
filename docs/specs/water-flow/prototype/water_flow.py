"""Water flow layer prototype: drainage lines, drainage areas and bore-point suggestions for one parcel.

This is the validated reference implementation from the 12/10/2026 investigation (see
../../2026-10-13-water-flow-layer.md). It is a prototype, not production code: one parcel at a time,
everything in memory. The production pipeline (services/terrain) must reproduce its outputs on the
fixtures listed in the spec.

Usage:
  python3 -I water_flow.py --elevation ~/india-ref-data-crawlings/elevation \
                           --boundary parcel.kml --out result.json [--view-km 3.2]

Input
  --elevation  folder laid out by download_dem.py: srtm/ nasadem/ aw3d30/ copernicus/ (1-degree tiles)
  --boundary   KML with one polygon, or a text file holding Pattadar's boundary string "lat,lng;lat,lng;..."
Output (JSON)
  {"parcel": {...}, "sources": {"combined"|"srtm"|"nasadem"|"aw3d30"|"copernicus": {
      "lines":  GeoJSON FeatureCollection of LineStrings, properties {upslope_ha, agree} (lines run downstream),
      "points": up to 3 suggestions with confidence, reason and "catchment" (GeoJSON Polygon, area_ha),
      "main_stream": nearest stream over 100 ha within 300 m, with its "catchment"}}}

Dependencies: numpy, scipy, rasterio, shapely, pysheds (0.4). pysheds still calls np.in1d, removed in NumPy 2;
the shim below restores it.
"""
import argparse, json, math, os, re, sys
import numpy as np
if not hasattr(np, "in1d"):
    np.in1d = lambda a, b, **k: np.isin(a, b, **k)
import rasterio
from rasterio.io import MemoryFile
from rasterio.merge import merge
from rasterio.warp import reproject, Resampling
from rasterio.windows import from_bounds
from rasterio import features
from scipy import ndimage as ndi
from shapely.geometry import Polygon, Point, mapping
from shapely.ops import nearest_points
from pysheds.grid import Grid

# ---------------------------------------------------------------- constants (all from the validation)
WINDOW_DEG = 0.1          # hydrology window: parcel centre +-0.1 degree (about +-11 km), so upslope areas near the parcel are exact
LINE_CELLS = 10           # a line where more than 10 cells (about 0.9 ha) drain through; this matched the consultant's lines
MIN_CANDIDATE_HA = 5      # bore candidates need at least 5 ha draining to them
AGREE_M = 30              # another map "agrees" when it has a line within 30 m
MAIN_STREAM_HA = 100      # "main stream" = a line with at least 100 ha draining
MAIN_STREAM_SEARCH_M = 300
PIN_SPACING_M = 50
FLAT_M, SLOPED_M = 10, 20 # spread of ground height within 1 km (95th - 5th percentile): under 10 m = flat, 20 m and over = sloped
SOURCES = ["srtm", "nasadem", "aw3d30", "copernicus"]
FAMILIES = {"SRTM family": ["srtm", "nasadem"], "AW3D30": ["aw3d30"], "Copernicus": ["copernicus"]}   # SRTM and NASADEM are one measurement
D8 = {64: (-1, 0), 128: (-1, 1), 1: (0, 1), 2: (1, 1), 4: (1, 0), 8: (1, -1), 16: (0, -1), 32: (-1, -1)}  # pysheds default dirmap


def tile_path(root, src, la, lo):
    if src == "srtm":
        return f"/vsigzip/{root}/srtm/N{la:02d}E{lo:03d}.hgt.gz"
    if src == "nasadem":
        return f"{root}/nasadem/NASADEM_HGT_n{la:02d}e{lo:03d}.tif"
    if src == "aw3d30":
        return f"{root}/aw3d30/ALPSMLC30_N{la:03d}E{lo:03d}_DSM.tif"
    return f"{root}/copernicus/Copernicus_DSM_COG_10_N{la:02d}_00_E{lo:03d}_00_DEM.tif"


def read_window(root, src, w, s, e, n):
    """Mosaic the 1-degree tiles a window needs (native grid, no resampling) and cut the window out."""
    tiles = [(la, lo) for la in range(math.floor(s), math.floor(n) + 1) for lo in range(math.floor(w), math.floor(e) + 1)]
    ds = [rasterio.open(tile_path(root, src, la, lo)) for la, lo in tiles]
    arr, tr = merge(ds) if len(ds) > 1 else (ds[0].read(), ds[0].transform)
    nod = ds[0].nodata
    for d in ds: d.close()
    a = arr[0].astype("float32")
    win = from_bounds(w, s, e, n, tr).round_offsets().round_lengths()
    r0, c0 = int(win.row_off), int(win.col_off)
    a = a[r0:r0 + int(win.height), c0:c0 + int(win.width)]
    tw = rasterio.windows.transform(win, tr)
    bad = (a < -1000) | (a == nod) if nod is not None else (a < -1000)
    if bad.any():   # fill voids from the nearest valid cell
        a = a[tuple(ndi.distance_transform_edt(bad, return_distances=False, return_indices=True))]
    return a, tw


def read_boundary(path):
    t = open(path).read()
    m = re.search(r"<coordinates>(.*?)</coordinates>", t, re.S)
    if m:   # KML: lon,lat[,alt]
        ring = [tuple(map(float, c.split(",")[:2])) for c in m.group(1).split()]
    else:   # Pattadar boundary string: lat,lng;lat,lng;...
        ring = [tuple(reversed(list(map(float, p.split(","))))) for p in t.strip().split(";") if p.strip()]
    return ring  # [(lon, lat), ...]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--elevation", required=True); ap.add_argument("--boundary", required=True)
    ap.add_argument("--out", required=True); ap.add_argument("--view-km", type=float, default=3.2)
    A = ap.parse_args()
    root = os.path.expanduser(A.elevation)

    ring = read_boundary(A.boundary)
    c0 = Polygon(ring).centroid; cx, cy = float(c0.x), float(c0.y)   # area centroid, not the mean of corner points
    lat_m = 110570.0; lon_m = 111320.0 * math.cos(math.radians(cy))
    toxy = lambda lo, la: ((lo - cx) * lon_m, (la - cy) * lat_m)
    poly = Polygon([toxy(lo, la) for lo, la in ring]).buffer(0)
    inner, outer = poly.buffer(-3), poly.buffer(AGREE_M)
    W_, S_, E_, N_ = cx - WINDOW_DEG, cy - WINDOW_DEG, cx + WINDOW_DEG, cy + WINDOW_DEG

    # ---- every source on one grid: the SRTM window. Each file's own georeferencing does the alignment
    # (SRTM, NASADEM, Copernicus are pixel-is-point; AW3D30 is pixel-is-area: mixing arrays by index shifts it ~15 m).
    dem = {}
    ref, tr = read_window(root, "srtm", W_, S_, E_, N_); dem["srtm"] = ref; shp = ref.shape
    for s in SOURCES[1:]:
        a, t = read_window(root, s, W_ - 0.01, S_ - 0.01, E_ + 0.01, N_ + 0.01)
        out = np.zeros(shp, "float32")
        reproject(a, out, src_transform=t, src_crs="EPSG:4326", dst_transform=tr, dst_crs="EPSG:4326", resampling=Resampling.bilinear)
        dem[s] = out
    fam_dem = [np.mean([dem["srtm"], dem["nasadem"]], axis=0), dem["aw3d30"], dem["copernicus"]]
    dem["combined"] = np.median(np.stack(fam_dem), axis=0).astype("float32")

    H, W = shp; dxm, dym = tr.a * lon_m, -tr.e * lat_m; cell_ha = dxm * dym / 1e4
    profile = dict(driver="GTiff", height=H, width=W, count=1, dtype="float32", crs="EPSG:4326", transform=tr, nodata=-9999)

    hyd = {}
    for s in SOURCES + ["combined"]:
        with MemoryFile() as mf:
            with mf.open(**profile) as d: d.write(dem[s], 1)
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
        for s in members: m |= hyd[s]["strm"]
        dist[f] = ndi.distance_transform_edt(~m, sampling=(dym, dxm))
    G = sum((dist[f] <= AGREE_M).astype(int) for f in dist)

    rc = lambda la, lo: ((la - tr.f) / tr.e - 0.5, (lo - tr.c) / tr.a - 0.5)
    ll = lambda r, c: (tr.f + (r + 0.5) * tr.e, tr.c + (c + 0.5) * tr.a)
    RR, RC = int(round(1000 / dym)), int(round(1000 / dxm))
    yy, xx = np.mgrid[-RR:RR + 1, -RC:RC + 1]; disk = (yy * dym) ** 2 + (xx * dxm) ** 2 <= 1000 ** 2
    cr, cc0 = [int(round(v)) for v in rc(cy, cx)]
    win = dem["combined"][cr - RR:cr + RR + 1, cc0 - RC:cc0 + RC + 1][disk]
    relief = float(np.percentile(win, 95) - np.percentile(win, 5))

    vk = A.view_km * 1000
    def in_view(lon, lat): return (np.abs((lon - cx) * lon_m) <= vk).any() and (np.abs((lat - cy) * lat_m) <= vk).any()

    def lines_for(s):
        h = hyd[s]; feats = []
        for f in h["g"].extract_river_network(h["fd"], h["acc"] > LINE_CELLS)["features"]:
            c = np.array(f["geometry"]["coordinates"], float)
            lon = c[:, 0] + 0.5 * tr.a; lat = c[:, 1] + 0.5 * tr.e      # pysheds returns cell corners; use centres
            if not in_view(lon, lat): continue
            r, cc = rc(lat, lon); r = np.clip(np.round(r).astype(int), 0, H - 1); cc = np.clip(np.round(cc).astype(int), 0, W - 1)
            if h["A"][r[0], cc[0]] > h["A"][r[-1], cc[-1]]:
                lon, lat, r, cc = lon[::-1], lat[::-1], r[::-1], cc[::-1]
            # The last vertex is the confluence cell and belongs to the stream below. Including it gave every
            # side stream the main stream's area (the bug fixed on 12/10/2026).
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
            if best is None or pg.area > best.area: best = pg
        if best is None: return None
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
            if Aha[r, c] < MIN_CANDIDATE_HA or not outer.contains(Point(x, y)): continue
            q = Point(x, y); moved = 0.0
            if not inner.contains(q):
                q = nearest_points(inner, q)[0]; moved = Point(x, y).distance(q)
            a, j, g = float(Aha[r, c]), int(jd[r, c] <= AGREE_M), int(G[r, c])
            score = 0.5 * min(1.0, math.log10(a) / math.log10(500)) + 0.15 * j + 0.35 * g / 3 - 0.10 * (moved > 20)
            cands.append((score, q.x, q.y, a, j, g, moved, r, c))
        cands.sort(key=lambda t: -t[0]); picked = []
        for t in cands:
            if all(math.hypot(t[1] - p[1], t[2] - p[2]) >= PIN_SPACING_M for p in picked): picked.append(t)
            if len(picked) == 3: break
        pts = []
        for i, (score, x, y, a, j, g, moved, r, c) in enumerate(picked):
            conf = "high" if (g == 3 and relief >= SLOPED_M and a >= 10) else "medium" if g >= 2 else "low"
            if relief < FLAT_M and g < 3: conf = "low"
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
                          "main_stream_ha": MAIN_STREAM_HA, "view_km": A.view_km}, "sources": {}}
    for s in ["combined"] + SOURCES:
        pts, near = suggest(s)
        out["sources"][s] = {"lines": lines_for(s), "points": pts, "main_stream": near}
        print(s, [(p["rank"], p["confidence"], p["upslope_ha"], p["agree"]) for p in pts],
              "main stream", near and (near["upslope_ha"], near["distance_m"], near["bearing"]), file=sys.stderr)
    json.dump(out, open(A.out, "w"), separators=(",", ":"))


if __name__ == "__main__":
    main()
