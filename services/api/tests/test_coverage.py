"""Geographic coverage drill-down and state isolation."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import web360 as w


def _place(state_key: str) -> dict:
    return {
        "level": "state",
        "scope_key": f"state|{state_key}",
        "name": state_key,
        "records": 1,
        "keys": {"p|peddapuram|peddapuram|kakinada"},
        "state_key": state_key,
        "state_name": state_key,
        "district_key": "kakinada",
        "district_name": "Kakinada",
        "mandal_key": "peddapuram",
        "mandal_name": "Peddapuram",
    }


def test_scope_keys_retain_the_complete_parent_path():
    assert w._coverage_scope_key("state", "andhrapradesh") == "state|andhrapradesh"
    assert w._coverage_scope_key(
        "district", "andhrapradesh", "kakinada",
    ) == "district|andhrapradesh|kakinada"
    assert w._coverage_scope_key(
        "village", "andhrapradesh", "kakinada", "peddapuram", "peddapuram",
    ) == "village|andhrapradesh|kakinada|peddapuram|peddapuram"


def test_state_grid_does_not_count_another_states_associate():
    roster = [{
        "id": "assoc-1", "state": "active",
        "areas": [{"level": "state", "name_key": "andhrapradesh"}],
        "disciplines": [{"discipline": "advocate", "state": "on"}],
    }]
    ap = w._coverage_cells([_place("andhrapradesh")], roster, {}, "state")
    ts = w._coverage_cells([_place("telangana")], roster, {}, "state")
    ap_advocate = next(cell for cell in ap if cell["discipline"] == "advocate")
    ts_advocate = next(cell for cell in ts if cell["discipline"] == "advocate")
    assert ap_advocate["active_count"] == 1
    assert ts_advocate["active_count"] == 0


def test_live_jobs_follow_the_exact_record_location_into_the_parent_row():
    area = "p|peddapuram|peddapuram|kakinada"
    cells = w._coverage_cells(
        [_place("andhrapradesh")], [], {(area, "title_opinion"): 2}, "state",
    )
    advocate = next(cell for cell in cells if cell["discipline"] == "advocate")
    assert advocate["open_jobs"] == 2
    assert advocate["risk"] == "gap"
