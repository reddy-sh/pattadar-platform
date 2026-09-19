"""Deterministic product-scope policy for Pattadar Assistant.

This gate runs before attachment content is read and before any Claude SDK or MCP
client is constructed. It intentionally favors false negatives: requests that
cannot be shown to be about Pattadar are denied without model interpretation.
"""
from __future__ import annotations

import re
import unicodedata
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

# Fixed routes emitted by the trusted Pattadar shell. Context is never trusted
# merely because the browser supplied an arbitrary /app path.
_TRUSTED_ROUTES = frozenset(
    {
        "/app",
        "/app/parcels",
        "/app/passbooks",
        "/app/properties",
        "/app/documents",
        "/app/deeds",
        "/app/groups",
        "/app/invitations",
        "/app/wallet",
        "/app/sro",
        "/app/stamp-duty",
        "/app/market-value",
        "/app/calculator",
        "/app/notifications",
        "/app/audit",
        "/app/profile",
    }
)
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
    return app_name in _TRUSTED_APPS and path in _TRUSTED_ROUTES


def _contains_product_term(text: str) -> bool:
    tokens = set(_TOKEN_RE.findall(text))
    for term in _PRODUCT_TERMS:
        if " " in term:
            if term in text:
                return True
        elif term in tokens:
            return True
    return False


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
