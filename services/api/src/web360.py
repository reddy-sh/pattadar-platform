"""Record-360 read/write model for the web app (screens W01–W15).

Why this is its own module and not more of `main.py`:

`main.py` is the iOS-facing schema and is edited by a different workstream. The
web 360 needs eleven new tables and six column additions; growing them inside a
6.8k-line file guarantees merge pain and makes the new surface impossible to
review on its own. So the whole thing lives here and hangs off `main.py` at
exactly three points — `bind()`, `ensure_schema()` and the two namespace fields
`Query.web` / `Mutation.web`.

The design contract is `docs/specs/2026-08-15-web-360-design.md`. Two invariants
from that file are enforced here rather than in the client:

1. A shared kit is keyed by `recipient_user_id` and is NEVER unioned into
   portfolio aggregates. Someone else's 4.10 acres are not yours.
2. Facet counts and the card list come out of ONE filtered query, so the rail
   can never claim "For sale 2" while the grid shows three.
"""
from __future__ import annotations

import math
import os
import re
import json
import secrets
import hashlib
from contextlib import asynccontextmanager
import strawberry
from datetime import date, datetime, timedelta
from typing import Optional, List

# The sending seam (email/SMS/WhatsApp, stubbed by default) and the pure
# ticket machine. Both are imported two ways because this module is loaded two
# ways: main.py imports it as `src.web360`, and services/api/tests/test_located.py
# imports it bare off src/. A relative-only import breaks the second.
try:                                    # inside the `src` package, as main.py loads it
    from . import associates, notify, ticketing
except ImportError:                     # imported bare off src/, as the pure tests do
    import associates                   # type: ignore[no-redef]
    import notify                       # type: ignore[no-redef]
    import ticketing                    # type: ignore[no-redef]

# Bound by main.py at import time so this module never imports main (circular).
_pool = None
_uid_of = None


def bind(pool, uid_from_info) -> None:
    """Give this module the connection pool and identity resolver main.py owns."""
    global _pool, _uid_of
    _pool = pool
    _uid_of = uid_from_info


def _uid(info) -> str:
    return (_uid_of(info) if _uid_of else "") or "system"


# ── Schema ────────────────────────────────────────────────────────────
#
# Every statement is IF NOT EXISTS / ADD COLUMN IF NOT EXISTS, so this runs on
# every boot and is a no-op once applied. Postgres 9.6+ for the column form.

_DDL = [
    # W02/W03/W05 — free tags the owner writes on any record, paper or photo.
    """CREATE TABLE IF NOT EXISTS record_tags (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        tag TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT ''
    )""",
    "CREATE INDEX IF NOT EXISTS idx_record_tags_entity ON record_tags (entity_type, entity_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_record_tags ON record_tags (owner_user_id, entity_type, entity_id, tag)",

    # W04 — numbered boundary marks. `prev_lat/prev_lon` keep the position a
    # mark was moved FROM: the screen promises "marks are versioned — nothing
    # is overwritten", so accepting a new position must not lose the old one.
    """CREATE TABLE IF NOT EXISTS boundary_marks (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        record_id TEXT NOT NULL,
        seq INTEGER NOT NULL DEFAULT 1,
        label TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL DEFAULT 'confirmed',
        detail TEXT NOT NULL DEFAULT '',
        lat DOUBLE PRECISION NOT NULL DEFAULT 0,
        lon DOUBLE PRECISION NOT NULL DEFAULT 0,
        prev_lat DOUBLE PRECISION NOT NULL DEFAULT 0,
        prev_lon DOUBLE PRECISION NOT NULL DEFAULT 0,
        photo_count INTEGER NOT NULL DEFAULT 0,
        noted_on TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT ''
    )""",
    "CREATE INDEX IF NOT EXISTS idx_boundary_marks_record ON boundary_marks (record_id)",

    # W08 — who looks after it. One row per person per record; `actions` is a
    # JSON array of button labels because the five person kinds each offer a
    # different set and the screen shows them verbatim.
    """CREATE TABLE IF NOT EXISTS record_people (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        record_id TEXT NOT NULL,
        person_name TEXT NOT NULL,
        initials TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT '',
        badges TEXT NOT NULL DEFAULT '[]',
        summary TEXT NOT NULL DEFAULT '',
        arrangement TEXT NOT NULL DEFAULT '',
        pay_label TEXT NOT NULL DEFAULT '',
        pay_value TEXT NOT NULL DEFAULT '',
        due_label TEXT NOT NULL DEFAULT '',
        due_value TEXT NOT NULL DEFAULT '',
        visibility TEXT NOT NULL DEFAULT '',
        actions TEXT NOT NULL DEFAULT '[]',
        compact BOOLEAN NOT NULL DEFAULT false,
        sort INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT ''
    )""",
    "CREATE INDEX IF NOT EXISTS idx_record_people_record ON record_people (record_id)",

    # W08 right rail — money out and in, including escrow that has not moved.
    """CREATE TABLE IF NOT EXISTS people_payments (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        record_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        subtitle TEXT NOT NULL DEFAULT '',
        occurred_on TEXT NOT NULL DEFAULT '',
        method TEXT NOT NULL DEFAULT '',
        amount DOUBLE PRECISION NOT NULL DEFAULT 0,
        direction TEXT NOT NULL DEFAULT 'out',
        state TEXT NOT NULL DEFAULT 'settled',
        sort INTEGER NOT NULL DEFAULT 0
    )""",
    "CREATE INDEX IF NOT EXISTS idx_people_payments_record ON people_payments (record_id)",

    # W10 — "How you bought it". One row per registration, so a 30-acre holding
    # bought in two lots shows both rates and the blended one.
    """CREATE TABLE IF NOT EXISTS purchase_lots (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        record_id TEXT NOT NULL,
        bought_on TEXT NOT NULL DEFAULT '',
        extent DOUBLE PRECISION NOT NULL DEFAULT 0,
        extent_unit TEXT NOT NULL DEFAULT 'ac',
        rate DOUBLE PRECISION NOT NULL DEFAULT 0,
        paid DOUBLE PRECISION NOT NULL DEFAULT 0,
        govt_value DOUBLE PRECISION NOT NULL DEFAULT 0,
        seller TEXT NOT NULL DEFAULT '',
        deed_no TEXT NOT NULL DEFAULT '',
        sro TEXT NOT NULL DEFAULT '',
        sort INTEGER NOT NULL DEFAULT 0
    )""",
    "CREATE INDEX IF NOT EXISTS idx_purchase_lots_record ON purchase_lots (record_id)",

    # W10 — "Everything else you put in". Deliberately NOT folded into
    # purchase_price: the screen's whole argument is that capital work sits
    # apart so cost-per-acre stays honest.
    """CREATE TABLE IF NOT EXISTS capital_costs (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        record_id TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        amount DOUBLE PRECISION NOT NULL DEFAULT 0,
        sort INTEGER NOT NULL DEFAULT 0
    )""",
    "CREATE INDEX IF NOT EXISTS idx_capital_costs_record ON capital_costs (record_id)",

    # W13/W15 — every link out of the vault. W15: "Nothing leaves this vault
    # without appearing in this list."
    """CREATE TABLE IF NOT EXISTS share_links (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        audience TEXT NOT NULL DEFAULT '',
        subject TEXT NOT NULL DEFAULT '',
        terms TEXT NOT NULL DEFAULT '',
        document_id TEXT NOT NULL DEFAULT '',
        doc_count INTEGER NOT NULL DEFAULT 0,
        opened_count INTEGER NOT NULL DEFAULT 0,
        last_opened_at TEXT NOT NULL DEFAULT '',
        expires_on TEXT NOT NULL DEFAULT '',
        revoked BOOLEAN NOT NULL DEFAULT false,
        sort INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT ''
    )""",
    "CREATE INDEX IF NOT EXISTS idx_share_links_owner ON share_links (owner_user_id)",
    "ALTER TABLE share_links ADD COLUMN IF NOT EXISTS token_hash TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE share_links ADD COLUMN IF NOT EXISTS record_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE share_links ADD COLUMN IF NOT EXISTS manifest TEXT NOT NULL DEFAULT '{}'",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_share_links_token ON share_links (token_hash) WHERE token_hash <> ''",
    """CREATE TABLE IF NOT EXISTS service_order_intents (
        owner_user_id TEXT NOT NULL, intent_key TEXT NOT NULL,
        request_hash TEXT NOT NULL, order_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (owner_user_id, intent_key)
    )""",

    # W13 — "v1 kept, never deleted".
    """CREATE TABLE IF NOT EXISTS document_versions (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        label TEXT NOT NULL DEFAULT '',
        made_on TEXT NOT NULL DEFAULT '',
        made_by TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        sort INTEGER NOT NULL DEFAULT 0
    )""",
    "CREATE INDEX IF NOT EXISTS idx_document_versions_doc ON document_versions (document_id)",

    # W09 — someone else's property. `recipient_user_id`, never `owner_user_id`:
    # naming it "owner" is exactly how it would leak into a portfolio sum.
    """CREATE TABLE IF NOT EXISTS shared_kits (
        id TEXT PRIMARY KEY,
        recipient_user_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        headline TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT 'parcel',
        purpose TEXT NOT NULL DEFAULT 'for_sale',
        list_line TEXT NOT NULL DEFAULT '',
        sender_name TEXT NOT NULL DEFAULT '',
        sender_initials TEXT NOT NULL DEFAULT '',
        sender_note TEXT NOT NULL DEFAULT '',
        shared_at TEXT NOT NULL DEFAULT '',
        terms TEXT NOT NULL DEFAULT '',
        opened_count INTEGER NOT NULL DEFAULT 0,
        days_left INTEGER NOT NULL DEFAULT 0,
        expired_on TEXT NOT NULL DEFAULT '',
        asked_price DOUBLE PRECISION NOT NULL DEFAULT 0,
        photo_count INTEGER NOT NULL DEFAULT 0,
        feature_count INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL DEFAULT 'live',
        sort INTEGER NOT NULL DEFAULT 0
    )""",
    "CREATE INDEX IF NOT EXISTS idx_shared_kits_recipient ON shared_kits (recipient_user_id)",

    """CREATE TABLE IF NOT EXISTS shared_kit_items (
        id TEXT PRIMARY KEY,
        kit_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        shelf TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        verdict TEXT NOT NULL DEFAULT 'ok',
        sort INTEGER NOT NULL DEFAULT 0
    )""",
    "CREATE INDEX IF NOT EXISTS idx_shared_kit_items_kit ON shared_kit_items (kit_id)",

    """CREATE TABLE IF NOT EXISTS shared_kit_checks (
        id TEXT PRIMARY KEY,
        kit_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        price DOUBLE PRECISION NOT NULL DEFAULT 0,
        sort INTEGER NOT NULL DEFAULT 0
    )""",
    "CREATE INDEX IF NOT EXISTS idx_shared_kit_checks_kit ON shared_kit_checks (kit_id)",

    # The Pattadar wallet the caretaker, surveyor and advocate are paid from.
    # Its balance was a literal in the resolver; a balance is a fact and needs
    # somewhere to live.
    """CREATE TABLE IF NOT EXISTS wallet_accounts (
        owner_user_id TEXT PRIMARY KEY,
        topped_up DOUBLE PRECISION NOT NULL DEFAULT 0,
        auto_top_up BOOLEAN NOT NULL DEFAULT false,
        created_at TEXT NOT NULL DEFAULT ''
    )""",

    # A note is written by a person; the table never recorded who.
    "ALTER TABLE notes ADD COLUMN IF NOT EXISTS author TEXT NOT NULL DEFAULT ''",
    # What the customer answered when ordering. JSON, because every service
    # asks for different things and a column per question does not scale past
    # the handful that existed when this table was drawn.
    "ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS params TEXT NOT NULL DEFAULT '{}'",

    # W16 — the service ticket: the columns that turn an order into something
    # that can be sent out, paid for, delivered against and defended, plus the
    # four tables it hangs off (its trail, what left the building, what came
    # back, and the money ledger). The statements live in ticketing.py beside
    # the machine that reads them, because a status column and the transition
    # table that writes it drift apart the moment they live in two files.
    *ticketing.DDL,
    # W17 — the roster, the offer columns on ticket_dispatches, and the
    # dispatcher's queue columns on work_requests. After ticketing's, because
    # the ALTERs below extend the tables it creates.
    *associates.DDL,

    # W01 — the two things with a deadline.
    """CREATE TABLE IF NOT EXISTS waiting_items (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        detail TEXT NOT NULL DEFAULT '',
        icon TEXT NOT NULL DEFAULT 'clock',
        action_label TEXT NOT NULL DEFAULT '',
        action_kind TEXT NOT NULL DEFAULT 'primary',
        record_id TEXT NOT NULL DEFAULT '',
        done BOOLEAN NOT NULL DEFAULT false,
        sort INTEGER NOT NULL DEFAULT 0
    )""",
    "CREATE INDEX IF NOT EXISTS idx_waiting_items_owner ON waiting_items (owner_user_id)",

    # W07 — features gain condition, their own pin, and their own photo count.
    "ALTER TABLE land_features ADD COLUMN IF NOT EXISTS condition_state TEXT NOT NULL DEFAULT 'good'",
    "ALTER TABLE land_features ADD COLUMN IF NOT EXISTS spec TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE land_features ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION NOT NULL DEFAULT 0",
    "ALTER TABLE land_features ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION NOT NULL DEFAULT 0",
    "ALTER TABLE land_features ADD COLUMN IF NOT EXISTS pin_label TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE land_features ADD COLUMN IF NOT EXISTS photo_count INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE land_features ADD COLUMN IF NOT EXISTS actions TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE land_features ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT 'feature'",
    "ALTER TABLE land_features ADD COLUMN IF NOT EXISTS sort INTEGER NOT NULL DEFAULT 0",

    # W11/W12 — the capital/running split, and rent in the same ledger.
    "ALTER TABLE land_expenses ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'running'",
    "ALTER TABLE land_expenses ADD COLUMN IF NOT EXISTS subtitle TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE land_expenses ADD COLUMN IF NOT EXISTS on_label TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE land_expenses ADD COLUMN IF NOT EXISTS on_icon TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE land_expenses ADD COLUMN IF NOT EXISTS feature_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE land_expenses ADD COLUMN IF NOT EXISTS paid_by TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE land_expenses ADD COLUMN IF NOT EXISTS recoverable BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE land_expenses ADD COLUMN IF NOT EXISTS recoverable_note TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE land_expenses ADD COLUMN IF NOT EXISTS has_receipt BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE land_expenses ADD COLUMN IF NOT EXISTS fiscal_year TEXT NOT NULL DEFAULT ''",

    # W14 — provenance. Every column here is one line of the "Why this is
    # Borewell 1" panel.
    "ALTER TABLE parcel_photos ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'app'",
    "ALTER TABLE parcel_photos ADD COLUMN IF NOT EXISTS sha256 TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE parcel_photos ADD COLUMN IF NOT EXISTS order_ref TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE parcel_photos ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE parcel_photos ADD COLUMN IF NOT EXISTS feature_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE parcel_photos ADD COLUMN IF NOT EXISTS accuracy_m DOUBLE PRECISION NOT NULL DEFAULT 0",
    "ALTER TABLE parcel_photos ADD COLUMN IF NOT EXISTS device_clock_ok BOOLEAN NOT NULL DEFAULT true",
    "ALTER TABLE parcel_photos ADD COLUMN IF NOT EXISTS pin_distance_m DOUBLE PRECISION NOT NULL DEFAULT 0",
    "ALTER TABLE parcel_photos ADD COLUMN IF NOT EXISTS media_kind TEXT NOT NULL DEFAULT 'photo'",
    "ALTER TABLE parcel_photos ADD COLUMN IF NOT EXISTS width INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE parcel_photos ADD COLUMN IF NOT EXISTS height INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE parcel_photos ADD COLUMN IF NOT EXISTS file_name TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE parcel_photos ADD COLUMN IF NOT EXISTS local_time TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE parcel_photos ADD COLUMN IF NOT EXISTS sort INTEGER NOT NULL DEFAULT 0",

    # A built property files its photos in its own table; it needs the same
    # provenance columns, or counting them fails outright.
    "ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'app'",
    "ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS sha256 TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS order_ref TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS feature_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS accuracy_m DOUBLE PRECISION NOT NULL DEFAULT 0",
    "ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS device_clock_ok BOOLEAN NOT NULL DEFAULT true",
    "ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS pin_distance_m DOUBLE PRECISION NOT NULL DEFAULT 0",
    "ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS media_kind TEXT NOT NULL DEFAULT 'photo'",
    "ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS width INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS height INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS file_name TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS local_time TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS caption TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS captured_at TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS captured_by TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION NOT NULL DEFAULT 0",
    "ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION NOT NULL DEFAULT 0",
    "ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS is_cover BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS sort INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS owner_user_id TEXT NOT NULL DEFAULT ''",

    # W13 — the reader's summary and the flag it raises, plus shelf + page count.
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS shelf TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS page_count INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS reader_summary TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS reader_flag TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS reader_flag_page INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS subtitle TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS registered_on TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS office TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS buyer TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS seller TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS consideration DOUBLE PRECISION NOT NULL DEFAULT 0",
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS record_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS sort INTEGER NOT NULL DEFAULT 0",

    # W02/W06 — a record's status ("for sale", "disputed") and its map polygon.
    "ALTER TABLE parcels ADD COLUMN IF NOT EXISTS shape TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE properties ADD COLUMN IF NOT EXISTS shape TEXT NOT NULL DEFAULT ''",

    # W04 — the SURVEYED outline, in degrees, in corner order. The column is
    # `boundary` and it is NOT new: main.py has carried it since the FMB point
    # table landed, with its own mutations and an iOS-facing contract. W360
    # only needs it present, because a demo database may predate it.
    # `shape` stays the 0..1 sketch — it only ever meant "draw something this
    # shape" and means nothing off-screen; `boundary` is where the corners
    # actually are, which is what a real map can draw.
    "ALTER TABLE parcels ADD COLUMN IF NOT EXISTS boundary TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE properties ADD COLUMN IF NOT EXISTS boundary TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_name TEXT NOT NULL DEFAULT ''",

    # W02 — archived records leave every list and sum but are never deleted;
    # the Properties rail grows an "Archived" facet only while any exist.
    "ALTER TABLE parcels ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE properties ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false",

    # Village maps uploaded through the app, as opposed to the ones built at
    # the desk and shipped in apps/web/public/vm. Keyed by the folded village
    # name, so uploading the same village again replaces it rather than
    # stacking a second copy — the whole point of a key that treats
    # "Chintagunta" and "CHINTHAGUNTA" as one place.
    #
    # Deliberately NOT scoped to the uploader on read. A revenue village's
    # shape file is the survey department's published record of the ground;
    # nothing in it belongs to whoever happened to have the KMZ. `uploaded_by`
    # is provenance, not a fence.
    """CREATE TABLE IF NOT EXISTS village_maps (
        key TEXT PRIMARY KEY,
        village TEXT NOT NULL,
        file_name TEXT NOT NULL,
        source_name TEXT NOT NULL DEFAULT '',
        plots INTEGER NOT NULL DEFAULT 0,
        geojson TEXT NOT NULL,
        uploaded_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT ''
    )""",
    # What the mandal map needs to draw a village it has not opened. Stored at
    # upload rather than derived on read: it is a pass over every edge in the
    # village, and the landing page asks for all of them at once.
    "ALTER TABLE village_maps ADD COLUMN IF NOT EXISTS acres DOUBLE PRECISION NOT NULL DEFAULT 0",
    "ALTER TABLE village_maps ADD COLUMN IF NOT EXISTS centre_lat DOUBLE PRECISION NOT NULL DEFAULT 0",
    "ALTER TABLE village_maps ADD COLUMN IF NOT EXISTS centre_lon DOUBLE PRECISION NOT NULL DEFAULT 0",
    "ALTER TABLE village_maps ADD COLUMN IF NOT EXISTS outline TEXT NOT NULL DEFAULT '[]'",
]


async def ensure_schema(conn) -> None:
    """Create/extend the web-360 tables. Idempotent; safe on every boot."""
    for stmt in _DDL:
        try:
            await conn.execute(stmt)
        except Exception as exc:  # one bad statement must not block the rest
            import logging
            logging.getLogger("pattadar").warning("web360 ddl skipped: %s (%s)", stmt[:60], exc)
    await _assert_indexes(conn)


async def _assert_indexes(conn) -> None:
    """Say so, loudly, when a safety index is not actually there.

    Two things above hide this. Every statement is wrapped in a try/except that
    only warns, and `CREATE INDEX IF NOT EXISTS` is worse than that: it reports
    success and does nothing at all when an index of that NAME already exists
    with a different definition. So a renamed predicate can leave the backstop
    that makes two people assigned to one job impossible silently absent, with
    every line of the boot log green.

    Logged rather than raised. Refusing to start is right for a deployed API
    and wrong for the founder's laptop, where a half-applied schema from an
    interrupted boot is routine and a process that will not come up cannot be
    used to repair it. `associates.REQUIRED_INDEXES` names the three that
    actually prevent double assignment."""
    import logging
    log = logging.getLogger("pattadar")
    try:
        cur = await conn.execute(
            "SELECT indexname FROM pg_indexes WHERE indexname = ANY(%s)",
            (list(associates.REQUIRED_INDEXES),))
        missing = associates.missing_indexes(r["indexname"] for r in await cur.fetchall())
    except Exception as exc:
        log.error("web360: could not verify the dispatch safety indexes (%s)", exc)
        return
    if missing:
        log.error("web360: DISPATCH SAFETY INDEXES MISSING: %s — two associates can be"
                  " assigned to one job and nothing will stop it. Drop and recreate"
                  " them by hand; CREATE INDEX IF NOT EXISTS will not.",
                  ", ".join(missing))


# ── Small helpers ─────────────────────────────────────────────────────

def _jlist(raw) -> List[str]:
    """A JSON-array text column → list[str]; tolerant of '' and bad JSON."""
    if not raw:
        return []
    if isinstance(raw, list):
        return [str(x) for x in raw]
    try:
        val = json.loads(raw)
        return [str(x) for x in val] if isinstance(val, list) else []
    except (ValueError, TypeError):
        return []


def _f(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _i(v) -> int:
    try:
        return int(v or 0)
    except (TypeError, ValueError):
        return 0


# ── What stands on a piece of land ────────────────────────────────────

# The kinds of thing a record can carry, and how each one is drawn. The table
# lives here rather than in the web app because the classification has to hold
# for whoever files the feature — the chip list, a name the chip list never
# thought of, an import, and the phone when it catches up. A feature filed as
# "Bore" from any of them must come back as water, with the bore icon, or the
# category chips and the map pins disagree about the same row.
#
# Matched as substrings in this order, so the specific beats the general:
# "Compound wall" is a wall and not a well, "Borewell" is a bore and not a well.
_FEATURE_KINDS: List[tuple] = [
    ("compound wall", "structures", "fence"),
    ("boundary wall", "structures", "fence"),
    ("borewell", "water", "bore"),
    ("bore", "water", "bore"),
    ("open well", "water", "well"),
    ("well", "water", "well"),
    ("pond", "water", "pond"),
    ("tank", "water", "pond"),
    ("canal", "water", "pond"),
    ("channel", "water", "pond"),
    ("drip", "water", "drip"),
    ("sprinkler", "water", "drip"),
    ("pipeline", "water", "drip"),
    ("pump", "power", "pump"),
    ("motor", "power", "pump"),
    ("transformer", "power", "power"),
    ("meter", "power", "power"),
    ("solar", "power", "power"),
    ("generator", "power", "power"),
    ("supply", "power", "power"),
    ("fence", "structures", "fence"),
    ("gate", "structures", "gate"),
    ("shed", "structures", "house"),
    ("house", "structures", "house"),
    ("room", "structures", "house"),
    ("store", "structures", "house"),
    ("hut", "structures", "house"),
    ("wall", "structures", "fence"),
    ("tree", "planting", "trees"),
    ("mango", "planting", "trees"),
    ("coconut", "planting", "trees"),
    ("cashew", "planting", "trees"),
    ("teak", "planting", "trees"),
    ("orchard", "planting", "trees"),
    ("crop", "planting", "crop"),
    ("paddy", "planting", "crop"),
    ("cotton", "planting", "crop"),
    ("nursery", "planting", "crop"),
    ("road", "access", "road"),
    ("track", "access", "road"),
    ("path", "access", "road"),
    ("bund", "access", "road"),
    ("approach", "access", "road"),
    ("culvert", "access", "road"),
]

# A condition nobody has recorded. Not "good": a feature filed from the field
# with nothing said about it has not been inspected, and drawing it green is
# the app inventing an assurance the owner never gave.
_STATES = ("good", "warn", "bad", "unknown")

# Worst first, because the reason to open this tab is that something is broken.
# Unknown sits above good: a thing nobody has looked at is the next thing to
# look at, and it must not sink under a screenful of working ones.
_STATE_RANK = {"bad": 0, "warn": 1, "unknown": 2, "good": 3}


def _classify_feature(label: str) -> tuple:
    """(category, icon) for a feature name. ('other', 'feature') when the name
    matches nothing — an honest 'we do not know what this is', which the Other
    chip then groups so it can be found and corrected."""
    low = (label or "").strip().lower()
    for word, cat, icon in _FEATURE_KINDS:
        if word in low:
            return cat, icon
    return "other", "feature"


# ── Types ─────────────────────────────────────────────────────────────

@strawberry.type
class Tile:
    key: str
    label: str
    value: str
    unit: str = ""
    note: str = ""
    tone: str = "plain"        # plain | up | down | accent


@strawberry.type
class WaitingItem:
    id: str
    title: str
    detail: str
    icon: str
    action_label: str
    action_kind: str
    record_id: str


@strawberry.type
class ValueBar:
    label: str
    value: float
    share: float               # 0..1 of the largest bar, for the track width


@strawberry.type
class RecordCard:
    id: str
    kind: str                  # parcel | property
    title: str
    #: The khata this record sits under, or '' for a built property — those have
    #: no passbook at all, and a parcel's group is decided by this passbook
    #: rather than by the parcel, so anything that moves a holding between
    #: groups needs it.
    passbook_id: str
    #: The family / firm / trust that holds it, or '' for your own name.
    group_id: str
    subtitle: str
    classification: str        # agri | flat | shop | open_plot
    status: str                # owned | for_sale | disputed
    stake: str                 # owned | managed | watch
    khata_no: str
    owner_name: str
    village: str
    mandal: str
    district: str
    place_line: str
    extent: float
    extent_unit: str
    extent_alt: str
    market_value: float
    tags: List[str]
    # ── What the card can DRAW of itself ──────────────────────────────
    #
    # These four were deliberately kept off the card once, on the grounds that
    # a boundary would be sent down the wire for the fifteen screens that draw
    # no map at all. That decision is reversed here, on purpose: the property
    # GRID is now one of the screens that draws a map — every card shows the
    # ground it stands on — and it is the busiest screen in the app. A ring is
    # eight to fifteen corners, so forty of them is about 8 KB on a response
    # that already carries forty titles, owners, khatas and tag lists; the cost
    # of a second round trip to fetch it separately is the larger number.
    #
    # `ring` is flat [lat, lon, lat, lon, …] for the same reason `shape` is:
    # one list crosses the wire and the client pairs it up.
    lat: float
    lon: float
    ring: List[float]
    #: The storage-node id of this record's cover photo, or "". A card shows a
    #: photograph of the land in preference to a picture of the map, because a
    #: photograph is the thing the owner took and the map is the thing we drew.
    cover_file_ref: str


@strawberry.type
class Portfolio:
    display_name: str
    farm_extent: float
    farm_count: int
    plot_extent: float
    plot_count: int
    built_extent: float
    built_flats: int
    built_shops: int
    invested: float
    worth_now: float
    gain: float
    loans: float
    managed_count: int
    watched_count: int
    waiting_count: int
    running_costs: float
    paper_count: int
    backup_verified_on: str
    tiles: List[Tile]
    waiting: List[WaitingItem]
    value_bars: List[ValueBar]
    recent: List[RecordCard]
    # Appended with defaults so every selection set written before W17 still
    # parses. Both live here rather than in a query of their own because
    # Shell.tsx mounts `usePortfolio` and `useOrders` and nothing else, and a
    # third query on the shell would run on every screen in the app.
    #
    # `is_platform_admin` is what draws the desk in the rail; `associate_id` is
    # what draws the provider's own inbox, and is '' for everybody until
    # somebody claims their record in phase 5.
    is_platform_admin: bool = False
    associate_id: str = ""


#: Facet key for "held in your own name, not by any group".
#
#  A holding's group is `''` when there is none, and an empty string cannot be
#  a facet key: it is indistinguishable from an absent parameter in a query
#  string, so `?group=` would silently mean "no filter" instead of "personal
#  only". One named sentinel, shared by the filter test and the facet option, so
#  the two cannot disagree about what it is called.
PERSONAL = "personal"


@strawberry.type
class FacetOption:
    key: str
    label: str
    count: int
    active: bool


@strawberry.type
class FacetGroup:
    key: str
    label: str
    options: List[FacetOption]


@strawberry.type
class PropertyList:
    shown: int
    total: int
    hidden: int
    filter_summary: str
    hidden_places: List[str]
    active_count: int
    cards: List[RecordCard]
    facets: List[FacetGroup]


@strawberry.type
class RecordDetail:
    id: str
    kind: str
    title: str
    eyebrow: str
    classification: str
    status: str
    stake: str
    khata_no: str
    village: str
    mandal: str
    district: str
    owner_name: str
    place_line: str
    place_line_te: str
    state: str                 # from the passbook; "" when the record has none
    extent: float
    extent_unit: str
    extent_detail: str
    market_value: float
    per_unit_value: float
    per_unit_label: str
    bought_year: str
    lat: float
    lon: float
    ring: List[float]          # flat [lat1,lon1,…]; [] = no surveyed boundary
    map_caption: str
    paper_count: int
    feature_count: int
    people_count: int
    service_count: int
    photo_count: int
    photo_note: str
    tags: List[str]
    note_body: str
    note_author: str
    note_at: str


@strawberry.type
class Paper:
    id: str
    title: str
    detail: str
    shelf: str
    icon: str
    tags: List[str]
    shared: bool
    page_count: int
    file_ref: str


@strawberry.type
class Feature:
    id: str
    label: str
    spec: str
    icon: str
    category: str
    condition: str
    condition_state: str
    note: str
    lat: float
    lon: float
    pin_label: str
    photo_count: int
    actions: List[str]


@strawberry.type
class FeatureList:
    features: List[Feature]
    total: int
    needs_repair: int
    walked_on: str
    walked_by: str
    categories: List[FacetOption]


@strawberry.type
class Person:
    id: str
    name: str
    initials: str
    role: str
    badges: List[str]
    summary: str
    arrangement: str
    pay_label: str
    pay_value: str
    due_label: str
    due_value: str
    visibility: str
    actions: List[str]
    compact: bool


@strawberry.type
class Payment:
    id: str
    title: str
    subtitle: str
    occurred_on: str
    method: str
    amount: float
    direction: str
    state: str


@strawberry.type
class PeopleView:
    people: List[Person]
    payments: List[Payment]
    count: int
    monthly_out: float
    seasonal_in: float
    wallet_balance: float
    wallet_note: str
    wallet_live: bool


@strawberry.type
class BoundaryMark:
    id: str
    seq: int
    label: str
    state: str
    detail: str
    lat: float
    lon: float
    photo_count: int
    noted_on: str


@strawberry.type
class BoundaryView:
    record_id: str
    title: str
    lat: float
    lon: float
    set_by: str
    accuracy: str
    extent_label: str
    shape: List[float]         # flat [x1,y1,x2,y2,…] in 0..1 sketch space
    ring: List[float]          # flat [lat1,lon1,…] from parcels.boundary; [] = unsurveyed
    caption: str
    sheet_title: str
    sheet_detail: str
    sheet_id: str              # the paper to open; "" when none is filed
    marks: List[BoundaryMark]


@strawberry.type
class Photo:
    id: str
    caption: str
    category: str
    file_name: str
    file_ref: str
    media_kind: str
    captured_at: str
    local_time: str
    captured_by: str
    lat: float
    lon: float
    accuracy_m: float
    order_ref: str
    source: str
    sha256: str
    verified: bool
    device_clock_ok: bool
    pin_distance_m: float
    width: int
    height: int
    feature_id: str
    tags: List[str]
    is_cover: bool


@strawberry.type
class PhotoList:
    photos: List[Photo]
    total: int
    video_count: int
    visit_count: int
    latest_visit: str
    latest_visit_count: int
    verified_count: int
    unproven_count: int
    subject: str


@strawberry.type
class PurchaseLot:
    id: str
    bought_on: str
    extent: float
    extent_unit: str
    rate: float
    paid: float
    govt_value: float
    seller: str
    deed_no: str
    sro: str


@strawberry.type
class CapitalCost:
    id: str
    label: str
    amount: float


@strawberry.type
class RatePoint:
    label: str
    value: float
    unit: str


@strawberry.type
class ValuePoint:
    year: str
    market: float
    government: float
    paid: float


@strawberry.type
class MoneyView:
    record_id: str
    title: str
    eyebrow: str
    paid_total: float
    paid_per_unit: float
    extras_total: float
    govt_total: float
    govt_per_unit: float
    govt_revised: str
    market_total: float
    # Null, not 0: with nothing on file as paid there is no cost to measure a
    # gain against, and 0 reads as "broke even" on a record worth ₹1.4 Cr.
    market_gain: Optional[float]
    market_gain_pct: Optional[float]
    extent: float
    extent_unit: str
    lots: List[PurchaseLot]
    blended_rate: float
    blended_paid: float
    blended_govt: float
    extras: List[CapitalCost]
    rates: List[RatePoint]
    series: List[ValuePoint]
    appreciation_pct: float
    is_built: bool
    land_area: float
    land_rate: float
    land_value: float
    build_area: float
    build_rate: float
    build_value: float
    depreciation: float
    depreciation_years: int


@strawberry.type
class Expense:
    id: str
    title: str
    subtitle: str
    on_label: str
    on_icon: str
    kind: str                  # capital | running | income
    paid_by: str
    amount: float
    spent_on: str
    category: str
    recoverable: bool
    recoverable_note: str
    has_receipt: bool


@strawberry.type
class ExpenseView:
    record_id: str
    title: str
    eyebrow: str
    is_built: bool
    year: str
    years: List[str]
    spent: float
    capital: float
    running: float
    owed_back: float
    income: float
    net_yield: float
    per_unit_running: float
    extent: float
    extent_unit: str
    categories: List[FacetOption]
    rows: List[Expense]
    feature_options: List[FacetOption]


@strawberry.type
class Shelf:
    key: str
    label: str
    note: str
    count: int


@strawberry.type
class ShareLink:
    id: str
    audience: str
    subject: str
    terms: str
    doc_count: int
    opened_count: int
    last_opened_at: str
    expires_on: str
    days_left: int
    initials: str


@strawberry.type
class Correction:
    """One value that was changed, and what it used to be."""
    id: str
    field: str
    was: str
    now: str
    at: str
    by: str


@strawberry.type
class HistoryEvent:
    """One thing that happened to this record — an add, an edit, a removal.

    Unlike a Correction (which is only a changed FIELD value), this is every
    audited action on the record: a person filed, a cost recorded, a paper
    added, a pin moved. `action` is the raw verb the server logged; the client
    maps it to a human phrase. `detail` is the server's own short description."""
    id: str
    action: str
    detail: str
    at: str
    by: str


@strawberry.type
class ServiceField:
    """One question a service asks before it can be worked on."""
    name: str
    label: str
    kind: str
    required: bool
    options: List[str]
    help: str


@strawberry.type
class ServiceOffer:
    key: str
    label: str
    price: float
    group: str
    blurb: str
    days: int
    fields: List[ServiceField]


@strawberry.type
class VaultView:
    total: int
    region_note: str
    shelves: List[Shelf]
    links: List[ShareLink]


@strawberry.type
class DocumentVersion:
    id: str
    version: int
    label: str
    made_on: str
    made_by: str
    note: str


@strawberry.type
class DocumentView:
    id: str
    title: str
    subtitle: str
    shelf: str
    record_id: str
    record_title: str
    page_count: int
    size_label: str
    file_ref: str
    mime_type: str
    registered_on: str
    office: str
    buyer: str
    seller: str
    consideration: float
    reader_summary: str
    reader_flag: str
    reader_flag_page: int
    tags: List[str]
    shared: bool
    versions: List[DocumentVersion]
    link: Optional[ShareLink]


@strawberry.type
class KitItem:
    id: str
    title: str
    shelf: str
    note: str
    verdict: str


@strawberry.type
class KitCheck:
    id: str
    title: str
    note: str
    price: float


@strawberry.type
class SharedKit:
    id: str
    title: str
    headline: str
    kind: str
    purpose: str
    list_line: str
    sender_name: str
    sender_initials: str
    sender_note: str
    shared_at: str
    terms: str
    opened_count: int
    days_left: int
    expired_on: str
    asked_price: float
    photo_count: int
    feature_count: int
    state: str
    items: List[KitItem]
    checks: List[KitCheck]
    checks_total: float


@strawberry.type
class MapRecord:
    id: str
    kind: str
    title: str
    subtitle: str
    status: str
    classification: str
    market_value: float
    extent: float
    extent_unit: str
    khata_no: str
    owner_name: str
    village: str
    lat: float
    lon: float
    shape: List[float]
    ring: List[float]
    feature_chips: List[str]
    watcher: str
    watcher_pay: str
    paper_count: int
    photo_count: int


@strawberry.type
class MapInsight:
    id: str
    title: str
    detail: str


@strawberry.type
class MapView:
    area_label: str
    records: List[MapRecord]
    counts: List[FacetOption]
    insights: List[MapInsight]


@strawberry.type
class SearchHit:
    id: str
    kind: str          # record | paper | person
    title: str
    subtitle: str
    route: str


@strawberry.type
class Order:
    id: str
    kind: str
    title: str
    detail: str
    assignee: str
    cost: float
    stage: int
    stage_label: str
    needs_you: bool
    due_date: str
    record_id: str
    record_title: str
    params: str
    # Appended, with defaults, so every selection set written before W16 still
    # parses and every field above still means exactly what it meant. `stage`
    # and `stage_label` stay the four-valued pip; `status` is the eight-valued
    # truth underneath it.
    status: str = ""
    status_label: str = ""
    status_state: str = ""
    ref: str = ""
    held: float = 0.0
    pending_review: int = 0
    # W17. `assignee` stays the free-text display name it has always been;
    # this is the roster id beside it, and '' on every job that was assigned by
    # typing a name. The Services list reads it to know whether there is a
    # number behind the name at all.
    assignee_ref: str = ""


# An order moves through four visible states; the number in `work_requests.stage`
# is an index into this, so the label lives in one place. Frozen: appending to
# it would re-label the pips on every ticket ever written. The finer word lives
# in ticketing.STATUS_LABEL.
_STAGES = ["Placed", "Assigned", "On site", "Delivered"]


# ── Read helpers ──────────────────────────────────────────────────────

_UNIT_ALT = {"ac": "Sq.yd", "sq.ft": "sq.m", "sq.yd": "sq.m"}


def _corner_label(index: int) -> str:
    """A, B, C … Z, AA, AB — the same names MapCanvas letters its corners with,
    so a mark made from the boundary is called what the map calls that point."""
    n = int(index)
    if n < 0:
        return ""
    out = ""
    while True:
        out = chr(65 + (n % 26)) + out
        n = n // 26 - 1
        if n < 0:
            break
    return out


def _place_line(*parts: str) -> str:
    """Village, mandal, district — with the repetition real addresses produce
    removed. A parcel in Peddapuram village of Peddapuram mandal must not read
    "Peddapuram, Peddapuram", and "Kakinada town, Kakinada" is one place, not
    two: any segment wholly contained in another is dropped."""
    keep: List[str] = []
    for p in [x.strip() for x in parts if x and x.strip()]:
        if any(p != q and p in q for q in parts if q):
            continue                      # subsumed by a longer segment
        if p not in keep:
            keep.append(p)
    return ", ".join(keep)


# The services this system sells.
#
# A dict and not four buttons on a page: the catalogue is meant to grow into
# the hundreds, so it is queried and searched like any other list rather than
# drawn by hand. Each entry carries the questions that service actually needs
# answering — a survey needs to know which boundary, an EC needs a year range
# — because a work order with no parameters is one a caretaker cannot act on.
#
# fields: (name, label, type, required, options, help)
#   type is one of: text | date | year | select | number | textarea
SERVICE_CATALOGUE: dict = {
    "ec": {
        "label": "Encumbrance Certificate",
        "price": 1180.0,
        "group": "Records",
        "blurb": "The registrar's list of every transaction on this land, for a period you choose.",
        "days": 7,
        "fields": [
            ("from_year", "From year", "year", False, [],
             "Leave both empty for the full history, which is what the registrar gives by default."),
            ("to_year", "To year", "year", False, [], ""),
            ("purpose", "What it is for", "select", False,
             ["Sale", "Loan", "Court", "Own records"], ""),
        ],
    },
    "survey": {
        "label": "Boundary re-survey",
        "price": 2900.0,
        "group": "On the ground",
        "blurb": "A licensed surveyor walks the boundary and pins each corner against the FMB sheet.",
        "days": 21,
        "fields": [
            ("which_side", "Which boundary", "select", True,
             ["All four", "North", "South", "East", "West"], ""),
            ("dispute", "Is a neighbour disputing it?", "select", True, ["No", "Yes"],
             "A disputed boundary is surveyed with both parties present."),
            ("notes", "Anything the surveyor should know", "textarea", False, [], ""),
        ],
    },
    "site_visit": {
        "label": "Site visit",
        "price": 1200.0,
        "group": "On the ground",
        "blurb": "Someone stands on the land, photographs it and reports what they found.",
        "days": 7,
        "fields": [
            ("visit_on", "Preferred date", "date", False, [], "Left empty, we go within the week."),
            ("check", "What to check", "select", True,
             ["General condition", "Crop", "Encroachment", "Water", "Fencing"], ""),
            ("meet", "Who to meet on site", "text", False, [], ""),
        ],
    },
    "title_opinion": {
        "label": "Title opinion",
        "price": 4500.0,
        "group": "Legal",
        "blurb": "An advocate reads the chain of documents and writes whether the title is clean.",
        "days": 14,
        "fields": [
            ("years", "How far back to trace", "select", True,
             ["13 years", "30 years"], "Banks usually ask for 30."),
            ("for_bank", "Which bank, if it is for a loan", "text", False, [], ""),
        ],
    },
    "mutation": {
        "label": "Mutation / name transfer",
        "price": 2200.0,
        "group": "Records",
        "blurb": "Getting the revenue record moved into the new owner's name after a sale.",
        "days": 30,
        "fields": [
            ("new_owner", "Name to transfer into", "text", True, [], ""),
            ("deed_no", "Registered deed number", "text", True, [], ""),
        ],
    },
    "patta_copy": {
        "label": "Certified patta copy",
        "price": 450.0,
        "group": "Records",
        "blurb": "A stamped copy of the pattadar passbook entry from the village office.",
        "days": 5,
        "fields": [
            ("copies", "How many copies", "number", True, [], ""),
        ],
    },
}


async def _cards(conn, uid: str) -> List[dict]:
    """Every record the user owns, parcel and built, in one shape.

    Kept as dicts (not RecordCard) so the facet counter and the card list can
    share exactly one query — the rail can never disagree with the grid.
    """
    rows: List[dict] = []
    # `pb.group_id`, not `p.group_id`: a parcel has no group of its own. Agri
    # land is grouped through the khata it sits under — one passbook holds many
    # parcels and they move between groups together — whereas a built property
    # carries its own `group_id` and may have no passbook at all. Both are
    # normalised to one `group_id` key here so every caller can ask "whose
    # group holds this?" without knowing which table answered.
    cur = await conn.execute(
        "SELECT p.*, pb.pattadar_no, pb.village, pb.mandal, pb.district, pb.owner_name, "
        "pb.state, pb.group_id "
        "FROM parcels p JOIN passbooks pb ON pb.id = p.passbook_id "
        "WHERE pb.owner_user_id = %s ORDER BY p.created_at DESC", (uid,))
    for r in await cur.fetchall():
        sub = (r.get("subdivision") or "").strip()
        title = f"Sy {r['survey_no']}" + (f"/{sub}" if sub else "")
        rows.append({
            "id": r["id"], "kind": "parcel", "title": title,
            "archived": bool(r.get("archived")), "passbook_id": r.get("passbook_id") or "",
            "group_id": r.get("group_id") or "",
            "subtitle": r.get("owner_name") or "",
            "classification": r.get("classification") or "agri",
            "status": r.get("status") or "owned",
            "stake": r.get("stake") or "owned",
            "khata_no": r.get("pattadar_no") or "",
            "owner_name": r.get("owner_name") or "",
            "village": r.get("village") or "", "mandal": r.get("mandal") or "",
            "district": r.get("district") or "", "state": r.get("state") or "",
            "extent": _f(r.get("extent")), "extent_unit": "ac",
            "market_value": _f(r.get("market_value")),
            "purchase_price": _f(r.get("purchase_price")),
            "loan_amount": _f(r.get("loan_amount")),
            "geo_point": r.get("geo_point") or "", "shape": r.get("shape") or "",
            "boundary": r.get("boundary") or "",
            "address": r.get("address") or "", "created_at": r.get("created_at") or "",
        })
    cur = await conn.execute(
        "SELECT * FROM properties WHERE owner_user_id = %s ORDER BY created_at DESC", (uid,))
    for r in await cur.fetchall():
        built = _f(r.get("builtup_area"))
        rows.append({
            "id": r["id"], "kind": "property", "title": r.get("label") or "Property",
            # A property's passbook is genuinely optional — `properties` has no
            # passbook_id column at all — so this stays empty rather than
            # pretending every holding sits under a khata.
            "archived": bool(r.get("archived")), "passbook_id": "",
            "group_id": r.get("group_id") or "",
            "subtitle": r.get("owner_name") or "",
            "classification": r.get("type") or "open_plot",
            "status": r.get("holding_status") or "owned",
            "stake": r.get("stake") or "owned",
            "khata_no": r.get("khata_no") or "",
            "owner_name": r.get("owner_name") or "",
            "village": r.get("locality") or "", "mandal": r.get("city") or "",
            "district": r.get("district") or "",
            "extent": built or _f(r.get("land_area")),
            "extent_unit": "sq.ft" if built else "sq.yd",
            "market_value": _f(r.get("market_value")) or _f(r.get("current_value")),
            "purchase_price": _f(r.get("purchase_price")),
            "loan_amount": 0.0,
            "geo_point": r.get("geo_point") or "", "shape": r.get("shape") or "",
            "boundary": r.get("boundary") or "",
            # `properties` has no state column; the caller falls back rather
            # than this inventing one.
            "state": "",
            "address": r.get("address") or "", "created_at": r.get("created_at") or "",
        })
    # Parcels and properties are two tables but one list to the reader, so the
    # merged result is re-sorted by recency — otherwise "recently opened" would
    # only ever show parcels.
    rows.sort(key=lambda r: r["created_at"], reverse=True)
    return rows


def _active(rows: List[dict]) -> List[dict]:
    """Archived records leave every aggregate, map and search — the Properties
    screen's own Archived facet is the one place they still answer from."""
    return [r for r in rows if not r.get("archived")]


async def _tags_for(conn, uid: str, entity_type: str) -> dict:
    cur = await conn.execute(
        "SELECT entity_id, tag FROM record_tags WHERE owner_user_id=%s AND entity_type=%s "
        "ORDER BY created_at", (uid, entity_type))
    out: dict = {}
    for r in await cur.fetchall():
        out.setdefault(r["entity_id"], []).append(r["tag"])
    return out


def _in_group(n: float) -> str:
    """12,34,567 — Indian grouping. Python's ':,' groups in thousands, so an
    extent read '145,200 Sq.yd' beside rupee figures grouped 1,45,200."""
    s = f"{int(round(n)):d}"
    neg, s = (s[0] == "-"), s.lstrip("-")
    if len(s) <= 3:
        return ("-" if neg else "") + s
    head, tail = s[:-3], s[-3:]
    out, i = "", len(head)
    while i > 2:
        out = "," + head[i - 2:i] + out
        i -= 2
    out = head[:i] + out
    return ("-" if neg else "") + out + "," + tail


def _extent_detail(extent: float, unit: str) -> str:
    """The same extent in the units a village office, a buyer and a bank each
    use. Zero components are dropped and the nouns agree, so a 0.41-acre plot
    reads '16.4 Guntas · 41 Cents' and not '0 Acres 16.4 Guntas'."""
    if unit != "ac":
        if unit == "sq.ft":
            return f"{_in_group(extent * 0.092903)} sq.m"
        if unit == "sq.yd":
            return f"{_in_group(extent * 0.836127)} sq.m"
        return ""
    acres = int(extent)
    guntas = round((extent - acres) * 40, 1)
    # Acres and guntas are one reading ("3 Acres 9.6 Guntas"), so they share a
    # space; the other units are alternatives and take the separator.
    head = []
    if acres:
        head.append(f"{acres} Acre" + ("s" if acres != 1 else ""))
    if guntas:
        head.append(f"{guntas:g} Gunta" + ("s" if guntas != 1 else ""))
    bits = [" ".join(head)] if head else ["0 Acres"]
    bits.append(f"{_in_group(extent * 100)} Cents")
    bits.append(f"{_in_group(extent * 4840)} Sq.yd")
    return " · ".join(bits)


async def _covers(conn, uid: str) -> dict:
    """One cover photo per record, for every record the user owns.

    Two queries, not one per card: a grid of forty records asking for its own
    cover forty times is the N+1 the facet counter and the card list already
    share one query to avoid.

    "Cover" is the photo somebody chose, and failing that the first one that
    can actually be shown. A row whose `file_ref` is empty is metadata with no
    bytes behind it — the seed writes 167 of those — and offering one to a card
    would render the broken-image glyph instead of the record's own artwork.
    So the WHERE clause drops them and the ORDER BY puts a chosen cover first.
    """
    out: dict = {}
    for table, key in (("parcel_photos", "parcel_id"), ("property_photos", "property_id")):
        cur = await conn.execute(
            f"SELECT DISTINCT ON ({key}) {key} AS rid, file_ref FROM {table} "
            "WHERE owner_user_id=%s AND file_ref <> '' AND media_kind='photo' "
            f"ORDER BY {key}, is_cover DESC, sort, created_at", (uid,))
        for r in await cur.fetchall():
            out[r["rid"]] = r["file_ref"] or ""
    return out


def _photo_table(kind: str) -> str:
    """A parcel's photos and a built property's photos live in different
    tables; reading only the first showed every flat as having none."""
    return "parcel_photos" if kind == "parcel" else "property_photos"


def _photo_key(kind: str) -> str:
    return "parcel_id" if kind == "parcel" else "property_id"


def _today() -> str:
    return date.today().isoformat()


def _days_until(ddmmyyyy_str: str) -> int:
    """Days from today to a DD/MM/YYYY date. Share links used to report the
    `sort` column here, so a link 18 days out could read '1 day left'."""
    s = (ddmmyyyy_str or "").strip()
    if len(s) != 10 or s[2] != "/" or s[5] != "/":
        return 0
    try:
        when = date(int(s[6:10]), int(s[3:5]), int(s[0:2]))
    except ValueError:
        return 0
    return max(0, (when - date.today()).days)


def _ddmmyyyy(s: str) -> str:
    """2026-08-12 → 12/08/2026. Records in this product are always read in the
    Indian order; an ISO date leaking into prose is a bug."""
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return f"{s[8:10]}/{s[5:7]}/{s[0:4]}"
    return s


async def _sheet_detail(conn, record_id: str) -> str:
    """The sketch's real version history. Every record used to claim
    "v2 · replaced 04/2024 · v1 kept" whether or not it had ever been
    replaced."""
    cur = await conn.execute(
        "SELECT v.version, v.made_on FROM document_versions v JOIN documents d"
        " ON d.id = v.document_id WHERE d.record_id=%s AND d.shelf='map'"
        " ORDER BY v.version DESC", (record_id,))
    rows = await cur.fetchall()
    if not rows:
        return "one version · never replaced"
    top = rows[0]
    if len(rows) == 1:
        return f"v{_i(top.get('version'))} · never replaced"
    return (f"v{_i(top.get('version'))} · replaced {top.get('made_on') or ''}"
            f" · v{_i(rows[-1].get('version'))} kept").strip()


async def _fmb_sheet_row(conn, record_id: str) -> dict:
    """The map-shelf paper this record's sketch lives on, or {}."""
    cur = await conn.execute(
        "SELECT id, name FROM documents WHERE record_id=%s AND shelf='map' "
        "ORDER BY (name ILIKE 'FMB%%') DESC, sort LIMIT 1", (record_id,))
    return await cur.fetchone() or {}


async def _fmb_sheet(conn, record_id: str, title: str) -> str:
    """The record's own sketch name, read off its map-shelf paper — or "" when
    it has none.

    Every record used to claim 'FMB 214' because that is what the first one was
    called; then it claimed 'FMB <its own survey number>', which is worse, being
    plausible. A sheet name is a claim that a document exists. A parcel filed
    this morning with nothing attached to it has no sheet, and the screens that
    quote one have to cope with that rather than be handed a fiction."""
    # An FMB is the survey department's own sheet and outranks a traced copy,
    # so it wins even if a tippon happens to sort first.
    cur = await conn.execute(
        "SELECT name FROM documents WHERE record_id=%s AND shelf='map' "
        "ORDER BY (name ILIKE 'FMB%%') DESC, sort LIMIT 1", (record_id,))
    row = await cur.fetchone()
    if row and row.get("name"):
        return str(row["name"])
    return ""


def _boundary_caption(sheet: str, surveyed: bool, village: str) -> str:
    """What W04's panel is showing, in its own words."""
    if sheet and surveyed:
        head = f"{sheet} traced over the parcel"
    elif surveyed:
        head = "Surveyed boundary"
    elif sheet:
        head = f"{sheet} on file — not traced over the ground yet"
    else:
        head = ""
    return f"{head} · {village}".strip(" ·") if village else head


def _map_caption(sheet: str, kind: str, surveyed: bool) -> str:
    """What the little map on the record's front page is actually showing.

    A named sheet traced over the plot, a surveyed boundary with no sheet
    filed, or — for a record that has neither — nothing, because the map is
    then only the neighbourhood and saying more would be inventing it."""
    where = "survey plot" if kind == "parcel" else "site"
    if sheet:
        return f"{sheet} over the {where}"
    if surveyed:
        return f"Surveyed boundary over the {where}"
    return ""


def _datekey(s: str) -> str:
    """Sort key for a DD/MM/YYYY date. Ledger rows are stored the way they are
    read, so ordering them as plain text put 28/07 above 12/08. Returns
    YYYYMMDD; anything unparseable sorts last."""
    s = (s or "").strip()
    if len(s) == 10 and s[2] == "/" and s[5] == "/":
        return f"{s[6:10]}{s[3:5]}{s[0:2]}"
    if len(s) >= 10 and s[4] == "-":
        return s[0:4] + s[5:7] + s[8:10]
    return "00000000"


def _shape(raw: str) -> List[float]:
    """'0.10,0.72 0.11,0.38' → [0.10, 0.72, 0.11, 0.38].

    A polygon is stored the way it reads — comma between a point's x and y, a
    space between points — so the parser must accept BOTH separators. Splitting
    on commas alone yielded '0.72 0.11' and took the whole map down with it."""
    out: List[float] = []
    for tok in re.split(r"[,\s]+", (raw or "").strip()):
        if not tok:
            continue
        try:
            out.append(float(tok))
        except ValueError:
            return []          # a malformed shape draws nothing, never raises
    return out


def _ring(raw: str) -> List[float]:
    """'17.0776,82.1387;17.0788,82.1386' → [17.0776, 82.1387, 17.0788, 82.1386].

    The surveyed outline as `parcels.boundary` stores it: a semicolon between
    corners, a comma inside one. Flattened for the same reason `shape` is —
    one list crosses the wire, and the client pairs it up.

    A half-written corner drops the whole ring rather than drawing three sides
    of a parcel; a boundary that is wrong in a way nobody can see is worse than
    no boundary at all.
    """
    out: List[float] = []
    for corner in (raw or "").split(";"):
        corner = corner.strip()
        if not corner:
            continue
        lat, _, lon = corner.partition(",")
        try:
            out.extend([float(lat.strip()), float(lon.strip())])
        except ValueError:
            return []
    # Two corners enclose nothing. Callers read "empty" as "not surveyed".
    return out if len(out) >= 6 else []


def _latlon(geo: str) -> tuple:
    try:
        lat, _, lon = (geo or "").partition(",")
        return float(lat.strip()), float(lon.strip())
    except (ValueError, AttributeError):
        return 0.0, 0.0


def _located(geo: str, ring: List[float]) -> tuple:
    """Where the record IS, from whichever of the two facts it has.

    `geo_point` is a pin somebody dropped; a boundary is a survey. A record can
    easily have the second and not the first — five of the eight parcels in the
    founder's own account do — and _latlon() answers 0,0 for a missing pin,
    which is a real place: null island, in the Gulf of Guinea. A map that plots
    it there has not failed to locate the record, it has located it wrongly,
    which is the worse of the two. So a ring answers the question when there is
    no pin: the average of its corners, which for the closed convex shapes a
    parcel is lands inside the parcel.
    """
    lat, lon = _latlon(geo)
    if (lat or lon) or len(ring) < 6:
        return lat, lon
    lats = ring[0::2]
    lons = ring[1::2]
    return sum(lats) / len(lats), sum(lons) / len(lons)


def _to_card(d: dict, tags: List[str], cover: str = "") -> RecordCard:
    alt = ""
    if d["extent_unit"] == "ac":
        alt = f"{_in_group(d['extent'] * 4840)} Sq.yd"
    elif d["extent_unit"] == "sq.ft":
        alt = f"{_in_group(d['extent'] * 0.092903)} sq.m"
    elif d["extent_unit"] == "sq.yd":
        alt = f"{_in_group(d['extent'] * 0.836127)} sq.m"
    ring = _ring(d.get("boundary") or "")
    lat, lon = _located(d.get("geo_point") or "", ring)
    return RecordCard(
        id=d["id"], kind=d["kind"], title=d["title"],
        passbook_id=d.get("passbook_id") or "", group_id=d.get("group_id") or "",
        subtitle=d["subtitle"],
        classification=d["classification"], status=d["status"], stake=d["stake"],
        khata_no=d["khata_no"], owner_name=d["owner_name"], village=d["village"],
        mandal=d["mandal"], district=d["district"],
        place_line=_place_line(d["village"], d["mandal"], ""),
        extent=d["extent"], extent_unit=d["extent_unit"], extent_alt=alt,
        market_value=d["market_value"], tags=list(tags),
        lat=lat, lon=lon, ring=ring, cover_file_ref=cover,
    )


# ── Query namespace ───────────────────────────────────────────────────

# ── Service tickets (W16) ─────────────────────────────────────────────
#
# A ticket IS a work_requests row; nothing below is a second kind of order.
# What hangs off it is its trail, what left the building, what came back, and
# every rupee — four tables keyed on the same id.
#
# The RULES live in ticketing.py: which moves are legal, what a settlement
# produces, what a message says on each channel, and exactly which row an
# accepted deliverable becomes. That module has no database and no clock, so
# the arithmetic that decides who gets paid can be pinned in a test. What is
# left here is SQL and strawberry, which is all this file should ever hold.


@strawberry.type
class Pair:
    """A labelled value. Answers and filing choices cross the wire as lists of
    these rather than as JSON the page has to parse and label itself."""
    k: str
    v: str


@strawberry.type
class TicketEvent:
    """One line of the trail. Written at the moment it happened, headline and
    all, so code written next year cannot re-word an event from this one."""
    id: str
    kind: str                 # status | dispatch | deliverable | filed | payment | refused
    action: str
    headline: str
    detail: str
    actor_label: str
    actor_kind: str           # owner | worker | system
    tone: str                 # plain | up | down | accent
    at: str
    at_label: str


@strawberry.type
class TicketDeliverable:
    """Something that came back, before anybody accepted it. Not a paper, a
    photo or a feature yet — it becomes one of those when the owner says so."""
    id: str
    kind: str                 # paper | photo | boundary | feature
    label: str
    note: str
    file_ref: str
    file_name: str
    mime_type: str
    size_bytes: int
    payload: str
    submitted_by: str
    submitted_at: str
    file_as: str
    file_targets: List[Pair]
    goes_to: str
    review: str               # pending | accepted | rejected
    review_note: str
    filed_table: str
    filed_id: str
    filed_at: str


# ── The desk: the people who do the work (W17) ────────────────────────
#
# Every type below is deliberately narrow. The resolvers that read
# `work_requests` across owners answer in these shapes and never in
# RecordDetail or TicketView, so an admin looking at the desk sees the job,
# the place and the money on that job — and never the owner's records.
#
# Phase 1 has no offers and no dispatcher. The offer columns exist in the
# schema and nothing here reads them: `offers_out`, `offers_sent`,
# `next_round_at` and their neighbours are present because the client renders
# one shape in both phases, and they answer 0 / "" until phase 2 writes them.


@strawberry.type
class DisciplineInfo:
    """One line of work somebody enrols in, straight off associates.DISCIPLINES.

    Read from no table and served to everybody. The enrolment form needs the
    nine cards before a single associate exists, and a query that opened a
    connection to answer a constant would be the one thing on that screen that
    could fail while the roster was still empty."""
    key: str
    label: str
    blurb: str
    kinds: List[str]
    area_grain: str
    credential: str
    fanout: int


@strawberry.type
class AssociateArea:
    """One place somebody works. `name` is what was typed and `label` is what
    a screen prints; the folded key that is actually compared never leaves the
    database, because nobody can read 'peddapuram' and know it means
    'Peddapuram (R)'."""
    id: str
    level: str                # village | mandal | city | district | state
    name: str
    label: str                # "Peddapuram village" / "All of Telangana"


@strawberry.type
class AssociateDiscipline:
    """One kind of work this person does, and how much of it they are holding.

    `open_count` is a COUNT of live jobs taken in the roster query. There is no
    stored counter for it to disagree with: a counter incremented on assignment
    and forgotten on completion freezes the roster after three jobs each, and
    it does it silently, which is why this figure is derived every time."""
    key: str
    label: str
    state: str                # on | off | blocked
    state_word: str
    capacity: int
    open_count: int
    credential_state: str     # "" | pending | verified | expiring | lapsed


@strawberry.type
class AssociateCredential:
    """A paper somebody can show. Recorded, not gating — until one has been
    verified and then lapses, which is the only case that stops work.

    The number is masked here and encrypted at rest; nothing on any screen
    prints a licence number in full."""
    id: str
    discipline: str
    kind: str
    number_masked: str
    authority: str
    expires_on: str           # DD/MM/YYYY, the way every date is read here
    days_left: int
    expiring: bool
    lapsed: bool
    review: str               # pending | verified | rejected
    review_note: str
    file_ref: str
    file_name: str


@strawberry.type
class Associate:
    """One person on the roster, as the desk sees them.

    `contact` is the real number and `contact_masked` is beside it, because
    this type is only ever returned by an `_is_admin`-guarded resolver and the
    desk's whole job in phase 1 is to pick up the phone. Every owner-facing
    shape — AssociateCard, AssignedPerson — carries either no number at all or
    one that has passed the four conditions listed over AssignedPerson.

    There is no rating and no score on this type. Neither exists."""
    id: str
    name: str
    firm: str
    initials: str
    contact: str
    contact_masked: str
    contact_visible: bool
    alt_contact: str
    channel: str              # auto | sms | whatsapp | email
    state: str                # invited | active | paused | blocked
    state_word: str
    state_state: str          # good | warn | bad | unknown
    state_reason: str
    disciplines: List[AssociateDiscipline]
    areas: List[AssociateArea]
    credentials: List[AssociateCredential]
    claimed: bool
    dispatchable: bool
    why_not: List[str]
    jobs_open: int
    jobs_done: int
    offers_sent: int
    offers_taken: int
    offers_declined: int
    accept_rate: float
    last_offered_at: str
    note: str
    created_at: str


@strawberry.type
class AssociateCard:
    """The same person, to the owner whose job is being assigned.

    No contact of any kind, deliberately. An owner choosing who to put on their
    job needs a name, a line of work and a place; the number becomes theirs
    when somebody is actually on the job, through AssignedPerson, and not one
    moment earlier."""
    id: str
    name: str
    firm: str
    initials: str
    disciplines: List[str]
    discipline_labels: List[str]
    areas: List[str]
    verified: bool
    jobs_open: int
    jobs_done: int
    accepts_more: bool
    why: List[str]


@strawberry.type
class AssociateEvent:
    """One line of somebody's trail. Append-only, the same posture as
    ticket_events: this is the file that gets opened when an associate asks why
    they stopped getting work."""
    id: str
    kind: str
    headline: str
    detail: str
    actor_label: str
    actor_kind: str
    at: str
    at_label: str


@strawberry.type
class Candidate:
    """Somebody who could take one particular job, with the reasons.

    An ineligible candidate is returned rather than filtered out, carrying
    `why_not`. A shortlist that quietly shrank from four names to one is a
    question the desk needs answered on the screen, not a shorter list."""
    associate_id: str
    name: str
    initials: str
    contact: str
    discipline: str
    area_match: str
    open_count: int
    capacity: int
    accept_rate: float
    last_offered_at: str
    rank: int
    why: List[str]
    eligible: bool
    why_not: List[str]
    already_offered: bool
    already_declined: bool


@strawberry.type
class AssignedPerson:
    """Who is on this job, and whether the owner may have their number.

    `contact` is filled on four conditions all holding: the caller owns the
    ticket, the job is live or freshly accepted, `assignee_ref` points at a
    real associate, and that associate agreed at enrolment that an owner may
    see their number while they are on that owner's job. Otherwise `contact` is
    empty, `contact_masked` carries the ••••• form and `contact_why` is a
    sentence saying why — never a disabled button with a title attribute."""
    associate_id: str
    name: str
    firm: str
    initials: str
    discipline: str
    discipline_label: str
    contact: str
    contact_masked: str
    contact_shown: bool
    contact_why: str
    jobs_open: int
    assigned_at: str
    via: str                  # the desk | you | they took it


@strawberry.type
class DeskJob:
    """One job on the ops desk. Cross-owner, and therefore as narrow as it can
    be: no record id, no owner, no answers, no papers. The place is the stamped
    `area_label` — the desk does not read somebody's parcels to print a
    heading."""
    ticket_id: str
    ref: str
    kind: str
    service_label: str
    place: str
    status: str
    status_label: str
    status_state: str
    assignee: str
    assignee_ref: str
    assignee_contact: str
    ordered_at: str
    age_days: int
    due_date: str
    overdue: bool
    quiet: bool
    quiet_days: int
    quoted: float
    held: float
    dispatch_state: str
    dispatch_round: int
    next_round_at: str
    offers_out: int
    offers_declined: int
    last_response: str
    candidate_count: int
    stuck: bool


@strawberry.type
class CoverageCell:
    """One place against one line of work. A zero here is a service Pattadar
    can sell in that place with nobody to do it."""
    level: str
    name: str
    discipline: str
    discipline_label: str
    active_count: int
    open_jobs: int
    records: int
    risk: str                 # gap (nobody, and work waiting) | empty | ok


@strawberry.type
class DeskTask:
    """Something the desk has to do. `to` is where the row goes when it is
    clicked, decided here so the client never has to guess which of the two
    ids on the row is the one that matters."""
    id: str
    kind: str
    headline: str
    detail: str
    associate_id: str
    ticket_id: str
    to: str
    at: str


@strawberry.type
class Desk:
    """The whole ops desk in one read.

    Every figure is a COUNT taken in the query that answers this. `jobs` and
    `silent` are the two lists the screen draws; the counts are always computed
    whichever scope was asked for, because the strip has to be able to say
    "2 nothing happening" while the user is looking at the waiting list."""
    mode: str                 # off | shadow | live
    mode_word: str
    jobs: List[DeskJob]
    silent: List[DeskJob]
    unassigned: int
    ageing: int
    silent_count: int
    stuck: int
    associates_active: int
    associates_pending: int
    credentials_expiring: int
    coverage_gaps: int
    tasks_open: int


@strawberry.type
class TicketDispatch:
    """One time this ticket left the building. The contact is masked because a
    screenshot of a tracking page should not carry a phone number, and the body
    is kept verbatim because "what exactly did you send him" is the question a
    dispute starts with."""
    id: str
    purpose: str
    channel: str              # email | whatsapp | sms
    contact_masked: str
    person_name: str
    subject: str
    body: str
    provider: str             # stub | resend | msg91 | meta
    live: bool
    status: str               # logged | sent | failed
    status_word: str
    error: str
    expires_on: str
    days_left: int
    revoked: bool
    revoke_reason: str
    sent_at: str


@strawberry.type
class TicketLedgerRow:
    """One movement between two named buckets. `simulated` is the row's own
    answer to "was this rupee ever real", read off the provider that wrote it
    rather than off a flag somebody has to remember to flip."""
    id: str
    entry: str                # top_up | hold | release | fee | return
    label: str
    amount: float
    from_bucket: str
    to_bucket: str
    payee: str
    provider: str
    simulated: bool
    status: str               # recorded | settled | failed
    note: str
    ticket_id: str
    ticket_ref: str
    at: str


@strawberry.type
class TicketMoney:
    """What this job costs, where the money is, and one honest sentence about
    whether any of it moved."""
    quoted: float
    held: float
    released: float
    fee: float
    returned: float
    payee_share: float
    provider: str
    live: bool
    funded: bool
    headline: str
    honesty: str


@strawberry.type
class TicketView:
    """The whole ticket. `stage` and `stage_label` are the same four-valued pip
    the Services list has always drawn; `status` and `status_label` are the
    finer truth the pips cannot carry."""
    id: str
    ref: str
    kind: str
    title: str
    detail: str
    record_id: str
    record_title: str
    record_place: str
    status: str
    status_label: str
    status_state: str         # good | warn | bad | unknown
    stage: int
    stage_label: str
    needs_you: bool
    closed: bool
    assignee: str
    due_date: str
    quiet_days: int
    quiet: bool
    outcome_note: str
    accepted_at: str
    created_at: str
    can: List[str]
    answers: List[Pair]
    money: TicketMoney
    events: List[TicketEvent]
    deliverables: List[TicketDeliverable]
    dispatches: List[TicketDispatch]
    ledger: List[TicketLedgerRow]
    # W17, appended with defaults so older selection sets still parse.
    # `assigned_to` is None on every job whose assignee is a hand-typed name,
    # which is what the owner's card reads to know whether it may offer a
    # Call control at all. `dispatch_state` is '' until a dispatcher exists.
    assigned_to: Optional[AssignedPerson] = None
    dispatch_state: str = ""


@strawberry.type
class WalletJob:
    ticket_id: str
    ref: str
    title: str
    record_title: str
    status_label: str
    held: float


@strawberry.type
class WalletView:
    """The wallet page's four figures, the jobs holding money, and the ledger.

    Each figure is labelled by the screen for what it actually is: the People
    rail's balance and `available` are different questions and must not be
    passed off as the same number."""
    available: float
    set_aside: float
    paid_out: float
    put_in: float
    auto_top_up: bool
    provider: str
    live: bool
    notice: str
    jobs: List[WalletJob]
    rows: List[TicketLedgerRow]


# The purposes a dispatch can carry, matching the vocabulary the DDL comment
# fixes. Anything else is a message nobody wrote an opener for.
_DISPATCH_PURPOSES = ("invite", "nudge", "message", "changes", "withdrawn", "accepted")

# What a dispatch's status means in words. notify.py's own three: the stub
# logs, a live provider sends or fails.
_DISPATCH_WORD = {"logged": "Recorded, not sent", "sent": "Sent", "failed": "Failed"}


def _env(key: str, default: str = "") -> str:
    return (os.getenv(key) or default).strip()


def _payments_provider() -> str:
    """Local accounting is simulated until a provider confirms an operation.

    Credentials alone are not proof of a charge or payout. This ledger writer
    performs no provider call, so it must never produce a live settlement.
    """
    return "stub"


def _payee_share() -> float:
    """The worker's share of a quoted price. Written onto the ticket at order
    time, so changing this later cannot rewrite an old job's economics."""
    try:
        share = float(_env("PAYMENTS_PAYEE_SHARE") or ticketing.DEFAULT_PAYEE_SHARE)
    except ValueError:
        return ticketing.DEFAULT_PAYEE_SHARE
    return share if 0.0 <= share <= 1.0 else ticketing.DEFAULT_PAYEE_SHARE


def _status_of(r: dict) -> str:
    """A work_requests row's status. Seeded and legacy rows carry a stage and
    no status, and a reseed puts them back, so this is read every time rather
    than backfilled once."""
    return ticketing.status_of(r.get("status") or "", _i(r.get("stage")), bool(r.get("closed")))


def _quoted_of(r: dict) -> float:
    """What this job was quoted at. `quoted` is frozen at order time; a row
    written before this feature has none, and its `cost` is the only figure
    anybody ever agreed to."""
    return _f(r.get("quoted")) or _f(r.get("cost"))


def _answers(kind: str, params: str) -> List[Pair]:
    """What the owner answered when ordering, under the labels the form asked
    them. A key the catalogue no longer has is shown as its own name rather
    than dropped: an answer nobody can read is still an answer the person
    doing the work needs."""
    try:
        vals = json.loads(params or "{}")
    except ValueError:
        return []
    if not isinstance(vals, dict):
        return []
    labels = {f[0]: f[1] for f in (SERVICE_CATALOGUE.get(kind) or {}).get("fields", [])}
    out: List[Pair] = []
    for key, val in vals.items():
        if key == "attachment_manifest":
            continue
        text = ", ".join(str(x) for x in val) if isinstance(val, list) else str(val)
        if not text.strip():
            continue
        out.append(Pair(k=labels.get(key) or str(key).replace("_", " ").capitalize(), v=text))
    return out


def _extent_label(card: dict) -> str:
    """'4.10 ac' / '2,400 sq.yd' — the way every other screen writes it."""
    ext = _f(card.get("extent"))
    if not ext:
        return ""
    unit = card.get("extent_unit") or ""
    return f"{ext:,.2f} ac" if unit == "ac" else f"{ext:,.0f} {unit}".strip()


def _card_place(card: dict) -> str:
    return _place_line(card.get("village") or "", card.get("mandal") or "",
                       card.get("district") or "")


# ── Ticket reads ──────────────────────────────────────────────────────

async def _ticket_row(conn, uid: str, ticket_id: str, *, lock: bool = False) -> dict:
    """One ticket, or {} — scoped by owner, so no id off the wire reaches a
    ticket the caller does not own."""
    cur = await conn.execute(
        "SELECT * FROM work_requests WHERE id=%s AND owner_user_id=%s"
        + (" FOR UPDATE" if lock else ""), (ticket_id, uid))
    return await cur.fetchone() or {}


@asynccontextmanager
async def _ticket_transaction():
    """Keep ticket state, filing, ledger and audit in one database commit."""
    async with _pool.connection() as conn:
        async with conn.transaction():
            yield conn


async def _ledger_of(conn, uid: str, ticket_id: str) -> List[dict]:
    cur = await conn.execute(
        "SELECT * FROM service_payments WHERE ticket_id=%s AND owner_user_id=%s"
        " ORDER BY created_at, id", (ticket_id, uid))
    return list(await cur.fetchall())


def _ev(r: dict) -> TicketEvent:
    kind, action = r.get("kind") or "", r.get("action") or ""
    at = r.get("at") or ""
    return TicketEvent(
        id=r["id"], kind=kind, action=action, headline=r.get("headline") or "",
        detail=r.get("detail") or "", actor_label=r.get("actor_label") or "",
        actor_kind=r.get("actor_kind") or "", tone=ticketing.event_tone(kind, action),
        at=at, at_label=_ddmmyyyy(at[:10]))


def _dv(r: dict, ticket_kind: str) -> TicketDeliverable:
    kind = r.get("kind") or "paper"
    return TicketDeliverable(
        id=r["id"], kind=kind, label=r.get("label") or "", note=r.get("note") or "",
        file_ref=r.get("file_ref") or "", file_name=r.get("file_name") or "",
        mime_type=r.get("mime_type") or "", size_bytes=_i(r.get("size_bytes")),
        payload=r.get("payload") or "{}", submitted_by=r.get("submitted_by") or "",
        submitted_at=r.get("submitted_at") or "", file_as=r.get("file_as") or "",
        file_targets=[Pair(k=str(k), v=str(v)) for (k, v) in ticketing.file_targets(kind)],
        goes_to=ticketing.goes_to(kind, r.get("file_as") or "", ticket_kind),
        review=r.get("review") or "pending", review_note=r.get("review_note") or "",
        filed_table=r.get("filed_table") or "", filed_id=r.get("filed_id") or "",
        filed_at=r.get("filed_at") or "")


def _dx(r: dict) -> TicketDispatch:
    provider = r.get("provider") or "stub"
    status = r.get("status") or ""
    expires = r.get("expires_on") or ""
    return TicketDispatch(
        id=r["id"], purpose=r.get("purpose") or "", channel=r.get("channel") or "",
        contact_masked=ticketing.mask_contact(r.get("contact") or ""),
        person_name=r.get("person_name") or "", subject=r.get("subject") or "",
        body=r.get("body") or "", provider=provider, live=ticketing.is_live(provider),
        status=status, status_word=_DISPATCH_WORD.get(status, status),
        error=r.get("error") or "", expires_on=expires, days_left=_days_until(expires),
        revoked=bool(r.get("revoked_at")), revoke_reason=r.get("revoke_reason") or "",
        sent_at=_ddmmyyyy((r.get("sent_at") or "")[:10]))


def _lr(r: dict) -> TicketLedgerRow:
    entry = r.get("entry") or ""
    provider = r.get("provider") or "stub"
    tid = r.get("ticket_id") or ""
    return TicketLedgerRow(
        id=r["id"], entry=entry, label=ticketing.ENTRY_LABEL.get(entry, entry),
        amount=_f(r.get("amount")), from_bucket=r.get("from_bucket") or "",
        to_bucket=r.get("to_bucket") or "", payee=r.get("payee") or "",
        provider=provider, simulated=not ticketing.is_live(provider),
        status=r.get("status") or "", note=r.get("note") or "", ticket_id=tid,
        ticket_ref=ticketing.ticket_ref(tid) if tid else "",
        at=_ddmmyyyy((r.get("created_at") or "")[:10]))


def _money_of(ticket: dict, rows: List[dict]) -> TicketMoney:
    """Every figure a ticket's Money card shows, from the ledger and nothing
    else. There is no stored balance to disagree with the rows."""
    provider = next((r.get("provider") for r in reversed(rows)
                     if r.get("provider") and r.get("provider") != "stub"), _payments_provider())
    buckets = ticketing.fold(rows)
    held = ticketing.held_for(rows)
    released = _f(buckets.get("payout"))
    returned = sum(_f(r.get("amount")) for r in rows
                   if (r.get("entry") == "return" and r.get("status") != "failed"))
    quoted = _quoted_of(ticket)
    payee = ticket.get("assignee") or ""
    return TicketMoney(
        quoted=quoted, held=held, released=released, fee=_f(buckets.get("fee")),
        returned=returned, payee_share=_f(ticket.get("payee_share")) or _payee_share(),
        provider=provider, live=ticketing.is_live(provider), funded=held > 0,
        headline=ticketing.money_headline(quoted, held, released, returned,
                                          _status_of(ticket), payee),
        honesty=ticketing.money_honesty(provider, payee))


# ── Ticket writes ─────────────────────────────────────────────────────

async def _event(conn, uid: str, ticket_id: str, *, kind: str, action: str = "",
                 from_status: str = "", to_status: str = "", actor: str = "",
                 actor_kind: str = "owner", actor_label: str = "You",
                 headline: str = "", detail: str = "", ref_table: str = "",
                 ref_id: str = "") -> str:
    """Append one line to the ticket's trail.

    Nothing here is ever updated; a correction is another row. This is the file
    somebody opens six months later when four thousand rupees are being argued
    about, and a trail that can be edited is not evidence of anything."""
    import uuid as _uuid
    eid = f"te-{_uuid.uuid4().hex[:12]}"
    await conn.execute(
        "INSERT INTO ticket_events (id, owner_user_id, ticket_id, kind, action,"
        " from_status, to_status, actor, actor_kind, actor_label, headline, detail,"
        " ref_table, ref_id, at)"
        " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (eid, uid, ticket_id, kind, action, from_status, to_status, actor or uid,
         actor_kind, actor_label, headline, detail, ref_table, ref_id, _now_iso()))
    return eid


async def _move(conn, uid: str, ticket: dict, action: str, *,
                actor_kind: str = "owner", actor_label: str = "You",
                actor: str = "", note: str = "", detail: str = "") -> str:
    """Move a ticket, or refuse. The only place work_requests.status changes.

    Returns the new status, or "" when the pair is not in
    ticketing.TRANSITIONS. It never raises: the client reads "" as "that did
    not happen", the way every other write in this module reports refusal. A
    refused move is written down rather than repaired, because a machine that
    quietly fixes itself cannot be reconstructed six months later.

    Callers hold the ticket lock in a transaction. The compare-and-set remains
    as defense in depth, and the event commits with its state change.

    `uid` is the ticket's OWNER, always — the event lands in the owner's trail
    and the UPDATE carries an owner predicate, so a desk move made cross-owner
    passes the owner here and names the admin in `actor`. Left empty, `actor`
    falls back to `uid`, which is what every owner-driven caller wants."""
    was = _status_of(ticket)
    step = ticketing.transition(was, action, actor_kind)
    if not step.get("ok"):
        await _event(conn, uid, ticket["id"], kind="refused", action=action,
                     from_status=was, actor=actor, actor_kind=actor_kind,
                     actor_label=actor_label,
                     headline=ticketing.event_headline(
                         "refused", action, {"why": step.get("why") or ""}),
                     detail=detail)
        return ""
    await _event(
        conn, uid, ticket["id"], kind="status", action=action, from_status=was,
        to_status=step["to"], actor=actor, actor_kind=actor_kind, actor_label=actor_label,
        headline=ticketing.event_headline("status", action, {
            "actor_label": actor_label, "actor": actor_label,
            "assignee": ticket.get("assignee") or "", "to": step["to"]}),
        detail=note or detail)
    cur = await conn.execute(
        "UPDATE work_requests SET status=%s, stage=%s, needs_you=%s, closed=%s,"
        " status_at=%s WHERE id=%s AND owner_user_id=%s AND (status=%s OR status='')",
        (step["to"], step["stage"], bool(step["needs_you"]), bool(step["closed"]),
         _now_iso(), ticket["id"], uid, was))
    if not cur.rowcount:
        return ""
    ticket.update({"status": step["to"], "stage": step["stage"],
                   "needs_you": step["needs_you"], "closed": step["closed"]})
    return str(step["to"])


async def _write_ledger(conn, uid: str, ticket_id: str, plan: list, *,
                        actor: str = "", method: str = "") -> int:
    """Write the rows a ticketing plan describes. Returns how many landed.

    Callers hold the ticket row lock inside a transaction. Idempotency keys
    additionally reject duplicated operations; they do not replace rollback.
    """
    try:
        from . import payments
    except ImportError:
        import payments
    routed = await payments.route_ledger_plan(conn, uid, ticket_id, plan)
    if routed is not None:
        return routed
    import uuid as _uuid
    provider = _payments_provider()
    status = ticketing.payment_status(provider)
    n = 0
    for row in plan or []:
        cur = await conn.execute(
            "INSERT INTO service_payments (id, owner_user_id, ticket_id, entry,"
            " from_bucket, to_bucket, amount, payee, payee_ref, method, provider,"
            " provider_ref, status, note, error, idempotency_key, actor, created_at)"
            " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'',%s,%s,'',%s,%s,'',%s,%s,%s)"
            " ON CONFLICT (idempotency_key) WHERE idempotency_key <> ''"
            " DO NOTHING RETURNING id",
            (f"sp-{_uuid.uuid4().hex[:12]}", uid, ticket_id, row.get("entry") or "",
             row.get("from_bucket") or "", row.get("to_bucket") or "",
             _f(row.get("amount")), row.get("payee") or "", method, provider,
             status, row.get("note") or "", row.get("idempotency_key") or "",
             actor or uid, _now_iso()))
        if await cur.fetchone():
            n += 1
            await _event(
                conn, uid, ticket_id, kind="payment", actor=actor or uid,
                actor_kind="system", actor_label="",
                headline=ticketing.event_headline("payment", "", {
                    "entry": row.get("entry") or "", "amount": _f(row.get("amount")),
                    "payee": row.get("payee") or ""}),
                detail=("Recorded, not charged" if not ticketing.is_live(provider)
                        else row.get("note") or ""))
    return n


async def _send(conn, uid: str, channel: str, contact: str, msg: dict) -> dict:
    """Hand one rendered message to notify.py.

    One seam and not a second one: the same stub that makes invites and
    verification testable without an external account makes these testable,
    and setting a provider's credentials goes live with no change here."""
    provider = "stub"
    if channel == "email" and _env("NOTIFY_EMAIL_PROVIDER") == "resend" and _env("RESEND_API_KEY"):
        provider = "resend"
    elif channel == "sms" and _env("NOTIFY_SMS_PROVIDER") == "msg91" and _env("MSG91_AUTHKEY"):
        provider = "msg91"
    elif channel == "whatsapp" and _env("NOTIFY_WA_PROVIDER") == "meta" and _env("WHATSAPP_TOKEN") and _env("WHATSAPP_PHONE_ID"):
        provider = "meta"
    if provider != "stub":
        from . import account
        from fastapi import HTTPException
        try:
            await account.require_purpose(uid, "service_notifications")
        except HTTPException as exc:
            # Withdrawing notification consent must not prevent an owner from
            # cancelling/settling a job. Keep the failed dispatch in the trail.
            return {"provider": provider, "status": "failed", "error": str(exc.detail)}
    if channel == "email":
        res = await notify.send_email(conn, contact, msg.get("subject") or "",
                                      msg.get("body") or "", uid)
    elif channel == "sms":
        res = await notify.send_sms(conn, contact, msg.get("body") or "", uid)
    else:
        res = await notify.send_whatsapp(conn, contact, msg.get("body") or "",
                                         msg.get("template") or "",
                                         list(msg.get("params") or []), uid)
    provider = res.get("provider") or "stub"
    # notify.py's own vocabulary, kept verbatim: the stub logs, a live provider
    # sends or fails.
    status = "logged" if provider == "stub" else ("sent" if res.get("ok") else "failed")
    return {"provider": provider, "status": status, "error": str(res.get("error") or "")}


def _dispatch_ctx(ticket: dict, card: dict, purpose: str, person_name: str,
                  note: str) -> dict:
    """What an outsider is told, and nothing else.

    Job facts and the owner's answers. Attachment access is limited to the
    explicit manifest frozen on this ticket, exposed through its work link."""
    return {
        "ref": ticketing.ticket_ref(ticket["id"]),
        "service": ticket.get("title") or "Work",
        "place": _card_place(card),
        "extent": _extent_label(card),
        "fee": _quoted_of(ticket),
        "due_date": ticket.get("due_date") or "",
        "person_name": person_name or "",
        "note": note or "",
        "answers": [(p.k, p.v) for p in _answers(ticket.get("kind") or "",
                                                 ticket.get("params") or "{}")],
        "purpose": purpose,
    }


async def _live_dispatches(conn, uid: str, ticket_id: str) -> List[dict]:
    """Everyone this ticket is still out with — not withdrawn, not failed."""
    cur = await conn.execute(
        "SELECT * FROM ticket_dispatches WHERE ticket_id=%s AND owner_user_id=%s"
        " AND revoked_at='' AND status <> 'failed' ORDER BY sort", (ticket_id, uid))
    return list(await cur.fetchall())


async def _dispatch(conn, uid: str, ticket: dict, card: dict, *, contact: str,
                    person_name: str = "", channel: str = "auto",
                    purpose: str = "invite", note: str = "",
                    expires_days: int = 14) -> str:
    """Write to one person on the owner's behalf and keep the copy.

    Each message carries a scoped worker link. Its token hash controls expiry
    and revocation; the owner can copy the recorded message for manual delivery.
    """
    import uuid as _uuid
    contact = (contact or "").strip()
    chan = ticketing.channel_for(contact, channel or "auto")
    if not chan:
        return ""
    # Entropy comes from here and never from ticketing.py, which is pure on
    # purpose. Only the hash and the last four characters are kept.
    token = ticketing.mint_token(secrets.token_bytes(32))
    ctx = _dispatch_ctx(ticket, card, purpose, person_name, note)
    ctx["link"] = (_env("APP_PUBLIC_URL") or "https://pattadar.com").rstrip("/") + "/work/" + token["token"]
    msg = ticketing.render_dispatch(chan, ctx)
    sent = await _send(conn, uid, chan, contact, msg)
    try:
        manifest = json.loads(ticket.get("params") or "{}").get("attachment_manifest") or {}
    except (ValueError, AttributeError):
        manifest = {}
    span = max(1, min(_i(expires_days) or 14, 365))
    cur = await conn.execute(
        "SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM ticket_dispatches WHERE ticket_id=%s",
        (ticket["id"],))
    sort = _i((await cur.fetchone() or {}).get("s")) or 1
    did = f"dx-{_uuid.uuid4().hex[:12]}"
    await conn.execute(
        "INSERT INTO ticket_dispatches (id, owner_user_id, ticket_id, purpose, channel,"
        " contact, person_name, subject, body, shows, token_hash, token_tail, provider,"
        " status, error, expires_on, revoked_at, revoke_reason, sent_at, sort, manifest)"
        " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'','',%s,%s,%s)",
        (did, uid, ticket["id"], purpose, chan, contact, person_name or "",
         msg.get("subject") or "", msg.get("body") or "",
         json.dumps(list(ticketing.DISPATCH_SHOWS)), token["token_hash"],
         token["token_tail"], sent["provider"], sent["status"], sent["error"],
         (date.today() + timedelta(days=span)).strftime("%d/%m/%Y"), _now_iso(), sort, json.dumps(manifest)))
    await _event(
        conn, uid, ticket["id"], kind="dispatch", ref_table="ticket_dispatches",
        ref_id=did,
        headline=(f"Could not send to {person_name or ticketing.mask_contact(contact)}" if sent["status"] == "failed" else ticketing.event_headline("dispatch", "", {
            "channel": chan, "person_name": person_name or ticketing.mask_contact(contact),
            "provider": sent["provider"], "purpose": purpose})),
        detail=sent["error"] or note or msg.get("subject") or "")
    return did


async def _file_deliverable(conn, uid: str, dv: dict, ticket: dict, card: dict) -> dict:
    """Turn one accepted deliverable into the row it was always going to be.

    ticketing.filing_plan decides WHICH row and what goes in it; this only
    executes the plan. That is why the decision can be tested without a
    database, and why the honesty columns — no coordinates, no photographer, no
    verification on a file the owner relayed — cannot drift out of one arm of
    a four-way branch."""
    plan = ticketing.filing_plan(
        dv,
        {"id": ticket["id"], "kind": ticket.get("kind") or "",
         "assignee": ticket.get("assignee") or ""},
        {"id": card["id"], "kind": card.get("kind") or "parcel",
         "boundary": card.get("boundary") or ""})
    if not plan.get("ok"):
        return plan
    table = str(plan.get("table") or "")
    values = dict(plan.get("values") or {})
    if not table or not values:
        return {"ok": False, "why": "that is not something this system knows how to file"}

    if plan.get("op") == "update":
        prev = ""
        col = str(plan.get("prev_column") or "")
        if col:
            cur = await conn.execute(
                f"SELECT {col} AS v FROM {table} WHERE id=%s", (plan.get("key_value"),))
            prev = str((await cur.fetchone() or {}).get("v") or "")
        # Ownership is the UPDATE's own WHERE clause rather than a prior
        # SELECT: a parcel is owned through its passbook, a property directly,
        # and a record belonging to somebody else simply matches no row.
        own = ("passbook_id IN (SELECT id FROM passbooks WHERE owner_user_id=%s)"
               if table == "parcels" else "owner_user_id=%s")
        sets = ", ".join(f"{c}=%s" for c in values)
        cur = await conn.execute(
            f"UPDATE {table} SET {sets} WHERE {plan.get('key') or 'id'}=%s AND {own}",
            (*values.values(), plan.get("key_value"), uid))
        if not cur.rowcount:
            return {"ok": False, "why": "that record is not yours to change"}
        return {**plan, "filed_id": str(plan.get("key_value") or ""), "filed_prev": prev}

    import uuid as _uuid
    over = plan.get("sort_over") or {}
    sort = 1
    if over:
        cur = await conn.execute(
            f"SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM {over['table']}"
            f" WHERE {over['column']}=%s", (over["value"],))
        sort = _i((await cur.fetchone() or {}).get("s")) or 1
    new_id = f"{plan.get('id_prefix') or 'row-'}{_uuid.uuid4().hex[:12]}"
    values.update({"id": new_id, "owner_user_id": uid, "created_at": _now_iso(),
                   "sort": sort})
    cols = list(values)
    await conn.execute(
        f"INSERT INTO {table} ({', '.join(cols)})"
        f" VALUES ({', '.join(['%s'] * len(cols))})",
        tuple(values[c] for c in cols))
    return {**plan, "filed_id": new_id, "filed_prev": ""}


# The role a person earns by having done one of these jobs. Not a claim about
# who they are — a note of what they did here, which is all this account has
# ever seen of them.
_TICKET_ROLE = {
    "survey": "Surveyor", "site_visit": "Caretaker", "visit": "Caretaker",
    "title_opinion": "Advocate", "opinion": "Advocate", "ec": "Agent",
    "mutation": "Agent", "patta_copy": "Agent", "fencing": "Contractor",
}


async def _remember_person(conn, uid: str, ticket: dict, card: dict) -> None:
    """Put whoever did the work onto the record, once.

    The Services list forgets a name the moment a job closes; the record's
    People page is where "who re-walked this boundary" is still answerable next
    year. Nothing is claimed about them beyond the job they did — no badges, no
    verification, no arrangement."""
    name = (ticket.get("assignee") or "").strip()
    if not name:
        return
    cur = await conn.execute(
        "SELECT 1 FROM record_people WHERE owner_user_id=%s AND record_id=%s"
        " AND person_name=%s", (uid, card["id"], name))
    if await cur.fetchone():
        return
    import uuid as _uuid
    cur = await conn.execute(
        "SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM record_people WHERE record_id=%s",
        (card["id"],))
    sort = _i((await cur.fetchone() or {}).get("s")) or 1
    initials = "".join(w[0] for w in name.replace(".", " ").split()[:2] if w).upper()
    await conn.execute(
        "INSERT INTO record_people (id, owner_user_id, record_id, person_name, initials,"
        " role, badges, summary, arrangement, pay_label, pay_value, due_label, due_value,"
        " visibility, actions, compact, sort, created_at)"
        " VALUES (%s,%s,%s,%s,%s,%s,'[]',%s,'','','','','','','[]',true,%s,%s)",
        (f"rp-{_uuid.uuid4().hex[:12]}", uid, card["id"], name, initials,
         _TICKET_ROLE.get(ticket.get("kind") or "", "Did work here"),
         f"{ticket.get('title') or 'Work'} · {ticketing.ticket_ref(ticket['id'])}",
         sort, _now_iso()))


# ── The desk: who is an admin, who is on the roster ───────────────────
#
# Everything in this section is the ops desk. Seven readers below reach rows
# that do not belong to the caller, and they are listed here so that adding an
# eighth is a decision somebody has to make on purpose:
#
#   `_desk_job_rows`   whole work_requests rows, no owner predicate
#   `_desk_ticket_row` one work_requests row by id, no owner predicate
#   `_place_of`        parcels/passbooks/properties, place columns only
#   `_coverage_rows`   parcels/properties, place names and counts only
#   `_open_by_area`    work_requests, (place, kind) counts only
#   `_roster`          associates, joined to a grouped count over work_requests
#   `_open_jobs_of` / `_open_kinds_of`   counts per associate, nothing else
#
# Every one of them is reachable only from a resolver that has already proved
# `_is_admin` and written its `desk_read` audit row, with a single stated
# exception — `_open_jobs_of`, described over its own definition, which the
# owner's own picker needs and which can return nothing but integers.
#
# `_candidates_from` and `_coverage_cells` read no database at all: they run
# the pure rules in associates.py over rows one of the above already fetched.

#: The word for each state an associate can be in, and the tone the <State>
#: component draws it in. 'invited' is somebody the desk has written down and
#: not yet asked for anything — which is every row for the first few weeks.
_ASSOC_WORD = {"invited": "Waiting on us", "active": "Taking work",
               "paused": "Paused", "blocked": "Stopped"}
_ASSOC_STATE = {"invited": "warn", "active": "good",
                "paused": "unknown", "blocked": "bad"}

#: What one discipline row is doing. 'blocked' is written by the credential
#: sweeper in a later phase and never by the associate.
_DISC_WORD = {"on": "Offering", "off": "Not offering", "blocked": "Suspended"}

#: How wide each grain reaches, in the words the enrolment form uses. The
#: phrase is the honest one: an advocate genuinely does not need to be local,
#: and a surveyor genuinely does.
_GRAIN_WORD = {
    "village": "village work",
    "mandal": "mandal work",
    "city": "city work",
    "district": "district work",
    "state": "anywhere in the state",
}

#: Both `kind` vocabularies in one map, for the same reason associates.py
#: carries both: SERVICE_CATALOGUE writes ec/survey/site_visit/title_opinion/
#: mutation/patta_copy and create_request writes survey/opinion/visit/fencing
#: into the same column.
_KIND_LABEL = {k: str(v.get("label") or k) for k, v in SERVICE_CATALOGUE.items()}
_KIND_LABEL.update({"opinion": "Title opinion", "visit": "Site visit",
                    "fencing": "Fencing", "errand": "Errand"})

#: A job counts as neglected after four days with nothing happening on it —
#: the same threshold `TicketView.quiet` already uses, kept in one place so the
#: owner's ticket and the desk can never disagree about whether somebody has
#: gone silent.
_QUIET_DAYS = 4

#: A job nobody has taken is "ageing" after three days. The desk's strip says
#: "3 ageing" and the row grows a tag at the same moment.
_AGEING_DAYS = 3

#: A verified paper inside this many days is worth a warning; past its date it
#: has lapsed.
_CRED_WARN_DAYS = 30


def _initials(name: str) -> str:
    """'G. Srinivas' → 'GS'. The same two letters `_remember_person` writes, so
    an associate's avatar and their row on a record's People page match."""
    return "".join(w[0] for w in (name or "").replace(".", " ").split()[:2] if w).upper()


def _discipline_blurb(d) -> str:
    """'Boundary re-survey · village work' — what the enrolment card says under
    the name of a line of work, built from the discipline's own kinds so a new
    service appearing in SERVICE_CATALOGUE cannot leave the card describing the
    old list."""
    jobs = [_KIND_LABEL.get(k, k.replace("_", " ").capitalize()) for k in d.kinds]
    seen: List[str] = []
    for j in jobs:
        if j not in seen:
            seen.append(j)
    return " · ".join(seen[:2] + [_GRAIN_WORD.get(d.grain, d.grain)])


def _area_label(level: str, name: str) -> str:
    """'Peddapuram village' / 'Kakinada district' / 'All of Telangana'."""
    lvl = (level or "").strip()
    nm = (name or "").strip()
    if lvl == "state":
        return f"All of {nm}" if nm else "The whole state"
    return f"{nm} {lvl}".strip() if nm else lvl


def _admin_env() -> set:
    """The bootstrap allowlist, out of the environment.

    These are API uids — whatever `x-user-id` carries, which is a legacy
    binding locally and a `subject_<64hex>` in a real deployment. They are NOT
    the gateway's ADMIN_SUBJECT_IDS and the two lists can never hold the same
    values."""
    return {p.strip() for p in _env("PLATFORM_ADMIN_UIDS").split(",") if p.strip()}


async def _setting(conn, key: str, default: str = "") -> str:
    """One row of the only runtime-editable configuration there is."""
    cur = await conn.execute("SELECT value FROM platform_settings WHERE key=%s", (key,))
    return str(((await cur.fetchone()) or {}).get("value") or "") or default


async def _is_admin(conn, uid: str) -> bool:
    """May this uid see every owner's jobs?

    Two sources, unioned: the environment allowlist, which is the bootstrap —
    there has to be a way to become the first admin without already being one —
    and `platform_settings 'admin.uids'`, so a second admin does not need a
    deploy, and there is no deployed runtime to deploy to.

    It FAILS CLOSED. With both lists empty nobody is an admin and every desk
    resolver answers empty. That is the opposite of the usual "no configuration
    means no restriction" default and it is deliberate: this one boolean is the
    only thing standing between a signed-in stranger and every landowner's job
    list, place and money. An allowlist nobody has filled in is an allowlist
    nobody has filled in, not permission for everybody.

    Nothing is cached. The settings read is a primary-key lookup on a table
    with a handful of rows, and a cache measured in minutes would keep
    answering yes for somebody whose access was taken away a minute ago —
    which is the one moment the answer has to be right."""
    who = (uid or "").strip()
    if not who or who == "system":
        return False
    if who in _admin_env():
        return True
    stored = await _setting(conn, "admin.uids")
    return who in {p.strip() for p in stored.split(",") if p.strip()}


async def _desk_read(conn, uid: str, scope: str, detail: str = "") -> None:
    """Leave a trace that somebody read across owners.

    A codebase that ships a DPDP export, withholds an associate's number from
    the owner who did not earn it, and scopes every other query in this module
    by `owner_user_id`, cannot then have one role that reads every owner's
    jobs silently. Written before the rows come back, so a query that fails
    halfway does not lose the fact that the read was attempted.

    `main.log_audit` is imported at call time because main.py imports this
    module; a module-level import would close the circle."""
    try:                                  # inside the `src` package
        from . import main as _main
    except ImportError:                   # imported bare off src/
        import main as _main              # type: ignore[no-redef]
    await _main.log_audit(conn, uid, "desk_read", scope, detail)


async def _audit(conn, uid: str, action: str, record_id: str, detail: str = "") -> None:
    """Record one change to a record on the shared audit trail.

    `target` is the record id, so the record's Audit tab can read every event
    filed against it. Best-effort by construction: an audit write must never
    be the reason a legitimate change fails, so a failure here is swallowed —
    the change still stands, and the worst case is one missing history line.
    `main.log_audit` is imported at call time for the same reason `_desk_read`
    does it: main.py imports this module, and a module-level import would close
    the circle."""
    try:
        try:                              # inside the `src` package
            from . import main as _main
        except ImportError:               # imported bare off src/
            import main as _main          # type: ignore[no-redef]
        await _main.log_audit(conn, uid, action, record_id, detail)
    except Exception:                     # noqa: BLE001 — never block the write
        pass


# ── Reading the roster ────────────────────────────────────────────────

async def _open_jobs_of(conn, ids: List[str]) -> dict:
    """{associate_id: (open, done)} — how many jobs each of these people holds.

    This is the one cross-owner read of `work_requests` that is not behind the
    admin gate, and the exception is stated rather than hidden: it returns two
    integers per associate and it is physically incapable of returning a row,
    an owner, a place or a rupee. "Is this person free" is a fact about the
    person, not about anybody's land, and the owner's own picker cannot honestly
    say "takes more work" without it.

    A COUNT, every time, and never a stored counter — see AssociateDiscipline.
    """
    if not ids:
        return {}
    cur = await conn.execute(
        "SELECT assignee_ref,"
        " COUNT(*) FILTER (WHERE closed = false) AS open_jobs,"
        " COUNT(*) FILTER (WHERE closed = true)  AS done_jobs"
        " FROM work_requests WHERE assignee_ref = ANY(%s) GROUP BY assignee_ref",
        (list(ids),))
    return {r["assignee_ref"]: (_i(r.get("open_jobs")), _i(r.get("done_jobs")))
            for r in await cur.fetchall()}


async def _open_kinds_of(conn, ids: List[str]) -> dict:
    """{associate_id: {kind: n}} — what the jobs in their hands actually are.

    Needed so "2 of 4 in hand" can be printed against the right line of work on
    somebody who is both a writer and an agent. Same shape as above: kinds and
    counts, no rows."""
    if not ids:
        return {}
    cur = await conn.execute(
        "SELECT assignee_ref, kind, COUNT(*) AS n FROM work_requests"
        " WHERE assignee_ref = ANY(%s) AND closed = false"
        " GROUP BY assignee_ref, kind", (list(ids),))
    out: dict = {}
    for r in await cur.fetchall():
        out.setdefault(r["assignee_ref"], {})[r.get("kind") or ""] = _i(r.get("n"))
    return out


def _credential_state(rows: List[dict], discipline: str, today: str) -> str:
    """What this person can prove for this line of work, in one word.

    'lapsed' only ever comes off a paper somebody VERIFIED and that then ran
    out. A paper nobody added is '' and blocks nothing — requiring a licence
    PDF before anybody can be dispatched empties the roster for the whole of
    the cold-start period, which is the period that decides whether there is a
    marketplace at all."""
    best = ""
    for c in rows:
        if (c.get("discipline") or "") != discipline:
            continue
        review = c.get("review") or "pending"
        if review != "verified":
            best = best or "pending"
            continue
        expires = (c.get("expires_on") or "").strip()
        if expires and expires < today:
            return "lapsed"
        if expires and ticketing.days_between(today, expires) <= _CRED_WARN_DAYS:
            best = "expiring"
        elif best != "expiring":
            best = "verified"
    return best


async def _roster(conn, *, ids: Optional[List[str]] = None, q: str = "",
                  discipline: str = "", area: str = "", state: str = "",
                  limit: int = 200) -> List[dict]:
    """The people on the roster, with their live job counts joined in.

    `open_jobs` and `done_jobs` come out of a LEFT JOIN over a grouped COUNT in
    this one statement, not out of a query per row and never out of a stored
    counter. `associates.dispatchable()` needs the live figure to answer at
    all, so fetching it per row would put the roster's cost on the number of
    people — which is exactly the number this feature exists to grow.

    Four more statements fill in the disciplines, the areas, the papers and
    what is in each person's hands. Five statements whatever the roster's size,
    rather than 5N.

    `limit` is capped at 500 and the order is by name, so a roster past that
    would drop its tail rather than page. That is a real ceiling and it is
    named here rather than discovered: the desk reads the whole roster into
    memory to answer "who covers this", and the day 500 people are enrolled
    that read stops being the right shape and needs the candidate SQL
    associates.py's area_slots() was written for."""
    sql = ["SELECT a.*, COALESCE(j.open_jobs, 0) AS open_jobs,"
           " COALESCE(j.done_jobs, 0) AS done_jobs FROM associates a"
           " LEFT JOIN (SELECT assignee_ref,"
           "   COUNT(*) FILTER (WHERE closed = false) AS open_jobs,"
           "   COUNT(*) FILTER (WHERE closed = true)  AS done_jobs"
           "   FROM work_requests WHERE assignee_ref <> ''"
           "   GROUP BY assignee_ref) j ON j.assignee_ref = a.id"
           " WHERE true"]
    args: list = []
    if ids is not None:
        if not ids:
            return []
        sql.append(" AND a.id = ANY(%s)")
        args.append(list(ids))
    if (state or "").strip():
        sql.append(" AND a.state = %s")
        args.append(state.strip())
    if (discipline or "").strip():
        sql.append(" AND EXISTS (SELECT 1 FROM associate_disciplines d"
                   " WHERE d.associate_id = a.id AND d.discipline = %s)")
        args.append(discipline.strip())
    if (area or "").strip():
        # Folded, because the filter comes off a chip that says "Peddapuram"
        # and the column holds what somebody typed months ago.
        sql.append(" AND EXISTS (SELECT 1 FROM associate_areas ar"
                   " WHERE ar.associate_id = a.id AND ar.name_key = %s)")
        args.append(associates.fold(area))
    if (q or "").strip():
        like = f"%{q.strip()}%"
        sql.append(" AND (a.name ILIKE %s OR a.firm ILIKE %s OR a.contact ILIKE %s"
                   " OR EXISTS (SELECT 1 FROM associate_areas ar"
                   " WHERE ar.associate_id = a.id AND ar.name ILIKE %s))")
        args += [like, like, like, like]
    sql.append(" ORDER BY a.name, a.id LIMIT %s")
    args.append(max(1, min(_i(limit) or 200, 500)))
    cur = await conn.execute("".join(sql), tuple(args))
    rows = [dict(r) for r in await cur.fetchall()]
    if not rows:
        return []
    keys = [r["id"] for r in rows]
    by_id = {r["id"]: r for r in rows}
    for r in rows:
        r["disciplines"], r["areas"], r["credentials"] = [], [], []
    cur = await conn.execute(
        "SELECT * FROM associate_disciplines WHERE associate_id = ANY(%s)"
        " ORDER BY discipline", (keys,))
    for d in await cur.fetchall():
        by_id[d["associate_id"]]["disciplines"].append(dict(d))
    cur = await conn.execute(
        "SELECT * FROM associate_areas WHERE associate_id = ANY(%s)", (keys,))
    for a in await cur.fetchall():
        by_id[a["associate_id"]]["areas"].append(dict(a))
    cur = await conn.execute(
        "SELECT * FROM associate_credentials WHERE associate_id = ANY(%s)"
        " ORDER BY expires_on", (keys,))
    for c in await cur.fetchall():
        by_id[c["associate_id"]]["credentials"].append(dict(c))
    kinds = await _open_kinds_of(conn, keys)
    for r in rows:
        # The narrowest area first, so a row reads "Peddapuram village ·
        # Kakinada district" and never the other way round.
        r["areas"].sort(key=lambda a: (associates.AREA_RANK.get(a.get("level") or "", 9),
                                       a.get("name") or ""))
        r["open_kinds"] = kinds.get(r["id"], {})
    return rows


def _attribute_open(row: dict) -> dict:
    """{discipline: n} — which of this person's lines of work each job in hand
    belongs to.

    A job of kind 'ec' is coverable by both a writer and an agent, so counting
    it under both would tell somebody who holds one job that they hold two. It
    is attributed to the first discipline they actually hold that covers that
    kind, which is the order `associates.disciplines_for` already ranks by."""
    held = [d.get("discipline") or "" for d in row.get("disciplines") or []]
    out = {k: 0 for k in held}
    for kind, n in (row.get("open_kinds") or {}).items():
        for d in associates.disciplines_for(kind):
            if d.key in out:
                out[d.key] += n
                break
    return out


def _dispatch_view(row: dict) -> tuple:
    """(dispatchable, why_not) for the whole person, over every line of work.

    Somebody is dispatchable if any one of their disciplines can take a job
    right now. When none can, every distinct reason is returned: "Paused" on
    its own, or "Already holds 3 · Survey licence suspended" for somebody who
    is two things and stopped for two reasons."""
    open_jobs = _i(row.get("open_jobs"))
    per = _attribute_open(row)
    why: List[str] = []
    for d in row.get("disciplines") or []:
        key = d.get("discipline") or ""
        ok, reason = associates.dispatchable(
            {**row, "discipline_state": d.get("state") or "on",
             "discipline_reason": d.get("state_reason") or "",
             "capacity": _i(d.get("capacity")) or 3},
            key, per.get(key, open_jobs))
        if ok:
            return True, []
        if reason and reason not in why:
            why.append(reason)
    if not (row.get("disciplines") or []):
        return False, ["No kind of work chosen yet"]
    return False, why


def _assoc_areas(row: dict) -> List[AssociateArea]:
    return [AssociateArea(
        id=a.get("id") or "", level=a.get("level") or "", name=a.get("name") or "",
        label=_area_label(a.get("level") or "", a.get("name") or ""))
        for a in row.get("areas") or []]


def _assoc_credentials(row: dict, today: str) -> List[AssociateCredential]:
    out: List[AssociateCredential] = []
    for c in row.get("credentials") or []:
        expires = (c.get("expires_on") or "").strip()
        left = ticketing.days_between(today, expires) if expires else 0
        verified = (c.get("review") or "") == "verified"
        out.append(AssociateCredential(
            id=c.get("id") or "", discipline=c.get("discipline") or "",
            kind=c.get("kind") or "", number_masked=c.get("number_masked") or "",
            authority=c.get("authority") or "", expires_on=_ddmmyyyy(expires),
            days_left=left,
            expiring=bool(verified and expires and 0 <= left <= _CRED_WARN_DAYS),
            lapsed=bool(verified and expires and expires < today),
            review=c.get("review") or "pending", review_note=c.get("review_note") or "",
            file_ref=c.get("file_ref") or "", file_name=c.get("file_name") or ""))
    return out


def _associate_of(row: dict, today: str) -> Associate:
    """One roster row as the desk reads it.

    `contact` is the real number and `contact_masked` is beside it. This type
    is returned by two resolvers and both of them prove `_is_admin` first: the
    desk's entire job in phase 1 is to pick up the phone, nothing is sent to
    anybody until offers ship in phase 2, and a roster of masked numbers
    defeats the only reason to open the screen.

    A masked string returned in a field CALLED `contact` would be worse than
    either — a number that does not dial, in the one field a client will hand
    to a tel: link. So the two are separate fields and the client chooses.

    Every owner-facing shape is the other way round: AssociateCard has no
    contact field at all, and AssignedPerson fills one only when the four
    conditions over its own definition hold."""
    per = _attribute_open(row)
    state = row.get("state") or "invited"
    ok, why = _dispatch_view(row)
    contact = row.get("contact") or ""
    return Associate(
        id=row["id"], name=row.get("name") or "", firm=row.get("firm") or "",
        initials=_initials(row.get("name") or ""),
        contact=contact, contact_masked=associates.mask_contact(contact),
        contact_visible=bool(row.get("contact_visible")),
        alt_contact=row.get("alt_contact") or "",
        channel=row.get("channel") or "auto",
        state=state, state_word=_ASSOC_WORD.get(state, state),
        state_state=_ASSOC_STATE.get(state, "unknown"),
        state_reason=row.get("state_reason") or "",
        disciplines=[AssociateDiscipline(
            key=d.get("discipline") or "",
            label=associates.label_of(d.get("discipline") or ""),
            state=d.get("state") or "on",
            state_word=_DISC_WORD.get(d.get("state") or "on", d.get("state") or ""),
            capacity=_i(d.get("capacity")) or 3,
            open_count=per.get(d.get("discipline") or "", 0),
            credential_state=_credential_state(
                row.get("credentials") or [], d.get("discipline") or "", today))
            for d in row.get("disciplines") or []],
        areas=_assoc_areas(row), credentials=_assoc_credentials(row, today),
        claimed=bool((row.get("recipient_user_id") or "").strip()),
        dispatchable=ok, why_not=why,
        jobs_open=_i(row.get("open_jobs")), jobs_done=_i(row.get("done_jobs")),
        # Phase 1 sends no offers, so these are zero by construction rather
        # than by a query over columns nothing writes yet. The accept rate a
        # screen hides below five offers is the same number either way.
        offers_sent=0, offers_taken=0, offers_declined=0, accept_rate=0.0,
        last_offered_at=row.get("last_offered_at") or "",
        note=row.get("note") or "", created_at=row.get("created_at") or "")


# ── Reading jobs across owners ────────────────────────────────────────

async def _place_of(conn, rows: List[dict]) -> dict:
    """{ticket_id: (area_key, area_label)} — where each of these jobs is.

    `order_service` and `create_request` stamp both columns at order time, so
    the normal path is a straight read off the row. Every legacy, seeded and
    reseeded ticket carries '', and this repairs those on read from the
    record's own place columns — two statements for the whole page, never one
    per job, and never `_cards(conn, owner)` for somebody else's records.

    The repair is not written back. Stamping is the producer's job and a read
    resolver holds no lock; the desk only needs the heading to say Peddapuram.
    """
    out = {r["id"]: ((r.get("area_key") or ""), (r.get("area_label") or ""))
           for r in rows}
    stale = [r for r in rows if not (r.get("area_key") or "").strip()]
    if not stale:
        return out
    want = [r.get("entity_id") or "" for r in stale if (r.get("entity_id") or "")]
    if not want:
        return out
    places: dict = {}
    cur = await conn.execute(
        "SELECT p.id, pb.village, pb.mandal, pb.district FROM parcels p"
        " JOIN passbooks pb ON pb.id = p.passbook_id WHERE p.id = ANY(%s)", (want,))
    for r in await cur.fetchall():
        places[r["id"]] = {"kind": "parcel", "village": r.get("village") or "",
                           "mandal": r.get("mandal") or "",
                           "district": r.get("district") or ""}
    cur = await conn.execute(
        "SELECT id, locality, city, district FROM properties WHERE id = ANY(%s)", (want,))
    for r in await cur.fetchall():
        # The same mapping `_cards` makes: a property has no mandal, and its
        # city stands in that slot. `area_key_of`'s leading flag is what stops
        # a mandal matching a locality of the same name.
        places[r["id"]] = {"kind": "property", "village": r.get("locality") or "",
                           "mandal": r.get("city") or "",
                           "district": r.get("district") or ""}
    for r in stale:
        card = places.get(r.get("entity_id") or "")
        if card:
            out[r["id"]] = associates.area_key_of(card)
    return out


async def _held_of(conn, ids: List[str]) -> dict:
    """{ticket_id: what is still set aside on it}. One grouped query for the
    whole page, the same shape `orders` already uses."""
    if not ids:
        return {}
    cur = await conn.execute(
        "SELECT ticket_id,"
        " COALESCE(SUM(CASE WHEN to_bucket='held' THEN amount ELSE 0 END),0)"
        " - COALESCE(SUM(CASE WHEN from_bucket='held' THEN amount ELSE 0 END),0)"
        " AS held FROM service_payments WHERE ticket_id = ANY(%s)"
        " AND status <> 'failed' GROUP BY ticket_id", (list(ids),))
    return {r["ticket_id"]: max(0.0, _f(r.get("held"))) for r in await cur.fetchall()}


async def _desk_job_rows(conn, *, silent: bool, limit: int = 200) -> List[dict]:
    """The jobs the desk is answerable for, across every owner.

    Two shapes and one statement each. "Nobody on it" is `placed` or `sent` —
    the two statuses that mean nobody has taken it — and "nothing happening" is
    a job somebody DID take whose last movement was four days ago or more.
    The quiet cut is made in SQL on an ISO string compare, which is
    chronological for this format and needs no to_date() to go wrong inside."""
    if silent:
        cut = (datetime.now() - timedelta(days=_QUIET_DAYS)).isoformat(timespec="seconds")
        cur = await conn.execute(
            "SELECT * FROM work_requests WHERE closed = false"
            " AND status IN ('assigned','on_site','changes')"
            " AND COALESCE(NULLIF(status_at,''), created_at) < %s"
            " ORDER BY COALESCE(NULLIF(status_at,''), created_at) LIMIT %s",
            (cut, max(1, min(_i(limit) or 200, 500))))
    else:
        cur = await conn.execute(
            "SELECT * FROM work_requests WHERE closed = false"
            " AND status IN ('placed','sent') ORDER BY created_at LIMIT %s",
            (max(1, min(_i(limit) or 200, 500)),))
    return [dict(r) for r in await cur.fetchall()]


def _desk_job_of(row: dict, *, place: tuple, held: float, assignee: Optional[dict],
                 candidates: int, today: str) -> DeskJob:
    tid = row["id"]
    status = _status_of(row)
    ordered = (row.get("created_at") or "")[:10]
    due = row.get("due_date") or ""
    quiet_days = ticketing.days_between(
        (row.get("status_at") or row.get("created_at") or "")[:10], today)
    waiting = status in ("placed", "sent")
    return DeskJob(
        ticket_id=tid, ref=ticketing.ticket_ref(tid), kind=row.get("kind") or "",
        service_label=row.get("title") or _KIND_LABEL.get(row.get("kind") or "", "Work"),
        place=place[1], status=status, status_label=ticketing.label_of(status),
        status_state=ticketing.state_of(status),
        assignee=row.get("assignee") or "", assignee_ref=row.get("assignee_ref") or "",
        assignee_contact=(assignee or {}).get("contact") or "",
        ordered_at=_ddmmyyyy(ordered),
        age_days=ticketing.days_between(ordered, today), due_date=due,
        overdue=bool(due and ticketing.days_between(due, today) > 0),
        quiet=quiet_days >= _QUIET_DAYS and not waiting, quiet_days=quiet_days,
        quoted=_quoted_of(row), held=held,
        dispatch_state=row.get("dispatch_state") or "",
        dispatch_round=_i(row.get("dispatch_round")),
        # Phase 1 makes no offers and runs no timer. These four are the shape
        # the client renders in both phases and the honest answer in this one.
        next_round_at="", offers_out=0, offers_declined=0, last_response="",
        candidate_count=candidates, stuck=bool(waiting and not candidates))


def _candidates_from(roster: List[dict], kind: str, area_key: str,
                     today: str) -> List[dict]:
    """Who could take this job, ranked, with the reasons — in Python.

    The candidate rule is `associates.covers()` and `associates.dispatchable()`,
    both pure and both already tested without a database. Running them over a
    roster that has been read once is what lets the desk count candidates for
    twenty jobs on one page without twenty queries, and what lets it print WHY
    somebody is not on the list instead of a shorter list.

    An ineligible person is returned carrying their reason. A kind no
    discipline covers ('other', the legacy 'errand') yields nobody, and the
    screen says so — that job is desk-assign-only, which is a fact about the
    taxonomy and not a fault."""
    wanted = associates.disciplines_for(kind)
    out: List[dict] = []
    for row in roster:
        held = {d.get("discipline") or "": d for d in row.get("disciplines") or []}
        per = _attribute_open(row)
        for d in wanted:
            drow = held.get(d.key)
            if not drow:
                continue
            areas = row.get("areas") or []
            covered = associates.covers(area_key, areas, d.grain)
            match = _best_area(areas, area_key, d.grain)
            ok, why_not = associates.dispatchable(
                {**row, "discipline_state": drow.get("state") or "on",
                 "discipline_reason": drow.get("state_reason") or "",
                 "capacity": _i(drow.get("capacity")) or 3},
                d.key, per.get(d.key, _i(row.get("open_jobs"))))
            if not covered:
                ok, why_not = False, why_not or "Does not work in this area"
            out.append({
                "id": row["id"], "name": row.get("name") or "",
                "contact": row.get("contact") or "",
                "discipline": d.key, "area_label": match if covered else "",
                "area_match": match, "capacity": _i(drow.get("capacity")) or 3,
                "open_jobs": per.get(d.key, _i(row.get("open_jobs"))),
                "last_offered_at": row.get("last_offered_at") or "",
                "eligible": ok, "why_not": [why_not] if why_not else []})
            break                      # best-fit discipline only, never two rows
    return associates.rank(out, today)


def _best_area(areas: List[dict], area_key: str, grain: str) -> str:
    """The narrowest enrolled area that actually reaches this job — what the
    candidate row prints as "Covers Peddapuram village"."""
    for a in sorted(areas, key=lambda a: associates.AREA_RANK.get(a.get("level") or "", 9)):
        if associates.covers(area_key, [a], grain):
            return _area_label(a.get("level") or "", a.get("name") or "")
    return ""


async def _assignees_of(conn, rows: List[dict]) -> dict:
    """{associate_id: row} for everybody named on this page of jobs. One
    statement, so a desk of twenty jobs is not twenty lookups."""
    ids = sorted({(r.get("assignee_ref") or "").strip() for r in rows
                  if (r.get("assignee_ref") or "").strip()})
    if not ids:
        return {}
    cur = await conn.execute("SELECT * FROM associates WHERE id = ANY(%s)", (ids,))
    return {r["id"]: dict(r) for r in await cur.fetchall()}


async def _associate_row(conn, aid: str) -> dict:
    cur = await conn.execute("SELECT * FROM associates WHERE id=%s", ((aid or "").strip(),))
    return dict(await cur.fetchone() or {})


async def _assoc_event(conn, aid: str, *, kind: str, headline: str, detail: str = "",
                       actor: str = "", actor_kind: str = "desk",
                       actor_label: str = "Pattadar desk", ref_table: str = "",
                       ref_id: str = "") -> str:
    """Append one line to somebody's trail. Nothing here is ever updated; a
    correction is another row. This is what gets read out when an associate
    asks why the work stopped."""
    import uuid as _uuid
    eid = f"ae-{_uuid.uuid4().hex[:12]}"
    await conn.execute(
        "INSERT INTO associate_events (id, associate_id, kind, headline, detail,"
        " actor, actor_kind, actor_label, ref_table, ref_id, at)"
        " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (eid, aid, kind, headline, detail, actor, actor_kind, actor_label,
         ref_table, ref_id, _now_iso()))
    return eid


async def _desk_ticket_row(conn, ticket_id: str, *, lock: bool = False) -> dict:
    """One ticket, by id, WITHOUT an owner predicate — the desk's read.

    Every other ticket read in this module goes through `_ticket_row`, which is
    scoped by owner so no id off the wire reaches somebody else's job. This one
    is the deliberate exception and it is why every caller of it proves
    `_is_admin` first. The owner is on the row it returns, and the writes that
    follow are scoped to THAT owner rather than to the admin doing the work —
    otherwise `_move`'s own UPDATE would match nothing and refuse silently."""
    cur = await conn.execute(
        "SELECT * FROM work_requests WHERE id=%s" + (" FOR UPDATE" if lock else ""),
        ((ticket_id or "").strip(),))
    return dict(await cur.fetchone() or {})


def _desk_actor(status: str, action: str) -> str:
    """Which actor_kind the desk may move a ticket as.

    `ticketing.TRANSITIONS` carries `"system"` on the pairs a desk or a
    dispatcher is meant to move — placed→assigned, assigned→placed,
    on_site→placed and the dispatch and cancel pairs — so those moves are
    recorded as what they are rather than as something the owner did.

    Three pairs deliberately do NOT carry it. `("sent","assign")` belongs to
    the worker accepting an offer, and `("assigned","assign")` and
    `("changes", …)` are the owner's own corrections. The desk still has to be
    able to put somebody on a job that is out with three people, so the kind
    asked for degrades to `owner` on those rather than refusing outright —
    `actor_label` stays "Pattadar desk" either way, so the trail never claims
    the owner did it, and the ticket never silently fails to move because the
    operator pressed the button one status too late."""
    if ticketing.transition(status, action, "system").get("ok"):
        return "system"
    return "owner"


# ── Where the work is, and who covers it ──────────────────────────────

async def _coverage_rows(conn, level: str) -> List[dict]:
    """Every place Pattadar holds land, at one administrative grain.

    Aggregate-only and cross-owner: place names and counts, no record ids, no
    owners. `properties` has no mandal column, so its locality/city/district
    stand in the village/mandal/district slots exactly as `_cards` maps them —
    and the flag is carried through so a mandal named Peddapuram is never
    matched by somebody enrolled for a Peddapuram locality of a city."""
    lvl = (level or "mandal").strip()
    if lvl not in ("village", "mandal", "district"):
        lvl = "mandal"
    col = {"village": ("village", "locality"), "mandal": ("mandal", "city"),
           "district": ("district", "district")}[lvl]
    cells: dict = {}

    def add(flag: str, name: str, mandal: str, district: str, n: int) -> None:
        if not (name or "").strip():
            return
        key = associates.fold(name)
        cell = cells.setdefault(key, {"key": key, "name": name.strip(), "records": 0,
                                      "keys": set(), "level": lvl})
        cell["records"] += n
        # The area_key this cell is tested against, built at the grain asked
        # for so a district-level associate still covers a mandal cell.
        slots = {"village": "", "mandal": "", "district": associates.fold(district)}
        if lvl == "village":
            slots["village"], slots["mandal"] = key, associates.fold(mandal)
        elif lvl == "mandal":
            slots["mandal"] = key
        else:
            slots["district"] = key
        cell["keys"].add(
            f"{flag}|{slots['village']}|{slots['mandal']}|{slots['district']}")

    cur = await conn.execute(
        f"SELECT pb.{col[0]} AS name, pb.mandal AS mandal, pb.district AS district,"
        " COUNT(*) AS n FROM parcels p JOIN passbooks pb ON pb.id = p.passbook_id"
        f" WHERE p.archived = false AND pb.{col[0]} <> ''"
        f" GROUP BY pb.{col[0]}, pb.mandal, pb.district")
    for r in await cur.fetchall():
        add("p", r.get("name") or "", r.get("mandal") or "", r.get("district") or "",
            _i(r.get("n")))
    cur = await conn.execute(
        f"SELECT {col[1]} AS name, city AS mandal, district AS district, COUNT(*) AS n"
        f" FROM properties WHERE archived = false AND {col[1]} <> ''"
        f" GROUP BY {col[1]}, city, district")
    for r in await cur.fetchall():
        add("u", r.get("name") or "", r.get("mandal") or "", r.get("district") or "",
            _i(r.get("n")))
    return sorted(cells.values(), key=lambda c: (-c["records"], c["name"]))


async def _open_by_area(conn) -> dict:
    """{(area_key, kind): n} — the live jobs, by place and by what they need.

    Read off `work_requests.area_key`, which is stamped at order time precisely
    so this question can be asked without reading anybody's parcels."""
    cur = await conn.execute(
        "SELECT area_key, kind, COUNT(*) AS n FROM work_requests"
        " WHERE closed = false AND area_key <> '' GROUP BY area_key, kind")
    return {((r.get("area_key") or ""), (r.get("kind") or "")): _i(r.get("n"))
            for r in await cur.fetchall()}


def _coverage_cells(places: List[dict], roster: List[dict], open_by_area: dict,
                    level: str) -> List[dict]:
    """One cell per place per line of work — the whole grid, in memory.

    `active_count` asks `associates.covers()` per cell, which is the same rule
    the candidate SQL makes and is pure, so the grid and the shortlist can
    never disagree about who reaches Peddapuram. `open_jobs` is attributed to
    EVERY discipline that could take that kind, because "three jobs here need a
    document writer or a revenue agent" is true of both columns and a grid that
    picked one would understate the other.

    A zero with jobs behind it is a gap — a service Pattadar is selling in a
    place with nobody to do it. A zero with no jobs behind it is just a fact."""
    idx = {"village": 1, "mandal": 2, "district": 3}.get(level, 2)
    offerable = [r for r in roster if (r.get("state") or "") in associates.OFFERABLE]
    out: List[dict] = []
    for cell in places:
        needed: dict = {}
        for (area_key, kind), n in open_by_area.items():
            parts = (area_key or "").split("|")
            if len(parts) != 4 or parts[idx] != cell["key"]:
                continue
            for d in associates.disciplines_for(kind):
                needed[d.key] = needed.get(d.key, 0) + n
        for key, d in associates.DISCIPLINES.items():
            active = 0
            for r in offerable:
                drow = next((x for x in r.get("disciplines") or []
                             if (x.get("discipline") or "") == key), None)
                if not drow or (drow.get("state") or "on") != "on":
                    continue
                if any(associates.covers(k, r.get("areas") or [], d.grain)
                       for k in cell["keys"]):
                    active += 1
            jobs = needed.get(key, 0)
            out.append({
                "level": cell["level"], "name": cell["name"], "discipline": key,
                "discipline_label": d.label, "active_count": active,
                "open_jobs": jobs, "records": cell["records"],
                "risk": ("gap" if (not active and jobs) else
                         "empty" if not active else "ok")})
    return out


#: What the engine is doing, in words. Phase 1 has no engine at all, so 'off'
#: is the truth and the sentence says so rather than implying a switch that
#: has been thrown.
_MODE_WORD = {"off": "Off — the desk sends everything by hand",
              "shadow": "Proposing only — nothing is sent",
              "live": "Sending offers"}

#: Which statuses let the OWNER see the number of whoever is on their job.
#: `accepted` is in deliberately: the moment an owner is most likely to phone
#: somebody is right after the work has come back.
_CONTACT_STATUSES = frozenset(
    ("assigned", "on_site", "submitted", "changes", "accepted"))


def _parse_areas(entries: List[str]) -> List[tuple]:
    """['village:Peddapuram', 'district:Kakinada'] → the rows to write.

    An entry with no level is read as a district: it is the widest thing
    somebody typing a bare place name is likely to mean, and it is the reading
    that cannot accidentally NARROW what they cover. An unknown level is
    dropped rather than written — a row at level 'mndal' matches nothing ever,
    while looking perfectly enrolled on every screen."""
    out: List[tuple] = []
    seen = set()
    for raw in entries or []:
        text = (raw or "").strip()
        if not text:
            continue
        level, _, name = text.partition(":")
        if not name:
            level, name = "district", level
        level, name = level.strip().lower(), name.strip()
        if level not in associates.AREA_LEVELS:
            continue
        key = associates.fold(name)
        if level != "state" and not key:
            continue
        if (level, key) in seen:
            continue
        seen.add((level, key))
        out.append((level, name, key))
    return out


async def _put_on_job(conn, owner: str, row: dict, assoc: dict, *, actor: str,
                      actor_kind: str, actor_label: str, note: str = "") -> bool:
    """Put one associate on one job, or refuse. The whole of it, in one place.

    The name and the id are written BEFORE the move. `ticketing.event_headline`
    composes "{actor} put {assignee} on it" at write time out of the ticket's
    own assignee and can never be re-worded afterwards, so moving first writes
    "Pattadar desk put somebody on it" into an append-only trail, permanently.

    The move is checked for legality before anything is written, and the prior
    identity is put back if `_move`'s own compare-and-set still loses.
    Otherwise a refused move would leave a new name and a new phone number
    committed onto a job that never moved."""
    status = _status_of(row)
    if not ticketing.transition(status, "assign", actor_kind).get("ok"):
        return False
    was_name, was_ref = row.get("assignee") or "", row.get("assignee_ref") or ""
    name = (assoc.get("name") or "").strip() or "Worker"
    await conn.execute(
        "UPDATE work_requests SET assignee=%s, assignee_ref=%s"
        " WHERE id=%s AND owner_user_id=%s", (name, assoc["id"], row["id"], owner))
    row["assignee"], row["assignee_ref"] = name, assoc["id"]
    if not await _move(conn, owner, row, "assign", actor=actor, actor_kind=actor_kind,
                       actor_label=actor_label, note=note):
        await conn.execute(
            "UPDATE work_requests SET assignee=%s, assignee_ref=%s"
            " WHERE id=%s AND owner_user_id=%s", (was_name, was_ref, row["id"], owner))
        row["assignee"], row["assignee_ref"] = was_name, was_ref
        return False
    await _assoc_event(
        conn, assoc["id"], kind="assigned",
        headline=f"Put on {ticketing.ticket_ref(row['id'])} — {row.get('title') or 'work'}",
        detail=note or row.get("area_label") or "", actor=actor,
        actor_kind=actor_kind, actor_label=actor_label,
        ref_table="work_requests", ref_id=row["id"])
    return True


async def _take_off_job(conn, owner: str, row: dict, *, reason: str, actor: str,
                        actor_kind: str, actor_label: str) -> bool:
    """Take whoever is on this job off it, and put the job back on the queue.

    The identity is cleared AFTER the move, so the trail line can still say who
    came off — the same order, and the same reason, as `assign_request`.

    Nothing here touches money. The job goes back to 'placed' with whatever
    was set aside still set aside against it, and no ledger row is written in
    either direction — releasing or returning money is `cancel_ticket`'s
    decision and a human's, never a side effect of taking somebody off."""
    status = _status_of(row)
    if not ticketing.transition(status, "unassign", actor_kind).get("ok"):
        return False
    aid = (row.get("assignee_ref") or "").strip()
    if not await _move(conn, owner, row, "unassign", actor=actor,
                       actor_kind=actor_kind, actor_label=actor_label, note=reason):
        return False
    await conn.execute(
        "UPDATE work_requests SET assignee='', assignee_ref=''"
        " WHERE id=%s AND owner_user_id=%s", (row["id"], owner))
    row["assignee"], row["assignee_ref"] = "", ""
    if aid:
        await _assoc_event(
            conn, aid, kind="unassigned",
            headline=f"Taken off {ticketing.ticket_ref(row['id'])}", detail=reason,
            actor=actor, actor_kind=actor_kind, actor_label=actor_label,
            ref_table="work_requests", ref_id=row["id"])
    return True


async def _assigned_person(conn, uid: str, row: dict) -> Optional[AssignedPerson]:
    """Who is on this ticket, for the ticket's own owner.

    The unmasked number is granted on four conditions all holding: the caller
    owns the ticket (this is only ever called from the owner-scoped `ticket`
    resolver), the job is live or freshly accepted, `assignee_ref` points at a
    real associate, and that associate agreed at enrolment that an owner may
    see their number while they are on that owner's job.

    When any of them fails the number is empty, the masked form is beside it
    and `contact_why` is the sentence the screen prints instead. There is no
    disabled button and no title attribute anywhere on this path: the client
    has a reason it can put on the page and a control that still works."""
    aid = (row.get("assignee_ref") or "").strip()
    if not aid:
        return None
    assoc = await _associate_row(conn, aid)
    if not assoc:
        return None
    status = _status_of(row)
    contact = assoc.get("contact") or ""
    visible = bool(assoc.get("contact_visible"))
    live = status in _CONTACT_STATUSES
    why = ""
    if not visible:
        why = ("They asked that their number not be shared. "
               "Send them a message instead and Pattadar does the writing.")
    elif not live:
        why = "This job is closed, so their number is no longer shown."
    # Which line of work this job actually is, so the card can say "Licensed
    # surveyor" rather than repeating the service name back at the owner. The
    # best fit for the kind first; failing that, whatever they do at all,
    # because somebody the desk put on a job outside their discipline still
    # has to be described as something.
    cur = await conn.execute(
        "SELECT discipline FROM associate_disciplines WHERE associate_id=%s", (aid,))
    held = {r["discipline"] for r in await cur.fetchall()}
    discipline = next((d.key for d in associates.disciplines_for(row.get("kind") or "")
                       if d.key in held), next(iter(sorted(held)), ""))
    # How they got on it, off the trail rather than off a column: the last
    # 'assign' event already records who moved it and under what label.
    cur = await conn.execute(
        "SELECT actor_kind, actor_label, at FROM ticket_events WHERE ticket_id=%s"
        " AND action='assign' AND kind='status' ORDER BY at DESC, id DESC LIMIT 1",
        (row["id"],))
    ev = await cur.fetchone() or {}
    label = (ev.get("actor_label") or "").strip()
    kind = (ev.get("actor_kind") or "").strip()
    via = ("the desk" if (kind == "system" or label == "Pattadar desk")
           else "they took it" if kind == "worker" else "you")
    open_jobs = (await _open_jobs_of(conn, [aid])).get(aid, (0, 0))[0]
    return AssignedPerson(
        associate_id=aid, name=assoc.get("name") or "", firm=assoc.get("firm") or "",
        initials=_initials(assoc.get("name") or ""), discipline=discipline,
        discipline_label=associates.label_of(discipline) if discipline else "",
        contact=contact if (visible and live) else "",
        contact_masked=associates.mask_contact(contact),
        contact_shown=bool(visible and live and contact), contact_why=why,
        jobs_open=open_jobs,
        assigned_at=_ddmmyyyy((ev.get("at") or row.get("status_at") or "")[:10]),
        via=via)


@strawberry.type
class WebQuery:

    @strawberry.field
    async def portfolio(self, info: strawberry.Info) -> Portfolio:
        uid = _uid(info)
        async with _pool.connection() as conn:
            rows = _active(await _cards(conn, uid))
            tags = await _tags_for(conn, uid, "record")

            farm = [r for r in rows if r["kind"] == "parcel"]
            plots = [r for r in rows if r["kind"] == "property" and r["extent_unit"] == "sq.yd"]
            built = [r for r in rows if r["kind"] == "property" and r["extent_unit"] == "sq.ft"]

            farm_extent = sum(r["extent"] for r in farm)
            plot_extent = sum(r["extent"] for r in plots)
            built_extent = sum(r["extent"] for r in built)
            invested = sum(r["purchase_price"] for r in rows)
            worth = sum(r["market_value"] for r in rows)
            loans = sum(r["loan_amount"] for r in rows)

            # "Where the value sits" — grouped by village, never stored.
            by_village: dict = {}
            for r in rows:
                key = r["village"] or r["district"] or "Unplaced"
                by_village[key] = by_village.get(key, 0.0) + r["market_value"]
            ranked = sorted(by_village.items(), key=lambda kv: -kv[1])[:6]
            top = ranked[0][1] if ranked else 1.0
            bars = [ValueBar(label=k, value=v, share=(v / top) if top else 0) for k, v in ranked]

            # An archived record must stop asking for things. Its deadlines
            # and its running costs left the tiles but stayed in "Waiting on
            # you" and in the year's cost, so a record you had put away kept
            # generating work on the Dashboard.
            live = [r["id"] for r in rows]

            # icon='map' items are map insights ("these two share a boundary"),
            # which belong on W06 and not in the deadline list — they have no
            # deadline and no office waiting on you.
            cur = await conn.execute(
                "SELECT * FROM waiting_items WHERE owner_user_id=%s AND done=false "
                "AND icon <> 'map' AND (record_id = '' OR record_id = ANY(%s)) "
                "ORDER BY sort, id", (uid, live))
            waiting = [WaitingItem(
                id=r["id"], title=r["title"], detail=r["detail"], icon=r["icon"],
                action_label=r["action_label"], action_kind=r["action_kind"],
                record_id=r["record_id"]) for r in await cur.fetchall()]

            cur = await conn.execute(
                "SELECT COALESCE(SUM(amount),0) AS s FROM land_expenses "
                "WHERE owner_user_id=%s AND kind='running' AND entity_id = ANY(%s)",
                (uid, live))
            running = _f((await cur.fetchone() or {}).get("s"))

            # "N papers" is the vault total — the eight shelves added up, which
            # includes the Photos shelf. Videos are counted beside photos, not
            # among them, so the two screens agree.
            cur = await conn.execute(
                "SELECT count(*) AS c FROM documents WHERE owner_user_id=%s", (uid,))
            papers = _i((await cur.fetchone() or {}).get("c"))
            cur = await conn.execute(
                "SELECT count(*) AS c FROM parcel_photos WHERE owner_user_id=%s "
                "AND media_kind='photo'", (uid,))
            photos = _i((await cur.fetchone() or {}).get("c"))

            # Who to greet. The account's own name, never the name of whoever
            # the screens were first drawn around.
            cur = await conn.execute("SELECT name FROM users WHERE id=%s", (uid,))
            display = ((await cur.fetchone() or {}).get("name") or "").strip()
            # A login handle is not a name. "shankarreddy.t" has no space and a
            # dot — greet from the paperwork instead.
            if display == uid or ("." in display and " " not in display):
                display = ""
            if not display:
                # Fall back to the name on the paperwork — the pattadar's own.
                # The name that stands behind the most parcels, not whichever
                # passbook row the heap returns first: an empty passbook left
                # by a deleted record must never become the greeting.
                cur = await conn.execute(
                    "SELECT pb.owner_name FROM passbooks pb"
                    " JOIN parcels p ON p.passbook_id = pb.id"
                    " WHERE pb.owner_user_id=%s AND pb.owner_name <> ''"
                    " GROUP BY pb.owner_name ORDER BY count(*) DESC LIMIT 1", (uid,))
                display = ((await cur.fetchone() or {}).get("owner_name") or "").strip()
            # "T. Sankara Rao" greets as "Sankara", not "T." — initials are
            # not what anyone is called.
            parts = [w for w in display.split() if len(w.rstrip(".")) > 1]
            display = parts[0] if parts else (display.split()[0] if display else "")

            shops = len([r for r in built if r["classification"] == "shop"])
            flats = len(built) - shops

            def money(v: float) -> str:
                return _inr_short(v)

            # A tile for a kind the portfolio does not hold is noise: someone
            # who owns only land was shown "BUILT 0 sq.ft · 0 flats". The money
            # tiles always appear — nil invested is itself worth stating.
            tiles = []
            if farm:
                tiles.append(Tile(
                    key="farmland", label="Farmland", value=f"{farm_extent:,.2f}", unit="acres",
                    note=f"{len(farm)} parcel" + ("s" if len(farm) != 1 else "")))
            if plots:
                tiles.append(Tile(
                    key="plots", label="Plots", value=f"{plot_extent:,.0f}", unit="sq.yd",
                    note=f"{len(plots)} open plot" + ("s" if len(plots) != 1 else "")))
            if built:
                tiles.append(Tile(
                    key="built", label="Built", value=f"{built_extent:,.0f}", unit="sq.ft",
                    note=", ".join(
                        ([f"{flats} flat" + ("s" if flats != 1 else "")] if flats else [])
                        + ([f"{shops} shop" + ("s" if shops != 1 else "")] if shops else []))))
            tiles += [
                Tile(key="invested", label="Invested", value=money(invested)),
                Tile(key="worth", label="Worth now", value=money(worth)),
                Tile(key="gain", label="Gain",
                     value=("+" if worth >= invested else "−") + money(abs(worth - invested)),
                     tone="up" if worth >= invested else "down"),
                Tile(key="loans", label="Loans", value=money(loans), note="outstanding",
                     tone="down" if loans else "plain"),
            ]

            covers = await _covers(conn, uid)
            recent = [_to_card(r, tags.get(r["id"], []), covers.get(r["id"], ""))
                      for r in rows[:4]]

            # Two booleans the rail needs on every screen. They ride here
            # rather than on a query of their own because Shell.tsx mounts
            # exactly two queries and a third would run everywhere in the app.
            cur = await conn.execute(
                "SELECT id FROM associates WHERE recipient_user_id=%s LIMIT 1", (uid,))
            mine = str((await cur.fetchone() or {}).get("id") or "")

            return Portfolio(
                display_name=display, farm_extent=farm_extent, farm_count=len(farm),
                plot_extent=plot_extent, plot_count=len(plots),
                built_extent=built_extent, built_flats=flats, built_shops=shops,
                invested=invested, worth_now=worth, gain=worth - invested, loans=loans,
                managed_count=len([r for r in rows if r["stake"] == "managed"]),
                watched_count=len([r for r in rows if r["stake"] == "watch"]),
                waiting_count=len(waiting), running_costs=running,
                paper_count=papers + photos,
                backup_verified_on=_ddmmyyyy(_today()),
                tiles=tiles, waiting=waiting, value_bars=bars, recent=recent,
                is_platform_admin=await _is_admin(conn, uid), associate_id=mine)

    @strawberry.field
    async def properties(
        self, info: strawberry.Info,
        kinds: Optional[List[str]] = None,
        statuses: Optional[List[str]] = None,
        stakes: Optional[List[str]] = None,
        derived: Optional[List[str]] = None,
        tags: Optional[List[str]] = None,
        groups: Optional[List[str]] = None,
    ) -> PropertyList:
        uid = _uid(info)
        kinds, statuses = kinds or [], statuses or []
        stakes, derived, tags = stakes or [], derived or [], tags or []
        groups = groups or []
        async with _pool.connection() as conn:
            all_rows = await _cards(conn, uid)
            tagmap = await _tags_for(conn, uid, "record")
            covers = await _covers(conn, uid)
            # The account's groups, for the facet's labels. Read here rather
            # than derived from the cards so a group shows up under its own
            # name, and so the facet can be built at all for a group whose
            # holdings are all archived.
            cur = await conn.execute(
                "SELECT id, name FROM groups WHERE owner_user_id=%s ORDER BY created_at", (uid,))
            group_rows = await cur.fetchall()
            group_name = {g["id"]: (g["name"] or "Unnamed group") for g in group_rows}

            # An archived record sits outside the list, the counts and the
            # totals until its own facet is ticked. It wears "archived" as its
            # status here so the one status test below covers both worlds.
            archived_rows: List[dict] = []
            for r in all_rows:
                if r.get("archived"):
                    r = dict(r)
                    r["status"] = "archived"
                    archived_rows.append(r)
            base = _active(all_rows)
            rows = base + archived_rows if "archived" in statuses else base

            def keep(r: dict) -> bool:
                if kinds and r["kind"] not in kinds:
                    return False
                if statuses and r["status"] not in statuses:
                    return False
                if stakes and r["stake"] not in stakes:
                    return False
                if tags and not set(tags) & set(tagmap.get(r["id"], [])):
                    return False
                # Which family, firm or trust holds it. `PERSONAL` is a real
                # answer, not the absence of one — "what do I hold in my own
                # name" is the question the option exists to ask — so it gets a
                # key of its own rather than an empty string, which a URL
                # parameter cannot carry unambiguously.
                if groups:
                    gid = r.get("group_id") or ""
                    if not (gid in groups if gid else PERSONAL in groups):
                        return False
                for d in derived:
                    if d not in (r["village"], r["khata_no"], r["mandal"], r["district"]):
                        return False
                return True

            shown = [r for r in rows if keep(r)]
            hidden = [r for r in rows if r not in shown]
            hidden_places = sorted({(r["mandal"] or r["district"] or r["village"])
                                    for r in hidden if (r["mandal"] or r["district"] or r["village"])})

            # Facet counts come off the SAME list the grid renders from —
            # the active records. Archived ones count only in their own option.
            def group(key: str, label: str, opts: List[tuple], active: List[str], get) -> FacetGroup:
                return FacetGroup(key=key, label=label, options=[
                    FacetOption(key=k, label=lbl, count=len([r for r in base if get(r) == k]),
                                active=k in active)
                    for k, lbl in opts
                    if len([r for r in base if get(r) == k])
                ])

            # Tags are read off the ACTIVE records, like every other facet.
            # Taken off the raw tag table, a tag whose only record had been
            # archived stayed in the rail and filtered to an empty grid.
            all_tags: List[str] = []
            for r in base:
                for t in tagmap.get(r["id"], []):
                    if t not in all_tags:
                        all_tags.append(t)
            all_derived: List[str] = []
            for r in base:
                for cand in (r["village"], r["khata_no"]):
                    if cand and cand not in all_derived:
                        all_derived.append(cand)
            personal_n = len([r for r in base if not (r.get("group_id") or "")])

            status_group = group(
                "status", "Status",
                [("owned", "Owned"), ("for_sale", "For sale"), ("disputed", "Disputed")],
                statuses, lambda r: r["status"])
            if archived_rows:
                status_group.options.append(FacetOption(
                    key="archived", label="Archived", count=len(archived_rows),
                    active="archived" in statuses))

            facets = [
                group("kind", "Kind", [("parcel", "Land parcels"), ("property", "Properties")],
                      kinds, lambda r: r["kind"]),
                status_group,
                group("stake", "My stake",
                      [("owned", "Owned"), ("managed", "Managed"), ("watch", "Watch")],
                      stakes, lambda r: r["stake"]),
                FacetGroup(key="derived", label="Derived", options=[
                    FacetOption(key=d, label=d, active=d in derived,
                                count=len([r for r in base if d in (r["village"], r["khata_no"])]))
                    for d in all_derived]),
                FacetGroup(key="tags", label="Your tags", options=[
                    FacetOption(key=t, label=t, active=t in tags,
                                count=len([r for r in base if t in tagmap.get(r["id"], [])]))
                    for t in all_tags]),
                # Family / group. This is what makes "show me everything the
                # Telukutla Family holds" one URL — /app/properties?group=<id>
                # — instead of a second, thinner list screen inside Families &
                # Groups that would have to re-earn filtering, sorting, the map,
                # search and bulk actions. A group with nothing in it is left
                # out, exactly like every other facet here.
                FacetGroup(key="group", label="Family / group", options=[
                    *[FacetOption(key=gid, label=name, active=gid in groups,
                                  count=len([r for r in base if (r.get("group_id") or "") == gid]))
                      for gid, name in group_name.items()
                      if len([r for r in base if (r.get("group_id") or "") == gid])],
                    *([FacetOption(key=PERSONAL, label="In your own name",
                                   active=PERSONAL in groups, count=personal_n)]
                      if personal_n else []),
                ]),
            ]

            bits = [*derived, *tags,
                    *[group_name.get(g, "In your own name" if g == PERSONAL else g)
                      for g in groups],
                    *[o.label.lower() for g in facets if g.key == "status"
                      for o in g.options if o.active]]
            summary = " · ".join(bits)
            active_count = (len(kinds) + len(statuses) + len(stakes) + len(derived)
                            + len(tags) + len(groups))

            return PropertyList(
                shown=len(shown), total=len(rows), hidden=len(hidden),
                filter_summary=summary, hidden_places=hidden_places,
                active_count=active_count,
                cards=[_to_card(r, tagmap.get(r["id"], []), covers.get(r["id"], ""))
                       for r in shown],
                facets=facets)

    @strawberry.field
    async def record(self, info: strawberry.Info, id: str) -> Optional[RecordDetail]:
        uid = _uid(info)
        async with _pool.connection() as conn:
            rows = [r for r in await _cards(conn, uid) if r["id"] == id]
            if not rows:
                return None
            d = rows[0]
            tagmap = await _tags_for(conn, uid, "record")
            lat, lon = _latlon(d["geo_point"])

            async def count(sql: str, args: tuple) -> int:
                cur = await conn.execute(sql, args)
                return _i((await cur.fetchone() or {}).get("c"))

            papers = await count(
                "SELECT count(*) AS c FROM documents WHERE record_id=%s", (id,))
            features = await count(
                "SELECT count(*) AS c FROM land_features WHERE entity_id=%s", (id,))
            people = await count(
                "SELECT count(*) AS c FROM record_people WHERE record_id=%s", (id,))
            services = await count(
                "SELECT count(*) AS c FROM work_requests WHERE entity_id=%s AND closed=false", (id,))
            # Photos only — a visit's video is counted beside them, not among
            # them, exactly as W05's "31 photos · 1 video" reads. A built
            # property files its photos in its own table; counting only
            # parcel_photos showed every flat as having none.
            photos = await count(
                f"SELECT count(*) AS c FROM {_photo_table(d['kind'])} "
                f"WHERE {_photo_key(d['kind'])}=%s AND media_kind='photo'", (id,))

            cur = await conn.execute(
                "SELECT * FROM notes WHERE entity_id=%s AND owner_user_id=%s "
                "ORDER BY created_at DESC LIMIT 1", (id, uid))
            note = await cur.fetchone() or {}

            # The sketch is named by the record's own map paper, not by a
            # sheet number borrowed from whichever record was drawn first.
            sheet = await _fmb_sheet(conn, id, d["title"])

            cur = await conn.execute(
                f"SELECT captured_at, captured_by FROM {_photo_table(d['kind'])} "
                f"WHERE {_photo_key(d['kind'])}=%s ORDER BY captured_at DESC LIMIT 1", (id,))
            newest = await cur.fetchone() or {}
            photo_note = ""
            if newest.get("captured_at"):
                who = (newest.get("captured_by") or "").split(".")[-1].strip()
                who = who.split(" ")[-1] if who else ""
                photo_note = f"Newest {_ddmmyyyy(newest['captured_at'][:10])}" + (
                    f", from {who}'s visit." if who else ".")

            unit = d["extent_unit"]
            detail = _extent_detail(d["extent"], unit)
            per_label = {"ac": "Per acre", "sq.ft": "Per sq.ft"}.get(unit, "Per sq.yd")
            per_value = d["market_value"] / d["extent"] if d["extent"] else 0

            kindword = "LAND PARCEL" if d["kind"] == "parcel" else d["classification"].replace("_", " ").upper()
            eyebrow = " · ".join([p for p in (
                kindword,
                f"KHATA {d['khata_no']}" if d["khata_no"] else "",
                d["classification"].upper() if d["kind"] == "parcel" else "") if p])

            table = "parcels" if d["kind"] == "parcel" else "properties"
            cur = await conn.execute(
                f"SELECT purchase_date, reg_date FROM {table} WHERE id=%s", (id,))
            pr = await cur.fetchone() or {}
            bought = ((pr.get("purchase_date") or pr.get("reg_date") or "")[:4]) if pr else ""
            if not bought:
                # Fall back to the earliest registration on record.
                cur = await conn.execute(
                    "SELECT bought_on FROM purchase_lots WHERE record_id=%s ORDER BY sort", (id,))
                lot = await cur.fetchone() or {}
                bought = (lot.get("bought_on") or "")[-4:]

            return RecordDetail(
                id=id, kind=d["kind"], title=d["title"], eyebrow=eyebrow,
                classification=d["classification"], status=d["status"], stake=d["stake"],
                khata_no=d["khata_no"], owner_name=d["owner_name"],
                place_line=_place_line(d["village"], d["mandal"], d["district"]),
                village=d.get("village") or "", mandal=d.get("mandal") or "",
                district=d.get("district") or "",
                place_line_te=d.get("address") or "",
                # Two states are served, so the UI must not keep printing
                # "Andhra Pradesh" as a constant. Parcels carry the real value
                # on their passbook. `properties` has no state column at all,
                # so those fall back here rather than rendering a blank — one
                # fallback on the server beats one in each screen.
                state=d.get("state") or "Andhra Pradesh",
                extent=d["extent"], extent_unit=unit, extent_detail=detail,
                market_value=d["market_value"], per_unit_value=per_value,
                per_unit_label=per_label, bought_year=bought,
                lat=lat, lon=lon,
                # Already in hand from _cards — the record's own front page can
                # draw the same ground as W04 without a second round trip.
                ring=_ring(d.get("boundary") or ""),
                map_caption=_map_caption(sheet, d["kind"],
                                         bool(_ring(d.get("boundary") or ""))),
                paper_count=papers, feature_count=features, people_count=people,
                service_count=services, photo_count=photos, photo_note=photo_note,
                tags=tagmap.get(id, []),
                note_body=note.get("body", ""),
                note_author=note.get("author") or d["owner_name"] or "You",
                note_at=note.get("created_at", ""))

    @strawberry.field
    async def corrections(self, info: strawberry.Info, record_id: str) -> List[Correction]:
        """Every value that has been changed on this record, newest first.

        Anything here can be corrected — a survey number typed wrong, a village
        always spelled another way. What stops that being dangerous is not a
        lock on the field but this: the old value is kept, with who changed it
        and when, and nothing is ever removed from the list."""
        uid = _uid(info)
        async with _pool.connection() as conn:
            if not await _record_kind(conn, uid, record_id):
                return []
            cur = await conn.execute(
                "SELECT * FROM audit_events WHERE actor=%s AND target=%s"
                " AND action='record.corrected' ORDER BY timestamp DESC LIMIT 200",
                (uid, record_id))
            out: List[Correction] = []
            for r in await cur.fetchall():
                try:
                    d = json.loads(r.get("details") or "{}")
                except ValueError:
                    d = {}
                out.append(Correction(
                    id=r["id"], field=str(d.get("field") or ""),
                    was=str(d.get("from") or ""), now=str(d.get("to") or ""),
                    at=r.get("timestamp") or "", by=r.get("actor") or ""))
            return out

    @strawberry.field
    async def record_history(self, info: strawberry.Info, record_id: str) -> List[HistoryEvent]:
        """Every audited change to this record, newest first.

        Broader than `corrections` (which is only field edits): this returns
        every action filed against the record — a person added, a cost
        recorded, a paper filed, a pin moved, a photo added or removed. Reads
        are excluded so the log is a record of CHANGES, not of viewing. Scoped
        to the caller's own record; `_record_kind` returns '' for anything not
        theirs, so nothing another owner did can appear here."""
        uid = _uid(info)
        async with _pool.connection() as conn:
            if not await _record_kind(conn, uid, record_id):
                return []
            cur = await conn.execute(
                "SELECT * FROM audit_events WHERE actor=%s AND target=%s"
                " AND action NOT LIKE '%%_read' ORDER BY timestamp DESC LIMIT 200",
                (uid, record_id))
            out: List[HistoryEvent] = []
            for r in await cur.fetchall():
                out.append(HistoryEvent(
                    id=r["id"], action=r.get("action") or "",
                    detail=str(r.get("details") or ""),
                    at=r.get("timestamp") or "", by=r.get("actor") or ""))
            return out

    @strawberry.field
    async def assignable(self, info: strawberry.Info) -> List[str]:
        """Names that can take a request on.

        Whoever has done work here before, plus the people already named on
        this account's records. Not an invented roster — a suggestion list
        drawn from what the account has actually seen."""
        uid = _uid(info)
        async with _pool.connection() as conn:
            cur = await conn.execute(
                "SELECT DISTINCT assignee AS n FROM work_requests"
                " WHERE owner_user_id=%s AND assignee <> ''", (uid,))
            names = {r["n"] for r in await cur.fetchall()}
            cur = await conn.execute(
                "SELECT DISTINCT person_name AS n FROM record_people"
                " WHERE owner_user_id=%s AND person_name <> ''", (uid,))
            names |= {r["n"] for r in await cur.fetchall()}
        return sorted(names)

    @strawberry.field
    async def services_offered(self, info: strawberry.Info, q: str = "",
                               key: str = "") -> List[ServiceOffer]:
        """The catalogue, searchable. `key` returns exactly one.

        Searched server-side so the client never has to hold the whole list:
        four services fit in a row of buttons, four hundred do not."""
        def build(k: str, v: dict) -> ServiceOffer:
            return ServiceOffer(
                key=k, label=v["label"], price=v["price"], group=v["group"],
                blurb=v["blurb"], days=_i(v.get("days")),
                fields=[ServiceField(name=n, label=lb, kind=ty, required=req,
                                     options=list(opts), help=hlp)
                        for (n, lb, ty, req, opts, hlp) in v["fields"]])

        if key:
            v = SERVICE_CATALOGUE.get(key)
            return [build(key, v)] if v else []
        needle = q.strip().lower()
        out = [build(k, v) for k, v in SERVICE_CATALOGUE.items()
               if not needle
               or needle in v["label"].lower()
               or needle in v["blurb"].lower()
               or needle in v["group"].lower()]
        return sorted(out, key=lambda o: (o.group, o.label))

    @strawberry.field
    async def papers(self, info: strawberry.Info, record_id: str) -> List[Paper]:
        uid = _uid(info)
        async with _pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM documents WHERE record_id=%s AND owner_user_id=%s "
                "ORDER BY sort, created_at DESC", (record_id, uid))
            docs = await cur.fetchall()
            tagmap = await _tags_for(conn, uid, "paper")
            cur = await conn.execute(
                "SELECT document_id FROM share_links WHERE owner_user_id=%s AND revoked=false", (uid,))
            shared = {r["document_id"] for r in await cur.fetchall()}
            return [Paper(
                id=d["id"], title=d.get("title") or d.get("name") or "Paper",
                detail=d.get("subtitle") or "", shelf=d.get("shelf") or "unsorted",
                icon=d.get("shelf") or "unsorted", tags=tagmap.get(d["id"], []),
                shared=d["id"] in shared, page_count=_i(d.get("page_count")),
                file_ref=d.get("file_ref") or "")
                for d in docs]

    @strawberry.field
    async def vault_papers(self, info: strawberry.Info, shelf: str) -> List[Paper]:
        """Every paper on one shelf, across the whole account.

        The Papers wall (W13) drew eight shelf cards, each a link to
        ``/app/papers?shelf=<key>`` — which is the Papers wall itself. The
        param was never read and no papers-by-shelf read existed: ``papers()``
        above is keyed on one record, and a vault is explicitly the view ACROSS
        records. So every shelf card navigated to the page it was already on.

        `shelf` is the stored column, the same one `vault` groups its counts
        by, so a card reading 12 and this list agreeing is structural rather
        than a coincidence to be maintained. Two keys are special:

          · 'unsorted' also claims rows whose shelf is NULL or '' — that is
            what the count does (``r["shelf"] or "unsorted"``), and a card
            saying 13 over a list of 4 would be the same class of lie this
            resolver exists to fix.
          · 'photos' is not a documents shelf at all: `vault` counts it from
            parcel_photos. Papers on that shelf therefore genuinely is empty,
            and the screen sends people to the record's Photos tab instead.
        """
        uid = _uid(info)
        async with _pool.connection() as conn:
            if shelf == "unsorted":
                cur = await conn.execute(
                    "SELECT * FROM documents WHERE owner_user_id=%s "
                    "AND (shelf IS NULL OR shelf='' OR shelf='unsorted') "
                    "ORDER BY created_at DESC", (uid,))
            else:
                cur = await conn.execute(
                    "SELECT * FROM documents WHERE owner_user_id=%s AND shelf=%s "
                    "ORDER BY created_at DESC", (uid, shelf))
            docs = await cur.fetchall()
            tagmap = await _tags_for(conn, uid, "paper")
            cur = await conn.execute(
                "SELECT document_id FROM share_links WHERE owner_user_id=%s AND revoked=false", (uid,))
            shared = {r["document_id"] for r in await cur.fetchall()}
            return [Paper(
                id=d["id"], title=d.get("title") or d.get("name") or "Paper",
                detail=d.get("subtitle") or "", shelf=d.get("shelf") or "unsorted",
                icon=d.get("shelf") or "unsorted", tags=tagmap.get(d["id"], []),
                shared=d["id"] in shared, page_count=_i(d.get("page_count")),
                file_ref=d.get("file_ref") or "")
                for d in docs]

    @strawberry.field
    async def features(self, info: strawberry.Info, record_id: str) -> FeatureList:
        uid = _uid(info)
        async with _pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM land_features WHERE entity_id=%s AND owner_user_id=%s "
                "ORDER BY sort, label", (record_id, uid))
            rows = await cur.fetchall()

            # land_features.photo_count is a stored column no write path
            # maintains, so a bore card claimed three pictures over a gallery
            # holding five. The pictures themselves are the count. One query
            # for the whole page, not one per feature, and through
            # _photo_table/_photo_key because a flat files into property_photos
            # — hardcoding parcel_photos would show every built record as
            # having none.
            kind = await _record_kind(conn, uid, record_id) or "parcel"
            cur = await conn.execute(
                f"SELECT feature_id, count(*) AS c FROM {_photo_table(kind)}"
                f" WHERE {_photo_key(kind)}=%s AND owner_user_id=%s"
                " GROUP BY feature_id", (record_id, uid))
            pics = {r["feature_id"]: _i(r.get("c")) for r in await cur.fetchall()}

            feats = [Feature(
                id=r["id"], label=r.get("label") or "", spec=r.get("spec") or "",
                icon=r.get("icon") or "feature", category=r.get("category") or "other",
                condition=r.get("condition") or "", condition_state=r.get("condition_state") or "good",
                note=r.get("note") or "", lat=_f(r.get("lat")), lon=_f(r.get("lon")),
                pin_label=r.get("pin_label") or "", photo_count=pics.get(r["id"], 0),
                actions=_jlist(r.get("actions"))) for r in rows]

            # The page promises "worst condition first", so the order is
            # computed here rather than trusted to the `sort` column — that
            # column is the order things were filed in, and a bore that failed
            # this morning is filed last. Python's sort is stable, so within a
            # condition the filed order survives.
            feats.sort(key=lambda f: _STATE_RANK.get(f.condition_state, 3))

            cats: List[FacetOption] = [FacetOption(key="all", label="All", count=len(feats), active=True)]
            seen: List[str] = []
            for f in feats:
                if f.category not in seen:
                    seen.append(f.category)
            for c in seen:
                cats.append(FacetOption(key=c, label=c.capitalize(),
                                        count=len([f for f in feats if f.category == c]), active=False))
            bad = len([f for f in feats if f.condition_state == "bad"])
            unchecked = len([f for f in feats if f.condition_state == "unknown"])
            cats.append(FacetOption(key="needs_repair", label="Needs repair", count=bad, active=False))
            # Its own chip, because "filed but never inspected" is a different
            # job from "broken" and the two must not be counted together.
            cats.append(FacetOption(key="unchecked", label="Not checked", count=unchecked, active=False))

            cur = await conn.execute(
                "SELECT captured_at, captured_by FROM parcel_photos WHERE parcel_id=%s "
                "ORDER BY captured_at DESC LIMIT 1", (record_id,))
            last = await cur.fetchone() or {}
            return FeatureList(
                features=feats, total=len(feats), needs_repair=bad,
                walked_on=(last.get("captured_at") or "")[:10],
                walked_by=last.get("captured_by") or "", categories=cats)

    @strawberry.field
    async def people(self, info: strawberry.Info, record_id: str) -> PeopleView:
        uid = _uid(info)
        async with _pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM record_people WHERE record_id=%s AND owner_user_id=%s "
                "ORDER BY sort, id", (record_id, uid))
            people = [Person(
                id=r["id"], name=r["person_name"], initials=r.get("initials") or "",
                role=r.get("role") or "", badges=_jlist(r.get("badges")),
                summary=r.get("summary") or "", arrangement=r.get("arrangement") or "",
                pay_label=r.get("pay_label") or "", pay_value=r.get("pay_value") or "",
                due_label=r.get("due_label") or "", due_value=r.get("due_value") or "",
                visibility=r.get("visibility") or "", actions=_jlist(r.get("actions")),
                compact=bool(r.get("compact"))) for r in await cur.fetchall()]

            cur = await conn.execute(
                "SELECT * FROM people_payments WHERE record_id=%s AND owner_user_id=%s "
                "ORDER BY sort, id", (record_id, uid))
            pays = [Payment(
                id=r["id"], title=r.get("title") or "", subtitle=r.get("subtitle") or "",
                occurred_on=r.get("occurred_on") or "", method=r.get("method") or "",
                amount=_f(r.get("amount")), direction=r.get("direction") or "out",
                state=r.get("state") or "settled") for r in await cur.fetchall()]

            # Topped up, less everything settled out of it. Never a literal.
            cur = await conn.execute(
                "SELECT topped_up, auto_top_up FROM wallet_accounts WHERE owner_user_id=%s",
                (uid,))
            wallet = await cur.fetchone() or {}
            cur = await conn.execute(
                "SELECT COALESCE(SUM(amount),0) AS out FROM people_payments"
                " WHERE owner_user_id=%s AND state='settled' AND direction='out'", (uid,))
            paid_out = _f((await cur.fetchone() or {}).get("out"))
            balance = max(0.0, _f(wallet.get("topped_up")) - paid_out)
            monthly = 0.0
            seasonal = 0.0
            for p in people:
                if "month" in (p.pay_value or ""):
                    monthly += _rupees(p.pay_value)
                if "season" in (p.pay_value or ""):
                    seasonal += _rupees(p.pay_value)
            escrowed = sum(p.amount for p in pays if p.state == "escrow")
            # Both halves of this line used to promise money movement the
            # system cannot make: "top up to pay from Pattadar" sat directly
            # above a Top up button that refused, and "auto top-up on" claimed
            # a standing instruction was already running. Payments are not
            # switched on, so while the provider is the stub the note says the
            # one true thing — the same words Wallet.tsx and the People rail
            # already use, so they flip together when a provider goes live.
            wallet_live = ticketing.is_live(_payments_provider())
            if wallet_live:
                note = "auto top-up on" if wallet.get("auto_top_up") else "auto top-up off"
            else:
                note = "paying from Pattadar is not switched on"
            if escrowed:
                note = f"{_inr_short(escrowed)} more held in escrow · {note}"
            if not wallet:
                note = "no wallet yet · auto top-up off" if wallet_live \
                    else "no wallet yet — paying from Pattadar is not switched on"
            return PeopleView(
                people=people, payments=pays, count=len(people),
                monthly_out=monthly, seasonal_in=seasonal,
                wallet_balance=balance, wallet_note=note, wallet_live=wallet_live)

    @strawberry.field
    async def boundary(self, info: strawberry.Info, record_id: str) -> Optional[BoundaryView]:
        uid = _uid(info)
        async with _pool.connection() as conn:
            rows = [r for r in await _cards(conn, uid) if r["id"] == record_id]
            if not rows:
                return None
            d = rows[0]
            lat, lon = _latlon(d["geo_point"])
            cur = await conn.execute(
                "SELECT * FROM boundary_marks WHERE record_id=%s AND owner_user_id=%s "
                "ORDER BY seq", (record_id, uid))
            # boundary_marks.photo_count is a stored column no write path
            # maintains, and unlike land_features there is nothing here to
            # derive a true count from: a photo row links to a feature
            # (feature_id) and to an order (order_ref), never to a mark, so no
            # query in this file can say which pictures are of this stone.
            # The seeds wrote numbers into the column while add_mark and
            # marks_from_boundary write 0, so the screen read a fixture back
            # out as "View its 2 photos" over a link to the record's whole
            # unfiltered gallery. 0 is the only count this server can stand
            # behind until a photo can be filed against a mark, which needs a
            # mark_id column on parcel_photos/property_photos and a capture
            # path that sets it.
            marks = [BoundaryMark(
                id=r["id"], seq=_i(r.get("seq")), label=r.get("label") or "",
                state=r.get("state") or "confirmed", detail=r.get("detail") or "",
                lat=_f(r.get("lat")), lon=_f(r.get("lon")),
                photo_count=0, noted_on=r.get("noted_on") or "")
                for r in await cur.fetchall()]
            shape = _shape(d["shape"])
            sheet = await _fmb_sheet(conn, record_id, d["title"])

            # Who set the pin is a fact about this record: the person who last
            # stood on it with a camera.
            cur = await conn.execute(
                "SELECT captured_by, accuracy_m FROM parcel_photos WHERE parcel_id=%s "
                "AND verified=true ORDER BY captured_at DESC LIMIT 1", (record_id,))
            shot = await cur.fetchone() or {}
            who = (shot.get("captured_by") or "").split(".")[-1].strip()
            acc = _f(shot.get("accuracy_m")) or 4

            return BoundaryView(
                record_id=record_id, title=d["title"], lat=lat, lon=lon,
                set_by=f"{who}, on site" if who else "Not set on site",
                accuracy=f"±{acc:.0f} m · GPS" if who else "unverified",
                extent_label=(f"{d['extent']:,.2f} ac" if d["extent_unit"] == "ac"
                              else f"{d['extent']:,.0f} {d['extent_unit']}"),
                shape=shape,
                ring=_ring(d.get("boundary") or ""),
                # "Traced over the parcel" is a claim about a line on a map.
                # It needs BOTH a sheet and a surveyed ring; with a sheet on
                # file and nothing drawn from it, the sheet exists and the
                # tracing does not.
                caption=_boundary_caption(sheet, bool(_ring(d.get("boundary") or "")),
                                          d.get("village") or ""),
                # "" hides the sheet card entirely: there is no sheet to open,
                # replace, or show the version history of.
                sheet_title=("" if not sheet
                             else sheet if "sheet" in sheet.lower() else f"{sheet} sheet"),
                sheet_detail=await _sheet_detail(conn, record_id),
                sheet_id=str((await _fmb_sheet_row(conn, record_id)).get("id") or ""),
                marks=marks)

    @strawberry.field
    async def photos(self, info: strawberry.Info, record_id: str,
                     feature_id: Optional[str] = None) -> PhotoList:
        uid = _uid(info)
        async with _pool.connection() as conn:
            # A flat files its photos in property_photos; reading only
            # parcel_photos showed a count in the rail and an empty gallery
            # behind it. '' means the record is not this user's — the
            # owner_user_id filter below then returns nothing either way.
            kind = await _record_kind(conn, uid, record_id) or "parcel"
            sql = (f"SELECT * FROM {_photo_table(kind)}"
                   f" WHERE {_photo_key(kind)}=%s AND owner_user_id=%s")
            args: tuple = (record_id, uid)
            if feature_id:
                sql += " AND feature_id=%s"
                args = (record_id, uid, feature_id)
            cur = await conn.execute(sql + " ORDER BY sort, captured_at DESC", args)
            rows = await cur.fetchall()
            tagmap = await _tags_for(conn, uid, "photo")
            photos = [Photo(
                id=r["id"], caption=r.get("caption") or "", category=r.get("category") or "",
                file_name=r.get("file_name") or "", file_ref=r.get("file_ref") or "",
                media_kind=r.get("media_kind") or "photo",
                captured_at=r.get("captured_at") or "", local_time=r.get("local_time") or "",
                captured_by=r.get("captured_by") or "", lat=_f(r.get("latitude")),
                lon=_f(r.get("longitude")), accuracy_m=_f(r.get("accuracy_m")),
                order_ref=r.get("order_ref") or "", source=r.get("source") or "app",
                sha256=r.get("sha256") or "", verified=bool(r.get("verified")),
                device_clock_ok=bool(r.get("device_clock_ok")),
                pin_distance_m=_f(r.get("pin_distance_m")),
                width=_i(r.get("width")), height=_i(r.get("height")),
                feature_id=r.get("feature_id") or "", tags=tagmap.get(r["id"], []),
                is_cover=bool(r.get("is_cover"))) for r in rows]

            visits = sorted({p.captured_at[:10] for p in photos if p.captured_at})
            latest = visits[-1] if visits else ""
            subject = ""
            if feature_id:
                cur = await conn.execute("SELECT label FROM land_features WHERE id=%s", (feature_id,))
                subject = (await cur.fetchone() or {}).get("label", "")
            return PhotoList(
                photos=photos, total=len([p for p in photos if p.media_kind == "photo"]),
                video_count=len([p for p in photos if p.media_kind == "video"]),
                visit_count=len(visits), latest_visit=latest,
                latest_visit_count=len([p for p in photos if p.captured_at[:10] == latest]),
                verified_count=len([p for p in photos if p.verified]),
                unproven_count=len([p for p in photos if not p.verified]),
                subject=subject)

    @strawberry.field
    async def money(self, info: strawberry.Info, record_id: str,
                    appreciation: Optional[float] = None) -> Optional[MoneyView]:
        uid = _uid(info)
        rate_pct = appreciation if appreciation is not None else 10.0
        async with _pool.connection() as conn:
            rows = [r for r in await _cards(conn, uid) if r["id"] == record_id]
            if not rows:
                return None
            d = rows[0]
            cur = await conn.execute(
                "SELECT * FROM purchase_lots WHERE record_id=%s AND owner_user_id=%s ORDER BY sort",
                (record_id, uid))
            lots = [PurchaseLot(
                id=r["id"], bought_on=r.get("bought_on") or "", extent=_f(r.get("extent")),
                extent_unit=r.get("extent_unit") or "ac", rate=_f(r.get("rate")),
                paid=_f(r.get("paid")), govt_value=_f(r.get("govt_value")),
                seller=r.get("seller") or "", deed_no=r.get("deed_no") or "",
                sro=r.get("sro") or "") for r in await cur.fetchall()]

            cur = await conn.execute(
                "SELECT * FROM capital_costs WHERE record_id=%s AND owner_user_id=%s ORDER BY sort",
                (record_id, uid))
            extras = [CapitalCost(id=r["id"], label=r.get("label") or "", amount=_f(r.get("amount")))
                      for r in await cur.fetchall()]

            # With no lots on file lot_paid was 0, and every figure measured
            # against it turned the whole market value into profit at +0%. A
            # record can carry what it cost without anybody having broken it
            # into lots, and purchase_price is where that lives.
            lot_paid = sum(l.paid for l in lots) if lots else _f(d.get("purchase_price"))
            lot_govt = sum(l.govt_value for l in lots)
            lot_extent = sum(l.extent for l in lots) or d["extent"]
            extras_total = sum(e.amount for e in extras)
            paid_total = lot_paid + extras_total
            market = d["market_value"]

            # The published rate for this land. `guideline_value` is what the
            # SRO says today; only when a record carries none does it fall back
            # to indexing the value declared at registration.
            cur = await conn.execute(
                f"SELECT guideline_value FROM {'parcels' if d['kind'] == 'parcel' else 'properties'}"
                " WHERE id=%s", (record_id,))
            guideline = _f((await cur.fetchone() or {}).get("guideline_value"))
            govt_total = guideline or (lot_govt * 1.38 if lot_govt else 0.0)
            unit = d["extent_unit"]
            rates = []
            if unit == "ac" and lot_extent:
                per_acre = market / lot_extent
                rates = [
                    RatePoint(label="Per acre", value=per_acre, unit=""),
                    RatePoint(label="Per gunta", value=per_acre / 40, unit=""),
                    RatePoint(label="Per sq.yd", value=per_acre / 4840, unit=""),
                    RatePoint(label="Per cent", value=per_acre / 100, unit=""),
                ]

            # The chart's amber line and the "Market estimate" card are the
            # same claim, so the curve is anchored to END at that number rather
            # than compounding the price paid into a different one.
            series: List[ValuePoint] = []
            if lots:
                start = int((lots[0].bought_on or "2022")[-4:] or 2022)
                years = list(range(start, date.today().year + 1)) or [start]
                span = max(1, len(years) - 1)
                for i, yr in enumerate(years):
                    t = i / span
                    series.append(ValuePoint(
                        year=str(yr),
                        market=paid_total + (market - paid_total) * ((1 + rate_pct / 100) ** i - 1)
                               / max(1e-9, (1 + rate_pct / 100) ** span - 1) if span else market,
                        government=lot_govt + (govt_total - lot_govt) * t,
                        paid=paid_total))

            is_built = d["extent_unit"] == "sq.ft"
            # A built property is land plus a structure that wears out. The
            # split used to be the hero flat's four numbers, frozen; it is now
            # derived from this record's own area, rate and age.
            land_area = build_area = land_rate = build_rate = 0.0
            land_value = build_value = depreciation = 0.0
            dep_years = 0
            if is_built:
                cur = await conn.execute(
                    "SELECT land_area, builtup_area, reg_date FROM properties WHERE id=%s",
                    (record_id,))
                prop = await cur.fetchone() or {}
                build_area = _f(prop.get("builtup_area")) or d["extent"]
                land_area = _f(prop.get("land_area")) or round(build_area / 4.5)
                # Split today's worth the way a valuer does: land carries the
                # majority, the structure the rest, then age is taken off.
                build_rate = 1850.0
                build_value = build_area * build_rate
                land_value = max(0.0, market - build_value)
                land_rate = (land_value / land_area) if land_area else 0.0
                bought_year = (lots[0].bought_on[-4:] if lots and lots[0].bought_on else "")
                dep_years = max(0, date.today().year - int(bought_year)) if bought_year.isdigit() else 0
                depreciation = build_value * min(0.4, 0.015 * dep_years)

            return MoneyView(
                record_id=record_id, title=d["title"],
                eyebrow=f"{lot_extent:,.2f} ACRES · BOUGHT IN {_word(len(lots))} LOTS, "
                        f"{(lots[0].bought_on or '')[-4:]}" if len(lots) > 1 else d["title"].upper(),
                paid_total=paid_total, paid_per_unit=(paid_total / lot_extent) if lot_extent else 0,
                extras_total=extras_total, govt_total=govt_total,
                govt_per_unit=(govt_total / lot_extent) if lot_extent else 0,
                govt_revised=_ddmmyyyy(_today())[3:],
                market_total=market,
                # Nothing paid, nothing to compare: the screen prints "there is
                # no gain to show" off these being absent rather than zero.
                market_gain=(market - paid_total) if paid_total else None,
                market_gain_pct=((market - paid_total) / paid_total * 100) if paid_total else None,
                extent=lot_extent, extent_unit=unit, lots=lots,
                blended_rate=(lot_paid / lot_extent) if lot_extent else 0,
                blended_paid=lot_paid, blended_govt=lot_govt,
                extras=extras, rates=rates, series=series, appreciation_pct=rate_pct,
                is_built=is_built,
                land_area=land_area, land_rate=land_rate, land_value=land_value,
                build_area=build_area, build_rate=build_rate, build_value=build_value,
                depreciation=depreciation, depreciation_years=dep_years)

    @strawberry.field
    async def expenses(self, info: strawberry.Info, record_id: str,
                       year: Optional[str] = None) -> Optional[ExpenseView]:
        uid = _uid(info)
        async with _pool.connection() as conn:
            rows = [r for r in await _cards(conn, uid) if r["id"] == record_id]
            if not rows:
                return None
            d = rows[0]
            cur = await conn.execute(
                "SELECT * FROM land_expenses WHERE entity_id=%s AND owner_user_id=%s",
                (record_id, uid))
            # Sorted here, not in SQL: spent_on is DD/MM/YYYY text, so ORDER BY
            # would put 28/07 above 12/08.
            all_rows = sorted(await cur.fetchall(),
                              key=lambda r: _datekey(r.get("spent_on") or ""), reverse=True)
            years = sorted({(r.get("fiscal_year") or "") for r in all_rows if r.get("fiscal_year")},
                           reverse=True) or ["2026-27"]
            yr = year or years[0]
            sel = [r for r in all_rows if (r.get("fiscal_year") or years[0]) == yr]

            items = [Expense(
                id=r["id"], title=r.get("title") or "", subtitle=r.get("subtitle") or "",
                on_label=r.get("on_label") or "", on_icon=r.get("on_icon") or "",
                kind=r.get("kind") or "running", paid_by=r.get("paid_by") or "",
                amount=_f(r.get("amount")), spent_on=r.get("spent_on") or "",
                category=r.get("category") or "other",
                recoverable=bool(r.get("recoverable")),
                recoverable_note=r.get("recoverable_note") or "",
                has_receipt=bool(r.get("has_receipt"))) for r in sel]

            capital = sum(i.amount for i in items if i.kind == "capital")
            running = sum(i.amount for i in items if i.kind == "running")
            income = sum(i.amount for i in items if i.kind == "income")
            owed = sum(i.amount for i in items if i.recoverable)

            cats = [FacetOption(key="all", label="All", count=len(items), active=True)]
            seen: List[str] = []
            for i in items:
                if i.category not in seen:
                    seen.append(i.category)
            for c in seen:
                cats.append(FacetOption(key=c, label=c, count=len([i for i in items if i.category == c]),
                                        active=False))

            cur = await conn.execute(
                "SELECT id, label FROM land_features WHERE entity_id=%s ORDER BY sort", (record_id,))
            feats = [FacetOption(key=r["id"], label=r["label"], count=0, active=False)
                     for r in await cur.fetchall()]

            is_built = d["extent_unit"] == "sq.ft"
            worth = d["market_value"] or 1
            return ExpenseView(
                record_id=record_id, title=d["title"],
                eyebrow="WHAT THIS LAND COSTS" if not is_built else "EXPENSES & RENT",
                is_built=is_built, year=yr, years=years,
                spent=capital + running, capital=capital, running=running,
                owed_back=owed, income=income,
                # Everything it cost, capital included — a repaint between
                # tenants is money the year's rent had to cover too.
                net_yield=((income - capital - running) / worth * 100) if is_built else 0,
                per_unit_running=(running / d["extent"]) if d["extent"] else 0,
                extent=d["extent"], extent_unit=d["extent_unit"],
                categories=cats, rows=items, feature_options=feats)

    @strawberry.field
    async def vault(self, info: strawberry.Info) -> VaultView:
        uid = _uid(info)
        async with _pool.connection() as conn:
            cur = await conn.execute(
                "SELECT shelf, count(*) AS c FROM documents WHERE owner_user_id=%s GROUP BY shelf", (uid,))
            counts = {r["shelf"] or "unsorted": _i(r["c"]) for r in await cur.fetchall()}
            cur = await conn.execute(
                "SELECT count(*) AS c FROM parcel_photos WHERE owner_user_id=%s "
                "AND media_kind='photo'", (uid,))
            counts["photos"] = _i((await cur.fetchone() or {}).get("c"))

            spec = [
                ("title", "Title", "Deeds, wills, agreements"),
                ("revenue", "Revenue record", "Passbooks, ROR, mutations"),
                ("map", "Map", "FMB, tippons, sketches"),
                ("identity", "Identity", "Masked until you unlock"),
                ("search", "Search & tax", "ECs, receipts, challans"),
                ("old", "Old record", "Sethwar, khasra"),
                ("photos", "Photos", "Of the land itself"),
                ("unsorted", "Unsorted", "Nothing recognised it"),
            ]
            shelves = [Shelf(key=k, label=l, note=n, count=counts.get(k, 0)) for k, l, n in spec]

            cur = await conn.execute(
                "SELECT * FROM share_links WHERE owner_user_id=%s AND revoked=false ORDER BY sort",
                (uid,))
            links = [_link(r) for r in await cur.fetchall()]
            return VaultView(
                total=sum(s.count for s in shelves),
                region_note="encrypted in Mumbai (ap-south-1) · versioned, never overwritten",
                shelves=shelves, links=links)

    @strawberry.field
    async def document(self, info: strawberry.Info, id: str) -> Optional[DocumentView]:
        uid = _uid(info)
        async with _pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM documents WHERE id=%s AND owner_user_id=%s", (id, uid))
            d = await cur.fetchone()
            if not d:
                return None
            tagmap = await _tags_for(conn, uid, "paper")
            cur = await conn.execute(
                "SELECT * FROM document_versions WHERE document_id=%s ORDER BY sort DESC", (id,))
            versions = [DocumentVersion(
                id=r["id"], version=_i(r.get("version")), label=r.get("label") or "",
                made_on=r.get("made_on") or "", made_by=r.get("made_by") or "",
                note=r.get("note") or "") for r in await cur.fetchall()]
            cur = await conn.execute(
                "SELECT * FROM share_links WHERE document_id=%s AND revoked=false LIMIT 1", (id,))
            lrow = await cur.fetchone()

            rec_title = ""
            if d.get("record_id"):
                recs = [r for r in await _cards(conn, uid) if r["id"] == d["record_id"]]
                rec_title = recs[0]["title"] if recs else ""

            size = _i(d.get("size_bytes")) or _i(d.get("file_size"))
            return DocumentView(
                id=id, title=d.get("title") or d.get("name") or "Paper",
                subtitle=d.get("subtitle") or "", shelf=d.get("shelf") or "unsorted",
                record_id=d.get("record_id") or "", record_title=rec_title,
                page_count=_i(d.get("page_count")),
                size_label=f"{size / 1_048_576:.1f} MB" if size else "",
                file_ref=d.get("file_ref") or "", mime_type=d.get("mime_type") or "",
                registered_on=d.get("registered_on") or "", office=d.get("office") or "",
                buyer=d.get("buyer") or "", seller=d.get("seller") or "",
                consideration=_f(d.get("consideration")),
                reader_summary=d.get("reader_summary") or "",
                reader_flag=d.get("reader_flag") or "",
                reader_flag_page=_i(d.get("reader_flag_page")),
                tags=tagmap.get(id, []), shared=bool(lrow),
                versions=versions, link=_link(lrow) if lrow else None)

    @strawberry.field
    async def shared_kits(self, info: strawberry.Info) -> List[SharedKit]:
        uid = _uid(info)
        async with _pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM shared_kits WHERE recipient_user_id=%s ORDER BY sort", (uid,))
            return [await _kit(conn, r) for r in await cur.fetchall()]

    @strawberry.field
    async def shared_kit(self, info: strawberry.Info, id: str) -> Optional[SharedKit]:
        uid = _uid(info)
        async with _pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM shared_kits WHERE id=%s AND recipient_user_id=%s", (id, uid))
            row = await cur.fetchone()
            return await _kit(conn, row) if row else None

    @strawberry.field
    async def search(self, info: strawberry.Info, q: str) -> List[SearchHit]:
        """The jump box: a parcel by survey number, village, khata or owner;
        a paper by its name; a person by theirs. Each hit carries the route
        it opens, so the client never re-derives where things live."""
        uid = _uid(info)
        needle = (q or "").strip()
        if len(needle) < 2:
            return []
        out: List[SearchHit] = []
        like = f"%{needle}%"
        ql = needle.lower()
        async with _pool.connection() as conn:
            for d in _active(await _cards(conn, uid)):
                hay = (f"{d['title']} {d['village']} {d['mandal']} "
                       f"{d['khata_no']} {d['owner_name']}").lower()
                if ql in hay:
                    out.append(SearchHit(
                        id=d["id"], kind="record", title=d["title"],
                        subtitle=_place_line(d["village"], d["mandal"]) or d["district"],
                        route=f"/app/records/{d['id']}"))
                if len(out) >= 6:
                    break
            cur = await conn.execute(
                "SELECT id, name, subtitle, shelf FROM documents WHERE owner_user_id=%s "
                "AND name ILIKE %s ORDER BY name LIMIT 5", (uid, like))
            for r in await cur.fetchall():
                out.append(SearchHit(
                    id=r["id"], kind="paper", title=r.get("name") or "Paper",
                    subtitle=(r.get("subtitle") or r.get("shelf") or "")[:70],
                    route=f"/app/papers/{r['id']}"))
            cur = await conn.execute(
                "SELECT DISTINCT ON (person_name) id, person_name, role, record_id "
                "FROM record_people WHERE owner_user_id=%s AND person_name ILIKE %s "
                "ORDER BY person_name, id LIMIT 5", (uid, like))
            for r in await cur.fetchall():
                out.append(SearchHit(
                    id=r["id"], kind="person", title=r["person_name"],
                    subtitle=r.get("role") or "",
                    route=f"/app/records/{r['record_id']}/people"))
        return out

    @strawberry.field
    async def orders(self, info: strawberry.Info,
                     record_id: Optional[str] = None,
                     include_closed: bool = False) -> List[Order]:
        """Services ordered against a record — the Services hanger, and the
        'Assigned to me' list when no record is named.

        `include_closed` defaults false, so this answers exactly what it has
        always answered for every caller that does not ask; the Services
        screen's own "Everything, including done" is the one that does."""
        uid = _uid(info)
        async with _pool.connection() as conn:
            sql = "SELECT * FROM work_requests WHERE owner_user_id=%s"
            args: tuple = (uid,)
            if not include_closed:
                sql += " AND closed=false"
            if record_id is not None:
                # "Not asked for" and "asked for, with no record chosen" are
                # different questions. `''` read as absent made the Services
                # hanger's "what is already ordered HERE" list every open order
                # on the account before a record was picked. It cannot lean on
                # the column either: an unfiled ticket genuinely carries
                # entity_id='', so an empty ask is answered with nothing.
                if not record_id:
                    return []
                sql += " AND entity_id=%s"
                args = (uid, record_id)
            order = (" ORDER BY closed, needs_you DESC, due_date" if include_closed
                     else " ORDER BY needs_you DESC, due_date")
            cur = await conn.execute(sql + order, args)
            rows = await cur.fetchall()
            titles = {r["id"]: r["title"] for r in await _cards(conn, uid)}
            # Money and unreviewed work, for the whole list in two queries
            # rather than two per row — the same reason `_covers` exists.
            cur = await conn.execute(
                "SELECT ticket_id,"
                " COALESCE(SUM(CASE WHEN to_bucket='held' THEN amount ELSE 0 END),0)"
                " - COALESCE(SUM(CASE WHEN from_bucket='held' THEN amount ELSE 0 END),0)"
                " AS held FROM service_payments WHERE owner_user_id=%s"
                " AND status <> 'failed' GROUP BY ticket_id", (uid,))
            held = {r["ticket_id"]: _f(r.get("held")) for r in await cur.fetchall()}
            cur = await conn.execute(
                "SELECT ticket_id, count(*) AS c FROM ticket_deliverables"
                " WHERE owner_user_id=%s AND review='pending' GROUP BY ticket_id", (uid,))
            waiting = {r["ticket_id"]: _i(r.get("c")) for r in await cur.fetchall()}
            out: List[Order] = []
            for r in rows:
                status = _status_of(r)
                out.append(Order(
                    id=r["id"], kind=r.get("kind") or "", title=r.get("title") or "",
                    detail=r.get("note") or "", assignee=r.get("assignee") or "",
                    cost=_f(r.get("cost")), stage=_i(r.get("stage")),
                    stage_label=_STAGES[min(max(_i(r.get("stage")), 0), len(_STAGES) - 1)],
                    needs_you=bool(r.get("needs_you")), due_date=r.get("due_date") or "",
                    record_id=r.get("entity_id") or "",
                    record_title=titles.get(r.get("entity_id") or "", ""),
                    params=r.get("params") or "{}",
                    status=status, status_label=ticketing.label_of(status),
                    status_state=ticketing.state_of(status),
                    ref=ticketing.ticket_ref(r["id"]),
                    held=max(0.0, held.get(r["id"], 0.0)),
                    pending_review=waiting.get(r["id"], 0),
                    assignee_ref=r.get("assignee_ref") or ""))
            return out

    @strawberry.field
    async def ticket(self, info: strawberry.Info, id: str) -> Optional[TicketView]:
        """One ticket, whole: what was asked for, who has it, everything that
        has happened, what came back, what went out, and every rupee.

        None when the id is not this owner's — the same answer as not-found,
        because telling a stranger which ticket numbers exist is telling them
        something."""
        uid = _uid(info)
        async with _pool.connection() as conn:
            row = await _ticket_row(conn, uid, id)
            if not row:
                return None
            rid = row.get("entity_id") or ""
            card = next((c for c in await _cards(conn, uid) if c["id"] == rid), {})
            kind = row.get("kind") or ""
            status = _status_of(row)
            cur = await conn.execute(
                "SELECT * FROM ticket_events WHERE ticket_id=%s AND owner_user_id=%s"
                " ORDER BY at, id", (id, uid))
            events = [_ev(r) for r in await cur.fetchall()]
            cur = await conn.execute(
                "SELECT * FROM ticket_deliverables WHERE ticket_id=%s AND owner_user_id=%s"
                " ORDER BY sort, id", (id, uid))
            deliverables = [_dv(r, kind) for r in await cur.fetchall()]
            cur = await conn.execute(
                "SELECT * FROM ticket_dispatches WHERE ticket_id=%s AND owner_user_id=%s"
                " ORDER BY sort, id", (id, uid))
            dispatches = [_dx(r) for r in await cur.fetchall()]
            ledger = await _ledger_of(conn, uid, id)
            # "Nothing has moved for nine days" is the only honest thing a
            # tracking screen can say while a surveyor is not answering his
            # phone, and it needs a date to say it from.
            quiet_days = ticketing.days_between(
                (row.get("status_at") or row.get("created_at") or "")[:10], _today())
            return TicketView(
                id=row["id"], ref=ticketing.ticket_ref(row["id"]), kind=kind,
                title=row.get("title") or "", detail=row.get("note") or "",
                record_id=rid, record_title=card.get("title") or "",
                record_place=_card_place(card),
                status=status, status_label=ticketing.label_of(status),
                status_state=ticketing.state_of(status),
                stage=_i(row.get("stage")),
                stage_label=_STAGES[min(max(_i(row.get("stage")), 0), len(_STAGES) - 1)],
                needs_you=bool(row.get("needs_you")), closed=bool(row.get("closed")),
                assignee=row.get("assignee") or "", due_date=row.get("due_date") or "",
                quiet_days=quiet_days,
                quiet=quiet_days >= 4 and status in ("sent", "assigned", "on_site"),
                outcome_note=row.get("outcome_note") or "",
                accepted_at=_ddmmyyyy((row.get("accepted_at") or "")[:10]),
                created_at=row.get("created_at") or "",
                can=ticketing.can(status),
                answers=_answers(kind, row.get("params") or "{}"),
                money=_money_of(row, ledger), events=events,
                deliverables=deliverables, dispatches=dispatches,
                ledger=[_lr(r) for r in ledger],
                # Who is on it, and whether this owner may have their number.
                # None on every job whose assignee is a hand-typed name, which
                # is what the card reads to know it must not offer a Call
                # control it cannot honour.
                assigned_to=await _assigned_person(conn, uid, row),
                dispatch_state=row.get("dispatch_state") or "")

    @strawberry.field
    async def wallet(self, info: strawberry.Info, limit: int = 60) -> WalletView:
        """What is in the wallet, what is set aside on jobs, and what has gone.

        Every figure is a SUM over the ledger; there is no stored balance
        anywhere, because a stored balance and a ledger disagree exactly once
        and then forever. Each one is labelled by the screen for the question
        it answers — the People rail's balance is a different question and the
        two must never be passed off as the same number."""
        uid = _uid(info)
        provider = _payments_provider()
        async with _pool.connection() as conn:
            cur = await conn.execute(
                "SELECT topped_up, auto_top_up FROM wallet_accounts WHERE owner_user_id=%s",
                (uid,))
            acct = await cur.fetchone() or {}
            cur = await conn.execute(
                "SELECT COALESCE(SUM(amount),0) AS out FROM people_payments"
                " WHERE owner_user_id=%s AND state='settled' AND direction='out'", (uid,))
            people_out = _f((await cur.fetchone() or {}).get("out"))
            # A failed payment is a fact, not a balance, so it is excluded here
            # and still listed below.
            cur = await conn.execute(
                "SELECT"
                " COALESCE(SUM(CASE WHEN to_bucket='wallet' THEN amount ELSE 0 END),0) AS in_wallet,"
                " COALESCE(SUM(CASE WHEN from_bucket='wallet' THEN amount ELSE 0 END),0) AS out_wallet,"
                " COALESCE(SUM(CASE WHEN to_bucket='held' THEN amount ELSE 0 END),0) AS to_held,"
                " COALESCE(SUM(CASE WHEN from_bucket='held' THEN amount ELSE 0 END),0) AS from_held,"
                " COALESCE(SUM(CASE WHEN to_bucket='payout' THEN amount ELSE 0 END),0) AS payout,"
                " COALESCE(SUM(CASE WHEN to_bucket='fee' THEN amount ELSE 0 END),0) AS fee,"
                " COALESCE(SUM(CASE WHEN entry='top_up' THEN amount ELSE 0 END),0) AS topped"
                " FROM service_payments WHERE owner_user_id=%s AND status <> 'failed'", (uid,))
            agg = await cur.fetchone() or {}
            cur = await conn.execute(
                "SELECT ticket_id,"
                " COALESCE(SUM(CASE WHEN to_bucket='held' THEN amount ELSE 0 END),0)"
                " - COALESCE(SUM(CASE WHEN from_bucket='held' THEN amount ELSE 0 END),0)"
                " AS held FROM service_payments WHERE owner_user_id=%s"
                " AND status <> 'failed' AND ticket_id <> '' GROUP BY ticket_id", (uid,))
            holding = {r["ticket_id"]: _f(r.get("held")) for r in await cur.fetchall()
                       if _f(r.get("held")) > 0}
            jobs: List[WalletJob] = []
            if holding:
                titles = {c["id"]: c["title"] for c in await _cards(conn, uid)}
                cur = await conn.execute(
                    "SELECT * FROM work_requests WHERE owner_user_id=%s AND id = ANY(%s)",
                    (uid, list(holding)))
                for r in await cur.fetchall():
                    jobs.append(WalletJob(
                        ticket_id=r["id"], ref=ticketing.ticket_ref(r["id"]),
                        title=r.get("title") or "",
                        record_title=titles.get(r.get("entity_id") or "", ""),
                        status_label=ticketing.label_of(_status_of(r)),
                        held=holding.get(r["id"], 0.0)))
                jobs.sort(key=lambda j: -j.held)
            cur = await conn.execute(
                "SELECT * FROM service_payments WHERE owner_user_id=%s"
                " ORDER BY created_at DESC, id LIMIT %s", (uid, max(1, min(_i(limit) or 60, 500))))
            rows = [_lr(r) for r in await cur.fetchall()]
            return WalletView(
                available=max(0.0, _f(acct.get("topped_up")) - people_out
                              + _f(agg.get("in_wallet")) - _f(agg.get("out_wallet"))),
                set_aside=max(0.0, _f(agg.get("to_held")) - _f(agg.get("from_held"))),
                paid_out=_f(agg.get("payout")) + _f(agg.get("fee")),
                put_in=_f(acct.get("topped_up")) + _f(agg.get("topped")),
                auto_top_up=bool(acct.get("auto_top_up")), provider=provider,
                live=ticketing.is_live(provider),
                notice="" if ticketing.is_live(provider) else ticketing.WALLET_STUB_NOTICE,
                jobs=jobs, rows=rows)

    @strawberry.field
    async def map_records(self, info: strawberry.Info) -> MapView:
        uid = _uid(info)
        async with _pool.connection() as conn:
            rows = _active(await _cards(conn, uid))
            cur = await conn.execute(
                "SELECT entity_id, label, category FROM land_features WHERE owner_user_id=%s "
                "ORDER BY sort", (uid,))
            featmap: dict = {}
            for r in await cur.fetchall():
                featmap.setdefault(r["entity_id"], []).append(r["label"])
            cur = await conn.execute(
                "SELECT record_id, person_name, pay_value FROM record_people "
                "WHERE owner_user_id=%s AND role LIKE '%%caretaker%%'", (uid,))
            watchers = {r["record_id"]: (r["person_name"], r["pay_value"])
                        for r in await cur.fetchall()}
            cur = await conn.execute(
                "SELECT record_id, count(*) AS c FROM documents WHERE owner_user_id=%s "
                "GROUP BY record_id", (uid,))
            papers = {r["record_id"]: _i(r["c"]) for r in await cur.fetchall()}
            cur = await conn.execute(
                "SELECT parcel_id, count(*) AS c FROM parcel_photos WHERE owner_user_id=%s "
                "GROUP BY parcel_id", (uid,))
            pics = {r["parcel_id"]: _i(r["c"]) for r in await cur.fetchall()}

            out = []
            for d in rows:
                ring = _ring(d.get("boundary") or "")
                lat, lon = _located(d["geo_point"], ring)
                w = watchers.get(d["id"], ("", ""))
                out.append(MapRecord(
                    id=d["id"], kind=d["kind"], title=d["title"], subtitle=d["subtitle"],
                    status=d["status"], classification=d["classification"],
                    market_value=d["market_value"], extent=d["extent"],
                    extent_unit=d["extent_unit"], khata_no=d["khata_no"],
                    owner_name=d["owner_name"], village=d["village"], lat=lat, lon=lon,
                    shape=_shape(d["shape"]),
                    ring=ring,
                    feature_chips=featmap.get(d["id"], [])[:4],
                    watcher=w[0], watcher_pay=w[1],
                    paper_count=papers.get(d["id"], 0), photo_count=pics.get(d["id"], 0)))

            counts = [
                FacetOption(key="all", label="All", count=len(out), active=True),
                FacetOption(key="parcel", label="Land",
                            count=len([r for r in out if r.kind == "parcel"]), active=False),
                FacetOption(key="property", label="Property",
                            count=len([r for r in out if r.kind == "property"]), active=False),
                FacetOption(key="disputed", label="Disputed",
                            count=len([r for r in out if r.status == "disputed"]), active=False),
            ]
            bore = len([r for r in out if any("Bore" in c for c in r.feature_chips)])
            counts.append(FacetOption(key="bore", label="Has a bore", count=bore, active=False))

            districts = sorted({r.village for r in out if r.village})
            # An insight about a pin that is no longer on the map is noise.
            cur = await conn.execute(
                "SELECT id, title, detail FROM waiting_items WHERE owner_user_id=%s "
                "AND icon='map' AND done=false AND (record_id = '' OR record_id = ANY(%s)) "
                "ORDER BY sort", (uid, [r.id for r in out]))
            insights = [MapInsight(id=r["id"], title=r["title"], detail=r["detail"])
                        for r in await cur.fetchall()]
            return MapView(area_label=" & ".join(districts[:2]) if districts else "",
                           records=out, counts=counts, insights=insights)


    # ── The desk (W17) ────────────────────────────────────────────────
    #
    # `desk`, `associates`, `candidates`, `coverage` and `deskTasks` are the
    # only resolvers in this API that read across owners. Each proves
    # `_is_admin` first, each answers None or [] rather than raising when it
    # does not, each returns one of the narrow desk types and never a
    # RecordDetail or a TicketView, and each writes one `desk_read` audit row.
    # `associate` and `associateEvents` reach the same guarded roster reader
    # with an id filter and carry the same gate and the same audit row.

    @strawberry.field
    async def desk(self, info: strawberry.Info, scope: str = "open") -> Optional[Desk]:
        """Every job waiting for somebody, and every job somebody has gone
        quiet on. The phase-1 product.

        None — not an empty desk — for anybody who is not an admin, so a
        non-admin client cannot tell an empty ops desk from one it may not see.

        Both lists are read whatever the scope, because the strip has to be
        able to say "2 nothing happening" while the operator is looking at the
        waiting list. `scope` decides which of them is drawn, not which of them
        is counted."""
        uid = _uid(info)
        # An unrecognised scope reads as "open" rather than as nothing. A
        # typo in a query string must not produce a desk that looks empty
        # while four jobs are waiting on it.
        want = (scope or "").strip()
        if want not in ("open", "silent", "stuck", "all"):
            want = "open"
        async with _pool.connection() as conn:
            if not await _is_admin(conn, uid):
                return None
            await _desk_read(conn, uid, f"desk:{want}")
            today = _today()
            waiting = await _desk_job_rows(conn, silent=False)
            quiet = await _desk_job_rows(conn, silent=True)
            rows = waiting + quiet
            places = await _place_of(conn, rows)
            held = await _held_of(conn, [r["id"] for r in rows])
            people = await _assignees_of(conn, rows)
            roster = await _roster(conn, limit=500)
            offerable = [r for r in roster
                         if (r.get("state") or "") in associates.OFFERABLE]

            def draw(row: dict, count: int) -> DeskJob:
                return _desk_job_of(
                    row, place=places.get(row["id"], ("", "")),
                    held=held.get(row["id"], 0.0),
                    assignee=people.get((row.get("assignee_ref") or "").strip()),
                    candidates=count, today=today)

            jobs = []
            stuck = 0
            for r in waiting:
                key = places.get(r["id"], ("", ""))[0]
                n = len([c for c in _candidates_from(offerable, r.get("kind") or "",
                                                     key, today) if c.get("eligible")])
                job = draw(r, n)
                stuck += 1 if job.stuck else 0
                if want in ("open", "all") or (want == "stuck" and job.stuck):
                    jobs.append(job)
            silent = ([draw(r, 0) for r in quiet] if want in ("silent", "all") else [])

            # The figures are COUNTs in the database rather than len() over the
            # lists above, so a capped page cannot make the strip understate
            # what is waiting.
            cut_age = (datetime.now() - timedelta(days=_AGEING_DAYS)).isoformat(timespec="seconds")
            cut_quiet = (datetime.now() - timedelta(days=_QUIET_DAYS)).isoformat(timespec="seconds")
            cur = await conn.execute(
                "SELECT COUNT(*) FILTER (WHERE status IN ('placed','sent')) AS unassigned,"
                " COUNT(*) FILTER (WHERE status IN ('placed','sent')"
                "   AND created_at < %s) AS ageing,"
                " COUNT(*) FILTER (WHERE status IN ('assigned','on_site','changes')"
                "   AND COALESCE(NULLIF(status_at,''), created_at) < %s) AS silent"
                " FROM work_requests WHERE closed = false", (cut_age, cut_quiet))
            fig = await cur.fetchone() or {}
            cur = await conn.execute(
                "SELECT COUNT(*) FILTER (WHERE state='active') AS active,"
                " COUNT(*) FILTER (WHERE state='invited') AS pending FROM associates")
            who = await cur.fetchone() or {}
            # Lapsed and about to lapse are one figure on the strip: both are a
            # paper somebody has to chase this week.
            cur = await conn.execute(
                "SELECT COUNT(*) AS n FROM associate_credentials WHERE review='verified'"
                " AND expires_on <> '' AND expires_on <= %s",
                ((date.today() + timedelta(days=_CRED_WARN_DAYS)).isoformat(),))
            creds = _i((await cur.fetchone() or {}).get("n"))
            cur = await conn.execute(
                "SELECT COUNT(*) AS n FROM desk_tasks WHERE state='open'")
            tasks = _i((await cur.fetchone() or {}).get("n"))

            # A place with land and nobody enrolled for ANY line of work in it.
            # Every order placed there will land on this desk, which is the
            # sentence /app/desk/coverage prints under the grid.
            cells = _coverage_cells(await _coverage_rows(conn, "mandal"), roster,
                                    await _open_by_area(conn), "mandal")
            covered: dict = {}
            for c in cells:
                covered[c["name"]] = covered.get(c["name"], 0) + c["active_count"]
            mode = await _setting(conn, "dispatch.mode", "off")
            return Desk(
                mode=mode, mode_word=_MODE_WORD.get(mode, mode), jobs=jobs,
                silent=silent, unassigned=_i(fig.get("unassigned")),
                ageing=_i(fig.get("ageing")), silent_count=_i(fig.get("silent")),
                stuck=stuck, associates_active=_i(who.get("active")),
                associates_pending=_i(who.get("pending")), credentials_expiring=creds,
                coverage_gaps=len([n for n, v in covered.items() if not v]),
                tasks_open=tasks)

    @strawberry.field
    async def associates(self, info: strawberry.Info, q: str = "",
                         discipline: str = "", area: str = "", state: str = "",
                         limit: int = 200) -> List[Associate]:
        """The roster. Admin only; [] for everybody else.

        The number is real here. This is the screen the desk opens in order to
        phone somebody, and a roster of masked numbers defeats the only reason
        to open it — every owner-facing shape carries either no number at all
        or one that has passed the four conditions on AssignedPerson."""
        uid = _uid(info)
        async with _pool.connection() as conn:
            if not await _is_admin(conn, uid):
                return []
            await _desk_read(conn, uid, "associates",
                             f"q={q} discipline={discipline} area={area} state={state}")
            today = _today()
            rows = await _roster(conn, q=q, discipline=discipline, area=area,
                                 state=state, limit=limit)
            return [_associate_of(r, today) for r in rows]

    @strawberry.field
    async def associate(self, info: strawberry.Info, id: str) -> Optional[Associate]:
        """One person, whole. None when the id is not on the roster, which is
        the same answer a non-admin gets."""
        uid = _uid(info)
        async with _pool.connection() as conn:
            if not await _is_admin(conn, uid):
                return None
            await _desk_read(conn, uid, "associate", id)
            rows = await _roster(conn, ids=[(id or "").strip()], limit=1)
            return _associate_of(rows[0], _today()) if rows else None

    @strawberry.field
    async def associate_events(self, info: strawberry.Info, id: str) -> List[AssociateEvent]:
        """Somebody's whole trail, oldest first. The file that gets read out
        when an associate asks why the work stopped."""
        uid = _uid(info)
        async with _pool.connection() as conn:
            if not await _is_admin(conn, uid):
                return []
            await _desk_read(conn, uid, "associate_events", id)
            cur = await conn.execute(
                "SELECT * FROM associate_events WHERE associate_id=%s ORDER BY at, id",
                ((id or "").strip(),))
            return [AssociateEvent(
                id=r["id"], kind=r.get("kind") or "", headline=r.get("headline") or "",
                detail=r.get("detail") or "", actor_label=r.get("actor_label") or "",
                actor_kind=r.get("actor_kind") or "", at=r.get("at") or "",
                at_label=_ddmmyyyy((r.get("at") or "")[:10]))
                for r in await cur.fetchall()]

    @strawberry.field
    async def candidates(self, info: strawberry.Info, ticket_id: str,
                         limit: int = 12) -> List[Candidate]:
        """Who could take this one job, best first, with the reasons.

        Ineligible people are returned carrying their reason rather than
        filtered out: a shortlist that quietly shrank from four names to one is
        a question the desk needs answered on the screen. The number is here
        because in phase 1 this screen IS the phone call — nothing is sent to
        anybody until offers ship."""
        uid = _uid(info)
        async with _pool.connection() as conn:
            if not await _is_admin(conn, uid):
                return []
            await _desk_read(conn, uid, "candidates", ticket_id)
            row = await _desk_ticket_row(conn, ticket_id)
            if not row:
                return []
            place = (await _place_of(conn, [row])).get(row["id"], ("", ""))
            roster = [r for r in await _roster(conn, limit=500)
                      if (r.get("state") or "") in associates.OFFERABLE]
            found = _candidates_from(roster, row.get("kind") or "", place[0], _today())
            return [Candidate(
                associate_id=c["id"], name=c["name"], initials=_initials(c["name"]),
                contact=c.get("contact") or "", discipline=c["discipline"],
                area_match=c.get("area_match") or "", open_count=_i(c.get("open_jobs")),
                capacity=_i(c.get("capacity")), accept_rate=0.0,
                last_offered_at=c.get("last_offered_at") or "", rank=_i(c.get("rank")),
                why=list(c.get("why") or []), eligible=bool(c.get("eligible")),
                why_not=list(c.get("why_not") or []),
                # Phase 1 sends no offers, so nobody has been asked and nobody
                # has said no. Both become real the moment offers ship.
                already_offered=False, already_declined=False)
                for c in found[:max(1, min(_i(limit) or 12, 50))]]

    @strawberry.field
    async def coverage(self, info: strawberry.Info,
                       level: str = "mandal") -> List[CoverageCell]:
        """Every place Pattadar holds land, against every line of work.

        A zero with a live job behind it is a service being sold in a place
        with nobody to do it. A zero with no job behind it is just a fact, and
        the two are different colours on the grid."""
        uid = _uid(info)
        async with _pool.connection() as conn:
            if not await _is_admin(conn, uid):
                return []
            await _desk_read(conn, uid, "coverage", level)
            lvl = (level or "mandal").strip()
            if lvl not in ("village", "mandal", "district"):
                lvl = "mandal"
            cells = _coverage_cells(await _coverage_rows(conn, lvl),
                                    await _roster(conn, limit=500),
                                    await _open_by_area(conn), lvl)
            return [CoverageCell(
                level=c["level"], name=c["name"], discipline=c["discipline"],
                discipline_label=c["discipline_label"], active_count=c["active_count"],
                open_jobs=c["open_jobs"], records=c["records"], risk=c["risk"])
                for c in cells]

    @strawberry.field
    async def desk_tasks(self, info: strawberry.Info, limit: int = 100) -> List[DeskTask]:
        """What the desk has to do, newest first.

        Nothing in phase 1 writes these — there is no sweeper and no timer yet
        — so this answers [] until one exists. It ships now because the desk's
        own inbox is the difference between an operator who learns about a
        lapsed licence and one who does not, and a table nothing reads is a
        table that quietly rots."""
        uid = _uid(info)
        async with _pool.connection() as conn:
            if not await _is_admin(conn, uid):
                return []
            await _desk_read(conn, uid, "desk_tasks")
            cur = await conn.execute(
                "SELECT * FROM desk_tasks WHERE state='open' ORDER BY created_at DESC,"
                " id LIMIT %s", (max(1, min(_i(limit) or 100, 500)),))
            out: List[DeskTask] = []
            for r in await cur.fetchall():
                tid = r.get("ticket_id") or ""
                aid = r.get("associate_id") or ""
                out.append(DeskTask(
                    id=r["id"], kind=r.get("kind") or "",
                    headline=r.get("headline") or "", detail=r.get("detail") or "",
                    associate_id=aid, ticket_id=tid,
                    # Decided here so the client never has to guess which of the
                    # two ids on the row is the one worth clicking.
                    to=(f"/app/desk/jobs/{tid}" if tid else
                        f"/app/desk/associates/{aid}" if aid else ""),
                    at=_ddmmyyyy((r.get("created_at") or "")[:10])))
            return out

    @strawberry.field
    async def disciplines(self, info: strawberry.Info) -> List[DisciplineInfo]:
        """The nine lines of work somebody can enrol in.

        Pure, and served to everybody. No connection is opened: the enrolment
        form needs these nine cards before a single associate exists, and a
        query that reached a database to answer a constant would be the one
        thing on that screen able to fail while the roster was still empty."""
        return [DisciplineInfo(
            key=d.key, label=d.label, blurb=_discipline_blurb(d), kinds=list(d.kinds),
            area_grain=d.grain, credential=d.credential, fanout=d.fanout)
            for d in associates.DISCIPLINES.values()]

    @strawberry.field
    async def associates_for_ticket(self, info: strawberry.Info,
                                    ticket_id: str) -> List[AssociateCard]:
        """The people the OWNER of this ticket can put on it.

        Owner-scoped, and the one associates query a non-admin may make. The
        roster query above is admin-only, so without this the owner's picker on
        their own ticket would have nothing behind it and the founder's first
        ask — see who is on my job — would only work on jobs an admin had
        assigned.

        No contact of any kind on the card. The owner gets a name, a line of
        work and a place; the number becomes theirs through AssignedPerson when
        somebody is actually on the job."""
        uid = _uid(info)
        async with _pool.connection() as conn:
            row = await _ticket_row(conn, uid, ticket_id)
            if not row:
                return []
            key, _label = (row.get("area_key") or ""), (row.get("area_label") or "")
            if not key:
                # The owner's own records, so `_cards` is free here in a way it
                # never is on the desk.
                rid = row.get("entity_id") or ""
                card = next((c for c in await _cards(conn, uid) if c["id"] == rid), {})
                key = associates.area_key_of(card)[0] if card else ""
            roster = [r for r in await _roster(conn, limit=500)
                      if (r.get("state") or "") in associates.OFFERABLE]
            found = _candidates_from(roster, row.get("kind") or "", key, _today())
            if not found:
                # A kind no discipline covers — 'other', the legacy 'errand' —
                # still needs a picker. Everybody available is a better answer
                # than an empty list the owner cannot act on.
                found = associates.rank([{
                    "id": r["id"], "name": r.get("name") or "",
                    "open_jobs": _i(r.get("open_jobs")),
                    "last_offered_at": r.get("last_offered_at") or "",
                    "eligible": _dispatch_view(r)[0]} for r in roster], _today())
            by_id = {r["id"]: r for r in roster}
            out: List[AssociateCard] = []
            for c in found:
                r = by_id.get(c["id"]) or {}
                keys = [d.get("discipline") or "" for d in r.get("disciplines") or []]
                out.append(AssociateCard(
                    id=c["id"], name=c["name"], firm=r.get("firm") or "",
                    initials=_initials(c["name"]), disciplines=keys,
                    discipline_labels=[associates.label_of(k) for k in keys],
                    areas=[_area_label(a.get("level") or "", a.get("name") or "")
                           for a in r.get("areas") or []],
                    verified=any((x.get("review") or "") == "verified"
                                 for x in r.get("credentials") or []),
                    jobs_open=_i(r.get("open_jobs")), jobs_done=_i(r.get("done_jobs")),
                    accepts_more=bool(c.get("eligible")),
                    why=list(c.get("why") or [])))
            return out


def _word(n: int) -> str:
    return {1: "ONE", 2: "TWO", 3: "THREE", 4: "FOUR"}.get(n, str(n))


def _rupees(s: str) -> float:
    """'₹1,200 / month' → 1200.0"""
    digits = "".join(ch for ch in (s or "").split("/")[0] if ch.isdigit())
    return float(digits) if digits else 0.0


def _inr_short(v: float) -> str:
    """1.40 Cr / 42.0 L / 18,400 — the Indian short forms the screens use."""
    a = abs(v)
    if a >= 1_00_00_000:
        return f"₹{v / 1_00_00_000:.2f} Cr"
    if a >= 1_00_000:
        return f"₹{v / 1_00_000:.1f} L"
    return f"₹{v:,.0f}"


def _link(r: dict) -> ShareLink:
    audience = r.get("audience") or ""
    initials = "".join(w[0] for w in audience.replace(",", " ").split()[:2] if w).upper()
    return ShareLink(
        id=r["id"], audience=audience, subject=r.get("subject") or "",
        terms=r.get("terms") or "", doc_count=_i(r.get("doc_count")),
        opened_count=_i(r.get("opened_count")), last_opened_at=r.get("last_opened_at") or "",
        expires_on=r.get("expires_on") or "",
        days_left=_days_until(r.get("expires_on") or ""), initials=initials)


async def _kit(conn, r: dict) -> SharedKit:
    cur = await conn.execute(
        "SELECT * FROM shared_kit_items WHERE kit_id=%s ORDER BY sort", (r["id"],))
    items = [KitItem(id=i["id"], title=i.get("title") or "", shelf=i.get("shelf") or "",
                     note=i.get("note") or "", verdict=i.get("verdict") or "ok")
             for i in await cur.fetchall()]
    cur = await conn.execute(
        "SELECT * FROM shared_kit_checks WHERE kit_id=%s ORDER BY sort", (r["id"],))
    checks = [KitCheck(id=c["id"], title=c.get("title") or "", note=c.get("note") or "",
                       price=_f(c.get("price"))) for c in await cur.fetchall()]
    return SharedKit(
        id=r["id"], title=r.get("title") or "", headline=r.get("headline") or "",
        kind=r.get("kind") or "parcel", purpose=r.get("purpose") or "for_sale",
        list_line=r.get("list_line") or "", sender_name=r.get("sender_name") or "",
        sender_initials=r.get("sender_initials") or "", sender_note=r.get("sender_note") or "",
        shared_at=r.get("shared_at") or "", terms=r.get("terms") or "",
        opened_count=_i(r.get("opened_count")), days_left=_i(r.get("days_left")),
        expired_on=r.get("expired_on") or "", asked_price=_f(r.get("asked_price")),
        photo_count=_i(r.get("photo_count")), feature_count=_i(r.get("feature_count")),
        state=r.get("state") or "live", items=items, checks=checks,
        checks_total=sum(c.price for c in checks))


# ── Record writes ─────────────────────────────────────────────────────

@strawberry.input
class RecordInput:
    """One form for both kinds. Every field is optional so an update can send
    only what changed — an omitted field is left alone, never blanked."""
    id: Optional[str] = None
    kind: str = "parcel"               # parcel | property (create only)
    title: Optional[str] = None        # parcel: "Sy 214/2"; property: its name
    classification: Optional[str] = None
    status: Optional[str] = None
    stake: Optional[str] = None
    khata_no: Optional[str] = None
    owner_name: Optional[str] = None
    village: Optional[str] = None      # property: locality
    mandal: Optional[str] = None       # property: city
    district: Optional[str] = None
    extent: Optional[float] = None
    extent_unit: Optional[str] = None  # ac | sq.yd | sq.ft
    market_value: Optional[float] = None
    purchase_price: Optional[float] = None


def _survey_parts(title: str) -> tuple:
    """'Sy 214/2' → ('214', '2'); 'sy. 88' → ('88', ''). The form takes the
    number the way people say it; the table stores its two columns."""
    t = (title or "").strip()
    if t.lower().startswith("sy"):
        t = t[2:].lstrip(". ").strip()
    no, _, sub = t.partition("/")
    return no.strip(), sub.strip()


def _now_iso() -> str:
    """created_at drives 'recently opened'; a bare date makes every add of the
    same day sort arbitrarily, so the time comes too."""
    return datetime.now().isoformat(timespec="seconds")


async def _record_kind(conn, uid: str, rid: str) -> str:
    """Which table a record lives in — '' when it is not this user's to touch.
    Every write below goes through this, so no id from the wire can reach a
    row the caller does not own."""
    cur = await conn.execute(
        "SELECT 1 FROM parcels p JOIN passbooks pb ON pb.id=p.passbook_id"
        " WHERE p.id=%s AND pb.owner_user_id=%s", (rid, uid))
    if await cur.fetchone():
        return "parcel"
    cur = await conn.execute(
        "SELECT 1 FROM properties WHERE id=%s AND owner_user_id=%s", (rid, uid))
    return "property" if await cur.fetchone() else ""


async def _create_record(conn, uid: str, inp: RecordInput) -> str:
    import uuid as _uuid
    rid = f"rec-{_uuid.uuid4().hex[:12]}"
    now = _now_iso()
    if inp.kind == "parcel":
        # A parcel hangs off a passbook (that is where the khata, village and
        # owner's name live). Reuse the user's matching passbook when there is
        # one; otherwise the parcel gets its own.
        khata = (inp.khata_no or "").strip()
        village = (inp.village or "").strip()
        pb_id = ""
        if khata:
            cur = await conn.execute(
                "SELECT id FROM passbooks WHERE owner_user_id=%s AND pattadar_no=%s"
                " AND village=%s LIMIT 1", (uid, khata, village))
            row = await cur.fetchone()
            pb_id = row["id"] if row else ""
        if not pb_id:
            pb_id = f"pb-{_uuid.uuid4().hex[:12]}"
            # A passbook belongs to a family group; Families & Groups sums its
            # parcels' extent by group. A passbook created without one leaves
            # the new parcel out of those totals, so it joins the default.
            await conn.execute(
                "INSERT INTO passbooks (id, owner_user_id, pattadar_no, owner_name,"
                " district, mandal, village, group_id, created_at)"
                " VALUES (%s,%s,%s,%s,%s,%s,%s, COALESCE((SELECT id FROM groups"
                " WHERE owner_user_id=%s AND type='family' ORDER BY created_at LIMIT 1), ''), %s)",
                (pb_id, uid, khata, (inp.owner_name or "").strip(),
                 (inp.district or "").strip(), (inp.mandal or "").strip(), village, uid, now))
        no, sub = _survey_parts(inp.title or "")
        await conn.execute(
            "INSERT INTO parcels (id, passbook_id, survey_no, subdivision, extent,"
            " classification, status, stake, market_value, purchase_price, created_at)"
            " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (rid, pb_id, no, sub, _f(inp.extent), inp.classification or "agri",
             inp.status or "owned", inp.stake or "owned",
             _f(inp.market_value), _f(inp.purchase_price), now))
        return rid
    built = (inp.extent_unit or ("sq.ft" if (inp.classification or "flat")
                                 in ("flat", "shop") else "sq.yd")) == "sq.ft"
    await conn.execute(
        "INSERT INTO properties (id, owner_user_id, type, label, locality, city,"
        " district, khata_no, owner_name, holding_status, stake, land_area,"
        " builtup_area, market_value, current_value, purchase_price, created_at)"
        " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (rid, uid, inp.classification or "flat", (inp.title or "Property").strip(),
         (inp.village or "").strip(), (inp.mandal or "").strip(),
         (inp.district or "").strip(), (inp.khata_no or "").strip(),
         (inp.owner_name or "").strip(), inp.status or "owned", inp.stake or "owned",
         0.0 if built else _f(inp.extent), _f(inp.extent) if built else 0.0,
         _f(inp.market_value), _f(inp.market_value), _f(inp.purchase_price), now))
    return rid


# Which RecordInput field maps to which column, and what to call it in the
# audit trail. Anything on a record can be corrected — a survey number typed
# wrong, a village that was always spelled another way — so the guard is not
# to forbid the edit but to keep what it was.
_AUDITED: tuple = (
    ("title", "Survey number / name"),
    ("classification", "Classification"),
    ("status", "Status"),
    ("stake", "Your stake"),
    ("khata_no", "Khata no"),
    ("owner_name", "Owner's name"),
    ("village", "Village"),
    ("mandal", "Mandal"),
    ("district", "District"),
    ("extent", "Extent"),
    ("extent_unit", "Extent unit"),
    ("market_value", "Market value"),
    ("purchase_price", "What was paid"),
)


async def _record_snapshot(conn, uid: str, rid: str) -> dict:
    """The record as it stands, keyed the way RecordInput is.

    Read before a write so the audit line can say what the value WAS. A trail
    that only records the new value cannot answer the question people actually
    ask, which is what it used to say."""
    for r in await _cards(conn, uid):
        if r["id"] == rid:
            return {
                "title": r.get("title") or "", "classification": r.get("classification") or "",
                "status": r.get("status") or "", "stake": r.get("stake") or "",
                "khata_no": r.get("khataNo") or r.get("khata_no") or "",
                "owner_name": r.get("ownerName") or r.get("owner_name") or "",
                "village": r.get("village") or "", "mandal": r.get("mandal") or "",
                "district": r.get("district") or "",
                "extent": r.get("extent") or 0, "extent_unit": r.get("extentUnit") or r.get("extent_unit") or "",
                "market_value": r.get("marketValue") or r.get("market_value") or 0,
                "purchase_price": 0,
            }
    return {}


async def _log_corrections(conn, uid: str, rid: str, before: dict, inp: RecordInput) -> None:
    """One audit line per field that actually moved.

    Sending a field unchanged is not a correction and must not fill the trail
    with noise, so equal values are skipped."""
    now = _now_iso()
    import uuid as _uuid
    for field, label in _AUDITED:
        new = getattr(inp, field, None)
        if new is None:
            continue
        old = before.get(field, "")
        if isinstance(new, (int, float)) or isinstance(old, (int, float)):
            same = abs(_f(old) - _f(new)) < 0.005
        else:
            same = str(old).strip() == str(new).strip()
        if same:
            continue
        await conn.execute(
            "INSERT INTO audit_events (id, actor, action, target, details, timestamp)"
            " VALUES (%s,%s,'record.corrected',%s,%s,%s)",
            (f"ae-{_uuid.uuid4().hex[:12]}", uid, rid,
             json.dumps({"field": label,
                         "from": str(old).strip(),
                         "to": str(new).strip()}), now))


async def _update_record(conn, uid: str, inp: RecordInput) -> str:
    import uuid as _uuid
    rid = inp.id or ""
    # Read first: after the UPDATE the old values are gone, and the trail is
    # the only place they survive.
    before = await _record_snapshot(conn, uid, rid)
    cur = await conn.execute(
        "SELECT p.id, p.passbook_id FROM parcels p JOIN passbooks pb ON pb.id=p.passbook_id"
        " WHERE p.id=%s AND pb.owner_user_id=%s", (rid, uid))
    par = await cur.fetchone()
    if par:
        sets: List[str] = []
        args: List = []
        if inp.title is not None:
            no, sub = _survey_parts(inp.title)
            sets += ["survey_no=%s", "subdivision=%s"]
            args += [no, sub]
        for col, val in (("classification", inp.classification), ("status", inp.status),
                         ("stake", inp.stake)):
            if val is not None:
                sets.append(f"{col}=%s")
                args.append(val)
        for col, num in (("extent", inp.extent), ("market_value", inp.market_value),
                         ("purchase_price", inp.purchase_price)):
            if num is not None:
                sets.append(f"{col}=%s")
                args.append(_f(num))
        if sets:
            await conn.execute(
                f"UPDATE parcels SET {', '.join(sets)} WHERE id=%s", (*args, rid))
        # Khata, owner and place live on the passbook — and a passbook can
        # stand behind several parcels. Editing one parcel must not silently
        # move its siblings, so a shared passbook is split before it changes.
        pb_sets: List[str] = []
        pb_args: List = []
        for col, val in (("pattadar_no", inp.khata_no), ("owner_name", inp.owner_name),
                         ("village", inp.village), ("mandal", inp.mandal),
                         ("district", inp.district)):
            if val is not None:
                pb_sets.append(f"{col}=%s")
                pb_args.append(val.strip())
        if pb_sets:
            pb_id = par["passbook_id"]
            cur = await conn.execute(
                "SELECT count(*) AS c FROM parcels WHERE passbook_id=%s", (pb_id,))
            if _i((await cur.fetchone() or {}).get("c")) > 1:
                new_id = f"pb-{_uuid.uuid4().hex[:12]}"
                # The clone must carry EVERY column the original had. Leaving
                # group_id behind dropped the parcel out of its family group's
                # acreage; leaving `photo` behind lost the scanned passbook.
                await conn.execute(
                    "INSERT INTO passbooks (id, owner_user_id, pattadar_no, owner_name,"
                    " father_husband_name, state, district, mandal, village, group_id,"
                    " photo, created_at)"
                    " SELECT %s, owner_user_id, pattadar_no, owner_name,"
                    " father_husband_name, state, district, mandal, village, group_id,"
                    " photo, created_at"
                    " FROM passbooks WHERE id=%s", (new_id, pb_id))
                await conn.execute(
                    "UPDATE parcels SET passbook_id=%s WHERE id=%s", (new_id, rid))
                pb_id = new_id
            await conn.execute(
                f"UPDATE passbooks SET {', '.join(pb_sets)} WHERE id=%s", (*pb_args, pb_id))
        await _log_corrections(conn, uid, rid, before, inp)
        return rid

    cur = await conn.execute(
        "SELECT id, builtup_area FROM properties WHERE id=%s AND owner_user_id=%s",
        (rid, uid))
    prop = await cur.fetchone()
    if not prop:
        raise ValueError("record not found")
    sets, args = [], []
    if inp.title is not None:
        sets.append("label=%s")
        args.append(inp.title.strip())
    for col, val in (("type", inp.classification), ("holding_status", inp.status),
                     ("stake", inp.stake), ("khata_no", inp.khata_no),
                     ("owner_name", inp.owner_name), ("locality", inp.village),
                     ("city", inp.mandal), ("district", inp.district)):
        if val is not None:
            sets.append(f"{col}=%s")
            args.append(val.strip())
    if inp.extent is not None:
        built = (inp.extent_unit or ("sq.ft" if _f(prop.get("builtup_area"))
                                     else "sq.yd")) == "sq.ft"
        if built:
            sets.append("builtup_area=%s")
            args.append(_f(inp.extent))
        else:
            # Measured in yards now — it is a plot, so the built-up figure
            # (which would otherwise win the card's extent) goes with it.
            sets += ["land_area=%s", "builtup_area=0"]
            args.append(_f(inp.extent))
    if inp.market_value is not None:
        # current_value shadows market_value in the card read; keep them one.
        sets += ["market_value=%s", "current_value=%s"]
        args += [_f(inp.market_value), _f(inp.market_value)]
    if inp.purchase_price is not None:
        sets.append("purchase_price=%s")
        args.append(_f(inp.purchase_price))
    if sets:
        await conn.execute(
            f"UPDATE properties SET {', '.join(sets)} WHERE id=%s", (*args, rid))
    await _log_corrections(conn, uid, rid, before, inp)
    return rid


# ── Mutation namespace ────────────────────────────────────────────────

@strawberry.type
class WebMutation:

    @strawberry.mutation
    async def save_record(self, info: strawberry.Info, input: RecordInput) -> str:
        """Create (no id) or partially update (with id) one record. Returns
        the record's id either way."""
        uid = _uid(info)
        async with _pool.connection() as conn:
            if input.id:
                return await _update_record(conn, uid, input)
            return await _create_record(conn, uid, input)

    @strawberry.mutation
    async def delete_records(self, info: strawberry.Info, ids: List[str]) -> int:
        """Delete records and everything filed under them — papers (with their
        versions and live links), photos, features, people, money rows, notes,
        tags, open orders. The passbook behind a parcel is left alone: the
        legacy Passbooks screen still owns it."""
        uid = _uid(info)
        n = 0
        async with _pool.connection() as conn:
            cur = await conn.execute("SELECT to_regclass('demo_stamp') AS t")
            has_stamp = bool((await cur.fetchone() or {}).get("t"))
            for rid in ids:
                kind = await _record_kind(conn, uid, rid)
                if not kind:
                    continue
                # A paper reaches a record by whichever key filed it: the web
                # 360 writes record_id, while the mobile upload path and the
                # vault backfill write parcel_id / property_id and leave
                # record_id empty. Matching only record_id orphaned every
                # paper a built property had ever been sent.
                own_key = "parcel_id" if kind == "parcel" else "property_id"
                cur = await conn.execute(
                    f"SELECT id, reading_id FROM documents WHERE owner_user_id=%s"
                    f" AND (record_id=%s OR {own_key}=%s)", (uid, rid, rid))
                docs = await cur.fetchall()
                doc_ids = [r["id"] for r in docs]
                # The reading behind a paper must go too. init_db's vault
                # backfill re-creates a document row for every reading that
                # has none, so a deleted deed came back at the next restart.
                reading_ids = [r["reading_id"] for r in docs if r.get("reading_id")]
                if reading_ids:
                    await conn.execute(
                        "DELETE FROM registered_documents WHERE owner_user_id=%s"
                        " AND id = ANY(%s)", (uid, reading_ids))
                await conn.execute(
                    f"DELETE FROM registered_documents WHERE owner_user_id=%s"
                    f" AND {own_key}=%s", (uid, rid))
                if doc_ids:
                    await conn.execute(
                        "DELETE FROM share_links WHERE document_id = ANY(%s)", (doc_ids,))
                    await conn.execute(
                        "DELETE FROM document_versions WHERE document_id = ANY(%s)", (doc_ids,))
                    await conn.execute(
                        "DELETE FROM record_tags WHERE entity_id = ANY(%s)", (doc_ids,))
                    await conn.execute(
                        "DELETE FROM documents WHERE id = ANY(%s)", (doc_ids,))
                ptable, pkey = _photo_table(kind), _photo_key(kind)
                cur = await conn.execute(f"SELECT id FROM {ptable} WHERE {pkey}=%s", (rid,))
                photo_ids = [r["id"] for r in await cur.fetchall()]
                if photo_ids:
                    await conn.execute(
                        "DELETE FROM record_tags WHERE entity_id = ANY(%s)", (photo_ids,))
                    await conn.execute(f"DELETE FROM {ptable} WHERE {pkey}=%s", (rid,))
                # A ticket's children key off the ticket, not off the record,
                # so the sweep below cannot reach them.
                cur = await conn.execute(
                    "SELECT id FROM work_requests WHERE entity_id=%s AND owner_user_id=%s",
                    (rid, uid))
                wr = [r["id"] for r in await cur.fetchall()]
                if wr:
                    for t in ("ticket_events", "ticket_deliverables", "ticket_dispatches"):
                        await conn.execute(f"DELETE FROM {t} WHERE ticket_id = ANY(%s)", (wr,))
                    # The ledger is NOT deleted. Money that moved is a fact
                    # about the account, not about the record, and deleting a
                    # record must not destroy the record of 2,900 rupees
                    # leaving it.
                    await conn.execute(
                        "UPDATE service_payments SET note = CASE WHEN note='' THEN"
                        " 'record deleted' ELSE note END WHERE ticket_id = ANY(%s)"
                        " AND owner_user_id=%s", (wr, uid))
                for table, col in (
                    ("record_tags", "entity_id"), ("boundary_marks", "record_id"),
                    ("record_people", "record_id"), ("people_payments", "record_id"),
                    ("purchase_lots", "record_id"), ("capital_costs", "record_id"),
                    ("waiting_items", "record_id"), ("land_features", "entity_id"),
                    ("land_expenses", "entity_id"), ("notes", "entity_id"),
                    ("work_requests", "entity_id"),
                ):
                    await conn.execute(f"DELETE FROM {table} WHERE {col}=%s", (rid,))
                if has_stamp:
                    await conn.execute("DELETE FROM demo_stamp WHERE record_id=%s", (rid,))
                await conn.execute(
                    f"DELETE FROM {'parcels' if kind == 'parcel' else 'properties'}"
                    " WHERE id=%s", (rid,))
                n += 1
        return n

    @strawberry.mutation
    async def archive_records(self, info: strawberry.Info, ids: List[str],
                              archived: bool = True) -> int:
        uid = _uid(info)
        n = 0
        async with _pool.connection() as conn:
            for rid in ids:
                kind = await _record_kind(conn, uid, rid)
                if not kind:
                    continue
                await conn.execute(
                    f"UPDATE {'parcels' if kind == 'parcel' else 'properties'}"
                    " SET archived=%s WHERE id=%s", (archived, rid))
                n += 1
        return n

    @strawberry.mutation
    async def tag_records(self, info: strawberry.Info, ids: List[str], tag: str) -> int:
        """One tag onto many records — the bulk bar's 'Tag…'."""
        uid = _uid(info)
        word = (tag or "").strip()
        if not word:
            return 0
        n = 0
        async with _pool.connection() as conn:
            for rid in ids:
                if not await _record_kind(conn, uid, rid):
                    continue
                await conn.execute(
                    "INSERT INTO record_tags (id, owner_user_id, entity_type, entity_id,"
                    " tag, created_at) VALUES (%s,%s,'record',%s,%s, to_char(now(),'YYYY-MM-DD'))"
                    " ON CONFLICT (owner_user_id, entity_type, entity_id, tag) DO NOTHING",
                    (f"tag-{uid}-{rid}-{word}"[:64], uid, rid, word))
                n += 1
        return n

    @strawberry.mutation
    async def order_service(self, info: strawberry.Info, record_ids: List[str],
                            kind: str = "ec", note: str = "",
                            params: str = "", attachment_manifest: str = "{}",
                            idempotency_key: str = "") -> int:
        """Place one service order per record — the bulk bar's 'Order EC ×N',
        and the Features page's 'Ask for a check'. The orders land in
        work_requests, so Services and Assigned pick them up like any other.

        An unknown kind is refused rather than filed. The six below are the
        services this system actually sells; anything else produced an order
        with a made-up title, no price, and a note claiming it came from a
        screen the caller was never on."""
        uid = _uid(info)
        import uuid as _uuid
        offer = SERVICE_CATALOGUE.get(kind)
        if not offer:
            return 0
        title, price = offer["label"], offer["price"]
        # Answers the customer gave, kept as they were given. A required
        # question left blank is refused here rather than reaching a caretaker
        # who then has to ring back and ask.
        try:
            answers = json.loads(params) if params.strip() else {}
        except ValueError:
            return 0
        if not isinstance(answers, dict):
            return 0
        for (name, _lb, _ty, required, _opts, _h) in offer["fields"]:
            if required and not str(answers.get(name, "")).strip():
                return 0
        due_days = _i(offer.get("days")) or 7
        due = (date.today() + timedelta(days=due_days)).strftime("%d/%m/%Y")
        share = _payee_share()
        n = 0
        async with _ticket_transaction() as conn:
            request_hash = hashlib.sha256(json.dumps(
                [record_ids, kind, note, answers, attachment_manifest], sort_keys=True).encode()).hexdigest()
            if idempotency_key:
                if len(idempotency_key) > 128:
                    return 0
                inserted = await (await conn.execute(
                    "INSERT INTO service_order_intents (owner_user_id,intent_key,request_hash) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING RETURNING intent_key",
                    (uid, idempotency_key, request_hash))).fetchone()
                if not inserted:
                    prior = await (await conn.execute(
                        "SELECT request_hash,order_count FROM service_order_intents WHERE owner_user_id=%s AND intent_key=%s FOR UPDATE",
                        (uid, idempotency_key))).fetchone()
                    return prior["order_count"] if prior and prior["request_hash"] == request_hash else 0
            from .capabilities import object_of, snapshot
            # Validate every selection before creating any orders in this batch.
            manifests = {}
            for rid in dict.fromkeys(record_ids):
                if await _record_kind(conn, uid, rid):
                    try:
                        manifests[rid] = await snapshot(conn, uid, rid, object_of(attachment_manifest))
                    except ValueError:
                        return 0
            # Where each of these jobs is, stamped onto the ticket at order
            # time. One owner-scoped read of the caller's own records, outside
            # the loop — the same `_cards` shape `dispatch_ticket` and
            # `accept_ticket` already use, and the exact shape
            # `associates.area_key_of` normalises both record types from.
            #
            # Stamped rather than joined later because the desk and the
            # dispatcher are cross-owner: neither can call `_cards(conn, owner)`
            # for somebody else's records to find out where a job is.
            cards = {c["id"]: c for c in await _cards(conn, uid)}
            for rid in record_ids:
                if not await _record_kind(conn, uid, rid):
                    continue
                # `quoted` freezes the price on the day it was agreed, which is
                # the number a dispute is about; `cost` is left free to follow a
                # settlement so the Services list stops quoting a figure nobody
                # paid. The split is written now for the same reason: changing
                # it later must not rewrite an old job's economics.
                tid = f"wr-{_uuid.uuid4().hex[:12]}"
                # A record with no card behind it stamps nothing rather than a
                # hollow 'p|||' key: an empty key is a row the desk repairs on
                # read, and a hollow one is a place that matches nobody, ever.
                card = cards.get(rid) or {}
                area_key, area_label = associates.area_key_of(card) if card else ("", "")
                await conn.execute(
                    "INSERT INTO work_requests (id, owner_user_id, kind, title,"
                    " entity_type, entity_id, assignee, cost, stage, needs_you, note,"
                    " due_date, closed, created_at, params, status, status_at, quoted,"
                    " payee_share, area_key, area_label)"
                    " VALUES (%s,%s,%s,%s,'record',%s,'',%s,0,false,%s,%s,false,%s,%s,"
                    " 'placed',%s,%s,%s,%s,%s)",
                    (tid, uid, kind, title, rid,
                     price,
                     note or "Ordered from the properties list", due, _now_iso(),
                     json.dumps({**answers, "attachment_manifest": manifests[rid]}), _now_iso(), price, share,
                     area_key, area_label))
                await _event(conn, uid, tid, kind="status", action="place",
                             to_status="placed",
                             headline=ticketing.event_headline(
                                 "status", "place", {"actor_label": "You"}),
                             detail=f"Ordered from {rid}")
                n += 1
            if idempotency_key:
                await conn.execute("UPDATE service_order_intents SET order_count=%s WHERE owner_user_id=%s AND intent_key=%s",
                                   (n, uid, idempotency_key))
        return n

    @strawberry.mutation
    async def set_pin(self, info: strawberry.Info, record_id: str,
                      lat: float, lon: float) -> bool:
        """Move the record's pin to where the owner says the land is.

        The reason this exists: a pin can be wrong by 200 km — filed from a
        phone standing somewhere else, or stamped by a demo seeder — and until
        now the screen that shows the mistake had no way to correct it. W04's
        "Move the pin" was a button with no handler.

        Ownership is enforced by the UPDATE's own WHERE clause rather than a
        prior SELECT, so a record belonging to someone else simply matches no
        row. Parcels hang off a passbook; properties are owned directly."""
        uid = _uid(info)
        if not (math.isfinite(lat) and math.isfinite(lon)):
            return False
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            return False
        geo = f"{lat:.6f},{lon:.6f}"
        async with _pool.connection() as conn:
            cur = await conn.execute(
                "UPDATE parcels SET geo_point=%s WHERE id=%s AND passbook_id IN "
                "(SELECT id FROM passbooks WHERE owner_user_id=%s)",
                (geo, record_id, uid))
            if cur.rowcount:
                await _audit(conn, uid, "set_pin", record_id, f"Moved the pin to {geo}")
                return True
            cur = await conn.execute(
                "UPDATE properties SET geo_point=%s WHERE id=%s AND owner_user_id=%s",
                (geo, record_id, uid))
            if cur.rowcount:
                await _audit(conn, uid, "set_pin", record_id, f"Moved the pin to {geo}")
            return bool(cur.rowcount)

    @strawberry.mutation
    async def set_boundary(self, info: strawberry.Info, record_id: str,
                           ring: List[float]) -> bool:
        """Save a boundary the owner drew, or one read out of their own KML.

        `ring` is flat [lat, lon, lat, lon, …] and is stored the way
        parcels.boundary has always stored it — "lat,lon;lat,lon" — so the
        column that the iOS survey path already writes is the same column read
        back here. An empty list clears it, which is how a wrong outline is
        withdrawn rather than argued with.

        Refuses anything that is not land: fewer than three corners encloses
        nothing, and (0, 0) is the Gulf of Guinea, which is what an unfilled
        coordinate serialises to."""
        uid = _uid(info)
        pts = list(ring or [])
        if len(pts) % 2:
            return False
        corners = [(pts[i], pts[i + 1]) for i in range(0, len(pts), 2)]
        # A boundary is stored OPEN. Files store rings closed (RFC 7946 says a
        # polygon must repeat its first corner), and a closed ring arriving
        # here produced a phantom last corner and a side 0 m long on screen.
        # Caught at the door so no caller can reintroduce it.
        while len(corners) > 1 and corners[0] == corners[-1]:
            corners.pop()
        # Two corners in the same place carry no edge either.
        corners = [c for i, c in enumerate(corners) if i == 0 or c != corners[i - 1]]
        if corners:
            if len(corners) < 3:
                return False
            for lat, lon in corners:
                if not (math.isfinite(lat) and math.isfinite(lon)):
                    return False
                if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                    return False
                if lat == 0 and lon == 0:
                    return False
        text = ";".join(f"{lat:.6f},{lon:.6f}" for lat, lon in corners)
        async with _pool.connection() as conn:
            _bmsg = f"Set a boundary · {len(corners)} corners" if corners else "Cleared the boundary"
            cur = await conn.execute(
                "UPDATE parcels SET boundary=%s WHERE id=%s AND passbook_id IN "
                "(SELECT id FROM passbooks WHERE owner_user_id=%s)",
                (text, record_id, uid))
            if cur.rowcount:
                await _audit(conn, uid, "set_boundary", record_id, _bmsg)
                return True
            cur = await conn.execute(
                "UPDATE properties SET boundary=%s WHERE id=%s AND owner_user_id=%s",
                (text, record_id, uid))
            if cur.rowcount:
                await _audit(conn, uid, "set_boundary", record_id, _bmsg)
            return bool(cur.rowcount)

    @strawberry.mutation
    async def set_tag(self, info: strawberry.Info, entity_type: str, entity_id: str,
                      tag: str, on: bool = True) -> bool:
        uid = _uid(info)
        async with _pool.connection() as conn:
            if on:
                await conn.execute(
                    "INSERT INTO record_tags (id, owner_user_id, entity_type, entity_id, tag, created_at) "
                    "VALUES (%s,%s,%s,%s,%s, to_char(now(),'YYYY-MM-DD')) "
                    "ON CONFLICT (owner_user_id, entity_type, entity_id, tag) DO NOTHING",
                    (f"tag-{uid}-{entity_id}-{tag}"[:64], uid, entity_type, entity_id, tag))
            else:
                await conn.execute(
                    "DELETE FROM record_tags WHERE owner_user_id=%s AND entity_type=%s "
                    "AND entity_id=%s AND tag=%s", (uid, entity_type, entity_id, tag))
        return True

    @strawberry.mutation
    async def save_expense(
        self, info: strawberry.Info, record_id: str, title: str, amount: float,
        spent_on: str, kind: str = "running", category: str = "other",
        paid_by: str = "", on_label: str = "", feature_id: str = "",
        recoverable: bool = False, fiscal_year: str = "2026-27",
    ) -> str:
        uid = _uid(info)
        import uuid as _uuid
        eid = f"exp-{_uuid.uuid4().hex[:12]}"
        async with _pool.connection() as conn:
            await conn.execute(
                "INSERT INTO land_expenses (id, owner_user_id, entity_type, entity_id, category,"
                " title, amount, spent_on, vendor, note, created_at, kind, subtitle, on_label,"
                " on_icon, feature_id, paid_by, recoverable, recoverable_note, has_receipt, fiscal_year)"
                " VALUES (%s,%s,'record',%s,%s,%s,%s,%s,'','', to_char(now(),'YYYY-MM-DD'),"
                " %s,'',%s,'',%s,%s,%s,'',false,%s)",
                (eid, uid, record_id, category, title, amount, spent_on, kind,
                 on_label, feature_id, paid_by, recoverable, fiscal_year))
            await _audit(conn, uid, "add_expense", record_id, f"Recorded a cost: {title}")
        return eid

    @strawberry.mutation
    async def update_caption(self, info: strawberry.Info, photo_id: str, caption: str) -> bool:
        uid = _uid(info)
        async with _pool.connection() as conn:
            await conn.execute(
                "UPDATE parcel_photos SET caption=%s WHERE id=%s AND owner_user_id=%s",
                (caption, photo_id, uid))
        return True

    @strawberry.mutation
    async def accept_mark_position(self, info: strawberry.Info, mark_id: str) -> bool:
        """Confirm a moved mark. The position it moved FROM is kept in
        prev_lat/prev_lon — W04 promises nothing is overwritten."""
        uid = _uid(info)
        async with _pool.connection() as conn:
            await conn.execute(
                "UPDATE boundary_marks SET state='confirmed' WHERE id=%s AND owner_user_id=%s",
                (mark_id, uid))
        return True

    @strawberry.mutation
    async def move_mark(self, info: strawberry.Info, mark_id: str, lat: float, lon: float) -> bool:
        uid = _uid(info)
        async with _pool.connection() as conn:
            await conn.execute(
                "UPDATE boundary_marks SET prev_lat=lat, prev_lon=lon, lat=%s, lon=%s, "
                "state='moved' WHERE id=%s AND owner_user_id=%s", (lat, lon, mark_id, uid))
        return True

    @strawberry.mutation
    async def add_mark(self, info: strawberry.Info, record_id: str,
                       label: str, lat: float, lon: float, detail: str = "") -> str:
        """Put a new stone on the record. Returns its id, or "" if refused.

        The seq continues from whatever is already there rather than counting
        the live rows: a deleted mark keeps its number in History, and reusing
        it would make two different stones share a name."""
        uid = _uid(info)
        if not (math.isfinite(lat) and math.isfinite(lon)):
            return ""
        if not (-90 <= lat <= 90 and -180 <= lon <= 180) or (lat == 0 and lon == 0):
            return ""
        import uuid as _uuid
        async with _pool.connection() as conn:
            # The record has to be the caller's before anything is written.
            if not await _record_kind(conn, uid, record_id):
                return ""
            cur = await conn.execute(
                "SELECT coalesce(max(seq), 0) AS n FROM boundary_marks "
                "WHERE record_id=%s AND owner_user_id=%s", (record_id, uid))
            seq = _i((await cur.fetchone() or {}).get("n")) + 1
            mid = f"bm-{_uuid.uuid4().hex[:12]}"
            await conn.execute(
                "INSERT INTO boundary_marks (id, owner_user_id, record_id, seq, label, state,"
                " detail, lat, lon, prev_lat, prev_lon, photo_count, noted_on)"
                " VALUES (%s,%s,%s,%s,%s,'confirmed',%s,%s,%s,0,0,0,"
                " to_char(now(),'DD/MM/YYYY'))",
                (mid, uid, record_id, seq, (label or f"Mark {seq}").strip()[:80],
                 (detail or "added here").strip()[:200], lat, lon))
            return mid

    @strawberry.mutation
    async def update_mark(self, info: strawberry.Info, mark_id: str,
                          label: str, detail: str) -> bool:
        """Rename a mark, or say what it is.

        There was no way to do this at all: a mark could be added, moved,
        accepted and deleted, but never named — so every mark added by hand
        stayed "Mark 3" forever, and a stone is not identified by its number.
        The label is what someone standing at it would call it."""
        uid = _uid(info)
        name = (label or "").strip()[:80]
        if not name:
            return False                    # a nameless mark is what we are fixing
        async with _pool.connection() as conn:
            cur = await conn.execute(
                "UPDATE boundary_marks SET label=%s, detail=%s "
                "WHERE id=%s AND owner_user_id=%s",
                (name, (detail or "").strip()[:200], mark_id, uid))
            return bool(cur.rowcount)

    @strawberry.mutation
    async def marks_from_boundary(self, info: strawberry.Info, record_id: str) -> int:
        """Put a mark on every corner of the saved boundary. Returns how many.

        A KML from a surveyor already names the corners — that is what its
        coordinate list IS — so making the owner click thirteen of them back in
        by hand is asking for work the file already did. Refuses when the
        record already has marks rather than doubling them up."""
        uid = _uid(info)
        import uuid as _uuid
        async with _pool.connection() as conn:
            kind = await _record_kind(conn, uid, record_id)
            if not kind:
                return 0
            cur = await conn.execute(
                "SELECT count(*) AS n FROM boundary_marks "
                "WHERE record_id=%s AND owner_user_id=%s AND state <> 'deleted'",
                (record_id, uid))
            if _i((await cur.fetchone() or {}).get("n")):
                return 0                    # already has marks; never duplicate
            table = "parcels" if kind == "parcel" else "properties"
            cur = await conn.execute(
                f"SELECT boundary FROM {table} WHERE id=%s", (record_id,))
            ring = _ring((await cur.fetchone() or {}).get("boundary") or "")
            corners = [(ring[i], ring[i + 1]) for i in range(0, len(ring) - 1, 2)]
            if len(corners) < 3:
                return 0
            for i, (lat, lon) in enumerate(corners):
                await conn.execute(
                    "INSERT INTO boundary_marks (id, owner_user_id, record_id, seq, label,"
                    " state, detail, lat, lon, prev_lat, prev_lon, photo_count, noted_on)"
                    " VALUES (%s,%s,%s,%s,%s,'confirmed',%s,%s,%s,0,0,0,"
                    " to_char(now(),'DD/MM/YYYY'))",
                    (f"bm-{_uuid.uuid4().hex[:12]}", uid, record_id, i + 1,
                     f"Corner {_corner_label(i)}", "from the boundary on file", lat, lon))
            return len(corners)

    @strawberry.mutation
    async def delete_mark(self, info: strawberry.Info, mark_id: str) -> bool:
        uid = _uid(info)
        async with _pool.connection() as conn:
            await conn.execute(
                "UPDATE boundary_marks SET state='deleted' WHERE id=%s AND owner_user_id=%s",
                (mark_id, uid))
        return True

    @strawberry.mutation
    async def revoke_share_link(self, info: strawberry.Info, link_id: str) -> bool:
        uid = _uid(info)
        async with _pool.connection() as conn:
            await conn.execute(
                "UPDATE share_links SET revoked=true WHERE id=%s AND owner_user_id=%s",
                (link_id, uid))
        return True

    @strawberry.mutation
    async def extend_share_link(self, info: strawberry.Info, link_id: str, days: int = 7) -> bool:
        uid = _uid(info)
        async with _ticket_transaction() as conn:
            row = await (await conn.execute(
                "SELECT expires_on FROM share_links WHERE id=%s AND owner_user_id=%s AND revoked=false FOR UPDATE",
                (link_id, uid))).fetchone()
            if not row:
                return False
            try:
                previous = datetime.strptime(row["expires_on"], "%d/%m/%Y").date()
            except ValueError:
                previous = date.today()
            expiry = max(date.today(), previous) + timedelta(days=max(1, min(days, 365)))
            await conn.execute("UPDATE share_links SET expires_on=%s WHERE id=%s AND owner_user_id=%s",
                               (expiry.strftime("%d/%m/%Y"), link_id, uid))
            return True

    @strawberry.mutation
    async def dismiss_waiting(self, info: strawberry.Info, id: str) -> bool:
        uid = _uid(info)
        async with _pool.connection() as conn:
            await conn.execute(
                "UPDATE waiting_items SET done=true WHERE id=%s AND owner_user_id=%s", (id, uid))
        return True

    @strawberry.mutation
    async def add_photo(
        self, info: strawberry.Info, record_id: str, file_ref: str,
        file_name: str = "", caption: str = "", category: str = "",
        media_kind: str = "photo", width: int = 0, height: int = 0,
        sha256: str = "", captured_at: str = "",
    ) -> str:
        """Files an already-uploaded photo against a record. The bytes go to
        the storage gateway first; file_ref is the node id that comes back, and
        without one there is nothing to render, so an empty ref is refused.

        Everything this cannot honestly know stays empty: no coordinates, no
        device-clock check, no verification. A browser upload has no on-site
        proof, and the gallery's 'uploaded, location unproven' legend is
        already written for exactly this case."""
        uid = _uid(info)
        if not file_ref.strip():
            return ""
        import uuid as _uuid
        async with _pool.connection() as conn:
            kind = await _record_kind(conn, uid, record_id)
            if not kind:
                return ""
            table, key = _photo_table(kind), _photo_key(kind)
            # Append. The strip reads ORDER BY sort, so taking the front would
            # displace the seeded first photo the screen tests pin on.
            cur = await conn.execute(
                f"SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM {table} WHERE {key}=%s",
                (record_id,))
            sort = (await cur.fetchone() or {}).get("s", 1)
            # 'ph-' and not 'w360-'/'demo-': the seed scripts purge their own
            # prefixes, and a real upload must survive a reseed.
            pid = f"ph-{_uuid.uuid4().hex[:12]}"
            # No timezone suffix: the client sends its own wall clock and this
            # server cannot vouch for either. stamp() only slices the date off
            # the front, so both shapes render the same.
            when = captured_at.strip() or datetime.now().strftime("%Y-%m-%d %H:%M")
            await conn.execute(
                f"INSERT INTO {table} (id, {key}, owner_user_id, file_ref, category,"
                " caption, latitude, longitude, captured_at, captured_by, is_cover, created_at,"
                " source, sha256, order_ref, verified, feature_id, accuracy_m, device_clock_ok,"
                " pin_distance_m, media_kind, width, height, file_name, local_time, sort)"
                " VALUES (%s,%s,%s,%s,%s,%s,0,0,%s,%s,false,%s,'upload',%s,'',false,'',0,"
                " false,0,%s,%s,%s,%s,'',%s)",
                # captured_by stays empty on purpose: the gallery renders it as
                # "<name> · Pattadar caretaker, ID verified" and counts it as
                # proof. The account that filed a photo is not the person who
                # stood in the field, and saying so would be a lie.
                (pid, record_id, uid, file_ref.strip(), (category or "general"),
                 caption, when, "", _now_iso(), sha256,
                 (media_kind or "photo"), width, height, file_name, sort))
            await _audit(conn, uid, "add_photo", record_id,
                         f"Added a {media_kind or 'photo'}" + (f": {file_name}" if file_name else ""))
        return pid

    @strawberry.mutation
    async def add_paper(
        self, info: strawberry.Info, record_id: str, file_ref: str,
        name: str = "", subtitle: str = "", shelf: str = "",
        page_count: int = 0, mime_type: str = "", size_bytes: int = 0,
    ) -> str:
        """Files an already-uploaded document against a record. Same two-step
        as a photo: bytes to the storage gateway, then this row pointing at the
        node id it returned. No ref, nothing to open — so an empty one is
        refused rather than filed as an unopenable paper.

        The shelf defaults to 'unsorted' on purpose. Which shelf a scan belongs
        on is a reading of its contents, and nothing here has read it; guessing
        from the filename would file a deed as a receipt and hide it from the
        filter that should have found it."""
        uid = _uid(info)
        if not file_ref.strip():
            return ""
        import uuid as _uuid
        async with _pool.connection() as conn:
            if not await _record_kind(conn, uid, record_id):
                return ""
            cur = await conn.execute(
                "SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM documents WHERE record_id=%s",
                (record_id,))
            sort = (await cur.fetchone() or {}).get("s", 1)
            did = f"doc-{_uuid.uuid4().hex[:12]}"
            await conn.execute(
                "INSERT INTO documents (id, owner_user_id, name, subtitle, shelf,"
                " page_count, record_id, parcel_id, doc_type, created_at, size_bytes,"
                " file_ref, mime_type, source)"
                " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'upload')",
                (did, uid, (name or "Paper"), subtitle, (shelf or "unsorted"),
                 page_count, record_id, record_id, (shelf or "unsorted"),
                 _now_iso(), size_bytes, file_ref.strip(), mime_type))
            await _audit(conn, uid, "add_paper", record_id, f"Filed a paper: {name or 'Paper'}")
        return did

    @strawberry.mutation
    async def create_request(
        self, info: strawberry.Info, record_id: str, kind: str, message: str,
        requester: str = "", shared: str = "", attachment_manifest: str = "{}",
    ) -> str:
        """Files a request for work on a record, unassigned.

        This is deliberately NOT a hand-off to WhatsApp. The owner says what
        they need and what of theirs may be shown; who actually does it is an
        assignment somebody makes afterwards, against people the system knows.
        A link sent by the owner cannot be revoked, tracked, or answered for.

        This is still deliberately NOT a hand-off to WhatsApp. Since W16 the
        system can write to an outsider on the owner's behalf — see
        `dispatch_ticket` — but the owner is never handed the link: it is
        minted here, hashed here, sent from here, and withdrawn from here. A
        link the owner pastes himself is still the thing this refuses to make.

        Lands at stage 0 — 'Placed' — with no assignee, which is what the
        Services list reads to show it as waiting."""
        uid = _uid(info)
        if not message.strip():
            return ""
        import uuid as _uuid
        titles = {
            "survey": "Boundary re-survey",
            "opinion": "Title opinion",
            "visit": "Site visit",
            # Raised by the fence calculator, which sends the whole bill of
            # materials as the message. "Work request" told the Services list
            # nothing about what was being asked for.
            "fencing": "Fencing",
        }
        async with _ticket_transaction() as conn:
            if not await _record_kind(conn, uid, record_id):
                return ""
            from .capabilities import object_of, snapshot
            try:
                manifest = await snapshot(conn, uid, record_id, object_of(attachment_manifest))
            except ValueError:
                return ""
            rid = f"wr-{_uuid.uuid4().hex[:12]}"
            # Where the work is, stamped now. The desk and the dispatcher read
            # this job without an owner predicate and cannot call `_cards` for
            # somebody else's records, so the place has to be on the row.
            card = next((c for c in await _cards(conn, uid) if c["id"] == record_id), {})
            area_key, area_label = associates.area_key_of(card) if card else ("", "")
            # Nothing is quoted: the owner asked for work, not for a service
            # off the price list, and inventing a figure here would put one on
            # a ticket nobody agreed a price for.
            await conn.execute(
                "INSERT INTO work_requests (id, owner_user_id, kind, title, entity_type,"
                " entity_id, assignee, cost, stage, needs_you, note, due_date, closed,"
                " created_at, params, status, status_at, quoted, payee_share,"
                " area_key, area_label)"
                " VALUES (%s,%s,%s,%s,'record',%s,'',0,0,false,%s,'',false,%s,%s,"
                " 'placed',%s,0,%s,%s,%s)",
                (rid, uid, kind, titles.get(kind, "Work request"), record_id,
                 message.strip(), _now_iso(),
                 json.dumps({"requester": requester.strip(), "shared": shared.strip(),
                             "attachment_manifest": manifest}),
                 _now_iso(), _payee_share(), area_key, area_label))
            await _event(conn, uid, rid, kind="status", action="place",
                         to_status="placed",
                         headline=ticketing.event_headline(
                             "status", "place", {"actor_label": "You"}),
                         detail=f"Asked from {record_id}")
        return rid

    @strawberry.mutation
    async def assign_request(self, info: strawberry.Info, request_id: str,
                             assignee: str) -> bool:
        """Puts a named person on a placed request, moving it to 'Assigned'.

        Clearing the assignee sends it back to 'Placed' rather than deleting
        it — work that was handed to the wrong person is still work somebody
        asked for.

        The move goes through `_move` so the trail records who was put on it
        and when. A move the machine refuses returns False, which is what every
        caller of this already handles.

        `assignee_ref` is cleared on BOTH paths. This is the free-text door —
        somebody typing a name — and a reassignment that left the previous
        associate's id behind would leave the owner's ticket showing the new
        person's name above the old person's phone number. Putting somebody
        from the roster on a job is `assignAssociate`, which writes both."""
        uid = _uid(info)
        name = assignee.strip()
        async with _ticket_transaction() as conn:
            row = await _ticket_row(conn, uid, request_id, lock=True)
            if not row or row.get("closed"):
                return False
            # The name is written before the move so the trail line can say who
            # was put on it, and cleared after so it can say who came off.
            if name:
                await conn.execute(
                    "UPDATE work_requests SET assignee=%s, assignee_ref=''"
                    " WHERE id=%s AND owner_user_id=%s", (name, request_id, uid))
                row["assignee"], row["assignee_ref"] = name, ""
                return bool(await _move(conn, uid, row, "assign"))
            moved = await _move(conn, uid, row, "unassign")
            if moved:
                await conn.execute(
                    "UPDATE work_requests SET assignee='', assignee_ref=''"
                    " WHERE id=%s AND owner_user_id=%s", (request_id, uid))
            return bool(moved)

    @strawberry.mutation
    async def create_share_link(
        self, info: strawberry.Info, record_id: str, audience: str,
        terms: str = "view", days: int = 30, document_ids: Optional[List[str]] = None,
        include_boundary: bool = False,
    ) -> str:
        """Opens a time-limited link to a record's papers.

        It expires by default because a share that never lapses is how a deed
        ends up with a stranger two years after the deal fell through. The
        audience is required: a link nobody is named on cannot be revoked with
        any confidence about who loses access."""
        uid = _uid(info)
        if not audience.strip():
            return ""
        import uuid as _uuid
        async with _ticket_transaction() as conn:
            kind = await _record_kind(conn, uid, record_id)
            if not kind:
                return ""
            from .capabilities import snapshot
            try:
                manifest = await snapshot(conn, uid, record_id,
                    {"documentIds": document_ids or [], "includeBoundary": include_boundary},
                    all_documents=document_ids is None)
            except ValueError:
                return ""
            docs = len(manifest["items"])
            token = ticketing.mint_token(secrets.token_bytes(32))
            cur = await conn.execute(
                "SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM share_links WHERE owner_user_id=%s",
                (uid,))
            sort = (await cur.fetchone() or {}).get("s", 1)
            lid = f"sl-{_uuid.uuid4().hex[:12]}"
            span = max(1, min(int(days or 30), 365))
            expires = (date.today() + timedelta(days=span)).strftime("%d/%m/%Y")
            # _cards is where a record's title is composed (parcels have a
            # survey_no and a subdivision, not a title column), so the link
            # names the record the same way every other screen does.
            rows = [r for r in await _cards(conn, uid) if r["id"] == record_id]
            subject = rows[0]["title"] if rows else record_id
            await conn.execute(
                "INSERT INTO share_links (id, owner_user_id, audience, subject, terms,"
                " document_id, doc_count, opened_count, last_opened_at, expires_on,"
                " revoked, sort, created_at, token_hash, record_id, manifest)"
                " VALUES (%s,%s,%s,%s,%s,%s,%s,0,'',%s,false,%s,%s,%s,%s,%s)",
                (lid, uid, audience.strip(), subject, (terms or "view"),
                 document_ids[0] if document_ids and len(document_ids) == 1 else "",
                 docs, expires, sort, _now_iso(), token["token_hash"], record_id, json.dumps(manifest)))
        return "/share/" + token["token"]

    @strawberry.mutation
    async def add_person(
        self, info: strawberry.Info, record_id: str, person_name: str,
        role: str = "", summary: str = "", arrangement: str = "",
        pay_label: str = "", pay_value: str = "",
    ) -> str:
        """Puts someone on the record — a tenant, a caretaker, a neighbour who
        holds the key. Only the name is required: who someone is to this land
        is often known long before what they are paid."""
        uid = _uid(info)
        if not person_name.strip():
            return ""
        import uuid as _uuid
        async with _pool.connection() as conn:
            if not await _record_kind(conn, uid, record_id):
                return ""
            cur = await conn.execute(
                "SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM record_people WHERE record_id=%s",
                (record_id,))
            sort = (await cur.fetchone() or {}).get("s", 1)
            pid = f"rp-{_uuid.uuid4().hex[:12]}"
            name = person_name.strip()
            # Initials are derived, never asked for: one less field to fill in
            # and it cannot disagree with the name it came from.
            initials = "".join(w[0] for w in name.split()[:2]).upper()
            await conn.execute(
                "INSERT INTO record_people (id, owner_user_id, record_id, person_name,"
                " initials, role, badges, summary, arrangement, pay_label, pay_value,"
                " due_label, due_value, visibility, actions, compact, sort)"
                " VALUES (%s,%s,%s,%s,%s,%s,'[]',%s,%s,%s,%s,'','','','[]',false,%s)",
                (pid, uid, record_id, name, initials, role, summary,
                 arrangement, pay_label, pay_value, sort))
            await _audit(conn, uid, "add_person", record_id,
                         f"Added {name}" + (f" ({role})" if role else ""))
        return pid

    @strawberry.mutation
    async def update_person(
        self, info: strawberry.Info, person_id: str, person_name: str = "",
        role: str = "", summary: str = "", arrangement: str = "",
        pay_label: str = "", pay_value: str = "",
    ) -> bool:
        """Edits one person. Empty arguments are skipped, so changing a role
        cannot blank the arrangement the caller never mentioned."""
        uid = _uid(info)
        sets, args = [], []
        for col, val in (("person_name", person_name), ("role", role),
                         ("summary", summary), ("arrangement", arrangement),
                         ("pay_label", pay_label), ("pay_value", pay_value)):
            if val:
                sets.append(f"{col}=%s")
                args.append(val)
        if person_name.strip():
            sets.append("initials=%s")
            args.append("".join(w[0] for w in person_name.split()[:2]).upper())
        if not sets:
            return False
        async with _pool.connection() as conn:
            cur = await conn.execute(
                f"UPDATE record_people SET {', '.join(sets)}"
                " WHERE id=%s AND owner_user_id=%s RETURNING id, record_id, person_name",
                (*args, person_id, uid))
            row = await cur.fetchone()
            if row:
                await _audit(conn, uid, "update_person", row["record_id"],
                             f"Edited {row.get('person_name') or 'a person'}")
            return bool(row)

    @strawberry.mutation
    async def delete_person(self, info: strawberry.Info, person_id: str) -> bool:
        """Takes someone off this record. It does not touch them anywhere else
        — the same person may look after three other parcels."""
        uid = _uid(info)
        async with _pool.connection() as conn:
            cur = await conn.execute(
                "DELETE FROM record_people WHERE id=%s AND owner_user_id=%s"
                " RETURNING id, record_id, person_name",
                (person_id, uid))
            row = await cur.fetchone()
            if row:
                await _audit(conn, uid, "delete_person", row["record_id"],
                             f"Removed {row.get('person_name') or 'a person'}")
            return bool(row)

    @strawberry.mutation
    async def delete_photo(self, info: strawberry.Info, photo_id: str) -> bool:
        """Unfiles a photo. The stored bytes stay: a share link may cite them,
        and the gallery is not the place that destroys evidence for good."""
        uid = _uid(info)
        async with _pool.connection() as conn:
            for table in ("parcel_photos", "property_photos"):
                cur = await conn.execute(
                    f"DELETE FROM {table} WHERE id=%s AND owner_user_id=%s RETURNING id",
                    (photo_id, uid))
                if await cur.fetchone():
                    return True
        return False

    @strawberry.mutation
    async def set_cover_photo(self, info: strawberry.Info, photo_id: str) -> bool:
        """Makes one photo the record's cover. Clearing the old one first is
        not tidiness — a partial unique index allows exactly one per record,
        so setting a second without clearing the first is rejected."""
        uid = _uid(info)
        async with _pool.connection() as conn:
            for table, key in (("parcel_photos", "parcel_id"),
                               ("property_photos", "property_id")):
                cur = await conn.execute(
                    f"SELECT {key} AS rid FROM {table} WHERE id=%s AND owner_user_id=%s",
                    (photo_id, uid))
                row = await cur.fetchone()
                if not row:
                    continue
                await conn.execute(
                    f"UPDATE {table} SET is_cover=false WHERE {key}=%s AND owner_user_id=%s",
                    (row["rid"], uid))
                await conn.execute(
                    f"UPDATE {table} SET is_cover=true WHERE id=%s AND owner_user_id=%s",
                    (photo_id, uid))
                return True
        return False

    @strawberry.mutation
    async def update_paper(
        self, info: strawberry.Info, paper_id: str, name: str = "", shelf: str = "",
    ) -> bool:
        """Renames a paper, or moves it to the shelf someone has now read it
        onto. Uploads land on 'unsorted' because nothing had read them yet;
        this is how they leave it."""
        uid = _uid(info)
        sets, args = [], []
        if name.strip():
            sets.append("name=%s")
            args.append(name.strip())
        if shelf.strip():
            sets.append("shelf=%s")
            args.append(shelf.strip())
        if not sets:
            return False
        async with _pool.connection() as conn:
            cur = await conn.execute(
                f"UPDATE documents SET {', '.join(sets)}"
                " WHERE id=%s AND owner_user_id=%s RETURNING id, record_id, name",
                (*args, paper_id, uid))
            row = await cur.fetchone()
            if row:
                await _audit(conn, uid, "update_paper", row["record_id"],
                             f"Updated a paper: {row.get('name') or ''}".strip())
            return bool(row)

    @strawberry.mutation
    async def delete_expense(self, info: strawberry.Info, expense_id: str) -> bool:
        """Removes one line from the ledger."""
        uid = _uid(info)
        async with _pool.connection() as conn:
            cur = await conn.execute(
                "DELETE FROM land_expenses WHERE id=%s AND owner_user_id=%s"
                " RETURNING id, entity_id, title",
                (expense_id, uid))
            row = await cur.fetchone()
            if row:
                await _audit(conn, uid, "delete_expense", row["entity_id"],
                             f"Removed a cost: {row.get('title') or ''}".strip())
            return bool(row)

    @strawberry.mutation
    async def add_feature(
        self, info: strawberry.Info, record_id: str, label: str,
        category: str = "", spec: str = "", condition: str = "",
        condition_state: str = "", note: str = "", icon: str = "",
    ) -> str:
        """Puts a thing that exists on the land onto the record — a bore, a
        fence, a transformer. Everything but the name is optional because the
        name is the only part the owner always knows standing in the field;
        the spec and the condition are what a later visit fills in.

        The kind is read off the name when the caller does not give one, so a
        feature filed as "Bore" arrives as water with the bore icon whether it
        came from a chip, a typed name or an import — one table decides, and it
        is not the one in the browser."""
        uid = _uid(info)
        if not label.strip():
            return ""
        import uuid as _uuid
        cat, ico = _classify_feature(label)
        state = condition_state if condition_state in _STATES else ""
        async with _pool.connection() as conn:
            kind = await _record_kind(conn, uid, record_id)
            if not kind:
                return ""
            cur = await conn.execute(
                "SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM land_features WHERE entity_id=%s",
                (record_id,))
            sort = (await cur.fetchone() or {}).get("s", 1)
            fid = f"lf-{_uuid.uuid4().hex[:12]}"
            await conn.execute(
                "INSERT INTO land_features (id, owner_user_id, entity_type, entity_id,"
                " category, label, condition, condition_state, spec, note, icon,"
                " created_at, sort, lat, lon, pin_label, photo_count, actions)"
                " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,0,0,%s,0,'[]')",
                # No coordinates and no pin: nothing here was stood next to.
                # The card reads pin_label when lat is 0, so it says so plainly.
                #
                # Nor a condition: 'unknown', not 'good'. Nobody has looked at
                # this yet, and a green dot on the strength of a name being
                # typed is an assurance the app invented for itself.
                (fid, uid, kind, record_id, (category or cat), label.strip(),
                 condition, (state or "unknown"), spec, note,
                 (icon or ico), _now_iso(), sort, "No pin yet"))
            await _audit(conn, uid, "add_feature", record_id, f"Added a feature: {label.strip()}")
        return fid

    @strawberry.mutation
    async def update_feature(
        self, info: strawberry.Info, feature_id: str,
        label: Optional[str] = None, category: Optional[str] = None,
        spec: Optional[str] = None, condition: Optional[str] = None,
        condition_state: Optional[str] = None, note: Optional[str] = None,
    ) -> bool:
        """Edits a feature in place.

        Omitted and empty are two different instructions, and the screen needs
        both: a caller that does not send `note` leaves the note alone, and one
        that sends an empty `note` is deleting it. The old rule — non-empty
        wins, empty is silence — made a spec, a condition or a note
        undeletable once typed, with the delete appearing to work until the
        page was reloaded.

        The name is the exception: a feature with no name is a row nobody can
        find again, so an empty label is refused rather than obeyed."""
        uid = _uid(info)
        sets, args = [], []
        if label is not None and label.strip():
            sets.append("label=%s")
            args.append(label.strip())
            # The name says what the thing is, so it also says how it is drawn
            # and which chip it files under — unless the caller has decided
            # that itself, in which case that decision stands.
            if category is None:
                cat, ico = _classify_feature(label)
                sets += ["category=%s", "icon=%s"]
                args += [cat, ico]
        if category is not None and category.strip():
            sets.append("category=%s")
            args.append(category.strip())
        for col, val in (("spec", spec), ("condition", condition), ("note", note)):
            if val is not None:
                sets.append(f"{col}=%s")
                args.append(val)
        # An unrecognised state would paint the card in no colour at all, so a
        # bad one is dropped rather than stored.
        if condition_state is not None and condition_state in _STATES:
            sets.append("condition_state=%s")
            args.append(condition_state)
        if not sets:
            return False
        async with _pool.connection() as conn:
            cur = await conn.execute(
                f"UPDATE land_features SET {', '.join(sets)}"
                " WHERE id=%s AND owner_user_id=%s RETURNING id, entity_id, label",
                (*args, feature_id, uid))
            row = await cur.fetchone()
            if row:
                await _audit(conn, uid, "update_feature", row["entity_id"],
                             f"Edited a feature: {row.get('label') or ''}".strip())
            return bool(row)

    @strawberry.mutation
    async def delete_feature(self, info: strawberry.Info, feature_id: str) -> bool:
        """Removes a feature from the record. Photos taken of it keep their
        feature_id: the picture is still evidence of what was there, and
        orphaning it would quietly delete a site visit's work."""
        uid = _uid(info)
        async with _pool.connection() as conn:
            cur = await conn.execute(
                "DELETE FROM land_features WHERE id=%s AND owner_user_id=%s"
                " RETURNING id, entity_id, label",
                (feature_id, uid))
            row = await cur.fetchone()
            if row:
                await _audit(conn, uid, "delete_feature", row["entity_id"],
                             f"Removed a feature: {row.get('label') or ''}".strip())
            return bool(row)

    @strawberry.mutation
    async def delete_paper(self, info: strawberry.Info, paper_id: str) -> bool:
        """Unfiles a paper from its record. The stored bytes are left alone:
        a document version may be shared by a link or cited by a reading, and
        this screen is not the place that decides a file is gone for good."""
        uid = _uid(info)
        async with _pool.connection() as conn:
            cur = await conn.execute(
                "DELETE FROM documents WHERE id=%s AND owner_user_id=%s"
                " RETURNING id, record_id, name",
                (paper_id, uid))
            gone = await cur.fetchone()
            if gone:
                await conn.execute(
                    "DELETE FROM share_links WHERE document_id=%s AND owner_user_id=%s",
                    (paper_id, uid))
                await _audit(conn, uid, "delete_paper", gone["record_id"],
                             f"Removed a paper: {gone.get('name') or ''}".strip())
        return bool(gone)

    # ── Service tickets (W16) ─────────────────────────────────────────
    #
    # Every one of these returns the falsy value on refusal — "", 0, False —
    # and none of them raises. A client that asked for a move the machine does
    # not allow is told nothing happened, and the refusal is written into the
    # trail rather than repaired.

    @strawberry.mutation
    async def fund_ticket(self, info: strawberry.Info, ticket_id: str) -> str:
        """Set the agreed price aside against this job. Returns the ledger
        row's id, or "".

        Refused for a job that is closed, that nobody agreed a price for, or
        that already has money on it: setting the same money aside twice is
        how a wallet and a ledger start disagreeing."""
        uid = _uid(info)
        try:
            from . import payments
        except ImportError:
            import payments
        if payments.enabled():
            raise ValueError("Open checkout to fund this job")
        async with _ticket_transaction() as conn:
            row = await _ticket_row(conn, uid, ticket_id, lock=True)
            if not row or row.get("closed"):
                return ""
            quoted = _quoted_of(row)
            if quoted <= 0:
                return ""
            if ticketing.held_for(await _ledger_of(conn, uid, ticket_id)) > 0:
                return ""
            if not await _write_ledger(conn, uid, ticket_id,
                                       ticketing.hold_plan(quoted, ticket_id)):
                return ""
            cur = await conn.execute(
                "SELECT id FROM service_payments WHERE ticket_id=%s AND owner_user_id=%s"
                " AND entry='hold' ORDER BY created_at DESC, id LIMIT 1", (ticket_id, uid))
            return str((await cur.fetchone() or {}).get("id") or "")

    @strawberry.mutation
    async def dispatch_ticket(self, info: strawberry.Info, ticket_id: str, contact: str,
                              person_name: str = "", channel: str = "auto",
                              purpose: str = "invite", note: str = "",
                              expires_days: int = 14) -> str:
        """Write to somebody about this job, on the owner's behalf, and keep
        the copy. Returns the dispatch's id, or "".

        The stored dispatch carries a worker link scoped to this job and its
        selected files. Both provider delivery and manual forwarding retain
        the same expiry and revocation controls."""
        uid = _uid(info)
        if purpose not in _DISPATCH_PURPOSES:
            return ""
        async with _ticket_transaction() as conn:
            row = await _ticket_row(conn, uid, ticket_id, lock=True)
            if not row or row.get("closed"):
                return ""
            rid = row.get("entity_id") or ""
            card = next((c for c in await _cards(conn, uid) if c["id"] == rid), {})
            did = await _dispatch(conn, uid, row, card, contact=contact,
                                  person_name=person_name, channel=channel,
                                  purpose=purpose, note=note, expires_days=expires_days)
            # Only an invite moves the job: a nudge, a message or a note about
            # changes is another line on a job that is already where it is.
            if did and purpose == "invite":
                delivered = await (await conn.execute("SELECT status FROM ticket_dispatches WHERE id=%s", (did,))).fetchone()
                if delivered and delivered["status"] != "failed":
                    await _move(conn, uid, row, "dispatch")
            return did

    @strawberry.mutation
    async def revoke_dispatch(self, info: strawberry.Info, dispatch_id: str,
                              reason: str = "") -> bool:
        """Take a request back.

        They are told on the channel it went out on, and the row is marked
        rather than deleted — what was sent is evidence, and a withdrawal that
        erases the message it withdraws answers nothing later. When nothing is
        out any more the job goes back to where it was before it was sent."""
        uid = _uid(info)
        async with _ticket_transaction() as conn:
            cur = await conn.execute(
                "SELECT * FROM ticket_dispatches WHERE id=%s AND owner_user_id=%s",
                (dispatch_id, uid))
            dx = await cur.fetchone() or {}
            if not dx or dx.get("revoked_at"):
                return False
            row = await _ticket_row(conn, uid, dx.get("ticket_id") or "", lock=True)
            await conn.execute(
                "UPDATE ticket_dispatches SET revoked_at=%s, revoke_reason=%s"
                " WHERE id=%s AND owner_user_id=%s",
                (_now_iso(), reason or "", dispatch_id, uid))
            if not row:
                return True
            rid = row.get("entity_id") or ""
            card = next((c for c in await _cards(conn, uid) if c["id"] == rid), {})
            chan = dx.get("channel") or "whatsapp"
            who = dx.get("person_name") or ticketing.mask_contact(dx.get("contact") or "")
            # The withdrawal rides on the row it withdraws: it is the same
            # conversation, not a second time this left the building.
            sent = await _send(conn, uid, chan, dx.get("contact") or "",
                               ticketing.render_dispatch(
                                   chan, _dispatch_ctx(row, card, "withdrawn",
                                                       dx.get("person_name") or "", reason)))
            await _event(
                conn, uid, row["id"], kind="dispatch", ref_table="ticket_dispatches",
                ref_id=dispatch_id, headline=f"Withdrawn from {who}",
                detail=(reason or "Nothing more is needed.")
                + ("" if ticketing.is_live(sent["provider"]) else " · recorded, not sent"))
            if not await _live_dispatches(conn, uid, row["id"]) and _status_of(row) == "sent":
                await _move(conn, uid, row, "withdraw", note=reason)
            return True

    @strawberry.mutation
    async def start_ticket(self, info: strawberry.Info, ticket_id: str,
                           note: str = "") -> bool:
        """They are standing on the land. The one movement the owner records on
        somebody else's behalf, because until there is a worker portal the
        owner is the only person who can say it."""
        uid = _uid(info)
        async with _ticket_transaction() as conn:
            row = await _ticket_row(conn, uid, ticket_id, lock=True)
            if not row:
                return False
            return bool(await _move(conn, uid, row, "start", note=note))

    @strawberry.mutation
    async def add_deliverable(self, info: strawberry.Info, ticket_id: str, kind: str,
                              label: str, note: str = "", file_ref: str = "",
                              file_name: str = "", mime_type: str = "",
                              size_bytes: int = 0, payload: str = "{}",
                              file_as: str = "", submitted_by: str = "") -> str:
        """Record one thing that came back. Returns its id, or "".

        Nothing here touches the record. A deliverable is not a paper, a photo
        or a fence yet — the fence does not exist until somebody has looked,
        and writing it down early puts a thing on the land that is not there.

        Recording something moves the job to 'waiting on you', because work
        that has come back is work waiting on you, and making the owner press a
        second button to say so is a state the screen would then have to
        explain."""
        uid = _uid(info)
        if kind not in ticketing.DELIVERABLE_KINDS or not label.strip():
            return ""
        try:
            body = json.loads(payload or "{}")
        except ValueError:
            return ""
        if not isinstance(body, dict):
            return ""
        import uuid as _uuid
        async with _ticket_transaction() as conn:
            row = await _ticket_row(conn, uid, ticket_id, lock=True)
            if not row or row.get("closed"):
                return ""
            cur = await conn.execute(
                "SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM ticket_deliverables"
                " WHERE ticket_id=%s", (ticket_id,))
            sort = _i((await cur.fetchone() or {}).get("s")) or 1
            did = f"dv-{_uuid.uuid4().hex[:12]}"
            await conn.execute(
                "INSERT INTO ticket_deliverables (id, owner_user_id, ticket_id, record_id,"
                " kind, label, note, file_ref, file_name, mime_type, size_bytes, payload,"
                " submitted_by, submitted_via, submitted_at, file_as, review, review_note,"
                " reviewed_at, filed_table, filed_id, filed_prev, filed_at, sort, created_at)"
                " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'owner',%s,%s,'pending',"
                " '','','','','','',%s,%s)",
                # 'owner' and not the assignee's name: the owner relayed this.
                # Who actually did the work is on the ticket, and claiming the
                # file came from them would be provenance nobody can vouch for.
                (did, uid, ticket_id, row.get("entity_id") or "", kind, label.strip(),
                 note, file_ref.strip(), file_name, mime_type, _i(size_bytes),
                 json.dumps(body), (submitted_by.strip() or row.get("assignee") or ""),
                 _ddmmyyyy(_today()), file_as, sort, _now_iso()))
            await _event(conn, uid, ticket_id, kind="deliverable",
                         ref_table="ticket_deliverables", ref_id=did,
                         headline=ticketing.event_headline(
                             "deliverable", "", {"label": label.strip(), "kind": kind}),
                         detail=note or "")
            if _status_of(row) in ("assigned", "on_site", "changes"):
                await _move(conn, uid, row, "deliver")
            return did

    @strawberry.mutation
    async def review_deliverable(self, info: strawberry.Info, deliverable_id: str,
                                 review: str, file_as: str = "", note: str = "") -> bool:
        """Keep one item, refuse it, or put the decision back.

        Each item is decided on its own: a survey that comes back with a good
        sketch and two photos of the wrong field must not force an
        all-or-nothing choice, because the alternative is an owner who accepts
        rubbish rather than lose the sketch. Nothing is filed here — that
        happens once, on acceptance."""
        uid = _uid(info)
        if review not in ("accepted", "rejected", "pending"):
            return False
        async with _ticket_transaction() as conn:
            cur = await conn.execute(
                "SELECT * FROM ticket_deliverables WHERE id=%s AND owner_user_id=%s",
                (deliverable_id, uid))
            dv = await cur.fetchone() or {}
            if not dv:
                return False
            ticket = await _ticket_row(conn, uid, dv["ticket_id"], lock=True)
            if not ticket or ticket.get("closed") or dv.get("filed_id"):
                return False
            await conn.execute(
                "UPDATE ticket_deliverables SET review=%s, review_note=%s, reviewed_at=%s,"
                " file_as = CASE WHEN %s <> '' THEN %s ELSE file_as END"
                " WHERE id=%s AND owner_user_id=%s",
                (review, note or "", _now_iso(), file_as, file_as, deliverable_id, uid))
            word = {"accepted": "You are keeping", "rejected": "You refused",
                    "pending": "You put the decision back on"}[review]
            await _event(conn, uid, dv.get("ticket_id") or "", kind="deliverable",
                         ref_table="ticket_deliverables", ref_id=deliverable_id,
                         headline=f"{word} '{dv.get('label') or 'it'}'", detail=note or "")
            return True

    @strawberry.mutation
    async def accept_ticket(self, info: strawberry.Info, ticket_id: str,
                            note: str = "") -> int:
        """Accept what came back: file every item marked keep, release the
        money, close the job, and put whoever did the work onto the record.

        Returns how many rows were filed. Refused — 0 — while any item is still
        undecided: an item nobody has looked at is not an item anybody meant to
        file. Refused too for a job that is not waiting on the owner.

        There is no un-accepting. A released payout cannot be un-released on
        any rail we will use, so the remedy for a wrong acceptance is a fresh
        job, not a reopened one."""
        uid = _uid(info)
        async with _ticket_transaction() as conn:
            row = await _ticket_row(conn, uid, ticket_id, lock=True)
            if not row or _status_of(row) != "submitted":
                return 0
            cur = await conn.execute(
                "SELECT * FROM ticket_deliverables WHERE ticket_id=%s AND owner_user_id=%s"
                " ORDER BY sort, id", (ticket_id, uid))
            items = list(await cur.fetchall())
            if any((d.get("review") or "pending") == "pending" for d in items):
                return 0
            rid = row.get("entity_id") or ""
            card = next((c for c in await _cards(conn, uid) if c["id"] == rid), {})
            accepted = [d for d in items if d.get("review") == "accepted"]
            if not card or not accepted:
                return 0
            # A failure to file any kept item must not release the money or
            # partially file its siblings. Validate all plans before writing.
            if any(not ticketing.filing_plan(d, row, card).get("ok") for d in accepted if not d.get("filed_id")):
                return 0
            filed = 0
            for d in items:
                if (d.get("review") or "") != "accepted" or d.get("filed_id"):
                    continue
                if not card:
                    break
                res = await _file_deliverable(conn, uid, d, row, card)
                if not res.get("ok"):
                    raise ValueError(str(res.get("why") or "A kept item could not be filed; nothing was settled"))
                await conn.execute(
                    "UPDATE ticket_deliverables SET filed_table=%s, filed_id=%s,"
                    " filed_prev=%s, filed_at=%s WHERE id=%s AND owner_user_id=%s",
                    # filed_prev holds what a boundary overwrite replaced, so
                    # undo is a later screen and not a later migration.
                    (res.get("table") or "", res.get("filed_id") or "",
                     res.get("filed_prev") or "", _ddmmyyyy(_today()), d["id"], uid))
                await _event(
                    conn, uid, ticket_id, kind="filed",
                    ref_table=res.get("table") or "", ref_id=res.get("filed_id") or "",
                    headline=ticketing.event_headline(
                        "filed", "", {"summary": res.get("summary") or ""}),
                    detail=d.get("label") or "")
                filed += 1
            held = ticketing.held_for(await _ledger_of(conn, uid, ticket_id))
            share = _f(row.get("payee_share")) or _payee_share()
            payee = row.get("assignee") or ""
            await _write_ledger(conn, uid, ticket_id,
                                ticketing.accept_plan(held, share, payee, ticket_id),
                                actor=uid)
            if await _move(conn, uid, row, "accept", note=note):
                # `cost` follows the settlement so the Services list stops
                # quoting a figure nobody paid; `quoted` keeps the agreed one.
                await conn.execute(
                    "UPDATE work_requests SET outcome_note=%s, accepted_at=%s, cost=%s"
                    " WHERE id=%s AND owner_user_id=%s",
                    (note or "", _ddmmyyyy(_today()), held, ticket_id, uid))
                if card:
                    await _remember_person(conn, uid, row, card)
                for dx in await _live_dispatches(conn, uid, ticket_id):
                    await _dispatch(conn, uid, row, card,
                                    contact=dx.get("contact") or "",
                                    person_name=dx.get("person_name") or "",
                                    channel=dx.get("channel") or "auto",
                                    purpose="accepted", note=note)
            return filed

    @strawberry.mutation
    async def send_back_ticket(self, info: strawberry.Info, ticket_id: str,
                               reason: str) -> bool:
        """Send the work back with what is wrong with it.

        The reason is required and goes out verbatim: "not good enough" tells a
        surveyor nothing he can act on, and a second attempt against the same
        job is cheaper for everybody than a new one. Everything already
        recorded stays on the ticket — a refused item is evidence of what was
        sent, not rubbish to be swept up."""
        uid = _uid(info)
        if not reason.strip():
            return False
        async with _ticket_transaction() as conn:
            row = await _ticket_row(conn, uid, ticket_id, lock=True)
            if not row:
                return False
            if not await _move(conn, uid, row, "send_back", note=reason.strip()):
                return False
            await conn.execute(
                "UPDATE work_requests SET outcome_note=%s WHERE id=%s AND owner_user_id=%s",
                (reason.strip(), ticket_id, uid))
            rid = row.get("entity_id") or ""
            card = next((c for c in await _cards(conn, uid) if c["id"] == rid), {})
            for dx in await _live_dispatches(conn, uid, ticket_id):
                await _dispatch(conn, uid, row, card, contact=dx.get("contact") or "",
                                person_name=dx.get("person_name") or "",
                                channel=dx.get("channel") or "auto",
                                purpose="changes", note=reason.strip())
            return True

    @strawberry.mutation
    async def cancel_ticket(self, info: strawberry.Info, ticket_id: str,
                            reason: str = "", pay_anyway: float = 0.0) -> bool:
        """Pull the job.

        Whoever has it is told it is off, nothing more can come back on it, and
        whatever was set aside is dealt with: `pay_anyway` settles that much of
        it — for the trips somebody genuinely made — split exactly the way an
        acceptance splits, and the rest goes back to the wallet. Anything
        already filed onto the record stays where it is; this closes the job,
        it does not unwind it."""
        uid = _uid(info)
        async with _ticket_transaction() as conn:
            row = await _ticket_row(conn, uid, ticket_id, lock=True)
            if not row:
                return False
            held = ticketing.held_for(await _ledger_of(conn, uid, ticket_id))
            share = _f(row.get("payee_share")) or _payee_share()
            plan = ticketing.cancel_plan(held, _f(pay_anyway), share,
                                         row.get("assignee") or "", ticket_id)
            if not await _move(conn, uid, row, "cancel", note=reason):
                return False
            await _write_ledger(conn, uid, ticket_id, plan, actor=uid)
            settled = sum(_f(r.get("amount")) for r in plan
                          if r.get("entry") in ("release", "fee"))
            await conn.execute(
                "UPDATE work_requests SET outcome_note=%s, cost=%s"
                " WHERE id=%s AND owner_user_id=%s", (reason or "", settled, ticket_id, uid))
            rid = row.get("entity_id") or ""
            card = next((c for c in await _cards(conn, uid) if c["id"] == rid), {})
            for dx in await _live_dispatches(conn, uid, ticket_id):
                chan = dx.get("channel") or "whatsapp"
                await _send(conn, uid, chan, dx.get("contact") or "",
                            ticketing.render_dispatch(
                                chan, _dispatch_ctx(row, card, "withdrawn",
                                                    dx.get("person_name") or "", reason)))
                await conn.execute(
                    "UPDATE ticket_dispatches SET revoked_at=%s, revoke_reason=%s"
                    " WHERE id=%s AND owner_user_id=%s",
                    (_now_iso(), reason or "job cancelled", dx["id"], uid))
                await _event(
                    conn, uid, ticket_id, kind="dispatch",
                    ref_table="ticket_dispatches", ref_id=dx["id"],
                    headline=f"Withdrawn from {dx.get('person_name') or ticketing.mask_contact(dx.get('contact') or '')}",
                    detail=reason or "The job was cancelled.")
            return True

    # ── The desk: the roster, and who is on a job (W17) ────────────────
    #
    # Same contract as every write above: the falsy value on refusal — "",
    # False — and never an exception. A desk write additionally refuses
    # everything when the caller is not an admin, and that refusal is
    # indistinguishable from the row not existing, so a non-admin cannot map
    # the roster by guessing ids.

    @strawberry.mutation
    async def invite_associate(self, info: strawberry.Info, name: str, contact: str,
                               disciplines: List[str], areas: List[str],
                               firm: str = "", note: str = "",
                               channel: str = "auto") -> str:
        """Write down somebody the desk already phones. Returns their id, or "".

        A name, a number, at least one kind of work and at least one place —
        that is everything Pattadar needs to send them a job, and anything less
        is refused here rather than landing a row that can never be dispatched.
        They start at 'invited', which is offerable: the desk enrols somebody
        precisely so it can send them a job, and a roster where the first offer
        needs a second click to 'activate' is a roster that is always one step
        out of date.

        A number already on the roster answers with the EXISTING associate's
        id. The leak that argues for "" — telling somebody that a number is
        already enrolled — is real, and it belongs to the self-serve enrolment
        path in phase 5, which anybody may call. This one is admin-only and the
        caller can already read every row on the roster by name and by number;
        answering "" would send them back to a form that keeps failing for a
        reason the screen cannot name. The unique index is what makes the
        answer correct under a double-tap, not a SELECT before the INSERT."""
        uid = _uid(info)
        import uuid as _uuid
        person, number = (name or "").strip(), (contact or "").strip()
        keys = [d.strip() for d in (disciplines or [])
                if d and d.strip() in associates.DISCIPLINES]
        places = _parse_areas(areas)
        if not person or not number or not keys or not places:
            return ""
        want = (channel or "auto").strip().lower()
        chan = want if want in ("auto", "sms", "whatsapp", "email") else "auto"
        async with _ticket_transaction() as conn:
            if not await _is_admin(conn, uid):
                return ""
            ckey = associates.contact_key(number)
            aid = f"as-{_uuid.uuid4().hex[:12]}"
            cur = await conn.execute(
                "INSERT INTO associates (id, name, firm, contact, contact_key, channel,"
                " state, note, enrolled_by, created_at)"
                " VALUES (%s,%s,%s,%s,%s,%s,'invited',%s,%s,%s)"
                " ON CONFLICT (contact_key) WHERE contact_key <> '' DO NOTHING"
                " RETURNING id",
                (aid, person, (firm or "").strip(), number, ckey, chan,
                 (note or "").strip(), uid, _now_iso()))
            if not await cur.fetchone():
                # Nothing was inserted, which can only be the unique index on
                # a folded number. A contact that folds to '' — a name, a
                # half-typed number — is outside that index and cannot have
                # conflicted, so there is no existing row to point at and
                # answering with the first blank-keyed person on the roster
                # would be worse than answering nothing.
                if not ckey:
                    return ""
                cur = await conn.execute(
                    "SELECT id FROM associates WHERE contact_key=%s", (ckey,))
                return str((await cur.fetchone() or {}).get("id") or "")
            for key in dict.fromkeys(keys):
                await conn.execute(
                    "INSERT INTO associate_disciplines (id, associate_id, discipline,"
                    " state, capacity, created_at) VALUES (%s,%s,%s,'on',3,%s)"
                    " ON CONFLICT DO NOTHING",
                    (f"ad-{_uuid.uuid4().hex[:12]}", aid, key, _now_iso()))
            for level, place, key in places:
                await conn.execute(
                    "INSERT INTO associate_areas (id, associate_id, level, name,"
                    " name_key, created_at) VALUES (%s,%s,%s,%s,%s,%s)"
                    " ON CONFLICT DO NOTHING",
                    (f"aa-{_uuid.uuid4().hex[:12]}", aid, level, place, key, _now_iso()))
            await _assoc_event(
                conn, aid, kind="enrolled", headline=f"{person} was added to the roster",
                detail=" · ".join([associates.label_of(k) for k in keys]
                                  + [_area_label(l, p) for l, p, _k in places]),
                actor=uid)
            return aid

    @strawberry.mutation
    async def update_associate(self, info: strawberry.Info, id: str, name: str = "",
                               contact: str = "", alt_contact: str = "",
                               firm: str = "", note: str = "", channel: str = "",
                               contact_visible: Optional[bool] = None) -> bool:
        """Change what the desk knows about somebody.

        Every string field means "leave it alone" when empty — the convention
        every other partial write in this module uses — and `contact_visible`
        means it when null, because false is a real answer to that question and
        must not be confused with not-asked.

        A new number that already belongs to somebody else is refused rather
        than written: the unique index would raise, and a raise inside this
        transaction would poison the connection and lose the rest of it."""
        uid = _uid(info)
        aid = (id or "").strip()
        if not aid:
            return False
        async with _ticket_transaction() as conn:
            if not await _is_admin(conn, uid):
                return False
            row = await _associate_row(conn, aid)
            if not row:
                return False
            sets, args, changed = [], [], []
            if (name or "").strip():
                sets.append("name=%s")
                args.append(name.strip())
                changed.append("name")
            if (firm or "").strip():
                sets.append("firm=%s")
                args.append(firm.strip())
                changed.append("firm")
            if (note or "").strip():
                sets.append("note=%s")
                args.append(note.strip())
                changed.append("note")
            if (alt_contact or "").strip():
                sets.append("alt_contact=%s")
                args.append(alt_contact.strip())
                changed.append("second number")
            want = (channel or "").strip().lower()
            if want in ("auto", "sms", "whatsapp", "email"):
                sets.append("channel=%s")
                args.append(want)
                changed.append("how to reach them")
            if (contact or "").strip():
                ckey = associates.contact_key(contact.strip())
                if ckey:
                    cur = await conn.execute(
                        "SELECT id FROM associates WHERE contact_key=%s AND id<>%s",
                        (ckey, aid))
                    if await cur.fetchone():
                        return False
                sets += ["contact=%s", "contact_key=%s"]
                args += [contact.strip(), ckey]
                changed.append("number")
            if contact_visible is not None:
                sets.append("contact_visible=%s")
                args.append(bool(contact_visible))
                changed.append("owners may see the number"
                               if contact_visible else "owners may not see the number")
            if not sets:
                return False
            args += [aid]
            await conn.execute(
                f"UPDATE associates SET {', '.join(sets)} WHERE id=%s", tuple(args))
            await _assoc_event(
                conn, aid, kind="updated", headline="Their details were changed",
                detail=", ".join(changed), actor=uid)
            return True

    @strawberry.mutation
    async def set_associate_disciplines(self, info: strawberry.Info, id: str,
                                        disciplines: List[str],
                                        capacities: Optional[List[int]] = None) -> bool:
        """Set what somebody does, and how much of it they will take at once.

        The set is replaced, not merged. A discipline that stays keeps its
        capacity and its state — so re-saving the form does not silently
        un-suspend a line of work the credential sweeper stopped — and one that
        is removed and added back starts clean, which is the desk's call to
        make and is written into the trail either way."""
        uid = _uid(info)
        import uuid as _uuid
        aid = (id or "").strip()
        keys = [d.strip() for d in (disciplines or [])
                if d and d.strip() in associates.DISCIPLINES]
        keys = list(dict.fromkeys(keys))
        if not aid or not keys:
            return False
        caps = list(capacities or [])
        async with _ticket_transaction() as conn:
            if not await _is_admin(conn, uid):
                return False
            if not await _associate_row(conn, aid):
                return False
            cur = await conn.execute(
                "SELECT discipline FROM associate_disciplines WHERE associate_id=%s",
                (aid,))
            had = {r["discipline"] for r in await cur.fetchall()}
            for i, key in enumerate(keys):
                cap = _i(caps[i]) if i < len(caps) else 0
                cap = max(1, min(cap or 3, 20))
                if key in had:
                    await conn.execute(
                        "UPDATE associate_disciplines SET capacity=%s"
                        " WHERE associate_id=%s AND discipline=%s", (cap, aid, key))
                else:
                    await conn.execute(
                        "INSERT INTO associate_disciplines (id, associate_id,"
                        " discipline, state, capacity, created_at)"
                        " VALUES (%s,%s,%s,'on',%s,%s) ON CONFLICT DO NOTHING",
                        (f"ad-{_uuid.uuid4().hex[:12]}", aid, key, cap, _now_iso()))
            gone = sorted(had - set(keys))
            if gone:
                await conn.execute(
                    "DELETE FROM associate_disciplines WHERE associate_id=%s"
                    " AND discipline = ANY(%s)", (aid, gone))
            await _assoc_event(
                conn, aid, kind="disciplines", headline="What they do was changed",
                detail=" · ".join(associates.label_of(k) for k in keys)
                + (f" (removed {', '.join(associates.label_of(g) for g in gone)})"
                   if gone else ""), actor=uid)
            return True

    @strawberry.mutation
    async def set_associate_areas(self, info: strawberry.Info, id: str,
                                  areas: List[str]) -> bool:
        """Set where somebody works. Entries look like 'village:Peddapuram'.

        Replaced whole, because "these are the places" is how the form asks the
        question. The typed spelling is kept alongside the folded key that is
        actually compared, so 'Peddapuram (R)' stays readable and still matches
        'peddapuram'."""
        uid = _uid(info)
        import uuid as _uuid
        aid = (id or "").strip()
        places = _parse_areas(areas)
        if not aid or not places:
            return False
        async with _ticket_transaction() as conn:
            if not await _is_admin(conn, uid):
                return False
            if not await _associate_row(conn, aid):
                return False
            await conn.execute("DELETE FROM associate_areas WHERE associate_id=%s", (aid,))
            for level, place, key in places:
                await conn.execute(
                    "INSERT INTO associate_areas (id, associate_id, level, name,"
                    " name_key, created_at) VALUES (%s,%s,%s,%s,%s,%s)"
                    " ON CONFLICT DO NOTHING",
                    (f"aa-{_uuid.uuid4().hex[:12]}", aid, level, place, key, _now_iso()))
            await _assoc_event(
                conn, aid, kind="areas", headline="Where they work was changed",
                detail=" · ".join(_area_label(l, p) for l, p, _k in places), actor=uid)
            return True

    @strawberry.mutation
    async def set_associate_state(self, info: strawberry.Info, id: str, state: str,
                                  reason: str = "") -> bool:
        """Start, pause or stop somebody taking work.

        A reason is MANDATORY for 'paused' and 'blocked' and the write is
        refused without one. This is the sentence that gets read back to the
        person when they ask why the work stopped, and "no reason recorded" is
        not an answer anybody can act on.

        Jobs already in their hands are NOT taken away. The desk deals with
        each one by hand through `deskUnassign`, because an automatic mass
        unassign is how four owners find out at once that nobody is coming."""
        uid = _uid(info)
        aid, want = (id or "").strip(), (state or "").strip()
        why = (reason or "").strip()
        if not aid or want not in associates.STATES:
            return False
        if want in ("paused", "blocked") and not why:
            return False
        async with _ticket_transaction() as conn:
            if not await _is_admin(conn, uid):
                return False
            row = await _associate_row(conn, aid)
            if not row:
                return False
            await conn.execute(
                "UPDATE associates SET state=%s, state_reason=%s, state_at=%s,"
                " state_by=%s WHERE id=%s", (want, why, _now_iso(), uid, aid))
            await _assoc_event(
                conn, aid, kind="state",
                headline=f"They are now: {_ASSOC_WORD.get(want, want)}",
                detail=why, actor=uid)
            return True

    @strawberry.mutation
    async def delete_unclaimed_associate(self, info: strawberry.Info, id: str) -> bool:
        """Remove somebody who was written down by mistake. The only hard
        delete in this feature.

        Refused once they have signed in — their row is then their own personal
        data and leaves through the DPDP erasure path, not through an operator
        pressing a button — and refused once any job has ever pointed at them,
        because a ticket whose `assignee_ref` names a row that no longer exists
        can never answer "who was on this" again.

        An invited associate who never claims their record has no principal, so
        the platform's erasure model has nothing to key on. This is the one
        door that exists for that case, and it is deliberately narrow."""
        uid = _uid(info)
        aid = (id or "").strip()
        if not aid:
            return False
        async with _ticket_transaction() as conn:
            if not await _is_admin(conn, uid):
                return False
            row = await _associate_row(conn, aid)
            if not row or (row.get("recipient_user_id") or "").strip():
                return False
            cur = await conn.execute(
                "SELECT 1 FROM work_requests WHERE assignee_ref=%s LIMIT 1", (aid,))
            if await cur.fetchone():
                return False
            for table in ("associate_disciplines", "associate_areas",
                          "associate_credentials", "associate_events"):
                await conn.execute(f"DELETE FROM {table} WHERE associate_id=%s", (aid,))
            # Anything on the desk's inbox about this person goes with them.
            # A task left behind would draw a row linking to a page that is no
            # longer there, and its dedupe key would keep a sweeper from ever
            # writing that warning about anybody else.
            await conn.execute("DELETE FROM desk_tasks WHERE associate_id=%s", (aid,))
            await conn.execute("DELETE FROM associates WHERE id=%s", (aid,))
            return True

    @strawberry.mutation
    async def assign_associate(self, info: strawberry.Info, request_id: str,
                               associate_id: str) -> bool:
        """The owner puts somebody from the roster on their own job.

        Scoped to the caller's own ticket through `_ticket_row`, exactly like
        `assign_request` beside it. The difference is what lands on the row:
        `assignee` keeps being the display name every event headline and filing
        subtitle already reads, and `assignee_ref` is the id beside it — the
        thing that makes a phone number reachable on the owner's own ticket."""
        uid = _uid(info)
        aid = (associate_id or "").strip()
        if not aid:
            return False
        async with _ticket_transaction() as conn:
            row = await _ticket_row(conn, uid, request_id, lock=True)
            if not row or row.get("closed"):
                return False
            assoc = await _associate_row(conn, aid)
            # 'blocked' is the desk's decision that this person takes no more
            # work, and it has to mean that on every path or it means nothing.
            if not assoc or (assoc.get("state") or "") == "blocked":
                return False
            return await _put_on_job(conn, uid, row, assoc, actor=uid,
                                     actor_kind="owner", actor_label="You")

    @strawberry.mutation
    async def desk_assign(self, info: strawberry.Info, ticket_id: str,
                          associate_id: str, note: str = "") -> bool:
        """The desk puts somebody on somebody else's job.

        The only write in this module that reaches a ticket the caller does not
        own, and the owner-scoping is solved honestly rather than dropped: the
        ticket is read cross-owner, its own `owner_user_id` comes back on the
        row, and every write after that — the identity, `_move`, the event —
        is scoped to THAT owner. `_move`'s UPDATE carries an owner predicate
        of its own, so passing the admin's uid would match no row and refuse
        silently while the trail recorded a move that never happened.

        The taxonomy is never a cage here: the desk can put anybody on
        anything, including somebody whose discipline does not cover that kind
        of work. It cannot put somebody on a job while they are stopped."""
        uid = _uid(info)
        aid = (associate_id or "").strip()
        if not aid:
            return False
        async with _ticket_transaction() as conn:
            if not await _is_admin(conn, uid):
                return False
            row = await _desk_ticket_row(conn, ticket_id, lock=True)
            if not row or row.get("closed"):
                return False
            assoc = await _associate_row(conn, aid)
            if not assoc or (assoc.get("state") or "") == "blocked":
                return False
            owner = row.get("owner_user_id") or ""
            if not owner:
                return False
            ok = await _put_on_job(
                conn, owner, row, assoc, actor=uid,
                actor_kind=_desk_actor(_status_of(row), "assign"),
                actor_label="Pattadar desk", note=note)
            if ok:
                await _desk_read(conn, uid, "desk_assign", f"{ticket_id} -> {aid}")
            return ok

    @strawberry.mutation
    async def desk_unassign(self, info: strawberry.Info, ticket_id: str,
                            reason: str) -> bool:
        """Take somebody off a job that has gone quiet, and put it back.

        The reason is mandatory. It goes into the owner's own trail and into
        the associate's, and "nothing was recorded" is not something either of
        them can be given later.

        Nothing about money moves. Whatever was set aside stays set aside
        against the job, which is now waiting for somebody again."""
        uid = _uid(info)
        why = (reason or "").strip()
        if not why:
            return False
        async with _ticket_transaction() as conn:
            if not await _is_admin(conn, uid):
                return False
            row = await _desk_ticket_row(conn, ticket_id, lock=True)
            if not row or row.get("closed"):
                return False
            owner = row.get("owner_user_id") or ""
            if not owner:
                return False
            ok = await _take_off_job(
                conn, owner, row, reason=why, actor=uid,
                actor_kind=_desk_actor(_status_of(row), "unassign"),
                actor_label="Pattadar desk")
            if ok:
                await _desk_read(conn, uid, "desk_unassign", f"{ticket_id}: {why}")
            return ok

    @strawberry.mutation
    async def set_platform_admin(self, info: strawberry.Info, uid: str,
                                 on: bool) -> bool:
        """Add or remove an admin, without a deploy.

        Writes `platform_settings 'admin.uids'`, which is unioned with the
        environment allowlist rather than replacing it. The environment list is
        the bootstrap and cannot be edited from here — that is the whole point
        of it, and it is why the gate can fail closed without anybody being
        able to lock the first admin out.

        Taking away your own access is refused unless the environment still
        holds you, because the row that grants it is the row you would be
        deleting."""
        me = _uid(info)
        who = (uid or "").strip()
        if not who:
            return False
        async with _ticket_transaction() as conn:
            if not await _is_admin(conn, me):
                return False
            if who == me and not on and me not in _admin_env():
                return False
            stored = await _setting(conn, "admin.uids")
            have = [p.strip() for p in stored.split(",") if p.strip()]
            if on and who not in have:
                have.append(who)
            elif not on and who in have:
                have.remove(who)
            else:
                return False
            await conn.execute(
                "INSERT INTO platform_settings (key, value, updated_by, updated_at)"
                " VALUES ('admin.uids',%s,%s,%s) ON CONFLICT (key) DO UPDATE"
                " SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by,"
                " updated_at=EXCLUDED.updated_at",
                (",".join(have), me, _now_iso()))
            return True

    @strawberry.mutation
    async def close_desk_task(self, info: strawberry.Info, task_id: str) -> bool:
        """Mark one thing on the desk's inbox as dealt with. Closed, never
        deleted: the dedupe key is what stops a sweeper writing the same
        warning every minute, and it only works while the row is still there."""
        uid = _uid(info)
        tid = (task_id or "").strip()
        if not tid:
            return False
        async with _ticket_transaction() as conn:
            if not await _is_admin(conn, uid):
                return False
            cur = await conn.execute(
                "UPDATE desk_tasks SET state='closed', closed_at=%s"
                " WHERE id=%s AND state='open'", (_now_iso(), tid))
            return bool(cur.rowcount)
