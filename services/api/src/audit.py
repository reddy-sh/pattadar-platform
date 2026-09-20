"""Platform-wide audit event envelope, taxonomy, and transactional outbox.

Phase 1 of the centralized audit trail. This module owns three things and
nothing else:

  1. A versioned, typed event *envelope* (`AuditEvent`) that separates the
     actor from the affected owner, records an outcome and a request id, and
     classifies every event by data-sensitivity and retention.
  2. A per-action *taxonomy* — which data class an action carries, how long it
     is retained, whether it is a security event, and which metadata keys are
     allowed to accompany it. Anything not on the allowlist is dropped before
     it can reach storage, so free-text PII cannot leak in through a caller.
  3. A PostgreSQL *transactional outbox*: `enqueue()` writes an outbox row on
     the caller's own connection so the event commits atomically with the
     business change, and a background worker (`run_one`/`worker`) normalizes
     outbox rows into the append-only `audit_events_v2` read model.

Design baseline: NIST SP 800-53 Rev. 5 AU-2/AU-3 (event selection and content),
AU-9 (protection of audit information — insert-only role intent, integrity
hash), AU-11 (retention class), AU-12 (generation at each producer). NIST SP
800-92 informs the central-store/worker split. This is implemented code, not a
deployed control; retention *duration* and any WORM archive are governance
decisions recorded here as defaults only.

Nothing in the envelope/taxonomy layer touches a database, so it is unit-tested
without Postgres. The outbox layer degrades safely: a normal event that cannot
be enqueued must never take down the business write, while a *critical* event
(see `CRITICAL_ACTIONS`) fails closed — its caller re-raises rather than let a
sensitive access go unrecorded.
"""
from __future__ import annotations

import hashlib
import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from psycopg.types.json import Jsonb

log = logging.getLogger("pattadar.audit")

# Envelope version. Bump when the stored shape changes so a reader can tell an
# old row from a new one rather than guessing from which columns are present.
SCHEMA_VERSION = 1

# ── Data classification (AU-2/AU-3) ────────────────────────────────────
# What kind of data an event is *about*, independent of who may read it. Drives
# retention and how strictly metadata is filtered.
CLASS_SECURITY = "security"      # auth, identity, Aadhaar/KYC, cross-owner reads
CLASS_PERSONAL = "personal"      # touches an owner's people/records/documents
CLASS_OPERATIONAL = "operational"  # platform/admin config, model catalog, desk
CLASS_SYSTEM = "system"          # background/system-actor bookkeeping

DATA_CLASSES = {CLASS_SECURITY, CLASS_PERSONAL, CLASS_OPERATIONAL, CLASS_SYSTEM}

# ── Retention classes (AU-11) ──────────────────────────────────────────
# Duration is a governance decision. These defaults encode the reviewed target
# (three years for security-relevant evidence, one year for ordinary activity)
# from docs/compliance; the number lives in ONE place so a legal change is a
# one-line edit, not a hunt through call sites. 0 => keep until account erasure
# only. A retention class NEVER shortens the account-erasure retention window;
# it bounds how long an event lives *absent* erasure.
RETENTION_DAYS = {
    "security": 1095,     # 3 years — approved target for security evidence
    "standard": 1095,     # 3 years — approved default for activity evidence
    "short": 365,         # 1 year — low-signal operational noise
}
DEFAULT_RETENTION = "standard"

# ── Outcomes (AU-3) ─────────────────────────────────────────────────────
OUTCOME_SUCCESS = "success"
OUTCOME_FAILURE = "failure"
OUTCOME_DENIED = "denied"
OUTCOMES = {OUTCOME_SUCCESS, OUTCOME_FAILURE, OUTCOME_DENIED}

# ── Actor kinds ─────────────────────────────────────────────────────────
ACTOR_OWNER = "owner"        # a signed-in landowner acting on their own data
ACTOR_ADMIN = "admin"        # a desk/super-admin acting across owners
ACTOR_SYSTEM = "system"      # cron, worker, inactivity sweeper
ACTOR_RECIPIENT = "recipient"  # a capability/share/work-token holder
ACTOR_KINDS = {ACTOR_OWNER, ACTOR_ADMIN, ACTOR_SYSTEM, ACTOR_RECIPIENT}


@dataclass(frozen=True)
class ActionSpec:
    """The fixed policy for one audited action.

    `data_class` and `retention` decide storage/lifetime. `security` promotes
    an action into the security view and out of the ordinary activity feed.
    `metadata_keys` is the *allowlist*: only these keys survive
    `build_event`; everything else the caller passes is dropped. `resource`
    names the kind of thing the action's target id points at, for AU-3 content.
    """
    action: str
    data_class: str
    resource: str = ""
    retention: str = DEFAULT_RETENTION
    security: bool = False
    metadata_keys: tuple = ()


def _spec(action, data_class, resource="", retention=DEFAULT_RETENTION,
          security=False, metadata_keys=()) -> ActionSpec:
    return ActionSpec(action=action, data_class=data_class, resource=resource,
                      retention=retention, security=security,
                      metadata_keys=tuple(metadata_keys))


