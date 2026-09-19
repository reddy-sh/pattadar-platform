"""Ports for AI document reading.

These describe what the reading workflow depends on, so the Anthropic call and
the consent gate can be substituted in tests without importing a provider SDK.
The concrete Anthropic implementation lives in adapters/anthropic_messages.py
and is the only place in this service allowed to call a model provider.
"""
from __future__ import annotations

from typing import Any, Protocol


class VisionExtractor(Protocol):
    """Reads one document and returns typed fields, or a reportable failure.

    Returns {"fields": dict, "raw": str} on success and
    {"_error": (status, message)} on failure. A failure is never retried
    automatically by a caller: an interrupted paid call may already have been
    charged (see docs/architecture/ai-system.md).
    """

    async def __call__(
        self,
        data: bytes,
        mime: str,
        name: str,
        system: str,
        user_text: str,
        max_mb: int = 8,
        max_tokens: int = 1024,
        effort: str = "medium",
        endpoint: str = "anthropic-extract",
    ) -> dict[str, Any]:
        ...


class ConsentGate(Protocol):
    """Refuses a reading unless the owner still permits it.

    Raises rather than returning, so a withdrawn consent cannot be ignored by a
    caller that forgets to check a boolean.
    """

    async def __call__(self, request: Any) -> None:
        ...
