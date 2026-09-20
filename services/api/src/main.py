import os
import re
import csv
import ssl
import time
import uuid
import json
import base64
import asyncio
import hashlib
import hmac
import logging
import httpx
import strawberry
from . import aadhaar as aadhaar_security
from . import notify
from . import fmb_geometry
from . import audit
# Record-360 surface for the web app (screens W01–W15). Its eleven tables and
# six column additions live in their own module so this file — the iOS-facing
# schema — stays reviewable; see docs/specs/2026-08-15-web-360-design.md.
from . import village_map, web360
from psycopg.conninfo import make_conninfo
from datetime import date, datetime, timedelta, timezone
from typing import Optional, List
from contextlib import asynccontextmanager

# Both sibling services configure logging before taking their logger
# (services/assistant/src/main.py, services/gateway/app/main.py:31); this one
# never did, and under uvicorn's default LOGGING_CONFIG — which registers the
# uvicorn* loggers and no root entry — that left "pattadar" at WARNING with no
# handlers. Every _log.warning here still surfaced through logging's last-resort
# handler, which is why the gap went unnoticed, but every _log.info was dropped
# on the floor. The ai.usage cost line below is INFO, so without this the
# telemetry would exist in the source and nowhere else.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

_log = logging.getLogger("pattadar")

from fastapi import FastAPI, Request, UploadFile, File
from fastapi.responses import JSONResponse, Response
from strawberry.fastapi import GraphQLRouter
from strawberry.extensions import (
    MaskErrors, MaxAliasesLimiter, MaxTokensLimiter, QueryDepthLimiter, SchemaExtension,
)
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

# Bundled AP-IGRS reference data (real feed: 28 districts, 686 mandals, 297
# SROs, 115 bilingual deed types + fee schedule). Shipped in the image under
# ../data and loaded once at startup — the authoritative "system of record"
# data Pattadar is a system of engagement over.
_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def _read_csv(name: str) -> list[dict]:
    path = os.path.join(_DATA_DIR, name)
    if not os.path.exists(path):
        return []
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def _split_bilingual(s: str) -> tuple[str, str]:
    """'Sale Deed [విక్రయ దస్తావేజు]' -> ('Sale Deed', 'విక్రయ దస్తావేజు')."""
    s = (s or "").strip()
    if "[" in s and s.endswith("]"):
        en, _, te = s.partition("[")
        return en.strip(), te[:-1].strip()
    return s, ""


def _num(v, default=0.0) -> float:
    try:
        return float(str(v).replace(",", "").strip() or default)
    except (TypeError, ValueError):
        return float(default)

def _dsn_from_env() -> str:
    """Connection string, from APP_PG_DSN or the PG_* parts.

    APP_PG_DSN used to be composed by Terraform from the RDS-managed MASTER
    credential, which RDS rotates about every seven days: after a rotation
    every new connection failed until an operator re-applied and forced a
    redeployment. The gateway and the assistant already read PG_* parts for
    the pattadar_app role, so the api reads them too and the master
    credential stops being deployed at all.
    """
    explicit = os.getenv("APP_PG_DSN", "").strip()
    if explicit:
        return explicit
    host = os.getenv("PG_HOST", "").strip()
    if not host:
        return "host=localhost port=5432 dbname=pattadar user=rhub password=rhub-dev-pwd"
    return make_conninfo(
        host=host,
        port=os.getenv("PG_PORT", "").strip() or "5432",
        dbname=os.getenv("PG_DATABASE", "").strip() or "hub",
        user=os.getenv("PG_USER", "").strip() or "pattadar_app",
        password=os.getenv("PG_PASSWORD", ""),
    )


DSN = _dsn_from_env()

pool = AsyncConnectionPool(
    conninfo=DSN,
    min_size=1,
    max_size=10,
    open=False,
    kwargs={"row_factory": dict_row, "autocommit": True},
)
aadhaar_security.bind(pool)


def to_type(cls, row):
    if row is None:
        return None
    allowed = cls.__annotations__
    out = {}
    for k, v in row.items():
        if k not in allowed:
            continue
        out[k] = str(v) if isinstance(v, (date, datetime)) and v is not None else v
    return cls(**out)


def without_token(row, field: str = "invite_token"):
    """The same row with its stored verification token blanked.

    What is stored is a hash, and a hash is not a link: only the call that mints
    a token hands the raw one back, once, to the client that asked for it.
    """
    return {**row, field: ""}


def new_id() -> str:
    """Full UUID row id — collision-free at any scale. (Was truncated to 12 chars
    ≈ 44 bits, which birthday-collides on the TEXT primary key in the low millions.)"""
    return str(uuid.uuid4())


# Crockford base32 (drops the ambiguous I/L/O/U) for compact human-facing codes.
_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def _short_code(row_id: str, n: int = 13) -> str:
    """Deterministic n-char base32 code (5·n bits) from a row id. Stable per row and
    collision-free well past 1B (13 chars = 65 bits); works for any id format."""
    h = int(hashlib.sha256(row_id.encode()).hexdigest(), 16)
    return "".join(_CROCKFORD[(h >> (5 * i)) & 31] for i in range(n - 1, -1, -1))


def _slug(s: str, n: int = 18) -> str:
    """Uppercase alphanumeric slug of a name/number (drops spaces & punctuation)."""
    return "".join(ch for ch in (s or "").upper() if ch.isalnum())[:n]


_STATE_CODE_MAP: dict = {}


def _state_code(name: str) -> str:
    """State NAME → 2-letter code (Andhra Pradesh→AP). Falls back to a 2-char slug,
    or 'XX' when empty/unknown, so a structured ref always starts with something."""
    if not _STATE_CODE_MAP:
        for r in _read_csv("states.csv"):
            _STATE_CODE_MAP[r["STATE_NAME"].strip().lower()] = r["STATE_CODE"]
    return _STATE_CODE_MAP.get((name or "").strip().lower()) or _slug(name, 2) or "XX"


def _location_ref(state: str, village: str, mid: str, row_id: str) -> str:
    """Human-readable, location-structured id: <STATE>-<VILLAGE>-<mid>-<4-char unique>.
    Empty parts are dropped; the id-derived base32 suffix keeps it unique even when
    the (AI-extracted, unnormalized) location or survey/khata number repeats."""
    parts = [p for p in [_state_code(state), _slug(village), mid] if p]
    return "-".join(parts + [_short_code(row_id, 4)])


# ── Group types (typed land-holding entities) ─────────────────────────
# One source of truth for the roles/labels each group type exposes. New types
# are additive here + in the UI's groups.ts. `primary_role` is auto-assigned to
# the creator's own member; `has_tree` gates the genealogy tree (Family only).
GROUP_TYPES: dict = {
    "family":      {"label": "Family",       "has_tree": True,
                    "primary_role": "Head",
                    "roles": ["Head", "Spouse", "Son", "Daughter", "Father", "Mother",
                              "Brother", "Sister", "Grandfather", "Grandmother",
                              "Grandson", "Granddaughter", "Other"]},
    "partnership": {"label": "Partnership",   "has_tree": False,
                    "primary_role": "Managing Partner",
                    "roles": ["Managing Partner", "Partner"]},
    "company":     {"label": "Company / LLP", "has_tree": False,
                    "primary_role": "Director",
                    "roles": ["Director", "Shareholder", "Authorized Signatory"]},
    "huf":         {"label": "HUF",           "has_tree": False,
                    "primary_role": "Karta",
                    "roles": ["Karta", "Coparcener", "Member"]},
    "trust":       {"label": "Trust / Society","has_tree": False,
                    "primary_role": "Trustee",
                    "roles": ["Trustee", "Beneficiary", "Member"]},
    # A lightweight "wallet": a way to group holdings without any succession
    # machinery behind it. The web app has offered this type in its create
    # dialog since Families & Groups shipped, and it was missing here — so
    # `create_group` fell through to its `type not in GROUP_TYPES` branch and
    # silently wrote "family" instead. Picking Portfolio produced a Family,
    # with a Head and a genealogy the owner never asked for and no error to
    # say why. The column is plain TEXT with no constraint, so this is purely
    # additive: existing rows are untouched.
    "portfolio":   {"label": "Portfolio / Wallet", "has_tree": False,
                    "primary_role": "Owner",
                    "roles": ["Owner", "Viewer"]},
}


def _group_primary_role(gtype: str) -> str:
    return GROUP_TYPES.get(gtype, GROUP_TYPES["family"])["primary_role"]


# ── Strawberry Types ──────────────────────────────────────────────────

@strawberry.type
class UserType:
    id: str
    mobile: str
    email: str
    name: str
    language: str
    kyc_ref_masked: str
    roles: str
    notification_prefs: str
    districts_of_interest: str
    mfa_enabled: bool
    address: str = ""
    last_active_at: str = ""
    inactivity_email_enabled: bool = True


@strawberry.type
class PassbookType:
    id: str
    owner_user_id: str
    pattadar_no: str
    owner_name: str
    father_husband_name: str
    state: str
    district: str
    mandal: str
    village: str
    photo: str
    created_at: str
    group_id: str = ""

    @strawberry.field
    def ref(self) -> str:
        """Location-structured passbook id: <STATE>-<VILLAGE>-<KHATA>-<unique>
        (same pattern as the parcel id). The full UUID `id` stays the real key."""
        return _location_ref(self.state, self.village, _slug(self.pattadar_no), self.id)

    @strawberry.field
    async def total_extent(self) -> float:
        """Sum of land-parcel extents under this passbook (Acres-Guntas)."""
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT COALESCE(SUM(extent), 0) AS t FROM parcels WHERE passbook_id=%s", (self.id,))
            row = await cur.fetchone()
            return float(row["t"] or 0) if row else 0.0


@strawberry.type
class ParcelOwnerType:
    id: str
    parcel_id: str
    owner_name: str
    acquisition_source: str
    extent: float
    mutation_type: str
    mutation_date: str
    is_current: bool


@strawberry.type
class ParcelLocationType:
    village: str
    mandal: str
    district: str
    state: str


@strawberry.type
class ParcelType:
    id: str
    passbook_id: str
    survey_no: str
    subdivision: str
    extent: float
    unit: str
    classification: str
    acquisition_source: str
    geo_point: str
    parent_parcel_id: str
    source: str
    created_at: str
    # The surveyed outline: "lat,lng;lat,lng;…" in corner order, as printed in
    # an FMB point table. The pin says where the land is; this says its shape.
    boundary: str = ""
    # Extended dossier — manual entry now; auto-filled from AP-IGRS later.
    status: str = "owned"            # owned | for-sale | sold | disputed
    label: str = ""
    address: str = ""
    boundary_north: str = ""
    boundary_south: str = ""
    boundary_east: str = ""
    boundary_west: str = ""
    purchase_price: float = 0
    purchase_date: str = ""
    guideline_value: float = 0
    market_value: float = 0
    stamp_duty: float = 0
    loan_amount: float = 0
    encumbrance_status: str = ""     # clear | mortgaged | lien
    reg_doc_no: str = ""
    sro: str = ""
    reg_date: str = ""
    ec_status: str = ""              # clear | pending | encumbered
    ec_date: str = ""
    mutation_status: str = ""        # completed | pending | not-applied
    tax_paid_upto: str = ""
    rera_no: str = ""
    litigation: bool = False
    litigation_note: str = ""
    stake: str = "owned"

    @strawberry.field
    async def ref(self) -> str:
        """Location-structured parcel id: <STATE>-<VILLAGE>-<SURVEY>[/<SUBDIV>]-<unique>.
        Location comes from the parent passbook; the full UUID `id` stays the real key."""
        async with pool.connection() as conn:
            cur = await conn.execute("SELECT state, village FROM passbooks WHERE id=%s", (self.passbook_id,))
            row = await cur.fetchone()
        survey = _slug(self.survey_no)
        sub = _slug(self.subdivision)
        mid = survey + ("/" + sub if sub else "")
        return _location_ref(row["state"] if row else "", row["village"] if row else "", mid, self.id)

    @strawberry.field
    async def passbook_ref(self) -> str:
        """Parent passbook's location-structured id — groups a parcel's files
        under its passbook folder in storage (Pattadar / Passbook / Parcel)."""
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT id, state, village, pattadar_no FROM passbooks WHERE id=%s", (self.passbook_id,))
            row = await cur.fetchone()
        if not row:
            return ""
        return _location_ref(row["state"] or "", row["village"] or "", _slug(row["pattadar_no"] or ""), row["id"])

    @strawberry.field
    async def location(self) -> ParcelLocationType:
        """Village / mandal / district / state, inherited from the parent passbook."""
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT state, district, mandal, village FROM passbooks WHERE id=%s", (self.passbook_id,))
            row = await cur.fetchone()
        return ParcelLocationType(
            village=(row["village"] if row else "") or "",
            mandal=(row["mandal"] if row else "") or "",
            district=(row["district"] if row else "") or "",
            state=(row["state"] if row else "") or "",
        )

    @strawberry.field
    async def owners(self) -> List[ParcelOwnerType]:
        """Ownership / mutation history, newest current owner first."""
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM parcel_owners WHERE parcel_id=%s "
                "ORDER BY is_current DESC, mutation_date DESC, created_at DESC", (self.id,))
            return [to_type(ParcelOwnerType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def current_owner(self) -> str:
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT owner_name FROM parcel_owners WHERE parcel_id=%s AND is_current "
                "ORDER BY created_at DESC LIMIT 1", (self.id,))
            row = await cur.fetchone()
            if row and row["owner_name"]:
                return row["owner_name"]
            cur2 = await conn.execute("SELECT owner_name FROM passbooks WHERE id=%s", (self.passbook_id,))
            r2 = await cur2.fetchone()
            return (r2["owner_name"] if r2 else "") or ""


@strawberry.type
class ProjectType:
    id: str
    owner_user_id: str
    name: str
    builder_name: str = ""
    project_type: str = ""
    rera_no: str = ""
    address: str = ""
    city: str = ""
    geo_point: str = ""
    created_at: str = ""


@strawberry.type
class PropertyType:
    id: str
    owner_user_id: str
    group_id: str = ""
    stake: str = "owned"
    project_id: str = ""
    type: str = "open_plot"
    label: str = ""
    address: str = ""
    locality: str = ""
    city: str = ""
    district: str = ""
    geo_point: str = ""
    # Corner-ordered "lat,lng;lat,lng;…" — same convention as the parcel's.
    boundary: str = ""
    land_area: float = 0.0
    land_unit: str = "Sq.yd"
    builtup_area: float = 0.0
    builtup_unit: str = "Sq.ft"
    acquisition_mode: str = "purchase"
    holding_status: str = "owned"
    purchase_price: float = 0.0
    purchase_date: str = ""
    guideline_value: float = 0.0
    market_value: float = 0.0
    current_value: float = 0.0
    reg_doc_no: str = ""
    sro: str = ""
    reg_date: str = ""
    ghmc_assessment_no: str = ""
    khata_no: str = ""
    rera_no: str = ""
    ec_status: str = ""
    ec_date: str = ""
    mutation_status: str = ""
    tax_paid_upto: str = ""
    litigation: bool = False
    litigation_note: str = ""
    attributes: str = ""
    notes: str = ""
    created_at: str = ""

    @strawberry.field
    async def current_owner(self) -> str:
        """Current owner name(s) from property_owners (is_current), comma-joined."""
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT owner_name FROM property_owners WHERE property_id=%s AND is_current "
                "ORDER BY created_at", (self.id,))
            rows = await cur.fetchall()
            return ", ".join(r["owner_name"] for r in rows if r["owner_name"])


@strawberry.type
class PropertyOwnerType:
    id: str
    property_id: str
    owner_name: str = ""
    user_id: str = ""
    group_id: str = ""
    share_pct: float = 0.0
    role: str = "owner"
    is_current: bool = True
    created_at: str = ""


@strawberry.type
class DocumentType:
    id: str
    parcel_id: str
    passbook_id: str
    owner_user_id: str
    doc_type: str
    file_ref: str
    doc_no: str
    sro_code: str
    reg_year: str
    version: int
    source: str
    tags: str
    created_at: str
    property_id: str = ""
    # Layer 1 of the vault: the FILE's own facts, carried on the row instead of
    # being fetched from the storage node per render. A list of 200 documents
    # used to cost 200 node lookups just to learn its own filenames, and none
    # of it worked offline.
    name: str = ""
    size_bytes: int = 0
    mime_type: str = ""
    # → registered_documents.id, '' while nothing has read this file. The
    # pointer runs file → reading so a reading can be deleted or replaced (a
    # better scan) without the file's identity changing.
    reading_id: str = ""


@strawberry.type
class DocumentLinkType:
    """One edge in the paper trail: this document cites that one.

    "Bought from A, sold on to C" is two deeds and one FACT — that the second
    cites the first. Without the edge a chain of title is a pile of unrelated
    rows, and the reader's own citation (`reading.links[]`) can never become
    more than a dashed card saying "cited, not filed".
    """
    id: str
    owner_user_id: str
    from_document_id: str
    to_document_id: str
    relation: str
    note: str
    created_at: str
    # Filled by the resolver so a client can draw the trail without a second
    # round trip per hop.
    other_name: str = ""
    other_doc_type: str = ""
    other_reg_year: str = ""
    # Which way this edge points relative to the document that was asked
    # about: "cites" (this one points at the other) or "cited_by".
    direction: str = "cites"


# A relation a person can assert between two papers. Free text is refused — a
# trail whose edges say whatever somebody typed cannot be walked.
DOCUMENT_RELATIONS = ("prior_title", "gpa", "amendment", "correction", "ec_for")


@strawberry.type
class GroupType:
    id: str
    owner_user_id: str
    type: str
    name: str
    description: str
    my_role: str = ""
    member_count: int = 0
    #: Passbooks (khatas) assigned to this group. NOT the number of things the
    #: group holds — a khata can contain many parcels, or none at all. Kept with
    #: its original meaning because the previous app's screen labels it
    #: "N passbooks"; use `parcel_count`/`property_count` for holdings.
    land_count: int = 0
    #: Agricultural extent, in acres, of the parcels under this group's khatas.
    total_extent: float = 0.0
    total_share: float = 0.0
    created_at: str = ""
    #: What the group actually holds, counted the way the Properties screen
    #: counts it. `land_count` above could read "3 passbooks" for a group whose
    #: khatas were all empty, which is how a group holding nothing came to
    #: report three holdings and an extent of zero.
    parcel_count: int = 0
    #: Built property — flats, shops, plots — assigned to this group directly.
    #: These have no passbook, which is why they are invisible to `land_count`.
    property_count: int = 0
    #: Account activity belongs to the owner/head. It is deliberately named
    #: "active", not "login": Query.me records an authenticated heartbeat.
    head_name: str = ""
    last_active_at: str = ""
    inactivity_stage: str = "active"
    inactivity_next_at: str = ""
    inactivity_last_outcome: str = ""
    inactive_contact_gaps: int = 0


@strawberry.type
class BeneficiaryType:
    id: str
    parcel_id: str
    person_name: str
    person_contact: str
    relationship: str
    share_pct: float
    kind: str
    status: str
    present_address: str = ""
    dob: str = ""
    is_minor: bool = False
    marital_status: str = ""
    spouse_name: str = ""
    spouse_contact: str = ""
    spouse_status: str = ""
    guardian_name: str = ""
    guardian_contact: str = ""
    invite_token: str = ""
    aadhaar_masked: str = ""
    gender: str = ""
    photo: str = ""
    phone: str = ""
    email: str = ""


@strawberry.type
class FamilyMemberType:
    id: str
    owner_user_id: str
    name: str
    relation: str          # self/spouse/father/mother/son/daughter/brother/sister/grandfather/grandmother/grandson/granddaughter/other
    gender: str
    dob: str
    phone: str
    email: str
    bio: str
    is_beneficiary: bool
    share_pct: float
    invite_status: str     # ''/invited/joined
    photo: str
    created_at: str


@strawberry.type
class ParcelFieldType:
    parcel_id: str
    field_key: str
    state: str
    value: str
    source: str
    source_ref: str
    verified_at: str
    expires_at: str
    na_reason: str
    updated_at: str


@strawberry.type
class PersonType:
    id: str
    owner_user_id: str
    group_id: str = ""
    role: str = ""
    name: str
    relation: str
    gender: str
    dob: str
    phone: str
    email: str
    bio: str
    photo: str
    is_self: bool
    father_id: str
    mother_id: str
    spouse_id: str
    is_beneficiary: bool
    share_pct: float
    kind: str
    status: str
    invite_status: str
    invite_token: str
    phone_verified: bool = False
    email_verified: bool = False
    inactivity_email_consent: bool = False
    parcel_id: str
    present_address: str
    aadhaar_masked: str
    is_minor: bool
    guardian_name: str
    guardian_contact: str
    marital_status: str
    spouse_name: str
    spouse_contact: str
    spouse_status: str
    created_at: str


@strawberry.type
class NotificationLogType:
    id: str
    owner_user_id: str
    channel: str
    recipient: str
    subject: str
    body: str
    provider: str
    status: str
    error: str
    created_at: str


@strawberry.type
class NotifierType:
    member_id: str
    name: str
    relation: str
    contact: str
    priority: int
    channel: str = "email"
    eligible: bool = False


@strawberry.type
class NoteType:
    id: str
    owner_user_id: str
    entity_type: str
    entity_id: str
    body: str
    created_at: str


@strawberry.type
class LandFeatureType:
    id: str
    owner_user_id: str
    entity_type: str
    entity_id: str
    #: corners | water | access | power | structure | crop | other
    category: str
    label: str
    value: float
    unit: str
    #: A service number, a connection id.
    reference: str
    #: Who drilled it, built it, wound the motor.
    vendor: str
    #: "Yields 1.5 inch after summer" — how it is doing, not what it is.
    condition: str
    note: str
    created_at: str


@strawberry.type
class LandExpenseType:
    id: str
    owner_user_id: str
    entity_type: str
    entity_id: str
    #: Free text on purpose — see `land_expenses` in the schema.
    category: str
    title: str
    amount: float
    spent_on: str
    vendor: str
    note: str
    created_at: str


@strawberry.type
class WorkRequestType:
    id: str
    owner_user_id: str
    #: survey | legal | photos | drafting | errand | rent
    kind: str
    title: str
    entity_type: str
    entity_id: str
    assignee: str
    cost: float
    #: How far along, indexing into the stage names for this kind.
    stage: int
    #: Waiting on the OWNER rather than on the person doing it.
    needs_you: bool
    note: str
    due_date: str
    closed: bool
    created_at: str


@strawberry.type
class InvitationType:
    id: str
    scope_type: str
    scope_id: str
    role: str
    invitee_contact: str
    token: str
    expiry: str
    status: str
    created_at: str


@strawberry.type
class SroOfficeType:
    id: str
    code: str
    name: str
    dr_zone: str
    district: str
    mandal: str


@strawberry.type
class StateType:
    id: str
    name: str
    code: str


@strawberry.type
class DistrictType:
    id: str
    name: str
    code: str
    state_id: str


@strawberry.type
class MandalType:
    id: str
    name: str
    district_id: str


@strawberry.type
class VillageType:
    id: str
    name: str
    mandal_id: str


@strawberry.type
class DeedTypeType:
    id: str
    reg_type_en: str
    reg_type_te: str
    nature_en: str
    nature_te: str


@strawberry.type
class FeeScheduleType:
    id: str
    reg_type_en: str
    nature_en: str
    sample_consideration: float
    stamp_duty: float
    transfer_duty: float
    registration_fee: float
    user_charges: float
    stamp_rate: float
    transfer_rate: float
    reg_rate: float
    user_rate: float


@strawberry.type
class MarketValueType:
    id: str
    district: str
    mandal: str
    village: str
    classification: str
    rate_per_unit: float
    unit: str
    effective_from: str


@strawberry.type
class ServiceRequestType:
    id: str
    req_type: str
    parcel_id: str
    sro_code: str
    status: str
    details: str
    created_at: str


@strawberry.type
class AuditEventType:
    id: str
    actor: str
    action: str
    target: str
    details: str
    timestamp: str


@strawberry.type
class AuditEventV2Type:
    """The centralized, classified audit envelope (audit_events_v2).

    Distinct from the legacy AuditEventType: it separates who acted
    (actorPrincipal/actorKind) from whose data it concerns (affectedOwner),
    records the outcome, data class and which service emitted it, and carries
    only allowlisted metadata as a JSON string. No free-text PII column."""
    id: str
    occurredAt: str
    sourceService: str
    actorPrincipal: str
    actorKind: str
    affectedOwner: str
    action: str
    resourceType: str
    resourceId: str
    outcome: str
    dataClass: str
    requestId: str
    metadata: str


def _audit_v2_row(row) -> AuditEventV2Type:
    """Map an audit_events_v2 row to its GraphQL type. metadata is already
    allowlisted at write time, so serializing it here cannot leak PII."""
    return AuditEventV2Type(
        id=row["event_id"],
        occurredAt=str(row["occurred_at"]),
        sourceService=row["source_service"],
        actorPrincipal=row["actor_principal"],
        actorKind=row["actor_kind"],
        affectedOwner=row["affected_owner"],
        action=row["action"],
        resourceType=row["resource_type"],
        resourceId=row["resource_id"],
        outcome=row["outcome"],
        dataClass=row["data_class"],
        requestId=row["request_id"],
        metadata=json.dumps(row["metadata"] or {}, ensure_ascii=False),
    )


@strawberry.type
class StampDutyResultType:
    deed_type: str
    consideration: float
    market_value: float
    stamp_duty: float
    transfer_duty: float
    registration_fee: float
    user_charges: float
    total: float


@strawberry.type
class DashboardStatsType:
    total_passbooks: int
    total_parcels: int
    total_documents: int
    total_beneficiaries: int
    pending_invitations: int
    estimated_value: float
    total_extent: float
    total_groups: int = 0


@strawberry.type
class PropertyPortfolioStatsType:
    total: int
    total_value: float
    attention: int


@strawberry.type
class ReferenceStatsType:
    states: int
    districts: int
    mandals: int
    villages: int
    sro_offices: int
    deed_types: int
    fee_schedule: int


@strawberry.type
class FavouriteType:
    id: str
    entity_type: str
    entity_id: str
    created_at: str


@strawberry.type
class DocumentPartyType:
    id: str
    document_id: str
    role: str
    name: str
    parentage: str
    age: str
    address: str
    is_gpa: bool


@strawberry.type
class ParcelPhotoType:
    """A photograph of the land, with the metadata that makes it evidence.

    `latitude`/`longitude`/`heading` are optional because a photo picked from
    the library may carry no EXIF location at all — and a missing coordinate
    must read as missing, never as 0,0 in the Gulf of Guinea.
    """
    id: str
    parcel_id: str
    file_ref: str
    category: str
    caption: str
    latitude: Optional[float]
    longitude: Optional[float]
    heading: Optional[float]
    captured_at: str
    captured_by: str
    is_cover: bool
    created_at: str


@strawberry.type
class PropertyPhotoType:
    """ParcelPhotoType's contract, for the non-agri Property entity — same
    evidence-first columns, same optional-means-missing coordinates."""
    id: str
    property_id: str
    file_ref: str
    category: str
    caption: str
    latitude: Optional[float]
    longitude: Optional[float]
    heading: Optional[float]
    captured_at: str
    captured_by: str
    is_cover: bool
    created_at: str


@strawberry.type
class RegisteredDocumentType:
    id: str
    owner_user_id: str
    doc_type: str
    document_no: str
    reg_year: str
    book_no: str
    sro: str
    registration_date: str
    execution_date: str
    consideration: float
    stamp_duty: float
    transfer_duty: float
    registration_fee: float
    user_charges: float
    total_fee: float
    village: str
    mandal: str
    district: str
    survey_no: str
    plot_no: str
    extent: str
    classification: str
    boundary_north: str
    boundary_south: str
    boundary_east: str
    boundary_west: str
    prior_document: str
    gpa_document: str
    scanning_id: str
    file_ref: str
    passbook_id: str
    parcel_id: str
    # The column has existed since create_property_from_document shipped, but
    # the type never exposed it — so nothing could ask which property a deed
    # belongs to, and the holding screen could not show its own deeds.
    property_id: str
    headline: str
    summary: str
    # Stored as a JSON array; exposed only through `caveatList` below, so the
    # wire never carries a string the client has to know how to parse.
    caveats: strawberry.Private[str]
    key_points: strawberry.Private[str]
    created_at: str
    # The full extraction, verbatim JSON — the document viewer's source of
    # truth for language, the Telugu summary, page ranges, per-field pages
    # and confidence. Empty on rows filed before it existed.
    reading: str = ""

    @strawberry.field
    def key_point_list(self) -> List[str]:
        """The scannable facts, in the order they were written."""
        try:
            v = json.loads(self.key_points or "[]")
            return [str(x) for x in v] if isinstance(v, list) else []
        except Exception:
            return []

    @strawberry.field
    def caveat_list(self) -> List[str]:
        """The reader's own "check this yourself" notes, as a list."""
        try:
            v = json.loads(self.caveats or "[]")
            return [str(x) for x in v] if isinstance(v, list) else []
        except Exception:
            return []

    @strawberry.field
    def ref(self) -> str:
        """Unique reference for the registered document."""
        return "DOC-" + _short_code(self.id)

    @strawberry.field
    async def parties(self) -> List[DocumentPartyType]:
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM document_parties WHERE document_id=%s ORDER BY role, name", (self.id,))
            return [to_type(DocumentPartyType, r) for r in await cur.fetchall()]


# ── Identity helpers ──────────────────────────────────────────────────

def _uid_from_info(info) -> str:
    """The current user's id from the gateway-injected x-user-id header."""
    try:
        uid = (info.context["request"].headers.get("x-user-id") or "").strip()
    except (KeyError, AttributeError, TypeError):
        uid = ""
    if not uid:
        raise NotAuthorized("Authentication required")
    return uid


def _uid_from_request(request) -> str:
    """The same identity for the REST routes, which sit outside the schema
    extension. Empty means unauthenticated — the caller answers 401; there is
    no shared fallback owner."""
    return (request.headers.get("x-user-id") or "").strip()


def _internal_proxy_ok(request) -> bool:
    """Is this caller allowed onto the /internal/ routes?

    The gateway refuses to proxy any path with an `internal` segment, so these
    are already deployment-only; this is the second lock, for a caller that can
    reach the container directly. Fails OPEN when INTERNAL_PROXY_SECRET is unset
    — local dev and a half-rolled deploy must keep working — and closed the
    moment it is set, the same shape as the CRON_SECRET check below.
    """
    secret = os.getenv("INTERNAL_PROXY_SECRET", "").strip()
    if not secret:
        return True
    return hmac.compare_digest(
        (request.headers.get("x-internal-proxy-secret") or "").strip(), secret)


class RequireAuthenticatedRoot(SchemaExtension):
    """API defense in depth: only purpose-bound capability mutations are public.

    The API is private behind the gateway; only its stripped/injected identity
    header is trusted. Public roots validate and consume their own scoped token.
    """
    def resolve(self, next_, root, info, *args, **kwargs):
        if info.parent_type.name in {"Query", "Mutation"}:
            public_mutations = {"verifyBeneficiary", "acknowledgeInactivity"}
            if not (info.parent_type.name == "Mutation" and info.field_name in public_mutations):
                _uid_from_info(info)
        if info.parent_type.name == "Mutation" and info.field_name in {
            "addDocument", "createDocument", "updateDocument", "createRegisteredDocument", "updateRegisteredDocument",
        }:
            async def with_consent():
                import inspect
                from . import account
                await account.require_purpose(_uid_from_info(info), "document_processing")
                result = next_(root, info, *args, **kwargs)
                return await result if inspect.isawaitable(result) else result
            return with_consent()
        return next_(root, info, *args, **kwargs)


# Type-qualified scopes avoid matching an unrelated table's colliding id.
_INVITATION_OWNED = """(
 (scope_type='passbook' AND scope_id IN (SELECT id FROM passbooks WHERE owner_user_id=%s))
 OR (scope_type='parcel' AND scope_id IN (SELECT p.id FROM parcels p JOIN passbooks pb ON pb.id=p.passbook_id WHERE pb.owner_user_id=%s))
 OR (scope_type='document' AND scope_id IN (SELECT id FROM documents WHERE owner_user_id=%s))
 OR (scope_type IN ('family', 'beneficiary') AND scope_id IN (SELECT id FROM family_members WHERE owner_user_id=%s))
 OR (scope_type='beneficiary' AND scope_id IN (SELECT b.id FROM beneficiaries b LEFT JOIN parcels p ON p.id=b.parcel_id LEFT JOIN passbooks pb ON pb.id=p.passbook_id WHERE b.owner_user_id=%s OR pb.owner_user_id=%s))
)"""


def _invitation_expiry() -> str:
    return (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()


def _invitation_is_current(invitation: dict) -> bool:
    if invitation.get("status") != "pending":
        return False
    try:
        # Old invitations lacked an expiry. Preserve their intended seven-day
        # window from issuance; an absent/malformed timestamp never lasts forever.
        raw = invitation.get("expiry") or invitation.get("created_at") or ""
        expiry = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if not invitation.get("expiry"):
            expiry += timedelta(days=7)
        return expiry > datetime.now(timezone.utc)
    except (ValueError, TypeError, AttributeError):
        return False


# Who may touch a `documents` row: its owner, or the owner of the land it is
# filed against. Written out five times before this, and one of the copies was
# missing the `owner_user_id` arm — which is why unlinked uploads could not be
# deleted. One string, four `uid` parameters, every caller identical.
_DOC_OWNED = (
    "(owner_user_id = %s "
    " OR parcel_id IN (SELECT id FROM parcels WHERE passbook_id IN "
    "                  (SELECT id FROM passbooks WHERE owner_user_id = %s)) "
    " OR passbook_id IN (SELECT id FROM passbooks WHERE owner_user_id = %s) "
    " OR property_id IN (SELECT id FROM properties WHERE owner_user_id = %s))"
)


def _doc_owner_args(uid: str) -> tuple:
    """The four repeats `_DOC_OWNED` binds."""
    return (uid, uid, uid, uid)


def _mask_aadhaar(raw: str) -> str:
    """Strict masked display; malformed input never passes through."""
    return aadhaar_security.mask(raw)


async def encrypt_aadhaar(raw: str, owner: str, subject_kind: str, subject_id: str) -> str:
    """Versioned KMS ciphertext, with a local-only/legacy Fernet bridge."""
    _masked, token = await aadhaar_security.encrypt_number(raw, owner, subject_kind, subject_id)
    return token


async def decrypt_aadhaar(token: str, owner: str, subject_kind: str, subject_id: str) -> str:
    return await aadhaar_security.decrypt_number(token, owner, subject_kind, subject_id)


def _is_minor(dob: str) -> bool:
    """True if the ISO date-of-birth (YYYY-MM-DD) is under 18 years old."""
    dob = (dob or "").strip()
    if not dob:
        return False
    try:
        d = datetime.fromisoformat(dob[:10]).date()
    except Exception:
        return False
    today = datetime.utcnow().date()
    age = today.year - d.year - ((today.month, today.day) < (d.month, d.day))
    return age < 18


class NotAuthorized(Exception):
    """The signed-in user tried to act on a record they don't own."""


async def _assert_owns_passbook(conn, uid: str, passbook_id: str) -> None:
    cur = await conn.execute(
        "SELECT 1 FROM passbooks WHERE id=%s AND owner_user_id=%s", (passbook_id, uid)
    )
    if not await cur.fetchone():
        raise NotAuthorized("Not authorized for this passbook")


async def _assert_owns_parcel(conn, uid: str, parcel_id: str) -> None:
    cur = await conn.execute(
        "SELECT 1 FROM parcels WHERE id=%s AND passbook_id IN "
        "(SELECT id FROM passbooks WHERE owner_user_id=%s)", (parcel_id, uid)
    )
    if not await cur.fetchone():
        raise NotAuthorized("Not authorized for this parcel")


async def _assert_owns_property(conn, uid: str, property_id: str) -> None:
    cur = await conn.execute(
        "SELECT 1 FROM properties WHERE id=%s AND owner_user_id=%s", (property_id, uid)
    )
    if not await cur.fetchone():
        raise NotAuthorized("Not authorized for this property")


async def _assert_owns_scope(conn, uid: str, scope_id: str) -> None:
    cur = await conn.execute(
        "SELECT 1 FROM passbooks WHERE id=%s AND owner_user_id=%s "
        "UNION ALL SELECT 1 FROM parcels WHERE id=%s AND passbook_id IN "
        "(SELECT id FROM passbooks WHERE owner_user_id=%s)", (scope_id, uid, scope_id, uid)
    )
    if not await cur.fetchone():
        raise NotAuthorized("Not authorized for this scope")


# ── Audit helper ──────────────────────────────────────────────────────

async def log_audit(conn, actor: str, action: str, target: str, details: str = "",
                    *, affected_owner: str = "", actor_kind: str = "",
                    metadata: Optional[dict] = None, outcome: str = "success",
                    request_id: str = ""):
    """Record one audited action.

    Dual-writes for the phase-1 audit migration:
      1. The legacy `audit_events` row (unchanged shape) so the existing
         /legacy/audit view and every downstream reader keep working.
      2. A classified envelope event onto the centralized transactional outbox
         (`audit.enqueue`) on THIS connection, so the audit record commits with
         the business change instead of best-effort after it.

    `actor` is who acted. For an owner acting on their own data that is also the
    affected owner, which is the default; callers that act across owners
    (desk_read) or as system/recipient pass `affected_owner`/`actor_kind`
    explicitly. `metadata` is filtered against the action's allowlist inside the
    audit module, so a caller cannot leak free-text PII through it — the legacy
    `details` string is intentionally NOT copied into the envelope.

    The envelope enqueue honors the fail-closed policy: a critical action
    (e.g. reveal_aadhaar, desk_read) that cannot be recorded raises and rolls
    back the caller's transaction; a non-critical one degrades to a logged
    warning so a routine write is never blocked by the audit subsystem.
    """
    # The two writes are one record in two shapes, so they commit together: a
    # critical action whose envelope cannot be enqueued must not leave a legacy
    # row claiming it happened. On a caller that is already in a transaction
    # this is a savepoint, so it never widens anyone's transaction.
    async with conn.transaction():
        await conn.execute(
            "INSERT INTO audit_events (id, actor, action, target, details, timestamp) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (new_id(), actor, action, target, details, datetime.utcnow().isoformat()),
        )
        await audit.record(
            conn,
            action=action,
            actor_principal=actor,
            affected_owner=affected_owner or actor,
            resource_id=target,
            outcome=outcome,
            actor_kind=actor_kind or audit.ACTOR_OWNER,
            metadata=metadata,
            request_id=request_id,
        )




def _levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a or not b:
        return len(a) or len(b)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (0 if ca == cb else 1)))
        prev = cur
    return prev[-1]


def _merge_threshold(n: int) -> int:
    """Mirrors packages/core canonicalizeVillages: short names never merge."""
    if n <= 4:
        return 0
    return 2 if n <= 9 else 3


async def _canonical_village(conn, uid: str, village: str, mandal: str, district: str) -> str:
    """Adopt an existing spelling of the same village rather than adding a new one.

    Canonicalising only at display meant the database kept accumulating
    variants — "Katragunta" and "Katraguntla" both live rows — and the app
    warned the user about data it had itself created. Normalising on write stops
    the second spelling ever existing.
    """
    v = (village or "").strip()
    if not v:
        return v
    rows = await (await conn.execute(
        "SELECT DISTINCT village FROM passbooks WHERE owner_user_id=%s AND mandal=%s AND district=%s",
        (uid, mandal or "", district or ""))).fetchall()
    key = v.lower()
    best = None
    for r in rows:
        existing = (r["village"] or "").strip()
        if not existing:
            continue
        if existing.lower() == key:
            return existing
        limit = min(_merge_threshold(len(existing)), _merge_threshold(len(key)))
        d = _levenshtein(existing.lower(), key)
        if d <= limit and (best is None or d < best[0]):
            best = (d, existing)
    return best[1] if best else v


