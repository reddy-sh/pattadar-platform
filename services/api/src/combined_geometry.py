"""How several stored survey outlines lie against one another.

A Combined Property is a set of legal records an owner holds together — thirty
acres and thirty acres, two khatas, one piece of ground as far as the owner is
concerned. The records stay separate: each keeps its own survey number, deed,
title chain and boundary. What this module answers is the one question the
combined map has to answer honestly: **do these outlines actually touch?**

It deliberately does NOT union them. A union would be a fourth boundary nobody
surveyed, and the moment it is drawn somebody will print it and take it to an
office. So every relation here is a statement about the coordinates on file —
"these two outlines run alongside each other for 240 m, about 0.4 m apart" —
never a verdict about the ground or the title.

Everything is pure: no database, no clock, no I/O, so the arithmetic that
decides whether two parcels adjoin can be pinned in a test.

Two rules make the numbers mean something:

  1. Degrees are not metres, and a degree of longitude is not a degree of
     latitude. Every comparison happens in a LOCAL METRE plane centred on the
     group, because `villageGeom.ts`'s angular tolerances are calibrated for one
     cadastral mesh and these outlines come from different sources.
  2. A ring is accepted whole or not at all. Dropping one unreadable corner and
     bridging its neighbours yields a polygon that draws convincingly and is
     wrong, which is the dangerous kind — see `to_geojson_ring` in
     fmb_geometry.py, which refuses on the same grounds.
"""

from __future__ import annotations

import math

# WGS84 at the latitudes this product serves (roughly 13–19° N). Good to a few
# parts per thousand over a parcel, which is far inside the tolerances below.
_M_PER_DEG_LAT = 110_574.0
_M_PER_DEG_LON = 111_320.0

#: Two outlines whose nearest points are within this are touching as far as the
#: coordinates can say. Independently traced boundaries — one off an FMB corner
#: table, one drawn over imagery — disagree by a metre or two on the same wall,
#: so this is deliberately looser than the 0.2 m the single-village cadastral
#: mesh uses.
ADJOIN_GAP_M = 3.0
#: …and they must run alongside each other for at least this far. Below it they
#: meet at a corner, and a corner is not a shared boundary: without this every
#: parcel in a four-way junction would "adjoin" every other.
ADJOIN_RUN_M = 6.0
#: cos of ~4°: parallel enough to be two sides of one boundary.
_PARALLEL = 0.9976
#: One outline must reach this far inside the other before it is called an
#: overlap. Below it the pair is two digitisations of the same edge.
OVERLAP_M = 1.5
#: Defensive ceiling. A cadastral ring is 4–60 corners; beyond this something
#: has gone wrong upstream and the safe answer is "unknown", not a locked
#: request.
MAX_CORNERS = 400


def pairs(flat: list) -> list:
    """[lat, lon, lat, lon, …] → [(lat, lon), …]. Odd-length input yields []."""
    if not flat or len(flat) % 2:
        return []
    return [(float(flat[i]), float(flat[i + 1])) for i in range(0, len(flat), 2)]


def valid_ring(flat: list) -> list:
    """The ring as corners, or [] when it cannot be trusted as a whole.

    Rejects what `set_boundary` already rejects at the door — fewer than three
    corners, a non-finite or out-of-range coordinate, (0, 0), which is what an
    unfilled coordinate serialises to — and additionally drops a ring that
    encloses no area, because a collapsed outline cannot be measured against
    anything.
    """
    try:
        corners = pairs(flat)
    except (TypeError, ValueError):
        return []
    if not corners or len(corners) > MAX_CORNERS:
        return []
    # Files store rings closed (RFC 7946); this store keeps them open.
    while len(corners) > 1 and corners[0] == corners[-1]:
        corners.pop()
    corners = [c for i, c in enumerate(corners) if i == 0 or c != corners[i - 1]]
    if len(corners) < 3:
        return []
    for lat, lon in corners:
        if not (math.isfinite(lat) and math.isfinite(lon)):
            return []
        if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
            return []
        if lat == 0 and lon == 0:
            return []
    return corners


def centre_of(rings: list) -> tuple:
    """The origin the local plane is built around: the mean of every corner of
    every ring, so no member is privileged and the distortion is shared."""
    lats = [lat for ring in rings for lat, _ in ring]
    lons = [lon for ring in rings for _, lon in ring]
    if not lats:
        return 0.0, 0.0
    return sum(lats) / len(lats), sum(lons) / len(lons)


