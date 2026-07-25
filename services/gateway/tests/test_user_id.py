"""extract_user_id parity — the owner key for every DB row and S3 object.

Two layers:
1. Hardcoded expectations that pin the exact rhub normalization behavior
   (email local-part, lowercased; opaque subjects passed through untouched;
   plus-addressing kept as part of the local-part).
2. A direct byte-parity test against the REAL rhub function, loaded from
   the rhub checkout when it is present on this machine (skipped otherwise).
"""
import importlib.util
import sys
import types
from pathlib import Path

import pytest

from app.auth import _normalize_user_id, user_id_from_claims

RHUB_API = Path("/Users/reddy.sh/reddy.sh/projects/rhub/api")

# (input value, expected normalized id) — expected values are exactly what
# rhub api/gateway/auth.py::_normalize_user_id produces.
NORMALIZE_SAMPLES = [
    ("sankara.telukutla@gmail.com", "sankara.telukutla"),
    ("Sankara.Telukutla@Gmail.COM", "sankara.telukutla"),          # mixed case
    ("USER+Tag@Example.com", "user+tag"),                          # plus-addressing kept, lowercased
    ("  spaced.user@x.y  ", "spaced.user"),                        # surrounding whitespace
    ("a@b@c", "a"),                                                # split at FIRST @
    ("plainuser", "plainuser"),                                    # no @ → lowercased as-is
    ("PLAINUSER", "plainuser"),
    ("auth0|ABC123", "auth0|ABC123"),                              # opaque subject → untouched (case kept)
    ("google-oauth2|10769150350006150715113082367", "google-oauth2|10769150350006150715113082367"),
    ("00u1abcdEFGH", "00u1abcdEFGH"),                              # legacy Okta subject → untouched
    ("", ""),
    ("   ", ""),
    ("@domain.com", ""),                                           # empty local-part
]

CLAIMS_SAMPLES = [
    # email is the Cognito path (pre-token trigger injects it)
    ({"email": "Sankara.Telukutla@gmail.com", "sub": "1111-2222"}, "sankara.telukutla"),
    ({"email": "user+land@pattadar.com"}, "user+land"),
    # preferred_username wins over email (rhub priority order)
    ({"preferred_username": "Pref.User@x.com", "email": "other@y.com"}, "pref.user"),
    # opaque preferred_username is skipped → falls through to email
    ({"preferred_username": "auth0|xyz", "email": "real.user@x.com"}, "real.user"),
    # no readable claim → sub is normalized (Cognito sub is a UUID)
    ({"sub": "E4A8B0C0-1234-5678-9abc-def012345678"}, "e4a8b0c0-1234-5678-9abc-def012345678"),
    # nothing usable → "local"
    ({}, "local"),
    (None, "local"),
]


@pytest.mark.parametrize("raw,expected", NORMALIZE_SAMPLES)
def test_normalize_user_id(raw, expected):
    assert _normalize_user_id(raw) == expected


@pytest.mark.parametrize("claims,expected", CLAIMS_SAMPLES)
def test_user_id_from_claims(claims, expected):
    assert user_id_from_claims(claims) == expected


# ---------------------------------------------------------------------------
# Direct parity against the real rhub source (skipped when rhub is absent)
# ---------------------------------------------------------------------------

def _load_rhub_auth():
    sys.path.insert(0, str(RHUB_API))  # for `common.auth0_jwt`
    spec = importlib.util.spec_from_file_location(
        "rhub_gateway_auth", RHUB_API / "gateway" / "auth.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _fake_request(claims):
    return types.SimpleNamespace(
        state=types.SimpleNamespace(token_claims=claims), headers={}
    )


@pytest.mark.skipif(not RHUB_API.exists(), reason="rhub checkout not present")
def test_byte_parity_with_rhub_extract_user_id():
    rhub_auth = _load_rhub_auth()
    for claims, _ in CLAIMS_SAMPLES:
        ours = user_id_from_claims(claims)
        theirs = rhub_auth.extract_user_id(_fake_request(claims))
        assert ours == theirs, f"claims={claims!r}: ours={ours!r} rhub={theirs!r}"
    # sweep the raw normalization samples through single-claim dicts too
    for raw, _ in NORMALIZE_SAMPLES:
        for key in ("preferred_username", "email", "login", "sub"):
            claims = {key: raw}
            ours = user_id_from_claims(claims)
            theirs = rhub_auth.extract_user_id(_fake_request(claims))
            assert ours == theirs, f"{key}={raw!r}: ours={ours!r} rhub={theirs!r}"
