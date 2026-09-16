# Associates — the Pattadar desk
### Final build spec, v1. Supersedes all four proposals.

**Spine:** `ops-desk-first`. **Grafted:** every judge-marked *keep* from `token-native`, `uber-faithful`, `directory-and-bids`. **Fixed:** all 41 judge-found flaws in the spine (each fix is marked ⓕ where it changes what the winning proposal said).

Verified against source before writing: `parcels JOIN passbooks ON pb.id = p.passbook_id` (web360.py:1333); `properties` has `locality/city/district` and **no mandal** (main.py:4804+); `_cards` already maps `village=locality, mandal=city` for properties (web360.py:1370-1372); `_dispatch` mints a token unconditionally and its INSERT has no `ON CONFLICT` (web360.py:2238-2287); `_live_dispatches` filters `revoked_at='' AND status<>'failed'` (web360.py:2230); `render_dispatch` **replaces the whole SMS body** with `"Pattadar {ref}: {service}. Open work request: {link}"` when a link exists (ticketing.py:936-938); `ownership_predicates` accepts `owner_user_id` **or** `recipient_user_id` (account.py:86-89); `OMIT_COLUMNS = {token, token_hash, invite_token, source, content, principal_id, issuer, subject}` (account.py:130); `TRANSITIONS` has 21 pairs, `('sent','assign')` is the only worker-permitted assign (ticketing.py:280-308); `payments.py:295` resolves the payout account by free-text name; `web360.py:2148` writes `payee_ref` as `''`.

---

## 0. Conflicts between the four designs — decided, one line each

1. **An offer is a `ticket_dispatches` row, not an `offers` table.** That row already is a per-person, hashed, expiring, revocable credential with a frozen manifest and a live portal; a parallel table re-earns every one of those guarantees and gives the state machine a second truth.
2. **First-accept-wins, not owner-picks-from-quotes.** The platform holds the money against a named deliverable, so the platform must do the choosing; asking a landowner to compare five bids for a title opinion inverts the product's promise and adds days.
3. **Broadcast vs sequential is one integer**, `DISCIPLINES[k].fanout` (default 3) — set it to 1 and the same code is a sequential ladder, so the argument never enters the schema.
4. **No new ticket status and no fifth pip.** `sent` already means out-with-people-nobody-has-taken-it; `decline` is a fact about an offer, not about the job.
5. **An associate is a platform-owned row, claimed later** — not a row keyed on the Cognito principal, because that principal cannot be computed before the person signs in and the desk must enrol six people it already phones.
6. **The dispatcher queue lives as columns on `work_requests`, not a second table** — a ticket waiting for somebody is not a different entity, and `FOR UPDATE SKIP LOCKED` means the tick never contends with an owner.
7. **Credentials are recorded, not gating, until one has been verified and then lapses.** Requiring a licence PDF before dispatch empties the roster for the entire cold-start period.
8. **Providers get a token first and an account last.** The `/work/:token` portal already works with no login; an account (phase 5) is a better way to *hold* capabilities, never a wider scope.
9. **The admin gate fails CLOSED on an empty allowlist** — the opposite of what three proposals chose, and the same posture as `gateway/auth.py:272`.
10. **Every derived figure is a `COUNT`, never a stored counter.** Two proposals incremented `open_count` and never decremented it, silently freezing the whole roster after three jobs each.

---

## 1. The model

All DDL is **idempotent boot DDL** and ships whole in phase 1 — there is no migration runner, and splitting it across phases buys nothing. The phases gate the *code*, not the tables.

### 1.1 New pure module

`services/api/src/associates.py` obeys `ticketing.py`'s contract exactly: **no db, no strawberry, no network, no clock, no entropy.** `now` and `today` are arguments. It holds the DDL tuple, `DISCIPLINES`, `AREA_LEVELS`, `fold()`, `contact_key()`, `area_key_of()`, `dispatchable()`, `rank()`, `offer_deadline()`, `REQUIRED_INDEXES` and the offer copy. `web360.py` holds the connection.

Splice into `web360._DDL` immediately after `*ticketing.DDL` (web360.py:283):

```python
    *ticketing.DDL,
    *associates.DDL,
```

This runs inside `init_db`'s `pg_advisory_lock(918273645)` and therefore **after** `work_requests` is created at main.py:5098, so the `ALTER`s below are safe.

### 1.2 `associates.DDL` — 41 statements

```sql
-- ── The person ────────────────────────────────────────────────────────
-- Owned by the PLATFORM, not by a landowner: an associate exists before
-- anyone signs in, because subject_<sha256> cannot be computed until Cognito
-- has issued a token, and phase 1's whole point is enrolling five people the
-- desk already knows by phone.
--
-- `recipient_user_id` is deliberate, not a typo. account.ownership_predicates
-- (account.py:86-89) treats owner_user_id OR recipient_user_id as a proven
-- owner column, so naming the bound-account column this way puts an
-- associate's own profile into their DPDP export and erasure with ZERO edits
-- to account.py. It is semantically exact: the row is personal data belonging
-- to that principal, not to a landowner.
--
-- `token_hash` is named to match account.OMIT_COLUMNS (account.py:130), which
-- drops it from the export. A column called claim_token_hash would be exported.
CREATE TABLE IF NOT EXISTS associates (
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
    created_at TEXT NOT NULL DEFAULT ''
);

-- One human, one row. The fold happens in Python (associates.contact_key),
-- NOT in a SQL regexp: a regexp index does not make '+91 98480 12345' and
-- '9848012345' the same key, and a reviewer proved that on a live database.
CREATE UNIQUE INDEX IF NOT EXISTS uq_associates_contact
    ON associates (contact_key) WHERE contact_key <> '';
CREATE INDEX IF NOT EXISTS idx_associates_state ON associates (state);
CREATE INDEX IF NOT EXISTS idx_associates_user
    ON associates (recipient_user_id) WHERE recipient_user_id <> '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_associates_token
    ON associates (token_hash) WHERE token_hash <> '';

-- ── What they do ──────────────────────────────────────────────────────
-- A join row, not a column: one person is routinely two things, and both
-- capacity and suspension attach to the PAIR. A surveyor whose licence
-- lapsed is still a perfectly good site-visit photographer.
-- state: on | off | blocked   (blocked is written by the credential sweeper)
CREATE TABLE IF NOT EXISTS associate_disciplines (
    id TEXT PRIMARY KEY,
    associate_id TEXT NOT NULL,
    discipline TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT 'on',
    state_reason TEXT NOT NULL DEFAULT '',
    capacity INTEGER NOT NULL DEFAULT 3,
    created_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_assoc_disc
    ON associate_disciplines (associate_id, discipline);
CREATE INDEX IF NOT EXISTS idx_assoc_disc_key
    ON associate_disciplines (discipline) WHERE state = 'on';

-- ── Where they work ───────────────────────────────────────────────────
-- Rows at the grain the records already carry. Nothing geospatial: the land's
-- village is an administrative fact already stored, and an H3 index would be
-- a second, worse copy of it.
-- level: village | mandal | city | district | state
--   'city'  exists because properties carry locality/city/district and have
--           NO mandal column (main.py:4804). _cards maps city into the mandal
--           slot; matching must not let that pass as an administrative mandal.
--   'state' means no geographic constraint at all — passbooks has a `state`
--           column and properties does not, so there is nothing to compare.
CREATE TABLE IF NOT EXISTS associate_areas (
    id TEXT PRIMARY KEY,
    associate_id TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'mandal',
    name TEXT NOT NULL DEFAULT '',
    name_key TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_assoc_area
    ON associate_areas (associate_id, level, name_key);
CREATE INDEX IF NOT EXISTS idx_assoc_area_key
    ON associate_areas (level, name_key);

-- ── Their papers ──────────────────────────────────────────────────────
-- `authority`, not `issuer`: account.OMIT_COLUMNS drops a column literally
-- named issuer, which would silently delete the licence authority from the
-- associate's own data export while keeping the number.
-- `number_enc` is covered by the existing *_enc export rule (account.py:134).
-- expires_on / issued_on are ISO 'YYYY-MM-DD' so a string compare is a date
-- compare. Rendered DD/MM/YYYY at the edge by the existing _ddmmyyyy helper.
-- review: pending | verified | rejected  (same vocabulary as ticket_deliverables)
CREATE TABLE IF NOT EXISTS associate_credentials (
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
);
CREATE INDEX IF NOT EXISTS idx_assoc_cred ON associate_credentials (associate_id);
CREATE INDEX IF NOT EXISTS idx_assoc_cred_expiry
    ON associate_credentials (expires_on) WHERE review = 'verified';

-- ── Their trail ───────────────────────────────────────────────────────
-- Append-only, same posture as ticket_events. This is the file somebody opens
-- when an associate asks why they stopped getting work.
CREATE TABLE IF NOT EXISTS associate_events (
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
);
CREATE INDEX IF NOT EXISTS idx_assoc_events ON associate_events (associate_id, at);

-- ── The desk's own inbox ──────────────────────────────────────────────
-- ⓕ Without this the operator learns nothing until they open a browser tab.
-- dedupe_key stops a 60-second sweeper writing "licence expires in 30 days"
-- 1,440 times a day.
-- kind: verify | credential_expiring | credential_lapsed | no_cover | stuck | silent
CREATE TABLE IF NOT EXISTS desk_tasks (
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
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_desk_tasks_dedupe
    ON desk_tasks (dedupe_key) WHERE dedupe_key <> '';
CREATE INDEX IF NOT EXISTS idx_desk_tasks_open
    ON desk_tasks (state, created_at);

-- ── The kill switch, and the only runtime-editable configuration ──────
-- Keys: 'dispatch.mode' (off|shadow|live), 'dispatch.mode.<district_key>',
--       'admin.uids' (comma-separated, additive to the env allowlist).
-- A table and not an env var because turning the engine off must not require
-- a deploy, and there is no deployed runtime to deploy to.
CREATE TABLE IF NOT EXISTS platform_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_by TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
);

-- ── work_requests: the durable identity and the queue ─────────────────
-- `assignee` is NEVER replaced. It stays the free-text display name every
-- event headline, filing_plan subtitle, _remember_person, submitted_by and
-- the ledger payee already read. assignee_ref is the id beside it.
ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS assignee_ref TEXT NOT NULL DEFAULT '';
-- Folded place, stamped at order time: 'p|peddapuram|peddapuram|kakinada'.
-- The leading flag is 'p' (parcel: village|mandal|district) or 'u'
-- (property: locality|city|district). The desk and the dispatcher are
-- cross-owner and cannot call _cards(conn, uid) for somebody else's ticket.
ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS area_key TEXT NOT NULL DEFAULT '';
-- ⓕ Display text, stamped alongside. A folded key cannot render "Peddapuram,
-- Kakinada", and the desk must not read parcels/passbooks cross-owner to
-- print a heading.
ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS area_label TEXT NOT NULL DEFAULT '';
-- '' = never queued (every legacy and seeded row).
-- queued | working | resting | ops | off
ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS dispatch_state TEXT NOT NULL DEFAULT '';
-- ISO-8601 naive-local, same shape as status_at, so a string compare is
-- chronological. Never DD/MM/YYYY; never to_date() in SQL.
ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS dispatch_at TEXT NOT NULL DEFAULT '';
ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS dispatch_round INTEGER NOT NULL DEFAULT 0;
-- Lease, not a Python flag. A worker that dies mid-tick leaves this in the
-- past and reclaim() puts the row back on the queue.
ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS dispatch_lease TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_work_requests_assignee
    ON work_requests (assignee_ref) WHERE assignee_ref <> '';
CREATE INDEX IF NOT EXISTS idx_work_requests_dispatch
    ON work_requests (dispatch_state, dispatch_at) WHERE dispatch_state <> '';
CREATE INDEX IF NOT EXISTS idx_work_requests_area
    ON work_requests (area_key) WHERE area_key <> '';

-- ── ticket_dispatches becomes the offer ───────────────────────────────
-- An offer is a dispatch with purpose='offer'. The hashed token, expiry,
-- revoke_reason, frozen manifest, channel, stored body kept as evidence and
-- the live portal that already accepts a job are all already on this row.
ALTER TABLE ticket_dispatches ADD COLUMN IF NOT EXISTS associate_id TEXT NOT NULL DEFAULT '';
-- '' on every dispatch that is not an offer. Deliberately NOT the existing
-- `status` column, which is delivery (queued|logged|sent|failed).
-- offered | accepted | declined | expired | superseded | withdrawn | ended
ALTER TABLE ticket_dispatches ADD COLUMN IF NOT EXISTS offer_state TEXT NOT NULL DEFAULT '';
ALTER TABLE ticket_dispatches ADD COLUMN IF NOT EXISTS offer_round INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ticket_dispatches ADD COLUMN IF NOT EXISTS offer_rank INTEGER NOT NULL DEFAULT 0;
-- ISO-8601. Distinct from expires_on (DD/MM/YYYY), which is how long the
-- TOKEN lives. The offer window closes first; closing it also stamps
-- revoked_at, so the token dies with it and capability() needs no new rule.
ALTER TABLE ticket_dispatches ADD COLUMN IF NOT EXISTS offer_expires_at TEXT NOT NULL DEFAULT '';
-- quoted * payee_share, frozen at send time.
ALTER TABLE ticket_dispatches ADD COLUMN IF NOT EXISTS payout DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE ticket_dispatches ADD COLUMN IF NOT EXISTS responded_at TEXT NOT NULL DEFAULT '';
-- busy | too_far | not_my_work | rate | other. A decline is a reason, not a
-- punishment, and the reason is the only supply signal this system will get.
ALTER TABLE ticket_dispatches ADD COLUMN IF NOT EXISTS decline_reason TEXT NOT NULL DEFAULT '';
-- The ranking's own sentences, JSON array, written at send time so they
-- cannot be re-derived and quietly re-worded later.
ALTER TABLE ticket_dispatches ADD COLUMN IF NOT EXISTS score_why TEXT NOT NULL DEFAULT '[]';
-- owner | desk:<uid> | auto — whether a human or the machine chose this person.
ALTER TABLE ticket_dispatches ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT 'owner';

-- THE BACKSTOP. Even if every line of application logic were wrong, two
-- LIVE accepted offers on one ticket cannot exist. An unassign downgrades the
-- prior accepted row to 'ended' in the same transaction, so re-offering a
-- job that came back is legal — the index is scoped to liveness, not history.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dispatch_one_accept
    ON ticket_dispatches (ticket_id) WHERE offer_state = 'accepted';
-- ⓕ Scoped to purpose='offer', NOT to associate_id <> ''. The winner's
-- purpose='accepted' re-dispatch at web360.py:5343 and cancel's 'withdrawn'
-- at 5412 also carry associate_id with offer_round 0; an index that did not
-- exclude them would raise a UniqueViolation inside accept_ticket and roll
-- back filing, ledger and trail.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dispatch_one_per_round
    ON ticket_dispatches (ticket_id, associate_id, offer_round)
    WHERE purpose = 'offer' AND associate_id <> '';
CREATE INDEX IF NOT EXISTS idx_dispatch_offer_open
    ON ticket_dispatches (offer_state, offer_expires_at) WHERE offer_state = 'offered';
CREATE INDEX IF NOT EXISTS idx_dispatch_associate
    ON ticket_dispatches (associate_id, offer_state) WHERE associate_id <> '';

-- ── Close the cross-candidate leak, before there is ever a second candidate ──
-- capabilities.py selects deliverables by ticket_id alone, so with three
-- offers live every holder reads every other's submission titles, notes and
-- the owner's review notes. submitted_by_user_id cannot fix it: a token
-- worker has no user id. The dispatch id can.
ALTER TABLE ticket_deliverables ADD COLUMN IF NOT EXISTS submitted_dispatch_id TEXT NOT NULL DEFAULT '';
```

