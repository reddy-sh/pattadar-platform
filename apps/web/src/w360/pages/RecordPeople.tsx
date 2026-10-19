/** W08 — who looks after it, under what arrangement, paid how much.
 *
 *  Five kinds of person sit on one parcel and only two of them are users of the
 *  app. The card is therefore graded: the ones you pay get the full arrangement
 *  grid (what, how much, when next, what they can see); the ones you don't get
 *  a single line and one action. "Can see" is on the card and not in a settings
 *  screen because it is the fact people get wrong.
 *
 *  Staff have two ways to look at the same people: CARDS (roomy, one per
 *  person) and a TABLE (dense, one row each). Owners add a third, the CHAIN
 *  of title, which is read-only until "Edit chain" is pressed. Clicking any
 *  card, row, or owner on the chain opens the person's own drawer — the one
 *  place their details are edited and the one place they are removed. Those
 *  views carry no inline pencil or trash of their own, so "click to open, act
 *  inside" remains the only interaction. */
import PersonAddAltOutlined from '@mui/icons-material/PersonAddAltOutlined';
import AddOutlined from '@mui/icons-material/AddOutlined';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import NorthEastOutlined from '@mui/icons-material/NorthEastOutlined';
import SouthWestOutlined from '@mui/icons-material/SouthWestOutlined';
import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined';
import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined';
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';

import {
  useAddPerson, useDeleteOwner, useDeletePerson,
  useOwners, usePeople, useTransfers, useUpdateOwner, useUpdatePerson,
} from '../api';
import type { Owner, Payment, Person } from '../api';
import {
  Card, Chip, Empty, Failed, PhotoImg, Segmented, SelectAllBox, SelectCell, SelectionBar, TablePager,
  ToolbarBand, downloadCsv, inGroup, initialsOf, inrFullish, plural, usePaged, useRowSelection,
} from '../ui';
import { useToast } from '../Toast';
import { Sk, SkRows } from '../skeletons';
import { Drawer, DrawerAction, drawerEyebrow } from '../Drawer';
import { MAX_UPLOAD_BYTES, mb } from '../filePhotos';
import { STORAGE_OFFLINE_MSG, uploadToDrive } from '../../pages/documents/storage';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import EditOutlined from '@mui/icons-material/EditOutlined';
import GavelOutlined from '@mui/icons-material/GavelOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import { orderHref } from '../orderFlow';
import { useRecordCtx } from './Record';
import { OwnerChain, TransferDrawer } from './OwnerChain';
import { SectionHead } from './RecordHead';
import { ConfirmDialog } from './PropertyActions';

/** Where one of a person's action labels actually goes, or null when it goes
 *  nowhere.
 *
 *  `person.actions` is free text: record_people stores a JSON list of words
 *  with nothing behind most of them ("Message", "Change pay", "Permissions").
 *  A data-driven label with no capability behind it is still a dead control,
 *  so a label is drawn — as a link, inside the person's drawer — only when this
 *  can name the screen that answers it; the drawer's footnote says where the
 *  rest happen. Matched on the label because the label is all the row carries,
 *  which is why each lands on the screen that holds the thing. */
function destOf(label: string, recordId: string): string | null {
  const id = encodeURIComponent(recordId);
  // The agreement is a document saved on this property, on its Documents tab.
  if (label === 'Lease agreement') return `/properties/${id}/documents`;
  // Every order on this land, each with its own progress.
  if (label === 'Track' || label === 'Track order') return `/properties/${id}/services`;
  if (label === 'Invite to the app') return '/invitations';
  return null;
}

/** The five people who actually turn up on a parcel. `role` is free text in the
 *  column, so these are a shortcut rather than an enumeration — "Someone else"
 *  is the last chip because most land has an arrangement the list did not think
 *  of, which is the same shape the Features starter kit keeps. */
const ROLES = ['Tenant', 'Caretaker', 'Agent', 'Family', 'Watchman'];
const OTHER = 'Someone else';

/** Roles that describe who OWNS the land rather than who looks after it —
 *  filed from a deed reading (see partiesFromReading in PropertyActions). An
 *  owner has no pay, no visit schedule and no "arrangement", so the card must
 *  not print the caretaker's "No arrangement recorded yet" line under them. */
const OWNERSHIP_ROLES = new Set(['owner', 'previous owner', 'power-of-attorney holder']);
const isOwnershipRole = (role: string): boolean =>
  OWNERSHIP_ROLES.has(role.trim().toLowerCase());

/** The arrangement/pay/visibility cells a person actually carries — empty for
 *  anyone filed with just a name and role, which is most of them. Shared by the
 *  card and the drawer so both show exactly the same four. */
function payCells(p: Person): Array<[string, string]> {
  return ([
    ['Arrangement', p.arrangement],
    [p.payLabel, p.payValue],
    [p.dueLabel, p.dueValue],
    ['Can see', p.visibility],
  ] as Array<[string, string]>).filter(([k, v]) => k && v);
}

/** Which way a recorded payment went, in a word — the arrow and the colour
 *  beside it are not enough on their own. Never "paid": while the payments
 *  provider is a stub nothing has moved through Pattadar. */
const paymentWord = (p: Payment) => (
  p.state === 'escrow' ? 'Held' : p.direction === 'in' ? 'In' : 'Out');

/** A person's face where the initials avatar used to be. When a photo is on
 *  file it renders it (through the authenticated, HEIC-transcoding read every
 *  other W360 image uses); otherwise it falls back to the initials, so a person
 *  with no photo looks exactly as they did before. */
function PersonPhoto({ photoRef, name, size = '2.75rem' }: {
  photoRef: string; name: string; size?: string;
}) {
  const initials = <span className="avatarlg" style={{ width: size, height: size }}>{initialsOf(name)}</span>;
  if (!photoRef) return initials;
  return (
    <span className="avatarlg personphoto" style={{ width: size, height: size, padding: 0, overflow: 'hidden' }}>
      <PhotoImg fileRef={photoRef} alt={name} thumb={160} fallback={initials} className="personphoto-img" />
    </span>
  );
}

/** A photo picker for the drawers: shows the current photo (or a placeholder),
 *  a "Choose a photo" button that uploads to storage and hands back the node
 *  id, and a Remove when one is set. Reuses uploadToDrive — the same two-step
 *  every other upload takes — and enforces the 15 MB product cap up front. The
 *  parent owns the ref; this only uploads and reports.
 *
 *  Especially for staff: a caretaker or watchman is who a neighbour is asked
 *  about, so a face on the card is the point of the whole feature. */
