"""PostgreSQL-owned conversations, ordered messages, and SDK session metadata."""
from __future__ import annotations

import json
import logging
from typing import Any, Optional
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
               message_count, sdk_session_id, last_run_id,
               created_at, updated_at
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
    params: list[Any] = []
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
    cur = await conn.execute(
        """
        UPDATE r_conversations SET status = 'deleted', updated_at = now()
         WHERE id = %s AND user_id = %s AND status != 'deleted'
        """,
        (str(conversation_id), user_id),
    )
    return cur.rowcount > 0


async def restore_conversation(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
    user_id: str,
) -> Optional[dict]:
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
    await conn.execute(
        """
        UPDATE r_conversations
           SET title = LEFT(%s, 80), updated_at = now()
         WHERE id = %s AND user_id = %s AND (title IS NULL OR title = '')
        """,
        (message, str(conversation_id), user_id),
    )


async def set_effective_model(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
    user_id: str,
    model: str,
) -> None:
    await conn.execute(
        """UPDATE r_conversations SET model=%s, updated_at=now()
            WHERE id=%s AND user_id=%s""",
        (model, str(conversation_id), user_id),
    )


async def append_message(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
    user_id: str,
    role: str,
    content: str,
    run_id: UUID,
    metadata: Optional[dict[str, Any]] = None,
) -> bool:
    """Append one idempotent message. Returns false when this run/role exists."""
    cur = await conn.execute(
        """
        INSERT INTO r_conversation_messages
            (conversation_id, user_id, role, content, run_id, metadata)
        SELECT %s, %s, %s, %s, %s, %s::jsonb
         WHERE EXISTS (
             SELECT 1 FROM r_conversations WHERE id=%s AND user_id=%s
         )
        ON CONFLICT (conversation_id, run_id, role) DO NOTHING
        """,
        (
            str(conversation_id), user_id, role, content, str(run_id),
            Jsonb(metadata or {}), str(conversation_id), user_id,
        ),
    )
    inserted = cur.rowcount > 0
    if inserted and role == "user":
        await conn.execute(
            """UPDATE r_conversations
                  SET message_count=message_count + 1, updated_at=now(), last_run_id=%s
                WHERE id=%s AND user_id=%s""",
            (str(run_id), str(conversation_id), user_id),
        )
    return inserted


async def list_messages(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
    user_id: str,
    limit: int = 200,
) -> list[dict]:
    cur = await conn.execute(
        """
        SELECT role, content, metadata, run_id, created_at
          FROM (
              SELECT m.id, m.role, m.content, m.metadata, m.run_id, m.created_at
                FROM r_conversation_messages m
                LEFT JOIN r_conversation_runs r ON r.run_id = m.run_id
               WHERE m.conversation_id=%s AND m.user_id=%s
                 AND (r.run_id IS NULL OR r.status='completed')
               ORDER BY m.id DESC
               LIMIT %s
          ) recent
         ORDER BY id ASC
        """,
        (str(conversation_id), user_id, limit),
    )
    return await cur.fetchall()


async def load_bounded_transcript(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
    user_id: str,
    *,
    limit: int = 24,
    max_chars: int = 40_000,
    exclude_run_id: UUID | None = None,
) -> list[dict]:
    cur = await conn.execute(
        """
        SELECT role, content, created_at
          FROM (
              SELECT m.id, m.role, m.content, m.created_at
                FROM r_conversation_messages m
                LEFT JOIN r_conversation_runs r ON r.run_id = m.run_id
               WHERE m.conversation_id=%s AND m.user_id=%s
                 AND (r.run_id IS NULL OR r.status='completed')
                 AND (%s::uuid IS NULL OR m.run_id <> %s::uuid)
               ORDER BY m.id DESC
               LIMIT %s
          ) recent
         ORDER BY id ASC
        """,
        (
            str(conversation_id), user_id,
            str(exclude_run_id) if exclude_run_id else None,
            str(exclude_run_id) if exclude_run_id else None,
            limit,
        ),
    )
    rows = await cur.fetchall()
    total = 0
    bounded: list[dict] = []
    for row in reversed(rows):
        size = len(row.get("content") or "")
        if bounded and total + size > max_chars:
            break
        total += size
        bounded.append(row)
    return list(reversed(bounded))


