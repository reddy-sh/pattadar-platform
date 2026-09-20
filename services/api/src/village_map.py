"""Reading a village's cadastral KML into plots the app can use.

The survey department issues a revenue village as a KMZ written for desktop
GIS: one polygon per survey plot, coordinates at 15 decimal places, wrapped in
a zip. CHINTHAGUNTA is 2,100 plots and 4 MB. What the map wants is a flat list
of rings at a sane precision, each carrying the plot number a record can be
matched against.

Three things stand in the way, and all three are handled here:

  * **Precision.** The 7th decimal is a centimetre; the 15th is smaller than an
    atom. Six (~0.11 m, finer than any FMB corner) is lossless for this purpose
    and removes over half the bytes.
  * **The plot number is often not on the plot.** The department's older
    exports carry polygons in one layer and their numbers in another, as label
    points floating over them — so a straight conversion yields 219 shapes all
    called "Burada Palem" and "find plot 74" finds nothing. The numbers are
    recovered by asking which polygon each label stands in.
  * **The village's name is not reliably anywhere.** One file is called
    `Ramayanakadnrika`, its folder says `Ramayanakadrika`, and the shapefile
    path it came from says `Ramayanam Kandrika`. A working copy is called
    `asw.kml`. Every name in the file is a candidate and the best one wins.

This module is the single implementation, shared by
`scripts/village-map-import.py` (bulk, writes static files) and the API's
upload route (one file at a time, writes a row). A KMZ that imports one way
must import identically the other, or a map uploaded from the phone disagrees
with the same map built at the desk.
"""
from __future__ import annotations

import io
import json
import math
import re
import zipfile

# 6 decimals is ~0.11 m at this latitude — finer than a surveyor's corner.
PRECISION = 6

# Words an export puts around the village name. "VILLAGE" is deliberately not
# here: it turns up as a folder in a Windows path, which is handled by taking
# the last segment, and stripping it would maim a village actually called one.
BOILERPLATE = {"LPM", "SHAPE", "FILE", "FILES", "FINAL", "RESURVEY", "SURVEY",
               "KML", "KMZ", "LABEL", "LABELS", "MAP", "MAPS", "COPY", "NEW",
               "OLD", "DATA", "EXPORT"}

# What Google Earth calls a shape somebody drew by hand and never named —
# "Untitled placemark", "Untitled measurement", and the rest of the family. It
# is not a plot number, on a polygon or on a label. Letting two of them through
# scored a hand-drawn triangle as a numbered plot, and that one phantom plot
# won its 806 KB working copy the village over the department's own 30 KB
# export.
NON_NAMES = {"", "new placemark"}

# What a plot number is allowed to look like: the department numbers plots
# `74`, `74/1`, `74-A`, `74 A` and nothing else. The value is read out of a
# file anybody may upload and then served to everybody who opens the village,
# so it is held to this rather than taken on the file's word.
LP = re.compile(r"^[0-9A-Za-z/\- .]{1,32}$")

# A KMZ is a zip and a zip states its own unpacked size, which a crafted one
# lies about: cadastral XML deflates past 1000:1, so a file inside the upload
# route's 12 MB cap can claim gigabytes. The largest village the department
# ships is 4 MB.
KML_MAX = 64 * 1024 * 1024


def is_plot_name(txt: str) -> bool:
    low = (txt or "").strip().lower()
    return bool(low) and low not in NON_NAMES and not low.startswith("untitled")


# ── Reading ───────────────────────────────────────────────────────────

