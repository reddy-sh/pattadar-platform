"""Promote one tested source revision with migration proof and complete rollback.

Read-only AWS preflight by default; --execute is required for any rollout.
"""
import argparse
import copy
from datetime import datetime, timezone
import importlib.util
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path
import uuid


def aws(*args):
    result = subprocess.run(['aws',*args,'--output','json'],check=True,capture_output=True,text=True)
    return json.loads(result.stdout) if result.stdout.strip() else {}


def transfer(*args):
    subprocess.run(['aws','s3',*args],check=True,capture_output=True,text=True)


def fresh_timestamp(raw):
    value = datetime.fromisoformat(str(raw).replace('Z','+00:00'))
    if value.tzinfo is None or not 0 <= (datetime.now(timezone.utc)-value).total_seconds() <= 86400:
        raise ValueError('Release evidence must be timezone-qualified and refreshed within 24 hours')


def validate_preflight(proof,sha):
    if proof.get('version')!=1 or proof.get('releaseSha')!=sha:
        raise ValueError('Preflight evidence must target this exact release SHA')
    fresh_timestamp(proof.get('generatedAt'))
    spec = importlib.util.spec_from_file_location('identity_preflight',Path(__file__).parents[1]/'services/gateway/scripts/identity_preflight.py')
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    identity = proof.get('identity',{})
    try:
        identity_env = migration.validate(identity['manifest'],identity['cognito'],identity['owners'])
    except Exception:
        raise ValueError('Identity migration evidence is incomplete; run the private offline preflight for details') from None
    # Raw deployment variables cannot substitute for a reviewed full inventory.
    for key,expected in identity_env.items():
        if key in os.environ and os.environ[key].strip():
            actual = os.environ[key]
            agrees = json.loads(actual)==json.loads(expected) if key=='IDENTITY_LEGACY_BINDINGS' else set(filter(None,map(str.strip,actual.split(','))))==set(filter(None,expected.split(',')))
            if not agrees:
                raise ValueError('Deployment identity variables differ from reviewed migration evidence')
    attachments = proof.get('attachments',{})
    routine=(attachments.get('mode')=='durable_verified' and attachments.get('legacyRows')==0
             and attachments.get('migratedRows')==0 and attachments.get('writerEvidence',{}).get('capabilityVersion')==1)
    if attachments.get('releaseSha')!=sha or attachments.get('status')!='complete' or (attachments.get('writersDrained') is not True and not routine):
        raise ValueError('Completed attachment backfill or proven durable writers are required before replacement')
    fresh_timestamp(attachments.get('generatedAt'))
    if attachments.get('remainingLegacyRows')!=0 or attachments.get('missingRows') or attachments.get('failedRows'):
        raise ValueError('Attachment migration is incomplete; do not replace the old task/volume')
    for field in ('sourceRows','legacyRows','migratedRows'):
        if not isinstance(attachments.get(field),int) or attachments[field]<0:
            raise ValueError('Attachment migration receipt has invalid counts')
    if not attachments['migratedRows']<=attachments['legacyRows']<=attachments['sourceRows']:
        raise ValueError('Attachment migration receipt counts are inconsistent')
    rollback = proof.get('rollback',{}).get('assistant',{})
    if not rollback.get('taskDefinition') or rollback.get('durableReadVerified') is not True or not rollback.get('evidence'):
        raise ValueError('A tested durable-reader assistant rollback task is required')
    return identity_env


TASK_FIELDS = {'family','taskRoleArn','executionRoleArn','networkMode','containerDefinitions','volumes','placementConstraints','requiresCompatibilities','cpu','memory','pidMode','ipcMode','proxyConfiguration','inferenceAccelerators','ephemeralStorage','runtimePlatform'}


