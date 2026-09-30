/**
 * Invitations, drawn in the current design and mounted at /app/invitations.
 *
 * This replaces two things: the "still in the previous version" signpost
 * (w360/pages/Section.tsx, deleted) and the MUI screen it pointed at
 * (pages/InvitationsPage.tsx, deleted). /legacy/invitations redirects here.
 *
 * What changed on the way over, and why:
 *  - The send form picked a "Scope ID" by typing a raw id. It now picks from
 *    the owner's own land: a parcel, or the whole khata (passbook) it sits
 *    under. Those are the only two scopes `createInvitation` authorises
 *    (`_assert_owns_scope` checks passbooks and parcels), so the old
 *    "Document" option — which the server always refused — is gone, and so is
 *    built property, which has no passbook to scope to.
 *  - The expiry was silently defaulted to a fixed date. It is now a visible
 *    field, defaulted to 30 days out, and cannot be set in the past.
 *  - A failed read says so (`Failed`) instead of painting "No invitations
 *    yet" over an outage.
 *  - Sending is truthful: the server hashes the token, tries to deliver it and
 *    reports whether it left. When it did not (no provider configured) the
 *    owner is handed the link to share by hand. Only the invitee can accept
 *    (/i/:token); the owner can revoke, never mark accepted.
 */
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import AddOutlined from '@mui/icons-material/AddOutlined';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import WhatsApp from '@mui/icons-material/WhatsApp';

import { humanEntity } from '../../lib/format';
import { EMPTY_FILTER, useProperties } from '../api';
import type { RecordCard } from '../api';
import { Dialog } from '../Dialog';
import { useToast } from '../Toast';
import {
  useCreateInvitation,
  useDeleteInvitation,
  useInvitations,
  useSetInvitationStatus,
} from '../invitationsData';
import type { InvitationRow, NewInvitation, SentInvitation } from '../invitationsData';
import { Empty, Failed, Loading, Menu, PageHead, StatusChip, csvCell, ddmmyyyy, plural } from '../ui';

const ROLES: { key: string; label: string }[] = [
  { key: 'view', label: 'View' },
  { key: 'manage', label: 'Manage' },
];

/** How long an invitation stays open. A length, not a date picker: the
 *  browser's date field prints MM/DD in an en-US browser, and the app is
 *  DD/MM/YYYY everywhere. The resulting date is shown in that form. */
const DURATIONS = [7, 30, 90, 365];

/** The invitation's scope, in the owner's words. */
const SCOPE_WORD: Record<string, string> = {
  parcel: 'Parcel', passbook: 'Whole khata', beneficiary: 'Heir verification', family: 'Family record',
};
const roleWord = (k: string) => ROLES.find((r) => r.key === k)?.label ?? (k || '—');

const todayIso = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** The status a person should read. A pending invitation past its expiry is
 *  expired in every sense that matters to them, whatever the row says. */
function effectiveStatus(inv: InvitationRow): string {
  if (inv.status === 'pending' && inv.expiry && inv.expiry.slice(0, 10) < todayIso()) return 'expired';
  return inv.status || 'pending';
}

const STATUS: Record<string, { state: string; word: string }> = {
  pending: { state: 'warn', word: 'Pending' },
  accepted: { state: 'good', word: 'Accepted' },
  revoked: { state: 'bad', word: 'Revoked' },
  expired: { state: 'unknown', word: 'Expired' },
};

interface ScopeOption {
  value: string; // `${scopeType}:${scopeId}`
  scopeType: NewInvitation['scopeType'];
  scopeId: string;
  label: string;
}

/** What an invitation can be scoped to, from the owner's own land. */
function scopeOptions(cards: RecordCard[]): ScopeOption[] {
  const out: ScopeOption[] = [];
  const khatas = new Map<string, string>();
  for (const c of cards) {
    if (c.kind !== 'parcel') continue;
    out.push({
      value: `parcel:${c.id}`, scopeType: 'parcel', scopeId: c.id,
      label: [c.title, c.village].filter(Boolean).join(' · '),
    });
    if (c.passbookId && !khatas.has(c.passbookId)) {
      // A khata with no number on file is still named, by a parcel in it.
      khatas.set(c.passbookId, c.khataNo ? `Khata ${c.khataNo}` : `The khata holding ${c.title}`);
    }
  }
  for (const [id, word] of khatas) {
    out.push({ value: `passbook:${id}`, scopeType: 'passbook', scopeId: id, label: word });
  }
  return out;
}

