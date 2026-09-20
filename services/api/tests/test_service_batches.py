"""The missing-paper batch boundary: catalogue coverage and refusal rules."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import web360 as w


def test_every_missing_paper_shelf_has_an_orderable_catalogue_service():
    covered = {shelf for offer in w.SERVICE_CATALOGUE.values()
               for shelf in offer.get("shelves", [])}
    assert {"title", "revenue", "search", "map", "identity"} <= covered


def test_missing_paper_services_can_be_batched_without_hidden_answers():
    suggested = [offer for offer in w.SERVICE_CATALOGUE.values()
                 if offer.get("shelves")]
    assert suggested
    assert all(not field[3] for offer in suggested for field in offer["fields"])


def test_batch_items_keep_catalogue_prices_and_caller_order():
    checked = w._service_batch_items(json.dumps([
        {"kind": "revenue_extract", "params": {}},
        {"kind": "ec", "params": {"purpose": "Loan"}},
    ]))
    assert checked is not None
    assert [item[0] for item in checked] == ["revenue_extract", "ec"]
    assert [item[1]["price"] for item in checked] == [650.0, 1180.0]


def test_batch_items_refuse_ambiguous_or_unpriced_work():
    assert w._service_batch_items("not json") is None
    assert w._service_batch_items("[]") is None
    assert w._service_batch_items(json.dumps([{"kind": "made_up", "params": {}}])) is None
    assert w._service_batch_items(json.dumps([
        {"kind": "ec", "params": {}}, {"kind": "ec", "params": {}},
    ])) is None
    assert w._service_batch_items(json.dumps([
        {"kind": "ec", "params": {"price": 1}},
    ])) is None


def test_batch_items_enforce_required_catalogue_questions():
    assert w._service_batch_items(json.dumps([
        {"kind": "title_opinion", "params": {}},
    ])) is None
    assert w._service_batch_items(json.dumps([
        {"kind": "title_opinion", "params": {"years": "30 years"}},
    ])) is not None


def test_batch_reference_is_stable_and_non_sequential():
    assert w._batch_ref("") == ""
    ref = w._batch_ref("sb-0123456789ab")
    assert ref.startswith("BR-") and len(ref) == 7
    assert ref == w._batch_ref("sb-0123456789ab")
    assert ref != w._batch_ref("sb-fedcba987654")


def test_service_kind_names_collapse_legacy_duplicates():
    assert w.canonical_service_kind("opinion") == "title_opinion"
    assert w.canonical_service_kind("title_opinion") == "title_opinion"
    assert w.canonical_service_kind("visit") == "site_visit"
    assert set(w._service_kind_variants("site_visit")) == {"site_visit", "visit"}
