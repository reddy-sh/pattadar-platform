"""Next questions offered under a record result, worked out from the rows.

Suggesting follow-ups through the model would cost a generation per turn; the
rows already say what is worth asking next ("only the 100% matches", "the
history of that survey number", "did you mean this other name?"). Each one is a
plain question the user can tap, which then goes through the same scope gate
and tools as anything typed.
"""
from __future__ import annotations

from typing import Any

MAX_FOLLOW_UPS = 4
#: Questions worked out from the rows; the save offer comes on top of these.
_MAX_QUESTIONS = 3
_EXACT = 0.999
ADD_LABEL = "Add to your properties?"
ADD_EXACT_PROMPT = "Add the deeds where the name matches exactly to my properties."


def _text(value: Any) -> str:
    return str(value).strip() if value not in (None, "") else ""


def _follow_up(label: str, prompt: str) -> dict[str, str]:
    return {"label": label[:90], "prompt": prompt[:240]}


def _party_follow_ups(rows: list[dict[str, Any]], searched: str) -> list[dict[str, str]]:
    exact = [row for row in rows if (row.get("score") or 0) >= _EXACT]
    out: list[dict[str, str]] = []
    name = searched or (_text(exact[0].get("matched_name")) if exact else "")
    if exact and name:
        out.append(_follow_up(
            f"Report on the {len(exact)} exact name {'match' if len(exact) == 1 else 'matches'}?",
            f"Generate a party report for {name} using only the deeds where the name matches exactly.",
        ))
    anchor = next((row for row in exact or rows if _text(row.get("village")) and _text(row.get("survey_no"))), None)
    if anchor:
        survey, village = _text(anchor["survey_no"]), _text(anchor["village"])
        out.append(_follow_up(
            f"Full history of survey {survey}, {village}?",
            f"Show the full property history for survey number {survey} in {village} village.",
        ))
    exact_names = {_text(row.get("matched_name")).upper() for row in exact}
    other = next(
        (_text(row.get("matched_name")) for row in rows
         if _text(row.get("matched_name")) and _text(row.get("matched_name")).upper() not in exact_names),
        "",
    )
    if other:
        out.append(_follow_up(
            f"Are you looking for {other}?",
            f"Show the deeds for {other} only, with a name match of 90% or higher.",
        ))
    return out


def _history_follow_ups(rows: list[dict[str, Any]]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    village = next((_text(row.get("village")) for row in rows if _text(row.get("village"))), "")
    rid = next((_text(row.get("rid")) for row in reversed(rows) if _text(row.get("rid"))), "")
    if rid:
        out.append(_follow_up("Full report on the latest deed?", f"Generate a full report for document {rid}."))
    if village:
        out.append(_follow_up(f"Price rates in {village}?", f"What are the market price rates in {village} village?"))
    return out


def _add_follow_up(tool: str, rows: list[dict[str, Any]]) -> dict[str, str] | None:
    """The save offer: the model answers it with propose_add_records (a card)."""
    if tool == "find_properties_by_party":
        if not any((row.get("score") or 0) >= _EXACT for row in rows):
            return None
        return _follow_up(ADD_LABEL, ADD_EXACT_PROMPT)
    if tool == "get_record_by_rid":
        rid = next((_text(row.get("rid")) for row in rows if _text(row.get("rid"))), "")
        return _follow_up(ADD_LABEL, f"Add deed {rid} to my properties.") if rid else None
    if tool == "get_property_history":
        rid = next((_text(row.get("rid")) for row in reversed(rows) if _text(row.get("rid"))), "")
        return _follow_up(ADD_LABEL, f"Add the latest deed, {rid}, to my properties.") if rid else None
    return None


def follow_ups(
    tool: str,
    rows: list[dict[str, Any]],
    tool_input: dict[str, Any],
    *,
    incognito: bool = True,
) -> list[dict[str, str]]:
    """Up to three tap-to-ask questions for one record result, plus the save
    offer ("Add to your properties?") for deeds when the chat is not incognito.

    ``incognito`` defaults to True so a caller that does not know never offers
    a save; the runtime passes the real flag.
    """
    if not rows:
        return []
    if tool == "find_properties_by_party":
        found = _party_follow_ups(rows, _text(tool_input.get("name")))
    elif tool in ("get_property_history", "get_record_by_rid"):
        found = _history_follow_ups(rows)
    elif tool == "resolve_village":
        village = _text(rows[0].get("village_norm"))
        found = [_follow_up(f"Price rates in {village}?", f"What are the market price rates in {village} village?")] if village else []
    else:
        found = []
    found = found[:_MAX_QUESTIONS]
    offer = None if incognito else _add_follow_up(tool, rows)
    if offer:
        found.append(offer)
    return found[:MAX_FOLLOW_UPS]


CERTIFIED_LABEL = "Order certified copies of these deeds?"
CERTIFIED_PROMPT = "Order certified copies of the deeds saved in this conversation."


def chat_follow_ups(
    *,
    saved_records: int,
    service_requested: bool,
    offered_this_turn: bool,
    incognito: bool = True,
) -> list[dict[str, str]]:
    """Reply-level follow-ups that come from the chat, not from a record view.

    "Request certified copies of these deeds?" is offered only when records
    were saved from this chat's save cards (``saved_records`` counts the saved
    results in r_assistant_proposals), no service request card for them exists
    yet, and this reply did not itself put a save or service card up. The model
    answers it with propose_service_order(records='saved_in_chat'): a card,
    never an order. Never in incognito, which saves nothing.
    """
    if incognito or saved_records < 1 or service_requested or offered_this_turn:
        return []
    return [_follow_up(CERTIFIED_LABEL, CERTIFIED_PROMPT)]


__all__ = [
    "ADD_EXACT_PROMPT", "ADD_LABEL", "CERTIFIED_LABEL", "CERTIFIED_PROMPT", "MAX_FOLLOW_UPS",
    "chat_follow_ups", "follow_ups",
]
