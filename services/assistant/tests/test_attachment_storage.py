import asyncio
from contextlib import asynccontextmanager
import pytest
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('assistant_attachments_under_test', Path(__file__).parents[1] / 'src/adapters/attachment_store.py')
attachments = importlib.util.module_from_spec(spec)
spec.loader.exec_module(attachments)


@pytest.fixture(autouse=True)
def configured_attachment_kms(monkeypatch):
    monkeypatch.setenv(
        'ASSISTANT_ATTACHMENTS_KMS_KEY_ARN',
        'arn:aws:kms:ap-south-1:000000000000:key/documents',
    )


def test_local_bytes_survive_without_any_upload_directory(monkeypatch, tmp_path):
    monkeypatch.delenv('ASSISTANT_ATTACHMENTS_BUCKET', raising=False)
    class Cursor:
        async def fetchone(self): return {'id':'attachment'}
    class Conn:
        @asynccontextmanager
        async def transaction(self):
            yield
        async def execute(self, sql, args):
            if 'INSERT' in sql:
                self.args = args
            return Cursor()
    conn = Conn()
    asyncio.run(attachments.save_attachment(conn,'conversation','alice','deed.pdf',b'pdf-content','application/pdf','file',str(tmp_path/'absent')))
    assert not (tmp_path/'absent').exists()
    assert conn.args[6].startswith('db:')
    assert asyncio.run(attachments.read_attachment_bytes({'content':conn.args[-1]})) == b'pdf-content'


def test_s3_bytes_read_after_process_replacement(monkeypatch):
    monkeypatch.setenv('ASSISTANT_ATTACHMENTS_BUCKET','documents')
    objects = {}
    class Body:
        def read(self): return b'durable'
        def close(self): pass
    class S3:
        def put_object(self, **kw):
            assert kw['ServerSideEncryption'] == 'aws:kms'
            assert kw['SSEKMSKeyId'].endswith('/documents')
            assert kw['BucketKeyEnabled'] is True
            objects[kw['Key']] = kw['Body']
        def get_object(self, **kw):
            assert objects[kw['Key']] == b'durable'
            return {'Body':Body()}
    monkeypatch.setattr(attachments,'_s3',lambda:S3())
    path, inline = asyncio.run(attachments._store(None,'alice','conversation','attachment',b'durable','image/png'))
    assert inline is None
    assert path.startswith('s3://documents/assistant/')
    assert 'alice' not in path
    assert asyncio.run(attachments.read_attachment_bytes({'storage_path':path})) == b'durable'


def test_storage_cannot_read_an_unconfigured_bucket(monkeypatch):
    monkeypatch.setenv('ASSISTANT_ATTACHMENTS_BUCKET','documents')
    try:
        asyncio.run(attachments.read_attachment_bytes({'storage_path':'s3://other/assistant/key'}))
    except ValueError:
        pass
    else:
        raise AssertionError('accepted foreign bucket')


class Cursor:
    def __init__(self,row): self.row=row
    async def fetchone(self): return self.row


@pytest.mark.parametrize('committed',[False,True])
def test_metadata_failure_deletes_only_confirmed_orphan_version(monkeypatch,committed):
    monkeypatch.setenv('ASSISTANT_ATTACHMENTS_BUCKET','documents')
    deleted=[]
    class S3:
        def put_object(self,**kw): return {'VersionId':'created-version'}
        def delete_object(self,**kw): deleted.append(kw)
    monkeypatch.setattr(attachments,'_s3',lambda:S3())
    class Conn:
        @asynccontextmanager
        async def transaction(self): yield
        async def execute(self,query,args):
            if 'r_conversations' in query: return Cursor({'exists':1})
            if 'INSERT' in query: raise RuntimeError('metadata failure')
            return Cursor({'exists':1} if committed else None)
    with pytest.raises(RuntimeError,match='metadata failure'):
        asyncio.run(attachments.save_attachment(Conn(),'conversation','alice','x.pdf',b'bytes','application/pdf','file','ignored'))
    if committed:
        assert not deleted
    else:
        assert deleted[0]['VersionId']=='created-version'
        assert deleted[0]['Bucket']=='documents'


def test_non_owner_cannot_upload_to_a_conversation(monkeypatch):
    class Conn:
        async def execute(self,query,args):
            assert args==('foreign-conversation','mallory')
            return Cursor(None)
    async def never_store(*args,**kwargs): raise AssertionError('upload must not happen')
    monkeypatch.setattr(attachments,'_store',never_store)
    with pytest.raises(PermissionError):
        asyncio.run(attachments.save_attachment(Conn(),'foreign-conversation','mallory','x.pdf',b'bytes','application/pdf','file','ignored'))


def test_missing_durable_blob_is_explicit_error():
    with pytest.raises(attachments.AttachmentUnavailable):
        asyncio.run(attachments.read_attachment_bytes({'content':None,'storage_path':'db:lost'}))


@pytest.mark.parametrize('fails',[False,True])
def test_office_tempfile_is_removed_on_success_and_failure(monkeypatch,fails):
    async def lookup(*args):
        return {'storage_path':'db:file','content':b'office','file_name':'deed.docx','mime_type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}
    monkeypatch.setattr(attachments,'get_attachment',lookup)
    observed=[]
    def parse(path,*args):
        observed.append(Path(path))
        assert Path(path).read_bytes()==b'office'
        if fails: raise ValueError('bad office file')
        return 'deed text'
    if fails:
        with pytest.raises(attachments.AttachmentUnavailable):
            asyncio.run(attachments.build_attachment_blocks(None,['file'],'alice',parse))
    else:
        blocks,_=asyncio.run(attachments.build_attachment_blocks(None,['file'],'alice',parse))
        assert 'deed text' in blocks[0]['text']
    assert len(observed)==1 and not observed[0].exists() and not observed[0].parent.exists()


def test_selected_foreign_attachment_never_reaches_model(monkeypatch):
    async def missing(*args): return None
    monkeypatch.setattr(attachments,'get_attachment',missing)
    with pytest.raises(PermissionError):
        asyncio.run(attachments.build_attachment_blocks(None,['foreign'],'alice'))
