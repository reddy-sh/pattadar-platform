#!/usr/bin/env python3
"""Rewrite every Pattadar property id (parcels.id, properties.id) to a UUIDv7.

Default is a read-only dry run that prints what --apply would change, per
schema.table.column. --apply does all of it in ONE transaction:

  1. map every parcels/properties id that is not already a UUIDv7 and not a
     seed fixture (w360-, demo-, sf- — seed purges and e2e specs key on them)
     to a new UUIDv7 whose timestamp is the row's created_at;
  2. drop every foreign key touching a table it rewrites (found in
     pg_constraint), so the PK and its references move together;
  3. rewrite references:
       - ids of 16+ characters (rec-…, UUIDs) wherever they appear, whole or
         inside a longer string, in every text/varchar/json/jsonb column of
         every non-system schema (a manifest, a route, a memoized response);
         "inside" means bounded by anything but [A-Za-z0-9_-];
       - shorter ids (pc01 …) only as a whole value of a column named
         *_id or target, or of parcels.id/properties.id — a 4-character id
         is too likely to occur by chance anywhere else;
  4. re-add the foreign keys from pg_get_constraintdef (re-validated);
  5. record old→new in record_id_aliases, so the record trail still finds
     the events chained under the old id;
  6. re-scan and roll everything back unless no old id is left.

Never touched: audit_events_v2 and audit_outbox (append-only and
hash-chained; the trail reads them through record_id_aliases), the alias
table itself, and any table with more than 5,000,000 rows (the public-record
corpus; each skip is printed). Tables the login cannot read are printed as
skipped too, and an --apply that needs to write a table it may not update is
refused.

service_order_intents and idempotency_keys are left in place. Their keys are
client-chosen and their request_hash covers the ids as sent, so a client
retrying with an old id replays its stored outcome and one retrying the same
key with the new id is refused as a different request — both fail closed.
Old ids inside idempotency_keys.response are rewritten like any other text,
and the boot sweep expires those rows anyway.

Scope is every non-system schema of the database it connects to. In dev/prod
the API, gateway and assistant share that one database, so storage_* and
assistant r_* tables are rewritten too; locally the gateway and assistant may
run on databases of their own, which a local run does not reach. Never
covered: ids a client has cached (web local storage, iOS/Expo caches); old
links 404 by design. Parcel.ref ends in a hash of the row id, so a migrated
parcel's displayed ref tail changes.

Output is counts only — no ids, names or row contents. Errors print only
their type. Requires the API that reads record_id_aliases to be deployed
first (the table comes from its boot DDL); otherwise the run refuses.

--environment is required; --apply needs --approval-ref. dev/prod need
--allow-remote, PG_* parts (never API_DSN) and, to apply, --writers-drained:
Reddy's approval for the exact SHA, snapshot and writer window under
safe-data-migration; agents never run them.

    API_DSN=… python services/api/scripts/migrate-property-ids-uuid7.py --environment local
"""
import argparse
from datetime import datetime, timezone
import os
from pathlib import Path
import re
import sys

import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo
from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.ids import uuid7  # noqa: E402

PG_PARTS = ("PG_HOST", "PG_PORT", "PG_USER", "PG_PASSWORD", "PG_DATABASE")
SOURCES = ("parcels", "properties")  # in schema public
SEED_PREFIXES = ("w360-", "demo-", "sf-")
NEVER = {("public", "audit_events_v2"), ("public", "audit_outbox"), ("public", "record_id_aliases")}
MAX_ROWS = 5_000_000
LONG = 16
UUID7 = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
TEXT_TYPES = ("text", "character varying", "json", "jsonb")


class Refused(Exception):
    """A guard refusal before any write. The message never holds a value."""


class Unverified(Exception):
    """Old ids were left after the rewrite; the transaction is rolled back."""


def parse_args(argv):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--environment", required=True, choices=["local", "dev", "prod"])
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="the default: count only, write nothing")
    mode.add_argument("--apply", action="store_true", help="rewrite, in one transaction")
    p.add_argument("--approval-ref", help="required with --apply, and for dev/prod")
    p.add_argument("--allow-remote", action="store_true", help="dev/prod: required")
    p.add_argument("--writers-drained", action="store_true",
                   help="dev/prod --apply: confirm API, gateway, assistant and workers are drained")
    return p.parse_args(argv)


def guard(args):
    if args.apply and not args.approval_ref:
        raise Refused("--apply requires --approval-ref")
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
    missing = [n for n in PG_PARTS if not os.getenv(n)]
    if missing:
        raise Refused("missing " + ", ".join(missing))
    if not args.allow_remote or not args.approval_ref:
        raise Refused("--allow-remote and --approval-ref are required for " + args.environment)
    if args.apply and not args.writers_drained:
        raise Refused("--apply requires --writers-drained for " + args.environment)
    return make_conninfo(host=os.environ["PG_HOST"], port=os.environ["PG_PORT"], dbname=os.environ["PG_DATABASE"],
                         user=os.environ["PG_USER"], password=os.environ["PG_PASSWORD"])


