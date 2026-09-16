#!/usr/bin/env python3
"""Build the shipped village maps from the KMZs in data/vm.

    python3 scripts/village-map-import.py data/vm            # the whole folder
    python3 scripts/village-map-import.py data/vm/CHINTHAGUNTA.kmz

Writes one GeoJSON FeatureCollection per village into apps/web/public/vm/,
which Vite serves as a static file, plus the index.json the browser looks a
village up in (it cannot list a directory, and guessing the filename from the
record's own spelling is exactly what broke).

The reading, the label matching and the naming all live in
`services/api/src/villagemap.py`, shared with the API's upload route so that a
map built here and the same map uploaded through the app cannot come out
different.  What is here is the bulk part: several files at once, grouped by
village, with the duplicates called out.

Two files can describe one village — a polygon export and its label sheet, or
the same village exported twice. Only the best set is written: most plots that
end up numbered, then fewest left nameless, then the smaller source. Nothing is
dropped silently; every skipped file is printed with the reason.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# The parser is the API's, so that both ways of importing a village agree.
sys.path.insert(0, str(ROOT / "services" / "api" / "src"))
import villagemap as vm                                    # noqa: E402

OUT_DIR = ROOT / "apps" / "web" / "public" / "vm"


def write_index() -> None:
    """Two manifests, because they answer two questions.

    `index.json` is the lookup: which villages exist and what file each one's
    plots are in. `overview.json` is the mandal map: every village's outline,
    middle, plot count and extent, so the landing page can draw all of them
    without fetching 2.2 MB of plots to do it. All eight outlines together are
    76 KB — a third of one village's geometry — so they are the real edges
    rather than a hull drawn round them."""
    entries = []
    overview = []
    for f in sorted(OUT_DIR.glob("*.geojson")):
        try:
            collection = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            collection = {}
        name = collection.get("village") or f.stem.upper()
        entries.append({"village": name, "file": f.name, "key": vm.village_key(name)})
        if collection.get("features"):
            overview.append({
                "village": name, "file": f.name, "key": vm.village_key(name),
                **vm.overview_of(collection),
            })
    (OUT_DIR / "index.json").write_text(
        json.dumps(entries, separators=(",", ":")), encoding="utf-8")
    (OUT_DIR / "overview.json").write_text(
        json.dumps(overview, separators=(",", ":")), encoding="utf-8")
    print(f"\nindex.json: {len(entries)} village map(s) — "
          + ", ".join(e["village"] for e in entries))
    print(f"overview.json: {(OUT_DIR / 'overview.json').stat().st_size / 1024:.0f} KB "
          f"of outlines for the mandal map")


def expand(args: list[str]) -> list[Path]:
    paths: list[Path] = []
    for arg in args:
        p = Path(arg).expanduser()
        if p.is_dir():
            paths += sorted(q for q in p.iterdir()
                            if q.suffix.lower() in (".kml", ".kmz"))
        else:
            paths.append(p)
    return paths


def main(args: list[str]) -> None:
    sources = [vm.Source(p.name, p.read_bytes()) for p in expand(args)]
    if not sources:
        raise SystemExit("nothing to import")

    groups: dict[str, list[vm.Source]] = {}
    for src in sources:
        groups.setdefault(src.key, []).append(src)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for key in sorted(groups, key=lambda k: groups[k][0].village):
        group = groups[key]
        built, src, others = vm.assemble(group)
        if not built:
            print(f"{group[0].village}: no polygons in "
                  f"{', '.join(s.name for s in group)} — skipped")
            continue

        collection, dropped, clashes = vm.feature_collection(src.village, built["plots"])
        out = OUT_DIR / vm.file_name(src.village)
        out.write_text(vm.dumps(collection), encoding="utf-8")

        corners = sum(len(f["geometry"]["coordinates"][0]) for f in collection["features"])
        print(f"{src.village}: {len(collection['features'])} plots, {corners:,} corners")
        print(f"  from {src.name} "
              f"({src.bytes / 1e6:.1f} MB -> {out.stat().st_size / 1e6:.2f} MB)")
        if built["within"] or built["near"]:
            froms = ", ".join(s.name for s in group if s.labels)
            print(f"  {built['within']} plot numbers recovered from labels in {froms}")
            if built["near"]:
                print(f"  {built['near']} more taken from the nearest label — "
                      f"plots bent so their own centre falls outside them")
        if dropped:
            print(f"  {dropped} shape(s) dropped: no plot number of their own")
        if clashes:
            print(f"  {clashes} plot number(s) claimed by more than one shape")
        for other in others:
            why = "labels only" if not other.plots else "same village, less complete"
            print(f"  duplicate: {other.name} not used ({why})")

    write_index()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    main(sys.argv[1:])
