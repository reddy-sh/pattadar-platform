"""The property master record (docs/specs/2026-10-11-property-overview.md),
against real PostgreSQL in a throwaway schema (see test_save_record_deed).

Precedence, conflicts and "Use this / Keep mine", no-blank, source trust
(public record ref, the caller's own reading), validation at the boundary,
the deed filing path, and the Overview read.
"""
import asyncio
import json

import pytest

from src import record_master as rm, web360 as w
from tests.test_save_record_deed import ME, OTHER, _corpus, _deed, _rows, _save, database

JOBS = [
    "CREATE TABLE document_read_jobs (id TEXT PRIMARY KEY, owner_user_id TEXT, operation TEXT,"
    " state TEXT, result JSONB DEFAULT '{}')",
    "ALTER TABLE documents ADD COLUMN registered_on TEXT DEFAULT '', ADD COLUMN office TEXT DEFAULT '',"
    " ADD COLUMN buyer TEXT DEFAULT '', ADD COLUMN seller TEXT DEFAULT '',"
    " ADD COLUMN consideration DOUBLE PRECISION DEFAULT 0, ADD COLUMN doc_no TEXT DEFAULT ''",
    "CREATE TABLE share_links (id TEXT PRIMARY KEY, owner_user_id TEXT, document_id TEXT)",
]

DEED_READING = {"fields": {
    "doc_type": "Sale Deed", "document_no": "1576", "reg_year": "1989", "sro": "Podili",
    "registration_date": "1989-12-16", "execution_date": "1989-12-14",
    "consideration": 56700, "stamp_duty": 4000, "village": "Katraguntla",
    "mandal": "Podili", "district": "Prakasam", "survey_no": "70/3", "extent": "13.05 acres",
    "classification": "agricultural", "boundaries": {"north": "Sy 69", "south": "", "east": "Road",
                                                    "west": ""},
    "parties": [
        {"role": "seller", "name": "Gayam Subba Reddy", "parentage": "S/o Venkata Reddy",
         "aadhaar": "123412341234", "pan": "ABCDE1234F"},
        {"role": "buyer", "name": "Telukutla Saraswati", "parentage": "W/o T. Reddy",
         "share": "1/2"},
        {"role": "buyer", "name": "A GPA Holder", "is_gpa": True}],
    "prior_document_details": {"number": "10024/1981", "registration_date": "1981-03-02",
                               "office": "Podili", "original_seller": "Old Seller",
                               "original_buyer": "Gayam Subba Reddy"},
    "field_confidence": {"consideration": "check", "survey_no": "unsure"},
}}


def _pr(**over):
    """A watched-free public-record save, as the assistant card sends it."""
    base = dict(kind="parcel", title="Sy 70/3 · Katraguntla", classification="agri",
                village="KATRAGUNTA", survey_no="70/3", extent=13.05, extent_unit="ac",
                doc_no="1576/1989", sro="PODILI", reg_date="1989-12-16", exec_date="1989-12-14",
                acquisition_mode="sale", govt_value=56700.0, market_value=None,
                purchase_price=None, owner_name=None, district=None, mandal=None,
                boundary_north=None, boundary_south=None, boundary_east=None,
                boundary_west=None, seller_name="GAYAM SUBBAREDDY",
                buyer_name="TELUKUTLA SARASWATI",
                source_ref="pr:AP080813198900001576:3")
    base.update(over)
    return _deed(**base)


PR_REF = "pr:AP080813198900001576:3"
#: The corpus row _pr() names: what the public record itself says.
PR_ROW = dict(doc_no="1576", year=1989, sro_name="PODILI", village="KATRAGUNTA",
              survey_no="70/3()", plot_no="()", house_no="()", extent_val=13.05,
              extent_unit="acres", land_class="DRY", transaction_type="Sale Deed",
              txn_class="SALE", market_value=56700, reg_date="1989-12-16",
              exec_date="1989-12-14")


async def _setup(pool):
    async with pool.connection() as conn:
        for stmt in JOBS:
            await conn.execute(stmt)
    await _corpus(pool, PR_REF, **PR_ROW)


async def _paper(pool, rid, uid=ME, pid="doc-deed"):
    async with pool.connection() as conn:
        await conn.execute("INSERT INTO documents (id, owner_user_id, name, record_id)"
                           " VALUES (%s,%s,'Sale deed',%s)", (pid, uid, rid))
    return pid


async def _job(pool, jid="job1", uid=ME, op="import-registered-document", state="done",
               result=None):
    async with pool.connection() as conn:
        await conn.execute("INSERT INTO document_read_jobs VALUES (%s,%s,%s,%s,%s)",
                           (jid, uid, op, state, json.dumps(result or DEED_READING)))
    return jid


def _field(o, key):
    return next(f for f in o.fields if f.key == key)


def run(coro):
    asyncio.run(coro)


# ── Pure rules ────────────────────────────────────────────────────────

def test_precedence_owner_first_then_by_field_group():
    ext, village = rm.FIELDS["extent"], rm.FIELDS["village"]
    claims = [{"id": "a", "source": "legacy", "set_at": "3", "value": "1 ac"},
              {"id": "b", "source": "passbook_reading", "set_at": "2", "value": "1 ac"},
              {"id": "c", "source": "deed_reading", "set_at": "1", "value": "1 ac"}]
    assert rm.winner(ext, claims)["id"] == "c", "conveyance: the deed over the 1-B"
    assert rm.winner(village, claims)["id"] == "b", "location: the 1-B over the deed"
    claims.append({"id": "m", "source": "manual", "set_at": "0", "value": "2 ac"})
    assert rm.winner(ext, claims)["id"] == "m", "the owner's entry beats every document"
    two = [{"id": "x", "source": "deed_reading", "set_at": "1", "value": "a"},
           {"id": "y", "source": "deed_reading", "set_at": "2", "value": "b"}]
    assert rm.winner(village, two)["id"] == "y", "same kind: the newer wins"


