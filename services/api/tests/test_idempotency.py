"""The idempotency layer's decision logic is pure functions, so most of this
file runs with no database at all. The end-to-end claim/replay flows need the
local Postgres and skip cleanly when it is absent (phone-local stack down)."""

import sys
import json
import uuid
import asyncio
from pathlib import Path
from datetime import datetime, timedelta

import pytest
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import main
from src.main import (
    IdempotencyMiddleware,
    _idem_classify,
    _idem_duplicate_verdict,
    _idem_errors_body,
    _idem_is_mutation,
    _idem_operation,
    _idem_stale,
    _idem_success,
    _idem_sweep_cutoff,
    _IDEM_MAX_RESPONSE,
)

NOW = datetime(2026, 8, 14, 12, 0, 0)
MUTATION = 'mutation CreateThing { createThing { id } }'


def _body(query: str) -> bytes:
    return json.dumps({"query": query}).encode()


def _headers(key: str = "k1", uid: str = "u01") -> dict:
    h = {"content-type": "application/json"}
    if key is not None:
        h["x-idempotency-key"] = key
    if uid is not None:
        h["x-user-id"] = uid
    return h


# ── Pure decision logic ───────────────────────────────────────────────

def test_is_mutation_forms():
    assert _idem_is_mutation("mutation { x }")
    assert _idem_is_mutation("  \n\t mutation Named($v: Int) { x }")
    assert not _idem_is_mutation("query { me { id } }")
    assert not _idem_is_mutation("query IntrospectionQuery { __schema { types { name } } }")
    assert not _idem_is_mutation("{ me { id } }")  # anonymous-query shorthand
    assert not _idem_is_mutation("mutations { x }")  # \b: no partial keyword
    assert not _idem_is_mutation("")
    assert not _idem_is_mutation(None)
    # Comment-led documents deliberately pass unguarded (fail open, never
    # misclassify): the clients we ship never prefix mutations with comments.
    assert not _idem_is_mutation("# retry\nmutation M { x }")


def test_operation_name_extraction():
    assert _idem_operation("mutation CreatePassbook($a: X) { x }") == "CreatePassbook"
    assert _idem_operation("  mutation _under_score2 { x }") == "_under_score2"
    # Anonymous forms fall back to a short, deterministic content hash.
    h = _idem_operation("mutation { x }")
    assert len(h) == 12 and h == _idem_operation("mutation { x }")
    assert _idem_operation("mutation ($v: Int) { x }") != h
    assert _idem_operation("mutation ($v: Int) { x }").isalnum()


def test_classify_requires_key_and_mutation():
    assert _idem_classify(_body(MUTATION), _headers(key=None)) is None
    assert _idem_classify(_body(MUTATION), _headers(key="")) is None
    assert _idem_classify(_body(MUTATION), _headers(key="   ")) is None
    assert _idem_classify(_body("query { me { id } }"), _headers()) is None


def test_classify_tolerates_bad_bodies():
    assert _idem_classify(b"not json at all", _headers()) is None
    assert _idem_classify(b"[1, 2, 3]", _headers()) is None
    assert _idem_classify(json.dumps({"query": 42}).encode(), _headers()) is None
    assert _idem_classify(json.dumps({"notquery": MUTATION}).encode(), _headers()) is None


def test_classify_guards_mutations():
    assert _idem_classify(_body(MUTATION), _headers()) == ("u01", "k1", "CreateThing")
    # No user header → the gateway sent a system call; keys still scope safely.
    assert _idem_classify(_body(MUTATION), _headers(uid=None)) == ("system", "k1", "CreateThing")
    assert _idem_classify(_body(MUTATION), _headers(uid="  ")) == ("system", "k1", "CreateThing")


def test_sweep_cutoff_format():
    cutoff = _idem_sweep_cutoff(NOW)
    assert cutoff == "2026-08-07T12:00:00"
    # Text comparison must equal time comparison for rows written via isoformat.
    assert cutoff < NOW.isoformat()
    assert cutoff > (NOW - timedelta(days=8)).isoformat()


def test_stale_claim_boundary():
    assert not _idem_stale((NOW - timedelta(seconds=299)).isoformat(), NOW)
    assert _idem_stale((NOW - timedelta(seconds=300)).isoformat(), NOW)  # >= TTL
    assert _idem_stale((NOW - timedelta(seconds=301)).isoformat(), NOW)
    assert _idem_stale("garbage-timestamp", NOW)
    assert _idem_stale("", NOW)


