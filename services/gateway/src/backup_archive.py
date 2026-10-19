"""The Pattadar backup: one ZIP with an account's records and the original
bytes of every file it stores, streamed while it is written.

Inside, under one root folder ("Pattadar backup DD-MM-YYYY"):

  README.txt               what is inside, in plain words (dates DD/MM/YYYY)
  manifest.json            format, archive id, SHA-256 and size of every entry
  data/account.json        every record the API holds for the account
  data/assistant.json      assistant conversations (kept for reference)
  data/storage.json        the stored-file tree: folders, files, versions, tags
  data/files.json          one row per file in the archive: its code, entry
                           path, original name, folder path, SHA-256 and type
  Documents/…              each file where it shows in Documents
  Other files/…            stored files no document points at, by folder
  Older versions/…         a file's earlier versions, under the same path
  Trash/…                  files that are in Trash
  Assistant attachments/…  files sent in assistant chats

Every file name ends with its five-character code (backup_names.py). A restore
reads data/*.json for where each file belongs and what it is called; the entry
paths are for the person holding the ZIP.

`plan_archive` is pure; `write_archive` is the only part that reads bytes, and
`stream_archive` runs it on a worker thread so a large account starts arriving
at once instead of after every file has been read.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import queue
import threading
import zipfile
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncIterator, Callable, Iterable, Optional

from . import backup_names as names

FORMAT = "pattadar-backup"
FORMAT_VERSION = 1
IST = timezone(timedelta(hours=5, minutes=30))

#: Columns in data/account.json that point at a stored file (a storage node id).
FILE_REFERENCES = {
    "documents": ("file_ref",),
    "registered_documents": ("file_ref",),
    "parcel_photos": ("file_ref",),
    "property_photos": ("file_ref",),
    "land_expenses": ("receipt_file_ref",),
    "combined_property_expenses": ("receipt_file_ref",),
    "record_people": ("photo_ref",),
    "record_owners": ("photo_ref",),
    "aadhaar_candidates": ("card_node_id",),
    "ticket_deliverables": ("file_ref",),
}

# Already compressed: deflating them again costs time and saves nothing.
_STORED_TYPES = ("image/", "video/", "audio/", "application/pdf", "application/zip",
                 "application/vnd.google-earth.kmz")
_CHUNK = 1 << 20


@dataclass
class FileEntry:
    path: str
    code: str
    original_name: str
    mime_type: str
    size: int
    location: str                      # documents | other | older | trash | assistant
    folder_path: list[dict]            # [{id, name}] from the top of its tree
    node_id: str = ""
    version_id: str = ""
    current: bool = True
    object_key: str = ""               # never written to the archive
    attachment_id: str = ""
    conversation_id: str = ""
    created_at: str = ""
    document_ids: list[str] = field(default_factory=list)
    references: list[dict] = field(default_factory=list)
    sha256: str = ""
    withheld: str = ""                 # why the bytes are not in the archive


@dataclass
class Plan:
    archive_id: str
    made: datetime
    root: str
    entries: list[FileEntry]
    missing_references: int            # records pointing at a file that is not stored


def _s(value: Any) -> str:
    return "" if value is None else str(value)


def _when(row: dict) -> str:
    return _s(row.get("created_at"))


def _folder_paths(folders: Iterable[dict], top: Any) -> dict[str, list[dict]]:
    """Folder id → [{id, name, segment}] from the top of its tree.

    Siblings that would clash once cleaned get a code (unique_folder_segments).
    A parent that is missing, or a loop in the parent chain, ends the path
    there rather than failing the backup.
    """
    rows = {_s(f["id"]): f for f in folders}
    children: dict[str, list[dict]] = defaultdict(list)
    for f in rows.values():
        parent = _s(f.get("parent_id")) if f.get("parent_id") not in (None, top) else ""
        children[parent if parent in rows else ""].append(f)
    segment: dict[str, str] = {}
    for siblings in children.values():
        ordered = sorted(siblings, key=lambda f: (_when(f), _s(f["id"])))
        segment.update(names.unique_folder_segments((_s(f["id"]), _s(f.get("name"))) for f in ordered))
    out: dict[str, list[dict]] = {}
    for fid in rows:
        chain: list[dict] = []
        seen: set[str] = set()
        cur: Optional[str] = fid
        while cur and cur in rows and cur not in seen and len(chain) < 64:
            seen.add(cur)
            row = rows[cur]
            chain.append({"id": cur, "name": _s(row.get("name")), "segment": segment[cur]})
            parent = row.get("parent_id")
            cur = _s(parent) if parent not in (None, top) else None
        out[fid] = list(reversed(chain))
    return out


def _with_extension(display: str, stored_name: str) -> str:
    """A document named 'Aadhaar card' whose stored file is 'card.jpg' keeps
    its own name and borrows the stored file's extension."""
    _, own = names.split_extension(display)
    _, stored = names.split_extension(stored_name)
    return display if own or not stored else display + stored


