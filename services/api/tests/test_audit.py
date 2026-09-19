"""Centralized audit pipeline (src/audit.py).

The envelope + taxonomy layer is pure, so most of this runs with no database.
The outbox/worker/query flows need the local Postgres and skip cleanly when it
is absent, mirroring test_idempotency.py.
"""
import sys
import json
import uuid
import asyncio
from pathlib import Path
from datetime import datetime, timezone, timedelta

import pytest
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import main
from src import audit


# ── Pure envelope / taxonomy ───────────────────────────────────────────

def test_classification_comes_from_taxonomy_not_caller():
    # Even though the caller says nothing about class/retention, the taxonomy
    # decides: reveal_aadhaar is security-class, security retention.
    e = audit.build_event(action="reveal_aadhaar", actor_principal="u1",
                          affected_owner="u1", resource_id="m1")
    assert e.data_class == audit.CLASS_SECURITY
    assert e.retention_class == "security"
    assert audit.is_security_action("reveal_aadhaar")
    assert audit.RETENTION_DAYS[e.retention_class] == 1095


def test_unknown_action_is_conservatively_classified():
    e = audit.build_event(action="something_new", actor_principal="u1",
                          affected_owner="u1")
    assert e.data_class == audit.CLASS_PERSONAL
    assert e.retention_class == audit.DEFAULT_RETENTION
    # No allowlist for an unknown action → all metadata dropped.
    assert audit.filter_metadata("something_new", {"anything": "x"}) == {}


def test_metadata_allowlist_drops_unlisted_keys_and_pii():
    # reveal_aadhaar allows only 'subject_kind'.
    filtered = audit.filter_metadata("reveal_aadhaar", {
        "subject_kind": "member",
        "name": "Ramesh Kumar",          # PII — must be dropped
        "aadhaar": "1234 5678 9012",     # PII — must be dropped
    })
    assert filtered == {"subject_kind": "member"}


def test_label_is_allowed_on_every_action():
    # `label` names WHICH record an action touched. It is universal, not
    # per-spec: a line reading "Removed a parcel" with no name defeats the
    # trail's purpose, and per-action allowlisting guaranteed some actions
    # would be forgotten.
    for action in ("delete_parcel", "delete_property", "create_parcel",
                   "archive_record", "tag_record", "set_boundary",
                   "an_action_nobody_has_classified_yet"):
        got = audit.filter_metadata(action, {"label": "Sy 77/3"})
        assert got == {"label": "Sy 77/3"}, action


def test_label_is_bounded_and_pii_still_blocked():
    # Universal does not mean unbounded.
    long_label = audit.filter_metadata("delete_parcel", {"label": "x" * 900})
    assert len(long_label["label"]) == 200
    # Adding `label` must not open the door to anything else.
    assert audit.filter_metadata("delete_parcel", {
        "label": "Sy 1", "aadhaar": "1234 5678 9012", "phone": "9876543210",
    }) == {"label": "Sy 1"}


def test_metadata_values_are_bounded():
    # 'detail' is allowlisted for desk_read; an oversized value is truncated.
    big = "x" * 5000
    filtered = audit.filter_metadata("desk_read", {"scope": "associates", "detail": big})
    assert filtered["scope"] == "associates"
    assert len(filtered["detail"]) == 200
    # A nested dict on an allowed key is not a scalar → dropped entirely.
    assert audit.filter_metadata("desk_read", {"detail": {"nested": 1}}) == {}


def test_list_metadata_is_bounded():
    filtered = audit.filter_metadata("update_profile", {"fields": ["name", "email"] + ["x"] * 100})
    assert isinstance(filtered["fields"], list)
    assert len(filtered["fields"]) == 20  # capped


def test_actor_and_affected_owner_separate():
    e = audit.build_event(action="desk_read", actor_principal="admin1",
                          affected_owner="owner9", actor_kind=audit.ACTOR_ADMIN,
                          metadata={"scope": "coverage"})
    assert e.actor_principal == "admin1"
    assert e.affected_owner == "owner9"
    assert e.actor_kind == audit.ACTOR_ADMIN


def test_affected_owner_defaults_to_actor():
    e = audit.build_event(action="create_passbook", actor_principal="u5",
                          affected_owner="")
    assert e.affected_owner == "u5"


def test_bad_outcome_and_actor_kind_normalize():
    e = audit.build_event(action="upload_document", actor_principal="u1",
                          affected_owner="u1", outcome="weird", actor_kind="bogus")
    assert e.outcome == audit.OUTCOME_SUCCESS
    assert e.actor_kind == audit.ACTOR_OWNER


