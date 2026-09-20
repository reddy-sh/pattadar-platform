"""Authentication and identity for the pattadar gateway.

Ported from the predecessor's api/gateway/auth.py with the auth provider swapped
from the predecessor's OIDC provider to Amazon Cognito:

- Only JWT bearer tokens are accepted (Cognito issues only JWTs). The
  opaque-token /userinfo fallback and userinfo enrichment paths from the
  predecessor are deliberately deleted, not disabled.
- There is NO auth-disable knob. Auth is always on.
- Authenticated principals are derived from immutable issuer + subject claims.
  Explicit, operator-reviewed bindings retain legacy DB/S3 owner keys without
  allowing email local parts to claim existing accounts.
"""

import logging
import os
import hashlib
import json
import re
from functools import lru_cache
from typing import Any, Dict, Optional

import httpx
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from jose import jwt as jose_jwt
from jose.exceptions import JWTError

from .cognito_jwt import CognitoJWTConfig, JWKSCache, verify_token

_log = logging.getLogger("pattadar.gateway.auth")

# ---------------------------------------------------------------------------
# Module-level state (initialised by main.py lifespan)
# ---------------------------------------------------------------------------
proxy_client: Optional[httpx.AsyncClient] = None
jwt_config: Optional[CognitoJWTConfig] = None
jwks_cache: Optional[JWKSCache] = None
#: Second trust root, LOCAL MODE ONLY (main.py sets these alongside the
#: laptop keypair): the real pool, so a phone signed in through the actual
#: hosted UI works against the laptop stack too. Both None in production —
#: there the pool IS the primary and nothing widens.
pool_jwt_config: Optional[CognitoJWTConfig] = None
pool_jwks_cache: Optional[JWKSCache] = None
# Wired by application startup after the durable access-block table exists.
account_access_check = None


# ---------------------------------------------------------------------------
# Bearer token validation
# ---------------------------------------------------------------------------

def _auth_error(status: int, error: str, details: Optional[str] = None) -> HTTPException:
    content: Dict[str, Any] = {"error": error}
    if details:
        content["details"] = details
    return HTTPException(status_code=status, detail=content)


#: Classes that mean the gateway could not decide, rather than that the
#: credential was bad.
_UNAVAILABLE_REASONS = ("jwks-unreachable", "internal-error")


def _failure_reason(err: BaseException) -> str:
    """Coarse class for a rejected token — derived from the failure, never
    from the token, so it is safe to log."""
    if isinstance(err, httpx.HTTPError):
        return "jwks-unreachable"
    if not isinstance(err, JWTError):
        return "internal-error"
    text = str(err).lower()
    if "expired" in text:
        return "expired"
    if "not found in" in text:
        return "unknown-kid"
    if "signature" in text:
        return "bad-signature"
    if "issuer" in text:
        return "wrong-issuer"
    return "invalid-claims"


def _reject(err: BaseException, roots: str) -> HTTPException:
    """The response for a failed validation, and the one log line recording it.

    A JWKS fetch that never answered is the gateway's problem, not the
    caller's: it answers 503, so an identity-provider outage is never read as
    a fleet of bad credentials — nor discarded as a client bug, which is what
    a DEBUG line under an INFO root logger amounts to.
    """
    reason = _failure_reason(err)
    if reason in _UNAVAILABLE_REASONS:
        _log.error("auth.unavailable reason=%s roots=%s error=%s", reason, roots, err)
        return _auth_error(503, "Authentication temporarily unavailable")
    _log.warning("auth.rejected reason=%s roots=%s", reason, roots)
    return _auth_error(401, "Invalid token", str(err))


