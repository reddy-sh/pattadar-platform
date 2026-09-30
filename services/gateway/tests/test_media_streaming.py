"""Secure audio/video Range delivery without changing image reads."""
import io

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.auth import require_auth
from src.routes import storage as r


class Body:
    def __init__(self, data: bytes):
        self._io = io.BytesIO(data)
        self.closed = False

    def read(self, size=-1):
        return self._io.read(size)

    def close(self):
        self.closed = True


class Storage:
    def __init__(self, data=b"0123456789", mime="video/mp4", name="field.mp4"):
        self.data, self.mime, self.name = data, mime, name
        self.ranges = []
        self.bodies = []
        self.full_reads = 0
        self.identities = 0

    def content_identity(self, caller, node_id, version_id=None):
        self.identities += 1
        return "00000000-0000-0000-0000-000000000007", "node/version", self.mime, self.name, "owner-a"

    def stat_object(self, key):
        return {"ContentLength": len(self.data)}

    def open_object(self, key, byte_range=None):
        self.ranges.append(byte_range)
        data = self.data
        if byte_range:
            start, end = [int(x) for x in byte_range.removeprefix("bytes=").split("-")]
            data = data[start:end + 1]
        body = Body(data)
        self.bodies.append(body)
        return {"Body": body, "ContentLength": len(data)}

    def read_object(self, key):
        self.full_reads += 1
        return self.data


def client(monkeypatch, storage, *, session=""):
    monkeypatch.setattr(r, "get_storage", lambda: storage)

    async def content_auth(_request, _node, _version):
        return "reader-b", session or None

    monkeypatch.setattr(r, "_content_auth", content_auth)
    async def audit(*_args, **_kwargs):
        return True

    monkeypatch.setattr(r, "record_audit", audit)
    monkeypatch.setattr(r.stream_sessions, "claim_first_use", lambda *a: True)
    monkeypatch.setattr(r.stream_sessions, "finish_audit", lambda *a: None)
    app = FastAPI()
    app.include_router(r.router)
    app.dependency_overrides[require_auth] = lambda: {"iss": "issuer", "sub": "subject"}
    return TestClient(app)


def test_video_range_is_forwarded_and_streamed(monkeypatch):
    storage = Storage()
    with client(monkeypatch, storage) as test:
        response = test.get(
            "/api/gateway/storage/files/00000000-0000-0000-0000-000000000001/content"
            "?version=00000000-0000-0000-0000-000000000007",
            headers={"range": "bytes=2-5"},
        )
    assert response.status_code == 206
    assert response.content == b"2345"
    assert response.headers["content-range"] == "bytes 2-5/10"
    assert response.headers["accept-ranges"] == "bytes"
    assert response.headers["content-length"] == "4"
    assert storage.ranges == ["bytes=2-5"]
    assert storage.full_reads == 0
    assert storage.bodies[0].closed


@pytest.mark.parametrize("value", ["items=0-1", "bytes=0-1,4-5", "bytes=20-", "bytes=5-2"])
def test_invalid_or_multiple_ranges_are_416_without_opening_s3(monkeypatch, value):
    storage = Storage()
    with client(monkeypatch, storage) as test:
        response = test.get(
            "/api/gateway/storage/files/00000000-0000-0000-0000-000000000001/content"
            "?version=00000000-0000-0000-0000-000000000007",
            headers={"range": value},
        )
    assert response.status_code == 416
    assert response.headers["content-range"] == "bytes */10"
    assert storage.ranges == []


def test_plain_image_read_keeps_the_existing_buffered_path(monkeypatch):
    storage = Storage(data=b"image", mime="image/jpeg", name="field.jpg")
    with client(monkeypatch, storage) as test:
        response = test.get("/api/gateway/storage/files/node/content")
    assert response.status_code == 200
    assert response.content == b"image"
    assert storage.full_reads == 1
    assert storage.ranges == []


