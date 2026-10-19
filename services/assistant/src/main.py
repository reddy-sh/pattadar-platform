"""Pattadar Assistant FastAPI service with PostgreSQL history and SDK SSE."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from collections import deque
from contextlib import AsyncExitStack, asynccontextmanager
from typing import AsyncGenerator
from urllib.parse import quote
from uuid import UUID, uuid4

import anyio
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response, StreamingResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from . import telemetry as _metrics
from .adapters.agent_runtime import AssistantAgent
from .adapters.event_pump import FINISHED, IDLE, EventPump
from .adapters.attachment_store import (
    AttachmentUnavailable,
    build_attachment_blocks,
    get_attachment,
    read_attachment_bytes,
    save_attachment,
)
from .config import AssistantConfig
from .adapters.conversation_store import (
    append_message,
    attachments_belong_to_conversation,
    auto_title,
    claim_run,
    create_conversation,
    delete_conversation,
    fail_run,
    finish_run,
    chat_offer_rows,
    get_proposals,
    insert_proposal,
    reply_metadata,
    saved_in_chat_reader,
    saved_records_from_rows,
    update_proposal,
    supersede_run,
    get_conversation,
    get_run_assistant_message,
    has_prior_accepted_turn,
    list_conversations,
    list_messages,
    load_bounded_transcript,
    restore_conversation,
    set_effective_model,
    update_application_context,
    update_conversation,
    update_sdk_session,
)
from .domain import billing, record_views
from .domain.follow_ups import chat_follow_ups
from .domain.scope_policy import SCOPE_DENIAL_TEXT, evaluate_scope
from .public_records.exceptions import PublicRecordsError, ToolInputError
from .internal_auth import InternalProxyAuthMiddleware
from .observability import RequestIdMiddleware, install_log_filter
from pydantic import BaseModel, Field
from .schemas import (
    ChatRequest,
    ConversationCreate,
    ConversationUpdate,
    IncognitoChatRequest,
    PartySearchRequest,
    ProposalUpdate,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s request_id=%(request_id)s %(message)s",
)
install_log_filter()
_log = logging.getLogger("pattadar.assistant.main")

config = AssistantConfig.from_env()
agent_manager = AssistantAgent(config)

# One pooled backend per replica instead of a fresh TCP+TLS+auth handshake per
# operation; several operations run per chat turn and RDS max_connections is
# shared with api and gateway.
pool = AsyncConnectionPool(
    conninfo=config.db_uri,
    min_size=1,
    max_size=10,
    open=False,
    kwargs={"row_factory": dict_row, "autocommit": True},
)


_DDL = """
CREATE TABLE IF NOT EXISTS r_conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         TEXT NOT NULL,
    title           TEXT,
    model           TEXT DEFAULT 'claude-sonnet-4-6',
    status          TEXT DEFAULT 'active' CHECK (status IN ('active','archived','deleted')),
    app_context     JSONB DEFAULT '{}',
    message_count   INT DEFAULT 0,
    sdk_session_id  TEXT,
    last_run_id     UUID,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE r_conversations ADD COLUMN IF NOT EXISTS sdk_session_id TEXT;
