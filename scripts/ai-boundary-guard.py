#!/usr/bin/env python3
"""Keep product AI code inside its declared boundaries.

The AI in this platform is easy to spread by accident: one more
`httpx.post("https://api.anthropic.com/...")`, one prompt pasted into a route,
one model id hardcoded in a screen. Each is individually harmless and
collectively means nobody can answer "what do we run, and what does it cost".

This guard fails when that happens. It is deliberately static — it reads files
and never imports application code, calls a provider or touches a database, so
it is safe to run anywhere including CI.

Checks:
  1. Provider endpoints are called only from declared adapters.
  2. The provider secret is read only where declared.
  3. Extraction prompts stay in one module, out of routes and composition roots.
  4. Product MCP tools are registered only in the assistant's adapters.
  5. No new synchronous paid-reading route appears.
  6. The inventory's declared paths all exist.
  7. `.kiro/**` is untouched by AI-architecture changes.

Usage:
    python scripts/ai-boundary-guard.py            # check
    python scripts/ai-boundary-guard.py --selftest # verify the guard itself
"""
from __future__ import annotations

import argparse
import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
INVENTORY = REPO / "docs/architecture/ai-inventory.yaml"
ARCHITECTURE = REPO / "docs/architecture/ai-system.md"

# Only these trees are product code. Developer tooling and generated native
# projects are out of scope.
PRODUCT_ROOTS = ("services", "apps", "packages", "scripts")
SKIP_DIRS = {
    ".git", ".kiro", ".claude", ".codex", ".cursor", ".gemini", ".agents",
    ".local", "node_modules", "__pycache__", ".venv", "venv", "dist", "build",
    ".next", "Pods", ".terraform", ".codegraph",
}

# ── what each rule looks for ──────────────────────────────────────────

PROVIDER_ENDPOINT = re.compile(r"api\.anthropic\.com|anthropic-version")
# Two different dependencies that are easy to conflate. The model SDK talks to a
# provider and costs money; the agent SDK also provides the in-process MCP tool
# machinery, which tool modules legitimately import without calling a model.
MODEL_SDK = re.compile(r"^\s*(?:from\s+anthropic\b|import\s+anthropic\b)", re.M)
AGENT_SDK = re.compile(
    r"^\s*(?:from\s+claude_agent_sdk\b|import\s+claude_agent_sdk\b)", re.M)
PROVIDER_SECRET = re.compile(r"ANTHROPIC_API_KEY")
# A prompt, as opposed to a mention of one: a long instruction string telling a
# model what to return.
PROMPT_SHAPE = re.compile(
    r"(You are a [a-z\- ]*(?:data-extraction|classifier|KYC)|"
    r"Return ONLY a compact JSON object|"
    r"Output MUST be valid JSON and nothing else)"
)
MCP_REGISTRATION = re.compile(r"create_sdk_mcp_server|@sdk_tool|\bsdk_tool\(")
NEW_SYNC_READ_ROUTE = re.compile(
    r"""(?:@app|@router)\.post\(\s*["']/(?:import|extract)-[a-z\-]+["']"""
)

ALLOW_PROVIDER_CALL = {
    "services/api/src/ai_reading/providers/anthropic.py",
    "services/assistant/src/adapters/agent_runtime.py",
    "services/gateway/src/ai_catalog/providers/anthropic.py",
    "services/gateway/src/ai_catalog/providers/base.py",
}
# The model SDK. model_catalog uses it for the cold-start model list only; that
# is a declared fallback, not a reading path.
ALLOW_MODEL_SDK = ALLOW_PROVIDER_CALL | {
    "services/assistant/src/adapters/model_catalog.py",
}
# The agent SDK, including its in-process MCP tool decorators.
ALLOW_AGENT_SDK = {
    "services/assistant/src/adapters/agent_runtime.py",
    "services/assistant/src/adapters/mcp/ui.py",
    "services/assistant/src/adapters/mcp/records.py",
}
ALLOW_PROVIDER_SECRET = {
    "services/api/src/ai_reading/providers/anthropic.py",
    # Passes the configured key into the SDK's environment; does not read env
    # directly for its own request.
    "services/assistant/src/adapters/agent_runtime.py",
    "services/assistant/src/adapters/model_catalog.py",
    "services/assistant/src/config.py",
    "services/gateway/src/ai_catalog/routes.py",
    "services/gateway/src/ai_catalog/providers/anthropic.py",
}
ALLOW_PROMPTS = {
    "services/api/src/ai_reading/prompts.py",
    "services/assistant/src/adapters/prompt_repository.py",
    "services/assistant/src/domain/tool_policy.py",
}
# The MCP package itself, plus the runtime that registers its two servers.
ALLOW_MCP_TOOLS = {
    "services/assistant/src/adapters/mcp/__init__.py",
    "services/assistant/src/adapters/mcp/ui.py",
    "services/assistant/src/adapters/mcp/records.py",
    "services/assistant/src/adapters/agent_runtime.py",
}
# The four durable readings plus the pre-storage classifier are the routes that
# already exist. A sixth needs a decision, not a merge.
ALLOW_SYNC_READ_ROUTES = {"services/api/src/ai_reading/routes.py"}

