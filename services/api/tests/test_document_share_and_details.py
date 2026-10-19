"""Papers-only share links and a paper's registration details, against real
PostgreSQL.

Set TEST_PG_DSN to the CI database. Every connection's search_path is limited
to a throwaway schema, so no application table is read or written. The
share_links, doc_no and name_set DDL is the shipped `_DDL`, not a copy.
"""
import asyncio
import json
import os
import secrets
import sys
from contextlib import asynccontextmanager
from datetime import date, timedelta
from pathlib import Path

import psycopg
import pytest
from fastapi import HTTPException
from psycopg import sql
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import audit as a, capabilities as c, web360 as w


BASE = [
    """CREATE TABLE audit_events (id TEXT PRIMARY KEY, actor TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL DEFAULT '', target TEXT NOT NULL DEFAULT '',
        details TEXT NOT NULL DEFAULT '', timestamp TEXT NOT NULL DEFAULT '')""",
    """CREATE TABLE passbooks (id TEXT PRIMARY KEY, owner_user_id TEXT,
        pattadar_no TEXT DEFAULT '', owner_name TEXT DEFAULT '', village TEXT DEFAULT '',
        mandal TEXT DEFAULT '', district TEXT DEFAULT '', state TEXT DEFAULT '',
        group_id TEXT DEFAULT '')""",
    """CREATE TABLE parcels (id TEXT PRIMARY KEY, passbook_id TEXT, survey_no TEXT,
        subdivision TEXT DEFAULT '', extent DOUBLE PRECISION DEFAULT 0,
        boundary TEXT DEFAULT '', created_at TEXT DEFAULT '')""",
    """CREATE TABLE properties (id TEXT PRIMARY KEY, owner_user_id TEXT,
        label TEXT DEFAULT '', type TEXT DEFAULT 'open_plot', locality TEXT DEFAULT '',
        city TEXT DEFAULT '', district TEXT DEFAULT '', boundary TEXT DEFAULT '',
        group_id TEXT DEFAULT '', created_at TEXT DEFAULT '')""",
    """CREATE TABLE documents (id TEXT PRIMARY KEY, owner_user_id TEXT,
        record_id TEXT DEFAULT '', parcel_id TEXT DEFAULT '', property_id TEXT DEFAULT '',
        passbook_id TEXT DEFAULT '', name TEXT DEFAULT '', title TEXT DEFAULT '',
        subtitle TEXT DEFAULT '', shelf TEXT DEFAULT '', page_count INTEGER DEFAULT 0,
        file_ref TEXT DEFAULT '', mime_type TEXT DEFAULT '', sort INTEGER DEFAULT 0,
        doc_type TEXT DEFAULT '', size_bytes BIGINT DEFAULT 0, source TEXT DEFAULT '',
        registered_on TEXT DEFAULT '', office TEXT DEFAULT '', buyer TEXT DEFAULT '',
        seller TEXT DEFAULT '', consideration DOUBLE PRECISION DEFAULT 0,
        reader_summary TEXT DEFAULT '', reader_flag TEXT DEFAULT '',
        reader_flag_page INTEGER DEFAULT 0, joint_fmb_id TEXT DEFAULT '',
        folder_id TEXT DEFAULT '', aadhaar_record_id TEXT DEFAULT '',
        created_at TEXT DEFAULT '')""",
    """CREATE TABLE document_versions (id TEXT PRIMARY KEY, document_id TEXT,
        version INTEGER DEFAULT 1, label TEXT DEFAULT '', made_on TEXT DEFAULT '',
        made_by TEXT DEFAULT '', note TEXT DEFAULT '', sort INTEGER DEFAULT 0)""",
    """CREATE TABLE record_tags (id TEXT PRIMARY KEY, owner_user_id TEXT DEFAULT '',
        entity_type TEXT DEFAULT '', entity_id TEXT DEFAULT '', tag TEXT DEFAULT '',
        created_at TEXT DEFAULT '')""",
    "CREATE TABLE parcel_photos (id TEXT PRIMARY KEY, parcel_id TEXT, owner_user_id TEXT DEFAULT '', media_kind TEXT DEFAULT 'photo')",
    "CREATE TABLE property_photos (id TEXT PRIMARY KEY, property_id TEXT, owner_user_id TEXT DEFAULT '', media_kind TEXT DEFAULT 'photo')",
    # The storage gateway's node table, where an upload's own name lives.
    "CREATE TABLE storage_nodes (id UUID PRIMARY KEY, name TEXT)",
]
SHIPPED = [s for s in w._DDL if "share_links" in s or "document_record_links" in s
           or "documents ADD COLUMN IF NOT EXISTS doc_no" in s
           or "documents ADD COLUMN IF NOT EXISTS name_set" in s]

