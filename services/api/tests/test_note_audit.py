"""A note's removal leaves the same audit line its filing did.

W360 shows notes as permanent, but the iOS client names `deleteNote`, so the
mutation stays — and since 28/09/2026 every removal writes an audit line on
the trail the filing wrote to (main.delete_note, main._note_target), so a note
can no longer leave a property's Activity silently.

Against an isolated temporary PostgreSQL; no application database is
contacted, and the tests skip when postgres binaries are absent.
"""
import asyncio
from contextlib import asynccontextmanager
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import types

import psycopg
from psycopg.rows import dict_row
import pytest

from src import main

OWNER = "owner"

SCHEMA = """
DROP SCHEMA public CASCADE; CREATE SCHEMA public;
CREATE TABLE notes (
  id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT ''
);
"""


def info(owner):
    return types.SimpleNamespace(
        context={"request": types.SimpleNamespace(headers={"x-user-id": owner})})


@pytest.fixture(scope="module")
def isolated_postgres():
    initdb, pg_ctl = shutil.which("initdb"), shutil.which("pg_ctl")
    if not initdb or not pg_ctl or os.geteuid() == 0:
        pytest.skip("Temporary postgres requires initdb/pg_ctl and a non-root user")
    with tempfile.TemporaryDirectory(prefix="pattadar-notes-") as directory:
        root = Path(directory)
        data = root / "data"
        subprocess.run([initdb, "-D", str(data), "-A", "trust", "--no-locale", "--encoding=UTF8"],
                       check=True, capture_output=True)
        subprocess.run([pg_ctl, "-D", str(data), "-l", str(root / "postgres.log"), "-o",
                        f"-k {root} -h '' -p 55487", "-w", "start"], check=True, capture_output=True)
        try:
            yield f"host={root} port=55487 dbname=postgres"
        finally:
            subprocess.run([pg_ctl, "-D", str(data), "-m", "immediate", "-w", "stop"],
                           check=True, capture_output=True)


@pytest.fixture
def db(isolated_postgres, monkeypatch):
    with psycopg.connect(isolated_postgres, autocommit=True) as conn:
        conn.execute(SCHEMA)
        conn.execute("INSERT INTO notes (id, owner_user_id, entity_type, entity_id, body) "
                     "VALUES ('note-r', %s, 'record', 'record-a', 'Gate lock changed')", (OWNER,))
        conn.execute("INSERT INTO notes (id, owner_user_id, entity_type, entity_id, body) "
                     "VALUES ('note-d', %s, 'document', 'doc-a', 'Certified copy')", (OWNER,))

    class Pool:
        @asynccontextmanager
        async def connection(self):
            async with await psycopg.AsyncConnection.connect(
                    isolated_postgres, autocommit=True, row_factory=dict_row) as conn:
                yield conn

    audited: list[tuple[str, str, str, str]] = []

    async def log_audit(_conn, actor, action, target, details="", **_kwargs):
        audited.append((actor, action, target, details))

    monkeypatch.setattr(main, "pool", Pool())
    monkeypatch.setattr(main, "log_audit", log_audit)
    return isolated_postgres, audited


def notes_left(dsn):
    with psycopg.connect(dsn) as conn:
        return sorted(row[0] for row in conn.execute("SELECT id FROM notes"))


def test_removing_a_property_note_is_audited_on_the_propertys_own_trail(db):
    dsn, audited = db
    assert asyncio.run(main.Mutation().delete_note(info(OWNER), "note-r")) is True
    assert notes_left(dsn) == ["note-d"]
    # The record's id, not the note's: the line has to land on the trail the
    # property's Activity tab reads.
    assert audited == [(OWNER, "delete_note", "record-a", "Deleted a note")]


def test_a_document_note_is_audited_under_its_own_id(db):
    dsn, audited = db
    assert asyncio.run(main.Mutation().delete_note(info(OWNER), "note-d")) is True
    assert notes_left(dsn) == ["note-r"]
    assert audited == [(OWNER, "delete_note", "note-d", "Deleted a note")]


def test_somebody_elses_note_is_neither_removed_nor_audited(db):
    dsn, audited = db
    assert asyncio.run(main.Mutation().delete_note(info("stranger"), "note-r")) is False
    assert notes_left(dsn) == ["note-d", "note-r"]
    assert audited == []


def test_a_note_that_is_already_gone_writes_no_audit_line(db):
    dsn, audited = db
    assert asyncio.run(main.Mutation().delete_note(info(OWNER), "note-missing")) is False
    assert notes_left(dsn) == ["note-d", "note-r"]
    assert audited == []


def test_filing_and_removing_a_note_name_the_same_trail():
    for kind in ("parcel", "passbook", "record"):
        assert main._note_target(kind, "entity-1", "note-1") == "entity-1"
    assert main._note_target("document", "entity-1", "note-1") == "note-1"