def plan_archive(api_data: dict, storage: dict, assistant: dict, made: datetime,
                 archive_id: str) -> Plan:
    """Where every stored file version goes in the archive, and its code."""
    root = f"Pattadar backup {made.astimezone(IST):%d-%m-%Y}"
    nodes = {_s(n["id"]): n for n in storage.get("nodes", [])}
    versions: dict[str, list[dict]] = defaultdict(list)
    for v in storage.get("versions", []):
        versions[_s(v["node_id"])].append(v)
    for rows in versions.values():
        rows.sort(key=lambda v: (_when(v), _s(v["id"])))

    documents = sorted(api_data.get("documents") or [], key=lambda d: (_when(d), _s(d.get("id"))))
    docs_by_node: dict[str, list[dict]] = defaultdict(list)
    for d in documents:
        if _s(d.get("file_ref")) in nodes:
            docs_by_node[_s(d.get("file_ref"))].append(d)

    references: dict[str, list[dict]] = defaultdict(list)
    missing = 0
    for table, columns in FILE_REFERENCES.items():
        for row in api_data.get(table) or []:
            for column in columns:
                ref = _s(row.get(column))
                if not ref:
                    continue
                if ref in nodes:
                    references[ref].append({"table": table, "id": _s(row.get("id")), "column": column})
                else:
                    missing += 1

    vault_paths = _folder_paths(api_data.get("vault_folders") or [], top="")
    storage_folders = [n for n in nodes.values() if n.get("kind") == "folder"]
    storage_paths = _folder_paths(storage_folders, top=None)

    files = [n for n in nodes.values() if n.get("kind") == "file"]
    attachments = sorted(assistant.get("attachments") or [], key=lambda a: (_when(a), _s(a.get("id"))))
    ordered_versions = sorted((v for n in files for v in versions.get(_s(n["id"]), [])),
                              key=lambda v: (_when(v), _s(v["id"])))
    codes = names.assign_codes([f"v:{_s(v['id'])}" for v in ordered_versions]
                               + [f"a:{_s(a.get('id'))}" for a in attachments])

    entries: list[FileEntry] = []
    for node in sorted(files, key=lambda n: (_when(n), _s(n["id"]))):
        nid = _s(node["id"])
        node_versions = versions.get(nid, [])
        if not node_versions:
            continue
        docs = docs_by_node.get(nid, [])
        if docs:
            location = "documents"
            chain = vault_paths.get(_s(docs[0].get("folder_id")), [])
            display = _with_extension(_s(docs[0].get("name")) or _s(node.get("name")), _s(node.get("name")))
            base = ["Documents"]
        else:
            location = "other"
            chain = storage_paths.get(_s(node.get("parent_id")), [])
            display = _s(node.get("name"))
            base = ["Other files"]
        if node.get("trashed_at"):
            location, base = "trash", ["Trash", *base]
        current = _s(node.get("current_version_id")) or _s(node_versions[-1]["id"])
        for v in node_versions:
            vid = _s(v["id"])
            code = codes[f"v:{vid}"]
            mime = _s(v.get("mime_type") or node.get("mime_type"))
            name = names.file_entry_name(display, code, mime)
            is_current = vid == current
            segments = [c["segment"] for c in chain]
            parts = [root, *base, *segments, name] if is_current else [root, "Older versions", *base, *segments, name]
            entries.append(FileEntry(
                path="/".join(parts), code=code, original_name=display, mime_type=mime,
                size=int(v.get("size_bytes") or 0),
                location=location if is_current else "older",
                folder_path=[{"id": c["id"], "name": c["name"]} for c in chain],
                node_id=nid, version_id=vid, current=is_current, object_key=_s(v.get("object_key")),
                created_at=_when(v), document_ids=[_s(d.get("id")) for d in docs],
                references=references.get(nid, [])))
    for a in attachments:
        code = codes[f"a:{_s(a.get('id'))}"]
        name = names.file_entry_name(_s(a.get("file_name")), code, _s(a.get("mime_type")))
        entries.append(FileEntry(
            path=f"{root}/Assistant attachments/{name}", code=code, original_name=_s(a.get("file_name")),
            mime_type=_s(a.get("mime_type")), size=int(a.get("file_size") or 0), location="assistant",
            folder_path=[], attachment_id=_s(a.get("id")), conversation_id=_s(a.get("conversation_id")),
            created_at=_when(a)))
    _make_paths_unique(entries)
    return Plan(archive_id=archive_id, made=made, root=root, entries=entries, missing_references=missing)