def test_duplicate_verdicts():
    done = {"status": "completed", "response": '{"data":{"ok":true}}',
            "created_at": NOW.isoformat()}
    assert _idem_duplicate_verdict(done, NOW) == ("replay", b'{"data":{"ok":true}}')

    # Completed but unreplayable is 'gone' — the client must never retry it.
    oversize = dict(done, response=None)
    verdict, body = _idem_duplicate_verdict(oversize, NOW)
    assert verdict == "gone" and b"response too large" in body

    fresh = {"status": "pending", "response": None,
             "created_at": (NOW - timedelta(seconds=30)).isoformat()}
    verdict, body = _idem_duplicate_verdict(fresh, NOW)
    assert verdict == "conflict" and b"duplicate request in flight" in body

    # A stale pending claim is never re-run (the worker may have committed
    # before dying) — it gets sealed by the middleware, not taken over.
    stale = dict(fresh, created_at=(NOW - timedelta(minutes=10)).isoformat())
    assert _idem_duplicate_verdict(stale, NOW) == ("expire", None)


def test_success_gate():
    assert _idem_success(200, b'{"data":{"ok":true}}')
    assert _idem_success(200, b'{"data":null,"errors":[]}')  # empty errors = clean
    assert not _idem_success(200, b'{"errors":[{"message":"boom"}]}')
    assert not _idem_success(500, b'{"data":{"ok":true}}')
    assert not _idem_success(200, b"<html>proxy error</html>")
    assert not _idem_success(200, b"[1]")


def test_errors_body_is_graphql_shaped():
    parsed = json.loads(_idem_errors_body("nope"))
    assert parsed == {"errors": [{"message": "nope"}]}


# ── Middleware plumbing (offline: no DB is touched on these paths) ────

def _stub(status: int, body: bytes, calls: list):
    async def asgi(scope, receive, send):
        calls.append(scope["path"])
        msg = await receive()
        assert msg["type"] == "http.request"
        await send({"type": "http.response.start", "status": status,
                    "headers": [(b"content-type", b"application/json")]})
        await send({"type": "http.response.body", "body": body})
    return asgi


async def _call(mw, body: bytes, headers: dict, method: str = "POST",
                path: str = "/graphql"):
    scope = {"type": "http", "method": method, "path": path,
             "headers": [(k.encode(), v.encode()) for k, v in headers.items()]}
    sent = []
    delivered = False

    async def receive():
        nonlocal delivered
        if delivered:
            return {"type": "http.disconnect"}
        delivered = True
        return {"type": "http.request", "body": body, "more_body": False}

    await mw(scope, receive, _collector(sent))
    status = next(m["status"] for m in sent if m["type"] == "http.response.start")
    hdrs = {k.decode(): v.decode() for m in sent if m["type"] == "http.response.start"
            for k, v in m["headers"]}
    out = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
    return status, hdrs, out


def _collector(sent):
    async def send(msg):
        sent.append(msg)
    return send


def test_passthrough_paths_never_touch_db():
    downstream_body = b'{"data":{"ok":true}}'

    def run(body, headers, **kw):
        calls = []
        mw = IdempotencyMiddleware(_stub(200, downstream_body, calls))
        status, _, out = asyncio.run(_call(mw, body, headers, **kw))
        return status, out, calls

    # No key header → straight through.
    status, out, calls = run(_body(MUTATION), _headers(key=None))
    assert (status, out, len(calls)) == (200, downstream_body, 1)
    # Key present but it's a query → straight through.
    status, out, calls = run(_body("query { me { id } }"), _headers())
    assert (status, out, len(calls)) == (200, downstream_body, 1)
    # Key present but malformed JSON → let the router reject it.
    status, out, calls = run(b"not json", _headers())
    assert (status, out, len(calls)) == (200, downstream_body, 1)
    # Wrong path / wrong method → not our concern.
    status, out, calls = run(_body(MUTATION), _headers(), path="/health")
    assert (status, out, len(calls)) == (200, downstream_body, 1)
    status, out, calls = run(_body(MUTATION), _headers(), method="GET")
    assert (status, out, len(calls)) == (200, downstream_body, 1)


