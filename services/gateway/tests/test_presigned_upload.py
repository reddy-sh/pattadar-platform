"""Direct-to-S3 upload contract: the presigned form and the confirm step.

No AWS and no database — the S3 client is a fake that records what it was
asked for, and every test here is about what the gateway signs, not about
what S3 does with it.
"""
import pytest

from src.storage import (
    PENDING_PREFIX,
    StorageConflict,
    StorageNotFound,
    StorageService,
    StorageTooLarge,
)

KMS_ARN = "arn:aws:kms:ap-south-1:000000000000:key/documents"


class _S3Error(Exception):
    """Shaped like botocore's ClientError — the bit the code reads."""

    def __init__(self, code, status):
        super().__init__(code)
        self.response = {
            "Error": {"Code": code},
            "ResponseMetadata": {"HTTPStatusCode": status},
        }


class FakeS3:
    def __init__(self, head=None):
        self.head = head
        self.presign_calls = []
        self.copy_calls = []
        self.deleted = []

    def head_bucket(self, **_kwargs):
        return {}

    def generate_presigned_post(self, **kwargs):
        self.presign_calls.append(kwargs)
        return {"url": "https://s3.example/bucket", "fields": {"key": kwargs["Key"]}}

    def head_object(self, **_kwargs):
        if self.head is None:
            raise _S3Error("NoSuchKey", 404)
        return self.head

    def copy_object(self, **kwargs):
        self.copy_calls.append(kwargs)
        return {}

    def delete_object(self, **kwargs):
        self.deleted.append(kwargs.get("Key"))
        return {}


def _service(s3, *, local=False):
    return StorageService(
        s3,
        "documents-test",
        "" if local else KMS_ARN,
        allow_unencrypted_local=local,
    )


# -- the key ----------------------------------------------------------------


def test_object_key_carries_no_owner_segment():
    """Authorization is decided in SQL, never by key prefix.

    A derived identity in the key is what stranded bytes under a prefix no
    later request could rebuild.
    """
    svc = _service(FakeS3())
    assert svc._key("shankarreddy.t", "node-1", "ver-1") == "node-1/ver-1"
    assert svc._key("subject_9f8e7d", "node-1", "ver-1") == "node-1/ver-1"


def test_two_identities_for_one_person_resolve_to_the_same_key():
    svc = _service(FakeS3())
    assert svc._key("shankarreddy.t", "n", "v") == svc._key("subject_9f8e7d", "n", "v")


def test_pending_uploads_sit_under_their_own_prefix():
    svc = _service(FakeS3())
    assert svc._pending_key("up-1") == "pending/up-1"
    assert svc._pending_key("up-1").startswith(PENDING_PREFIX)


# -- the presigned form -----------------------------------------------------


def test_presign_bounds_the_upload_size():
    """A presigned PUT cannot do this, which is why the form is a POST."""
    s3 = FakeS3()
    _service(s3).presign_upload("owner", mime="application/pdf", max_bytes=1024)
    conditions = s3.presign_calls[0]["Conditions"]
    assert ["content-length-range", 1, 1024] in conditions


def test_presign_chooses_the_key_itself():
    """A caller-supplied key is a write into someone else's object."""
    s3 = FakeS3()
    out = _service(s3).presign_upload("owner", mime="image/png", max_bytes=10)
    signed_key = s3.presign_calls[0]["Key"]
    assert signed_key == f"{PENDING_PREFIX}{out['uploadId']}"
    # The upload id is opaque and server-minted, never echoed from a caller.
    assert "owner" not in signed_key


def test_presign_pins_the_content_type():
    s3 = FakeS3()
    _service(s3).presign_upload("owner", mime="application/pdf", max_bytes=10)
    call = s3.presign_calls[0]
    assert call["Fields"]["Content-Type"] == "application/pdf"
    assert {"Content-Type": "application/pdf"} in call["Conditions"]


def test_presign_signs_the_sse_kms_fields_when_deployed():
    """Signed as FORM FIELDS, which the client echoes back verbatim.

    This is the difference that makes POST workable where a presigned PUT
    plus SSE-KMS is a 403 waiting to happen: with PUT the client must
    reproduce the headers byte-for-byte itself.
    """
    s3 = FakeS3()
    _service(s3).presign_upload("owner", mime="image/png", max_bytes=10)
    fields = s3.presign_calls[0]["Fields"]
    conditions = s3.presign_calls[0]["Conditions"]
    assert fields["x-amz-server-side-encryption"] == "aws:kms"
    assert fields["x-amz-server-side-encryption-aws-kms-key-id"] == KMS_ARN
    assert {"x-amz-server-side-encryption": "aws:kms"} in conditions
    assert {"x-amz-server-side-encryption-aws-kms-key-id": KMS_ARN} in conditions


def test_presign_omits_kms_fields_on_the_local_minio_path():
    s3 = FakeS3()
    _service(s3, local=True).presign_upload("owner", mime="image/png", max_bytes=10)
    fields = s3.presign_calls[0]["Fields"]
    assert "x-amz-server-side-encryption" not in fields
    # The size bound is not a cloud-only concern and stays.
    assert ["content-length-range", 1, 10] in s3.presign_calls[0]["Conditions"]


