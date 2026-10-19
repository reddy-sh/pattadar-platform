"""Changing a record's kind (D1) and the creating-source trace (D2), Reddy
12/10/2026 — docs/specs/2026-10-11-property-overview.md §7, against real
PostgreSQL in a throwaway schema (see test_save_record_deed).
"""
import json

import pytest

from src import web360 as w
from tests.test_record_master import (DEED_READING, JOBS, ME, OTHER, PR_REF, PR_ROW, _corpus,
                                      _deed, _field, _from_reading, _job, _paper, _pr, _rows,
                                      _save, database, run)

EXTRA = [
    "ALTER TABLE document_read_jobs ADD COLUMN filename TEXT DEFAULT '',"
    " ADD COLUMN content_hash TEXT",
    "CREATE TABLE parcel_owners (id TEXT PRIMARY KEY, parcel_id TEXT NOT NULL,"
    " owner_name TEXT NOT NULL DEFAULT '', acquisition_source TEXT NOT NULL DEFAULT '',"
    " extent REAL NOT NULL DEFAULT 0, mutation_type TEXT NOT NULL DEFAULT 'acquisition',"
    " mutation_date TEXT NOT NULL DEFAULT '', is_current BOOLEAN NOT NULL DEFAULT true,"
    " created_at TEXT NOT NULL DEFAULT '', user_id TEXT NOT NULL DEFAULT '',"   # main.py's
    " group_id TEXT NOT NULL DEFAULT '', share_pct DOUBLE PRECISION NOT NULL DEFAULT 0,"
    " role TEXT NOT NULL DEFAULT 'owner')",
    "CREATE TABLE favourites (id TEXT PRIMARY KEY, owner_user_id TEXT, entity_type TEXT,"
    " entity_id TEXT, created_at TEXT DEFAULT '')",
    "ALTER TABLE registered_documents"   # created by test_save_record_deed's BASE
    " ADD COLUMN passbook_id TEXT NOT NULL DEFAULT '', ADD COLUMN parcel_id TEXT NOT NULL DEFAULT '',"
    " ADD COLUMN property_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE properties ADD COLUMN notes TEXT NOT NULL DEFAULT '',"
    " ADD COLUMN project_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE notes ADD COLUMN entity_type TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE parcel_photos ADD COLUMN is_cover BOOLEAN DEFAULT false",
    "ALTER TABLE property_photos ADD COLUMN is_cover BOOLEAN DEFAULT false",
    # The holding membership with the real constraints: one record per row,
    # each kind's column a foreign key to its own table.
    "DROP TABLE combined_property_members",
    "CREATE TABLE combined_property_members (id TEXT PRIMARY KEY, owner_user_id TEXT,"
    " combined_property_id TEXT, parcel_id TEXT REFERENCES parcels(id) ON DELETE CASCADE,"
    " property_id TEXT REFERENCES properties(id) ON DELETE CASCADE, sort INT DEFAULT 0,"
    " created_at TEXT DEFAULT '', CONSTRAINT one_record CHECK ((parcel_id IS NOT NULL AND"
    " property_id IS NULL) OR (parcel_id IS NULL AND property_id IS NOT NULL)))",
]

#: The Katragunta deed row: farmland in acres, the plot number a "()" placeholder.
FARM_ROW = {**PR_ROW, "survey_no": "70/3", "extent_unit": "acres"}


async def _setup(pool):
    async with pool.connection() as conn:
        for stmt in JOBS + EXTRA:
            await conn.execute(stmt)
    await _corpus(pool, PR_REF, **FARM_ROW)


def _plot(**over):
    """The property the assistant saved from the public record: a 13.05-acre
    holding filed as an open plot in square yards."""
    return _pr(kind="property", title="Sy 70/3 · Katragunta", classification="open_plot",
               extent=63162.0, extent_unit="sq.yd", **over)


async def _exec(pool, query, args=()):
    async with pool.connection() as conn:
        await conn.execute(query, args)


