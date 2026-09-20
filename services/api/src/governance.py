"""Versioned property-governance policy documents.

The relational table is deliberately a document envelope: callers select by a
jurisdiction key and everything that describes the policy lives in one JSON
document.  Moving it to a document database later is therefore a copy, not a
redesign or a lossy reconstruction from checklist rows.

Only published documents are used in owner workflows.  Authoring metadata and
drafts belong to the super-admin surface in ``web360.py``.
"""
from __future__ import annotations

import hashlib
import json
import re
from copy import deepcopy
from typing import Any


DDL = [
    """CREATE TABLE IF NOT EXISTS governance_policy_sets (
        id TEXT PRIMARY KEY,
        scope_key TEXT NOT NULL,
        country_code TEXT NOT NULL,
        state_code TEXT NOT NULL DEFAULT '*',
        district_code TEXT NOT NULL DEFAULT '*',
        revision INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'draft',
        schema_version INTEGER NOT NULL DEFAULT 1,
        document TEXT NOT NULL,
        source_digest TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT '',
        published_by TEXT NOT NULL DEFAULT '',
        published_at TEXT NOT NULL DEFAULT '',
        UNIQUE (scope_key, revision)
    )""",
    "CREATE INDEX IF NOT EXISTS idx_governance_policy_scope"
    " ON governance_policy_sets (country_code, state_code, district_code, status, revision)",
    """CREATE TABLE IF NOT EXISTS governance_policy_events (
        id TEXT PRIMARY KEY,
        policy_id TEXT NOT NULL,
        actor TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL DEFAULT '',
        detail TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT ''
    )""",
    "CREATE INDEX IF NOT EXISTS idx_governance_policy_events"
    " ON governance_policy_events (policy_id, created_at)",
    "ALTER TABLE governance_policy_events ADD COLUMN IF NOT EXISTS scope_key TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE governance_policy_events ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE governance_policy_events ADD COLUMN IF NOT EXISTS source_digest TEXT NOT NULL DEFAULT ''",
    "CREATE INDEX IF NOT EXISTS idx_governance_events_scope"
    " ON governance_policy_events (scope_key, created_at)",
]


