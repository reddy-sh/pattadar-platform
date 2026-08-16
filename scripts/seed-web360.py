#!/usr/bin/env python
"""Seed the demo data behind screens W01–W15.

    .local/api-venv/bin/python scripts/seed-web360.py [user_id]

Idempotent: every row it writes has an id starting `w360-`, and the script
deletes exactly those before rewriting. Hand-entered records are never touched.

Fidelity note — the mock's arithmetic does not close. Per-record figures appear
on two or three screens each and are seeded EXACTLY (Sy 214/2 is 3.24 ac and
₹72.9 L everywhere; Sy 88's two lots are ₹60.00 L and ₹1.08 Cr). The W01 stat
strip and the "Where the value sits" bars are then DERIVED from those records
rather than hard-coded, so the dashboard always sums its own data. Where the
mock's totals disagree with its own line items, the line items win:
  · W01 tiles say 44.82 ac / ₹5.02 Cr worth, but the nine records it lists add
    to more than that even before the managed/watched filter.
  · W15 shows eight shelves adding to 61 documents under a "64 papers" header.
Both are seeded to the line items; see the handover note.
"""
import os
import sys
import psycopg

DSN = os.getenv("APP_PG_DSN",
                "host=localhost port=5432 dbname=pattadar user=rhub password=rhub-dev-pwd")
UID = sys.argv[1] if len(sys.argv) > 1 else os.getenv("DEV_USER_ID", "shankarreddy.t")
P = "w360-"

# ── Records ───────────────────────────────────────────────────────────

PASSBOOKS = [
    # id, khata, district, mandal, village, owner
    (P + "pb-10021", "10021", "Kakinada", "Peddapuram", "Kothapalli", "T. Sankara Rao"),
    (P + "pb-20455", "20455", "Kakinada", "Peddapuram", "Chinnapuram", "T. Sankara Rao"),
    (P + "pb-30877", "30877", "Kakinada", "Peddapuram", "Peddapuram", "T. Sankara Rao"),
]

# id, passbook, survey, subdiv, extent, status, stake, market, paid, paid_on, loan, geo, shape
PARCELS = [
    (P + "p-214-2", P + "pb-10021", "214", "2", 3.24, "for_sale", "managed",
     72_90_000, 58_00_000, "2019-09-06", 0, "17.0783,82.1391",
     "0.10,0.72 0.11,0.38 0.53,0.33 0.57,0.70"),
    (P + "p-214-3", P + "pb-10021", "214", "3", 1.90, "owned", "owned",
     49_40_000, 30_00_000, "2019-09-06", 0, "17.0791,82.1404",
     "0.58,0.70 0.55,0.34 0.78,0.33 0.80,0.69"),
    (P + "p-189-1a", P + "pb-10021", "189", "1a", 2.05, "owned", "owned",
     38_90_000, 18_00_000, "2018-05-14", 0, "17.0742,82.1352",
     "0.16,0.94 0.18,0.74 0.52,0.75 0.50,0.95"),
    (P + "p-88", P + "pb-30877", "88", "", 30.00, "owned", "owned",
     2_46_00_000, 1_68_00_000, "2022-03-14", 42_00_000, "17.0869,82.1512",
     "0.62,0.30 0.64,0.16 0.86,0.15 0.85,0.29"),
    (P + "p-402-1", P + "pb-20455", "402", "1", 3.10, "owned", "managed",
     27_90_000, 14_00_000, "2020-11-02", 0, "17.1024,82.1104",
     "0.20,0.22 0.21,0.10 0.36,0.10 0.36,0.23"),
    (P + "p-331-2", P + "pb-20455", "331", "2", 4.53, "owned", "owned",
     27_90_000, 20_00_000, "2021-06-18", 0, "17.1038,82.1147",
     "0.39,0.22 0.40,0.10 0.55,0.10 0.54,0.23"),
]

# id, type, label, locality, city, builtup, land_area, status, stake, market, paid, geo, shape
PROPERTIES = [
    (P + "r-flat4b", "flat", "Flat 4B, Sai Enclave", "Kakinada town", "Kakinada",
     1340, 0, "for_sale", "owned", 68_00_000, 38_00_000, "17.0921,82.1663",
     "0.66,0.44 0.66,0.36 0.74,0.36 0.74,0.44"),
    (P + "r-shop2", "shop", "Shop 2, Main Rd", "Peddapuram", "Peddapuram",
     420, 0, "disputed", "owned", 31_00_000, 12_00_000, "17.0784,82.1481",
     "0.78,0.53 0.78,0.46 0.85,0.46 0.85,0.53"),
    (P + "r-plot12", "open_plot", "Plot 12, Kakinada", "Kakinada town", "Kakinada",
     0, 742, "owned", "watch", 10_40_000, 4_00_000, "17.0955,82.1701",
     "0.72,0.42 0.72,0.37 0.78,0.37 0.78,0.42"),
]

