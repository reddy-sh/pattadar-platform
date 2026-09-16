"""Private, read-only export of one account's conversations and attachments."""
import base64

from fastapi import APIRouter, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from psycopg import sql

router = APIRouter(prefix="/internal/account", tags=["account"])


@router.get("/export")
async def export(request: Request):
    # Import on use to avoid the main module's initialization cycle.
    from .main import _get_conn
    uid = (request.headers.get("x-user-id") or "").strip()
    if not uid:
        raise HTTPException(401, "Authentication required")
    conn = await _get_conn()
    try:
        async with conn.transaction():
            await conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            conversations = await (await conn.execute("SELECT * FROM r_conversations WHERE user_id=%s ORDER BY created_at", (uid,))).fetchall()
            attachments = await (await conn.execute(
                "SELECT a.id,a.conversation_id,a.file_name,a.mime_type,a.file_size,a.attachment_type,a.metadata,a.created_at "
                "FROM r_attachments a JOIN r_conversations c ON c.id=a.conversation_id WHERE c.user_id=%s AND a.user_id=%s", (uid,uid))).fetchall()
            messages = await (await conn.execute(
                "SELECT m.* FROM r_conversation_messages m JOIN r_conversations c ON c.id=m.conversation_id "
                "WHERE c.user_id=%s AND m.user_id=%s ORDER BY m.conversation_id,m.id", (uid,uid))).fetchall()
            runs = await (await conn.execute(
                "SELECT r.* FROM r_conversation_runs r JOIN r_conversations c ON c.id=r.conversation_id "
                "WHERE c.user_id=%s AND r.user_id=%s ORDER BY r.started_at", (uid,uid))).fetchall()
            # Preserve legacy LangGraph history as an explicit compatibility
            # archive. New conversations use the ordered messages above.
            archive = {}
            for table in ("checkpoints", "checkpoint_blobs", "checkpoint_writes"):
                exists = await (await conn.execute("SELECT to_regclass(%s) AS name", (table,))).fetchone()
                if exists["name"]:
                    statement = sql.SQL("SELECT * FROM {} WHERE thread_id IN (SELECT id::text FROM r_conversations WHERE user_id=%s)").format(sql.Identifier(table))
                    archive[table] = await (await conn.execute(statement, (uid,))).fetchall()
        return jsonable_encoder({"conversations": conversations,
            "messages": messages,
            "runs": runs,
            "attachments": [{**a, "downloadUrl": f"/api/gateway/assistant/api/attachments/{a['id']}"} for a in attachments],
            "checkpointArchive": archive}, custom_encoder={bytes: lambda b: {"encoding": "base64", "data": base64.b64encode(b).decode()}})
    finally:
        await conn.close()
