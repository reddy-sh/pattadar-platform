"""Cognito access-token validation against a locally-generated RSA keypair.

The JWKS fetch is never exercised — the cache is primed directly (equivalent
to monkeypatching the network fetch), so these tests are fully offline.
"""
import asyncio
import time
import uuid

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwk, jwt
from jose.exceptions import JWTError

from app.cognito_jwt import CognitoJWTConfig, JWKSCache, verify_token

KID = "test-kid-1"
POOL_ID = "ap-south-1_TESTPOOL"
CLIENT_ID = "abc123clientid"


@pytest.fixture(scope="module")
def keypair():
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
def config():
    return CognitoJWTConfig(region="ap-south-1", user_pool_id=POOL_ID, client_id=CLIENT_ID)


@pytest.fixture()
def jwks_cache(keypair, config):
    _, public_pem = keypair
    key_dict = jwk.construct(public_pem, algorithm="RS256").to_dict()
    key_dict.update({"kid": KID, "use": "sig", "alg": "RS256"})
    cache = JWKSCache(config.jwks_url)
    # Prime the cache directly — no network fetch will ever run.
    cache._keys = [key_dict]
    cache._by_kid = {KID: key_dict}
    cache._fetched_at = time.monotonic()
    return cache


def make_token(private_pem, config, *, kid=KID, **overrides):
    claims = {
        "iss": config.issuer,
        "sub": str(uuid.uuid4()),
        "token_use": "access",
        "client_id": config.client_id,
        "email": "sankara.telukutla@gmail.com",
        "exp": int(time.time()) + 300,
        "iat": int(time.time()) - 5,
    }
    for k, v in overrides.items():
        if v is None:
            claims.pop(k, None)
        else:
            claims[k] = v
    return jwt.encode(claims, private_pem, algorithm="RS256", headers={"kid": kid})


def verify(token, config, cache):
    return asyncio.run(verify_token(token, config, cache))


def test_valid_access_token(keypair, config, jwks_cache):
    private_pem, _ = keypair
    token = make_token(private_pem, config)
    claims = verify(token, config, jwks_cache)
    assert claims["email"] == "sankara.telukutla@gmail.com"
    assert claims["token_use"] == "access"


def test_rejects_id_token(keypair, config, jwks_cache):
    private_pem, _ = keypair
    token = make_token(private_pem, config, token_use="id")
    with pytest.raises(JWTError, match="token_use"):
        verify(token, config, jwks_cache)


def test_rejects_wrong_client_id(keypair, config, jwks_cache):
    private_pem, _ = keypair
    token = make_token(private_pem, config, client_id="someone-elses-client")
    with pytest.raises(JWTError, match="client_id"):
        verify(token, config, jwks_cache)


def test_rejects_missing_email(keypair, config, jwks_cache):
    private_pem, _ = keypair
    token = make_token(private_pem, config, email=None)
    with pytest.raises(JWTError, match="email"):
        verify(token, config, jwks_cache)


def test_rejects_expired(keypair, config, jwks_cache):
    private_pem, _ = keypair
    token = make_token(private_pem, config, exp=int(time.time()) - 60)
    with pytest.raises(JWTError):
        verify(token, config, jwks_cache)


def test_rejects_wrong_issuer(keypair, config, jwks_cache):
    private_pem, _ = keypair
    token = make_token(
        private_pem, config,
        iss="https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_OTHERPOOL",
    )
    with pytest.raises(JWTError):
        verify(token, config, jwks_cache)


def test_rejects_tampered_signature(keypair, config, jwks_cache):
    private_pem, _ = keypair
    token = make_token(private_pem, config)
    header, payload, sig = token.split(".")
    tampered = f"{header}.{payload}.{'A' * len(sig)}"
    with pytest.raises(JWTError):
        verify(tampered, config, jwks_cache)


def test_rejects_unknown_kid(keypair, config, jwks_cache):
    private_pem, _ = keypair
    token = make_token(private_pem, config, kid="unknown-kid")
    # Cache refresh (no URL reachable) or kid miss → JWTError either way.
    with pytest.raises(Exception):
        verify(token, config, jwks_cache)