### 1.3 Boot assertion ⓕ

`web360.ensure_schema` wraps each statement in `try/except` and only logs a warning (web360.py:431-437), so the backstop index could silently fail to exist for weeks. After the DDL loop, add:

```python
missing = await associates.verify_indexes(conn)   # checks pg_indexes against REQUIRED_INDEXES
if missing:
    raise RuntimeError(f"Refusing to start: dispatch safety indexes missing: {missing}")
```

`REQUIRED_INDEXES = ('uq_dispatch_one_accept', 'uq_dispatch_one_per_round', 'uq_associates_contact')`.

### 1.4 `account.py` edits — a merge blocker, not a follow-up

Four entries into `CHILD_LINKS` (account.py:60). `associates` itself needs none: `recipient_user_id` is already a proven owner column.

```python
    "associate_disciplines": [("associate_id", "associates")],
    "associate_areas":       [("associate_id", "associates")],
    "associate_credentials": [("associate_id", "associates")],
    "associate_events":      [("associate_id", "associates")],
```

Without them an associate's licence numbers and service areas fall silently out of both the DPDP export and the erasure sweep — exactly the failure `CHILD_LINKS` exists to prevent.

### 1.5 The nine disciplines

A pure constant in `associates.py`. `kinds` covers **both** vocabularies, because `SERVICE_CATALOGUE` writes `ec/survey/site_visit/title_opinion/mutation/patta_copy` and `create_request` writes `survey/opinion/visit/fencing` into the same column.

| key | label | kinds | grain | credential | fanout |
|---|---|---|---|---|---|
| `surveyor` | Licensed surveyor | survey | **village** | Survey licence | 3 |
| `advocate` | Advocate | title_opinion, opinion | **state** | Bar Council enrolment | 5 |
| `writer` | Document writer | ec, patta_copy, mutation | **mandal** | Writer's licence | 4 |
| `agent` | Revenue agent | mutation, patta_copy, ec | **mandal** | — | 4 |
| `photo_studio` | Photo & drone studio | site_visit, visit | **mandal** | GST | 3 |
| `caretaker` | Caretaker | site_visit, visit, patta_copy | **village** | — | 3 |
| `contractor` | Fencing & earthwork | fencing | **village** | — | 3 |
| `landscaper` | Landscaping & plantation | fencing | **village** | — | 3 |
| `labour` | Labour & crew | fencing, visit | **village** | — | 2 |

The founder named surveyor, photo studio, landscaper, legal/lawyer, writer, helper, HR → `advocate` is the lawyer, `caretaker` the helper, `labour` HR-as-crew-supply. The five roles `_TICKET_ROLE` already hardcodes (Surveyor, Caretaker, Advocate, Agent, Contractor) are the first five unchanged, so `_remember_person` keeps producing the same words.

**The grain is per discipline and it is the single most consequential line in the table.** A title opinion is document analysis — an advocate in Hyderabad can opine on Nizamabad land, and making the ₹4,500 SKU with the deepest supply village-scoped would manufacture scarcity that does not exist. A boundary re-survey is somebody walking the land: village or nothing.

A kind with no discipline (`other`, the legacy `errand` default) is **never enqueued** and is desk-assign only. The taxonomy is never a cage: `deskAssign` puts anybody on anything.

### 1.6 Service areas and `area_key`

```python
def area_key_of(card: dict) -> tuple[str, str]:
    """('p|peddapuram|peddapuram|kakinada', 'Peddapuram, Kakinada')"""
```

`_cards` already normalises both record types into one shape (web360.py:1333-1385): a parcel gets `village/mandal/district` from its passbook; a property gets `village=locality, mandal=city, district=district`. So the key is built from the card, not from a new cross-owner join.

`fold(s)` = lowercase, strip everything but `[a-z0-9]`. `Peddapuram (R)` and `peddapuram ` are one place; the typed name survives in `associate_areas.name` and in `area_label`.

The cross-owner candidate query is a set lookup with **no geometry and no `_cards` call**:

```sql
JOIN associate_areas ar ON ar.associate_id = a.id AND (
      (ar.level = 'village'  AND ar.name_key = %(slot1)s)
   OR (ar.level = %(slot2_level)s AND ar.name_key = %(slot2)s)   -- 'mandal' for p, 'city' for u
   OR (ar.level = 'district' AND ar.name_key = %(slot3)s)
   OR  ar.level = 'state')
```

`slot2_level` is `'mandal'` when the key starts `p|` and `'city'` when it starts `u|`. That one substitution is what stops a surveyor who covers *Peddapuram mandal* being offered a plot in a *Peddapuram* locality of a city.

**Widening rounds** pass `''` for `slot1`, then for `slot1` and `slot2`. A discipline whose grain is `state` ignores all three from round 1.

### 1.7 `ticketing.TRANSITIONS` — the exact eight pairs ⓕ

Seven existing pairs gain a `"system"` actor; one new pair is added. `STATUSES`, `STATUS_STAGE`, `STATUS_LABEL`, `STATUS_STATE` are **untouched** — no new status, no fifth pip, no row re-labelled.

```python
("placed",   "dispatch"): ("sent",      ("owner", "system")),   # the tick offers
("sent",     "dispatch"): ("sent",      ("owner", "system")),   # later rounds
("placed",   "assign"):   ("assigned",  ("owner", "system")),   # deskAssign
("assigned", "unassign"): ("placed",    ("owner", "system")),   # deskUnassign
("on_site",  "unassign"): ("placed",    ("owner", "system")),   # NEW PAIR — see below
("placed",   "cancel"):   ("cancelled", ("owner", "system")),
("sent",     "cancel"):   ("cancelled", ("owner", "system")),
("assigned", "cancel"):   ("cancelled", ("owner", "system")),
```

`("sent","assign"): ("assigned", ("owner","worker"))` is **unchanged** — that is the accept path and it is already correct.

