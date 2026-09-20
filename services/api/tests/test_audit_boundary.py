"""The audit trail's privilege boundary, its new actions, and the O(k) health walk.

Companion to test_audit.py, which covers the envelope, the outbox and the chain
itself. This file covers the three things that made the chain's tamper-evidence
real rather than nominal: the database roles the append-only trigger defers to,
the health check that no longer re-walks the whole trail on every poll, and the
actions the gateway now emits.

DB-backed flows need the local Postgres and skip cleanly when it is absent,
mirroring test_audit.py.
"""
import sys
import uuid
import asyncio
from pathlib import Path

import pytest
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import main
from src import audit


# ── The privilege boundary (AU-9) ──────────────────────────────────────

def test_role_bootstrap_leaves_the_app_login_unable_to_rewrite_the_trail():
    sql = audit.role_bootstrap_sql("pattadar_app")
    assert f"CREATE ROLE {audit.AUDIT_WRITER_ROLE} NOLOGIN" in sql
    assert f"CREATE ROLE {audit.AUDIT_MAINTAINER_ROLE} NOLOGIN" in sql
    # The application appends and reads. That is the whole of its access.
    assert f"GRANT SELECT, INSERT ON audit_events_v2 TO {audit.AUDIT_WRITER_ROLE};" in sql
    assert f"GRANT {audit.AUDIT_WRITER_ROLE} TO pattadar_app;" in sql
    assert "REVOKE UPDATE, DELETE, TRUNCATE ON audit_events_v2 FROM pattadar_app;" in sql
    # The maintainer role is created and deliberately NOT handed to the app: a
    # login that can grant itself the boundary is not a boundary.
    assert f"GRANT {audit.AUDIT_MAINTAINER_ROLE} TO pattadar_app" not in sql


def test_role_bootstrap_refuses_an_injectable_role_name():
    for bad in ("app; DROP TABLE audit_events_v2", "app role", "", "app-role"):
        with pytest.raises(ValueError):
            audit.role_bootstrap_sql(bad)


def test_the_trigger_requires_role_membership_when_the_boundary_exists():
    # The maintenance announcement is a SET LOCAL any login can issue, so it
    # records intent and constrains nobody on its own. The guard only trusts it
    # from a member of the maintainer role — and falls open until that role is
    # provisioned, so local development and a partial rollout keep working.
    body = next(s for s in audit.DDL if "audit_events_v2_append_only" in s)
    assert f"rolname = '{audit.AUDIT_MAINTAINER_ROLE}'" in body
    assert f"pg_has_role(current_user, '{audit.AUDIT_MAINTAINER_ROLE}', 'USAGE')" in body
    assert "reviewed := true" in body
    assert "reviewed AND coalesce(current_setting('pattadar.audit_maintenance'" in body


# ── The actions the gateway emits ──────────────────────────────────────

def test_download_document_is_personal_and_separate_from_the_metadata_read():
    e = audit.build_event(action="download_document", actor_principal="u1",
                          affected_owner="u1", resource_id="d1",
                          metadata={"doc_kind": "deed", "doc_type": "sale",
                                    "filename": "Ramesh sale deed.pdf"})
    assert e.data_class == audit.CLASS_PERSONAL
    assert e.resource_type == "document"
    assert e.metadata == {"doc_kind": "deed", "doc_type": "sale"}
    assert not audit.is_security_action("download_document")


def test_recipient_download_is_a_security_event_by_an_outside_actor():
    e = audit.build_event(action="recipient.download", actor_principal="share-tok",
                          affected_owner="u1", resource_id="d1",
                          actor_kind=audit.ACTOR_RECIPIENT,
                          metadata={"share_id": "s1", "doc_kind": "deed",
                                    "recipient_phone": "9000000000"})
    assert e.data_class == audit.CLASS_SECURITY
    assert e.retention_class == "security"
    assert e.actor_kind == audit.ACTOR_RECIPIENT
    assert e.affected_owner == "u1" and e.actor_principal == "share-tok"
    assert e.metadata == {"share_id": "s1", "doc_kind": "deed"}
    assert audit.is_security_action("recipient.download")


def test_sign_in_is_a_security_event_carrying_only_the_method():
    e = audit.build_event(action="session.sign_in", actor_principal="u1",
                          affected_owner="u1",
                          metadata={"method": "cognito", "email": "a@b.com"})
    assert e.data_class == audit.CLASS_SECURITY
    assert e.retention_class == "security"
    assert e.metadata == {"method": "cognito"}
    assert audit.is_security_action("session.sign_in")


# ── DB-backed: the incremental health walk ─────────────────────────────

try:
    with psycopg.connect(main.DSN, connect_timeout=2):
        DB_AVAILABLE = True
except Exception:
    DB_AVAILABLE = False


