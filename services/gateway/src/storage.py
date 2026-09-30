"""Document Storage service — per-user folder tree.

Ported from the predecessor's api/gateway/storage_service.py. Metadata lives in
PostgreSQL (``storage_nodes`` / ``storage_versions``); file bytes live in
AWS S3. New objects are keyed ``{node_id}/{version_id}`` with no owner segment
(see ``_key``). Reads use the ``object_key`` stored on each version row, so objects
migrated under the predecessor's ``{owner_id}/{node_id}/{version_id}`` MinIO
layout keep that key verbatim and need zero metadata changes. Every method takes
``owner`` and filters every query by it; authorization is decided in SQL, never
by key prefix.

Deltas vs the predecessor:
- MinIO client → boto3 S3 client (task-role IAM creds, no static keys).
  Bucket ensure is a no-op existence check — the bucket is Terraform-managed.
- org/workspace scoping hardcoded to the base org 'pattadar' (columns kept).
- Share/tag MUTATION methods and public link-token reads are not ported
  (v1). Read-side share/tag awareness (_access, _attach_shares,
  _attach_tags, list_shared_children) is kept so responses and access
  behavior stay byte-compatible with the predecessor.

Renames and moves are metadata-only (no object copy). Ids are generated in
Python so the object key is known before the DB rows exist.
"""
from __future__ import annotations

import logging
import os
import uuid
from typing import Any, Callable, Optional

import psycopg

from . import database as db

_log = logging.getLogger("pattadar.gateway.storage")

_ROOT_UUID = None  # parent_id for root-level items

# org/workspace scoping: single-tenant platform — everything is 'pattadar'.
ORG_ID = "pattadar"
WORKSPACE_ID = "pattadar"

# Direct-to-S3 uploads land here until the gateway confirms them. Nothing
# outside this prefix is ever reaped on a timer, and nothing inside it is ever
# served to a reader.
PENDING_PREFIX = "pending/"

# How long a presigned upload form stays valid. Minutes, not hours: the form is
# a bearer capability to write one object, and the client uses it immediately.
PRESIGN_TTL_SECONDS = int(os.getenv("STORAGE_PRESIGN_TTL_SECONDS", "900"))


class StorageExpired(RuntimeError):
    """A share link has expired."""


class StorageForbidden(RuntimeError):
    """Caller lacks the required permission on a shared node."""


# ---------------------------------------------------------------------------
# Exceptions (mapped to HTTP status by the router)
# ---------------------------------------------------------------------------

class StorageError(RuntimeError):
    """Base error."""


class StorageNotFound(StorageError):
    """Node/version not found (or not owned by the caller)."""


class StorageTooLarge(StorageError):
    """An upload exceeded the size ceiling.

    Its own class so the direct-upload path can answer 413 like the proxied
    one does, rather than folding into the 409 a name collision means.
    """


class StorageConflict(StorageError):
    """Name collision or illegal move (cycle)."""


# ---------------------------------------------------------------------------
# Row -> camelCase for the API
# ---------------------------------------------------------------------------

_NODE_CAMEL = {
    "id": "id",
    "owner_id": "ownerId",
    "org_id": "orgId",
    "workspace_id": "workspaceId",
    "app_id": "appId",
    "parent_id": "parentId",
    "kind": "kind",
    "name": "name",
    "size_bytes": "sizeBytes",
    "mime_type": "mimeType",
    "current_version_id": "currentVersionId",
    "starred": "starred",
    "trashed_at": "trashedAt",
    "created_at": "createdAt",
    "updated_at": "updatedAt",
    "created_by": "createdBy",
    "updated_by": "updatedBy",
}

_VERSION_CAMEL = {
    "id": "id",
    "node_id": "nodeId",
    "owner_id": "ownerId",
    "object_key": "objectKey",
    "size_bytes": "sizeBytes",
    "mime_type": "mimeType",
    "etag": "etag",
    "created_at": "createdAt",
    "created_by": "createdBy",
}


def _is_missing_object(exc: Exception) -> bool:
    """Is this S3 error 'the object is not there', as opposed to a real fault?

    Reads botocore's error shape without importing it, so the storage service
    stays testable against a plain fake client. Anything unrecognised is NOT
    treated as missing — the caller re-raises, and a 500 is the honest answer
    for an error we could not classify.
    """
    response = getattr(exc, "response", None)
    if not isinstance(response, dict):
        return False
    error = response.get("Error") or {}
    if str(error.get("Code")) in {"404", "NoSuchKey", "NotFound"}:
        return True
    status = (response.get("ResponseMetadata") or {}).get("HTTPStatusCode")
    return status == 404


def _camel(row: dict, mapping: dict) -> dict:
    out: dict[str, Any] = {}
    for k, v in row.items():
        key = mapping.get(k, k)
        if isinstance(v, uuid.UUID):
            v = str(v)
        elif hasattr(v, "isoformat"):
            v = v.isoformat()
        out[key] = v
    return out


