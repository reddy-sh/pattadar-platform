/** One ordered service, end to end.
 *
 *  This is the screen an owner opens when they want to know where their money
 *  and their surveyor have got to. It has to answer four questions without the
 *  owner ringing anybody: who has it, what has happened, what came back, and
 *  what is set aside against it.
 *
 *  Two nouns, one meaning each. A **service** is the thing that was ordered —
 *  the route, the breadcrumb, and the three page-level states, because those
 *  name the thing you tried to open. A **job** is the work running against it,
 *  which is every body sentence on the page. "Ticket" is retired from anything
 *  a reader sees; it survives only as the name of the GraphQL field, the
 *  mutations, the types and this file, none of which anybody reads.
 *
 *  Three rules shape most of what is drawn here.
 *
 *  The first is that nothing an outsider sends touches the record until the
 *  owner has looked at it. A deliverable is filed on the JOB; it becomes a
 *  paper, a photo, an outline or a feature only when the owner says so, one
 *  item at a time — a survey that comes back with a good sketch and two photos
 *  of the wrong field must not force an all-or-nothing decision, because the
 *  alternative is an owner who accepts rubbish rather than lose the sketch.
 *
 *  The second is that the payments provider is a stub, so no rupee has moved.
 *  Every figure on this page is a record of what a job costs and who it is
 *  owed to. The copy therefore never says paid, charged or settled-to-a-bank;
 *  it says set aside, recorded, and owed, and the colourless `Not charged`
 *  pill sits beside the number rather than a green tick that would vouch for
 *  a payment nobody made.
 *
 *  The third arrived with the roster. One number, in full, on one page: the
 *  person Pattadar put on THIS job, shown to the owner of THIS job, while the
 *  job is live and only if that person agreed their number could be passed on.
 *  Every other contact in this module — every dispatch, every offer, every
 *  desk screen — stays masked, so that a screenshot of a Pattadar page is
 *  never a phone book. The server decides; `Who is on it` below draws what it
 *  is told and invents nothing.
 *
 *  The layout is two columns that are deliberately not the same height. The
 *  main column carries everything with a decision in it, widest first; the
 *  rail carries the three things that are reference material. `.split.loose`
 *  is what stops the shorter column being padded out to the taller one — a
 *  freshly placed job used to draw 1,149px of blank canvas down the middle of
 *  the page, 78% of the column the owner actually reads.
 *
 *  The status word is printed exactly once, by the `State` pill in the header.
 *  Nothing below it repeats it: the trail prints `e.headline`, the person card
 *  prints a date, the money card prints a figure sentence.
 *
 *  The words on this page are the server's wherever the server has an opinion
 *  — `money.headline`, `money.honesty`, `d.goesTo`, `e.headline` — so a figure
 *  and the sentence beside it cannot drift apart on one screen and not the
 *  other. */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import CallOutlined from '@mui/icons-material/CallOutlined';
import MailOutlined from '@mui/icons-material/MailOutlined';
import SendOutlined from '@mui/icons-material/SendOutlined';

import { Dialog } from '../Dialog';
import ShareResult from '../components/ShareResult';
import {
  useAcceptTicket, useAddDeliverable, useAssignAssociate, useAssignRequest, useAssignable,
  useAssociatesForTicket, useCancelTicket, useDispatchTicket, useFundTicket, usePaymentConfig,
  usePostTicketMessage, useRateAssociate, useRevokeDispatch, useReviewDeliverable, useSendBackTicket,
  useStartTicket, useTicket,
} from '../api';
import type { TicketDeliverable, TicketDispatch, TicketView } from '../api';
import type { MenuItem } from '../ui';
import { Card, Crumbs, Empty, Failed, Icon, KV, Loading, Menu, PhotoImg, State, Tag, ddmmyyyy, initialsOf, inr, inrFull, plural } from '../ui';
import { MAX_UPLOAD_BYTES, mb } from '../filePhotos';
import { STORAGE_OFFLINE_MSG, uploadToDrive } from '../../pages/documents/storage';
import { AssignedResourceProof } from '../AssignedResourceProof';

// ── Words ──────────────────────────────────────────────────────────────

const SEND_FAILED =
  'That did not go out. Nothing was sent — check the number or the email and try again.';
const ADD_FAILED =
  'That was not recorded. Nothing was added to this job — check what you typed and try again.';
const MOVE_FAILED =
  'That did not go through. Nothing on this job has changed — reload the page and try again.';
const ACCEPT_FAILED =
  'That was not accepted. Decide on every item first, then try again.';

const KIND_WORD: Record<string, string> = {
  paper: 'A paper', photo: 'A photo',
  boundary: 'A corrected outline', feature: 'Something on the land',
};
const KIND_ICON: Record<string, string> = {
  paper: 'paper', photo: 'photos', boundary: 'map', feature: 'feature',
};
const EVENT_ICON: Record<string, string> = {
  status: 'clock', dispatch: 'agent', deliverable: 'paper',
  filed: 'ok', payment: 'tax', refused: 'warn',
};
const CHANNEL_WORD: Record<string, string> = {
  email: 'Email', whatsapp: 'WhatsApp', sms: 'SMS',
};
/** The condition words a feature comes back with. The values are the four
 *  `condition_state` the record's own features already use, so a deliverable
 *  files as the same kind of thing the gallery draws. */
const CONDITIONS: [string, string][] = [
  ['good', 'Working well'], ['warn', 'Needs attention'],
  ['bad', 'Not working'], ['unknown', 'Not checked'],
];

// ── Small shared bits ──────────────────────────────────────────────────

const Err = ({ children }: { children: ReactNode }) => (
  <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{children}</p>
);

/** Which block on the page raised a failure.
 *
 *  A page-level error string put every failure in one box under the header,
 *  which meant a withdraw that failed in the rail reported itself 800px above
 *  the button that had just been pressed, and a stale failure from one action
 *  was still on screen when the next one opened. Each write now names the
 *  region it belongs to and `<Err>` is drawn as the last child of that region.
 *  `page` is the fallback for a kebab action whose owning card is not on
 *  screen — a kebab action must never be able to fail silently. */
type Where = 'page' | 'came' | 'who' | 'money' | 'sent' | 'chat' | 'dialog';

/** When the status last moved.
 *
 *  The trail is the only place that knows: `TicketView` carries `quietDays`
 *  but not the date it counted from, and re-deriving a date from a day count
 *  and today's clock would drift by one every midnight. The last status line
 *  IS the move, so it is read from there. */
function movedOn(t: TicketView, action?: string): string {
  for (let i = t.events.length - 1; i >= 0; i -= 1) {
    const e = t.events[i];
    if (e.kind !== 'status') continue;
    if (action && e.action !== action) continue;
    if (e.atLabel) return e.atLabel;
  }
  return ddmmyyyy(t.createdAt);
}

/** What accepting is about to do, in one sentence, before it is done.
 *
 *  Built from the server's own `goesTo` for each item rather than restated
 *  here, so the promise in the dialog and the label on the card cannot say
 *  two different things about the same file. */
function planLine(t: TicketView, kept: TicketDeliverable[]): string {
  if (kept.length === 0) {
    return `Nothing is marked to keep, so nothing is added to ${t.recordTitle}. `
      + 'The job is closed and what is set aside is released.';
  }
  const where = kept.map((d) => `“${d.label}” → ${d.goesTo}`).join('; ');
  const outline = kept.some((d) => d.kind === 'boundary')
    ? ' The outline on file is replaced — the one it replaces is kept on this job.'
    : '';
  return `${plural(kept.length, 'item', 'items')} ${kept.length === 1 ? 'goes' : 'go'} onto `
    + `${t.recordTitle}: ${where}.${outline}`;
}

// ── The dialogs ────────────────────────────────────────────────────────
//
// Everything on this page that takes typed work or cannot be undone is a
// dialog rather than an inline panel. The two destructive ones say what will
// happen in plain words before their button does it; the two forms — sending
// the job out, recording what came back — moved out of the page because as
// inline panels they pushed 539px of card down the screen and stretched a
// phone-number input to 1550px in a full-width column.
//
// All four are drawn by `Dialog` rather than by a hand-rolled overlay. The
// pair here used to declare `aria-modal="true"` over markup that trapped
// nothing: Escape closed them, but Tab walked straight out of the dialog and
// into the page behind the dim — every button on the page, the kebab's "Cancel
// this job" included — so a keyboard user could drive controls they could not
// see while the page told a screen reader the rest of it was not there.
// `Dialog` keeps Tab inside, holds Escape and the scrim shut while a write is
// in flight, and hands focus back to whatever opened it.
//
// `initialFocus` picks the safe button in the destructive ones, not the first
// field: the way out of a dialog that cannot be undone should be what the
// keyboard lands on. The two forms focus their first field instead, because
// there is nothing to be careful about and everything to type.
//
// `dismissable={false}` throughout: a pointer that slips onto the dim must not
// throw away a typed phone number, a chosen file or a reason.

/** The safe button — the dialog's footer always opens with it. */
const SAFE_BTN = '.dlg-f .btn';