# When each record was last opened. W01's "Recently opened" strip shows a
# parcel, a flat, a parcel and a shop — so the order is data, not chance.
OPENED = {
    P + "p-214-2": "2026-08-14T18:40",
    P + "r-flat4b": "2026-08-14T17:05",
    P + "p-214-3": "2026-08-14T11:20",
    P + "r-shop2": "2026-08-13T16:02",
    P + "p-88": "2026-08-12T09:15",
    P + "p-189-1a": "2026-08-10T08:00",
    P + "p-402-1": "2026-08-08T12:00",
    P + "p-331-2": "2026-08-06T12:00",
    P + "r-plot12": "2026-08-04T12:00",
}

TAGS = [
    ("record", P + "p-214-2", "for sale"),
    ("record", P + "p-214-2", "boundary dispute"),
    ("record", P + "r-flat4b", "for sale"),
    ("record", P + "p-189-1a", "Ramesh's share"),
    ("record", P + "p-88", "give to lawyer"),
    ("paper", P + "d-deed-4417", "give to lawyer"),
    ("paper", P + "d-fmb-214", "boundary dispute"),
    ("photo", P + "ph-00", "boundary dispute"),
]

# ── W07 · the 14 features on Sy 214/2, worst condition first ──────────
# label, spec, icon, category, condition, state, note, lat, lon, pin, photos, actions
FEATURES = [
    ("Borewell 1", "420 ft · 5 in · 2005", "bore", "water", "Yield dropped", "bad",
     "Motor runs, water at 2 in. Flushing suggested.", 17.0779, 82.1402, "", 4,
     ["Fix it", "Update"]),
    ("Barbed fence", "620 m · 4 strand", "fence", "structures", "Broken, east side", "bad",
     "40 m down. Cattle coming through.", 0, 0, "620 m traced", 5,
     ["Order fencing", "Update"]),
    ("Borewell 2", "380 ft · 3 HP · 2014", "bore", "water", "Working", "good",
     "Feeds the drip block. Billed on SC 4402119.", 17.0784, 82.1398, "", 3,
     ["Update", "Bills"]),
    ("Borewell 3", "450 ft · free supply", "bore", "water", "Working", "good",
     "Free agricultural supply on SC 4402604 — units logged, nothing to pay.",
     17.0772, 82.1407, "", 2, ["Update", "Bills"]),
    ("Gate", "Steel · 12 ft · south", "gate", "structures", "Locked", "good",
     "The caretaker holds the key. Photographed at every visit.", 17.0770, 82.1396, "", 2,
     ["Update", "Photos"]),
    ("Pump set", "5 HP · Texmo", "pump", "power", "Serviced 06/2026", "warn",
     "Starter panel replaced. Bill filed.", 17.0779, 82.1402, "", 2,
     ["Update", "Service log"]),
    ("Open well", "28 ft · stone lined", "well", "water", "Working", "good",
     "Feeds the north block. Unfenced.", 17.0791, 82.1396, "", 2, ["Update", "Photos 2"]),
    ("Transformer", "25 kVA · shared ×3", "power", "power", "Working", "good",
     "APEPDCL 4402118. Your share of repairs: ⅓.", 17.0788, 82.1387, "", 3,
     ["Update", "Bills"]),
    ("Farm pond", "18 × 18 m · 3 m", "pond", "water", "60% full", "good",
     "MGNREGS 2021. Silt clearing due.", 17.0776, 82.1394, "", 3,
     ["Update", "Order clearing"]),
    ("Drip irrigation", "1.8 ac · subsidy 2020", "drip", "water", "Working", "good",
     "Sanction order is in Papers.", 0, 0, "No pin yet", 1, ["Update", "Papers 1"]),
    ("Farm house", "240 sq.ft · tin roof · metered", "house", "structures", "Working", "good",
     "Pump panel, pipes, watchman's cot.", 17.0786, 82.1404, "", 2, ["Update", "Photos 2"]),
    ("Coconut trees", "64 trees · 2012", "trees", "planting", "Bearing · 2 lost", "good",
     "North bund. Lease income under Money.", 17.0793, 82.1401, "", 6,
     ["Update count", "Income"]),
    ("Standing crop", "paddy · kharif 2026", "crop", "planting", "Sown 18/06/2026", "good",
     "Tenant Ravi. Harvest expected 11/2026.", 0, 0, "whole parcel", 4, ["Update", "Lease"]),
    ("Approach road", "220 m · kutcha", "road", "access", "Muddy in monsoon", "warn",
     "Off the Peddapuram road. Right of way is in the deed.", 17.0771, 82.1399, "", 3,
     ["Update", "Deed clause"]),
]
# ── W03 · the 11 papers on Sy 214/2 ───────────────────────────────────
# id, title, subtitle, shelf, pages, registered, office, buyer, seller, consideration
PAPERS_214_2 = [
    (P + "d-deed-4417", "Sale Deed 4417/2019",
     "Registered 06/09/2019 · SRO Peddapuram · ₹58,00,000 · 22 pages", "title", 22,
     "06/09/2019", "SRO Peddapuram", "T. Sankara Rao", "Bhogadi Venkanna", 58_00_000),
    (P + "d-pb-10021", "Pattadar passbook 10021",
     "Read 12/02/2026 · owner, village and extent matched the record", "revenue", 4,
     "", "", "", "", 0),
    (P + "d-fmb-214", "FMB sheet — 214",
     "Sketch with 4 boundary marks · one mark disputed on 12/08/2026", "map", 2,
     "", "", "", "", 0),
    (P + "d-will-2021", "Will of T. Subbarao, 2021",
     "Registered 14/07/2021 · SRO Peddapuram · 6 pages", "title", 6,
     "14/07/2021", "SRO Peddapuram", "", "", 0),
    (P + "d-lease-2026", "Lease agreement — Ravi Kumar",
     "Seasonal lease · kharif 2026 · scanned 18/06/2026", "title", 3, "", "", "", "", 0),
    (P + "d-ror-2526", "ROR / Adangal 1-B", "Revenue record · 2025-26", "revenue", 2,
     "", "", "", "", 0),
    (P + "d-mut-2019", "Mutation order 214/2", "Tahsildar, Peddapuram · 12/11/2019",
     "revenue", 2, "", "", "", "", 0),
    (P + "d-pahani-24", "Pahani, 2024-25", "Revenue record · village office copy",
     "revenue", 2, "", "", "", "", 0),
    (P + "d-tippon-214", "Tippon — 214", "Map · traced from the village sheet", "map", 1,
     "", "", "", "", 0),
    (P + "d-ec-2019", "EC, 2004–2019", "Search & tax · clear at purchase", "search", 5,
     "", "", "", "", 0),
    (P + "d-kist-2627", "Land revenue receipt, 2026-27", "Search & tax · paid 02/07/2026",
     "search", 1, "", "", "", "", 0),
]

