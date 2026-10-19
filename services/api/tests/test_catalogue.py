"""Service catalogue overrides (spec 2026-10-09 §7): the pure rules, then the
whole path on a real PostgreSQL — save, publish, the owner's offer, the order's
frozen price and revision, switching a service off, archiving, and the
super-admin boundary.

The database is a temporary cluster on its own socket and port (the
test_group_defaults.py pattern), created and destroyed here, so no running
database is touched.
"""
import asyncio
import json
import os
import shutil
import subprocess
import sys
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import catalogue as cat, ticketing as t, web360 as w  # noqa: E402

KNOWN = set(w.SERVICE_CATALOGUE)


# ── Pure ────────────────────────────────────────────────────────────────

def test_validate_keeps_only_known_services_and_editable_fields():
    doc = cat.validate({"schemaVersion": 1, "services": {
        "survey": {"price": 3100, "days": 12, "enabled": True, "label": "  Land   survey "}}}, KNOWN)
    assert doc == {"schemaVersion": 1, "services": {
        "survey": {"price": 3100.0, "days": 12, "enabled": True, "label": "Land survey"}}}
    for bad in (
        {"schemaVersion": 2, "services": {}},
        {"schemaVersion": 1, "services": {"made_up": {"price": 10}}},
        {"schemaVersion": 1, "services": {"ec": {"fields": []}}},
        {"schemaVersion": 1, "services": {"ec": {"price": 0}}},
        {"schemaVersion": 1, "services": {"ec": {"price": True}}},
        {"schemaVersion": 1, "services": {"ec": {"price": 2_000_000}}},
        {"schemaVersion": 1, "services": {"ec": {"days": 1.5}}},
        {"schemaVersion": 1, "services": {"ec": {"enabled": "yes"}}},
        {"schemaVersion": 1, "services": {"ec": {"label": "   "}}},
    ):
        with pytest.raises(ValueError):
            cat.validate(bad, KNOWN)


def test_effective_applies_layers_widest_first_and_names_the_source():
    base = {"ec": {"label": "EC", "price": 1180.0, "days": 10, "group": "Records", "blurb": "b"}}
    out = cat.effective(base, [
        ("IN/*", {"services": {"ec": {"price": 1200.0, "days": 8}}}),
        ("IN/AP", {"services": {"ec": {"price": 1300.0}}}),
    ])
    assert out["ec"]["price"] == 1300.0 and out["ec"]["days"] == 8
    assert out["ec"]["source"] == "IN/AP" and out["ec"]["enabled"] is True
    assert cat.effective(base, [])["ec"]["source"] == ""
    assert cat.revision_tag([{"scope_key": "IN/*", "revision": 3}, {"scope_key": "IN/AP", "revision": 2}]) \
        == "IN/*@3,IN/AP@2"


def test_scope_keys_are_country_or_state():
    assert cat.scope_key("*") == "IN/*" and cat.scope_key("ap") == "IN/AP"
    assert cat.state_code("") == "*" and cat.state_code("t g!") == "TG"


# ── On a real database ──────────────────────────────────────────────────

@pytest.fixture(scope="module")
def isolated_postgres():
    initdb, pg_ctl = shutil.which("initdb"), shutil.which("pg_ctl")
    if not initdb or not pg_ctl or os.geteuid() == 0:
        pytest.skip("Temporary postgres requires initdb/pg_ctl and a non-root user")
    with tempfile.TemporaryDirectory(prefix="pattadar-catalogue-") as directory:
        root = Path(directory)
        data = root / "data"
        subprocess.run([initdb, "-D", str(data), "-A", "trust", "--no-locale", "--encoding=UTF8"],
                       check=True, capture_output=True)
        subprocess.run([pg_ctl, "-D", str(data), "-l", str(root / "postgres.log"), "-o",
                        f"-k {root} -h '' -p 55497", "-w", "start"], check=True, capture_output=True)
        try:
            yield f"host={root} port=55497 dbname=postgres"
        finally:
            subprocess.run([pg_ctl, "-D", str(data), "-m", "immediate", "-w", "stop"],
                           check=True, capture_output=True)


