"""Invariant 1 on a shared host: the api container answers only the gateway.

src.private_ingress is what the container serves. It demands the gateway's
x-internal-proxy-secret on every path but two exact strings, and refuses to
load without a secret. No database: the wrapper is driven over a stub ASGI app
that records what reached it, and the import checks stop before src.main is
loaded, or load it without opening its pool.
"""
import asyncio
import importlib
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Synthetic throughout. Nothing here is, or resembles, a deployed value.
SECRET = "test-internal-proxy-secret-not-real"


@pytest.fixture
def ingress(monkeypatch):
    monkeypatch.setenv("INTERNAL_PROXY_SECRET", SECRET)
    monkeypatch.delenv("ALLOW_INSECURE_LOCAL", raising=False)
    return importlib.import_module("src.private_ingress")


def _call(ingress, scope_type="http", path="/graphql", secret=None, **extra):
    reached, sent = [], []

    async def app(scope, receive, send):
        reached.append(scope["path"])

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        sent.append(message)

    headers = [(b"x-user-id", b"forged")]
    if secret is not None:
        headers.append((b"x-internal-proxy-secret", secret.encode()))
    scope = {"type": scope_type, "path": path, "root_path": "", "headers": headers, **extra}
    asyncio.run(ingress.PrivateIngress(app, SECRET)(scope, receive, send))
    return reached, sent


def _status(sent):
    return next((m["status"] for m in sent if m["type"] == "http.response.start"), None)


@pytest.mark.parametrize("path", ["/graphql", "/internal/account/export"])
@pytest.mark.parametrize("secret", [None, "", "wrong", SECRET + "x", SECRET[:-1]])
def test_a_caller_without_the_gateways_secret_is_refused(ingress, path, secret):
    reached, sent = _call(ingress, path=path, secret=secret)
    assert reached == []
    assert _status(sent) == 403


@pytest.mark.parametrize("path", ["/graphql", "/internal/account/export"])
def test_the_gateways_secret_passes(ingress, path):
    reached, sent = _call(ingress, path=path, secret=SECRET)
    assert reached == [path]
    assert sent == []


@pytest.mark.parametrize("path", ["/health", "/cron/inactivity-check"])
def test_the_two_exempt_paths_pass_without_a_secret(ingress, path):
    """The health probe, and the cron, which carries CRON_SECRET instead."""
    reached, _ = _call(ingress, path=path)
    assert reached == [path]


@pytest.mark.parametrize("path", [
    "/health/", "/cron/inactivity-check/",
    "//health", "//cron/inactivity-check", "/cron//inactivity-check",
    "/%68ealth", "/cron%2Finactivity-check", "/cron/inactivity%2Dcheck",
    "/x/../health", "/./health", "/cron/./inactivity-check", "/graphql/../health",
    "/HEALTH", "/Health", "/cron/Inactivity-Check",
    "/health?x=1", "/health\x00", " /health", "/healthz", "/cron/inactivity-check-all",
    "", "/",
])
def test_a_variant_of_an_exempt_path_is_not_exempt(ingress, path):
    reached, sent = _call(ingress, path=path)
    assert reached == []
    assert _status(sent) == 403


@pytest.mark.parametrize("root_path,path", [
    ("/x", "/x/health"), ("/x", "/health"), ("/health", "/health"),
    ("/cron", "/cron/inactivity-check"),
])
def test_a_root_path_voids_the_exemption(ingress, root_path, path):
    """Routing strips root_path, so the routed path would no longer be the
    string that was checked."""
    reached, sent = _call(ingress, path=path, root_path=root_path)
    assert reached == []
    assert _status(sent) == 403


def test_a_websocket_without_the_secret_is_closed(ingress):
    reached, sent = _call(ingress, scope_type="websocket", path="/graphql")
    assert reached == []
    assert sent == [{"type": "websocket.close", "code": 1008}]


def test_a_websocket_with_the_secret_passes(ingress):
    reached, _ = _call(ingress, scope_type="websocket", path="/graphql", secret=SECRET)
    assert reached == ["/graphql"]


def test_an_unknown_scope_type_is_dropped(ingress):
    reached, sent = _call(ingress, scope_type="webtransport", path="/graphql")
    assert reached == [] and sent == []


def test_lifespan_reaches_the_app_untouched(ingress):
    reached, _ = _call(ingress, scope_type="lifespan", path="lifespan")
    assert reached == ["lifespan"]


def test_the_module_refuses_to_load_without_a_secret(monkeypatch):
    monkeypatch.delenv("INTERNAL_PROXY_SECRET", raising=False)
    monkeypatch.delenv("ALLOW_INSECURE_LOCAL", raising=False)
    sys.modules.pop("src.private_ingress", None)
    with pytest.raises(RuntimeError, match="INTERNAL_PROXY_SECRET"):
        importlib.import_module("src.private_ingress")
    monkeypatch.setenv("INTERNAL_PROXY_SECRET", "   ")
    with pytest.raises(RuntimeError, match="INTERNAL_PROXY_SECRET"):
        importlib.import_module("src.private_ingress")
    monkeypatch.setenv("ALLOW_INSECURE_LOCAL", "true")  # only the exact "1" bypasses
    with pytest.raises(RuntimeError, match="INTERNAL_PROXY_SECRET"):
        importlib.import_module("src.private_ingress")


def test_the_module_wraps_the_api_when_configured(monkeypatch):
    from src import main

    for env in ({"INTERNAL_PROXY_SECRET": SECRET}, {"ALLOW_INSECURE_LOCAL": "1"}):
        monkeypatch.delenv("INTERNAL_PROXY_SECRET", raising=False)
        monkeypatch.delenv("ALLOW_INSECURE_LOCAL", raising=False)
        for name, value in env.items():
            monkeypatch.setenv(name, value)
        sys.modules.pop("src.private_ingress", None)
        module = importlib.import_module("src.private_ingress")
        assert isinstance(module.app, module.PrivateIngress)
        assert module.app.app is main.app
        assert module.app.secret == env.get("INTERNAL_PROXY_SECRET", "").encode()

