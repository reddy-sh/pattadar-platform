import copy
from datetime import datetime, timedelta, timezone
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
    args=types.SimpleNamespace(cluster='cluster',repositories=repos,sha=SHA,web_origin='spa',spa_bucket='web',distribution='cdn',templates=None)
    monkeypatch.setattr(release.subprocess,'run',lambda cmd,**kw: types.SimpleNamespace(stdout=SHA if cmd[:2]==['git','rev-parse'] else ''))
    # A fixed midday clock keeps the 06:00 UTC cron hold out of unrelated tests.
    monkeypatch.setattr(release,'utcnow',lambda: datetime(2026,10,26,12,0,tzinfo=timezone.utc))
    monkeypatch.setattr(release,'sleep',lambda seconds: None)
    return args


FARGATE=('awsvpc',['FARGATE'])
EC2=('bridge',['EC2'])
PROXY={'api':{'INTERNAL_PROXY_SECRET':'api'},'assistant':{'INTERNAL_PROXY_SECRET':'assistant'},'gateway':{'INTERNAL_PROXY_SECRET_API':'api','INTERNAL_PROXY_SECRET_ASSISTANT':'assistant'}}
SSM='arn:aws:ssm:ap-south-1:ACCOUNT:parameter/pattadar/prod/'
HOST_PORT={'gateway':8080,'api':8081,'assistant':8082}


def task(service,shape=FARGATE):
    env=[{'name':'APP_PUBLIC_URL','value':'https://pattadar.com'},{'name':'CRON_SECRET','value':'ref'}, {'name':'ASSISTANT_ATTACHMENTS_BUCKET','value':'docs'},{'name':'UVICORN_TIMEOUT_KEEP_ALIVE','value':'65'}]
    secrets=[{'name':name,'valueFrom':SSM+'internal-proxy-secret-'+target} for name,target in PROXY[service].items()]
    return {'family':service,'taskDefinitionArn':'old-'+service,'status':'ACTIVE','taskRoleArn':'role','networkMode':shape[0],'requiresCompatibilities':shape[1],
        'containerDefinitions':[{'name':service,'image':'registry/'+service+'@'+DIGEST,'environment':env,'secrets':secrets,
            'portMappings':[{'containerPort':8080,'hostPort':HOST_PORT[service],'protocol':'tcp'}],'healthCheck':{'command':['CMD-SHELL','true']}}]}


class AWS:
    def __init__(self,rollback_shape=FARGATE,edit=lambda service,definition: None,template_edit=lambda service,definition: None,rollback_edit=lambda definition: None):
        self.live={s:'old-'+s for s in ['api','assistant','gateway']}; self.calls=[]; self.counter=0
        self.rollback_shape=rollback_shape; self.edit=edit; self.template_edit=template_edit; self.rollback_edit=rollback_edit
        self.task_arns=lambda service: ['task-'+service]
        self.task_failures=lambda service: []
        self.task_state=lambda service: [{'taskDefinitionArn':self.live[service],'healthStatus':'HEALTHY'}]
    def __call__(self,*args):
        self.calls.append(args)
        if args[:2]==('ecs','describe-services'):
            service=args[args.index('--services')+1]
            return {'services':[{'status':'ACTIVE','taskDefinition':self.live[service],'runningCount':1,'pendingCount':0}]}
        if args[:2]==('ecs','describe-task-definition'):
            arn=args[-1]
            if arn.startswith('template-'):
                # Terraform's revision: the EC2/bridge shape and the bootstrap tag.
                definition=task(arn.replace('template-',''),EC2)
                definition['containerDefinitions'][0]['image']='registry/bootstrap:v1'
                self.template_edit(arn.replace('template-',''),definition)
            elif arn=='durable-assistant':
                definition=task('assistant',self.rollback_shape); self.rollback_edit(definition)
            else:
                definition=task(arn.replace('old-','')); self.edit(arn.replace('old-',''),definition)
            definition['taskDefinitionArn']=arn
            return {'taskDefinition':definition}
        if args[:2]==('ecs','list-tasks'):
            return {'taskArns':self.task_arns(args[args.index('--service-name')+1])}
        if args[:2]==('ecs','describe-tasks'):
            service=args[args.index('--tasks')+1].replace('task-','')
            return {'tasks':self.task_state(service),'failures':self.task_failures(service)}
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


