"""The people who do the work, as arithmetic.

An associate is somebody Pattadar sends a job to — a licensed surveyor, an
advocate, a document writer, a caretaker. Until now the only record of one was
`work_requests.assignee`, a free-text name typed by the owner, so the product
could not answer the two questions anybody asks first: who is on this, and what
is their number.

Everything about an associate that can be decided without a database lives
here: what the disciplines are, which service kinds each covers, how coarse an
area each works at, when somebody is eligible for a job, how candidates are
ranked, and how long an offer stays open. web360.py holds the connection and
executes what this module describes.

Pure on purpose, and the precedent is ticketing.py and fmb_geometry.py before
it: no db, no strawberry, no network, no clock and no entropy. `now` and
`today` are arguments, because a module that reaches for the OS clock cannot be
pinned in a test, and this is the code that decides who is offered paid work.
"""

from __future__ import annotations

import re
from typing import Iterable, Optional


# ── The DDL this feature adds ──────────────────────────────────────────
#
# Spliced into web360._DDL, which applies every statement on every boot, so
# each one is an IF NOT EXISTS / ADD COLUMN IF NOT EXISTS and none of them
# rewrites a row. It lives here rather than in web360.py for ticketing.py's
# reason: the columns and the arithmetic below are one design, and a column
# added without the function that reads it is how a schema drifts away from
# its meaning.
#
# The whole tuple ships at once even though the code that reads the later
# tables arrives in a later phase. There is no migration runner in this repo —
# DDL is applied at boot inside init_db's advisory lock — so splitting it
# across phases buys nothing and risks a half-applied schema.

