from contextlib import contextmanager
import importlib.util
import io
from pathlib import Path
import shutil
import subprocess
import tempfile
import os

import psycopg
from psycopg.rows import dict_row
import pytest

spec=importlib.util.spec_from_file_location('migrate_attachments',Path(__file__).parents[1]/'scripts/migrate_attachments.py')
migration=importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


@pytest.fixture(scope='module')
def postgres():
    initdb,pg_ctl=shutil.which('initdb'),shutil.which('pg_ctl')
    if not initdb or not pg_ctl or os.geteuid()==0:
        pytest.skip('Temporary PostgreSQL needs initdb/pg_ctl under non-root account')
    with tempfile.TemporaryDirectory(prefix='pattadar-attachment-migration-') as root:
        data=str(Path(root)/'pg')
        subprocess.run([initdb,'-D',data,'-A','trust','--no-locale','--encoding=UTF8'],check=True,capture_output=True)
        subprocess.run([pg_ctl,'-D',data,'-l',str(Path(root)/'log'),'-o',f"-k {root} -h '' -p 55481",'-w','start'],check=True,capture_output=True)
        try: yield f'host={root} port=55481 dbname=postgres'
        finally: subprocess.run([pg_ctl,'-D',data,'-m','immediate','-w','stop'],check=True,capture_output=True)


@pytest.fixture
def db(postgres,tmp_path):
    with psycopg.connect(postgres,autocommit=True,row_factory=dict_row) as conn:
        conn.execute('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
        conn.execute('CREATE TABLE r_conversations(id text primary key,user_id text); CREATE TABLE r_attachments(id text primary key,user_id text,conversation_id text,storage_path text,file_size int,mime_type text)')
        conn.execute("INSERT INTO r_conversations VALUES ('conversation','alice')")
        file=tmp_path/'deed.pdf'; file.write_bytes(b'original deed')
        conn.execute("INSERT INTO r_attachments VALUES ('attachment','alice','conversation',%s,%s,'application/pdf')",(str(file),file.stat().st_size))
        yield conn,tmp_path,file


def test_dry_run_never_changes_legacy_metadata_or_bytes(db):
    conn,root,file=db
    receipt=migration.run(conn,root,execute=False,release_sha='a'*40)
    assert receipt['status']=='planned' and receipt['migratedRows']==0
    assert conn.execute('SELECT storage_path FROM r_attachments').fetchone()['storage_path']==str(file)
    assert file.read_bytes()==b'original deed'


def test_database_backfill_survives_original_volume_loss_and_is_retryable(db):
    conn,root,file=db
    receipt=migration.run(conn,root,execute=True,writers_drained=True,release_sha='a'*40)
    assert receipt['status']=='complete' and receipt['migratedRows']==1
    assert file.exists()  # Migration keeps rollback source files.
    file.unlink()
    row=conn.execute('SELECT storage_path,content FROM r_attachments').fetchone()
    assert row['storage_path']=='db:attachment' and row['content']==b'original deed'
    retry=migration.run(conn,root,execute=True,writers_drained=True,release_sha='a'*40)
    assert retry['status']=='complete' and retry['migratedRows']==0


def test_missing_original_blocks_release_receipt(db):
    conn,root,file=db; file.unlink()
    receipt=migration.run(conn,root,execute=True,writers_drained=True,release_sha='a'*40)
    assert receipt['status']=='blocked' and receipt['missingRows']==['attachment']
    assert receipt['remainingLegacyRows']==1


def test_s3_metadata_failure_removes_only_new_version_and_preserves_source(db):
    conn,root,file=db
    conn.execute("CREATE FUNCTION fail_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$")
    conn.execute('CREATE TRIGGER fail_update BEFORE UPDATE ON r_attachments FOR EACH ROW EXECUTE FUNCTION fail_update()')
    class S3:
        deleted=[]
        def put_object(self,**kw): self.data=kw['Body']; return {'VersionId':'new-version'}
        def get_object(self,**kw): return {'Body':io.BytesIO(self.data)}
        def delete_object(self,**kw): self.deleted.append(kw)
    s3=S3()
    receipt=migration.run(conn,root,execute=True,bucket='documents',s3=s3,writers_drained=True,release_sha='a'*40)
    assert receipt['status']=='blocked'
    assert s3.deleted[0]['VersionId']=='new-version'
    assert file.read_bytes()==b'original deed'
    assert conn.execute('SELECT storage_path FROM r_attachments').fetchone()['storage_path']==str(file)


def test_receipt_requires_drained_old_writers(db):
    conn,root,file=db
    receipt=migration.run(conn,root,execute=True,writers_drained=False,release_sha='a'*40)
    assert receipt['remainingLegacyRows']==0
    assert receipt['status']=='planned'
