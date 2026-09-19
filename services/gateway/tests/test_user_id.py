"""Immutable identity plus explicit, reviewed preservation of legacy owner keys."""
import json
import types

import pytest
from fastapi import HTTPException

from src import auth

ISSUER = "https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_POOL"


def claims(subject="alice-sub", email="alice@example.com", issuer=ISSUER):
    return {"iss": issuer, "sub": subject, "email": email}


def test_domains_cannot_collide():
    assert auth.user_id_from_claims(claims()) != auth.user_id_from_claims(claims("attacker", "alice@evil.com"))


def test_subject_survives_email_and_username_changes():
    before = claims()
    after = {**before, "email": "new@other.com", "preferred_username": "admin"}
    assert auth.user_id_from_claims(before) == auth.user_id_from_claims(after)


def test_same_email_never_automatically_links_distinct_subjects():
    assert auth.user_id_from_claims(claims()) != auth.user_id_from_claims(claims("other-sub"))


def test_issuer_is_part_of_identity():
    assert auth.user_id_from_claims(claims()) != auth.user_id_from_claims(claims(issuer="another-issuer"))


@pytest.mark.parametrize("value", [None, {}, {"email": "alice@example.com"}, {"sub": "alice"}, {"iss": ISSUER, "sub": ""}])
def test_missing_subject_never_becomes_local_or_email(value):
    with pytest.raises(HTTPException):
        auth.user_id_from_claims(value)


def test_reviewed_binding_preserves_all_legacy_owner_paths(monkeypatch):
    subject = auth.principal_id_from_claims(claims())
    monkeypatch.setenv("IDENTITY_LEGACY_BINDINGS", json.dumps({subject: "alice"}))
    assert auth.user_id_from_claims(claims()) == "alice"
    assert auth.user_id_from_claims(claims("attacker", "alice@evil.com")) != "alice"
    assert auth.user_id_from_claims(claims("new-sub")) != "alice"


@pytest.mark.parametrize("mapping", ['[]', '{"alice@example.com":"alice"}', '{"broken": "alice"}', 'bad-json'])
def test_unsafe_binding_config_fails_closed(monkeypatch, mapping):
    monkeypatch.setenv("IDENTITY_LEGACY_BINDINGS", mapping)
    with pytest.raises(RuntimeError):
        auth.user_id_from_claims(claims())


def test_production_startup_requires_migration_config(monkeypatch):
    monkeypatch.delenv("IDENTITY_LEGACY_BINDINGS", raising=False)
    monkeypatch.setattr(auth, "jwks_cache", None)
    with pytest.raises(RuntimeError, match="preflight"):
        auth.validate_identity_configuration()


def test_local_issuer_name_without_active_local_trust_has_no_legacy_access(monkeypatch):
    monkeypatch.setattr(auth, "jwks_cache", None)
    result = auth.user_id_from_claims(claims(issuer="pattadar-local-auth"))
    assert result.startswith("subject_")
