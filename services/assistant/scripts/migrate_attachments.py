#!/usr/bin/env python3
"""Backfill legacy disk attachments before replacing the old task/volume.

Read-only plan by default. --execute copies and verifies bytes, then atomically
updates metadata; original files are retained. A complete release receipt also
requires --writers-drained so an old process cannot create new disk-only rows.
"""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re

import psycopg
from psycopg.rows import dict_row


def source_file(row, root):
    path = Path(row['storage_path']).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError('Attachment path falls outside the verified legacy volume')
    data = path.read_bytes()
    if len(data) != row['file_size']:
        raise ValueError('Attachment file size differs from recorded metadata')
    return data


def migrate_one(conn, row, data, bucket, s3=None):
    created = None
    key = 'assistant/'+hashlib.sha256(row['user_id'].encode()).hexdigest()+'/'+str(row['conversation_id'])+'/'+str(row['id'])
    try:
        with conn.transaction():
            current = conn.execute('SELECT storage_path FROM r_attachments WHERE id=%s FOR UPDATE',(row['id'],)).fetchone()
            if not current or current['storage_path'] != row['storage_path']:
                return False
            if bucket:
                kms_key = os.getenv('ASSISTANT_ATTACHMENTS_KMS_KEY_ARN', '').strip()
                if not kms_key:
                    raise RuntimeError('ASSISTANT_ATTACHMENTS_KMS_KEY_ARN is required for S3 migration')
                digest = base64.b64encode(hashlib.sha256(data).digest()).decode()
                uploaded = s3.put_object(
                    Bucket=bucket,
                    Key=key,
                    Body=data,
                    ContentType=row['mime_type'] or 'application/octet-stream',
                    ChecksumSHA256=digest,
                    ServerSideEncryption='aws:kms',
                    SSEKMSKeyId=kms_key,
                    BucketKeyEnabled=True,
                )
                created = {'Bucket':bucket,'Key':key}
                if uploaded.get('VersionId'):
                    created['VersionId'] = uploaded['VersionId']
                response = s3.get_object(**created)
                try:
                    verified = response['Body'].read()
                finally:
                    response['Body'].close()
                if hashlib.sha256(verified).digest() != hashlib.sha256(data).digest():
                    raise ValueError('Durable attachment readback checksum mismatch')
                path,content = 's3://'+bucket+'/'+key,None
            else:
                path,content = 'db:'+str(row['id']),data
            conn.execute('UPDATE r_attachments SET storage_path=%s,content=%s WHERE id=%s',(path,content,row['id']))
        return True
    except Exception:
        if created:
            try:
                # Do not delete bytes after an ambiguous successful commit.
                saved = conn.execute('SELECT storage_path FROM r_attachments WHERE id=%s',(row['id'],)).fetchone()
                if saved and saved['storage_path'] == row['storage_path']:
                    s3.delete_object(**created)
            except Exception:
                pass  # Keep the copy for reconciliation; never strand a committed row.
        raise


def run(conn, root, *, execute=False, bucket='', s3=None, writers_drained=False, release_sha='', durable_writer=None):
    rows = conn.execute("""SELECT a.id,a.user_id,a.conversation_id,a.storage_path,a.file_size,a.mime_type,c.user_id AS conversation_owner
        FROM r_attachments a LEFT JOIN r_conversations c ON c.id=a.conversation_id ORDER BY a.id""").fetchall()
    legacy = [r for r in rows if not r['storage_path'].startswith(('s3://','db:'))]
    result = {'version':1,'releaseSha':release_sha,'generatedAt':datetime.now(timezone.utc).isoformat(),
              'storage':'s3' if bucket else 'database','bucket':bucket,'writersDrained':writers_drained,
              'sourceRows':len(rows),'legacyRows':len(legacy),'migratedRows':0,'missingRows':[],
              'mode':'legacy_backfill','writerEvidence':None,
              'failedRows':[],'remainingLegacyRows':len(legacy),'status':'planned'}
    if execute:
        conn.execute('ALTER TABLE r_attachments ADD COLUMN IF NOT EXISTS content BYTEA')
    for row in legacy:
        if row['user_id'] != row['conversation_owner']:
            result['failedRows'].append({'id':str(row['id']),'reason':'owner_mismatch'})
            continue
        try:
            data = source_file(row,root)
            if execute and migrate_one(conn,row,data,bucket,s3):
                result['migratedRows'] += 1
        except FileNotFoundError:
            result['missingRows'].append(str(row['id']))
        except Exception as exc:
            result['failedRows'].append({'id':str(row['id']),'reason':type(exc).__name__})
    if execute or not legacy:
        remaining = conn.execute("SELECT count(*) AS n FROM r_attachments WHERE storage_path NOT LIKE 's3://%' AND storage_path NOT LIKE 'db:%'").fetchone()['n']
        result['remainingLegacyRows'] = remaining
        proven_durable = (not legacy and durable_writer and durable_writer.get('status')=='deployed'
                          and durable_writer.get('durableAttachmentsVersion')==1
                          and re.search(r'@sha256:[0-9a-f]{64}$',durable_writer.get('images',{}).get('assistant','')))
        if proven_durable:
            result['mode']='durable_verified'
            result['writerEvidence']={'image':durable_writer['images']['assistant'],
                                     'releaseSha':durable_writer['sha'],'capabilityVersion':1}
        if (writers_drained or proven_durable) and remaining == 0 and not result['missingRows'] and not result['failedRows']:
            result['status'] = 'complete'
    if result['missingRows'] or result['failedRows']:
        result['status'] = 'blocked'
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--legacy-root',required=True,type=Path)
    parser.add_argument('--release-sha',required=True)
    parser.add_argument('--storage',choices=['s3','database'],required=True)
    parser.add_argument('--receipt',required=True,type=Path)
    parser.add_argument('--execute',action='store_true')
    parser.add_argument('--writers-drained',action='store_true')
    parser.add_argument('--durable-writer-evidence',type=Path,help='Previous successful release receipt proving the current writer is already durable')
    args=parser.parse_args()
    if not re.fullmatch(r'[0-9a-f]{40}',args.release_sha):
        parser.error('--release-sha must be the full target commit')
    if args.execute and not args.writers_drained:
        parser.error('--execute requires --writers-drained before issuing a rollout receipt')
    bucket = os.environ['ASSISTANT_ATTACHMENTS_BUCKET'] if args.storage=='s3' else ''
    s3 = None
    if args.execute and bucket:
        import boto3
        s3 = boto3.client('s3',region_name=os.getenv('AWS_REGION','ap-south-1'))
    with psycopg.connect(os.environ['ASSISTANT_DSN'],autocommit=True,row_factory=dict_row) as conn:
        if not args.execute:
            conn.execute('SET default_transaction_read_only=on')
        result = run(conn,args.legacy_root,execute=args.execute,bucket=bucket,s3=s3,
                     writers_drained=args.writers_drained,release_sha=args.release_sha,
                     durable_writer=json.loads(args.durable_writer_evidence.read_text()) if args.durable_writer_evidence else None)
    args.receipt.write_text(json.dumps(result,indent=2)+'\n')
    args.receipt.chmod(0o600)
    print(json.dumps({k:result[k] for k in ('status','sourceRows','legacyRows','migratedRows','remainingLegacyRows')}))
    if result['status']!='complete':
        raise SystemExit(2)


if __name__=='__main__':
    main()
