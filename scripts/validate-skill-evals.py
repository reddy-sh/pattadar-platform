#!/usr/bin/env python3
"""Validate the provisional central skill-evaluation registry and collisions."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT / ".kiro" / "skills"
EVALS = ROOT / ".kiro" / "skill-evals"


def fail(message: str) -> None:
    print(f"ERROR: {message}")
    raise SystemExit(1)


def load(name: str):
    path = EVALS / name
    if not path.is_file():
        fail(f"missing {path.relative_to(ROOT)}")
    try:
        return json.loads(path.read_text())
    except (ValueError, OSError) as exc:
        fail(f"invalid {name}: {exc}")


def main() -> int:
    data = load("portfolio.json")
    if data.get("version") != 2 or data.get("status") != "provisional" or data.get("canonical") != "central-portfolio-pilot":
        fail("portfolio must declare version=2, provisional central pilot")
    entries = data.get("skills")
    if not isinstance(entries, list):
        fail("portfolio skills must be a list")
    actual = {p.name for p in SKILLS.iterdir() if p.is_dir() and (p / "SKILL.md").is_file()}
    seen, global_prompts = set(), {}
    for item in entries:
        name = item.get("name") if isinstance(item, dict) else None
        if not isinstance(name, str) or not name or name in seen:
            fail(f"invalid or duplicate skill entry: {name!r}")
        seen.add(name)
        for field in ("positive", "negative"):
            values = item.get(field)
            if not isinstance(values, list) or len(values) < 2 or not all(isinstance(v, str) and v.strip() for v in values):
                fail(f"{name}.{field} needs at least two prompts")
            for prompt in values:
                key = prompt.strip().casefold()
                previous = global_prompts.get(key)
                if previous:
                    fail(f"exact prompt collision: {previous} and {name}.{field}")
                global_prompts[key] = f"{name}.{field}"
        cases = item.get("output_cases")
        if not isinstance(cases, list) or not cases:
            fail(f"{name}.output_cases needs at least one pilot case")
        for case in cases:
            if not isinstance(case, dict) or not isinstance(case.get("prompt"), str) or not case["prompt"].strip() or not isinstance(case.get("expected_output"), str) or not case["expected_output"].strip():
                fail(f"{name} has invalid output case")
    if seen != actual:
        fail(f"portfolio mismatch; missing={sorted(actual-seen)} extra={sorted(seen-actual)}")

    collisions = load("collisions.json")
    if collisions.get("version") != 1 or collisions.get("status") != "provisional":
        fail("collisions must declare version=1 and provisional status")
    ids = set()
    for case in collisions.get("cases", []):
        if not isinstance(case, dict) or not case.get("id") or case["id"] in ids:
            fail("collision cases need unique ids")
        ids.add(case["id"])
        primary = case.get("primary")
        companions = case.get("companions", [])
        suppressed = case.get("suppressed", [])
        if primary not in actual or not isinstance(companions, list) or not isinstance(suppressed, list):
            fail(f"{case['id']} has invalid skill sets")
        mentioned = {primary, *companions, *suppressed}
        if not mentioned <= actual or set(companions) & set(suppressed):
            fail(f"{case['id']} references unknown/conflicting skills")
        if not str(case.get("prompt", "")).strip() or not str(case.get("required_stop", "")).strip():
            fail(f"{case['id']} needs prompt and required_stop")
    if len(ids) < 8:
        fail("at least eight collision cases are required")
    print(f"Validated provisional eval fixtures: {len(actual)} skills, {len(ids)} collisions, 0 errors")
    return 0


if __name__ == "__main__":
    sys.exit(main())