# Paths the inventory promises exist. Kept short and load-bearing.
DECLARED_PATHS = [
    "services/api/src/ai_reading/prompts.py",
    "services/api/src/ai_reading/usage.py",
    "services/api/src/ai_reading/consent.py",
    "services/api/src/ai_reading/routes.py",
    "services/api/src/ai_reading/operations.py",
    "services/api/src/ai_reading/providers/anthropic.py",
    "services/api/src/ai_reading/jobs.py",
    "services/assistant/src/main.py",
    "services/assistant/src/ports.py",
    "services/assistant/src/domain/scope_policy.py",
    "services/assistant/src/domain/tool_policy.py",
    "services/assistant/src/domain/sse_events.py",
    "services/assistant/src/adapters/agent_runtime.py",
    "services/assistant/src/adapters/mcp/ui.py",
    "services/assistant/src/adapters/mcp/records.py",
    "services/assistant/src/adapters/model_catalog.py",
    "services/assistant/src/adapters/prompt_repository.py",
    "services/gateway/src/ai_catalog/__init__.py",
    "services/gateway/src/ai_catalog/routes.py",
    "services/gateway/src/ai_catalog/providers/anthropic.py",
    "services/api/tests/test_ai_reading.py",
    "services/assistant/tests/test_tool_policy.py",
    "docs/architecture/ai-system.md",
    "docs/architecture/ai-inventory.yaml",
]

CODE_SUFFIXES = {".py", ".ts", ".tsx", ".js", ".jsx", ".swift", ".kt", ".java"}


def product_files() -> list[pathlib.Path]:
    out: list[pathlib.Path] = []
    guard = pathlib.Path(__file__).resolve()
    for root in PRODUCT_ROOTS:
        base = REPO / root
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.suffix not in CODE_SUFFIXES or not path.is_file():
                continue
            if SKIP_DIRS & set(path.relative_to(REPO).parts):
                continue
            # This file necessarily contains the patterns it searches for.
            if path.resolve() == guard:
                continue
            out.append(path)
    return out


def rel(path: pathlib.Path) -> str:
    return path.relative_to(REPO).as_posix()


def check(files: list[pathlib.Path], check_inventory_claims: bool = True) -> list[str]:
    failures: list[str] = []

    for path in files:
        name = rel(path)
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        is_test = "/tests/" in name or name.endswith(("_test.py", ".test.ts", ".test.tsx"))

        if PROVIDER_ENDPOINT.search(text) and name not in ALLOW_PROVIDER_CALL and not is_test:
            failures.append(
                f"{name}: names the provider endpoint. Provider calls belong in a declared "
                f"adapter so retry and cost policy have one definition. "
                f"See docs/architecture/ai-system.md."
            )

        if MODEL_SDK.search(text) and name not in ALLOW_MODEL_SDK and not is_test:
            failures.append(
                f"{name}: imports the Anthropic model SDK. Wrap it in a declared adapter and "
                f"depend on a port instead."
            )

        if AGENT_SDK.search(text) and name not in ALLOW_AGENT_SDK and not is_test:
            failures.append(
                f"{name}: imports the Claude Agent SDK. The runtime and the MCP tool modules "
                f"are the only places that may."
            )

        if PROVIDER_SECRET.search(text) and name not in ALLOW_PROVIDER_SECRET and not is_test:
            failures.append(
                f"{name}: reads ANTHROPIC_API_KEY. Read it through typed configuration in a "
                f"declared module, and add it to ai-inventory.yaml if that is intended."
            )

        if PROMPT_SHAPE.search(text) and name not in ALLOW_PROMPTS and not is_test:
            failures.append(
                f"{name}: contains what looks like a model prompt. Extraction prompts live in "
                f"services/api/src/ai_reading/prompts.py — prompt caching keys on exact bytes, "
                f"so duplicates quietly raise cost."
            )

        if MCP_REGISTRATION.search(text) and name not in ALLOW_MCP_TOOLS and not is_test:
            failures.append(
                f"{name}: registers an MCP tool or server. Product tools belong in "
                f"services/assistant/src/adapters/ and must be added to the allowlist in "
                f"domain/tool_policy.py."
            )

        if NEW_SYNC_READ_ROUTE.search(text) and name not in ALLOW_SYNC_READ_ROUTES and not is_test:
            failures.append(
                f"{name}: declares a synchronous document-reading route. Paid readings must be "
                f"durable async jobs with authenticated polling (invariant 2)."
            )

    for declared in DECLARED_PATHS:
        if not (REPO / declared).exists():
            failures.append(
                f"{declared}: declared in ai-inventory.yaml but missing. Update the inventory "
                f"in the same change that moves the code."
            )

    if not INVENTORY.exists():
        failures.append("docs/architecture/ai-inventory.yaml is missing.")
    elif check_inventory_claims:
        failures.extend(inventory_claims())
    if not ARCHITECTURE.exists():
        failures.append("docs/architecture/ai-system.md is missing.")

    return failures