def definition(current,service,image,identity_env=None):
    result = copy.deepcopy({key:value for key,value in current.items() if key in TASK_FIELDS})
    container = next(c for c in result['containerDefinitions'] if c['name']==service)
    container['image']=image
    env = {item['name']:item['value'] for item in container.get('environment',[])}
    if service=='gateway':
        if identity_env is None:
            raise ValueError('Reviewed identity migration inputs are required')
        env.update(identity_env)
        env.pop('ADMIN_USER_IDS',None)
    if service=='assistant' and not env.get('ASSISTANT_ATTACHMENTS_BUCKET'):
        raise ValueError('Apply durable assistant bucket/IAM infrastructure before release')
    if service=='api':
        names = set(env)|{item['name'] for item in container.get('secrets',[])}
        if not {'APP_PUBLIC_URL','CRON_SECRET'}<=names:
            raise ValueError('Apply required API runtime configuration before release')
    container['environment']=[{'name':key,'value':value} for key,value in env.items()]
    return result


def simulate(role,actions,resource):
    response=aws('iam','simulate-principal-policy','--policy-source-arn',role,'--action-names',*actions,'--resource-arns',resource)
    decisions={row['EvalActionName']:row['EvalDecision'] for row in response.get('EvaluationResults',[])}
    if any(decisions.get(action)!='allowed' for action in actions):
        raise ValueError('Required durable attachment task permissions are not applied')


def durable_runtime(task,bucket):
    container=next(c for c in task['containerDefinitions'] if c['name']=='assistant')
    env={item['name']:item['value'] for item in container.get('environment',[])}
    if not bucket or env.get('ASSISTANT_ATTACHMENTS_BUCKET')!=bucket:
        raise ValueError('Migration destination differs from assistant task storage configuration')
    role=task.get('taskRoleArn')
    if not role:
        raise ValueError('Assistant task role is missing')
    simulate(role,['s3:GetObject','s3:PutObject','s3:DeleteObject'],'arn:aws:s3:::'+bucket+'/assistant/release-preflight/test')
    encryption=aws('s3api','get-bucket-encryption','--bucket',bucket)
    for rule in encryption.get('ServerSideEncryptionConfiguration',{}).get('Rules',[]):
        setting=rule.get('ApplyServerSideEncryptionByDefault',{})
        if setting.get('SSEAlgorithm') in {'aws:kms','aws:kms:dsse'}:
            key=setting.get('KMSMasterKeyID')
            if not key:
                raise ValueError('An explicit KMS key is required for assistant storage')
            if not key.startswith('arn:'):
                key=aws('kms','describe-key','--key-id',key)['KeyMetadata']['Arn']
            simulate(role,['kms:Decrypt','kms:GenerateDataKey'],key)


def pinned_rollback(args,service,task):
    """Capture what is actually running, even when its old image tag is mutable."""
    result=copy.deepcopy({key:value for key,value in task.items() if key in TASK_FIELDS})
    container=next(c for c in result['containerDefinitions'] if c['name']==service)
    if re.search(r'@sha256:[0-9a-f]{64}$',container['image']):
        return result
    arns=aws('ecs','list-tasks','--cluster',args.cluster,'--service-name',service,'--desired-status','RUNNING').get('taskArns',[])
    if not arns:
        raise ValueError('No running rollback image for '+service)
    digests=set()
    for offset in range(0,len(arns),100):
        tasks=aws('ecs','describe-tasks','--cluster',args.cluster,'--tasks',*arns[offset:offset+100])
        if tasks.get('failures'):
            raise ValueError('Cannot inspect running rollback images')
        for running in tasks.get('tasks',[]):
            if running.get('taskDefinitionArn')!=task['taskDefinitionArn']:
                raise ValueError('An existing deployment is still changing; wait before releasing')
            active=next(c for c in running['containers'] if c['name']==service)
            digests.add(active.get('imageDigest',''))
    if len(digests)!=1 or not re.fullmatch(r'sha256:[0-9a-f]{64}',next(iter(digests))):
        raise ValueError('Running service does not have one verifiable rollback image')
    image=container['image'].split('@')[0]
    if ':' in image.rsplit('/',1)[-1]:
        image=image.rsplit(':',1)[0]
    container['image']=image+'@'+next(iter(digests))
    return result