def test_replayed_receive_delegates_to_server():
    # Once the buffered body has been handed out, further receive() calls must
    # reach the server's own receive — a downstream that polls for disconnect
    # (Starlette streaming does) must NOT see a synthetic instant hangup.
    seen = []

    async def polling_app(scope, receive, send):
        assert (await receive())["type"] == "http.request"
        seen.append(await receive())
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"{}"})

    calls = 0

    async def outer_receive():
        nonlocal calls
        calls += 1
        if calls == 1:
            return {"type": "http.request",
                    "body": _body("query { me { id } }"), "more_body": False}
        return {"type": "http.disconnect", "marker": "from-server"}

    async def run():
        mw = IdempotencyMiddleware(polling_app)
        scope = {"type": "http", "method": "POST", "path": "/graphql",
                 "headers": [(k.encode(), v.encode()) for k, v in _headers().items()]}
        sent = []
        await mw(scope, outer_receive, _collector(sent))

    asyncio.run(run())
    assert seen == [{"type": "http.disconnect", "marker": "from-server"}]


def test_fails_open_when_pool_is_down():
    # The module pool is never opened in this test process, so the claim
    # INSERT raises — the middleware must log and run the request unguarded.
    downstream_body = b'{"data":{"ok":true}}'
    calls = []
    mw = IdempotencyMiddleware(_stub(200, downstream_body, calls))
    status, _, out = asyncio.run(_call(mw, _body(MUTATION), _headers()))
    assert (status, out, len(calls)) == (200, downstream_body, 1)


# ── Live claim/replay flows (skip without the local Postgres) ─────────

try:
    with psycopg.connect(main.DSN, connect_timeout=2):
        DB_AVAILABLE = True
except Exception:
    DB_AVAILABLE = False

_IDEM_DDL = """
    CREATE TABLE IF NOT EXISTS idempotency_keys (
        owner_user_id TEXT NOT NULL,
        key TEXT NOT NULL,
        operation TEXT NOT NULL,
        status TEXT NOT NULL,
        response TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (owner_user_id, key)
    )
"""


def _db_flow(fn):
    """Run one flow against the real table on a private pool, swapped into
    main.pool for the duration (the middleware resolves it at call time)."""
    if not DB_AVAILABLE:
        pytest.skip("local Postgres not available")

    async def wrapper():
        test_pool = AsyncConnectionPool(
            conninfo=main.DSN, min_size=1, max_size=2, open=False,
            kwargs={"row_factory": dict_row, "autocommit": True})
        await test_pool.open(wait=True, timeout=5)
        prev, main.pool = main.pool, test_pool
        uid = "idem-test-" + uuid.uuid4().hex[:8]
        try:
            async with test_pool.connection() as conn:
                await conn.execute(_IDEM_DDL)
            await fn(uid, test_pool)
        finally:
            main.pool = prev
            try:
                async with test_pool.connection() as conn:
                    await conn.execute(
                        "DELETE FROM idempotency_keys WHERE owner_user_id=%s", (uid,))
            finally:
                await test_pool.close()

    asyncio.run(wrapper())


async def _fetch_row(pool, uid):
    async with pool.connection() as conn:
        cur = await conn.execute(
            "SELECT * FROM idempotency_keys WHERE owner_user_id=%s", (uid,))
        return await cur.fetchone()


def test_db_claim_then_complete():
    async def flow(uid, pool):
        ok_body = b'{"data":{"createThing":{"id":"t1"}}}'
        calls = []
        mw = IdempotencyMiddleware(_stub(200, ok_body, calls))
        status, _, out = await _call(mw, _body(MUTATION), _headers(uid=uid))
        assert (status, out, len(calls)) == (200, ok_body, 1)
        row = await _fetch_row(pool, uid)
        assert row["status"] == "completed"
        assert row["response"] == ok_body.decode()
        assert row["operation"] == "CreateThing"

    _db_flow(flow)


def test_db_error_releases_claim():
    async def flow(uid, pool):
        err_body = b'{"errors":[{"message":"boom"}]}'
        calls = []
        mw = IdempotencyMiddleware(_stub(200, err_body, calls))
        status, _, out = await _call(mw, _body(MUTATION), _headers(uid=uid))
        # The client still sees the error; the claim is gone so a genuine
        # retry with the same key re-executes.
        assert (status, out, len(calls)) == (200, err_body, 1)
        assert await _fetch_row(pool, uid) is None

    _db_flow(flow)


