#!/usr/bin/env python3
"""Execute a reviewed account erasure receipt; default is a read-only dry run.

Never invoke with --execute until writes are drained and a backup/retention
review is complete. Each provider stage is idempotent and persisted separately.
A failed stage leaves an honest retryable job, never a completed deletion.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys

import psycopg
from psycopg import sql
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.account import CHILD_LINKS, STAGES, ownership_predicates


def principal(issuer, subject):
    raw = json.dumps([issuer, subject], ensure_ascii=True, separators=(",", ":"))
    return "subject_" + hashlib.sha256(raw.encode()).hexdigest()


def catalog(conn):
    out = {}
    for row in conn.execute("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'"):
        out.setdefault(row["table_name"], set()).add(row["column_name"])
    return out


def snapshot(conn, owner):
    tables = catalog(conn)
    scopes = ownership_predicates(tables)
    counts = {}
    for table, scope in scopes.items():
        if table == "account_erasure_jobs":
            continue
        counts[table] = conn.execute(sql.SQL("SELECT count(*) AS n FROM {} WHERE " + scope).format(sql.Identifier(table)),
                                      (owner,) * scope.count("%s")).fetchone()["n"]
    return tables, scopes, counts


def delete_prefix(s3, bucket, prefix):
    """Remove every version and delete marker, including orphaned object keys."""
    if not bucket or not prefix or prefix in {"/", "assistant/"} or not prefix.endswith("/"):
        raise ValueError("Refusing unscoped object deletion")
    for _ in range(4):
        removed = 0
        for page in s3.get_paginator("list_object_versions").paginate(Bucket=bucket, Prefix=prefix):
            objects = [{"Key": item["Key"], "VersionId": item["VersionId"]}
                       for item in page.get("Versions", []) + page.get("DeleteMarkers", [])]
            if any(not item["Key"].startswith(prefix) for item in objects):
                raise RuntimeError("Object listing escaped owner prefix")
            if objects:
                result = s3.delete_objects(Bucket=bucket, Delete={"Objects": objects, "Quiet": True})
                if result.get("Errors"):
                    raise RuntimeError("Object-version deletion incomplete; retry required")
                removed += len(objects)
        # Unversioned buckets and newly-created current objects also disappear.
        for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix):
            objects = [{"Key": item["Key"]} for item in page.get("Contents", [])]
            if objects:
                result = s3.delete_objects(Bucket=bucket, Delete={"Objects": objects, "Quiet": True})
                if result.get("Errors"):
                    raise RuntimeError("Object deletion incomplete; retry required")
                removed += len(objects)
        if removed == 0:
            return
    raise RuntimeError("Objects are still appearing; stop writers before retrying")


def foreign_children(conn, scopes, owner):
    """Refuse FK cascades into another owner's rows before any data deletion."""
    rows = conn.execute("""SELECT c.conrelid::regclass::text child,c.confrelid::regclass::text parent,
        ca.attname child_column,pa.attname parent_column
        FROM pg_constraint c JOIN pg_attribute ca ON ca.attrelid=c.conrelid AND ca.attnum=c.conkey[1]
        JOIN pg_attribute pa ON pa.attrelid=c.confrelid AND pa.attnum=c.confkey[1]
        WHERE c.contype='f' AND array_length(c.conkey,1)=1""").fetchall()
    for row in rows:
        parent, child = row["parent"].removeprefix("public."), row["child"].removeprefix("public.")
        if parent not in scopes:
            continue
        owned_parent = scopes[parent]
        child_scope = scopes.get(child, "FALSE")
        query = sql.SQL("SELECT 1 FROM {child} WHERE {fk} IN (SELECT {pk} FROM {parent} WHERE " + owned_parent + ") AND NOT COALESCE((" + child_scope + "),false) LIMIT 1").format(
            child=sql.Identifier(child), parent=sql.Identifier(parent), fk=sql.Identifier(row["child_column"]), pk=sql.Identifier(row["parent_column"]))
        if conn.execute(query, (owner,) * (owned_parent.count("%s") + child_scope.count("%s"))).fetchone():
            raise RuntimeError("Foreign-owned dependent records require operator review")


def require_settled_payments(conn, owner):
    """Do not erase the only reconciliation record for in-flight money."""
    if "payment_intents" not in catalog(conn):
        return
    pending = conn.execute("SELECT count(*) AS n FROM payment_intents WHERE owner_user_id=%s AND status NOT IN ('settled','void')", (owner,)).fetchone()["n"]
    if pending:
        raise RuntimeError("Payment reconciliation is required before erasure; open checkout or settlement records remain")


