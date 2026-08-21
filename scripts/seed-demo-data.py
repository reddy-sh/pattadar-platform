#!/usr/bin/env python
"""Fill every empty record with believable demo content, removably.

    .local/api-venv/bin/python scripts/seed-demo-data.py <user_id>
    .local/api-venv/bin/python scripts/seed-demo-data.py <user_id> --purge

Why this exists: a record with no papers, no features, no people and no money
renders as a shell — ₹0, 0.0000° N, "No paper here matches that" — which tells
you nothing about whether the screen is right. This walks every parcel and
property a user owns and gives the empty ones a full set, so all fifteen
screens can be judged on real-shaped data.

REMOVAL IS THE POINT. Everything written here is either:
  · a row whose id starts `demo-`, or
  · a base field on a record that was empty/zero, recorded in `demo_stamp`.
`--purge` deletes the first and restores the second, leaving the database
exactly as it was. Nothing that already held a value is ever overwritten.

Scope rules:
  · A record that already has papers keeps its papers; each data type is filled
    only where the record has none. The hand-authored screenshot set
    (`scripts/seed-web360.py`, ids `w360-`) is therefore untouched.
  · Content is generated from a hash of the record id, so runs are identical
    and no two records look alike.
"""
import hashlib
import os
import random
import sys

import psycopg

DSN = os.getenv("APP_PG_DSN",
                "host=localhost port=5432 dbname=pattadar user=rhub password=rhub-dev-pwd")
P = "demo-"

# ── Content pools ─────────────────────────────────────────────────────

FEATURES_LAND = [
    ("Borewell {n}", "{d} ft · {hp} HP · {yr}", "bore", "water",
     ["Working", "Yield dropped", "Motor rewound {yr}"],
     ["Feeds the {blk} block. Billed on SC {sc}.",
      "Motor runs, water at 2 in. Flushing suggested.",
      "Dug {yr}. Casing intact."]),
    ("Open well", "{d} ft · stone lined", "well", "water",
     ["Working", "Silted", "Dry in summer"],
     ["Feeds the {blk} block. Unfenced.", "Steps on the east side. Needs a parapet."]),
    ("Farm pond", "{a} × {a} m · 3 m", "pond", "water",
     ["60% full", "Working", "Silt clearing due"],
     ["MGNREGS {yr}. Silt clearing due.", "Holds through January in a normal year."]),
    ("Drip irrigation", "{ac} ac · subsidy {yr}", "drip", "water",
     ["Working", "Two laterals blocked"],
     ["Sanction order is in Papers.", "Covers the {blk} block only."]),
    ("Pump set", "{hp} HP · Texmo", "pump", "power",
     ["Working", "Serviced {mm}/{yr}", "Starter panel replaced"],
     ["Starter panel replaced. Bill filed.", "Runs on the free agricultural supply."]),
    ("Transformer", "{kv} kVA · shared ×{sh}", "power", "power",
     ["Working", "Repaired {mm}/{yr}"],
     ["APEPDCL {sc}. Your share of repairs: ⅓.",
      "Shared with {sh} neighbouring pattas."]),
    ("Service meter", "SC {sc} · {kv} kVA", "power", "power",
     ["Working", "Free agricultural supply"],
     ["The bill account every power row hangs off."]),
    ("Barbed fence", "{m} m · 4 strand", "fence", "structures",
     ["Working", "Broken, east side", "Posts leaning on the north"],
     ["40 m down. Cattle coming through.", "Rebuilt {yr}. Angle posts every 8 m."]),
    ("Compound wall", "{m} m · brick", "fence", "structures",
     ["Working", "Cracked near the gate"],
     ["Built {yr}. Coping intact."]),
    ("Gate", "Steel · {ft} ft · {dir}", "gate", "structures",
     ["Locked", "Hinge loose"],
     ["The caretaker holds the key. Photographed at every visit."]),
    ("Farm house", "{sf} sq.ft · tin roof · metered", "house", "structures",
     ["Working", "Roof sheet loose"],
     ["Pump panel, pipes, watchman's cot."]),
    ("Shed", "{sf} sq.ft · asbestos", "house", "structures",
     ["Working", "Needs re-roofing"],
     ["Stores the pump spares and fertiliser."]),
    ("Coconut trees", "{n2} trees · {yr}", "trees", "planting",
     ["Bearing · 2 lost", "Bearing", "Young"],
     ["North bund. Lease income under Money.", "Planted along the {dir} boundary."]),
    ("Mango trees", "{n2} trees · {yr}", "trees", "planting",
     ["Bearing", "Bearing · pruned {mm}/{yr}"],
     ["Banganapalli. Leased to a contractor each season."]),
    ("Standing crop", "{crop} · {season} {yr}", "crop", "planting",
     ["Sown {dd}/{mm}/{yr}", "Harvest expected {mm}/{yr}"],
     ["Tenant {who}. Harvest expected {mm}/{yr}.", "Own cultivation this season."]),
    ("Approach road", "{m} m · kutcha", "road", "access",
     ["Muddy in monsoon", "Working"],
     ["Off the main road. Right of way is in the deed."]),
    ("Field bund", "{m} m · earthen", "road", "access",
     ["Working", "Breached after the rain"],
     ["Rebuilt after the {yr} rain."]),
]

FEATURES_BUILT = [
    ("Lift", "6 passenger · {yr}", "power", "power",
     ["Working", "AMC due {mm}/{yr}"], ["Society AMC. Shared cost."]),
    ("Water tank", "{lt} litres · overhead", "pond", "water",
     ["Working", "Cleaned {mm}/{yr}"], ["Cleaned twice a year by the society."]),
    ("Borewell", "{d} ft · society", "bore", "water",
     ["Working", "Yield dropped"], ["Society bore. Tankers in summer."]),
    ("Car park", "1 slot · stilt", "road", "access",
     ["Allotted", "Working"], ["Slot {n} on the stilt floor. In the sale deed."]),
    ("Generator", "{kv} kVA · diesel", "power", "power",
     ["Working", "Serviced {mm}/{yr}"], ["Backs up the lift and common lights."]),
    ("Solar water heater", "200 litres", "power", "power",
     ["Working"], ["On the terrace. Installed {yr}."]),
]

