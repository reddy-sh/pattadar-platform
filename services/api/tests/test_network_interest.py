"""Pattadar Network register-interest: validation, honeypot, ceiling parsing,
log hygiene and the public-root schema rule — no database.

The phone and Aadhaar vectors are the same ones packages/core runs in
src/format/phone.test.ts and src/format/idNumber.test.ts (design AC 13, AC 22).
DB-backed behaviour lives in test_network_interest_db.py.
"""
import asyncio
import importlib
import logging
import types

import pytest

from src import main, network

NAME, PHONE, EMAIL = "Ravi Kumar", "9848012345", "Ravi@Example.com"
DISTRICT, MANDAL, NOTE = "Prakasam", "Ongole", "Two acres near the canal"
PII = (NAME, PHONE, "98480", EMAIL, EMAIL.lower(), DISTRICT, MANDAL, NOTE)


def submission(**overrides):
    base = dict(interest="sell", name=NAME, phone=PHONE, email="", district="", mandal="", note="",
                consent=True, consent_version=network.CONSENT_VERSION, website="")
    base.update(overrides)
    return types.SimpleNamespace(**base)


def check(**overrides):
    status, field, _ = network.validate(submission(**overrides))
    return status, field


# ── phone (AC 22 + design-review round 3 MEDIUM 1) ─────────────────────

VALID_PHONES = ["9848012345", "+91 98480 12345", "098480-12345", "919848012345", "(+91) 98480-12345"]
INVALID_PHONES = [
    "12345", "+91 5123456789", "+9198480123456", "09848012345678", "98480 1234a",
    "9८४८०१२३४५",            # Devanagari digits after an ASCII 9
    "९८४८०१२३४५",            # all Devanagari
    "+91 ९८४८०१२३४५",
    "౯౮౪౮౦౧౨౩౪౫",            # Telugu digits
    "９８４８０１２３４５",     # full-width digits
    "+91 98480 12345 000000",  # over-length raw input
]


@pytest.mark.parametrize("raw", VALID_PHONES)
def test_valid_phones_normalise_to_one_ascii_form(raw):
    assert network.normalise_phone(raw) == "+919848012345"
    _, _, row = network.validate(submission(phone=raw))
    assert row["phone"] == "+919848012345"
    assert row["phone"].isascii()
    assert row["contact_key"] == "9848012345"


@pytest.mark.parametrize("raw", INVALID_PHONES)
def test_invalid_phones_are_rejected(raw):
    assert network.normalise_phone(raw) is None
    assert check(phone=raw) == ("invalid", "phone")


# ── Aadhaar-like runs (AC 13) ──────────────────────────────────────────

AADHAAR_RUNS = ["1234 5678 9012", "123456789012", "1234-5678-9012"]
NOT_AADHAAR = ["Ravi Kumar", "Survey 123/4", "12345678901", "1234567890123"]


@pytest.mark.parametrize("field", ["name", "district", "mandal", "note"])
@pytest.mark.parametrize("run", AADHAAR_RUNS)
def test_aadhaar_like_run_rejected_in_every_free_text_field(field, run):
    assert check(**{field: run}) == ("invalid", field)


@pytest.mark.parametrize("field", ["name", "district", "mandal", "note"])
@pytest.mark.parametrize("text", NOT_AADHAAR)
def test_non_aadhaar_text_is_accepted(field, text):
    assert check(**{field: text}) == ("received", "")


def test_server_aadhaar_check_is_stricter_than_the_client_mirror():
    # Telugu digits: the ASCII-only client mirror lets this through; the
    # server's Unicode-aware _AADHAAR_LIKE is authoritative and refuses it.
    assert check(note="౧౨౩౪ ౫౬౭౮ ౯౦౧౨") == ("invalid", "note")


def test_over_length_is_reported_before_the_aadhaar_check():
    assert check(district="1234 5678 9012 " + "x" * 60) == ("invalid", "district")


# ── the rest of the validation table, in order ─────────────────────────

@pytest.mark.parametrize("overrides,expected", [
    (dict(interest="landlord"), ("invalid", "interest")),
    (dict(interest=""), ("invalid", "interest")),
    (dict(name=""), ("invalid", "name")),
    (dict(name=" R "), ("invalid", "name")),
    (dict(name="x" * 81), ("invalid", "name")),
    (dict(name="Ravi\x00Kumar"), ("invalid", "name")),
    (dict(phone="", email="not-an-email"), ("invalid", "email")),
    (dict(phone="", email="a@b"), ("invalid", "email")),
    (dict(phone="", email="a" * 250 + "@b.in"), ("invalid", "email")),
    (dict(phone="", email=""), ("invalid", "contact")),
    (dict(district="x" * 61), ("invalid", "district")),
    (dict(mandal="x" * 61), ("invalid", "mandal")),
    (dict(note="x" * 501), ("invalid", "note")),
    (dict(note="tab\there"), ("invalid", "note")),
    (dict(consent=False), ("consent_required", "consent")),
    (dict(consent_version="2020-01-01"), ("invalid", "consentVersion")),
    # First failure wins: interest is checked before everything else.
    (dict(interest="x", name="", phone="", consent=False), ("invalid", "interest")),
])
def test_validation_table(overrides, expected):
    assert check(**overrides) == expected


def test_clean_values_are_normalised():
    _, _, row = network.validate(submission(
        interest=" lawyer ", name="  Ravi Kumar ", phone="", email=" Ravi@Example.COM ",
        note="line one\nline two", district=None))
    assert row == {
        "interest": "lawyer", "name": "Ravi Kumar", "phone": "", "email": "ravi@example.com",
        "contact_key": "ravi@example.com", "district": "", "mandal": "", "note": "line one\nline two",
    }


