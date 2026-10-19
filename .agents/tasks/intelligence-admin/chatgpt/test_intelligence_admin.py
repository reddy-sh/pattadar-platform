import asyncio

from fastapi import Request
from fastapi.responses import JSONResponse

from src.ai_catalog import routes


def _request():
    return Request({"type": "http", "method": "GET", "path": "/api/gateway/admin/intelligence",
                    "headers": []})


def test_settings_read_denies_without_admin_before_database(monkeypatch):
    async def deny(_request):
        return JSONResponse(status_code=403, content={"error": "Forbidden"})

    monkeypatch.setattr(routes, "_require_admin", deny)
    monkeypatch.setattr(routes.psycopg, "connect", lambda *a, **kw: (_ for _ in ()).throw(AssertionError("database reached")))
    response = asyncio.run(routes.get_intelligence(_request(), {}))
    assert response.status_code == 403


def test_settings_write_rejects_untrusted_processor_path(monkeypatch):
    async def allow(_request): return None
    monkeypatch.setattr(routes, "_require_admin", allow)
    body = routes.IntelligenceRequest(
        provider="gemini", gemini_model="gemini-3.5-flash-lite", claude_model="claude-sonnet-5",
        ocr_enabled=True, processor="projects/p/locations/us/processors/x/../../internal")
    response = asyncio.run(routes.set_intelligence(_request(), body, {}))
    assert response.status_code == 400


def test_model_catalog_never_resolves_unrelated_task_secrets(monkeypatch):
    monkeypatch.setenv("PG_PASSWORD", "private-db-password")
    assert routes._resolve_api_key("PG_PASSWORD") == ""
