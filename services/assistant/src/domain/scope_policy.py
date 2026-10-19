"""Deterministic product-scope policy for Pattadar Assistant.

This gate runs before attachment content is read and before any Claude SDK or MCP
client is constructed. It intentionally favors false negatives: requests that
cannot be shown to be about Pattadar are denied without model interpretation.
"""
from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher
from dataclasses import dataclass
from typing import Any

POLICY_VERSION = "pattadar-scope-v1"
SCOPE_DENIAL_TEXT = (
    "I can only help with Pattadar, land and property records, registration "
    "documents, family holdings, and features available in this app."
)

_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f-\x9f]+")
_SPACE_RE = re.compile(r"\s+")
_TOKEN_RE = re.compile(r"[\w/-]+", re.UNICODE)

# Fixed routes emitted by the trusted Pattadar shell (apps/web/src/routes.tsx,
# the children of the pathless `id: 'app'` layout). Context is never trusted
# merely because the browser supplied an arbitrary path: this is an exact
# allowlist, so "//host", "https://..." and unknown sections all fail. The admin desk is
# left out on purpose: its pages are not land-record context.
_TRUSTED_ROUTES = frozenset(
    {
        "/home",
        "/properties",
        "/holdings",
        "/map",
        "/maps",
        "/shared",
        "/assigned",
        "/services",
        "/order",
        "/papers",
        "/wallet",
        "/account",
        "/groups",
        "/audit",
        "/notifications",
        "/tools",
        "/profile",
        "/invitations",
        "/help",
        "/refer",
    }
)
# The :id routes, matched on their prefix: one id segment and at most one
# known-shaped sub-page (properties/:id/people, holdings/:id/papers, groups/:id,
# papers/shelf/:key, services/:id/pay). No dots, so "/properties/../x" fails.
_TRUSTED_ID_ROUTE = re.compile(
    r"^/(?:properties|holdings|groups|papers|services|heir)/[A-Za-z0-9_-]{1,80}(?:/[A-Za-z0-9_-]{1,80})?$"
)


def is_trusted_route(path: str) -> bool:
    """True for a current signed-in Pattadar route, fixed or id-shaped."""
    path = str(path or "").strip()
    return path in _TRUSTED_ROUTES or bool(_TRUSTED_ID_ROUTE.fullmatch(path))


_TRUSTED_APPS = frozenset({"pattadar", "pattadar platform", "pattadar 360"})

_PRODUCT_TERMS = frozenset(
    {
        "pattadar", "pattadar passbook", "passbook", "land", "parcel", "parcels",
        "property", "properties", "plot", "plots", "flat", "flats", "survey",
        "survey number", "subdivision", "boundary", "boundaries", "acre", "acres",
        "gunta", "guntas", "hectare", "village", "mandal", "district", "sro",
        "sub registrar", "registration", "registered", "deed", "deeds", "sale deed",
        "document", "documents", "rid", "market value", "stamp duty", "encumbrance",
        "mutation", "title", "owner", "ownership", "seller", "buyer", "party",
        "family", "inheritance", "holding", "holdings", "record", "records",
        "notification", "wallet", "invitation", "upload", "attachment", "calculator",
        "rate", "price", "guideline", "navigate", "dashboard", "profile",
        "address", "result", "results", "deed details",
        # Adding public-record deeds to the account (domain/record_drafts.py).
        "add to my properties", "my properties", "your properties", "watch", "watching",
        "watchlist", "watch list", "monitor", "monitoring", "save to my account", "papers",
    }
)
_PRODUCT_INTENTS = frozenset(
    {
        "find", "search", "show", "open", "explain", "summarize", "compare", "calculate",
        "check", "view", "list", "filter", "upload", "download", "read", "identify",
        "resolve", "report", "history", "value", "cost", "fee", "navigate", "go",
    }
)
_SMALL_TALK = frozenset(
    {
        "hi", "hello", "hey", "help", "what can you do", "how can you help",
        "thanks", "thank you", "good morning", "good afternoon", "good evening",
    }
)
# Bare answers to the assistant's own question ("Would you like me to try the
# search again?"). They carry no topic of their own, so they are only accepted
# inside a conversation that already has an accepted Pattadar turn.
_CONVERSATIONAL_REPLIES = frozenset(
    {
        "yes", "yes please", "yeah", "yep", "sure", "ok", "okay", "please do",
        "go ahead", "do it", "no", "no thanks", "not now",
        "try again", "please try again", "try now", "try it now", "check now", "search now", "try it again", "retry", "again",
        "search again", "do that", "continue", "more", "show more",
    }
)

_SHORT_FOLLOWUP_CHARS = 80
_SHORT_FOLLOWUP_WORDS = 10

# Any one of these makes the whole request ineligible, even if product keywords
# are smuggled into another clause.
_DENIED_PATTERNS = tuple(
    re.compile(pattern)
    for pattern in (
        r"\b(politic|politics|politician|election|vote|voting|party manifesto|prime minister|chief minister|president)\b",
        r"\b(code|coding|program|programming|python|javascript|typescript|java|sql query|html|css|react|docker|kubernetes)\b",
        r"\b(write (?:a )?(?:poem|story|song|essay|sonnet)|creative writing|roleplay|joke)\b",
        r"\b(weather|sports?|cricket|movie|celebrity|stock market|cryptocurrency|recipe|travel itinerary)\b",
        r"\b(ignore (?:all |the )?(?:previous|prior|system)|system prompt|developer message|jailbreak|prompt injection|reveal (?:your )?instructions)\b",
        r"\b(pretend you are|act as|bypass|override (?:the )?(?:rules|policy)|hidden prompt)\b",
    )
)
_MIXED_CLAUSE_RE = re.compile(r"(?:\b(?:and|also|then|plus)\b|[;])")
_ATTACHMENT_ONLY_RE = re.compile(
    r"^(?:please\s+)?(?:explain|summarize|read|review|check|what is in|tell me about)\s+"
    r"(?:this|the)?\s*(?:file|document|attachment|image|pdf)?[?.!]*$"
)
_FOLLOWUP_REFERENCE_RE = re.compile(
    r"\b(?:it|that|this|those|these|the same|that one|this one|the record|the parcel|the property|the document)\b"
)