def test_stream_session_is_exact_path_httponly_and_pins_version(monkeypatch):
    storage = Storage()
    monkeypatch.setattr(r, "get_storage", lambda: storage)
    monkeypatch.setattr(r, "extract_user_id", lambda request: "reader-b")
    monkeypatch.setattr(r.stream_sessions, "create", lambda claims, node, version: "opaque-secret")
    app = FastAPI()
    app.include_router(r.router)
    app.dependency_overrides[require_auth] = lambda: {"iss": "issuer", "sub": "subject"}
    with TestClient(app) as test:
        response = test.post("/api/gateway/storage/files/00000000-0000-0000-0000-000000000001/stream-session")
    assert response.status_code == 200
    assert "version=00000000-0000-0000-0000-000000000007" in response.json()["url"]
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie
    assert "path=/api/gateway/storage/files/00000000-0000-0000-0000-000000000001/content" in cookie
    assert "opaque-secret" in response.headers["set-cookie"]
    assert "opaque-secret" not in response.text


def test_head_returns_range_headers_without_opening_s3(monkeypatch):
    storage = Storage()
    with client(monkeypatch, storage) as test:
        response = test.head(
            "/api/gateway/storage/files/00000000-0000-0000-0000-000000000001/content"
            "?version=00000000-0000-0000-0000-000000000007"
        )
    assert response.status_code == 200
    assert response.headers["accept-ranges"] == "bytes"
    assert response.headers["content-length"] == "10"
    assert storage.ranges == [] and storage.full_reads == 0


@pytest.mark.parametrize(("name", "expected"), [
    ("field.mp4", "video/mp4"),
    ("field.3gp", "video/3gpp"),
    ("call.m4a", "audio/mp4"),
])
def test_generic_media_mime_is_mapped_for_nosniff_browser_playback(monkeypatch, name, expected):
    storage = Storage(mime="application/octet-stream", name=name)
    with client(monkeypatch, storage) as test:
        response = test.get(
            "/api/gateway/storage/files/00000000-0000-0000-0000-000000000001/content"
            "?version=00000000-0000-0000-0000-000000000007",
            headers={"range": "bytes=0-1"},
        )
    assert response.status_code == 206
    assert response.headers["content-type"].startswith(expected)
    assert response.headers["x-content-type-options"] == "nosniff"


@pytest.mark.parametrize(("mime", "name", "expected"), [
    ("image/jpeg", "field.mp4", "video/mp4"),
    ("application/pdf", "call.m4a", "audio/mp4"),
])
def test_known_media_extension_corrects_conflicting_stored_mime(monkeypatch, mime, name, expected):
    storage = Storage(mime=mime, name=name)
    with client(monkeypatch, storage) as test:
        response = test.get(
            "/api/gateway/storage/files/00000000-0000-0000-0000-000000000001/content"
            "?version=00000000-0000-0000-0000-000000000007",
            headers={"range": "bytes=0-1"},
        )
    assert response.status_code == 206
    assert response.headers["content-type"].startswith(expected)
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-security-policy"] == "sandbox; default-src 'none'"


def test_claim_failure_closes_the_already_open_s3_body(monkeypatch):
    storage = Storage()

    def fail_claim(*_args):
        raise RuntimeError("database unavailable")

    test = client(monkeypatch, storage, session="cookie-secret")
    monkeypatch.setattr(r.stream_sessions, "claim_first_use", fail_claim)
    with test:
        response = test.get(
            "/api/gateway/storage/files/00000000-0000-0000-0000-000000000001/content"
            "?version=00000000-0000-0000-0000-000000000007",
            headers={"range": "bytes=0-1"},
        )
    assert response.status_code == 500
    assert storage.bodies and storage.bodies[0].closed


def test_presented_authorization_never_downgrades_to_cookie(monkeypatch):
    request = type("Request", (), {
        "headers": {"authorization": "Basic nope"},
        "cookies": {r.stream_sessions.COOKIE_NAME: "valid-cookie"},
    })()

    async def reject(_request, strict=True):
        assert strict is True
        raise r.HTTPException(401, "invalid")

    monkeypatch.setattr(r.auth, "validate_bearer", reject)
    with pytest.raises(r.HTTPException) as error:
        import asyncio
        asyncio.run(r._content_auth(request, "node", "version"))
    assert error.value.status_code == 401