def test_normalising_and_validation():
    f = rm.FIELDS
    assert rm.same(f["survey_no"], "70-3", "70/3")
    assert rm.same(f["village"], "KATRAGUNTA", " katragunta")
    assert rm.same(f["extent"], "13.05 ac", "63162 sq.yd")       # within 0.5%
    assert not rm.same(f["extent"], "13.05 ac", "12 ac")
    assert rm.same(f["consideration"], "56700", "56700.4")
    assert rm.clean(f["acquisition_mode"], "purchase") == "sale"
    assert rm.clean(f["consideration"], "₹56,700") == "56700"
    assert rm.clean(f["extent"], "2.5", "parcel") == "2.5 ac"
    # Display is owner words: no raw enum, Indian grouping on whole extents.
    assert rm.display(f["classification"], "open_plot") == "Open plot"
    assert rm.display(f["extent"], "63162 sq.yd").startswith("63,162 sq.yd")
    assert rm.display(f["extent"], "200.5 sq.yd").startswith("200.5 sq.yd")
    for key, bad in (("acquisition_mode", "stolen"), ("registered", "maybe"),
                     ("reg_date", "16/12/1989"), ("reg_date", "2999-01-01"),
                     ("reg_date", "1700-01-01"), ("consideration", -1),
                     ("consideration", 2e12), ("village", "x" * 201), ("extent", "lots")):
        with pytest.raises(ValueError):
            rm.clean(f[key], bad)
    with pytest.raises(ValueError):
        rm.clean_parties([{"name": ""}], strict=True)
    with pytest.raises(ValueError):
        rm.clean_parties([{"name": "A", "share_num": 3, "share_den": 2}], strict=True)
    with pytest.raises(ValueError):
        rm.clean_parties([{"name": "A"}] * 21, strict=True)


def test_reading_a_deed_keeps_only_allow_listed_party_fields():
    values, acq, conf, froms, tos, prior = rm.deed_claims(DEED_READING["fields"], "parcel")
    assert acq["doc_no"] == "1576/1989" and acq["acquisition_mode"] == "sale"
    assert (values["survey_no"], values["subdivision"], values["extent"]) == ("70", "3", "13.05 ac")
    assert conf["consideration"] == "medium" and conf["survey_no"] == "low"
    assert conf["doc_no"] == "high"
    assert [p["name"] for p in froms] == ["Gayam Subba Reddy"]
    assert [p["name"] for p in tos] == ["Telukutla Saraswati"], "a GPA holder is not a buyer"
    assert "aadhaar" not in json.dumps(rm.clean_parties(froms, False)).lower()
    assert "ABCDE1234F" not in json.dumps(rm.clean_parties(froms, False))
    assert prior["number"] == "10024/1981"
    assert rm.mode_for_doc_type("Legal Heir Certificate") == "inheritance"
    assert rm.mode_for_txn_class("MORTGAGE") == "" and rm.mode_for_txn_class("gift") == "gift"
    assert rm.extent_of("418.5 sq. yards") == "418.5 sq.yd"
    assert rm.extent_of("1,200 Sq.Ft") == "1200 sq.ft" and rm.extent_of("about 2 acres") == ""


# ── Save paths ────────────────────────────────────────────────────────

def test_public_record_save_fills_the_acquisition_with_its_source():
    async def go():
        async with database() as pool:
            await _setup(pool)
            rid = await _save(ME, _pr())
            o = await w.WebQuery().record_overview(ME, rid)
            a = o.acquisition
            assert (a.mode, a.mode_label, a.registered, a.doc_no) == ("sale", "Sale", "yes", "1576/1989")
            assert (a.reg_date, a.exec_date, a.sro, a.govt_value) == (
                "1989-12-16", "1989-12-14", "PODILI", 56700.0)
            assert [p.name for p in a.from_parties] == ["GAYAM SUBBAREDDY"]
            assert [p.name for p in a.to_parties] == ["TELUKUTLA SARASWATI"]
            assert a.source.source == "public_record" and a.source.label == "Public record"
            assert a.source.source_ref == "pr:AP080813198900001576:3"
            assert _field(o, "village").source.source == "public_record"
            # The kind of land is the deed row's own (its land class), not "you entered".
            assert _field(o, "classification").source.source == "public_record"
            # Not something a public record knows: the owner's.
            assert _field(o, "stake").source.source == "manual"
            # The transfer is the acquiring one, linked on the record.
            row = (await _rows(pool, "SELECT acquired_by_transfer_id, exec_date, guideline_value"
                                     " FROM parcels WHERE id=%s", (rid,)))[0]
            assert row["acquired_by_transfer_id"] == a.transfer_id
            assert (row["exec_date"], row["guideline_value"]) == ("1989-12-14", 56700.0)
            assert not [f.key for f in o.missing if f.key in ("doc_no", "acquisition_mode")]
            assert {f.key for f in o.missing} >= {"khata_no", "lp_no"}
            assert o.summary.owner_count == 1 and o.summary.paper_count == 0
    run(go())


def test_the_overview_runs_the_compliance_check_with_the_areas_policy():
    async def go():
        async with database() as pool:
            await _setup(pool)
            rid = await _save(ME, _pr())
            c = (await w.WebQuery().record_overview(ME, rid)).compliance
            by = {x.key: x for x in c.checks}
            assert c.total == len(c.checks) and c.passed == sum(x.status == "pass" for x in c.checks)
            assert (by["deed"].status, by["deed"].action) == ("warn", "upload")
            assert (by["ec"].status, by["ec"].service_kind) == ("fail", "ec")
            assert not [k for k in by if k.startswith("policy.")], "no published policy, none added"
            async with pool.connection() as conn:
                await w.governance.ensure_baseline(conn)
                await conn.execute(
                    "INSERT INTO documents (id, owner_user_id, name, shelf, record_id)"
                    " VALUES ('ec1', %s, 'EC 2010-2026', 'search', %s),"
                    " ('deed1', %s, 'Sale deed', 'title', %s)", (ME, rid, ME, rid))
                await conn.execute("INSERT INTO documents (id, owner_user_id, name, shelf, record_id)"
                                   " VALUES ('x', %s, 'EC', 'search', %s)", (OTHER, rid))
            c = (await w.WebQuery().record_overview(ME, rid)).compliance
            by = {x.key: x for x in c.checks}
            assert by["deed"].status == "pass"
            assert by["ec"].status == "warn", "an EC on file, its date not recorded"
            assert {"policy.adangal", "policy.fmb", "policy.restrictions"} <= set(by)
    run(go())


def test_a_non_conveyance_public_record_leaves_how_acquired_unset():
    async def go():
        async with database() as pool:
            await _setup(pool)
            rid = await _save(ME, _pr(acquisition_mode=""))
            o = await w.WebQuery().record_overview(ME, rid)
            assert o.acquisition.mode == "" and "acquisition_mode" in {f.key for f in o.missing}
            kind = (await _rows(pool, "SELECT kind FROM record_transfers WHERE record_id=%s",
                                (rid,)))[0]["kind"]
            assert kind == "other"
    run(go())


