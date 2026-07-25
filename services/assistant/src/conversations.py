"""CRUD operations for r_conversations table."""

import json
import logging
from typing import Optional
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

_log = logging.getLogger("pattadar.assistant.conversations")


async def create_conversation(
    conn: psycopg.AsyncConnection,
    user_id: str,
    title: Optional[str] = None,
    model: str = "claude-sonnet-4-6",
    application_context: Optional[dict] = None,
) -> dict:
    cur = await conn.execute(
        """
        INSERT INTO r_conversations (user_id, title, model, app_context)
        VALUES (%s, %s, %s, %s::jsonb)
        RETURNING id, user_id, title, model, status, app_context,
                  message_count, created_at, updated_at
        """,
        (user_id, title, model, Jsonb(application_context or {})),
    )
    return await cur.fetchone()


async def list_conversations(
    conn: psycopg.AsyncConnection,
    user_id: str,
    status: str = "active",
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    cur = await conn.execute(
        """
        SELECT id, user_id, title, model, status, app_context,
               message_count, created_at, updated_at
        FROM r_conversations
        WHERE user_id = %s AND status = %s
        ORDER BY updated_at DESC
        LIMIT %s OFFSET %s
        """,
        (user_id, status, limit, offset),
    )
    return await cur.fetchall()


async def get_conversation(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
    user_id: str,
) -> Optional[dict]:
    cur = await conn.execute(
        """
        SELECT id, user_id, title, model, status, app_context,
               message_count, created_at, updated_at
        FROM r_conversations
        WHERE id = %s AND user_id = %s
        """,
        (str(conversation_id), user_id),
    )
    return await cur.fetchone()


async def update_conversation(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
    user_id: str,
    title: Optional[str] = None,
    status: Optional[str] = None,
) -> Optional[dict]:
    sets: list[str] = ["updated_at = now()"]
    params: list = []
    if title is not None:
        sets.append("title = %s")
        params.append(title)
    if status is not None:
        sets.append("status = %s")
        params.append(status)
    params.extend([str(conversation_id), user_id])
    cur = await conn.execute(
        f"""
        UPDATE r_conversations SET {', '.join(sets)}
        WHERE id = %s AND user_id = %s
        RETURNING id, user_id, title, model, status, app_context,
                  message_count, created_at, updated_at
        """,
        params,
    )
    return await cur.fetchone()


async def delete_conversation(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
    user_id: str,
) -> bool:
    """Soft-delete by setting status to 'deleted'."""
    cur = await conn.execute(
        """
        UPDATE r_conversations SET status = 'deleted', updated_at = now()
        WHERE id = %s AND user_id = %s AND status != 'deleted'
        """,
        (str(conversation_id), user_id),
    )
    return cur.rowcount > 0


async def increment_message_count(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
) -> None:
    await conn.execute(
        """
        UPDATE r_conversations
        SET message_count = message_count + 1, updated_at = now()
        WHERE id = %s
        """,
        (str(conversation_id),),
    )


async def restore_conversation(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
    user_id: str,
) -> Optional[dict]:
    """Restore a soft-deleted conversation."""
    cur = await conn.execute(
        """
        UPDATE r_conversations SET status = 'active', updated_at = now()
        WHERE id = %s AND user_id = %s AND status = 'deleted'
        RETURNING id, user_id, title, model, status, app_context,
                  message_count, created_at, updated_at
        """,
        (str(conversation_id), user_id),
    )
    return await cur.fetchone()


async def update_application_context(
    conn: psycopg.AsyncConnection,
    conversation_id: str,
    user_id: str,
    application_context: dict,
) -> None:
    """Store the latest application context snapshot on the conversation."""
    await conn.execute(
        """UPDATE r_conversations
           SET app_context = %s::jsonb, updated_at = now()
           WHERE id = %s AND user_id = %s""",
        (json.dumps(application_context), conversation_id, user_id),
    )


async def auto_title(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
    user_id: str,
    message: str,
) -> None:
    """Set title from first message if not already set (first 80 chars)."""
    await conn.execute(
        """
        UPDATE r_conversations
        SET title = LEFT(%s, 80), updated_at = now()
        WHERE id = %s AND user_id = %s AND (title IS NULL OR title = '')
        """,
        (message, str(conversation_id), user_id),
    )
