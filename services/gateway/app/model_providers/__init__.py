"""LLM provider adapters — one per provider (Anthropic, OpenAI, ...).

Ported from rhub api/gateway/model_providers/. Each provider implements
list_models(api_key) → List[ProviderModel]. The admin/models sync endpoint
dispatches to the right adapter based on the provider row in PG. Adding a
new provider = drop a file in here + `register()` it; no other code change.
"""
from .base import ProviderModel, default_specs, get_adapter, known_providers, register  # noqa: F401
from . import anthropic as _anthropic  # noqa: F401  — import for side-effect (registers)
