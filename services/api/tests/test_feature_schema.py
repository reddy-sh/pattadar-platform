import json
import sys
from pathlib import Path

import pytest


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import feature_schema  # noqa: E402


def test_tree_accepts_only_tree_fields():
    attrs = feature_schema.validate_attributes(
        "tree", json.dumps({"species": "Neem", "count": "12", "fruiting": True}))

    assert attrs == {"species": "Neem", "count": 12, "fruiting": True}
    assert feature_schema.summary("tree", attrs) == "Neem · 12 trees · Currently fruiting"

    with pytest.raises(ValueError, match="Unsupported fields"):
        feature_schema.validate_attributes("tree", json.dumps({"motorHp": 5}))


def test_bore_motor_fields_depend_on_motor_installed():
    hidden = feature_schema.validate_attributes(
        "bore", json.dumps({"depthFt": 420, "motorInstalled": False, "motorHp": 5}))
    installed = feature_schema.validate_attributes(
        "bore", json.dumps({"depthFt": "420", "motorInstalled": True, "motorHp": "5"}))

    assert hidden == {"depthFt": 420, "motorInstalled": False}
    assert installed["motorHp"] == 5


def test_point_geometry_is_geojson_order_and_validated():
    point = feature_schema.validate_point(json.dumps({
        "type": "Point", "coordinates": [80.123, 15.456],
        "source": "device", "accuracyM": 8.375,
    }))

    assert point == {
        "type": "Point", "coordinates": [80.123, 15.456],
        "source": "device", "accuracyM": 8.38,
    }

    with pytest.raises(ValueError, match="outside the earth"):
        feature_schema.validate_point('{"type":"Point","coordinates":[181,15]}')


def test_legacy_labels_map_to_versioned_types():
    assert feature_schema.infer_type_key("Borewell") == "bore"
    assert feature_schema.infer_type_key("Neem tree") == "custom"
    assert feature_schema.infer_type_key("Trees") == "tree"