async def _outbox(pool, rid, action):
    rows = await _rows(pool, "SELECT metadata FROM audit_outbox WHERE resource_id=%s"
                             " AND action=%s", (rid, action))
    return [r["metadata"] if isinstance(r["metadata"], dict) else json.loads(r["metadata"])
            for r in rows]


def test_a_farmland_plot_moves_to_the_farmland_register_with_every_child():
    async def go():
        async with database() as pool:
            await _setup(pool)
            rid = await _save(ME, _plot())
            o = await w.WebQuery().record_overview(ME, rid)
            assert o.suggest_kind == "parcel" and "acres" in o.suggest_reason
            # Children keyed by property_id, by kind tag, and by record id.
            await _exec(pool, "INSERT INTO documents (id, owner_user_id, name, property_id)"
                              " VALUES ('d1', %s, 'Sale deed', %s)", (ME, rid))
            await _exec(pool, "INSERT INTO registered_documents (id, owner_user_id, property_id)"
                              " VALUES ('rd1', %s, %s)", (ME, rid))
            await _exec(pool, "INSERT INTO property_photos (id, property_id, owner_user_id,"
                              " media_kind, is_cover) VALUES ('ph1', %s, %s, 'photo', true)",
                        (rid, ME))
            await _exec(pool, "INSERT INTO combined_properties VALUES ('h1', %s, 'Home')", (ME,))
            await _exec(pool, "INSERT INTO combined_property_members (id, owner_user_id,"
                              " combined_property_id, property_id) VALUES ('m1', %s, 'h1', %s)",
                        (ME, rid))
            await _exec(pool, "INSERT INTO favourites VALUES ('f1', %s, 'property', %s)", (ME, rid))
            await _exec(pool, "INSERT INTO notes (id, entity_id, owner_user_id, body, entity_type)"
                              " VALUES ('n1', %s, %s, 'Fence the east side', 'property')", (rid, ME))
            await _exec(pool, "UPDATE properties SET notes='Old note' WHERE id=%s", (rid,))
            owners = len(await _rows(pool, "SELECT 1 FROM property_owners WHERE property_id=%s",
                                     (rid,)))
            assert owners >= 1
            m = w.WebMutation()
            with pytest.raises(ValueError):
                await m.convert_record_kind(OTHER, rid, "parcel")      # not theirs
            o = await m.convert_record_kind(ME, rid, "parcel")

            assert await _rows(pool, "SELECT 1 FROM properties WHERE id=%s", (rid,)) == []
            p = (await _rows(pool, "SELECT * FROM parcels WHERE id=%s", (rid,)))[0]
            assert round(p["extent"], 4) == 13.05 and p["classification"] == "agri"
            assert p["source_ref"] == PR_REF and p["reg_doc_no"] == "1576/1989", "deed facts copy"
            pb = (await _rows(pool, "SELECT * FROM passbooks WHERE id=%s", (p["passbook_id"],)))[0]
            assert (pb["owner_user_id"], pb["village"], pb["pattadar_no"]) == (ME, "KATRAGUNTA", "")
            async with pool.connection() as conn:
                assert await w._record_kind(conn, ME, rid) == "parcel"
            d = (await _rows(pool, "SELECT parcel_id, property_id FROM documents WHERE id='d1'"))[0]
            assert (d["parcel_id"], d["property_id"]) == (rid, "")
            rd = (await _rows(pool, "SELECT parcel_id, property_id, passbook_id FROM"
                                    " registered_documents WHERE id='rd1'"))[0]
            assert (rd["parcel_id"], rd["property_id"], rd["passbook_id"]) == (rid, "", pb["id"])
            assert await _rows(pool, "SELECT 1 FROM property_photos") == []
            ph = (await _rows(pool, "SELECT * FROM parcel_photos WHERE id='ph1'"))[0]
            assert (ph["parcel_id"], ph["is_cover"]) == (rid, True), "same photo id, still the cover"
            assert await _rows(pool, "SELECT 1 FROM property_owners") == []
            assert len(await _rows(pool, "SELECT 1 FROM parcel_owners WHERE parcel_id=%s",
                                   (rid,))) == owners
            mem = (await _rows(pool, "SELECT parcel_id, property_id FROM"
                                     " combined_property_members WHERE id='m1'"))[0]
            assert (mem["parcel_id"], mem["property_id"]) == (rid, None), "FK and CHECK hold"
            assert (await _rows(pool, "SELECT entity_type FROM favourites"))[0]["entity_type"] == "parcel"
            notes = await _rows(pool, "SELECT entity_type, body FROM notes WHERE entity_id=%s"
                                      " ORDER BY body", (rid,))
            assert [(n["entity_type"], n["body"]) for n in notes] == [
                ("parcel", "Fence the east side"), ("parcel", "Old note")]
            # The chain and claims, keyed by the unchanged id, stay.
            assert await _rows(pool, "SELECT 1 FROM record_transfers WHERE record_id=%s", (rid,))

            # The owner's decision wins; the earlier sources stay as history.
            assert _field(o, "extent").display.startswith("13.05 ac")
            assert _field(o, "classification").source.source == "manual"
            assert _field(o, "extent").source.source == "manual"
            assert not _field(o, "extent").conflicts and not _field(o, "classification").conflicts
            history = await _rows(pool, "SELECT source, value FROM record_field_claims"
                                        " WHERE record_id=%s AND field='extent'", (rid,))
            assert ("public_record", "63162 sq.yd") in {(c["source"], c["value"]) for c in history}
            assert o.suggest_kind == "" and o.acquisition.doc_no == "1576/1989"

            meta = await _outbox(pool, rid, "record.kind_changed")
            assert meta and meta[0]["from_kind"] == "property" and meta[0]["to_kind"] == "parcel"
            assert (meta[0]["from_extent"], meta[0]["to_extent"]) == ("63162 sq.yd", "13.05 ac")
            line = await _rows(pool, "SELECT details FROM audit_events"
                                     " WHERE action='record.kind_changed' AND target=%s", (rid,))
            assert "13.05 ac" in line[0]["details"]

            with pytest.raises(ValueError, match="already"):
                await m.convert_record_kind(ME, rid, "parcel")
            with pytest.raises(ValueError, match="not supported"):
                await m.convert_record_kind(ME, rid, "property")
    run(go())