def _db_flow(fn):
    if not DB_AVAILABLE:
        pytest.skip("local Postgres not available")

    async def wrapper():
        test_pool = AsyncConnectionPool(
            conninfo=main.DSN, min_size=1, max_size=2, open=False,
            kwargs={"row_factory": dict_row, "autocommit": True})
        await test_pool.open(wait=True, timeout=5)
        prev_pool, audit._pool = audit._pool, test_pool
        # The checkpoint is process-global by design (it is what makes a poll
        # cost only what is new), so each flow starts from a cold process.
        audit._verified_through.update(seq=0, hash="")
        owner = "audit-bnd-" + uuid.uuid4().hex[:8]
        try:
            async with test_pool.connection() as conn:
                await audit.ensure_schema(conn)
            await fn(owner, test_pool)
        finally:
            audit._pool = prev_pool
            audit._verified_through.update(seq=0, hash="")
            try:
                async with test_pool.connection() as conn, conn.transaction():
                    await conn.execute(audit.MAINTENANCE_ON)
                    await conn.execute("DELETE FROM audit_outbox")
                    await conn.execute("DELETE FROM audit_events_v2")
                    await conn.execute("UPDATE audit_chain_head SET seq=0, head_hash='' WHERE id=1")
            finally:
                await test_pool.close()

    asyncio.run(wrapper())


async def _append(pool, owner, n, action="upload_document"):
    for i in range(n):
        async with pool.connection() as conn:
            await audit.record(conn, action=action, actor_principal=owner,
                               affected_owner=owner, resource_id=f"d{uuid.uuid4().hex[:6]}")
        assert await audit.run_one() is True


def test_health_verifies_only_what_is_new_since_the_last_poll():
    # REGRESSION: health() re-verified the ENTIRE chain on every call, so the
    # endpoint an alarm polls loaded the whole trail into the API process and
    # hashed every event — the monitoring path degrading first, exactly as the
    # trail grows. A poll must cost the events appended since the last one.
    async def flow(owner, pool):
        await _append(pool, owner, 3)
        async with pool.connection() as conn:
            first = await audit.health(conn)
            assert first["chain"]["ok"] is True, first["chain"]
            # A cold process verifies the tail, never more than the window.
            assert first["chain"]["checked"] <= audit.HEALTH_TAIL_EVENTS
            head = first["chain"]["last_seq"]
        await _append(pool, owner, 1)
        async with pool.connection() as conn:
            second = await audit.health(conn)
            assert second["chain"]["ok"] is True, second["chain"]
            # One new event — not the whole trail again.
            assert second["chain"]["checked"] == 1
            assert second["chain"]["from_seq"] == head + 1
            assert second["chain"]["last_seq"] == head + 1
        # A poll with nothing appended walks nothing and still confirms the head.
        async with pool.connection() as conn:
            idle = await audit.health(conn)
            assert idle["chain"]["ok"] is True, idle["chain"]
            assert idle["chain"]["checked"] == 0
    _db_flow(flow)


def test_the_checkpoint_cannot_vouch_for_a_tail_that_was_rewritten():
    async def flow(owner, pool):
        await _append(pool, owner, 3)
        async with pool.connection() as conn:
            assert (await audit.verify_recent(conn))["ok"] is True
            # The checkpoint now names seq 3. Redact its content in place: the
            # row it anchors on keeps its row_hash, so the checkpoint stays
            # valid — but a rewrite that does NOT look like a redaction must be
            # caught the next time the window covers it.
            async with conn.transaction():
                await conn.execute(audit.MAINTENANCE_ON)
                await conn.execute(
                    "UPDATE audit_events_v2 SET actor_principal='mallory',"
                    " redacted_at=now() WHERE affected_owner=%s", (owner,))
            audit._verified_through.update(seq=0, hash="")
            verdict = await audit.verify_recent(conn)
            assert verdict["ok"] is False
            assert "rewritten, not cleared" in verdict["reason"]
    _db_flow(flow)


def test_a_cold_poll_reports_a_tail_that_was_removed_outright():
    # The full walk calls an empty table intact — it has no position to miss the
    # events from. The window has the head, so it must say they are gone.
    async def flow(owner, pool):
        await _append(pool, owner, 3)
        async with pool.connection() as conn:
            async with conn.transaction():
                await conn.execute(audit.MAINTENANCE_ON)
                await conn.execute("DELETE FROM audit_events_v2")
            audit._verified_through.update(seq=0, hash="")
            verdict = await audit.verify_recent(conn)
            assert verdict["ok"] is False
            assert "the end of the trail was removed" in verdict["reason"]
            assert (await audit.health(conn))["healthy"] is False
    _db_flow(flow)


def test_an_unaccounted_redaction_is_reported_though_the_links_hold():
    async def flow(owner, pool):
        await _append(pool, owner, 2)
        async with pool.connection() as conn:
            mine = {int(r["seq"]) for r in await (await conn.execute(
                "SELECT seq FROM audit_events_v2 WHERE affected_owner=%s",
                (owner,))).fetchall()}
            # A redaction naming no erasure run: correctly shaped, ordered by
            # nobody. The chain still links — that is the point — so it has to
            # be reported on its own terms.
            assert await audit.redact_owner(conn, owner, request_id="") == 2
            verdict = await audit.verify_chain(conn)
            assert verdict["ok"] is True, verdict
            assert verdict["redacted"] >= 2
            assert mine <= set(verdict["unexplained_redactions"])
            audit._verified_through.update(seq=0, hash="")
            health = await audit.health(conn)
            assert health["chain"]["ok"] is True
            assert health["healthy"] is False
    _db_flow(flow)


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