ME, THEM = "owner-a", "owner-b"
NODE = "11111111-2222-3333-4444-555555555555"


@asynccontextmanager
async def database():
    dsn = os.getenv("TEST_PG_DSN", "host=localhost port=5432 dbname=postgres user=rhub password=rhub-dev-pwd")
    name = "test_docshare_" + secrets.token_hex(8)
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
        w.bind(pool, lambda info: info)
        a.bind(pool)
        async with pool.connection() as conn:
            for stmt in BASE + list(a.DDL) + SHIPPED:
                await conn.execute(stmt)
            await conn.execute(
                "INSERT INTO properties (id,owner_user_id,label) VALUES ('rec-a',%s,'Plot A')", (ME,))
            for did, owner, nm, ref, shelf, extra in (
                ("doc-1", ME, "Sale deed 1998", NODE, "title", {}),
                ("doc-2", ME, "Encumbrance", "file-2", "search", {}),
                ("doc-3", ME, "Unshared", "file-3", "title", {}),
                ("aad-1", ME, "Aadhaar card", "file-aad", "identity",
                 {"aadhaar_record_id": "ar-1", "source": "aadhaar-card"}),
                ("theirs", THEM, "Their deed", "file-t", "title", {}),
            ):
                await conn.execute(
                    "INSERT INTO documents (id,owner_user_id,name,file_ref,shelf,record_id,"
                    "aadhaar_record_id,source,created_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    (did, owner, nm, ref, shelf, "rec-a" if did == "doc-1" else "",
                     extra.get("aadhaar_record_id", ""), extra.get("source", ""),
                     "2026-10-0" + str(len(did) % 9 + 1)))
            await conn.execute("INSERT INTO storage_nodes (id,name) VALUES (%s,'scan_0042.pdf')", (NODE,))
        yield pool
    finally:
        w.bind(old_pool, old_uid)
        await pool.close()
        await admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(name)))
        await admin.close()


def run(coro):
    return asyncio.run(coro)


async def links(pool):
    async with pool.connection() as conn:
        return list(await (await conn.execute("SELECT * FROM share_links ORDER BY sort")).fetchall())


def token_of(link):
    assert link.startswith("/share/")
    return link.rsplit("/", 1)[1]


# ── 1. Papers-only share links ─────────────────────────────────────────────

def test_owned_documents_share_exactly_those_files():
    async def go():
        async with database() as pool:
            m = w.WebMutation()
            link = await m.create_document_share_link(ME, ["doc-1", "doc-2"], "  Ravi (lawyer) ")
            token = token_of(link)
            assert len(token) == 43
            body = json.loads((await c.recipient_view("shares", token)).body)
            assert [i["id"] for i in body["items"]] == ["doc-1", "doc-2"]
            assert all(i["kind"] == "document" and i["available"] for i in body["items"])
            assert body["title"] == "2 documents" and body["boundary"] is None
            text = json.dumps(body)
            assert ME not in text and NODE not in text and "file-2" not in text
            # Each shared file downloads; anything else on the account does not.
            assert json.loads((await c.file_grant("shares", token, "doc-1")).body) == {
                "owner": ME, "fileRef": NODE}
            assert json.loads((await c.file_grant("shares", token, "doc-2")).body)["fileRef"] == "file-2"
            for other in ("doc-3", "aad-1", "theirs"):
                with pytest.raises(HTTPException) as denied:
                    await c.file_grant("shares", token, other)
                assert denied.value.status_code == 404

            [row] = await links(pool)
            assert row["record_id"] == "" and row["document_id"] == ""
            assert row["doc_count"] == 2 and row["subject"] == "2 documents"
            assert row["terms"] == "view" and row["audience"] == "Ravi (lawyer)"
            assert row["opened_count"] == 1 and token not in row["token_hash"]
            assert row["expires_on"] == (date.today() + timedelta(days=30)).strftime("%d/%m/%Y")
            assert json.loads(row["manifest"])["scope"] == "documents"
    run(go())