function AcceptDialog({ t, kept, busy, error, onConfirm, onClose }: {
  t: TicketView; kept: TicketDeliverable[]; busy: boolean; error: string;
  onConfirm: () => void; onClose: () => void;
}) {
  const payout = t.money.held * t.money.payeeShare;

  return (
    <Dialog
      title="Accept and file?" onClose={onClose} busy={busy} initialFocus={SAFE_BTN}
      dismissable={false}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={busy}
                  onClick={onConfirm}>
            {busy ? 'Filing…' : 'Accept and file'}
          </button>
        </>
      )}
    >
      <p className="note" style={{ margin: 0 }}>{planLine(t, kept)}</p>
      <p className="note" style={{ margin: 0 }}>
        {inr(payout)} is recorded as owed to {t.assignee || 'the person who did the work'} and{' '}
        {inr(t.money.held - payout)} to Pattadar. {t.money.honesty}
        {t.money.provider !== 'stub' && ' Payment and refund operations remain pending until the provider confirms them.'}
      </p>
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
  // Clamped here as well as on the server: a figure typed above what is set
  // aside would otherwise print a negative "goes back to your wallet".
  const payAnyway = Math.min(Math.max(Number(pay) || 0, 0), t.money.held);

  return (
    <Dialog
      title="Cancel this job?" onClose={onClose} busy={busy} initialFocus={SAFE_BTN}
      // The reason and the figure are typed work, and a pointer that slips onto
      // the dim should not throw them away — only the two buttons close this.
      dismissable={false}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn danger" disabled={busy}
                  onClick={() => onConfirm(why.trim(), payAnyway)}>
            {busy ? 'Working…' : 'Cancel this job'}
          </button>
        </>
      )}
    >
      <p className="note" style={{ margin: 0 }}>
        {t.assignee || 'Whoever has it'} is told it is off and nothing more can come
        back on it. Anything already filed onto {t.recordTitle} stays where it is —
        this only closes the job. There is no undo.
      </p>
      <div className="field">
        <label htmlFor="cn-why">Why</label>
        <input id="cn-why" type="text" value={why} onChange={(e) => setWhy(e.target.value)} />
      </div>
      {t.money.held > 0 && (
        <>
          <div className="field">
            <label htmlFor="cn-pay">Settle some of the {inr(t.money.held)} set aside</label>
            <input id="cn-pay" type="number" min="0" max={t.money.held} value={pay}
                   onChange={(e) => setPay(e.target.value)} />
          </div>
          <p className="note" style={{ margin: 0 }}>
            {inr(payAnyway)} settled — {inr(payAnyway * t.money.payeeShare)} to{' '}
            {t.assignee || 'the person who did the work'},{' '}
            {inr(payAnyway - payAnyway * t.money.payeeShare)} to Pattadar. The rest,{' '}
            {inr(t.money.held - payAnyway)}, {t.money.provider === 'stub' ? 'goes back to your wallet.' : 'is requested back to the original payment method.'}
            {!t.money.live
              && ' Nothing is charged and nothing is sent — paying online is not switched on yet.'}
          </p>
        </>
      )}
      {error && <Err>{error}</Err>}
    </Dialog>
  );
}

/** Taking the person off without pulling the job.
 *
 *  `unassign` has been in the server's `can` list from the start and had no
 *  control anywhere on this screen, so an owner whose surveyor had gone silent
 *  had exactly one visible exit: cancel the whole job and lose the money set
 *  aside with it. The dialog exists to say, before the button is pressed, that
 *  this one releases nothing. */
function UnassignDialog({ t, busy, error, onConfirm, onClose }: {
  t: TicketView; busy: boolean; error: string;
  onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Dialog
      title="Take them off this job?" onClose={onClose} busy={busy} initialFocus={SAFE_BTN}
      dismissable={false}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Keep them on it</button>
          <button type="button" className="btn danger" disabled={busy} onClick={onConfirm}>
            {busy ? 'Working…' : 'Take them off'}
          </button>
        </>
      )}
    >
      <p className="note" style={{ margin: 0 }}>
        The job goes back to Placed and {inrFull(t.money.held)} stays set aside. It is not a
        cancel and it releases nothing — you can put somebody else on it straight away.
      </p>
      {error && <Err>{error}</Err>}
    </Dialog>
  );
}

// ── One thing that came back ───────────────────────────────────────────

