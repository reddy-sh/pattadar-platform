"""scripts/clear_aadhaar.py on throwaway PostgreSQL schemas with a fake S3.

Every run goes through main(argv) in-process. Local runs use real connections
to throwaway schemas (API and hub in separate schemas and connections). dev/prod
runs only ever see fake PG_* values: the connect seam is replaced so they reach
a throwaway schema, never a remote server. Synthetic Aadhaar data only.
"""
import importlib.util
import os
from pathlib import Path
import re
import secrets
import stat
import uuid
import warnings

import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo
from psycopg.rows import dict_row

from src import aadhaar

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "clear_aadhaar.py"
TEST_DSN = os.getenv("TEST_PG_DSN", "host=localhost port=5432 dbname=postgres user=rhub password=rhub-dev-pwd")
BUCKET = "pattadar-test-documents"
PROD_PASSWORD = "prod-secret-pw-value"
MASKED = "XXXX XXXX 1234"
CIPHERTEXT = "synthetic-ciphertext"
ENV_NAMES = ("APP_ENV", "API_DSN", "HUB_DSN", "APP_PG_DSN", "PGPASSWORD", "PG_HOST", "PG_PORT", "PG_USER",
             "PG_PASSWORD", "PG_DATABASE", "STORAGE_BUCKET", "STORAGE_S3_ENDPOINT", "AWS_ACCESS_KEY_ID",
             "AWS_SECRET_ACCESS_KEY")
PROD = ["--environment", "prod", "--allow-remote", "--approval-ref", "CHG-aadhaar-clear"]
STAGE1_LABELS = ("document_read_jobs", "family_members", "users", "beneficiaries", "aadhaar_candidates",
                 "aadhaar_vault")
ZERO_STAGE1 = {label: 0 for label in STAGE1_LABELS}

API_DDL = """
CREATE TABLE users (id TEXT PRIMARY KEY, kyc_ref_masked TEXT NOT NULL DEFAULT '', kyc_ref_enc TEXT NOT NULL DEFAULT '');
CREATE TABLE family_members (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, is_self BOOLEAN NOT NULL DEFAULT false,
  aadhaar_masked TEXT NOT NULL DEFAULT '', aadhaar_enc TEXT NOT NULL DEFAULT '');
CREATE TABLE beneficiaries (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, aadhaar_masked TEXT NOT NULL DEFAULT '');
CREATE TABLE document_read_jobs (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, operation TEXT NOT NULL);
CREATE TABLE documents (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL DEFAULT '', file_ref TEXT NOT NULL DEFAULT '');
CREATE TABLE parcel_photos (id TEXT PRIMARY KEY, file_ref TEXT NOT NULL DEFAULT '');
CREATE TABLE land_expenses (id TEXT PRIMARY KEY, receipt_file_ref TEXT NOT NULL DEFAULT '');
CREATE TABLE record_people (id TEXT PRIMARY KEY, photo_ref TEXT NOT NULL DEFAULT '');
"""
API_REFERENCE_COLUMNS = 4  # documents, parcel_photos, land_expenses, record_people

HUB_DDL = """
CREATE TABLE storage_nodes (id UUID PRIMARY KEY, owner_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('folder','file')), name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE storage_versions (id UUID PRIMARY KEY, node_id UUID NOT NULL REFERENCES storage_nodes(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL, object_key TEXT NOT NULL);
"""


def dsn(schema, rds=False):
    options = f"-c search_path={schema}" + (" -c rds.extensions=plpgsql" if rds else "")
    return make_conninfo(TEST_DSN, options=options)


def open_conn(schema, rds=False):
    return psycopg.connect(dsn(schema, rds), autocommit=True, row_factory=dict_row)


def build_api(conn):
    conn.execute(API_DDL)
    conn.execute(aadhaar.DDL)
    for statement in aadhaar.SUBJECT_DDL:
        conn.execute(statement)


def current_schema(conn):
    return conn.execute("SELECT current_schema() AS s").fetchone()["s"]


class FakeS3:
    def __init__(self, events):
        self.objects = {}  # key -> list of (version_id, is_delete_marker)
        self.events = events
        self.fail_keys = set()
        self.calls = []

    def put(self, key, marker=False):
        self.objects.setdefault(key, []).append((uuid.uuid4().hex, marker))

    def list_object_versions(self, Bucket, Prefix, **_):
        assert Bucket == BUCKET
        self.calls.append(("list", Prefix))
        items = [(k, v, m) for k, versions in sorted(self.objects.items()) if k.startswith(Prefix) for v, m in versions]
        return {"Versions": [{"Key": k, "VersionId": v} for k, v, m in items if not m],
                "DeleteMarkers": [{"Key": k, "VersionId": v} for k, v, m in items if m],
                "IsTruncated": False}

    def delete_object(self, Bucket, Key, VersionId):
        assert Bucket == BUCKET
        self.calls.append(("delete", Key))
        if Key in self.fail_keys:
            raise RuntimeError("synthetic S3 failure")
        self.objects[Key] = [item for item in self.objects[Key] if item[0] != VersionId]
        if not self.objects[Key]:
            del self.objects[Key]
        self.events.append("s3_delete")