@dataclass(frozen=True)
class ScopeDecision:
    allowed: bool
    reason: str
    normalized_message: str
    policy_version: str = POLICY_VERSION
    trusted_context: bool = False


def normalize_text(value: str) -> str:
    """Normalize Unicode, controls, case, and whitespace for policy matching."""
    normalized = unicodedata.normalize("NFKC", value or "").casefold()
    normalized = _CONTROL_RE.sub(" ", normalized)
    return _SPACE_RE.sub(" ", normalized).strip()


def trusted_application_context(context: dict[str, Any] | None) -> bool:
    """Return true only for a fixed Pattadar app identity and route."""
    if not isinstance(context, dict):
        return False
    app = context.get("app") if isinstance(context.get("app"), dict) else {}
    page = context.get("page") if isinstance(context.get("page"), dict) else {}
    app_name = normalize_text(str(app.get("name") or app.get("id") or ""))
    path = str(page.get("path") or app.get("path") or "").strip().split("?", 1)[0]
    return app_name in _TRUSTED_APPS and is_trusted_route(path)


# Typed on a phone, "prpperites" and "documnets" are still about Pattadar. Only
# long words are compared, so short off-topic words cannot drift onto a term,
# and the denied patterns have already run before this is consulted.
_TYPO_MIN_LENGTH = 6
_TYPO_RATIO = 0.8
_TYPO_TERMS = tuple(
    term for term in _PRODUCT_TERMS if " " not in term and len(term) >= _TYPO_MIN_LENGTH
)


def _is_typo_of_term(token: str) -> bool:
    if len(token) < _TYPO_MIN_LENGTH:
        return False
    return any(
        abs(len(token) - len(term)) <= 2
        and SequenceMatcher(None, token, term).ratio() >= _TYPO_RATIO
        for term in _TYPO_TERMS
    )


def _contains_product_term(text: str) -> bool:
    tokens = set(_TOKEN_RE.findall(text))
    for term in _PRODUCT_TERMS:
        if " " in term:
            if term in text:
                return True
        elif term in tokens:
            return True
    return any(_is_typo_of_term(token) for token in tokens)


def evaluate_scope(
    message: str,
    application_context: dict[str, Any] | None = None,
    *,
    has_authorized_attachment: bool = False,
    has_prior_accepted_turn: bool = False,
) -> ScopeDecision:
    """Classify a request without consulting a model or external service."""
    text = normalize_text(message)
    trusted = trusted_application_context(application_context)

    if not text:
        return ScopeDecision(False, "empty_message", text, trusted_context=trusted)

    for pattern in _DENIED_PATTERNS:
        if pattern.search(text):
            return ScopeDecision(False, "explicitly_denied_domain", text, trusted_context=trusted)

    # Clause splitting prevents "tell me about my parcel and write Python" from
    # passing simply because one half contains a product noun.
    clauses = [part.strip(" ,.!?") for part in _MIXED_CLAUSE_RE.split(text) if part.strip(" ,.!?")]
    if len(clauses) > 1:
        for clause in clauses:
            if any(pattern.search(clause) for pattern in _DENIED_PATTERNS):
                return ScopeDecision(False, "mixed_domain_request", text, trusted_context=trusted)

    if text in _SMALL_TALK:
        return ScopeDecision(True, "product_greeting", text, trusted_context=trusted)

    if _ATTACHMENT_ONLY_RE.fullmatch(text):
        # Request-body page fields are useful context but are not an
        # authentication boundary. Attachment-only requests therefore need a
        # previously accepted Pattadar turn as their product anchor.
        if has_authorized_attachment and has_prior_accepted_turn:
            return ScopeDecision(True, "authorized_attachment_followup", text, trusted_context=trusted)
        return ScopeDecision(False, "unanchored_attachment_request", text, trusted_context=trusted)

    if has_prior_accepted_turn and text.strip(" .!?") in _CONVERSATIONAL_REPLIES:
        return ScopeDecision(True, "conversational_followup", text, trusted_context=trusted)

    # "get again", "show the results again", "and the 2013 one?" — short turns in
    # an already-accepted Pattadar conversation. Listing every phrasing failed in
    # practice, so length bounds the exception instead. The denied patterns above
    # have already run, and the model's own scope rules still apply.
    if (
        has_prior_accepted_turn
        and len(text) <= _SHORT_FOLLOWUP_CHARS
        and len(_TOKEN_RE.findall(text)) <= _SHORT_FOLLOWUP_WORDS
    ):
        return ScopeDecision(True, "short_followup", text, trusted_context=trusted)

    product_term = _contains_product_term(text)
    tokens = set(_TOKEN_RE.findall(text))
    intent = any(intent in tokens for intent in _PRODUCT_INTENTS)

    if product_term:
        return ScopeDecision(True, "product_entity", text, trusted_context=trusted)
    # Follow-ups may omit the noun only when they explicitly refer back to the
    # accepted Pattadar subject. Generic requests never become product-scoped
    # merely because they were sent from a known browser route.
    if has_prior_accepted_turn and intent and _FOLLOWUP_REFERENCE_RE.search(text) and len(text) <= 240:
        return ScopeDecision(True, "referential_product_followup", text, trusted_context=trusted)

    return ScopeDecision(False, "no_product_anchor", text, trusted_context=trusted)