def _make_paths_unique(entries: list[FileEntry]) -> None:
    """Belt and braces. Codes are unique, so two files never share a path; but
    a folder somebody named exactly like a coded file beside it could, and so
    could two names that differ only in case. Such a file moves on to its next
    code, which keeps it unique on a case-insensitive disk too."""
    used_codes = {e.code for e in entries}
    folders = {"/".join(e.path.split("/")[:i]).casefold()
               for e in entries for i in range(1, e.path.count("/") + 1)}
    taken: set[str] = set()
    for e in entries:
        attempt = 1
        while e.path.casefold() in taken or e.path.casefold() in folders:
            seed = f"v:{e.version_id}" if e.version_id else f"a:{e.attachment_id}"
            code = names.code_for(seed, attempt)
            attempt += 1
            if code in used_codes:
                continue
            used_codes.add(code)
            head = e.path.rpartition("/")[0]
            e.code = code
            e.path = f"{head}/{names.file_entry_name(e.original_name, code, e.mime_type)}"
        taken.add(e.path.casefold())


# ── Writing ──────────────────────────────────────────────────────────────

def _compression(mime: str) -> int:
    return zipfile.ZIP_STORED if mime.startswith(_STORED_TYPES) else zipfile.ZIP_DEFLATED


def _zipinfo(path: str, made: datetime, size: int, mime: str) -> zipfile.ZipInfo:
    local = made.astimezone(IST)
    info = zipfile.ZipInfo(path, date_time=(local.year, local.month, local.day,
                                            local.hour, local.minute, local.second))
    info.compress_type = _compression(mime)
    info.file_size = max(0, size)
    info.external_attr = 0o644 << 16
    return info


def _withheld_reason(exc: Exception) -> str:
    code = ""
    response = getattr(exc, "response", None)
    if isinstance(response, dict):
        code = str((response.get("Error") or {}).get("Code") or "")
    if code in ("AccessDenied", "403"):
        return "held back by the safety scan"
    if code == "InvalidObjectState":
        return "in long-term storage; ask support to bring it back first"
    if code in ("NoSuchKey", "404", "NotFound"):
        return "no longer stored"
    return "could not be read when this backup was made"


def _json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, indent=2, default=str).encode()


def _ddmmyyyy(value: str) -> str:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(IST).strftime("%d/%m/%Y")
    except (ValueError, AttributeError):
        return value[:10] if value else ""