# ── The taxonomy ────────────────────────────────────────────────────────
# Every action the phase-1 producers emit. An action absent from this table is
# still recorded (see `spec_for`), but conservatively: personal data class,
# standard retention, and NO metadata allowlist, so an unclassified action can
# never smuggle free-text PII into storage. Adding a new audited action means
# adding a line here — which is the point: classification is a decision, not a
# default the caller picks.
#
# metadata_keys deliberately exclude raw names, contacts, Aadhaar digits and
# document contents. Where a human label is genuinely useful (e.g. a record
# title) it is passed as a bounded, redacted value by the producer, not lifted
# from arbitrary user input.
_SPECS: dict = {s.action: s for s in [
    # Identity / KYC — the sharpest security events.
    _spec("reveal_aadhaar", CLASS_SECURITY, "person", "security", security=True,
          metadata_keys=("subject_kind",)),
    _spec("session.sign_in", CLASS_SECURITY, "user", "security", security=True,
          metadata_keys=("method",)),
    _spec("apply_my_kyc", CLASS_SECURITY, "user", "security", security=True),
    _spec("clear_my_kyc", CLASS_SECURITY, "user", "security", security=True),
    _spec("update_profile", CLASS_PERSONAL, "user", "short",
          metadata_keys=("fields",)),

    # Cross-owner administrative reads (desk). Always security-class: this is
    # one role reading across every owner's data.
    _spec("desk_read", CLASS_SECURITY, "scope", "security", security=True,
          metadata_keys=("scope", "detail")),

    # Documents.
    _spec("upload_document", CLASS_PERSONAL, "document",
          metadata_keys=("doc_kind",)),
    _spec("delete_document", CLASS_PERSONAL, "document",
          metadata_keys=("doc_kind",)),
    _spec("reclassify_document", CLASS_PERSONAL, "document",
          metadata_keys=("doc_type",)),
    _spec("rename_document", CLASS_PERSONAL, "document"),
    _spec("read_document", CLASS_PERSONAL, "document",
          metadata_keys=("doc_type",)),
    # The gateway records the byte download separately from the metadata read:
    # "who opened the record" and "who took a copy of the paper" are different
    # questions, and only the second one is exfiltration.
    _spec("download_document", CLASS_PERSONAL, "document",
          metadata_keys=("doc_kind", "doc_type")),
    _spec("link_document", CLASS_PERSONAL, "document"),
    _spec("link_documents", CLASS_PERSONAL, "document",
          metadata_keys=("relation",)),
    _spec("unlink_documents", CLASS_PERSONAL, "document"),

    # Records / land.
    _spec("record.corrected", CLASS_PERSONAL, "record",
          metadata_keys=("field", "changed")),
    _spec("set_parcel_field", CLASS_PERSONAL, "parcel",
          metadata_keys=("field_key", "state")),
    _spec("update_parcel_geo", CLASS_PERSONAL, "parcel", metadata_keys=("set",)),
    _spec("update_property_geo", CLASS_PERSONAL, "property", metadata_keys=("set",)),
    _spec("set_pin", CLASS_PERSONAL, "record"),
    _spec("set_boundary", CLASS_PERSONAL, "record", metadata_keys=("corners",)),
    _spec("add_purchase", CLASS_PERSONAL, "record"),
    _spec("delete_purchase", CLASS_PERSONAL, "record"),
    _spec("add_expense", CLASS_PERSONAL, "record"),
    _spec("set_stake", CLASS_PERSONAL, "record", metadata_keys=("stake",)),

    # People / groups / beneficiaries.
    _spec("add_person", CLASS_PERSONAL, "record", metadata_keys=("role",)),
    _spec("create_beneficiary", CLASS_PERSONAL, "beneficiary"),
    _spec("delete_beneficiary", CLASS_PERSONAL, "beneficiary"),
    _spec("verify_beneficiary", CLASS_PERSONAL, "beneficiary"),
    _spec("add_member", CLASS_PERSONAL, "person", metadata_keys=("role",)),
    _spec("remove_member", CLASS_PERSONAL, "person"),
    _spec("invite_member", CLASS_PERSONAL, "person", metadata_keys=("channel",)),
    _spec("create_group", CLASS_PERSONAL, "group", metadata_keys=("kind",)),
    _spec("update_group", CLASS_PERSONAL, "group"),
    _spec("delete_group", CLASS_PERSONAL, "group"),
    _spec("assign_land_to_group", CLASS_PERSONAL, "passbook", metadata_keys=("set",)),
    _spec("assign_property_to_group", CLASS_PERSONAL, "property", metadata_keys=("set",)),
    _spec("set_notifiers", CLASS_PERSONAL, "group", metadata_keys=("count",)),

    # Passbooks / parcels / properties CRUD.
    _spec("create_passbook", CLASS_PERSONAL, "passbook"),
    _spec("delete_passbook", CLASS_PERSONAL, "passbook"),
    _spec("create_parcel", CLASS_PERSONAL, "parcel"),
    _spec("add_parcel", CLASS_PERSONAL, "parcel"),
    _spec("delete_parcel", CLASS_PERSONAL, "parcel"),
    _spec("create_property", CLASS_PERSONAL, "property"),
    _spec("delete_property", CLASS_PERSONAL, "property"),
    _spec("archive_record", CLASS_PERSONAL, "record"),
    _spec("tag_record", CLASS_OPERATIONAL, "record", "short"),

    # Sharing — recipient-facing, security-relevant because it grants outside
    # access to an owner's papers.
    _spec("create_share_link", CLASS_SECURITY, "record", "security", security=True,
          metadata_keys=("audience_kind", "doc_count", "expires_on")),
    _spec("revoke_share_link", CLASS_SECURITY, "share", "security", security=True),
    # A share recipient pulling bytes out of the platform. Security-class and
    # emitted with actor_kind=recipient: the actor is outside the owner's
    # household entirely, so the owner's view must be able to show it apart
    # from their own activity.
    _spec("recipient.download", CLASS_SECURITY, "document", "security", security=True,
          metadata_keys=("doc_kind", "doc_type", "share_id")),

    # Favourites / tags — genuinely low signal.
    _spec("favourite", CLASS_OPERATIONAL, "record", "short",
          metadata_keys=("entity_type",)),
    _spec("unfavourite", CLASS_OPERATIONAL, "record", "short",
          metadata_keys=("entity_type",)),

    # Notifications / safeguard.
    _spec("delete_notification", CLASS_PERSONAL, "notification", "short"),
    _spec("acknowledge_inactivity", CLASS_SECURITY, "group", "security", security=True,
          metadata_keys=("actor_type",)),

    # An auditor reading the trail. Audited like any other privileged read:
    # "who reviewed the evidence, and when" is part of the evidence.
    _spec("auditor.read", CLASS_SECURITY, "audit_trail", "security", security=True,
          metadata_keys=("scope", "affected_owner", "action_filter")),

    # Account data rights (DPDP). Security-class evidence of a rights exercise.
    _spec("account.export", CLASS_SECURITY, "user", "security", security=True),
    _spec("account.erasure_requested", CLASS_SECURITY, "user", "security", security=True),
    _spec("consent.updated", CLASS_SECURITY, "user", "security", security=True,
          metadata_keys=("purposes",)),
]}

# Actions that MUST be durably recorded or the operation fails. These are the
# sensitive accesses where an un-audited action is indistinguishable from an
# exfiltration or an untraceable rights exercise. Approved fail-closed policy.
CRITICAL_ACTIONS = frozenset({
    "reveal_aadhaar",
    "desk_read",
    "account.export",
    "account.erasure_requested",
    # An auditor read that cannot be recorded does not happen: an unrecorded
    # review of the whole platform's security events is exactly the hole this
    # role is supposed to close.
    "auditor.read",
})


def spec_for(action: str) -> ActionSpec:
    """The policy for an action. Unknown actions get a safe, conservative
    default: personal class, standard retention, no metadata allowlist."""
    spec = _SPECS.get(action)
    if spec is not None:
        return spec
    return _spec(action, CLASS_PERSONAL)


def retention_days_for(action: str) -> int:
    """Days this action's events are kept absent account erasure. 0 => forever
    (until erasure)."""
    return RETENTION_DAYS.get(spec_for(action).retention, RETENTION_DAYS[DEFAULT_RETENTION])


def is_security_action(action: str) -> bool:
    return spec_for(action).security


def is_critical_action(action: str) -> bool:
    return action in CRITICAL_ACTIONS


def _now() -> datetime:
    return datetime.now(timezone.utc)


_PRIMITIVE = (str, int, float, bool)

# Allowed on EVERY action, not declared per-spec.
#
# `label` is what the action was done TO, in the words the owner already sees on
# screen — "Sy 77/3", "Flat 4B". Without it a line reads "Removed a parcel" and
# cannot answer the one question the trail exists for: WHICH parcel. It is
# universal rather than per-action because naming the object is part of the
# minimum content of an audit record (NIST SP 800-53 AU-3), not a per-action
# nicety — and because adding it spec-by-spec guarantees some actions get
# forgotten and read as anonymous forever.
#
# It is a record's own title, deliberately NOT a person's name, contact,
# Aadhaar or document contents — those stay out of the envelope entirely. The
# value is length-bounded like any other metadata string.
UNIVERSAL_METADATA_KEYS = ("label",)


