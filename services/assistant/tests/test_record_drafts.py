"""Deed row → confirmation-card draft, worked out in code (never by the model)."""
import pytest

from src.domain.record_drafts import (
    MAX_PROPOSAL_ITEMS,
    build_proposal,
    draft_item,
    extent_unit,
    parse_proposal_args,
    record_kind,
)

PLOT = {
    "rid": "AP040413200000006882", "s_no": 1, "doc_no": "6882", "year": 2000,
    "sro_name": "KAKINADA(R.O)", "village": "RAMANAYYAPETA", "survey_no": "41/6",
    "plot_no": "96A", "house_no": "2-199/A", "extent_val": 133.33, "extent_unit": "sq_yards",
    "property_type": "", "land_class": "", "market_value": 46666, "consideration_value": 47000,
    "reg_date": "2000-10-16", "sellers": ["GUNTAMUKKULA SATYA NARAYANA", None, " "],
    "buyers": ["BOBBA USHARANI"], "boundary_north": "30FT  ROAD", "boundary_south": None,
    "boundary_east": " ", "boundary_west": "PLOT 97",
}
FARM = {
    "rid": "AP010108199400001567", "s_no": 1, "doc_no": "1567", "year": 1994,
    "sro_name": "PALAKONDA", "village": "DOLAMADA", "survey_no": "163",
    "extent_val": 1.28, "extent_unit": "acres", "property_type": "DRY", "land_class": "DRY",
    "market_value": 10000, "consideration_value": 10000, "reg_date": "1994-06-27",
    "sellers": ["BOBBADI USHARANI"], "buyers": [],
}


@pytest.mark.parametrize("raw, unit", [
    ("sq_yards", "sq.yd"), ("acres", "ac"), ("sq_feet", "sq.ft"), ("SQ_YARDS", "sq.yd"),
    ("cents", None), ("sq_meters", None), (None, None), ("", None),
])
def test_units_map_onto_the_three_the_record_card_stores(raw, unit):
    assert extent_unit(raw) == unit


def test_a_plot_deed_becomes_a_property_with_every_fact_copied():
    item = draft_item(PLOT, 0)
    assert item["kind"] == "property"
    assert item["title"] == "Plot 96A · Ramanayyapeta"
    assert (item["extent"], item["extent_unit"]) == (133.33, "sq.yd")
    assert item["doc_no"] == "6882/2000" and item["sro"] == "KAKINADA(R.O)"
    assert item["reg_date"] == "2000-10-16"
    assert (item["consideration"], item["govt_value"]) == (47000, 46666)
    assert "market_value" not in item, "the registry's value is not the owner's estimate"
    assert item["boundary_north"] == "30FT ROAD", "whitespace collapsed, text otherwise verbatim"
    assert item["boundary_east"] is None and item["boundary_south"] is None
    assert item["seller_name"] == "GUNTAMUKKULA SATYA NARAYANA", "blank names dropped"
    assert item["buyer_name"] == "BOBBA USHARANI"
    assert item["source_ref"] == "pr:AP040413200000006882:1"
    assert item["mandal"] is None and item["district"] is None, "the corpus has no mandal column"
    assert item["buyer_matches_user"] is None and item["record_id"] is None and item["error"] is None


def test_agricultural_land_with_a_survey_number_becomes_a_parcel():
    item = draft_item(FARM, 3)
    assert item["index"] == 3 and item["kind"] == "parcel"
    assert item["title"] == "Sy 163 · Dolamada"
    assert (item["extent"], item["extent_unit"]) == (1.28, "ac")
    assert item["buyer_name"] is None


def test_kind_rules():
    assert record_kind({**FARM, "survey_no": ""}) == "property", "no survey number, no parcel"
    assert record_kind({**FARM, "land_class": "", "property_type": "WETLAND"}) == "parcel"
    # Blank classes: bare acreage is farmland, a plot measured in acres is not.
    assert record_kind({**FARM, "land_class": "", "property_type": ""}) == "parcel"
    assert record_kind({**FARM, "land_class": "", "property_type": "", "plot_no": "4"}) == "property"
    assert record_kind({**FARM, "land_class": "SITE", "property_type": "OPEN SITE"}) == "property"


