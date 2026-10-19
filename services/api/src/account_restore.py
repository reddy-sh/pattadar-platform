"""Restore an account's records from a Pattadar backup archive.

The archive is a file the person held and could have edited, so nothing in it
is trusted:

- Only RESTORE_ORDER tables are written. Money, orders, shares, consents,
  invitations, the audit trail, the Aadhaar vault and assistant chats stay in
  the archive for reference; the report counts them.
- Every row gets a new id and the importing owner. References between rows are
  remapped through the archive's own ids, and a reference to a row that is not
  restored is cleared rather than left pointing at nothing (or at somebody
  else). A row whose parent is not restored is skipped: without its parent it
  belongs to nobody.
- Anything the platform attests, and an owner could never have set by hand, is
  reset: photo verification and who took it, invitation and contact
  verification, links to other people's accounts, order provenance.
- Stored-file references go through the job's node map, which the gateway
  filled only with nodes it checked this owner owns.
- Folders are put back where the archive says. A folder whose parent is
  missing goes to the top of Documents; a loop in the parent chain is broken;
  a sibling name clash takes "(2)"; the one folder per (person, feature) is
  reused when it already exists. Nothing is ever overwritten.

Runs inside the caller's transaction, one savepoint per row: a bad row is
skipped and counted, and anything unexpected rolls the whole restore back.
No AI provider is ever called from here.
"""
from __future__ import annotations

import json
import re
import secrets
import uuid
from collections import Counter, defaultdict
from typing import Any, Optional

import psycopg
from psycopg import sql

from .ids import uuid7

# Parents before children. The schema has almost no foreign keys, so the order
# is for the few it has (combined_property_*) and for readability.
RESTORE_ORDER = (
    "groups", "projects", "passbooks", "parcels", "parcel_fields", "parcel_owners",
    "properties", "property_owners", "family_members", "vault_folders",
    "registered_documents", "document_parties", "documents", "document_links",
    "document_record_links", "document_versions", "land_features",
    "parcel_photos", "property_photos", "land_expenses", "notes", "record_tags",
    "boundary_marks", "record_people", "record_owners", "record_transfers",
    "record_transfer_parties", "purchase_lots", "capital_costs",
    "combined_properties", "combined_property_members", "combined_property_expenses",
    "favourites", "setup_tasks", "waiting_items",
)

#: The profile fields a person types themselves. Never roles, email (that is
#: the sign-in identity), MFA, or the Aadhaar reference.
PROFILE_COLUMNS = ("name", "mobile", "language", "notification_prefs", "districts_of_interest", "address")

#: Columns holding a stored-file node id.
FILE_COLUMNS = {
    "documents": ("file_ref",), "registered_documents": ("file_ref",),
    "parcel_photos": ("file_ref",), "property_photos": ("file_ref",),
    "land_expenses": ("receipt_file_ref",), "combined_property_expenses": ("receipt_file_ref",),
    "record_people": ("photo_ref",), "record_owners": ("photo_ref",),
}

#: A row means nothing without its parent: skipped when the parent is not restored.
REQUIRED_PARENT = {
    "parcels": ("passbook_id", "passbooks"),
    "parcel_fields": ("parcel_id", "parcels"),
    "parcel_owners": ("parcel_id", "parcels"),
    "parcel_photos": ("parcel_id", "parcels"),
    "property_owners": ("property_id", "properties"),
    "property_photos": ("property_id", "properties"),
    "document_parties": ("document_id", "registered_documents"),
    "document_versions": ("document_id", "documents"),
    "document_record_links": ("document_id", "documents"),
    "combined_property_members": ("combined_property_id", "combined_properties"),
    "combined_property_expenses": ("combined_property_id", "combined_properties"),
    "record_transfer_parties": ("transfer_id", "record_transfers"),
}

#: Where a row sits in the Documents tree: cleared (top of Documents) when the
#: folder is not restored, instead of pointing at a folder that does not exist.
TREE_COLUMNS = {("vault_folders", "parent_id"), ("documents", "folder_id")}

DEFAULT = object()  # leave the column out, so the database default applies

