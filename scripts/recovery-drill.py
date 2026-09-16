"""Plan/execute a scratch restore and record actual alert-delivery evidence.

Default mode issues read-only AWS queries. Creating/deleting the isolated
restore and publishing a test notification each require explicit flags.
"""
import argparse
from datetime import datetime,timezone
import json
import os
from pathlib import Path
import re
import subprocess
import uuid


def aws(*args):
    response=subprocess.run(['aws',*args,'--output','json'],check=True,capture_output=True,text=True)
    return json.loads(response.stdout) if response.stdout.strip() else {}


def stamp(): return datetime.now(timezone.utc).isoformat()


def safe_scratch(source,scratch):
    if source==scratch or not re.fullmatch(r'pattadar-restore-drill-[a-z0-9-]{6,40}',scratch):
        raise ValueError('Scratch identifier must use pattadar-restore-drill- and differ from the source')


def inspect(args):
    safe_scratch(args.source_db,args.scratch_id)
    snapshot=aws('rds','describe-db-snapshots','--db-snapshot-identifier',args.snapshot)['DBSnapshots'][0]
    if snapshot['DBInstanceIdentifier']!=args.source_db or snapshot['Status']!='available':
        raise ValueError('An available snapshot of the stated source database is required')
    alarms=aws('cloudwatch','describe-alarms','--alarm-names',args.alarm).get('MetricAlarms',[])
    if len(alarms)!=1 or not alarms[0].get('ActionsEnabled') or args.topic not in alarms[0].get('AlarmActions',[]):
        raise ValueError('Alarm must have enabled routing to the stated notification topic')
    subscriptions=aws('sns','list-subscriptions-by-topic','--topic-arn',args.topic).get('Subscriptions',[])
    confirmed=sum(s.get('SubscriptionArn') not in {None,'PendingConfirmation','Deleted'} for s in subscriptions)
    if not confirmed:
        raise ValueError('Notification topic has no confirmed subscription')
    return {'id':uuid.uuid4().hex,'createdAt':stamp(),'status':'planned','sourceDb':args.source_db,
        'scratchId':args.scratch_id,'snapshot':args.snapshot,'snapshotCreatedAt':snapshot['SnapshotCreateTime'],
        'restore':{'status':'not_requested'},'validation':{'status':'not_run'},
        'alert':{'status':'not_requested','alarm':args.alarm,'topic':args.topic,'confirmedSubscriptions':confirmed},
        'limitations':['Alarm routing inspected; metric-trigger evaluation is not exercised by an SNS delivery test.']}


def record_delivery(receipt,evidence):
    alert=receipt['alert']
    if alert.get('status') not in {'requested','delivered','verified'} or evidence.get('messageId')!=alert.get('messageId'):
        raise ValueError('Delivery evidence must identify this exact requested test notification')
    observed=datetime.fromisoformat(evidence.get('observedAt','').replace('Z','+00:00'))
    requested=datetime.fromisoformat(alert['requestedAt'])
    if observed.tzinfo is None or observed<requested or observed>datetime.now(timezone.utc) or not evidence.get('reference'):
        raise ValueError('A timestamped actual delivery reference is required')
    alert.update(status='delivered',deliveryEvidence={'observedAt':evidence['observedAt'],'reference':evidence['reference'],'method':'operator_observation'})
    if receipt['validation']['status']=='verified':
        alert['status']='verified'
        receipt['status']='verified'


def validate_restored_database(receipt,dsn,minimum_counts):
    import psycopg
    from psycopg import sql
    from psycopg.conninfo import conninfo_to_dict
    options=conninfo_to_dict(dsn)
    if options.get('host')!=receipt['restore'].get('endpoint') or options.get('hostaddr'):
        raise ValueError('Verification DSN must point only to the recorded scratch endpoint')
    if not minimum_counts or any(not re.fullmatch(r'[a-z][a-z0-9_]*',table) or not isinstance(count,int) or count<0 for table,count in minimum_counts.items()):
        raise ValueError('Supply reviewed table names and minimum row-count checks')
    actual={}
    with psycopg.connect(dsn) as conn:
        conn.execute('SET TRANSACTION READ ONLY')
        for table,minimum in minimum_counts.items():
            count=conn.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(table))).fetchone()[0]
            if count<minimum:
                raise ValueError('Restored data does not satisfy the reviewed verification baseline')
            actual[table]=count
    receipt['validation']={'status':'verified','verifiedAt':stamp(),'rowCounts':actual,'method':'scratch_read_only_queries'}
    receipt['status']='restored_verified_alert_pending'
    if receipt['alert']['status'] in {'delivered','verified'}:
        receipt['status']='verified'; receipt['alert']['status']='verified'


