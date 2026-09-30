#!/usr/bin/env python3
"""Publish a village-map build to the /vm/* bucket. Dry run unless --execute.

    python3 scripts/vm-publish.py --bucket <village_maps_bucket_name> \\
        --distribution <cloudfront_distribution_id> [--dir .local/vm-build] [--execute]

The bucket and distribution come from `terraform output` of the persistent
(village_maps_bucket_name) and runtime (cloudfront_distribution_id) roots. The
build is scripts/village-map-import.py --out .local/vm-build.

Before anything is sent the build is checked as the browser will read it:
catalog.json, index.json and every overview/geojson they name must exist and
parse, and nothing but .json/.geojson under [a-z/] names may be in the folder
(no receipts, no local paths). Then:

  1. geojson files are synced first, long-cached (they are only ever replaced
     at the same key by a corrected edition, and the invalidation covers that);
  2. the manifests (catalog, index, overviews) last, short-cached, so a reader
     never gets a manifest naming a file that is not there yet;
  3. --delete removes keys no longer in the build — the bucket is versioned, so
     a removed or replaced map is recoverable for 90 days;
  4. /vm/* is invalidated.

Uses the AWS CLI with whatever credentials the shell has. Nothing here runs in
CI; publishing reference data is an operator act, recorded by the receipt the
importer wrote and the one this writes to .local/vm-receipts/.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAFE = re.compile(r"^[a-z]+(/[a-z]+)*\.(geo)?json$")
GEO_CACHE = "public, max-age=86400"
MANIFEST_CACHE = "public, max-age=300"


def check(build: Path) -> dict:
    files = sorted(p.relative_to(build).as_posix() for p in build.rglob("*") if p.is_file())
    bad = [f for f in files if not SAFE.match(f)]
    if bad:
        raise SystemExit(f"refusing to publish: unexpected file(s) in the build, e.g. {bad[0]}")
    catalog = json.loads((build / "catalog.json").read_text(encoding="utf-8"))
    index = json.loads((build / "index.json").read_text(encoding="utf-8"))
    overview = json.loads((build / "overview.json").read_text(encoding="utf-8"))
    named = {"catalog.json", "index.json", "overview.json"}
    if {r["key"] for r in overview} != {r["key"] for r in index}:
        raise SystemExit("refusing to publish: global overview and index name different villages")
    for m in catalog:
        named.add(m["overview"])
        json.loads((build / m["overview"]).read_text(encoding="utf-8"))
    for v in index:
        named.add(v["path"])
        if not (build / v["path"]).is_file():
            raise SystemExit(f"index names {v['path']}, which is not in the build")
    stray = sorted(set(files) - named)
    if stray:
        raise SystemExit(f"refusing to publish: {len(stray)} file(s) no manifest names, e.g. {stray[0]}")
    keys = [v["key"] for v in index]
    if len(keys) != len(set(keys)):
        raise SystemExit("refusing to publish: duplicate village keys in index.json")
    return {"files": len(files), "mandals": len(catalog), "villages": len(index),
            "bytes": sum((build / f).stat().st_size for f in files)}


def run(cmd: list[str], execute: bool) -> None:
    print(("RUN " if execute else "WOULD RUN ") + " ".join(cmd))
    if execute:
        subprocess.run(cmd, check=True)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--bucket", required=True)
    ap.add_argument("--distribution", required=True)
    ap.add_argument("--dir", type=Path, default=ROOT / ".local" / "vm-build")
    ap.add_argument("--execute", action="store_true")
    args = ap.parse_args()
    if not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", args.bucket) or "-vm-" not in args.bucket:
        raise SystemExit("--bucket must be the village-maps bucket (…-vm-…)")
    if not re.fullmatch(r"[A-Z0-9]{8,20}", args.distribution):
        raise SystemExit("--distribution must be a CloudFront distribution id")

    build = args.dir.resolve()
    summary = check(build)
    print(json.dumps(summary, indent=1))
    dest = f"s3://{args.bucket}/"
    base = ["aws", "s3", "sync", str(build), dest, "--only-show-errors"]
    run(base + ["--exclude", "*", "--include", "*.geojson",
                "--content-type", "application/json", "--cache-control", GEO_CACHE], args.execute)
    run(base + ["--exclude", "*.geojson",
                "--content-type", "application/json", "--cache-control", MANIFEST_CACHE], args.execute)
    run(base + ["--delete"], args.execute)
    run(["aws", "cloudfront", "create-invalidation", "--distribution-id", args.distribution,
         "--paths", "/vm/*"], args.execute)
    if not args.execute:
        print("Dry run: nothing sent. Re-run with --execute to publish.")
        return
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = ROOT / ".local" / "vm-receipts" / f"publish-{stamp}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"at": stamp, "bucket": args.bucket, "summary": summary}, indent=1))
    print(f"receipt: {out}")


if __name__ == "__main__":
    sys.exit(main())
