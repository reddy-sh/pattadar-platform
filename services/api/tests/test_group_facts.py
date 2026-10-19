"""Typed group facts and member roles (final spec approved by Reddy, 11/10/2026).

A group's facts (PAN, CIN, deed date, country...) and a member's (DIN,
appointed on...) are one JSON object in a `facts` column, checked against
GROUP_TYPES. The catalogue's checked-in web copy is held equal here; regenerate
it with:

    GROUP_TYPES_WRITE=1 LC_ALL=C python -m pytest tests/test_group_facts.py -k catalogue

The mutation cases run against an isolated temporary PostgreSQL (no application
database is contacted) and skip when postgres binaries are absent.
"""
import asyncio
from contextlib import asynccontextmanager
from datetime import date, timedelta
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import types

import psycopg
from psycopg.rows import dict_row
import pytest

from src import main

OWNER = "owner"
CATALOGUE = Path(__file__).resolve().parents[3] / "apps/web/src/pages/families/groupTypes.json"
CIN = "U01100TG2015PTC123456"

_TEXT = "TEXT NOT NULL DEFAULT ''"
_MEMBER_TEXT = ("name relation gender dob phone email bio photo father_id mother_id spouse_id kind status "
                "invite_token invite_status invite_channel parcel_id present_address aadhaar_masked "
                "aadhaar_enc aadhaar_record_id guardian_name guardian_contact marital_status spouse_name "
                "spouse_contact spouse_status inactivity_email_consent_at created_at group_id role "
                "heir_confirmed heir_note legacy_beneficiary_id").split()
SCHEMA = f"""
DROP SCHEMA public CASCADE; CREATE SCHEMA public;
CREATE TABLE users (id TEXT PRIMARY KEY, name {_TEXT}, address {_TEXT}, last_active_at {_TEXT});
CREATE TABLE groups (
  id TEXT PRIMARY KEY, owner_user_id {_TEXT}, type TEXT NOT NULL DEFAULT 'family',
  name {_TEXT}, description {_TEXT}, facts TEXT NOT NULL DEFAULT '{{}}',
  created_at {_TEXT}, updated_at {_TEXT});
CREATE TABLE family_members (
  id TEXT PRIMARY KEY, owner_user_id {_TEXT},
  {", ".join(f"{c} {_TEXT}" for c in _MEMBER_TEXT)},
  facts TEXT NOT NULL DEFAULT '{{}}',
  is_self BOOLEAN NOT NULL DEFAULT false, is_beneficiary BOOLEAN NOT NULL DEFAULT false,
  is_minor BOOLEAN NOT NULL DEFAULT false, phone_verified BOOLEAN NOT NULL DEFAULT false,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  inactivity_email_consent BOOLEAN NOT NULL DEFAULT false, share_pct REAL NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX family_self ON family_members(owner_user_id, group_id) WHERE is_self;
CREATE TABLE passbooks (id TEXT PRIMARY KEY, owner_user_id {_TEXT}, owner_name {_TEXT}, group_id {_TEXT});
CREATE TABLE parcels (id TEXT PRIMARY KEY, passbook_id {_TEXT}, extent REAL DEFAULT 0,
  archived BOOLEAN DEFAULT false);
CREATE TABLE properties (id TEXT PRIMARY KEY, owner_user_id {_TEXT}, group_id {_TEXT},
  builtup_area REAL DEFAULT 0, land_area REAL DEFAULT 0, archived BOOLEAN DEFAULT false);
CREATE TABLE inactivity_escalations (owner_user_id {_TEXT}, group_id {_TEXT}, stage {_TEXT},
  next_action_at {_TEXT}, last_outcome {_TEXT});
CREATE TABLE invitations (id TEXT PRIMARY KEY, scope_type {_TEXT}, scope_id {_TEXT}, role {_TEXT},
  invitee_contact {_TEXT}, token {_TEXT}, expiry {_TEXT}, status {_TEXT}, created_at {_TEXT});
CREATE TABLE family_notifiers (owner_user_id {_TEXT}, group_id {_TEXT}, member_id {_TEXT});
INSERT INTO users (id, name) VALUES ('owner', 'Ravi Telukutla');
"""


def info(owner=OWNER):
    return types.SimpleNamespace(
        context={"request": types.SimpleNamespace(headers={"x-user-id": owner})})