#: What the platform attests. Reset, never copied from a file someone held.
RESET: dict[str, dict[str, Any]] = {
    "parcel_photos": {"verified": False, "captured_by": "", "device_clock_ok": False,
                      "pin_distance_m": 0, "order_ref": ""},
    "property_photos": {"verified": False, "captured_by": "", "device_clock_ok": False,
                        "pin_distance_m": 0, "order_ref": ""},
    "record_transfers": {"verified": False},
    "documents": {"order_ref": "", "aadhaar_record_id": ""},
    "land_features": {"order_ref": ""},
    "family_members": {
        "invite_status": DEFAULT, "status": DEFAULT, "invite_token": DEFAULT, "invite_channel": DEFAULT,
        "phone_verified": False, "email_verified": False,
        "inactivity_email_consent": False, "inactivity_email_consent_at": "",
        "linked_principal": "", "heir_confirmed": "", "heir_note": "",
        "legacy_beneficiary_id": "", "aadhaar_record_id": "", "aadhaar_masked": "",
    },
}

#: Never written from an archive, whatever the archive says.
NEVER = {"owner_user_id", "recipient_user_id", "aadhaar_enc", "kyc_ref_enc"}

#: Where a name is shown, an Aadhaar number never is (invariant 8).
NAME_COLUMNS = {"documents": ("name", "subtitle"), "vault_folders": ("name",)}

#: Rows that count as "this account already has data".
CONTENT_TABLES = ("passbooks", "properties", "projects", "registered_documents", "documents",
                  "vault_folders", "land_features", "land_expenses", "notes", "combined_properties",
                  "record_owners", "record_people", "boundary_marks")

MAX_ROWS = 200_000
MAX_VALUE_CHARS = 8 * 1024 * 1024
_UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
_PREFIXED = re.compile(r"^([A-Za-z]{1,12})[-_]")
_AADHAAR = re.compile(r"(?<!\d)(\d{4})[ -]?(\d{4})[ -]?(\d{4})(?!\d)")
_FOLDER_NAME_MAX = 120


class RestoreRejected(ValueError):
    """The archive's records cannot be restored at all (shape, size)."""


def _s(value: Any) -> str:
    return "" if value is None else str(value)


def new_id_like(old: str) -> str:
    """A fresh id in the same family as the old one: a UUID for a UUID, the
    same prefix for 'doc-…'/'fld-…' ids, so code that reads a prefix still
    recognises it. A UUID or a legacy 'rec-' property id gets a UUIDv7, which
    is what a Pattadar property id is now."""
    if _UUID.match(old) or old.startswith("rec-"):
        return uuid7()
    match = _PREFIXED.match(old)
    if match:
        return f"{match.group(1)}-{secrets.token_hex(10)}"
    return str(uuid.uuid4())


def mask_aadhaar(text: str) -> str:
    return _AADHAAR.sub(lambda m: f"XXXX XXXX {m.group(3)}", text)


def _scalar(value: Any) -> bool:
    return value is None or isinstance(value, (str, int, float, bool))


def _remap_json(value: Any, replace: dict[str, str]) -> tuple[Any, bool]:
    if isinstance(value, str):
        return (replace[value], True) if value in replace else (value, False)
    if isinstance(value, list):
        changed = False
        out = []
        for item in value:
            new, c = _remap_json(item, replace)
            out.append(new)
            changed |= c
        return out, changed
    if isinstance(value, dict):
        changed = False
        out = {}
        for key, item in value.items():
            new, c = _remap_json(item, replace)
            out[key] = new
            changed |= c
        return out, changed
    return value, False


def remap_text(value: str, replace: dict[str, str], dangling: set[str]) -> str:
    """An id this archive restores becomes its new id; an id of a row it does
    not restore becomes ''. JSON held in a text column is walked the same way
    (ids inside it are remapped, never cleared), and left byte-for-byte as it
    was when nothing in it changes."""
    if value in replace:
        return replace[value]
    if value in dangling:
        return ""
    if value[:1] in "[{":
        try:
            parsed = json.loads(value)
        except ValueError:
            return value
        new, changed = _remap_json(parsed, replace)
        if changed:
            return json.dumps(new, ensure_ascii=False)
    return value


