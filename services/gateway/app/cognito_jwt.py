"""JWT validation for Amazon Cognito access tokens.

Ported from the predecessor's api/common/auth0_jwt.py (JWKS-cache skeleton), rewired to
Cognito's claims contract:

- Issuer: https://cognito-idp.{region}.amazonaws.com/{user_pool_id}
  (JWKS at {issuer}/.well-known/jwks.json)
- Cognito access tokens have NO `aud` claim — we do NOT verify `aud`.
  Instead we require `token_use == "access"` and `client_id` to be one of the
  configured app client id.
- The `email` claim is injected into the access token by a
  pre-token-generation Lambda trigger (lowercased). Tokens without it are
  rejected — email is the identity every DB row and S3 key derives from.
- Cognito issues only JWTs — there is no opaque-token /userinfo fallback.

JWKS keys cached with TTL (default 1 hour), kid-based lookup, automatic
refresh on kid miss (handles key rotation).
"""

import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import httpx
from jose import jwt
from jose.exceptions import JWTError

logger = logging.getLogger(__name__)

_DEFAULT_CACHE_TTL = 3600  # 1 hour


@dataclass
class CognitoJWTConfig:
    """JWT auth configuration for Amazon Cognito."""
    region: str
    user_pool_id: str
    #: Comma-separated in COGNITO_CLIENT_ID; one Cognito user pool legitimately
    #: serves several app clients (web SPA + native iOS). Matching stays EXACT
    #: against this allowlist — this widens which clients are recognised, never
    #: how a token is verified.
    client_id: str
    algorithms: List[str] = field(default_factory=lambda: ["RS256"])
    jwks_cache_ttl: int = _DEFAULT_CACHE_TTL
    #: Set ONLY programmatically (main.py, local trust root) — never from env,
    #: so no deployment variable can quietly repoint who this gateway trusts.
    issuer_override: str = ""

    @classmethod
    def from_env(cls) -> "CognitoJWTConfig":
        region = os.getenv("COGNITO_REGION", "ap-south-1").strip()
        user_pool_id = os.getenv("COGNITO_USER_POOL_ID", "").strip()
        client_id = os.getenv("COGNITO_CLIENT_ID", "").strip()
        ttl = int(os.getenv("JWKS_CACHE_TTL", str(_DEFAULT_CACHE_TTL)))
        return cls(region=region, user_pool_id=user_pool_id, client_id=client_id, jwks_cache_ttl=ttl)

    @property
    def issuer(self) -> str:
        # Local trust root (see local_issuer.py): the issuer is the override
        # string and there is nothing to derive — validation still matches
        # it exactly, so pool-issued tokens fail on issuer before signature.
        if self.issuer_override:
            return self.issuer_override
        if not (self.region and self.user_pool_id):
            return ""
        # Cognito issuer has NO trailing slash.
        return f"https://cognito-idp.{self.region}.amazonaws.com/{self.user_pool_id}"

    @property
    def jwks_url(self) -> str:
        if not self.issuer:
            return ""
        return f"{self.issuer}/.well-known/jwks.json"

    @property
    def client_ids(self) -> frozenset:
        """Allowed app-client ids. Empty entries are dropped so a stray comma
        can never widen the allowlist to everything."""
        return frozenset(c.strip() for c in self.client_id.split(",") if c.strip())

    @property
    def is_configured(self) -> bool:
        return bool(self.issuer and self.client_ids)