function PhotoField({ name, photoRef, onChange }: {
  name: string; photoRef: string; onChange: (ref: string) => void;
}) {
  const pick = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const chosen = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setErr('Choose an image file.'); return; }
    if (file.size > MAX_UPLOAD_BYTES) { setErr(`That photo is ${mb(file.size)}. The limit is ${mb(MAX_UPLOAD_BYTES)}.`); return; }
    setErr('');
    setBusy(true);
    try {
      const node = await uploadToDrive(file);
      onChange(node.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : STORAGE_OFFLINE_MSG);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field">
      <label>Photo</label>
      <div className="row tight" style={{ alignItems: 'center' }}>
        <PersonPhoto photoRef={photoRef} name={name || '?'} size="3.5rem" />
        <input ref={pick} type="file" hidden accept="image/*" disabled={busy}
               aria-label="Choose a photo"
               onChange={(e) => void chosen(e.currentTarget)} />
        <button type="button" className="btn sm" disabled={busy}
                onClick={() => pick.current?.click()}>
          <PhotoCameraOutlined sx={{ fontSize: 15 }} /> {busy ? 'Uploading…' : photoRef ? 'Replace photo' : 'Choose a photo'}
        </button>
        {/* "Remove photo", not "Remove": the same drawer's other Remove takes
            the person off the property. */}
        {photoRef && !busy && (
          <button type="button" className="btn sm" onClick={() => onChange('')}>Remove photo</button>
        )}
      </div>
      {err
        ? <span className="note" role="alert" style={{ color: 'var(--w-danger)' }}>{err}</span>
        : <span className="note">Up to {mb(MAX_UPLOAD_BYTES)}.</span>}
    </div>
  );
}

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
  /** Nothing is pre-selected, and pressing the chosen chip again clears it. */
  const [role, setRole] = useState('');
  const [ownRole, setOwnRole] = useState('');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<'month' | 'season'>('month');
  const [summary, setSummary] = useState('');
  const [photoRef, setPhotoRef] = useState('');
  const [err, setErr] = useState('');

  const theirRole = (role === OTHER ? ownRole : role).trim();
  const canFile = name.trim().length > 0 && !addPerson.isPending;
  const dirty = [name, ownRole, amount, summary, role].some((v) => v.trim().length > 0) || !!photoRef;

  const payValue = amount ? `₹${inGroup(Number(amount))} / ${period}` : '';
  const payLabel = amount ? (period === 'month' ? 'Pay' : 'They pay you') : '';

  const file = async () => {
    if (!canFile) return;
    setErr('');
    try {
      const res = await addPerson.mutateAsync({
        recordId,
        personName: name.trim(),
        role: theirRole,
        summary: summary.trim(),
        arrangement: '',
        payLabel,
        payValue,
        photoRef,
      });
      if (!res.web.addPerson) {
        setErr('That person was not added. This property may no longer be yours to edit.');
        return;
      }
      onClose();
    } catch {
      setErr('That person was not added. Try again.');
    }
  };

  return (
    <Drawer
      eyebrow={drawerEyebrow(recordTitle, 'People')}
      title="Assign someone"
      onClose={onClose}
      onSubmit={() => void file()}
      busy={addPerson.isPending}
      dirty={dirty}
      discardCopy={{
        title: 'Discard this person?',
        body: 'What you have entered will be lost.',
      }}
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
            <Chip key={r} wash active={role === r} onClick={() => setRole(role === r ? '' : r)}>
              {r}
            </Chip>
          ))}
        </div>
        <span className="note">Optional.</span>
      </div>

      {role === OTHER && (
        <div className="field">
          <label htmlFor="pe-role">What to call it</label>
          <input id="pe-role" type="text" value={ownRole}
                 placeholder="Neighbour who holds the key"
                 onChange={(e) => setOwnRole(e.target.value)} />
        </div>
      )}

      <div className="field">
        <label htmlFor="pe-name">Their name</label>
        <input id="pe-name" type="text" value={name} placeholder="Who is it"
               onChange={(e) => setName(e.target.value)} />
      </div>

      <PhotoField name={name} photoRef={photoRef} onChange={setPhotoRef} />

      <div className="field">
        <label htmlFor="pe-amt">What they are owed</label>
        <div className="row" style={{ gap: 'var(--space-sm)', flexWrap: 'nowrap' }}>
          <input id="pe-amt" type="text" inputMode="numeric" value={amount} placeholder="₹ amount"
                 style={{ flex: '1 1 auto', minWidth: 0 }}
                 onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} />
          <Chip wash active={period === 'month'} onClick={() => setPeriod('month')}>a month</Chip>
          <Chip wash active={period === 'season'} onClick={() => setPeriod('season')}>a season</Chip>
        </div>
        {amount && (
          <span className="note">₹{inGroup(Number(amount))} a {period}</span>
        )}
      </div>

      <div className="field">
        <label htmlFor="pe-sum">Anything worth knowing</label>
        <textarea id="pe-sum" rows={3} value={summary}
                  placeholder="Farms the north 3 acres · paddy · lives 6 km away"
                  onChange={(e) => setSummary(e.target.value)} />
      </div>

      <p className="note" style={{ margin: 0 }}>
        Assigning someone does not give them access.
      </p>

      {err && (
        <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{err}</p>
      )}
    </Drawer>
  );
}

/**
 * One person, opened. Shows everything on them, edits the three columns the
 * server will actually take (name, role, the details line) and removes them.
 *
 * This is now the ONLY place a person is edited or removed — the card and the
 * table row carry no inline controls, so there is one editor to reason about
 * rather than an inline form duplicated per view. Empty edit fields are simply
 * not sent (updatePerson skips empty arguments), so opening the drawer and
 * closing it changes nothing.
 */
