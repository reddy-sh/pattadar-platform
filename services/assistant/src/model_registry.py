"""Assistant-side view of the platform-wide model catalog.

The source of truth is the `platform_models` table in PG, owned by the
gateway's admin/models endpoints. This module is a thin read-cache over
that table. Refreshes every 30s in the background so admin enable/disable
changes propagate quickly without polling.

Fallback chain (each step kicks in only if the prior fails):
  1. PG `platform_models` rows where enabled=true and use_cases @> ['assistant']
  2. Direct Anthropic /v1/models call
  3. Hardcoded list (cold-start safety net for offline dev / fresh DB)
"""
from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass
from typing import List, Optional

import psycopg
from psycopg.rows import dict_row

_log = logging.getLogger("pattadar.assistant.model_registry")

_REFRESH_INTERVAL_S = float(os.getenv("ASSISTANT_MODEL_REFRESH_INTERVAL", "30"))   # 30s
_PG_TIMEOUT_S = float(os.getenv("ASSISTANT_MODEL_PG_TIMEOUT", "3"))


@dataclass(frozen=True)
class ModelInfo:
    id: str           # provider's model_id (what we send to the SDK)
    name: str         # short label, e.g. "Haiku"
    tier: str         # "Fast" | "Balanced" | "Advanced" | "" (admin hasn't set one)
    family: str       # e.g. "haiku"
    full_name: str    # display name, e.g. "Claude Haiku 4.5"


# ── Fallbacks ──────────────────────────────────────────────────────────────

_HARDCODED_FALLBACK = [
    ModelInfo(id="claude-haiku-4-5",  name="Haiku",  tier="Fast",     family="haiku",  full_name="Claude Haiku 4.5"),
    ModelInfo(id="claude-sonnet-4-6", name="Sonnet", tier="Balanced", family="sonnet", full_name="Claude Sonnet 4.6"),
    ModelInfo(id="claude-opus-4-7",   name="Opus",   tier="Advanced", family="opus",   full_name="Claude Opus 4.7"),
]


# ── Helpers ────────────────────────────────────────────────────────────────

def _pg_dsn() -> str:
    """Build a libpq keyword/value DSN from the same env vars the assistant
    uses for the LangGraph checkpointer. Avoids URL-encoding pitfalls with
    randomly-generated passwords."""
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


def _row_to_info(row: dict) -> ModelInfo:
    return ModelInfo(
        id=row["model_id"],
        name=(row.get("family") or row["model_id"]).title() if row.get("family") else row["display_name"],
        tier=row.get("tier") or "",
        family=row.get("family") or "",
        full_name=row["display_name"],
    )


# ── Registry ───────────────────────────────────────────────────────────────