# W15 shelf totals: Title 14 · Revenue 18 · Map 7 · Identity 5 · Search & tax 12
# · Old record 3 · Unsorted 2. The eleven above are part of those; the rest are
# filler carrying only a shelf so the vault counts are exact.
SHELF_TARGET = {"title": 14, "revenue": 18, "map": 7, "identity": 5,
                "search": 12, "old": 3, "unsorted": 2}
SHELF_FILLER = {
    "title": ("Agreement of sale", "Title · scanned copy"),
    "revenue": ("Adangal extract", "Revenue record · village office"),
    "map": ("Village survey sheet", "Map · scanned"),
    "identity": ("Aadhaar", "Masked until you unlock"),
    "search": ("Challan receipt", "Search & tax · paid"),
    "old": ("Sethwar extract", "Old record · 1954"),
    "unsorted": ("Scan 2026-08", "Nothing recognised it"),
}

# W13 · what the reader found in the deed, and the one place it was unsure.
READINGS = {
    P + "d-deed-4417": (
        "3.24 acres of dry land in Sy 214/2, Kothapalli, sold for \u20b958,00,000 "
        "and registered on 06/09/2019.",
        "The sub-division digit is smudged on page 4", 4),
    P + "d-pb-10021": (
        "Khata 10021 in Kothapalli, Peddapuram — owner T. Sankara Rao, extent 3.24 "
        "acres across two survey numbers.", "", 0),
    P + "d-fmb-214": (
        "Field measurement sketch for survey 214 with four boundary marks and the "
        "road to Peddapuram along the south.", "", 0),
}

VERSIONS = [
    (P + "dv-4417-2", P + "d-deed-4417", 2, "Colour rescan, 300 dpi", "14/03/2024", "you", "", 2),
    (P + "dv-4417-1", P + "d-deed-4417", 1, "First photo, from the phone", "02/11/2022",
     "", "kept, never deleted", 1),
]

# ── W04 · boundary marks ──────────────────────────────────────────────
MARKS = [
    (P + "bm-1", 1, "South-west stone", "confirmed", "confirmed 12/08/2026",
     17.0771, 82.1385, 0, "12/08/2026"),
    (P + "bm-2", 2, "North-west stone", "confirmed", "confirmed 12/08/2026",
     17.0795, 82.1387, 0, "12/08/2026"),
    (P + "bm-3", 3, "North-east stone", "confirmed", "confirmed 12/08/2026",
     17.0795, 82.1408, 0, "12/08/2026"),
    (P + "bm-4", 4, "South-east stone moved ~4 ft in", "moved",
     "reported 12/08/2026 · 2 photos", 17.0772, 82.1406, 2, "12/08/2026"),
]

