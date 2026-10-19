"""What a request cost, and why a provider call failed, in words a person reads.

The Agent SDK reports ``total_cost_usd`` for a run; the price table here is the
fallback when it does not (and the unit test of the arithmetic). Anthropic
does not expose the remaining credit balance through the API key the service
holds, so the balance is never shown as a number; the service can only say a
call was refused for lack of credit, which ``classify_failure`` detects.
"""
from __future__ import annotations

from typing import Any

# USD per million tokens: (input, output). Cache writes (5 min) bill at 1.25x
# input and cache reads at 0.1x input. Source: Anthropic list prices, 2026-09.
PRICES: dict[str, tuple[float, float]] = {
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-sonnet-5": (2.00, 10.00),
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-opus-4-6": (5.00, 25.00),
    "claude-opus-4-8": (5.00, 25.00),
    "claude-opus-5": (5.00, 25.00),
    "claude-opus-5-5": (4.00, 20.00),
    "claude-haiku-4-5": (1.00, 5.00),
}
CACHE_WRITE = 1.25
CACHE_READ = 0.10

CREDIT_EXHAUSTED = "credit_exhausted"
#: What the owner reads for every provider failure (naming standard E2, 06/10/2026):
#: never the vendor, a key, a console or a billing page. The reason below goes
#: to the logs and admin views only.
OWNER_TEXT = (
    "The assistant is not available right now. Your properties and documents "
    "are safe. Try again in a few minutes."
)
#: Kept for callers that imported it; owners now read OWNER_TEXT.
CREDIT_TEXT = OWNER_TEXT
_ADMIN_DETAIL = {
    CREDIT_EXHAUSTED: "Anthropic API credits have run out. Add credits at console.anthropic.com → Billing.",
    "provider_auth": "The Anthropic API key was rejected. Check the key the service is started with.",
    "provider_rate_limited": "Anthropic is rate-limiting the assistant.",
    "provider_overloaded": "Anthropic is overloaded.",
}


def _tokens(usage: dict[str, Any], key: str) -> int:
    value = usage.get(key)
    return int(value) if isinstance(value, (int, float)) else 0


def estimate_cost(model: str, usage: dict[str, Any]) -> float | None:
    """List-price cost of one run from its usage block, or None for an unknown model."""
    price = PRICES.get(model)
    if not price:
        return None
    per_in, per_out = price[0] / 1e6, price[1] / 1e6
    return round(
        _tokens(usage, "input_tokens") * per_in
        + _tokens(usage, "cache_creation_input_tokens") * per_in * CACHE_WRITE
        + _tokens(usage, "cache_read_input_tokens") * per_in * CACHE_READ
        + _tokens(usage, "output_tokens") * per_out,
        6,
    )


def request_cost(model: str, usage: dict[str, Any], reported: Any = None) -> dict[str, Any]:
    """The per-request figure shown under a reply: SDK-reported cost when present."""
    cost = float(reported) if isinstance(reported, (int, float)) and reported >= 0 else estimate_cost(model, usage)
    return {
        "cost_usd": cost,
        "input_tokens": _tokens(usage, "input_tokens"),
        "cache_write_tokens": _tokens(usage, "cache_creation_input_tokens"),
        "cache_read_tokens": _tokens(usage, "cache_read_input_tokens"),
        "output_tokens": _tokens(usage, "output_tokens"),
    }


def reply_cost(metadata: Any) -> float | None:
    """What one stored reply cost: its saved per-request figure, else (replies
    saved before per-request cost existed) priced from its usage block."""
    if not isinstance(metadata, dict):
        return None
    cost = metadata.get("cost")
    value = cost.get("cost_usd") if isinstance(cost, dict) else None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    usage = metadata.get("usage")
    if not isinstance(usage, dict):
        return None
    return estimate_cost(str(metadata.get("model") or ""), usage)


def total_cost(metadatas: list[Any]) -> float:
    """Sum of reply_cost over stored replies; unpriceable ones count as 0."""
    return round(sum(reply_cost(item) or 0.0 for item in metadatas), 6)


def classify_failure(text: str | None, status: int | None = None) -> str | None:
    """A known provider failure code for an SDK error result, else None."""
    lowered = (text or "").lower()
    if "credit balance" in lowered or "billing" in lowered and "insufficient" in lowered:
        return CREDIT_EXHAUSTED
    if status == 401 or "invalid x-api-key" in lowered or "authentication" in lowered:
        return "provider_auth"
    if status == 429 or "rate limit" in lowered:
        return "provider_rate_limited"
    if status == 529 or "overloaded" in lowered:
        return "provider_overloaded"
    return None


def failure_text(code: str | None) -> str | None:
    """The owner's sentence for a known provider failure, else None."""
    return OWNER_TEXT if (code or "") in _ADMIN_DETAIL else None


def failure_detail(code: str | None) -> str | None:
    """The vendor reason, for logs and admin views only."""
    return _ADMIN_DETAIL.get(code or "")


class ProviderFailure(RuntimeError):
    """An SDK run the provider refused, carrying a code the UI can act on."""

    def __init__(self, code: str, detail: str = ""):
        super().__init__(detail or code)
        self.code = code


__all__ = [
    "CREDIT_EXHAUSTED", "OWNER_TEXT", "PRICES", "ProviderFailure", "classify_failure",
    "estimate_cost", "failure_detail", "failure_text", "reply_cost", "request_cost", "total_cost",
]
