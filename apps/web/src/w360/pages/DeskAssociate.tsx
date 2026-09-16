/** One associate — everything the desk knows about a person who takes jobs.
 *
 *  This is the file somebody opens when an associate rings to ask why they
 *  stopped getting work, so it is built to answer that: what they do, where
 *  they work, what papers are on file and what state each is in, what they are
 *  holding right now, and an append-only trail of every decision anybody made
 *  about them. There is no rating and there is no score anywhere on this page.
 *  Neither exists, and inventing one here would be inventing a number that
 *  decides somebody's income.
 *
 *  The number is masked until it is asked for. The roster deliberately carries
 *  no contact at all; this page carries one, behind a button, because revealing
 *  a person's phone number should be something a human did rather than
 *  something a page did while they were looking at something else.
 *
 *  Nothing here is an offer screen. Phase 1 sends no offers and runs no timer —
 *  the desk puts people on jobs by hand — so the "how it has gone" figures are
 *  all zero for now and say so in words rather than drawing three zeroes and
 *  letting the reader guess whether that is a bug.
 */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';

import {
  useAssociate, useAssociateEvents, useDesk, useDeleteUnclaimedAssociate,
  useDisciplines, useSetAssociateAreas, useSetAssociateDisciplines,
  useSetAssociateState, useUpdateAssociate,
} from '../api';
import type { Associate, AssociateArea } from '../api';
import { Dialog } from '../Dialog';
import {
  Card, Chip, Crumbs, Empty, Failed, Loading, Menu, State, Tag, ddmmyyyy, plural,
} from '../ui';

/** The review vocabulary, which is `ticket_deliverables`' vocabulary — the same
 *  three words for the same three facts, so a reviewer who has learned one has
 *  learned both. `pending` is colourless on purpose: green would be Pattadar
 *  vouching for a licence nobody has looked at, and amber would raise an alarm
 *  nobody has grounds for. */
const REVIEW: Record<string, { word: string; tone: string }> = {
  verified: { word: 'Verified', tone: 'good' },
  pending: { word: 'Nobody has checked it', tone: 'unknown' },
  rejected: { word: 'Refused', tone: 'bad' },
};

/** A server word this screen has no rule for is humanised rather than dropped.
 *  A blank capsule is the one outcome that tells the reader nothing at all. */
