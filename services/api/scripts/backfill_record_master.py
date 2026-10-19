#!/usr/bin/env python3
"""Backfill the property master record (docs/specs/2026-10-11-property-overview.md §4).

LOCAL ONLY. Production and dev are out of scope; this refuses anything that
looks like RDS or a non-local APP_ENV.

For every record saved from a public deed (source_ref 'pr:<rid>:<s_no>'):

  1. re-read that deed row, read-only, from land.real_estate_records and file
     its facts as `public_record` claims through record_master: how acquired
     (from txn_class; '' when the class moves no title), registered, document
     number, dates, office, government value, survey number and plot/door
     numbers with the corpus's "()" placeholders removed, land class,
     boundaries. A field whose current value is neither empty, the same, nor
     the corpus's own raw text is LEFT ALONE — that value was typed by a person
     before sources were kept, and a backfill does not outrank it;
  2. relabel the acquiring transfer with the deed's kind (the old save wrote
     every one as a sale) and link it as the record's acquiring transfer;
  3. rename a "Plot ()"-style title to "Sy 70/3 · Katragunta", on the trail;
  4. correct how-acquired where the record holds only the old column default
     ('sale' / 'purchase' — never stated by anyone): from txn_class, or back
     to "not set" for a class that moves no title. An owner's own claim stays;
  5. drop the "you entered" kind-of-land claim the assistant save filed for
     the card's default (a manual claim equal to that kind's card default),
     so the public record's land class — which replaces the default in the
     column — or nothing, speaks for it;
  6. a record saved before transfers carried parties gets them from its
     People rows (record_owners / property_owners), never an empty event.

Then, for every record: link `acquired_by_transfer_id` where it is empty and
the record has exactly one transfer.

Records whose land reads as farmland but are saved as a plot are COUNTED, not
moved: changing a record's kind is the owner's call (convert_record_kind.py --flagged lists them).

Default is a dry run: the same work inside one transaction, rolled back, so the
counts are exactly what --apply would do. --apply commits it. Output is counts
only — no ids, names, places or numbers. Errors print only their type.
Idempotent: a second --apply changes nothing.

    API_DSN="host=localhost port=5432 dbname=pattadar user=… password=…" \\
      python services/api/scripts/backfill_record_master.py --environment local [--apply]
"""
import argparse
import asyncio
import os
import re
import sys
from collections import Counter
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import record_master as rm, web360 as w  # noqa: E402

_JUNK_TITLE = re.compile(r"\(\s*\)|,\s*$|^\s*(Plot|H\.No)\s*[,(]")
#: The column defaults the old saves left ('sale' on parcels, 'purchase' on
#: properties): nobody said them, so a public record may replace them (A9).
_MODE_DEFAULTS = ("", "sale", "purchase")
#: The kind of land the assistant card filled in when the deed did not say:
#: nobody's statement, so the deed row's own word replaces it (B4).
_CARD_DEFAULT = {"parcel": "agri", "property": "open_plot"}


class Refused(Exception):
    """A guard refusal before any write. The message never holds a value."""


_no = rm.no_value
_pr_values = rm.pr_values


def _title(row: dict) -> str:
    village = (row.get("village") or "").strip().title()
    head = (f"Plot {_no(row.get('plot_no'))}" if _no(row.get("plot_no"))
            else f"H.No {_no(row.get('house_no'))}" if _no(row.get("house_no"))
            else f"Sy {_no(row.get('survey_no'))}" if _no(row.get("survey_no")) else "")
    return " · ".join(p for p in (head, village) if p)


def _keep(f, current: str, new: str, raw: str) -> bool:
    """May a public-record claim be filed over what the column holds now?"""
    if not current or rm.same(f, current, new):
        return True
    return bool(raw) and " ".join(raw.split()) == current   # the corpus's own junk text


async def _records(conn) -> list:
    cur = await conn.execute(
        "SELECT p.id, 'parcel' AS kind, pb.owner_user_id AS uid, p.source_ref, p.stake,"
        " '' AS label, '' AS type, p.acquired_by_transfer_id AS held, p.created_at"
        " FROM parcels p JOIN passbooks pb ON pb.id=p.passbook_id"
        " UNION ALL SELECT id, 'property', owner_user_id, source_ref, stake, label, type,"
        " acquired_by_transfer_id, created_at FROM properties")
    return list(await cur.fetchall())