@pytest.fixture
def mod():
    spec = importlib.util.spec_from_file_location("clear_aadhaar_under_test", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def env(monkeypatch):
    for name in ENV_NAMES:
        monkeypatch.delenv(name, raising=False)
    return monkeypatch


@pytest.fixture
def pg():
    try:
        admin = psycopg.connect(TEST_DSN, autocommit=True)
    except psycopg.OperationalError:
        if os.getenv("TEST_PG_DSN"):
            raise
        pytest.skip("Set TEST_PG_DSN to run PostgreSQL integration tests")
    made, conns = [], []

    def schema(kind):
        name = f"test_clear_{kind}_{secrets.token_hex(6)}"
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(name)))
        made.append(name)
        conn = open_conn(name)
        conns.append(conn)
        return name, conn
    try:
        yield schema
    finally:
        for conn in conns:
            conn.close()
        for name in made:
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(name)))
        admin.close()


class World:
    """API + hub tables, fake S3, an event log and every value that must never be printed."""

    def __init__(self, mod, env, api_schema, api, hub_schema, hub):
        self.mod, self.env = mod, env
        self.api_schema, self.api, self.hub_schema, self.hub = api_schema, api, hub_schema, hub
        self.events = []
        self.s3 = FakeS3(self.events)
        self.hub_fail = set()
        self.before_stage_one = None
        self.owner = "subject_" + secrets.token_hex(8)
        self.other = "subject_" + secrets.token_hex(8)
        password = conninfo_to_dict(TEST_DSN).get("password")
        self.never = [self.owner, self.other, MASKED, CIPHERTEXT, PROD_PASSWORD, *([password] if password else [])]
        env.setattr(mod, "schema_of", current_schema)
        env.setattr(mod, "s3_client", lambda environment: self.s3)
        delete, stage_one = mod.delete_hub_node, mod.stage_one

        def logged_delete(hub, node, owner):
            if node in self.hub_fail:
                raise RuntimeError("synthetic hub failure")
            delete(hub, node, owner)
            self.events.append("hub_delete")

        def logged_stage_one(api, execute, skip):
            if self.before_stage_one:
                self.before_stage_one()
            self.events.append("stage1")
            return stage_one(api, execute, skip)
        env.setattr(mod, "delete_hub_node", logged_delete)
        env.setattr(mod, "stage_one", logged_stage_one)

    def local_env(self):
        self.env.setenv("API_DSN", dsn(self.api_schema))
        self.env.setenv("HUB_DSN", dsn(self.hub_schema))
        self.env.setenv("STORAGE_BUCKET", BUCKET)
        self.env.setenv("STORAGE_S3_ENDPOINT", "http://127.0.0.1:9000")
        self.env.setenv("AWS_ACCESS_KEY_ID", "test-access-key")
        self.env.setenv("AWS_SECRET_ACCESS_KEY", "test-secret-key")
        self.never += [dsn(self.api_schema), dsn(self.hub_schema), "test-secret-key"]

    def seed_record(self, owner=None, card_node="", card_version=""):
        owner = owner or self.owner
        token, record = str(uuid.uuid4()), "rec-" + str(uuid.uuid4())
        self.api.execute("INSERT INTO aadhaar_vault (token, owner_user_id, ciphertext) VALUES (%s, %s, %s)",
                         (token, owner, CIPHERTEXT))
        self.api.execute("INSERT INTO aadhaar_candidates (id, owner_user_id, masked, expires_at, consumed_at, origin, "
                         "last4, vault_token, card_node_id, card_version_id) "
                         "VALUES (%s, %s, %s, '9999-01-01 00:00:00+00'::timestamptz, now(), 'scan', '1234', %s, %s, %s)",
                         (record, owner, MASKED, token, card_node, card_version))
        self.api.execute("INSERT INTO users (id, kyc_ref_masked, kyc_ref_enc, kyc_aadhaar_record_id) "
                         "VALUES (%s, %s, '', %s) ON CONFLICT (id) DO NOTHING", (owner, MASKED, record))
        self.api.execute("INSERT INTO family_members (id, owner_user_id, is_self, aadhaar_masked, aadhaar_record_id) "
                         "VALUES (%s, %s, true, %s, %s)", ("fm-" + record, owner, MASKED, record))
        self.api.execute("INSERT INTO beneficiaries (id, owner_user_id, aadhaar_masked) VALUES (%s, %s, %s)",
                         ("bn-" + record, owner, MASKED))
        self.api.execute("INSERT INTO document_read_jobs (id, owner_user_id, operation) VALUES "
                         "(%s, %s, 'extract-aadhaar'), (%s, %s, 'extract-deed')",
                         ("job-a-" + record, owner, "job-d-" + record, owner))
        self.never += [token, record]
        return record

    def seed_node(self, owner=None, name="Aadhaar card.pdf", kind="file", versions=1, conn=None):
        owner, conn = owner or self.owner, conn or self.hub
        node = str(uuid.uuid4())
        conn.execute("INSERT INTO storage_nodes (id, owner_id, kind, name) VALUES (%s, %s, %s, %s)",
                     (node, owner, kind, name))
        version_ids, keys = [], []
        for _ in range(versions if kind == "file" else 0):
            version = str(uuid.uuid4())
            key = f"{node}/{version}"
            conn.execute("INSERT INTO storage_versions (id, node_id, owner_id, object_key) VALUES (%s, %s, %s, %s)",
                         (version, node, owner, key))
            self.s3.put(key)
            version_ids.append(version)
            keys.append(key)
        self.never += [node, *version_ids, *keys]
        return node, version_ids, keys

    def hub_has(self, node, conn=None):
        conn = conn or self.hub
        return bool(conn.execute("SELECT 1 FROM storage_nodes WHERE id=%s", (node,)).fetchone())

    def version_count(self, node, conn=None):
        conn = conn or self.hub
        return conn.execute("SELECT count(*) AS n FROM storage_versions WHERE node_id=%s", (node,)).fetchone()["n"]

    def linked_rows(self):
        return self.api.execute("SELECT count(*) AS n FROM aadhaar_candidates WHERE card_node_id<>''").fetchone()["n"]

    def records(self):
        return self.api.execute("SELECT count(*) AS n FROM aadhaar_candidates").fetchone()["n"]

    def run(self, argv, capsys):
        try:
            code = self.mod.main(argv)
        except SystemExit as exc:
            code = exc.code
        captured = capsys.readouterr()
        text = captured.out + captured.err
        for value in self.never:
            assert value not in text
        assert not re.search(r"\d{12}", text)
        return code, captured.out, captured.err