def test_what_cannot_be_farmland_is_refused_and_a_khata_is_reused():
    async def go():
        async with database() as pool:
            await _setup(pool)
            m = w.WebMutation()
            flat = await _save(ME, _deed(source_ref=None, classification="flat", extent=1200.0,
                                         extent_unit="sq.ft", seller_name=None, buyer_name=None))
            o = await w.WebQuery().record_overview(ME, flat)
            assert o.suggest_kind == ""
            with pytest.raises(ValueError, match="building"):
                await m.convert_record_kind(ME, flat, "parcel")
            house = await _save(ME, _deed(source_ref=None, door_no="10-104", seller_name=None,
                                          buyer_name=None))
            with pytest.raises(ValueError, match="door number"):
                await m.convert_record_kind(ME, house, "parcel")
            assert await _rows(pool, "SELECT 1 FROM properties WHERE id=%s", (house,)), \
                "a refusal moves nothing"
            # A plot with a khata the owner already holds in that village joins it.
            await _exec(pool, "INSERT INTO passbooks (id, owner_user_id, pattadar_no, village)"
                              " VALUES ('pb-399', %s, '399', 'katragunta')", (ME,))
            plot = await _save(ME, _deed(source_ref=None, khata_no="399", village="Katragunta",
                                         seller_name=None, buyer_name=None))
            await m.convert_record_kind(ME, plot, "parcel")
            p = (await _rows(pool, "SELECT passbook_id, extent FROM parcels WHERE id=%s", (plot,)))[0]
            assert p["passbook_id"] == "pb-399" and round(p["extent"], 4) == round(200 / 4840, 4)
            other = await _save(ME, _deed(source_ref=None, seller_name=None, buyer_name=None))
            with pytest.raises(ValueError, match="not one of yours"):
                await m.convert_record_kind(ME, other, "parcel", passbook_id="pb-nope")
            with pytest.raises(ValueError):
                await m.convert_record_kind(ME, other, "parcel", classification="Robert'); DROP")
    run(go())