`("on_site","unassign")` is new because without it the single most common real failure — a surveyor accepts, says he is on site, then goes silent — has no exit except `cancel_ticket`, which refunds and destroys the job. `cancel` gains `system` only from `placed/sent/assigned`: once somebody has been on the land or submitted work, a human must phone the owner before the money moves, so `on_site/submitted/changes` stay owner-only.

---

## 2. The lifecycle

One machine. Nothing below is a second state machine, a second trail, or a second ledger.

```
order_service / create_request
        │  stamps area_key, area_label, and (if the kind maps to a discipline
        │  and the district's mode is not 'off') dispatch_state='queued',
        │  dispatch_at=now                                        ⓕ the producer
        ▼
   placed ──dispatch(owner|system)──▶ sent ──assign(worker)──▶ assigned
        │                              │  N offers live            │
        │                              │                           ├─start(worker)──▶ on_site
        │  assign(owner|system)        │  withdraw(owner)          │
        └──────────────────────────────┴──────────▶ placed         ├─deliver(worker)▶ submitted
                                                                    │
   assigned|on_site ──unassign(owner|system)──▶ placed  (re-queued) │
                                                                    ▼
                      submitted ──accept(owner)──▶ accepted    (ledger release)
                                └─send_back(owner)─▶ changes ──deliver──▶ submitted
                      any of placed|sent|assigned ──cancel(owner|system)──▶ cancelled
```

**Who moves what.**

| move | actor_kind | actor_label | trigger |
|---|---|---|---|
| `dispatch` | `owner` | "You" | owner presses Send |
| `dispatch` | `system` | "Pattadar desk" | `offerRound` from the desk or the tick |
| `assign` | `worker` | the associate's name | POST `/public/work/{token}/actions {assign}` |
| `assign` | `system` | "Pattadar desk" | `deskAssign` |
| `unassign` | `system` | "Pattadar desk" | `deskUnassign(reason)` |
| `start`/`deliver` | `worker` | the associate's name | the portal, unchanged |
| `accept`/`send_back` | `owner` | "You" | the owner, unchanged |
| `cancel` | `owner` or `system` | | owner, or `deskCancel(reason, payAnyway)` |

**Offer states live on the dispatch row and move nothing on the ticket.** `offered → accepted | declined | expired | superseded | withdrawn`, plus `ended` (the accepted offer of a job that was later unassigned — the only reason that state exists is to free the `uq_dispatch_one_accept` predicate so the job can be re-offered).

**The dispatcher's own queue** is `dispatch_state`: `'' → queued → working → resting → queued → … → ops`. `ops` is terminal for the machine and is a named human on `/app/desk`.

**Money is unchanged.** Funds are set aside at funding and released by the owner on acceptance, through the existing five buckets and `accept_plan`. The only change is that `payee_ref` finally carries the associate id (§7).

---

## 3. The dispatch mechanism

### 3.1 Sending a round — the lock is not held across the network ⓕ

The winning proposal held `_ticket_row(lock=True)` across `fanout` provider calls. Split `_dispatch` (web360.py:2238) into two, keeping its signature so every existing caller is untouched:

```python
async def _compose_dispatch(conn, uid, ticket, card, *, contact, person_name='',
                            channel='auto', purpose='invite', note='',
                            expires_days=14, with_token=True, offer=None) -> str:
    """Render, mint (optionally), INSERT with status='queued'. No network at all."""
    ...
    INSERT INTO ticket_dispatches (... , status, ...) VALUES (..., 'queued', ...)
        ON CONFLICT DO NOTHING RETURNING id        # ⓕ makes a double-tap a no-op
    # returns '' when nothing was inserted; the ticket_event is skipped too.

async def _deliver_dispatch(conn, uid, dispatch_id) -> dict:
    """Read the row, call _send, UPDATE provider/status/error. Network, no ticket lock."""

async def _dispatch(conn, uid, ticket, card, **kw) -> str:     # unchanged signature
    did = await _compose_dispatch(conn, uid, ticket, card, **kw)
    if did:
        await _deliver_dispatch(conn, uid, did)
    return did
```

`_DISPATCH_WORD` gains `"queued": "Not sent yet"`.

`with_token=False` skips `mint_token`, puts no link in the body, and writes `token_hash=''`, `token_tail=''`, `expires_on=''`. **This is the fix for the worst defect in the winning design**: telling the losers through `_dispatch` minted each of them a fresh, unrevoked 14-day credential on a ticket that had just become live.

Paired with it:

```sql
-- _live_dispatches gains one clause. A row with no token is not a credential,
-- so it must not keep a ticket at 'sent', must not be revoked on cancel, and
-- must not be re-messaged on accept.
SELECT * FROM ticket_dispatches WHERE ticket_id=%s AND owner_user_id=%s
  AND revoked_at='' AND status <> 'failed' AND token_hash <> '' ORDER BY sort
```

`offer_round(conn, owner, ticket, card, candidates, round, hours)`:

1. **One pre-flight consent check** — `account.require_purpose(owner, "service_notifications")` once, not once per candidate. On refusal: `dispatch_state='ops'`, one `desk_task`, send nothing. ⓕ *Without this a withdrawn consent writes `fanout` failed dispatches into the owner's trail.*
2. Inside one `_ticket_transaction()` holding `_ticket_row(lock=True)`: `_compose_dispatch(..., purpose='offer', with_token=True, offer={...})` per candidate, writing `associate_id`, `offer_state='offered'`, `offer_round`, `offer_rank`, `offer_expires_at = associates.offer_deadline(now, hours, holidays)`, `payout = quoted * payee_share`, `score_why`, `created_by`. Then one `_move(..., 'dispatch', actor_kind='system', actor_label='Pattadar desk')`. Then `dispatch_state='resting'`, `dispatch_at = max(offer_expires_at)`.
3. **Commit.**
4. On a fresh connection, `_deliver_dispatch` for each id. A crash here leaves rows at `status='queued'`; `maintenance()` re-delivers anything queued for more than two minutes. A duplicate offer message is strictly better than a silent one.

### 3.2 First-accept-wins — the exact SQL

Entry is the existing `POST /public/work/{token}/actions {action:"assign"}` in `capabilities.worker_action`. `capability(conn, "work", token, lock=True)` already takes `SELECT * FROM work_requests … FOR UPDATE` and **re-reads the dispatch row after the lock** (capabilities.py:119-124), so a request queued before a revocation cannot win with a stale credential. That guarantee is inherited, not rebuilt.

```python
try:
    async with w._ticket_transaction() as conn:          # ⓕ catch OUTSIDE the transaction:
        row, ticket = await capability(conn, "work", token, lock=True)
        owner = row["owner_user_id"]
        name  = row.get("person_name") or "Worker"

        # 1 ── claim THIS offer. rowcount is the test-and-set. Zero rows covers
        #      every losing case at once: somebody else accepted, the sweeper
        #      expired it, the desk withdrew it, the ticket was cancelled.
        cur = await conn.execute(
            "UPDATE ticket_dispatches SET offer_state='accepted', responded_at=%s"
            " WHERE id=%s AND ticket_id=%s AND offer_state='offered'"
            "   AND revoked_at='' AND (offer_expires_at='' OR offer_expires_at > %s)",
            (now, row["id"], ticket["id"], now))
        if not cur.rowcount:
            raise _Lost()

        # 2 ── the name and the id, BEFORE _move.                          ⓕ
        #      event_headline composes "{actor} put {assignee} on it" at write
        #      time from ticket['assignee'] (ticketing.py:1533) and can never
        #      be re-worded. Moving first writes "G. Srinivas put somebody on
        #      it" into an append-only trail, permanently.
        cur = await conn.execute(
            "UPDATE work_requests SET assignee=%s, assignee_ref=%s"
            " WHERE id=%s AND owner_user_id=%s AND status='sent'",
            (name, row["associate_id"], ticket["id"], owner))
        if not cur.rowcount:
            raise _Lost()
        ticket["assignee"] = name

        # 3 ── the machine. _move is the ONLY writer of status and carries its
        #      own compare-and-set (web360.py:2116). CHECK THE RETURN VALUE —
        #      capabilities.py:206 discards it today and answers ok:True even
        #      when the move was refused. That is a live bug on this exact path.
        if not await w._move(conn, owner, ticket, "assign",
                             actor_kind="worker", actor_label=name):
            raise _Lost()

        # 4 ── everybody else loses, and their token dies with the offer.
        cur = await conn.execute(
            "UPDATE ticket_dispatches SET offer_state='superseded', responded_at=%s,"
            "       revoked_at=%s, revoke_reason='Another associate took this job'"
            " WHERE ticket_id=%s AND owner_user_id=%s AND id<>%s"
            "   AND offer_state='offered' AND revoked_at=''"
            " RETURNING id, associate_id, person_name, contact, channel",
            (now, now, ticket["id"], owner, row["id"]))
        losers = list(await cur.fetchall())

        # 5 ── tell them, with NO new credential.
        for d in losers:
            await w._compose_dispatch(conn, owner, ticket, card, contact=d["contact"],
                person_name=d["person_name"], channel=d["channel"],
                purpose="withdrawn", with_token=False,
                note="That job near {place} has gone to somebody else. Nothing you "
                     "did — somebody answered first. We will write again.")

        # 6 ── stop the engine chasing a ticket that is taken.
        await conn.execute(
            "UPDATE work_requests SET dispatch_state='', dispatch_at='',"
            " dispatch_lease='' WHERE id=%s", (ticket["id"],))
except _Lost:
    return response({"ok": False, "reason": "taken"}, status=409)
except psycopg.errors.UniqueViolation:
    # ⓕ A UniqueViolation poisons the transaction; nothing further can run on
    #    that connection, so the catch must live here and not beside the UPDATE.
    return response({"ok": False, "reason": "taken"}, status=409)
```

The losers' consolation is delivered outside this transaction by the same queued-delivery sweep as §3.1.

**Three redundant layers, each one line:** the ticket `FOR UPDATE` serialises two token holders before either conditional UPDATE runs; the rowcount is the test-and-set; `_move`'s own CAS refuses `('assigned','assign')` for a worker; and `uq_dispatch_one_accept` aborts anything that gets past all three. With two replicas nothing changes — the invariant is in Postgres.

### 3.3 Decline

`worker_action`'s hard allowlist widens from `("assign","start")` to `("assign","start","decline")`.

**This is a deliberate, stated exception to "the endpoint allowlist stays ⊆ TRANSITIONS."** ⓕ Declining is a fact about an offer, not a move on the job, so it needs no transition — but the affordance must still be server-derived, so `GET /public/work/{token}` gains an `offer` object carrying its own `canAccept`/`canDecline` and the client renders the button from that, never from `ticketing.can()`. Two sources of truth for one button is exactly the bug this rule exists to prevent.

