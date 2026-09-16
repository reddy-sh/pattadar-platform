"""Where a record IS, from whichever of the two facts it has.

`geo_point` is a pin somebody dropped; `boundary` is a survey. A record can
easily have the second and not the first — five of the eight parcels in the
founder's own account do — and the pin parser answers 0,0 for a missing value,
which is a real place: null island, in the Gulf of Guinea. The portfolio map on
/app/properties plots what this returns, so an answer of 0,0 for a record whose
outline is known would put half a portfolio in the Atlantic.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from web360 import _latlon, _located, _ring  # noqa: E402

# Sy 214/2, Kothapalli — the ring the demo seed carries, as the column stores it.
BOUNDARY = ("17.07765,82.13872;17.07882,82.13855;"
            "17.07895,82.13948;17.07778,82.13965")
RING = _ring(BOUNDARY)


def test_a_pin_is_used_when_there_is_one():
    assert _located("17.0783,82.1391", []) == (17.0783, 82.1391)


def test_a_pin_wins_over_the_ring_when_both_exist():
    """The pin is where a person said the record is. The centroid is arithmetic
    about its corners, and a person's answer outranks arithmetic."""
    lat, lon = _located("17.0700,82.1300", RING)
    assert (lat, lon) == (17.07, 82.13)


def test_a_surveyed_record_with_no_pin_locates_itself():
    lat, lon = _located("", RING)
    # Inside the parcel, which for a convex ring the average of the corners is.
    assert 17.0776 < lat < 17.0790
    assert 82.1385 < lon < 82.1397


def test_the_centroid_is_the_average_of_the_corners():
    lat, lon = _located("", RING)
    assert round(lat, 6) == round(sum(RING[0::2]) / 4, 6)
    assert round(lon, 6) == round(sum(RING[1::2]) / 4, 6)


def test_a_record_with_neither_stays_at_the_origin():
    """Not a bug — 0,0 is the caller's signal that the record is NOT located,
    and the map drops it and says so rather than drawing it somewhere."""
    assert _located("", []) == (0.0, 0.0)
    assert _latlon("") == (0.0, 0.0)


def test_a_ring_too_short_to_be_a_shape_is_not_a_location():
    """Two corners are a line, not a parcel. `_ring` is flat, so six floats is
    the three-corner floor — anything less must not answer the question."""
    assert _located("", [17.0, 82.0, 17.1, 82.1]) == (0.0, 0.0)


def test_a_half_written_ring_never_reaches_the_map():
    """`_ring` drops the whole boundary rather than returning three sides of a
    parcel, so a corrupt column leaves the record unlocated, not misplaced."""
    assert _ring("17.07765,82.13872;17.07882") == []
    assert _located("", _ring("17.07765,82.13872;17.07882")) == (0.0, 0.0)