def test_one_document_link_names_the_document_and_is_listed():
    async def go():
        async with database() as pool:
            m, q = w.WebMutation(), w.WebQuery()
            assert await m.create_document_share_link(ME, ["doc-2"], "Bank", terms="download", days=900)
            [row] = await links(pool)
            assert row["document_id"] == "doc-2" and row["subject"] == "Encumbrance"
            assert row["terms"] == "download"
            # days clamp to a year, as property links do.
            assert row["expires_on"] == (date.today() + timedelta(days=365)).strftime("%d/%m/%Y")
            vault = await q.vault(ME)
            assert [(l.subject, l.doc_count, l.audience) for l in vault.links] == [("Encumbrance", 1, "Bank")]
            assert vault.links[0].days_left == 365
            assert (await q.vault(THEM)).links == []
            # The single-file link marks the paper as shared, like a property link does.
            assert (await q.document(ME, "doc-2")).shared
            # days below one clamp up to one.
            assert await m.create_document_share_link(ME, ["doc-1"], "Clerk", days=-4)
            assert (await links(pool))[1]["expires_on"] == (date.today() + timedelta(days=1)).strftime("%d/%m/%Y")
    run(go())


def test_refusals_are_all_or_nothing():
    async def go():
        async with database() as pool:
            m = w.WebMutation()
            assert await m.create_document_share_link(ME, ["doc-1", "theirs"], "Ravi") == ""
            assert await m.create_document_share_link(ME, ["theirs"], "Ravi") == ""
            assert await m.create_document_share_link(ME, ["doc-1", "missing"], "Ravi") == ""
            assert await m.create_document_share_link(ME, ["doc-1"], "   ") == ""
            assert await m.create_document_share_link(ME, [], "Ravi") == ""
            # An Aadhaar card is never shared, alone or among other papers.
            assert await m.create_document_share_link(ME, ["aad-1"], "Ravi") == ""
            assert await m.create_document_share_link(ME, ["doc-1", "aad-1"], "Ravi") == ""
            assert await links(pool) == []
    run(go())


def test_expired_and_revoked_links_are_refused():
    async def go():
        async with database() as pool:
            m = w.WebMutation()
            token = token_of(await m.create_document_share_link(ME, ["doc-1"], "Ravi"))
            [row] = await links(pool)
            async with pool.connection() as conn:
                await conn.execute("UPDATE share_links SET expires_on=%s",
                                   ((date.today() - timedelta(days=1)).strftime("%d/%m/%Y"),))
            for call in (c.recipient_view("shares", token), c.file_grant("shares", token, "doc-1")):
                with pytest.raises(HTTPException) as gone:
                    await call
                assert gone.value.status_code == 410
            assert await m.extend_share_link(ME, row["id"], 7)
            await c.recipient_view("shares", token)
            assert await m.revoke_share_link(ME, row["id"])
            for call in (c.recipient_view("shares", token), c.file_grant("shares", token, "doc-1")):
                with pytest.raises(HTTPException) as gone:
                    await call
                assert gone.value.status_code == 410
            assert (await w.WebQuery().vault(ME)).links == []
    run(go())


def test_a_replaced_or_foreign_source_stops_serving():
    async def go():
        async with database() as pool:
            token = token_of(await w.WebMutation().create_document_share_link(ME, ["doc-2"], "Ravi"))
            async with pool.connection() as conn:
                await conn.execute("UPDATE documents SET file_ref='file-2b' WHERE id='doc-2'")
            with pytest.raises(HTTPException) as gone:
                await c.file_grant("shares", token, "doc-2")
            assert gone.value.status_code == 410
            # A record-less row WITHOUT the documents scope is not a grant.
            async with pool.connection() as conn:
                await conn.execute("UPDATE share_links SET manifest=%s",
                                   (json.dumps({"items": [{"id": "doc-2", "kind": "document",
                                                           "title": "x", "file_ref": "file-2b"}]}),))
            with pytest.raises(HTTPException) as gone:
                await c.recipient_view("shares", token)
            assert gone.value.status_code == 410
    run(go())


# ── 2. Paper details ───────────────────────────────────────────────────────

