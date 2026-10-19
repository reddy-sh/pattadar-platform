"""scripts/migrate-property-ids-uuid7.py against a throwaway PostgreSQL database.

A whole database, not a schema: the script scans every non-system schema, so
it must not see anything but the tables made here. Synthetic ids only.
"""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets

import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import make_conninfo
from psycopg.rows import dict_row

from src import audit as a, web360 as w

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "migrate-property-ids-uuid7.py"
TEST_DSN = os.getenv("TEST_PG_DSN", "host=localhost port=5432 dbname=postgres user=rhub password=rhub-dev-pwd")
UUID7 = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
OLD = "rec-0123456789ab"     # an app-minted id
V4 = "5b0c3a52-1d7e-4c1a-9f3e-2b6a8d4e9c10"  # a main.new_id() id from before UUIDv7
SHORT = "pc01"               # a hand-seeded id
SEED = "w360-p-214-2"        # a seed fixture: left alone

DDL = [
    """CREATE TABLE audit_events (id TEXT PRIMARY KEY, actor TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL DEFAULT '', target TEXT NOT NULL DEFAULT '',
        details TEXT NOT NULL DEFAULT '', timestamp TEXT NOT NULL DEFAULT '')""",
    "CREATE TABLE parcels (id TEXT PRIMARY KEY, passbook_id TEXT, created_at TEXT DEFAULT '')",
    "CREATE TABLE properties (id TEXT PRIMARY KEY, owner_user_id TEXT, created_at TIMESTAMPTZ DEFAULT now())",
    """CREATE TABLE combined_property_members (id TEXT PRIMARY KEY,
        parcel_id TEXT REFERENCES parcels(id) ON DELETE CASCADE,
        property_id TEXT REFERENCES properties(id) ON DELETE CASCADE)""",
    "CREATE TABLE share_links (id TEXT PRIMARY KEY, record_id TEXT, manifest TEXT NOT NULL DEFAULT '{}')",
    "CREATE TABLE notes (id TEXT PRIMARY KEY, entity_type TEXT, entity_id TEXT, body TEXT)",
    "CREATE TABLE inbox (id TEXT PRIMARY KEY, payload JSONB)",
]


def load():
    spec = importlib.util.spec_from_file_location("migrate_ids", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture
def db(monkeypatch):
    name = "test_ids_" + secrets.token_hex(6)
    try:
        admin = psycopg.connect(TEST_DSN, autocommit=True)
    except psycopg.OperationalError:
        if os.getenv("TEST_PG_DSN"):
            raise
        pytest.skip("Local test PostgreSQL unavailable; set TEST_PG_DSN in CI")
    admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
    dsn = make_conninfo(TEST_DSN, dbname=name)
    try:
        with psycopg.connect(dsn, autocommit=True) as conn:
            for stmt in DDL + list(a.DDL):
                conn.execute(stmt)
            conn.execute("INSERT INTO parcels VALUES (%s,'pb-1','2026-08-14T10:00:00'), (%s,'pb-1',''),"
                         " (%s,'pb-1',''), (%s,'pb-1','')", (OLD, SHORT, SEED, V4))
            conn.execute("INSERT INTO properties (id, owner_user_id) VALUES ('prop-aaaaaaaaaaaa', 'owner-a')")
            conn.execute("INSERT INTO combined_property_members VALUES ('m1',%s,NULL), ('m2',NULL,'prop-aaaaaaaaaaaa'),"
                         " ('m3',%s,NULL)", (OLD, SHORT))
            conn.execute("INSERT INTO share_links VALUES ('s1',%s,%s)",
                         (OLD, json.dumps({"records": [OLD, SEED], "route": f"/properties/{OLD}/people",
                                           "near": OLD + "x"})))
            conn.execute("INSERT INTO notes VALUES ('n1','record',%s,'pc01 is the old plot'),"
                         " ('n2','record',%s,'about ' || %s), ('n3','record',%s,'')", (SHORT, OLD, V4, SEED))
            conn.execute("INSERT INTO inbox VALUES ('i1', %s)", (json.dumps({"record_id": V4}),))
        monkeypatch.delenv("APP_ENV", raising=False)
        monkeypatch.setenv("API_DSN", dsn)
        yield dsn
    finally:
        admin.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name)))
        admin.close()