const humanise = (k: string) =>
  (k || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** `associate_disciplines.state` is on | off | blocked and carries no colour of
 *  its own from the server, unlike the person's own state. */
const discTone = (s: string) => (s === 'on' ? 'good' : s === 'blocked' ? 'bad' : 'warn');

/** The five levels `associates.AREA_LEVELS` spells, in the desk's words.
 *  `state` is the one that is not a place: it means no geographic limit at all,
 *  which is exactly right for an advocate and exactly wrong for a surveyor. */
const LEVELS: { key: string; word: string }[] = [
  { key: 'village', word: 'Village' },
  { key: 'mandal', word: 'Mandal' },
  { key: 'city', word: 'City' },
  { key: 'district', word: 'District' },
  { key: 'state', word: 'All of Telangana' },
];

/** What a refused write says. Word for word what every other refusal in this
 *  module says, because the same refusal in two places must not sound like two
 *  different problems. */
const WRITE_FAILED =
  'That did not go through. Nothing about this person has changed — reload the page and try again.';

const Refused = ({ children }: { children: ReactNode }) => (
  <p className="note" role="alert" style={{ margin: 'var(--space-xs) 0 0', color: 'var(--w-danger)' }}>
    {children}
  </p>
);

/** The reason a disabled primary is disabled, printed where the pointer already
 *  is. Never a `title=` — no browser shows one on a disabled control, which is
 *  how a button ends up looking broken instead of looking unready. */
const Why = ({ children }: { children: ReactNode }) => (
  <span className="note">{children}</span>
);

// ── The state change ───────────────────────────────────────────────────

/** Pausing, stopping, or letting somebody take work again.
 *
 *  One dialog for all three because they are one decision with three
 *  directions, and because the reason field is the whole point: an associate
 *  who is stopped and never told why is the failure this trail exists to make
 *  impossible. The reason is mandatory in both directions that take work away,
 *  and the primary stays disabled — with the reason for that printed beside
 *  it — until one is typed.
 */
function StateDialog({ id, name, to, jobsOpen, onClose }: {
  id: string; name: string; to: string; jobsOpen: number; onClose: () => void;
}) {
  const setState = useSetAssociateState();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');

  const needsReason = to === 'paused' || to === 'blocked';
  const ready = !needsReason || reason.trim().length > 0;

  const title = to === 'paused' ? `Pause ${name}`
    : to === 'blocked' ? `Stop ${name} taking work`
      : `Let ${name} take work again`;
  const verb = to === 'paused' ? 'Pause them'
    : to === 'blocked' ? 'Stop them' : 'Let them take work';

  const commit = async () => {
    if (!ready || setState.isPending) return;
    setErr('');
    try {
      const res = await setState.mutateAsync({ id, state: to, reason: reason.trim() });
      if (!res.web.setAssociateState) { setErr(WRITE_FAILED); return; }
      onClose();
    } catch {
      // The reason itself arrives as a toast from the shared mutation helper;
      // this line is what the dialog says about its own state.
      setErr(WRITE_FAILED);
    }
  };

  return (
    <Dialog
      title={title}
      onClose={onClose}
      busy={setState.isPending}
      dismissable={false}
      initialFocus="textarea"
      footer={(
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {!ready && <Why>Type why first — this is what the trail will say, and it is what they are told.</Why>}
          <button type="button" className="btn" onClick={onClose} disabled={setState.isPending}>
            Leave it
          </button>
          <button
            type="button"
            className={to === 'blocked' ? 'btn danger' : 'btn primary'}
            disabled={!ready || setState.isPending}
            onClick={() => { void commit(); }}
          >
            {setState.isPending ? 'Saving…' : verb}
          </button>
        </div>
      )}
    >
      <div className="stack sm">
        <p className="note">
          {to === 'paused'
            ? 'They stop being offered work. Nothing else changes, and you can turn it back on from this page.'
            : to === 'blocked'
              ? 'They stop being offered work and stay stopped until somebody here decides otherwise.'
              : 'They start being offered work again from now on.'}
        </p>
        {/* The sentence that stops the operator assuming a pause clears their
            desk. It does not: the machine never takes a job off anybody. */}
        {needsReason && jobsOpen > 0 && (
          <p className="note">
            They have {plural(jobsOpen, 'job')} in hand. Those stay with them — take each
            one off by hand from the desk if you need to.
          </p>
        )}
        <label className="field">
          {needsReason ? 'Why' : 'Why, if it is worth writing down'}
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={to === 'blocked'
              ? 'Did not turn up twice in Peddapuram and did not answer'
              : 'Away until the end of the month'}
          />
        </label>
        {err && <Refused>{err}</Refused>}
      </div>
    </Dialog>
  );
}

// ── The one hard delete ────────────────────────────────────────────────

/** Removing somebody who never claimed an account.
 *
 *  This exists because an invited associate who never signs in has no Cognito
 *  principal, and the platform's entire erasure model keys on one — so there
 *  would otherwise be no way at all to honour "take me off your list" from
 *  somebody the desk typed in after a phone call. It is the only hard delete in
 *  the module and the dialog names every table it empties, because an operator
 *  who is surprised by what a delete took is an operator who will not use it
 *  when somebody asks them to.
 */
function DeleteDialog({ id, name, kinds, places, papers, onClose, onGone }: {
  id: string; name: string; kinds: number; places: number; papers: number;
  onClose: () => void; onGone: () => void;
}) {
  const del = useDeleteUnclaimedAssociate();
  const [err, setErr] = useState('');

  const commit = async () => {
    if (del.isPending) return;
    setErr('');
    try {
      const res = await del.mutateAsync({ id });
      if (!res.web.deleteUnclaimedAssociate) { setErr(WRITE_FAILED); return; }
      onGone();
    } catch {
      setErr(WRITE_FAILED);
    }
  };

  return (
    <Dialog
      title={`Remove ${name} completely`}
      onClose={onClose}
      busy={del.isPending}
      dismissable={false}
      footer={(
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose} disabled={del.isPending}>
            Keep them
          </button>
          <button type="button" className="btn danger" disabled={del.isPending}
                  onClick={() => { void commit(); }}>
            {del.isPending ? 'Removing…' : 'Remove them'}
          </button>
        </div>
      )}
    >
      <div className="stack sm">
        <p>
          This deletes their name, their number, {plural(kinds, 'kind')} of work,
          {' '}{plural(places, 'place')} they cover, {plural(papers, 'paper')} on file and
          every line of their trail.
        </p>
        <p className="note">
          Nothing is kept and nothing can bring it back.
        </p>
        <p className="note">
          This is only possible because they never signed in and have never been on a
          job. Once somebody claims their record it is their own personal data and it
          leaves through their account&rsquo;s erasure; once they have worked, their name
          is written into an owner&rsquo;s job trail and it stays there.
        </p>
        {err && <Refused>{err}</Refused>}
      </div>
    </Dialog>
  );
}

