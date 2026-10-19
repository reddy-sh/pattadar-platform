"""The property master record: one logical record per property, filled by every
source to the degree it can, with each source's claim kept.

Design: docs/specs/2026-10-11-property-overview.md §0. The value a screen reads
stays in the column it always lived in (parcels / properties / the parcel's
passbook), so every existing reader — cards, Properties, iOS — is unchanged.
What this module adds is `record_field_claims`: one row per (field, source,
source_ref), and a fixed precedence rule that decides which claim is the value
in the column. A disagreement is kept and shown, never overwritten silently.

`apply_claims` and `set_acquisition` are the ONLY writers of master fields and
of the acquiring transfer. Every path — the assistant's public-record save, a
deed upload, a passbook reading, the owner's own edit — goes through them, in
the caller's transaction. The source kind is decided by the server (web360),
never taken from the client.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional

import psycopg

try:                                    # inside the `src` package
    from .ids import uuid7
except ImportError:                     # imported bare off src/
    from ids import uuid7               # type: ignore[no-redef]


# ── Schema (additive, idempotent; run from web360's boot DDL) ─────────

_BOTH = ("lp_no", "ulpin", "old_survey_no", "land_class", "registered", "exec_date",
         "acquired_by_transfer_id")

DDL = [
    *(f"ALTER TABLE properties ADD COLUMN IF NOT EXISTS {c} TEXT NOT NULL DEFAULT ''"
      for c in ("state", "subdivision", "plot_no", "door_no")),
    "ALTER TABLE properties ADD COLUMN IF NOT EXISTS stamp_duty DOUBLE PRECISION NOT NULL DEFAULT 0",
    *(f"ALTER TABLE {t} ADD COLUMN IF NOT EXISTS {c} TEXT NOT NULL DEFAULT ''"
      for t in ("parcels", "properties") for c in _BOTH),
    "ALTER TABLE passbooks ADD COLUMN IF NOT EXISTS passbook_no TEXT NOT NULL DEFAULT ''",
    *(f"ALTER TABLE record_transfers ADD COLUMN IF NOT EXISTS {c} TEXT NOT NULL DEFAULT ''"
      for c in ("registered", "exec_date", "source_ref", "proof_no")),
    *(f"ALTER TABLE record_transfers ADD COLUMN IF NOT EXISTS {c} DOUBLE PRECISION NOT NULL DEFAULT 0"
      for c in ("consideration", "govt_value")),
    *(f"ALTER TABLE record_transfer_parties ADD COLUMN IF NOT EXISTS {c} TEXT NOT NULL DEFAULT ''"
      for c in ("role", "relationship")),
    """CREATE TABLE IF NOT EXISTS record_field_claims (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        record_id TEXT NOT NULL,
        field TEXT NOT NULL,
        source TEXT NOT NULL,
        source_ref TEXT NOT NULL DEFAULT '',
        label TEXT NOT NULL DEFAULT '',
        value TEXT NOT NULL DEFAULT '',
        confidence TEXT NOT NULL DEFAULT '',
        wins BOOLEAN NOT NULL DEFAULT false,
        set_by TEXT NOT NULL DEFAULT '',
        set_at TEXT NOT NULL DEFAULT ''
    )""",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_record_field_claims"
    " ON record_field_claims (record_id, field, source, source_ref)",
    "CREATE INDEX IF NOT EXISTS idx_record_field_claims_owner"
    " ON record_field_claims (owner_user_id, record_id)",
]


# ── Vocabulary ────────────────────────────────────────────────────────

SOURCES = ("manual", "deed_reading", "public_record", "passbook_reading", "legacy")
CONVEYANCE = ("deed_reading", "public_record", "passbook_reading", "legacy")
REVENUE = ("passbook_reading", "deed_reading", "public_record", "legacy")
LEGACY_LABEL = "Entered before sources were kept"
MANUAL_LABEL = "You entered"

MODES = ("sale", "gift", "inheritance", "partition", "settlement", "will", "govt_grant",
         "agreement", "unregistered_sale", "other")
MODE_LABELS = {"sale": "Sale", "gift": "Gift", "inheritance": "Inheritance",
               "partition": "Partition", "settlement": "Settlement", "will": "Will",
               "govt_grant": "Government grant", "agreement": "Agreement",
               "unregistered_sale": "Unregistered sale", "other": "Other"}
#: Older words the columns already hold (properties default 'purchase', the
#: passbook prompt's 'grant'), read as the mode they mean. Never rewritten.
_MODE_ALIASES = {"purchase": "sale", "grant": "govt_grant", "government": "govt_grant"}
#: Public-record transaction class → mode. A class that transfers no title
#: (mortgage, receipt, lease, cancellation…) is '' — "not set" — on purpose.
TXN_MODES = {"SALE": "sale", "GIFT": "gift", "PARTITION": "partition",
             "SETTLEMENT": "settlement", "AGREEMENT_OF_SALE": "agreement",
             "AGREEMENT": "agreement"}
#: Deed reading doc_types that are not a deed at all — refused by fileDeedReading.
NOT_DEEDS = frozenset({"Pattadar Passbook", "ROR/Adangal", "FMB", "Tax Receipt", "Map",
                       "Aadhaar", "PAN", "Photo", "Encumbrance Certificate"})


def mode_for_txn_class(txn_class: str) -> str:
    return TXN_MODES.get((txn_class or "").strip().upper(), "")


# ── The public record a `pr:<rid>:<s_no>` ref names ───────────────────

#: Read-only. Module-level so a test can point it at its own schema.
PR_TABLE = "land.real_estate_records"
_EMPTY_PARENS = re.compile(r"\(\s*\)")
_HAS_WORD = re.compile(r"[^\W_]")
_PR_REF = re.compile(r"^pr:([A-Za-z0-9_-]{1,64}):(\d{1,6})$")


def no_value(value) -> str:
    """The corpus writes an absent plot/house/survey as '()' or '/': no value."""
    text = _EMPTY_PARENS.sub("", " ".join(str(value or "").split())).strip()
    return text if _HAS_WORD.search(text) else ""


async def public_record_row(conn, ref: str) -> Optional[dict]:
    """The deed row a `pr:` ref names, or None when it names none (or the
    corpus is not readable from here). A client cannot label its own values
    'public record' with a ref that resolves to nothing (A3)."""
    m = _PR_REF.match(ref or "")
    if not m:
        return None
    try:
        async with conn.transaction():      # a savepoint: a missing table or grant must not abort the save
            cur = await conn.execute(f"SELECT * FROM {PR_TABLE} WHERE rid=%s AND s_no=%s",
                                     (m.group(1), int(m.group(2))))
            return await cur.fetchone()
    except psycopg.Error:
        return None


_AGRI = re.compile(r"\b(DRY|WET|AGRI\w*|GARDEN|ORCHARD|WETLAND|DRYLAND)\b")


def pr_classification(row: dict, kind: str) -> str:
    """The kind of land the deed row itself says, or '' when it does not say."""
    words = " ".join(str(row.get(k) or "") for k in ("land_class", "property_type")).upper()
    if kind == "parcel" or _AGRI.search(words):
        return "agri"      # the assistant files a deed as a parcel only when it reads as farmland
    for word, cls in (("APARTMENT", "flat"), ("FLAT", "flat"), ("COMMERCIAL", "commercial"),
                      ("HOUSE", "house"), ("SITE", "open_plot"), ("OPENPLACE", "open_plot"),
                      ("PLOT", "open_plot")):
        if word in words:
            return cls
    return ""


def pr_reads_as_farmland(row: dict) -> bool:
    """The deed row measures the land in acres and names no plot or house."""
    return (str(row.get("extent_unit") or "").lower() == "acres"
            and not no_value(row.get("plot_no")) and not no_value(row.get("house_no")))


def farmland_reason(prop: dict, pr_row: Optional[dict]) -> str:
    """Why a `properties` row reads as farmland saved as a plot, in the owner's
    words — '' when it does not, or when it has a building (D1). The Overview
    offers "keep it as agricultural land in acres?" on this; it never moves
    the record by itself."""
    if float(prop.get("builtup_area") or 0) > 0 or (prop.get("type") or "") in _BUILT + ("house",):
        return ""
    if no_value(prop.get("door_no")) or no_value(prop.get("plot_no")):
        return ""
    if pr_row and pr_reads_as_farmland(pr_row):
        return "The public record measures it in acres and names no plot or house"
    if (prop.get("type") or "") == "agri":
        return "Its kind of land is agricultural"
    if _AGRI.search(str(prop.get("land_class") or "").upper()):
        return f"Its land class is {str(prop.get('land_class')).strip().lower()}"
    return ""


def pr_values(row: dict, kind: str) -> tuple:
    """(field values, raw corpus text per field, title values) for one deed row."""
    survey = no_value(row.get("survey_no"))
    vals = {"village": no_value(row.get("village")), "land_class": no_value(row.get("land_class")),
            "classification": pr_classification(row, kind)}
    raw = {"survey_no": str(row.get("survey_no") or "")}
    if kind == "parcel":
        vals["survey_no"], vals["subdivision"] = split_survey(survey)
    else:
        vals["survey_no"] = survey
        vals["plot_no"], vals["door_no"] = no_value(row.get("plot_no")), no_value(row.get("house_no"))
        raw["plot_no"], raw["door_no"] = str(row.get("plot_no") or ""), str(row.get("house_no") or "")
    for side in ("north", "south", "east", "west"):
        vals[f"boundary_{side}"] = no_value(row.get(f"boundary_{side}"))
    unit = {"acres": "ac", "sq_yards": "sq.yd", "sq_feet": "sq.ft"}.get(
        str(row.get("extent_unit") or "").lower(), "")
    if unit and row.get("extent_val"):
        v = float(row["extent_val"])
        if kind == "parcel" and unit != "ac":
            v, unit = (v / 4840.0 if unit == "sq.yd" else v / 43560.0), "ac"
        elif kind == "property" and unit == "ac":
            v, unit = v * 4840.0, "sq.yd"
        vals["builtup_area" if kind == "property" and unit == "sq.ft" else "extent"] = \
            f"{_num_text(v)} {unit}"
    doc = str(row.get("doc_no") or "").strip()
    year = str(row.get("year") or "").strip()
    acq = {"acquisition_mode": mode_for_txn_class(row.get("txn_class") or ""),
           "registered": "yes", "doc_no": f"{doc}/{year}" if doc and year and "/" not in doc else doc,
           "reg_date": str(row.get("reg_date") or ""), "exec_date": str(row.get("exec_date") or ""),
           "sro": no_value(row.get("sro_name")),
           "consideration": float(row.get("consideration_value") or 0),
           "govt_value": float(row.get("market_value") or 0)}
    return vals, raw, acq


def pr_agrees(row: dict, kind: str, values: dict) -> set:
    """The keys of `values` whose value is what the deed row itself says.
    Only those may carry the public record's name; the rest are the owner's."""
    vals, _, acq = pr_values(row, kind)
    return agrees({**vals, **acq}, kind, values)


def agrees(known: dict, kind: str, values: dict) -> set:
    """The keys of `values` whose value is what a source (`known`) itself says.
    A value the owner changed from the source's is theirs, not the source's (B1)."""
    out = set()
    for key, v in values.items():
        f = FIELDS.get(key)
        if f is None or key not in known:
            continue
        try:
            mine, theirs = clean(f, v, kind), clean(f, known[key], kind)
        except ValueError:
            continue
        if mine and same(f, mine, theirs):
            out.add(key)
    return out


def mode_for_doc_type(doc_type: str) -> str:
    """The deed reader's doc_type as a mode (the web's transferKindOf, moved
    here): anything unrecognised is a sale, as most registered conveyances are."""
    d = (doc_type or "").lower()
    for word, mode in (("gift", "gift"), ("partition", "partition"),
                       ("settlement", "settlement"), ("heir", "inheritance"),
                       ("succession", "inheritance"), ("will", "will")):
        if word in d:
            return mode
    return "sale"


@dataclass(frozen=True)
class Field:
    key: str
    group: str                 # identity | physical | title | status
    label: str
    typ: str                   # text | survey | date | amount | extent | enum | bool
    order: str                 # conveyance | revenue — whose machine claim ranks first
    parcel: Optional[tuple]    # (table, column) or None when it does not apply
    prop: Optional[tuple]
    how: str = ""
    limit: int = 200
    choices: tuple = ()

    def target(self, kind: str) -> Optional[tuple]:
        return self.parcel if kind == "parcel" else self.prop


def _F(key, group, label, typ, order, parcel, prop, how="", limit=200, choices=()):
    return Field(key, group, label, typ, order, parcel, prop, how, limit, choices)


_PB, _PA, _PR = "passbooks", "parcels", "properties"
_LIST = [
    # Identity
    _F("state", "identity", "State", "text", "revenue", (_PB, "state"), (_PR, "state"),
       "Andhra Pradesh or Telangana — on your passbook or 1-B"),
    _F("district", "identity", "District", "text", "revenue", (_PB, "district"), (_PR, "district"),
       "Upload the 1-B or passbook, or type it"),
    _F("mandal", "identity", "Mandal", "text", "revenue", (_PB, "mandal"), (_PR, "city"),
       "Upload the 1-B or passbook, or type it"),
    _F("village", "identity", "Village", "text", "revenue", (_PB, "village"), (_PR, "locality"),
       "Upload the deed or 1-B"),
    _F("survey_no", "identity", "Survey number", "survey", "conveyance",
       (_PA, "survey_no"), (_PR, "survey_no"), "On the deed's schedule or the 1-B", 60),
    _F("subdivision", "identity", "Subdivision", "survey", "conveyance",
       (_PA, "subdivision"), (_PR, "subdivision"), "On the 1-B, after the survey number", 60),
    _F("lp_no", "identity", "LP number", "text", "revenue", (_PA, "lp_no"), (_PR, "lp_no"),
       "From your Adangal or 1-B (Mee Bhoomi), if your village is resurveyed", 60),
    _F("ulpin", "identity", "ULPIN", "text", "revenue", (_PA, "ulpin"), (_PR, "ulpin"),
       "The 14-character land parcel number on a resurveyed 1-B", 40),
    _F("old_survey_no", "identity", "Old survey number", "survey", "revenue",
       (_PA, "old_survey_no"), (_PR, "old_survey_no"),
       "The survey number before resurvey, on the resurvey 1-B", 60),
    _F("khata_no", "identity", "Khata / patta number", "text", "revenue",
       (_PB, "pattadar_no"), (_PR, "khata_no"), "Upload the 1-B or passbook", 60),
    _F("passbook_no", "identity", "Passbook number", "text", "revenue",
       (_PB, "passbook_no"), None, "Printed on the passbook's first page", 60),
    _F("plot_no", "identity", "Plot number", "text", "conveyance", None, (_PR, "plot_no"),
       "On the deed's schedule or the layout plan", 60),
    _F("door_no", "identity", "Door / house number", "text", "conveyance", None, (_PR, "door_no"),
       "On the tax receipt or deed", 60),
    _F("assessment_no", "identity", "Property tax assessment (PTIN)", "text", "conveyance",
       None, (_PR, "ghmc_assessment_no"), "On your property tax receipt", 60),
    # Physical
    _F("extent", "physical", "Extent", "extent", "conveyance", (_PA, "extent"), (_PR, "land_area"),
       "On the deed's schedule or the 1-B"),
    # A built property's floor area is a different fact from its land: a deed's
    # yards never replace it, and it never zeroes the land (A7).
    _F("builtup_area", "physical", "Built-up area", "extent", "conveyance", None,
       (_PR, "builtup_area"), "On the building plan, tax receipt or sale deed"),
    _F("classification", "physical", "Kind of land", "text", "revenue",
       (_PA, "classification"), (_PR, "type"), "Agricultural, house site, flat…", 40),
    _F("land_class", "physical", "Wet / dry", "text", "revenue",
       (_PA, "land_class"), (_PR, "land_class"), "Metta (dry) or magani (wet), on the 1-B", 80),
    *(_F(f"boundary_{s}", "physical", f"{s.title()} boundary", "text", "conveyance",
         (_PA, f"boundary_{s}"), (_PR, f"boundary_{s}"), "On the deed's schedule", 500)
      for s in ("north", "south", "east", "west")),
    # Title
    _F("acquisition_mode", "title", "How acquired", "enum", "conveyance",
       (_PA, "acquisition_source"), (_PR, "acquisition_mode"),
       "Upload the deed, or tell us how you got it", choices=MODES),
    _F("registered", "title", "Registered", "enum", "conveyance",
       (_PA, "registered"), (_PR, "registered"), "", choices=("yes", "no")),
    _F("doc_no", "title", "Document number", "text", "conveyance",
       (_PA, "reg_doc_no"), (_PR, "reg_doc_no"), "On the deed's registration endorsement", 60),
    _F("reg_date", "title", "Registered on", "date", "conveyance",
       (_PA, "reg_date"), (_PR, "reg_date"), "On the deed's registration endorsement"),
    _F("exec_date", "title", "Executed on", "date", "conveyance",
       (_PA, "exec_date"), (_PR, "exec_date"), "On the deed's first page"),
    _F("sro", "title", "Registration office", "text", "conveyance",
       (_PA, "sro"), (_PR, "sro"), "The Sub-Registrar office on the deed", 120),
    _F("consideration", "title", "Consideration", "amount", "conveyance",
       (_PA, "purchase_price"), (_PR, "purchase_price"), "The price written in the deed"),
    _F("govt_value", "title", "Government value", "amount", "conveyance",
       (_PA, "guideline_value"), (_PR, "guideline_value"), "The market value the registrar used"),
    _F("stamp_duty", "title", "Stamp duty", "amount", "conveyance",
       (_PA, "stamp_duty"), (_PR, "stamp_duty"), "On the deed's registration endorsement"),
    _F("stake", "title", "Your stake", "enum", "conveyance", (_PA, "stake"), (_PR, "stake"),
       "", choices=("owned", "managed", "watch")),
    # Status — the owner's word only in v1.
    _F("ec_status", "status", "Encumbrance check", "text", "conveyance",
       (_PA, "ec_status"), (_PR, "ec_status"), "From an EC search", 120),
    _F("ec_date", "status", "EC checked on", "date", "conveyance",
       (_PA, "ec_date"), (_PR, "ec_date"), ""),
    _F("encumbrance_status", "status", "Encumbrance", "text", "conveyance",
       (_PA, "encumbrance_status"), None, "", 120),
    _F("mutation_status", "status", "Mutation", "text", "conveyance",
       (_PA, "mutation_status"), (_PR, "mutation_status"), "", 120),
    _F("litigation", "status", "Court case", "bool", "conveyance",
       (_PA, "litigation"), (_PR, "litigation"), "", choices=("yes", "no")),
    _F("litigation_note", "status", "Court case note", "text", "conveyance",
       (_PA, "litigation_note"), (_PR, "litigation_note"), "", 500),
]
FIELDS: dict = {f.key: f for f in _LIST}
TITLE_KEYS = ("acquisition_mode", "registered", "doc_no", "reg_date", "exec_date", "sro",
              "consideration", "govt_value", "stamp_duty")
#: What each machine source can know. Anything else a save carries alongside
#: one of them was typed by the owner, and is claimed as theirs.
SOURCE_KEYS = {
    "public_record": {"village", "survey_no", "subdivision", "plot_no", "door_no", "extent",
                      "builtup_area", "land_class", "classification", "boundary_north", "boundary_south", "boundary_east",
                      "boundary_west", *TITLE_KEYS},
    "passbook_reading": {"state", "district", "mandal", "village", "survey_no", "subdivision",
                         "khata_no", "passbook_no", "extent", "classification", "land_class",
                         "acquisition_mode"},
    "deed_reading": {"district", "mandal", "village", "survey_no", "subdivision", "plot_no",
                     "extent", "builtup_area", "land_class", "boundary_north", "boundary_south",
                     "boundary_east", "boundary_west", *TITLE_KEYS},
}
_BUILT = ("flat", "independent_house", "villa", "commercial", "shop", "rental")
_SQYD_PER_AC = 4840.0
_SQFT_PER_SQYD = 9.0


# ── Values: validate, normalise, show ─────────────────────────────────

_WS = re.compile(r"\s+")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_EXTENT = re.compile(r"^\s*([0-9]+(?:\.[0-9]+)?)\s*(ac|sq\.yd|sq\.ft)?\s*$", re.I)
_AMOUNT_MAX = 1e12


def _num_text(x: float) -> str:
    x = round(float(x), 4)
    return str(int(x)) if x.is_integer() else f"{x:.4f}".rstrip("0").rstrip(".")


#: Wet / dry is the revenue soil class, not the land type: a deed's
#: "agricultural" went into it (founder screenshot, 12/10/2026).
#: Whole words, dry first: "unirrigated", "non-irrigated", "not wet" and
#: "rain-fed" are dry, and "drainage" says nothing.
_WET_DRY = ((re.compile(r"\b(metta|dry\w*|un-?irrigated|non-?irrigated|not\s+(wet|irrigated)"
                        r"|rain(-?fed)?)\b"), "Dry (metta)"),
            (re.compile(r"\b(magani|wet\w*|irrigated|irrigation)\b"), "Wet (magani)"),
            (re.compile(r"\b(gardens?|orchards?)\b"), "Garden"))


def _wet_dry(text: str) -> str:
    t = text.lower()
    for pattern, label in _WET_DRY:
        if pattern.search(t):
            return label
    raise ValueError("Wet / dry is dry (metta), wet (magani) or garden")


def clean(f: Field, raw, kind: str = "parcel") -> str:
    """The claim's stored text for `raw`, or ValueError saying why not.
    '' means "no value" — never a claim."""
    if raw is None:
        return ""
    if f.typ == "amount":
        if isinstance(raw, str):
            raw = raw.replace(",", "").replace("₹", "").strip()
            if not raw:
                return ""
        try:
            v = float(raw)
        except (TypeError, ValueError):
            raise ValueError(f"{f.label} must be an amount") from None
        if v != v or v < 0 or v > _AMOUNT_MAX:
            raise ValueError(f"{f.label} must be between 0 and 1,00,000 crore")
        return "" if v == 0 else _num_text(round(v, 2))
    text = _WS.sub(" ", str(raw)).strip()
    if not text:
        return ""
    if f.key == "land_class":
        return _wet_dry(text)
    if f.typ == "extent":
        m = _EXTENT.match(text.replace(",", ""))
        if not m:
            raise ValueError("Extent must be a number with ac, sq.yd or sq.ft")
        v = float(m.group(1))
        unit = (m.group(2) or ("sq.ft" if f.key == "builtup_area" else "ac" if kind == "parcel"
                               else "sq.yd")).lower()
        if f.key == "builtup_area" and unit != "sq.ft":
            raise ValueError("Built-up area is in sq.ft")
        if v <= 0 or v > 1e9:
            raise ValueError("Extent must be more than 0")
        return f"{_num_text(v)} {unit}"
    if f.typ == "date":
        if not _DATE.match(text):
            raise ValueError(f"Enter {f.label.lower()} as DD/MM/YYYY")
        try:
            day = date.fromisoformat(text)
        except ValueError:
            raise ValueError(f"{f.label} is not a real date") from None
        if day > date.today() or day.year < 1800:
            raise ValueError(f"{f.label} must be between 1800 and today")
        return text
    if f.typ in ("enum", "bool"):
        word = text.lower()
        if f.key == "acquisition_mode":
            word = _MODE_ALIASES.get(word, word)
        if word not in f.choices:
            raise ValueError(f"{f.label} must be one of: {', '.join(f.choices)}")
        return word
    if len(text) > f.limit:
        raise ValueError(f"{f.label} is too long")
    return text


def _sq_yd(value: str) -> float:
    num, _, unit = value.partition(" ")
    v = float(num or 0)
    return v * _SQYD_PER_AC if unit == "ac" else v / _SQFT_PER_SQYD if unit == "sq.ft" else v


def same(f: Field, a: str, b: str) -> bool:
    """Two claim values say the same thing (spec §0.4 normalising)."""
    if f.typ == "bool":
        # The column cannot tell "not stated" from "no": both are false (A11).
        return (a or "no") == (b or "no")
    if a == b:
        return True
    if not a or not b:
        return False
    if f.typ == "extent":
        x, y = _sq_yd(a), _sq_yd(b)
        return abs(x - y) <= 0.005 * max(x, y)
    if f.typ == "amount":
        return round(float(a)) == round(float(b))
    a, b = _WS.sub(" ", a).strip().casefold(), _WS.sub(" ", b).strip().casefold()
    if f.typ == "survey":
        a, b = a.replace("-", "/").replace(" ", ""), b.replace("-", "/").replace(" ", "")
    return a == b


def _inr(v: float) -> str:
    """₹12,34,567 — Indian grouping."""
    n = int(round(v))
    s = str(n)
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        head = ",".join([head[max(0, i - 2):i] for i in range(len(head), 0, -2)][::-1])
        s = f"{head},{tail}"
    return f"₹{s}"


_CLASS_WORDS = {"agri": "Agricultural land", "open_plot": "Open plot", "house": "House",
                "flat": "Flat", "apartment": "Apartment", "shop": "Shop",
                "commercial": "Commercial building"}


def _grouped(v: float) -> str:
    """63162 → 63,162 (Indian grouping); a fraction keeps its plain digits."""
    return _inr(v)[1:] if float(v).is_integer() else _num_text(v)


def display(f: Field, value: str) -> str:
    if not value:
        return ""
    if f.typ == "date":
        return f"{value[8:10]}/{value[5:7]}/{value[0:4]}"
    if f.typ == "amount":
        return _inr(float(value))
    if f.key == "acquisition_mode":
        return MODE_LABELS.get(value, value)
    if f.typ in ("enum", "bool") and value in ("yes", "no"):
        return value.title()
    if f.key == "stake":
        return {"owned": "Owned", "managed": "Managed", "watch": "Watching"}.get(value, value)
    if f.key == "classification":
        # Same words as the web's classWord (apps/web/src/w360/ui.tsx CLASS_WORD).
        return _CLASS_WORDS.get(value) or value.replace("_", " ").capitalize()
    if f.typ == "extent":
        num, _, unit = value.partition(" ")
        v = float(num)
        if unit == "ac":
            return f"{v:.2f} ac = {v * 0.404686:.3f} ha"
        if unit == "sq.yd":
            return f"{_grouped(v)} sq.yd = {v * 0.836127:.2f} sq.m"
        return f"{_grouped(v)} sq.ft = {v * 0.092903:.2f} sq.m"
    return value


# ── Reading and writing the columns ───────────────────────────────────

async def _rows(conn, rid: str, kind: str) -> tuple:
    if kind == "parcel":
        cur = await conn.execute("SELECT * FROM parcels WHERE id=%s", (rid,))
        row = await cur.fetchone() or {}
        cur = await conn.execute("SELECT * FROM passbooks WHERE id=%s", (row.get("passbook_id") or "",))
        return row, (await cur.fetchone() or {})
    cur = await conn.execute("SELECT * FROM properties WHERE id=%s", (rid,))
    return (await cur.fetchone() or {}), {}


def _column_text(f: Field, kind: str, row: dict, pb: dict) -> str:
    target = f.target(kind)
    if not target:
        return ""
    if f.typ == "extent":
        if kind == "parcel":
            v = float(row.get("extent") or 0)
            return f"{_num_text(round(v, 4))} ac" if v > 0 else ""
        v = float(row.get(target[1]) or 0)
        return f"{_num_text(v)} {'sq.ft' if f.key == 'builtup_area' else 'sq.yd'}" if v > 0 else ""
    table, col = target
    v = (pb if table == _PB else row).get(col)
    if f.typ == "amount":
        return _num_text(round(float(v or 0), 2)) if float(v or 0) else ""
    if f.typ == "bool":
        return "yes" if v else ""
    text = _WS.sub(" ", str(v or "")).strip()
    if f.key == "acquisition_mode":
        text = _MODE_ALIASES.get(text.lower(), text.lower())
    return text


async def current(conn, rid: str, kind: str) -> dict:
    """Every master field's value as the columns hold it, in claim text form."""
    row, pb = await _rows(conn, rid, kind)
    return {k: _column_text(f, kind, row, pb) for k, f in FIELDS.items() if f.target(kind)}


