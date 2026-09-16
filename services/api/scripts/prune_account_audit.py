#!/usr/bin/env python3
"""Prune anonymized erasure audit metadata after its configured retention.

Read-only by default. Schedule with --execute using a narrowly scoped DB role.
"""
import argparse
import os
import psycopg


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute",action="store_true")
    args = parser.parse_args()
    with psycopg.connect(os.environ["API_DSN"]) as conn:
        if not args.execute:
            conn.execute("SET TRANSACTION READ ONLY")
        if conn.execute("SELECT to_regclass('account_retained_audits')").fetchone()[0] is None:
            print("No retained account audit table")
            return
        count = conn.execute("SELECT count(*) FROM account_retained_audits WHERE expires_at<=now()").fetchone()[0]
        if args.execute:
            conn.execute("DELETE FROM account_retained_audits WHERE expires_at<=now()")
        print(f"{'Removed' if args.execute else 'Would remove'} {count} expired audit records")


if __name__ == "__main__":
    main()
