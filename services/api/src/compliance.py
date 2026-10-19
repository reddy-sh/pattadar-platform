"""The Overview's compliance check: a fixed standard set of checks, plus any
the property's governance policy adds, each decided from facts already on
file. Pure — no database, no AI, no network — so every check is tested on its
own (tests/test_compliance.py). web360._record_compliance gathers the facts.

A check is pass, warn, fail or unknown. "unknown" means the data cannot tell,
never a guess; its detail says why.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Optional

try:                                    # inside the `src` package
    from . import record_master as rm
except ImportError:                     # imported bare off src/, as web360's pure tests do
    import record_master as rm          # type: ignore[no-redef]

#: Policy checklist items the standard set already answers.
_COVERED = {"title_chain", "title_lease", "ror", "ec", "tax", "mutation_tax", "mutation_vlt"}
#: Policy items a filed map (FMB or survey sketch) answers.
_MAP_ITEMS = {"fmb", "survey"}
EC_MAX_DAYS = 365


def _check(key, label, status, detail, action="none", field_key="", service_kind=""):
    return {"key": key, "label": label, "status": status, "detail": detail, "action": action,
            "field_key": field_key, "service_kind": service_kind}


def _dmy(iso: str) -> str:
    return f"{iso[8:10]}/{iso[5:7]}/{iso[0:4]}" if re.match(r"^\d{4}-\d{2}-\d{2}", iso or "") else iso


def _words(name: str) -> list:
    return re.findall(r"[a-z]+", (name or "").lower())


def names_overlap(a: str, b: str) -> bool:
    """Some full word (not an initial) is in both names: a surname alone."""
    return bool({t for t in _words(a) if len(t) > 1} & {t for t in _words(b) if len(t) > 1})


def names_match(a: str, b: str) -> bool:
    """Same person: the same words, or a shorter name of two or more words whose
    every full word is in the other and every initial starts one of the rest
    ("T. Saraswati" = "Telukutla Saraswati"). One shared word (a surname) is not.
    shortcut: word match only, no transliteration; a mismatch is a warn, never a fail."""
    x, y = _words(a), _words(b)
    if not x or not y:
        return False
    if x == y:
        return True
    small, big = (x, y) if len(x) <= len(y) else (y, x)
    full = {t for t in small if len(t) > 1}
    if len(small) < 2 or not full or not full <= set(big):
        return False
    rest = [t for t in big if t not in full]
    return all(any(r.startswith(i) for r in rest) for i in small if len(i) == 1)


#: What a corpus or a careless entry writes for "no value".
_PLACEHOLDERS = {"na", "n/a", "nil"}


def recorded(text: str) -> bool:
    """A real value, not '—', '-', '()', '/', 'N/A', 'NA' or 'nil'."""
    t = rm.no_value(text)
    return bool(t) and t.lower().strip(" .") not in _PLACEHOLDERS


#: A tax paper that is not a receipt of land or property tax paid.
_NOT_RECEIPT = re.compile(r"\b(demand|notice|income)\b", re.I)
_RECEIPT_TYPE = re.compile(r"tax[\s_-]*receipt", re.I)
_RECEIPT_WORD = re.compile(r"\b(receipt|challan|paid)\b", re.I)
_LAND_TAX = re.compile(r"\b(land|property|house|municipal|panchayat|kist)\b", re.I)
_YEAR = re.compile(r"\b(19\d{2}|20\d{2})\b")


def _paper_year(p: dict):
    """(year, month or 0) the paper is from, or None when nothing says."""
    d = str(p.get("date") or "")
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", d) or None
    if m:
        return int(m.group(3)), int(m.group(2))
    m = re.match(r"^(\d{4})-(\d{2})", d)
    if m:
        return int(m.group(1)), int(m.group(2))
    years = [int(y) for y in _YEAR.findall(f"{d} {p.get('name') or ''}")]
    return (max(years), 0) if years else None


def tax_receipt(papers: list, today: date):
    """(status, detail) for the best tax paper on file, or None when there is none.
    A receipt counts when it is from this or the last financial year (April to
    March) or carries no date; an older one, or a demand notice, is a warn."""
    fy = today.year if today.month >= 4 else today.year - 1
    receipts, other = [], False
    for p in papers or []:
        text = f"{p.get('name') or ''} {p.get('doc_type') or ''}"
        if _NOT_RECEIPT.search(text):
            other = True
        elif (_RECEIPT_TYPE.search(p.get("doc_type") or "") or p.get("shelf") == "search"
              or (_RECEIPT_WORD.search(text) and _LAND_TAX.search(text))):
            receipts.append(_paper_year(p))
        else:
            other = True
    if not receipts:
        return ("warn", "Tax paper found, not a receipt") if other else None
    if any(r is None for r in receipts):
        return "pass", "Tax receipt in Documents"
    # A month before April belongs to the financial year that began the year before.
    start = max(y - (1 if 0 < m < 4 else 0) for y, m in receipts)
    if start >= fy - 1:
        return "pass", "Tax receipt in Documents"
    return "warn", f"Tax receipt from {max(y for y, _ in receipts)}"


def _claimed(claims: dict, key: str, source: str) -> list:
    return [c["value"] for c in claims.get(key, []) if c.get("source") == source and c.get("value")]


def evaluate(kind: str, vals: dict, claims: dict, acq: Optional[dict], facts: dict,
             policy: Optional[dict], today: date) -> list:
    """Every check for one property, in reading order.

    facts: title_papers, revenue_papers, map_papers (counts), deed_paper (the
    transfer's deed_document_id is a paper on this property), heir_paper,
    ec_paper, has_outline (bools), tax_papers (list of {name, doc_type,
    shelf, date}), tax_expense (spent_on dates of tax paid with a receipt in
    Money; '' when undated), passbook_owner (str)."""
    parcel = kind == "parcel"
    # A placeholder ('-', 'N/A', '()') is no value, so it cannot pass a check.
    v = lambda k: (vals.get(k) or "").strip() if recorded(vals.get(k) or "") else ""  # noqa: E731
    a = acq or {}
    out = []

    # 1. Registered title deed on file.
    label = "Registered title deed on file"
    if a.get("mode") == "inheritance" and facts.get("heir_paper"):
        out.append(_check("deed", label, "pass", "Inherited · legal-heir certificate on file"))
    elif a.get("mode") == "inheritance" and a.get("proof_no"):
        out.append(_check("deed", label, "warn",
                          f"Legal-heir certificate {a['proof_no']} noted, but the certificate is not uploaded",
                          "upload"))
    elif v("registered") == "yes" and v("doc_no"):
        if facts.get("deed_paper") or facts.get("title_papers"):
            out.append(_check("deed", label, "pass", f"Deed {v('doc_no')} on file"))
        else:
            out.append(_check("deed", label, "warn",
                              f"Deed {v('doc_no')} noted, but the deed itself is not uploaded",
                              "upload", "doc_no"))
    elif v("registered") == "yes":
        out.append(_check("deed", label, "fail", "Registered, but the document number is missing",
                          "add", "doc_no"))
    elif v("registered") == "no":
        out.append(_check("deed", label, "fail", "You said the title is not registered",
                          "add", "registered"))
    elif facts.get("title_papers"):
        out.append(_check("deed", label, "unknown",
                          "A deed is uploaded; say whether it is registered", "add", "registered"))
    else:
        out.append(_check("deed", label, "fail", "No deed on file", "upload", "doc_no"))

    # 2. Title chain: who held it before.
    label = "Title chain recorded"
    froms = [p.get("name", "") for p in a.get("from_parties") or [] if p.get("name")]
    chain = int(a.get("chain_length") or 0)
    if chain > 1:
        out.append(_check("chain", label, "pass", f"{chain} deeds in the chain"))
    elif froms:
        out.append(_check("chain", label, "pass", f"Earlier owner: {froms[0]}"))
    elif int(facts.get("title_papers") or 0) > 1:
        out.append(_check("chain", label, "pass", f"{facts['title_papers']} title documents on file"))
    else:
        out.append(_check("chain", label, "fail", "Who held it before you is not recorded",
                          "add", "from_parties"))

    # 3. Khata / passbook (a plot's khata or tax assessment).
    if parcel:
        have = v("khata_no") or v("passbook_no")
        if have:
            out.append(_check("khata", "Khata / passbook recorded", "pass",
                              f"Khata {v('khata_no')}" if v("khata_no") else f"Passbook {v('passbook_no')}"))
        elif facts.get("revenue_papers"):
            out.append(_check("khata", "Khata / passbook recorded", "warn",
                              "A passbook or 1-B is uploaded, but the khata number is not recorded",
                              "add", "khata_no"))
        else:
            out.append(_check("khata", "Khata / passbook recorded", "fail",
                              "No khata or passbook number", "add", "khata_no"))
    else:
        label = "Khata / tax assessment recorded"
        if v("khata_no") or v("assessment_no"):
            out.append(_check("khata", label, "pass",
                              f"Khata {v('khata_no')}" if v("khata_no") else f"Assessment {v('assessment_no')}"))
        else:
            out.append(_check("khata", label, "fail", "No khata or tax assessment number",
                              "add", "khata_no"))

    # 4. Mutation in the owner's name.
    label = "Mutation in your name"
    text = v("mutation_status").lower()
    buyers = [p.get("name", "") for p in a.get("to_parties") or [] if p.get("name")]
    holder = (facts.get("passbook_owner") or "").strip()
    if text:
        shown = vals["mutation_status"].strip()
        if re.search(r"\b(not|no|rejected|refused)\b", text):
            out.append(_check("mutation", label, "fail", f"You noted: {shown}", "order",
                              "mutation_status", "mutation"))
        elif re.search(r"\b(pending|applied|awaiting|in progress|filed)\b", text):
            out.append(_check("mutation", label, "warn", f"You noted: {shown}", "add", "mutation_status"))
        elif re.search(r"\b(done|complete|completed|mutated|yes|effected)\b", text):
            out.append(_check("mutation", label, "pass", f"You noted: {shown}"))
        else:
            out.append(_check("mutation", label, "unknown", f"You noted “{shown}”, which does not say",
                              "add", "mutation_status"))
    elif parcel and holder and buyers:
        if any(names_match(holder, b) for b in buyers):
            out.append(_check("mutation", label, "pass", f"Passbook is in {holder}'s name"))
        elif any(names_overlap(holder, b) for b in buyers):
            out.append(_check("mutation", label, "warn",
                              f"Passbook name differs: {holder}; the deed names {buyers[0]}", "order",
                              "mutation_status", "mutation"))
        else:
            out.append(_check("mutation", label, "warn",
                              f"Passbook names {holder}; the deed names {buyers[0]}", "order",
                              "mutation_status", "mutation"))
    else:
        out.append(_check("mutation", label, "unknown", "Mutation status not recorded",
                          "add", "mutation_status"))

    # 5. Survey number (or plot) and extent.
    if parcel:
        label, need = "Survey number and extent recorded", ["survey_no", "extent"]
        gone = [k for k in need if not v(k)]
    else:
        label = "Plot and extent recorded"
        gone = ([] if (v("survey_no") or v("plot_no") or v("door_no")) else ["plot_no"]) + (
            [] if v("extent") else ["extent"])
    if not gone:
        where = v("survey_no") if parcel else (v("plot_no") or v("door_no") or v("survey_no"))
        out.append(_check("survey", label, "pass", f"{where} · {rm.display(rm.FIELDS['extent'], v('extent'))}"))
    else:
        words = {"survey_no": "survey number", "extent": "extent", "plot_no": "plot or door number"}
        out.append(_check("survey", label, "fail",
                          " and ".join(words[k] for k in gone).capitalize() + " not recorded",
                          "add", gone[0]))

    # 6. Deed extent against the revenue extent (farmland only).
    if parcel:
        label, f = "Deed extent matches revenue extent", rm.FIELDS["extent"]
        deed, rev = _claimed(claims, "extent", "deed_reading"), _claimed(claims, "extent", "passbook_reading")
        if deed and rev:
            if rm.same(f, deed[-1], rev[-1]):
                out.append(_check("extent_match", label, "pass",
                                  f"Both say {rm.display(f, rev[-1])}"))
            else:
                out.append(_check("extent_match", label, "warn",
                                  f"Deed says {rm.display(f, deed[-1])}, passbook says {rm.display(f, rev[-1])}",
                                  "add", "extent"))
        else:
            out.append(_check("extent_match", label, "unknown",
                              "Needs both the deed and the passbook read" if not (deed or rev) else
                              ("Needs the passbook or 1-B read" if deed else "Needs the deed read"),
                              "upload", "extent"))

    # 7. LP number / ULPIN — only where the village is resurveyed.
    if parcel:
        label = "LP number / ULPIN"
        if v("lp_no") or v("ulpin"):
            out.append(_check("lp", label, "pass",
                              f"LP {v('lp_no')}" if v("lp_no") else f"ULPIN {v('ulpin')}"))
        elif v("old_survey_no"):
            out.append(_check("lp", label, "fail", "The village is resurveyed, but the LP number is missing",
                              "add", "lp_no"))
        else:
            out.append(_check("lp", label, "unknown",
                              "Only for resurveyed villages; not known whether yours is", "add", "lp_no"))

    # 8. Boundaries.
    sides = ("north", "south", "east", "west")
    gone = [s for s in sides if not recorded(v(f"boundary_{s}"))]
    if not gone:
        out.append(_check("boundaries", "Boundaries recorded", "pass", "All four sides"))
    else:
        out.append(_check("boundaries", "Boundaries recorded", "fail",
                          "No side recorded" if len(gone) == 4
                          else ", ".join(s.title() for s in gone) + " not recorded",
                          "add", f"boundary_{gone[0]}"))

    # 9. Encumbrance certificate, at most 12 months old.
    label, ec = "Encumbrance certificate on file", v("ec_date")
    try:
        age = (today - date.fromisoformat(ec[:10])).days if ec else None
    except ValueError:
        age = None
    bought = (a.get("reg_date") or v("reg_date"))[:10]
    if age is not None and age < 0:
        out.append(_check("ec", label, "warn", f"EC date {_dmy(ec)} is in the future", "add", "ec_date"))
    elif age is not None and re.match(r"^\d{4}-\d{2}-\d{2}$", bought) and ec[:10] < bought:
        # An EC taken before the purchase cannot show what was charged after it.
        out.append(_check("ec", label, "warn", "EC is older than your deed", "order", "ec_date", "ec"))
    elif age is not None and age <= EC_MAX_DAYS and facts.get("ec_paper"):
        out.append(_check("ec", label, "pass", f"Checked on {_dmy(ec)}"))
    elif age is not None and age <= EC_MAX_DAYS:
        out.append(_check("ec", label, "warn", f"EC of {_dmy(ec)} noted, but the EC itself is not uploaded",
                          "upload", "ec_date"))
    elif age is not None:
        out.append(_check("ec", label, "warn", f"Checked on {_dmy(ec)}, more than 12 months ago",
                          "order", "ec_date", "ec"))
    elif facts.get("ec_paper") or v("ec_status"):
        out.append(_check("ec", label, "warn", "On file, but its date is not recorded", "add", "ec_date"))
    else:
        out.append(_check("ec", label, "fail", "No EC on file", "order", "ec_date", "ec"))

    # 10. No court case. The column cannot tell "no" from "not asked" (A11),
    # so a pass needs the owner's own "no".
    label = "No court case recorded"
    said = [c["value"] for c in claims.get("litigation", []) if c.get("value")]
    if v("litigation") == "yes":
        note = v("litigation_note")
        out.append(_check("court", label, "fail", f"Court case: {note}" if note else "A court case is recorded",
                          "add", "litigation_note"))
    elif said and said[-1] == "no":
        out.append(_check("court", label, "pass", "You said there is none"))
    else:
        out.append(_check("court", label, "unknown", "Not answered yet", "add", "litigation"))

    # 11. Land or property tax receipt.
    label = "Land tax receipt on file" if parcel else "Property tax receipt on file"
    paper = tax_receipt(facts.get("tax_papers") or [], today)
    paid = tax_receipt([{"doc_type": "tax receipt", "date": d} for d in facts.get("tax_expense") or []], today)
    if paper and paper[0] == "pass":
        out.append(_check("tax", label, "pass", paper[1]))
    elif paid and paid[0] == "pass":
        out.append(_check("tax", label, "pass", "Tax paid, with receipt, in Money"))
    elif paper or paid:
        out.append(_check("tax", label, "warn", (paper or paid)[1], "upload"))
    else:
        out.append(_check("tax", label, "fail", "No tax receipt on file", "upload"))

    # Policy-driven: what the property's governance checklist adds.
    for item in (policy or {}).get("items") or []:
        key = str(item.get("key") or "")
        if not key or key in _COVERED:
            continue
        title = str(item.get("title") or key)
        if key in _MAP_ITEMS:
            if facts.get("map_papers"):
                out.append(_check(f"policy.{key}", title, "pass", "Map in Documents"))
            elif facts.get("has_outline"):
                # An outline the owner drew is not the survey office's sketch.
                out.append(_check(f"policy.{key}", title, "warn", "Outline drawn by you; no FMB on file",
                                  "order", "", "fmb_copy"))
            else:
                out.append(_check(f"policy.{key}", title, "fail", "No map on file", "order", "",
                                  "fmb_copy"))
        else:
            why = str(item.get("why") or "").strip()
            review = item.get("level") == "review"
            out.append(_check(f"policy.{key}", title, "unknown",
                              ("Check this yourself: " if review else "Not checked from your documents yet: ") + why,
                              "none" if review else "upload"))
    return out
