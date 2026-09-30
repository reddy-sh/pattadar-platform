"""Documents' folders and tags (W15), against real PostgreSQL.

Set TEST_PG_DSN to the CI database. Every connection's search_path is limited
to a throwaway schema, so no application table is read or written. The
folder DDL under test is the shipped `_DDL`, not a copy.
"""
import asyncio
import os
import secrets
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import psycopg
import pytest
from psycopg import sql
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import audit as a, web360 as w


BASE = [
    """CREATE TABLE audit_events (id TEXT PRIMARY KEY, actor TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL DEFAULT '', target TEXT NOT NULL DEFAULT '',
        details TEXT NOT NULL DEFAULT '', timestamp TEXT NOT NULL DEFAULT '')""",
    "CREATE TABLE passbooks (id TEXT PRIMARY KEY,owner_user_id TEXT,group_id TEXT DEFAULT '')",
    "CREATE TABLE parcels (id TEXT PRIMARY KEY,passbook_id TEXT,survey_no TEXT,subdivision TEXT DEFAULT '')",
    "CREATE TABLE properties (id TEXT PRIMARY KEY,owner_user_id TEXT,label TEXT DEFAULT '')",
    """CREATE TABLE documents (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL,
        joint_fmb_id TEXT NOT NULL DEFAULT '')""",
    """CREATE TABLE record_tags (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL,
        entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, tag TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT '')""",
    "CREATE UNIQUE INDEX uq_record_tags ON record_tags (owner_user_id, entity_type, entity_id, tag)",
]
FOLDER_DDL = [s for s in w._DDL if "vault_folders" in s or "folder_id" in s]

# Real identity keys are `subject_` + 64 hex — long enough that the old
# truncated tag id collided for every tag an owner wrote.
ME = "subject_" + "a" * 64
THEM = "subject_" + "b" * 64


@asynccontextmanager
async def database():
    dsn = os.getenv("TEST_PG_DSN", "host=localhost port=5432 dbname=postgres user=rhub password=rhub-dev-pwd")
    name = "test_folders_" + secrets.token_hex(8)
    try:
        admin = await psycopg.AsyncConnection.connect(dsn, autocommit=True)
    except psycopg.OperationalError:
        if os.getenv("TEST_PG_DSN"):
            raise
        pytest.skip("Local test PostgreSQL unavailable; set TEST_PG_DSN in CI")
    await admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(name)))

    async def configure(conn):
        await conn.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(name)))

    pool = AsyncConnectionPool(dsn, min_size=1, max_size=4, open=False,
        configure=configure, kwargs={"autocommit": True, "row_factory": dict_row})
    old_pool, old_uid = w._pool, w._uid_of
    try:
        await pool.open(); await pool.wait()
        # `info` IS the caller's id in these tests.
        w.bind(pool, lambda info: info)
        async with pool.connection() as conn:
            for stmt in BASE + list(a.DDL) + FOLDER_DDL:
                await conn.execute(stmt)
            for did, owner, joint in (("doc-1", ME, ""), ("doc-2", ME, ""),
                                      ("fmb-a", ME, "j1"), ("fmb-b", ME, "j1"),
                                      ("theirs", THEM, "")):
                await conn.execute(
                    "INSERT INTO documents (id, owner_user_id, joint_fmb_id) VALUES (%s,%s,%s)",
                    (did, owner, joint))
        yield pool
    finally:
        w.bind(old_pool, old_uid)
        await pool.close()
        await admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(name)))
        await admin.close()


def run(coro):
    return asyncio.run(coro)


async def _folder_of(pool, did):
    async with pool.connection() as conn:
        return (await (await conn.execute(
            "SELECT folder_id FROM documents WHERE id=%s", (did,))).fetchone())["folder_id"]


def test_folders_are_made_named_listed_and_counted_per_owner():
    async def go():
        async with database() as pool:
            m, q = w.WebMutation(), w.WebQuery()
            deeds = await m.create_vault_folder(ME, "  Sale   deeds ")
            inner = await m.create_vault_folder(ME, "1998", parent_id=deeds)
            await m.create_vault_folder(THEM, "Theirs")
            assert await m.move_papers_to_folder(ME, ["doc-1", "fmb-a"], deeds) == 2

            mine = {f.name: f for f in await q.vault_folders(ME)}
            assert set(mine) == {"Sale deeds", "1998"}
            assert mine["1998"].parent_id == deeds
            # The joint FMB's two rows are one file, as the list shows them.
            assert mine["Sale deeds"].file_count == 2
            assert mine["Sale deeds"].folder_count == 1
            assert inner and [f.name for f in await q.vault_folders(THEM)] == ["Theirs"]
    run(go())


def test_a_bad_or_duplicate_name_is_refused_with_a_reason():
    async def go():
        async with database() as pool:
            m = w.WebMutation()
            await m.create_vault_folder(ME, "Deeds")
            for bad, why in (("   ", "name"), ("a/b", "/"), ("x" * 81, "80"), ("deeds", "already")):
                with pytest.raises(ValueError, match=why):
                    await m.create_vault_folder(ME, bad)
            # The same name is fine for another owner, and in another folder.
            assert await m.create_vault_folder(THEM, "Deeds")
            other = await m.create_vault_folder(ME, "Other")
            assert await m.create_vault_folder(ME, "Deeds", parent_id=other)
            with pytest.raises(ValueError, match="already"):
                await m.rename_vault_folder(ME, other, "DEEDS")
    run(go())


