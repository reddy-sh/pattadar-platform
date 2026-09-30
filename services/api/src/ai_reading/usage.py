"""Prompt-cache marking and per-read token/cost accounting.

Moved verbatim from services/api/src/main.py (AI consolidation, Phase 1). The
`ai.usage` line, its fields and the derived pricing are unchanged.
"""
from __future__ import annotations

import logging
import os

from .config import CACHE_MIN_TOKENS, IMPORT_MODEL

_log = logging.getLogger("pattadar")

# Prompts already checked against the floor, so the notice is logged once per
# prompt rather than once per upload.
_cache_floor_checked: set[int] = set()


def safe_file_label(name: str | None) -> str:
    """A non-PII label for telemetry: extension only, never user filename."""
    ext = os.path.splitext(str(name or ""))[1].lower()
    return f"document{ext}" if ext and len(ext) <= 10 and ext[1:].isalnum() else "document"

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

def log_usage(body: dict, *, endpoint: str, name: str, attempt: str = "first") -> dict:
    """Record what a read actually cost, AND hand the same numbers back.

    Nothing on this path used to read `usage`, so nobody could say what reading
    a deed cost, which half of the bill was thinking, or whether the cache was
    working at all. That last one matters most: a broken cache is silent — the
    requests still succeed, the bill is just quietly higher — and these four
    numbers are the only ground truth there is. Two consecutive reads of the
    same document type should show cache_read > 0 on the second.

    `input_tokens` is only the UNCACHED remainder, so the prompt total is the
    sum of all three input classes, not that field alone.

    The log line is the operator's copy and is unchanged. The returned dict is
    the owner's copy: a reading carries it through to the client so the "What
    this document says" panel can show what that one read cost. `usd` is list
    price for `model`, pre-margin, and is 0.0 for a model we have no price for —
    the caller decides whether an owner sees the dollars or only the tokens.
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
        endpoint, attempt, IMPORT_MODEL, safe_file_label(name),
        fresh + write + read, fresh, write, read, out,
        body.get("stop_reason"), usd,
    )
    return {
        "model": IMPORT_MODEL,
        # The whole prompt, priced or not: fresh is only the uncached remainder.
        "input_tokens": fresh + write + read,
        "output_tokens": out,
        # Kept apart so a client that wants to can show the cache at work; a
        # second read of the same document type shows cache_read_tokens > 0.
        "cache_write_tokens": write,
        "cache_read_tokens": read,
        "usd": round(usd, 4),
    }


def merge_usage(first: dict, second: dict) -> dict:
    """Two paid calls for one reading add up; the low-effort retry does not
    replace the first attempt, it follows it, and the owner paid for both.

    Model is kept from whichever names one (they are the same call), and the
    dollars are re-rounded once at the end so summing four-decimal figures does
    not drift a hundredth."""
    return {
        "model": second.get("model") or first.get("model") or IMPORT_MODEL,
        "input_tokens": first["input_tokens"] + second["input_tokens"],
        "output_tokens": first["output_tokens"] + second["output_tokens"],
        "cache_write_tokens": first["cache_write_tokens"] + second["cache_write_tokens"],
        "cache_read_tokens": first["cache_read_tokens"] + second["cache_read_tokens"],
        "usd": round(first["usd"] + second["usd"], 4),
    }
