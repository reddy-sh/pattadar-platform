"""Scoped storage never accepts a public owner ID, file ID or upstream URL."""
import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.routes import capabilities as r

TOKEN = 'a' * 43


def client():
    app = FastAPI()
    app.include_router(r.router)
    return TestClient(app)


def test_file_uses_private_grant_and_forces_safe_download(monkeypatch):
    calls = []
    async def api(method, path, body=None):
        calls.append((method, path, body))
        return httpx.Response(200, json={'owner':'actual-owner', 'fileRef':'actual-file'})
    class Storage:
        def read_content(self, owner, node, version):
            assert (owner,node,version) == ('actual-owner','actual-file',None)
            return b'<script>attack()</script>', 'text/html', 'uploaded.html'
    monkeypatch.setattr(r, '_api', api)
    monkeypatch.setattr(r, 'get_storage', lambda: Storage())
    response = client().get(f'/api/gateway/capabilities/shares/{TOKEN}/files/doc-a?owner=attacker&fileRef=secret',
        headers={'x-user-id':'attacker','authorization':'Bearer forged'})
    assert response.status_code == 200
    assert calls == [('GET',f'/internal/capabilities/shares/{TOKEN}/files/doc-a',None)]
    assert response.headers['cache-control'] == 'no-store'
    assert response.headers['content-disposition'].startswith('attachment;')
    assert 'sandbox' in response.headers['content-security-policy']


def test_revoked_file_never_reads_storage(monkeypatch):
    async def api(*args):
        return httpx.Response(410, json={'detail':'Revoked'})
    monkeypatch.setattr(r, '_api', api)
    def forbidden():
        raise AssertionError('Storage cannot be reached after grant refusal')
    monkeypatch.setattr(r, 'get_storage', forbidden)
    assert client().get(f'/api/gateway/capabilities/work/{TOKEN}/files/doc-a').status_code == 410


def test_upload_ignores_client_supplied_storage_reference(monkeypatch):
    calls = []
    async def api(method, path, body=None):
        calls.append((method,path,body))
        if method == 'GET':
            return httpx.Response(200, json={'owner':'actual-owner'})
        return httpx.Response(200, json={'ok':True})
    class Storage:
        def create_file(self, owner, parent, name, data, mime, actor, **kwargs):
            assert owner == 'actual-owner' and data == b'paper'
            assert kwargs['on_conflict'] == 'duplicate'
            return {'id':'fresh-node','name':name,'mimeType':mime}
    monkeypatch.setattr(r, '_api', api)
    monkeypatch.setattr(r, 'get_storage', lambda: Storage())
    response = client().post(f'/api/gateway/capabilities/work/{TOKEN}/deliverables',
        data={'label':'Work done','fileRef':'victim-secret','owner':'victim'},
        files={'file':('survey.pdf',b'paper','application/pdf')})
    assert response.status_code == 200
    assert calls[-1][2]['fileRef'] == 'fresh-node'
    assert 'owner' not in calls[-1][2]


def test_invalid_scope_or_token_never_calls_private_api(monkeypatch):
    async def fail(*args):
        raise AssertionError('Invalid token reached the API')
    monkeypatch.setattr(r, '_api', fail)
    with client() as test:
        assert test.get(f'/api/gateway/capabilities/anything/{TOKEN}').status_code == 404
        assert test.get('/api/gateway/capabilities/shares/short').status_code == 404