SOURCES = [
    {
        "id": "dolr-registration-faq",
        "authority": "Department of Land Resources, Government of India",
        "title": "Registration Act FAQ: buyer and seller duties",
        "url": "https://cdnbbsr.s3waas.gov.in/s3d79c6256b9bdac53a55801a066b70da3/uploads/2020/10/2020101147.pdf",
        "appliesTo": ["buyer", "seller", "agricultural_land", "house_on_site", "open_plot", "commercial_building"],
    },
    {
        "id": "dolr-dilrmp",
        "authority": "Department of Land Resources, Government of India",
        "title": "Digital India Land Records Modernization Programme",
        "url": "https://dolr.gov.in/en/programmes-schemes/dilrmp-2/",
        "appliesTo": ["good_records", "agricultural_land", "survey"],
    },
    {
        "id": "ap-meebhoomi",
        "authority": "Revenue Department, Government of Andhra Pradesh",
        "title": "MeeBhoomi land records",
        "url": "https://tirupati.ap.gov.in/service/land-records/",
        "appliesTo": ["agricultural_land", "good_records"],
    },
    {
        "id": "ap-bhunaksha",
        "authority": "Survey, Settlements and Land Records, Government of Andhra Pradesh",
        "title": "BhuNaksha cadastral maps",
        "url": "https://bhunaksha.ap.gov.in/",
        "appliesTo": ["agricultural_land", "open_plot", "survey"],
    },
    {
        "id": "ap-survey-records",
        "authority": "Survey and Land Records, Government of Andhra Pradesh",
        "title": "Survey records, boundary demarcation and certified copies",
        "url": "https://krishna.ap.gov.in/settlements-survey-land-records/",
        "appliesTo": ["agricultural_land", "open_plot", "survey"],
    },
    {
        "id": "ap-fmb-service",
        "authority": "GSWS / MeeSeva, Government of Andhra Pradesh",
        "title": "Issue of Field Measurement Book copy",
        "url": "https://gramawardsachivalayam.ap.gov.in/GSWS/downloads/MeeSevakiosk2/Revenue/MEESEVA%20User%20Manual%20for%20KIOSKS%20-Issue%20of%20FMB%20Ver%201.1.pdf",
        "appliesTo": ["agricultural_land", "open_plot", "survey"],
    },
    {
        "id": "ap-registration",
        "authority": "Registration and Stamps Department, Government of Andhra Pradesh",
        "title": "Property registration services",
        "url": "https://www.india.gov.in/category/money-taxes/subcategory/taxes/details/website-of-registration-stamps-department-andhra-pradesh",
        "appliesTo": ["buyer", "seller", "good_records"],
    },
    {
        "id": "ap-rera",
        "authority": "Andhra Pradesh Real Estate Regulatory Authority",
        "title": "Project disclosures and buyer information",
        "url": "https://rera.ap.gov.in/RERA/Views/index.html",
        "appliesTo": ["house_on_site", "open_plot", "commercial_building", "buyer", "seller"],
    },
    {
        "id": "ap-rera-rules",
        "authority": "Government of Andhra Pradesh",
        "title": "Andhra Pradesh Real Estate Rules, 2017",
        "url": "https://rera.ap.gov.in/RERA/DOCUMENTS/gos/1.MS115%20_27032017_AP%20Rules%202017.PDF",
        "appliesTo": ["house_on_site", "open_plot", "commercial_building"],
    },
    {
        "id": "ap-cdma-charter",
        "authority": "Commissioner and Director of Municipal Administration, Andhra Pradesh",
        "title": "Citizen Charter: building, occupancy, tax and trade services",
        "url": "https://cdma.ap.gov.in/resources/citizen-charter/",
        "appliesTo": ["house_on_site", "open_plot", "commercial_building"],
    },
    {
        "id": "ap-dtcp-permits",
        "authority": "Directorate of Town and Country Planning, Andhra Pradesh",
        "title": "Online building and layout permissions",
        "url": "https://portal.apdpms.ap.gov.in/portal",
        "appliesTo": ["house_on_site", "open_plot", "commercial_building"],
    },
    {
        "id": "dpdp-act",
        "authority": "Ministry of Electronics and Information Technology, Government of India",
        "title": "Digital Personal Data Protection Act, 2023",
        "url": "https://www.indiacode.nic.in/indiacode/handle/123456789/22037?view_type=browse",
        "appliesTo": ["secure_share", "service_request"],
    },
    {
        "id": "dpdp-rules",
        "authority": "Ministry of Electronics and Information Technology, Government of India",
        "title": "Digital Personal Data Protection Rules, 2025",
        "url": "https://www.meity.gov.in/documents/act-and-policies/digital-personal-dataprotection-rules-2025gDOxUjMtQWa?pageTitle=Digital-Personal-Data-ProtectionRules-2025",
        "appliesTo": ["secure_share", "service_request"],
    },
]


def _item(key: str, title: str, why: str, source_ids: list[str],
          level: str = "required", share: str = "redact") -> dict[str, Any]:
    return {
        "key": key,
        "title": title,
        "why": why,
        "level": level,
        "share": share,
        "sourceIds": source_ids,
    }


