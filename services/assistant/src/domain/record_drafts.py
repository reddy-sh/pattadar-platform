"""Public-record deed rows → the draft a confirmation card shows.

Pure functions, no I/O. The model only ever names deeds by (rid, s_no); every
fact on the card is copied here, in code, from the row the service re-read from
the read-only corpus. A party name or extent the model typed cannot reach the
card except as the record's own text, which the user then sees and confirms.

Nothing here writes anything. The browser saves a draft item only when the user
clicks Save, through their own session (web { saveRecord }).
"""
from __future__ import annotations

import re
from typing import Any
from uuid import uuid4

MAX_PROPOSAL_ITEMS = 10
STAKES = ("owned", "managed", "watch")
PROPOSAL_STATUSES = ("draft", "saved", "partial", "dismissed")

#: Corpus extent_unit → the unit the record card stores. Anything else (cents,
#: sq_meters, guntas...) has no lossless home there, so the extent is left
#: empty and the source figure stays readable in the item's title. Units are
#: never converted.
_UNITS = {
    "acres": "ac", "acre": "ac", "ac": "ac",
    "sq_yards": "sq.yd", "sq_yard": "sq.yd", "sq.yd": "sq.yd", "sqyd": "sq.yd",
    "sq_feet": "sq.ft", "sq_ft": "sq.ft", "sq.ft": "sq.ft", "sqft": "sq.ft",
}
_AGRICULTURAL_CLASSES = frozenset({"DRY", "WET", "AGRICULTURAL", "AGRICULTURE", "GARDEN"})
_AGRICULTURAL_WORDS = re.compile(r"\b(DRY|WET|AGRI\w*|GARDEN|ORCHARD)\b")
_RID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_TEXT = 200
_NAMES = 300
_WS = re.compile(r"\s+")


def _clean(value: Any, limit: int = _TEXT) -> str | None:
    if value is None or isinstance(value, bool):
        return None
    text = _WS.sub(" ", str(value)).strip()
    if not text:
        return None
    return text if len(text) <= limit else text[: limit - 1] + "…"


#: The corpus writes an absent plot, house or flat as "()" or "/". A value with
#: no letter or digit in it is no value: it made "Plot ()" titles and kept a
#: 13-acre holding from reading as farmland.
_HAS_WORD = re.compile(r"[^\W_]")
_EMPTY_PARENS = re.compile(r"\(\s*\)")


def _clean_no(value: Any, limit: int = 60) -> str | None:
    text = _clean(value, limit)
    return text if text and _HAS_WORD.search(text) else None


def _survey(value: Any) -> str | None:
    """'70/3()' → '70/3': the corpus pads survey numbers with empty parens."""
    return _clean_no(_EMPTY_PARENS.sub("", str(value or "")))


#: Public-record transaction class → how the land was got. A class that moves
#: no title (mortgage, receipt, lease, cancellation…) is '' — "not set" —
#: rather than a sale nobody made (services/api record_master.TXN_MODES).
_TXN_MODES = {"SALE": "sale", "GIFT": "gift", "PARTITION": "partition",
              "SETTLEMENT": "settlement", "AGREEMENT_OF_SALE": "agreement",
              "AGREEMENT": "agreement"}


def _names(value: Any) -> str | None:
    if isinstance(value, (list, tuple)):
        return _clean(", ".join(str(name).strip() for name in value if _clean(name)), _NAMES)
    return _clean(value, _NAMES)


def _number(value: Any) -> float | int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = value
    else:
        try:
            number = float(str(value).replace(",", "").strip())
        except (TypeError, ValueError):
            return None
    if number != number or number in (float("inf"), float("-inf")):  # NaN / inf
        return None
    return int(number) if float(number).is_integer() else float(number)


def _iso_date(value: Any) -> str | None:
    text = _clean(value, 40)
    if not text:
        return None
    found = re.match(r"^(\d{4}-\d{2}-\d{2})", text)
    return found.group(1) if found else None


def extent_unit(raw: Any) -> str | None:
    """``ac`` | ``sq.yd`` | ``sq.ft`` for a corpus unit, else None."""
    return _UNITS.get(str(raw or "").strip().lower())


