"""The published retention schedule promises notification_log is purged at
twelve months. Nothing enforced it until the sweep in audit.maintenance, and
created_at is TEXT rather than a timestamp, so the comparison is easy to get
wrong in a way that silently deletes nothing (or everything)."""

from datetime import datetime, timedelta, timezone

import psycopg
import pytest

from test_invitation_security import isolated_postgres  # noqa: F401

PURGE = (
    "DELETE FROM notification_log"
    " WHERE created_at <> ''"
    "   AND created_at < to_char(now() AT TIME ZONE 'UTC'"
    "       - interval '12 months', 'YYYY-MM-DD\"T\"HH24:MI:SS')"
)

SCHEMA = """
CREATE TABLE notification_log (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL DEFAULT '',
    recipient TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ''
)
"""


def _iso(days_ago: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()


@pytest.fixture
def db(isolated_postgres):
    with psycopg.connect(isolated_postgres, autocommit=True) as conn:
        conn.execute(SCHEMA)
    return isolated_postgres


def test_purge_removes_only_records_past_twelve_months(db):
    with psycopg.connect(db, autocommit=True) as conn:
        for name, days in [
            ("ancient", 900),
            ("just_over", 366),
            ("just_under", 364),
            ("recent", 1),
        ]:
            conn.execute(
                "INSERT INTO notification_log (id, recipient, body, created_at)"
                " VALUES (%s, %s, %s, %s)",
                (name, "+919000000000", "your verification link", _iso(days)),
            )
        # A row written before created_at was populated must not be deleted by
        # an empty string sorting below every real timestamp.
        conn.execute(
            "INSERT INTO notification_log (id, created_at) VALUES ('blank', '')")

        removed = conn.execute(PURGE).rowcount
        kept = {r[0] for r in conn.execute("SELECT id FROM notification_log")}

    assert removed == 2
    assert kept == {"just_under", "recent", "blank"}