def filter_metadata(action: str, metadata: Optional[dict]) -> dict:
    """Keep only the allowlisted keys for this action, and only primitive/short
    values. This is the wall against free-text PII: a caller can pass anything,
    but nothing outside the action's declared `metadata_keys` (plus the
    universal keys above) — and nothing that isn't a bounded scalar or short
    list of scalars — is stored.
    """
    if not metadata:
        return {}
    allowed = set(spec_for(action).metadata_keys) | set(UNIVERSAL_METADATA_KEYS)
    out: dict = {}
    for key, value in metadata.items():
        if key not in allowed:
            continue
        if isinstance(value, bool) or isinstance(value, (int, float)):
            out[key] = value
        elif isinstance(value, str):
            # Bound the length so a stray blob can't ride in on an allowed key.
            out[key] = value[:200]
        elif isinstance(value, (list, tuple)):
            out[key] = [str(v)[:80] for v in list(value)[:20]
                        if isinstance(v, _PRIMITIVE)]
        # dicts / bytes / anything else: dropped.
    return out


@dataclass(frozen=True)
class AuditEvent:
    """One normalized audit event (AU-3 content).

    `actor_principal` is WHO acted (the gateway-derived identity or 'system').
    `affected_owner` is WHOSE data the event is about — the two are equal for an
    owner acting on themselves, and differ for an admin/recipient/system actor.
    The owner view filters on `affected_owner`; the security view does not.
    """
    event_id: str
    schema_version: int
    occurred_at: datetime
    source_service: str
    actor_principal: str
    actor_kind: str
    affected_owner: str
    action: str
    resource_type: str
    resource_id: str
    outcome: str
    data_class: str
    retention_class: str
    request_id: str
    metadata: dict = field(default_factory=dict)

    def integrity_hash(self) -> str:
        """A content hash over the immutable fields (AU-9). Not a signature —
        it lets a later verifier detect a row that was altered in place, and
        seeds a hash chain if one is added. Deterministic field order."""
        payload = json.dumps([
            self.event_id, self.schema_version, self.occurred_at.isoformat(),
            self.source_service, self.actor_principal, self.actor_kind,
            self.affected_owner, self.action, self.resource_type,
            self.resource_id, self.outcome, self.data_class,
            self.retention_class, self.request_id,
            json.dumps(self.metadata, sort_keys=True, ensure_ascii=True),
        ], ensure_ascii=True, separators=(",", ":"))
        return hashlib.sha256(payload.encode()).hexdigest()


def build_event(
    *,
    action: str,
    actor_principal: str,
    affected_owner: str,
    resource_id: str = "",
    outcome: str = OUTCOME_SUCCESS,
    actor_kind: str = ACTOR_OWNER,
    source_service: str = "api",
    request_id: str = "",
    metadata: Optional[dict] = None,
    occurred_at: Optional[datetime] = None,
    event_id: Optional[str] = None,
) -> AuditEvent:
    """Assemble a fully classified, metadata-filtered event from a producer's
    inputs. Pure — no I/O. The data class and retention come from the taxonomy,
    never from the caller, so a producer cannot mislabel a security event as
    ordinary activity.
    """
    if outcome not in OUTCOMES:
        outcome = OUTCOME_SUCCESS
    if actor_kind not in ACTOR_KINDS:
        actor_kind = ACTOR_OWNER
    spec = spec_for(action)
    return AuditEvent(
        event_id=event_id or ("ae2-" + uuid.uuid4().hex),
        schema_version=SCHEMA_VERSION,
        occurred_at=occurred_at or _now(),
        source_service=source_service,
        actor_principal=(actor_principal or "system").strip() or "system",
        actor_kind=actor_kind,
        affected_owner=(affected_owner or actor_principal or "system").strip() or "system",
        action=action,
        resource_type=spec.resource,
        resource_id=(resource_id or "")[:200],
        outcome=outcome,
        data_class=spec.data_class,
        retention_class=spec.retention,
        request_id=(request_id or "")[:80],
        metadata=filter_metadata(action, metadata),
    )


# ── Transactional outbox ────────────────────────────────────────────────
# Two tables:
#   audit_outbox     — write-ahead rows enqueued on the producer's own
#                      connection, so the event commits with the business
#                      change. The worker drains these into the read model.
#   audit_events_v2  — the append-only central read model the UI queries.
#
# Both are created idempotently by main.init_db via `ensure_schema`.