@asynccontextmanager
async def database(dsn):
    import psycopg
    from psycopg import sql
    from psycopg.rows import dict_row
    from psycopg_pool import AsyncConnectionPool
    from test_capabilities_settlement import BASE

    schema = "cat_" + os.urandom(6).hex()
    admin = await psycopg.AsyncConnection.connect(dsn, autocommit=True)
    await admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))

    async def configure(conn):
        await conn.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))

    pool = AsyncConnectionPool(dsn, min_size=1, max_size=4, open=False, configure=configure,
                               kwargs={"autocommit": True, "row_factory": dict_row})
    old_pool, old_uid = w._pool, w._uid_of
    try:
        await pool.open(); await pool.wait()
        w.bind(pool, lambda info: info)
        async with pool.connection() as conn:
            for stmt in BASE:
                await conn.execute(stmt)
            for stmt in w._DDL:
                if any(word in stmt for word in ("share_links", "service_order_intents",
                                                 "service_batches", "record_people",
                                                 "platform_settings")):
                    await conn.execute(stmt)
            for stmt in [*t.DDL, *w.governance.DDL, *cat.DDL]:
                await conn.execute(stmt)
            await conn.execute(
                "INSERT INTO properties (id,owner_user_id,label,boundary,locality,city,district)"
                " VALUES ('record-a','owner-a','Parcel A','','Podili','Podili','Prakasam')")
        yield pool
    finally:
        w.bind(old_pool, old_uid)
        await pool.close()
        await admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
        await admin.close()


def _doc(**services):
    return json.dumps({"schemaVersion": 1, "services": services})


def test_a_published_price_is_offered_charged_and_recorded_then_falls_back(isolated_postgres, monkeypatch):
    monkeypatch.setenv("SUPER_ADMIN_UIDS", "boss")
    q, m = w.WebQuery(), w.WebMutation()

    async def run():
        async with database(isolated_postgres) as pool:
            # Only a super-admin reads or writes the catalogue.
            assert await q.service_catalogue_admin("owner-a", "*") is None
            assert await m.save_service_catalogue("owner-a", "*", _doc(ec={"price": 1500}), "x") is None

            # A save needs a reason and a valid document, and the current revision.
            assert await m.save_service_catalogue("boss", "*", _doc(ec={"price": 1500}), "") is None
            assert await m.save_service_catalogue("boss", "*", _doc(ec={"price": -1}), "r") is None
            draft = await m.save_service_catalogue("boss", "*", _doc(ec={"price": 1500}), "Registrar fee rose")
            assert draft and draft.status == "draft" and draft.revision == 1
            same = await m.save_service_catalogue("boss", "*", _doc(ec={"price": 1500}), "again", 1)
            assert same.id == draft.id
            assert await m.save_service_catalogue("boss", "*", _doc(ec={"price": 1600}), "stale", 0) is None

            # A draft changes nothing an owner sees.
            offered = {o.key: o.price for o in await q.services_offered("owner-a", record_id="record-a")}
            assert offered["ec"] == 1180.0

            published = await m.publish_service_catalogue("boss", draft.id, "Approved")
            assert published.status == "published"
            offered = {o.key: o.price for o in await q.services_offered("owner-a", record_id="record-a")}
            assert offered["ec"] == 1500.0

            # The order is charged what was offered, and says which revision priced it.
            assert await m.order_service("owner-a", ["record-a"], kind="ec") == 1
            async with pool.connection() as conn:
                order = await (await conn.execute(
                    "SELECT quoted, catalogue_revision FROM work_requests WHERE owner_user_id='owner-a'"
                )).fetchone()
            assert order["quoted"] == 1500.0 and order["catalogue_revision"] == "IN/*@1"

            # A state revision over the country one; the admin view reports both layers.
            ap = await m.save_service_catalogue("boss", "AP", _doc(survey={"enabled": False}), "No surveyors yet")
            await m.publish_service_catalogue("boss", ap.id, "")
            view = await q.service_catalogue_admin("boss", "AP")
            survey = next(e for e in view.services if e.key == "survey")
            inherited = next(e for e in view.inherited if e.key == "survey")
            assert survey.enabled is False and survey.source == "IN/AP" and inherited.enabled is True
            assert next(e for e in view.services if e.key == "ec").source == "IN/*"
            assert {s.scope_key for s in view.scopes} == {"IN/*", "IN/AP"}

            # Switched off: not offered, and an order for it is refused outright.
            keys = {o.key for o in await q.services_offered("owner-a", record_id="record-a")}
            assert "survey" not in keys
            assert await m.order_service("owner-a", ["record-a"], kind="survey") == 0
            assert await m.order_service_batch(
                "owner-a", "record-a", json.dumps([{"kind": "survey", "params": {}}])) is None

            # Archiving needs a reason; then the scope falls back to the wider one.
            assert await m.archive_service_catalogue("boss", ap.id, " ") is False
            assert await m.archive_service_catalogue("boss", ap.id, "Surveyors enrolled") is True
            keys = {o.key for o in await q.services_offered("owner-a", record_id="record-a")}
            assert "survey" in keys

            # After an archive, a fresh save is made against the current revision.
            again = await m.save_service_catalogue("boss", "AP", _doc(ec={"days": 5}), "Faster", 0)
            assert again and again.revision == 2

            # The placed order kept its price through every later revision.
            async with pool.connection() as conn:
                order = await (await conn.execute(
                    "SELECT quoted FROM work_requests WHERE owner_user_id='owner-a' AND kind='ec'")).fetchone()
            assert order["quoted"] == 1500.0

            history = await q.service_catalogue_history("boss", "AP")
            assert sorted(e.action for e in history) == ["archive", "create", "publish", "revise"]
            assert await q.service_catalogue_history("owner-a", "AP") == []

    asyncio.run(run())