def _area_sq_yd(raw) -> float:
    """Square yards from a deed's free-text extent.

    Mirrors packages/core parseAreaSqYd. Joining every digit turned the real
    string "418-1/2 sq. yards" into 41812 — a hundredfold error written into a
    land record. Mixed fractions like "418-1/2" are ordinary in AP deeds.
    """
    s = str(raw or "").lower().replace(",", "").strip()
    if not s:
        return 0.0
    m = re.search(r"(\d+)\s*[-\s]\s*(\d+)\s*/\s*(\d+)", s)
    if m:
        whole, num, den = m.groups()
        return float(whole) + (float(num) / float(den) if float(den) else 0.0)
    m = re.match(r"^(\d+)\s*/\s*(\d+)", s)
    if m:
        num, den = m.groups()
        return float(num) / float(den) if float(den) else 0.0
    m = re.search(r"\d+(?:\.\d+)?", s)
    return float(m.group(0)) if m else 0.0


def _named(prefix: str, *parts) -> str:
    """CL-547: a human label for an audit row's object.

    Deletes must call this with values read BEFORE the row is removed —
    afterwards there is nothing left to name, which is how the log ended up
    saying only "Deleted registered document". Returns '' when nothing is
    known, and the display layer then falls back to the action alone rather
    than printing an id.
    """
    kept = [str(p).strip() for p in parts if p and str(p).strip()]
    if not kept:
        return ""
    return " · ".join(([prefix] if prefix else []) + kept)


# ── Stamp Duty Calculation ───────────────────────────────────────────
# Rates come from the real IGRS fee_schedule table (derived per deed nature
# from the department's sample-consideration rows). These are the fallback
# rates for a deed type not present in the schedule (standard AP sale-deed
# rates: 5% stamp + 1.5% transfer + 1% registration + 0.05% user charges).

_DEFAULT_RATES = {"stamp": 0.05, "transfer": 0.015, "reg": 0.01, "user": 0.0005}


async def ensure_self(conn, uid: str, group_id: str, self_role: str = "") -> str:
    """Return the caller's own 'self' member id within a group, creating it from
    their profile on first use. Each group has its own self node (roots the
    family tree; marks the owner as a member of every group they create)."""
    cur = await conn.execute(
        "SELECT id FROM family_members WHERE owner_user_id=%s AND group_id=%s AND is_self=true LIMIT 1",
        (uid, group_id))
    row = await cur.fetchone()
    if row:
        return row["id"]
    u = await (await conn.execute("SELECT name, address FROM users WHERE id=%s", (uid,))).fetchone() or {}
    sid = new_id()
    cur = await conn.execute(
        "INSERT INTO family_members (id, owner_user_id, group_id, name, relation, role, is_self, "
        "is_beneficiary, present_address, invite_status, created_at) "
        "VALUES (%s,%s,%s,%s,'self',%s,true,false,%s,'',%s) "
        "ON CONFLICT (owner_user_id, group_id) WHERE is_self DO NOTHING RETURNING id",
        (sid, uid, group_id, (u.get("name") or "You"), self_role, (u.get("address") or ""),
         datetime.utcnow().isoformat()))
    row = await cur.fetchone()
    if row:
        return row["id"]
    won = await (await conn.execute(
        "SELECT id FROM family_members WHERE owner_user_id=%s AND group_id=%s AND is_self=true LIMIT 1",
        (uid, group_id))).fetchone()
    return won["id"]


async def _group_summary(conn, uid: str, g: dict) -> GroupType:
    """Build a GroupType with rollups (member count, land count, extent, share)."""
    gid = g["id"]
    mc = (await (await conn.execute(
        "SELECT count(*) AS c FROM family_members WHERE group_id=%s AND is_self=false", (gid,))).fetchone())["c"]
    lc = (await (await conn.execute(
        "SELECT count(*) AS c FROM passbooks WHERE group_id=%s AND owner_user_id=%s", (gid, uid))).fetchone())["c"]
    ext = (await (await conn.execute(
        "SELECT COALESCE(SUM(extent),0) AS t FROM parcels WHERE passbook_id IN "
        "(SELECT id FROM passbooks WHERE group_id=%s AND owner_user_id=%s)", (gid, uid))).fetchone())["t"]
    # What the group HOLDS, as opposed to how many khatas point at it. A group
    # can hold built property with no passbook behind it, and it can own a
    # passbook with nothing in it yet; neither case is answerable from `lc`.
    pc = (await (await conn.execute(
        "SELECT count(*) AS c FROM parcels WHERE passbook_id IN "
        "(SELECT id FROM passbooks WHERE group_id=%s AND owner_user_id=%s)", (gid, uid))).fetchone())["c"]
    prc = (await (await conn.execute(
        "SELECT count(*) AS c FROM properties WHERE group_id=%s AND owner_user_id=%s",
        (gid, uid))).fetchone())["c"]
    sh = (await (await conn.execute(
        "SELECT COALESCE(SUM(share_pct),0) AS s FROM family_members "
        "WHERE group_id=%s AND is_beneficiary=true AND status <> 'revoked'", (gid,))).fetchone())["s"]
    myrole = (await (await conn.execute(
        "SELECT role FROM family_members WHERE group_id=%s AND owner_user_id=%s AND is_self=true LIMIT 1",
        (gid, uid))).fetchone() or {}).get("role", "")
    head = await (await conn.execute(
        "SELECT COALESCE(NULLIF(f.name,''), NULLIF(u.name,''), 'You') AS name, "
        "COALESCE(u.last_active_at,'') AS last_active_at "
        "FROM users u LEFT JOIN family_members f ON f.owner_user_id=u.id "
        "AND f.group_id=%s AND f.is_self=true WHERE u.id=%s LIMIT 1", (gid, uid))).fetchone() or {}
    esc = await (await conn.execute(
        "SELECT stage, next_action_at, last_outcome FROM inactivity_escalations "
        "WHERE owner_user_id=%s AND group_id=%s", (uid, gid))).fetchone() or {}
    contact_gaps = 0
    if g["type"] == "family":
        contact_gaps = int((await (await conn.execute(
            "SELECT count(*) AS c FROM family_members WHERE owner_user_id=%s AND group_id=%s "
            "AND is_self=false AND is_minor=false AND (COALESCE(email,'')='' OR email_verified=false "
            "OR inactivity_email_consent=false)",
            (uid, gid))).fetchone())["c"])
    return GroupType(id=gid, owner_user_id=g["owner_user_id"], type=g["type"], name=g["name"],
                     description=g.get("description", ""), my_role=myrole or _group_primary_role(g["type"]),
                     member_count=int(mc), land_count=int(lc), total_extent=float(ext or 0),
                     total_share=float(sh or 0), created_at=g.get("created_at", ""),
                     parcel_count=int(pc), property_count=int(prc),
                     head_name=head.get("name", ""), last_active_at=head.get("last_active_at", ""),
                     inactivity_stage=esc.get("stage") or "active",
                     inactivity_next_at=esc.get("next_action_at", ""),
                     inactivity_last_outcome=esc.get("last_outcome", ""),
                     inactive_contact_gaps=contact_gaps)


# ── Query ─────────────────────────────────────────────────────────────

