"""Which provider reads documents, and with which credentials.

The super-admin Intelligence page (ai_reading/admin.py) writes the
`intelligence.*` rows of `platform_settings`; every reading loads them fresh,
so a change applies to the next reading without a restart. A credential typed
into that page is stored Fernet-encrypted under PLATFORM_SECRETS_KEY, a key of
its own: the Aadhaar vault is never used for it. An env var is the fallback.
Claude is the default and the fallback: Gemini is used only while it is chosen
AND fully configured.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field

from .config import IMPORT_MODEL

_log = logging.getLogger("pattadar")

PREFIX = "intelligence."
DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite"
DEFAULTS = {
    "provider": "anthropic", "claude_model": IMPORT_MODEL,
    "gemini_model": DEFAULT_GEMINI_MODEL, "ocr_enabled": "1", "processor": "",
}
# Credential name -> the env var a deployment may set instead of the form.
SECRET_ENV = {"anthropic_api_key": "ANTHROPIC_API_KEY",
              "gemini_api_key": "GEMINI_API_KEY",
              "google_service_account": "GOOGLE_SERVICE_ACCOUNT_JSON"}
SECRETS_KEY_ENV = "PLATFORM_SECRETS_KEY"


@dataclass(frozen=True)
class ReadingSettings:
    provider: str = "anthropic"
    claude_model: str = IMPORT_MODEL
    gemini_model: str = DEFAULT_GEMINI_MODEL
    ocr_enabled: bool = True
    processor: str = ""
    anthropic_api_key: str = field(default="", repr=False)
    gemini_api_key: str = field(default="", repr=False)
    google_service_account: str = field(default="", repr=False)

    @property
    def gemini_ready(self) -> bool:
        return bool(self.gemini_api_key) and (
            not self.ocr_enabled or bool(self.processor and self.google_service_account))

    @property
    def effective_provider(self) -> str:
        return "gemini" if self.provider == "gemini" and self.gemini_ready else "anthropic"


async def rows(conn) -> dict[str, dict]:
    """Every `intelligence.*` row by its short name, ciphertext included."""
    cur = await conn.execute(
        "SELECT key, value, updated_by, updated_at FROM platform_settings WHERE key LIKE %s",
        (PREFIX + "%",))
    return {row["key"].removeprefix(PREFIX): row for row in await cur.fetchall()}


def values(stored: dict[str, dict]) -> dict[str, str]:
    return {**DEFAULTS, **{k: str(v["value"] or "") for k, v in stored.items() if k in DEFAULTS}}


def _cipher():
    from cryptography.fernet import Fernet
    key = os.getenv(SECRETS_KEY_ENV, "").strip()
    if not key:
        raise RuntimeError(f"{SECRETS_KEY_ENV} is not set")
    return Fernet(key.encode())


def can_store() -> bool:
    """Whether a credential typed on the page can be saved here at all."""
    try:
        _cipher()
        return True
    except Exception:
        return False


async def reveal(stored: dict[str, dict], name: str) -> str:
    """The credential's plaintext: the form's value, else the env var, else ""."""
    token = str((stored.get("secret." + name) or {}).get("value") or "")
    if token:
        try:
            return _cipher().decrypt(token.encode()).decode()
        except Exception as exc:
            _log.warning("intelligence credential unreadable (name=%s, cause=%s)",
                         name, type(exc).__name__)
            return ""
    return env_secret(name)


def env_secret(name: str) -> str:
    return os.getenv(SECRET_ENV[name], "").strip()


async def protect(name: str, plaintext: str) -> str:
    """Raises RuntimeError when PLATFORM_SECRETS_KEY is missing or invalid."""
    try:
        return _cipher().encrypt(plaintext.encode()).decode()
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError(f"{SECRETS_KEY_ENV} is invalid") from exc


async def from_rows(stored: dict[str, dict], *, with_secrets: bool) -> ReadingSettings:
    v = values(stored)
    secrets = {name: await reveal(stored, name) for name in SECRET_ENV} if with_secrets else {}
    return ReadingSettings(
        provider=v["provider"], claude_model=v["claude_model"], gemini_model=v["gemini_model"],
        ocr_enabled=v["ocr_enabled"] == "1", processor=v["processor"], **secrets)


async def load() -> ReadingSettings:
    """The selection for one reading. Decrypts only when Gemini is chosen."""
    from ..main import pool
    try:
        async with pool.connection() as conn:
            stored = await rows(conn)
            return await from_rows(stored, with_secrets=values(stored)["provider"] == "gemini")
    except Exception as exc:
        # A settings outage cannot disable the established Claude path.
        _log.warning("intelligence settings unreadable, reading with Claude (cause=%s)",
                     type(exc).__name__)
        return ReadingSettings()


async def anthropic_key() -> str:
    """Claude's key for one call: the Intelligence page's, else ANTHROPIC_API_KEY."""
    from ..main import pool
    try:
        async with pool.connection() as conn:
            return await reveal(await rows(conn), "anthropic_api_key")
    except Exception:
        return env_secret("anthropic_api_key")
