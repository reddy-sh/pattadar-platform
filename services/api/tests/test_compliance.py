"""The Overview's compliance check (src/compliance.py): each check's pass,
warn/fail and unknown, decided from facts alone. Pure — no database."""
from datetime import date

from src import compliance as c
from src import governance

TODAY = date(2026, 10, 12)
FULL = {
    "survey_no": "70/3", "extent": "2.5 ac", "khata_no": "1234", "passbook_no": "AP99",
    "registered": "yes", "doc_no": "1576/1989", "lp_no": "LP-7",
    "boundary_north": "Sy 69", "boundary_south": "Road", "boundary_east": "Canal",
    "boundary_west": "Sy 71", "ec_date": "2026-03-01", "mutation_status": "Done",
}
ACQ = {"mode": "sale", "deed_document_id": "doc1", "chain_length": 1,
       "from_parties": [{"name": "Gayam Subba Reddy"}], "to_parties": [{"name": "Telukutla Saraswati"}]}
TAX = [{"name": "Land tax receipt", "shelf": "search", "doc_type": "", "date": "05/06/2026"}]
FACTS = {"title_papers": 1, "revenue_papers": 1, "map_papers": 0, "deed_paper": True, "heir_paper": False,
         "ec_paper": True, "tax_papers": TAX, "tax_expense": [], "has_outline": False,
         "passbook_owner": ""}
CLAIMS = {"extent": [{"source": "deed_reading", "value": "2.5 ac"},
                     {"source": "passbook_reading", "value": "2.5 ac"}],
          "litigation": [{"source": "manual", "value": "no"}]}


def run(vals=None, claims=None, acq=ACQ, facts=None, policy=None, kind="parcel"):
    out = c.evaluate(kind, {**FULL, **(vals or {})}, CLAIMS if claims is None else claims, acq,
                     {**FACTS, **(facts or {})}, policy, TODAY)
    return {x["key"]: x for x in out}


def test_everything_on_file_passes():
    checks = run()
    assert {k: x["status"] for k, x in checks.items()} == {k: "pass" for k in checks}
    assert set(checks) == {"deed", "chain", "khata", "mutation", "survey", "extent_match", "lp",
                           "boundaries", "ec", "court", "tax"}


def test_deed():
    assert run(acq=None, vals={"registered": "", "doc_no": ""}, facts={"title_papers": 0})["deed"][
        "status"] == "fail"
    x = run(facts={"title_papers": 0, "deed_paper": False}, acq={**ACQ, "deed_document_id": ""})["deed"]
    assert (x["status"], x["action"]) == ("warn", "upload")
    assert run(vals={"doc_no": ""})["deed"]["field_key"] == "doc_no"
    assert run(vals={"registered": "no"})["deed"]["status"] == "fail"
    assert run(vals={"registered": ""})["deed"]["status"] == "unknown"


def test_a_deleted_or_unlinked_deed_paper_does_not_pass():
    # The transfer still names doc1, but no paper on this property is doc1.
    x = run(facts={"deed_paper": False, "title_papers": 0})["deed"]
    assert (x["status"], x["action"]) == ("warn", "upload")


def test_inheritance_needs_the_heir_paper_itself():
    acq = {**ACQ, "mode": "inheritance", "proof_no": "LHC/12/2020"}
    x = run(acq=acq)["deed"]
    assert (x["status"], x["action"]) == ("warn", "upload") and "LHC/12/2020" in x["detail"]
    assert run(acq=acq, facts={"heir_paper": True})["deed"]["status"] == "pass"


def test_chain():
    assert run(acq={**ACQ, "from_parties": []}, facts={"title_papers": 1})["chain"]["status"] == "fail"
    assert run(acq={**ACQ, "from_parties": [], "chain_length": 3})["chain"]["detail"] == "3 deeds in the chain"


def test_khata():
    assert run(vals={"khata_no": "", "passbook_no": ""}, facts={"revenue_papers": 0})["khata"]["status"] == "fail"
    assert run(vals={"khata_no": "", "passbook_no": ""})["khata"]["status"] == "warn"


def test_mutation_from_text_and_passbook():
    assert run(vals={"mutation_status": "Not applied"})["mutation"]["status"] == "fail"
    assert run(vals={"mutation_status": "Pending at MRO"})["mutation"]["status"] == "warn"
    x = run(vals={"mutation_status": ""}, acq={**ACQ, "to_parties": []})["mutation"]
    assert (x["status"], x["action"]) == ("unknown", "add")
    ok = run(vals={"mutation_status": ""}, facts={"passbook_owner": "Saraswati Telukutla"})["mutation"]
    assert ok["status"] == "pass"
    bad = run(vals={"mutation_status": ""}, facts={"passbook_owner": "Gayam Subba Reddy"})["mutation"]
    assert (bad["status"], bad["action"], bad["service_kind"]) == ("warn", "order", "mutation")
    # One shared word (the surname) is not the same person.
    weak = run(vals={"mutation_status": ""}, facts={"passbook_owner": "Telukutla Ramaiah"})["mutation"]
    assert weak["status"] == "warn" and weak["detail"].startswith("Passbook name differs:")


def test_survey_and_extent():
    x = run(vals={"survey_no": ""})["survey"]
    assert (x["status"], x["field_key"]) == ("fail", "survey_no")


def test_extent_match():
    warn = run(claims={**CLAIMS, "extent": [{"source": "deed_reading", "value": "2.5 ac"},
                                             {"source": "passbook_reading", "value": "2.2 ac"}]})
    assert warn["extent_match"]["status"] == "warn"
    assert run(claims={"litigation": CLAIMS["litigation"]})["extent_match"]["status"] == "unknown"


