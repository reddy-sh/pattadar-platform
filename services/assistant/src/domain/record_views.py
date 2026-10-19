"""Public-record tool results the browser renders itself.

A record search used to cost twice: the model read the rows, then typed them
back out as a Markdown table (output tokens are the expensive ones). Instead the
stream hands the browser a bounded, display-only copy of the rows and the model
is told to summarise rather than restate them.

Only results from the internal ``pattadar_records`` server qualify, and the copy
is data, never markup: every cell is a string, number or null, so a value from a
deed cannot become HTML or a browser command.
"""
from __future__ import annotations

import json
from typing import Any

from ..public_records import PUBLIC_RECORD_TOOL_NAMES
from .follow_ups import follow_ups

VIEW_EVENT = "records"
MAX_ROWS = 200
MAX_CELL = 300
MAX_MARKDOWN = 60_000

_RECORDS_PREFIX = "mcp__pattadar_records__"

#: Display order and labels. Keys a tool returns but this map does not name are
#: left out, so internal fields (seq, parse_status) never reach the table.
COLUMNS: tuple[tuple[str, str], ...] = (
    ("matched_name", "Name in deed"),
    # Name similarity to the search (pg_trgm), not proof that it is the same person.
    ("score", "Name match"),
    ("similarity", "Name match"),
    ("side", "Side"),
    # A composed "Plot 5, NALLAPADU SRO area" when the deed left village blank;
    # it replaces the Village column rather than sitting beside it.
    ("location", "Location"),
    ("village", "Village"),
    ("resolved_village", "Village"),
    ("village_norm", "Village"),
    ("survey_no", "Survey number"),
    ("plot_no", "Plot number"),
    ("house_no", "House number"),
    ("transaction_type", "Transaction"),
    ("reg_date", "Registered"),
    ("extent", "Extent"),
    ("market_value", "Government value"),
    ("consideration_value", "Amount in the deed"),
    ("counterparty", "Other party"),
    ("sellers", "Sellers"),
    ("buyers", "Buyers"),
    ("record_count", "Deeds"),
    ("extent_unit", "Per unit"),
    ("n", "Deeds"),
    ("median_rate", "Median rate (₹)"),
    ("avg_rate", "Average rate (₹)"),
    ("min_rate", "Lowest (₹)"),
    ("max_rate", "Highest (₹)"),
    ("document", "Document number"),
    ("sro_name", "SRO"),
    ("boundaries", "Boundaries"),
    ("rid", "RID"),
    ("s_no", "Schedule"),
)
_ROW_KEYS = ("matches", "records", "rates")

_TITLES = {
    "find_properties_by_party": "Deeds naming {name}",
    "get_property_history": "Property history",
    "get_record_by_rid": "Deed {rid}",
    "resolve_village": "Villages matching {name}",
    "get_price_rates": "Price rates",
    "search_semantic_boundaries": "Boundary matches",
    "generate_report": "Report",
}


def _cell(value: Any) -> str | int | float | None:
    if value is None or isinstance(value, bool):
        return None if value is None else str(value).lower()
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, (list, tuple)):
        value = ", ".join(str(item) for item in value if item is not None)
    elif isinstance(value, dict):
        value = json.dumps(value, ensure_ascii=False, default=str)
    text = str(value)
    return text if len(text) <= MAX_CELL else text[: MAX_CELL - 1] + "…"


def _with_extent(row: dict[str, Any]) -> dict[str, Any]:
    # Source units are preserved verbatim; no conversion is ever applied.
    if "extent_val" not in row:
        return row
    value, unit = row.get("extent_val"), row.get("extent_unit")
    merged = {key: item for key, item in row.items() if key not in ("extent_val", "extent_unit")}
    if value is not None:
        merged["extent"] = f"{value:g} {unit}" if isinstance(value, (int, float)) and unit else (
            f"{value} {unit}" if unit else value
        )
    else:
        merged["extent"] = None
    return merged


def _rows_of(payload: Any) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)], {}
    if isinstance(payload, dict):
        for key in _ROW_KEYS:
            rows = payload.get(key)
            if isinstance(rows, list):
                return [row for row in rows if isinstance(row, dict)], payload
    return [], {}


