"""The service ticket, as arithmetic.

Everything about a ticket that can be decided without a database lives here:
which moves are legal, what a reference number looks like, what a settlement
produces, what a dispatch message says on each channel, and exactly which row
an accepted deliverable becomes. web360.py holds the connection and executes
what this module describes.

Pure on purpose, and the precedent is fmb_geometry.py: no db, no strawberry,
no network, no clock and no entropy. `today` and `entropy` are arguments,
because a module that reaches for the OS clock or the OS entropy pool cannot
be pinned in a test, and this is the code that decides who gets paid.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
from html import escape
import json
import math
import re

# ── The DDL this feature adds ──────────────────────────────────────────
#
# Spliced into web360._DDL, which applies every statement on every boot, so
# each one is an IF NOT EXISTS / ADD COLUMN IF NOT EXISTS and none of them
# rewrites a row. It lives here rather than in web360.py because the columns
# and the arithmetic below are one design, and a column added without the
# function that reads it is how a schema drifts away from its meaning.

DDL: tuple = (
    # ── Service tickets (W16) ──────────────────────────────────────────
    #
    # A ticket IS a work_requests row, not a new table. Everything the
    # Services list, the Assigned rail and the four-pip Rail already read
    # keeps working; these columns are what turns an order into something
    # that can be sent out, paid for, delivered against and defended.

    # The real state machine. `stage` stays the four-valued pip index; this
    # is the eight-valued truth and stage is written FROM it. Empty on rows
    # written before this feature — read through ticketing.status_of()
    # rather than backfilled, because a reseed would undo a backfill.
    "ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT ''",
    # When the status last moved. "Nothing has happened for nine days" is
    # the only honest thing a tracking screen can say while a surveyor is
    # not answering his phone, and it needs a date to say it from.
    "ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS status_at TEXT NOT NULL DEFAULT ''",
    # The price frozen at order time. `cost` follows a settlement so the
    # Services list stops quoting a figure nobody paid; `quoted` keeps what
    # was agreed on the day, which is the number a dispute is about.
    "ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS quoted DOUBLE PRECISION NOT NULL DEFAULT 0",
    # The worker's cut, written at order time rather than computed at
    # payout, so a later change to the split cannot rewrite an old ticket's
    # economics.
    "ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS payee_share DOUBLE PRECISION NOT NULL DEFAULT 0",
    # What the owner said when they sent it back, cancelled it, or accepted
    # it. On the row as well as in the trail, because every list that shows
    # a closed ticket wants the one-line reason without a second query.
    "ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS outcome_note TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS accepted_at TEXT NOT NULL DEFAULT ''",
    "CREATE INDEX IF NOT EXISTS idx_work_requests_status ON work_requests (owner_user_id, status)",

    # Every movement on a ticket, append-only. This is the tracking screen,
    # and it is the file somebody opens six months later. Nothing here is
    # ever updated: a correction is another row.
    """CREATE TABLE IF NOT EXISTS ticket_events (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        ticket_id TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL DEFAULT '',
        from_status TEXT NOT NULL DEFAULT '',
        to_status TEXT NOT NULL DEFAULT '',
        actor TEXT NOT NULL DEFAULT '',
        actor_kind TEXT NOT NULL DEFAULT '',
        actor_label TEXT NOT NULL DEFAULT '',
        headline TEXT NOT NULL DEFAULT '',
        detail TEXT NOT NULL DEFAULT '',
        ref_table TEXT NOT NULL DEFAULT '',
        ref_id TEXT NOT NULL DEFAULT '',
        at TEXT NOT NULL DEFAULT ''
    )""",
    "CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket ON ticket_events (ticket_id, at)",

    # One row per time this ticket left the building. The owner is never
    # handed a link to forward: the system writes to the person, records
    # what went to whom on which channel, and can withdraw it — which is
    # the whole reason create_request refused to be a hand-off to WhatsApp.
    # `token_hash` is stored and `token_tail` is the last four characters;
    # v1 sends no link at all, and the columns are here so the tracking
    # page a worker opens is a screen and not a migration.
    """CREATE TABLE IF NOT EXISTS ticket_dispatches (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        ticket_id TEXT NOT NULL,
        purpose TEXT NOT NULL DEFAULT 'invite',
        channel TEXT NOT NULL DEFAULT '',
        contact TEXT NOT NULL DEFAULT '',
        person_name TEXT NOT NULL DEFAULT '',
        subject TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        shows TEXT NOT NULL DEFAULT '[]',
        token_hash TEXT NOT NULL DEFAULT '',
        token_tail TEXT NOT NULL DEFAULT '',
        provider TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT '',
        error TEXT NOT NULL DEFAULT '',
        expires_on TEXT NOT NULL DEFAULT '',
        revoked_at TEXT NOT NULL DEFAULT '',
        revoke_reason TEXT NOT NULL DEFAULT '',
        sent_at TEXT NOT NULL DEFAULT '',
        sort INTEGER NOT NULL DEFAULT 0
    )""",
    "CREATE INDEX IF NOT EXISTS idx_ticket_dispatches_ticket ON ticket_dispatches (ticket_id, sort)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_dispatches_token ON ticket_dispatches (token_hash) WHERE token_hash <> ''",

    # What came back, before anybody accepted it. A deliverable is NOT a
    # document, a photo or a feature yet — the fence does not exist until
    # somebody has looked, and writing one down early puts a thing on the
    # land that is not there. It becomes one of those rows on acceptance,
    # and keeps the pointer both ways.
    #
    # Each item is reviewed on its own: a survey that comes back with a
    # good sketch and two photos of the wrong field must not force an
    # all-or-nothing decision, because the alternative is an owner who
    # accepts rubbish rather than lose the sketch. A rejected deliverable
    # is kept, never deleted — it is evidence of what was sent.
    """CREATE TABLE IF NOT EXISTS ticket_deliverables (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        ticket_id TEXT NOT NULL,
        record_id TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT 'paper',
        label TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        file_ref TEXT NOT NULL DEFAULT '',
        file_name TEXT NOT NULL DEFAULT '',
        mime_type TEXT NOT NULL DEFAULT '',
        size_bytes BIGINT NOT NULL DEFAULT 0,
        payload TEXT NOT NULL DEFAULT '{}',
        submitted_by TEXT NOT NULL DEFAULT '',
        submitted_via TEXT NOT NULL DEFAULT 'owner',
        submitted_at TEXT NOT NULL DEFAULT '',
        file_as TEXT NOT NULL DEFAULT '',
        review TEXT NOT NULL DEFAULT 'pending',
        review_note TEXT NOT NULL DEFAULT '',
        reviewed_at TEXT NOT NULL DEFAULT '',
        filed_table TEXT NOT NULL DEFAULT '',
        filed_id TEXT NOT NULL DEFAULT '',
        filed_prev TEXT NOT NULL DEFAULT '',
        filed_at TEXT NOT NULL DEFAULT '',
        sort INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT ''
    )""",
    "CREATE INDEX IF NOT EXISTS idx_ticket_deliverables_ticket ON ticket_deliverables (ticket_id, sort)",
    "ALTER TABLE ticket_dispatches ADD COLUMN IF NOT EXISTS manifest TEXT NOT NULL DEFAULT '{}'",

    # The money ledger. Append-only, double-entry between five named
    # buckets:
    #
    #   outside  the real world — a bank, a UPI VPA, a card
    #   wallet   the owner's credit with Pattadar
    #   held     money set aside against ONE ticket and not yet anybody's
    #   payout   money that has gone to the person who did the work
    #   fee      Pattadar's share
    #
    # Nothing here is ever updated; a reversal is another row. `amount` is
    # always positive and the direction is the bucket pair, which is the
    # one decision that makes every balance a SUM with no sign bugs. There
    # is no balance column anywhere, because a stored balance and a ledger
    # disagree exactly once and then forever.
    #
    # `provider` and `status` are lifted from notification_log: the row
    # itself says whether the rupees in it were ever real, so the UI reads
    # that rather than a flag somebody has to remember to flip. The stub
    # writes provider='stub', status='recorded', and one query —
    # WHERE provider='stub' — answers "which of these was ever real".
    """CREATE TABLE IF NOT EXISTS service_payments (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        ticket_id TEXT NOT NULL DEFAULT '',
        entry TEXT NOT NULL DEFAULT '',
        from_bucket TEXT NOT NULL DEFAULT '',
        to_bucket TEXT NOT NULL DEFAULT '',
        amount DOUBLE PRECISION NOT NULL DEFAULT 0,
        payee TEXT NOT NULL DEFAULT '',
        payee_ref TEXT NOT NULL DEFAULT '',
        method TEXT NOT NULL DEFAULT '',
        provider TEXT NOT NULL DEFAULT 'stub',
        provider_ref TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'recorded',
        note TEXT NOT NULL DEFAULT '',
        error TEXT NOT NULL DEFAULT '',
        idempotency_key TEXT NOT NULL DEFAULT '',
        actor TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT ''
    )""",
    "CREATE INDEX IF NOT EXISTS idx_service_payments_owner ON service_payments (owner_user_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_service_payments_ticket ON service_payments (ticket_id)",
    # Ticket locks and transactions provide atomicity; these keys additionally
    # reject a duplicate logical ledger operation.
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_service_payments_idem"
    " ON service_payments (idempotency_key) WHERE idempotency_key <> ''",

    # Where a filed row came from. parcel_photos/property_photos already
    # carry order_ref and nothing has ever written it; these two make the
    # same question answerable of a paper and of a feature.
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS order_ref TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE land_features ADD COLUMN IF NOT EXISTS order_ref TEXT NOT NULL DEFAULT ''",
    "CREATE INDEX IF NOT EXISTS idx_documents_order_ref ON documents (order_ref) WHERE order_ref <> ''",
)


# ── The ticket's state ─────────────────────────────────────────────────
#
# `work_requests.stage` is a 0..3 index into web360._STAGES and is what the
# Services list, the Assigned rail and the four-pip Rail read. It cannot say
# "I wrote to Srinivas and heard nothing", "he sent four things and two are
# wrong", or "I pulled it". So `status` is the truth and `stage` is written
# FROM it — a projection, never set by hand, so the two cannot disagree.
STATUSES: tuple = (
    "placed", "sent", "assigned", "on_site",
    "submitted", "changes", "accepted", "cancelled",
)

# The four visible pips. Appending a status is safe; changing a number here
# re-labels every existing row.
STATUS_STAGE: dict = {
    "placed": 0, "sent": 0, "assigned": 1, "on_site": 2,
    "submitted": 3, "changes": 2, "accepted": 3, "cancelled": 3,
}

# The finer word, for the ticket screens. `stage_label` keeps coming out of
# web360._STAGES and keeps saying Placed / Assigned / On site / Delivered.
STATUS_LABEL: dict = {
    "placed": "Placed", "sent": "Sent out", "assigned": "Assigned",
    "on_site": "On site", "submitted": "Waiting on you", "changes": "Sent back",
    "accepted": "Accepted", "cancelled": "Cancelled",
}

# What <State> draws. `unknown` is the hollow ring: in flight, and there is
# nothing to alarm anybody about. Green would vouch for work nobody has
# looked at; amber would raise an alarm nobody has grounds for.
STATUS_STATE: dict = {
    "placed": "unknown", "sent": "unknown", "assigned": "unknown",
    "on_site": "unknown", "submitted": "warn", "changes": "warn",
    "accepted": "good", "cancelled": "bad",
}

# Rows written before this feature carry a stage and no status, and a reseed
# puts them back — so this is a permanent read-time fallback, not a backfill.
STAGE_FALLBACK: tuple = ("placed", "assigned", "on_site", "submitted")

NEEDS_YOU: frozenset = frozenset({"submitted"})
CLOSED: frozenset = frozenset({"accepted", "cancelled"})
TERMINAL: frozenset = CLOSED

# ── The machine ────────────────────────────────────────────────────────
#
# (status, action) -> (next status, who may do it).
#
# A pair not in this dict does not happen: web360._move refuses it and writes
# a `move.refused` event rather than repairing the state, because a machine
# that quietly fixes itself cannot be reconstructed six months later when
# 4,500 rupees are being argued about.
#
# Three actor kinds move a ticket, and the tuples are the whole of the rule.
# `owner` is the landowner on their own screen. `worker` is whoever holds a
# /work/{token} link — that is how the portal accepts a job and says it has
# started. `system` is the Pattadar desk: an operator assigning somebody by
# hand, or the dispatcher sending a round of offers.
#
# `system` is deliberately missing from every move made after somebody has
# actually been on the land. The desk may offer, assign, unassign and cancel
# a job nobody has worked yet; it may NOT accept, send back, or cancel from
# `on_site`, `submitted` or `changes`, because by then a human has to phone
# the owner before the money moves. That asymmetry is the reason the actor
# tuples exist at all rather than a single `is_staff` flag.
#
# `accepted` and `cancelled` have no outgoing pairs. A released payout cannot
# be un-released on any rail we will use, so the remedy for a wrong
# acceptance is a fresh ticket, not a reopened one.
ACTIONS: tuple = (
    "dispatch", "withdraw", "assign", "unassign",
    "start", "deliver", "accept", "send_back", "cancel",
)

TRANSITIONS: dict = {
    ("placed",    "dispatch"):  ("sent",      ("owner", "system")),
    ("placed",    "assign"):    ("assigned",  ("owner", "system")),
    ("placed",    "cancel"):    ("cancelled", ("owner", "system")),

    ("sent",      "dispatch"):  ("sent",      ("owner", "system")),
    ("sent",      "withdraw"):  ("placed",    ("owner",)),
    ("sent",      "assign"):    ("assigned",  ("owner", "worker")),
    ("sent",      "cancel"):    ("cancelled", ("owner", "system")),

    ("assigned",  "dispatch"):  ("assigned",  ("owner",)),
    ("assigned",  "assign"):    ("assigned",  ("owner",)),
    ("assigned",  "unassign"):  ("placed",    ("owner", "system")),
    ("assigned",  "start"):     ("on_site",   ("owner", "worker")),
    ("assigned",  "deliver"):   ("submitted", ("owner", "worker")),
    ("assigned",  "cancel"):    ("cancelled", ("owner", "system")),

    ("on_site",   "dispatch"):  ("on_site",   ("owner",)),
    # The commonest real failure on this platform is not a dispute: it is a
    # surveyor who accepts, says he is on site, and then stops answering his
    # phone. Until this pair existed the only exit was cancel_ticket, which
    # refunds the owner and destroys the job — so the desk had to throw away
    # a funded, wanted piece of work to recover from one silent man. Unassign
    # puts the ticket back to `placed` with its money still set aside, ready
    # to go to somebody else. It is not a cancel and it releases nothing.
    ("on_site",   "unassign"):  ("placed",    ("owner", "system")),
    ("on_site",   "deliver"):   ("submitted", ("owner", "worker")),
    ("on_site",   "cancel"):    ("cancelled", ("owner",)),

    ("submitted", "dispatch"):  ("submitted", ("owner",)),
    ("submitted", "accept"):    ("accepted",  ("owner",)),
    ("submitted", "send_back"): ("changes",   ("owner",)),
    ("submitted", "cancel"):    ("cancelled", ("owner",)),

    ("changes",   "dispatch"):  ("changes",   ("owner",)),
    ("changes",   "deliver"):   ("submitted", ("owner", "worker")),
    ("changes",   "cancel"):    ("cancelled", ("owner",)),
}


# ── What a ticket can carry back, and where it lands ───────────────────

DELIVERABLE_KINDS: tuple = ("paper", "photo", "boundary", "feature")

# Which shelf a service's paper belongs on. Both `kind` vocabularies are here
# — SERVICE_CATALOGUE writes ec/survey/site_visit/title_opinion/mutation/
# patta_copy and create_request writes survey/opinion/visit/fencing — because
# they land in the same column and anything reading it must cope with both.
#
# 'map' is load-bearing beyond display: _fmb_sheet selects shelf='map', so
# filing a survey deliverable there is what makes W04's sheet card appear.
SHELF_FOR_KIND: dict = {
    "survey": "map", "ec": "search", "title_opinion": "title", "opinion": "title",
    "mutation": "revenue", "patta_copy": "revenue", "site_visit": "unsorted",
    "visit": "unsorted", "fencing": "unsorted", "errand": "unsorted",
}
SHELVES: tuple = ("title", "revenue", "map", "identity", "search", "old", "unsorted")
PHOTO_CATEGORIES: tuple = ("general", "boundary", "crop", "structure", "water", "access")

# The words the Papers screen already prints for a shelf. Mirrored from
# apps/web/src/w360/pages/RecordPapers.tsx so a paper filed by a ticket is
# described in the trail with the same noun the shelf chip shows.
SHELF_LABEL: dict = {
    "title": "Title", "revenue": "Revenue record", "map": "Map",
    "search": "Search & tax", "identity": "Identity", "old": "Old record",
    "unsorted": "Unsorted",
}
PHOTO_LABEL: dict = {
    "general": "General", "boundary": "Boundary", "crop": "Crop",
    "structure": "Structure", "water": "Water", "access": "Access",
}

# The condition words a feature is allowed to carry. Anything else becomes
# 'unknown' — a green dot on the strength of a typed word is an assurance
# the app invented for itself.
FEATURE_STATES: tuple = ("good", "warn", "bad", "unknown")


# ── Money ──────────────────────────────────────────────────────────────

BUCKETS: tuple = ("outside", "wallet", "held", "payout", "fee")
ENTRIES: dict = {
    "top_up":  ("outside", "wallet"),
    "hold":    ("wallet",  "held"),
    "release": ("held",    "payout"),
    "fee":     ("held",    "fee"),
    "return":  ("held",    "wallet"),
}
ENTRY_LABEL: dict = {
    "top_up": "Added", "hold": "Set aside",
    "release": "To the person who did the work",
    "fee": "Pattadar's share", "return": "Given back",
}

DEFAULT_PAYEE_SHARE: float = 0.90
SMS_LIMIT: int = 160
DISPATCH_SHOWS: tuple = ("What the job is", "Where the land is", "How big it is",
                         "What you asked for", "What it pays", "When it is wanted by")

# What a channel is called in prose. "on WhatsApp" and "on SMS" are how
# people say it; "on Email" is not, so email stays lower case.
CHANNEL_WORD: dict = {"email": "email", "whatsapp": "WhatsApp", "sms": "SMS"}


# ── Status machine ─────────────────────────────────────────────────────

def status_of(status: str, stage: int = 0, closed: bool = False) -> str:
    """A row's status, falling back to what its stage implies.

    Seeds and main.py's legacy work_requests CRUD write `stage` and no
    status, and a reseed puts them back, so this is a permanent read-time
    derivation. An unrecognised status is treated as absent.

    >>> status_of("submitted", 2, False)
    'submitted'
    >>> status_of("", 2, False)
    'on_site'
    >>> status_of("", 3, True)
    'accepted'
    >>> status_of("nonsense", 0, False)
    'placed'
    """
    if status in STATUSES:
        return status
    if closed:
        return "accepted"
    try:
        i = int(stage)
    except (TypeError, ValueError):
        i = 0
    return STAGE_FALLBACK[min(max(i, 0), 3)]


def stage_of(status: str) -> int:
    """The 0..3 pip index for a status. Unknown -> 0.

    >>> stage_of("submitted"), stage_of("changes"), stage_of("nope")
    (3, 2, 0)
    """
    return STATUS_STAGE.get(status, 0)


def label_of(status: str) -> str:
    """The human word. Unknown -> 'Placed'.

    >>> label_of("changes")
    'Sent back'
    """
    return STATUS_LABEL.get(status, "Placed")


def state_of(status: str) -> str:
    """good | warn | bad | unknown, for the <State> component. Unknown -> 'unknown'.

    >>> state_of("submitted"), state_of("accepted"), state_of("placed")
    ('warn', 'good', 'unknown')
    """
    return STATUS_STATE.get(status, "unknown")


def needs_you(status: str) -> bool:
    """>>> needs_you("submitted"), needs_you("on_site")
    (True, False)
    """
    return status in NEEDS_YOU


def is_closed(status: str) -> bool:
    """>>> is_closed("cancelled"), is_closed("changes")
    (True, False)
    """
    return status in CLOSED


def can(status: str, actor_kind: str = "owner") -> list:
    """Every action legal from this status for this actor, sorted.

    The client renders its buttons from this, so a screen can never offer a
    move the server will refuse.

    >>> can("submitted")
    ['accept', 'cancel', 'dispatch', 'send_back']
    >>> can("accepted")
    []
    >>> can("sent", "worker")
    ['assign']
    """
    return sorted(action for (st, action), (_to, who) in TRANSITIONS.items()
                  if st == status and actor_kind in who)


def transition(status: str, action: str, actor_kind: str = "owner") -> dict:
    """Validate one move.

    Never raises. Returns:
      {"ok": True,  "from": str, "to": str, "stage": int,
       "needs_you": bool, "closed": bool, "label": str}
      {"ok": False, "from": str, "to": "", "why": str}

    `why` is one of: "unknown status", "not a legal move",
    "not yours to do".

    >>> transition("on_site", "deliver")
    {'ok': True, 'from': 'on_site', 'to': 'submitted', 'stage': 3, 'needs_you': True, 'closed': False, 'label': 'Waiting on you'}
    >>> transition("accepted", "send_back")
    {'ok': False, 'from': 'accepted', 'to': '', 'why': 'not a legal move'}
    >>> transition("submitted", "accept", "worker")
    {'ok': False, 'from': 'submitted', 'to': '', 'why': 'not yours to do'}
    """
    if status not in STATUSES:
        return {"ok": False, "from": status, "to": "", "why": "unknown status"}
    move = TRANSITIONS.get((status, action))
    if not move:
        return {"ok": False, "from": status, "to": "", "why": "not a legal move"}
    to, who = move
    if actor_kind not in who:
        return {"ok": False, "from": status, "to": "", "why": "not yours to do"}
    return {"ok": True, "from": status, "to": to, "stage": stage_of(to),
            "needs_you": needs_you(to), "closed": is_closed(to), "label": label_of(to)}


# ── Reference number ───────────────────────────────────────────────────

def ticket_ref(ticket_id: str) -> str:
    """PT-2094 — a number a person can read down a phone.

    Derived, not stored, so there is no counter to keep and no uniqueness to
    defend. A seeded id that already spells its reference keeps it; anything
    else folds its hex tail into the same shape.

    >>> ticket_ref("w360-PT-2094")
    'PT-2094'
    >>> ticket_ref("wr-a1b2c3d4e5f6")
    'PT-6622'
    >>> ticket_ref("")
    'PT-1000'
    """
    found = re.search(r"PT-\d{3,6}", ticket_id or "")
    if found:
        return found.group(0)
    hexed = "".join(c for c in (ticket_id or "") if c in "0123456789abcdef")[-8:]
    if not hexed:
        hexed = "0"
    return f"PT-{int(hexed, 16) % 9000 + 1000}"


# ── Money ──────────────────────────────────────────────────────────────

def provider_gate(configured: str, has_credentials: bool) -> str:
    """The live provider, or "stub".

    Copied deliberately from notify.py's dual gate: a provider named without
    its credentials falls through to the stub rather than half-sending.

    >>> provider_gate("razorpay", True), provider_gate("razorpay", False), provider_gate("", True)
    ('razorpay', 'stub', 'stub')
    """
    name = (configured or "").strip().lower()
    if name and name != "stub" and has_credentials:
        return name
    return "stub"


def is_live(provider: str) -> bool:
    """>>> is_live("razorpay"), is_live("stub")
    (True, False)
    """
    return bool(provider) and provider != "stub" and not provider.endswith("_test")


def payment_status(provider: str) -> str:
    """The status a new ledger row gets. 'recorded' under the stub — money
    that was agreed and did not move.

    >>> payment_status("stub"), payment_status("razorpay")
    ('recorded', 'settled')
    """
    return "settled" if is_live(provider) else "recorded"


def payee_split(amount: float, payee_share: float = DEFAULT_PAYEE_SHARE) -> dict:
    """Split a settlement into the worker's payout and Pattadar's fee.

    The fee is the remainder, never computed independently, so the two
    always add back to exactly `amount`.

    >>> payee_split(2900.0, 0.9)
    {'payout': 2610.0, 'fee': 290.0}
    >>> payee_split(700.0, 0.9)
    {'payout': 630.0, 'fee': 70.0}
    >>> payee_split(0.0, 0.9)
    {'payout': 0.0, 'fee': 0.0}
    """
    total = round(max(0.0, _f(amount)), 2)
    share = min(max(_f(payee_share), 0.0), 1.0)
    payout = round(total * share, 2)
    return {"payout": payout, "fee": round(total - payout, 2)}


def fold(rows: list) -> dict:
    """Every bucket balance, from ledger rows.

    `rows` are dicts with at least entry/from_bucket/to_bucket/amount/status.
    Rows whose status is 'failed' are excluded: a failed payment is a fact,
    not a balance.

    >>> fold([{"entry":"hold","from_bucket":"wallet","to_bucket":"held",
    ...        "amount":2900.0,"status":"recorded"}])
    {'outside': 0.0, 'wallet': -2900.0, 'held': 2900.0, 'payout': 0.0, 'fee': 0.0}
    """
    out = {b: 0.0 for b in BUCKETS}
    for r in rows or []:
        if (r.get("status") or "") == "failed":
            continue
        amount = _f(r.get("amount"))
        src, dst = r.get("from_bucket") or "", r.get("to_bucket") or ""
        if src in out:
            out[src] -= amount
        if dst in out:
            out[dst] += amount
    return {b: round(out[b], 2) for b in BUCKETS}


def held_for(rows: list) -> float:
    """What is set aside on this ticket right now, floored at zero.

    >>> held_for([{"entry":"hold","from_bucket":"wallet","to_bucket":"held","amount":2900.0,"status":"recorded"},
    ...           {"entry":"release","from_bucket":"held","to_bucket":"payout","amount":2610.0,"status":"recorded"},
    ...           {"entry":"fee","from_bucket":"held","to_bucket":"fee","amount":290.0,"status":"recorded"}])
    0.0
    """
    return max(0.0, fold(rows)["held"])


def _entry_row(entry: str, amount: float, payee: str, note: str, ticket_id: str) -> dict:
    src, dst = ENTRIES[entry]
    return {"entry": entry, "from_bucket": src, "to_bucket": dst,
            "amount": round(amount, 2), "payee": payee, "note": note,
            "idempotency_key": f"{ticket_id}:{entry}:1"}


def accept_plan(held: float, payee_share: float = DEFAULT_PAYEE_SHARE,
                payee: str = "", ticket_id: str = "") -> list:
    """The ledger rows an acceptance writes.

    Releasing is the whole promise: money set aside goes to the person who
    did the work at the moment the owner says the work is good, and not one
    step before.

    Each row is {"entry","from_bucket","to_bucket","amount","payee",
    "note","idempotency_key"}. An empty `held` produces no rows at all —
    a ticket nobody funded can still be accepted and filed.

    >>> accept_plan(2900.0, 0.9, "G. Srinivas", "wr-abc")
    [{'entry': 'release', 'from_bucket': 'held', 'to_bucket': 'payout', 'amount': 2610.0, 'payee': 'G. Srinivas', 'note': 'Released on acceptance', 'idempotency_key': 'wr-abc:release:1'}, {'entry': 'fee', 'from_bucket': 'held', 'to_bucket': 'fee', 'amount': 290.0, 'payee': '', 'note': "Pattadar's share", 'idempotency_key': 'wr-abc:fee:1'}]
    >>> accept_plan(0.0)
    []
    """
    amount = max(0.0, _f(held))
    if amount <= 0:
        return []
    split = payee_split(amount, payee_share)
    rows = []
    if split["payout"] > 0:
        rows.append(_entry_row("release", split["payout"], payee,
                               "Released on acceptance", ticket_id))
    if split["fee"] > 0:
        rows.append(_entry_row("fee", split["fee"], "",
                               "Pattadar's share", ticket_id))
    return rows


def cancel_plan(held: float, pay_anyway: float = 0.0,
                payee_share: float = DEFAULT_PAYEE_SHARE,
                payee: str = "", ticket_id: str = "") -> list:
    """The ledger rows a cancellation writes — the reject-refund path.

    `pay_anyway` is the GROSS amount settled out of what is held, split the
    same way an acceptance is, so there is one rule and not two. It is
    clamped into [0, held]. Whatever is left goes back to the wallet.

    The return row is emitted FIRST, and stays first, because the pool is
    autocommit: a crash between two of these rows must leave the money with
    the owner and not with a stranger.

    >>> cancel_plan(2900.0, 700.0, 0.9, "G. Srinivas", "wr-abc")
    [{'entry': 'return', 'from_bucket': 'held', 'to_bucket': 'wallet', 'amount': 2200.0, 'payee': '', 'note': 'Given back on cancellation', 'idempotency_key': 'wr-abc:return:1'}, {'entry': 'release', 'from_bucket': 'held', 'to_bucket': 'payout', 'amount': 630.0, 'payee': 'G. Srinivas', 'note': 'Settled on cancellation', 'idempotency_key': 'wr-abc:release:1'}, {'entry': 'fee', 'from_bucket': 'held', 'to_bucket': 'fee', 'amount': 70.0, 'payee': '', 'note': "Pattadar's share", 'idempotency_key': 'wr-abc:fee:1'}]
    >>> cancel_plan(2900.0, 0.0, 0.9, "", "wr-abc")
    [{'entry': 'return', 'from_bucket': 'held', 'to_bucket': 'wallet', 'amount': 2900.0, 'payee': '', 'note': 'Given back on cancellation', 'idempotency_key': 'wr-abc:return:1'}]
    >>> cancel_plan(0.0)
    []
    """
    amount = max(0.0, _f(held))
    if amount <= 0:
        return []
    settled = round(min(max(0.0, _f(pay_anyway)), amount), 2)
    back = round(amount - settled, 2)
    rows = []
    if back > 0:
        rows.append(_entry_row("return", back, "",
                               "Given back on cancellation", ticket_id))
    split = payee_split(settled, payee_share)
    if split["payout"] > 0:
        rows.append(_entry_row("release", split["payout"], payee,
                               "Settled on cancellation", ticket_id))
    if split["fee"] > 0:
        rows.append(_entry_row("fee", split["fee"], "",
                               "Pattadar's share", ticket_id))
    return rows


def hold_plan(quoted: float, ticket_id: str = "") -> list:
    """The one row that sets money aside for a ticket.

    >>> hold_plan(2900.0, "wr-abc")
    [{'entry': 'hold', 'from_bucket': 'wallet', 'to_bucket': 'held', 'amount': 2900.0, 'payee': '', 'note': 'Set aside for this job', 'idempotency_key': 'wr-abc:hold:1'}]
    >>> hold_plan(0.0, "wr-abc")
    []
    """
    amount = round(max(0.0, _f(quoted)), 2)
    if amount <= 0:
        return []
    return [_entry_row("hold", amount, "", "Set aside for this job", ticket_id)]


def money_headline(quoted: float, held: float, released: float,
                   returned: float, status: str, payee: str = "") -> str:
    """The one line the ticket's Money card leads with.

    Never says paid, charged or debited: the copy has to be true under the
    stub, and under the stub nothing has moved.

    >>> money_headline(2900.0, 2900.0, 0.0, 0.0, "submitted", "G. Srinivas")
    '₹2,900 set aside for this job'
    >>> money_headline(2900.0, 0.0, 2610.0, 0.0, "accepted", "G. Srinivas")
    '₹2,610 recorded as owed to G. Srinivas · ₹290 to Pattadar'
    >>> money_headline(2900.0, 0.0, 0.0, 2900.0, "cancelled", "")
    '₹2,900 given back to your wallet'
    >>> money_headline(2900.0, 0.0, 0.0, 0.0, "placed", "")
    'Nothing set aside yet'
    """
    who = payee or "the person who did the work"
    if held > 0:
        return f"{inr_short(held)} set aside for this job"
    if released > 0 and returned > 0:
        return (f"{inr_short(released)} recorded as owed to {who}"
                f" · {inr_short(returned)} given back")
    if released > 0:
        return (f"{inr_short(released)} recorded as owed to {who}"
                f" · {inr_short(quoted - released)} to Pattadar")
    if returned > 0:
        return f"{inr_short(returned)} given back to your wallet"
    return "Nothing set aside yet"


def money_honesty(provider: str, payee: str = "") -> str:
    """The sentence under every figure while the provider is a stub.

    >>> money_honesty("stub", "G. Srinivas")
    'Recorded, not charged. Paying online is not switched on yet — settle it with G. Srinivas directly for now.'
    >>> money_honesty("stub")
    'Recorded, not charged. Paying online is not switched on yet — settle it with them directly for now.'
    >>> money_honesty("razorpay", "G. Srinivas")
    "We don't release it to G. Srinivas until you accept what came back."
    """
    if provider.endswith("_test"):
        return "Test mode. Provider payments and payouts use test money; no bank account is charged."
    if is_live(provider):
        return (f"We don't release it to {payee or 'them'} until you accept"
                " what came back.")
    return ("Recorded, not charged. Paying online is not switched on yet"
            f" — settle it with {payee or 'them'} directly for now.")


WALLET_STUB_NOTICE: str = (
    "Payments are not switched on yet. Every figure here is a record of what a "
    "job costs and who it is owed to. Nothing has been taken from any account, "
    "and nothing has been sent to anyone."
)


# ── Dispatch — token ───────────────────────────────────────────────────

def mint_token(entropy: bytes) -> dict:
    """Turn caller-supplied entropy into the three values a dispatch stores.

    Deterministic on purpose: the caller passes secrets.token_bytes(32) and
    this module never invents randomness, because a pure module that reaches
    for the OS entropy pool is not pure and cannot be pinned in a test.

    Returns {"token", "token_hash", "token_tail"}. Only the hash and the tail
    are stored; v1 sends no link, so the token itself is discarded — the
    columns exist so a worker-facing page is a screen and not a migration.

    >>> t = mint_token(bytes(range(32)))
    >>> len(t["token"]), len(t["token_hash"]), t["token_tail"] == t["token"][-4:]
    (43, 64, True)
    >>> mint_token(bytes(range(32))) == mint_token(bytes(range(32)))
    True
    """
    token = base64.urlsafe_b64encode(entropy or b"").decode().rstrip("=")
    return {"token": token,
            "token_hash": hashlib.sha256(token.encode()).hexdigest(),
            "token_tail": token[-4:]}


def verify_token(token: str, token_hash: str) -> bool:
    """Constant-time check of a bearer token against its stored hash.

    >>> t = mint_token(bytes(range(32)))
    >>> verify_token(t["token"], t["token_hash"]), verify_token("nope", t["token_hash"])
    (True, False)
    >>> verify_token("", "")
    False
    """
    if not token or not token_hash:
        return False
    return hmac.compare_digest(hashlib.sha256(token.encode()).hexdigest(), token_hash)


# ── Dispatch — channel and rendering ───────────────────────────────────

def channel_for(contact: str, wanted: str = "auto") -> str:
    """Which channel a contact string reaches, honouring an explicit choice.

    Mirrors notify.looks_like_email: an '@' means email, anything else is a
    phone. `wanted` overrides only when it is possible — asking to email a
    phone number is refused rather than silently re-routed.

    >>> channel_for("g.sri@gmail.com"), channel_for("+91 98480 12345")
    ('email', 'whatsapp')
    >>> channel_for("+91 98480 12345", "sms"), channel_for("+91 98480 12345", "email")
    ('sms', '')
    >>> channel_for("")
    ''
    """
    contact = (contact or "").strip()
    if not contact:
        return ""
    reachable = ("email",) if "@" in contact else ("whatsapp", "sms")
    wanted = (wanted or "auto").strip().lower()
    if wanted in ("", "auto"):
        return reachable[0]
    return wanted if wanted in reachable else ""


def mask_contact(contact: str) -> str:
    """A contact the owner can recognise and a screenshot cannot use.

    >>> mask_contact("g.srinivas@gmail.com")
    'g.sr…@gmail.com'
    >>> mask_contact("+919848012345")
    '+91 98••• ••345'
    >>> mask_contact("")
    ''
    """
    contact = (contact or "").strip()
    if not contact:
        return ""
    if "@" in contact:
        local, _, domain = contact.partition("@")
        return f"{local[:4]}…@{domain}"
    digits = "".join(c for c in contact if c.isdigit())
    if not digits:
        return ""
    if len(digits) == 12 and digits.startswith("91"):
        rest = digits[2:]
        return f"+91 {rest[:2]}••• ••{rest[-3:]}"
    return f"{digits[:2]}•••{digits[-3:]}"


# The opening sentence, by purpose. `message` has none: the owner's own note
# is the message, and a preamble in front of it reads like a form letter.
def _opener(purpose: str, service: str, place: str, owner_word: str) -> str:
    at_place = f" at {place}" if place else ""
    if purpose == "nudge":
        return f"Any news on the {service}{at_place}? {owner_word} is waiting."
    if purpose == "changes":
        return f"{owner_word} has looked at what came back and asked for changes."
    if purpose == "withdrawn":
        return f"{owner_word} has withdrawn this request. Nothing more is needed."
    if purpose == "accepted":
        return f"{owner_word} has accepted the work. Thank you."
    if purpose == "message":
        return ""
    return f"A landowner using Pattadar has asked for a {service}{at_place}."


def _subject(purpose: str, service: str, place: str, ref: str) -> str:
    if purpose == "nudge":
        return f"Still waiting — {service}, {ref}"
    if purpose == "changes":
        return f"Changes asked for — {ref}"
    if purpose == "withdrawn":
        return f"Withdrawn — {ref}"
    if purpose == "accepted":
        return f"Accepted — {ref}"
    if purpose == "message":
        return f"{service} — {ref}"
    return f"{service} at {place} — {ref}" if place else f"{service} — {ref}"


def _ascii(text: str) -> str:
    """GSM-7 is not Unicode. One rupee sign turns a 160-character message into
    a 70-character one, so an SMS is transliterated before it is measured."""
    swaps = {"₹": "Rs", "—": "-", "–": "-", "…": "...",
             "·": "-", "‘": "'", "’": "'", "“": '"',
             "”": '"', " ": " ", "\U0001f64f": "", "\U0001f4cd": "",
             "\U0001f5d3": "", "\U0001f4b0": ""}
    for bad, good in swaps.items():
        text = text.replace(bad, good)
    return "".join(c for c in text if ord(c) < 128).strip()


def render_dispatch(channel: str, ctx: dict) -> dict:
    """The message that actually goes out, per channel.

    `ctx` keys, all optional except `service` and `ref`:
      ref, service, place, extent, fee, due_date, person_name, note,
      answers (list of (label, value) pairs), purpose, owner_word.

    Returns:
      {"channel", "subject", "body", "template", "params", "truncated"}

    `template` and `params` are what notify.send_whatsapp wants for a live
    Meta send; both are empty for email and SMS.

    Rupees are written "₹" everywhere except SMS, where GSM-7 has no rupee
    sign and one of them turns a 160-character message into a 70-character
    one. SMS says "Rs" and is ASCII throughout.

    >>> r = render_dispatch("sms", {"ref": "PT-2094", "service": "Boundary re-survey",
    ...     "place": "Peddapuram", "fee": 2900.0, "due_date": "20/08/2026",
    ...     "purpose": "invite"})
    >>> r["body"]
    'Pattadar PT-2094: Boundary re-survey wanted at Peddapuram. Rs2900 on acceptance, by 20/08/2026. Reply to this number. -PTDR'
    >>> len(r["body"]) <= 160 and r["truncated"] is False and r["subject"] == ''
    True
    """
    ctx = ctx or {}
    purpose = (ctx.get("purpose") or "invite").strip() or "invite"
    ref = str(ctx.get("ref") or "")
    service = str(ctx.get("service") or "the job")
    place = str(ctx.get("place") or "")
    extent = str(ctx.get("extent") or "")
    due = str(ctx.get("due_date") or "")
    name = str(ctx.get("person_name") or "")
    note = str(ctx.get("note") or "").strip()
    owner_word = str(ctx.get("owner_word") or "The owner")
    fee = _f(ctx.get("fee"))
    answers = [(str(k), str(v)) for k, v in (ctx.get("answers") or []) if str(v).strip()]
    opener = _opener(purpose, service, place, owner_word)
    link = str(ctx.get("link") or "")
    if channel == "email":
        msg = _render_email(*(escape(x) for x in (ref, service, place, extent, due, name, note)),
                            fee, [(escape(k), escape(v)) for k, v in answers], escape(opener), purpose)
        if link:
            msg["body"] += f'<p><a href="{escape(link, quote=True)}">Open the work request and selected files</a></p>'
    elif channel == "whatsapp":
        msg = _render_whatsapp(ref, service, place, extent, due, name, note, fee, opener)
        if link:
            msg["body"] += "\nOpen the work request and selected files: " + link
            msg["template"] = "pattadar_service_access_v1"
            msg["params"].append(link)
    elif channel == "sms":
        msg = _render_sms(ref, service, place, extent, due, note, fee, purpose)
        if link:
            msg["body"] = f"Pattadar {ref}: {service}. Open work request: {link}"
            msg["truncated"] = False
    else:
        msg = {"channel": channel or "", "subject": "", "body": "",
               "template": "", "params": [], "truncated": False}
    if link:
        msg["body"] = msg["body"].replace("Reply to this email and it reaches the owner through Pattadar.", "Use the work link to send updates to the owner.").replace("Reply here and it reaches the owner through Pattadar.", "Use the work link to send updates to the owner.")
    return msg


def _render_email(ref, service, place, extent, due, name, note, fee, answers,
                  opener, purpose) -> dict:
    """Plain HTML paragraphs. Every block whose source value is empty is
    omitted entirely — an email with an empty "Where" line reads like a form
    the sender could not be bothered to fill in."""
    parts = [f"<p>Namaste{' ' + name if name else ''},</p>"]
    if opener:
        parts.append(f"<p>{opener}</p>")
    if answers:
        lines = "<br>".join(f"{k}: {v}" for k, v in answers)
        parts.append(f"<p><strong>What is being asked</strong><br>{lines}</p>")
    facts = []
    where = " · ".join(x for x in (place, extent) if x)
    if where:
        facts.append(f"<strong>Where</strong> {where}")
    if due:
        facts.append(f"<strong>By</strong> {due}")
    if fee:
        facts.append(f"<strong>Fee</strong> {inr_short(fee)}, paid when the"
                     " owner accepts what you send.")
    if facts:
        parts.append("<p>" + "<br>".join(facts) + "</p>")
    if note:
        parts.append(f"<p>{note}</p>")
    parts.append("<p>Reply to this email and it reaches the owner through"
                 " Pattadar. The owner can withdraw this request at any"
                 " time.</p>")
    parts.append(f"<p>— Pattadar · {ref}</p>")
    return {"channel": "email", "subject": _subject(purpose, service, place, ref),
            "body": "\n".join(parts), "template": "", "params": [],
            "truncated": False}


def _render_whatsapp(ref, service, place, extent, due, name, note, fee, opener) -> dict:
    """Free text plus the template a live Meta send needs. The emoji are
    deliberate: this arrives in a chat window beside family messages, and a
    plain block of text there reads as a scam."""
    where = " · ".join(x for x in (place, extent) if x)
    lines = [f"Namaste{' ' + name if name else ''} \U0001f64f"]
    if opener:
        lines.append(opener)
    if where:
        lines.append(f"\U0001f4cd {where}")
    if due:
        lines.append(f"\U0001f5d3 By {due}")
    if fee:
        lines.append(f"\U0001f4b0 {inr_short(fee)}, paid when the owner accepts"
                     " what you send.")
    if note:
        lines.append(note)
    lines.append("Reply here and it reaches the owner through Pattadar. The"
                 " owner can withdraw this request at any time.")
    lines.append(f"Ref {ref}")
    return {"channel": "whatsapp", "subject": "", "body": "\n".join(lines),
            "template": "pattadar_service_v1",
            "params": [name or "there", service, place,
                       inr_short(fee) if fee else "", due, ref],
            "truncated": False}


def _sms_lead(purpose: str, service: str) -> str:
    if purpose == "nudge":
        return f"Still waiting on the {service}"
    if purpose == "changes":
        return f"Changes asked for on the {service}"
    if purpose == "withdrawn":
        return f"{service} withdrawn, nothing more needed"
    if purpose == "accepted":
        return f"{service} accepted, thank you"
    return service


def _render_sms(ref, service, place, extent, due, note, fee, purpose) -> dict:
    """One GSM-7 segment or nothing.

    A two-segment SMS costs twice and arrives as two, sometimes out of order,
    so the parts are dropped right to left — the note, the extent, the due
    date, the place — until it fits. What is never dropped is the reference
    and "Reply to this number": a message somebody cannot answer or quote is
    not worth sending at all.

    A `message` dispatch is the owner's own words, so its note is what
    survives and the job description is what goes.
    """
    ref = _ascii(ref)
    lead = _ascii(_sms_lead(purpose, service))
    place = _ascii(place)
    extent = _ascii(extent)
    due = _ascii(due)
    note = _ascii(note)
    fee_txt = f"Rs{int(round(fee))}" if fee else ""
    tail = ". Reply to this number. -PTDR"
    keep_note = purpose == "message"

    def build(with_note: bool, with_extent: bool, with_due: bool,
              with_place: bool, lead_text: str, note_text: str) -> str:
        head = lead_text
        if with_place and place and purpose == "invite":
            head += f" wanted at {place}"
        elif with_place and place:
            head += f" at {place}"
        segs = [f"Pattadar {ref}: {head}" if ref else f"Pattadar: {head}"]
        money = ""
        if fee_txt:
            money = f"{fee_txt} on acceptance"
        if with_due and due:
            money = f"{money}, by {due}" if money else f"By {due}"
        if money:
            segs.append(money)
        if with_extent and extent:
            segs.append(extent)
        if with_note and note_text:
            segs.append(note_text)
        return ". ".join(s for s in segs if s) + tail

    # Drop right to left. The note goes first unless it IS the message.
    ladder = [(True, True, True, True)]
    if not keep_note:
        ladder.append((False, True, True, True))
        ladder.append((False, False, True, True))
        ladder.append((False, False, False, True))
        ladder.append((False, False, False, False))
    else:
        ladder.append((True, False, True, True))
        ladder.append((True, False, False, True))
        ladder.append((True, False, False, False))
    for with_note, with_extent, with_due, with_place in ladder:
        body = build(with_note, with_extent, with_due, with_place, lead, note)
        if len(body) <= SMS_LIMIT:
            return {"channel": "sms", "subject": "", "body": body,
                    "template": "", "params": [], "truncated": False}

    # Still too long with everything optional gone: the variable part is the
    # service name, or for a `message` the owner's own words. Cut that rather
    # than send two segments, and SAY it was cut — a sentence that stops
    # mid-word with nobody told is how a wrong instruction reaches a surveyor.
    last = ladder[-1]
    skeleton = build(*last, lead, "")
    if keep_note:
        room = SMS_LIMIT - len(skeleton) - 2      # ". " joins the note on
        if room > 0:
            body = build(*last, lead, note[:room].rstrip())
        else:
            over = len(skeleton) - SMS_LIMIT
            body = build(*last, lead[:max(1, len(lead) - over)].rstrip(), "")
    else:
        over = len(skeleton) - SMS_LIMIT
        body = build(*last, lead[:max(1, len(lead) - over)].rstrip(), "")
    return {"channel": "sms", "subject": "", "body": body[:SMS_LIMIT],
            "template": "", "params": [], "truncated": True}


def sms_ok(text: str) -> dict:
    """Whether a string fits one GSM-7 segment.

    Returns {"len": int, "ascii": bool, "fits": bool}.

    >>> sms_ok("Pattadar PT-2094: Boundary re-survey. Reply to this number. -PTDR")
    {'len': 65, 'ascii': True, 'fits': True}
    >>> sms_ok("₹2900")["ascii"]
    False
    """
    text = text or ""
    plain = all(ord(c) < 128 for c in text)
    return {"len": len(text), "ascii": plain,
            "fits": plain and len(text) <= SMS_LIMIT}


# ── The filing plan ────────────────────────────────────────────────────

def _payload(deliverable: dict) -> dict:
    raw = deliverable.get("payload")
    if isinstance(raw, dict):
        return raw
    try:
        parsed = json.loads(raw or "{}")
    except (TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def filing_plan(deliverable: dict, ticket: dict, record: dict) -> dict:
    """Exactly which row an accepted deliverable becomes.

    Returned as data, so web360 executes it and this module can be tested
    without a database. Never raises: a deliverable it cannot file comes
    back with ok=False and a reason, and the caller skips it and leaves it
    on the ticket.

    `deliverable` — id, kind, label, note, file_ref, file_name, mime_type,
                    size_bytes, payload (JSON text), file_as, submitted_by,
                    submitted_via
    `ticket`      — id, kind, assignee
    `record`      — id, kind ('parcel' | 'property'), boundary (current text)

    Returns:
      {"ok": True, "op": "insert"|"update", "table": str, "id_prefix": str,
       "values": dict, "sort_over": dict|None, "key": str, "key_value": str,
       "prev_column": str, "summary": str, "why": str}
      {"ok": False, "why": str}

    The caller adds `id` (id_prefix + 12 hex), `owner_user_id`, `created_at`
    and `sort` itself; nothing else. For an "update" it reads `prev_column`
    into ticket_deliverables.filed_prev before writing.
    """
    deliverable = deliverable or {}
    ticket = ticket or {}
    record = record or {}
    kind = (deliverable.get("kind") or "").strip()
    if kind not in DELIVERABLE_KINDS:
        return {"ok": False, "why": "that is not something this system knows how to file"}

    rid = record.get("id") or ""
    rkind = record.get("kind") or "parcel"
    tid = ticket.get("id") or ""
    assignee = ticket.get("assignee") or ""
    label = (deliverable.get("label") or "").strip()
    file_ref = (deliverable.get("file_ref") or "").strip()
    file_as = (deliverable.get("file_as") or "").strip()

    if kind == "paper":
        if not file_ref:
            return {"ok": False, "why": "a paper with no file cannot be filed"}
        shelf = file_as or SHELF_FOR_KIND.get(ticket.get("kind") or "", "unsorted")
        if shelf not in SHELVES:
            shelf = "unsorted"
        subtitle = f"From {ticket_ref(tid)}" + (f" · {assignee}" if assignee else "")
        return _plan(
            op="insert", table="documents", id_prefix="doc-",
            values={
                "name": label or deliverable.get("file_name") or "Paper",
                "subtitle": subtitle,
                "shelf": shelf,
                "doc_type": shelf,
                "record_id": rid,
                # Both, matching add_paper: documents.parcel_id is NOT NULL
                # with no default, and a property's papers ride the same column.
                "parcel_id": rid,
                "page_count": 0,
                "size_bytes": _i(deliverable.get("size_bytes")),
                "file_ref": file_ref,
                "mime_type": deliverable.get("mime_type") or "",
                # 'order', not 'upload' — it did not come off this browser.
                "source": "order",
                "order_ref": tid,
            },
            sort_over={"table": "documents", "column": "record_id", "value": rid},
            summary=f"Filed on the {SHELF_LABEL.get(shelf, 'Unsorted')} shelf",
            why="the shelf is what makes a paper findable again; a ticket knows"
                " which one it is because it knows what was ordered",
        )

    if kind == "photo":
        if not file_ref:
            return {"ok": False, "why": "a photo with no file cannot be filed"}
        table = "parcel_photos" if rkind == "parcel" else "property_photos"
        key = "parcel_id" if rkind == "parcel" else "property_id"
        category = file_as if file_as in PHOTO_CATEGORIES else "general"
        return _plan(
            op="insert", table=table, id_prefix="ph-",
            values={
                key: rid,
                "file_ref": file_ref,
                "category": category,
                "caption": label,
                # The owner relayed this file. Nobody can say where the camera
                # stood, so nothing here claims to.
                "latitude": 0,
                "longitude": 0,
                "captured_at": deliverable.get("submitted_at") or "",
                # The gallery renders captured_by as proof. A name the owner
                # typed is not proof.
                "captured_by": "",
                "is_cover": False,
                "source": "order",
                "sha256": "",
                "order_ref": tid,
                "verified": False,
                "feature_id": "",
                "accuracy_m": 0,
                "device_clock_ok": False,
                "pin_distance_m": 0,
                "media_kind": "photo",
                "width": 0,
                "height": 0,
                "file_name": deliverable.get("file_name") or "",
                "local_time": "",
            },
            sort_over={"table": table, "column": key, "value": rid},
            summary="Added to the record's photos",
            why="an owner-relayed photo carries no coordinates and no"
                " photographer: the account that filed it is not the person"
                " who stood in the field",
        )

    if kind == "boundary":
        corners = parse_ring(str(_payload(deliverable).get("ring") or ""))
        if not corners:
            return {"ok": False,
                    "why": "that outline is not a closed shape — fewer than"
                           " three usable corners"}
        return _plan(
            op="update",
            table="parcels" if rkind == "parcel" else "properties",
            id_prefix="",
            values={"boundary": format_ring(corners)},
            sort_over=None, key="id", key_value=rid, prev_column="boundary",
            summary=f"Replaced the outline on file · {len(corners)} corners",
            why="the outline it replaces is kept on the deliverable, so this"
                " is recoverable",
        )

    payload = _payload(deliverable)
    name = str(payload.get("label") or label).strip()
    if not name:
        return {"ok": False, "why": "a feature with no name cannot be filed"}
    state = payload.get("condition_state")
    lat, lon = _f(payload.get("lat")), _f(payload.get("lon"))
    return _plan(
        op="insert", table="land_features", id_prefix="lf-",
        values={
            # add_feature writes the record's own kind here; the seeds write
            # the literal 'record'. The resolver is the one to match.
            "entity_type": rkind,
            "entity_id": rid,
            "category": payload.get("category") or "other",
            "label": name,
            "condition": payload.get("condition") or "",
            "condition_state": state if state in FEATURE_STATES else "unknown",
            "spec": payload.get("spec") or "",
            "note": payload.get("note") or deliverable.get("note") or "",
            "icon": payload.get("icon") or "feature",
            "lat": lat,
            "lon": lon,
            "pin_label": "No pin yet" if not lat and not lon else "",
            "photo_count": 0,
            "actions": "[]",
            "value": 0,
            "unit": "",
            "reference": "",
            "vendor": "",
            "order_ref": tid,
        },
        sort_over={"table": "land_features", "column": "entity_id", "value": rid},
        summary=f"Added '{name}' to what stands on this land",
        why="a feature that came back on a ticket somebody walked out to look"
            " at is entitled to the state they reported — unlike one that"
            " was typed into a form",
    )


def _plan(*, op: str, table: str, id_prefix: str, values: dict,
          sort_over, summary: str, why: str,
          key: str = "", key_value: str = "", prev_column: str = "") -> dict:
    return {"ok": True, "op": op, "table": table, "id_prefix": id_prefix,
            "values": values, "sort_over": sort_over, "key": key,
            "key_value": key_value, "prev_column": prev_column,
            "summary": summary, "why": why}


def goes_to(kind: str, file_as: str, ticket_kind: str = "") -> str:
    """Plain English for where a deliverable will land, shown on the review
    card before anything is filed.

    >>> goes_to("paper", "map"), goes_to("photo", "boundary"), goes_to("boundary", "")
    ('Papers · Map shelf', "The record's photos · Boundary", 'The outline on file')
    >>> goes_to("feature", "")
    'What stands on this land'
    """
    if kind == "paper":
        shelf = file_as or SHELF_FOR_KIND.get(ticket_kind or "", "unsorted")
        if shelf not in SHELVES:
            shelf = "unsorted"
        return f"Papers · {SHELF_LABEL.get(shelf, 'Unsorted')} shelf"
    if kind == "photo":
        cat = file_as if file_as in PHOTO_CATEGORIES else "general"
        return f"The record's photos · {PHOTO_LABEL[cat]}"
    if kind == "boundary":
        return "The outline on file"
    if kind == "feature":
        return "What stands on this land"
    return ""


def file_targets(kind: str) -> list:
    """The choices the review card's select offers, as (value, label) pairs.
    Papers get the shelves, photos get the categories, and boundary and
    feature have exactly one place to go, so their list is empty and the
    select is not drawn.

    >>> file_targets("boundary")
    []
    >>> file_targets("paper")[0]
    ('title', 'Title')
    """
    if kind == "paper":
        return [(s, SHELF_LABEL[s]) for s in SHELVES]
    if kind == "photo":
        return [(c, PHOTO_LABEL[c]) for c in PHOTO_CATEGORIES]
    return []


# ── Small shared helpers ───────────────────────────────────────────────

def _f(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _i(v) -> int:
    try:
        return int(v or 0)
    except (TypeError, ValueError):
        return 0


def parse_ring(text: str) -> list:
    """'17.1,80.1;17.2,80.2;17.2,80.3' -> [(17.1,80.1), ...].

    Refuses the way web360._ring does and for the same reason: a boundary
    that is wrong in a way nobody can see is worse than no boundary at all.
    A malformed corner, a non-finite value, an out-of-range value, (0,0), or
    fewer than three corners after de-duplicating and dropping a repeated
    closing corner, all return [].

    >>> parse_ring("17.1,80.1;17.2,80.2;17.2,80.3")
    [(17.1, 80.1), (17.2, 80.2), (17.2, 80.3)]
    >>> parse_ring("17.1,80.1;17.2,80.2")
    []
    >>> parse_ring("rubbish")
    []
    """
    corners = []
    for chunk in (text or "").split(";"):
        chunk = chunk.strip()
        if not chunk:
            continue
        lat_s, sep, lon_s = chunk.partition(",")
        if not sep:
            return []
        try:
            lat, lon = float(lat_s.strip()), float(lon_s.strip())
        except ValueError:
            return []
        if not (math.isfinite(lat) and math.isfinite(lon)):
            return []
        if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
            return []
        # (0,0) is the Gulf of Guinea, and it is what an unread coordinate
        # column serialises to. It is never a corner of anybody's field.
        if lat == 0.0 and lon == 0.0:
            return []
        corners.append((lat, lon))
    out: list = []
    for c in corners:
        if not out or out[-1] != c:
            out.append(c)
    # The column stores an open ring; a sender who closed it is not wrong,
    # just using the other convention.
    if len(out) > 1 and out[0] == out[-1]:
        out.pop()
    return out if len(out) >= 3 else []


def format_ring(corners: list) -> str:
    """[(17.1,80.1), ...] -> '17.100000,80.100000;...' — six decimals, open ring.

    >>> format_ring([(17.1, 80.1), (17.2, 80.2), (17.2, 80.3)])
    '17.100000,80.100000;17.200000,80.200000;17.200000,80.300000'
    """
    return ";".join(f"{lat:.6f},{lon:.6f}" for lat, lon in corners or [])


def in_group(n: float) -> str:
    """Indian digit grouping. 1234567 -> '12,34,567'.

    The same rule as web360._in_group: Python's ':,' groups in thousands, and
    a rupee figure grouped that way reads as a foreign number.

    >>> in_group(1234567)
    '12,34,567'
    """
    s = f"{int(round(_f(n))):d}"
    neg, s = (s[0] == "-"), s.lstrip("-")
    if len(s) <= 3:
        return ("-" if neg else "") + s
    head, tail = s[:-3], s[-3:]
    out, i = "", len(head)
    while i > 2:
        out = "," + head[i - 2:i] + out
        i -= 2
    out = head[:i] + out
    return ("-" if neg else "") + out + "," + tail


def inr_short(v: float) -> str:
    """₹1.40 Cr · ₹42.0 L · ₹18,400 — the same short forms
    web360._inr_short and ui.tsx's inr() produce, so a figure reads the same
    on every screen.

    >>> inr_short(2900), inr_short(14000000)
    ('₹2,900', '₹1.40 Cr')
    """
    v = _f(v)
    a = abs(v)
    if a >= 1_00_00_000:
        return f"₹{v / 1_00_00_000:.2f} Cr"
    if a >= 1_00_000:
        return f"₹{v / 1_00_000:.1f} L"
    return f"₹{in_group(v)}"


# Days since the civil epoch, Howard Hinnant's algorithm. Integer arithmetic
# rather than `datetime`, so this module keeps its promise: no clock, not even
# an unused import of one.
def _days_from_civil(y: int, m: int, d: int) -> int:
    y -= m <= 2
    era = (y if y >= 0 else y - 399) // 400
    yoe = y - era * 400
    doy = (153 * (m + (-3 if m > 2 else 9)) + 2) // 5 + d - 1
    doe = yoe * 365 + yoe // 4 - yoe // 100 + doy
    return era * 146097 + doe - 719468


def _civil(text: str):
    """DD/MM/YYYY or YYYY-MM-DD -> a day number, or None. Both shapes are in
    play because due_date is written the Indian way and created_at is ISO."""
    s = (text or "").strip()[:10]
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    else:
        m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", s)
        if not m:
            return None
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not (1 <= mo <= 12 and 1 <= d <= 31):
        return None
    return _days_from_civil(y, mo, d)


def days_between(a: str, b: str) -> int:
    """Whole days from ISO/DD-MM date `a` to date `b`; 0 on anything
    unparseable. Both DD/MM/YYYY and YYYY-MM-DD are accepted, because the
    columns in play carry both.

    >>> days_between("2026-08-01", "2026-08-13"), days_between("01/08/2026", "13/08/2026")
    (12, 12)
    >>> days_between("", "2026-08-13")
    0
    """
    x, y = _civil(a), _civil(b)
    if x is None or y is None:
        return 0
    return y - x


def event_headline(kind: str, action: str, ctx: dict) -> str:
    """The line the trail shows, composed at write time so 2027 code cannot
    re-word a 2026 event.

    >>> event_headline("status", "accept", {"actor_label": "You"})
    'You accepted the work'
    >>> event_headline("dispatch", "", {"channel": "whatsapp", "person_name": "G. Srinivas", "provider": "stub"})
    'Sent to G. Srinivas on WhatsApp — recorded, not sent (stub)'
    >>> event_headline("deliverable", "", {"label": "Re-survey sketch"})
    "'Re-survey sketch' came back"
    >>> event_headline("filed", "", {"summary": "Filed on the Map shelf"})
    'Filed on the Map shelf'
    >>> event_headline("payment", "", {"entry": "hold", "amount": 2900.0})
    '₹2,900 set aside'
    """
    ctx = ctx or {}
    actor = str(ctx.get("actor_label") or "You")
    assignee = str(ctx.get("assignee") or "")

    if kind == "status":
        if action == "dispatch":
            return f"{actor} sent it out"
        if action == "withdraw":
            return f"{actor} withdrew it"
        if action == "assign":
            return f"{actor} put {assignee or 'somebody'} on it"
        if action == "unassign":
            return f"{actor} took {assignee or 'them'} off it"
        if action == "start":
            return f"{assignee or actor} is on site"
        if action == "deliver":
            return "Work came back"
        if action == "accept":
            return f"{actor} accepted the work"
        if action == "send_back":
            return f"{actor} sent it back"
        if action == "cancel":
            return f"{actor} cancelled it"
        return "Placed"

    if kind == "dispatch":
        who = str(ctx.get("person_name") or ctx.get("contact") or "them")
        word = CHANNEL_WORD.get(str(ctx.get("channel") or ""), "message")
        line = f"Sent to {who} on {word}"
        if not is_live(str(ctx.get("provider") or "stub")):
            line += " — recorded, not sent (stub)"
        return line

    if kind == "deliverable":
        return f"'{ctx.get('label') or 'Something'}' came back"

    if kind == "filed":
        return str(ctx.get("summary") or "Filed onto the record")

    if kind == "payment":
        entry = str(ctx.get("entry") or "")
        money = inr_short(_f(ctx.get("amount")))
        payee = str(ctx.get("payee") or "")
        if entry == "hold":
            return f"{money} set aside"
        if entry == "release":
            return (f"{money} recorded as owed to {payee}" if payee
                    else f"{money} recorded as owed")
        if entry == "fee":
            return f"{money} to Pattadar"
        if entry == "return":
            return f"{money} given back"
        if entry == "top_up":
            return f"{money} added"
        return money

    if kind == "refused":
        return f"A move was refused: {ctx.get('why', '')}"

    return str(ctx.get("headline") or "")


def event_tone(kind: str, action: str) -> str:
    """plain | up | down | accent — the dot beside a trail line.

    >>> event_tone("status", "accept"), event_tone("status", "cancel"), event_tone("payment", "")
    ('up', 'down', 'accent')
    """
    if action == "accept":
        return "up"
    if action in ("cancel", "send_back", "withdraw"):
        return "down"
    if kind == "payment":
        return "accent"
    return "plain"
