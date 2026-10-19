/** One service order, as the person who ordered it reads it.
 *
 *  This is the screen an owner opens to find out where their order is and
 *  what happens next. It is the requester's view, not the desk's: finding,
 *  sending to, assigning, starting and recording for a provider are Pattadar
 *  desk's work and live on `/desk/jobs/:id` (DeskJob.tsx). The server
 *  enforces the same split — the owner's `can` is only ever a subset of
 *  cancel · accept · send_back · message · nudge · rate (service order spec §7).
 *
 *  The page, top to bottom (spec §1-§6):
 *    · the head: Services › {ref}, the title, the status pill (the one place
 *      the status word is printed), "For {property} · {place}" (the one place
 *      the property is named), and the requester's commands as outlined
 *      buttons, with "Copy link to this order" in the ⋮;
 *    · the stage tracker, from the status and the trail's own dates;
 *    · the Next step panel: one sentence that always says what happens next,
 *      and the owner's one filled button when the order waits on them;
 *    · Delivered work, once anything has come back;
 *    · Activity: the composer on top, then the trail newest first;
 *    · Details in the rail, each fact told once, money included.
 *
 *  Three rules from before still hold. Nothing a provider sends touches the
 *  record until the owner keeps it, one item at a time. The payments provider
 *  may be a stub, so the copy uses the wallet's words (Held · Released ·
 *  Refunded · Pattadar fee) and says "Not charged" once, in Details. And
 *  every control is drawn from `t.can`, never from the status string, so the
 *  screen never offers a move the API will refuse. */
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Link, useParams, useSearchParams } from 'react-router';
import CallOutlined from '@mui/icons-material/CallOutlined';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import MailOutlined from '@mui/icons-material/MailOutlined';
import SendOutlined from '@mui/icons-material/SendOutlined';
import StarRounded from '@mui/icons-material/StarRounded';

import { agoSpelled, dayAndTime } from '@pattadar/core';

import { Dialog } from '../Dialog';
import { useToast } from '../Toast';
import { Sk } from '../skeletons';
import {
  useAcceptTicket, useCancelTicket, useFundTicket, useNudgeTicket, usePaymentConfig,
  usePostTicketMessage, useRateAssociate, useReviewDeliverable, useSendBackTicket, useServicesOffered,
  useTicket,
} from '../api';
import type { TicketAttachment, TicketDeliverable, TicketEvent, TicketView } from '../api';
import type { HeadAction, MenuItem, TrackerStep } from '../ui';
import {
  Card, Empty, Failed, Icon, KV, ORDER_MOVE_FAILED, OrderTracker, PageHead, PhotoImg, State,
  StatusChip, Tag, ddmmyyyy, initialsOf, inrFull, plural, useNarrow,
} from '../ui';
import { mb } from '../filePhotos';
import { orderHref, serviceKeyOf } from '../orderFlow';
import { ScanView, useScan } from '../paper/scan';
import { downloadBlob, fetchFileBlob } from '../../pages/documents/storage';

// ── Words ──────────────────────────────────────────────────────────────

/** The shared refusal (ui.tsx), so a property's Services list says the same. */
const MOVE_FAILED = ORDER_MOVE_FAILED;
const ACCEPT_FAILED = 'That was not accepted. Decide on every item first, then try again.';
const MESSAGE_REFUSED = 'That message was not added. This order may be closed.';
const MESSAGE_FAILED = 'That message did not reach Pattadar. Nothing was sent — try again.';
const RATING_FAILED = 'That rating was not saved. Reload and try again.';
const DOWNLOAD_FAILED = 'That file could not be downloaded. Try again.';
const MONEY_RULE = 'Released to the provider only when you accept the work.';

/** Why the order was placed, for Details' "Why ordered" row, in the owner's
 *  words. `detail` is stored at order time, so an older order still carries
 *  the wording (or the bare key) of the day it was placed; the owner's own
 *  note is shown exactly as written. */
function sourceWord(detail: string): string {
  const d = detail.trim();
  if (/missing[ _](papers|documents)/i.test(d)) return 'From your missing documents list';
  if (/^ordered from the properties list$|^properties[ _]list$/i.test(d)) return 'From your properties list';
  return d;
}

const KIND_WORD: Record<string, string> = {
  paper: 'A document', photo: 'A photo',
  boundary: 'A corrected outline', feature: 'Something on the land',
};
const KIND_ICON: Record<string, string> = {
  paper: 'paper', photo: 'photos', boundary: 'map', feature: 'feature',
};
const EVENT_ICON: Record<string, string> = {
  status: 'clock', deliverable: 'paper', filed: 'ok', nudge: 'agent',
};

// ── Small shared bits ──────────────────────────────────────────────────

const Err = ({ children }: { children: ReactNode }) => (
  <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{children}</p>
);

/** Which block raised a failure; `<Err>` is drawn as the last child of that
 *  block, never 800px from the button that was pressed. */
type Where = 'next' | 'came' | 'chat' | 'details' | 'dialog';

/** The date of a status move, from the trail: the first or the last line
 *  with that action. '' when it never happened. The client never derives a
 *  date from `stage`, which runs backwards between `changes` and `submitted`. */
function on(t: TicketView, action: string, first = false): string {
  const rows = t.events.filter((e) => e.kind === 'status' && e.action === action && e.atLabel);
  const e = first ? rows[0] : rows[rows.length - 1];
  return e?.atLabel ?? '';
}

/** Whoever holds the order: the Pattadar provider behind it when there is
 *  one, else the name on the row. */
const holderOf = (t: { assignedTo?: { name: string } | null; assignee: string }): string =>
  t.assignedTo?.name || t.assignee;

/** What accepting is about to do, in one sentence, before it is done. Built
 *  from the server's own `goesTo`, so the promise and the label agree. */
function planLine(t: TicketView, kept: TicketDeliverable[]): string {
  const where = kept.map((d) => `“${d.label}” → ${d.goesTo}`).join('; ');
  const outline = kept.some((d) => d.kind === 'boundary') ? ' The outline on file is replaced.' : '';
  return `${plural(kept.length, 'item', 'items')} ${kept.length === 1 ? 'goes' : 'go'} onto `
    + `${t.recordTitle}: ${where}.${outline}`;
}

/** Where the held money goes on acceptance, in the one sentence the review
 *  footer and the Accept dialog both print, so they cannot disagree. */
function releaseLine(t: TicketView): string {
  const payout = t.money.held * t.money.payeeShare;
  return `${inrFull(payout)} is released to ${holderOf(t) || 'the provider'} and `
    + `${inrFull(t.money.held - payout)} is the Pattadar fee`;
}

/** The five steps, in the requester's words (spec §2.2). */
const STEPS = ['Placed', 'Assigned', 'In progress', 'Delivered', 'Accepted'];

/** The five steps and where this order is on them (spec §2.3). Dates come
 *  from the trail; the current step comes from `status`. */
