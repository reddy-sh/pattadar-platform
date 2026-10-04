#!/usr/bin/env python3
"""File already-kept Aadhaar cards in Documents; default is a read-only dry run.

Cards kept before the per-person tree (invariant 8) have a pointer on their
Aadhaar record (aadhaar_candidates.card_node_id) and no `documents` row, so
they never show in Documents. For every such card a person still points at,
this writes the row under <person> › Aadhaar with web360.file_aadhaar_card —
the same helper the API uses — in one transaction. Idempotent: a re-run
files nothing more.

Output is counts only. Names, numbers, owner ids, node ids, DSNs and
passwords are never printed. No storage object is read or written: keys stay
{node}/{version}, and only a pointer row is added.

--environment is required. --execute always needs --approval-ref. dev/prod
need Reddy's separate approval under safe-data-migration (exact SHA, backup
reference, writer-control window); agents never run them.
"""
import argparse
import asyncio
import os
from pathlib import Path
import sys

import psycopg
from psycopg.conninfo import make_conninfo
from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

PG_PARTS = ("PG_HOST", "PG_PORT", "PG_USER", "PG_PASSWORD", "PG_DATABASE")

REQUIRED_SCHEMA = (
    ("aadhaar_candidates", "card_node_id"),
    ("aadhaar_candidates", "card_mime"),
    ("family_members", "aadhaar_record_id"),
    ("users", "kyc_aadhaar_record_id"),
    ("documents", "aadhaar_record_id"),
    ("vault_folders", "person_id"),
)

# Every kept card a subject points at, with whom to file it under. The
# account's own record goes in the account's folder; otherwise the first
# member (by id) that holds it.
CARDS_SQL = """
SELECT r.id AS record_id, r.owner_user_id AS owner,
       (u.id IS NOT NULL) AS is_account, COALESCE(u.name, '') AS account_name,
       m.id AS member_id, COALESCE(m.name, '') AS member_name,
       EXISTS (SELECT 1 FROM documents d WHERE d.owner_user_id=r.owner_user_id
               AND d.aadhaar_record_id=r.id) AS filed
  FROM aadhaar_candidates r
  LEFT JOIN users u ON u.id=r.owner_user_id AND u.kyc_aadhaar_record_id=r.id
  LEFT JOIN LATERAL (SELECT id, name FROM family_members fm
                      WHERE fm.owner_user_id=r.owner_user_id AND fm.aadhaar_record_id=r.id
                        AND fm.is_self=false ORDER BY fm.id LIMIT 1) m ON true
 WHERE r.card_node_id<>'' AND r.consumed_at IS NOT NULL
   AND (u.id IS NOT NULL OR m.id IS NOT NULL)
 ORDER BY r.created_at, r.id
"""


class Refused(Exception):
    """A guard refusal: exit 2 before any write. The message never holds a value."""


def parse_args(argv):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--environment", required=True, choices=["local", "dev", "prod"])
    parser.add_argument("--execute", action="store_true", help="Write; without it the run is read-only")
    parser.add_argument("--approval-ref", help="Required with --execute, and for dev/prod")
    parser.add_argument("--writers-drained", action="store_true",
                        help="dev/prod: confirm API, gateway and workers are drained")
    parser.add_argument("--allow-remote", action="store_true", help="dev/prod: required")
    return parser.parse_args(argv)


def guard_before_connect(args):
    if args.execute and not args.approval_ref:
        raise Refused("--execute requires --approval-ref")
    app_env = os.getenv("APP_ENV")
    if args.environment == "local":
        if app_env and app_env != "local":
            raise Refused("APP_ENV is not local")
        if not os.getenv("API_DSN"):
            raise Refused("set API_DSN")
        return os.environ["API_DSN"]
    if app_env != args.environment:
        raise Refused("APP_ENV does not match --environment")
    if os.getenv("API_DSN"):
        raise Refused(f"API_DSN must not be set for {args.environment}; the PG_* parts are used")
    missing = [name for name in PG_PARTS if not os.getenv(name)]
    if missing:
        raise Refused("missing " + ", ".join(missing))
    if not args.allow_remote or not args.approval_ref:
        raise Refused("--allow-remote and --approval-ref are required for " + args.environment)
    if args.execute and not args.writers_drained:
        raise Refused("--execute requires --writers-drained for " + args.environment)
    return make_conninfo(host=os.environ["PG_HOST"], port=os.environ["PG_PORT"], dbname=os.environ["PG_DATABASE"],
                         user=os.environ["PG_USER"], password=os.environ["PG_PASSWORD"])


async def connect(conninfo):
    return await psycopg.AsyncConnection.connect(conninfo, autocommit=True, row_factory=dict_row)


async def guard_server(conn, environment):
    row = await (await conn.execute(
        "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rdsadmin') AS role, "
        "current_setting('rds.extensions', true) IS NOT NULL AS ext")).fetchone()
    rds = bool(row["role"] or row["ext"])
    if environment == "local" and rds:
        raise Refused("this server looks like RDS; local runs only touch a local database")
    if environment != "local" and not rds:
        raise Refused("the server is not RDS")


async def require_schema(conn):
    rows = await (await conn.execute(
        "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema=current_schema()"
    )).fetchall()
    have = {(r["table_name"], r["column_name"]) for r in rows}
    if any(pair not in have for pair in REQUIRED_SCHEMA):
        raise Refused("deploy the per-person Documents API first")


async def backfill(conn, execute):
    from src import web360
    cards = await (await conn.execute(CARDS_SQL)).fetchall()
    pending = [c for c in cards if not c["filed"]]
    counts = {"kept_cards": len(cards), "already_filed": len(cards) - len(pending), "to_file": len(pending)}
    if not execute:
        print("dry_run " + " ".join(f"{k}={v}" for k, v in counts.items()))
        return counts
    filed = 0
    async with conn.transaction():
        for card in pending:
            if card["is_account"]:
                person, name = card["owner"], card["account_name"] or "You"
            else:
                person, name = card["member_id"], card["member_name"]
            if await web360.file_aadhaar_card(conn, card["owner"], card["record_id"], person, name):
                filed += 1
    counts["filed"] = filed
    print("executed " + " ".join(f"{k}={v}" for k, v in counts.items()))
    return counts


async def run(args):
    conninfo = guard_before_connect(args)
    conn = await connect(conninfo)
    try:
        await guard_server(conn, args.environment)
        await require_schema(conn)
        await backfill(conn, args.execute)
    finally:
        await conn.close()
    return 0


def main(argv=None):
    args = parse_args(argv)
    try:
        return asyncio.run(run(args))
    except Refused as exc:
        print(f"backfill_aadhaar_documents: refused: {exc}", file=sys.stderr)
        return 2
    except Exception as exc:
        # Only the type: connection errors carry hosts, and SQL errors carry values.
        print(f"backfill_aadhaar_documents: failed ({type(exc).__name__})", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
