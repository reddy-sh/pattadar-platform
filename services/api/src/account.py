"""Authenticated account export, consent history and durable erasure requests.

These routes are private to the gateway; the generic proxy blocks /internal/.
Erasure is executed by the reviewed operator runner, never by a best-effort
HTTP request spanning three databases and external providers.
"""
from datetime import datetime, timezone
import os
import uuid

from fastapi import APIRouter, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field
from psycopg import sql
from psycopg.types.json import Jsonb

router = APIRouter(prefix="/internal/account", tags=["account"])
_pool = None
VERSION = "2026-09-12"
PURPOSES = {"document_processing", "ai_extraction", "service_notifications"}
STAGES = ["freeze_access", "storage_objects", "assistant_objects", "assistant_data", "api_data", "storage_metadata", "cognito_identity", "verify"]

DDL = """
CREATE TABLE IF NOT EXISTS account_consents (
 id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, version TEXT NOT NULL,
 purposes JSONB NOT NULL DEFAULT '[]', accepted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_consents_owner ON account_consents(owner_user_id,accepted_at DESC);
CREATE TABLE IF NOT EXISTS account_erasure_jobs (
 id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, principal_id TEXT NOT NULL,
 issuer TEXT NOT NULL, subject TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'requested',
 stages JSONB NOT NULL DEFAULT '{}', attempts INTEGER NOT NULL DEFAULT 0,
 last_error TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS account_erasure_active ON account_erasure_jobs(owner_user_id)
 WHERE status <> 'completed';
"""


def bind(pool):
    global _pool
    _pool = pool


async def ensure_schema(conn):
    await conn.execute(DDL)


def owner(request):
    uid = (request.headers.get("x-user-id") or "").strip()
    if not uid:
        raise HTTPException(401, "Authentication required")
    return uid


# Tables without explicit owner columns predate the ownership convention.
# Every edge is an established application relationship, never an arbitrary
# same-named id. Direct foreign owners always override inherited membership.
CHILD_LINKS = {
    "parcels": [("passbook_id", "passbooks")],
    "parcel_fields": [("parcel_id", "parcels")],
    "parcel_owners": [("parcel_id", "parcels")],
    "parcel_photos": [("parcel_id", "parcels")],
    "property_owners": [("property_id", "properties")],
    "property_photos": [("property_id", "properties")],
    "documents": [("parcel_id", "parcels"), ("passbook_id", "passbooks"), ("property_id", "properties")],
    "beneficiaries": [("parcel_id", "parcels")],
    "service_requests": [("parcel_id", "parcels")],
    "document_parties": [("document_id", "registered_documents")],
    "shared_kit_items": [("kit_id", "shared_kits")],
    "shared_kit_checks": [("kit_id", "shared_kits")],
    "payment_operations": [("intent_id", "payment_intents")],
    "payment_webhook_events": [("intent_id", "payment_intents")],
    # An associate is a person too. `associates` itself needs no entry here:
    # it carries `recipient_user_id`, which the direct-owner branch below
    # already accepts, and the column was named that way precisely so an
    # associate's own profile lands in their export and erasure with no edit
    # to this file. Its four children carry no owner column of their own, so
    # they reach the person only through the parent row — which is also what
    # gives erase_account.py the ordering it needs to delete the disciplines,
    # areas, credentials and trail before the associate they hang off.
    #
    # `associates.token_hash` is dropped by OMIT_COLUMNS below and
    # `associate_credentials.number_enc` by the `_enc` suffix rule, so neither
    # the claim credential nor the licence number leaves in a JSON export.
    "associate_disciplines": [("associate_id", "associates")],
    "associate_areas": [("associate_id", "associates")],
    "associate_credentials": [("associate_id", "associates")],
    "associate_events": [("associate_id", "associates")],
}


