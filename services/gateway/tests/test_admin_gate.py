"""Admin access follows an explicit immutable subject, never a legacy alias."""
import asyncio
import json
import types
from app import auth


def request(claims):
    return types.SimpleNamespace(state=types.SimpleNamespace(token_claims=claims), headers={})


def denied(claims):
    return asyncio.run(auth.require_admin(request(claims)))


def test_no_builtin_or_legacy_admin(monkeypatch):
    monkeypatch.delenv("ADMIN_SUBJECT_IDS", raising=False)
    monkeypatch.setenv("ADMIN_USER_IDS", "sankara.telukutla")
    assert not auth.is_admin("sankara.telukutla")
    for domain in ["gmail.com", "evil.com"]:
        assert denied({"iss": "pool", "sub": domain, "email": f"sankara.telukutla@{domain}"}).status_code == 403


def test_admin_is_subject_scoped_even_when_owner_is_legacy(monkeypatch):
    claims = {"iss": "pool", "sub": "admin-sub", "email": "admin@example.com"}
    subject = auth.principal_id_from_claims(claims)
    monkeypatch.setenv("ADMIN_SUBJECT_IDS", f" {subject} ")
    monkeypatch.setenv("IDENTITY_LEGACY_BINDINGS", json.dumps({subject: "old-admin"}))
    assert denied(claims) is None
    assert denied({**claims, "sub": "different-sub"}).status_code == 403
    assert denied({**claims, "iss": "different-pool"}).status_code == 403
    assert denied({**claims, "email": "changed@example.com"}) is None


def test_missing_claims_and_empty_allowlist_deny(monkeypatch):
    monkeypatch.setenv("ADMIN_SUBJECT_IDS", "")
    assert denied(None).status_code == 403
    assert not auth.is_admin("")
    assert not auth.is_admin(None)
