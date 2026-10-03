"""The iOS synchronous Aadhaar read: an upstream 503 reaches the app unchanged.

When protection fails after the paid read, the API answers 503 with one fixed
sentence. The gateway must hand that body to the client as it is, and must not
retry the (paid, non-idempotent) upstream call.
"""
import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src import auth
from src.routes import proxy

NOTHING_SAVED = {"error": "Aadhaar protection is temporarily unavailable. Nothing was saved."}


@pytest.fixture
def client(monkeypatch):
    async def validate(request, strict=True):
        return {"sub": "subject-123", "iss": "https://issuer.example"}
    monkeypatch.setattr(auth, "validate_bearer", validate)
    monkeypatch.setattr(auth, "extract_user_id", lambda request: "issuer.example|subject-123")
    monkeypatch.setenv("API_BASE_URL", "http://private-api")
    calls = []

    class Upstream:
        async def request(self, method, url, **kwargs):
            calls.append((method, url, kwargs["headers"].get("x-user-id")))
            return httpx.Response(503, json=NOTHING_SAVED)
    monkeypatch.setattr(auth, "proxy_client", Upstream())
    app = FastAPI()
    app.include_router(proxy.router)
    with TestClient(app) as browser:
        yield browser, calls


def test_upstream_protection_503_passes_through_once(client):
    browser, calls = client
    result = browser.post("/api/gateway/pattadar/extract-aadhaar",
                          files={"file": ("card.png", b"synthetic card", "image/png")},
                          headers={"authorization": "Bearer local-token"})
    assert result.status_code == 503
    assert result.json() == NOTHING_SAVED
    assert len(calls) == 1
    method, url, owner = calls[0]
    assert method == "POST" and url == "http://private-api/extract-aadhaar"
    assert owner == "issuer.example|subject-123"