```sql
UPDATE ticket_dispatches SET offer_state='declined', responded_at=%s,
       decline_reason=%s, revoked_at=%s, revoke_reason='Declined'
 WHERE id=%s AND offer_state='offered' AND revoked_at='';

-- ⓕ A decline ACCELERATES the ladder. Without this, three associates saying
--    no within ten minutes still leaves the job idle for the full four hours.
UPDATE work_requests SET dispatch_at=%s
 WHERE id=%s AND dispatch_state='resting'
   AND NOT EXISTS (SELECT 1 FROM ticket_dispatches d
                    WHERE d.ticket_id = work_requests.id AND d.offer_state='offered');
```

ⓕ **`decline` and `withdrawOffer` must NOT reuse `revoke_dispatch`.** Its tail (web360.py:5162) moves `sent → placed` when the last live dispatch goes, which silently drops a broadcasting ticket out of the queue. `_revoke_offer()` stamps `revoked_at` + `offer_state` and wakes the plan; it calls `_move('withdraw')` **only** when `dispatch_state=''` (a purely manual ticket). The resting→queued sweep therefore matches `status IN ('placed','sent')`, not `status='sent'`.

### 3.4 Expiry — server-authoritative

The countdown on screen is decoration. In `maintenance()`, every 60 seconds, one conditional UPDATE that can never touch an accepted offer:

```sql
UPDATE ticket_dispatches
   SET offer_state='expired', responded_at=%(now)s, revoked_at=%(now)s,
       revoke_reason='The offer window closed'
 WHERE offer_state='offered' AND offer_expires_at <> ''
   AND offer_expires_at < %(now)s;

UPDATE work_requests SET dispatch_state='queued', dispatch_at=%(now)s
 WHERE dispatch_state='resting' AND dispatch_at <> '' AND dispatch_at <= %(now)s
   AND closed = false AND status IN ('placed','sent')
   AND NOT EXISTS (SELECT 1 FROM ticket_dispatches d
                    WHERE d.ticket_id = work_requests.id AND d.offer_state='offered');
```

`associates.offer_deadline(now, hours, holidays)` is **pure and takes `now` as an argument**: Mon–Sat 09:00–18:00 IST. A four-hour window opened at 20:00 expires at 13:00 the next working day. A wall-clock timer that starts at nine at night is a decline machine. `holidays` is `()` today and the screens do not claim otherwise; `TZ=Asia/Kolkata` goes into `start-local.sh` and the Dockerfile, because `_now_iso()` is naive local and a container defaulting to UTC makes every window 5h30m wrong.

### 3.5 The escalation ladder

| round | grain | window | if nobody answers |
|---|---|---|---|
| 1 | the discipline's own | 4 working hours | round 2 |
| 2 | one wider (village→mandal→district) | 8 working hours | round 3 |
| 3 | whole qualified district pool, fanout capped 25 | 24 working hours | `ops` |
| — | `dispatch_state='ops'` | — | **a named human** |

There is no round 4. Landing on `ops` writes one `desk_task`, one `ticket_event` the **owner** also sees — *"We have not found anyone for this yet. Somebody at Pattadar is looking."* — and puts the row at the top of `/app/desk` in red. Silence is what destroys trust on day-scale jobs.

Broadcast-to-everyone is correctly the **last** rung, not the first. At five associates round 1 and round 3 are frequently the same people, which is exactly why the argument is a number and not a schema decision.

### 3.6 The failure cases, named

- **Nobody accepts.** Offers expire; the resting→queued sweep fires; the next tick widens a grain. After round 3, `ops`.
- **Everybody declines.** The decline path pulls `dispatch_at` forward to now, so escalation happens in the next tick rather than after the window.
- **The winner goes silent.** `quiet_days` and `quiet` are already computed server-side (web360.py:3538-3558) and go on `DeskJob`. ⓕ The desk's **second section is "On someone, nothing happening"** — assigned/on_site tickets past four quiet days, which the winning design's desk excluded by scope. The desk then calls `deskUnassign(ticketId, reason)`: it downgrades the accepted offer to `offer_state='ended'` (freeing `uq_dispatch_one_accept`), revokes that associate's token, `_move('unassign', actor_kind='system')` → `placed`, clears `assignee`/`assignee_ref`, re-queues, and writes an `associate_event`. The job can then be re-offered — including to people who saw it before, because round 2 is a new `offer_round`.
- **The desk suspends somebody after a complaint.** ⓕ `setAssociateState('suspended')` revokes every **live offer** to that associate in the same transaction (`offer_state='withdrawn'`, `revoked_at` stamped) so they cannot accept twenty minutes later. Jobs **in hand are not taken away** — the screen lists them and the desk deals with each by `deskUnassign`, because an automatic mass-unassign is how four owners find out at once that nobody is coming.
- **Nobody in the district can ever do it.** `ops`, plus `deskCancel(ticketId, reason, payAnyway=0)` which runs the existing `cancel_ticket` service function with `actor_kind='system'` and releases the held money through the existing `cancel_plan`. Nothing automatic moves money, ever.
- **Nothing actually sends.** `_payments_provider()` returns `'stub'` unconditionally and `notify.py` falls back to a stub without credentials, so for months every offer is `status='logged'`. The desk therefore ships a **Copy link** control per offer, reading the token out of the recorded body exactly as `Ticket.tsx:337` already does, and a **Copy all three** for the round. That is not a workaround; it is how dispatch already works.
- **The provider replies on WhatsApp, to a human.** `deskRecordReply(dispatchId, outcome, reason, note)` ⓕ — the desk records what was actually said. Without it, a man who answered within the hour shows on the owner's ticket as *"Did not answer"*, and the decline reasons — the only supply signal this system will ever get — are noise.

---

## 4. The batch service

### 4.1 The runtime, honestly

There is no scheduler in this repo — no celery, apscheduler, rq, arq, dramatiq, huey; the API runs on eleven packages and gains no twelfth. There is no deployed runtime to trigger: `aws ecs list-clusters --region ap-south-1` returns `[]` and `api.pattadar.com` does not resolve.

What already ships is `import_jobs.maintenance()` — a `while True` that sweeps twice and sleeps 60 seconds, mounted on the FastAPI lifespan. **A recurring background job is not hypothetical here; one runs every minute in production code.** This is the fourth.

**No cron endpoint.** `/cron/*` is fail-open when `CRON_SECRET` is empty, which is precisely the local configuration (`start-local.sh` sets `ALLOW_INSECURE_LOCAL=1` and never sets `CRON_SECRET`), and the one existing EventBridge rule `pattadar-prod-inactivity-check` is already ENABLED and firing daily into a dead endpoint. Adding a second target to that arrangement would be adding a fail-open door to an orphaned scheduler.

### 4.2 Where the code lives

`services/api/src/dispatch_jobs.py` — the impure half, shaped exactly like `import_jobs.py`. Mounted by adding one identifier to main.py:5981:

```python
async with import_jobs.lifecycle(pool, {...}), payments.lifecycle(pool), \
           dispatch_jobs.lifecycle(pool):
    yield
```

```python
@contextlib.asynccontextmanager
async def lifecycle(db_pool):
    global pool
    pool = db_pool
    tasks = [asyncio.create_task(maintenance())]        # ⓕ ALWAYS runs: marks rows, sends nothing
    if _armed():                                        # DISPATCH_WORKER, default off
        tasks.append(asyncio.create_task(ticker()))     # offers; the payments.py:74 idiom
    try:
        yield
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
```

ⓕ **`maintenance()` is unconditional and `ticker()` is gated.** The winning design gated both, which meant phase 2 shipped offer windows that nothing could ever close: the countdown ran negative on screen, `offers_out` never fell, and no round could escalate. `maintenance()` only expires offers, blocks lapsed disciplines, reclaims leases and re-delivers queued sends — it writes no offer and sends no invitation, so it is safe on the founder's laptop from day one.

Mode (`off | shadow | live`, global and per-district) is read from `platform_settings` **on every tick**, so ops can change behaviour without a restart while the env flag decides whether a loop exists at all.

No DDL runs here: the tables are in `associates.DDL`, spliced into `web360._DDL`, executed inside the boot advisory lock.

### 4.3 What one tick does

`ticker()` is a thin wrapper — `while True: n = await sweep(); await asyncio.sleep(60 if not n else 2)`. All the work is plain awaitables the tests drive directly.

**`reclaim()`** — one statement, no lock, idempotent. Local development restarts the API constantly under `--reload`, so this path is hit routinely, not rarely.
```sql
UPDATE work_requests SET dispatch_state='queued', dispatch_lease=''
 WHERE dispatch_state='working' AND dispatch_lease <> '' AND dispatch_lease < %(now)s;
```

**`maintenance()`** — offer expiry and the resting wake-up (§3.4), plus:
```sql
-- A lapsed paper blocks ONE discipline, never the person. String compare on
-- ISO dates; no to_date() anywhere, because one malformed date in SQL throws
-- inside the loop and silently kills every other sweep in the same pass.
UPDATE associate_disciplines d SET state='blocked',
       state_reason='A paper for this work has expired'
 WHERE d.state='on' AND EXISTS (
   SELECT 1 FROM associate_credentials c
    WHERE c.associate_id=d.associate_id AND c.discipline=d.discipline
      AND c.review='verified' AND c.expires_on <> '' AND c.expires_on < %(today)s);
-- plus an INSERT ... ON CONFLICT DO NOTHING into desk_tasks per lapse and per
-- credential inside 30 days, keyed dedupe_key='cred:<id>:<expires_on>'.
-- plus re-delivery of any dispatch still status='queued' after two minutes.
```

**`dispatch_one() -> bool`** — the unit of work, returning did-I-do-anything, exactly like `import_jobs.run_one()`.

*Claim* (its own short transaction, committed before anything slow):
```sql
SELECT id, owner_user_id, kind, entity_type, entity_id, area_key, quoted,
       payee_share, due_date, dispatch_round
  FROM work_requests
 WHERE dispatch_state='queued' AND dispatch_at <> '' AND dispatch_at <= %(now)s
   AND closed = false AND status IN ('placed','sent')
 ORDER BY dispatch_at
   FOR UPDATE SKIP LOCKED LIMIT 1;

UPDATE work_requests SET dispatch_state='working',
       dispatch_lease=%(now_plus_5min)s WHERE id=%s AND dispatch_state='queued';
```

*Repair* ⓕ — if `area_key=''` (every legacy, seeded and reseeded row), derive it from the record and stamp it **inside a `_ticket_transaction()` with the row locked**, not in a lock-free "decide" phase. A cross-owner UPDATE outside a transaction contradicts the module's own rule.

*Decide* — no transaction, no lock: run the candidate query, run `associates.rank()`, take `fanout` for the round.