BASELINE_DOCUMENT: dict[str, Any] = {
    "schemaVersion": 1,
    "jurisdiction": {
        "countryCode": "IN",
        "countryName": "India",
        "stateCode": "AP",
        "stateName": "Andhra Pradesh",
        "districtCode": "*",
        "districtName": "All districts",
        "authorityName": "Government of Andhra Pradesh",
        "localTerms": {
            "recordOfRights": "1-B / Record of Rights",
            "cultivationRecord": "Adangal",
            "cadastralSketch": "FMB / BhuNaksha",
            "holdingAccount": "Khata / Pattadar passbook",
            "subDistrict": "Mandal",
            "registrationOffice": "Sub-Registrar Office (SRO)",
            "urbanAuthority": "ULB / Development Authority",
        },
    },
    "policy": {
        "name": "Andhra Pradesh property records and safe-sharing baseline",
        "effectiveOn": "2026-09-20",
        "reviewBy": "2026-12-20",
        "legalNotice": "Operational guidance only. Verify current requirements with the competent authority and use a qualified advocate for title or dispute questions.",
    },
    "propertyTypes": [
        {
            "key": "agricultural_land",
            "label": "Agricultural land",
            "matches": ["parcel", "agri"],
            "items": [
                _item("title_chain", "Registered title deed and link documents", "Establish the transfer chain and compare names, survey number, extent and boundaries.", ["dolr-registration-faq", "ap-registration"]),
                _item("ror", "Pattadar passbook and current 1-B", "Confirm the current revenue-record holder and khata details.", ["ap-meebhoomi", "dolr-dilrmp"]),
                _item("adangal", "Current Adangal", "Check land classification, cultivation and survey particulars.", ["ap-meebhoomi"]),
                _item("ec", "Current Encumbrance Certificate", "Review registered mortgages, transfers and other indexed transactions for the relevant period.", ["ap-registration", "dolr-registration-faq"]),
                _item("fmb", "FMB / cadastral map", "Match recorded measurements and boundaries to the ground.", ["ap-bhunaksha", "ap-fmb-service", "ap-survey-records"]),
                _item("tax", "Latest land-revenue or tax receipt", "Check dues and retain payment evidence.", ["dolr-registration-faq"]),
                _item("restrictions", "Restriction and dispute review", "Check assigned/grant conditions, prohibited-property lists, acquisition, court disputes, endowment or Wakf interests, and transfer eligibility.", ["dolr-registration-faq"], "review", "private"),
            ],
        },
        {
            "key": "house_on_site",
            "label": "House or residential building",
            "matches": ["property", "flat", "house"],
            "items": [
                _item("title_chain", "Registered title deed and link documents", "Trace the land and building title to the current owner.", ["dolr-registration-faq", "ap-registration"]),
                _item("ec", "Current Encumbrance Certificate", "Check registered burdens and transfers for the relevant period.", ["ap-registration", "ap-rera-rules"]),
                _item("mutation_tax", "Mutation and latest property-tax receipt", "Match the municipal assessment to the owner and check dues.", ["ap-cdma-charter"]),
                _item("permission", "Building permission and sanctioned plan", "Confirm that the competent authority approved the building and its use.", ["ap-cdma-charter", "ap-dtcp-permits"]),
                _item("occupancy", "Completion / occupancy certificate", "Confirm that completed construction was cleared for occupation where required.", ["ap-cdma-charter", "ap-rera-rules"]),
                _item("rera", "AP RERA project record, if applicable", "Compare title, approvals, promised specifications, completion and promoter disclosures.", ["ap-rera", "ap-rera-rules"], "conditional"),
            ],
        },
        {
            "key": "open_plot",
            "label": "Open plot",
            "matches": ["property", "open_plot"],
            "items": [
                _item("title_chain", "Registered title deed and link documents", "Trace the plot title and compare the schedule across documents.", ["dolr-registration-faq", "ap-registration"]),
                _item("ec", "Current Encumbrance Certificate", "Check registered burdens and transfers.", ["ap-registration"]),
                _item("mutation_vlt", "Mutation and vacant-land tax receipt", "Match the local-body assessment and check outstanding dues.", ["ap-cdma-charter"]),
                _item("layout", "Approved layout and proceedings", "Verify the final layout approval, plot number, roads, open spaces and approval authority.", ["ap-dtcp-permits", "ap-rera-rules"]),
                _item("land_use", "Land-use / zoning confirmation", "Confirm that the intended use is permitted and that any conversion or change of land use is recorded.", ["ap-dtcp-permits"], "review"),
                _item("survey", "FMB, field sketch and ground boundary", "Match plot measurements, access and boundary points to the approved layout and survey record.", ["ap-bhunaksha", "ap-survey-records"]),
                _item("rera", "AP RERA project record, if applicable", "Check project registration and promoter disclosures for plotted development.", ["ap-rera"], "conditional"),
            ],
        },
        {
            "key": "commercial_building",
            "label": "Commercial building",
            "matches": ["property", "shop", "commercial"],
            "items": [
                _item("title_lease", "Registered title or lease and link documents", "Confirm the owner or lessor has authority to grant the commercial interest.", ["dolr-registration-faq", "ap-registration"]),
                _item("ec", "Current Encumbrance Certificate", "Check registered burdens, leases and transfers.", ["ap-registration", "ap-rera-rules"]),
                _item("permission", "Commercial-use building permission and sanctioned plan", "Confirm approved use, setbacks, parking and built area.", ["ap-cdma-charter", "ap-dtcp-permits"]),
                _item("occupancy", "Completion / occupancy certificate", "Confirm that the completed building was cleared for occupation.", ["ap-cdma-charter", "ap-rera-rules"]),
                _item("tax", "Current property-tax assessment and receipt", "Match the assessment and check outstanding dues.", ["ap-cdma-charter"]),
                _item("trade", "Trade licence for the activity", "Confirm the operating licence for the proposed business and premises.", ["ap-cdma-charter"], "conditional"),
                _item("nocs", "Fire, pollution, lift, airport or environment approvals", "Collect the approvals triggered by building height, area, equipment and business activity.", ["ap-cdma-charter", "ap-dtcp-permits", "ap-rera-rules"], "conditional"),
                _item("rera", "AP RERA project record, if applicable", "Compare project approvals, title and completion disclosures.", ["ap-rera"], "conditional"),
            ],
        },
    ],
    "guides": [
        {
            "key": "good_records",
            "label": "Good records compliance",
            "items": [
                "Keep the current certified record and the document it replaced; never overwrite the earlier version.",
                "Match owner name, survey or plot number, extent, boundaries and jurisdiction across title, revenue, survey and tax records.",
                "Record the issuing authority, document number, issue date, source and verification date.",
                "Mark a record as pending verification when the official portal and uploaded copy disagree.",
                "Review the checklist after a transfer, subdivision, construction approval, loan closure or government resurvey.",
            ],
        },
        {
            "key": "buyer",
            "label": "Buyer guidance",
            "items": [
                "Inspect originals or authority-verifiable copies before paying a non-refundable amount.",
                "Compare the seller's title chain with current revenue, registration, survey, tax and approval records.",
                "Check mortgages, unpaid taxes, litigation, family succession, acquisition and transfer restrictions with the competent offices and an advocate.",
                "Where a power of attorney is used, verify that it is genuine, in force, not revoked and sufficient for this transaction.",
                "For a RERA project, verify the project, promoter, sanctioned plans, approvals, promised completion and uploaded updates on the AP RERA portal.",
                "After registration, complete mutation and retain possession, payment and handover evidence.",
            ],
        },
        {
            "key": "seller",
            "label": "Seller guidance",
            "items": [
                "Prepare the current Record of Rights or municipal mutation record and the deed by which title was acquired.",
                "Disclose known mortgages, disputes, notices, restrictions, deviations and unpaid government or utility dues.",
                "Share only purpose-relevant copies; redact Aadhaar, PAN, signatures, bank details and unrelated personal information.",
                "Use an expiring named share, keep an access trail and revoke it when due diligence or the transaction ends.",
                "Record possession handover, consideration receipt and documents delivered at completion.",
            ],
        },
    ],
    "serviceRequests": [
        {
            "key": "land_survey",
            "label": "Land survey / boundary demarcation",
            "purpose": "Identify the correct parcel and give the surveyor the evidence needed to measure its boundary.",
            "share": ["Survey number and subdivision", "Village, mandal, district and state", "Map pin or boundary coordinates", "FMB / field sketch / approved layout", "Extent, adjoining references and physical access notes"],
            "doNotShare": ["Aadhaar or PAN", "Bank or payment account details", "Unrelated deeds or family records", "Unredacted signatures", "Personal phone numbers inside the document package"],
            "controls": ["Use a ticket-scoped expiring link", "Keep the request and every file access in the audit trail", "Send contact details separately only when coordination requires them", "Revoke access when the deliverable is accepted or the request is cancelled"],
            "sourceIds": ["ap-survey-records", "ap-fmb-service", "dpdp-act", "dpdp-rules"],
        },
        {
            "key": "document_fetch",
            "label": "Government record or certified-copy request",
            "purpose": "Give the office identifiers needed to locate the record, not a copy of the owner's identity by default.",
            "share": ["Document, application or registration number", "SRO / revenue office", "Survey, plot or property identifier", "Village, mandal, district and state", "Relevant date range"],
            "doNotShare": ["Aadhaar or PAN unless the authority expressly requires it", "Bank details", "Unrelated documents", "Passwords or OTPs"],
            "controls": ["Show any exceptional identity requirement before consent", "Record the authority and purpose", "Limit access to the selected request", "Remove provider access when work ends"],
            "sourceIds": ["ap-registration", "ap-meebhoomi", "dpdp-act", "dpdp-rules"],
        },
    ],
    "secureSharing": {
        "label": "Secure sharing baseline",
        "shareWhenNeeded": ["Property identifiers", "Jurisdiction", "Selected title/revenue/survey/approval records", "Purpose-specific boundary or site information"],
        "neverByDefault": ["Aadhaar", "PAN", "Bank details", "Passwords or OTPs", "Unredacted signatures", "Family, nominee or beneficiary details", "Unrelated phone numbers or addresses"],
        "controls": ["Name the recipient and purpose", "Select individual documents", "Use the shortest practical expiry", "Prefer view-only or watermarked access", "Keep open/download events", "Allow immediate revocation", "Do not reuse a service-provider link for a buyer or broker"],
        "sourceIds": ["dpdp-act", "dpdp-rules"],
    },
    "sources": SOURCES,
}


