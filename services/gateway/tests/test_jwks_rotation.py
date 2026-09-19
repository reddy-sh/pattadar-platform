import asyncio
import time
import httpx
import pytest
from src.cognito_jwt import JWKSCache


def test_new_kid_refreshes_fresh_cache_once_for_concurrent_sessions():
    async def run():
        calls = []
        async def respond(request):
            calls.append(request.url)
            await asyncio.sleep(0.01)
            return httpx.Response(200, json={"keys": [{"kid": "new"}, {"kid": "old"}]})
        cache = JWKSCache("https://pool.example/jwks")
        cache._keys = [{"kid": "old"}]
        cache._by_kid = {"old": cache._keys[0]}
        cache._fetched_at = time.monotonic()
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            results = await asyncio.gather(*[cache.get_key("new", http_client=client) for _ in range(12)])
        assert all(r["kid"] == "new" for r in results)
        assert len(calls) == 1
    asyncio.run(run())


def test_random_unknown_kids_are_rate_limited_including_failed_refreshes():
    async def run():
        calls = []
        def respond(request):
            calls.append(request.url)
            return httpx.Response(503)
        cache = JWKSCache("https://pool.example/jwks")
        cache._keys = [{"kid": "old"}]
        cache._by_kid = {"old": cache._keys[0]}
        cache._fetched_at = time.monotonic()
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            with pytest.raises(httpx.HTTPStatusError):
                await cache.get_key("random1", http_client=client)
            with pytest.raises(KeyError):
                await cache.get_key("random2", http_client=client)
            assert (await cache.get_key("old", http_client=client))["kid"] == "old"
            cache._last_forced_refresh -= 31
            with pytest.raises(httpx.HTTPStatusError):
                await cache.get_key("random3", http_client=client)
        assert len(calls) == 2
    asyncio.run(run())
