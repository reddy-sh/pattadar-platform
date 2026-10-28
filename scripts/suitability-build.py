#!/usr/bin/env python3
"""Build the land suitability layer for shipped village maps (phase 1).

    .local/api-venv/bin/python scripts/suitability-build.py [--dir apps/web/public/vm] [--only munagapadu]

Spec: docs/specs/2026-10-23-land-suitability-layer.md (approved by Reddy,
23/10/2026, with the proposal's defaults). For every village geojson under
--dir it writes `<village>/suitability.json` beside it: each parcel's grade
(Best · Good · Fair · Limited, or Not assessed), its score, its six factor
scores, its main limiting factor and the values behind them, plus the acres
in each grade. Reference data only: no owner, no record.

Inputs, read for the village's own window (nothing is sent anywhere but the
public data hosts):
  slope           Copernicus DEM GLO-30 (else SRTM), the local tiles terrain.py uses
  low-lying       the same DEM: ground below its 330 m neighbourhood
  texture, pH, organic carbon   ISRIC SoilGrids 2.0 WCS, 0–30 cm, 250 m (CC BY 4.0)
  rainfall        CHIRPS 2.0 annual totals, mean of 1991–2020, ~5 km
  land cover      ESA WorldCover 2021 v200, 10 m (CC BY 4.0)

Publishing the output to the production /vm/ bucket is scripts/vm-publish.py,
an operator act this script never takes.
"""
from __future__ import annotations

import argparse
import io
import json
import math
import sys
from datetime import date
from pathlib import Path

import httpx
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.features import rasterize
from rasterio.merge import merge
from rasterio.transform import from_origin
from rasterio.warp import reproject
from rasterio.windows import from_bounds

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "api"))
from src import terrain  # noqa: E402  (the DEM folder and tile names)

VERSION = 1
PAD_DEG = 0.01                       # a margin, so slope and low-lying are right at the edge
CELL_DEG = 1 / 3600                  # the DEM's own 1 arc-second grid (~30 m)
CLASSES = ["best", "good", "fair", "limited"]
FACTORS = ["slope", "texture", "ph", "carbon", "rain", "lowlying"]
WEIGHTS = {"rain": 0.25, "slope": 0.20, "texture": 0.20, "ph": 0.15, "carbon": 0.10, "lowlying": 0.10}
# WorldCover classes that are not graded: tree cover, built-up, water, wetland, mangroves.
NOT_ASSESSED = {10: "trees", 50: "built-up", 80: "water", 90: "wetland", 95: "mangroves"}
TEXTURES = ["loam", "clay loam", "sandy loam", "sandy clay loam", "clay", "loamy sand", "sand"]
TEXTURE_SCORE = {"loam": 4, "clay loam": 4, "sandy loam": 3, "sandy clay loam": 3,
                 "clay": 2, "loamy sand": 2, "sand": 1}
SOILGRIDS = "https://maps.isric.org/mapserv"
EPSG4326 = "http://www.opengis.net/def/crs/EPSG/0/4326"
CHIRPS = "/vsicurl/https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_annual/tifs/chirps-v2.0.{y}.tif"
WORLDCOVER = ("/vsicurl/https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/"
              "ESA_WorldCover_10m_2021_v200_{ns}{la:02d}{ew}{lo:03d}_Map.tif")
NORMAL_YEARS = range(1991, 2021)
DEPTHS = [("0-5cm", 5), ("5-15cm", 10), ("15-30cm", 15)]


# ---------------------------------------------------------------- the grid

class Grid:
    """The village window on the DEM's 1″ grid."""

    def __init__(self, w, s, e, n):
        self.w, self.s, self.e, self.n = w, s, e, n
        self.width = int(math.ceil((e - w) / CELL_DEG))
        self.height = int(math.ceil((n - s) / CELL_DEG))
        self.transform = from_origin(w, n, CELL_DEG, CELL_DEG)
        self.lat = (s + n) / 2

    def empty(self, fill=np.nan):
        return np.full((self.height, self.width), fill, dtype="float32")

    def warp(self, src, src_transform, src_crs, resampling, nodata=None):
        out = self.empty()
        reproject(src.astype("float32"), out, src_transform=src_transform, src_crs=src_crs,
                  src_nodata=nodata, dst_transform=self.transform, dst_crs="EPSG:4326",
                  dst_nodata=np.nan, resampling=resampling)
        return out