def test_none_is_coerced_to_empty():
    assert check(phone=None, email=EMAIL) == ("received", "")
    assert check(phone=None, email=None) == ("invalid", "contact")


def test_every_interest_key_is_accepted():
    for key in network.INTERESTS:
        assert check(interest=key) == ("received", "")
    assert len(network.INTERESTS) == 10


# ── honeypot (AC 14) ───────────────────────────────────────────────────

class _NoPool:
    def connection(self):
        raise AssertionError("the honeypot must not touch the database")


def test_honeypot_short_circuits_before_validation_and_the_database(monkeypatch, caplog):
    monkeypatch.setattr(network, "_pool", lambda: _NoPool())
    caplog.set_level(logging.INFO, logger="pattadar.network")
    data = submission(name="", phone="", email="", consent=False, website="https://spam.example")
    result = asyncio.run(network.register(None, data))
    assert (result.status, result.field) == ("received", "")
    assert [r.getMessage() for r in caplog.records] == ["network.interest_honeypot"]


def test_rejections_never_reach_the_database(monkeypatch):
    monkeypatch.setattr(network, "_pool", lambda: _NoPool())
    result = asyncio.run(network.register(None, submission(consent=False)))
    assert (result.status, result.field) == ("consent_required", "consent")
    result = asyncio.run(network.register(None, submission(phone="12345")))
    assert (result.status, result.field) == ("invalid", "phone")


# ── log hygiene (AC 18) ────────────────────────────────────────────────

def test_rejection_logs_name_the_field_never_the_value(monkeypatch, caplog):
    monkeypatch.setattr(network, "_pool", lambda: _NoPool())
    caplog.set_level(logging.DEBUG)
    full = dict(name=NAME, phone=PHONE, email=EMAIL, district=DISTRICT, mandal=MANDAL, note=NOTE)
    for bad in (dict(note="1234 5678 9012"), dict(consent=False), dict(consent_version="old"),
                dict(interest="nope"), dict(mandal="x" * 61)):
        asyncio.run(network.register(None, submission(**{**full, **bad})))
    messages = [r.getMessage() for r in caplog.records]
    assert "network.interest_rejected reason=note" in messages
    assert "network.interest_rejected reason=consent" in messages
    assert "network.interest_rejected reason=consent_version" in messages
    text = "\n".join(messages)
    for value in PII + ("1234 5678 9012",):
        assert value not in text


# ── HOURLY_CAP parsing (D7) ────────────────────────────────────────────

@pytest.fixture
def reload_network(monkeypatch):
    def reload(value):
        if value is None:
            monkeypatch.delenv("NETWORK_INTEREST_HOURLY_CAP", raising=False)
        else:
            monkeypatch.setenv("NETWORK_INTEREST_HOURLY_CAP", value)
        return importlib.reload(network).HOURLY_CAP
    yield reload
    monkeypatch.delenv("NETWORK_INTEREST_HOURLY_CAP", raising=False)
    importlib.reload(network)


@pytest.mark.parametrize("value,expected", [(None, 200), ("", 200), ("  ", 200), ("50", 50)])
def test_hourly_cap_defaults_and_parses(reload_network, caplog, value, expected):
    caplog.set_level(logging.ERROR, logger="pattadar.network")
    assert reload_network(value) == expected
    assert not caplog.records


@pytest.mark.parametrize("value", ["abc", "0", "-5", "2.5"])
def test_hourly_cap_invalid_fails_closed_with_one_error(reload_network, caplog, value):
    caplog.set_level(logging.ERROR, logger="pattadar.network")
    assert reload_network(value) == 0
    # Exactly one line, and it never echoes the value.
    assert [r.getMessage() for r in caplog.records] == ["network.hourly_cap_invalid"]


# ── schema (AC 17) ─────────────────────────────────────────────────────

def anonymous():
    return {"request": types.SimpleNamespace(headers={})}


NETWORK_MUTATION = ("mutation RegisterNetworkInterest($input: NetworkInterestInput!) "
                    "{ registerNetworkInterest(input: $input) { status field } }")


def test_register_network_interest_is_public(monkeypatch):
    monkeypatch.setattr(network, "_pool", lambda: _NoPool())
    variables = {"input": {"interest": "sell", "name": "", "consent": False,
                           "consentVersion": "", "website": "bot"}}

    async def run():
        return await main.schema.execute(NETWORK_MUTATION, variable_values=variables,
                                         context_value=anonymous())
    result = asyncio.run(run())
    assert result.errors is None
    assert result.data == {"registerNetworkInterest": {"status": "received", "field": ""}}


def test_neighbouring_roots_still_require_identity():
    async def run():
        return await main.schema.execute('mutation { claimInvitation(token:"t") { purpose } }',
                                         context_value=anonymous())
    result = asyncio.run(run())
    assert result.errors
    assert result.data is None or result.data.get("claimInvitation") is None


def test_optional_inputs_are_non_null_with_empty_defaults():
    sdl = str(main.schema)
    for field in ("phone", "email", "district", "mandal", "note", "website"):
        assert f'{field}: String! = ""' in sdl
    assert "registerNetworkInterest(input: NetworkInterestInput!): NetworkInterestResult!" in sdl

    async def run():
        return await main.schema.execute(
            NETWORK_MUTATION, context_value=anonymous(),
            variable_values={"input": {"interest": "sell", "name": "Ravi Kumar", "phone": None,
                                       "consent": True, "consentVersion": network.CONSENT_VERSION}})
    result = asyncio.run(run())
    assert result.errors and result.data is None
