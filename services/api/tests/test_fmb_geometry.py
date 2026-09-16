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


def test_corner_rows_as_strings_still_build_the_geometry():
    from fmb_geometry import attach_geometry
    # A reading whose corner table arrives as prose-shaped strings —
    # thousands commas, unit suffixes — must still yield the full shape;
    # this exact failure produced a mapless FMB page on a real scan.
    fields = {
        "doc_type": "FMB",
        "boundary_points": [
            {"id": str(p["id"]), "easting": f"{p['e']:,.4f}",
             "northing": f"{p['n']:,.4f}", "lat": p["lat"], "lng": p["lon"]}
            for p in POINTS
        ],
        "printed_side_lengths": [f"{x} m" for x in PRINTED],
        "portion_extent": "Ac 60.00 Cent",
    }
    attach_geometry(fields)
    g = fields["geometry"]
    assert g["ring"] == [3, 8, 7, 6, 5, 4, 9, 1, 2]
    assert g["order_source"] == "lengths"
    assert g["area_ac"] == 59.90


def test_lengths_with_units_still_build_the_ring():
    from fmb_geometry import attach_geometry
    # The production reader wrote "119.95 m"; the ring must not degrade to
    # an angular guess over a unit suffix.
    fields = {
        "doc_type": "FMB",
        "boundary_points": [
            {"id": p["id"], "easting": p["e"], "northing": p["n"],
             "lat": p["lat"], "lng": p["lon"]} for p in POINTS
        ],
        "printed_side_lengths": [f"{x} m" for x in PRINTED],
    }
    attach_geometry(fields)
    assert fields["geometry"]["order_source"] == "lengths"
    assert fields["geometry"]["ring"] == [3, 8, 7, 6, 5, 4, 9, 1, 2]


# ── The exported file, and what it is allowed to be used for ────────────────

# `pattadar-fmb-mangalakunta.geojson`, exactly as FmbMapViewer's GeoJSON button
# writes it for this sheet. Checked in as the authority: if the ring order or
# the coordinates ever change, a file already in a surveyor's hands stops
# matching the record it came from.
EXPORTED_RING = [
    [79.32177, 15.66567], [79.32274, 15.66514], [79.32344, 15.66486],
    [79.32437, 15.66464], [79.32334, 15.66053], [79.32252, 15.65922],
    [79.32146, 15.65872], [79.31919, 15.66026], [79.31944, 15.66072],
    [79.32177, 15.66567],
]


def test_the_geojson_ring_is_the_sheets_ring_in_lon_lat_and_closed():
    from fmb_geometry import to_geojson_ring
    ring = to_geojson_ring(geometry())
    # Ten entries for nine corners: GeoJSON repeats the first one last.
    assert len(ring) == 10 and ring[0] == ring[-1]
    assert ring == EXPORTED_RING, ring
    # Walked in the sheet's order 3→8→7→6→5→4→9→1→2, NOT corner-id order.
    assert ring[0] == [79.32177, 15.66567]   # point 3
    assert ring[1] == [79.32274, 15.66514]   # point 8


def test_the_boundary_column_form_is_lat_first_and_open():
    from fmb_geometry import to_boundary_text
    text = to_boundary_text(geometry())
    corners = text.split(";")
    # `parcels.boundary` stores corners, so nine — the closing repeat is a
    # GeoJSON rule, not a survey fact.
    assert len(corners) == 9, corners
    assert corners[0] == "15.66567,79.32177"   # lat first, unlike GeoJSON


def test_a_sheet_with_no_datum_yields_no_geographic_ring():
    from fmb_geometry import build_geometry, to_boundary_text, to_geojson_ring
    # Eastings and northings, but the lat/long columns were never printed.
    # Emitting zeros would put this parcel in the Gulf of Guinea.
    blind = [{k: (0.0 if k in ("lat", "lon") else v) for k, v in p.items()} for p in POINTS]
    g = build_geometry(blind, PRINTED)
    assert g is not None and g["area_ac"] == 59.90   # the sheet still measures
    assert to_geojson_ring(g) == []                  # but it cannot be placed
    assert to_boundary_text(g) == ""


def test_one_unplaced_corner_rejects_the_whole_ring():
    from fmb_geometry import attach_geometry, to_boundary_text, to_geojson_ring
    # The realistic failure: a scan where eight corners read cleanly and the
    # ninth's lat/long column did not. attach_geometry defaults that row to
    # 0.0/0.0 and datum_stated still goes true off the other eight, so the
    # geometry builds. Nine-tenths of a parcel must not be drawn — it looks
    # right, and one vertex is 2,000 km into the Atlantic.
    fields = {
        "doc_type": "FMB",
        "boundary_points": [
            {"id": p["id"], "easting": p["e"], "northing": p["n"],
             "lat": (None if p["id"] == 7 else p["lat"]),
             "lng": (None if p["id"] == 7 else p["lon"])}
            for p in POINTS
        ],
        "printed_side_lengths": PRINTED,
    }
    attach_geometry(fields)
    g = fields["geometry"]
    assert g["area_ac"] == 59.90                  # the sheet still measures
    assert any(p["lat"] == 0 and p["lon"] == 0 for p in g["points"])
    assert to_geojson_ring(g) == []               # but it cannot be placed
    assert to_boundary_text(g) == ""


def test_area_must_not_be_recomputed_from_the_exported_ring():
    """The reason area_ac and perimeter_m travel inside the exported file.

    Five decimal places of latitude is about 1.1 m on the ground. Over nine
    corners that is 0.30 acres — enough to move this parcel from 0.17% off the
    sheet to 0.33%, and on a smaller parcel enough to flip the §7 verdict. Any
    map that draws this ring must keep taking its numbers from the projected
    corner table, which is what the viewer's own header comment promises.
    """
    import math
    from fmb_geometry import to_geojson_ring
    ring = to_geojson_ring(geometry())[:-1]
    r = 6378137.0
    rad = math.radians
    total = sum(
        (rad(ring[(i + 1) % len(ring)][0]) - rad(ring[i][0]))
        * (2 + math.sin(rad(ring[i][1])) + math.sin(rad(ring[(i + 1) % len(ring)][1])))
        for i in range(len(ring))
    )
    from_degrees_ac = abs(total * r * r / 2) / 4046.8564
    from_table_ac = geometry()["area_ac"]
    assert from_table_ac == 59.90
    assert round(from_degrees_ac, 2) == 60.20, round(from_degrees_ac, 2)
    assert round(from_degrees_ac - from_table_ac, 2) == 0.30


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