def read_dem(g: Grid) -> np.ndarray:
    root = terrain.dem_dir()
    if not root:
        sys.exit("No elevation maps on this machine (see docs/specs/water-flow/README.md).")
    tiles = [(la, lo) for la in range(math.floor(g.s), math.floor(g.n) + 1)
             for lo in range(math.floor(g.w), math.floor(g.e) + 1)]
    for src in ("copernicus", "srtm"):
        paths = [terrain.tile_path(root, src, la, lo) for la, lo in tiles]
        if all(Path(p.removeprefix("/vsigzip/")).exists() for p in paths):
            ds = [rasterio.open(p) for p in paths]
            try:
                arr, tr = merge(ds, bounds=(g.w, g.s, g.e, g.n))
                crs, nodata = ds[0].crs, ds[0].nodata
            finally:
                for d in ds:
                    d.close()
            return src, g.warp(arr[0], tr, crs, Resampling.bilinear, nodata)
    sys.exit("No Copernicus or SRTM tile covers this village.")


def slope_pct(dem: np.ndarray, g: Grid) -> np.ndarray:
    dy = CELL_DEG * 110_540.0
    dx = CELL_DEG * 111_320.0 * math.cos(math.radians(g.lat))
    gy, gx = np.gradient(dem, dy, dx)
    return np.hypot(gx, gy) * 100


def lowness_m(dem: np.ndarray) -> np.ndarray:
    """How far each cell sits below the mean of the 11 × 11 cells (~330 m)
    around it: positive is a hollow that water runs into."""
    from scipy import ndimage as ndi
    filled = np.where(np.isfinite(dem), dem, np.nanmean(dem))
    return ndi.uniform_filter(filled, size=11, mode="nearest") - filled


def read_soil(g: Grid, prop: str) -> np.ndarray:
    """0–30 cm, depth-weighted, warped to the grid. Raw SoilGrids units."""
    total = None
    for depth, weight in DEPTHS:
        params = [("map", f"/map/{prop}.map"), ("SERVICE", "WCS"), ("VERSION", "2.0.1"),
                  ("REQUEST", "GetCoverage"), ("COVERAGEID", f"{prop}_{depth}_mean"),
                  ("FORMAT", "image/tiff"), ("SUBSET", f"long({g.w},{g.e})"),
                  ("SUBSET", f"lat({g.s},{g.n})"), ("SUBSETTINGCRS", EPSG4326), ("OUTPUTCRS", EPSG4326)]
        r = httpx.get(SOILGRIDS, params=params, timeout=120)
        r.raise_for_status()
        if not r.headers.get("content-type", "").startswith("image/tiff"):
            raise RuntimeError(f"SoilGrids {prop} {depth}: {r.text[:200]}")
        with rasterio.open(io.BytesIO(r.content)) as ds:
            raw = ds.read(1).astype("float32")
            raw[raw <= 0] = np.nan                      # 0 is SoilGrids' no-data
            layer = g.warp(raw, ds.transform, ds.crs, Resampling.bilinear, np.nan)
        total = layer * weight if total is None else total + layer * weight
    return total / sum(w for _, w in DEPTHS)


def read_rain(g: Grid) -> np.ndarray:
    acc = None
    for y in NORMAL_YEARS:
        with rasterio.open(CHIRPS.format(y=y)) as ds:
            win = from_bounds(g.w - 0.1, g.s - 0.1, g.e + 0.1, g.n + 0.1, ds.transform)
            raw = ds.read(1, window=win).astype("float32")
            raw[raw < 0] = np.nan
            layer = g.warp(raw, ds.window_transform(win), ds.crs, Resampling.bilinear, np.nan)
        acc = layer if acc is None else acc + layer
    return acc / len(NORMAL_YEARS)


def read_cover(g: Grid) -> np.ndarray:
    tiles = {(3 * math.floor(la / 3), 3 * math.floor(lo / 3))
             for la in (g.s, g.n) for lo in (g.w, g.e)}
    out = np.zeros((g.height, g.width), dtype="uint8")
    for la, lo in tiles:
        url = WORLDCOVER.format(ns="N" if la >= 0 else "S", la=abs(la), ew="E" if lo >= 0 else "W", lo=abs(lo))
        with rasterio.open(url) as ds:
            win = from_bounds(g.w, g.s, g.e, g.n, ds.transform).round_offsets().round_lengths()
            raw = ds.read(1, window=win, boundless=True, fill_value=0)
            part = np.zeros_like(out)
            reproject(raw, part, src_transform=ds.window_transform(win), src_crs=ds.crs,
                      src_nodata=0, dst_transform=g.transform, dst_crs="EPSG:4326",
                      dst_nodata=0, resampling=Resampling.mode)
            out = np.where(out == 0, part, out)
    return out


# ---------------------------------------------------------------- scoring (spec § 3)