def kml_from_bytes(data: bytes) -> str:
    """The KML text out of either form. A KMZ is a zip whose first two bytes
    say so; anything else is taken as the XML itself.

    The member is read incrementally under KML_MAX, the declared size being
    only the first of the two checks: it is the zip's own claim."""
    if data[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            info = next((i for i in z.infolist()
                         if i.filename.lower().endswith(".kml")), None)
            if info is None:
                raise ValueError("that KMZ holds no .kml")
            if info.file_size > KML_MAX:
                raise ValueError("the .kml in that KMZ unpacks to more than 64 MB")
            with z.open(info) as member:
                kml = member.read(KML_MAX + 1)
            if len(kml) > KML_MAX:
                raise ValueError("the .kml in that KMZ unpacks to more than 64 MB")
            return kml.decode("utf-8", "replace")
    return data.decode("utf-8", "replace")


def placemarks(kml: str) -> list[str]:
    return re.findall(r"<Placemark\b.*?</Placemark>", kml, re.S)


def ring_of(block: str) -> list[list[float]]:
    """The outer ring as [[lon, lat], …], GeoJSON's own order.

    Inner rings (holes) are dropped: one plot in eight thousand has one, and
    the map draws an outline, not a fill."""
    m = re.search(r"<outerBoundaryIs>.*?<coordinates>(.*?)</coordinates>", block, re.S)
    if not m:
        return []
    out: list[list[float]] = []
    for tok in m.group(1).split():
        parts = tok.split(",")
        if len(parts) < 2:
            continue
        try:
            lon, lat = round(float(parts[0]), PRECISION), round(float(parts[1]), PRECISION)
        except ValueError:
            continue
        # Consecutive duplicates carry no shape and cost bytes.
        if out and out[-1] == [lon, lat]:
            continue
        out.append([lon, lat])
    return out


def point_of(block: str) -> tuple[float, float] | None:
    """A label's own coordinate. Taken from <Point> only — a plot placemark is
    usually a MultiGeometry holding its polygon AND its label, and that point
    must not be mistaken for a free-standing label."""
    m = re.search(r"<Point>.*?<coordinates>(.*?)</coordinates>", block, re.S)
    if not m:
        return None
    parts = m.group(1).strip().split(",")
    if len(parts) < 2:
        return None
    try:
        return float(parts[0]), float(parts[1])
    except ValueError:
        return None


def data_fields(block: str) -> dict:
    """The <Data name=…><value>…</value> pairs a cadastral export carries."""
    fields = {}
    for name, value in re.findall(
            r'<Data name="([^"]+)">\s*<value>(.*?)</value>', block, re.S):
        fields[name.strip()] = value.strip()
    return fields


def name_of(block: str) -> str:
    m = re.search(r"<name>(.*?)</name>", block, re.S)
    return m.group(1).strip() if m else ""


def outer_names(kml: str) -> list[str]:
    """Every <name> that is not a placemark's — the document and folder names,
    which is where an export that names its plots "1", "2", "3" hides the name
    of the village they are in."""
    return [n.strip() for n in
            re.findall(r"<name>(.*?)</name>", re.sub(
                r"<Placemark\b.*?</Placemark>", "", kml, flags=re.S), re.S)]


# ── Naming ────────────────────────────────────────────────────────────

def clean_name(raw: str) -> str:
    r"""A candidate village name, stripped of everything that is not one.

    Handles the four shapes these files actually use: a plain name, a Windows
    shapefile path (`E:\Klk\…\Madalavari Palem`), a departmental code
    (`0811014_MARRIPALEM`) and a name wearing its export's job title
    (`AMBAPURAM LPM SHAPE FILE`)."""
    txt = (raw or "").strip()
    if "\\" in txt or "/" in txt:
        txt = re.split(r"[\\/]", txt)[-1]
    txt = re.sub(r"\.(kml|kmz)$", "", txt, flags=re.I)
    txt = re.sub(r"[_\-]+", " ", txt)
    txt = re.sub(r"^\s*\d+\s+", "", txt)                    # 0811014 MARRIPALEM
    words = [w for w in txt.upper().split() if w not in BOILERPLATE]
    return re.sub(r"\s+", " ", " ".join(words)).strip()


def is_name(txt: str) -> bool:
    """Fewer than four letters is a working title, not a village: `asw.kml`,
    `hmm1`, `shp`. Every real name here clears it by a mile."""
    return len(re.sub(r"[^A-Za-z]", "", txt)) >= 4


def village_of(stem: str, kml: str) -> str:
    """The village a file is about.

    Every name in the file is a candidate, including the file's own — they
    disagree, and not by accident. The longest surviving candidate wins, which
    picks the one spelled out rather than run together or cut short. The
    filename breaks a tie, being the one a human chose."""
    best, best_len = "", -1
    for raw in [stem, *outer_names(kml)]:
        cand = clean_name(raw)
        if not is_name(cand):
            continue
        letters = len(re.sub(r"[^A-Za-z]", "", cand))
        if letters > best_len:
            best, best_len = cand, letters
    return best or (stem or "").upper()


def village_key(name: str) -> str:
    """The Python twin of villageKey() in packages/core.

    Telugu names transliterate several ways and the records disagree with the
    department: a parcel filed in "Chintagunta" against a shape file called
    "CHINTHAGUNTA" lost its village map over one letter. Keep the two in step.
    """
    out = re.sub(r"[^a-z]", "", (name or "").lower())
    out = re.sub(r"([tdbgkp])h", r"\1", out)
    return re.sub(r"(.)\1+", r"\1", out)


# ── One file, read into plots and floating labels ─────────────────────

class Source:
    def __init__(self, name: str, data: bytes) -> None:
        kml = kml_from_bytes(data)
        self.name = name
        self.stem = re.sub(r"\.(kml|kmz)$", "", name, flags=re.I)
        self.bytes = len(data)
        self.village = village_of(self.stem, kml)
        self.key = village_key(self.village)
        self.plots: list[dict] = []
        self.labels: list[tuple[float, float, str]] = []

        for block in placemarks(kml):
            ring = ring_of(block)
            if len(ring) >= 4:                  # a closed triangle is the minimum
                fields = data_fields(block)
                label = name_of(block)
                # A polygon whose name is the village's own is not labelled at
                # all — that is the export writing the layer name onto every
                # shape in it, and it is the case the matcher below exists for.
                if village_key(label) == self.key or not is_plot_name(label):
                    label = ""
                plot = {"lp": (fields.get("lp_no") or label).strip(), "ring": ring}
                # Extent travels along: it is how a record checks that the plot
                # it picked is the size its paper says it owns. `area` is the
                # older exports' name for the same acres — verified against the
                # polygons themselves, not assumed.
                for key, out in (("extent_ac", "ac"), ("area", "ac"),
                                 ("chaltha_no", "chaltha")):
                    if fields.get(key) and out not in plot:
                        plot[out] = fields[key]
                self.plots.append(plot)
                continue
            pt = point_of(block)
            if pt and is_plot_name(name_of(block)):
                self.labels.append((pt[0], pt[1], name_of(block)))

    @property
    def numbered(self) -> int:
        return sum(1 for p in self.plots if p["lp"])

    def __repr__(self) -> str:
        return (f"{self.name} [{self.village}] {len(self.plots)} plots, "
                f"{len(self.labels)} labels")


# ── Matching labels to plots ──────────────────────────────────────────

def inside(pt: tuple[float, float], ring: list[list[float]]) -> bool:
    """Ray casting. A label sits well inside its plot — these are centroids
    written by the export — so the vertex cases do not arise in practice."""
    x, y = pt
    hit = False
    for i in range(len(ring)):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % len(ring)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1:
            hit = not hit
    return hit


def apply_labels(plots: list[dict], labels: list[tuple[float, float, str]]) -> tuple[int, int]:
    """Give every unnamed plot the label that belongs to it. Returns
    (labels standing inside their plot, labels claimed by nearness).

    Containment first, and it settles almost everything. Pairing by position in
    the file is tempting and wrong: it agrees with containment for 726 of the
    731 plots in the Hanumanthunipadu export, and those five would be five
    plots wearing their neighbour's number — the one error this must not make.

    Then the leftovers, which are not noise but geometry: a plot bent into an L
    has its own centre outside itself, so the export's label sits just off the
    shape. Each remaining plot takes the nearest label nobody else claimed, and
    only one falling within the plot's own bounding box grown by a fifth — near
    enough to be its own, never near enough to be next door's."""
    pending = [p for p in plots if not p["lp"]]
    if not pending or not labels:
        return 0, 0

    boxes = []
    for p in pending:
        xs = [c[0] for c in p["ring"]]
        ys = [c[1] for c in p["ring"]]
        boxes.append((min(xs), min(ys), max(xs), max(ys)))

    taken = set()
    within = 0
    for j, (x, y, text) in enumerate(labels):
        for i, p in enumerate(pending):
            if p["lp"]:
                continue
            x0, y0, x1, y1 = boxes[i]
            if not (x0 <= x <= x1 and y0 <= y <= y1):
                continue
            if inside((x, y), p["ring"]):
                p["lp"] = text
                taken.add(j)
                within += 1
                break

    near = 0
    spare = [(j, *lab) for j, lab in enumerate(labels) if j not in taken]
    for i, p in enumerate(pending):
        if p["lp"] or not spare:
            continue
        x0, y0, x1, y1 = boxes[i]
        mx, my = (x1 - x0) * 0.2, (y1 - y0) * 0.2
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        best = None
        for k, (_j, x, y, text) in enumerate(spare):
            if not (x0 - mx <= x <= x1 + mx and y0 - my <= y <= y1 + my):
                continue
            d = (x - cx) ** 2 + (y - cy) ** 2
            if best is None or d < best[0]:
                best = (d, k, text)
        if best:
            p["lp"] = best[2]
            spare.pop(best[1])
            near += 1

    return within, near


# ── Choosing between files that describe one village ──────────────────

def assemble(group: list[Source]) -> tuple[dict, Source, list[Source]]:
    """The best plot set for one village, which file it came from, and the
    files that lost.

    Labels are pooled across the whole group, because the department's older
    exports ship the polygons and their numbers as two separate files. Each
    polygon-bearing file is then tried as the base and scored on what comes
    out: numbered plots first, then plots left nameless, then source size. The
    scoring is what rejects a working copy — a Google Earth save of the same
    village, four times the bytes, carrying one hand-drawn shape that is not a
    plot."""
    labels: list[tuple[float, float, str]] = []
    seen = set()
    for src in group:
        for x, y, text in src.labels:
            sig = (round(x, PRECISION), round(y, PRECISION))
            if sig not in seen:
                seen.add(sig)
                labels.append((x, y, text))

    best = None
    for src in group:
        if not src.plots:
            continue
        plots = [dict(p, ring=list(p["ring"])) for p in src.plots]
        within, near = apply_labels(plots, labels)
        numbered = sum(1 for p in plots if p["lp"])
        score = (numbered, -(len(plots) - numbered), -src.bytes)
        if best is None or score > best[0]:
            best = (score, src, plots, within, near)

    if best is None:
        return {}, group[0], group
    _, src, plots, within, near = best
    return ({"plots": plots, "within": within, "near": near},
            src, [s for s in group if s is not src])


# ── The artefact ──────────────────────────────────────────────────────

def feature_collection(village: str, plots: list[dict]) -> tuple[dict, int, int]:
    """(FeatureCollection, dropped, clashes).

    Plots with no number are dropped, and so are plots whose number is not one
    (LP): this file exists so that "find plot 74" can answer, and a nameless
    shape cannot be found, filed against a record, or told apart from the one
    beside it. Two shapes wearing one number is the failure mode a label
    matcher has — both are kept, because deciding which is right needs the
    department rather than this code, but they are counted so the caller can
    say so."""
    kept, dropped, seen = [], 0, set()
    for p in plots:
        lp = (p["lp"] or "").strip()
        if not lp or not LP.match(lp):
            dropped += 1
            continue
        # The same plot exported twice is one plot.
        sig = (lp, len(p["ring"]), tuple(p["ring"][0]), tuple(p["ring"][-1]))
        if sig in seen:
            dropped += 1
            continue
        seen.add(sig)
        props = {"lp": lp}
        for k in ("ac", "chaltha"):
            if p.get(k):
                props[k] = p[k]
        kept.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [p["ring"]]},
            "properties": props,
        })

    used: dict[str, int] = {}
    for f in kept:
        lp = f["properties"]["lp"]
        used[lp] = used.get(lp, 0) + 1
    clashes = sum(1 for n in used.values() if n > 1)

    return ({"type": "FeatureCollection", "village": village, "features": kept},
            dropped, clashes)


