"""Revocable bearer access to explicitly selected files and service work.

Public responses expose a frozen manifest, never owner IDs or storage keys.
The internal grant routes are reachable only by the gateway's fixed storage
adapter; its generic API proxy denies the entire /internal namespace.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import JSONResponse

try:
    from . import web360 as w, ticketing
except ImportError:
    import web360 as w
    import ticketing

router = APIRouter(tags=["recipient access"])
TOKEN = re.compile(r"^[A-Za-z0-9_-]{43}$")
TABLES = {"document": "documents", "parcel_photo": "parcel_photos", "property_photo": "property_photos"}


def object_of(raw) -> dict:
    try:
        value = json.loads(raw) if isinstance(raw, str) else raw
    except (ValueError, TypeError):
        return {}
    return value if isinstance(value, dict) else {}


def unexpired(raw: str, today: date | None = None) -> bool:
    """Legacy dates remain readable; malformed or missing expiry denies access."""
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).date() >= (today or datetime.now(timezone.utc).date())
        except (ValueError, TypeError):
            pass
    return False


def boundary_geojson(raw: str) -> dict | None:
    try:
        coords = []
        for pair in raw.split(";"):
            lat, lon = map(float, pair.split(","))
            if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
                return None
            coords.append([lon, lat])
        if len(coords) < 3:
            return None
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        return {"type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": [coords]}}
    except (ValueError, TypeError, AttributeError):
        return None


async def snapshot(conn, uid: str, record_id: str, requested: dict, *, all_documents: bool = False) -> dict:
    """Validate record ownership and every selection; never accept caller geometry."""
    kind = await w._record_kind(conn, uid, record_id)
    if not kind:
        raise ValueError("This record is unavailable")
    items = []
    for key, table, item_kind, record_col in (
        ("documentIds", "documents", "document", "record_id"),
        ("photoIds", w._photo_table(kind), "parcel_photo" if kind == "parcel" else "property_photo",
         "parcel_id" if kind == "parcel" else "property_id"),
    ):
        chosen = requested.get(key, [])
        if not isinstance(chosen, list) or len(chosen) > 500 or any(not isinstance(x, str) for x in chosen):
            raise ValueError("Invalid file selection")
        clause = f"{record_col}=%s"
        args = [uid, record_id]
        if table == "documents":
            clause = "(record_id=%s OR parcel_id=%s OR property_id=%s)"
            args.extend([record_id, record_id])
        cur = await conn.execute(f"SELECT * FROM {table} WHERE owner_user_id=%s AND {clause}", tuple(args))
        rows = list(await cur.fetchall())
        selected = set(chosen)
        if all_documents and table == "documents":
            selected = {r["id"] for r in rows}
        if selected - {r["id"] for r in rows}:
            raise ValueError("A selected file is not on this record")
        for row in rows:
            if row["id"] in selected:
                items.append({"id": row["id"], "kind": item_kind,
                              "title": row.get("name") or row.get("caption") or row.get("file_name") or "File",
                              "file_ref": row.get("file_ref") or ""})
    geometry = None
    if requested.get("includeBoundary") is True:
        table = "parcels" if kind == "parcel" else "properties"
        row = await (await conn.execute(f"SELECT boundary FROM {table} WHERE id=%s", (record_id,))).fetchone()
        geometry = boundary_geojson((row or {}).get("boundary") or "")
        if not geometry:
            raise ValueError("There is no saved boundary to share")
    return {"version": 1, "recordId": record_id, "items": items, "boundary": geometry}


async def capability(conn, scope: str, token: str, *, lock: bool = False) -> tuple[dict, dict, dict]:
    if scope not in ("shares", "work") or not TOKEN.fullmatch(token):
        raise HTTPException(404, "This link is unavailable")
    table = "share_links" if scope == "shares" else "ticket_dispatches"
    row = await (await conn.execute(f"SELECT * FROM {table} WHERE token_hash=%s",
                 (hashlib.sha256(token.encode()).hexdigest(),))).fetchone()
    if not row or row.get("revoked") or row.get("revoked_at") or not unexpired(row.get("expires_on", "")):
        raise HTTPException(410, "This link has expired or was revoked")
    uid = row["owner_user_id"]
    ticket = {}
    if scope == "work":
        ticket = await w._ticket_row(conn, uid, row["ticket_id"], lock=lock)
        if lock:
            # Revocation and settlement take this same ticket lock. Re-read
            # after waiting, so a request queued before revocation cannot win
            # with a stale credential once the owner has withdrawn it.
            row = await (await conn.execute("SELECT * FROM ticket_dispatches WHERE id=%s", (row["id"],))).fetchone()
            if not row or row.get("revoked_at") or not unexpired(row.get("expires_on", "")):
                raise HTTPException(410, "This work link has expired or was revoked")
        if not ticket or w._status_of(ticket) == "cancelled" or row.get("status") == "failed":
            raise HTTPException(410, "This work request is unavailable")
        # Each dispatch freezes the selection, so later orders never widen it.
        manifest = object_of(row.get("manifest"))
        record_id = ticket.get("entity_id") or ""
    else:
        manifest = object_of(row.get("manifest"))
        record_id = row.get("record_id") or ""
    if not record_id or not await w._record_kind(conn, uid, record_id):
        raise HTTPException(410, "This record is no longer shared")
    return row, manifest, ticket


def public_manifest(manifest: dict) -> dict:
    return {"items": [{"id": x["id"], "title": x["title"], "kind": x["kind"],
                       "available": bool(x.get("file_ref"))} for x in manifest.get("items", [])],
            "boundary": manifest.get("boundary")}


def response(body: dict) -> JSONResponse:
    return JSONResponse(body, headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff"})


@router.get("/public/{scope}/{token}")
async def recipient_view(scope: str, token: str):
    async with w._pool.connection() as conn:
        row, manifest, ticket = await capability(conn, scope, token)
        data = {**public_manifest(manifest), "title": row.get("subject") or ticket.get("title") or "Shared files",
                "expiresOn": row["expires_on"], "scope": scope}
        if scope == "shares":
            await conn.execute("UPDATE share_links SET opened_count=opened_count+1,last_opened_at=%s WHERE id=%s",
                               (w._now_iso(), row["id"]))
        else:
            status = w._status_of(ticket)
            items = await (await conn.execute("SELECT id,label,note,review,review_note,submitted_at FROM ticket_deliverables WHERE ticket_id=%s AND owner_user_id=%s ORDER BY sort",
                           (ticket["id"], row["owner_user_id"]))).fetchall()
            data.update({"status": status, "statusLabel": ticketing.STATUS_LABEL.get(status, status),
                         "actions": ticketing.can(status, "worker"), "note": ticket.get("note") or "",
                         "outcomeNote": ticket.get("outcome_note") or "", "dueDate": ticket.get("due_date") or "",
                         "answers": [{"label": a.k, "value": a.v} for a in w._answers(ticket.get("kind") or "", ticket.get("params") or "{}")],
                         "deliverables": list(items)})
        return response(data)


@router.get("/internal/capabilities/{scope}/{token}/files/{item_id}")
async def file_grant(scope: str, token: str, item_id: str):
    async with w._pool.connection() as conn:
        row, manifest, _ = await capability(conn, scope, token)
        item = next((x for x in manifest.get("items", []) if x.get("id") == item_id), None)
        if not item or not item.get("file_ref") or item.get("kind") not in TABLES:
            raise HTTPException(404, "This file is not shared")
        # A deleted or replaced source cannot continue exposing the old bytes.
        source = await (await conn.execute(f"SELECT file_ref FROM {TABLES[item['kind']]} WHERE id=%s AND owner_user_id=%s",
                        (item_id, row["owner_user_id"]))).fetchone()
        if not source or source.get("file_ref") != item["file_ref"]:
            raise HTTPException(410, "This file is no longer shared")
        return response({"owner": row["owner_user_id"], "fileRef": item["file_ref"]})


@router.get("/internal/capabilities/work/{token}/upload")
async def upload_grant(token: str):
    async with w._pool.connection() as conn:
        row, _, ticket = await capability(conn, "work", token)
        if w._status_of(ticket) not in ("assigned", "on_site", "changes", "submitted"):
            raise HTTPException(409, "Accept this job before submitting work")
        return response({"owner": row["owner_user_id"]})


@router.post("/public/work/{token}/actions")
async def worker_action(token: str, body: dict = Body(...)):
    """Accept or start a job from the token portal. Two people, one job, one winner.

    `_move` answers "" when it refused — either the pair is not in
    TRANSITIONS, or its compare-and-set found the row already moved out from
    under us. That answer used to be thrown away and this route replied
    `ok: True` regardless, so the second surveyor to press Accept was told the
    job was his while the database said it was the first man's. He would then
    drive to the land. Worse, the `assignee` write that precedes the move had
    already landed, so the ticket named him even though its status never moved.

    Raising inside `_ticket_transaction` rolls the whole attempt back — that
    assignee write with it — and answers 409, which is what the losing
    accepter should have been told in the first place. The cheaper pre-check
    stays: it catches the ordinary "somebody took this an hour ago" case with
    no writes attempted at all, and it is the only one of the two that knows
    *why* the move is unavailable.
    """
    action = body.get("action")
    if action not in ("assign", "start"):
        raise HTTPException(400, "Choose an available action")
    async with w._ticket_transaction() as conn:
        row, _, ticket = await capability(conn, "work", token, lock=True)
        actor = row.get("person_name") or "Worker"
        if not ticketing.transition(w._status_of(ticket), action, "worker").get("ok"):
            raise HTTPException(409, "This action is no longer available")
        if action == "assign":
            ticket["assignee"] = actor
            await conn.execute("UPDATE work_requests SET assignee=%s WHERE id=%s AND owner_user_id=%s", (actor, ticket["id"], row["owner_user_id"]))
        if not await w._move(conn, row["owner_user_id"], ticket, action, actor_kind="worker", actor_label=actor):
            raise HTTPException(409, "This action is no longer available")
    return response({"ok": True})


@router.post("/internal/capabilities/work/{token}/deliverables")
async def worker_deliverable(token: str, body: dict = Body(...)):
    """Gateway supplies uploaded storage IDs, never IDs from a public JSON body."""
    label, note = str(body.get("label") or "").strip(), str(body.get("note") or "").strip()
    file_ref = str(body.get("fileRef") or "")
    if not label or len(label) > 240 or len(note) > 10000:
        raise HTTPException(400, "Add a short title and a note under 10,000 characters")
    async with w._ticket_transaction() as conn:
        row, _, ticket = await capability(conn, "work", token, lock=True)
        status = w._status_of(ticket)
        if status not in ("assigned", "on_site", "changes", "submitted"):
            raise HTTPException(409, "This job is not accepting work")
        uid, tid, did = row["owner_user_id"], ticket["id"], f"dv-{uuid.uuid4().hex[:12]}"
        actor = row.get("person_name") or "Worker"
        if not file_ref:
            await w._event(conn, uid, tid, kind="message", actor_kind="worker", actor_label=actor,
                           headline=f"{actor}: {label}", detail=note)
            return response({"ok": True, "message": True})
        kind = "photo" if body.get("kind") == "photo" else "paper"
        sort = (await (await conn.execute("SELECT COALESCE(MAX(sort),0)+1 AS s FROM ticket_deliverables WHERE ticket_id=%s", (tid,))).fetchone())["s"]
        await conn.execute("INSERT INTO ticket_deliverables (id,owner_user_id,ticket_id,record_id,kind,label,note,file_ref,file_name,mime_type,size_bytes,payload,submitted_by,submitted_via,submitted_at,file_as,sort,created_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'{}',%s,'worker',%s,%s,%s,%s)",
            (did, uid, tid, ticket.get("entity_id") or "", kind, label, note, file_ref,
             str(body.get("fileName") or ""), str(body.get("mimeType") or ""), int(body.get("sizeBytes") or 0),
             actor, w._ddmmyyyy(w._today()), "general" if kind == "photo" else "unsorted", sort, w._now_iso()))
        await w._event(conn, uid, tid, kind="deliverable", actor_kind="worker", actor_label=actor,
                       ref_table="ticket_deliverables", ref_id=did, headline=f"{actor} submitted {label}", detail=note)
        if status != "submitted":
            await w._move(conn, uid, ticket, "deliver", actor_kind="worker", actor_label=actor)
    return response({"ok": True, "id": did})
