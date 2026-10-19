"""Tap-to-ask follow-ups worked out from record rows, not generated."""
from src.domain.follow_ups import MAX_FOLLOW_UPS, follow_ups
from src.domain.scope_policy import evaluate_scope

ROWS = [
    {"matched_name": "SANKARA REDDY TELUKUTLA", "score": 1.0, "village": "KATRAGUNTA", "survey_no": "120-2", "rid": "A"},
    {"matched_name": "TELUKUTLA SANKARA REDDY", "score": 1.0, "village": None, "survey_no": "197/C", "rid": "B"},
    {"matched_name": "TELUKUTLA RAVI SANKARA REDDY", "score": 0.86, "village": "TRIPURANTHAKAM", "survey_no": "404/1", "rid": "C"},
]


def test_a_party_search_offers_the_exact_report_the_history_and_did_you_mean():
    found = follow_ups("find_properties_by_party", ROWS, {"name": "Sankara Reddy Telukutla"})
    assert [f["label"] for f in found] == [
        "Report on the 2 exact name matches?",
        "Full history of survey 120-2, KATRAGUNTA?",
        "Are you looking for TELUKUTLA RAVI SANKARA REDDY?",
    ]
    assert "Sankara Reddy Telukutla" in found[0]["prompt"]


def test_every_suggested_prompt_passes_the_scope_gate_on_its_own():
    for tool, rows in (("find_properties_by_party", ROWS), ("get_property_history", ROWS), ("resolve_village", [{"village_norm": "KATRAGUNTA"}])):
        for item in follow_ups(tool, rows, {"name": "x"}):
            assert evaluate_scope(item["prompt"]).allowed, item["prompt"]


def test_no_exact_match_means_no_exact_report_offer():
    rows = [dict(row, score=0.7) for row in ROWS]
    labels = [f["label"] for f in follow_ups("find_properties_by_party", rows, {"name": "x"})]
    assert not any("100%" in label for label in labels)
    assert len(labels) <= MAX_FOLLOW_UPS


def test_tools_without_a_useful_next_step_offer_nothing():
    assert follow_ups("get_price_rates", [{"n": 3}], {}) == []
    assert follow_ups("find_properties_by_party", [], {}) == []