def test_a_reading_job_must_be_the_callers_and_names_the_source():
    async def go():
        async with database() as pool:
            await _setup(pool)
            pb = {"fields": {"doc_type": "Pattadar Passbook", "pattadar_no": "399"}}
            await _job(pool, "pbjob", uid=OTHER, op="import-passbook", result=pb)
            inp = _deed(kind="parcel", title="Sy 12", survey_no="12", source_ref=None,
                        reading_job_id="pbjob", seller_name=None, buyer_name=None)
            with pytest.raises(ValueError):
                await _save(ME, inp)                       # someone else's reading
            await _job(pool, "mine", op="import-passbook", result=pb)
            rid = await _save(ME, _deed(kind="parcel", title="Sy 12", survey_no="12",
                                        source_ref=None, reading_job_id="mine",
                                        seller_name=None, buyer_name=None, doc_no=None))
            o = await w.WebQuery().record_overview(ME, rid)
            assert _field(o, "village").source.source == "passbook_reading"
            assert _field(o, "village").source.label == "Passbook 399"
            assert _field(o, "sro").source.source == "manual", "a passbook knows no SRO"
    run(go())


def test_owner_edit_wins_and_a_later_deed_is_a_conflict_until_chosen():
    async def go():
        async with database() as pool:
            await _setup(pool)
            rid = await _save(ME, _pr())
            m = w.WebMutation()
            o = await m.set_record_fields(ME, rid, [w.FieldValueInput(key="extent", value="12 ac")])
            assert _field(o, "extent").source.source == "manual"
            await _paper(pool, rid)
            await _job(pool)
            o = await m.file_deed_reading(ME, rid, "doc-deed", "job1")
            ext = _field(o, "extent")
            assert ext.value == "12 ac", "the owner's entry is the record"
            assert [c.display for c in ext.conflicts] == ["13.05 ac = 5.281 ha"]
            assert ext.conflicts[0].source.label == "Deed 1576/1989"
            assert o.conflict_count >= 1
            # "Use this": the deed's value becomes the owner's, and the conflict goes.
            o = await m.choose_field_claim(ME, rid, "extent", ext.conflicts[0].id)
            assert _field(o, "extent").value == "13.05 ac"
            assert _field(o, "extent").conflicts == []
            # The deed outranks the public record on conveyance facts.
            assert _field(o, "doc_no").source.source == "deed_reading"
            assert _field(o, "consideration").source.confidence == "medium"
            a = o.acquisition
            # The deed and the public record name ONE event (1576/1989), and the
            # deed names the one before it: two owner changes, not three.
            assert a.deed_document_id == "doc-deed" and a.chain_length == 2
            assert a.stamp_duty == 4000.0 and a.consideration == 56700.0
            # A later passbook-ranked village loses to nothing and wins location.
            paper = (await _rows(pool, "SELECT doc_no, registered_on, office, buyer, seller,"
                                       " consideration FROM documents WHERE id='doc-deed'"))[0]
            assert paper["doc_no"] == "1576/1989" and paper["seller"] == "Gayam Subba Reddy"
            # Nothing about a party but name/parentage/address reached the chain.
            dump = json.dumps(await _rows(pool, "SELECT * FROM record_transfer_parties"))
            assert "123412341234" not in dump and "ABCDE1234F" not in dump
            # The replaced value is on the trail.
            corr = await w.WebQuery().corrections(ME, rid)
            assert any(c.field == "Extent" for c in corr)
    run(go())


def test_file_deed_reading_refuses_what_is_not_the_callers_or_not_a_deed():
    async def go():
        async with database() as pool:
            await _setup(pool)
            rid = await _save(ME, _pr())
            other = await _save(OTHER, _pr())
            await _paper(pool, rid)
            await _paper(pool, other, uid=OTHER, pid="doc-theirs")
            await _job(pool, "theirs", uid=OTHER)
            await _job(pool, "running", state="running")
            await _job(pool, "aadhaar", result={"fields": {"doc_type": "Aadhaar"}})
            await _job(pool, "ok")
            m = w.WebMutation()
            for rec, paper, job in ((rid, "doc-deed", "theirs"), (rid, "doc-deed", "running"),
                                    (rid, "doc-deed", "aadhaar"), (rid, "doc-theirs", "ok"),
                                    (other, "doc-theirs", "ok")):
                with pytest.raises(ValueError):
                    await m.file_deed_reading(ME, rec, paper, job)
            assert await _rows(pool, "SELECT 1 FROM record_field_claims WHERE source='deed_reading'") == []
    run(go())


def test_no_blank_and_owner_clear():
    async def go():
        async with database() as pool:
            await _setup(pool)
            rid = await _save(ME, _pr())
            async with pool.connection() as conn:
                left = await rm.apply_claims(conn, ME, rid, "parcel", source="deed_reading",
                                             source_ref="d1", label="Deed", values={"sro": ""})
            assert left == []
            o = await w.WebQuery().record_overview(ME, rid)
            assert _field(o, "sro").value == "PODILI", "a source that does not know cannot blank"
            o = await w.WebMutation().set_record_fields(ME, rid, [w.FieldValueInput(key="sro", value="")])
            assert _field(o, "sro").value == "", "the owner can clear what a record said"
    run(go())


def test_set_record_fields_validates_and_is_owner_scoped():
    async def go():
        async with database() as pool:
            await _setup(pool)
            rid = await _save(ME, _pr())
            m = w.WebMutation()
            for fields in ([w.FieldValueInput(key="aadhaar", value="1")],
                           [w.FieldValueInput(key="plot_no", value="7")],      # not on a parcel
                           [w.FieldValueInput(key="reg_date", value="2999-01-01")],
                           [w.FieldValueInput(key="sro", value="a"), w.FieldValueInput(key="sro", value="b")]):
                with pytest.raises(ValueError):
                    await m.set_record_fields(ME, rid, fields)
            with pytest.raises(ValueError):
                await m.set_record_fields(OTHER, rid, [w.FieldValueInput(key="lp_no", value="9")])
            assert await w.WebQuery().record_overview(OTHER, rid) is None
            o = await m.set_record_fields(ME, rid, [w.FieldValueInput(key="lp_no", value="LP 41"),
                                                    w.FieldValueInput(key="khata_no", value="399")])
            assert (_field(o, "lp_no").value, _field(o, "khata_no").value) == ("LP 41", "399")
            assert "lp_no" not in {f.key for f in o.missing}
    run(go())


