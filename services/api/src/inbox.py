"""The owner's inbox, and browser push that points at it.

Why this exists: a document reading takes a minute or more, and the Add
property drawer was the only thing waiting for it. Close the drawer and the
server still finished the reading — durably, in `document_read_jobs` — but
nothing ever told the owner. Now the worker that finishes a reading writes one
row here, the web shows it in the bell and on /app/notifications, and a
browser that opted in gets a push.

Cost: no new service. Rows are written by the reading worker that already runs
in this process; the web asks for them only while a reading is in flight or
when the tab regains focus.

Privacy: a push carries NO payload. Push messages travel through Google,
Mozilla, Microsoft or Apple servers, so nothing about the document — not its
name, not what it says — is put in one. The service worker shows a fixed
sentence and the app, signed in, fetches the detail from here. Because the
message is empty, no message encryption is needed either: only the VAPID
signature (RFC 8292), which `cryptography` already provides.

Env (push is off unless all three are set):
  VAPID_PUBLIC_KEY   base64url, 65-byte uncompressed P-256 point
  VAPID_PRIVATE_KEY  base64url, 32-byte P-256 private scalar
  VAPID_SUBJECT      mailto: or https: contact for the push services
Generate a pair with scripts/vapid-keys.py.
"""
import asyncio
import base64
import json
import logging
import os
import time
import uuid
from typing import List, Optional
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter()
pool = None
log = logging.getLogger("pattadar.inbox")

#: The only reading that raises a notification: one started from Add property,
#: the flow a person walks away from. A deed read inside a record's Documents
#: tab is watched where it was started, and an Aadhaar reading is a one-use
#: identifier that must never be announced.
PURPOSES = {"add-property"}
KEEP_DAYS = 30
LIST_LIMIT = 30

DDL = """
CREATE TABLE IF NOT EXISTS inbox_items (
 id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, kind TEXT NOT NULL,
 title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', job_id TEXT NOT NULL DEFAULT '',
 ok BOOLEAN NOT NULL DEFAULT true, read_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inbox_items_owner ON inbox_items(owner_user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS inbox_items_job ON inbox_items(owner_user_id, job_id) WHERE job_id <> '';
CREATE TABLE IF NOT EXISTS push_subscriptions (
 endpoint TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_owner ON push_subscriptions(owner_user_id);
"""

#: Where a browser's push service lives. A subscription endpoint is a URL the
#: SERVER will POST to, so an arbitrary one is a server-side request forgery
#: handle; only the four browser push services are accepted.
PUSH_HOSTS = ("fcm.googleapis.com", "push.services.mozilla.com",
              "notify.windows.com", "push.apple.com")


def bind(db_pool) -> None:
    global pool
    pool = db_pool


async def ensure_schema(conn) -> None:
    await conn.execute(DDL)


def owner(request: Request) -> str:
    uid = request.headers.get("x-user-id", "").strip()
    if not uid:
        raise HTTPException(401, "Sign in to see your notifications")
    return uid


# ── Writing: called by the reading worker ────────────────────────────────

async def reading_finished(conn, job: dict, ok: bool) -> bool:
    """Record that a reading the owner may have walked away from is over.

    Returns True when a row was written. Never raises: a notification that
    could not be written must not turn a finished reading into a failed one.
    """
    if (job.get("purpose") or "") not in PURPOSES:
        return False
    try:
        cur = await conn.execute(
            "INSERT INTO inbox_items (id, owner_user_id, kind, title, body, job_id, ok)"
            " VALUES (%s,%s,'reading',%s,%s,%s,%s)"
            " ON CONFLICT (owner_user_id, job_id) WHERE job_id <> '' DO NOTHING RETURNING id",
            (uuid.uuid4().hex, job["owner_user_id"],
             "Document read" if ok else "Document couldn't be read",
             (job.get("filename") or "")[:200], job["id"], ok))
        wrote = await cur.fetchone() is not None
    except Exception:  # noqa: BLE001
        log.exception("inbox.write_failed job=%s", job.get("id"))
        return False
    if wrote:
        _spawn(push_owner(job["owner_user_id"]))
    return wrote


