#!/usr/bin/env python3
"""Summarize Cloud Custodian output dirs as a markdown table.

Usage: summarize.py [--fail-on-findings] <output-dir>
Exit 1 with --fail-on-findings when any policy matched resources.
"""
import json
import pathlib
import sys

fail = "--fail-on-findings" in sys.argv
args = [a for a in sys.argv[1:] if not a.startswith("--")]
root = pathlib.Path(args[0])

rows = []
for res in sorted(root.glob("**/resources.json")):
    policy = res.parent.name
    count = len(json.loads(res.read_text()))
    rows.append((policy, count))

total = sum(c for _, c in rows)
if not fail:
    print(f"### Custodian sweep: `{root}` — {total} finding(s)\n")
    print("| Policy | Findings |\n|---|---|")
    for policy, count in rows:
        print(f"| {policy} | {'**' + str(count) + '**' if count else 0} |")
    print()

if fail and total:
    print(f"FAIL: {total} security finding(s) — see step summary/artifact")
    sys.exit(1)
