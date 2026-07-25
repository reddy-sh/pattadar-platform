"""Admin endpoints for the platform model catalog.

Ported from rhub api/gateway/routes_admin_models.py. Super-admin only —
the RBAC `platform.manage` gate is replaced by the ADMIN_USER_IDS
allowlist (auth.require_admin, FAIL CLOSED). All endpoints:

  GET    /admin/models              List the catalog (filters: provider, enabled, use_case, status)
  POST   /admin/models/sync         Delta-fetch from a provider's list endpoint
  PATCH  /admin/models/{id}         Update tier / enabled / use_cases / notes / display_name
  POST   /admin/models/clear-removed  Bulk-delete provider-removed + disabled models
  DELETE /admin/models/{id}         Hard-delete one disabled model
  GET    /admin/models/{id}/audit   Per-model change history
  GET    /admin/model-providers     List configured providers
  POST   /admin/model-providers     Add or update a provider

Audit: every mutation writes a row to platform_model_audit so admins can
see who changed what.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

import psycopg
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from psycopg.rows import dict_row
from pydantic import BaseModel, Field

from .auth import extract_user_id, require_admin, require_auth
from .db import _conninfo
from . import model_providers as _providers

_log = logging.getLogger("pattadar.gateway.admin_models")

router = APIRouter(prefix="/api/gateway/admin", tags=["admin-models"])


# ── Helpers ─────────────────────────────────────────────────────────────────

async def _require_admin(request: Request) -> Optional[JSONResponse]:
    """Gate every endpoint behind the super-admin allowlist. FAILS CLOSED."""
    return await require_admin(request)


def _row_to_dict(row: Dict[str, Any]) -> Dict[str, Any]:
    """psycopg dict_row → plain dict, JSON-friendly."""
    out = dict(row)
    for k, v in list(out.items()):
        if isinstance(v, datetime):
            out[k] = v.isoformat()
    return out


def _with_defaults(row: Dict[str, Any]) -> Dict[str, Any]:
    """Attach the provider's per-family default cost/context to a row so the
    admin UI can show it next to each editable field. Read-only — PATCH never
    accepts these. Unknown family → no defaults (keys stay None)."""
    specs = _providers.default_specs(
        row.get("provider_id") or "", row.get("model_id") or "", row.get("family") or ""
    )
    row["default_input_cost_per_mtok"] = specs.get("input")
    row["default_output_cost_per_mtok"] = specs.get("output")
    row["default_context_window"] = specs.get("context")
    row["default_max_output_tokens"] = specs.get("max_output")
    return row


def _audit(cur, model_id: str, action: str, before: Optional[dict], after: Optional[dict], actor: str) -> None:
    cur.execute(
        "INSERT INTO platform_model_audit (model_id, action, before, after, actor) "
        "VALUES (%s, %s, %s::jsonb, %s::jsonb, %s)",
        (model_id, action, json.dumps(before) if before else None,
         json.dumps(after) if after else None, actor),
    )


def _resolve_api_key(secret_ref: str) -> str:
    """Look up the API key — secret_ref is treated as an env var name."""
    return (os.getenv(secret_ref) or "").strip()


# ── Models: list ────────────────────────────────────────────────────────────

@router.get("/models")
async def list_models(
    request: Request,
    provider: Optional[str] = None,
    enabled: Optional[bool] = None,
    use_case: Optional[str] = None,
    status: Optional[str] = None,  # 'active' | 'removed'
    _claims: Dict[str, Any] = Depends(require_auth),
):
    deny = await _require_admin(request)
    if deny is not None:
        return deny

    def _query() -> List[Dict[str, Any]]:
        where: List[str] = []
        params: List[Any] = []
        if provider:
            where.append("provider_id = %s")
            params.append(provider)
        if enabled is not None:
            where.append("enabled = %s")
            params.append(enabled)
        if use_case:
            where.append("use_cases @> %s::jsonb")
            params.append(json.dumps([use_case]))
        if status:
            where.append("provider_status = %s")
            params.append(status)
        sql = "SELECT * FROM platform_models"
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY provider_id ASC, released_at DESC NULLS LAST"
        with psycopg.connect(_conninfo(), row_factory=dict_row) as conn, conn.cursor() as cur:
            cur.execute(sql, params)
            return [_with_defaults(_row_to_dict(r)) for r in cur.fetchall()]

    try:
        models = await asyncio.to_thread(_query)
        return {"models": models}
    except Exception as e:
        _log.exception("admin_models.list_failed")
        return JSONResponse(status_code=500, content={"error": str(e)})


# ── Models: sync ────────────────────────────────────────────────────────────

class SyncRequest(BaseModel):
    provider: str = Field(..., description="Provider id, e.g. 'anthropic'")


@router.post("/models/sync")
async def sync_models(
    request: Request,
    body: SyncRequest,
    _claims: Dict[str, Any] = Depends(require_auth),
):
    """Delta-fetch from a provider. Inserts NEW models as enabled=false.

    Returns:
      {discovered: N, ids: [...], existing: M, last_known_release: '...'}

    If the provider returns models we already have but with newer
    display_name/family info, we leave existing rows alone — admin edits
    win. Models that previously existed but are no longer returned get
    marked provider_status='removed' so the UI can flag them.
    """
    deny = await _require_admin(request)
    if deny is not None:
        return deny

    actor = extract_user_id(request) or "anonymous"
    provider_id = body.provider.strip()

    def _provider_row() -> Optional[Dict[str, Any]]:
        with psycopg.connect(_conninfo(), row_factory=dict_row) as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT id, list_endpoint, auth_secret, enabled FROM model_providers WHERE id = %s",
                (provider_id,),
            )
            return cur.fetchone()

    prov = await asyncio.to_thread(_provider_row)
    if not prov:
        return JSONResponse(status_code=404, content={"error": f"Unknown provider '{provider_id}'"})
    if not prov["enabled"]:
        return JSONResponse(status_code=400, content={"error": f"Provider '{provider_id}' is disabled"})

    adapter = _providers.get_adapter(provider_id)
    if adapter is None:
        return JSONResponse(
            status_code=501,
            content={"error": f"No adapter registered for provider '{provider_id}'"},
        )

    api_key = _resolve_api_key(prov["auth_secret"])
    if not api_key:
        return JSONResponse(
            status_code=400,
            content={"error": f"API key env var '{prov['auth_secret']}' is not set"},
        )

    # Pull live models from the provider
    try:
        live = await adapter(api_key)
    except Exception as e:
        _log.exception("admin_models.sync.adapter_failed", extra={"provider": provider_id})
        return JSONResponse(status_code=502, content={"error": f"Provider fetch failed: {e}"})

    # Reconcile with the catalog
    def _reconcile() -> Dict[str, Any]:
        with psycopg.connect(_conninfo(), row_factory=dict_row, autocommit=False) as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT model_id, released_at, input_cost_per_mtok, context_window "
                "  FROM platform_models WHERE provider_id = %s",
                (provider_id,),
            )
            existing = {r["model_id"]: r for r in cur.fetchall()}

            # Max release we've seen so far — returned as informational only.
            # Discovery is "not in catalog", NOT "newer than max" — admins
            # who seed only the latest model still want older Anthropic
            # models backfilled on sync.
            max_existing = max(
                (r["released_at"] for r in existing.values() if r["released_at"]),
                default=None,
            )

            discovered: List[Dict[str, Any]] = []
            backfilled_specs: List[str] = []
            seen_ids = {m.model_id for m in live}

            for m in live:
                row_id = f"{provider_id}:{m.model_id}"
                if m.model_id in existing:
                    # Already in catalog — backfill cost/context if we now
                    # have spec data and the row was missing it. No enable
                    # toggle, no audit of ignorable field writes.
                    ex = existing[m.model_id]
                    if (m.input_cost_per_mtok is not None and ex["input_cost_per_mtok"] is None) or \
                       (m.context_window is not None and ex["context_window"] is None):
                        cur.execute(
                            """
                            UPDATE platform_models
                               SET input_cost_per_mtok  = COALESCE(input_cost_per_mtok,  %s),
                                   output_cost_per_mtok = COALESCE(output_cost_per_mtok, %s),
                                   context_window       = COALESCE(context_window,       %s),
                                   max_output_tokens    = COALESCE(max_output_tokens,    %s)
                             WHERE id = %s
                            """,
                            (m.input_cost_per_mtok, m.output_cost_per_mtok,
                             m.context_window, m.max_output_tokens, row_id),
                        )
                        if cur.rowcount > 0:
                            backfilled_specs.append(row_id)
                    continue

                # Insert every unseen model, regardless of release date.
                cur.execute(
                    """
                    INSERT INTO platform_models
                      (id, provider_id, model_id, display_name, family,
                       enabled, use_cases, released_at, provider_status,
                       input_cost_per_mtok, output_cost_per_mtok,
                       context_window, max_output_tokens)
                    VALUES (%s, %s, %s, %s, %s, false, '[]'::jsonb, %s, 'active',
                            %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    (row_id, provider_id, m.model_id, m.display_name,
                     m.family, m.released_at,
                     m.input_cost_per_mtok, m.output_cost_per_mtok,
                     m.context_window, m.max_output_tokens),
                )
                _audit(cur, row_id, "discovered",
                       None,
                       {"display_name": m.display_name, "family": m.family,
                        "released_at": m.released_at.isoformat() if m.released_at else None,
                        "input_cost_per_mtok": m.input_cost_per_mtok,
                        "output_cost_per_mtok": m.output_cost_per_mtok,
                        "context_window": m.context_window,
                        "max_output_tokens": m.max_output_tokens},
                       actor)
                discovered.append({
                    "id": row_id,
                    "model_id": m.model_id,
                    "display_name": m.display_name,
                    "family": m.family,
                    "released_at": m.released_at.isoformat() if m.released_at else None,
                    "input_cost_per_mtok": m.input_cost_per_mtok,
                    "output_cost_per_mtok": m.output_cost_per_mtok,
                    "context_window": m.context_window,
                    "max_output_tokens": m.max_output_tokens,
                })

            # Mark anything we have but provider didn't return as removed
            removed: List[str] = []
            for mid, row in existing.items():
                if mid not in seen_ids:
                    row_id = f"{provider_id}:{mid}"
                    cur.execute(
                        "UPDATE platform_models SET provider_status = 'removed' "
                        " WHERE id = %s AND provider_status <> 'removed'",
                        (row_id,),
                    )
                    if cur.rowcount > 0:
                        _audit(cur, row_id, "removed_by_provider", None, None, actor)
                        removed.append(row_id)

            conn.commit()
            return {
                "provider": provider_id,
                "discovered": len(discovered),
                "ids": [d["id"] for d in discovered],
                "models": discovered,
                "existing": len(existing),
                "removed": removed,
                "specs_backfilled": backfilled_specs,
                "last_known_release": max_existing.isoformat() if max_existing else None,
                "fetched_at": datetime.utcnow().isoformat(),
            }

    try:
        result = await asyncio.to_thread(_reconcile)
        _log.info(
            "admin_models.sync.ok provider=%s discovered=%d existing=%d removed=%d",
            provider_id, result["discovered"], result["existing"], len(result["removed"]),
        )
        return result
    except Exception as e:
        _log.exception("admin_models.sync.reconcile_failed")
        return JSONResponse(status_code=500, content={"error": str(e)})


