/** W08 — who looks after it, under what arrangement, paid how much.
 *
 *  Five kinds of person sit on one parcel and only two of them are users of the
 *  app. The card is therefore graded: the ones you pay get the full arrangement
 *  grid (what, how much, when next, what they can see); the ones you don't get
 *  a single line and one action. "Can see" is on the card and not in a settings
 *  screen because it is the fact people get wrong. */
import PersonAddAltOutlined from '@mui/icons-material/PersonAddAltOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import NorthEastOutlined from '@mui/icons-material/NorthEastOutlined';
import SouthWestOutlined from '@mui/icons-material/SouthWestOutlined';
import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined';
import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined';

import { useAddPerson, useDeletePerson, usePeople, useUpdatePerson } from '../api';
import { useToast } from '../Toast';
import {
  Card, Chip, Empty, Failed, Loading, inGroup, initialsOf, inr, inrFullish, plural,
} from '../ui';
import { Drawer, DrawerAction, drawerEyebrow } from '../Drawer';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { useRecordCtx } from './Record';
import { SectionHead } from './RecordHead';

/** Where a seeded action label actually goes, or null when it goes nowhere.
 *
 *  `p.actions` is free text: record_people stores a JSON list of words and
 *  there is nothing behind any of them. Drawn as-is, one record put about a
 *  dozen disabled buttons on the screen — "Message", "Change pay", "Visit
 *  schedule", "Record a payment", "Permissions", "Extend access", "End the
 *  lease" — each explaining itself in a title attribute that no browser shows
 *  on a disabled control. A data-driven label with no capability behind it is
 *  still a dead control, so a label is drawn only when this function can name
 *  the screen that answers it; the rest are dropped, and the footnote under
 *  the list says where those things actually happen.
 *
 *  Matched on the label because the label is all the row carries — no paper
 *  id, no ticket id, no photo count — which is also why each of these lands on
 *  the screen that holds the thing rather than on the thing itself. Same shape
 *  as the 'Photos' action on RecordFeatures. */
function destOf(label: string, recordId: string): string | null {
  // The agreement is a paper filed on this record, and Papers is the index tab.
  if (label === 'Lease agreement') return `/app/records/${recordId}`;
  // Every job ordered on this land, each row with its own ticket and tracking.
  if (label === 'Track order') return `/app/records/${recordId}/services`;
  // Invitations is one of the screens W360 has not redrawn; /app/invitations
  // is the rail entry that hands it to the previous interface, which sends one.
  if (label === 'Invite to the app') return '/app/invitations';
  return null;
}

/** The five people who actually turn up on a parcel. `role` is free text in the
 *  column, so these are a shortcut rather than an enumeration — "Someone else"
 *  is the last chip because most land has an arrangement the list did not think
 *  of, which is the same shape the Features starter kit keeps. */
const ROLES = ['Tenant', 'Caretaker', 'Agent', 'Family', 'Watchman'];
const OTHER = 'Someone else';

/**
 * Assigning someone, in the drawer every hanger now uses.
 *
 * This was an inline two-box form under the section head — a name, what they
 * do, Add, Cancel. It could take a name and a role and nothing else, which is
 * why every person filed through it landed on a card with an empty arrangement
 * grid and the words "No arrangement recorded yet".
 *
 * Every field here writes a column `add_person` actually has. Two things the
 * card CAN show are deliberately absent, because nothing would carry them: a
 * phone number, which record_people has no column for at all, and what the
 * person can see, which has a column but no argument on the mutation — and a
 * visibility chip row that silently filed nothing would be worse than the
 * sentence at the bottom of this panel telling the owner where access is
 * actually granted.
 */
