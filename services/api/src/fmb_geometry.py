"""Turning an FMB corner table into a measurable polygon.

From the founder's Vault Maps Design: the reader (LLM) extracts the corner
table, the printed side lengths and the header EXACTLY as printed; everything
after that is deterministic and happens here — deriving the ring, the
per-side lengths and bearings, the area, and the cross-checks. The client
computes nothing except unit conversion (§13: the stored shape ships with
the document record).

The ring derivation follows §3's ladder:
  1. drawing order (vector-stream parse) — not implemented yet; when it is,
     order_source becomes "drawing".
  2. printed lengths — build the graph of point pairs whose computed
     distance matches a printed label within 0.5 m; the Hamiltonian cycle
     through those edges is the ring. Sheets round (a printed 60 against a
     computed 58.04 happens on the founder's own sheet), so the cycle is
     completed with best-fit pairs when strict matches leave gaps.
  3. angular sort around the centroid — last resort, wrong for concave
     parcels; marked order_source "inferred" so the UI asks for confirmation.
"""

from __future__ import annotations

import math
import re
from itertools import combinations

# 1 acre = 4046.8564224 m² and 1 m = 3.280839895 ft, exactly (§5).
SQ_M_PER_ACRE = 4046.8564224

# §3: a printed label matches a computed distance within 0.5 m.
MATCH_TOLERANCE_M = 0.5


def parse_ac_cents(text: str) -> float | None:
    """"Ac 197-05 Cent" -> 197.05, "Ac 60.00 Cent" -> 60.00.

    The acres-cents dash convention: the number after the dash is CENTS
    (hundredths of an acre), not a decimal — "Ac 25-00" is twenty-five acres.
    """
    if not text:
        return None
    s = str(text).strip()
    m = re.search(r"(\d+(?:\.\d+)?)\s*[-–]\s*(\d{1,2})(?:\.\d+)?", s)
    if m:
        return float(m.group(1)) + float(m.group(2)) / 100.0
    m = re.search(r"(\d+(?:\.\d+)?)", s)
    return float(m.group(1)) if m else None


def _dist(a: dict, b: dict) -> float:
    return math.hypot(b["e"] - a["e"], b["n"] - a["n"])


def _bearing(a: dict, b: dict) -> float:
    """Grid bearing, clockwise from north: atan2(dE, dN), 0–360 (§2)."""
    deg = math.degrees(math.atan2(b["e"] - a["e"], b["n"] - a["n"]))
    return deg % 360.0


def _hamiltonian_cycle(ids: list, allowed: set) -> list | None:
    """The unique-enough cycle through every point using allowed edges."""
    if not ids:
        return None
    start = ids[0]
    rest = set(ids[1:])

    def extend(path: list, remaining: set):
        last = path[-1]
        if not remaining:
            return path if frozenset((last, start)) in allowed else None
        for nxt in sorted(remaining):
            if frozenset((last, nxt)) in allowed:
                found = extend(path + [nxt], remaining - {nxt})
                if found:
                    return found
        return None

    return extend([start], rest)


def _derive_ring(points: list, printed: list) -> tuple[list | None, str]:
    """Ring order from printed lengths (§3.2), angular sort as last resort."""
    ids = [p["id"] for p in points]
    by_id = {p["id"]: p for p in points}

    # Every pair whose distance matches SOME printed label, strictly.
    edges = set()
    for a, b in combinations(ids, 2):
        d = _dist(by_id[a], by_id[b])
        if any(abs(d - length) <= MATCH_TOLERANCE_M for length in printed):
            edges.add(frozenset((a, b)))

    ring = _hamiltonian_cycle(ids, edges)
    if ring:
        return ring, "lengths"

    # Sheets round (the founder's own sheet prints 60 against a computed
    # 58.04): add the single globally best remaining length↔pair fit, retry
    # the cycle, and repeat — one edge at a time, so a rounding gap closes
    # without flooding the graph with spurious edges.
    claimed = {frozenset((a, b)) for a, b in combinations(ids, 2)
               if frozenset((a, b)) in edges}
    lengths_left = list(printed)
    for length in list(lengths_left):
        if any(abs(_dist(by_id[a], by_id[b]) - length) <= MATCH_TOLERANCE_M
               for a, b in combinations(ids, 2)):
            lengths_left.remove(length)
    for _ in range(len(ids)):
        best, best_err, best_len = None, None, None
        for length in lengths_left:
            for a, b in combinations(ids, 2):
                pair = frozenset((a, b))
                if pair in claimed:
                    continue
                err = abs(_dist(by_id[a], by_id[b]) - length)
                if best_err is None or err < best_err:
                    best, best_err, best_len = pair, err, length
        if best is None:
            break
        edges.add(best)
        claimed.add(best)
        lengths_left.remove(best_len)
        ring = _hamiltonian_cycle(ids, edges)
        if ring:
            return ring, "lengths"

    # Last resort — angular sort around the centroid. Wrong for concave
    # parcels, so it is MARKED and the UI asks the user to confirm.
    cx = sum(p["e"] for p in points) / len(points)
    cy = sum(p["n"] for p in points) / len(points)
    ring = sorted(ids, key=lambda i: math.atan2(by_id[i]["e"] - cx, by_id[i]["n"] - cy))
    return ring, "inferred"