@pytest.fixture
def world(mod, env, pg):
    api_schema, api = pg("api")
    hub_schema, hub = pg("hub")
    build_api(api)
    hub.execute(HUB_DDL)
    w = World(mod, env, api_schema, api, hub_schema, hub)
    w.local_env()
    return w


@pytest.fixture
def remote(mod, env, pg):
    """dev/prod: one database for API and hub tables, reached only through a fake PG_* target."""
    def make(environment="prod", with_hub=True, rds=True):
        schema, conn = pg("single")
        build_api(conn)
        if with_hub:
            conn.execute(HUB_DDL)
        w = World(mod, env, schema, conn, schema, conn)
        env.setenv("APP_ENV", environment)
        for name, value in (("PG_HOST", "db.clear.invalid"), ("PG_PORT", "5432"), ("PG_USER", "clear_operator"),
                            ("PG_PASSWORD", PROD_PASSWORD), ("PG_DATABASE", "hub")):
            env.setenv(name, value)
        w.conninfo = []

        def fake_connect(conninfo):
            w.conninfo.append(conninfo)
            return open_conn(schema, rds=rds)
        env.setattr(mod, "connect", fake_connect)
        w.never += ["db.clear.invalid", "clear_operator"]
        return w
    return make


def counts(out, prefix):
    for line in out.splitlines():
        if line.startswith(prefix):
            found = {}
            for token in line.split():
                if "=" in token:
                    key, value = token.split("=", 1)
                    found[key] = int(value) if value.isdigit() else value
            return found
    raise AssertionError(f"no {prefix!r} line")


def stage2(out):
    return counts(out, "stage2 ")


def no_connect(conninfo):
    raise AssertionError("must refuse before connecting")


# --- guards ---------------------------------------------------------------

def test_environment_is_required(mod, env, capsys):
    with pytest.raises(SystemExit) as exc:
        mod.main([])
    assert exc.value.code == 2
    assert "--environment" in capsys.readouterr().err


def test_local_needs_explicit_api_dsn_and_never_falls_back(mod, env, capsys):
    env.setenv("APP_PG_DSN", "host=localhost dbname=pattadar user=rhub password=fallback-pw")
    for name in ("PG_HOST", "PG_PORT", "PG_USER", "PG_PASSWORD", "PG_DATABASE"):
        env.setenv(name, "fallback-pw" if name == "PG_PASSWORD" else "x")
    env.setattr(mod, "connect", no_connect)
    assert mod.main(["--environment", "local", "--execute"]) == 2
    err = capsys.readouterr().err
    assert "set API_DSN" in err and "fallback-pw" not in err


def test_local_refuses_a_non_local_app_env(mod, env, capsys):
    env.setenv("APP_ENV", "prod")
    env.setenv("API_DSN", "host=localhost dbname=pattadar")
    env.setattr(mod, "connect", no_connect)
    assert mod.main(["--environment", "local"]) == 2
    assert "APP_ENV" in capsys.readouterr().err