def test_areas_limit_a_service_to_chosen_states_and_districts():
    doc = cat.validate({"schemaVersion": 1, "services": {"survey": {"areas": {
        "states": ["ap", "TG"], "districts": ["AP/guntur", "ap/Prakasam"]}}}}, KNOWN)
    assert doc["services"]["survey"]["areas"] == {
        "states": ["AP", "TG"], "districts": ["AP/GUNTUR", "AP/PRAKASAM"]}
    with pytest.raises(ValueError):   # a district outside the chosen states
        cat.validate({"schemaVersion": 1, "services": {"ec": {"areas": {
            "states": ["AP"], "districts": ["TG/HYDERABAD"]}}}}, KNOWN)
    with pytest.raises(ValueError):
        cat.validate({"schemaVersion": 1, "services": {"ec": {"areas": {"cities": []}}}}, KNOWN)

    offer = {"enabled": True, "areas": doc["services"]["survey"]["areas"]}
    assert cat.offered_in(offer, "AP", "Guntur") and cat.offered_in(offer, "AP", "prakasam ")
    assert not cat.offered_in(offer, "AP", "Krishna")       # AP is limited to two districts
    assert cat.offered_in(offer, "TG", "Hyderabad")          # TG has no districts listed: all of it
    assert not cat.offered_in(offer, "KA", "Bengaluru")      # not a chosen state
    assert not cat.offered_in(offer, "*")                    # unknown state, limited service
    assert cat.offered_in({"enabled": True}, "*")            # no areas: everywhere
    assert not cat.offered_in({"enabled": False}, "AP")