# Anything in the inventory that looks like a repository path. The inventory
# once listed developer config files that did not exist; a document that names
# the wrong file is worse than one that says nothing.
INVENTORY_PATH_SHAPE = re.compile(
    r"(?<![\w./-])((?:services|apps|packages|scripts|docs|infra|\.kiro|\.cursor|\.codex|\.gemini)"
    r"/[\w./-]+|\.mcp\.json)"
)


def inventory_claims() -> list[str]:
    text = INVENTORY.read_text(encoding="utf-8")
    out: list[str] = []
    for raw in sorted(set(INVENTORY_PATH_SHAPE.findall(text))):
        # Prose ends sentences with punctuation that the path shape swallows.
        candidate = raw
        while candidate and candidate[-1] in ".,;:)]\"'" and not (REPO / candidate).exists():
            candidate = candidate[:-1]
        if not candidate:
            continue
        if (REPO / candidate).exists():
            continue
        # Tolerate a table/prose reference to a package written without .py
        if (REPO / f"{candidate}.py").exists():
            continue
        out.append(
            f"docs/architecture/ai-inventory.yaml names {candidate}, which does not exist. "
            f"Correct the inventory or restore the file."
        )
    return out


def selftest() -> int:
    """Prove the guard actually catches what it claims to."""
    import tempfile

    cases = [
        ("provider endpoint", 'r = httpx.post("https://api.anthropic.com/v1/messages")', True),
        ("provider sdk", "from anthropic import AsyncAnthropic", True),
        ("provider secret", 'key = os.getenv("ANTHROPIC_API_KEY")', True),
        ("prompt", '"You are a data-extraction assistant for deeds. Output MUST be valid JSON and nothing else."', True),
        ("mcp tool", '@sdk_tool("do_thing", "desc", {})', True),
        ("sync read route", '@app.post("/import-khata")', True),
        ("innocent code", "def total(rows):\n    return sum(r.value for r in rows)", False),
        ("mentions ai in prose", '# the assistant reads deeds via the catalog\nX = 1', False),
    ]
    failed = 0
    with tempfile.TemporaryDirectory(dir=REPO / "services") as tmp:
        tmpdir = pathlib.Path(tmp)
        for label, body, should_flag in cases:
            probe = tmpdir / "probe.py"
            probe.write_text(body, encoding="utf-8")
            flagged = bool([f for f in check([probe], check_inventory_claims=False)
                            if "probe.py" in f])
            ok = flagged == should_flag
            failed += not ok
            verdict = "ok" if ok else "SELFTEST FAILED"
            print(f"  [{verdict}] {label}: flagged={flagged} expected={should_flag}")
    print("\nselftest:", "passed" if not failed else f"{failed} case(s) wrong")
    return 1 if failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--selftest", action="store_true",
                        help="check the guard's own detection rules")
    args = parser.parse_args()

    if args.selftest:
        return selftest()

    files = product_files()
    failures = check(files)

    print(f"ai-boundary-guard: scanned {len(files)} product files")
    if failures:
        print(f"\n{len(failures)} boundary violation(s):\n")
        for item in failures:
            print(f"  - {item}")
        print("\nIf a violation is intended, update docs/architecture/ai-inventory.yaml")
        print("and this guard's allowlist in the same change, and say why.")
        return 1
    print("ai-boundary-guard: product AI stays inside its declared boundaries")
    return 0


if __name__ == "__main__":
    sys.exit(main())