*Act* — `_ticket_transaction()` with `_ticket_row(lock=True)`:
- **shadow** — write one `kind='dispatch'` ticket_event carrying the shortlist and every candidate's `why` lines, set `dispatch_state='ops'`, **send nothing**. The proposal appears on the desk with a Send button beside it.
- **live** — call the same `offer_round()` the desk's button calls (§3.1); `resting`.
- **no candidates, or round ≥ 3** — `ops`, one `desk_task`, one owner-visible ticket_event.

Same function, same rows, same events, whether a human or the ticker pressed it.

### 4.4 Two replicas

Nothing special happens, by construction. `FOR UPDATE SKIP LOCKED` means two replicas never claim the same ticket — the second skips and takes the next. A replica that dies mid-tick leaves `dispatch_lease` in the past and `reclaim()` on *either* replica returns the row. The per-ticket `_ticket_transaction` takes the same `FOR UPDATE` an owner's own actions take. The accept race is guarded independently by `uq_dispatch_one_accept`, which is a database constraint and does not care how many processes exist. **No leader election and none is needed: this is N safe claimers, not a singleton tick.**

Today the risk is theoretical — the Dockerfile defaults `--workers 1`, prod `desired_count = 1`, `start-local.sh` runs one uvicorn — but the claim lives in the database precisely so that stays true the day it changes.

### 4.5 How it is tested

`services/api/tests/test_dispatch_jobs.py`, following `test_import_jobs.py` exactly: real Postgres, throwaway schema `test_dispatch_<hex>`, `dispatch_jobs.pool = pool`, `DROP SCHEMA … CASCADE` in teardown. **`ticker()` is never started** — tests `await dispatch_one()` and assert True/False, so there is zero timing flakiness.

- `test_race_has_exactly_one_winner` — **the test the whole design exists to pass.** Two connections, two live offers on one ticket, both POST accept under `asyncio.gather`. Exactly one 200, one 409; exactly one row `offer_state='accepted'`; the loser is `superseded`, not `declined`; `assignee_ref` is the winner; a third hand-inserted accepted row raises `UniqueViolation`. Then repeat with the row lock removed to prove the index alone holds the line.
- `test_loser_gets_no_new_token` — after an accept, assert every `purpose='withdrawn'` row has `token_hash=''`, and that `GET /public/work/<loser_token>` 410s.
- `test_unassign_then_reoffer_then_accept` — the path the ticket-scoped index used to make permanently unassignable.
- `test_accept_headline_names_the_assignee` — assert the `ticket_events` row reads `"G. Srinivas put G. Srinivas on it"`, never `"…put somebody on it"`.
- `test_settlement_survives_a_live_offer` — accept a ticket that still has a live round-0 offer to the winner; assert `accept_ticket` completes and the ledger is written (the under-scoped second index used to abort it).
- `test_expired_round_widens`, `test_ladder_ends_on_the_desk`, `test_rerun_is_idempotent`, `test_expired_lease_is_reclaimed`, `test_lapsed_paper_blocks_one_discipline_only`, `test_shadow_sends_nothing`, `test_withdrawing_the_last_offer_keeps_the_ticket_queued`.
- `services/api/tests/test_associates.py` — **pure, no database.** `rank()` ordering, `dispatchable()` and its `why_not` sentences, `offer_deadline()` across an evening and a Sunday, `fold()` on `Peddapuram (R)`, `contact_key()` on `+91 98480 12345` vs `9848012345`, `area_key_of()` for a parcel and a property. This is the bulk of the logic and it runs in milliseconds.

### 4.6 How it is run locally

```bash
./scripts/start-local.sh            # the founder drives the stack; never background a second uvicorn
```
Phase 1–2 need no timer at all. Phase 3+: add `DISPATCH_WORKER=1` and `TZ=Asia/Kolkata` to `.env`, and demonstrate without waiting sixty seconds through `Mutation.web.runDispatch(ticketId:)` — the same pass, scoped, mirroring `_run_inactivity_check(conn, now, only_owner='')` with its cron caller and its mutation caller.

---

## 5. GraphQL

All types are `@strawberry.type` in `web360.py` beside `TicketDispatch`; snake_case → camelCase on the wire. **Every mutation returns a falsy value on refusal and does not raise**, matching every other write in this module.

### 5.1 Types

```python
DisciplineInfo   { key, label, blurb, kinds: [String], areaGrain, credential, fanout }
AssociateArea    { id, level, name, label }
AssociateDiscipline { key, label, state, stateWord, capacity, openCount, credentialState }
AssociateCredential { id, discipline, kind, numberMasked, authority, expiresOn,
                      daysLeft, expiring, lapsed, review, reviewNote, fileRef, fileName }
Associate        { id, name, firm, initials, contact, contactMasked, contactVisible,
                   state, stateWord, stateState, stateReason, disciplines, areas,
                   credentials, claimed, dispatchable, whyNot: [String],
                   jobsOpen, jobsDone, offersSent, offersTaken, offersDeclined,
                   acceptRate, lastOfferedAt, note, createdAt }
AssociateCard    { id, name, firm, initials, disciplines, disciplineLabels, areas,
                   verified, jobsOpen, jobsDone, acceptsMore, why: [String] }   # owner-facing, NO contact
AssociateEvent   { id, kind, headline, detail, actorLabel, actorKind, at, atLabel }
Candidate        { associateId, name, initials, contact, discipline, areaMatch,
                   openCount, capacity, acceptRate, lastOfferedAt, rank, why: [String],
                   eligible, whyNot: [String], alreadyOffered, alreadyDeclined }
TicketOffer      { dispatchId, associateId, personName, contactMasked, channel,
                   state, stateWord, stateState, round, rank, payout, expiresAt,
                   hoursLeft, respondedAt, declineReason, declineWord, why: [String],
                   createdBy, sentAt, live, workPath }     # workPath = '' unless admin
AssignedPerson   { associateId, name, firm, initials, discipline, disciplineLabel,
                   contact, contactShown, contactWhy, jobsOpen, assignedAt, via }
DeskJob          { ticketId, ref, kind, serviceLabel, place, status, statusLabel,
                   statusState, assignee, assigneeRef, assigneeContact, orderedAt,
                   ageDays, dueDate, overdue, quiet, quietDays, quoted, held,
                   dispatchState, dispatchRound, nextRoundAt, offersOut,
                   offersDeclined, lastResponse, candidateCount, stuck }
CoverageCell     { level, name, discipline, disciplineLabel, activeCount,
                   openJobs, records, risk }
DeskTask         { id, kind, headline, detail, associateId, ticketId, to, at }
Desk             { mode, modeWord, jobs: [DeskJob], silent: [DeskJob],
                   unassigned, ageing, silentCount, stuck, associatesActive,
                   associatesPending, credentialsExpiring, coverageGaps, tasksOpen }
```

Extensions to existing types:
```python
TicketView  += assignedTo: AssignedPerson, offers: [TicketOffer], offersOut: Int,
               dispatchState: String
Order       += assigneeRef: String, offersOut: Int
Portfolio   += isPlatformAdmin: Boolean, associateId: String
```
Folding the two booleans into `Portfolio` avoids a third Shell query — `Shell.tsx` mounts only `usePortfolio` and `useOrders`, and anything new there runs on every screen in the app.

### 5.2 Queries — `Query.web`

```python
desk(scope: String = "open") -> Desk?            # open | silent | stuck | all. None for non-admins.
associates(q, discipline, area, state, limit) -> [Associate]      # admin
associate(id) -> Associate?                      # admin, or the associate's own row
associateEvents(id) -> [AssociateEvent]          # admin, or own
candidates(ticketId, limit = 12) -> [Candidate]  # admin
coverage(level = "mandal") -> [CoverageCell]     # admin
deskTasks(limit = 100) -> [DeskTask]             # admin
disciplines -> [DisciplineInfo]                  # pure, no database, everyone
associatesForTicket(ticketId) -> [AssociateCard] # ⓕ OWNER-scoped. Without this the
                                                 # founder's first ask only works on
                                                 # jobs an admin assigned: the roster
                                                 # query is admin-only and the owner's
                                                 # picker had nothing behind it.
offersForTicket(ticketId) -> [TicketOffer]       # owner-scoped
myAssociate -> Associate?                        # phase 5
associateInbox(closed = false) -> [AssociateJob] # phase 5
```

`desk`, `associates`, `candidates`, `coverage`, `deskTasks` are the **only** resolvers in the API that read `work_requests` without an `owner_user_id` predicate. Each is guarded by `_is_admin(uid)`, each returns a narrow type that is never `RecordDetail` or `TicketView`, and ⓕ **each writes one `log_audit(conn, uid, "desk_read", scope, …)` row** — an admin reading every owner's job list, place and money must leave a trace in a codebase that ships a DPDP export and masks contacts so a screenshot is not a phone book. A sixth cross-owner resolver is a design change, not a feature.

### 5.3 Mutations — `Mutation.web`

```python
# — the roster —
inviteAssociate(name, contact, disciplines: [String], areas: [String],
                firm = "", note = "", channel = "auto") -> String     # the id, or ""
updateAssociate(id, name = "", contact = "", altContact = "", firm = "",
                note = "", channel = "", contactVisible: Boolean? = null) -> Boolean
setAssociateDisciplines(id, disciplines: [String], capacities: [Int]? = null) -> Boolean
setAssociateAreas(id, areas: [String]) -> Boolean            # "village:Peddapuram" etc.
setAssociateState(id, state, reason = "") -> Boolean         # reason MANDATORY for suspended/retired
addAssociateCredential(associateId, discipline, kind, number, authority = "",
                       issuedOn = "", expiresOn = "", fileRef = "", fileName = "") -> String
reviewAssociateCredential(credentialId, review, note = "") -> Boolean
deleteUnclaimedAssociate(id) -> Boolean        # the ONLY hard delete — see open question 3

# — putting somebody on a job —
assignAssociate(requestId, associateId) -> Boolean     # the OWNER, on their own ticket
deskAssign(ticketId, associateId, note = "") -> Boolean          # admin, cross-owner
deskUnassign(ticketId, reason) -> Boolean                        # admin; reason mandatory
deskCancel(ticketId, reason, payAnyway: Float = 0) -> Boolean    # admin; releases held money

# — offers —
offerRound(ticketId, associateIds: [String], hours: Int = 4,
           note = "", round: Int = 0) -> Int                     # how many went out
withdrawOffer(dispatchId, reason = "") -> Boolean
deskRecordReply(dispatchId, outcome, reason = "", note = "") -> Boolean   # phone replies

# — the engine —
runDispatch(ticketId = "") -> Int                # manual trigger, one ticket or all due
setDispatchMode(mode, district = "") -> Boolean  # off | shadow | live
setPlatformAdmin(uid, on: Boolean) -> Boolean    # writes platform_settings 'admin.uids'
closeDeskTask(taskId) -> Boolean

# — phase 5 —
claimAssociate(token) -> Boolean
enrolAssociate(...) -> String                    # lands state='applied', NOT dispatchable
```