def ownership_predicates(catalog):
    """A schema-derived allowlist: only proven owner columns/known children."""
    result = {}
    visiting = set()
    def predicate(table):
        if table in result:
            return result[table]
        if table not in catalog or table in visiting:
            return None
        visiting.add(table)
        columns = catalog[table]
        direct = next((c for c in ("owner_user_id", "recipient_user_id") if c in columns), None)
        clauses = []
        if direct:
            clauses.append(f'"{direct}"=%s')
        elif table == "users":
            clauses.append('"id"=%s')
        elif table == "audit_events":
            clauses.append('"actor"=%s')
        elif table in ("audit_events_v2", "audit_outbox"):
            # The centralized trail is owner-scoped by affected_owner. An
            # export/erasure for an owner covers events ABOUT their data.
            clauses.append('"affected_owner"=%s')
        for column, parent in CHILD_LINKS.get(table, []):
            scope = predicate(parent)
            if column in columns and scope:
                inherited = f'"{column}" IN (SELECT id FROM "{parent}" WHERE {scope})'
                if direct:
                    inherited = f'(({direct} IS NULL OR {direct}=\'\') AND {inherited})'
                clauses.append(inherited)
        if table == "invitations":
            for scope_type, parent in [("parcel","parcels"), ("passbook","passbooks"),
                                       ("document","documents"), ("family","family_members"),
                                       ("beneficiary","family_members"), ("beneficiary","beneficiaries")]:
                scope = predicate(parent)
                if scope:
                    clauses.append(f"(scope_type='{scope_type}' AND scope_id IN (SELECT id FROM \"{parent}\" WHERE {scope}))")
        visiting.remove(table)
        if clauses:
            result[table] = "(" + " OR ".join(clauses) + ")"
        return result.get(table)
    for table in catalog:
        predicate(table)
    return result


async def catalog_for(conn):
    rows = await (await conn.execute("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'")).fetchall()
    catalog = {}
    for row in rows:
        catalog.setdefault(row["table_name"], set()).add(row["column_name"])
    return catalog


# Bearer credentials, encrypted KYC internals, and binary file payloads are not
# exported as accidental secrets. Original files remain in the file manifest.
# `ciphertext` is aadhaar_candidates' wrapped payload: the `_enc` suffix rule
# below does not reach it, and a KMS envelope is still the Aadhaar number.
OMIT_COLUMNS = {"token", "token_hash", "invite_token", "source", "content", "principal_id", "issuer", "subject", "ciphertext"}


def export_columns(columns):
    return sorted(c for c in columns if c not in OMIT_COLUMNS and not c.endswith("_enc"))


async def export_data(conn, uid):
    catalog = await catalog_for(conn)
    scopes = ownership_predicates(catalog)
    data = {}
    for table, scope in sorted(scopes.items()):
        columns = export_columns(catalog[table])
        if not columns:
            continue
        statement = sql.SQL("SELECT {} FROM {} WHERE " + scope).format(
            sql.SQL(",").join(map(sql.Identifier, columns)), sql.Identifier(table))
        rows = await (await conn.execute(statement, (uid,) * scope.count("%s"))).fetchall()
        data[table] = rows
    return data


@router.get("/export")
async def export(request: Request):
    uid = owner(request)
    async with _pool.connection() as conn:
        async with conn.transaction():
            await conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            data = await export_data(conn, uid)
    return jsonable_encoder({"version": VERSION, "exportedAt": datetime.now(timezone.utc), "data": data})


class ConsentInput(BaseModel):
    version: str
    purposes: list[str] = Field(default_factory=list, max_length=3)


@router.get("/consent")
async def get_consent(request: Request):
    uid = owner(request)
    async with _pool.connection() as conn:
        row = await (await conn.execute("SELECT version,purposes,accepted_at FROM account_consents WHERE owner_user_id=%s ORDER BY accepted_at DESC,id DESC LIMIT 1", (uid,))).fetchone()
    return {"version": row["version"] if row else VERSION, "purposes": row["purposes"] if row else [],
            "acceptedAt": row["accepted_at"] if row else None}