def test_set_acquisition_records_an_inheritance_as_the_owner_says():
    async def go():
        async with database() as pool:
            await _setup(pool)
            rid = await _save(ME, _deed(source_ref=None, seller_name=None, buyer_name=None,
                                        doc_no=None, sro=None, reg_date=None))
            m = w.WebMutation()
            with pytest.raises(ValueError):
                await m.set_acquisition(ME, rid, w.AcquisitionInput(mode="stolen"))
            o = await m.set_acquisition(ME, rid, w.AcquisitionInput(
                mode="inheritance", proof_no="LHC 12/2015", from_parties=[
                    w.AcquisitionPartyInput(name="T. Venkata Reddy", relationship="father",
                                            role="deceased")]))
            a = o.acquisition
            assert (a.mode_label, a.proof_no, a.source.source) == ("Inheritance", "LHC 12/2015", "manual")
            assert [(p.name, p.relationship, p.role) for p in a.from_parties] == [
                ("T. Venkata Reddy", "father", "deceased")]
            # Saving again edits the same transfer, never a second one.
            o = await m.set_acquisition(ME, rid, w.AcquisitionInput(
                mode="inheritance", proof_no="LHC 12/2015",
                from_parties=[w.AcquisitionPartyInput(name="T. Venkata Reddy")]))
            assert o.acquisition.chain_length == 1
    run(go())


def test_master_ddl_is_idempotent():
    async def go():
        async with database() as pool:
            async with pool.connection() as conn:
                for stmt in rm.DDL + rm.DDL:      # BASE already ran it once
                    await conn.execute(stmt)
    run(go())


def test_backfill_cleans_corpus_placeholders_without_guessing():
    import importlib.util
    from pathlib import Path
    path = Path(__file__).resolve().parents[1] / "scripts" / "backfill_record_master.py"
    spec = importlib.util.spec_from_file_location("backfill_record_master", path)
    bf = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bf)
    row = {"village": "KATRAGUNTA", "survey_no": "70/3()", "plot_no": "()", "house_no": "()",
           "extent_val": 13.05, "extent_unit": "acres", "doc_no": "1576", "year": 1989,
           "txn_class": "SALE", "sro_name": "PODILI", "market_value": 56700,
           "reg_date": "1989-12-16", "exec_date": "1989-12-14"}
    assert bf._title(row) == "Sy 70/3 · Katragunta"
    vals, raw, acq = bf._pr_values(row, "property")
    assert (vals["survey_no"], vals["plot_no"], vals["extent"]) == ("70/3", "", "63162 sq.yd")
    assert (acq["acquisition_mode"], acq["doc_no"], acq["govt_value"]) == ("sale", "1576/1989", 56700.0)
    assert bf._keep(rm.FIELDS["survey_no"], "70/3()", "70/3", raw["survey_no"])
    assert not bf._keep(rm.FIELDS["survey_no"], "71", "70/3", raw["survey_no"]), "a typed value stays"
    assert bf._pr_values({**row, "txn_class": "MORTGAGE"}, "parcel")[2]["acquisition_mode"] == ""


# ── Review fixes (11/10/2026) ─────────────────────────────────────────

def test_a_pr_ref_vouches_only_for_what_the_public_record_says():
    """A3/B5: a ref naming no corpus row vouches for nothing, but its values
    are not the owner's typing either: unsourced, so a real source can still
    win later. The stake the owner picked stays theirs. A real ref labels only
    the values that match its row."""
    async def go():
        async with database() as pool:
            await _setup(pool)
            rid = await _save(ME, _pr(source_ref="pr:NOSUCHDEED00001:1"))
            o = await w.WebQuery().record_overview(ME, rid)
            assert _field(o, "village").source.source == "legacy"
            assert _field(o, "stake").source.source == "manual"
            assert o.acquisition.source.source == "legacy"
            assert not await _rows(pool, "SELECT 1 FROM record_field_claims WHERE record_id=%s"
                                         " AND source='manual' AND field<>'stake'", (rid,))
            t = (await _rows(pool, "SELECT source, verified FROM record_transfers"
                                   " WHERE record_id=%s", (rid,)))[0]
            assert t["source"] == "manual" and t["verified"] is False
            # A later public-record claim outranks the unsourced value.
            async with pool.connection() as conn:
                await rm.apply_claims(conn, ME, rid, "parcel", source="public_record",
                                      source_ref=PR_REF, label="Public record",
                                      values={"village": "KATRAGUNTLA"})
            o = await w.WebQuery().record_overview(ME, rid)
            assert _field(o, "village").value == "KATRAGUNTLA"
            assert _field(o, "village").conflicts == []
            # A real ref, but the card was edited: the edits are the owner's.
            rid = await _save(OTHER, _pr(village="ELSEWHERE", sro="SOMEWHERE"))
            o = await w.WebQuery().record_overview(OTHER, rid)
            assert _field(o, "village").source.source == "manual"
            assert _field(o, "sro").source.source == "manual"
            assert _field(o, "doc_no").source.source == "public_record"
            assert _field(o, "survey_no").source.source == "public_record"
    run(go())


def test_the_cards_default_kind_of_land_is_not_the_owners_entry():
    """A10: a classification the public record does not state is not claimed."""
    async def go():
        async with database() as pool:
            await _setup(pool)
            ref = "pr:AP080813200100000077:1"
            await _corpus(pool, ref, doc_no="77", year=2001, village="NALLAPADU",
                          extent_val=200, extent_unit="sq_yards", txn_class="SALE")
            rid = await _save(ME, _deed(source_ref=ref, classification="open_plot",
                                        doc_no="77/2001", village="NALLAPADU"))
            o = await w.WebQuery().record_overview(ME, rid)
            assert _field(o, "classification").value == "open_plot"
            assert _field(o, "classification").source.source == "legacy"
            assert await _rows(pool, "SELECT 1 FROM record_field_claims WHERE record_id=%s"
                                     " AND field='classification'", (rid,)) == []
    run(go())


def test_a_watched_record_keeps_land_facts_and_no_names():
    """A2: neither a deed reading nor the owner's account puts third parties'
    names on a Watching record."""
    async def go():
        async with database() as pool:
            await _setup(pool)
            rid = await _save(ME, _pr(stake="watch"))
            await _paper(pool, rid)
            await _job(pool)
            m = w.WebMutation()
            o = await m.file_deed_reading(ME, rid, "doc-deed", "job1")
            assert _field(o, "doc_no").source.source == "deed_reading", "land facts are kept"
            o = await m.set_acquisition(ME, rid, w.AcquisitionInput(
                mode="sale", from_parties=[w.AcquisitionPartyInput(name="Some Seller")]))
            assert o.acquisition.from_parties == [] and o.acquisition.to_parties == []
            assert await _rows(pool, "SELECT 1 FROM record_transfer_parties") == []
            assert await _rows(pool, "SELECT 1 FROM record_owners") == []
            paper = (await _rows(pool, "SELECT buyer, seller FROM documents WHERE id='doc-deed'"))[0]
            assert (paper["buyer"], paper["seller"]) == ("", "")
    run(go())


