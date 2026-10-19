"""The super-admin Intelligence page: which provider reads documents, and each
provider's model and credentials.

web360.py owns the GraphQL types and the super-admin gate; this module takes
and returns plain dicts. PROVIDERS is the one registry: a new provider is an
entry here plus its reading adapter in providers/, and the page lists it with
no UI change. Credentials are write-only. A saved one is encrypted under its
own key (ai_reading/settings.py) and never returned: the page learns only where
it comes from ("form", "server", "unreadable" or none) and when it changed.
Checking a provider lists its models, which is free and sends no document.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Awaitable, Callable, Optional

import httpx

from . import settings as reading_settings
from .providers import anthropic as claude, google

API_KEY = re.compile(r"[A-Za-z0-9_.-]{20,300}")
MAX_ACCOUNT_JSON = 20_000
SETTINGS_LOCK = "intelligence.settings"
USABLE = {"form", "server"}
ACCOUNT = "google_service_account"


@dataclass(frozen=True)
class Provider:
    id: str
    name: str
    vendor: str
    secret: str              # settings.SECRET_ENV name of its API key
    model_setting: str       # settings.DEFAULTS key of its chosen model
    model_id: re.Pattern
    list_models: Callable[[str], Awaitable[list[dict]]]


PROVIDERS = {p.id: p for p in (
    Provider("anthropic", "Claude", "Anthropic", "anthropic_api_key", "claude_model",
             re.compile(r"claude-[a-z0-9.-]{1,100}"), claude.list_models),
    Provider("gemini", "Gemini", "Google", "gemini_api_key", "gemini_model",
             google.MODEL_ID, google.list_models),
)}
FALLBACK = "anthropic"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _credential(stored: dict, name: str) -> dict:
    row = stored.get("secret." + name)
    if row and row.get("value"):
        return {"source": "form", "updated_at": str(row.get("updated_at") or "")}
    return {"source": "server" if reading_settings.env_secret(name) else "", "updated_at": ""}


async def _readable(stored: dict, name: str) -> dict:
    """The credential's state, "unreadable" when a saved one will not decrypt
    (a rotated PLATFORM_SECRETS_KEY): readings would quietly fall back."""
    cred = _credential(stored, name)
    if cred["source"] == "form" and not await reading_settings.reveal(stored, name):
        cred["source"] = "unreadable"
    return cred


async def _creds(stored: dict) -> dict[str, dict]:
    return {name: await _readable(stored, name) for name in reading_settings.SECRET_ENV}


def _models(stored: dict, provider: str, current: str) -> tuple[list[dict], str]:
    row = stored.get("models." + provider) or {}
    try:
        models = [m for m in json.loads(row.get("value") or "[]")
                  if isinstance(m, dict) and m.get("id")]
    except ValueError:
        models = []
    # The chosen model stays choosable even before the first check.
    if current and not any(m["id"] == current for m in models):
        models.insert(0, {"id": current, "name": current})
    return models, str(row.get("updated_at") or "")


def needs(pid: str, values: dict, have: set[str]) -> str:
    """Why this provider cannot read documents yet, or "" when it can."""
    p = PROVIDERS[pid]
    if p.secret not in have:
        return f"Needs a {p.name} API key."
    if pid == "gemini" and values["ocr_enabled"] == "1":
        if not values["processor"]:
            return "Document AI OCR is on but has no processor."
        if ACCOUNT not in have:
            return "Document AI OCR is on but has no service-account key."
    return ""


async def snapshot(conn) -> dict:
    stored = await reading_settings.rows(conn)
    values = reading_settings.values(stored)
    creds = await _creds(stored)
    have = {n for n, c in creds.items() if c["source"] in USABLE}
    providers = []
    for p in PROVIDERS.values():
        models, checked = _models(stored, p.id, values[p.model_setting])
        providers.append({
            "id": p.id, "name": p.name, "vendor": p.vendor, "model": values[p.model_setting],
            "models": models, "models_checked_at": checked, "key": creds[p.secret],
            "needs": needs(p.id, values, have)})
    reader = values["provider"] if values["provider"] in PROVIDERS else FALLBACK
    changed = [str(r.get("updated_at") or "") for k, r in stored.items() if not k.startswith("models.")]
    return {
        "reader": reader,
        "active_reader": reader if not needs(reader, values, have) else FALLBACK,
        "providers": providers,
        "ocr": {"enabled": values["ocr_enabled"] == "1", "processor": values["processor"],
                "account": creds[ACCOUNT]},
        "updated_at": max(changed, default=""),
        "can_store_credentials": reading_settings.can_store(),
    }


def _account_json(raw: str) -> str:
    """A Google service-account key, compacted; ValueError when it is not one."""
    if len(raw) > MAX_ACCOUNT_JSON:
        raise ValueError("too long")
    info = json.loads(raw)
    if not (isinstance(info, dict) and info.get("type") == "service_account"
            and info.get("client_email") and info.get("private_key")):
        raise ValueError("not a service-account key")
    compact = json.dumps(info, separators=(",", ":"))
    try:
        google.signed_assertion(compact)  # the private key must actually sign
    except Exception as exc:
        raise ValueError("key does not sign") from exc
    return compact


async def _begin(conn) -> tuple[dict, dict, set[str]]:
    """Serialise writers, then read the state each save validates against."""
    await conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", (SETTINGS_LOCK,))
    stored = await reading_settings.rows(conn)
    creds = await _creds(stored)
    return stored, reading_settings.values(stored), {n for n, c in creds.items() if c["source"] in USABLE}


async def _write(conn, uid: str, change: str, stored: dict, plain: dict[str, str],
                 secrets: dict[str, Optional[str]], meta: dict) -> None:
    """Upsert changed plain values; a secret is encrypted ("" keeps, None removes)."""
    now = _now()
    upsert = ("INSERT INTO platform_settings (key,value,updated_by,updated_at) VALUES (%s,%s,%s,%s)"
              " ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,"
              " updated_by=EXCLUDED.updated_by, updated_at=EXCLUDED.updated_at")
    before = reading_settings.values(stored)
    for key, value in plain.items():
        if key not in stored or before[key] != value:
            await conn.execute(upsert, (reading_settings.PREFIX + key, value, uid, now))
    changed = []
    for name, value in secrets.items():
        if value:
            await conn.execute(upsert, (reading_settings.PREFIX + "secret." + name,
                                        await reading_settings.protect(name, value), uid, now))
            changed.append(name)
        elif value is None:
            await conn.execute("DELETE FROM platform_settings WHERE key=%s",
                               (reading_settings.PREFIX + "secret." + name,))
            changed.append(name)
    try:                                  # inside the `src` package
        from .. import main as _main
    except ImportError:                   # imported bare off src/
        import main as _main              # type: ignore[no-redef]
    await _main.log_audit(conn, uid, "intelligence_settings.update", "intelligence",
                          actor_kind=_main.audit.ACTOR_ADMIN,
                          metadata={"change": change, **meta, "credentials": ",".join(changed)})


async def set_reader(conn, uid: str, provider: str) -> bool:
    """Point document reading at a provider that can run now. False = refused.
    The fallback is always allowed: it is the rollback, and readings use it
    whenever the chosen provider cannot run anyway."""
    if provider not in PROVIDERS:
        return False
    stored, values, have = await _begin(conn)
    if provider != FALLBACK and needs(provider, values, have):
        return False
    await _write(conn, uid, "reader", stored, {"provider": provider}, {}, {"provider": provider})
    return True


async def save_provider(conn, uid: str, provider: str, *, model: str, api_key: str = "",
                        forget_key: bool = False) -> bool:
    """One provider's model and key. A blank key keeps the saved one. Removing
    the key of the provider now reading is refused: switch reader first."""
    p = PROVIDERS.get(provider)
    api_key = api_key.strip()
    if not p or not p.model_id.fullmatch(model) or (api_key and not API_KEY.fullmatch(api_key)):
        return False
    stored, values, have = await _begin(conn)
    if forget_key and not api_key:
        after = have - {p.secret} if _credential(stored, p.secret)["source"] == "form" else have
        if provider == values["provider"] and needs(provider, values, after):
            return False
    secret = api_key if api_key else (None if forget_key else "")
    await _write(conn, uid, "provider", stored, {p.model_setting: model}, {p.secret: secret},
                 {"provider": provider, "model": model})
    return True


async def save_ocr(conn, uid: str, *, enabled: bool, processor: str, service_account: str = "",
                   forget_service_account: bool = False) -> bool:
    """Gemini's Document AI step. Refused when it would stop Gemini reading
    while Gemini is the reader."""
    processor = processor.strip()
    service_account = service_account.strip()
    if processor and not google.PROCESSOR.fullmatch(processor):
        return False
    if service_account:
        try:
            service_account = _account_json(service_account)
        except ValueError:
            return False
    stored, values, have = await _begin(conn)
    plain = {"ocr_enabled": "1" if enabled else "0", "processor": processor}
    after = set(have)
    if service_account:
        after.add(ACCOUNT)
    elif forget_service_account and _credential(stored, ACCOUNT)["source"] == "form":
        after.discard(ACCOUNT)
    if values["provider"] == "gemini" and needs("gemini", {**values, **plain}, after):
        return False
    secret = service_account if service_account else (None if forget_service_account else "")
    await _write(conn, uid, "ocr", stored, plain, {ACCOUNT: secret}, {"ocr_enabled": plain["ocr_enabled"]})
    return True


async def check(pool, uid: str, provider: str) -> dict:
    """List a provider's models with its key and keep the list for the page.

    The provider call runs outside any transaction; only the result is written.
    Messages are fixed sentences: a provider's error body never reaches the page.
    """
    p = PROVIDERS.get(provider)
    if not p:
        return {"ok": False, "message": "Unknown provider.", "count": 0}
    async with pool.connection() as conn:
        stored = await reading_settings.rows(conn)
    key = await reading_settings.reveal(stored, p.secret)
    if not key:
        return {"ok": False, "count": 0, "message": f"Save a {p.name} API key first."}
    try:
        models = await p.list_models(key)
    except httpx.HTTPStatusError as exc:
        refused = exc.response.status_code in (400, 401, 403)
        return {"ok": False, "count": 0, "message": (
            f"{p.name} did not accept the API key." if refused
            else f"{p.name} answered with an error (HTTP {exc.response.status_code}). Try again.")}
    except Exception:
        return {"ok": False, "count": 0, "message": f"{p.name} could not be reached. Try again."}
    async with pool.connection() as conn:
        await conn.execute(
            "INSERT INTO platform_settings (key,value,updated_by,updated_at) VALUES (%s,%s,%s,%s)"
            " ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,"
            " updated_by=EXCLUDED.updated_by, updated_at=EXCLUDED.updated_at",
            (f"{reading_settings.PREFIX}models.{provider}", json.dumps(models), uid, _now()))
    return {"ok": True, "message": "", "count": len(models)}