def test_local_refuses_an_rds_looking_server_regardless_of_host(world, capsys):
    world.seed_record()
    world.env.setenv("API_DSN", dsn(world.api_schema, rds=True))
    world.never.append(dsn(world.api_schema, rds=True))
    code, _, err = world.run(["--environment", "local", "--execute"], capsys)
    assert code == 2 and "RDS" in err
    assert world.records() == 1 and "stage1" not in world.events


def test_rdsadmin_role_marks_the_server_as_rds(mod):
    class Row:
        def __init__(self, row):
            self.row = row

        def fetchone(self):
            return self.row

    class Conn:
        def __init__(self, role):
            self.role = role

        def execute(self, query):
            assert "rdsadmin" in query and "rds.extensions" in query
            return Row({"role": self.role, "ext": False})
    assert mod.is_rds(Conn(True)) and not mod.is_rds(Conn(False))
    with pytest.raises(mod.Refused):
        mod.guard_server(Conn(True), "local")
    with pytest.raises(mod.Refused):
        mod.guard_server(Conn(False), "prod")


def test_local_hub_dsn_on_rds_is_refused(world, capsys):
    node, _, keys = world.seed_node()
    world.seed_record(card_node=node)
    world.env.setenv("HUB_DSN", dsn(world.hub_schema, rds=True))
    world.never.append(dsn(world.hub_schema, rds=True))
    code, _, err = world.run(["--environment", "local", "--execute", "--cards-linked-first"], capsys)
    assert code == 2 and "RDS" in err
    assert world.hub_has(node) and keys[0] in world.s3.objects and world.linked_rows() == 1


@pytest.mark.parametrize("partial", [False, True])
def test_missing_vault_schema_is_refused(mod, env, pg, capsys, partial):
    schema, conn = pg("bare")
    conn.execute(API_DDL)
    if partial:  # the old candidate table without the vault columns
        conn.execute("CREATE TABLE aadhaar_vault (token TEXT PRIMARY KEY)")
        conn.execute("CREATE TABLE aadhaar_candidates (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL)")
    env.setattr(mod, "schema_of", current_schema)
    env.setenv("API_DSN", dsn(schema))
    assert mod.main(["--environment", "local", "--execute"]) == 2
    assert "deploy the vault-schema API first" in capsys.readouterr().err


def test_prod_requires_allow_remote_and_approval_ref(remote, capsys):
    w = remote()
    for argv in (["--environment", "prod", "--approval-ref", "CHG-x"], ["--environment", "prod", "--allow-remote"]):
        code, _, err = w.run(argv, capsys)
        assert code == 2 and "--allow-remote and --approval-ref" in err
    assert w.conninfo == []


@pytest.mark.parametrize("app_env", [None, "dev", "local"])
def test_prod_requires_matching_app_env(remote, capsys, app_env):
    w = remote()
    if app_env:
        w.env.setenv("APP_ENV", app_env)
    else:
        w.env.delenv("APP_ENV")
    code, _, err = w.run(PROD, capsys)
    assert code == 2 and "APP_ENV" in err and w.conninfo == []


def test_prod_refuses_a_non_rds_server(remote, capsys):
    w = remote(rds=False)
    w.seed_record()
    code, _, err = w.run(PROD + ["--execute", "--writers-drained"], capsys)
    assert code == 2 and "not RDS" in err and w.records() == 1
    # The target came only from the PG_* parts, never from main._dsn_from_env.
    parts = conninfo_to_dict(w.conninfo[0])
    assert (parts["host"], parts["port"], parts["dbname"], parts["user"]) == (
        "db.clear.invalid", "5432", "hub", "clear_operator")


def test_dev_execute_requires_writers_drained(remote, capsys):
    w = remote("dev")
    code, _, err = w.run(["--environment", "dev", "--allow-remote", "--approval-ref", "CHG-x", "--execute"], capsys)
    assert code == 2 and "--writers-drained" in err and w.conninfo == []


@pytest.mark.parametrize("name", ["API_DSN", "HUB_DSN"])
def test_prod_refuses_api_or_hub_dsn(remote, capsys, name):
    w = remote()
    w.env.setenv(name, "host=localhost dbname=pattadar password=override-pw")
    w.never.append("override-pw")
    code, _, err = w.run(PROD, capsys)
    assert code == 2 and name in err and w.conninfo == []


@pytest.mark.parametrize("empty", [False, True])
@pytest.mark.parametrize("name", ["PG_HOST", "PG_PORT", "PG_USER", "PG_PASSWORD", "PG_DATABASE"])
def test_prod_needs_all_five_pg_parts(remote, capsys, name, empty):
    from src import main as api_main

    def boom():
        raise AssertionError("main._dsn_from_env must never be called")
    w = remote()
    w.env.setattr(api_main, "_dsn_from_env", boom)
    if empty:
        w.env.setenv(name, "")
    else:
        w.env.delenv(name)
    code, out, err = w.run(PROD, capsys)
    assert code == 2 and err.strip().endswith("missing " + name)
    assert "5432" not in out + err and w.conninfo == []


