"""Government geography reference data and auditable LGD synchronization.

The Ministry of Panchayati Raj Local Government Directory (LGD) is the
canonical national source for states, districts, sub-districts and villages.
Pattadar calls a sub-district a mandal in the product, but retains the official
LGD level name and code on every row.

The relational columns are intentionally denormalised with their ancestry.
That keeps reads cheap today and lets the same records move to a document store
later without reconstructing a village's state and district from three joins.
"""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Iterable, Iterator
from urllib.parse import urlsplit, urlunsplit


LGD_SOURCE_ID = "gov-in-lgd"
LEGACY_SOURCE_ID = "pattadar-bundled-ap-igrs"

LGD_CATALOG_URL = "https://www.data.gov.in/catalog/local-government-directory-lgd"
LGD_PORTAL_URL = "https://lgdirectory.gov.in/"
LGD_LICENSE_URL = "https://www.data.gov.in/Godl"

RESOURCE_URLS = {
    "state": "https://www.data.gov.in/resource/local-government-directory-lgd-states",
    "district": "https://www.data.gov.in/resource/local-government-directory-lgd-districts",
    "mandal": "https://www.data.gov.in/resource/local-government-directory-lgd-sub-districts",
    "village": "https://www.data.gov.in/resource/local-government-directory-lgd-villages",
}

ENTITY_ORDER = ("state", "district", "mandal", "village")
TABLES = {
    "state": "states",
    "district": "districts",
    "mandal": "mandals",
    "village": "villages",
}


