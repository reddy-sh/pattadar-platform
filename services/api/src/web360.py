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

import re
import json
import strawberry
from datetime import date, datetime, timedelta
from typing import Optional, List

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
    "ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_name TEXT NOT NULL DEFAULT ''",

    # W02 — archived records leave every list and sum but are never deleted;
    # the Properties rail grows an "Archived" facet only while any exist.
    "ALTER TABLE parcels ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE properties ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false",
]


async def ensure_schema(conn) -> None:
    """Create/extend the web-360 tables. Idempotent; safe on every boot."""
    for stmt in _DDL:
        try:
            await conn.execute(stmt)
        except Exception as exc:  # one bad statement must not block the rest
            import logging
            logging.getLogger("pattadar").warning("web360 ddl skipped: %s (%s)", stmt[:60], exc)


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
    owner_name: str
    place_line: str
    place_line_te: str
    extent: float
    extent_unit: str
    extent_detail: str
    market_value: float
    per_unit_value: float
    per_unit_label: str
    bought_year: str
    lat: float
    lon: float
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
    caption: str
    sheet_title: str
    sheet_detail: str
    marks: List[BoundaryMark]


@strawberry.type
class Photo:
    id: str
    caption: str
    category: str
    file_name: str
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
    market_gain: float
    market_gain_pct: float
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


# An order moves through four visible states; the number in `work_requests.stage`
# is an index into this, so the label lives in one place.
_STAGES = ["Placed", "Assigned", "On site", "Delivered"]


# ── Read helpers ──────────────────────────────────────────────────────

_UNIT_ALT = {"ac": "Sq.yd", "sq.ft": "sq.m", "sq.yd": "sq.m"}


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


