"""Inbound identity-header stripping — the entire security boundary.

Covers both layers:
1. StripIdentityHeadersMiddleware removes x-user-id / x-ea-user-id (and the
   name variants) from the ASGI scope before ANY handler runs.
2. proxy.outbound_headers never forwards client identity/auth headers and
   is the only place the validated x-user-id is injected.
"""
from fastapi import FastAPI, Request
from starlette.testclient import TestClient

from app.main import StripIdentityHeadersMiddleware
from app.proxy import is_public_verify, outbound_headers


def _echo_app():
    app = FastAPI()

    @app.get("/echo")
    async def echo(request: Request):
        return dict(request.headers)

    app.add_middleware(StripIdentityHeadersMiddleware)
    return app


def test_middleware_strips_identity_headers():
    client = TestClient(_echo_app())
    r = client.get(
        "/echo",
        headers={
            "x-user-id": "attacker",
            "X-EA-User-Id": "attacker2",
            "x-user-name": "Mallory",
            "x-ea-user-name": "Mallory2",
            "x-request-id": "keep-me",
        },
    )
    seen = r.json()
    assert "x-user-id" not in seen
    assert "x-ea-user-id" not in seen
    assert "x-user-name" not in seen
    assert "x-ea-user-name" not in seen
    assert seen.get("x-request-id") == "keep-me"


def test_outbound_headers_replace_identity():
    inbound = {
        "x-user-id": "attacker",
        "x-ea-user-id": "attacker2",
        "authorization": "Bearer abc",
        "content-type": "application/json",
        "host": "app.pattadar.com",
        "content-length": "42",
        "connection": "keep-alive",
        "x-request-id": "rid-1",
    }
    out = outbound_headers(inbound, "sankara.telukutla")
    assert out["x-user-id"] == "sankara.telukutla"  # validated identity only
    assert "authorization" not in out
    assert "host" not in out
    assert "content-length" not in out
    assert "connection" not in out
    assert out["content-type"] == "application/json"
    assert out["x-request-id"] == "rid-1"


def test_outbound_headers_anonymous_has_no_user_id():
    out = outbound_headers({"x-user-id": "attacker"}, None)
    assert "x-user-id" not in out


def test_public_verify_carveout():
    ok = b'{"query": "mutation { verifyBeneficiary(token: \\"t\\") { ok } }"}'
    assert is_public_verify("graphql", "POST", ok)
    assert not is_public_verify("graphql", "GET", ok)
    assert not is_public_verify("other", "POST", ok)
    assert not is_public_verify("graphql", "POST", b'{"query": "query { beneficiaries { id } }"}')
    assert not is_public_verify("graphql", "POST", b"not-json")
    assert not is_public_verify("graphql", "POST", b"")