function AssignDrawer({ recordId, recordTitle, onClose, returnFocus }: {
  recordId: string;
  recordTitle: string;
  onClose: () => void;
  returnFocus: React.RefObject<HTMLButtonElement | null>;
}) {
  const addPerson = useAddPerson();
  /** Nothing is pre-selected, and pressing the chosen chip again clears it.
   *
   *  A pre-selected "Tenant" would file every person nobody thought about as a
   *  tenant — a claim about somebody else's land that the owner never made, and
   *  the same mistake as attributing a power bill to whichever bore happens to
   *  sort first. The server agrees: only the name is required, because "who
   *  someone is to this land is often known long before what they are paid". */
  const [role, setRole] = useState('');
  const [ownRole, setOwnRole] = useState('');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<'month' | 'season'>('month');
  const [summary, setSummary] = useState('');
  const [err, setErr] = useState('');

  const theirRole = (role === OTHER ? ownRole : role).trim();
  const canFile = name.trim().length > 0 && !addPerson.isPending;
  /** Anything closing this would throw away. The role chip starts on a default
   *  nobody chose, so it is not dirt on its own — a panel that nags about
   *  discarding a form nobody touched is a panel people learn to dismiss. */
  const dirty = [name, ownRole, amount, summary, role].some((v) => v.trim().length > 0);

  /** What the two pay columns have to look like.
   *
   *  They are text, and the record's own totals are read back OUT of that text:
   *  `_rupees` takes the digits before the slash, and web360.py splits a
   *  person's pay into the monthly and seasonal figures by testing whether the
   *  value contains the word "month" or "season". So this shape — the seed's
   *  own — is load-bearing. Written any other way, the pay files fine and then
   *  does not appear in either of the two numbers on the rail of this very
   *  screen, which reads as a save that half worked. */
  const payValue = amount ? `₹${inGroup(Number(amount))} / ${period}` : '';
  const payLabel = amount ? (period === 'month' ? 'Pay' : 'They pay you') : '';

  /** Puts someone on the record.
   *
   *  Nothing is cleared and the panel does not close until the server has
   *  answered with an id. The original form cleared itself and closed on the
   *  same tick it fired the mutation, without awaiting it, so a refused write —
   *  a record that is not yours, or no network — read as a person who was
   *  accepted and then lost: no card, no message, and the typed name gone. */
  const file = async () => {
    if (!canFile) return;
    setErr('');
    try {
      const res = await addPerson.mutateAsync({
        recordId,
        personName: name.trim(),
        role: theirRole,
        summary: summary.trim(),
        // Nothing here can honestly claim Pattadar manages this person — that
        // is what "Through Pattadar" means on a seeded card — so the column is
        // left for whoever files the arrangement to set.
        arrangement: '',
        payLabel,
        payValue,
      });
      if (!res.web.addPerson) {
        setErr('That person was not filed. This record may no longer be yours to edit.');
        return;
      }
      onClose();
    } catch {
      setErr('That person was not filed. What you typed is still here — try Assign again.');
    }
  };

  return (
    <Drawer
      eyebrow={drawerEyebrow(recordTitle, 'People')}
      title="Assign someone"
      sub="They get a card of their own on this record — what they do here, what they are owed, and when it is next due."
      onClose={onClose}
      onSubmit={() => void file()}
      busy={addPerson.isPending}
      dirty={dirty}
      discardCopy={{
        title: 'Discard this person?',
        body: 'Nobody has been filed yet. Closing this panel loses the name and the arrangement you have entered.',
      }}
      // The name, not the chip row: it is the one field that is required and the
      // one thing somebody standing in a field always knows.
      initialFocus="#pe-name"
      returnFocus={returnFocus}
      primary={(
        <DrawerAction
          label="Assign them"
          working="Assigning…"
          pending={addPerson.isPending}
          paused={addPerson.isPaused}
          disabled={!name.trim()}
        />
      )}
    >
      <div className="field">
        <label>What they do here</label>
        <div className="row tight">
          {[...ROLES, OTHER].map((r) => (
            <Chip key={r} active={role === r} onClick={() => setRole(role === r ? '' : r)}>
              {r}
            </Chip>
          ))}
        </div>
        <span className="note">Optional — a name on its own is a person on this land.</span>
      </div>

      {role === OTHER && (
        <div className="field">
          <label htmlFor="pe-role">What to call it</label>
          <input id="pe-role" type="text" value={ownRole}
                 placeholder="Neighbour who holds the key"
                 onChange={(e) => setOwnRole(e.target.value)} />
        </div>
      )}

      {/* The one required field, and the only one a person standing in a field
          always knows. It takes the opening focus for that reason. */}
      <div className="field">
        <label htmlFor="pe-name">Their name</label>
        <input id="pe-name" type="text" value={name} placeholder="Who is it"
               onChange={(e) => setName(e.target.value)} />
      </div>

      {/* Raw digits in the value. Rebuilding "₹18,400" from the number on every
          keystroke throws the caret to the end of the string, stalls backspace
          on the ₹ and the commas, and makes an empty field impossible. The
          grouped form goes under the field, which is the shape the expense
          drawer settled on after hitting exactly that. */}
      <div className="field">
        <label htmlFor="pe-amt">What they are owed</label>
        <div className="row" style={{ gap: 'var(--space-sm)', flexWrap: 'nowrap' }}>
          <input id="pe-amt" type="text" inputMode="numeric" value={amount} placeholder="₹ amount"
                 style={{ flex: '1 1 auto', minWidth: 0 }}
                 onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} />
          <Chip active={period === 'month'} onClick={() => setPeriod('month')}>a month</Chip>
          <Chip active={period === 'season'} onClick={() => setPeriod('season')}>a season</Chip>
        </div>
        <span className="note">
          {amount
            ? period === 'month'
              ? `₹${inGroup(Number(amount))} a month, counted in what goes out`
              : `₹${inGroup(Number(amount))} a season, counted in what comes in at harvest`
            : 'Leave it empty if the arrangement is unpaid'}
        </span>
      </div>

      <div className="field">
        <label htmlFor="pe-sum">Anything worth knowing</label>
        <textarea id="pe-sum" rows={3} value={summary}
                  placeholder="Farms the north 3 acres · paddy · lives 6 km away"
                  onChange={(e) => setSummary(e.target.value)} />
      </div>

      {/* Said rather than offered. The card has a "Can see" cell, but access to
          a record is granted as a share link on Papers, and add_person carries
          no visibility argument — so a chip row here would file nothing and
          leave the owner believing they had restricted something. */}
      <p className="note" style={{ margin: 0 }}>
        Assigning somebody does not let them see this record. Access is a share link, made on
        the Papers tab and listed with its expiry date.
      </p>

      {err && (
        <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{err}</p>
      )}
    </Drawer>
  );
}