def infer_old_owner(data: dict) -> str:
    users = data.get("users")
    if isinstance(users, list):
        for row in users:
            if isinstance(row, dict) and row.get("id"):
                return _s(row["id"])
    owners = Counter(_s(r.get("owner_user_id")) for rows in data.values() if isinstance(rows, list)
                     for r in rows if isinstance(r, dict) and r.get("owner_user_id"))
    return owners.most_common(1)[0][0] if owners else ""


def break_folder_cycles(rows: list[dict]) -> int:
    """Clear the parent of one folder in every loop of the parent chain.
    Returns how many loops were broken."""
    parent = {_s(r.get("id")): _s(r.get("parent_id")) for r in rows if r.get("id")}
    broken = 0
    for start in list(parent):
        seen: list[str] = []
        cur = start
        while cur and cur in parent and cur not in seen:
            seen.append(cur)
            cur = parent[cur]
        if cur and cur in seen:
            parent[cur] = ""
            broken += 1
    for r in rows:
        if r.get("id") and _s(r.get("parent_id")) and parent.get(_s(r["id"])) == "":
            r["parent_id"] = ""
    return broken


def _free_name(taken: set[str], name: str) -> str:
    if name.lower() not in taken:
        return name
    n = 2
    while f"{name} ({n})".lower() in taken:
        n += 1
    return f"{name} ({n})"


async def catalog_for(conn) -> dict[str, set[str]]:
    rows = await (await conn.execute(
        "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'")).fetchall()
    out: dict[str, set[str]] = defaultdict(set)
    for r in rows:
        out[r["table_name"]].add(r["column_name"])
    return out


async def content_counts(conn, uid: str) -> dict[str, int]:
    """What already makes this account non-empty. Groups and their 'self'
    members are not content: the app makes those on its own."""
    catalog = await catalog_for(conn)
    counts: dict[str, int] = {}
    for table in CONTENT_TABLES:
        if "owner_user_id" in catalog.get(table, ()):
            row = await (await conn.execute(
                sql.SQL("SELECT count(*) AS n FROM {} WHERE owner_user_id=%s").format(sql.Identifier(table)),
                (uid,))).fetchone()
            if row["n"]:
                counts[table] = int(row["n"])
    if "is_self" in catalog.get("family_members", ()):
        row = await (await conn.execute(
            "SELECT count(*) AS n FROM family_members WHERE owner_user_id=%s AND NOT is_self", (uid,))).fetchone()
        if row["n"]:
            counts["family_members"] = int(row["n"])
    return counts


class Report:
    def __init__(self) -> None:
        self.restored: Counter = Counter()
        self.merged: Counter = Counter()
        self.skipped: Counter = Counter()
        self.reference_only: Counter = Counter()
        self.notes: list[str] = []
        self.files_restored = 0
        self.files_missing = 0
        self.placed_at_top = 0
        self.renamed_folders = 0
        self.loops_broken = 0
        self.profile = False

    def as_dict(self) -> dict:
        return {
            "restored": dict(self.restored), "merged": dict(self.merged), "skipped": dict(self.skipped),
            "referenceOnly": dict(self.reference_only),
            "files": {"linked": self.files_restored, "notInBackup": self.files_missing},
            "placedAtTop": self.placed_at_top, "renamedFolders": self.renamed_folders,
            "loopsBroken": self.loops_broken, "profile": self.profile, "notes": self.notes,
        }


def validate_shape(data: Any) -> dict[str, list]:
    if not isinstance(data, dict):
        raise RestoreRejected("This backup's records are not in the expected shape.")
    total = 0
    out: dict[str, list] = {}
    for table, rows in data.items():
        if not isinstance(table, str) or len(table) > 64 or not isinstance(rows, list):
            raise RestoreRejected("This backup's records are not in the expected shape.")
        total += len(rows)
        out[table] = rows
    if total > MAX_ROWS:
        raise RestoreRejected(f"This backup has more than {MAX_ROWS:,} records, more than a restore takes at once.")
    return out


