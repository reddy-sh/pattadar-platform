"""Static guard for the api edge (Design A, Reddy 26/10/2026).

Invariant 1: the api trusts x-user-id, so its only internet path is the api
distribution's exact /cron/inactivity-check behaviour. Each check reads the
Terraform block it is about (a small HCL block reader below; no hcl2 in the
venv), not a loose pattern over the files.
"""
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MODULE = ROOT / 'infra/terraform/modules/runtime'
CRON_PATH = '/cron/inactivity-check'

HEADER = re.compile(r'^([A-Za-z_][\w-]*)((?:\s+"[^"]*")*)\s*\{\s*(\})?$')
ATTR = re.compile(r'^([A-Za-z_][\w-]*)\s*=\s*(.*)$')
HEREDOC = re.compile(r'<<-?([A-Za-z_]\w*)$')


class Block:
    def __init__(self, kind, labels):
        self.kind, self.labels, self.attrs, self.blocks = kind, labels, {}, []

    def children(self, kind):
        return [b for b in self.blocks if b.kind == kind]

    def child(self, kind):
        found = self.children(kind)
        assert len(found) == 1, f'{self.kind} {self.labels}: {len(found)} {kind} blocks'
        return found[0]


def code(line):
    """The line without a trailing comment, and its bracket balance outside strings."""
    stack, depth, i = [], 0, 0  # 'str' or '{' (an interpolation)
    while i < len(line):
        c, top = line[i], stack[-1] if stack else None
        if top == 'str':
            if c == '\\':
                i += 1
            elif line.startswith('${', i):
                stack.append('{')
                i += 1
            elif c == '"':
                stack.pop()
        elif c == '"':
            stack.append('str')
        elif top == '{':
            if c == '{':
                stack.append('{')
            elif c == '}':
                stack.pop()
        elif c == '#' or line.startswith('//', i):
            return line[:i].rstrip(), depth
        elif c in '([{':
            depth += 1
        elif c in ')]}':
            depth -= 1
        i += 1
    return line.rstrip(), depth


def parse(text):
    """Blocks and attributes of terraform-fmt'd HCL; attribute values stay raw text."""
    root = Block('file', ())
    stack, lines = [root], iter(text.splitlines())
    for raw in lines:
        line, depth = code(raw.strip())
        if not line:
            continue
        if line == '}':
            assert len(stack) > 1, 'unbalanced }'
            stack.pop()
            continue
        header = HEADER.match(line)
        if header:
            block = Block(header.group(1), tuple(re.findall(r'"([^"]*)"', header.group(2))))
            stack[-1].blocks.append(block)
            if not header.group(3):
                stack.append(block)
            continue
        attr = ATTR.match(line)
        assert attr, f'unparsed line: {raw!r}'
        parts, heredoc = [attr.group(2)], HEREDOC.search(line)
        while depth > 0 or heredoc:
            if heredoc:
                for raw in lines:
                    parts.append(raw)
                    if raw.strip() == heredoc.group(1):
                        break
                heredoc = None
                continue
            more, delta = code(next(lines).strip())
            parts.append(more)
            depth += delta
            heredoc = HEREDOC.search(more)
        stack[-1].attrs[attr.group(1)] = '\n'.join(parts)
    assert len(stack) == 1, 'unclosed block'
    return root


BLOCKS = [b for path in sorted(MODULE.glob('*.tf')) for b in parse(path.read_text()).blocks]


def declared(kind, of_type):
    return {b.labels[1]: b for b in BLOCKS if b.kind == kind and b.labels[0] == of_type}


def literal(expr):
    found = re.fullmatch(r'"([^"]*)"', expr.strip())
    return found and found.group(1)


def literals(expr):
    return set(re.findall(r'"([^"]*)"', expr))


def dynamic(block, kind):
    return block.children(kind) + [d.child('content') for d in block.children('dynamic') if d.labels == (kind,)]


def origins(dist):
    """origin_id -> the aws_cloudfront_vpc_origin it uses (None for S3 origins)."""
    found = {}
    for origin in dynamic(dist, 'origin'):
        vpc = origin.children('vpc_origin_config')
        if vpc:
            ref = re.fullmatch(r'aws_cloudfront_vpc_origin\.(\w+)\.id', vpc[0].attrs['vpc_origin_id'])
            assert ref, origin.attrs['origin_id']
            # One attempt: CloudFront never re-sends a paid reading (invariant 3).
            assert origin.attrs.get('connection_attempts') == '1', origin.attrs['origin_id']
        found[literal(origin.attrs['origin_id'])] = ref.group(1) if vpc else None
    return found


