"""Provider adapter base + registry.

A provider adapter is just an async function that takes an API key and
returns a list of ProviderModel rows. The registry is a `dict[provider_id
→ adapter]` populated by import-time `register()` calls.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Awaitable, Callable, Dict, List, Optional


@dataclass(frozen=True)
class ProviderModel:
    """One model row as returned by a provider's list endpoint, augmented
    with cost/capability metadata where the provider doesn't return it.

    Anthropic and OpenAI both expose id / display_name / created_at via
    their list endpoints, but neither returns pricing or context window.
    The adapter is responsible for adding those fields from a per-family
    lookup table — see anthropic.py:_FAMILY_SPECS for the canonical
    Anthropic pricing as of the adapter's last review date.
    """
    model_id: str                              # provider's own id, e.g. 'claude-opus-4-7'
    display_name: str                          # e.g. 'Claude Opus 4.7'
    family: Optional[str]                      # provider-specific family slug ('opus', 'gpt-5', ...)
    released_at: Optional[datetime]            # provider's created_at, or None if not provided
    input_cost_per_mtok: Optional[float] = None   # USD per million input tokens
    output_cost_per_mtok: Optional[float] = None  # USD per million output tokens
    context_window: Optional[int] = None          # max input tokens the model accepts
    max_output_tokens: Optional[int] = None       # max output tokens per response


Adapter = Callable[[str], Awaitable[List[ProviderModel]]]

# (model_id, family) → cost/context spec dict, falling back from per-id
# override → family default → {}. Same shape the adapter uses to augment
# ProviderModel rows; exposed so the admin UI can show the per-family
# default next to each editable field.
SpecResolver = Callable[[str, str], dict]

_REGISTRY: Dict[str, Adapter] = {}
_SPEC_RESOLVERS: Dict[str, SpecResolver] = {}


def register(provider_id: str, adapter: Adapter, spec_resolver: Optional[SpecResolver] = None) -> None:
    _REGISTRY[provider_id] = adapter
    if spec_resolver is not None:
        _SPEC_RESOLVERS[provider_id] = spec_resolver


def get_adapter(provider_id: str) -> Optional[Adapter]:
    return _REGISTRY.get(provider_id)


def default_specs(provider_id: str, model_id: str, family: str) -> dict:
    """Resolve the provider's default cost/context spec for a model.

    Returns {} when the provider has no resolver or no default for the
    family (e.g. an unrecognised model) — callers treat that as "no
    default, leave the field blank".
    """
    resolver = _SPEC_RESOLVERS.get(provider_id)
    return resolver(model_id, family) if resolver else {}


def known_providers() -> List[str]:
    return sorted(_REGISTRY.keys())