def templates(env,mapping):
    path=Path('templates.json'); path.write_text(json.dumps(mapping)); env.templates=path


def test_terraform_templates_are_only_the_base_of_the_next_revision(env,monkeypatch):
    aws=AWS(rollback_shape=EC2); monkeypatch.setattr(release,'aws',aws)
    templates(env,{s:'template-'+s for s in ['api','assistant','gateway']})
    proof=evidence()
    # The template carries the bootstrap tag, so the writer check must read the running image.
    proof['attachments'].update(mode='durable_verified',writerEvidence={'image':'registry/assistant@'+DIGEST})
    planned,originals,images,rollback=release.plan(env,proof)
    assert all(body['networkMode']=='bridge' and body['requiresCompatibilities']==['EC2'] for body in planned.values())
    assert all(planned[s]['containerDefinitions'][0]['image']==images[s] for s in planned)
    assert originals=={'api':'old-api','assistant':'durable-assistant','gateway':'old-gateway'}
    assert all(body['networkMode']=='awsvpc' for body in rollback.values())


def test_a_template_map_missing_a_service_blocks(env,monkeypatch):
    monkeypatch.setattr(release,'aws',AWS(rollback_shape=EC2))
    templates(env,{'api':'template-api','assistant':'template-assistant'})
    with pytest.raises(ValueError,match='template revision for gateway'):
        release.plan(env,evidence())


@pytest.mark.parametrize('shape',[FARGATE,('awsvpc',['EC2']),('bridge',['FARGATE'])])
def test_a_fargate_rollback_against_an_ec2_plan_blocks_before_any_mutation(env,monkeypatch,shape):
    aws=AWS(rollback_shape=shape); monkeypatch.setattr(release,'aws',aws)
    templates(env,{s:'template-'+s for s in ['api','assistant','gateway']})
    with pytest.raises(ValueError,match='launch shape'):
        release.plan(env,evidence())
    assert not any(c[1] in {'update-service','register-task-definition'} for c in aws.calls)


@pytest.mark.parametrize('failure',['unhealthy','stale task'])
def test_a_container_that_never_reports_healthy_rolls_back(env,monkeypatch,failure):
    aws=AWS(); monkeypatch.setattr(release,'aws',aws)
    monkeypatch.setattr(release,'transfer',lambda *args: None)
    planned,originals,images,rollback=release.plan(env,evidence())
    bad='registered-'+str(len(rollback)+1)  # rollback revisions register first, then the api
    def state(service):
        arn=aws.live[service]
        if arn!=bad: return [{'taskDefinitionArn':arn,'healthStatus':'HEALTHY'}]
        if failure=='unhealthy': return [{'taskDefinitionArn':arn,'healthStatus':'UNHEALTHY'}]
        return [{'taskDefinitionArn':arn,'healthStatus':'HEALTHY'},{'taskDefinitionArn':'old-api','healthStatus':'HEALTHY'}]
    aws.task_state=state
    with pytest.raises(RuntimeError,match='HEALTHY'):
        release.execute(env,planned,originals,images,rollback)
    receipt=json.loads(Path('release-receipt.json').read_text())
    assert receipt['status']=='rolled-back' and receipt['next']=={'api':bad}
    assert aws.live['api']==originals['api'] and aws.live['assistant']=='old-assistant'
    assert sum(1 for c in aws.calls if c[1]=='describe-tasks')==release.HEALTH_ATTEMPTS+1


