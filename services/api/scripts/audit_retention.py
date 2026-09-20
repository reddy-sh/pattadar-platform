#!/usr/bin/env python
"""Redact audit events past their retention class.

The API used to do this in-process, but ROLE_BOOTSTRAP_SQL takes UPDATE on
audit_events_v2 away from the application login — that is the whole point of
the boundary: the thing that records what the application did must not be
editable by the application. So the sweep moves here, to be run on a schedule
under a login that holds pattadar_audit_maintainer and nothing else.

Usage:
  AUDIT_MAINT_DSN=... ./audit_retention.py            # redact what has expired
  AUDIT_MAINT_DSN=... ./audit_retention.py --dry-run  # count, change nothing
  AUDIT_MAINT_DSN=... ./audit_retention.py --json     # machine-readable

Exit status is 0 on success, 1 if the login lacks the maintainer role (which
means the schedule is pointed at the wrong credential), 2 on any other error.
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src import audit  # noqa: E402


async def _run(dsn: str, dry_run: bool) -> dict:
    async with await psycopg.AsyncConnection.connect(dsn, autocommit=True) as conn:
        row = await (await conn.execute(
            "SELECT count(*) AS due FROM audit_events_v2"
            " WHERE expires_at IS NOT NULL AND expires_at < now()"
            "   AND redacted_at IS NULL")).fetchone()
        due = row[0]
        if dry_run:
            return {"due": due, "redacted": 0, "dry_run": True}
        redacted = await audit.redact_expired(conn) if due else 0
        return {"due": due, "redacted": redacted, "dry_run": False}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                        help="report what would be redacted and change nothing")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args()

    dsn = os.getenv("AUDIT_MAINT_DSN", "").strip()
    if not dsn:
        print("AUDIT_MAINT_DSN is required: the maintainer login, never the "
              "application login the API connects as.", file=sys.stderr)
        return 2

    try:
        result = asyncio.run(_run(dsn, args.dry_run))
    except psycopg.errors.InsufficientPrivilege:
        print("This login may not redact audit events. Grant it "
              f"{audit.AUDIT_MAINTAINER_ROLE}, or point AUDIT_MAINT_DSN at the "
              "operator login that already holds it.", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 - operator tool, report and exit
        print(f"audit retention failed: {exc}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(result))
    elif result["dry_run"]:
        print(f"{result['due']} event(s) are past their retention class; nothing changed.")
    else:
        print(f"Redacted {result['redacted']} of {result['due']} expired event(s); "
              "chain positions preserved.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