def test_keep_mine_clears_the_conflict():
    """A4: chooseFieldClaim(claimId='keep') keeps the record's value and the
    conflict goes."""
    async def go():
        async with database() as pool:
            await _setup(pool)
            rid = await _save(ME, _pr())
            m = w.WebMutation()
            await m.set_record_fields(ME, rid, [w.FieldValueInput(key="extent", value="12 ac")])
            await _paper(pool, rid)
            await _job(pool)
            o = await m.file_deed_reading(ME, rid, "doc-deed", "job1")
            assert _field(o, "extent").conflicts and o.conflict_count >= 1
            o = await m.choose_field_claim(ME, rid, "extent", "keep")
            assert _field(o, "extent").value == "12 ac"
            assert _field(o, "extent").conflicts == [] and o.conflict_count == 0
            with pytest.raises(ValueError):
                await m.choose_field_claim(ME, rid, "plot_no", "keep")      # not on a parcel
            with pytest.raises(ValueError):
                await m.choose_field_claim(OTHER, rid, "extent", "keep")
    run(go())


def test_the_owners_account_edits_the_acquiring_transfer_in_place():
    """A5, A6, A13: editing a public-record acquisition does not add a second
    transfer; what the input does not state is kept, a 0 clears nothing."""
    async def go():
        async with database() as pool:
            await _setup(pool)
            rid = await _save(ME, _pr())
            m = w.WebMutation()
            before = (await w.WebQuery().record_overview(ME, rid)).acquisition
            async with pool.connection() as conn:
                await conn.execute("UPDATE record_transfer_parties SET address='Podili', is_gpa=false,"
                                   " extent=13.05, extent_unit='ac' WHERE side='to'")
                await conn.execute("UPDATE record_transfers SET note='kept', deed_document_id='doc-x'")
            o = await m.set_acquisition(ME, rid, w.AcquisitionInput(
                mode="sale", consideration=0, govt_value=0, from_parties=[
                    w.AcquisitionPartyInput(name="GAYAM SUBBAREDDY", parentage="S/o Venkata")]))
            a = o.acquisition
            assert (a.transfer_id, a.chain_length) == (before.transfer_id, 1)
            assert a.govt_value == 56700.0 and a.doc_no == "1576/1989", "0 and blank are not stated"
            assert [p.name for p in a.to_parties] == ["TELUKUTLA SARASWATI"]
            assert a.from_parties[0].parentage == "S/o Venkata"
            t = (await _rows(pool, "SELECT * FROM record_transfers WHERE record_id=%s", (rid,)))
            assert len(t) == 1
            assert (t[0]["source"], t[0]["source_ref"], t[0]["note"], t[0]["deed_document_id"]) == (
                "public_records", PR_REF, "kept", "doc-x")
            to = (await _rows(pool, "SELECT * FROM record_transfer_parties WHERE side='to'"))[0]
            assert (to["address"], to["extent"], to["extent_unit"]) == ("Podili", 13.05, "ac")
    run(go())


def test_not_registered_clears_the_document_facts():
    """W8/A13: an unregistered acquisition carries no document number."""
    async def go():
        async with database() as pool:
            await _setup(pool)
            rid = await _save(ME, _deed(source_ref=None, seller_name=None, buyer_name=None))
            o = await w.WebMutation().set_acquisition(ME, rid, w.AcquisitionInput(
                mode="unregistered_sale", registered="no", doc_no="9/2020", sro="X"))
            a = o.acquisition
            assert (a.registered, a.doc_no, a.reg_date, a.sro) == ("no", "", "", "")
            t = (await _rows(pool, "SELECT deed_no, sro, registered_on FROM record_transfers"
                                   " WHERE record_id=%s", (rid,)))
            assert [(x["deed_no"], x["sro"], x["registered_on"]) for x in t] == [("", "", "")]
    run(go())


def test_land_extent_and_floor_area_stay_separate():
    """A7: a deed's yards are the land, its square feet the floor area; neither
    zeroes the other."""
    async def go():
        async with database() as pool:
            await _setup(pool)
            rid = await _save(ME, _deed(source_ref=None, classification="flat", extent=1200.0,
                                        extent_unit="sq.ft", seller_name=None, buyer_name=None))
            row = (await _rows(pool, "SELECT land_area, builtup_area FROM properties"))[0]
            assert (row["land_area"], row["builtup_area"]) == (0.0, 1200.0)
            await _paper(pool, rid)
            yards = json.loads(json.dumps(DEED_READING))
            yards["fields"]["extent"] = "418.5 sq. yards"
            await _job(pool, result=yards)
            await w.WebMutation().file_deed_reading(ME, rid, "doc-deed", "job1")
            row = (await _rows(pool, "SELECT land_area, builtup_area FROM properties"))[0]
            assert (row["land_area"], row["builtup_area"]) == (418.5, 1200.0)
            async with pool.connection() as conn:
                await rm.apply_claims(conn, ME, rid, "property", source="deed_reading",
                                      source_ref="d2", label="Deed", values={"extent": "1300 sq.ft"})
            row = (await _rows(pool, "SELECT land_area, builtup_area FROM properties"))[0]
            assert (row["land_area"], row["builtup_area"]) == (418.5, 1200.0), \
                "the owner's floor area stands; the deed's is a conflict on it"
    run(go())


def test_an_update_is_refused_whole_before_anything_is_written():
    """A8: one bad value refuses the whole edit; nothing is half-applied."""
    async def go():
        async with database() as pool:
            await _setup(pool)
            rid = await _save(ME, _deed(source_ref=None))
            n = len(await _rows(pool, "SELECT 1 FROM audit_events"))
            for bad in (dict(reg_date="2999-01-01"), dict(purchase_price=-5.0),
                        dict(market_value=-1.0), dict(sro="x" * 201)):
                with pytest.raises(ValueError):
                    await _save(ME, w.RecordInput(id=rid, title="Renamed", **bad))
            assert (await _rows(pool, "SELECT label FROM properties"))[0]["label"] == "Plot 12, Katragunta"
            assert len(await _rows(pool, "SELECT 1 FROM audit_events")) == n
    run(go())