`assign_request(requestId, assignee: str)` is **unchanged** and additionally sets `assignee_ref=''` ⓕ, so a free-text reassignment cannot leave a stale identity and a stale phone number on the card.

### 5.4 REST — `capabilities.py`

```
POST /public/work/{token}/actions   body: {action: "assign"|"start"|"decline", reason?: str}
GET  /public/work/{token}
    # gains exactly one object, computed from the dispatch row:
    #   offer: {state, payout, expiresAt, hoursLeft, canAccept, canDecline}
    # Nothing else widens. The manifest stays four fields per item plus a
    # geometry-only boundary; file_ref stays a boolean; the owner id never appears.
    # ⓕ The deliverable list is scoped:
    #     WHERE submitted_via='owner' OR submitted_dispatch_id = <this dispatch id>
```

---

## 6. The screens

House rules, applied everywhere below: plain semantic elements over `w360.css` classes (never MUI components, only MUI icons); no colour literals — `var(--w-*)` only; hairline not shadow; every grid track `minmax(0,Nfr)`; **three states, three sentences** — `isLoading ? <Loading/> : !data ? <Failed/> : <content/>`, never `isLoading || !data`; **no dead controls** — a disabled primary prints its reason as a `.note` beside it, never a `title=`; money copy says *set aside / recorded / owed*, never *paid* or *charged*, with `<span className="pill sim">Not charged</span>` beside any figure that has not moved. `scripts/ux-guards.ts` gains the `/app/desk` files to its file list.

---

### `/app/desk` — admin — **the phase-1 product**

`<PageHead eyebrow="Pattadar desk" title="Jobs waiting for somebody">` with, in `actions`, a `<State>` carrying the engine mode and a `Menu` labelled **Dispatch** holding Off / Shadow / Live as `role="menuitemradio"` — the kill switch, one click, no deploy.

A `.strip` of five figures, **rendered only when non-zero**: *7 waiting · 3 ageing · 2 nothing happening · 1 stuck · 2 licences lapsing*.

A `.card.alert` above the list only when `stuck > 0`: *"1 job has nobody who can take it. Nobody in Nizamabad mandal is enrolled as a document writer."* with a link to `/app/desk/coverage`.

**Section 1 — "Nobody on it".** `.card` with `padding:0` wrapping `.rows.boxed`, oldest first. Each row: `.avatarlg` handshake glyph; **Boundary re-survey** with the mono ref `PT-2094`; `<State>`; a `.note` reading *"Peddapuram, Kakinada · ordered 4 days ago · due 28/09/2026"*; `<Tag alert>3 days waiting</Tag>` past three days; a right column of `inrFullish(quoted)` over `{inr(held)} set aside`; then `<Link className="btn sm primary">Find someone</Link>` and a `Menu` — *Open the owner's ticket · Put it on the desk queue · Stop offering this · Cancel and release the money*.

**Section 2 — "On someone, nothing happening"** ⓕ. Assigned/on_site/changes tickets with `quietDays >= 4`. Each row: the assignee's name and their number as a `tel:` link, `<Tag alert>9 days quiet</Tag>`, and two controls — *Write to them* and *Take them off this job* (danger; a `Dialog` with `dismissable={false}` demanding a reason and stating *"The job goes back on the queue and {name} is told. The owner is not charged anything extra."*). **This is the section the winning design's desk excluded, and it is the most common real failure.**

When the dispatcher is in shadow and has a proposal, the row gains an inline `.card.accent` footer: *"The desk would ask G. Srinivas, M. Rajesh and K. Anitha. Covers Peddapuram village · 1 of 3 jobs in hand · last offered 9 days ago."* with `[Send these three]` and `[Choose somebody else]`.

- **Loading:** `<Loading h="18rem" what="the desk"/>`
- **Failed:** `<Failed what="The desk" error={error} boxed h="18rem"/>` — guarded on `error && !data` so a failed background refetch does not wipe the list.
- **Empty:** `<Empty boxed h="16rem" icon="handshake" title="Every job has somebody on it.">Nothing is waiting. New orders land here the moment they are placed.</Empty>` — and the five-figure strip and the mode `Menu` are **both suppressed**, per the zero-state standard.

---

### `/app/desk/jobs/:id` — admin

`<Crumbs trail={[{label:'The desk',to:'/app/desk'},{label:ref}]}/>`, an `.eyebrow` of *"{ref} · {serviceLabel} · {place}"*, h1 of the service, a `.lede`: *"Ordered 12/09/2026 · ₹2,900 · due 28/09/2026 · nobody on it yet"*.

`.split`. **LEFT — Card "Who could take this"** (aside: *"{n} people"*), `.rows.boxed` per `Candidate`: initials; name + `.note` firm; the discipline as `<Chip static>`; the why-lines printed **verbatim** as a comma-joined `.note` — *"Covers Peddapuram village · 1 of 3 jobs in hand · took 4 of 5 offers · last offered 9 days ago"*; the number as `<a className="link mono" href={\`tel:${c.contact}\`}>` because **this screen is the phone call**; a `.check` for the offer set; `<button className="btn sm">Put them on it</button>`.

An ineligible candidate is shown **greyed with its reason** instead of a button — *"Survey licence lapsed 4 days ago"*, *"4 of 4 jobs in hand"*. Shown, not filtered: a shortlist that quietly shrank from four to one is a question the desk needs answered on the screen.

Sticky `.row.between` under the rows: *"3 chosen"* and `<button className="btn primary">Ask these three</button>` plus a `.field` select for the window (*4 working hours · Until tomorrow evening · Two working days*). Disabled with nothing chosen, reason printed beside it: *"Choose at least one person first."*

**Card "Everything that happened"** — `.rows.boxed` over the ticket's events, cross-owner.

**RIGHT aside** — *Who is on it* (name + role + `tel:` + *"Assigned 13/09/2026 by the desk"* + `[Take them off this job]`); *What was asked for* (`dl.kv` of the ordering answers); *The money* (quoted, set aside, *"{inr(payout)} to whoever takes it"*, `pill sim` beside anything that has not moved, and `[Cancel and release the money]`); **Card "Offers out"** — one row per `TicketOffer`: masked contact, `<State>` on the offer state word, `[Copy the link]` ⓕ (from the recorded body), `[They said no on the phone]` ⓕ, `[Take it back]`. Footer when the provider is a stub: *"Nothing has actually been sent — copy each link and send it yourself."* with `[Copy all three]`.

- **Loading** `<Loading h="20rem" what="this job"/>` · **Failed** `<Failed what="This job" …/>`
- **Empty candidates:** `<Empty boxed icon="person_search" title="Nobody can take this today." action={<Link className="btn" to="/app/desk/coverage">See the gaps</Link>}>No active associate covers Peddapuram for a boundary re-survey. Enrol somebody, or widen an existing associate's area.</Empty>`

---

### `/app/desk/associates` — admin

`<PageHead eyebrow="Pattadar desk" title="Associates" actions={<Link className="btn primary" to="/app/desk/enrol">Add somebody</Link>}/>`.

A `.filterbar` of discipline `Chip`s with counts, a `.search` for name or place, and state chips (*Taking work / Paused / Stopped / Waiting on us*). **Every chip suppressed when the roster is empty** (the `bare` idiom).

`.rows.boxed`: initials; name + `.note` firm; discipline `Chip`s; a `.note` of areas — *"Peddapuram, Prathipadu · Kakinada district"*; the number as a `tel:` link **unmasked** — this is the admin roster and masking it defeats the only reason to open the screen; `<State>`; a right column of *"2 of 4 in hand"* and *"took 4 of 5"* — **the accept rate hidden entirely below five offers**, because 100% over two is noise wearing a uniform; an amber `<Tag alert>Survey licence: 12 days</Tag>` inside 30 days; `<Link className="btn sm">Open</Link>`.

- **Loading** `<Loading h="18rem" what="the roster"/>` · **Failed** `<Failed what="The roster" …/>`
- **Empty:** `<Empty boxed h="18rem" icon="groups" title="Nobody works for Pattadar yet." action={<Link className="btn primary" to="/app/desk/enrol">Add the first one</Link>}>An associate is somebody who takes jobs — a surveyor, an advocate, a document writer. Add the people you already work with; they do not need an account.</Empty>`

---

### `/app/desk/associates/:id` — admin

Crumbs *Desk › Associates › {name}*. Head: `.avatarlg`, h1 name, `.lede` *"Licensed surveyor · Peddapuram, Prathipadu · with us since 14/08/2026"*, `<State>`, and a `Menu` — *Pause · Stop them taking work* (danger, `Dialog` with `dismissable={false}` demanding a reason) *· Retire · Send the claim link again*.

`.split`. **LEFT:** *What they do* (row per discipline, capacity stepper, *"2 of 4 in hand"*); *Where they work* (area chips + add field); *Papers* (number masked, authority, expiry countdown, `<State>`, `[Verify]` / `[Refuse]` per pending item, refusal demanding a note); *Jobs* — everything they hold and finished, cross-owner, narrow rows (ref, service, place, state) linking to `/app/desk/jobs/:id` and **never to an owner's record**.

**RIGHT aside:** *How to reach them* — the number as `tel:`, the alternate, the channel, and either *"They agreed that an owner can see this number while they are on that owner's job."* or *"They asked that owners not be given this number. Pattadar does the writing instead."*; *How it has gone* — offers sent / taken / declined with the decline reasons listed in words, under the flat sentence **"Nothing here changes what they are offered. Stopping somebody is a decision you make, not one the system makes."**; *Everything that happened* — `associate_events`.

Suspending prints, before it will commit: *"They have 2 jobs in hand. Those stay with them — take each one off by hand from the desk if you need to."*

**There is no rating and no score on this page. Neither exists.**

---

### `/app/desk/enrol` — admin

h1 *"Add an associate"*. `.lede`: *"You have spoken to them. This writes it down and sends them a link — they can start taking work straight away, with or without a Pattadar account."*

`.field` rows: *Their name · Firm or office (optional) · Mobile or email · Send work by (auto/WhatsApp/SMS/Email) · Anything worth remembering*. Then `.choice.svc` over the nine disciplines, each a pressable card with a `small` sub-line (*"Boundary re-survey · village work"*). Then areas: a level `<select>` (*Village / Mandal / City / District / All of Telangana*) plus a text field, added as removable chips. Then a `.check`: *"An owner may see their number while they are on that owner's job"*, checked, with `.note`: *"Off means owners never see it and Pattadar does the writing instead."*

**Papers are optional here** ⓕ and the form says so: *"Add their licence later. A paper you have verified and that then expires will pause that kind of work; a paper you never added does not."*

