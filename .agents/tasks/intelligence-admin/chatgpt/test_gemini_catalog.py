import asyncio

from src.ai_catalog.providers import gemini


def test_model_discovery_paginates_and_excludes_non_generation_models(monkeypatch):
    calls = []

    class Response:
        def __init__(self, body): self.body = body
        def raise_for_status(self): pass
        def json(self): return self.body

    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def get(self, url, *, params, headers):
            calls.append((url, params, headers))
            if "pageToken" not in params:
                return Response({"models": [
                    {"name": "models/gemini-3.5-flash-lite", "displayName": "Gemini Lite",
                     "supportedGenerationMethods": ["generateContent"], "inputTokenLimit": 1048576},
                    {"name": "models/gemini-embedding", "supportedGenerationMethods": ["embedContent"]},
                ], "nextPageToken": "next"})
            return Response({"models": [
                {"name": "models/gemini-3.5-flash", "supportedGenerationMethods": ["generateContent"]}
            ]})

    monkeypatch.setattr(gemini.httpx, "AsyncClient", Client)
    models = asyncio.run(gemini.list_models("test-key"))
    assert [model.model_id for model in models] == ["gemini-3.5-flash-lite", "gemini-3.5-flash"]
    assert calls[1][1]["pageToken"] == "next"
    assert calls[0][2] == {"x-goog-api-key": "test-key"}
