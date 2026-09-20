"""
notify.py — the pattadar sending seam.

One helper per channel (email / SMS / WhatsApp). Each dispatches to a provider
chosen by env var; the **default is a `stub`** that records the message to the
`notification_log` table (and logs it) so the entire flow — invites, verification,
inactivity alerts — is testable end-to-end WITHOUT any external account. Set a
provider's credentials to go live; nothing else changes at the call sites.

Outside APP_ENV local/test the stub is a misconfiguration and not a mode: it
records a failed send and says so, instead of reporting a delivery that never
happened. Recipients and message text never reach stdout — a log line carries
the salted recipient handle only, because invites and dispatches carry live
bearer links in their body.

`notification_log` is the delivery outbox: a failure that can be replayed
exactly is re-driven by `retry_due` with a widening delay and dead-lettered
after MAX_ATTEMPTS, and `delivery_health` is the operator counter over both.
A send whose outcome is unknown is never re-driven — the provider may already
have accepted it.

Env (all optional; absent → stub):
  NOTIFY_EMAIL_PROVIDER = stub | resend   (+ RESEND_API_KEY, NOTIFY_EMAIL_FROM)
  NOTIFY_SMS_PROVIDER   = stub | msg91    (+ MSG91_AUTHKEY, MSG91_SENDER, MSG91_DLT_TEMPLATE_ID)
  NOTIFY_WA_PROVIDER    = stub | meta      (+ WHATSAPP_TOKEN, WHATSAPP_PHONE_ID)
"""

import logging
import os
import uuid
import hashlib
from datetime import datetime, timedelta, timezone

_log = logging.getLogger("pattadar.notify")

MAX_ATTEMPTS = 5
RETRY_MINUTES = 15
BODY_LIMIT = 4000

# The table itself is created with the rest of the application schema; these are
# the outbox columns notify.py owns.
SCHEMA = (
    "ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS next_at TEXT NOT NULL DEFAULT ''",
    "CREATE INDEX IF NOT EXISTS idx_notiflog_due ON notification_log(next_at) WHERE next_at <> ''",
)
_schema_ready = False


def _env(key: str, default: str = "") -> str:
    return (os.getenv(key) or default).strip()


def _local() -> bool:
    return _env("APP_ENV", "local").casefold() in {"local", "test"}


def _ref(owner: str, to: str) -> str:
    """A stable recipient handle for logs; the address itself never goes to stdout."""
    return f"recipient-{hashlib.sha256(f'{owner}:{to}'.encode()).hexdigest()[:12]}"


def _due(attempts: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=RETRY_MINUTES * attempts)).isoformat()


def _answer(response) -> dict:
    try:
        body = response.json()
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


async def ensure_schema(conn) -> None:
    global _schema_ready
    if _schema_ready:
        return
    for statement in SCHEMA:
        await conn.execute(statement)
    _schema_ready = True


async def _record(conn, channel: str, to: str, subject: str, body: str,
                  provider: str, status: str, error: str = "", owner: str = "",
                  next_at: str = "") -> None:
    await ensure_schema(conn)
    await conn.execute(
        "INSERT INTO notification_log (id, owner_user_id, channel, recipient, subject, body, provider, status, error, next_at, created_at) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (str(uuid.uuid4()), owner or "", channel, to or "", subject or "", (body or "")[:BODY_LIMIT],
         provider, status, (error or "")[:500], next_at, datetime.now(timezone.utc).isoformat()))


async def _complete(conn, channel: str, to: str, subject: str, body: str, owner: str,
                    ref: str, result: dict, *, replayable: bool) -> None:
    next_at = _due(1) if result["retryable"] and replayable else ""
    await _record(conn, channel, to, subject, body, result["provider"], result["status"],
                  result["error"], owner, next_at)
    if not result["ok"]:
        _log.warning("[notify:undelivered] channel=%s provider=%s status=%s recipient=%s retry=%s error=%s",
                     channel, result["provider"], result["status"], ref, bool(next_at), result["error"])