def next_free_name(name: str, taken: Callable[[str], bool]) -> str:
    """`deed.pdf` → `deed (2).pdf` → `deed (3).pdf`, skipping names in use.

    Pure but for the `taken` predicate, so the naming rule can be tested
    without a database. The extension is preserved because the suffix goes
    before it — `deed.pdf (2)` would not open on a desktop.

    Bounded at 100: past a hundred copies of one filename the person has a
    different problem, and an unbounded search here is a request that never
    returns.
    """
    stem, dot, ext = name.rpartition(".")
    if not dot:
        stem, ext = name, ""
    for n in range(2, 101):
        candidate = f"{stem} ({n}){'.' + ext if ext else ''}"
        if not taken(candidate):
            return candidate
    raise StorageConflict(f"too many files here already named '{name}'")


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class StorageService:
    def __init__(
        self,
        s3_client: Any,
        bucket: str,
        kms_key_arn: str = "",
        *,
        allow_unencrypted_local: bool = False,
    ):
        self._s3 = s3_client
        self._bucket = bucket
        self._kms_key_arn = (kms_key_arn or "").strip()
        self._allow_unencrypted_local = allow_unencrypted_local
        if not self._kms_key_arn and not self._allow_unencrypted_local:
            raise RuntimeError("STORAGE_KMS_KEY_ARN is required for deployed storage")
        self._ensure_bucket()

    def _put_args(self, *, key: str, data: bytes, mime: str) -> dict[str, Any]:
        args: dict[str, Any] = {
            "Bucket": self._bucket,
            "Key": key,
            "Body": data,
            "ContentType": mime,
        }
        if not self._allow_unencrypted_local:
            args.update({
                "ServerSideEncryption": "aws:kms",
                "SSEKMSKeyId": self._kms_key_arn,
                "BucketKeyEnabled": True,
            })
        return args

    def _ensure_bucket(self) -> None:
        """No-op existence check — the bucket is provisioned by Terraform;
        the gateway must never create buckets. Warn-only so a transient IAM
        hiccup doesn't break startup."""
        try:
            self._s3.head_bucket(Bucket=self._bucket)
        except Exception as exc:  # pragma: no cover - infra failure
            _log.warning("storage.bucket_check_failed", extra={"error": str(exc)})

    @staticmethod
    def _key(owner: str, node_id: str, version_id: str) -> str:
        """The object key for a version's bytes.

        The owner is deliberately NOT in the key. Authorization is decided in
        SQL by ``_access``, never by key prefix, so an owner segment bought
        nothing — and it cost: the identity the gateway derives for a caller
        has changed shape before now, which stranded bytes under a key no
        later request could rebuild. Reads never re-derive this; they use the
        ``object_key`` stored on the version row, so existing objects keep
        their old keys and keep working.

        ``owner`` stays in the signature because callers pass it positionally
        and the argument documents who the write is for.
        """
        return f"{node_id}/{version_id}"

    @staticmethod
    def _pending_key(upload_id: str) -> str:
        """Where a direct-to-S3 upload lands before the gateway confirms it.

        Its own prefix so a lifecycle rule can reap uploads that were started
        and never completed, without that rule ever being able to see a live
        object.
        """
        return f"{PENDING_PREFIX}{upload_id}"

    # -- reads --------------------------------------------------------------

    def list_children(
        self,
        owner: str,
        parent_id: Optional[str],
        view: str = "files",
        q: Optional[str] = None,
        tag_id: Optional[str] = None,
        org_id: Optional[str] = None,
    ) -> list[dict]:
        cols = ", ".join(_NODE_CAMEL.keys())
        params: list[Any] = [owner]
        where = "owner_id = %s"
        if tag_id:  # flat, drive-wide list of everything carrying this tag
            where += (
                " AND trashed_at IS NULL AND id IN "
                "(SELECT node_id FROM storage_node_tags WHERE tag_id = %s AND owner_id = %s)"
            )
            params.extend([tag_id, owner])
        elif q:
            where += " AND trashed_at IS NULL AND name ILIKE %s"
            params.append(f"%{q}%")
        elif view == "starred":
            where += " AND starred AND trashed_at IS NULL"
        elif view == "trash":
            where += " AND trashed_at IS NOT NULL"
        else:  # files (a folder's children)
            where += " AND parent_id IS NOT DISTINCT FROM %s AND trashed_at IS NULL"
            params.append(parent_id)
        if org_id:  # narrow My Drive to a single org (attribution filter)
            where += " AND org_id = %s"
            params.append(org_id)
        sql = (
            f"SELECT {cols} FROM storage_nodes WHERE {where} "
            "ORDER BY (kind = 'folder') DESC, lower(name) ASC"
        )
        rows = db.query_native("storage_nodes", sql, params, camel_case=False)
        return self._attach_shares(owner, self._attach_tags(owner, [_camel(r, _NODE_CAMEL) for r in rows]))

    def list_orgs(self, caller: str) -> list[dict]:
        """Distinct orgs the caller has (untrashed) files in — powers the My
        Drive org filter. No organizations table here; org_id doubles as the
        display name (it is always 'pattadar' in this platform)."""
        rows = db.query_native(
            "storage_nodes",
            "SELECT org_id AS id, org_id AS name, count(*) AS count "
            "FROM storage_nodes WHERE owner_id = %s AND trashed_at IS NULL "
            "GROUP BY org_id ORDER BY name",
            [caller],
            camel_case=False,
        )
        return [{"id": r["id"], "name": r["name"], "count": int(r["count"])} for r in rows]

    def get_node(self, owner: str, node_id: str) -> dict:
        cols = ", ".join(_NODE_CAMEL.keys())
        rows = db.query_native(
            "storage_nodes",
            f"SELECT {cols} FROM storage_nodes WHERE id = %s AND owner_id = %s",
            [node_id, owner],
            camel_case=False,
        )
        if not rows:
            raise StorageNotFound(node_id)
        return self._attach_shares(owner, self._attach_tags(owner, [_camel(rows[0], _NODE_CAMEL)]))[0]

    def get_node_any(self, node_id: str) -> dict:
        """Fetch a node without an owner filter (callers must authorize via _access)."""
        cols = ", ".join(_NODE_CAMEL.keys())
        rows = db.query_native(
            "storage_nodes",
            f"SELECT {cols} FROM storage_nodes WHERE id = %s",
            [node_id],
            camel_case=False,
        )
        if not rows:
            raise StorageNotFound(node_id)
        return _camel(rows[0], _NODE_CAMEL)

    def breadcrumb(self, owner: str, node_id: str) -> list[dict]:
        sql = (
            "WITH RECURSIVE anc AS ("
            "  SELECT id, parent_id, kind, name, 0 AS depth"
            "    FROM storage_nodes WHERE id = %s AND owner_id = %s"
            "  UNION ALL"
            "  SELECT n.id, n.parent_id, n.kind, n.name, anc.depth + 1"
            "    FROM storage_nodes n JOIN anc ON n.id = anc.parent_id"
            "   WHERE n.owner_id = %s"
            ") SELECT id, parent_id, kind, name FROM anc ORDER BY depth DESC"
        )
        rows = db.query_native("storage_nodes", sql, [node_id, owner, owner], camel_case=False)
        if not rows:
            raise StorageNotFound(node_id)
        return [_camel(r, _NODE_CAMEL) for r in rows]

    def content_identity(
        self, caller: str, node_id: str, version_id: Optional[str] = None
    ) -> tuple[str, str, str, str, str]:
        """Everything a read needs except the bytes, having authorized it.

        Returns (version_id, object_key, mime, name, owner_id). A version id is
        immutable once written, so a conditional request can be answered from
        this alone — no S3 object is fetched to find out that the caller
        already holds the same one.
        """
        # Authorize by ownership OR an active share (on the node or an ancestor).
        cols = ", ".join(_NODE_CAMEL.keys())
        rows = db.query_native(
            "storage_nodes",
            f"SELECT {cols} FROM storage_nodes WHERE id = %s",
            [node_id],
            camel_case=False,
        )
        if not rows:
            raise StorageNotFound(node_id)
        node = _camel(rows[0], _NODE_CAMEL)
        if self._access(caller, node_id) is None:
            raise StorageNotFound(node_id)
        if node["kind"] != "file":
            raise StorageNotFound(node_id)
        node_owner = node["ownerId"]
        vid = version_id or node.get("currentVersionId")
        if not vid:
            raise StorageNotFound(node_id)
        vrows = db.query_native(
            "storage_versions",
            "SELECT object_key, mime_type FROM storage_versions "
            "WHERE id = %s AND node_id = %s AND owner_id = %s",
            [vid, node_id, node_owner],
            camel_case=False,
        )
        if not vrows:
            raise StorageNotFound(vid)
        mime = vrows[0].get("mime_type") or "application/octet-stream"
        return str(vid), vrows[0]["object_key"], mime, node["name"], node_owner

    def open_object(self, object_key: str, byte_range: Optional[str] = None) -> dict:
        """Open an S3 body without buffering it.

        The caller already authorized ``object_key`` through content_identity.
        ``byte_range`` is validated by the HTTP route before it reaches boto3.
        The returned StreamingBody is owned by the route and must be closed.
        """
        args: dict[str, Any] = {"Bucket": self._bucket, "Key": object_key}
        if byte_range:
            args["Range"] = byte_range
        return self._s3.get_object(**args)

    def stat_object(self, object_key: str) -> dict:
        """S3 metadata for HEAD/range validation, after content authorization."""
        return self._s3.head_object(Bucket=self._bucket, Key=object_key)

    def read_object(self, object_key: str) -> bytes:
        """The bytes behind a key that ``content_identity`` has authorized."""
        resp = self.open_object(object_key)
        body = resp["Body"]
        try:
            return body.read()
        finally:
            body.close()

    def read_content(
        self, caller: str, node_id: str, version_id: Optional[str] = None
    ) -> tuple[bytes, str, str]:
        _vid, key, mime, name, _owner = self.content_identity(caller, node_id, version_id)
        return self.read_object(key), mime, name

    # -- writes -------------------------------------------------------------

    def _assert_folder(self, owner: str, parent_id: Optional[str]) -> None:
        if parent_id is None:
            return
        rows = db.query_native(
            "storage_nodes",
            "SELECT kind FROM storage_nodes WHERE id = %s AND owner_id = %s AND trashed_at IS NULL",
            [parent_id, owner],
            camel_case=False,
        )
        if not rows:
            raise StorageNotFound(parent_id)
        if rows[0]["kind"] != "folder":
            raise StorageConflict("parent is not a folder")

    def create_folder(
        self,
        owner: str,
        parent_id: Optional[str],
        name: str,
        by: str,
        *,
        org_id: str = ORG_ID,
        workspace_id: str = WORKSPACE_ID,
        app_id: Optional[str] = None,
    ) -> dict:
        name = (name or "").strip()
        if not name:
            raise StorageConflict("name is required")
        self._assert_folder(owner, parent_id)
        nid = str(uuid.uuid4())
        cols = ", ".join(_NODE_CAMEL.keys())
        try:
            with db._get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "INSERT INTO storage_nodes "
                        "(id, owner_id, org_id, workspace_id, app_id, parent_id, kind, name, "
                        " created_by, updated_by) "
                        "VALUES (%s, %s, %s, %s, %s, %s, 'folder', %s, %s, %s)",
                        [nid, owner, org_id, workspace_id, app_id, parent_id, name, by, by],
                    )
        except psycopg.errors.UniqueViolation:
            raise StorageConflict(f"'{name}' already exists here")
        return self._fetch_one(owner, nid, cols)

    def create_file(
        self,
        owner: str,
        parent_id: Optional[str],
        name: str,
        data: bytes,
        mime: str,
        by: str,
        *,
        org_id: str = ORG_ID,
        workspace_id: str = WORKSPACE_ID,
        app_id: Optional[str] = None,
        on_conflict: str = "version",
    ) -> dict:
        """Store bytes as a file node.

        `on_conflict` decides what a same-named live file in the same folder
        means:

        * ``version`` — add a new version to it (the original behaviour).
        * ``duplicate`` — keep BOTH, giving the newcomer a suffixed name.

        The default stays ``version`` so existing callers are unaffected, but a
        land vault wants ``duplicate``: two originals of the same deed are a
        real thing people hold, and silently replacing the first copy's bytes
        loses a document nobody asked to lose.
        """
        name = (name or "document").strip()
        self._assert_folder(owner, parent_id)
        cols = ", ".join(_NODE_CAMEL.keys())
        size = len(data)
        mime = mime or "application/octet-stream"

        def _live_same_name(candidate: str) -> list:
            return db.query_native(
                "storage_nodes",
                "SELECT id FROM storage_nodes WHERE owner_id = %s "
                "AND parent_id IS NOT DISTINCT FROM %s AND lower(name) = lower(%s) "
                "AND kind = 'file' AND trashed_at IS NULL",
                [owner, parent_id, candidate],
                camel_case=False,
            )

        existing = _live_same_name(name)
        if existing and on_conflict == "duplicate":
            name = next_free_name(name, lambda c: bool(_live_same_name(c)))
            existing = []

        if existing:
            nid = str(existing[0]["id"])
            vid = str(uuid.uuid4())
            key = self._key(owner, nid, vid)
            self._s3.put_object(**self._put_args(key=key, data=data, mime=mime))
            self._commit_new_version(owner, nid, vid, key, size, mime, by)
            return self._fetch_one(owner, nid, cols)

        # New file node + its first version.
        nid = str(uuid.uuid4())
        vid = str(uuid.uuid4())
        key = self._key(owner, nid, vid)
        # Upload bytes first; if the DB insert conflicts we best-effort remove them.
        self._s3.put_object(**self._put_args(key=key, data=data, mime=mime))
        self._commit_new_node(
            owner, nid, vid, key, size, mime, by,
            parent_id=parent_id,
            name=name,
            org_id=org_id,
            workspace_id=workspace_id,
            app_id=app_id,
        )
        return self._fetch_one(owner, nid, cols)

    # -- shared commit paths ------------------------------------------------
    # Both the proxied upload (create_file) and the direct-to-S3 upload
    # (create_file_from_pending) land here, so the row-writing rules are
    # stated once.

    def _commit_new_version(
        self, owner: str, nid: str, vid: str, key: str, size: int, mime: str, by: str
    ) -> None:
        """Add a version to an existing node and make it current."""
        with db._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO storage_versions "
                    "(id, node_id, owner_id, object_key, size_bytes, mime_type, created_by) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                    [vid, nid, owner, key, size, mime, by],
                )
                cur.execute(
                    "UPDATE storage_nodes SET current_version_id = %s, size_bytes = %s, "
                    "mime_type = %s, updated_at = now(), updated_by = %s "
                    "WHERE id = %s AND owner_id = %s",
                    [vid, size, mime, by, nid, owner],
                )

    def _commit_new_node(
        self,
        owner: str,
        nid: str,
        vid: str,
        key: str,
        size: int,
        mime: str,
        by: str,
        *,
        parent_id: Optional[str],
        name: str,
        org_id: str,
        workspace_id: str,
        app_id: Optional[str],
    ) -> None:
        """Create the file node and its first version.

        On a name collision the bytes are best-effort removed, because nothing
        will ever point at them again.
        """
        try:
            with db._get_conn() as conn:
                with conn.cursor() as cur:
                    # Node first — storage_versions.node_id FK requires it to exist.
                    # current_version_id has no FK, so pointing it at the not-yet-
                    # inserted version row in the same txn is fine.
                    cur.execute(
                        "INSERT INTO storage_nodes "
                        "(id, owner_id, org_id, workspace_id, app_id, parent_id, kind, name, "
                        " size_bytes, mime_type, current_version_id, created_by, updated_by) "
                        "VALUES (%s, %s, %s, %s, %s, %s, 'file', %s, %s, %s, %s, %s, %s)",
                        [nid, owner, org_id, workspace_id, app_id, parent_id, name, size, mime, vid, by, by],
                    )
                    cur.execute(
                        "INSERT INTO storage_versions "
                        "(id, node_id, owner_id, object_key, size_bytes, mime_type, created_by) "
                        "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                        [vid, nid, owner, key, size, mime, by],
                    )
        except psycopg.errors.UniqueViolation:
            self._safe_remove(key)
            raise StorageConflict(f"'{name}' already exists here")

    # -- direct-to-S3 upload ------------------------------------------------

    def _copy_args(self, *, src_key: str, key: str, mime: str) -> dict[str, Any]:
        """CopyObject arguments, pinned to the app CMK like ``_put_args``.

        ``MetadataDirective``/``ContentType`` are set explicitly because a copy
        otherwise carries the source object's content type, and the source is
        whatever the client declared at upload time.
        """
        args: dict[str, Any] = {
            "Bucket": self._bucket,
            "Key": key,
            "CopySource": {"Bucket": self._bucket, "Key": src_key},
            "ContentType": mime,
            "MetadataDirective": "REPLACE",
        }
        if not self._allow_unencrypted_local:
            args.update({
                "ServerSideEncryption": "aws:kms",
                "SSEKMSKeyId": self._kms_key_arn,
                "BucketKeyEnabled": True,
            })
        return args

    def presign_upload(self, owner: str, *, mime: str, max_bytes: int) -> dict:
        """A form the browser POSTs straight to S3, and the id to confirm it with.

        Presigned POST, not PUT, for one reason that matters: only a POST
        policy carries ``content-length-range``. A presigned PUT cannot bound
        the object's size, so a caller who holds one can upload until the
        account's bill says stop.

        The key is chosen here and pinned into the policy. It is never taken
        from the caller — a caller-supplied key is a write into someone else's
        object.

        The SSE fields are signed into the policy too. The bucket already
        applies the app CMK by default, so this changes nothing about how the
        object is encrypted; it means the upload still succeeds if the bucket
        policy is ever tightened to reject writers that do not say so (see
        ``enforce_documents_sse_kms_headers`` in the persistent module).
        """
        upload_id = str(uuid.uuid4())
        key = self._pending_key(upload_id)
        mime = mime or "application/octet-stream"

        fields: dict[str, Any] = {"Content-Type": mime}
        conditions: list[Any] = [
            {"Content-Type": mime},
            ["content-length-range", 1, int(max_bytes)],
        ]
        if not self._allow_unencrypted_local:
            fields["x-amz-server-side-encryption"] = "aws:kms"
            fields["x-amz-server-side-encryption-aws-kms-key-id"] = self._kms_key_arn
            conditions.append({"x-amz-server-side-encryption": "aws:kms"})
            conditions.append(
                {"x-amz-server-side-encryption-aws-kms-key-id": self._kms_key_arn}
            )

        post = self._s3.generate_presigned_post(
            Bucket=self._bucket,
            Key=key,
            Fields=fields,
            Conditions=conditions,
            ExpiresIn=PRESIGN_TTL_SECONDS,
        )
        return {
            "uploadId": upload_id,
            "url": post["url"],
            "fields": post["fields"],
            "maxBytes": int(max_bytes),
            "expiresIn": PRESIGN_TTL_SECONDS,
        }

    def create_file_from_pending(
        self,
        owner: str,
        upload_id: str,
        parent_id: Optional[str],
        name: str,
        by: str,
        *,
        max_bytes: int,
        org_id: str = ORG_ID,
        workspace_id: str = WORKSPACE_ID,
        app_id: Optional[str] = None,
        on_conflict: str = "version",
    ) -> dict:
        """Turn a completed direct upload into a file node.

        The gateway never saw these bytes, so every fact about them is read
        back from S3 rather than believed from the client: the size written to
        the row is the ``ContentLength`` S3 reports, not a number the caller
        sent. A client that lies about its size gets the truth recorded, and a
        client that beat the policy's range check (it cannot) would still be
        rejected here.
        """
        if not upload_id or "/" in upload_id or ".." in upload_id:
            raise StorageConflict("invalid uploadId")
        src_key = self._pending_key(upload_id)
        try:
            head = self._s3.head_object(Bucket=self._bucket, Key=src_key)
        except Exception as exc:  # noqa: BLE001 - narrowed below
            # Only a genuine miss is "no such upload". A permissions error or
            # a transient S3 failure must NOT be reported as 404: that would
            # tell the client to give up on bytes it successfully uploaded.
            if not _is_missing_object(exc):
                raise
            raise StorageNotFound(f"upload {upload_id}") from exc

        size = int(head.get("ContentLength") or 0)
        if size <= 0:
            self._safe_remove(src_key)
            raise StorageConflict("uploaded object is empty")
        if size > int(max_bytes):
            # Belt and braces: the policy already bounded this.
            self._safe_remove(src_key)
            raise StorageTooLarge("File too large")
        mime = head.get("ContentType") or "application/octet-stream"

        name = (name or "document").strip()
        self._assert_folder(owner, parent_id)
        cols = ", ".join(_NODE_CAMEL.keys())

        def _live_same_name(candidate: str) -> list:
            return db.query_native(
                "storage_nodes",
                "SELECT id FROM storage_nodes WHERE owner_id = %s "
                "AND parent_id IS NOT DISTINCT FROM %s AND lower(name) = lower(%s) "
                "AND kind = 'file' AND trashed_at IS NULL",
                [owner, parent_id, candidate],
                camel_case=False,
            )

        existing = _live_same_name(name)
        if existing and on_conflict == "duplicate":
            name = next_free_name(name, lambda c: bool(_live_same_name(c)))
            existing = []

        nid = str(existing[0]["id"]) if existing else str(uuid.uuid4())
        vid = str(uuid.uuid4())
        key = self._key(owner, nid, vid)
        self._s3.copy_object(**self._copy_args(src_key=src_key, key=key, mime=mime))

        try:
            if existing:
                self._commit_new_version(owner, nid, vid, key, size, mime, by)
            else:
                self._commit_new_node(
                    owner, nid, vid, key, size, mime, by,
                    parent_id=parent_id,
                    name=name,
                    org_id=org_id,
                    workspace_id=workspace_id,
                    app_id=app_id,
                )
        except Exception:
            # The live copy is unreachable now; the pending object is still
            # reapable by lifecycle either way.
            self._safe_remove(key)
            raise
        # Only once the row exists — until then the pending object is the only
        # copy, and losing it would lose the upload.
        self._safe_remove(src_key)
        return self._fetch_one(owner, nid, cols)

    def rename(self, owner: str, node_id: str, name: str, by: str) -> None:
        name = (name or "").strip()
        if not name:
            raise StorageConflict("name is required")
        try:
            with db._get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE storage_nodes SET name = %s, updated_at = now(), updated_by = %s "
                        "WHERE id = %s AND owner_id = %s AND trashed_at IS NULL",
                        [name, by, node_id, owner],
                    )
                    if cur.rowcount == 0:
                        raise StorageNotFound(node_id)
        except psycopg.errors.UniqueViolation:
            raise StorageConflict(f"'{name}' already exists here")

    def move(self, owner: str, node_id: str, parent_id: Optional[str], by: str) -> None:
        if parent_id == node_id:
            raise StorageConflict("cannot move a folder into itself")
        self._assert_folder(owner, parent_id)
        # Cycle guard: target parent must not be a descendant of node_id.
        if parent_id is not None:
            for anc in self.breadcrumb(owner, parent_id):
                if anc["id"] == node_id:
                    raise StorageConflict("cannot move a folder into its own subtree")
        try:
            with db._get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE storage_nodes SET parent_id = %s, updated_at = now(), updated_by = %s "
                        "WHERE id = %s AND owner_id = %s AND trashed_at IS NULL",
                        [parent_id, by, node_id, owner],
                    )
                    if cur.rowcount == 0:
                        raise StorageNotFound(node_id)
        except psycopg.errors.UniqueViolation:
            raise StorageConflict("an item with that name already exists in the destination")

    def hard_delete(self, owner: str, node_id: str) -> None:
        # Gather every object under this node (self + descendants) then purge.
        keys = db.query_native(
            "storage_versions",
            "WITH RECURSIVE tree AS ("
            "  SELECT id FROM storage_nodes WHERE id = %s AND owner_id = %s"
            "  UNION ALL"
            "  SELECT n.id FROM storage_nodes n JOIN tree ON n.parent_id = tree.id"
            ") SELECT v.object_key FROM storage_versions v WHERE v.node_id IN (SELECT id FROM tree)",
            [node_id, owner],
            camel_case=False,
        )
        with db._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM storage_nodes WHERE id = %s AND owner_id = %s",
                    [node_id, owner],
                )
                if cur.rowcount == 0:
                    raise StorageNotFound(node_id)
        for row in keys:
            self._safe_remove(row["object_key"])

    # -- Phase 2: star / trash / restore ------------------------------------

    def set_star(self, owner: str, node_id: str, starred: bool) -> None:
        with db._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE storage_nodes SET starred = %s, updated_at = now() "
                    "WHERE id = %s AND owner_id = %s AND trashed_at IS NULL",
                    [starred, node_id, owner],
                )
                if cur.rowcount == 0:
                    raise StorageNotFound(node_id)

    def trash(self, owner: str, node_id: str, by: str) -> None:
        with db._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE storage_nodes SET trashed_at = now(), updated_by = %s "
                    "WHERE id = %s AND owner_id = %s AND trashed_at IS NULL",
                    [by, node_id, owner],
                )
                if cur.rowcount == 0:
                    raise StorageNotFound(node_id)

    def restore(self, owner: str, node_id: str, by: str) -> None:
        try:
            with db._get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE storage_nodes SET trashed_at = NULL, updated_by = %s "
                        "WHERE id = %s AND owner_id = %s AND trashed_at IS NOT NULL",
                        [by, node_id, owner],
                    )
                    if cur.rowcount == 0:
                        raise StorageNotFound(node_id)
        except psycopg.errors.UniqueViolation:
            raise StorageConflict("an item with that name already exists — rename it first")

    # -- Phase 3: versions --------------------------------------------------

    def versions(self, owner: str, node_id: str) -> list[dict]:
        # Ownership check.
        self.get_node(owner, node_id)
        rows = db.query_native(
            "storage_versions",
            "SELECT id, node_id, owner_id, object_key, size_bytes, mime_type, etag, created_at, created_by "
            "FROM storage_versions WHERE node_id = %s AND owner_id = %s ORDER BY created_at DESC",
            [node_id, owner],
            camel_case=False,
        )
        return [_camel(r, _VERSION_CAMEL) for r in rows]

    def restore_version(self, owner: str, node_id: str, version_id: str, by: str) -> None:
        rows = db.query_native(
            "storage_versions",
            "SELECT size_bytes, mime_type FROM storage_versions "
            "WHERE id = %s AND node_id = %s AND owner_id = %s",
            [version_id, node_id, owner],
            camel_case=False,
        )
        if not rows:
            raise StorageNotFound(version_id)
        with db._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE storage_nodes SET current_version_id = %s, size_bytes = %s, "
                    "mime_type = %s, updated_at = now(), updated_by = %s "
                    "WHERE id = %s AND owner_id = %s",
                    [version_id, rows[0]["size_bytes"], rows[0].get("mime_type"), by, node_id, owner],
                )
                if cur.rowcount == 0:
                    raise StorageNotFound(node_id)

    # -- Sharing (read-side only in v1 — no share-mutation routes exist) ----

    def _access(self, caller: str, node_id: str) -> Optional[str]:
        """Return 'owner' | 'edit' | 'view' | None for caller on node_id.

        Access is granted by ownership, or by an unexpired share on the node or
        any of its ancestors that names the caller as grantee.
        """
        owner_rows = db.query_native(
            "storage_nodes",
            "SELECT owner_id FROM storage_nodes WHERE id = %s",
            [node_id],
            camel_case=False,
        )
        if not owner_rows:
            return None
        if owner_rows[0]["owner_id"] == caller:
            return "owner"
        # node + ancestor ids
        anc = db.query_native(
            "storage_nodes",
            "WITH RECURSIVE up AS ("
            "  SELECT id, parent_id FROM storage_nodes WHERE id = %s"
            "  UNION ALL"
            "  SELECT n.id, n.parent_id FROM storage_nodes n JOIN up ON n.id = up.parent_id"
            ") SELECT id FROM up",
            [node_id],
            camel_case=False,
        )
        ids = [str(r["id"]) for r in anc]
        if not ids:
            return None
        perms = db.query_native(
            "storage_shares",
            "SELECT permission FROM storage_shares WHERE node_id = ANY(%s) AND grantee_id = %s "
            "AND (expires_at IS NULL OR expires_at > now())",
            [ids, caller],
            camel_case=False,
        )
        if not perms:
            return None
        return "edit" if any(p["permission"] == "edit" for p in perms) else "view"

    def list_shared_children(self, caller: str, parent_id: str) -> list[dict]:
        """List children of a folder the caller can access via a share."""
        if self._access(caller, parent_id) is None:
            raise StorageNotFound(parent_id)
        cols = ", ".join(_NODE_CAMEL.keys())
        rows = db.query_native(
            "storage_nodes",
            f"SELECT {cols} FROM storage_nodes WHERE parent_id = %s AND trashed_at IS NULL "
            "ORDER BY (kind = 'folder') DESC, lower(name)",
            [parent_id],
            camel_case=False,
        )
        return [_camel(r, _NODE_CAMEL) for r in rows]

    # -- Tags (read-side only in v1) -----------------------------------------

    def _attach_tags(self, owner: str, nodes: list[dict]) -> list[dict]:
        if not nodes:
            return nodes
        ids = [n["id"] for n in nodes]
        rows = db.query_native(
            "storage_node_tags",
            "SELECT nt.node_id, t.id, t.name, t.color FROM storage_node_tags nt "
            "JOIN storage_tags t ON t.id = nt.tag_id "
            "WHERE nt.node_id = ANY(%s) AND nt.owner_id = %s",
            [ids, owner],
            camel_case=False,
        )
        by_node: dict[str, list[dict]] = {}
        for r in rows:
            by_node.setdefault(str(r["node_id"]), []).append(
                {"id": str(r["id"]), "name": r["name"], "color": r["color"]}
            )
        for n in nodes:
            n["tags"] = by_node.get(n["id"], [])
        return nodes

    def _attach_shares(self, owner: str, nodes: list[dict]) -> list[dict]:
        """Annotate each node with who it's shared with (grantee ids) and whether
        a public link exists — so the file list can show 'shared with X, Y'."""
        if not nodes:
            return nodes
        ids = [n["id"] for n in nodes]
        rows = db.query_native(
            "storage_shares",
            "SELECT node_id, grantee_id, token FROM storage_shares "
            "WHERE node_id = ANY(%s) AND owner_id = %s",
            [ids, owner],
            camel_case=False,
        )
        by_node: dict[str, dict] = {}
        for r in rows:
            e = by_node.setdefault(str(r["node_id"]), {"people": [], "link": False})
            if r.get("token"):
                e["link"] = True
            elif r.get("grantee_id"):
                e["people"].append(str(r["grantee_id"]))
        for n in nodes:
            e = by_node.get(n["id"], {"people": [], "link": False})
            n["sharedWith"] = e["people"]
            n["sharedLink"] = e["link"]
        return nodes

    # -- Copy ---------------------------------------------------------------

    def copy_node(self, owner: str, node_id: str, by: str) -> dict:
        """Duplicate a file as 'Copy of …' in the same folder (files only)."""
        node = self.get_node(owner, node_id)
        if node["kind"] != "file":
            raise StorageConflict("only files can be copied")
        data, mime, name = self.read_content(owner, node_id)
        base = f"Copy of {name}"
        # avoid a name clash by suffixing (Copy of x, Copy of x (2), …)
        candidate = base
        n = 2
        while True:
            existing = db.query_native(
                "storage_nodes",
                "SELECT 1 FROM storage_nodes WHERE owner_id = %s "
                "AND parent_id IS NOT DISTINCT FROM %s AND lower(name) = lower(%s) AND trashed_at IS NULL",
                [owner, node["parentId"], candidate],
                camel_case=False,
            )
            if not existing:
                break
            root, ext = os.path.splitext(base)
            candidate = f"{root} ({n}){ext}"
            n += 1
        return self.create_file(owner, node["parentId"], candidate, data, mime, by)

    # -- helpers ------------------------------------------------------------

    def _fetch_one(self, owner: str, node_id: str, cols: str) -> dict:
        rows = db.query_native(
            "storage_nodes",
            f"SELECT {cols} FROM storage_nodes WHERE id = %s AND owner_id = %s",
            [node_id, owner],
            camel_case=False,
        )
        return _camel(rows[0], _NODE_CAMEL)

    def _safe_remove(self, key: str) -> None:
        try:
            self._s3.delete_object(Bucket=self._bucket, Key=key)
        except Exception as exc:  # pragma: no cover - best effort
            _log.warning("storage.object_remove_failed", extra={"key": key, "error": str(exc)})
