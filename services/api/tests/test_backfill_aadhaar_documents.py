"""scripts/backfill_aadhaar_documents.py on a throwaway PostgreSQL schema.
Local runs only, through main(argv) in-process, with API_DSN pinned to the
throwaway schema's search_path. dev/prod are exercised only up to their
guards, which refuse before any connection. Synthetic Aadhaar data only.
"""
import importlib.util
import os
from pathlib import Path
import re
import secrets
import uuid

import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo
from psycopg.rows import dict_row

from src import aadhaar, web360

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "backfill_aadhaar_documents.py"
TEST_DSN = os.getenv("TEST_PG_DSN", "host=localhost port=5432 dbname=postgres user=rhub password=rhub-dev-pwd")
OWNER, OTHER = "owner-a", "owner-b"

SUBJECTS = """
CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '');
CREATE TABLE family_members (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '', is_self BOOLEAN NOT NULL DEFAULT false);
CREATE TABLE documents (
  id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
  subtitle TEXT NOT NULL DEFAULT '', shelf TEXT NOT NULL DEFAULT '', page_count INTEGER NOT NULL DEFAULT 0,
  record_id TEXT NOT NULL DEFAULT '', parcel_id TEXT NOT NULL DEFAULT '', property_id TEXT NOT NULL DEFAULT '',
  doc_type TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT '', size_bytes BIGINT NOT NULL DEFAULT 0,
  file_ref TEXT NOT NULL DEFAULT '', mime_type TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '',
  joint_fmb_id TEXT NOT NULL DEFAULT ''
);
"""


def load():
    spec = importlib.util.spec_from_file_location("backfill_aadhaar_documents", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def db(monkeypatch):
    schema = "test_backfill_" + secrets.token_hex(8)
    try:
        admin = psycopg.connect(TEST_DSN, autocommit=True)
    except psycopg.OperationalError:
        if os.getenv("TEST_PG_DSN"):
            raise
        pytest.skip("Set TEST_PG_DSN to run PostgreSQL integration tests")
    admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
    dsn = make_conninfo(TEST_DSN, options=f"-csearch_path={schema}")
    for name in ("APP_ENV", "API_DSN", *("PG_HOST", "PG_PORT", "PG_USER", "PG_PASSWORD", "PG_DATABASE")):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("API_DSN", dsn)
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(SUBJECTS)
        conn.execute(aadhaar.DDL)
        for statement in aadhaar.SUBJECT_DDL:
            conn.execute(statement)
        for statement in web360._DDL:
            if "vault_folders" in statement or "folder_id" in statement or "aadhaar_record_id" in statement:
                conn.execute(statement)
        conn.execute("INSERT INTO users (id, name) VALUES (%s, 'Owner'), (%s, 'Other')", (OWNER, OTHER))
        conn.execute("INSERT INTO family_members (id, owner_user_id, name) VALUES "
                     "('kid-a', %s, 'Ravi'), ('kid-b', %s, 'Sita')", (OWNER, OTHER))

        def record(owner, card=True, last4="1234"):
            rid = str(uuid.uuid4())
            conn.execute(
                "INSERT INTO aadhaar_candidates (id, owner_user_id, masked, last4, expires_at, consumed_at, "
                "card_node_id, card_version_id, card_mime) VALUES (%s,%s,%s,%s,now()+interval '1 year',now(),"
                "%s,%s,'application/pdf')",
                (rid, owner, f"XXXX-XXXX-{last4}", last4, str(uuid.uuid4()) if card else "",
                 str(uuid.uuid4()) if card else ""))
            return rid

        kid = record(OWNER)
        mine = record(OWNER, last4="5678")
        theirs = record(OTHER, last4="9012")
        no_card = record(OWNER, card=False)
        unheld = record(OWNER, last4="3456")  # nobody points at it: not filed
        conn.execute("UPDATE family_members SET aadhaar_record_id=%s WHERE id='kid-a'", (kid,))
        conn.execute("UPDATE users SET kyc_aadhaar_record_id=%s WHERE id=%s", (mine, OWNER))
        conn.execute("UPDATE family_members SET aadhaar_record_id=%s WHERE id='kid-b'", (theirs,))
        del no_card, unheld

    def query(statement, params=()):
        with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
            return conn.execute(statement, params).fetchall()

    try:
        yield query
    finally:
        admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
        admin.close()


def cards(query):
    return query("SELECT d.owner_user_id, d.subtitle, f.person_id, p.name AS person FROM documents d "
                 "JOIN vault_folders f ON f.id=d.folder_id JOIN vault_folders p ON p.id=f.parent_id "
                 "WHERE d.aadhaar_record_id<>'' ORDER BY d.owner_user_id, d.subtitle")


def test_dry_run_counts_and_writes_nothing(db, capsys):
    assert load().main(["--environment", "local"]) == 0
    out = capsys.readouterr()
    assert out.out.strip() == "dry_run kept_cards=3 already_filed=0 to_file=3"
    assert db("SELECT count(*) AS n FROM documents")[0]["n"] == 0
    assert db("SELECT count(*) AS n FROM vault_folders")[0]["n"] == 0


def test_execute_files_each_held_card_once_and_prints_no_identifier(db, capsys):
    script = load()
    assert script.main(["--environment", "local", "--execute"]) == 2, "execute needs an approval reference"
    assert db("SELECT count(*) AS n FROM documents")[0]["n"] == 0
    assert script.main(["--environment", "local", "--execute", "--approval-ref", "CHG-test"]) == 0
    assert script.main(["--environment", "local", "--execute", "--approval-ref", "CHG-test"]) == 0
    out = capsys.readouterr().out
    assert "executed kept_cards=3 already_filed=0 to_file=3 filed=3" in out
    assert "executed kept_cards=3 already_filed=3 to_file=0 filed=0" in out
    assert not re.search(r"owner-|kid-|XXXX|Ravi|Sita|[0-9a-f]{8}-[0-9a-f]{4}", out)
    assert [(c["owner_user_id"], c["subtitle"], c["person_id"], c["person"]) for c in cards(db)] == [
        (OWNER, "XXXX-XXXX-1234", "kid-a", "Ravi"),
        (OWNER, "XXXX-XXXX-5678", OWNER, "Owner"),
        (OTHER, "XXXX-XXXX-9012", "kid-b", "Sita"),
    ]


def test_remote_environments_refuse_before_connecting(monkeypatch, capsys):
    script = load()
    monkeypatch.delenv("API_DSN", raising=False)
    monkeypatch.setenv("APP_ENV", "prod")
    assert script.main(["--environment", "prod"]) == 2
    for name in ("PG_HOST", "PG_PORT", "PG_USER", "PG_PASSWORD", "PG_DATABASE"):
        monkeypatch.setenv(name, "fake")
    assert script.main(["--environment", "prod", "--allow-remote"]) == 2
    assert script.main(["--environment", "prod", "--allow-remote", "--approval-ref", "CHG", "--execute"]) == 2
    err = capsys.readouterr().err
    assert "approval-ref" in err and "writers-drained" in err and "fake" not in err
    monkeypatch.setenv("API_DSN", "host=nowhere")
    assert script.main(["--environment", "dev"]) == 2