def targets(behaviour):
    """Every origin id the target expression can name (both arms of a conditional)."""
    return literals(behaviour.attrs['target_origin_id'])


DISTS = declared('resource', 'aws_cloudfront_distribution')
VPC_ORIGINS = declared('resource', 'aws_cloudfront_vpc_origin')
TASKS = declared('resource', 'aws_ecs_task_definition')


def test_reader_skips_braces_in_heredocs_strings_and_comments():
    body = parse('resource "a" "b" {\n  code = <<-EOT\n    }\n  EOT\n  name = "${x} }" # }\n'
                 '  nested {\n    v = {\n      k = "{"\n    }\n  }\n  empty {}\n}\n')
    (block,) = body.blocks
    assert block.labels == ('a', 'b') and block.attrs['name'] == '"${x} }"'
    assert block.child('nested').attrs['v'] == '{\nk = "{"\n}' and block.child('empty')


def test_module_has_both_distributions_and_vpc_origins():
    assert set(DISTS) == {'web', 'api'}
    assert set(VPC_ORIGINS) == {'gateway', 'api_cron'}


def test_only_the_exact_cron_behaviour_reaches_the_api():
    hits = []
    for name, dist in DISTS.items():
        cron = {oid for oid, vpc in origins(dist).items() if vpc == 'api_cron'}
        assert not targets(dist.child('default_cache_behavior')) & cron, name
        hits += [(name, b) for b in dynamic(dist, 'ordered_cache_behavior') if targets(b) & cron]
    assert [name for name, _ in hits] == ['api']
    behaviour = hits[0][1]
    assert literal(behaviour.attrs['path_pattern']) == CRON_PATH
    assert targets(behaviour) == {'api_cron'}

    # private_ingress exempts this path from the proxy secret, so only the cron
    # header (and content-type) may reach the api, and only on POST.
    assert behaviour.attrs['origin_request_policy_id'] == 'aws_cloudfront_origin_request_policy.cron.id'
    policy = declared('resource', 'aws_cloudfront_origin_request_policy')['cron']
    assert literal(policy.child('cookies_config').attrs['cookie_behavior']) == 'none'
    assert literal(policy.child('query_strings_config').attrs['query_string_behavior']) == 'none'
    headers = policy.child('headers_config')
    assert literal(headers.attrs['header_behavior']) == 'whitelist'
    assert literals(headers.child('headers').attrs['items']) == {'x-cron-secret', 'content-type'}
    function = behaviour.child('function_association')
    assert literal(function.attrs['event_type']) == 'viewer-request'
    assert function.attrs['function_arn'] == 'aws_cloudfront_function.cron_post_only.arn'
    assert "method !== 'POST'" in declared('resource', 'aws_cloudfront_function')['cron_post_only'].attrs['code']


def test_api_distribution_serves_nothing_but_the_two_routes():
    api = DISTS['api']
    assert sorted(literal(b.attrs['path_pattern']) for b in dynamic(api, 'ordered_cache_behavior')) == ['/api/*', CRON_PATH]
    function = api.child('default_cache_behavior').child('function_association')
    assert literal(function.attrs['event_type']) == 'viewer-request'
    assert function.attrs['function_arn'] == 'aws_cloudfront_function.api_not_found.arn'
    code_404 = declared('resource', 'aws_cloudfront_function')['api_not_found'].attrs['code']
    assert 'statusCode: 404' in code_404 and 'event.request' not in code_404


@pytest.mark.parametrize('name', ['web', 'api'])
def test_api_paths_reach_only_the_gateway(name):
    dist = DISTS[name]
    gateway = {oid for oid, vpc in origins(dist).items() if vpc == 'gateway'}
    (behaviour,) = [b for b in dynamic(dist, 'ordered_cache_behavior') if literal(b.attrs['path_pattern']) == '/api/*']
    assert gateway and targets(behaviour) <= gateway


def host_ports(service):
    return [int(p) for p in re.findall(r'hostPort\s*=\s*(\d+)', TASKS[service].attrs['container_definitions'])]


def test_vpc_origins_match_the_host_ports():
    ports = {}
    for name, origin in VPC_ORIGINS.items():
        endpoint = origin.child('vpc_origin_endpoint_config')
        assert endpoint.attrs['arn'] == 'aws_instance.host.arn'
        assert literal(endpoint.attrs['origin_protocol_policy']) == 'http-only'
        lifecycle = origin.child('lifecycle')
        assert lifecycle.attrs['create_before_destroy'] == 'true'
        assert 'aws_instance.host' in lifecycle.attrs['replace_triggered_by']
        ports[name] = int(endpoint.attrs['http_port'])
    assert host_ports('gateway') == [ports['gateway']]
    assert host_ports('api') == [ports['api_cron']]