def guard_server(conn, environment):
    row = conn.execute("SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rdsadmin') AS role, "
                       "current_setting('rds.extensions', true) IS NOT NULL AS ext").fetchone()
    rds = bool(row["role"] or row["ext"])
    if environment == "local" and rds:
        raise Refused("this server looks like RDS; local runs only touch a local database")
    if environment != "local" and not rds:
        raise Refused("the server is not RDS")
    if conn.execute("SELECT to_regclass('public.record_id_aliases') IS NULL AS missing").fetchone()["missing"]:
        raise Refused("record_id_aliases is missing: deploy the API that reads it (boot DDL) first")


def created_ms(value):
    try:
        at = datetime.fromisoformat(str(value).strip())
    except ValueError:
        return None
    return int((at if at.tzinfo else at.replace(tzinfo=timezone.utc)).timestamp() * 1000)


def build_map(conn):
    """{old: new} for every property id that is due a UUIDv7."""
    out = {}
    for table in SOURCES:
        has_created = conn.execute(
            "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=%s"
            " AND column_name='created_at'", (table,)).fetchone()
        when = sql.SQL("created_at::text") if has_created else sql.SQL("NULL")
        rows = conn.execute(sql.SQL("SELECT id, {} AS created FROM public.{}").format(when, sql.Identifier(table)))
        for row in rows:
            old = row["id"]
            if not old or UUID7.match(old) or old.startswith(SEED_PREFIXES):
                continue
            if old in out:
                raise Refused("one id is both a parcel and a property; resolve it by hand first")
            out[old] = uuid7(created_ms(row["created"]) if row["created"] else None)
    return out


def catalog(conn):
    """[(schema, table, oid, [(column, type)])] of every ordinary table with text-like columns, and the skips."""
    rows = conn.execute(
        "SELECT n.nspname AS schema, c.relname AS tbl, c.oid, c.reltuples, a.attname AS col,"
        " format_type(a.atttypid, NULL) AS type,"
        " has_table_privilege(c.oid, 'SELECT') AS can_read, has_table_privilege(c.oid, 'UPDATE') AS can_write"
        " FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace"
        " JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated=''"
        " WHERE c.relkind='r' AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')"
        " AND n.nspname NOT LIKE 'pg\\_%%' AND format_type(a.atttypid, NULL) = ANY(%s)"
        " ORDER BY 1, 2, a.attnum", (list(TEXT_TYPES),))
    tables, skips = {}, {}
    for r in rows:
        key = (r["schema"], r["tbl"])
        if key in NEVER:
            skips[key] = "append-only or alias table"
        elif r["reltuples"] > MAX_ROWS:
            skips[key] = f"over {MAX_ROWS:,} rows"
        elif not r["can_read"]:
            skips[key] = "no SELECT privilege"
        else:
            tables.setdefault(key, {"oid": r["oid"], "can_write": r["can_write"], "cols": []})["cols"].append(
                (r["col"], r["type"]))
    return tables, skips


def short_column(schema, table, column):
    return column.endswith("_id") or column == "target" or (
        column == "id" and schema == "public" and table in SOURCES)


def scan(conn, tables, mapping, apply):
    """{(schema, table, column): rows changed (or to change)}; writes only when apply."""
    longs = sorted((o for o in mapping if len(o) >= LONG), key=len, reverse=True)
    shorts = [o for o in mapping if len(o) < LONG]
    escaped = [re.sub(r"([^A-Za-z0-9])", r"\\\1", o) for o in longs]
    # Postgres cannot compile one alternation of ~2,000 ids (invalid memory
    # alloc), so the SQL prefilter is several smaller ones OR-ed together.
    prefilters = ["(" + "|".join(escaped[i:i + 500]) + ")" for i in range(0, len(escaped), 500)]
    exact = re.compile(r"(?<![A-Za-z0-9_-])(" + "|".join(escaped) + r")(?![A-Za-z0-9_-])") if longs else None
    counts = {}
    for (schema, table), info in tables.items():
        ident = sql.Identifier(schema, table)
        if shorts:
            for column, type_ in info["cols"]:
                if type_ not in ("text", "character varying") or not short_column(schema, table, column):
                    continue
                col = sql.Identifier(column)
                if apply:
                    n = conn.execute(sql.SQL(
                        "UPDATE {t} SET {c} = m.new_id FROM pg_temp.id_map m"
                        " WHERE {t}.{c}::text = m.old_id AND length(m.old_id) < %s").format(t=ident, c=col),
                        (LONG,)).rowcount
                else:
                    n = conn.execute(sql.SQL(
                        "SELECT count(*) AS n FROM {t} JOIN pg_temp.id_map m"
                        " ON {t}.{c}::text = m.old_id AND length(m.old_id) < %s").format(t=ident, c=col),
                        (LONG,)).fetchone()["n"]
                if n:
                    counts[(schema, table, column)] = counts.get((schema, table, column), 0) + n
        if not longs:
            continue
        cols = info["cols"]
        where = sql.SQL(" OR ").join(sql.SQL("{}::text ~ %s").format(sql.Identifier(c))
                                     for c, _ in cols for _p in prefilters)
        rows = conn.execute(sql.SQL("SELECT ctid::text AS ctid, {cols} FROM {t} WHERE {w}").format(
            cols=sql.SQL(", ").join(sql.SQL("{}::text").format(sql.Identifier(c)) for c, _ in cols),
            t=ident, w=where), prefilters * len(cols)).fetchall()
        for row in rows:
            sets = []
            for column, type_ in cols:
                value = row[column]
                if value is None or not exact.search(value):
                    continue
                counts[(schema, table, column)] = counts.get((schema, table, column), 0) + 1
                cast = sql.SQL("::" + type_) if type_ in ("json", "jsonb") else sql.SQL("")
                sets.append((sql.SQL("{} = %s{}").format(sql.Identifier(column), cast),
                             exact.sub(lambda m: mapping[m.group(1)], value)))
            if sets and apply:
                conn.execute(sql.SQL("UPDATE {t} SET {s} WHERE ctid = %s::tid").format(
                    t=ident, s=sql.SQL(", ").join(s for s, _ in sets)), [v for _, v in sets] + [row["ctid"]])
    return counts