# ── D2: every create path keeps a durable trace of its source ─────────

async def _history(rid):
    return {e.action: e for e in await w.WebQuery().record_history(ME, rid)}


def test_each_create_path_traces_its_source_on_the_trail():
    async def go():
        async with database() as pool:
            await _setup(pool)
            # Assistant public-record save.
            rid = await _save(ME, _pr())
            meta = (await _outbox(pool, rid, "create_parcel"))[0]
            assert (meta["source_kind"], meta["rid"], meta["s_no"]) == (
                "public_record", "AP080813198900001576", "3")
            assert (await _history(rid))["create_parcel"].source == (
                "Created from public record · RID AP080813198900001576 · schedule 3")

            # Deed-reading add: the file's name and the job's content hash.
            await _job(pool)
            await _exec(pool, "UPDATE document_read_jobs SET filename='katragunta-1989.pdf',"
                              " content_hash='sha256:abc' WHERE id='job1'")
            rid = await _save(ME, _from_reading())
            meta = (await _outbox(pool, rid, "create_parcel"))[0]
            assert meta == {**meta, "source_kind": "deed_reading", "reading_job_id": "job1",
                            "file_name": "katragunta-1989.pdf", "content_hash": "sha256:abc"}
            assert (await _history(rid))["create_parcel"].source == "Created from katragunta-1989.pdf"
            # Upload the deed: fileDeedReading binds the reading to the paper, once.
            await _paper(pool, rid)
            await w.WebMutation().file_deed_reading(ME, rid, "doc-deed", "job1")
            await w.WebMutation().file_deed_reading(ME, rid, "doc-deed", "job1")
            bound = await _outbox(pool, rid, "record.source_bound")
            assert len(bound) == 1 and bound[0]["document_id"] == "doc-deed"
            assert bound[0]["reading_job_id"] == "job1" and bound[0]["content_hash"] == "sha256:abc"
            assert (await _history(rid))["record.source_bound"].source == (
                "Deed Sale deed filed as the title deed")

            # Passbook batch: one saveRecord per row with the passbook's job.
            await _job(pool, "pbjob", op="import-passbook",
                       result={"fields": {"doc_type": "Pattadar Passbook", "pattadar_no": "399"}})
            await _exec(pool, "UPDATE document_read_jobs SET filename='1b.jpg' WHERE id='pbjob'")
            rid = await _save(ME, _deed(kind="parcel", title="Sy 12", survey_no="12",
                                        source_ref=None, reading_job_id="pbjob",
                                        seller_name=None, buyer_name=None, doc_no=None))
            meta = (await _outbox(pool, rid, "create_parcel"))[0]
            assert (meta["source_kind"], meta["file_name"]) == ("passbook_reading", "1b.jpg")
            assert "content_hash" not in meta, "no hash, no key"

            # Manual: the kind only, and no trace line.
            rid = await _save(ME, _deed(source_ref=None, seller_name=None, buyer_name=None))
            assert (await _outbox(pool, rid, "create_property"))[0]["source_kind"] == "manual"
            assert (await _history(rid))["create_property"].source == ""
    run(go())


def test_the_trace_carries_no_reading_contents():
    async def go():
        async with database() as pool:
            await _setup(pool)
            await _job(pool, result=DEED_READING)
            rid = await _save(ME, _from_reading())
            meta = (await _outbox(pool, rid, "create_parcel"))[0]
            text = json.dumps(meta)
            for secret in ("123412341234", "ABCDE1234F", "Gayam", "Saraswati"):
                assert secret not in text
    run(go())