def test_an_unmappable_unit_is_never_converted_but_stays_readable():
    item = draft_item({**FARM, "extent_val": 12.5, "extent_unit": "cents"}, 0)
    assert item["extent"] is None and item["extent_unit"] is None
    assert item["title"] == "Sy 163 · Dolamada (12.5 cents)"


def test_odd_money_and_dates_become_null_rather_than_guesses():
    item = draft_item({**PLOT, "consideration_value": "not stated", "market_value": True,
                       "reg_date": "16/10/2000"}, 0)
    assert item["consideration"] is None and item["govt_value"] is None
    assert item["reg_date"] is None
    assert draft_item({**PLOT, "consideration_value": "2,40,000"}, 0)["consideration"] == 240000


def test_a_deed_with_no_place_is_named_by_its_number():
    bare = {"rid": "R1", "s_no": 2, "doc_no": "77", "year": 2011}
    assert draft_item(bare, 0)["title"] == "Deed 77/2011"


def test_the_model_may_name_deeds_but_never_supply_facts():
    refs, stake = parse_proposal_args({"records": [
        {"rid": "AP1", "s_no": 1, "village": "INJECTED", "buyer_name": "MALLORY"},
        {"rid": "AP1", "s_no": 1}, {"rid": "AP2"},
    ], "stake": "watch"})
    assert refs == [("AP1", 1), ("AP2", None)], "only identifiers survive; duplicates collapse"
    assert stake == "watch"


@pytest.mark.parametrize("args", [
    None, {}, {"records": []}, {"records": "AP1"},
    {"records": [{"rid": "AP1"}] * (MAX_PROPOSAL_ITEMS + 1)},
    {"records": [{"rid": "../etc"}]}, {"records": [{"rid": "AP1", "s_no": "x"}]},
    {"records": [{"rid": "AP1", "s_no": True}]},
    {"records": [{"rid": "AP1"}], "stake": "mine"},
])
def test_malformed_proposals_are_refused(args):
    with pytest.raises(ValueError):
        parse_proposal_args(args)


def test_a_proposal_dedupes_caps_and_never_preselects_a_stake_it_was_not_given():
    rows = [{**PLOT, "s_no": i} for i in range(1, 15)] + [{**PLOT, "s_no": 1}]
    proposal = build_proposal(rows, None)
    assert proposal["type"] == "proposal" and proposal["status"] == "draft"
    assert proposal["stake"] is None
    assert len(proposal["items"]) == MAX_PROPOSAL_ITEMS
    assert [item["index"] for item in proposal["items"]] == list(range(MAX_PROPOSAL_ITEMS))
    assert build_proposal([], "owned") is None
    assert build_proposal([PLOT], "owned")["stake"] == "owned"


def test_corpus_placeholders_are_no_value_and_the_deed_says_how_it_was_got():
    """The Katragunta case: plot "()", house "()", flat "/", survey "70/3()"."""
    row = {"rid": "AP080813198900001576", "s_no": 3, "doc_no": "1576", "year": 1989,
           "sro_name": "PODILI", "village": "KATRAGUNTA", "survey_no": "70/3()",
           "plot_no": "()", "house_no": "()", "apartment_name": "/", "extent_val": 13.05,
           "extent_unit": "acres", "property_type": "", "land_class": "",
           "transaction_type": "SALE", "txn_class": "SALE", "market_value": 56700,
           "reg_date": "1989-12-16", "exec_date": "1989-12-14",
           "sellers": ["GAYAM SUBBAREDDY"], "buyers": ["TELUKUTLA SARASWATI"]}
    item = draft_item(row, 0)
    assert item["kind"] == "parcel", "13 acres with no real plot number is farmland"
    assert item["title"] == "Sy 70/3 · Katragunta"
    assert item["survey_no"] == "70/3" and item["plot_no"] is None and item["house_no"] is None
    assert (item["acquisition_mode"], item["txn_class"], item["exec_date"]) == (
        "sale", "SALE", "1989-12-14")
    assert item["govt_value"] == 56700
    mortgage = draft_item({**row, "txn_class": "MORTGAGE", "transaction_type": "MORTGAGE"}, 0)
    assert mortgage["acquisition_mode"] == "", "a mortgage moves no title"
    assert draft_item({**row, "plot_no": "70A", "extent_unit": "sq_yards"}, 0)["title"] == (
        "Plot 70A · Katragunta")
