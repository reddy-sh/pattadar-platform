"""File attachment handling for the Assistant service."""

import base64
import asyncio
import hashlib
import logging
import os
import tempfile
import uuid
from pathlib import Path
from typing import Callable, Optional

import psycopg
from psycopg.types.json import Jsonb

_log = logging.getLogger("pattadar.assistant.attachments")


class AttachmentUnavailable(RuntimeError):
    """The selected, authorized attachment cannot currently be read."""



def _s3():
    import boto3
    return boto3.client('s3', region_name=os.getenv('AWS_REGION', 'ap-south-1'))


async def read_attachment_bytes(row: dict) -> bytes:
    """Called only after get_attachment has authorized the conversation owner."""
    if row.get('content') is not None:
        return bytes(row['content'])
    path = row.get('storage_path', '')
    if path.startswith('s3://'):
        bucket, _, key = path[5:].partition('/')
        if bucket != os.getenv('ASSISTANT_ATTACHMENTS_BUCKET', '') or not key.startswith('assistant/'):
            raise ValueError('Attachment storage location is unavailable')
        if row.get('user_id'):
            expected = 'assistant/' + hashlib.sha256(row['user_id'].encode()).hexdigest() + '/'
            if not key.startswith(expected):
                raise AttachmentUnavailable('Attachment ownership does not match storage')
        def read():
            body = _s3().get_object(Bucket=bucket, Key=key)['Body']
            try:
                return body.read()
            finally:
                body.close()
        return await asyncio.to_thread(read)
    if not path or path.startswith('db:'):
        raise AttachmentUnavailable('Attachment bytes are unavailable')
    # Compatibility until the pre-rollout backfill migrates existing files.
    try:
        return await asyncio.to_thread(Path(path).read_bytes)
    except OSError as exc:
        raise AttachmentUnavailable('Legacy attachment bytes are unavailable') from exc


async def _store(conn, user_id: str, conversation_id: str, attachment_id: str, data: bytes, mime: str, *, uploaded=None):
    bucket = os.getenv('ASSISTANT_ATTACHMENTS_BUCKET', '').strip()
    if not bucket:
        # Local installations remain durable without needing cloud accounts:
        # the encrypted database backs up the bytes together with metadata.
        return f'db:{attachment_id}', data
    owner_key = hashlib.sha256(user_id.encode()).hexdigest()
    key = f'assistant/{owner_key}/{conversation_id}/{attachment_id}'
    result = await asyncio.to_thread(_s3().put_object, Bucket=bucket, Key=key, Body=data, ContentType=mime or 'application/octet-stream')
    if uploaded is not None:
        uploaded.update(bucket=bucket, key=key, version=(result or {}).get('VersionId'))
    return f's3://{bucket}/{key}', None