def audit_old_ids(dsn):
    """One change filed against the old id, before the migration, the way the app files it."""
    async def run():
        async with await psycopg.AsyncConnection.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
            await w._audit(conn, "owner-a", "set_pin", OLD, "Pin moved", label="Sy 77")
    asyncio.run(run())


def trail(dsn, rid):
    async def run():
        async with await psycopg.AsyncConnection.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
            return await w._trail(conn, "owner-a", rid)
    return asyncio.run(run())


def rows(dsn, query, args=()):
    with psycopg.connect(dsn, row_factory=dict_row) as conn:
        return conn.execute(query, args).fetchall()


def test_dry_run_counts_and_writes_nothing(db, capsys):
    before = rows(db, "SELECT id FROM parcels ORDER BY id")
    assert load().main(["--environment", "local"]) == 0
    out = capsys.readouterr().out
    assert "ids_to_migrate=4 long=3 short=1" in out
    assert "would_rewrite public.share_links.manifest rows=1" in out
    assert "skip public.audit_outbox: append-only or alias table" in out
    assert OLD not in out and SHORT not in out  # counts only
    assert rows(db, "SELECT id FROM parcels ORDER BY id") == before


def test_apply_rewrites_every_reference_and_keeps_the_trail(db, capsys):
    audit_old_ids(db)
    script = load()
    assert script.main(["--environment", "local", "--apply"]) == 2  # no approval reference
    assert script.main(["--environment", "local", "--apply", "--approval-ref", "test"]) == 0
    capsys.readouterr()

    alias = {r["old_id"]: r["new_id"] for r in rows(db, "SELECT old_id, new_id FROM record_id_aliases")}
    assert set(alias) == {OLD, V4, SHORT, "prop-aaaaaaaaaaaa"}
    assert all(UUID7.match(v) for v in alias.values())
    new, short = alias[OLD], alias[SHORT]
    # Backdated to the row's created_at.
    assert int(new.replace("-", "")[:12], 16) == 1786701600000

    assert {r["id"] for r in rows(db, "SELECT id FROM parcels")} == {new, short, SEED, alias[V4]}
    assert {(r["parcel_id"], r["property_id"]) for r in rows(db, "SELECT * FROM combined_property_members")} == {
        (new, None), (None, alias["prop-aaaaaaaaaaaa"]), (short, None)}
    fk = rows(db, "SELECT count(*) AS n FROM pg_constraint WHERE contype='f'"
                  " AND conrelid='combined_property_members'::regclass")
    assert fk[0]["n"] == 2
    link = rows(db, "SELECT record_id, manifest FROM share_links")[0]
    manifest = json.loads(link["manifest"])
    assert link["record_id"] == new
    assert manifest["records"] == [new, SEED] and manifest["route"] == f"/properties/{new}/people"
    assert manifest["near"] == OLD + "x"  # a longer token is not this id
    notes = {r["id"]: r for r in rows(db, "SELECT * FROM notes")}
    assert notes["n1"]["entity_id"] == short and notes["n1"]["body"] == "pc01 is the old plot"
    assert notes["n2"]["entity_id"] == new and notes["n2"]["body"] == "about " + alias[V4]
    assert notes["n3"]["entity_id"] == SEED
    assert rows(db, "SELECT payload FROM inbox")[0]["payload"] == {"record_id": alias[V4]}

    # The chained store still says the old id; the trail finds it through the alias.
    assert [r["resource_id"] for r in rows(db, "SELECT resource_id FROM audit_outbox")] == [OLD]
    assert [(e["action"], e["detail"]) for e in trail(db, new)] == [("set_pin", "Pin moved")]

    # A second run has nothing left to do.
    assert script.main(["--environment", "local", "--apply", "--approval-ref", "test"]) == 0
    assert "ids_to_migrate=0" in capsys.readouterr().out
    assert len(rows(db, "SELECT * FROM record_id_aliases")) == 4