# ── Models: patch ───────────────────────────────────────────────────────────

class PatchModelRequest(BaseModel):
    display_name: Optional[str] = None
    tier: Optional[str] = None  # any string or "" to clear
    enabled: Optional[bool] = None
    use_cases: Optional[List[str]] = None
    notes: Optional[str] = None
    input_cost_per_mtok: Optional[float] = None    # USD/M tokens
    output_cost_per_mtok: Optional[float] = None
    context_window: Optional[int] = None
    max_output_tokens: Optional[int] = None


@router.patch("/models/{model_id:path}")
async def patch_model(
    model_id: str,
    body: PatchModelRequest,
    request: Request,
    _claims: Dict[str, Any] = Depends(require_auth),
):
    deny = await _require_admin(request)
    if deny is not None:
        return deny

    actor = extract_user_id(request) or "anonymous"

    def _apply() -> Optional[Dict[str, Any]]:
        with psycopg.connect(_conninfo(), row_factory=dict_row, autocommit=False) as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM platform_models WHERE id = %s FOR UPDATE", (model_id,))
            row = cur.fetchone()
            if not row:
                return None
            before = _row_to_dict(row)

            sets: List[str] = []
            params: List[Any] = []
            if body.display_name is not None:
                sets.append("display_name = %s")
                params.append(body.display_name)
            if body.tier is not None:
                sets.append("tier = %s")
                params.append(body.tier or None)
            if body.notes is not None:
                sets.append("notes = %s")
                params.append(body.notes)
            if body.use_cases is not None:
                sets.append("use_cases = %s::jsonb")
                params.append(json.dumps(body.use_cases))
            if body.input_cost_per_mtok is not None:
                sets.append("input_cost_per_mtok = %s")
                params.append(body.input_cost_per_mtok)
            if body.output_cost_per_mtok is not None:
                sets.append("output_cost_per_mtok = %s")
                params.append(body.output_cost_per_mtok)
            if body.context_window is not None:
                sets.append("context_window = %s")
                params.append(body.context_window)
            if body.max_output_tokens is not None:
                sets.append("max_output_tokens = %s")
                params.append(body.max_output_tokens)
            if body.enabled is not None and bool(body.enabled) != bool(row["enabled"]):
                sets.append("enabled = %s")
                params.append(body.enabled)
                if body.enabled:
                    sets.append("enabled_at = now()")
                    sets.append("enabled_by = %s")
                    params.append(actor)

            if not sets:
                return before

            params.append(model_id)
            cur.execute(
                f"UPDATE platform_models SET {', '.join(sets)} WHERE id = %s RETURNING *",
                params,
            )
            after_row = cur.fetchone()
            after = _row_to_dict(after_row) if after_row else before

            # Audit: one row per logical change (enable/disable/tier/use_cases/notes)
            if body.enabled is not None and bool(body.enabled) != bool(before["enabled"]):
                _audit(cur, model_id, "enabled" if body.enabled else "disabled",
                       {"enabled": before["enabled"]}, {"enabled": after["enabled"]}, actor)
            if body.tier is not None and (body.tier or None) != before.get("tier"):
                _audit(cur, model_id, "tier_changed",
                       {"tier": before.get("tier")}, {"tier": after.get("tier")}, actor)
            if body.use_cases is not None and body.use_cases != before.get("use_cases"):
                _audit(cur, model_id, "use_cases_changed",
                       {"use_cases": before.get("use_cases")},
                       {"use_cases": after.get("use_cases")}, actor)

            conn.commit()
            return after

    try:
        result = await asyncio.to_thread(_apply)
        if result is None:
            return JSONResponse(status_code=404, content={"error": "Model not found"})
        return result
    except Exception as e:
        _log.exception("admin_models.patch_failed")
        return JSONResponse(status_code=500, content={"error": str(e)})