async def validate_bearer(request: Request, *, strict: bool = True) -> Optional[Dict[str, Any]]:
    """
    Core token validation using cached JWKS + kid matching.

    strict=True  → 401 if no token; 500 if Cognito not configured
    strict=False → returns None when NO token is presented

    A PRESENTED token that is malformed or invalid always raises 401,
    regardless of ``strict`` — a bad credential is never treated as
    anonymous.
    """
    cfg = jwt_config
    cache = jwks_cache

    if cfg is None or cache is None:
        if strict:
            raise _auth_error(500, "Gateway auth not initialised")
        return None

    if not cfg.is_configured:
        if strict:
            raise _auth_error(
                500,
                "Gateway auth misconfigured",
                "COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID must be set",
            )
        return None

    auth_header = str(request.headers.get("authorization") or "")
    if not auth_header.lower().startswith("bearer "):
        if strict:
            raise _auth_error(401, "Missing Bearer token")
        return None

    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        if strict:
            raise _auth_error(401, "Missing Bearer token")
        return None

    # Cognito issues only JWTs — anything that isn't three dot-separated
    # parts is invalid outright (the predecessor's opaque-token /userinfo
    # fallback is deleted, not ported).
    if token.count(".") != 2:
        raise _auth_error(401, "Invalid token", "Not a JWT")

    try:
        claims = await verify_token(token, cfg, cache, http_client=proxy_client)
    except Exception as primary_err:
        pool_cfg, pool_cache = pool_jwt_config, pool_jwks_cache
        if pool_cfg is None or pool_cache is None:
            raise _reject(primary_err, "primary")
        # Local loop, second trust root: the laptop key rightly rejected a
        # token it did not sign — a phone that signed in through the real
        # hosted UI carries a pool token, so the pool's JWKS gets its say.
        try:
            claims = await verify_token(token, pool_cfg, pool_cache, http_client=proxy_client)
        except Exception as pool_err:
            # Both roots said no. Report the verdict of the root the token
            # was AIMED at — the kid names it — so an expired dev-door
            # token reads "expired", not "unknown kid" from a pool it
            # never came from.
            try:
                token_kid = jose_jwt.get_unverified_header(token).get("kid")
            except Exception:
                token_kid = None
            aimed_local = token_kid is not None and token_kid == getattr(cache, "kid", None)
            raise _reject(primary_err if aimed_local else pool_err, "both")

    request.state.token_claims = claims
    if account_access_check is not None:
        await account_access_check(request, claims)
    return claims


async def require_auth(request: Request) -> Dict[str, Any]:
    """FastAPI Depends() — always requires a valid Bearer token."""
    claims = await validate_bearer(request, strict=True)
    return claims or {}


# ---------------------------------------------------------------------------
# User identity extraction
#
# Legacy normalization is retained ONLY for migration and the explicit local
# trust root. Production ownership never derives from mutable email claims.
# ---------------------------------------------------------------------------

def _looks_like_opaque_subject(value: str) -> bool:
    """Check if a value looks like an opaque identity provider subject (not human-readable)."""
    v = str(value or "").strip()
    if not v:
        return False
    # Auth0 subjects: auth0|xxx, google-oauth2|xxx, etc.
    if "|" in v and "@" not in v:
        return True
    # Legacy Okta subjects: 00u...
    if v.startswith("00u") and "@" not in v and len(v) >= 10:
        return True
    return False


# Keep backward-compat alias (predecessor name)
_looks_like_okta_subject = _looks_like_opaque_subject


def _normalize_user_id(v: str) -> str:
    s = str(v or "").strip()
    if not s:
        return ""
    if _looks_like_okta_subject(s):
        return s
    if "@" in s:
        s = s.split("@", 1)[0]
    s = s.strip()
    return s.lower() if s else ""


def principal_id_from_claims(claims: Any) -> str:
    """Stable, path-safe identity; subjects from different issuers never collide."""
    if not isinstance(claims, dict):
        raise _auth_error(401, "Missing authenticated subject")
    issuer, subject = claims.get("iss"), claims.get("sub")
    if not isinstance(issuer, str) or not issuer.strip() or not isinstance(subject, str) or not subject.strip():
        raise _auth_error(401, "Missing authenticated subject")
    encoded = json.dumps([issuer, subject], ensure_ascii=True, separators=(",", ":"))
    return "subject_" + hashlib.sha256(encoded.encode()).hexdigest()