def test_the_local_script_lists_flagged_and_converts_only_with_apply(monkeypatch, capsys):
    import importlib.util
    import os
    from pathlib import Path
    spec = importlib.util.spec_from_file_location(
        "convert_record_kind", Path(__file__).resolve().parents[1] / "scripts" / "convert_record_kind.py")
    cr = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cr)

    async def go():
        async with database() as pool:
            await _setup(pool)
            rid = await _save(ME, _plot())
            plain = await _save(ME, _deed(source_ref=None, seller_name=None, buyer_name=None))
            schema = (await _rows(pool, "SELECT current_schema() AS s"))[0]["s"]
            dsn = os.getenv("TEST_PG_DSN", "host=localhost port=5432 dbname=postgres user=rhub"
                            " password=rhub-dev-pwd")
            monkeypatch.setenv("API_DSN", f"{dsn} options='-csearch_path={schema}'")
            monkeypatch.delenv("APP_ENV", raising=False)
            args = lambda *a: cr.main.__globals__["argparse"].Namespace(  # noqa: E731
                environment="local", ids=[x for x in a if not x.startswith("--")],
                flagged="--flagged" in a, dry_run=False, apply="--apply" in a,
                approval_ref="chat-12-10" if "--ref" in a else None)
            assert await cr.run(args("--flagged")) == 0
            out = capsys.readouterr().out
            assert rid in out and plain not in out
            with pytest.raises(cr.Refused):
                await cr.run(args(rid, "--apply"))               # no approval ref
            assert await cr.run(args(rid)) == 0                   # dry run
            assert "converted=1" in capsys.readouterr().out
            assert await _rows(pool, "SELECT 1 FROM properties WHERE id=%s", (rid,)), "rolled back"
            with pytest.raises(cr.Refused):
                await cr.run(args("nope"))
            flat = await _save(ME, _deed(source_ref=None, classification="flat", extent=900.0,
                                         extent_unit="sq.ft", seller_name=None, buyer_name=None))
            with pytest.raises(ValueError, match="building"):
                await cr.run(args(rid, flat, "--apply", "--ref"))
            assert await _rows(pool, "SELECT 1 FROM properties WHERE id=%s", (rid,)), \
                "one refusal rolls back every id"
            assert await cr.run(args(rid, "--apply", "--ref")) == 0
            assert await _rows(pool, "SELECT 1 FROM parcels WHERE id=%s", (rid,))
    run(go())


# ── Review fixes (12/10/2026): units, precision, races, values, owners ──

async def _ios(pool, rid, unit, area, **cols):
    """A property as iOS's createProperty writes it: land_area in the unit the
    owner picked, the unit's label in land_unit."""
    cols = {"id": rid, "owner_user_id": ME, "type": "open_plot", "label": f"Plot {rid}",
            "locality": "Katragunta", "land_area": area, "land_unit": unit, **cols}
    await _exec(pool, f"INSERT INTO properties ({', '.join(cols)}) VALUES"
                      f" ({', '.join(['%s'] * len(cols))})", tuple(cols.values()))
    return rid


async def _extent(pool, rid):
    return (await _rows(pool, "SELECT extent FROM parcels WHERE id=%s", (rid,)))[0]["extent"]


