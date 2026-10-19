"""Download 30 m elevation maps (SRTM, NASADEM, AW3D30, Copernicus GLO-30) for every 1-degree tile covering India.
Run from the 'elevation' folder:  python3 download_dem.py   (safe to re-run: finished files are skipped, sizes checked)
Andhra Pradesh tiles come first (tiles_india.csv is sorted that way)."""
import csv, json, os, sys, time, threading, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
PC = "https://planetarycomputer.microsoft.com/api/sas/v1/token/"
_tok, _lock = {}, threading.Lock()

def token(col):
    with _lock:
        t = _tok.get(col)
        if not t or time.time() - t[1] > 1200:            # Planetary Computer tokens last ~45 min; refresh every 20
            j = json.load(urllib.request.urlopen(PC + col, timeout=60))
            _tok[col] = t = (j["token"], time.time())
        return t[0]

def url(src, la, lo):
    if src == "srtm":
        return f"https://s3.amazonaws.com/elevation-tiles-prod/skadi/N{la:02d}/N{la:02d}E{lo:03d}.hgt.gz", f"N{la:02d}E{lo:03d}.hgt.gz"
    if src == "copernicus":
        n = f"Copernicus_DSM_COG_10_N{la:02d}_00_E{lo:03d}_00_DEM"
        return f"https://copernicus-dem-30m.s3.amazonaws.com/{n}/{n}.tif", f"{n}.tif"
    if src == "nasadem":
        n = f"NASADEM_HGT_n{la:02d}e{lo:03d}.tif"
        return f"https://nasademeuwest.blob.core.windows.net/nasadem-cog/v001/{n}?" + token("nasadem"), n
    if src == "aw3d30":
        n = f"ALPSMLC30_N{la:03d}E{lo:03d}_DSM.tif"
        return f"https://ai4edataeuwest.blob.core.windows.net/alos-dem/AW3D30_global/{n}?" + token("alos-dem"), n

def get(job):
    src, la, lo, size = job
    d = os.path.join(HERE, src); os.makedirs(d, exist_ok=True)
    for attempt in range(5):
        try:
            u, name = url(src, la, lo); dst = os.path.join(d, name)
            if os.path.exists(dst) and os.path.getsize(dst) == size:
                return src, name, "skip"
            part = dst + ".part"
            with urllib.request.urlopen(u, timeout=120) as r, open(part, "wb") as f:
                while True:
                    b = r.read(1 << 20)
                    if not b: break
                    f.write(b)
            if os.path.getsize(part) != size:
                raise IOError(f"size {os.path.getsize(part)} != {size}")
            os.replace(part, dst)
            return src, name, "ok"
        except Exception as e:
            err = str(e); time.sleep(5 * (attempt + 1))
    return src, f"{la},{lo}", "FAILED " + err

jobs = []
for r in csv.DictReader(open(os.path.join(HERE, "tiles_india.csv"))):
    la, lo = int(r["lat"]), int(r["lon"])
    for src in ("srtm", "nasadem", "aw3d30", "copernicus"):
        jobs.append((src, la, lo, int(r[f"{src}_bytes"])))

done = 0
with ThreadPoolExecutor(int(os.environ.get("THREADS", "6"))) as ex, open(os.path.join(HERE, "download_log.txt"), "a") as log:
    log.write(f"--- start {time.ctime()} jobs={len(jobs)}\n"); log.flush()
    for src, name, status in ex.map(get, jobs):
        done += 1
        log.write(f"{done}/{len(jobs)} {src} {name} {status}\n"); log.flush()
    log.write(f"--- end {time.ctime()}\n")
