"""growth.py — invitations the invitee can act on, their setup tasks, and referrals.

See docs/specs/2026-09-27-invitations-onboarding-referrals.md.

* An invitation link (`/i/<token>` or the older `/verify/<token>`) opens a public
  preview that says only who invited you and for what — never land, extents,
  shares or documents. Possession of the single-use, hashed, expiring token is
  the proof of contact control, exactly as the existing verify flow treats it.
* `claimInvitation` is authenticated: it binds the invitation to the signed-in
  immutable principal (`accepted_by`), links a heir's family_members row
  (`linked_principal`), writes the invitee's setup tasks, and attributes the
  new account to the inviter as a referral.
* Referral rewards are recorded entitlements (`referral_rewards`, state
  `earned`). Nothing is redeemed, charged or paid; redemption is a later,
  separately approved change.

Every table keys its person by `owner_user_id`, so account export and erasure
pick them up through the catalog like every other owned table.
"""
from __future__ import annotations

import os
import re
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

import strawberry

DDL = (
    "ALTER TABLE invitations ADD COLUMN IF NOT EXISTS owner_user_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE invitations ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE invitations ADD COLUMN IF NOT EXISTS accepted_by TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE invitations ADD COLUMN IF NOT EXISTS accepted_at TEXT NOT NULL DEFAULT ''",
    "CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations (token) WHERE token <> ''",
    "ALTER TABLE family_members ADD COLUMN IF NOT EXISTS linked_principal TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE family_members ADD COLUMN IF NOT EXISTS heir_confirmed TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE family_members ADD COLUMN IF NOT EXISTS heir_note TEXT NOT NULL DEFAULT ''",
    """CREATE TABLE IF NOT EXISTS setup_tasks (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        subject_id TEXT NOT NULL DEFAULT '',
        origin TEXT NOT NULL DEFAULT '',
        done_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT '',
        UNIQUE (owner_user_id, kind, subject_id)
    )""",
    """CREATE TABLE IF NOT EXISTS referral_codes (
        owner_user_id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT ''
    )""",
    # One row per referred account: `owner_user_id` is the person who joined.
    """CREATE TABLE IF NOT EXISTS referral_attributions (
        owner_user_id TEXT PRIMARY KEY,
        referrer_user_id TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'link',
        invitation_id TEXT NOT NULL DEFAULT '',
        captured_at TEXT NOT NULL DEFAULT '',
        qualified_at TEXT NOT NULL DEFAULT ''
    )""",
    "CREATE INDEX IF NOT EXISTS idx_referral_referrer ON referral_attributions (referrer_user_id)",
    """CREATE TABLE IF NOT EXISTS referral_rewards (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        attribution_id TEXT NOT NULL,
        side TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'ai_credit',
        units INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL DEFAULT 'earned',
        created_at TEXT NOT NULL DEFAULT '',
        UNIQUE (attribution_id, side)
    )""",
)


async def ensure_schema(conn) -> None:
    for statement in DDL:
        await conn.execute(statement)


def _m():
    from . import main
    return main


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ddmmyyyy(raw: str) -> str:
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", raw or "")
    return f"{m.group(3)}/{m.group(2)}/{m.group(1)}" if m else ""


def _new_id(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(8)}"


PURPOSE = {"family": "family", "beneficiary": "beneficiary", "parcel": "co_manage", "passbook": "co_manage"}

STEPS = {
    "beneficiary": ["Confirm this invitation is for you",
                    "Check the relationship and share you were listed with",
                    "Complete your heir profile: date of birth and address",
                    "Choose whether to receive household safeguard emails"],
    "family": ["Confirm this invitation is for you",
               "Complete your profile in the family record",
               "Choose whether to receive household safeguard emails"],
    "co_manage": ["Sign in or create your Pattadar account",
                  "Accept the invitation so the owner knows you have it"],
}


async def _invitation_owner(conn, inv: dict) -> str:
    if inv.get("owner_user_id"):
        return inv["owner_user_id"]
    st, sid = inv.get("scope_type"), inv.get("scope_id")
    q = {
        "passbook": "SELECT owner_user_id AS o FROM passbooks WHERE id=%s",
        "parcel": "SELECT pb.owner_user_id AS o FROM parcels p JOIN passbooks pb ON pb.id=p.passbook_id WHERE p.id=%s",
        "family": "SELECT owner_user_id AS o FROM family_members WHERE id=%s OR legacy_beneficiary_id=%s",
        "beneficiary": "SELECT owner_user_id AS o FROM family_members WHERE id=%s OR legacy_beneficiary_id=%s",
    }.get(st)
    if not q:
        return ""
    args = (sid, sid) if q.count("%s") == 2 else (sid,)
    row = await (await conn.execute(q, args)).fetchone()
    return (row or {}).get("o") or ""