DDL: tuple = (
    # ── The person ─────────────────────────────────────────────────────
    #
    # Owned by the PLATFORM, not by a landowner: an associate exists before
    # anyone signs in, because the gateway's `subject_<sha256>` principal
    # cannot be computed until Cognito has issued a token — and the whole
    # point of phase 1 is enrolling people the desk already knows by phone.
    #
    # `recipient_user_id` is deliberate and not a typo. account.py's
    # `ownership_predicates` already treats `owner_user_id` OR
    # `recipient_user_id` as a proven owner column, so naming the bound
    # account this way puts an associate's own profile into their DPDP
    # export and erasure with no edits to account.py at all. It is also
    # semantically exact: the row is personal data belonging to that
    # principal, not to a landowner.
    #
    # `token_hash` is named to match account.OMIT_COLUMNS, which drops it
    # from the export. A column called `claim_token_hash` would be exported.
    """CREATE TABLE IF NOT EXISTS associates (
        id TEXT PRIMARY KEY,
        recipient_user_id TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL DEFAULT '',
        firm TEXT NOT NULL DEFAULT '',
        contact TEXT NOT NULL DEFAULT '',
        contact_key TEXT NOT NULL DEFAULT '',
        alt_contact TEXT NOT NULL DEFAULT '',
        channel TEXT NOT NULL DEFAULT 'auto',
        contact_visible BOOLEAN NOT NULL DEFAULT true,
        state TEXT NOT NULL DEFAULT 'invited',
        state_reason TEXT NOT NULL DEFAULT '',
        state_at TEXT NOT NULL DEFAULT '',
        state_by TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        max_open INTEGER NOT NULL DEFAULT 3,
        payout_ref TEXT NOT NULL DEFAULT '',
        payout_masked TEXT NOT NULL DEFAULT '',
        token_hash TEXT NOT NULL DEFAULT '',
        token_expires_on TEXT NOT NULL DEFAULT '',
        enrolled_by TEXT NOT NULL DEFAULT '',
        last_offered_at TEXT NOT NULL DEFAULT '',
        training_state TEXT NOT NULL DEFAULT 'not_required',
        training_note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT ''
    )""",
    # One human, one row. The fold happens in Python (`contact_key` below),
    # never in a SQL expression index: a regexp index does not make
    # '+91 98480 12345' and '9848012345' the same key.
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_associates_contact"
    " ON associates (contact_key) WHERE contact_key <> ''",
    "CREATE INDEX IF NOT EXISTS idx_associates_state ON associates (state)",
    "CREATE INDEX IF NOT EXISTS idx_associates_user"
    " ON associates (recipient_user_id) WHERE recipient_user_id <> ''",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_associates_token"
    " ON associates (token_hash) WHERE token_hash <> ''",
    "ALTER TABLE associates ADD COLUMN IF NOT EXISTS training_state"
    " TEXT NOT NULL DEFAULT 'not_required'",
    "ALTER TABLE associates ADD COLUMN IF NOT EXISTS training_note"
    " TEXT NOT NULL DEFAULT ''",

    # ── What they do ───────────────────────────────────────────────────
    #
    # A join row and not a column on `associates`: one person is routinely
    # two things, and both capacity and suspension attach to the PAIR. A
    # surveyor whose licence has lapsed is still a perfectly good site-visit
    # photographer, and a design that suspends the person rather than the
    # discipline loses that.
    #
    # state: on | off | blocked   ('blocked' is written by the credential
    # sweeper, never by the associate.)
    """CREATE TABLE IF NOT EXISTS associate_disciplines (
        id TEXT PRIMARY KEY,
        associate_id TEXT NOT NULL,
        discipline TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL DEFAULT 'on',
        state_reason TEXT NOT NULL DEFAULT '',
        capacity INTEGER NOT NULL DEFAULT 3,
        created_at TEXT NOT NULL DEFAULT ''
    )""",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_assoc_discipline"
    " ON associate_disciplines (associate_id, discipline)",
    "CREATE INDEX IF NOT EXISTS idx_assoc_discipline_on"
    " ON associate_disciplines (discipline, state)",

    # ── Where they work ────────────────────────────────────────────────
    #
    # Administrative grain, never geometry. The records already carry
    # village / mandal / district (a parcel from its passbook, a property
    # from locality / city / district), so a set-membership lookup answers
    # "can this person take this job" exactly. A hex index would be a
    # second, worse copy of a fact the rows already state.
    #
    # `name` keeps what was typed; `name_key` is the folded form that is
    # actually compared, so 'Peddapuram (R)' and 'peddapuram ' are one
    # place without either spelling being destroyed.
    # level: village | mandal | city | district | state
    """CREATE TABLE IF NOT EXISTS associate_areas (
        id TEXT PRIMARY KEY,
        associate_id TEXT NOT NULL,
        level TEXT NOT NULL DEFAULT 'district',
        name TEXT NOT NULL DEFAULT '',
        name_key TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT ''
    )""",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_assoc_area"
    " ON associate_areas (associate_id, level, name_key)",
    "CREATE INDEX IF NOT EXISTS idx_assoc_area_lookup"
    " ON associate_areas (level, name_key)",

    # ── What they can prove ────────────────────────────────────────────
    #
    # Gating by discipline. Regulated work uses its licence; other work uses a
    # company verification, so every allocation has an explicit approval.
    #
    # The number is masked for display and encrypted at rest, the same
    # posture the Aadhaar decision set for this codebase.
    # review: pending | verified | rejected
    """CREATE TABLE IF NOT EXISTS associate_credentials (
        id TEXT PRIMARY KEY,
        associate_id TEXT NOT NULL,
        discipline TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT '',
        number_masked TEXT NOT NULL DEFAULT '',
        number_enc TEXT NOT NULL DEFAULT '',
        authority TEXT NOT NULL DEFAULT '',
        issued_on TEXT NOT NULL DEFAULT '',
        expires_on TEXT NOT NULL DEFAULT '',
        file_ref TEXT NOT NULL DEFAULT '',
        file_name TEXT NOT NULL DEFAULT '',
        review TEXT NOT NULL DEFAULT 'pending',
        review_note TEXT NOT NULL DEFAULT '',
        reviewed_by TEXT NOT NULL DEFAULT '',
        reviewed_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT ''
    )""",
    "CREATE INDEX IF NOT EXISTS idx_assoc_cred ON associate_credentials (associate_id)",
    "CREATE INDEX IF NOT EXISTS idx_assoc_cred_expiry"
    " ON associate_credentials (expires_on) WHERE review = 'verified'",
    # One owner verdict per completed service. Aggregates are derived in the
    # roster query so a corrected review cannot leave a stale score behind.
    """CREATE TABLE IF NOT EXISTS associate_reviews (
        id TEXT PRIMARY KEY,
        associate_id TEXT NOT NULL,
        ticket_id TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        rating INTEGER NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT ''
    )""",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_assoc_review_ticket"
    " ON associate_reviews (ticket_id)",
    "CREATE INDEX IF NOT EXISTS idx_assoc_reviews_member"
    " ON associate_reviews (associate_id, rating)",

    # ── Their trail ────────────────────────────────────────────────────
    #
    # Append-only, the same posture as ticket_events. This is the file
    # somebody opens when an associate asks why they stopped getting work.
    """CREATE TABLE IF NOT EXISTS associate_events (
        id TEXT PRIMARY KEY,
        associate_id TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT '',
        headline TEXT NOT NULL DEFAULT '',
        detail TEXT NOT NULL DEFAULT '',
        actor TEXT NOT NULL DEFAULT '',
        actor_kind TEXT NOT NULL DEFAULT 'desk',
        actor_label TEXT NOT NULL DEFAULT '',
        ref_table TEXT NOT NULL DEFAULT '',
        ref_id TEXT NOT NULL DEFAULT '',
        at TEXT NOT NULL DEFAULT ''
    )""",
    "CREATE INDEX IF NOT EXISTS idx_assoc_events ON associate_events (associate_id, at)",

    # ── The desk's own inbox ───────────────────────────────────────────
    #
    # Without this the operator learns nothing until they happen to open a
    # browser tab. `dedupe_key` is what stops a sweeper that runs every
    # minute writing "licence expires in 30 days" 1,440 times a day.
    # kind: verify | credential_expiring | credential_lapsed | no_cover
    #     | stuck | silent
    """CREATE TABLE IF NOT EXISTS desk_tasks (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL DEFAULT '',
        associate_id TEXT NOT NULL DEFAULT '',
        ticket_id TEXT NOT NULL DEFAULT '',
        owner_user_id TEXT NOT NULL DEFAULT '',
        headline TEXT NOT NULL DEFAULT '',
        detail TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL DEFAULT 'open',
        dedupe_key TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT '',
        closed_at TEXT NOT NULL DEFAULT ''
    )""",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_desk_tasks_dedupe"
    " ON desk_tasks (dedupe_key) WHERE dedupe_key <> ''",
    "CREATE INDEX IF NOT EXISTS idx_desk_tasks_open ON desk_tasks (state, created_at)",

    # ── The kill switch, and the only runtime-editable configuration ────
    #
    # Keys: 'dispatch.mode' (off|shadow|live), 'dispatch.mode.<district_key>',
    #       'admin.uids' (comma-separated, additive to the env allowlist).
    # A table and not an env var because turning the engine off must not
    # require a deploy — and there is no deployed runtime to deploy to.
    """CREATE TABLE IF NOT EXISTS platform_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT '',
        updated_by TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT ''
    )""",

    # ── work_requests: the durable identity, and the queue ──────────────
    #
    # `assignee` is NEVER replaced. It stays the free-text display name that
    # every event headline, filing-plan subtitle, `_remember_person`,
    # `submitted_by` and the ledger payee already read. `assignee_ref` is
    # the id beside it — the thing that makes a phone number reachable.
    "ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS assignee_ref TEXT NOT NULL DEFAULT ''",
    # The folded place, stamped at order time: 'p|peddapuram|peddapuram|kakinada'.
    # The leading flag is 'p' (a parcel: village|mandal|district) or 'u' (a
    # property: locality|city|district). Stamped rather than joined because
    # the desk and the dispatcher are cross-owner and cannot call
    # `_cards(conn, uid)` for somebody else's ticket.
    "ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS area_key TEXT NOT NULL DEFAULT ''",
    # The display text, stamped alongside. A folded key cannot render
    # "Peddapuram, Kakinada", and the desk must not read parcels and
    # passbooks cross-owner just to print a heading.
    "ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS area_label TEXT NOT NULL DEFAULT ''",
    # '' = never queued, which is every legacy and seeded row.
    # queued | working | resting | ops | off
    "ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS dispatch_state TEXT NOT NULL DEFAULT ''",
    # ISO-8601, the same shape as status_at, so a string compare is
    # chronological. Never DD/MM/YYYY, and never to_date() in SQL.
    "ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS dispatch_at TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS dispatch_round INTEGER NOT NULL DEFAULT 0",
    # A lease, not a Python flag. A worker that dies mid-tick leaves this in
    # the past and the reclaim sweep puts the row back on the queue. Local
    # development restarts the API constantly, so this path is routine.
    "ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS dispatch_lease TEXT NOT NULL DEFAULT ''",
    "CREATE INDEX IF NOT EXISTS idx_work_requests_assignee"
    " ON work_requests (assignee_ref) WHERE assignee_ref <> ''",
    "CREATE INDEX IF NOT EXISTS idx_work_requests_dispatch"
    " ON work_requests (dispatch_state, dispatch_at) WHERE dispatch_state <> ''",
    "CREATE INDEX IF NOT EXISTS idx_work_requests_area"
    " ON work_requests (area_key) WHERE area_key <> ''",

    # ── ticket_dispatches becomes the offer ────────────────────────────
    #
    # An offer is a dispatch with purpose='offer'. The hashed token, the
    # expiry, the revoke reason, the frozen manifest, the channel, the
    # stored body kept as evidence and the live portal that already accepts
    # a job are every one of them already on this row. A parallel `offers`
    # table would have to re-earn all of it, and would give the ticket state
    # machine a second truth to disagree with.
    "ALTER TABLE ticket_dispatches ADD COLUMN IF NOT EXISTS associate_id TEXT NOT NULL DEFAULT ''",
    # '' on every dispatch that is not an offer. Deliberately NOT the
    # existing `status` column, which is delivery (queued|logged|sent|failed)
    # and answers a different question.
    # offered | accepted | declined | expired | superseded | withdrawn | ended
    "ALTER TABLE ticket_dispatches ADD COLUMN IF NOT EXISTS offer_state TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ticket_dispatches ADD COLUMN IF NOT EXISTS offer_round INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE ticket_dispatches ADD COLUMN IF NOT EXISTS offer_rank INTEGER NOT NULL DEFAULT 0",
    # ISO-8601, and distinct from `expires_on` (DD/MM/YYYY) which is how
    # long the TOKEN lives. The offer window closes first; closing it also
    # stamps revoked_at, so the token dies with it and `capability()` needs
    # no new rule.
    "ALTER TABLE ticket_dispatches ADD COLUMN IF NOT EXISTS offer_expires_at TEXT NOT NULL DEFAULT ''",
    # quoted * payee_share, frozen at send time.
    "ALTER TABLE ticket_dispatches ADD COLUMN IF NOT EXISTS payout DOUBLE PRECISION NOT NULL DEFAULT 0",
    "ALTER TABLE ticket_dispatches ADD COLUMN IF NOT EXISTS responded_at TEXT NOT NULL DEFAULT ''",
    # busy | too_far | not_my_work | rate | other. A decline is a reason and
    # not a punishment, and the reason is the only supply signal this system
    # is ever going to get.
    "ALTER TABLE ticket_dispatches ADD COLUMN IF NOT EXISTS decline_reason TEXT NOT NULL DEFAULT ''",
    # The ranking's own sentences, a JSON array written at send time so they
    # cannot be re-derived later and quietly re-worded.
    "ALTER TABLE ticket_dispatches ADD COLUMN IF NOT EXISTS score_why TEXT NOT NULL DEFAULT '[]'",
    # owner | desk:<uid> | auto — whether a human or the machine chose this
    # person. The shadow mode in a later phase is judged entirely on this.
    "ALTER TABLE ticket_dispatches ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT 'owner'",

    # THE BACKSTOP. Even if every line of application logic were wrong, two
    # LIVE accepted offers on one ticket cannot exist. An unassign downgrades
    # the prior accepted row to 'ended' in the same transaction, so
    # re-offering a job that came back is still legal — the index is scoped
    # to liveness, not to history.
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_dispatch_one_accept"
    " ON ticket_dispatches (ticket_id) WHERE offer_state = 'accepted'",
    # Scoped to purpose='offer', and NOT to associate_id <> ''. The winner's
    # purpose='accepted' re-dispatch and cancel's 'withdrawn' rows also carry
    # an associate_id with offer_round 0; an index that did not exclude them
    # would raise inside accept_ticket and roll back filing, ledger and trail.
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_dispatch_one_per_round"
    " ON ticket_dispatches (ticket_id, associate_id, offer_round)"
    " WHERE purpose = 'offer' AND associate_id <> ''",
    "CREATE INDEX IF NOT EXISTS idx_dispatch_offer_open"
    " ON ticket_dispatches (offer_state, offer_expires_at) WHERE offer_state = 'offered'",
    "CREATE INDEX IF NOT EXISTS idx_dispatch_associate"
    " ON ticket_dispatches (associate_id, offer_state) WHERE associate_id <> ''",
)


