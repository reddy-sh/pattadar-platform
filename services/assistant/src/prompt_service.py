"""
Centralized prompt service with DB-backed storage, TTL cache, and built-in fallback.

Ported from the predecessor's api/common/prompt_service.py. Differences:
- The DB connection string is built from the standard PG_* env vars directly
  (the predecessor read it from its postgres provider module, which is not ported).
- Final fallback is a BUILT-IN default assistant prompt: if the
  ``agent_prompts`` table/row is absent (fresh database), the assistant still
  boots with a sensible pattadar system prompt instead of raising.

Usage::

    from .prompt_service import PromptService

    svc = PromptService.get_instance()
    prompt = await svc.get("assistant")

Loads prompts from the ``agent_prompts`` table (cached for 60 s), falling back
to seed markdown files under ``PROMPT_SEED_DIR`` (optional), then to the
built-in default.
"""

import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

_log = logging.getLogger("pattadar.assistant.prompt_service")

_DEFAULT_SEED_DIR = os.getenv("PROMPT_SEED_DIR", "")


# Built-in default system prompt — used when neither the agent_prompts table
# nor a seed file provides one. Ports the spirit of the predecessor's assistant seed
# prompt, rewritten for the Pattadar land-records domain.
_BUILTIN_PROMPTS: Dict[str, str] = {
    "assistant": """\
You are the Pattadar Assistant — the friendly in-app helper for Pattadar, an app
where families in Andhra Pradesh keep their land and property records in one place.

## What Pattadar Covers
- **Land parcels** and pattadar **passbooks** (agricultural holdings)
- **Properties** — flats, plots, commercial and rental holdings
- **Documents and deeds** — sale deeds, land records, uploaded files
- **Family** — groups and members, invitations, inheritance records
- **Tools** — SRO offices, stamp duty and registration fees, market values, calculators
- **Wallet, notifications, and profile**

## How to Speak
- Plain, everyday language. You are talking to land owners and their families,
  not engineers. NEVER mention technical details: APIs, endpoints, status codes,
  latencies, databases, or how the system works "under the hood".
- Be concise. Short, direct answers. No filler.
- Dates are always shown in **DD/MM/YYYY** (India). Amounts in rupees (₹).
- Be warm and reassuring — land records are stressful; the assistant should not be.

## Page Awareness ("See & Say")
You may receive a live snapshot of what the user currently sees: which page they
are on, the sidebar navigation, and the tables, forms, errors, and metrics on
screen.

**Rules:**
- **ANSWER FROM WHAT YOU SEE FIRST.** If the answer is visible in the page
  insights (tables, counts, metrics, errors), answer IMMEDIATELY from that data
  with specific values. Do not deflect to the user or tell them to "check the page".
- **You have a `navigate_user` tool.** When the user says "go to X", "open X",
  or "show me X", call `navigate_user(page="X")` to take them there instantly.
  NEVER say "I can't navigate".
- You also have page-action tools (`set_filter`, `open_record`, `fill_field`,
  `submit_form`) to act on the current page when the user asks.
- If something on screen shows an error, explain it in plain words and suggest
  what the user can do next.

## Behavior
1. Be action-oriented: when the user asks to see or do something, do it.
2. Only ask a clarifying question when the request is truly ambiguous.
3. Present results clearly with light markdown formatting.
4. If you genuinely cannot help with something, say so plainly and suggest who can.
""",
}


@dataclass
class _CacheEntry:
    content: str
    loaded_at: float

    def expired(self, ttl: float) -> bool:
        return (time.time() - self.loaded_at) > ttl


def _conninfo() -> str:
    """libpq keyword/value DSN from the standard PG_* env vars."""
    parts = [
        f"host={os.getenv('PG_HOST', 'localhost')}",
        f"port={os.getenv('PG_PORT', '5432')}",
        f"dbname={os.getenv('PG_DATABASE', 'hub')}",
    ]
    user = os.getenv("PG_USER", "")
    pwd = os.getenv("PG_PASSWORD", "")
    if user:
        parts.append(f"user={user}")
    if pwd:
        parts.append(f"password={pwd}")
    return " ".join(parts)


class PromptService:
    """Centralized prompt loader with DB cache, seed-file and built-in fallback."""

    _instance: Optional["PromptService"] = None
    TTL: float = 60.0  # seconds

    def __init__(self, seed_dir: str = _DEFAULT_SEED_DIR):
        self._seed_dir = seed_dir
        self._cache: Dict[str, _CacheEntry] = {}

    # ------------------------------------------------------------------
    # Singleton helpers
    # ------------------------------------------------------------------

    @classmethod
    def get_instance(cls) -> "PromptService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        """For testing -- reset singleton."""
        cls._instance = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def get(self, prompt_id: str) -> str:
        """DB (cached 60 s) -> seed file -> built-in default -> ValueError."""
        # Check cache first
        entry = self._cache.get(prompt_id)
        if entry and not entry.expired(self.TTL):
            return entry.content

        # Try DB
        content = await self._load_from_db(prompt_id)
        if content is not None:
            self._cache[prompt_id] = _CacheEntry(content=content, loaded_at=time.time())
            return content

        # Try seed file
        content = self._load_from_seed(prompt_id)
        if content is not None:
            self._cache[prompt_id] = _CacheEntry(content=content, loaded_at=time.time())
            return content

        # Built-in default (fresh DB, no prompts seeded — assistant still works)
        builtin = _BUILTIN_PROMPTS.get(prompt_id)
        if builtin is not None:
            self._cache[prompt_id] = _CacheEntry(content=builtin, loaded_at=time.time())
            return builtin

        raise ValueError(f"Prompt not found: {prompt_id}")

    # ------------------------------------------------------------------
    # Internal loaders
    # ------------------------------------------------------------------

    async def _load_from_db(self, prompt_id: str) -> Optional[str]:
        """Query agent_prompts table for active prompt. Returns None on any error."""
        try:
            import asyncio

            import psycopg
            from psycopg.rows import dict_row

            def _fetch() -> Optional[str]:
                with psycopg.connect(_conninfo(), row_factory=dict_row, autocommit=True) as conn:
                    row = conn.execute(
                        "SELECT content FROM agent_prompts WHERE id = %s AND is_active = true",
                        [prompt_id],
                    ).fetchone()
                    return row["content"] if row else None

            return await asyncio.to_thread(_fetch)
        except Exception as exc:
            _log.debug("prompt_service: DB lookup failed for %s -- %s", prompt_id, exc)
            return None

    def _load_from_seed(self, prompt_id: str) -> Optional[str]:
        """Look up {seed_dir}/**/{prompt_id}.md, parse frontmatter, return body."""
        if not self._seed_dir:
            return None
        seed_path = Path(self._seed_dir)
        if not seed_path.is_dir():
            return None
        for md_file in seed_path.rglob("*.md"):
            if md_file.stem == prompt_id:
                text = md_file.read_text(encoding="utf-8")
                _, body = self._parse_frontmatter(text)
                return body
        return None

    # ------------------------------------------------------------------
    # Frontmatter parser
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_frontmatter(text: str) -> Tuple[Dict[str, Any], str]:
        """Parse YAML frontmatter. Returns (metadata_dict, body_str)."""
        if not text.startswith("---"):
            return {}, text
        parts = text.split("---", 2)
        if len(parts) < 3:
            return {}, text
        try:
            import yaml

            meta = yaml.safe_load(parts[1]) or {}
        except Exception:
            meta = {}
        body = parts[2].lstrip("\n")
        return meta, body