async def _merge_defaults(conn, uid: str, data: dict, replace: dict[str, str],
                          merged: set[str], report: Report) -> None:
    """Point the archive's groups and 'self' members at the ones this account
    already has (made by the app on first use), instead of a second copy."""
    rows = await (await conn.execute(
        "SELECT g.id, g.type, g.facts, lower(g.name) AS key,"
        " (SELECT count(*) FROM family_members m WHERE m.owner_user_id=g.owner_user_id"
        "  AND m.group_id=g.id AND NOT m.is_self) AS others"
        " FROM groups g WHERE g.owner_user_id=%s ORDER BY g.created_at, g.id", (uid,))).fetchall()
    free = {(r["type"], r["key"]): r["id"] for r in rows if not r["others"]}
    blank = {r["id"] for r in rows if (r.get("facts") or "{}") == "{}"}
    for g in data.get("groups") or []:
        if not isinstance(g, dict) or not g.get("id"):
            continue
        key = (_s(g.get("type")), _s(g.get("name")).lower())
        if key in free:
            target = free.pop(key)
            replace[_s(g["id"])] = target
            merged.add(_s(g["id"]))
            # The archive's group facts (PAN, deed date...) survive the merge
            # onto an app-made group that has none of its own yet, checked
            # against the catalogue as the app would.
            values = {"type": g.get("type"), "facts": g.get("facts")}
            clean_facts("groups", values, {})
            if target in blank and values["facts"] != "{}":
                await conn.execute("UPDATE groups SET facts=%s WHERE id=%s AND owner_user_id=%s AND facts='{}'",
                                   (values["facts"], target, uid))
    selves = {r["group_id"]: r["id"] for r in await (await conn.execute(
        "SELECT id, group_id FROM family_members WHERE owner_user_id=%s AND is_self", (uid,))).fetchall()}
    for m in data.get("family_members") or []:
        if isinstance(m, dict) and m.get("is_self") and m.get("id"):
            group = replace.get(_s(m.get("group_id")), "")
            if group in selves:
                replace[_s(m["id"])] = selves.pop(group)
                merged.add(_s(m["id"]))


def clean_facts(table: str, values: dict, groups: dict) -> None:
    """Hold a restored group's or member's `facts` to the catalogue, as the
    mutations do: unknown or hidden keys dropped, anything the app would refuse
    stored as {}. `groups` maps a written group id to (type, its facts) so a
    member is checked against its own group."""
    if "facts" not in values or table not in ("groups", "family_members"):
        return
    from .main import GROUP_TYPES, _clean_facts, _parse_facts  # main imports this module lazily
    try:
        if table == "groups":
            gt = GROUP_TYPES.get(_s(values.get("type")), GROUP_TYPES["family"])
            values["facts"] = _clean_facts(_s(values["facts"]), gt["fields"]) or "{}"
            groups[_s(values.get("id"))] = (gt, _parse_facts(values["facts"]))
        else:
            gt, context = groups.get(_s(values.get("group_id")), (GROUP_TYPES["family"], {}))
            values["facts"] = _clean_facts(_s(values["facts"]), gt["member_fields"], context,
                                           _s(values.get("role"))) or "{}"
    except ValueError:
        values["facts"] = "{}"


async def _restore_profile(conn, uid: str, data: dict, old_owner: str, catalog, report: Report) -> None:
    users = [u for u in data.get("users") or [] if isinstance(u, dict)]
    row = next((u for u in users if _s(u.get("id")) == old_owner), users[0] if users else None)
    if not row:
        return
    values = {}
    for column in PROFILE_COLUMNS:
        value = row.get(column)
        if column in catalog.get("users", ()) and isinstance(value, str) and value.strip() and len(value) < 4096:
            if column == "name" and value.strip() in (old_owner, uid):
                continue  # a first-contact path seeded the uid as a name
            values[column] = value
    if not values:
        return
    await conn.execute("INSERT INTO users (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING",
                       (uid, values.get("name") or ""))
    statement = sql.SQL("UPDATE users SET {} WHERE id=%s").format(
        sql.SQL(", ").join(sql.SQL("{}=%s").format(sql.Identifier(c)) for c in values))
    await conn.execute(statement, (*values.values(), uid))
    report.profile = True