_tasks: set = set()


def _spawn(coro) -> None:
    """Fire and forget, without the task being collected mid-flight."""
    try:
        task = asyncio.get_running_loop().create_task(coro)
    except RuntimeError:
        coro.close()
        return
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


async def sweep(conn) -> None:
    await conn.execute(
        "DELETE FROM inbox_items WHERE created_at < now()-make_interval(days => %s)", (KEEP_DAYS,))


# ── Reading: the web ─────────────────────────────────────────────────────

@router.get("/inbox")
async def list_inbox(request: Request):
    """The newest items, the unread count, and how many readings are still
    running — one call, so the web can decide whether to keep asking."""
    uid = owner(request)
    async with pool.connection() as conn:
        rows = await (await conn.execute(
            "SELECT id, kind, title, body, job_id, ok, read_at, created_at FROM inbox_items"
            " WHERE owner_user_id=%s ORDER BY created_at DESC LIMIT %s",
            (uid, LIST_LIMIT))).fetchall()
        unread = (await (await conn.execute(
            "SELECT count(*) AS n FROM inbox_items WHERE owner_user_id=%s AND read_at IS NULL",
            (uid,))).fetchone())["n"]
        running = (await (await conn.execute(
            "SELECT count(*) AS n FROM document_read_jobs WHERE owner_user_id=%s"
            " AND purpose = ANY(%s) AND state IN ('queued','running')"
            " AND created_at > now()-interval '1 day'",
            (uid, list(PURPOSES)))).fetchone())["n"]
    return {
        "unread": int(unread), "running": int(running),
        "items": [{
            "id": r["id"], "kind": r["kind"], "title": r["title"], "body": r["body"],
            "jobId": r["job_id"], "ok": bool(r["ok"]), "read": r["read_at"] is not None,
            "createdAt": r["created_at"].isoformat() if r["created_at"] else "",
        } for r in rows],
    }


class MarkRead(BaseModel):
    ids: List[str] = Field(default_factory=list, max_length=100)
    jobId: str = Field(default="", max_length=64)
    all: bool = False


@router.post("/inbox/read")
async def mark_read(body: MarkRead, request: Request):
    uid = owner(request)
    async with pool.connection() as conn:
        if body.all:
            cur = await conn.execute(
                "UPDATE inbox_items SET read_at=now() WHERE owner_user_id=%s AND read_at IS NULL", (uid,))
        elif body.jobId:
            cur = await conn.execute(
                "UPDATE inbox_items SET read_at=now() WHERE owner_user_id=%s AND job_id=%s"
                " AND read_at IS NULL", (uid, body.jobId))
        elif body.ids:
            cur = await conn.execute(
                "UPDATE inbox_items SET read_at=now() WHERE owner_user_id=%s AND id = ANY(%s)"
                " AND read_at IS NULL", (uid, body.ids))
        else:
            raise HTTPException(400, "Say which notifications to mark as read")
    return {"marked": cur.rowcount}


# ── Browser push ─────────────────────────────────────────────────────────