Primary disabled until a name, a contact, one discipline and one area exist, reason printed beside it: *"A name, a number, one kind of work and one place — that is everything Pattadar needs to send them a job."*

On success: a `ShareResult`-shaped panel — *"Sent to +91 98••• ••345. You can also copy it."*

---

### `/app/desk/coverage` — admin

`<PageHead eyebrow="Pattadar desk" title="Who covers what"/>`, `.lede`: *"Every place we hold land, against every kind of work. A zero is a service we can sell there and nobody to do it."*

A `.rectable` inside `.scroll-x` (its own container — the page body never scrolls sideways): rows are the mandals/cities we actually hold records in, sorted by record count; columns the nine disciplines. A zero renders as `<Tag alert>0</Tag>` when there is a live job needing it there and a muted `—` when there is not — the difference between a problem and a fact. Each row ends with a `.note` naming the gap in words: *"Nizamabad — no document writer, no agent. 3 records here."*

Under the table, one paragraph and one button: *"Four places have land and nobody to work on it. Enrol somebody, or widen an existing associate's area — an advocate needs no local presence at all."* `[Add somebody]`.

- **Empty:** `<Empty boxed icon="map" title="No records to cover yet.">The grid fills in as land is added.</Empty>`

---

### `/app/tickets/:id` — owner — **the founder's first ask**

The populated branch of `<Card title="Who is on it">` (Ticket.tsx:1054-1094) becomes three branches:

**An associate has it** — `.avatarlg` initials; the name in `<strong>`; `.note` *"Licensed surveyor · put on it by Pattadar on 13/09/2026"*; the number as `<a className="link mono" href={\`tel:${t.assignedTo.contact}\`}>+91 98480 12345</a>` followed by `.note`: *"Call them about this job. Pattadar gave them your land's outline and nothing else."*; a second `.note` when busy: *"Also on 2 other jobs."*; and the existing `[They're on site]` when `can('start')`.

**They withheld their number** — the number is replaced by a `.note` and **a control that works**: *"They asked that their number not be shared. Send them a message instead."* with `[Write to them]`, which opens the existing send panel pre-filled. Never a dead control, never a disabled button with a `title=`.

**A hand-typed name** — exactly what the card is today, plus the honest `.note`: *"You typed this name. Pattadar has no number for them — the contact you sent it to is under Sent out."* No fake Call button. Nothing regresses.

The unmasked number is granted on **four conditions all holding**: the ticket's status ∈ `assigned | on_site | submitted | changes | accepted` ⓕ *(accepted included — the moment an owner is most likely to phone is right after the work comes back)*; the caller is the ticket's owner; `assignee_ref` points at a real associate; that associate's `contact_visible` is true. Otherwise `contact` is `''` and `contactShown` is false. **Every offer contact stays masked, everywhere.**

The empty branch's fire-and-forget `void assign.mutateAsync(...)` is **fixed while in the file** ⓕ — awaited, payload checked, select reverted on refusal, `MOVE_FAILED` shown — and `MOVE_FAILED` is lifted from Orders.tsx and Ticket.tsx into `ui.tsx`, which Orders.tsx:19-23 already asks for. Its picker becomes a real roster from `associatesForTicket`: associates first, grouped by discipline with their area under each name, then the old `assignable` suggestions under *"Names you have used"*.

A new **Card "Asked of"** appears in the aside above *Sent out*, only while offers are live: one `.rows` line per `TicketOffer` — masked contact, `<State>` on *"Waiting on them" / "They said no" / "Window closed" / "Someone else took it"*, and *"Reply by 6pm today"*. Under it: *"Pattadar asked three people. The first to answer takes it, and you will see who."* The owner sees that three people were asked; the owner does not see three strangers' phone numbers.

---

### `/work/:token` — provider — the existing portal

Above the existing job facts, a `.card.accent` when `offer.state === 'offered'`: h2 **"You are being asked to take this job"**; the payout in full rupees — *"₹2,610 to you"*; the window in words — *"Please answer by 6pm today (Saturday)"*; and two buttons, `[Take this job]` and `[Not this one]`, the second revealing a reason select (*Busy · Too far · Not my line of work · The rate is low · Something else*) plus a free-text line. Both rendered from `offer.canAccept` / `offer.canDecline`, not from `can()`.

Everything shown is already what `_dispatch_ctx` permits and nothing more: what the job is, where the land is, how big, what was asked for, what it pays, when it is wanted. No owner name, no khata, no survey number; the boundary stays `properties: {}`, corners only. **There is no concealment of job details** — nobody can responsibly accept a multi-day professional commitment blind, and hiding the destination is a rideshare anti-cherry-picking device with no analogue here.

On a lost race, 409 → the card is replaced in place (not removed, not an error toast) by: *"This job has gone to somebody else. Somebody answered first — nothing you did. We will write again."*

On a declined or expired offer the token is already revoked, so the page is the existing flat 410 — deliberately identical for both, so nobody can probe which links ever existed.

---

### `/app/work` and `/app/associate` — provider — **phase 5**