async def _cards(conn, uid: str) -> List[dict]:
    """Every record the user owns, parcel and built, in one shape.

    Kept as dicts (not RecordCard) so the facet counter and the card list can
    share exactly one query — the rail can never disagree with the grid.
    """
    rows: List[dict] = []
    cur = await conn.execute(
        "SELECT p.*, pb.pattadar_no, pb.village, pb.mandal, pb.district, pb.owner_name "
        "FROM parcels p JOIN passbooks pb ON pb.id = p.passbook_id "
        "WHERE pb.owner_user_id = %s ORDER BY p.created_at DESC", (uid,))
    for r in await cur.fetchall():
        sub = (r.get("subdivision") or "").strip()
        title = f"Sy {r['survey_no']}" + (f"/{sub}" if sub else "")
        rows.append({
            "id": r["id"], "kind": "parcel", "title": title,
            "archived": bool(r.get("archived")), "passbook_id": r.get("passbook_id") or "",
            "subtitle": r.get("owner_name") or "",
            "classification": r.get("classification") or "agri",
            "status": r.get("status") or "owned",
            "stake": r.get("stake") or "owned",
            "khata_no": r.get("pattadar_no") or "",
            "owner_name": r.get("owner_name") or "",
            "village": r.get("village") or "", "mandal": r.get("mandal") or "",
            "district": r.get("district") or "",
            "extent": _f(r.get("extent")), "extent_unit": "ac",
            "market_value": _f(r.get("market_value")),
            "purchase_price": _f(r.get("purchase_price")),
            "loan_amount": _f(r.get("loan_amount")),
            "geo_point": r.get("geo_point") or "", "shape": r.get("shape") or "",
            "address": r.get("address") or "", "created_at": r.get("created_at") or "",
        })
    cur = await conn.execute(
        "SELECT * FROM properties WHERE owner_user_id = %s ORDER BY created_at DESC", (uid,))
    for r in await cur.fetchall():
        built = _f(r.get("builtup_area"))
        rows.append({
            "id": r["id"], "kind": "property", "title": r.get("label") or "Property",
            "archived": bool(r.get("archived")), "passbook_id": "",
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


async def _fmb_sheet(conn, record_id: str, title: str) -> str:
    """The record's own sketch name — read off its map-shelf paper if it has
    one, otherwise built from its survey number. Every record used to claim
    'FMB 214' because that is what the first one was called."""
    # An FMB is the survey department's own sheet and outranks a traced copy,
    # so it wins even if a tippon happens to sort first.
    cur = await conn.execute(
        "SELECT name FROM documents WHERE record_id=%s AND shelf='map' "
        "ORDER BY (name ILIKE 'FMB%%') DESC, sort LIMIT 1", (record_id,))
    row = await cur.fetchone()
    if row and row.get("name"):
        return str(row["name"])
    sy = title.replace("Sy ", "").split("/")[0]
    return f"FMB {sy}" if sy else "Sketch"


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


def _latlon(geo: str) -> tuple:
    try:
        lat, _, lon = (geo or "").partition(",")
        return float(lat.strip()), float(lon.strip())
    except (ValueError, AttributeError):
        return 0.0, 0.0


def _to_card(d: dict, tags: List[str]) -> RecordCard:
    alt = ""
    if d["extent_unit"] == "ac":
        alt = f"{_in_group(d['extent'] * 4840)} Sq.yd"
    elif d["extent_unit"] == "sq.ft":
        alt = f"{_in_group(d['extent'] * 0.092903)} sq.m"
    elif d["extent_unit"] == "sq.yd":
        alt = f"{_in_group(d['extent'] * 0.836127)} sq.m"
    return RecordCard(
        id=d["id"], kind=d["kind"], title=d["title"], subtitle=d["subtitle"],
        classification=d["classification"], status=d["status"], stake=d["stake"],
        khata_no=d["khata_no"], owner_name=d["owner_name"], village=d["village"],
        mandal=d["mandal"], district=d["district"],
        place_line=_place_line(d["village"], d["mandal"], ""),
        extent=d["extent"], extent_unit=d["extent_unit"], extent_alt=alt,
        market_value=d["market_value"], tags=list(tags),
    )


# ── Query namespace ───────────────────────────────────────────────────

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

            recent = [_to_card(r, tags.get(r["id"], [])) for r in rows[:4]]

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
                tiles=tiles, waiting=waiting, value_bars=bars, recent=recent)

    @strawberry.field
    async def properties(
        self, info: strawberry.Info,
        kinds: Optional[List[str]] = None,
        statuses: Optional[List[str]] = None,
        stakes: Optional[List[str]] = None,
        derived: Optional[List[str]] = None,
        tags: Optional[List[str]] = None,
    ) -> PropertyList:
        uid = _uid(info)
        kinds, statuses = kinds or [], statuses or []
        stakes, derived, tags = stakes or [], derived or [], tags or []
        async with _pool.connection() as conn:
            all_rows = await _cards(conn, uid)
            tagmap = await _tags_for(conn, uid, "record")

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
            ]

            bits = [*derived, *tags,
                    *[o.label.lower() for g in facets if g.key == "status"
                      for o in g.options if o.active]]
            summary = " · ".join(bits)
            active_count = len(kinds) + len(statuses) + len(stakes) + len(derived) + len(tags)

            return PropertyList(
                shown=len(shown), total=len(rows), hidden=len(hidden),
                filter_summary=summary, hidden_places=hidden_places,
                active_count=active_count,
                cards=[_to_card(r, tagmap.get(r["id"], [])) for r in shown],
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
                place_line_te=d.get("address") or "",
                extent=d["extent"], extent_unit=unit, extent_detail=detail,
                market_value=d["market_value"], per_unit_value=per_value,
                per_unit_label=per_label, bought_year=bought,
                lat=lat, lon=lon,
                map_caption=(f"{sheet} over the survey plot" if d["kind"] == "parcel"
                             else f"{sheet} over the site"),
                paper_count=papers, feature_count=features, people_count=people,
                service_count=services, photo_count=photos, photo_note=photo_note,
                tags=tagmap.get(id, []),
                note_body=note.get("body", ""),
                note_author=note.get("author") or d["owner_name"] or "You",
                note_at=note.get("created_at", ""))

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
                shared=d["id"] in shared, page_count=_i(d.get("page_count")))
                for d in docs]

    @strawberry.field
    async def features(self, info: strawberry.Info, record_id: str) -> FeatureList:
        uid = _uid(info)
        async with _pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM land_features WHERE entity_id=%s AND owner_user_id=%s "
                "ORDER BY sort, label", (record_id, uid))
            rows = await cur.fetchall()
            feats = [Feature(
                id=r["id"], label=r.get("label") or "", spec=r.get("spec") or "",
                icon=r.get("icon") or "feature", category=r.get("category") or "other",
                condition=r.get("condition") or "", condition_state=r.get("condition_state") or "good",
                note=r.get("note") or "", lat=_f(r.get("lat")), lon=_f(r.get("lon")),
                pin_label=r.get("pin_label") or "", photo_count=_i(r.get("photo_count")),
                actions=_jlist(r.get("actions"))) for r in rows]

            cats: List[FacetOption] = [FacetOption(key="all", label="All", count=len(feats), active=True)]
            seen: List[str] = []
            for f in feats:
                if f.category not in seen:
                    seen.append(f.category)
            for c in seen:
                cats.append(FacetOption(key=c, label=c.capitalize(),
                                        count=len([f for f in feats if f.category == c]), active=False))
            bad = len([f for f in feats if f.condition_state == "bad"])
            cats.append(FacetOption(key="needs_repair", label="Needs repair", count=bad, active=False))

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
            note = "auto top-up on" if wallet.get("auto_top_up") else "auto top-up off"
            if escrowed:
                note = f"{_inr_short(escrowed)} more held in escrow · {note}"
            if not wallet:
                note = "no wallet yet — top up to pay from Pattadar"
            return PeopleView(
                people=people, payments=pays, count=len(people),
                monthly_out=monthly, seasonal_in=seasonal,
                wallet_balance=balance, wallet_note=note)

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
            marks = [BoundaryMark(
                id=r["id"], seq=_i(r.get("seq")), label=r.get("label") or "",
                state=r.get("state") or "confirmed", detail=r.get("detail") or "",
                lat=_f(r.get("lat")), lon=_f(r.get("lon")),
                photo_count=_i(r.get("photo_count")), noted_on=r.get("noted_on") or "")
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
                caption=f"{sheet} traced over the parcel"
                        + (f" · {d['village']}" if d.get("village") else ""),
                sheet_title=sheet if "sheet" in sheet.lower() else f"{sheet} sheet",
                sheet_detail=await _sheet_detail(conn, record_id),
                marks=marks)

    @strawberry.field
    async def photos(self, info: strawberry.Info, record_id: str,
                     feature_id: Optional[str] = None) -> PhotoList:
        uid = _uid(info)
        async with _pool.connection() as conn:
            sql = ("SELECT * FROM parcel_photos WHERE parcel_id=%s AND owner_user_id=%s")
            args: tuple = (record_id, uid)
            if feature_id:
                sql += " AND feature_id=%s"
                args = (record_id, uid, feature_id)
            cur = await conn.execute(sql + " ORDER BY sort, captured_at DESC", args)
            rows = await cur.fetchall()
            tagmap = await _tags_for(conn, uid, "photo")
            photos = [Photo(
                id=r["id"], caption=r.get("caption") or "", category=r.get("category") or "",
                file_name=r.get("file_name") or "", media_kind=r.get("media_kind") or "photo",
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

            lot_paid = sum(l.paid for l in lots)
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
                market_total=market, market_gain=market - paid_total,
                market_gain_pct=((market - paid_total) / paid_total * 100) if paid_total else 0,
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
                     record_id: Optional[str] = None) -> List[Order]:
        """Services ordered against a record — the Services hanger, and the
        'Assigned to me' list when no record is named."""
        uid = _uid(info)
        async with _pool.connection() as conn:
            sql = "SELECT * FROM work_requests WHERE owner_user_id=%s AND closed=false"
            args: tuple = (uid,)
            if record_id:
                sql += " AND entity_id=%s"
                args = (uid, record_id)
            cur = await conn.execute(sql + " ORDER BY needs_you DESC, due_date", args)
            rows = await cur.fetchall()
            titles = {r["id"]: r["title"] for r in await _cards(conn, uid)}
            return [Order(
                id=r["id"], kind=r.get("kind") or "", title=r.get("title") or "",
                detail=r.get("note") or "", assignee=r.get("assignee") or "",
                cost=_f(r.get("cost")), stage=_i(r.get("stage")),
                stage_label=_STAGES[min(max(_i(r.get("stage")), 0), len(_STAGES) - 1)],
                needs_you=bool(r.get("needs_you")), due_date=r.get("due_date") or "",
                record_id=r.get("entity_id") or "",
                record_title=titles.get(r.get("entity_id") or "", "")) for r in rows]

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
                lat, lon = _latlon(d["geo_point"])
                w = watchers.get(d["id"], ("", ""))
                out.append(MapRecord(
                    id=d["id"], kind=d["kind"], title=d["title"], subtitle=d["subtitle"],
                    status=d["status"], classification=d["classification"],
                    market_value=d["market_value"], extent=d["extent"],
                    extent_unit=d["extent_unit"], khata_no=d["khata_no"],
                    owner_name=d["owner_name"], village=d["village"], lat=lat, lon=lon,
                    shape=_shape(d["shape"]),
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


async def _update_record(conn, uid: str, inp: RecordInput) -> str:
    import uuid as _uuid
    rid = inp.id or ""
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
                            kind: str = "ec") -> int:
        """Place one service order per record — the bulk bar's 'Order EC ×N'.
        The orders land in work_requests, so Services and Assigned pick them
        up like any other order."""
        uid = _uid(info)
        import uuid as _uuid
        title = {"ec": "Encumbrance Certificate"}.get(kind, kind.replace("_", " ").title())
        due = (date.today() + timedelta(days=7)).strftime("%d/%m/%Y")
        n = 0
        async with _pool.connection() as conn:
            for rid in record_ids:
                if not await _record_kind(conn, uid, rid):
                    continue
                await conn.execute(
                    "INSERT INTO work_requests (id, owner_user_id, kind, title,"
                    " entity_type, entity_id, assignee, cost, stage, needs_you, note,"
                    " due_date, closed, created_at)"
                    " VALUES (%s,%s,%s,%s,'record',%s,'',%s,0,false,%s,%s,false,%s)",
                    (f"wr-{_uuid.uuid4().hex[:12]}", uid, kind, title, rid,
                     1180.0 if kind == "ec" else 0.0,
                     "Ordered from the properties list", due, _now_iso()))
                n += 1
        return n

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
        async with _pool.connection() as conn:
            await conn.execute(
                "UPDATE share_links SET sort = sort + %s WHERE id=%s AND owner_user_id=%s",
                (days, link_id, uid))
        return True

    @strawberry.mutation
    async def dismiss_waiting(self, info: strawberry.Info, id: str) -> bool:
        uid = _uid(info)
        async with _pool.connection() as conn:
            await conn.execute(
                "UPDATE waiting_items SET done=true WHERE id=%s AND owner_user_id=%s", (id, uid))
        return True