async def own_passbook(conn, parcel_id: str) -> str:
    """The parcel's passbook id, split off first when other parcels share it —
    a value written for one parcel must not move its siblings. The clone
    carries every column the original had (group_id, photo, passbook_no…)."""
    cur = await conn.execute("SELECT passbook_id FROM parcels WHERE id=%s", (parcel_id,))
    pb_id = ((await cur.fetchone()) or {}).get("passbook_id") or ""
    cur = await conn.execute("SELECT count(*) AS c FROM parcels WHERE passbook_id=%s", (pb_id,))
    if int(((await cur.fetchone()) or {}).get("c") or 0) <= 1:
        return pb_id
    import uuid as _uuid
    new_id = f"pb-{_uuid.uuid4().hex[:12]}"
    cur = await conn.execute(
        "SELECT column_name FROM information_schema.columns"
        " WHERE table_name='passbooks' AND table_schema=current_schema() AND column_name<>'id'")
    cols = ", ".join(r["column_name"] for r in await cur.fetchall())
    await conn.execute(
        f"INSERT INTO passbooks (id, {cols}) SELECT %s, {cols} FROM passbooks WHERE id=%s",
        (new_id, pb_id))
    await conn.execute("UPDATE parcels SET passbook_id=%s WHERE id=%s", (new_id, parcel_id))
    return new_id


