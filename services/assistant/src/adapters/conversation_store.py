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
    superseded_run_id: UUID | None = None,
) -> list[dict]:
    cur = await conn.execute(
        """
        SELECT role, content, created_at, metadata
          FROM (
              -- Only the shown views ride along (agent_runtime._shown_rows).
              SELECT m.id, m.role, m.content, m.created_at,
                     jsonb_build_object('views', m.metadata->'views') AS metadata
                FROM r_conversation_messages m
                LEFT JOIN r_conversation_runs r ON r.run_id = m.run_id
               WHERE m.conversation_id=%s AND m.user_id=%s
                 AND (r.run_id IS NULL OR r.status='completed')
                 AND (%s::uuid IS NULL OR m.run_id <> %s::uuid)
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
            str(superseded_run_id) if superseded_run_id else None,
            str(superseded_run_id) if superseded_run_id else None,
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


async def supersede_run(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
    user_id: str,
    run_id: UUID,
) -> int:
    """Removes an earlier turn that a Regenerate or Edit & resend replaced.

    The question and answer are deleted (an edit is often made to take
    something out), and the run is kept as ``failed``/``superseded`` so its id
    can never be replayed. A run still in flight is left alone. Returns the
    number of messages removed.
    """
    run = await (
        await conn.execute(
            """UPDATE r_conversation_runs
                  SET status='failed', error_code='superseded', updated_at=now()
                WHERE run_id=%s AND conversation_id=%s AND user_id=%s AND status <> 'running'
            RETURNING run_id""",
            (str(run_id), str(conversation_id), user_id),
        )
    ).fetchone()
    if not run:
        # A scope denial is stored without a run row; it can still be replaced.
        exists = await (
            await conn.execute(
                "SELECT 1 FROM r_conversation_runs WHERE run_id=%s",
                (str(run_id),),
            )
        ).fetchone()
        if exists:
            return 0
    cur = await conn.execute(
        """DELETE FROM r_conversation_messages
            WHERE conversation_id=%s AND user_id=%s AND run_id=%s""",
        (str(conversation_id), user_id, str(run_id)),
    )
    removed = cur.rowcount or 0
    if removed:
        await conn.execute(
            """UPDATE r_conversations
                  SET message_count=GREATEST(message_count - %s, 0), updated_at=now()
                WHERE id=%s AND user_id=%s""",
            (removed, str(conversation_id), user_id),
        )
    return removed


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


# ── Save offers (proposal cards) ─────────────────────────────────────────────
#
# A proposal row is a record of what the assistant OFFERED and what the
# browser later reported doing with it. It authorises nothing: the save itself
# went through the user's own session to services/api, whose audit is the
# source of truth.

#: status -> the statuses it may move to, per kind. Only forward; ``partial``
#: may be reported again (a retry that still failed) or finish. A
#: ``dismissed`` card can still be undone and acted on in the open chat, and
#: its stored outcome must then say what happened, so it may move on to the
#: finished/partial state — never back to ``draft``.
PROPOSAL_TRANSITIONS: dict[str, frozenset[str]] = {
    "draft": frozenset({"saved", "partial", "dismissed"}),
    "partial": frozenset({"partial", "saved"}),
    "saved": frozenset(),
    "dismissed": frozenset({"saved", "partial"}),
}
#: The service request card (kind 'service'): 'ordered' instead of 'saved'.
SERVICE_TRANSITIONS: dict[str, frozenset[str]] = {
    "draft": frozenset({"ordered", "partial", "dismissed"}),
    "partial": frozenset({"partial", "ordered"}),
    "ordered": frozenset(),
    "dismissed": frozenset({"ordered", "partial"}),
}
TRANSITIONS_BY_KIND = {"records": PROPOSAL_TRANSITIONS, "service": SERVICE_TRANSITIONS}
#: Most results one PUT may report, per kind (records: one per card item;
#: service: one per record x service placed).
MAX_RESULTS_BY_KIND = {"records": 10, "service": 80}
_RECORD_RESULT_KEYS = ("index", "record_id", "error", "stake")
_SERVICE_RESULT_KEYS = ("index", "record_id", "service", "order_id", "order_ref", "error")


def proposal_kind(event: dict[str, Any]) -> str:
    return "service" if event.get("type") == "service_proposal" else "records"


async def insert_proposal(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
    user_id: str,
    proposal: dict[str, Any],
) -> bool:
    """Store a draft offer (save card or service request card) for a
    conversation the user owns. False otherwise."""
    cur = await conn.execute(
        """
        INSERT INTO r_assistant_proposals (id, conversation_id, user_id, draft, status, results, kind)
        SELECT %s, %s, %s, %s::jsonb, 'draft', '[]'::jsonb, %s
         WHERE EXISTS (SELECT 1 FROM r_conversations WHERE id=%s AND user_id=%s)
        ON CONFLICT (id) DO NOTHING
        """,
        (
            str(proposal["id"]), str(conversation_id), user_id, Jsonb(proposal),
            proposal_kind(proposal), str(conversation_id), user_id,
        ),
    )
    return cur.rowcount > 0


def _row_kind(row: dict[str, Any]) -> str:
    if row.get("kind") in ("records", "service"):
        return row["kind"]
    draft = row.get("draft") if isinstance(row.get("draft"), dict) else {}
    return "service" if draft.get("type") == "service_proposal" else "records"


def service_proposal_out(row: dict[str, Any]) -> dict[str, Any]:
    """A stored service request as a ``service_proposal`` event, with the
    orders the browser reported placing."""
    draft = row.get("draft") if isinstance(row.get("draft"), dict) else {}
    results = row.get("results") if isinstance(row.get("results"), list) else []
    return {
        "type": "service_proposal",
        "id": str(row["id"]),
        "status": row.get("status") or "draft",
        "records": [item for item in draft.get("records") or [] if isinstance(item, dict)],
        "requested": [item for item in draft.get("requested") or [] if isinstance(item, str)],
        "note": draft.get("note") if isinstance(draft.get("note"), str) else None,
        "orders": [
            {key: item.get(key) for key in _SERVICE_RESULT_KEYS}
            for item in results if isinstance(item, dict)
        ],
    }


def proposal_out(row: dict[str, Any]) -> dict[str, Any]:
    """The stored draft as its event (``proposal`` or ``service_proposal``),
    with its current outcome."""
    if _row_kind(row) == "service":
        return service_proposal_out(row)
    draft = row.get("draft") if isinstance(row.get("draft"), dict) else {}
    results = row.get("results") if isinstance(row.get("results"), list) else []
    by_index = {
        item.get("index"): item for item in results
        if isinstance(item, dict) and isinstance(item.get("index"), int)
    }
    items = []
    for item in draft.get("items") or []:
        if not isinstance(item, dict):
            continue
        outcome = by_index.get(item.get("index"))
        if outcome:
            item = {**item, "record_id": outcome.get("record_id"), "error": outcome.get("error")}
            if outcome.get("stake") in ("owned", "managed", "watch"):
                item["saved_stake"] = outcome["stake"]
        items.append(item)
    return {
        "type": "proposal",
        "id": str(row["id"]),
        "status": row.get("status") or "draft",
        "stake": draft.get("stake"),
        "items": items,
        "holding_id": row.get("holding_id") if isinstance(row.get("holding_id"), str) else None,
    }


async def get_proposals(
    conn: psycopg.AsyncConnection,
    proposal_ids: list[str],
    user_id: str,
) -> dict[str, dict[str, Any]]:
    """id -> proposal / service_proposal event, for the ids this user owns."""
    ids = [str(item) for item in proposal_ids if item][:50]
    if not ids:
        return {}
    cur = await conn.execute(
        """SELECT id, kind, draft, status, results, holding_id FROM r_assistant_proposals
            WHERE user_id=%s AND id = ANY(%s::uuid[])""",
        (user_id, ids),
    )
    return {str(row["id"]): proposal_out(row) for row in await cur.fetchall()}


def saved_records_from_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """[{record_id, title}] from records-kind proposal rows, oldest first,
    one entry per record id. Only results the browser reported with a
    record_id count; titles come from the stored draft item."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        if _row_kind(row) != "records" or row.get("status") not in ("saved", "partial"):
            continue
        draft = row.get("draft") if isinstance(row.get("draft"), dict) else {}
        items = {
            item.get("index"): item for item in draft.get("items") or []
            if isinstance(item, dict)
        }
        for result in row.get("results") or []:
            if not isinstance(result, dict):
                continue
            record_id = result.get("record_id")
            if not isinstance(record_id, str) or not record_id or record_id in seen or result.get("error"):
                continue
            seen.add(record_id)
            item = items.get(result.get("index")) or {}
            title = item.get("title") if isinstance(item.get("title"), str) else None
            if not title:
                parts = [str(item[key]) for key in ("village", "survey_no") if item.get(key)]
                title = ", ".join(parts) or None
            out.append({"record_id": record_id, "title": title})
    return out


async def chat_offer_rows(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
    user_id: str,
) -> list[dict[str, Any]]:
    """Every offer in a conversation the user owns, oldest first."""
    cur = await conn.execute(
        """SELECT p.id, p.kind, p.draft, p.status, p.results
             FROM r_assistant_proposals p
             JOIN r_conversations c ON c.id = p.conversation_id AND c.user_id = p.user_id
            WHERE p.conversation_id=%s AND p.user_id=%s
            ORDER BY p.created_at ASC
            LIMIT 200""",
        (str(conversation_id), user_id),
    )
    return list(await cur.fetchall())


async def saved_chat_records(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
    user_id: str,
) -> list[dict[str, Any]]:
    """The records this conversation's save cards stored, owner-checked."""
    return saved_records_from_rows(await chat_offer_rows(conn, conversation_id, user_id))


def saved_in_chat_reader(pool: Any, conversation_id: UUID, user_id: str, readable: bool):
    """The ``saved_records`` reader a run hands the service tool: this chat's
    saved records, owner-checked, re-read on every call (a Save clicked while
    the reply streams still counts). ``readable`` False — the offers could not
    be read before the run — fails closed instead of answering 'none saved'."""
    async def read() -> list[dict[str, Any]]:
        if not readable:
            raise RuntimeError("saved records unavailable")
        async with pool.connection() as conn:
            return await saved_chat_records(conn, conversation_id, user_id)
    return read


async def reply_metadata(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
    user_id: str,
) -> list[dict[str, Any]]:
    """The metadata of every priced assistant reply in a conversation."""
    cur = await conn.execute(
        """SELECT metadata FROM r_conversation_messages
            WHERE conversation_id=%s AND user_id=%s AND role='assistant'
              AND (metadata ? 'usage' OR metadata ? 'cost')""",
        (str(conversation_id), user_id),
    )
    return [row["metadata"] for row in await cur.fetchall() if isinstance(row.get("metadata"), dict)]


async def update_proposal(
    conn: psycopg.AsyncConnection,
    proposal_id: UUID,
    user_id: str,
    status: str,
    results: list[dict[str, Any]],
    holding_id: str | None = None,
) -> tuple[str, dict[str, Any] | None]:
    """Move an offer forward. Returns (outcome, proposal):

    ``ok`` (moved, or an identical repeat), ``missing`` (not this user's),
    ``invalid`` (a status or result shape that is not this kind's: 'ordered'
    on a save card, 'saved' on a service request, a records index over 9),
    ``conflict`` (a backwards or sideways move, e.g. saved → dismissed).
    """
    async with conn.transaction():
        row = await (await conn.execute(
            """SELECT id, kind, draft, status, results, holding_id FROM r_assistant_proposals
                WHERE id=%s AND user_id=%s FOR UPDATE""",
            (str(proposal_id), user_id),
        )).fetchone()
        if not row:
            return "missing", None
        kind = _row_kind(row)
        transitions = TRANSITIONS_BY_KIND[kind]
        if status not in transitions:
            return "invalid", proposal_out(row)
        keys = _SERVICE_RESULT_KEYS if kind == "service" else _RECORD_RESULT_KEYS
        if len(results) > MAX_RESULTS_BY_KIND[kind] or any(
            not isinstance(item.get("index"), int) or item["index"] >= MAX_RESULTS_BY_KIND[kind]
            for item in results
        ):
            return "invalid", proposal_out(row)
        # A save card's stake is kept only when reported, so rows stored before
        # it existed still compare equal to a repeat of the same report.
        results = [
            {key: item.get(key) for key in keys if key != "stake" or item.get("stake")}
            for item in results
        ]
        # A holding belongs to a save card that saved something, and is set
        # once: a second, different id is a conflict, never a silent swap.
        stored_holding = row.get("holding_id") or None
        if holding_id and (kind != "records" or status not in ("saved", "partial")):
            return "invalid", proposal_out(row)
        if holding_id and stored_holding and holding_id != stored_holding:
            return "conflict", proposal_out(row)
        new_holding = holding_id or stored_holding
        current = row.get("status") or "draft"
        if current == status and (row.get("results") or []) == results:
            if new_holding == stored_holding:
                return "ok", proposal_out(row)
        elif holding_id and not stored_holding and current == status == "saved":
            # A finished card only gains its holding (the browser's holding
            # step, retried or run by hand after the save): the stored outcome
            # is final, so it is kept as it is rather than refused as a
            # sideways move.
            results = row.get("results") or []
        elif status not in transitions.get(current, frozenset()):
            return "conflict", proposal_out(row)
        updated = await (await conn.execute(
            """UPDATE r_assistant_proposals
                  SET status=%s, results=%s::jsonb, holding_id=%s, updated_at=now()
                WHERE id=%s AND user_id=%s
            RETURNING id, kind, draft, status, results, holding_id""",
            (status, Jsonb(results), new_holding, str(proposal_id), user_id),
        )).fetchone()
        return "ok", proposal_out(updated)
