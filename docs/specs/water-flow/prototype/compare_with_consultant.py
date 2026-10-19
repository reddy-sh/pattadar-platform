"""Validation tool: how well do the consultant's cyan lines (in a georeferenced screenshot) match our drainage lines?
Usage: python3 -I compare_with_consultant.py screenshot.png georef.json frame.json copernicus.tif srtm.hgt out_dir [trace.kml]
       EXTRA="nasadem:/path/NASADEM_HGT_n13e078.tif,aw3d30:/path/ALPSMLC30_N013E078_DSM.tif" adds more maps.
       SRTM tiles can be read gzipped: /vsigzip//full/path/srtm/N13E078.hgt.gz
Writes compare_default.json: for line thresholds 1-20 cells, the share of his lines within 30/60 m of ours and the chance level
(our lines shifted 120-180 m). Needs opencv-python, scikit-image, rasterio, scipy, shapely, pysheds.
geo.json: {"M": 2x3 affine crop px -> mosaic px, "crop": [x0,y0,x1,y1]}
"""
import sys, os, json, math, re
import numpy as np
if not hasattr(np, "in1d"):
    np.in1d = lambda a, b, **k: np.isin(a, b, **k)
import cv2, rasterio
from rasterio.windows import from_bounds
from rasterio import features
from scipy import ndimage as ndi
from skimage.morphology import skeletonize
from shapely.geometry import Polygon
from pysheds.grid import Grid

SHOT, GEO, MOS, COP, SRTM, OUT = sys.argv[1:7]
UKML = sys.argv[7] if len(sys.argv) > 7 else None
os.makedirs(OUT, exist_ok=True)
geo = json.load(open(GEO)); mos = json.load(open(MOS))
M = np.array(geo["M"]); x0c, y0c, x1c, y1c = geo["crop"]; N = 256 * 2 ** mos["zoom"]
Mi = cv2.invertAffineTransform(M)

def px_to_ll(px, py):
    p = np.c_[px, py, np.ones(len(px))] @ M.T
    X = mos["x0"] * 256 + p[:, 0]; Y = mos["y0"] * 256 + p[:, 1]
    return X / N * 360 - 180, np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * Y / N))))
def ll_to_px(lon, lat):
    X = (np.asarray(lon) + 180) / 360 * N
    Y = (1 - np.log(np.tan(np.radians(lat)) + 1 / np.cos(np.radians(lat))) / np.pi) / 2 * N
    p = np.c_[X - mos["x0"] * 256, Y - mos["y0"] * 256, np.ones(len(X))] @ Mi.T
    return p[:, 0], p[:, 1]

shot = cv2.imread(SHOT)[y0c:y1c, x0c:x1c]; H, W = shot.shape[:2]
b, g, r = [c.astype(int) for c in cv2.split(shot)]
cyan = ndi.binary_opening((g > 150) & (b > 150) & (r < 160) & (g - r > 50), np.ones((2, 2)))
py, px = np.nonzero(skeletonize(cyan))
hlon, hlat = px_to_ll(px.astype(float), py.astype(float))
out = {}