def is_agricultural(row: dict[str, Any]) -> bool:
    land_class = (_clean(row.get("land_class")) or "").upper()
    if land_class in _AGRICULTURAL_CLASSES:
        return True
    if _AGRICULTURAL_WORDS.search((_clean(row.get("property_type")) or "").upper()):
        return True
    # Many deeds leave both blank. An acreage with no plot, house or flat is
    # farmland in this corpus; a plot measured in acres stays a property.
    return (
        not land_class
        and extent_unit(row.get("extent_unit")) == "ac"
        and not any(_clean_no(row.get(key)) for key in ("plot_no", "house_no", "apartment_name"))
    )


def record_kind(row: dict[str, Any]) -> str:
    """``parcel`` for agricultural land with a survey number, else ``property``."""
    return "parcel" if _survey(row.get("survey_no")) and is_agricultural(row) else "property"


def _title(row: dict[str, Any], unit: str | None) -> str:
    """'Sy 70/3 · Katraguntla', 'Plot 70A · Nallapadu', 'H.No 10-104 · …'."""
    village = _clean(row.get("village")) or _clean(row.get("village_full"))
    village = village.title() if village else None
    if _clean_no(row.get("plot_no")):
        head = f"Plot {_clean_no(row.get('plot_no'))}"
    elif _clean_no(row.get("house_no")):
        head = f"H.No {_clean_no(row.get('house_no'))}"
    elif _clean_no(row.get("apartment_name")):
        head = _clean_no(row.get("apartment_name"), _TEXT) or ""
    elif _survey(row.get("survey_no")):
        head = f"Sy {_survey(row.get('survey_no'))}"
    else:
        head = ""
    title = " · ".join(part for part in (head, village) if part)
    if not title:
        doc = _doc_no(row)
        title = f"Deed {doc}" if doc else "Deed"
    raw_value, raw_unit = _number(row.get("extent_val")), _clean(row.get("extent_unit"), 20)
    if unit is None and raw_value is not None:
        # Kept readable rather than converted: "Sy 163, DOLAMADA (12.5 cents)".
        title += f" ({raw_value:g} {raw_unit or 'units'})"
    return _clean(title, 120) or "Deed"


def _doc_no(row: dict[str, Any]) -> str | None:
    number, year = _clean(row.get("doc_no"), 30), _clean(row.get("year"), 8)
    if not number:
        return None
    return f"{number}/{year}" if year and "/" not in number else number


def source_ref(rid: Any, s_no: Any) -> str:
    return f"pr:{str(rid).strip()}:{int(s_no)}"[:64]


def draft_item(row: dict[str, Any], index: int) -> dict[str, Any]:
    """One card item (the C3 ``items[]`` shape) from one corpus row.

    ``buyer_matches_user`` is always None: the service never learns the user's
    display name, so the browser compares the buyer with the signed-in profile.
    """
    unit = extent_unit(row.get("extent_unit"))
    rid = str(row.get("rid") or "").strip()
    s_no = int(row.get("s_no") or 1)
    return {
        "index": index,
        "rid": rid,
        "s_no": s_no,
        "kind": record_kind(row),
        "title": _title(row, unit),
        "village": _clean(row.get("village"), 120) or _clean(row.get("village_full"), 120),
        # The corpus has no mandal or district column; the card leaves them for
        # the user rather than guessing from the SRO.
        "mandal": None,
        "district": None,
        "survey_no": _survey(row.get("survey_no")),
        "extent": _number(row.get("extent_val")) if unit else None,
        "extent_unit": unit,
        "doc_no": _doc_no(row),
        "sro": _clean(row.get("sro_name"), 120),
        "reg_date": _iso_date(row.get("reg_date")),
        "exec_date": _iso_date(row.get("exec_date")),
        "consideration": _number(row.get("consideration_value")),
        # The registry's own value, never the owner's market estimate.
        "govt_value": _number(row.get("market_value")),
        "transaction_type": _clean(row.get("transaction_type"), 60),
        "txn_class": _clean(row.get("txn_class"), 40),
        "acquisition_mode": _TXN_MODES.get((_clean(row.get("txn_class"), 40) or "").upper(), ""),
        "plot_no": _clean_no(row.get("plot_no")),
        "house_no": _clean_no(row.get("house_no")),
        "land_class": _clean(row.get("land_class"), 80),
        "boundary_north": _clean(row.get("boundary_north")),
        "boundary_south": _clean(row.get("boundary_south")),
        "boundary_east": _clean(row.get("boundary_east")),
        "boundary_west": _clean(row.get("boundary_west")),
        "seller_name": _names(row.get("sellers")),
        "buyer_name": _names(row.get("buyers")),
        "source_ref": source_ref(rid, s_no),
        "buyer_matches_user": None,
        "record_id": None,
        "error": None,
    }


