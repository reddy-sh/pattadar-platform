"""Service-request offers: the model names what was asked for, a card prices it,
only the user's click places it.

Pure functions, no I/O. ``propose_service_order`` carries the user's own words
("certified copy", "EC for 30 years") and which records they are about; it
never carries a price, an offer key or an order. The browser card loads the
real catalogue and prices for those records through the user's own session
and places nothing until "Place request" (web orderService / orderServiceBatch
with idempotency key ``asst:<id>:<recordId>:<stakeOrKind>``).

The records are either ids the model names or ``saved_in_chat``: the records
this conversation's save cards stored (r_assistant_proposals results, read
owner-checked by the service, never typed by the model).
"""
from __future__ import annotations

import re
from typing import Any
from uuid import uuid4

SAVED_IN_CHAT = "saved_in_chat"
MAX_SERVICES = 8
MAX_SERVICE_RECORDS = 10
MAX_SERVICE_TEXT = 120
MAX_NOTE = 500
SERVICE_STATUSES = ("draft", "ordered", "partial", "dismissed")

_RECORD_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,64}$")
_WS = re.compile(r"\s+")
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


def _clean(value: Any, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    text = _WS.sub(" ", _CONTROL.sub(" ", value)).strip()
    if not text:
        return None
    return text if len(text) <= limit else text[: limit - 1] + "…"


def parse_service_args(args: Any) -> tuple[list[str], str | list[str], str | None]:
    """(requested, records, note) from the tool input, or ValueError.

    ``records`` is SAVED_IN_CHAT or a de-duplicated list of record ids.
    """
    if not isinstance(args, dict):
        raise ValueError("Pass services and records.")
    raw_services = args.get("services")
    if isinstance(raw_services, str):
        raw_services = [raw_services]
    if not isinstance(raw_services, list):
        raise ValueError("Pass services: what the user asked for, 1-8 short phrases.")
    requested: list[str] = []
    for item in raw_services:
        text = _clean(item, MAX_SERVICE_TEXT)
        if text and text.casefold() not in {r.casefold() for r in requested}:
            requested.append(text)
    if not 1 <= len(requested) <= MAX_SERVICES:
        raise ValueError("Pass services: what the user asked for, 1-8 short phrases.")

    raw_records = args.get("records", SAVED_IN_CHAT)
    records: str | list[str]
    if raw_records == SAVED_IN_CHAT:
        records = SAVED_IN_CHAT
    elif isinstance(raw_records, list):
        ids: list[str] = []
        for item in raw_records:
            rid = item.strip() if isinstance(item, str) else ""
            if not _RECORD_ID.match(rid):
                raise ValueError("Record ids are the user's own record ids (letters, digits, - _ . :).")
            if rid not in ids:
                ids.append(rid)
        if not 1 <= len(ids) <= MAX_SERVICE_RECORDS:
            raise ValueError("Pass 1-10 record ids, or 'saved_in_chat'.")
        records = ids
    else:
        raise ValueError("Pass records: 'saved_in_chat' or a list of the user's record ids.")

    note = _clean(args.get("note"), MAX_NOTE)
    return requested, records, note


def resolve_records(
    records: str | list[str], saved: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """The card's records: [{record_id, title}].

    ``saved`` is what this chat's save cards stored (owner-checked by the
    caller). SAVED_IN_CHAT takes all of them; named ids keep the title a saved
    one has, else null (the browser shows the record's own name).
    """
    titles = {
        str(item["record_id"]): _clean(item.get("title"), 200)
        for item in saved if isinstance(item, dict) and isinstance(item.get("record_id"), str)
    }
    if records == SAVED_IN_CHAT:
        ids = list(titles)
    else:
        ids = list(records)
    return [{"record_id": rid, "title": titles.get(rid)} for rid in ids[:MAX_SERVICE_RECORDS]]


def build_service_proposal(
    records: list[dict[str, Any]], requested: list[str], note: str | None
) -> dict[str, Any] | None:
    if not records or not requested:
        return None
    return {
        "type": "service_proposal",
        "id": str(uuid4()),
        "status": "draft",
        "records": records,
        "requested": requested,
        "note": note,
    }


__all__ = [
    "MAX_NOTE", "MAX_SERVICES", "MAX_SERVICE_RECORDS", "MAX_SERVICE_TEXT", "SAVED_IN_CHAT",
    "SERVICE_STATUSES", "build_service_proposal", "parse_service_args", "resolve_records",
]