def execute(args,receipt):
    # A copied source snapshot is always restored as a private, tagged scratch
    # instance. This workflow never modifies or deletes the source instance.
    if receipt['restore']['status']=='not_requested':
        receipt['restore']={'status':'requested','requestedAt':stamp()}
        args.receipt.write_text(json.dumps(receipt,indent=2)+'\n')
        result=aws('rds','restore-db-instance-from-db-snapshot','--db-instance-identifier',args.scratch_id,
            '--db-snapshot-identifier',args.snapshot,'--db-subnet-group-name',args.subnet_group,
            '--vpc-security-group-ids',*args.security_groups,'--db-instance-class',args.instance_class,
            '--no-publicly-accessible','--no-multi-az','--tags','Key=PattadarRestoreDrillId,Value='+receipt['id'])
        receipt['restore']['arn']=result['DBInstance']['DBInstanceArn']
        args.receipt.write_text(json.dumps(receipt,indent=2)+'\n')
    aws('rds','wait','db-instance-available','--db-instance-identifier',args.scratch_id)
    restored=aws('rds','describe-db-instances','--db-instance-identifier',args.scratch_id)['DBInstances'][0]
    if restored['DBInstanceArn']!=receipt['restore'].get('arn') or restored.get('PubliclyAccessible'):
        raise ValueError('Scratch identity or network safety changed')
    receipt['restore'].update(status='available',endpoint=restored['Endpoint']['Address'],availableAt=stamp())
    receipt['status']='restored_unverified'
    if args.send_test_alert and receipt['alert']['status']=='not_requested':
        result=aws('sns','publish','--topic-arn',args.topic,'--subject','Pattadar recovery drill',
            '--message','Pattadar recovery drill '+receipt['id']+'. Record actual receipt time and this drill ID; no customer incident is being declared.')
        receipt['alert'].update(status='requested',messageId=result['MessageId'],requestedAt=stamp())
    if args.verification_counts:
        validate_restored_database(receipt,os.environ[args.verification_dsn_env],json.loads(args.verification_counts.read_text()))
    if args.delivery_evidence:
        record_delivery(receipt,json.loads(args.delivery_evidence.read_text()))


def cleanup(args,receipt):
    safe_scratch(args.source_db,args.scratch_id)
    if receipt.get('scratchId')!=args.scratch_id or not receipt.get('restore',{}).get('arn'):
        raise ValueError('Cleanup requires this drill receipt and its recorded scratch ARN')
    tags=aws('rds','list-tags-for-resource','--resource-name',receipt['restore']['arn']).get('TagList',[])
    if {'Key':'PattadarRestoreDrillId','Value':receipt['id']} not in tags:
        raise ValueError('Scratch resource tag does not match this drill')
    restored=aws('rds','describe-db-instances','--db-instance-identifier',args.scratch_id)['DBInstances'][0]
    if restored['DBInstanceArn']!=receipt['restore']['arn']:
        raise ValueError('Scratch resource ARN does not match')
    aws('rds','delete-db-instance','--db-instance-identifier',args.scratch_id,'--skip-final-snapshot','--delete-automated-backups')
    receipt['cleanup']={'status':'requested','requestedAt':stamp()}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ('source-db','snapshot','scratch-id','alarm','topic'):
        parser.add_argument('--'+name,required=True)
    parser.add_argument('--receipt',type=Path,required=True)
    parser.add_argument('--execute',action='store_true')
    parser.add_argument('--cleanup',action='store_true')
    parser.add_argument('--subnet-group')
    parser.add_argument('--security-groups',nargs='+')
    parser.add_argument('--instance-class',default='db.t4g.small')
    parser.add_argument('--send-test-alert',action='store_true')
    parser.add_argument('--verification-counts',type=Path)
    parser.add_argument('--verification-dsn-env',default='DRILL_PG_DSN')
    parser.add_argument('--delivery-evidence',type=Path)
    args=parser.parse_args()
    safe_scratch(args.source_db,args.scratch_id)
    receipt=json.loads(args.receipt.read_text()) if args.receipt.exists() else inspect(args)
    if receipt.get('scratchId')!=args.scratch_id or receipt.get('sourceDb')!=args.source_db or receipt.get('snapshot')!=args.snapshot:
        parser.error('Existing receipt does not match requested drill')
    try:
        if args.execute:
            if args.cleanup:
                cleanup(args,receipt)
            else:
                if not args.subnet_group or not args.security_groups:
                    parser.error('Execution requires explicit private subnet group and security groups')
                execute(args,receipt)
        elif args.cleanup or args.send_test_alert:
            parser.error('Creating, publishing or deleting requires --execute')
        elif args.delivery_evidence:
            record_delivery(receipt,json.loads(args.delivery_evidence.read_text()))
    except Exception:
        receipt['lastAttempt']={'status':'failed','at':stamp()}
        raise
    finally:
        args.receipt.write_text(json.dumps(receipt,indent=2)+'\n')
        args.receipt.chmod(0o600)
    print(json.dumps({'id':receipt['id'],'status':receipt['status'],'restore':receipt['restore']['status'],'alert':receipt['alert']['status']}))


if __name__=='__main__':
    main()