@lru_cache(maxsize=8)
def _parse_legacy_bindings(raw: str) -> dict:
    try:
        bindings = json.loads(raw)
    except (ValueError, TypeError) as exc:
        raise RuntimeError("IDENTITY_LEGACY_BINDINGS must be a reviewed JSON object") from exc
    if not isinstance(bindings, dict):
        raise RuntimeError("IDENTITY_LEGACY_BINDINGS must be a JSON object")
    for principal, owner in bindings.items():
        if not re.fullmatch(r"subject_[0-9a-f]{64}", principal):
            raise RuntimeError("Legacy bindings must use immutable subject principal keys")
        if (not isinstance(owner, str) or not owner or owner != owner.strip()
                or owner in {"local", "system", "guest", "anonymous"}
                or owner.startswith("subject_") or any(c in owner for c in "/\\\x00\r\n")):
            raise RuntimeError("Invalid or reserved legacy owner key")
    # Multiple principals may intentionally link to one existing account, but
    # only by explicit operator review; the migration checker requires evidence.
    return bindings


def validate_identity_configuration() -> None:
    """Fail deployment before login if the legacy account migration is omitted."""
    from .local_issuer import LocalTrust
    if isinstance(jwks_cache, LocalTrust):
        _parse_legacy_bindings(os.getenv("IDENTITY_LEGACY_BINDINGS", "{}"))
        return
    raw = os.getenv("IDENTITY_LEGACY_BINDINGS")
    if raw is None or not raw.strip():
        raise RuntimeError("IDENTITY_LEGACY_BINDINGS is required: run the identity migration preflight before rollout; use {} only for an empty installation")
    _parse_legacy_bindings(raw)


def user_id_from_claims(claims: Any) -> str:
    principal = principal_id_from_claims(claims)
    # Retain seeded laptop accounts only under an actually active local key.
    # A Cognito-signed email cannot opt into this rule.
    from .local_issuer import ISSUER, LocalTrust
    if claims["iss"] == ISSUER and isinstance(jwks_cache, LocalTrust):
        return _normalize_user_id(claims["sub"])
    bindings = _parse_legacy_bindings(os.getenv("IDENTITY_LEGACY_BINDINGS", "{}"))
    return bindings.get(principal, principal)


def extract_user_id(request: Request) -> str:
    # SECURITY: Never trust client-supplied identity headers.
    # Identity must always come from validated JWT claims.
    # Client headers (x-user-id, x-ea-user-id) are stripped by middleware
    # at the gateway edge before any handler runs.
    claims = getattr(request.state, "token_claims", None)
    return user_id_from_claims(claims)


def extract_user_name(request: Request) -> str:
    # SECURITY: Never trust client-supplied name headers.
    # Name must come from validated JWT claims only.
    claims = getattr(request.state, "token_claims", None)

    if isinstance(claims, dict):
        for key in ("name", "preferred_username", "email", "login"):
            val = str(claims.get(key) or "").strip()
            if val:
                return val

        given = str(claims.get("given_name") or "").strip()
        family = str(claims.get("family_name") or "").strip()
        combined = (given + " " + family).strip()
        if combined:
            return combined

    return ""


# ---------------------------------------------------------------------------
# Super-admin gate (replaces the predecessor's RBAC platform.manage permission)
# ---------------------------------------------------------------------------

def _admin_ids() -> set:
    raw = os.getenv("ADMIN_SUBJECT_IDS", "")
    return {s.strip() for s in raw.split(",") if re.fullmatch(r"subject_[0-9a-f]{64}", s.strip())}


def is_admin(user_id: str) -> bool:
    """FAIL CLOSED: any doubt (empty id, empty allowlist, error) → not admin."""
    try:
        uid = str(user_id or "").strip()
        if not uid:
            return False
        return uid in _admin_ids()
    except Exception:
        return False


async def require_admin(request: Request) -> Optional[JSONResponse]:
    """Gate for admin endpoints. Returns None when allowed, a 403 response
    otherwise. Mirrors the predecessor's _require_admin call shape (deny-object or None)
    so ai_catalog/routes.py ports with minimal diff. FAILS CLOSED."""
    try:
        if is_admin(principal_id_from_claims(getattr(request.state, "token_claims", None))):
            return None
    except Exception:
        _log.exception("admin_gate.error — denying")
    return JSONResponse(status_code=403, content={"error": "Forbidden"})