DDL = (
    """CREATE TABLE IF NOT EXISTS reference_data_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        authority TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        catalog_url TEXT NOT NULL DEFAULT '',
        publisher_url TEXT NOT NULL DEFAULT '',
        license_name TEXT NOT NULL DEFAULT '',
        license_url TEXT NOT NULL DEFAULT '',
        cadence TEXT NOT NULL DEFAULT '',
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT ''
    )""",
    """CREATE TABLE IF NOT EXISTS reference_data_sync_runs (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        source_effective_at TEXT NOT NULL DEFAULT '',
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL DEFAULT '',
        files_json TEXT NOT NULL DEFAULT '[]',
        counts_json TEXT NOT NULL DEFAULT '{}',
        error TEXT NOT NULL DEFAULT ''
    )""",
    """CREATE TABLE IF NOT EXISTS reference_data_changes (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        lgd_code TEXT NOT NULL,
        change_kind TEXT NOT NULL,
        before_json TEXT NOT NULL DEFAULT '{}',
        after_json TEXT NOT NULL DEFAULT '{}',
        changed_at TEXT NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS idx_ref_sync_source_started ON reference_data_sync_runs(source_id, started_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_ref_changes_run ON reference_data_changes(run_id, entity_type)",
    "ALTER TABLE states ADD COLUMN IF NOT EXISTS lgd_code TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE states ADD COLUMN IF NOT EXISTS name_local TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE states ADD COLUMN IF NOT EXISTS country_code TEXT NOT NULL DEFAULT 'IN'",
    "ALTER TABLE districts ADD COLUMN IF NOT EXISTS lgd_code TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE districts ADD COLUMN IF NOT EXISTS name_local TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE districts ADD COLUMN IF NOT EXISTS state_lgd_code TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE districts ADD COLUMN IF NOT EXISTS state_name TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE mandals ADD COLUMN IF NOT EXISTS code TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE mandals ADD COLUMN IF NOT EXISTS lgd_code TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE mandals ADD COLUMN IF NOT EXISTS name_local TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE mandals ADD COLUMN IF NOT EXISTS state_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE mandals ADD COLUMN IF NOT EXISTS state_lgd_code TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE mandals ADD COLUMN IF NOT EXISTS state_name TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE mandals ADD COLUMN IF NOT EXISTS district_lgd_code TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE mandals ADD COLUMN IF NOT EXISTS district_name TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE mandals ADD COLUMN IF NOT EXISTS government_level_name TEXT NOT NULL DEFAULT 'Sub-District'",
    "ALTER TABLE villages ADD COLUMN IF NOT EXISTS code TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE villages ADD COLUMN IF NOT EXISTS lgd_code TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE villages ADD COLUMN IF NOT EXISTS name_local TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE villages ADD COLUMN IF NOT EXISTS state_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE villages ADD COLUMN IF NOT EXISTS district_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE villages ADD COLUMN IF NOT EXISTS state_lgd_code TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE villages ADD COLUMN IF NOT EXISTS state_name TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE villages ADD COLUMN IF NOT EXISTS district_lgd_code TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE villages ADD COLUMN IF NOT EXISTS district_name TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE villages ADD COLUMN IF NOT EXISTS mandal_lgd_code TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE villages ADD COLUMN IF NOT EXISTS mandal_name TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE villages ADD COLUMN IF NOT EXISTS census_2011_code TEXT NOT NULL DEFAULT ''",
)

_COMMON_DDL = (
    "source_id TEXT NOT NULL DEFAULT ''",
    "source_url TEXT NOT NULL DEFAULT ''",
    "source_effective_at TEXT NOT NULL DEFAULT ''",
    "source_payload TEXT NOT NULL DEFAULT '{}'",
    "row_hash TEXT NOT NULL DEFAULT ''",
    "active BOOLEAN NOT NULL DEFAULT true",
    "first_seen_at TEXT NOT NULL DEFAULT ''",
    "last_seen_at TEXT NOT NULL DEFAULT ''",
    "retired_at TEXT NOT NULL DEFAULT ''",
    "last_sync_run_id TEXT NOT NULL DEFAULT ''",
)

COMMENTS = (
    "COMMENT ON TABLE states IS 'India state and union-territory reference data. Canonical national codes: Ministry of Panchayati Raj Local Government Directory (LGD).'",
    "COMMENT ON TABLE districts IS 'India district reference data. Canonical hierarchy and codes: Ministry of Panchayati Raj Local Government Directory (LGD).'",
    "COMMENT ON TABLE mandals IS 'India sub-district reference data from LGD. The product label mandal also covers tahsil, taluk and equivalent state-specific names.'",
    "COMMENT ON TABLE villages IS 'India village reference data. Canonical hierarchy and codes: Ministry of Panchayati Raj Local Government Directory (LGD).'",
    "COMMENT ON TABLE reference_data_sync_runs IS 'One auditable ETL execution against an official reference source, including mode, version, files and row counts.'",
    "COMMENT ON TABLE reference_data_changes IS 'Append-only row deltas produced by reference-data ETL: insert, update, retire or reactivate.'",
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (value or "").lower())


def fold_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (value or "").casefold())


def public_source_url(url: str) -> str:
    """Drop credentials/query parameters before provenance is persisted."""
    if not url:
        return ""
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https"):
        return url
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


def stable_id(entity: str, lgd_code: str) -> str:
    if entity not in TABLES or not str(lgd_code).strip():
        raise ValueError("A known geography entity and LGD code are required")
    return f"lgd:{entity}:{str(lgd_code).strip()}"


def row_hash(row: dict) -> str:
    payload = {k: row[k] for k in sorted(row) if k not in ("source_payload", "row_hash")}
    return hashlib.sha256(
        json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def change_kind(before: dict | None, after: dict) -> str:
    if before is None:
        return "insert"
    if bool(before.get("active")) and not bool(after.get("active")):
        return "retire"
    if not bool(before.get("active")) and bool(after.get("active")):
        return "reactivate"
    if (before.get("row_hash") or "") != (after.get("row_hash") or ""):
        return "update"
    return "unchanged"


ALIASES = {
    "state": {
        "lgd_code": ("statecode", "state lgd code", "lgdstatecode"),
        "name": ("statenameinenglish", "state name in english", "statename", "state"),
        "name_local": ("statenameinlocal", "state name in local language", "localstatename"),
        "short_code": ("stateshortcode", "stateabbreviation", "iso31662code"),
    },
    "district": {
        "lgd_code": ("districtcode", "district lgd code", "lgddistrictcode"),
        "name": ("districtnameinenglish", "district name in english", "districtname", "district"),
        "name_local": ("districtnameinlocal", "district name in local language", "localdistrictname"),
        "state_lgd_code": ("statecode", "state lgd code", "lgdstatecode"),
        "state_name": ("statenameinenglish", "state name in english", "statename", "state"),
    },
    "mandal": {
        "lgd_code": ("subdistrictcode", "sub district code", "subdistrict lgd code", "tehsilcode", "talukcode"),
        "name": ("subdistrictnameinenglish", "sub district name in english", "subdistrictname", "tehsilname", "talukname", "mandalname"),
        "name_local": ("subdistrictnameinlocal", "sub district name in local language", "localsubdistrictname"),
        "district_lgd_code": ("districtcode", "district lgd code", "lgddistrictcode"),
        "district_name": ("districtnameinenglish", "district name in english", "districtname", "district"),
        "state_lgd_code": ("statecode", "state lgd code", "lgdstatecode"),
        "state_name": ("statenameinenglish", "state name in english", "statename", "state"),
    },
    "village": {
        "lgd_code": ("villagecode", "village lgd code", "lgdvillagecode"),
        "name": ("villagenameinenglish", "village name in english", "villagename", "village"),
        "name_local": ("villagenameinlocal", "village name in local language", "localvillagename"),
        "mandal_lgd_code": ("subdistrictcode", "sub district code", "subdistrict lgd code", "tehsilcode", "talukcode"),
        "mandal_name": ("subdistrictnameinenglish", "sub district name in english", "subdistrictname", "tehsilname", "talukname", "mandalname"),
        "district_lgd_code": ("districtcode", "district lgd code", "lgddistrictcode"),
        "district_name": ("districtnameinenglish", "district name in english", "districtname", "district"),
        "state_lgd_code": ("statecode", "state lgd code", "lgdstatecode"),
        "state_name": ("statenameinenglish", "state name in english", "statename", "state"),
        "census_2011_code": ("census2011code", "census code 2011", "villagecensuscode"),
    },
}

_ACTIVE_ALIASES = ("active", "isactive", "status", "entitystatus")


def _value(canonical: dict[str, str], aliases: Iterable[str]) -> str:
    for alias in aliases:
        value = canonical.get(_key(alias), "").strip()
        if value:
            return value
    return ""


def _active(canonical: dict[str, str]) -> bool:
    raw = _value(canonical, _ACTIVE_ALIASES).casefold()
    if not raw:
        return True
    return raw not in {"0", "false", "inactive", "deleted", "retired", "no", "n"}


def normalize_record(entity: str, raw: dict) -> dict:
    """Normalize the header variants used by LGD CSV and Data API exports."""
    if entity not in ALIASES:
        raise ValueError(f"Unknown geography entity: {entity}")
    canonical = {_key(str(k)): str(v or "").strip() for k, v in raw.items()}
    out = {field: _value(canonical, aliases) for field, aliases in ALIASES[entity].items()}
    out["active"] = _active(canonical)
    if not out.get("lgd_code") or not out.get("name"):
        raise ValueError(f"{entity} row is missing its LGD code or English name")
    parent = {"district": "state_lgd_code", "mandal": "district_lgd_code", "village": "mandal_lgd_code"}.get(entity)
    if parent and not out.get(parent):
        raise ValueError(f"{entity} {out['lgd_code']} is missing {parent}")
    out["source_payload"] = json.dumps(raw, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    out["row_hash"] = row_hash(out)
    return out


def normalize_records(entity: str, rows: Iterable[dict]) -> Iterator[tuple[dict | None, str]]:
    for number, raw in enumerate(rows, start=2):
        try:
            yield normalize_record(entity, raw), ""
        except ValueError as exc:
            yield None, f"row {number}: {exc}"


async def ensure_schema(conn) -> None:
    for statement in DDL:
        await conn.execute(statement)
    for table in TABLES.values():
        for column in _COMMON_DDL:
            name = column.split(" ", 1)[0]
            await conn.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {name} {column[len(name) + 1:]}")
    for entity, table in TABLES.items():
        await conn.execute(
            f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{table}_lgd_code ON {table}(lgd_code) WHERE lgd_code <> ''"
        )
        await conn.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{table}_source_active ON {table}(source_id, active)"
        )
    for statement in COMMENTS:
        await conn.execute(statement)
    now = _now()
    await conn.execute(
        """INSERT INTO reference_data_sources
           (id,name,authority,description,catalog_url,publisher_url,license_name,license_url,cadence,active,created_at,updated_at)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,true,%s,%s)
           ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, authority=EXCLUDED.authority,
             description=EXCLUDED.description, catalog_url=EXCLUDED.catalog_url,
             publisher_url=EXCLUDED.publisher_url, license_name=EXCLUDED.license_name,
             license_url=EXCLUDED.license_url, cadence=EXCLUDED.cadence,
             active=true, updated_at=EXCLUDED.updated_at""",
        (LGD_SOURCE_ID, "Local Government Directory (LGD)", "Ministry of Panchayati Raj, Government of India",
         "Canonical national directory of states, districts, sub-districts and villages. "
         "Data.gov.in publishes the four resources monthly; LGD also publishes modification-only exports.",
         LGD_CATALOG_URL, LGD_PORTAL_URL, "Government Open Data License - India",
         LGD_LICENSE_URL, "monthly", now, now),
    )
    await conn.execute(
        """INSERT INTO reference_data_sources
           (id,name,authority,description,catalog_url,publisher_url,license_name,license_url,cadence,active,created_at,updated_at)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,true,%s,%s)
           ON CONFLICT (id) DO NOTHING""",
        (LEGACY_SOURCE_ID, "Bundled Andhra Pradesh registration reference files",
         "Andhra Pradesh Registration and Stamps Department",
         "Transitional bundled district and mandal data retained until each row is reconciled to an LGD code.",
         "", "https://registration.ap.gov.in/", "Government reference data", "", "bundled", now, now),
    )


def _columns(entity: str) -> tuple[str, ...]:
    common = (
        "id", "name", "code", "lgd_code", "name_local", "source_id", "source_url",
        "source_effective_at", "source_payload", "row_hash", "active", "first_seen_at",
        "last_seen_at", "retired_at", "last_sync_run_id",
    )
    if entity == "state":
        return common + ("country_code",)
    if entity == "district":
        return common + ("state_id", "state_lgd_code", "state_name")
    if entity == "mandal":
        return common + (
            "district_id", "state_id", "state_lgd_code", "state_name",
            "district_lgd_code", "district_name", "government_level_name",
        )
    return common + (
        "mandal_id", "district_id", "state_id", "state_lgd_code", "state_name",
        "district_lgd_code", "district_name", "mandal_lgd_code", "mandal_name",
        "census_2011_code",
    )


async def _parent_maps(conn, entity: str) -> dict[str, dict[str, dict]]:
    needed = {
        "state": (),
        "district": ("state",),
        "mandal": ("state", "district"),
        "village": ("state", "district", "mandal"),
    }[entity]
    out: dict[str, dict[str, dict]] = {name: {} for name in TABLES}
    for parent_entity in needed:
        table = TABLES[parent_entity]
        rows = await (await conn.execute(
            f"SELECT * FROM {table} WHERE lgd_code <> ''"
        )).fetchall()
        out[parent_entity] = {str(row["lgd_code"]): dict(row) for row in rows}
    return out


def _summary(row: dict | None) -> dict:
    if not row:
        return {}
    return {key: row.get(key) for key in (
        "id", "name", "lgd_code", "active", "state_lgd_code",
        "district_lgd_code", "mandal_lgd_code", "row_hash",
    ) if key in row}


def _legacy_key(entity: str, row: dict) -> tuple:
    if entity == "state":
        return (fold_name(row.get("name") or ""),)
    if entity == "district":
        return (row.get("state_id") or "", fold_name(row.get("name") or ""))
    if entity == "mandal":
        return (row.get("district_id") or "", fold_name(row.get("name") or ""))
    return (row.get("mandal_id") or "", fold_name(row.get("name") or ""))


def _db_row(entity: str, row: dict, parents: dict, existing: dict | None,
            *, run_id: str, effective_at: str, source_url: str, now: str) -> dict:
    parent: dict = {}
    if entity == "district":
        parent = parents["state"].get(row["state_lgd_code"], {})
    elif entity == "mandal":
        parent = parents["district"].get(row["district_lgd_code"], {})
    elif entity == "village":
        parent = parents["mandal"].get(row["mandal_lgd_code"], {})
    if entity != "state" and not parent:
        raise ValueError(f"{entity} {row['lgd_code']} has no imported parent")

    result = {
        "id": (existing or {}).get("id") or stable_id(entity, row["lgd_code"]),
        "name": row["name"],
        "code": row.get("short_code") or row["lgd_code"],
        "lgd_code": row["lgd_code"],
        "name_local": row.get("name_local") or "",
        "source_id": LGD_SOURCE_ID,
        "source_url": public_source_url(source_url or RESOURCE_URLS[entity]),
        "source_effective_at": effective_at,
        "source_payload": row["source_payload"],
        "row_hash": row["row_hash"],
        "active": bool(row["active"]),
        "first_seen_at": (existing or {}).get("first_seen_at") or now,
        "last_seen_at": now,
        "retired_at": "" if row["active"] else ((existing or {}).get("retired_at") or now),
        "last_sync_run_id": run_id,
    }
    if entity == "state":
        result["country_code"] = "IN"
    elif entity == "district":
        result.update({
            "state_id": parent["id"], "state_lgd_code": row["state_lgd_code"],
            "state_name": row.get("state_name") or parent["name"],
        })
    elif entity == "mandal":
        state_code = row.get("state_lgd_code") or parent.get("state_lgd_code") or ""
        state = parents["state"].get(state_code, {})
        result.update({
            "district_id": parent["id"],
            "state_id": state.get("id") or parent.get("state_id") or "",
            "state_lgd_code": state_code,
            "state_name": row.get("state_name") or state.get("name") or parent.get("state_name") or "",
            "district_lgd_code": row["district_lgd_code"],
            "district_name": row.get("district_name") or parent["name"],
            "government_level_name": "Sub-District",
        })
    else:
        district_code = row.get("district_lgd_code") or parent.get("district_lgd_code") or ""
        state_code = row.get("state_lgd_code") or parent.get("state_lgd_code") or ""
        district = parents["district"].get(district_code, {})
        state = parents["state"].get(state_code, {})
        result.update({
            "mandal_id": parent["id"],
            "district_id": district.get("id") or parent.get("district_id") or "",
            "state_id": state.get("id") or parent.get("state_id") or "",
            "state_lgd_code": state_code,
            "state_name": row.get("state_name") or state.get("name") or parent.get("state_name") or "",
            "district_lgd_code": district_code,
            "district_name": row.get("district_name") or district.get("name") or parent.get("district_name") or "",
            "mandal_lgd_code": row["mandal_lgd_code"],
            "mandal_name": row.get("mandal_name") or parent["name"],
            "census_2011_code": row.get("census_2011_code") or "",
        })
    return result


async def _record_changes(conn, run_id: str, entity: str,
                          changes: list[tuple[str, dict | None, dict]], now: str) -> None:
    rows = []
    for kind, before, after in changes:
        if kind == "unchanged":
            continue
        rows.append((
            str(uuid.uuid4()), run_id, LGD_SOURCE_ID, entity, after["id"], after["lgd_code"],
            kind, json.dumps(_summary(before), sort_keys=True),
            json.dumps(_summary(after), sort_keys=True), now,
        ))
    if rows:
        async with conn.cursor() as cursor:
            await cursor.executemany(
                """INSERT INTO reference_data_changes
                   (id,run_id,source_id,entity_type,entity_id,lgd_code,change_kind,before_json,after_json,changed_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                rows,
            )