@strawberry.type
class Query:
    @strawberry.field
    async def web(self) -> web360.WebQuery:
        """Record-360 reads for the web app (W01–W15). See web360.py."""
        return web360.WebQuery()

    @strawberry.field
    async def passbooks(self, info: strawberry.Info) -> List[PassbookType]:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM passbooks WHERE owner_user_id = %s ORDER BY created_at DESC", (uid,)
            )
            return [to_type(PassbookType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def parcels(self, info: strawberry.Info) -> List[ParcelType]:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM parcels WHERE passbook_id IN "
                "(SELECT id FROM passbooks WHERE owner_user_id = %s) ORDER BY created_at DESC", (uid,)
            )
            return [to_type(ParcelType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def properties(self, info: strawberry.Info) -> List[PropertyType]:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM properties WHERE owner_user_id = %s ORDER BY created_at DESC", (uid,))
            return [to_type(PropertyType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def property(self, info: strawberry.Info, id: str) -> Optional[PropertyType]:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM properties WHERE id=%s AND owner_user_id=%s", (id, uid))
            row = await cur.fetchone()
            return to_type(PropertyType, row) if row else None

    @strawberry.field
    async def projects(self, info: strawberry.Info) -> List[ProjectType]:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM projects WHERE owner_user_id = %s ORDER BY created_at DESC", (uid,))
            return [to_type(ProjectType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def property_owners(self, info: strawberry.Info, property_id: str) -> List[PropertyOwnerType]:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            own = await (await conn.execute(
                "SELECT 1 FROM properties WHERE id=%s AND owner_user_id=%s", (property_id, uid))).fetchone()
            if not own:
                return []
            cur = await conn.execute(
                "SELECT * FROM property_owners WHERE property_id=%s ORDER BY created_at", (property_id,))
            return [to_type(PropertyOwnerType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def property_documents(self, info: strawberry.Info, property_id: str) -> List[DocumentType]:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            own = await (await conn.execute(
                "SELECT 1 FROM properties WHERE id=%s AND owner_user_id=%s", (property_id, uid))).fetchone()
            if not own:
                return []
            cur = await conn.execute(
                "SELECT * FROM documents WHERE property_id=%s ORDER BY created_at DESC", (property_id,))
            return [to_type(DocumentType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def property_portfolio_stats(self, info: strawberry.Info) -> PropertyPortfolioStatsType:
        uid = _uid_from_info(info)
        today = datetime.utcnow().date().isoformat()
        async with pool.connection() as conn:
            t = (await (await conn.execute(
                "SELECT count(*) AS c FROM properties WHERE owner_user_id=%s", (uid,))).fetchone())["c"]
            v = (await (await conn.execute(
                "SELECT COALESCE(SUM(current_value),0) AS s FROM properties WHERE owner_user_id=%s", (uid,))).fetchone())["s"]
            a = (await (await conn.execute(
                "SELECT count(*) AS c FROM properties WHERE owner_user_id=%s AND ("
                "(tax_paid_upto <> '' AND tax_paid_upto < %s) OR "
                "(ec_status <> '' AND ec_status <> 'clear'))", (uid, today))).fetchone())["c"]
            return PropertyPortfolioStatsType(total=t, total_value=float(v or 0), attention=a)

    @strawberry.field
    async def passbook(self, info: strawberry.Info, id: str) -> Optional[PassbookType]:
        """A single passbook the caller owns (for the passbook detail view)."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM passbooks WHERE id=%s AND owner_user_id=%s", (id, uid))
            row = await cur.fetchone()
            return to_type(PassbookType, row) if row else None

    @strawberry.field
    async def parcels_by_passbook(self, info: strawberry.Info, passbook_id: str) -> List[ParcelType]:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM parcels WHERE passbook_id=%s AND passbook_id IN "
                "(SELECT id FROM passbooks WHERE owner_user_id=%s) ORDER BY survey_no", (passbook_id, uid))
            return [to_type(ParcelType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def parcel(self, info: strawberry.Info, id: str) -> Optional[ParcelType]:
        """A single parcel the caller owns (for the Parcel 360 view)."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM parcels WHERE id=%s AND passbook_id IN "
                "(SELECT id FROM passbooks WHERE owner_user_id=%s)", (id, uid))
            row = await cur.fetchone()
            return to_type(ParcelType, row) if row else None

    @strawberry.field
    async def parcel_photos(self, info: strawberry.Info, parcel_id: str = "") -> List[ParcelPhotoType]:
        """Photos for one parcel, or every photo the caller owns when parcel_id
        is empty — the list screens need covers for many parcels at once and
        must not make one round trip per row."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            if parcel_id:
                cur = await conn.execute(
                    "SELECT * FROM parcel_photos WHERE parcel_id=%s AND owner_user_id=%s "
                    "ORDER BY is_cover DESC, created_at DESC", (parcel_id, uid))
            else:
                cur = await conn.execute(
                    "SELECT * FROM parcel_photos WHERE owner_user_id=%s "
                    "ORDER BY is_cover DESC, created_at DESC", (uid,))
            return [to_type(ParcelPhotoType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def property_photos(self, info: strawberry.Info, property_id: str = "") -> List[PropertyPhotoType]:
        """Photos for one property, or every property photo the caller owns
        when property_id is empty — same batch shape as parcel_photos, for
        the same reason (list covers without a round trip per row)."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            if property_id:
                cur = await conn.execute(
                    "SELECT * FROM property_photos WHERE property_id=%s AND owner_user_id=%s "
                    "ORDER BY is_cover DESC, created_at DESC", (property_id, uid))
            else:
                cur = await conn.execute(
                    "SELECT * FROM property_photos WHERE owner_user_id=%s "
                    "ORDER BY is_cover DESC, created_at DESC", (uid,))
            return [to_type(PropertyPhotoType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def registered_documents(self, info: strawberry.Info) -> List[RegisteredDocumentType]:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM registered_documents WHERE owner_user_id=%s ORDER BY created_at DESC", (uid,))
            return [to_type(RegisteredDocumentType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def registered_document(self, info: strawberry.Info, id: str) -> Optional[RegisteredDocumentType]:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM registered_documents WHERE id=%s AND owner_user_id=%s", (id, uid))
            row = await cur.fetchone()
            return to_type(RegisteredDocumentType, row) if row else None

    @strawberry.field
    async def documents(self, info: strawberry.Info) -> List[DocumentType]:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM documents WHERE owner_user_id = %s "
                "OR parcel_id IN (SELECT id FROM parcels WHERE passbook_id IN "
                "(SELECT id FROM passbooks WHERE owner_user_id = %s)) "
                "OR passbook_id IN (SELECT id FROM passbooks WHERE owner_user_id = %s) "
                "OR property_id IN (SELECT id FROM properties WHERE owner_user_id = %s) "
                "ORDER BY created_at DESC", (uid, uid, uid, uid)
            )
            return [to_type(DocumentType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def document_links(self, info: strawberry.Info, document_id: str) -> List[DocumentLinkType]:
        """The paper trail around one document, BOTH ways.

        A deed cites the one before it, and is cited by the one after. Asking
        only for outgoing edges would show a person half their chain and give
        no hint the other half exists.
        """
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                f"SELECT 1 FROM documents WHERE id=%s AND {_DOC_OWNED}",
                (document_id, *_doc_owner_args(uid)))
            if not await cur.fetchone():
                return []
            # The far end's name travels with the edge so a client can draw the
            # trail without one round trip per hop.
            cur = await conn.execute(
                "SELECT l.*, 'cites' AS direction, d.name AS other_name, "
                "       d.doc_type AS other_doc_type, d.reg_year AS other_reg_year "
                "  FROM document_links l JOIN documents d ON d.id = l.to_document_id "
                " WHERE l.from_document_id = %s AND l.owner_user_id = %s "
                " UNION ALL "
                "SELECT l.*, 'cited_by' AS direction, d.name AS other_name, "
                "       d.doc_type AS other_doc_type, d.reg_year AS other_reg_year "
                "  FROM document_links l JOIN documents d ON d.id = l.from_document_id "
                " WHERE l.to_document_id = %s AND l.owner_user_id = %s "
                " ORDER BY created_at",
                (document_id, uid, document_id, uid))
            return [to_type(DocumentLinkType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def favourites(self, info: strawberry.Info) -> List[FavouriteType]:
        """Everything this account has starred, across every kind of record."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM favourites WHERE owner_user_id=%s ORDER BY created_at DESC", (uid,))
            return [to_type(FavouriteType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def passbook_documents(self, info: strawberry.Info, passbook_id: str) -> List[DocumentType]:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM documents WHERE (passbook_id=%s OR parcel_id IN (SELECT id FROM parcels WHERE passbook_id=%s)) "
                "AND %s IN (SELECT owner_user_id FROM passbooks WHERE id=%s) ORDER BY created_at DESC",
                (passbook_id, passbook_id, uid, passbook_id))
            return [to_type(DocumentType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def notes(self, info: strawberry.Info, entity_type: str, entity_id: str) -> List[NoteType]:
        """Append-only note history for a passbook / parcel / document (newest first)."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM notes WHERE owner_user_id=%s AND entity_type=%s AND entity_id=%s "
                "ORDER BY created_at DESC", (uid, entity_type, entity_id),
            )
            return [to_type(NoteType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def land_expenses(self, info: strawberry.Info) -> List[LandExpenseType]:
        """What has been spent, newest first."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM land_expenses WHERE owner_user_id=%s ORDER BY spent_on DESC, created_at DESC",
                (uid,))
            return [to_type(LandExpenseType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def work_requests(self, info: strawberry.Info,
                            include_closed: bool = True) -> List[WorkRequestType]:
        """Work asked of somebody else, open first."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            sql = "SELECT * FROM work_requests WHERE owner_user_id=%s"
            if not include_closed:
                sql += " AND closed = FALSE"
            cur = await conn.execute(sql + " ORDER BY closed, created_at DESC", (uid,))
            return [to_type(WorkRequestType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def land_features(self, info: strawberry.Info, entity_type: str,
                            entity_id: str) -> List[LandFeatureType]:
        """What is on the land — borewells, corner stones, access, power."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM land_features WHERE owner_user_id=%s AND entity_type=%s "
                "AND entity_id=%s ORDER BY category, created_at", (uid, entity_type, entity_id),
            )
            return [to_type(LandFeatureType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def groups(self, info: strawberry.Info) -> List[GroupType]:
        """Groups the caller owns (v1: owner-scoped)."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute("SELECT * FROM groups WHERE owner_user_id=%s ORDER BY created_at", (uid,))
            rows = await cur.fetchall()
            return [await _group_summary(conn, uid, r) for r in rows]

    @strawberry.field
    async def group(self, info: strawberry.Info, id: str) -> Optional[GroupType]:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            row = await (await conn.execute(
                "SELECT * FROM groups WHERE id=%s AND owner_user_id=%s", (id, uid))).fetchone()
            return await _group_summary(conn, uid, row) if row else None

    @strawberry.field
    async def parcel_fields(self, info: strawberry.Info, parcel_id: str = "") -> List[ParcelFieldType]:
        """Record-completeness field states. Empty parcel_id returns every
        field the caller owns, for the portfolio-wide record-health view."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            if parcel_id:
                cur = await conn.execute(
                    "SELECT pf.* FROM parcel_fields pf JOIN parcels p ON p.id = pf.parcel_id "
                    "JOIN passbooks pb ON pb.id = p.passbook_id "
                    "WHERE pf.parcel_id=%s AND pb.owner_user_id=%s", (parcel_id, uid))
            else:
                cur = await conn.execute(
                    "SELECT pf.* FROM parcel_fields pf JOIN parcels p ON p.id = pf.parcel_id "
                    "JOIN passbooks pb ON pb.id = p.passbook_id WHERE pb.owner_user_id=%s", (uid,))
            return [to_type(ParcelFieldType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def members(self, info: strawberry.Info, group_id: str) -> List[PersonType]:
        """Members of a group the caller owns, rooted by the caller's self node."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            own = await (await conn.execute(
                "SELECT type FROM groups WHERE id=%s AND owner_user_id=%s", (group_id, uid))).fetchone()
            if not own:
                return []
            await ensure_self(conn, uid, group_id, _group_primary_role(own["type"]))
            cur = await conn.execute(
                "SELECT * FROM family_members WHERE owner_user_id=%s AND group_id=%s "
                "ORDER BY is_self DESC, created_at", (uid, group_id))
            return [to_type(PersonType, without_token(r)) for r in await cur.fetchall()]

    @strawberry.field
    async def group_activity(self, info: strawberry.Info, group_id: str) -> List[AuditEventType]:
        """Audit events relevant to a group the caller owns: the group itself, its
        members, its passbooks and the property assigned to it. Powers the
        group's Activity tab."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            own = await (await conn.execute(
                "SELECT 1 FROM groups WHERE id=%s AND owner_user_id=%s", (group_id, uid))).fetchone()
            if not own:
                return []
            cur = await conn.execute(
                "SELECT * FROM audit_events WHERE actor=%s AND (target=%s "
                "OR target IN (SELECT id FROM family_members WHERE group_id=%s) "
                "OR target IN (SELECT id FROM passbooks WHERE group_id=%s) "
                # Built property is the other half of what a group holds, and
                # `assign_property_to_group` audits against the property id —
                # so without this line moving a flat into a group happened, was
                # logged, and never appeared in that group's history.
                "OR target IN (SELECT id FROM properties WHERE group_id=%s AND owner_user_id=%s)) "
                "ORDER BY timestamp DESC LIMIT 50",
                (uid, group_id, group_id, group_id, group_id, uid))
            return [to_type(AuditEventType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def invitations(self, info: strawberry.Info) -> List[InvitationType]:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM invitations WHERE " + _INVITATION_OWNED + " ORDER BY created_at DESC", (uid,) * 6)
            return [to_type(InvitationType, without_token(r, "token")) for r in await cur.fetchall()]

    @strawberry.field
    async def pending_invitations(self, info: strawberry.Info) -> List[InvitationType]:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM invitations WHERE status='pending' AND " + _INVITATION_OWNED + " ORDER BY created_at DESC", (uid,) * 6)
            return [to_type(InvitationType, without_token(r, "token")) for r in await cur.fetchall()]

    @strawberry.field
    async def sro_offices(self) -> List[SroOfficeType]:
        async with pool.connection() as conn:
            cur = await conn.execute("SELECT * FROM sro_offices ORDER BY code")
            return [to_type(SroOfficeType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def states(self) -> List[StateType]:
        async with pool.connection() as conn:
            cur = await conn.execute("SELECT * FROM states ORDER BY name")
            return [to_type(StateType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def districts(self) -> List[DistrictType]:
        async with pool.connection() as conn:
            cur = await conn.execute("SELECT * FROM districts ORDER BY name")
            return [to_type(DistrictType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def districts_by_state(self, state_id: str) -> List[DistrictType]:
        async with pool.connection() as conn:
            cur = await conn.execute("SELECT * FROM districts WHERE state_id=%s ORDER BY name", (state_id,))
            return [to_type(DistrictType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def mandals_by_district(self, district_id: str) -> List[MandalType]:
        async with pool.connection() as conn:
            cur = await conn.execute("SELECT * FROM mandals WHERE district_id=%s ORDER BY name", (district_id,))
            return [to_type(MandalType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def villages_by_mandal(self, mandal_id: str) -> List[VillageType]:
        async with pool.connection() as conn:
            cur = await conn.execute("SELECT * FROM villages WHERE mandal_id=%s ORDER BY name", (mandal_id,))
            return [to_type(VillageType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def deed_types(self) -> List[DeedTypeType]:
        async with pool.connection() as conn:
            cur = await conn.execute("SELECT * FROM deed_types ORDER BY reg_type_en, nature_en")
            return [to_type(DeedTypeType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def fee_schedule(self) -> List[FeeScheduleType]:
        async with pool.connection() as conn:
            cur = await conn.execute("SELECT * FROM fee_schedule ORDER BY reg_type_en, nature_en")
            return [to_type(FeeScheduleType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def reference_stats(self) -> ReferenceStatsType:
        """Live counts of the loaded AP-IGRS reference data (for the dashboard)."""
        async with pool.connection() as conn:
            async def _count(tbl: str) -> int:
                cur = await conn.execute(f"SELECT count(*) AS c FROM {tbl}")
                return (await cur.fetchone())["c"]
            return ReferenceStatsType(
                states=await _count("states"),
                districts=await _count("districts"),
                mandals=await _count("mandals"),
                villages=await _count("villages"),
                sro_offices=await _count("sro_offices"),
                deed_types=await _count("deed_types"),
                fee_schedule=await _count("fee_schedule"),
            )

    @strawberry.field
    async def me(self, info: strawberry.Info) -> UserType:
        """The signed-in user's profile (auto-provisioned on first access)."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            await conn.execute(
                "INSERT INTO users (id, name, email) VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING",
                (uid, uid, ""),
            )
            prior_row = await (await conn.execute(
                "SELECT last_active_at FROM users WHERE id=%s", (uid,))).fetchone()
            # Heartbeat for the inactivity dead-man's-switch (Phase 3).
            if uid and uid != "guest":
                await conn.execute("UPDATE users SET last_active_at=%s WHERE id=%s",
                                   (datetime.utcnow().isoformat(), uid))
            cur = await conn.execute("SELECT * FROM users WHERE id=%s", (uid,))
            user = to_type(UserType, await cur.fetchone())
            # Surface the PREVIOUS session's activity, not the heartbeat just written.
            user.last_active_at = (prior_row or {}).get("last_active_at") or ""
            return user

    @strawberry.field
    async def market_values(self) -> List[MarketValueType]:
        async with pool.connection() as conn:
            cur = await conn.execute("SELECT * FROM market_values ORDER BY district, mandal, village")
            return [to_type(MarketValueType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def notification_log(self, info: strawberry.Info, limit: int = 50) -> List[NotificationLogType]:
        """Recent notification sends for the caller (the default `stub` provider
        records without delivering) — confirm invites/alerts fired without needing
        an email/SMS account wired up yet."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM notification_log WHERE owner_user_id=%s ORDER BY created_at DESC LIMIT %s",
                (uid, max(1, min(limit, 200))))
            return [to_type(NotificationLogType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def notifiers(self, info: strawberry.Info, group_id: str) -> List[NotifierType]:
        """Return the ordered inactivity list. With no configured order, every
        non-self member is returned at priority 0 so clients can explain the
        email-all default. Eligibility is computed server-side from a verified
        email; phone contacts are never silently included in that broadcast."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            own = await (await conn.execute(
                "SELECT type FROM groups WHERE id=%s AND owner_user_id=%s", (group_id, uid))).fetchone()
            if not own or own["type"] != "family":
                return []
            members = {m["id"]: m for m in await (await conn.execute(
                "SELECT id, name, relation, role, email, email_verified, inactivity_email_consent, is_minor "
                "FROM family_members WHERE owner_user_id=%s AND group_id=%s AND is_self=false", (uid, group_id))).fetchall()}
            rows = await (await conn.execute(
                "SELECT member_id, priority, channel FROM family_notifiers "
                "WHERE owner_user_id=%s AND group_id=%s ORDER BY priority", (uid, group_id))).fetchall()

            def _mk(mid, prio, channel="email"):
                m = members.get(mid)
                if not m:
                    return None
                email = (m.get("email") or "").strip()
                eligible = bool(email and not m.get("is_minor") and m.get("email_verified")
                                and m.get("inactivity_email_consent") and channel == "email")
                return NotifierType(member_id=mid, name=m["name"] or "",
                                    relation=m["relation"] or m["role"] or "",
                                    contact=email, priority=prio, channel=channel,
                                    eligible=eligible)
            if rows:
                out = [_mk(r["member_id"], r["priority"], r.get("channel") or "email") for r in rows]
                return [n for n in out if n]
            return [n for n in (_mk(mid, 0) for mid in members) if n]

    @strawberry.field
    async def audit_events(self, info: strawberry.Info, target: str = "") -> List[AuditEventType]:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            if target:
                cur = await conn.execute(
                    "SELECT * FROM audit_events WHERE actor=%s AND target=%s ORDER BY timestamp DESC LIMIT 200", (uid, target)
                )
            else:
                cur = await conn.execute(
                    "SELECT * FROM audit_events WHERE actor=%s ORDER BY timestamp DESC LIMIT 200", (uid,)
                )
            return [to_type(AuditEventType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def passbook_activity(self, info: strawberry.Info, passbook_id: str) -> List[AuditEventType]:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            owns = await conn.execute("SELECT 1 FROM passbooks WHERE id=%s AND owner_user_id=%s", (passbook_id, uid))
            if not await owns.fetchone():
                return []
            cur = await conn.execute(
                "SELECT * FROM audit_events WHERE actor=%s AND (target=%s OR target IN "
                "(SELECT id FROM parcels WHERE passbook_id=%s)) ORDER BY timestamp DESC LIMIT 200",
                (uid, passbook_id, passbook_id))
            return [to_type(AuditEventType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def recent_audit_events(self, info: strawberry.Info) -> List[AuditEventType]:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM audit_events WHERE actor=%s ORDER BY timestamp DESC LIMIT 10", (uid,)
            )
            return [to_type(AuditEventType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def audit_trail(
        self, info: strawberry.Info, action: str = "", since: str = "",
        limit: int = 200,
    ) -> List[AuditEventV2Type]:
        """The centralized owner audit trail (audit_events_v2), phase 1.

        Scoped by `affected_owner`, NOT by actor: this is the query that lets an
        owner see access to their own data by an admin, a recipient or the
        system — the thing the legacy actor-only view could never show. Optional
        `action` and `since` (ISO-8601) filters, newest first, hard-capped.
        """
        uid = _uid_from_info(info)
        # The owner view is what happened to the owner AS A DATA SUBJECT. An
        # account that is also a platform admin generates a `desk_read` every
        # time it opens the desk; those are the admin acting across owners, not
        # anything about this owner's own records, and they belong to the
        # security view, not here. Excluding admin/system actor rows keeps the
        # owner's trail to their own actions plus recipient access to their
        # data, instead of drowning it in the admin's own desk browsing.
        clauses = ["affected_owner = %s", "actor_kind NOT IN ('admin','system')"]
        args: list = [uid]
        if action:
            clauses.append("action = %s")
            args.append(action)
        if since:
            clauses.append("occurred_at >= %s")
            args.append(since)
        args.append(max(1, min(500, limit)))
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM audit_events_v2 WHERE " + " AND ".join(clauses)
                + " ORDER BY occurred_at DESC LIMIT %s", tuple(args))
            return [_audit_v2_row(r) for r in await cur.fetchall()]

    @strawberry.field
    async def security_audit_trail(
        self, info: strawberry.Info, affected_owner: str = "", action: str = "",
        since: str = "", limit: int = 200,
    ) -> List[AuditEventV2Type]:
        """Cross-owner security/compliance view of the audit trail.

        FAILS CLOSED: only a platform admin (web360._is_admin) or a designated
        read-only auditor (audit.is_auditor) gets rows; everyone else gets [].
        Returns security-class events across all owners so the desk/compliance
        role can review Aadhaar reveals, cross-owner reads, share grants and
        account-rights exercises. This authorization is deliberately separate
        from the owner view above — removing the affected_owner scope must never
        be reachable without one of those two gates.

        An AUDITOR is not an admin: the allowlist is separate (AUDIT_READER_UIDS)
        precisely so an external reviewer can read the evidence without holding
        the role that writes records and runs the desk. Every auditor read is
        itself recorded as a critical `auditor.read` event — if that cannot be
        written the read does not happen, because an unrecorded review of every
        owner's security events is the hole this role exists to close.
        """
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            from . import web360
            auditor = audit.is_auditor(uid)
            if not auditor and not await web360._is_admin(conn, uid):
                return []
            if auditor:
                async with conn.transaction():
                    await audit.record(
                        conn, action="auditor.read", actor_principal=uid,
                        affected_owner=affected_owner or uid,
                        actor_kind=audit.ACTOR_ADMIN,
                        metadata={"scope": "security_audit_trail",
                                  "affected_owner": affected_owner or "all",
                                  "action_filter": action or "all"})
            clauses = ["data_class = %s"]
            args: list = [audit.CLASS_SECURITY]
            if affected_owner:
                clauses.append("affected_owner = %s")
                args.append(affected_owner)
            if action:
                clauses.append("action = %s")
                args.append(action)
            if since:
                clauses.append("occurred_at >= %s")
                args.append(since)
            args.append(max(1, min(500, limit)))
            cur = await conn.execute(
                "SELECT * FROM audit_events_v2 WHERE " + " AND ".join(clauses)
                + " ORDER BY occurred_at DESC LIMIT %s", tuple(args))
            return [_audit_v2_row(r) for r in await cur.fetchall()]

    @strawberry.field
    async def service_requests(self) -> List[ServiceRequestType]:
        async with pool.connection() as conn:
            cur = await conn.execute("SELECT * FROM service_requests ORDER BY created_at DESC")
            return [to_type(ServiceRequestType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def calculate_stamp_duty(
        self, deed_type: str, consideration: float, market_value: float
    ) -> StampDutyResultType:
        # Duty is charged on the higher of consideration and market (guideline)
        # value. Rates come from the real IGRS fee_schedule (matched by fee id,
        # deed nature, or registration type); fall back to standard AP rates.
        base = max(consideration, market_value)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM fee_schedule WHERE id=%s OR nature_en=%s OR reg_type_en=%s LIMIT 1",
                (deed_type, deed_type, deed_type),
            )
            row = await cur.fetchone()
        if row:
            stamp = round(base * row["stamp_rate"])
            transfer = round(base * row["transfer_rate"])
            reg = round(base * row["reg_rate"])
            user = round(base * row["user_rate"])
            label = row["nature_en"]
        else:
            stamp = round(base * _DEFAULT_RATES["stamp"])
            transfer = round(base * _DEFAULT_RATES["transfer"])
            reg = round(base * _DEFAULT_RATES["reg"])
            user = round(base * _DEFAULT_RATES["user"])
            label = deed_type
        return StampDutyResultType(
            deed_type=label,
            consideration=consideration,
            market_value=market_value,
            stamp_duty=stamp,
            transfer_duty=transfer,
            registration_fee=reg,
            user_charges=user,
            total=stamp + transfer + reg + user,
        )

    @strawberry.field
    async def dashboard_stats(self, info: strawberry.Info) -> DashboardStatsType:
        uid = _uid_from_info(info)
        own_pb = "(SELECT id FROM passbooks WHERE owner_user_id = %s)"
        own_pc = f"(SELECT id FROM parcels WHERE passbook_id IN {own_pb})"
        async with pool.connection() as conn:
            pb = await conn.execute("SELECT count(*) AS cnt FROM passbooks WHERE owner_user_id = %s", (uid,))
            pb_cnt = (await pb.fetchone())["cnt"]
            pc = await conn.execute(f"SELECT count(*) AS cnt FROM parcels WHERE passbook_id IN {own_pb}", (uid,))
            pc_cnt = (await pc.fetchone())["cnt"]
            # Counts BOTH document tables.
            #
            # This counted `documents` alone, and only rows attached to a
            # parcel — so every scanned deed, which lives in
            # `registered_documents`, was invisible. The dashboard reported 0
            # documents while the Documents tab listed five, and the app
            # contradicted itself about how much of the owner's paperwork it
            # held.
            dc = await conn.execute(
                f"SELECT (SELECT count(*) FROM documents WHERE parcel_id IN {own_pc}) "
                f"     + (SELECT count(*) FROM registered_documents WHERE owner_user_id = %s) AS cnt",
                (uid, uid))
            dc_cnt = (await dc.fetchone())["cnt"]
            # Unified table now carries all beneficiaries (post-migration backfill),
            # so a single count avoids double-counting migrated rows.
            bn = await conn.execute("SELECT count(*) AS cnt FROM family_members WHERE owner_user_id = %s AND is_beneficiary = true", (uid,))
            bn_cnt = (await bn.fetchone())["cnt"]
            gr = await conn.execute("SELECT count(*) AS cnt FROM groups WHERE owner_user_id = %s", (uid,))
            gr_cnt = (await gr.fetchone())["cnt"]
            inv = await conn.execute(
                f"SELECT count(*) AS cnt FROM invitations WHERE status='pending' "
                f"AND (scope_id IN {own_pb} OR scope_id IN {own_pc})", (uid, uid)
            )
            inv_cnt = (await inv.fetchone())["cnt"]
            val_cur = await conn.execute(
                "SELECT COALESCE(SUM(p.extent * COALESCE(mv.rate_per_unit, 0) * "
                "  CASE mv.unit WHEN 'Sq.yd' THEN 4840.0 WHEN 'Sq.ft' THEN 43560.0 ELSE 1.0 END), 0) AS total_val "
                "FROM parcels p LEFT JOIN passbooks pb ON p.passbook_id = pb.id "
                "LEFT JOIN market_values mv ON pb.district = mv.district "
                "AND pb.mandal = mv.mandal AND pb.village = mv.village "
                "AND p.classification = mv.classification "
                "WHERE pb.owner_user_id = %s", (uid,)
            )
            total_val = (await val_cur.fetchone())["total_val"]
            ext_cur = await conn.execute(
                f"SELECT COALESCE(SUM(extent), 0) AS t FROM parcels WHERE passbook_id IN {own_pb}", (uid,))
            total_ext = (await ext_cur.fetchone())["t"]
            return DashboardStatsType(
                total_passbooks=pb_cnt,
                total_parcels=pc_cnt,
                total_documents=dc_cnt,
                total_beneficiaries=bn_cnt,
                pending_invitations=inv_cnt,
                estimated_value=float(total_val),
                total_extent=float(total_ext or 0),
                total_groups=gr_cnt,
            )

    @strawberry.field
    async def users(self, info: strawberry.Info) -> List[UserType]:
        # Retain the legacy list shape without exposing other users' profiles.
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute("SELECT * FROM users WHERE id=%s ORDER BY name", (uid,))
            return [to_type(UserType, r) for r in await cur.fetchall()]


# ── Mutation ──────────────────────────────────────────────────────────

def _contact_key(value: str) -> str:
    value = (value or "").strip()
    return value.casefold() if "@" in value else "".join(ch for ch in value if ch.isdigit())


async def _write_person(conn, uid, pid, v, is_update):
    """Insert/update a person row from validated args `v` (a dict). Enforces the
    per-parcel/per-group ≤100% share guard, masks Aadhaar, derives is_minor, and
    creates a verification invite the first time someone becomes a beneficiary.

    On an edit a value of None means "leave this one as it is". The mobile app
    sends fifteen of the twenty-six fields; writing the whole row regardless
    blanked the other eleven — guardian, spouse, marital status, the parcel the
    share is against — every time someone corrected a phone number."""
    prior = None
    if is_update:
        prior = await (await conn.execute(
            "SELECT * FROM family_members WHERE id=%s AND owner_user_id=%s", (pid, uid))).fetchone()
        v = {k: (prior.get(k) if val is None and prior is not None else val)
             for k, val in v.items()}
        # Not columns: an absent raw Aadhaar already means "keep what is stored".
        for key in ("aadhaar", "aadhaar_candidate_id"):
            v[key] = v.get(key) or ""
    minor = _is_minor(v["dob"])
    if v["is_beneficiary"]:
        contact = (v["email"] or v["phone"]).strip()
        if not contact:
            raise ValueError("Add a mobile number or email so this beneficiary can be verified")
        if minor and not (v["guardian_name"] or "").strip():
            raise ValueError("A minor needs a guardian to verify on their behalf")
        if (v["marital_status"] or "").lower() == "married" and not (v["spouse_name"] or "").strip():
            raise ValueError("Please add the spouse for a married beneficiary")
    aad, aad_enc = await aadhaar_security.resolve_for_storage(
        conn, owner=uid, raw=v.get("aadhaar", ""),
        candidate_id=v.get("aadhaar_candidate_id", ""),
        subject_kind="member", subject_id=pid,
    )
    pcl = (v["parcel_id"] or "").strip()
    gid = (v.get("group_id") or "").strip()
    if v["is_beneficiary"]:
        if pcl:
            await _assert_owns_parcel(conn, uid, pcl)
            scope_sql = "parcel_id=%s"; scope_val = pcl; scope_label = "this parcel"
        else:
            scope_sql = "group_id=%s"; scope_val = gid; scope_label = "this group"
        existing = await (await conn.execute(
            f"SELECT COALESCE(SUM(share_pct),0) AS s FROM family_members "
            f"WHERE {scope_sql} AND is_beneficiary=true AND status <> 'revoked' AND id <> %s",
            (scope_val, pid))).fetchone()
        if float(existing["s"] or 0) + float(v["share_pct"] or 0) > 100.0001:
            raise ValueError(f"Shares for {scope_label} would exceed 100% "
                             f"({float(existing['s'] or 0):.1f}% already allocated). Lower the share.")
    cols = dict(name=v["name"], relation=v["relation"], gender=v["gender"], dob=v["dob"],
                phone=v["phone"], email=v["email"], bio=v["bio"], photo=v["photo"],
                father_id=v["father_id"], mother_id=v["mother_id"], spouse_id=v["spouse_id"],
                is_beneficiary=v["is_beneficiary"], share_pct=v["share_pct"], kind=v["kind"],
                parcel_id=pcl, present_address=v["present_address"], aadhaar_masked=aad,
                is_minor=minor, guardian_name=v["guardian_name"], guardian_contact=v["guardian_contact"],
                marital_status=v["marital_status"], spouse_name=v["spouse_name"],
                spouse_contact=v["spouse_contact"], spouse_status=v["spouse_status"])
    cols["role"] = v.get("role", "")
    if not is_update:
        cols["group_id"] = gid
    # On an edit that doesn't re-supply the Aadhaar, preserve the stored masked
    # value instead of wiping it (Person carries only aadhaar_masked, so a normal
    # edit can't round-trip the raw number). DPDP-2023.
    cols["aadhaar_enc"] = aad_enc
    # An empty submit means "keep what is stored" — never wipe by omission.
    if is_update and not (v.get("aadhaar") or "").strip() and not (v.get("aadhaar_candidate_id") or "").strip():
        cols.pop("aadhaar_masked", None)
        cols.pop("aadhaar_enc", None)
    if is_update:
        if prior and prior["is_self"]:
            raise ValueError("Your own node can't be edited here")
        email_changed = bool(prior and (prior.get("email") or "").strip().casefold()
                             != (v["email"] or "").strip().casefold())
        phone_changed = bool(prior and re.sub(r"\D", "", prior.get("phone") or "")
                             != re.sub(r"\D", "", v["phone"] or ""))
        prior_invitee = ((prior.get("guardian_contact") or "") if prior and prior.get("is_minor")
                         else ((prior or {}).get("email") or (prior or {}).get("phone") or ""))
        next_invitee = ((v.get("guardian_contact") or "") if minor else (v.get("email") or v.get("phone") or ""))
        invite_contact_changed = bool(prior and _contact_key(prior_invitee) != _contact_key(next_invitee))
        if email_changed:
            cols["email_verified"] = False
            cols["inactivity_email_consent"] = False
            cols["inactivity_email_consent_at"] = ""
        if invite_contact_changed:
            cols["invite_token"] = ""
            cols["invite_status"] = ""
            cols["status"] = "pending"
        if phone_changed:
            cols["phone_verified"] = False
        sets = ", ".join(f"{k}=%s" for k in cols)
        cur = await conn.execute(f"UPDATE family_members SET {sets} WHERE id=%s AND owner_user_id=%s RETURNING *",
                                 (*cols.values(), pid, uid))
        if invite_contact_changed and prior:
            await conn.execute(
                "UPDATE invitations SET status='revoked',token='' WHERE scope_id=%s "
                "AND scope_type IN ('family','beneficiary') AND status='pending'", (pid,))
        if email_changed and prior:
            await conn.execute(
                "DELETE FROM family_notifiers WHERE owner_user_id=%s AND group_id=%s AND member_id=%s",
                (uid, prior["group_id"], pid))
    else:
        cols2 = dict(id=pid, owner_user_id=uid, created_at=datetime.utcnow().isoformat(), invite_status="", **cols)
        keys = ", ".join(cols2); ph = ", ".join(["%s"] * len(cols2))
        cur = await conn.execute(f"INSERT INTO family_members ({keys}) VALUES ({ph}) RETURNING *", tuple(cols2.values()))
    row = await cur.fetchone()
    if not row:
        raise NotAuthorized("Not authorized for this person")
    # Verification invite on first-time beneficiary (no token yet + contact present).
    # Only the hash is stored, the way inactivity capabilities are: the verify
    # link is a bearer credential that can mark an heir verified, so a reader of
    # the table or a backup must not come away holding a live one. The raw token
    # exists in this one response and in the message sent to the invitee.
    minted = ""
    if v["is_beneficiary"] and not (row.get("invite_token") or "").strip():
        token = str(uuid.uuid4())
        invitee = (v["guardian_contact"].strip() if minor else (v["email"] or v["phone"]).strip())
        channel = "email" if "@" in invitee else "phone"
        await conn.execute("UPDATE family_members SET invite_token=%s, status='pending', invite_channel=%s WHERE id=%s", (_capability_hash(token), channel, pid))
        await conn.execute(
            "INSERT INTO invitations (id, scope_type, scope_id, role, invitee_contact, token, expiry, status, created_at) "
            "VALUES (%s, 'beneficiary', %s, %s, %s, %s, %s, 'pending', %s)",
            (new_id(), pid, v["kind"] or "coowner", invitee, _capability_hash(token),
             _invitation_expiry(), datetime.utcnow().isoformat()))
        minted = token; row["status"] = "pending"
    row["invite_token"] = minted
    return to_type(PersonType, row)


async def _verify_by_token(info, token: str, inactivity_email_consent: bool = False) -> "BeneficiaryType":
    """Consume one live invitation with member→invitation lock ordering."""
    token = (token or "").strip()
    if not token:
        raise ValueError("Invalid or expired verification link")
    # Every column holding this credential holds its hash; the raw token only
    # ever travels in the link sent to the invitee.
    token_hash = _capability_hash(token)
    async with pool.connection() as conn:
        async with conn.transaction():
            hints = await (await conn.execute(
                "SELECT * FROM invitations WHERE token=%s ORDER BY id", (token_hash,))).fetchall()
            hinted_live = [i for i in hints if _invitation_is_current(i)
                           and i["scope_type"] in {"family", "beneficiary"}]
            scope_ids = {i["scope_id"] for i in hinted_live}
            if not hinted_live or len(scope_ids) != 1:
                raise ValueError("Invalid or expired verification link")
            scope_id = next(iter(scope_ids))

            # Contact edits lock the member before revoking invitations. Public
            # acceptance follows the same order to avoid an edit/accept deadlock.
            member = await (await conn.execute(
                "SELECT id,status,invite_token,invite_channel,email,phone,guardian_contact,is_minor "
                "FROM family_members WHERE id=%s OR legacy_beneficiary_id=%s FOR UPDATE",
                (scope_id, scope_id))).fetchone()
            await conn.execute("SELECT id FROM beneficiaries WHERE id=%s FOR UPDATE", (scope_id,))
            invitations = await (await conn.execute(
                "SELECT * FROM invitations WHERE token=%s ORDER BY id FOR UPDATE", (token_hash,))).fetchall()
            live = [i for i in invitations if _invitation_is_current(i)
                    and i["scope_type"] in {"family", "beneficiary"}]
            if (not live or any(i["status"] != "pending" for i in invitations)
                    or {i["scope_id"] for i in live} != {scope_id}):
                raise ValueError("Invalid or expired verification link")
            if member:
                if member["status"] != "pending" or member["invite_token"] != token_hash:
                    raise ValueError("Invalid or expired verification link")
                expected = ((member.get("guardian_contact") or "") if member.get("is_minor") else
                            (member.get("email") or "") if member.get("invite_channel") == "email" else
                            (member.get("phone") or ""))
                if not expected or any(_contact_key(i.get("invitee_contact") or "") != _contact_key(expected)
                                       for i in live):
                    raise ValueError("Invalid or expired verification link")

            row = await (await conn.execute(
                "UPDATE family_members SET status='verified',invite_token='', "
                "email_verified=(email_verified OR (NOT is_minor AND invite_channel='email')), "
                "phone_verified=(phone_verified OR (NOT is_minor AND invite_channel='phone')), "
                "inactivity_email_consent=(NOT is_minor AND invite_channel='email' AND %s), "
                "inactivity_email_consent_at=CASE "
                "WHEN NOT is_minor AND invite_channel='email' AND %s THEN %s ELSE '' END "
                "WHERE invite_token=%s AND status='pending' "
                "AND (id=%s OR legacy_beneficiary_id=%s) RETURNING *",
                (inactivity_email_consent, inactivity_email_consent,
                 datetime.now(timezone.utc).isoformat(), token_hash, scope_id, scope_id))).fetchone()
            if row:
                await conn.execute(
                    "UPDATE beneficiaries SET status='verified',invite_token='' "
                    "WHERE invite_token=%s AND status='pending' AND id=%s", (token_hash, scope_id))
            else:
                row = await (await conn.execute(
                    "UPDATE beneficiaries SET status='verified',invite_token='' "
                    "WHERE invite_token=%s AND status='pending' AND id=%s RETURNING *",
                    (token_hash, scope_id))).fetchone()
            if not row:
                raise ValueError("Invalid or expired verification link")
            await conn.execute("UPDATE invitations SET status='accepted',token='' WHERE token=%s", (token_hash,))
            out = dict(row)
            out.setdefault("person_name", out.get("name") or "")
            out.setdefault("person_contact", out.get("phone") or out.get("email") or "")
            out.setdefault("relationship", out.get("relation") or "")
            await log_audit(conn, row.get("owner_user_id") or "system", "verify_beneficiary", row["id"],
                            f"{out['person_name']} verified")
            return to_type(BeneficiaryType, out)


async def _do_update_member_status(info, id: str, status: str) -> "BeneficiaryType":
    """Owner status changes invalidate outstanding credentials atomically."""
    uid = _uid_from_info(info)
    async with pool.connection() as conn:
        async with conn.transaction():
            row = await (await conn.execute(
                "UPDATE family_members SET status=%s WHERE id=%s AND owner_user_id=%s RETURNING *",
                (status, id, uid))).fetchone()
            legacy_id = (row.get("legacy_beneficiary_id") or id) if row else id
            legacy = await (await conn.execute(
                "UPDATE beneficiaries SET status=%s WHERE id=%s AND (owner_user_id=%s OR parcel_id IN "
                "(SELECT id FROM parcels WHERE passbook_id IN "
                "(SELECT id FROM passbooks WHERE owner_user_id=%s))) RETURNING *",
                (status, legacy_id, uid, uid))).fetchone()
            if not row and not legacy:
                raise NotAuthorized("Not authorized for this beneficiary")
            if status != "pending":
                for target in {id, legacy_id}:
                    await conn.execute(
                        "UPDATE invitations SET status='revoked', token='' WHERE scope_type IN ('family','beneficiary') "
                        "AND scope_id=%s AND status='pending'", (target,))
                await conn.execute("UPDATE family_members SET invite_token='' WHERE id=%s AND owner_user_id=%s", (id, uid))
                await conn.execute("UPDATE beneficiaries SET invite_token='' WHERE id=%s", (legacy_id,))
            out = without_token(row or legacy)
            out.setdefault("person_name", out.get("name") or "")
            out.setdefault("person_contact", out.get("phone") or out.get("email") or "")
            out.setdefault("relationship", out.get("relation") or "")
            await log_audit(conn, uid, "update_beneficiary_status", id, f"Status -> {status}")
            return to_type(BeneficiaryType, out)


# ── Inactivity household-safeguard engine ─────────────────────────────────

_INACTIVITY_DELIVERED = {"logged", "sent"}


def _parse_utc(raw: str) -> Optional[datetime]:
    """Parse stored ISO timestamps as aware UTC; malformed evidence fails safe."""
    if not raw:
        return None
    try:
        value = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def _utc(now: datetime) -> datetime:
    return (now.replace(tzinfo=timezone.utc) if now.tzinfo is None else now.astimezone(timezone.utc))


def _inactivity_cfg() -> tuple[int, tuple[int, int, int], int]:
    """Approved policy in elapsed days, with env overrides for isolated tests."""
    threshold = int(os.getenv("INACTIVITY_DAYS", os.getenv("INACTIVITY_ESCALATE_DAYS", "180")))
    raw = [p.strip() for p in os.getenv("INACTIVITY_REMINDER_DAYS", "1,7,15").split(",")]
    offsets = tuple(int(p) for p in raw if p)
    if len(offsets) != 3 or not (offsets[0] < offsets[1] < offsets[2]) or offsets[0] < 1:
        raise RuntimeError("INACTIVITY_REMINDER_DAYS must contain three strictly increasing positive day offsets")
    gap = int(os.getenv("INACTIVITY_PRIORITY_GAP_DAYS", "7"))
    if threshold < 1 or gap < 1:
        raise RuntimeError("Inactivity day settings must be positive")
    return threshold, offsets, gap


def _days_since(iso: str, now: datetime) -> float:
    then = _parse_utc(iso)
    return max(0.0, (_utc(now) - then).total_seconds() / 86400.0) if then else 0.0


def _inactivity_cycle(owner: str, group_id: str, last_active: str) -> str:
    return hashlib.sha256(f"{owner}\0{group_id}\0{last_active}".encode()).hexdigest()


def _capability_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def _start_inactivity_delivery(
    conn, *, owner: str, group_id: str, cycle: str, stage: str,
    recipient_ref: str, actor_type: str, now: datetime,
) -> dict:
    """Claim one email delivery and mint a purpose-bound acknowledgement token.

    The unique delivery key plus the provider idempotency key makes concurrent
    scheduler/manual runs converge. Failed attempts may retry on a later day;
    accepted/stub-logged attempts never send again.
    """
    current = await (await conn.execute(
        "SELECT * FROM inactivity_deliveries WHERE cycle_key=%s AND stage=%s "
        "AND recipient_ref=%s AND channel='email' FOR UPDATE",
        (cycle, stage, recipient_ref))).fetchone()
    if current and current["status"] in _INACTIVITY_DELIVERED:
        return {"send": False, "ok": True, "status": current["status"], "existing": True}
    if current and current["status"] == "unknown":
        return {"send": False, "ok": False, "status": "unknown", "existing": True}
    if current and current["status"] == "attempting":
        # A process may have died after dispatch. Do not automatically repeat an
        # unknown external side effect; leave it for explicit reconciliation.
        if _days_since(current.get("attempted_at", ""), now) >= 1:
            await conn.execute(
                "UPDATE inactivity_deliveries SET status='unknown',error_code='outcome_unknown' WHERE id=%s",
                (current["id"],))
        return {"send": False, "ok": False, "status": "unknown", "existing": True}
    if current and _days_since(current.get("attempted_at", ""), now) < 1:
        return {"send": False, "ok": False, "status": current["status"], "existing": True}

    delivery_id = current["id"] if current else new_id()
    if current:
        await conn.execute(
            "UPDATE inactivity_deliveries SET status='attempting', attempts=attempts+1, "
            "attempted_at=%s, provider='', error_code='' WHERE id=%s",
            (_utc(now).isoformat(), delivery_id))
    else:
        await conn.execute(
            "INSERT INTO inactivity_deliveries "
            "(id,owner_user_id,group_id,cycle_key,stage,recipient_ref,channel,status,attempts,attempted_at) "
            "VALUES (%s,%s,%s,%s,%s,%s,'email','attempting',1,%s)",
            (delivery_id, owner, group_id, cycle, stage, recipient_ref, _utc(now).isoformat()))

    # A failed attempt gets a fresh token; any prior token for this exact
    # recipient/stage is revoked before the replacement is issued.
    await conn.execute(
        "UPDATE inactivity_capabilities SET consumed_at=%s WHERE cycle_key=%s AND stage=%s "
        "AND recipient_ref=%s AND consumed_at=''",
        (_utc(now).isoformat(), cycle, stage, recipient_ref))
    token = str(uuid.uuid4())
    await conn.execute(
        "INSERT INTO inactivity_capabilities "
        "(id,token_hash,owner_user_id,group_id,cycle_key,stage,actor_type,recipient_ref,expires_at,consumed_at,created_at) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'',%s)",
        (new_id(), _capability_hash(token), owner, group_id, cycle, stage, actor_type,
         recipient_ref, (_utc(now) + timedelta(days=30)).isoformat(), _utc(now).isoformat()))
    return {"send": True, "ok": False, "status": "attempting", "existing": False,
            "id": delivery_id, "token": token,
            "idempotency_key": hashlib.sha256(
                f"{cycle}\0{stage}\0{recipient_ref}\0email".encode()).hexdigest()}


async def _send_inactivity_email(
    _state_conn, *, owner: str, group_id: str, cycle: str, stage: str,
    recipient_ref: str, actor_type: str, email: str, subject: str, body: str,
    now: datetime,
) -> dict:
    """Commit the delivery intent before crossing the provider boundary.

    The caller may still hold the household lock, but this separate autocommit
    connection makes intent/capability durable first. If state persistence later
    fails, the next run observes the delivered key and reconciles without resend.
    """
    async with pool.connection() as dispatch_conn:
        async with dispatch_conn.transaction():
            claim = await _start_inactivity_delivery(
                dispatch_conn, owner=owner, group_id=group_id, cycle=cycle, stage=stage,
                recipient_ref=recipient_ref, actor_type=actor_type, now=now)
        if not claim["send"]:
            return claim
        link = f"{os.getenv('APP_PUBLIC_URL', '').rstrip('/')}/active/{claim['token']}"
        result = await notify.send_email(
            dispatch_conn, email, subject, f"{body} {link}", owner=owner,
            idempotency_key=claim["idempotency_key"], minimize_log=True)
        status = ("unknown" if result.get("ambiguous") else
                  ("logged" if result.get("provider") == "stub" else "sent")
                  if result.get("ok") else "failed")
        await dispatch_conn.execute(
            "UPDATE inactivity_deliveries SET status=%s,provider=%s,error_code=%s WHERE id=%s",
            (status, result.get("provider", ""),
             "" if result.get("ok") else result.get("error_code", "delivery_failed"), claim["id"]))
        if not result.get("ok"):
            await dispatch_conn.execute(
                "UPDATE inactivity_capabilities SET consumed_at=%s WHERE token_hash=%s",
                (_utc(now).isoformat(), _capability_hash(claim["token"])))
        return {**claim, "ok": bool(result.get("ok")), "status": status}


async def _set_inactivity_state(
    conn, owner: str, group_id: str, *, stage: str, priority: int,
    now: datetime, next_action_at: str, outcome: str,
) -> None:
    await conn.execute(
        "UPDATE inactivity_escalations SET stage=%s,current_priority=%s,last_notified_at=%s,"
        "next_action_at=%s,last_outcome=%s,updated_at=%s WHERE owner_user_id=%s AND group_id=%s",
        (stage, priority, _utc(now).isoformat(), next_action_at, outcome,
         _utc(now).isoformat(), owner, group_id))


async def _run_inactivity_check(conn, now: datetime, only_owner: str = "") -> dict:
    """Run at most one due safeguard stage per family group.

    Schedule: 180 inactive days, then head reminders on days 181, 187 and 195;
    family escalation begins on a later daily run. All-family mode is verified
    email only. Selected mode advances one verified-email priority every gap.
    """
    now = _utc(now)
    threshold_days, reminder_days, priority_gap = _inactivity_cfg()
    summary = {"checked": 0, "nudged": 0, "escalated": 0, "failed": 0, "skipped": 0}
    # New links are emitted only after all API tasks understand the capability
    # table. This keeps old and new tasks from producing mutually unreadable
    # credentials during a rolling deployment.
    if os.getenv("INACTIVITY_V2_ENABLED", "").strip() != "1":
        return {**summary, "disabled": True}
    q = ("SELECT g.id AS gid,g.owner_user_id AS owner,g.name AS gname,"
         "COALESCE(u.last_active_at,'') AS last_active,COALESCE(u.email,'') AS head_email,"
         "COALESCE(u.notification_prefs,'') AS notification_prefs,"
         "COALESCE(u.inactivity_email_enabled,true) AS inactivity_email_enabled "
         "FROM groups g LEFT JOIN users u ON u.id=g.owner_user_id WHERE g.type='family'")
    params: list = []
    if only_owner:
        q += " AND g.owner_user_id=%s"
        params.append(only_owner)
    groups = await (await conn.execute(q, params)).fetchall()

    for snapshot in groups:
        owner, gid = snapshot["owner"], snapshot["gid"]
        if not owner:
            continue
        summary["checked"] += 1
        async with conn.transaction():
            # Serialize manual, scheduled and retried runs for this household.
            locked = await (await conn.execute(
                "SELECT id FROM groups WHERE id=%s AND owner_user_id=%s FOR UPDATE", (gid, owner))).fetchone()
            if not locked:
                continue
            g = await (await conn.execute(
                "SELECT g.name AS gname,u.id AS owner,COALESCE(u.last_active_at,'') AS last_active,"
                "COALESCE(u.email,'') AS head_email,COALESCE(u.notification_prefs,'') AS notification_prefs,"
                "COALESCE(u.inactivity_email_enabled,true) AS inactivity_email_enabled "
                "FROM groups g JOIN users u ON u.id=g.owner_user_id "
                "WHERE g.id=%s AND g.owner_user_id=%s FOR UPDATE OF u",
                (gid, owner))).fetchone()
            last_active = _parse_utc(g["last_active"])
            if not last_active:
                summary["skipped"] += 1
                continue
            idle = (now - last_active).total_seconds() / 86400.0
            cycle = _inactivity_cycle(owner, gid, g["last_active"])
            threshold_at = last_active + timedelta(days=threshold_days)
            esc = await (await conn.execute(
                "SELECT * FROM inactivity_escalations WHERE owner_user_id=%s AND group_id=%s FOR UPDATE",
                (owner, gid))).fetchone()

            if idle < threshold_days:
                if esc and (esc.get("cycle_key") != cycle or esc.get("stage") != "active"):
                    await conn.execute(
                        "UPDATE inactivity_escalations SET cycle_key=%s,stage='active',current_priority=0,"
                        "threshold_at=%s,next_action_at=%s,last_outcome='activity_reset',acknowledged=false,"
                        "head_acknowledged_at='',family_acknowledged_at='',updated_at=%s "
                        "WHERE owner_user_id=%s AND group_id=%s",
                        (cycle, threshold_at.isoformat(),
                         (threshold_at + timedelta(days=reminder_days[0])).isoformat(), now.isoformat(), owner, gid))
                    await conn.execute(
                        "UPDATE inactivity_capabilities SET consumed_at=%s WHERE owner_user_id=%s "
                        "AND group_id=%s AND consumed_at=''", (now.isoformat(), owner, gid))
                continue

            if not esc:
                await conn.execute(
                    "INSERT INTO inactivity_escalations "
                    "(id,owner_user_id,group_id,stage,current_priority,last_notified_at,acknowledged,ack_token,"
                    "created_at,updated_at,cycle_key,threshold_at,next_action_at,last_outcome,"
                    "head_acknowledged_at,family_acknowledged_at) "
                    "VALUES (%s,%s,%s,'',0,'',false,'',%s,%s,%s,%s,%s,'','','')",
                    (new_id(), owner, gid, now.isoformat(), now.isoformat(), cycle,
                     threshold_at.isoformat(), (threshold_at + timedelta(days=reminder_days[0])).isoformat()))
                esc = await (await conn.execute(
                    "SELECT * FROM inactivity_escalations WHERE owner_user_id=%s AND group_id=%s FOR UPDATE",
                    (owner, gid))).fetchone()
            elif esc.get("cycle_key") != cycle:
                await conn.execute(
                    "UPDATE inactivity_capabilities SET consumed_at=%s WHERE owner_user_id=%s "
                    "AND group_id=%s AND consumed_at=''", (now.isoformat(), owner, gid))
                await conn.execute(
                    "UPDATE inactivity_escalations SET cycle_key=%s,stage='',current_priority=0,last_notified_at='',"
                    "acknowledged=false,ack_token='',threshold_at=%s,next_action_at=%s,last_outcome='',"
                    "head_acknowledged_at='',family_acknowledged_at='',updated_at=%s "
                    "WHERE owner_user_id=%s AND group_id=%s",
                    (cycle, threshold_at.isoformat(),
                     (threshold_at + timedelta(days=reminder_days[0])).isoformat(), now.isoformat(), owner, gid))
                esc = await (await conn.execute(
                    "SELECT * FROM inactivity_escalations WHERE owner_user_id=%s AND group_id=%s FOR UPDATE",
                    (owner, gid))).fetchone()

            stage = esc.get("stage") or ""
            if stage in {"closed_head", "closed_family", "family_all", "family_exhausted"} or esc.get("acknowledged"):
                continue

            due_stage = ""
            reminder_index = -1
            if stage in {"", "active"} and idle >= threshold_days + reminder_days[0]:
                due_stage, reminder_index = "reminder_1", 0
            elif stage == "reminder_1" and idle >= threshold_days + reminder_days[1]:
                due_stage, reminder_index = "reminder_2", 1
            elif stage == "reminder_2" and idle >= threshold_days + reminder_days[2]:
                due_stage, reminder_index = "final_reminder", 2

            if due_stage:
                prefs = {p.strip().lower() for p in g["notification_prefs"].split(",") if p.strip()}
                email = g["head_email"].strip()
                if not email or "email" not in prefs or not g["inactivity_email_enabled"]:
                    await conn.execute(
                        "UPDATE inactivity_escalations SET last_outcome='head_email_unavailable',updated_at=%s "
                        "WHERE owner_user_id=%s AND group_id=%s", (now.isoformat(), owner, gid))
                    summary["skipped"] += 1
                    continue
                labels = ("Activity reminder", "Second activity reminder", "Final activity reminder")
                body = ("Please confirm that you are active on Pattadar."
                        if reminder_index == 0 else
                        "We still have not received your activity confirmation on Pattadar."
                        if reminder_index == 1 else
                        "This is your final reminder. Your configured family contacts will be notified next if you do not respond.")
                sent = await _send_inactivity_email(
                    conn, owner=owner, group_id=gid, cycle=cycle, stage=due_stage,
                    recipient_ref="head", actor_type="head", email=email,
                    subject=f"{labels[reminder_index]} — Pattadar", body=body, now=now)
                if not sent["ok"]:
                    if sent["status"] == "unknown":
                        await _set_inactivity_state(
                            conn, owner, gid, stage="delivery_attention", priority=0, now=now,
                            next_action_at="", outcome="outcome_unknown")
                    summary["failed" if sent["status"] in {"failed", "unknown"} else "skipped"] += 1
                    continue
                next_at = ((threshold_at + timedelta(days=reminder_days[reminder_index + 1])).isoformat()
                           if reminder_index < 2 else (now + timedelta(days=1)).isoformat())
                await _set_inactivity_state(
                    conn, owner, gid, stage=due_stage, priority=0, now=now,
                    next_action_at=next_at, outcome=sent["status"])
                if not sent.get("existing"):
                    summary["nudged"] += 1
                continue

            if stage not in {"final_reminder", "family_selected"}:
                continue
            if stage == "final_reminder" and _days_since(esc.get("last_notified_at", ""), now) < 1:
                continue
            if stage == "family_selected" and _days_since(esc.get("last_notified_at", ""), now) < priority_gap:
                continue

            configured = await (await conn.execute(
                "SELECT fn.member_id,fn.priority,fn.channel,fm.email,fm.email_verified,"
                "fm.inactivity_email_consent,fm.is_minor FROM family_notifiers fn LEFT JOIN family_members fm "
                "ON fm.id=fn.member_id AND fm.owner_user_id=fn.owner_user_id "
                "AND fm.group_id=fn.group_id AND fm.is_self=false "
                "WHERE fn.owner_user_id=%s AND fn.group_id=%s ORDER BY fn.priority", (owner, gid))).fetchall()
            subject = f"Family alert — {g['gname']}"
            body = (f"The head of {g['gname']} has not responded to Pattadar's activity reminders. "
                    "Please check on them. This alert does not transfer account or property control.")
            if not configured:
                recipients = await (await conn.execute(
                    "SELECT id,email FROM family_members WHERE owner_user_id=%s AND group_id=%s "
                    "AND is_self=false AND is_minor=false AND email_verified=true AND inactivity_email_consent=true "
                    "AND COALESCE(email,'')<>'' ORDER BY id",
                    (owner, gid))).fetchall()
                if not recipients:
                    await conn.execute(
                        "UPDATE inactivity_escalations SET last_outcome='no_eligible_family_email',updated_at=%s "
                        "WHERE owner_user_id=%s AND group_id=%s", (now.isoformat(), owner, gid))
                    summary["skipped"] += 1
                    continue
                outcomes = []
                for member in recipients:
                    outcomes.append(await _send_inactivity_email(
                        conn, owner=owner, group_id=gid, cycle=cycle, stage="family_all",
                        recipient_ref=member["id"], actor_type="family", email=member["email"],
                        subject=subject, body=body, now=now))
                summary["escalated"] += sum(1 for r in outcomes if r["ok"] and not r.get("existing"))
                summary["failed"] += sum(1 for r in outcomes if r["status"] == "failed")
                if any(r["status"] == "unknown" for r in outcomes):
                    await _set_inactivity_state(
                        conn, owner, gid, stage="delivery_attention", priority=0, now=now,
                        next_action_at="", outcome="outcome_unknown")
                elif all(r["ok"] for r in outcomes):
                    await _set_inactivity_state(
                        conn, owner, gid, stage="family_all", priority=0, now=now,
                        next_action_at="", outcome="family_email_complete")
                else:
                    await conn.execute(
                        "UPDATE inactivity_escalations SET last_outcome='family_email_partial',updated_at=%s "
                        "WHERE owner_user_id=%s AND group_id=%s", (now.isoformat(), owner, gid))
                continue

            current_priority = int(esc.get("current_priority") or 0)
            nxt = next((n for n in configured
                        if int(n["priority"]) > current_priority
                        and n.get("channel") == "email"
                        and n.get("email_verified")
                        and not n.get("is_minor")
                        and n.get("inactivity_email_consent")
                        and (n.get("email") or "").strip()), None)
            if not nxt:
                await _set_inactivity_state(
                    conn, owner, gid, stage="family_exhausted", priority=current_priority,
                    now=now, next_action_at="", outcome="no_eligible_ordered_notifier")
                summary["skipped"] += sum(1 for n in configured if int(n["priority"]) > current_priority)
                continue
            sent = await _send_inactivity_email(
                conn, owner=owner, group_id=gid, cycle=cycle, stage=f"family_priority_{nxt['priority']}",
                recipient_ref=nxt["member_id"], actor_type="family", email=nxt["email"],
                subject=subject, body=body, now=now)
            if not sent["ok"]:
                if sent["status"] == "unknown":
                    await _set_inactivity_state(
                        conn, owner, gid, stage="delivery_attention", priority=current_priority,
                        now=now, next_action_at="", outcome="outcome_unknown")
                summary["failed" if sent["status"] in {"failed", "unknown"} else "skipped"] += 1
                continue
            await _set_inactivity_state(
                conn, owner, gid, stage="family_selected", priority=int(nxt["priority"]),
                now=now, next_action_at=(now + timedelta(days=priority_gap)).isoformat(),
                outcome=sent["status"])
            if not sent.get("existing"):
                summary["escalated"] += 1
    return summary


@strawberry.type
class Mutation:
    @strawberry.mutation
    async def web(self) -> web360.WebMutation:
        """Record-360 writes for the web app (W01–W15). See web360.py."""
        return web360.WebMutation()

    @strawberry.mutation
    async def create_passbook(
        self,
        info: strawberry.Info,
        pattadar_no: str,
        state: str,
        district: str,
        mandal: str,
        village: str,
        owner_name: str = "",
        father_husband_name: str = "",
        group_id: str = "",
    ) -> PassbookType:
        uid = _uid_from_info(info)
        pid = new_id()
        async with pool.connection() as conn:
            village = await _canonical_village(conn, uid, village, mandal, district)
            if not group_id.strip():
                dg = await (await conn.execute(
                    "SELECT id FROM groups WHERE owner_user_id=%s ORDER BY created_at LIMIT 1", (uid,))).fetchone()
                group_id = dg["id"] if dg else ""
            else:
                og = await (await conn.execute(
                    "SELECT 1 FROM groups WHERE id=%s AND owner_user_id=%s", (group_id, uid))).fetchone()
                if not og:
                    raise NotAuthorized("Not authorized for this group")
            cur = await conn.execute(
                "INSERT INTO passbooks (id, owner_user_id, pattadar_no, owner_name, father_husband_name, state, district, mandal, village, group_id, created_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *",
                (pid, uid, pattadar_no, owner_name, father_husband_name, state, district, mandal, village, group_id, datetime.utcnow().isoformat()),
            )
            row = await cur.fetchone()
            await log_audit(conn, uid, "create_passbook", pid, f"Pattadar {pattadar_no}")
            return to_type(PassbookType, row)

    @strawberry.mutation
    async def delete_passbook(self, info: strawberry.Info, id: str) -> bool:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            # One transaction, children first. The pool is autocommit, so a
            # statement-at-a-time cascade that died after the passbook row
            # committed would strand its parcels: nothing reaches a parcel
            # except through its passbook's owner, so they would be invisible
            # and undeletable for good.
            async with conn.transaction():
                # CL-547: read the name BEFORE the row is gone — an audit entry that
                # cannot say what it deleted is not an audit entry.
                doomed = await (await conn.execute(
                    "SELECT pattadar_no, village FROM passbooks WHERE id=%s AND owner_user_id=%s", (id, uid))).fetchone()
                if not doomed:
                    return False
                # No DB-level FK cascade — remove the passbook's parcels + their
                # ownership history so a delete doesn't leave orphaned rows.
                await conn.execute(
                    "DELETE FROM parcel_owners WHERE parcel_id IN (SELECT id FROM parcels WHERE passbook_id=%s)", (id,))
                await conn.execute("DELETE FROM parcels WHERE passbook_id=%s", (id,))
                cur = await conn.execute("DELETE FROM passbooks WHERE id=%s AND owner_user_id=%s", (id, uid))
                deleted = cur.rowcount > 0
                if deleted:
                    await log_audit(conn, uid, "delete_passbook", id, _named(
                        "Khata", doomed.get("pattadar_no"), doomed.get("village")))
                return deleted

    @strawberry.mutation
    async def create_parcel(
        self,
        info: strawberry.Info,
        passbook_id: str,
        survey_no: str,
        subdivision: str,
        extent: float,
        unit: str,
        classification: str,
        acquisition_source: str,
        parent_parcel_id: str = "",
        source: str = "manual",
    ) -> ParcelType:
        uid = _uid_from_info(info)
        pid = new_id()
        now = datetime.utcnow()
        async with pool.connection() as conn:
            # One row is a parcel and its first line of ownership; half of
            # that is a parcel nobody has ever owned.
            async with conn.transaction():
                await _assert_owns_passbook(conn, uid, passbook_id)
                cur = await conn.execute(
                    "INSERT INTO parcels (id, passbook_id, survey_no, subdivision, extent, unit, classification, acquisition_source, geo_point, parent_parcel_id, source, created_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *",
                    (pid, passbook_id, survey_no, subdivision, extent, unit, classification, acquisition_source, "", parent_parcel_id, source, now.isoformat()),
                )
                row = await cur.fetchone()
                # Seed the ownership history with the current owner (the passbook holder).
                pbcur = await conn.execute("SELECT owner_name FROM passbooks WHERE id=%s", (passbook_id,))
                pbrow = await pbcur.fetchone()
                owner = (pbrow["owner_name"] if pbrow else "") or ""
                await conn.execute(
                    "INSERT INTO parcel_owners (id, parcel_id, owner_name, acquisition_source, extent, mutation_type, mutation_date, is_current, created_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
                    (new_id(), pid, owner, acquisition_source, extent, "acquisition", now.date().isoformat(), True, now.isoformat()),
                )
                await log_audit(conn, uid, "create_parcel", pid, f"Survey {survey_no}")
                return to_type(ParcelType, row)

    @strawberry.mutation
    async def create_project(
        self, info: strawberry.Info, name: str, builder_name: str = "",
        project_type: str = "", rera_no: str = "", address: str = "", city: str = "",
    ) -> ProjectType:
        uid = _uid_from_info(info)
        pid = new_id()
        async with pool.connection() as conn:
            cur = await conn.execute(
                "INSERT INTO projects (id, owner_user_id, name, builder_name, project_type, rera_no, address, city, geo_point, created_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *",
                (pid, uid, name, builder_name, project_type, rera_no, address, city, "", datetime.utcnow().isoformat()),
            )
            row = await cur.fetchone()
            await log_audit(conn, uid, "create_project", pid, f"Project {name}")
            return to_type(ProjectType, row)

    @strawberry.mutation
    async def create_property(
        self, info: strawberry.Info, type: str, label: str,
        address: str = "", locality: str = "", city: str = "", district: str = "",
        land_area: float = 0.0, land_unit: str = "Sq.yd",
        builtup_area: float = 0.0, builtup_unit: str = "Sq.ft",
        acquisition_mode: str = "purchase", project_id: str = "", group_id: str = "",
        attributes: str = "",
        purchase_price: float = 0.0, purchase_date: str = "", reg_doc_no: str = "",
        sro: str = "", reg_date: str = "", seller_name: str = "", buyer_name: str = "",
    ) -> PropertyType:
        uid = _uid_from_info(info)
        pid = new_id()
        now = datetime.utcnow()
        async with pool.connection() as conn:
            # The property and the owners it is bought by go in together.
            async with conn.transaction():
                cur = await conn.execute(
                    "INSERT INTO properties (id, owner_user_id, group_id, project_id, type, label, address, locality, city, district, "
                    "land_area, land_unit, builtup_area, builtup_unit, acquisition_mode, purchase_price, purchase_date, "
                    "reg_doc_no, sro, reg_date, attributes, created_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *",
                    (pid, uid, group_id, project_id, type, label, address, locality, city, district,
                     land_area, land_unit, builtup_area, builtup_unit, acquisition_mode, purchase_price, purchase_date,
                     reg_doc_no, sro, reg_date, attributes, now.isoformat()),
                )
                row = await cur.fetchone()
                # Current owner (the buyer / the user). Seed a prior-owner (seller) row too when known.
                await conn.execute(
                    "INSERT INTO property_owners (id, property_id, owner_name, user_id, share_pct, role, is_current, created_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                    (new_id(), pid, buyer_name, uid, 100.0, "owner", True, now.isoformat()),
                )
                if seller_name:
                    await conn.execute(
                        "INSERT INTO property_owners (id, property_id, owner_name, user_id, share_pct, role, is_current, created_at) "
                        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                        (new_id(), pid, seller_name, "", 0.0, "seller", False, now.isoformat()),
                    )
                await log_audit(conn, uid, "create_property", pid, f"{type}: {label}")
                return to_type(PropertyType, row)

    @strawberry.mutation
    async def update_property(
        self, info: strawberry.Info, id: str,
        label: Optional[str] = None, address: Optional[str] = None, locality: Optional[str] = None,
        city: Optional[str] = None, district: Optional[str] = None,
        land_area: Optional[float] = None, land_unit: Optional[str] = None,
        builtup_area: Optional[float] = None, builtup_unit: Optional[str] = None,
        holding_status: Optional[str] = None, acquisition_mode: Optional[str] = None,
        purchase_price: Optional[float] = None, purchase_date: Optional[str] = None,
        guideline_value: Optional[float] = None, market_value: Optional[float] = None, current_value: Optional[float] = None,
        reg_doc_no: Optional[str] = None, sro: Optional[str] = None, reg_date: Optional[str] = None,
        ghmc_assessment_no: Optional[str] = None, khata_no: Optional[str] = None, rera_no: Optional[str] = None,
        ec_status: Optional[str] = None, ec_date: Optional[str] = None, mutation_status: Optional[str] = None,
        tax_paid_upto: Optional[str] = None, litigation: Optional[bool] = None, litigation_note: Optional[str] = None,
        attributes: Optional[str] = None, notes: Optional[str] = None, project_id: Optional[str] = None,
    ) -> PropertyType:
        uid = _uid_from_info(info)
        fields = {
            "label": label, "address": address, "locality": locality, "city": city, "district": district,
            "land_area": land_area, "land_unit": land_unit, "builtup_area": builtup_area, "builtup_unit": builtup_unit,
            "holding_status": holding_status, "acquisition_mode": acquisition_mode,
            "purchase_price": purchase_price, "purchase_date": purchase_date,
            "guideline_value": guideline_value, "market_value": market_value, "current_value": current_value,
            "reg_doc_no": reg_doc_no, "sro": sro, "reg_date": reg_date,
            "ghmc_assessment_no": ghmc_assessment_no, "khata_no": khata_no, "rera_no": rera_no,
            "ec_status": ec_status, "ec_date": ec_date, "mutation_status": mutation_status,
            "tax_paid_upto": tax_paid_upto, "litigation": litigation, "litigation_note": litigation_note,
            "attributes": attributes, "notes": notes, "project_id": project_id,
        }
        sets = {k: v for k, v in fields.items() if v is not None}
        async with pool.connection() as conn:
            own = await (await conn.execute(
                "SELECT 1 FROM properties WHERE id=%s AND owner_user_id=%s", (id, uid))).fetchone()
            if not own:
                raise NotAuthorized("Not authorized for this property")
            if sets:
                cols = ", ".join(f"{k}=%s" for k in sets)
                await conn.execute(f"UPDATE properties SET {cols} WHERE id=%s", (*sets.values(), id))
            row = await (await conn.execute("SELECT * FROM properties WHERE id=%s", (id,))).fetchone()
            await log_audit(conn, uid, "update_property", id, "Updated property")
            return to_type(PropertyType, row)

    @strawberry.mutation
    async def add_property_owner(
        self, info: strawberry.Info, property_id: str, owner_name: str,
        share_pct: float = 0.0, role: str = "owner", group_id: str = "",
    ) -> PropertyOwnerType:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            own = await (await conn.execute(
                "SELECT 1 FROM properties WHERE id=%s AND owner_user_id=%s", (property_id, uid))).fetchone()
            if not own:
                raise NotAuthorized("Not authorized for this property")
            oid = new_id()
            cur = await conn.execute(
                "INSERT INTO property_owners (id, property_id, owner_name, group_id, share_pct, role, is_current, created_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING *",
                (oid, property_id, owner_name, group_id, share_pct, role, True, datetime.utcnow().isoformat()),
            )
            row = await cur.fetchone()
            await log_audit(conn, uid, "add_property_owner", property_id, owner_name)
            return to_type(PropertyOwnerType, row)

    @strawberry.mutation
    async def delete_property(self, info: strawberry.Info, id: str) -> bool:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            # Six statements on an autocommit pool are six chances to stop
            # half-way: one transaction, so the property and everything filed
            # against it go together or not at all.
            async with conn.transaction():
                own = await (await conn.execute(
                    "SELECT label, address FROM properties WHERE id=%s AND owner_user_id=%s", (id, uid))).fetchone()
                if not own:
                    raise NotAuthorized("Not authorized for this property")
                await conn.execute("DELETE FROM property_owners WHERE property_id=%s", (id,))
                await conn.execute("DELETE FROM documents WHERE property_id=%s", (id,))
                # Registered deeds hang off the property too, and each carries its
                # parties and its AI summary. Deleting only `documents` left the
                # deed — and everything read out of it — pointing at a property
                # that no longer existed.
                await conn.execute(
                    "DELETE FROM document_parties WHERE document_id IN "
                    "(SELECT id FROM registered_documents WHERE property_id=%s AND owner_user_id=%s)",
                    (id, uid))
                await conn.execute(
                    "DELETE FROM registered_documents WHERE property_id=%s AND owner_user_id=%s", (id, uid))
                await conn.execute("DELETE FROM properties WHERE id=%s", (id,))
                await log_audit(conn, uid, "delete_property", id, _named("", own["label"], own["address"]))
                return True

    @strawberry.mutation
    async def record_parcel_mutation(
        self,
        info: strawberry.Info,
        parcel_id: str,
        new_owner: str,
        acquisition_source: str,
        mutation_type: str = "transfer",
    ) -> ParcelType:
        """Record an ownership change (mutation) on a parcel — the previous owner
        becomes historical and the new owner is set current."""
        uid = _uid_from_info(info)
        now = datetime.utcnow()
        async with pool.connection() as conn:
            # Retiring the old owner and recording the new one is the
            # mutation. On an autocommit pool, stopping between them leaves a
            # parcel with no current owner at all.
            async with conn.transaction():
                await _assert_owns_parcel(conn, uid, parcel_id)
                await conn.execute("UPDATE parcel_owners SET is_current=false WHERE parcel_id=%s", (parcel_id,))
                pcur = await conn.execute("SELECT * FROM parcels WHERE id=%s", (parcel_id,))
                prow = await pcur.fetchone()
                await conn.execute(
                    "INSERT INTO parcel_owners (id, parcel_id, owner_name, acquisition_source, extent, mutation_type, mutation_date, is_current, created_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
                    (new_id(), parcel_id, new_owner, acquisition_source, (prow["extent"] if prow else 0),
                     mutation_type or "transfer", now.date().isoformat(), True, now.isoformat()),
                )
                await log_audit(conn, uid, "record_mutation", parcel_id, f"{mutation_type} -> {new_owner}")
                return to_type(ParcelType, prow)

    @strawberry.mutation
    async def apply_my_kyc(
        self, info: strawberry.Info,
        name: str = "", dob: str = "", gender: str = "",
        address: str = "", aadhaar: str = "", aadhaar_candidate_id: str = "",
    ) -> UserType:
        """Apply reviewed KYC without returning extracted full digits to a client."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            async with conn.transaction():
                await conn.execute(
                    "INSERT INTO users (id,name) VALUES (%s,%s) ON CONFLICT (id) DO NOTHING", (uid, uid))
                if aadhaar and aadhaar_candidate_id:
                    raise ValueError("Use either typed Aadhaar or a card reading, not both")
                value = (await aadhaar_security.consume_candidate(conn, uid, aadhaar_candidate_id)
                         if aadhaar_candidate_id else aadhaar_security.digits(aadhaar))
                if (aadhaar or aadhaar_candidate_id) and not value:
                    raise ValueError("Aadhaar must be exactly 12 digits")
                masked, enc = await aadhaar_security.encrypt_number(value, uid, "account", uid) if value else ("", "")

                sets, vals = [], []
                if (name or "").strip():
                    sets.append("name=%s"); vals.append(name.strip())
                if (address or "").strip():
                    sets.append("address=%s"); vals.append(address.strip())
                if masked:
                    sets.extend(["kyc_ref_masked=%s", "kyc_ref_enc=%s"]); vals.extend([masked, enc])
                if sets:
                    await conn.execute(f"UPDATE users SET {', '.join(sets)} WHERE id=%s", (*vals, uid))

                members = await (await conn.execute(
                    "SELECT id FROM family_members WHERE owner_user_id=%s AND is_self=true FOR UPDATE", (uid,))).fetchall()
                for member in members:
                    msets, mvals = [], []
                    for col, val in (("name", name), ("dob", dob), ("gender", gender), ("present_address", address)):
                        if (val or "").strip():
                            msets.append(f"{col}=%s"); mvals.append(val.strip())
                    if value:
                        mmask, menc = await aadhaar_security.encrypt_number(value, uid, "member", member["id"])
                        msets.extend(["aadhaar_masked=%s", "aadhaar_enc=%s"]); mvals.extend([mmask, menc])
                    if msets:
                        await conn.execute(
                            f"UPDATE family_members SET {', '.join(msets)} WHERE id=%s AND owner_user_id=%s",
                            (*mvals, member["id"], uid))

                await log_audit(conn, uid, "apply_my_kyc", uid, "identity applied from Aadhaar")
                row = await (await conn.execute("SELECT * FROM users WHERE id=%s", (uid,))).fetchone()
                return to_type(UserType, row)

    @strawberry.mutation
    async def clear_my_kyc(self, info: strawberry.Info) -> UserType:
        """Remove the identity applied from an Aadhaar card — CL-545.

        `apply_my_kyc` deliberately writes only non-empty values so a partial
        accept cannot blank a field. The cost of that rule is that scanning the
        WRONG card (a spouse's, a parent's) is one-way: every later submit
        preserves what is already there. This is the way back.

        Clears the name, address and Aadhaar from the account and the same
        fields from every `is_self` member row. Land, groups and documents are
        untouched — this is about who the account says you are, nothing else.
        """
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            # The account row and the self member row hold the same identity;
            # clearing one and not the other is how a wrong card
            # half-survives.
            async with conn.transaction():
                prev = await (await conn.execute("SELECT name FROM users WHERE id=%s", (uid,))).fetchone()
                await conn.execute(
                    "UPDATE users SET name='', address='', kyc_ref_masked='', kyc_ref_enc='' WHERE id=%s", (uid,))
                await conn.execute(
                    "UPDATE family_members SET name='', dob='', gender='', present_address='', "
                    "aadhaar_masked='', aadhaar_enc='' WHERE owner_user_id=%s AND is_self=TRUE", (uid,))
                # Name the identity that was removed: this is exactly the kind of
                # change someone will need to account for later.
                await log_audit(conn, uid, "clear_my_kyc", uid, _named("Removed", (prev or {}).get("name")))
                row = await (await conn.execute("SELECT * FROM users WHERE id=%s", (uid,))).fetchone()
                return to_type(UserType, row)

    @strawberry.mutation
    async def reveal_my_aadhaar(self, info: strawberry.Info) -> str:
        """The signed-in user's own full Aadhaar. Audited like the member one."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            row = await (await conn.execute(
                "SELECT kyc_ref_enc FROM users WHERE id=%s", (uid,))).fetchone()
            full = await decrypt_aadhaar(row["kyc_ref_enc"], uid, "account", uid) if row else ""
            if not full:
                raise ValueError("No Aadhaar stored on your profile")
            await log_audit(conn, uid, "reveal_aadhaar", uid, "revealed own Aadhaar")
            return full

    @strawberry.mutation
    async def reveal_member_aadhaar(self, info: strawberry.Info, id: str) -> str:
        """Return one member's full Aadhaar to its owner, and audit the fact.

        Deliberately a mutation on a single id rather than a field on PersonType:
        a field would ride along on every `members { ... }` query and put the
        number in every list response. Every call writes an audit row — an
        un-audited reveal is indistinguishable from an exfiltration."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            row = await (await conn.execute(
                "SELECT aadhaar_enc, name FROM family_members WHERE id=%s AND owner_user_id=%s",
                (id, uid))).fetchone()
            if not row:
                raise NotAuthorized("Not authorized for this member")
            full = await decrypt_aadhaar(row["aadhaar_enc"], uid, "member", id)
            if not full:
                raise ValueError("No Aadhaar stored for this member")
            await log_audit(conn, uid, "reveal_aadhaar", id, f"revealed for {row['name']}")
            return full

    @strawberry.mutation
    async def set_parcel_field(
        self, info: strawberry.Info, parcel_id: str, field_key: str, state: str,
        value: str = "", source: str = "manual", source_ref: str = "",
        verified_at: str = "", expires_at: str = "", na_reason: str = "",
    ) -> ParcelFieldType:
        """Upsert one record field. Idempotent on (parcel_id, field_key)."""
        uid = _uid_from_info(info)
        if state not in ("filled", "not_available", "unknown"):
            raise ValueError("state must be filled, not_available or unknown")
        async with pool.connection() as conn:
            owned = await (await conn.execute(
                "SELECT p.id FROM parcels p JOIN passbooks pb ON pb.id = p.passbook_id "
                "WHERE p.id=%s AND pb.owner_user_id=%s", (parcel_id, uid))).fetchone()
            if not owned:
                raise NotAuthorized("Not authorized for this parcel")
            cur = await conn.execute(
                "INSERT INTO parcel_fields (parcel_id, field_key, state, value, source, source_ref, "
                "verified_at, expires_at, na_reason, updated_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
                "ON CONFLICT (parcel_id, field_key) DO UPDATE SET "
                "state=EXCLUDED.state, value=EXCLUDED.value, source=EXCLUDED.source, "
                "source_ref=EXCLUDED.source_ref, verified_at=EXCLUDED.verified_at, "
                "expires_at=EXCLUDED.expires_at, na_reason=EXCLUDED.na_reason, "
                "updated_at=EXCLUDED.updated_at RETURNING *",
                (parcel_id, field_key, state, value, source, source_ref,
                 verified_at, expires_at, na_reason, datetime.utcnow().isoformat()))
            row = await cur.fetchone()
            await log_audit(conn, uid, "set_parcel_field", parcel_id, f"{field_key} = {state}")
            return to_type(ParcelFieldType, row)

    @strawberry.mutation
    async def update_parcel_geo(self, info: strawberry.Info, parcel_id: str, geo_point: str) -> ParcelType:
        """Save the parcel's geo-location (GeoJSON Point or Polygon string)."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "UPDATE parcels SET geo_point=%s WHERE id=%s AND passbook_id IN "
                "(SELECT id FROM passbooks WHERE owner_user_id=%s) RETURNING *",
                (geo_point, parcel_id, uid))
            row = await cur.fetchone()
            if not row:
                raise NotAuthorized("Not authorized for this parcel")
            await log_audit(conn, uid, "update_parcel_geo", parcel_id, "location set" if geo_point else "location cleared")
            return to_type(ParcelType, row)

    @strawberry.mutation
    async def update_property_geo(self, info: strawberry.Info, property_id: str, geo_point: str) -> PropertyType:
        """Save a property's pin.

        The column has existed since the properties table was created; only the
        write path was missing, so the app showed "Set location" and then had to
        admit it could not save one. A plot is exactly the kind of holding whose
        location is hardest to describe in words — it is the case that needs a
        pin most.
        """
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "UPDATE properties SET geo_point=%s WHERE id=%s AND owner_user_id=%s RETURNING *",
                (geo_point, property_id, uid))
            row = await cur.fetchone()
            if not row:
                raise NotAuthorized("Not authorized for this property")
            # The audit row names the property, not just its id — a log that
            # says "location set · <uuid>" answers nothing later.
            await log_audit(
                conn, uid, "update_property_geo", property_id,
                f"{'Location set' if geo_point else 'Location cleared'} · {_named('', row['label'], row['address'])}".strip(' ·'),
            )
            return to_type(PropertyType, row)

    @strawberry.mutation
    async def update_parcel_boundary(self, info: strawberry.Info, parcel_id: str, boundary: str) -> ParcelType:
        """Save the parcel's surveyed outline — corner-ordered "lat,lng;lat,lng;…".

        Its own mutation, like the geo pair above: a dedicated write can never
        erase the fields it does not mention.
        """
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "UPDATE parcels SET boundary=%s WHERE id=%s AND passbook_id IN "
                "(SELECT id FROM passbooks WHERE owner_user_id=%s) RETURNING *",
                (boundary, parcel_id, uid))
            row = await cur.fetchone()
            if not row:
                raise NotAuthorized("Not authorized for this parcel")
            corners = len([p for p in boundary.split(";") if p.strip()])
            await log_audit(conn, uid, "update_parcel_boundary", parcel_id,
                            f"boundary set · {corners} corners" if boundary else "boundary cleared")
            return to_type(ParcelType, row)

    @strawberry.mutation
    async def update_property_boundary(self, info: strawberry.Info, property_id: str, boundary: str) -> PropertyType:
        """Save a property's surveyed outline — same convention as the parcel's."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "UPDATE properties SET boundary=%s WHERE id=%s AND owner_user_id=%s RETURNING *",
                (boundary, property_id, uid))
            row = await cur.fetchone()
            if not row:
                raise NotAuthorized("Not authorized for this property")
            corners = len([p for p in boundary.split(";") if p.strip()])
            await log_audit(
                conn, uid, "update_property_boundary", property_id,
                (f"Boundary set · {corners} corners" if boundary else "Boundary cleared")
                + f" · {_named('', row['label'], row['address'])}".rstrip(' ·'),
            )
            return to_type(PropertyType, row)

    @strawberry.mutation
    async def update_passbook(
        self, info: strawberry.Info, id: str,
        pattadar_no: Optional[str] = None, owner_name: Optional[str] = None,
        father_husband_name: Optional[str] = None, state: Optional[str] = None,
        district: Optional[str] = None, mandal: Optional[str] = None,
        village: Optional[str] = None, group_id: Optional[str] = None,
    ) -> PassbookType:
        """Correct a khata's details.

        There was no way to edit one at all: a passbook scanned with the owner's
        name misread, or filed under the wrong village, could only be deleted
        and re-entered — which takes its parcels with it.

        Every argument is optional and only non-None values are written, so a
        client that sends one field cannot blank the rest.
        """
        uid = _uid_from_info(info)
        fields = {
            "pattadar_no": pattadar_no, "owner_name": owner_name,
            "father_husband_name": father_husband_name, "state": state,
            "district": district, "mandal": mandal, "village": village,
            "group_id": group_id,
        }
        sets = {k: v for k, v in fields.items() if v is not None}
        async with pool.connection() as conn:
            own = await (await conn.execute(
                "SELECT pattadar_no FROM passbooks WHERE id=%s AND owner_user_id=%s", (id, uid))).fetchone()
            if not own:
                raise NotAuthorized("Not authorized for this khata")
            if sets:
                cols = ", ".join(f"{k}=%s" for k in sets)
                await conn.execute(f"UPDATE passbooks SET {cols} WHERE id=%s", (*sets.values(), id))
            row = await (await conn.execute("SELECT * FROM passbooks WHERE id=%s", (id,))).fetchone()
            await log_audit(conn, uid, "update_passbook", id, _named("", row["pattadar_no"], row["village"]))
            return to_type(PassbookType, row)

    @strawberry.mutation
    async def update_parcel(
        self, info: strawberry.Info, id: str,
        survey_no: Optional[str] = None, subdivision: Optional[str] = None,
        extent: Optional[float] = None, unit: Optional[str] = None,
        classification: Optional[str] = None, acquisition_source: Optional[str] = None,
        status: Optional[str] = None, label: Optional[str] = None, address: Optional[str] = None,
        boundary_north: Optional[str] = None, boundary_south: Optional[str] = None,
        boundary_east: Optional[str] = None, boundary_west: Optional[str] = None,
        purchase_price: Optional[float] = None, purchase_date: Optional[str] = None,
        guideline_value: Optional[float] = None, market_value: Optional[float] = None,
        stamp_duty: Optional[float] = None, loan_amount: Optional[float] = None,
        encumbrance_status: Optional[str] = None, reg_doc_no: Optional[str] = None,
        sro: Optional[str] = None, reg_date: Optional[str] = None,
        ec_status: Optional[str] = None, ec_date: Optional[str] = None,
        mutation_status: Optional[str] = None, tax_paid_upto: Optional[str] = None,
        rera_no: Optional[str] = None, litigation: Optional[bool] = None,
        litigation_note: Optional[str] = None,
    ) -> ParcelType:
        """Edit a parcel's full dossier — identity/status, address, boundary
        schedule, financials, legal. Only provided fields are updated. Manual
        entry now; AP-IGRS integration auto-populates these later."""
        uid = _uid_from_info(info)
        candidate = {
            "survey_no": survey_no, "subdivision": subdivision, "extent": extent, "unit": unit,
            "classification": classification, "acquisition_source": acquisition_source,
            "status": status, "label": label, "address": address,
            "boundary_north": boundary_north, "boundary_south": boundary_south,
            "boundary_east": boundary_east, "boundary_west": boundary_west,
            "purchase_price": purchase_price, "purchase_date": purchase_date,
            "guideline_value": guideline_value, "market_value": market_value,
            "stamp_duty": stamp_duty, "loan_amount": loan_amount,
            "encumbrance_status": encumbrance_status, "reg_doc_no": reg_doc_no, "sro": sro,
            "reg_date": reg_date, "ec_status": ec_status, "ec_date": ec_date,
            "mutation_status": mutation_status, "tax_paid_upto": tax_paid_upto,
            "rera_no": rera_no, "litigation": litigation, "litigation_note": litigation_note,
        }
        fields = {k: v for k, v in candidate.items() if v is not None}
        async with pool.connection() as conn:
            if not fields:
                cur = await conn.execute(
                    "SELECT * FROM parcels WHERE id=%s AND passbook_id IN "
                    "(SELECT id FROM passbooks WHERE owner_user_id=%s)", (id, uid))
            else:
                set_clause = ", ".join(f"{k}=%s" for k in fields)  # keys are hardcoded, safe
                params = list(fields.values()) + [id, uid]
                cur = await conn.execute(
                    f"UPDATE parcels SET {set_clause} WHERE id=%s AND passbook_id IN "
                    "(SELECT id FROM passbooks WHERE owner_user_id=%s) RETURNING *", params)
            row = await cur.fetchone()
            if not row:
                raise NotAuthorized("Not authorized for this parcel")
            if fields:
                await log_audit(conn, uid, "update_parcel", id, "dossier updated")
            return to_type(ParcelType, row)

    @strawberry.mutation
    async def delete_parcel(self, info: strawberry.Info, id: str) -> bool:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            async with conn.transaction():
                # A parcel has no village of its own — the village belongs to its
                # passbook. Reading it straight off `parcels` raised UndefinedColumn
                # and broke deletion outright.
                doomed = await (await conn.execute(
                    "SELECT p.survey_no, pb.village FROM parcels p "
                    "JOIN passbooks pb ON pb.id = p.passbook_id "
                    "WHERE p.id=%s AND pb.owner_user_id=%s", (id, uid))).fetchone()
                if not doomed:
                    return False
                await conn.execute("DELETE FROM parcel_owners WHERE parcel_id=%s", (id,))
                cur = await conn.execute(
                    "DELETE FROM parcels WHERE id=%s AND passbook_id IN "
                    "(SELECT id FROM passbooks WHERE owner_user_id=%s)", (id, uid)
                )
                deleted = cur.rowcount > 0
                if deleted:
                    await log_audit(conn, uid, "delete_parcel", id, _named(
                        "Survey", doomed.get("survey_no"), doomed.get("village")))
                return deleted

    @strawberry.mutation
    async def create_document(
        self,
        info: strawberry.Info,
        parcel_id: str,
        doc_type: str,
        file_ref: str,
        doc_no: str,
        sro_code: str,
        reg_year: str,
        source: str,
        tags: str,
        passbook_id: str = "",
        property_id: str = "",
        name: str = "",
        size_bytes: int = 0,
        mime_type: str = "",
    ) -> DocumentType:
        uid = _uid_from_info(info)
        did = new_id()
        # A file with no name of its own renders blank in both vaults. Name it
        # for what it is rather than leaving the client to guess later.
        name = (name or "").strip() or (
            "Document" if doc_type in ("", "other") else doc_type.replace("_", " ").title())
        async with pool.connection() as conn:
            # parcel OR passbook may be empty — a doc can be uploaded now and linked later
            if parcel_id:
                await _assert_owns_parcel(conn, uid, parcel_id)
            elif passbook_id:
                await _assert_owns_passbook(conn, uid, passbook_id)
            elif property_id:
                await _assert_owns_property(conn, uid, property_id)
            cur = await conn.execute(
                "INSERT INTO documents (id, parcel_id, passbook_id, property_id, owner_user_id, doc_type, file_ref, doc_no, sro_code, reg_year, version, source, tags, created_at, name, size_bytes, mime_type) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *",
                (did, parcel_id, passbook_id, property_id, uid, doc_type, file_ref, doc_no, sro_code, reg_year, 1, source, tags, datetime.utcnow().isoformat(), name, max(0, size_bytes), mime_type),
            )
            row = await cur.fetchone()
            await log_audit(conn, uid, "upload_document", parcel_id or passbook_id or did, f"Uploaded {name}")
            return to_type(DocumentType, row)

    @strawberry.mutation
    async def delete_document(self, info: strawberry.Info, id: str) -> bool:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            # Ownership must mirror the `documents` query exactly — unlinked
            # uploads (parcel_id='' etc.) are owned via owner_user_id and were
            # previously undeletable because that arm was missing here.
            cur = await conn.execute(
                "SELECT parcel_id, passbook_id, doc_no FROM documents WHERE id=%s AND (owner_user_id=%s OR parcel_id IN "
                "(SELECT id FROM parcels WHERE passbook_id IN (SELECT id FROM passbooks WHERE owner_user_id=%s)) "
                "OR passbook_id IN (SELECT id FROM passbooks WHERE owner_user_id=%s) "
                "OR property_id IN (SELECT id FROM properties WHERE owner_user_id=%s))", (id, uid, uid, uid, uid))
            owned = await cur.fetchone()
            if not owned:
                return False
            await conn.execute("DELETE FROM documents WHERE id=%s", (id,))
            target = owned["parcel_id"] or owned["passbook_id"] or id
            await log_audit(conn, uid, "delete_document", target, f"Deleted {owned['doc_no'] or 'a document'}")
            return True

    @strawberry.mutation
    async def update_document_type(self, info: strawberry.Info, id: str, doc_type: str) -> Optional[DocumentType]:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                f"SELECT parcel_id, passbook_id FROM documents WHERE id=%s AND {_DOC_OWNED}",
                (id, *_doc_owner_args(uid)))
            owned = await cur.fetchone()
            if not owned:
                return None
            cur = await conn.execute(
                "UPDATE documents SET doc_type=%s WHERE id=%s RETURNING *", (doc_type, id))
            row = await cur.fetchone()
            target = owned["parcel_id"] or owned["passbook_id"] or id
            await log_audit(conn, uid, "reclassify_document", target, f"→ {doc_type}")
            return to_type(DocumentType, row)

    @strawberry.mutation
    async def link_documents(
        self, info: strawberry.Info, from_id: str, to_id: str,
        relation: str = "prior_title", note: str = "",
    ) -> Optional[DocumentLinkType]:
        """Assert that one paper follows another — the chain of title.

        Bought from A, then sold on to C: the B→C deed carries a `prior_title`
        edge to the A→B deed. Both documents must belong to the caller, so a
        trail can never be made to point at a stranger's record.
        """
        uid = _uid_from_info(info)
        if relation not in DOCUMENT_RELATIONS:
            raise NotAuthorized(f"'{relation}' is not a kind of link")
        # A paper cannot cite itself, and a chain that loops cannot be walked.
        if from_id == to_id:
            return None
        async with pool.connection() as conn:
            for doc in (from_id, to_id):
                cur = await conn.execute(
                    f"SELECT 1 FROM documents WHERE id=%s AND {_DOC_OWNED}",
                    (doc, *_doc_owner_args(uid)))
                if not await cur.fetchone():
                    raise NotAuthorized("Not authorized for this document")
            # The reverse edge already existing would make a two-document loop:
            # each claiming to come before the other. Refuse rather than store
            # a trail that cannot be read in either direction.
            cur = await conn.execute(
                "SELECT 1 FROM document_links WHERE from_document_id=%s AND to_document_id=%s",
                (to_id, from_id))
            if await cur.fetchone():
                raise NotAuthorized("Those two already point the other way round")
            # ON CONFLICT makes this idempotent under a replayed mutation from
            # the phone's write queue — the unique index is on (from, to, relation).
            cur = await conn.execute(
                "INSERT INTO document_links (id, owner_user_id, from_document_id, to_document_id, "
                "                            relation, note, created_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s) "
                "ON CONFLICT (from_document_id, to_document_id, relation) DO UPDATE SET note=EXCLUDED.note "
                "RETURNING *",
                (new_id(), uid, from_id, to_id, relation, note, datetime.utcnow().isoformat()))
            row = await cur.fetchone()
            await log_audit(conn, uid, "link_documents", from_id, f"{relation} → {to_id}")
            return to_type(DocumentLinkType, row)

    @strawberry.mutation
    async def unlink_documents(self, info: strawberry.Info, id: str) -> bool:
        """Take an asserted link back. The documents themselves are untouched."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "DELETE FROM document_links WHERE id=%s AND owner_user_id=%s RETURNING from_document_id",
                (id, uid))
            row = await cur.fetchone()
            if not row:
                return False
            await log_audit(conn, uid, "unlink_documents", row["from_document_id"], "Removed a link")
            return True

    @strawberry.mutation
    async def rename_document(self, info: strawberry.Info, id: str, name: str) -> Optional[DocumentType]:
        """Give a file the name its owner wants to find it by.

        The storage node is renamed separately by the client (the gateway owns
        My Drive); this is the copy the vault actually lists, so the new name
        shows up offline and without a per-row node lookup.

        `id` may be either a `documents` row or the READING hanging off one.
        The phone's vault is built on readings and the web's on files, and
        neither should have to know which id the other holds to rename the same
        piece of paper.
        """
        uid = _uid_from_info(info)
        name = (name or "").strip()
        if not name:
            return None
        async with pool.connection() as conn:
            cur = await conn.execute(
                f"UPDATE documents SET name=%s WHERE id=%s AND {_DOC_OWNED} RETURNING *",
                (name, id, *_doc_owner_args(uid)))
            row = await cur.fetchone()
            if not row:
                cur = await conn.execute(
                    f"UPDATE documents SET name=%s WHERE reading_id=%s AND {_DOC_OWNED} RETURNING *",
                    (name, id, *_doc_owner_args(uid)))
                row = await cur.fetchone()
            if not row:
                return None
            await log_audit(conn, uid, "rename_document", id, f"→ {name}")
            return to_type(DocumentType, row)

    @strawberry.mutation
    async def attach_document_reading(
        self, info: strawberry.Info, id: str, reading_id: str, doc_type: str = ""
    ) -> Optional[DocumentType]:
        """Hang an AI reading onto a file, once a person has accepted it.

        Reading is layer 2 and it is OPT-IN: uploading costs nothing, and this
        is the only thing that ever spends a credit's worth of extraction on a
        file. Called after the reader has run and the person said yes to what
        it found, never automatically on upload.
        """
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            # The reading has to be this account's too, or a document could be
            # made to display somebody else's extraction.
            cur = await conn.execute(
                "SELECT 1 FROM registered_documents WHERE id=%s AND owner_user_id=%s",
                (reading_id, uid))
            if not await cur.fetchone():
                raise NotAuthorized("Not authorized for this reading")
            cur = await conn.execute(
                f"UPDATE documents SET reading_id=%s"
                f"{', doc_type=%s' if doc_type else ''} "
                f"WHERE id=%s AND {_DOC_OWNED} RETURNING *",
                (reading_id, *((doc_type,) if doc_type else ()), id, *_doc_owner_args(uid)))
            row = await cur.fetchone()
            if not row:
                return None
            await log_audit(conn, uid, "read_document", id, f"Read as {doc_type or 'a document'}")
            return to_type(DocumentType, row)

    @strawberry.mutation
    async def update_document_link(
        self, info: strawberry.Info, id: str, parcel_id: str, passbook_id: str,
        property_id: str = "",
    ) -> Optional[DocumentType]:
        """Point a file at the land it belongs to. Exclusive: a document is
        filed against ONE of parcel / khata / property, so the arguments are
        the whole truth and an omitted one clears."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            # Must already own the row (via its current land, or as uploader).
            cur = await conn.execute(
                f"SELECT 1 FROM documents WHERE id=%s AND {_DOC_OWNED}",
                (id, *_doc_owner_args(uid)))
            if not await cur.fetchone():
                return None
            # New target(s) must be owned too — check each independently so a
            # caller cannot slip an unowned passbook past a parcel-only check.
            if parcel_id:
                await _assert_owns_parcel(conn, uid, parcel_id)
            if passbook_id:
                await _assert_owns_passbook(conn, uid, passbook_id)
            if property_id:
                await _assert_owns_property(conn, uid, property_id)
            cur = await conn.execute(
                "UPDATE documents SET parcel_id=%s, passbook_id=%s, property_id=%s WHERE id=%s RETURNING *",
                (parcel_id, passbook_id, property_id, id))
            row = await cur.fetchone()
            await log_audit(conn, uid, "link_document",
                            parcel_id or passbook_id or property_id or id, "Linked a document")
            return to_type(DocumentType, row)

    @strawberry.mutation
    async def create_beneficiary(
        self,
        info: strawberry.Info,
        person_name: str,
        relationship: str,
        share_pct: float,
        kind: str,
        phone: str = "",
        email: str = "",
        person_contact: str = "",
        parcel_id: str = "",
        present_address: str = "",
        dob: str = "",
        marital_status: str = "",
        spouse_name: str = "",
        spouse_contact: str = "",
        spouse_status: str = "",
        guardian_name: str = "",
        guardian_contact: str = "",
        aadhaar: str = "",
        gender: str = "",
        photo: str = "",
    ) -> BeneficiaryType:
        """Add a beneficiary/co-owner. Parcel is optional (link later). Status is
        system-managed — always starts 'pending' and only becomes 'verified' when
        the invitee accepts. A verification invite is generated on create: it goes
        to the guardian for a minor, otherwise to the beneficiary. Aadhaar is
        masked before storage (DPDP-2023); when a parcel is linked, total shares
        across its beneficiaries cannot exceed 100%."""
        uid = _uid_from_info(info)
        phone = (phone or "").strip(); email = (email or "").strip()
        # The verification invite goes to email if given, else the mobile.
        contact = email or phone or (person_contact or "").strip()
        if not contact:
            raise ValueError("Add a mobile number or email so the beneficiary can be verified")
        minor = _is_minor(dob)
        if minor and not (guardian_name or "").strip():
            raise ValueError("A minor needs a guardian (head of household) to verify on their behalf")
        if (marital_status or "").lower() == "married" and not (spouse_name or "").strip():
            raise ValueError("Please add the spouse for a married beneficiary")
        aadhaar_masked = _mask_aadhaar(aadhaar) if (aadhaar or "").strip() else ""
        bid = new_id()
        token = str(uuid.uuid4())
        invitee = (guardian_contact or "").strip() if minor else contact
        async with pool.connection() as conn:
            # The beneficiary and the invitation that verifies them share a
            # token: one without the other is an heir who can never be
            # confirmed.
            async with conn.transaction():
                if (parcel_id or "").strip():
                    await _assert_owns_parcel(conn, uid, parcel_id)
                    # Share-total guard: existing (non-revoked) shares + this one ≤ 100%.
                    existing = await (await conn.execute(
                        "SELECT COALESCE(SUM(share_pct),0) AS s FROM beneficiaries "
                        "WHERE parcel_id=%s AND status <> 'revoked'", (parcel_id,))).fetchone()
                    if float(existing["s"] or 0) + float(share_pct or 0) > 100.0001:
                        raise ValueError(
                            f"Shares for this parcel would exceed 100% "
                            f"({float(existing['s'] or 0):.1f}% already allocated). Lower the share.")
                cur = await conn.execute(
                    "INSERT INTO beneficiaries (id, parcel_id, owner_user_id, person_name, person_contact, "
                    "phone, email, present_address, relationship, share_pct, kind, status, dob, is_minor, marital_status, "
                    "spouse_name, spouse_contact, spouse_status, guardian_name, guardian_contact, invite_token, "
                    "aadhaar_masked, gender, photo) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'pending',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
                    (bid, (parcel_id or "").strip(), uid, person_name, contact, phone, email, present_address, relationship,
                     share_pct, kind, dob, minor, marital_status, spouse_name, spouse_contact, spouse_status,
                     guardian_name, guardian_contact, _capability_hash(token), aadhaar_masked, gender, photo),
                )
                row = await cur.fetchone()
                # Verification invite — the beneficiary/guardian accepts via this token.
                await conn.execute(
                    "INSERT INTO invitations (id, scope_type, scope_id, role, invitee_contact, token, expiry, status, created_at) "
                    "VALUES (%s, 'beneficiary', %s, %s, %s, %s, %s, 'pending', %s)",
                    (new_id(), bid, kind, invitee or contact, _capability_hash(token),
                     _invitation_expiry(), datetime.utcnow().isoformat()),
                )
                await log_audit(conn, uid, "add_beneficiary", bid, f"{person_name} ({kind}) — invite sent, pending verification")
                row["invite_token"] = token
                return to_type(BeneficiaryType, row)

    @strawberry.mutation
    async def verify_beneficiary(
        self, info: strawberry.Info, token: str, inactivity_email_consent: bool = False,
    ) -> BeneficiaryType:
        return await _verify_by_token(info, token, inactivity_email_consent)

    @strawberry.mutation
    async def verify_member(self, info: strawberry.Info, token: str) -> BeneficiaryType:
        return await _verify_by_token(info, token)

    @strawberry.mutation
    async def add_note(self, info: strawberry.Info, entity_type: str, entity_id: str, body: str) -> NoteType:
        """Append a note to a passbook / parcel / document. Append-only history."""
        uid = _uid_from_info(info)
        nid = new_id()
        async with pool.connection() as conn:
            cur = await conn.execute(
                "INSERT INTO notes (id, owner_user_id, entity_type, entity_id, body, created_at) "
                "VALUES (%s, %s, %s, %s, %s, %s) RETURNING *",
                (nid, uid, entity_type, entity_id, body, datetime.utcnow().isoformat()),
            )
            row = await cur.fetchone()
            note_target = entity_id if entity_type in ("parcel", "passbook") else nid
            await log_audit(conn, uid, "add_note", note_target, "Added a note")
            return to_type(NoteType, row)

    @strawberry.mutation
    async def add_land_expense(
        self, info: strawberry.Info, title: str, amount: float, category: str = "other",
        entity_type: str = "", entity_id: str = "", spent_on: str = "",
        vendor: str = "", note: str = "",
    ) -> LandExpenseType:
        uid = _uid_from_info(info)
        eid = new_id()
        async with pool.connection() as conn:
            cur = await conn.execute(
                "INSERT INTO land_expenses (id, owner_user_id, entity_type, entity_id, category, "
                "title, amount, spent_on, vendor, note, created_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
                (eid, uid, entity_type, entity_id, category, title, amount, spent_on,
                 vendor, note, datetime.utcnow().isoformat()),
            )
            row = await cur.fetchone()
            await log_audit(conn, uid, "add_land_expense", entity_id or eid, title)
            return to_type(LandExpenseType, row)

    @strawberry.mutation
    async def delete_land_expense(self, info: strawberry.Info, id: str) -> bool:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "DELETE FROM land_expenses WHERE id=%s AND owner_user_id=%s RETURNING title",
                (id, uid))
            row = await cur.fetchone()
            if row:
                await log_audit(conn, uid, "delete_land_expense", id, row["title"])
            return row is not None

    @strawberry.mutation
    async def add_work_request(
        self, info: strawberry.Info, kind: str, title: str,
        entity_type: str = "", entity_id: str = "", assignee: str = "",
        cost: float = 0, note: str = "", due_date: str = "",
    ) -> WorkRequestType:
        uid = _uid_from_info(info)
        rid = new_id()
        async with pool.connection() as conn:
            if entity_type == "record" and entity_id:
                existing = await web360._active_service_request(
                    conn, uid, entity_id, kind)
                if existing:
                    await log_audit(
                        conn, uid, "service.duplicate_blocked", existing["id"],
                        f"Kept existing {web360.canonical_service_kind(kind)} request")
                    return to_type(WorkRequestType, existing)
            cur = await conn.execute(
                "INSERT INTO work_requests (id, owner_user_id, kind, title, entity_type, "
                "entity_id, assignee, cost, stage, needs_you, note, due_date, closed, created_at, service_key) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,0,FALSE,%s,%s,FALSE,%s,%s) RETURNING *",
                (rid, uid, kind, title, entity_type, entity_id, assignee, cost,
                 note, due_date, datetime.utcnow().isoformat(),
                 web360.canonical_service_kind(kind)),
            )
            row = await cur.fetchone()
            # The ticket's own trail, which the audit log is not: the Ticket
            # screen reads its history out of ticket_events, and both order
            # paths in web360 write a 'place' line the moment a ticket exists.
            # A ticket placed through this older mutation opened with an empty
            # history — no record of who asked for it or when. Same helper, so
            # the two kinds of ticket cannot drift into two kinds of trail.
            await web360._event(
                conn, uid, rid, kind="status", action="place", to_status="placed",
                headline=web360.ticketing.event_headline(
                    "status", "place", {"actor_label": "You"}),
                detail=f"Ordered from {entity_id}" if entity_id else "Ordered")
            await log_audit(conn, uid, "add_work_request", rid, title)
            return to_type(WorkRequestType, row)

    @strawberry.mutation
    async def update_work_request(
        self, info: strawberry.Info, id: str, stage: Optional[int] = None,
        assignee: Optional[str] = None, cost: Optional[float] = None,
        needs_you: Optional[bool] = None, note: Optional[str] = None,
        due_date: Optional[str] = None, closed: Optional[bool] = None,
    ) -> WorkRequestType:
        uid = _uid_from_info(info)
        fields = {"stage": stage, "assignee": assignee, "cost": cost,
                  "needs_you": needs_you, "note": note, "due_date": due_date, "closed": closed}
        sets = {k: v for k, v in fields.items() if v is not None}
        async with pool.connection() as conn:
            if not sets:
                cur = await conn.execute(
                    "SELECT * FROM work_requests WHERE id=%s AND owner_user_id=%s", (id, uid))
                return to_type(WorkRequestType, await cur.fetchone())
            clause = ", ".join(f"{k}=%s" for k in sets)
            cur = await conn.execute(
                f"UPDATE work_requests SET {clause} WHERE id=%s AND owner_user_id=%s RETURNING *",
                (*sets.values(), id, uid),
            )
            row = await cur.fetchone()
            await log_audit(conn, uid, "update_work_request", id, row["title"])
            return to_type(WorkRequestType, row)

    @strawberry.mutation
    async def delete_work_request(self, info: strawberry.Info, id: str) -> bool:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "DELETE FROM work_requests WHERE id=%s AND owner_user_id=%s RETURNING title",
                (id, uid))
            row = await cur.fetchone()
            if row:
                await log_audit(conn, uid, "delete_work_request", id, row["title"])
            return row is not None

    @strawberry.mutation
    async def add_land_feature(
        self, info: strawberry.Info, entity_type: str, entity_id: str,
        category: str, label: str, value: float = 0, unit: str = "",
        reference: str = "", vendor: str = "", condition: str = "", note: str = "",
    ) -> LandFeatureType:
        """Record something that is physically on the land."""
        uid = _uid_from_info(info)
        fid = new_id()
        async with pool.connection() as conn:
            cur = await conn.execute(
                "INSERT INTO land_features (id, owner_user_id, entity_type, entity_id, category, "
                "label, value, unit, reference, vendor, condition, note, created_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
                (fid, uid, entity_type, entity_id, category, label, value, unit,
                 reference, vendor, condition, note, datetime.utcnow().isoformat()),
            )
            row = await cur.fetchone()
            await log_audit(conn, uid, "add_land_feature", entity_id, label or category)
            return to_type(LandFeatureType, row)

    @strawberry.mutation
    async def update_land_feature(
        self, info: strawberry.Info, id: str, label: Optional[str] = None,
        value: Optional[float] = None, unit: Optional[str] = None,
        reference: Optional[str] = None, note: Optional[str] = None,
        category: Optional[str] = None, vendor: Optional[str] = None,
        condition: Optional[str] = None,
    ) -> LandFeatureType:
        uid = _uid_from_info(info)
        fields = {"label": label, "value": value, "unit": unit,
                  "reference": reference, "note": note, "category": category,
                  "vendor": vendor, "condition": condition}
        sets = {k: v for k, v in fields.items() if v is not None}
        async with pool.connection() as conn:
            if not sets:
                cur = await conn.execute(
                    "SELECT * FROM land_features WHERE id=%s AND owner_user_id=%s", (id, uid))
                return to_type(LandFeatureType, await cur.fetchone())
            clause = ", ".join(f"{k}=%s" for k in sets)
            cur = await conn.execute(
                f"UPDATE land_features SET {clause} WHERE id=%s AND owner_user_id=%s RETURNING *",
                (*sets.values(), id, uid),
            )
            row = await cur.fetchone()
            await log_audit(conn, uid, "update_land_feature", row["entity_id"], row["label"])
            return to_type(LandFeatureType, row)

    @strawberry.mutation
    async def delete_land_feature(self, info: strawberry.Info, id: str) -> bool:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "DELETE FROM land_features WHERE id=%s AND owner_user_id=%s RETURNING entity_id, label",
                (id, uid))
            row = await cur.fetchone()
            if row:
                await log_audit(conn, uid, "delete_land_feature", row["entity_id"], row["label"])
            return row is not None

    @strawberry.mutation
    async def delete_note(self, info: strawberry.Info, id: str) -> bool:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute("DELETE FROM notes WHERE id=%s AND owner_user_id=%s", (id, uid))
            return cur.rowcount > 0

    @strawberry.mutation
    async def set_passbook_photo(self, info: strawberry.Info, id: str, photo: str) -> bool:
        """Set (or clear) the passbook's profile photo — a client-cropped data-URL."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute("UPDATE passbooks SET photo=%s WHERE id=%s AND owner_user_id=%s", (photo, id, uid))
            return cur.rowcount > 0

    # ---- Family tree ------------------------------------------------------
    @strawberry.mutation
    async def add_family_member(
        self, info: strawberry.Info, name: str, relation: str, gender: str = "",
        dob: str = "", phone: str = "", email: str = "", bio: str = "", is_beneficiary: bool = True,
        share_pct: float = 0.0, photo: str = "",
    ) -> FamilyMemberType:
        """Add a relative to the caller's family. Family default to beneficiaries."""
        uid = _uid_from_info(info)
        fid = new_id()
        async with pool.connection() as conn:
            cur = await conn.execute(
                "INSERT INTO family_members (id, owner_user_id, name, relation, gender, dob, phone, email, bio, is_beneficiary, share_pct, invite_status, photo, created_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'',%s,%s) RETURNING *",
                (fid, uid, name, relation, gender, dob, phone, email, bio, is_beneficiary, share_pct, photo, datetime.utcnow().isoformat()),
            )
            row = await cur.fetchone()
            await log_audit(conn, uid, "add_family_member", fid, f"{relation}: {name}")
            return to_type(FamilyMemberType, row)

    @strawberry.mutation
    async def update_family_member(
        self, info: strawberry.Info, id: str, name: str, relation: str, gender: str = "",
        dob: str = "", phone: str = "", email: str = "", bio: str = "", is_beneficiary: bool = True,
        share_pct: float = 0.0, photo: str = "",
    ) -> FamilyMemberType:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            async with conn.transaction():
                prior = await (await conn.execute(
                    "SELECT email,phone,group_id FROM family_members WHERE id=%s AND owner_user_id=%s FOR UPDATE",
                    (id, uid))).fetchone()
                if not prior:
                    raise NotAuthorized("Not authorized for this family member")
                email_changed = (prior.get("email") or "").strip().casefold() != (email or "").strip().casefold()
                phone_changed = re.sub(r"\D", "", prior.get("phone") or "") != re.sub(r"\D", "", phone or "")
                cur = await conn.execute(
                    "UPDATE family_members SET name=%s,relation=%s,gender=%s,dob=%s,phone=%s,email=%s,"
                    "bio=%s,is_beneficiary=%s,share_pct=%s,photo=%s,"
                    "email_verified=CASE WHEN %s THEN false ELSE email_verified END,"
                    "phone_verified=CASE WHEN %s THEN false ELSE phone_verified END,"
                    "inactivity_email_consent=CASE WHEN %s THEN false ELSE inactivity_email_consent END,"
                    "inactivity_email_consent_at=CASE WHEN %s THEN '' ELSE inactivity_email_consent_at END,"
                    "invite_token=CASE WHEN %s THEN '' ELSE invite_token END,"
                    "invite_status=CASE WHEN %s THEN '' ELSE invite_status END,"
                    "status=CASE WHEN %s THEN 'pending' ELSE status END "
                    "WHERE id=%s AND owner_user_id=%s RETURNING *",
                    (name, relation, gender, dob, phone, email, bio, is_beneficiary, share_pct, photo,
                     email_changed, phone_changed, email_changed, email_changed,
                     email_changed or phone_changed, email_changed or phone_changed,
                     email_changed or phone_changed, id, uid))
                if email_changed or phone_changed:
                    await conn.execute(
                        "UPDATE invitations SET status='revoked',token='' WHERE scope_id=%s "
                        "AND scope_type IN ('family','beneficiary') AND status='pending'", (id,))
                if email_changed:
                    await conn.execute(
                        "DELETE FROM family_notifiers WHERE owner_user_id=%s AND group_id=%s AND member_id=%s",
                        (uid, prior["group_id"], id))
                return to_type(FamilyMemberType, await cur.fetchone())

    @strawberry.mutation
    async def delete_family_member(self, info: strawberry.Info, id: str) -> bool:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            async with conn.transaction():
                member = await (await conn.execute(
                    "SELECT group_id,is_self FROM family_members WHERE id=%s AND owner_user_id=%s FOR UPDATE",
                    (id, uid))).fetchone()
                if not member or member["is_self"]:
                    return False
                await conn.execute(
                    "DELETE FROM family_notifiers WHERE member_id=%s AND owner_user_id=%s AND group_id=%s",
                    (id, uid, member["group_id"]))
                await conn.execute(
                    "UPDATE inactivity_capabilities SET consumed_at=%s WHERE recipient_ref=%s "
                    "AND owner_user_id=%s AND group_id=%s AND consumed_at=''",
                    (datetime.now(timezone.utc).isoformat(), id, uid, member["group_id"]))
                cur = await conn.execute("DELETE FROM family_members WHERE id=%s AND owner_user_id=%s", (id, uid))
                return cur.rowcount > 0

    @strawberry.mutation
    async def set_family_member_photo(self, info: strawberry.Info, id: str, photo: str) -> bool:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute("UPDATE family_members SET photo=%s WHERE id=%s AND owner_user_id=%s", (photo, id, uid))
            return cur.rowcount > 0

    @strawberry.mutation
    async def invite_family_member(self, info: strawberry.Info, id: str, role: str = "view") -> FamilyMemberType:
        """Invite a family member to create their account. Records the invitation
        and flags the member as invited."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            # The invitation row and the member's copy of the token are the
            # same credential.
            async with conn.transaction():
                mcur = await conn.execute("SELECT * FROM family_members WHERE id=%s AND owner_user_id=%s", (id, uid))
                member = await mcur.fetchone()
                if not member:
                    raise NotAuthorized("Not authorized for this family member")
                invitee = ((member.get("email") or "").strip() or (member.get("phone") or "").strip())
                if not invitee:
                    raise ValueError("Add a phone or email for this family member before inviting")
                iid = new_id()
                token = str(uuid.uuid4())
                await conn.execute(
                    "INSERT INTO invitations (id, scope_type, scope_id, role, invitee_contact, token, expiry, status, created_at) "
                    "VALUES (%s, 'family', %s, %s, %s, %s, %s, 'pending', %s)",
                    (iid, id, role, invitee, _capability_hash(token),
                     _invitation_expiry(), datetime.utcnow().isoformat()),
                )
                cur = await conn.execute(
                    "UPDATE family_members SET invite_status='invited', status='pending', invite_token=%s, invite_channel=%s WHERE id=%s AND owner_user_id=%s RETURNING *", (_capability_hash(token), "email" if "@" in invitee else "phone", id, uid))
                await log_audit(conn, uid, "invite_family_member", id, f"To {invitee}")
                return to_type(FamilyMemberType, await cur.fetchone())

    # ---- Groups (typed land-holding entities) ------------------------------
    @strawberry.mutation
    async def create_group(self, info: strawberry.Info, type: str, name: str, description: str = "") -> GroupType:
        uid = _uid_from_info(info)
        gtype = type if type in GROUP_TYPES else "family"
        async with pool.connection() as conn:
            gid = new_id(); now = datetime.utcnow().isoformat()
            await conn.execute(
                "INSERT INTO groups (id, owner_user_id, type, name, description, created_at, updated_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (gid, uid, gtype, name.strip() or GROUP_TYPES[gtype]["label"], description.strip(), now, now))
            await ensure_self(conn, uid, gid, _group_primary_role(gtype))
            await log_audit(conn, uid, "create_group", gid, f"{gtype}: {name}")
            row = await (await conn.execute("SELECT * FROM groups WHERE id=%s", (gid,))).fetchone()
            return await _group_summary(conn, uid, row)

    @strawberry.mutation
    async def update_group(self, info: strawberry.Info, id: str, name: str, description: str = "") -> GroupType:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "UPDATE groups SET name=%s, description=%s, updated_at=%s WHERE id=%s AND owner_user_id=%s RETURNING *",
                (name.strip(), description.strip(), datetime.utcnow().isoformat(), id, uid))
            row = await cur.fetchone()
            if not row:
                raise NotAuthorized("Not authorized for this group")
            # create_group and delete_group both audit; this one did not, so a
            # rename was the one change to a group that left no trace. The
            # group's Activity tab is built on exactly this table, so renaming
            # a group and then looking at its history said "nothing has
            # happened yet" — which is a worse answer than no tab at all.
            await log_audit(conn, uid, "update_group", id, _named("", row["name"]))
            return await _group_summary(conn, uid, row)

    @strawberry.mutation
    async def delete_group(self, info: strawberry.Info, id: str) -> bool:
        """Delete household configuration atomically; holdings return to personal."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            async with conn.transaction():
                g = await (await conn.execute(
                    "SELECT name FROM groups WHERE id=%s AND owner_user_id=%s FOR UPDATE", (id, uid))).fetchone()
                if not g:
                    return False
                await conn.execute("UPDATE passbooks SET group_id='' WHERE group_id=%s AND owner_user_id=%s", (id, uid))
                await conn.execute("UPDATE properties SET group_id='' WHERE group_id=%s AND owner_user_id=%s", (id, uid))
                await conn.execute("DELETE FROM family_notifiers WHERE group_id=%s AND owner_user_id=%s", (id, uid))
                await conn.execute("DELETE FROM inactivity_capabilities WHERE group_id=%s AND owner_user_id=%s", (id, uid))
                await conn.execute("DELETE FROM inactivity_deliveries WHERE group_id=%s AND owner_user_id=%s", (id, uid))
                await conn.execute("DELETE FROM inactivity_escalations WHERE group_id=%s AND owner_user_id=%s", (id, uid))
                await conn.execute("DELETE FROM family_members WHERE group_id=%s AND owner_user_id=%s", (id, uid))
                cur = await conn.execute("DELETE FROM groups WHERE id=%s AND owner_user_id=%s", (id, uid))
                await log_audit(conn, uid, "delete_group", id, _named("", g["name"]))
                return cur.rowcount > 0

    @strawberry.mutation
    async def assign_land_to_group(self, info: strawberry.Info, passbook_id: str, group_id: str) -> bool:
        """Assign a passbook (and its parcels) to a group, or to '' for personal."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            if group_id:
                g = await (await conn.execute("SELECT 1 FROM groups WHERE id=%s AND owner_user_id=%s", (group_id, uid))).fetchone()
                if not g:
                    raise NotAuthorized("Not authorized for this group")
            cur = await conn.execute(
                "UPDATE passbooks SET group_id=%s WHERE id=%s AND owner_user_id=%s", (group_id, passbook_id, uid))
            if cur.rowcount > 0:
                await log_audit(conn, uid, "assign_land_to_group", passbook_id,
                                "Assigned to a group" if group_id else "Made personal")
            return cur.rowcount > 0

    @strawberry.mutation
    async def assign_property_to_group(self, info: strawberry.Info, property_id: str, group_id: str) -> bool:
        """Assign a property to a group, or to '' for personal."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            if group_id:
                g = await (await conn.execute("SELECT 1 FROM groups WHERE id=%s AND owner_user_id=%s", (group_id, uid))).fetchone()
                if not g:
                    raise NotAuthorized("Not authorized for this group")
            cur = await conn.execute(
                "UPDATE properties SET group_id=%s WHERE id=%s AND owner_user_id=%s", (group_id, property_id, uid))
            if cur.rowcount > 0:
                await log_audit(conn, uid, "assign_property_to_group", property_id,
                                "Assigned to a group" if group_id else "Made personal")
            return cur.rowcount > 0

    @strawberry.mutation
    async def toggle_favourite(self, info: strawberry.Info, entity_type: str, entity_id: str) -> bool:
        """Star or unstar a record. Returns the state AFTER the toggle.

        Deliberately server-side rather than a device preference: the same
        account uses two web heads, and a star that exists on one phone only
        is a worse answer than no star at all.
        """
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            async with conn.transaction():
                cur = await conn.execute(
                    "DELETE FROM favourites WHERE owner_user_id=%s AND entity_type=%s AND entity_id=%s RETURNING id",
                    (uid, entity_type, entity_id))
                if await cur.fetchone():
                    await log_audit(conn, uid, "unfavourite", entity_id, entity_type)
                    return False
                await conn.execute(
                    "INSERT INTO favourites (id, owner_user_id, entity_type, entity_id, created_at) "
                    "VALUES (%s,%s,%s,%s,%s)",
                    (new_id(), uid, entity_type, entity_id, datetime.utcnow().isoformat()))
                await log_audit(conn, uid, "favourite", entity_id, entity_type)
                return True

    @strawberry.mutation
    async def set_stake(self, info: strawberry.Info, kind: str, id: str, stake: str) -> bool:
        """Record the account holder's stake in a holding: owned | managed | watch."""
        uid = _uid_from_info(info)
        if stake not in ("owned", "managed", "watch"):
            raise ValueError("stake must be owned, managed or watch")
        async with pool.connection() as conn:
            if kind == "property":
                cur = await conn.execute(
                    "UPDATE properties SET stake=%s WHERE id=%s AND owner_user_id=%s", (stake, id, uid))
            else:
                cur = await conn.execute(
                    "UPDATE parcels SET stake=%s WHERE id=%s AND passbook_id IN "
                    "(SELECT id FROM passbooks WHERE owner_user_id=%s)", (stake, id, uid))
            if cur.rowcount > 0:
                await log_audit(conn, uid, "set_stake", id, f"Stake set to {stake}")
            return cur.rowcount > 0

    # ---- Unified people (family + beneficiaries) ---------------------------
    @strawberry.mutation
    async def add_member(
        self, info: strawberry.Info, group_id: str, name: str, relation: str = "other", role: str = "",
        gender: str = "", dob: str = "", phone: str = "", email: str = "", bio: str = "", photo: str = "",
        father_id: str = "", mother_id: str = "", spouse_id: str = "", is_beneficiary: bool = False,
        share_pct: float = 0.0, kind: str = "", parcel_id: str = "", present_address: str = "", aadhaar: str = "",
        aadhaar_candidate_id: str = "", guardian_name: str = "", guardian_contact: str = "", marital_status: str = "",
        spouse_name: str = "", spouse_contact: str = "", spouse_status: str = "",
    ) -> PersonType:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            async with conn.transaction():
                g = await (await conn.execute(
                    "SELECT type FROM groups WHERE id=%s AND owner_user_id=%s FOR UPDATE", (group_id, uid))).fetchone()
                if not g:
                    raise NotAuthorized("Not authorized for this group")
                v = dict(name=name, relation=relation, role=role, group_id=group_id, gender=gender, dob=dob,
                         phone=phone, email=email, bio=bio, photo=photo, father_id=father_id, mother_id=mother_id,
                         spouse_id=spouse_id, is_beneficiary=is_beneficiary, share_pct=share_pct, kind=kind,
                         parcel_id=parcel_id, present_address=present_address, aadhaar=aadhaar,
                         aadhaar_candidate_id=aadhaar_candidate_id,
                         guardian_name=guardian_name, guardian_contact=guardian_contact,
                         marital_status=marital_status, spouse_name=spouse_name, spouse_contact=spouse_contact,
                         spouse_status=spouse_status)
                pid = new_id()
                res = await _write_person(conn, uid, pid, v, is_update=False)
                await log_audit(conn, uid, "add_member", pid, f"{role or relation}: {name}")
                return res

    @strawberry.mutation
    async def update_member(
        self, info: strawberry.Info, id: str, name: Optional[str] = None,
        relation: Optional[str] = None, role: Optional[str] = None,
        gender: Optional[str] = None, dob: Optional[str] = None, phone: Optional[str] = None,
        email: Optional[str] = None, bio: Optional[str] = None, photo: Optional[str] = None,
        father_id: Optional[str] = None, mother_id: Optional[str] = None,
        spouse_id: Optional[str] = None, is_beneficiary: Optional[bool] = None,
        share_pct: Optional[float] = None, kind: Optional[str] = None,
        parcel_id: Optional[str] = None, present_address: Optional[str] = None,
        aadhaar: Optional[str] = None, aadhaar_candidate_id: Optional[str] = None,
        guardian_name: Optional[str] = None, guardian_contact: Optional[str] = None,
        marital_status: Optional[str] = None, spouse_name: Optional[str] = None,
        spouse_contact: Optional[str] = None, spouse_status: Optional[str] = None,
    ) -> PersonType:
        """Correct a person's details. Every argument is optional and only the
        ones supplied are written, the way update_passbook and update_parcel
        already work — a client that edits one field cannot blank the rest."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            async with conn.transaction():
                gid = (await (await conn.execute(
                    "SELECT group_id FROM family_members WHERE id=%s AND owner_user_id=%s FOR UPDATE",
                    (id, uid))).fetchone() or {}).get("group_id", "")
                v = dict(name=name, relation=relation, role=role, group_id=gid, gender=gender, dob=dob,
                         phone=phone, email=email, bio=bio, photo=photo, father_id=father_id, mother_id=mother_id,
                         spouse_id=spouse_id, is_beneficiary=is_beneficiary, share_pct=share_pct, kind=kind,
                         parcel_id=parcel_id, present_address=present_address, aadhaar=aadhaar,
                         aadhaar_candidate_id=aadhaar_candidate_id,
                         guardian_name=guardian_name, guardian_contact=guardian_contact,
                         marital_status=marital_status, spouse_name=spouse_name, spouse_contact=spouse_contact,
                         spouse_status=spouse_status)
                return await _write_person(conn, uid, id, v, is_update=True)

    @strawberry.mutation
    async def remove_member(self, info: strawberry.Info, id: str) -> bool:
        """Delete a non-self person and atomically remove notifier/tree links."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            async with conn.transaction():
                s = await (await conn.execute(
                    "SELECT is_self,name,group_id FROM family_members "
                    "WHERE id=%s AND owner_user_id=%s FOR UPDATE", (id, uid))).fetchone()
                if not s:
                    return False
                if s["is_self"]:
                    raise ValueError("You can't remove your own node")
                await conn.execute(
                    "DELETE FROM family_notifiers WHERE member_id=%s AND owner_user_id=%s AND group_id=%s",
                    (id, uid, s["group_id"]))
                await conn.execute(
                    "UPDATE inactivity_capabilities SET consumed_at=%s WHERE recipient_ref=%s "
                    "AND owner_user_id=%s AND group_id=%s AND consumed_at=''",
                    (_utc(datetime.utcnow()).isoformat(), id, uid, s["group_id"]))
                await conn.execute("UPDATE family_members SET father_id='' WHERE father_id=%s AND owner_user_id=%s", (id, uid))
                await conn.execute("UPDATE family_members SET mother_id='' WHERE mother_id=%s AND owner_user_id=%s", (id, uid))
                await conn.execute("UPDATE family_members SET spouse_id='' WHERE spouse_id=%s AND owner_user_id=%s", (id, uid))
                cur = await conn.execute("DELETE FROM family_members WHERE id=%s AND owner_user_id=%s", (id, uid))
                await log_audit(conn, uid, "remove_member", id, _named("", s["name"]))
                return cur.rowcount > 0

    @strawberry.mutation
    async def set_member_photo(self, info: strawberry.Info, id: str, photo: str) -> bool:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute("UPDATE family_members SET photo=%s WHERE id=%s AND owner_user_id=%s", (photo, id, uid))
            return cur.rowcount > 0

    @strawberry.mutation
    async def invite_member(self, info: strawberry.Info, id: str, role: str = "view") -> PersonType:
        """Invite a person: records the invitation, sends it via the notify seam
        (email or WhatsApp/SMS — stub-logged until providers are configured), and
        flags the member 'invited'. The channel is remembered so accepting the
        invite marks that channel verified."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            m = await (await conn.execute("SELECT * FROM family_members WHERE id=%s AND owner_user_id=%s", (id, uid))).fetchone()
            if not m:
                raise NotAuthorized("Not authorized for this person")
            email = (m.get("email") or "").strip()
            phone = (m.get("phone") or "").strip()
            invitee = email or phone
            if not invitee:
                raise ValueError("Add a phone or email for this person before inviting")
            channel = "email" if email else "phone"
            token = str(uuid.uuid4())
            await conn.execute("UPDATE invitations SET status='revoked', token='' WHERE scope_id=%s AND scope_type IN ('family', 'beneficiary') AND status='pending'", (id,))
            base = os.getenv("APP_PUBLIC_URL", "").rstrip("/")
            link = f"{base}/verify/{token}"
            await conn.execute(
                "INSERT INTO invitations (id, scope_type, scope_id, role, invitee_contact, token, expiry, status, created_at) "
                "VALUES (%s, 'family', %s, %s, %s, %s, %s, 'pending', %s)",
                (new_id(), id, role, invitee, _capability_hash(token),
                 _invitation_expiry(), datetime.utcnow().isoformat()))
            name = (m.get("name") or "there").strip() or "there"
            subject = "Please confirm your family/heir details — Pattadar"
            body = (f"Hi {name}, you've been listed as a beneficiary/heir on Pattadar land records. "
                    f"Please confirm your details here: {link}")
            send = await notify.notify_contact(conn, invitee, subject, body, owner=uid)
            cur = await conn.execute(
                "UPDATE family_members SET invite_status='invited', status='pending', invite_token=%s, invite_channel=%s "
                "WHERE id=%s AND owner_user_id=%s RETURNING *", (_capability_hash(token), channel, id, uid))
            await log_audit(conn, uid, "invite_member", id, f"Invited {invitee} via {send.get('channel', channel)}")
            row = await cur.fetchone()
            row["invite_token"] = token
            return to_type(PersonType, row)

    @strawberry.mutation
    async def set_notifiers(self, info: strawberry.Info, group_id: str, member_ids: List[str]) -> List[NotifierType]:
        """Atomically replace the ordered verified-email notifier list.

        The legacy empty-list contract remains the all-family email mode. Every
        selected id is validated before the current order is touched, preventing
        cross-household delivery and partial destructive replacement.
        """
        uid = _uid_from_info(info)
        if len(member_ids) != len(set(member_ids)):
            raise ValueError("A family member can appear only once in the notifier order")
        async with pool.connection() as conn:
            async with conn.transaction():
                own = await (await conn.execute(
                    "SELECT type FROM groups WHERE id=%s AND owner_user_id=%s FOR UPDATE",
                    (group_id, uid))).fetchone()
                if not own:
                    raise NotAuthorized("Not authorized for this group")
                if own["type"] != "family":
                    raise ValueError("Inactivity notifiers are available only for family groups")
                members = []
                if member_ids:
                    members = await (await conn.execute(
                        "SELECT id,name,relation,role,email,email_verified,inactivity_email_consent,is_self,is_minor "
                        "FROM family_members WHERE owner_user_id=%s AND group_id=%s AND id=ANY(%s)",
                        (uid, group_id, member_ids))).fetchall()
                    by_id = {m["id"]: m for m in members}
                    if set(by_id) != set(member_ids):
                        raise ValueError("Every notifier must belong to this family")
                    if any(m["is_self"] or m.get("is_minor") for m in members):
                        raise ValueError("Only adult family members can be escalation notifiers")
                    if any(not (m.get("email") or "").strip() or not m.get("email_verified")
                           or not m.get("inactivity_email_consent") for m in members):
                        raise ValueError("Every selected notifier needs a verified email and safeguard-email consent")
                else:
                    by_id = {}

                await conn.execute(
                    "DELETE FROM family_notifiers WHERE owner_user_id=%s AND group_id=%s", (uid, group_id))
                now = _utc(datetime.utcnow()).isoformat()
                for i, mid in enumerate(member_ids):
                    await conn.execute(
                        "INSERT INTO family_notifiers "
                        "(id,owner_user_id,group_id,member_id,priority,channel,created_at) "
                        "VALUES (%s,%s,%s,%s,%s,'email',%s)",
                        (new_id(), uid, group_id, mid, i + 1, now))
                await log_audit(conn, uid, "set_notifiers", group_id,
                                "All verified family emails" if not member_ids else f"{len(member_ids)} ordered notifier(s)")
                return [NotifierType(
                    member_id=mid, name=by_id[mid]["name"] or "",
                    relation=by_id[mid]["relation"] or by_id[mid]["role"] or "",
                    contact=by_id[mid]["email"] or "", priority=i + 1,
                    channel="email", eligible=True,
                ) for i, mid in enumerate(member_ids)]

    @strawberry.mutation
    async def send_test_notification(self, info: strawberry.Info, to: str) -> str:
        """Send a test message to `to` (email or phone) via the notify seam — use it
        to validate a newly configured provider. Records to notification_log like any
        real send; returns the provider/channel result as JSON."""
        uid = _uid_from_info(info)
        to = (to or "").strip()
        if not to:
            raise ValueError("Enter an email or phone number to send the test to")
        async with pool.connection() as conn:
            res = await notify.notify_contact(
                conn, to, "Pattadar — test notification",
                "This is a test message from Pattadar. If you received it, your notification provider is working.",
                owner=uid)
        return json.dumps(res)

    @strawberry.mutation
    async def delete_notification(self, info: strawberry.Info, id: str) -> bool:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute("DELETE FROM notification_log WHERE id=%s AND owner_user_id=%s", (id, uid))
            deleted = cur.rowcount > 0
            if deleted:
                await log_audit(conn, uid, "delete_notification", id)
            return deleted

    @strawberry.mutation
    async def run_inactivity_check(self, info: strawberry.Info) -> str:
        """Run the inactivity dead-man's-switch once for the caller's own groups
        (manual trigger — the daily CronJob runs it for everyone). Returns a summary."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            summary = await _run_inactivity_check(conn, datetime.utcnow(), only_owner=uid)
        return json.dumps(summary)

    @strawberry.mutation
    async def acknowledge_inactivity(
        self, info: strawberry.Info, token: str, withdraw: bool = False,
    ) -> bool:
        """Consume one capability using the scheduler's group→user→state order."""
        token = (token or "").strip()
        if not token:
            return False
        now = datetime.now(timezone.utc)
        token_hash = _capability_hash(token)
        async with pool.connection() as conn:
            async with conn.transaction():
                # Initial reads discover lock keys only; authority is revalidated
                # after all rows are locked in the same order as the scheduler.
                hint = await (await conn.execute(
                    "SELECT owner_user_id,group_id FROM inactivity_capabilities WHERE token_hash=%s",
                    (token_hash,))).fetchone()
                legacy_hint = None
                if not hint:
                    legacy_hint = await (await conn.execute(
                        "SELECT id,owner_user_id,group_id FROM inactivity_escalations "
                        "WHERE ack_token=%s AND acknowledged=false", (token,))).fetchone()
                    hint = legacy_hint
                if not hint:
                    return False
                group = await (await conn.execute(
                    "SELECT id FROM groups WHERE id=%s AND owner_user_id=%s FOR UPDATE",
                    (hint["group_id"], hint["owner_user_id"]))).fetchone()
                if not group:
                    return False
                user = await (await conn.execute(
                    "SELECT id FROM users WHERE id=%s FOR UPDATE", (hint["owner_user_id"],))).fetchone()
                if not user:
                    return False
                esc = await (await conn.execute(
                    "SELECT * FROM inactivity_escalations WHERE owner_user_id=%s "
                    "AND group_id=%s FOR UPDATE", (hint["owner_user_id"], hint["group_id"]))).fetchone()
                if not esc:
                    return False

                if legacy_hint:
                    issued = _parse_utc(esc.get("last_notified_at", "")
                                        or esc.get("updated_at", "") or esc.get("created_at", ""))
                    if (esc.get("id") != legacy_hint["id"] or esc.get("ack_token") != token
                            or esc.get("acknowledged") or not issued
                            or issued + timedelta(days=30) <= now):
                        return False
                    await conn.execute(
                        "UPDATE inactivity_escalations SET acknowledged=true,stage='closed_family',ack_token='',"
                        "family_acknowledged_at=%s,next_action_at='',last_outcome='legacy_acknowledged',updated_at=%s "
                        "WHERE id=%s", (now.isoformat(), now.isoformat(), esc["id"]))
                    await log_audit(conn, esc["owner_user_id"], "acknowledge_inactivity",
                                    esc["group_id"], "legacy_family",
                                    actor_kind=audit.ACTOR_RECIPIENT,
                                    metadata={"actor_type": "legacy_family"})
                    return True

                capability = await (await conn.execute(
                    "SELECT * FROM inactivity_capabilities WHERE token_hash=%s FOR UPDATE",
                    (token_hash,))).fetchone()
                expires = _parse_utc((capability or {}).get("expires_at", ""))
                if (not capability or capability.get("owner_user_id") != hint["owner_user_id"]
                        or capability.get("group_id") != hint["group_id"]
                        or capability.get("consumed_at") or not expires or expires <= now
                        or capability.get("actor_type") not in {"head", "family"}
                        or esc.get("cycle_key") != capability.get("cycle_key")):
                    return False
                consumed = await conn.execute(
                    "UPDATE inactivity_capabilities SET consumed_at=%s WHERE id=%s AND consumed_at=''",
                    (now.isoformat(), capability["id"]))
                if consumed.rowcount != 1:
                    return False

                if capability["actor_type"] == "head":
                    if withdraw:
                        await conn.execute(
                            "UPDATE users SET inactivity_email_enabled=false WHERE id=%s",
                            (capability["owner_user_id"],))
                    await conn.execute(
                        "UPDATE inactivity_escalations SET acknowledged=true,stage='closed_head',"
                        "head_acknowledged_at=%s,next_action_at='',last_outcome='head_acknowledged',updated_at=%s "
                        "WHERE owner_user_id=%s AND group_id=%s AND cycle_key=%s",
                        (now.isoformat(), now.isoformat(), capability["owner_user_id"],
                         capability["group_id"], capability["cycle_key"]))
                    await conn.execute("UPDATE users SET last_active_at=%s WHERE id=%s",
                                       (now.isoformat(), capability["owner_user_id"]))
                else:
                    if withdraw:
                        await conn.execute(
                            "UPDATE family_members SET inactivity_email_consent=false,"
                            "inactivity_email_consent_at='' WHERE id=%s AND owner_user_id=%s AND group_id=%s",
                            (capability["recipient_ref"], capability["owner_user_id"], capability["group_id"]))
                        await conn.execute(
                            "DELETE FROM family_notifiers WHERE member_id=%s AND owner_user_id=%s AND group_id=%s",
                            (capability["recipient_ref"], capability["owner_user_id"], capability["group_id"]))
                    await conn.execute(
                        "UPDATE inactivity_escalations SET acknowledged=true,stage='closed_family',"
                        "family_acknowledged_at=%s,next_action_at='',last_outcome='family_acknowledged',updated_at=%s "
                        "WHERE owner_user_id=%s AND group_id=%s AND cycle_key=%s",
                        (now.isoformat(), now.isoformat(), capability["owner_user_id"],
                         capability["group_id"], capability["cycle_key"]))
                await conn.execute(
                    "UPDATE inactivity_capabilities SET consumed_at=%s WHERE owner_user_id=%s "
                    "AND group_id=%s AND cycle_key=%s AND consumed_at=''",
                    (now.isoformat(), capability["owner_user_id"], capability["group_id"],
                     capability["cycle_key"]))
                _ack_kind = capability["actor_type"] + ("_withdrawn" if withdraw else "")
                await log_audit(conn, capability["owner_user_id"], "acknowledge_inactivity",
                                capability["group_id"], _ack_kind,
                                actor_kind=audit.ACTOR_RECIPIENT,
                                metadata={"actor_type": _ack_kind})
                return True

    @strawberry.mutation
    async def set_member_share(self, info: strawberry.Info, id: str, share_pct: float) -> PersonType:
        """Set a member's share % (heir), enforcing the group/parcel ≤100% guard."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            m = await (await conn.execute(
                "SELECT * FROM family_members WHERE id=%s AND owner_user_id=%s", (id, uid))).fetchone()
            if not m:
                raise NotAuthorized("Not authorized for this member")
            v = {k: m.get(k, "") for k in (
                "name", "relation", "role", "group_id", "gender", "dob", "phone", "email", "bio", "photo",
                "father_id", "mother_id", "spouse_id", "kind", "parcel_id", "present_address",
                "guardian_name", "guardian_contact", "marital_status", "spouse_name",
                "spouse_contact", "spouse_status")}
            v.update(is_beneficiary=True, share_pct=share_pct, aadhaar="")
            return await _write_person(conn, uid, id, v, is_update=True)

    @strawberry.mutation
    async def update_beneficiary_status(self, info: strawberry.Info, id: str, status: str) -> BeneficiaryType:
        return await _do_update_member_status(info, id, status)

    @strawberry.mutation
    async def update_member_status(self, info: strawberry.Info, id: str, status: str) -> BeneficiaryType:
        return await _do_update_member_status(info, id, status)

    @strawberry.mutation
    async def delete_beneficiary(self, info: strawberry.Info, id: str) -> bool:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            cur = await conn.execute(
                "DELETE FROM beneficiaries WHERE id=%s AND (owner_user_id=%s OR parcel_id IN "
                "(SELECT id FROM parcels WHERE passbook_id IN "
                "(SELECT id FROM passbooks WHERE owner_user_id=%s)))", (id, uid, uid)
            )
            deleted = cur.rowcount > 0
            if deleted:
                await log_audit(conn, uid, "delete_beneficiary", id)
            return deleted

    @strawberry.mutation
    async def create_invitation(
        self,
        info: strawberry.Info,
        scope_type: str,
        scope_id: str,
        role: str,
        invitee_contact: str,
        expiry: str,
    ) -> InvitationType:
        uid = _uid_from_info(info)
        iid = new_id()
        token = str(uuid.uuid4())
        async with pool.connection() as conn:
            await _assert_owns_scope(conn, uid, scope_id)
            cur = await conn.execute(
                "INSERT INTO invitations (id, scope_type, scope_id, role, invitee_contact, token, expiry, status, created_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *",
                (iid, scope_type, scope_id, role, invitee_contact, token, expiry, "pending", datetime.utcnow().isoformat()),
            )
            row = await cur.fetchone()
            await log_audit(conn, uid, "send_invitation", iid, f"To {invitee_contact}")
            return to_type(InvitationType, row)

    @strawberry.mutation
    async def update_invitation_status(self, info: strawberry.Info, id: str, status: str) -> InvitationType:
        uid = _uid_from_info(info)
        if status not in {"pending", "accepted", "revoked", "expired"}:
            raise ValueError("Invalid invitation status")
        async with pool.connection() as conn:
            async with conn.transaction():
                row = await (await conn.execute(
                    "SELECT * FROM invitations WHERE id=%s AND " + _INVITATION_OWNED + " FOR UPDATE",
                    (id,) + (uid,) * 6)).fetchone()
                if not row:
                    raise NotAuthorized("Not authorized for this invitation")
                if status == "pending" and row["status"] != "pending":
                    raise ValueError("Send a new invitation to restore access")
                if status != "pending" and row["token"]:
                    await conn.execute("UPDATE family_members SET invite_token='' WHERE invite_token=%s", (row["token"],))
                    await conn.execute("UPDATE beneficiaries SET invite_token='' WHERE invite_token=%s", (row["token"],))
                out = await (await conn.execute(
                    "UPDATE invitations SET status=%s, token=CASE WHEN %s='pending' THEN token ELSE '' END WHERE id=%s RETURNING *",
                    (status, status, id))).fetchone()
                await log_audit(conn, uid, "update_invitation_status", id, f"Status -> {status}")
                return to_type(InvitationType, out)

    @strawberry.mutation
    async def delete_invitation(self, info: strawberry.Info, id: str) -> bool:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            async with conn.transaction():
                row = await (await conn.execute(
                    "DELETE FROM invitations WHERE id=%s AND " + _INVITATION_OWNED + " RETURNING token",
                    (id,) + (uid,) * 6)).fetchone()
                if row:
                    if row["token"]:
                        await conn.execute("UPDATE family_members SET invite_token='' WHERE invite_token=%s", (row["token"],))
                        await conn.execute("UPDATE beneficiaries SET invite_token='' WHERE invite_token=%s", (row["token"],))
                    await log_audit(conn, uid, "delete_invitation", id)
                return row is not None

    @strawberry.mutation
    async def create_registered_document(self, info: strawberry.Info, file_ref: str, payload: str) -> RegisteredDocumentType:
        """Create a registered document from the extracted (possibly edited) JSON
        payload; its `parties` become document_parties rows."""
        uid = _uid_from_info(info)
        did = new_id()
        now = datetime.utcnow().isoformat()
        try:
            data = json.loads(payload) if payload else {}
        except Exception:
            data = {}
        b = data.get("boundaries") or {}

        def _n(k):
            try:
                return float(data.get(k) or 0)
            except Exception:
                return 0.0

        def _s(k):
            return str(data.get(k) or "")

        async with pool.connection() as conn:
            # All-or-nothing: the offline outbox drives this mutation through the
            # idempotency layer, whose release-claim-on-error contract is only
            # sound when a failed attempt leaves nothing behind. On the
            # autocommit pool each statement lands durably on its own, so a
            # mid-flight failure would strand the document without its parties —
            # psycopg wraps the block in BEGIN/COMMIT instead. First (and so far
            # only) mutation to need this.
            async with conn.transaction():
                await conn.execute(
                    "INSERT INTO registered_documents (id, owner_user_id, doc_type, document_no, reg_year, book_no, sro, "
                    "registration_date, execution_date, consideration, stamp_duty, transfer_duty, registration_fee, "
                    "user_charges, total_fee, village, mandal, district, survey_no, plot_no, extent, classification, "
                    "boundary_north, boundary_south, boundary_east, boundary_west, prior_document, gpa_document, "
                    "scanning_id, file_ref, summary, caveats, headline, key_points, reading, created_at) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    (did, uid, _s("doc_type"), _s("document_no"), _s("reg_year"), _s("book_no"), _s("sro"),
                     _s("registration_date"), _s("execution_date"), _n("consideration"), _n("stamp_duty"), _n("transfer_duty"),
                     _n("registration_fee"), _n("user_charges"), _n("total_fee"), _s("village"), _s("mandal"), _s("district"),
                     _s("survey_no"), _s("plot_no"), _s("extent"), _s("classification"),
                     str(b.get("north") or ""), str(b.get("south") or ""), str(b.get("east") or ""), str(b.get("west") or ""),
                     _s("prior_document"), _s("gpa_document"), _s("scanning_id"), file_ref,
                     # The reading travels with the document it describes.
                     _s("summary"), json.dumps([str(c) for c in (data.get("caveats") or []) if str(c).strip()]),
                     _s("headline"),
                     json.dumps([str(k) for k in (data.get("key_points") or []) if str(k).strip()]),
                     payload,
                     now),
                )
                for p in (data.get("parties") or []):
                    await conn.execute(
                        "INSERT INTO document_parties (id, document_id, role, name, parentage, age, address, is_gpa, created_at) "
                        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                        (new_id(), did, str(p.get("role") or "seller"), str(p.get("name") or ""), str(p.get("parentage") or ""),
                         str(p.get("age") or ""), str(p.get("address") or ""), bool(p.get("is_gpa")), now),
                    )
                await log_audit(conn, uid, "create_registered_document", did, _s("document_no"))
            cur = await conn.execute("SELECT * FROM registered_documents WHERE id=%s", (did,))
            return to_type(RegisteredDocumentType, await cur.fetchone())

    @strawberry.mutation
    async def create_parcel_from_document(self, info: strawberry.Info, document_id: str, passbook_id: str) -> ParcelType:
        """Create a parcel from a registered document's property, under a passbook
        the caller owns, tagged with source = the document."""
        uid = _uid_from_info(info)
        now = datetime.utcnow()
        async with pool.connection() as conn:
            # The parcel, its ownership seed and the deed's pointer back at it
            # are one act.
            async with conn.transaction():
                dcur = await conn.execute("SELECT * FROM registered_documents WHERE id=%s AND owner_user_id=%s", (document_id, uid))
                doc = await dcur.fetchone()
                if not doc:
                    raise NotAuthorized("Not authorized for this document")
                await _assert_owns_passbook(conn, uid, passbook_id)
                pid = new_id()
                extent_sqyd = _area_sq_yd(doc["extent"])
                # Registered-deed extents are recorded in sq. yards. Store canonical
                # acres (1 acre = 4840 sq.yd) so the Extent sort and SUM(extent)
                # rollups stay in one unit; `unit` keeps 'sqyd' as provenance.
                extent = round(extent_sqyd / 4840.0, 6)
                cl = (doc["classification"] or "").lower()
                cls = "non-agri" if ("house" in cl or "commerc" in cl or "site" in cl) else "agri"
                cur = await conn.execute(
                    "INSERT INTO parcels (id, passbook_id, survey_no, subdivision, extent, unit, classification, acquisition_source, geo_point, parent_parcel_id, source, created_at) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
                    (pid, passbook_id, str(doc["survey_no"] or ""), str(doc["plot_no"] or ""), extent, "sqyd", cls, "sale", "", "", f"document:{document_id}", now.isoformat()),
                )
                row = await cur.fetchone()
                pbcur = await conn.execute("SELECT owner_name FROM passbooks WHERE id=%s", (passbook_id,))
                pbrow = await pbcur.fetchone()
                owner = (pbrow["owner_name"] if pbrow else "") or ""
                await conn.execute(
                    "INSERT INTO parcel_owners (id, parcel_id, owner_name, acquisition_source, extent, mutation_type, mutation_date, is_current, created_at) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    (new_id(), pid, owner, "sale", extent, "acquisition", now.date().isoformat(), True, now.isoformat()),
                )
                await conn.execute("UPDATE registered_documents SET parcel_id=%s, passbook_id=%s WHERE id=%s", (pid, passbook_id, document_id))
                await log_audit(conn, uid, "parcel_from_document", pid, document_id)
                return to_type(ParcelType, row)

    @strawberry.mutation
    async def link_document_passbook(self, info: strawberry.Info, document_id: str, passbook_id: str) -> RegisteredDocumentType:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            await _assert_owns_passbook(conn, uid, passbook_id)
            cur = await conn.execute(
                "UPDATE registered_documents SET passbook_id=%s WHERE id=%s AND owner_user_id=%s RETURNING *",
                (passbook_id, document_id, uid))
            row = await cur.fetchone()
            if not row:
                raise NotAuthorized("Not authorized for this document")
            await log_audit(conn, uid, "link_document_passbook", document_id, passbook_id)
            return to_type(RegisteredDocumentType, row)

    @strawberry.mutation
    async def link_document_parcel(self, info: strawberry.Info, document_id: str, parcel_id: str) -> RegisteredDocumentType:
        """Attach a deed to the parcel it describes.

        The parcel counterpart of link_document_property. Linking to the
        PASSBOOK was the only option, which put the deed on the khata rather
        than on the piece of land it actually covers — so a parcel screen could
        never show the deed it was made from.
        """
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            await _assert_owns_parcel(conn, uid, parcel_id)
            row = await (await conn.execute(
                "SELECT survey_no, passbook_id FROM parcels WHERE id=%s", (parcel_id,))).fetchone()
            cur = await conn.execute(
                "UPDATE registered_documents SET parcel_id=%s, passbook_id=%s WHERE id=%s AND owner_user_id=%s "
                "RETURNING *",
                (parcel_id, row["passbook_id"] if row else "", document_id, uid))
            doc = await cur.fetchone()
            if not doc:
                raise NotAuthorized("Not authorized for this document")
            await log_audit(conn, uid, "link_document_parcel", document_id,
                            _named("", doc["doc_type"], row["survey_no"] if row else ""))
            return to_type(RegisteredDocumentType, doc)

    @strawberry.mutation
    async def link_document_property(self, info: strawberry.Info, document_id: str, property_id: str) -> RegisteredDocumentType:
        """Attach a deed to the property it describes.

        The passbook counterpart existed; the property one did not, so a plot
        created by scanning a deed had no way to keep the deed. The property
        showed "No documents attached yet" about the very document it was made
        from — and with the deed unlinked, its AI summary was unreachable.
        """
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            own = await (await conn.execute(
                "SELECT label FROM properties WHERE id=%s AND owner_user_id=%s", (property_id, uid))).fetchone()
            if not own:
                raise NotAuthorized("Not authorized for this property")
            cur = await conn.execute(
                "UPDATE registered_documents SET property_id=%s WHERE id=%s AND owner_user_id=%s RETURNING *",
                (property_id, document_id, uid))
            row = await cur.fetchone()
            if not row:
                raise NotAuthorized("Not authorized for this document")
            await log_audit(conn, uid, "link_document_property", document_id,
                            _named("", row["doc_type"], own["label"]))
            return to_type(RegisteredDocumentType, row)

    @strawberry.mutation
    async def create_property_from_document(self, info: strawberry.Info, document_id: str) -> Optional[PropertyType]:
        """Create a plot / flat / house from a registered deed.

        The counterpart of create_parcel_from_document, which only ever produced
        farmland under a passbook. A plot has no passbook and no survey number —
        it is bought by deed — so the Plots tab had no way in at all except
        typing everything by hand.

        Deed extents are written in square yards, which is already the unit a
        property records land area in, so no conversion is needed here (unlike
        the parcel path, which must normalise to acres).
        """
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            # The property and the deed's pointer back at it are one act.
            async with conn.transaction():
                doc = await (await conn.execute(
                    "SELECT * FROM registered_documents WHERE id=%s AND owner_user_id=%s",
                    (document_id, uid))).fetchone()
                if not doc:
                    raise NotAuthorized("Not authorized for this document")
                area = _area_sq_yd(doc["extent"])
                cl = (doc["classification"] or "").lower()
                kind = "flat" if "flat" in cl or "apartment" in cl else (
                    "house" if "house" in cl or "residen" in cl else (
                        "commercial" if "commerc" in cl or "shop" in cl else "open_plot"))
                # A label the owner will recognise in a list: plot and locality, not
                # a document number.
                label = _named("", f"Plot {doc['plot_no']}" if doc["plot_no"] else "", doc["village"]) or "Property"
                pid = new_id()
                now = datetime.utcnow().isoformat()
                cur = await conn.execute(
                    "INSERT INTO properties (id, owner_user_id, type, label, address, locality, city, district, "
                    "land_area, land_unit, acquisition_mode, holding_status, purchase_price, purchase_date, "
                    "created_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
                    (pid, uid, kind, label, str(doc["village"] or ""), str(doc["village"] or ""),
                     str(doc["mandal"] or ""), str(doc["district"] or ""), area, "Sq.yd", "purchase", "owned",
                     float(doc["consideration"] or 0), str(doc["registration_date"] or ""), now))
                row = await cur.fetchone()
                # Point the deed at what it created, so the two stay linked.
                await conn.execute("UPDATE registered_documents SET property_id=%s WHERE id=%s", (pid, document_id))
                await log_audit(conn, uid, "create_property", pid, _named("", kind, label))
                return to_type(PropertyType, row)

    @strawberry.mutation
    async def add_parcel_photo(
        self, info: strawberry.Info, parcel_id: str, file_ref: str,
        category: str = "general", caption: str = "",
        latitude: Optional[float] = None, longitude: Optional[float] = None,
        heading: Optional[float] = None, captured_at: str = "",
    ) -> Optional[ParcelPhotoType]:
        """Attach a photograph to a parcel (CL-561..563).

        Ownership is checked through the parcel's passbook — the same path
        delete_parcel uses — so a photo can never be hung off someone else's
        land.

        A photo is NEVER made the cover automatically. The first-photo-wins rule
        this used to have put scanned ROR reports and an Aadhaar card on the
        Properties rows, where a page of small print renders as a blank white
        tile and is strictly worse than the land icon it displaced. The app
        cannot tell a photograph of a field from a photograph of a document, so
        the choice belongs to the person who can — via set_cover_photo.
        """
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            owns = await (await conn.execute(
                "SELECT 1 FROM parcels WHERE id=%s AND passbook_id IN "
                "(SELECT id FROM passbooks WHERE owner_user_id=%s)", (parcel_id, uid))).fetchone()
            if not owns:
                raise NotAuthorized("Not authorized for this parcel")
            pid = new_id()
            now = datetime.utcnow().isoformat()
            cur = await conn.execute(
                "INSERT INTO parcel_photos (id, parcel_id, owner_user_id, file_ref, category, caption, "
                "latitude, longitude, heading, captured_at, captured_by, is_cover, created_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
                (pid, parcel_id, uid, file_ref, (category or "general").strip(), caption.strip(),
                 latitude, longitude, heading, captured_at or now, uid, False, now))
            row = await cur.fetchone()
            await log_audit(conn, uid, "add_parcel_photo", parcel_id, _named("", category, caption))
            return to_type(ParcelPhotoType, row)

    @strawberry.mutation
    async def update_parcel_photo(
        self, info: strawberry.Info, id: str,
        category: Optional[str] = None, caption: Optional[str] = None,
    ) -> Optional[ParcelPhotoType]:
        """Edit a photo's caption or category. Both are optional and only the
        arguments actually supplied are written — passing null must not blank a
        field the caller never mentioned."""
        uid = _uid_from_info(info)
        sets, vals = [], []
        if category is not None:
            sets.append("category=%s"); vals.append((category or "general").strip())
        if caption is not None:
            sets.append("caption=%s"); vals.append(caption.strip())
        if not sets:
            sets.append("caption=caption")
        async with pool.connection() as conn:
            cur = await conn.execute(
                f"UPDATE parcel_photos SET {', '.join(sets)} WHERE id=%s AND owner_user_id=%s RETURNING *",
                (*vals, id, uid))
            row = await cur.fetchone()
            if not row:
                raise NotAuthorized("Not authorized for this photo")
            await log_audit(conn, uid, "update_parcel_photo", id, _named("", row["category"], row["caption"]))
            return to_type(ParcelPhotoType, row)

    @strawberry.mutation
    async def set_cover_photo(self, info: strawberry.Info, id: str) -> bool:
        """Make one photo the parcel's cover. Clearing the old cover first is
        not optional — a partial unique index rejects a second one."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            # Clear-then-set: stopping in between leaves the parcel with no
            # cover.
            async with conn.transaction():
                row = await (await conn.execute(
                    "SELECT parcel_id FROM parcel_photos WHERE id=%s AND owner_user_id=%s", (id, uid))).fetchone()
                if not row:
                    raise NotAuthorized("Not authorized for this photo")
                await conn.execute(
                    "UPDATE parcel_photos SET is_cover=FALSE WHERE parcel_id=%s", (row["parcel_id"],))
                await conn.execute("UPDATE parcel_photos SET is_cover=TRUE WHERE id=%s", (id,))
                await log_audit(conn, uid, "set_cover_photo", row["parcel_id"], "")
                return True

    @strawberry.mutation
    async def delete_parcel_photo(self, info: strawberry.Info, id: str) -> bool:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            doomed = await (await conn.execute(
                "SELECT parcel_id, category, caption, is_cover FROM parcel_photos "
                "WHERE id=%s AND owner_user_id=%s", (id, uid))).fetchone()
            if not doomed:
                return False
            await conn.execute("DELETE FROM parcel_photos WHERE id=%s", (id,))
            # Deleting the cover leaves the parcel with none, and the row falls
            # back to its land icon. Promoting a survivor would put a picture
            # the user never chose back on their list — the same mistake as
            # auto-covering the first photo.
            await log_audit(conn, uid, "delete_parcel_photo", doomed["parcel_id"],
                            _named("", doomed["category"], doomed["caption"]))
            return True

    @strawberry.mutation
    async def add_property_photo(
        self, info: strawberry.Info, property_id: str, file_ref: str,
        category: str = "general", caption: str = "",
        latitude: Optional[float] = None, longitude: Optional[float] = None,
        heading: Optional[float] = None, captured_at: str = "",
    ) -> Optional[PropertyPhotoType]:
        """add_parcel_photo for the Property entity. Ownership is direct
        (properties.owner_user_id) — no passbook join to go through. The
        never-auto-cover rule carries over unchanged; the choice of what
        fronts a property belongs to its owner, via set_property_cover_photo.
        """
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            owns = await (await conn.execute(
                "SELECT 1 FROM properties WHERE id=%s AND owner_user_id=%s",
                (property_id, uid))).fetchone()
            if not owns:
                raise NotAuthorized("Not authorized for this property")
            pid = new_id()
            now = datetime.utcnow().isoformat()
            cur = await conn.execute(
                "INSERT INTO property_photos (id, property_id, owner_user_id, file_ref, category, caption, "
                "latitude, longitude, heading, captured_at, captured_by, is_cover, created_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
                (pid, property_id, uid, file_ref, (category or "general").strip(), caption.strip(),
                 latitude, longitude, heading, captured_at or now, uid, False, now))
            row = await cur.fetchone()
            await log_audit(conn, uid, "add_property_photo", property_id, _named("", category, caption))
            return to_type(PropertyPhotoType, row)

    @strawberry.mutation
    async def update_property_photo(
        self, info: strawberry.Info, id: str,
        category: Optional[str] = None, caption: Optional[str] = None,
    ) -> Optional[PropertyPhotoType]:
        """Edit a property photo's caption or category — only the arguments
        actually supplied are written, same contract as update_parcel_photo."""
        uid = _uid_from_info(info)
        sets, vals = [], []
        if category is not None:
            sets.append("category=%s"); vals.append((category or "general").strip())
        if caption is not None:
            sets.append("caption=%s"); vals.append(caption.strip())
        if not sets:
            sets.append("caption=caption")
        async with pool.connection() as conn:
            cur = await conn.execute(
                f"UPDATE property_photos SET {', '.join(sets)} WHERE id=%s AND owner_user_id=%s RETURNING *",
                (*vals, id, uid))
            row = await cur.fetchone()
            if not row:
                raise NotAuthorized("Not authorized for this photo")
            await log_audit(conn, uid, "update_property_photo", id, _named("", row["category"], row["caption"]))
            return to_type(PropertyPhotoType, row)

    @strawberry.mutation
    async def set_property_cover_photo(self, info: strawberry.Info, id: str) -> bool:
        """Make one photo the property's cover. Clear-then-set, because the
        partial unique index rejects a second cover."""
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            # Clear-then-set: stopping in between leaves the property with no
            # cover.
            async with conn.transaction():
                row = await (await conn.execute(
                    "SELECT property_id FROM property_photos WHERE id=%s AND owner_user_id=%s", (id, uid))).fetchone()
                if not row:
                    raise NotAuthorized("Not authorized for this photo")
                await conn.execute(
                    "UPDATE property_photos SET is_cover=FALSE WHERE property_id=%s", (row["property_id"],))
                await conn.execute("UPDATE property_photos SET is_cover=TRUE WHERE id=%s", (id,))
                await log_audit(conn, uid, "set_property_cover_photo", row["property_id"], "")
                return True

    @strawberry.mutation
    async def delete_property_photo(self, info: strawberry.Info, id: str) -> bool:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            doomed = await (await conn.execute(
                "SELECT property_id, category, caption, is_cover FROM property_photos "
                "WHERE id=%s AND owner_user_id=%s", (id, uid))).fetchone()
            if not doomed:
                return False
            await conn.execute("DELETE FROM property_photos WHERE id=%s", (id,))
            # Same rule as parcels: no survivor promotion — a cover the user
            # never chose is worse than no cover.
            await log_audit(conn, uid, "delete_property_photo", doomed["property_id"],
                            _named("", doomed["category"], doomed["caption"]))
            return True

    @strawberry.mutation
    async def delete_registered_document(self, info: strawberry.Info, id: str) -> bool:
        uid = _uid_from_info(info)
        async with pool.connection() as conn:
            # The deed's parties go with the deed.
            async with conn.transaction():
                own = await (await conn.execute(
                    "SELECT doc_type, document_no, village, survey_no FROM registered_documents "
                    "WHERE id=%s AND owner_user_id=%s", (id, uid))).fetchone()
                if not own:
                    return False
                await conn.execute("DELETE FROM document_parties WHERE document_id=%s", (id,))
                await conn.execute("DELETE FROM registered_documents WHERE id=%s", (id,))
                await log_audit(conn, uid, "delete_registered_document", id, _named(
                    "", own["doc_type"], own["document_no"], own["village"], own["survey_no"]))
                return True

    @strawberry.mutation
    async def create_user(
        self,
        mobile: str,
        email: str,
        name: str,
        language: str,
    ) -> UserType:
        uid = new_id()
        async with pool.connection() as conn:
            cur = await conn.execute(
                "INSERT INTO users (id, mobile, email, name, language, kyc_ref_masked, roles, notification_prefs) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING *",
                (uid, mobile, email, name, language, "", "owner", "email,sms"),
            )
            row = await cur.fetchone()
            await log_audit(conn, "system", "create_user", uid, f"User {name}")
            return to_type(UserType, row)

    @strawberry.mutation
    async def update_me(self, info: strawberry.Info, name: str, email: str = "") -> UserType:
        """Change your own display name and email.

        There was no way to do this. `me` auto-provisions a row with `name` set
        to the user id, so anybody who had not been edited directly in the
        database was greeted by their own login string — and the screen called
        "You" could not change a single thing about you.

        An empty value LEAVES the stored one rather than blanking it, matching
        the rule used by every other update here: a form that submits what it
        did not ask about is how fields get silently erased.
        """
        uid = _uid_from_info(info)
        clean_name = (name or "").strip()
        clean_email = (email or "").strip()
        async with pool.connection() as conn:
            async with conn.transaction():
                await conn.execute(
                    "INSERT INTO users (id, name, email) VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING",
                    (uid, uid, ""),
                )
                cur = await conn.execute(
                    "UPDATE users SET name = COALESCE(NULLIF(%s, ''), name), "
                    "email = COALESCE(NULLIF(%s, ''), email) WHERE id=%s RETURNING *",
                    (clean_name, clean_email, uid),
                )
                row = await cur.fetchone()
                await log_audit(conn, uid, "update_profile", uid, "name or email changed")
                return to_type(UserType, row)

    async def update_profile(
        self,
        info: strawberry.Info,
        language: str,
        districts_of_interest: str,
        notification_prefs: str,
        kyc_ref: str,
        mfa_enabled: bool,
        address: str = "",
    ) -> UserType:
        """Update the signed-in user's profile & preferences. The Aadhaar is
        kept as a masked token for display plus ciphertext for retrieval; an
        empty kyc_ref leaves whatever is stored untouched."""
        uid = _uid_from_info(info)
        masked = _mask_aadhaar(kyc_ref)
        kyc_enc = await encrypt_aadhaar(kyc_ref, uid, "account", uid) if (kyc_ref or "").strip() else ""
        async with pool.connection() as conn:
            async with conn.transaction():
                await conn.execute(
                    "INSERT INTO users (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING",
                    (uid, uid),
                )
                if kyc_enc:
                    cur = await conn.execute(
                        "UPDATE users SET language=%s, districts_of_interest=%s, notification_prefs=%s, "
                        "kyc_ref_masked=%s, kyc_ref_enc=%s, mfa_enabled=%s, address=%s WHERE id=%s RETURNING *",
                        (language, districts_of_interest, notification_prefs, masked, kyc_enc,
                         mfa_enabled, address, uid),
                    )
                else:
                    # No Aadhaar supplied — leave whatever is stored alone rather
                    # than blanking it (same rule as member updates).
                    cur = await conn.execute(
                        "UPDATE users SET language=%s, districts_of_interest=%s, notification_prefs=%s, "
                        "mfa_enabled=%s, address=%s WHERE id=%s RETURNING *",
                        (language, districts_of_interest, notification_prefs, mfa_enabled, address, uid),
                    )
                row = await cur.fetchone()
                await log_audit(conn, uid, "update_profile", uid, "profile updated")
                return to_type(UserType, row)


# ── DB Init ───────────────────────────────────────────────────────────

async def _load_reference_data(conn) -> None:
    """(Re)load the real AP-IGRS reference data from the bundled CSVs. Reference
    data is static, so DELETE+INSERT on every startup — this also replaces any
    fake seed rows an earlier build wrote (the scaffold shipped placeholder
    districts/SROs)."""
    # States (36: all Indian states + UTs). Only Andhra Pradesh ('AP') has
    # district-level data in the current IGRS feed; the rest seed the hierarchy
    # so other states' data can be pulled later.
    states = _read_csv("states.csv")
    if states:
        await conn.execute("DELETE FROM states")
        async with conn.cursor() as ins:
            await ins.executemany(
                "INSERT INTO states (id, name, code) VALUES (%s, %s, %s)",
                [(r["STATE_CODE"], r["STATE_NAME"].strip(), r["STATE_CODE"]) for r in states],
            )
    # Districts (28): DISTRICT_CODE, DR_CODE, DISTRICT_NAME. All belong to
    # Andhra Pradesh (state_id 'AP').
    districts = _read_csv("districts.csv")
    if districts:
        await conn.execute("DELETE FROM districts")
        async with conn.cursor() as ins:
            await ins.executemany(
                "INSERT INTO districts (id, name, code, state_id) VALUES (%s, %s, %s, %s)",
                [(r["DISTRICT_CODE"], r["DISTRICT_NAME"].strip(), r["DR_CODE"], "AP") for r in districts],
            )
    # Mandals (686): DISTRICT_CODE, MANDAL_CODE, MANDAL_NAME
    mandals = _read_csv("mandals.csv")
    if mandals:
        await conn.execute("DELETE FROM mandals")
        async with conn.cursor() as ins:
            await ins.executemany(
                "INSERT INTO mandals (id, name, district_id) VALUES (%s, %s, %s)",
                [(f"{r['DISTRICT_CODE']}-{r['MANDAL_CODE']}", r["MANDAL_NAME"].strip(), r["DISTRICT_CODE"]) for r in mandals],
            )
    # SRO offices (297): SRO_CODE, SRO_NAME
    sros = _read_csv("sro_offices.csv")
    if sros:
        await conn.execute("DELETE FROM sro_offices")
        async with conn.cursor() as ins:
            await ins.executemany(
                "INSERT INTO sro_offices (id, code, name, dr_zone, district, mandal) VALUES (%s, %s, %s, %s, %s, %s)",
                [(r["SRO_CODE"], r["SRO_CODE"], r["SRO_NAME"].strip(), "", "", "") for r in sros],
            )
    # Deed types (115, bilingual EN/Telugu): REGISTRATION_TYPE, NATURE_OF_DOCUMENT
    deeds = _read_csv("document_types.csv")
    if deeds:
        await conn.execute("DELETE FROM deed_types")
        rows = []
        for i, r in enumerate(deeds):
            rt_en, rt_te = _split_bilingual(r["REGISTRATION_TYPE"])
            nd_en, nd_te = _split_bilingual(r["NATURE_OF_DOCUMENT"])
            rows.append((f"dt{i:03d}", rt_en, rt_te, nd_en, nd_te))
        async with conn.cursor() as ins:
            await ins.executemany(
                "INSERT INTO deed_types (id, reg_type_en, reg_type_te, nature_en, nature_te) "
                "VALUES (%s, %s, %s, %s, %s)",
                rows,
            )
    # Fee schedule (115): derive per-deed rates from the sample consideration so
    # we can apply them to any user-entered consideration / market value.
    fees = _read_csv("fee_schedule.csv")
    if fees:
        await conn.execute("DELETE FROM fee_schedule")
        rows = []
        for i, r in enumerate(fees):
            rt_en, _ = _split_bilingual(r["REGISTRATION_TYPE"])
            nd_en, _ = _split_bilingual(r["NATURE_OF_DOCUMENT"])
            base = _num(r.get("SAMPLE_CONSIDERATION")) or 1.0
            sd, td = _num(r.get("STAMP_DUTY")), _num(r.get("TRANSFER_DUTY"))
            rf, uc = _num(r.get("REGISTRATION_FEE")), _num(r.get("USER_CHARGES"))
            rows.append((
                f"fs{i:03d}", r.get("TMAJ_CODE", ""), r.get("TMIN_CODE", ""), rt_en, nd_en,
                base, sd, td, rf, uc, sd / base, td / base, rf / base, uc / base,
            ))
        async with conn.cursor() as ins:
            await ins.executemany(
                "INSERT INTO fee_schedule (id, tmaj_code, tmin_code, reg_type_en, nature_en, "
                "sample_consideration, stamp_duty, transfer_duty, registration_fee, user_charges, "
                "stamp_rate, transfer_rate, reg_rate, user_rate) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                rows,
            )


async def ensure_property_photos_schema(conn) -> None:
    """property_photos: parcel_photos' shape for the Property entity —
    evidence-first columns, one database-enforced cover per property.
    Factored out of init_db so tests can ensure exactly this table."""
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS property_photos (
            id TEXT PRIMARY KEY,
            property_id TEXT NOT NULL,
            owner_user_id TEXT NOT NULL,
            file_ref TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT 'general',
            caption TEXT NOT NULL DEFAULT '',
            latitude DOUBLE PRECISION,
            longitude DOUBLE PRECISION,
            heading DOUBLE PRECISION,
            captured_at TEXT NOT NULL DEFAULT '',
            captured_by TEXT NOT NULL DEFAULT '',
            is_cover BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TEXT NOT NULL DEFAULT ''
        )
    """)
    await conn.execute(
        "CREATE INDEX IF NOT EXISTS property_photos_property_idx ON property_photos (property_id)")
    await conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS property_photos_one_cover_idx "
        "ON property_photos (property_id) WHERE is_cover")


async def _backfill_vault_layer_one(conn) -> None:
    """Make every filed paper a `documents` row, once.

    Two tables grew up meaning "document": `documents` (a file) and
    `registered_documents` (an AI reading of a file). The apps each listed a
    different one, so a file uploaded on the web was invisible on the phone and
    a deed scanned on the phone was invisible in the web's file list. From here
    on `documents` is the vault and a reading hangs off it.

    Only ever INSERTs rows and fills EMPTY columns — never updates a non-empty
    field, never deletes. Safe to re-run, which it is, on every boot.
    """
    # 1. A reading with no file row of its own gets one, pointing back at it.
    #    Matched on file_ref where there is one; a reading with no stored file
    #    still earns a row, because "details only, no file" is a real state the
    #    phone already renders.
    await conn.execute(
        "INSERT INTO documents (id, parcel_id, passbook_id, property_id, owner_user_id, "
        "                       doc_type, file_ref, doc_no, sro_code, reg_year, version, "
        "                       source, tags, created_at, name, reading_id) "
        "SELECT gen_random_uuid()::text, rd.parcel_id, rd.passbook_id, rd.property_id, "
        "       rd.owner_user_id, "
        "       CASE WHEN rd.doc_type = '' THEN 'other' ELSE rd.doc_type END, "
        "       rd.file_ref, rd.document_no, rd.sro, rd.reg_year, 1, 'scan', '', "
        "       rd.created_at, "
        # The name a person would recognise: "Sale Deed · 6337 / 2024", falling
        # back through place, then the bare kind. Never a UUID.
        "       NULLIF(trim(both ' ·' from concat_ws(' · ', NULLIF(rd.doc_type, ''), "
        "              NULLIF(concat_ws(' / ', NULLIF(rd.document_no, ''), NULLIF(rd.reg_year, '')), ''), "
        "              NULLIF(rd.village, ''))), ''), "
        "       rd.id "
        "  FROM registered_documents rd "
        " WHERE NOT EXISTS (SELECT 1 FROM documents d WHERE d.reading_id = rd.id) "
        "   AND NOT EXISTS (SELECT 1 FROM documents d "
        "                    WHERE d.file_ref <> '' AND d.file_ref = rd.file_ref)")

    # 2. A file row whose reading already exists (same storage node) learns to
    #    point at it, so the two layers are joined for rows that predate this.
    await conn.execute(
        "UPDATE documents d SET reading_id = rd.id "
        "  FROM registered_documents rd "
        " WHERE d.reading_id = '' AND d.file_ref <> '' AND d.file_ref = rd.file_ref")

    # 3. Size and mime come from the storage node that already knows them. The
    #    storage tables live in the same database but are the gateway's — read
    #    only, and skipped entirely when they are not there (local API-only dev).
    try:
        await conn.execute(
            "UPDATE documents d "
            "   SET size_bytes = COALESCE(n.size_bytes, 0), "
            "       mime_type  = COALESCE(n.mime_type, ''), "
            "       name       = CASE WHEN d.name = '' THEN COALESCE(n.name, '') ELSE d.name END "
            "  FROM storage_nodes n "
            " WHERE n.id::text = d.file_ref AND d.size_bytes = 0")
    except Exception:
        # No storage tables here. Names still resolve live in the client, and
        # the next upload stamps its own size — a missing backfill is a cosmetic
        # gap, never a reason to abort every other migration on this boot.
        pass

    # 4. Anything still nameless is named for what it is, so no row in the vault
    #    ever renders blank.
    await conn.execute(
        "UPDATE documents SET name = CASE WHEN doc_type = '' OR doc_type = 'other' "
        "                                 THEN 'Document' ELSE initcap(replace(doc_type, '_', ' ')) END "
        " WHERE name = ''")


async def init_db() -> None:
    aadhaar_security.validate_configuration()
    async with pool.connection() as conn:
        # Serialize concurrent worker startups: the pod runs `uvicorn --workers N`
        # and every worker runs init_db on boot. Pool is autocommit, so hold a
        # SESSION-level advisory lock across ALL of init_db — otherwise workers
        # race on DDL for a newly-added table (pg_type_typname_nsp_index) or on
        # the reference-data PKs (e.g. mandals_pkey). Released at the end of init_db.
        await conn.execute("SELECT pg_advisory_lock(918273645)")
        await aadhaar_security.ensure_schema(conn)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                mobile TEXT NOT NULL DEFAULT '',
                email TEXT NOT NULL DEFAULT '',
                name TEXT NOT NULL DEFAULT '',
                language TEXT NOT NULL DEFAULT 'en',
                kyc_ref_masked TEXT NOT NULL DEFAULT '',
                roles TEXT NOT NULL DEFAULT 'owner',
                notification_prefs TEXT NOT NULL DEFAULT 'email,sms',
                districts_of_interest TEXT NOT NULL DEFAULT '',
                mfa_enabled BOOLEAN NOT NULL DEFAULT false
            )
        """)
        # Profile columns for the identity/onboarding feature (the users table
        # predates them on an already-provisioned DB, so add them idempotently).
        await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS districts_of_interest TEXT NOT NULL DEFAULT ''")
        await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false")
        await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT ''")
        # Inactivity dead-man's-switch: last time this user was active (Phase 3).
        await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TEXT NOT NULL DEFAULT ''")
        await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS inactivity_email_enabled BOOLEAN NOT NULL DEFAULT true")
        # Start every existing user's inactivity clock at deploy time — otherwise an
        # empty baseline reads as "inactive forever" and the first check escalates
        # every family at once. New activity updates it via the `me` heartbeat.
        await conn.execute("UPDATE users SET last_active_at=%s WHERE last_active_at=''",
                           (datetime.utcnow().isoformat(),))

        # Notification send log — every email/SMS/WhatsApp send is recorded here
        # (the default `stub` provider records without delivering, so the flow is
        # testable end-to-end without external accounts). See notify.py.
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS notification_log (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL DEFAULT '',
                channel TEXT NOT NULL DEFAULT '',
                recipient TEXT NOT NULL DEFAULT '',
                subject TEXT NOT NULL DEFAULT '',
                body TEXT NOT NULL DEFAULT '',
                provider TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT '',
                error TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT ''
            )
        """)
        await conn.execute("ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS owner_user_id TEXT NOT NULL DEFAULT ''")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_notiflog_created ON notification_log(created_at)")

        # Inactivity dead-man's-switch (Phase 3). `family_notifiers` = the ordered
        # escalation list per group (empty → everyone, at once). `inactivity_escalations`
        # = the live state machine per (owner, group).
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS family_notifiers (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL DEFAULT '',
                group_id TEXT NOT NULL DEFAULT '',
                member_id TEXT NOT NULL DEFAULT '',
                priority INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT ''
            )
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_notifiers_group ON family_notifiers(group_id)")
        await conn.execute("ALTER TABLE family_notifiers ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'email'")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS inactivity_escalations (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL DEFAULT '',
                group_id TEXT NOT NULL DEFAULT '',
                stage TEXT NOT NULL DEFAULT '',
                current_priority INTEGER NOT NULL DEFAULT 0,
                last_notified_at TEXT NOT NULL DEFAULT '',
                acknowledged BOOLEAN NOT NULL DEFAULT false,
                ack_token TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT ''
            )
        """)
        for _column in (
            "cycle_key TEXT NOT NULL DEFAULT ''",
            "threshold_at TEXT NOT NULL DEFAULT ''",
            "next_action_at TEXT NOT NULL DEFAULT ''",
            "last_outcome TEXT NOT NULL DEFAULT ''",
            "head_acknowledged_at TEXT NOT NULL DEFAULT ''",
            "family_acknowledged_at TEXT NOT NULL DEFAULT ''",
        ):
            await conn.execute(f"ALTER TABLE inactivity_escalations ADD COLUMN IF NOT EXISTS {_column}")
        await conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_escalation_owner_group ON inactivity_escalations(owner_user_id, group_id)")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS inactivity_capabilities (
                id TEXT PRIMARY KEY,
                token_hash TEXT NOT NULL UNIQUE,
                owner_user_id TEXT NOT NULL DEFAULT '',
                group_id TEXT NOT NULL DEFAULT '',
                cycle_key TEXT NOT NULL DEFAULT '',
                stage TEXT NOT NULL DEFAULT '',
                actor_type TEXT NOT NULL DEFAULT '',
                recipient_ref TEXT NOT NULL DEFAULT '',
                expires_at TEXT NOT NULL DEFAULT '',
                consumed_at TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT ''
            )
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_inactivity_cap_group ON inactivity_capabilities(owner_user_id,group_id,cycle_key)")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS inactivity_deliveries (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL DEFAULT '',
                group_id TEXT NOT NULL DEFAULT '',
                cycle_key TEXT NOT NULL DEFAULT '',
                stage TEXT NOT NULL DEFAULT '',
                recipient_ref TEXT NOT NULL DEFAULT '',
                channel TEXT NOT NULL DEFAULT 'email',
                status TEXT NOT NULL DEFAULT '',
                provider TEXT NOT NULL DEFAULT '',
                error_code TEXT NOT NULL DEFAULT '',
                attempts INTEGER NOT NULL DEFAULT 0,
                attempted_at TEXT NOT NULL DEFAULT ''
            )
        """)
        await conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_inactivity_delivery_once "
            "ON inactivity_deliveries(cycle_key,stage,recipient_ref,channel)")

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS passbooks (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL DEFAULT 'system',
                pattadar_no TEXT NOT NULL,
                owner_name TEXT NOT NULL DEFAULT '',
                father_husband_name TEXT NOT NULL DEFAULT '',
                state TEXT NOT NULL DEFAULT '',
                district TEXT NOT NULL,
                mandal TEXT NOT NULL,
                village TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT ''
            )
        """)
        await conn.execute("ALTER TABLE passbooks ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT ''")
        await conn.execute("ALTER TABLE passbooks ADD COLUMN IF NOT EXISTS owner_name TEXT NOT NULL DEFAULT ''")
        await conn.execute("ALTER TABLE passbooks ADD COLUMN IF NOT EXISTS father_husband_name TEXT NOT NULL DEFAULT ''")
        await conn.execute("ALTER TABLE passbooks ADD COLUMN IF NOT EXISTS photo TEXT NOT NULL DEFAULT ''")

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS parcels (
                id TEXT PRIMARY KEY,
                passbook_id TEXT NOT NULL,
                survey_no TEXT NOT NULL,
                subdivision TEXT NOT NULL DEFAULT '',
                extent REAL NOT NULL DEFAULT 0,
                unit TEXT NOT NULL DEFAULT 'Acres-Guntas',
                classification TEXT NOT NULL DEFAULT 'agri',
                acquisition_source TEXT NOT NULL DEFAULT 'sale',
                geo_point TEXT NOT NULL DEFAULT '',
                parent_parcel_id TEXT NOT NULL DEFAULT '',
                source TEXT NOT NULL DEFAULT 'manual',
                created_at TEXT NOT NULL DEFAULT ''
            )
        """)
        await conn.execute("ALTER TABLE parcels ADD COLUMN IF NOT EXISTS parent_parcel_id TEXT NOT NULL DEFAULT ''")
        await conn.execute("ALTER TABLE parcels ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'")
        # The surveyed outline, corner-ordered "lat,lng;…" (FMB point table).
        await conn.execute("ALTER TABLE parcels ADD COLUMN IF NOT EXISTS boundary TEXT NOT NULL DEFAULT ''")
        # Per-field record state (CL-289). One row per (parcel, field_key) so a
        # government pull can upsert idempotently. `state` distinguishes
        # unknown (never answered, counts as missing) from not_available
        # (deliberately answered N/A) — they must never be conflated.
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS parcel_fields (
                parcel_id TEXT NOT NULL,
                field_key TEXT NOT NULL,
                state TEXT NOT NULL DEFAULT 'unknown',
                value TEXT NOT NULL DEFAULT '',
                source TEXT NOT NULL DEFAULT 'manual',
                source_ref TEXT NOT NULL DEFAULT '',
                verified_at TEXT NOT NULL DEFAULT '',
                expires_at TEXT NOT NULL DEFAULT '',
                na_reason TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (parcel_id, field_key)
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS parcel_fields_key_idx ON parcel_fields (field_key)")
        # Photographs of the land itself (CL-561..563). These are evidence, not
        # decoration: a boundary-stone photo is worth what its coordinates,
        # heading and capture date are worth, so the metadata is first-class
        # columns rather than something buried in the image's EXIF, which every
        # share sheet and messaging app strips.
        #
        # Attached to the PARCEL, not the passbook — one khata can span parcels
        # kilometres apart, so a khata-level photo would name the wrong land.
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS parcel_photos (
                id TEXT PRIMARY KEY,
                parcel_id TEXT NOT NULL,
                owner_user_id TEXT NOT NULL,
                file_ref TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT 'general',
                caption TEXT NOT NULL DEFAULT '',
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION,
                heading DOUBLE PRECISION,
                captured_at TEXT NOT NULL DEFAULT '',
                captured_by TEXT NOT NULL DEFAULT '',
                is_cover BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TEXT NOT NULL DEFAULT ''
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS parcel_photos_parcel_idx ON parcel_photos (parcel_id)")
        # One cover per parcel, enforced by the database rather than by every
        # caller remembering to clear the previous one.
        await conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS parcel_photos_one_cover_idx "
            "ON parcel_photos (parcel_id) WHERE is_cover")
        await ensure_property_photos_schema(conn)
        # Ciphertext only — the masked token stays in aadhaar_masked for display.
        await conn.execute(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_ref_enc TEXT NOT NULL DEFAULT ''")
        # Extended parcel dossier (identity/status, address, boundary schedule,
        # financials, legal) — manual entry now; AP-IGRS auto-fill later.
        for _col, _ddl in [
            ("status", "TEXT NOT NULL DEFAULT 'owned'"),
            ("label", "TEXT NOT NULL DEFAULT ''"),
            ("address", "TEXT NOT NULL DEFAULT ''"),
            ("boundary_north", "TEXT NOT NULL DEFAULT ''"),
            ("boundary_south", "TEXT NOT NULL DEFAULT ''"),
            ("boundary_east", "TEXT NOT NULL DEFAULT ''"),
            ("boundary_west", "TEXT NOT NULL DEFAULT ''"),
            ("purchase_price", "DOUBLE PRECISION NOT NULL DEFAULT 0"),
            ("purchase_date", "TEXT NOT NULL DEFAULT ''"),
            ("guideline_value", "DOUBLE PRECISION NOT NULL DEFAULT 0"),
            ("market_value", "DOUBLE PRECISION NOT NULL DEFAULT 0"),
            ("stamp_duty", "DOUBLE PRECISION NOT NULL DEFAULT 0"),
            ("loan_amount", "DOUBLE PRECISION NOT NULL DEFAULT 0"),
            ("encumbrance_status", "TEXT NOT NULL DEFAULT ''"),
            ("reg_doc_no", "TEXT NOT NULL DEFAULT ''"),
            ("sro", "TEXT NOT NULL DEFAULT ''"),
            ("reg_date", "TEXT NOT NULL DEFAULT ''"),
            ("ec_status", "TEXT NOT NULL DEFAULT ''"),
            ("ec_date", "TEXT NOT NULL DEFAULT ''"),
            ("mutation_status", "TEXT NOT NULL DEFAULT ''"),
            ("tax_paid_upto", "TEXT NOT NULL DEFAULT ''"),
            ("rera_no", "TEXT NOT NULL DEFAULT ''"),
            ("litigation", "BOOLEAN NOT NULL DEFAULT false"),
            ("litigation_note", "TEXT NOT NULL DEFAULT ''"),
        ]:
            await conn.execute(f"ALTER TABLE parcels ADD COLUMN IF NOT EXISTS {_col} {_ddl}")

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS parcel_owners (
                id TEXT PRIMARY KEY,
                parcel_id TEXT NOT NULL,
                owner_name TEXT NOT NULL DEFAULT '',
                acquisition_source TEXT NOT NULL DEFAULT '',
                extent REAL NOT NULL DEFAULT 0,
                mutation_type TEXT NOT NULL DEFAULT 'acquisition',
                mutation_date TEXT NOT NULL DEFAULT '',
                is_current BOOLEAN NOT NULL DEFAULT true,
                created_at TEXT NOT NULL DEFAULT ''
            )
        """)

        # Scale: the per-passbook rollups (total_extent, parcelsByPassbook) and
        # per-parcel ownership lookups (current_owner/owners) filter by these FKs.
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_parcels_passbook ON parcels(passbook_id)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_parcel_owners_parcel ON parcel_owners(parcel_id)")

        # ---- Non-agricultural property register (parallel to parcels) ----
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL DEFAULT 'system',
                name TEXT NOT NULL DEFAULT '',
                builder_name TEXT NOT NULL DEFAULT '',
                project_type TEXT NOT NULL DEFAULT '',
                rera_no TEXT NOT NULL DEFAULT '',
                address TEXT NOT NULL DEFAULT '',
                city TEXT NOT NULL DEFAULT '',
                geo_point TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT ''
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS properties (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL DEFAULT 'system',
                group_id TEXT NOT NULL DEFAULT '',
                project_id TEXT NOT NULL DEFAULT '',
                type TEXT NOT NULL DEFAULT 'open_plot',
                label TEXT NOT NULL DEFAULT '',
                address TEXT NOT NULL DEFAULT '',
                locality TEXT NOT NULL DEFAULT '',
                city TEXT NOT NULL DEFAULT '',
                district TEXT NOT NULL DEFAULT '',
                geo_point TEXT NOT NULL DEFAULT '',
                land_area DOUBLE PRECISION NOT NULL DEFAULT 0,
                land_unit TEXT NOT NULL DEFAULT 'Sq.yd',
                builtup_area DOUBLE PRECISION NOT NULL DEFAULT 0,
                builtup_unit TEXT NOT NULL DEFAULT 'Sq.ft',
                acquisition_mode TEXT NOT NULL DEFAULT 'purchase',
                holding_status TEXT NOT NULL DEFAULT 'owned',
                purchase_price DOUBLE PRECISION NOT NULL DEFAULT 0,
                purchase_date TEXT NOT NULL DEFAULT '',
                guideline_value DOUBLE PRECISION NOT NULL DEFAULT 0,
                market_value DOUBLE PRECISION NOT NULL DEFAULT 0,
                current_value DOUBLE PRECISION NOT NULL DEFAULT 0,
                reg_doc_no TEXT NOT NULL DEFAULT '',
                sro TEXT NOT NULL DEFAULT '',
                reg_date TEXT NOT NULL DEFAULT '',
                ghmc_assessment_no TEXT NOT NULL DEFAULT '',
                khata_no TEXT NOT NULL DEFAULT '',
                rera_no TEXT NOT NULL DEFAULT '',
                ec_status TEXT NOT NULL DEFAULT '',
                ec_date TEXT NOT NULL DEFAULT '',
                mutation_status TEXT NOT NULL DEFAULT '',
                tax_paid_upto TEXT NOT NULL DEFAULT '',
                litigation BOOLEAN NOT NULL DEFAULT false,
                litigation_note TEXT NOT NULL DEFAULT '',
                attributes TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT ''
            )
        """)
        await conn.execute("ALTER TABLE properties ADD COLUMN IF NOT EXISTS boundary TEXT NOT NULL DEFAULT ''")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS property_owners (
                id TEXT PRIMARY KEY,
                property_id TEXT NOT NULL,
                owner_name TEXT NOT NULL DEFAULT '',
                user_id TEXT NOT NULL DEFAULT '',
                group_id TEXT NOT NULL DEFAULT '',
                share_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
                role TEXT NOT NULL DEFAULT 'owner',
                is_current BOOLEAN NOT NULL DEFAULT true,
                created_at TEXT NOT NULL DEFAULT ''
            )
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_properties_owner ON properties(owner_user_id)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_property_owners_property ON property_owners(property_id)")

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS registered_documents (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL DEFAULT 'system',
                doc_type TEXT NOT NULL DEFAULT '',
                document_no TEXT NOT NULL DEFAULT '',
                reg_year TEXT NOT NULL DEFAULT '',
                book_no TEXT NOT NULL DEFAULT '',
                sro TEXT NOT NULL DEFAULT '',
                registration_date TEXT NOT NULL DEFAULT '',
                execution_date TEXT NOT NULL DEFAULT '',
                consideration REAL NOT NULL DEFAULT 0,
                stamp_duty REAL NOT NULL DEFAULT 0,
                transfer_duty REAL NOT NULL DEFAULT 0,
                registration_fee REAL NOT NULL DEFAULT 0,
                user_charges REAL NOT NULL DEFAULT 0,
                total_fee REAL NOT NULL DEFAULT 0,
                village TEXT NOT NULL DEFAULT '',
                mandal TEXT NOT NULL DEFAULT '',
                district TEXT NOT NULL DEFAULT '',
                survey_no TEXT NOT NULL DEFAULT '',
                plot_no TEXT NOT NULL DEFAULT '',
                extent TEXT NOT NULL DEFAULT '',
                classification TEXT NOT NULL DEFAULT '',
                boundary_north TEXT NOT NULL DEFAULT '',
                boundary_south TEXT NOT NULL DEFAULT '',
                boundary_east TEXT NOT NULL DEFAULT '',
                boundary_west TEXT NOT NULL DEFAULT '',
                prior_document TEXT NOT NULL DEFAULT '',
                gpa_document TEXT NOT NULL DEFAULT '',
                scanning_id TEXT NOT NULL DEFAULT '',
                file_ref TEXT NOT NULL DEFAULT '',
                passbook_id TEXT NOT NULL DEFAULT '',
                parcel_id TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT ''
            )
        """)
        # A deed can create a PLOT as well as a parcel — the link back needs
        # somewhere to live (create_property_from_document).
        await conn.execute(
            "ALTER TABLE registered_documents ADD COLUMN IF NOT EXISTS property_id TEXT NOT NULL DEFAULT ''")
        # The full extraction payload, verbatim JSON. The columns above are the
        # LIST view of a document; the viewer reads this — language, the Telugu
        # summary, page ranges, per-field pages and confidence — and future
        # fields land here without another migration.
        await conn.execute(
            "ALTER TABLE registered_documents ADD COLUMN IF NOT EXISTS reading TEXT NOT NULL DEFAULT ''")
        # What the AI read, in words, kept ON the document row. A summary is a
        # statement ABOUT one particular file — it has no meaning apart from it,
        # so it is a column here rather than a record of its own, and it goes
        # when the document goes without anything having to remember to delete it.
        await conn.execute(
            "ALTER TABLE registered_documents ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT ''")
        # JSON array of strings; the things the reader itself flagged as worth
        # checking by eye.
        await conn.execute(
            "ALTER TABLE registered_documents ADD COLUMN IF NOT EXISTS caveats TEXT NOT NULL DEFAULT ''")
        # The summary reads like an article: a headline to scan, key points to
        # skim, then the prose. Stored beside the summary they belong to.
        await conn.execute(
            "ALTER TABLE registered_documents ADD COLUMN IF NOT EXISTS headline TEXT NOT NULL DEFAULT ''")
        await conn.execute(
            "ALTER TABLE registered_documents ADD COLUMN IF NOT EXISTS key_points TEXT NOT NULL DEFAULT ''")

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS favourites (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT ''
            )
        """)
        # One row per person per thing; the unique index is what makes the
        # toggle idempotent under a double tap.
        await conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS favourites_unique "
            "ON favourites (owner_user_id, entity_type, entity_id)")

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS document_parties (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'seller',
                name TEXT NOT NULL DEFAULT '',
                parentage TEXT NOT NULL DEFAULT '',
                age TEXT NOT NULL DEFAULT '',
                address TEXT NOT NULL DEFAULT '',
                is_gpa BOOLEAN NOT NULL DEFAULT false,
                created_at TEXT NOT NULL DEFAULT ''
            )
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                parcel_id TEXT NOT NULL,
                owner_user_id TEXT NOT NULL DEFAULT 'system',
                doc_type TEXT NOT NULL DEFAULT 'other',
                file_ref TEXT NOT NULL DEFAULT '',
                doc_no TEXT NOT NULL DEFAULT '',
                sro_code TEXT NOT NULL DEFAULT '',
                reg_year TEXT NOT NULL DEFAULT '',
                version INTEGER NOT NULL DEFAULT 1,
                source TEXT NOT NULL DEFAULT 'upload',
                tags TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT ''
            )
        """)
        await conn.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS owner_user_id TEXT NOT NULL DEFAULT 'system'")
        await conn.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS passbook_id TEXT NOT NULL DEFAULT ''")
        await conn.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS property_id TEXT NOT NULL DEFAULT ''")
        # ── The vault, layer 1: the FILE's own facts ──────────────────────
        # `documents` was a pointer at a storage node and nothing else, so the
        # apps had to ask the storage gateway what each file was CALLED — one
        # request per row, none of it available offline, and no size at all.
        # A file knows its own name, weight and kind; it says so here.
        for _col, _type in (("name", "TEXT"), ("mime_type", "TEXT"), ("reading_id", "TEXT")):
            await conn.execute(
                f"ALTER TABLE documents ADD COLUMN IF NOT EXISTS {_col} TEXT NOT NULL DEFAULT ''")
        await conn.execute(
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS size_bytes BIGINT NOT NULL DEFAULT 0")
        # The vault lists layer 1 and filters it by owner; both are hot.
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_user_id)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_documents_reading ON documents(reading_id)")

        # ── The paper trail: a document that follows another document ─────
        # "Bought from A, sold on to C" is two deeds and ONE fact — that the
        # second cites the first. Without an edge the chain of title is two
        # unrelated rows, and the reader's own citation (reading.links[]) can
        # never become more than a dashed card saying "cited, not filed".
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS document_links (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL DEFAULT '',
                from_document_id TEXT NOT NULL,
                to_document_id TEXT NOT NULL,
                relation TEXT NOT NULL DEFAULT 'prior_title',
                note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT ''
            )
        """)
        # One edge per (pair, relation) — what makes linking idempotent under
        # a retried mutation from the iOS write queue.
        await conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS document_links_unique "
            "ON document_links (from_document_id, to_document_id, relation)")
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_document_links_from ON document_links(from_document_id)")
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_document_links_to ON document_links(to_document_id)")

        await _backfill_vault_layer_one(conn)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS beneficiaries (
                id TEXT PRIMARY KEY,
                parcel_id TEXT NOT NULL DEFAULT '',
                owner_user_id TEXT NOT NULL DEFAULT '',
                person_name TEXT NOT NULL,
                person_contact TEXT NOT NULL DEFAULT '',
                present_address TEXT NOT NULL DEFAULT '',
                relationship TEXT NOT NULL DEFAULT '',
                share_pct REAL NOT NULL DEFAULT 0,
                kind TEXT NOT NULL DEFAULT 'coowner',
                status TEXT NOT NULL DEFAULT 'pending'
            )
        """)
        # Parcel is now optional (link later), so beneficiaries are scoped by
        # owner_user_id too; present_address added. Idempotent for existing DBs.
        await conn.execute("ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS owner_user_id TEXT NOT NULL DEFAULT ''")
        await conn.execute("ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS present_address TEXT NOT NULL DEFAULT ''")
        await conn.execute("ALTER TABLE beneficiaries ALTER COLUMN parcel_id SET DEFAULT ''")
        for _col, _type in (("dob", "TEXT"), ("marital_status", "TEXT"), ("spouse_name", "TEXT"),
                            ("spouse_contact", "TEXT"), ("spouse_status", "TEXT"), ("guardian_name", "TEXT"),
                            ("guardian_contact", "TEXT"), ("invite_token", "TEXT"), ("aadhaar_masked", "TEXT"),
                            ("gender", "TEXT"), ("photo", "TEXT"), ("phone", "TEXT"), ("email", "TEXT")):
            await conn.execute(f"ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS {_col} {_type} NOT NULL DEFAULT ''")
        await conn.execute("ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS is_minor BOOLEAN NOT NULL DEFAULT false")

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL DEFAULT 'system',
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                body TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT ''
            )
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_notes_entity ON notes(owner_user_id, entity_type, entity_id)")

        # What is ON the land, as opposed to what the papers say about it.
        #
        # A borewell's depth, the motor's horsepower, the electricity service
        # number, how wide the access track is, which corner stone is which —
        # none of it appears on any deed, all of it is expensive to rediscover,
        # and today it lives in one person's memory. When that person is not
        # around, a 320 ft borewell becomes "somewhere around 300, ask the man
        # who drilled it".
        #
        # `value` and `unit` are kept apart so a depth can be totalled, sorted
        # and converted later; `note` holds what cannot be reduced to a number.
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS land_features (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL DEFAULT 'system',
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'other',
                label TEXT NOT NULL DEFAULT '',
                value REAL NOT NULL DEFAULT 0,
                unit TEXT NOT NULL DEFAULT '',
                reference TEXT NOT NULL DEFAULT '',
                vendor TEXT NOT NULL DEFAULT '',
                condition TEXT NOT NULL DEFAULT '',
                note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT ''
            )
        """)
        # Added after the table shipped, so existing rows get them too.
        for col in ("vendor", "condition"):
            await conn.execute(
                f"ALTER TABLE land_features ADD COLUMN IF NOT EXISTS {col} TEXT NOT NULL DEFAULT ''")
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_features_entity "
            "ON land_features(owner_user_id, entity_type, entity_id)")

        # Work somebody else has to do standing on the land or queueing at an
        # office: a survey, a title opinion, site photos, an errand at the MRO.
        #
        # This is a TRACKER, not a marketplace. Nothing here takes payment or
        # dispatches anyone — it records what was asked for, who is doing it,
        # what it costs and how far along it is, because that is the part people
        # actually lose track of. A request that stalls at "papers sent" for two
        # months is the thing this exists to make visible.
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS work_requests (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL DEFAULT 'system',
                kind TEXT NOT NULL DEFAULT 'errand',
                title TEXT NOT NULL DEFAULT '',
                entity_type TEXT NOT NULL DEFAULT '',
                entity_id TEXT NOT NULL DEFAULT '',
                assignee TEXT NOT NULL DEFAULT '',
                cost REAL NOT NULL DEFAULT 0,
                stage INTEGER NOT NULL DEFAULT 0,
                needs_you BOOLEAN NOT NULL DEFAULT FALSE,
                note TEXT NOT NULL DEFAULT '',
                due_date TEXT NOT NULL DEFAULT '',
                closed BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TEXT NOT NULL DEFAULT ''
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_requests_owner "
            "ON work_requests(owner_user_id, closed)")

        # What the land has COST — stamp duty, fencing, a survey, the tax.
        # Different from what it is worth, and the one a person is actually
        # asked to produce at tax time or when a co-owner asks what was spent.
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS land_expenses (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL DEFAULT 'system',
                entity_type TEXT NOT NULL DEFAULT '',
                entity_id TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT 'other',
                title TEXT NOT NULL DEFAULT '',
                amount REAL NOT NULL DEFAULT 0,
                spent_on TEXT NOT NULL DEFAULT '',
                vendor TEXT NOT NULL DEFAULT '',
                note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT ''
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_expenses_owner ON land_expenses(owner_user_id)")

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS family_members (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL DEFAULT 'system',
                name TEXT NOT NULL,
                relation TEXT NOT NULL DEFAULT 'other',
                gender TEXT NOT NULL DEFAULT '',
                dob TEXT NOT NULL DEFAULT '',
                phone TEXT NOT NULL DEFAULT '',
                email TEXT NOT NULL DEFAULT '',
                bio TEXT NOT NULL DEFAULT '',
                is_beneficiary BOOLEAN NOT NULL DEFAULT true,
                share_pct REAL NOT NULL DEFAULT 0,
                invite_status TEXT NOT NULL DEFAULT '',
                photo TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT ''
            )
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_family_owner ON family_members(owner_user_id)")
        await conn.execute(
            "ALTER TABLE family_members ADD COLUMN IF NOT EXISTS aadhaar_enc TEXT NOT NULL DEFAULT ''")
        await conn.execute("ALTER TABLE family_members ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT ''")
        await conn.execute("ALTER TABLE family_members ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT ''")

        # ── Unified "people" model: family_members carries genealogy links +
        #    beneficiary/KYC/verification so Family and Beneficiaries are one record.
        await conn.execute("ALTER TABLE family_members ADD COLUMN IF NOT EXISTS is_self BOOLEAN NOT NULL DEFAULT false")
        for _c in ("father_id", "mother_id", "spouse_id", "present_address", "aadhaar_masked",
                   "guardian_name", "guardian_contact", "marital_status", "spouse_name",
                   "spouse_contact", "spouse_status", "kind", "status", "invite_token",
                   "parcel_id", "legacy_beneficiary_id"):
            await conn.execute(f"ALTER TABLE family_members ADD COLUMN IF NOT EXISTS {_c} TEXT NOT NULL DEFAULT ''")
        await conn.execute("ALTER TABLE family_members ADD COLUMN IF NOT EXISTS is_minor BOOLEAN NOT NULL DEFAULT false")
        # Per-channel verification flags → green ✓ next to phone/email (set in Phase 2).
        await conn.execute("ALTER TABLE family_members ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT false")
        await conn.execute("ALTER TABLE family_members ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false")
        await conn.execute("ALTER TABLE family_members ADD COLUMN IF NOT EXISTS inactivity_email_consent BOOLEAN NOT NULL DEFAULT false")
        await conn.execute("ALTER TABLE family_members ADD COLUMN IF NOT EXISTS inactivity_email_consent_at TEXT NOT NULL DEFAULT ''")
        # Which channel the invite was sent on → marked verified when they accept.
        await conn.execute("ALTER TABLE family_members ADD COLUMN IF NOT EXISTS invite_channel TEXT NOT NULL DEFAULT ''")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_family_legacy ON family_members(legacy_beneficiary_id)")

        # One-time, idempotent backfill: copy existing beneficiaries into people.
        # legacy_beneficiary_id marks migrated rows so re-running is a no-op. The
        # beneficiaries table is intentionally KEPT so in-flight verify/:token links
        # still resolve during rollout. No genealogy links are set here — buildTree
        # places link-less people by their `relation` (relative to self).
        await conn.execute("""
            INSERT INTO family_members
              (id, owner_user_id, name, relation, gender, dob, phone, email, bio,
               is_beneficiary, share_pct, invite_status, photo, created_at,
               present_address, aadhaar_masked, is_minor, guardian_name, guardian_contact,
               marital_status, spouse_name, spouse_contact, spouse_status, kind, status,
               invite_token, parcel_id, legacy_beneficiary_id)
            SELECT b.id, b.owner_user_id,
                   b.person_name, COALESCE(NULLIF(b.relationship, ''), 'other'),
                   b.gender, b.dob, COALESCE(NULLIF(b.phone, ''), b.person_contact), b.email, '',
                   true, b.share_pct, '', b.photo, %s,
                   b.present_address, b.aadhaar_masked, b.is_minor, b.guardian_name, b.guardian_contact,
                   b.marital_status, b.spouse_name, b.spouse_contact, b.spouse_status,
                   COALESCE(NULLIF(b.kind, ''), 'coowner'), COALESCE(NULLIF(b.status, ''), 'pending'),
                   b.invite_token, b.parcel_id, b.id
            FROM beneficiaries b
            WHERE NOT EXISTS (SELECT 1 FROM family_members f WHERE f.legacy_beneficiary_id = b.id)
        """, (datetime.utcnow().isoformat(),))

        # ── Groups (typed land-holding entities) + per-group membership ──────
        # A group (Family/Partnership/Company/HUF/Trust) holds land and contains
        # members. family_members gains group_id (per-group rows) + role; the
        # self node is now unique per (owner, group) instead of per owner.
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS groups (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL DEFAULT '',
                type TEXT NOT NULL DEFAULT 'family',
                name TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT ''
            )
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_groups_owner ON groups(owner_user_id)")
        await conn.execute("ALTER TABLE family_members ADD COLUMN IF NOT EXISTS group_id TEXT NOT NULL DEFAULT ''")
        await conn.execute("ALTER TABLE family_members ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT ''")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_family_group ON family_members(owner_user_id, group_id)")
        await conn.execute("ALTER TABLE passbooks ADD COLUMN IF NOT EXISTS group_id TEXT NOT NULL DEFAULT ''")
        # Stake: the account holder's relationship to a holding (wallet model).
        await conn.execute("ALTER TABLE parcels ADD COLUMN IF NOT EXISTS stake TEXT NOT NULL DEFAULT 'owned'")
        await conn.execute("ALTER TABLE properties ADD COLUMN IF NOT EXISTS stake TEXT NOT NULL DEFAULT 'owned'")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_passbooks_group ON passbooks(group_id)")
        # Self node is now per-group: drop the owner-only unique index, add a
        # composite one so each group gets its own materialized 'self' member.
        await conn.execute("DROP INDEX IF EXISTS idx_family_self")
        await conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_family_self_grp ON family_members(owner_user_id, group_id) WHERE is_self")

        # One-time, idempotent migration: give every existing owner a default
        # Family group and attach their members + passbooks to it. Re-running is
        # a no-op (guards on 'no family group yet' / 'group_id still empty').
        _now = datetime.utcnow().isoformat()
        await conn.execute("""
            INSERT INTO groups (id, owner_user_id, type, name, description, created_at, updated_at)
            SELECT gen_random_uuid()::text, o.owner_user_id, 'family',
                   COALESCE(NULLIF(u.name, ''), 'My') || ' Family', '', %s, %s
            FROM (
                SELECT DISTINCT owner_user_id FROM family_members
                UNION SELECT DISTINCT owner_user_id FROM passbooks
            ) o
            LEFT JOIN users u ON u.id = o.owner_user_id
            WHERE o.owner_user_id NOT IN ('', 'system')
              AND NOT EXISTS (SELECT 1 FROM groups g
                              WHERE g.owner_user_id = o.owner_user_id AND g.type = 'family')
        """, (_now, _now))
        await conn.execute("""
            UPDATE family_members fm
            SET group_id = (SELECT id FROM groups g
                            WHERE g.owner_user_id = fm.owner_user_id AND g.type = 'family'
                            ORDER BY created_at LIMIT 1)
            WHERE (fm.group_id IS NULL OR fm.group_id = '')
              AND fm.owner_user_id NOT IN ('', 'system')
        """)
        await conn.execute("""
            UPDATE passbooks pb
            SET group_id = (SELECT id FROM groups g
                            WHERE g.owner_user_id = pb.owner_user_id AND g.type = 'family'
                            ORDER BY created_at LIMIT 1)
            WHERE (pb.group_id IS NULL OR pb.group_id = '')
              AND pb.owner_user_id NOT IN ('', 'system')
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS invitations (
                id TEXT PRIMARY KEY,
                scope_type TEXT NOT NULL DEFAULT 'parcel',
                scope_id TEXT NOT NULL DEFAULT '',
                role TEXT NOT NULL DEFAULT 'view',
                invitee_contact TEXT NOT NULL DEFAULT '',
                token TEXT NOT NULL DEFAULT '',
                expiry TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL DEFAULT ''
            )
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS sro_offices (
                id TEXT PRIMARY KEY,
                code TEXT NOT NULL,
                name TEXT NOT NULL,
                dr_zone TEXT NOT NULL DEFAULT '',
                district TEXT NOT NULL DEFAULT '',
                mandal TEXT NOT NULL DEFAULT ''
            )
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS states (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                code TEXT NOT NULL DEFAULT ''
            )
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS districts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                code TEXT NOT NULL DEFAULT '',
                state_id TEXT NOT NULL DEFAULT ''
            )
        """)
        await conn.execute("ALTER TABLE districts ADD COLUMN IF NOT EXISTS state_id TEXT NOT NULL DEFAULT ''")

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS mandals (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                district_id TEXT NOT NULL
            )
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS villages (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                mandal_id TEXT NOT NULL
            )
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS market_values (
                id TEXT PRIMARY KEY,
                district TEXT NOT NULL,
                mandal TEXT NOT NULL,
                village TEXT NOT NULL,
                classification TEXT NOT NULL DEFAULT 'agri',
                rate_per_unit REAL NOT NULL DEFAULT 0,
                unit TEXT NOT NULL DEFAULT 'Acres-Guntas',
                effective_from TEXT NOT NULL DEFAULT ''
            )
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS service_requests (
                id TEXT PRIMARY KEY,
                req_type TEXT NOT NULL DEFAULT '',
                parcel_id TEXT NOT NULL DEFAULT '',
                sro_code TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'pending',
                details TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT ''
            )
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS audit_events (
                id TEXT PRIMARY KEY,
                actor TEXT NOT NULL DEFAULT '',
                action TEXT NOT NULL DEFAULT '',
                target TEXT NOT NULL DEFAULT '',
                details TEXT NOT NULL DEFAULT '',
                timestamp TEXT NOT NULL DEFAULT ''
            )
        """)
        # Every read of this table is one owner's trail, newest first, and the
        # table grows with every audited mutation platform-wide and is never
        # pruned — without these the Audit tab is a sequential scan of the whole
        # platform's history.
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_events_actor "
            "ON audit_events(actor, timestamp DESC)")
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_events_target ON audit_events(target)")

        # Mutation replay ledger for IdempotencyMiddleware. The composite
        # PRIMARY KEY is the claim primitive: on an autocommit pool an
        # INSERT-or-conflict is the only race-safe "first request wins" across
        # workers and replicas. status is 'pending' while the mutation runs,
        # 'completed' once its response body is memoized in `response`
        # (NULL response = completed but too large to replay).
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS idempotency_keys (
                owner_user_id TEXT NOT NULL,
                key TEXT NOT NULL,
                operation TEXT NOT NULL,
                status TEXT NOT NULL,
                response TEXT,
                created_at TEXT NOT NULL,
                PRIMARY KEY (owner_user_id, key)
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys(created_at)")
        # Replays only matter inside a client's retry window; sweep old rows at
        # boot so the ledger can't grow unbounded. created_at is ISO-8601 text,
        # so the string comparison is chronological.
        await conn.execute("DELETE FROM idempotency_keys WHERE created_at < %s",
                           (_idem_sweep_cutoff(datetime.utcnow()),))

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS deed_types (
                id TEXT PRIMARY KEY,
                reg_type_en TEXT NOT NULL DEFAULT '',
                reg_type_te TEXT NOT NULL DEFAULT '',
                nature_en TEXT NOT NULL DEFAULT '',
                nature_te TEXT NOT NULL DEFAULT ''
            )
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS fee_schedule (
                id TEXT PRIMARY KEY,
                tmaj_code TEXT NOT NULL DEFAULT '',
                tmin_code TEXT NOT NULL DEFAULT '',
                reg_type_en TEXT NOT NULL DEFAULT '',
                nature_en TEXT NOT NULL DEFAULT '',
                sample_consideration REAL NOT NULL DEFAULT 0,
                stamp_duty REAL NOT NULL DEFAULT 0,
                transfer_duty REAL NOT NULL DEFAULT 0,
                registration_fee REAL NOT NULL DEFAULT 0,
                user_charges REAL NOT NULL DEFAULT 0,
                stamp_rate REAL NOT NULL DEFAULT 0,
                transfer_rate REAL NOT NULL DEFAULT 0,
                reg_rate REAL NOT NULL DEFAULT 0,
                user_rate REAL NOT NULL DEFAULT 0
            )
        """)

        # ── Real AP-IGRS reference data (districts/mandals/SROs/deed-types/
        #    fee-schedule) from the bundled CSVs. Runs BEFORE the fake seed
        #    blocks below, so those (guarded on cnt == 0) become no-ops. ────
        await _load_reference_data(conn)

        # ── Seed Districts (13 districts of AP) ──────────────────────
        cur = await conn.execute("SELECT count(*) AS cnt FROM districts")
        if (await cur.fetchone())["cnt"] == 0:
            async with conn.cursor() as ins:
                await ins.executemany(
                    "INSERT INTO districts (id, name, code) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                    [
                        ("d01", "Anantapur", "ATP"),
                        ("d02", "Chittoor", "CTR"),
                        ("d03", "East Godavari", "EGD"),
                        ("d04", "Guntur", "GNT"),
                        ("d05", "Krishna", "KRN"),
                        ("d06", "Kurnool", "KNL"),
                        ("d07", "Nellore", "NLR"),
                        ("d08", "Prakasam", "PKM"),
                        ("d09", "Srikakulam", "SKM"),
                        ("d10", "Visakhapatnam", "VSP"),
                        ("d11", "Vizianagaram", "VZM"),
                        ("d12", "West Godavari", "WGD"),
                        ("d13", "YSR Kadapa", "KDP"),
                    ],
                )

        # ── Seed Mandals ─────────────────────────────────────────────
        cur = await conn.execute("SELECT count(*) AS cnt FROM mandals")
        if (await cur.fetchone())["cnt"] == 0:
            async with conn.cursor() as ins:
                await ins.executemany(
                    "INSERT INTO mandals (id, name, district_id) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                    [
                        ("m01", "Anantapur Urban", "d01"),
                        ("m02", "Gooty", "d01"),
                        ("m03", "Tirupati Urban", "d02"),
                        ("m04", "Chandragiri", "d02"),
                        ("m05", "Kakinada Urban", "d03"),
                        ("m06", "Rajahmundry Urban", "d03"),
                        ("m07", "Guntur Urban", "d04"),
                        ("m08", "Tenali", "d04"),
                        ("m09", "Vijayawada Urban", "d05"),
                        ("m10", "Machilipatnam", "d05"),
                        ("m11", "Kurnool Urban", "d06"),
                        ("m12", "Nandyal", "d06"),
                        ("m13", "Nellore Urban", "d07"),
                        ("m14", "Gudur", "d07"),
                        ("m15", "Ongole", "d08"),
                        ("m16", "Visakhapatnam Urban", "d10"),
                        ("m17", "Kadapa Urban", "d13"),
                    ],
                )

        # ── Seed Villages ────────────────────────────────────────────
        cur = await conn.execute("SELECT count(*) AS cnt FROM villages")
        if (await cur.fetchone())["cnt"] == 0:
            async with conn.cursor() as ins:
                await ins.executemany(
                    "INSERT INTO villages (id, name, mandal_id) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                    [
                        ("v01", "Bukkarayasamudram", "m01"),
                        ("v02", "Raptadu", "m02"),
                        ("v03", "Tiruchanur", "m03"),
                        ("v04", "Chandragiri Fort", "m04"),
                        ("v05", "Samalkot", "m05"),
                        ("v06", "Kadiyam", "m06"),
                        ("v07", "Mangalagiri", "m07"),
                        ("v08", "Duggirala", "m08"),
                        ("v09", "Gannavaram", "m09"),
                        ("v10", "Pedana", "m10"),
                        ("v11", "Orvakal", "m11"),
                        ("v12", "Banaganapalle", "m12"),
                        ("v13", "Mypadu", "m13"),
                        ("v14", "Kodavaluru", "m14"),
                        ("v15", "Chimakurthy", "m15"),
                        ("v16", "Pendurthi", "m16"),
                        ("v17", "Rajampet", "m17"),
                    ],
                )

        # ── Seed SRO Offices ────────────────────────────────────────
        cur = await conn.execute("SELECT count(*) AS cnt FROM sro_offices")
        if (await cur.fetchone())["cnt"] == 0:
            async with conn.cursor() as ins:
                await ins.executemany(
                    "INSERT INTO sro_offices (id, code, name, dr_zone, district, mandal) VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                    [
                        ("s01", "ATP-01", "SRO Anantapur", "DR Anantapur", "Anantapur", "Anantapur Urban"),
                        ("s02", "ATP-02", "SRO Gooty", "DR Anantapur", "Anantapur", "Gooty"),
                        ("s03", "CTR-01", "SRO Tirupati", "DR Chittoor", "Chittoor", "Tirupati Urban"),
                        ("s04", "CTR-02", "SRO Chandragiri", "DR Chittoor", "Chittoor", "Chandragiri"),
                        ("s05", "EGD-01", "SRO Kakinada", "DR East Godavari", "East Godavari", "Kakinada Urban"),
                        ("s06", "EGD-02", "SRO Rajahmundry", "DR East Godavari", "East Godavari", "Rajahmundry Urban"),
                        ("s07", "GNT-01", "SRO Guntur", "DR Guntur", "Guntur", "Guntur Urban"),
                        ("s08", "GNT-02", "SRO Tenali", "DR Guntur", "Guntur", "Tenali"),
                        ("s09", "KRN-01", "SRO Vijayawada", "DR Krishna", "Krishna", "Vijayawada Urban"),
                        ("s10", "KRN-02", "SRO Machilipatnam", "DR Krishna", "Krishna", "Machilipatnam"),
                        ("s11", "KNL-01", "SRO Kurnool", "DR Kurnool", "Kurnool", "Kurnool Urban"),
                        ("s12", "NLR-01", "SRO Nellore", "DR Nellore", "Nellore", "Nellore Urban"),
                        ("s13", "VSP-01", "SRO Visakhapatnam", "DR Visakhapatnam", "Visakhapatnam", "Visakhapatnam Urban"),
                        ("s14", "KDP-01", "SRO Kadapa", "DR YSR Kadapa", "YSR Kadapa", "Kadapa Urban"),
                        ("s15", "PKM-01", "SRO Ongole", "DR Prakasam", "Prakasam", "Ongole"),
                    ],
                )

        # ── Seed Users ───────────────────────────────────────────────
        cur = await conn.execute("SELECT count(*) AS cnt FROM users")
        if (await cur.fetchone())["cnt"] == 0:
            async with conn.cursor() as ins:
                await ins.executemany(
                    "INSERT INTO users (id, mobile, email, name, language, kyc_ref_masked, roles, notification_prefs) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                    [
                        ("u01", "9876543210", "ramesh.kumar@example.com", "Ramesh Kumar", "en", "XXXX-XXXX-1234", "owner", "email,sms"),
                        ("u02", "9876543211", "sita.devi@example.com", "Sita Devi", "te", "XXXX-XXXX-5678", "owner", "sms"),
                        ("u03", "9876543212", "venkat.rao@example.com", "Venkat Rao", "en", "XXXX-XXXX-9012", "owner,agent", "email"),
                        ("u04", "9876543213", "lakshmi.naidu@example.com", "Lakshmi Naidu", "te", "", "owner", "email,sms"),
                        ("u05", "9876543214", "admin@pattadar.in", "System Admin", "en", "", "system_admin", "email"),
                        ("u06", "9876543215", "suresh.reddy@example.com", "Suresh Reddy", "en", "XXXX-XXXX-3456", "owner", "sms"),
                    ],
                )

        # ── Seed Passbooks ───────────────────────────────────────────
        cur = await conn.execute("SELECT count(*) AS cnt FROM passbooks")
        if (await cur.fetchone())["cnt"] == 0:
            async with conn.cursor() as ins:
                await ins.executemany(
                    "INSERT INTO passbooks (id, owner_user_id, pattadar_no, district, mandal, village, created_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                    [
                        ("pb01", "u01", "PB-ATP-2024-001", "Anantapur", "Anantapur Urban", "Bukkarayasamudram", "2024-01-15"),
                        ("pb02", "u01", "PB-KRN-2024-002", "Krishna", "Vijayawada Urban", "Gannavaram", "2024-02-20"),
                        ("pb03", "u02", "PB-CTR-2024-003", "Chittoor", "Tirupati Urban", "Tiruchanur", "2024-03-10"),
                        ("pb04", "u03", "PB-GNT-2024-004", "Guntur", "Guntur Urban", "Mangalagiri", "2024-04-05"),
                        ("pb05", "u04", "PB-EGD-2024-005", "East Godavari", "Kakinada Urban", "Samalkot", "2024-05-12"),
                        ("pb06", "u06", "PB-VSP-2024-006", "Visakhapatnam", "Visakhapatnam Urban", "Pendurthi", "2024-06-01"),
                    ],
                )

        # ── Seed Parcels ─────────────────────────────────────────────
        cur = await conn.execute("SELECT count(*) AS cnt FROM parcels")
        if (await cur.fetchone())["cnt"] == 0:
            async with conn.cursor() as ins:
                await ins.executemany(
                    "INSERT INTO parcels (id, passbook_id, survey_no, subdivision, extent, unit, classification, acquisition_source, geo_point, created_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                    [
                        ("pc01", "pb01", "45", "1", 3.20, "Acres-Guntas", "agri", "inheritance", "", "2024-01-15"),
                        ("pc02", "pb01", "45", "2", 1.50, "Acres-Guntas", "agri", "inheritance", "", "2024-01-15"),
                        ("pc03", "pb02", "123", "A", 0.049587, "sqyd", "non-agri", "sale", "", "2024-02-20"),
                        ("pc04", "pb03", "78", "", 2.00, "Acres-Guntas", "agri", "gift", "", "2024-03-10"),
                        ("pc05", "pb04", "156", "3", 0.027548, "sqft", "non-agri", "sale", "", "2024-04-05"),
                        ("pc06", "pb05", "210", "", 5.00, "Acres-Guntas", "agri", "partition", "", "2024-05-12"),
                        ("pc07", "pb06", "89", "B", 0.103306, "sqyd", "non-agri", "sale", "", "2024-06-01"),
                        ("pc08", "pb02", "124", "", 2.471054, "hectare", "agri", "will", "", "2024-02-25"),
                    ],
                )

        # ── Seed Documents ───────────────────────────────────────────
        cur = await conn.execute("SELECT count(*) AS cnt FROM documents")
        if (await cur.fetchone())["cnt"] == 0:
            async with conn.cursor() as ins:
                await ins.executemany(
                    "INSERT INTO documents (id, parcel_id, doc_type, file_ref, doc_no, sro_code, reg_year, version, source, tags, created_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                    [
                        ("doc01", "pc01", "passbook", "passbook_45_1.pdf", "PB-001", "ATP-01", "2020", 1, "upload", "land,passbook", "2024-01-16"),
                        ("doc02", "pc03", "sale_deed", "sale_deed_123A.pdf", "SD-2024-456", "KRN-01", "2024", 1, "upload", "sale,vijayawada", "2024-02-21"),
                        ("doc03", "pc04", "gift_deed", "gift_deed_78.pdf", "GD-2023-789", "CTR-01", "2023", 1, "upload", "gift,tirupati", "2024-03-11"),
                        ("doc04", "pc01", "ec", "ec_45_1_2024.pdf", "EC-2024-001", "ATP-01", "2024", 1, "upload", "encumbrance", "2024-06-15"),
                        ("doc05", "pc05", "sale_deed", "sale_156_3.pdf", "SD-2024-101", "GNT-01", "2024", 1, "upload", "guntur,sale", "2024-04-06"),
                        ("doc06", "pc06", "passbook", "passbook_210.pdf", "PB-005", "EGD-01", "2022", 1, "upload", "passbook", "2024-05-13"),
                        ("doc07", "pc03", "tax_receipt", "tax_123A_2024.pdf", "TR-2024-55", "KRN-01", "2024", 1, "upload", "tax,property", "2024-07-01"),
                        ("doc08", "pc07", "sale_deed", "sale_89B.pdf", "SD-2024-202", "VSP-01", "2024", 1, "upload", "visakhapatnam", "2024-06-02"),
                    ],
                )

        # ── Seed Beneficiaries ───────────────────────────────────────
        cur = await conn.execute("SELECT count(*) AS cnt FROM beneficiaries")
        if (await cur.fetchone())["cnt"] == 0:
            async with conn.cursor() as ins:
                await ins.executemany(
                    "INSERT INTO beneficiaries (id, parcel_id, person_name, person_contact, relationship, share_pct, kind, status) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                    [
                        ("b01", "pc01", "Sita Devi", "9876543211", "spouse", 50.0, "coowner", "accepted"),
                        ("b02", "pc01", "Ravi Kumar", "9876543220", "son", 25.0, "nominee", "pending"),
                        ("b03", "pc01", "Priya Kumar", "9876543221", "daughter", 25.0, "nominee", "pending"),
                        ("b04", "pc03", "Lakshmi Naidu", "9876543213", "spouse", 50.0, "coowner", "accepted"),
                        ("b05", "pc04", "Venkat Rao", "9876543212", "brother", 30.0, "coowner", "accepted"),
                        ("b06", "pc06", "Padma Devi", "9876543230", "mother", 100.0, "nominee", "pending"),
                        ("b07", "pc07", "Kavitha Reddy", "9876543231", "spouse", 50.0, "coowner", "accepted"),
                    ],
                )

        # ── Seed Invitations ────────────────────────────────────────
        cur = await conn.execute("SELECT count(*) AS cnt FROM invitations")
        if (await cur.fetchone())["cnt"] == 0:
            async with conn.cursor() as ins:
                await ins.executemany(
                    "INSERT INTO invitations (id, scope_type, scope_id, role, invitee_contact, token, expiry, status, created_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                    [
                        ("inv01", "parcel", "pc01", "view", "9876543220", "tok-abc-001", "2025-12-31", "pending", "2024-07-01"),
                        ("inv02", "parcel", "pc01", "claim", "9876543221", "tok-abc-002", "2025-12-31", "pending", "2024-07-01"),
                        ("inv03", "document", "doc02", "view", "agent@example.com", "tok-abc-003", "2025-06-30", "accepted", "2024-03-15"),
                        ("inv04", "parcel", "pc06", "manage", "9876543230", "tok-abc-004", "2025-12-31", "pending", "2024-05-20"),
                        ("inv05", "passbook", "pb06", "view", "buyer@example.com", "tok-abc-005", "2025-03-31", "revoked", "2024-06-10"),
                    ],
                )

        # ── Seed Market Values ───────────────────────────────────────
        cur = await conn.execute("SELECT count(*) AS cnt FROM market_values")
        if (await cur.fetchone())["cnt"] == 0:
            async with conn.cursor() as ins:
                await ins.executemany(
                    "INSERT INTO market_values (id, district, mandal, village, classification, rate_per_unit, unit, effective_from) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                    [
                        ("mv01", "Anantapur", "Anantapur Urban", "Bukkarayasamudram", "agri", 250000.0, "Acres-Guntas", "2024-01-01"),
                        ("mv02", "Anantapur", "Anantapur Urban", "Bukkarayasamudram", "non-agri", 5000.0, "Sq.yd", "2024-01-01"),
                        ("mv03", "Krishna", "Vijayawada Urban", "Gannavaram", "non-agri", 15000.0, "Sq.yd", "2024-01-01"),
                        ("mv04", "Krishna", "Vijayawada Urban", "Gannavaram", "agri", 800000.0, "Acres-Guntas", "2024-01-01"),
                        ("mv05", "Chittoor", "Tirupati Urban", "Tiruchanur", "agri", 500000.0, "Acres-Guntas", "2024-01-01"),
                        ("mv06", "Guntur", "Guntur Urban", "Mangalagiri", "non-agri", 8000.0, "Sq.ft", "2024-01-01"),
                        ("mv07", "East Godavari", "Kakinada Urban", "Samalkot", "agri", 350000.0, "Acres-Guntas", "2024-01-01"),
                        ("mv08", "Visakhapatnam", "Visakhapatnam Urban", "Pendurthi", "non-agri", 12000.0, "Sq.yd", "2024-01-01"),
                        ("mv09", "Kurnool", "Kurnool Urban", "Orvakal", "agri", 200000.0, "Acres-Guntas", "2024-01-01"),
                        ("mv10", "YSR Kadapa", "Kadapa Urban", "Rajampet", "agri", 180000.0, "Acres-Guntas", "2024-01-01"),
                    ],
                )

        # ── Seed Audit Events ────────────────────────────────────────
        cur = await conn.execute("SELECT count(*) AS cnt FROM audit_events")
        if (await cur.fetchone())["cnt"] == 0:
            async with conn.cursor() as ins:
                await ins.executemany(
                    "INSERT INTO audit_events (id, actor, action, target, details, timestamp) "
                    "VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                    [
                        ("ae01", "Ramesh Kumar", "create_passbook", "pb01", "Created passbook PB-ATP-2024-001", "2024-01-15T10:30:00"),
                        ("ae02", "Ramesh Kumar", "add_parcel", "pc01", "Added survey 45/1 to passbook", "2024-01-15T10:35:00"),
                        ("ae03", "Ramesh Kumar", "upload_document", "doc01", "Uploaded passbook copy", "2024-01-16T09:00:00"),
                        ("ae04", "Ramesh Kumar", "add_beneficiary", "b01", "Added Sita Devi as co-owner", "2024-01-20T14:00:00"),
                        ("ae05", "Sita Devi", "create_passbook", "pb03", "Created passbook PB-CTR-2024-003", "2024-03-10T11:00:00"),
                        ("ae06", "Venkat Rao", "create_passbook", "pb04", "Created passbook PB-GNT-2024-004", "2024-04-05T08:30:00"),
                        ("ae07", "system", "send_invitation", "inv01", "Invitation sent to 9876543220", "2024-07-01T12:00:00"),
                        ("ae08", "Suresh Reddy", "upload_document", "doc08", "Sale deed for Pendurthi parcel", "2024-06-02T16:45:00"),
                    ],
                )

        # ── Seed Service Requests ────────────────────────────────────
        cur = await conn.execute("SELECT count(*) AS cnt FROM service_requests")
        if (await cur.fetchone())["cnt"] == 0:
            async with conn.cursor() as ins:
                await ins.executemany(
                    "INSERT INTO service_requests (id, req_type, parcel_id, sro_code, status, details, created_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                    [
                        ("sr01", "site_photos", "pc01", "", "pending",
                         "Drone images of the field — Survey 45/1, Anantapur", "2026-07-20"),
                        ("sr02", "repair", "", "", "in_progress",
                         "Bathroom leakage fix — Flat, Hyderabad", "2026-07-18"),
                        ("sr03", "survey", "pc03", "", "completed",
                         "Boundary re-measurement report — Kurnool parcel", "2026-07-15"),
                    ],
                )
        # Web 360 (W01–W15): its own tables + column additions, all idempotent.
        # Runs inside the same advisory lock so concurrent workers can't race
        # the DDL, and last so a failure here cannot strand the core schema.
        web360.bind(pool, _uid_from_info)
        await web360.ensure_schema(conn)
        await account.ensure_schema(conn)
        # Centralized audit read model + transactional outbox (phase 1).
        await audit.ensure_schema(conn)

        await conn.execute("SELECT pg_advisory_unlock(918273645)")


# ── Idempotency layer ─────────────────────────────────────────────────
# Mobile clients retry mutations on flaky rural networks; without a guard a
# retried createPassbook or recordPayment lands twice. Any POST /graphql
# mutation carrying an x-idempotency-key executes at most once per
# (user, key): the first request claims the key, memoizes the response, and
# every duplicate gets that response replayed verbatim. The decision logic
# lives in small pure functions so it is testable without a database.

_IDEM_MUTATION_RE = re.compile(r"^\s*mutation\b")
_IDEM_NAME_RE = re.compile(r"^\s*mutation\s+([_A-Za-z][_0-9A-Za-z]*)")
# Mutations whose answer must never be memoized. A reveal returns a decrypted
# Aadhaar; storing that body would park the twelve digits in
# idempotency_keys.response in plaintext for the whole replay window — outside
# the KMS-only-at-rest design the reveal exists to uphold. They are safe to
# re-execute: they write nothing and audit every call.
_IDEM_NEVER_RE = re.compile(r"\breveal(?:My|Member)Aadhaar\b")
_IDEM_PENDING_TTL = 300.0        # seconds before a 'pending' claim is presumed dead
_IDEM_SWEEP_DAYS = 7             # replay window; older rows are swept at boot
_IDEM_MAX_RESPONSE = 256 * 1024  # bigger bodies complete unreplayable (409 on dupes)


def _idem_is_mutation(query: str) -> bool:
    """True only for documents that open with the mutation keyword — queries,
    introspection and the `{...}` query shorthand pass through unguarded."""
    return bool(_IDEM_MUTATION_RE.match(query or ""))


def _idem_operation(query: str) -> str:
    """Diagnostic label for the claim row: the mutation's name when it has one,
    else a short content hash. Never part of the uniqueness scope."""
    m = _IDEM_NAME_RE.match(query or "")
    if m:
        return m.group(1)
    return hashlib.sha256((query or "").encode()).hexdigest()[:12]


def _idem_classify(body: bytes, headers: dict) -> Optional[tuple]:
    """(uid, key, operation) when this request must be guarded, else None.
    `headers` is a plain lowercase-keyed dict so the decision is pure. A body
    that isn't a JSON GraphQL document passes through — the router's own
    error handling is the right place for it to fail."""
    key = (headers.get("x-idempotency-key") or "").strip()
    if not key:
        return None
    try:
        query = json.loads(body).get("query") or ""
    except Exception:
        return None
    if not isinstance(query, str) or not _idem_is_mutation(query):
        return None
    if _IDEM_NEVER_RE.search(query):
        return None
    # Same identity the resolvers use (_uid_from_info); "system" scopes keys
    # for callers the gateway sends without a user id.
    uid = (headers.get("x-user-id") or "").strip() or "system"
    return uid, key, _idem_operation(query)


def _idem_stale(created_at: str, now: datetime) -> bool:
    """A 'pending' claim older than the TTL belongs to a crashed worker and may
    be taken over. An unparseable timestamp counts as stale so a corrupt row
    can never wedge its key forever."""
    try:
        return (now - datetime.fromisoformat(created_at)).total_seconds() >= _IDEM_PENDING_TTL
    except (TypeError, ValueError):
        return True


def _idem_sweep_cutoff(now: datetime) -> str:
    """ISO-8601 cutoff for the boot sweep — the same text format the rows are
    written in, so SQL `<` compares chronologically."""
    return (now - timedelta(days=_IDEM_SWEEP_DAYS)).isoformat()


def _idem_errors_body(message: str) -> bytes:
    """GraphQL-shaped error body so clients reuse their normal error path."""
    return json.dumps({"errors": [{"message": message}]}).encode()


def _idem_success(status: int, body: bytes) -> bool:
    """Only a clean 200 with no GraphQL errors is worth memoizing — anything
    else releases the claim so a genuine retry re-executes."""
    if status != 200:
        return False
    try:
        parsed = json.loads(body)
    except Exception:
        return False
    return isinstance(parsed, dict) and not parsed.get("errors")


_IDEM_GONE_MSG = ("this filing already reached the server once and its answer "
                  "is no longer available; check the vault before retrying")


def _idem_duplicate_verdict(row: dict, now: datetime) -> tuple:
    """What a duplicate request gets, decided from the claim row alone:
    ('replay', body) completed with a stored response; ('gone', body)
    completed but unreplayable — 410, the client must check the vault, never
    re-execute; ('conflict', body) genuinely in flight — 409, back off and
    retry; ('expire', None) stale pending claim. A stale claim is NOT re-run:
    a worker that died after committing but before settling leaves 'pending',
    and re-executing would mint a duplicate — the middleware seals it as
    completed-unreplayable instead."""
    if row["status"] == "completed":
        if row["response"] is None:
            return "gone", _idem_errors_body("replay unavailable; response too large")
        return "replay", row["response"].encode()
    if _idem_stale(row["created_at"], now):
        return "expire", None
    return "conflict", _idem_errors_body("duplicate request in flight")


class IdempotencyMiddleware:
    """Pure ASGI (not BaseHTTPMiddleware): the guarded body must be read once,
    replayed downstream, and the response captured without a second buffering
    layer mangling streamed bodies. Fails open — an idempotency-table outage
    degrades to unguarded writes, never to an API outage."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") != "POST" \
                or not (scope.get("path") or "").endswith("/graphql"):
            return await self.app(scope, receive, send)
        headers = {k.decode("latin-1"): v.decode("latin-1")
                   for k, v in (scope.get("headers") or [])}
        if not (headers.get("x-idempotency-key") or "").strip():
            return await self.app(scope, receive, send)

        # From here the body must be buffered: both the guard decision and the
        # downstream handler need to read it.
        body = b""
        while True:
            msg = await receive()
            if msg["type"] == "http.disconnect":
                return
            body += msg.get("body", b"")
            if not msg.get("more_body"):
                break

        replayed = False

        async def replay_receive():
            nonlocal replayed
            if replayed:
                # Delegate to the server's receive: downstream code that polls
                # for disconnect must pend until a REAL one, not see a synthetic
                # instant hangup that would abort a live request.
                return await receive()
            replayed = True
            return {"type": "http.request", "body": body, "more_body": False}

        claim = _idem_classify(body, headers)
        if claim is None:
            return await self.app(scope, replay_receive, send)
        uid, key, op = claim

        now = datetime.utcnow()
        payload = b""
        try:
            async with pool.connection() as conn:
                cur = await conn.execute(
                    "INSERT INTO idempotency_keys (owner_user_id, key, operation, status, created_at) "
                    "VALUES (%s, %s, %s, 'pending', %s) ON CONFLICT (owner_user_id, key) DO NOTHING",
                    (uid, key, op, now.isoformat()))
                if cur.rowcount == 1:
                    verdict = "claimed"
                else:
                    cur = await conn.execute(
                        "SELECT status, response, created_at FROM idempotency_keys "
                        "WHERE owner_user_id=%s AND key=%s", (uid, key))
                    row = await cur.fetchone()
                    if row is None:
                        # The conflicting claim was released between our INSERT
                        # and SELECT (its request failed). Rare enough to run
                        # unguarded rather than loop on re-claiming.
                        verdict = "unguarded"
                    else:
                        verdict, payload = _idem_duplicate_verdict(row, now)
                        if verdict == "expire":
                            # Seal the abandoned claim, stamp-guarded so exactly
                            # one of N simultaneous duplicates does. The losing
                            # racer re-reads and answers from the row's new state.
                            cur = await conn.execute(
                                "UPDATE idempotency_keys SET status='completed', response=NULL "
                                "WHERE owner_user_id=%s AND key=%s AND status='pending' AND created_at=%s",
                                (uid, key, row["created_at"]))
                            if cur.rowcount == 1:
                                verdict, payload = "gone", _idem_errors_body(_IDEM_GONE_MSG)
                            else:
                                cur = await conn.execute(
                                    "SELECT status, response, created_at FROM idempotency_keys "
                                    "WHERE owner_user_id=%s AND key=%s", (uid, key))
                                row = await cur.fetchone()
                                if row is None:
                                    # The stalled original failed and released
                                    # while we raced — nothing committed, so a
                                    # retry may run; tell the client to retry.
                                    verdict, payload = "conflict", _idem_errors_body(
                                        "duplicate request in flight")
                                else:
                                    verdict, payload = _idem_duplicate_verdict(row, now)
                                    if verdict == "expire":
                                        verdict, payload = "gone", _idem_errors_body(_IDEM_GONE_MSG)
        except Exception as exc:  # noqa: BLE001
            _log.warning("idempotency.claim_failed (running unguarded): %r", exc)
            verdict = "unguarded"

        if verdict == "unguarded":
            return await self.app(scope, replay_receive, send)
        if verdict == "replay":
            return await self._send_json(send, 200, payload,
                                         ((b"x-idempotent-replay", b"1"),))
        if verdict == "conflict":
            return await self._send_json(send, 409, payload)
        if verdict == "gone":
            return await self._send_json(send, 410, payload)

        # Fresh claim: run the mutation, capture what it answered, then either
        # memoize it or release the claim so a genuine retry re-executes.
        status = 0
        chunks: list = []

        async def capture_send(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            elif message["type"] == "http.response.body":
                chunks.append(message.get("body", b""))
            await send(message)

        stamp = now.isoformat()
        try:
            await self.app(scope, replay_receive, capture_send)
        except BaseException:
            await self._settle(uid, key, stamp, ok=False, body=b"")
            raise
        out = b"".join(chunks)
        # Anonymous callers all share the "system" scope, so memoizing their
        # answer would let one caller's response be replayed to a different one
        # that guessed the key. They still get exactly-once — the claim stands,
        # a duplicate gets 410 — just never another caller's body.
        await self._settle(uid, key, stamp, ok=_idem_success(status, out), body=out,
                           memoize=bool((headers.get("x-user-id") or "").strip()))

    async def _settle(self, uid: str, key: str, stamp: str, ok: bool, body: bytes,
                      memoize: bool = True) -> None:
        """Completion is best-effort: if it fails the claim stays pending until a
        duplicate expires it, instead of failing the request. Every statement is
        guarded on the stamp this request wrote at claim time — a settle arriving
        after the claim was expired-and-recycled must no-op, not clobber the row
        another request now owns."""
        try:
            async with pool.connection() as conn:
                if not ok:
                    await conn.execute(
                        "DELETE FROM idempotency_keys "
                        "WHERE owner_user_id=%s AND key=%s AND created_at=%s",
                        (uid, key, stamp))
                elif len(body) > _IDEM_MAX_RESPONSE or not memoize:
                    # Completed for real — never re-execute — but not replayable;
                    # duplicates get an explicit 410 instead.
                    await conn.execute(
                        "UPDATE idempotency_keys SET status='completed', response=NULL "
                        "WHERE owner_user_id=%s AND key=%s AND created_at=%s",
                        (uid, key, stamp))
                else:
                    await conn.execute(
                        "UPDATE idempotency_keys SET status='completed', response=%s "
                        "WHERE owner_user_id=%s AND key=%s AND created_at=%s",
                        (body.decode("utf-8", "replace"), uid, key, stamp))
        except Exception as exc:  # noqa: BLE001
            _log.warning("idempotency.settle_failed for key %s: %r", key, exc)

    @staticmethod
    async def _send_json(send, status: int, body: bytes, extra: tuple = ()) -> None:
        await send({"type": "http.response.start", "status": status,
                    "headers": [(b"content-type", b"application/json"),
                                (b"content-length", str(len(body)).encode())] + list(extra)})
        await send({"type": "http.response.body", "body": body})


# ── FastAPI App ───────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.getenv("ALLOW_INSECURE_LOCAL", "") != "1":
        missing = [v for v in ("APP_PUBLIC_URL", "CRON_SECRET") if not (os.getenv(v) or "").strip()]
        if missing:
            raise RuntimeError(
                "Refusing to start: required env not set: " + ", ".join(missing) + ". "
                "APP_PUBLIC_URL builds customer-facing verify links; CRON_SECRET guards "
                "/cron/inactivity-check (the endpoint is open to anyone without it). "
                "Set ALLOW_INSECURE_LOCAL=1 to bypass for local development only."
            )
    await pool.open(wait=True, timeout=30)
    try:
        await init_db()
        # Operation -> handler now lives with the readings themselves
        # (src/ai_reading/__init__.py); the queue contract is unchanged.
        async with reading_jobs.lifecycle(pool, ai_reading.JOB_HANDLERS), payments.lifecycle(pool), \
                audit.lifecycle(pool):
            yield
    finally:
        await pool.close()


app = FastAPI(lifespan=lifespan)
# Outermost, so replays and 409s short-circuit before any routing runs.
app.add_middleware(IdempotencyMiddleware)

async def _graphql_context(request: Request) -> dict:
    # Expose the incoming request so resolvers can read the gateway-injected
    # x-user-id header (JWT-derived identity; the gateway strips any spoofed
    # value and sets it from the verified token).
    return {"request": request}


class MaskUnexpectedErrors(MaskErrors):
    """Only errors this API meant to say reach the client.

    A resolver that raises NotAuthorized or ValueError is speaking to the
    person — "Not authorized for this parcel", "Lower the share" — and that text
    is the contract every client already renders. Anything else is an internal
    fault, and graphql-core's default is to serialize its str() into
    errors[].message: psycopg connection strings, KMS failure text, JWKS URLs,
    straight into a browser toast on an Aadhaar-holding system. Those become one
    generic line plus a reference, with the real exception in the server log.
    """

    def __init__(self) -> None:
        super().__init__(should_mask_error=self._unexpected)

    @staticmethod
    def _unexpected(error) -> bool:
        original = getattr(error, "original_error", None)
        # Parse/validation errors carry no original exception and no internals.
        return original is not None and not isinstance(original, (NotAuthorized, ValueError))

    def anonymise_error(self, error):
        ref = uuid.uuid4().hex[:12]
        _log.error("graphql.unexpected_error ref=%s field=%s: %r",
                   ref, ".".join(str(p) for p in (error.path or [])),
                   getattr(error, "original_error", None))
        masked = super().anonymise_error(error)
        masked.message = f"Something went wrong at our end (ref {ref})"
        return masked


# A GraphQL document is an arbitrary graph walk: ParcelType.owners ->
# PassbookType.parcels -> ... nests as deep as the caller asks, and each hop is
# its own query. The limits bound what one request can cost; nothing the four
# clients send comes close (the deepest shipped document is DASHBOARD_QUERY).
_MAX_QUERY_DEPTH = 12
_MAX_QUERY_ALIASES = 30
_MAX_QUERY_TOKENS = 4000

schema = strawberry.Schema(
    query=Query, mutation=Mutation,
    extensions=[
        RequireAuthenticatedRoot,
        QueryDepthLimiter(max_depth=_MAX_QUERY_DEPTH),
        MaxAliasesLimiter(max_alias_count=_MAX_QUERY_ALIASES),
        MaxTokensLimiter(max_token_count=_MAX_QUERY_TOKENS),
        MaskUnexpectedErrors(),
    ],
)
graphql_app = GraphQLRouter(schema, path="/graphql", context_getter=_graphql_context)
app.include_router(graphql_app)


_HEALTH_DB_TIMEOUT = 2.0


@app.get("/health")
async def health():
    """The load balancer's check, and the one dependency this service has.

    A constant 'healthy' kept a task in the target group with a dead pool —
    stale credentials, an exhausted RDS — answering 500s to real traffic until
    somebody noticed. One bounded SELECT 1 is the difference between a task
    that is running and a task that is working.
    """
    try:
        async with asyncio.timeout(_HEALTH_DB_TIMEOUT):
            async with pool.connection() as conn:
                await conn.execute("SELECT 1")
    except Exception as exc:  # noqa: BLE001
        _log.warning("health.database_unreachable: %r", exc)
        return JSONResponse(status_code=503,
                            content={"status": "unhealthy", "dependency": "database"})
    return {"status": "healthy"}


@app.get("/internal/audit/health")
async def audit_health(request: Request):
    """Audit pipeline state for operators and alarms (AU-5).

    Under /internal/, which the gateway's generic proxy refuses, so this is
    reachable only from inside the deployment — it reports counts and a chain
    verdict, never event content. Watch `healthy`: it goes false when the chain
    fails verification, when outbox rows are stalling, or when the backlog grows,
    which are the three ways the trail silently stops being trustworthy.
    """
    if not _internal_proxy_ok(request):
        return JSONResponse(status_code=403, content={"error": "forbidden"})
    async with pool.connection() as conn:
        return await audit.health(conn)


@app.post("/internal/audit/ingest")
async def audit_ingest(request: Request):
    """Audit events the gateway produced, onto this service's outbox.

    The gateway is the boundary that actually sees a document's bytes leave and
    a recipient token being spent, but the ledger and its outbox live here. So
    it posts the event; this route classifies and enqueues it exactly like a
    resolver's own log_audit. It answers fast and never fails a download: the
    caller sends it fire-and-forget, and a non-critical action that cannot be
    enqueued is already counted and logged inside `audit.record`.

    `resource_type` is accepted for the caller's convenience and ignored — the
    taxonomy in audit.py decides an action's resource, never the producer.
    """
    if not _internal_proxy_ok(request):
        return JSONResponse(status_code=403, content={"error": "forbidden"})
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = None
    if not isinstance(body, dict):
        return JSONResponse(status_code=400, content={"error": "expected a JSON object"})
    action = str(body.get("action") or "").strip()
    if not action:
        return JSONResponse(status_code=400, content={"error": "action is required"})
    actor_kind = str(body.get("actor_kind") or "").strip() or audit.ACTOR_SYSTEM
    metadata = body.get("metadata")
    async with pool.connection() as conn:
        await audit.record(
            conn,
            action=action,
            actor_principal=str(body.get("actor_id") or "").strip(),
            affected_owner=str(body.get("affected_owner") or "").strip(),
            resource_id=str(body.get("resource_id") or "").strip(),
            actor_kind=actor_kind,
            source_service="gateway",
            request_id=(request.headers.get("x-request-id") or "").strip(),
            metadata=metadata if isinstance(metadata, dict) else None,
        )
    return {"ok": True}


@app.post("/cron/inactivity-check")
async def cron_inactivity_check(request: Request):
    """Daily household-safeguard pass. The endpoint itself fails closed even if
    startup configuration was bypassed for local development."""
    secret = os.getenv("CRON_SECRET", "").strip()
    supplied = request.headers.get("x-cron-secret", "")
    if not secret:
        return JSONResponse(status_code=503, content={"error": "cron not configured"})
    if not hmac.compare_digest(supplied, secret):
        return JSONResponse(status_code=403, content={"error": "forbidden"})
    async with pool.connection() as conn:
        summary = await _run_inactivity_check(conn, datetime.now(timezone.utc))
    return {"ok": True, "summary": summary}


# ── Village maps ──────────────────────────────────────────────────────
#
# The shipped maps are built at the desk (scripts/village-map-import.py) and
# served by Vite out of apps/web/public/vm. These three routes are the other
# way in: the owner has a KMZ on their laptop and no reason to know what a
# terminal is. Same parser (services/api/src/village_map.py), so a village
# uploaded here and the same village built there cannot come out different.

_VM_ONE_MAX = 12 * 1024 * 1024      # a 2,729-plot village zips to 0.5 MB
_VM_TOTAL_MAX = 32 * 1024 * 1024


@app.get("/village-maps")
async def village_maps_index():
    """Which village maps have been uploaded. The browser merges these with
    the shipped /vm/index.json, preferring these — re-uploading a village is
    how you correct one."""
    async with pool.connection() as conn:
        cur = await conn.execute(
            "SELECT key, village, file_name, plots, source_name, created_at,"
            " acres, centre_lat, centre_lon, outline FROM village_maps ORDER BY village")
        rows = await cur.fetchall()
    out = []
    for r in rows:
        try:
            outline = json.loads(r.get("outline") or "[]")
        except ValueError:
            outline = []
        out.append({
            "key": r["key"], "village": r["village"], "file": r["file_name"],
            "plots": r["plots"], "source": r["source_name"],
            "uploadedOn": r["created_at"], "uploaded": True,
            "acres": r.get("acres") or 0,
            "centre": [r.get("centre_lat") or 0, r.get("centre_lon") or 0],
            "outline": outline,
        })
    return out


@app.get("/village-maps/{file_name}")
async def village_map_file(file_name: str):
    """The plots themselves. Served as a plain JSON body rather than through
    GraphQL: it is up to a megabyte of geometry, it never changes once
    uploaded, and the browser should be free to cache it like any other file."""
    async with pool.connection() as conn:
        cur = await conn.execute(
            "SELECT geojson FROM village_maps WHERE file_name=%s", (file_name,))
        row = await cur.fetchone()
    if not row:
        return JSONResponse(status_code=404, content={"error": "no such village map"})
    return Response(content=row["geojson"], media_type="application/json",
                    headers={"Cache-Control": "public, max-age=300"})


@app.delete("/village-maps/{key}")
async def village_map_delete(key: str, request: Request):
    """Remove an uploaded village map.

    A village map is shared reference data: every account sees the same one, so
    unlike a khata it has no owner predicate to scope the delete. This route had
    none at all, which made "any account can wipe the cadastre" a single DELETE.
    The uploader may remove their own; anyone else must be a platform admin.
    """
    uid = _uid_from_request(request)
    if not uid:
        return JSONResponse(status_code=401, content={"error": "authentication required"})
    async with pool.connection() as conn:
        row = await (await conn.execute(
            "SELECT village, uploaded_by FROM village_maps WHERE key=%s", (key,))).fetchone()
        if not row:
            return JSONResponse(status_code=404, content={"error": "no such village map"})
        if (row["uploaded_by"] or "") != uid and not await web360._is_admin(conn, uid):
            return JSONResponse(status_code=403, content={
                "error": "someone else uploaded this village map"})
        async with conn.transaction():
            await conn.execute("DELETE FROM village_maps WHERE key=%s", (key,))
            await log_audit(conn, uid, "delete_village_map", key, row["village"])
    return {"removed": row["village"]}


@app.post("/village-maps")
async def village_map_upload(request: Request, files: List[UploadFile] = File(...)):
    """Take one or more KML/KMZ files and turn them into village maps.

    More than one on purpose. The department's older exports split a village
    in two — the polygons in one file, their numbers in another as label
    points — and neither half is usable alone: the first is 219 shapes all
    called "Burada Palem", the second is 219 numbers floating over nothing.
    Sent together they are grouped by village and matched, exactly as the
    command-line importer does it, and the same village sent twice replaces
    itself rather than stacking a second copy.

    Re-uploading is how a village is corrected, so an upload that lands on a
    village somebody else uploaded is an overwrite of shared reference data:
    that one is for the uploader or a platform admin, and it is audited."""
    uid = _uid_from_request(request)
    if not uid:
        return JSONResponse(status_code=401, content={"error": "authentication required"})

    sources, skipped, total = [], [], 0
    for up in files:
        name = up.filename or "file"
        if not name.lower().endswith((".kml", ".kmz")):
            skipped.append({"name": name, "why": "not a KML or KMZ"})
            continue
        data = await up.read()
        total += len(data)
        if len(data) > _VM_ONE_MAX or total > _VM_TOTAL_MAX:
            skipped.append({"name": name, "why": "too large"})
            continue
        try:
            sources.append(village_map.Source(name, data))
        except Exception as exc:
            skipped.append({"name": name, "why": str(exc) or "could not be read"})

    if not sources:
        return JSONResponse(status_code=400, content={
            "error": "Nothing here could be read as a village map.",
            "skipped": skipped})

    groups: dict = {}
    for src in sources:
        groups.setdefault(src.key, []).append(src)

    out = []
    async with pool.connection() as conn:
        admin = await web360._is_admin(conn, uid)
        for key in sorted(groups, key=lambda k: groups[k][0].village):
            group = groups[key]
            built, src, others = village_map.assemble(group)
            if not built:
                skipped.append({"name": ", ".join(s.name for s in group),
                                "why": "no plot polygons in it"})
                continue
            collection, dropped, clashes = village_map.feature_collection(
                src.village, built["plots"])
            plots = len(collection["features"])
            if not plots:
                # Every shape in it is anonymous. Usually one half of a split
                # export; say so, because "0 plots" alone reads as a bad file.
                skipped.append({
                    "name": src.name,
                    "why": ("its shapes carry no plot numbers — this export keeps "
                            "them in a separate label file, so send both together")})
                continue

            cur = await conn.execute(
                "SELECT village, uploaded_by FROM village_maps WHERE key=%s", (key,))
            existing = await cur.fetchone()
            replaced = bool(existing)
            if existing and (existing["uploaded_by"] or "") != uid and not admin:
                skipped.append({"name": src.name,
                                "why": "someone else uploaded this village map"})
                continue
            over = village_map.overview_of(collection)
            async with conn.transaction():
                await conn.execute(
                    "INSERT INTO village_maps (key, village, file_name, source_name,"
                    " plots, geojson, uploaded_by, created_at, acres, centre_lat,"
                    " centre_lon, outline)"
                    " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"
                    " ON CONFLICT (key) DO UPDATE SET village=EXCLUDED.village,"
                    " file_name=EXCLUDED.file_name, source_name=EXCLUDED.source_name,"
                    " plots=EXCLUDED.plots, geojson=EXCLUDED.geojson,"
                    " uploaded_by=EXCLUDED.uploaded_by, created_at=EXCLUDED.created_at,"
                    " acres=EXCLUDED.acres, centre_lat=EXCLUDED.centre_lat,"
                    " centre_lon=EXCLUDED.centre_lon, outline=EXCLUDED.outline",
                    (key, src.village, village_map.file_name(src.village), src.name,
                     plots, village_map.dumps(collection), uid,
                     datetime.now().isoformat(timespec="seconds"),
                     over["acres"], over["centre"][0], over["centre"][1],
                     json.dumps(over["outline"], separators=(",", ":"))))
                await log_audit(conn, uid, "upload_village_map", key,
                                f"{src.village} · {plots} plots"
                                + (" · replaced" if replaced else ""))
            out.append({
                "key": key, "village": src.village, "plots": plots,
                "file": village_map.file_name(src.village), "from": src.name,
                "replaced": replaced, "within": built["within"], "near": built["near"],
                "dropped": dropped, "clashes": clashes,
                "duplicates": [{"name": o.name,
                                "why": "labels only" if not o.plots
                                       else "same village, less complete"}
                               for o in others],
            })

    if not out:
        return JSONResponse(status_code=400, content={
            "error": "No village came out of that.", "skipped": skipped})
    return {"villages": out, "skipped": skipped}


from .ai_reading import jobs as reading_jobs
app.include_router(reading_jobs.router)
# Every AI document reading (prompts, provider adapter, cost accounting,
# consent gate) lives in src/ai_reading; these are the same paths as before.
from . import ai_reading
app.include_router(ai_reading.router)
from . import capabilities
app.include_router(capabilities.router)
from . import payments
app.include_router(payments.router)

from . import account
account.bind(pool)
app.include_router(account.router)