def ring_area_sqm(ring: list) -> float:
    """Geodesic area of a [lat, lon] ring — the same spherical-excess formula
    the record screens use, so a village's acres here and a plot's acres there
    are the same kind of number."""
    if len(ring) < 3:
        return 0.0
    R = 6378137.0
    total = 0.0
    for i, (lat1, lon1) in enumerate(ring):
        lat2, lon2 = ring[(i + 1) % len(ring)]
        total += (math.radians(lon2 - lon1)) * (
            2 + math.sin(math.radians(lat1)) + math.sin(math.radians(lat2)))
    return abs(total * R * R / 2)


def outer_edges(rings: list) -> list:
    """The village's own edge: every plot edge that nothing lies against.

    The Python twin of `outerEdges` in apps/web/src/w360/villageGeom.ts, and
    for the same reason the parser is shared — a village's outline drawn on the
    mandal map and the one drawn under its own plots must be the same line.

    A shared boundary is covered along its whole run by the plots on the other
    side of it, usually by two or three shorter edges rather than one matching
    one. An edge covered for less than half its length is facing open ground.
    """
    edges = []           # (plot, ux, uy, off, lo, hi, a, b, [covered])
    buckets: dict = {}
    for plot, ring in enumerate(rings):
        for i in range(len(ring)):
            ay, ax = ring[i]
            by, bx = ring[(i + 1) % len(ring)]
            dx, dy = bx - ax, by - ay
            length = math.hypot(dx, dy)
            if length < 1e-9:
                continue
            dx, dy = dx / length, dy / length
            if dx < 0 or (dx == 0 and dy < 0):
                dx, dy = -dx, -dy
            e = [plot, dx, dy, dx * ay - dy * ax,
                 min(dx * ax + dy * ay, dx * bx + dy * by),
                 max(dx * ax + dy * ay, dx * bx + dy * by),
                 (ay, ax), (by, bx), 0.0]
            edges.append(e)
            key = int(round(math.degrees(math.atan2(dy, dx)))) % 180
            buckets.setdefault(key, []).append(e)

    for lst in buckets.values():
        lst.sort(key=lambda e: e[3])

    def cover(edge, lst, flip):
        want = -edge[3] if flip else edge[3]
        lo, hi = 0, len(lst)
        while lo < hi:                       # first index with off >= want - tol
            mid = (lo + hi) // 2
            if lst[mid][3] < want - 2e-6:
                lo = mid + 1
            else:
                hi = mid
        i = lo
        while i < len(lst) and lst[i][3] <= want + 2e-6:
            other = lst[i]
            i += 1
            if other[0] == edge[0]:
                continue
            if abs(edge[1] * other[1] + edge[2] * other[2]) < 0.999:
                continue
            a = -other[5] if flip else other[4]
            b = -other[4] if flip else other[5]
            run = min(edge[5], b) - max(edge[4], a)
            if run > 0:
                edge[8] += run

    for key, lst in buckets.items():
        for edge in lst:
            cover(edge, lst, False)
            before = buckets.get((key + 179) % 180)
            after = buckets.get((key + 1) % 180)
            if before:
                cover(edge, before, key == 0)
            if after:
                cover(edge, after, key == 179)

    return [[[round(e[6][0], 5), round(e[6][1], 5)],
             [round(e[7][0], 5), round(e[7][1], 5)]]
            for e in edges if e[8] < (e[5] - e[4]) * 0.5]


