"""LGD normalization, provenance safety and delta classification."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import geography as g


def test_state_headers_from_lgd_csv_are_normalized():
    row = g.normalize_record("state", {
        "State Code": "28",
        "State Name (In English)": "Andhra Pradesh",
        "State Name (In Local language)": "ఆంధ్ర ప్రదేశ్",
        "State Short Code": "AP",
    })
    assert row["lgd_code"] == "28"
    assert row["name"] == "Andhra Pradesh"
    assert row["name_local"] == "ఆంధ్ర ప్రదేశ్"
    assert row["short_code"] == "AP"


def test_village_keeps_complete_government_hierarchy():
    row = g.normalize_record("village", {
        "Village Code": "587001",
        "Village Name (In English)": "Kothapalli",
        "Sub-District Code": "04942",
        "Sub-District Name (In English)": "Peddapuram",
        "District Code": "505",
        "District Name (In English)": "Kakinada",
        "State Code": "28",
        "State Name (In English)": "Andhra Pradesh",
        "Census 2011 Code": "587001",
    })
    assert row["mandal_lgd_code"] == "04942"
    assert row["district_lgd_code"] == "505"
    assert row["state_lgd_code"] == "28"
    assert row["census_2011_code"] == "587001"


def test_village_inherits_upper_ancestry_from_its_mandal():
    row = g.normalize_record("village", {
        "Village Code": "587001",
        "Village Name": "Kothapalli",
        "Sub-District Code": "04942",
    })
    parents = {
        "state": {"28": {"id": "lgd:state:28", "name": "Andhra Pradesh", "lgd_code": "28"}},
        "district": {"505": {"id": "lgd:district:505", "name": "Kakinada", "lgd_code": "505"}},
        "mandal": {"04942": {
            "id": "lgd:mandal:04942", "name": "Peddapuram", "lgd_code": "04942",
            "state_id": "lgd:state:28", "state_lgd_code": "28", "state_name": "Andhra Pradesh",
            "district_id": "lgd:district:505", "district_lgd_code": "505", "district_name": "Kakinada",
        }},
        "village": {},
    }
    result = g._db_row(
        "village", row, parents, None, run_id="run-1", effective_at="2026-09-01",
        source_url=g.RESOURCE_URLS["village"], now="2026-09-20T00:00:00+00:00",
    )
    assert result["state_id"] == "lgd:state:28"
    assert result["state_lgd_code"] == "28"
    assert result["district_id"] == "lgd:district:505"
    assert result["district_lgd_code"] == "505"
    assert result["mandal_id"] == "lgd:mandal:04942"


def test_missing_parent_is_rejected_instead_of_orphaned():
    try:
        g.normalize_record("district", {
            "District Code": "505", "District Name": "Kakinada",
        })
    except ValueError as exc:
        assert "state_lgd_code" in str(exc)
    else:
        raise AssertionError("district without a state was accepted")


def test_row_hash_is_stable_across_input_column_order():
    one = g.normalize_record("state", {"State Code": "28", "State Name": "Andhra Pradesh"})
    two = g.normalize_record("state", {"State Name": "Andhra Pradesh", "State Code": "28"})
    assert one["row_hash"] == two["row_hash"]


def test_change_classification_distinguishes_update_retire_and_reactivate():
    assert g.change_kind(None, {"active": True, "row_hash": "a"}) == "insert"
    assert g.change_kind({"active": True, "row_hash": "a"},
                         {"active": True, "row_hash": "a"}) == "unchanged"
    assert g.change_kind({"active": True, "row_hash": "a"},
                         {"active": True, "row_hash": "b"}) == "update"
    assert g.change_kind({"active": True, "row_hash": "a"},
                         {"active": False, "row_hash": "b"}) == "retire"
    assert g.change_kind({"active": False, "row_hash": "a"},
                         {"active": True, "row_hash": "b"}) == "reactivate"


def test_provenance_never_persists_api_keys():
    assert g.public_source_url(
        "https://api.data.gov.in/resource/abc?api-key=secret&format=csv"
    ) == "https://api.data.gov.in/resource/abc"


def test_tables_have_database_descriptions_and_delta_ledgers():
    ddl = "\n".join(g.DDL + g.COMMENTS)
    assert "reference_data_sync_runs" in ddl
    assert "reference_data_changes" in ddl
    assert "COMMENT ON TABLE villages" in ddl
    assert "lgd_code" in ddl