def test_the_extent_converts_from_the_unit_the_property_is_in():
    cases = [("Acres", 2.5, 2.5), ("Guntas", 40, 1), ("Sq. feet", 43560, 1), ("Cents", 50, 0.5),
             ("Sq. yards", 4840, 1), ("Sq.yd", 4840, 1), ("", 4840, 1),
             ("Sq. metres", 4046.8564224, 1), ("Hectares", 1, 2.4710538), ("Ankanam", 605, 1)]

    async def go():
        async with database() as pool:
            await _setup(pool)
            m = w.WebMutation()
            for i, (unit, area, acres) in enumerate(cases):
                rid = await _ios(pool, f"u{i}", unit, area)
                await m.convert_record_kind(ME, rid, "parcel")
                assert abs(await _extent(pool, rid) - acres) < 1e-6, unit
            meta = (await _outbox(pool, "u1", "record.kind_changed"))[0]
            assert (meta["from_extent"], meta["to_extent"]) == ("40 guntas", "1 ac")
            # A unit this cannot read is refused, and nothing moves.
            await _ios(pool, "bigha", "Bigha", 3)
            o = await w.WebQuery().record_overview(ME, "bigha")
            assert o.convert_target is None
            with pytest.raises(ValueError, match="cannot be converted to acres"):
                await m.convert_record_kind(ME, "bigha", "parcel")
            assert await _rows(pool, "SELECT 1 FROM properties WHERE id='bigha'")
            assert not await _rows(pool, "SELECT 1 FROM parcels WHERE id='bigha'")
    run(go())


def test_the_parcel_keeps_the_exact_acres_and_the_value():
    async def go():
        async with database() as pool:
            await _setup(pool)
            await _ios(pool, "ft", "Sq. feet", 1000, current_value=2500000.0)
            o = await w.WebQuery().record_overview(ME, "ft")
            t = o.convert_target
            assert (t.reuse, t.from_area, t.from_unit) == (False, 1000, "sq.ft")
            assert t.acres == 1000 / 43560
            o = await w.WebMutation().convert_record_kind(ME, "ft", "parcel")
            assert await _extent(pool, "ft") == 1000 / 43560, "not the 4-place claim text"
            assert _field(o, "extent").value == "0.023 ac", "the claim text rounds; the column does not"
            p = (await _rows(pool, "SELECT market_value FROM parcels WHERE id='ft'"))[0]
            assert p["market_value"] == 2500000.0, "current_value carried"
            meta = (await _outbox(pool, "ft", "record.kind_changed"))[0]
            assert meta["market_value_from"] == "current_value"
            # A market value already set is kept, not overwritten.
            await _ios(pool, "mv", "Acres", 1, market_value=100.0, current_value=900.0)
            await w.WebMutation().convert_record_kind(ME, "mv", "parcel")
            assert (await _rows(pool, "SELECT market_value FROM parcels WHERE id='mv'"))[0][
                "market_value"] == 100.0
    run(go())


def test_co_owner_shares_and_linked_accounts_survive():
    async def go():
        async with database() as pool:
            await _setup(pool)
            await _ios(pool, "co", "Acres", 2)
            for oid, name, uid, gid, share, role, cur in (
                    ("po1", "Ravi", ME, "g1", 60.0, "owner", True),
                    ("po2", "Sita", "u-sita", "g1", 40.0, "co-owner", True),
                    ("po3", "Seller", "", "", 0.0, "seller", False)):
                await _exec(pool, "INSERT INTO property_owners (id, property_id, owner_name, user_id,"
                                  " group_id, share_pct, role, is_current, created_at)"
                                  " VALUES (%s,'co',%s,%s,%s,%s,%s,%s,'2026-01-01')",
                            (oid, name, uid, gid, share, role, cur))
            await w.WebMutation().convert_record_kind(ME, "co", "parcel")
            got = await _rows(pool, "SELECT id, owner_name, user_id, group_id, share_pct, role,"
                                    " is_current, created_at FROM parcel_owners"
                                    " WHERE parcel_id='co' ORDER BY id")
            assert [(r["id"], r["user_id"], r["group_id"], r["share_pct"], r["role"],
                     r["is_current"]) for r in got] == [
                ("po1", ME, "g1", 60.0, "owner", True), ("po2", "u-sita", "g1", 40.0, "co-owner", True),
                ("po3", "", "", 0.0, "seller", False)]
            assert {r["created_at"] for r in got} == {"2026-01-01"}
            assert await _rows(pool, "SELECT 1 FROM property_owners WHERE property_id='co'") == []
    run(go())


