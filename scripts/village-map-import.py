#!/usr/bin/env python3
"""Build village maps from survey KMZ exports, addressed state/district/mandal/village.

    # The small fixture the web bundle, dev server and e2e suites use:
    python3 scripts/village-map-import.py data/vm

    # A full build for S3 (scripts/vm-publish.py), newest edition first:
    python3 scripts/village-map-import.py --out .local/vm-build \\
        data/vm "<archive>/Prakasam=data/vm/sources/prakasam-2021.json"

    # Report only, nothing written:
    python3 scripts/village-map-import.py --dry-run --out .local/vm-build ...

Every source is `PATH` or `PATH=MANIFEST`; with no manifest, PATH/placement.json
is read. A manifest places every file under a DISTRICT_CODE-MANDAL_CODE from
services/api/data/mandals.csv (AP-IGRS) — `files` for a flat folder, `mandals`
for a folder of mandal folders — and may pair misspelt label sheets to their
polygon file by hand (`pairings`). Nothing is placed or paired by guess: a file
the manifest does not place is rejected with the reason.

The village name alone is not an address. The 2021 Prakasam archive has
MYLAVARAM in Addanki and in Chimakurthi and POTHAVARAM in four mandals, and a
flat index kept one of each and silently lost the rest. So a map lives at
`mapKey(state, district, mandal, village)` — every segment folded by
villageKey, which also makes it a safe object path:

    <out>/catalog.json                      every mandal: counts, centre, bbox
    <out>/index.json                        every village: names and paths
    <out>/overview.json                     every village outline: global view
    <out>/<state>/<district>/<mandal>/overview.json   that mandal's outlines
    <out>/<state>/<district>/<mandal>/<village>.geojson

The reading, label matching and naming stay in services/api/src/village_map.py,
shared with the API's upload route. When two sources hold one address the
source listed FIRST wins and the other is reported as superseded. Every input
file ends up accepted, a duplicate, superseded or rejected, and the receipt
(.local/vm-receipts/, never published: it holds local paths) proves
input = used + duplicate + superseded + rejected.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# The parser is the API's, so that both ways of importing a village agree.
sys.path.insert(0, str(ROOT / "services" / "api" / "src"))
import village_map as vm                                    # noqa: E402

FIXTURE_OUT = ROOT / "apps" / "web" / "public" / "vm"
RECEIPTS = ROOT / ".local" / "vm-receipts"
DATA = ROOT / "services" / "api" / "data"

# Andhra Pradesh with a margin. A village outside it is a projection or
# lat/lon-order fault, not a village.
AP_BOUNDS = (76.5, 12.4, 85.0, 20.1)   # lon_min, lat_min, lon_max, lat_max


def reference() -> tuple[dict, dict]:
    states = {r["STATE_CODE"]: r["STATE_NAME"].strip()
              for r in csv.DictReader(open(DATA / "states.csv", encoding="utf-8"))}
    mandals = {}
    for r in csv.DictReader(open(DATA / "mandals.csv", encoding="utf-8")):
        mandals[f"{r['DISTRICT_CODE']}-{r['MANDAL_CODE']}"] = {
            "district": r["DISTRICT_NAME"].strip(), "mandal": r["MANDAL_NAME"].strip()}
    return states, mandals


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class Plan:
    """What one source contributes: (mandal id, relative file name, path)."""

    def __init__(self, spec: str, rejects: list) -> None:
        path, _, manifest = spec.partition("=")
        self.root = Path(path).expanduser()
        self.manifest_path = Path(manifest).expanduser() if manifest else self.root / "placement.json"
        if not self.root.is_dir():
            raise SystemExit(f"{self.root}: not a folder")
        if not self.manifest_path.is_file():
            raise SystemExit(f"{self.root}: no manifest ({self.manifest_path} missing) — "
                             "every file must be placed under a mandal")
        self.manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        self.id = self.manifest.get("id") or self.root.name
        self.state = self.manifest.get("state") or "AP"
        self.pairings = self.manifest.get("pairings") or {}
        self.files: list[tuple[str, str, Path]] = []
        if self.manifest.get("layout") == "mandal-folders":
            placed = self.manifest.get("mandals") or {}
            for folder in sorted(p for p in self.root.iterdir() if p.is_dir()):
                for f in sorted(folder.iterdir()):
                    if f.suffix.lower() not in (".kml", ".kmz"):
                        continue
                    rel = f"{folder.name}/{f.name}"
                    if folder.name not in placed:
                        rejects.append({"source": self.id, "file": rel,
                                        "why": "mandal folder not placed in the manifest"})
                        continue
                    self.files.append((placed[folder.name], rel, f))
        else:
            placed = self.manifest.get("files") or {}
            for f in sorted(self.root.iterdir()):
                if f.suffix.lower() not in (".kml", ".kmz"):
                    continue
                if f.name not in placed:
                    rejects.append({"source": self.id, "file": f.name,
                                    "why": "file not placed in the manifest"})
                    continue
                self.files.append((placed[f.name], f.name, f))


def within_ap(collection: dict) -> tuple[bool, list[float]]:
    lons = [c[0] for f in collection["features"] for c in f["geometry"]["coordinates"][0]]
    lats = [c[1] for f in collection["features"] for c in f["geometry"]["coordinates"][0]]
    box = [min(lons), min(lats), max(lons), max(lats)]
    lo_x, lo_y, hi_x, hi_y = AP_BOUNDS
    return lo_x <= box[0] and box[2] <= hi_x and lo_y <= box[1] and box[3] <= hi_y, box


def build(specs: list[str]) -> dict:
    states, mandals = reference()
    rejects: list[dict] = []
    plans = [Plan(s, rejects) for s in specs]

    villages: dict[str, dict] = {}        # map key -> accepted village
    superseded: list[dict] = []
    duplicates: list[dict] = []
    inputs: list[dict] = []

    for plan in plans:
        state_name = states.get(plan.state)
        # Read every placed file once, then group by (mandal, village key).
        read: dict[str, tuple[str, vm.Source]] = {}
        for mandal_id, rel, path in plan.files:
            data = path.read_bytes()
            inputs.append({"source": plan.id, "file": rel, "bytes": len(data), "sha256": sha256(data)})
            if mandal_id not in mandals or not state_name:
                rejects.append({"source": plan.id, "file": rel,
                                "why": f"placement {plan.state}/{mandal_id} is not in the reference data"})
                continue
            try:
                read[rel] = (mandal_id, vm.Source(path.name, data))
            except Exception as exc:  # noqa: BLE001 — reported, never swallowed
                rejects.append({"source": plan.id, "file": rel, "why": f"unreadable: {exc}"[:200]})

        # Hand-made pairings: the label sheet joins its polygon file's village.
        for label, partner in plan.pairings.items():
            if label not in read or partner not in read:
                # Half a pair is not a village; both halves are reported.
                for rel in (label, partner):
                    if rel in read or any(i["file"] == rel and i["source"] == plan.id for i in inputs):
                        rejects.append({"source": plan.id, "file": rel,
                                        "why": "its pairing partner could not be read"})
                    read.pop(rel, None)
                continue
            _, lsrc = read[label]
            _, psrc = read[partner]
            lsrc.village, lsrc.key = psrc.village, psrc.key

        groups: dict[tuple[str, str], list[tuple[str, vm.Source]]] = {}
        for rel, (mandal_id, src) in read.items():
            groups.setdefault((mandal_id, src.key), []).append((rel, src))

        for (mandal_id, _), members in sorted(groups.items()):
            rels = {id(s): r for r, s in members}
            group = [s for _, s in members]
            place = mandals[mandal_id]
            built, src, others = vm.assemble(group)
            if not built:
                for r, _ in members:
                    rejects.append({"source": plan.id, "file": r, "why": "no plot polygons in its group"})
                continue
            collection, dropped, clashes = vm.feature_collection(src.village, built["plots"])
            if not collection["features"]:
                for r, _ in members:
                    rejects.append({"source": plan.id, "file": r,
                                    "why": "every shape is unnumbered — label sheet missing or its labels fall outside the plots"})
                continue
            ok, box = within_ap(collection)
            if not ok:
                for r, _ in members:
                    rejects.append({"source": plan.id, "file": r,
                                    "why": f"outside Andhra Pradesh (bbox {box})"})
                continue
            key = vm.map_key(plan.state, place["district"], place["mandal"], src.village)
            used = [rels[id(src)]] + [rels[id(o)] for o in others if not o.plots]
            dups = [rels[id(o)] for o in others if o.plots]
            if key in villages:
                superseded.append({"key": key, "source": plan.id, "files": used + dups,
                                   "keptFrom": villages[key]["source"]})
                continue
            for d in dups:
                duplicates.append({"source": plan.id, "file": d, "key": key,
                                   "why": "same village, less complete"})
            collection["key"] = key
            villages[key] = {
                "key": key, "source": plan.id, "files": used,
                "state": state_name, "district": place["district"], "mandal": place["mandal"],
                "village": src.village, "collection": collection, "bbox": box,
                "plots": len(collection["features"]), "dropped": dropped, "clashes": clashes,
                "within": built["within"], "near": built["near"],
            }

    return {"plans": plans, "villages": villages, "rejects": rejects,
            "superseded": superseded, "duplicates": duplicates, "inputs": inputs}


def write(result: dict, out: Path) -> dict[str, str]:
    """Write into a fresh sibling folder, then swap it in, so a failed build
    never leaves half a dataset where the last good one was."""
    if out.exists():
        stray = [p for p in out.rglob("*") if p.is_file() and p.suffix not in (".json", ".geojson")]
        if stray:
            raise SystemExit(f"{out} holds files this importer did not write ({stray[0]}); refusing to replace it")
    tmp = out.with_name(out.name + ".building")
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir(parents=True)

    index, by_mandal = [], {}
    for key in sorted(result["villages"]):
        v = result["villages"][key]
        path = f"{key}.geojson"
        target = tmp / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(vm.dumps(v["collection"]), encoding="utf-8")
        row = {"village": v["village"], "key": key, "file": path, "path": path,
               "state": v["state"], "district": v["district"], "mandal": v["mandal"],
               "plots": v["plots"]}
        index.append(row)
        by_mandal.setdefault(key.rsplit("/", 1)[0], []).append(
            {**row, **vm.overview_of(v["collection"])})

    catalog = []
    for prefix, rows in sorted(by_mandal.items()):
        (tmp / prefix / "overview.json").write_text(
            json.dumps(rows, separators=(",", ":")), encoding="utf-8")
        boxes = [result["villages"][r["key"]]["bbox"] for r in rows]
        catalog.append({
            "key": prefix, "overview": f"{prefix}/overview.json",
            "state": rows[0]["state"], "district": rows[0]["district"], "mandal": rows[0]["mandal"],
            "villages": len(rows), "plots": sum(r["plots"] for r in rows),
            "acres": round(sum(r["acres"] for r in rows), 1),
            "centre": [round(sum(r["centre"][0] for r in rows) / len(rows), 6),
                       round(sum(r["centre"][1] for r in rows) / len(rows), 6)],
            "bbox": [min(b[0] for b in boxes), min(b[1] for b in boxes),
                     max(b[2] for b in boxes), max(b[3] for b in boxes)],
        })
    all_overview = [row for rows in by_mandal.values() for row in rows]
    all_overview.sort(key=lambda row: row["key"])
    (tmp / "overview.json").write_text(
        json.dumps(all_overview, separators=(",", ":")), encoding="utf-8")
    (tmp / "index.json").write_text(json.dumps(index, separators=(",", ":")), encoding="utf-8")
    (tmp / "catalog.json").write_text(json.dumps(catalog, separators=(",", ":")), encoding="utf-8")

    if out.exists():
        shutil.rmtree(out)
    tmp.rename(out)
    return {str(p.relative_to(out)): sha256(p.read_bytes())
            for p in sorted(out.rglob("*")) if p.is_file()}


def report(result: dict) -> dict:
    villages = result["villages"].values()
    n_in = len(result["inputs"]) + sum(1 for r in result["rejects"]
                                       if r["why"].endswith("not placed in the manifest"))
    used = sum(len(v["files"]) for v in villages)
    sup = sum(len(s["files"]) for s in result["superseded"])
    dup = len(result["duplicates"])
    rej = len({(r["source"], r["file"]) for r in result["rejects"]})
    keys = [v["key"] for v in villages]
    summary = {
        "filesIn": n_in, "filesUsed": used, "filesDuplicate": dup,
        "filesSuperseded": sup, "filesRejected": rej,
        "balanced": n_in == used + dup + sup + rej,
        "villages": len(keys), "keysUnique": len(keys) == len(set(keys)),
        "mandals": len({k.rsplit("/", 1)[0] for k in keys}),
        "plots": sum(v["plots"] for v in villages),
        "shapesDropped": sum(v["dropped"] for v in villages),
        "plotNumberClashes": sum(v["clashes"] for v in villages),
        "labelsNearestMatch": sum(v["near"] for v in villages),
    }
    return summary


def git_sha() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True,
                              text=True, check=True).stdout.strip()
    except Exception:  # noqa: BLE001
        return ""


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("sources", nargs="+", help="PATH or PATH=MANIFEST, highest priority first")
    ap.add_argument("--out", type=Path, default=FIXTURE_OUT)
    ap.add_argument("--dry-run", action="store_true", help="report only; write nothing")
    ap.add_argument("--receipt", type=Path, help="default .local/vm-receipts/<utc>.json")
    args = ap.parse_args()

    result = build(args.sources)
    summary = report(result)
    print(json.dumps(summary, indent=1))
    for r in result["rejects"]:
        print(f"REJECTED {r['source']}:{r['file']} — {r['why']}")
    for s in result["superseded"]:
        print(f"SUPERSEDED {s['source']}:{s['key']} — kept {s['keptFrom']}")
    if not summary["balanced"] or not summary["keysUnique"]:
        raise SystemExit("reconciliation failed — nothing written")

    outputs = {}
    if not args.dry_run:
        outputs = write(result, args.out.resolve())
        print(f"\nwrote {len(outputs)} files to {args.out}")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    receipt_path = args.receipt or RECEIPTS / f"{stamp}.json"
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.write_text(json.dumps({
        "at": stamp, "gitSha": git_sha(), "mode": "dry-run" if args.dry_run else "write",
        "out": str(args.out),
        "sources": [{"id": p.id, "root": str(p.root), "manifest": str(p.manifest_path),
                     "source": p.manifest.get("source")} for p in result["plans"]],
        "summary": summary, "rejects": result["rejects"], "superseded": result["superseded"],
        "duplicates": result["duplicates"],
        "villages": [{k: v[k] for k in ("key", "source", "files", "plots", "dropped", "clashes", "within", "near")}
                     for v in result["villages"].values()],
        "inputs": result["inputs"], "outputs": outputs,
    }, indent=1), encoding="utf-8")
    print(f"receipt: {receipt_path}")


if __name__ == "__main__":
    main()
