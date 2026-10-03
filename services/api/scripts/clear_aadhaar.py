#!/usr/bin/env python3
"""Clear every stored Aadhaar identifier; default is a read-only dry run.

Stage 1 (one transaction on the API database) deletes pending extract-aadhaar
reads, blanks the Aadhaar mask, ciphertext and record pointer on users,
family_members and beneficiaries, and deletes every Aadhaar record and vault
row. Stage 2 deletes kept Aadhaar card files, but only after checking the owner,
the kind and that no other record references the file.

Output is counts only. Names, numbers, ciphertext, owner ids, node ids, object
keys, DSNs and passwords are never printed. A re-run reports zeros.

--environment is required. dev/prod need Reddy's separate approval for the
exact SHA, snapshot and writer-control window (docs/runbooks/aadhaar-kms-rollout.md);
agents never run them. Design: aadhaar-vault-s3 design §8.
"""
import argparse
import ipaddress
import os
from pathlib import Path
import sys
from urllib.parse import urlparse
import uuid

import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo
from psycopg.rows import dict_row

PG_PARTS = ("PG_HOST", "PG_PORT", "PG_USER", "PG_PASSWORD", "PG_DATABASE")

# What the vault-schema API creates at boot. Without it the clear would miss
# the new tables or fail half way, so the run refuses instead.
REQUIRED_SCHEMA = (
    ("aadhaar_vault", "token"),
    ("aadhaar_candidates", "vault_token"),
    ("aadhaar_candidates", "card_node_id"),
    ("family_members", "aadhaar_record_id"),
    ("users", "kyc_aadhaar_record_id"),
    ("document_read_jobs", "operation"),
)

# Stage 1, in this order, in one transaction: (label, count, statement).
STAGE_ONE = (
    ("document_read_jobs",
     "SELECT count(*) AS n FROM document_read_jobs WHERE operation='extract-aadhaar'",
     "DELETE FROM document_read_jobs WHERE operation='extract-aadhaar'"),
    ("family_members",
     "SELECT count(*) AS n FROM family_members WHERE aadhaar_masked<>'' OR aadhaar_enc<>'' OR aadhaar_record_id<>''",
     "UPDATE family_members SET aadhaar_masked='', aadhaar_enc='', aadhaar_record_id='' "
     "WHERE aadhaar_masked<>'' OR aadhaar_enc<>'' OR aadhaar_record_id<>''"),
    ("users",
     "SELECT count(*) AS n FROM users WHERE kyc_ref_masked<>'' OR kyc_ref_enc<>'' OR kyc_aadhaar_record_id<>''",
     "UPDATE users SET kyc_ref_masked='', kyc_ref_enc='', kyc_aadhaar_record_id='' "
     "WHERE kyc_ref_masked<>'' OR kyc_ref_enc<>'' OR kyc_aadhaar_record_id<>''"),
    ("beneficiaries",
     "SELECT count(*) AS n FROM beneficiaries WHERE aadhaar_masked<>''",
     "UPDATE beneficiaries SET aadhaar_masked='' WHERE aadhaar_masked<>''"),
    ("aadhaar_candidates",
     "SELECT count(*) AS n FROM aadhaar_candidates",
     "DELETE FROM aadhaar_candidates"),
    ("aadhaar_vault",
     "SELECT count(*) AS n FROM aadhaar_vault",
     "DELETE FROM aadhaar_vault"),
)

LINKED_SQL = ("SELECT owner_user_id, card_node_id FROM aadhaar_candidates WHERE card_node_id<>'' "
              "ORDER BY created_at, id")

# Legacy card uploads were never marked, so only a name heuristic finds them.
# A human reviews the candidates file before any of these is deleted.
HEURISTIC_SQL = ("SELECT owner_id, id::text AS id FROM storage_nodes "
                 "WHERE kind='file' AND name ILIKE ANY('{%aadhaar%,%aadhar%}') ORDER BY created_at, id")

# Every text column that can hold a storage node (or version) id. Over-matching
# only refuses a delete, which is the safe direction. card_node_id is not
# matched, so a link never refuses its own card. Executed without parameters,
# so the LIKE patterns' % are literal.
REFERENCE_CATALOG = r"""
SELECT c.table_name, c.column_name
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
 WHERE c.table_schema={schema}
   AND c.data_type='text'
   AND (c.column_name IN ('file_ref','photo_ref','evidence_ref')
        OR c.column_name LIKE '%\_file\_ref' ESCAPE '\'
        OR c.column_name LIKE '%\_photo\_ref' ESCAPE '\')
 ORDER BY 1, 2
"""

