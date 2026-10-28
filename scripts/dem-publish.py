#!/usr/bin/env python3
"""Publish elevation tiles for the Hydrogeology reading to S3. Dry run unless --execute.

    python3 scripts/dem-publish.py --bucket <village_maps_bucket_name> \\
        [--dir ~/india-ref-data-crawlings/elevation] [--lat 12:20] [--lon 76:84] [--execute]

The api (src/terrain.py, TERRAIN_DEM_BUCKET) fetches the 1° tiles it needs from
dem/{source}/{file} on first use and keeps them on its disk. The default box is
Andhra Pradesh (12–20°N, 76–84°E: the state plus the ±0.11° window a reading
reads around a parcel near its edge), about 3.7 GB over the four sources. Each
tile is uploaded once (sync skips what is already there); a parcel outside the
published box answers "There is no elevation map for this area yet."

The tiles are public open data (SRTM, NASADEM, AW3D30, Copernicus GLO-30); the
folder layout is docs/specs/water-flow/prototype/download_dem.py's.
"""
from __future__ import annotations

import argparse
import re
import subprocess
from pathlib import Path

SOURCES = ["srtm", "nasadem", "aw3d30", "copernicus"]
# N15E079.hgt.gz · NASADEM_HGT_n15e079.tif · ALPSMLC30_N015E079_DSM.tif · Copernicus_DSM_COG_10_N15_00_E079_00_DEM.tif
TILE = re.compile(r"[Nn](\d{2,3})(?:_00_)?[Ee](\d{3})")


def span(text: str) -> range:
    lo, hi = (int(v) for v in text.split(":"))
    return range(lo, hi + 1)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--bucket", required=True)
    ap.add_argument("--dir", type=Path, default=Path("~/india-ref-data-crawlings/elevation").expanduser())
    ap.add_argument("--lat", default="12:20", help="whole degrees north, inclusive (default 12:20)")
    ap.add_argument("--lon", default="76:84", help="whole degrees east, inclusive (default 76:84)")
    ap.add_argument("--execute", action="store_true")
    args = ap.parse_args()
    if not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", args.bucket) or "-vm-" not in args.bucket:
        raise SystemExit("--bucket must be the village-maps bucket (…-vm-…)")
    lats, lons = span(args.lat), span(args.lon)

    total = 0
    for src in SOURCES:
        folder = args.dir / src
        names = sorted(p.name for p in folder.iterdir() if p.is_file()
                       and (m := TILE.search(p.name)) and int(m[1]) in lats and int(m[2]) in lons)
        if not names:
            raise SystemExit(f"No {src} tiles for that box in {folder}")
        size = sum((folder / n).stat().st_size for n in names)
        total += size
        print(f"{src:<11} {len(names):>3} tiles  {size / 1e9:.2f} GB")
        cmd = ["aws", "s3", "sync", str(folder), f"s3://{args.bucket}/dem/{src}", "--only-show-errors",
               "--exclude", "*", *[a for n in names for a in ("--include", n)]]
        if args.execute:
            subprocess.run(cmd, check=True)
    print(f"total       {total / 1e9:.2f} GB")
    if not args.execute:
        print("Dry run: nothing sent. Re-run with --execute to upload.")


if __name__ == "__main__":
    main()
