"""The Maps design's own instruction: tests from the real sheet, not
synthetic ones. This fixture IS Field No. 01, Mangalakunta — the 9-point
corner table and printed lengths off the founder's vector FMB — and every
expected number below is printed in the design document itself."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from fmb_geometry import build_geometry, parse_ac_cents, utm_zone_epsg

# The corner table, exactly as the sheet prints it.
POINTS = [
    {"id": 1, "e": 319844.7523, "n": 1732069.1490, "lat": 15.66026, "lon": 79.31919},
    {"id": 2, "e": 319872.2682, "n": 1732120.2520, "lat": 15.66072, "lon": 79.31944},
    {"id": 3, "e": 320125.3764, "n": 1732665.3470, "lat": 15.66567, "lon": 79.32177},
    {"id": 4, "e": 320200.9219, "n": 1731951.0600, "lat": 15.65922, "lon": 79.32252},
    {"id": 5, "e": 320290.2370, "n": 1732095.7520, "lat": 15.66053, "lon": 79.32334},
    {"id": 6, "e": 320403.8115, "n": 1732549.7830, "lat": 15.66464, "lon": 79.32437},
    {"id": 7, "e": 320304.0998, "n": 1732574.3700, "lat": 15.66486, "lon": 79.32344},
    {"id": 8, "e": 320229.5706, "n": 1732605.9190, "lat": 15.66514, "lon": 79.32274},
    {"id": 9, "e": 320086.1597, "n": 1731896.6670, "lat": 15.65872, "lon": 79.32146},
]

# The lengths printed along the portion's edges; 296.69 is the red line.
PRINTED = [119.95, 80.93, 102.7, 468.02, 170.04, 127, 296.69, 60, 600.89]
RED = [296.69]


# The village names written outside each side of the sheet.
NEIGHBOURS = {"north": "Jangamreddypalle", "east": "Obayapalle",
              "south": "Jaganadhapuram", "west": "Kethagudipi"}


def geometry():
    return build_geometry(POINTS, PRINTED, red_lengths=RED,
                          sheet_extent_text="Ac 60.00 Cent",
                          field_extent_text="Ac 197-05 Cent",
                          datum_stated=True,
                          neighbours=NEIGHBOURS)


def test_whose_land_lies_beyond_matches_the_design_table():
    g = geometry()
    beyond = {(s["from"], s["to"]): s["beyond"] for s in g["sides"]}
    # §1's own table: three Jangamreddypalle sides, two Obayapalle, two
    # Jaganadhapuram (one the red line), two Kethagudipi.
    assert beyond[(3, 8)] == "Jangamreddypalle"
    assert beyond[(8, 7)] == "Jangamreddypalle"
    assert beyond[(7, 6)] == "Jangamreddypalle"
    assert beyond[(6, 5)] == "Obayapalle"
    assert beyond[(5, 4)] == "Obayapalle"
    assert beyond[(4, 9)] == "Jaganadhapuram"
    assert beyond[(9, 1)] == "Jaganadhapuram"
    assert beyond[(1, 2)] == "Kethagudipi"
    assert beyond[(2, 3)] == "Kethagudipi"


def test_the_ring_is_the_sheets_own():
    g = geometry()
    # §3: 3 → 8 → 7 → 6 → 5 → 4 → 9 → 1 → 2, from the printed lengths —
    # including the sheet's rounded 60 against a computed 58.04.
    assert g["ring"] == [3, 8, 7, 6, 5, 4, 9, 1, 2], g["ring"]
    assert g["order_source"] == "lengths"


def test_every_side_matches_the_design_table():
    g = geometry()
    expected = [
        (3, 8, 119.95, 119.7), (8, 7, 80.93, 112.9), (7, 6, 102.70, 103.9),
        (6, 5, 468.02, 194.0), (5, 4, 170.04, 211.7), (4, 9, 127.00, 244.6),
        (9, 1, 296.69, 305.5), (1, 2, 58.04, 28.3), (2, 3, 600.99, 24.9),
    ]
    got = [(s["from"], s["to"], s["m"], s["bearing"]) for s in g["sides"]]
    assert got == expected, got


def test_area_perimeter_and_verdict():
    g = geometry()
    # Perimeter 2,024.4 m; area 242,399 m² = 59.90 acres against the
    # sheet's "Ac 60.00 Cent" — 0.17%, which AGREES (§7: under 0.5%).
    assert g["perimeter_m"] == 2024.4, g["perimeter_m"]
    assert abs(g["area_m2"] - 242399) <= 2, g["area_m2"]
    assert g["area_ac"] == 59.90, g["area_ac"]
    assert g["closure_m"] == 0.0
    check = next(c for c in g["checks"] if c["code"] == "area_vs_sheet")
    assert check["ok"] and check["delta_pct"] == 0.17, check
    assert not any(c["code"] == "portion_exceeds_field" for c in g["checks"])


def test_the_red_line_is_measured_not_walked():
    g = geometry()
    states = {(s["from"], s["to"]): s["state"] for s in g["sides"]}
    assert states[(9, 1)] == "measured_only"
    assert all(v == "surveyed" for k, v in states.items() if k != (9, 1))


def test_printed_rides_alongside_computed():
    g = geometry()
    side_12 = next(s for s in g["sides"] if (s["from"], s["to"]) == (1, 2))
    # The sheet printed 60; the coordinates say 58.04. BOTH are kept —
    # raw survives derivation here the way it survives normalisation
    # everywhere else.
    assert side_12["printed_m"] == 60 and side_12["m"] == 58.04


def test_crs_and_extent_vocabulary():
    g = geometry()
    # Longitude 79.32° E sits in UTM zone 44N.
    assert g["crs"]["projected"] == "EPSG:32644"
    assert g["crs"]["geographic"] == "EPSG:4326"
    assert utm_zone_epsg(79.32) == "EPSG:32644"
    # The acres-cents dash convention: 197-05 is 197.05 acres, not 197.5.
    assert parse_ac_cents("Ac 197-05 Cent") == 197.05
    assert parse_ac_cents("Ac 60.00 Cent") == 60.0
    assert parse_ac_cents("") is None


def test_a_portion_larger_than_its_field_is_always_an_error():
    g = build_geometry(POINTS, PRINTED, sheet_extent_text="Ac 60.00 Cent",
                       field_extent_text="Ac 40.00 Cent")
    assert any(c["code"] == "portion_exceeds_field" and not c["ok"]
               for c in g["checks"])


def test_too_few_points_is_no_geometry():
    assert build_geometry(POINTS[:2], PRINTED) is None
    assert build_geometry([], []) is None


def test_attach_geometry_embeds_the_stored_shape():
    from fmb_geometry import attach_geometry
    fields = {
        "doc_type": "FMB",
        "extent": "Ac 60.00 Cent",
        "parent_survey_extent": "Ac 197-05 Cent",
        "boundaries": {"north": "Jangamreddypalle", "south": "Jaganadhapuram",
                       "east": "Obayapalle", "west": "Kethagudipi"},
        "boundary_points": [
            {"id": p["id"], "easting": str(p["e"]), "northing": str(p["n"]),
             "lat": p["lat"], "lng": p["lon"]} for p in POINTS
        ],
        "printed_side_lengths": PRINTED,
        "red_line_lengths": RED,
    }
    attach_geometry(fields)
    g = fields["geometry"]
    assert g["ring"] == [3, 8, 7, 6, 5, 4, 9, 1, 2]
    assert g["area_ac"] == 59.90
    assert next(c for c in g["checks"] if c["code"] == "area_vs_sheet")["ok"]
    assert g["sides"][0]["beyond"] == "Jangamreddypalle"


def test_attach_geometry_leaves_the_raster_path_alone():
    from fmb_geometry import attach_geometry
    # A scanned FMB with lat/lng-only rows (the old reader shape) and a deed
    # must pass through untouched — §12's edge case, not silently guessed.
    scanned = {"doc_type": "FMB",
               "boundary_points": [{"lat": 15.66, "lng": 79.32}] * 4}
    attach_geometry(scanned)
    assert "geometry" not in scanned
    deed = {"doc_type": "Sale Deed", "boundary_points": []}
    attach_geometry(deed)
    assert "geometry" not in deed


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except AssertionError as e:
                failures += 1
                print(f"FAIL {name}: {e}")
    sys.exit(1 if failures else 0)