def parse_proposal_args(args: Any) -> tuple[list[tuple[str, int | None]], str | None]:
    """Validate the model's ``propose_add_records`` input.

    Returns ([(rid, s_no|None)], stake|None). Raises ValueError with a message
    the model can act on. Only identifiers are accepted, never field values.
    """
    if not isinstance(args, dict):
        raise ValueError("Pass records as a list of {rid, s_no}.")
    records = args.get("records")
    if not isinstance(records, list) or not records:
        raise ValueError("Pass 1 to 10 records as {rid, s_no} from the latest results.")
    if len(records) > MAX_PROPOSAL_ITEMS:
        raise ValueError(f"At most {MAX_PROPOSAL_ITEMS} deeds can be added at once.")
    refs: list[tuple[str, int | None]] = []
    for item in records:
        if not isinstance(item, dict):
            raise ValueError("Each record must be {rid, s_no}.")
        rid = str(item.get("rid") or "").strip()
        if not _RID.fullmatch(rid):
            raise ValueError("A record's rid is missing or malformed.")
        raw = item.get("s_no")
        if raw is None or raw == "":
            s_no = None
        elif isinstance(raw, bool):
            raise ValueError("s_no must be a number.")
        else:
            try:
                s_no = int(raw)
            except (TypeError, ValueError):
                raise ValueError("s_no must be a number.") from None
            if s_no < 0 or s_no > 100_000:
                raise ValueError("s_no is out of range.")
        if (rid, s_no) not in refs:
            refs.append((rid, s_no))
    stake = args.get("stake")
    if stake in (None, ""):
        stake = None
    elif stake not in STAKES:
        raise ValueError("stake must be owned, managed or watch, or left out.")
    return refs, stake


#: The words a user says to name each stake. The card preselects a stake only
#: when the user's own message says it: the model's ``stake`` argument can be
#: steered by deed text it read (a party name or boundary is model input), so
#: it is never enough on its own to make Save a single click.
_STAKE_WORDS = {
    "owned": re.compile(r"\b(mine|i own|we own|i owned|my own|owned by me|belongs to me|is ours|it'?s ours)\b"),
    "managed": re.compile(r"\b(i manage|we manage|managed|managing|i look after|look after it)\b"),
    "watch": re.compile(r"\b(watch|watching|watched|track|tracking|keep an eye)\b"),
}


def user_text(content: Any) -> str:
    """The plain text of one user turn (a string, or content blocks)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(
            str(block.get("text") or "") for block in content
            if isinstance(block, dict) and block.get("type") == "text"
        )
    return ""


def stake_said(stake: Any, text: str) -> str | None:
    """``stake`` when the user's own words name it, else None (no preselection)."""
    if stake not in STAKES:
        return None
    words = _STAKE_WORDS[stake]
    return stake if words.search((text or "").casefold()) else None


def build_proposal(rows: list[dict[str, Any]], stake: str | None) -> dict[str, Any] | None:
    """The ``proposal`` event body for re-read rows, or None when there are none."""
    items: list[dict[str, Any]] = []
    seen: set[tuple[str, int]] = set()
    for row in rows:
        key = (str(row.get("rid") or ""), int(row.get("s_no") or 1))
        if not key[0] or key in seen:
            continue
        seen.add(key)
        items.append(draft_item(row, len(items)))
        if len(items) == MAX_PROPOSAL_ITEMS:
            break
    if not items:
        return None
    return {
        "type": "proposal",
        "id": str(uuid4()),
        "status": "draft",
        "stake": stake if stake in STAKES else None,
        "items": items,
    }


__all__ = [
    "MAX_PROPOSAL_ITEMS", "PROPOSAL_STATUSES", "STAKES", "build_proposal", "draft_item",
    "extent_unit", "is_agricultural", "parse_proposal_args", "record_kind", "source_ref",
    "stake_said", "user_text",
]