@pytest.fixture(scope="module")
def isolated_postgres():
    initdb, pg_ctl = shutil.which("initdb"), shutil.which("pg_ctl")
    if not initdb or not pg_ctl or os.geteuid() == 0:
        pytest.skip("Temporary postgres requires initdb/pg_ctl and a non-root user")
    with tempfile.TemporaryDirectory(prefix="pattadar-facts-") as directory:
        root = Path(directory)
        data = root / "data"
        subprocess.run([initdb, "-D", str(data), "-A", "trust", "--no-locale", "--encoding=UTF8"],
                       check=True, capture_output=True)
        subprocess.run([pg_ctl, "-D", str(data), "-l", str(root / "postgres.log"), "-o",
                        f"-k {root} -h '' -p 55497", "-w", "start"], check=True, capture_output=True)
        try:
            yield f"host={root} port=55497 dbname=postgres"
        finally:
            subprocess.run([pg_ctl, "-D", str(data), "-m", "immediate", "-w", "stop"],
                           check=True, capture_output=True)


@pytest.fixture
def db(isolated_postgres, monkeypatch):
    with psycopg.connect(isolated_postgres, autocommit=True) as conn:
        conn.execute(SCHEMA)

    class Pool:
        @asynccontextmanager
        async def connection(self):
            async with await psycopg.AsyncConnection.connect(
                    isolated_postgres, autocommit=True, row_factory=dict_row) as conn:
                yield conn

    audits = []

    async def log_audit(_conn, actor, action, target, details="", **kwargs):
        audits.append({"action": action, "target": target, "details": details,
                       "metadata": kwargs.get("metadata")})

    monkeypatch.setattr(main, "pool", Pool())
    monkeypatch.setattr(main, "log_audit", log_audit)
    return types.SimpleNamespace(dsn=isolated_postgres, audits=audits)


def one(db, query, args=()):
    with psycopg.connect(db.dsn, autocommit=True, row_factory=dict_row) as conn:
        return conn.execute(query, args).fetchone()


M = main.Mutation()


def create(type_, facts=None, name="G"):
    return asyncio.run(M.create_group(info(), type=type_, name=name, facts=facts))


def add(gid, role, facts=None, **kw):
    return asyncio.run(M.add_member(info(), group_id=gid, name=kw.pop("name", "Sita"), role=role,
                                    facts=facts, **kw))


def clean(type_, facts, member=False, **kw):
    fields = main.GROUP_TYPES[type_]["member_fields" if member else "fields"]
    out = main._clean_facts(json.dumps(facts), fields, **kw)
    return json.loads(out)


# ── The catalogue ───────────────────────────────────────────────────────