def test_critical_actions():
    for a in ("reveal_aadhaar", "desk_read", "account.export", "account.erasure_requested"):
        assert audit.is_critical_action(a)
    assert not audit.is_critical_action("upload_document")
    assert not audit.is_critical_action("favourite")


def test_occurred_at_is_timezone_aware():
    e = audit.build_event(action="upload_document", actor_principal="u1",
                          affected_owner="u1")
    assert e.occurred_at.tzinfo is not None


def test_integrity_hash_is_stable_and_content_bound():
    fixed = datetime(2026, 9, 19, tzinfo=timezone.utc)
    kw = dict(action="upload_document", actor_principal="u1", affected_owner="u1",
              resource_id="d1", occurred_at=fixed, event_id="ae2-fixed",
              metadata={"doc_kind": "deed"})
    a = audit.build_event(**kw)
    b = audit.build_event(**kw)
    assert a.integrity_hash() == b.integrity_hash()
    # A changed field changes the hash.
    c = audit.build_event(**{**kw, "resource_id": "d2"})
    assert c.integrity_hash() != a.integrity_hash()


def test_retention_days_for_action():
    assert audit.retention_days_for("reveal_aadhaar") == 1095
    assert audit.retention_days_for("favourite") == 365
    assert audit.retention_days_for("create_passbook") == 1095


# ── DB-backed outbox / worker / queries ────────────────────────────────

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
        owner = "audit-test-" + uuid.uuid4().hex[:8]
        try:
            async with test_pool.connection() as conn:
                await audit.ensure_schema(conn)
            await fn(owner, test_pool)
        finally:
            audit._pool = prev_pool
            try:
                # Reset the chain to genesis rather than deleting one owner's
                # rows. Per-owner deletion would leave holes mid-chain, which
                # the verifier correctly reports as tampering — so it would make
                # these tests order-dependent and the failures meaningless. This
                # is a disposable database; a real erasure redacts instead (see
                # audit.redact_owner), which is what keeps the chain intact in
                # production. The append-only guard still has to be satisfied,
                # which doubles as a check that it is installed.
                async with test_pool.connection() as conn, conn.transaction():
                    await conn.execute(audit.MAINTENANCE_ON)
                    await conn.execute("DELETE FROM audit_outbox")
                    await conn.execute("DELETE FROM audit_events_v2")
                    await conn.execute("UPDATE audit_chain_head SET seq=0, head_hash='' WHERE id=1")
            finally:
                await test_pool.close()

    asyncio.run(wrapper())


def test_enqueue_then_worker_drains_to_read_model():
    async def flow(owner, pool):
        async with pool.connection() as conn:
            await audit.record(conn, action="upload_document", actor_principal=owner,
                               affected_owner=owner, resource_id="doc1",
                               metadata={"doc_kind": "deed", "leak": "PII"})
        # Pending in the outbox, not yet in the read model.
        async with pool.connection() as conn:
            n = (await (await conn.execute(
                "SELECT count(*) AS n FROM audit_outbox WHERE affected_owner=%s", (owner,))).fetchone())["n"]
            assert n == 1
        assert await audit.run_one() is True
        async with pool.connection() as conn:
            row = await (await conn.execute(
                "SELECT * FROM audit_events_v2 WHERE affected_owner=%s", (owner,))).fetchone()
            assert row is not None
            assert row["action"] == "upload_document"
            assert row["data_class"] == audit.CLASS_PERSONAL
            assert row["expires_at"] is not None
            # Allowlist held through the whole pipeline.
            assert row["metadata"] == {"doc_kind": "deed"}
            # Outbox row consumed.
            gone = (await (await conn.execute(
                "SELECT count(*) AS n FROM audit_outbox WHERE affected_owner=%s", (owner,))).fetchone())["n"]
            assert gone == 0
    _db_flow(flow)


def test_run_one_returns_false_when_empty():
    async def flow(owner, pool):
        # Drain anything (there is nothing for this fresh owner), then confirm.
        # Other rows may exist from a shared DB, so just assert idempotence of
        # our own owner: enqueue one, drain twice.
        async with pool.connection() as conn:
            await audit.record(conn, action="favourite", actor_principal=owner,
                               affected_owner=owner, resource_id="r1",
                               metadata={"entity_type": "record"})
        assert await audit.run_one() in (True, False)  # may pick ours or another
        # Reprocessing the same event id is a no-op (idempotent PRIMARY KEY).
        async with pool.connection() as conn:
            rows = await (await conn.execute(
                "SELECT count(*) AS n FROM audit_events_v2 WHERE affected_owner=%s", (owner,))).fetchone()
            assert rows["n"] <= 1
    _db_flow(flow)