class ModelRegistry:
    """Reads enabled assistant-use-case models from PG, caches them in
    memory, refreshes periodically."""

    def __init__(self, anthropic_api_key: str = "") -> None:
        self._anthropic_api_key = anthropic_api_key  # used only for PG fallback
        self._all: dict[str, ModelInfo] = {}
        self._latest_per_tier: List[ModelInfo] = []
        self._lock = asyncio.Lock()
        self._refresh_task: Optional[asyncio.Task] = None
        self._loaded_event = asyncio.Event()

    # --------------------------------------------------------------------
    # Lifecycle
    # --------------------------------------------------------------------

    async def start(self) -> None:
        try:
            await asyncio.wait_for(self._refresh(), timeout=_PG_TIMEOUT_S + 5)
        except Exception as e:
            _log.warning("model_registry.initial_refresh_failed: %s", e)
            self._apply_fallback()
        self._loaded_event.set()
        self._refresh_task = asyncio.create_task(self._refresh_loop())

    async def stop(self) -> None:
        if self._refresh_task is not None:
            self._refresh_task.cancel()
            try:
                await self._refresh_task
            except (asyncio.CancelledError, Exception):
                pass
            self._refresh_task = None

    async def _refresh_loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(_REFRESH_INTERVAL_S)
                await self._refresh()
            except asyncio.CancelledError:
                return
            except Exception as e:
                _log.warning("model_registry.refresh_failed: %s", e)

    # --------------------------------------------------------------------
    # PG fetch
    # --------------------------------------------------------------------

    def _query_pg_sync(self) -> List[ModelInfo]:
        """Blocking query — wrapped in to_thread by callers.

        Visibility rule: a model surfaces in the assistant if it's
        `enabled = true` AND its provider is still serving it. The
        `use_cases` array is an OPTIONAL scope — if empty, the model is
        available to any consumer (including this one); if non-empty, we
        require 'assistant' to be in the list. This matches admin
        intuition: clicking the Enabled toggle in the catalog UI is
        sufficient to make a model available, with use_cases reserved
        for the advanced "scope this model to a subset of consumers"
        case.
        """
        with psycopg.connect(_pg_dsn(), row_factory=dict_row, connect_timeout=int(_PG_TIMEOUT_S)) as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT model_id, display_name, family, tier, released_at
                  FROM platform_models
                 WHERE enabled = true
                   AND provider_status = 'active'
                   AND (use_cases = '[]'::jsonb OR use_cases @> '["assistant"]'::jsonb)
                 ORDER BY released_at DESC NULLS LAST
                """
            )
            return [_row_to_info(r) for r in cur.fetchall()]

    async def _refresh(self) -> None:
        # 1. Try PG (the catalog)
        try:
            models = await asyncio.to_thread(self._query_pg_sync)
        except Exception as e:
            _log.warning("model_registry.pg_query_failed: %s — falling back", e)
            models = []

        # 2. PG empty? Fall back to a direct Anthropic fetch so the assistant
        # still works in environments where the catalog hasn't been seeded.
        if not models and self._anthropic_api_key:
            try:
                models = await asyncio.wait_for(
                    self._fetch_anthropic_direct(), timeout=5.0
                )
                _log.info("model_registry.anthropic_direct_fallback fetched=%d", len(models))
            except Exception as e:
                _log.warning("model_registry.anthropic_direct_failed: %s", e)
                models = []

        # 3. Still nothing? Use the hardcoded list.
        if not models:
            self._apply_fallback()
            return

        # Show EVERY enabled model in the dropdown — admin opt-in is the
        # signal of intent.
        #
        # Order: known tier order first (Fast → Balanced → Advanced),
        # unknown tiers alphabetical, then within each tier newest first
        # by family canonical order (haiku → sonnet → opus) so multi-version
        # tiers stay logically grouped. Models without a release date sort
        # last within their tier.
        TIER_ORDER = {"Fast": 0, "Balanced": 1, "Advanced": 2}
        FAMILY_ORDER = {"haiku": 0, "sonnet": 1, "opus": 2}

        def _sort_key(m: ModelInfo) -> tuple:
            tier_rank = TIER_ORDER.get(m.tier, 9)
            family_rank = FAMILY_ORDER.get(m.family, 9)
            # ModelInfo from PG row doesn't carry released_at — approximate
            # "newer" via the version segments of the model_id:
            # claude-opus-4-7 → (4,7); claude-opus-4-6 → (4,6).
            parts = [int(p) for p in m.id.split("-") if p.isdigit() and len(p) != 8]
            return (tier_rank, family_rank, [-x for x in parts], m.id)

        sorted_models = sorted(models, key=_sort_key)

        async with self._lock:
            self._all = {m.id: m for m in models}
            self._latest_per_tier = sorted_models  # field name kept for back-compat

        _log.info(
            "model_registry.refreshed source=pg total=%d dropdown=%s",
            len(models), [m.id for m in sorted_models],
        )

    async def _fetch_anthropic_direct(self) -> List[ModelInfo]:
        """Fallback path — talks to Anthropic directly when PG has no
        enabled assistant models. Infers family/tier from the model id."""
        from anthropic import AsyncAnthropic
        client = AsyncAnthropic(api_key=self._anthropic_api_key, timeout=5.0)
        out: List[ModelInfo] = []
        try:
            async for entry in client.models.list():
                mid = getattr(entry, "id", None)
                if not mid or not mid.startswith("claude-"):
                    continue
                family = ""
                for part in mid.lower().split("-")[1:]:
                    if part and not part.isdigit():
                        family = part
                        break
                if not family or family.isdigit():
                    continue
                tier = {"haiku": "Fast", "sonnet": "Balanced", "opus": "Advanced"}.get(family, "")
                display = getattr(entry, "display_name", "") or mid
                out.append(ModelInfo(id=mid, name=family.title(), tier=tier, family=family, full_name=display))
        finally:
            await client.close()
        return out

    def _apply_fallback(self) -> None:
        if self._all:
            return
        self._all = {m.id: m for m in _HARDCODED_FALLBACK}
        self._latest_per_tier = list(_HARDCODED_FALLBACK)
        _log.warning("model_registry.using_hardcoded_fallback")

    # --------------------------------------------------------------------
    # Read API
    # --------------------------------------------------------------------

    async def wait_loaded(self, timeout: float = 5.0) -> None:
        try:
            await asyncio.wait_for(self._loaded_event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            pass

    def list_models(self) -> List[ModelInfo]:
        return list(self._latest_per_tier)

    def all_models(self) -> List[ModelInfo]:
        return list(self._all.values())

    def is_supported(self, model_id: str) -> bool:
        return model_id in self._all

    def default_model(self) -> str:
        env_default = os.getenv("ASSISTANT_MODEL", "").strip()
        if env_default and env_default in self._all:
            return env_default
        for m in self._latest_per_tier:
            if m.tier == "Balanced":
                return m.id
        if self._latest_per_tier:
            return self._latest_per_tier[0].id
        return "claude-sonnet-4-6"


# Module-level singleton
_registry: Optional[ModelRegistry] = None


def get_registry() -> ModelRegistry:
    if _registry is None:
        raise RuntimeError("model_registry not initialised — call init_registry() first")
    return _registry


def init_registry(anthropic_api_key: str = "") -> ModelRegistry:
    global _registry
    if _registry is None:
        _registry = ModelRegistry(anthropic_api_key)
    return _registry