DDL = [
    """
    CREATE TABLE IF NOT EXISTS audit_outbox (
        event_id       TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        occurred_at    TIMESTAMPTZ NOT NULL,
        source_service TEXT NOT NULL,
        actor_principal TEXT NOT NULL,
        actor_kind     TEXT NOT NULL,
        affected_owner TEXT NOT NULL,
        action         TEXT NOT NULL,
        resource_type  TEXT NOT NULL DEFAULT '',
        resource_id    TEXT NOT NULL DEFAULT '',
        outcome        TEXT NOT NULL,
        data_class     TEXT NOT NULL,
        retention_class TEXT NOT NULL,
        request_id     TEXT NOT NULL DEFAULT '',
        metadata       JSONB NOT NULL DEFAULT '{}',
        integrity_hash TEXT NOT NULL,
        state          TEXT NOT NULL DEFAULT 'pending',
        attempts       INTEGER NOT NULL DEFAULT 0,
        enqueued_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_error     TEXT NOT NULL DEFAULT ''
    )
    """,
    "CREATE INDEX IF NOT EXISTS audit_outbox_pending ON audit_outbox(state, enqueued_at)",
    """
    CREATE TABLE IF NOT EXISTS audit_events_v2 (
        event_id       TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        occurred_at    TIMESTAMPTZ NOT NULL,
        source_service TEXT NOT NULL,
        actor_principal TEXT NOT NULL,
        actor_kind     TEXT NOT NULL,
        affected_owner TEXT NOT NULL,
        action         TEXT NOT NULL,
        resource_type  TEXT NOT NULL DEFAULT '',
        resource_id    TEXT NOT NULL DEFAULT '',
        outcome        TEXT NOT NULL,
        data_class     TEXT NOT NULL,
        retention_class TEXT NOT NULL,
        request_id     TEXT NOT NULL DEFAULT '',
        metadata       JSONB NOT NULL DEFAULT '{}',
        integrity_hash TEXT NOT NULL,
        expires_at     TIMESTAMPTZ,
        recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        -- Tamper-evidence (AU-9). `seq` is a gapless position in the chain,
        -- `prev_hash` is the row_hash of seq-1, and `row_hash` binds this row's
        -- content to every row before it. Altering or removing ANY row breaks
        -- every hash after it, which `verify_chain` reports. A per-row hash
        -- alone (which is all the first cut had) proves nothing: whoever edits
        -- the row can recompute its own hash. The chain is what makes that
        -- useless without rewriting the entire tail.
        seq            BIGINT,
        prev_hash      TEXT NOT NULL DEFAULT '',
        row_hash       TEXT NOT NULL DEFAULT '',
        -- Set when this event's CONTENT was erased under a data-rights request
        -- while its position in the chain was kept. See `redact_owner`.
        redacted_at    TIMESTAMPTZ
    )
    """,
    # Existing deployments predate the chain columns.
    "ALTER TABLE audit_events_v2 ADD COLUMN IF NOT EXISTS seq BIGINT",
    "ALTER TABLE audit_events_v2 ADD COLUMN IF NOT EXISTS prev_hash TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE audit_events_v2 ADD COLUMN IF NOT EXISTS row_hash TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE audit_events_v2 ADD COLUMN IF NOT EXISTS redacted_at TIMESTAMPTZ",
    "CREATE UNIQUE INDEX IF NOT EXISTS audit_events_v2_seq ON audit_events_v2(seq)",
    # The owner view reads by affected_owner, newest first.
    "CREATE INDEX IF NOT EXISTS audit_events_v2_owner ON audit_events_v2(affected_owner, occurred_at DESC)",
    # The security view reads security-class events across owners.
    "CREATE INDEX IF NOT EXISTS audit_events_v2_security ON audit_events_v2(data_class, occurred_at DESC)",
    # Retention sweep reads by expiry.
    "CREATE INDEX IF NOT EXISTS audit_events_v2_expiry ON audit_events_v2(expires_at)",
    # ── The chain head ──────────────────────────────────────────────────
    # One row, ever. Appending locks it FOR UPDATE, which serializes chain
    # writes: without that, two workers (or two API replicas) could read the
    # same prev_hash and both claim seq N, forking the chain into two branches
    # that no verifier could reconcile. Audit volume is low enough that one
    # short row lock per event costs nothing.
    """
    CREATE TABLE IF NOT EXISTS audit_chain_head (
        id        INTEGER PRIMARY KEY DEFAULT 1,
        seq       BIGINT NOT NULL DEFAULT 0,
        head_hash TEXT NOT NULL DEFAULT '',
        CONSTRAINT audit_chain_head_single CHECK (id = 1)
    )
    """,
    "INSERT INTO audit_chain_head (id, seq, head_hash) VALUES (1, 0, '') ON CONFLICT (id) DO NOTHING",
    # ── Append-only enforcement ─────────────────────────────────────────
    # An UPDATE to a recorded audit row is never legitimate, so it is refused
    # unconditionally. A DELETE, and the content-clearing UPDATE a redaction
    # performs, are legitimate only from two reviewed paths — the retention
    # sweep and an approved account erasure — and a path proves itself TWICE:
    #
    #   1. it announces itself with `pattadar.audit_maintenance`, a SET LOCAL
    #      that scopes the permission to one transaction rather than leaking
    #      onto a pooled connection, and
    #   2. it connects as a member of `pattadar_audit_maintainer`, the role
    #      `ROLE_BOOTSTRAP_SQL` creates and deliberately does NOT grant to the
    #      application login.
    #
    # The announcement alone was the whole gate once, and the application role
    # can issue it — so it recorded intent without constraining anyone holding
    # the app's credentials. The role is the half the application cannot grant
    # itself. Until that role exists (local development, and any deployment
    # before the bootstrap is applied) the announcement still stands on its own,
    # so this fails OPEN on an unprovisioned database and CLOSED once the
    # boundary is there.
    #
    # HONEST LIMIT: a trigger is not a privilege boundary. Whoever holds DDL
    # rights can drop it. The deployment-level control is the grant set in
    # `ROLE_BOOTSTRAP_SQL`: the writer role holds INSERT and nothing else, and
    # the application login holds no UPDATE or DELETE on the trail at all.
    """
    CREATE OR REPLACE FUNCTION audit_events_v2_append_only() RETURNS trigger AS $audit$
    DECLARE
        reviewed BOOLEAN;
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pattadar_audit_maintainer') THEN
            reviewed := pg_has_role(current_user, 'pattadar_audit_maintainer', 'USAGE');
        ELSE
            reviewed := true;
        END IF;
        IF reviewed AND coalesce(current_setting('pattadar.audit_maintenance', true), '') = 'on' THEN
            -- A reviewed path: redaction under a data-rights request, or an
            -- approved retention/archive truncation.
            IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
            -- Even here the chain columns are untouchable — redaction removes
            -- CONTENT, never a row's position or its seal.
            IF NEW.seq IS DISTINCT FROM OLD.seq
                    OR NEW.prev_hash <> OLD.prev_hash
                    OR NEW.row_hash <> OLD.row_hash
                    OR NEW.integrity_hash <> OLD.integrity_hash THEN
                RAISE EXCEPTION 'audit_events_v2: the chain columns of a recorded event can never be rewritten';
            END IF;
            -- A row already redacted has no content left to clear, so any
            -- further change to it is a rewrite dressed as a redaction.
            IF OLD.redacted_at IS NOT NULL THEN
                RAISE EXCEPTION 'audit_events_v2: a redacted event is final and cannot be modified again';
            END IF;
            -- What the event RECORDS — when it happened, which action, which
            -- outcome, when it expires — is as immutable as the seal. Only the
            -- columns a redaction clears may differ, or a rewrite could hide
            -- behind `redacted_at`, which the verifier is obliged to excuse.
            IF NEW.event_id <> OLD.event_id
                    OR NEW.schema_version <> OLD.schema_version
                    OR NEW.occurred_at <> OLD.occurred_at
                    OR NEW.source_service <> OLD.source_service
                    OR NEW.actor_kind <> OLD.actor_kind
                    OR NEW.action <> OLD.action
                    OR NEW.resource_type <> OLD.resource_type
                    OR NEW.outcome <> OLD.outcome
                    OR NEW.data_class <> OLD.data_class
                    OR NEW.retention_class <> OLD.retention_class
                    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
                    OR NEW.recorded_at IS DISTINCT FROM OLD.recorded_at THEN
                RAISE EXCEPTION 'audit_events_v2: a redaction may only clear an event''s content, never rewrite what it records';
            END IF;
            RETURN NEW;
        END IF;
        IF TG_OP = 'UPDATE' THEN
            RAISE EXCEPTION 'audit_events_v2 is append-only: a recorded event cannot be modified';
        END IF;
        RAISE EXCEPTION 'audit_events_v2 rows may only be removed by the reviewed retention or erasure path';
    END;
    $audit$ LANGUAGE plpgsql
    """,
    "DROP TRIGGER IF EXISTS audit_events_v2_guard ON audit_events_v2",
    """
    CREATE TRIGGER audit_events_v2_guard
        BEFORE UPDATE OR DELETE ON audit_events_v2
        FOR EACH ROW EXECUTE FUNCTION audit_events_v2_append_only()
    """,
]

# The session flag the reviewed maintenance paths set before deleting.
MAINTENANCE_ON = "SET LOCAL pattadar.audit_maintenance = 'on'"


# ── The privilege boundary (AU-9) ───────────────────────────────────────
# Two database roles, because the application must not be the thing that can
# rewrite the record of what the application did:
#
#   pattadar_audit_writer      INSERT on the trail and full use of the outbox
#                              queue. This is all the API ever needs: it
#                              appends events and never edits one.
#   pattadar_audit_maintainer  the ONLY role the append-only trigger accepts a
#                              redaction or a retention delete from. Granted to
#                              the operator identity that runs the erasure and
#                              retention jobs, never to the application login.
#
# Applying this is a database-owner action: the application's own login cannot
# be trusted to provision the boundary that constrains it, and a revoke that
# lands before the erasure runner has somewhere to connect from would break a
# data-rights request. So `ensure_schema` deliberately does NOT run it — it is
# an infrastructure change, run once as the database owner:
#
#   psql "$ADMIN_PG_DSN" -v ON_ERROR_STOP=1 -c "$(python - <<'PY'
#   from src import audit; print(audit.role_bootstrap_sql("pattadar_app"))
#   PY
#   )"
#
# Until it is applied the trigger's role check fails open, so an unprovisioned
# database (local development, a partly rolled-out deployment) keeps working.