def test_lp_only_where_resurveyed():
    assert run(vals={"lp_no": ""})["lp"]["status"] == "unknown"
    assert run(vals={"lp_no": "", "old_survey_no": "12"})["lp"]["status"] == "fail"
    assert "lp" not in run(kind="property")


def test_boundaries():
    x = run(vals={"boundary_east": "", "boundary_west": ""})["boundaries"]
    assert (x["status"], x["detail"], x["field_key"]) == ("fail", "East, West not recorded", "boundary_east")
    for blank in ("—", "-", "()", "/", "N/A", "NA", "nil"):
        assert run(vals={"boundary_north": blank})["boundaries"]["status"] == "fail", blank


def test_ec_age():
    old = run(vals={"ec_date": "2025-01-01"})["ec"]
    assert (old["status"], old["service_kind"]) == ("warn", "ec")
    assert run(vals={"ec_date": ""})["ec"]["status"] == "warn"
    assert run(vals={"ec_date": ""}, facts={"ec_paper": False})["ec"]["status"] == "fail"


def test_an_ec_older_than_the_deed_is_a_warn():
    x = run(vals={"ec_date": "2026-03-01"}, acq={**ACQ, "reg_date": "2026-05-10"})["ec"]
    assert (x["status"], x["detail"]) == ("warn", "EC is older than your deed")
    assert run(vals={"ec_date": "2026-06-01"}, acq={**ACQ, "reg_date": "2026-05-10"})["ec"]["status"] == "pass"


def test_court():
    assert run(vals={"litigation": "yes"})["court"]["status"] == "fail"
    assert run(claims={"extent": CLAIMS["extent"]})["court"]["status"] == "unknown"


def test_tax():
    assert run(facts={"tax_papers": []})["tax"]["status"] == "fail"
    assert run(facts={"tax_papers": [], "tax_expense": [""]})["tax"]["status"] == "pass"
    assert run(facts={"tax_papers": [], "tax_expense": ["12/08/2026"]})["tax"]["status"] == "pass"
    old = run(facts={"tax_papers": [], "tax_expense": ["2019-06-01"]})["tax"]
    assert (old["status"], old["detail"]) == ("warn", "Tax receipt from 2019")


def test_placeholders_and_typed_dates_do_not_pass():
    for blank in ("-", "N/A", "()"):
        assert run(vals={"khata_no": blank, "passbook_no": blank})["khata"]["status"] != "pass", blank
        assert run(vals={"survey_no": blank})["survey"]["status"] == "fail", blank
        assert run(vals={"lp_no": blank})["lp"]["status"] == "unknown", blank
    future = run(vals={"ec_date": "2027-01-01"})["ec"]
    assert (future["status"], future["detail"]) == ("warn", "EC date 01/01/2027 is in the future")
    typed = run(vals={"ec_date": "2026-03-01"}, facts={"ec_paper": False})["ec"]
    assert (typed["status"], typed["action"]) == ("warn", "upload")


def test_a_tax_receipt_must_be_a_recent_land_or_property_tax_receipt():
    def tax(*papers):
        x = run(facts={"tax_papers": list(papers)})["tax"]
        return x["status"], x["detail"]
    p = lambda name, **k: {"name": name, "shelf": "", "doc_type": "", "date": "", **k}  # noqa: E731
    assert tax(p("Property tax demand notice")) == ("warn", "Tax paper found, not a receipt")
    assert tax(p("Income tax receipt 2025")) == ("warn", "Tax paper found, not a receipt")
    assert tax(p("Tax notes")) == ("warn", "Tax paper found, not a receipt")
    assert tax(p("Land tax receipt 2009")) == ("warn", "Tax receipt from 2009")
    assert tax(p("Scan", doc_type="tax_receipt", date="10/05/2025")) == ("pass", "Tax receipt in Documents")
    # February 2025 is FY 2024-25, older than this one and the last.
    assert tax(p("Scan", doc_type="tax_receipt", date="10/02/2025")) == ("warn", "Tax receipt from 2025")
    assert tax(p("Scan", doc_type="Tax Receipt", date="2024-02-10"))[0] == "warn"
    assert tax(p("Land tax receipt 2009"), p("Property tax receipt", shelf="search"))[0] == "pass"


def test_policy_adds_what_it_does_not_share():
    ap = governance.record_checklist(governance.BASELINE_DOCUMENT, "parcel", "agri")
    checks = run(policy=ap)
    extra = {k: x for k, x in checks.items() if k.startswith("policy.")}
    # title_chain, ror, ec and tax are the standard set's; adangal, fmb and restrictions are added.
    assert set(extra) == {"policy.adangal", "policy.fmb", "policy.restrictions"}
    assert extra["policy.fmb"]["status"] == "fail"
    # An outline the owner drew is not an FMB; only a filed map passes.
    drawn = run(policy=ap, facts={"has_outline": True})["policy.fmb"]
    assert (drawn["status"], drawn["detail"]) == ("warn", "Outline drawn by you; no FMB on file")
    assert run(policy=ap, facts={"map_papers": 1})["policy.fmb"]["status"] == "pass"
    assert extra["policy.restrictions"]["status"] == "unknown"
    assert len(run(policy=None)) == 11


def test_names_match():
    assert c.names_match("T. Saraswati", "Telukutla Saraswati")
    assert not c.names_match("Ravi", "Telukutla Saraswati")
    assert c.names_match("Saraswati Telukutla", "TELUKUTLA SARASWATI")
    assert c.names_match("Ramaiah", "ramaiah")
    assert not c.names_match("Telukutla", "Telukutla Saraswati"), "a surname alone"
    assert not c.names_match("Telukutla Ramaiah", "Telukutla Saraswati")
    assert not c.names_match("K. Saraswati", "Telukutla Saraswati"), "the initial must fit"