@pytest.mark.parametrize("flag", ["--candidates-out", "--card-nodes"])
def test_prod_refuses_local_only_files(remote, capsys, tmp_path, flag):
    w = remote()
    code, _, err = w.run(PROD + [flag, str(tmp_path / "pairs.tsv")], capsys)
    assert code == 2 and "local only" in err and w.conninfo == []
    assert not (tmp_path / "pairs.tsv").exists()


def test_prod_card_work_needs_storage_nodes_in_the_one_database(remote, capsys):
    w = remote(with_hub=False)
    w.seed_record(card_node=str(uuid.uuid4()))
    w.env.setenv("STORAGE_BUCKET", BUCKET)
    code, _, err = w.run(PROD + ["--execute", "--writers-drained", "--cards-linked-first"], capsys)
    assert code == 2 and "storage_nodes" in err
    assert w.records() == 1 and w.events == []


def test_linked_first_and_abandon_together_are_refused(world, capsys):
    code, _, err = world.run(["--environment", "local", "--cards-linked-first", "--abandon-linked-cards"], capsys)
    assert code == 2 and "cannot be combined" in err


@pytest.mark.parametrize("problem", ["no_bucket", "remote_endpoint", "no_keys"])
def test_card_deletion_needs_local_storage_settings(world, capsys, problem):
    node, _, keys = world.seed_node()
    world.seed_record(card_node=node)
    if problem == "no_bucket":
        world.env.delenv("STORAGE_BUCKET")
    elif problem == "remote_endpoint":
        world.env.setenv("STORAGE_S3_ENDPOINT", "https://s3.ap-south-1.amazonaws.com")
    else:
        world.env.delenv("AWS_SECRET_ACCESS_KEY")
    code, _, _ = world.run(["--environment", "local", "--execute", "--cards-linked-first"], capsys)
    assert code == 2
    assert world.hub_has(node) and keys[0] in world.s3.objects and world.linked_rows() == 1
    assert world.s3.calls == [] and "stage1" not in world.events


# --- stage 1 and linked-card handling ---------------------------------------

def test_dry_run_counts_then_execute_then_zero_rerun(world, capsys):
    world.seed_record()
    world.seed_record(owner=world.other)
    code, out, _ = world.run(["--environment", "local"], capsys)
    assert code == 0 and counts(out, "linked=") == {"linked": 0}
    assert counts(out, "stage1 dry_run") == {"document_read_jobs": 2, "family_members": 2, "users": 2,
                                             "beneficiaries": 2, "aadhaar_candidates": 2, "aadhaar_vault": 2}
    assert world.records() == 2  # dry run wrote nothing

    code, out, _ = world.run(["--environment", "local", "--execute"], capsys)
    assert code == 0
    assert counts(out, "stage1 executed") == {"document_read_jobs": 2, "family_members": 2, "users": 2,
                                              "beneficiaries": 2, "aadhaar_candidates": 2, "aadhaar_vault": 2}
    api = world.api
    assert api.execute("SELECT count(*) AS n FROM aadhaar_vault").fetchone()["n"] == 0
    assert api.execute("SELECT count(*) AS n FROM family_members WHERE aadhaar_masked<>'' OR aadhaar_record_id<>''"
                       ).fetchone()["n"] == 0
    assert api.execute("SELECT count(*) AS n FROM users WHERE kyc_ref_masked<>'' OR kyc_aadhaar_record_id<>''"
                       ).fetchone()["n"] == 0
    # Only Aadhaar reads go; other jobs and the people themselves stay.
    assert api.execute("SELECT operation FROM document_read_jobs").fetchall() == [
        {"operation": "extract-deed"}, {"operation": "extract-deed"}]
    assert api.execute("SELECT count(*) AS n FROM family_members").fetchone()["n"] == 2

    for argv in (["--environment", "local", "--execute"], ["--environment", "local"]):
        code, out, _ = world.run(argv, capsys)
        assert code == 0 and counts(out, "linked=") == {"linked": 0}
        assert counts(out, "stage1 ") == ZERO_STAGE1


def test_beneficiaries_are_skipped_when_absent(world, capsys):
    world.api.execute("DROP TABLE beneficiaries")
    code, out, _ = world.run(["--environment", "local", "--execute"], capsys)
    assert code == 0 and counts(out, "stage1 executed")["beneficiaries"] == "skipped"


def test_execute_with_linked_cards_needs_a_choice(world, capsys):
    node, _, keys = world.seed_node()
    world.seed_record(card_node=node)
    code, out, err = world.run(["--environment", "local", "--execute"], capsys)
    assert code == 2 and counts(out, "linked=") == {"linked": 1} and "linked Aadhaar cards exist" in err
    assert world.records() == 1 and world.linked_rows() == 1 and "stage1" not in world.events
    assert world.hub_has(node) and keys[0] in world.s3.objects and world.s3.calls == []


