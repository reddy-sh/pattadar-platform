#!/usr/bin/env python3
"""Move properties that are really farmland to the farmland register
(docs/specs/2026-10-11-property-overview.md §7; Reddy, 12/10/2026, D1).

LOCAL ONLY. Refuses anything that looks like RDS or a non-local APP_ENV.

    --flagged          list the ids of properties that read as farmland saved
                       as a plot (the backfill's "reads as farmland, not moved",
                       and what the Overview offers to convert). Lists only;
                       never converts.
    RECORD_ID …        convert each, through the same server function the
                       Overview's convertRecordKind calls (web360
                       _convert_record_kind): same id, acres, under a khata,
                       every child row moved, the owner's claim and the
                       record.kind_changed audit line. Each record is owned by
                       the properties row's owner, whose decision the claims
                       stay; the audit line names this script as the operator
                       that applied it (actor kind admin) and --approval-ref.
                       One refusal rolls back all.

Default is a dry run: the same work inside one transaction, rolled back, so
the counts are what --apply would do. --apply commits and needs
--approval-ref. Take a dump first:

    pg_dump --format=custom --file=pattadar-before-convert.dump "$API_DSN"

Output is counts only (and, for --flagged, ids). Errors print their message
when it is a refusal in words, else only their type.

    API_DSN=… python services/api/scripts/convert_record_kind.py --environment local --flagged
    API_DSN=… python services/api/scripts/convert_record_kind.py --environment local ID [--apply --approval-ref …]
"""
import argparse
import asyncio
import os
import sys
from collections import Counter
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import record_master as rm, web360 as w  # noqa: E402


class Refused(Exception):
    """A guard refusal before any write."""


def guard(args) -> str:
    if args.apply and not args.approval_ref:
        raise Refused("--apply requires --approval-ref")
    if args.apply and args.flagged:
        raise Refused("--flagged only lists; name the record ids to convert")
    if not args.flagged and not args.ids:
        raise Refused("name record ids, or --flagged")
    if os.getenv("APP_ENV") and os.getenv("APP_ENV") != "local":
        raise Refused("APP_ENV is not local")
    dsn = os.getenv("API_DSN", "")
    if not dsn:
        raise Refused("set API_DSN")
    return dsn


async def flagged(conn) -> list:
    cur = await conn.execute("SELECT * FROM properties ORDER BY created_at")
    out = []
    for prop in await cur.fetchall():
        ref = prop.get("source_ref") or ""
        pr = await rm.public_record_row(conn, ref) if ref.startswith("pr:") else None
        if rm.farmland_reason(prop, pr):
            out.append(prop["id"])
    return out


#: Who applied it, on the audit envelope (the owner stays the affected owner).
OPERATOR = "operator:convert_record_kind"


async def convert(conn, ids: list, counts: Counter, approval_ref: str = "") -> None:
    for rid in ids:
        cur = await conn.execute("SELECT owner_user_id FROM properties WHERE id=%s", (rid,))
        row = await cur.fetchone()
        if not row:
            raise Refused("a record id is not a property (already converted, or unknown)")
        moved = await w._convert_record_kind(conn, row["owner_user_id"], rid, "parcel",
                                             operator=OPERATOR, approval_ref=approval_ref)
        counts["converted"] += 1
        counts[f"passbook_{moved.pop('passbook')}"] += 1
        for key, n in moved.items():
            counts[f"moved_{key}"] += n


async def run(args) -> int:
    dsn = guard(args)
    async with await psycopg.AsyncConnection.connect(dsn, row_factory=dict_row) as conn:
        row = await (await conn.execute(
            "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rdsadmin') AS rds")).fetchone()
        if row["rds"]:
            raise Refused("this server looks like RDS; this script is local only")
        if args.flagged:
            ids = await flagged(conn)
            await conn.rollback()
            print(f"convert_record_kind: {len(ids)} propert{'y reads' if len(ids) == 1 else 'ies read'}"
                  " as farmland saved as a plot")
            for rid in ids:
                print(f"  {rid}")
            return 0
        counts: Counter = Counter()
        try:
            await convert(conn, args.ids, counts, args.approval_ref or "")
        except Exception:
            await conn.rollback()
            raise
        if args.apply:
            await conn.commit()
        else:
            await conn.rollback()
    print(f"convert_record_kind: {'applied' if args.apply else 'dry-run (rolled back)'}")
    for key in sorted(counts):
        print(f"  {key}={counts[key]}")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--environment", required=True, choices=["local"])
    p.add_argument("ids", nargs="*", metavar="RECORD_ID")
    p.add_argument("--flagged", action="store_true", help="list farmland saved as a plot")
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="the default: write nothing")
    mode.add_argument("--apply", action="store_true", help="commit, in one transaction")
    p.add_argument("--approval-ref", help="required with --apply")
    args = p.parse_args(argv)
    try:
        if args.apply:
            print("convert_record_kind: take a pg_dump first (see --help)", file=sys.stderr)
        return asyncio.run(run(args))
    except (Refused, ValueError) as exc:
        print(f"convert_record_kind: refused, nothing written: {exc}", file=sys.stderr)
        return 2
    except Exception as exc:
        print(f"convert_record_kind: rolled back ({type(exc).__name__})", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
