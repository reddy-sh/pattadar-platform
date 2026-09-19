"""S3 upload encryption contract; no AWS or database access."""
import pytest

from src.storage import StorageService


class FakeS3:
    def head_bucket(self, **_kwargs):
        return {}


def test_deployed_puts_pin_sse_kms_key_and_enable_bucket_keys():
    service = StorageService(
        FakeS3(),
        "documents-test",
        "arn:aws:kms:ap-south-1:000000000000:key/documents",
    )
    assert service._put_args(key="owner/node/version", data=b"bytes", mime="image/png") == {
        "Bucket": "documents-test",
        "Key": "owner/node/version",
        "Body": b"bytes",
        "ContentType": "image/png",
        "ServerSideEncryption": "aws:kms",
        "SSEKMSKeyId": "arn:aws:kms:ap-south-1:000000000000:key/documents",
        "BucketKeyEnabled": True,
    }


def test_deployed_storage_fails_closed_without_a_kms_key():
    with pytest.raises(RuntimeError, match="STORAGE_KMS_KEY_ARN is required"):
        StorageService(FakeS3(), "documents-test")


def test_local_minio_exemption_is_explicit_and_omits_aws_kms_headers():
    service = StorageService(
        FakeS3(),
        "local-documents",
        allow_unencrypted_local=True,
    )
    args = service._put_args(key="owner/node/version", data=b"bytes", mime="application/pdf")
    assert "ServerSideEncryption" not in args
    assert "SSEKMSKeyId" not in args
    assert "BucketKeyEnabled" not in args


def test_new_file_and_new_version_paths_both_use_encryption_builder():
    import inspect

    source = inspect.getsource(StorageService.create_file)
    assert source.count("put_object(**self._put_args") == 2
    assert "put_object(Bucket=" not in source


def test_custom_endpoint_exemption_is_rejected_outside_explicit_local_mode(monkeypatch):
    from src.routes.storage import _allow_unencrypted_local

    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("ALLOW_INSECURE_LOCAL", "1")
    with pytest.raises(RuntimeError, match="APP_ENV=local/test"):
        _allow_unencrypted_local("https://alternate.example")

    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.delenv("ALLOW_INSECURE_LOCAL", raising=False)
    with pytest.raises(RuntimeError, match="ALLOW_INSECURE_LOCAL=1"):
        _allow_unencrypted_local("http://127.0.0.1:9000")

    monkeypatch.setenv("ALLOW_INSECURE_LOCAL", "1")
    assert _allow_unencrypted_local("http://127.0.0.1:9000") is True
    assert _allow_unencrypted_local("") is False