# ── The disciplines ────────────────────────────────────────────────────

class Discipline:
    """One line of work somebody enrols in.

    `kinds` covers BOTH vocabularies on purpose. `SERVICE_CATALOGUE` writes
    ec / survey / site_visit / title_opinion / mutation / patta_copy, and
    `create_request` writes survey / opinion / visit / fencing, into the same
    `work_requests.kind` column. A discipline that knew only one of them would
    silently stop matching half the jobs.
    """

    __slots__ = ("key", "label", "kinds", "grain", "credential", "fanout")

    def __init__(self, key: str, label: str, kinds: tuple,
                 grain: str, credential: str, fanout: int):
        self.key = key
        self.label = label
        self.kinds = kinds
        self.grain = grain
        self.credential = credential
        self.fanout = fanout


# The grain is per discipline and it is the most consequential column here.
# A title opinion is document analysis — an advocate in Hyderabad can opine on
# Nizamabad land, and making the ₹4,500 service with the deepest supply
# village-scoped would manufacture a scarcity that does not exist. A boundary
# re-survey is somebody physically walking the land: village, or nothing.
#
# `fanout` is how many people an offer round goes to. It is one integer, and
# setting it to 1 turns the same code into a sequential ladder — which is what
# modern rideshare dispatch actually does — so the broadcast-versus-sequential
# argument never has to enter the schema.
DISCIPLINES: dict = {
    d.key: d for d in (
        Discipline("surveyor", "Licensed surveyor", ("survey",),
                   "village", "Survey licence", 3),
        Discipline("advocate", "Advocate", ("title_opinion", "opinion"),
                   "state", "Bar Council enrolment", 5),
        Discipline("writer", "Document writer", (
            "ec", "patta_copy", "mutation", "deed_copy", "revenue_extract",
            "tax_receipt", "fmb_copy", "approval_copy", "occupancy_copy"),
                   "mandal", "Writer's licence", 4),
        Discipline("agent", "Revenue agent", (
            "mutation", "patta_copy", "ec", "deed_copy", "revenue_extract",
            "tax_receipt", "fmb_copy", "approval_copy", "occupancy_copy"),
                   "mandal", "", 4),
        Discipline("photo_studio", "Photo & drone studio", ("site_visit", "visit"),
                   "mandal", "GST", 3),
        Discipline("caretaker", "Caretaker", ("site_visit", "visit", "patta_copy"),
                   "village", "", 3),
        Discipline("contractor", "Fencing & earthwork", ("fencing",),
                   "village", "", 3),
        Discipline("landscaper", "Landscaping & plantation", ("fencing",),
                   "village", "", 3),
        Discipline("developer", "Property developer", ("fencing", "visit"),
                   "district", "RERA / company verification", 2),
        Discipline("labour", "Labour & crew", ("fencing", "visit"),
                   "village", "", 2),
    )
}