def test_a_no_answer_round_trips_without_rewrites():
    """A11: 'no court case' sent again is not a change."""
    async def go():
        async with database() as pool:
            await _setup(pool)
            rid = await _save(ME, _pr())
            m = w.WebMutation()
            for _ in range(3):
                o = await m.set_record_fields(ME, rid, [w.FieldValueInput(key="litigation", value="no")])
            assert _field(o, "litigation").value == ""            # the column's false
            assert await _rows(pool, "SELECT 1 FROM audit_events WHERE action='record.corrected'") == []
            assert len(await _rows(pool, "SELECT 1 FROM record_field_claims WHERE field='litigation'")) <= 1
            o = await m.set_record_fields(ME, rid, [w.FieldValueInput(key="litigation", value="yes")])
            assert _field(o, "litigation").value == "yes"
    run(go())


def test_the_ios_and_expo_editors_are_the_owners_entry():
    """A12: root updateProperty / updatePassbook / updateParcel write columns
    directly; their edit is claimed as the owner's, so a later source cannot
    settle it back."""
    from types import SimpleNamespace
    from src import main

    class _Req:
        def __init__(self, uid):
            self.headers = {"x-user-id": uid}

    async def go():
        async with database() as pool:
            await _setup(pool)
            info = SimpleNamespace(context={"request": _Req(ME)})
            async with pool.connection() as conn:     # what ParcelType reads back
                await conn.execute("ALTER TABLE parcels ADD COLUMN unit TEXT DEFAULT 'ac',"
                                   " ADD COLUMN parent_parcel_id TEXT DEFAULT '',"
                                   " ADD COLUMN source TEXT DEFAULT ''")
            prev, main.pool = main.pool, pool
            try:
                prop = await _save(ME, _deed(source_ref=None))
                await main.Mutation().update_property(info, id=prop, locality="Nallapadu")
                parcel = await _save(ME, _pr())
                pb = (await _rows(pool, "SELECT passbook_id FROM parcels WHERE id=%s",
                                  (parcel,)))[0]["passbook_id"]
                await main.Mutation().update_passbook(info, id=pb, village="Kandukur")
                await main.Mutation().update_parcel(info, id=parcel, sro="Ongole")
            finally:
                main.pool = prev
            async with pool.connection() as conn:
                await rm.apply_claims(conn, ME, prop, "property", source="deed_reading",
                                      source_ref="d1", label="Deed", values={"village": "Elsewhere"})
                await rm.apply_claims(conn, ME, parcel, "parcel", source="deed_reading",
                                      source_ref="d1", label="Deed",
                                      values={"village": "Elsewhere", "sro": "Elsewhere"})
            o = await w.WebQuery().record_overview(ME, prop)
            assert (_field(o, "village").value, _field(o, "village").source.source) == (
                "Nallapadu", "manual")
            o = await w.WebQuery().record_overview(ME, parcel)
            assert _field(o, "village").value == "Kandukur"
            assert _field(o, "sro").value == "Ongole"
    run(go())


def test_backfill_corrects_legacy_modes_and_junk_titles_once():
    """A9, A14: the old column defaults are replaced from the deed row's
    txn_class (or cleared when it moves no title); a junk title is cleaned;
    farmland saved as a plot is counted, not moved; a second run is a no-op."""
    import importlib.util
    from collections import Counter
    from pathlib import Path
    path = Path(__file__).resolve().parents[1] / "scripts" / "backfill_record_master.py"
    spec = importlib.util.spec_from_file_location("backfill_record_master", path)
    bf = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bf)

    async def go():
        async with database() as pool:
            await _setup(pool)
            gift, mort = "pr:GIFTDEED0000001:1", "pr:MORTDEED0000001:1"
            await _corpus(pool, gift, **{**PR_ROW, "doc_no": "88", "txn_class": "GIFT"})
            await _corpus(pool, mort, **{**PR_ROW, "doc_no": "99", "txn_class": "MORTGAGE"})
            async with pool.connection() as conn:
                await conn.execute(   # as the old assistant save left it
                    "INSERT INTO properties (id, owner_user_id, type, label, source_ref)"
                    " VALUES ('p-old', %s, 'open_plot', 'Plot (), KATRAGUNTA', %s)", (ME, gift))
                await conn.execute("INSERT INTO passbooks (id, owner_user_id) VALUES ('pb-m', %s)",
                                   (ME,))
                await conn.execute("INSERT INTO parcels (id, passbook_id, survey_no, source_ref)"
                                   " VALUES ('pa-old', 'pb-m', '70', %s)", (mort,))
            first, second = Counter(), Counter()
            for counts in (first, second):
                async with pool.connection() as conn, conn.transaction():
                    await bf.backfill(conn, counts)
            p = (await _rows(pool, "SELECT label, acquisition_mode FROM properties WHERE id='p-old'"))[0]
            assert (p["label"], p["acquisition_mode"]) == ("Sy 70/3 · Katragunta", "gift")
            assert (await _rows(pool, "SELECT acquisition_source FROM parcels WHERE id='pa-old'")
                    )[0]["acquisition_source"] == ""
            kinds = {r["record_id"]: r["kind"] for r in await _rows(
                pool, "SELECT record_id, kind FROM record_transfers")}
            assert kinds == {"p-old": "gift", "pa-old": "other"}
            assert first["titles_cleaned"] == 1 and first["mode_default_cleared"] == 1
            assert first["reads_as_farmland_saved_as_plot_not_moved"] == 1
            assert second["pr_fields_changed"] == 0 and second["titles_cleaned"] == 0
            assert second["mode_default_cleared"] == 0
    run(go())


# ── Review fixes, round 2 (12/10/2026) ────────────────────────────────

def _load_backfill():
    import importlib.util
    from pathlib import Path
    path = Path(__file__).resolve().parents[1] / "scripts" / "backfill_record_master.py"
    spec = importlib.util.spec_from_file_location("backfill_record_master", path)
    bf = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bf)
    return bf


def _from_reading(**over):
    """A parcel created from deed reading job1, as the W360 add drawer sends it."""
    base = dict(kind="parcel", title="Sy 70/3", survey_no="70/3", village="Katraguntla",
                mandal="Podili", district="Prakasam", extent=13.05, extent_unit="ac",
                classification="agri", doc_no="1576/1989", sro="Podili",
                reg_date="1989-12-16", purchase_price=56700.0, market_value=None,
                boundary_north=None, boundary_south=None, boundary_east=None,
                boundary_west=None, seller_name="Gayam Subba Reddy",
                buyer_name="Telukutla Saraswati", owner_name=None, source_ref=None,
                reading_job_id="job1", origin=None)
    base.update(over)
    return _deed(**base)