async def _passbook_shared(conn, parcel_id: str) -> bool:
    cur = await conn.execute(
        "SELECT count(*) AS c FROM parcels WHERE passbook_id=(SELECT passbook_id FROM parcels"
        " WHERE id=%s)", (parcel_id,))
    return int(((await cur.fetchone()) or {}).get("c") or 0) > 1


async def _write(conn, rid: str, kind: str, f: Field, value: str, split: bool = True) -> None:
    if f.typ == "extent":
        if kind == "parcel":
            ac = _sq_yd(value) / _SQYD_PER_AC if value else 0.0
            await conn.execute("UPDATE parcels SET extent=%s WHERE id=%s", (ac, rid))
        elif f.key == "builtup_area":
            await conn.execute("UPDATE properties SET builtup_area=%s WHERE id=%s",
                               (float(value.split(" ")[0]) if value else 0.0, rid))
        else:
            # The land, in the yards the column holds; the built-up figure is
            # its own field and is never touched here.
            await conn.execute("UPDATE properties SET land_area=%s WHERE id=%s",
                               (_sq_yd(value) if value else 0.0, rid))
        return
    table, col = f.target(kind)
    py = (float(value or 0) if f.typ == "amount" else value == "yes" if f.typ == "bool"
          else value)
    if table == _PB:
        pb_id = await own_passbook(conn, rid) if split else (await (await conn.execute(
            "SELECT passbook_id FROM parcels WHERE id=%s", (rid,))).fetchone() or {}).get(
            "passbook_id") or ""
        await conn.execute(f"UPDATE passbooks SET {col}=%s WHERE id=%s", (py, pb_id))
    else:
        await conn.execute(f"UPDATE {table} SET {col}=%s WHERE id=%s", (py, rid))