def _report_title(tool_input: dict[str, Any]) -> str:
    def text(key: str) -> str:
        return str(tool_input.get(key) or "").strip()

    if text("party"):
        exact = isinstance(tool_input.get("min_similarity"), (int, float)) and tool_input["min_similarity"] >= 1
        return f"Party report — {text('party')}" + (" (100% matches)" if exact else "")
    if text("rid"):
        return f"Full report — {text('rid')}"
    if text("village") or text("area_sro"):
        return f"Area report — {text('village') or text('area_sro')}"
    return "Report"


def _title(tool: str, tool_input: dict[str, Any]) -> str:
    if tool == "generate_report":
        return _report_title(tool_input)
    template = _TITLES.get(tool, "Records")
    fields = {
        "name": f"“{str(tool_input.get('name') or tool_input.get('party') or '').strip()}”",
        "rid": str(tool_input.get("rid") or "").strip(),
    }
    try:
        return template.format(**fields).strip()
    except (KeyError, IndexError):
        return template


def _party_summary(rows: list[dict[str, Any]], envelope: dict[str, Any]) -> dict[str, Any]:
    """Headline figures for a party search, computed from the raw rows.

    Plain numbers and strings only; the browser draws them as stat cards.
    """
    total = envelope.get("total_matches")
    if not isinstance(total, int) or isinstance(total, bool):
        total = len(rows)

    def number(value: Any) -> float | None:
        return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None

    considerations = [n for n in (number(row.get("consideration_value")) for row in rows) if n is not None]
    dates = sorted(
        str(row["reg_date"]).strip() for row in rows
        if isinstance(row.get("reg_date"), str) and str(row["reg_date"]).strip()
    )
    villages: list[str] = []
    for row in rows:
        village = row.get("village")
        if isinstance(village, str) and village.strip() and village.strip() not in villages:
            villages.append(village.strip())
    total_consideration = sum(considerations) if considerations else None
    if total_consideration is not None and total_consideration.is_integer():
        total_consideration = int(total_consideration)
    return {
        "total_matches": max(total, len(rows)),
        "exact_matches": sum(1 for row in rows if (number(row.get("score")) or 0) >= 0.999),
        "as_buyer": sum(1 for row in rows if row.get("side") == "claimant"),
        "as_seller": sum(1 for row in rows if row.get("side") == "executant"),
        "consideration_total": total_consideration,
        "first_date": dates[0] if dates else None,
        "last_date": dates[-1] if dates else None,
        "villages": [_cell(village) for village in villages[:MAX_ROWS]],
    }


def _count(value: Any) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


def _facets(envelope: dict[str, Any]) -> dict[str, Any]:
    """The party search's refine checkboxes, re-shaped to plain names and counts."""
    raw = envelope.get("facets") if isinstance(envelope.get("facets"), dict) else {}

    def named(key: str, size: int) -> list[dict[str, Any]]:
        items = raw.get(key) if isinstance(raw.get(key), list) else []
        out = []
        for item in items[:size]:
            if isinstance(item, dict) and isinstance(item.get("name"), str) and item["name"].strip():
                out.append({"name": str(_cell(item["name"].strip())), "count": _count(item.get("count"))})
        return out

    confidence = raw.get("confidence") if isinstance(raw.get("confidence"), dict) else {}
    return {
        "villages": named("villages", 15),
        "sros": named("sros", 10),
        "confidence": {key: _count(confidence.get(key)) for key in ("exact", "high", "medium", "low")},
        # True when the counts come from a capped sample of a very common name.
        "sampled": raw.get("sampled") is True,
    }