# The owner is part of the delete so a node can only go for the owner it was
# verified against. Cascades to storage_versions and storage_stream_sessions.
HUB_DELETE_SQL = "DELETE FROM storage_nodes WHERE id=%s AND owner_id=%s"

OUTCOMES = ("verified", "deleted", "missing", "refused_foreign_owner", "refused_referenced", "delete_errors")


class Refused(Exception):
    """A guard refusal: exit 2 before any write. The message never holds a value."""


class DeleteFailed(Exception):
    """An S3 or hub delete raised: exit non-zero before stage 1."""


def connect(conninfo):
    return psycopg.connect(conninfo, autocommit=True, row_factory=dict_row)


def schema_of(conn):
    """Every Pattadar table lives in public (tests substitute a throwaway schema)."""
    return "public"


def s3_client(environment):
    import boto3
    region = os.getenv("AWS_REGION", "ap-south-1")
    if environment == "local":
        from botocore.config import Config
        return boto3.client("s3", endpoint_url=os.environ["STORAGE_S3_ENDPOINT"], region_name=region,
                            config=Config(s3={"addressing_style": "path"}))
    # In AWS the credentials come only from the task role.
    return boto3.client("s3", region_name=region)


def is_rds(conn):
    row = conn.execute("SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rdsadmin') AS role, "
                       "current_setting('rds.extensions', true) IS NOT NULL AS ext").fetchone()
    return bool(row["role"] or row["ext"])


def columns(conn):
    out = {}
    rows = conn.execute("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema=%s",
                        (schema_of(conn),))
    for row in rows:
        out.setdefault(row["table_name"], set()).add(row["column_name"])
    return out


def reference_columns(conn):
    query = sql.SQL(REFERENCE_CATALOG).format(schema=sql.Literal(schema_of(conn)))
    return [(row["table_name"], row["column_name"]) for row in conn.execute(query)]


def canonical_uuid(value):
    try:
        return str(uuid.UUID(value))
    except (TypeError, ValueError, AttributeError):
        return None


def counts_line(prefix, values):
    return prefix + " " + " ".join(f"{key}={value}" for key, value in values.items())


def parse_args(argv):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--environment", required=True, choices=["local", "dev", "prod"])
    parser.add_argument("--execute", action="store_true", help="Write; without it the run is read-only")
    parser.add_argument("--writers-drained", action="store_true",
                        help="dev/prod: confirm API, gateway and workers are drained")
    parser.add_argument("--allow-remote", action="store_true", help="dev/prod: required")
    parser.add_argument("--approval-ref", help="dev/prod: required reference to Reddy's approval")
    parser.add_argument("--cards-linked-first", action="store_true",
                        help="Verify and delete linked card files before stage 1")
    parser.add_argument("--abandon-linked-cards", action="store_true",
                        help="Drop links and leave the linked card files in Drive")
    parser.add_argument("--candidates-out", type=Path,
                        help="local only: write linked and heuristic card candidates (new file, mode 0600)")
    parser.add_argument("--card-nodes", type=Path,
                        help="local only: reviewed candidates file whose card files are verified and deleted")
    return parser.parse_args(argv)


def guard_before_connect(args):
    if args.cards_linked_first and args.abandon_linked_cards:
        raise Refused("--cards-linked-first and --abandon-linked-cards cannot be combined")
    app_env = os.getenv("APP_ENV")
    if args.environment == "local":
        if app_env and app_env != "local":
            raise Refused("APP_ENV is not local")
        if not os.getenv("API_DSN"):
            raise Refused("set API_DSN")
        return os.environ["API_DSN"]
    if app_env != args.environment:
        raise Refused("APP_ENV does not match --environment")
    for name in ("API_DSN", "HUB_DSN"):
        if os.getenv(name):
            raise Refused(f"{name} must not be set for {args.environment}; the PG_* parts are used")
    if args.candidates_out or args.card_nodes:
        raise Refused("--candidates-out and --card-nodes are local only")
    missing = [name for name in PG_PARTS if not os.getenv(name)]
    if missing:
        raise Refused("missing " + ", ".join(missing))
    if not args.allow_remote or not args.approval_ref:
        raise Refused("--allow-remote and --approval-ref are required for " + args.environment)
    if args.execute and not args.writers_drained:
        raise Refused("--execute requires --writers-drained for " + args.environment)
    return make_conninfo(host=os.environ["PG_HOST"], port=os.environ["PG_PORT"], dbname=os.environ["PG_DATABASE"],
                         user=os.environ["PG_USER"], password=os.environ["PG_PASSWORD"])