async def _short_name(conn, uid: str) -> str:
    """"Shankar R." — enough to recognise a relative, not a full identity."""
    if not uid:
        return ""
    row = await (await conn.execute("SELECT name FROM users WHERE id=%s", (uid,))).fetchone()
    words = [w for w in ((row or {}).get("name") or "").replace(".", " ").split() if w]
    if not words:
        return ""
    long = [w for w in words if len(w) > 1] or words
    first = long[0]
    rest = [w for w in words if w != first]
    return f"{first} {rest[-1][0].upper()}." if rest else first


# ── Types ─────────────────────────────────────────────────────────────

@strawberry.type
class InvitePreview:
    state: str  # live | expired | used | invalid
    purpose: str = ""
    inviter: str = ""
    expires_on: str = ""
    steps: List[str] = strawberry.field(default_factory=list)
    for_guardian: bool = False
    can_verify_without_account: bool = False


@strawberry.type
class ClaimResult:
    purpose: str
    member_id: str = ""
    message: str = ""


@strawberry.type
class SetupTask:
    id: str
    kind: str
    title: str
    detail: str
    route: str
    done: bool


@strawberry.type
class HeirRecord:
    member_id: str
    listed_by: str
    group_name: str
    relation: str
    kind: str
    share_pct: float
    is_minor: bool
    dob: str
    present_address: str
    gender: str
    marital_status: str
    spouse_name: str
    confirmed: str
    note: str
    complete: bool


@strawberry.type
class ReferralReward:
    kind: str
    units: int
    state: str
    side: str
    created_at: str


@strawberry.type
class ReferralSummary:
    code: str
    path: str
    joined: int
    qualified: int
    credits_earned: int
    monthly_cap: int
    referred_by: str
    rewards: List[ReferralReward]


# ── Invitation preview (public) and claim ─────────────────────────────

async def preview(token: str) -> InvitePreview:
    m = _m()
    token = (token or "").strip()
    if not token or len(token) > 200:
        return InvitePreview(state="invalid")
    async with m.pool.connection() as conn:
        rows = await (await conn.execute(
            "SELECT * FROM invitations WHERE token=%s ORDER BY id", (m._capability_hash(token),))).fetchall()
        if not rows:
            return InvitePreview(state="invalid")
        inv = rows[0]
        purpose = PURPOSE.get(inv["scope_type"], "")
        if not purpose:
            return InvitePreview(state="invalid")
        if inv["status"] != "pending":
            return InvitePreview(state="used" if inv["status"] == "accepted" else "invalid")
        if not m._invitation_is_current(inv):
            return InvitePreview(state="expired", purpose=purpose)
        owner = await _invitation_owner(conn, inv)
        minor = False
        if purpose in {"family", "beneficiary"}:
            mem = await (await conn.execute(
                "SELECT is_minor FROM family_members WHERE id=%s OR legacy_beneficiary_id=%s",
                (inv["scope_id"], inv["scope_id"]))).fetchone()
            minor = bool((mem or {}).get("is_minor"))
        return InvitePreview(
            state="live", purpose=purpose,
            inviter=await _short_name(conn, owner) or "A Pattadar member",
            expires_on=_ddmmyyyy(inv.get("expiry") or ""),
            steps=STEPS[purpose], for_guardian=minor,
            can_verify_without_account=purpose in {"family", "beneficiary"})


