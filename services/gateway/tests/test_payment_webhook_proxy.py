"""Only the exact provider callback bypasses session authentication."""
import httpx
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from src import auth
from src.routes import proxy


@pytest.fixture
def client(monkeypatch):
    async def validate(request, strict=True):
        if strict or request.headers.get('authorization'):
            raise HTTPException(401, 'Authentication required')
        return None
    monkeypatch.setattr(auth, 'validate_bearer', validate)
    monkeypatch.setenv('API_BASE_URL', 'http://private-api')
    calls = []
    class Upstream:
        async def request(self, method, url, **kwargs):
            calls.append((method, url, kwargs))
            return httpx.Response(200, json={'received': True})
    monkeypatch.setattr(auth, 'proxy_client', Upstream())
    app = FastAPI()
    app.include_router(proxy.router)
    with TestClient(app) as browser:
        yield browser, calls


def test_public_callback_preserves_signed_bytes_and_strips_forged_owner(client):
    browser, calls = client
    body = b'{ "event": "payment.captured" }\n'
    result = browser.post('/api/gateway/pattadar/payments/webhook', content=body, headers={
        'x-razorpay-signature': 'provider-signature', 'x-user-id': 'another-owner',
        'content-type': 'application/json',
    })
    assert result.status_code == 200
    assert len(calls) == 1
    assert calls[0][2]['content'] == body
    assert calls[0][2]['headers']['x-razorpay-signature'] == 'provider-signature'
    assert 'x-user-id' not in calls[0][2]['headers']


@pytest.mark.parametrize('method,path', [
    ('GET', 'payments/webhook'), ('POST', 'payments/webhook/extra'),
    ('POST', 'payments/tickets/ticket/checkout'), ('GET', 'payments/tickets/ticket'),
])
def test_other_payment_routes_remain_authenticated(client, method, path):
    browser, calls = client
    assert browser.request(method, '/api/gateway/pattadar/' + path).status_code == 401
    assert calls == []


def test_invalid_presented_session_is_not_treated_as_anonymous(client):
    browser, calls = client
    assert browser.post('/api/gateway/pattadar/payments/webhook', headers={'authorization':'Bearer invalid'}).status_code == 401
    assert calls == []
