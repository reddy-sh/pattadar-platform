#!/usr/bin/env python3
"""Regenerate the untracked Claude Code copy in `.claude/` from canonical `.kiro/`.

`.kiro/steering` becomes `.claude/rules` (its `inclusion: always` frontmatter dropped;
any other inclusion mode stops the sync, since Claude Code loads every rule), `.kiro/skills`
becomes `.claude/skills` and `.kiro/skill-evals` becomes `.claude/skill-evals`. Two
generic transforms run on every file: `security-review` is renamed
`pattadar-security-review` (Claude Code ships a built-in `/security-review`) and
`.kiro/steering/<name>.md` paths point at `.claude/rules/<name>.md`. Every other
Claude Code difference is an exact replacement rule in `claude-adaptations.txt`
next to this script. A rule must match its `.kiro` file exactly once, so a `.kiro`
edit that moves a rule's text stops the sync instead of silently dropping the
adaptation. Rule output is final: the generic transforms do not touch it.

    python3 scripts/sync-claude-from-kiro.py          # write; backs up what it replaces
    python3 scripts/sync-claude-from-kiro.py --check  # report drift, write nothing
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Callable, NamedTuple

ROOT = Path(__file__).resolve().parents[1]
RULES_FILE = Path(__file__).resolve().with_name("claude-adaptations.txt")
# (.kiro directory, .claude directory)
TREES = (("steering", "rules"), ("skills", "skills"), ("skill-evals", "skill-evals"))
RENAMED_SKILLS = {"security-review": "pattadar-security-review"}
IGNORED_NAMES = {".DS_Store"}
STEERING_FRONTMATTER = "---\ninclusion: always\n---\n"
RENAME_RE = re.compile(r"(?<![\w/-])(" + "|".join(map(re.escape, RENAMED_SKILLS)) + r")(?![\w-])")
STEERING_PATH_RE = re.compile(r"\.kiro/steering/([a-z0-9-]+\.md)")
MARK = "@@@ "


class SyncError(Exception):
    """A rule or tree problem that must be fixed before `.claude` can be generated."""


class Rule(NamedTuple):
    file: str  # path under .kiro, e.g. skills/heuristic-ux-audit/SKILL.md
    kiro: str
    claude: str
    line: int  # where the rule starts in the rules file


def parse_rules(text: str, source: str = "claude-adaptations.txt") -> list[Rule]:
    rules: list[Rule] = []
    file = block = None
    start = 0
    parts: dict[str, list[str]] = {}
    for number, line in enumerate(text.split("\n"), 1):
        if line.startswith(MARK):
            keyword, _, value = line[len(MARK):].partition(" ")
            if keyword == "file" and block is None and file is None and value:
                file, start, parts = value.strip(), number, {}
            elif keyword in ("kiro", "claude") and file is not None and keyword not in parts:
                block = keyword
                parts[block] = []
            elif keyword == "end" and file is not None and set(parts) == {"kiro", "claude"}:
                kiro = "\n".join(parts["kiro"])
                if not kiro:
                    raise SyncError(f"{source}:{start}: empty kiro text")
                rules.append(Rule(file, kiro, "\n".join(parts["claude"]), start))
                file = block = None
            else:
                raise SyncError(f"{source}:{number}: unexpected {line!r}")
        elif block is not None:
            parts[block].append(line)
        elif line.strip() and not line.startswith("#"):
            raise SyncError(f"{source}:{number}: text outside a rule block")
    if file is not None:
        raise SyncError(f"{source}:{start}: rule for {file} has no '@@@ end'")
    return rules


def target(rel: str) -> str:
    """Map a path under .kiro to its path under .claude."""
    top, _, rest = rel.partition("/")
    if top == "skills":
        name, slash, tail = rest.partition("/")
        rest = RENAMED_SKILLS.get(name, name) + slash + tail
    return f"{dict(TREES)[top]}/{rest}"


def generic(text: str) -> str:
    text = RENAME_RE.sub(lambda match: RENAMED_SKILLS[match.group(1)], text)
    return STEERING_PATH_RE.sub(r".claude/rules/\1", text)


def strip_steering_frontmatter(rel: str, text: str) -> str:
    # Claude Code loads every .claude/rules file, so only always-on steering may become a rule.
    if "\r" in text:
        raise SyncError(f".kiro/{rel} has CRLF line endings; save it with LF")
    if not text.startswith(STEERING_FRONTMATTER):
        raise SyncError(f".kiro/{rel} must start with exactly {STEERING_FRONTMATTER!r}; "
                        "other inclusion modes have no Claude Code equivalent here")
    text = text[len(STEERING_FRONTMATTER):]
    return text[1:] if text.startswith("\n") else text


def render_text(rel: str, text: str, rules: list[Rule], source: str) -> str:
    if rel.startswith("steering/"):
        text = strip_steering_frontmatter(rel, text)
    spans = []
    for rule in rules:
        count = text.count(rule.kiro)
        if count != 1:
            raise SyncError(
                f"{source}:{rule.line}: rule text matches .kiro/{rel} {count} times; "
                "update the rule to the current .kiro wording"
            )
        begin = text.index(rule.kiro)
        spans.append((begin, begin + len(rule.kiro), rule))
    out, pos = [], 0
    for begin, end, rule in sorted(spans, key=lambda span: span[0]):
        if begin < pos:
            raise SyncError(f"{source}:{rule.line}: rule overlaps another rule in .kiro/{rel}")
        out += [generic(text[pos:begin]), rule.claude]
        pos = end
    out.append(generic(text[pos:]))
    return "".join(out)


def render(root: Path, rules: list[Rule], source: str = "claude-adaptations.txt") -> dict[str, bytes]:
    """Return {path under .claude: content} for everything generated from .kiro."""
    kiro = root / ".kiro"
    by_file: dict[str, list[Rule]] = {}
    for rule in rules:
        by_file.setdefault(rule.file, []).append(rule)
    rendered: dict[str, bytes] = {}
    for kiro_dir, _ in TREES:
        base = kiro / kiro_dir
        if not base.is_dir():
            raise SyncError(f".kiro/{kiro_dir} is missing")
        for path in sorted(p for p in base.rglob("*") if p.is_file() and p.name not in IGNORED_NAMES):
            rel = path.relative_to(kiro).as_posix()
            destination = target(rel)
            if destination in rendered:
                raise SyncError(f".kiro/{rel} and another .kiro file both map to .claude/{destination}")
            data = path.read_bytes()
            file_rules = by_file.pop(rel, [])
            try:
                text = data.decode("utf-8")
            except UnicodeDecodeError:
                if rel.startswith("steering/"):
                    raise SyncError(f".kiro/{rel} is not UTF-8 text; steering must be") from None
                if file_rules:
                    raise SyncError(f"{source}: rules name binary file .kiro/{rel}") from None
                rendered[destination] = data
                continue
            rendered[destination] = render_text(rel, text, file_rules, source).encode("utf-8")
    if by_file:
        raise SyncError(f"{source}: rules name files missing from .kiro: {', '.join(sorted(by_file))}")
    return rendered


def current(root: Path) -> dict[str, bytes]:
    claude = root / ".claude"
    files: dict[str, bytes] = {}
    for _, claude_dir in TREES:
        base = claude / claude_dir
        if base.is_dir():
            for path in base.rglob("*"):
                if path.is_file() and path.name not in IGNORED_NAMES:
                    files[path.relative_to(claude).as_posix()] = path.read_bytes()
    return files


def sync(root: Path, rules: list[Rule], check: bool, say: Callable[[str], None] = print) -> int:
    rendered, existing = render(root, rules), current(root)
    changed = sorted(rel for rel, data in rendered.items() if existing.get(rel) != data)
    stale = sorted(set(existing) - set(rendered))
    if not changed and not stale:
        say(".claude is in sync with .kiro")
        return 0
    for rel in changed:
        say(f"{'update' if rel in existing else 'create'} .claude/{rel}")
    for rel in stale:
        say(f"delete .claude/{rel}")
    if check:
        say(f"drift: {len(changed)} to write, {len(stale)} to delete; "
            "run python3 scripts/sync-claude-from-kiro.py")
        return 1
    claude = root / ".claude"
    # Fail before touching anything when a kept file sits where a generated path needs to go.
    stale_paths = {claude / rel for rel in stale}
    for rel in changed:
        destination = claude / rel
        kept_inside = destination.is_dir() and any(
            p.is_file() and p not in stale_paths and p.name not in IGNORED_NAMES for p in destination.rglob("*"))
        kept_parent = any(p.is_file() and p not in stale_paths for p in destination.parents if claude in p.parents)
        if kept_inside or kept_parent:
            raise SyncError(f"cannot write .claude/{rel}: another file is in the way; move it and rerun")
    if existing:
        # .claude is untracked, so git cannot restore what this replaces.
        backup = root / ".local" / "claude-sync-backup" / datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        for _, claude_dir in TREES:
            if (claude / claude_dir).is_dir():
                shutil.copytree(claude / claude_dir, backup / claude_dir)
        say(f"backed up the previous copy to {backup.relative_to(root)}")
    for rel in stale:
        (claude / rel).unlink()
    for _, claude_dir in TREES:
        for directory in sorted((claude / claude_dir).rglob("*"), key=lambda p: len(p.parts), reverse=True):
            if directory.is_dir() and all(p.name in IGNORED_NAMES for p in directory.iterdir()):
                for ignored in directory.iterdir():
                    ignored.unlink()
                directory.rmdir()
    for rel in changed:
        destination = claude / rel
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(rendered[rel])
    say(f"wrote {len(changed)} file(s), deleted {len(stale)}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Regenerate .claude/{rules,skills,skill-evals} from canonical .kiro.")
    parser.add_argument("--check", action="store_true", help="report drift and exit 1 instead of writing")
    args = parser.parse_args(argv)
    try:
        rules = parse_rules(RULES_FILE.read_text(encoding="utf-8"), RULES_FILE.name)
        return sync(ROOT, rules, args.check)
    except (SyncError, OSError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