def test_a_service_limited_to_other_districts_is_hidden_and_refused(isolated_postgres, monkeypatch):
    monkeypatch.setenv("SUPER_ADMIN_UIDS", "boss")
    q, m = w.WebQuery(), w.WebMutation()

    async def run():
        async with database(isolated_postgres):
            # record-a is in Prakasam, Andhra Pradesh.
            only_guntur = await m.save_service_catalogue("boss", "*", _doc(
                survey={"areas": {"states": ["AP"], "districts": ["AP/GUNTUR"]}},
                ec={"areas": {"states": ["AP"], "districts": ["AP/PRAKASAM"]}}), "Pilot districts")
            await m.publish_service_catalogue("boss", only_guntur.id, "")
            keys = {o.key for o in await q.services_offered("owner-a", record_id="record-a")}
            assert "survey" not in keys and "ec" in keys
            assert await m.order_service("owner-a", ["record-a"], kind="survey") == 0
            assert await m.order_service("owner-a", ["record-a"], kind="ec") == 1
            view = await q.service_catalogue_admin("boss", "*")
            survey = next(e for e in view.services if e.key == "survey")
            assert survey.states == ["AP"] and survey.districts == ["AP/GUNTUR"] and survey.enabled

    asyncio.run(run())


def test_every_service_is_offered_in_andhra_pradesh_and_telangana_only_by_default():
    out = cat.effective(w.SERVICE_CATALOGUE, [])
    assert all(o["areas"] == {"states": ["AP", "TS"], "districts": []} for o in out.values())
    ec = out["ec"]
    assert cat.offered_in(ec, "AP") and cat.offered_in(ec, "TS", "Hyderabad")
    assert not cat.offered_in(ec, "KA") and not cat.offered_in(ec, "*")
    assert w._state_code_of({"state": "Telangana"}) == "TS"
    assert w._state_code_of({"state": "Andhra Pradesh"}) == "AP" and w._state_code_of({}) == "AP"
    assert w._state_code_of({"state": "Karnataka"}) == "*"


def test_a_district_price_overrides_its_state_and_versions_can_be_restored(isolated_postgres, monkeypatch):
    monkeypatch.setenv("SUPER_ADMIN_UIDS", "boss")
    q, m = w.WebQuery(), w.WebMutation()
    assert cat.scope_key("AP", "Guntur") == "IN/AP/GUNTUR" and cat.scope_key("*", "Guntur") == "IN/*"
    assert cat.scope_chain("AP", "Prakasam") == ["IN/*", "IN/AP", "IN/AP/PRAKASAM"]

    async def run():
        async with database(isolated_postgres) as pool:
            state = await m.save_service_catalogue("boss", "AP", _doc(ec={"price": 1300}), "AP fee")
            await m.publish_service_catalogue("boss", state.id, "")
            # Cloned for Prakasam (record-a's district): a draft first, then published.
            local = await m.save_service_catalogue("boss", "AP", _doc(ec={"price": 1400}), "Prakasam fee",
                                                   district_code="Prakasam")
            assert local.scope_key == "IN/AP/PRAKASAM" and local.district_code == "PRAKASAM"
            view = await q.service_catalogue_admin("boss", "AP", "Prakasam")
            assert next(e for e in view.inherited if e.key == "ec").price == 1300.0
            assert next(e for e in view.services if e.key == "ec").price == 1400.0
            offered = {o.key: o.price for o in await q.services_offered("owner-a", record_id="record-a")}
            assert offered["ec"] == 1300.0          # still a draft
            await m.publish_service_catalogue("boss", local.id, "Approved")
            offered = {o.key: o.price for o in await q.services_offered("owner-a", record_id="record-a")}
            assert offered["ec"] == 1400.0
            assert await m.order_service("owner-a", ["record-a"], kind="ec") == 1
            async with pool.connection() as conn:
                tag = (await (await conn.execute(
                    "SELECT catalogue_revision FROM work_requests WHERE owner_user_id='owner-a'")).fetchone())
            assert tag["catalogue_revision"] == "IN/AP@1,IN/AP/PRAKASAM@1"

            # Versions: archive, then restore revision 1's document as a new draft.
            assert await m.archive_service_catalogue("boss", local.id, "Too high")
            versions = await q.service_catalogue_revisions("boss", "AP", "Prakasam")
            assert [(v.revision, v.status) for v in versions] == [(1, "archived")]
            restored = await m.save_service_catalogue("boss", "AP", versions[0].document, "Restored revision 1",
                                                      0, "Prakasam")
            assert restored.revision == 2 and restored.status == "draft"
            assert [v.revision for v in await q.service_catalogue_revisions("boss", "AP", "Prakasam")] == [2, 1]
            assert await q.service_catalogue_revisions("owner-a", "AP", "Prakasam") == []

    asyncio.run(run())