def test_candidates_out_is_private_exclusive_and_written_before_deletes(world, capsys, tmp_path):
    linked, _, linked_keys = world.seed_node(name="Aadhaar card.pdf")
    heuristic, _, _ = world.seed_node(name="old AADHAR scan.jpg")
    world.seed_node(name="Sale deed.pdf")
    world.seed_node(name="Aadhaar", kind="folder")
    world.seed_record(card_node=linked)
    expected = f"linked\t{world.owner}\t{linked}\nheuristic\t{world.owner}\t{heuristic}\n"

    first = tmp_path / "candidates.tsv"
    code, out, _ = world.run(["--environment", "local", "--candidates-out", str(first)], capsys)
    assert code == 0 and counts(out, "candidates_out") == {"linked": 1, "heuristic": 1}
    assert first.read_text() == expected
    assert stat.S_IMODE(first.stat().st_mode) == 0o600

    # O_EXCL: an existing file is never overwritten or appended to.
    code, _, err = world.run(["--environment", "local", "--candidates-out", str(first)], capsys)
    assert code == 2 and "already exists" in err and first.read_text() == expected

    second = tmp_path / "before-execute.tsv"
    seen = {}
    world.before_stage_one = lambda: seen.setdefault("text", second.read_text())
    code, out, _ = world.run(["--environment", "local", "--execute", "--candidates-out", str(second)], capsys)
    assert code == 0 and seen["text"] == expected
    assert counts(out, "stage1 executed")["aadhaar_candidates"] == 1 and world.records() == 0
    # The pairs survive for a reviewed stage-2 run; nothing in storage was touched.
    assert world.hub_has(linked) and linked_keys[0] in world.s3.objects and world.s3.calls == []


def test_cards_linked_first_deletes_verified_cards_before_stage_one(world, capsys):
    node, versions, keys = world.seed_node(versions=2)
    world.s3.put(keys[0], marker=True)
    sibling = keys[0] + "-sibling"  # shares the key as a prefix; must never be deleted
    world.s3.put(sibling)
    world.never.append(sibling)
    world.seed_record(card_node=node, card_version=versions[-1])
    code, out, _ = world.run(["--environment", "local", "--execute", "--cards-linked-first"], capsys)
    assert code == 0
    assert stage2(out) == {"reference_columns": API_REFERENCE_COLUMNS, "verified": 1, "deleted": 1, "missing": 0,
                           "refused_foreign_owner": 0, "refused_referenced": 0, "delete_errors": 0}
    # Every version and delete marker of the exact keys, then the hub row, then stage 1.
    assert world.events == ["s3_delete"] * 3 + ["hub_delete", "stage1"]
    assert {key for op, key in world.s3.calls if op == "delete"} == set(keys)
    assert list(world.s3.objects) == [sibling]
    assert not world.hub_has(node) and world.version_count(node) == 0
    assert world.records() == 0

    # Idempotent: the re-runs find nothing.
    for argv in (["--environment", "local", "--execute", "--cards-linked-first"], ["--environment", "local"]):
        code, out, _ = world.run(argv, capsys)
        assert code == 0 and counts(out, "linked=") == {"linked": 0}
        assert counts(out, "stage1 ") == ZERO_STAGE1 and "stage2" not in out


def test_cards_linked_first_dry_run_deletes_nothing(world, capsys):
    node, _, keys = world.seed_node()
    world.seed_record(card_node=node)
    code, out, _ = world.run(["--environment", "local", "--cards-linked-first"], capsys)
    assert code == 0 and stage2(out)["verified"] == 1 and stage2(out)["deleted"] == 0
    assert world.hub_has(node) and keys[0] in world.s3.objects and world.records() == 1
    assert ("delete", keys[0]) not in world.s3.calls


def test_s3_failure_stops_before_stage_one_and_keeps_links(world, capsys):
    node, _, keys = world.seed_node()
    world.seed_record(card_node=node)
    world.s3.fail_keys.add(keys[0])
    code, out, err = world.run(["--environment", "local", "--execute", "--cards-linked-first"], capsys)
    assert code == 1 and "stage 1 not run" in err
    assert stage2(out)["delete_errors"] == 1 and stage2(out)["deleted"] == 0
    assert "stage1" not in world.events and "stage1" not in out
    assert world.linked_rows() == 1 and world.records() == 1 and world.hub_has(node)


def test_abandon_linked_cards_touches_no_storage(world, capsys):
    node, _, keys = world.seed_node()
    world.seed_record(card_node=node)
    world.env.delenv("HUB_DSN")  # a hub connection attempt would refuse

    def no_s3(environment):
        raise AssertionError("abandon must not touch S3")
    world.env.setattr(world.mod, "s3_client", no_s3)
    code, out, _ = world.run(["--environment", "local", "--execute", "--abandon-linked-cards"], capsys)
    assert code == 0 and counts(out, "abandoned_linked=") == {"abandoned_linked": 1}
    assert world.records() == 0 and world.hub_has(node) and keys[0] in world.s3.objects
    assert world.s3.calls == [] and "stage2" not in out