def _readme(plan: Plan, profile: dict, record_count: int, written: list[FileEntry]) -> str:
    made = plan.made.astimezone(IST)
    included = [e for e in written if not e.withheld]
    held = [e for e in written if e.withheld]
    megabytes = sum(e.size for e in included) / (1024 * 1024)
    who = " ".join(x for x in (_s(profile.get("name")).strip(), f"({profile['email']})" if profile.get("email") else "") if x)
    lines = [
        "Pattadar backup",
        "",
        f"Made on {made:%d/%m/%Y} at {made:%H:%M} IST" + (f" for {who}." if who else "."),
        f"It holds {record_count} records and {len(included)} files ({megabytes:,.1f} MB).",
        "",
        "What is inside",
        "  Documents/              your files, in the folders they have in Documents",
        "  Other files/            stored files that no document points at",
        "  Older versions/         earlier versions of a file, under the same path",
        "  Trash/                  files that were in Trash",
        "  Assistant attachments/  files you sent in assistant chats",
        "  data/                   your records, in JSON",
        "  manifest.json           a fingerprint (SHA-256) of every file, to check nothing changed",
        "",
        "Every file name ends with a five-character code, for example",
        '"Sale deed 2019 · 7K3QD.pdf". The code keeps two files with the same name',
        "apart. A restore puts each file back under its original name, without the",
        "code, in the folder it came from.",
        "",
        "Restoring",
        "  Pattadar → Privacy & your data → Restore from a backup. A restore goes into",
        "  an account that has no data yet. It brings back your records and files.",
        "  Payments, wallet, orders, shares, consents, history and assistant chats stay",
        "  in this backup for reference and are not restored. Aadhaar numbers are not in",
        "  the backup (only the last four digits), so add them again after a restore.",
        "",
        "Keep this file safe. It holds copies of your documents, including Aadhaar",
        "cards and deeds, and anyone who has it can read them.",
    ]
    if plan.missing_references:
        lines += ["", f"{plan.missing_references} records point at a file that is no longer stored."]
    if held:
        lines += ["", "Files that could not be included:"]
        lines += [f"  {e.original_name} ({_ddmmyyyy(e.created_at)}): {e.withheld}" for e in held]
    return "\n".join(lines) + "\n"


def _file_rows(entries: list[FileEntry]) -> list[dict]:
    rows = []
    for e in entries:
        row = {
            "code": e.code, "archive_path": e.path, "original_name": e.original_name,
            "folder_path": e.folder_path, "location": e.location, "mime_type": e.mime_type,
            "size": e.size, "sha256": e.sha256, "created_at": e.created_at,
        }
        if e.node_id:
            row.update({"node_id": e.node_id, "version_id": e.version_id, "current": e.current,
                        "document_ids": e.document_ids, "references": e.references})
        if e.attachment_id:
            row.update({"attachment_id": e.attachment_id, "conversation_id": e.conversation_id})
        if e.withheld:
            row["withheld"] = e.withheld
        rows.append(row)
    return rows


def storage_for_archive(storage: dict) -> dict:
    """The stored-file tree as the archive carries it: no object keys and no
    owner ids, which are internal and mean nothing outside this platform."""
    def strip(rows, drop):
        return [{k: v for k, v in r.items() if k not in drop} for r in rows]
    return {
        "nodes": strip(storage.get("nodes", []), {"owner_id", "org_id", "workspace_id", "created_by", "updated_by"}),
        "versions": strip(storage.get("versions", []), {"owner_id", "object_key", "etag", "created_by"}),
        "tags": strip(storage.get("tags", []), {"owner_id"}),
        "nodeTags": strip(storage.get("nodeTags", []), {"owner_id"}),
        "shares": storage.get("shares", []),
    }


def write_archive(sink, plan: Plan, *, account: dict, assistant: dict, storage: dict,
                  open_object: Callable[[str], Any],
                  open_attachment: Optional[Callable[[str], Iterable[bytes]]] = None) -> list[FileEntry]:
    """Write the whole archive to `sink` (anything with write()). Returns the
    file entries with their SHA-256 filled in, or `withheld` set when the bytes
    could not be read. A failure part-way through a file aborts the archive:
    a half-written file must never sit in a backup that looks complete."""
    manifest: list[dict] = []
    guard = _FailClosed(sink)
    try:
        _write(zf_sink=guard, plan=plan, manifest=manifest, account=account, assistant=assistant,
               storage=storage, open_object=open_object, open_attachment=open_attachment)
    except BaseException:
        # ZipFile's own close() still runs on the way out and would write a
        # central directory that makes a broken archive look whole. Nothing
        # more reaches the person after a failure.
        guard.failed = True
        raise
    return plan.entries


class _FailClosed:
    def __init__(self, sink):
        self._sink, self.failed = sink, False

    def write(self, data) -> int:
        if self.failed:
            return len(data)
        return self._sink.write(data)

    def flush(self) -> None:
        if not self.failed and hasattr(self._sink, "flush"):
            self._sink.flush()