def test_details_round_trip_through_vault_papers_and_document():
    async def go():
        async with database() as pool:
            m, q = w.WebMutation(), w.WebQuery()
            assert await m.update_paper_details(ME, "doc-2", "title", " 1234/1998 ", "03/04/1998", " SRO Podili ")
            paper = {p.id: p for p in await q.vault_papers(ME, "all")}["doc-2"]
            assert (paper.shelf, paper.doc_no, paper.registered_on, paper.office) == (
                "title", "1234/1998", "03/04/1998", "SRO Podili")
            # Day-first, never swapped.
            assert paper.registered_on.startswith("03/04")
            doc = await q.document(ME, "doc-2")
            assert (doc.shelf, doc.doc_no, doc.registered_on, doc.office) == (
                "title", "1234/1998", "03/04/1998", "SRO Podili")
            # '' shelf leaves it; every other field is a full replace.
            assert await m.update_paper_details(ME, "doc-2", "", "", "", "")
            doc = await q.document(ME, "doc-2")
            assert (doc.shelf, doc.doc_no, doc.registered_on, doc.office) == ("title", "", "", "")
            # Per-record papers carry the same fields.
            assert await m.update_paper_details(ME, "doc-1", "", "77/2001", "29/02/2000", "SRO Ongole")
            [rec] = await q.papers(ME, "rec-a")
            assert (rec.doc_no, rec.registered_on, rec.office) == ("77/2001", "29/02/2000", "SRO Ongole")
            async with pool.connection() as conn:
                audit = await (await conn.execute(
                    "SELECT * FROM audit_events WHERE action='update_paper'")).fetchall()
            assert len(audit) == 3
    run(go())


def test_bad_dates_shelves_and_foreign_papers_are_refused():
    async def go():
        async with database() as pool:
            m = w.WebMutation()
            for bad in ("31/02/2026", "29/02/2026", "2026-04-03", "3/4/2026", "13/13/2026", "04/03/26"):
                with pytest.raises(ValueError, match="DD/MM/YYYY"):
                    await m.update_paper_details(ME, "doc-2", "", "1", bad, "")
            with pytest.raises(ValueError, match="shelves"):
                await m.update_paper_details(ME, "doc-2", "attic", "1", "", "")
            assert not await m.update_paper_details(ME, "theirs", "", "1", "01/01/2000", "x")
            assert not await m.update_paper_details(ME, "missing", "", "1", "01/01/2000", "x")
            async with pool.connection() as conn:
                rows = {r["id"]: r for r in await (await conn.execute("SELECT * FROM documents")).fetchall()}
            assert rows["theirs"]["doc_no"] == "" and rows["doc-2"]["doc_no"] == ""
    run(go())


def test_rename_sets_name_set_and_file_name_keeps_the_upload():
    async def go():
        async with database() as pool:
            m, q = w.WebMutation(), w.WebQuery()
            papers = {p.id: p for p in await q.vault_papers(ME, "all")}
            assert not papers["doc-1"].name_set
            # The upload's own name comes from its storage node; with none, the name.
            assert papers["doc-1"].file_name == "scan_0042.pdf"
            assert papers["doc-2"].file_name == "Encumbrance"
            # Re-saving the same name, or moving shelves, is not choosing a name.
            assert await m.update_paper(ME, "doc-1", name="Sale deed 1998")
            assert await m.update_paper(ME, "doc-1", shelf="old")
            assert not (await q.document(ME, "doc-1")).name_set
            assert await m.update_paper(ME, "doc-1", name="Grandfather's deed")
            papers = {p.id: p for p in await q.vault_papers(ME, "all")}
            assert papers["doc-1"].name_set and papers["doc-1"].title == "Grandfather's deed"
            assert papers["doc-1"].file_name == "scan_0042.pdf"
            assert (await q.document(ME, "doc-1")).name_set
            assert not await m.update_paper(ME, "theirs", name="Mine now")
    run(go())


def test_graphql_names():
    schema = w.strawberry.Schema(query=w.WebQuery, mutation=w.WebMutation)
    text = str(schema)
    assert ("createDocumentShareLink(documentIds: [String!]!, audience: String!, "
            "terms: String! = \"view\", days: Int! = 30): String!") in text
    assert ("updatePaperDetails(paperId: String!, shelf: String!, docNo: String!, "
            "registeredOn: String!, office: String!): Boolean!") in text
    paper = text.split("type Paper {", 1)[1].split("}", 1)[0]
    for field in ("docNo: String!", "registeredOn: String!", "office: String!",
                  "nameSet: Boolean!", "fileName: String!"):
        assert field in paper
    view = text.split("type DocumentView {", 1)[1].split("}", 1)[0]
    assert "docNo: String!" in view and "nameSet: Boolean!" in view
