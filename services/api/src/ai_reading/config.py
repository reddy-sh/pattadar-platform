"""Model and prompt-cache configuration for AI document readings.

Moved verbatim from services/api/src/main.py (AI consolidation, Phase 1). The
model id, cache floors and their reasoning are unchanged; only the location is.
"""
from __future__ import annotations

# Vision OCR of bilingual (Telugu + English) land records: haiku hallucinates
# Telugu-script names (invents a different name every run at "medium/high"
# confidence). Sonnet reads the Telugu names correctly and stably. Used by EVERY
# reading operation in this module, passbook and registered deed alike.
IMPORT_MODEL = "claude-sonnet-5"

# ── Prompt caching ────────────────────────────────────────────────────
#
# The system prompt is the one part of an extraction request that is
# byte-identical on every call — the same thousands of tokens of deed-reading
# rules, re-billed at full price for every document anybody uploads. Marking it
# cacheable makes the first read write the entry (1.25x) and every read after
# it inside the window pay 0.1x instead of 1x. Entries are scoped to the API
# key rather than to a user, so one pattadar's upload warms the prompt for the
# next one.
#
# Break-even is the SECOND read inside the window: 1.25x + 0.1x < 2x. Below
# that the write premium is a small loss, which is why the default 5-minute TTL
# is the right one here — "ttl": "1h" doubles the write to 2x and then needs
# three reads to pay for itself, and uploads do not arrive in hour-long bursts.
#
# The floor matters more than the marker. claude-sonnet-5 caches nothing under
# 1024 tokens and says nothing when it declines: usage.cache_creation_input_
# tokens simply stays 0. Measured sizes of the five prompts on this path:
#
#   DEED_SYSTEM          ~4,146 tok  ← caches (registered deeds, the big one)
#   PROPERTY_SYSTEM      ~1,289 tok  ← caches, only just
#   PASSBOOK_SYSTEM        ~358 tok  ← below the floor, marker is inert
#   PARCEL_PHOTO_SYSTEM    ~327 tok  ← below the floor, marker is inert
#   AADHAAR_SYSTEM         ~208 tok  ← below the floor, marker is inert
#
# The three short ones are marked anyway: an inert marker costs nothing, and
# these prompts grow — the day one crosses 1024 tokens it should start caching
# without anybody remembering to come back here. log_usage is how we find
# out which ones actually are.
#
# Deliberately NOT cached: the document block itself. It is by far the biggest
# part of the request, but it is different bytes on every upload — caching it
# would pay a 1.25x write on thousands of tokens that is only ever read back if
# the identical file is read twice inside the window. That is a loss on every
# first read, which is nearly all of them.
#
# The per-prompt sizes above are estimates from character counts, and character
# counts are a blunt proxy — so rather than trust them, cacheable_system checks
# each prompt against the floor once and says out loud which ones will never
# cache. That way the answer comes from the running service, not from a comment
# that rots the first time somebody edits a prompt.
CACHE_MIN_TOKENS = {
    "claude-sonnet-5": 1024,
    "claude-sonnet-4-6": 1024,
    "claude-opus-4-7": 2048,
    "claude-haiku-4-5": 4096,
}.get(IMPORT_MODEL, 4096)
