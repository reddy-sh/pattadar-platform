import importlib.util
from pathlib import Path

import pytest

spec=importlib.util.spec_from_file_location('sync_claude',Path(__file__).parents[1]/'sync-claude-from-kiro.py')
sync=importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


def write(path,text):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(text)
    return path


def rule(file,kiro,claude):
    return sync.Rule(file,kiro,claude,1)


@pytest.fixture
def root(tmp_path):
    write(tmp_path/'.kiro/steering/pattadar-safety.md','---\ninclusion: always\n---\n\n# Safety\nAsk first.\n')
    write(tmp_path/'.kiro/skills/security-review/SKILL.md','---\nname: security-review\n---\nSee `.kiro/steering/pattadar-safety.md`; show images with create_artifact.\n')
    write(tmp_path/'.kiro/skills/README.md','Use `security-review`, not /security-review.\n')
    write(tmp_path/'.kiro/skill-evals/portfolio.json','{"skills":[{"name":"security-review"}]}\n')
    (tmp_path/'.kiro/skill-evals/shot.png').write_bytes(b'\x89PNG\r\n\x1a\n\xff\x00')
    return tmp_path


RULES=[rule('skills/security-review/SKILL.md','show images with create_artifact.','show images with the Read tool.')]


def test_canonical_kiro_renders_with_every_rule():
    # CI has no .claude, so this proves only that every committed rule still matches .kiro exactly once
    rules=sync.parse_rules(sync.RULES_FILE.read_text(),sync.RULES_FILE.name)
    rendered=sync.render(sync.ROOT,rules)
    assert rules
    assert 'name: pattadar-security-review' in rendered['skills/pattadar-security-review/SKILL.md'].decode()
    assert not any(path.startswith('skills/security-review/') for path in rendered)
    for path,data in rendered.items():
        if path.startswith('rules/'):
            assert not data.startswith(b'---'),path
            assert b'inclusion: always' not in data,path


def test_generic_transforms_rename_and_repoint_only_whole_references():
    text='`security-review`, /security-review, pattadar-security-review, security-reviewer, `.kiro/steering/change-governance.md`, `.kiro/skills/x`'
    assert sync.generic(text)==('`pattadar-security-review`, /security-review, pattadar-security-review, security-reviewer, '
        '`.claude/rules/change-governance.md`, `.kiro/skills/x`')


def test_target_maps_trees_and_renamed_skill():
    assert sync.target('steering/pattadar-safety.md')=='rules/pattadar-safety.md'
    assert sync.target('skills/security-review/references/checklist.md')=='skills/pattadar-security-review/references/checklist.md'
    assert sync.target('skills/README.md')=='skills/README.md'
    assert sync.target('skill-evals/portfolio.json')=='skill-evals/portfolio.json'


def test_render_applies_rules_frontmatter_and_copies_binaries(root):
    rendered=sync.render(root,RULES)
    assert rendered['rules/pattadar-safety.md']==b'# Safety\nAsk first.\n'
    assert rendered['skills/pattadar-security-review/SKILL.md']==(b'---\nname: pattadar-security-review\n---\n'
        b'See `.claude/rules/pattadar-safety.md`; show images with the Read tool.\n')
    assert rendered['skills/README.md']==b'Use `pattadar-security-review`, not /security-review.\n'
    assert rendered['skill-evals/portfolio.json']==b'{"skills":[{"name":"pattadar-security-review"}]}\n'
    assert rendered['skill-evals/shot.png']==b'\x89PNG\r\n\x1a\n\xff\x00'


def test_rule_output_is_written_as_is(root):
    rules=[rule('skills/README.md','Use `security-review`,','Keep `security-review` here,')]
    assert sync.render(root,rules)['skills/README.md']==b'Keep `security-review` here, not /security-review.\n'


@pytest.mark.parametrize('kiro,count',[('not in the file',0),('security-review',2)])
def test_rule_must_match_exactly_once(root,kiro,count):
    with pytest.raises(sync.SyncError,match=f'{count} times'):
        sync.render(root,[rule('skills/README.md',kiro,'x')])


def test_rule_for_missing_file_fails(root):
    with pytest.raises(sync.SyncError,match='missing from .kiro: skills/gone/SKILL.md'):
        sync.render(root,[rule('skills/gone/SKILL.md','a','b')])


def test_overlapping_rules_fail(root):
    rules=[rule('skills/README.md','Use `security-review`','a'),rule('skills/README.md','`security-review`, not','b')]
    with pytest.raises(sync.SyncError,match='overlaps'):
        sync.render(root,rules)


def test_parse_rules_reads_literal_blocks_and_rejects_bad_input():
    text='# comment\n\n@@@ file skills/a/SKILL.md\n@@@ kiro\nline one\n\nline two\n@@@ claude\n@@@ end\n'
    assert sync.parse_rules(text)==[sync.Rule('skills/a/SKILL.md','line one\n\nline two','',3)]
    for bad in ('stray text\n','@@@ file a\n@@@ kiro\nx\n@@@ claude\ny\n','@@@ file a\n@@@ kiro\n@@@ claude\ny\n@@@ end\n',
            '@@@ file a\n@@@ claude\ny\n@@@ end\n'):
        with pytest.raises(sync.SyncError):
            sync.parse_rules(bad)


def test_check_reports_drift_without_writing(root):
    write(root/'.claude/skills/old/SKILL.md','stale\n')
    messages=[]
    assert sync.sync(root,RULES,check=True,say=messages.append)==1
    assert 'delete .claude/skills/old/SKILL.md' in messages
    assert not (root/'.claude/rules').exists()
    assert (root/'.claude/skills/old/SKILL.md').read_text()=='stale\n'


def test_sync_writes_backs_up_prunes_and_leaves_settings(root):
    write(root/'.claude/settings.json','{"enabledPlugins":{}}\n')
    write(root/'.claude/skills/old/SKILL.md','stale\n')
    write(root/'.claude/rules/pattadar-safety.md','outdated\n')
    assert sync.sync(root,RULES,check=False,say=lambda _:None)==0
    assert (root/'.claude/rules/pattadar-safety.md').read_text()=='# Safety\nAsk first.\n'
    assert not (root/'.claude/skills/old').exists()
    assert (root/'.claude/settings.json').read_text()=='{"enabledPlugins":{}}\n'
    [backup]=list((root/'.local/claude-sync-backup').iterdir())
    assert (backup/'skills/old/SKILL.md').read_text()=='stale\n'
    assert (backup/'rules/pattadar-safety.md').read_text()=='outdated\n'
    messages=[]
    assert sync.sync(root,RULES,check=True,say=messages.append)==0
    assert messages==['.claude is in sync with .kiro']