# ── The catalogue is the one base: everything else derives from it ──────

def test_every_service_files_its_delivered_paper_on_its_own_shelf():
    for key, offer in w.SERVICE_CATALOGUE.items():
        assert offer["files_to"] in t.SHELVES, key
        assert t.SHELF_FOR_KIND[key] == offer["files_to"], key
    # The six copy services used to fall through to "Not sorted yet".
    assert {k: t.SHELF_FOR_KIND[k] for k in (
        "deed_copy", "revenue_extract", "tax_receipt", "fmb_copy", "approval_copy", "occupancy_copy")} == {
        "deed_copy": "title", "revenue_extract": "revenue", "tax_receipt": "search",
        "fmb_copy": "map", "approval_copy": "identity", "occupancy_copy": "identity"}
    assert t.SHELF_FOR_KIND["opinion"] == "title" and t.SHELF_FOR_KIND["fencing"] == "unsorted"


def test_dispatch_disciplines_come_from_every_catalogue_entry():
    from src import associates as a
    for key, offer in w.SERVICE_CATALOGUE.items():
        assert offer["disciplines"] and set(offer["disciplines"]) <= set(a.DISCIPLINES), key
        assert [d.key for d in a.disciplines_for(key)] == list(offer["disciplines"]), key
        for old in offer["aliases"]:
            assert [d.key for d in a.disciplines_for(old)][:len(offer["disciplines"])] \
                == list(offer["disciplines"]), old
    # Not catalogue services, so still kept beside the disciplines.
    assert [d.key for d in a.disciplines_for("fencing")] == ["contractor", "landscaper", "developer", "labour"]


def test_bore_point_asks_its_form_goes_to_a_hydrogeologist_and_links_its_guides():
    from src import associates as a
    bp = w.SERVICE_CATALOGUE["bore_point"]
    assert [f[0] for f in bp["fields"]] == ["purpose", "nearby", "nearby_depth", "visit_on", "notes"]
    assert [f[0] for f in bp["fields"] if f[3]] == ["purpose"]
    assert bp["group"] == "On the ground" and bp["directions_field"] == "notes"
    assert [d.key for d in a.disciplines_for("bore_point")] == ["hydrogeologist", "surveyor"]
    assert a.label_of("hydrogeologist") == "Hydrogeologist" and w._TICKET_ROLE["bore_point"] == "Hydrogeologist"
    assert {st: [x["slug"] for x in gs] for st, gs in bp["guides"].items()} == {
        "AP": ["groundwater-and-borewells-ap"], "TS": ["groundwater-and-borewells-ts"]}
    # No bore_point.webp is bundled yet: the visual must resolve to one that is.
    assert w._service_visual_for("bore_point", w.governance.BASELINE_DOCUMENT, "IN/AP").asset_key == "survey"


def test_legacy_kinds_resolve_through_the_catalogue_aliases():
    aliases = [old for v in w.SERVICE_CATALOGUE.values() for old in v["aliases"]]
    assert len(aliases) == len(set(aliases)) and not set(aliases) & set(w.SERVICE_CATALOGUE)
    assert cat.ALIASES == {"opinion": "title_opinion", "visit": "site_visit"}
    for old, key in cat.ALIASES.items():
        assert w.canonical_service_kind(old) == key
        assert w._KIND_LABEL[old] == w.SERVICE_CATALOGUE[key]["label"]
        assert w._TICKET_ROLE[old] == w._TICKET_ROLE[key]
    assert set(w.SERVICE_CATALOGUE) <= set(w._TICKET_ROLE)