def purge_api(conn, owner, job_id, retention_days):
    require_settled_payments(conn, owner)
    tables, scopes, _ = snapshot(conn, owner)
    foreign_children(conn, scopes, owner)
    # Child scopes are resolved before any parent is removed. ctid is stable
    # within this transaction and supports tables without an id primary key.
    with conn.transaction():
        conn.execute("LOCK TABLE " + ",".join('"'+t+'"' for t in sorted(scopes)) + " IN SHARE ROW EXCLUSIVE MODE")
        targets = {}
        for table, scope in scopes.items():
            if table == "account_erasure_jobs":
                continue
            targets[table] = [r["row_id"] for r in conn.execute(sql.SQL("SELECT ctid::text AS row_id FROM {} WHERE " + scope).format(sql.Identifier(table)), (owner,) * scope.count("%s"))]
        if "audit_events" in targets and retention_days:
            conn.execute("""CREATE TABLE IF NOT EXISTS account_retained_audits (
                id TEXT PRIMARY KEY, request_id TEXT NOT NULL, action TEXT NOT NULL,
                occurred_at TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL)""")
            conn.execute("""INSERT INTO account_retained_audits(id,request_id,action,occurred_at,expires_at)
                SELECT id,%s,action,timestamp,now()+(%s * interval '1 day') FROM audit_events WHERE actor=%s
                ON CONFLICT(id) DO NOTHING""", (job_id, retention_days, owner))
        # Known non-FK links first; database FKs are respected by topological
        # ordering too. Unsupported cyclic constraints fail and roll back.
        children = {child: {parent for _, parent in links} for child, links in CHILD_LINKS.items()}
        children["invitations"] = {"passbooks","parcels","documents","family_members","beneficiaries"}
        for row in conn.execute("SELECT conrelid::regclass::text child,confrelid::regclass::text parent FROM pg_constraint WHERE contype='f'"):
            children.setdefault(row["child"].removeprefix("public."), set()).add(row["parent"].removeprefix("public."))
        remaining = set(targets)
        while remaining:
            ready = sorted(t for t in remaining if not any(t in children.get(c,set()) for c in remaining if c != t))
            if not ready:
                raise RuntimeError("Cyclic deletion relationships need operator review")
            for table in ready:
                if targets[table]:
                    conn.execute(sql.SQL("DELETE FROM {} WHERE ctid::text=ANY(%s)").format(sql.Identifier(table)), (targets[table],))
                remaining.remove(table)


def purge_assistant(conn, owner):
    tables = catalog(conn)
    with conn.transaction():
        if "r_conversations" not in tables:
            raise RuntimeError("Assistant database has not been identified correctly")
        for table in ("checkpoint_writes", "checkpoint_blobs", "checkpoints"):
            if table in tables:
                conn.execute(sql.SQL("DELETE FROM {} WHERE thread_id IN (SELECT id::text FROM r_conversations WHERE user_id=%s)").format(sql.Identifier(table)), (owner,))
        conn.execute("DELETE FROM r_attachments WHERE user_id=%s OR conversation_id IN (SELECT id FROM r_conversations WHERE user_id=%s)", (owner,owner))
        conn.execute("DELETE FROM r_conversations WHERE user_id=%s", (owner,))


def purge_storage_metadata(conn, owner):
    with conn.transaction():
        if conn.execute("SELECT 1 FROM storage_nodes c JOIN storage_nodes p ON p.id=c.parent_id WHERE p.owner_id=%s AND c.owner_id<>%s LIMIT 1", (owner,owner)).fetchone():
            raise RuntimeError("A shared folder contains foreign-owned children; review before deleting")
        for table in ("storage_node_tags", "storage_shares", "storage_versions", "storage_nodes", "storage_tags"):
            conn.execute(sql.SQL("DELETE FROM {} WHERE owner_id=%s").format(sql.Identifier(table)), (owner,))
        conn.execute("DELETE FROM storage_shares WHERE grantee_id=%s", (owner,))