# The founder's own words map onto these: the lawyer is `advocate`, the helper
# is `caretaker`, HR-as-crew-supply is `labour`. The first five labels are
# exactly the five `_TICKET_ROLE` already hardcodes (Surveyor, Caretaker,
# Advocate, Agent, Contractor), so `_remember_person` keeps producing the same
# words it does today rather than growing a second vocabulary.

AREA_LEVELS: tuple = ("village", "mandal", "city", "district", "state")

#: How wide each level reaches, smallest first. Used to order a roster's areas
#: for display so "Telangana" never prints above "Peddapuram".
AREA_RANK: dict = {level: i for i, level in enumerate(AREA_LEVELS)}

#: Every state an associate can be in. `invited` is somebody the desk has
#: entered but who has not been asked for anything yet; `active` takes work;
#: `paused` is a temporary stop the associate themselves asked for; `blocked`
#: is the desk's decision and requires a reason.
STATES: tuple = ("invited", "active", "paused", "blocked")

#: A state that may be considered for work. Certification is a separate gate,
#: so a newly invited member appears in candidate explanations but cannot be
#: allocated a task until their active discipline is verified.
OFFERABLE: frozenset = frozenset(("invited", "active"))


def disciplines_for(kind: str) -> tuple:
    """Which disciplines can take a job of this kind, best fit first.

    Ordered by how specific the discipline is to that kind — a document writer
    leads for an EC, a revenue agent follows — so a caller that wants only one
    can take the first without re-deriving the preference.

    A kind nothing covers (`other`, the legacy `errand` default) answers empty
    and is never enqueued: it is desk-assign only. The taxonomy is never a
    cage — `deskAssign` puts anybody on anything — it only decides what the
    machine may do on its own.
    """
    k = (kind or "").strip()
    out = [d for d in DISCIPLINES.values() if k in d.kinds]
    out.sort(key=lambda d: d.kinds.index(k))
    return tuple(out)


