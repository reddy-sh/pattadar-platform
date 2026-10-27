"""The edge: what an anonymous caller can spend, and what a request is called
once it is inside.

Three defects met here:

- the api proxy buffered the whole body into memory BEFORE it looked at the
  token, so one unauthenticated POST could spend the task's memory.
- nothing minted a correlation id, so a reported failure could not be followed
  from the gateway into the api and the assistant.
- a rejected token was logged at DEBUG under an INFO root logger, and a JWKS
  fetch that never answered was reported to the caller as a bad credential.
"""
import asyncio
import logging

import httpx
import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from jose.exceptions import JWTError

from src import auth, internal_api, request_context
from src.main import LimitRequestBodyMiddleware
from src.routes import account, capabilities, proxy

_SECRET_NAMES = ("INTERNAL_PROXY_SECRET", "INTERNAL_PROXY_SECRET_API", "INTERNAL_PROXY_SECRET_ASSISTANT")


def _edge(max_bytes: int = 64):
    """The middleware pair as main.py stacks it, over a handler that reports
    what reached it."""
    app = FastAPI()
    reached = []

    @app.post("/echo")
    async def echo(request: Request):
        body = await request.body()
        reached.append(len(body))
        return {
            "request_id": request_context.current_request_id(),
            "outbound": internal_api.internal_headers(),
        }

    app.add_middleware(LimitRequestBodyMiddleware, max_bytes=max_bytes)
    app.add_middleware(request_context.RequestIdMiddleware)
    return TestClient(app), reached


def test_a_declared_oversize_body_is_refused_without_reading_it():
    client, reached = _edge()
    response = client.post("/echo", content=b"x" * 256)
    assert response.status_code == 413
    assert reached == []


def test_a_chunked_body_is_cut_off_at_the_same_ceiling():
    """No Content-Length to refuse on, so the count runs as the bytes arrive."""

    def chunks():
        for _ in range(8):
            yield b"x" * 32

    client, reached = _edge()
    assert client.post("/echo", content=chunks()).status_code == 413


def test_a_body_under_the_ceiling_arrives_whole():
    client, reached = _edge()
    assert client.post("/echo", content=b"x" * 40).status_code == 200
    assert reached == [40]


def test_the_proxy_refuses_an_oversize_body_before_it_validates_anything(monkeypatch):
    """The point of the cap: the read is the one piece of work an anonymous
    caller can make the gateway do, so it must be bounded above the token."""
    validated = []

    async def spy(request, *, strict=True):
        validated.append(strict)
        return None

    monkeypatch.setenv("API_BASE_URL", "http://api.internal")
    monkeypatch.setattr(proxy, "MAX_PROXY_BODY_BYTES", 16)
    monkeypatch.setattr(auth, "validate_bearer", spy)
    app = FastAPI()
    app.include_router(proxy.router)
    with TestClient(app) as client:
        response = client.post("/api/gateway/pattadar/graphql", content=b"x" * 64)
    assert response.status_code == 413
    assert validated == []


def test_a_request_without_an_id_is_given_one_and_told_which():
    client, _ = _edge()
    response = client.post("/echo", content=b"{}")
    minted = response.headers["x-request-id"]
    assert minted and response.json()["request_id"] == minted


def test_a_supplied_id_is_adopted_so_the_caller_can_quote_it():
    client, _ = _edge()
    response = client.post("/echo", content=b"{}", headers={"x-request-id": "rid-1"})
    assert response.headers["x-request-id"] == "rid-1"
    assert response.json()["request_id"] == "rid-1"


def test_an_unprintable_id_is_replaced_not_echoed():
    """The id is written into every log line of the request and handed back to
    the caller, so a hostile one is not adopted."""
    client, _ = _edge()
    response = client.post("/echo", content=b"{}", headers={"x-request-id": "rid 1 rid"})
    assert response.headers["x-request-id"] != "rid 1 rid"
    assert len(response.headers["x-request-id"]) == 36


def test_the_id_travels_on_the_calls_the_gateway_mints_itself():
    client, _ = _edge()
    response = client.post("/echo", content=b"{}", headers={"x-request-id": "rid-2"})
    assert response.json()["outbound"]["x-request-id"] == "rid-2"


def test_a_record_outside_a_request_names_no_id():
    record = logging.LogRecord("t", logging.INFO, __file__, 1, "m", None, None)
    assert request_context.RequestIdLogFilter().filter(record)
    assert record.request_id == "-"


def test_the_internal_secret_fails_open_while_it_is_unconfigured(monkeypatch):
    """Local stacks and a half-rolled-out deployment keep working; the upstream
    check is the half that fails closed."""
    for name in _SECRET_NAMES:
        monkeypatch.delenv(name, raising=False)
    for target in ("api", "assistant"):
        assert internal_api.INTERNAL_PROXY_SECRET_HEADER not in internal_api.internal_headers(target)
    monkeypatch.setenv("INTERNAL_PROXY_SECRET_API", "  shhh  ")
    assert internal_api.internal_headers("api")[internal_api.INTERNAL_PROXY_SECRET_HEADER] == "shhh"


def test_a_caller_cannot_supply_the_gateways_proof_of_origin(monkeypatch):
    for name in _SECRET_NAMES:
        monkeypatch.delenv(name, raising=False)
    for target in ("api", "assistant"):
        out = proxy.outbound_headers(
            {internal_api.INTERNAL_PROXY_SECRET_HEADER: "forged"}, "shankarreddy.t", target
        )
        assert internal_api.INTERNAL_PROXY_SECRET_HEADER not in out


