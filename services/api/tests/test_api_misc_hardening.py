"""Notification delivery durability/secrecy and the account-export omissions."""
import asyncio
from contextlib import asynccontextmanager
import logging
import types

import psycopg
from psycopg.rows import dict_row
import pytest

from src import aadhaar, account, notify
from test_invitation_security import isolated_postgres
from test_account_data import account_db

NOW = "2099-01-01T00:00:00+00:00"
PAST = "2000-01-01T00:00:00+00:00"

LOG_SCHEMA = """
DROP SCHEMA public CASCADE; CREATE SCHEMA public;
CREATE TABLE notification_log (
  id text primary key, owner_user_id text not null default '', channel text not null default '',
  recipient text not null default '', subject text not null default '', body text not null default '',
  provider text not null default '', status text not null default '', error text not null default '',
  created_at text not null default '');
"""


class Reply:
    def __init__(self, status_code, payload=None, text=""):
        self.status_code, self.text, self._payload = status_code, text, payload

    def json(self):
        if self._payload is None:
            raise ValueError("not json")
        return self._payload


class Provider:
    """Stands in for httpx.AsyncClient: constructed, entered, posted to."""

    def __init__(self, reply=None, raises=None):
        self.reply, self.raises, self.sent = reply, raises, []

    def __call__(self, *args, **kwargs):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, headers=None, json=None):
        self.sent.append(json)
        if self.raises:
            raise self.raises
        return self.reply


@pytest.fixture
def notify_db(isolated_postgres, monkeypatch):
    with psycopg.connect(isolated_postgres, autocommit=True) as conn:
        conn.execute(LOG_SCHEMA)
    monkeypatch.setattr(notify, "_schema_ready", False)
    monkeypatch.delenv("APP_ENV", raising=False)

    @asynccontextmanager
    async def connection():
        async with await psycopg.AsyncConnection.connect(isolated_postgres, autocommit=True, row_factory=dict_row) as conn:
            yield conn
    return connection


def provider(monkeypatch, **kwargs):
    import httpx
    client = Provider(**kwargs)
    monkeypatch.setattr(httpx, "AsyncClient", client)
    return client


def test_stub_logs_no_recipient_and_no_message_text(notify_db, caplog):
    """A dispatch body carries a live work link; stdout is CloudWatch."""
    link = "https://pattadar.com/work/live-bearer-token"

    async def run():
        async with notify_db() as conn:
            answer = await notify.send_sms(conn, "+919876500000", f"Accept this job: {link}", "u1")
            assert answer == {"ok": True, "provider": "stub"}
            return await (await conn.execute("SELECT * FROM notification_log")).fetchone()

    with caplog.at_level(logging.INFO, logger="pattadar.notify"):
        row = asyncio.run(run())
    assert "live-bearer-token" not in caplog.text and "9876500000" not in caplog.text
    assert notify._ref("u1", "+919876500000") in caplog.text
    # The row keeps the real message: reading it back is what the stub is for.
    assert row["recipient"] == "+919876500000" and link in row["body"]
    assert row["status"] == "logged" and row["next_at"] == ""