def _write(*, zf_sink, plan: Plan, manifest: list[dict], account: dict, assistant: dict, storage: dict,
           open_object: Callable[[str], Any],
           open_attachment: Optional[Callable[[str], Iterable[bytes]]]) -> None:
    zf = zipfile.ZipFile(zf_sink, mode="w", allowZip64=True)
    try:
        for e in plan.entries:
            try:
                if e.attachment_id:
                    if open_attachment is None:
                        raise RuntimeError("no attachment reader")
                    chunks: Iterable[bytes] = open_attachment(e.attachment_id)
                    closer = getattr(chunks, "close", None)
                else:
                    body = open_object(e.object_key)["Body"]
                    chunks = iter(lambda b=body: b.read(_CHUNK), b"")
                    closer = body.close
            except Exception as exc:  # noqa: BLE001 - reported in the archive itself
                e.withheld = _withheld_reason(exc)
                continue
            digest = hashlib.sha256()
            size = 0
            try:
                with zf.open(_zipinfo(e.path, plan.made, e.size, e.mime_type), mode="w", force_zip64=e.size > (1 << 31)) as out:
                    for chunk in chunks:
                        if not chunk:
                            continue
                        digest.update(chunk)
                        size += len(chunk)
                        out.write(chunk)
            finally:
                if closer:
                    closer()
            e.sha256, e.size = digest.hexdigest(), size
            manifest.append({"path": e.path, "sha256": e.sha256, "size": size})

        def add(path: str, data: bytes, mime: str = "application/json") -> None:
            info = _zipinfo(f"{plan.root}/{path}", plan.made, len(data), mime)
            zf.writestr(info, data)
            manifest.append({"path": info.filename, "sha256": hashlib.sha256(data).hexdigest(), "size": len(data)})

        records = sum(len(rows) for rows in (account.get("data") or {}).values() if isinstance(rows, list))
        users = (account.get("data") or {}).get("users") or [{}]
        add("data/account.json", _json_bytes(account))
        add("data/assistant.json", _json_bytes(assistant))
        add("data/storage.json", _json_bytes(storage_for_archive(storage)))
        add("data/files.json", _json_bytes(_file_rows(plan.entries)))
        add("README.txt", _readme(plan, users[0], records, plan.entries).encode(), "text/plain")
        manifest_body = {
            "format": FORMAT, "formatVersion": FORMAT_VERSION, "archiveId": plan.archive_id,
            "createdAt": plan.made.astimezone(timezone.utc).isoformat(), "root": plan.root,
            "entries": manifest,
        }
        info = _zipinfo(f"{plan.root}/manifest.json", plan.made, 0, "application/json")
        zf.writestr(info, _json_bytes(manifest_body))
    except BaseException:
        # Close the ZIP into a sink that has stopped listening: its central
        # directory would otherwise make a broken archive look whole.
        zf_sink.failed = True
        raise
    finally:
        zf.close()


# ── Streaming ────────────────────────────────────────────────────────────

class _Cancelled(Exception):
    pass


class _QueueSink:
    """A write-only file the ZIP writer fills; whole chunks go to the queue."""

    def __init__(self, q: "queue.Queue", stop: threading.Event, chunk: int = 256 * 1024):
        self._q, self._stop, self._chunk = q, stop, chunk
        self._buf = bytearray()

    def _put(self, item) -> None:
        while not self._stop.is_set():
            try:
                self._q.put(item, timeout=0.5)
                return
            except queue.Full:
                continue
        raise _Cancelled()

    def write(self, data) -> int:
        self._buf += data
        if len(self._buf) >= self._chunk:
            self._put(bytes(self._buf))
            self._buf.clear()
        return len(data)

    def flush(self) -> None:
        if self._buf:
            self._put(bytes(self._buf))
            self._buf.clear()


async def stream_archive(build: Callable[[Any], None]) -> AsyncIterator[bytes]:
    """Run `build(sink)` on a worker thread and yield what it writes. If the
    download is abandoned the worker stops at its next write."""
    q: queue.Queue = queue.Queue(maxsize=16)
    stop = threading.Event()
    done = object()

    def run() -> None:
        sink = _QueueSink(q, stop)
        try:
            build(sink)
            sink.flush()
            sink._put(done)
        except _Cancelled:
            return
        except BaseException as exc:  # noqa: BLE001 - re-raised on the event loop
            try:
                sink._put(exc)
            except _Cancelled:
                return

    worker = threading.Thread(target=run, name="backup-archive", daemon=True)
    worker.start()
    try:
        while True:
            item = await asyncio.to_thread(q.get)
            if item is done:
                return
            if isinstance(item, BaseException):
                raise item
            yield item
    finally:
        stop.set()
