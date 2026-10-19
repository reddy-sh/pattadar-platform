"""Versioned service catalogue: which services are offered, and at what price.

The services themselves (their keys and the order form each one asks) stay in
code as ``SERVICE_CATALOGUE`` below: a form's fields drive the validation at
the ordering boundary, so a new service is still a reviewed code change. What
a super-admin publishes here is an override *document* over that baseline,
per scope (docs/specs/2026-10-09-service-team-vetting-and-catalogue.md §7):

    {"schemaVersion": 1,
     "services": {"survey": {"price": 3100, "days": 12, "enabled": true,
                             "label": "...", "blurb": "..."}}}

Every field is optional; an absent one inherits from the wider scope, and
the widest scope inherits from the code baseline. Scopes are the country
(``IN/*``) and a state (``IN/AP``). Revisions move draft → published →
superseded, or → archived, as compliance policies do (``governance.py``),
with an append-only event trail.

Pure: no db, no strawberry, no clock. ``web360.py`` holds the connection.
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Iterable

DDL = [
    """CREATE TABLE IF NOT EXISTS service_catalogue_sets (
        id TEXT PRIMARY KEY,
        scope_key TEXT NOT NULL,
        country_code TEXT NOT NULL DEFAULT 'IN',
        state_code TEXT NOT NULL DEFAULT '*',
        revision INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'draft',
        document TEXT NOT NULL,
        source_digest TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT '',
        published_by TEXT NOT NULL DEFAULT '',
        published_at TEXT NOT NULL DEFAULT '',
        UNIQUE (scope_key, revision)
    )""",
    # A price can differ by district too: IN/AP/GUNTUR overrides IN/AP.
    "ALTER TABLE service_catalogue_sets ADD COLUMN IF NOT EXISTS district_code"
    " TEXT NOT NULL DEFAULT '*'",
    "CREATE INDEX IF NOT EXISTS idx_service_catalogue_scope"
    " ON service_catalogue_sets (scope_key, status, revision)",
    """CREATE TABLE IF NOT EXISTS service_catalogue_events (
        id TEXT PRIMARY KEY,
        set_id TEXT NOT NULL,
        scope_key TEXT NOT NULL DEFAULT '',
        revision INTEGER NOT NULL DEFAULT 0,
        actor TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL DEFAULT '',
        detail TEXT NOT NULL DEFAULT '',
        source_digest TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT ''
    )""",
    "CREATE INDEX IF NOT EXISTS idx_service_catalogue_events"
    " ON service_catalogue_events (scope_key, created_at)",
    # Which published revisions priced an order, so a later revision can
    # never rewrite what a past order or its dispute was about.
    "ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS catalogue_revision"
    " TEXT NOT NULL DEFAULT ''",
]

#: Bounds at the trust boundary. A price is rupees, tax-inclusive, as today.
MAX_PRICE = 1_000_000.0
MAX_DAYS = 365
MAX_LABEL = 80
MAX_BLURB = 300
MAX_DELIVERABLE = 160

EDITABLE = ("enabled", "label", "blurb", "price", "days", "areas", "deliverable")

#: Where a service is offered: {"states": ["AP"], "districts": ["AP/GUNTUR"]}.
#: No states means everywhere; a state with districts listed is limited to
#: them. Bounded so one document stays small.
MAX_AREA_STATES = 40

#: Where every service is offered until a published revision says otherwise
#: (Reddy, 09/10/2026: "Telangana and Andhra only, since I don't know other
#: places"). Codes as services/api/data/states.csv spells them.
BASELINE_AREAS = {"states": ["AP", "TS"], "districts": []}
MAX_AREA_DISTRICTS = 1000


# The services this system sells.
#
# A dict and not four buttons on a page: the catalogue is meant to grow into
# the hundreds, so it is queried and searched like any other list rather than
# drawn by hand. Each entry carries the questions that service actually needs
# answering — a survey needs to know which boundary, an EC needs a year range
# — because a work order with no parameters is one a caretaker cannot act on.
#
# fields: (name, label, type, required, options, help)
#   type is one of: text | date | year | select | number | textarea
#
# This dict is the one base for service information on every client and in
# every server module (Reddy, 09/10/2026). Besides the editable fields
# (EDITABLE, overridable per scope) each entry carries code-owned facts:
#   shelves           the missing shelves this service can fill (RecordPapers)
#   files_to          the shelf a delivered paper is filed on (ticketing)
#   disciplines       who can take it, best fit first (associates dispatch)
#   role              the People-page word for whoever did it
#   aliases           older kinds that mean this service ('opinion', 'visit')
#   per_record        its required answers belong to one record, so no bulk
#   directions_field  the field that says where the land is when nothing mapped does
#   guides            University pages per state: slug (own_paper False when
#                     it explains the source paper) or a state-guide topic
#   synonyms          what owners call it, for matching free text
#   also_called       the one-line "Also called …" under the name, or ''
#   flat_price_note   said beside a quantity that does not change the price
#   featured          in the "Prepare for a sale" bundle
SERVICE_CATALOGUE: dict = {
    "ec": {
        "label": "Encumbrance certificate",
        "price": 1180.0,
        "group": "Records",
        "blurb": "The registrar's list of every transaction on this land, for a period you choose.",
        "days": 7,
        "shelves": ["search"],
        "fields": [
            ("from_year", "From year", "year", False, [],
             "Leave both empty for the full history, which is what the registrar gives by default."),
            ("to_year", "To year", "year", False, [], ""),
            ("purpose", "What it is for", "select", False,
             ["Sale", "Loan", "Court", "Own reference"], ""),
        ],
        "deliverable": "The registrar’s list of transactions, as a certificate",
        "files_to": "search",
        "disciplines": ("writer", "agent"),
        "role": "Agent",
        "aliases": [],
        "per_record": False,
        "directions_field": "",
        "guides": {"AP": [{"slug": "encumbrance-and-deeds"}], "TS": [{"slug": "ec-registration"}]},
        "synonyms": ["ec", "encumbrance", "encumbrance certificate"],
        "also_called": "Also called an EC",
        "flat_price_note": "",
        "featured": True,
    },
    "survey": {
        "label": "Boundary re-survey",
        "price": 2900.0,
        "group": "On the ground",
        "blurb": "A licensed surveyor walks the boundary and pins each corner against the FMB sheet.",
        "days": 21,
        "shelves": [],
        "fields": [
            ("which_side", "Which boundary", "select", True,
             ["All four", "North", "South", "East", "West"], ""),
            ("dispute", "Is a neighbour disputing it?", "select", True, ["No", "Yes"],
             "A disputed boundary is surveyed with both parties present."),
            ("notes", "Anything the surveyor should know", "textarea", False, [], ""),
        ],
        "deliverable": "A surveyor’s sheet with your corners pinned against the FMB",
        "files_to": "map",
        "disciplines": ("surveyor",),
        "role": "Surveyor",
        "aliases": [],
        "per_record": True,
        "directions_field": "notes",
        "guides": {"AP": [{"slug": "fmb-and-village-map", "own_paper": False}], "TS": [{"slug": "tippan-lpm-village-map", "own_paper": False}]},
        "synonyms": ["survey", "re-survey", "resurvey", "measurement", "measure", "boundary survey"],
        "also_called": "",
        "flat_price_note": "",
        "featured": True,
    },
    "site_visit": {
        "label": "Site visit",
        "price": 1200.0,
        "group": "On the ground",
        "blurb": "A provider stands on the land, photographs it and reports what they found.",
        "days": 7,
        "shelves": [],
        "fields": [
            ("visit_on", "Preferred date", "date", False, [], "Left empty, we go within the week."),
            ("check", "What to check", "select", True,
             ["General condition", "Crop", "Encroachment", "Water", "Fencing"], ""),
            ("meet", "Who to meet on site", "text", False, [], ""),
        ],
        "deliverable": "Photographs and a written report of what was found",
        "files_to": "unsorted",
        "disciplines": ("photo_studio", "caretaker"),
        "role": "Caretaker",
        "aliases": ["visit"],
        "per_record": False,
        "directions_field": "meet",
        "guides": {},
        "synonyms": ["site visit", "visit", "inspection", "inspect", "check the land"],
        "also_called": "",
        "flat_price_note": "",
        "featured": False,
    },
    "bore_point": {
        "label": "Bore point (hydro-geo survey)",
        # Baseline only; the super-admin catalogue overrides it per state.
        "price": 4000.0,
        "group": "On the ground",
        "blurb": "A hydrogeologist studies the ground beneath your land and marks the spot most likely to give water, before anyone pays for drilling.",
        "days": 7,
        "shelves": [],
        "fields": [
            ("purpose", "What the water is for", "select", True,
             ["Drinking", "Irrigation", "Both"], ""),
            ("nearby", "Working borewells nearby", "select", False,
             ["None", "1 or 2", "3 or more", "Not sure"],
             "Wells around yours tell the hydrogeologist a lot about the ground."),
            ("nearby_depth", "Depth of nearby borewells, if known", "text", False, [], ""),
            ("visit_on", "Preferred date", "date", False, [], "Left empty, we go within the week."),
            ("notes", "Anything the hydrogeologist should know", "textarea", False, [], ""),
        ],
        "deliverable": "The bore point marked on your land, with a report of the likely depth and water",
        "files_to": "map",
        "disciplines": ("hydrogeologist", "surveyor"),
        "role": "Hydrogeologist",
        "aliases": [],
        "per_record": True,
        "directions_field": "notes",
        "guides": {"AP": [{"slug": "groundwater-and-borewells-ap", "own_paper": False}],
                   "TS": [{"slug": "groundwater-and-borewells-ts", "own_paper": False}]},
        "synonyms": ["bore point", "borewell point", "borewell", "bore well", "hydro geo survey",
                     "hydrogeological survey", "groundwater survey", "water divining", "where to drill"],
        "also_called": "Also called a groundwater survey",
        "flat_price_note": "",
        "featured": False,
    },
    "title_opinion": {
        "label": "Title opinion",
        "price": 4500.0,
        "group": "Legal",
        "blurb": "An advocate reads the chain of documents and writes whether the title is clean.",
        "days": 14,
        "shelves": [],
        "fields": [
            ("years", "How far back to trace", "select", True,
             ["13 years", "30 years"], "Banks usually ask for 30."),
            ("for_bank", "Which bank, if it is for a loan", "text", False, [], ""),
        ],
        "deliverable": "A written opinion from an advocate on whether the title is clean",
        "files_to": "title",
        "disciplines": ("advocate",),
        "role": "Advocate",
        "aliases": ["opinion"],
        "per_record": False,
        "directions_field": "",
        "guides": {},
        "synonyms": ["title opinion", "legal opinion", "title search", "title check",
                     "title deed check", "title verification", "lawyer"],
        "also_called": "",
        "flat_price_note": "",
        "featured": False,
    },
    "mutation": {
        "label": "Mutation / name transfer",
        "price": 2200.0,
        "group": "Records",
        "blurb": "Getting the revenue record moved into the new owner's name after a sale.",
        "days": 30,
        "shelves": [],
        "fields": [
            ("new_owner", "Name to transfer into", "text", True, [], ""),
            ("deed_no", "Registered deed number", "text", True, [], ""),
        ],
        "deliverable": "The revenue record in the new owner’s name",
        "files_to": "revenue",
        "disciplines": ("agent", "writer"),
        "role": "Agent",
        "aliases": [],
        "per_record": True,
        "directions_field": "",
        "guides": {"AP": [{"topic": "mutation", "title": "Mutation"}], "TS": [{"topic": "mutation", "title": "Mutation"}]},
        "synonyms": ["mutation", "name transfer", "transfer the name", "transfer name"],
        "also_called": "Also called a name transfer",
        "flat_price_note": "",
        "featured": False,
    },
    "patta_copy": {
        "label": "Certified patta copy",
        "price": 450.0,
        "group": "Records",
        "blurb": "A stamped copy of the pattadar passbook entry from the village office.",
        "days": 5,
        "shelves": ["revenue"],
        "fields": [
            ("copies", "How many copies", "number", False, [],
             "One certified copy is requested when this is left empty."),
        ],
        "deliverable": "A stamped copy of the passbook entry",
        "files_to": "revenue",
        "disciplines": ("writer", "agent", "caretaker"),
        "role": "Agent",
        "aliases": [],
        "per_record": False,
        "directions_field": "",
        "guides": {"AP": [{"slug": "pattadar-passbook"}], "TS": [{"slug": "eppb-and-ror-1b"}]},
        "synonyms": ["patta", "passbook", "pattadar passbook", "patta copy"],
        "also_called": "",
        "flat_price_note": "The number of copies does not change the price.",
        "featured": False,
    },
    "deed_copy": {
        "label": "Certified sale deed copy",
        "price": 900.0,
        "group": "Records",
        "blurb": "A certified copy from the registration office when the original deed is unavailable.",
        "days": 10,
        "shelves": ["title"],
        "fields": [
            ("document_number", "Document number, if known", "text", False, [], ""),
            ("registration_year", "Registration year, if known", "year", False, [], ""),
        ],
        "deliverable": "A certified copy of the registered deed",
        "files_to": "title",
        "disciplines": ("writer", "agent"),
        "role": "Agent",
        "aliases": [],
        "per_record": False,
        "directions_field": "",
        "guides": {"AP": [{"slug": "encumbrance-and-deeds", "own_paper": False}], "TS": [{"slug": "ec-registration", "own_paper": False}]},
        "synonyms": ["deed copy", "sale deed", "certified copy", "document copy", "deed"],
        "also_called": "",
        "flat_price_note": "",
        "featured": False,
    },
    "revenue_extract": {
        "label": "1-B / Adangal extract",
        "price": 650.0,
        "group": "Records",
        "blurb": "The latest revenue extract showing the recorded pattadar and cultivation entry.",
        "days": 5,
        "shelves": ["revenue"],
        "fields": [
            ("as_of_year", "Year, if not the latest", "year", False, [], ""),
        ],
        "deliverable": "A copy of the latest 1-B / Adangal entry for this land",
        "files_to": "revenue",
        "disciplines": ("writer", "agent"),
        "role": "Agent",
        "aliases": [],
        "per_record": False,
        "directions_field": "",
        "guides": {"AP": [{"slug": "ror-1b"}, {"slug": "adangal"}], "TS": [{"slug": "eppb-and-ror-1b"}, {"slug": "pahani"}]},
        "synonyms": ["1-b", "1b", "adangal", "pahani", "ror", "revenue extract", "revenue record"],
        "also_called": "",
        "flat_price_note": "",
        "featured": False,
    },
    "tax_receipt": {
        "label": "Land tax receipt",
        "price": 400.0,
        "group": "Records",
        "blurb": "The latest land or property tax receipt and arrears position from the local office.",
        "days": 5,
        "shelves": ["search"],
        "fields": [
            ("financial_year", "Financial year, if not the latest", "text", False, [], ""),
        ],
        "deliverable": "The latest tax receipt, with any arrears noted",
        "files_to": "search",
        "disciplines": ("writer", "agent"),
        "role": "Agent",
        "aliases": [],
        "per_record": False,
        "directions_field": "",
        "guides": {},
        "synonyms": ["tax receipt", "land tax", "property tax", "tax"],
        "also_called": "",
        "flat_price_note": "",
        "featured": False,
    },
    "fmb_copy": {
        "label": "FMB / survey map copy",
        "price": 750.0,
        "group": "Records",
        "blurb": "A certified field measurement sketch or survey map from the revenue office.",
        "days": 7,
        "shelves": ["map"],
        "fields": [
            ("sheet_number", "Sheet number, if known", "text", False, [], ""),
        ],
        "deliverable": "A certified copy of the field measurement sketch or survey map",
        "files_to": "map",
        "disciplines": ("writer", "agent"),
        "role": "Agent",
        "aliases": [],
        "per_record": False,
        "directions_field": "",
        "guides": {"AP": [{"slug": "fmb-and-village-map"}], "TS": [{"slug": "tippan-lpm-village-map"}]},
        "synonyms": ["fmb", "survey map", "tippan", "field measurement book", "sketch"],
        "also_called": "",
        "flat_price_note": "",
        "featured": False,
    },
    "approval_copy": {
        "label": "Approved plan copy",
        "price": 1100.0,
        "group": "Records",
        "blurb": "A certified layout or building approval copy from the issuing authority.",
        "days": 10,
        "shelves": ["identity"],
        "fields": [
            ("authority", "Issuing authority, if known", "text", False, [], ""),
        ],
        "deliverable": "A certified copy of the approved layout or building plan",
        "files_to": "identity",
        "disciplines": ("writer", "agent"),
        "role": "Agent",
        "aliases": [],
        "per_record": False,
        "directions_field": "",
        "guides": {},
        "synonyms": ["approved plan", "building plan", "plan copy", "approval", "layout"],
        "also_called": "",
        "flat_price_note": "",
        "featured": False,
    },
    "occupancy_copy": {
        "label": "Occupancy certificate copy",
        "price": 1200.0,
        "group": "Records",
        "blurb": "A certified occupancy certificate copy for the completed building or flat.",
        "days": 10,
        "shelves": ["identity"],
        "fields": [
            ("approval_number", "Approval number, if known", "text", False, [], ""),
        ],
        "deliverable": "A certified copy of the occupancy certificate",
        "files_to": "identity",
        "disciplines": ("writer", "agent"),
        "role": "Agent",
        "aliases": [],
        "per_record": False,
        "directions_field": "",
        "guides": {},
        "synonyms": ["occupancy", "occupancy certificate", "oc"],
        "also_called": "",
        "flat_price_note": "",
        "featured": False,
    },
}

#: Legacy kind → catalogue key ('opinion' → 'title_opinion'), from each
#: entry's own `aliases`.
ALIASES: dict = {old: key for key, v in SERVICE_CATALOGUE.items() for old in v["aliases"]}


def state_code(value: str) -> str:
    """'*' for the country, else an upper-case state code (AP, TG …)."""
    text = (value or "*").strip()
    if text == "*":
        return "*"
    return re.sub(r"[^A-Z0-9]", "", text.upper())[:16] or "*"


def district_code(value: str) -> str:
    """'Guntur' / 'guntur ' → 'GUNTUR'; '' or '*' → '*'. The fold records,
    the reference list and the catalogue all compare by."""
    text = (value or "*").strip()
    if text == "*":
        return "*"
    return re.sub(r"[^A-Z0-9_]", "", text.upper().replace(" ", "_"))[:80] or "*"


def offered_in(offer: dict, state: str, district: str = "*") -> bool:
    """Is this offer available to land in `state` / `district`?"""
    if not offer.get("enabled", True):
        return False
    areas = offer.get("areas") or {}
    states = areas.get("states") or []
    if not states:
        return True
    st = state_code(state)
    if st not in states:
        return False
    within = [d.split("/", 1)[1] for d in areas.get("districts") or [] if d.startswith(f"{st}/")]
    return not within or district_code(district) in within


def _areas(key: str, value: Any) -> dict[str, list[str]]:
    if not isinstance(value, dict) or set(value) - {"states", "districts"}:
        raise ValueError(f"{key}.areas must name states and districts only")
    states = value.get("states") or []
    districts = value.get("districts") or []
    if not isinstance(states, list) or not isinstance(districts, list):
        raise ValueError(f"{key}.areas states and districts must be lists")
    clean_states = sorted({state_code(str(s)) for s in states} - {"*"})
    if len(clean_states) > MAX_AREA_STATES:
        raise ValueError(f"{key}.areas names too many states")
    clean_districts = set()
    for item in districts:
        st, _, dist = str(item).partition("/")
        st, dist = state_code(st), district_code(dist)
        if st not in clean_states or dist == "*":
            raise ValueError(f"{key}.areas district {item} is not in a chosen state")
        clean_districts.add(f"{st}/{dist}")
    if len(clean_districts) > MAX_AREA_DISTRICTS:
        raise ValueError(f"{key}.areas names too many districts")
    return {"states": clean_states, "districts": sorted(clean_districts)}


def scope_key(state: str, district: str = "*") -> str:
    """'IN/*' for the country, 'IN/AP' for a state, 'IN/AP/GUNTUR' for a
    district. A district needs its state; without one it is the country."""
    st, dist = state_code(state), district_code(district)
    if st == "*":
        return "IN/*"
    return f"IN/{st}" if dist == "*" else f"IN/{st}/{dist}"


def scope_chain(state: str, district: str = "*") -> list[str]:
    """The scopes that price land in `state` / `district`, widest first."""
    st, dist = state_code(state), district_code(district)
    keys = ["IN/*"]
    if st != "*":
        keys.append(f"IN/{st}")
        if dist != "*":
            keys.append(f"IN/{st}/{dist}")
    return keys


def canonical_json(document: dict[str, Any]) -> str:
    return json.dumps(document, ensure_ascii=True, separators=(",", ":"), sort_keys=True)


def digest(document: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(document).encode()).hexdigest()


def validate(document: Any, known: Iterable[str]) -> dict[str, Any]:
    """Return the canonical override document, or raise ValueError.

    Only services the code knows can be overridden, and only the editable
    fields; anything else is refused rather than dropped, so a typo in a key
    cannot publish as "no change"."""
    known = set(known)
    if not isinstance(document, dict) or document.get("schemaVersion") != 1:
        raise ValueError("Unsupported catalogue document")
    services = document.get("services")
    if not isinstance(services, dict):
        raise ValueError("services must be an object")
    out: dict[str, dict[str, Any]] = {}
    for key, override in services.items():
        if key not in known:
            raise ValueError(f"Unknown service {key}")
        if not isinstance(override, dict):
            raise ValueError(f"{key} must be an object")
        extra = set(override) - set(EDITABLE)
        if extra:
            raise ValueError(f"{key} has fields that cannot be changed: {', '.join(sorted(extra))}")
        clean: dict[str, Any] = {}
        if "enabled" in override:
            if not isinstance(override["enabled"], bool):
                raise ValueError(f"{key}.enabled must be true or false")
            clean["enabled"] = override["enabled"]
        if "price" in override:
            price = override["price"]
            if isinstance(price, bool) or not isinstance(price, (int, float)) \
                    or not 0 < float(price) <= MAX_PRICE:
                raise ValueError(f"{key}.price must be more than 0 and at most {MAX_PRICE:.0f}")
            clean["price"] = round(float(price), 2)
        if "days" in override:
            days = override["days"]
            if isinstance(days, bool) or not isinstance(days, int) or not 1 <= days <= MAX_DAYS:
                raise ValueError(f"{key}.days must be a whole number from 1 to {MAX_DAYS}")
            clean["days"] = days
        for name, limit in (("label", MAX_LABEL), ("blurb", MAX_BLURB),
                            ("deliverable", MAX_DELIVERABLE)):
            if name in override:
                text = " ".join(str(override[name] or "").split())
                if not text or len(text) > limit:
                    raise ValueError(f"{key}.{name} must be 1 to {limit} characters")
                clean[name] = text
        if "areas" in override:
            clean["areas"] = _areas(key, override["areas"])
        if clean:
            out[key] = clean
    return {"schemaVersion": 1, "services": out}


def effective(baseline: dict[str, dict],
              layers: Iterable[tuple[str, dict[str, Any]]]) -> dict[str, dict]:
    """Apply ``(scope_key, document)`` layers, widest first, over the baseline.

    Each offer is the baseline entry with the editable fields replaced, plus
    ``enabled`` and ``source`` (the scope that last changed it; '' = the
    code baseline)."""
    out = {k: {"areas": {"states": list(BASELINE_AREAS["states"]), "districts": []},
               **v, "enabled": True, "source": ""} for k, v in baseline.items()}
    for scope, document in layers:
        for key, override in ((document or {}).get("services") or {}).items():
            if key not in out or not isinstance(override, dict):
                continue
            for name in EDITABLE:
                if name in override:
                    out[key][name] = override[name]
            out[key]["source"] = scope
    return out


def revision_tag(rows: Iterable[dict]) -> str:
    """'IN/*@3,IN/AP@2': the published revisions that priced an order."""
    return ",".join(f"{r['scope_key']}@{int(r['revision'])}" for r in rows if r)