async def _people(conn, uid: str, rec: str, kind: str) -> list:
    """[{name, side}] from the record's People rows, for a transfer saved without parties."""
    cur = await conn.execute(
        "SELECT name, CASE WHEN is_current THEN 'to' ELSE 'from' END AS side FROM record_owners"
        " WHERE owner_user_id=%s AND record_id=%s AND name<>'' ORDER BY sort", (uid, rec))
    rows = list(await cur.fetchall())
    if not rows and kind == "property":
        cur = await conn.execute(
            "SELECT owner_name AS name, CASE WHEN is_current THEN 'to' ELSE 'from' END AS side"
            " FROM property_owners WHERE property_id=%s AND owner_name<>'' ORDER BY created_at",
            (rec,))
        rows = list(await cur.fetchall())
    return rows


async def backfill(conn, counts: Counter) -> None:
    records = await _records(conn)
    counts["records"] = len(records)
    for r in records:
        ref = r["source_ref"] or ""
        if not ref.startswith("pr:"):
            continue
        counts["pr_records"] += 1
        row = await rm.public_record_row(conn, ref)       # read-only
        if not row:
            counts["pr_deed_not_found"] += 1
            continue
        uid, rec, kind = r["uid"], r["id"], r["kind"]
        log = w._logger(conn, uid, rec)
        vals, raw, acq = _pr_values(row, kind)
        # The card's default kind of land was filed as "you entered" when the
        # record was saved (A10, B4): a manual classification claim that is the
        # card default for this kind is nobody's statement, and goes.
        cur = await conn.execute(
            "DELETE FROM record_field_claims WHERE owner_user_id=%s AND record_id=%s"
            " AND field='classification' AND source='manual' AND value=%s",
            (uid, rec, _CARD_DEFAULT[kind]))
        counts["default_classification_claims_dropped"] += cur.rowcount
        manual = {c["field"] for c in await rm.claims_for(conn, uid, rec) if c["source"] == "manual"}
        now = await rm.current(conn, rec, kind)
        keep = {}
        for k, v in vals.items():
            f = rm.FIELDS[k]
            if not f.target(kind):
                continue
            try:
                v = rm.clean(f, v, kind)
            except ValueError:
                counts["pr_value_unusable"] += 1
                continue
            card_default = (k == "classification" and k not in manual
                            and now.get(k, "") == _CARD_DEFAULT[kind])
            if card_default or _keep(f, now.get(k, ""), v, raw.get(k, "")):
                keep[k] = v
            else:
                counts["pr_field_kept_owners_value"] += 1
        for k in rm.TITLE_KEYS:
            try:
                v = rm.clean(rm.FIELDS[k], acq.get(k), kind)
            except ValueError:
                acq[k] = ""
                continue
            legacy_mode = (k == "acquisition_mode" and k not in manual
                           and now.get(k, "") in _MODE_DEFAULTS)
            if not legacy_mode and not _keep(rm.FIELDS[k], now.get(k, ""), v, ""):
                acq[k] = ""
                counts["pr_field_kept_owners_value"] += 1
        if (not acq["acquisition_mode"] and "acquisition_mode" not in manual
                and now.get("acquisition_mode", "") in _MODE_DEFAULTS[1:]):
            # A mortgage, receipt or lease moves no title: the old default
            # 'sale' was never true. How acquired goes back to "not set".
            await rm._write(conn, rec, kind, rm.FIELDS["acquisition_mode"], "")
            await conn.execute(
                "DELETE FROM record_field_claims WHERE owner_user_id=%s AND record_id=%s"
                " AND field='acquisition_mode' AND source<>'manual'", (uid, rec))
            await w._log_change(conn, uid, rec, "How acquired", now["acquisition_mode"], "",
                                "Public record")
            counts["mode_default_cleared"] += 1
        before = await rm.current(conn, rec, kind)
        await rm.apply_claims(conn, uid, rec, kind, source="public_record", source_ref=ref,
                              label="Public record", values=keep, log=log)
        if r["stake"] == "watch":
            await rm.apply_claims(conn, uid, rec, kind, source="public_record", source_ref=ref,
                                  label="Public record", log=log,
                                  values={k: v for k, v in acq.items() if v})
        else:
            # The old save wrote the transfer with no source_ref; claim it so it is
            # updated in place (kind, dates, values), not duplicated.
            await conn.execute(
                "UPDATE record_transfers SET source_ref=%s WHERE owner_user_id=%s AND"
                " record_id=%s AND source='public_records' AND source_ref=''"
                " AND (SELECT count(*) FROM record_transfers t WHERE t.record_id=%s"
                " AND t.source='public_records')=1", (ref, uid, rec, rec))
            cur = await conn.execute(
                "SELECT p.name, p.side FROM record_transfer_parties p JOIN record_transfers t"
                " ON t.id=p.transfer_id WHERE t.record_id=%s AND t.source_ref=%s ORDER BY p.sort",
                (rec, ref))
            parties = list(await cur.fetchall())
            if not parties:
                # Saved before transfers carried parties: the People rows
                # are who it named (B6). Current holders received it.
                parties = await _people(conn, uid, rec, kind)
                counts["parties_from_people_rows"] += bool(parties)
            froms = [{"name": p["name"], "role": "seller"} for p in parties if p["side"] == "from"]
            tos = [{"name": p["name"], "role": "buyer"} for p in parties if p["side"] == "to"]
            note = "" if acq["acquisition_mode"] else (
                f"Registered as {str(row.get('transaction_type') or '').strip()[:60]}")
            await rm.set_acquisition(conn, uid, rec, kind, source="public_record",
                                     source_ref=ref, label="Public record", acq=acq,
                                     from_parties=froms, to_parties=tos, note=note, log=log)
        after = await rm.current(conn, rec, kind)
        counts["pr_fields_changed"] += sum(1 for k in after if after[k] != before.get(k, ""))
        if kind == "property" and _JUNK_TITLE.search(r["label"] or ""):
            new = _title(row)
            if new and new != r["label"]:
                await conn.execute("UPDATE properties SET label=%s WHERE id=%s", (new, rec))
                await w._log_change(conn, uid, rec, "Name", r["label"], new, "Public record")
                counts["titles_cleaned"] += 1
        if kind == "property" and (r["type"] or "") not in ("agri",) and rm.pr_reads_as_farmland(row):
            # Listed by convert_record_kind.py --flagged; moving it is the owner's call.
            counts["reads_as_farmland_saved_as_plot_not_moved"] += 1
    # Link the one transfer a record has as its acquiring one.
    for table in ("parcels", "properties"):
        cur = await conn.execute(
            f"UPDATE {table} r SET acquired_by_transfer_id=t.id FROM ("
            " SELECT record_id, min(id) AS id FROM record_transfers GROUP BY record_id"
            " HAVING count(*)=1) t WHERE t.record_id=r.id AND r.acquired_by_transfer_id=''")
        counts[f"{table}_transfer_linked"] += cur.rowcount