# The country policy is intentionally conservative. It is the fallback for a
# state that has not published its own vocabulary and office-specific rules;
# AP's complete policy above remains the more-specific answer for AP records.
# Keeping this as the same portable document shape means an admin can clone it
# into a state or district scope without a second authoring model.
GLOBAL_DOCUMENT: dict[str, Any] = deepcopy(BASELINE_DOCUMENT)
GLOBAL_DOCUMENT["jurisdiction"] = {
    "countryCode": "IN",
    "countryName": "India",
    "stateCode": "*",
    "stateName": "All states and union territories",
    "districtCode": "*",
    "districtName": "All districts",
    "authorityName": "Government of India",
    "localTerms": {
        "recordOfRights": "Record of Rights",
        "cultivationRecord": "Cultivation / tenancy record",
        "cadastralSketch": "Cadastral or field-measurement map",
        "holdingAccount": "Landholding / municipal assessment account",
        "subDistrict": "Sub-district / tehsil / taluk",
        "registrationOffice": "Sub-Registrar Office",
        "urbanAuthority": "Urban local body / development authority",
    },
}
GLOBAL_DOCUMENT["policy"] = {
    **GLOBAL_DOCUMENT["policy"],
    "name": "India property-records and safe-sharing baseline",
}
_GLOBAL_SOURCE_IDS = {"dolr-registration-faq", "dolr-dilrmp", "dpdp-act", "dpdp-rules"}
GLOBAL_DOCUMENT["sources"] = [
    deepcopy(source) for source in SOURCES if source["id"] in _GLOBAL_SOURCE_IDS
]
for _checklist in GLOBAL_DOCUMENT["propertyTypes"]:
    for _record_item in _checklist["items"]:
        _record_item["sourceIds"] = [
            source_id for source_id in _record_item.get("sourceIds", [])
            if source_id in _GLOBAL_SOURCE_IDS
        ] or ["dolr-registration-faq"]