async def build_attachment_blocks(
    conn: psycopg.AsyncConnection,
    attachment_ids: list,
    user_id: str,
    office_extractor: Optional[Callable[[str, str, str], Optional[str]]] = None,
) -> tuple[list[dict], list[dict]]:
    """Turn attachment ids into Anthropic content blocks (image/document/text).

    Returns (content_blocks, image_attachments) where
    image_attachments = [{path, mime_type, filename}].
    """
    blocks: list[dict] = []
    image_attachments: list[dict] = []
    for att_id in attachment_ids:
        row = await get_attachment(conn, str(att_id), user_id)
        if not row:
            raise PermissionError('An attachment is not available to this account')
        mime = row.get("mime_type", "") or ""
        storage_path = row.get("storage_path", "") or ""
        fname = row.get("file_name", "attachment") or "attachment"
        if not storage_path and row.get('content') is None:
            raise AttachmentUnavailable('Attachment bytes are unavailable')
        try:
            data = await read_attachment_bytes(row)
            if mime.startswith("image/"):
                image_attachments.append(
                    {"path": storage_path, "mime_type": mime, "filename": fname}
                )
                b64 = base64.standard_b64encode(data).decode("ascii")
                blocks.append(
                    {"type": "image", "source": {"type": "base64", "media_type": mime, "data": b64}}
                )
            elif mime == "application/pdf" or fname.lower().endswith(".pdf"):
                b64 = base64.standard_b64encode(data).decode("ascii")
                blocks.append(
                    {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": b64}}
                )
            elif mime.startswith("text/") or mime == "application/json" or fname.lower().endswith(
                (".txt", ".md", ".csv", ".json")
            ):
                text = data.decode(errors="replace")[:200_000]
                blocks.append({"type": "text", "text": f"[Attached file: {fname}]\n\n{text}"})
            else:
                # Office parsers need a path. This is a temporary working copy,
                # never the only copy of an attachment.
                doc_text = None
                if office_extractor:
                    with tempfile.TemporaryDirectory(prefix='pattadar-attachment-') as temp:
                        local = Path(temp) / ('document' + Path(fname).suffix)
                        local.write_bytes(data)
                        doc_text = await asyncio.to_thread(office_extractor, str(local), mime, fname)
                if doc_text:
                    blocks.append(
                        {"type": "text", "text": f"[Attached file: {fname}]\n\n{doc_text[:200_000]}"}
                    )
                else:
                    blocks.append(
                        {"type": "text", "text": f"[Attached file '{fname}' ({mime}) could not be read inline.]"}
                    )
        except Exception as e:
            _log.warning("Failed to read attachment %s: %s", att_id, type(e).__name__)
            # Never ask the model to answer as if it saw an unread selected file.
            raise AttachmentUnavailable('A selected attachment could not be read') from e
    return blocks, image_attachments


async def save_attachment(
    conn: psycopg.AsyncConnection,
    conversation_id: str,
    user_id: str,
    file_name: str,
    file_bytes: bytes,
    mime_type: Optional[str],
    attachment_type: str,
    upload_dir: str,
    metadata: Optional[dict] = None,
) -> dict:
    """Store durable bytes before confirming an attachment to its caller.

    upload_dir remains accepted for compatibility with older integrations.
    """
    owns = await (await conn.execute(
        "SELECT 1 FROM r_conversations WHERE id=%s AND user_id=%s", (conversation_id,user_id))).fetchone()
    if not owns:
        raise PermissionError('Conversation is not available to this account')
    attachment_id = str(uuid.uuid4())
    uploaded = {}
    storage_path, content = await _store(conn, user_id, conversation_id, attachment_id, file_bytes, mime_type or '', uploaded=uploaded)
    try:
        async with conn.transaction():
            cur = await conn.execute(
                """INSERT INTO r_attachments
                (id,conversation_id,user_id,file_name,mime_type,file_size,storage_path,attachment_type,metadata,content)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s)
                RETURNING id,conversation_id,user_id,file_name,mime_type,file_size,attachment_type,created_at""",
                (attachment_id,conversation_id,user_id,file_name,mime_type,len(file_bytes),storage_path,
                 attachment_type,Jsonb(metadata or {}),content))
            row = await cur.fetchone()
        return row
    except Exception:
        if uploaded:
            try:
                # A lost commit acknowledgement is ambiguous. Confirm the row
                # is absent before compensation, or we could strand committed
                # metadata by deleting its only durable bytes.
                exists = await (await conn.execute("SELECT 1 FROM r_attachments WHERE id=%s",(attachment_id,))).fetchone()
                if not exists:
                    args = {'Bucket':uploaded['bucket'],'Key':uploaded['key']}
                    if uploaded['version']:
                        args['VersionId'] = uploaded['version']
                    await asyncio.to_thread(_s3().delete_object, **args)
            except Exception:
                _log.error('attachment.cleanup_pending id=%s; retain bytes until metadata can be reconciled', attachment_id)
        raise


async def get_attachment(
    conn: psycopg.AsyncConnection,
    attachment_id: str,
    user_id: str,
) -> Optional[dict]:
    cur = await conn.execute(
        """
        SELECT a.id, a.conversation_id, a.user_id, a.file_name, a.mime_type,
               a.file_size, a.storage_path, a.attachment_type, a.created_at, a.content
        FROM r_attachments a
        JOIN r_conversations c ON c.id = a.conversation_id
        WHERE a.id = %s AND c.user_id = %s AND a.user_id = %s
        """,
        (attachment_id, user_id, user_id),
    )
    return await cur.fetchone()


async def list_attachments(
    conn: psycopg.AsyncConnection,
    conversation_id: str,
    user_id: str,
) -> list[dict]:
    cur = await conn.execute(
        """
        SELECT a.id, a.conversation_id, a.user_id, a.file_name, a.mime_type,
               a.file_size, a.attachment_type, a.created_at
        FROM r_attachments a
        JOIN r_conversations c ON c.id = a.conversation_id
        WHERE a.conversation_id = %s AND c.user_id = %s AND a.user_id = %s
        ORDER BY a.created_at
        """,
        (conversation_id, user_id, user_id),
    )
    return await cur.fetchall()
