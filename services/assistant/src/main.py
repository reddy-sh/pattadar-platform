"""Pattadar Assistant FastAPI service with PostgreSQL history and SDK SSE."""
from __future__ import annotations

import asyncio
import json
import logging
import time
from contextlib import AsyncExitStack, asynccontextmanager, suppress
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
from .domain.scope_policy import SCOPE_DENIAL_TEXT, evaluate_scope
from .internal_auth import InternalProxyAuthMiddleware
from .observability import RequestIdMiddleware, install_log_filter
from .schemas import ChatRequest, ConversationCreate, ConversationUpdate

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
    async with pool.connection() as conn:
        return {"conversations": await list_conversations(conn, user_id, status, limit, offset)}


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
        return row


@app.get("/api/conversations/{conversation_id}")
async def get_conversation_endpoint(
    conversation_id: UUID,
    x_user_id: str = Header(default="", alias="x-user-id"),
    include_messages: bool = True,
):
    user_id = _user_id(x_user_id)
    async with pool.connection() as conn:
        conversation = await get_conversation(conn, conversation_id, user_id)
        if not conversation:
            raise HTTPException(404, "Conversation not found")
        result = {**conversation}
        # SDK session identifiers are internal implementation details.
        result.pop("sdk_session_id", None)
        result.pop("last_run_id", None)
        if include_messages:
            rows = await list_messages(conn, conversation_id, user_id)
            result["messages"] = [
                {
                    "role": "human" if row["role"] == "user" else "ai",
                    "content": row["content"],
                    "timestamp": row["created_at"],
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
        return row


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
        return row


@app.post("/api/chat/stream")
async def chat_stream(
    body: ChatRequest,
    x_user_id: str = Header(default="", alias="x-user-id"),
):
    user_id = _user_id(x_user_id)
    run_id = body.run_id or uuid4()

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
            return _fixed_stream({"type": "token", "text": SCOPE_DENIAL_TEXT})

        from .adapters import model_catalog

        try:
            effective_model = model_catalog.get_catalog().default_model()
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
            return _fixed_stream({"type": "error", "text": "Another request is already being processed for this conversation."})

        transcript = await load_bounded_transcript(
            conn, body.conversation_id, user_id, exclude_run_id=run_id
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

    _metrics.chat_total.labels(model=effective_model).inc()
    started_at = time.perf_counter()

    async def generate() -> AsyncGenerator[str, None]:
        yield ": keepalive\n\n"
        final_text = ""
        final_session = str(run_id)
        final_usage: dict = {}
        emit_done = True
        stream_finished = object()
        event_queue: asyncio.Queue[dict | Exception | object] = asyncio.Queue()

        async def produce_events() -> None:
            try:
                with anyio.fail_after(config.chat_timeout_seconds):
                    async for event in agent_manager.stream(
                        content=content,
                        transcript=transcript,
                        model=effective_model,
                        prompt_context=prompt_context,
                        navigation=navigation if isinstance(navigation, list) else [],
                        session_id=str(run_id),
                        forms=forms if isinstance(forms, list) else [],
                    ):
                        await event_queue.put(event)
            except Exception as producer_error:
                await event_queue.put(producer_error)
            finally:
                await event_queue.put(stream_finished)

        producer_task = asyncio.create_task(produce_events())
        try:
            while True:
                try:
                    queued = await asyncio.wait_for(event_queue.get(), timeout=10.0)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                if queued is stream_finished:
                    break
                if isinstance(queued, Exception):
                    raise queued
                event = queued
                if event.get("type") == "_result":
                    final_text = str(event.get("text") or "")
                    final_session = str(event.get("session_id") or run_id)
                    final_usage = event.get("usage") or {}
                    continue
                if event.get("type") == "tool_end":
                    qualified = str(event.get("name") or "tool")
                    parts = qualified.split("__")
                    server = parts[1] if len(parts) > 2 else "unknown"
                    tool_name = parts[-1]
                    _metrics.tool_calls_total.labels(server=server, tool=tool_name).inc()
                yield _sse(event)

            await producer_task
            if not final_text:
                raise RuntimeError("SDK returned no assistant text")

            async with pool.connection() as save_conn:
                async with save_conn.transaction():
                    await append_message(
                        save_conn, body.conversation_id, user_id, "assistant", final_text, run_id,
                        {"model": effective_model, "usage": final_usage, "sdk_session_id": final_session},
                    )
                    await update_sdk_session(
                        save_conn, body.conversation_id, user_id, run_id, final_session
                    )
                    await finish_run(save_conn, body.conversation_id, user_id, run_id)

            _metrics.chat_seconds.labels(model=effective_model).observe(time.perf_counter() - started_at)
            _log.info(
                "chat complete conversation=%s model=%s cache_create=%s cache_read=%s",
                body.conversation_id,
                effective_model,
                final_usage.get("cache_creation_input_tokens", 0),
                final_usage.get("cache_read_input_tokens", 0),
            )
        except asyncio.CancelledError:
            emit_done = False
            await asyncio.shield(
                _mark_run_failed(body.conversation_id, user_id, run_id, "client_disconnected")
            )
            raise
        except Exception as exc:
            await _mark_run_failed(
                body.conversation_id, user_id, run_id, type(exc).__name__
            )
            _log.exception("Assistant stream failed for conversation %s", body.conversation_id)
            _metrics.chat_errors_total.labels(error_type=type(exc).__name__).inc()
            yield _sse({"type": "error", "text": "I couldn't complete that request. Please try again."})
        finally:
            if not producer_task.done():
                producer_task.cancel()
            with suppress(asyncio.CancelledError):
                await producer_task
            if emit_done:
                yield "data: [DONE]\n\n"

    return _stream_response(generate())


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
