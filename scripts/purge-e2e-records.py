"""Drop records the e2e suite created through the app, for one identity.

The two seed scripts purge only what they authored — `w360-` and `demo-` ids.
Anything the APP mints carries its own prefix (`rec-`, `exp-`, `wr-`, `sl-`,
`ph-`, `doc-`, `lf-`, `rp-`) and survives every reseed. So a crashed run leaves
a parcel behind and the next starts with ten records where the suite asserts
nine; a test that files an expense leaves it for every run after, and the
assertion reads "expected 1, received 2". None of those failures name the row
that caused them, and the residue persists until someone deletes it by hand.

Scoped by identity AND by prefix: the founder files real records in their own
account, and those must never be in range of this.

    python scripts/purge-e2e-records.py w360-demo
"""
import os
import sys

import psycopg

DSN = os.getenv("APP_PG_DSN",
                "host=localhost port=5432 dbname=pattadar user=rhub password=rhub-dev-pwd")
UID = sys.argv[1] if len(sys.argv) > 1 else os.getenv("DEV_USER_ID", "w360-demo")

# Everything that hangs off a record, keyed by the column naming it.
CHILDREN = (
    ("documents", "record_id"),
    ("parcel_photos", "parcel_id"),
    ("property_photos", "property_id"),
    ("land_features", "entity_id"),
    ("record_people", "record_id"),
    ("land_expenses", "entity_id"),
    ("work_requests", "entity_id"),
    ("boundary_marks", "parcel_id"),
    ("notes", "entity_id"),
)


def main() -> None:
    with psycopg.connect(DSN, autocommit=True) as conn:
        cur = conn.execute(
            "SELECT p.id FROM parcels p JOIN passbooks pb ON pb.id = p.passbook_id"
            " WHERE pb.owner_user_id = %s AND p.id LIKE 'rec-%%'", (UID,))
        ids = [r[0] for r in cur.fetchall()]
        cur = conn.execute(
            "SELECT id FROM properties WHERE owner_user_id = %s AND id LIKE 'rec-%%'", (UID,))
        ids += [r[0] for r in cur.fetchall()]

        # Rows the APP minted, as opposed to rows a seed script authored. Each
        # mutation stamps its own prefix, and no seeder purges them because no
        # seeder wrote them — so a test that files an expense leaves it behind
        # for every run after, and "expected 1, received 2" is the result.
        minted = 0
        for table, prefix in (
            ("land_expenses", "exp-"),
            ("work_requests", "wr-"),
            ("share_links", "sl-"),
            ("documents", "doc-"),
            ("parcel_photos", "ph-"),
            ("property_photos", "ph-"),
            ("land_features", "lf-"),
            ("record_people", "rp-"),
        ):
            try:
                gone = conn.execute(
                    f"DELETE FROM {table} WHERE owner_user_id = %s AND id LIKE %s"
                    " RETURNING id", (UID, f"{prefix}%")).fetchall()
                minted += len(gone)
            except psycopg.errors.UndefinedTable:
                pass

        # A village map uploaded through the Maps page is keyed by village, not
        # by a prefix, and it SHADOWS the shipped map of the same village for
        # everyone. A crashed upload test would leave the suite's own copy in
        # front of the one in the bundle, for every run after.
        try:
            gone = conn.execute(
                "DELETE FROM village_maps WHERE uploaded_by = %s RETURNING key",
                (UID,)).fetchall()
            minted += len(gone)
        except psycopg.errors.UndefinedTable:
            pass

        if not ids and not minted:
            print(f"no e2e residue for {UID}")
            return

        for table, key in ids and CHILDREN or ():
            try:
                conn.execute(
                    f"DELETE FROM {table} WHERE {key} = ANY(%s) AND owner_user_id = %s",
                    (ids, UID))
            except psycopg.errors.UndefinedTable:
                pass          # optional table in this schema
            except psycopg.errors.UndefinedColumn:
                pass          # this table names its record differently

        pbs = []
        if ids:
            pbs = [r[0] for r in conn.execute(
                "SELECT DISTINCT passbook_id FROM parcels WHERE id = ANY(%s)", (ids,)).fetchall()]
            conn.execute("DELETE FROM parcels WHERE id = ANY(%s)", (ids,))
            conn.execute("DELETE FROM properties WHERE id = ANY(%s)", (ids,))
            # A passbook made for one filed parcel has nothing left to hold.
            for pb in [p for p in pbs if p]:
                left = conn.execute(
                    "SELECT count(*) FROM parcels WHERE passbook_id = %s", (pb,)).fetchone()[0]
                if not left:
                    conn.execute(
                        "DELETE FROM passbooks WHERE id = %s AND owner_user_id = %s", (pb, UID))

        # The sweep above can only reach a passbook through a parcel it is
        # deleting in THIS run, so a passbook whose parcels went in an earlier
        # one is never collected — and an empty passbook is not inert. A parcel
        # filed with a khata and village that match an existing passbook REUSES
        # it (web360.py saveRecord) and takes that passbook's owner name, so one
        # stray empty row silently blanks the owner on every parcel a later run
        # files under the same khata. That is a whole afternoon spent looking at
        # the card, which is the same shape of bug as the stray `rec-` ids: one
        # unreachable row, a suite that fails somewhere else entirely.
        orphans = conn.execute(
            "DELETE FROM passbooks pb WHERE pb.owner_user_id = %s"
            " AND NOT EXISTS (SELECT 1 FROM parcels p WHERE p.passbook_id = pb.id)"
            " AND pb.pattadar_no LIKE %s", (UID, "777%")).rowcount

        print(f"purged e2e residue for {UID}: {len(ids)} records, "
              f"{minted} app-minted rows, {orphans} orphaned passbooks")


if __name__ == "__main__":
    main()