def to_metres(ring: list, origin: tuple) -> list:
    """One ring in metres east/north of `origin`.

    A local equirectangular plane, not UTM: over a group of adjoining parcels
    (a few kilometres at most) it is accurate to well under the tolerances
    above, and it needs no projection library in the API image.
    """
    lat0, lon0 = origin
    scale = _M_PER_DEG_LON * math.cos(math.radians(lat0))
    return [((lon - lon0) * scale, (lat - lat0) * _M_PER_DEG_LAT) for lat, lon in ring]


def area_sq_m(metres: list) -> float:
    """Shoelace area of a ring already in metres. Sign is discarded — winding
    is a drawing convention, not a fact about the land."""
    total = 0.0
    for i, (x1, y1) in enumerate(metres):
        x2, y2 = metres[(i + 1) % len(metres)]
        total += x1 * y2 - x2 * y1
    return abs(total) / 2.0


def side_lengths_m(metres: list) -> list:
    """Each side of the ring, in corner order, in metres.

    The same walk `ringSides` makes on the web side, kept here so a combined
    view and a single record cannot disagree about how long a wall is. Rounded
    to whole metres by whoever DRAWS it, not here: an outline traced over
    imagery and stored at six decimals cannot support a centimetre, and the
    record's own boundary screen already prints these whole.
    """
    out = []
    for i, (x1, y1) in enumerate(metres):
        x2, y2 = metres[(i + 1) % len(metres)]
        out.append(math.hypot(x2 - x1, y2 - y1))
    return out


def side_bearings(metres: list) -> list:
    """Each side's compass bearing, degrees clockwise from north, in corner
    order — the direction the record's own side table prints. The plane is
    east/north metres, so north is +y and east is +x: atan2(dx, dy)."""
    out = []
    for i, (x1, y1) in enumerate(metres):
        x2, y2 = metres[(i + 1) % len(metres)]
        out.append(math.degrees(math.atan2(x2 - x1, y2 - y1)) % 360.0)
    return out


def perimeter_m(metres: list) -> float:
    """The whole way round. For adjoining parcels this is each outline's own
    perimeter and NOT a fence line for the pair: the shared wall belongs to
    both, so adding them counts it twice. The screen reports it per survey."""
    return sum(side_lengths_m(metres))


def bounds_of(metres: list) -> tuple:
    """(min_x, min_y, max_x, max_y)."""
    xs = [p[0] for p in metres]
    ys = [p[1] for p in metres]
    return min(xs), min(ys), max(xs), max(ys)


def _box_gap(a: tuple, b: tuple) -> float:
    """Shortest distance between two bounding boxes. The cheap prefilter: two
    parcels in different villages are answered without touching a segment."""
    dx = max(a[0] - b[2], b[0] - a[2], 0.0)
    dy = max(a[1] - b[3], b[1] - a[3], 0.0)
    return math.hypot(dx, dy)


def _segments(metres: list) -> list:
    out = []
    for i, p in enumerate(metres):
        q = metres[(i + 1) % len(metres)]
        if p != q:
            out.append((p, q))
    return out


def _point_segment_m(p: tuple, a: tuple, b: tuple) -> float:
    px, py = p
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    span = dx * dx + dy * dy
    if span <= 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / span))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _segments_cross(a: tuple, b: tuple, c: tuple, d: tuple) -> bool:
    def side(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    d1, d2 = side(c, d, a), side(c, d, b)
    d3, d4 = side(a, b, c), side(a, b, d)
    return ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0))


def _segment_gap(a: tuple, b: tuple, c: tuple, d: tuple) -> float:
    if _segments_cross(a, b, c, d):
        return 0.0
    return min(_point_segment_m(a, c, d), _point_segment_m(b, c, d),
               _point_segment_m(c, a, b), _point_segment_m(d, a, b))


def min_gap_m(one: list, two: list) -> float:
    """Shortest distance between the two outlines' edges."""
    best = float("inf")
    for a, b in _segments(one):
        for c, d in _segments(two):
            gap = _segment_gap(a, b, c, d)
            if gap < best:
                best = gap
                if best == 0.0:
                    return 0.0
    return best if best < float("inf") else 0.0