def test_a_property_gone_under_the_lock_is_refused_in_words(monkeypatch):
    async def go():
        async with database() as pool:
            await _setup(pool)

            async def says_property(conn, uid, rid):
                return "property"                         # checked, then moved by another tab
            monkeypatch.setattr(w, "_record_kind", says_property)
            async with pool.connection() as conn:
                with pytest.raises(ValueError, match="already changed"):
                    await w._convert_record_kind(conn, ME, "gone", "parcel")
    run(go())


def test_the_operator_script_is_named_on_the_audit_line():
    async def go():
        async with database() as pool:
            await _setup(pool)
            await _ios(pool, "op", "Acres", 1)
            async with pool.connection() as conn:
                async with conn.transaction():
                    await w._convert_record_kind(conn, ME, "op", "parcel",
                                                 operator="operator:convert_record_kind",
                                                 approval_ref="chat-12-10")
            ev = (await _rows(pool, "SELECT actor_principal, actor_kind, affected_owner, metadata"
                                    " FROM audit_outbox WHERE resource_id='op'"
                                    " AND action='record.kind_changed'"))[0]
            meta = ev["metadata"] if isinstance(ev["metadata"], dict) else json.loads(ev["metadata"])
            assert (ev["actor_principal"], ev["actor_kind"], ev["affected_owner"]) == (
                "operator:convert_record_kind", "admin", ME)
            assert (meta["applied_by"], meta["approval_ref"]) == ("operator", "chat-12-10")
            # The claims stay the owner's decision.
            o = await w.WebQuery().record_overview(ME, "op")
            assert _field(o, "classification").source.source == "manual"
            # The words stay on the owner's own trail.
            assert "kind_changed" in {e.action.split(".")[-1]
                                      for e in await w.WebQuery().record_history(ME, "op")}
            # An owner's own conversion names nobody else.
            await _ios(pool, "own", "Acres", 1)
            await w.WebMutation().convert_record_kind(ME, "own", "parcel")
            ev = (await _rows(pool, "SELECT actor_principal, actor_kind, metadata FROM audit_outbox"
                                    " WHERE resource_id='own' AND action='record.kind_changed'"))[0]
            meta = ev["metadata"] if isinstance(ev["metadata"], dict) else json.loads(ev["metadata"])
            assert (ev["actor_principal"], ev["actor_kind"]) == (ME, "owner")
            assert "applied_by" not in meta and "approval_ref" not in meta
    run(go())


def test_an_unresolved_public_record_ref_is_not_vouched_for():
    async def go():
        async with database() as pool:
            await _setup(pool)
            rid = await _save(ME, _pr(source_ref="pr:AP999999999999999999:1"))
            meta = (await _outbox(pool, rid, "create_parcel"))[0]
            assert meta["source_kind"] == "unverified_public_record"
            assert "rid" not in meta and "s_no" not in meta
            assert (await _history(rid))["create_parcel"].source == ""
            # A malformed ref is not passed off as the owner's own entry either.
            rid = await _save(ME, _pr(source_ref="pr:not-a-ref"))
            assert (await _outbox(pool, rid, "create_parcel"))[0]["source_kind"] == \
                "unverified_public_record"
    run(go())


def test_a_reading_names_its_paper_only_once_bound():
    async def go():
        async with database() as pool:
            await _setup(pool)
            await _job(pool)
            rid = await _save(ME, _from_reading())
            o = await w.WebQuery().record_overview(ME, rid)
            src = o.acquisition.source
            assert src.source == "deed_reading"
            assert (src.document_id, src.reading_job_id) == ("", "job1"), "a job id is not a paper"
            await _paper(pool, rid)
            o = await w.WebMutation().file_deed_reading(ME, rid, "doc-deed", "job1")
            src = o.acquisition.source
            assert (src.document_id, src.reading_job_id) == ("doc-deed", "")
    run(go())


