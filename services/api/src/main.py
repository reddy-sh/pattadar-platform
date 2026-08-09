import os
import re
import csv
import ssl
import uuid
import json
import base64
import asyncio
import hashlib
import logging
import httpx
import strawberry
from . import notify
from datetime import date, datetime
from typing import Optional, List
from contextlib import asynccontextmanager

_log = logging.getLogger("pattadar")

from fastapi import FastAPI, Request, UploadFile, File
from fastapi.responses import JSONResponse
from strawberry.fastapi import GraphQLRouter
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

DSN = os.getenv(
    "APP_PG_DSN",
    "host=localhost port=5432 dbname=pattadar user=rhub password=rhub-dev-pwd",
)

pool = AsyncConnectionPool(
    conninfo=DSN,
    min_size=1,
    max_size=10,
    open=False,
    kwargs={"row_factory": dict_row, "autocommit": True},
)


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


@strawberry.type
class GroupType:
    id: str
    owner_user_id: str
    type: str
    name: str
    description: str
    my_role: str = ""
    member_count: int = 0
    land_count: int = 0
    total_extent: float = 0.0
    total_share: float = 0.0
    created_at: str = ""


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
        return (info.context["request"].headers.get("x-user-id") or "").strip()
    except Exception:
        return ""


def _mask_aadhaar(raw: str) -> str:
    """Masked reference token (last 4 digits) — the only form ever shown in a
    list, an export, or to anyone but the owner. If the input is already masked
    / non-numeric, pass through."""
    digits = "".join(c for c in (raw or "") if c.isdigit())
    if len(digits) >= 8:
        return "XXXX-XXXX-" + digits[-4:]
    return (raw or "").strip()


# ── Aadhaar number at rest ────────────────────────────────────────────────
# The full number is retained at the owner's explicit instruction (27 Jul 2026)
# so it can be copied into government portals. It is ALWAYS encrypted at rest
# and is never returned by any list query — only by an explicit single-record
# lookup by the owner, which is audited.
#
# Key: AADHAAR_ENC_KEY, a urlsafe-base64 32-byte Fernet key. If it is absent we
# refuse to store the number rather than fall back to plaintext.
def _aadhaar_cipher():
    key = os.getenv("AADHAAR_ENC_KEY", "").strip()
    if not key:
        return None
    try:
        from cryptography.fernet import Fernet

        return Fernet(key.encode())
    except Exception as exc:  # noqa: BLE001
        _log.error("aadhaar.key_invalid: %r", exc)
        return None


def encrypt_aadhaar(raw: str) -> str:
    """Ciphertext for storage, or '' when there is nothing to store. Raises if
    a number was supplied but no key is configured — failing closed beats
    silently writing an identity number in the clear."""
    digits = "".join(c for c in (raw or "") if c.isdigit())
    if len(digits) != 12:
        return ""
    cipher = _aadhaar_cipher()
    if cipher is None:
        raise ValueError(
            "Aadhaar storage is not configured on this server (AADHAAR_ENC_KEY missing)"
        )
    return cipher.encrypt(digits.encode()).decode()


def decrypt_aadhaar(token: str) -> str:
    if not (token or "").strip():
        return ""
    cipher = _aadhaar_cipher()
    if cipher is None:
        return ""
    try:
        return cipher.decrypt(token.encode()).decode()
    except Exception as exc:  # noqa: BLE001
        _log.warning("aadhaar.decrypt_failed: %r", exc)
        return ""


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