# ── Claims and precedence ─────────────────────────────────────────────

def _now() -> str:
    return datetime.now().isoformat(timespec="microseconds")


def rank(f: Field, source: str) -> int:
    """0 is strongest. The owner's own entry beats every machine source."""
    if source == "manual":
        return 0
    order = REVENUE if f.order == "revenue" else CONVEYANCE
    return 1 + order.index(source) if source in order else 9


def winner(f: Field, claims: list) -> Optional[dict]:
    if not claims:
        return None
    # Strongest source first; within one source kind the newer claim.
    newest = sorted(claims, key=lambda c: c["set_at"], reverse=True)
    return sorted(newest, key=lambda c: rank(f, c["source"]))[0]


def conflicts(f: Field, claims: list, win: Optional[dict]) -> list:
    """Differing claims set after the winning one. Older losers are history."""
    if not win:
        return []
    return [c for c in claims if c["id"] != win["id"] and c["set_at"] > win["set_at"]
            and not same(f, c["value"], win["value"])]


async def claims_for(conn, uid: str, rid: str, field: str = "") -> list:
    cur = await conn.execute(
        "SELECT * FROM record_field_claims WHERE owner_user_id=%s AND record_id=%s"
        + (" AND field=%s" if field else "") + " ORDER BY set_at",
        (uid, rid, field) if field else (uid, rid))
    return list(await cur.fetchall())


async def _upsert(conn, uid, rid, key, source, ref, label, value, confidence, set_at=None):
    await conn.execute(
        "INSERT INTO record_field_claims (id, owner_user_id, record_id, field, source,"
        " source_ref, label, value, confidence, wins, set_by, set_at)"
        " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,false,%s,%s)"
        " ON CONFLICT (record_id, field, source, source_ref) DO UPDATE SET"
        " label=EXCLUDED.label, value=EXCLUDED.value, confidence=EXCLUDED.confidence,"
        " set_by=EXCLUDED.set_by,"
        # A document re-stating what it already said is not news: it keeps its
        # place in time, so re-filing a reading raises no fresh conflict. The
        # owner re-asserting ("Keep mine") always is.
        " set_at=CASE WHEN EXCLUDED.source<>'manual'"
        " AND record_field_claims.value=EXCLUDED.value"
        " THEN record_field_claims.set_at ELSE EXCLUDED.set_at END",
        (uuid7(), uid, rid, key, source, ref, label, value, confidence, uid, set_at or _now()))