`/app/work` — *"Work offered to you"*, two sections (**Offered** / **In hand**), rows carrying service, place (*village and mandal, never a survey number, never an owner's name*), extent, `inrFullish(payout)`, `<Tag alert>Reply by 6pm today</Tag>`, and `[Take this job]` / `[Not this one]` — both posting to the same `/work/<token>` portal the SMS link opens. **The account is a better way to hold the link, never a wider scope.** Empty: *"Nothing offered right now. Pattadar writes to you when a job near you needs your line of work. You do not need to keep this page open."* — the last sentence matters: it says plainly that this is not a shift.

`/app/associate` — self-serve enrolment landing in `state='applied'` (**not dispatchable**), and afterwards their own profile: read-write on name, firm, contact, contact-visibility, areas and a Pause switch; read-only on state, disciplines and credential verdicts, with `.note`: *"Only the Pattadar desk can change this."* While `applied`: one `.card` and nothing else — *"We have your details. Somebody will call you before any job is sent."* No progress bar, no fake stages.

The rail gains **one** entry, `{ to: '/app/work', label: 'Work offered', icon: HandshakeOutlined, count: openOffers || undefined }`, filtered out entirely unless `portfolio.associateId` is non-empty. `/app/desk` replaces the existing `admin` stub: removed from `UNDRAWN` in routes.tsx and from `SECTIONS` in Section.tsx, with `/app/admin` kept alive as `<Navigate replace to="/app/desk"/>` ⓕ so a bookmark does not 404 and the rail never carries two admin-shaped entries, one of them dead.

---

## 7. The file plan

**New — 12 files, ~3,050 lines**

| file | why | ~lines |
|---|---|---|
| `services/api/src/associates.py` | pure: DDL, DISCIPLINES, fold, contact_key, area_key_of, dispatchable, rank, offer_deadline, copy, REQUIRED_INDEXES | 520 |
| `services/api/src/dispatch_jobs.py` | lifecycle, ticker, maintenance, reclaim, dispatch_one | 330 |
| `services/api/tests/test_associates.py` | pure unit tests, no database | 260 |
| `services/api/tests/test_dispatch_jobs.py` | throwaway schema; the race test lives here | 420 |
| `apps/web/src/w360/pages/Desk.tsx` | `/app/desk` | 330 |
| `apps/web/src/w360/pages/DeskJob.tsx` | `/app/desk/jobs/:id` | 320 |
| `apps/web/src/w360/pages/DeskAssociates.tsx` | roster | 240 |
| `apps/web/src/w360/pages/DeskAssociate.tsx` | one associate | 340 |
| `apps/web/src/w360/pages/DeskEnrol.tsx` | enrolment form | 210 |
| `apps/web/src/w360/pages/DeskCoverage.tsx` | the grid | 130 |
| `apps/web/src/w360/pages/Work.tsx` | phase 5 inbox | 190 |
| `apps/web/src/w360/pages/AssociateMe.tsx` | phase 5 profile | 220 |

**Modified — 15 files, ~1,250 lines changed**

| file | why | ~lines |
|---|---|---|
| `services/api/src/ticketing.py` | 7 pairs gain `"system"`, 1 new pair; `render_dispatch` gains the offer SMS/WhatsApp body; `accept_plan`/`cancel_plan` carry `payee_ref` | 90 |
| `services/api/src/web360.py` | `*associates.DDL` splice; index assertion; split `_dispatch` into `_compose_dispatch`/`_deliver_dispatch`; `_live_dispatches` token clause; `_write_ledger` payee_ref; `area_key`/`area_label` in `order_service` + `create_request`; 13 types, 10 queries, 18 mutations; `_is_admin` | 780 |
| `services/api/src/capabilities.py` | `decline` in the allowlist; **check `_move`'s return value** (live bug); the `offer` object; deliverable scoping by `submitted_dispatch_id` | 90 |
| `services/api/src/account.py` | four `CHILD_LINKS` entries | 5 |
| `services/api/src/payments.py` | resolve the payout account by `payee_ref` first, env map second | 20 |
| `services/api/src/payments_provider.py` | `payee_account_for(conn, owner, payee_ref, assignee)` | 25 |
| `services/api/src/main.py` | `dispatch_jobs.lifecycle(pool)` on line 5981 | 1 |
| `apps/web/src/w360/api.ts` | types, hooks, mutations | 320 |
| `apps/web/src/w360/routes.tsx` | 6+2 routes; remove `admin` from `UNDRAWN`; the redirect | 25 |
| `apps/web/src/w360/Shell.tsx` | the `/app/work` rail entry + icon import | 10 |
| `apps/web/src/w360/pages/Section.tsx` | drop `admin` from `SECTIONS` | 3 |
| `apps/web/src/w360/pages/Ticket.tsx` | three-branch "Who is on it"; "Asked of"; fix the fire-and-forget assign | 160 |
| `apps/web/src/w360/pages/Orders.tsx` | `assigneeRef`, `offersOut`, lift `MOVE_FAILED` | 25 |
| `apps/web/src/w360/pages/RecipientAccess.tsx` | the offer block, accept/decline | 90 |
| `apps/web/src/w360/ui.tsx` | `MOVE_FAILED` lifted here | 5 |
| `apps/web/src/w360/w360.css` | desk grid + offer card rules | 60 |
| `scripts/ux-guards.ts` | add the desk pages to the money-copy file list | 5 |
| `scripts/start-local.sh` | `export TZ=Asia/Kolkata` | 2 |
| `services/api/Dockerfile` | `ENV TZ=Asia/Kolkata` | 1 |

**Migrations: zero.** All 41 DDL statements are idempotent boot DDL executed inside `pg_advisory_lock(918273645)`, and the `ALTER`s land after `work_requests` is created at main.py:5098.

**Phase 1 alone is: 1 new pure module, 6 new screens, 7 tables, 41 DDL statements, 7 queries, 12 mutations, a new API-side admin gate, a TRANSITIONS edit and a ledger edit — roughly 20 files.** It is the largest single phase; it is not small, and it is not a scaffold.

---

## 8. The phases

### PHASE 1 — THE DESK. Ships alone. No offers, no engine, no accounts.

**Ships:** `associates.py` (pure); all 41 DDL statements; `_is_admin(uid)` over `PLATFORM_ADMIN_UIDS` **failing closed on empty**, additive with `platform_settings 'admin.uids'`; the four `account.py` `CHILD_LINKS` entries; the eight `TRANSITIONS` edits; `area_key`/`area_label` stamped at order time and repaired on read by the desk; `payee_ref` written end to end; `Query.web.desk / associates / associate / associateEvents / candidates / coverage / disciplines / associatesForTicket`; `inviteAssociate / updateAssociate / setAssociateDisciplines / setAssociateAreas / setAssociateState / addAssociateCredential / reviewAssociateCredential / deleteUnclaimedAssociate / assignAssociate / deskAssign / deskUnassign / deskCancel / setPlatformAdmin`; screens `/app/desk`, `/app/desk/jobs/:id`, `/app/desk/associates`, `/app/desk/associates/:id`, `/app/desk/coverage`, `/app/desk/enrol`, and the rebuilt *Who is on it* card with the number on it.

**After phase 1:** the founder sees every associate, sees every job ageing without one, sees every job that has someone on it and has gone quiet, puts somebody on a job in one click, takes them off in one click, cancels an unfulfillable job and releases the money — and the owner sees who is on it and their phone number. **That is the product.** Everything after this is making the desk press its own buttons.

**Phase 1 does NOT do:** offers, races, any automation, any timer, any associate account, any self-serve enrolment, any escalation ladder, any notification to the operator (the desk *is* the screen — they open it), any credential gate on dispatch.

### PHASE 2 — OFFERS, STILL BY HAND. Additive.

**Ships:** the offer columns and four indexes (already in the DDL; the code starts using them); `'offer'` added to `_DISPATCH_PURPOSES`; the `_compose_dispatch`/`_deliver_dispatch` split; `_live_dispatches`' token clause; `offerRound / withdrawOffer / deskRecordReply / offersForTicket`; the accept claim and supersede-by-revoke in `capabilities.worker_action` **plus the `_move` return-value fix**; `decline` in the allowlist and the `offer` object on the public view; `TicketOffer` on `TicketView`; the *Asked of* card; the offer block on `/work/:token`; the candidate checkboxes and *Ask these three* on the desk; **`dispatch_jobs.maintenance()` mounted unconditionally** so windows actually close.

**Blockers that must land in this phase, not after:** the deliverable list scoped by `submitted_dispatch_id` (three offer holders currently read each other's submissions and the owner's review notes), and `_answers`' one-key denylist converted to an **allowlist** (every other `params` key is published to whoever holds the token; broadcasting to three strangers makes leak-by-omission three times as likely).

**After phase 2** the desk asks three surveyors at once and the first to answer takes the job, race-safe, losers told kindly, tokens dead on the next request — and not one line of it runs on a timer. The race test lands here.

### PHASE 3 — THE ENGINE, IN SHADOW. Additive.

**Ships:** `dispatch_jobs.ticker()/reclaim()/dispatch_one()` behind `DISPATCH_WORKER` (default off, so no task is created); the mount at main.py:5981; the mode kill switch; `runDispatch` / `setDispatchMode`; the shadow proposal footer on desk rows; `desk_tasks` written by every automatic path; `test_dispatch_jobs.py`.

Mode ships as **shadow**: the engine computes a shortlist every tick, writes it to the desk with its reasons, and sends nothing. A human presses Send. This is the only honest way to validate a ranking function at single-digit jobs a week — you cannot A/B test your way there, but you can check every proposal against what the human actually chose. **Promotion to `live` is a decision made from that record, not a date.**

### PHASE 4 — AUTONOMY AND THE LADDER. Additive.

**Ships:** `mode='live'` per district; the round ladder with working-hours windows; the `ops` rung with its owner-visible event; the coverage warning when an order is placed into a square with nobody in it; a daily digest of open `desk_tasks` to `PLATFORM_ADMIN_CONTACT` through `notify.py` (stub locally, so it lands in `notification_log` and calls nobody).

The kill switch is the feature here, not the automation.

### PHASE 5 — ASSOCIATES GET ACCOUNTS. Additive.

**Ships:** `claimAssociate` / `enrolAssociate`; `myAssociate` / `associateInbox`; `/app/work`; `/app/associate`; the rail entry gated on `portfolio.associateId`; the DPDP export and erasure path exercised end to end for a claimed associate.

An account is a better way to **hold** capabilities — a list of your offers instead of a folder of SMS links — and never a wider scope. `AssociateJob` stays the shape of the public token view: no owner name, no khata, no survey number, no record id.

---

## 9. Cold start — what every screen says with zero providers

This is the normal case for months, and every one of these is written, not a skeleton.

| screen | with nothing |
|---|---|
| `/app/desk` | The five-figure strip and the Dispatch menu are **suppressed entirely**. `<Empty boxed h="16rem" icon="handshake" title="Every job has somebody on it.">Nothing is waiting. New orders land here the moment they are placed.</Empty>` If jobs exist but no associates do, the job list still renders and each *Find someone* opens a page that says so. |
| `/app/desk/jobs/:id` | Candidate list: `<Empty boxed icon="person_search" title="Nobody can take this today." action={<Link className="btn" to="/app/desk/enrol">Add somebody</Link>}>Nobody is enrolled as a surveyor for Peddapuram. Add the person you already phone — they do not need an account — or put them on it by hand from the roster.</Empty>` The *Ask these three* bar and the window select are **not drawn at all**. |
| `/app/desk/associates` | Filter chips, search and state chips all **suppressed**. `<Empty boxed h="18rem" icon="groups" title="Nobody works for Pattadar yet." action={<Link className="btn primary" to="/app/desk/enrol">Add the first one</Link>}>An associate is somebody who takes jobs — a surveyor, an advocate, a document writer. Add the people you already work with; they do not need an account.</Empty>` |
| `/app/desk/coverage` | With records but no associates, the grid renders with every cell a muted `—` and one line above it: *"You hold land in 4 places and nobody is enrolled for any of it. Every order will land on this desk."* With no records: `<Empty boxed icon="map" title="No records to cover yet.">The grid fills in as land is added.</Empty>` |
| `/app/desk/enrol` | Always available. The `.lede` assumes the phone call has happened. Papers optional. |
| `/app/tickets/:id` → *Who is on it* | Unchanged from today except the picker's group header: *"Pattadar associates"* is omitted entirely when the list is empty, and the existing sentence stands — *"Nobody has worked on your records yet, so there is no name to pick. Open the ticket and send this to someone — Pattadar does the sending, so you can take it back."* Guarded as `if (people && people.length === 0)`, never `!people?.length`, because undefined is in-flight. |
| `/app/tickets/:id` → *Asked of* | Not rendered at all until an offer exists. |
| `/work/:token` | Unaffected — a token works whether or not a roster exists. |
| `/app/work` (P5) | `<Empty boxed h="16rem" icon="handshake" title="Nothing offered right now.">Pattadar writes to you when a job near you needs your line of work. You do not need to keep this page open.</Empty>` |
| the rail | `/app/work` is not rendered for anyone who is not an associate. `/app/desk` is not rendered for anyone who is not an admin. Neither badge draws at zero (`count: n \|\| undefined`). |

**Before shipping any of these, open them on an account that holds nothing.** That is the founder's standing instruction and the reason clause 1 of the zero-state standard exists.

---

## 10. Open questions for the founder

1. **The unmasked number.** The written rule is *"a screenshot of this page must not be a phone book"*, and `TicketDispatch` has no raw contact field at all. This spec narrows it: one number, on one ticket, to that ticket's owner, only while the job is live or recently accepted, only when the associate said yes at enrolment. Every offer contact stays masked. **Yes or no — this is a product decision, not a client change.**
2. **Who is an admin, and in which environment.** `PLATFORM_ADMIN_UIDS` holds **API uids** — whatever `x-user-id` carries — which is `shankarreddy.t` locally (the legacy binding) and a `subject_<64hex>` in prod. It is *not* the gateway's `ADMIN_SUBJECT_IDS` list and the two can never hold the same values. **Confirm the local value, and whether anyone but you is ever an admin.**
3. **An invited associate who never claims their record has no principal**, so the platform's entire erasure model has nothing to key on. This spec gives the desk one hard delete (`deleteUnclaimedAssociate`) and states plainly on the enrolment screen what is held. **Raise alongside the deferred Aadhaar-encryption review — before launch, not after.**
4. **The payout switch.** `payee_ref` is now written, but `payments_provider.payee_account` still resolves by free-text name against `RAZORPAY_LINKED_ACCOUNTS_JSON`. Pointing it at `associates.payout_ref` needs penny-drop verification nobody has done. **Keep the env map authoritative and record the id alongside it (this spec's default), or do the penny-drop work now?**

---

### Two things that are being fixed on the way past, independent of this feature

- **`capabilities.py:206` discards `_move`'s return value** and answers `ok: True` even when the compare-and-set refused — precisely the case a losing accepter must hit. Live bug, on this exact path.
- **The `pattadar-prod-inactivity-check` EventBridge rule is still ENABLED** at `cron(0 6 * * ? *)` against an ACTIVE destination at `https://api.pattadar.com/cron/inactivity-check`, a host that does not resolve. It fires daily into nothing and will hit a real API with a possibly-stale secret the moment a runtime returns. Ten minutes, unrelated, worth doing before anybody adds a second scheduled trigger to that arrangement.

### Refused permanently, with reasons, so they stop being re-proposed

Surge pricing (category-incorrect: supply cannot relocate in hours, is not fungible, and ₹2,900 is published) · bidding, quotes and provider-set pricing (the platform holds the money, so the platform chooses) · the lead model (a platform paid for introductions cannot be accountable for the outcome) · a parallel `offers`/`jobs` table trio · a new ticket status or a fifth pip · real-time online/offline state, location heartbeat, live tracking (nobody is on shift) · H3 and road-network ETA ranking (the village is already stored; a hex index is a second, worse copy of an administrative fact) · seconds-scale countdown timers (a decline machine aimed at somebody in a field or in court) · batched bipartite optimisation (with five associates greedy and optimal are the same assignment) · **automated acceptance-rate consequences** (at four people per district, code that acts on a statistic can delete a district's entire supply — measure it, show it to the desk, and let no code path act on it) · ratings of any kind in these five phases · forward dispatch and back-to-back chaining · expanding radius as the *primary* escalation (widening time and escalating to a human are the strong levers) · hiding job details to prevent cherry-picking (the exact inverse is required) · RBAC beyond one boolean · OTP · a second Cognito audience or provider app · a cron endpoint · a scheduler library · a separate worker process.