PAPERS = [
    ("Sale Deed {no}/{yr}", "title", "Registered {dd}/{mm}/{yr} · SRO {sro} · ₹{amt} · {pg} pages"),
    ("Agreement of sale", "title", "Unregistered · scanned {dd}/{mm}/{yr}"),
    ("Gift Deed {no}/{yr}", "title", "Registered {dd}/{mm}/{yr} · SRO {sro}"),
    ("Partition deed {no}/{yr}", "title", "Between brothers · SRO {sro}"),
    ("Pattadar passbook {kh}", "revenue", "Read {dd}/{mm}/{yr} · owner, village and extent matched"),
    ("ROR / Adangal 1-B", "revenue", "Revenue record · {yr}-{yr2}"),
    ("Pahani, {yr}-{yr2}", "revenue", "Revenue record · village office copy"),
    ("Mutation order {sy}", "revenue", "Tahsildar, {mandal} · {dd}/{mm}/{yr}"),
    ("Faisal patti extract", "revenue", "Revenue record · village office"),
    ("FMB sheet — {fmb}", "map", "Sketch with 4 boundary marks"),
    ("Tippon — {fmb}", "map", "Map · traced from the village sheet"),
    ("Village survey sheet", "map", "Map · scanned at the mandal office"),
    ("EC, {yr0}–{yr}", "search", "Search & tax · clear at purchase"),
    ("Land revenue receipt, {yr}-{yr2}", "search", "Search & tax · paid {dd}/{mm}/{yr}"),
    ("Water tax challan", "search", "Search & tax · paid {dd}/{mm}/{yr}"),
    ("Sethwar extract", "old", "Old record · 1954 settlement"),
    ("Khasra pahani 1954", "old", "Old record · first settlement"),
    ("Aadhaar", "identity", "Masked until you unlock"),
    ("PAN", "identity", "Masked until you unlock"),
    ("Scan {dd}-{mm}", "unsorted", "Nothing recognised it"),
]

# A flat does not have a tenant farmer, and nobody is paid "at harvest" for it.
PEOPLE_BUILT = [
    ("{who}", "Tenant", ["Tenant"],
     "Lives in the flat on an 11-month agreement · rent {dd} of each month · "
     "agreement scanned into the vault",
     "Let directly", "They pay you", "\u20b9{rentm} / month", "Next due", "{dd}/{mm}/{yr}",
     "Nothing \u2014 not a user",
     ["Record a payment", "Lease agreement", "Invite to the app", "End the tenancy"], False),
    ("{who}", "Letting agent \u00b7 per let", ["Professional \u00b7 per matter"],
     "Finds and screens tenants \u00b7 one month's rent per let \u00b7 handles the deposit",
     "", "", "", "", "", "", ["Message", "End the arrangement"], True),
    ("{who}", "Society secretary", ["Family"],
     "Collects the monthly dues and calls about repairs \u00b7 unpaid",
     "", "", "", "", "", "", ["Permissions"], True),
    ("{who}", "Watchman", ["Family"],
     "Opens the flat for viewings \u00b7 paid by the society",
     "", "", "", "", "", "", ["Permissions"], True),
]

PEOPLE = [
    ("{who}", "MS", "Pattadar caretaker", ["Pattadar caretaker", "ID verified"],
     "Monthly site visit, dated photos, boundary walk · {n2} visits since {yr} · "
     "lives {n} km away in {mandal}",
     "Through Pattadar", "Pay", "₹{pay} / month", "Next payout", "{dd}/{mm}/{yr}",
     "This record only",
     ["Message", "Change pay", "Visit schedule", "Their photos", "End the arrangement"], False),
    ("{who}", "RK", "Tenant farmer · you found him", [],
     "Farms {ac} ac on a seasonal lease · {crop}, {season} {yr} · agreement scanned into the vault",
     "Self-hired", "They pay you", "₹{rent} / season", "Due", "{dd}/{mm}/{yr}",
     "Nothing — not a user",
     ["Record a payment", "Lease agreement", "Invite to the app", "End the lease"], False),
    ("{who}", "TR", "Family", ["Family"],
     "Brother · can view and add papers · unpaid · in India, decides on the ground",
     "", "", "", "", "", "", ["Permissions"], True),
    ("{who}", "KP", "Professional · per matter", ["Professional · per matter"],
     "Advocate · title opinion · ₹{fee} paid {dd}/{mm}/{yr}", "", "", "", "", "", "",
     ["Extend access"], True),
    ("{who}", "GS", "Assigned by an order", ["Assigned by an order"],
     "Licensed surveyor · re-survey {ord} · ₹{esc} held in escrow until you accept the sketch",
     "", "", "", "", "", "", ["Track order"], True),
    ("{who}", "MV", "Watchman", ["Family"],
     "Neighbour · opens the gate for visits · unpaid", "", "", "", "", "", "",
     ["Permissions"], True),
]

NAMES = ["M. Satyanarayana", "Ravi Kumar", "T. Ramesh", "K. Prasad", "G. Srinivas",
         "B. Venkanna", "P. Anitha", "D. Nagaraju", "S. Lakshmi", "V. Chandra Rao",
         "M. Venkatesh", "K. Satyavathi", "A. Suresh", "N. Padma", "R. Bhaskar"]

