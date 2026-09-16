#!/usr/bin/env python3
"""Fill ONE record's Features tab with a worked example.

Why this exists separately from the two seed scripts already here: neither one
will touch a record that has anything on it. `seed-demo-data.py` skips a record
that already carries a single feature, and `seed-web360.py` only knows the
hand-authored demo world. A real record with one stray feature on it — the
usual state after trying the Add button once — therefore has no way to be
filled, which is exactly the record somebody wants to look at.

What it writes is a whole farm rather than a tidy list: a bore that has stopped
yielding, a wall with a crack in it, a shed nobody has inspected. Every
condition the screen can draw appears at least once (bad, watch, not-checked,
working) and every category chip is populated (water, power, structures,
planting, access), because a sample where everything is fine demonstrates
nothing about a screen whose whole purpose is to surface what is not.

The pins are real coordinates inside the record's own surveyed boundary, tested
against the ring rather than scattered near it — a pin outside the parcel is
worse than no pin, and W04 draws these on a live basemap where that shows.

Every row is written under an `sf-` id, so the set can be lifted back out
whole:

    .local/api-venv/bin/python scripts/seed-record-features.py 987
    .local/api-venv/bin/python scripts/seed-record-features.py 987 --purge

Takes a survey number ("987"), or a record id ("rec-a42d94525cc3"). The owner
is read from the record itself, so it cannot write features into an account
that does not hold the land.
"""
from __future__ import annotations

import argparse
import os
import sys

import psycopg
from psycopg.rows import dict_row

DSN = os.getenv("APP_PG_DSN",
                "host=localhost port=5432 dbname=pattadar user=rhub password=rhub-dev-pwd")

P = "sf-"          # the prefix that makes this set removable in one statement

# label, spec, icon, category, condition, state, note
#
# Ordered as filed, not as displayed: the API sorts worst-first at read time,
# so the order here is only what the `sort` column remembers.
FEATURES = [
    ("Borewell 1", "420 ft · 5 in · 2005", "bore", "water",
     "Yield dropped", "bad",
     "Motor runs, water at 2 in. Flushing quoted at ₹18,000 in July."),
    ("Borewell 2", "380 ft · 3 HP · 2016", "bore", "water",
     "Working", "good",
     "Feeds the drip block. Billed on SC 4402119."),
    ("Open well", "26 ft · stone lined", "well", "water",
     "Silted", "warn",
     "Holds through December in a normal year. Unfenced on the north side."),
    ("Farm pond", "20 × 20 m · 3 m", "pond", "water",
     "60% full", "good",
     "MGNREGS 2021. Silt clearing due before the next monsoon."),
    ("Drip irrigation", "6 ac · subsidy 2019", "drip", "water",
     "Two laterals blocked", "warn",
     "Covers the east block only. Sanction order is in Papers."),
    ("Transformer", "63 kVA · shared ×3", "power", "power",
     "Working", "good",
     "APEPDCL SC 4402118. Your share of any repair is one third."),
    ("Pump set", "7.5 HP · Texmo", "pump", "power",
     "Serviced 06/2026", "warn",
     "Starter panel replaced. Bill filed under Money."),
    ("Service meter", "SC 4402604 · free supply", "power", "power",
     "Free agricultural supply", "good",
     "Units are logged and nothing is payable. This is the account every power row hangs off."),
    ("Compound wall", "240 m · brick", "fence", "structures",
     "Cracked near the gate", "bad",
     "Two panels leaning after the September rain. Mason has seen it."),
    ("Barbed fence", "700 m · 4 strand", "fence", "structures",
     "Working", "good",
     "Rebuilt 2023. Angle posts every 8 m."),
    ("Main gate", "Steel · 12 ft · south", "gate", "structures",
     "Locked", "good",
     "The caretaker holds the key. Photographed at every visit."),
    ("Farm house", "320 sq.ft · tin roof · metered", "house", "structures",
     "Working", "good",
     "Pump panel, pipes and the watchman's cot are kept here."),
    ("Store shed", "180 sq.ft · asbestos", "house", "structures",
     "", "unknown",
     "Built by the previous tenant. Nobody has been inside it since the purchase."),
    ("Mango trees", "120 trees · 2014", "trees", "planting",
     "Bearing", "good",
     "Banganapalle. Pruned January 2026."),
    ("Coconut trees", "84 trees · 2011", "trees", "planting",
     "Bearing · 4 lost", "warn",
     "Four went down in the 2024 cyclone and have not been replaced."),
    ("Standing crop", "paddy · kharif 2026", "crop", "planting",
     "Sown 21/06/2026", "good",
     "Tenant's crop under the season lease. Harvest expected November."),
    ("Approach road", "300 m · kutcha", "road", "access",
     "Muddy in monsoon", "warn",
     "Tractor only between July and September. The right of way is in the deed."),
    ("Field bund", "260 m · earthen", "road", "access",
     "Breached, north-east", "bad",
     "Water crossing into the neighbouring patta. Raised with the tenant twice."),
    ("Culvert", "1.2 m · village road", "road", "access",
     "", "unknown",
     "On the mandal road at the entrance. Never inspected — the panchayat maintains it."),
]