def _stub(channel: str, ref: str, detail: str = "") -> dict:
    if _local():
        _log.info("[notify:stub] %s recipient=%s %s", channel.upper(), ref, detail)
        return {"ok": True, "provider": "stub", "status": "logged", "error": "",
                "error_code": "", "retryable": False}
    return {"ok": False, "provider": "stub", "status": "failed",
            "error": "no notification provider is configured",
            "error_code": "provider_not_configured", "retryable": False}


async def _deliver_email(to: str, subject: str, html: str, ref: str, *,
                         idempotency_key: str = "", log_subject: str = "") -> dict:
    provider = _env("NOTIFY_EMAIL_PROVIDER", "stub")
    if provider == "resend" and _env("RESEND_API_KEY"):
        try:
            import httpx
            headers = {"Authorization": f"Bearer {_env('RESEND_API_KEY')}"}
            if idempotency_key:
                headers["Idempotency-Key"] = idempotency_key
            async with httpx.AsyncClient(timeout=15.0) as c:
                r = await c.post(
                    "https://api.resend.com/emails",
                    headers=headers,
                    json={"from": _env("NOTIFY_EMAIL_FROM", "Pattadar <no-reply@pattadar.com>"),
                          "to": [to], "subject": subject, "html": html})
            ok = r.status_code < 300
            code = "" if ok else f"http_{r.status_code}"
            return {"ok": ok, "provider": "resend", "status": "sent" if ok else "failed",
                    "error": code, "error_code": code, "retryable": not ok}
        except Exception as exc:  # noqa: BLE001
            # A transport exception can happen after the provider accepted the
            # request but before its response arrived. Automatic retry would
            # risk a duplicate; mark it ambiguous for explicit reconciliation.
            code = type(exc).__name__
            return {"ok": False, "provider": "resend", "status": "unknown", "error": code,
                    "error_code": code, "ambiguous": True, "retryable": False}
    return _stub("email", ref, f"subject={log_subject!r}")


async def _deliver_sms(to: str, text: str, ref: str) -> dict:
    provider = _env("NOTIFY_SMS_PROVIDER", "stub")
    if provider == "msg91" and _env("MSG91_AUTHKEY"):
        try:
            import httpx
            mobile = "".join(ch for ch in to if ch.isdigit())  # E.164 digits, no '+'
            async with httpx.AsyncClient(timeout=15.0) as c:
                r = await c.post(
                    "https://control.msg91.com/api/v5/flow/",
                    headers={"authkey": _env("MSG91_AUTHKEY"), "Content-Type": "application/json"},
                    json={"template_id": _env("MSG91_DLT_TEMPLATE_ID"),
                          "sender": _env("MSG91_SENDER", "RFCTRY"),
                          "recipients": [{"mobiles": mobile, "text": text}]})
            ok, error, code = r.status_code < 300, "", ""
            if not ok:
                error, code = r.text, f"http_{r.status_code}"
            else:
                # msg91 answers 200 with {"type":"error"} when it rejects the DLT
                # template or the recipient; only "success" is an accepted send.
                body = _answer(r)
                if str(body.get("type") or "").casefold() == "error":
                    ok, error, code = False, str(body.get("message") or "provider rejected the message"), "provider_rejected"
            return {"ok": ok, "provider": "msg91", "status": "sent" if ok else "failed",
                    "error": error, "error_code": code, "retryable": not ok}
        except Exception as exc:  # noqa: BLE001
            # The request may have reached the provider; repeating it would put a
            # second message on a real phone. Record it, never re-drive it.
            return {"ok": False, "provider": "msg91", "status": "failed", "error": str(exc),
                    "error_code": type(exc).__name__, "retryable": False}
    return _stub("sms", ref)


