"""Regenerate / Edit & resend: the replaced turn leaves the stored history."""
import asyncio
from uuid import uuid4

from src.adapters.conversation_store import supersede_run
from src.schemas import ChatRequest


class _Cursor:
    def __init__(self, row=None, rowcount=0):
        self._row = row
        self.rowcount = rowcount

    async def fetchone(self):
        return self._row


class _Conn:
    """Answers each statement from a script, recording the SQL it saw."""

    def __init__(self, *, updated: bool, run_exists: bool, deleted: int):
        self.updated = updated
        self.run_exists = run_exists
        self.deleted = deleted
        self.statements: list[str] = []

    async def execute(self, sql, params=()):
        text = " ".join(sql.split())
        self.statements.append(text)
        if text.startswith("UPDATE r_conversation_runs"):
            return _Cursor({"run_id": params[0]} if self.updated else None)
        if text.startswith("SELECT 1 FROM r_conversation_runs"):
            return _Cursor({"?column?": 1} if self.run_exists else None)
        if text.startswith("DELETE FROM r_conversation_messages"):
            return _Cursor(rowcount=self.deleted)
        return _Cursor()


def _run(conn):
    return asyncio.run(supersede_run(conn, uuid4(), "u01", uuid4()))


def test_a_finished_turn_is_marked_superseded_and_its_messages_removed():
    conn = _Conn(updated=True, run_exists=True, deleted=2)
    assert _run(conn) == 2
    assert "error_code='superseded'" in conn.statements[0]
    assert "status <> 'running'" in conn.statements[0]
    assert conn.statements[1].startswith("DELETE FROM r_conversation_messages")
    assert "message_count=GREATEST(message_count - %s, 0)" in conn.statements[2]


def test_a_run_still_in_flight_is_left_alone():
    conn = _Conn(updated=False, run_exists=True, deleted=2)
    assert _run(conn) == 0
    assert not any(statement.startswith("DELETE") for statement in conn.statements)


def test_a_scope_denial_without_a_run_row_is_still_removed():
    conn = _Conn(updated=False, run_exists=False, deleted=2)
    assert _run(conn) == 2


def test_chat_request_accepts_the_run_it_replaces():
    replaced = uuid4()
    body = ChatRequest(conversation_id=uuid4(), message="again", replaces_run_id=replaced)
    assert body.replaces_run_id == replaced
    assert ChatRequest(conversation_id=uuid4(), message="new").replaces_run_id is None