def test_a_value_the_owner_corrected_on_a_reading_is_theirs_and_stays():
    """B1: with a readingJobId, only values that match the reading are the
    reading's; a corrected one is the owner's, and filing the paper later
    neither overwrites it nor raises it again as a conflict."""
    async def go():
        async with database() as pool:
            await _setup(pool)
            await _job(pool)
            rid = await _save(ME, _from_reading(mandal="Marripudi", sro="Podili SRO"))
            o = await w.WebQuery().record_overview(ME, rid)
            assert _field(o, "village").source.source == "deed_reading"
            assert _field(o, "doc_no").source.source == "deed_reading"
            assert _field(o, "mandal").source.source == "manual"
            assert _field(o, "sro").source.source == "manual"
            await _paper(pool, rid)
            o = await w.WebMutation().file_deed_reading(ME, rid, "doc-deed", "job1")
            assert (_field(o, "mandal").value, _field(o, "mandal").conflicts) == ("Marripudi", [])
            assert (_field(o, "sro").value, _field(o, "sro").conflicts) == ("Podili SRO", [])
            assert o.conflict_count == 0
            assert _field(o, "village").source.source_ref == "doc-deed"
    run(go())


def test_one_reading_files_one_transfer_bound_to_one_paper():
    """B2, B7: creating from a reading and then filing its paper is ONE event,
    unconfirmed, with the paper attached; the same reading is refused for
    another paper."""
    async def go():
        async with database() as pool:
            await _setup(pool)
            await _job(pool)
            rid = await _save(ME, _from_reading(seller_name="G. Subba Reddy"))
            t = await _rows(pool, "SELECT source_ref, verified FROM record_transfers"
                                  " WHERE record_id=%s", (rid,))
            assert [(x["source_ref"], x["verified"]) for x in t] == [("job1", False)]
            await _paper(pool, rid)
            o = await w.WebMutation().file_deed_reading(ME, rid, "doc-deed", "job1")
            t = await _rows(pool, "SELECT source_ref, deed_document_id, verified FROM"
                                  " record_transfers WHERE record_id=%s ORDER BY sort", (rid,))
            assert [(x["source_ref"], x["deed_document_id"], x["verified"]) for x in t] == [
                ("job1", "doc-deed", False), ("job1:prior", "", False)]
            a = o.acquisition
            assert a.deed_document_id == "doc-deed" and a.chain_length == 2
            assert [p.name for p in a.from_parties] == ["G. Subba Reddy"], \
                "the seller the owner reviewed on the form stays"
            await _paper(pool, rid, pid="doc-other")
            with pytest.raises(ValueError):
                await w.WebMutation().file_deed_reading(ME, rid, "doc-other", "job1")
            other = await _save(ME, _deed(source_ref=None, seller_name=None, buyer_name=None))
            await _paper(pool, other, pid="doc-elsewhere")
            with pytest.raises(ValueError):
                await w.WebMutation().file_deed_reading(ME, other, "doc-elsewhere", "job1")
    run(go())


def test_a_machine_claim_never_splits_a_shared_passbook():
    """B3: a deed's village for one parcel on a shared khata is a conflict for
    the owner, not a split; a blank cell is filled for the khata; only the
    owner's "Use this" splits the passbook off."""
    async def go():
        async with database() as pool:
            await _setup(pool)
            one, two = [await _save(ME, _deed(kind="parcel", title=f"Sy {n}", survey_no=str(n),
                                              khata_no="399", village="Katragunta",
                                              district=None, source_ref=None,
                                              seller_name=None, buyer_name=None,
                                              classification="agri"))
                        for n in (1, 2)]
            pbs = lambda: _rows(pool, "SELECT id, passbook_id FROM parcels ORDER BY survey_no")  # noqa: E731
            shared = {r["passbook_id"] for r in await pbs()}
            assert len(shared) == 1
            async with pool.connection() as conn:
                left = await rm.apply_claims(conn, ME, one, "parcel", source="deed_reading",
                                             source_ref="d1", label="Deed 1/2000",
                                             values={"village": "Elsewhere", "district": "Prakasam"})
            assert left == ["village"]
            assert {r["passbook_id"] for r in await pbs()} == shared, "no split"
            pb = (await _rows(pool, "SELECT village, district FROM passbooks"))[0]
            assert (pb["village"], pb["district"]) == ("Katragunta", "Prakasam")
            o = await w.WebQuery().record_overview(ME, one)
            v = _field(o, "village")
            assert v.value == "Katragunta" and [c.value for c in v.conflicts] == ["Elsewhere"]
            o = await w.WebMutation().choose_field_claim(ME, one, "village", v.conflicts[0].id)
            assert _field(o, "village").value == "Elsewhere"
            assert len({r["passbook_id"] for r in await pbs()}) == 2, "the owner's choice splits"
            o = await w.WebQuery().record_overview(ME, two)
            assert _field(o, "village").value == "Katragunta"
    run(go())


def test_the_public_records_kind_of_land_replaces_the_card_default():
    """B4: the row's land class is the record's kind of land (claimed as the
    public record's), whatever the card defaulted; with none stated and none
    sent, the server's default stays unclaimed."""
    async def go():
        async with database() as pool:
            await _setup(pool)
            dry = "pr:DRYPLOT00000001:1"
            await _corpus(pool, dry, doc_no="5", year=2001, village="NALLAPADU",
                          land_class="DRY", extent_val=1, extent_unit="acres", txn_class="SALE")
            rid = await _save(ME, _deed(source_ref=dry, classification="open_plot",
                                        doc_no="5/2001", village="NALLAPADU"))
            o = await w.WebQuery().record_overview(ME, rid)
            c = _field(o, "classification")
            assert (c.value, c.source.source) == ("agri", "public_record")
            bare = "pr:BAREPLOT0000001:1"
            await _corpus(pool, bare, doc_no="6", year=2001, village="NALLAPADU",
                          extent_val=200, extent_unit="sq_yards", txn_class="SALE")
            rid = await _save(ME, _deed(source_ref=bare, classification=None, doc_no="6/2001",
                                        village="NALLAPADU"))
            o = await w.WebQuery().record_overview(ME, rid)
            c = _field(o, "classification")
            assert (c.value, c.source.source) == ("open_plot", "legacy")
    run(go())