async def sync_entity(conn, entity: str, rows: Iterable[dict], *, run_id: str,
                      mode: str, effective_at: str, source_url: str = "",
                      batch_size: int = 1000) -> dict:
    """Upsert one LGD entity stream and append its material row deltas."""
    if entity not in TABLES:
        raise ValueError(f"Unknown geography entity: {entity}")
    if mode not in ("snapshot", "delta"):
        raise ValueError("Reference sync mode must be snapshot or delta")
    table = TABLES[entity]
    columns = _columns(entity)
    update = ",".join(f"{column}=EXCLUDED.{column}" for column in columns if column != "id")
    placeholders = ",".join(["%s"] * len(columns))
    upsert_sql = (
        f"INSERT INTO {table} ({','.join(columns)}) VALUES ({placeholders}) "
        f"ON CONFLICT (id) DO UPDATE SET {update}"
    )
    now = _now()
    stats = {"seen": 0, "inserted": 0, "updated": 0, "retired": 0,
             "reactivated": 0, "unchanged": 0, "rejected": 0, "errors": []}
    parents = await _parent_maps(conn, entity)
    legacy_rows = await (await conn.execute(
        f"SELECT * FROM {table} WHERE lgd_code = ''"
    )).fetchall()
    legacy = {_legacy_key(entity, dict(row)): dict(row) for row in legacy_rows}

    batch: list[dict] = []

    async def flush() -> None:
        if not batch:
            return
        codes = [row["lgd_code"] for row in batch]
        existing_rows = await (await conn.execute(
            f"SELECT * FROM {table} WHERE lgd_code = ANY(%s)", (codes,)
        )).fetchall()
        existing_by_code = {str(row["lgd_code"]): dict(row) for row in existing_rows}
        writes: list[tuple] = []
        changes: list[tuple[str, dict | None, dict]] = []
        for row in batch:
            existing = existing_by_code.get(row["lgd_code"])
            if not existing:
                if entity == "state":
                    natural = (fold_name(row["name"]),)
                else:
                    parent_entity = {"district": "state", "mandal": "district", "village": "mandal"}[entity]
                    parent_code = row[{"district": "state_lgd_code", "mandal": "district_lgd_code", "village": "mandal_lgd_code"}[entity]]
                    parent = parents[parent_entity].get(parent_code, {})
                    natural = (parent.get("id") or "", fold_name(row["name"]))
                existing = legacy.get(natural)
            try:
                after = _db_row(entity, row, parents, existing, run_id=run_id,
                                effective_at=effective_at,
                                source_url=source_url or RESOURCE_URLS[entity], now=now)
            except ValueError as exc:
                stats["rejected"] += 1
                if len(stats["errors"]) < 25:
                    stats["errors"].append(str(exc))
                continue
            kind = change_kind(existing, after)
            stats[{"insert": "inserted", "update": "updated", "retire": "retired",
                   "reactivate": "reactivated", "unchanged": "unchanged"}[kind]] += 1
            writes.append(tuple(after[column] for column in columns))
            changes.append((kind, existing, after))
        if writes:
            async with conn.cursor() as cursor:
                await cursor.executemany(upsert_sql, writes)
        await _record_changes(conn, run_id, entity, changes, now)
        batch.clear()

    for normalized, error in normalize_records(entity, rows):
        stats["seen"] += 1
        if error:
            stats["rejected"] += 1
            if len(stats["errors"]) < 25:
                stats["errors"].append(error)
            continue
        batch.append(normalized)
        if len(batch) >= batch_size:
            await flush()
    await flush()

    if mode == "snapshot":
        missing = await (await conn.execute(
            f"SELECT * FROM {table} WHERE source_id=%s AND active=true AND last_sync_run_id<>%s",
            (LGD_SOURCE_ID, run_id),
        )).fetchall()
        retired = []
        for row in missing:
            before = dict(row)
            after = dict(before, active=False, retired_at=now, last_seen_at=now,
                         last_sync_run_id=run_id)
            retired.append(("retire", before, after))
        if missing:
            await conn.execute(
                f"UPDATE {table} SET active=false, retired_at=%s, last_seen_at=%s, last_sync_run_id=%s "
                "WHERE source_id=%s AND active=true AND last_sync_run_id<>%s",
                (now, now, run_id, LGD_SOURCE_ID, run_id),
            )
            stats["retired"] += len(missing)
            await _record_changes(conn, run_id, entity, retired, now)
    return stats


async def begin_run(conn, *, mode: str, effective_at: str, files: list[dict]) -> str:
    if mode not in ("snapshot", "delta"):
        raise ValueError("Reference sync mode must be snapshot or delta")
    run_id = str(uuid.uuid4())
    await conn.execute(
        """INSERT INTO reference_data_sync_runs
           (id,source_id,mode,status,source_effective_at,started_at,files_json)
           VALUES (%s,%s,%s,'running',%s,%s,%s)""",
        (run_id, LGD_SOURCE_ID, mode, effective_at, _now(),
         json.dumps(files, sort_keys=True, separators=(",", ":"))),
    )
    return run_id


async def finish_run(conn, run_id: str, counts: dict, error: str = "") -> None:
    await conn.execute(
        """UPDATE reference_data_sync_runs
           SET status=%s,finished_at=%s,counts_json=%s,error=%s WHERE id=%s""",
        ("failed" if error else "completed", _now(),
         json.dumps(counts, sort_keys=True, separators=(",", ":")), error[:2000], run_id),
    )