def test_presign_expiry_is_minutes_not_days():
    s3 = FakeS3()
    _service(s3).presign_upload("owner", mime="image/png", max_bytes=10)
    assert 0 < s3.presign_calls[0]["ExpiresIn"] <= 3600


# -- confirming the upload --------------------------------------------------


def test_completing_an_upload_that_does_not_exist_is_not_found():
    svc = _service(FakeS3(head=None))
    with pytest.raises(StorageNotFound):
        svc.create_file_from_pending(
            "owner", "up-1", None, "deed.pdf", "owner", max_bytes=100
        )


def test_upload_id_cannot_escape_the_pending_prefix():
    """Otherwise a caller names any object in the bucket as their 'upload'."""
    svc = _service(FakeS3(head={"ContentLength": 10}))
    for bad in ["../node-1/ver-1", "node-1/ver-1", ".."]:
        with pytest.raises(StorageConflict):
            svc.create_file_from_pending(
                "owner", bad, None, "deed.pdf", "owner", max_bytes=100
            )


def test_an_oversized_object_is_rejected_and_reaped():
    s3 = FakeS3(head={"ContentLength": 5000, "ContentType": "application/pdf"})
    svc = _service(s3)
    with pytest.raises(StorageTooLarge, match="too large"):
        svc.create_file_from_pending(
            "owner", "up-1", None, "deed.pdf", "owner", max_bytes=100
        )
    assert s3.deleted == ["pending/up-1"]
    assert s3.copy_calls == []


def test_oversize_answers_413_like_the_proxied_upload_does():
    """Not 409. A name collision and a too-big file are different answers."""
    from src.routes.storage import _err

    assert _err(StorageTooLarge("File too large")).status_code == 413
    assert _err(StorageConflict("'deed.pdf' already exists here")).status_code == 409


def test_a_real_s3_failure_is_not_reported_as_a_missing_upload():
    """Telling a client 404 would tell it to discard bytes S3 actually holds."""
    svc = _service(FakeS3())
    svc._s3.head_object = lambda **_k: (_ for _ in ()).throw(_S3Error("AccessDenied", 403))
    with pytest.raises(_S3Error):
        svc.create_file_from_pending(
            "owner", "up-1", None, "deed.pdf", "owner", max_bytes=100
        )


def test_a_genuine_miss_is_still_not_found():
    svc = _service(FakeS3())
    svc._s3.head_object = lambda **_k: (_ for _ in ()).throw(_S3Error("NoSuchKey", 404))
    with pytest.raises(StorageNotFound):
        svc.create_file_from_pending(
            "owner", "up-1", None, "deed.pdf", "owner", max_bytes=100
        )


def test_an_empty_object_is_rejected_and_reaped():
    s3 = FakeS3(head={"ContentLength": 0})
    svc = _service(s3)
    with pytest.raises(StorageConflict, match="empty"):
        svc.create_file_from_pending(
            "owner", "up-1", None, "deed.pdf", "owner", max_bytes=100
        )
    assert s3.deleted == ["pending/up-1"]


def test_the_confirm_step_reads_size_from_s3_not_from_the_caller():
    """The gateway never saw these bytes, so it does not take the client's word.

    ``create_file_from_pending`` has no size parameter at all — the only
    number that can reach the row is the one HeadObject reported.
    """
    import inspect

    sig = inspect.signature(StorageService.create_file_from_pending)
    assert "size" not in sig.parameters
    assert "size_bytes" not in sig.parameters
    source = inspect.getsource(StorageService.create_file_from_pending)
    assert 'head.get("ContentLength")' in source


def test_the_copy_to_the_live_key_is_encrypted_like_every_other_write():
    svc = _service(FakeS3())
    args = svc._copy_args(src_key="pending/up-1", key="node-1/ver-1", mime="image/png")
    assert args["ServerSideEncryption"] == "aws:kms"
    assert args["SSEKMSKeyId"] == KMS_ARN
    assert args["BucketKeyEnabled"] is True
    # A copy otherwise inherits the source's content type, and the source's
    # type is whatever the client declared.
    assert args["MetadataDirective"] == "REPLACE"
    assert args["ContentType"] == "image/png"


def test_the_local_copy_path_omits_kms_like_the_local_put_path():
    svc = _service(FakeS3(), local=True)
    args = svc._copy_args(src_key="pending/up-1", key="node-1/ver-1", mime="image/png")
    assert "ServerSideEncryption" not in args
    assert "SSEKMSKeyId" not in args


def test_every_byte_writing_path_goes_through_an_encryption_builder():
    """No bare put_object/copy_object anywhere in the service."""
    import inspect

    source = inspect.getsource(StorageService)
    assert "put_object(Bucket=" not in source
    assert "copy_object(Bucket=" not in source
    assert source.count("copy_object(**self._copy_args") == 1