async def has_prior_accepted_turn(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
    user_id: str,
) -> bool:
    row = await (
        await conn.execute(
            """
            SELECT EXISTS(
                SELECT 1 FROM r_conversation_messages m
                JOIN r_conversation_runs r ON r.run_id=m.run_id AND r.status='completed'
                 WHERE m.conversation_id=%s AND m.user_id=%s AND m.role='user'
                   AND m.metadata @> '{"scope_allowed": true}'::jsonb
            ) AS accepted
            """,
            (str(conversation_id), user_id),
        )
    ).fetchone()
    return bool(row and row["accepted"])


async def attachments_belong_to_conversation(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
    user_id: str,
    attachment_ids: list[UUID],
) -> bool:
    if not attachment_ids:
        return False
    row = await (
        await conn.execute(
            """
            SELECT count(*) AS count
              FROM r_attachments
             WHERE conversation_id=%s AND user_id=%s AND id = ANY(%s::uuid[])
            """,
            (str(conversation_id), user_id, [str(item) for item in attachment_ids]),
        )
    ).fetchone()
    return bool(row and row["count"] == len(set(attachment_ids)))


async def get_run_assistant_message(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
    user_id: str,
    run_id: UUID,
) -> Optional[dict]:
    return await (
        await conn.execute(
            """SELECT role, content, metadata, run_id, created_at
                 FROM r_conversation_messages
                WHERE conversation_id=%s AND user_id=%s AND run_id=%s
                  AND role='assistant'""",
            (str(conversation_id), user_id, str(run_id)),
        )
    ).fetchone()


async def update_sdk_session(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
    user_id: str,
    run_id: UUID,
    session_id: str,
) -> None:
    await conn.execute(
        """UPDATE r_conversations
              SET sdk_session_id=%s, last_run_id=%s, updated_at=now()
            WHERE id=%s AND user_id=%s""",
        (session_id, str(run_id), str(conversation_id), user_id),
    )


async def claim_run(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
    user_id: str,
    run_id: UUID,
    *,
    stale_after_minutes: int = 10,
) -> str:
    """Claim the sole active turn for a conversation.

    Returns claimed, completed, running, or busy. Failed and stale claims with
    the same run ID are reclaimable, making client retries idempotent without
    permanently stranding a user-only message.
    """
    await conn.execute(
        """UPDATE r_conversation_runs
              SET status='failed', error_code='stale_run', updated_at=now()
            WHERE conversation_id=%s AND user_id=%s AND status='running'
              AND updated_at < now() - (%s * interval '1 minute')""",
        (str(conversation_id), user_id, stale_after_minutes),
    )
    existing = await (
        await conn.execute(
            """SELECT status,
                      updated_at < now() - (%s * interval '1 minute') AS stale
                 FROM r_conversation_runs
                WHERE run_id=%s AND conversation_id=%s AND user_id=%s""",
            (stale_after_minutes, str(run_id), str(conversation_id), user_id),
        )
    ).fetchone()
    if existing:
        if existing["status"] == "completed":
            return "completed"
        if existing["status"] == "running" and not existing["stale"]:
            return "running"
        try:
            reclaimed = await (
                await conn.execute(
                    """UPDATE r_conversation_runs
                          SET status='running', error_code=NULL, started_at=now(), updated_at=now()
                        WHERE run_id=%s AND conversation_id=%s AND user_id=%s
                          AND status='failed'
                    RETURNING run_id""",
                    (str(run_id), str(conversation_id), user_id),
                )
            ).fetchone()
            return "claimed" if reclaimed else "running"
        except psycopg.errors.UniqueViolation:
            return "busy"

    try:
        await conn.execute(
            """INSERT INTO r_conversation_runs(run_id,conversation_id,user_id,status)
                SELECT %s,%s,%s,'running'
                 WHERE EXISTS(SELECT 1 FROM r_conversations WHERE id=%s AND user_id=%s)""",
            (str(run_id), str(conversation_id), user_id, str(conversation_id), user_id),
        )
        return "claimed"
    except psycopg.errors.UniqueViolation:
        return "busy"


async def finish_run(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
    user_id: str,
    run_id: UUID,
) -> None:
    await conn.execute(
        """UPDATE r_conversation_runs
              SET status='completed', error_code=NULL, updated_at=now()
            WHERE run_id=%s AND conversation_id=%s AND user_id=%s AND status='running'""",
        (str(run_id), str(conversation_id), user_id),
    )


async def fail_run(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
    user_id: str,
    run_id: UUID,
    error_code: str,
) -> None:
    await conn.execute(
        """UPDATE r_conversation_runs
              SET status='failed', error_code=%s, updated_at=now()
            WHERE run_id=%s AND conversation_id=%s AND user_id=%s AND status='running'""",
        (error_code[:80], str(run_id), str(conversation_id), user_id),
    )
