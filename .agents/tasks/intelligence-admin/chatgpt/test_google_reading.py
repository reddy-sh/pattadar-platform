import asyncio

from src.ai_reading import settings
from src.ai_reading.providers import google


def test_unconfigured_gemini_keeps_claude_path(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_SERVICE_ACCOUNT_JSON", raising=False)
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)
    assert settings.ReadingSettings().effective_provider == "anthropic"
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    assert settings.ReadingSettings().effective_provider == "anthropic"  # OCR processor absent
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_JSON", "test-service-account")
    assert settings.ReadingSettings(processor="projects/p/locations/us/processors/o").effective_provider == "gemini"


def test_ocr_text_is_sent_to_gemini_once_and_usage_is_preserved(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    calls = []

    async def ocr(data, mime, processor):
        assert data == b"scan"
        assert processor == "projects/p/locations/us/processors/o"
        return "Page 1:\nతెలుగు భూమి", 1

    class Response:
        def raise_for_status(self): pass
        def json(self):
            return {"candidates": [{"content": {"parts": [{"text": '{"owner_name":"Ravi"}'}]}}],
                    "usageMetadata": {"promptTokenCount": 100, "totalTokenCount": 120}}

    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, url, **kwargs):
            calls.append((url, kwargs))
            return Response()

    monkeypatch.setattr(google, "_ocr", ocr)
    monkeypatch.setattr(google.httpx, "AsyncClient", Client)
    result = asyncio.run(google.extract(
        b"scan", "application/pdf", "private-name.pdf", "Read land fields", "Extract JSON",
        model="gemini-3.5-flash-lite", ocr_enabled=True,
        processor="projects/p/locations/us/processors/o", endpoint="import-passbook"))
    assert result["fields"] == {"owner_name": "Ravi"}
    assert result["usage"]["model"] == "gemini-3.5-flash-lite"
    assert result["usage"]["ocr_pages"] == 1
    assert len(calls) == 1
    assert "తెలుగు భూమి" in calls[0][1]["json"]["contents"][0]["parts"][0]["text"]
    assert "private-name" not in str(calls)


def test_missing_key_rejects_before_ocr(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    result = asyncio.run(google.extract(
        b"scan", "application/pdf", "scan.pdf", "system", "read",
        model="gemini-3.5-flash-lite", ocr_enabled=True,
        processor="projects/p/locations/us/processors/o", endpoint="import-passbook"))
    assert result["_error"][0] == 503


def test_document_ai_text_anchors_keep_page_numbers(monkeypatch):
    monkeypatch.setattr(google, "_access_token", lambda: "test-token")
    requests = []

    class Response:
        def raise_for_status(self): pass
        def json(self):
            return {"document": {"text": "one two", "pages": [
                {"pageNumber": 1, "layout": {"textAnchor": {"textSegments": [
                    {"startIndex": "0", "endIndex": "3"}]}}},
                {"pageNumber": 2, "layout": {"textAnchor": {"textSegments": [
                    {"startIndex": "4", "endIndex": "7"}]}}},
            ]}}

    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, url, **kwargs):
            requests.append((url, kwargs))
            return Response()

    monkeypatch.setattr(google.httpx, "AsyncClient", Client)
    result = asyncio.run(google._ocr(b"scan", "application/pdf", "projects/p/locations/asia-south1/processors/o"))
    assert result == ("Page 1:\none\n\nPage 2:\ntwo", 2)
    assert requests[0][0].startswith("https://asia-south1-documentai.googleapis.com/")
    assert requests[0][1]["headers"] == {"Authorization": "Bearer test-token"}
