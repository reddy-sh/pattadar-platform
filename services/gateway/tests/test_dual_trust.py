"""Local mode's second trust root: the real pool, accepted alongside the laptop key.

The phone-local loop runs the gateway with the laptop issuer as PRIMARY trust
(offline dev door), but a phone that signed in through the real hosted UI
walks in with a pool token. These tests pin the fallback: pool tokens verify
against the pool pair, local tokens never touch it, and when both roots say
no, the error reported is the verdict of the root the token was aimed at.

Fully offline like test_token_validation.py — every cache is primed by hand.
"""
import asyncio
import time

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException, Request
from jose import jwk, jwt

from app import auth
from app.cognito_jwt import CognitoJWTConfig, JWKSCache
from app.local_issuer import ISSUER, LocalTrust

POOL_ID = "ap-south-1_TESTPOOL"
CLIENT_ID = "abc123clientid"
POOL_KID = "aws-kid-1"


@pytest.fixture(scope="module")
def local_trust(tmp_path_factory):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    path = tmp_path_factory.mktemp("local-auth") / "key.pem"
    path.write_bytes(pem)
    return LocalTrust(str(path))


@pytest.fixture(scope="module")
def pool_keypair():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    public_pem = key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return private_pem, public_pem


@pytest.fixture()
def pool_config():
    return CognitoJWTConfig(region="ap-south-1", user_pool_id=POOL_ID, client_id=CLIENT_ID)


@pytest.fixture()
def pool_cache(pool_keypair, pool_config):
    _, public_pem = pool_keypair
    key_dict = jwk.construct(public_pem, algorithm="RS256").to_dict()
    key_dict.update({"kid": POOL_KID, "use": "sig", "alg": "RS256"})
    cache = JWKSCache(pool_config.jwks_url)
    cache._keys = [key_dict]
    cache._by_kid = {POOL_KID: key_dict}
    cache._fetched_at = time.monotonic()
    return cache


@pytest.fixture()
def local_config():
    cfg = CognitoJWTConfig(region="ap-south-1", user_pool_id=POOL_ID, client_id=CLIENT_ID)
    cfg.issuer_override = ISSUER
    return cfg


@pytest.fixture()
def wired(local_config, local_trust, pool_config, pool_cache):
    """Module state as main.py's lifespan wires it in local mode with the
    pool pair present. Restores whatever was there before."""
    saved = (auth.jwt_config, auth.jwks_cache, auth.pool_jwt_config, auth.pool_jwks_cache)
    auth.jwt_config = local_config
    auth.jwks_cache = local_trust
    auth.pool_jwt_config = pool_config
    auth.pool_jwks_cache = pool_cache
    yield
    (auth.jwt_config, auth.jwks_cache, auth.pool_jwt_config, auth.pool_jwks_cache) = saved


def make_request(token):
    return Request({
        "type": "http", "method": "POST", "path": "/x", "query_string": b"",
        "headers": [(b"authorization", f"Bearer {token}".encode())],
    })


def make_pool_token(private_pem, config, **overrides):
    claims = {
        "iss": config.issuer,
        "sub": "real-sub",
        "token_use": "access",
        "client_id": CLIENT_ID,
        "email": "sankara.telukutla@gmail.com",
        "exp": int(time.time()) + 300,
        "iat": int(time.time()) - 5,
    }
    for k, v in overrides.items():
        if v is None:
            claims.pop(k, None)
        else:
            claims[k] = v
    return jwt.encode(claims, private_pem, algorithm="RS256", headers={"kid": POOL_KID})


def validate(token):
    return asyncio.run(auth.validate_bearer(make_request(token)))


def test_pool_token_accepted_alongside_local_trust(wired, pool_keypair, pool_config):
    private_pem, _ = pool_keypair
    claims = validate(make_pool_token(private_pem, pool_config))
    assert claims["email"] == "sankara.telukutla@gmail.com"
    assert auth.user_id_from_claims(claims) == "sankara.telukutla"


def test_local_token_still_first_class(wired, local_trust):
    minted = local_trust.mint("u01", CLIENT_ID)
    claims = validate(minted["access_token"])
    assert claims["email"] == "u01@local"


def test_pool_claim_checks_still_apply(wired, pool_keypair, pool_config):
    """The fallback is the SAME pipeline, not a softer one."""
    private_pem, _ = pool_keypair
    with pytest.raises(HTTPException) as e:
        validate(make_pool_token(private_pem, pool_config, token_use="id"))
    assert e.value.status_code == 401


def test_without_pool_pair_pool_tokens_stay_rejected(
    wired, pool_keypair, pool_config
):
    """Prod shape (no pool pair) is byte-for-byte the old behavior."""
    auth.pool_jwt_config = None
    auth.pool_jwks_cache = None
    private_pem, _ = pool_keypair
    with pytest.raises(HTTPException) as e:
        validate(make_pool_token(private_pem, pool_config))
    assert e.value.status_code == 401


def test_expired_local_token_reports_the_local_verdict(wired, local_trust):
    """A token aimed at the laptop key gets the laptop key's verdict —
    not a confusing kid-miss from the pool it never came from."""
    stale = jwt.encode(
        {"iss": ISSUER, "sub": "u01@local", "email": "u01@local",
         "token_use": "access", "client_id": CLIENT_ID,
         "iat": int(time.time()) - 600, "exp": int(time.time()) - 60},
        local_trust._private_pem, algorithm="RS256",
        headers={"kid": local_trust.kid})
    with pytest.raises(HTTPException) as e:
        validate(stale)
    assert e.value.status_code == 401
    assert "expired" in str(e.value.detail.get("details", "")).lower()


def test_expired_pool_token_reports_the_pool_verdict(wired, pool_keypair, pool_config):
    private_pem, _ = pool_keypair
    with pytest.raises(HTTPException) as e:
        validate(make_pool_token(private_pem, pool_config, exp=int(time.time()) - 60))
    assert e.value.status_code == 401
    assert "expired" in str(e.value.detail.get("details", "")).lower()