def label_of(discipline: str) -> str:
    d = DISCIPLINES.get((discipline or "").strip())
    return d.label if d else (discipline or "").replace("_", " ").strip().capitalize()


def credential_for(discipline: str) -> str:
    """The evidence required before this line of work can be dispatched.

    Regulated work names its licence. Other work still needs a company review;
    "no statutory licence" must never be mistaken for "not verified".
    """
    d = DISCIPLINES.get((discipline or "").strip())
    return (d.credential if d and d.credential else "Company verification")


# ── Folding names ──────────────────────────────────────────────────────

_NOT_ALNUM = re.compile(r"[^a-z0-9]+")
#: Revenue records qualify a village in brackets — "Peddapuram (R)" for rural,
#: "(U)" for urban, sometimes a district — and the qualifier is not part of the
#: name. Stripping the brackets is not the same as folding them away: fold
#: alone turns "(R)" into a trailing "r" and quietly makes Peddapuram (R) a
#: DIFFERENT place from Peddapuram, which is the precise failure this whole
#: function exists to prevent.
_BRACKETED = re.compile(r"\([^)]*\)")


def fold(s: str) -> str:
    """The comparable form of a place name or a person's name.

    'Peddapuram (R)', 'peddapuram ' and 'PEDDAPURAM' are one place. Revenue
    records spell the same village a dozen ways — with and without the (R)/(U)
    rural-urban suffix, with and without a district qualifier — and an exact
    string match on a typed village name matches almost nothing in practice.

    The typed spelling is never destroyed: it survives in `associate_areas.name`
    and in `work_requests.area_label`, which is what screens actually print.
    """
    return _NOT_ALNUM.sub("", _BRACKETED.sub(" ", (s or "").strip().lower()))