async def log_audit(conn, actor: str, action: str, target: str, details: str = ""):
    await conn.execute(
        "INSERT INTO audit_events (id, actor, action, target, details, timestamp) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        (new_id(), actor, action, target, details, datetime.utcnow().isoformat()),
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
    sh = (await (await conn.execute(
        "SELECT COALESCE(SUM(share_pct),0) AS s FROM family_members "
        "WHERE group_id=%s AND is_beneficiary=true AND status <> 'revoked'", (gid,))).fetchone())["s"]
    myrole = (await (await conn.execute(
        "SELECT role FROM family_members WHERE group_id=%s AND owner_user_id=%s AND is_self=true LIMIT 1",
        (gid, uid))).fetchone() or {}).get("role", "")
    return GroupType(id=gid, owner_user_id=g["owner_user_id"], type=g["type"], name=g["name"],
                     description=g.get("description", ""), my_role=myrole or _group_primary_role(g["type"]),
                     member_count=int(mc), land_count=int(lc), total_extent=float(ext or 0),
                     total_share=float(sh or 0), created_at=g.get("created_at", ""))


# ── Query ─────────────────────────────────────────────────────────────

@strawberry.type
class Query:
    @strawberry.field
    async def passbooks(self, info: strawberry.Info) -> List[PassbookType]:
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM passbooks WHERE owner_user_id = %s ORDER BY created_at DESC", (uid,)
            )
            return [to_type(PassbookType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def parcels(self, info: strawberry.Info) -> List[ParcelType]:
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM parcels WHERE passbook_id IN "
                "(SELECT id FROM passbooks WHERE owner_user_id = %s) ORDER BY created_at DESC", (uid,)
            )
            return [to_type(ParcelType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def properties(self, info: strawberry.Info) -> List[PropertyType]:
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM properties WHERE owner_user_id = %s ORDER BY created_at DESC", (uid,))
            return [to_type(PropertyType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def property(self, info: strawberry.Info, id: str) -> Optional[PropertyType]:
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM properties WHERE id=%s AND owner_user_id=%s", (id, uid))
            row = await cur.fetchone()
            return to_type(PropertyType, row) if row else None

    @strawberry.field
    async def projects(self, info: strawberry.Info) -> List[ProjectType]:
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM projects WHERE owner_user_id = %s ORDER BY created_at DESC", (uid,))
            return [to_type(ProjectType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def property_owners(self, info: strawberry.Info, property_id: str) -> List[PropertyOwnerType]:
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM passbooks WHERE id=%s AND owner_user_id=%s", (id, uid))
            row = await cur.fetchone()
            return to_type(PassbookType, row) if row else None

    @strawberry.field
    async def parcels_by_passbook(self, info: strawberry.Info, passbook_id: str) -> List[ParcelType]:
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM parcels WHERE passbook_id=%s AND passbook_id IN "
                "(SELECT id FROM passbooks WHERE owner_user_id=%s) ORDER BY survey_no", (passbook_id, uid))
            return [to_type(ParcelType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def parcel(self, info: strawberry.Info, id: str) -> Optional[ParcelType]:
        """A single parcel the caller owns (for the Parcel 360 view)."""
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
    async def registered_documents(self, info: strawberry.Info) -> List[RegisteredDocumentType]:
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM registered_documents WHERE owner_user_id=%s ORDER BY created_at DESC", (uid,))
            return [to_type(RegisteredDocumentType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def registered_document(self, info: strawberry.Info, id: str) -> Optional[RegisteredDocumentType]:
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM registered_documents WHERE id=%s AND owner_user_id=%s", (id, uid))
            row = await cur.fetchone()
            return to_type(RegisteredDocumentType, row) if row else None

    @strawberry.field
    async def documents(self, info: strawberry.Info) -> List[DocumentType]:
        uid = _uid_from_info(info) or "system"
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
    async def favourites(self, info: strawberry.Info) -> List[FavouriteType]:
        """Everything this account has starred, across every kind of record."""
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM favourites WHERE owner_user_id=%s ORDER BY created_at DESC", (uid,))
            return [to_type(FavouriteType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def passbook_documents(self, info: strawberry.Info, passbook_id: str) -> List[DocumentType]:
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM documents WHERE (passbook_id=%s OR parcel_id IN (SELECT id FROM parcels WHERE passbook_id=%s)) "
                "AND %s IN (SELECT owner_user_id FROM passbooks WHERE id=%s) ORDER BY created_at DESC",
                (passbook_id, passbook_id, uid, passbook_id))
            return [to_type(DocumentType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def notes(self, info: strawberry.Info, entity_type: str, entity_id: str) -> List[NoteType]:
        """Append-only note history for a passbook / parcel / document (newest first)."""
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM notes WHERE owner_user_id=%s AND entity_type=%s AND entity_id=%s "
                "ORDER BY created_at DESC", (uid, entity_type, entity_id),
            )
            return [to_type(NoteType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def land_expenses(self, info: strawberry.Info) -> List[LandExpenseType]:
        """What has been spent, newest first."""
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM land_expenses WHERE owner_user_id=%s ORDER BY spent_on DESC, created_at DESC",
                (uid,))
            return [to_type(LandExpenseType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def work_requests(self, info: strawberry.Info,
                            include_closed: bool = True) -> List[WorkRequestType]:
        """Work asked of somebody else, open first."""
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM land_features WHERE owner_user_id=%s AND entity_type=%s "
                "AND entity_id=%s ORDER BY category, created_at", (uid, entity_type, entity_id),
            )
            return [to_type(LandFeatureType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def groups(self, info: strawberry.Info) -> List[GroupType]:
        """Groups the caller owns (v1: owner-scoped)."""
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute("SELECT * FROM groups WHERE owner_user_id=%s ORDER BY created_at", (uid,))
            rows = await cur.fetchall()
            return [await _group_summary(conn, uid, r) for r in rows]

    @strawberry.field
    async def group(self, info: strawberry.Info, id: str) -> Optional[GroupType]:
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            row = await (await conn.execute(
                "SELECT * FROM groups WHERE id=%s AND owner_user_id=%s", (id, uid))).fetchone()
            return await _group_summary(conn, uid, row) if row else None

    @strawberry.field
    async def parcel_fields(self, info: strawberry.Info, parcel_id: str = "") -> List[ParcelFieldType]:
        """Record-completeness field states. Empty parcel_id returns every
        field the caller owns, for the portfolio-wide record-health view."""
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            own = await (await conn.execute(
                "SELECT type FROM groups WHERE id=%s AND owner_user_id=%s", (group_id, uid))).fetchone()
            if not own:
                return []
            await ensure_self(conn, uid, group_id, _group_primary_role(own["type"]))
            cur = await conn.execute(
                "SELECT * FROM family_members WHERE owner_user_id=%s AND group_id=%s "
                "ORDER BY is_self DESC, created_at", (uid, group_id))
            return [to_type(PersonType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def group_activity(self, info: strawberry.Info, group_id: str) -> List[AuditEventType]:
        """Audit events relevant to a group the caller owns: the group itself, its
        members, and its passbooks. Powers the group's Activity tab."""
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            own = await (await conn.execute(
                "SELECT 1 FROM groups WHERE id=%s AND owner_user_id=%s", (group_id, uid))).fetchone()
            if not own:
                return []
            cur = await conn.execute(
                "SELECT * FROM audit_events WHERE actor=%s AND (target=%s "
                "OR target IN (SELECT id FROM family_members WHERE group_id=%s) "
                "OR target IN (SELECT id FROM passbooks WHERE group_id=%s)) "
                "ORDER BY timestamp DESC LIMIT 50", (uid, group_id, group_id, group_id))
            return [to_type(AuditEventType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def invitations(self, info: strawberry.Info) -> List[InvitationType]:
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM invitations WHERE scope_id IN "
                "(SELECT id FROM passbooks WHERE owner_user_id = %s "
                " UNION SELECT id FROM parcels WHERE passbook_id IN "
                " (SELECT id FROM passbooks WHERE owner_user_id = %s)) ORDER BY created_at DESC", (uid, uid)
            )
            return [to_type(InvitationType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def pending_invitations(self) -> List[InvitationType]:
        async with pool.connection() as conn:
            cur = await conn.execute("SELECT * FROM invitations WHERE status='pending' ORDER BY created_at DESC")
            return [to_type(InvitationType, r) for r in await cur.fetchall()]

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
        uid = _uid_from_info(info) or "guest"
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
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM notification_log WHERE owner_user_id=%s ORDER BY created_at DESC LIMIT %s",
                (uid, max(1, min(limit, 200))))
            return [to_type(NotificationLogType, r) for r in await cur.fetchall()]

    @strawberry.field
    async def notifiers(self, info: strawberry.Info, group_id: str) -> List[NotifierType]:
        """The ordered inactivity-notifier list for a group. If none is configured,
        returns every member at priority 0 (meaning: all notified at once)."""
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            own = await (await conn.execute(
                "SELECT 1 FROM groups WHERE id=%s AND owner_user_id=%s", (group_id, uid))).fetchone()
            if not own:
                return []
            members = {m["id"]: m for m in await (await conn.execute(
                "SELECT id, name, relation, role, phone, email FROM family_members "
                "WHERE owner_user_id=%s AND group_id=%s AND is_self=false", (uid, group_id))).fetchall()}
            rows = await (await conn.execute(
                "SELECT member_id, priority FROM family_notifiers WHERE owner_user_id=%s AND group_id=%s "
                "ORDER BY priority", (uid, group_id))).fetchall()
            def _mk(mid, prio):
                m = members.get(mid)
                if not m:
                    return None
                return NotifierType(member_id=mid, name=m["name"] or "", relation=m["relation"] or m["role"] or "",
                                    contact=(m["email"] or m["phone"] or ""), priority=prio)
            if rows:
                out = [_mk(r["member_id"], r["priority"]) for r in rows]
                return [n for n in out if n]
            # Default: everyone, priority 0 (all-at-once).
            return [n for n in (_mk(mid, 0) for mid in members) if n]

    @strawberry.field
    async def audit_events(self, info: strawberry.Info, target: str = "") -> List[AuditEventType]:
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM audit_events WHERE actor=%s ORDER BY timestamp DESC LIMIT 10", (uid,)
            )
            return [to_type(AuditEventType, r) for r in await cur.fetchall()]

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
        uid = _uid_from_info(info) or "system"
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
    async def users(self) -> List[UserType]:
        async with pool.connection() as conn:
            cur = await conn.execute("SELECT * FROM users ORDER BY name")
            return [to_type(UserType, r) for r in await cur.fetchall()]


# ── Mutation ──────────────────────────────────────────────────────────

async def _write_person(conn, uid, pid, v, is_update):
    """Insert/update a person row from validated args `v` (a dict). Enforces the
    per-parcel/per-group ≤100% share guard, masks Aadhaar, derives is_minor, and
    creates a verification invite the first time someone becomes a beneficiary."""
    minor = _is_minor(v["dob"])
    if v["is_beneficiary"]:
        contact = (v["email"] or v["phone"]).strip()
        if not contact:
            raise ValueError("Add a mobile number or email so this beneficiary can be verified")
        if minor and not (v["guardian_name"] or "").strip():
            raise ValueError("A minor needs a guardian to verify on their behalf")
        if (v["marital_status"] or "").lower() == "married" and not (v["spouse_name"] or "").strip():
            raise ValueError("Please add the spouse for a married beneficiary")
    aad = _mask_aadhaar(v["aadhaar"]) if (v["aadhaar"] or "").strip() else ""
    aad_enc = encrypt_aadhaar(v["aadhaar"]) if (v["aadhaar"] or "").strip() else ""
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
    if is_update and not (v["aadhaar"] or "").strip():
        cols.pop("aadhaar_masked", None)
        cols.pop("aadhaar_enc", None)
    if is_update:
        _self = await (await conn.execute(
            "SELECT is_self FROM family_members WHERE id=%s AND owner_user_id=%s", (pid, uid))).fetchone()
        if _self and _self["is_self"]:
            raise ValueError("Your own node can't be edited here")
        sets = ", ".join(f"{k}=%s" for k in cols)
        cur = await conn.execute(f"UPDATE family_members SET {sets} WHERE id=%s AND owner_user_id=%s RETURNING *",
                                 (*cols.values(), pid, uid))
    else:
        cols2 = dict(id=pid, owner_user_id=uid, created_at=datetime.utcnow().isoformat(), invite_status="", **cols)
        keys = ", ".join(cols2); ph = ", ".join(["%s"] * len(cols2))
        cur = await conn.execute(f"INSERT INTO family_members ({keys}) VALUES ({ph}) RETURNING *", tuple(cols2.values()))
    row = await cur.fetchone()
    if not row:
        raise NotAuthorized("Not authorized for this person")
    # Verification invite on first-time beneficiary (no token yet + contact present).
    if v["is_beneficiary"] and not (row.get("invite_token") or "").strip():
        token = str(uuid.uuid4())
        invitee = (v["guardian_contact"].strip() if minor else (v["email"] or v["phone"]).strip())
        channel = "email" if "@" in invitee else "phone"
        await conn.execute("UPDATE family_members SET invite_token=%s, status='pending', invite_channel=%s WHERE id=%s", (token, channel, pid))
        await conn.execute(
            "INSERT INTO invitations (id, scope_type, scope_id, role, invitee_contact, token, expiry, status, created_at) "
            "VALUES (%s, 'beneficiary', %s, %s, %s, %s, '', 'pending', %s)",
            (new_id(), pid, v["kind"] or "coowner", invitee, token, datetime.utcnow().isoformat()))
        row["invite_token"] = token; row["status"] = "pending"
    return to_type(PersonType, row)


async def _verify_by_token(info, token: str) -> "BeneficiaryType":
    """Accept a verification invite (via its token) — flips the member/beneficiary
    to 'verified'. Token-based so the invitee can accept. Shared by the
    verify_beneficiary (public link) and verify_member mutations."""
    token = (token or "").strip()
    if not token:
        raise ValueError("Invalid or expired verification link")
    async with pool.connection() as conn:
        cur = await conn.execute(
            "UPDATE family_members SET status='verified', "
            "email_verified = (email_verified OR invite_channel='email'), "
            "phone_verified = (phone_verified OR invite_channel='phone') "
            "WHERE invite_token=%s AND invite_token <> '' RETURNING *", (token,))
        row = await cur.fetchone()
        if not row:
            cur = await conn.execute(
                "UPDATE beneficiaries SET status='verified' WHERE invite_token=%s AND invite_token <> '' RETURNING *", (token,))
            row = await cur.fetchone()
        if not row:
            raise ValueError("Invalid or expired verification link")
        await conn.execute("UPDATE invitations SET status='accepted' WHERE token=%s", (token,))
        out = dict(row)
        out.setdefault("person_name", out.get("name") or "")
        out.setdefault("person_contact", out.get("phone") or out.get("email") or "")
        out.setdefault("relationship", out.get("relation") or "")
        await log_audit(conn, row.get("owner_user_id") or "system", "verify_beneficiary", row["id"],
                        f"{out['person_name']} verified")
        return to_type(BeneficiaryType, out)


async def _do_update_member_status(info, id: str, status: str) -> "BeneficiaryType":
    """Set a member/beneficiary's verification status, owner-scoped. Shared by the
    update_beneficiary_status and update_member_status mutations."""
    uid = _uid_from_info(info) or "system"
    async with pool.connection() as conn:
        cur = await conn.execute(
            "UPDATE family_members SET status=%s WHERE id=%s AND owner_user_id=%s RETURNING *",
            (status, id, uid))
        row = await cur.fetchone()
        if row:
            await conn.execute(
                "UPDATE beneficiaries SET status=%s WHERE id=%s AND (owner_user_id=%s OR parcel_id IN "
                "(SELECT id FROM parcels WHERE passbook_id IN "
                "(SELECT id FROM passbooks WHERE owner_user_id=%s)))",
                (status, id, uid, uid))
            await log_audit(conn, uid, "update_beneficiary_status", id, f"Status -> {status}")
            out = dict(row)
            out.setdefault("person_name", out.get("name") or "")
            out.setdefault("person_contact", out.get("phone") or out.get("email") or "")
            out.setdefault("relationship", out.get("relation") or "")
            return to_type(BeneficiaryType, out)
        cur = await conn.execute(
            "UPDATE beneficiaries SET status=%s WHERE id=%s AND (owner_user_id=%s OR parcel_id IN "
            "(SELECT id FROM parcels WHERE passbook_id IN "
            "(SELECT id FROM passbooks WHERE owner_user_id=%s))) RETURNING *",
            (status, id, uid, uid))
        row = await cur.fetchone()
        if not row:
            raise NotAuthorized("Not authorized for this beneficiary")
        await log_audit(conn, uid, "update_beneficiary_status", id, f"Status -> {status}")
        return to_type(BeneficiaryType, row)


# ── Inactivity dead-man's-switch engine (Phase 3) ──────────────────────────

def _inactivity_cfg():
    """Thresholds in days (env-overridable for testing)."""
    return (
        int(os.getenv("INACTIVITY_CHECKIN_DAYS", "150")),    # start nudging the head
        int(os.getenv("INACTIVITY_ESCALATE_DAYS", "180")),   # escalate to family
        int(os.getenv("INACTIVITY_PRIORITY_GAP_DAYS", "7")),  # gap between priorities
    )


def _days_since(iso: str, now: datetime) -> float:
    # Fail-safe: no recorded activity → treat as ACTIVE (0), never escalate on a
    # missing/unparseable timestamp. The dead-man's-switch only fires on evidence
    # of real inactivity — otherwise a fresh deploy (everyone's clock empty) would
    # escalate every family at once.
    if not iso:
        return 0.0
    try:
        return (now - datetime.fromisoformat(iso)).total_seconds() / 86400.0
    except Exception:
        return 0.0


async def _alert_member(conn, member_id: str, subject: str, body: str, owner: str) -> bool:
    m = await (await conn.execute(
        "SELECT name, COALESCE(NULLIF(email,''), phone) AS contact FROM family_members WHERE id=%s",
        (member_id,))).fetchone()
    if not m or not (m.get("contact") or "").strip():
        return False
    await notify.notify_contact(conn, m["contact"], subject, body, owner=owner)
    return True


async def _run_inactivity_check(conn, now: datetime, only_owner: str = "") -> dict:
    """One pass of the dead-man's-switch. For each family group whose head (owner)
    is inactive: nudge the head in the check-in window; past the escalate window,
    alert the notifier list (staggered by priority) or everyone if no order is set.
    Idempotent per run via stage + last_notified_at gating."""
    checkin_days, escalate_days, gap_days = _inactivity_cfg()
    summary = {"checked": 0, "nudged": 0, "escalated": 0}
    base = os.getenv("APP_PUBLIC_URL", "").rstrip("/")
    q = ("SELECT g.id AS gid, g.owner_user_id AS owner, g.name AS gname, "
         "COALESCE(u.last_active_at,'') AS last_active "
         "FROM groups g LEFT JOIN users u ON u.id = g.owner_user_id WHERE g.type='family'")
    params: list = []
    if only_owner:
        q += " AND g.owner_user_id=%s"
        params.append(only_owner)
    for g in await (await conn.execute(q, params)).fetchall():
        owner, gid = g["owner"], g["gid"]
        if not owner:
            continue
        summary["checked"] += 1
        idle = _days_since(g["last_active"], now)
        if idle < checkin_days:
            continue
        esc = await (await conn.execute(
            "SELECT * FROM inactivity_escalations WHERE owner_user_id=%s AND group_id=%s", (owner, gid))).fetchone()
        if esc and esc.get("acknowledged") and idle < escalate_days:
            continue
        token = (esc or {}).get("ack_token") or str(uuid.uuid4())
        link = f"{base}/active/{token}"

        async def _set_state(stage: str, prio: int, _esc=esc, _owner=owner, _gid=gid, _token=token):
            if _esc:
                await conn.execute(
                    "UPDATE inactivity_escalations SET stage=%s, current_priority=%s, last_notified_at=%s, updated_at=%s "
                    "WHERE owner_user_id=%s AND group_id=%s",
                    (stage, prio, now.isoformat(), now.isoformat(), _owner, _gid))
            else:
                await conn.execute(
                    "INSERT INTO inactivity_escalations (id, owner_user_id, group_id, stage, current_priority, "
                    "last_notified_at, acknowledged, ack_token, created_at, updated_at) "
                    "VALUES (%s,%s,%s,%s,%s,%s,false,%s,%s,%s)",
                    (new_id(), _owner, _gid, stage, prio, now.isoformat(), _token, now.isoformat(), now.isoformat()))

        if idle < escalate_days:
            # Check-in window: nudge the head to prove they're active.
            if esc and esc["stage"] == "checkin" and _days_since(esc["last_notified_at"], now) < gap_days:
                continue
            head = await (await conn.execute(
                "SELECT COALESCE(NULLIF(email,''),'') AS email FROM users WHERE id=%s", (owner,))).fetchone()
            to = (head or {}).get("email") or owner
            await notify.notify_contact(
                conn, to, "Are you still active? — Pattadar",
                f"We haven't seen activity on your Pattadar account recently. Tap to confirm you're active, "
                f"otherwise your family will be notified: {link}", owner=owner)
            await _set_state("checkin", 0)
            summary["nudged"] += 1
            continue

        # Escalate window (>= escalate_days).
        if esc and esc.get("acknowledged"):
            continue
        notifiers = await (await conn.execute(
            "SELECT member_id, priority FROM family_notifiers WHERE owner_user_id=%s AND group_id=%s ORDER BY priority",
            (owner, gid))).fetchall()
        subject = f"Family alert — {g['gname']}"
        body = (f"The head of {g['gname']} on Pattadar has been inactive for over 6 months. "
                f"Please check on them. Acknowledge here: {link}")
        if not notifiers:
            # Default: notify ALL members once.
            if esc and esc["stage"] == "escalate_all":
                continue
            for m in await (await conn.execute(
                    "SELECT id FROM family_members WHERE owner_user_id=%s AND group_id=%s AND is_self=false",
                    (owner, gid))).fetchall():
                await _alert_member(conn, m["id"], subject, body, owner)
            await _set_state("escalate_all", 0)
            summary["escalated"] += 1
            continue
        # Staggered: advance one priority at a time, gap_days apart.
        if esc and esc["stage"] == "escalate" and _days_since(esc["last_notified_at"], now) < gap_days:
            continue
        cur_prio = (esc or {}).get("current_priority", 0) or 0
        nxt = next((n for n in notifiers if n["priority"] > cur_prio), None)
        if not nxt:
            continue  # exhausted the notifier list
        await _alert_member(conn, nxt["member_id"], subject, body, owner)
        await _set_state("escalate", nxt["priority"])
        summary["escalated"] += 1
    return summary


@strawberry.type
class Mutation:
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            # CL-547: read the name BEFORE the row is gone — an audit entry that
            # cannot say what it deleted is not an audit entry.
            doomed = await (await conn.execute(
                "SELECT pattadar_no, village FROM passbooks WHERE id=%s AND owner_user_id=%s", (id, uid))).fetchone()
            cur = await conn.execute("DELETE FROM passbooks WHERE id=%s AND owner_user_id=%s", (id, uid))
            deleted = cur.rowcount > 0
            if deleted:
                # No DB-level FK cascade — remove the passbook's parcels + their
                # ownership history so a delete doesn't leave orphaned rows.
                await conn.execute(
                    "DELETE FROM parcel_owners WHERE parcel_id IN (SELECT id FROM parcels WHERE passbook_id=%s)", (id,))
                await conn.execute("DELETE FROM parcels WHERE passbook_id=%s", (id,))
                await log_audit(conn, uid, "delete_passbook", id, _named(
                    "Khata", (doomed or {}).get("pattadar_no"), (doomed or {}).get("village")))
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
        uid = _uid_from_info(info) or "system"
        pid = new_id()
        now = datetime.utcnow()
        async with pool.connection() as conn:
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
        pid = new_id()
        now = datetime.utcnow()
        async with pool.connection() as conn:
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
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
        uid = _uid_from_info(info) or "system"
        now = datetime.utcnow()
        async with pool.connection() as conn:
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
        address: str = "", aadhaar: str = "",
    ) -> UserType:
        """Apply KYC read from the owner's own Aadhaar.

        Writes BOTH the account profile and every `is_self` family-member row,
        so the owner appears in their groups with the same name, age and ID as
        anyone else — the account and the group record are two views of one
        person, and they used to drift apart.

        Every argument is optional: only non-empty values are written, so a
        partial accept from the review screen never blanks a field.
        """
        uid = _uid_from_info(info) or "guest"
        masked = _mask_aadhaar(aadhaar) if (aadhaar or "").strip() else ""
        enc = encrypt_aadhaar(aadhaar) if (aadhaar or "").strip() else ""
        async with pool.connection() as conn:
            await conn.execute(
                "INSERT INTO users (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING", (uid, uid))
            sets, vals = [], []
            if (name or "").strip():
                sets.append("name=%s"); vals.append(name.strip())
            if (address or "").strip():
                sets.append("address=%s"); vals.append(address.strip())
            if masked:
                sets.append("kyc_ref_masked=%s"); vals.append(masked)
                sets.append("kyc_ref_enc=%s"); vals.append(enc)
            if sets:
                await conn.execute(
                    f"UPDATE users SET {', '.join(sets)} WHERE id=%s", (*vals, uid))

            msets, mvals = [], []
            for col, val in (("name", name), ("dob", dob), ("gender", gender),
                             ("present_address", address)):
                if (val or "").strip():
                    msets.append(f"{col}=%s"); mvals.append(val.strip())
            if masked:
                msets.append("aadhaar_masked=%s"); mvals.append(masked)
                msets.append("aadhaar_enc=%s"); mvals.append(enc)
            if msets:
                await conn.execute(
                    f"UPDATE family_members SET {', '.join(msets)} "
                    "WHERE owner_user_id=%s AND is_self=TRUE", (*mvals, uid))

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
        uid = _uid_from_info(info) or "guest"
        async with pool.connection() as conn:
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
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            row = await (await conn.execute(
                "SELECT kyc_ref_enc FROM users WHERE id=%s", (uid,))).fetchone()
            full = decrypt_aadhaar(row["kyc_ref_enc"]) if row else ""
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
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            row = await (await conn.execute(
                "SELECT aadhaar_enc, name FROM family_members WHERE id=%s AND owner_user_id=%s",
                (id, uid))).fetchone()
            if not row:
                raise NotAuthorized("Not authorized for this member")
            full = decrypt_aadhaar(row["aadhaar_enc"])
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            # A parcel has no village of its own — the village belongs to its
            # passbook. Reading it straight off `parcels` raised UndefinedColumn
            # and broke deletion outright.
            doomed = await (await conn.execute(
                "SELECT p.survey_no, pb.village FROM parcels p "
                "JOIN passbooks pb ON pb.id = p.passbook_id "
                "WHERE p.id=%s AND pb.owner_user_id=%s", (id, uid))).fetchone()
            cur = await conn.execute(
                "DELETE FROM parcels WHERE id=%s AND passbook_id IN "
                "(SELECT id FROM passbooks WHERE owner_user_id=%s)", (id, uid)
            )
            deleted = cur.rowcount > 0
            if deleted:
                await conn.execute("DELETE FROM parcel_owners WHERE parcel_id=%s", (id,))
                await log_audit(conn, uid, "delete_parcel", id, _named(
                    "Survey", (doomed or {}).get("survey_no"), (doomed or {}).get("village")))
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
    ) -> DocumentType:
        uid = _uid_from_info(info) or "system"
        did = new_id()
        async with pool.connection() as conn:
            # parcel OR passbook may be empty — a doc can be uploaded now and linked later
            if parcel_id:
                await _assert_owns_parcel(conn, uid, parcel_id)
            elif passbook_id:
                await _assert_owns_passbook(conn, uid, passbook_id)
            elif property_id:
                await _assert_owns_property(conn, uid, property_id)
            cur = await conn.execute(
                "INSERT INTO documents (id, parcel_id, passbook_id, property_id, owner_user_id, doc_type, file_ref, doc_no, sro_code, reg_year, version, source, tags, created_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *",
                (did, parcel_id, passbook_id, property_id, uid, doc_type, file_ref, doc_no, sro_code, reg_year, 1, source, tags, datetime.utcnow().isoformat()),
            )
            row = await cur.fetchone()
            await log_audit(conn, uid, "upload_document", parcel_id or passbook_id or did, "Uploaded a document")
            return to_type(DocumentType, row)

    @strawberry.mutation
    async def delete_document(self, info: strawberry.Info, id: str) -> bool:
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT parcel_id, passbook_id FROM documents WHERE id=%s AND (owner_user_id=%s "
                "OR parcel_id IN (SELECT id FROM parcels WHERE passbook_id IN (SELECT id FROM passbooks WHERE owner_user_id=%s)) "
                "OR passbook_id IN (SELECT id FROM passbooks WHERE owner_user_id=%s))", (id, uid, uid, uid))
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
    async def update_document_link(
        self, info: strawberry.Info, id: str, parcel_id: str, passbook_id: str
    ) -> Optional[DocumentType]:
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            # Must already own the row (via its current parcel/passbook, or as uploader).
            cur = await conn.execute(
                "SELECT 1 FROM documents WHERE id=%s AND (owner_user_id=%s "
                "OR parcel_id IN (SELECT id FROM parcels WHERE passbook_id IN "
                "(SELECT id FROM passbooks WHERE owner_user_id=%s)) "
                "OR passbook_id IN (SELECT id FROM passbooks WHERE owner_user_id=%s))",
                (id, uid, uid, uid))
            if not await cur.fetchone():
                return None
            # New target(s) must be owned too — check each independently so a
            # caller cannot slip an unowned passbook past a parcel-only check.
            if parcel_id:
                await _assert_owns_parcel(conn, uid, parcel_id)
            if passbook_id:
                await _assert_owns_passbook(conn, uid, passbook_id)
            cur = await conn.execute(
                "UPDATE documents SET parcel_id=%s, passbook_id=%s WHERE id=%s RETURNING *",
                (parcel_id, passbook_id, id))
            row = await cur.fetchone()
            await log_audit(conn, uid, "link_document", parcel_id or passbook_id or id, "Linked a document")
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
        uid = _uid_from_info(info) or "system"
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
                 guardian_name, guardian_contact, token, aadhaar_masked, gender, photo),
            )
            row = await cur.fetchone()
            # Verification invite — the beneficiary/guardian accepts via this token.
            await conn.execute(
                "INSERT INTO invitations (id, scope_type, scope_id, role, invitee_contact, token, expiry, status, created_at) "
                "VALUES (%s, 'beneficiary', %s, %s, %s, %s, '', 'pending', %s)",
                (new_id(), bid, kind, invitee or contact, token, datetime.utcnow().isoformat()),
            )
            await log_audit(conn, uid, "add_beneficiary", bid, f"{person_name} ({kind}) — invite sent, pending verification")
            return to_type(BeneficiaryType, row)

    @strawberry.mutation
    async def verify_beneficiary(self, info: strawberry.Info, token: str) -> BeneficiaryType:
        return await _verify_by_token(info, token)

    @strawberry.mutation
    async def verify_member(self, info: strawberry.Info, token: str) -> BeneficiaryType:
        return await _verify_by_token(info, token)

    @strawberry.mutation
    async def add_note(self, info: strawberry.Info, entity_type: str, entity_id: str, body: str) -> NoteType:
        """Append a note to a passbook / parcel / document. Append-only history."""
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
        rid = new_id()
        async with pool.connection() as conn:
            cur = await conn.execute(
                "INSERT INTO work_requests (id, owner_user_id, kind, title, entity_type, "
                "entity_id, assignee, cost, stage, needs_you, note, due_date, closed, created_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,0,FALSE,%s,%s,FALSE,%s) RETURNING *",
                (rid, uid, kind, title, entity_type, entity_id, assignee, cost,
                 note, due_date, datetime.utcnow().isoformat()),
            )
            row = await cur.fetchone()
            await log_audit(conn, uid, "add_work_request", rid, title)
            return to_type(WorkRequestType, row)

    @strawberry.mutation
    async def update_work_request(
        self, info: strawberry.Info, id: str, stage: Optional[int] = None,
        assignee: Optional[str] = None, cost: Optional[float] = None,
        needs_you: Optional[bool] = None, note: Optional[str] = None,
        due_date: Optional[str] = None, closed: Optional[bool] = None,
    ) -> WorkRequestType:
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute("DELETE FROM notes WHERE id=%s AND owner_user_id=%s", (id, uid))
            return cur.rowcount > 0

    @strawberry.mutation
    async def set_passbook_photo(self, info: strawberry.Info, id: str, photo: str) -> bool:
        """Set (or clear) the passbook's profile photo — a client-cropped data-URL."""
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute(
                "UPDATE family_members SET name=%s, relation=%s, gender=%s, dob=%s, phone=%s, email=%s, bio=%s, is_beneficiary=%s, share_pct=%s, photo=%s "
                "WHERE id=%s AND owner_user_id=%s RETURNING *",
                (name, relation, gender, dob, phone, email, bio, is_beneficiary, share_pct, photo, id, uid),
            )
            row = await cur.fetchone()
            if not row:
                raise NotAuthorized("Not authorized for this family member")
            return to_type(FamilyMemberType, row)

    @strawberry.mutation
    async def delete_family_member(self, info: strawberry.Info, id: str) -> bool:
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute("DELETE FROM family_members WHERE id=%s AND owner_user_id=%s", (id, uid))
            return cur.rowcount > 0

    @strawberry.mutation
    async def set_family_member_photo(self, info: strawberry.Info, id: str, photo: str) -> bool:
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute("UPDATE family_members SET photo=%s WHERE id=%s AND owner_user_id=%s", (photo, id, uid))
            return cur.rowcount > 0

    @strawberry.mutation
    async def invite_family_member(self, info: strawberry.Info, id: str, role: str = "view") -> FamilyMemberType:
        """Invite a family member to create their account. Records the invitation
        and flags the member as invited."""
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
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
                "VALUES (%s, 'family', %s, %s, %s, %s, '', 'pending', %s)",
                (iid, id, role, invitee, token, datetime.utcnow().isoformat()),
            )
            cur = await conn.execute(
                "UPDATE family_members SET invite_status='invited' WHERE id=%s AND owner_user_id=%s RETURNING *", (id, uid))
            await log_audit(conn, uid, "invite_family_member", id, f"To {invitee}")
            return to_type(FamilyMemberType, await cur.fetchone())

    # ---- Groups (typed land-holding entities) ------------------------------
    @strawberry.mutation
    async def create_group(self, info: strawberry.Info, type: str, name: str, description: str = "") -> GroupType:
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute(
                "UPDATE groups SET name=%s, description=%s, updated_at=%s WHERE id=%s AND owner_user_id=%s RETURNING *",
                (name.strip(), description.strip(), datetime.utcnow().isoformat(), id, uid))
            row = await cur.fetchone()
            if not row:
                raise NotAuthorized("Not authorized for this group")
            return await _group_summary(conn, uid, row)

    @strawberry.mutation
    async def delete_group(self, info: strawberry.Info, id: str) -> bool:
        """Delete a group, its members, and unassign its passbooks (land goes back
        to personal, never deleted)."""
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            g = await (await conn.execute("SELECT name FROM groups WHERE id=%s AND owner_user_id=%s", (id, uid))).fetchone()
            if not g:
                return False
            await conn.execute("UPDATE passbooks SET group_id='' WHERE group_id=%s AND owner_user_id=%s", (id, uid))
            await conn.execute("DELETE FROM family_members WHERE group_id=%s AND owner_user_id=%s", (id, uid))
            cur = await conn.execute("DELETE FROM groups WHERE id=%s AND owner_user_id=%s", (id, uid))
            await log_audit(conn, uid, "delete_group", id, _named("", g["name"]))
            return cur.rowcount > 0

    @strawberry.mutation
    async def assign_land_to_group(self, info: strawberry.Info, passbook_id: str, group_id: str) -> bool:
        """Assign a passbook (and its parcels) to a group, or to '' for personal."""
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
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
        uid = _uid_from_info(info) or "system"
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
        guardian_name: str = "", guardian_contact: str = "", marital_status: str = "",
        spouse_name: str = "", spouse_contact: str = "", spouse_status: str = "",
    ) -> PersonType:
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            g = await (await conn.execute(
                "SELECT type FROM groups WHERE id=%s AND owner_user_id=%s", (group_id, uid))).fetchone()
            if not g:
                raise NotAuthorized("Not authorized for this group")
            v = dict(name=name, relation=relation, role=role, group_id=group_id, gender=gender, dob=dob,
                     phone=phone, email=email, bio=bio, photo=photo, father_id=father_id, mother_id=mother_id,
                     spouse_id=spouse_id, is_beneficiary=is_beneficiary, share_pct=share_pct, kind=kind,
                     parcel_id=parcel_id, present_address=present_address, aadhaar=aadhaar,
                     guardian_name=guardian_name, guardian_contact=guardian_contact,
                     marital_status=marital_status, spouse_name=spouse_name, spouse_contact=spouse_contact,
                     spouse_status=spouse_status)
            pid = new_id()
            res = await _write_person(conn, uid, pid, v, is_update=False)
            await log_audit(conn, uid, "add_member", pid, f"{role or relation}: {name}")
            return res

    @strawberry.mutation
    async def update_member(
        self, info: strawberry.Info, id: str, name: str, relation: str = "other", role: str = "",
        gender: str = "", dob: str = "", phone: str = "", email: str = "", bio: str = "", photo: str = "",
        father_id: str = "", mother_id: str = "", spouse_id: str = "", is_beneficiary: bool = False,
        share_pct: float = 0.0, kind: str = "", parcel_id: str = "", present_address: str = "", aadhaar: str = "",
        guardian_name: str = "", guardian_contact: str = "", marital_status: str = "",
        spouse_name: str = "", spouse_contact: str = "", spouse_status: str = "",
    ) -> PersonType:
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            gid = (await (await conn.execute(
                "SELECT group_id FROM family_members WHERE id=%s AND owner_user_id=%s", (id, uid))).fetchone() or {}).get("group_id", "")
            v = dict(name=name, relation=relation, role=role, group_id=gid, gender=gender, dob=dob,
                     phone=phone, email=email, bio=bio, photo=photo, father_id=father_id, mother_id=mother_id,
                     spouse_id=spouse_id, is_beneficiary=is_beneficiary, share_pct=share_pct, kind=kind,
                     parcel_id=parcel_id, present_address=present_address, aadhaar=aadhaar,
                     guardian_name=guardian_name, guardian_contact=guardian_contact,
                     marital_status=marital_status, spouse_name=spouse_name, spouse_contact=spouse_contact,
                     spouse_status=spouse_status)
            return await _write_person(conn, uid, id, v, is_update=True)

    @strawberry.mutation
    async def remove_member(self, info: strawberry.Info, id: str) -> bool:
        """Delete a person and null any genealogy edges pointing at them. The 'self'
        node cannot be deleted."""
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            s = await (await conn.execute("SELECT is_self, name FROM family_members WHERE id=%s AND owner_user_id=%s", (id, uid))).fetchone()
            if not s:
                return False
            if s["is_self"]:
                raise ValueError("You can't remove your own node")
            await conn.execute("UPDATE family_members SET father_id='' WHERE father_id=%s AND owner_user_id=%s", (id, uid))
            await conn.execute("UPDATE family_members SET mother_id='' WHERE mother_id=%s AND owner_user_id=%s", (id, uid))
            await conn.execute("UPDATE family_members SET spouse_id='' WHERE spouse_id=%s AND owner_user_id=%s", (id, uid))
            cur = await conn.execute("DELETE FROM family_members WHERE id=%s AND owner_user_id=%s", (id, uid))
            await log_audit(conn, uid, "remove_member", id, _named("", s["name"]))
            return cur.rowcount > 0

    @strawberry.mutation
    async def set_member_photo(self, info: strawberry.Info, id: str, photo: str) -> bool:
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute("UPDATE family_members SET photo=%s WHERE id=%s AND owner_user_id=%s", (photo, id, uid))
            return cur.rowcount > 0

    @strawberry.mutation
    async def invite_member(self, info: strawberry.Info, id: str, role: str = "view") -> PersonType:
        """Invite a person: records the invitation, sends it via the notify seam
        (email or WhatsApp/SMS — stub-logged until providers are configured), and
        flags the member 'invited'. The channel is remembered so accepting the
        invite marks that channel verified."""
        uid = _uid_from_info(info) or "system"
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
            token = (m.get("invite_token") or "").strip() or str(uuid.uuid4())
            base = os.getenv("APP_PUBLIC_URL", "").rstrip("/")
            link = f"{base}/verify/{token}"
            await conn.execute(
                "INSERT INTO invitations (id, scope_type, scope_id, role, invitee_contact, token, expiry, status, created_at) "
                "VALUES (%s, 'family', %s, %s, %s, %s, '', 'pending', %s)",
                (new_id(), id, role, invitee, token, datetime.utcnow().isoformat()))
            name = (m.get("name") or "there").strip() or "there"
            subject = "Please confirm your family/heir details — Pattadar"
            body = (f"Hi {name}, you've been listed as a beneficiary/heir on Pattadar land records. "
                    f"Please confirm your details here: {link}")
            send = await notify.notify_contact(conn, invitee, subject, body, owner=uid)
            cur = await conn.execute(
                "UPDATE family_members SET invite_status='invited', status='pending', invite_token=%s, invite_channel=%s "
                "WHERE id=%s AND owner_user_id=%s RETURNING *", (token, channel, id, uid))
            await log_audit(conn, uid, "invite_member", id, f"Invited {invitee} via {send.get('channel', channel)}")
            return to_type(PersonType, await cur.fetchone())

    @strawberry.mutation
    async def set_notifiers(self, info: strawberry.Info, group_id: str, member_ids: List[str]) -> List[NotifierType]:
        """Replace a group's ordered inactivity-notifier list. Order in `member_ids`
        is the priority (1st = Priority 1). Empty list clears it (→ notify everyone)."""
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            own = await (await conn.execute(
                "SELECT 1 FROM groups WHERE id=%s AND owner_user_id=%s", (group_id, uid))).fetchone()
            if not own:
                raise NotAuthorized("Not authorized for this group")
            await conn.execute("DELETE FROM family_notifiers WHERE owner_user_id=%s AND group_id=%s", (uid, group_id))
            now = datetime.utcnow().isoformat()
            for i, mid in enumerate(member_ids):
                await conn.execute(
                    "INSERT INTO family_notifiers (id, owner_user_id, group_id, member_id, priority, created_at) "
                    "VALUES (%s,%s,%s,%s,%s,%s)", (new_id(), uid, group_id, mid, i + 1, now))
            await log_audit(conn, uid, "set_notifiers", group_id, f"{len(member_ids)} notifier(s)")
            rows = await (await conn.execute(
                "SELECT member_id, priority FROM family_notifiers WHERE owner_user_id=%s AND group_id=%s ORDER BY priority",
                (uid, group_id))).fetchall()
            mem = {m["id"]: m for m in await (await conn.execute(
                "SELECT id, name, relation, role, phone, email FROM family_members WHERE owner_user_id=%s AND group_id=%s",
                (uid, group_id))).fetchall()}
            out = []
            for r in rows:
                m = mem.get(r["member_id"])
                if m:
                    out.append(NotifierType(member_id=r["member_id"], name=m["name"] or "",
                                            relation=m["relation"] or m["role"] or "",
                                            contact=(m["email"] or m["phone"] or ""), priority=r["priority"]))
            return out

    @strawberry.mutation
    async def send_test_notification(self, info: strawberry.Info, to: str) -> str:
        """Send a test message to `to` (email or phone) via the notify seam — use it
        to validate a newly configured provider. Records to notification_log like any
        real send; returns the provider/channel result as JSON."""
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            summary = await _run_inactivity_check(conn, datetime.utcnow(), only_owner=uid)
        return json.dumps(summary)

    @strawberry.mutation
    async def acknowledge_inactivity(self, info: strawberry.Info, token: str) -> bool:
        """Tap-to-confirm from a check-in nudge or family alert — stops escalation
        and (for the head) proves activity by resetting last_active_at."""
        token = (token or "").strip()
        if not token:
            return False
        async with pool.connection() as conn:
            row = await (await conn.execute(
                "UPDATE inactivity_escalations SET acknowledged=true, updated_at=%s WHERE ack_token=%s RETURNING owner_user_id",
                (datetime.utcnow().isoformat(), token))).fetchone()
            if not row:
                return False
            await conn.execute("UPDATE users SET last_active_at=%s WHERE id=%s",
                               (datetime.utcnow().isoformat(), row["owner_user_id"]))
            return True

    @strawberry.mutation
    async def set_member_share(self, info: strawberry.Info, id: str, share_pct: float) -> PersonType:
        """Set a member's share % (heir), enforcing the group/parcel ≤100% guard."""
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute(
                "UPDATE invitations SET status=%s WHERE id=%s AND (scope_id IN "
                "(SELECT id FROM passbooks WHERE owner_user_id=%s) OR scope_id IN "
                "(SELECT id FROM parcels WHERE passbook_id IN (SELECT id FROM passbooks WHERE owner_user_id=%s))) RETURNING *",
                (status, id, uid, uid),
            )
            row = await cur.fetchone()
            if not row:
                raise NotAuthorized("Not authorized for this invitation")
            await log_audit(conn, uid, "update_invitation_status", id, f"Status -> {status}")
            return to_type(InvitationType, row)

    @strawberry.mutation
    async def delete_invitation(self, info: strawberry.Info, id: str) -> bool:
        """Invitations have no owner_user_id of their own — ownership is derived
        from scope_id, covering every scope_type actually written by the
        invite-creating mutations: passbook, parcel, document, family
        (family_members), beneficiary (family_members or the legacy
        beneficiaries table)."""
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
            cur = await conn.execute(
                "DELETE FROM invitations WHERE id=%s AND ("
                "scope_id IN (SELECT id FROM passbooks WHERE owner_user_id=%s) "
                "OR scope_id IN (SELECT id FROM parcels WHERE passbook_id IN (SELECT id FROM passbooks WHERE owner_user_id=%s)) "
                "OR scope_id IN (SELECT id FROM documents WHERE owner_user_id=%s) "
                "OR scope_id IN (SELECT id FROM family_members WHERE owner_user_id=%s) "
                "OR scope_id IN (SELECT id FROM beneficiaries WHERE owner_user_id=%s)"
                ")",
                (id, uid, uid, uid, uid, uid))
            deleted = cur.rowcount > 0
            if deleted:
                await log_audit(conn, uid, "delete_invitation", id)
            return deleted

    @strawberry.mutation
    async def create_registered_document(self, info: strawberry.Info, file_ref: str, payload: str) -> RegisteredDocumentType:
        """Create a registered document from the extracted (possibly edited) JSON
        payload; its `parties` become document_parties rows."""
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
        now = datetime.utcnow()
        async with pool.connection() as conn:
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
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
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
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
        uid = _uid_from_info(info) or "system"
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
    async def delete_registered_document(self, info: strawberry.Info, id: str) -> bool:
        uid = _uid_from_info(info) or "system"
        async with pool.connection() as conn:
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
        uid = _uid_from_info(info) or "guest"
        clean_name = (name or "").strip()
        clean_email = (email or "").strip()
        async with pool.connection() as conn:
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
        uid = _uid_from_info(info) or "guest"
        masked = _mask_aadhaar(kyc_ref)
        kyc_enc = encrypt_aadhaar(kyc_ref) if (kyc_ref or "").strip() else ""
        async with pool.connection() as conn:
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


async def init_db() -> None:
    async with pool.connection() as conn:
        # Serialize concurrent worker startups: the pod runs `uvicorn --workers N`
        # and every worker runs init_db on boot. Pool is autocommit, so hold a
        # SESSION-level advisory lock across ALL of init_db — otherwise workers
        # race on DDL for a newly-added table (pg_type_typname_nsp_index) or on
        # the reference-data PKs (e.g. mandals_pkey). Released at the end of init_db.
        await conn.execute("SELECT pg_advisory_lock(918273645)")
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
        await conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_escalation_owner_group ON inactivity_escalations(owner_user_id, group_id)")

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
        # Ciphertext only — the masked token stays in aadhaar_masked for display.
        await conn.execute(
            "ALTER TABLE family_members ADD COLUMN IF NOT EXISTS aadhaar_enc TEXT NOT NULL DEFAULT ''")
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
        await conn.execute("SELECT pg_advisory_unlock(918273645)")


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
        yield
    finally:
        await pool.close()


app = FastAPI(lifespan=lifespan)

async def _graphql_context(request: Request) -> dict:
    # Expose the incoming request so resolvers can read the gateway-injected
    # x-user-id header (JWT-derived identity; the gateway strips any spoofed
    # value and sets it from the verified token).
    return {"request": request}


schema = strawberry.Schema(query=Query, mutation=Mutation)
graphql_app = GraphQLRouter(schema, path="/graphql", context_getter=_graphql_context)
app.include_router(graphql_app)


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.post("/cron/inactivity-check")
async def cron_inactivity_check(request: Request):
    """Daily dead-man's-switch pass over ALL heads (wired to a k8s CronJob). Guarded
    by the CRON_SECRET header when that env is set."""
    secret = os.getenv("CRON_SECRET", "")
    if secret and request.headers.get("x-cron-secret", "") != secret:
        return JSONResponse(status_code=403, content={"error": "forbidden"})
    async with pool.connection() as conn:
        summary = await _run_inactivity_check(conn, datetime.utcnow())
    return {"ok": True, "summary": summary}


# ── AI Passbook Importer ──────────────────────────────────────────────
# The "Passbook Importer" AI task (prompts/ai-tasks/passbook-importer.yaml):
# the user uploads a passbook document / screenshot / PDF and a vision LLM
# extracts the location + pattadar fields to prefill the Create Passbook form.

# Vision OCR of bilingual (Telugu + English) land records: haiku hallucinates
# Telugu-script names (invents a different name every run at "medium/high"
# confidence). Sonnet reads the Telugu names correctly and stably. Used by BOTH
# the passbook importer and the registered-document importer below.
_IMPORT_MODEL = "claude-sonnet-5"
# The acres-cents convention, stated ONCE for every extraction prompt.
# It was written into one prompt and not the others, and the drift cost a
# real user 24.75 acres on screen: "Ac 25-00" read as "25.00 cents".
_EXTENT_NOTATION_RULE = (
    "EXTENT NOTATION — AP deeds write land in ACRES AND CENTS with a hyphen: \"Ac 25-00\", "
    "\"ఎ. 25-30\", \"య.25.00సెంట్లు\" all mean X acres plus YY cents, where 100 cents = 1 acre. "
    "\"Ac 25-00\" is TWENTY-FIVE ACRES, not 25.00 cents; \"య.25.00సెంట్లు లేక 10.00హె\" is 25 acres "
    "(≈10 hectares confirms it). When the schedule uses this notation, write the extent as decimal "
    "acres with the unit \"acres\"/\"Acres\": 25.00 acres. Write \"cents\"/\"Cents\" ONLY when the "
    "land is genuinely measured in cents alone (a house site of \"5 cents\" with no acre figure). "
    "Cross-check against any hectare restatement: 1 acre ≈ 0.4047 ha. Misreading acres as cents "
    "shrinks somebody's land a hundredfold.\n"
)

_IMPORT_SYSTEM = (
    _EXTENT_NOTATION_RULE
    +     "You are a data-extraction assistant for an Andhra Pradesh (India) land-records "
    "application. You are given an image or PDF of a land passbook / khata / ROR-1B / "
    "Meebhoomi document, often bilingual (English + Telugu). Extract the passbook header "
    "AND every land-parcel row (each survey / sub-division line), and return ONLY a "
    "compact JSON object (no markdown, no code fences, no commentary):\n"
    '{"state":"<state in English e.g. Andhra Pradesh>","district":"<district in English>",'
    '"mandal":"<mandal in English>","village":"<village in English>",'
    '"pattadar_no":"<khata/pattadar number>","owner_name":"<pattadar name (column 2) in English>",'
    '"father_husband_name":"<father/husband name (column 4, tandri/bharta peru) in English>",'
    '"parcels":[{"survey_no":"<survey number>","subdivision":"<sub-division or empty>",'
    '"extent":<number>,"unit":"Acres-Guntas","classification":"<agri|non-agri>",'
    '"acquisition_source":"<sale|gift|inheritance|partition|will|grant>"}],'
    '"confidence":"<high|medium|low>"}\n'
    "Rules:\n"
    '- owner_name = pattadar name (column 2) ONLY; never append the father/husband '
    "name to it — that goes in father_husband_name.\n"
    '- One parcel object per survey/sub-division row. A cell like "183-1" means '
    'survey_no "183", subdivision "1".\n'
    "- extent = the numeric area from the extent/vistirnam column, as a decimal number.\n"
    '- classification: agricultural land (metta/dry or magani/wet) => "agri"; '
    'house-site / commercial => "non-agri"; default "agri".\n'
    '- acquisition_source: konugolu/purchase => "sale", varasatvam => "inheritance", '
    'bahumati => "gift", vibhajana => "partition", veelunama => "will", manjuru => "grant".\n'
    "- Prefer English transliteration of Telugu names; use \"\"/[]/0 for missing fields; "
    "never invent values; the state is almost always Andhra Pradesh or Telangana.\n"
    "Output MUST be valid JSON and nothing else."
)


def _extract_json(text: str) -> dict:
    """Pull the JSON object out of the model output (tolerate code fences / prose)."""
    t = (text or "").strip()
    a, b = t.find("{"), t.rfind("}")
    if a >= 0 and b > a:
        t = t[a:b + 1]
    try:
        return json.loads(t)
    except Exception:
        return {}


# These AI-import routes call the Anthropic Messages API directly over httpx
# (no anthropic SDK dependency). Each call already opens its own private
# httpx.AsyncClient for a single request and tears it down immediately after —
# there is no module-level/shared client or connection pool reused across
# requests. `SSLV3_ALERT_BAD_RECORD_MAC` here is therefore not a concurrent-
# use-of-one-connection bug; it's an intermittent TLS/transport fault on an
# otherwise-private connection (large multi-MB base64 image/PDF bodies over a
# long egress path are more exposed to this than small requests). httpx
# surfaces it as an exception raised OUT OF client.post() — meaning no
# httpx.Response was ever returned/parsed, so the model never completed a
# round trip for that attempt. That makes a retry of the whole call safe: we
# are not re-running a request that already reached the model and is still
# in flight, we're re-attempting one that never got a response at all.
# Retry ONLY on faults where no usable response was received. A fresh TCP+TLS
# connection is built per attempt (see _post_with_retry). Deliberately EXCLUDES
# httpx.ReadTimeout / httpx.PoolTimeout: a read timeout can mean the model is
# still generating an expensive, non-idempotent response, and re-running it would
# double-charge and re-issue an in-flight call — the same reason the istio route
# for these paths sets retries=0. ssl.SSLError (e.g. SSLV3_ALERT_BAD_RECORD_MAC)
# is kept explicitly as defense-in-depth in case it surfaces unwrapped.
_TRANSIENT_CONNECTION_ERRORS = (
    ssl.SSLError,
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.WriteError,
    httpx.ReadError,
    httpx.RemoteProtocolError,
)



def _ai_failure_message(exc: Exception, size_bytes: int) -> str:
    """A sentence the user can act on.

    `f"AI call failed: {e}"` produced literally "AI call failed: " for an
    httpx.ReadError, whose str() is empty — a red error naming nothing. Network
    faults on this path are almost always payload size: a 13 MB scan becomes an
    18 MB base64 upload, and the connection dies partway through.
    """
    mb = size_bytes / (1024 * 1024)
    kind = type(exc).__name__
    transport = isinstance(exc, _TRANSIENT_CONNECTION_ERRORS)
    if transport and mb >= 6:
        return (f"The connection dropped while sending this {mb:.0f} MB file "
                f"({kind}). Large scans often fail — photograph the pages that "
                f"carry the details, or use a smaller PDF.")
    if transport:
        return f"The connection to the AI service dropped ({kind}). Try again."
    detail = str(exc).strip()
    return f"AI call failed ({kind}){f': {detail}' if detail else ''}"


async def _post_with_retry(url: str, *, headers: dict, json_body: dict, timeout: float,
                            max_attempts: int = 4) -> httpx.Response:
    """POST with retry on transient connection/TLS faults (SSLV3_ALERT_BAD_RECORD_MAC,
    reset connections, etc). Builds a FRESH httpx.AsyncClient — a fresh TCP+TLS
    connection — on every attempt instead of retrying over the same connection, so a
    corrupted/half-broken connection is never reused for the retry."""
    for attempt in range(1, max_attempts + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                return await client.post(url, headers=headers, json=json_body)
        except _TRANSIENT_CONNECTION_ERRORS:
            if attempt == max_attempts:
                raise
            # Backs off further each time: a 13 MB upload that dropped needs
            # more than a moment before the next attempt is worth making.
            await asyncio.sleep(1.5 * attempt)  # 1.5s, 3s, 4.5s
    raise AssertionError("unreachable")  # loop always returns or re-raises


@app.post("/import-passbook")
async def import_passbook(file: UploadFile = File(...)):
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return JSONResponse(status_code=503, content={"error": "AI import is not configured"})
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        return JSONResponse(status_code=413, content={"error": "File too large (max 8 MB)"})
    mime = (file.content_type or "").lower()
    name = (file.filename or "").lower()
    b64 = base64.standard_b64encode(data).decode()
    if mime == "application/pdf" or name.endswith(".pdf"):
        block = {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": b64}}
    elif mime.startswith("image/"):
        block = {"type": "image", "source": {"type": "base64", "media_type": mime, "data": b64}}
    else:
        return JSONResponse(status_code=400, content={"error": "Upload a PDF, JPG or PNG"})
    payload = {
        "model": _IMPORT_MODEL,
        # Output is pure JSON and you only pay for what is produced, so the
        # ceiling is set by the longest document, not the typical one. At 3000
        # a 14 MB multi-page deed stopped mid-object (stop_reason=max_tokens)
        # and the app prefilled nothing.
        # The model reasons before answering, and that reasoning is billed against
        # max_tokens. On a 14 MB deed it spent 8228 tokens thinking — more than the
        # entire 8000 ceiling — so the JSON was cut off mid-object and the app was
        # told the document "ran out of room". The ceiling now comfortably exceeds
        # thinking + answer, and effort=medium cuts the thinking (and the wait, 132s
        # to 53s) without changing a single extracted value.
        "max_tokens": 16000,
        "output_config": {"effort": "medium"},
        "system": _IMPORT_SYSTEM,
        "messages": [{"role": "user", "content": [
            block,
            {"type": "text", "text": "Extract the passbook fields and return ONLY the JSON object."},
        ]}],
    }
    try:
        r = await _post_with_retry(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json_body=payload,
            timeout=200,
        )
    except httpx.TimeoutException:
        _log.warning("AI extract timed out (file=%s, model=%s)", file.filename or "", _IMPORT_MODEL)
        return JSONResponse(status_code=504, content={"error": "AI took too long to read this document (timed out). Try again or enter details manually."})
    except Exception as e:
        _log.warning("AI extract failed (file=%s, bytes=%d): %r", file.filename or "", len(data), e)
        return JSONResponse(status_code=502, content={"error": _ai_failure_message(e, len(data))})
    if r.status_code != 200:
        _log.warning("AI extract non-200 (file=%s, status=%s): %s", file.filename or "", r.status_code, (r.text or '')[:300])
        return JSONResponse(status_code=502, content={"error": f"The AI service refused this file (HTTP {r.status_code}). {(r.text or '')[:160]}"})
    body = r.json()
    text = "".join(b.get("text", "") for b in body.get("content", []) if b.get("type") == "text").strip()
    fields = _extract_json(text)
    # Running out of room is a budget problem, not a bad document — so try once
    # more with the model reasoning less, which leaves far more of the ceiling
    # for the answer. Only worth doing when that is demonstrably what happened.
    if (not fields) and body.get("stop_reason") == "max_tokens":
        _log.info("AI extract hit the ceiling (file=%s) — retrying with lower effort", file.filename or "")
        retry = dict(payload)
        retry["output_config"] = {"effort": "low"}
        try:
            r2 = await _post_with_retry(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json_body=retry,
                timeout=200,
            )
            if r2.status_code == 200:
                body = r2.json()
                text = "".join(b.get("text", "") for b in body.get("content", []) if b.get("type") == "text").strip()
                fields = _extract_json(text)
        except Exception as e:
            _log.warning("AI extract low-effort retry failed (file=%s): %r", file.filename or "", e)
    if not text or not fields:
        # An empty or unparseable reply used to be returned as a 200 with
        # {"fields": {}} — the app then prefilled nothing and the form sat there
        # looking untouched, which reads as "the button did nothing". A document
        # we could not read is a failure and must say so.
        _log.warning(
            "AI extract produced nothing (file=%s, bytes=%d, stop_reason=%s, text_len=%d)",
            file.filename or "", len(data), body.get("stop_reason"), len(text),
        )
        msg = ("This passbook is long enough that the reading ran out of room. Photograph just the "
               "pages with the details, or enter them by hand."
               if body.get("stop_reason") == "max_tokens" else
               "Nothing could be read from this passbook. It may be a scan of photographs rather "
               "than text — try a clearer copy, or enter the details by hand.")
        return JSONResponse(status_code=502, content={"error": msg})
    return {"fields": fields, "raw": text}


# ── AI Aadhaar (KYC) classifier ───────────────────────────────────────
# Reads an Aadhaar card image/PDF and extracts the KYC fields to prefill the
# Add-Beneficiary form. The raw doc is mirrored to the user's My Drive by the UI.
_AADHAAR_SYSTEM = (
    "You are a KYC data-extraction assistant. You are given an image or PDF of an Indian "
    "Aadhaar card (front and/or back), often bilingual (English + a regional script). "
    "Extract ONLY these fields and return ONLY a compact JSON object (no markdown, no code "
    "fences, no commentary):\n"
    '{"name":"<full name in English>","dob":"<date of birth as YYYY-MM-DD>",'
    '"gender":"<male|female|other>","aadhaar":"<12-digit Aadhaar number, digits only>",'
    '"address":"<full address exactly as printed, single line>","confidence":"<high|medium|low>"}\n'
    "Rules:\n"
    "- dob MUST be strict YYYY-MM-DD; if only a year of birth is printed, use YYYY-01-01.\n"
    "- aadhaar MUST be exactly 12 digits with no spaces; never invent or guess digits — "
    'if unreadable leave it "".\n'
    "- gender lowercased (male/female/other).\n"
    '- Prefer English transliteration; use "" for any missing field.\n'
    '- If the file is NOT an Aadhaar card, return every field empty with confidence "low".\n'
    "Output MUST be valid JSON and nothing else."
)


def _sniff_image_mime(data: bytes) -> str:
    """Real media type from magic bytes; '' when it is not a known image."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    # HEIC/HEIF carry an ISO-BMFF brand; the vision API cannot read them, so
    # naming them here lets the caller fail with a sentence instead of a 400.
    if data[4:8] == b"ftyp" and data[8:12] in (b"heic", b"heix", b"hevc", b"mif1", b"msf1"):
        return "image/heic"
    return ""


async def _anthropic_extract(data: bytes, mime: str, name: str, system: str, user_text: str, max_mb: int = 8, max_tokens: int = 1024, effort: str = "medium") -> dict:
    """Shared vision-extraction call: base64 → Claude → parsed JSON. Returns
    {"fields", "raw"} or {"_error": (status, message)}. `max_mb`/`max_tokens` let a
    caller with larger scans (e.g. multi-page property docs) raise the defaults."""
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return {"_error": (503, "AI extraction is not configured")}
    if len(data) > max_mb * 1024 * 1024:
        return {"_error": (413, f"File too large (max {max_mb} MB)")}
    b64 = base64.standard_b64encode(data).decode()
    mime = (mime or "").lower(); name = (name or "").lower()
    # Trust the BYTES, not the client's label. Pickers and share sheets happily
    # hand over a PNG named .jpg, or a generic octet-stream, and forwarding that
    # verbatim earns a flat 400 from the vision API ("appears to be a image/png
    # image") that surfaces to the user as an unexplained failure.
    sniffed = _sniff_image_mime(data)
    if sniffed:
        mime = sniffed
    if mime == "application/pdf" or name.endswith(".pdf"):
        block = {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": b64}}
    elif mime.startswith("image/"):
        block = {"type": "image", "source": {"type": "base64", "media_type": mime, "data": b64}}
    else:
        return {"_error": (400, "Upload a PDF, JPG or PNG")}
    payload = {
        "model": _IMPORT_MODEL, "max_tokens": max_tokens, "system": system,
        "output_config": {"effort": effort},
        "messages": [{"role": "user", "content": [block, {"type": "text", "text": user_text}]}],
    }
    try:
        r = await _post_with_retry(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json_body=payload,
            timeout=200,
        )
    except httpx.TimeoutException:
        _log.warning("AI extract timed out (file=%s, model=%s)", name, _IMPORT_MODEL)
        return {"_error": (504, "AI took too long to read this document (timed out). It may be large or multi-page — try again, or use 'enter details manually'.")}
    except Exception as e:
        _log.warning("AI extract failed (file=%s, bytes=%d): %r", name, len(data), e)
        return {"_error": (502, _ai_failure_message(e, len(data)))}
    if r.status_code != 200:
        _log.warning("AI extract non-200 (file=%s, status=%s): %s", name, r.status_code, (r.text or '')[:300])
        return {"_error": (502, "AI call failed")}
    body = r.json()
    text = "".join(b.get("text", "") for b in body.get("content", []) if b.get("type") == "text").strip()
    fields = _extract_json(text)
    # Running out of room is a budget problem, not a bad document — so try once
    # more with the model reasoning less, which leaves far more of the ceiling
    # for the answer. Only worth doing when that is demonstrably what happened.
    if (not fields) and body.get("stop_reason") == "max_tokens":
        _log.info("AI extract hit the ceiling (file=%s) — retrying with lower effort", name)
        retry = dict(payload)
        retry["output_config"] = {"effort": "low"}
        try:
            r2 = await _post_with_retry(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json_body=retry,
                timeout=200,
            )
            if r2.status_code == 200:
                body = r2.json()
                text = "".join(b.get("text", "") for b in body.get("content", []) if b.get("type") == "text").strip()
                fields = _extract_json(text)
        except Exception as e:
            _log.warning("AI extract low-effort retry failed (file=%s): %r", name, e)
    if not text or not fields:
        # An empty or unparseable reply used to be returned as a 200 with
        # {"fields": {}} — the app then prefilled nothing and the form sat there
        # looking untouched, which reads as "the button did nothing". A document
        # we could not read is a failure and must say so.
        _log.warning(
            "AI extract produced nothing (file=%s, bytes=%d, stop_reason=%s, text_len=%d)",
            name, len(data), body.get("stop_reason"), len(text),
        )
        if body.get("stop_reason") == "max_tokens":
            return {"_error": (502, "This document is long enough that the reading ran out of room. "
                                    "Photograph just the pages with the details, or enter them by hand.")}
        return {"_error": (502, "Nothing could be read from this document. It may be a scan of "
                                "photographs rather than text — try a clearer copy, or enter the "
                                "details by hand.")}
    return {"fields": fields, "raw": text}


_PARCEL_PHOTO_SYSTEM = (
    "You screen photographs for an Andhra Pradesh land-records app. The user is attaching a "
    "picture to a PARCEL of land as evidence. Decide what the picture actually shows.\n"
    "Return ONLY a compact JSON object, no markdown or commentary:\n"
    '{"kind":"<land|document|id_document|person|screenshot|other>",'
    '"category":"<boundary|overview|crop|water|access|structure|dispute|landmark|general>",'
    '"confidence":"<high|medium|low>","reason":"<max 12 words, plain English>"}\n'
    "KIND — choose exactly one:\n"
    '  • "id_document" — Aadhaar, PAN, driving licence, passport, voter ID, ration card, or any '
    "card bearing a government identity number or a photo-ID layout. This is the most important "
    "category to get right.\n"
    '  • "document" — a printed or scanned page: deed, ROR/Adangal/1-B, passbook page, receipt, '
    "certificate, court paper, a table of text.\n"
    '  • "screenshot" — a capture of a phone or computer screen (app UI, browser, chat).\n'
    '  • "person" — a face or people are the main subject (a person incidentally standing in a '
    "field is still land).\n"
    '  • "land" — outdoor ground, fields, crops, soil, boundary or survey stones, bunds, fences, '
    "farm sheds, wells, borewells, canals, tracks and approach roads, rural buildings on the plot. "
    "IMPORTANT: bare, dry, fallow, dusty, scrubby or night-time ground IS land. Do not require it "
    "to look green or cultivated. Andhra farmland is frequently bare earth.\n"
    '  • "other" — indoor scenes, vehicles, food, pets, and anything that is none of the above.\n'
    "CATEGORY — only meaningful when kind is \"land\"; otherwise use \"general\".\n"
    "CONFIDENCE — say \"low\" whenever you are unsure. Being unsure is useful information; a "
    "confident wrong answer blocks a farmer from recording real evidence."
)


@app.post("/classify-parcel-photo")
async def classify_parcel_photo(file: UploadFile = File(...)):
    """Classify an image BEFORE it is stored (CL-600..604).

    The bytes are held in memory for the length of this call and written
    nowhere — no disk, no S3, no database. That matters most for the case this
    exists to catch: an Aadhaar card must not be persisted anywhere in order to
    discover that it should not be persisted.
    """
    data = await file.read()
    out = await _anthropic_extract(
        data, file.content_type or "", file.filename or "",
        _PARCEL_PHOTO_SYSTEM, "Classify this picture and return ONLY the JSON object.")
    if "_error" in out:
        # An image we cannot READ is not an image we can vouch for. Returning an
        # error would make the client fail open and accept it silently, which is
        # exactly wrong for the case this endpoint exists to catch. HEIC (which
        # the vision API cannot decode) and oversized files land here.
        _log.info("classify: unreadable (%s) — returning unknown", out["_error"][1])
        return {"kind": "", "category": "general", "confidence": "low",
                "reason": "could not read this image"}
    fields = out.get("fields") or {}
    kind = str(fields.get("kind", "")).strip().lower()
    # An unrecognised answer must not read as "land" — unknown means unknown,
    # and the client treats unknown as a soft warning rather than approval.
    if kind not in {"land", "document", "id_document", "person", "screenshot", "other"}:
        kind = ""
    return {
        "kind": kind,
        "category": str(fields.get("category", "general")).strip().lower() or "general",
        "confidence": str(fields.get("confidence", "low")).strip().lower() or "low",
        "reason": str(fields.get("reason", "")).strip()[:120],
    }


@app.post("/extract-aadhaar")
async def extract_aadhaar(file: UploadFile = File(...)):
    data = await file.read()
    out = await _anthropic_extract(data, file.content_type or "", file.filename or "",
                                   _AADHAAR_SYSTEM, "Extract the Aadhaar KYC fields and return ONLY the JSON object.")
    if "_error" in out:
        code, msg = out["_error"]
        return JSONResponse(status_code=code, content={"error": msg})
    return out


# ── AI Registered Document Importer ───────────────────────────────────
# Reads a scanned registered deed (sale/gift/mortgage, usually Telugu) and
# extracts the key legal info (parties, property, boundaries, fees, chain).

_DOC_IMPORT_SYSTEM = (
    "You are a document classifier + data-extraction assistant for an Andhra Pradesh (India) "
    "land-records application. The uploaded file may be a registered DEED (sale / gift / "
    "mortgage / GPA / partition / settlement), an Encumbrance Certificate, a tax receipt, a "
    "land passbook / ROR, a MAP or site-plan or property PHOTO, or something unrelated — "
    "usually bilingual (Telugu + English).\n"
    "STEP 1 — classify `doc_type` as EXACTLY one of: "
    '"Sale Deed","Gift Deed","Partition Deed","Settlement Deed","GPA","Mortgage",'
    '"Encumbrance Certificate","Pattadar Passbook","ROR/Adangal","FMB","Tax Receipt",'
    '"Map","Legal Heir Certificate","Court Order","Photo","Other". '
    "A conveyance for consideration = \"Sale Deed\"; a standalone General Power of Attorney = \"GPA\". "
    "A field-measurement book / survey sketch showing plot dimensions & boundaries = \"FMB\". "
    "A Record-of-Rights / 1-B / Adangal / Pahani land record = \"ROR/Adangal\". "
    "A plain map / site-plan = \"Map\"; a photograph with no legal text = \"Photo\". "
    "Anything you cannot confidently place = \"Other\".\n"
    "STEP 2 — extract ONLY the fields clearly present for that document. If the file is a map / "
    "photo / receipt, or a field is not clearly readable, leave it \"\" / [] / 0. NEVER guess, "
    "infer, or invent a value — an empty field is correct when the value is not plainly on the page.\n"
    "Return ONLY a compact JSON object (no markdown, no code fences, no commentary):\n"
    '{"doc_type":"<one of the 16 values above>",'
    '"document_no":"<registered number e.g. 2056>","reg_year":"<e.g. 2010>","book_no":"<e.g. 1>",'
    '"sro":"<Sub-Registrar Office in English>","registration_date":"<YYYY-MM-DD>","execution_date":"<YYYY-MM-DD>",'
    '"consideration":<number>,"stamp_duty":<number>,"transfer_duty":<number>,"registration_fee":<number>,'
    '"user_charges":<number>,"total_fee":<number>,"village":"<English>","mandal":"<English>","district":"<English>",'
    '"survey_no":"<survey/C.G number>","plot_no":"<plot number>","extent":"<area as written>",'
    '"classification":"<house-site|agricultural|commercial|other>",'
    '"boundaries":{"north":"","south":"","east":"","west":""},'
    '"total_pages":<number of pages in the file>,'
    '"stamp_papers":{"total_value":<number>,"serials":"<e.g. 110 to 119>","count":<number>,'
    '"denominations":[{"value":<number>,"count":<number>}],'
    '"purchased_by":"<name in English>","purchased_for":"<SELF or the name>"},'
    '"layout_name":"<layout / colony / nagar name in English>",'
    '"plot_nos":["<each plot number sold, e.g. 70A>"],'
    '"rate_per_unit":<number>,"rate_unit":"<Sq.yard|Sq.ft|Acre>",'
    '"parent_survey_extent":"<the WHOLE survey number\'s extent as written, e.g. 8-74 Cents>",'
    '"boundary_lengths":{"north":"","south":"","east":"","west":""},'
    '"boundary_points":[{"lat":<number>,"lng":<number>}],'
    '"prior_document":"<prior deed no/year>","gpa_document":"<GPA doc no/year>","scanning_id":"<scanning id>",'
    '"prior_document_details":{"number":"<e.g. 10024/1981>","registration_date":"<YYYY-MM-DD>",'
    '"office":"<registering office in English>","book_volume_pages":"<e.g. Book 1, Vol 1488, Pages 168>",'
    '"original_seller":"<name in English>","original_buyer":"<name in English>"},'
    '"attachments":{"route_map":<bool>,"landmarks":["<landmark named on the site plan>"],'
    '"identity_verification":"<what is present: thumbprints, photographs, \'\' if none>",'
    '"declaration":"<the compliance declaration cited, e.g. Section 27 & 64 Stamp Act>"},'
    '"parties":[{"role":"<seller|buyer>","name":"<English>","parentage":"<S/o|W/o|D/o ...>","age":"<age>","address":"<English>","is_gpa":<bool>}],'
    '"headline":"<one line, max 90 chars, see below>",'
    '"key_points":["<3 to 5 short factual lines, see below>"],'
    '"pattadar_no":"<passbook/khata number — PASSBOOK & ROR ONLY>",'
    '"owner_name":"<pattadar name in English — PASSBOOK & ROR ONLY>",'
    '"father_husband_name":"<S/o or W/o name — PASSBOOK & ROR ONLY>",'
    '"parcels":[{"survey_no":"","subdivision":"","extent":"<as written, WITH its unit>",'
    '"unit":"<Acres|Guntas|Cents|Hectares|Sq.yards>","classification":"<agri|non-agri>",'
    '"acquisition_source":"<purchase|inheritance|gift|partition|government>"}],'
    '"summary":"<2-3 short paragraphs, see below>",'
    '"summary_te":"<the same summary in TELUGU — natural Telugu, not transliteration>",'
    '"language":"<what the document is written in, e.g. Telugu | English | Telugu, with an English endorsement>",'
    '"watch_out":"<ONE sentence naming the thing most likely to bite later — a khata ambiguity, a missing page, a survey number only on an annexure. \'\' if nothing>",'
    '"contents":[{"pages":"<e.g. 1-9>","kind":"<Sale Deed|Registration Endorsement|ROR/Adangal|Route Map|Photos|Other>"}],'
    '"field_pages":{"<field name>":<page number the value was read from>},'
    '"field_confidence":{"<field name>":"<clean|check|unsure> — ONLY fields that are not clean"},'
    '"caveats":["<anything unreadable, ambiguous or worth checking — [] if none>"],'
    '"confidence":"<high|medium|low>"}\n'
    "CONTENTS — a registered file is often SEVERAL documents bound together: the deed itself, "
    "the registration endorsement with photographs and thumb impressions, an adangal or ROR "
    "print, a route map. Classify the page ranges FIRST and list every range in `contents`, in "
    "page order, covering all pages. A single-document file is one range. A page printed "
    "sideways is still its document — say so in caveats if it was hard to read.\n"
    "FIELD_PAGES / FIELD_CONFIDENCE — for each top-level extracted field you filled "
    "(document_no, registration_date, consideration, extent, survey_no, village, parties, "
    "boundaries…), record in `field_pages` the page its value was read from. In "
    "`field_confidence` list ONLY the fields you are not fully sure of: \"check\" when a careful "
    "person should glance at the page, \"unsure\" when you may well be wrong. A field absent "
    "from `field_confidence` is clean. Never mark a field clean to be polite.\n"
    + _EXTENT_NOTATION_RULE +
    "BOUNDARY_POINTS — an FMB, survey sketch or resurvey sheet usually ends in a POINT TABLE: "
    "one row per corner with columns like Point Id, Easting, Northing, Latitude, Longitude. "
    "When such a table is present, extract EVERY row's latitude and longitude as "
    "`boundary_points`, in the table's own order, copying the printed decimals exactly. Use the "
    "Latitude/Longitude columns only — NEVER convert Easting/Northing yourself, and NEVER "
    "estimate a coordinate from the drawing. A registered deed occasionally lists corner "
    "coordinates in its schedule; extract those the same way. No coordinate table → [].\n"
    "THE NARRATIVE MUST AGREE WITH `parties`. Work out the roles FIRST, then write the headline, "
    "key points and summary from them. The \"seller\" is the person who PARTED WITH the property; "
    "the \"buyer\" is the person who RECEIVED it. Never write that the buyer sold, or that the "
    "seller bought — a headline that contradicts the parties list is a serious error in a "
    "land-records app, because it inverts who owns the land. For a GPA, the executant GRANTS the "
    "power and the holder RECEIVES it; say it in that direction.\n"
    "WRITE IT LIKE A NEWS REPORT. The reader is scanning, not studying. Most important fact "
    "first, plain English, active voice, past tense for what has already happened. No jargon, no "
    "field names, no hedging, no preamble like \"This document is\". Write amounts the Indian way "
    "(Rs 1,91,000). Name people exactly as they appear on the page.\n"
    "  HEADLINE — one line, max 90 characters, stating WHO did WHAT to WHAT for HOW MUCH. "
    "No trailing full stop. Example: \"Dasaratharamaiah sold 418.5 sq yd in Nallapadu for "
    "Rs 84,000\".\n"
    "  KEY_POINTS — 3 to 5 lines, each under 90 characters, each a single self-contained fact a "
    "buyer would want at a glance: what was transferred and how big, who to whom, the price, the "
    "date and registering office, and any title chain (prior document). One fact per line, no "
    "sentence fragments continuing from the line above.\n"
    "  SUMMARY — 2 to 3 SHORT paragraphs separated by a blank line (\\n\\n). First paragraph: the "
    "transaction itself. Later paragraphs: how the seller came to own it, the boundaries, and "
    "anything else of substance. Two to three sentences per paragraph, never a single wall of "
    "text. If the document is not a transfer (a receipt, a map, a certificate), report what it is "
    "and what it covers instead.\n"
    "CAVEATS — ALWAYS include, as the FIRST caveat, one line naming who you took as the person "
    "parting with the property and who you took as the person receiving it, in the form: "
    "\"Read as X transferring to Y — check this direction against the deed.\" Repeated readings of "
    "the same GPA have disagreed about which party is which, so this direction is never to be "
    "presented as settled. Then list anything else a careful person should verify by eye: a page that was cut off or "
    "blurred, a figure that appears twice with different values, an extent written ambiguously, "
    "a party whose role was hard to determine, handwriting you had to interpret. Be specific "
    "and brief. An empty list is correct when the document read cleanly — do NOT invent doubt.\n"
    "IF THE DOCUMENT IS A PATTADAR PASSBOOK, ROR, 1-B OR ADANGAL, the fields above that are "
    "marked PASSBOOK & ROR ONLY are the important ones, and `parcels` is the point of the "
    "document: it lists EVERY survey number the pattadar holds in that village, and each row "
    "must appear. `pattadar_no` is the khata / passbook number printed on it. `owner_name` is "
    "the pattadar. Leave `parties`, `consideration` and the registration fields empty for these "
    "— a passbook is a record of holding, not a transfer between two people.\n"
    "EXTENT — write it exactly as the paper does INCLUDING the unit: \"2.20 acres\", "
    "\"40 guntas\", \"418-1/2 sq. yards\". The number alone is ambiguous, and a figure read as "
    "the wrong unit misstates the holding by thousands of times.\n"
    "PARTY ROLES — read carefully, DO NOT SWAP these two:\n"
    "  • వ్రాసి ఇచ్చినవారు / వ్రాయించి ఇచ్చినవారు (vrasi/vrayinchi ichchinavaru) = the executant / vendor "
    "who WRITES AND GIVES the deed → role = \"seller\" (the PREVIOUS owner).\n"
    "  • వ్రాయించుకొన్నవారు / వ్రాయించుకున్నవారు (vrayinchukonnavaru/vrayinchukunnavaru) = the claimant / "
    "vendee who GETS the deed written FOR THEMSELVES (the recipient) → role = \"buyer\" (the CURRENT owner).\n"
    "In a sale/gift, the person parting with the property is the seller; the person receiving it is the buyer. "
    "A GPA HAS NO SELLER AND NO BUYER, and guessing has produced the opposite answer on repeated "
    "readings of the same document — which silently inverts who controls the land. Map it "
    "explicitly and always the same way: the EXECUTANT/PRINCIPAL, who owns the property and GRANTS "
    "the authority (వ్రాసి ఇచ్చినవారు), takes role \"seller\"; the GPA HOLDER/AGENT, who RECEIVES "
    "the authority to act (వ్రాయించుకొన్నవారు), takes role \"buyer\" and is marked is_gpa true. "
    "Apply the same rule to an agreement-of-sale-cum-GPA. "
    "Map each party strictly by which Telugu heading it appears under — never guess from name order.\n"
    "DOCUMENT NUMBER — the registered number is the single field used to find this deed "
    "again, in an EC search or the registrar\'s index, so look for it before giving up. On an "
    "Andhra Pradesh deed it appears as \"ద.నెం.\" / \"దస్తావేజు నెంబరు\" / \"Doc.No.\" / "
    "\"Document No.\" / \"R.No.\" / \"Regd. No.\", usually written NUMBER/YEAR (8034/2006) in the "
    "registration endorsement on the LAST pages or in a stamp at the top of the first page — not "
    "in the body of the text. Put the number alone in `document_no` and the year in `reg_year`. "
    "Do NOT put the year in `document_no`: a year in that field reads as a deed number that does "
    "not exist and sends somebody searching the index for it. If the endorsement is genuinely "
    "absent or unreadable, leave `document_no` empty AND say so in a caveat.\n"
    "STAMP PAPERS — a registered deed is written on a set of non-judicial stamp papers, and the set is evidence in itself: the serial run, the denominations and who bought them are what a lawyer checks first for a forged or substituted page. List every denomination with its count, and give `total_value` as their SUM — not the consideration, which is a different number.\n"
    "PLOT vs SURVEY EXTENT — `extent` is the area actually conveyed by THIS deed; `parent_survey_extent` is the extent of the whole survey number it was cut from. Recording the parent extent as the holding would overstate the land by many times, so keep them apart and leave either empty rather than copying one into the other.\n"
    "RATE — `rate_per_unit` is the price per square yard/foot/acre stated on the page. Do NOT compute it by dividing the consideration; if the paper does not state a rate, leave it 0.\n"
    "BOUNDARY LENGTHS — the schedule often gives a measurement beside each direction (\"North: 30 ft wide road\", \"East: 66 ft\"). Put the DESCRIPTION of what abuts in `boundaries` and the MEASUREMENT in `boundary_lengths`, each as written. A road named as a boundary is a description, its width is a length; they are not the same fact.\n"
    "PRIOR LINK DOCUMENT — the deed by which the present seller acquired the property. It is the title chain, and its number, date, office and the two names on it are what makes the chain checkable. If the prior deed was executed through a GPA agent, name the principal as `original_seller` and say so in a caveat.\n"
    "ATTACHMENTS — state only what is actually bound into the file: a route map or site plan, thumbprints or photographs under Section 32A, a stamp-duty declaration. These are presence facts; do not describe what a document of this kind usually contains.\n"
    "Boundaries are the chuttupakkala haddulu (N/S/E/W) of the schedule property. Prefer English transliteration of "
    "Telugu names/places. Output MUST be valid JSON and nothing else."
)


@app.post("/import-registered-document")
async def import_registered_document(file: UploadFile = File(...)):
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return JSONResponse(status_code=503, content={"error": "AI import is not configured"})
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        return JSONResponse(status_code=413, content={"error": "File too large (max 25 MB)"})
    mime = (file.content_type or "").lower()
    name = (file.filename or "").lower()
    b64 = base64.standard_b64encode(data).decode()
    if mime == "application/pdf" or name.endswith(".pdf"):
        block = {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": b64}}
    elif mime.startswith("image/"):
        block = {"type": "image", "source": {"type": "base64", "media_type": mime, "data": b64}}
    else:
        return JSONResponse(status_code=400, content={"error": "Upload a PDF, JPG or PNG"})
    payload = {
        "model": _IMPORT_MODEL,
        # Output is pure JSON and you only pay for what is produced, so the
        # ceiling is set by the longest document, not the typical one. At 3000
        # a 14 MB multi-page deed stopped mid-object (stop_reason=max_tokens)
        # and the app prefilled nothing.
        # The model reasons before answering, and that reasoning is billed against
        # max_tokens. On a 14 MB deed it spent 8228 tokens thinking — more than the
        # entire 8000 ceiling — so the JSON was cut off mid-object and the app was
        # told the document "ran out of room". The ceiling now comfortably exceeds
        # thinking + answer, and effort=medium cuts the thinking (and the wait, 132s
        # to 53s) without changing a single extracted value.
        "max_tokens": 16000,
        "output_config": {"effort": "medium"},
        "system": _DOC_IMPORT_SYSTEM,
        "messages": [{"role": "user", "content": [
            block,
            {"type": "text", "text": "Extract the registered-document fields and return ONLY the JSON object."},
        ]}],
    }
    try:
        r = await _post_with_retry(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json_body=payload,
            timeout=180,
        )
    except httpx.TimeoutException:
        _log.warning("AI extract timed out (file=%s, model=%s)", file.filename or "", _IMPORT_MODEL)
        return JSONResponse(status_code=504, content={"error": "AI took too long to read this document (timed out). Try again or enter details manually."})
    except Exception as e:
        _log.warning("AI extract failed (file=%s, bytes=%d): %r", file.filename or "", len(data), e)
        return JSONResponse(status_code=502, content={"error": _ai_failure_message(e, len(data))})
    if r.status_code != 200:
        _log.warning("AI extract non-200 (file=%s, status=%s): %s", file.filename or "", r.status_code, (r.text or '')[:300])
        return JSONResponse(status_code=502, content={"error": f"The AI service refused this file (HTTP {r.status_code}). {(r.text or '')[:160]}"})
    body = r.json()
    text = "".join(b.get("text", "") for b in body.get("content", []) if b.get("type") == "text").strip()
    fields = _extract_json(text)
    # Running out of room is a budget problem, not a bad document — so try once
    # more with the model reasoning less, which leaves far more of the ceiling
    # for the answer. Only worth doing when that is demonstrably what happened.
    if (not fields) and body.get("stop_reason") == "max_tokens":
        _log.info("AI extract hit the ceiling (file=%s) — retrying with lower effort", file.filename or "")
        retry = dict(payload)
        retry["output_config"] = {"effort": "low"}
        try:
            r2 = await _post_with_retry(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json_body=retry,
                timeout=200,
            )
            if r2.status_code == 200:
                body = r2.json()
                text = "".join(b.get("text", "") for b in body.get("content", []) if b.get("type") == "text").strip()
                fields = _extract_json(text)
        except Exception as e:
            _log.warning("AI extract low-effort retry failed (file=%s): %r", file.filename or "", e)
    if not text or not fields:
        # An empty or unparseable reply used to be returned as a 200 with
        # {"fields": {}} — the app then prefilled nothing and the form sat there
        # looking untouched, which reads as "the button did nothing". A document
        # we could not read is a failure and must say so.
        _log.warning(
            "AI extract produced nothing (file=%s, bytes=%d, stop_reason=%s, text_len=%d)",
            file.filename or "", len(data), body.get("stop_reason"), len(text),
        )
        msg = ("This document is long enough that the reading ran out of room. Photograph just the "
               "pages with the details, or enter them by hand."
               if body.get("stop_reason") == "max_tokens" else
               "Nothing could be read from this document. It may be a scan of photographs rather "
               "than text — try a clearer copy, or enter the details by hand.")
        return JSONResponse(status_code=502, content={"error": msg})
    return {"fields": fields, "raw": text}


# ── AI Property Importer ──────────────────────────────────────────────
# Reads a non-agricultural property document (allotment letter, flat sale
# agreement, plot sale deed, brochure) and auto-fills the Add-Property form.
# Also recognises AGRICULTURAL land so the UI can route it to the parcel flow.
_PROPERTY_IMPORT_SYSTEM = (
    _EXTENT_NOTATION_RULE
    + "You are a data-extraction assistant for an India (Telangana/AP) real-estate app. "
    "The uploaded file may be a NON-AGRICULTURAL property document (open-plot/site sale deed or "
    "allotment letter, flat/apartment sale agreement, independent house/villa deed, commercial "
    "unit) OR an AGRICULTURAL land document (pattadar passbook, ROR/Adangal, or a deed whose "
    "schedule property is agricultural land identified by a Survey/C.G. number).\n"
    "STEP 1 — set `kind`: \"parcel\" if the property is AGRICULTURAL land (survey number, "
    "classification agricultural, or a passbook/ROR); otherwise \"property\". When unsure, use "
    "\"property\" with confidence \"low\".\n"
    "STEP 2 — extract ONLY fields clearly present. NEVER guess or invent; leave \"\"/0/[] when not "
    "plainly on the page. Fill the registration/parties/boundaries facts for a PROPERTY deed too, "
    "not only for agricultural land.\n"
    "Return ONLY a compact JSON object (no markdown/fences/commentary):\n"
    '{"kind":"property|parcel","confidence":"high|medium|low",'
    '"property_type":"open_plot|flat|independent_house|villa|commercial|rental|other",'
    '"label":"<short label e.g. \'Neopolis 250-sqyd plot\'>","city":"<English>","district":"<English>",'
    '"land_area":<number>,"land_unit":"<the unit AS WRITTEN: Sq.yd|Sq.ft|Acres|Cents|Guntas>","builtup_area":<number>,"builtup_unit":"Sq.ft",'
    '"attributes":{"plot_no":"","dimensions":"","corner":"","road_width":0,"layout":"","tower_block":"",'
    '"unit_no":"","floor":"","facing":"","bhk":"","carpet_area":0,"super_builtup_area":0,"uds":0},'
    # transaction / registration facts — fill for BOTH property and parcel when present:
    '"acquisition_mode":"purchase|gift|inheritance|partition|other",'
    '"doc_type":"Sale Deed|Gift Deed|Partition Deed|Settlement Deed|GPA|Mortgage|Pattadar Passbook|ROR/Adangal|Other",'
    '"document_no":"","reg_year":"","sro":"","registration_date":"<YYYY-MM-DD>","consideration":<number>,'
    '"stamp_duty":<number>,"registration_fee":<number>,'
    '"boundaries":{"north":"","south":"","east":"","west":""},'
    '"parties":[{"role":"seller|buyer","name":"<English>","parentage":"<S/o|W/o|D/o ...>","address":"<English>"}],'
    # parcel-only geo fields:
    '"survey_no":"","extent":"","village":"","mandal":"","classification":"agricultural"}\n'
    "PARTY ROLES — read carefully, DO NOT SWAP these two (deeds are often labeled ONLY in Telugu, "
    "not English \"buyer\"/\"seller\"):\n"
    "  • వ్రాయించుకొన్నవారు / వ్రాయించుకున్నవారు (vrayinchukonnavaru/vrayinchukunnavaru) = the claimant / "
    "vendee who GETS the deed written FOR THEMSELVES (the recipient) → role = \"buyer\". The property "
    "is being transferred TO this person — they become the CURRENT owner (is_current=true).\n"
    "  • వ్రాసి ఇచ్చినవారు / వ్రాయించి ఇచ్చినవారు (vrasi/vrayinchi ichchinavaru) = the executant / vendor "
    "who WRITES AND GIVES the deed → role = \"seller\". They are giving up the property — they become "
    "the PREVIOUS owner (is_current=false).\n"
    "Map each party strictly by which Telugu heading it appears under in the document — never guess "
    "from name order, signature order, or page position.\n"
    "SCHEDULE — ALWAYS FIND AND READ IT. The deed's SCHEDULE (Telugu 'షెడ్యూలు', or an English "
    "'Schedule of Property' / 'Boundaries' / 'హద్దులు' section) is the authoritative legal description; "
    "most critical facts live only there. From it extract:\n"
    "  • boundaries: for EACH of north/south/east/west put the ADJOINING feature AND its side-measurement "
    "TOGETHER, e.g. 'Plot No.59 site — 34 ft', 'Uyyuru Damodar Reddy land — 55 ft 6 in', '30-ft-wide road "
    "— 55 ft 6 in', 'land sold today to Challa Sridevi — 66 ft'. Telugu 'అ.' = అడుగులు (feet); a value like "
    "'55-6' means 55 ft 6 in. Keep the measurement in the boundary string — it lets the extent be checked "
    "(depth × width ≈ area).\n"
    "  • attributes.dimensions: derive from the two pairs of side-measurements, e.g. \"55'6\\\" x 34'\".\n"
    "  • attributes.road_width: the width in feet if any boundary is a road; attributes.corner: 'yes' if the "
    "plot abuts a road on two or more sides.\n"
    "  • attributes.layout: the layout/colony/venture name if named (e.g. 'Mathrusri Anasuyamba Nagar').\n"
    "  • survey_no: the village D.No./Survey no. from the schedule (e.g. 'D.No.29', '563/5').\n"
    "  • SOLD PORTION: when the schedule says only PART of a larger plot-set is sold (e.g. 'plots 53,70A,70B "
    "= 837 Sq.yd; western 418½ Sq.yd sold to you'), set land_area to the SOLD extent (418.5), NEVER the "
    "parent total (837). If the extent is given in sq.metres too, still report land_area in Sq.yd.\n"
    "IMPORTANT — the RUPEE `consideration` (sale value, e.g. 2,10,000) is NOT the plot `land_area` "
    "(e.g. 210 Sq.yd); never copy one into the other. `acquisition_mode`: Sale Deed=purchase, "
    "Gift Deed=gift, Will/inheritance=inheritance, Partition Deed=partition, else other. In a sale/"
    "gift, the person PARTING WITH the property = role \"seller\"; the person RECEIVING it = role "
    "\"buyer\". property_type: vacant plot/site=open_plot; apartment/flat=flat; standalone house="
    "independent_house; gated villa=villa; shop/office/showroom=commercial; multi-tenant rental "
    "building=rental; else other. dimensions like 30x75 go in attributes.dimensions. Output MUST be "
    "valid JSON and nothing else."
)


@app.post("/extract-property")
async def extract_property(file: UploadFile = File(...)):
    data = await file.read()
    out = await _anthropic_extract(
        data, file.content_type or "", file.filename or "",
        _PROPERTY_IMPORT_SYSTEM,
        "Classify kind and extract the property (or agricultural parcel) fields. Return ONLY the JSON object.",
        max_mb=25, max_tokens=16000,
    )
    if "_error" in out:
        status, msg = out["_error"]
        return JSONResponse(status_code=status, content={"error": msg})
    return {"fields": out.get("fields") or {}}
