import asyncio

from src.ai_reading import settings
from src.ai_reading.providers import google


def test_gemini_reads_only_when_chosen_and_fully_configured():
    ready = dict(provider="gemini", gemini_api_key="k" * 24, processor="projects/p/locations/us/processors/o",
                 google_service_account='{"type":"service_account"}')
    assert settings.ReadingSettings().effective_provider == "anthropic"  # the default
    assert settings.ReadingSettings(**ready).effective_provider == "gemini"
    assert settings.ReadingSettings(**{**ready, "provider": "anthropic"}).effective_provider == "anthropic"
    assert settings.ReadingSettings(**{**ready, "gemini_api_key": ""}).effective_provider == "anthropic"
    # OCR on needs both the processor and the service account; OCR off needs neither.
    assert settings.ReadingSettings(**{**ready, "processor": ""}).effective_provider == "anthropic"
    assert settings.ReadingSettings(**{**ready, "google_service_account": ""}).effective_provider == "anthropic"
    assert settings.ReadingSettings(**{**ready, "processor": "", "google_service_account": "",
                                       "ocr_enabled": False}).effective_provider == "gemini"


def test_ocr_text_is_sent_to_gemini_once_and_usage_is_preserved(monkeypatch):
    calls = []

    async def ocr(data, mime, processor, service_account_json):
        assert service_account_json == "account-json"
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
        model="gemini-3.5-flash-lite", api_key="test-key", ocr_enabled=True,
        processor="projects/p/locations/us/processors/o", service_account_json="account-json",
        endpoint="import-passbook"))
    assert result["fields"] == {"owner_name": "Ravi"}
    assert result["usage"]["model"] == "gemini-3.5-flash-lite"
    assert result["usage"]["ocr_pages"] == 1
    assert len(calls) == 1
    assert "తెలుగు భూమి" in calls[0][1]["json"]["contents"][0]["parts"][0]["text"]
    assert "private-name" not in str(calls)
    assert calls[0][1]["headers"] == {"x-goog-api-key": "test-key"}


def test_missing_credentials_reject_before_any_call(monkeypatch):
    async def never(*args, **kwargs):
        raise AssertionError("a provider was called")
    monkeypatch.setattr(google, "_ocr", never)
    common = dict(model="gemini-3.5-flash-lite", processor="projects/p/locations/us/processors/o",
                  endpoint="import-passbook")
    for api_key, account in (("", "account-json"), ("test-key", "")):
        result = asyncio.run(google.extract(
            b"scan", "application/pdf", "scan.pdf", "system", "read",
            api_key=api_key, ocr_enabled=True, service_account_json=account, **common))
        assert result["_error"][0] == 503


def test_document_ai_text_anchors_keep_page_numbers(monkeypatch):
    async def token(account):
        return "test-token"
    monkeypatch.setattr(google, "_access_token", token)
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
    result = asyncio.run(google._ocr(b"scan", "application/pdf",
                                    "projects/p/locations/asia-south1/processors/o", "account-json"))
    assert result == ("Page 1:\none\n\nPage 2:\ntwo", 2)
    assert requests[0][0].startswith("https://asia-south1-documentai.googleapis.com/")
    assert requests[0][1]["headers"] == {"Authorization": "Bearer test-token"}