# his yellow parcel outline vs the user's traced KML
yel0 = (r > 200) & (g > 200) & (b < 120)
# cyan lines and the cursor are drawn over the outline in places: bridge those gaps
yel = ndi.binary_closing(yel0 | (cyan & ndi.binary_dilation(yel0, iterations=25)), np.ones((25, 25)))
lab, n = ndi.label(yel)
if n:
    big = np.argmax(ndi.sum(yel, lab, range(1, n + 1))) + 1
    filled = ndi.binary_fill_holes(lab == big)
    lw = max(1, int((lab == big).sum() / max(1, cv2.arcLength(max(cv2.findContours(filled.astype(np.uint8), 0, 1)[0], key=cv2.contourArea).astype(np.float32), True)) / 2))
    inner = ndi.binary_erosion(filled, iterations=lw)
    cs, _ = cv2.findContours(inner.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cnt = max(cs, key=cv2.contourArea)[:, 0, :].astype(float)
    ylon, ylat = px_to_ll(cnt[:, 0], cnt[:, 1])
    lat0 = float(np.mean(ylat)); lm = (111320 * math.cos(math.radians(lat0)), 110570.0)
    his_poly = Polygon(np.c_[ylon * lm[0], ylat * lm[1]]).buffer(0)
    out["his_parcel_area_ha"] = round(his_poly.area / 1e4, 2)
    out["his_parcel_coords"] = [[round(a, 7), round(b_, 7)] for a, b_ in zip(ylon, ylat)]
    if UKML:
        t = open(UKML).read()
        ring = np.array([[float(v) for v in c.split(",")[:2]] for c in re.search(r"<coordinates>(.*?)</coordinates>", t, re.S).group(1).split()])
        up = Polygon(np.c_[ring[:, 0] * lm[0], ring[:, 1] * lm[1]]).buffer(0)
        out["user_kml_area_ha"] = round(up.area / 1e4, 2)
        out["parcel_IoU"] = round(his_poly.intersection(up).area / his_poly.union(up).area, 3)
        out["his_parcel_inside_user_kml_frac"] = round(his_poly.intersection(up).area / his_poly.area, 3)
        dc = np.array(his_poly.centroid.coords[0]) - np.array(up.centroid.coords[0])
        out["centroid_offset_m_east_north"] = [round(float(dc[0]), 1), round(float(dc[1]), 1)]

m_ = 15
fx = np.array([m_, W - m_, W - m_, m_], float); fy = np.array([m_, m_, H - m_, H - m_], float)
flon, flat_ = px_to_ll(fx, fy)
foot = {"type": "Polygon", "coordinates": [[*zip(flon.tolist(), flat_.tolist()), (flon[0], flat_[0])]]}
cx, cy = float(np.mean(flon)), float(np.mean(flat_)); pad = 0.1
lat_m = 110570.0; lon_m = 111320.0 * math.cos(math.radians(cy))

VARIANT = os.environ.get("VARIANT", "default")
def pf_eps(dem, eps=0.01):
    """Priority-flood fill with a tiny gradient (like SAGA/QGIS 'Fill sinks (Wang & Liu)' with min slope):
    flats and filled hollows become very gently tilted planes, so D8 makes parallel flow paths across them."""
    import heapq
    H_, W_ = dem.shape; out = dem.astype("float64").copy(); closed = np.zeros(dem.shape, bool); hp = []
    for r_ in range(H_):
        for c_ in (0, W_ - 1):
            heapq.heappush(hp, (out[r_, c_], r_, c_)); closed[r_, c_] = True
    for c_ in range(1, W_ - 1):
        for r_ in (0, H_ - 1):
            heapq.heappush(hp, (out[r_, c_], r_, c_)); closed[r_, c_] = True
    nb = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    while hp:
        z, r_, c_ = heapq.heappop(hp)
        for dr, dc in nb:
            a, b2 = r_ + dr, c_ + dc
            if 0 <= a < H_ and 0 <= b2 < W_ and not closed[a, b2]:
                closed[a, b2] = True
                if out[a, b2] <= z: out[a, b2] = z + eps
                heapq.heappush(hp, (out[a, b2], a, b2))
    return out.astype("float32")

def hydrology(path, tag):
    with rasterio.open(path) as src:
        win = from_bounds(cx - pad, cy - pad, cx + pad, cy + pad, src.transform).round_offsets().round_lengths()   # whole cells only
        arr = src.read(1, window=win).astype("float32"); tr = src.window_transform(win); prof = src.profile.copy()
    if (arr < -1000).any():
        bad = arr < -1000; idx = ndi.distance_transform_edt(bad, return_distances=False, return_indices=True); arr = arr[tuple(idx)]
    prof.update(driver="GTiff", height=arr.shape[0], width=arr.shape[1], transform=tr, dtype="float32", nodata=-9999)
    p = f"{OUT}/win_{tag}.tif"
    with rasterio.open(p, "w", **prof) as dst: dst.write(arr, 1)
    if VARIANT == "eps":
        filled = pf_eps(arr)
        p2 = f"{OUT}/win_{tag}_eps.tif"
        with rasterio.open(p2, "w", **prof) as dst: dst.write(filled, 1)
        gr = Grid.from_raster(p2); dem = gr.read_raster(p2)
    else:
        gr = Grid.from_raster(p); dem = gr.read_raster(p)
        dem = gr.resolve_flats(gr.fill_depressions(gr.fill_pits(dem)))
    fdir = gr.flowdir(dem); acc = gr.accumulation(fdir)
    return gr, fdir, acc, np.asarray(acc, float), tr, arr

shifts = [(s * dy, s * dx) for s in (4, 6) for dy, dx in [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)]]
results, nets = {}, {}
EXTRA = [tuple(e.split(":", 1)) for e in os.environ.get("EXTRA", "").split(",") if e]
for tag, path in [("copernicus", COP), ("srtm", SRTM)] + EXTRA:
    gr, fdir, acc_r, acc, tr, dem = hydrology(path, tag)
    nets[tag] = (gr, fdir, acc_r, tr)
    dxm, dym = tr.a * lon_m, -tr.e * lat_m
    fm = features.rasterize([(foot, 1)], out_shape=acc.shape, transform=tr).astype(bool)
    his = np.zeros(acc.shape, bool)
    cols = ((hlon - tr.c) / tr.a).astype(int); rows = ((hlat - tr.f) / tr.e).astype(int)
    his[rows, cols] = True; his &= fm
    d_his = ndi.distance_transform_edt(~his, sampling=(dym, dxm))
    rel = dem[fm]
    rows_t = {}
    for th in [1, 2, 3, 5, 10, 20]:
        strm = acc > th; mine = strm & fm
        d_mine = ndi.distance_transform_edt(~strm, sampling=(dym, dxm))
        row = {"density_ratio_mine_vs_his": round(float(mine.sum()) / max(1, his.sum()), 2)}
        for tol in (31, 61):
            p = float((d_mine[his] <= tol).mean()); rr_ = float((d_his[mine] <= tol).mean()) if mine.any() else 0
            cp = np.mean([float((np.roll(d_mine, s, (0, 1))[his] <= tol).mean()) for s in shifts])
            cr = np.mean([float((np.roll(d_his, s, (0, 1))[mine] <= tol).mean()) for s in shifts]) if mine.any() else 0
            t = f"{tol - 1}m"
            row.update({f"his_on_mine_{t}": round(p, 3), f"chance_his_on_mine_{t}": round(float(cp), 3),
                        f"mine_on_his_{t}": round(rr_, 3), f"chance_mine_on_his_{t}": round(float(cr), 3)})
        rows_t[th] = row
    results[tag] = {"metrics": rows_t, "his_cells": int(his.sum()), "footprint_cells": int(fm.sum()),
                    "elev_range_in_view_m": [round(float(rel.min()), 1), round(float(rel.max()), 1)]}