async def _settle(conn, uid, rid, kind, f: Field, log) -> Optional[dict]:
    """Recompute the field's winner, mark it, and write the column when the
    winner differs from what the column holds."""
    claims = await claims_for(conn, uid, rid, f.key)
    win = winner(f, claims)
    row, pb = await _rows(conn, rid, kind)
    old = _column_text(f, kind, row, pb)
    split = True
    if (win and win["source"] != "manual" and kind == "parcel" and f.target(kind)[0] == _PB
            and not same(f, old, win["value"]) and await _passbook_shared(conn, rid)):
        # A machine claim never splits a khata its sibling parcels share (B3):
        # a blank cell is filled for all of them; a value they hold stays,
        # and the claim waits for the owner as a conflict ("Use this" is
        # their call, and only that splits the passbook).
        split = False
        if old:
            held = next((c for c in reversed(claims) if same(f, c["value"], old)), None)
            if held is None:
                await _upsert(conn, uid, rid, f.key, "legacy", "", LEGACY_LABEL, old, "",
                              set_at="0000")
                held = next(c for c in await claims_for(conn, uid, rid, f.key)
                            if c["source"] == "legacy" and c["source_ref"] == "")
            win = held
    await conn.execute(
        "UPDATE record_field_claims SET wins=(id=%s) WHERE owner_user_id=%s AND record_id=%s"
        " AND field=%s", (win["id"] if win else "", uid, rid, f.key))
    if not win:
        return None
    if not same(f, old, win["value"]):
        await _write(conn, rid, kind, f, win["value"], split=split)
        if log and (old or win["source"] == "manual"):
            await log(f.label, display(f, old), display(f, win["value"]), win["label"])
    return win


async def apply_claims(conn, uid: str, rid: str, kind: str, *, source: str,
                       source_ref: str = "", label: str = "", values: dict,
                       confidence: Optional[dict] = None, fresh: bool = False,
                       before: Optional[dict] = None, force: bool = False,
                       log=None) -> list:
    """Record `source`'s claims and settle each field. Returns the keys left in
    conflict. Runs in the caller's transaction.

    - manual (`source='manual'`) is strict: an unknown key or a bad value is
      refused. A machine source's bad value is skipped — one misread date must
      not stop a deed from filing.
    - An empty value is never a machine claim. The owner clearing a field is their
      own entry that the field is empty, which wins like any other.
    - The owner re-sending an unchanged value is not an assertion (a drawer
      sends the whole form); `force` makes it one ("Keep mine").
    - `fresh`: the record was just inserted with these values.
    - `before`: the values before the caller wrote columns itself.
    - `log(label, was, now, via)`: called when a non-empty value is replaced.
    """
    if source not in SOURCES:
        raise ValueError("Unknown source")
    strict = source == "manual"
    label = label or (MANUAL_LABEL if strict else "")
    now_vals = before if before is not None else (
        {} if fresh else await current(conn, rid, kind))
    touched = []
    for key, raw in values.items():
        f = FIELDS.get(key)
        if f is None or not f.target(kind):
            if strict:
                raise ValueError(f"{key} is not a field of this property" if f is None
                                 else f"{f.label} does not apply to this property")
            continue
        try:
            value = clean(f, raw, kind)
        except ValueError:
            if strict:
                raise
            continue
        if key == "extent" and kind == "property" and value.endswith(" sq.ft"):
            # Square feet on a property is its floor area, not its land (A7).
            key, f = "builtup_area", FIELDS["builtup_area"]
        old = now_vals.get(key, "")
        if not value and (not strict or not (old or force)):
            # A source that does not know a fact cannot blank it. Only the
            # owner clearing a value is a claim — that it is empty — and it
            # wins like any other entry of theirs.
            continue
        if not fresh:
            claims = await claims_for(conn, uid, rid, key)
            if strict and not force and same(f, old, value) and (claims or old):
                continue
            if not claims and old and not same(f, old, value):
                # The value predates sources; keep it as a claim before it is outranked.
                await _upsert(conn, uid, rid, key, "legacy", "", LEGACY_LABEL, old, "",
                              set_at="0000")
        await _upsert(conn, uid, rid, key, source, source_ref, label, value,
                      (confidence or {}).get(key, ""),
                      # Unsourced values sit below every source in time too.
                      set_at="0000" if source == "legacy" else None)
        touched.append(f)
    left = []
    for f in touched:
        win = await _settle(conn, uid, rid, kind, f, log)
        if conflicts(f, await claims_for(conn, uid, rid, f.key), win):
            left.append(f.key)
    return left


async def note_claims(conn, uid: str, rid: str, kind: str, *, source: str, source_ref: str,
                      label: str, values: dict) -> None:
    """Keep what a source said for fields the owner then entered differently,
    as history: no settle, so it never decides a value. Call BEFORE the
    owner's claims, so theirs is the newer and no conflict is raised (B1)."""
    for key, raw in values.items():
        f = FIELDS.get(key)
        if f is None or not f.target(kind):
            continue
        try:
            value = clean(f, raw, kind)
        except ValueError:
            continue
        if value:
            await _upsert(conn, uid, rid, key, source, source_ref, label, value, "")


# ── The acquiring transfer ────────────────────────────────────────────

#: Title field → its column on record_transfers (stamp duty and mode have none).
_TRANSFER_COLS = {"doc_no": "deed_no", "sro": "sro", "reg_date": "registered_on",
                  "registered": "registered", "exec_date": "exec_date",
                  "consideration": "consideration", "govt_value": "govt_value"}


async def sync_transfer(conn, uid: str, rid: str, kind: str, keys) -> None:
    """The record's title fields and its acquiring transfer are one event: an
    owner's edit of a title field through setRecordFields (a clear included)
    says the same on the transfer (C1)."""
    cols = {k: c for k, c in _TRANSFER_COLS.items() if k in keys}
    if not cols:
        return
    table = "parcels" if kind == "parcel" else "properties"
    cur = await conn.execute(f"SELECT acquired_by_transfer_id AS t FROM {table} WHERE id=%s", (rid,))
    tid = ((await cur.fetchone()) or {}).get("t") or ""
    if not tid:
        return
    now = await current(conn, rid, kind)
    sets = {c: (float(now.get(k) or 0) if c in ("consideration", "govt_value") else now.get(k, ""))
            for k, c in cols.items()}
    await conn.execute(
        "UPDATE record_transfers SET " + ", ".join(f"{c}=%s" for c in sets)
        + " WHERE id=%s AND owner_user_id=%s", (*sets.values(), tid, uid))

_TRANSFER_SOURCE = {"manual": "manual", "deed_reading": "reading",
                    "passbook_reading": "reading", "public_record": "public_records",
                    "legacy": "manual"}
PARTY_MAX = 20


def clean_parties(parties, strict: bool) -> list:
    """Allow-listed party fields only — never an Aadhaar or PAN."""
    parties = list(parties or [])
    if len(parties) > PARTY_MAX:
        if strict:
            raise ValueError(f"At most {PARTY_MAX} parties")
        parties = parties[:PARTY_MAX]
    out = []
    for p in parties:
        name = _WS.sub(" ", str(p.get("name") or "")).strip()
        if not name:
            if strict:
                raise ValueError("Each party needs a name")
            continue
        num, den = int(p.get("share_num") or 0), int(p.get("share_den") or 0)
        if not ((num, den) == (0, 0) or 0 < num <= den <= 10000):
            if strict:
                raise ValueError("A share must be like 1/2")
            num = den = 0
        row = {"name": name[:200],
               "parentage": _WS.sub(" ", str(p.get("parentage") or "")).strip()[:200],
               "address": _WS.sub(" ", str(p.get("address") or "")).strip()[:300],
               "role": _WS.sub(" ", str(p.get("role") or "")).strip()[:40],
               "relationship": _WS.sub(" ", str(p.get("relationship") or "")).strip()[:80],
               "share_num": num, "share_den": den,
               "extent": float(p.get("extent") or 0),
               "extent_unit": str(p.get("extent_unit") or "")[:20],
               "is_gpa": bool(p.get("is_gpa"))}
        if strict and any(len(str(p.get(k) or "")) > 200 for k in ("name", "parentage")):
            raise ValueError("A party name is too long")
        out.append(row)
    return out