def build_row(table: str, row: dict, columns: set[str], uid: str, replace: dict[str, str],
              dangling: set[str], node_map: dict[str, str], restored_ids: dict[str, set[str]],
              report: Report) -> Optional[dict]:
    """The row as it will be written, or None when it cannot be."""
    out: dict[str, Any] = {}
    for column, value in row.items():
        if column not in columns or column in NEVER:
            continue
        if not _scalar(value) or (isinstance(value, str) and len(value) > MAX_VALUE_CHARS):
            return None
        out[column] = value
    if "owner_user_id" in columns:
        out["owner_user_id"] = uid
    parent = REQUIRED_PARENT.get(table)
    if parent:
        column, parent_table = parent
        if _s(out.get(column)) not in restored_ids.get(parent_table, set()):
            return None
    for column, value in list(out.items()):
        if column == "owner_user_id" or not isinstance(value, str) or not value:
            continue
        if column in FILE_COLUMNS.get(table, ()):
            new = node_map.get(value, "")
            if new:
                report.files_restored += 1
            else:
                report.files_missing += 1
            out[column] = new
            continue
        if (table, column) in TREE_COLUMNS:
            if value in restored_ids.get("vault_folders", set()):
                out[column] = replace[value]
            else:
                out[column] = ""
                if table == "documents":
                    report.placed_at_top += 1
            continue
        out[column] = remap_text(value, replace, dangling)
    for column, value in RESET.get(table, {}).items():
        if column not in columns:
            continue
        if value is DEFAULT:
            out.pop(column, None)
        else:
            out[column] = value
    if table in ("parcel_photos", "property_photos") and out.get("source") == "order":
        out["source"] = "upload"
    if table == "property_owners" and out.get("user_id") not in ("", None, uid):
        out["user_id"] = ""  # a link to someone else's account is not restored
    for column in NAME_COLUMNS.get(table, ()):
        if isinstance(out.get(column), str):
            out[column] = mask_aadhaar(out[column])
    return out


async def _insert(conn, table: str, values: dict) -> bool:
    columns = list(values)
    statement = sql.SQL("INSERT INTO {} ({}) VALUES ({}) ON CONFLICT DO NOTHING").format(
        sql.Identifier(table), sql.SQL(", ").join(map(sql.Identifier, columns)),
        sql.SQL(", ").join(sql.Placeholder() * len(columns)))
    cur = await conn.execute(statement, tuple(values[c] for c in columns))
    return cur.rowcount == 1


async def _update(conn, table: str, row_id: str, uid: str, values: dict) -> None:
    values = {k: v for k, v in values.items() if k not in ("id", "owner_user_id", "group_id", "is_self")}
    if not values:
        return
    statement = sql.SQL("UPDATE {} SET {} WHERE id=%s AND owner_user_id=%s").format(
        sql.Identifier(table), sql.SQL(", ").join(sql.SQL("{}=%s").format(sql.Identifier(c)) for c in values))
    await conn.execute(statement, (*values.values(), row_id, uid))


async def _place_folder(conn, uid: str, values: dict, replace: dict[str, str], old_id: str,
                        report: Report) -> Optional[bool]:
    """Reuse the (person, feature) folder when it exists; give a clashing
    name the next free "(n)". Returns None when the folder was reused."""
    person, feature = _s(values.get("person_id")), _s(values.get("feature_key"))
    if person:
        row = await (await conn.execute(
            "SELECT id FROM vault_folders WHERE owner_user_id=%s AND person_id=%s AND feature_key=%s",
            (uid, person, feature))).fetchone()
        if row:
            replace[old_id] = row["id"]
            report.merged["vault_folders"] += 1
            return None
    name = mask_aadhaar(_s(values.get("name")).strip())[:_FOLDER_NAME_MAX] or "Folder"
    taken = {r["n"] for r in await (await conn.execute(
        "SELECT lower(name) AS n FROM vault_folders WHERE owner_user_id=%s AND parent_id=%s",
        (uid, _s(values.get("parent_id"))))).fetchall()}
    free = _free_name(taken, name)
    if free != name:
        report.renamed_folders += 1
    values["name"] = free
    return True