def ring_of(boundary: str) -> list:
    """'lat,lon;lat,lon;…' → [(lat, lon), …]. Empty when never surveyed."""
    out = []
    for pair in (boundary or "").split(";"):
        bits = pair.split(",")
        if len(bits) == 2:
            try:
                out.append((float(bits[0]), float(bits[1])))
            except ValueError:
                pass
    return out


def inside(pt: tuple, ring: list) -> bool:
    """Ray casting. Used to reject a pin rather than to draw anything, so the
    edge cases at a vertex do not matter — one rejected candidate costs a
    fraction of a degree of jitter and nothing else."""
    x, y = pt
    hit = False
    for i in range(len(ring)):
        (x1, y1), (x2, y2) = ring[i], ring[(i + 1) % len(ring)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1:
            hit = not hit
    return hit


def pins(ring: list, n: int) -> list:
    """n distinct points inside the ring, spread rather than clustered.

    A deterministic walk, not a random one: re-running the script must not
    move a feature that has not changed, or every screenshot of this record
    disagrees with the last."""
    if len(ring) < 3:
        return [(0.0, 0.0)] * n
    lats = [p[0] for p in ring]
    lons = [p[1] for p in ring]
    lo_a, hi_a, lo_o, hi_o = min(lats), max(lats), min(lons), max(lons)
    out, k = [], 0
    # A 2-D low-discrepancy sequence (golden-ratio additive recurrence) — it
    # fills the box evenly without clumping, which a modulo grid does not.
    a1, a2 = 0.7548776662466927, 0.5698402909980532
    while len(out) < n and k < n * 400:
        k += 1
        u, v = (0.5 + a1 * k) % 1.0, (0.5 + a2 * k) % 1.0
        cand = (round(lo_a + u * (hi_a - lo_a), 6), round(lo_o + v * (hi_o - lo_o), 6))
        if inside(cand, ring):
            out.append(cand)
    while len(out) < n:                       # a ring too thin to sample
        out.append((round(sum(lats) / len(lats), 6), round(sum(lons) / len(lons), 6)))
    return out


def find_record(conn, ref: str) -> dict:
    """A record id, or a survey number. Returns the row plus its owner, which
    is read from the passbook rather than taken on the command line: features
    must not be written into an account that does not hold the land."""
    cur = conn.execute(
        "SELECT p.id, p.survey_no, p.boundary, p.geo_point, pb.owner_user_id, pb.village"
        " FROM parcels p JOIN passbooks pb ON pb.id = p.passbook_id"
        " WHERE p.id = %s OR p.survey_no = %s ORDER BY p.id LIMIT 2", (ref, ref))
    rows = cur.fetchall()
    if not rows:
        sys.exit(f"no parcel matches {ref!r} — pass a survey number or a record id")
    if len(rows) > 1:
        sys.exit(f"{ref!r} matches more than one parcel; pass the record id instead")
    return rows[0]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("record", help="survey number (987) or record id (rec-…)")
    ap.add_argument("--purge", action="store_true",
                    help="remove the features this script filed, and write none")
    args = ap.parse_args()

    with psycopg.connect(DSN, autocommit=True, row_factory=dict_row) as conn:
        rec = find_record(conn, args.record)
        rid, uid = rec["id"], rec["owner_user_id"]

        cur = conn.execute(
            "DELETE FROM land_features WHERE entity_id=%s AND id LIKE %s RETURNING id",
            (rid, P + "%"))
        dropped = len(cur.fetchall())
        if args.purge:
            print(f"purged {dropped} feature(s) from {rid} (Sy {rec['survey_no']})")
            return

        spots = pins(ring_of(rec["boundary"]), len(FEATURES))
        for i, (label, spec, icon, cat, cond, state, note) in enumerate(FEATURES):
            lat, lon = spots[i]
            # The last three are left unpinned on purpose: most records have
            # something nobody has stood next to, and the card has a line for
            # saying so that would otherwise never be seen.
            pinned = i < len(FEATURES) - 3
            conn.execute(
                "INSERT INTO land_features (id, owner_user_id, entity_type, entity_id,"
                " category, label, value, unit, reference, note, created_at, vendor,"
                " condition, condition_state, spec, lat, lon, pin_label, photo_count,"
                " actions, icon, sort) VALUES (%s,%s,'parcel',%s,%s,%s,0,'','',%s,"
                "'2026-08-29','',%s,%s,%s,%s,%s,%s,0,'[]',%s,%s)",
                (f"{P}{rid}-{i}", uid, rid, cat, label, note, cond, state, spec,
                 lat if pinned else 0, lon if pinned else 0,
                 "" if pinned else "No pin yet", icon, i))

        cur = conn.execute(
            "SELECT condition_state AS s, count(*) AS c FROM land_features"
            " WHERE entity_id=%s GROUP BY 1 ORDER BY 1", (rid,))
        tally = ", ".join(f"{r['s']}={r['c']}" for r in cur.fetchall())
        print(f"{rid} (Sy {rec['survey_no']}, {rec['village']}, owner {uid}): "
              f"{len(FEATURES)} features written, {dropped} replaced · {tally}")


if __name__ == "__main__":
    main()