def test_code_owned_fields_are_complete_and_name_real_things():
    for key, offer in w.SERVICE_CATALOGUE.items():
        assert offer["deliverable"].strip() and len(offer["deliverable"]) <= cat.MAX_DELIVERABLE, key
        names = {f[0] for f in offer["fields"]}
        assert not offer["directions_field"] or offer["directions_field"] in names, key
        assert set(offer["guides"]) <= {"AP", "TS"}, key
        assert all(("slug" in g) != ("topic" in g) for gs in offer["guides"].values() for g in gs), key
        assert offer["synonyms"], key
    assert {k for k, v in w.SERVICE_CATALOGUE.items() if v["featured"]} == {"ec", "survey"}
    assert {k for k, v in w.SERVICE_CATALOGUE.items() if v["per_record"]} == {"survey", "bore_point", "mutation"}


def test_deliverable_is_editable_within_its_bound():
    doc = cat.validate({"schemaVersion": 1, "services": {"ec": {"deliverable": " A  certificate "}}}, KNOWN)
    assert doc["services"]["ec"] == {"deliverable": "A certificate"}
    with pytest.raises(ValueError):
        cat.validate({"schemaVersion": 1, "services": {"ec": {"deliverable": "x" * 161}}}, KNOWN)
    assert cat.effective(w.SERVICE_CATALOGUE, [("IN/*", doc)])["ec"]["deliverable"] == "A certificate"


class _Info:
    def __init__(self, uid):
        class Request:
            headers = {"x-user-id": uid}
        self.context = {"request": Request()}


def test_offers_carry_the_catalogue_fields_and_the_old_mutation_prices_from_it(
        isolated_postgres, monkeypatch):
    from src import main
    monkeypatch.setenv("SUPER_ADMIN_UIDS", "boss")
    q, m = w.WebQuery(), w.WebMutation()

    async def no_audit(*_a, **_k):
        return None

    async def run():
        async with database(isolated_postgres) as pool:
            monkeypatch.setattr(main, "pool", pool)
            monkeypatch.setattr(main, "log_audit", no_audit)
            offers = {o.key: o for o in await q.services_offered("owner-a", record_id="record-a")}
            survey, patta = offers["survey"], offers["patta_copy"]
            assert survey.files_to == "map" and survey.per_record and survey.featured
            assert survey.directions_field == "notes" and survey.deliverable
            assert [(g.state, g.slug, g.own_paper) for g in survey.guides] == [
                ("AP", "fmb-and-village-map", False), ("TS", "tippan-lpm-village-map", False)]
            assert offers["site_visit"].aliases == ["visit"]
            assert offers["mutation"].also_called == "Also called a name transfer"
            assert patta.flat_price_note and "passbook" in patta.synonyms
            assert offers["mutation"].guides[0].topic == "mutation"

            published = await m.save_service_catalogue(
                "boss", "AP", _doc(title_opinion={"price": 5000, "label": "Title check", "days": 10},
                                   ec={"enabled": False}), "AP fees")
            await m.publish_service_catalogue("boss", published.id, "")
            mutation = main.Mutation()

            # A catalogue service (here by its legacy name) ignores the client's
            # title, price and date and takes the catalogue's for that land.
            row = await mutation.add_work_request(
                _Info("owner-a"), kind="opinion", title="Lawyer", entity_type="record",
                entity_id="record-a", cost=1, due_date="01/01/2000")
            assert (row.title, row.cost) == ("Title check", 5000.0)
            assert row.due_date != "01/01/2000"
            async with pool.connection() as conn:
                stored = await (await conn.execute(
                    "SELECT quoted, catalogue_revision, service_key FROM work_requests WHERE id=%s",
                    (row.id,))).fetchone()
            assert stored == {"quoted": 5000.0, "catalogue_revision": "IN/AP@1", "service_key": "title_opinion"}

            # Switched off there: refused, nothing written.
            with pytest.raises(ValueError):
                await mutation.add_work_request(
                    _Info("owner-a"), kind="ec", title="EC", entity_type="record", entity_id="record-a")
            # Without a record it is the iOS tracker ("you find the person"):
            # the owner's own title, cost and date stand, nothing is quoted.
            loose = await mutation.add_work_request(_Info("owner-a"), kind="survey", title="Chain survey",
                                                    cost=6000, due_date="01/12/2026")
            assert (loose.title, loose.cost, loose.due_date) == ("Chain survey", 6000.0, "01/12/2026")
            # A catalogue-priced order keeps its price and date; other fields still move.
            moved = await mutation.update_work_request(_Info("owner-a"), row.id, cost=1.0,
                                                       due_date="01/01/2000", note="call first")
            assert (moved.cost, moved.due_date, moved.note) == (5000.0, row.due_date, "call first")
            assert (await mutation.update_work_request(_Info("owner-a"), loose.id, cost=6500.0)).cost == 6500.0
            # Anything else keeps the old client-described path.
            other = await mutation.add_work_request(_Info("owner-a"), kind="errand", title="fetch papers", cost=300)
            assert (other.title, other.cost) == ("Fetch papers", 300.0)
            async with pool.connection() as conn:
                count = await (await conn.execute(
                    "SELECT count(*) AS n FROM work_requests WHERE owner_user_id='owner-a'")).fetchone()
            assert count["n"] == 3

    asyncio.run(run())



