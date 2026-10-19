"""Record results the browser renders, so the model never retypes them."""
import json

from src.domain import tool_policy
from src.domain.record_views import MAX_ROWS, record_view

PARTY = "mcp__pattadar_records__find_properties_by_party"


def _party_result(**extra):
    return json.dumps({
        "matches": [{
            "rid": "AP0808", "s_no": 1, "seq": 3, "matched_name": "SANKARA REDDY TELUKUTLA",
            "role": "CL", "side": "claimant", "score": 1.0, "village": "KATRAGUNTA",
            "survey_no": "120-2", "transaction_type": "Sale Deed", "reg_date": "2019-10-10",
            "extent_val": 124.94, "extent_unit": "sq_yards",
        }],
        "total_matches": 87, "complete": True, "note": None, **extra,
    })


def test_a_party_search_becomes_a_labelled_table():
    view = record_view(PARTY, _party_result(), {"name": "Sankara Reddy Telukutla"}, "toolu_1")
    assert view["type"] == "records" and view["kind"] == "table" and view["id"] == "toolu_1"
    assert view["title"] == "Deeds naming “Sankara Reddy Telukutla”"
    keys = [column["key"] for column in view["columns"]]
    assert keys[:4] == ["matched_name", "score", "side", "village"]
    assert "seq" not in keys and "role" not in keys, "internal fields stay out of the table"
    assert view["rows"][0]["extent"] == "124.94 sq_yards", "source units are kept verbatim"
    assert view["total"] == 87


def test_cells_are_plain_values_never_markup_containers():
    hostile = _party_result().replace("KATRAGUNTA", "<img src=x onerror=alert(1)>" + "x" * 400)
    view = record_view(PARTY, hostile, {}, "t")
    cell = view["rows"][0]["village"]
    assert isinstance(cell, str) and len(cell) <= 300
    for row in view["rows"]:
        assert all(value is None or isinstance(value, (str, int, float)) for value in row.values())


def test_rows_are_capped():
    rows = [{"village": "V", "survey_no": str(i)} for i in range(MAX_ROWS + 50)]
    view = record_view("mcp__pattadar_records__get_property_history", json.dumps({"records": rows}))
    assert len(view["rows"]) == MAX_ROWS and view["total"] == MAX_ROWS + 50


def test_errors_ui_tools_and_unknown_tools_produce_no_view():
    assert record_view(PARTY, "Public records are temporarily unavailable.") is None
    assert record_view("mcp__pattadar_ui__navigate_user", json.dumps([{"village": "V"}])) is None
    assert record_view("mcp__pattadar_records__drop_tables", json.dumps([{"village": "V"}])) is None
    assert record_view(PARTY, json.dumps({"matches": []})) is None


def test_a_generated_report_is_handed_over_as_markdown():
    view = record_view("mcp__pattadar_records__generate_report", "# PARTY REPORT\n| a | b |", {"party": "X"})
    assert view["kind"] == "report" and view["markdown"].startswith("# PARTY REPORT")


def test_village_lists_get_one_village_column():
    rows = [{"village_norm": "KATRAGUNTA", "similarity": 0.9, "record_count": 12}]
    view = record_view("mcp__pattadar_records__resolve_village", json.dumps(rows), {"name": "katra"})
    assert [c["label"] for c in view["columns"]] == ["Name match", "Village", "Deeds"]


def test_the_prompt_tells_the_model_not_to_retype_rendered_results():
    assert "Never copy rows, tables, or report text" in tool_policy.STRICT_SYSTEM_SUFFIX


def test_the_model_reads_a_brief_report_and_the_browser_gets_the_full_one():
    from src.public_records.service import PublicRecordsService
    from src.public_records.settings import PublicRecordSettings

    service = PublicRecordsService(PublicRecordSettings())
    full = (
        "# PARTY REPORT\n**Report ID:** `PTR-20261004-182453-51FB17`\n## 1. Summary\n| a | b |\n"
        "## 3. Deed details\n### 1. 2019-10-10\n| Field | Value |\n| Boundaries | N: ROAD |\n"
    )
    brief = service.brief_report(full)
    assert "Boundaries" not in brief and "## 1. Summary" in brief
    assert service.full_report(brief) == full
    assert service.full_report(brief) is None, "handed over once, then forgotten"
    assert service.brief_report("no id here") == "no id here"


def test_a_party_search_carries_headline_figures():
    rows = [
        {"matched_name": "A", "score": 1.0, "side": "claimant", "village": "KATRAGUNTA",
         "reg_date": "2019-10-10", "consideration_value": 500000},
        {"matched_name": "A", "score": 0.9995, "side": "executant", "village": " KATRAGUNTA ",
         "reg_date": "2004-02-01", "consideration_value": 250000.5},
        {"matched_name": "B", "score": 0.81, "side": "claimant", "village": "NALLAPADU",
         "reg_date": "2021-06-30", "consideration_value": None},
        {"matched_name": "B", "score": 0.7, "side": "witness", "village": "", "reg_date": None},
    ]
    view = record_view(PARTY, json.dumps({"matches": rows, "total_matches": 9}), {"name": "A"}, "t")
    assert view["summary"] == {
        "total_matches": 9, "exact_matches": 2, "as_buyer": 2, "as_seller": 1,
        "consideration_total": 750000.5, "first_date": "2004-02-01", "last_date": "2021-06-30",
        "villages": ["KATRAGUNTA", "NALLAPADU"],
    }


def test_a_summary_without_figures_stays_null_and_other_tools_get_none():
    view = record_view(PARTY, json.dumps({"matches": [{"matched_name": "A", "side": "claimant"}]}), {}, "t")
    summary = view["summary"]
    assert summary["total_matches"] == 1 and summary["consideration_total"] is None
    assert summary["first_date"] is None and summary["last_date"] is None and summary["villages"] == []
    other = record_view("mcp__pattadar_records__get_property_history",
                        json.dumps({"records": [{"village": "V", "survey_no": "1"}]}))
    assert "summary" not in other