for _service in GLOBAL_DOCUMENT["serviceRequests"]:
    _service["sourceIds"] = [
        source_id for source_id in _service.get("sourceIds", [])
        if source_id in _GLOBAL_SOURCE_IDS
    ] or ["dpdp-act", "dpdp-rules"]

# Names that imply one state's authority must not leak into the country
# fallback. State policies are allowed to put them back, as AP does above.
_GLOBAL_WORDING = {
    "Pattadar passbook and current 1-B": "Current Record of Rights / landholding record",
    "Current Adangal": "Current cultivation or tenancy record, where maintained",
    "FMB / cadastral map": "Current cadastral or field-measurement map",
    "AP RERA project record, if applicable": "State or UT RERA project record, if applicable",
    "FMB, field sketch and ground boundary": "Cadastral map, field sketch and ground boundary",
}
for _checklist in GLOBAL_DOCUMENT["propertyTypes"]:
    for _record_item in _checklist["items"]:
        _record_item["title"] = _GLOBAL_WORDING.get(
            _record_item["title"], _record_item["title"])
        _record_item["why"] = _record_item["why"].replace(
            "AP RERA", "the applicable state or UT RERA")
GLOBAL_DOCUMENT["serviceRequests"][0]["sourceIds"] = [
    "dolr-dilrmp", "dpdp-act", "dpdp-rules"
]
GLOBAL_DOCUMENT["serviceRequests"][1]["sourceIds"] = [
    "dolr-registration-faq", "dpdp-act", "dpdp-rules"
]


