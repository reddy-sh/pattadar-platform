"""Super-admin gate — MUST fail closed on any doubt."""
import asyncio
import types

from app.auth import is_admin, require_admin


def _request_with(claims):
    return types.SimpleNamespace(state=types.SimpleNamespace(token_claims=claims), headers={})


def _deny(request):
    return asyncio.run(require_admin(request))


def test_default_admin_allowed(monkeypatch):
    monkeypatch.delenv("ADMIN_USER_IDS", raising=False)
    assert is_admin("sankara.telukutla")
    assert _deny(_request_with({"email": "sankara.telukutla@gmail.com"})) is None


def test_non_admin_denied(monkeypatch):
    monkeypatch.delenv("ADMIN_USER_IDS", raising=False)
    assert not is_admin("mallory")
    deny = _deny(_request_with({"email": "mallory@evil.com"}))
    assert deny is not None and deny.status_code == 403


def test_no_claims_denied(monkeypatch):
    monkeypatch.delenv("ADMIN_USER_IDS", raising=False)
    deny = _deny(_request_with(None))  # extract_user_id → "local"
    assert deny is not None and deny.status_code == 403


def test_empty_allowlist_denies_everyone(monkeypatch):
    # Explicitly emptied allowlist → NOBODY is admin (fail closed), not even
    # the built-in default.
    monkeypatch.setenv("ADMIN_USER_IDS", "")
    assert not is_admin("sankara.telukutla")
    deny = _deny(_request_with({"email": "sankara.telukutla@gmail.com"}))
    assert deny is not None and deny.status_code == 403


def test_empty_user_id_denied(monkeypatch):
    monkeypatch.delenv("ADMIN_USER_IDS", raising=False)
    assert not is_admin("")
    assert not is_admin(None)


def test_csv_allowlist_parses_with_spaces(monkeypatch):
    monkeypatch.setenv("ADMIN_USER_IDS", " alice , bob ")
    assert is_admin("alice")
    assert is_admin("bob")
    assert not is_admin("carol")
    # spoofed casing is NOT normalized here — exact match only (fail closed)
    assert not is_admin("Alice")