# --- stage 2: verification outcomes -----------------------------------------

def test_foreign_owner_and_non_file_nodes_are_refused_and_kept(world, capsys):
    foreign, _, foreign_keys = world.seed_node(owner=world.other)
    folder, _, _ = world.seed_node(name="Aadhaar", kind="folder")
    world.seed_record(card_node=foreign)  # a forged link to another owner's file
    world.seed_record(card_node=folder)
    code, out, _ = world.run(["--environment", "local", "--execute", "--cards-linked-first"], capsys)
    assert code == 0
    assert stage2(out)["refused_foreign_owner"] == 2 and stage2(out)["deleted"] == 0
    assert world.hub_has(foreign) and world.hub_has(folder) and foreign_keys[0] in world.s3.objects
    assert world.s3.calls == []
    assert world.records() == 0 and world.events == ["stage1"]  # stage 1 dropped the links


REFERENCES = [
    ("api", "documents", "file_ref", "node", False),
    ("api", "parcel_photos", "file_ref", "node", False),
    ("api", "land_expenses", "receipt_file_ref", "version", False),
    ("api", "record_people", "photo_ref", "node", False),
    ("api", "survey_attachments", "scan_file_ref", "node", True),
    ("hub", "Legacy Cards", "card_file_ref", "node", True),
]


@pytest.mark.parametrize("where,table,column,holds,new_table", REFERENCES,
                         ids=[f"{t}.{c}" for _, t, c, _, _ in REFERENCES])
def test_referenced_cards_are_refused_and_kept(world, capsys, where, table, column, holds, new_table):
    conn = world.api if where == "api" else world.hub
    if new_table:
        conn.execute(sql.SQL("CREATE TABLE {} (id TEXT PRIMARY KEY, {} TEXT NOT NULL DEFAULT '')").format(
            sql.Identifier(table), sql.Identifier(column)))
    node, versions, keys = world.seed_node(versions=2)
    value = node if holds == "node" else versions[-1]
    conn.execute(sql.SQL("INSERT INTO {} (id, {}) VALUES ('ref-row', %s)").format(
        sql.Identifier(table), sql.Identifier(column)), (value,))
    world.seed_record(card_node=node)
    code, out, _ = world.run(["--environment", "local", "--execute", "--cards-linked-first"], capsys)
    assert code == 0
    assert stage2(out) == {"reference_columns": API_REFERENCE_COLUMNS + int(new_table), "verified": 0,
                           "deleted": 0, "missing": 0, "refused_foreign_owner": 0, "refused_referenced": 1,
                           "delete_errors": 0}
    assert world.hub_has(node) and world.version_count(node) == 2
    assert all(key in world.s3.objects for key in keys) and world.s3.calls == []
    assert counts(out, "stage1 executed")["aadhaar_candidates"] == 1 and world.records() == 0


def test_a_missing_node_alone_does_not_block(world, capsys):
    gone = str(uuid.uuid4())
    world.never.append(gone)
    world.seed_record(card_node=gone)
    code, out, _ = world.run(["--environment", "local", "--execute", "--cards-linked-first"], capsys)
    assert code == 0 and stage2(out)["missing"] == 1 and stage2(out)["deleted"] == 0
    assert world.records() == 0 and world.s3.calls == []


@pytest.mark.parametrize("fail_at", ["s3", "hub"])
def test_partial_failure_rerun_completes(world, capsys, fail_at):
    node_a, _, keys_a = world.seed_node(name="Aadhaar front.jpg")
    node_b, _, keys_b = world.seed_node(name="Aadhaar back.jpg")
    world.seed_record(card_node=node_a)
    world.seed_record(card_node=node_b)
    if fail_at == "s3":
        world.s3.fail_keys.add(keys_b[0])
    else:
        world.hub_fail.add(node_b)
    argv = ["--environment", "local", "--execute", "--cards-linked-first"]

    code, out, _ = world.run(argv, capsys)
    assert code == 1 and stage2(out)["deleted"] == 1 and stage2(out)["delete_errors"] == 1
    assert "stage1" not in world.events and world.linked_rows() == 2
    assert not world.hub_has(node_a) and keys_a[0] not in world.s3.objects and world.hub_has(node_b)

    world.s3.fail_keys.clear()
    world.hub_fail.clear()
    code, out, _ = world.run(argv, capsys)
    assert code == 0
    assert stage2(out)["missing"] == 1 and stage2(out)["deleted"] == 1 and stage2(out)["delete_errors"] == 0
    assert counts(out, "stage1 executed")["aadhaar_candidates"] == 2
    assert not world.hub_has(node_b) and keys_b[0] not in world.s3.objects

    code, out, _ = world.run(argv, capsys)
    assert code == 0 and counts(out, "linked=") == {"linked": 0} and counts(out, "stage1 ") == ZERO_STAGE1