ALTER TABLE r_conversations ADD COLUMN IF NOT EXISTS last_run_id UUID;
CREATE INDEX IF NOT EXISTS idx_rconv_user ON r_conversations(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS r_conversation_messages (
    id              BIGSERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES r_conversations(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('user','assistant')),
    content         TEXT NOT NULL,
    run_id          UUID NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (conversation_id, run_id, role)
);
CREATE INDEX IF NOT EXISTS idx_rmsg_conversation
    ON r_conversation_messages(conversation_id, id);
CREATE INDEX IF NOT EXISTS idx_rmsg_user
    ON r_conversation_messages(user_id, created_at);

CREATE TABLE IF NOT EXISTS r_conversation_runs (
    run_id          UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES r_conversations(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('running','completed','failed')),
    error_code      TEXT,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rrun_one_active_conversation
    ON r_conversation_runs(conversation_id) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_rrun_user
    ON r_conversation_runs(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS r_attachments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES r_conversations(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL,
    file_name       TEXT NOT NULL,
    mime_type       TEXT,
    file_size       INT,
    storage_path    TEXT NOT NULL,
    attachment_type TEXT DEFAULT 'file' CHECK (attachment_type IN ('screenshot','file','image')),
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rattach_conv ON r_attachments(conversation_id);
ALTER TABLE r_attachments ADD COLUMN IF NOT EXISTS content BYTEA;

-- One row: the balance someone read off Anthropic's billing page, and the
-- content-free incognito spend since then (see /api/usage/credit).
CREATE TABLE IF NOT EXISTS r_assistant_credit (
    id                  SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    balance_usd         NUMERIC(12, 4),
    set_at              TIMESTAMPTZ,
    set_by              TEXT,
    incognito_spend_usd NUMERIC(12, 6) NOT NULL DEFAULT 0
);

-- Save offers (confirmation cards) and what the browser reported doing with
-- them. A record, not an authorisation: the save went through the user's own
-- session to services/api. Saved chats only; incognito never writes one.
CREATE TABLE IF NOT EXISTS r_assistant_proposals (
    id              UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES r_conversations(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL,
    draft           JSONB NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','saved','partial','dismissed','ordered')),
    results         JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    kind            TEXT NOT NULL DEFAULT 'records' CHECK (kind IN ('records','service'))
);
CREATE INDEX IF NOT EXISTS idx_rproposal_conversation ON r_assistant_proposals(conversation_id);
CREATE INDEX IF NOT EXISTS idx_rproposal_user ON r_assistant_proposals(user_id, created_at DESC);
-- 2026-10-04: service request cards (kind 'service', status 'ordered') share
-- the table. Upgrades a table created before then, once.
ALTER TABLE r_assistant_proposals ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'records';
-- 2026-10-04: the holding a save card grouped its records into (D2).
ALTER TABLE r_assistant_proposals ADD COLUMN IF NOT EXISTS holding_id TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'r_assistant_proposals_kind_check') THEN
    ALTER TABLE r_assistant_proposals
      ADD CONSTRAINT r_assistant_proposals_kind_check CHECK (kind IN ('records', 'service'));
  END IF;
  IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = 'r_assistant_proposals_status_check'
         AND pg_get_constraintdef(oid) LIKE '%ordered%') THEN
    ALTER TABLE r_assistant_proposals DROP CONSTRAINT IF EXISTS r_assistant_proposals_status_check;
    ALTER TABLE r_assistant_proposals ADD CONSTRAINT r_assistant_proposals_status_check
      CHECK (status IN ('draft', 'saved', 'partial', 'dismissed', 'ordered'));
  END IF;
END $$;
"""


async def _ensure_tables() -> None:
    async with pool.connection() as conn:
        await conn.execute(_DDL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _log.info("Assistant service starting on port %d", config.port)
    await pool.open(wait=True, timeout=30.0)
    await _ensure_tables()
    from .adapters import model_catalog

    catalog = model_catalog.init_catalog(config.anthropic_api_key)
    await catalog.start()
    await agent_manager.initialize()
    yield
    await agent_manager.shutdown()
    await catalog.stop()
    await pool.close()
    _log.info("Assistant service shut down")


app = FastAPI(title="Pattadar Assistant", version="2.0.0", lifespan=lifespan)
# No CORS: the browser never reaches this service directly, only through the
# gateway proxy, which owns the origin policy.
app.add_middleware(InternalProxyAuthMiddleware)
app.add_middleware(RequestIdMiddleware)


def _user_id(x_user_id: str = Header(default="", alias="x-user-id")) -> str:
    uid = x_user_id.strip()
    if not uid:
        raise HTTPException(401, "Missing x-user-id header")
    return uid


_ADMIN_SETTING_TIMEOUT_MS = 2_000


def _admin_env() -> set[str]:
    """The bootstrap allowlist: the same `PLATFORM_ADMIN_UIDS` services/api's
    `_admin_env` reads (API uids, i.e. whatever `x-user-id` carries)."""
    return {p.strip() for p in os.getenv("PLATFORM_ADMIN_UIDS", "").split(",") if p.strip()}


async def _stored_admin_uids() -> set[str]:
    """`platform_settings 'admin.uids'` in the pattadar database.

    The hub pool cannot see that table, so it is read over the public-records
    connection (the pattadar DB, read-only transaction). Unconfigured,
    unreachable or refused all answer the empty set: the caller then falls
    back to the environment list alone, which still fails closed."""
    try:
        rows = await agent_manager.public_records.db.fetch_all(
            "SELECT value FROM public.platform_settings WHERE key = %(key)s",
            {"key": "admin.uids"},
            timeout_ms=_ADMIN_SETTING_TIMEOUT_MS,
        )
    except Exception as exc:
        _log.warning("admin.uids could not be read (%s); env allowlist only", type(exc).__name__)
        return set()
    stored = str((rows[0] if rows else {}).get("value") or "")
    return {p.strip() for p in stored.split(",") if p.strip()}


async def is_admin(uid: str) -> bool:
    """May this uid see AI cost details (per-reply cost, model, tokens, the
    shared Anthropic spend and balance) and set the credit anchor?

    Mirrors services/api web360.py `_is_admin`: the env allowlist unioned with
    `platform_settings 'admin.uids'`, FAILING CLOSED — empty lists, an unknown
    uid or any read error mean "not an admin". Nothing is cached: a revoked
    admin must stop seeing costs on the next request."""
    who = (uid or "").strip()
    if not who or who == "system":
        return False
    if who in _admin_env():
        return True
    return who in await _stored_admin_uids()


async def _require_admin(uid: str) -> None:
    if not await is_admin(uid):
        raise HTTPException(403, "Only a platform admin can see assistant costs")


# What a reply cost and how: shown to platform admins only.
_COST_KEYS = ("cost_usd", "input_tokens", "cache_write_tokens", "cache_read_tokens", "output_tokens", "model")


def _usage_event(admin: bool, cost: dict, model: str, **extra) -> dict:
    """The end-of-reply `usage` SSE event. An owner still gets it (it carries
    the follow-ups and marks the reply finished) but with no cost, model or
    token figure in it."""
    if admin:
        return {"type": "usage", **cost, "model": model, **extra}
    return {"type": "usage", **{k: v for k, v in extra.items() if k not in _COST_KEYS}}


def _redact_conversation(row: dict, admin: bool) -> dict:
    """A conversation row as an owner may see it: without its model."""
    if admin or not isinstance(row, dict):
        return row
    return {k: v for k, v in row.items() if k != "model"}


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


def _stream_response(generator: AsyncGenerator[str, None]) -> StreamingResponse:
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _fixed_stream(event: dict) -> StreamingResponse:
    async def generate() -> AsyncGenerator[str, None]:
        yield ": keepalive\n\n"
        yield _sse(event)
        yield "data: [DONE]\n\n"

    return _stream_response(generate())


async def _mark_run_failed(
    conversation_id: UUID,
    user_id: str,
    run_id: UUID,
    error_code: str,
) -> None:
    try:
        async with pool.connection() as conn:
            await fail_run(conn, conversation_id, user_id, run_id, error_code)
    except Exception:
        _log.exception("Failed to persist failed run %s", run_id)


def _extract_office_text(path: str, mime: str, fname: str) -> str | None:
    low = fname.lower()
    try:
        if low.endswith(".docx") or "wordprocessingml" in mime:
            import docx

            document = docx.Document(path)
            parts = [paragraph.text for paragraph in document.paragraphs if paragraph.text.strip()]
            for table in document.tables:
                for row in table.rows:
                    cells = [cell.text.strip() for cell in row.cells]
                    if any(cells):
                        parts.append(" | ".join(cells))
            return "\n".join(parts).strip() or None
        if low.endswith(".xlsx") or "spreadsheetml" in mime:
            import openpyxl

            workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
            output: list[str] = []
            for sheet in workbook.worksheets:
                output.append(f"# Sheet: {sheet.title}")
                for row in sheet.iter_rows(values_only=True):
                    values = [str(cell) for cell in row if cell is not None]
                    if values:
                        output.append(" | ".join(values))
            return "\n".join(output).strip() or None
    except Exception as exc:
        _log.warning("Office document extraction failed for %s: %s", fname, exc)
    return None


@app.get("/health")
async def health():
    errors: list[str] = []
    try:
        async with pool.connection() as conn:
            await conn.execute("SELECT 1")
            row = await (
                await conn.execute("SELECT to_regclass('r_conversation_messages') AS name")
            ).fetchone()
            if not row or not row["name"]:
                errors.append("messages: table missing")
    except Exception as exc:
        errors.append(f"db: {exc}")

    try:
        from .adapters import model_catalog

        model_catalog.get_catalog().default_model()
    except Exception as exc:
        errors.append(f"model_policy: {exc}")

    if errors:
        return {"status": "unhealthy", "service": "assistant", "errors": errors}
    return {"status": "ok", "service": "assistant"}


@app.get("/internal/metrics")
async def metrics():
    """Under /internal so the gateway refuses to proxy it: aggregate usage and
    error counters are for an in-task scraper, not for signed-in users."""
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/api/capabilities")
async def capabilities():
    """Return redacted optional-capability readiness without affecting chat health."""
    return {"public_records": await agent_manager.public_record_capabilities()}


@app.get("/docs-info")
async def docs_info():
    return {
        "name": "Pattadar Assistant",
        "version": "2.0.0",
        "description": "Pattadar land and property record assistant",
        "endpoints": {
            "chat": "POST /api/chat/stream",
            "conversations": "GET /api/conversations",
            "capabilities": "GET /api/capabilities",
            "health": "GET /health",
        },
    }


@app.get("/api/conversations")
async def list_conversations_endpoint(
    x_user_id: str = Header(default="", alias="x-user-id"),
    status: str = "active",
    limit: int = 50,
    offset: int = 0,
):
    user_id = _user_id(x_user_id)
    admin = await is_admin(user_id)
    async with pool.connection() as conn:
        rows = await list_conversations(conn, user_id, status, limit, offset)
    return {"conversations": [_redact_conversation(row, admin) for row in rows]}


@app.post("/api/conversations", status_code=201)
async def create_conversation_endpoint(
    body: ConversationCreate,
    x_user_id: str = Header(default="", alias="x-user-id"),
):
    user_id = _user_id(x_user_id)
    from .adapters import model_catalog

    try:
        model = model_catalog.get_catalog().default_model()
    except RuntimeError as exc:
        raise HTTPException(503, "No assistant model is currently enabled") from exc
    async with pool.connection() as conn:
        row = await create_conversation(conn, user_id, body.title, model, body.application_context)
        _metrics.conversations_total.inc()
    return _redact_conversation(row, await is_admin(user_id))


_MAX_SAVED_VIEWS = 8
_MAX_SAVED_PROPOSALS = 8


def _chosen_model(requested: str | None) -> str:
    """The person's pick when the platform admin has enabled it, else the default.

    Only models in the admin catalog (platform_models, enabled for the
    assistant) can be chosen, so the admin still decides what is on offer.
    """
    from .adapters import model_catalog

    catalog = model_catalog.get_catalog()
    if requested:
        if not catalog.is_supported(requested):
            raise HTTPException(400, "That model is not enabled for the assistant")
        return requested
    return catalog.default_model()


@app.get("/api/models")
async def assistant_models():
    """Models a person may pick for the assistant, cheapest first, with list prices."""
    from .adapters import model_catalog

    catalog = model_catalog.get_catalog()
    try:
        default = catalog.default_model()
    except RuntimeError:
        default = None
    models = []
    for model in catalog.all_models():
        price = billing.PRICES.get(model.id)
        models.append({
            "id": model.id,
            "name": model.full_name or model.id,
            "tier": model.tier,
            "input_per_mtok": price[0] if price else None,
            "output_per_mtok": price[1] if price else None,
            "default": model.id == default,
        })
    models.sort(key=lambda item: (item["input_per_mtok"] is None, item["input_per_mtok"] or 0))
    return {"models": models, "default": default}


class _CreditAnchor(BaseModel):
    balance_usd: float = Field(ge=0, le=1_000_000)


@app.put("/api/usage/credit")
async def set_credit_anchor(body: _CreditAnchor, x_user_id: str = Header(default="", alias="x-user-id")):
    """Record the balance shown on Anthropic's billing page right now.

    Anthropic gives an API key no balance endpoint, so the remaining credit is
    estimated as this figure minus every reply's cost since it was entered.
    """
    user_id = _user_id(x_user_id)
    # One shared anchor for the whole platform: setting it is an admin act.
    await _require_admin(user_id)
    async with pool.connection() as conn:
        await conn.execute(
            """INSERT INTO r_assistant_credit (id, balance_usd, set_at, set_by, incognito_spend_usd)
               VALUES (1, %s, now(), %s, 0)
               ON CONFLICT (id) DO UPDATE SET balance_usd=EXCLUDED.balance_usd, set_at=now(),
                 set_by=EXCLUDED.set_by, incognito_spend_usd=0""",
            (body.balance_usd, user_id),
        )
    return {"balance_usd": body.balance_usd}


async def _credit_estimate(conn) -> dict:
    anchor = await (await conn.execute(
        "SELECT balance_usd, set_at, incognito_spend_usd FROM r_assistant_credit WHERE id=1"
    )).fetchone()
    if not anchor or anchor["balance_usd"] is None:
        return {"balance_usd": None, "balance_set_at": None}
    rows = await (await conn.execute(
        """SELECT metadata FROM r_conversation_messages
            WHERE role='assistant' AND created_at >= %s AND metadata ? 'usage'""",
        (anchor["set_at"],),
    )).fetchall()
    spent = float(anchor["incognito_spend_usd"] or 0)
    for row in rows:
        metadata = row["metadata"] if isinstance(row["metadata"], dict) else {}
        cost = _saved_cost(metadata)
        if cost is None:
            cost = billing.estimate_cost(str(metadata.get("model") or ""), metadata.get("usage") or {})
        spent += cost or 0
    return {
        "balance_usd": round(float(anchor["balance_usd"]) - spent, 4),
        "balance_set_at": anchor["set_at"].isoformat(),
    }


async def _add_incognito_spend(cost: float | None) -> None:
    """Incognito replies leave no message row, so their cost (a number, no
    content and no user) is added to the balance estimate here."""
    if not cost:
        return
    try:
        async with pool.connection() as conn:
            await conn.execute(
                "UPDATE r_assistant_credit SET incognito_spend_usd = incognito_spend_usd + %s WHERE id=1",
                (cost,),
            )
    except Exception:
        _log.warning("incognito spend could not be added to the credit estimate")


def _saved_cost(metadata: object) -> float | None:
    cost = metadata.get("cost") if isinstance(metadata, dict) else None
    value = cost.get("cost_usd") if isinstance(cost, dict) else None
    return float(value) if isinstance(value, (int, float)) else None


@app.get("/api/usage")
async def usage_summary(x_user_id: str = Header(default="", alias="x-user-id")):
    """Spend so far and whether the last run was refused for lack of credit.

    The remaining balance itself is not available to an API key, so it is
    reported as unknown rather than guessed. Platform admins only: an owner
    sees no AI cost figure, and the balance is the platform's, not theirs.
    """
    user_id = _user_id(x_user_id)
    await _require_admin(user_id)
    async with pool.connection() as conn:
        rows = await (await conn.execute(
            """SELECT metadata, created_at >= date_trunc('day', now()) AS today
                 FROM r_conversation_messages
                WHERE user_id=%s AND role='assistant'
                  AND created_at >= date_trunc('month', now())
                  AND metadata ? 'usage'""",
            (user_id,),
        )).fetchall()
        estimate = await _credit_estimate(conn)
        last = await (await conn.execute(
            """SELECT status, error_code FROM r_conversation_runs
                WHERE user_id=%s AND status IN ('completed', 'failed')
                ORDER BY updated_at DESC LIMIT 1""",
            (user_id,),
        )).fetchone()
    credit = "unknown"
    if last:
        credit = "exhausted" if last["error_code"] == billing.CREDIT_EXHAUSTED else (
            "ok" if last["status"] == "completed" else "unknown"
        )
    today = month = 0.0
    requests_today = 0
    for row in rows:
        metadata = row["metadata"] if isinstance(row["metadata"], dict) else {}
        # Replies saved before per-request cost existed are priced from their usage.
        cost = _saved_cost(metadata)
        if cost is None:
            cost = billing.estimate_cost(str(metadata.get("model") or ""), metadata.get("usage") or {})
        if cost is None:
            continue
        month += cost
        if row["today"]:
            today += cost
            requests_today += 1
    return {
        "today_usd": round(today, 4),
        "month_usd": round(month, 4),
        "requests_today": requests_today,
        "credit_status": credit,
        **estimate,
    }


def _saved_views(metadata: object) -> list[dict]:
    """Record views stored with an assistant reply, re-validated on the way out."""
    views = metadata.get("views") if isinstance(metadata, dict) else None
    if not isinstance(views, list):
        return []
    return [
        view for view in views[:_MAX_SAVED_VIEWS]
        if isinstance(view, dict) and view.get("type") == "records"
        and view.get("kind") in ("table", "report")
    ]


def _saved_proposal_ids(metadata: object) -> list[str]:
    ids = metadata.get("proposals") if isinstance(metadata, dict) else None
    if not isinstance(ids, list):
        return []
    return [str(item) for item in ids[:_MAX_SAVED_PROPOSALS] if isinstance(item, str)]


def _saved_follow_ups(metadata: object) -> list[dict]:
    items = metadata.get("follow_ups") if isinstance(metadata, dict) else None
    if not isinstance(items, list):
        return []
    return [
        {"label": item["label"], "prompt": item["prompt"]}
        for item in items[:4]
        if isinstance(item, dict) and isinstance(item.get("label"), str) and isinstance(item.get("prompt"), str)
    ]


@app.get("/api/conversations/{conversation_id}")
async def get_conversation_endpoint(
    conversation_id: UUID,
    x_user_id: str = Header(default="", alias="x-user-id"),
    include_messages: bool = True,
):
    user_id = _user_id(x_user_id)
    admin = await is_admin(user_id)
    async with pool.connection() as conn:
        conversation = await get_conversation(conn, conversation_id, user_id)
        if not conversation:
            raise HTTPException(404, "Conversation not found")
        result = _redact_conversation({**conversation}, admin)
        # SDK session identifiers are internal implementation details.
        result.pop("sdk_session_id", None)
        result.pop("last_run_id", None)
        # Every priced reply in the chat, not only the loaded page of messages.
        # Admins only: an owner's chat carries no cost or model.
        if admin:
            result["total_cost_usd"] = billing.total_cost(
                await reply_metadata(conn, conversation_id, user_id)
            )
        if include_messages:
            rows = await list_messages(conn, conversation_id, user_id)
            proposals = await get_proposals(
                conn,
                [pid for row in rows for pid in _saved_proposal_ids(row.get("metadata"))],
                user_id,
            )
            result["messages"] = [
                {
                    "role": "human" if row["role"] == "user" else "ai",
                    "content": row["content"],
                    "timestamp": row["created_at"],
                    # Lets Regenerate / Edit & resend name the turn they replace.
                    "run_id": str(row["run_id"]) if row.get("run_id") else None,
                    "views": _saved_views(row.get("metadata")),
                    # Rebuilt from the proposal rows, so a reloaded card shows its
                    # final state and cannot be saved a second time.
                    "proposals": [
                        proposals[pid] for pid in _saved_proposal_ids(row.get("metadata"))
                        if pid in proposals and proposals[pid]["type"] == "proposal"
                    ],
                    # Service request cards, rebuilt the same way with their orders.
                    "service_proposals": [
                        proposals[pid] for pid in _saved_proposal_ids(row.get("metadata"))
                        if pid in proposals and proposals[pid]["type"] == "service_proposal"
                    ],
                    "follow_ups": _saved_follow_ups(row.get("metadata")) if row["role"] != "user" else [],
                    **({
                        "cost_usd": _saved_cost(row.get("metadata")),
                        "model": (row.get("metadata") or {}).get("model") if row["role"] != "user" else None,
                    } if admin else {}),
                }
                for row in rows
            ]
        return result


@app.put("/api/conversations/{conversation_id}")
async def update_conversation_endpoint(
    conversation_id: UUID,
    body: ConversationUpdate,
    x_user_id: str = Header(default="", alias="x-user-id"),
):
    user_id = _user_id(x_user_id)
    async with pool.connection() as conn:
        row = await update_conversation(conn, conversation_id, user_id, body.title, body.status)
        if not row:
            raise HTTPException(404, "Conversation not found")
    return _redact_conversation(row, await is_admin(user_id))


@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation_endpoint(
    conversation_id: UUID,
    x_user_id: str = Header(default="", alias="x-user-id"),
):
    user_id = _user_id(x_user_id)
    async with pool.connection() as conn:
        if not await delete_conversation(conn, conversation_id, user_id):
            raise HTTPException(404, "Conversation not found")
        return {"ok": True}


@app.post("/api/conversations/{conversation_id}/restore")
async def restore_conversation_endpoint(
    conversation_id: UUID,
    x_user_id: str = Header(default="", alias="x-user-id"),
):
    user_id = _user_id(x_user_id)
    async with pool.connection() as conn:
        row = await restore_conversation(conn, conversation_id, user_id)
        if not row:
            raise HTTPException(404, "Conversation not found or not deleted")
    return _redact_conversation(row, await is_admin(user_id))


@app.post("/api/chat/incognito/stream")
async def incognito_chat_stream(
    body: IncognitoChatRequest,
    x_user_id: str = Header(default="", alias="x-user-id"),
):
    """One chat turn with nothing written anywhere: no conversation, message,
    run or attachment row, and no SDK transcript on disk (see agent_runtime's
    no-session-persistence). The browser keeps the history and sends it back.

    That history is untrusted input, so it can only anchor scope the way a real
    conversation does: a prior user turn counts only if it passes the gate on
    its own. Attachments are not offered, since uploading one stores it.
    """
    user_id = _user_id(x_user_id)
    history = [turn.model_dump() for turn in body.history]
    anchored = any(
        turn["role"] == "user" and evaluate_scope(turn["content"], body.application_context).allowed
        for turn in history
    )
    decision = evaluate_scope(
        body.message, body.application_context,
        has_authorized_attachment=False, has_prior_accepted_turn=anchored,
    )
    if not decision.allowed:
        return _fixed_stream({"type": "token", "text": SCOPE_DENIAL_TEXT})

    from .adapters import model_catalog

    try:
        effective_model = _chosen_model(body.model)
    except RuntimeError as exc:
        raise HTTPException(503, "No assistant model is currently enabled") from exc
    try:
        await agent_manager.refresh_prompt()
    except Exception as exc:
        raise HTTPException(503, "Assistant instructions are temporarily unavailable") from exc
    trusted_context = body.application_context if decision.trusted_context else {}
    _, prompt_context = agent_manager._split_contextual_prompt(trusted_context)
    navigation = trusted_context.get("navigation", []) if trusted_context else []
    forms = trusted_context.get("forms", []) if trusted_context else []
    admin = await is_admin(user_id)
    _metrics.chat_total.labels(model=effective_model).inc()
    session_id = str(uuid4())

    async def generate() -> AsyncGenerator[str, None]:
        yield ": keepalive\n\n"
        cost: dict = {}
        emit_done = True
        try:
            with anyio.fail_after(config.chat_timeout_seconds):
                async for event in agent_manager.stream(
                    content=body.message,
                    transcript=history,
                    model=effective_model,
                    prompt_context=prompt_context,
                    navigation=navigation if isinstance(navigation, list) else [],
                    session_id=session_id,
                    forms=forms if isinstance(forms, list) else [],
                    incognito=True,
                ):
                    if event.get("type") == "_result":
                        cost = event.get("cost") or {}
                        continue
                    if event.get("type") in ("proposal", "service_proposal"):
                        # Third guard: the tools are absent and the runtime drops
                        # offers in incognito; this endpoint never relays one.
                        continue
                    yield _sse(event)
            # Server-side accounting counts every reply; only the event is redacted.
            await _add_incognito_spend(cost.get("cost_usd"))
            yield _sse(_usage_event(admin, cost, effective_model, incognito=True))
            # Content-free on purpose: the user id and model, never the words.
            _log.info("incognito chat complete user=%s model=%s", user_id[:12], effective_model)
        except billing.ProviderFailure as exc:
            _metrics.chat_errors_total.labels(error_type=exc.code).inc()
            yield _sse({"type": "error", "code": exc.code, "text": billing.failure_text(exc.code)})
        except Exception as exc:
            _metrics.chat_errors_total.labels(error_type=type(exc).__name__).inc()
            _log.warning("incognito chat failed error=%s", type(exc).__name__)
            yield _sse({"type": "error", "text": "I could not complete that. Try again."})
        except (asyncio.CancelledError, GeneratorExit):
            # Stop pressed. Leaving the SDK client's context tears down its CLI
            # child (the SDK shields that close); nothing is persisted here.
            emit_done = False
            _metrics.chat_errors_total.labels(error_type="client_disconnected").inc()
            raise
        finally:
            if emit_done:
                yield "data: [DONE]\n\n"

    return _stream_response(generate())


@app.post("/api/chat/stream")
async def chat_stream(
    body: ChatRequest,
    x_user_id: str = Header(default="", alias="x-user-id"),
):
    user_id = _user_id(x_user_id)
    run_id = body.run_id or uuid4()
    replaces = body.replaces_run_id if body.replaces_run_id and body.replaces_run_id != run_id else None

    async with AsyncExitStack() as storage:
        try:
            conn = await storage.enter_async_context(pool.connection())
        except Exception as exc:
            _log.exception("Database connection failed for chat stream")
            raise HTTPException(503, "Assistant storage is temporarily unavailable") from exc

        conversation = await get_conversation(conn, body.conversation_id, user_id)
        if not conversation or conversation.get("status") == "deleted":
            raise HTTPException(404, "Conversation not found")

        prior_result = await get_run_assistant_message(conn, body.conversation_id, user_id, run_id)
        if prior_result:
            return _fixed_stream({"type": "token", "text": prior_result["content"]})

        prior_accepted = await has_prior_accepted_turn(conn, body.conversation_id, user_id)
        authorized_attachment = await attachments_belong_to_conversation(
            conn, body.conversation_id, user_id, body.attachment_ids
        )
        if body.attachment_ids and not authorized_attachment:
            raise HTTPException(404, "Attachment not found")

        decision = evaluate_scope(
            body.message,
            body.application_context,
            has_authorized_attachment=authorized_attachment,
            has_prior_accepted_turn=prior_accepted,
        )

        if not decision.allowed:
            inserted = await append_message(
                conn, body.conversation_id, user_id, "user", body.message, run_id,
                {
                    "scope_allowed": False,
                    "scope_reason": decision.reason,
                    "policy_version": decision.policy_version,
                    "attachment_ids": [str(item) for item in body.attachment_ids],
                },
            )
            if inserted:
                await auto_title(conn, body.conversation_id, user_id, body.message)
            await append_message(
                conn, body.conversation_id, user_id, "assistant", SCOPE_DENIAL_TEXT, run_id,
                {"scope_denial": True, "policy_version": decision.policy_version},
            )
            if replaces:
                await supersede_run(conn, body.conversation_id, user_id, replaces)
            return _fixed_stream({"type": "token", "text": SCOPE_DENIAL_TEXT})

        from .adapters import model_catalog

        try:
            effective_model = _chosen_model(body.model)
        except RuntimeError as exc:
            raise HTTPException(503, "No assistant model is currently enabled") from exc

        run_state = await claim_run(conn, body.conversation_id, user_id, run_id)
        if run_state == "completed":
            completed = await get_run_assistant_message(
                conn, body.conversation_id, user_id, run_id
            )
            if completed:
                return _fixed_stream({"type": "token", "text": completed["content"]})
            return _fixed_stream({"type": "error", "text": "This completed response is temporarily unavailable."})
        if run_state in {"running", "busy"}:
            # `run_busy` lets the browser retry: right after a Stop the previous
            # run is still being closed down for a few seconds.
            return _fixed_stream({
                "type": "error",
                "code": "run_busy",
                "text": "Another request is already being processed for this conversation.",
            })

        transcript = await load_bounded_transcript(
            conn, body.conversation_id, user_id, exclude_run_id=run_id,
            superseded_run_id=replaces,
        )

    # Attachment bytes are read only after deterministic scope and ownership checks.
    content: str | list[dict] = body.message
    if body.attachment_ids:
        try:
            async with pool.connection() as attachment_conn:
                blocks, _ = await build_attachment_blocks(
                    attachment_conn, body.attachment_ids, user_id, _extract_office_text
                )
            if blocks:
                blocks.append({"type": "text", "text": body.message})
                content = blocks
        except PermissionError as exc:
            await _mark_run_failed(body.conversation_id, user_id, run_id, "attachment_forbidden")
            raise HTTPException(404, "Attachment not found") from exc
        except AttachmentUnavailable as exc:
            await _mark_run_failed(body.conversation_id, user_id, run_id, "attachment_unavailable")
            raise HTTPException(503, "A selected attachment is temporarily unavailable") from exc

    try:
        await agent_manager.refresh_prompt()
    except Exception as exc:
        await _mark_run_failed(body.conversation_id, user_id, run_id, "prompt_unavailable")
        raise HTTPException(503, "Assistant instructions are temporarily unavailable") from exc
    trusted_context = body.application_context if decision.trusted_context else {}
    _, prompt_context = agent_manager._split_contextual_prompt(trusted_context)
    navigation = trusted_context.get("navigation", []) if trusted_context else []
    forms = trusted_context.get("forms", []) if trusted_context else []

    try:
        async with pool.connection() as persist_conn:
            inserted = await append_message(
                persist_conn, body.conversation_id, user_id, "user", body.message, run_id,
                {
                    "scope_allowed": True,
                    "scope_reason": decision.reason,
                    "policy_version": decision.policy_version,
                    "attachment_ids": [str(item) for item in body.attachment_ids],
                },
            )
            if not inserted:
                existing_user = await (
                    await persist_conn.execute(
                        """SELECT content FROM r_conversation_messages
                             WHERE conversation_id=%s AND user_id=%s AND run_id=%s AND role='user'""",
                        (str(body.conversation_id), user_id, str(run_id)),
                    )
                ).fetchone()
                if not existing_user or existing_user["content"] != body.message:
                    await fail_run(
                        persist_conn, body.conversation_id, user_id, run_id, "run_id_payload_mismatch"
                    )
                    raise HTTPException(409, "This request identifier was already used for different content")
            await auto_title(persist_conn, body.conversation_id, user_id, body.message)
            await set_effective_model(persist_conn, body.conversation_id, user_id, effective_model)
            if trusted_context:
                await update_application_context(
                    persist_conn, str(body.conversation_id), user_id, trusted_context
                )
    except HTTPException:
        raise
    except Exception as exc:
        await _mark_run_failed(body.conversation_id, user_id, run_id, "turn_persistence_failed")
        raise HTTPException(503, "The conversation could not be saved") from exc

    # What this chat's save cards stored, read before the run: it resolves a
    # service request's 'saved_in_chat' and decides the certified-copy offer.
    try:
        async with pool.connection() as offers_conn:
            offer_rows = await chat_offer_rows(offers_conn, body.conversation_id, user_id)
    except Exception:
        _log.exception("chat offers could not be read")
        offer_rows = None
    chat_saved = saved_records_from_rows(offer_rows or [])
    service_requested = any(
        row.get("kind") == "service" and row.get("status") != "dismissed" for row in offer_rows or []
    )

    saved_in_chat = saved_in_chat_reader(pool, body.conversation_id, user_id, offer_rows is not None)
    admin = await is_admin(user_id)

    _metrics.chat_total.labels(model=effective_model).inc()
    started_at = time.perf_counter()

    async def generate() -> AsyncGenerator[str, None]:
        yield ": keepalive\n\n"
        final_text = ""
        final_session = str(run_id)
        final_usage: dict = {}
        final_cost: dict = {}
        views: list[dict] = []
        proposal_ids: list[str] = []
        emit_done = True

        pump = EventPump(
            lambda: agent_manager.stream(
                content=content,
                transcript=transcript,
                model=effective_model,
                prompt_context=prompt_context,
                navigation=navigation if isinstance(navigation, list) else [],
                session_id=str(run_id),
                forms=forms if isinstance(forms, list) else [],
                saved_records=saved_in_chat,
            ),
            config.chat_timeout_seconds,
        )
        pump.start()
        try:
            while True:
                queued = await pump.get(10.0)
                if queued is IDLE:
                    yield ": keepalive\n\n"
                    continue
                if queued is FINISHED:
                    break
                if isinstance(queued, Exception):
                    raise queued
                event = queued
                if event.get("type") == "_result":
                    final_text = str(event.get("text") or "")
                    final_session = str(event.get("session_id") or run_id)
                    final_usage = event.get("usage") or {}
                    final_cost = event.get("cost") or {}
                    continue
                if event.get("type") == "records" and len(views) < _MAX_SAVED_VIEWS:
                    # Saved with the reply so a reloaded conversation still shows it.
                    views.append(event)
                if event.get("type") in ("proposal", "service_proposal"):
                    if len(proposal_ids) >= _MAX_SAVED_PROPOSALS:
                        continue
                    # Stored the moment it is shown, so the card's result PUT
                    # finds its row even while the reply is still streaming.
                    try:
                        async with pool.connection() as proposal_conn:
                            stored = await insert_proposal(
                                proposal_conn, body.conversation_id, user_id, event
                            )
                    except Exception:
                        _log.exception("proposal could not be stored")
                        stored = False
                    if not stored:
                        continue  # never show a card whose outcome cannot be recorded
                    proposal_ids.append(str(event["id"]))
                if event.get("type") == "tool_end":
                    qualified = str(event.get("name") or "tool")
                    parts = qualified.split("__")
                    server = parts[1] if len(parts) > 2 else "unknown"
                    tool_name = parts[-1]
                    _metrics.tool_calls_total.labels(server=server, tool=tool_name).inc()
                yield _sse(event)

            await pump.join()
            if not final_text:
                raise RuntimeError("SDK returned no assistant text")
            reply_follow_ups = chat_follow_ups(
                saved_records=len(chat_saved),
                service_requested=service_requested,
                offered_this_turn=bool(proposal_ids),
                incognito=False,
            )

            async with pool.connection() as save_conn:
                async with save_conn.transaction():
                    await append_message(
                        save_conn, body.conversation_id, user_id, "assistant", final_text, run_id,
                        {
                            "model": effective_model,
                            "usage": final_usage,
                            "sdk_session_id": final_session,
                            "views": views,
                            "proposals": proposal_ids,
                            "cost": final_cost,
                            "follow_ups": reply_follow_ups,
                        },
                    )
                    await update_sdk_session(
                        save_conn, body.conversation_id, user_id, run_id, final_session
                    )
                    await finish_run(save_conn, body.conversation_id, user_id, run_id)
                    if replaces:
                        await supersede_run(save_conn, body.conversation_id, user_id, replaces)
            yield _sse(_usage_event(admin, final_cost, effective_model, follow_ups=reply_follow_ups))

            _metrics.chat_seconds.labels(model=effective_model).observe(time.perf_counter() - started_at)
            _log.info(
                "chat complete conversation=%s model=%s cache_create=%s cache_read=%s",
                body.conversation_id,
                effective_model,
                final_usage.get("cache_creation_input_tokens", 0),
                final_usage.get("cache_read_input_tokens", 0),
            )
        except asyncio.CancelledError:
            # The browser's Stop (or a dropped connection). Starlette cancels
            # through an anyio scope, which re-cancels every later await, so
            # the bookkeeping and the SDK teardown both run shielded.
            emit_done = False
            _metrics.chat_errors_total.labels(error_type="client_disconnected").inc()
            with anyio.CancelScope(shield=True):
                await pump.stop()
                await _mark_run_failed(body.conversation_id, user_id, run_id, "client_disconnected")
            _log.info("chat stopped by client conversation=%s", body.conversation_id)
            raise
        except GeneratorExit:
            # Closed without a cancellation (the response was abandoned). A
            # generator being closed must not yield again, only clean up.
            emit_done = False
            with anyio.CancelScope(shield=True):
                await pump.stop()
                await _mark_run_failed(body.conversation_id, user_id, run_id, "client_disconnected")
            raise
        except billing.ProviderFailure as exc:
            await _mark_run_failed(body.conversation_id, user_id, run_id, exc.code)
            _log.warning("Assistant provider refused the run: %s (%s)", exc.code,
                         billing.failure_detail(exc.code) or "")
            _metrics.chat_errors_total.labels(error_type=exc.code).inc()
            yield _sse({"type": "error", "code": exc.code, "text": billing.failure_text(exc.code)})
        except Exception as exc:
            await _mark_run_failed(
                body.conversation_id, user_id, run_id, type(exc).__name__
            )
            _log.exception("Assistant stream failed for conversation %s", body.conversation_id)
            _metrics.chat_errors_total.labels(error_type=type(exc).__name__).inc()
            yield _sse({"type": "error", "text": "I could not complete that. Try again."})
        finally:
            if not pump.done:
                with anyio.CancelScope(shield=True):
                    await pump.stop()
            if emit_done:
                yield "data: [DONE]\n\n"

    return _stream_response(generate())


@app.put("/api/proposals/{proposal_id}")
async def update_proposal_endpoint(
    proposal_id: UUID,
    body: ProposalUpdate,
    x_user_id: str = Header(default="", alias="x-user-id"),
):
    """Record what the browser did with a confirmation card.

    Handles both kinds. A save card (``proposal``) moves draft → saved,
    partial or dismissed; partial → partial (a retry still failing) or saved;
    dismissed → saved or partial (undone and saved in the open chat). A
    service request card (``service_proposal``) moves the same way with
    ``ordered`` in place of ``saved``, and its results are the orders placed:
    [{index, record_id, service, order_id, order_ref, error}]. The other
    kind's status word, or a save card index over 9, is 422.
    Owner-checked (404 for anyone else's id), forward-only (409). It
    authorises nothing; the save or order itself already happened, or did
    not, through the user's own session to services/api.
    """
    user_id = _user_id(x_user_id)
    results = [item.model_dump() for item in body.results]
    if len({item["index"] for item in results}) != len(results):
        raise HTTPException(422, "Each item index may be reported once")
    async with pool.connection() as conn:
        outcome, proposal = await update_proposal(
            conn, proposal_id, user_id, body.status, results, holding_id=body.holding_id,
        )
    if outcome == "missing":
        raise HTTPException(404, "Proposal not found")
    if outcome == "invalid":
        raise HTTPException(422, "That status or result does not fit this kind of offer")
    if outcome == "conflict":
        raise HTTPException(409, f"This offer is already {proposal['status'] if proposal else 'closed'}")
    return proposal


_REFINE_PER_MINUTE = 20
_refine_hits: dict[str, deque] = {}


def _refine_allowed(user_id: str) -> bool:
    """A light in-process limit: 20 refines a minute per user (per replica)."""
    now = time.monotonic()
    hits = _refine_hits.setdefault(user_id, deque())
    while hits and now - hits[0] > 60:
        hits.popleft()
    if len(hits) >= _REFINE_PER_MINUTE:
        return False
    hits.append(now)
    if len(_refine_hits) > 5_000:
        for key in [key for key, value in _refine_hits.items() if not value or now - value[-1] > 60]:
            _refine_hits.pop(key, None)
    return True


_PARTY_TOOL = "mcp__pattadar_records__find_properties_by_party"


def _refine_words(body: PartySearchRequest) -> str:
    """The refinement as the user would have typed it (the saved user turn)."""
    parts = [f"Show deeds for {body.name.strip()}"]
    if body.villages:
        parts.append("in " + ", ".join(v.strip() for v in body.villages if v.strip()))
    if body.sro:
        parts.append(f"registered at {body.sro.strip()} SRO")
    if body.side:
        parts.append("as buyer" if body.side == "claimant" else "as seller")
    parts.append(
        "with exact (100%) name matches" if body.min_similarity >= 0.999
        else f"with a name match of {round(body.min_similarity * 100)}% or higher"
    )
    return " ".join(parts) + "."


def _refine_summary(view: dict, body: PartySearchRequest) -> str:
    total = int(view.get("total") or 0)
    places = (view.get("query") or {}).get("villages") or []
    sro = (view.get("query") or {}).get("sro")
    where = ""
    if places:
        where = " in " + (", ".join(places[:3]) + (f" +{len(places) - 3} more" if len(places) > 3 else ""))
    if sro:
        where += f" at {sro} SRO"
    level = "100%" if body.min_similarity >= 0.999 else f"≥{round(body.min_similarity * 100)}%"
    noun = "deed" if total == 1 else "deeds"
    if (view.get("facets") or {}).get("sampled"):
        # A capped sample is not a count: never state a confident total (or 0).
        if not total:
            return (f"Refined: none found{where} at {level} confidence in the sample checked — "
                    "the name is too common to check every deed; add the surname or full name.")
        return f"Refined: {total} {noun}{where} at {level} confidence, from a sample — the name is very common."
    return f"Refined: {total} {noun}{where} at {level} confidence."


@app.post("/api/records/party-search")
async def party_search_endpoint(
    body: PartySearchRequest,
    x_user_id: str = Header(default="", alias="x-user-id"),
):
    """Re-run a party search with place / confidence filters, no model call.

    The browser's refine checkboxes post here. It is a records lookup, so the
    same deterministic scope gate applies to the request in words; when a saved
    conversation is named, the refinement and its result are appended to it
    (cost 0). Incognito, or no conversation, writes nothing.
    """
    user_id = _user_id(x_user_id)
    words = _refine_words(body)
    if not evaluate_scope(words).allowed:
        raise HTTPException(422, SCOPE_DENIAL_TEXT)
    if not _refine_allowed(user_id):
        raise HTTPException(429, "Too many refinements; wait a minute and try again.")
    save_to = body.conversation_id if body.conversation_id and not body.incognito else None
    if save_to:
        async with pool.connection() as conn:
            conversation = await get_conversation(conn, save_to, user_id)
        if not conversation or conversation.get("status") == "deleted":
            raise HTTPException(404, "Conversation not found")
    tool_input = {
        "name": body.name, "villages": body.villages, "sro": body.sro,
        "min_similarity": body.min_similarity, "side": body.side,
    }
    try:
        result = await agent_manager.public_records.find_properties_by_party(
            name=body.name,
            side=body.side,
            limit=20,
            min_similarity=body.min_similarity,
            villages=[v for v in body.villages if v.strip()] or None,
            sro=body.sro,
        )
    except ToolInputError as exc:
        raise HTTPException(400, str(exc)) from exc
    except PublicRecordsError as exc:
        raise HTTPException(503, str(exc)) from exc
    view = record_views.record_view(
        _PARTY_TOOL,
        json.dumps(result, ensure_ascii=False, default=str),
        tool_input,
        f"refine-{uuid4()}",
        incognito=body.incognito,
        allow_empty=True,
    )
    text = _refine_summary(view or {}, body)
    if save_to and view:
        run_id = uuid4()
        try:
            async with pool.connection() as conn:
                async with conn.transaction():
                    await append_message(
                        conn, save_to, user_id, "user", words, run_id,
                        {"scope_allowed": True, "scope_reason": "records_refine", "refine": True},
                    )
                    await append_message(
                        conn, save_to, user_id, "assistant", text, run_id,
                        {"views": [view], "cost": {"cost_usd": 0}, "refine": True},
                    )
        except Exception:
            _log.exception("refine could not be saved to conversation %s", save_to)
    return {"view": view, "text": text}


@app.post("/api/attachments", status_code=201)
async def upload_attachment(
    file: UploadFile = File(...),
    conversation_id: str = Form(...),
    attachment_type: str = Form("file"),
    x_user_id: str = Header(default="", alias="x-user-id"),
):
    user_id = _user_id(x_user_id)
    file_bytes = await file.read(config.max_upload_bytes + 1)
    if len(file_bytes) > config.max_upload_bytes:
        raise HTTPException(413, f"File too large (max {config.max_upload_bytes // 1024 // 1024} MB)")

    async with pool.connection() as conn:
        conversation = await get_conversation(conn, UUID(conversation_id), user_id)
        if not conversation:
            raise HTTPException(404, "Conversation not found")
        return await save_attachment(
            conn,
            conversation_id,
            user_id,
            file.filename or "upload",
            file_bytes,
            file.content_type,
            attachment_type,
            config.upload_dir,
        )


@app.get("/api/attachments/{attachment_id}")
async def download_attachment(
    attachment_id: UUID,
    x_user_id: str = Header(default="", alias="x-user-id"),
):
    user_id = _user_id(x_user_id)
    async with pool.connection() as conn:
        row = await get_attachment(conn, str(attachment_id), user_id)
        if not row:
            raise HTTPException(404, "Attachment not found")
        try:
            content = await read_attachment_bytes(row)
        except Exception as exc:
            raise HTTPException(503, "This attachment is temporarily unavailable") from exc
        return Response(
            content,
            media_type=row.get("mime_type") or "application/octet-stream",
            headers={
                "Content-Disposition": "attachment; filename*=UTF-8''" + quote(row["file_name"], safe=""),
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )


from .account_export import router as account_export_router

app.include_router(account_export_router)
