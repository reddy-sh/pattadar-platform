import copy
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import types

import pytest

spec=importlib.util.spec_from_file_location('deploy_release',Path(__file__).parents[1]/'deploy-release.py')
release=importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
SHA='a'*40
DIGEST='sha256:'+'b'*64


def evidence():
    now=datetime.now(timezone.utc).isoformat()
    return {'version':1,'releaseSha':SHA,'generatedAt':now,
        'identity':{'manifest':{'issuer':'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_POOL',
            'bindings':[{'subject':'s1','owner_id':'alice','evidence':'historic ownership review'}],'admin_subjects':['s1']},
            'cognito':{'Users':[{'Attributes':[{'Name':'sub','Value':'s1'}]}]},
            'owners':{'owner_ids':['alice'],'sources':['api','hub','assistant'],'complete':True,'admin_owner_ids':['alice']}},
        'attachments':{'releaseSha':SHA,'generatedAt':now,'status':'complete','writersDrained':True,
            'sourceRows':2,'legacyRows':2,'migratedRows':2,'remainingLegacyRows':0,'missingRows':[],'failedRows':[],'storage':'s3','bucket':'docs'},
        'rollback':{'assistant':{'taskDefinition':'durable-assistant','durableReadVerified':True,'evidence':'staging read/download test'}}}


