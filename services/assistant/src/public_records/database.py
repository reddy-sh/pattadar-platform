"""Read-only PostgreSQL access for internal public-record handlers."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

import psycopg
from psycopg.rows import dict_row

from .exceptions import PublicRecordsUnavailable
from .settings import PublicRecordSettings

_ALLOWED_LOCAL_SETTINGS = {
    "hnsw.ef_search",
    "pg_trgm.similarity_threshold",
}


def _coerce(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _jsonify(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{key: _coerce(value) for key, value in row.items()} for row in rows]


class ReadOnlyDatabase:
    """Executes bounded queries in PostgreSQL read-only transactions."""

    def __init__(self, settings: PublicRecordSettings):
        self.settings = settings

    async def fetch_all(
        self,
        sql: str,
        params: dict[str, Any] | None = None,
        *,
        local_settings: dict[str, str | int | float] | None = None,
    ) -> list[dict[str, Any]]:
        if not self.settings.configured:
            raise PublicRecordsUnavailable("Public records are temporarily unavailable.")
        invalid = set(local_settings or ()) - _ALLOWED_LOCAL_SETTINGS
        if invalid:
            raise ValueError(f"Unsupported local PostgreSQL setting: {sorted(invalid)[0]}")

        try:
            conn = await psycopg.AsyncConnection.connect(
                self.settings.database_dsn,
                row_factory=dict_row,
                connect_timeout=5,
            )
            try:
                async with conn.transaction():
                    await conn.execute("SET TRANSACTION READ ONLY")
                    await conn.execute(
                        "SELECT set_config('statement_timeout', %s, true)",
                        (str(self.settings.query_timeout_ms),),
                    )
                    for name, value in (local_settings or {}).items():
                        await conn.execute(
                            "SELECT set_config(%s, %s, true)",
                            (name, str(value)),
                        )
                    cursor = await conn.execute(sql, params or {})
                    rows = await cursor.fetchall()
                return _jsonify(rows)
            finally:
                await conn.close()
        except PublicRecordsUnavailable:
            raise
        except (psycopg.Error, OSError) as exc:
            raise PublicRecordsUnavailable(
                "Public records are temporarily unavailable."
            ) from exc

    async def inspect_schema(self) -> dict[str, bool]:
        """Return corpus table readiness without leaking connection details."""
        rows = await self.fetch_all(
            "SELECT to_regclass(%(records)s) IS NOT NULL AS records, "
            "to_regclass(%(party)s) IS NOT NULL AS party, "
            "to_regclass(%(vectors)s) IS NOT NULL AS vectors",
            {
                "records": self.settings.records_fqn,
                "party": self.settings.party_fqn,
                "vectors": self.settings.boundary_vectors_fqn,
            },
        )
        return rows[0] if rows else {"records": False, "party": False, "vectors": False}
