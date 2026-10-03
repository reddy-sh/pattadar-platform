/**
 * Audit-event display helpers — ported verbatim from the web app
 * (apps/web/src/data/portfolio.ts actionLabel + apps/web/src/lib/format.ts
 * humanEntity) so both heads render identical activity copy.
 *
 * Rule: a raw UUID is NEVER user-facing copy. The audit trail itself is
 * append-only (compliance surface) — deletion events stay recorded; display
 * simply drops ids that mean nothing to a human.
 */

const ACTION_LABELS: Record<string, string> = {
  create_passbook: 'Created a passbook',
  delete_passbook: 'Deleted a passbook',
  create_parcel: 'Added a parcel',
  delete_parcel: 'Removed a parcel',
  update_parcel_geo: "Set a parcel's location",
  update_property_geo: "Set a property's location",
  add_note: 'Added a note',
  delete_note: 'Deleted a note',
  create_document: 'Added a document',
  upload_document: 'Uploaded a document',
  delete_document: 'Deleted a document',
  set_passbook_photo: 'Updated a passbook photo',
  create_beneficiary: 'Added a family member',
  delete_beneficiary: 'Removed a family member',
  create_invitation: 'Sent an invitation',
  send_notification: 'Sent a notification',
  // CL-557: "registered document" is a term of art at the sub-registrar's
  // office; to the person holding the phone these are all just documents.
  create_registered_document: 'Added a document',
  delete_registered_document: 'Deleted a document',
  reclassify_document: 'Changed a document type',
  create_property: 'Added a property',
  delete_property: 'Deleted a property',
  // Owners count properties; "record" is for the members of a holding
  // (design.md § App vocabulary).
  archive_record: 'Archived a property',
  tag_record: 'Tagged a property',
  create_group: 'Created a group',
  delete_group: 'Deleted a group',
  add_member: 'Added a member',
  remove_member: 'Removed a member',
  add_family_member: 'Added a family member',
  assign_land_to_group: 'Assigned land to a group',
  assign_property_to_group: 'Assigned a property to a group',
  add_beneficiary: 'Added a co-owner',
  verify_beneficiary: 'Verified a co-owner',
  send_invitation: 'Sent an invitation',
  invite_member: 'Invited a member',
  update_invitation_status: 'Updated an invitation',
  reveal_aadhaar: 'Viewed an Aadhaar number',
  link_aadhaar_card: 'Kept an Aadhaar card',
  apply_my_kyc: 'Updated your identity from Aadhaar',
  update_profile: 'Updated your profile',
  update_parcel: 'Updated a parcel',
  set_parcel_field: 'Updated a parcel field',
  set_stake: 'Changed a holding stake',
  set_notifiers: 'Changed who gets notified',
  record_mutation: 'Recorded a mutation',
  parcel_from_document: 'Created a parcel from a document',
  delete_notification: 'Dismissed a notification',
  add_parcel: 'Added a parcel',
  set_pin: 'Set a location',
  set_boundary: 'Saved a boundary',
  // W360 — what a property's own tabs write (services/api web360.py `_audit`).
  // The property's Activity tab and Account → Activity both word events from
  // this one table. Verb first, then "a"/"an" and the noun, so
  // countedActionLabel can count a burst ("Added 3 site features"); a label
  // with no article after the verb counts as "×3" instead.
  add_person: 'Added someone',
  update_person: "Edited someone's details",
  delete_person: 'Removed someone',
  add_owner: 'Added an owner',
  update_owner: 'Edited an owner',
  delete_owner: 'Removed an owner',
  add_transfer: 'Added a transfer',
  update_transfer: 'Edited a transfer',
  delete_transfer: 'Removed a transfer',
  add_transfer_party: 'Named someone on a transfer',
  update_transfer_party: 'Edited someone on a transfer',
  remove_transfer_party: 'Took someone off a transfer',
  link_transfer_prior: 'Linked transfers in the chain',
  add_feature: 'Added a site feature',
  update_feature: 'Edited a site feature',
  delete_feature: 'Removed a site feature',
  add_feature_cost: 'Recorded a site feature cost',
  add_expense: 'Recorded a cost',
  delete_expense: 'Removed a cost',
  add_paper: 'Filed a document',
  update_paper: 'Updated a document',
  delete_paper: 'Removed a document',
  add_photo: 'Added a photo',
  delete_photo: 'Removed a photo',
  set_cover_photo: 'Set the cover photo',
  add_purchase: 'Recorded a purchase',
  update_purchase: 'Corrected a purchase',
  delete_purchase: 'Removed a purchase',
  'record.corrected': 'Corrected a field',
  create_combined_property: 'Created a holding',
  update_combined_property: 'Edited a holding',
  delete_combined_property: 'Deleted a holding',
  set_combined_members: 'Changed the records in a holding',
  add_combined_expense: 'Recorded a holding cost',
  delete_combined_expense: 'Removed a holding cost',
  add_joint_fmb: 'Filed a joint FMB',
  // audit_events_v2 names its actions `area.verb`. Owners see "order", never
  // "ticket" or "job" (design.md, App vocabulary). Money verbs follow the
  // wallet's own words — Held, Released — and never say "paid" while online
  // payment is a stub.
  'service.batch_ordered': 'Ordered services',
  'service.batch_duplicate_blocked': 'Stopped a duplicate order',
  'service.duplicate_blocked': 'Stopped a duplicate order',
  'ticket.dispatched': 'Sent an order to a provider',
  'ticket.funded': 'Held money for an order',
  'ticket.accepted': 'Accepted the work on an order',
  'ticket.sent_back': 'Asked for changes on an order',
  'ticket.cancelled': 'Cancelled an order',
  'payment.captured': 'Payment received',
  'account.export': 'Exported your data',
  'account.erasure_requested': 'Asked to delete your account',
  'consent.updated': 'Updated your consent',
};

