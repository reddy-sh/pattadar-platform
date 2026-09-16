"""Durable, user-scoped document readings with no automatic paid-call retries."""
from __future__ import annotations

import asyncio
import contextlib
import io
import json
import logging
import uuid

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from psycopg.types.json import Jsonb
from starlette.datastructures import Headers

log = logging.getLogger("pattadar.import_jobs")
router = APIRouter()
pool = None
handlers: dict = {}
MAX_BYTES = 25 * 1024 * 1024
DDL = """CREATE TABLE IF NOT EXISTS document_read_jobs (
    id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, operation TEXT NOT NULL,
    filename TEXT NOT NULL, mime TEXT NOT NULL, source BYTEA,
    state TEXT NOT NULL DEFAULT 'queued', status INTEGER NOT NULL DEFAULT 0,
    result JSONB NOT NULL DEFAULT '{}', request_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(owner_user_id, request_key)
)"""


def owner(request: Request) -> str:
    uid = request.headers.get("x-user-id", "").strip()
    if not uid:
        raise HTTPException(401, "Sign in to read a document")
    return uid


async def submit(request: Request, file: UploadFile, operation: str):
    uid = owner(request)
    from . import account
    await account.require_purpose(uid, 'document_processing')
    await account.require_purpose(uid, 'ai_extraction')
    content = await file.read(MAX_BYTES + 1)
    if len(content) > MAX_BYTES:
        raise HTTPException(413, "File too large (max 25 MB)")
    if not content:
        raise HTTPException(400, "Choose a document to read")
    key = request.headers.get("idempotency-key") or uuid.uuid4().hex
    if len(key) > 160:
        raise HTTPException(400, "Invalid reading request identifier")
    async with pool.connection() as conn, conn.transaction():
        # Serialize submissions for one owner so the queue cap is effective
        # when several uploads arrive at the same time.
        await conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 713))", (uid,))
        existing = await (await conn.execute(
            "SELECT id, operation FROM document_read_jobs WHERE owner_user_id=%s AND request_key=%s",
            (uid, key))).fetchone()
        if existing:
            if existing["operation"] != operation:
                raise HTTPException(409, "That request identifier belongs to a different reading")
            return {"job": existing["id"]}
        count = await (await conn.execute(
            "SELECT count(*) AS n FROM document_read_jobs WHERE owner_user_id=%s AND state IN ('queued','running')",
            (uid,))).fetchone()
        if count["n"] >= 3:
            raise HTTPException(429, "Three documents are already being read. Wait for one to finish.")
        job = uuid.uuid4().hex
        await conn.execute(
            "INSERT INTO document_read_jobs (id,owner_user_id,operation,filename,mime,source,request_key) VALUES (%s,%s,%s,%s,%s,%s,%s)",
            (job, uid, operation, file.filename or "document", file.content_type or "application/octet-stream", content, key))
    return {"job": job}


def endpoint(operation: str):
    async def start(request: Request, file: UploadFile = File(...)):
        return await submit(request, file, operation)
    start.__name__ = operation.replace('-', '_') + '_job'
    return start


for _operation in ("import-registered-document", "import-passbook", "extract-property", "extract-aadhaar"):
    router.add_api_route(f"/{_operation}-async", endpoint(_operation), methods=["POST"])


@router.get("/import-status/{job}")
async def status(job: str, request: Request):
    uid = owner(request)
    async with pool.connection() as conn:
        row = await (await conn.execute(
            "SELECT state,status,result FROM document_read_jobs WHERE id=%s AND owner_user_id=%s AND (state='running' OR updated_at > now()-interval '1 day')",
            (job, uid))).fetchone()
    if not row:
        raise HTTPException(404, "This reading is unavailable or has expired. Send the document again.")
    if row["state"] in ("queued", "running"):
        return JSONResponse(content={"state": "running"}, headers={"Cache-Control": "no-store"})
    return JSONResponse(status_code=row["status"] or 500, content={**row["result"], "state": row["state"]}, headers={"Cache-Control": "no-store"})


async def run_one() -> bool:
    async with pool.connection() as conn, conn.transaction():
        row = await (await conn.execute(
            "SELECT * FROM document_read_jobs WHERE state='queued' AND created_at > now()-interval '1 day' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1"
        )).fetchone()
        if not row:
            return False
        await conn.execute("UPDATE document_read_jobs SET state='running',updated_at=now() WHERE id=%s", (row["id"],))
    upload = UploadFile(file=io.BytesIO(bytes(row["source"])), filename=row["filename"], headers=Headers({"content-type": row["mime"]}))
    try:
        # Consent may have changed while waiting in the queue. Recheck before
        # handing document bytes to a paid external provider.
        from . import account
        await account.require_purpose(row["owner_user_id"], 'document_processing')
        await account.require_purpose(row["owner_user_id"], 'ai_extraction')
        # More than the extraction's individual HTTP budget, but finite even
        # if its provider fails to close a socket. Never automatically retry.
        response = await asyncio.wait_for(handlers[row["operation"]](file=upload), timeout=840)
        code = response.status_code if isinstance(response, JSONResponse) else 200
        result = json.loads(response.body) if isinstance(response, JSONResponse) else response
    except asyncio.CancelledError:
        code, result = 503, {"error": "The server stopped during this reading. It was not retried automatically. You may send it again."}
        async with pool.connection() as conn:
            await conn.execute("UPDATE document_read_jobs SET state='failed',status=%s,result=%s,source=NULL,updated_at=now() WHERE id=%s", (code, Jsonb(result), row["id"]))
        raise
    except HTTPException as exc:
        detail = exc.detail
        message = detail.get("message") if isinstance(detail, dict) else detail
        code, result = exc.status_code, {"error": str(message or "The document could not be read.")}
    except Exception:
        log.exception("Document reading failed (job=%s)", row["id"])
        code, result = 502, {"error": "The document could not be read. You can try again."}
    finally:
        await upload.close()
    async with pool.connection() as conn:
        await conn.execute(
            "UPDATE document_read_jobs SET state=%s,status=%s,result=%s,source=NULL,updated_at=now() WHERE id=%s",
            ("done" if code == 200 else "failed", code, Jsonb(result), row["id"]))
    return True


async def worker():
    while True:
        try:
            if not await run_one():
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Document reading queue unavailable")
            await asyncio.sleep(2)


async def maintenance():
    while True:
        try:
            async with pool.connection() as conn:
                # A crashed in-flight provider call may have been charged. Mark
                # it interrupted rather than repeat it on a different task.
                await conn.execute("UPDATE document_read_jobs SET state='failed',status=503,source=NULL,result=%s,updated_at=now() WHERE state='running' AND updated_at < now()-interval '15 minutes'", (Jsonb({"error": "The server stopped during this reading. It was not retried automatically. You may send it again."}),))
                await conn.execute("DELETE FROM document_read_jobs WHERE state<>'running' AND updated_at < now()-interval '1 day'")
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Document reading cleanup unavailable; retrying next interval")
        await asyncio.sleep(60)


@contextlib.asynccontextmanager
async def lifecycle(db_pool, operations: dict):
    global pool, handlers
    pool, handlers = db_pool, operations
    async with pool.connection() as conn:
        await conn.execute(DDL)
        await conn.execute("CREATE INDEX IF NOT EXISTS document_read_jobs_queue ON document_read_jobs(state,created_at)")
    tasks = [asyncio.create_task(worker()) for _ in range(2)] + [asyncio.create_task(maintenance())]
    try:
        yield
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