EXPENSES_LAND = [
    ("APEPDCL bill · {n3} units", "Power", "running", "You · UPI", 900, 2600),
    ("Land revenue (kist) · {yr}-{yr2}", "Tax & kist", "running", "You · card", 800, 3400),
    ("Bund repair after the rain · {n} workers, 2 days", "Labour", "running", "Caretaker", 4000, 12000),
    ("Weeding and channel clearing", "Labour", "running", "Caretaker", 2500, 9000),
    ("Seed and urea for the {season} sowing", "Seed & inputs", "running", "You, for tenant", 5000, 14000),
    ("Pesticide spray · 2 rounds", "Seed & inputs", "running", "Caretaker", 1800, 6000),
    ("Caretaker, monthly visit", "Caretaker", "running", "Wallet · auto", 1000, 1600),
    ("Advocate · title opinion", "Legal", "running", "You · card", 5000, 9000),
    ("Bore flushing and new starter panel", "Repairs", "capital", "Caretaker", 12000, 26000),
    ("Fence rebuilt, east side · 40 m", "Repairs", "capital", "Pattadar order", 22000, 45000),
    ("New bore, {d} ft", "Repairs", "capital", "You · card", 80000, 180000),
    ("Levelling and bund forming", "Repairs", "capital", "Caretaker", 18000, 40000),
]

EXPENSES_BUILT = [
    ("Society maintenance", "Society maintenance", "running", "Wallet · auto", 2200, 4200),
    ("Property tax · {yr}-{yr2}", "Property tax", "running", "You · UPI", 6000, 12000),
    ("Water tanker · summer shortage", "Water", "running", "Society, shared", 700, 1600),
    ("Bathroom leak · plumbing and tiles", "Repairs", "running", "Letting agent", 4000, 9000),
    ("Letting agent · one month's commission", "Letting agent", "running", "You · UPI", 12000, 18000),
    ("Repainted, two coats · between tenants", "Painting", "capital", "You · card", 22000, 36000),
    ("Modular kitchen fitted", "Painting", "capital", "You · card", 60000, 120000),
]

_MONTH = {1: "January", 2: "February", 3: "March", 4: "April", 5: "May", 6: "June",
          7: "July", 8: "August", 9: "September", 10: "October", 11: "November",
          12: "December"}

CROPS = ["paddy", "cotton", "groundnut", "maize", "red gram", "chilli"]
SEASONS = ["kharif", "rabi"]
DIRS = ["north", "south", "east", "west"]
BLOCKS = ["north", "south", "east", "west", "upper", "lower"]
SROS = ["Peddapuram", "Kakinada", "Tarlupadu", "Markapur", "Samalkot", "Pithapuram"]

# Tables this script writes to, and the column its demo rows are keyed by.
DEMO_TABLES = [
    "record_tags", "boundary_marks", "record_people", "people_payments",
    "purchase_lots", "capital_costs", "share_links", "document_versions",
    "waiting_items", "land_features", "land_expenses", "notes", "parcel_photos",
    "documents", "work_requests", "property_photos",
]

# Tables keyed by the owner rather than by a `demo-` id.
OWNER_TABLES = ["wallet_accounts"]


def rng_for(record_id: str) -> random.Random:
    """A stable generator per record: same input, same demo content, forever."""
    return random.Random(int(hashlib.sha256(record_id.encode()).hexdigest()[:12], 16))


def fill(template: str, r: random.Random, ctx: dict) -> str:
    """Expand a content template. Every placeholder resolves; a stray one would
    otherwise ship '{sc}' into the interface."""
    vals = {
        "n": r.randint(1, 6), "n2": r.randint(14, 90), "n3": r.randint(120, 800),
        "d": r.choice([280, 320, 380, 420, 450, 500]),
        "hp": r.choice([3, 5, 7]), "kv": r.choice([16, 25, 63, 100]),
        "sh": r.randint(2, 4), "m": r.choice([180, 220, 400, 620, 800]),
        "ft": r.choice([8, 10, 12]), "sf": r.choice([120, 200, 240, 400]),
        "a": r.choice([12, 15, 18, 22]), "lt": r.choice([5000, 10000, 20000]),
        "ac": f"{r.uniform(0.4, 4.0):.1f}",
        "yr": r.randint(2010, 2025), "yr0": r.randint(1998, 2008),
        "yr2": 27, "mm": f"{r.randint(1, 12):02d}", "dd": f"{r.randint(1, 28):02d}",
        "sc": f"44{r.randint(10000, 99999)}", "crop": r.choice(CROPS),
        "season": r.choice(SEASONS), "dir": r.choice(DIRS), "blk": r.choice(BLOCKS),
        "sro": r.choice(SROS), "who": r.choice(NAMES),
        "pay": f"{r.choice([800, 1000, 1200, 1500]):,}",
        "rent": f"{r.choice([28000, 35000, 42000, 55000]):,}",
        "rentm": f"{r.choice([12000, 15500, 18000, 24000]):,}",
        "fee": f"{r.choice([5000, 7500, 12000]):,}",
        "esc": f"{r.choice([1900, 2900, 4500]):,}",
        "ord": f"PT-{r.randint(1000, 9999)}",
        "no": r.randint(200, 9000), "pg": r.randint(4, 30),
        "amt": f"{r.randint(8, 90) * 100000:,}",
        "fmb": r.randint(20, 400), "kh": r.randint(100, 90000),
    }
    vals.update(ctx)
    out = template
    for k, v in vals.items():
        out = out.replace("{" + k + "}", str(v))
    return out


def ensure_stamp(conn) -> None:
    """Records which base fields this script filled, so --purge can put them
    back. Without it, 'remove the demo data' could not restore a record that
    genuinely had no market value."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS demo_stamp (
            record_id TEXT NOT NULL,
            table_name TEXT NOT NULL,
            fields TEXT NOT NULL DEFAULT '',
            owner_user_id TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (record_id, table_name)
        )
    """)
    conn.execute("ALTER TABLE demo_stamp ADD COLUMN IF NOT EXISTS "
                 "owner_user_id TEXT NOT NULL DEFAULT ''")