def foreign_keys(conn, oids):
    return conn.execute(
        "SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def"
        " FROM pg_constraint WHERE contype='f' AND (conrelid = ANY(%s) OR confrelid = ANY(%s))"
        " ORDER BY 1, 2", (oids, oids)).fetchall()


def run(args):
    conninfo = guard(args)
    with psycopg.connect(conninfo, row_factory=dict_row) as conn:
        guard_server(conn, args.environment)
        mapping = build_map(conn)
        conn.execute("CREATE TEMP TABLE id_map (old_id TEXT PRIMARY KEY, new_id TEXT NOT NULL) ON COMMIT DROP")
        with conn.cursor() as cur:
            cur.executemany("INSERT INTO pg_temp.id_map VALUES (%s, %s)", list(mapping.items()))
        tables, skips = catalog(conn)
        for (schema, table), why in sorted(skips.items()):
            print(f"skip {schema}.{table}: {why}")
        print(f"ids_to_migrate={len(mapping)} long={sum(len(o) >= LONG for o in mapping)}"
              f" short={sum(len(o) < LONG for o in mapping)}")
        plan = scan(conn, tables, mapping, apply=False) if mapping else {}
        for (schema, table, column), n in sorted(plan.items()):
            print(f"{'rewrite' if args.apply else 'would_rewrite'} {schema}.{table}.{column} rows={n}")
        if not args.apply or not mapping:
            conn.rollback()
            print("dry run: nothing written" if not args.apply else "nothing to migrate")
            return 0

        touched = sorted({(s, t) for s, t, _ in plan})
        blocked = [f"{s}.{t}" for s, t in touched if not tables[(s, t)]["can_write"]]
        if blocked:
            raise Refused("no UPDATE privilege on " + ", ".join(blocked))
        fks = foreign_keys(conn, [tables[k]["oid"] for k in touched])
        for fk in fks:
            conn.execute(sql.SQL("ALTER TABLE {} DROP CONSTRAINT {}").format(
                sql.SQL(fk["tbl"]), sql.Identifier(fk["conname"])))
        done = scan(conn, tables, mapping, apply=True)
        for fk in fks:
            conn.execute(sql.SQL("ALTER TABLE {} ADD CONSTRAINT {} {}").format(
                sql.SQL(fk["tbl"]), sql.Identifier(fk["conname"]), sql.SQL(fk["def"])))
        conn.execute("INSERT INTO record_id_aliases (old_id, new_id) SELECT old_id, new_id FROM pg_temp.id_map"
                     " ON CONFLICT (old_id) DO NOTHING")

        left = scan(conn, tables, mapping, apply=False)
        if left or done != plan:
            raise Unverified(f"{sum(left.values())} old references left in {len(left)} columns")
        conn.commit()
        print(f"applied: ids={len(mapping)} columns={len(done)} rows={sum(done.values())}"
              f" foreign_keys_readded={len(fks)} aliases={len(mapping)} verified=0_left")
    return 0


def main(argv=None):
    args = parse_args(argv)
    try:
        return run(args)
    except Refused as exc:
        print(f"migrate-property-ids-uuid7: refused: {exc}", file=sys.stderr)
        return 2
    except Unverified as exc:
        print(f"migrate-property-ids-uuid7: rolled back: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        # Only the type: connection errors carry hosts, and SQL errors carry values.
        print(f"migrate-property-ids-uuid7: rolled back ({type(exc).__name__})", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