# ── W08 · people on Sy 214/2 ──────────────────────────────────────────
PEOPLE = [
    (P + "pp-sat", "M. Satyanarayana", "MS", "Pattadar caretaker",
     ["Pattadar caretaker", "ID verified"],
     "Monthly site visit, dated photos, boundary walk · 14 visits since 2022 · "
     "lives 6 km away in Peddapuram",
     "Through Pattadar", "Pay", "₹1,200 / month", "Next payout", "01/09/2026",
     "This parcel only",
     ["Message", "Change pay", "Visit schedule", "His 31 photos", "End the arrangement"],
     False, 1),
    (P + "pp-ravi", "Ravi Kumar", "RK", "Tenant farmer · you found him", [],
     "Farms 3.24 ac on a seasonal lease · paddy, kharif 2026 · agreement scanned into the vault",
     "Self-hired", "He pays you", "₹42,000 / season", "Due", "30/11/2026",
     "Nothing — not a user",
     ["Record a payment", "Lease agreement", "Invite to the app", "End the lease"],
     False, 2),
    (P + "pp-ramesh", "T. Ramesh", "TR", "Family", ["Family"],
     "Brother · can view and add papers · unpaid · in India, decides on the ground",
     "", "", "", "", "", "", ["Permissions"], True, 3),
    (P + "pp-prasad", "K. Prasad", "KP", "Professional · per matter",
     ["Professional · per matter"],
     "Advocate · title opinion · ₹7,500 paid 09/08/2026 · link to 4 papers expires tomorrow",
     "", "", "", "", "", "", ["Extend access"], True, 4),
    (P + "pp-srinivas", "G. Srinivas", "GS", "Assigned by an order", ["Assigned by an order"],
     "Licensed surveyor · re-survey PT-2094 · ₹2,900 held in escrow until you accept the sketch",
     "", "", "", "", "", "", ["Track order"], True, 5),
]

PAYMENTS = [
    (P + "pay-1", "Satyanarayana · August visit", "12/08/2026 · UPI", "12/08/2026",
     "UPI", 1200, "out", "settled", 1),
    (P + "pay-2", "K. Prasad · title opinion", "09/08/2026 · card", "09/08/2026",
     "card", 7500, "out", "settled", 2),
    (P + "pay-3", "Ravi Kumar · rabi lease", "04/04/2026 · cash, receipt scanned",
     "04/04/2026", "cash", 38000, "in", "settled", 3),
    (P + "pay-4", "Surveyor · in escrow", "releases when you accept the sketch", "",
     "escrow", 2900, "out", "escrow", 4),
]

# ── W10 · Sy 88 bought in two lots ────────────────────────────────────
LOTS = [
    (P + "lot-1", "14/03/2022", 10.00, 6_00_000, 60_00_000, 42_00_000, "B. Venkanna",
     "Sale Deed 1188/2022", "SRO Peddapuram", 1),
    (P + "lot-2", "22/07/2022", 20.00, 5_40_000, 1_08_00_000, 84_00_000,
     "K. Satyavathi & 2 others", "Sale Deed 3402/2022", "SRO Peddapuram", 2),
]
EXTRAS = [
    (P + "cc-1", "Stamp & registration", 10_08_000, 1),
    (P + "cc-2", "Brokerage", 1_68_000, 2),
    (P + "cc-3", "Fencing", 3_40_000, 3),
    (P + "cc-4", "Bore & pump", 1_80_000, 4),
]

# ── W11 · the Sy 88 ledger ────────────────────────────────────────────
# title, subtitle, on_label, on_icon, kind, paid_by, amount, date, category, recoverable, note
EXPENSES_88 = [
    ("Bore flushing and new starter panel", "", "Borewell 1", "bore", "capital",
     "Caretaker", 18400, "12/08/2026", "Repairs", False, ""),
    ("APEPDCL bill · 412 units", "", "SC 4402118", "power", "running", "You · UPI",
     1285, "04/08/2026", "Power", False, ""),
    ("Bund repair after the rain · 6 workers, 2 days", "", "Whole parcel", "parcel",
     "running", "Caretaker", 9600, "28/07/2026", "Labour", False, ""),
    ("Fence rebuilt, east side · 40 m", "", "Barbed fence", "fence", "capital",
     "Pattadar order", 34000, "19/07/2026", "Repairs", False, ""),
    ("Land revenue (kist) · 2026-27", "", "Whole parcel", "parcel", "running",
     "You · card", 2340, "02/07/2026", "Tax & kist", False, ""),
    ("Seed and urea for the kharif sowing", "Tenant's share — recoverable at harvest",
     "Standing crop", "crop", "running", "You, for tenant", 8600, "18/06/2026",
     "Seed & inputs", True, "Tenant's share — recoverable at harvest"),
    ("Caretaker, June visit", "", "M. Satyanarayana", "person", "running",
     "Wallet · auto", 1200, "01/06/2026", "Caretaker", False, ""),
]

# ── W12 · the Flat 4B ledger, rent in the same list ───────────────────
EXPENSES_FLAT = [

    ("Bathroom leak · plumbing and tiles", "", "Flat 4B", "flat", "running",
     "Letting agent", 7400, "21/07/2026", "Repairs", False, ""),
    ("Property tax · GVMC, 2026-27", "", "Assessment 10/4/22/8", "tax", "running",
     "You · UPI", 9180, "02/07/2026", "Property tax", False, ""),
    ("Repainted, two coats · between tenants", "", "Flat 4B", "flat", "capital",
     "You · card", 28500, "14/06/2026", "Painting", False, ""),

    ("Letting agent · one month's commission", "", "Sri Sai Estates", "agent", "running",
     "You · UPI", 15500, "01/05/2026", "Letting agent", False, ""),
    ("Water tanker · summer shortage", "", "Sai Enclave society", "society", "running",
     "Society, shared", 1000, "18/04/2026", "Water", False, ""),
]

