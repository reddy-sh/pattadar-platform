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
VERSION = "2026-10-06"  # bumped 06/10/2026: purpose wording changed (records -> data, service requests -> service orders)
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
CREATE TABLE IF NOT EXISTS account_import_jobs (
 id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, archive_id TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'files', node_map JSONB NOT NULL DEFAULT '{}',
 version_map JSONB NOT NULL DEFAULT '{}', report JSONB NOT NULL DEFAULT '{}',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 completed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS account_import_active ON account_import_jobs(owner_user_id)
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
# exported as accidental secrets. The original files travel in the backup ZIP.
# `ciphertext` is the aadhaar_vault (and legacy aadhaar_candidates) wrapped
# number: the `_enc` suffix rule below does not reach it, and a KMS envelope is
# still the Aadhaar number. `vault_token` is the record's pointer into the vault.
# `ack_token` is a legacy raw acknowledgement credential that is still accepted.
#
# Matched by name in every table, so only names that mean a secret everywhere
# belong here. `source` and `subject` mean provenance and a message's subject
# line almost everywhere (documents.source='aadhaar-card' is half of the share
# guard); the two tables where they are a payload or an identity are below.
OMIT_COLUMNS = {"token", "token_hash", "invite_token", "ack_token", "content", "principal_id", "issuer",
                "ciphertext", "vault_token"}
OMIT_TABLE_COLUMNS = {
    "document_read_jobs": {"source"},       # the uploaded bytes a reading ran on
    "account_erasure_jobs": {"subject"},    # the Cognito subject of a deletion request
}


def export_columns(columns, table=""):
    skip = OMIT_TABLE_COLUMNS.get(table, set())
    return sorted(c for c in columns if c not in OMIT_COLUMNS and c not in skip and not c.endswith("_enc"))


async def export_data(conn, uid):
    catalog = await catalog_for(conn)
    scopes = ownership_predicates(catalog)
    data = {}
    for table, scope in sorted(scopes.items()):
        columns = export_columns(catalog[table], table)
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


# ── Money still in the account (Reddy, 09/10/2026: a deletion request is
# refused while the wallet holds money or an order is open) ───────────────
# The same arithmetic as the Wallet screen (web360.wallet): available is what
# was put in, less what was paid to people, plus the ledger's wallet movements;
# set aside is money held against an order. erase_account.py re-checks before
# it deletes anything, because the account stays usable until the freeze.
MONEY_QUERIES = {
    "wallet_accounts": "SELECT COALESCE(SUM(topped_up),0) AS topped_up FROM wallet_accounts WHERE owner_user_id=%s",
    "people_payments": "SELECT COALESCE(SUM(amount),0) AS people_out FROM people_payments"
                       " WHERE owner_user_id=%s AND state='settled' AND direction='out'",
    "service_payments": "SELECT"
                        " COALESCE(SUM(CASE WHEN to_bucket='wallet' THEN amount ELSE 0 END),0) AS in_wallet,"
                        " COALESCE(SUM(CASE WHEN from_bucket='wallet' THEN amount ELSE 0 END),0) AS out_wallet,"
                        " COALESCE(SUM(CASE WHEN to_bucket='held' THEN amount ELSE 0 END),0) AS to_held,"
                        " COALESCE(SUM(CASE WHEN from_bucket='held' THEN amount ELSE 0 END),0) AS from_held"
                        " FROM service_payments WHERE owner_user_id=%s AND status <> 'failed'",
    "payment_intents": "SELECT count(*) AS pending FROM payment_intents"
                       " WHERE owner_user_id=%s AND status NOT IN ('settled','void')",
}
ORDERS_QUERY = "SELECT * FROM work_requests WHERE owner_user_id=%s"


def _rupees(amount: float) -> str:
    """₹12,34,567 — Indian grouping."""
    digits = str(int(round(abs(amount))))
    head, tail = digits[:-3], digits[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    return "₹" + ",".join([*groups, tail])


def money_reasons(totals: dict, orders: list) -> list[str]:
    """Plain sentences for whatever money would be lost by deleting now."""
    from . import ticketing
    f = lambda key: float(totals.get(key) or 0)  # noqa: E731
    available = max(0.0, f("topped_up") - f("people_out") + f("in_wallet") - f("out_wallet"))
    held = max(0.0, f("to_held") - f("from_held"))
    open_orders = 0
    for r in orders:
        status = ticketing.status_of(r.get("status") or "", int(r.get("stage") or 0), bool(r.get("closed")))
        if not ticketing.is_closed(status) and (float(r.get("quoted") or 0) > 0 or float(r.get("cost") or 0) > 0):
            open_orders += 1
    reasons = []
    if available >= 1:
        reasons.append(f"Your wallet still has {_rupees(available)}. Use it or ask for a refund first.")
    if held >= 1:
        reasons.append(f"{_rupees(held)} is set aside for an order that is not finished.")
    if open_orders:
        reasons.append("1 service order is still open. Finish or cancel it first." if open_orders == 1
                       else f"{open_orders} service orders are still open. Finish or cancel them first.")
    if int(totals.get("pending") or 0):
        reasons.append("A payment is still being confirmed. Wait for it to settle first.")
    return reasons


async def money_blockers(conn, uid) -> list[str]:
    catalog = await catalog_for(conn)
    totals: dict = {}
    for table, query in MONEY_QUERIES.items():
        if table in catalog:
            totals.update(await (await conn.execute(query, (uid,))).fetchone() or {})
    orders = await (await conn.execute(ORDERS_QUERY, (uid,))).fetchall() if "work_requests" in catalog else []
    return money_reasons(totals, orders)


def money_blockers_sync(conn, uid) -> list[str]:
    """The same check for the operator runner's synchronous connection."""
    tables = {r["table_name"] for r in conn.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public'")}
    totals: dict = {}
    for table, query in MONEY_QUERIES.items():
        if table in tables:
            totals.update(conn.execute(query, (uid,)).fetchone() or {})
    orders = conn.execute(ORDERS_QUERY, (uid,)).fetchall() if "work_requests" in tables else []
    return money_reasons(totals, orders)


@router.post("/erasure", status_code=202)
async def request_erasure(request: Request, body: ErasureInput):
    uid = owner(request)
    if body.confirmation != "DELETE MY ACCOUNT":
        raise HTTPException(400, "Type DELETE MY ACCOUNT to confirm")
    if not body.subject or not body.issuer or not body.principal_id.startswith("subject_"):
        raise HTTPException(400, "Authenticated subject is required")
    async with _pool.connection() as conn:
        active = await (await conn.execute(
            "SELECT 1 FROM account_erasure_jobs WHERE owner_user_id=%s AND status <> 'completed' LIMIT 1",
            (uid,))).fetchone()
        if not active:
            reasons = await money_blockers(conn, uid)
            if reasons:
                raise HTTPException(409, detail={"error": "MONEY_OPEN", "reasons": reasons,
                                                 "message": "Your account still has money or an open order. " + " ".join(reasons)})
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


# ── Restore from a backup archive ─────────────────────────────────────────
# The browser reads the ZIP and uploads each file through the ordinary storage
# routes, so every byte meets the same checks as any upload. The gateway
# confirms each uploaded node is this owner's before recording it here. The
# records then go back in one transaction (account_restore.py), which uses
# only that node map, never ids the browser names. One active restore per
# account; a finished one returns its report again instead of running twice.

_UUID_PATTERN = r"^[0-9a-fA-F-]{36}$"


class ImportStartInput(BaseModel):
    archive_id: str = Field(pattern=_UUID_PATTERN)
    format_version: int
    storage_empty: bool


class NodeMapping(BaseModel):
    old: str = Field(min_length=1, max_length=64)
    new: str = Field(pattern=_UUID_PATTERN)
    old_version: str = Field(default="", max_length=64)
    new_version: str = Field(default="", max_length=64)


class NodeMappingsInput(BaseModel):
    mappings: list[NodeMapping] = Field(default_factory=list, max_length=500)


def import_view(row):
    if not row:
        return None
    return {"id": row["id"], "archiveId": row["archive_id"], "status": row["status"],
            "nodeMap": row["node_map"], "versionMap": row["version_map"], "report": row["report"],
            "createdAt": row["created_at"], "completedAt": row["completed_at"]}


@router.post("/import")
async def start_import(request: Request, body: ImportStartInput):
    from . import account_restore
    uid = owner(request)
    if body.format_version != 1:
        raise HTTPException(400, "This backup was made by a different version of Pattadar and cannot be restored here.")
    async with _pool.connection() as conn:
        async with conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 7))", (uid,))
            done = await (await conn.execute(
                "SELECT * FROM account_import_jobs WHERE owner_user_id=%s AND archive_id=%s AND status='completed'"
                " ORDER BY completed_at DESC LIMIT 1", (uid, body.archive_id))).fetchone()
            if done:
                return {"job": import_view(done)}
            active = await (await conn.execute(
                "SELECT * FROM account_import_jobs WHERE owner_user_id=%s AND status <> 'completed'", (uid,))).fetchone()
            if active:
                if active["archive_id"] == body.archive_id:
                    return {"job": import_view(active)}
                raise HTTPException(409, detail={"error": "RESTORE_IN_PROGRESS",
                                                 "message": "Another restore is still in progress. Finish it first."})
            counts = await account_restore.content_counts(conn, uid)
            if counts or not body.storage_empty:
                raise HTTPException(409, detail={
                    "error": "ACCOUNT_NOT_EMPTY", "counts": counts,
                    "message": "A restore goes into an account that has no data yet, and this account already has some."})
            row = await (await conn.execute(
                "INSERT INTO account_import_jobs(id,owner_user_id,archive_id) VALUES (%s,%s,%s) RETURNING *",
                (str(uuid.uuid4()), uid, body.archive_id))).fetchone()
    return {"job": import_view(row)}


@router.get("/import")
async def get_import(request: Request):
    uid = owner(request)
    async with _pool.connection() as conn:
        row = await (await conn.execute(
            "SELECT * FROM account_import_jobs WHERE owner_user_id=%s ORDER BY (status <> 'completed') DESC,"
            " created_at DESC LIMIT 1", (uid,))).fetchone()
    return {"job": import_view(row)}


@router.post("/import/{job_id}/nodes")
async def map_import_nodes(request: Request, job_id: str, body: NodeMappingsInput):
    """Record which new node each archived node became. Called by the gateway
    only after it has checked every new node and version is this owner's."""
    uid = owner(request)
    nodes = {m.old: m.new for m in body.mappings}
    versions = {m.old_version: m.new_version for m in body.mappings if m.old_version and m.new_version}
    async with _pool.connection() as conn:
        row = await (await conn.execute(
            "UPDATE account_import_jobs SET node_map = node_map || %s, version_map = version_map || %s,"
            " updated_at=now() WHERE id=%s AND owner_user_id=%s AND status='files' RETURNING *",
            (Jsonb(nodes), Jsonb(versions), job_id, uid))).fetchone()
    if not row:
        raise HTTPException(409, "This restore is not waiting for files.")
    return {"job": import_view(row)}


@router.post("/import/{job_id}/records")
async def restore_import_records(request: Request, job_id: str):
    """Put the archive's records back. Idempotent: a finished restore answers
    with its report and writes nothing."""
    from . import account_restore
    uid = owner(request)
    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(400, "This backup's records could not be read.")
    data = body.get("data") if isinstance(body, dict) else None
    async with _pool.connection() as conn:
        async with conn.transaction():
            job = await (await conn.execute(
                "SELECT * FROM account_import_jobs WHERE id=%s AND owner_user_id=%s FOR UPDATE",
                (job_id, uid))).fetchone()
            if not job:
                raise HTTPException(404, "This restore was not found.")
            if job["status"] == "completed":
                return {"job": import_view(job)}
            try:
                report = await account_restore.restore(conn, uid, data, job["node_map"])
            except account_restore.RestoreRejected as exc:
                raise HTTPException(400, str(exc))
            row = await (await conn.execute(
                "UPDATE account_import_jobs SET status='completed', report=%s, updated_at=now(), completed_at=now()"
                " WHERE id=%s RETURNING *", (Jsonb(report), job_id))).fetchone()
    return {"job": import_view(row)}