async def claim(info, token: str, inactivity_email_consent: bool) -> ClaimResult:
    m = _m()
    uid = m._uid_from_info(info)
    token = (token or "").strip()
    token_hash = m._capability_hash(token) if token else ""
    async with m.pool.connection() as conn:
        inv = await (await conn.execute(
            "SELECT * FROM invitations WHERE token=%s ORDER BY id", (token_hash,))).fetchone() if token else None
        if not inv or not m._invitation_is_current(inv):
            raise ValueError("Invalid or expired invitation link")
        owner = await _invitation_owner(conn, inv)
    if owner and owner == uid:
        raise ValueError("You sent this invitation. Share the link with the person it is for.")
    purpose = PURPOSE.get(inv["scope_type"], "")
    member_id = ""
    if purpose in {"family", "beneficiary"}:
        row = await m._verify_by_token(info, token, inactivity_email_consent, link_principal=uid)
        member_id = row.id
        message = "You are verified. Finish your heir profile below."
    elif purpose == "co_manage":
        async with m.pool.connection() as conn:
            async with conn.transaction():
                live = await (await conn.execute(
                    "SELECT * FROM invitations WHERE id=%s AND token=%s FOR UPDATE",
                    (inv["id"], token_hash))).fetchone()
                if not live or not m._invitation_is_current(live):
                    raise ValueError("Invalid or expired invitation link")
                await conn.execute(
                    "UPDATE invitations SET status='accepted', token='', accepted_by=%s, accepted_at=%s WHERE id=%s",
                    (uid, _now(), inv["id"]))
                await m.log_audit(conn, uid, "claim_invitation", inv["id"], "co_manage",
                                  affected_owner=owner or uid)
        message = ("Accepted. The owner can see that you have it. Opening their records from your "
                   "account arrives with shared access, which is not switched on yet.")
    else:
        raise ValueError("Invalid or expired invitation link")
    async with m.pool.connection() as conn:
        if member_id:
            for kind in ("heir_confirm", "heir_profile"):
                await _task(conn, uid, kind, member_id, f"invitation:{inv['id']}")
        if owner:
            await _attribute(conn, uid, owner, "invitation", inv["id"])
    return ClaimResult(purpose=purpose, member_id=member_id, message=message)


# ── Setup tasks ───────────────────────────────────────────────────────

async def _task(conn, uid: str, kind: str, subject: str, origin: str) -> None:
    await conn.execute(
        "INSERT INTO setup_tasks (id, owner_user_id, kind, subject_id, origin, created_at) "
        "VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT (owner_user_id, kind, subject_id) DO NOTHING",
        (_new_id("tk"), uid, kind, subject, origin, _now()))


def _profile_complete(r: dict) -> bool:
    married = (r.get("marital_status") or "").lower() == "married"
    return bool((r.get("dob") or "").strip() and (r.get("present_address") or "").strip()
                and (not married or (r.get("spouse_name") or "").strip()))


async def _has_records(conn, uid: str) -> bool:
    row = await (await conn.execute(
        "SELECT EXISTS(SELECT 1 FROM passbooks WHERE owner_user_id=%s) "
        "OR EXISTS(SELECT 1 FROM properties WHERE owner_user_id=%s) AS any", (uid, uid))).fetchone()
    return bool((row or {}).get("any"))


async def tasks(info) -> List[SetupTask]:
    m = _m()
    uid = m._uid_from_info(info)
    out: List[SetupTask] = []
    async with m.pool.connection() as conn:
        rows = await (await conn.execute(
            "SELECT * FROM setup_tasks WHERE owner_user_id=%s ORDER BY created_at, kind", (uid,))).fetchall()
        for t in rows:
            done = bool(t["done_at"])
            title = detail = route = ""
            if t["kind"] in {"heir_profile", "heir_confirm"}:
                mem = await (await conn.execute(
                    "SELECT * FROM family_members WHERE id=%s AND linked_principal=%s",
                    (t["subject_id"], uid))).fetchone()
                if not mem:
                    continue
                who = await _short_name(conn, mem["owner_user_id"]) or "A family member"
                route = f"/app/heir/{mem['id']}"
                if t["kind"] == "heir_confirm":
                    done = done or bool(mem.get("heir_confirmed"))
                    title = "Check how you are listed"
                    detail = f"{who} listed you as {mem.get('relation') or 'a family member'}. Confirm or ask for a correction."
                else:
                    done = done or _profile_complete(mem)
                    title = "Complete your heir profile"
                    detail = "Date of birth and address, and your spouse if you are married."
            elif t["kind"] == "first_record":
                done = done or await _has_records(conn, uid)
                title = "Add your first land record"
                detail = "Scan a pattadar passbook or add a property. It takes a few minutes."
                route = "/app/properties"
            else:
                continue
            if done and not t["done_at"]:
                await conn.execute("UPDATE setup_tasks SET done_at=%s WHERE id=%s", (_now(), t["id"]))
            out.append(SetupTask(id=t["id"], kind=t["kind"], title=title, detail=detail, route=route, done=done))
    return out


# ── The heir's own view of how they were listed ───────────────────────