def guard(args) -> str:
    if args.apply and not args.approval_ref:
        raise Refused("--apply requires --approval-ref")
    if os.getenv("APP_ENV") and os.getenv("APP_ENV") != "local":
        raise Refused("APP_ENV is not local")
    dsn = os.getenv("API_DSN", "")
    if not dsn:
        raise Refused("set API_DSN")
    return dsn


async def run(args) -> int:
    dsn = guard(args)
    async with await psycopg.AsyncConnection.connect(dsn, row_factory=dict_row) as conn:
        row = await (await conn.execute(
            "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rdsadmin') AS rds")).fetchone()
        if row["rds"]:
            raise Refused("this server looks like RDS; this backfill is local only")
        for stmt in rm.DDL:
            await conn.execute(stmt)
        counts: Counter = Counter()
        await backfill(conn, counts)
        if args.apply:
            await conn.commit()
        else:
            await conn.rollback()
    mode = "applied" if args.apply else "dry-run (rolled back)"
    print(f"backfill_record_master: {mode}")
    for key in sorted(counts):
        print(f"  {key}={counts[key]}")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--environment", required=True, choices=["local"])
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="the default: write nothing")
    mode.add_argument("--apply", action="store_true", help="commit, in one transaction")
    p.add_argument("--approval-ref", help="required with --apply")
    args = p.parse_args(argv)
    try:
        return asyncio.run(run(args))
    except Refused as exc:
        print(f"backfill_record_master: refused: {exc}", file=sys.stderr)
        return 2
    except Exception as exc:
        print(f"backfill_record_master: rolled back ({type(exc).__name__})", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