# Synthetic throughout. Nothing here is, or resembles, a deployed value.
API_SECRET = "api-only-secret"
ASSISTANT_SECRET = "assistant-only-secret"
LEGACY_SECRET = "legacy-shared-secret"


class _Body(httpx.SyncByteStream, httpx.AsyncByteStream):
    """An unread body, so the assistant proxy can stream it as it would SSE."""

    def __iter__(self):
        yield b'{"owner": "owner-1", "data": {}}'

    async def __aiter__(self):
        yield b'{"owner": "owner-1", "data": {}}'


@pytest.fixture(params=["shared-client", "fresh-client"])
def upstreams(request, monkeypatch):
    """Every call the gateway makes to a private service, as (host, secret).

    Run over both client branches: the lifespan's shared client, and the
    one-off client each helper opens when there is none."""
    seen = []

    def answer(outgoing):
        seen.append((outgoing.url.host, outgoing.headers.get(internal_api.INTERNAL_PROXY_SECRET_HEADER)))
        return httpx.Response(200, headers={"content-type": "application/json"}, stream=_Body())

    transport = httpx.MockTransport(answer)
    async_client, sync_client = httpx.AsyncClient, httpx.Client
    monkeypatch.setattr(httpx, "AsyncClient", lambda *a, **kw: async_client(*a, transport=transport, **kw))
    monkeypatch.setattr(httpx, "Client", lambda *a, **kw: sync_client(*a, transport=transport, **kw))
    shared = async_client(transport=transport) if request.param == "shared-client" else None
    monkeypatch.setattr(auth, "proxy_client", shared)
    monkeypatch.setenv("API_BASE_URL", "http://api.test")
    monkeypatch.setenv("ASSISTANT_BASE_URL", "http://assistant.test")
    monkeypatch.setenv("INTERNAL_PROXY_SECRET_API", API_SECRET)
    monkeypatch.setenv("INTERNAL_PROXY_SECRET_ASSISTANT", ASSISTANT_SECRET)
    monkeypatch.setenv("INTERNAL_PROXY_SECRET", LEGACY_SECRET)

    async def signed_in(request, *, strict=True):
        return {"sub": "subject-1"}

    monkeypatch.setattr(auth, "validate_bearer", signed_in)
    monkeypatch.setattr(auth, "extract_user_id", lambda request: "owner-1")
    return seen


def _call_every_private_route():
    app = FastAPI()
    app.include_router(proxy.router)
    with TestClient(app) as client:
        assert client.post("/api/gateway/pattadar/graphql", content=b"{}").status_code == 200
        assert client.post("/api/gateway/assistant/api/chat/stream", content=b"{}").status_code == 200
    asyncio.run(account.upstream(proxy._api_base_url(), "/internal/account/export", "owner-1"))
    asyncio.run(account.upstream(proxy._assistant_base_url(), "/internal/account/export", "owner-1"))
    account._attachment_reader("owner-1")("attachment-1").close()
    asyncio.run(capabilities._api("GET", "/public/shares/" + "a" * 43))
    assert asyncio.run(internal_api.record_audit(
        "storage.read", actor_id="owner-1", actor_kind="user", resource_type="storage_node",
        resource_id="node-1", affected_owner="owner-1"))
    return ["api.test", "assistant.test", "api.test", "assistant.test", "assistant.test", "api.test", "api.test"]


def test_each_private_service_only_ever_sees_its_own_secret(upstreams):
    """The assistant parses untrusted attachments on a shared host: holding the
    api's secret would let it claim any x-user-id there."""
    hosts = _call_every_private_route()
    assert [host for host, _ in upstreams] == hosts
    expected = {"api.test": API_SECRET, "assistant.test": ASSISTANT_SECRET}
    assert all(secret == expected[host] for host, secret in upstreams), upstreams


def test_the_legacy_shared_secret_never_reaches_the_assistant(upstreams, monkeypatch):
    monkeypatch.delenv("INTERNAL_PROXY_SECRET_API")
    monkeypatch.delenv("INTERNAL_PROXY_SECRET_ASSISTANT")
    hosts = _call_every_private_route()
    assert [host for host, _ in upstreams] == hosts
    expected = {"api.test": LEGACY_SECRET, "assistant.test": None}
    assert all(secret == expected[host] for host, secret in upstreams), upstreams


@pytest.mark.parametrize(
    "err,status,reason",
    [
        (JWTError("Signature verification failed."), 401, "bad-signature"),
        (JWTError("Signature has expired."), 401, "expired"),
        (JWTError("Key not found in JWKS"), 401, "unknown-kid"),
        (httpx.ConnectError("jwks host unreachable"), 503, "jwks-unreachable"),
        (RuntimeError("boom"), 503, "internal-error"),
    ],
)
def test_a_rejected_token_is_classified_loudly_enough_to_see(caplog, err, status, reason):
    """An identity-provider outage is the gateway's problem (503), a bad
    credential is the caller's (401), and both leave a line above DEBUG."""
    with caplog.at_level(logging.WARNING, logger="pattadar.gateway.auth"):
        raised = auth._reject(err, "primary")
    assert raised.status_code == status
    assert f"reason={reason}" in caplog.text


def test_the_rejection_log_never_carries_the_token(caplog):
    with caplog.at_level(logging.WARNING, logger="pattadar.gateway.auth"):
        auth._reject(JWTError("bad signature for eyJhbGciOiJSUzI1NiJ9.forged"), "both")
    assert "eyJhbGciOiJSUzI1NiJ9" not in caplog.text