function PersonDrawer({ person, recordId, recordTitle, onClose, returnFocus }: {
  person: Person;
  recordId: string;
  recordTitle: string;
  onClose: () => void;
  returnFocus: React.RefObject<HTMLElement | null>;
}) {
  const updatePerson = useUpdatePerson();
  const delPerson = useDeletePerson();
  const [name, setName] = useState(person.name);
  const [role, setRole] = useState(person.role);
  const [summary, setSummary] = useState(person.summary);
  const [photoRef, setPhotoRef] = useState(person.photoRef);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState('');
  /** The confirmation's own answer, printed inside it: it holds open until
   *  the server says the person is gone. */
  const [removeErr, setRemoveErr] = useState('');

  const cells = payCells(person);
  /** The labels that lead somewhere, once each. */
  const links = [...new Set(person.actions ?? [])]
    .map((label) => ({ label, to: destOf(label, recordId) }))
    .filter((a): a is { label: string; to: string } => !!a.to);
  const dirty = name.trim() !== person.name
    || role.trim() !== person.role
    || summary.trim() !== person.summary
    || photoRef !== person.photoRef;
  const canSave = name.trim().length > 0 && dirty && !updatePerson.isPending;

  const save = async () => {
    if (!canSave) return;
    setErr('');
    try {
      // Only what changed leaves the form; updatePerson skips empty arguments,
      // so blanking a field here does not wipe the column — clearing a role is
      // done by choosing a different one, not by sending "".
      const res = await updatePerson.mutateAsync({
        personId: person.id,
        personName: name.trim() !== person.name ? name.trim() : '',
        role: role.trim() !== person.role ? role.trim() : '',
        summary: summary.trim() !== person.summary ? summary.trim() : '',
        // '' means unchanged; a lone '-' clears the photo (server convention).
        photoRef: photoRef === person.photoRef ? '' : (photoRef || '-'),
      });
      if (!res.web.updatePerson) {
        setErr('That change was not saved. This person may already be off this property.');
        return;
      }
      onClose();
    } catch {
      setErr('That change could not be saved. Try again.');
    }
  };

  const remove = async () => {
    if (delPerson.isPending) return;
    setRemoveErr('');
    try {
      const res = await delPerson.mutateAsync({ personId: person.id });
      if (!res.web.deletePerson) {
        setRemoveErr('That person was not removed. They may already be off this property.');
        return;
      }
      onClose();
    } catch {
      setRemoveErr('That person could not be removed. They are still on this property.');
    }
  };

  return (
    <Drawer
      eyebrow={drawerEyebrow(recordTitle, 'People')}
      title={person.name}
      sub={person.role || 'On this property'}
      onClose={onClose}
      onSubmit={() => void save()}
      busy={updatePerson.isPending || delPerson.isPending}
      dirty={dirty}
      over={confirming ? (
        <ConfirmDialog
          title={`Remove ${person.name}?`}
          // What delete_person does (web360.py): this property's row only.
          body={`${person.name} comes off this property only. The same person on any other property is not touched.`}
          actionLabel="Remove"
          danger
          busy={delPerson.isPending}
          error={removeErr}
          onConfirm={() => void remove()}
          onClose={() => { setRemoveErr(''); setConfirming(false); }}
        />
      ) : undefined}
      discardCopy={{
        title: 'Discard these changes?',
        body: 'Your changes will be lost.',
      }}
      initialFocus="#pd-name"
      returnFocus={returnFocus}
      primary={(
        <DrawerAction
          label="Save changes"
          working="Saving…"
          pending={updatePerson.isPending}
          paused={updatePerson.isPaused}
          disabled={!canSave}
        />
      )}
    >
      <div className="field">
        <label htmlFor="pd-name">Their name</label>
        <input id="pd-name" type="text" value={name}
               onChange={(e) => setName(e.target.value)} />
      </div>

      <PhotoField name={name} photoRef={photoRef} onChange={setPhotoRef} />

      <div className="field">
        <label>What they are to this land</label>
        <div className="row tight">
          {ROLES.map((r) => (
            <Chip key={r} wash active={role.trim().toLowerCase() === r.toLowerCase()}
                  onClick={() => setRole(r)}>
              {r}
            </Chip>
          ))}
        </div>
        {/* Owners and previous owners come off a deed and use words that are not
            in the caretaker list; a free-text box keeps them editable without
            forcing them onto a chip that would mislabel them. */}
        <input type="text" value={role} placeholder="Or type a role"
               style={{ marginTop: 'var(--space-sm)' }}
               aria-label="Role"
               onChange={(e) => setRole(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="pd-sum">Details</label>
        <textarea id="pd-sum" rows={3} value={summary}
                  placeholder="Parentage, address or arrangement"
                  onChange={(e) => setSummary(e.target.value)} />
      </div>

      {/* Read-only. Pay is written once, when someone is assigned (the
          assign drawer's payLabel/payValue), and nothing edits it or the
          visibility afterwards — updatePerson has no argument for either — so
          these are shown when present but not editable here. */}
      {cells.length > 0 && (
        <div className="field">
          <label>Arrangement</label>
          <div className="grid4">
            {cells.map(([k, v]) => (
              <div key={k}>
                <span className="eyebrow" style={{ margin: '0 0 0.3125rem' }}>{k}</span>
                <span style={{ fontSize: '0.9375rem' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The actions that used to sit on the card live here now, as links to
          the screens that do them; labels with nothing behind them are not
          drawn, and the note says where those things happen. */}
      {links.length > 0 && (
        <div className="field">
          <label>Elsewhere in Pattadar</label>
          <div className="row tight">
            {links.map((a) => <Link key={a.label} className="btn sm" to={a.to}>{a.label}</Link>)}
          </div>
        </div>
      )}
      <p className="note" style={{ margin: 0 }}>
        Who can see this property is granted as a link: you make one on its Documents tab, and
        every live link is listed on <Link className="accent" to="/papers">Documents</Link>.
        Messaging a person, setting a visit schedule, changing what they are paid and paying them
        from Pattadar are not switched on yet.
      </p>

      <hr className="hr" />

      {/* Remove lives here, behind the shared confirmation (the drawer's
          `over`), so a destructive action is never a stray click on a list —
          and the confirmation takes focus and names who goes. */}
      <button type="button" className="btn sm" aria-haspopup="dialog"
              onClick={() => { setRemoveErr(''); setConfirming(true); }}>
        <DeleteOutlineOutlined sx={{ fontSize: 16 }} /> Remove from this property
      </button>

      {err && (
        <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{err}</p>
      )}
    </Drawer>
  );
}

/** A person as a full card, clickable to open their drawer. No inline controls
 *  of its own — the whole card is the button. */
function PersonCard({ person, onOpen }: { person: Person; onOpen: () => void }) {
  const cells = payCells(person);
  return (
    <article className="card pad-lg peoplecard" style={{ cursor: 'pointer' }}>
      {/* The whole card opens the drawer. A button wrapping the content keeps it
          keyboard-reachable and announced as one control; the actions that used
          to sit on the card now live inside the drawer it opens. */}
      <button type="button" className="cardopen" onClick={onOpen}
              aria-label={`Open ${person.name}`}
              style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}>
        <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 'var(--space-md)' }}>
          <PersonPhoto photoRef={person.photoRef} name={person.name} />
          <div className="grow">
            <div className="row" style={{ gap: 'var(--space-xs)' }}>
              <h2>{person.name}</h2>
              {person.badges.map((b) => (
                <span key={b} className={`pill ${b.includes('verified') ? 'owned' : 'managed'}`}>
                  {b.includes('verified') && <VerifiedOutlined sx={{ fontSize: 12 }} />}
                  {b}
                </span>
              ))}
              {person.badges.length === 0 && person.role && (
                <span className="pill managed">{person.role}</span>
              )}
            </div>
            {person.summary && (
              <p className="note" style={{ marginTop: '0.375rem', color: 'var(--w-ink-2)' }}>
                {person.summary}
              </p>
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
        ) : isOwnershipRole(person.role) ? (
          /* An owner or previous owner has no "arrangement" — that is a
             caretaker's word. Their parentage and address (the line above) IS
             their record, so nothing more is drawn. */
          null
        ) : (
          <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
            No arrangement recorded yet.
          </p>
        )}
      </button>
    </article>
  );
}

/** A pay line's rupees, the way the server sums them (web360.py `_rupees`):
 *  the digits before the "/" — "₹8,000 / month" is 8000. */
const rupeesOf = (pay: string) => Number((pay.split('/')[0] ?? '').replace(/\D/g, '')) || 0;
const monthlyOf = (ps: readonly Person[]) =>
  ps.reduce((n, p) => n + (p.payValue.includes('month') ? rupeesOf(p.payValue) : 0), 0);

const PEOPLE_NOUN = ['person', 'people'] as const;
const OWNER_NOUN = ['owner', 'owners'] as const;
const idOf = (r: { id: string }) => r.id;

/** The same people as a dense table, each row opening the drawer. Both compact
 *  (ticket-remembered) and full people appear here — the table is one flat list
 *  by design, since its whole point is to scan many at once. It follows
 *  design.md § Tables: ticks, a footer that counts the selection (or every
 *  row) and sums the monthly pay, the shared pager and the selection bar. */
function PeopleTable({ people, recordId, onOpen }: {
  people: Person[];
  recordId: string;
  onOpen: (p: Person) => void;
}) {
  const toast = useToast();
  const paged = usePaged(people, { storeKey: 'pattadar.table.people' });
  const sel = useRowSelection(people, idOf);
  const picking = sel.picked.length > 0;
  const counted = picking ? sel.picked : people;
  const exportCsv = (which: readonly Person[]) => {
    try {
      downloadCsv(`people-${recordId}.csv`, [['Name', 'Role', 'Details', 'Pay'],
        ...which.map((p) => [p.name, p.role, p.summary, p.payValue])]);
    } catch (cause) {
      toast.bad('The people could not be exported.', cause);
    }
  };
  return (
    <>
    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
      <table className="rectable peopletable" aria-label="Caretakers & staff" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th className="selcol">
              <SelectAllBox total={people.length} picked={sel.picked.length} noun={PEOPLE_NOUN}
                            onToggle={sel.toggleAll} />
            </th>
            <th style={{ textAlign: 'left' }}>Name</th>
            <th style={{ textAlign: 'left' }}>Role</th>
            <th style={{ textAlign: 'left' }}>Details</th>
            <th style={{ textAlign: 'left' }}>Pay</th>
          </tr>
        </thead>
        <tbody>
          {paged.shown.map((p) => {
            // The pay column reads the same figure the rail sums — the value
            // string after any label — and shows a dash when there is none, so
            // an owner's row is not blank where a tenant's has a number.
            const pay = p.payValue || '—';
            // A native row, not role="button": a row announced as one button
            // hides its cells from a screen reader walking the table. The name
            // is the real control; a click anywhere else on the row is the
            // pointer's shortcut to the same drawer.
            return (
              <tr key={p.id} className={`peoplerow${sel.selected.has(p.id) ? ' selected' : ''}`} style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button, .selcol')) return;
                    onOpen(p);
                  }}>
                <SelectCell checked={sel.selected.has(p.id)} label={`Select ${p.name}`}
                            onToggle={() => sel.toggle(p.id)} />
                <td>
                  <button type="button" className="rowopen" aria-label={`Open ${p.name}`}
                          onClick={() => onOpen(p)}>
                    <PersonPhoto photoRef={p.photoRef} name={p.name} size="1.75rem" />
                    <strong style={{ fontSize: '0.9375rem' }}>{p.name}</strong>
                  </button>
                </td>
                <td>{p.role ? <span className="pill managed">{p.role}</span> : <span className="note">—</span>}</td>
                <td><span className="note">{p.summary || '—'}</span></td>
                <td><span className="note mono">{pay}</span></td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={4}>
              {picking ? `${plural(counted.length, ...PEOPLE_NOUN)} selected`
                : `Total · ${plural(counted.length, ...PEOPLE_NOUN)}`}
            </th>
            <td className="num">{`${inrFullish(monthlyOf(counted))} / month`}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <TablePager {...paged} onSize={paged.setSize} label="People pages" />
    <SelectionBar count={sel.picked.length} noun={PEOPLE_NOUN}
                  label="Act on the selected people" onClear={sel.clear}>
      <button type="button" className="btn sm" onClick={() => exportCsv(sel.picked)}>
        <FileDownloadOutlined sx={{ fontSize: 15 }} /> Export
      </button>
    </SelectionBar>
    </>
  );
}

/** The status treatment for an owner: the person who holds the land now reads
 *  GREEN (a live, present fact), everyone before them reads RED/muted (a fact
 *  that has passed). The colour never stands alone — it rides a bordered widget
 *  AND a worded pill, so it survives colour-blindness and a greyscale print. */
function ownerTone(isCurrent: boolean) {
  return isCurrent
    ? { pill: 'owned', word: 'Current owner', cls: 'ownercard current' }
    : { pill: 'was', word: 'Previous owner', cls: 'ownercard past' };
}

/** Drawer for one owner — name, parentage, address, role, and whether they hold
 *  it now. The one place an owner is edited or removed. No pay: an owner is not
 *  staff, which is the whole reason owners are a side of this tab of their own
 *  (the Owners segment). */
function OwnerDrawer({ owner, recordTitle, onClose, returnFocus }: {
  owner: Owner;
  recordTitle: string;
  onClose: () => void;
  returnFocus: React.RefObject<HTMLElement | null>;
}) {
  const updateOwner = useUpdateOwner();
  const delOwner = useDeleteOwner();
  const [removeErr, setRemoveErr] = useState('');
  const [name, setName] = useState(owner.name);
  const [parentage, setParentage] = useState(owner.parentage);
  const [address, setAddress] = useState(owner.address);
  const [role, setRole] = useState(owner.role);
  const [isCurrent, setIsCurrent] = useState(owner.isCurrent);
  const [photoRef, setPhotoRef] = useState(owner.photoRef);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState('');

  const dirty = name.trim() !== owner.name || parentage.trim() !== owner.parentage
    || address.trim() !== owner.address || role.trim() !== owner.role
    || isCurrent !== owner.isCurrent || photoRef !== owner.photoRef;
  const canSave = name.trim().length > 0 && dirty && !updateOwner.isPending;

  const save = async () => {
    if (!canSave) return;
    setErr('');
    try {
      const res = await updateOwner.mutateAsync({
        ownerId: owner.id,
        name: name.trim() !== owner.name ? name.trim() : '',
        parentage: parentage.trim() !== owner.parentage ? parentage.trim() : '',
        address: address.trim() !== owner.address ? address.trim() : '',
        role: role.trim() !== owner.role ? role.trim() : '',
        isCurrent,
        photoRef: photoRef === owner.photoRef ? '' : (photoRef || '-'),
      });
      if (!res.web.updateOwner) {
        setErr('That change was not saved. This owner may already be off this property.');
        return;
      }
      onClose();
    } catch {
      setErr('That change could not be saved. Try again.');
    }
  };

  const remove = async () => {
    if (delOwner.isPending) return;
    setRemoveErr('');
    try {
      const res = await delOwner.mutateAsync({ ownerId: owner.id });
      if (!res.web.deleteOwner) {
        setRemoveErr('That owner was not removed. They may already be off this property.');
        return;
      }
      onClose();
    } catch {
      setRemoveErr('That owner could not be removed. They are still on this property.');
    }
  };

  return (
    <Drawer
      eyebrow={drawerEyebrow(recordTitle, 'Owners')}
      title={owner.name}
      sub={ownerTone(isCurrent).word}
      onClose={onClose}
      onSubmit={() => void save()}
      busy={updateOwner.isPending || delOwner.isPending}
      dirty={dirty}
      over={confirming ? (
        <ConfirmDialog
          title={`Remove ${owner.name}?`}
          // What delete_owner does (web360.py): the owner row only. A transfer
          // that names them keeps the name, so they stay on the chain as a
          // party named on a deed.
          body={`${owner.name} comes off this property's owners. A transfer that names them keeps their name.`}
          actionLabel="Remove"
          danger
          busy={delOwner.isPending}
          error={removeErr}
          onConfirm={() => void remove()}
          onClose={() => { setRemoveErr(''); setConfirming(false); }}
        />
      ) : undefined}
      discardCopy={{
        title: 'Discard these changes?',
        body: 'Your changes will be lost.',
      }}
      initialFocus="#od-name"
      returnFocus={returnFocus}
      primary={(
        <DrawerAction label="Save changes" working="Saving…"
          pending={updateOwner.isPending} paused={updateOwner.isPaused} disabled={!canSave} />
      )}
    >
      <div className="field">
        <label htmlFor="od-name">Name</label>
        <input id="od-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <PhotoField name={name} photoRef={photoRef} onChange={setPhotoRef} />
      <div className="field">
        <label htmlFor="od-par">Parentage</label>
        <input id="od-par" type="text" value={parentage} placeholder="S/o, W/o, D/o …"
               onChange={(e) => setParentage(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="od-addr">Address</label>
        <textarea id="od-addr" rows={2} value={address} placeholder="Village, mandal, district"
                  onChange={(e) => setAddress(e.target.value)} />
        <span className="note">Aadhaar or PAN are never kept here.</span>
      </div>
      <div className="field">
        <label htmlFor="od-role">Role</label>
        <input id="od-role" type="text" value={role} placeholder="Owner, Previous owner, Power-of-attorney holder"
               onChange={(e) => setRole(e.target.value)} />
      </div>
      <div className="field">
        <label>Do they hold it now?</label>
        <div className="row tight">
          <Chip wash active={isCurrent} onClick={() => setIsCurrent(true)}>Current owner</Chip>
          <Chip wash active={!isCurrent} onClick={() => setIsCurrent(false)}>Previous owner</Chip>
        </div>
      </div>

      <hr className="hr" />

      <button type="button" className="btn sm" aria-haspopup="dialog"
              onClick={() => { setRemoveErr(''); setConfirming(true); }}>
        <DeleteOutlineOutlined sx={{ fontSize: 16 }} /> Remove from this property
      </button>

      {err && (
        <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{err}</p>
      )}
    </Drawer>
  );
}

/** An owner as a card: a coloured left rail and a worded status pill — green
 *  for who holds it now, red-muted for who held it before. The whole card
 *  opens the owner's drawer. */
function OwnerCard({ owner, onOpen }: { owner: Owner; onOpen: () => void }) {
  const tone = ownerTone(owner.isCurrent);
  const detail = [owner.parentage, owner.address].filter(Boolean).join(' · ');
  return (
    <article className={`card pad-lg peoplecard ${tone.cls}`} style={{ cursor: 'pointer' }}>
      <button type="button" className="cardopen" onClick={onOpen}
              aria-label={`Open ${owner.name}`}
              style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}>
        <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 'var(--space-md)' }}>
          <PersonPhoto photoRef={owner.photoRef} name={owner.name} />
          <div className="grow">
            <div className="row" style={{ gap: 'var(--space-xs)' }}>
              <h2>{owner.name}</h2>
              <span className={`pill ${tone.pill}`}>{tone.word}</span>
              {/* A second pill only when the deed's role adds something the
                  status pill does not already say — e.g. "Power-of-attorney
                  holder". "Owner"/"Previous owner" would just repeat it. */}
              {owner.role && owner.role.trim().toLowerCase() !== tone.word.toLowerCase() && (
                <span className="pill managed">{owner.role}</span>
              )}
            </div>
            {detail && (
              <p className="note" style={{ marginTop: '0.375rem', color: 'var(--w-ink-2)' }}>{detail}</p>
            )}
            {owner.acquiredVia && (
              <p className="note" style={{ marginTop: '0.25rem' }}>Acquired via {owner.acquiredVia}</p>
            )}
          </div>
        </div>
      </button>
    </article>
  );
}

/** Owners as a dense table, current-first, each row opening the drawer. The
 *  status cell carries the same green/red worded pill as the card. design.md
 *  § Tables: ticks, a footer counting owners and how many hold it now (an
 *  owner row carries no share — shares sit on the chain's transfers), the
 *  shared pager and the selection bar with Export. */
function OwnersTable({ owners, recordId, onOpen }: {
  owners: Owner[];
  recordId: string;
  onOpen: (o: Owner) => void;
}) {
  const toast = useToast();
  const paged = usePaged(owners, { storeKey: 'pattadar.table.owners' });
  const sel = useRowSelection(owners, idOf);
  const picking = sel.picked.length > 0;
  const counted = picking ? sel.picked : owners;
  const current = counted.filter((o) => o.isCurrent).length;
  const exportCsv = (which: readonly Owner[]) => {
    try {
      downloadCsv(`owners-${recordId}.csv`, [['Name', 'Status', 'Role', 'Parentage', 'Address', 'Acquired via'],
        ...which.map((o) => [o.name, ownerTone(o.isCurrent).word, o.role, o.parentage, o.address, o.acquiredVia])]);
    } catch (cause) {
      toast.bad('The owners could not be exported.', cause);
    }
  };
  return (
    <>
    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
      <table className="rectable peopletable" aria-label="Owners" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th className="selcol">
              <SelectAllBox total={owners.length} picked={sel.picked.length} noun={OWNER_NOUN}
                            onToggle={sel.toggleAll} />
            </th>
            <th style={{ textAlign: 'left' }}>Name</th>
            <th style={{ textAlign: 'left' }}>Status</th>
            <th style={{ textAlign: 'left' }}>Parentage & address</th>
            <th style={{ textAlign: 'left' }}>Acquired via</th>
          </tr>
        </thead>
        <tbody>
          {paged.shown.map((o) => {
            const tone = ownerTone(o.isCurrent);
            const detail = [o.parentage, o.address].filter(Boolean).join(' · ');
            return (
              <tr key={o.id} className={`peoplerow ${o.isCurrent ? 'ownerrow-current' : 'ownerrow-past'}${sel.selected.has(o.id) ? ' selected' : ''}`}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button, .selcol')) return;
                    onOpen(o);
                  }}>
                <SelectCell checked={sel.selected.has(o.id)} label={`Select ${o.name}`}
                            onToggle={() => sel.toggle(o.id)} />
                <td>
                  <button type="button" className="rowopen" aria-label={`Open ${o.name}`}
                          onClick={() => onOpen(o)}>
                    <PersonPhoto photoRef={o.photoRef} name={o.name} size="1.75rem" />
                    <strong style={{ fontSize: '0.9375rem' }}>{o.name}</strong>
                  </button>
                </td>
                <td><span className={`pill ${tone.pill}`}>{tone.word}</span></td>
                <td><span className="note">{detail || '—'}</span></td>
                <td><span className="note">{o.acquiredVia || '—'}</span></td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={5}>
              {picking ? `${plural(counted.length, ...OWNER_NOUN)} selected` : `Total · ${plural(counted.length, ...OWNER_NOUN)}`}
              {` · ${current} current`}
            </th>
          </tr>
        </tfoot>
      </table>
    </div>
    <TablePager {...paged} onSize={paged.setSize} label="Owner pages" />
    <SelectionBar count={sel.picked.length} noun={OWNER_NOUN}
                  label="Act on the selected owners" onClear={sel.clear}>
      <button type="button" className="btn sm" onClick={() => exportCsv(sel.picked)}>
        <FileDownloadOutlined sx={{ fontSize: 15 }} /> Export
      </button>
    </SelectionBar>
    </>
  );
}

/** The staff side's first read: PersonCard's own boxes (photo, name and role,
 *  summary, the pay grid) in the no-rail split the answer lands in.
 *  shortcut: composed here, not in skeletons.tsx; move it there if a second
 *  screen draws peoplecards. */
function SkPeopleCards() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading the people on this property"
         className="split no-rail">
      <div className="stack" aria-hidden>
        {[0, 1].map((i) => (
          <Card key={i} className="peoplecard">
            <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 'var(--space-md)' }}>
              <Sk w="2.75rem" h="2.75rem" r="var(--radius-pill)" style={{ flex: 'none' }} />
              <div className="grow">
                <div className="row" style={{ gap: 'var(--space-xs)' }}>
                  <Sk w={i ? '8rem' : '10rem'} h="1.125rem" />
                  <Sk w="4.5rem" h="1.25rem" r="var(--radius-pill)" style={{ flex: 'none' }} />
                </div>
                <Sk w="70%" style={{ marginTop: '0.5rem' }} />
              </div>
            </div>
            <hr className="hr" />
            <div className="grid4">
              {[0, 1, 2, 3].map((j) => (
                <div key={j}>
                  <Sk w="50%" h="0.625rem" style={{ marginBottom: '0.3125rem' }} />
                  <Sk w="70%" />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function RecordPeople() {
  /** A link can name the side and the person — the jump box does
   *  (`?section=staff&person=<id>`, web360.py `_person_hit_route`), because
   *  everyone it finds is staff and the tab otherwise opens on Owners. */
  const [params, setParams] = useSearchParams();
  const wantedPerson = params.get('person') ?? '';
  /** Which side of the tab: the ownership chain, or the people who work it. */
  const [section, setSection] = useState<'owners' | 'staff'>(
    () => (params.get('section') === 'staff' || wantedPerson ? 'staff' : 'owners'));
  const [naming, setNaming] = useState(false);
  /** The person whose drawer is open, or null. One drawer, opened from either
   *  view. */
  const [openPerson, setOpenPerson] = useState<Person | null>(null);
  /** The owner whose drawer is open, or null. */
  const [openOwner, setOpenOwner] = useState<Owner | null>(null);
  /** Owners gain a read-only chain canvas; staff keep the two list views. The
   *  choices are separate so moving between sections never leaves a view
   *  control with no pressed option. */
  const [ownerView, setOwnerView] = useState<'chain' | 'cards' | 'table'>('chain');
  const [staffView, setStaffView] = useState<'cards' | 'table'>('cards');
  const assignTrigger = useRef<HTMLButtonElement & HTMLAnchorElement>(null);
  /** Where focus goes when an owner's drawer closes and the card, row or chain
   *  node that opened it is gone — removing an owner takes it with them. The
   *  drawer returns focus to its opener when that is still on the page
   *  (Drawer.tsx useSealedPage); this is the Owners side's always-there
   *  control, as "Assign someone" is the staff side's. */
  const sideSwitch = useRef<HTMLSpanElement>(null);
  const ownersSegment = { get current() { return sideSwitch.current?.querySelector('button') ?? null; } };
  const rec = useRecordCtx();
  const { data, isLoading, error } = usePeople(rec.id);
  const ownersQ = useOwners(rec.id);
  const owners = ownersQ.data?.owners ?? [];
  /** The chain of title. Only fetched for the Owners side of the tab, and the
   *  graph is the only view that reads it — Cards and Table are about people. */
  const transfersQ = useTransfers(section === 'owners' ? rec.id : undefined);
  /** A record can have a chain of title before anybody is filed as an owner —
   *  a transfer needs only names. Gating the graph on the owners list hid those
   *  transfers behind "No owners recorded yet" with no way to reach them. */
  const hasChain = (transfersQ.data?.count ?? 0) > 0;
  const showingChain = (owners.length > 0 || hasChain) && ownerView === 'chain';

  // Open the person the link named once the list has them, then drop the
  // two parameters (replacing the entry), so closing the drawer stays closed
  // and Back does not reopen it. A person no longer on the record still lands
  // on the staff side, where the list says who is.
  useEffect(() => {
    if (!wantedPerson || !data) return;
    const hit = data.people.find((p) => p.id === wantedPerson);
    if (hit) setOpenPerson(hit);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('person');
      next.delete('section');
      return next;
    }, { replace: true });
  }, [wantedPerson, data, setParams]);

  const openFrom = (person: Person) => setOpenPerson(person);
  const openOwnerFrom = (owner: Owner) => setOpenOwner(owner);

  /** The first transfer, filed from the empty Owners state. */
  const [firstTransfer, setFirstTransfer] = useState(false);
  /** The chain's edit mode, driven from this tab's head ⋮. */
  const [chainEditing, setChainEditing] = useState(false);
  const nav = useNavigate();
  const transferTrigger = useRef<HTMLButtonElement & HTMLAnchorElement>(null);

  // The rail only while it has something true to say: the pay figures wait
  // until somebody on this property has an arrangement (as Missing documents
  // waits for a gap), and the payments list until one is recorded.
  const hasArrangement = !!data?.people.some((p) => p.payValue || p.arrangement);
  const hasPayments = (data?.payments.length ?? 0) > 0;
  const hasRail = hasArrangement || hasPayments;

  return (
    <>
      {/* One heading for the tab, its own noun, and one word per side — the
          same concept used to have five names here (Owners, Ownership history,
          Recorded order, Chain of title, "the chain"), with the heading
          flipping between two of them. The pay figures are said once, in the
          rail, so the staff side's line is the headcount. */}
      <SectionHead
        title="People"
        sub={section === 'owners'
          ? (ownersQ.data && (owners.length
              ? `${plural(owners.length, 'owner')} · ${ownersQ.data.currentName || 'Current owner not set'}`
              : ''))
          // No line over a first-run empty side: the empty state says it.
          : (data && data.count > 0 && plural(data.count, 'person', 'people'))}
        actions={section === 'staff' ? {
          primary: {
            label: 'Assign someone', icon: <PersonAddAltOutlined sx={{ fontSize: 17 }} />,
            ref: assignTrigger, haspopup: 'dialog', expanded: naming,
            onClick: () => setNaming(true),
          },
        } : {
          // The Owners side has its own add (Reddy, 13/10/2026): a chain of
          // title grows by transfers, from any view, not only inside Chain.
          primary: ownersQ.data ? {
            label: 'Add a transfer', icon: <AddOutlined sx={{ fontSize: 17 }} />,
            ref: transferTrigger, haspopup: 'dialog', expanded: firstTransfer,
            onClick: () => setFirstTransfer(true),
          } : undefined,
          overflow: [
            // Wherever the Chain view exists — owners on file or transfers filed.
            ...(owners.length > 0 || hasChain ? [{
              label: chainEditing ? 'Done editing' : 'Edit chain',
              icon: <EditOutlined sx={{ fontSize: 17 }} />,
              // Editing happens on the chain, so the view follows it there.
              onClick: () => { setOwnerView('chain'); setChainEditing((v) => !v); },
            }] : []),
            {
              label: 'Order a title opinion',
              icon: <GavelOutlined sx={{ fontSize: 17 }} />,
              onClick: () => nav(orderHref(rec.id, { service: 'title_opinion', why: 'owners' })),
            },
            {
              label: 'Order an encumbrance certificate',
              icon: <ReceiptLongOutlined sx={{ fontSize: 17 }} />,
              onClick: () => nav(orderHref(rec.id, { service: 'ec', why: 'owners' })),
            },
          ],
          overflowHeader: rec.title,
        }}
      />

      {/* The band under the head (design.md § Page head, slot 5; Reddy,
          13/10/2026): which side of the tab first, the view choice at the
          right. The head keeps only commands. */}
      <ToolbarBand
        label="People"
        left={(
          // Owners | Caretakers & staff — the two concerns kept apart. The
          // wrapper only gives the owner drawer a button to hand focus to.
          <span ref={sideSwitch} style={{ display: 'contents' }}>
            <Segmented label="Owners or staff" value={section} onChange={setSection}
                       options={[{ value: 'owners', label: 'Owners' },
                         { value: 'staff', label: 'Caretakers & staff' }]} />
          </span>
        )}
        // One view choice per section. Chain is ownership-only because staff
        // have no succession relationship to draw.
        view={section === 'owners' ? ((owners.length > 0 || hasChain) && (
          <Segmented label="Ownership view" value={ownerView} onChange={setOwnerView}
                     options={[{ value: 'chain', label: 'Chain' }, { value: 'cards', label: 'Cards' },
                       { value: 'table', label: 'Table' }]} />
        )) : (data && data.people.length > 0 && (
          <Segmented label="Staff view" value={staffView} onChange={setStaffView}
                     options={[{ value: 'cards', label: 'Cards' }, { value: 'table', label: 'Table' }]} />
        ))}
      />

      {naming && (
        <AssignDrawer
          recordId={rec.id}
          recordTitle={rec.title}
          returnFocus={assignTrigger}
          onClose={() => setNaming(false)}
        />
      )}

      {/* One drawer for whichever person is open, from cards or table.
          Focus goes back to the card or row that opened it; the fallback is
          for when that is gone — a removal takes the card with it — and is a
          control that is always on this side of the tab, so the next Tab does
          not restart at the top of the document. */}
      {openPerson && (
        <PersonDrawer
          person={openPerson}
          recordId={rec.id}
          recordTitle={rec.title}
          returnFocus={assignTrigger}
          onClose={() => setOpenPerson(null)}
        />
      )}

      {openOwner && (
        <OwnerDrawer
          owner={openOwner}
          recordTitle={rec.title}
          returnFocus={ownersSegment}
          onClose={() => setOpenOwner(null)}
        />
      )}

      {firstTransfer && (
        <TransferDrawer
          recordId={rec.id}
          recordTitle={rec.title}
          transfer={null}
          owners={owners}
          others={transfersQ.data?.transfers ?? []}
          seed={null}
          returnFocus={transferTrigger}
          onClose={() => setFirstTransfer(false)}
        />
      )}

      {/* ── OWNERS HISTORY ─────────────────────────────────────────── */}
      {/* No marginTop: `.sechead` already carries margin-bottom: var(--space-md),
          and Location and Media both sit straight under it. Adding a second
          space-md here put this tab's content one whole step lower than every
          other hanger on the same record. */}
      {section === 'owners' && (
        <div className={`people-owners${showingChain ? ' chain' : ''}`}>
          {ownersQ.isLoading ? (
            // Owners are people with a name and a line under it, whichever of
            // the three views lands; rows hold that shape without guessing it.
            <SkRows rows={3} label="Loading the ownership chain" />
          ) : ownersQ.error && !ownersQ.data ? (
            <Failed what="The ownership chain" error={ownersQ.error} boxed h="18rem" />
          ) : owners.length === 0 && !hasChain ? (
            // A chain of title starts with a transfer. Its add is the head's
            // filled "Add a transfer" now, so this card only says what is missing.
            <Empty boxed h="16rem" icon="person" title="No owners recorded yet">
              A chain of title starts with a transfer: who sold or gave this land, to whom, and when.
            </Empty>
          ) : ownerView === 'chain' ? (
            <OwnerChain
              recordId={rec.id}
              recordTitle={rec.title}
              owners={owners}
              transfersQ={transfersQ}
              onOpenOwner={openOwnerFrom}
              editing={chainEditing}
              onEditingChange={setChainEditing}
            />
          ) : ownerView === 'table' ? (
            <OwnersTable
              owners={owners}
              recordId={rec.id}
              onOpen={openOwnerFrom}
            />
          ) : (
            <div className="stack">
              {owners.map((o) => (
                <OwnerCard
                  key={o.id}
                  owner={o}
                  onOpen={() => openOwnerFrom(o)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── STAFF ──────────────────────────────────────────────────── */}
      {section === 'staff' && isLoading && <SkPeopleCards />}

      {section === 'staff' && error && !data && (
        <Failed what="The people on this property" error={error} boxed h="24rem" />
      )}

      {section === 'staff' && data && (
        <div className={`split${hasRail ? '' : ' no-rail'}`}>
          <div className="stack">
            {data.people.length === 0 ? (
              // No second "Assign someone": the head's is the one flow, and a
              // second filled button under it was the viewport's third fill.
              <Empty boxed h="16rem" icon="person" title="No caretakers or staff recorded" />
            ) : staffView === 'table' ? (
              <PeopleTable
                people={data.people}
                recordId={rec.id}
                onOpen={openFrom}
              />
            ) : (
              <>
                {/* Cards: full cards for the people filed with a role, then the
                    one-line block for those remembered from a closed ticket. */}
                {data.people.filter((p) => !p.compact).map((p) => (
                  <PersonCard
                    key={p.id}
                    person={p}
                    onOpen={() => openFrom(p)}
                  />
                ))}

                {data.people.some((p) => p.compact) && (
                  <div className="card" style={{ padding: 0 }}>
                    <div className="rows boxed">
                      {data.people.filter((p) => p.compact).map((p) => (
                        <button type="button" key={p.id} className="cardopen"
                                aria-label={`Open ${p.name}`}
                                onClick={() => openFrom(p)}
                                style={{ all: 'unset', display: 'flex', width: '100%', cursor: 'pointer', gap: 'var(--space-sm)', alignItems: 'center' }}>
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
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <aside className="stack">
            {/* The two pay figures, said once on this tab and in one format —
                whole rupees, the way each person's own pay is written
                ("₹8,000 / month"), so the sum can be checked against them. */}
            {hasArrangement && (
              <Card title="Payments to people" className="railcard">
                <p className="num" style={{ fontSize: '1.75rem', margin: 0 }}>
                  {inrFullish(data.monthlyOut)}{' '}
                  <span className="note" style={{ fontSize: '0.8125rem' }}>out, each month</span>
                </p>
                {data.seasonalIn > 0 && (
                  <p className="num up" style={{ fontSize: '1.75rem', margin: '0.375rem 0 0' }}>
                    {inrFullish(data.seasonalIn)}{' '}
                    <span className="note" style={{ fontSize: '0.8125rem' }}>in, each season</span>
                  </p>
                )}
                <hr className="hr" />
                {/* The wallet in its own words. While the payments provider is
                    a stub no rupee moves through Pattadar, so this never says
                    "paid from your wallet" — `walletNote` is the API's own
                    sentence for the state it is in, the same words the Wallet
                    page shows. */}
                <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 'var(--space-sm)' }}>
                  <span className="accent" style={{ display: 'flex', paddingTop: '0.125rem' }}>
                    <AccountBalanceWalletOutlined sx={{ fontSize: 18 }} aria-hidden />
                  </span>
                  <span>
                    <strong style={{ fontSize: '0.875rem' }}>
                      {data.walletLive ? 'Paid from your Pattadar wallet' : 'Your Pattadar wallet'}
                    </strong>
                    <span className="note" style={{ display: 'block' }}>
                      Balance {inrFullish(data.walletBalance)} · {data.walletNote}
                    </span>
                  </span>
                </div>
                <Link to="/wallet" className="btn soft"
                      style={{ width: '100%', justifyContent: 'center', marginTop: 'var(--space-sm)' }}>
                  See the wallet
                </Link>
              </Card>
            )}

            {(hasPayments || hasArrangement) && (
              <Card title="Recent payments" className="railcard">
                {data.payments.length === 0 ? (
                  <p className="note">No payments recorded on this property yet.</p>
                ) : (
                <div className="rows">
                  {data.payments.map((p) => (
                    <div key={p.id}>
                      <span style={{ display: 'flex', color: p.state === 'escrow' ? 'var(--w-warn)' : p.direction === 'in' ? 'var(--w-ok)' : 'var(--w-ink-3)' }}>
                        {p.state === 'escrow'
                          ? <AccessTimeOutlined sx={{ fontSize: 16 }} aria-hidden />
                          : p.direction === 'in'
                            ? <SouthWestOutlined sx={{ fontSize: 16 }} aria-hidden />
                            : <NorthEastOutlined sx={{ fontSize: 16 }} aria-hidden />}
                      </span>
                      <span className="grow">
                        <span style={{ display: 'block', fontSize: '0.875rem' }}>{p.title}</span>
                        <span className="note mono" style={{ display: 'block', fontSize: '0.6875rem' }}>
                          {p.subtitle}
                        </span>
                      </span>
                      {/* The direction in a word, not only an arrow and a colour. */}
                      <span className={`num ${p.direction === 'in' ? 'up' : ''}`}
                            style={{ fontSize: '0.8125rem', textAlign: 'right' }}>
                        {inrFullish(p.amount)}
                        <span className="note" style={{ display: 'block', fontSize: '0.6875rem' }}>
                          {paymentWord(p)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
                )}
              </Card>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