function Deliverable({ d, busy, onKeep, onReject, onReset }: {
  d: TicketDeliverable; busy: boolean;
  onKeep: (fileAs: string) => void;
  onReject: (why: string) => Promise<boolean>;
  onReset: () => void;
}) {
  const [fileAs, setFileAs] = useState(d.fileAs);
  const [rejecting, setRejecting] = useState(false);
  const [why, setWhy] = useState('');

  return (
    <article className="card" aria-label={d.label}>
      <div className="row">
        <span className="avatarlg" style={{ width: '2.75rem', height: '2.75rem' }}>
          <PhotoImg fileRef={d.fileRef} alt={d.label} thumb={72}
                    fallback={<Icon name={KIND_ICON[d.kind] ?? 'paper'} size={20} />} />
        </span>
        <span className="grow">
          <strong style={{ fontSize: '0.9375rem' }}>{d.label}</strong>
          <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>
            {KIND_WORD[d.kind] ?? 'Something'} · sent {ddmmyyyy(d.submittedAt)}
            {d.submittedBy && ` by ${d.submittedBy}`}
          </span>
          <span className="note" style={{ display: 'block' }}>Goes to: {d.goesTo}</span>
          {d.note && <span className="note" style={{ display: 'block' }}>{d.note}</span>}
        </span>
        {d.filedId && <Tag>Filed {ddmmyyyy(d.filedAt)}</Tag>}
      </div>

      {d.fileTargets.length > 0 && d.review === 'pending' && !rejecting && (
        <div className="field" style={{ marginTop: 'var(--space-sm)' }}>
          <label className="note" htmlFor={`fa-${d.id}`}>File it as</label>
          <select id={`fa-${d.id}`} className="input" value={fileAs}
                  onChange={(e) => setFileAs(e.target.value)}>
            {d.fileTargets.map((o) => <option key={o.k} value={o.k}>{o.v}</option>)}
          </select>
        </div>
      )}

      {/* Rejecting asks for words, and says who reads them. A "no" with no
          reason means a second attempt is a guess. */}
      {rejecting ? (
        <div className="stack" style={{ marginTop: 'var(--space-sm)' }}>
          <input className="input" type="text" value={why} aria-label="What is wrong with it"
                 placeholder="Say what is wrong. They see exactly this."
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
            <button type="button" className="btn sm"
                    onClick={() => { setRejecting(false); setWhy(''); }}>
              Keep
            </button>
          </div>
        </div>
      ) : (
        <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
          {d.review === 'pending' && (
            <>
              <button type="button" className="btn sm" disabled={busy}
                      onClick={() => onKeep(fileAs)}>
                Keep it
              </button>
              <button type="button" className="btn sm" onClick={() => setRejecting(true)}>
                Not this one
              </button>
            </>
          )}
          {d.review === 'accepted' && (
            <>
              <State state="good">Keeping it</State>
              {!d.filedId && (
                <button type="button" className="btn sm" disabled={busy}
                        onClick={onReset}>
                  Change my mind
                </button>
              )}
            </>
          )}
          {d.review === 'rejected' && (
            <>
              <State state="bad">Not this one</State>
              {d.reviewNote && <span className="note">{d.reviewNote}</span>}
              <button type="button" className="btn sm" disabled={busy}
                      onClick={onReset}>
                Change my mind
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

// ── One thing that left the building ───────────────────────────────────

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
        {d.revoked && d.revokeReason && (
          <span className="note" style={{ display: 'block' }}>{d.revokeReason}</span>
        )}
        <span className="row tight" style={{ marginTop: '0.25rem' }}>
          <button type="button" className="linkbtn" aria-expanded={shown}
                  onClick={() => setShown((v) => !v)}>
            See what was sent
          </button>
        </span>
        {shown && (
          <div className="card" style={{ marginTop: 'var(--space-sm)' }}>
            {d.subject && <p className="note" style={{ marginTop: 0 }}><strong>{d.subject}</strong></p>}
            <div className="scroll-x">
              <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{d.body}</pre>
            </div>
            {!d.revoked && d.status !== 'failed' && accessPath && <ShareResult path={accessPath} />}
          </div>
        )}
        {/* Withdrawing is confirmed in place rather than in a dialog: the
            consequence is bounded and named right here. */}
        {!d.revoked && (confirming ? (
          <div className="stack" style={{ marginTop: 'var(--space-sm)' }}>
            <p className="note" style={{ margin: 0 }}>
              They are told it is off, and nothing more can come back on it. Anything they
              already sent stays on this job.
            </p>
            <div className="row tight">
              <button type="button" className="btn sm danger" disabled={busy}
                      onClick={onWithdraw}>
                Withdraw
              </button>
              <button type="button" className="btn sm" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </div>
          </div>
        ) : (
          <span className="row tight" style={{ marginTop: '0.25rem' }}>
            <button type="button" className="btn sm" onClick={() => setConfirming(true)}>
              Withdraw
            </button>
          </span>
        ))}
      </span>
    </div>
  );
}

// ── Who is on it ───────────────────────────────────────────────────────
//
// The rail card people open this page for, and three different answers rather
// than one card with holes in it.
//
//   · A Pattadar associate has it. There is a real person behind the name — a
//     discipline, a firm, however many other jobs they are holding — and,
//     while the job is live, a number the owner can press and speak to them
//     on. That is the whole point of keeping a roster: the owner stops ringing
//     Pattadar to ask who is coming and when.
//   · A name somebody typed has it. Nothing is behind that name — no row, no
//     number, nothing Pattadar can do with it — and the card says so instead
//     of drawing a Call button that dials nobody.
//   · Nobody ever had it and the job is closed. Said in one sentence.
//
// The fourth answer — nobody has it and the job is open — is NOT here any
// more. It is `Who can do this` below, full width in the main column, because
// in a 22rem rail every associate's name, firm, areas and button wrapped onto
// five lines each. When that card is on screen this one is not drawn at all:
// a rail card repeating "Nobody is on this yet" beside it is exactly the
// double-print this screen was rebuilt to delete.
//
// Who may see the number is the server's decision and is not re-taken here:
// `contactShown` is true only for this job's owner, only while the job is
// live or has just come back, only when a real associate is on it, and only
// when that associate agreed at enrolment that their number may be passed on.
// Everywhere else in Pattadar the number is masked — a screenshot of any of
// these screens must not be a phone book.

/** What the desk is doing with a job that has nobody on it.
 *
 *  The vocabulary is `work_requests.dispatch_state` (associates.py): '' is
 *  every job the desk has never touched, 'off' is one it has deliberately
 *  stopped looking for somebody for, and the rest all mean the same thing from
 *  the owner's side of the glass — it is on somebody's list. Nothing here
 *  branches on which one, because the difference between them is the desk's
 *  business and phase 1 has no offers to report on anyway. */
const ON_THE_DESK = new Set(['queued', 'working', 'resting', 'ops']);

function WhoIsOnIt({ t, canStart, starting, onStart }: {
  t: TicketView; canStart: boolean; starting: boolean; onStart: () => void;
}) {
  const onSite = canStart ? (
    <button type="button" className="btn sm" disabled={starting} onClick={onStart}>
      {starting ? 'Marking…' : "They're on site"}
    </button>
  ) : null;

  // ─ An associate has it ───────────────────────────────────────────────
  const a = t.assignedTo;
  if (a) {
    // An associate is reached on a phone or by email — `channel_for` takes
    // both — and `tel:g.srinivas@gmail.com` is a dead control wearing a link.
    // The number is stripped to digits because spaces and brackets are for
    // reading, and a `tel:` a phone has to clean up first is one some dialers
    // refuse outright.
    const byEmail = a.contact.includes('@');
    const href = byEmail ? `mailto:${a.contact}` : `tel:${a.contact.replace(/[^\d+]/g, '')}`;
    return (
      <div className="stack sm">
        <div className="row">
          <span className="avatarlg">{a.initials || initialsOf(a.name)}</span>
          <span className="grow">
            <strong style={{ fontSize: '0.9375rem' }}>{a.name}</strong>
            {(a.firm || a.disciplineLabel) && (
              <span className="note" style={{ display: 'block' }}>
                {[a.disciplineLabel, a.firm].filter(Boolean).join(' · ')}
              </span>
            )}
            {/* Three ways somebody comes to be on a job, and the server says
                which: 'the desk' (Pattadar staffed it), 'they took it' (the
                worker accepted an offer), or 'you'.

                This was a two-branch ternary testing for 'desk', and the
                server writes the literal 'the desk' — so the branch was never
                once true and every job Pattadar had staffed told the owner
                "You put them on it". Widening it to three is not tidying: who
                is accountable for the person standing in somebody's field is
                the whole question this line answers, and there are three
                different answers to it. */}
            <span className="note" style={{ display: 'block' }}>
              {a.via === 'the desk' ? 'Put on it by Pattadar'
                : a.via === 'they took it' ? 'They took this job'
                : 'You put them on it'}
              {' on '}
              {a.assignedAt ? ddmmyyyy(a.assignedAt) : movedOn(t, 'assign')}
            </span>
          </span>
        </div>

        {/* The number, or the reason there is not one. Never a masked number
            pretending to be a link, and never a Call button over a contact the
            associate asked Pattadar not to share. */}
        {a.contactShown && a.contact ? (
          <div>
            <a className={byEmail ? 'telnum addr' : 'telnum'} href={href}>
              {byEmail
                ? <MailOutlined sx={{ fontSize: 17 }} aria-hidden />
                : <CallOutlined sx={{ fontSize: 17 }} aria-hidden />}
              {a.contact}
            </a>
            <p className="note" style={{ margin: '0.25rem 0 0' }}>
              {byEmail ? 'Write to them about this job.' : 'Call them about this job.'}{' '}
              Pattadar gave them your land&rsquo;s outline and nothing else.
            </p>
          </div>
        ) : (
          <p className="note" style={{ margin: 0 }}>
            {a.contactWhy
              || 'Pattadar is not showing this number on this job. The desk can reach them.'}
          </p>
        )}

        {/* What else they are carrying, because it is the honest answer to
            "why has nobody turned up yet". */}
        {a.jobsOpen > 1 && (
          <p className="note" style={{ margin: 0 }}>
            Also on {plural(a.jobsOpen - 1, 'other job', 'other jobs')}.
          </p>
        )}
        {t.assignedResource && <AssignedResourceProof resource={t.assignedResource} />}
        {onSite && <div className="row tight">{onSite}</div>}
      </div>
    );
  }

  // ─ A name somebody typed has it ──────────────────────────────────────
  if (t.assignee) {
    return (
      <div className="row">
        <span className="avatarlg">{initialsOf(t.assignee)}</span>
        <span className="grow">
          <strong style={{ fontSize: '0.9375rem' }}>{t.assignee}</strong>
          <span className="note" style={{ display: 'block' }}>
            Assigned {movedOn(t, 'assign')}
          </span>
          {/* Nothing regresses and nothing is invented: this is a name that was
              typed into a box, so there is no number to show and no point
              offering to ring it. Whatever it was actually sent to is on this
              same page, under Sent out, masked. */}
          <span className="note" style={{ display: 'block' }}>
            You typed this name, so Pattadar has no number for them. What you sent the job
            to is under Sent out.
          </span>
        </span>
        {onSite}
      </div>
    );
  }

  // ─ Nobody has it, and nobody ever will ───────────────────────────────
  //
  // Said rather than drawn. An owner looking at a cancelled job wants to know
  // why it has no name on it, and "nobody was ever put on this" is the answer;
  // a picker that refuses every press is not.
  return (
    <p className="note" style={{ margin: 0 }}>
      Nobody was ever put on this job, and it is closed now — there is nothing
      left to hand to anybody.
    </p>
  );
}

// ── Who can do this ────────────────────────────────────────────────────

/** The roster, full width, in the main column.
 *
 *  This is the whole answer on a job nobody is on, which is the commonest and
 *  emptiest state in the system, so it is the block that gets the width. Each
 *  of the two lists it draws has its own three states: the old card collapsed
 *  a failed read and an in-flight one into "nobody is enrolled", which is the
 *  one sentence that is certainly wrong in both cases.
 *
 *  The list is drawn in the server's own order and is deliberately not
 *  re-grouped or re-sorted here: `associatesForTicket` already ranks who fits
 *  THIS job, and a client-side sort would quietly overrule it. */
function WhoCanDoThis({ t, className, error, onError }: {
  t: TicketView; className?: string; error: string; onError: (msg: string) => void;
}) {
  const assignName = useAssignRequest();
  const assignAssociate = useAssignAssociate();
  // This card is only mounted when nobody holds an open job, so both reads are
  // unconditional — the query no longer has to be told not to run.
  const roster = useAssociatesForTicket(t.id);
  const people = useAssignable();
  const [moving, setMoving] = useState('');
  const [picked, setPicked] = useState('');
  const busy = assignName.isPending || assignAssociate.isPending;

  /** Somebody from the roster, put on the job in one press.
   *
   *  Awaited and read. Every write in this module answers false for a move the
   *  machine will not make — a closed job, somebody already on it — and raises
   *  nothing, so a fired-and-forgotten call left the owner looking at an
   *  unchanged card with nothing on screen to say why. */
  const putOn = async (associateId: string) => {
    onError('');
    setMoving(associateId);
    try {
      const res = await assignAssociate.mutateAsync({ requestId: t.id, associateId });
      if (!res.web.assignAssociate) onError(MOVE_FAILED);
    } catch {
      onError(MOVE_FAILED);
    } finally {
      setMoving('');
    }
  };

  /** A name this account has handed work to before. */
  const putOnName = async () => {
    if (!picked) return;
    onError('');
    try {
      const res = await assignName.mutateAsync({ requestId: t.id, assignee: picked });
      if (!res.web.assignRequest) { setPicked(''); onError(MOVE_FAILED); }
    } catch {
      setPicked('');
      onError(MOVE_FAILED);
    }
  };

  return (
    <Card title="Who can do this" className={className}>
      <p className="note svc-say" style={{ marginTop: 0 }}>
        Nobody is on this yet. Put one of the people below on it, or name somebody who has
        worked on your records before.
      </p>

      {/* Phase 2 gives `dispatch_state` a value; today it is '' on every job,
          so this sentence does not render yet. It is written now so that the
          day the desk starts looking, the widest block on a brand-new order
          stops telling a paying customer that finding somebody is their
          problem. */}
      {ON_THE_DESK.has(t.dispatchState) && (
        <p className="note svc-say">
          Pattadar&rsquo;s desk has this on its list to find somebody for. Putting a name on
          it yourself takes it off that list.
        </p>
      )}

      {roster.isLoading ? (
        <Loading h="7rem" what="who can do this" />
      ) : !roster.data ? (
        <Failed what="The list of people" error={roster.error} boxed h="7rem"
                onRetry={() => { void roster.refetch(); }} />
      ) : roster.data.length === 0 ? (
        <p className="note">Nobody has enrolled for this kind of work yet.</p>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="rows boxed">
            {roster.data.map((c) => (
              <div key={c.id}>
                <span className="avatarlg" style={{ width: '2.25rem', height: '2.25rem' }}>
                  {c.initials || initialsOf(c.name)}
                </span>
                <span className="grow">
                  <span className="row tight">
                    <strong style={{ fontSize: '0.9375rem' }}>{c.name}</strong>
                    {c.verified && <Tag>Papers checked</Tag>}
                  </span>
                  <span className="note" style={{ display: 'block' }}>
                    {[c.disciplineLabels[0], c.firm, ...c.areas].filter(Boolean).join(' · ')}
                  </span>
                  {c.why.length > 0 && (
                    <span className="note" style={{ display: 'block' }}>{c.why.join(' · ')}</span>
                  )}
                  {/* Said, rather than used to disable the button. The owner is
                      allowed to put a busy person on their own job; what they
                      are not allowed to do is find out afterwards. */}
                  {!c.acceptsMore && (
                    <span className="note" style={{ display: 'block' }}>
                      Already holding {plural(c.jobsOpen, 'job', 'jobs')}.
                    </span>
                  )}
                </span>
                <button type="button" className="btn sm" disabled={busy}
                        onClick={() => void putOn(c.id)}>
                  {moving === c.id ? 'Putting them on it…' : 'Put them on it'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The names this account has already handed work to. Three states, three
          sentences: a read in flight is not an empty list, and a read that
          failed is not an owner who has never worked with anybody. */}
      {people.isLoading ? (
        <Loading h="3rem" what="the names you have used" />
      ) : !people.data ? (
        <Failed what="The names you have used" error={people.error} boxed h="3rem"
                onRetry={() => { void people.refetch(); }} />
      ) : people.data.length === 0 ? (
        <p className="note svc-say">
          Nobody has worked on your records yet, so there is no name to pick. Send this
          job out instead — Pattadar does the sending, so you can take it back.
        </p>
      ) : (
        <>
          <div className="field">
            <label className="note" htmlFor="tk-assign">Or a name you have used</label>
            <select id="tk-assign" className="input" value={picked} disabled={busy}
                    onChange={(e) => setPicked(e.target.value)}>
              <option value="">Nobody yet</option>
              {people.data.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
            <button type="button" className="btn sm" disabled={!picked || busy}
                    onClick={() => void putOnName()}>
              {assignName.isPending ? 'Putting them on it…' : 'Put on'}
            </button>
          </div>
          {/* Why the button is off, on screen. A disabled control fires no
              hover, so a `title=` on it cannot be read in any browser. */}
          {!picked && (
            <p className="note" style={{ margin: 'var(--space-sm) 0 0' }}>
              Pick a name first — that is who the job goes to.
            </p>
          )}
        </>
      )}

      {error && <Err>{error}</Err>}
    </Card>
  );
}

// ── The page ───────────────────────────────────────────────────────────

export function Ticket() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [search, setSearch] = useSearchParams();
  const { data, isLoading, error } = useTicket(id);
  const paymentConfig = usePaymentConfig();

  const fund = useFundTicket();
  const dispatch = useDispatchTicket();
  const revoke = useRevokeDispatch();
  const start = useStartTicket();
  const addDeliverable = useAddDeliverable();
  const reviewDeliverable = useReviewDeliverable();
  const accept = useAcceptTicket();
  const sendBack = useSendBackTicket();
  const cancel = useCancelTicket();
  const postMessage = usePostTicketMessage(false);
  const rateAssociate = useRateAssociate();
  // Taking the person off is `assignRequest` with an empty name — the server
  // routes that to `unassign` and clears both assignee columns, so there is no
  // second mutation to write.
  const unassign = useAssignRequest();

  // One dialog at a time, and one thing open inline. The five-value `panel`
  // this replaces shared a slot with a separate `accepting` boolean, which is
  // how the accept dialog could open over a send form that was still on screen
  // behind it.
  const [dialog, setDialog] = useState<'' | 'send' | 'record' | 'cancel' | 'unassign' | 'accept'>('');
  const actionHandled = useRef(false);
  const [inline, setInline] = useState<'' | 'sendback'>('');
  const [err, setErrAt] = useState<{ where: Where; msg: string }>({ where: 'page', msg: '' });
  const [chatMessage, setChatMessage] = useState('');
  const [memberRating, setMemberRating] = useState(0);
  const [ratingNote, setRatingNote] = useState('');
  const [ratingError, setRatingError] = useState('');
  const came = useRef<HTMLDivElement>(null);
  // The file picker on "Record what came back" is a real button over this
  // input. A <label> wrapping a hidden input takes no focus and a `hidden`
  // input is out of the tab order, so the scan a surveyor sent back could only
  // be attached with a mouse.
  const pickFile = useRef<HTMLInputElement>(null);

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

  // Sending it back
  const [sbWhy, setSbWhy] = useState('');

  // Duplicate-request notices link here with `?action=cancel`. The job page
  // remains the single place that explains assignment and money consequences;
  // the link opens its existing confirmation instead of inventing a second,
  // less informed cancellation path in the order form.
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

  // Three states, three sentences, and three nouns. The page-level ones name
  // the SERVICE — they are about the thing you tried to open, not about the
  // work running against it. `null` stays deliberately indistinguishable from
  // not-found so a stranger's id cannot be probed.
  if (isLoading) return <main><Loading h="70vh" what="this service" /></main>;
  if (error) return <main><Failed what="This service" error={error} boxed h="26rem" /></main>;
  if (!data) {
    return (
      <main>
        <Empty boxed h="26rem" icon="clock" title="This service is not here">
          It was cancelled, or it belongs to someone else. Anything you set aside against it is
          still in your wallet.
        </Empty>
      </main>
    );
  }
  const t: TicketView = data;

  const fail = (where: Where, msg: string) => setErrAt({ where, msg });
  const clearErr = () => setErrAt({ where: 'page', msg: '' });
  /** The failure, drawn as the last child of the block that raised it. */
  const errIn = (where: Where) =>
    (err.msg && err.where === where ? <Err>{err.msg}</Err> : null);
  // Opening and closing both clear. Today's `open()` clears, but the kebab and
  // the banner set `panel` straight, so a stale failure from another action
  // could render inside a destructive confirmation.
  const openDialog = (d: typeof dialog) => { clearErr(); setDialog(d); };
  const closeDialog = () => { clearErr(); setDialog(''); };
  const toggleInline = (i: typeof inline) => {
    clearErr();
    setInline((v) => (v === i ? '' : i));
  };

  const can = (a: string) => t.can.includes(a);
  const pending = t.deliverables.filter((d) => d.review === 'pending');
  const kept = t.deliverables.filter((d) => d.review === 'accepted');
  const messages = t.events.filter((event) => event.kind === 'message');
  const timeline = t.events.filter((event) => event.kind !== 'message');
  const liveDispatch = [...t.dispatches].reverse().find((d) => !d.revoked);
  const nobody = !t.assignedTo && !t.assignee;
  // Putting somebody on the job is deliberately NOT in here. It is the one
  // write on this page that does not touch what came back, and freezing the
  // review buttons while a name is being picked only ever confused people.
  const busy = fund.isPending || dispatch.isPending || revoke.isPending || start.isPending
    || addDeliverable.isPending || reviewDeliverable.isPending || accept.isPending
    || sendBack.isPending || cancel.isPending || unassign.isPending || postMessage.isPending;

  // ── What the buttons do ──────────────────────────────────────────────

  const onFund = async () => {
    clearErr();
    if (!paymentConfig.data) {
      fail('money', 'Payment settings could not be loaded. Refresh and try again.');
      return;
    }
    if (paymentConfig.data.enabled) {
      navigate(`/app/services/${t.id}/pay`);
      return;
    }
    try {
      const res = await fund.mutateAsync({ ticketId: t.id });
      if (!res.web.fundTicket) fail('money', MOVE_FAILED);
    } catch { fail('money', MOVE_FAILED); }
  };

  const onStart = async () => {
    clearErr();
    try {
      const res = await start.mutateAsync({ ticketId: t.id, note: '' });
      if (!res.web.startTicket) fail('who', MOVE_FAILED);
    } catch { fail('who', MOVE_FAILED); }
  };

  const onPostMessage = async () => {
    const message = chatMessage.trim();
    if (!message) return;
    clearErr();
    try {
      const res = await postMessage.mutateAsync({ ticketId: t.id, message });
      if (!res.web.postTicketMessage) {
        fail('chat', 'That message was not added. This conversation may be closed.');
        return;
      }
      setChatMessage('');
    } catch {
      fail('chat', 'That message did not reach Pattadar. Nothing was sent — try again.');
    }
  };

  const onRateAssociate = async () => {
    if (!memberRating) return;
    setRatingError('');
    try {
      const res = await rateAssociate.mutateAsync({
        ticketId: t.id, rating: memberRating, note: ratingNote.trim(),
      });
      if (!res.web.rateAssociate) setRatingError('That rating was not saved. Reload and try again.');
    } catch {
      setRatingError('That rating was not saved. Reload and try again.');
    }
  };

  const onSend = async () => {
    clearErr();
    try {
      const res = await dispatch.mutateAsync({
        ticketId: t.id, contact: dpContact.trim(), personName: dpName.trim(),
        channel: dpChannel, purpose: dpPurpose, note: dpNote.trim(), expiresDays: 14,
      });
      if (!res.web.dispatchTicket) { fail('dialog', SEND_FAILED); return; }
      closeDialog();
      setDpContact(''); setDpNote(''); setDpPurpose('invite');
    } catch { fail('dialog', SEND_FAILED); }
  };

  /** A second go at somebody who has not answered.
   *
   *  The contact is masked everywhere it is shown — a screenshot of this page
   *  must not be a phone book — so the dialog opens with their name and the
   *  channel it went out on, and asks for the number again rather than sending
   *  a reminder to `g.sr…@gmail.com`. */
  const sendAgain = () => {
    setDpPurpose('nudge');
    if (liveDispatch) {
      setDpName(liveDispatch.personName);
      setDpChannel(liveDispatch.channel || 'auto');
    }
    openDialog('send');
  };

  const onWithdraw = async (dispatchId: string) => {
    clearErr();
    try {
      const res = await revoke.mutateAsync({ dispatchId, reason: '' });
      if (!res.web.revokeDispatch) fail('sent', MOVE_FAILED);
    } catch { fail('sent', MOVE_FAILED); }
  };

  const onAdd = async () => {
    clearErr();
    let fileRef = '';
    let fileName = '';
    let mimeType = '';
    let sizeBytes = 0;
    try {
      if ((dvKind === 'paper' || dvKind === 'photo') && dvFile) {
        if (dvFile.size > MAX_UPLOAD_BYTES) {
          fail('dialog', `${dvFile.name} is ${mb(dvFile.size)}. The limit is `
            + `${mb(MAX_UPLOAD_BYTES)} — nothing was uploaded.`);
          return;
        }
        const node = await uploadToDrive(dvFile);
        if (!node) { fail('dialog', STORAGE_OFFLINE_MSG); return; }
        fileRef = node.id;
        fileName = node.name;
        mimeType = node.mimeType;
        sizeBytes = node.sizeBytes;
      }
      const payload = dvKind === 'boundary' ? JSON.stringify({ ring: dvRing.trim() })
        : dvKind === 'feature' ? JSON.stringify({ condition_state: dvCond })
        : '{}';
      const res = await addDeliverable.mutateAsync({
        ticketId: t.id, kind: dvKind, label: dvLabel.trim(), note: dvNote.trim(),
        fileRef, fileName, mimeType, sizeBytes, payload, fileAs: '', submittedBy: '',
      });
      if (!res.web.addDeliverable) { fail('dialog', ADD_FAILED); return; }
      closeDialog();
      setDvLabel(''); setDvNote(''); setDvRing(''); setDvFile(null); setDvCond('unknown');
      // The kebab is at the top of the page and what it just added is in a
      // block that may be most of a screen down it. This is the one entry
      // point left that can land the owner above the list they have just
      // changed, so it is the one place that still scrolls.
      came.current?.scrollIntoView({ block: 'start' });
    } catch { fail('dialog', ADD_FAILED); }
  };

  const onReview = async (deliverableId: string, verdict: string,
                          fileAs: string, note: string): Promise<boolean> => {
    clearErr();
    try {
      const res = await reviewDeliverable.mutateAsync({
        deliverableId, review: verdict, fileAs, note });
      if (res.web.reviewDeliverable) return true;
      fail('came', MOVE_FAILED);
    } catch { fail('came', MOVE_FAILED); }
    return false;
  };

  /** Reject one submitted item without rejecting the whole job. The owner can
   *  keep the useful work and file it, or use the separate job-level action
   *  to send the whole job back with a reason. */
  const onRejectItem = async (deliverableId: string, fileAs: string, why: string) => {
    return onReview(deliverableId, 'rejected', fileAs, why);
  };

  const onAccept = async () => {
    clearErr();
    try {
      const res = await accept.mutateAsync({ ticketId: t.id, note: '' });
      if (!res.web.acceptTicket) { fail('dialog', ACCEPT_FAILED); return; }
      closeDialog();
    } catch { fail('dialog', ACCEPT_FAILED); }
  };

  const onSendBack = async () => {
    clearErr();
    try {
      const res = await sendBack.mutateAsync({ ticketId: t.id, reason: sbWhy.trim() });
      if (!res.web.sendBackTicket) { fail('came', MOVE_FAILED); return; }
      setInline(''); setSbWhy('');
    } catch { fail('came', MOVE_FAILED); }
  };

  const onCancel = async (reason: string, payAnyway: number) => {
    clearErr();
    try {
      const res = await cancel.mutateAsync({ ticketId: t.id, reason, payAnyway });
      if (!res.web.cancelTicket) { fail('dialog', MOVE_FAILED); return; }
      closeDialog();
    } catch { fail('dialog', MOVE_FAILED); }
  };

  const onUnassign = async () => {
    clearErr();
    try {
      const res = await unassign.mutateAsync({ requestId: t.id, assignee: '' });
      if (!res.web.assignRequest) { fail('dialog', MOVE_FAILED); return; }
      closeDialog();
    } catch { fail('dialog', MOVE_FAILED); }
  };

  // ── Where each action lives ──────────────────────────────────────────
  //
  // Every control is rendered from `t.can`, never from the status string:
  // `can` is the server's own contract, and a screen can never offer a button
  // the API will refuse. An action reaches the kebab only if it is not already
  // a button somewhere on the page, which is what stops one action printing
  // three times — in the header, on its card, and in the menu — the way "Send
  // this to someone" used to. The header carries no primary button at all, so
  // the first tappable thing on a phone is the block that explains the
  // consequence rather than a button that scrolls to a card already on screen.

  const menu: MenuItem[] = [];
  // `deliver` is a button on the dashed empty card while nothing has come
  // back; once there are items, that card is gone and the kebab is its home.
  if (can('deliver') && t.deliverables.length > 0) {
    menu.push({ label: 'Record what came back', onClick: () => openDialog('record') });
  }
  if (can('dispatch')) {
    menu.push(liveDispatch
      ? { label: 'Send it again', onClick: sendAgain }
      : { label: 'Send this to someone', onClick: () => { setDpPurpose('invite'); openDialog('send'); } });
  }
  if (can('unassign')) {
    menu.push({ label: 'Take them off this job', onClick: () => openDialog('unassign') });
  }
  if (can('cancel')) {
    menu.push({ label: 'Cancel this job', onClick: () => openDialog('cancel'), danger: true, rule: true });
  }

  const emptyCame = t.status === 'changes'
    ? `You sent this back on ${movedOn(t, 'send_back')}. When it comes again, record it here.`
    : t.closed
      ? 'Nothing was recorded against this job.'
      : 'Nothing has come back yet. When the sketch, the photos or the report arrive, '
        + `record them here — nothing reaches ${t.recordTitle} until you have looked at `
        + 'them and said yes.';

  // On a fresh job whose only status event is the placement, `movedOn` returns
  // the order date — which the lede already prints one line above. Saying it
  // twice, six pixels apart, is what a "since" clause is for and this is not
  // that case.
  const moved = movedOn(t);
  const since = moved === ddmmyyyy(t.createdAt) ? '' : moved;

  // ── Which block is waiting on the owner ──────────────────────────────
  //
  // Exactly one block is hoisted to the top of the main column and wears the
  // accent ring, and it always means "this is waiting on you". First match
  // wins, and the promoted block is REMOVED from its canonical slot below so
  // it can never draw twice. When nothing is waiting, nothing is promoted and
  // the plain "What happens next" card takes the slot instead.

  const rosterHere = nobody && can('assign') && !t.closed;
  const stalled = !t.closed && t.quietDays >= 4 && (t.quiet || (nobody && can('assign')));
  const promoted = can('accept') ? 'came'
    : rosterHere ? 'who'
    : (!t.money.funded && t.money.quoted > 0 && !t.closed) ? 'money'
    : '';

  const showAccept = can('accept') && inline !== 'sendback';
  const holder = t.assignedTo?.name || t.assignee;

  // ── The blocks ───────────────────────────────────────────────────────

  /** What came back — the items, the verdicts, and the footer that files them. */
  const cameBlock = t.deliverables.length > 0 ? (
    <div ref={came} key="came">
      <Card
        title="What came back"
        aside={<span className="num muted">{t.deliverables.length}</span>}
        // One ring, not two. When this block is promoted the accept footer
        // inside it is already wearing the accent, and nesting a second accent
        // border around it says the same thing twice; the promotion is carried
        // by the position instead.
        className={promoted === 'came' && !showAccept ? 'accent' : undefined}
      >
        <div className="stack">
          {t.deliverables.map((d) => (
            <Deliverable
              key={d.id} d={d} busy={busy}
              onKeep={(fileAs) => void onReview(d.id, 'accepted', fileAs, '')}
              onReject={(why) => onRejectItem(d.id, d.fileAs, why)}
              onReset={() => void onReview(d.id, 'pending', d.fileAs, '')}
            />
          ))}
        </div>

        {/* Accepting is what files the work and releases the money, so the
            footer states both before either happens, under the items it is
            about to accept. */}
        {showAccept && (
          <div className="card accent" style={{ marginTop: 'var(--space-md)' }}>
            <div className="row tight">
              <strong className="grow">
                Keeping {kept.length} of {t.deliverables.length} ·{' '}
                {inr(t.money.held)} {t.money.provider === 'stub' ? 'recorded for settlement with' : 'queued for settlement with'}{' '}
                {t.assignee || 'the person who did the work'}
              </strong>
              {!t.money.live && <span className="pill sim">Not charged</span>}
            </div>
            <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
              <button
                type="button" className="btn primary"
                disabled={pending.length > 0 || accept.isPending}
                onClick={() => openDialog('accept')}
              >
                Accept and file
              </button>
              <button type="button" className="btn" onClick={() => toggleInline('sendback')}>
                Send it back
              </button>
            </div>
            {/* Why the button is off, in the card rather than in a `title=`. A
                disabled control never fires hover, so that tooltip could not be
                read in any browser — the owner saw a bright primary button,
                pressed it, and got nothing back at all, with no way to find out
                what was wanted. */}
            {pending.length > 0 && (
              <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
                Decide on every item first — {plural(pending.length, 'item', 'items')} still
                waiting. An item you have not looked at is not an item you meant to file.
              </p>
            )}
          </div>
        )}

        {/* Sending the whole job back stays inline: the items have to stay
            visible while the reasons are typed about them, and the answer
            lands in place. */}
        {inline === 'sendback' && (
          <div className="card" style={{ marginTop: 'var(--space-md)' }}>
            <div className="field">
              <label htmlFor="sb-why">What is missing</label>
              <textarea id="sb-why" rows={3} value={sbWhy}
                        placeholder="They see exactly this."
                        onChange={(e) => setSbWhy(e.target.value)} />
            </div>
            <p className="note svc-say">
              They get your reasons on the channel this went out on, and can send new
              work back against the same job. Everything already recorded stays on this job.
            </p>
            <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
              <button type="button" className="btn primary"
                      disabled={!sbWhy.trim() || sendBack.isPending}
                      onClick={() => void onSendBack()}>
                {sendBack.isPending ? 'Sending back…' : 'Send it back'}
              </button>
              <button type="button" className="btn" onClick={() => setInline('')}>Cancel</button>
            </div>
            {/* On screen, not in a `title=` a disabled button can never show.
                Sending it back with no words is a second attempt made in the
                dark, which is why the button waits. */}
            {!sbWhy.trim() && (
              <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
                Say what is missing first. These words are all they have to work from.
              </p>
            )}
          </div>
        )}

        {errIn('came')}
      </Card>
    </div>
  ) : null;

  const rosterBlock = rosterHere ? (
    <WhoCanDoThis
      key="who" t={t} className={promoted === 'who' ? 'accent' : undefined}
      error={err.where === 'who' ? err.msg : ''}
      onError={(msg) => (msg ? fail('who', msg) : clearErr())}
    />
  ) : null;

  // The two money controls, on their existing conditions, decided once so the
  // row that holds them is never drawn empty. Both read `paymentConfig.data`,
  // which is why neither is evaluated until the read has landed.
  const checkoutHere = !!paymentConfig.data
    && (paymentConfig.data.enabled || t.money.provider !== 'stub');
  const setAsideHere = paymentConfig.data?.enabled === false
    && t.money.quoted > 0 && !t.money.funded && can('dispatch');

  /** What this costs. Every figure here is a record of what is owed, not of
   *  money that has moved, and the copy and the colourless pill say so. */
  const moneyBlock = (
    <Card key="money" title="What this costs"
          className={promoted === 'money' ? 'accent' : undefined}>
      <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{t.money.headline}</p>
      {!t.money.live && (
        <p style={{ margin: '0.375rem 0 0' }}>
          <span className="pill sim">Not charged</span>
        </p>
      )}
      <p className="note svc-say">{t.money.honesty}</p>
      {t.closed && t.money.held > 0 && t.money.provider !== 'stub' && <p role="status">
        Settlement is pending provider confirmation. Open payment status to check its progress.
      </p>}

      {/* The empty ledger explains why funding matters, and is held back in
          exactly the case where it would say twice what the headline has just
          said. The test is the server's own: `money_headline` returns "Nothing
          set aside yet" whenever held, released and returned are all zero, and
          never consults `quoted` — so comparing the headline string, or
          testing `quoted === 0`, both got an unfunded job with a price wrong
          and printed the same sentence twice, two lines apart. */}
      {t.ledger.length === 0 ? (
        (t.money.held > 0 || t.money.released > 0 || t.money.returned > 0) && (
          <p className="note svc-say">
            Nothing set aside yet. A job with no money behind it is one nobody has a
            reason to start.
          </p>
        )
      ) : (
        <div className="rows svc-rows" style={{ marginTop: 'var(--space-sm)' }}>
          {t.ledger.map((r) => (
            <div key={r.id}>
              <span className="grow">
                <strong style={{ fontSize: '0.875rem' }}>{r.label}</strong>
                <span className="note" style={{ display: 'block' }}>
                  {r.at}
                  {r.payee && ` · ${r.payee}`}
                </span>
              </span>
              <span className="right" style={{ flex: 'none' }}>
                <span className="num" style={{ display: 'block' }}>{inrFull(r.amount)}</span>
                {r.simulated
                  ? <span className="pill sim">Not charged</span>
                  : <State state={r.status === 'failed' ? 'bad' : 'good'}>
                      {r.status === 'failed' ? 'It did not go' : 'Settled'}
                    </State>}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* The money controls live in this card's footer and nowhere else — not
          in the kebab, not in the header. Three states for the read behind
          them: a disabled button is never allowed to stand in for a fetch that
          has not landed. */}
      {paymentConfig.isLoading ? (
        <Loading h="2.25rem" what="your payment options" />
      ) : !paymentConfig.data ? (
        <p role="alert">
          Payment settings could not be loaded.{' '}
          <button type="button" className="linkbtn"
                  onClick={() => { void paymentConfig.refetch(); }}>Retry</button>
        </p>
      ) : (
        <>
          {(checkoutHere || setAsideHere) && (
            <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
              {checkoutHere && (
                <Link className="btn soft" to={`/app/services/${t.id}/pay`}>
                  {t.money.funded || t.closed
                    ? 'Payment and settlement status'
                    : `Open checkout · ${inrFull(t.money.quoted)}`}
                </Link>
              )}
              {setAsideHere && (
                <button type="button" className="btn soft" disabled={fund.isPending}
                        onClick={() => void onFund()}>
                  {fund.isPending ? 'Setting aside…' : `Set ${inrFull(t.money.quoted)} aside`}
                </button>
              )}
            </div>
          )}
          {!t.money.live && !paymentConfig.data.enabled && (
            <p className="note">Adding money to the wallet is not switched on yet.</p>
          )}
        </>
      )}

      {errIn('money')}
    </Card>
  );

  /** What happens next — the plain card that fills the promoted slot when
   *  nothing on this job is waiting on the owner. It is not drawn when there
   *  is nothing true to put in it: a closed job with no outcome note, or an
   *  open one nobody is on and nobody can be put on. */
  const nextBlock = promoted !== '' ? null
    : t.closed ? (t.outcomeNote ? (
      <Card key="next" title="How it ended">
        <p className="svc-say" style={{ margin: 0 }}>{t.outcomeNote}</p>
        {t.acceptedAt && (
          <p className="note" style={{ margin: 'var(--space-sm) 0 0' }}>
            Accepted {ddmmyyyy(t.acceptedAt)}
          </p>
        )}
      </Card>
    ) : null)
    : holder ? (
      <Card key="next" title="What happens next">
        <p className="svc-say" style={{ margin: 0 }}>
          {holder} has this. Nothing is needed from you.
        </p>
      </Card>
    ) : null;

  return (
    <main>
      <Crumbs trail={[
        { label: 'Services', to: '/app/services' },
        { label: t.recordTitle, to: `/app/records/${t.recordId}` },
        { label: t.ref },
      ]} />

      {/* Five rows, and the status word appears exactly once — the `State`
          pill. The stage pips that used to sit beside it printed the same
          word, at the same size, in the same grey, six pixels away, and
          counted a `stage` integer that runs backwards between 'changes' and
          'submitted'. The ref and the record title are in the Crumbs directly
          above, so the eyebrow that printed both again is gone too; the place
          moved to the rail, where the land is the subject. */}
      <header className="pagehead">
        <div className="grow">
          <h1>{t.title}</h1>
          <p className="lede" style={{ marginTop: '0.375rem' }}>
            Ordered {ddmmyyyy(t.createdAt)}
            {t.assignee && <> · with {t.assignee}</>}
            {t.dueDate && <> · due {t.dueDate}</>}
          </p>
          <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
            <State state={t.statusState}>{t.statusLabel}</State>
            {since && <span className="note">since {since}</span>}
          </div>
        </div>
        <div className="actions">
          {menu.length > 0 && <Menu label={`Actions for ${t.ref}`} items={menu} />}
        </div>
      </header>

      {/* A kebab action whose owning card is not on screen has nowhere else to
          report, and a kebab action must never be able to fail silently. */}
      {err.where === 'page' && err.msg && (
        <div className="card" style={{ marginTop: 'var(--space-md)' }}><Err>{err.msg}</Err></div>
      )}

      <div className="split loose" style={{ marginTop: 'var(--space-md)' }}>
        <div className="stack">
          {/* Nothing has moved for days — one banner, two shapes. `quiet` is
              the server's flag and it only covers a job somebody is holding,
              so a job that has sat at Placed for nine days — the commonest
              failure in the system, and the emptiest screen — got no banner at
              all. The second shape fills that gap from two fields the page
              already has rather than by inventing a third. */}
          {stalled && (
            <section className="card alert">
              <h2 style={{ margin: 0, fontSize: '1rem' }}>
                Nothing has happened for {t.quietDays} days.
              </h2>
              {t.quiet ? (
                <>
                  <p className="note svc-say">
                    {t.assignee || 'Nobody'} has not moved this since {moved}. You can send it
                    again, put it on somebody else, or pull the job and get what you set aside back.
                  </p>
                  {/* Three remedies, because the sentence above has promised
                      three for the whole life of this banner and offered two.
                      `unassign` was legal in `can` the entire time with no
                      control anywhere on the page, so an owner with a silent
                      surveyor could only cancel the job outright. */}
                  <div className="row tight">
                    {can('dispatch') && (
                      <button type="button" className="btn sm" onClick={sendAgain}>
                        Send it again
                      </button>
                    )}
                    {can('unassign') && (
                      <button type="button" className="btn sm"
                              onClick={() => openDialog('unassign')}>
                        Take them off this job
                      </button>
                    )}
                    {can('cancel') && (
                      <button type="button" className="btn sm danger"
                              onClick={() => openDialog('cancel')}>
                        Cancel this job
                      </button>
                    )}
                  </div>
                </>
              ) : (
                // No buttons on this shape: the roster is the very next block,
                // so anything here could only scroll to a card already on screen.
                <p className="note svc-say" style={{ marginBottom: 0 }}>
                  Nobody has been put on this yet. Pick somebody below, or cancel it and get
                  what you set aside back.
                </p>
              )}
            </section>
          )}

          {promoted === 'came' ? cameBlock
            : promoted === 'who' ? rosterBlock
            : promoted === 'money' ? moneyBlock
            : nextBlock}

          {promoted !== 'came' && cameBlock}
          {promoted !== 'who' && rosterBlock}

          <Card title="What was asked for">
            {t.answers.length > 0 ? (
              <KV as="dl" className="svc-rows"
                  rows={t.answers.map((a) => ({ k: a.k, v: a.v }))} />
            ) : t.detail ? (
              <p className="svc-say" style={{ margin: 0 }}>{t.detail}</p>
            ) : null}
            <p style={{ margin: 'var(--space-sm) 0 0' }}>
              <Link className="link" to={`/app/records/${t.recordId}`}>
                {[t.recordTitle, t.recordPlace].filter(Boolean).join(' · ')}
              </Link>
            </p>
            {/* The provenance line closes the block rather than leading it.
                `detail` defaults to "Ordered from the properties list", which
                says where the order came from and not what was asked for. With
                no answers at all it is the only sentence there is, so it leads
                above instead and this line says why the rows are missing —
                which is not that the form predates them: an EC's three
                catalogue fields are every one of them optional. */}
            {t.answers.length > 0
              ? t.detail && <p className="note svc-say">{t.detail}</p>
              : <p className="note">No options were set on this order.</p>}
          </Card>

          {promoted !== 'money' && moneyBlock}

          {/* Nothing has come back. One sentence inside a dashed border, and
              deliberately not a `Card`: `Card` forces `pad-lg` and a heading
              row, so it spends 87px of chrome — 24 padding, 23 of h2, 16 of
              cardhead, 24 more padding — around a 39px sentence. 62% chrome is
              the zero-state rule this module wrote down and then broke. */}
          {t.deliverables.length === 0 && (
            <section className="card dashed">
              <p className="note svc-say" style={{ margin: 0 }}>{emptyCame}</p>
              {can('deliver') && (
                <button type="button" className="btn sm"
                        style={{ marginTop: 'var(--space-sm)' }}
                        onClick={() => openDialog('record')}>
                  Record what came back
                </button>
              )}
            </section>
          )}

          {t.closed && t.assignedTo && (
            <Card title="Rate this service">
              <p className="note" style={{ marginTop: 0 }}>
                Your rating helps Pattadar monitor {t.assignedTo.name}. Members with at
                least 100 ratings and an average below 3 stop receiving new work until
                the company records a training decision.
              </p>
              <div className="row tight" role="group" aria-label="Service rating">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button key={value} type="button"
                          className={`chip${memberRating === value ? ' active' : ''}`}
                          aria-pressed={memberRating === value}
                          onClick={() => setMemberRating(value)}>{value}</button>
                ))}
                <span className="note">out of 5</span>
              </div>
              <label className="field" style={{ marginTop: 'var(--space-sm)' }}>
                <span>What should the company know?</span>
                <textarea rows={2} maxLength={2000} value={ratingNote}
                          onChange={(event) => setRatingNote(event.target.value)} />
              </label>
              <button type="button" className="btn primary"
                      disabled={!memberRating || rateAssociate.isPending}
                      onClick={() => void onRateAssociate()}>
                {rateAssociate.isPending ? 'Saving…' : t.myRating ? 'Update rating' : 'Save rating'}
              </button>
              {ratingError && <Err>{ratingError}</Err>}
            </Card>
          )}

          <Card title="Conversation"
                aside={messages.length > 0 ? <span className="num muted">{messages.length}</span> : undefined}>
            {messages.length === 0 ? (
              <p className="note svc-say" style={{ marginTop: 0 }}>
                No messages yet. Updates sent from the worker link appear here with the
                sender and time preserved.
              </p>
            ) : (
              <div className="service-chat" role="log" aria-label="Service conversation">
                {messages.map((message) => (
                  <div key={message.id}
                       className={`chat-message${message.actorKind === 'owner' ? ' owner' : ''}`}>
                    <span className="note">
                      {message.actorLabel || (message.actorKind === 'owner' ? 'You' : 'Pattadar desk')}
                      {' · '}{message.atLabel}
                    </span>
                    <div className="chat-bubble">{message.detail || message.headline}</div>
                  </div>
                ))}
              </div>
            )}
            {t.status !== 'cancelled' && (
              <form className="chat-compose" onSubmit={(event) => {
                event.preventDefault();
                void onPostMessage();
              }}>
                <label className="field">
                  <span className="note">Message the person doing this work or the Pattadar desk</span>
                  <textarea maxLength={4000} value={chatMessage}
                            placeholder="Ask for an update or clarify what you need"
                            onChange={(event) => setChatMessage(event.target.value)} />
                </label>
                <div className="row between">
                  <span className="note">Visible only on this service and its active work link.</span>
                  <button type="submit" className="btn sm primary"
                          disabled={!chatMessage.trim() || postMessage.isPending}>
                    <SendOutlined sx={{ fontSize: 15 }} aria-hidden />
                    {postMessage.isPending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </form>
            )}
            {errIn('chat')}
          </Card>

          {/* The trail, last and in the main column. No event is ever
              re-worded here: `headline` was composed at write time, so a 2027
              rewording cannot re-word a 2026 event.

              A job whose trail is empty says so, rather than drawing a heading
              over a blank box. Both paths that place an order on the web write
              a first line, so an empty trail means a row that predates them —
              a phone-placed order, or one restored without its events — and
              the note says which day it has instead of the trail it does not. */}
          <Card title="Everything that happened">
            {timeline.length === 0 ? (
              <p className="note svc-say">
                Nothing has been recorded against this job. It was placed on{' '}
                {ddmmyyyy(t.createdAt)}, on a screen that did not keep a trail — anything
                that happens from here is written down.
              </p>
            ) : (
              <div className="rows boxed svc-rows">
                {timeline.map((e) => (
                  <div key={e.id}>
                    <span className="avatarlg" style={{ width: '2.25rem', height: '2.25rem' }}>
                      <Icon name={EVENT_ICON[e.kind] ?? 'clock'} size={16} />
                    </span>
                    <span className="grow">
                      <strong style={{ fontSize: '0.9375rem' }}>{e.headline}</strong>
                      {e.detail && (
                        <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>
                          {e.detail}
                        </span>
                      )}
                    </span>
                    <span className="note right" style={{ flex: 'none' }}>
                      {e.atLabel}
                      <span style={{ display: 'block' }}>{e.actorLabel}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <aside className="stack">
          {/* Only the three person branches. When nobody holds an open job this
              card is not drawn at all — `Who can do this` in the main column is
              the whole answer. */}
          {(!nobody || t.closed) && (
            <Card title="Who is on it">
              <WhoIsOnIt t={t} canStart={can('start')} starting={start.isPending}
                         onStart={() => void onStart()} />
              {errIn('who')}
            </Card>
          )}

          {t.dispatches.length === 0 ? (
            <section className="card dashed">
              <p className="note" style={{ margin: 0 }}>Nothing has left the building.</p>
            </section>
          ) : (
            <Card title="Sent out"
                  aside={<span className="num muted">{t.dispatches.length}</span>}>
              <div className="rows boxed">
                {t.dispatches.map((d) => (
                  <Dispatch key={d.id} d={d} busy={revoke.isPending}
                            onWithdraw={() => void onWithdraw(d.id)} />
                ))}
              </div>
              {errIn('sent')}
            </Card>
          )}

          {/* Where the land is, and the two ways back to it. The second link
              used to be stranded after the dialogs, outside the split, and only
              on a closed job — which is the one state in which nobody is going
              to order anything else. */}
          <Card title="On this land">
            <p style={{ margin: 0, fontWeight: 600 }}>{t.recordTitle}</p>
            {t.recordPlace && (
              <p className="note" style={{ margin: '0.125rem 0 0' }}>{t.recordPlace}</p>
            )}
            <p style={{ margin: 'var(--space-sm) 0 0' }}>
              <Link className="link" to={`/app/records/${t.recordId}`}>Open the record ›</Link>
            </p>
            <p style={{ margin: '0.25rem 0 0' }}>
              <Link className="link" to={`/app/records/${t.recordId}/services`}>
                Everything ordered on {t.recordTitle} ›
              </Link>
            </p>
          </Card>
        </aside>
      </div>

      {/* Sending. A dialog rather than the inline panel it used to be: the
          panel pushed 539px of page down before the cards it was about, and
          stretched a phone-number field to the full width of the column.
          `.dlg.wide` is 44rem, which is what makes it an input somebody can
          read a number back from. */}
      {dialog === 'send' && (
        <Dialog
          title="Send this to someone" onClose={closeDialog} busy={dispatch.isPending}
          wide dismissable={false} initialFocus="#dp-name"
          footer={(
            <>
              <button type="button" className="btn" onClick={closeDialog}>Cancel</button>
              <button type="button" className="btn primary"
                      disabled={!dpContact.trim() || dispatch.isPending}
                      onClick={() => void onSend()}>
                {dispatch.isPending ? 'Sending…' : 'Send it'}
              </button>
            </>
          )}
        >
          <p className="note" style={{ margin: 0 }}>
            Pattadar records a revocable work link and sends it when a delivery provider
            is configured. You can also copy it from the dispatch. They see what the job is, where the
            land is, how big it is, what you asked for, what it pays and when it is
            wanted by. Nothing else of yours goes with it. If delivery is not configured,
            copy the recorded link and send it yourself.
          </p>
          {dpPurpose === 'nudge' && (
            <p className="note" style={{ margin: 0 }}>
              This one is a reminder. Their number is kept masked on this page, so type it
              again — it goes out on the channel below.
            </p>
          )}
          <div className="field">
            <label htmlFor="dp-name">Their name</label>
            <input id="dp-name" type="text" value={dpName} placeholder="G. Srinivas"
                   onChange={(e) => setDpName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="dp-contact">Email or phone</label>
            <input id="dp-contact" type="text" value={dpContact}
                   placeholder="98480 12345 or name@example.com"
                   onChange={(e) => setDpContact(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="dp-channel">Send it by</label>
            <select id="dp-channel" className="input" value={dpChannel}
                    onChange={(e) => setDpChannel(e.target.value)}>
              <option value="auto">Whichever reaches them</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="dp-note">Anything else they should know</label>
            <textarea id="dp-note" rows={3} value={dpNote}
                      onChange={(e) => setDpNote(e.target.value)} />
          </div>
          {errIn('dialog')}
          {/* Why the button is off, on screen. It is the same rule the accept
              card follows: a disabled control never fires hover, so a `title`
              on it cannot be read in any browser, and the owner is left
              pressing a bright primary button that does nothing. */}
          {!dpContact.trim() && (
            <p className="note" style={{ margin: 0 }}>
              An email or a phone number first — Pattadar does the writing, so it needs
              somewhere to write to.
            </p>
          )}
        </Dialog>
      )}

      {/* Recording what came back. Nothing here reaches the record — the copy
          says so before the form asks for anything. A dialog because it
          uploads a chosen file to drive before it writes, and a scrim click
          that threw that away would be the loss-of-typed-work failure this
          module keeps a block comment about. */}
      {dialog === 'record' && (
        <Dialog
          title="Record what came back" onClose={closeDialog} busy={addDeliverable.isPending}
          wide dismissable={false} initialFocus="#dv-kind"
          footer={(
            <>
              <button type="button" className="btn" onClick={closeDialog}>Cancel</button>
              <button type="button" className="btn primary"
                      disabled={!dvLabel.trim() || addDeliverable.isPending}
                      onClick={() => void onAdd()}>
                {addDeliverable.isPending ? 'Adding…' : 'Add it'}
              </button>
            </>
          )}
        >
          <p className="note" style={{ margin: 0 }}>
            Nothing here touches {t.recordTitle} yet. File it on the job first, look at
            it, and add it to the record when you are happy with it.
          </p>
          <div className="field">
            <label htmlFor="dv-kind">What is it</label>
            <select id="dv-kind" className="input" value={dvKind}
                    onChange={(e) => setDvKind(e.target.value)}>
              <option value="paper">A paper</option>
              <option value="photo">A photo</option>
              <option value="boundary">A corrected outline</option>
              <option value="feature">Something on the land</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="dv-label">What to call it</label>
            <input id="dv-label" type="text" value={dvLabel}
                   onChange={(e) => setDvLabel(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="dv-note">Notes</label>
            <textarea id="dv-note" rows={2} value={dvNote}
                      onChange={(e) => setDvNote(e.target.value)} />
          </div>
          {(dvKind === 'paper' || dvKind === 'photo') && (
            <div className="row tight">
              {/* A real button over a hidden input, not a <label> wrapping
                  one. The label took no focus and the input is `hidden`, so
                  the tab order went from the notes box straight to "Add it"
                  and a keyboard could record a deliverable with no file on
                  it. The focus ring now lands on the pill you can see. */}
              <input
                ref={pickFile}
                type="file" hidden
                aria-label="The file that came back"
                onChange={(e) => setDvFile(e.target.files?.[0] ?? null)}
              />
              <button type="button" className="btn sm"
                      onClick={() => pickFile.current?.click()}>
                Choose a file
              </button>
              <span className="note">
                {dvFile ? `${dvFile.name} · ${mb(dvFile.size)}` : `Up to ${mb(MAX_UPLOAD_BYTES)}`}
              </span>
            </div>
          )}
          {dvKind === 'boundary' && (
            <div className="field">
              <label htmlFor="dv-ring">The corners</label>
              <textarea id="dv-ring" rows={3} value={dvRing}
                        placeholder="17.123456,80.123456;17.124,80.125;…"
                        onChange={(e) => setDvRing(e.target.value)} />
              <span className="note">
                One corner per pair, latitude then longitude, separated by
                semicolons. Three corners is the fewest that encloses anything.
              </span>
            </div>
          )}
          {dvKind === 'feature' && (
            <div className="field">
              <label htmlFor="dv-cond">What condition it is in</label>
              <select id="dv-cond" className="input" value={dvCond}
                      onChange={(e) => setDvCond(e.target.value)}>
                {CONDITIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          )}
          {errIn('dialog')}
          {/* Said on screen rather than in a `title=`, for the reason the
              accept card gives: a disabled button fires no hover. */}
          {!dvLabel.trim() && (
            <p className="note" style={{ margin: 0 }}>
              Give it a name first. What you call it here is what you will be reading on
              this job in six months.
            </p>
          )}
        </Dialog>
      )}

      {dialog === 'accept' && (
        <AcceptDialog t={t} kept={kept} busy={accept.isPending}
                      error={err.where === 'dialog' ? err.msg : ''}
                      onConfirm={() => void onAccept()}
                      onClose={closeDialog} />
      )}
      {dialog === 'unassign' && (
        <UnassignDialog t={t} busy={unassign.isPending}
                        error={err.where === 'dialog' ? err.msg : ''}
                        onConfirm={() => void onUnassign()}
                        onClose={closeDialog} />
      )}
      {dialog === 'cancel' && (
        <CancelDialog t={t} busy={cancel.isPending}
                      error={err.where === 'dialog' ? err.msg : ''}
                      onConfirm={(reason, payAnyway) => void onCancel(reason, payAnyway)}
                      onClose={closeDialog} />
      )}
    </main>
  );
}