def canonical_json(document: dict[str, Any]) -> str:
    return json.dumps(document, ensure_ascii=True, separators=(",", ":"), sort_keys=True)


def validate_document(document: Any) -> dict[str, Any]:
    """Validate the portable shape at the API boundary and return a copy."""
    if not isinstance(document, dict):
        raise ValueError("Policy document must be an object")
    if int(document.get("schemaVersion") or 0) != 1:
        raise ValueError("Unsupported policy schema version")
    jurisdiction = document.get("jurisdiction")
    if not isinstance(jurisdiction, dict):
        raise ValueError("Policy jurisdiction is required")
    for key in ("countryCode", "countryName", "stateCode", "stateName", "districtCode", "districtName"):
        if not str(jurisdiction.get(key) or "").strip():
            raise ValueError(f"Policy jurisdiction {key} is required")
    property_types = document.get("propertyTypes")
    if not isinstance(property_types, list) or not property_types:
        raise ValueError("At least one property checklist is required")
    keys: set[str] = set()
    for checklist in property_types:
        if not isinstance(checklist, dict) or not str(checklist.get("key") or "").strip():
            raise ValueError("Every property checklist needs a key")
        key = str(checklist["key"])
        if key in keys:
            raise ValueError("Property checklist keys must be unique")
        keys.add(key)
        if not isinstance(checklist.get("items"), list) or not checklist["items"]:
            raise ValueError(f"Property checklist {key} has no items")
    sources = document.get("sources")
    if not isinstance(sources, list) or not sources:
        raise ValueError("Policy sources are required")
    source_ids = {str(source.get("id") or "") for source in sources if isinstance(source, dict)}
    if "" in source_ids or len(source_ids) != len(sources):
        raise ValueError("Policy source ids must be present and unique")
    used_sources: set[str] = set()
    for checklist in property_types:
        for item in checklist.get("items") or []:
            if not isinstance(item, dict) or not str(item.get("key") or "").strip():
                raise ValueError("Every checklist item needs a key")
            used_sources.update(str(value) for value in item.get("sourceIds") or [])
    for service in document.get("serviceRequests") or []:
        used_sources.update(str(value) for value in service.get("sourceIds") or [])
    used_sources.update(str(value) for value in (document.get("secureSharing") or {}).get("sourceIds") or [])
    unknown = used_sources - source_ids
    if unknown:
        raise ValueError(f"Policy references unknown sources: {', '.join(sorted(unknown))}")
    return deepcopy(document)