def test_rollout_waits_out_the_daily_cron_window_before_restarting_a_service(env,monkeypatch):
    aws=AWS(); monkeypatch.setattr(release,'aws',aws)
    monkeypatch.setattr(release,'transfer',lambda *args: None)
    clock=[datetime(2026,10,26,5,55,30,tzinfo=timezone.utc)]; slept=[]
    def sleep(seconds):
        slept.append((seconds,len(aws.calls))); clock[0]+=timedelta(seconds=seconds)
    monkeypatch.setattr(release,'utcnow',lambda: clock[0]); monkeypatch.setattr(release,'sleep',sleep)
    receipt=release.execute(env,*release.plan(env,evidence()))
    assert receipt['status']=='deployed'
    first_update=next(i for i,c in enumerate(aws.calls) if c[1]=='update-service')
    assert slept==[(870,first_update)]


def test_only_the_api_waits_for_the_cron_window(env,monkeypatch):
    # The cron reaches only the api; the gateway and assistant restart freely.
    aws=AWS(); monkeypatch.setattr(release,'aws',aws)
    monkeypatch.setattr(release,'transfer',lambda *args: None)
    clock=[datetime(2026,10,26,5,49,0,tzinfo=timezone.utc)]; slept=[]
    def call(*args):
        if args[:2]==('ecs','update-service'): clock[0]+=timedelta(minutes=2)
        return aws(*args)
    monkeypatch.setattr(release,'aws',call)
    monkeypatch.setattr(release,'utcnow',lambda: clock[0]); monkeypatch.setattr(release,'sleep',lambda seconds: slept.append(seconds))
    receipt=release.execute(env,*release.plan(env,evidence()))
    assert receipt['status']=='deployed' and slept==[]
    assert [c[c.index('--service')+1] for c in aws.calls if c[1]=='update-service']==['api','assistant','gateway']


@pytest.mark.parametrize('case',['no tasks','describe failures'])
def test_the_health_gate_never_passes_on_missing_evidence(env,monkeypatch,case):
    aws=AWS(); monkeypatch.setattr(release,'aws',aws)
    monkeypatch.setattr(release,'transfer',lambda *args: None)
    planned,originals,images,rollback=release.plan(env,evidence())
    bad='registered-'+str(len(rollback)+1)
    if case=='no tasks':
        aws.task_arns=lambda service: [] if aws.live[service]==bad else ['task-'+service]
    else:
        aws.task_failures=lambda service: [{'reason':'MISSING'}] if aws.live[service]==bad else []
    with pytest.raises(RuntimeError,match='HEALTHY'):
        release.execute(env,planned,originals,images,rollback)
    assert json.loads(Path('release-receipt.json').read_text())['status']=='rolled-back'
    assert aws.live['api']==originals['api']


def drop(service,name):
    def edit(target,definition):
        if target==service:
            container=definition['containerDefinitions'][0]
            container['secrets']=[s for s in container['secrets'] if s['name']!=name]
    return edit


def container(service,**fields):
    def edit(target,definition):
        if target==service:
            definition['containerDefinitions'][0].update(fields)
    return edit


def task_field(service,**fields):
    def edit(target,definition):
        if target==service:
            definition.update(fields)
    return edit


def add_env(service,name,value='1',where='environment'):
    def edit(target,definition):
        if target==service:
            entry={'name':name,'value':value} if where=='environment' else {'name':name,'valueFrom':SSM+'x'}
            definition['containerDefinitions'][0].setdefault(where,[]).append(entry)
    return edit


def sidecar(service):
    def edit(target,definition):
        if target==service:
            definition['containerDefinitions'].append({'name':'sidecar','image':'x','environment':[{'name':'ALLOW_INSECURE_LOCAL','value':'1'}]})
    return edit


def rewire(service,name,parameter):
    def edit(target,definition):
        if target==service:
            for secret in definition['containerDefinitions'][0]['secrets']:
                if secret['name']==name: secret['valueFrom']=SSM+parameter
    return edit


def plaintext(service,name):
    def edit(target,definition):
        if target==service:
            drop(service,name)(target,definition)
            add_env(service,name,'synthetic')(target,definition)
    return edit