def parallel_run_m(one: list, two: list, tol: float = ADJOIN_GAP_M) -> float:
    """The longest stretch over which the two outlines run alongside each other.

    A shared boundary is rarely one edge facing one edge: a long wall on this
    side faces two or three shorter ones across it, and the corners on either
    side are metres apart. So this measures OVERLAP ALONG A COMMON DIRECTION
    between near-parallel edges that are within `tol` of each other, which is
    the same reasoning `villageGeom.ts::adjoining` uses in degree space.
    """
    best = 0.0
    for a, b in _segments(one):
        ax, ay = a
        ux, uy = b[0] - ax, b[1] - ay
        length = math.hypot(ux, uy)
        if length <= 0:
            continue
        ux, uy = ux / length, uy / length
        lo_a, hi_a = 0.0, length
        for c, d in _segments(two):
            vx, vy = d[0] - c[0], d[1] - c[1]
            vlen = math.hypot(vx, vy)
            if vlen <= 0:
                continue
            if abs((ux * vx + uy * vy) / vlen) < _PARALLEL:
                continue
            # Perpendicular separation of the other edge from this one's line.
            off_c = -(c[0] - ax) * uy + (c[1] - ay) * ux
            off_d = -(d[0] - ax) * uy + (d[1] - ay) * ux
            if min(abs(off_c), abs(off_d)) > tol:
                continue
            # …and how far they overlap projected onto this edge's direction.
            t_c = (c[0] - ax) * ux + (c[1] - ay) * uy
            t_d = (d[0] - ax) * ux + (d[1] - ay) * uy
            run = min(hi_a, max(t_c, t_d)) - max(lo_a, min(t_c, t_d))
            if run > best:
                best = run
    return max(0.0, best)


def _inside(point: tuple, metres: list) -> bool:
    x, y = point
    hit = False
    for i, (x1, y1) in enumerate(metres):
        x2, y2 = metres[(i + 1) % len(metres)]
        if (y1 > y) != (y2 > y):
            cut = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < cut:
                hit = not hit
    return hit


def overlap_depth_m(one: list, two: list) -> float:
    """How far one outline reaches inside the other.

    A depth rather than a boolean, and no overlap AREA is computed at all: the
    question worth answering is "is this a real conflict, or two people tracing
    the same wall a metre apart", and a corner 0.3 m over the line is the
    second. An area would also be the first step towards a merged polygon,
    which this module exists not to produce.

    Sampled at the corners AND at the middle of every edge. Corners alone miss
    the commonest real overlap there is: two rectangular parcels written with
    the same north and south boundary, one reaching sixty metres into the other.
    Every corner of that pair lies exactly ON the other outline — depth zero —
    while the midpoint of the crossing edge is sixty metres inside it.
    """
    best = 0.0
    for ring, other in ((one, two), (two, one)):
        edges = _segments(other)
        if not edges:
            continue
        probes = list(ring)
        for a, b in _segments(ring):
            probes.append(((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0))
        for point in probes:
            if not _inside(point, other):
                continue
            depth = min(_point_segment_m(point, a, b) for a, b in edges)
            if depth > best:
                best = depth
    return best


def relate(one: list, two: list) -> dict:
    """How two outlines, already in metres, lie against each other.

    `relation` is one of:
      overlapping — one reaches materially inside the other; the sources
                    disagree and a person has to look.
      adjoining   — they run alongside each other for a real distance. Side by
                    side, sharing a boundary as drawn.
      corner      — they meet only near a point.
      apart       — there is a measurable gap, reported in metres.
    """
    box_one, box_two = bounds_of(one), bounds_of(two)
    rough = _box_gap(box_one, box_two)
    if rough > ADJOIN_GAP_M:
        # Far enough apart that no edge pair can be within tolerance. The
        # reported gap is still the true edge-to-edge distance when the boxes
        # are close, and the (cheaper, never smaller) box gap when they are not.
        return {"relation": "apart", "gap_m": round(rough, 2),
                "run_m": 0.0, "depth_m": 0.0}
    gap = min_gap_m(one, two)
    depth = overlap_depth_m(one, two)
    run = parallel_run_m(one, two)
    if depth > OVERLAP_M:
        relation = "overlapping"
    elif gap <= ADJOIN_GAP_M and run >= ADJOIN_RUN_M:
        relation = "adjoining"
    elif gap <= ADJOIN_GAP_M:
        relation = "corner"
    else:
        relation = "apart"
    return {"relation": relation, "gap_m": round(gap, 2),
            "run_m": round(run, 2), "depth_m": round(depth, 2)}


def clusters(ids: list, touching: list) -> list:
    """Connected groups, given the pairs that touch.

    "All of it is one piece of ground" is a claim about the whole set, not about
    consecutive entries in a list: three parcels in a row adjoin as A–B and
    B–C, and checking only A–B would miss a fourth sitting on its own. Returns
    a list of id-lists in the input's order.
    """
    parent = {i: i for i in ids}

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for a, b in touching:
        if a in parent and b in parent:
            ra, rb = root(a), root(b)
            if ra != rb:
                parent[ra] = rb
    groups: dict = {}
    for i in ids:
        groups.setdefault(root(i), []).append(i)
    return [groups[key] for key in dict.fromkeys(root(i) for i in ids)]
