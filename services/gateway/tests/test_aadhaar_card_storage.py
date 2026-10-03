"""A kept Aadhaar card is stored like every other Drive file.

`{node}/{version}` key with no owner segment, SSE-KMS on the documents CMK,
ContentType as the only metadata, and the version row's object_key equal to
the key written. Runs `StorageService.create_file` against a throwaway schema
on TEST_PG_DSN (skipped locally without PostgreSQL, failing in CI when
TEST_PG_DSN is set) and a fake S3. No AWS call is made.
"""
import os
import secrets
from pathlib import Path

import psycopg
import pytest
from psycopg import sql
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from src import database as db
from src.storage import StorageService

KMS_ARN = "arn:aws:kms:ap-south-1:000000000000:key/documents"
OWNER = "issuer.example|subject-123"


class FakeS3:
    def __init__(self):
        self.puts = []

    def head_bucket(self, **_kwargs):
        return {}

    def put_object(self, **kwargs):
        self.puts.append(kwargs)
        return {}

    def delete_object(self, **_kwargs):
        return {}


@pytest.fixture
def hub(monkeypatch):
    dsn = os.getenv("TEST_PG_DSN", "host=localhost port=5432 dbname=postgres user=rhub password=rhub-dev-pwd")
    schema = "test_card_storage_" + secrets.token_hex(8)
    try:
        admin = psycopg.connect(dsn, autocommit=True)
    except psycopg.OperationalError:
        if os.getenv("TEST_PG_DSN"):
            raise
        pytest.skip("Set TEST_PG_DSN to run PostgreSQL integration tests")
    admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
    path = sql.SQL("SET search_path TO {}").format(sql.Identifier(schema))

    def configure(conn):
        conn.execute(path)
        conn.commit()

    pool = ConnectionPool(dsn, min_size=1, max_size=2, configure=configure,
                          kwargs={"row_factory": dict_row}, open=True)
    with pool.connection() as conn:
        conn.execute((Path(__file__).resolve().parents[1] / "sql" / "init.sql").read_text())
    monkeypatch.setattr(db, "_pool", pool)
    try:
        yield pool
    finally:
        pool.close()
        admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
        admin.close()


def test_a_kept_card_is_a_node_version_key_under_sse_kms(hub):
    s3 = FakeS3()
    service = StorageService(s3, "documents-test", KMS_ARN)
    node = service.create_file(OWNER, None, "Aadhaar card.pdf", b"%PDF synthetic card", "application/pdf",
                               OWNER, app_id="pattadar", on_conflict="duplicate")
    [put] = s3.puts
    key = f"{node['id']}/{node['currentVersionId']}"
    assert put["Key"] == key
    assert OWNER not in put["Key"] and "subject-123" not in put["Key"]
    assert put["ServerSideEncryption"] == "aws:kms"
    assert put["SSEKMSKeyId"] == KMS_ARN
    assert put["BucketKeyEnabled"] is True
    # The only metadata is the content type: no name, owner or user metadata.
    assert set(put) == {"Bucket", "Key", "Body", "ContentType", "ServerSideEncryption",
                        "SSEKMSKeyId", "BucketKeyEnabled"}
    assert put["ContentType"] == "application/pdf"
    with hub.connection() as conn:
        version = conn.execute("SELECT object_key FROM storage_versions WHERE id=%s",
                               (node["currentVersionId"],)).fetchone()
    assert version["object_key"] == key
    assert node["name"] == "Aadhaar card.pdf"


def test_a_second_kept_card_is_a_new_file_not_a_new_version(hub):
    s3 = FakeS3()
    service = StorageService(s3, "documents-test", KMS_ARN)
    first = service.create_file(OWNER, None, "Aadhaar card.pdf", b"one", "application/pdf",
                                OWNER, app_id="pattadar", on_conflict="duplicate")
    second = service.create_file(OWNER, None, "Aadhaar card.pdf", b"two", "application/pdf",
                                 OWNER, app_id="pattadar", on_conflict="duplicate")
    assert second["name"] == "Aadhaar card (2).pdf"
    assert second["id"] != first["id"]
    assert [p["Key"] for p in s3.puts] == [f"{first['id']}/{first['currentVersionId']}",
                                           f"{second['id']}/{second['currentVersionId']}"]