@pytest.mark.parametrize('edit,message',[
    (drop('api','INTERNAL_PROXY_SECRET'),'proxy secrets for api'),
    (drop('assistant','INTERNAL_PROXY_SECRET'),'proxy secrets for assistant'),
    (drop('gateway','INTERNAL_PROXY_SECRET_API'),'proxy secrets for gateway'),
    (drop('gateway','INTERNAL_PROXY_SECRET_ASSISTANT'),'proxy secrets for gateway'),
    (plaintext('gateway','INTERNAL_PROXY_SECRET_API'),'proxy secrets for gateway'),
    (plaintext('api','INTERNAL_PROXY_SECRET'),'proxy secrets for api'),
    (rewire('assistant','INTERNAL_PROXY_SECRET','internal-proxy-secret-api'),'proxy secrets for assistant'),
    (rewire('gateway','INTERNAL_PROXY_SECRET_ASSISTANT','internal-proxy-secret-api'),'proxy secrets for gateway'),
    (add_env('api','ALLOW_INSECURE_LOCAL'),'ALLOW_INSECURE_LOCAL'),
    (add_env('assistant','ALLOW_INSECURE_LOCAL'),'ALLOW_INSECURE_LOCAL'),
    (add_env('gateway','ALLOW_INSECURE_LOCAL'),'ALLOW_INSECURE_LOCAL'),
    (add_env('api','ALLOW_INSECURE_LOCAL',where='secrets'),'ALLOW_INSECURE_LOCAL'),
    (sidecar('assistant'),'ALLOW_INSECURE_LOCAL'),
    (add_env('gateway','LOCAL_AUTH_KEY_FILE','/keys/local.pem'),'LOCAL_AUTH_KEY_FILE'),
    (container('api',command=['uvicorn','src.main:app']),'image command'),
    (container('api',entryPoint=['sh','-c']),'image command'),
    (container('assistant',privileged=True),'privileged'),
    (task_field('gateway',networkMode='host'),'host network'),
    (task_field('api',pidMode='host'),'host network'),
    (task_field('assistant',volumes=[{'name':'docker','host':{'sourcePath':'/var/run/docker.sock'}}]),'host path'),
    (add_env('api','UVICORN_WORKERS','2 --reload'),'plain numbers'),
    (add_env('gateway','UVICORN_TIMEOUT_KEEP_ALIVE','65 --proxy-headers'),'plain numbers')])
def test_release_refuses_a_revision_that_could_open_the_host(env,monkeypatch,edit,message):
    aws=AWS(edit=edit); monkeypatch.setattr(release,'aws',aws)
    with pytest.raises(ValueError,match=message):
        release.plan(env,evidence())
    assert not any(c[1] in {'update-service','register-task-definition'} for c in aws.calls)


def test_the_gates_also_apply_to_the_terraform_template(env,monkeypatch):
    aws=AWS(rollback_shape=EC2,template_edit=drop('api','INTERNAL_PROXY_SECRET')); monkeypatch.setattr(release,'aws',aws)
    templates(env,{s:'template-'+s for s in ['api','assistant','gateway']})
    with pytest.raises(ValueError,match='proxy secrets for api'):
        release.plan(env,evidence())


@pytest.mark.parametrize('edit,message',[
    (lambda d: d['containerDefinitions'][0].update(secrets=[]),'proxy secrets for assistant'),
    (lambda d: d['containerDefinitions'][0]['environment'].append({'name':'ALLOW_INSECURE_LOCAL','value':'1'}),'ALLOW_INSECURE_LOCAL'),
    (lambda d: d['containerDefinitions'][0]['portMappings'][0].update(hostPort=8080),'different ports'),
    (lambda d: d['containerDefinitions'][0].pop('healthCheck'),'no health check')])
def test_the_assistant_rollback_is_gated_like_the_release(env,monkeypatch,edit,message):
    aws=AWS(rollback_edit=edit); monkeypatch.setattr(release,'aws',aws)
    with pytest.raises(ValueError,match=message):
        release.plan(env,evidence())
    assert not any(c[1] in {'update-service','register-task-definition'} for c in aws.calls)
