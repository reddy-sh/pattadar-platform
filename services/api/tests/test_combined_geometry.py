"""Do these two outlines actually touch? Pure arithmetic, no database.

The combined map's whole claim rests on this module: it says two thirty-acre
parcels sit side by side, or that they are 40 m apart, or that their saved
boundaries overlap and somebody has to look. Each of those is a different
sentence on the screen, so each gets a case here.

Distances are built in metres and converted to degrees, because that is the
direction the real data comes from — a surveyor's sheet is metres and the store
is degrees — and it keeps the intent of each fixture readable.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import combined_geometry as g


LAT0, LON0 = 16.5, 79.4
M_PER_DEG_LAT = 110_574.0
M_PER_DEG_LON = 111_320.0 * math.cos(math.radians(LAT0))


def rect(x0: float, y0: float, x1: float, y1: float) -> list:
    """A rectangle given in metres east/north of the fixture origin, as the
    flat [lat, lon, …] the store keeps."""
    out = []
    for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1)):
        out.extend([LAT0 + y / M_PER_DEG_LAT, LON0 + x / M_PER_DEG_LON])
    return out


#: 30 acres is 121,405.7 m²; a square of it is 348.4 m on a side. Two of them
#: sharing an edge is the case this whole feature was asked for.
SIDE = 348.4


def metres(*flats):
    rings = [g.valid_ring(f) for f in flats]
    origin = g.centre_of(rings)
    return [g.to_metres(r, origin) for r in rings]


def test_two_thirty_acre_squares_sharing_an_edge_are_adjoining():
    a, b = metres(rect(0, 0, SIDE, SIDE), rect(SIDE, 0, 2 * SIDE, SIDE))
    verdict = g.relate(a, b)
    assert verdict["relation"] == "adjoining"
    assert verdict["gap_m"] <= 0.5
    # The shared run is the full side, give or take the projection.
    assert SIDE - 2 <= verdict["run_m"] <= SIDE + 2
    # And each is still its own 30 acres. Nothing here merges them.
    for ring in (a, b):
        assert abs(g.area_sq_m(ring) / 4046.8564224 - 30) < 0.2


def test_a_metre_of_digitising_slop_is_still_adjoining():
    """Two boundaries traced by different people on different days disagree by
    a metre on the same wall. That is the normal case, not a gap."""
    a, b = metres(rect(0, 0, SIDE, SIDE), rect(SIDE + 1.2, 0, 2 * SIDE, SIDE))
    verdict = g.relate(a, b)
    assert verdict["relation"] == "adjoining"
    assert 1.0 <= verdict["gap_m"] <= 1.5


def test_a_real_gap_is_reported_as_a_gap_and_never_as_adjoining():
    a, b = metres(rect(0, 0, SIDE, SIDE), rect(SIDE + 40, 0, 2 * SIDE, SIDE))
    verdict = g.relate(a, b)
    assert verdict["relation"] == "apart"
    assert 39 <= verdict["gap_m"] <= 41


def test_far_apart_parcels_are_answered_from_their_boxes():
    """Two parcels in different villages must not cost a segment sweep."""
    a, b = metres(rect(0, 0, SIDE, SIDE), rect(20_000, 20_000, 20_000 + SIDE, 20_000 + SIDE))
    verdict = g.relate(a, b)
    assert verdict["relation"] == "apart"
    assert verdict["gap_m"] > 10_000


def test_touching_at_one_corner_is_not_a_shared_boundary():
    a, b = metres(rect(0, 0, SIDE, SIDE), rect(SIDE, SIDE, 2 * SIDE, 2 * SIDE))
    assert g.relate(a, b)["relation"] == "corner"


def test_materially_overlapping_outlines_are_reported_not_resolved():
    a, b = metres(rect(0, 0, SIDE, SIDE), rect(SIDE - 60, 0, 2 * SIDE, SIDE))
    verdict = g.relate(a, b)
    assert verdict["relation"] == "overlapping"
    assert verdict["depth_m"] > 50


def test_one_long_wall_facing_two_shorter_ones_still_adjoins():
    """Neighbouring parcels rarely share a whole edge: one boundary faces two
    or three shorter ones across it, and the corners do not line up."""
    long_one = rect(0, 0, SIDE, SIDE)
    upper = rect(SIDE, 0, SIDE + 100, SIDE / 2)
    lower = rect(SIDE, SIDE / 2, SIDE + 100, SIDE)
    a, b, c = metres(long_one, upper, lower)
    assert g.relate(a, b)["relation"] == "adjoining"
    assert g.relate(a, c)["relation"] == "adjoining"
    # …and the two halves adjoin each other, so all three are one piece.
    assert g.relate(b, c)["relation"] == "adjoining"


def test_a_ring_is_accepted_whole_or_not_at_all():
    good = rect(0, 0, SIDE, SIDE)
    assert len(g.valid_ring(good)) == 4
    # A closed ring from a file is opened rather than carrying a phantom corner.
    assert len(g.valid_ring(good + good[:2])) == 4
    # Two corners enclose nothing; an unfilled coordinate is the Gulf of Guinea;
    # a half-written corner drops the whole ring rather than three-quarters of
    # a parcel.
    assert g.valid_ring(good[:4]) == []
    assert g.valid_ring([0, 0, 1, 1, 2, 2, 0, 0]) == []
    assert g.valid_ring(good[:-1]) == []
    assert g.valid_ring([16.5, 79.4, 16.5, 79.4, 16.5, 79.4]) == []
    assert g.valid_ring([91.0, 79.4, 16.5, 79.4, 16.6, 79.5]) == []
    assert g.valid_ring([float("nan"), 79.4, 16.5, 79.4, 16.6, 79.5]) == []


def test_clusters_span_the_whole_chain_not_just_neighbours_in_a_list():
    """A—B and B—C is one piece of ground; D on its own is a second. Checking
    only consecutive pairs would report three."""
    pieces = g.clusters(["a", "b", "c", "d"], [("a", "b"), ("b", "c")])
    assert [sorted(p) for p in pieces] == [["a", "b", "c"], ["d"]]
    assert g.clusters(["a", "b"], []) == [["a"], ["b"]]