def digest(document: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(validate_document(document)).encode()).hexdigest()


def scope_key(country_code: str, state_code: str = "*", district_code: str = "*") -> str:
    return "/".join((country_code or "*", state_code or "*", district_code or "*")).upper()


def normalize_scope(country_code: str, state_code: str = "*",
                    district_code: str = "*") -> tuple[str, str, str, str]:
    """Return a valid country/state/district scope and its stable key."""
    country = re.sub(r"[^A-Z0-9-]", "", (country_code or "IN").strip().upper())[:8]
    state = "*" if (state_code or "*").strip() == "*" else re.sub(
        r"[^A-Z0-9-]", "", state_code.strip().upper())[:16]
    district = "*" if (district_code or "*").strip() == "*" else re.sub(
        r"[^A-Z0-9_-]", "", district_code.strip().upper().replace(" ", "_"))[:80]
    if not country or not state or not district:
        raise ValueError("Country, state and district codes are required")
    if state == "*" and district != "*":
        raise ValueError("A district override requires a state")
    return country, state, district, scope_key(country, state, district)


async def ensure_baseline(conn) -> None:
    """Install reviewed country and AP baselines; never overwrite admin revisions."""
    baselines = [
        ("gps-in-all-v1", "gpe-in-all-v1", "IN/*/*", "IN", "*", "*",
         GLOBAL_DOCUMENT, "Initial researched India baseline"),
        ("gps-in-ap-all-v1", "gpe-in-ap-all-v1", "IN/AP/*", "IN", "AP", "*",
         BASELINE_DOCUMENT, "Initial researched Andhra Pradesh baseline"),
    ]
    for policy_id, event_id, key, country, state, district, raw, detail in baselines:
        document = validate_document(raw)
        body = canonical_json(document)
        source_digest = digest(document)
        await conn.execute(
            "INSERT INTO governance_policy_sets (id,scope_key,country_code,state_code,district_code,"
            " revision,status,schema_version,document,source_digest,created_by,created_at,published_by,published_at)"
            " VALUES (%s,%s,%s,%s,%s,1,'published',1,%s,%s,"
            " 'system-baseline','2026-09-20','system-baseline','2026-09-20')"
            " ON CONFLICT (scope_key,revision) DO NOTHING",
            (policy_id, key, country, state, district, body, source_digest),
        )
        await conn.execute(
            "INSERT INTO governance_policy_events"
            " (id,policy_id,actor,action,detail,created_at,scope_key,revision,source_digest)"
            " VALUES (%s,%s,'system-baseline','publish',%s,'2026-09-20',%s,1,%s)"
            " ON CONFLICT (id) DO NOTHING",
            (event_id, policy_id, detail, key, source_digest),
        )


def record_checklist(document: dict[str, Any], kind: str, classification: str) -> dict[str, Any] | None:
    """Resolve the most specific property checklist without database concepts."""
    wanted = {str(kind or "").lower(), str(classification or "").lower()}
    for checklist in document.get("propertyTypes") or []:
        matches = {str(value).lower() for value in checklist.get("matches") or []}
        if str(classification or "").lower() in matches:
            return deepcopy(checklist)
    for checklist in document.get("propertyTypes") or []:
        matches = {str(value).lower() for value in checklist.get("matches") or []}
        if wanted & matches:
            return deepcopy(checklist)
    return None