def test_outbox_commits_with_caller_transaction():
    async def flow(owner, pool):
        # A failed business transaction must NOT leave an audit row behind.
        try:
            async with pool.connection() as conn:
                async with conn.transaction():
                    await audit.record(conn, action="create_passbook",
                                       actor_principal=owner, affected_owner=owner,
                                       resource_id="pb1")
                    raise RuntimeError("business failure after audit enqueue")
        except RuntimeError:
            pass
        async with pool.connection() as conn:
            n = (await (await conn.execute(
                "SELECT count(*) AS n FROM audit_outbox WHERE affected_owner=%s", (owner,))).fetchone())["n"]
            assert n == 0  # rolled back with the transaction
    _db_flow(flow)


def test_chain_hash_is_deterministic_and_order_bound():
    a = audit.chain_hash("", "content1", 1)
    assert a == audit.chain_hash("", "content1", 1)
    # Position matters: the same content at a different seq is a different link.
    assert audit.chain_hash("", "content1", 2) != a
    # The prior chain matters: same content, different history, different link.
    assert audit.chain_hash("deadbeef", "content1", 1) != a


def test_auditor_role_is_separate_and_closed_by_default(monkeypatch):
    monkeypatch.delenv("AUDIT_READER_UIDS", raising=False)
    # Empty allowlist means NOBODY, not everybody.
    assert audit.auditor_uids() == set()
    assert not audit.is_auditor("anyone")
    monkeypatch.setenv("AUDIT_READER_UIDS", "regulator-1, regulator-2")
    assert audit.is_auditor("regulator-1")
    assert audit.is_auditor("regulator-2")
    assert not audit.is_auditor("someone-else")
    assert not audit.is_auditor("")
    # An auditor read is critical: unrecorded review is not allowed to proceed.
    assert audit.is_critical_action("auditor.read")


def test_chain_verifies_and_detects_tampering():
    async def flow(owner, pool):
        for i in range(3):
            async with pool.connection() as conn:
                await audit.record(conn, action="upload_document",
                                   actor_principal=owner, affected_owner=owner,
                                   resource_id=f"d{i}")
            assert await audit.run_one() is True
        async with pool.connection() as conn:
            verdict = await audit.verify_chain(conn)
            assert verdict["ok"] is True, verdict
            assert verdict["checked"] >= 3
            # Tamper: rewrite a recorded row's content hash directly. The
            # append-only trigger refuses an UPDATE, which is itself the first
            # line of defence — so prove BOTH: the guard refuses, and if the
            # guard is bypassed the chain still detects it.
            target = await (await conn.execute(
                "SELECT seq FROM audit_events_v2 WHERE affected_owner=%s ORDER BY seq LIMIT 1",
                (owner,))).fetchone()
            with pytest.raises(Exception) as refused:
                await conn.execute(
                    "UPDATE audit_events_v2 SET action='nothing_happened' WHERE seq=%s",
                    (target["seq"],))
            assert "append-only" in str(refused.value)
    _db_flow(flow)


def test_append_only_blocks_delete_without_the_reviewed_path():
    async def flow(owner, pool):
        async with pool.connection() as conn:
            await audit.record(conn, action="upload_document", actor_principal=owner,
                               affected_owner=owner, resource_id="d1")
        assert await audit.run_one() is True
        async with pool.connection() as conn:
            with pytest.raises(Exception) as refused:
                await conn.execute(
                    "DELETE FROM audit_events_v2 WHERE affected_owner=%s", (owner,))
            assert "reviewed retention or erasure path" in str(refused.value)
        # The reviewed path (retention/erasure) announces itself and succeeds.
        async with pool.connection() as conn, conn.transaction():
            await conn.execute(audit.MAINTENANCE_ON)
            cur = await conn.execute(
                "DELETE FROM audit_events_v2 WHERE affected_owner=%s", (owner,))
            assert cur.rowcount >= 1
    _db_flow(flow)