async def heir_records(info) -> List[HeirRecord]:
    m = _m()
    uid = m._uid_from_info(info)
    async with m.pool.connection() as conn:
        rows = await (await conn.execute(
            "SELECT fm.*, COALESCE(g.name,'') AS group_name FROM family_members fm "
            "LEFT JOIN groups g ON g.id=fm.group_id WHERE fm.linked_principal=%s ORDER BY fm.created_at",
            (uid,))).fetchall()
        return [HeirRecord(
            member_id=r["id"], listed_by=await _short_name(conn, r["owner_user_id"]) or "A family member",
            group_name=r.get("group_name") or "", relation=r.get("relation") or "", kind=r.get("kind") or "",
            share_pct=float(r.get("share_pct") or 0), is_minor=bool(r.get("is_minor")),
            dob=r.get("dob") or "", present_address=r.get("present_address") or "",
            gender=r.get("gender") or "", marital_status=r.get("marital_status") or "",
            spouse_name=r.get("spouse_name") or "", confirmed=r.get("heir_confirmed") or "",
            note=r.get("heir_note") or "", complete=_profile_complete(r)) for r in rows]


async def update_heir_profile(info, member_id: str, dob: str, present_address: str,
                              gender: str, marital_status: str, spouse_name: str) -> bool:
    m = _m()
    uid = m._uid_from_info(info)
    dob = (dob or "").strip()
    if dob:
        try:
            d = date.fromisoformat(dob[:10])
        except ValueError:
            raise ValueError("Enter your date of birth as a real date")
        if d > date.today() or d.year < 1900:
            raise ValueError("Enter your date of birth as a real date")
    if (marital_status or "").lower() == "married" and not (spouse_name or "").strip():
        raise ValueError("Add your spouse's name")
    fields = [(present_address or "").strip()[:500], (gender or "").strip()[:20],
              (marital_status or "").strip()[:20], (spouse_name or "").strip()[:160]]
    async with m.pool.connection() as conn:
        async with conn.transaction():
            row = await (await conn.execute(
                "UPDATE family_members SET dob=%s, present_address=%s, gender=%s, marital_status=%s, "
                "spouse_name=%s, is_minor=%s WHERE id=%s AND linked_principal=%s AND linked_principal<>'' "
                "RETURNING owner_user_id",
                (dob, *fields, m._is_minor(dob), member_id, uid))).fetchone()
            if not row:
                raise m.NotAuthorized("Not authorized for this record")
            await m.log_audit(conn, uid, "heir_update_profile", member_id, "Heir updated their profile",
                              affected_owner=row["owner_user_id"])
    return True


async def confirm_heir_details(info, member_id: str, agree: bool, note: str) -> bool:
    m = _m()
    uid = m._uid_from_info(info)
    note = (note or "").strip()[:500]
    if not agree and not note:
        raise ValueError("Say what should be corrected, so the person who listed you can fix it")
    async with m.pool.connection() as conn:
        async with conn.transaction():
            row = await (await conn.execute(
                "UPDATE family_members SET heir_confirmed=%s, heir_note=%s "
                "WHERE id=%s AND linked_principal=%s AND linked_principal<>'' RETURNING owner_user_id",
                ("agreed" if agree else "disputed", "" if agree else note, member_id, uid))).fetchone()
            if not row:
                raise m.NotAuthorized("Not authorized for this record")
            await m.log_audit(conn, uid, "heir_confirm_details", member_id,
                              "agreed" if agree else "asked for a correction",
                              affected_owner=row["owner_user_id"])
    return True


# ── Referral ──────────────────────────────────────────────────────────

def _reward_units() -> int:
    return max(0, int(os.getenv("REFERRAL_REWARD_CREDITS", "1")))


def _monthly_cap() -> int:
    return max(0, int(os.getenv("REFERRAL_MONTHLY_CAP", "10")))


CODE_RE = re.compile(r"^[A-Z]{2,8}[0-9]{2,4}$")


async def _code_for(conn, uid: str) -> str:
    row = await (await conn.execute("SELECT code FROM referral_codes WHERE owner_user_id=%s", (uid,))).fetchone()
    if row:
        return row["code"]
    name = await _short_name(conn, uid)
    stem = re.sub(r"[^A-Z]", "", (name.split()[0] if name else "").upper())[:8] or "PATTA"
    if len(stem) < 2:
        stem = "PATTA"
    for _ in range(20):
        code = f"{stem}{secrets.randbelow(900) + 100}"
        done = await (await conn.execute(
            "INSERT INTO referral_codes (owner_user_id, code, created_at) VALUES (%s,%s,%s) "
            "ON CONFLICT DO NOTHING RETURNING code", (uid, code, _now()))).fetchone()
        if done:
            return done["code"]
        again = await (await conn.execute("SELECT code FROM referral_codes WHERE owner_user_id=%s", (uid,))).fetchone()
        if again:
            return again["code"]
    raise RuntimeError("Could not allocate a referral code")


