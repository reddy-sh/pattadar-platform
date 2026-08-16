"""The local trust root (local_issuer.py) — and the properties keeping it local.

Fully offline, like test_token_validation.py: keys are generated in-process
and no JWKS fetch ever runs.
"""
import asyncio
import time

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from jose import jwk, jwt
from jose.exceptions import JWTError

from app import auth
from app.cognito_jwt import CognitoJWTConfig, JWKSCache, verify_token
from app.local_issuer import ISSUER, LocalTrust, local_token

POOL_ID = "ap-south-1_TESTPOOL"
CLIENT_ID = "abc123clientid"


@pytest.fixture(scope="module")
def key_file(tmp_path_factory):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    path = tmp_path_factory.mktemp("local-auth") / "key.pem"
    path.write_bytes(pem)
    return str(path)


@pytest.fixture()
def trust(key_file):
    return LocalTrust(key_file)


@pytest.fixture()
def local_config():
    cfg = CognitoJWTConfig(region="ap-south-1", user_pool_id=POOL_ID, client_id=CLIENT_ID)
    cfg.issuer_override = ISSUER
    return cfg


def verify(token, config, cache):
    return asyncio.run(verify_token(token, config, cache))


def test_minted_access_token_passes_real_validation(trust, local_config):
    minted = trust.mint("u01", CLIENT_ID)
    claims = verify(minted["access_token"], local_config, trust)
    assert claims["email"] == "u01@local"
    assert claims["token_use"] == "access"
    assert claims["client_id"] == CLIENT_ID


def test_full_email_keeps_its_local_part_semantics(trust, local_config):
    minted = trust.mint("Sankara.Telukutla@gmail.com", CLIENT_ID)
    claims = verify(minted["access_token"], local_config, trust)
    # Identity derives from the email claim exactly as with a real token.
    assert claims["email"] == "sankara.telukutla@gmail.com"
    assert auth.user_id_from_claims(claims) == "sankara.telukutla"


def test_minted_id_token_is_not_an_access_token(trust, local_config):
    minted = trust.mint("u01", CLIENT_ID)
    with pytest.raises(JWTError, match="token_use"):
        verify(minted["id_token"], local_config, trust)


def test_real_pool_gateway_rejects_minted_token(trust):
    """THE safety property: a gateway trusting the real pool never accepts a
    locally-minted token — even if (impossibly) it held the local public key,
    the issuer check alone kills it."""
    real_config = CognitoJWTConfig(
        region="ap-south-1", user_pool_id=POOL_ID, client_id=CLIENT_ID
    )
    minted = trust.mint("u01", CLIENT_ID)

    # 1) With the pool's JWKS (holding only the pool's own key): the local
    #    kid is unknown → rejected. Primed non-stale and non-empty so the
    #    kid-miss is decided without any network fetch.
    pool_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pool_pem = pool_key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    pool_jwk = jwk.construct(pool_pem, algorithm="RS256").to_dict()
    pool_jwk.update({"kid": "aws-kid-1", "use": "sig", "alg": "RS256"})
    pool_cache = JWKSCache(real_config.jwks_url)
    pool_cache._keys = [pool_jwk]
    pool_cache._by_kid = {"aws-kid-1": pool_jwk}
    pool_cache._fetched_at = time.monotonic()
    with pytest.raises(JWTError):
        verify(minted["access_token"], real_config, pool_cache)

    # 2) Even with the local key in the cache: issuer mismatch → rejected.
    poisoned = JWKSCache(real_config.jwks_url)
    poisoned._keys = [trust._jwk]
    poisoned._by_kid = {trust.kid: trust._jwk}
    poisoned._fetched_at = time.monotonic()
    with pytest.raises(JWTError):
        verify(minted["access_token"], real_config, poisoned)


def test_local_gateway_rejects_foreign_kid(trust, local_config):
    """A token signed by some other key (e.g. the real pool's) never matches
    the local trust root — unknown kid, then issuer, both fail."""
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    other_pem = other.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    foreign = jwt.encode(
        {"iss": ISSUER, "token_use": "access", "client_id": CLIENT_ID,
         "email": "u01@local", "exp": int(time.time()) + 300},
        other_pem, algorithm="RS256", headers={"kid": "not-the-local-kid"})
    with pytest.raises(JWTError):
        verify(foreign, local_config, trust)


def test_endpoint_404_when_trust_root_is_real(local_config, trust):
    """/local-auth/token does not exist unless the local trust root is live."""
    real_config = CognitoJWTConfig(
        region="ap-south-1", user_pool_id=POOL_ID, client_id=CLIENT_ID
    )
    old_cfg, old_cache = auth.jwt_config, auth.jwks_cache
    try:
        auth.jwt_config = real_config
        auth.jwks_cache = JWKSCache(real_config.jwks_url)
        with pytest.raises(HTTPException) as e:
            asyncio.run(local_token({"user": "u01"}))
        assert e.value.status_code == 404
    finally:
        auth.jwt_config, auth.jwks_cache = old_cfg, old_cache


def test_endpoint_mints_when_local(local_config, trust):
    old_cfg, old_cache = auth.jwt_config, auth.jwks_cache
    try:
        auth.jwt_config = local_config
        auth.jwks_cache = trust
        out = asyncio.run(local_token({"user": "u01"}))
        assert set(out) >= {"access_token", "id_token", "expires_in"}
        claims = verify(out["access_token"], local_config, trust)
        assert auth.user_id_from_claims(claims) == "u01"
    finally:
        auth.jwt_config, auth.jwks_cache = old_cfg, old_cache


def test_endpoint_requires_a_user(local_config, trust):
    old_cfg, old_cache = auth.jwt_config, auth.jwks_cache
    try:
        auth.jwt_config = local_config
        auth.jwks_cache = trust
        with pytest.raises(HTTPException) as e:
            asyncio.run(local_token({}))
        assert e.value.status_code == 400
    finally:
        auth.jwt_config, auth.jwks_cache = old_cfg, old_cache
