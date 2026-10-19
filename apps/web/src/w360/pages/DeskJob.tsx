/** One order on the desk, worked end to end by Pattadar's own operators.
 *
 *  Everything the owner's order page used to carry for the desk lives here
 *  now (service order spec §7): who could take it (the server's ranked
 *  `candidates`, eligibility reasons included) and the one-press Assign; taking
 *  somebody off; sending it to a provider and every time it left the building,
 *  with what was sent and a Withdraw; marking it started; recording work a
 *  provider handed in by another route; and the order's thread, with a reply
 *  the owner reads as "Pattadar desk".
 *
 *  It reads `deskTicket(id)` — admin-only and cross-owner, so the server
 *  writes an audit row for every read — rather than finding a row in the desk
 *  list, so a closed order still opens. Every control is drawn from the
 *  desk's own `can` (dispatch · withdraw · assign · unassign · start · deliver
 *  · message), never from the status string.
 *
 *  Every number on this page is drawn masked and dialled whole (`Contact` in
 *  Desk.tsx): a screenshot of the desk must not be a phone book. A dispatch's
 *  work link is printed only when the desk asks to see what was sent.
 */
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';

import { agoSpelled, dayAndTime } from '@pattadar/core';

import { Dialog } from '../Dialog';
import ShareResult from '../components/ShareResult';
import {
  useDeskAddDeliverable, useDeskAssign, useDeskCandidates, useDeskDispatchTicket,
  useDeskPostTicketMessage, useDeskRevokeDispatch, useDeskStartTicket, useDeskTicket, usePortfolio,
} from '../api';
import type { Candidate, DeskJob as DeskJobRow, TicketDispatch, TicketEvent } from '../api';
import {
  Card, Empty, Failed, Icon, PageHead, State, Tag,
  ddmmyyyy, initialsOf, inr, inrFullish, plural,
} from '../ui';
import { MAX_UPLOAD_BYTES, mb } from '../filePhotos';
import { Sk, SkRowItems } from '../skeletons';
import { STORAGE_OFFLINE_MSG, StorageUploadError, uploadToDrive } from '../../pages/documents/storage';
import { Contact, MOVE_FAILED, NotTheDesk, TakeOff } from './Desk';

const SEND_FAILED =
  'That did not go out. Nothing was sent — check the number or the email and try again.';
const ADD_FAILED =
  'That was not recorded. Nothing was added to this job — check what you typed and try again.';
const REPLY_FAILED = 'That reply was not added. Nothing was sent — try again.';

const CHANNEL_WORD: Record<string, string> = { email: 'Email', whatsapp: 'WhatsApp', sms: 'SMS' };
const EVENT_ICON: Record<string, string> = {
  status: 'clock', dispatch: 'agent', deliverable: 'paper', filed: 'ok', payment: 'tax',
  refused: 'warn', nudge: 'agent', message: 'person',
};
/** The condition words a feature comes back with — the four `condition_state`
 *  the record's own features use (design.md: Working · Watch it · Broken ·
 *  Not checked). */
const CONDITIONS: [string, string][] = [
  ['good', 'Working'], ['warn', 'Watch it'], ['bad', 'Broken'], ['unknown', 'Not checked'],
];

const Err = ({ children }: { children: ReactNode }) => (
  <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{children}</p>
);

/** Who said it, for the desk: the label as stored, never an id. */
const whoSaid = (e: TicketEvent) =>
  (e.actorKind === 'owner' ? 'Owner' : e.actorKind === 'system' ? 'Pattadar desk' : (e.actorLabel || 'Provider'));

const When = ({ at, label }: { at: string; label: string }) => (
  <time dateTime={at} title={at ? dayAndTime(at) : undefined}>{at ? agoSpelled(at) : label}</time>
);

// ── Who could take it ──────────────────────────────────────────────────