def _b64d(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def vapid_keys() -> Optional[tuple]:
    """(public_b64url, private_key, subject), or None when push is off."""
    pub = (os.getenv("VAPID_PUBLIC_KEY") or "").strip()
    priv = (os.getenv("VAPID_PRIVATE_KEY") or "").strip()
    sub = (os.getenv("VAPID_SUBJECT") or "").strip()
    if not (pub and priv and sub.startswith(("mailto:", "https:"))):
        return None
    try:
        from cryptography.hazmat.primitives.asymmetric import ec
        key = ec.derive_private_key(int.from_bytes(_b64d(priv), "big"), ec.SECP256R1())
    except Exception:  # noqa: BLE001
        log.error("push.vapid_key_invalid — browser push is off")
        return None
    return pub, key, sub


def vapid_header(endpoint: str, keys: tuple, now: Optional[int] = None) -> str:
    """`Authorization: vapid t=<jwt>, k=<public key>` for one push service."""
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
    pub, key, sub = keys
    parts = urlsplit(endpoint)
    claims = {"aud": f"{parts.scheme}://{parts.netloc}",
              "exp": int(now if now is not None else time.time()) + 12 * 3600, "sub": sub}
    signing = ".".join(_b64e(json.dumps(x, separators=(",", ":")).encode())
                       for x in ({"typ": "JWT", "alg": "ES256"}, claims))
    r, s = decode_dss_signature(key.sign(signing.encode(), ec.ECDSA(hashes.SHA256())))
    token = f"{signing}.{_b64e(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))}"
    return f"vapid t={token}, k={pub}"


def allowed_endpoint(endpoint: str) -> bool:
    if not endpoint or len(endpoint) > 1024:
        return False
    parts = urlsplit(endpoint)
    host = (parts.hostname or "").lower()
    return (parts.scheme == "https" and not parts.username and not parts.password
            and parts.port in (None, 443)
            and any(host == h or host.endswith("." + h) for h in PUSH_HOSTS))


async def push_owner(uid: str) -> int:
    """Wake every browser the owner subscribed. Returns how many accepted.

    One attempt per browser, never retried: the notice is a nudge, and the
    inbox row is the durable record whether or not the push arrives. A
    subscription the push service says is gone (404/410) is deleted.
    """
    keys = vapid_keys()
    if keys is None or pool is None:
        return 0
    async with pool.connection() as conn:
        subs = await (await conn.execute(
            "SELECT endpoint FROM push_subscriptions WHERE owner_user_id=%s", (uid,))).fetchall()
    sent = 0
    async with httpx.AsyncClient(timeout=10.0) as client:
        for row in subs:
            endpoint = row["endpoint"]
            if not allowed_endpoint(endpoint):
                continue
            try:
                r = await client.post(endpoint, content=b"", headers={
                    "Authorization": vapid_header(endpoint, keys),
                    "TTL": "86400", "Urgency": "normal", "Content-Length": "0"})
            except httpx.HTTPError as exc:
                log.warning("push.send_failed error=%s", type(exc).__name__)
                continue
            if r.status_code in (404, 410):
                async with pool.connection() as conn:
                    await conn.execute("DELETE FROM push_subscriptions WHERE endpoint=%s", (endpoint,))
            elif r.status_code < 300:
                sent += 1
            else:
                log.warning("push.rejected status=%s", r.status_code)
    return sent


@router.get("/push/key")
async def push_key(request: Request):
    owner(request)
    keys = vapid_keys()
    return {"enabled": keys is not None, "key": keys[0] if keys else ""}


class Subscription(BaseModel):
    endpoint: str = Field(max_length=1024)


@router.post("/push/subscribe")
async def subscribe(body: Subscription, request: Request):
    uid = owner(request)
    if vapid_keys() is None:
        raise HTTPException(503, "Browser notifications are not switched on yet")
    if not allowed_endpoint(body.endpoint):
        raise HTTPException(400, "That browser's push service is not supported")
    async with pool.connection() as conn:
        # One browser belongs to whoever signed in on it last.
        await conn.execute(
            "INSERT INTO push_subscriptions (endpoint, owner_user_id) VALUES (%s,%s)"
            " ON CONFLICT (endpoint) DO UPDATE SET owner_user_id=EXCLUDED.owner_user_id, created_at=now()",
            (body.endpoint, uid))
    return {"subscribed": True}


@router.post("/push/unsubscribe")
async def unsubscribe(body: Subscription, request: Request):
    uid = owner(request)
    async with pool.connection() as conn:
        cur = await conn.execute(
            "DELETE FROM push_subscriptions WHERE endpoint=%s AND owner_user_id=%s",
            (body.endpoint, uid))
    return {"removed": cur.rowcount}