class JWKSCache:
    """Async JWKS key cache with TTL and kid-based lookup.

    Uses an asyncio.Lock to prevent thundering-herd on cache refresh —
    only one request fetches from Cognito while others wait and reuse the
    result.  (Byte-for-byte the predecessor's JWKSCache, minus provider-specific naming.)
    """

    def __init__(self, jwks_url: str, *, ttl: int = _DEFAULT_CACHE_TTL):
        self._jwks_url = jwks_url
        self._ttl = ttl
        self._keys: List[Dict[str, Any]] = []
        self._by_kid: Dict[str, Dict[str, Any]] = {}
        self._fetched_at: float = 0.0
        self._refresh_lock: Optional["asyncio.Lock"] = None

    def _get_lock(self) -> "asyncio.Lock":
        """Lazily create the lock on first use (must be in an async context)."""
        if self._refresh_lock is None:
            import asyncio
            self._refresh_lock = asyncio.Lock()
        return self._refresh_lock

    @property
    def is_stale(self) -> bool:
        return (time.monotonic() - self._fetched_at) > self._ttl

    async def get_key(
        self, kid: str, *, http_client: Optional[httpx.AsyncClient] = None
    ) -> Dict[str, Any]:
        """Get a signing key by kid. Refreshes cache if stale or kid not found."""
        if kid in self._by_kid and not self.is_stale:
            return self._by_kid[kid]

        # Cache is stale or kid not found — refresh (serialized)
        await self.refresh(http_client=http_client)

        if kid in self._by_kid:
            return self._by_kid[kid]

        raise KeyError(f"Signing key '{kid}' not found in JWKS")

    async def get_keys(
        self, *, http_client: Optional[httpx.AsyncClient] = None
    ) -> List[Dict[str, Any]]:
        """Get all signing keys. Refreshes cache if stale."""
        if self.is_stale:
            await self.refresh(http_client=http_client)
        return list(self._keys)

    async def refresh(
        self, *, http_client: Optional[httpx.AsyncClient] = None
    ) -> None:
        """Fetch JWKS from Cognito and update the cache.

        Serialized via lock — only one concurrent caller fetches; others wait
        and pick up the refreshed cache.
        """
        if not self._jwks_url:
            return

        async with self._get_lock():
            # Re-check staleness after acquiring lock — another request
            # may have already refreshed while we were waiting.
            if not self.is_stale and self._keys:
                return

            try:
                if http_client:
                    r = await http_client.get(self._jwks_url, timeout=10.0)
                else:
                    async with httpx.AsyncClient(
                        timeout=httpx.Timeout(10.0, connect=5.0)
                    ) as c:
                        r = await c.get(self._jwks_url)

                r.raise_for_status()
                data = r.json()
                keys = data.get("keys", []) if isinstance(data, dict) else []
                self._keys = keys
                self._by_kid = {k["kid"]: k for k in keys if "kid" in k}
                self._fetched_at = time.monotonic()
                logger.debug("JWKS refreshed: %d keys cached", len(keys))
            except Exception:
                logger.exception("Failed to refresh JWKS from %s", self._jwks_url)
                raise


async def verify_token(
    token: str,
    config: CognitoJWTConfig,
    jwks_cache: JWKSCache,
    *,
    http_client: Optional[httpx.AsyncClient] = None,
) -> Dict[str, Any]:
    """
    Verify a Cognito ACCESS token.

    1. Extracts kid from unverified JWT header
    2. Looks up matching key in JWKS cache (refreshes on miss)
    3. Verifies signature, issuer, expiration (NOT aud — Cognito access
       tokens have no aud claim)
    4. Requires token_use == "access", client_id == configured client id,
       and a non-empty email claim (injected by the pre-token trigger)
    5. Returns decoded claims dict

    Raises JWTError on any validation failure.
    """
    # Extract kid from unverified header
    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError as e:
        raise JWTError(f"Invalid token header: {e}")

    kid = unverified_header.get("kid")

    if kid:
        # Preferred: kid-based key lookup
        try:
            key = await jwks_cache.get_key(kid, http_client=http_client)
        except KeyError:
            raise JWTError(f"Signing key '{kid}' not found in JWKS")
        signing_key = key
    else:
        # Fallback: try all keys (rare, non-standard)
        keys = await jwks_cache.get_keys(http_client=http_client)
        if not keys:
            raise JWTError("No signing keys available")
        signing_key = keys

    claims = jwt.decode(
        token,
        signing_key,
        algorithms=config.algorithms,
        issuer=config.issuer,
        options={
            # Cognito access tokens carry NO aud claim — never verify it.
            "verify_aud": False,
            "verify_signature": True,
            "verify_exp": True,
        },
    )

    # Cognito-specific claim checks (replace the predecessor OIDC provider's audience validation).
    if str(claims.get("token_use") or "") != "access":
        raise JWTError("Not an access token (token_use != 'access')")
    allowed = config.client_ids
    # FAIL CLOSED: no configured clients → no token is acceptable.
    if not allowed or str(claims.get("client_id") or "") not in allowed:
        raise JWTError("Token client_id does not match a configured app client")
    if not str(claims.get("email") or "").strip():
        # The pre-token-generation trigger injects email (lowercased) into
        # every access token; a token without it cannot be mapped to a user.
        raise JWTError("Token is missing the email claim")

    return claims