def plan(args,proof):
    identity_env=validate_preflight(proof,args.sha)
    head=subprocess.run(['git','rev-parse','HEAD'],check=True,capture_output=True,text=True).stdout.strip()
    if head!=args.sha:
        raise ValueError('Working source revision differs from the tested release SHA')
    dirty=subprocess.run(['git','status','--porcelain','--untracked-files=no'],check=True,capture_output=True,text=True).stdout.strip()
    if dirty:
        raise ValueError('Tracked source differs from the tested revision')
    if args.web_origin=='spa':
        if not Path('apps/web/dist/index.html').is_file() or Path('apps/web/dist/.release-sha').read_text().strip()!=args.sha:
            raise ValueError('Web bundle must be built and stamped with this exact release SHA')
    repos=json.loads(args.repositories.read_text())
    services=['api','assistant','gateway']+(['web'] if args.web_origin=='ecs' else [])
    planned,originals,images,rollback_defs={},{},{},{}
    for service in services:
        status=aws('ecs','describe-services','--cluster',args.cluster,'--services',service)
        if status.get('failures') or not status.get('services') or status['services'][0]['status']!='ACTIVE':
            raise RuntimeError('Missing active service: '+service)
        originals[service]=status['services'][0]['taskDefinition']
        task=aws('ecs','describe-task-definition','--task-definition',originals[service])['taskDefinition']
        if service!='assistant':
            rollback_defs[service]=pinned_rollback(args,service,task)
        if service=='assistant' and proof['attachments'].get('mode')=='durable_verified':
            image=next(c for c in task['containerDefinitions'] if c['name']=='assistant')['image']
            if image!=proof['attachments']['writerEvidence'].get('image'):
                raise ValueError('Routine migration evidence does not match the current durable writer image')
        repo=repos[service]
        details=aws('ecr','describe-images','--repository-name',repo.split('/',1)[1],'--image-ids','imageTag='+args.sha).get('imageDetails',[])
        if len(details)!=1 or not re.fullmatch(r'sha256:[0-9a-f]{64}',details[0].get('imageDigest','')):
            raise ValueError('Missing immutable image digest for '+service)
        images[service]=repo+'@'+details[0]['imageDigest']
        planned[service]=definition(task,service,images[service],identity_env)
    attachments=proof['attachments']
    if attachments.get('storage')!='s3':
        raise ValueError('Production release requires durable S3 attachment migration')
    durable_runtime(planned['assistant'],attachments.get('bucket'))
    rollback_arn=proof['rollback']['assistant']['taskDefinition']
    rollback=aws('ecs','describe-task-definition','--task-definition',rollback_arn)['taskDefinition']
    if rollback.get('taskDefinitionArn')!=rollback_arn or rollback.get('status')!='ACTIVE':
        raise ValueError('Assistant durable rollback task is not active')
    durable_runtime(rollback,attachments.get('bucket'))
    rollback_image=next(c for c in rollback['containerDefinitions'] if c['name']=='assistant')['image']
    if not re.search(r'@sha256:[0-9a-f]{64}$',rollback_image):
        raise ValueError('Assistant rollback image must be pinned to a tested immutable digest')
    originals['assistant']=rollback_arn
    return planned,originals,images,rollback_defs


def healthy(args,service,arn):
    aws('ecs','wait','services-stable','--cluster',args.cluster,'--services',service)
    live=aws('ecs','describe-services','--cluster',args.cluster,'--services',service)['services'][0]
    if live['taskDefinition']!=arn or live['runningCount']<1 or live.get('pendingCount',0):
        raise RuntimeError(service+' did not become healthy on the requested revision')