def test_host_admits_only_cloudfront_vpc_origins():
    host = declared('resource', 'aws_security_group')['host']
    assert not host.children('ingress') and 'ingress' not in host.attrs
    ingress = [b for b in BLOCKS if b.kind == 'resource' and b.attrs.get('security_group_id') == 'aws_security_group.host.id'
               and (b.labels[0] == 'aws_vpc_security_group_ingress_rule'
                    or b.labels[0] == 'aws_security_group_rule' and literal(b.attrs.get('type', '')) == 'ingress')]
    assert [b.labels for b in ingress] == [('aws_vpc_security_group_ingress_rule', 'host_from_cloudfront')]
    rule = ingress[0]
    assert not {'cidr_ipv4', 'cidr_ipv6', 'prefix_list_id', 'cidr_blocks', 'ipv6_cidr_blocks', 'prefix_list_ids'} & set(rule.attrs)
    assert rule.attrs['referenced_security_group_id'] == 'data.aws_security_group.cloudfront_vpc_origins.id'
    low, high = int(rule.attrs['from_port']), int(rule.attrs['to_port'])
    assert (low, high) == (8080, 8081) and not low <= 22 <= high
    assert not any(low <= port <= high for port in host_ports('assistant'))
    # Destroy order: the rule goes before the origins, or the managed group
    # cannot be deleted and the VPC destroy wedges.
    assert set(re.findall(r'aws_cloudfront_vpc_origin\.\w+', rule.attrs['depends_on'])) == {
        'aws_cloudfront_vpc_origin.gateway', 'aws_cloudfront_vpc_origin.api_cron'}
    group = declared('data', 'aws_security_group')['cloudfront_vpc_origins']
    assert literal(group.attrs['name']) == 'CloudFront-VPCOrigins-Service-SG'


def test_no_task_shares_the_host_namespaces_or_docker():
    assert set(TASKS) == {'gateway', 'api', 'assistant'}
    for name, task in TASKS.items():
        for mode in ('network_mode', 'pid_mode', 'ipc_mode'):
            assert literal(task.attrs.get(mode, '""')) != 'host', (name, mode)
        assert not re.search(r'privileged\s*=\s*true|docker\.sock', task.attrs['container_definitions']), name
        for volume in dynamic(task, 'volume'):
            assert 'docker.sock' not in volume.attrs.get('host_path', ''), name


def test_api_image_serves_the_private_ingress_wrapper():
    lines = (ROOT / 'services/api/Dockerfile').read_text().splitlines()
    commands = [line for line in lines if line.startswith('CMD')]
    assert commands and not [line for line in lines if line.startswith('ENTRYPOINT')]
    assert 'uvicorn src.private_ingress:app ' in commands[-1] and 'src.main:app' not in commands[-1]


def test_no_container_overrides_the_image_command():
    # The api's fail-closed wrapper exists only in its Dockerfile CMD; a task
    # command or entryPoint would serve src.main:app unguarded.
    for name, task in TASKS.items():
        assert not re.search(r'\b(command|entryPoint)\s*=', task.attrs['container_definitions']), name


def test_each_service_holds_only_its_own_proxy_secret():
    # ARCH-01(1): the assistant parses untrusted attachments, so it must never
    # hold the api's secret; each name comes from SSM, never plain env.
    wired = {}
    for name, task in TASKS.items():
        definitions = task.attrs['container_definitions']
        wired[name] = dict(re.findall(r'name\s*=\s*"(INTERNAL_PROXY_SECRET\w*)",\s*valueFrom\s*=\s*local\.ssm_arns\["([\w-]+)"\]', definitions))
        assert len(re.findall(r'"INTERNAL_PROXY_SECRET\w*"', definitions)) == len(wired[name]), name
    assert wired == {
        'gateway': {'INTERNAL_PROXY_SECRET_API': 'internal-proxy-secret-api',
                    'INTERNAL_PROXY_SECRET_ASSISTANT': 'internal-proxy-secret-assistant'},
        'api': {'INTERNAL_PROXY_SECRET': 'internal-proxy-secret-api'},
        'assistant': {'INTERNAL_PROXY_SECRET': 'internal-proxy-secret-assistant'},
    }
