"""sroOffices lists digit codes in numeric order, not text order.

Against an isolated temporary PostgreSQL; no application database is
contacted, and the test skips when postgres binaries are absent.
"""
import asyncio
from contextlib import asynccontextmanager
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import types

import psycopg
from psycopg.rows import dict_row
import pytest

from src import main

SCHEMA = """
DROP SCHEMA public CASCADE; CREATE SCHEMA public;
CREATE TABLE sro_offices (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  dr_zone TEXT NOT NULL DEFAULT '',
  district TEXT NOT NULL DEFAULT '',
  mandal TEXT NOT NULL DEFAULT ''
);
"""


def ctx():
    return {"request": types.SimpleNamespace(headers={"x-user-id": "owner"})}


@pytest.fixture(scope="module")
def isolated_postgres():
    initdb, pg_ctl = shutil.which("initdb"), shutil.which("pg_ctl")
    if not initdb or not pg_ctl or os.geteuid() == 0:
        pytest.skip("Temporary postgres requires initdb/pg_ctl and a non-root user")
    with tempfile.TemporaryDirectory(prefix="pattadar-sro-") as directory:
        root = Path(directory)
        data = root / "data"
        subprocess.run([initdb, "-D", str(data), "-A", "trust", "--no-locale", "--encoding=UTF8"],
                       check=True, capture_output=True)
        subprocess.run([pg_ctl, "-D", str(data), "-l", str(root / "postgres.log"), "-o",
                        f"-k {root} -h '' -p 55491", "-w", "start"], check=True, capture_output=True)
        try:
            yield f"host={root} port=55491 dbname=postgres"
        finally:
            subprocess.run([pg_ctl, "-D", str(data), "-m", "immediate", "-w", "stop"],
                           check=True, capture_output=True)


@pytest.fixture
def db(isolated_postgres, monkeypatch):
    with psycopg.connect(isolated_postgres, autocommit=True) as conn:
        conn.execute(SCHEMA)

    class Pool:
        @asynccontextmanager
        async def connection(self):
            async with await psycopg.AsyncConnection.connect(
                    isolated_postgres, autocommit=True, row_factory=dict_row) as conn:
                yield conn

    monkeypatch.setattr(main, "pool", Pool())
    return isolated_postgres


def run(query):
    return asyncio.run(main.schema.execute(query, context_value=ctx()))


def test_digit_codes_sort_as_numbers_and_others_go_last(db):
    with psycopg.connect(db, autocommit=True) as conn:
        for i, code in enumerate(['1010', '101', '1009', '513', '99', '0102', 'AB1'], start=1):
            conn.execute("INSERT INTO sro_offices (id, code, name) VALUES (%s, %s, %s)",
                         (f"s{i}", code, f"Office {code}"))
    result = run("{ sroOffices { code } }")
    assert result.errors is None
    assert [r["code"] for r in result.data["sroOffices"]] == \
        ['99', '101', '0102', '513', '1009', '1010', 'AB1']


def test_an_empty_directory_is_an_empty_list(db):
    result = run("{ sroOffices { code } }")
    assert result.errors is None
    assert result.data["sroOffices"] == []