async def _transfer_for(conn, uid, rid, source, source_ref) -> dict:
    if source_ref:
        cur = await conn.execute(
            "SELECT * FROM record_transfers WHERE owner_user_id=%s AND record_id=%s"
            " AND source_ref=%s LIMIT 1", (uid, rid, source_ref))
        return await cur.fetchone() or {}
    if source == "manual":
        # The owner's account of how they hold the land is about the SAME
        # event the record already names: the acquiring transfer, whatever
        # source filed it, is edited in place (its identity — source, ref,
        # deed — stays); else their own only one; else the record's only one.
        # A second, manual copy read as a false "Earlier owners (1)" (A5).
        cur = await conn.execute(
            "SELECT t.* FROM record_transfers t WHERE t.owner_user_id=%s AND t.record_id=%s"
            " ORDER BY t.sort, t.created_at", (uid, rid))
        every = list(await cur.fetchall())
        cur = await conn.execute(
            "SELECT acquired_by_transfer_id AS t FROM parcels WHERE id=%s UNION ALL"
            " SELECT acquired_by_transfer_id FROM properties WHERE id=%s", (rid, rid))
        held = ((await cur.fetchone()) or {}).get("t") or ""
        mine = [t for t in every if t["source"] == "manual" and not t.get("source_ref")]
        return next((t for t in every if t["id"] == held),
                    mine[0] if len(mine) == 1 else every[0] if len(every) == 1 else {})
    return {}


_PARTY_KEEP = ("parentage", "address", "role", "relationship", "extent", "extent_unit",
               "is_gpa", "owner_id")


async def _put_transfer(conn, uid, rid, existing, *, kind, source, source_ref, acq,
                        note, deed_document_id, verified, parties, prior_id="",
                        clear=()) -> str:
    """Write one transfer. On an existing transfer this is a MERGE (A6): a
    blank value, a 0 amount, an empty note or document is "not stated" and
    keeps what the row holds; `clear` names title keys the caller explicitly
    empties. `parties` is {side: [(party, owner_id)]} — a side that is not
    given keeps its rows; a given side is replaced, each party keeping the
    attributes (address, extent, GPA…) the input does not state. `verified`
    None keeps the row's. Source and source_ref are the row's identity and
    never change on an edit."""
    now = _now()
    cols = {"deed_no": acq.get("doc_no", ""), "sro": acq.get("sro", ""),
            "registered_on": acq.get("reg_date", ""), "registered": acq.get("registered", ""),
            "exec_date": acq.get("exec_date", ""),
            "consideration": float(acq.get("consideration") or 0),
            "govt_value": float(acq.get("govt_value") or 0),
            "proof_no": acq.get("proof_no", "")}
    title_col = _TRANSFER_COLS
    if existing:
        tid = existing["id"]
        sets = {c: v for c, v in cols.items() if v not in ("", 0, 0.0)}
        for key in clear:
            col = title_col.get(key)
            if col:
                sets[col] = 0.0 if col in ("consideration", "govt_value") else ""
        if kind:
            sets["kind"] = kind
        if deed_document_id:
            sets["deed_document_id"] = deed_document_id
        if note:
            sets["note"] = note
        if verified is not None:
            sets["verified"] = verified
        if prior_id:
            sets["prior_transfer_id"] = prior_id
        if sets:
            await conn.execute(
                "UPDATE record_transfers SET " + ", ".join(f"{c}=%s" for c in sets)
                + " WHERE id=%s", (*sets.values(), tid))
    else:
        tid = uuid7()
        await conn.execute(
            "INSERT INTO record_transfers (id, owner_user_id, record_id, kind, deed_document_id,"
            " deed_no, sro, registered_on, note, source, verified, registered, exec_date,"
            " consideration, govt_value, source_ref, proof_no, prior_transfer_id, sort, created_at)"
            " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,"
            " (SELECT count(*)+1 FROM record_transfers WHERE record_id=%s), %s)",
            (tid, uid, rid, kind or "other", deed_document_id, cols["deed_no"], cols["sro"],
             cols["registered_on"], note, _TRANSFER_SOURCE[source], bool(verified),
             cols["registered"], cols["exec_date"], cols["consideration"], cols["govt_value"],
             source_ref, cols["proof_no"], prior_id, rid, now))
    for side, rows in parties.items():
        cur = await conn.execute(
            "SELECT * FROM record_transfer_parties WHERE transfer_id=%s AND side=%s",
            (tid, side))
        had = {(r["name"] or "").lower(): r for r in await cur.fetchall()}
        await conn.execute("DELETE FROM record_transfer_parties WHERE transfer_id=%s AND side=%s",
                           (tid, side))
        for sort, (p, owner_id) in enumerate(rows, start=1):
            old = had.get(p["name"].lower(), {})
            keep = {k: (p.get(k) if k != "owner_id" else owner_id) or old.get(k) or ""
                    for k in _PARTY_KEEP}
            num, den = (p["share_num"], p["share_den"]) if p["share_den"] else (
                int(old.get("share_num") or 0), int(old.get("share_den") or 0))
            to = side == "to"
            await conn.execute(
                "INSERT INTO record_transfer_parties (id, owner_user_id, transfer_id, side, owner_id,"
                " name, parentage, address, extent, extent_unit, share_num, share_den, is_gpa,"
                " role, relationship, sort, created_at)"
                " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (uuid7(), uid, tid, side, keep["owner_id"], p["name"], keep["parentage"],
                 keep["address"], float(keep["extent"] or 0) if to else 0,
                 keep["extent_unit"] if to else "", num if to else 0, den if to else 0,
                 bool(keep["is_gpa"]), keep["role"], keep["relationship"], sort, now))
    return tid


async def _owner_rows(conn, uid, rid, from_parties, to_parties, via) -> dict:
    """The People tab's chain (record_owners), as _chain_from_deed wrote it:
    the giving side as former owners, the receiving side current. A name
    already on the record is linked, not added twice."""
    cur = await conn.execute(
        "SELECT id, lower(name) AS n FROM record_owners WHERE owner_user_id=%s AND record_id=%s",
        (uid, rid))
    have = {r["n"]: r["id"] for r in await cur.fetchall()}
    cur = await conn.execute("SELECT coalesce(max(sort),0) AS s FROM record_owners WHERE record_id=%s",
                             (rid,))
    sort = int(((await cur.fetchone()) or {}).get("s") or 0)
    ids = {}
    now = _now()
    import uuid as _uuid
    for side, parties in (("from", from_parties), ("to", to_parties)):
        for p in parties:
            key = p["name"].lower()
            if key in have:
                ids[(side, key)] = have[key]
                continue
            sort += 1
            oid = f"ro-{_uuid.uuid4().hex[:12]}"
            current_owner = side == "to"
            role = "Owner" if current_owner else (p["role"].title() if p["role"] else "Seller")
            await conn.execute(
                "INSERT INTO record_owners (id, owner_user_id, record_id, name, parentage,"
                " address, role, is_current, acquired_via, sort, created_at)"
                " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (oid, uid, rid, p["name"], p["parentage"], p["address"], role, current_owner,
                 via if current_owner else "", sort, now))
            have[key] = ids[(side, key)] = oid
    return ids