def test_root_create_from_a_registered_deed_traces_its_source(monkeypatch):
    import types
    from src import main

    async def go():
        async with database() as pool:
            await _setup(pool)
            for stmt in (
                "ALTER TABLE registered_documents ADD COLUMN extent TEXT DEFAULT '',"
                " ADD COLUMN classification TEXT DEFAULT '', ADD COLUMN plot_no TEXT DEFAULT '',"
                " ADD COLUMN survey_no TEXT DEFAULT '', ADD COLUMN village TEXT DEFAULT '',"
                " ADD COLUMN mandal TEXT DEFAULT '', ADD COLUMN district TEXT DEFAULT '',"
                " ADD COLUMN consideration DOUBLE PRECISION DEFAULT 0,"
                " ADD COLUMN registration_date TEXT DEFAULT ''",
                "ALTER TABLE parcels ADD COLUMN unit TEXT DEFAULT '', ADD COLUMN source TEXT"
                " DEFAULT '', ADD COLUMN parent_parcel_id TEXT DEFAULT ''",
                "ALTER TABLE properties ADD COLUMN purchase_price DOUBLE PRECISION DEFAULT 0",
            ):
                try:
                    await _exec(pool, stmt)
                except Exception:
                    pass                                   # a column BASE already has
            await _exec(pool, "INSERT INTO registered_documents (id, owner_user_id, extent,"
                              " village) VALUES ('rd1', %s, '200 sq.yd', 'Katragunta'),"
                              " ('rd2', %s, '4840 sq.yd', 'Katragunta')", (ME, ME))
            await _exec(pool, "INSERT INTO passbooks (id, owner_user_id) VALUES ('pb1', %s)", (ME,))
            seen = []

            async def log_audit(_conn, actor, action, target, details="", **kw):
                seen.append((action, kw.get("metadata")))
            monkeypatch.setattr(main, "pool", pool)
            monkeypatch.setattr(main, "log_audit", log_audit)
            monkeypatch.setattr(main, "to_type", lambda cls, row: row)
            info = types.SimpleNamespace(context={"request": types.SimpleNamespace(
                headers={"x-user-id": ME})})
            M = main.Mutation()
            await M.create_property_from_document(info, "rd1")
            await M.create_parcel_from_document(info, "rd2", "pb1")
            await M.create_parcel(info, "pb1", "12", "", 1.0, "ac", "agri", "sale",
                                  source="passbook:pb1")
            await M.create_parcel(info, "pb1", "13", "", 1.0, "ac", "agri", "sale",
                                  source="passbook:pb-not-this-one")
            assert seen == [
                ("create_property", {"source_kind": "registered_document", "document_id": "rd1"}),
                ("parcel_from_document", {"source_kind": "registered_document", "document_id": "rd2"}),
                ("create_parcel", {"source_kind": "passbook", "source_ref": "passbook:pb1"}),
                ("create_parcel", {"source_kind": "manual", "origin": "passbook:pb-not-this-one"}),
            ]
    run(go())


def test_the_media_count_is_every_kind_the_media_tab_lists():
    """The Media tab and the Overview's Media cell read media_count: photo,
    video and recording rows, with the gallery's owner filter, so the tab
    agrees with the tally under it. photo_count stays stills only."""
    async def go():
        async with database() as pool:
            await _setup(pool)
            rid = await _save(ME, _plot())
            for pid, owner, kind in [("m1", ME, "photo"), ("m2", ME, "video"),
                                     ("m3", ME, "audio"), ("m4", OTHER, "photo")]:
                await _exec(pool, "INSERT INTO property_photos (id, property_id, owner_user_id,"
                                  " media_kind) VALUES (%s, %s, %s, %s)", (pid, rid, owner, kind))
            d = await w.WebQuery().record(ME, rid)
            assert (d.media_count, d.photo_count) == (3, 2)
            s = (await w.WebQuery().record_overview(ME, rid)).summary
            assert (s.media_count, s.photo_count) == (3, 2)
    run(go())