def test_stub_is_an_undelivered_send_outside_local_and_test(notify_db, monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")

    async def run():
        async with notify_db() as conn:
            answer = await notify.notify_contact(conn, "heir@example.com", "Confirm", "Body", owner="u1")
            return answer, await (await conn.execute("SELECT * FROM notification_log")).fetchone()

    answer, row = asyncio.run(run())
    assert answer["ok"] is False and answer["error_code"] == "provider_not_configured"
    assert row["status"] == "failed"
    # Retrying cannot configure a provider.
    assert row["next_at"] == ""


def test_msg91_accepts_only_success_then_retries_and_dead_letters(notify_db, monkeypatch, caplog):
    monkeypatch.setenv("NOTIFY_SMS_PROVIDER", "msg91")
    monkeypatch.setenv("MSG91_AUTHKEY", "key")
    client = provider(monkeypatch, reply=Reply(200, {"type": "error", "message": "DLT template blocked"}))

    async def run():
        async with notify_db() as conn:
            answer = await notify.send_sms(conn, "+919876500000", "Verify your membership", "u1")
            assert answer["ok"] is False and "DLT template blocked" in answer["error"]
            first = await (await conn.execute("SELECT * FROM notification_log")).fetchone()
            assert first["status"] == "failed" and first["attempts"] == 1 and first["next_at"] != ""
            passes = []
            for _ in range(notify.MAX_ATTEMPTS + 1):
                await conn.execute("UPDATE notification_log SET next_at=%s WHERE next_at<>''", (PAST,))
                passes.append(await notify.retry_due(conn))
            return passes, await (await conn.execute("SELECT * FROM notification_log")).fetchone()

    with caplog.at_level(logging.ERROR, logger="pattadar.notify"):
        passes, row = asyncio.run(run())
    assert [p["retried"] for p in passes] == [1, 1, 1, 1, 0, 0]
    assert [p["dead"] for p in passes] == [0, 0, 0, 0, 1, 0]
    assert len(client.sent) == notify.MAX_ATTEMPTS  # the original send plus four replays
    assert row["status"] == "dead" and row["attempts"] == notify.MAX_ATTEMPTS
    assert "[notify:dead-letter]" in caplog.text and "9876500000" not in caplog.text


def test_unknown_email_outcome_is_never_re_driven(notify_db, monkeypatch):
    monkeypatch.setenv("NOTIFY_EMAIL_PROVIDER", "resend")
    monkeypatch.setenv("RESEND_API_KEY", "key")
    client = provider(monkeypatch, raises=RuntimeError("connection reset"))

    async def run():
        async with notify_db() as conn:
            answer = await notify.send_email(conn, "heir@example.com", "Confirm", "<p>link</p>", "u1")
            assert answer["ok"] is False and answer["ambiguous"] is True
            row = await (await conn.execute("SELECT * FROM notification_log")).fetchone()
            assert row["status"] == "unknown" and row["next_at"] == ""
            # Even if a row is made due by hand, an unknown outcome stays put.
            await conn.execute("UPDATE notification_log SET next_at=%s", (PAST,))
            return await notify.retry_due(conn)

    assert asyncio.run(run()) == {"retried": 0, "sent": 0, "dead": 0}
    assert len(client.sent) == 1


def test_minimized_and_templated_sends_are_recorded_but_not_replayable(notify_db):
    async def run():
        async with notify_db() as conn:
            await notify.send_email(conn, "heir@example.com", "Safeguard", "<p>token</p>", "u1",
                                    minimize_log=True)
            await notify.send_whatsapp(conn, "+919876500000", "Verify", "membership_v1", ["Asha"], "u1")
            return await (await conn.execute("SELECT * FROM notification_log ORDER BY channel")).fetchall()

    email, whatsapp = asyncio.run(run())
    assert email["recipient"] == notify._ref("u1", "heir@example.com") and email["next_at"] == ""
    assert whatsapp["subject"] == "membership_v1" and whatsapp["next_at"] == ""


def test_delivery_health_counts_what_nobody_received(notify_db, caplog):
    async def run():
        async with notify_db() as conn:
            await notify.ensure_schema(conn)
            await conn.execute(
                "INSERT INTO notification_log(id,channel,status,created_at) VALUES"
                " ('1','sms','failed',%s),('2','email','unknown',%s),('3','sms','dead',%s),"
                " ('4','sms','logged',%s),('5','email','sent',%s)", (NOW,) * 5)
            return await notify.delivery_health(conn)

    with caplog.at_level(logging.WARNING, logger="pattadar.notify"):
        summary = asyncio.run(run())
    assert summary["failed"] == 1 and summary["unknown"] == 1 and summary["dead"] == 1
    assert summary["logged"] == 1 and summary["sent"] == 1
    assert "[notify:health]" in caplog.text


def test_export_omits_the_wrapped_aadhaar_candidate(account_db):
    with psycopg.connect(account_db, autocommit=True) as conn:
        conn.execute(aadhaar.DDL)
        conn.execute("INSERT INTO aadhaar_candidates(id,owner_user_id,ciphertext,masked,expires_at)"
                     " VALUES ('ca','a','kms-direct:v1:wrapped','XXXX XXXX 1234',now()),"
                     " ('cb','b','kms-direct:v1:other','XXXX XXXX 5678',now())")
    exported = asyncio.run(account.export(types.SimpleNamespace(headers={"x-user-id": "a"})))["data"]
    candidates = exported["aadhaar_candidates"]
    assert [row["id"] for row in candidates] == ["ca"]
    assert all("ciphertext" not in row for row in candidates)
    assert candidates[0]["masked"] == "XXXX XXXX 1234"