def test_backfill_drops_card_defaults_and_fills_parties_from_people_rows():
    """B4, B6: a manual claim equal to the card default goes and the row's land
    class takes the column; a record saved before transfers carried parties
    gets them from its People rows, not an empty event. Idempotent."""
    from collections import Counter
    bf = _load_backfill()

    async def go():
        async with database() as pool:
            await _setup(pool)
            ref = "pr:OLDPLOT00000001:1"
            await _corpus(pool, ref, **{**PR_ROW, "doc_no": "41"})
            async with pool.connection() as conn:
                await conn.execute(
                    "INSERT INTO properties (id, owner_user_id, type, label, source_ref)"
                    " VALUES ('p-def', %s, 'open_plot', 'Sy 70/3 · Katragunta', %s)", (ME, ref))
                await conn.execute(
                    "INSERT INTO record_field_claims (id, owner_user_id, record_id, field, source,"
                    " label, value, wins, set_at) VALUES ('c1', %s, 'p-def', 'classification',"
                    " 'manual', 'You entered', 'open_plot', true, '2026-10-11T10:00:07.123456')",
                    (ME,))
                for oid, name, cur in (("ro-1", "BUYER ONE", True), ("ro-2", "SELLER TWO", False)):
                    await conn.execute(
                        "INSERT INTO record_owners (id, owner_user_id, record_id, name, is_current,"
                        " sort) VALUES (%s, %s, 'p-def', %s, %s, 1)", (oid, ME, name, cur))
            first, second = Counter(), Counter()
            for counts in (first, second):
                async with pool.connection() as conn, conn.transaction():
                    await bf.backfill(conn, counts)
            assert first["default_classification_claims_dropped"] == 1
            assert first["parties_from_people_rows"] == 1
            o = await w.WebQuery().record_overview(ME, "p-def")
            c = _field(o, "classification")
            assert (c.value, c.source.source) == ("agri", "public_record")
            a = o.acquisition
            assert [p.name for p in a.from_parties] == ["SELLER TWO"]
            assert [p.name for p in a.to_parties] == ["BUYER ONE"]
            assert len(await _rows(pool, "SELECT 1 FROM record_transfers WHERE record_id='p-def'")) == 1
            assert len(await _rows(pool, "SELECT 1 FROM record_owners WHERE record_id='p-def'")) == 2
            assert second["pr_fields_changed"] == 0
    run(go())


def test_set_record_fields_clears_title_values_on_the_record_and_its_transfer():
    """C1: the acquisition drawer's emptied box arrives as '' through
    setRecordFields; the record and its acquiring transfer both clear."""
    async def go():
        async with database() as pool:
            await _setup(pool)
            rid = await _save(ME, _pr())
            o = await w.WebMutation().set_record_fields(ME, rid, [
                w.FieldValueInput(key=k, value="") for k in
                ("doc_no", "reg_date", "exec_date", "sro", "govt_value")])
            a = o.acquisition
            assert (a.doc_no, a.reg_date, a.exec_date, a.sro, a.govt_value) == ("", "", "", "", 0.0)
            t = (await _rows(pool, "SELECT deed_no, registered_on, exec_date, sro, govt_value"
                                   " FROM record_transfers WHERE id=%s", (a.transfer_id,)))[0]
            assert tuple(t.values()) == ("", "", "", "", 0.0)
            assert (await _rows(pool, "SELECT value FROM record_field_claims WHERE record_id=%s"
                                      " AND field='doc_no' AND wins", (rid,)))[0]["value"] == ""
            # Clearing what is already empty is accepted and changes nothing.
            await w.WebMutation().set_record_fields(ME, rid, [
                w.FieldValueInput(key="stamp_duty", value=""),
                w.FieldValueInput(key="consideration", value="")])
    run(go())


def test_wet_dry_takes_the_soil_class_never_a_land_type():
    f = rm.FIELDS["land_class"]
    assert rm.clean(f, "METTA") == "Dry (metta)"
    assert rm.clean(f, "wet land") == "Wet (magani)"
    assert rm.clean(f, "Garden") == "Garden"
    with pytest.raises(ValueError):
        rm.clean(f, "agricultural")


def test_wet_dry_reads_whole_words_and_negations():
    f = rm.FIELDS["land_class"]
    for text in ("unirrigated", "Non-irrigated dry land", "not wet", "rain-fed", "Rainfed metta",
                 "dryland", "irrigated? no, dry"):
        assert rm.clean(f, text) == "Dry (metta)", text
    for text in ("irrigated", "Wetland", "MAGANI", "under irrigation"):
        assert rm.clean(f, text) == "Wet (magani)", text
    assert rm.clean(f, "Orchards") == "Garden"
    for text in ("drainage", "brainwave", "SITE"):
        with pytest.raises(ValueError):
            rm.clean(f, text)


def test_public_record_placeholders_are_no_value():
    row = {**PR_ROW, "boundary_north": "()", "boundary_south": "/", "boundary_east": "-",
           "boundary_west": "Sy 71", "village": " ( ) ", "sro_name": "-"}
    vals, _, acq = rm.pr_values(row, "parcel")
    assert [vals[f"boundary_{s}"] for s in ("north", "south", "east", "west")] == ["", "", "", "Sy 71"]
    assert vals["village"] == "" and acq["sro"] == ""


def test_an_assistant_save_drops_a_land_type_that_is_not_a_soil_class():
    async def go():
        async with database() as pool:
            await _setup(pool)
            rid = await _save(ME, _pr(land_class="AGRICULTURAL"))
            o = await w.WebQuery().record_overview(ME, rid)
            assert not [f for f in o.fields if f.key == "land_class" and f.value]
            # The owner typing it in the drawer is still told why not.
            with pytest.raises(ValueError):
                await w.WebMutation().set_record_fields(
                    ME, rid, [w.FieldValueInput(key="land_class", value="AGRICULTURAL")])
    run(go())


def test_a_deleted_deed_paper_no_longer_passes_the_deed_check():
    async def go():
        async with database() as pool:
            await _setup(pool)
            rid = await _save(ME, _pr())
            pid = await _paper(pool, rid, pid="deed-x")      # filed, but not on the Title shelf
            async with pool.connection() as conn:
                await conn.execute("UPDATE record_transfers SET deed_document_id=%s"
                                   " WHERE record_id=%s", (pid, rid))
            deed = lambda c: {x.key: x for x in c.checks}["deed"]  # noqa: E731
            assert deed((await w.WebQuery().record_overview(ME, rid)).compliance).status == "pass"
            assert await w.WebMutation().delete_paper(ME, pid) is True
            assert deed((await w.WebQuery().record_overview(ME, rid)).compliance).status == "warn"
            assert [r["deed_document_id"] for r in await _rows(
                pool, "SELECT deed_document_id FROM record_transfers WHERE record_id=%s", (rid,))] == [""]
    run(go())