async def set_acquisition(conn, uid: str, rid: str, kind: str, *, source: str,
                          source_ref: str = "", label: str = "", acq: dict,
                          from_parties=None, to_parties=None, deed_document_id: str = "",
                          prior: Optional[dict] = None, note: str = "", fresh: bool = False,
                          confidence: Optional[dict] = None, verified: Optional[bool] = True,
                          manual_keys=(), log=None, transfer_ref: Optional[str] = None) -> str:
    """How the current holder got the land: the title fields (through
    apply_claims) and the acquiring transfer with its parties, together.
    Returns the transfer id, or '' when nothing names an event.

    - A blank or 0 value is "not stated" for both the claims and the transfer
      (A13); clearing a value is setRecordFields'. One exception: the owner
      saying the land is NOT registered empties its document number, date and
      office, which an unregistered acquisition cannot have.
    - A side of parties given as None is kept as it is.
    - `manual_keys`: title keys this save carries that its source does not
      vouch for — claimed as the owner's own entry instead (A3).
    - A Watching record keeps the land's facts only: no party names reach the
      transfer or the People chain (spec 2026-10-04 §5 q6).
    - `transfer_ref` keys the transfer when it differs from the claims' ref:
      a deed reading is ONE event whether it was filed with the record or
      with its paper, so its transfer is keyed by the reading job (B2)."""
    strict = source == "manual"
    tref = source_ref if transfer_ref is None else transfer_ref
    label = label or (MANUAL_LABEL if strict else "")
    title = {}
    for k in TITLE_KEYS:
        try:
            title[k] = clean(FIELDS[k], acq.get(k), kind)
        except ValueError:
            if strict:
                raise
            title[k] = ""
    title["proof_no"] = _WS.sub(" ", str(acq.get("proof_no") or "")).strip()[:80]
    clear = ()
    if title["registered"] == "no":
        clear = ("doc_no", "reg_date", "sro")
        for k in clear:
            title[k] = ""
    stated = {k: v for k, v in title.items() if k in TITLE_KEYS and v}
    theirs = {k: v for k, v in stated.items() if k not in manual_keys}
    mine = {k: v for k, v in stated.items() if k in manual_keys}
    if strict and clear:
        mine.update({k: "" for k in clear})     # the owner's explicit "none"
    if theirs:
        await apply_claims(conn, uid, rid, kind, source=source, source_ref=source_ref,
                           label=label, values=theirs, fresh=fresh,
                           confidence=confidence, log=log)
    if mine:
        await apply_claims(conn, uid, rid, kind, source="manual", values=mine, fresh=fresh,
                           log=log)
    table = "parcels" if kind == "parcel" else "properties"
    cur = await conn.execute(f"SELECT stake, acquired_by_transfer_id AS t FROM {table} WHERE id=%s",
                             (rid,))
    rec = (await cur.fetchone()) or {}
    watched = rec.get("stake") == "watch"
    froms = None if from_parties is None or watched else clean_parties(from_parties, strict)
    tos = None if to_parties is None or watched else clean_parties(to_parties, strict)
    mode = title["acquisition_mode"]
    if not (froms or tos or title["doc_no"] or mode or title["proof_no"]):
        return ""
    prior_id = ""
    if prior and (prior.get("number") or prior.get("original_seller")):
        ref = f"{tref}:prior" if tref else ""
        existing = await _transfer_for(conn, uid, rid, source, ref) if ref else {}
        names = {} if watched else {
            "from": clean_parties([{"name": prior.get("original_seller")}], False),
            "to": clean_parties([{"name": prior.get("original_buyer")}], False)}
        reg = str(prior.get("registration_date") or "")
        prior_id = await _put_transfer(
            conn, uid, rid, existing, kind="sale", source=source, source_ref=ref,
            acq={"doc_no": str(prior.get("number") or "")[:60],
                 "sro": str(prior.get("office") or "")[:120],
                 "reg_date": reg if _DATE.match(reg) else ""},
            note="The earlier deed, as this deed names it", deed_document_id="",
            verified=False, parties={side: [(p, "") for p in ps] for side, ps in names.items()})
    doc = title["doc_no"]
    word = MODE_LABELS.get(mode, "")
    via = (f"{word} deed {doc}" if doc and mode in ("sale", "gift", "partition", "settlement")
           else f"Document {doc}" if doc else word)
    owner_ids = await _owner_rows(conn, uid, rid, froms or [], tos or [], via)
    existing = await _transfer_for(conn, uid, rid, source, tref)
    parties = {}
    if froms is not None:
        parties["from"] = [(p, owner_ids.get(("from", p["name"].lower()), "")) for p in froms]
    if tos is not None:
        parties["to"] = [(p, owner_ids.get(("to", p["name"].lower()), "")) for p in tos]
    if watched and existing:
        parties = {"from": [], "to": []}     # names an earlier save left on a now-watched record go
    tid = await _put_transfer(
        # A machine source with no mode names a deed that moves no title ('other');
        # the owner leaving it blank keeps what the transfer says.
        conn, uid, rid, existing, kind=mode or ("" if strict else "other"), source=source,
        source_ref=tref,
        acq=title, note=note, deed_document_id=deed_document_id,
        verified=None if strict and existing else verified,
        parties=parties, prior_id=prior_id, clear=clear if strict else ())
    # This transfer is how the land is held when its title claim is the one in force.
    cur = await conn.execute(
        "SELECT source, source_ref FROM record_field_claims WHERE owner_user_id=%s"
        " AND record_id=%s AND field IN ('acquisition_mode','doc_no') AND wins"
        " ORDER BY field", (uid, rid))
    wins = await cur.fetchall()
    held = rec.get("t") or ""
    # The owner's own account of it always is (precedence rule 1).
    if strict or not held or any(w["source"] == source and w["source_ref"] == source_ref
                                 for w in wins):
        await conn.execute(f"UPDATE {table} SET acquired_by_transfer_id=%s WHERE id=%s", (tid, rid))
    return tid


async def owner_wrote(conn, uid: str, rid: str, kind: str, before: dict) -> None:
    """A legacy editor (root updateProperty / updateParcel / updatePassbook,
    used by iOS and Expo) wrote master columns directly. What it changed is
    the owner's own entry: claim it as `manual`, so a later settle keeps it
    instead of reverting it to an older winner (A12). Call after the write,
    in the same transaction, with `current()` read before it."""
    after = await current(conn, rid, kind)
    for key, value in after.items():
        if value == before.get(key, ""):
            continue
        f = FIELDS[key]
        if before.get(key) and not await claims_for(conn, uid, rid, key):
            await _upsert(conn, uid, rid, key, "legacy", "", LEGACY_LABEL, before[key], "",
                          set_at="0000")
        await _upsert(conn, uid, rid, key, "manual", "", MANUAL_LABEL, value, "")
        await _settle(conn, uid, rid, kind, f, None)


# ── The Overview read ─────────────────────────────────────────────────

def _source(c: Optional[dict], papers: frozenset = frozenset()) -> Optional[dict]:
    """A claim's source for the Overview. A deed reading names its paper only
    once fileDeedReading bound it (its ref is then a documents id, in
    `papers`); before that the ref is the reading's job id, said as such."""
    if not c:
        return None
    reading = c["source"] == "deed_reading"
    return {"source": c["source"], "label": c["label"], "source_ref": c["source_ref"],
            "document_id": c["source_ref"] if reading and c["source_ref"] in papers else "",
            "reading_job_id": c["source_ref"] if reading and c["source_ref"] not in papers else "",
            "set_at": c["set_at"] if c["set_at"] != "0000" else "",
            "confidence": c["confidence"]}


def _important(key: str, kind: str, vals: dict, built: bool) -> bool:
    if kind == "parcel":
        if key in ("survey_no", "khata_no", "extent", "classification", "acquisition_mode",
                   "lp_no", "ulpin"):
            return True
        return key == "doc_no" and vals.get("registered") == "yes"
    if key in ("extent", "acquisition_mode", "doc_no"):
        return True
    if key == "plot_no":
        return not built
    return key in ("door_no", "assessment_no") and built


async def overview(conn, uid: str, rid: str, kind: str) -> dict:
    """Fields with their source and conflicts, the acquisition, and what is missing."""
    row, pb = await _rows(conn, rid, kind)
    by_field: dict = {}
    for c in await claims_for(conn, uid, rid):
        by_field.setdefault(c["field"], []).append(c)
    refs = list({c["source_ref"] for cs in by_field.values() for c in cs
                 if c["source"] == "deed_reading" and c["source_ref"]})
    cur = await conn.execute("SELECT id FROM documents WHERE owner_user_id=%s AND id = ANY(%s)",
                             (uid, refs)) if refs else None
    papers = frozenset(r["id"] for r in await cur.fetchall()) if cur else frozenset()
    vals = {k: _column_text(f, kind, row, pb) for k, f in FIELDS.items() if f.target(kind)}
    built = kind == "property" and (float(row.get("builtup_area") or 0) > 0
                                    or (row.get("type") or "") in _BUILT)
    fields, missing, conflict_count = [], [], 0
    for key, f in FIELDS.items():
        if not f.target(kind):
            continue
        value = vals[key]
        claims = by_field.get(key, [])
        # The settled winner, as _settle marked it (a claim held back from a
        # shared passbook is not it, B3); else the precedence rule.
        win = next((c for c in claims if c.get("wins")), None) or winner(f, claims)
        # The column is the record; a claim names its source only when it says the same.
        src = _source(win, papers) if win and same(f, win["value"], value) else (
            {"source": "legacy", "label": LEGACY_LABEL, "source_ref": "", "document_id": "",
             "set_at": "", "confidence": ""} if value else None)
        confl = [{"id": c["id"], "value": c["value"], "display": display(f, c["value"]),
                  "source": _source(c, papers)} for c in conflicts(f, claims, win)]
        conflict_count += len(confl)
        item = {"key": key, "group": f.group, "label": f.label, "value": value,
                "display": display(f, value), "important": _important(key, kind, vals, built),
                "how_to_fill": f.how, "source": src if value else None, "conflicts": confl}
        fields.append(item)
        if item["important"] and not value:
            missing.append(item)
    return {"fields": fields, "missing": missing, "conflict_count": conflict_count,
            "acquisition": await _acquisition(conn, uid, rid, row, vals, by_field, papers),
            # Every source's claims, for the compliance check (deed vs passbook extent).
            "claims": by_field, "passbook_owner": (pb.get("owner_name") or "").strip()}