function Person({ c, job, going, onAssign }: {
  c: Candidate; job: DeskJobRow; going: boolean; onAssign: (id: string) => void;
}) {
  const already = !!job.assigneeRef && job.assigneeRef === c.associateId;
  return (
    <div>
      <span className="avatarlg" style={{ width: '2.25rem', height: '2.25rem' }}>
        {c.initials || initialsOf(c.name)}
      </span>
      {/* A basis, so on a phone Open and Assign wrap below the person. */}
      <span className="grow" style={{ flexBasis: '12rem' }}>
        <span className="row tight">
          <strong style={{ fontSize: '0.9375rem' }}>{c.name}</strong>
          {already && <Tag>On this job</Tag>}
        </span>
        <span className="note" style={{ display: 'block', margin: '0.25rem 0 0' }}>
          {[c.areaMatch, `${c.openCount} of ${c.capacity} jobs in hand`].filter(Boolean).join(' · ')}
          {c.contact && <> · <Contact contact={c.contact} /></>}
        </span>
        {c.why.length > 0 && <span className="note" style={{ display: 'block' }}>{c.why.join(' · ')}</span>}
      </span>
      <Link className="btn sm" to={`/desk/associates/${c.associateId}`}>Open</Link>
      {already ? (
        <span className="note">They already have it.</span>
      ) : c.eligible ? (
        <button type="button" className="btn sm primary" disabled={going}
                aria-label={going ? `Assigning ${c.name}…` : `Assign ${c.name}`}
                onClick={() => onAssign(c.associateId)}>
          {going ? 'Assigning…' : 'Assign'}
        </button>
      ) : (
        // Shown, never filtered: a shortlist that quietly shrank is a question
        // the desk needs answered on the screen.
        <span className="note" style={{ maxWidth: '16rem', textAlign: 'right' }}>
          {c.whyNot.length > 0 ? c.whyNot.join(' · ') : 'Not taking work just now.'}
        </span>
      )}
    </div>
  );
}

// ── One time the order left the building ───────────────────────────────