async def _attribute(conn, uid: str, referrer: str, source: str, invitation_id: str = "") -> bool:
    """First attribution wins, and only for an account with nothing filed yet."""
    if not referrer or referrer == uid or await _has_records(conn, uid):
        return False
    row = await (await conn.execute(
        "INSERT INTO referral_attributions (owner_user_id, referrer_user_id, source, invitation_id, captured_at) "
        "VALUES (%s,%s,%s,%s,%s) ON CONFLICT (owner_user_id) DO NOTHING RETURNING owner_user_id",
        (uid, referrer, source, invitation_id, _now()))).fetchone()
    if row:
        await _task(conn, uid, "first_record", "", f"referral:{referrer}")
    return bool(row)


async def _qualify(conn, att: dict) -> None:
    """A referral counts once the referred account has filed a first record.
    Both sides then earn credits; the referrer's are capped per calendar month."""
    if att["qualified_at"] or not await _has_records(conn, att["owner_user_id"]):
        return
    async with conn.transaction():
        claimed = await (await conn.execute(
            "UPDATE referral_attributions SET qualified_at=%s WHERE owner_user_id=%s AND qualified_at='' "
            "RETURNING owner_user_id", (_now(), att["owner_user_id"]))).fetchone()
        if not claimed:
            return
        units = _reward_units()
        if not units:
            return
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        used = await (await conn.execute(
            "SELECT count(*) AS c FROM referral_rewards WHERE owner_user_id=%s AND side='referrer' "
            "AND created_at LIKE %s", (att["referrer_user_id"], f"{month}%"))).fetchone()
        grants = [("referred", att["owner_user_id"])]
        if int((used or {}).get("c") or 0) < _monthly_cap():
            grants.append(("referrer", att["referrer_user_id"]))
        for side, who in grants:
            await conn.execute(
                "INSERT INTO referral_rewards (id, owner_user_id, attribution_id, side, kind, units, state, created_at) "
                "VALUES (%s,%s,%s,%s,'ai_credit',%s,'earned',%s) ON CONFLICT (attribution_id, side) DO NOTHING",
                (_new_id("rr"), who, att["owner_user_id"], side, units, _now()))


async def summary(info) -> ReferralSummary:
    m = _m()
    uid = m._uid_from_info(info)
    async with m.pool.connection() as conn:
        code = await _code_for(conn, uid)
        mine = await (await conn.execute(
            "SELECT * FROM referral_attributions WHERE referrer_user_id=%s OR owner_user_id=%s",
            (uid, uid))).fetchall()
        for att in mine:
            await _qualify(conn, att)
        mine = await (await conn.execute(
            "SELECT * FROM referral_attributions WHERE referrer_user_id=%s", (uid,))).fetchall()
        by = await (await conn.execute(
            "SELECT referrer_user_id FROM referral_attributions WHERE owner_user_id=%s", (uid,))).fetchone()
        rewards = await (await conn.execute(
            "SELECT * FROM referral_rewards WHERE owner_user_id=%s ORDER BY created_at DESC", (uid,))).fetchall()
        return ReferralSummary(
            code=code, path=f"/r/{code}", joined=len(mine),
            qualified=sum(1 for a in mine if a["qualified_at"]),
            credits_earned=sum(int(r["units"]) for r in rewards), monthly_cap=_monthly_cap(),
            referred_by=await _short_name(conn, by["referrer_user_id"]) if by else "",
            rewards=[ReferralReward(kind=r["kind"], units=int(r["units"]), state=r["state"], side=r["side"],
                                    created_at=r["created_at"]) for r in rewards])


async def redeem_code(info, code: str) -> bool:
    """Attribute the signed-in account to the owner of `code`. False when the
    code is unknown, is the caller's own, or the account is already attributed
    or already has records — never an error, so a stale link is harmless."""
    m = _m()
    uid = m._uid_from_info(info)
    code = (code or "").strip().upper()
    if not CODE_RE.match(code):
        return False
    async with m.pool.connection() as conn:
        row = await (await conn.execute("SELECT owner_user_id FROM referral_codes WHERE code=%s", (code,))).fetchone()
        if not row:
            return False
        ok = await _attribute(conn, uid, row["owner_user_id"], "link")
        if ok:
            await m.log_audit(conn, uid, "referral_attributed", uid, "Joined through a referral link")
        return ok