export function RecordPeople() {
  // Filing a person is the drawer's own mutation now — it holds the form, so it
  // holds the write and the pending state that greys its button.
  const editPerson = useUpdatePerson();
  const delPerson = useDeletePerson();
  const toast = useToast();
  const [naming, setNaming] = useState(false);
  const [editId, setEditId] = useState('');
  const [draft, setDraft] = useState('');
  const [confirmId, setConfirmId] = useState('');
  const assignTrigger = useRef<HTMLButtonElement>(null);
  const renameTriggers = useRef(new Map<string, HTMLButtonElement>());
  const removeTriggers = useRef(new Map<string, HTMLButtonElement>());
  const rec = useRecordCtx();
  const { data, isLoading, error } = usePeople(rec.id);

  const restoreRowFocus = (buttons: Map<string, HTMLButtonElement>, personId: string) => {
    requestAnimationFrame(() => buttons.get(personId)?.focus());
  };

  /** Renames one person. The editor stays open on anything but a success: what
   *  was typed is the only copy of it, and closing the form is how it was
   *  being thrown away. */
  const rename = async (personId: string) => {
    if (!draft.trim() || editPerson.isPending) return;
    try {
      const res = await editPerson.mutateAsync({
        personId, personName: draft.trim(), role: '', summary: '',
      });
      if (!res.web.updatePerson) {
        toast.bad('That name was not changed. The person may already be off this record.');
        return;
      }
      setEditId('');
      restoreRowFocus(renameTriggers.current, personId);
    } catch {
      toast.bad('That name could not be changed. What you typed is still here.');
    }
  };

  /** Takes someone off this record. The confirm used to be dismissed before
   *  the delete was even sent, so a refusal left the card sitting there with
   *  nothing said about it. It now stands until the row is actually gone. */
  const remove = async (personId: string) => {
    if (delPerson.isPending) return;
    try {
      const res = await delPerson.mutateAsync({ personId });
      if (!res.web.deletePerson) {
        toast.bad('That person was not removed. They may already be off this record.');
        return;
      }
      setConfirmId('');
      requestAnimationFrame(() => assignTrigger.current?.focus());
    } catch {
      toast.bad('That person could not be removed. They are still filed here.');
    }
  };

  return (
    <>
      <SectionHead
        title="Who looks after it"
        sub={data && `${plural(data.count, 'person', 'people')} · ${inr(data.monthlyOut)} a month`
          + ` going out · ${inr(data.seasonalIn)} a season coming in`}
        actions={(
          <>
          {/* "Payment history" stood here as a disabled button whose reason
              lived in a title attribute, which no browser shows on a disabled
              control — a screen that looked real and would not open. Nothing
              was behind it: the payments filed against this record are the
              rail's own list, and the ledger across every record is the
              wallet, which the rail links. The Last payments card says so. */}
          <button ref={assignTrigger} type="button" className="btn primary"
                  aria-haspopup="dialog" aria-expanded={naming}
                  onClick={() => setNaming(true)}>
            <PersonAddAltOutlined sx={{ fontSize: 17 }} /> Assign someone
          </button>
          </>
        )}
      />

      {/* A drawer, like every other "add a thing" on this record. It used to be
          an inline row-form under the button, which is why the only two things
          it could take were a name and a role. */}
      {naming && (
        <AssignDrawer
          recordId={rec.id}
          recordTitle={rec.title}
          returnFocus={assignTrigger}
          onClose={() => setNaming(false)}
        />
      )}

      {isLoading && <Loading h="24rem" />}

      {/* A read that fails twice settles into no data and no loading flag, and
          this screen had no branch for it: the tab strip sat over an empty
          page, which reads as a record with nobody on it rather than as a
          server that could not be asked. The `!data` guard keeps a list that
          has already landed — a background refetch that fails must not take
          the people off the screen. */}
      {error && !data && (
        <Failed what="The people on this record" error={error} boxed h="24rem" />
      )}

      {data && (
        <div className="split" style={{ marginTop: 'var(--space-md)' }}>
          <div className="stack">
            {/* Guarded on the whole list, not on the non-compact half of it:
                people remembered from a closed ticket are filed compact, so a
                record whose only people came that way has a populated one-line
                card and is not a record with nobody on it. */}
            {data.people.length === 0 ? (
              <Empty
                boxed
                h="16rem"
                icon="person"
                title="Nobody is filed on this land yet"
                action={
                  <button type="button" className="btn primary" aria-haspopup="dialog"
                          onClick={() => setNaming(true)}>
                    <PersonAddAltOutlined sx={{ fontSize: 17 }} /> Assign someone
                  </button>
                }
              >
                A tenant, a caretaker, an agent — whoever looks after it. What they are
                owed, and what they can see of this record, is kept on their card.
              </Empty>
            ) : (
              <>
            {data.people.filter((p) => !p.compact).map((p) => {
              // A person filed from the inline form has no arrangement, no pay
              // and no visibility — add_person writes those columns empty — so
              // the four-column grid had nothing to fill and the card showed a
              // full-width rule over a blank band, as though it had half
              // failed. The rule belongs to the cells and goes with them.
              const cells = ([
                ['Arrangement', p.arrangement],
                [p.payLabel, p.payValue],
                [p.dueLabel, p.dueValue],
                ['Can see', p.visibility],
              ] as Array<[string, string]>).filter(([k, v]) => k && v);
              return (
              <article className="card pad-lg" key={p.id}>
                <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 'var(--space-md)' }}>
                  {/* Derived, not stored: saved initials belonged to the cast
                      the screen was drawn with and drifted from the names. */}
                  <span className="avatarlg">{initialsOf(p.name)}</span>
                  <div className="grow">
                    <div className="row" style={{ gap: 'var(--space-xs)' }}>
                      <h2>{p.name}</h2>
                      {p.badges.map((b) => (
                        <span key={b} className={`pill ${b.includes('verified') ? 'owned' : 'managed'}`}>
                          {b.includes('verified') && <VerifiedOutlined sx={{ fontSize: 12 }} />}
                          {b}
                        </span>
                      ))}
                      {p.badges.length === 0 && p.role && <span className="pill managed">{p.role}</span>}
                    </div>
                    {/* An empty paragraph still carries its margin, which is
                        the grey gap that appeared under a name-only person. */}
                    {p.summary && (
                      <p className="note" style={{ marginTop: '0.375rem', color: 'var(--w-ink-2)' }}>{p.summary}</p>
                    )}
                  </div>
                </div>

                {cells.length > 0 ? (
                  <>
                    <hr className="hr" />

                    <div className="grid4">
                      {cells.map(([k, v]) => (
                        <div key={k}>
                          <span className="eyebrow" style={{ margin: '0 0 0.3125rem' }}>{k}</span>
                          <span style={{ fontSize: '0.9375rem' }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  /* Stated, not offered: nothing in W360 can set an
                     arrangement, pay or visibility today — updatePerson sends
                     a name and nothing else — so a button here would point at
                     an editor that does not exist. */
                  <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
                    No arrangement recorded yet.
                  </p>
                )}

                <div className="row tight" style={{ marginTop: 'var(--space-md)' }}>
                  {p.actions.map((a) => {
                    const to = destOf(a, rec.id);
                    return to ? <Link key={a} className="btn sm" to={to}>{a}</Link> : null;
                  })}
                  <span className="grow" />
                  {editId === p.id ? (
                    <form className="row tight"
                          onSubmit={(e) => { e.preventDefault(); void rename(p.id); }}>
                      <span className="search" style={{ flex: '1 1 8rem', minWidth: 0 }}>
                        <input value={draft} autoFocus aria-label={`Rename ${p.name}`}
                               onChange={(e) => setDraft(e.target.value)} />
                      </span>
                      {/* Save was live over an emptied box and closed the
                          editor on a write the handler had already skipped,
                          so a cleared name read as a rename that silently
                          did nothing. */}
                      <button type="submit" className="btn sm"
                              disabled={!draft.trim() || editPerson.isPending}>
                        {editPerson.isPending ? 'Saving…' : 'Save'}
                      </button>
                      <button type="button" className="btn sm" onClick={() => {
                        setEditId('');
                        restoreRowFocus(renameTriggers.current, p.id);
                      }}>Cancel</button>
                    </form>
                  ) : confirmId === p.id ? (
                    <>
                      <button type="button" className="btn sm danger" disabled={delPerson.isPending}
                              onClick={() => void remove(p.id)}>
                        {delPerson.isPending ? 'Removing…' : 'Remove'}
                      </button>
                      <button type="button" className="btn sm" onClick={() => {
                        setConfirmId('');
                        restoreRowFocus(removeTriggers.current, p.id);
                      }}>Keep</button>
                    </>
                  ) : (
                    <>
                      <button ref={(node) => { if (node) renameTriggers.current.set(p.id, node); }}
                              type="button" className="iconbtn" aria-label={`Rename ${p.name}`}
                              onClick={() => { setEditId(p.id); setDraft(p.name); }}
                              style={{ border: 0, background: 'none' }}>
                        <EditOutlined sx={{ fontSize: 16 }} />
                      </button>
                      <button ref={(node) => { if (node) removeTriggers.current.set(p.id, node); }}
                              type="button" className="iconbtn" aria-label={`Remove ${p.name}`}
                              onClick={() => setConfirmId(p.id)}
                              style={{ border: 0, background: 'none' }}>
                        <DeleteOutlineOutlined sx={{ fontSize: 16 }} />
                      </button>
                    </>
                  )}
                </div>
              </article>
              );
            })}

            {data.people.some((p) => p.compact) && (
              <div className="card" style={{ padding: 0 }}>
                <div className="rows boxed">
                  {data.people.filter((p) => p.compact).map((p) => (
                    <div key={p.id}>
                      <span className="avatarlg" style={{ width: '2.25rem', height: '2.25rem', fontSize: '0.75rem' }}>
                        {initialsOf(p.name)}
                      </span>
                      <span className="grow">
                        <span className="row tight">
                          <strong style={{ fontSize: '0.9375rem' }}>{p.name}</strong>
                          {p.badges.map((b) => <span key={b} className="pill">{b}</span>)}
                        </span>
                        <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>{p.summary}</span>
                      </span>
                      <span className="row tight" style={{ flexWrap: 'nowrap' }}>
                        {p.actions.map((a) => {
                          const to = destOf(a, rec.id);
                          return to ? <Link key={a} className="btn sm" to={to}>{a}</Link> : null;
                        })}
                        {confirmId === p.id ? (
                          <>
                            <button type="button" className="btn sm danger" disabled={delPerson.isPending}
                                    onClick={() => void remove(p.id)}>
                              {delPerson.isPending ? 'Removing…' : 'Remove'}
                            </button>
                            <button type="button" className="btn sm" onClick={() => {
                              setConfirmId('');
                              restoreRowFocus(removeTriggers.current, p.id);
                            }}>Keep</button>
                          </>
                        ) : (
                          <button ref={(node) => { if (node) removeTriggers.current.set(p.id, node); }}
                                  type="button" className="iconbtn" aria-label={`Remove ${p.name}`}
                                  onClick={() => setConfirmId(p.id)}
                                  style={{ border: 0, background: 'none' }}>
                            <DeleteOutlineOutlined sx={{ fontSize: 16 }} />
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Where the dropped action labels actually happen. Said once,
                under the list, rather than drawn a dozen times as buttons that
                refuse — the vault footnotes its own links list the same way,
                and the sentence about a longer link is the one it uses. */}
            <p className="note">
              Who can see this record is granted as a link: you make one on this record's
              Papers tab, and every live link is listed with its date on{' '}
              <Link className="accent" to="/app/papers">Papers</Link>, where giving somebody
              longer means revoking theirs and sharing again. Taking somebody off this land
              is the remove control on their own card. Messaging a person, setting a visit
              schedule, changing what they are paid and paying them from Pattadar are not
              switched on yet.
            </p>
              </>
            )}
          </div>

          <aside className="stack">
            <Card title="Money on people" className="railcard">
              <p className="num" style={{ fontSize: '1.75rem', margin: 0 }}>
                {inr(data.monthlyOut)}{' '}
                <span className="note" style={{ fontSize: '0.8125rem' }}>out, this month</span>
              </p>
              <p className="num up" style={{ fontSize: '1.75rem', margin: '0.375rem 0 0' }}>
                {inr(data.seasonalIn)}{' '}
                <span className="note" style={{ fontSize: '0.8125rem' }}>in, at harvest</span>
              </p>
              <hr className="hr" />
              <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 'var(--space-sm)' }}>
                <span className="accent" style={{ display: 'flex', paddingTop: '0.125rem' }}>
                  <AccountBalanceWalletOutlined sx={{ fontSize: 18 }} />
                </span>
                <span>
                  <strong style={{ fontSize: '0.875rem' }}>Paid from your Pattadar wallet</strong>
                  {/* Whole rupees, not a lakh short form. inr() printed this
                      balance as "₹1.01 L" while /app/wallet prints its figures
                      to the rupee a click away — one wallet rounded two ways
                      is how a "where did my money go" call starts. */}
                  <span className="note" style={{ display: 'block' }}>
                    Balance {inrFullish(data.walletBalance)} · {data.walletNote}
                  </span>
                </span>
              </div>
              {/* "Top up the wallet" was a disabled button whose reason lived
                  in a title attribute, which no browser shows on a disabled
                  control — so the screen instructed a top-up in the line above
                  and then refused it without a word. Paying out of Pattadar is
                  not switched on anywhere yet; Wallet.tsx and Ticket.tsx say
                  this in exactly these words, so the three flip together when
                  the provider goes live and the top-up comes back here. The
                  wallet itself is real, so that is the control that stays. */}
              {!data.walletLive && (
                <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
                  Adding money to the wallet is not switched on yet.
                </p>
              )}
              <Link to="/app/wallet" className="btn soft"
                    style={{ width: '100%', justifyContent: 'center', marginTop: 'var(--space-sm)' }}>
                See the wallet
              </Link>
            </Card>

            <Card title="Last payments" className="railcard">
              {data.payments.length === 0 ? (
                /* Every record reads this way until money actually moves, and
                   a headed card with a hairline and nothing under it reads as
                   a card that failed to load. */
                <p className="note">Nothing has been paid on this record yet.</p>
              ) : (
              <div className="rows">
                {data.payments.map((p) => (
                  <div key={p.id}>
                    <span style={{ display: 'flex', color: p.state === 'escrow' ? 'var(--w-warn)' : p.direction === 'in' ? 'var(--w-ok)' : 'var(--w-ink-3)' }}>
                      {p.state === 'escrow'
                        ? <AccessTimeOutlined sx={{ fontSize: 16 }} />
                        : p.direction === 'in'
                          ? <SouthWestOutlined sx={{ fontSize: 16 }} />
                          : <NorthEastOutlined sx={{ fontSize: 16 }} />}
                    </span>
                    <span className="grow">
                      <span style={{ display: 'block', fontSize: '0.875rem' }}>{p.title}</span>
                      <span className="note mono" style={{ display: 'block', fontSize: '0.6875rem' }}>
                        {p.subtitle}
                      </span>
                    </span>
                    <span className={`num ${p.direction === 'in' ? 'up' : ''}`} style={{ fontSize: '0.8125rem' }}>
                      {inr(p.amount)}
                    </span>
                  </div>
                ))}
              </div>
              )}
              {/* The header carried a disabled "Payment history" button, and
                  there is no per-record history behind it — these rows are
                  every payment filed against this record. The ledger that
                  spans records is the wallet, linked from the card above. */}
              <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
                The ledger across all your records is in the wallet.
              </p>
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}