def guard_server(conn, environment):
    rds = is_rds(conn)
    if environment == "local" and rds:
        raise Refused("this server looks like RDS; local runs only touch a local database")
    if environment != "local" and not rds:
        raise Refused("the server is not RDS")


def read_card_nodes(path):
    try:
        text = path.read_text()
    except OSError:
        raise Refused("cannot read the --card-nodes file") from None
    pairs = []
    for number, line in enumerate(text.splitlines(), 1):
        if not line.strip() or line.startswith("#"):
            continue
        parts = line.split("\t")
        node = canonical_uuid(parts[2]) if len(parts) == 3 else None
        if len(parts) != 3 or parts[0] not in ("linked", "heuristic") or not parts[1] or not node:
            raise Refused(f"--card-nodes line {number} is not origin<TAB>owner<TAB>node")
        pairs.append((parts[1], node))
    return pairs


def write_candidates(path, linked, heuristic):
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        raise Refused("the --candidates-out file already exists; choose a new path") from None
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, "w") as out:
        for owner, node in linked:
            out.write(f"linked\t{owner}\t{node}\n")
        for owner, node in heuristic:
            out.write(f"heuristic\t{owner}\t{node}\n")
        out.flush()
        os.fsync(out.fileno())


def require_storage_env(environment):
    if not os.getenv("STORAGE_BUCKET"):
        raise Refused("set STORAGE_BUCKET for card deletion")
    if environment == "local":
        missing = [n for n in ("STORAGE_S3_ENDPOINT", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY") if not os.getenv(n)]
        if missing:
            raise Refused("missing " + ", ".join(missing))
        host = urlparse(os.environ["STORAGE_S3_ENDPOINT"]).hostname or ""
        try:
            loopback = host == "localhost" or ipaddress.ip_address(host).is_loopback
        except ValueError:
            loopback = False
        if not loopback:
            raise Refused("STORAGE_S3_ENDPOINT must be the local MinIO for local runs")
    elif os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("AWS_SECRET_ACCESS_KEY"):
        raise Refused("S3 credentials come only from the task role for " + environment)
    return os.environ["STORAGE_BUCKET"]


def purge_key(s3, bucket, key):
    """Delete every version and delete marker of exactly this key."""
    if not key:
        raise ValueError("Refusing an empty object key")
    for _ in range(4):
        found = []
        request = {"Bucket": bucket, "Prefix": key}
        while True:
            page = s3.list_object_versions(**request)
            found += [item["VersionId"] for item in page.get("Versions", []) + page.get("DeleteMarkers", [])
                      if item.get("Key") == key]
            if not page.get("IsTruncated"):
                break
            request = {"Bucket": bucket, "Prefix": key, "KeyMarker": page.get("NextKeyMarker", "")}
            if page.get("NextVersionIdMarker"):
                request["VersionIdMarker"] = page["NextVersionIdMarker"]
        if not found:
            return
        for version in found:
            s3.delete_object(Bucket=bucket, Key=key, VersionId=version)
    raise RuntimeError("Object versions keep appearing; stop writers before retrying")


def delete_hub_node(hub, node, owner):
    with hub.transaction():
        hub.execute(HUB_DELETE_SQL, (node, owner))


def verify_node(hub, references, owner, node):
    """Return (outcome, object keys). Outcomes are checked in the design's order."""
    node = canonical_uuid(node)
    row = hub.execute("SELECT owner_id, kind FROM storage_nodes WHERE id=%s", (node,)).fetchone() if node else None
    if not row:
        return "missing", []
    if row["owner_id"] != owner or row["kind"] != "file":
        return "refused_foreign_owner", []
    versions = hub.execute("SELECT id::text AS id, object_key FROM storage_versions WHERE node_id=%s",
                           (node,)).fetchall()
    ids = [node, *(v["id"] for v in versions)]
    for conn, table, column in references:
        lookup = sql.SQL("SELECT 1 FROM {}.{} WHERE {} = ANY(%s) LIMIT 1").format(
            sql.Identifier(schema_of(conn)), sql.Identifier(table), sql.Identifier(column))
        if conn.execute(lookup, (ids,)).fetchone():
            return "refused_referenced", []
    return "verified", sorted({v["object_key"] for v in versions})


def stage_two(hub, references, pairs, execute, s3, bucket):
    counts = {"reference_columns": len(references), **{name: 0 for name in OUTCOMES}}
    for owner, node in pairs:
        outcome, keys = verify_node(hub, references, owner, node)
        if outcome != "verified":
            counts[outcome] += 1
            continue
        counts["verified"] += 1
        if not execute:
            continue
        try:
            # S3 first: a failure never leaves bytes without a hub row a re-run can find.
            for key in keys:
                purge_key(s3, bucket, key)
            delete_hub_node(hub, canonical_uuid(node), owner)
        except Exception as exc:
            counts["delete_errors"] += 1
            print(counts_line("stage2", counts))
            raise DeleteFailed(type(exc).__name__) from None
        counts["deleted"] += 1
    print(counts_line("stage2", counts))


def stage_one(api, execute, skip):
    counts = {}
    if not execute:
        for label, count, _ in STAGE_ONE:
            counts[label] = "skipped" if label in skip else api.execute(count).fetchone()["n"]
        print(counts_line("stage1 dry_run", counts))
        return counts
    with api.transaction():
        for label, _, statement in STAGE_ONE:
            counts[label] = "skipped" if label in skip else api.execute(statement).rowcount
    print(counts_line("stage1 executed", counts))
    return counts


def run(args):
    api_conninfo = guard_before_connect(args)
    card_nodes = read_card_nodes(args.card_nodes) if args.card_nodes else []
    remote = args.environment != "local"
    with connect(api_conninfo) as api:
        guard_server(api, args.environment)
        api_columns = columns(api)
        if any(column not in api_columns.get(table, set()) for table, column in REQUIRED_SCHEMA):
            raise Refused("deploy the vault-schema API first")

        # Step 0: linked cards. The pairs never leave this process except into
        # a local --candidates-out file.
        linked = []
        for row in api.execute(LINKED_SQL):
            pair = (row["owner_user_id"], row["card_node_id"])
            if pair not in linked:
                linked.append(pair)
        print(f"linked={len(linked)}")
        if args.execute and linked and not (args.cards_linked_first or args.candidates_out or args.abandon_linked_cards):
            raise Refused("linked Aadhaar cards exist; choose --cards-linked-first, "
                          "--candidates-out (local) or --abandon-linked-cards")

        pairs = list(linked) if args.cards_linked_first else []
        pairs += [pair for pair in card_nodes if pair not in pairs]
        needs_hub = bool(pairs) or bool(args.candidates_out)
        hub = None
        hub_conn = None
        try:
            if needs_hub:
                if remote:
                    hub = api
                else:
                    if not os.getenv("HUB_DSN"):
                        raise Refused("set HUB_DSN for card work")
                    hub_conn = connect(os.environ["HUB_DSN"])
                    hub = hub_conn
                    guard_server(hub, args.environment)
                hub_columns = api_columns if hub is api else columns(hub)
                if not {"storage_nodes", "storage_versions"} <= hub_columns.keys() or "documents" not in api_columns:
                    raise Refused("card work needs storage_nodes and documents in the connected database")

            references = []
            if pairs:
                for conn in ([api] if hub is api else [api, hub]):
                    found = reference_columns(conn)
                    if conn is api and not found:
                        raise Refused("no file reference columns found on the API database")
                    references += [(conn, table, column) for table, column in found]

            s3 = bucket = None
            if pairs and args.execute:
                bucket = require_storage_env(args.environment)
                s3 = s3_client(args.environment)

            if args.candidates_out:
                taken = set(linked)
                heuristic = [(r["owner_id"], r["id"]) for r in hub.execute(HEURISTIC_SQL)
                             if (r["owner_id"], r["id"]) not in taken]
                write_candidates(args.candidates_out, linked, heuristic)
                print(f"candidates_out linked={len(linked)} heuristic={len(heuristic)}")

            if pairs:
                stage_two(hub, references, pairs, args.execute, s3, bucket)
        finally:
            if hub_conn is not None:
                hub_conn.close()

        if args.abandon_linked_cards:
            print(f"abandoned_linked={len(linked)}")
        skip = set() if "aadhaar_masked" in api_columns.get("beneficiaries", set()) else {"beneficiaries"}
        stage_one(api, args.execute, skip)
    return 0


def main(argv=None):
    args = parse_args(argv)
    try:
        return run(args)
    except Refused as exc:
        print(f"clear_aadhaar: refused: {exc}", file=sys.stderr)
        return 2
    except DeleteFailed as exc:
        print(f"clear_aadhaar: card delete failed ({exc}); stage 1 not run, re-run after fixing", file=sys.stderr)
        return 1
    except Exception as exc:
        # Only the type: connection errors carry hosts, and SQL errors carry values.
        print(f"clear_aadhaar: failed ({type(exc).__name__})", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