def purge(conn, uid: str = "") -> None:
    """Remove generated filler. Pass a user id to scope it — an unscoped purge
    wipes EVERY user's demo data, which is how the test suite's setup once ate
    the founder's."""
    ensure_stamp(conn)
    removed = 0
    for t in DEMO_TABLES:
        try:
            if uid:
                cur = conn.execute(
                    f"DELETE FROM {t} WHERE id LIKE %s AND owner_user_id = %s",
                    (P + "%", uid))
            else:
                cur = conn.execute(f"DELETE FROM {t} WHERE id LIKE %s", (P + "%",))
            removed += cur.rowcount or 0
        except (psycopg.errors.UndefinedTable, psycopg.errors.UndefinedColumn):
            pass
    for t in OWNER_TABLES:
        try:
            if uid:
                cur = conn.execute(f"DELETE FROM {t} WHERE owner_user_id = %s", (uid,))
            else:
                cur = conn.execute(f"DELETE FROM {t}")
            removed += cur.rowcount or 0
        except psycopg.errors.UndefinedTable:
            pass
    # Put the base fields back exactly as they were: empty.
    reverted = 0
    cur = conn.execute(
        "SELECT record_id, table_name, fields FROM demo_stamp"
        + (" WHERE owner_user_id = %s" if uid else ""),
        (uid,) if uid else ())
    for row in cur.fetchall():
        rid, table, fields = row
        sets = []
        for f in fields.split(","):
            if not f:
                continue
            sets.append(f"{f} = " + ("0" if f in {
                "market_value", "purchase_price", "guideline_value", "loan_amount",
                "current_value"} else "''"))
        if sets:
            conn.execute(f"UPDATE {table} SET {', '.join(sets)} WHERE id = %s", (rid,))
            reverted += 1
    if uid:
        conn.execute("DELETE FROM demo_stamp WHERE owner_user_id = %s", (uid,))
    else:
        conn.execute("DELETE FROM demo_stamp")
    who = uid or "all users"
    print(f"purged {who}: {removed} demo rows deleted, {reverted} records reset to empty")


def records_for(conn, uid: str) -> list:
    """Every record the user owns, in one shape."""
    out = []
    cur = conn.execute(
        "SELECT p.id, p.survey_no, p.subdivision, p.extent, p.market_value,"
        " p.purchase_price, p.purchase_date, p.geo_point, p.shape, p.status,"
        " pb.pattadar_no, pb.village, pb.mandal, pb.district"
        " FROM parcels p JOIN passbooks pb ON pb.id = p.passbook_id"
        " WHERE pb.owner_user_id = %s", (uid,))
    for r in cur.fetchall():
        out.append({
            "id": r[0], "kind": "parcel",
            "title": f"Sy {r[1]}" + (f"/{r[2]}" if r[2] else ""),
            "extent": float(r[3] or 0), "extent_unit": "ac", "market": float(r[4] or 0),
            "paid": float(r[5] or 0), "bought": r[6] or "", "geo": r[7] or "",
            "shape": r[8] or "", "status": r[9] or "owned", "khata": r[10] or "",
            "village": r[11] or "", "mandal": r[12] or "", "district": r[13] or "",
            "table": "parcels",
        })
    cur = conn.execute(
        "SELECT id, label, type, builtup_area, land_area, market_value, purchase_price,"
        " geo_point, shape, holding_status, locality, city, district"
        " FROM properties WHERE owner_user_id = %s", (uid,))
    for r in cur.fetchall():
        built = float(r[3] or 0)
        out.append({
            "id": r[0], "kind": "property", "title": r[1] or "Property",
            "type": r[2] or "open_plot",
            "extent": built or float(r[4] or 0),
            "extent_unit": "sq.ft" if built else "sq.yd", "market": float(r[5] or 0),
            "paid": float(r[6] or 0), "bought": "", "geo": r[7] or "",
            "shape": r[8] or "", "status": r[9] or "owned", "khata": "",
            "village": r[10] or "", "mandal": r[11] or "", "district": r[12] or "",
            "table": "properties", "built": built,
        })
    return out


def has_rows(conn, table: str, col: str, value: str) -> bool:
    cur = conn.execute(f"SELECT 1 FROM {table} WHERE {col} = %s LIMIT 1", (value,))
    return cur.fetchone() is not None


