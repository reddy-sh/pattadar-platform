/** The owner's audit trail (W16 — the redrawn /app/audit).
 *
 *  This replaces the "Not yet redrawn" signpost. It reads the centralized
 *  audit trail (audit_events_v2) through `useAuditTrail`, which is scoped
 *  SERVER-SIDE by affected_owner — so it shows not only what the owner did but
 *  access to the owner's own data by an admin, a recipient or the system,
 *  which the old per-actor legacy view could never show.
 *
 *  Deliberately not a per-record history (that lives on each record's Audit
 *  tab) and not the admin/security view (that is a separate, fail-closed
 *  surface). No sample fallback: an empty trail is a truthful answer, and this
 *  is a compliance surface that must never paint fabricated rows.
 */
import { actionLabel, humanizeTokens, isSecurityAction } from '@pattadar/core';
import type { AuditEventV2 } from '@pattadar/core';

import { useAuditTrail } from '../../data/hooks';
import { fmtLocal } from '../../lib/format';
import { Empty, Loading, PageHead, Tag, plural } from '../ui';

/** Who acted, in words rather than a principal id. The owner's own actions are
 *  simply "You"; everything else names the kind of actor, because "an admin
 *  viewed this" and "you viewed this" are different facts to the owner. */
const ACTOR_KIND_LABEL: Record<string, string> = {
  owner: 'You',
  admin: 'Pattadar desk',
  system: 'System',
  recipient: 'A recipient',
};

function actorLabel(kind: string): string {
  return ACTOR_KIND_LABEL[kind] || 'Someone';
}

/** The allowlisted metadata, split into the record's NAME and everything else.
 *
 *  `label` is the subject of the line — which parcel, which flat — so it is
 *  pulled out and shown beside the action instead of being buried in a
 *  `key: value` list. A row that read "Removed a parcel" and made the reader
 *  guess which one was the whole reason this split exists. The rest stays a
 *  compact detail line; never raw JSON, and no assumed shape, because the
 *  server decides which keys an action carries. */
function splitMeta(metadata: string): { label: string; rest: string } {
  try {
    const obj = JSON.parse(metadata || '{}') as Record<string, unknown>;
    const label = typeof obj.label === 'string' ? obj.label : '';
    const rest = Object.entries(obj)
      .filter(([k, v]) => k !== 'label' && v !== '' && v !== null && v !== undefined)
      .map(([k, v]) => `${humanizeTokens(k)}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
      .join(' · ');
    return { label, rest };
  } catch {
    return { label: '', rest: '' };
  }
}

function Row({ e }: { e: AuditEventV2 }) {
  const { label, rest } = splitMeta(e.metadata);
  const security = isSecurityAction(e.action);
  const denied = e.outcome === 'denied' || e.outcome === 'failure';
  return (
    <div>
      <span className="grow">
        <strong style={{ fontSize: '0.9375rem' }}>{actionLabel(e.action)}</strong>
        {/* The record it happened to, on the headline — the answer to "which
            one?" belongs next to the verb, not in a detail line below it. */}
        {label && <span style={{ fontSize: '0.9375rem' }}> — {label}</span>}{' '}
        {security && <Tag alert>Security</Tag>}{security && ' '}
        {denied && <Tag alert>{e.outcome === 'denied' ? 'Denied' : 'Failed'}</Tag>}
        <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>
          {actorLabel(e.actorKind)}
          {e.resourceType ? ` · ${humanizeTokens(e.resourceType)}` : ''}
          {rest ? ` · ${rest}` : ''}
        </span>
      </span>
      <span className="note" style={{ textAlign: 'right', flex: 'none' }}>
        {fmtLocal(e.occurredAt)}
      </span>
    </div>
  );
}

export function Audit() {
  const { data, isLoading } = useAuditTrail();
  const events = data ?? [];
  return (
    <main>
      {/* The copy states ONLY what is actually captured and actually enforced.
          It previously promised "every link opened, every paper downloaded" and
          "nothing on this list can be edited or removed" — the first two are not
          recorded yet, and the third was a claim no control backed. Overstating
          an audit surface is worse than a modest one: it is the sentence an
          auditor quotes back at you. */}
      <PageHead eyebrow="Reference" title="Audit Log">
        <p className="lede" style={{ maxWidth: '46rem' }}>
          Changes to your records, papers filed and removed, your identity accessed, and links
          shared — with who did it and when. Access to your data by the Pattadar desk or the
          system shows here too.
        </p>
        <p className="note" style={{ maxWidth: '46rem', marginTop: '0.5rem' }}>
          Entries are appended, never edited: each one is sealed to the one before it, so a
          later change to this list can be detected. Sign-ins and file downloads are not recorded
          here yet.
        </p>
      </PageHead>
      {isLoading ? (
        <Loading h="12rem" />
      ) : events.length === 0 ? (
        <Empty boxed title="No activity recorded yet">
          As you add records, file papers, share links and update your details, each action is
          logged here with who did it and when.
        </Empty>
      ) : (
        <>
          <p className="note" style={{ margin: '0 0 var(--space-md)' }}>
            {plural(events.length, 'event')} · newest first
          </p>
          <div className="card" style={{ padding: 0 }}>
            <div className="rows boxed">
              {events.map((e) => (
                <Row key={e.id} e={e} />
              ))}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