function trackerOf(
  t: TicketView, payFailed: boolean, unfunded: boolean, onSite: boolean,
): TrackerStep[] {
  const placed = on(t, 'place', true) || ddmmyyyy(t.createdAt);
  const assigned = on(t, 'assign');
  const started = on(t, 'start');
  const delivered = on(t, 'deliver', true);
  const sentBack = on(t, 'send_back');
  const accepted = on(t, 'accept') || ddmmyyyy(t.acceptedAt);
  const late = t.overdueDays > 0 && !t.closed;
  const quiet = t.quietDays >= 4 && !t.closed;
  const overdue = `Overdue by ${plural(t.overdueDays, 'day')}`;

  const dates = [placed, assigned, started, delivered, accepted];
  const steps: TrackerStep[] = STEPS.map((label, i) => ({ label, state: 'todo', date: dates[i] }));
  const upTo = (n: number) => { for (let i = 0; i < n; i += 1) steps[i].state = 'done'; };
  /** The current step. `waits` is a step where nothing has come back yet:
   *  only there does stalled or overdue tint the caption (overdue outranks
   *  stalled), because that is where asking for an update is the remedy. */
  const current = (i: number, caption: ReactNode, waits = true) => {
    upTo(i);
    steps[i] = {
      ...steps[i], state: 'current',
      caption: waits && late ? overdue : caption,
      tone: waits && (late || quiet) ? 'warn' : undefined,
    };
  };

  switch (t.status) {
    case 'assigned':
      current(1, `Since ${assigned || placed}`);
      break;
    case 'on_site':
      current(2, `${onSite ? 'On site since' : 'Since'} ${started || assigned || placed}`);
      break;
    case 'submitted':
      current(3, `Delivered ${on(t, 'deliver') || delivered} · waiting on you`, false);
      break;
    case 'changes':
      // The provider's move again: late or quiet tints it, as on assigned.
      current(2, `Being reworked since ${sentBack}`);
      steps[3] = { ...steps[3], state: 'todo', date: sentBack ? `Sent back ${sentBack}` : '', undone: true };
      break;
    case 'accepted':
      upTo(5);
      steps[4].here = true;
      break;
    case 'cancelled': {
      const reached = delivered ? 4 : started ? 3 : assigned ? 2 : 1;
      upTo(reached);
      return [...steps.slice(0, reached),
        { label: 'Cancelled', state: 'stopped', date: on(t, 'cancel'), here: true }];
    }
    default: // placed, sent
      current(0, t.quietDays >= 1 ? `Finding a provider · ${plural(t.quietDays, 'day')} so far` : '');
  }
  for (const s of steps) if (s.state === 'todo' && !s.undone) s.date = '';
  // Nobody is being found while the order waits on the owner's money: the
  // wait is theirs, so it is said plainly and never tinted as Pattadar's delay.
  if (payFailed) steps[0] = { ...steps[0], caption: 'Payment did not go through', tone: 'bad' };
  else if (unfunded) steps[0] = { ...steps[0], caption: 'Waiting for your payment', tone: undefined };
  return steps;
}

/** Who said it, in the stream (spec §3.3). Never an id. */
function whoSaid(e: TicketEvent, holder: string): string {
  if (e.actorKind === 'owner') return 'You';
  if (e.actorKind === 'worker' || e.actorKind === 'associate') {
    return `${e.actorLabel || holder || 'Your provider'} · Provider`;
  }
  if (e.actorKind === 'system' || e.actorKind === 'desk') return 'Pattadar desk';
  return 'Pattadar';
}

/** A moment, spelled out, with the whole date and time under the pointer. */
const When = ({ at, label }: { at: string; label: string }) => (
  <time dateTime={at} title={at ? dayAndTime(at) : undefined}>{at ? agoSpelled(at) : label}</time>
);

// ── Opening and saving a stored file ───────────────────────────────────

/** A stored file, opened over the page (never a new tab). */
function FileDialog({ name, fileRef, mimeType, onClose }: {
  name: string; fileRef: string; mimeType: string; onClose: () => void;
}) {
  const scan = useScan(fileRef);
  const isImage = mimeType.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic)$/i.test(name);
  return (
    <Dialog title={name} onClose={onClose} wide
            footer={<button type="button" className="btn" onClick={onClose}>Close</button>}>
      <div style={{ display: 'grid', placeItems: 'center', height: '60vh' }}>
        <ScanView scan={scan} title={name} isImage={isImage} page={1} pages={1} zoom={100} turn={0} />
      </div>
    </Dialog>
  );
}

type OpenFile = { name: string; fileRef: string; mimeType: string };

/** Open and Download for one stored file. Download saves a copy; a failure
 *  says so beside the buttons. */
function FileButtons({ file, onOpen }: { file: OpenFile; onOpen: (f: OpenFile) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setErr(''); setBusy(true);
    try { downloadBlob(await fetchFileBlob(file.fileRef), file.name); } catch { setErr(DOWNLOAD_FAILED); }
    finally { setBusy(false); }
  };
  return (
    <>
      <span className="row tight">
        <button type="button" className="btn sm" aria-label={`Open ${file.name}`}
                onClick={() => onOpen(file)}>Open</button>
        <button type="button" className="btn sm" aria-label={`Download ${file.name}`} disabled={busy}
                onClick={() => void save()}>{busy ? 'Downloading…' : 'Download'}</button>
      </span>
      {err && <Err>{err}</Err>}
    </>
  );
}

// ── The dialogs ────────────────────────────────────────────────────────
//
// Both are drawn by `Dialog`: Tab stays inside, Escape and the scrim are held
// while a write is in flight, and focus goes back to whatever opened them.
// `initialFocus` lands on the safe button, and `dismissable={false}` keeps a
// stray click on the dim from throwing a typed reason away.

const SAFE_BTN = '.dlg-f .btn';

function AcceptDialog({ t, kept, busy, error, onConfirm, onClose }: {
  t: TicketView; kept: TicketDeliverable[]; busy: boolean; error: string;
  onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Dialog
      title="Accept this work?" onClose={onClose} busy={busy} initialFocus={SAFE_BTN}
      dismissable={false}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={busy} onClick={onConfirm}>
            {busy ? 'Accepting…' : 'Accept work'}
          </button>
        </>
      )}
    >
      <p className="note" style={{ margin: 0 }}>{planLine(t, kept)}</p>
      {/* "Not charged" is told once, in Details › Held; not again here. */}
      {t.money.held > 0 && (
        <p className="note" style={{ margin: 0 }}>
          {releaseLine(t)}.
          {t.money.provider !== 'stub' && ' Waiting for the payment company to confirm.'}
        </p>
      )}
      {error && <Err>{error}</Err>}
    </Dialog>
  );
}

