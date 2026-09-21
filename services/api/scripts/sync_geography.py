#!/usr/bin/env python3
"""Import official LGD geography snapshots or modification files.

Examples:
  APP_PG_DSN=... .local/api-venv/bin/python services/api/scripts/sync_geography.py \
    --mode snapshot --effective-at 2026-09-01 \
    --states states.csv --districts districts.csv \
    --subdistricts subdistricts.csv --villages villages.csv

Inputs may be local CSV/JSON files or HTTPS URLs on a ``gov.in`` host. Data API
JSON responses are accepted when their rows are under ``records``. URL query
parameters (including API keys) are never stored in the provenance ledger.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import hashlib
import json
import os
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator
from urllib.parse import urlsplit

import httpx
import psycopg
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "services" / "api"))

from src import geography  # noqa: E402


MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024


@dataclass(frozen=True)
class InputArtifact:
    path: Path
    name: str
    source: str
    sha256: str
    byte_count: int
    temporary: bool = False


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Synchronize Ministry of Panchayati Raj LGD geography")
    parser.add_argument("--mode", choices=("snapshot", "delta"), required=True)
    parser.add_argument("--effective-at", required=True, help="Source version/date, for example 2026-09-01")
    parser.add_argument("--states")
    parser.add_argument("--districts")
    parser.add_argument("--subdistricts", help="LGD sub-districts; stored as mandals")
    parser.add_argument("--villages")
    parser.add_argument("--dry-run", action="store_true", help="Validate and count rows without touching PostgreSQL")
    return parser


def _is_url(value: str) -> bool:
    return urlsplit(value).scheme in ("http", "https")


def _allow_url(value: str) -> None:
    parts = urlsplit(value)
    host = (parts.hostname or "").lower()
    if parts.scheme != "https" or not (host == "gov.in" or host.endswith(".gov.in")):
        raise ValueError("Remote geography inputs must use HTTPS on a gov.in host")


def _digest(path: Path) -> tuple[str, int]:
    digest = hashlib.sha256()
    total = 0
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            total += len(chunk)
            if total > MAX_DOWNLOAD_BYTES:
                raise ValueError("Government geography input exceeds the 512 MB safety limit")
            digest.update(chunk)
    return digest.hexdigest(), total


async def _read_input(value: str) -> InputArtifact:
    if not _is_url(value):
        path = Path(value).expanduser().resolve()
        sha256, byte_count = _digest(path)
        return InputArtifact(path, path.name, value, sha256, byte_count)
    _allow_url(value)
    suffix = Path(urlsplit(value).path).suffix or ".csv"
    file_descriptor, temp_name = tempfile.mkstemp(prefix="pattadar-lgd-", suffix=suffix)
    os.close(file_descriptor)
    path = Path(temp_name)
    digest = hashlib.sha256()
    total = 0
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=120) as client:
            async with client.stream("GET", value) as response:
                response.raise_for_status()
                with path.open("wb") as handle:
                    async for chunk in response.aiter_bytes():
                        total += len(chunk)
                        if total > MAX_DOWNLOAD_BYTES:
                            raise ValueError("Government geography download exceeds the 512 MB safety limit")
                        digest.update(chunk)
                        handle.write(chunk)
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return InputArtifact(
        path=path,
        name=Path(urlsplit(value).path).name or "government-export",
        source=value,
        sha256=digest.hexdigest(),
        byte_count=total,
        temporary=True,
    )


def _rows(artifact: InputArtifact) -> Iterator[dict]:
    with artifact.path.open("r", encoding="utf-8-sig", newline="") as handle:
        first = handle.read(1)
        handle.seek(0)
        if artifact.name.lower().endswith(".json") or first in ("{", "["):
            body = json.load(handle)
            rows = body.get("records", body.get("data", [])) if isinstance(body, dict) else body
            if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
                raise ValueError(f"{artifact.name} does not contain a JSON row array")
            yield from rows
            return
        yield from csv.DictReader(handle)


def _manifest(entity: str, artifact: InputArtifact) -> dict:
    return {
        "entity": entity,
        "file": artifact.name,
        "source_url": geography.public_source_url(artifact.source) if _is_url(artifact.source) else geography.RESOURCE_URLS[entity],
        "sha256": artifact.sha256,
        "bytes": artifact.byte_count,
    }


async def _main() -> int:
    args = _parser().parse_args()
    inputs = {
        "state": args.states,
        "district": args.districts,
        "mandal": args.subdistricts,
        "village": args.villages,
    }
    if not any(inputs.values()):
        raise SystemExit("At least one geography input is required")

    loaded: dict[str, InputArtifact] = {}
    manifests: list[dict] = []
    try:
        for entity in geography.ENTITY_ORDER:
            source = inputs[entity]
            if not source:
                continue
            loaded[entity] = await _read_input(source)
            manifests.append(_manifest(entity, loaded[entity]))

        if args.dry_run:
            report = {}
            for entity, artifact in loaded.items():
                accepted = rejected = 0
                errors = []
                for normalized, error in geography.normalize_records(entity, _rows(artifact)):
                    if normalized:
                        accepted += 1
                    else:
                        rejected += 1
                        if len(errors) < 10:
                            errors.append(error)
                report[entity] = {
                    "rows": accepted + rejected,
                    "accepted": accepted,
                    "rejected": rejected,
                    "errors": errors,
                }
            print(json.dumps({"mode": args.mode, "effective_at": args.effective_at, "entities": report}, indent=2))
            return 1 if any(item["rejected"] for item in report.values()) else 0

        dsn = os.environ.get("APP_PG_DSN") or os.environ.get("API_DSN")
        if not dsn:
            raise SystemExit("APP_PG_DSN or API_DSN is required unless --dry-run is used")

        async with await psycopg.AsyncConnection.connect(dsn, row_factory=dict_row, autocommit=True) as conn:
            await geography.ensure_schema(conn)
            run_id = await geography.begin_run(
                conn, mode=args.mode, effective_at=args.effective_at, files=manifests,
            )
            counts: dict[str, dict] = {}
            try:
                async with conn.transaction():
                    for entity in geography.ENTITY_ORDER:
                        if entity not in loaded:
                            continue
                        source = next(item["source_url"] for item in manifests if item["entity"] == entity)
                        counts[entity] = await geography.sync_entity(
                            conn, entity, _rows(loaded[entity]), run_id=run_id, mode=args.mode,
                            effective_at=args.effective_at, source_url=source,
                        )
                await geography.finish_run(conn, run_id, counts)
            except Exception as exc:
                await geography.finish_run(conn, run_id, counts, str(exc))
                raise
        print(json.dumps({"run_id": run_id, "status": "completed", "entities": counts}, indent=2))
        return 0
    finally:
        for artifact in loaded.values():
            if artifact.temporary:
                artifact.path.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