def test_hub_delete_is_scoped_to_the_verified_owner(world):
    node, _, _ = world.seed_node()
    assert "owner_id=%s" in world.mod.HUB_DELETE_SQL
    world.mod.delete_hub_node(world.hub, node, world.other)
    assert world.hub_has(node)
    world.mod.delete_hub_node(world.hub, node, world.owner)
    assert not world.hub_has(node) and world.version_count(node) == 0


def test_reviewed_card_nodes_are_verified_then_deleted(world, capsys, tmp_path):
    heuristic, _, keys = world.seed_node(name="aadhar.png")
    foreign, _, foreign_keys = world.seed_node(owner=world.other, name="aadhaar.pdf")
    reviewed = tmp_path / "reviewed.tsv"
    reviewed.write_text(f"# reviewed\nheuristic\t{world.owner}\t{heuristic}\n"
                        f"heuristic\t{world.owner}\t{foreign}\n")
    argv = ["--environment", "local", "--card-nodes", str(reviewed)]
    code, out, _ = world.run(argv, capsys)
    assert code == 0 and stage2(out)["verified"] == 1 and stage2(out)["deleted"] == 0
    assert world.hub_has(heuristic) and world.s3.calls == []

    code, out, _ = world.run(argv + ["--execute"], capsys)
    assert code == 0 and stage2(out)["deleted"] == 1 and stage2(out)["refused_foreign_owner"] == 1
    assert not world.hub_has(heuristic) and keys[0] not in world.s3.objects
    assert world.hub_has(foreign) and foreign_keys[0] in world.s3.objects

    code, out, _ = world.run(argv + ["--execute"], capsys)
    assert code == 0 and stage2(out)["missing"] == 1 and stage2(out)["deleted"] == 0


def test_invalid_card_nodes_file_is_refused(world, capsys, tmp_path):
    reviewed = tmp_path / "reviewed.tsv"
    reviewed.write_text("heuristic\tnot-a-pair\n")
    code, _, err = world.run(["--environment", "local", "--execute", "--card-nodes", str(reviewed)], capsys)
    assert code == 2 and "line 1" in err and "stage1" not in world.events


def test_reference_catalog_is_derived_and_precise(world):
    api = world.api
    api.execute("CREATE TABLE catalog_probe (id TEXT PRIMARY KEY, evidence_ref TEXT, cover_photo_ref TEXT, "
                "profile_ref TEXT, legacy_file_ref INTEGER, file_reference TEXT)")
    api.execute("CREATE VIEW catalog_view AS SELECT file_ref FROM documents")
    found = set(world.mod.reference_columns(api))
    assert found == {("documents", "file_ref"), ("parcel_photos", "file_ref"),
                     ("land_expenses", "receipt_file_ref"), ("record_people", "photo_ref"),
                     ("catalog_probe", "evidence_ref"), ("catalog_probe", "cover_photo_ref")}
    # Escaped underscores: 'profile_ref' must not match '%_file_ref'; card_node_id is never a reference.
    assert "\\_file\\_ref" in world.mod.REFERENCE_CATALOG and "card_node_id" not in world.mod.REFERENCE_CATALOG
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        compile(SCRIPT.read_text(), str(SCRIPT), "exec")


# --- dev/prod on fakes (never a real remote target) -------------------------

def test_prod_stage_one_on_the_single_connection(remote, capsys):
    w = remote()
    w.seed_record()
    code, out, _ = w.run(PROD, capsys)
    assert code == 0 and counts(out, "stage1 dry_run")["aadhaar_candidates"] == 1 and w.records() == 1
    code, out, _ = w.run(PROD + ["--execute", "--writers-drained"], capsys)
    assert code == 0 and counts(out, "stage1 executed")["aadhaar_vault"] == 1 and w.records() == 0
    code, out, _ = w.run(PROD + ["--execute", "--writers-drained"], capsys)
    assert code == 0 and counts(out, "stage1 executed") == ZERO_STAGE1
    assert all(conninfo_to_dict(c)["password"] == PROD_PASSWORD for c in w.conninfo)


def test_prod_cards_linked_first_uses_the_one_database(remote, capsys):
    w = remote()
    node, _, keys = w.seed_node(conn=w.api)
    w.seed_record(card_node=node)
    w.env.setenv("STORAGE_BUCKET", BUCKET)
    w.env.setenv("AWS_ACCESS_KEY_ID", "override-key")
    argv = PROD + ["--execute", "--writers-drained", "--cards-linked-first"]
    code, _, err = w.run(argv, capsys)
    assert code == 2 and "task role" in err and w.hub_has(node, w.api)
    w.env.delenv("AWS_ACCESS_KEY_ID")
    code, out, _ = w.run(argv, capsys)
    assert code == 0 and stage2(out)["deleted"] == 1 and stage2(out)["reference_columns"] == API_REFERENCE_COLUMNS
    assert not w.hub_has(node, w.api) and keys[0] not in w.s3.objects and w.records() == 0
    assert w.events == ["s3_delete", "hub_delete", "stage1"]