# The two rows that actually repeat every month. A let flat collects rent and
# pays society dues twelve times a year, and W12's yield only means something
# against the full year of both.
_MONTHS = [("04", "2026"), ("05", "2026"), ("06", "2026"), ("07", "2026"), ("08", "2026"),
           ("09", "2026"), ("10", "2026"), ("11", "2026"), ("12", "2026"), ("01", "2027"),
           ("02", "2027"), ("03", "2027")]
_MONTH_NAME = {"01": "January", "02": "February", "03": "March", "04": "April",
               "05": "May", "06": "June", "07": "July", "08": "August",
               "09": "September", "10": "October", "11": "November", "12": "December"}
for _m, _y in _MONTHS:
    EXPENSES_FLAT.append(
        (f"Rent · {_MONTH_NAME[_m]}", "money in", "P. Anitha, tenant", "person", "income",
         "Bank transfer", 15500, f"05/{_m}/{_y}", "Rent", False, ""))
    EXPENSES_FLAT.append(
        (f"Society maintenance · {_MONTH_NAME[_m]}", "", "Sai Enclave society", "society",
         "running", "Wallet · auto", 3200, f"05/{_m}/{_y}", "Society maintenance", False, ""))

# ── W15 · links out of the vault ──────────────────────────────────────
LINKS = [
    (P + "sl-prasad", "K. Prasad, advocate", "4 papers",
     "Expiring link + OTP · opened 6 times · last 13/08/2026 16:02 IST",
     P + "d-deed-4417", 4, 6, "13/08/2026 16:02 IST", "16/08/2026", 1, 1),
    (P + "sl-sbi", "SBI Kakinada, loan desk", "passbook 10021 + EC",
     "Named people only · watermarked, no download", "", 2, 0, "", "02/09/2026", 18, 2),
    (P + "sl-agent", "Buyer's agent", "proof of ownership, Sy 214/2",
     "View-only watermark · Aadhaar and PAN masked · never opened", "", 3, 0, "",
     "19/08/2026", 4, 3),
]

# ── W01 · the two things with a deadline, and the map's one insight ───
WAITING = [
    (P + "wi-1", "Mutation for Sy 214/2 needs your signature",
     "Tahsildar, Peddapuram · filed 11/08/2026 · office opens 09:30 IST, 4 h from now",
     "clock", "Sign", "primary", P + "p-214-2", 1),
    (P + "wi-2", "Advocate's link to 4 papers expires tomorrow",
     "K. Prasad · opened 6 times · last 13/08/2026 16:02 IST", "lock", "Extend",
     "ghost", "", 2),
    (P + "wi-3", "214/2 and 214/3 share a boundary",
     "5.14 acres in one piece sells for more than two listings. Combine them?",
     "map", "Combine", "primary", P + "p-214-2", 3),
]

# ── W03 Services · the two orders live on Sy 214/2 ────────────────────
# id, kind, title, note, assignee, cost, stage, needs_you, due
ORDERS = [
    ("PT-2094", "survey", "Boundary re-survey",
     "Licensed surveyor re-walks the four marks and issues a sketch. "
     "\u20b92,900 is held in escrow until you accept it.",
     "G. Srinivas", 2900, 2, True, "20/08/2026"),
    ("PT-2081", "site_visit", "Monthly site visit",
     "Dated geo-stamped photos, boundary walk, condition of every feature.",
     "M. Satyanarayana", 1200, 3, False, "01/09/2026"),
]

# ── W09 · someone else's property ─────────────────────────────────────
KITS = [
    (P + "kit-96-3", "Sy 96/3, Samalkot",
     "4.10 acres wet land · Samalkot, Kakinada · asked ₹1.02 Cr · ₹24.9 L/acre",
     "parcel", "for_sale", "4.10 ac · ₹1.02 Cr asked", "B. Venkat, agent", "BV",
     "Pattadar-verified since 2024 · 6 sales closed", "13/08/2026 18:40 IST",
     "expiring link + OTP · you opened it twice", 2, 12, "", 1_02_00_000, 12, 5, "live", 1),
    (P + "kit-plot22", "Plot 22, Kakinada", "300 sq.yd · ₹41 L", "property", "review",
     "300 sq.yd · ₹41 L", "your cousin", "YC", "read", "10/08/2026", "read", 1, 20,
     "", 41_00_000, 0, 0, "live", 2),
    (P + "kit-41-1", "Sy 41/1, Pithapuram", "", "parcel", "for_sale", "", "", "",
     "ask the sender to re-share", "", "", 0, 0, "02/08/2026", 0, 0, 0, "expired", 3),
]
KIT_ITEMS = [
    ("Sale Deed 2214/2016", "Title", "seller's purchase from B. Rao", "ok"),
    ("Pattadar passbook 20418", "Revenue record", "name matches the deed", "ok"),
    ("ROR / Adangal 1-B", "Revenue record", "2025-26", "ok"),
    ("FMB sheet — 96", "Map", "sketch only, no survey report", "ok"),
    ("EC, 2016–2023", "Search & tax", "stops 3 years short", "warn"),
    ("12 photos", "Photos", "no date or location stamp", "missing"),
]
KIT_CHECKS = [
    ("The last 3 years of encumbrance", "A loan taken in 2024 would not show", 1900),
    ("That the fence matches the FMB", "Licensed surveyor, 3 days", 2900),
    ("That the land looks like the photos", "Our caretaker, dated geo-stamped photos", 1200),
    ("That the title holds", "Advocate reads this kit · 5 days", 7500),
]