export function actionLabel(action: string): string {
  return (
    ACTION_LABELS[action] ||
    String(action || '')
      // `service.batch_ordered` must not reach the screen as "Service.batch
      // ordered": the dot is a separator like the underscore.
      .replace(/[_.]/g, ' ')
      .replace(/^\w/, (c) => c.toUpperCase())
  );
}

/**
 * CL-551: destructive actions read differently from everything else and must be
 * coloured as such wherever the feed appears — Home already did, the full log
 * did not. Derived from the verb so a new `delete_*` mutation is covered the
 * day it ships, rather than the day someone remembers to list it.
 */
export function isDestructiveAction(action: string): boolean {
  return /^(delete|remove|revoke)_/.test(String(action || ''));
}

/**
 * CL-526: reading someone's Aadhaar is a security event, not activity. It is
 * kept in the audit trail (it must be) but the general feed should not narrate
 * it beside "added a parcel".
 */
export function isSecurityAction(action: string): boolean {
  return action === 'reveal_aadhaar' || action === 'apply_my_kyc' || action === 'link_aadhaar_card';
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Human entity label for an audit row; '' when only ids are available. */
export function humanEntity(ref?: string | null, detail?: string | null): string {
  const d = (detail || '').trim();
  if (d && !UUID_RE.test(d)) return d;
  const r = (ref || '').trim();
  if (r && !UUID_RE.test(r)) return r;
  return '';
}

/**
 * CL-546: the log read "Delete registered document · Deleted registered
 * document" — the action label and the stored detail said the same thing twice.
 *
 * A detail earns its place only when it names the object. Words that merely
 * restate the action (or the schema's own vocabulary) do not, so a detail is
 * dropped when every one of its words is either already in the label or is one
 * of these generic terms. Anything specific — a name, a number, a survey id —
 * falls outside the list and survives, which is the point.
 */
/** Verb variants collapse so "Deleted" and "Delete" compare equal. */
function stemWords(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.replace(/(ed|d|s)$/, ''));
}

const GENERIC_DETAIL_WORDS = new Set(
  stemWords(
    `a an the to for from of in this was and
     registered record entry item profile identity
     document group property passbook parcel member note
     aadhaar invitation notification beneficiary co owner`,
  ),
);

/**
 * The object an audit row acted on, or '' when the row can only restate itself.
 * Prefer this over `humanEntity` for anything user-facing.
 */