async def _deliver_whatsapp(to: str, text: str, template: str, params: list | None, ref: str) -> dict:
    provider = _env("NOTIFY_WA_PROVIDER", "stub")
    if provider == "meta" and _env("WHATSAPP_TOKEN") and _env("WHATSAPP_PHONE_ID"):
        try:
            import httpx
            mobile = "".join(ch for ch in to if ch.isdigit())
            # Business-initiated messages need an approved template; free text only
            # works inside the 24h service window.
            if template:
                payload = {"messaging_product": "whatsapp", "to": mobile, "type": "template",
                           "template": {"name": template, "language": {"code": "en"},
                                        "components": [{"type": "body",
                                                        "parameters": [{"type": "text", "text": str(p)} for p in (params or [])]}]}}
            else:
                payload = {"messaging_product": "whatsapp", "to": mobile, "type": "text",
                           "text": {"body": text}}
            async with httpx.AsyncClient(timeout=15.0) as c:
                r = await c.post(
                    f"https://graph.facebook.com/v20.0/{_env('WHATSAPP_PHONE_ID')}/messages",
                    headers={"Authorization": f"Bearer {_env('WHATSAPP_TOKEN')}"},
                    json=payload)
            ok = r.status_code < 300
            return {"ok": ok, "provider": "meta", "status": "sent" if ok else "failed",
                    "error": "" if ok else r.text, "error_code": "" if ok else f"http_{r.status_code}",
                    "retryable": not ok}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "provider": "meta", "status": "failed", "error": str(exc),
                    "error_code": type(exc).__name__, "retryable": False}
    return _stub("whatsapp", ref, f"template={template}")


async def send_email(conn, to: str, subject: str, html: str, owner: str = "", *,
                     idempotency_key: str = "", minimize_log: bool = False) -> dict:
    to = (to or "").strip()
    if not to:
        return {"ok": False, "error": "no recipient", "error_code": "no_recipient"}
    ref = _ref(owner, to)
    audit_to = ref if minimize_log else to
    audit_subject = "Pattadar safeguard notification" if minimize_log else subject
    audit_body = "[minimized inactivity notification]" if minimize_log else html
    result = await _deliver_email(to, subject, html, ref, idempotency_key=idempotency_key,
                                  log_subject=audit_subject)
    # A minimized row keeps only the recipient handle, so it cannot be replayed.
    await _complete(conn, "email", audit_to, audit_subject, audit_body, owner, ref, result,
                    replayable=not minimize_log and len(html or "") <= BODY_LIMIT)
    answer = {"ok": result["ok"], "provider": result["provider"], "error_code": result["error_code"]}
    if not result["ok"]:
        answer["error"] = "delivery outcome unknown" if result.get("ambiguous") else result["error"]
    if result.get("ambiguous"):
        answer["ambiguous"] = True
    return answer


async def send_sms(conn, to: str, text: str, owner: str = "") -> dict:
    to = (to or "").strip()
    if not to:
        return {"ok": False, "error": "no recipient"}
    ref = _ref(owner, to)
    result = await _deliver_sms(to, text, ref)
    await _complete(conn, "sms", to, "", text, owner, ref, result,
                    replayable=len(text or "") <= BODY_LIMIT)
    answer = {"ok": result["ok"], "provider": result["provider"]}
    if not result["ok"]:
        answer["error"] = result["error"]
    return answer


async def send_whatsapp(conn, to: str, text: str, template: str = "", params: list | None = None,
                        owner: str = "") -> dict:
    to = (to or "").strip()
    if not to:
        return {"ok": False, "error": "no recipient"}
    ref = _ref(owner, to)
    result = await _deliver_whatsapp(to, text, template, params, ref)
    # Template parameters are not part of the row, so a templated send is a
    # record-only outcome rather than a replayable one.
    await _complete(conn, "whatsapp", to, template, text, owner, ref, result,
                    replayable=not template and len(text or "") <= BODY_LIMIT)
    answer = {"ok": result["ok"], "provider": result["provider"]}
    if not result["ok"]:
        answer["error"] = result["error"]
    return answer