function CancelDialog({ t, busy, error, onConfirm, onClose }: {
  t: TicketView; busy: boolean; error: string;
  onConfirm: (reason: string, payAnyway: number) => void; onClose: () => void;
}) {
  const [why, setWhy] = useState('');
  const [pay, setPay] = useState('0');
  // Clamped here as well as on the server: a figure above what is held would
  // otherwise print a negative refund.
  const payAnyway = Math.min(Math.max(Number(pay) || 0, 0), t.money.held);
  const holder = holderOf(t);
  // Part-payment is for trips a provider made: only on site, only with a
  // Pattadar provider behind it (spec §5). The server ignores it otherwise.
  const split = t.status === 'on_site' && !!t.assignedTo && t.money.held > 0;
  const back = t.money.provider === 'stub' ? 'is refunded to your wallet.' : 'is refunded to the original payment method.';

  return (
    <Dialog
      title="Cancel this order?" onClose={onClose} busy={busy} initialFocus={SAFE_BTN}
      dismissable={false}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Keep order</button>
          <button type="button" className="btn danger" disabled={busy}
                  onClick={() => onConfirm(why.trim(), split ? payAnyway : 0)}>
            {busy ? 'Cancelling…' : 'Cancel order'}
          </button>
        </>
      )}
    >
      <p className="note" style={{ margin: 0 }}>
        {holder && `${holder} is told it is off. `}There is no undo.
      </p>
      <div className="field">
        <label htmlFor="cn-why">Why</label>
        <input id="cn-why" type="text" value={why} onChange={(e) => setWhy(e.target.value)} />
      </div>
      {split ? (
        <>
          <div className="field">
            <label htmlFor="cn-pay">Release part of the {inrFull(t.money.held)} held</label>
            <input id="cn-pay" type="number" min="0" max={t.money.held} value={pay}
                   onChange={(e) => setPay(e.target.value)} />
          </div>
          <p className="note" style={{ margin: 0 }}>
            {inrFull(payAnyway)} released — {inrFull(payAnyway * t.money.payeeShare)} to {holder},{' '}
            {inrFull(payAnyway - payAnyway * t.money.payeeShare)} to Pattadar. The rest,{' '}
            {inrFull(t.money.held - payAnyway)}, {back}
            {!t.money.live && ' Nothing is charged.'}
          </p>
        </>
      ) : t.money.held > 0 && (
        <p className="note" style={{ margin: 0 }}>The {inrFull(t.money.held)} held {back}</p>
      )}
      {error && <Err>{error}</Err>}
    </Dialog>
  );
}

// ── One thing that came back ───────────────────────────────────────────

/** Where an accepted item landed, as a link. */
function filedLink(t: TicketView, d: TicketDeliverable): string {
  if (d.filedTable === 'documents') return `/papers/${d.filedId}`;
  if (d.filedTable === 'land_features') return `/properties/${t.recordId}/site-features`;
  if (d.filedTable === 'parcels' || d.filedTable === 'properties') return `/properties/${t.recordId}/location`;
  return `/properties/${t.recordId}`;
}

