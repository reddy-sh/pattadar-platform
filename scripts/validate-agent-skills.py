#!/usr/bin/env python3
"""Validate repo-local Agent Skills without third-party dependencies.

This checks the structural rules adopted from https://agentskills.io/specification.
It is intentionally not a full YAML parser or a replacement for skills-ref.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = ROOT / ".kiro" / "skills"
NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
TOP_LEVEL = {
    "name",
    "description",
    "license",
    "compatibility",
    "metadata",
    "allowed-tools",
}
REFERENCE_RE = re.compile(r"(?<![A-Za-z0-9_./-])(references/[A-Za-z0-9][A-Za-z0-9._/-]*\.md)")


def unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


def parse_frontmatter(path: Path) -> tuple[dict[str, str], int, list[dict[str, str]]]:
    lines = path.read_text(encoding="utf-8").splitlines()
    issues: list[dict[str, str]] = []
    if not lines or lines[0] != "---":
        issues.append(issue("error", path, "SKILL.md must start with YAML frontmatter"))
        return {}, 0, issues

    try:
        end = lines.index("---", 1)
    except ValueError:
        issues.append(issue("error", path, "frontmatter is missing its closing ---"))
        return {}, 0, issues

    fields: dict[str, str] = {}
    i = 1
    while i < end:
        line = lines[i]
        if not line.strip() or line.startswith((" ", "\t")):
            i += 1
            continue
        if ":" not in line:
            issues.append(issue("error", path, f"invalid top-level frontmatter line {i + 1}"))
            i += 1
            continue
        key, raw = line.split(":", 1)
        key = key.strip()
        raw = raw.strip()
        if key in fields:
            issues.append(issue("error", path, f"duplicate frontmatter key: {key}"))
        if raw in {"|", "|-", ">", ">-"}:
            block: list[str] = []
            i += 1
            while i < end and (not lines[i].strip() or lines[i].startswith((" ", "\t"))):
                block.append(lines[i].strip())
                i += 1
            fields[key] = " ".join(part for part in block if part)
            continue
        fields[key] = unquote(raw)
        i += 1

    body_start = end + 1
    if not any(line.strip() for line in lines[body_start:]):
        issues.append(issue("error", path, "Markdown instruction body is empty"))
    return fields, body_start, issues


def issue(severity: str, path: Path, message: str) -> dict[str, str]:
    try:
        shown = str(path.relative_to(ROOT))
    except ValueError:
        shown = str(path)
    return {"severity": severity, "path": shown, "message": message}


def validate_skill(skill_dir: Path) -> list[dict[str, str]]:
    problems: list[dict[str, str]] = []
    path = skill_dir / "SKILL.md"
    name = skill_dir.name

    if not path.is_file():
        return [issue("error", skill_dir, "skill directory is missing SKILL.md")]
    if len(name) > 64 or not NAME_RE.fullmatch(name):
        problems.append(issue("error", path, "directory name must be <=64 chars, lowercase alphanumeric/hyphens, with no leading/trailing/consecutive hyphen"))

    fields, body_start, parsed = parse_frontmatter(path)
    problems.extend(parsed)
    for key in fields:
        if key not in TOP_LEVEL:
            problems.append(issue("error", path, f"unsupported top-level frontmatter key: {key}"))

    declared_name = fields.get("name", "")
    description = fields.get("description", "")
    compatibility = fields.get("compatibility", "")
    if declared_name != name:
        problems.append(issue("error", path, f"frontmatter name {declared_name!r} must match directory {name!r}"))
    if not description:
        problems.append(issue("error", path, "description is required and must be non-empty"))
    elif len(description) > 1024:
        problems.append(issue("error", path, "description exceeds 1024 characters"))
    elif not description.startswith("Use this skill"):
        problems.append(issue("warning", path, "description should use imperative trigger phrasing: 'Use this skill when…'"))
    if compatibility and len(compatibility) > 500:
        problems.append(issue("error", path, "compatibility exceeds 500 characters"))

    lines = path.read_text(encoding="utf-8").splitlines()
    if len(lines) - body_start > 500:
        problems.append(issue("warning", path, "instruction body exceeds the recommended 500 lines"))

    body = "\n".join(lines[body_start:])
    for relative in sorted(set(REFERENCE_RE.findall(body))):
        rel_path = Path(relative)
        if ".." in rel_path.parts:
            problems.append(issue("error", path, f"reference may not traverse upward: {relative}"))
            continue
        if len(rel_path.parts) != 2:
            problems.append(issue("warning", path, f"keep skill references one level deep: {relative}"))
        if not (skill_dir / rel_path).is_file():
            problems.append(issue("error", path, f"referenced resource does not exist: {relative}"))

    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate .kiro/skills against adopted Agent Skills structural rules.")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    parser.add_argument("--strict", action="store_true", help="treat warnings as failures")
    args = parser.parse_args()

    skill_dirs = sorted(path for path in SKILLS_ROOT.iterdir() if path.is_dir()) if SKILLS_ROOT.is_dir() else []
    problems: list[dict[str, str]] = []
    if not skill_dirs:
        problems.append(issue("error", SKILLS_ROOT, "no skill directories found"))
    for skill_dir in skill_dirs:
        problems.extend(validate_skill(skill_dir))

    errors = sum(item["severity"] == "error" for item in problems)
    warnings = sum(item["severity"] == "warning" for item in problems)
    result = {
        "skills": len(skill_dirs),
        "errors": errors,
        "warnings": warnings,
        "issues": problems,
    }
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        for item in problems:
            print(f"{item['severity'].upper():7} {item['path']}: {item['message']}")
        print(f"Validated {len(skill_dirs)} skill(s): {errors} error(s), {warnings} warning(s)")

    return 1 if errors or (args.strict and warnings) else 0


if __name__ == "__main__":
    sys.exit(main())