def test_the_e2e_catalogue_snapshot_equals_the_server_catalogue():
    """tests/e2e-app/fixtures/catalogue.json feeds the sealed suite and the
    service-guides guard; any field drifting from the server catalogue makes
    those suites test a catalogue that does not exist."""
    snap = {o["key"]: o for o in json.loads(
        (Path(__file__).resolve().parents[3] / "tests/e2e-app/fixtures/catalogue.json").read_text())["offers"]}
    assert set(snap) == set(w.SERVICE_CATALOGUE)
    pairs = {"label": "label", "price": "price", "group": "group", "blurb": "blurb", "days": "days",
             "shelves": "shelves", "deliverable": "deliverable", "files_to": "filesTo",
             "aliases": "aliases", "per_record": "perRecord", "directions_field": "directionsField",
             "synonyms": "synonyms", "also_called": "alsoCalled", "flat_price_note": "flatPriceNote",
             "featured": "featured"}
    for key, entry in w.SERVICE_CATALOGUE.items():
        for py, js in pairs.items():
            if js in snap[key] or py in entry:
                want = entry.get(py)
                got = snap[key].get(js)
                if isinstance(want, tuple):
                    want = list(want)
                assert got == want or (want is None and got in ("", [], False, None)), (key, js, got, want)
        assert [f["name"] for f in snap[key]["fields"]] == [f[0] for f in entry["fields"]], key


def test_services_for_records_prices_each_property_for_its_own_place(isolated_postgres, monkeypatch):
    monkeypatch.setenv("SUPER_ADMIN_UIDS", "boss")
    q, m = w.WebQuery(), w.WebMutation()

    async def run():
        async with database(isolated_postgres) as pool:
            async with pool.connection() as conn:
                await conn.execute(
                    "INSERT INTO properties (id,owner_user_id,label,boundary,locality,city,district)"
                    " VALUES ('record-g','owner-a','Parcel G','','Tenali','Tenali','Guntur'),"
                    " ('record-x','owner-b','Not mine','','X','X','Krishna')")
            local = await m.save_service_catalogue("boss", "AP", _doc(
                ec={"price": 1400}, survey={"areas": {"states": ["AP"], "districts": ["AP/GUNTUR"]}}),
                "Prakasam fee", district_code="Prakasam")
            await m.publish_service_catalogue("boss", local.id, "")
            got = await q.services_for_records("owner-a", ["record-a", "record-g", "record-x", "record-a"])
            assert [r.record_id for r in got] == ["record-a", "record-g"]   # deduped, not-mine dropped
            a = {o.key: o.price for o in got[0].offers}
            g = {o.key: o.price for o in got[1].offers}
            assert a["ec"] == 1400.0 and g["ec"] == 1180.0                  # Prakasam's own price
            assert "survey" not in a and "survey" in g                       # Guntur only
            assert await q.services_for_records("owner-a", []) == []

    asyncio.run(run())