def band(v, cuts, scores):
    """scores[i] for the first cut v falls under; the last score otherwise."""
    out = np.full(v.shape, np.nan, dtype="float32")
    rest = np.isfinite(v)
    for cut, s in zip(cuts, scores):
        hit = rest & (v < cut)
        out[hit] = s
        rest &= ~hit
    out[rest] = scores[-1]
    return out


def texture_of(clay: np.ndarray, sand: np.ndarray) -> np.ndarray:
    """A simplified USDA triangle, as an index into TEXTURES (-1 unknown)."""
    t = np.full(clay.shape, 0, dtype="int8")                 # loam
    t[clay >= 27] = 1                                        # clay loam
    t[(sand > 45) & (clay < 35)] = 3                         # sandy clay loam
    t[(sand > 52) & (clay < 20)] = 2                         # sandy loam
    t[clay >= 40] = 4                                        # clay
    t[(sand >= 70) & (clay < 15)] = 5                        # loamy sand
    t[sand >= 85] = 6                                        # sand
    t[~(np.isfinite(clay) & np.isfinite(sand))] = -1
    return t


def score_ph(ph):
    out = np.full(ph.shape, np.nan, dtype="float32")
    ok = np.isfinite(ph)
    out[ok] = 1
    out[ok & (((ph >= 5.0) & (ph < 5.5)) | ((ph > 8.0) & (ph <= 8.5)))] = 2
    out[ok & (((ph >= 5.5) & (ph < 6.0)) | ((ph > 7.5) & (ph <= 8.0)))] = 3
    out[ok & (ph >= 6.0) & (ph <= 7.5)] = 4
    return out


def scores(layers: dict) -> dict:
    tex = layers["texture"]
    tex_score = np.full(tex.shape, np.nan, dtype="float32")
    for i, name in enumerate(TEXTURES):
        tex_score[tex == i] = TEXTURE_SCORE[name]
    return {
        "slope": band(layers["slope"], [2, 5, 10], [4, 3, 2, 1]),
        "texture": tex_score,
        "ph": score_ph(layers["ph"]),
        "carbon": band(layers["carbon"], [0.25, 0.5, 0.75], [1, 2, 3, 4]),
        "rain": band(layers["rain"], [500, 700, 900], [1, 2, 3, 4]),
        # Below the neighbourhood by 6 m or more: water collects; 3 m: low-lying.
        "lowlying": band(-layers["lowness"], [-6, -3], [1, 2, 4]),
    }


def grade(score: float) -> int:
    return 0 if score >= 3.25 else 1 if score >= 2.5 else 2 if score >= 1.75 else 3


# ---------------------------------------------------------------- one village