AUDIT_WRITER_ROLE = "pattadar_audit_writer"
AUDIT_MAINTAINER_ROLE = "pattadar_audit_maintainer"


def role_bootstrap_sql(app_role: str) -> str:
    """The one-time grant set that makes the audit trail append-only for real.

    `app_role` is the login the API connects as. It keeps INSERT (through
    membership in the writer role) and loses every way to change a recorded
    event; the maintainer role is created but deliberately left ungranted, so
    somebody has to hand it out on purpose.
    """
    role = (app_role or "").strip()
    if not role.replace("_", "").isalnum():
        raise ValueError("app_role must be a plain SQL identifier")
    return "\n".join([
        "DO $bootstrap$ BEGIN",
        f"    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{AUDIT_WRITER_ROLE}') THEN",
        f"        CREATE ROLE {AUDIT_WRITER_ROLE} NOLOGIN;",
        "    END IF;",
        f"    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{AUDIT_MAINTAINER_ROLE}') THEN",
        f"        CREATE ROLE {AUDIT_MAINTAINER_ROLE} NOLOGIN;",
        "    END IF;",
        "END $bootstrap$;",
        # The outbox is a queue, not evidence: the writer drains it, which means
        # updating attempt counts and deleting drained rows.
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON audit_outbox TO {AUDIT_WRITER_ROLE};",
        f"GRANT SELECT, UPDATE ON audit_chain_head TO {AUDIT_WRITER_ROLE};",
        f"GRANT SELECT, INSERT ON audit_events_v2 TO {AUDIT_WRITER_ROLE};",
        f"GRANT {AUDIT_WRITER_ROLE} TO {role};",
        f"GRANT SELECT, UPDATE, DELETE ON audit_events_v2 TO {AUDIT_MAINTAINER_ROLE};",
        # The point of the whole file: after this the application login can
        # append an event and read the trail, and nothing else.
        f"REVOKE UPDATE, DELETE, TRUNCATE ON audit_events_v2 FROM {role};",
    ])


# ── The auditor role (separation of duties) ─────────────────────────────
# An external reviewer — a regulator's agent, a SOC 2 auditor — must be able to
# read the trail WITHOUT being the platform admin, because the platform admin
# writes records, administers the desk and is themselves a data subject. One
# identity holding both roles is the separation-of-duties finding that sinks an
# audit.
#
# This role can do exactly one thing: read. It cannot write a record, cannot
# reach any owner's documents, and its own reads are themselves audited, so
# "what did the auditor look at" is answerable too.
#
# Deliberately an environment allowlist and not a database row: granting audit
# access is a governance act that should require a reviewed deploy, not a
# settings toggle somebody can flip at runtime. Empty means nobody, and that is
# the correct default — an unset allowlist is not permission for everyone.

def auditor_uids() -> set:
    import os
    return {p.strip() for p in os.getenv("AUDIT_READER_UIDS", "").split(",") if p.strip()}


def is_auditor(uid: str) -> bool:
    who = (uid or "").strip()
    return bool(who) and who in auditor_uids()


async def redact_owner(conn, owner: str, request_id: str = "") -> int:
    """Erase one owner's event CONTENT while leaving the chain intact.

    This is how a DPDP/GDPR erasure and the audit trail stop contradicting each
    other. Deleting the owner's rows outright — which is what the first cut did
    — punches holes in the middle of the chain, and a hole is indistinguishable
    from tampering: the verifier cannot tell an approved erasure from somebody
    quietly removing the evidence of what they did.

    So the row stays and its content goes. `integrity_hash` was computed over
    the original content and is preserved: it is a commitment to what the event
    said WITHOUT disclosing it, which is exactly the property wanted here. The
    chain still verifies, the personal data is genuinely gone, and the row
    carries `redacted_at` so the redaction is itself visible rather than looking
    like a record that was always empty.

    Returns the number of events redacted. Caller must already hold approval —
    this is only ever reached from the reviewed erasure runner.
    """
    async with conn.transaction():
        await conn.execute(MAINTENANCE_ON)
        cur = await conn.execute(
            "UPDATE audit_events_v2 SET"
            "   actor_principal = 'erased',"
            "   affected_owner = 'erased',"
            "   resource_id = '',"
            "   request_id = %s,"
            "   metadata = '{}'::jsonb,"
            "   redacted_at = now()"
            " WHERE affected_owner = %s AND redacted_at IS NULL",
            (request_id or "", owner))
        return cur.rowcount or 0


