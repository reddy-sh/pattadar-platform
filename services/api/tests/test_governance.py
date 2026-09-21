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


def test_country_baseline_is_global_and_contains_no_unknown_sources():
    document = governance.validate_document(governance.GLOBAL_DOCUMENT)
    assert document["jurisdiction"]["stateCode"] == "*"
    assert document["jurisdiction"]["districtCode"] == "*"
    assert document["jurisdiction"]["authorityName"] == "Government of India"
    assert {source["id"] for source in document["sources"]} == {
        "dolr-registration-faq", "dolr-dilrmp", "dpdp-act", "dpdp-rules",
    }


def test_workforce_rules_include_certification_and_rating_retraining():
    rules = {rule["key"]: rule for rule in governance.BASELINE_DOCUMENT["workforceCompliance"]}
    assert "certification-before-allocation" in rules
    threshold = rules["rating-retraining-threshold"]["rule"]
    assert "100" in threshold and "below 3.0" in threshold


def test_scope_normalisation_enforces_the_country_state_district_hierarchy():
    assert governance.normalize_scope("in", "ap", "Prakasam") == (
        "IN", "AP", "PRAKASAM", "IN/AP/PRAKASAM")
    assert governance.normalize_scope("IN", "*", "*")[-1] == "IN/*/*"
    try:
        governance.normalize_scope("IN", "*", "PRAKASAM")
    except ValueError as exc:
        assert "requires a state" in str(exc)
    else:
        raise AssertionError("district without state was accepted")


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


def test_every_service_has_an_accessible_governed_visual():
    visuals = governance.BASELINE_DOCUMENT["serviceVisuals"]
    assert {item["serviceKey"] for item in visuals} == set(web360.SERVICE_CATALOGUE)
    assert all(item["assetKey"] in web360.SERVICE_CATALOGUE for item in visuals)
    assert all(len(item["alt"]) >= 12 and len(item["caption"]) >= 12 for item in visuals)


def test_service_visual_mapping_can_change_copy_and_reuse_only_bundled_assets():
    document = json.loads(governance.canonical_json(governance.BASELINE_DOCUMENT))
    fmb = next(item for item in document["serviceVisuals"] if item["serviceKey"] == "fmb_copy")
    fmb.update({
        "assetKey": "survey",
        "alt": "A licensed surveyor measures the land boundary.",
        "caption": "A district override uses the on-site survey explanation.",
    })
    visual = web360._service_visual_for("fmb_copy", document, "IN/AP/PRAKASAM")
    assert visual.asset_key == "survey"
    assert visual.src == "/service-visuals/survey.webp"
    assert visual.source_scope == "IN/AP/PRAKASAM"

    fmb["assetKey"] = "https://tracker.example/image"
    fallback = web360._service_visual_for("fmb_copy", document, "IN/AP/PRAKASAM")
    assert fallback.asset_key == "fmb_copy"
    assert fallback.src == "/service-visuals/fmb_copy.webp"


def test_policy_validation_rejects_unmanaged_service_visual_urls():
    document = json.loads(governance.canonical_json(governance.BASELINE_DOCUMENT))
    document["serviceVisuals"][0]["assetKey"] = "https://tracker.example/image"
    try:
        governance.validate_document(document)
    except ValueError as exc:
        assert "bundled asset key" in str(exc)
    else:
        raise AssertionError("remote visual URL was accepted")


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