def main() -> None:
    with psycopg.connect(DSN, autocommit=True) as conn:
        # Wipe only our own rows.
        for table, col in [
            ("record_tags", "id"), ("boundary_marks", "id"), ("record_people", "id"),
            ("people_payments", "id"), ("purchase_lots", "id"), ("capital_costs", "id"),
            ("share_links", "id"), ("document_versions", "id"), ("shared_kit_items", "id"),
            ("shared_kit_checks", "id"), ("shared_kits", "id"), ("waiting_items", "id"),
            ("land_features", "id"), ("land_expenses", "id"), ("notes", "id"),
            ("work_requests", "id"),
            ("parcel_photos", "id"), ("documents", "id"), ("parcels", "id"),
            ("properties", "id"), ("passbooks", "id"),
        ]:
            conn.execute(f"DELETE FROM {table} WHERE {col} LIKE %s", (P + "%",))
            # A demo identity (w360-*) is seeded data and nothing else, so it is
            # also wiped wholesale — otherwise rows the app itself created (an
            # expense saved through the UI, say) survive and the e2e suite stops
            # being re-runnable. Never done for a real user id.
            if UID.startswith(P) and table not in ("passbooks",):
                try:
                    conn.execute(f"DELETE FROM {table} WHERE owner_user_id = %s", (UID,))
                except psycopg.errors.UndefinedColumn:
                    pass

        for pid, khata, dist, mandal, village, owner in PASSBOOKS:
            conn.execute(
                "INSERT INTO passbooks (id, owner_user_id, pattadar_no, district, mandal,"
                " village, created_at, state, owner_name) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (pid, UID, khata, dist, mandal, village, "2026-08-01", "Andhra Pradesh", owner))

        for (pid, pb, sy, sub, ext, status, stake, mkt, paid, paid_on, loan, geo, shape) in PARCELS:
            conn.execute(
                "INSERT INTO parcels (id, passbook_id, survey_no, subdivision, extent, unit,"
                " classification, geo_point, created_at, status, stake, market_value,"
                " purchase_price, purchase_date, loan_amount, guideline_value, shape, address)"
                " VALUES (%s,%s,%s,%s,%s,'Acres-Guntas','agri',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (pid, pb, sy, sub, ext, geo, OPENED.get(pid, "2026-08-01"), status, stake, mkt, paid, paid_on,
                 loan, mkt * 0.7, shape, "కొత్తపల్లి, పెద్దాపురం" if "214" in sy else ""))

        for (rid, typ, label, locality, city, built, land, status, stake, mkt, paid,
             geo, shape) in PROPERTIES:
            conn.execute(
                "INSERT INTO properties (id, owner_user_id, type, label, locality, city,"
                " district, builtup_area, land_area, holding_status, stake, market_value,"
                " purchase_price, geo_point, shape, owner_name, created_at, builtup_unit,"
                " land_unit) VALUES (%s,%s,%s,%s,%s,%s,'Kakinada',%s,%s,%s,%s,%s,%s,%s,%s,"
                "'T. Sankara Rao',%s,'Sq.ft','Sq.yd')",
                (rid, UID, typ, label, locality, city, built, land, status, stake, mkt,
                 paid, geo, shape, OPENED.get(rid, '2026-08-01')))

        for i, (etype, eid, tag) in enumerate(TAGS):
            conn.execute(
                "INSERT INTO record_tags (id, owner_user_id, entity_type, entity_id, tag,"
                " created_at) VALUES (%s,%s,%s,%s,%s,'2026-08-01')",
                (f"{P}tag-{i}", UID, etype, eid, tag))

        parcel = P + "p-214-2"
        for i, (label, spec, icon, cat, cond, state, note, lat, lon, pin, pics, acts) in \
                enumerate(FEATURES):
            conn.execute(
                "INSERT INTO land_features (id, owner_user_id, entity_type, entity_id,"
                " category, label, value, unit, reference, note, created_at, vendor,"
                " condition, condition_state, spec, lat, lon, pin_label, photo_count,"
                " actions, icon, sort) VALUES (%s,%s,'record',%s,%s,%s,0,'','',%s,"
                "'2026-08-01','',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (f"{P}f-{i}", UID, parcel, cat, label, note, cond, state, spec, lat, lon,
                 pin, pics, __import__("json").dumps(acts), icon, i))

        for (did, title, sub, shelf, pages, reg, office, buyer, seller, cons) in PAPERS_214_2:
            # `name` IS the title in public.documents — there is no `title` column.
            conn.execute(
                "INSERT INTO documents (id, owner_user_id, name, subtitle, shelf,"
                " page_count, registered_on, office, buyer, seller, consideration,"
                " record_id, parcel_id, doc_type, created_at, size_bytes) VALUES"
                " (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'2026-08-01',%s)",
                (did, UID, title, sub, shelf, pages, reg, office, buyer, seller,
                 cons, parcel, parcel, shelf, 3_355_443 if pages > 20 else 240_000))
            summary, flag, flag_page = READINGS.get(did, ("", "", 0))
            if summary:
                conn.execute(
                    "UPDATE documents SET reader_summary=%s, reader_flag=%s,"
                    " reader_flag_page=%s WHERE id=%s", (summary, flag, flag_page, did))

        # Filler so the eight vault shelves hit their exact counts.
        have: dict = {}
        for row in PAPERS_214_2:
            have[row[3]] = have.get(row[3], 0) + 1
        n = 0
        for shelf, target in SHELF_TARGET.items():
            name, note = SHELF_FILLER[shelf]
            for k in range(target - have.get(shelf, 0)):
                n += 1
                conn.execute(
                    "INSERT INTO documents (id, owner_user_id, name, subtitle, shelf,"
                    " page_count, record_id, parcel_id, doc_type, created_at, size_bytes)"
                    " VALUES (%s,%s,%s,%s,%s,2,'','',%s,'2026-08-01',180000)",
                    (f"{P}d-fill-{n}", UID, f"{name} {k + 1}", note, shelf, shelf))

        for (vid, doc, ver, label, on, by, note, sort) in VERSIONS:
            conn.execute(
                "INSERT INTO document_versions (id, owner_user_id, document_id, version,"
                " label, made_on, made_by, note, sort) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (vid, UID, doc, ver, label, on, by, note, sort))

        # 31 photos + 1 video across four visits. The first is W05/W14's subject.
        cats = ["Boundary", "Crop", "Water", "Structures", "Access"]
        visits = ["2026-08-12", "2026-05-04", "2026-02-11", "2025-11-19"]
        for i in range(32):
            visit = visits[min(i // 8, 3)]
            first = i == 0
            forwarded = i in (29, 30)     # W14: "Two photos here prove nothing"
            feat = f"{P}f-0" if i in (0, 1, 2, 3, 4, 29, 30) else (f"{P}f-{i % 14}")
            conn.execute(
                "INSERT INTO parcel_photos (id, parcel_id, owner_user_id, file_ref, category,"
                " caption, latitude, longitude, captured_at, captured_by, is_cover, created_at,"
                " source, sha256, order_ref, verified, feature_id, accuracy_m, device_clock_ok,"
                " pin_distance_m, media_kind, width, height, file_name, local_time, sort)"
                " VALUES (%s,%s,%s,'',%s,%s,%s,%s,%s,%s,%s,'2026-08-01',%s,%s,%s,%s,%s,%s,"
                " %s,%s,%s,%s,%s,%s,%s,%s)",
                (f"{P}ph-{i:02d}", parcel, UID, cats[i % 5],
                 "South-east boundary stone" if first else f"{cats[i % 5]} · visit {visit}",
                 17.0779 if first else 17.0770 + (i % 9) * 0.0003,
                 82.1402 if first else 82.1385 + (i % 7) * 0.0004,
                 f"{visit} 07:41 IST" if first else f"{visit} 08:0{i % 6} IST",
                 "M. Satyanarayana", first, "forwarded" if forwarded else "app",
                 "4f9c8b21e7d3a05614be92cf70a8d1364e5b7c29af03d8e1965a2b4c7d0e21ab"
                 if not forwarded else "",
                 "PT-2081" if i < 14 else "", not forwarded, feat, 4 if not forwarded else 0,
                 True, 6 if not forwarded else 0, "video" if i == 31 else "photo",
                 4032, 3024, f"IMG_2{200 + i}.jpg",
                 "11/08/2026 21:11" if first else "", i))

        for (mid, seq, label, state, detail, lat, lon, pics, on) in MARKS:
            conn.execute(
                "INSERT INTO boundary_marks (id, owner_user_id, record_id, seq, label, state,"
                " detail, lat, lon, photo_count, noted_on, created_at)"
                " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'2026-08-01')",
                (mid, UID, parcel, seq, label, state, detail, lat, lon, pics, on))

        for (pid_, name, ini, role, badges, summary, arr, plabel, pval, dlabel, dval,
             vis, acts, compact, sort) in PEOPLE:
            conn.execute(
                "INSERT INTO record_people (id, owner_user_id, record_id, person_name,"
                " initials, role, badges, summary, arrangement, pay_label, pay_value,"
                " due_label, due_value, visibility, actions, compact, sort, created_at)"
                " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'2026-08-01')",
                (pid_, UID, parcel, name, ini, role, __import__("json").dumps(badges),
                 summary, arr, plabel, pval, dlabel, dval, vis,
                 __import__("json").dumps(acts), compact, sort))

        for (yid, title, sub, on, method, amt, direction, state, sort) in PAYMENTS:
            conn.execute(
                "INSERT INTO people_payments (id, owner_user_id, record_id, title, subtitle,"
                " occurred_on, method, amount, direction, state, sort)"
                " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (yid, UID, parcel, title, sub, on, method, amt, direction, state, sort))

        big = P + "p-88"
        for (lid, on, ext, rate, paid, govt, seller, deed, sro, sort) in LOTS:
            conn.execute(
                "INSERT INTO purchase_lots (id, owner_user_id, record_id, bought_on, extent,"
                " extent_unit, rate, paid, govt_value, seller, deed_no, sro, sort)"
                " VALUES (%s,%s,%s,%s,%s,'ac',%s,%s,%s,%s,%s,%s,%s)",
                (lid, UID, big, on, ext, rate, paid, govt, seller, deed, sro, sort))
        for (cid, label, amt, sort) in EXTRAS:
            conn.execute(
                "INSERT INTO capital_costs (id, owner_user_id, record_id, label, amount, sort)"
                " VALUES (%s,%s,%s,%s,%s,%s)", (cid, UID, big, label, amt, sort))

        def ledger(prefix: str, record: str, rows: list) -> None:
            for i, (title, sub, on_label, on_icon, kind, paid_by, amt, when, cat,
                    recov, note) in enumerate(rows):
                conn.execute(
                    "INSERT INTO land_expenses (id, owner_user_id, entity_type, entity_id,"
                    " category, title, amount, spent_on, vendor, note, created_at, kind,"
                    " subtitle, on_label, on_icon, feature_id, paid_by, recoverable,"
                    " recoverable_note, has_receipt, fiscal_year) VALUES"
                    " (%s,%s,'record',%s,%s,%s,%s,%s,'','','2026-08-01',%s,%s,%s,%s,'',%s,"
                    "%s,%s,true,'2026-27')",
                    (f"{P}{prefix}-{i}", UID, record, cat, title, amt, when, kind, sub,
                     on_label, on_icon, paid_by, recov, note))

        ledger("ex88", big, EXPENSES_88)
        ledger("exfl", P + "r-flat4b", EXPENSES_FLAT)

        for (lid, aud, subj, terms, doc, cnt, opened, last, exp, days, sort) in LINKS:
            conn.execute(
                "INSERT INTO share_links (id, owner_user_id, audience, subject, terms,"
                " document_id, doc_count, opened_count, last_opened_at, expires_on, sort,"
                " created_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'2026-08-01')",
                (lid, UID, aud, subj, terms, doc, cnt, opened, last, exp, days))

        for (wid, title, detail, icon, action, kind, rec, sort) in WAITING:
            conn.execute(
                "INSERT INTO waiting_items (id, owner_user_id, title, detail, icon,"
                " action_label, action_kind, record_id, sort)"
                " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (wid, UID, title, detail, icon, action, kind, rec, sort))

        for (oid, kind, title, note, who, cost, stage, needs, due) in ORDERS:
            conn.execute(
                "INSERT INTO work_requests (id, owner_user_id, kind, title, entity_type,"
                " entity_id, assignee, cost, stage, needs_you, note, due_date, closed,"
                " created_at) VALUES (%s,%s,%s,%s,'record',%s,%s,%s,%s,%s,%s,%s,false,"
                "'2026-08-01')",
                (P + oid, UID, kind, title, parcel, who, cost, stage, needs, note, due))

        for (kid, title, headline, kind, purpose, line, sender, ini, snote, at, terms,
             opened, days, expired, price, pics, feats, state, sort) in KITS:
            conn.execute(
                "INSERT INTO shared_kits (id, recipient_user_id, title, headline, kind,"
                " purpose, list_line, sender_name, sender_initials, sender_note, shared_at,"
                " terms, opened_count, days_left, expired_on, asked_price, photo_count,"
                " feature_count, state, sort) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,"
                "%s,%s,%s,%s,%s,%s,%s,%s)",
                (kid, UID, title, headline, kind, purpose, line, sender, ini, snote, at,
                 terms, opened, days, expired, price, pics, feats, state, sort))

        kit = P + "kit-96-3"
        for i, (title, shelf, note, verdict) in enumerate(KIT_ITEMS):
            conn.execute(
                "INSERT INTO shared_kit_items (id, kit_id, title, shelf, note, verdict, sort)"
                " VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (f"{P}ki-{i}", kit, title, shelf, note, verdict, i))
        for i, (title, note, price) in enumerate(KIT_CHECKS):
            conn.execute(
                "INSERT INTO shared_kit_checks (id, kit_id, title, note, price, sort)"
                " VALUES (%s,%s,%s,%s,%s,%s)", (f"{P}kc-{i}", kit, title, note, price, i))

        conn.execute(
            "INSERT INTO notes (id, owner_user_id, entity_type, entity_id, body, created_at)"
            " VALUES (%s,%s,'record',%s,%s,%s)",
            (P + "note-1", UID, parcel,
             "Ramesh says the buyer wants possession after the kharif harvest.",
             "09/08/2026 18:20"))

        counts = {}
        for t in ("parcels", "properties", "documents", "land_features", "parcel_photos",
                  "record_people", "land_expenses", "shared_kits", "share_links",
                  "boundary_marks", "purchase_lots", "waiting_items"):
            cur = conn.execute(f"SELECT count(*) FROM {t} WHERE 1=1")
            counts[t] = cur.fetchone()[0]
        print(f"seeded for {UID}: " + ", ".join(f"{k}={v}" for k, v in counts.items()))


if __name__ == "__main__":
    main()