def build(geojson: Path, out_dir: Path) -> dict:
    g_json = json.loads(geojson.read_text())
    feats = [f for f in g_json["features"] if f.get("geometry") and f["properties"].get("lp")]
    xs = [c[0] for f in feats for ring in _rings(f["geometry"]) for c in ring]
    ys = [c[1] for f in feats for ring in _rings(f["geometry"]) for c in ring]
    g = Grid(min(xs) - PAD_DEG, min(ys) - PAD_DEG, max(xs) + PAD_DEG, max(ys) + PAD_DEG)
    print(f"{g_json.get('village')}: {len(feats)} parcels, {g.width}×{g.height} cells", flush=True)

    dem_src, dem = read_dem(g)
    clay = read_soil(g, "clay") / 10            # g/kg → %
    sand = read_soil(g, "sand") / 10
    layers = {
        "slope": slope_pct(dem, g),
        "lowness": lowness_m(dem),
        "texture": texture_of(clay, sand),
        "ph": read_soil(g, "phh2o") / 10,       # pH × 10 → pH
        "carbon": read_soil(g, "soc") / 100,    # dg/kg → %
        "rain": read_rain(g),
        "clay": clay, "sand": sand,
    }
    cover = read_cover(g)
    s = scores(layers)

    ids = rasterize(((f["geometry"], i + 1) for i, f in enumerate(feats)),
                    out_shape=(g.height, g.width), transform=g.transform, fill=0, dtype="int32")
    plots: dict = {}
    areas = {c: 0.0 for c in CLASSES + ["none"]}
    for i, f in enumerate(feats):
        lp = str(f["properties"]["lp"])
        acres = _acres(f)
        mask = ids == i + 1
        if not mask.any():                       # smaller than a cell: the cell at its centre
            r, c = _cell_of(_centre(f["geometry"]), g)
            mask = np.zeros_like(ids, dtype=bool)
            if 0 <= r < g.height and 0 <= c < g.width:
                mask[r, c] = True
        cov = cover[mask]
        excluded = np.isin(cov, list(NOT_ASSESSED))
        valid = mask & ~np.isin(cover, list(NOT_ASSESSED))
        for k in FACTORS:
            valid &= np.isfinite(s[k])
        if excluded.mean() > 0.5 or not valid.any():
            why = (NOT_ASSESSED.get(int(np.bincount(cov[excluded]).argmax()), "no data")
                   if excluded.any() else "no data")
            plots[lp] = {"g": -1, "why": why}
            areas["none"] += acres
            continue
        fs = {k: float(np.mean(s[k][valid])) for k in FACTORS}
        total = sum(WEIGHTS[k] * fs[k] for k in FACTORS)
        lost = {k: WEIGHTS[k] * (4 - fs[k]) for k in FACTORS}
        worst = max(lost, key=lost.get)
        cls = grade(total)
        tex_vals = layers["texture"][valid]
        tex_vals = tex_vals[tex_vals >= 0]
        plots[lp] = {
            "g": cls,
            "s": round(total, 2),
            "f": [round(fs[k], 1) for k in FACTORS],
            "lim": worst if lost[worst] >= 0.15 else "",
            "v": {
                "slope": round(float(np.median(layers["slope"][valid])), 1),
                "ph": round(float(np.median(layers["ph"][valid])), 1),
                "clay": round(float(np.median(layers["clay"][valid]))),
                "sand": round(float(np.median(layers["sand"][valid]))),
                "carbon": round(float(np.median(layers["carbon"][valid])), 2),
                "rain": round(float(np.median(layers["rain"][valid]))),
                "low": round(float(np.median(layers["lowness"][valid])), 1),
                "texture": TEXTURES[int(np.bincount(tex_vals).argmax())] if tex_vals.size else "",
            },
        }
        areas[CLASSES[cls]] += acres

    out = {
        "v": VERSION,
        "village": g_json.get("village"),
        "key": g_json.get("key"),
        "built": date.today().isoformat(),
        "classes": CLASSES,
        "factors": FACTORS,
        "weights": WEIGHTS,
        "sources": [f"Slope and low-lying ground: {'Copernicus DEM GLO-30' if dem_src == 'copernicus' else 'SRTM'}",
                    "Soil: ISRIC SoilGrids 2.0, 0–30 cm, 250 m (CC BY 4.0)",
                    "Rainfall: CHIRPS 2.0, 1991–2020 average, ~5 km",
                    "Land cover: ESA WorldCover 2021, 10 m (CC BY 4.0)"],
        "areas": {k: round(v, 2) for k, v in areas.items()},
        "plots": plots,
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "suitability.json").write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))
    print("  " + ", ".join(f"{k} {v:.0f} ac" for k, v in out["areas"].items()), flush=True)
    return out


def _rings(geom):
    if geom["type"] == "Polygon":
        return geom["coordinates"]
    if geom["type"] == "MultiPolygon":
        return [r for poly in geom["coordinates"] for r in poly]
    return []


def _centre(geom):
    ring = _rings(geom)[0]
    return sum(c[0] for c in ring) / len(ring), sum(c[1] for c in ring) / len(ring)


def _cell_of(pt, g: Grid):
    lon, lat = pt
    return int((g.n - lat) / CELL_DEG), int((lon - g.w) / CELL_DEG)


def _acres(f) -> float:
    """The map's own extent where it states one, else the polygon's area
    (shoelace on a local equirectangular projection; parcels are small)."""
    try:
        stated = float(f["properties"].get("ac") or 0)
    except ValueError:
        stated = 0.0
    if stated > 0:
        return stated
    sq_m = 0.0
    polys = ([f["geometry"]["coordinates"]] if f["geometry"]["type"] == "Polygon"
             else f["geometry"]["coordinates"] if f["geometry"]["type"] == "MultiPolygon" else [])
    for poly in polys:
        for k, ring in enumerate(poly):
            lat0 = math.radians(sum(c[1] for c in ring) / len(ring))
            pts = [(c[0] * 111_320 * math.cos(lat0), c[1] * 110_540) for c in ring]
            a = abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]))) / 2
            sq_m += a if k == 0 else -a          # holes subtract
    return sq_m / 4046.8564224


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dir", default=str(ROOT / "apps/web/public/vm"))
    ap.add_argument("--only", default="", help="build only villages whose file name contains this")
    args = ap.parse_args()
    base = Path(args.dir)
    files = sorted(p for p in base.rglob("*.geojson") if args.only in p.stem)
    if not files:
        sys.exit(f"No village geojson under {base}")
    for p in files:
        build(p, p.with_suffix(""))


if __name__ == "__main__":
    main()
