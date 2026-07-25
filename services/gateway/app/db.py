"""PostgreSQL access for the gateway (hub database).

Mirrors the slice of rhub's providers/postgres/postgres.py that the ported
gateway modules use: a shared psycopg connection pool, ``query_native`` and
``_get_conn`` — so storage_service.py ports with a one-line import change.

Startup schema bootstrap: sql/init.sql (all IF NOT EXISTS) is executed under
a pg_advisory_lock so multiple workers/tasks racing at boot can't collide.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, List, Optional

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

_log = logging.getLogger("pattadar.gateway.db")

# Arbitrary-but-stable advisory lock key for schema bootstrap.
_SCHEMA_LOCK_KEY = 7_312_2026_01


def _conninfo() -> str:
    host = os.getenv("PG_HOST", "localhost")
    port = os.getenv("PG_PORT", "5432")
    user = os.getenv("PG_USER", "rhub")
    password = os.getenv("PG_PASSWORD", "")
    database = os.getenv("PG_DATABASE", "hub")
    return f"host={host} port={port} dbname={database} user={user} password={password}"


_pool: Optional[ConnectionPool] = None


def _get_pool() -> ConnectionPool:
    """Return the shared connection pool (created on first call)."""
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            conninfo=_conninfo(),
            min_size=1,
            max_size=10,
            kwargs={"row_factory": dict_row},
            open=True,
        )
        _log.info("pg.pool_created")
    return _pool


def _get_conn():
    """Pool connection context manager. Commits on clean ``with`` exit,
    rolls back on exception (psycopg_pool semantics) — same contract the
    ported storage/service code relies on."""
    return _get_pool().connection()


def query_native(
    table: str, sql: str, params: Optional[List[Any]] = None, camel_case: bool = False
) -> List[dict]:
    """Run a SELECT and return rows as dicts.

    Signature-compatible with rhub's db.query_native so ported call sites
    don't change. ``table`` and ``camel_case`` are accepted and ignored —
    the ported callers always pass camel_case=False and do their own
    camelCasing.
    """
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or [])
            return [dict(r) for r in cur.fetchall()]


def ensure_schema() -> None:
    """Create the tables the gateway touches (storage_*, model catalog).

    Every statement in sql/init.sql is IF NOT EXISTS / ON CONFLICT DO
    NOTHING, so this is safe to run at every boot and against a hub DB that
    already has the tables. Serialized across processes via advisory lock.
    """
    sql_path = Path(__file__).resolve().parent.parent / "sql" / "init.sql"
    ddl = sql_path.read_text()
    with psycopg.connect(_conninfo(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_lock(%s)", [_SCHEMA_LOCK_KEY])
            try:
                cur.execute(ddl)
            finally:
                cur.execute("SELECT pg_advisory_unlock(%s)", [_SCHEMA_LOCK_KEY])
    _log.info("pg.schema_ensured")


def close() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None
