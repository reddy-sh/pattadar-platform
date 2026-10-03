"""network.py — Pattadar Network register-interest capture.

See docs/specs/TODO-pattadar-network.md (decision D1 = Option A, 03/10/2026).

* `registerNetworkInterest` is the API's one credential-less public mutation.
  The gateway admits it anonymously as a single root (`public_graphql.py`);
  `RequireAuthenticatedRoot` lists it as public. Identity is ignored entirely:
  a row is never linked to an account, so account export and erasure are
  unaffected.
* Processing order is fixed: honeypot → pure `validate()` → one transaction
  (advisory lock → hourly ceiling → existing-row lookup → insert or touch).
* Insert-once: an anonymous submission inserts a row or moves nothing but
  `updated_at`. Name, contact, place, note and consent fields are written only
  on insert; a withdrawn row is never revived. Every valid submission gets the
  same `received` answer, and at the ceiling every one gets `rate_limited`, so
  the response never says whether a contact was already registered.
* No PII in logs or errors: lines carry the interest key, the rejected field
  name or the outcome, never a submitted value; database errors are replaced
  by the fixed `NetworkSaveFailed` (masked by `MaskUnexpectedErrors`).
"""
from __future__ import annotations

import logging
import os
import re
import unicodedata
import uuid

import psycopg

from . import associates
from .aadhaar import _AADHAAR_LIKE

_log = logging.getLogger("pattadar.network")

DDL = (
    """CREATE TABLE IF NOT EXISTS network_interest (
  id               TEXT PRIMARY KEY,
  interest         TEXT NOT NULL,
  name             TEXT NOT NULL,
  phone            TEXT NOT NULL DEFAULT '',
  email            TEXT NOT NULL DEFAULT '',
  contact_key      TEXT NOT NULL,
  district         TEXT NOT NULL DEFAULT '',
  mandal           TEXT NOT NULL DEFAULT '',
  note             TEXT NOT NULL DEFAULT '',
  source           TEXT NOT NULL DEFAULT 'landing',
  consent_purpose  TEXT NOT NULL DEFAULT 'network_contact',
  consent_version  TEXT NOT NULL,
  consented_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
)""",
    "CREATE UNIQUE INDEX IF NOT EXISTS network_interest_contact ON network_interest(contact_key, interest)",
    "CREATE INDEX IF NOT EXISTS network_interest_created ON network_interest(created_at)",
)


async def ensure_schema(conn) -> None:
    """Additive boot DDL, run by `init_db()` inside its advisory lock."""
    for statement in DDL:
        await conn.execute(statement)


# DRAFT (decision D4): the consent wording needs Reddy's approval before
# production. It must equal NETWORK_INTEREST.consent in
# apps/web/src/pages/landing/landingContent.ts byte for byte; changing it means
# bumping CONSENT_VERSION and CONSENT_TEXT_SHA256 together
# (scripts/network-interest-tests.ts fails otherwise).
CONSENT_VERSION = "2026-10-03"
CONSENT_TEXT = ("I agree that Pattadar may contact me by phone or email about Pattadar Network. "
                "I can withdraw at any time. See the privacy notice.")
CONSENT_TEXT_SHA256 = "cc1570ef76b27b5a9b3d8640a9d44d5cf4d5bdb9ba4530dd30eab6ad6d56ceb5"

INTERESTS = frozenset({
    "sell", "buy", "rent", "lease",
    "lawyer", "surveyor", "document_writer", "developer", "valuer", "other_professional",
})

COOLDOWN_SECONDS = 60
_DEFAULT_HOURLY_CAP = 200


def _parse_hourly_cap(raw: str | None) -> int:
    """Unset or empty → 200. Anything that is not a positive integer fails
    closed to 0 (every valid submission is `rate_limited`); the value itself is
    not echoed."""
    if raw is None or not raw.strip():
        return _DEFAULT_HOURLY_CAP
    try:
        cap = int(raw)
    except ValueError:
        cap = 0
    if cap <= 0:
        _log.error("network.hourly_cap_invalid")
        return 0
    return cap


# Read once, at import (decision D7). Tests monkeypatch HOURLY_CAP directly.
HOURLY_CAP = _parse_hourly_cap(os.getenv("NETWORK_INTEREST_HOURLY_CAP"))

# ASCII digits only — `[0-9]`, never `\d`, and re.ASCII besides: Python's `\d`
# matches Devanagari, Telugu and full-width digits, which would store a
# non-ASCII phone and give the same number a second contact_key. Any other
# digit script is `invalid`/`phone`. Mirrors packages/core/src/format/phone.ts.
_PHONE = re.compile(r"^(?:\+91|91|0)?([6-9][0-9]{9})$", re.ASCII)
_PHONE_SEPARATORS = re.compile(r"[ \-()]")
_PHONE_MAX_RAW = 20
_EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
_CONTROL_NOT_NEWLINE = re.compile(r"[\x00-\x09\x0b-\x1f\x7f]")

NAME_MIN, NAME_MAX = 2, 80
EMAIL_MAX = 254
PLACE_MAX = 60
NOTE_MAX = 500


class NetworkSaveFailed(Exception):
    """Fixed, PII-free; masked by MaskUnexpectedErrors."""

    def __init__(self) -> None:
        super().__init__("network interest save failed")


def _clean(value) -> str:
    """None → '', NFC-normalised, trimmed."""
    return unicodedata.normalize("NFC", value if isinstance(value, str) else "").strip()