/** `open_plot` → `Open plot`. Schema vocabulary is not user copy. */
export function humanizeTokens(text: string): string {
  return String(text ?? '').replace(/\b[a-z]+(?:_[a-z0-9]+)+\b/g, (t) => {
    const words = t.split('_');
    return words[0][0].toUpperCase() + words[0].slice(1) + ' ' + words.slice(1).join(' ');
  });
}

export function eventEntity(action: string, target?: string | null, details?: string | null): string {
  const raw = humanizeTokens(humanEntity(target, details));
  if (!raw) return '';
  const labelWords = new Set(stemWords(actionLabel(action)));
  const informative = stemWords(raw).some((w) => !labelWords.has(w) && !GENERIC_DETAIL_WORDS.has(w));
  return informative ? raw : '';
}

export interface AuditLike {
  actor: string;
  action: string;
  target: string;
  timestamp: string;
}

/** Home-feed noise: self-evident no-op events stay in the full audit log only. */
export const LOW_SIGNAL_ACTIONS = ['update_profile'];

/** Collapse consecutive identical (actor, action, target) events within a
 * 5-minute window into one row with a count (CL-8). Input newest-first. */
export function dedupeAuditEvents<T extends AuditLike>(
  events: T[],
  windowMs = 5 * 60_000,
): (T & { count: number })[] {
  const out: (T & { count: number })[] = [];
  for (const e of events) {
    const last = out[out.length - 1];
    if (
      last &&
      last.actor === e.actor &&
      last.action === e.action &&
      last.target === e.target &&
      Math.abs(new Date(last.timestamp).getTime() - new Date(e.timestamp).getTime()) <= windowMs
    ) {
      last.count += 1;
      last.timestamp = e.timestamp < last.timestamp ? last.timestamp : e.timestamp;
    } else {
      out.push({ ...e, count: 1 });
    }
  }
  return out;
}

/**
 * Audit timestamps are written by the API as `datetime.utcnow().isoformat()` —
 * UTC with NO zone marker. `new Date()` reads a bare timestamp as LOCAL time,
 * so every event appeared shifted by the viewer's offset: in Los Angeles, 7
 * hours in the future, which made everything read "just now" and pushed some
 * rows onto the wrong calendar day. Parse them as what they are.
 */
export function parseAuditTime(iso: string): Date {
  const s = String(iso ?? '').trim();
  if (!s) return new Date(NaN);
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(s);
  return new Date(zoned ? s : `${s}Z`);
}

/** "2h ago" / "Yesterday" / "3 Jul" (CL-10); absolute stays in the audit log. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const d = parseAuditTime(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mins = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/**
 * CL-549: the heading a row sits under in the full log — "Today", "Yesterday",
 * or a calendar date. Compared on local calendar days, not elapsed hours, so an
 * event at 23:50 does not sit under "Today" at 00:10 the next morning.
 */
export function dayHeading(iso: string, now: Date = new Date()): string {
  const d = parseAuditTime(iso);
  if (Number.isNaN(d.getTime())) return 'Earlier';
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

/** CL-125: collapse same-actor same-action bursts within the window even when
 * targets differ ("Deleted 2 documents"). Input newest-first. */
export function collapseAuditBursts<T extends AuditLike>(
  events: T[],
  windowMs = 5 * 60_000,
): (T & { count: number })[] {
  const out: (T & { count: number })[] = [];
  for (const e of events) {
    const last = out[out.length - 1];
    if (
      last &&
      last.actor === e.actor &&
      last.action === e.action &&
      Math.abs(new Date(last.timestamp).getTime() - new Date(e.timestamp).getTime()) <= windowMs
    ) {
      last.count += 1;
      if (last.target !== e.target) last.target = '';
    } else {
      out.push({ ...e, count: 1 });
    }
  }
  return out;
}

/** "Deleted a document" + count 3 → "Deleted 3 documents". */
export function countedActionLabel(action: string, count: number): string {
  const base = actionLabel(action);
  if (count <= 1) return base;
  const m = base.match(/^(\w+) (?:a|an) (.+)$/);
  if (!m) return `${base} ×${count}`;
  const noun = m[2];
  return `${m[1]} ${count} ${noun.endsWith('s') ? noun : `${noun}s`}`;
}