def resolve_subjects(job, manifest):
    if manifest.get("issuer") != job["issuer"]:
        raise ValueError("Approved identity manifest issuer differs from request")
    if principal(job["issuer"],job["subject"]) != job["principal_id"]:
        raise ValueError("Request principal does not match authenticated subject")
    linked = {b["subject"] for b in manifest.get("bindings",[]) if b["owner_id"] == job["owner_user_id"]}
    if job["owner_user_id"].startswith("subject_"):
        if job["owner_user_id"] != job["principal_id"]:
            raise ValueError("Subject ownership mismatch")
        linked.add(job["subject"])
    elif job["subject"] not in linked:
        raise ValueError("Legacy owner is absent from reviewed identity manifest")
    return sorted(linked)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request-id", required=True)
    parser.add_argument("--identity-manifest", required=True, type=Path)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--writers-drained", action="store_true", help="Confirm gateway/API/assistant background and in-flight writers are stopped")
    parser.add_argument("--assistant-storage", choices=["s3","database"], required=True)
    parser.add_argument("--legacy-attachments-dir", type=Path)
    parser.add_argument("--audit-retention-days", type=int, default=365)
    args = parser.parse_args()
    if args.execute and not args.writers_drained:
        parser.error("Execution requires --writers-drained after a reviewed maintenance window")
    if not 0 <= args.audit_retention_days <= 3650:
        parser.error("Audit retention must be between 0 and 3650 days")
    # Explicit DSNs prevent accidentally operating against the developer defaults.
    dsns = {name: os.environ[name] for name in ("API_DSN","HUB_DSN","ASSISTANT_DSN")}
    with psycopg.connect(dsns["API_DSN"], autocommit=True, row_factory=dict_row) as api, \
         psycopg.connect(dsns["HUB_DSN"], autocommit=True, row_factory=dict_row) as hub, \
         psycopg.connect(dsns["ASSISTANT_DSN"], autocommit=True, row_factory=dict_row) as assistant:
        job = api.execute("SELECT * FROM account_erasure_jobs WHERE id=%s", (args.request_id,)).fetchone()
        if not job:
            raise ValueError("Unknown erasure request")
        if job["status"] == "completed":
            print(json.dumps({"id":job["id"],"status":"completed"})); return
        manifest = json.loads(args.identity_manifest.read_text())
        subjects = resolve_subjects(job, manifest)
        owner = job["owner_user_id"]
        if any(c in owner for c in "/\\\x00\r\n") or owner in {"", "system","guest","local"}:
            raise ValueError("Refusing invalid owner prefix")
        _, api_scopes, counts = snapshot(api, owner)
        require_settled_payments(api, owner)
        foreign_children(api, api_scopes, owner)
        if hub.execute("SELECT 1 FROM storage_nodes c JOIN storage_nodes p ON p.id=c.parent_id WHERE p.owner_id=%s AND c.owner_id<>%s LIMIT 1", (owner,owner)).fetchone():
            raise RuntimeError("Foreign-owned folder children require review before erasure")
        keys = hub.execute("SELECT object_key FROM storage_versions WHERE owner_id=%s", (owner,)).fetchall()
        if any(not row["object_key"].startswith(owner+"/") for row in keys):
            raise RuntimeError("Legacy object keys outside the owner prefix require migration before erasure")
        attachments = assistant.execute("SELECT storage_path FROM r_attachments WHERE user_id=%s", (owner,)).fetchall()
        legacy = [Path(a["storage_path"]) for a in attachments if not a["storage_path"].startswith(("s3://","db:"))]
        for path in legacy:
            if not args.legacy_attachments_dir or not path.resolve().is_relative_to(args.legacy_attachments_dir.resolve()):
                raise ValueError("Legacy attachment cleanup requires its verified storage root")
        if not args.execute:
            print(json.dumps({"dryRun":True,"requestId":job["id"],"rowCounts":counts,"linkedSubjects":len(subjects),"legacyAttachmentFiles":len(legacy),"stages":STAGES},indent=2)); return
        import boto3
        storage_bucket = os.environ["STORAGE_BUCKET"]
        assistant_bucket = os.environ["ASSISTANT_ATTACHMENTS_BUCKET"] if args.assistant_storage == "s3" else None
        if assistant_bucket:
            expected = "s3://"+assistant_bucket+"/assistant/"+hashlib.sha256(owner.encode()).hexdigest()+"/"
            if any(a["storage_path"].startswith("s3://") and not a["storage_path"].startswith(expected) for a in attachments):
                raise ValueError("Assistant objects outside the verified owner prefix require migration")
        if args.assistant_storage == "database" and any(a["storage_path"].startswith("s3://") for a in attachments):
            raise ValueError("Assistant contains S3 attachments; configure S3 cleanup")
        pool_id = job["issuer"].rsplit("/",1)[-1]
        region = pool_id.split("_",1)[0]
        if job["issuer"] != f"https://cognito-idp.{region}.amazonaws.com/{pool_id}":
            raise ValueError("Only the reviewed Cognito issuer can be erased")
        s3 = boto3.client("s3", region_name=region)
        cognito = boto3.client("cognito-idp", region_name=region)
        if not api.execute("SELECT pg_try_advisory_lock(hashtextextended(%s,0)) AS locked", (job["id"],)).fetchone()["locked"]:
            raise RuntimeError("Another worker owns this erasure job")
        stages = dict(job["stages"])
        stages.pop("verify", None)  # Always re-verify after a crash before final completion.
        api.execute("UPDATE account_erasure_jobs SET status='processing',attempts=attempts+1,updated_at=now(),last_error='' WHERE id=%s", (job["id"],))
        def stage(name, action):
            if stages.get(name) == "completed":
                return
            try:
                action()
            except Exception as exc:
                # Persist only the exception type: DSNs and provider identifiers
                # must not leak into the account-visible request receipt.
                api.execute("UPDATE account_erasure_jobs SET status='retry_required',last_error=%s,updated_at=now() WHERE id=%s", (type(exc).__name__,job["id"]))
                raise
            stages[name] = "completed"
            api.execute("UPDATE account_erasure_jobs SET stages=%s,updated_at=now() WHERE id=%s", (Jsonb(stages),job["id"]))
        def freeze():
            with hub.transaction():
                for sub in subjects:
                    hub.execute("INSERT INTO account_access_blocks(principal_id,owner_id,request_id) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                        (principal(job["issuer"],sub), "owner_"+hashlib.sha256(owner.encode()).hexdigest(), job["id"]))
            for sub in subjects:
                for page in cognito.get_paginator("list_users").paginate(UserPoolId=pool_id,Filter='sub = '+json.dumps(sub)):
                    for user in page["Users"]:
                        cognito.admin_disable_user(UserPoolId=pool_id,Username=user["Username"])
        def assistant_objects():
            if assistant_bucket:
                delete_prefix(s3,assistant_bucket,"assistant/"+hashlib.sha256(owner.encode()).hexdigest()+"/")
            for path in legacy:
                path.unlink(missing_ok=True)
        def identities():
            for sub in subjects:
                for page in cognito.get_paginator("list_users").paginate(UserPoolId=pool_id,Filter='sub = '+json.dumps(sub)):
                    for user in page["Users"]:
                        cognito.admin_delete_user(UserPoolId=pool_id,Username=user["Username"])
        def verify():
            if any(snapshot(api,owner)[2].values()):
                raise RuntimeError("Owned API rows remain")
            if hub.execute("SELECT 1 FROM storage_nodes WHERE owner_id=%s LIMIT 1",(owner,)).fetchone():
                raise RuntimeError("Owned storage rows remain")
            if assistant.execute("SELECT 1 FROM r_conversations WHERE user_id=%s LIMIT 1",(owner,)).fetchone():
                raise RuntimeError("Owned assistant rows remain")
            # Object/provider stages already verify exhaustion. Re-run checks so
            # retries after a process crash cannot finish over a resumed writer.
            delete_prefix(s3,storage_bucket,owner+"/")
            if assistant_bucket:
                delete_prefix(s3,assistant_bucket,"assistant/"+hashlib.sha256(owner.encode()).hexdigest()+"/")
            for sub in subjects:
                if cognito.list_users(UserPoolId=pool_id,Filter='sub = '+json.dumps(sub),Limit=1).get("Users"):
                    raise RuntimeError("Cognito identity remains")
        stage("freeze_access",freeze)
        stage("storage_objects",lambda: delete_prefix(s3,storage_bucket,owner+"/"))
        stage("assistant_objects",assistant_objects)
        stage("assistant_data",lambda: purge_assistant(assistant,owner))
        stage("api_data",lambda: purge_api(api,owner,job["id"],args.audit_retention_days))
        stage("storage_metadata",lambda: purge_storage_metadata(hub,owner))
        stage("cognito_identity",identities)
        stage("verify",verify)
        api.execute("UPDATE account_erasure_jobs SET status='completed',completed_at=now(),updated_at=now(),issuer='',subject='',owner_user_id=%s WHERE id=%s", ("erased:"+job["id"],job["id"]))
        print(json.dumps({"id":job["id"],"status":"completed","auditRetentionDays":args.audit_retention_days}))


if __name__ == "__main__":
    main()