out["results"] = results
json.dump(out, open(f"{OUT}/compare_{VARIANT}{os.environ.get('SUFFIX','')}.json", "w"), indent=1)

def overlay(tag, th, fname, label):
    gr, fdir, acc_r, tr = nets[tag]
    net = gr.extract_river_network(fdir, acc_r > th)
    img = shot.copy()
    for f in net["features"]:
        c = np.array(f["geometry"]["coordinates"], float)
        lon = c[:, 0] + 0.5 * tr.a; lat = c[:, 1] + 0.5 * tr.e
        x, y = ll_to_px(lon, lat)
        if x.max() < -50 or x.min() > W + 50 or y.max() < -50 or y.min() > H + 50: continue
        cv2.polylines(img, [np.c_[x, y].round().astype(np.int32)], False, (255, 0, 255), 5, cv2.LINE_AA)
    cv2.rectangle(img, (0, 0), (W, 80), (20, 20, 20), -1)
    cv2.putText(img, label, (20, 56), cv2.FONT_HERSHEY_SIMPLEX, 1.6, (255, 255, 255), 3, cv2.LINE_AA)
    cv2.imwrite(fname, img)
TAGV = "" if VARIANT == "default" else "_" + VARIANT
overlay("srtm", 10, f"{OUT}/overlay_srtm10{TAGV}.png", "His lines (cyan) + my SRTM lines (magenta)")
overlay("copernicus", 10, f"{OUT}/overlay_cop10.png", "His lines (cyan) + my Copernicus lines (magenta)")
overlay("srtm", 3, f"{OUT}/overlay_srtm3{TAGV}.png", "His lines (cyan) + my SRTM lines, " + ("tilted-flat fill" if VARIANT == "eps" else "low threshold") + " (magenta)")
overlay("srtm", 2, f"{OUT}/overlay_srtm2{TAGV}.png", "His lines (cyan) + my SRTM lines th2 " + VARIANT + " (magenta)")
for tag, _ in EXTRA:
    overlay(tag, 10, f"{OUT}/overlay_{tag}10.png", f"His lines (cyan) + my {tag} lines (magenta)")
print(json.dumps({k: v for k, v in out.items() if k != "his_parcel_coords"}, indent=1))
