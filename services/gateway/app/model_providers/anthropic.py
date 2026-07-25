"""Anthropic /v1/models adapter.

Uses the official `anthropic` SDK so we get pagination, retries, and
SSE-friendly httpx setup for free. Imported lazily so a missing dep here
doesn't crash gateway startup if Anthropic support is ever optional.
"""
from __future__ import annotations

import logging
from typing import List

from .base import ProviderModel, register

_log = logging.getLogger("pattadar.gateway.model_providers.anthropic")


def _family_of(model_id: str) -> str:
    """Pull the family slug from a Claude model id.

    Examples:
      claude-opus-4-7              → "opus"
      claude-haiku-4-5-20251001    → "haiku"
      claude-3-5-sonnet-20241022   → "sonnet"  (the first non-numeric segment)
    """
    mid = model_id.lower()
    if not mid.startswith("claude-"):
        return ""
    for part in mid.split("-")[1:]:
        if part and not part.isdigit():
            return part
    return ""


# Anthropic doesn't return pricing or context info via /v1/models, so we
# augment with this static table per (family, generation). Update when
# Anthropic publishes a new family or changes pricing — last reviewed
# 2026-04-19. Per-id overrides take precedence over family defaults; this
# is rarely needed because point releases share pricing within a family.
#
# Cost is USD per million tokens; context_window is max input tokens;
# max_output is max tokens per single response.
_FAMILY_SPECS: dict[str, dict] = {
    # Claude 4.x generation (May 2025+)
    "opus":   {"input": 15.0,  "output": 75.0,  "context": 200_000, "max_output": 32_000},
    "sonnet": {"input": 3.0,   "output": 15.0,  "context": 200_000, "max_output": 64_000},
    "haiku":  {"input": 1.0,   "output": 5.0,   "context": 200_000, "max_output": 8_000},
}

# Per-id overrides — for rare cases where a specific snapshot diverges
# from its family's pricing (e.g. Haiku 3 was much cheaper than Haiku 4).
_ID_OVERRIDES: dict[str, dict] = {
    "claude-3-haiku-20240307": {"input": 0.25, "output": 1.25, "context": 200_000, "max_output": 4_096},
    # Older claude-3 models follow this same pattern; add as needed.
}


def _specs_for(model_id: str, family: str) -> dict:
    """Return the cost/context spec dict for a given model id, falling back
    from per-id override → family default → empty dict (everything None)."""
    if model_id in _ID_OVERRIDES:
        return _ID_OVERRIDES[model_id]
    return _FAMILY_SPECS.get(family, {})


async def list_models(api_key: str) -> List[ProviderModel]:
    if not api_key:
        raise ValueError("Anthropic API key is empty")

    # Lazy import so the module doesn't blow up if `anthropic` isn't installed
    # in some build profile.
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=api_key, timeout=10.0)
    out: List[ProviderModel] = []
    try:
        async for entry in client.models.list():
            mid = getattr(entry, "id", None)
            if not mid or not mid.startswith("claude-"):
                continue
            display = getattr(entry, "display_name", "") or mid
            created = getattr(entry, "created_at", None)
            family = _family_of(mid)
            specs = _specs_for(mid, family)
            out.append(
                ProviderModel(
                    model_id=mid,
                    display_name=display,
                    family=family,
                    released_at=created,
                    input_cost_per_mtok=specs.get("input"),
                    output_cost_per_mtok=specs.get("output"),
                    context_window=specs.get("context"),
                    max_output_tokens=specs.get("max_output"),
                )
            )
    finally:
        await client.close()

    _log.info("anthropic.list_models fetched=%d", len(out))
    return out


register("anthropic", list_models, _specs_for)