# ── Models: delete ──────────────────────────────────────────────────────────

@router.post("/models/clear-removed")
async def clear_removed_models(
    request: Request,
    _claims: Dict[str, Any] = Depends(require_auth),
):
    """Bulk-delete every provider-'removed' model that is also disabled. Models
    still enabled are left in place (something may be pinned to them) and
    reported as skipped. Audited per row."""
    deny = await _require_admin(request)
    if deny is not None:
        return deny

    actor = extract_user_id(request) or "anonymous"

    def _clear() -> Dict[str, int]:
        with psycopg.connect(_conninfo(), row_factory=dict_row, autocommit=False) as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT id, display_name FROM platform_models "
                " WHERE provider_status = 'removed' AND enabled = false"
            )
            rows = cur.fetchall()
            for r in rows:
                _audit(cur, r["id"], "deleted",
                       {"display_name": r["display_name"], "provider_status": "removed"}, None, actor)
            cur.execute(
                "DELETE FROM platform_models WHERE provider_status = 'removed' AND enabled = false"
            )
            cur.execute(
                "SELECT count(*) AS n FROM platform_models "
                " WHERE provider_status = 'removed' AND enabled = true"
            )
            skipped = cur.fetchone()["n"]
            conn.commit()
            return {"deleted": len(rows), "skipped_enabled": skipped}

    try:
        return await asyncio.to_thread(_clear)
    except Exception as e:
        _log.exception("admin_models.clear_removed_failed")
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.delete("/models/{model_id:path}")
async def delete_model(
    model_id: str,
    request: Request,
    _claims: Dict[str, Any] = Depends(require_auth),
):
    """Hard-delete a single catalog row. Refuses enabled models (disable first)
    so an in-use model can't be deleted out from under the gateway. Audit
    history is kept — platform_model_audit doesn't FK to platform_models."""
    deny = await _require_admin(request)
    if deny is not None:
        return deny

    actor = extract_user_id(request) or "anonymous"

    def _delete() -> str:
        with psycopg.connect(_conninfo(), row_factory=dict_row, autocommit=False) as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT display_name, enabled, provider_status FROM platform_models WHERE id = %s FOR UPDATE",
                (model_id,),
            )
            row = cur.fetchone()
            if not row:
                return "not_found"
            if row["enabled"]:
                return "enabled"
            _audit(cur, model_id, "deleted",
                   {"display_name": row["display_name"], "provider_status": row["provider_status"]},
                   None, actor)
            cur.execute("DELETE FROM platform_models WHERE id = %s", (model_id,))
            conn.commit()
            return "ok"

    try:
        outcome = await asyncio.to_thread(_delete)
    except Exception as e:
        _log.exception("admin_models.delete_failed")
        return JSONResponse(status_code=500, content={"error": str(e)})

    if outcome == "not_found":
        return JSONResponse(status_code=404, content={"error": "Model not found"})
    if outcome == "enabled":
        return JSONResponse(status_code=409, content={"error": "Disable the model before deleting it"})
    return {"deleted": model_id}