// ── What they do ───────────────────────────────────────────────────────

/** The disciplines editor.
 *
 *  `setAssociateDisciplines` replaces the whole set rather than adding one, so
 *  the editor is a draft of the whole set and the panel says out loud what
 *  taking one off does. Capacity rides with the kind of work and not with the
 *  person because a surveyor who will take three surveys a week will happily
 *  take six site visits, and one number for both is a number that is wrong for
 *  one of them.
 */
function DisciplinesEditor({ id, current, onClose }: {
  id: string;
  current: { key: string; capacity: number }[];
  onClose: () => void;
}) {
  const save = useSetAssociateDisciplines();
  const catalogue = useDisciplines();
  const [draft, setDraft] = useState<Map<string, number>>(
    () => new Map(current.map((d) => [d.key, d.capacity])),
  );
  const [err, setErr] = useState('');

  const keys = [...draft.keys()];
  const was = current.map((d) => `${d.key}:${d.capacity}`).sort().join('|');
  const now = keys.map((k) => `${k}:${draft.get(k) ?? 3}`).sort().join('|');
  const dirty = was !== now;

  const toggle = (key: string, capacity: number) => setDraft((m) => {
    const next = new Map(m);
    if (next.has(key)) next.delete(key); else next.set(key, capacity);
    return next;
  });

  const commit = async () => {
    if (!dirty || keys.length === 0 || save.isPending) return;
    setErr('');
    try {
      const res = await save.mutateAsync({
        id, disciplines: keys, capacities: keys.map((k) => draft.get(k) ?? 3),
      });
      if (!res.web.setAssociateDisciplines) { setErr(WRITE_FAILED); return; }
      onClose();
    } catch {
      setErr(WRITE_FAILED);
    }
  };

  return (
    <div className="stack sm" style={{ marginTop: 'var(--space-sm)' }}>
      <p className="note">
        Taking a kind of work off this list stops them being offered it. Jobs they
        are already holding are not affected.
      </p>
      {catalogue.isLoading ? <Loading h="8rem" what="the kinds of work" />
        : !catalogue.data ? <Failed what="The kinds of work" error={catalogue.error} boxed h="8rem" />
          : (
            <div className="checks">
              {catalogue.data.map((d) => {
                const on = draft.has(d.key);
                return (
                  <div key={d.key} className="row" style={{ flexWrap: 'nowrap', gap: 'var(--space-sm)' }}>
                    <label className="check grow">
                      <input
                        type="checkbox" checked={on}
                        onChange={() => toggle(d.key, 3)}
                      />
                      <span className="grow">
                        {d.label}
                        <small style={{ display: 'block', color: 'var(--w-ink-3)' }}>
                          {d.blurb || `${d.kinds.join(', ')} · ${d.areaGrain} work`}
                        </small>
                      </span>
                    </label>
                    {/* The capacity only exists for a kind of work they
                        actually do, so it is drawn only when the box is
                        ticked — a stepper beside an unticked line is a
                        control with nothing behind it. */}
                    {on && (
                      <label className="note" style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '0.125rem' }}>
                        At a time
                        <input
                          type="number" min={1} max={20} style={{ width: '4.5rem' }}
                          value={draft.get(d.key) ?? 3}
                          aria-label={`How many ${d.label.toLowerCase()} jobs at a time`}
                          onChange={(e) => {
                            const n = Math.max(1, Math.min(20, Number(e.target.value) || 1));
                            setDraft((m) => new Map(m).set(d.key, n));
                          }}
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          )}
      <div className="row">
        <button
          type="button" className="btn primary"
          disabled={!dirty || keys.length === 0 || save.isPending}
          onClick={() => { void commit(); }}
        >
          {save.isPending ? 'Saving…' : 'Save what they do'}
        </button>
        <button type="button" className="btn" onClick={onClose} disabled={save.isPending}>
          Leave it
        </button>
        {keys.length === 0
          ? <Why>Keep at least one — somebody with no kind of work is never offered anything.</Why>
          : !dirty ? <Why>Nothing has changed yet.</Why> : null}
      </div>
      {err && <Refused>{err}</Refused>}
    </div>
  );
}

// ── Where they work ────────────────────────────────────────────────────

/** The areas editor.
 *
 *  Same shape as the disciplines editor and for the same reason:
 *  `setAssociateAreas` replaces the set, so what is on screen is the whole
 *  answer and Save writes it once. The level is not decoration — a surveyor
 *  who covers *Peddapuram mandal* must not be offered a plot in a *Peddapuram*
 *  locality of a city, and the level is the only thing that tells those two
 *  apart.
 */
function AreasEditor({ id, current, onClose }: {
  id: string; current: AssociateArea[]; onClose: () => void;
}) {
  const save = useSetAssociateAreas();
  const [draft, setDraft] = useState<{ level: string; name: string }[]>(
    () => current.map((a) => ({ level: a.level, name: a.name })),
  );
  const [level, setLevel] = useState('mandal');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [dupe, setDupe] = useState('');

  // 'state' means no geographic limit at all, so it has no name to type. The
  // word that goes on the row is the only thing the select needs to decide.
  const wholeState = level === 'state';
  const typed = wholeState ? 'Telangana' : name.trim();

  const was = current.map((a) => `${a.level}:${a.name}`).sort().join('|');
  const now = draft.map((a) => `${a.level}:${a.name}`).sort().join('|');
  const dirty = was !== now;

  /** The same fold the server uses to decide whether two places are one place,
   *  in its simplest form: a duplicate that only differs by case or a bracketed
   *  qualifier is a duplicate, and adding it twice would put "Peddapuram" and
   *  "Peddapuram (R)" on the same person as two different places. */
  const foldName = (s: string) =>
    s.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, '');

  const add = () => {
    if (!typed) return;
    const already = draft.some(
      (a) => a.level === level && foldName(a.name) === foldName(typed),
    );
    if (already) { setDupe(`${typed} is already on the list.`); return; }
    setDupe('');
    setDraft((d) => [...d, { level, name: typed }]);
    setName('');
  };

  const commit = async () => {
    if (!dirty || draft.length === 0 || save.isPending) return;
    setErr('');
    try {
      const res = await save.mutateAsync({
        id, areas: draft.map((a) => `${a.level}:${a.name}`),
      });
      if (!res.web.setAssociateAreas) { setErr(WRITE_FAILED); return; }
      onClose();
    } catch {
      setErr(WRITE_FAILED);
    }
  };

  return (
    <div className="stack sm" style={{ marginTop: 'var(--space-sm)' }}>
      <div className="row tight">
        {draft.length === 0 ? (
          <p className="note">Nowhere yet.</p>
        ) : draft.map((a) => (
          <span key={`${a.level}:${a.name}`} className="fchip">
            <span className="grp">{LEVELS.find((l) => l.key === a.level)?.word ?? a.level}</span>
            <span className="val">{a.name}</span>
            <button
              type="button"
              aria-label={`Remove ${a.name}`}
              onClick={() => setDraft((d) => d.filter(
                (x) => !(x.level === a.level && x.name === a.name),
              ))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ width: '10rem' }}>
          Level
          <select value={level} onChange={(e) => { setLevel(e.target.value); setDupe(''); }}>
            {LEVELS.map((l) => <option key={l.key} value={l.key}>{l.word}</option>)}
          </select>
        </label>
        {wholeState ? (
          <p className="note" style={{ paddingBottom: '0.5625rem' }}>
            Everywhere — no local presence needed. An advocate opines on Nizamabad
            land from Hyderabad.
          </p>
        ) : (
          <label className="field grow">
            Place
            <input
              type="text" value={name}
              placeholder="Peddapuram"
              onChange={(e) => { setName(e.target.value); setDupe(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            />
          </label>
        )}
        <button type="button" className="btn" disabled={!typed} onClick={add}>Add</button>
        {!typed && <Why>Type the place first.</Why>}
      </div>
      {dupe && <p className="note">{dupe}</p>}
      <div className="row">
        <button
          type="button" className="btn primary"
          disabled={!dirty || draft.length === 0 || save.isPending}
          onClick={() => { void commit(); }}
        >
          {save.isPending ? 'Saving…' : 'Save where they work'}
        </button>
        <button type="button" className="btn" onClick={onClose} disabled={save.isPending}>
          Leave it
        </button>
        {draft.length === 0
          ? <Why>Keep at least one place — somebody who covers nowhere is never offered anything.</Why>
          : !dirty ? <Why>Nothing has changed yet.</Why> : null}
      </div>
      {err && <Refused>{err}</Refused>}
    </div>
  );
}

// ── How to reach them ──────────────────────────────────────────────────

/** The number, and the one switch that decides whether an owner ever sees it.
 *
 *  Masked at rest and revealed by a button, so that the number appearing on a
 *  screen is always something a person did. The reveal is drawn only when the
 *  server actually sent a number to reveal — a Show button over nothing is the
 *  definition of a dead control.
 */
function Reach({ id, masked, contact, visible, name }: {
  id: string; masked: string; contact: string; visible: boolean; name: string;
}) {
  const update = useUpdateAssociate();
  const [shown, setShown] = useState(false);
  const [err, setErr] = useState('');

  const flip = async (on: boolean) => {
    if (update.isPending) return;
    setErr('');
    try {
      // Only `contactVisible` is sent. Every string argument defaults to "" and
      // means "leave this alone" — which is precisely why the boolean is
      // nullable in the schema and the strings are not.
      const res = await update.mutateAsync({ id, contactVisible: on });
      if (!res.web.updateAssociate) setErr(WRITE_FAILED);
    } catch {
      setErr(WRITE_FAILED);
    }
  };

  return (
    <div className="stack sm">
      <div className="row tight">
        {shown && contact ? (
          <a className="link mono" href={`tel:${contact}`}>{contact}</a>
        ) : (
          <span className="mono">{masked || 'No number on file'}</span>
        )}
        {contact && !shown && (
          <button type="button" className="btn sm" onClick={() => setShown(true)}>
            Show the number
          </button>
        )}
        {shown && (
          <button type="button" className="btn sm" onClick={() => setShown(false)}>Hide it</button>
        )}
      </div>
      {!contact && masked && (
        <p className="note">
          The full number is not sent to this screen. Whoever enrolled them has it,
          and Pattadar writes to them without anybody reading it out.
        </p>
      )}

      <label className="check">
        <input
          type="checkbox" checked={visible} disabled={update.isPending}
          onChange={(e) => { void flip(e.target.checked); }}
        />
        <span>An owner may see this number while they are on that owner&rsquo;s job</span>
      </label>
      <p className="note">
        {visible
          ? `They agreed that an owner can see this number while ${name} is on that owner's job. Nowhere else — every offer stays masked.`
          : 'They asked that owners not be given this number. Pattadar does the writing instead.'}
      </p>
      {err && <Refused>{err}</Refused>}
    </div>
  );
}

// ── The page ───────────────────────────────────────────────────────────

/** The page once the person has actually loaded.
 *
 *  A component of its own so that the route below can say its three states in
 *  three sentences and mean them. Written inline, the loaded branch would be
 *  four hundred lines of JSX hanging off the end of a ternary, and the first
 *  person to tidy that would collapse it into `isLoading || !data` — which
 *  draws a skeleton that can never resolve, because react-query settles a
 *  twice-failed read into `isLoading: false, data: undefined` and leaves it
 *  there. */
function Person({ a, onGone }: { a: Associate; onGone: () => void }) {
  const events = useAssociateEvents(a.id);
  // Cross-owner, and already audited as one read: the desk's own list is the
  // only place in the API that knows which jobs are on which associate, and
  // "what are they holding" is the first question anybody opens this page with.
  const desk = useDesk('all');

  const [stateTo, setStateTo] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState<'' | 'what' | 'where'>('');

  /** Every job the desk is tracking that is on this person.
   *  `silent` is a slice of the same set — a job nobody has touched for four
   *  days is still a job they hold — so the two lists are merged and deduped
   *  rather than drawn twice. */
  const theirJobs = useMemo(() => {
    const d = desk.data;
    if (!d) return [];
    const seen = new Set<string>();
    return [...d.jobs, ...d.silent].filter((j) => {
      if (j.assigneeRef !== a.id || seen.has(j.ticketId)) return false;
      seen.add(j.ticketId);
      return true;
    });
  }, [desk.data, a.id]);

  const roles = a.disciplines.map((d) => d.label).join(', ');
  const places = a.areas.map((x) => x.label || x.name).join(', ');

  /** What the head menu offers, and nothing it cannot do. There is no Retire
   *  and no "send the claim link again": phase 1 mints no claim links and the
   *  four states are the four states. A menu item that would do nothing is a
   *  lie told in one word. */
  const menu = [
    ...(a.state === 'active' || a.state === 'invited'
      ? [{ label: 'Pause them', onClick: () => setStateTo('paused') }] : []),
    ...(a.state === 'paused' || a.state === 'blocked'
      ? [{ label: 'Let them take work again', onClick: () => setStateTo('active') }] : []),
    ...(a.state !== 'blocked'
      ? [{ label: 'Stop them taking work', danger: true, onClick: () => setStateTo('blocked') }] : []),
    // The server refuses this for anybody who has claimed a record or has ever
    // been on a job — their history is somebody else's ticket trail — so the
    // item is not drawn for them either. A menu item that always answers false
    // is a dead control with a confirmation dialog in front of it.
    ...(!a.claimed && a.jobsOpen === 0 && a.jobsDone === 0
      ? [{ label: 'Remove them completely', danger: true, rule: true, onClick: () => setDeleting(true) }] : []),
  ];

  return (
    <>
      <header className="pagehead">
        {/* `.grow` has to ride on the pagehead's own child — `.pagehead .grow`
            is what claims the leftover width — so the avatar and the name sit
            inside it rather than beside it. */}
        <div className="row grow" style={{ flexWrap: 'nowrap', gap: 'var(--space-md)' }}>
          <span className="avatarlg">{a.initials}</span>
          <div style={{ minWidth: 0 }}>
            <h1>{a.name}</h1>
            <p className="lede" style={{ marginTop: '0.25rem' }}>
              {[roles, places, a.createdAt ? `with us since ${ddmmyyyy(a.createdAt)}` : '']
                .filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="actions">
          <State state={a.stateState}>{a.stateWord}</State>
          {menu.length > 0 && <Menu label={`What to do about ${a.name}`} header={a.name} items={menu} />}
        </div>
      </header>

      {/* The reason somebody is paused or stopped belongs beside the word, not
          buried in the trail: an operator who cannot see why will undo it. */}
      {a.stateReason && (
        <p className="note" style={{ marginTop: 'calc(var(--space-sm) * -1)' }}>
          {a.stateWord}: {a.stateReason}
        </p>
      )}

      <div className="split" style={{ marginTop: 'var(--space-md)' }}>
        <div className="stack">
          <Card
            title="What they do"
            aside={editing !== 'what' ? (
              <button type="button" className="btn sm" onClick={() => setEditing('what')}>
                Change
              </button>
            ) : undefined}
          >
            {a.disciplines.length === 0 ? (
              <p className="note">
                Nothing yet. Until a kind of work is on this list they cannot be put on
                anything.
              </p>
            ) : (
              <div className="rows">
                {a.disciplines.map((d) => (
                  <div key={d.key}>
                    <span className="grow">
                      <strong style={{ fontSize: '0.875rem' }}>{d.label}</strong>
                      {d.credentialState && (
                        <span className="note" style={{ display: 'block' }}>
                          {humanise(d.credentialState)}
                        </span>
                      )}
                    </span>
                    {d.state !== 'on' && (
                      <State state={discTone(d.state)}>{d.stateWord || humanise(d.state)}</State>
                    )}
                    <span className="note mono" style={{ whiteSpace: 'nowrap' }}>
                      {d.openCount} of {d.capacity} in hand
                    </span>
                  </div>
                ))}
              </div>
            )}
            {editing === 'what' && (
              <DisciplinesEditor
                id={a.id}
                current={a.disciplines.map((d) => ({ key: d.key, capacity: d.capacity }))}
                onClose={() => setEditing('')}
              />
            )}
          </Card>

          <Card
            title="Where they work"
            aside={editing !== 'where' ? (
              <button type="button" className="btn sm" onClick={() => setEditing('where')}>
                Change
              </button>
            ) : undefined}
          >
            {a.areas.length === 0 ? (
              <p className="note">
                Nowhere yet. Somebody who covers nowhere is never offered anything.
              </p>
            ) : (
              <div className="row tight">
                {a.areas.map((x) => <Chip key={x.id} wash>{x.label || x.name}</Chip>)}
              </div>
            )}
            {editing === 'where' && (
              <AreasEditor id={a.id} current={a.areas} onClose={() => setEditing('')} />
            )}
          </Card>

          <Card title="Papers" aside={<span className="num muted">{a.credentials.length}</span>}>
            {a.credentials.length === 0 ? (
              <p className="note">
                Nothing on file. A paper you have verified and that then expires will
                pause that kind of work; a paper you never added does not — so an empty
                list here stops nobody working.
              </p>
            ) : (
              <div className="rows">
                {a.credentials.map((c) => {
                  const r = REVIEW[c.review] ?? { word: humanise(c.review), tone: 'unknown' };
                  return (
                    <div key={c.id}>
                      <span className="grow">
                        <span className="row tight">
                          <strong style={{ fontSize: '0.875rem' }}>{c.kind}</strong>
                          {c.numberMasked && <span className="note mono">{c.numberMasked}</span>}
                        </span>
                        <span className="note" style={{ display: 'block' }}>
                          {[c.authority, c.discipline].filter(Boolean).join(' · ')}
                          {c.reviewNote ? ` — ${c.reviewNote}` : ''}
                        </span>
                      </span>
                      {c.lapsed ? <Tag alert>Lapsed {ddmmyyyy(c.expiresOn)}</Tag>
                        : c.expiring ? <Tag alert>{plural(c.daysLeft, 'day')} left</Tag>
                          : c.expiresOn ? (
                            <span className="note" style={{ whiteSpace: 'nowrap' }}>
                              Good until {ddmmyyyy(c.expiresOn)}
                            </span>
                          ) : <span className="note">No expiry recorded</span>}
                      <State state={r.tone}>{r.word}</State>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Verifying and refusing a paper is not in this phase, so no
                button pretends to. What IS true today is said instead. */}
            <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
              Papers are recorded, not gating. Nothing here decides whether they can be
              put on a job.
            </p>
          </Card>

          <Card
            title="Jobs"
            aside={(
              <span className="note">
                {a.jobsOpen > 0 ? `${a.jobsOpen} in hand` : 'Nothing in hand'}
                {a.jobsDone > 0 ? ` · ${plural(a.jobsDone, 'job')} done` : ''}
              </span>
            )}
          >
            {desk.isLoading ? <Loading h="7rem" what="their jobs" />
              : !desk.data ? <Failed what="Their jobs" error={desk.error} boxed h="7rem" />
                : theirJobs.length === 0 ? (
                  <p className="note">
                    Nothing of theirs is on the desk right now. Put them on a job from
                    the job&rsquo;s own page.
                  </p>
                ) : (
                  <div className="rows">
                    {theirJobs.map((j) => (
                      <div key={j.ticketId}>
                        <span className="grow">
                          <span className="row tight">
                            <strong style={{ fontSize: '0.875rem' }}>{j.serviceLabel}</strong>
                            <span className="mono note">{j.ref}</span>
                          </span>
                          <span className="note" style={{ display: 'block' }}>{j.place}</span>
                        </span>
                        <State state={j.statusState}>{j.statusLabel}</State>
                        <Link className="btn sm" to={`/app/desk/jobs/${j.ticketId}`}>Open</Link>
                      </div>
                    ))}
                  </div>
                )}
          </Card>
        </div>

        <aside className="stack">
          <Card title="How to reach them">
            <Reach
              id={a.id} name={a.name} masked={a.contactMasked} contact={a.contact}
              visible={a.contactVisible}
            />
            {a.claimed ? (
              <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
                They have signed in and this record is theirs. It leaves Pattadar through
                their own account, not from this page.
              </p>
            ) : (a.jobsOpen > 0 || a.jobsDone > 0) && (
              <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
                They have been on jobs, so their record stays — their name is written into
                an owner&rsquo;s job trail and nothing here can take it back out.
              </p>
            )}
            {a.note && (
              <p className="note" style={{ marginTop: 'var(--space-sm)' }}>{a.note}</p>
            )}
          </Card>

          <Card title="How it has gone">
            {a.offersSent === 0 ? (
              <p className="note">
                Nothing has been offered to anybody yet. Pattadar does not send offers —
                the desk puts people on jobs by hand, and that is what the trail below
                records.
              </p>
            ) : (
              <div className="stack sm">
                <p className="note">
                  {plural(a.offersSent, 'offer')} sent · {a.offersTaken} taken
                  {' '}· {a.offersDeclined} turned down
                </p>
                {/* Below five offers there is no rate worth printing. Four out
                    of four is 100% and means nothing whatever. */}
                {a.offersSent >= 5 && (
                  <p className="note">They have taken {a.offersTaken} of {a.offersSent}.</p>
                )}
                {a.lastOfferedAt && (
                  <p className="note">Last offered {ddmmyyyy(a.lastOfferedAt)}.</p>
                )}
              </div>
            )}
            <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
              Nothing here changes what they are offered. Stopping somebody is a decision
              you make, not one the system makes.
            </p>
          </Card>

          <Card title="Everything that happened">
            {events.isLoading ? <Loading h="8rem" what="their trail" />
              : !events.data ? <Failed what="Their trail" error={events.error} boxed h="8rem" />
                : events.data.length === 0 ? (
                  <p className="note">
                    Nothing yet beyond being written down. Every decision anybody makes
                    about them lands here and stays.
                  </p>
                ) : (
                  <div className="rows">
                    {events.data.map((e) => (
                      <div key={e.id}>
                        <span className="grow">
                          <span style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500 }}>
                            {e.headline}
                          </span>
                          {e.detail && (
                            <span className="note" style={{ display: 'block' }}>{e.detail}</span>
                          )}
                          <span className="note" style={{ display: 'block' }}>
                            {[e.actorLabel, e.atLabel].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
          </Card>
        </aside>
      </div>

      {stateTo && (
        <StateDialog
          id={a.id} name={a.name} to={stateTo} jobsOpen={a.jobsOpen}
          onClose={() => setStateTo('')}
        />
      )}
      {deleting && (
        <DeleteDialog
          id={a.id} name={a.name}
          kinds={a.disciplines.length} places={a.areas.length} papers={a.credentials.length}
          onClose={() => setDeleting(false)}
          onGone={() => { setDeleting(false); onGone(); }}
        />
      )}
    </>
  );
}

// ── The route ──────────────────────────────────────────────────────────

export function DeskAssociate() {
  const { id = '' } = useParams();
  const { data, isLoading, error } = useAssociate(id);
  /** The delete succeeded and this person no longer exists. Held here rather
   *  than navigating away: the operator has just destroyed something on
   *  purpose and the page should say so in the place they were looking,
   *  rather than dropping them on a roster and leaving them to work out
   *  whether it went through. */
  const [gone, setGone] = useState(false);

  return (
    <main>
      <Crumbs trail={[{ label: 'The desk', to: '/app/desk' },
                      { label: 'Associates', to: '/app/desk/associates' },
                      ...(data && !gone ? [{ label: data.name }] : [])]} />
      {gone ? (
        <Empty
          boxed h="18rem" icon="person" title="They have been removed."
          action={<Link className="btn" to="/app/desk/associates">Back to the roster</Link>}
        >
          Nothing of theirs is kept. Nobody will be offered a job in their name again.
        </Empty>
      ) : isLoading ? <Loading h="20rem" what="this associate" />
        : !data ? <Failed what="This associate" error={error} boxed h="20rem" />
          : <Person a={data} onGone={() => setGone(true)} />}
    </main>
  );
}