function Deliverable({ t, d, reviewing, busy, onKeep, onReject, onReset, onOpen }: {
  t: TicketView; d: TicketDeliverable;
  /** The order is waiting on the owner's decision: the item can be kept or
   *  returned. Otherwise it is read-only — no "Change my mind" on an order
   *  that is over, because the server refuses it. */
  reviewing: boolean; busy: boolean;
  onKeep: (fileAs: string) => void;
  onReject: (why: string) => Promise<boolean>;
  onReset: () => void;
  onOpen: (f: OpenFile) => void;
}) {
  const [fileAs, setFileAs] = useState(d.fileAs);
  const [rejecting, setRejecting] = useState(false);
  const [why, setWhy] = useState('');
  const isImage = d.mimeType.startsWith('image/') || d.kind === 'photo';
  const facts = [
    KIND_WORD[d.kind] ?? 'Something',
    d.submittedAt && `delivered ${ddmmyyyy(d.submittedAt)}`,
    d.sizeBytes > 0 && mb(d.sizeBytes),
  ].filter(Boolean).join(' · ');

  return (
    <article className="card" aria-label={d.label}>
      <div className="row">
        <span className="avatarlg" style={{ width: '2.75rem', height: '2.75rem' }}>
          {isImage
            ? <PhotoImg fileRef={d.fileRef} alt={d.label} thumb={72}
                        fallback={<Icon name={KIND_ICON[d.kind] ?? 'paper'} size={20} />} />
            : <Icon name={KIND_ICON[d.kind] ?? 'paper'} size={20} />}
        </span>
        {/* A basis, so on a phone Open and Download wrap below the words
            rather than squeezing them into a one-word column. */}
        <span className="grow" style={{ flexBasis: '12rem' }}>
          <strong style={{ fontSize: '0.9375rem' }}>{d.label}</strong>
          <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>{facts}</span>
          {reviewing && <span className="note" style={{ display: 'block' }}>Goes to: {d.goesTo}</span>}
          {d.note && <span className="note" style={{ display: 'block' }}>{d.note}</span>}
        </span>
        {d.fileRef && (
          <FileButtons file={{ name: d.fileName || d.label, fileRef: d.fileRef, mimeType: d.mimeType }}
                       onOpen={onOpen} />
        )}
      </div>

      {reviewing && d.fileTargets.length > 0 && d.review === 'pending' && !rejecting && (
        <div className="field" style={{ marginTop: 'var(--space-sm)' }}>
          <label className="note" htmlFor={`fa-${d.id}`}>File it as</label>
          <select id={`fa-${d.id}`} className="input" value={fileAs}
                  onChange={(e) => setFileAs(e.target.value)}>
            {d.fileTargets.map((o) => <option key={o.k} value={o.k}>{o.v}</option>)}
          </select>
        </div>
      )}

      {!reviewing ? (
        <p className="note" style={{ margin: 'var(--space-sm) 0 0' }}>
          {d.review === 'accepted' && d.filedId ? (
            <>
              {d.filedTable === 'documents' ? "Added to this property's Documents" : 'Added to this property'}
              {d.filedAt && ` · ${ddmmyyyy(d.filedAt)}`}{' · '}
              <Link className="link" to={filedLink(t, d)}>Open it</Link>
            </>
          ) : d.review === 'accepted' ? 'Kept'
            : d.review === 'rejected' ? <>Returned{d.reviewNote && ` · ${d.reviewNote}`}</>
            : t.closed ? 'Not filed' : 'Not decided yet'}
        </p>
      ) : rejecting ? (
        // Returning asks for words, and says who reads them: a "no" with no
        // reason makes the second attempt a guess.
        <div className="stack" style={{ marginTop: 'var(--space-sm)' }}>
          <input className="input" type="text" value={why} aria-label="What is wrong with it"
                 placeholder="Say what is wrong. Your provider sees exactly this."
                 onChange={(e) => setWhy(e.target.value)} />
          <div className="row tight">
            <button type="button" className="btn sm" disabled={busy || !why.trim()}
                    onClick={() => void onReject(why.trim()).then((saved) => {
                      if (!saved) return;
                      setRejecting(false);
                      setWhy('');
                    })}>
              {busy ? 'Saving…' : 'Send back'}
            </button>
            <button type="button" className="btn sm" onClick={() => { setRejecting(false); setWhy(''); }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
          {d.review === 'pending' && (
            <>
              <button type="button" className="btn sm" disabled={busy} onClick={() => onKeep(fileAs)}>
                Keep it
              </button>
              <button type="button" className="btn sm" onClick={() => setRejecting(true)}>
                Return this one
              </button>
            </>
          )}
          {d.review === 'accepted' && (
            <>
              <State state="good">Keeping it</State>
              {!d.filedId && (
                <button type="button" className="btn sm" disabled={busy} onClick={onReset}>
                  Change my mind
                </button>
              )}
            </>
          )}
          {d.review === 'rejected' && (
            <>
              <State state="bad">Returning it</State>
              {d.reviewNote && <span className="note">{d.reviewNote}</span>}
              <button type="button" className="btn sm" disabled={busy} onClick={onReset}>
                Change my mind
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

// ── Details › Provider ─────────────────────────────────────────────────

function ProviderValue({ t }: { t: TicketView }) {
  const name = holderOf(t);
  if (!name) return <span className="note">Not assigned yet</span>;
  const a = t.assignedTo;
  const r = t.assignedResource;
  // A number only while the order is open, and only when the server says this
  // owner may have it; after close there is no contact line at all.
  let contact: ReactNode = null;
  if (!t.closed) {
    if (a?.contactShown && a.contact) {
      const byEmail = a.contact.includes('@');
      const href = byEmail ? `mailto:${a.contact}` : `tel:${a.contact.replace(/[^\d+]/g, '')}`;
      contact = (
        <a className={byEmail ? 'telnum addr' : 'telnum'} href={href}>
          {byEmail ? <MailOutlined sx={{ fontSize: 17 }} aria-hidden /> : <CallOutlined sx={{ fontSize: 17 }} aria-hidden />}
          {a.contact}
        </a>
      );
    } else {
      contact = <span className="note">{a?.contactWhy || 'No number on file.'}</span>;
    }
  }
  return (
    <span style={{ display: 'grid', gap: '0.25rem', justifyItems: 'end' }}>
      <span className="row tight" style={{ justifyContent: 'flex-end' }}>
        <span className="avatarlg" style={{ width: '1.75rem', height: '1.75rem', fontSize: '0.75rem' }} aria-hidden>
          {a?.initials || initialsOf(name)}
        </span>
        <strong>{name}</strong>
        {r?.professionalVerified && <Tag>Verified</Tag>}
        {r && r.ratingCount > 0 && (
          <span className="note" aria-label={`Rated ${r.ratingAverage.toFixed(1)} out of 5`}>
            <StarRounded sx={{ fontSize: 14, verticalAlign: '-2px' }} aria-hidden /> {r.ratingAverage.toFixed(1)}
          </span>
        )}
      </span>
      {contact}
    </span>
  );
}

// ── The page ───────────────────────────────────────────────────────────

export function Ticket() {
  const { id } = useParams<{ id: string }>();
  const [search, setSearch] = useSearchParams();
  const { data, isLoading, error } = useTicket(id);
  // The catalogue says which legacy kinds (`visit`, `opinion`) mean which service.
  const { data: offers } = useServicesOffered('', '', !!data, data?.recordId ?? '');
  const paymentConfig = usePaymentConfig();
  const toast = useToast();
  // At 1200px and under `.split` is one column, and Details moves above
  // Activity so the facts are not under the whole conversation (spec §10).
  const stacked = useNarrow(1200);

  const fund = useFundTicket();
  const reviewDeliverable = useReviewDeliverable();
  const accept = useAcceptTicket();
  const sendBack = useSendBackTicket();
  const cancel = useCancelTicket();
  const postMessage = usePostTicketMessage(false);
  const nudge = useNudgeTicket();
  const rateAssociate = useRateAssociate();

  const [dialog, setDialog] = useState<'' | 'cancel' | 'accept'>('');
  const actionHandled = useRef(false);
  const [inline, setInline] = useState<'' | 'sendback'>('');
  const [err, setErrAt] = useState<{ where: Where; msg: string }>({ where: 'next', msg: '' });
  const [chatMessage, setChatMessage] = useState('');
  const [reporting, setReporting] = useState(false);
  const [allShown, setAllShown] = useState(false);
  const [opened, setOpened] = useState<OpenFile | null>(null);
  const [memberRating, setMemberRating] = useState(0);
  const [ratingNote, setRatingNote] = useState('');
  const [ratingError, setRatingError] = useState('');
  const [sbWhy, setSbWhy] = useState('');
  const composer = useRef<HTMLTextAreaElement>(null);
  const streamList = useRef<HTMLOListElement>(null);
  // After a panel or head action lands, the button that had focus is gone
  // (replaced, or its dialog closed onto an opener the refetch removes), so
  // focus is put on the Next step panel, which always says what happened.
  // An effect, so it runs after a closing Dialog has handed focus back.
  const panelRef = useRef<HTMLElement>(null);
  const panelHead = useId();
  const [landed, setLanded] = useState(0);
  useEffect(() => { if (landed) panelRef.current?.focus(); }, [landed]);

  // A duplicate-order notice links here with `?action=cancel`: this page is
  // the one place that explains what cancelling does to the money.
  useEffect(() => {
    if (!data || actionHandled.current || search.get('action') !== 'cancel') return;
    actionHandled.current = true;
    if (data.can.includes('cancel')) setDialog('cancel');
    const next = new URLSearchParams(search);
    next.delete('action');
    setSearch(next, { replace: true });
  }, [data, search, setSearch]);

  useEffect(() => {
    if (!data) return;
    setMemberRating(data.myRating);
    setRatingNote(data.myRatingNote);
  }, [data?.id, data?.myRating, data?.myRatingNote]);

  // Every state draws the head (design.md § Page head). `null` stays
  // indistinguishable from not-found, so a stranger's id cannot be probed.
  const services = { label: 'Services', to: '/services' };
  // The Details card with its real labels and grey values, so the rail does not move on arrival.
  const skVal = (w: string) => <Sk w={w} style={{ marginLeft: 'auto' }} />;
  const skDetails = (
    <Card title="Details">
      <KV as="dl" className="svc-rows" rows={[
        { k: 'Provider', v: skVal('7rem') }, { k: 'Ordered', v: skVal('5rem') }, { k: 'Order no.', v: skVal('5.5rem') },
      ]} />
      <h3 className="kv-sub">Payment</h3>
      <KV as="dl" className="svc-rows" rows={[{ k: 'Price', v: skVal('4.5rem') }, { k: 'Held', v: skVal('6rem') }]} />
    </Card>
  );
  if (isLoading) {
    // The page's own shape while it reads (spec §9): the head, five quiet
    // steps, the panel and the rail, not one grey slab.
    return (
      <main>
        <PageHead crumbs={[services, { label: 'Service order' }]} title="Service order" />
        <div aria-hidden><OrderTracker steps={STEPS.map((label) => ({ label, state: 'todo' }))} /></div>
        <div className="split loose" role="status" aria-busy="true" aria-label="Loading this order">
          <div className="stack" aria-hidden>
            <Card className="next-step">
              <Sk w="62%" h="1.125rem" />
              <Sk w="44%" style={{ marginTop: '0.625rem' }} />
              <div className="row tight" style={{ marginTop: 'var(--space-md)' }}>
                <Sk w="8.5rem" h="2.25rem" r="var(--radius-pill)" style={{ flex: 'none' }} />
              </div>
            </Card>
            {stacked && skDetails}
            <Card title="Activity">
              <Sk h="4.5rem" r="var(--radius-sm)" />
              {[72, 54, 66].map((w) => <Sk key={w} w={`${w}%`} style={{ marginTop: 'var(--space-md)' }} />)}
            </Card>
          </div>
          {!stacked && <aside className="stack order-rail" aria-hidden>{skDetails}</aside>}
        </div>
      </main>
    );
  }
  if (error) {
    return (
      <main>
        <PageHead crumbs={[services, { label: 'Service order' }]} title="Service order" />
        <Failed what="This order" error={error} boxed h="26rem" />
      </main>
    );
  }
  if (!data) {
    return (
      <main>
        <PageHead crumbs={[services, { label: 'Not found' }]} title="This order is not in your account" />
        <Empty boxed h="26rem" icon="clock"
               action={<Link className="btn" to="/services">Back to Services</Link>}>
          It was cancelled, or it belongs to another account.
        </Empty>
      </main>
    );
  }
  const t: TicketView = data;

  const fail = (where: Where, msg: string) => setErrAt({ where, msg });
  const clearErr = () => setErrAt({ where: 'next', msg: '' });
  const errIn = (where: Where) => (err.msg && err.where === where ? <Err>{err.msg}</Err> : null);
  const openDialog = (d: typeof dialog) => { clearErr(); setDialog(d); };
  const land = () => setLanded((n) => n + 1);
  const closeDialog = () => { clearErr(); setDialog(''); };

  const can = (a: string) => t.can.includes(a);
  const holder = holderOf(t);
  const pending = t.deliverables.filter((d) => d.review === 'pending');
  const kept = t.deliverables.filter((d) => d.review === 'accepted');
  // Only what reached Documents is counted as "added to Documents"; an
  // outline or a site feature lands on the property, not on a shelf.
  const filed = t.deliverables.filter((d) => d.filedId && d.filedTable === 'documents');
  const busy = fund.isPending || reviewDeliverable.isPending || accept.isPending
    || sendBack.isPending || cancel.isPending;

  // ── Money, decided once ──────────────────────────────────────────────
  const holdRows = t.ledger.filter((r) => r.entry === 'hold' && r.status !== 'failed');
  const heldEver = t.money.held > 0 ? t.money.held : holdRows.reduce((s, r) => s + r.amount, 0);
  const heldOn = holdRows[holdRows.length - 1]?.at ?? '';
  const release = t.ledger.filter((r) => r.entry === 'release' && r.status !== 'failed').at(-1);
  const refund = t.ledger.filter((r) => r.entry === 'return' && r.status !== 'failed').at(-1);
  const payFailed = !t.closed && t.money.held <= 0 && t.ledger.some((r) => r.status === 'failed');
  const unfunded = !t.closed && t.money.quoted > 0 && t.money.held <= 0
    && (t.status === 'placed' || t.status === 'sent');
  const paymentsOn = paymentConfig.data?.enabled === true;
  const checkoutHere = !!paymentConfig.data && (paymentsOn || t.money.provider !== 'stub');

  // ── What the buttons do ──────────────────────────────────────────────

  const onFund = async () => {
    clearErr();
    try {
      const res = await fund.mutateAsync({ ticketId: t.id });
      if (!res.web.fundTicket) fail('next', MOVE_FAILED);
      else land();
    } catch { fail('next', MOVE_FAILED); }
  };

  const onNudge = async () => {
    clearErr();
    try {
      const res = await nudge.mutateAsync({ ticketId: t.id });
      if (!res.web.nudgeTicket) fail('next', MOVE_FAILED);
      else land();
    } catch { fail('next', MOVE_FAILED); }
  };

  // No Attach here: a file the owner uploads is readable by the owner alone,
  // so neither the desk nor the provider could open it, and it would land as
  // a loose root file outside Documents (invariant 8). It comes back with a
  // reader, which needs a cross-owner storage grant: Reddy's decision.
  const onPostMessage = async () => {
    const message = chatMessage.trim();
    if (!message) return;
    clearErr();
    try {
      const res = await postMessage.mutateAsync({ ticketId: t.id, message });
      if (!res.web.postTicketMessage) { fail('chat', MESSAGE_REFUSED); return; }
      setChatMessage('');
      setReporting(false);
    } catch {
      fail('chat', MESSAGE_FAILED);
    }
  };

  const onRateAssociate = async () => {
    if (!memberRating) return;
    setRatingError('');
    try {
      const res = await rateAssociate.mutateAsync({ ticketId: t.id, rating: memberRating, note: ratingNote.trim() });
      if (!res.web.rateAssociate) setRatingError(RATING_FAILED);
    } catch {
      setRatingError(RATING_FAILED);
    }
  };

  const onReview = async (deliverableId: string, verdict: string, fileAs: string, note: string): Promise<boolean> => {
    clearErr();
    try {
      const res = await reviewDeliverable.mutateAsync({ deliverableId, review: verdict, fileAs, note });
      if (res.web.reviewDeliverable) return true;
      fail('came', MOVE_FAILED);
    } catch { fail('came', MOVE_FAILED); }
    return false;
  };

  const onAccept = async () => {
    clearErr();
    try {
      const res = await accept.mutateAsync({ ticketId: t.id, note: '' });
      if (!res.web.acceptTicket) { fail('dialog', ACCEPT_FAILED); return; }
      closeDialog();
      land();
    } catch { fail('dialog', ACCEPT_FAILED); }
  };

  const onSendBack = async () => {
    clearErr();
    try {
      const res = await sendBack.mutateAsync({ ticketId: t.id, reason: sbWhy.trim() });
      if (!res.web.sendBackTicket) { fail('came', MOVE_FAILED); return; }
      setInline(''); setSbWhy('');
      land();
    } catch { fail('came', MOVE_FAILED); }
  };

  const onCancel = async (reason: string, payAnyway: number) => {
    clearErr();
    try {
      const res = await cancel.mutateAsync({ ticketId: t.id, reason, payAnyway });
      if (!res.web.cancelTicket) { fail('dialog', MOVE_FAILED); return; }
      closeDialog();
      land();
    } catch { fail('dialog', MOVE_FAILED); }
  };

  const copy = (text: string, done: string) => {
    // Inside a promise, so a browser with no clipboard API lands in the
    // catch rather than throwing out of the click handler.
    void Promise.resolve().then(() => navigator.clipboard.writeText(text))
      .then(() => toast.ok(done))
      .catch(() => toast.bad('That could not be copied. Select it and copy it by hand.'));
  };

  const reportProblem = () => {
    setReporting(true);
    composer.current?.focus();
  };

  // ── The head (spec §1) ───────────────────────────────────────────────
  //
  // No filled primary (§1.4): the decision in hand is the Next step panel's
  // one filled button. The head carries the requester's commands, outlined;
  // under 600px PageHead folds them into the ⋮ itself.
  const serviceKey = serviceKeyOf({ kind: t.kind, serviceKey: '' }, offers);
  // A site visit (or a legacy `visit`, by the catalogue's aliases) says "On
  // site" while it is in progress (spec §2.2); a survey keeps "Since".
  const onSite = serviceKey === 'site_visit';
  const secondaries: HeadAction[] = [];
  if (can('cancel')) secondaries.push({ label: 'Cancel order', onClick: () => openDialog('cancel') });
  if (t.closed) {
    secondaries.push({
      label: 'Order it again',
      to: orderHref(t.recordId, { service: serviceKey }),
    });
  }
  const overflow: MenuItem[] = [{
    label: 'Copy link to this order',
    onClick: () => copy(`${window.location.origin}/services/${t.id}`, 'Link copied'),
  }];

  // ── The Next step panel (spec §6) ────────────────────────────────────

  const payButton = paymentConfig.isLoading ? (
    <span role="status" aria-busy="true" aria-label="Loading your payment options">
      <Sk w="8.5rem" h="2.25rem" r="var(--radius-pill)" />
    </span>
  ) : !paymentConfig.data ? (
    <p role="alert" style={{ margin: 0 }}>
      Payment details could not be loaded.{' '}
      <button type="button" className="linkbtn" onClick={() => { void paymentConfig.refetch(); }}>Retry</button>
    </p>
  ) : null;

  const askButton = can('nudge') ? (
    <button type="button" className="btn" disabled={nudge.isPending} onClick={() => void onNudge()}>
      {nudge.isPending ? 'Asking…' : 'Ask for an update'}
    </button>
  ) : null;
  // Inside the panel's live region, so asking is heard as well as seen.
  const askedNote = !can('nudge') && t.askedAt
    ? `You asked for an update ${new Date(t.askedAt).toDateString() === new Date().toDateString() ? 'today' : 'yesterday'}.`
    : '';

  const quietChip = (words: string) => <StatusChip state="warn">{words}</StatusChip>;
  // ticketing.NUDGE_STATUSES: the provider holds the next move.
  const nudgeable = ['placed', 'sent', 'assigned', 'on_site', 'changes'].includes(t.status);

  let say: ReactNode;
  let second: ReactNode = null;
  let act: ReactNode = null;
  let asked = '';
  let waiting = false;
  /** The panel is the block that needs the payment settings, so a failed
   *  read of them is reported there; otherwise Details reports it. */
  let panelPays = false;
  if (t.status === 'accepted') {
    say = `You accepted this work on ${on(t, 'accept') || ddmmyyyy(t.acceptedAt)}.`;
    second = filed.length > 0
      ? `${plural(filed.length, 'item was', 'items were')} added to this property's Documents.`
      : (t.outcomeNote || null);
  } else if (t.status === 'cancelled') {
    const byDesk = t.events.some((e) => e.kind === 'status' && e.action === 'cancel' && e.actorKind !== 'owner');
    say = `${byDesk ? 'Pattadar desk cancelled' : 'You cancelled'} this order on ${on(t, 'cancel') || ddmmyyyy(t.createdAt)}.`;
    second = t.outcomeNote || null;
  } else if (payFailed) {
    waiting = true;
    say = 'Your payment did not go through.';
    second = 'The provider will not start until it does.';
    act = <Link className="btn primary" to={`/services/${t.id}/pay`}>Try payment again</Link>;
  } else if (t.status === 'submitted') {
    waiting = true;
    say = `Your provider delivered ${plural(t.deliverables.length, 'item')}. Keep or return each, then accept the work.`;
  } else if (unfunded) {
    waiting = true;
    panelPays = true;
    say = paymentsOn || !paymentConfig.data
      ? `Pay ${inrFull(t.money.quoted)} so a provider can start.`
      : `Hold ${inrFull(t.money.quoted)} from your wallet so a provider can start.`;
    second = MONEY_RULE;
    act = payButton ?? (paymentsOn ? (
      <Link className="btn primary" to={`/services/${t.id}/pay`}>Pay {inrFull(t.money.quoted)}</Link>
    ) : (
      <button type="button" className="btn primary" disabled={fund.isPending} onClick={() => void onFund()}>
        {fund.isPending ? 'Holding…' : `Hold ${inrFull(t.money.quoted)}`}
      </button>
    ));
  } else if (nudgeable && t.overdueDays > 0) {
    say = <>This order is {quietChip(`Overdue by ${plural(t.overdueDays, 'day')}`)}</>;
    second = 'Ask for an update and Pattadar desk will follow it up.';
    act = askButton; asked = askedNote;
  } else if (nudgeable && t.quietDays >= 4 && (t.status === 'placed' || t.status === 'sent')) {
    say = <>Still finding a provider · {quietChip(`${plural(t.quietDays, 'day')} so far`)}</>;
    second = 'We will tell you here as soon as a provider accepts.';
    act = askButton; asked = askedNote;
  } else if (nudgeable && t.quietDays >= 4) {
    say = <>No word from your provider · {quietChip(plural(t.quietDays, 'day'))}</>;
    second = 'Ask for an update and Pattadar desk will contact them.';
    act = askButton; asked = askedNote;
  } else if (t.status === 'changes') {
    say = `You sent this back on ${on(t, 'send_back')}. Your provider is reworking it.`;
  } else if (t.status === 'placed' || t.status === 'sent') {
    say = 'Pattadar is finding a provider for this order.';
  } else if (t.status === 'assigned') {
    say = 'Your provider has accepted this order.';
  } else {
    say = 'Your provider is working on this order.';
  }

  const reviewing = t.status === 'submitted' && can('accept');
  const showAccept = reviewing && inline !== 'sendback';
  // Everything returned: the server refuses an acceptance with nothing kept,
  // so the way on is Request changes (or Cancel order in the head).
  const allReturned = pending.length === 0 && kept.length === 0;

  const items = (live: boolean) => (
    <div className="stack">
      {t.deliverables.map((d) => (
        <Deliverable
          key={d.id} t={t} d={d} reviewing={live} busy={busy} onOpen={setOpened}
          onKeep={(fileAs) => void onReview(d.id, 'accepted', fileAs, '')}
          onReject={(why) => onReview(d.id, 'rejected', d.fileAs, why)}
          onReset={() => void onReview(d.id, 'pending', d.fileAs, '')}
        />
      ))}
    </div>
  );

  const review = reviewing ? (
    <>
      {items(true)}
      {showAccept && (
        <div className="row tight" style={{ marginTop: 'var(--space-md)' }}>
          <strong className="grow" style={{ flexBasis: '14rem' }}>
            Keeping {kept.length} of {t.deliverables.length}
            {kept.length > 0 && t.money.held > 0 && ` · when you accept, ${releaseLine(t)}`}
          </strong>
          <button type="button" className={allReturned ? 'btn primary' : 'btn'}
                  onClick={() => { clearErr(); setInline('sendback'); }}>
            Request changes
          </button>
          <button type="button" className={allReturned ? 'btn' : 'btn primary'}
                  disabled={pending.length > 0 || allReturned || accept.isPending}
                  onClick={() => openDialog('accept')}>
            Accept work
          </button>
        </div>
      )}
      {/* Why Accept is off, on screen: a disabled control fires no hover. */}
      {showAccept && (pending.length > 0 || allReturned) && (
        <p className="note" style={{ margin: 'var(--space-sm) 0 0' }}>
          {allReturned
            ? 'You returned everything. Request changes, or cancel the order.'
            : `Decide on every item first. ${plural(pending.length, 'item', 'items')} still waiting.`}
        </p>
      )}
      {inline === 'sendback' && (
        <div className="card" style={{ marginTop: 'var(--space-md)' }}>
          <div className="field">
            <label htmlFor="sb-why">What is missing</label>
            <textarea id="sb-why" rows={3} value={sbWhy} placeholder="Your provider sees exactly this."
                      onChange={(e) => setSbWhy(e.target.value)} />
          </div>
          <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
            <button type="button" className="btn primary" disabled={!sbWhy.trim() || sendBack.isPending}
                    onClick={() => void onSendBack()}>
              {sendBack.isPending ? 'Sending…' : 'Request changes'}
            </button>
            <button type="button" className="btn" onClick={() => setInline('')}>Cancel</button>
          </div>
          {!sbWhy.trim() && (
            <p className="note" style={{ marginTop: 'var(--space-sm)' }}>Say what is missing first.</p>
          )}
        </div>
      )}
      {errIn('came')}
    </>
  ) : null;

  const rating = can('rate') ? (
    <div className="stack sm" style={{ marginTop: 'var(--space-md)' }}>
      <div className="row tight" role="group" aria-label={`Rate ${holder || 'your provider'}`}>
        <span>Rate {holder || 'your provider'}</span>
        {[1, 2, 3, 4, 5].map((value) => (
          <button key={value} type="button" className={`chip${memberRating === value ? ' active' : ''}`}
                  aria-pressed={memberRating === value} onClick={() => setMemberRating(value)}>{value}</button>
        ))}
        <span className="note">out of 5</span>
      </div>
      <label className="field">
        <span>What should Pattadar know?</span>
        <textarea rows={2} maxLength={2000} value={ratingNote} onChange={(e) => setRatingNote(e.target.value)} />
      </label>
      <div className="row tight">
        <button type="button" className="btn primary" disabled={!memberRating || rateAssociate.isPending}
                onClick={() => void onRateAssociate()}>
          {rateAssociate.isPending ? 'Saving…' : t.myRating ? 'Update rating' : 'Save rating'}
        </button>
      </div>
      {ratingError && <Err>{ratingError}</Err>}
    </div>
  ) : null;

  const nextPanel = (
    <Card className={waiting ? 'accent next-step' : 'next-step'} labelledBy={panelHead} ref={panelRef} tabIndex={-1}>
      <h2 id={panelHead} className="sr-only">Next step</h2>
      <div role="status">
        <p className="svc-say" style={{ margin: 0 }}>{say}</p>
        {second && <p className="note" style={{ margin: '0.375rem 0 0' }}>{second}</p>}
        {asked && <p className="note" style={{ margin: '0.375rem 0 0' }}>{asked}</p>}
      </div>
      {act && <div className="row tight" style={{ marginTop: 'var(--space-md)' }}>{act}</div>}
      {review && <div style={{ marginTop: 'var(--space-md)' }}>{review}</div>}
      {rating}
      {t.status === 'accepted' && can('message') && (
        <p className="note" style={{ margin: 'var(--space-md) 0 0' }}>
          Something wrong?{' '}
          <button type="button" className="linkbtn" onClick={reportProblem}>Report a problem</button>
        </p>
      )}
      {errIn('next')}
    </Card>
  );

  // ── Delivered work, when it is not inside the panel (spec §8) ────────
  const deliveredBlock = !reviewing && t.deliverables.length > 0 ? (
    <Card title="Delivered work" aside={<span className="num muted">{t.deliverables.length}</span>}>
      {items(false)}
      {errIn('came')}
    </Card>
  ) : null;

  // ── Details (spec §4) ────────────────────────────────────────────────

  const late = t.overdueDays > 0 && !t.closed;
  const expected = t.dueDate ? (
    <span>
      {ddmmyyyy(t.dueDate)}
      {late && <span style={{ color: 'var(--w-warn)' }}> · <strong style={{ whiteSpace: 'nowrap' }}>Overdue by {plural(t.overdueDays, 'day')}</strong></span>}
    </span>
  ) : null;

  const detailsCard = (
    <Card title="Details">
      <KV as="dl" className="svc-rows" rows={[
        { k: 'Provider', v: <ProviderValue t={t} /> },
        { k: 'Ordered', v: ddmmyyyy(t.createdAt) },
        ...(expected ? [{ k: 'Expected by', v: expected }] : []),
        {
          k: 'Order no.',
          v: (
            <span className="row tight" style={{ justifyContent: 'flex-end' }}>
              <span className="mono">{t.ref}</span>
              <button type="button" className="iconbtn" aria-label="Copy order number"
                      onClick={() => copy(t.ref, 'Order number copied')}>
                <ContentCopyOutlined sx={{ fontSize: 16 }} aria-hidden />
              </button>
            </span>
          ),
        },
        ...(t.detail ? [{ k: 'Why ordered', v: sourceWord(t.detail) }] : []),
        ...t.answers.map((a) => ({ k: a.k, v: a.v })),
        ...(t.files.length > 0 ? [{
          k: 'Your files',
          v: (
            <span style={{ display: 'grid', gap: '0.25rem', justifyItems: 'end' }}>
              <span className="note">{plural(t.files.length, 'file')} you attached</span>
              {t.files.map((f) => (
                <button key={f.id || f.fileRef} type="button" className="linkbtn"
                        onClick={() => setOpened({ name: f.title, fileRef: f.fileRef, mimeType: '' })}>
                  Open {f.title}
                </button>
              ))}
            </span>
          ),
        }] : []),
      ]} />

      <h3 className="kv-sub">Payment</h3>
      <KV as="dl" className="svc-rows" rows={[
        { k: 'Price', v: t.money.quoted > 0 ? inrFull(t.money.quoted) : '—' },
        {
          k: 'Held',
          v: heldEver > 0 ? (
            <span>
              {inrFull(heldEver)}{heldOn && ` · ${heldOn}`}
              {!t.money.live && <span className="note"> · Not charged</span>}
              {checkoutHere && (
                <> · <Link className="link" to={`/services/${t.id}/pay`}>Payment status</Link></>
              )}
            </span>
          ) : 'Nothing held yet',
        },
        ...(t.money.released > 0 ? [{
          k: 'Released',
          v: `${inrFull(t.money.released)}${release?.payee || holder ? ` to ${release?.payee || holder}` : ''}${release?.at ? ` · ${release.at}` : ''}`,
        }] : []),
        ...(t.money.fee > 0 ? [{ k: 'Pattadar fee', v: inrFull(t.money.fee) }] : []),
        ...(t.money.returned > 0 ? [{
          k: 'Refunded',
          v: `${inrFull(t.money.returned)} to ${t.money.provider === 'stub' ? 'your wallet' : 'your payment method'}${refund?.at ? ` · ${refund.at}` : ''}`,
        }] : []),
      ]} />
      {t.money.held > 0 && !t.closed && (
        <p className="note" style={{ margin: 'var(--space-sm) 0 0' }}>{MONEY_RULE}</p>
      )}
      {t.closed && t.money.held > 0 && t.money.provider !== 'stub' && (
        <p role="status" className="note" style={{ margin: 'var(--space-sm) 0 0' }}>
          Waiting for the payment company to confirm.
        </p>
      )}
      {/* The settings read failed and the panel is not the block that needs
          it: said here, once, beside the payment it is about. */}
      {!panelPays && !paymentConfig.isLoading && !paymentConfig.data && (
        <p role="alert" style={{ margin: 'var(--space-sm) 0 0' }}>
          Payment details could not be loaded.{' '}
          <button type="button" className="linkbtn" onClick={() => { void paymentConfig.refetch(); }}>Retry</button>
        </p>
      )}
      <p style={{ margin: 'var(--space-md) 0 0' }}>
        <Link className="link" to={`/properties/${t.recordId}/services`}>All orders for this property</Link>
      </p>
      {errIn('details')}
    </Card>
  );

  // ── Activity (spec §3) ───────────────────────────────────────────────

  const stream = [...t.events]
    .filter((e) => e.kind !== 'payment' && e.kind !== 'dispatch')
    .reverse();
  const shown = allShown ? stream : stream.slice(0, 10);
  const placeholder = reporting ? 'Tell Pattadar desk what is wrong with this work'
    : t.closed ? 'Write to Pattadar desk about this order'
    : holder ? 'Write to your provider and Pattadar desk'
    : 'Write to Pattadar desk';
  const sending = postMessage.isPending;

  const chip = (a: TicketAttachment) => (
    <span key={a.fileRef} className="filechip">
      <Icon name="paper" size={14} />
      <span>{a.fileName}{a.sizeBytes > 0 && ` · ${mb(a.sizeBytes)}`}</span>
      <button type="button" className="linkbtn" aria-label={`Open ${a.fileName}`}
              onClick={() => setOpened({ name: a.fileName, fileRef: a.fileRef, mimeType: a.mimeType })}>Open</button>
    </span>
  );

  const activityCard = (
    <Card title="Activity">
      {can('message') && (
        <form className="chat-compose" style={{ marginTop: 0 }} onSubmit={(event) => {
          event.preventDefault();
          void onPostMessage();
        }}>
          <label className="field">
            <span className="sr-only">Message</span>
            <textarea ref={composer} maxLength={4000} value={chatMessage} placeholder={placeholder}
                      onChange={(event) => setChatMessage(event.target.value)} />
          </label>
          <div className="compose-bar">
            <span className="grow" />
            <button type="submit" className="btn sm primary" disabled={!chatMessage.trim() || sending}>
              <SendOutlined sx={{ fontSize: 15 }} aria-hidden />
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
          {errIn('chat')}
        </form>
      )}

      {stream.length === 0 ? (
        <p className="note svc-say" style={{ margin: 'var(--space-md) 0 0' }}>Nothing has happened on this order yet.</p>
      ) : (
        <ol ref={streamList} className="stream" aria-label="Order activity">
          {shown.map((e, i) => (e.kind === 'message' ? (
            <li key={e.id} className={`stream-msg${e.actorKind === 'owner' ? ' owner' : ''}`}
                tabIndex={i === 10 ? -1 : undefined}>
              <span className="stream-who">{whoSaid(e, holder)} · <When at={e.at} label={e.atLabel} /></span>
              {(e.detail || e.headline) && <div className="chat-bubble">{e.detail || e.headline}</div>}
              {e.attachments.length > 0 && <div className="filechips">{e.attachments.map(chip)}</div>}
            </li>
          ) : (
            <li key={e.id} className="stream-line" tabIndex={i === 10 ? -1 : undefined}>
              <Icon name={EVENT_ICON[e.kind] ?? 'clock'} size={16} />
              <span className="grow">{e.headline}</span>
              <When at={e.at} label={e.atLabel} />
            </li>
          )))}
        </ol>
      )}
      {stream.length > shown.length && (
        <button type="button" className="linkbtn" style={{ marginTop: 'var(--space-sm)' }}
                onClick={() => {
                  // The button goes with the click; the first row it brought
                  // in takes focus, so the reader carries on from there.
                  flushSync(() => setAllShown(true));
                  (streamList.current?.children[10] as HTMLElement | undefined)?.focus();
                }}>
          Show {stream.length - shown.length} earlier
        </button>
      )}
    </Card>
  );

  return (
    <main>
      <PageHead
        crumbs={[services, { label: t.ref }]}
        title={t.title}
        pill={<StatusChip state={t.statusState}>{t.statusLabel}</StatusChip>}
        meta={(
          <span>
            For <Link className="link" to={`/properties/${t.recordId}`}>{t.recordTitle}</Link>
            {t.recordPlace && ` · ${t.recordPlace}`}
          </span>
        )}
        actions={{ secondaries, overflow, overflowLabel: `More actions for ${t.ref}` }}
      />

      <OrderTracker steps={trackerOf(t, payFailed, unfunded, onSite)} />

      <div className="split loose">
        <div className="stack">
          {nextPanel}
          {deliveredBlock}
          {stacked && detailsCard}
          {activityCard}
        </div>
        {!stacked && <aside className="stack order-rail">{detailsCard}</aside>}
      </div>

      {dialog === 'accept' && (
        <AcceptDialog t={t} kept={kept} busy={accept.isPending}
                      error={err.where === 'dialog' ? err.msg : ''}
                      onConfirm={() => void onAccept()} onClose={closeDialog} />
      )}
      {dialog === 'cancel' && (
        <CancelDialog t={t} busy={cancel.isPending}
                      error={err.where === 'dialog' ? err.msg : ''}
                      onConfirm={(reason, payAnyway) => void onCancel(reason, payAnyway)}
                      onClose={closeDialog} />
      )}
      {opened && <FileDialog {...opened} onClose={() => setOpened(null)} />}
    </main>
  );
}