_DIGITS = re.compile(r"\D+")


def contact_key(contact: str) -> str:
    """One human, one key — for the unique index over `associates.contact_key`.

    A phone number is folded to its last ten digits, so '+91 98480 12345',
    '098480 12345' and '9848012345' are the same person. India's numbers are
    ten digits; the country code and any leading zero are prefixes, so taking
    the tail is correct and does not need a phonenumbers dependency.

    An email is lowercased whole. Anything else (a name, an empty string)
    answers '' and therefore does not participate in the unique index — the
    desk is allowed to enrol somebody it has no number for yet, and two of
    those must not collide with each other.
    """
    raw = (contact or "").strip()
    if not raw:
        return ""
    if "@" in raw:
        return raw.lower()
    digits = _DIGITS.sub("", raw)
    if len(digits) < 10:
        return ""
    return digits[-10:]


def mask_contact(contact: str) -> str:
    """What a screen prints when it may not print the number.

    '98480 12345' → '••••• 12345'. The last four digits are kept because that
    is what somebody recognises their own number by, and the rest is not a
    phone book. An email keeps its first character and its domain.
    """
    raw = (contact or "").strip()
    if not raw:
        return ""
    if "@" in raw:
        name, _, domain = raw.partition("@")
        head = name[:1] if name else ""
        return f"{head}{'•' * max(len(name) - 1, 3)}@{domain}"
    # Masked through the SAME normalisation `contact_key` uses, so the one
    # number typed two ways masks to one string. Masking the raw digits instead
    # would print six bullets for '9848012345' and eight for '+919848012345',
    # and a desk comparing two rows would read that as two different people.
    digits = _DIGITS.sub("", raw)
    if len(digits) > 10:
        digits = digits[-10:]
    if len(digits) < 4:
        return "•" * len(digits)
    return f"{'•' * (len(digits) - 4)}{digits[-4:]}"


def channel_for(contact: str, prefer: str = "auto") -> str:
    """Which of notify.py's three seams reaches this contact.

    'auto' picks by shape — an address goes by email, a number by SMS — which
    is right for everybody the desk enrols by phone. An associate who says
    "WhatsApp only" has that stored on their row and it is honoured here.
    """
    want = (prefer or "auto").strip().lower()
    if want in ("email", "sms", "whatsapp"):
        return want
    return "email" if "@" in (contact or "") else "sms"


# ── Where a job is, and who covers it ──────────────────────────────────

def area_key_of(card: dict) -> tuple:
    """('p|peddapuram|peddapuram|kakinada', 'Peddapuram, Kakinada')

    Built from the shape `_cards` already normalises both record types into: a
    parcel takes village / mandal / district from its passbook, a property
    takes village=locality, mandal=city, district. So this needs no new join,
    and — because it is stamped onto the ticket at order time — the desk and
    the dispatcher can read it cross-owner without ever calling `_cards` for
    somebody else's records.

    The leading flag matters. A surveyor who covers *Peddapuram mandal* must
    not be offered a plot in a *Peddapuram* locality of a city, and the flag is
    what lets the lookup ask for 'mandal' on a parcel and 'city' on a property.
    """
    flag = "u" if (card.get("kind") or "").strip() == "property" else "p"
    slot1 = fold(card.get("village") or "")
    slot2 = fold(card.get("mandal") or "")
    slot3 = fold(card.get("district") or "")
    key = f"{flag}|{slot1}|{slot2}|{slot3}"
    label = ", ".join([p for p in (
        (card.get("village") or "").strip(),
        (card.get("mandal") or "").strip(),
        (card.get("district") or "").strip(),
    ) if p][:2])
    return key, label


