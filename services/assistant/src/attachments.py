"""File attachment handling for the Assistant service."""

import base64
import logging
import uuid
from pathlib import Path
from typing import Callable, Optional

import psycopg
from psycopg.types.json import Jsonb

_log = logging.getLogger("pattadar.assistant.attachments")


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
            continue
        mime = row.get("mime_type", "") or ""
        storage_path = row.get("storage_path", "") or ""
        fname = row.get("file_name", "attachment") or "attachment"
        if not storage_path:
            continue
        try:
            if mime.startswith("image/"):
                image_attachments.append(
                    {"path": storage_path, "mime_type": mime, "filename": fname}
                )
                b64 = base64.standard_b64encode(Path(storage_path).read_bytes()).decode("ascii")
                blocks.append(
                    {"type": "image", "source": {"type": "base64", "media_type": mime, "data": b64}}
                )
            elif mime == "application/pdf" or fname.lower().endswith(".pdf"):
                b64 = base64.standard_b64encode(Path(storage_path).read_bytes()).decode("ascii")
                blocks.append(
                    {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": b64}}
                )
            elif mime.startswith("text/") or mime == "application/json" or fname.lower().endswith(
                (".txt", ".md", ".csv", ".json")
            ):
                text = Path(storage_path).read_text(errors="replace")[:200_000]
                blocks.append({"type": "text", "text": f"[Attached file: {fname}]\n\n{text}"})
            else:
                doc_text = office_extractor(storage_path, mime, fname) if office_extractor else None
                if doc_text:
                    blocks.append(
                        {"type": "text", "text": f"[Attached file: {fname}]\n\n{doc_text[:200_000]}"}
                    )
                else:
                    blocks.append(
                        {"type": "text", "text": f"[Attached file '{fname}' ({mime}) could not be read inline.]"}
                    )
        except Exception as e:  # noqa: BLE001
            _log.warning("Failed to read attachment %s: %s", att_id, e)
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
    """Save file to disk and record in r_attachments."""
    conv_dir = Path(upload_dir) / conversation_id
    conv_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file_name).suffix
    storage_name = f"{uuid.uuid4().hex}{ext}"
    storage_path = str(conv_dir / storage_name)

    with open(storage_path, "wb") as f:
        f.write(file_bytes)

    file_size = len(file_bytes)

    cur = await conn.execute(
        """
        INSERT INTO r_attachments
            (conversation_id, user_id, file_name, mime_type, file_size,
             storage_path, attachment_type, metadata)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb)
        RETURNING id, conversation_id, user_id, file_name, mime_type,
                  file_size, attachment_type, created_at
        """,
        (
            conversation_id, user_id, file_name, mime_type, file_size,
            storage_path, attachment_type, Jsonb(metadata or {}),
        ),
    )
    return await cur.fetchone()


async def get_attachment(
    conn: psycopg.AsyncConnection,
    attachment_id: str,
    user_id: str,
) -> Optional[dict]:
    cur = await conn.execute(
        """
        SELECT a.id, a.conversation_id, a.user_id, a.file_name, a.mime_type,
               a.file_size, a.storage_path, a.attachment_type, a.created_at
        FROM r_attachments a
        JOIN r_conversations c ON c.id = a.conversation_id
        WHERE a.id = %s AND c.user_id = %s
        """,
        (attachment_id, user_id),
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
        WHERE a.conversation_id = %s AND c.user_id = %s
        ORDER BY a.created_at
        """,
        (conversation_id, user_id),
    )
    return await cur.fetchall()