async def _acquisition(conn, uid, rid, row, vals, by_field,
                       papers: frozenset = frozenset()) -> Optional[dict]:
    tid = row.get("acquired_by_transfer_id") or ""
    cur = await conn.execute(
        "SELECT * FROM record_transfers WHERE owner_user_id=%s AND record_id=%s"
        " ORDER BY sort, created_at", (uid, rid))
    transfers = list(await cur.fetchall())
    t = next((x for x in transfers if x["id"] == tid), None)
    if t is None and len(transfers) == 1:
        t = transfers[0]
    if t is None and not (vals.get("acquisition_mode") or vals.get("doc_no")):
        return None
    parties = []
    if t:
        cur = await conn.execute(
            "SELECT * FROM record_transfer_parties WHERE transfer_id=%s ORDER BY sort", (t["id"],))
        parties = list(await cur.fetchall())

    def side(s):
        return [{"name": p["name"], "parentage": p.get("parentage") or "",
                 "role": p.get("role") or "", "relationship": p.get("relationship") or "",
                 "share_num": int(p.get("share_num") or 0),
                 "share_den": int(p.get("share_den") or 0), "is_gpa": bool(p.get("is_gpa"))}
                for p in parties if p["side"] == s]

    mode = vals.get("acquisition_mode", "")
    key = "acquisition_mode" if mode else "doc_no"
    f = FIELDS[key]
    win = winner(f, by_field.get(key, []))
    src = _source(win, papers) if win and same(f, win["value"], vals.get(key, "")) else (
        {"source": "legacy", "label": LEGACY_LABEL, "source_ref": "", "document_id": "",
         "set_at": "", "confidence": ""})
    return {"mode": mode, "mode_label": MODE_LABELS.get(mode, ""),
            "registered": vals.get("registered", ""), "doc_no": vals.get("doc_no", ""),
            "reg_date": vals.get("reg_date", ""), "exec_date": vals.get("exec_date", ""),
            "sro": vals.get("sro", ""),
            "consideration": float(vals.get("consideration") or 0),
            "govt_value": float(vals.get("govt_value") or 0),
            "stamp_duty": float(vals.get("stamp_duty") or 0),
            "proof_no": (t or {}).get("proof_no") or "", "transfer_id": (t or {}).get("id") or "",
            "deed_document_id": (t or {}).get("deed_document_id") or "",
            "from_parties": side("from"), "to_parties": side("to"),
            # Events, not rows: two rows for one deed are one owner change.
            "chain_length": len({(x.get("deed_no") or "").strip().lower() or x["id"]
                                 for x in transfers}), "source": src}


# ── Reading a deed reading into claims ────────────────────────────────

_CONF = {"check": "medium", "unsure": "low"}
_READ_KEYS = {"document_no": "doc_no", "registration_date": "reg_date",
              "execution_date": "exec_date", "sro": "sro", "consideration": "consideration",
              "stamp_duty": "stamp_duty", "village": "village", "mandal": "mandal",
              "district": "district", "survey_no": "survey_no", "plot_no": "plot_no",
              "extent": "extent", "classification": "land_class", "boundaries": "boundary"}
#: Matched against the unit with dots and spaces taken out ("sq. yards" → "sqyards").
_UNIT_WORDS = (("acre", "ac", 1.0), ("ac", "ac", 1.0), ("cent", "ac", 0.01),
               ("gunta", "ac", 0.025), ("hectare", "ac", 2.47105), ("yard", "sq.yd", 1.0),
               ("sqyd", "sq.yd", 1.0), ("sqyard", "sq.yd", 1.0), ("feet", "sq.ft", 1.0),
               ("sqft", "sq.ft", 1.0), ("sqfeet", "sq.ft", 1.0))


def extent_of(text: str) -> str:
    """'2.20 acres' → '2.2 ac'; '418.5 sq. yards' → '418.5 sq.yd'. '' when the
    figure is not one plain number with a known unit — never a guess."""
    t = (text or "").lower().replace(",", "")
    m = re.match(r"^\s*([0-9]+(?:\.[0-9]+)?)\s*([a-z. ]*)$", t)
    if not m:
        return ""
    word = re.sub(r"[ .]", "", m.group(2))
    for w, unit, k in _UNIT_WORDS:
        if word.startswith(w):
            return f"{_num_text(float(m.group(1)) * k)} {unit}"
    return ""


def split_survey(text: str) -> tuple:
    """'214/2' → ('214', '2'), as saveRecord stores a parcel's survey number."""
    t = (text or "").strip()
    if t.lower().startswith("sy"):
        t = t[2:].lstrip(". ").strip()
    no, _, sub = t.replace("-", "/", 1).partition("/")
    return no.strip(), sub.strip()


def deed_claims(fields: dict, kind: str) -> tuple:
    """A deed reading → (identity/physical values, title values, confidence,
    from parties, to parties, prior). Parties are allow-listed here."""
    s = lambda k: _WS.sub(" ", str(fields.get(k) or "")).strip()  # noqa: E731
    no, year = s("document_no"), s("reg_year")
    doc = f"{no}/{year}" if no and year and "/" not in no else no
    survey = s("survey_no")
    values = {"village": s("village"), "mandal": s("mandal"), "district": s("district"),
              "land_class": s("classification"), "extent": extent_of(s("extent"))}
    if survey and "," not in survey:          # a multi-item schedule is out of scope
        if kind == "parcel":
            values["survey_no"], values["subdivision"] = split_survey(survey)
        else:
            values["survey_no"] = survey
    if kind == "property":
        values["plot_no"] = s("plot_no")
    b = fields.get("boundaries") if isinstance(fields.get("boundaries"), dict) else {}
    for side in ("north", "south", "east", "west"):
        values[f"boundary_{side}"] = _WS.sub(" ", str(b.get(side) or "")).strip()
    acq = {"acquisition_mode": mode_for_doc_type(s("doc_type")),
           "registered": "yes" if no else "", "doc_no": doc,
           "reg_date": s("registration_date"), "exec_date": s("execution_date"),
           "sro": s("sro"), "consideration": fields.get("consideration") or 0,
           "stamp_duty": fields.get("stamp_duty") or 0}
    conf = {}
    raw_conf = fields.get("field_confidence") if isinstance(fields.get("field_confidence"), dict) else {}
    for rk, key in _READ_KEYS.items():
        level = _CONF.get(str(raw_conf.get(rk) or "").lower(), "high")
        if key == "boundary":
            for side in ("north", "south", "east", "west"):
                conf[f"boundary_{side}"] = level
        else:
            conf[key] = level
    conf["subdivision"] = conf.get("survey_no", "high")
    froms, tos = [], []
    for p in fields.get("parties") or []:
        if not isinstance(p, dict) or p.get("is_gpa"):
            continue     # holding a power of attorney is not receiving the land
        role = str(p.get("role") or "").lower()
        if role not in ("seller", "buyer"):
            continue
        share = re.match(r"^\s*(\d+)\s*/\s*(\d+)\s*$", str(p.get("share") or ""))
        party = {"name": p.get("name"), "parentage": p.get("parentage"),
                 "address": p.get("address"), "role": role,
                 "extent": p.get("extent") if isinstance(p.get("extent"), (int, float)) else 0,
                 "extent_unit": p.get("extent_unit"),
                 "share_num": int(share.group(1)) if share else 0,
                 "share_den": int(share.group(2)) if share else 0}
        (tos if role == "buyer" else froms).append(party)
    prior = fields.get("prior_document_details")
    return values, acq, conf, froms, tos, prior if isinstance(prior, dict) else None
