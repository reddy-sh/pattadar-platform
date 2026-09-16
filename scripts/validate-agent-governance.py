#!/usr/bin/env python3
"""Run the complete local/static Agent Skills governance validation."""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(message: str) -> None:
    print(f"ERROR: {message}")
    raise SystemExit(1)


def main() -> int:
    for script, args in (
        ("scripts/validate-agent-skills.py", ["--strict"]),
        ("scripts/validate-skill-evals.py", []),
    ):
        subprocess.run([sys.executable, str(ROOT / script), *args], check=True)

    skill_root = ROOT / ".kiro" / "skills"
    skills = {p.name for p in skill_root.iterdir() if p.is_dir() and (p / "SKILL.md").is_file()}
    catalog = (skill_root / "README.md").read_text()
    catalog_names = set(re.findall(r"`([a-z0-9]+(?:-[a-z0-9]+)*)`", catalog)) & skills
    if catalog_names != skills:
        fail(f"catalog mismatch; missing={sorted(skills-catalog_names)}")

    required_steering = {
        "pattadar-standards.md", "pattadar-safety.md", "change-governance.md", "reddy-authority.md"
    }
    steering_root = ROOT / ".kiro" / "steering"
    for name in required_steering:
        path = steering_root / name
        if not path.is_file() or "inclusion: always" not in path.read_text().split("---", 2)[1]:
            fail(f"required always-on steering invalid: {name}")

    for skill in skills:
        directory = skill_root / skill
        body = (directory / "SKILL.md").read_text()
        for ref in (directory / "references").glob("*.md") if (directory / "references").is_dir() else []:
            relative = f"references/{ref.name}"
            if relative not in body:
                fail(f"orphan skill reference: {skill}/{relative}")

    hook_path = ROOT / ".kiro" / "hooks" / "validate-agent-governance.json"
    hook = json.loads(hook_path.read_text())
    if hook.get("version") != "v1" or len(hook.get("hooks", [])) != 1:
        fail("governance hook schema invalid")
    item = hook["hooks"][0]
    matcher = item.get("matcher", "")
    command = item.get("action", {}).get("command", "")
    for required in ("skills", "steering", "hooks", "skill-evals"):
        if required not in matcher:
            fail(f"governance hook matcher misses {required}")
    if command != "python3 scripts/validate-agent-governance.py":
        fail("governance hook must call the canonical orchestrator")

    adapter = ROOT / ".claude" / "skills" / "sync-ios" / "SKILL.md"
    if not adapter.is_file() or ".kiro/skills/sync-ios/SKILL.md" not in adapter.read_text():
        fail("Claude sync-ios adapter does not point to canonical Kiro skill")

    print(f"Validated Agent Skills governance: {len(skills)} skills, catalog, steering, hook, evals and adapter")
    return 0


if __name__ == "__main__":
    sys.exit(main())