def _canonical(ring: list, by_id: dict) -> list:
    """Start at the northernmost corner and run clockwise — the same sheet
    always yields the same ring, whatever order the search found it in."""
    start = max(ring, key=lambda i: by_id[i]["n"])
    k = ring.index(start)
    ring = ring[k:] + ring[:k]
    # Shoelace sign: positive = counter-clockwise in E/N — flip to clockwise.
    area2 = sum(
        by_id[ring[i]]["e"] * by_id[ring[(i + 1) % len(ring)]]["n"]
        - by_id[ring[(i + 1) % len(ring)]]["e"] * by_id[ring[i]]["n"]
        for i in range(len(ring))
    )
    if area2 > 0:
        ring = [ring[0]] + list(reversed(ring[1:]))
    return ring


def utm_zone_epsg(lon: float) -> str:
    """EPSG for the northern-hemisphere UTM zone containing this longitude."""
    zone = int((lon + 180) // 6) + 1
    return f"EPSG:{32600 + zone}"


def _beyond(bearing: float, neighbours: dict) -> str:
    """Whose land lies beyond a side (§6): the outward normal of a clockwise
    ring is bearing − 90°, and its compass sector picks the sheet's own
    neighbour name — Jangamreddypalle to the north, Obayapalle to the east."""
    if not neighbours:
        return ""
    outward = (bearing - 90.0) % 360.0
    if outward >= 315.0 or outward < 45.0:
        key = "north"
    elif outward < 135.0:
        key = "east"
    elif outward < 225.0:
        key = "south"
    else:
        key = "west"
    return str(neighbours.get(key, "") or "")


def build_geometry(
    points: list,
    printed_lengths: list,
    red_lengths: list | None = None,
    sheet_extent_text: str = "",
    field_extent_text: str = "",
    datum_stated: bool = False,
    neighbours: dict | None = None,
) -> dict | None:
    """The §13 stored shape, from what the reader read off the sheet.

    points: [{"id", "e", "n", "lat", "lon"}] — printed decimals, unrounded.
    printed_lengths: every side length printed on the sheet, in metres.
    red_lengths: the lengths drawn in red — measured lines, not walked
        boundaries; their sides carry state "measured_only".
    sheet_extent_text / field_extent_text: the extents as written ("Ac 60.00
        Cent", "Ac 197-05 Cent") for the area cross-check.
    """
    if len(points) < 3:
        return None
    pts = []
    for p in points:
        try:
            pts.append({
                "id": int(p["id"]),
                "e": float(p["e"]), "n": float(p["n"]),
                "lat": float(p.get("lat", 0) or 0), "lon": float(p.get("lon", 0) or 0),
            })
        except (KeyError, TypeError, ValueError):
            return None
    printed = [float(x) for x in printed_lengths if x]
    red = {round(float(x), 2) for x in (red_lengths or [])}
    by_id = {p["id"]: p for p in pts}

    ring, order_source = _derive_ring(pts, printed)
    if not ring:
        return None
    ring = _canonical(ring, by_id)

    # Sides: computed length is the truth, the printed label rides along —
    # raw survives derivation, the same rule as everywhere else.
    remaining = list(printed)
    sides = []
    for i, a in enumerate(ring):
        b = ring[(i + 1) % len(ring)]
        m = _dist(by_id[a], by_id[b])
        printed_m = None
        best_err = None
        for length in remaining:
            err = abs(m - length)
            if best_err is None or err < best_err:
                printed_m, best_err = length, err
        if printed_m is not None:
            remaining.remove(printed_m)
        bearing = round(_bearing(by_id[a], by_id[b]), 1)
        sides.append({
            "from": a, "to": b,
            "m": round(m, 2),
            "printed_m": printed_m,
            "bearing": bearing,
            "beyond": _beyond(bearing, neighbours or {}),
            "state": "measured_only"
                     if printed_m is not None and round(printed_m, 2) in red
                     else "surveyed",
        })

    area2 = sum(
        by_id[ring[i]]["e"] * by_id[ring[(i + 1) % len(ring)]]["n"]
        - by_id[ring[(i + 1) % len(ring)]]["e"] * by_id[ring[i]]["n"]
        for i in range(len(ring))
    )
    area_m2 = abs(area2) / 2.0
    area_ac = area_m2 / SQ_M_PER_ACRE
    perimeter = sum(s["m"] for s in sides)

    lon0 = pts[0]["lon"]
    geometry = {
        "crs": {
            "projected": utm_zone_epsg(lon0) if lon0 else "unstated",
            "geographic": "EPSG:4326",
            "datum_stated": bool(datum_stated),
        },
        "order_source": order_source,
        "ring": ring,
        "points": [{"id": p["id"], "e": p["e"], "n": p["n"],
                    "lat": p["lat"], "lon": p["lon"]} for p in pts],
        "sides": sides,
        "area_m2": round(area_m2),
        "area_ac": round(area_ac, 2),
        "perimeter_m": round(perimeter, 1),
        # A ring built from the table closes by construction; a drawing-order
        # path may not, and then the gap is SHOWN, never silently closed.
        "closure_m": 0.0,
        "checks": [],
    }

    # §7 — three numbers always shown together, then a verdict.
    sheet_ac = parse_ac_cents(sheet_extent_text)
    if sheet_ac:
        delta_pct = abs(area_ac - sheet_ac) / sheet_ac * 100.0
        geometry["checks"].append({
            "code": "area_vs_sheet",
            "ok": delta_pct < 0.5,
            "delta_pct": round(delta_pct, 2),
            "sheet_ac": sheet_ac,
        })
    field_ac = parse_ac_cents(field_extent_text)
    if field_ac and sheet_ac and sheet_ac > field_ac:
        geometry["checks"].append({
            "code": "portion_exceeds_field",
            "ok": False,
            "sheet_ac": sheet_ac,
            "field_ac": field_ac,
        })
    return geometry


def _num(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def attach_geometry(fields: dict) -> None:
    """Embed the §13 geometry into a reading whose sheet gave up a corner
    table. Mutates ``fields`` in place; a sheet without the table (a scanned
    FMB, a deed) is left untouched — the raster path is section 12's problem.

    Reads only keys the reader itself emits, tolerantly: the map screens
    compute nothing except unit conversion, so everything they render must
    be settled here, once."""
    doc_type = str(fields.get("doc_type", "")).lower()
    if not any(k in doc_type for k in ("fmb", "map", "tippon", "field measurement")):
        return
    rows = fields.get("boundary_points") or []
    points = []
    for i, row in enumerate(rows):
        if not isinstance(row, dict):
            return
        e = _num(row.get("easting", row.get("e")))
        n = _num(row.get("northing", row.get("n")))
        lat = _num(row.get("lat", row.get("latitude"))) or 0.0
        lon = _num(row.get("lng", row.get("lon", row.get("longitude")))) or 0.0
        if e is None or n is None:
            return  # lat/lng-only rows are the old shape — nothing to build on
        pid = row.get("id")
        points.append({"id": int(pid) if _num(pid) is not None else i + 1,
                       "e": e, "n": n, "lat": lat, "lon": lon})
    printed = [x for x in (_num(v) for v in fields.get("printed_side_lengths") or []) if x]
    red = [x for x in (_num(v) for v in fields.get("red_line_lengths") or []) if x]
    neighbours = {str(k).lower(): v for k, v in (fields.get("boundaries") or {}).items()
                  if isinstance(fields.get("boundaries"), dict)}
    geometry = build_geometry(
        points, printed, red_lengths=red,
        sheet_extent_text=str(fields.get("portion_extent") or fields.get("extent") or ""),
        field_extent_text=str(fields.get("parent_survey_extent") or ""),
        # Lat/long columns printed on the sheet pin the geographic system;
        # a sheet with only easting/northing leaves the datum unstated and
        # the map shows a caution instead of overlaying imagery silently.
        datum_stated=any(p["lat"] and p["lon"] for p in points),
        neighbours=neighbours,
    )
    if geometry:
        fields["geometry"] = geometry