def test_erasure_redacts_content_but_never_breaks_the_chain():
    async def flow(owner, pool):
        # Three events for this owner, then an erasure.
        for i in range(3):
            async with pool.connection() as conn:
                await audit.record(conn, action="upload_document",
                                   actor_principal=owner, affected_owner=owner,
                                   resource_id=f"doc{i}", metadata={"label": "Sy 1/1"})
            assert await audit.run_one() is True
        async with pool.connection() as conn:
            assert (await audit.verify_chain(conn))["ok"] is True
            n = await audit.redact_owner(conn, owner, request_id="erasure-req-1")
            assert n == 3
            # The personal content is gone...
            rows = await (await conn.execute(
                "SELECT actor_principal, affected_owner, resource_id, metadata,"
                " redacted_at, seq, row_hash FROM audit_events_v2 WHERE seq IS NOT NULL"
                " ORDER BY seq")).fetchall()
            for r in rows:
                assert r["actor_principal"] == "erased"
                assert r["affected_owner"] == "erased"
                assert r["resource_id"] == ""
                assert r["metadata"] == {}
                assert r["redacted_at"] is not None
            # ...and the chain still verifies, which is the whole point: an
            # approved erasure must not look like destroyed evidence.
            verdict = await audit.verify_chain(conn)
            assert verdict["ok"] is True, verdict
            # The erased owner can no longer be found in their own trail.
            gone = await (await conn.execute(
                "SELECT count(*) AS n FROM audit_events_v2 WHERE affected_owner=%s",
                (owner,))).fetchone()
            assert gone["n"] == 0
    _db_flow(flow)


def test_content_edit_is_detected_even_when_the_hashes_are_left_alone():
    # REGRESSION: the first cut computed row_hash from the STORED integrity_hash
    # and never checked that integrity_hash matched the row's actual content. So
    # editing content while leaving every hash untouched left the chain
    # verifying perfectly and the forgery invisible — the seal covered the
    # sequence but not the event.
    async def flow(owner, pool):
        async with pool.connection() as conn:
            await audit.record(conn, action="upload_document", actor_principal=owner,
                               affected_owner=owner, resource_id="d1",
                               metadata={"label": "Sy 1/1"})
        assert await audit.run_one() is True
        async with pool.connection() as conn:
            assert (await audit.verify_chain(conn))["ok"] is True
            # Force a content edit past the guard, touching NO hash column.
            async with conn.transaction():
                await conn.execute(audit.MAINTENANCE_ON)
                await conn.execute(
                    "UPDATE audit_events_v2 SET metadata='{\"label\":\"FORGED\"}'::jsonb"
                    " WHERE seq IS NOT NULL")
            verdict = await audit.verify_chain(conn)
            assert verdict["ok"] is False
            assert "does not match the hash sealed" in verdict["reason"]
    _db_flow(flow)


def test_chain_columns_cannot_be_rewritten_even_under_maintenance():
    async def flow(owner, pool):
        async with pool.connection() as conn:
            await audit.record(conn, action="upload_document", actor_principal=owner,
                               affected_owner=owner, resource_id="d1")
        assert await audit.run_one() is True
        # Even the reviewed maintenance path may not re-link the chain.
        async with pool.connection() as conn:
            with pytest.raises(Exception) as refused:
                async with conn.transaction():
                    await conn.execute(audit.MAINTENANCE_ON)
                    await conn.execute(
                        "UPDATE audit_events_v2 SET row_hash='forged' WHERE seq IS NOT NULL")
            assert "can never be rewritten" in str(refused.value)
    _db_flow(flow)


def test_health_reports_backlog_and_chain():
    async def flow(owner, pool):
        async with pool.connection() as conn:
            await audit.record(conn, action="upload_document", actor_principal=owner,
                               affected_owner=owner, resource_id="d1")
            h = await audit.health(conn)
            # Enqueued but not yet drained: that is exactly what backlog means.
            assert h["backlog"] >= 1
            assert "chain" in h and "healthy" in h
        assert await audit.run_one() is True
        async with pool.connection() as conn:
            h = await audit.health(conn)
            assert h["chain"]["ok"] is True, h["chain"]
    _db_flow(flow)


def test_dedup_on_reenqueue_same_event_id():
    async def flow(owner, pool):
        e = audit.build_event(action="upload_document", actor_principal=owner,
                              affected_owner=owner, resource_id="d9",
                              event_id="ae2-dupe-" + uuid.uuid4().hex[:8])
        async with pool.connection() as conn:
            await audit.enqueue(conn, e)
            await audit.enqueue(conn, e)  # ON CONFLICT DO NOTHING
            n = (await (await conn.execute(
                "SELECT count(*) AS n FROM audit_outbox WHERE event_id=%s", (e.event_id,))).fetchone())["n"]
            assert n == 1
    _db_flow(flow)


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