@pytest.fixture
def env(monkeypatch,tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv('IDENTITY_LEGACY_BINDINGS',raising=False)
    monkeypatch.delenv('ADMIN_SUBJECT_IDS',raising=False)
    dist=tmp_path/'apps/web/dist'
    dist.mkdir(parents=True)
    (dist/'index.html').write_text('new index')
    (dist/'.release-sha').write_text(SHA)
    repos=tmp_path/'repos.json'
    repos.write_text(json.dumps({s:'registry/'+s for s in ['api','assistant','gateway']}))
    args=types.SimpleNamespace(cluster='cluster',repositories=repos,sha=SHA,web_origin='spa',spa_bucket='web',distribution='cdn')
    monkeypatch.setattr(release.subprocess,'run',lambda cmd,**kw: types.SimpleNamespace(stdout=SHA if cmd[:2]==['git','rev-parse'] else ''))
    return args


def task(service):
    env=[{'name':'APP_PUBLIC_URL','value':'https://pattadar.com'},{'name':'CRON_SECRET','value':'ref'}, {'name':'ASSISTANT_ATTACHMENTS_BUCKET','value':'docs'}]
    return {'family':service,'taskDefinitionArn':'old-'+service,'status':'ACTIVE','taskRoleArn':'role','containerDefinitions':[{'name':service,'image':'registry/'+service+'@'+DIGEST,'environment':env}]}


class AWS:
    def __init__(self): self.live={s:'old-'+s for s in ['api','assistant','gateway']}; self.calls=[]; self.counter=0
    def __call__(self,*args):
        self.calls.append(args)
        if args[:2]==('ecs','describe-services'):
            service=args[args.index('--services')+1]
            return {'services':[{'status':'ACTIVE','taskDefinition':self.live[service],'runningCount':1,'pendingCount':0}]}
        if args[:2]==('ecs','describe-task-definition'):
            arn=args[-1]
            service='assistant' if arn=='durable-assistant' else arn.replace('old-','')
            definition=task(service); definition['taskDefinitionArn']=arn
            return {'taskDefinition':definition}
        if args[:2]==('ecr','describe-images'): return {'imageDetails':[{'imageDigest':DIGEST}]}
        if args[:2]==('iam','simulate-principal-policy'):
            actions=args[args.index('--action-names')+1:args.index('--resource-arns')]
            return {'EvaluationResults':[{'EvalActionName':a,'EvalDecision':'allowed'} for a in actions]}
        if args[:2]==('s3api','get-bucket-encryption'):
            return {'ServerSideEncryptionConfiguration':{'Rules':[{'ApplyServerSideEncryptionByDefault':{'SSEAlgorithm':'AES256'}}]}}
        if args[:2]==('ecs','register-task-definition'):
            self.counter+=1
            return {'taskDefinition':{'taskDefinitionArn':'registered-'+str(self.counter)}}
        if args[:2]==('ecs','update-service'):
            self.live[args[args.index('--service')+1]]=args[-1]; return {}
        if args[:2]==('cloudfront','create-invalidation'): return {'Invalidation':{'Id':'invalidate'}}
        if args[1]=='wait': return {}
        raise AssertionError(args)


def test_preflight_allows_explicit_reviewed_account_links(env):
    proof=evidence()
    proof['identity']['cognito']['Users'].append({'Attributes':[{'Name':'sub','Value':'s2'}]})
    proof['identity']['manifest']['bindings'][0]['account_link_review']='signed link decision'
    proof['identity']['manifest']['bindings'].append({'subject':'s2','owner_id':'alice','evidence':'same owner verified','account_link_review':'signed link decision'})
    assert len(json.loads(release.validate_preflight(proof,SHA)['IDENTITY_LEGACY_BINDINGS']))==2


def test_empty_raw_mapping_cannot_bypass_existing_owner_inventory(env):
    proof=evidence(); proof['identity']['manifest']['bindings']=[]
    with pytest.raises(ValueError,match='Identity migration evidence'):
        release.validate_preflight(proof,SHA)


@pytest.mark.parametrize('change',[lambda p:p.update(releaseSha='c'*40),lambda p:p['attachments'].update(remainingLegacyRows=1),lambda p:p['attachments'].update(writersDrained=False)])
def test_incomplete_or_wrong_revision_migration_blocks(env,change):
    proof=evidence(); change(proof)
    with pytest.raises(ValueError): release.validate_preflight(proof,SHA)


def test_read_only_plan_pins_all_image_digests_and_validates_existing_runtime(env,monkeypatch):
    aws=AWS(); monkeypatch.setattr(release,'aws',aws)
    planned,originals,images,rollback=release.plan(env,evidence())
    assert set(planned)=={'api','assistant','gateway'}
    assert all(image.endswith('@'+DIGEST) for image in images.values())
    assert originals['assistant']=='durable-assistant'
    assert set(rollback)=={'api','gateway'}
    assert not any(c[1] in {'update-service','register-task-definition','delete-object'} for c in aws.calls)


def test_successful_release_snapshots_entire_site_and_records_revision(env,monkeypatch):
    aws=AWS(); monkeypatch.setattr(release,'aws',aws)
    transfers=[]; monkeypatch.setattr(release,'transfer',lambda *args:transfers.append(args))
    plan=release.plan(env,evidence())
    receipt=release.execute(env,*plan)
    assert receipt['status']=='deployed' and receipt['sha']==SHA
    assert transfers[0][0]=='sync' and transfers[0][1]=='s3://web/'
    assert '/previous/' in transfers[0][2]
    assert transfers[-1][0]=='cp' and transfers[-1][1].endswith('index.html')
    assert Path('release-receipt.json').is_file()


def test_partial_asset_upload_rolls_back_services_and_all_public_files(env,monkeypatch):
    aws=AWS(); monkeypatch.setattr(release,'aws',aws)
    transfers=[]
    def transfer(*args):
        transfers.append(args)
        if args[:2]==('sync','apps/web/dist'):
            raise RuntimeError('partial asset sync failure')
    monkeypatch.setattr(release,'transfer',transfer)
    planned,originals,images,rollback=release.plan(env,evidence())
    with pytest.raises(RuntimeError,match='partial asset'):
        release.execute(env,planned,originals,images,rollback)
    receipt=json.loads(Path('release-receipt.json').read_text())
    assert receipt['status']=='rolled-back'
    assert aws.live==receipt['previous']
    assert any(args[0]=='sync' and '/previous/' in args[1] and args[2]=='s3://web/' for args in transfers)
    assert any(args[:2]==('cloudfront','create-invalidation') for args in aws.calls)


def test_missing_applied_durable_environment_blocks_before_rollout(env,monkeypatch):
    current=task('assistant'); current['containerDefinitions'][0]['environment']=[]
    with pytest.raises(ValueError,match='Apply durable'):
        release.definition(current,'assistant','image')