def _query(envelope: dict[str, Any], tool_input: dict[str, Any]) -> dict[str, Any]:
    """What the party search ran with, so the browser can pre-tick its filters."""
    raw = envelope.get("query") if isinstance(envelope.get("query"), dict) else {}

    def text(value: Any) -> str | None:
        return str(_cell(value.strip())) if isinstance(value, str) and value.strip() else None

    villages = raw.get("villages") if isinstance(raw.get("villages"), list) else []
    similarity = raw.get("min_similarity", tool_input.get("min_similarity"))
    side = raw.get("side") if raw.get("side") in ("claimant", "executant") else None
    return {
        "name": text(raw.get("name")) or text(tool_input.get("name")) or "",
        "villages": [str(_cell(v.strip())) for v in villages[:10] if isinstance(v, str) and v.strip()],
        "sro": text(raw.get("sro")),
        "min_similarity": float(similarity) if isinstance(similarity, (int, float))
        and not isinstance(similarity, bool) else 0.6,
        "side": side,
    }


def record_view(
    qualified_tool_name: str,
    text: str,
    tool_input: dict[str, Any] | None = None,
    view_id: str = "",
    *,
    incognito: bool = True,
    allow_empty: bool = False,
) -> dict[str, Any] | None:
    """A display-only ``records`` event for one record-tool result, or None.

    ``incognito`` (default True, the safe side) withholds the save follow-up.
    ``allow_empty`` returns a zero-row party-search view (with its facets and
    query) instead of None, for the refine endpoint, where "nothing in that
    village" is an answer the checkboxes must still sit on.
    """
    if not qualified_tool_name.startswith(_RECORDS_PREFIX):
        return None
    tool = qualified_tool_name[len(_RECORDS_PREFIX):]
    if tool not in PUBLIC_RECORD_TOOL_NAMES or not text:
        return None
    tool_input = tool_input if isinstance(tool_input, dict) else {}
    title = _title(tool, tool_input)

    if tool == "generate_report":
        markdown = text.strip()
        if not markdown or markdown.startswith(("{", "[")):
            return None
        return {
            "type": VIEW_EVENT,
            "id": view_id,
            "kind": "report",
            "title": title,
            "markdown": markdown[:MAX_MARKDOWN],
        }

    try:
        payload = json.loads(text)
    except (TypeError, ValueError):
        return None  # an error string ("temporarily unavailable") is not a table
    rows, envelope = _rows_of(payload)
    party = tool == "find_properties_by_party"
    if not rows:
        if not (allow_empty and party and isinstance(payload, dict)):
            return None
        return {
            "type": VIEW_EVENT,
            "id": view_id,
            "kind": "table",
            "title": title,
            "columns": [],
            "rows": [],
            "total": 0,
            "note": payload.get("note") if isinstance(payload.get("note"), str) else None,
            "follow_ups": [],
            "summary": _party_summary([], payload),
            "facets": _facets(payload),
            "query": _query(payload, tool_input),
        }
    suggestions = follow_ups(tool, rows, tool_input, incognito=incognito)
    summary = _party_summary(rows, envelope) if party else None
    rows = [_with_extent(row) for row in rows]
    present = {key for row in rows for key in row}
    columns: list[dict[str, str]] = []
    if "location" in present:
        present -= {"village", "village_norm", "resolved_village"}
    for key, label in COLUMNS:
        # First key wins per label, so a tool never gets two "Village" columns.
        if key in present and all(column["label"] != label for column in columns):
            columns.append({"key": key, "label": label})
    if not columns:
        return None
    keys = [column["key"] for column in columns]
    total = envelope.get("total_matches") if isinstance(envelope.get("total_matches"), int) else len(rows)
    note = envelope.get("note") if isinstance(envelope.get("note"), str) else None
    view: dict[str, Any] = {
        "type": VIEW_EVENT,
        "id": view_id,
        "kind": "table",
        "title": title,
        "columns": columns,
        "rows": [{key: _cell(row.get(key)) for key in keys} for row in rows[:MAX_ROWS]],
        "total": max(total, len(rows)),
        "note": note,
        "follow_ups": suggestions,
    }
    if summary is not None:
        view["summary"] = summary
    if party:
        view["facets"] = _facets(envelope)
        view["query"] = _query(envelope, tool_input)
    return view


__all__ = ["COLUMNS", "MAX_ROWS", "VIEW_EVENT", "record_view"]