def invalidate(args):
    result=aws('cloudfront','create-invalidation','--distribution-id',args.distribution,'--paths','/*')
    aws('cloudfront','wait','invalidation-completed','--distribution-id',args.distribution,'--id',result['Invalidation']['Id'])


def execute(args,planned,originals,images,rollback_defs=None):
    release_id=args.sha+'-'+uuid.uuid4().hex[:12]
    backup='s3://'+args.spa_bucket+'/releases/'+release_id+'/previous/'
    receipt={'sha':args.sha,'releaseId':release_id,'sourceTaskDefinitions':dict(originals),'previous':originals,'next':{},'images':images,'status':'deploying','websiteBackup':backup,'durableAttachmentsVersion':1}
    changed=[]
    spa_changed=False
    try:
        if args.web_origin=='spa':
            # Back up every mutable public file as well as index.html. Old
            # hashed assets remain in place for existing tabs and rollback.
            transfer('sync','s3://'+args.spa_bucket+'/',backup,'--exclude','releases/*')
        for service,body in (rollback_defs or {}).items():
            with tempfile.TemporaryDirectory(prefix='pattadar-rollback-') as temp:
                path=Path(temp)/'definition.json'
                path.write_text(json.dumps(body))
                originals[service]=aws('ecs','register-task-definition','--cli-input-json','file://'+str(path))['taskDefinition']['taskDefinitionArn']
        for service,body in planned.items():
            with tempfile.TemporaryDirectory(prefix='pattadar-release-') as temp:
                path=Path(temp)/'definition.json'
                path.write_text(json.dumps(body))
                arn=aws('ecs','register-task-definition','--cli-input-json','file://'+str(path))['taskDefinition']['taskDefinitionArn']
            receipt['next'][service]=arn
            changed.append(service)
            aws('ecs','update-service','--cluster',args.cluster,'--service',service,'--task-definition',arn)
            healthy(args,service,arn)
        if args.web_origin=='spa':
            # Set this before the first mutation: a partial upload must restore
            # old public files even if sync fails before publishing index.html.
            spa_changed=True
            transfer('sync','apps/web/dist','s3://'+args.spa_bucket,'--exclude','index.html','--exclude','.release-sha','--exclude','releases/*','--cache-control','no-cache')
            transfer('cp','apps/web/dist/index.html','s3://'+args.spa_bucket+'/index.html','--cache-control','no-cache')
        invalidate(args)
        receipt['status']='deployed'
    except Exception:
        receipt['status']='rolled-back'
        for service in reversed(changed):
            try:
                aws('ecs','update-service','--cluster',args.cluster,'--service',service,'--task-definition',originals[service])
                healthy(args,service,originals[service])
            except Exception:
                receipt['status']='rollback-incomplete'
        if spa_changed:
            try:
                transfer('sync',backup,'s3://'+args.spa_bucket+'/','--exclude','releases/*','--cache-control','no-cache')
                invalidate(args)
            except Exception:
                receipt['status']='rollback-incomplete'
        raise
    finally:
        Path('release-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    return receipt


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cluster',required=True)
    parser.add_argument('--repositories',type=Path,required=True)
    parser.add_argument('--preflight',type=Path,required=True)
    parser.add_argument('--sha',required=True)
    parser.add_argument('--web-origin',choices=['spa','ecs'],default='spa')
    parser.add_argument('--spa-bucket',required=True)
    parser.add_argument('--distribution',required=True)
    parser.add_argument('--execute',action='store_true')
    args=parser.parse_args()
    if not re.fullmatch(r'[0-9a-f]{40}',args.sha):
        parser.error('--sha must be a full Git SHA')
    planned,originals,images,rollback_defs=plan(args,json.loads(args.preflight.read_text()))
    print('Validated release:',args.sha,', '.join(planned))
    if not args.execute:
        print('Dry run: no services, website files or provider data changed.')
        return
    execute(args,planned,originals,images,rollback_defs)


if __name__=='__main__':
    main()