def normalise_phone(raw: str) -> str | None:
    """`+91` + the ten ASCII digits, or None. Spaces, `-`, `(` and `)` are
    ignored; raw input over 20 characters is refused."""
    if len(raw) > _PHONE_MAX_RAW:
        return None
    m = _PHONE.match(_PHONE_SEPARATORS.sub("", raw))
    return f"+91{m.group(1)}" if m else None


def _free_text_ok(value: str, limit: int, *, allow_newline: bool = False) -> bool:
    """Length first, then control characters, then an Aadhaar-like run."""
    if len(value) > limit:
        return False
    if (_CONTROL_NOT_NEWLINE if allow_newline else _CONTROL).search(value):
        return False
    return not _AADHAAR_LIKE.search(value)


def validate(data) -> tuple[str, str, dict | None]:
    """Pure check of one submission, in the design's table order; the first
    failure wins. Returns (status, field, cleaned) — cleaned is None unless
    status is 'received'. Never looks at `website` (the honeypot is the
    caller's first step) and never touches the database."""
    get = lambda key: _clean(getattr(data, key, None))  # noqa: E731
    interest = get("interest")
    if interest not in INTERESTS:
        return "invalid", "interest", None
    name = get("name")
    if len(name) < NAME_MIN or not _free_text_ok(name, NAME_MAX):
        return "invalid", "name", None
    phone_raw = get("phone")
    phone = ""
    if phone_raw:
        phone = normalise_phone(phone_raw) or ""
        if not phone:
            return "invalid", "phone", None
    email = get("email")
    if email:
        if len(email) > EMAIL_MAX or _CONTROL.search(email) or not _EMAIL.match(email):
            return "invalid", "email", None
        email = email.lower()
    if not phone and not email:
        return "invalid", "contact", None
    district = get("district")
    if not _free_text_ok(district, PLACE_MAX):
        return "invalid", "district", None
    mandal = get("mandal")
    if not _free_text_ok(mandal, PLACE_MAX):
        return "invalid", "mandal", None
    note = get("note")
    if not _free_text_ok(note, NOTE_MAX, allow_newline=True):
        return "invalid", "note", None
    if getattr(data, "consent", False) is not True:
        return "consent_required", "consent", None
    if get("consent_version") != CONSENT_VERSION:
        return "invalid", "consentVersion", None
    return "received", "", {
        "interest": interest, "name": name, "phone": phone, "email": email,
        "contact_key": associates.contact_key(phone or email),
        "district": district, "mandal": mandal, "note": note,
    }


def _m():
    from . import main
    return main


def _pool():
    return _m().pool


def _result(status: str, field: str = ""):
    return _m().NetworkInterestResult(status=status, field=field)


async def _save(row: dict) -> str:
    """'received' or 'rate_limited'. One transaction; parameterized SQL only."""
    try:
        async with _pool().connection() as conn:
            async with conn.transaction():
                await conn.execute("SELECT pg_advisory_xact_lock(hashtext('network_interest'))")
                # 1. Global ceiling, before any per-contact lookup, so at the cap
                # every valid submission gets the same answer (no oracle).
                count = await (await conn.execute(
                    "SELECT count(*) AS n FROM network_interest "
                    "WHERE created_at > now() - interval '1 hour'")).fetchone()
                if count["n"] >= HOURLY_CAP:
                    return "rate_limited"
                # 2. Existing row: withdrawn or cooling → no write at all.
                existing = await (await conn.execute(
                    "SELECT id, withdrawn_at IS NOT NULL AS withdrawn, "
                    "updated_at > now() - %s * interval '1 second' AS cooling "
                    "FROM network_interest WHERE contact_key=%s AND interest=%s",
                    (COOLDOWN_SECONDS, row["contact_key"], row["interest"]))).fetchone()
                if existing:
                    if not existing["withdrawn"] and not existing["cooling"]:
                        await conn.execute(
                            "UPDATE network_interest SET updated_at=now() "
                            "WHERE id=%s AND withdrawn_at IS NULL", (existing["id"],))
                    return "received"
                # 3. New row. The conflict clause is defensive (the advisory
                # lock makes it unreachable) and keeps no-revival true.
                await conn.execute(
                    "INSERT INTO network_interest (id, interest, name, phone, email, contact_key, "
                    "district, mandal, note, consent_version) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
                    "ON CONFLICT (contact_key, interest) DO UPDATE SET updated_at=now() "
                    "WHERE network_interest.withdrawn_at IS NULL",
                    (uuid.uuid4().hex, row["interest"], row["name"], row["phone"], row["email"],
                     row["contact_key"], row["district"], row["mandal"], row["note"], CONSENT_VERSION))
                return "received"
    except psycopg.Error as exc:  # includes psycopg_pool.PoolTimeout
        _log.error("network.interest_save_failed error=%s", type(exc).__name__)
        raise NetworkSaveFailed() from None


async def register(info, data):
    """`registerNetworkInterest`. `info` (and any identity on it) is ignored."""
    del info
    # 1. Honeypot first: no validation, no database, no ceiling.
    if _clean(getattr(data, "website", None)):
        _log.info("network.interest_honeypot")
        return _result("received")
    # 2. Pure validation.
    status, field, row = validate(data)
    if row is None:
        reason = {"consentVersion": "consent_version"}.get(field, field)
        _log.info("network.interest_rejected reason=%s", reason)
        return _result(status, field)
    # 3. Transaction.
    outcome = await _save(row)
    if outcome == "rate_limited":
        _log.warning("network.interest_ceiling cap=%s", HOURLY_CAP)
        return _result("rate_limited")
    # One identical line for insert, touch, cool-down and withdrawn rows, so a
    # log reader cannot tell them apart either.
    _log.info("network.interest_received interest=%s", row["interest"])
    return _result("received")