def test_db_duplicate_replays_without_reexecuting():
    async def flow(uid, pool):
        first_body = b'{"data":{"createThing":{"id":"t1"}}}'
        await _call(IdempotencyMiddleware(_stub(200, first_body, [])),
                    _body(MUTATION), _headers(uid=uid))
        # The duplicate's downstream would answer differently — it must never run.
        calls = []
        mw = IdempotencyMiddleware(_stub(200, b'{"data":{"createThing":{"id":"t2"}}}', calls))
        status, hdrs, out = await _call(mw, _body(MUTATION), _headers(uid=uid))
        assert (status, out, calls) == (200, first_body, [])
        assert hdrs.get("x-idempotent-replay") == "1"

    _db_flow(flow)


def test_db_pending_duplicate_conflicts():
    async def flow(uid, pool):
        async with pool.connection() as conn:
            await conn.execute(
                "INSERT INTO idempotency_keys (owner_user_id, key, operation, status, created_at) "
                "VALUES (%s, 'k1', 'CreateThing', 'pending', %s)",
                (uid, datetime.utcnow().isoformat()))
        calls = []
        mw = IdempotencyMiddleware(_stub(200, b'{"data":{}}', calls))
        status, _, out = await _call(mw, _body(MUTATION), _headers(uid=uid))
        assert (status, calls) == (409, [])
        assert b"duplicate request in flight" in out

    _db_flow(flow)


def test_db_stale_pending_is_sealed_not_rerun():
    async def flow(uid, pool):
        # A worker that died mid-flight may have committed before settling —
        # the duplicate must NOT re-execute; it seals the claim and parks.
        async with pool.connection() as conn:
            await conn.execute(
                "INSERT INTO idempotency_keys (owner_user_id, key, operation, status, created_at) "
                "VALUES (%s, 'k1', 'CreateThing', 'pending', %s)",
                (uid, (datetime.utcnow() - timedelta(minutes=10)).isoformat()))
        calls = []
        mw = IdempotencyMiddleware(_stub(200, b'{"data":{}}', calls))
        status, _, out = await _call(mw, _body(MUTATION), _headers(uid=uid))
        assert (status, calls) == (410, [])
        assert b"check the vault" in out
        row = await _fetch_row(pool, uid)
        assert row["status"] == "completed" and row["response"] is None
        # Every later duplicate parks the same way, still without executing.
        calls = []
        status, _, out = await _call(IdempotencyMiddleware(_stub(200, b"{}", calls)),
                                     _body(MUTATION), _headers(uid=uid))
        assert (status, calls) == (410, [])

    _db_flow(flow)


def test_db_settle_stamp_mismatch_noops():
    async def flow(uid, pool):
        # A settle that arrives after its claim was recycled must not clobber
        # the row the new owner wrote — the stamp guard makes it a no-op.
        theirs = datetime.utcnow().isoformat()
        async with pool.connection() as conn:
            await conn.execute(
                "INSERT INTO idempotency_keys (owner_user_id, key, operation, status, created_at) "
                "VALUES (%s, 'k1', 'CreateThing', 'pending', %s)", (uid, theirs))
        mw = IdempotencyMiddleware(_stub(200, b"{}", []))
        ours = (datetime.utcnow() - timedelta(minutes=9)).isoformat()
        await mw._settle(uid, "k1", ours, ok=True, body=b'{"data":{"stale":true}}')
        row = await _fetch_row(pool, uid)
        assert row["status"] == "pending" and row["response"] is None
        await mw._settle(uid, "k1", ours, ok=False, body=b"")
        assert (await _fetch_row(pool, uid)) is not None
        # The rightful stamp still settles normally.
        await mw._settle(uid, "k1", theirs, ok=True, body=b'{"data":{"ok":true}}')
        row = await _fetch_row(pool, uid)
        assert row["status"] == "completed" and row["response"] == '{"data":{"ok":true}}'

    _db_flow(flow)


def test_db_oversize_response_completes_unreplayable():
    async def flow(uid, pool):
        big = ('{"data":{"blob":"' + "x" * (_IDEM_MAX_RESPONSE + 1024) + '"}}').encode()
        mw = IdempotencyMiddleware(_stub(200, big, []))
        status, _, out = await _call(mw, _body(MUTATION), _headers(uid=uid))
        assert (status, out) == (200, big)  # first caller still gets the body
        row = await _fetch_row(pool, uid)
        assert row["status"] == "completed" and row["response"] is None
        # The duplicate can neither replay nor re-execute: 410, park it.
        calls = []
        status, _, out = await _call(IdempotencyMiddleware(_stub(200, b"{}", calls)),
                                     _body(MUTATION), _headers(uid=uid))
        assert (status, calls) == (410, [])
        assert b"response too large" in out

    _db_flow(flow)
