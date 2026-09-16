"""Initialize only an explicitly named disposable test database."""
import asyncio
import os
import sys
from pathlib import Path
from psycopg.conninfo import conninfo_to_dict

dsn = os.environ.get('APP_PG_DSN', '')
name = conninfo_to_dict(dsn).get('dbname', '') if dsn else ''
if not name or not any(marker in name.lower() for marker in ('_test', '_ci', '_e2e')):
    raise SystemExit('APP_PG_DSN must explicitly name a disposable _test/_ci/_e2e database')
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'services/api'))
from src import main

async def initialize():
    await main.pool.open(wait=True)
    try:
        await main.init_db()
    finally:
        await main.pool.close()

asyncio.run(initialize())