async def _replay(row: dict, ref: str) -> dict:
    channel = row["channel"]
    if channel == "email":
        return await _deliver_email(row["recipient"], row["subject"], row["body"], ref,
                                    log_subject=row["subject"])
    if channel == "sms":
        return await _deliver_sms(row["recipient"], row["body"], ref)
    if channel == "whatsapp":
        return await _deliver_whatsapp(row["recipient"], row["body"], "", None, ref)
    return {"ok": False, "provider": row["provider"], "status": "failed",
            "error": "unknown channel", "error_code": "unknown_channel", "retryable": False}


async def retry_due(conn, *, limit: int = 25) -> dict:
    """Re-drive due failures; dead-letter the ones that keep failing.

    Only a row carrying `next_at` is re-driven. An ambiguous outcome, a
    minimized recipient, a templated WhatsApp message and a truncated body all
    lack what an exact replay needs, so they stay for `delivery_health` and the
    operator instead of becoming a second message to a real person.
    """
    await ensure_schema(conn)
    claimed = await (await conn.execute(
        "UPDATE notification_log SET next_at='' WHERE id IN ("
        " SELECT id FROM notification_log WHERE status='failed' AND next_at<>'' AND next_at<=%s"
        " ORDER BY next_at LIMIT %s FOR UPDATE SKIP LOCKED) RETURNING *",
        (datetime.now(timezone.utc).isoformat(), limit))).fetchall()
    summary = {"retried": 0, "sent": 0, "dead": 0}
    for row in claimed:
        ref = _ref(row["owner_user_id"], row["recipient"])
        if row["attempts"] >= MAX_ATTEMPTS:
            await conn.execute("UPDATE notification_log SET status='dead' WHERE id=%s", (row["id"],))
            summary["dead"] += 1
            _log.error("[notify:dead-letter] channel=%s recipient=%s attempts=%s error=%s "
                       "— this message will never be delivered and needs an operator",
                       row["channel"], ref, row["attempts"], row["error"])
            continue
        result = await _replay(row, ref)
        attempts = row["attempts"] + 1
        summary["retried"] += 1
        await conn.execute(
            "UPDATE notification_log SET provider=%s,status=%s,error=%s,attempts=%s,next_at=%s WHERE id=%s",
            (result["provider"], result["status"], (result["error"] or "")[:500], attempts,
             _due(attempts) if result["retryable"] else "", row["id"]))
        if result["ok"]:
            summary["sent"] += 1
        else:
            _log.warning("[notify:undelivered] channel=%s provider=%s status=%s recipient=%s attempts=%s error=%s",
                         row["channel"], result["provider"], result["status"], ref, attempts, result["error"])
    return summary


async def delivery_health(conn, *, hours: int = 24) -> dict:
    """Operator counters over the send window: what nobody received."""
    await ensure_schema(conn)
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    rows = await (await conn.execute(
        "SELECT status, count(*) AS total FROM notification_log WHERE created_at>=%s GROUP BY status",
        (since,))).fetchall()
    counts = {str(row["status"]): int(row["total"]) for row in rows}
    summary = {"since": since, "sent": counts.get("sent", 0), "logged": counts.get("logged", 0),
               "failed": counts.get("failed", 0), "unknown": counts.get("unknown", 0),
               "dead": counts.get("dead", 0)}
    if summary["failed"] or summary["unknown"] or summary["dead"]:
        _log.warning("[notify:health] window_hours=%s failed=%s unknown=%s dead=%s",
                     hours, summary["failed"], summary["unknown"], summary["dead"])
    return summary


def looks_like_email(contact: str) -> bool:
    return "@" in (contact or "")


async def notify_contact(conn, contact: str, subject: str, body: str, owner: str = "") -> dict:
    """Send to a bare contact string, auto-routing: email if it has '@', else
    WhatsApp (+ SMS fallback). Returns the primary result plus the channel used."""
    contact = (contact or "").strip()
    if not contact:
        return {"ok": False, "channel": "", "error": "no contact"}
    if looks_like_email(contact):
        res = await send_email(conn, contact, subject, body, owner)
        return {**res, "channel": "email"}
    wa = await send_whatsapp(conn, contact, body, owner=owner)
    await send_sms(conn, contact, body, owner)
    return {**wa, "channel": "whatsapp"}