def overview_of(collection: dict) -> dict:
    """What the mandal map needs to draw a village it has not opened: its
    outline, where its middle is, how many plots it holds and how many acres
    they add up to.

    Acres exactly as the village's own screen counts them — the department's
    figure where the export states one, measured off the polygon where it does
    not. Two different totals for one village is how a screen loses its
    authority."""
    rings = [[(lat, lon) for lon, lat in f["geometry"]["coordinates"][0]]
             for f in collection.get("features", [])]
    acres = 0.0
    for f, ring in zip(collection.get("features", []), rings):
        try:
            sheet = float(f["properties"].get("ac") or 0)
        except (TypeError, ValueError):
            sheet = 0.0
        acres += sheet if sheet > 0 else ring_area_sqm(ring) / 4046.8564224
    lats = [lat for ring in rings for lat, _ in ring]
    lons = [lon for ring in rings for _, lon in ring]
    return {
        "plots": len(rings),
        "acres": round(acres, 1),
        "centre": [round(sum(lats) / len(lats), 6), round(sum(lons) / len(lons), 6)]
        if lats else [0, 0],
        "outline": outer_edges(rings),
    }


def dumps(collection: dict) -> str:
    """Separators matter at this size: the default ", " costs ~40 KB on a
    2,100-plot village."""
    return json.dumps(collection, separators=(",", ":"))


def file_name(village: str) -> str:
    return f"{village.lower().replace(' ', '-')}.geojson"


def convert(name: str, data: bytes) -> dict:
    """One uploaded file → everything the caller needs to store and report it.

    The single-file path. A file that needs a sibling to be readable — a
    polygon export whose numbers live in a separate label sheet — comes back
    with `numbered` short of `plots`, which is what lets the caller say so
    rather than storing a village of anonymous shapes."""
    src = Source(name, data)
    built, _, _ = assemble([src])
    if not built:
        raise ValueError(f"{name} holds no plot polygons — is it a cadastral export?")
    collection, dropped, clashes = feature_collection(src.village, built["plots"])
    return {
        "village": src.village,
        "key": src.key,
        "file": file_name(src.village),
        "collection": collection,
        "plots": len(collection["features"]),
        "dropped": dropped,
        "clashes": clashes,
        "within": built["within"],
        "near": built["near"],
        "labels": len(src.labels),
        "source": src,
    }
