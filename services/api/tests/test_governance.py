import asyncio
import json
import os
import sys


sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import governance
import web360


def test_baseline_is_portable_and_covers_requested_property_types():
    document = governance.validate_document(governance.BASELINE_DOCUMENT)
    assert document["schemaVersion"] == 1
    assert {item["key"] for item in document["propertyTypes"]} == {
        "agricultural_land", "house_on_site", "open_plot", "commercial_building",
    }
    assert json.loads(governance.canonical_json(document))["jurisdiction"]["stateCode"] == "AP"
    assert len(governance.digest(document)) == 64


def test_property_matching_uses_government_property_classification():
    document = governance.BASELINE_DOCUMENT
    assert governance.record_checklist(document, "parcel", "agri")["key"] == "agricultural_land"
    assert governance.record_checklist(document, "property", "flat")["key"] == "house_on_site"
    assert governance.record_checklist(document, "property", "open_plot")["key"] == "open_plot"
    assert governance.record_checklist(document, "property", "shop")["key"] == "commercial_building"


def test_land_survey_baseline_is_data_minimal():
    guide = next(item for item in governance.BASELINE_DOCUMENT["serviceRequests"]
                 if item["key"] == "land_survey")
    shared = " ".join(guide["share"]).lower()
    withheld = " ".join(guide["doNotShare"]).lower()
    assert "survey number" in shared
    assert "boundary coordinates" in shared
    assert "aadhaar" not in shared
    assert "pan" not in shared
    assert "aadhaar" in withheld
    assert "bank" in withheld


def test_policy_validation_rejects_duplicate_property_keys():
    document = json.loads(governance.canonical_json(governance.BASELINE_DOCUMENT))
    document["propertyTypes"].append(dict(document["propertyTypes"][0]))
    try:
        governance.validate_document(document)
    except ValueError as exc:
        assert "unique" in str(exc)
    else:
        raise AssertionError("duplicate checklist was accepted")


def test_super_admin_does_not_inherit_platform_admin(monkeypatch):
    monkeypatch.setattr(web360, "_env", lambda key, default="": {
        "PLATFORM_ADMIN_UIDS": "desk-user", "SUPER_ADMIN_UIDS": "policy-user",
    }.get(key, default))

    async def empty_setting(_conn, _key, default=""):
        return default

    monkeypatch.setattr(web360, "_setting", empty_setting)
    assert asyncio.run(web360._is_admin(object(), "desk-user")) is True
    assert asyncio.run(web360._is_super_admin(object(), "desk-user")) is False
    assert asyncio.run(web360._is_super_admin(object(), "policy-user")) is True