def area_slots(area_key: str, round_no: int = 0) -> dict:
    """The lookup parameters for one round of candidate search.

    Round 0 asks for the village; round 1 drops it and asks for the mandal
    upward; round 2 drops that too and asks the district. Widening is done by
    blanking a slot rather than by rewriting the query, so there is exactly one
    candidate SQL statement in the system and every round exercises it.

    `slot2_level` is the substitution described over `area_key_of`.
    """
    parts = (area_key or "").split("|")
    if len(parts) != 4:
        return {"slot1": "", "slot2": "", "slot3": "", "slot2_level": "mandal"}
    flag, slot1, slot2, slot3 = parts
    if round_no >= 1:
        slot1 = ""
    if round_no >= 2:
        slot2 = ""
    return {
        "slot1": slot1,
        "slot2": slot2,
        "slot3": slot3,
        "slot2_level": "city" if flag == "u" else "mandal",
    }


def covers(area_key: str, areas: Iterable[dict], grain: str = "village") -> bool:
    """Does this set of enrolled areas reach this job?

    The same test the candidate SQL makes, in Python, so the desk can explain a
    roster row ("covers Kakinada district") without a second query, and so the
    unit tests can pin the rule without a database.

    A discipline whose grain is 'state' ignores the place entirely: that is the
    point of the grain column.
    """
    if grain == "state":
        return any((a.get("level") or "") == "state" for a in areas)
    slots = area_slots(area_key)
    for a in areas:
        level = (a.get("level") or "").strip()
        key = (a.get("name_key") or "").strip()
        if level == "state":
            return True
        if level == "village" and slots["slot1"] and key == slots["slot1"]:
            return True
        if level == slots["slot2_level"] and slots["slot2"] and key == slots["slot2"]:
            return True
        if level == "district" and slots["slot3"] and key == slots["slot3"]:
            return True
    return False


# ── Who may be offered a job ───────────────────────────────────────────

def dispatchable(associate: dict, discipline: str, open_jobs: int) -> tuple:
    """(ok, reason) — may this person be offered a job in this discipline?

    Returns the reason as a sentence the desk can print, because "no candidates"
    with no explanation is the single most useless thing an ops screen can say
    when a roster is small enough that the operator knows every name on it.

    `open_jobs` is always a COUNT taken in the same query, never a stored
    counter. A counter that is incremented on assignment and forgotten on
    completion freezes the whole roster after a handful of jobs each, silently.
    """
    state = (associate.get("state") or "").strip()
    if state not in OFFERABLE:
        if state == "paused":
            return False, "Paused"
        if state == "blocked":
            return False, associate.get("state_reason") or "Blocked"
        return False, "Not taking work"
    d_state = (associate.get("discipline_state") or "on").strip()
    if d_state == "blocked":
        return False, associate.get("discipline_reason") or f"{label_of(discipline)} suspended"
    if d_state != "on":
        return False, f"Not offering {label_of(discipline).lower()}"
    credential_state = (associate.get("credential_state") or "").strip()
    if credential_state not in ("verified", "expiring"):
        if credential_state == "lapsed":
            return False, f"{credential_for(discipline)} lapsed"
        if credential_state == "rejected":
            return False, f"{credential_for(discipline)} was not approved"
        return False, f"{credential_for(discipline)} must be verified"
    reviews = int(associate.get("rating_count") or 0)
    average = float(associate.get("rating_average") or 0)
    training = (associate.get("training_state") or "not_required").strip()
    if training in ("required", "in_training"):
        return False, associate.get("training_note") or "Retraining required"
    if reviews >= 100 and average < 3 and training != "cleared":
        return False, "Rating below 3 after 100 services; retraining required"
    cap = associate.get("capacity")
    cap = int(cap) if cap is not None else 3
    top = associate.get("max_open")
    top = int(top) if top is not None else 3
    limit = min(cap, top)
    if open_jobs >= limit:
        return False, f"Already holds {open_jobs}"
    return True, ""


def rank(candidates: list, now: str = "") -> list:
    """Order the people who could take a job, best first, with the reasons.

    Deliberately simple, and deliberately explainable. With five associates in
    a district, a greedy ordering and an optimal assignment are the same
    assignment, so anything cleverer here buys nothing and costs the operator
    the ability to predict what the machine will do.

    The order is: fewest jobs in hand, then whoever has waited longest since
    their last offer, then name. The middle term is the fairness one — without
    it the same person is offered everything and the rest of the roster learns
    that opening the message is a waste of time.

    `now` is an argument, not a clock. Each candidate answers with its own
    sentences so the offer row can freeze them: a score whose reasons are
    re-derived later can be quietly re-worded after the fact.
    """
    out = []
    for c in candidates:
        open_jobs = int(c.get("open_jobs") or 0)
        last = (c.get("last_offered_at") or "").strip()
        why = []
        if open_jobs == 0:
            why.append("Nothing in hand")
        else:
            why.append(f"{open_jobs} in hand")
        if not last:
            why.append("Never offered a job yet")
        elif now and last < now[:10]:
            why.append(f"Last offered {last[:10]}")
        area = (c.get("area_label") or "").strip()
        if area:
            why.append(f"Covers {area}")
        out.append({**c, "why": why, "_sort": (open_jobs, last or "", fold(c.get("name") or ""))})
    out.sort(key=lambda c: c["_sort"])
    for i, c in enumerate(out):
        c["rank"] = i + 1
        c.pop("_sort", None)
    return out


