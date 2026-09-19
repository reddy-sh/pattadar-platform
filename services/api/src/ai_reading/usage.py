"""Prompt-cache marking and per-read token/cost accounting.

Moved verbatim from services/api/src/main.py (AI consolidation, Phase 1). The
`ai.usage` line, its fields and the derived pricing are unchanged.
"""
from __future__ import annotations

import logging

from .config import CACHE_MIN_TOKENS, IMPORT_MODEL

_log = logging.getLogger("pattadar")

# Prompts already checked against the floor, so the notice is logged once per
# prompt rather than once per upload.
_cache_floor_checked: set[int] = set()

def cacheable_system(text: str) -> list[dict]:
    """The system prompt as a single cache-marked block.

    The API takes either a bare string or a list of blocks for `system`;
    caching needs the list form, because the marker rides on a block. One block
    means the breakpoint sits at the end of the whole prompt, which is what we
    want — everything before it (there are no tools on this path) is cached
    together and the document, which follows in `messages`, is not.
    """
    key = hash(text)
    if key not in _cache_floor_checked:
        _cache_floor_checked.add(key)
        # ~3.6 chars/token is rough and runs OPTIMISTIC against Sonnet 5's
        # denser tokenizer, so this under-reports rather than over-reports: a
        # prompt it passes might still be short of the floor. The honest
        # confirmation is cache_write > 0 in the ai.usage line, not this.
        approx = len(text) / 3.6
        if approx < CACHE_MIN_TOKENS:
            _log.info(
                "ai.cache prompt ~%d tok is under the %d-tok floor for %s — the marker is "
                "inert, this prompt bills at full price every time (expect cache_write=0 "
                "and cache_read=0 in its ai.usage lines)",
                approx, CACHE_MIN_TOKENS, IMPORT_MODEL,
            )
    return [{"type": "text", "text": text, "cache_control": {"type": "ephemeral"}}]

# List price in USD per million tokens, keyed by model, because the line this
# feeds prints model=%s beside the dollars — a hardcoded Sonnet 5 rate would go
# on quoting Sonnet 5 money next to whatever model IMPORT_MODEL was changed to,
# and a cost number that lies is worse than no cost number.
# The cache rates are DERIVED (write 1.25x input, read 0.1x input) rather than
# typed out, so they cannot drift away from the input price they follow from.
LIST_PRICE_PER_MTOK = {
    "claude-opus-5":     {"input": 5.0, "output": 25.0},
    "claude-sonnet-5":   {"input": 2.0, "output": 10.0},
    "claude-sonnet-4-6": {"input": 3.0, "output": 15.0},
    "claude-haiku-4-5":  {"input": 1.0, "output": 5.0},
}


def usd_per_mtok(model: str) -> dict:
    """The four token classes priced apart, or zeros for a model we have no
    price for — an unknown model reports usd=0.0000, which reads as "unpriced"
    rather than quietly billing it at the last model's rate."""
    p = LIST_PRICE_PER_MTOK.get(model)
    if not p:
        return {"input": 0.0, "output": 0.0, "cache_write": 0.0, "cache_read": 0.0}
    return {
        "input": p["input"],
        "output": p["output"],
        "cache_write": p["input"] * 1.25,
        "cache_read": p["input"] * 0.1,
    }

def log_usage(body: dict, *, endpoint: str, name: str, attempt: str = "first") -> None:
    """Record what a read actually cost.

    Nothing on this path used to read `usage`, so nobody could say what reading
    a deed cost, which half of the bill was thinking, or whether the cache was
    working at all. That last one matters most: a broken cache is silent — the
    requests still succeed, the bill is just quietly higher — and these four
    numbers are the only ground truth there is. Two consecutive reads of the
    same document type should show cache_read > 0 on the second.

    `input_tokens` is only the UNCACHED remainder, so the prompt total is the
    sum of all three input classes, not that field alone.
    """
    u = body.get("usage") or {}
    read = int(u.get("cache_read_input_tokens") or 0)
    write = int(u.get("cache_creation_input_tokens") or 0)
    fresh = int(u.get("input_tokens") or 0)
    out = int(u.get("output_tokens") or 0)
    rate = usd_per_mtok(IMPORT_MODEL)
    usd = (
        fresh * rate["input"]
        + out * rate["output"]
        + write * rate["cache_write"]
        + read * rate["cache_read"]
    ) / 1_000_000
    _log.info(
        "ai.usage endpoint=%s attempt=%s model=%s file=%s prompt_total=%d "
        "(fresh=%d cache_write=%d cache_read=%d) output=%d stop=%s usd=%.4f",
        endpoint, attempt, IMPORT_MODEL, name or "-",
        fresh + write + read, fresh, write, read, out,
        body.get("stop_reason"), usd,
    )
