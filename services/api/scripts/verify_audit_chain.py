#!/usr/bin/env python3
"""Verify the audit trail's hash chain and report the first break.

Read-only. This is the answer to an auditor's first question — "prove these
records have not been altered" — and it is deliberately runnable by someone who
is not the platform admin.

  APP_PG_DSN=... ./verify_audit_chain.py            # walk the whole chain
  APP_PG_DSN=... ./verify_audit_chain.py --json     # machine-readable verdict

Exit status is the point for automation:
  0  chain intact
  1  chain broken — an event was modified, removed, or inserted out of band
  2  could not check (no database, no chain yet)

A break is not automatically foul play: the retention sweep expires events by
design, which leaves a gap at the START of the chain. A gap that matches a
logged retention run is explainable; a break in the middle, or one with no
corresponding retention log line, is not.
"""
import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import audit  # noqa: E402


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--json", action="store_true", help="emit the verdict as JSON")
    parser.add_argument("--limit", type=int, default=0,
                        help="check only the first N events (quick check)")
    args = parser.parse_args()

    dsn = os.getenv("APP_PG_DSN", "")
    if not dsn:
        print("APP_PG_DSN is not set; refusing to guess which database to verify",
              file=sys.stderr)
        return 2

    try:
        async with await psycopg.AsyncConnection.connect(
                dsn, autocommit=True, row_factory=dict_row) as conn:
            verdict = await audit.verify_chain(conn, limit=args.limit)
            health = await audit.health(conn)
    except Exception as exc:  # noqa: BLE001
        print(f"could not verify: {type(exc).__name__}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps({"chain": verdict, "pipeline": {
            k: v for k, v in health.items() if k != "chain"}}, indent=2))
    elif verdict["ok"]:
        print(f"chain intact — {verdict['checked']} event(s) verified")
        if health["backlog"]:
            print(f"note: {health['backlog']} event(s) still waiting to be chained")
    else:
        print(f"CHAIN BROKEN at seq {verdict['broken_at']} "
              f"after {verdict['checked']} good event(s)")
        print(f"reason: {verdict['reason']}")

    return 0 if verdict["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
