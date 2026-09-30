"""Short-lived authentication transport for native audio/video elements.

A browser media element cannot attach Pattadar's Bearer header. A Bearer-only
POST therefore creates an opaque, exact-node/version session and puts the raw
secret in an HttpOnly cookie; PostgreSQL stores only SHA-256. This is not an
access grant: every content request still calls StorageService.content_identity
and therefore rechecks owner/share access and revocation.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from . import database as db

TTL_SECONDS = 15 * 60
COOKIE_NAME = "pattadar_media_stream"


def token_hash(raw: str) -> bytes:
    return hashlib.sha256(raw.encode("utf-8")).digest()


def create(claims: dict, node_id: str, version_id: str) -> str:
    issuer = str(claims.get("iss") or "").strip()
    subject = str(claims.get("sub") or "").strip()
    if not issuer or not subject:
        raise ValueError("authenticated issuer and subject are required")
    raw = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    expires = now + timedelta(seconds=TTL_SECONDS)
    with db._get_conn() as conn:
        # Bounded opportunistic cleanup; the expiry index keeps this cheap and
        # one playback cannot inherit an unbounded delete/WAL spike.
        conn.execute(
            "DELETE FROM storage_stream_sessions WHERE token_hash IN "
            "(SELECT token_hash FROM storage_stream_sessions WHERE expires_at<=now() "
            "ORDER BY expires_at LIMIT 250)"
        )
        conn.execute(
            "INSERT INTO storage_stream_sessions "
            "(token_hash,issuer,subject,node_id,version_id,created_at,expires_at) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s)",
            (token_hash(raw), issuer, subject, node_id, version_id, now, expires),
        )
    return raw


def lookup(raw: str, node_id: str, version_id: str) -> dict | None:
    if not raw or not node_id or not version_id:
        return None
    rows = db.query_native(
        "storage_stream_sessions",
        "SELECT issuer,subject,node_id::text AS node_id,version_id::text AS version_id "
        "FROM storage_stream_sessions WHERE token_hash=%s AND node_id=%s AND version_id=%s "
        "AND expires_at > now() LIMIT 1",
        [token_hash(raw), node_id, version_id],
        camel_case=False,
    )
    return rows[0] if rows else None


def claim_first_use(raw: str, node_id: str, version_id: str) -> bool:
    """Claim the stream's audit with a one-minute retry lease.

    If audit transport fails the route releases this claim, so a later range
    retries instead of permanently losing evidence. A crashed claimant becomes
    retryable after the lease.
    """
    if not raw:
        return False
    with db._get_conn() as conn:
        row = conn.execute(
            "UPDATE storage_stream_sessions SET first_used_at=COALESCE(first_used_at,now()),"
            " audit_claimed_at=now() WHERE token_hash=%s AND node_id=%s AND version_id=%s "
            "AND expires_at>now() AND audited_at IS NULL AND "
            "(audit_claimed_at IS NULL OR audit_claimed_at < now()-interval '1 minute') "
            "RETURNING token_hash",
            (token_hash(raw), node_id, version_id),
        ).fetchone()
    return bool(row)


def finish_audit(raw: str, node_id: str, version_id: str, succeeded: bool) -> None:
    """Mark delivered audit durable, or release the claim for a later range."""
    with db._get_conn() as conn:
        if succeeded:
            conn.execute(
                "UPDATE storage_stream_sessions SET audited_at=now(),audit_claimed_at=NULL "
                "WHERE token_hash=%s AND node_id=%s AND version_id=%s",
                (token_hash(raw), node_id, version_id),
            )
        else:
            conn.execute(
                "UPDATE storage_stream_sessions SET audit_claimed_at=NULL "
                "WHERE token_hash=%s AND node_id=%s AND version_id=%s AND audited_at IS NULL",
                (token_hash(raw), node_id, version_id),
            )


def revoke_subject(claims: dict) -> int:
    """Invalidate every outstanding media session for this immutable login."""
    issuer = str(claims.get("iss") or "").strip()
    subject = str(claims.get("sub") or "").strip()
    if not issuer or not subject:
        return 0
    with db._get_conn() as conn:
        rows = conn.execute(
            "DELETE FROM storage_stream_sessions WHERE issuer=%s AND subject=%s RETURNING token_hash",
            (issuer, subject),
        ).fetchall()
    return len(rows)