# ── How long an offer stays open ───────────────────────────────────────

#: Hours a round waits before the next one opens. These are not seconds. A
#: countdown measured in seconds is a decline machine aimed at somebody who is
#: in a field or in court — the thing being dispatched takes twenty-one days,
#: and the person receiving it is not sitting in a car waiting for a ping.
ROUND_HOURS: tuple = (6, 12, 24)

#: Local working hours. An offer that lands at 02:00 and expires at 08:00 was
#: never really offered to anybody.
WORK_START, WORK_END = 8, 20


def offer_deadline(sent_at: str, round_no: int = 0) -> str:
    """When this round closes, as an ISO-8601 naive-local string.

    Naive-local and not UTC because every other timestamp on a ticket already
    is, and one column in a different frame is how a comparison silently
    inverts. String compare is chronological for this format, which is why
    nothing here ever calls to_date() in SQL.

    The window is pushed past the night: an offer made at 22:00 with a six-hour
    window closes at 08:00 the following morning, not at 04:00.
    """
    from datetime import datetime, timedelta
    hours = ROUND_HOURS[min(round_no, len(ROUND_HOURS) - 1)]
    try:
        start = datetime.fromisoformat((sent_at or "")[:19])
    except ValueError:
        return ""
    end = start + timedelta(hours=hours)
    if end.hour < WORK_START:
        end = end.replace(hour=WORK_START, minute=0, second=0)
    elif end.hour >= WORK_END:
        end = (end + timedelta(days=1)).replace(hour=WORK_START, minute=0, second=0)
    return end.isoformat(timespec="seconds")


def rounds_exhausted(round_no: int) -> bool:
    """After the last round the job goes to a human, not round the loop again.

    Escalating to the ops desk is the strong lever at this scale; widening the
    area forever is not, because past the district there is nobody else.
    """
    return round_no >= len(ROUND_HOURS)


# ── What an offer says ─────────────────────────────────────────────────

def offer_subject(ref: str, service: str) -> str:
    return f"Pattadar {ref}: {service}"


def offer_lines(service: str, area_label: str, payout: float,
                days: int, closes: str) -> tuple:
    """The sentences an offer message is built from.

    Kept here rather than in the resolver so the SMS, the WhatsApp message, the
    email and the portal cannot drift into saying different things about the
    same job — which is the failure the owner would never see and the associate
    would never forgive.

    What is deliberately absent: the owner's name, the khata, the survey number
    and the record id. An offer names the work and the place, and nothing that
    identifies whose land it is, because it goes to several people and only one
    of them will take it.
    """
    where = area_label or "your area"
    money = f"₹{int(round(payout)):,}" if payout else "the agreed rate"
    lines = [
        f"{service} at {where}.",
        f"Your share is {money}. About {days} days once you start.",
    ]
    if closes:
        lines.append(f"First to accept takes it. This offer closes {closes}.")
    else:
        lines.append("First to accept takes it.")
    return tuple(lines)


#: What the losers are told. Not "you were too slow": the point is that they
#: opened the message, and a marketplace that makes that feel like a loss stops
#: getting opened.
TAKEN_BY_ANOTHER = "This job has been taken by somebody else. Nothing is needed from you."

#: What somebody sees when the window shut before anybody answered.
OFFER_CLOSED = "This offer has closed. We will send you the next one."


# ── Assertions the schema must satisfy ─────────────────────────────────

#: Checked at boot by web360 after the DDL runs. `CREATE INDEX IF NOT EXISTS`
#: silently does nothing if an index of that name already exists with a
#: DIFFERENT definition, so a renamed predicate can leave the backstop absent
#: while every statement reports success. The two that actually prevent double
#: assignment are worth asserting out loud.
REQUIRED_INDEXES: tuple = (
    "uq_dispatch_one_accept",
    "uq_dispatch_one_per_round",
    "uq_associates_contact",
)


def missing_indexes(present: Iterable[str]) -> tuple:
    have = {str(n) for n in present}
    return tuple(n for n in REQUIRED_INDEXES if n not in have)
