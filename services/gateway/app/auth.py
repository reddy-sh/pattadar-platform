"""Authentication and identity for the pattadar gateway.

Ported from rhub api/gateway/auth.py with the auth provider swapped from
Auth0 to Amazon Cognito:

- Only JWT bearer tokens are accepted (Cognito issues only JWTs). The
  opaque-token /userinfo fallback and userinfo enrichment paths from rhub
  are deliberately deleted, not disabled.
- There is NO auth-disable knob. Auth is always on.
- ``extract_user_id`` normalization is BYTE-IDENTICAL to rhub's
  (email local-part, lowercased) — every DB row and S3 object key across
  the platform is keyed by its output.
"""

import logging
import os
from typing import Any, Dict, Optional

import httpx
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from jose.exceptions import JWTError

from .cognito_jwt import CognitoJWTConfig, JWKSCache, verify_token

_log = logging.getLogger("pattadar.gateway.auth")

# ---------------------------------------------------------------------------
# Module-level state (initialised by main.py lifespan)
# ---------------------------------------------------------------------------
proxy_client: Optional[httpx.AsyncClient] = None
jwt_config: Optional[CognitoJWTConfig] = None
jwks_cache: Optional[JWKSCache] = None


# ---------------------------------------------------------------------------
# Bearer token validation
# ---------------------------------------------------------------------------

def _auth_error(status: int, error: str, details: Optional[str] = None) -> HTTPException:
    content: Dict[str, Any] = {"error": error}
    if details:
        content["details"] = details
    return HTTPException(status_code=status, detail=content)


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
    # parts is invalid outright (rhub's opaque-token /userinfo fallback is
    # deleted, not ported).
    if token.count(".") != 2:
        raise _auth_error(401, "Invalid token", "Not a JWT")

    try:
        claims = await verify_token(token, cfg, cache, http_client=proxy_client)
    except (JWTError, Exception) as jwt_err:
        _log.debug("JWT validation failed: %s", jwt_err)
        raise _auth_error(401, "Invalid token", str(jwt_err))

    request.state.token_claims = claims
    return claims


async def require_auth(request: Request) -> Dict[str, Any]:
    """FastAPI Depends() — always requires a valid Bearer token."""
    claims = await validate_bearer(request, strict=True)
    return claims or {}


# ---------------------------------------------------------------------------
# User identity extraction
#
# The normalization below is copied BYTE-IDENTICAL from rhub
# api/gateway/auth.py (extract_user_id / _looks_like_opaque_subject).
# Do NOT "improve" it — the owner key of every row in every database and
# every S3 object key is produced by this exact code.
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


# Keep backward-compat alias (rhub name)
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


def user_id_from_claims(claims: Any) -> str:
    """rhub extract_user_id's claim-priority loop, operating on a claims dict."""
    if isinstance(claims, dict):
        # Prefer human-readable username claims over opaque uid/sub
        for key in ("preferred_username", "email", "login"):
            raw = str(claims.get(key) or "").strip()
            if raw:
                if _looks_like_okta_subject(raw):
                    continue
                val = _normalize_user_id(raw)
                if val:
                    return val
        for key in ("sub", "uid", "user_id", "userId"):
            raw = str(claims.get(key) or "").strip()
            if raw:
                val = _normalize_user_id(raw)
                if val:
                    return val
    return "local"


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
# Super-admin gate (replaces rhub's RBAC platform.manage permission)
# ---------------------------------------------------------------------------

def _admin_ids() -> set:
    raw = os.getenv("ADMIN_USER_IDS", "sankara.telukutla")
    return {s.strip() for s in str(raw).split(",") if s.strip()}


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
    otherwise. Mirrors rhub's _require_admin call shape (deny-object or None)
    so routes_admin_models.py ports with minimal diff. FAILS CLOSED."""
    try:
        if is_admin(extract_user_id(request)):
            return None
    except Exception:
        _log.exception("admin_gate.error — denying")
    return JSONResponse(status_code=403, content={"error": "Forbidden"})