@router.post("/consent")
async def set_consent(request: Request, body: ConsentInput):
    uid = owner(request)
    if body.version != VERSION or not set(body.purposes) <= PURPOSES:
        raise HTTPException(400, "Unknown notice version or processing purpose")
    purposes = sorted(set(body.purposes))
    async with _pool.connection() as conn:
        row = await (await conn.execute(
            "INSERT INTO account_consents(id,owner_user_id,version,purposes) VALUES (%s,%s,%s,%s) RETURNING accepted_at",
            (str(uuid.uuid4()), uid, VERSION, Jsonb(purposes)))).fetchone()
    return {"version": VERSION, "purposes": purposes, "acceptedAt": row["accepted_at"]}


def _consent_denied(purpose: str) -> HTTPException:
    return HTTPException(403, detail={"error": "CONSENT_REQUIRED", "purpose": purpose,
                                      "message": "Update your account privacy choices before continuing."})


async def require_purpose(uid: str, purpose: str):
    """Honor explicit saved choices.

    An account with no saved row predates the consent screen. Waving it through
    is a deliberate grace for existing users, but it must be CLOSABLE: left
    permanent, every such account keeps having its documents processed with no
    recorded choice, and the compliance checklist can never be satisfied by
    anything the code does. Set CONSENT_STRICT=1 once the accounts listed in
    docs/runbooks/account-data.md have been asked, and a missing row is a
    refusal from then on.
    """
    if purpose not in PURPOSES:
        raise ValueError("Unknown processing purpose")
    if not uid:
        raise HTTPException(401, "Authentication required")
    async with _pool.connection() as conn:
        row = await (await conn.execute(
            "SELECT purposes FROM account_consents WHERE owner_user_id=%s ORDER BY accepted_at DESC,id DESC LIMIT 1", (uid,))).fetchone()
    if row is None:
        if os.getenv("CONSENT_STRICT", "0") == "1":
            raise _consent_denied(purpose)
        return
    if purpose not in row["purposes"]:
        raise _consent_denied(purpose)


class ErasureInput(BaseModel):
    confirmation: str
    principal_id: str
    issuer: str
    subject: str


def receipt(row):
    if not row:
        return None
    return {"id": row["id"], "status": row["status"], "createdAt": row["created_at"],
            "updatedAt": row["updated_at"], "completedAt": row["completed_at"],
            "stages": [{"name": stage, "status": row["stages"].get(stage, "pending")} for stage in STAGES],
            "needsOperator": row["status"] != "completed"}


@router.post("/erasure", status_code=202)
async def request_erasure(request: Request, body: ErasureInput):
    uid = owner(request)
    if body.confirmation != "DELETE MY ACCOUNT":
        raise HTTPException(400, "Type DELETE MY ACCOUNT to confirm")
    if not body.subject or not body.issuer or not body.principal_id.startswith("subject_"):
        raise HTTPException(400, "Authenticated subject is required")
    async with _pool.connection() as conn:
        await conn.execute(
            "INSERT INTO account_erasure_jobs(id,owner_user_id,principal_id,issuer,subject) VALUES (%s,%s,%s,%s,%s) "
            "ON CONFLICT (owner_user_id) WHERE status <> 'completed' DO NOTHING",
            (str(uuid.uuid4()), uid, body.principal_id, body.issuer, body.subject))
        row = await (await conn.execute("SELECT * FROM account_erasure_jobs WHERE owner_user_id=%s ORDER BY created_at DESC LIMIT 1", (uid,))).fetchone()
    return receipt(row)


@router.get("/erasure")
async def get_erasure(request: Request, principal_id: str = ""):
    uid = owner(request)
    async with _pool.connection() as conn:
        row = await (await conn.execute(
            "SELECT * FROM account_erasure_jobs WHERE owner_user_id=%s OR (principal_id=%s AND principal_id<>'') ORDER BY created_at DESC LIMIT 1",
            (uid, principal_id))).fetchone()
    return {"request": receipt(row)}
