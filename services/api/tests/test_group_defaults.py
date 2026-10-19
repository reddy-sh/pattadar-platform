"""group_id '' is "held in your own name", and nothing may quietly undo it.

Three writers used to: init_db's default-Family backfill re-ran on every boot
and re-attached every personal passbook to the owner's oldest family (and
recreated a family the owner had deleted); create_passbook without a group fell
back to the owner's oldest group of any type; and a W360 record insert filed its
new passbook under the oldest family. Each now leaves it personal, and the
backfill runs once per database, guarded by a platform_settings marker.

Against an isolated temporary PostgreSQL (no application database is
contacted); skips when postgres binaries are absent. The W360 insert test uses
test_save_record_deed's throwaway-schema database.
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
CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '');
CREATE TABLE groups (
  id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT 'family',
  name TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE family_members (
  id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '',
  group_id TEXT NOT NULL DEFAULT ''
);
CREATE TABLE passbooks (
  id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL DEFAULT '', pattadar_no TEXT NOT NULL DEFAULT '',
  owner_name TEXT NOT NULL DEFAULT '', father_husband_name TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '', district TEXT NOT NULL DEFAULT '', mandal TEXT NOT NULL DEFAULT '',
  village TEXT NOT NULL DEFAULT '', photo TEXT NOT NULL DEFAULT '',
  group_id TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT ''
);
INSERT INTO users (id, name) VALUES ('owner', 'Ravi');
"""


def info(owner):
    return types.SimpleNamespace(
        context={"request": types.SimpleNamespace(headers={"x-user-id": owner})})


@pytest.fixture(scope="module")
def isolated_postgres():
    initdb, pg_ctl = shutil.which("initdb"), shutil.which("pg_ctl")
    if not initdb or not pg_ctl or os.geteuid() == 0:
        pytest.skip("Temporary postgres requires initdb/pg_ctl and a non-root user")
    with tempfile.TemporaryDirectory(prefix="pattadar-groups-") as directory:
        root = Path(directory)
        data = root / "data"
        subprocess.run([initdb, "-D", str(data), "-A", "trust", "--no-locale", "--encoding=UTF8"],
                       check=True, capture_output=True)
        subprocess.run([pg_ctl, "-D", str(data), "-l", str(root / "postgres.log"), "-o",
                        f"-k {root} -h '' -p 55493", "-w", "start"], check=True, capture_output=True)
        try:
            yield f"host={root} port=55493 dbname=postgres"
        finally:
            subprocess.run([pg_ctl, "-D", str(data), "-m", "immediate", "-w", "stop"],
                           check=True, capture_output=True)


@pytest.fixture
def dsn(isolated_postgres, monkeypatch):
    with psycopg.connect(isolated_postgres, autocommit=True) as conn:
        conn.execute(SCHEMA)

    class Pool:
        @asynccontextmanager
        async def connection(self):
            async with await psycopg.AsyncConnection.connect(
                    isolated_postgres, autocommit=True, row_factory=dict_row) as conn:
                yield conn

    async def log_audit(*_args, **_kwargs):
        return None

    monkeypatch.setattr(main, "pool", Pool())
    monkeypatch.setattr(main, "log_audit", log_audit)
    return isolated_postgres


def sql(dsn, query, args=()):
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        return conn.execute(query, args).fetchall() if query.lstrip().upper().startswith("SELECT") \
            else conn.execute(query, args)


def boot(dsn):
    """The backfill step exactly as init_db runs it on every boot."""
    async def run():
        async with await psycopg.AsyncConnection.connect(
                dsn, autocommit=True, row_factory=dict_row) as conn:
            await main._backfill_default_family_groups(conn)
    asyncio.run(run())


def marker(dsn):
    rows = sql(dsn, "SELECT value FROM platform_settings WHERE key=%s",
               (main.GROUPS_BACKFILL_MARKER,))
    return rows[0]["value"] if rows else None


def test_a_pre_groups_database_is_backfilled_once_and_never_again(dsn):
    sql(dsn, "INSERT INTO passbooks (id, owner_user_id, pattadar_no) VALUES ('pb-1', %s, '11')", (OWNER,))
    sql(dsn, "INSERT INTO family_members (id, owner_user_id, name) VALUES ('fm-1', %s, 'Sita')", (OWNER,))

    boot(dsn)
    fams = sql(dsn, "SELECT id, name FROM groups WHERE owner_user_id=%s", (OWNER,))
    assert [f["name"] for f in fams] == ["Ravi Family"]
    fam = fams[0]["id"]
    assert sql(dsn, "SELECT group_id FROM passbooks WHERE id='pb-1'")[0]["group_id"] == fam
    assert sql(dsn, "SELECT group_id FROM family_members WHERE id='fm-1'")[0]["group_id"] == fam
    assert marker(dsn) == "ran"

    # The owner moves the passbook into their own name, and adds another
    # personal one. Two more boots must leave both exactly where they are.
    sql(dsn, "UPDATE passbooks SET group_id='' WHERE id='pb-1'")
    sql(dsn, "INSERT INTO passbooks (id, owner_user_id, pattadar_no) VALUES ('pb-2', %s, '12')", (OWNER,))
    boot(dsn)
    boot(dsn)
    assert {r["id"]: r["group_id"] for r in sql(dsn, "SELECT id, group_id FROM passbooks")} == {
        "pb-1": "", "pb-2": ""}