export function Invitations() {
  const q = useInvitations();
  const land = useProperties(EMPTY_FILTER);
  const setStatus = useSetInvitationStatus();
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState<InvitationRow | null>(null);

  const rows = q.data ?? [];
  const options = useMemo(() => scopeOptions(land.data?.cards ?? []), [land.data]);
  const scopeName = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of options) m.set(o.scopeId, o.label);
    return m;
  }, [options]);
  const nameOf = (inv: InvitationRow) => scopeName.get(inv.scopeId)
    || (inv.scopeType === 'beneficiary' || inv.scopeType === 'family' ? 'Family and heirs' : humanEntity(inv.scopeId))
    || '—';
  const pending = rows.filter((r) => effectiveStatus(r) === 'pending').length;

  const [sent, setSent] = useState<(SentInvitation & { to: string }) | null>(null);

  const revoke = async (inv: InvitationRow) => {
    try {
      await setStatus.mutateAsync({ id: inv.id, status: 'revoked' });
      toast.ok(`The invitation to ${inv.inviteeContact} is revoked`);
    } catch {
      /* the write raised the toast */
    }
  };

  const download = () => {
    const head = ['Invitee', 'Access to', 'Scope', 'Scope ID', 'Role', 'Status', 'Expires', 'Sent'];
    const lines = rows.map((r) => [
      r.inviteeContact, nameOf(r), r.scopeType, r.scopeId, roleWord(r.role),
      STATUS[effectiveStatus(r)]?.word ?? r.status, ddmmyyyy(r.expiry), ddmmyyyy(r.createdAt),
    ].map(csvCell).join(','));
    const blob = new Blob(['\uFEFF' + [head.map(csvCell).join(','), ...lines].join('\n')],
      { type: 'text/csv;charset=utf-8' });
    // In the document, revoked a beat later — see RecordMoney's cost sheet.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pattadar-invitations-${todayIso()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <main>
      <PageHead
        title="Invitations"
        info="People you have invited to see or manage a parcel or a khata. An invitation ends when it is revoked, deleted or expires."
        actions={
          rows.length > 0 ? (
            <>
              <button type="button" className="btn" onClick={download}>
                <FileDownloadOutlined sx={{ fontSize: 16 }} aria-hidden /> Download CSV
              </button>
              <button type="button" className="btn primary" onClick={() => setSending(true)}>
                <AddOutlined sx={{ fontSize: 16 }} aria-hidden /> Invite someone
              </button>
            </>
          ) : undefined
        }
      >
        {rows.length > 0 && (
          <p className="note" style={{ margin: 0 }}>
            {pending ? `${plural(pending, 'invitation')} waiting for a response` : 'Nothing is waiting for a response'}
          </p>
        )}
      </PageHead>

      {q.isPending && <Loading h="16rem" what="your invitations" />}

      {q.isError && !q.data && (
        <Failed what="Your invitations" error={q.error} onRetry={() => q.refetch()} boxed h="16rem" />
      )}

      {q.data && rows.length === 0 && (
        <Empty
          boxed
          h="20rem"
          icon="person"
          title="No invitations yet"
          action={
            <button type="button" className="btn primary" onClick={() => setSending(true)}>
              <AddOutlined sx={{ fontSize: 16 }} aria-hidden /> Invite someone
            </button>
          }
        >
          Invite a family member or partner to see or manage one of your parcels.
        </Empty>
      )}

      {rows.length > 0 && (
        <div className="datatable-wrap">
          <div className="scroll-x">
            <table className="datatable static" style={{ minWidth: '44rem' }}>
              <thead>
                <tr>
                  <th>Invitee</th>
                  <th>Access to</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Expires</th>
                  <th>Sent</th>
                  <th className="menucol" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((inv) => {
                  const st = STATUS[effectiveStatus(inv)] ?? STATUS.pending;
                  const live = inv.status === 'pending' || inv.status === 'accepted';
                  return (
                    <tr key={inv.id}>
                      <td><strong style={{ overflowWrap: 'anywhere' }}>{inv.inviteeContact || '—'}</strong></td>
                      <td>
                        {nameOf(inv)}
                        <span className="note" style={{ display: 'block' }}>
                          {SCOPE_WORD[inv.scopeType] ?? inv.scopeType}
                        </span>
                      </td>
                      <td>{roleWord(inv.role)}</td>
                      <td>
                        <StatusChip state={st.state}>{st.word}</StatusChip>
                        {inv.status === 'pending' && inv.deliveryStatus === 'failed' && (
                          <span className="note" style={{ display: 'block' }}>Not delivered</span>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{inv.expiry ? ddmmyyyy(inv.expiry) : '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{inv.createdAt ? ddmmyyyy(inv.createdAt) : '—'}</td>
                      <td className="menucol">
                        <Menu
                          label={`Actions for the invitation to ${inv.inviteeContact}`}
                          header={inv.inviteeContact}
                          items={[
                            ...(live ? [{ label: 'Revoke', onClick: () => void revoke(inv) }] : []),
                            { label: 'Delete', danger: true, rule: live, onClick: () => setDeleting(inv) },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sending && (
        <SendDialog
          options={options}
          landLoading={land.isPending}
          landFailed={land.isError && !land.data}
          onClose={() => setSending(false)}
          onSent={(r) => { setSending(false); setSent(r); }}
        />
      )}
      {sent && <SentDialog sent={sent} onClose={() => setSent(null)} />}
      {deleting && <DeleteDialog inv={deleting} onClose={() => setDeleting(null)} />}
    </main>
  );
}

function SendDialog({ options, landLoading, landFailed, onClose, onSent }: {
  options: ScopeOption[]; landLoading: boolean; landFailed: boolean; onClose: () => void;
  onSent: (r: SentInvitation & { to: string }) => void;
}) {
  const create = useCreateInvitation();
  const [contact, setContact] = useState('');
  const [scope, setScope] = useState('');
  const [role, setRole] = useState('view');
  const [days, setDays] = useState(30);
  const expiry = inDays(days);
  const [err, setErr] = useState('');
  const busy = create.isPending;
  const picked = options.find((o) => o.value === scope) ?? options[0];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const who = contact.trim();
    const phone = who.replace(/[\s-]/g, '');
    if (!who) return setErr('Add a mobile number or an email address.');
    if (!/^\S+@\S+\.\S+$/.test(who) && !/^\+?\d{10,13}$/.test(phone)) {
      return setErr('That does not look like a mobile number or an email address.');
    }
    if (!picked) return setErr('Choose what they are being invited to.');
    setErr('');
    try {
      const r = await create.mutateAsync({
        scopeType: picked.scopeType, scopeId: picked.scopeId, role, inviteeContact: who, expiry,
      });
      onSent({ ...r, to: who });
    } catch {
      /* the write raised the toast; the typed work stays */
    }
  };

  return (
    <Dialog
      title="Invite someone"
      onClose={onClose}
      busy={busy}
      dismissable={false}
      initialFocus="#inv-contact"
      footer={
        <>
          <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" form="inv-send" className="btn primary" disabled={busy || !picked}>
            {busy ? 'Sending…' : 'Send invitation'}
          </button>
        </>
      }
    >
      <form id="inv-send" onSubmit={(e) => void submit(e)} style={{ display: 'grid', gap: 'var(--space-md)' }}>
        {err && <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{err}</p>}

        <div className="field">
          <label htmlFor="inv-contact">Mobile number or email</label>
          <input
            id="inv-contact" type="text" inputMode="email" autoComplete="off" maxLength={200}
            placeholder="98765 43210 or name@example.com"
            value={contact} onChange={(e) => setContact(e.target.value)}
          />
        </div>

        <div className="field">
          {/* A <label> so it wears the same small-caps style as the fields
              around it; it names the radiogroup, not an input. */}
          <label id="inv-scope-l">Invite them to</label>
          {landLoading ? (
            <p className="note" style={{ margin: 0 }}>Loading your land…</p>
          ) : landFailed ? (
            <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>
              Your land did not load. Close this and try again.
            </p>
          ) : options.length === 0 ? (
            <p className="note" style={{ margin: 0 }}>
              Add a parcel first. Invitations are to a parcel or to a whole khata.
            </p>
          ) : (
            // The app's own choice buttons, not a native <select>, whose popup
            // the OS draws in its own colours.
            <div className="choice" role="radiogroup" aria-labelledby="inv-scope-l"
                 style={{ maxHeight: '14rem', overflowY: 'auto' }}>
              {options.map((o) => (
                // aria-pressed is what `.choice` draws as selected; aria-checked
                // is what a radio announces. Both, or the pick is invisible.
                <button key={o.value} type="button" role="radio" aria-checked={picked?.value === o.value}
                        aria-pressed={picked?.value === o.value} onClick={() => setScope(o.value)}>
                  {o.label}
                  <small>{o.scopeType === 'passbook' ? 'Every parcel in this khata' : 'This parcel only'}</small>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="row" style={{ gap: 'var(--space-md)', alignItems: 'flex-start' }}>
          <div className="field grow">
            <label htmlFor="inv-role">Role</label>
            <select id="inv-role" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
          <div className="field grow">
            <label htmlFor="inv-expiry">Open for</label>
            <select id="inv-expiry" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {DURATIONS.map((d) => <option key={d} value={d}>{d === 365 ? '1 year' : `${d} days`}</option>)}
            </select>
            <span className="note">Until {ddmmyyyy(expiry)}</span>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

/** What happened when it was sent and, when nothing left the building, the
 *  link to share by hand. Shown once: the server keeps only the token's hash. */
function SentDialog({ sent, onClose }: { sent: SentInvitation & { to: string }; onClose: () => void }) {
  const toast = useToast();
  const link = `${window.location.origin}${sent.token}`;
  const delivered = sent.deliveryStatus === 'sent' || sent.deliveryStatus === 'logged';
  const copy = () => navigator.clipboard.writeText(link)
    .then(() => toast.ok('Link copied'))
    .catch(() => toast.bad('Could not copy the link. Select it and copy by hand.'));
  return (
    <Dialog
      title={delivered ? `Invitation sent to ${sent.to}` : 'Saved, but not sent'}
      onClose={onClose}
      footer={<button type="button" className="btn primary" onClick={onClose}>Done</button>}
    >
      <p className="note" style={{ marginTop: 0, maxWidth: '32rem' }}>
        {delivered
          ? 'They will get a link to accept. You can also share it yourself:'
          : `Pattadar could not deliver it to ${sent.to}. Share this link with them yourself. It is shown only now.`}
      </p>
      <p className="mono" style={{ overflowWrap: 'anywhere' }}>{link}</p>
      <div className="row tight">
        <button type="button" className="btn" onClick={copy}>
          <ContentCopyOutlined sx={{ fontSize: 16 }} aria-hidden /> Copy link
        </button>
        <a className="btn" target="_blank" rel="noopener noreferrer"
           href={`https://wa.me/?text=${encodeURIComponent(`You're invited to my land records on Pattadar: ${link}`)}`}>
          <WhatsApp sx={{ fontSize: 16 }} aria-hidden /> Share on WhatsApp
        </a>
      </div>
    </Dialog>
  );
}

function DeleteDialog({ inv, onClose }: { inv: InvitationRow; onClose: () => void }) {
  const del = useDeleteInvitation();
  const toast = useToast();
  const run = async () => {
    try {
      await del.mutateAsync({ id: inv.id });
      toast.ok('Invitation deleted');
      onClose();
    } catch {
      /* the write raised the toast; the dialog stays */
    }
  };
  return (
    <Dialog
      title="Delete this invitation?"
      onClose={onClose}
      busy={del.isPending}
      footer={
        <>
          <button type="button" className="btn" disabled={del.isPending} onClick={onClose}>Keep it</button>
          <button type="button" className="btn danger" disabled={del.isPending} onClick={() => void run()}>
            {del.isPending ? 'Deleting…' : 'Delete invitation'}
          </button>
        </>
      }
    >
      <p className="note" style={{ marginTop: 0, maxWidth: '32rem' }}>
        The invitation to {inv.inviteeContact} is removed and its link stops working. This cannot be undone.
      </p>
    </Dialog>
  );
}