def seed(conn, uid: str) -> None:
    ensure_stamp(conn)
    recs = records_for(conn, uid)
    if not recs:
        print(f"no records for {uid} — nothing to fill")
        return

    counts = {k: 0 for k in
              ("base", "papers", "features", "people", "payments", "photos",
               "marks", "expenses", "money", "orders", "notes", "tags", "links")}

    for rec in recs:
        r = rng_for(rec["id"])
        rid = rec["id"]
        land = rec["kind"] == "parcel"
        unit_rate = r.choice([600000, 850000, 1200000, 1800000, 2250000])   # ₹/acre
        ctx = {
            "mandal": rec["mandal"] or rec["district"] or "the mandal",
            "sy": rec["title"].replace("Sy ", ""),
            "kh": rec["khata"] or r.randint(100, 90000),
        }

        # ── base fields: only ever fill what is empty ────────────────
        filled = []
        sets, args = [], []
        if rec["market"] == 0:
            worth = (rec["extent"] * unit_rate) if land else (rec["extent"] * r.choice([3200, 4800, 6500]))
            worth = max(worth, 250000)
            sets.append("market_value = %s"); args.append(round(worth, -3))
            filled.append("market_value")
            rec["market"] = round(worth, -3)
        if rec["paid"] == 0:
            paid = rec["market"] * r.uniform(0.45, 0.75)
            sets.append("purchase_price = %s"); args.append(round(paid, -3))
            filled.append("purchase_price")
            rec["paid"] = round(paid, -3)
        if not rec["geo"]:
            lat = round(r.uniform(15.2, 17.6), 4)
            lon = round(r.uniform(78.4, 82.9), 4)
            sets.append("geo_point = %s"); args.append(f"{lat},{lon}")
            filled.append("geo_point")
            rec["geo"] = f"{lat},{lon}"
        if not rec["shape"]:
            x = round(r.uniform(0.08, 0.55), 2)
            y = round(r.uniform(0.08, 0.55), 2)
            w = round(r.uniform(0.16, 0.30), 2)
            h = round(r.uniform(0.14, 0.26), 2)
            skew = round(r.uniform(-0.03, 0.03), 2)
            sets.append("shape = %s")
            args.append(f"{x},{y + h} {x + skew},{y} {x + w},{y - skew} {x + w},{y + h}")
            filled.append("shape")
        if land and not rec["bought"]:
            sets.append("purchase_date = %s")
            args.append(f"{r.randint(2008, 2023)}-{r.randint(1, 12):02d}-{r.randint(1, 28):02d}")
            filled.append("purchase_date")
        # A loan is only invented for a record that arrived completely bare.
        # Adding one to a record whose figures were authored on purpose changes
        # a portfolio total someone chose — that is editing, not filling in.
        if land and "market_value" in filled and r.random() < 0.25:
            sets.append("loan_amount = %s")
            args.append(round(rec["market"] * r.uniform(0.15, 0.4), -4))
            filled.append("loan_amount")
        if sets:
            conn.execute(f"UPDATE {rec['table']} SET {', '.join(sets)} WHERE id = %s",
                         (*args, rid))
            conn.execute(
                "INSERT INTO demo_stamp (record_id, table_name, fields, owner_user_id)"
                " VALUES (%s,%s,%s,%s) ON CONFLICT (record_id, table_name)"
                " DO UPDATE SET fields = EXCLUDED.fields,"
                " owner_user_id = EXCLUDED.owner_user_id",
                (rid, rec["table"], ",".join(filled), uid))
            counts["base"] += 1

        # ── papers ───────────────────────────────────────────────────
        if not has_rows(conn, "documents", "record_id", rid):
            picks = r.sample(PAPERS, r.randint(5, 11))
            # A record always has a title and a revenue record — that is what
            # owning land in AP means.
            if not any(p[1] == "title" for p in picks):
                picks.insert(0, PAPERS[0])
            if not any(p[1] == "revenue" for p in picks):
                picks.insert(1, PAPERS[4])
            for i, (name, shelf, sub) in enumerate(picks):
                pages = r.randint(2, 26)
                # One date for this paper, used by both the fact row and the
                # reader's summary — they used to be rolled separately.
                reg_on = (f"{r.randint(1,28):02d}/{r.randint(1,12):02d}/"
                          f"{r.randint(2008,2024)}") if shelf == "title" else ""
                conn.execute(
                    "INSERT INTO documents (id, owner_user_id, name, subtitle, shelf,"
                    " page_count, registered_on, office, buyer, seller, consideration,"
                    " record_id, parcel_id, doc_type, created_at, size_bytes,"
                    " reader_summary, reader_flag, reader_flag_page, sort)"
                    " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    (f"{P}doc-{rid}-{i}", uid, fill(name, r, ctx), fill(sub, r, ctx), shelf,
                     pages, reg_on,
                     r.choice(SROS) if shelf == "title" else "",
                     "" , r.choice(NAMES) if shelf == "title" else "",
                     round(rec["paid"]) if shelf == "title" and i == 0 else 0,
                     rid, rid if land else "", shelf, "2026-08-01", pages * 150_000,
                     "" if shelf != "title" else
                     f"{rec['extent']:,.2f} {'acres' if land else rec['extent_unit']}"
                     f" in {rec['title']}, registered on {reg_on}." if reg_on else "",
                     "One page is faint; the extent still reads clearly."
                     if shelf == "title" and r.random() < 0.4 else "",
                     r.randint(2, min(pages, 8)) if shelf == "title" else 0, i))
                counts["papers"] += 1

        # ── features ─────────────────────────────────────────────────
        if not has_rows(conn, "land_features", "entity_id", rid):
            pool = FEATURES_LAND if land else FEATURES_BUILT
            picks = r.sample(pool, min(len(pool), r.randint(4, 12 if land else 5)))
            # Worst condition first, exactly as W07 sorts.
            rows = []
            for label, spec, icon, cat, conds, notes in picks:
                cond = fill(r.choice(conds), r, ctx)
                bad = any(w in cond for w in ("dropped", "Broken", "Dry", "Silted",
                                              "Breached", "leaning", "Cracked", "loose"))
                warn = any(w in cond for w in ("Serviced", "due", "Muddy", "blocked",
                                               "re-roofing", "pruned"))
                rows.append((fill(label, r, ctx), fill(spec, r, ctx), icon, cat, cond,
                             "bad" if bad else "warn" if warn else "good",
                             fill(r.choice(notes), r, ctx)))
            rows.sort(key=lambda x: {"bad": 0, "warn": 1, "good": 2}[x[5]])
            base_lat, base_lon = (rec["geo"].split(",") + ["0", "0"])[:2]
            for i, (label, spec, icon, cat, cond, state, note) in enumerate(rows):
                pinned = r.random() > 0.15
                conn.execute(
                    "INSERT INTO land_features (id, owner_user_id, entity_type, entity_id,"
                    " category, label, value, unit, reference, note, created_at, vendor,"
                    " condition, condition_state, spec, lat, lon, pin_label, photo_count,"
                    " actions, icon, sort) VALUES (%s,%s,'record',%s,%s,%s,0,'','',%s,"
                    "'2026-08-01','',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    (f"{P}feat-{rid}-{i}", uid, rid, cat, label, note, cond, state, spec,
                     round(float(base_lat or 0) + r.uniform(-0.002, 0.002), 4) if pinned else 0,
                     round(float(base_lon or 0) + r.uniform(-0.002, 0.002), 4) if pinned else 0,
                     "" if pinned else r.choice(["No pin yet", "whole parcel", "traced"]),
                     r.randint(0, 6),
                     '["Fix it", "Update"]' if state == "bad" else '["Update", "Photos"]',
                     icon, i))
                counts["features"] += 1

        # ── people + payments ────────────────────────────────────────
        if not has_rows(conn, "record_people", "record_id", rid):
            pool = PEOPLE if land else PEOPLE_BUILT
            picks = r.sample(pool, min(len(pool), r.randint(2, 5)))
            cast = []          # the names actually on this record
            for i, entry in enumerate(picks):
                if land:
                    name, ini, role, badges, summary, arr, plab, pval, dlab, dval, vis, acts, compact = entry
                else:
                    name, role, badges, summary, arr, plab, pval, dlab, dval, vis, acts, compact = entry
                    ini = ""
                who = fill(name, r, ctx)
                cast.append(who)
                conn.execute(
                    "INSERT INTO record_people (id, owner_user_id, record_id, person_name,"
                    " initials, role, badges, summary, arrangement, pay_label, pay_value,"
                    " due_label, due_value, visibility, actions, compact, sort, created_at)"
                    " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'2026-08-01')",
                    (f"{P}ppl-{rid}-{i}", uid, rid, who, ini, role,
                     str(badges).replace("'", '"'), fill(summary, r, ctx), arr, plab,
                     fill(pval, r, ctx), dlab, fill(dval, r, ctx), vis,
                     str(acts).replace("'", '"'), compact, i))
                counts["people"] += 1

            # Payments name the people who are ON this record. Drawing from the
            # global name pool put strangers in the "Last payments" list.
            reasons = (["monthly visit", "title opinion", "season lease", "labour"] if land
                       else ["rent", "society dues", "letting commission", "repairs"])
            for i in range(r.randint(2, 4)):
                payee = cast[i % len(cast)] if cast else fill("{who}", r, ctx)
                reason = reasons[i % len(reasons)]
                inbound = reason in ("season lease", "rent")
                conn.execute(
                    "INSERT INTO people_payments (id, owner_user_id, record_id, title,"
                    " subtitle, occurred_on, method, amount, direction, state, sort)"
                    " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    (f"{P}pay-{rid}-{i}", uid, rid, f"{payee} · {reason}",
                     f"{r.randint(1,28):02d}/{r.randint(1,8):02d}/2026 · "
                     + r.choice(["UPI", "card", "cash", "bank transfer"]),
                     f"{r.randint(1,28):02d}/{r.randint(1,8):02d}/2026",
                     r.choice(["UPI", "card", "cash"]),
                     r.choice([1200, 2900, 7500, 15500, 38000]),
                     "in" if inbound else "out",
                     "escrow" if r.random() < 0.15 else "settled", i))
                counts["payments"] += 1

        # ── photos ───────────────────────────────────────────────────
        # A flat has photos too — they just live in property_photos.
        photo_table = "parcel_photos" if land else "property_photos"
        photo_key = "parcel_id" if land else "property_id"
        if not has_rows(conn, photo_table, photo_key, rid):
            visits = sorted({f"2026-{r.randint(1,8):02d}-{r.randint(1,28):02d}"
                             for _ in range(r.randint(2, 4))}, reverse=True)
            cats = (["Boundary", "Crop", "Water", "Structures", "Access"] if land
                    else ["Rooms", "Kitchen", "Bathroom", "Balcony", "Building"])
            lat0, lon0 = (rec["geo"].split(",") + ["0", "0"])[:2]
            n = r.randint(6, 26)
            for i in range(n):
                visit = visits[min(i // max(1, n // len(visits)), len(visits) - 1)]
                forwarded = r.random() < 0.12
                conn.execute(
                    f"INSERT INTO {photo_table} (id, {photo_key}, owner_user_id, file_ref,"
                    " category, caption, latitude, longitude, captured_at, captured_by,"
                    " is_cover, created_at, source, sha256, order_ref, verified, feature_id,"
                    " accuracy_m, device_clock_ok, pin_distance_m, media_kind, width, height,"
                    " file_name, local_time, sort)"
                    " VALUES (%s,%s,%s,'',%s,%s,%s,%s,%s,%s,%s,'2026-08-01',%s,%s,%s,%s,'',"
                    " %s,true,%s,%s,4032,3024,%s,'',%s)",
                    (f"{P}ph-{rid}-{i:02d}", rid, uid, cats[i % 5],
                     f"{cats[i % 5]} · visit {visit[8:10]}/{visit[5:7]}/{visit[0:4]}",
                     round(float(lat0 or 0) + r.uniform(-0.001, 0.001), 4),
                     round(float(lon0 or 0) + r.uniform(-0.001, 0.001), 4),
                     f"{visit} 0{r.randint(6,9)}:{r.randint(10,59)} IST",
                     r.choice(NAMES[:5]), i == 0,
                     "forwarded" if forwarded else "app",
                     "" if forwarded else hashlib.sha256(f"{rid}{i}".encode()).hexdigest(),
                     f"PT-{r.randint(1000,9999)}" if not forwarded and r.random() < 0.5 else "",
                     not forwarded, 0 if forwarded else 4,
                     0 if forwarded else r.randint(2, 30),
                     "video" if i == n - 1 and r.random() < 0.4 else "photo",
                     f"IMG_{2000 + i}.jpg", i))
                counts["photos"] += 1

        # ── boundary marks ───────────────────────────────────────────
        if land and not has_rows(conn, "boundary_marks", "record_id", rid):
            lat0, lon0 = (rec["geo"].split(",") + ["0", "0"])[:2]
            moved = r.randint(0, 4)     # 4 = none moved
            for i, corner in enumerate(["South-west", "North-west", "North-east", "South-east"]):
                is_moved = i == moved
                conn.execute(
                    "INSERT INTO boundary_marks (id, owner_user_id, record_id, seq, label,"
                    " state, detail, lat, lon, photo_count, noted_on, created_at)"
                    " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'2026-08-01')",
                    (f"{P}bm-{rid}-{i}", uid, rid, i + 1,
                     f"{corner} stone moved ~{r.randint(2,6)} ft in" if is_moved
                     else f"{corner} stone",
                     "moved" if is_moved else "confirmed",
                     f"reported {r.randint(1,28):02d}/0{r.randint(1,8)}/2026 · 2 photos"
                     if is_moved else f"confirmed {r.randint(1,28):02d}/0{r.randint(1,8)}/2026",
                     round(float(lat0 or 0) + r.uniform(-0.001, 0.001), 4),
                     round(float(lon0 or 0) + r.uniform(-0.001, 0.001), 4),
                     2 if is_moved else 0,
                     f"{r.randint(1,28):02d}/0{r.randint(1,8)}/2026"))
                counts["marks"] += 1

        # ── money: how it was bought, and what else went in ──────────
        if not has_rows(conn, "purchase_lots", "record_id", rid):
            lots = 2 if (land and rec["extent"] > 8 and r.random() < 0.5) else 1
            remaining, ext_left = rec["paid"], rec["extent"]
            for i in range(lots):
                ext = ext_left if i == lots - 1 else round(ext_left * r.uniform(0.3, 0.5), 2)
                amt = remaining if i == lots - 1 else round(remaining * (ext / max(ext_left, 0.01)), -3)
                conn.execute(
                    "INSERT INTO purchase_lots (id, owner_user_id, record_id, bought_on,"
                    " extent, extent_unit, rate, paid, govt_value, seller, deed_no, sro, sort)"
                    " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    (f"{P}lot-{rid}-{i}", uid, rid,
                     f"{r.randint(1,28):02d}/{r.randint(1,12):02d}/{r.randint(2010,2023)}",
                     ext, "ac" if land else "sq.ft",
                     round(amt / max(ext, 0.01), -3), amt, round(amt * r.uniform(0.55, 0.75), -3),
                     r.choice(NAMES), f"Sale Deed {r.randint(200,9000)}/{r.randint(2010,2023)}",
                     f"SRO {r.choice(SROS)}", i))
                ext_left -= ext
                remaining -= amt
                counts["money"] += 1
            for i, label in enumerate(["Stamp & registration", "Brokerage", "Fencing",
                                       "Bore & pump"][:r.randint(2, 4)]):
                conn.execute(
                    "INSERT INTO capital_costs (id, owner_user_id, record_id, label,"
                    " amount, sort) VALUES (%s,%s,%s,%s,%s,%s)",
                    (f"{P}cc-{rid}-{i}", uid, rid, label,
                     round(rec["paid"] * r.uniform(0.01, 0.07), -3), i))

        # ── the ledger ───────────────────────────────────────────────
        if not has_rows(conn, "land_expenses", "entity_id", rid):
            pool = EXPENSES_LAND if land else EXPENSES_BUILT
            picks = [r.choice(pool) for _ in range(r.randint(6, 14))]
            # A row hangs off one of THIS record's own features, never off the
            # hero record's "Borewell 1".
            cur = conn.execute(
                "SELECT label FROM land_features WHERE entity_id=%s ORDER BY sort", (rid,))
            own = [x[0] for x in cur.fetchall()]
            targets = ([f"Whole {'parcel' if land else 'property'}"] + own[:4]) or ["Whole parcel"]
            for i, (title, cat, kind, paid_by, lo, hi) in enumerate(picks):
                recoverable = kind == "running" and "tenant" in paid_by
                conn.execute(
                    "INSERT INTO land_expenses (id, owner_user_id, entity_type, entity_id,"
                    " category, title, amount, spent_on, vendor, note, created_at, kind,"
                    " subtitle, on_label, on_icon, feature_id, paid_by, recoverable,"
                    " recoverable_note, has_receipt, fiscal_year)"
                    " VALUES (%s,%s,'record',%s,%s,%s,%s,%s,'','','2026-08-01',%s,%s,%s,%s,"
                    "'',%s,%s,%s,true,'2026-27')",
                    (f"{P}ex-{rid}-{i}", uid, rid, cat, fill(title, r, ctx),
                     r.randint(lo, hi),
                     f"{r.randint(1,28):02d}/{r.randint(4,8):02d}/2026", kind,
                     "Tenant's share — recoverable at harvest" if recoverable else "",
                     r.choice(targets),
                     "parcel" if land else "society", paid_by, recoverable,
                     "Tenant's share — recoverable at harvest" if recoverable else ""))
                counts["expenses"] += 1
            # A let property earns; without the income side the yield is a lie.
            if not land and rec.get("built"):
                rent = round(rec["market"] * r.uniform(0.003, 0.005), -2)
                tenant = fill("{who}", r, ctx)     # one tenant, not twelve
                for m in range(4, 13):
                    conn.execute(
                        "INSERT INTO land_expenses (id, owner_user_id, entity_type, entity_id,"
                        " category, title, amount, spent_on, vendor, note, created_at, kind,"
                        " subtitle, on_label, on_icon, feature_id, paid_by, recoverable,"
                        " recoverable_note, has_receipt, fiscal_year)"
                        " VALUES (%s,%s,'record',%s,'Rent',%s,%s,%s,'','','2026-08-01',"
                        "'income','money in',%s,'person','',%s,false,'',true,'2026-27')",
                        (f"{P}ex-{rid}-rent-{m}", uid, rid,
                         f"Rent · {_MONTH[m]}", rent,
                         f"05/{m:02d}/2026", f"{tenant}, tenant", "Bank transfer"))
                    counts["expenses"] += 1

        # ── an order, a note, a tag ──────────────────────────────────
        if not has_rows(conn, "work_requests", "entity_id", rid) and r.random() < 0.45:
            conn.execute(
                "INSERT INTO work_requests (id, owner_user_id, kind, title, entity_type,"
                " entity_id, assignee, cost, stage, needs_you, note, due_date, closed,"
                " created_at) VALUES (%s,%s,%s,%s,'record',%s,%s,%s,%s,%s,%s,%s,false,"
                "'2026-08-01')",
                (f"{P}PT-{r.randint(1000,9999)}-{rid[-6:]}", uid,
                 r.choice(["survey", "site_visit", "ec", "title_opinion"]),
                 r.choice(["Boundary re-survey", "Monthly site visit",
                           "Encumbrance search", "Title opinion"]),
                 rid, r.choice(NAMES), r.choice([1200, 1900, 2900, 7500]),
                 r.randint(0, 3), r.random() < 0.4,
                 "Ordered against this record. Money is held until you accept the result.",
                 f"{r.randint(1,28):02d}/09/2026"))
            counts["orders"] += 1

        if not has_rows(conn, "notes", "entity_id", rid) and r.random() < 0.6:
            conn.execute(
                "INSERT INTO notes (id, owner_user_id, entity_type, entity_id, body,"
                " created_at) VALUES (%s,%s,'record',%s,%s,%s)",
                (f"{P}note-{rid}", uid, rid,
                 fill(r.choice([
                     "{who} says the buyer wants possession after the {season} harvest.",
                     "Kist paid at the village office; receipt is in Papers.",
                     "Neighbour has asked about the {dir} boundary twice this year.",
                     "{who} will walk the boundary again before the sale.",
                 ]), r, ctx),
                 f"{r.randint(1,28):02d}/0{r.randint(1,8)}/2026 {r.randint(9,19)}:{r.randint(10,59)}"))
            counts["notes"] += 1

        for tag in r.sample(["for sale", "boundary dispute", "give to lawyer",
                             "family share", "check EC"], r.randint(0, 2)):
            conn.execute(
                "INSERT INTO record_tags (id, owner_user_id, entity_type, entity_id, tag,"
                " created_at) VALUES (%s,%s,'record',%s,%s,'2026-08-01')"
                " ON CONFLICT DO NOTHING",
                (f"{P}tag-{rid}-{tag.replace(' ', '-')}", uid, rid, tag))
            counts["tags"] += 1

    # ── account-level: what is waiting, and what is out on a link ────
    cur = conn.execute("SELECT count(*) FROM waiting_items WHERE owner_user_id=%s", (uid,))
    if (cur.fetchone() or [0])[0] == 0 and recs:
        r = rng_for(uid)
        for i, (title, detail, icon, action, kind) in enumerate([
            ("Mutation for {t} needs your signature",
             "Tahsildar, {m} · filed {dd}/08/2026 · office opens 09:30 IST", "clock",
             "Sign", "primary"),
            ("Advocate's link to 4 papers expires tomorrow",
             "K. Prasad · opened 6 times · last 13/08/2026 16:02 IST", "lock",
             "Extend", "ghost"),
        ]):
            pick = r.choice(recs)
            conn.execute(
                "INSERT INTO waiting_items (id, owner_user_id, title, detail, icon,"
                " action_label, action_kind, record_id, sort)"
                " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (f"{P}wi-{uid}-{i}", uid,
                 title.replace("{t}", pick["title"]),
                 detail.replace("{m}", pick["mandal"] or "the mandal")
                       .replace("{dd}", f"{r.randint(1,28):02d}"),
                 icon, action, kind, pick["id"], i))

    cur = conn.execute("SELECT count(*) FROM wallet_accounts WHERE owner_user_id=%s", (uid,))
    if (cur.fetchone() or [0])[0] == 0:
        r = rng_for(uid + "wallet")
        # Topped up to cover everything already paid out of it, plus what is
        # left sitting there. Seeding a flat figure left the balance at ₹0 on
        # any account whose outflows had grown past it.
        cur = conn.execute(
            "SELECT COALESCE(SUM(amount),0) FROM people_payments"
            " WHERE owner_user_id=%s AND state='settled' AND direction='out'", (uid,))
        spent = float((cur.fetchone() or [0])[0] or 0)
        remaining = 18_400 if uid == "w360-demo" else r.choice([9_600, 18_400, 24_500, 47_200])
        conn.execute(
            "INSERT INTO wallet_accounts (owner_user_id, topped_up, auto_top_up, created_at)"
            " VALUES (%s,%s,%s,'2026-08-01') ON CONFLICT (owner_user_id) DO NOTHING",
            (uid, spent + remaining, r.random() < 0.4))

    cur = conn.execute("SELECT count(*) FROM share_links WHERE owner_user_id=%s", (uid,))
    if (cur.fetchone() or [0])[0] == 0 and recs:
        r = rng_for(uid + "links")
        for i, (aud, subj, terms, days) in enumerate([
            ("K. Prasad, advocate", "4 papers",
             "Expiring link + OTP · opened 6 times · last 13/08/2026 16:02 IST", 1),
            ("SBI, loan desk", "passbook + EC",
             "Named people only · watermarked, no download", 18),
            ("Buyer's agent", "proof of ownership",
             "View-only watermark · Aadhaar and PAN masked · never opened", 4),
        ]):
            conn.execute(
                "INSERT INTO share_links (id, owner_user_id, audience, subject, terms,"
                " document_id, doc_count, opened_count, last_opened_at, expires_on, sort,"
                " created_at) VALUES (%s,%s,%s,%s,%s,'',%s,%s,%s,%s,%s,'2026-08-01')",
                (f"{P}sl-{uid}-{i}", uid, aud, subj, terms, r.randint(1, 5),
                 r.randint(0, 8), "13/08/2026 16:02 IST" if i == 0 else "",
                 f"{r.randint(16,30)}/08/2026", days))
            counts["links"] += 1

    print(f"filled {len(recs)} records for {uid}: "
          + ", ".join(f"{k}={v}" for k, v in counts.items() if v))


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    with psycopg.connect(DSN, autocommit=True) as conn:
        if "--purge" in flags:
            # `--purge` alone clears every user; `--purge <uid>` only that one.
            purge(conn, args[0] if args else "")
            return
        if not args:
            print(__doc__)
            print("error: give a user id (e.g. w360-demo, or your own)")
            sys.exit(2)
        for uid in args:
            seed(conn, uid)


if __name__ == "__main__":
    main()