def test_a_deleted_family_is_not_recreated_on_the_next_boot(dsn):
    sql(dsn, "INSERT INTO passbooks (id, owner_user_id, pattadar_no) VALUES ('pb-1', %s, '11')", (OWNER,))
    boot(dsn)
    # delete_group: the group goes, its land returns to the owner's own name.
    sql(dsn, "DELETE FROM groups")
    sql(dsn, "UPDATE passbooks SET group_id=''")
    boot(dsn)
    assert sql(dsn, "SELECT id FROM groups") == []
    assert sql(dsn, "SELECT group_id FROM passbooks")[0]["group_id"] == ""


def test_an_existing_database_without_the_marker_is_only_marked(dsn):
    # Groups already exist (the backfill finished long before the marker), and
    # a passbook is held personally. The first boot after this change must
    # write the marker and touch nothing else.
    sql(dsn, "INSERT INTO groups (id, owner_user_id, type, name, created_at)"
             " VALUES ('g-fam', %s, 'family', 'Ravi Family', '2026-01-01')", (OWNER,))
    sql(dsn, "INSERT INTO passbooks (id, owner_user_id, pattadar_no, group_id)"
             " VALUES ('pb-personal', %s, '11', '')", (OWNER,))
    sql(dsn, "INSERT INTO family_members (id, owner_user_id, name, group_id)"
             " VALUES ('fm-loose', %s, 'Sita', '')", (OWNER,))
    # A second owner who has land but no group yet is not given one either.
    sql(dsn, "INSERT INTO passbooks (id, owner_user_id, pattadar_no) VALUES ('pb-other', 'other', '9')")

    boot(dsn)
    boot(dsn)
    assert marker(dsn) == "skipped:groups-existed"
    assert [g["id"] for g in sql(dsn, "SELECT id FROM groups")] == ["g-fam"]
    assert {r["id"]: r["group_id"] for r in sql(dsn, "SELECT id, group_id FROM passbooks")} == {
        "pb-personal": "", "pb-other": ""}
    assert sql(dsn, "SELECT group_id FROM family_members")[0]["group_id"] == ""


def test_create_passbook_without_a_group_stays_personal(dsn):
    # Two groups, the oldest a partnership: neither is a default.
    sql(dsn, "INSERT INTO groups (id, owner_user_id, type, created_at) VALUES"
             " ('g-firm', %s, 'partnership', '2026-01-01'), ('g-fam', %s, 'family', '2026-02-01')",
        (OWNER, OWNER))
    pb = asyncio.run(main.Mutation().create_passbook(
        info(OWNER), pattadar_no="77", state="AP", district="Prakasam",
        mandal="Markapur", village="Katragunta"))
    assert pb.group_id == ""
    assert sql(dsn, "SELECT group_id FROM passbooks WHERE id=%s", (pb.id,))[0]["group_id"] == ""

    # Naming a group still files it there, and somebody else's is refused.
    pb2 = asyncio.run(main.Mutation().create_passbook(
        info(OWNER), pattadar_no="78", state="AP", district="Prakasam",
        mandal="Markapur", village="Katragunta", group_id="g-fam"))
    assert pb2.group_id == "g-fam"
    with pytest.raises(Exception):
        asyncio.run(main.Mutation().create_passbook(
            info("stranger"), pattadar_no="79", state="AP", district="Prakasam",
            mandal="Markapur", village="Katragunta", group_id="g-fam"))


def test_a_w360_parcel_insert_files_its_new_passbook_personally():
    from tests.test_save_record_deed import ME, _deed, _rows, _save, database

    async def run():
        async with database() as pool:
            async with pool.connection() as conn:
                await conn.execute(
                    "INSERT INTO groups (id, owner_user_id, type, created_at)"
                    " VALUES ('g-fam', %s, 'family', '2026-01-01')", (ME,))
            rid = await _save(ME, _deed(kind="parcel", khata_no="501", classification="agri",
                                        extent=2.0, extent_unit="ac", source_ref=""))
            pb = await _rows(pool, "SELECT pb.group_id FROM parcels p JOIN passbooks pb"
                                   " ON pb.id = p.passbook_id WHERE p.id=%s", (rid,))
            assert [r["group_id"] for r in pb] == [""]
    asyncio.run(run())