/** A revoked dispatch stays as evidence; any other one can be taken back. */
function Dispatch({ d, busy, onWithdraw }: {
  d: TicketDispatch; busy: boolean; onWithdraw: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const accessPath = d.body.match(/\/work\/[A-Za-z0-9_-]{43}/)?.[0];

  return (
    <div>
      <span className="grow">
        <span className="row tight">
          <Icon name={d.channel === 'email' ? 'paper' : 'agent'} size={16} />
          <strong style={{ fontSize: '0.9375rem' }}>{d.personName || d.contactMasked}</strong>
          {!d.live && <span className="pill sim">Recorded, not sent</span>}
          {d.status === 'failed' && <State state="bad">It did not go</State>}
          {d.revoked && <State state="unknown">Withdrawn</State>}
        </span>
        <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>
          {CHANNEL_WORD[d.channel] ?? d.channel} · {d.contactMasked} · {ddmmyyyy(d.sentAt)}
        </span>
        {d.error && <span className="note" style={{ display: 'block' }}>{d.error}</span>}
        {d.revoked && d.revokeReason && <span className="note" style={{ display: 'block' }}>{d.revokeReason}</span>}
        <span className="row tight" style={{ marginTop: '0.25rem' }}>
          <button type="button" className="linkbtn" aria-expanded={shown} onClick={() => setShown((v) => !v)}>
            See what was sent
          </button>
        </span>
        {shown && (
          <div style={{ marginTop: 'var(--space-sm)', padding: 'var(--space-sm)', border: '1px solid var(--w-line)', borderRadius: 'var(--radius-sm)' }}>
            {d.subject && <p className="note" style={{ marginTop: 0 }}><strong>{d.subject}</strong></p>}
            <div className="scroll-x">
              <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{d.body}</pre>
            </div>
            {!d.revoked && d.status !== 'failed' && accessPath && <ShareResult path={accessPath} />}
          </div>
        )}
        {!d.revoked && (confirming ? (
          <div className="stack" style={{ marginTop: 'var(--space-sm)' }}>
            <p className="note" style={{ margin: 0 }}>They are told it is off.</p>
            <div className="row tight">
              <button type="button" className="btn sm danger" disabled={busy} onClick={onWithdraw}>Withdraw</button>
              <button type="button" className="btn sm" onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <span className="row tight" style={{ marginTop: '0.25rem' }}>
            <button type="button" className="btn sm" onClick={() => setConfirming(true)}>Withdraw</button>
          </span>
        ))}
      </span>
    </div>
  );
}

// ── The page ───────────────────────────────────────────────────────────

export function DeskJob() {
  const { id = '' } = useParams<{ id: string }>();
  const portfolio = usePortfolio();
  const desk = useDeskTicket(id);
  const assign = useDeskAssign();
  const dispatch = useDeskDispatchTicket();
  const revoke = useDeskRevokeDispatch();
  const start = useDeskStartTicket();
  const addDeliverable = useDeskAddDeliverable();
  const reply = useDeskPostTicketMessage();
  const canAssign = !!desk.data?.can.includes('assign');
  const candidates = useDeskCandidates(canAssign ? id : undefined);

  const [err, setErrAt] = useState<{ where: string; msg: string }>({ where: '', msg: '' });
  /** Who the assignment in flight is for, so one row says "Assigning…". */
  const [going, setGoing] = useState('');
  const [dialog, setDialog] = useState<'' | 'send' | 'record'>('');
  const [replyText, setReplyText] = useState('');
  // Sending
  const [dpName, setDpName] = useState('');
  const [dpContact, setDpContact] = useState('');
  const [dpChannel, setDpChannel] = useState('auto');
  const [dpNote, setDpNote] = useState('');
  const [dpPurpose, setDpPurpose] = useState('invite');
  // Recording what came back
  const [dvKind, setDvKind] = useState('paper');
  const [dvLabel, setDvLabel] = useState('');
  const [dvNote, setDvNote] = useState('');
  const [dvRing, setDvRing] = useState('');
  const [dvCond, setDvCond] = useState('unknown');
  const [dvFile, setDvFile] = useState<File | null>(null);
  const pickFile = useRef<HTMLInputElement>(null);

  if (portfolio.data && !portfolio.data.isPlatformAdmin) return <NotTheDesk />;

  const desk0 = { label: 'Pattadar desk', to: '/desk' };
  if (desk.isLoading) {
    // The job's own two columns and card titles, grey inside (design.md § Loading).
    return (
      <main>
        <PageHead crumbs={[desk0, { label: 'Job' }]} title="Job" />
        <div role="status" aria-busy="true" aria-label="Loading this job" className="split loose">
          <div className="stack" aria-hidden>
            <Card title="Conversation">
              <Sk w="100%" h="5rem" r="var(--radius-md)" />
              <Sk w="62%" style={{ marginTop: 'var(--space-md)' }} />
              <Sk w="48%" style={{ marginTop: '0.5rem' }} />
            </Card>
            <Card title="Activity">
              <ol className="stream" style={{ marginTop: 0 }}>
                {[11, 8, 13].map((w) => (
                  <li key={w} className="stream-line">
                    <Sk w="16px" h="16px" r="var(--radius-pill)" style={{ flex: 'none' }} />
                    <span className="grow"><Sk w={`${w}rem`} /></span>
                    <Sk w="4rem" h="0.8125rem" style={{ flex: 'none' }} />
                  </li>
                ))}
              </ol>
            </Card>
          </div>
          <aside className="stack" aria-hidden>
            <Card title="Assigned provider">
              <Sk w="55%" h="1rem" />
              <Sk w="70%" style={{ marginTop: '0.5rem' }} />
            </Card>
            <Card title="Payment">
              <Sk w="40%" h="1rem" />
              <Sk w="65%" style={{ marginTop: '0.5rem' }} />
            </Card>
          </aside>
        </div>
      </main>
    );
  }
  if (desk.error) {
    return (
      <main>
        <PageHead crumbs={[desk0, { label: 'Job' }]} title="Job" />
        <Failed what="This job" error={desk.error} boxed h="20rem" />
      </main>
    );
  }
  if (!desk.data) {
    return (
      <main>
        <PageHead crumbs={[desk0, { label: 'Not found' }]} title="This job is not on the desk" />
        <Empty
          boxed h="18rem" icon="clock"
          action={<Link className="btn primary" to="/desk">Back to Pattadar desk</Link>}
        >
          There is no job with that reference.
        </Empty>
      </main>
    );
  }

  const { job: j, can: deskCan, events, deliverables, dispatches } = desk.data;
  const can = (a: string) => deskCan.includes(a);
  const fail = (where: string, msg: string) => setErrAt({ where, msg });
  const clearErr = () => setErrAt({ where: '', msg: '' });
  const errIn = (where: string) => (err.msg && err.where === where ? <Err>{err.msg}</Err> : null);
  const liveDispatch = [...dispatches].reverse().find((d) => !d.revoked);
  const thread = events.filter((e) => e.kind === 'message');
  const trail = [...events].reverse();
  const roster = candidates.data ?? [];

  const onAssign = async (associateId: string) => {
    clearErr();
    setGoing(associateId);
    try {
      const res = await assign.mutateAsync({ ticketId: j.ticketId, associateId, note: '' });
      if (!res.web.deskAssign) fail('roster', MOVE_FAILED);
    } catch {
      // The server's own reason arrives as a toast from the shared helper.
      fail('roster', MOVE_FAILED);
    } finally {
      setGoing('');
    }
  };

  const openSend = (purpose: string) => {
    clearErr();
    setDpPurpose(purpose);
    if (purpose !== 'invite' && liveDispatch) {
      setDpName(liveDispatch.personName);
      setDpChannel(liveDispatch.channel || 'auto');
    }
    setDialog('send');
  };

  const onSend = async () => {
    clearErr();
    try {
      const res = await dispatch.mutateAsync({
        ticketId: j.ticketId, contact: dpContact.trim(), personName: dpName.trim(),
        channel: dpChannel, purpose: dpPurpose, note: dpNote.trim(), expiresDays: 14,
      });
      if (!res.web.deskDispatchTicket) { fail('dialog', SEND_FAILED); return; }
      setDialog('');
      setDpContact(''); setDpNote(''); setDpPurpose('invite');
    } catch { fail('dialog', SEND_FAILED); }
  };

  const onWithdraw = async (dispatchId: string) => {
    clearErr();
    try {
      const res = await revoke.mutateAsync({ dispatchId, reason: '' });
      if (!res.web.deskRevokeDispatch) fail('sent', MOVE_FAILED);
    } catch { fail('sent', MOVE_FAILED); }
  };

  const onStart = async () => {
    clearErr();
    try {
      const res = await start.mutateAsync({ ticketId: j.ticketId, note: '' });
      if (!res.web.deskStartTicket) fail('who', MOVE_FAILED);
    } catch { fail('who', MOVE_FAILED); }
  };

  const onAdd = async () => {
    clearErr();
    let fileRef = '';
    let fileName = '';
    let mimeType = '';
    let sizeBytes = 0;
    if ((dvKind === 'paper' || dvKind === 'photo') && dvFile) {
      if (dvFile.size > MAX_UPLOAD_BYTES) {
        fail('dialog', `${dvFile.name} is ${mb(dvFile.size)}. The limit is ${mb(MAX_UPLOAD_BYTES)} — nothing was uploaded.`);
        return;
      }
      try {
        const node = await uploadToDrive(dvFile);
        fileRef = node.id; fileName = node.name; mimeType = node.mimeType; sizeBytes = node.sizeBytes;
      } catch (e) {
        // The storage sentence, not "check what you typed": the upload failed,
        // and nothing was recorded against the job.
        fail('dialog', e instanceof StorageUploadError && e.status ? e.message : STORAGE_OFFLINE_MSG);
        return;
      }
    }
    try {
      const payload = dvKind === 'boundary' ? JSON.stringify({ ring: dvRing.trim() })
        : dvKind === 'feature' ? JSON.stringify({ condition_state: dvCond })
        : '{}';
      const res = await addDeliverable.mutateAsync({
        ticketId: j.ticketId, kind: dvKind, label: dvLabel.trim(), note: dvNote.trim(),
        fileRef, fileName, mimeType, sizeBytes, payload, fileAs: '', submittedBy: '',
      });
      if (!res.web.deskAddDeliverable) { fail('dialog', ADD_FAILED); return; }
      setDialog('');
      setDvLabel(''); setDvNote(''); setDvRing(''); setDvFile(null); setDvCond('unknown');
    } catch { fail('dialog', ADD_FAILED); }
  };

  const onReply = async () => {
    const message = replyText.trim();
    if (!message) return;
    clearErr();
    try {
      const res = await reply.mutateAsync({ ticketId: j.ticketId, message });
      if (!res.web.deskPostTicketMessage) { fail('thread', REPLY_FAILED); return; }
      setReplyText('');
    } catch { fail('thread', REPLY_FAILED); }
  };

  return (
    <main>
      {/* Detail head (design.md § Page head): the crumb names the job by its
          reference, the h1 by its service; the facts are the meta row. */}
      <PageHead
        crumbs={[desk0, { label: j.ref }]}
        title={j.serviceLabel}
        pill={<State state={j.statusState}>{j.statusLabel}</State>}
        meta={<>
          <span>
            {j.place || 'Place not recorded'}
            {j.orderedAt && <> · Ordered {ddmmyyyy(j.orderedAt)}</>}
            {' · '}{inrFullish(j.quoted)}
            {j.dueDate && <> · due {ddmmyyyy(j.dueDate)}</>}
            {j.assignee ? <> · with {j.assignee}</> : <> · nobody on it yet</>}
            {j.ageDays > 0 && <> · {plural(j.ageDays, 'day')} old</>}
          </span>
          {j.askedAt && <Tag alert>Owner asked for an update {ddmmyyyy(j.askedAt)}</Tag>}
          {j.quiet && j.quietDays > 0 && <Tag alert>{plural(j.quietDays, 'day')} quiet</Tag>}
          {j.overdue && <Tag alert>Past due</Tag>}
          {j.stuck && <Tag alert>Nobody can take it</Tag>}
        </>}
      />

      <div className="split loose">
        <div className="stack">
          {canAssign && (
            <Card title="Available providers"
                  aside={roster.length > 0 ? <span className="note">{plural(roster.length, 'person', 'people')}</span> : undefined}>
              <p className="note" style={{ marginTop: 0 }}>
                Ranked by the server for {j.place || 'this place'}, with the reason for each.
              </p>
              {candidates.isLoading ? (
                <div role="status" aria-busy="true" aria-label="Loading the roster" className="rows boxed">
                  <SkRowItems rows={3} />
                </div>
              ) : !candidates.data ? (
                <Failed what="The roster" error={candidates.error} boxed h="12rem"
                        onRetry={() => { void candidates.refetch(); }} />
              ) : roster.length === 0 ? (
                <Empty boxed icon="person" title="No provider is available today"
                       action={<Link className="btn primary" to="/desk/enrol">Add a member</Link>}>
                  Nobody on the roster does {j.serviceLabel} here.
                </Empty>
              ) : (
                <div className="rows boxed">
                  {roster.map((c) => (
                    <Person key={c.associateId} c={c} job={j}
                            going={assign.isPending && going === c.associateId}
                            onAssign={(x) => { void onAssign(x); }} />
                  ))}
                </div>
              )}
              {errIn('roster')}
            </Card>
          )}

          <Card title="Conversation" aside={thread.length > 0 ? <span className="num muted">{thread.length}</span> : undefined}>
            {can('message') && (
              <form className="chat-compose" style={{ marginTop: 0 }}
                    onSubmit={(e) => { e.preventDefault(); void onReply(); }}>
                <label className="field">
                  <span className="sr-only">Reply</span>
                  <textarea maxLength={4000} value={replyText} placeholder="Reply as Pattadar desk"
                            onChange={(e) => setReplyText(e.target.value)} />
                </label>
                <div className="compose-bar">
                  <span className="grow note">The owner reads this as Pattadar desk.</span>
                  <button type="submit" className="btn sm primary" disabled={!replyText.trim() || reply.isPending}>
                    {reply.isPending ? 'Sending…' : 'Send reply'}
                  </button>
                </div>
                {errIn('thread')}
              </form>
            )}
            {thread.length === 0 ? (
              <p className="note" style={{ margin: 'var(--space-md) 0 0' }}>No messages on this job yet.</p>
            ) : (
              <ol className="stream" aria-label="Conversation">
                {[...thread].reverse().map((e) => (
                  <li key={e.id} className="stream-msg">
                    <span className="stream-who">{whoSaid(e)} · <When at={e.at} label={e.atLabel} /></span>
                    <div className="chat-bubble">{e.detail || e.headline}</div>
                    {e.attachments.length > 0 && (
                      <div className="filechips">
                        {e.attachments.map((a) => (
                          <span key={a.fileRef} className="filechip"><span>{a.fileName} · {mb(a.sizeBytes)}</span></span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {deliverables.length > 0 && (
            <Card title="Submitted work" aside={<span className="num muted">{deliverables.length}</span>}>
              <div className="rows boxed">
                {deliverables.map((d) => (
                  <div key={d.id}>
                    <Icon name={d.kind === 'photo' ? 'photos' : d.kind === 'boundary' ? 'map' : 'paper'} size={18} />
                    <span className="grow">
                      <strong style={{ fontSize: '0.9375rem' }}>{d.label}</strong>
                      <span className="note" style={{ display: 'block' }}>
                        {[d.submittedBy, d.submittedAt && ddmmyyyy(d.submittedAt), d.review].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card title="Activity">
            {trail.length === 0 ? (
              <p className="note" style={{ margin: 0 }}>Nothing has happened on this job yet.</p>
            ) : (
              <ol className="stream" style={{ marginTop: 0 }} aria-label="Job activity">
                {trail.map((e) => (
                  <li key={e.id} className="stream-line">
                    <Icon name={EVENT_ICON[e.kind] ?? 'clock'} size={16} />
                    <span className="grow">
                      {e.headline}
                      {e.detail && e.kind !== 'message' && <span className="note"> · {e.detail}</span>}
                    </span>
                    <When at={e.at} label={e.atLabel} />
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <aside className="stack">
          <Card title="Assigned provider">
            {j.assignee ? (
              <div className="row">
                <span className="avatarlg">{initialsOf(j.assignee)}</span>
                <span className="grow">
                  <strong style={{ fontSize: '0.9375rem' }}>{j.assignee}</strong>
                  <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>
                    {j.assigneeContact
                      ? <Contact contact={j.assigneeContact} />
                      : j.assigneeRef ? 'No number recorded against them.' : 'Typed by the owner. No number recorded.'}
                  </span>
                  {j.assigneeRef && (
                    <Link className="link" to={`/desk/associates/${j.assigneeRef}`}>Open their record</Link>
                  )}
                </span>
              </div>
            ) : (
              <p className="note" style={{ margin: 0 }}>Nobody yet.</p>
            )}
            {(can('unassign') || can('start')) && (
              <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
                {can('start') && (
                  <button type="button" className="btn sm" disabled={start.isPending} onClick={() => void onStart()}>
                    {start.isPending ? 'Marking…' : 'Mark started'}
                  </button>
                )}
                {can('unassign') && j.assignee && (
                  <TakeOff ticketId={j.ticketId} jobRef={j.ref} name={j.assignee} />
                )}
              </div>
            )}
            {errIn('who')}
          </Card>

          {(can('dispatch') || dispatches.length > 0) && (
            <Card title="Sent to provider"
                  aside={dispatches.length > 0 ? <span className="num muted">{dispatches.length}</span> : undefined}>
              {dispatches.length > 0 && (
                <div className="rows boxed">
                  {dispatches.map((d) => (
                    <Dispatch key={d.id} d={d} busy={revoke.isPending}
                              onWithdraw={() => void onWithdraw(d.id)} />
                  ))}
                </div>
              )}
              {can('dispatch') && (
                <div className="row tight" style={{ marginTop: dispatches.length ? 'var(--space-sm)' : 0 }}>
                  <button type="button" className="btn sm" onClick={() => openSend(liveDispatch ? 'nudge' : 'invite')}>
                    {liveDispatch ? 'Send it again' : 'Send this to a provider'}
                  </button>
                </div>
              )}
              {errIn('sent')}
            </Card>
          )}

          {can('deliver') && (
            <Card title="Work handed in">
              <p className="note" style={{ marginTop: 0 }}>
                For work a provider sent by another route. Nothing reaches the owner&rsquo;s property until they keep it.
              </p>
              <button type="button" className="btn sm" onClick={() => { clearErr(); setDialog('record'); }}>
                Record submitted work
              </button>
            </Card>
          )}

          <Card title="Payment">
            <p style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{inrFullish(j.quoted)} quoted</p>
            <p className="note" style={{ margin: '0.375rem 0 0' }}>
              {j.held > 0 ? <>{inr(j.held)} held on this job.</> : <>Nothing held yet.</>}
            </p>
          </Card>
        </aside>
      </div>

      {dialog === 'send' && (
        <Dialog
          title={dpPurpose === 'invite' ? 'Send this to a provider' : 'Send it again'}
          onClose={() => { clearErr(); setDialog(''); }} busy={dispatch.isPending}
          wide dismissable={false} initialFocus="#dp-name"
          footer={(
            <>
              <button type="button" className="btn" onClick={() => { clearErr(); setDialog(''); }}>Cancel</button>
              <button type="button" className="btn primary" disabled={!dpContact.trim() || dispatch.isPending}
                      onClick={() => void onSend()}>
                {dispatch.isPending ? 'Sending…' : 'Send it'}
              </button>
            </>
          )}
        >
          <p className="note" style={{ margin: 0 }}>
            They see the job, the place, what the owner asked for, the fee and the due date — nothing else.
          </p>
          {dpPurpose !== 'invite' && (
            <p className="note" style={{ margin: 0 }}>This one is a reminder. Type their number again.</p>
          )}
          <div className="field">
            <label htmlFor="dp-name">Their name</label>
            <input id="dp-name" type="text" value={dpName} placeholder="G. Srinivas"
                   onChange={(e) => setDpName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="dp-contact">Email or phone</label>
            <input id="dp-contact" type="text" value={dpContact} placeholder="98480 12345 or name@example.com"
                   onChange={(e) => setDpContact(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="dp-channel">Send it by</label>
            <select id="dp-channel" className="input" value={dpChannel} onChange={(e) => setDpChannel(e.target.value)}>
              <option value="auto">Whichever reaches them</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="dp-note">Anything else they should know</label>
            <textarea id="dp-note" rows={3} value={dpNote} onChange={(e) => setDpNote(e.target.value)} />
          </div>
          {errIn('dialog')}
          {!dpContact.trim() && <p className="note" style={{ margin: 0 }}>An email or a phone number first.</p>}
        </Dialog>
      )}

      {dialog === 'record' && (
        <Dialog
          title="Record submitted work" onClose={() => { clearErr(); setDialog(''); }} busy={addDeliverable.isPending}
          wide dismissable={false} initialFocus="#dv-kind"
          footer={(
            <>
              <button type="button" className="btn" onClick={() => { clearErr(); setDialog(''); }}>Cancel</button>
              <button type="button" className="btn primary" disabled={!dvLabel.trim() || addDeliverable.isPending}
                      onClick={() => void onAdd()}>
                {addDeliverable.isPending ? 'Adding…' : 'Add it'}
              </button>
            </>
          )}
        >
          <p className="note" style={{ margin: 0 }}>Nothing here touches the owner&rsquo;s property until they keep it.</p>
          <div className="field">
            <label htmlFor="dv-kind">What is it</label>
            <select id="dv-kind" className="input" value={dvKind} onChange={(e) => setDvKind(e.target.value)}>
              <option value="paper">A document</option>
              <option value="photo">A photo</option>
              <option value="boundary">A corrected outline</option>
              <option value="feature">Something on the land</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="dv-label">What to call it</label>
            <input id="dv-label" type="text" value={dvLabel} onChange={(e) => setDvLabel(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="dv-note">Notes</label>
            <textarea id="dv-note" rows={2} value={dvNote} onChange={(e) => setDvNote(e.target.value)} />
          </div>
          {(dvKind === 'paper' || dvKind === 'photo') && (
            <div className="row tight">
              <input ref={pickFile} type="file" hidden aria-label="Submitted file"
                     onChange={(e) => setDvFile(e.target.files?.[0] ?? null)} />
              <button type="button" className="btn sm" onClick={() => pickFile.current?.click()}>Choose a file</button>
              <span className="note">{dvFile ? `${dvFile.name} · ${mb(dvFile.size)}` : `Up to ${mb(MAX_UPLOAD_BYTES)}`}</span>
            </div>
          )}
          {dvKind === 'boundary' && (
            <div className="field">
              <label htmlFor="dv-ring">The corners</label>
              <textarea id="dv-ring" rows={3} value={dvRing} placeholder="17.123456,80.123456;17.124,80.125;…"
                        onChange={(e) => setDvRing(e.target.value)} />
              <span className="note">Latitude then longitude, separated by semicolons. At least three corners.</span>
            </div>
          )}
          {dvKind === 'feature' && (
            <div className="field">
              <label htmlFor="dv-cond">What condition it is in</label>
              <select id="dv-cond" className="input" value={dvCond} onChange={(e) => setDvCond(e.target.value)}>
                {CONDITIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          )}
          {errIn('dialog')}
          {!dvLabel.trim() && <p className="note" style={{ margin: 0 }}>Give it a name first.</p>}
        </Dialog>
      )}
    </main>
  );
}
