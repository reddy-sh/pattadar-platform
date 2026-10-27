"""Static guard for the api's private ingress and its proxy secrets.

Invariant 1: the api trusts x-user-id, so its image serves the fail-closed
private_ingress wrapper and each service holds only its own proxy secret.
Each check reads the Terraform block it is about (a small HCL block reader
below; no hcl2 in the venv), not a loose pattern over the files.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODULE = ROOT / 'infra/terraform/modules/runtime'

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


def dynamic(block, kind):
    return block.children(kind) + [d.child('content') for d in block.children('dynamic') if d.labels == (kind,)]


TASKS = declared('resource', 'aws_ecs_task_definition')


def test_reader_skips_braces_in_heredocs_strings_and_comments():
    body = parse('resource "a" "b" {\n  code = <<-EOT\n    }\n  EOT\n  name = "${x} }" # }\n'
                 '  nested {\n    v = {\n      k = "{"\n    }\n  }\n  empty {}\n}\n')
    (block,) = body.blocks
    assert block.labels == ('a', 'b') and block.attrs['name'] == '"${x} }"'
    assert block.child('nested').attrs['v'] == '{\nk = "{"\n}' and block.child('empty')


def test_no_task_shares_the_host_namespaces_or_docker():
    assert set(TASKS) == {'gateway', 'api', 'assistant', 'web'}
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
        'web': {},
    }
