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
};

export function actionLabel(action: string): string {
  return (
    ACTION_LABELS[action] ||
    String(action || '')
      .replace(/_/g, ' ')
      .replace(/^\w/, (c) => c.toUpperCase())
  );
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
