"""
notify.py — the pattadar sending seam.

One helper per channel (email / SMS / WhatsApp). Each dispatches to a provider
chosen by env var; the **default is a `stub`** that records the message to the
`notification_log` table (and logs it) so the entire flow — invites, verification,
inactivity alerts — is testable end-to-end WITHOUT any external account. Set a
provider's credentials to go live; nothing else changes at the call sites.

Env (all optional; absent → stub):
  NOTIFY_EMAIL_PROVIDER = stub | resend   (+ RESEND_API_KEY, NOTIFY_EMAIL_FROM)
  NOTIFY_SMS_PROVIDER   = stub | msg91    (+ MSG91_AUTHKEY, MSG91_SENDER, MSG91_DLT_TEMPLATE_ID)
  NOTIFY_WA_PROVIDER    = stub | meta      (+ WHATSAPP_TOKEN, WHATSAPP_PHONE_ID)
"""

import logging
import os
import uuid
from datetime import datetime, timezone

_log = logging.getLogger("pattadar.notify")


def _env(key: str, default: str = "") -> str:
    return (os.getenv(key) or default).strip()


async def _record(conn, channel: str, to: str, subject: str, body: str,
                  provider: str, status: str, error: str = "", owner: str = "") -> None:
    await conn.execute(
        "INSERT INTO notification_log (id, owner_user_id, channel, recipient, subject, body, provider, status, error, created_at) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (str(uuid.uuid4()), owner or "", channel, to or "", subject or "", (body or "")[:4000],
         provider, status, (error or "")[:500], datetime.now(timezone.utc).isoformat()))


async def send_email(conn, to: str, subject: str, html: str, owner: str = "") -> dict:
    to = (to or "").strip()
    if not to:
        return {"ok": False, "error": "no recipient"}
    provider = _env("NOTIFY_EMAIL_PROVIDER", "stub")
    if provider == "resend" and _env("RESEND_API_KEY"):
        try:
            import httpx
            async with httpx.AsyncClient(timeout=15.0) as c:
                r = await c.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {_env('RESEND_API_KEY')}"},
                    json={"from": _env("NOTIFY_EMAIL_FROM", "R Factory <noreply@rfactory.ai>"),
                          "to": [to], "subject": subject, "html": html})
            ok = r.status_code < 300
            await _record(conn, "email", to, subject, html, "resend", "sent" if ok else "failed",
                          "" if ok else r.text, owner)
            return {"ok": ok, "provider": "resend"}
        except Exception as exc:  # noqa: BLE001
            await _record(conn, "email", to, subject, html, "resend", "failed", str(exc), owner)
            return {"ok": False, "provider": "resend", "error": str(exc)}
    _log.info("[notify:stub] EMAIL to=%s subject=%r", to, subject)
    await _record(conn, "email", to, subject, html, "stub", "logged", "", owner)
    return {"ok": True, "provider": "stub"}


async def send_sms(conn, to: str, text: str, owner: str = "") -> dict:
    to = (to or "").strip()
    if not to:
        return {"ok": False, "error": "no recipient"}
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
            ok = r.status_code < 300
            await _record(conn, "sms", to, "", text, "msg91", "sent" if ok else "failed",
                          "" if ok else r.text, owner)
            return {"ok": ok, "provider": "msg91"}
        except Exception as exc:  # noqa: BLE001
            await _record(conn, "sms", to, "", text, "msg91", "failed", str(exc), owner)
            return {"ok": False, "provider": "msg91", "error": str(exc)}
    _log.info("[notify:stub] SMS to=%s text=%r", to, text)
    await _record(conn, "sms", to, "", text, "stub", "logged", "", owner)
    return {"ok": True, "provider": "stub"}


async def send_whatsapp(conn, to: str, text: str, template: str = "", params: list | None = None,
                        owner: str = "") -> dict:
    to = (to or "").strip()
    if not to:
        return {"ok": False, "error": "no recipient"}
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
            await _record(conn, "whatsapp", to, template, text, "meta", "sent" if ok else "failed",
                          "" if ok else r.text, owner)
            return {"ok": ok, "provider": "meta"}
        except Exception as exc:  # noqa: BLE001
            await _record(conn, "whatsapp", to, template, text, "meta", "failed", str(exc), owner)
            return {"ok": False, "provider": "meta", "error": str(exc)}
    _log.info("[notify:stub] WHATSAPP to=%s template=%s text=%r", to, template, text)
    await _record(conn, "whatsapp", to, template, text, "stub", "logged", "", owner)
    return {"ok": True, "provider": "stub"}


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
