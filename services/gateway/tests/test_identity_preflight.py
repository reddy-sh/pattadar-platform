import importlib.util
from pathlib import Path
import pytest

spec = importlib.util.spec_from_file_location("identity_preflight", Path(__file__).parents[1] / "scripts/identity_preflight.py")
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


def inputs():
    return ({"issuer": "https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_POOL",
             "bindings": [{"subject": "a", "owner_id": "alice", "evidence": "signed historic account migration"}],
             "admin_subjects": ["a"]},
            {"Users": [{"Attributes": [{"Name": "sub", "Value": "a"}]}]},
            {"owner_ids": ["alice"], "sources": ["api", "hub", "assistant"], "complete": True, "admin_owner_ids": ["alice"]})


def test_complete_mapping_preserves_owner_and_admin():
    result = preflight.validate(*inputs())
    assert "alice" in result["IDENTITY_LEGACY_BINDINGS"]
    assert result["ADMIN_SUBJECT_IDS"].startswith("subject_")


def test_missing_owner_refuses_rollout():
    manifest, cognito, owners = inputs()
    owners["owner_ids"].append("bob")
    with pytest.raises(ValueError, match="Unmapped"):
        preflight.validate(manifest, cognito, owners)


def test_editable_email_is_not_ownership_evidence():
    manifest, cognito, owners = inputs()
    manifest["bindings"][0]["evidence"] = ""
    with pytest.raises(ValueError, match="evidence"):
        preflight.validate(manifest, cognito, owners)


def test_admin_binding_cannot_be_lost():
    manifest, cognito, owners = inputs()
    manifest["admin_subjects"] = []
    with pytest.raises(ValueError, match="administrator"):
        preflight.validate(manifest, cognito, owners)


def test_duplicate_owner_needs_reviewed_account_link():
    manifest, cognito, owners = inputs()
    cognito["Users"].append({"Attributes": [{"Name": "sub", "Value": "b"}]})
    manifest["bindings"].append({"subject": "b", "owner_id": "alice", "evidence": "same local-part"})
    with pytest.raises(ValueError, match="account_link_review"):
        preflight.validate(manifest, cognito, owners)