def test_catalogue_matches_the_checked_in_web_copy():
    text = json.dumps(main.GROUP_TYPES, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
    if os.getenv("GROUP_TYPES_WRITE"):
        CATALOGUE.write_text(text, encoding="utf-8")
    assert CATALOGUE.read_text(encoding="utf-8") == text, (
        "apps/web/src/pages/families/groupTypes.json is stale; regenerate it with "
        "GROUP_TYPES_WRITE=1 LC_ALL=C python -m pytest tests/test_group_facts.py -k catalogue")


def test_catalogue_is_well_formed():
    for t, gt in main.GROUP_TYPES.items():
        assert gt["primary_role"] in gt["roles"], t
        assert gt["default_role"] in gt["roles"], t
        assert set(gt["share_roles"]) <= set(gt["roles"]), t
        assert [f["key"] for f in gt["fields"]][0] == "country", t
        for scope, fields, outer in (("fields", gt["fields"], []),
                                     ("member_fields", gt["member_fields"], gt["fields"])):
            seen = list(outer)
            for f in fields:
                assert f["kind"] in ("text", "date", "select", "country"), (t, f["key"])
                assert f["label"] and f["label"][0].isupper(), (t, f["key"])
                if f["kind"] == "select":
                    assert f["options"], (t, f["key"])
                if f.get("pattern"):
                    re.compile(f["pattern"])
                for c in f.get("when", ()):
                    # A condition reads a select (or the country) listed earlier.
                    src = [s for s in seen if s["key"] == c["key"]]
                    assert src and src[0]["kind"] in ("select", "country"), (t, f["key"], c)
                    assert set(c) <= {"key", "in", "not"} and ("in" in c) != ("not" in c)
                    if src[0]["kind"] == "select":
                        assert set(c.get("in", c.get("not"))) <= set(src[0]["options"]), (t, f["key"])
                assert set(f.get("roles", ())) <= set(gt["roles"]), (t, f["key"])
                if f.get("pan4"):
                    sub = next((s for s in gt["fields"] if s["key"] == "sub_kind"), None)
                    assert set(f["pan4"]) - {"*"} <= set(sub["options"] if sub else ()), t
                seen.append(f)
            # A key used twice (resolution_on) is never shown twice at once.
            keys = [f["key"] for f in fields]
            for k in {k for k in keys if keys.count(k) > 1}:
                subs = next(s for s in gt["fields"] if s["key"] == "sub_kind")["options"]
                for sub in subs:
                    shown = [f for f in fields if f["key"] == k and main._fact_shown(
                        f, {"sub_kind": sub}, (f.get("roles") or [None])[0])]
                    assert len(shown) == 1, (t, k, sub)


def test_role_sets_keep_every_stored_value():
    # Old rows, iOS and Expo depend on these spellings; "Member" is what the
    # native clients send for every type.
    for t, roles in (("partnership", ["Managing Partner", "Partner", "Member"]),
                     ("company", ["Director", "Shareholder", "Authorized Signatory", "Member"]),
                     ("huf", ["Karta", "Coparcener", "Member"]),
                     ("trust", ["Trustee", "Beneficiary", "Member"])):
        assert set(roles) <= set(main.GROUP_TYPES[t]["roles"]), t
    assert {t: g["default_role"] for t, g in main.GROUP_TYPES.items() if t != "family"} == {
        "partnership": "Partner", "company": "Director", "huf": "Coparcener", "trust": "Trustee"}


# ── _clean_facts / _clean_role (no database) ────────────────────────────

def test_company_facts_are_normalised_and_unknown_keys_dropped():
    out = clean("company", {"sub_kind": "private limited", "cin": CIN.lower(), "pan": " aaaca1234a ",
                            "junk": "x", "gstin": "36AAACA1234A1Z5", "address": "  1  Main   Rd "})
    assert out == {"sub_kind": "Private limited", "cin": CIN, "pan": "AAACA1234A", "address": "1 Main Rd"}


@pytest.mark.parametrize("facts,label", [
    ({"sub_kind": "Private limited", "cin": "U123"}, "CIN"),
    ({"sub_kind": "Limited by guarantee"}, "Kind of company"),
    ({"incorporated_on": "01/02/2020"}, "Date of incorporation"),
    ({"incorporated_on": "20200101"}, "Date of incorporation"),
    ({"incorporated_on": "2020-02-30"}, "Date of incorporation"),
    ({"pan": "AAAC1234A"}, "PAN"),
    ({"country": "USA"}, "Country"),
    ({"address": ["not", "text"]}, "Registered office"),
])
def test_bad_values_are_refused_with_the_label(facts, label):
    with pytest.raises(ValueError, match=f"^{re.escape(label)} does not look right"):
        clean("company", facts)


def test_future_past_dates_are_refused_with_a_days_grace():
    far = (date.today() + timedelta(days=3)).isoformat()
    with pytest.raises(ValueError, match="Date of incorporation cannot be in the future"):
        clean("company", {"incorporated_on": far})
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    assert clean("company", {"incorporated_on": tomorrow}) == {"incorporated_on": tomorrow}
    # A planned cessation is not a "past" date.
    assert clean("company", {"ceased_on": far}, member=True) == {"ceased_on": far}


def test_too_long_values_are_refused_never_cut():
    with pytest.raises(ValueError, match="^Registered office is too long"):
        clean("company", {"address": "x" * 201})
    with pytest.raises(ValueError, match="too long"):
        main._clean_facts("{" + " " * 8001 + "}", main.GROUP_TYPES["company"]["fields"])
    for raw in ("[]", "not json", '"x"'):
        with pytest.raises(ValueError, match="could not be read"):
            main._clean_facts(raw, main.GROUP_TYPES["company"]["fields"])
    assert main._clean_facts(None, []) is None
    assert main._clean_facts("", main.GROUP_TYPES["huf"]["fields"]) == "{}"


def test_a_personal_pan_is_refused_in_every_entity_pan():
    for t, word in (("partnership", "firm"), ("company", "company"), ("huf", "HUF"), ("trust", "trust")):
        with pytest.raises(ValueError, match=f"This is a personal PAN; enter the {word}'s PAN"):
            clean(t, {"pan": "ABCPE1234F"})
    # The 4th letter otherwise only warns on the web: an F in a company PAN is kept.
    assert clean("company", {"pan": "AAAFA1234A"}) == {"pan": "AAAFA1234A"}


def test_hidden_fields_are_dropped():
    # LLP: CIN goes, LLPIN stays.
    assert clean("company", {"sub_kind": "LLP", "cin": CIN, "llpin": "aab-1234"}) == {
        "sub_kind": "LLP", "llpin": "AAB-1234"}
    # Unregistered firm: no registration number.
    assert clean("partnership", {"registered": "No", "reg_no": "1234/2019"}) == {"registered": "No"}
    # A dependent of a dropped field goes with it (sanction_authority after sanction).
    assert clean("trust", {"sub_kind": "Private trust", "sanction": "Yes", "sanction_authority": "Board",
                           "reg_no": "9"}) == {"sub_kind": "Private trust"}
    assert clean("trust", {"sub_kind": "Waqf", "sanction": "Yes", "sanction_authority": "State Waqf Board"}) == {
        "sub_kind": "Waqf", "sanction": "Yes", "sanction_authority": "State Waqf Board"}
    assert clean("huf", {"partition": "None", "partition_on": "2001-01-01"}) == {"partition": "None"}


def test_a_us_company_uses_generic_fields_and_drops_indian_ones():
    out = clean("company", {"country": "us", "sub_kind": "Private limited", "tax_id": "12-3456789",
                            "reg_no": "DE 7654321", "cin": CIN, "pan": "AAACA1234A"})
    assert out == {"country": "US", "sub_kind": "Private limited", "tax_id": "12-3456789",
                   "reg_no": "DE 7654321"}
    # No Indian format applies abroad: any tax id is text.
    assert clean("partnership", {"country": "GB", "tax_id": "1234567890"})["tax_id"] == "1234567890"


def test_an_indian_company_without_a_country_is_indian():
    out = clean("company", {"sub_kind": "Public limited", "cin": CIN, "tax_id": "X", "reg_no": "Y"})
    assert out == {"sub_kind": "Public limited", "cin": CIN}
    assert clean("company", {"country": "IN", "cin": CIN}) == {"country": "IN", "cin": CIN}
    # Family personal law is Indian only.
    assert clean("family", {"personal_law": "hindu"}) == {"personal_law": "Hindu"}
    assert clean("family", {"country": "AE", "personal_law": "Hindu"}) == {"country": "AE"}


def test_member_fields_follow_role_and_the_groups_country():
    din = {"din": "01234567", "appointed_on": "2020-01-01"}
    assert clean("company", din, member=True, role="Director") == din
    assert clean("company", din, member=True, role="Shareholder") == {"appointed_on": "2020-01-01"}
    assert clean("company", din, member=True, role="Director", context={"country": "US"}) == {
        "appointed_on": "2020-01-01"}
    with pytest.raises(ValueError, match="^DIN does not look right"):
        clean("company", {"din": "1234"}, member=True, role="Managing director")
    assert clean("company", {"dpin": "87654321"}, member=True, role="Designated partner") == {"dpin": "87654321"}
    res = {"resolution_on": "2024-05-01"}
    assert clean("company", res, member=True, role="Authorized Signatory", context={"sub_kind": "LLP"}) == res
    assert clean("company", res, member=True, role="Director") == {}


def test_restored_facts_are_held_to_the_catalogue():
    from src.account_restore import clean_facts
    groups: dict = {}
    g = {"id": "g1", "type": "company", "facts": json.dumps(
        {"sub_kind": "private limited", "cin": CIN, "free text 1234": "x", "country": {"a": 1}})}
    clean_facts("groups", g, groups)
    assert g["facts"] == "{}"  # a non-text country is refused, so nothing is kept
    g = {"id": "g1", "type": "company", "facts": json.dumps({"sub_kind": "LLP", "llpin": "aab-1234", "junk": "x"})}
    clean_facts("groups", g, groups)
    assert json.loads(g["facts"]) == {"sub_kind": "LLP", "llpin": "AAB-1234"}
    m = {"group_id": "g1", "role": "Authorized Signatory",
         "facts": json.dumps({"resolution_on": "2024-05-01", "din": "01234567", "k": "v"})}
    clean_facts("family_members", m, groups)
    assert json.loads(m["facts"]) == {"resolution_on": "2024-05-01"}
    m = {"group_id": "g1", "role": "Director", "facts": "{" + " " * 9000 + "}"}
    clean_facts("family_members", m, groups)
    assert m["facts"] == "{}"
    other = {"facts": "untouched"}
    clean_facts("parcels", other, groups)
    assert other == {"facts": "untouched"}


def test_clean_role():
    assert main._clean_role("partnership", None) is None
    assert main._clean_role("partnership", "  sleeping   PARTNER ") == "Sleeping partner"
    assert main._clean_role("huf", "karta") == "Karta"
    assert main._clean_role("partnership", "Advisor") == "Advisor"
    assert main._clean_role("family", "") == ""
    with pytest.raises(ValueError, match="Give this member a role"):
        main._clean_role("company", "   ")
    with pytest.raises(ValueError, match="under 60"):
        main._clean_role("trust", "x" * 61)
    assert main._clean_role("trust", "x" * 60) == "x" * 60


# ── Mutations (isolated PostgreSQL) ─────────────────────────────────────

def test_create_group_stores_clean_facts_and_the_right_self_role(db):
    g = create("company", json.dumps({"sub_kind": "private limited", "cin": CIN.lower(), "x": "y"}))
    assert json.loads(g.facts) == {"sub_kind": "Private limited", "cin": CIN}
    assert g.my_role == "Director"
    assert create("company", json.dumps({"sub_kind": "LLP"})).my_role == "Designated partner"
    assert create("trust", json.dumps({"sub_kind": "Cooperative society"})).my_role == "Secretary"
    assert create("trust", json.dumps({"sub_kind": "Waqf"})).my_role == "Trustee"
    # Name-only clients (iOS, Expo, the older screen) still create groups.
    plain = create("partnership")
    assert plain.facts == "{}" and plain.my_role == "Managing Partner"
    with pytest.raises(ValueError, match="CIN does not look right"):
        create("company", json.dumps({"sub_kind": "Section 8", "cin": "bad"}))


def test_a_us_company_is_created_without_a_cin(db):
    g = create("company", json.dumps({"country": "US", "sub_kind": "Other", "tax_id": "12-3456789",
                                      "reg_no": "C1234567", "cin": CIN}))
    assert json.loads(g.facts) == {"country": "US", "sub_kind": "Other", "tax_id": "12-3456789",
                                   "reg_no": "C1234567"}


def test_update_group_keeps_facts_when_omitted_and_audits_changed_keys_only(db):
    g = create("company", json.dumps({"sub_kind": "Private limited", "cin": CIN, "address": "Hyderabad"}))
    r = asyncio.run(M.update_group(info(), id=g.id, name="Renamed", description="d"))
    assert r.name == "Renamed" and json.loads(r.facts)["cin"] == CIN
    assert db.audits[-1]["metadata"] == {"fields": ""}
    r = asyncio.run(M.update_group(info(), id=g.id, name="Renamed", facts=json.dumps(
        {"sub_kind": "LLP", "llpin": "AAB-1234", "address": "Hyderabad"})))
    assert json.loads(r.facts) == {"sub_kind": "LLP", "llpin": "AAB-1234", "address": "Hyderabad"}
    meta = db.audits[-1]["metadata"]
    assert meta == {"fields": "cin,llpin,sub_kind"}
    assert CIN not in json.dumps(db.audits[-1]) and "AAB-1234" not in json.dumps(db.audits[-1])
    # A stored key outside the catalogue (an old restore) is never named in the audit.
    one(db, "UPDATE groups SET facts=%s WHERE id=%s RETURNING id", (json.dumps(
        {"sub_kind": "LLP", "llpin": "AAB-1234", "address": "Hyderabad", "note from an old backup": "x"}), g.id))
    asyncio.run(M.update_group(info(), id=g.id, name="Renamed", facts=json.dumps(
        {"sub_kind": "LLP", "llpin": "AAB-1234", "address": "Pune"})))
    assert db.audits[-1]["metadata"] == {"fields": "address"}
    with pytest.raises(ValueError, match="LLPIN does not look right"):
        asyncio.run(M.update_group(info(), id=g.id, name="R", facts=json.dumps({"sub_kind": "LLP",
                                                                                 "llpin": "1"})))
    assert json.loads(one(db, "SELECT facts FROM groups WHERE id=%s", (g.id,))["facts"])["llpin"] == "AAB-1234"
    with pytest.raises(main.NotAuthorized):
        asyncio.run(M.update_group(info("intruder"), id=g.id, name="Mine", facts="{}"))


def test_add_member_roles_and_facts(db):
    firm = create("partnership").id
    assert add(firm, "sleeping partner").role == "Sleeping partner"
    assert add(firm, "Advisor").role == "Advisor"
    assert add(firm, "Member").role == "Member"
    with pytest.raises(ValueError, match="Give this member a role"):
        add(firm, "")
    with pytest.raises(ValueError, match="under 60"):
        add(firm, "x" * 61)
    fam = create("family").id
    assert add(fam, "", relation="son").role == ""
    co = create("company", json.dumps({"sub_kind": "Private limited"})).id
    p = add(co, "director", json.dumps({"din": "01234567", "dpin": "11111111", "junk": "x"}))
    assert p.role == "Director" and json.loads(p.facts) == {"din": "01234567"}
    with pytest.raises(ValueError, match="DIN does not look right"):
        add(co, "Director", json.dumps({"din": "12"}))
    abroad = create("company", json.dumps({"country": "US"})).id
    assert add(abroad, "Director", json.dumps({"din": "01234567"})).facts == "{}"


def test_update_member_and_set_share_keep_facts(db):
    co = create("company", json.dumps({"sub_kind": "Private limited"})).id
    p = add(co, "Director", json.dumps({"din": "01234567", "appointed_on": "2020-01-01"}))
    r = asyncio.run(M.update_member(info(), id=p.id, phone="9999999999"))
    assert json.loads(r.facts) == {"din": "01234567", "appointed_on": "2020-01-01"}
    r = asyncio.run(M.set_member_share(info(), id=p.id, share_pct=10))
    assert json.loads(r.facts)["din"] == "01234567"
    # A new role re-checks the stored facts: a shareholder has no DIN.
    r = asyncio.run(M.update_member(info(), id=p.id, role="shareholder"))
    assert r.role == "Shareholder" and json.loads(r.facts) == {"appointed_on": "2020-01-01"}
    r = asyncio.run(M.update_member(info(), id=p.id, facts=json.dumps({"ceased_on": "2025-01-01"})))
    assert json.loads(r.facts) == {"ceased_on": "2025-01-01"}
    with pytest.raises(ValueError, match="Give this member a role"):
        asyncio.run(M.update_member(info(), id=p.id, role=""))


def test_a_non_family_share_is_not_an_heir_and_is_capped(db):
    firm = create("partnership").id
    a = add(firm, "Partner", phone="9000000001")
    b = add(firm, "Partner", name="Rama")
    r = asyncio.run(M.set_member_share(info(), id=a.id, share_pct=60))
    assert r.share_pct == 60 and r.is_beneficiary is False
    assert one(db, "SELECT count(*) AS c FROM invitations")["c"] == 0
    with pytest.raises(ValueError, match="Shares for this group would exceed 100%"):
        asyncio.run(M.set_member_share(info(), id=b.id, share_pct=50))
    with pytest.raises(ValueError, match="exceed 100%"):
        add(firm, "Partner", name="Lakshmi", share_pct=41)
    assert add(firm, "Partner", name="Lakshmi", share_pct=40).share_pct == 40
    # A family share still makes an heir, with its contact rule and invite.
    fam = create("family").id
    kid = add(fam, "", relation="son", phone="9000000002")
    r = asyncio.run(M.set_member_share(info(), id=kid.id, share_pct=50))
    assert r.is_beneficiary is True
    assert one(db, "SELECT count(*) AS c FROM invitations")["c"] == 1