def chain_hash(prev_hash: str, integrity: str, seq: int) -> str:
    """One link. Binds this row's content hash to the whole prior chain.

    Deterministic and separator-delimited so no two different (prev, content,
    seq) triples can produce the same preimage by concatenation."""
    payload = json.dumps([prev_hash, integrity, seq], ensure_ascii=True,
                         separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()


def integrity_of_row(row) -> str:
    """Recompute a stored row's content hash FROM ITS CURRENT CONTENT.

    This is the link the first cut was missing, and it mattered: `row_hash` is
    derived from the STORED `integrity_hash`, so editing a row's content while
    leaving its `integrity_hash` alone left the chain verifying perfectly and
    the forgery invisible. Recomputing from content is what makes the seal
    actually cover the event.

    `occurred_at` is normalized to UTC before formatting: psycopg hands back a
    timestamptz in the session's zone, and the same instant rendered as
    `-07:00` instead of `+00:00` would hash differently and report every row as
    forged.
    """
    occurred = row["occurred_at"]
    if occurred.tzinfo is not None:
        occurred = occurred.astimezone(timezone.utc)
    payload = json.dumps([
        row["event_id"], int(row["schema_version"]), occurred.isoformat(),
        row["source_service"], row["actor_principal"], row["actor_kind"],
        row["affected_owner"], row["action"], row["resource_type"],
        row["resource_id"], row["outcome"], row["data_class"],
        row["retention_class"], row["request_id"],
        json.dumps(row["metadata"] or {}, sort_keys=True, ensure_ascii=True),
    ], ensure_ascii=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()

_OUTBOX_COLUMNS = (
    "event_id, schema_version, occurred_at, source_service, actor_principal, "
    "actor_kind, affected_owner, action, resource_type, resource_id, outcome, "
    "data_class, retention_class, request_id, metadata, integrity_hash"
)


def _event_row(event: AuditEvent) -> tuple:
    return (
        event.event_id, event.schema_version, event.occurred_at,
        event.source_service, event.actor_principal, event.actor_kind,
        event.affected_owner, event.action, event.resource_type,
        event.resource_id, event.outcome, event.data_class,
        event.retention_class, event.request_id, Jsonb(event.metadata),
        event.integrity_hash(),
    )


async def enqueue(conn, event: AuditEvent) -> None:
    """Write one event to the outbox on the CALLER's connection.

    Because it runs on the producer's connection, it commits inside the same
    transaction as the business change: either both land or neither does. This
    is the atomicity guarantee the old best-effort `log_audit` never had.

    Raises on failure. Non-critical producers wrap this so an audit-table
    outage degrades to a logged warning rather than a failed user action;
    critical producers let it propagate (fail closed).

    The insert runs inside a nested transaction (SAVEPOINT when the caller is
    already in a transaction, a plain transaction otherwise). This is what makes
    the non-critical fail-open in `record` actually safe: in PostgreSQL a failed
    statement aborts the whole surrounding transaction, so without a savepoint a
    swallowed enqueue error would poison the caller's business transaction and
    every later statement in it would fail. With the savepoint, a failed enqueue
    rolls back only itself and the caller's transaction stays usable.
    """
    async with conn.transaction():
        await conn.execute(
            f"INSERT INTO audit_outbox ({_OUTBOX_COLUMNS}) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
            "ON CONFLICT (event_id) DO NOTHING",
            _event_row(event),
        )


async def record(
    conn,
    *,
    action: str,
    actor_principal: str,
    affected_owner: str,
    resource_id: str = "",
    outcome: str = OUTCOME_SUCCESS,
    actor_kind: str = ACTOR_OWNER,
    source_service: str = "api",
    request_id: str = "",
    metadata: Optional[dict] = None,
) -> None:
    """Build and enqueue an event in one call, honoring the fail-closed policy.

    For a non-critical action a failure is swallowed (logged) so a legitimate
    business write is never blocked by the audit subsystem. For a critical
    action the exception propagates: the caller's transaction rolls back and
    the sensitive operation does not complete without its audit record.
    """
    event = build_event(
        action=action, actor_principal=actor_principal,
        affected_owner=affected_owner, resource_id=resource_id, outcome=outcome,
        actor_kind=actor_kind, source_service=source_service,
        request_id=request_id, metadata=metadata,
    )
    try:
        await enqueue(conn, event)
    except Exception as exc:  # noqa: BLE001
        if is_critical_action(action):
            log.error("audit.enqueue_failed for critical action %s: %r", action, exc)
            raise
        # Counted, not just logged: a dropped event is audit loss, and AU-5
        # wants it observable rather than buried in a log nobody greps.
        note_dropped_event()
        log.warning("audit.enqueue_failed (dropped, non-critical) %s: %r", action, exc)


# ── Worker: drain the outbox into the read model ────────────────────────

async def run_one() -> bool:
    """Move one pending outbox row into `audit_events_v2`, appending it to the
    hash chain. Returns False when the outbox is empty.

    Two locks, in a fixed order, both inside one transaction:
      1. the outbox row (FOR UPDATE SKIP LOCKED) so two workers never process
         the same event;
      2. the chain head (FOR UPDATE) so two workers never claim the same `seq`
         and fork the chain.
    Taking them in this order everywhere is what keeps concurrent workers from
    deadlocking against each other.
    """
    async with _pool.connection() as conn, conn.transaction():
        row = await (await conn.execute(
            "SELECT * FROM audit_outbox WHERE state='pending' "
            "ORDER BY enqueued_at FOR UPDATE SKIP LOCKED LIMIT 1"
        )).fetchone()
        if not row:
            return False
        days = RETENTION_DAYS.get(row["retention_class"], RETENTION_DAYS[DEFAULT_RETENTION])
        try:
            # Serialize the chain append. Every writer waits here, so `seq` is
            # gapless and `prev_hash` always names the row actually before it.
            head = await (await conn.execute(
                "SELECT seq, head_hash FROM audit_chain_head WHERE id=1 FOR UPDATE"
            )).fetchone()
            seq = int(head["seq"]) + 1
            prev_hash = head["head_hash"] or ""
            row_hash = chain_hash(prev_hash, row["integrity_hash"], seq)
            # Idempotent by PRIMARY KEY: a row reprocessed after a crash between
            # the insert and the delete simply conflicts and is dropped.
            cur = await conn.execute(
                f"INSERT INTO audit_events_v2 ({_OUTBOX_COLUMNS}, expires_at, seq, prev_hash, row_hash) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,"
                "  now() + (%s * interval '1 day'), %s,%s,%s) "
                "ON CONFLICT (event_id) DO NOTHING",
                (
                    row["event_id"], row["schema_version"], row["occurred_at"],
                    row["source_service"], row["actor_principal"], row["actor_kind"],
                    row["affected_owner"], row["action"], row["resource_type"],
                    row["resource_id"], row["outcome"], row["data_class"],
                    row["retention_class"], row["request_id"], Jsonb(row["metadata"]),
                    row["integrity_hash"], days, seq, prev_hash, row_hash,
                ),
            )
            # Only advance the head if this event was genuinely appended. A
            # duplicate replay inserts nothing and must not burn a seq, or the
            # chain would contain a gap the verifier reports as a deletion.
            if cur.rowcount == 1:
                await conn.execute(
                    "UPDATE audit_chain_head SET seq=%s, head_hash=%s WHERE id=1",
                    (seq, row_hash))
            await conn.execute("DELETE FROM audit_outbox WHERE event_id=%s", (row["event_id"],))
        except Exception as exc:  # noqa: BLE001
            # Leave the row pending with an incremented attempt count and the
            # error type only (never the message — it could carry identifiers).
            await conn.execute(
                "UPDATE audit_outbox SET attempts=attempts+1, last_error=%s WHERE event_id=%s",
                (type(exc).__name__, row["event_id"]))
            raise
    return True


# ── Verification (AU-9) ─────────────────────────────────────────────────

# The two principals a reviewed redaction writes in place of the erased ones.
# Anything else in a redacted row's actor is new content, not cleared content.
_REDACTION_PRINCIPALS = ("erased", "expired")


def is_redaction_shape(row) -> bool:
    """Does this redacted row look like content that was CLEARED?

    A redaction is the one content change `verify_chain` is obliged to excuse,
    so what it may leave behind has to be pinned down: the reviewed paths write
    a fixed principal and empty everything else. A row carrying `redacted_at`
    and some other content is a rewrite wearing a redaction's clothes.
    """
    who = row["actor_principal"]
    return (who in _REDACTION_PRINCIPALS
            and row["affected_owner"] == who
            and not (row["resource_id"] or "")
            and not (row["metadata"] or {}))


async def _reviewed_redaction_ids(conn) -> Optional[set]:
    """Request ids the reviewed erasure runs recorded for themselves.

    None when this database carries no erasure run log at all, which is not the
    same as an empty one: with nothing to reconcile against, a redaction that
    names a request id is as far as verification can get.
    """
    ids: set = set()
    logged = False
    for table, column in (("account_erasure_jobs", "id"),
                          ("account_retained_audits", "request_id")):
        found = await (await conn.execute(
            "SELECT to_regclass(%s) AS t", ("public." + table,))).fetchone()
        if not found or not found["t"]:
            continue
        logged = True
        rows = await (await conn.execute(
            f"SELECT DISTINCT {column} AS request_id FROM {table}")).fetchall()
        ids |= {(r["request_id"] or "").strip() for r in rows}
    return ids if logged else None


async def _unexplained_redactions(conn, rows) -> list:
    """The seqs of redacted events that no reviewed run accounts for.

    Redaction is the gap in the seal — `integrity_hash` no longer describes the
    row, by design — so a redaction nobody ordered is how content gets rewritten
    without the chain noticing. Each one therefore has to answer for itself: the
    retention sweep answers with the row's own expiry, and an erasure answers
    with the job id it stamped into `request_id`. Neither is content an attacker
    can supply without also writing to the erasure job log.
    """
    if not rows:
        return []
    reviewed = await _reviewed_redaction_ids(conn)
    now = _now()
    unexplained = []
    for r in rows:
        if r["actor_principal"] == "expired":
            expires = r["expires_at"]
            if expires is not None and expires <= now:
                continue
        else:
            request_id = (r["request_id"] or "").strip()
            if request_id and (reviewed is None or request_id in reviewed):
                continue
        unexplained.append(int(r["seq"]))
    return unexplained


async def verify_chain(conn, limit: int = 0, from_seq: int = 0,
                       prev_hash: Optional[str] = None) -> dict:
    """Walk the chain in order and recompute every link.

    Returns a verdict an operator (or an auditor) can act on: how many events
    were checked, whether the chain is intact, and — when it is not — the exact
    seq where it first breaks and why. A break means a row was altered,
    removed, or inserted out of band since it was recorded.

    Read-only. `limit` caps the walk for a quick check; 0 walks everything.
    `from_seq` starts the walk further in, so a caller that already verified the
    earlier events pays only for what is new (see `verify_recent`), and
    `prev_hash` is the row_hash it verified last: passing it links the window to
    that history instead of letting the window's own first row vouch for itself.
    """
    sql = "SELECT * FROM audit_events_v2 WHERE seq IS NOT NULL"
    params: tuple = ()
    if from_seq:
        sql += " AND seq >= %s"
        params = (int(from_seq),)
    sql += " ORDER BY seq"
    if limit:
        sql += f" LIMIT {int(limit)}"
    rows = await (await conn.execute(sql, params or None)).fetchall()
    if not rows:
        return {"ok": True, "checked": 0, "broken_at": None, "reason": "",
                "truncated_prefix": 0, "first_seq": None, "last_seq": None,
                "last_hash": "", "redacted": 0, "unexplained_redactions": []}

    # A gap at the START is expected and legitimate: the retention sweep expires
    # the oldest events, and an approved erasure removes an owner's. A gap in the
    # MIDDLE is not explainable that way — that is an event removed from history.
    # So the walk anchors on the first event still present rather than insisting
    # the chain begins at 1, and reports how much prefix is missing so an auditor
    # can reconcile it against the retention log. A windowed walk says nothing
    # about the prefix it deliberately skipped.
    first_seq = int(rows[0]["seq"])
    truncated_prefix = 0 if from_seq else first_seq - 1

    def broken(seq, reason, checked, unexplained=()) -> dict:
        return {"ok": False, "checked": checked, "broken_at": seq,
                "reason": reason, "truncated_prefix": truncated_prefix,
                "first_seq": first_seq, "last_seq": None, "last_hash": "",
                "redacted": 0, "unexplained_redactions": list(unexplained)}

    # Resuming from a verified position: the window MUST start exactly where
    # that position left off, or the events in between are gone.
    if prev_hash is not None and first_seq != int(from_seq):
        return broken(int(from_seq),
                      f"the chain resumes at {first_seq} instead of {int(from_seq)} "
                      "— events after the last verified one were removed", 0)
    expected_seq = first_seq
    # The first surviving row's predecessor may be gone, so its prev_hash cannot
    # be compared to anything — but its own row_hash still must match its stored
    # prev_hash plus its content, so the row itself is still verified.
    expected_prev = (rows[0]["prev_hash"] or "") if prev_hash is None else prev_hash
    checked = 0
    redacted_rows = []
    for r in rows:
        seq = int(r["seq"])
        if seq != expected_seq:
            return broken(seq, f"sequence gap inside the chain: expected {expected_seq}, "
                               f"found {seq} — an event was removed from history", checked)
        if (r["prev_hash"] or "") != expected_prev:
            return broken(seq, "prev_hash does not match the previous row's hash "
                               "— the chain was re-linked", checked)
        if chain_hash(expected_prev, r["integrity_hash"], seq) != (r["row_hash"] or ""):
            return broken(seq, "row_hash does not match this row's seal "
                               "— the chain was rewritten at this event", checked)
        # Does the CONTENT still match the hash that was sealed into the chain?
        # A redacted row is the one legitimate mismatch: its content was erased
        # on purpose and `integrity_hash` is kept as a commitment to what the
        # event said, so it is skipped here while its links are still verified.
        if r["redacted_at"] is None:
            if integrity_of_row(r) != r["integrity_hash"]:
                return broken(seq, "this event's content does not match the hash sealed "
                                   "into the chain — it was modified after it was recorded",
                              checked)
        elif not is_redaction_shape(r):
            return broken(seq, "this event carries a redaction but still carries content "
                               "— it was rewritten, not cleared", checked)
        else:
            redacted_rows.append(r)
        expected_prev = r["row_hash"]
        expected_seq = seq + 1
        checked += 1

    last_seq = int(rows[-1]["seq"])
    # The head must seal the last surviving row. If it names a LATER seq, events
    # were removed from the end — the one truncation retention cannot explain,
    # because retention only ever expires the oldest. A `limit` walk stops short
    # of the end on purpose, so it cannot make that comparison.
    head = await (await conn.execute(
        "SELECT seq, head_hash FROM audit_chain_head WHERE id=1")).fetchone()
    if not limit and head:
        head_seq = int(head["seq"])
        if head_seq > last_seq:
            return broken(last_seq + 1,
                          f"chain head names event {head_seq} but the trail ends at "
                          f"{last_seq} — events were removed from the end", checked)
        if head_seq == last_seq and (head["head_hash"] or "") != (rows[-1]["row_hash"] or ""):
            return broken(last_seq, "the chain head does not seal the last recorded event "
                                    "— the end of the trail was rewritten", checked)
    # `ok` is about the LINKS. A redaction leaves them intact by design, so a
    # redaction nobody ordered is reported on its own terms rather than as a
    # broken chain: the seqs are listed so an auditor can go and ask about each
    # one, and `health` refuses to call the pipeline healthy while any stands.
    unexplained = await _unexplained_redactions(conn, redacted_rows)
    return {"ok": True, "checked": checked, "broken_at": None, "reason": "",
            # How many events are gone from the front. Nonzero is only honest if
            # it matches a logged retention/erasure run.
            "truncated_prefix": truncated_prefix,
            "first_seq": first_seq, "last_seq": last_seq,
            "last_hash": rows[-1]["row_hash"] or "",
            "redacted": len(redacted_rows),
            "unexplained_redactions": unexplained[:20]}


# How much of the tail one poll re-verifies when it has nothing to resume from
# (a freshly started process). Everything older was either verified by an
# earlier poll or belongs to the operator's full walk in
# services/api/scripts/verify_audit_chain.py.
HEALTH_TAIL_EVENTS = 200

# The furthest position this process has verified and the row_hash it saw
# there. Polling resumes from here, so a health check costs the events appended
# since the last one rather than the whole trail, which only ever grows.
_verified_through: dict = {"seq": 0, "hash": ""}


async def verify_recent(conn, tail: int = HEALTH_TAIL_EVENTS) -> dict:
    """Verify what has not been verified yet, anchored on the chain head.

    The full walk is O(n) over a table that only grows, so anything that POLLS
    it — an alarm on `health` — ends up loading the entire trail into one API
    process on every poll, and the monitoring path is then the first thing to
    fall over: precisely when the trail most needs watching. This verifies the
    events appended since the last successful check (the newest `tail` on a
    cold process) and confirms the stored head still seals the last of them,
    which is what makes a window tamper-evident rather than merely recent.

    The checkpoint is re-proved before it is trusted: the row it names must
    still carry the hash it recorded. A rewritten or truncated tail invalidates
    it and the check falls back to the window, so a stale checkpoint can never
    vouch for history it can no longer see.
    """
    head = await (await conn.execute(
        "SELECT seq, head_hash FROM audit_chain_head WHERE id=1")).fetchone()
    head_seq = int(head["seq"]) if head else 0
    mark = dict(_verified_through)
    from_seq, prev = 0, None
    if mark["seq"] and mark["seq"] <= head_seq:
        anchor = await (await conn.execute(
            "SELECT row_hash FROM audit_events_v2 WHERE seq=%s", (mark["seq"],))).fetchone()
        if anchor and (anchor["row_hash"] or "") == mark["hash"]:
            from_seq, prev = mark["seq"] + 1, mark["hash"]
    if prev is None:
        _verified_through.update(seq=0, hash="")
        from_seq = max(head_seq - int(tail) + 1, 1)
    verdict = await verify_chain(conn, from_seq=from_seq, prev_hash=prev)
    verdict["from_seq"] = from_seq
    if not verdict["ok"]:
        return verdict
    if verdict["last_seq"] is not None:
        _verified_through.update(seq=verdict["last_seq"], hash=verdict["last_hash"])
    elif prev is not None:
        # Nothing new to walk, so the window proves nothing on its own — but the
        # head must still name the event this process verified last.
        if (head["head_hash"] or "") != prev:
            verdict.update(ok=False, broken_at=head_seq,
                           reason="the chain head no longer names the last verified event "
                                  "— the trail was rewritten behind the checkpoint")
    elif head_seq:
        # A cold process found nothing where the head says the newest events
        # are. The full walk would call an empty table intact — it has no
        # position to miss them from — so the window has to say it: every event
        # the head names is gone.
        verdict.update(ok=False, broken_at=head_seq,
                       reason=f"the chain head names event {head_seq} but no event at or "
                              f"after {from_seq} remains — the end of the trail was removed")
    return verdict


async def worker():
    import asyncio
    while True:
        try:
            if not await run_one():
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("audit outbox worker error")
            await asyncio.sleep(2)


async def maintenance():
    """Retention sweep: delete events past their expiry. Runs slowly; the
    account-erasure runner handles owner-scoped removal separately."""
    import asyncio
    while True:
        try:
            async with _pool.connection() as conn, conn.transaction():
                # The append-only trigger refuses a DELETE that does not come
                # from a reviewed path. The retention sweep is one, and says so.
                # SET LOCAL scopes the permission to this transaction only, so
                # it cannot leak to any later statement on this pooled
                # connection. Expiring an event past its approved retention is
                # the ONE deletion the trail allows of itself.
                await conn.execute(MAINTENANCE_ON)
                # REDACT, never DELETE. Retention classes differ (a low-signal
                # event expires at 1 year, a security event at 3), so expiry
                # order is NOT chain order: deleting expired rows would punch
                # holes through the middle of the chain and every later
                # verification would report tampering that never happened.
                # Clearing the content keeps the seal and the sequence whole.
                cur = await conn.execute(
                    "UPDATE audit_events_v2 SET"
                    "   actor_principal = 'expired', affected_owner = 'expired',"
                    "   resource_id = '', metadata = '{}'::jsonb, redacted_at = now()"
                    " WHERE expires_at IS NOT NULL AND expires_at < now()"
                    "   AND redacted_at IS NULL")
                if cur.rowcount:
                    log.info("audit retention: cleared the content of %d event(s) past "
                             "their retention class; chain positions preserved",
                             cur.rowcount)

            # notification_log is not part of the chain, so it is an ordinary
            # DELETE on its own connection. It holds phone numbers, email
            # addresses and message bodies for people who may not be users at
            # all (invitees, guardians), and the published retention schedule
            # promises twelve months. Nothing enforced that until now.
            # created_at is TEXT holding an ISO-8601 UTC timestamp, so the
            # cutoff is built in the same shape and compared as text: every row
            # shares the format, and a text comparison uses idx_notiflog_created
            # where a cast would not.
            async with _pool.connection() as conn:
                cur = await conn.execute(
                    "DELETE FROM notification_log"
                    " WHERE created_at <> ''"
                    "   AND created_at < to_char(now() AT TIME ZONE 'UTC'"
                    "       - interval '12 months', 'YYYY-MM-DD\"T\"HH24:MI:SS')")
                if cur.rowcount:
                    log.info("notification retention: purged %d delivery record(s) "
                             "older than 12 months", cur.rowcount)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("audit retention sweep unavailable; retrying next interval")
        await asyncio.sleep(3600)


# ── Audit-failure visibility (AU-5) ─────────────────────────────────────
# The dangerous failure is the SILENT one: a worker that stopped draining, or a
# non-critical event dropped because its enqueue failed. Both were previously
# only a log line nobody reads. These counters and the health view make the
# failure observable, which is the whole requirement AU-5 states.

_dropped_events = 0


def note_dropped_event() -> None:
    global _dropped_events
    _dropped_events += 1


def dropped_event_count() -> int:
    return _dropped_events


async def health(conn) -> dict:
    """Operational state of the audit pipeline.

    `backlog` is events enqueued but not yet chained — a number that should sit
    near zero and NOT grow; a rising backlog means the drain has stalled and
    events are not yet tamper-protected. `stalled` flags outbox rows that have
    failed repeatedly. `dropped` counts non-critical events this process gave up
    on. `chain` is the verification verdict — incremental, because this is the
    endpoint something polls: it covers the events appended since the last poll
    plus the chain head, never the whole trail. The full walk is the operator's
    (services/api/scripts/verify_audit_chain.py).
    """
    row = await (await conn.execute(
        "SELECT count(*) AS backlog,"
        " count(*) FILTER (WHERE attempts >= 3) AS stalled,"
        " min(enqueued_at) AS oldest"
        " FROM audit_outbox WHERE state='pending'")).fetchone() or {}
    chain = await verify_recent(conn)
    backlog = int(row.get("backlog") or 0)
    stalled = int(row.get("stalled") or 0)
    return {
        "backlog": backlog,
        "stalled": stalled,
        "oldest_pending": str(row.get("oldest") or ""),
        "dropped_this_process": _dropped_events,
        "chain": chain,
        # One boolean an alarm can watch, so the alerting rule does not have to
        # encode this module's internals. A redaction the reviewed runs cannot
        # account for counts against it: the chain still links, but somebody
        # cleared an event's content outside the erasure and retention paths.
        "healthy": (bool(chain["ok"]) and not chain.get("unexplained_redactions")
                    and stalled == 0 and backlog < 1000),
    }


_pool = None


async def ensure_schema(conn) -> None:
    for statement in DDL:
        await conn.execute(statement)


def bind(pool) -> None:
    global _pool
    _pool = pool


import contextlib


@contextlib.asynccontextmanager
async def lifecycle(db_pool):
    """Register the pool, ensure schema, and run the drain + sweep tasks for the
    life of the app. Mirrors ai_reading.jobs.lifecycle."""
    import asyncio
    bind(db_pool)
    async with db_pool.connection() as conn:
        await ensure_schema(conn)
    tasks = [asyncio.create_task(worker()), asyncio.create_task(maintenance())]
    try:
        yield
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
