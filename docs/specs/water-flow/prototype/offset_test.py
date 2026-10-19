"""Is there a systematic shift between his lines and mine? Search offsets of his line points.
Usage: python3 -I offset_test.py screenshot.png georef.json frame.json out_dir/win_srtm.tif 10   (win_*.tif is written by compare_with_consultant.py)
"""
import sys, json, math
import numpy as np
if not hasattr(np, "in1d"):
    np.in1d = lambda a, b, **k: np.isin(a, b, **k)
import cv2
from scipy import ndimage as ndi
from skimage.morphology import skeletonize
from pysheds.grid import Grid

SHOT, GEO, MOS, WIN, TH = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5])
geo = json.load(open(GEO)); mos = json.load(open(MOS))
M = np.array(geo["M"]); x0c, y0c, x1c, y1c = geo["crop"]; N = 256 * 2 ** mos["zoom"]
shot = cv2.imread(SHOT)[y0c:y1c, x0c:x1c]
b, g, r = [c.astype(int) for c in cv2.split(shot)]
cyan = ndi.binary_opening((g > 150) & (b > 150) & (r < 160) & (g - r > 50), np.ones((2, 2)))
py, px = np.nonzero(skeletonize(cyan))
p = np.c_[px, py, np.ones(len(px))] @ M.T
X = mos["x0"] * 256 + p[:, 0]; Y = mos["y0"] * 256 + p[:, 1]
lon = X / N * 360 - 180; lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * Y / N))))

gr = Grid.from_raster(WIN); dem = gr.read_raster(WIN)
dem = gr.resolve_flats(gr.fill_depressions(gr.fill_pits(dem)))
acc = np.asarray(gr.accumulation(gr.flowdir(dem)), float); tr = gr.affine
lat_m = 110570.0; lon_m = 111320.0 * math.cos(math.radians(lat.mean()))
dxm, dym = tr.a * lon_m, -tr.e * lat_m
d = ndi.distance_transform_edt(~(acc > TH), sampling=(dym, dxm))

def score(ex, ny, tol):
    la = lat + ny / lat_m; lo = lon + ex / lon_m
    rr = (la - tr.f) / tr.e - 0.5; cc = (lo - tr.c) / tr.a - 0.5          # fractional cell-centre coords
    v = ndi.map_coordinates(d, [rr, cc], order=1)
    return float((v <= tol).mean()), float(np.median(v))

base = score(0, 0, 15)
grid = [(ex, ny) + score(ex, ny, 15) for ex in range(-45, 46, 3) for ny in range(-45, 46, 3)]
best = max(grid, key=lambda t: (t[2], -t[3]))
print(json.dumps({"threshold": TH, "his_points": len(lon),
                  "no_shift": {"within_15m": round(base[0], 3), "median_dist_m": round(base[1], 1)},
                  "best_shift_east_north_m": [best[0], best[1]],
                  "best": {"within_15m": round(best[2], 3), "median_dist_m": round(best[3], 1)}}))
