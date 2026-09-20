"""What it costs to hand a document over, and what is left behind afterwards.

Three separate defects met on this one route:

- a conditional request paid for the whole object. The ETag was hashed from the
  bytes, so answering "you already have this" required downloading the thing
  the caller already had, and a forty-card property grid did that per tile.
- the bytes came back inline with the type the uploader had claimed, and an
  anonymous work-token holder can put a file in an owner's drive.
- nothing recorded that a copy of the paper left. The owner could not answer
  "who downloaded this deed", which is the whole promise of the ledger.

And one next door: the share check in `list_nodes` ran its three blocking
queries straight on the event loop of a single-worker service.
"""
import asyncio
import io
import logging

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src import internal_api
from src.auth import require_auth
from src.routes import storage as r


def _jpeg() -> bytes:
    """A real one — the thumbnail path decodes what it is given."""
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (64, 48), (120, 90, 40)).save(buf, format="JPEG")
    return buf.getvalue()


JPEG = _jpeg()


class Storage:
    """A readable file, counting what each request actually costs."""

    def __init__(self, mime="image/jpeg", name="deed.jpg"):
        self.mime, self.name = mime, name
        self.objects_read = 0

    def content_identity(self, caller, node_id, version_id=None):
        return "version-7", "papers/version-7", self.mime, self.name, "owner-a"

    def read_object(self, object_key):
        self.objects_read += 1
        return JPEG


@pytest.fixture
def audited(monkeypatch):
    events = []

    async def record(action, **fields):
        events.append({"action": action, **fields})

    monkeypatch.setattr(r, "record_audit", record)
    return events


def client(monkeypatch, storage):
    monkeypatch.setattr(r, "get_storage", lambda: storage)
    monkeypatch.setattr(r, "extract_user_id", lambda request: "reader-b")
    app = FastAPI()
    app.include_router(r.router)
    app.dependency_overrides[require_auth] = lambda: {}
    return TestClient(app)


def test_a_304_never_touches_the_object_store(monkeypatch, audited):
    storage = Storage()
    with client(monkeypatch, storage) as test:
        first = test.get("/api/gateway/storage/files/node-1/content")
        assert first.status_code == 200
        again = test.get(
            "/api/gateway/storage/files/node-1/content",
            headers={"if-none-match": first.headers["etag"]},
        )
    assert again.status_code == 304
    assert storage.objects_read == 1


def test_the_tag_follows_the_version_not_the_transform_output(monkeypatch, audited):
    """A thumbnail and its original must never answer each other's request."""
    with client(monkeypatch, Storage()) as test:
        full = test.get("/api/gateway/storage/files/node-1/content")
        thumb = test.get("/api/gateway/storage/files/node-1/content?thumb=512")
    assert full.headers["etag"] != thumb.headers["etag"]


def test_a_pinned_version_is_cached_as_the_immutable_thing_it_is(monkeypatch, audited):
    with client(monkeypatch, Storage()) as test:
        live = test.get("/api/gateway/storage/files/node-1/content")
        pinned = test.get("/api/gateway/storage/files/node-1/content?version=version-7")
    assert "must-revalidate" in live.headers["cache-control"]
    assert "immutable" in pinned.headers["cache-control"]


def test_an_uploaders_html_is_handed_over_never_rendered(monkeypatch, audited):
    """The type is the uploader's word, and a work-token holder is anonymous."""
    with client(monkeypatch, Storage("text/html", "note.html")) as test:
        response = test.get("/api/gateway/storage/files/node-1/content")
    assert response.headers["content-disposition"].startswith("attachment;")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "sandbox" in response.headers["content-security-policy"]


def test_a_photograph_still_opens_in_place(monkeypatch, audited):
    with client(monkeypatch, Storage()) as test:
        response = test.get("/api/gateway/storage/files/node-1/content")
    assert response.headers["content-disposition"].startswith("inline;")
    assert response.headers["x-content-type-options"] == "nosniff"


def test_the_download_is_recorded_against_the_files_owner(monkeypatch, audited):
    """The reader is not always the owner — a share makes them different people,
    and it is the owner's ledger the entry has to appear in."""
    with client(monkeypatch, Storage()) as test:
        assert test.get("/api/gateway/storage/files/node-1/content").status_code == 200
    assert audited == [{
        "action": "download_document",
        "actor_id": "reader-b",
        "actor_kind": "owner",
        "resource_type": "document",
        "resource_id": "node-1",
        "affected_owner": "owner-a",
        "metadata": {"doc_kind": "photo"},
    }]


def test_a_revalidation_is_not_a_second_download(monkeypatch, audited):
    """304 hands over no bytes, so it is not an extraction to record."""
    with client(monkeypatch, Storage()) as test:
        first = test.get("/api/gateway/storage/files/node-1/content")
        test.get(
            "/api/gateway/storage/files/node-1/content",
            headers={"if-none-match": first.headers["etag"]},
        )
    assert len(audited) == 1


def test_a_failing_ledger_never_fails_the_download(monkeypatch, caplog):
    """The route hands the real ingest call to the background, so the promise
    has to hold there: an api that cannot be reached costs a warning, never the
    reader's paper."""

    class Unreachable:
        async def post(self, *_args, **_kwargs):
            raise httpx.ConnectError("outbox is down")

    monkeypatch.setenv("API_BASE_URL", "http://api.internal")
    monkeypatch.setattr(internal_api.auth, "proxy_client", Unreachable())
    with client(monkeypatch, Storage()) as test, caplog.at_level(logging.WARNING):
        response = test.get("/api/gateway/storage/files/node-1/content")
    assert response.status_code == 200 and response.content == JPEG
    assert "audit.ingest_failed" in caplog.text


def test_the_share_check_is_not_run_on_the_event_loop(monkeypatch, audited):
    """`_access` walks the ancestor chain with up to three blocking queries. On
    the loop of a single-worker gateway that stalls auth, proxy and SSE too."""
    threads = []

    class Shared(Storage):
        def _access(self, caller, node_id):
            try:
                asyncio.get_running_loop()
                threads.append("event-loop")
            except RuntimeError:
                threads.append("worker")
            return "view"

        def list_shared_children(self, caller, parent_id):
            return [{"id": "child-1"}]

    with client(monkeypatch, Shared()) as test:
        response = test.get("/api/gateway/storage/nodes?parent=folder-1")
    assert response.status_code == 200
    assert threads == ["worker"]