# ── Audit: per-model history ───────────────────────────────────────────────

@router.get("/models/{model_id:path}/audit")
async def model_audit(
    model_id: str,
    request: Request,
    limit: int = 50,
    _claims: Dict[str, Any] = Depends(require_auth),
):
    deny = await _require_admin(request)
    if deny is not None:
        return deny

    def _query() -> List[Dict[str, Any]]:
        with psycopg.connect(_conninfo(), row_factory=dict_row) as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT id, action, before, after, actor, at FROM platform_model_audit "
                " WHERE model_id = %s ORDER BY at DESC LIMIT %s",
                (model_id, max(1, min(500, limit))),
            )
            return [_row_to_dict(r) for r in cur.fetchall()]

    try:
        return {"audit": await asyncio.to_thread(_query)}
    except Exception as e:
        _log.exception("admin_models.audit_failed")
        return JSONResponse(status_code=500, content={"error": str(e)})


# ── Providers: list / upsert ────────────────────────────────────────────────

class ProviderRequest(BaseModel):
    id: str
    display_name: str
    list_endpoint: str
    auth_secret: str
    enabled: bool = True


@router.get("/model-providers")
async def list_providers(
    request: Request,
    _claims: Dict[str, Any] = Depends(require_auth),
):
    deny = await _require_admin(request)
    if deny is not None:
        return deny

    def _query() -> List[Dict[str, Any]]:
        with psycopg.connect(_conninfo(), row_factory=dict_row) as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM model_providers ORDER BY id")
            rows = [_row_to_dict(r) for r in cur.fetchall()]
        # Annotate with adapter availability
        known = set(_providers.known_providers())
        for r in rows:
            r["adapter_available"] = r["id"] in known
            r["api_key_configured"] = bool(_resolve_api_key(r["auth_secret"]))
        return rows

    try:
        return {"providers": await asyncio.to_thread(_query)}
    except Exception as e:
        _log.exception("admin_models.providers_list_failed")
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.post("/model-providers")
async def upsert_provider(
    request: Request,
    body: ProviderRequest,
    _claims: Dict[str, Any] = Depends(require_auth),
):
    deny = await _require_admin(request)
    if deny is not None:
        return deny

    def _apply() -> Dict[str, Any]:
        with psycopg.connect(_conninfo(), row_factory=dict_row) as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO model_providers (id, display_name, list_endpoint, auth_secret, enabled, updated_at)
                VALUES (%s, %s, %s, %s, %s, now())
                ON CONFLICT (id) DO UPDATE SET
                  display_name = EXCLUDED.display_name,
                  list_endpoint = EXCLUDED.list_endpoint,
                  auth_secret = EXCLUDED.auth_secret,
                  enabled = EXCLUDED.enabled,
                  updated_at = now()
                RETURNING *
                """,
                (body.id, body.display_name, body.list_endpoint, body.auth_secret, body.enabled),
            )
            row = cur.fetchone()
            conn.commit()
            return _row_to_dict(row) if row else {}

    try:
        return await asyncio.to_thread(_apply)
    except Exception as e:
        _log.exception("admin_models.provider_upsert_failed")
        return JSONResponse(status_code=500, content={"error": str(e)})