async def restore(conn, uid: str, data: Any, node_map: dict[str, str]) -> dict:
    """Write the archive's restorable records into `uid`'s account."""
    tables = validate_shape(data)
    catalog = await catalog_for(conn)
    report = Report()
    old_owner = infer_old_owner(tables)

    for table, rows in tables.items():
        if table not in RESTORE_ORDER and table != "users" and rows:
            report.reference_only[table] += len(rows)

    archive_ids: dict[str, set[str]] = {
        table: {_s(r["id"]) for r in rows if isinstance(r, dict) and r.get("id")}
        for table, rows in tables.items()}
    restorable = set().union(*(archive_ids.get(t, set()) for t in RESTORE_ORDER))
    dangling = set().union(*(ids for t, ids in archive_ids.items() if t not in RESTORE_ORDER)) - restorable
    if old_owner:
        dangling.discard(old_owner)

    replace: dict[str, str] = {}
    merged: set[str] = set()
    await _merge_defaults(conn, uid, tables, replace, merged, report)
    for table in RESTORE_ORDER:
        for row in tables.get(table) or []:
            if isinstance(row, dict) and row.get("id") and _s(row["id"]) not in replace:
                replace[_s(row["id"])] = new_id_like(_s(row["id"]))
    for old, new in (node_map or {}).items():
        replace.setdefault(_s(old), _s(new))
    if old_owner:
        replace[old_owner] = uid

    await _restore_profile(conn, uid, tables, old_owner, catalog, report)

    restored_ids: dict[str, set[str]] = defaultdict(set)
    group_facts: dict = {}
    folders = [dict(r) for r in tables.get("vault_folders") or [] if isinstance(r, dict)]
    report.loops_broken = break_folder_cycles(folders)
    if report.loops_broken:
        tables = {**tables, "vault_folders": folders}
    # A folder's parent may come later in the list; every restorable folder id
    # is known up front so the tree can be checked before anything is written.
    restored_ids["vault_folders"] = {_s(f["id"]) for f in folders if f.get("id")}

    for table in RESTORE_ORDER:
        rows = tables.get(table) or []
        if not rows:
            continue
        columns = catalog.get(table)
        if not columns:
            report.skipped[table] += len(rows)
            continue
        if table == "vault_folders":
            rows = _parents_first(rows)
        for row in rows:
            if not isinstance(row, dict):
                report.skipped[table] += 1
                continue
            old_id = _s(row.get("id"))
            values = build_row(table, row, columns, uid, replace, dangling, node_map or {}, restored_ids, report)
            if values is None:
                report.skipped[table] += 1
                continue
            clean_facts(table, values, group_facts)
            try:
                async with conn.transaction():
                    if old_id in merged:
                        await _update(conn, table, replace[old_id], uid, values)
                        report.merged[table] += 1
                        restored_ids[table].add(old_id)
                        continue
                    if table == "vault_folders":
                        placed = await _place_folder(conn, uid, values, replace, old_id, report)
                        if placed is None:
                            continue
                    if await _insert(conn, table, values):
                        report.restored[table] += 1
                        if old_id:
                            restored_ids[table].add(old_id)
                    elif table == "vault_folders":
                        # Lost a race for the name: what was meant to go in it
                        # goes to the top of Documents rather than nowhere.
                        restored_ids["vault_folders"].discard(old_id)
                        report.skipped[table] += 1
                    else:
                        report.merged[table] += 1  # the account already had the same thing
            except psycopg.Error:
                report.skipped[table] += 1
                if table == "vault_folders":
                    restored_ids["vault_folders"].discard(old_id)
    if report.skipped:
        report.notes.append("Some records could not be restored because they were incomplete in the backup.")
    if report.files_missing:
        report.notes.append(f"{report.files_missing} records point at a file that was not in the backup.")
    if report.placed_at_top:
        report.notes.append(f"{report.placed_at_top} documents were put at the top of Documents because their folder was not in the backup.")
    return report.as_dict()


def _parents_first(rows: list) -> list:
    """Folders ordered so a parent is written before its children; the name
    check for siblings then sees the parent's final id."""
    by_id = {_s(r.get("id")): r for r in rows if isinstance(r, dict) and r.get("id")}
    out: list = []
    placed: set[str] = set()

    def place(fid: str, depth: int = 0) -> None:
        if fid in placed or fid not in by_id or depth > 64:
            return
        parent = _s(by_id[fid].get("parent_id"))
        if parent and parent in by_id:
            place(parent, depth + 1)
        placed.add(fid)
        out.append(by_id[fid])

    for fid in by_id:
        place(fid)
    out.extend(r for r in rows if not (isinstance(r, dict) and r.get("id")))
    return out