def test_nobody_files_into_or_edits_a_folder_that_is_not_theirs():
    async def go():
        async with database() as pool:
            m = w.WebMutation()
            theirs = await m.create_vault_folder(THEM, "Private")
            with pytest.raises(ValueError, match="not yours"):
                await m.create_vault_folder(ME, "Inside", parent_id=theirs)
            with pytest.raises(ValueError, match="not yours"):
                await m.move_papers_to_folder(ME, ["doc-1"], theirs)
            assert await m.rename_vault_folder(ME, theirs, "Mine now") is False
            assert await m.delete_vault_folder(ME, theirs) is False
            assert await m.move_vault_folder(ME, theirs, "") is False
            # Someone else's file is skipped, never moved.
            mine = await m.create_vault_folder(ME, "Mine")
            assert await m.move_papers_to_folder(ME, ["theirs"], mine) == 0
            assert await _folder_of(pool, "theirs") == ""
    run(go())


def test_a_folder_cannot_go_inside_itself_or_deeper_than_the_floor():
    async def go():
        async with database() as pool:
            m = w.WebMutation()
            top = await m.create_vault_folder(ME, "Top")
            mid = await m.create_vault_folder(ME, "Mid", parent_id=top)
            with pytest.raises(ValueError, match="inside itself"):
                await m.move_vault_folder(ME, top, mid)
            with pytest.raises(ValueError, match="inside itself"):
                await m.move_vault_folder(ME, top, top)
            parent = ""
            for level in range(w._FOLDER_DEPTH_MAX):
                parent = await m.create_vault_folder(ME, f"L{level}", parent_id=parent)
            with pytest.raises(ValueError, match="levels deep"):
                await m.create_vault_folder(ME, "Too deep", parent_id=parent)
            # Top is two levels tall; under the seventh level it would be nine.
            async with pool.connection() as conn:
                seventh = (await w._folder_chain(conn, ME, parent))[1]
            with pytest.raises(ValueError, match="levels deep"):
                await m.move_vault_folder(ME, top, seventh)
            assert await m.move_vault_folder(ME, mid, "") is True
    run(go())


def test_deleting_a_folder_keeps_every_file_and_lifts_what_was_inside():
    async def go():
        async with database() as pool:
            m, q = w.WebMutation(), w.WebQuery()
            outer = await m.create_vault_folder(ME, "Outer")
            await m.create_vault_folder(ME, "Deeds", parent_id=outer)
            doomed = await m.create_vault_folder(ME, "Doomed", parent_id=outer)
            clash = await m.create_vault_folder(ME, "Deeds", parent_id=doomed)
            await m.move_papers_to_folder(ME, ["doc-2"], doomed)

            assert await m.delete_vault_folder(ME, doomed) is True
            async with pool.connection() as conn:
                n = (await (await conn.execute("SELECT count(*) AS n FROM documents")).fetchone())["n"]
            assert n == 5, "a folder delete must never delete a file"
            assert await _folder_of(pool, "doc-2") == outer
            lifted = {f.id: f for f in await q.vault_folders(ME)}[clash]
            # Two "Deeds" meeting in one folder: the one lifted in gives way.
            assert (lifted.parent_id, lifted.name) == (outer, "Deeds (2)")
    run(go())


def test_moving_to_the_top_level_and_the_joint_fmb_travelling_as_one():
    async def go():
        async with database() as pool:
            m = w.WebMutation()
            f = await m.create_vault_folder(ME, "Maps")
            assert await m.move_papers_to_folder(ME, ["fmb-a"], f) == 1
            assert await _folder_of(pool, "fmb-b") == f
            assert await m.move_papers_to_folder(ME, ["fmb-a", "fmb-a", ""], "") == 1
            assert await _folder_of(pool, "fmb-a") == ""
            assert await m.move_papers_to_folder(ME, [], f) == 0
    run(go())


def test_tags_go_on_and_off_many_owned_files_and_never_on_someone_elses():
    async def go():
        async with database() as pool:
            m = w.WebMutation()
            assert await m.tag_papers(ME, ["doc-1", "doc-2", "theirs"], " give  to lawyer ") == 2
            # Tagging again changes nothing, and does not collide.
            assert await m.tag_papers(ME, ["doc-1"], "give to lawyer") == 0
            assert await m.tag_papers(ME, ["doc-1"], "") == 0
            with pytest.raises(ValueError, match="40"):
                await m.tag_papers(ME, ["doc-1"], "x" * 41)
            # A second, third tag for the same long identity used to hit one
            # truncated primary key; each is its own row now.
            assert await m.set_tag(ME, "paper", "doc-1", "urgent", True) is True
            assert await m.set_tag(ME, "paper", "doc-1", "for bank", True) is True
            assert await m.set_tag(ME, "paper", "theirs", "mine?", True) is False
            async with pool.connection() as conn:
                tagmap = await w._tags_for(conn, ME, "paper")
                theirs = await w._tags_for(conn, THEM, "paper")
            assert sorted(tagmap["doc-1"]) == ["for bank", "give to lawyer", "urgent"]
            assert "theirs" not in tagmap and theirs == {}
            assert await m.tag_papers(ME, ["doc-1", "doc-2"], "give to lawyer", on=False) == 2
            async with pool.connection() as conn:
                tagmap = await w._tags_for(conn, ME, "paper")
            assert sorted(tagmap["doc-1"]) == ["for bank", "urgent"] and "doc-2" not in tagmap
    run(go())
