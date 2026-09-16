/** W07 — what is on the land, and whether it works.
 *
 *  Sorted worst-condition-first, because the reason to open this tab is almost
 *  always that something is broken. Every feature carries its own pin and its
 *  own photos, which is what lets an expense hang off "Borewell 1" instead of
 *  off "the parcel" — and that is what makes the bore's true cost knowable.
 *
 *  A feature filed here starts as a name and nothing else, which is all anyone
 *  standing in a field has. The editor is what turns it into a record: the
 *  spec, the condition, and the sentence explaining what is actually wrong.
 *  Before it existed, every feature added through this page stayed a name with
 *  a green dot beside it — an empty card claiming everything was fine. */
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import AddOutlined from '@mui/icons-material/AddOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import ChecklistOutlined from '@mui/icons-material/ChecklistOutlined';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import MyLocationOutlined from '@mui/icons-material/MyLocationOutlined';

import type { Feature } from '../api';
import {
  useAddFeature, useDeleteFeature, useFeatures, useOrders, useUpdateFeature,
} from '../api';
import { Card, Chip, Failed, Icon, KV, Loading, State, ddmmyyyy, inr, plural } from '../ui';
import { Drawer, DrawerAction, drawerEyebrow } from '../Drawer';
import { useRecordCtx } from './Record';
import { SectionHead } from './RecordHead';

/** The starter kit on the "Add a feature" card. Naming your own is the last
 *  chip because most land has something the list did not think of.
 *
 *  These are names, not kinds: the API reads the kind off the name, so the
 *  chip row and the free-text box cannot drift into classifying the same word
 *  two different ways. */
const TYPES = ['Bore', 'Well', 'Pond', 'Transformer', 'Meter', 'Solar', 'Fence', 'Gate',
  'Shed', 'House', 'Compound wall', 'Trees', 'Crop', 'Road', 'Bund', 'Canal'];
const OWN_TYPE = 'Something else';

/** The four things a feature's condition can be, in the owner's words rather
 *  than the database's. "Not checked" is the one that matters: it is what a
 *  feature is until somebody has stood next to it. */
const STATES: { key: string; label: string }[] = [
  { key: 'good', label: 'Working' },
  { key: 'warn', label: 'Watch it' },
  { key: 'bad', label: 'Broken' },
  { key: 'unknown', label: 'Not checked' },
];

interface Draft {
  id: string; label: string; spec: string; condition: string;
  conditionState: string; note: string;
}

const draftOf = (f: Feature): Draft => ({
  id: f.id, label: f.label, spec: f.spec, condition: f.condition,
  conditionState: f.conditionState || 'unknown', note: f.note,
});

/** Where a seeded action label actually goes, or null when it goes nowhere.
 *
 *  `f.actions` is free text: land_features stores a JSON list of words and
 *  there is nothing behind any of them — "Fix it", "Order fencing", "Bills",
 *  "Service log", "Papers 1", "Deed clause". Drawn as-is they were disabled
 *  buttons explaining themselves in a title attribute, which no browser shows
 *  on a disabled control, so a well-stocked parcel put a row of dead controls
 *  on every card. A label is drawn only when this function can name the screen
 *  that answers it; the rest are dropped and the footnote under the grid says
 *  where those things happen. RecordPeople.destOf does the same for `actions`
 *  on a person.
 *
 *  Matched on the label because the label is all the row carries, which is
 *  also why each of these lands on the screen that holds the thing rather than
 *  on the thing itself. The whole feature comes in because the labels are
 *  counted — "Photos 2", "Papers 1" — and because the gallery link is gated on
 *  the count the card is already printing. */
function destOf(label: string, recordId: string, f: Feature): string | null {
  // "Photos", "Photos 2" — the gallery filtered to this feature. Gated on the
  // count exactly as the photo line above it is: ungated, this was the control
  // whose only outcome was a grid filtered down to nothing.
  if (/^photos\b/i.test(label)) {
    return f.photoCount > 0 ? `/app/records/${recordId}/photos?feature=${f.id}` : null;
  }
  // "Bills", "Income", "Service log" — a power bill, the lease income off the
  // coconut trees, a starter panel replaced. Every one of those is a row in
  // this record's ledger, where a row can hang off the feature it was spent
  // on, which is the whole reason the bore's true cost is knowable.
  if (label === 'Bills' || label === 'Income' || label === 'Service log') {
    return `/app/records/${recordId}/expenses`;
  }
  // "Papers 1", "Lease", "Deed clause" — a subsidy sanction, the tenant's
  // agreement, the right of way. Each is a paper filed on this record, and
  // Papers is the record's own index tab.
  if (/^papers\b/i.test(label) || label === 'Lease' || label === 'Deed clause') {
    return `/app/records/${recordId}`;
  }
  // "Update" and "Update count" are the pencil on this card. "Fix it", "Order
  // fencing" and "Order clearing" are work Pattadar does not book — the
  // catalogue sells records, surveys, opinions and site visits, nothing that
  // mends a fence. The footnote says both.
  return null;
}

/**
 * Filing a feature, in the drawer every hanger now uses.
 *
 * The old shape was the odd one out on the whole record. The header's "Add a
 * feature" did not open anything: it scrolled the page to a dashed card at the
 * end of the grid, focused its name box and flashed a ring at it for 1.4
 * seconds. Pressing a chip in that card filed the feature immediately under a
 * bare name and then opened an inline editor over its new card to ask for the
 * detail — so adding one thing was two writes, in two places, with the page
 * jumping between them.
 *
 * The drawer asks for all of it before anything is written. That is also what
 * fixes the thing the editor existed to patch: a feature filed as a name alone
 * gets a green dot and an empty card, "claiming everything was fine" — the
 * condition is asked for here, up front, and defaults to "Not checked" because
 * that is what a feature IS until somebody has stood next to it.
 *
 * It is still two mutations, because the API has no single call that takes a
 * feature and its detail: addFeature answers with an id, updateFeature fills
 * it in. `filedId` is what keeps a failure in the second half from being read
 * as a failure of the first — the feature exists by then, and a second press
 * must finish it rather than file a duplicate.
 */
function FeatureDrawer({ recordId, recordTitle, onClose, onFiled, returnFocus }: {
  recordId: string;
  recordTitle: string;
  onClose: () => void;
  /** The new feature's id, so the grid can flash the card it just gained. */
  onFiled: (id: string) => void;
  returnFocus: React.RefObject<HTMLButtonElement | null>;
}) {
  const addFeature = useAddFeature();
  const editFeature = useUpdateFeature();
  /** Nothing is pre-selected. A pre-selected "Bore" is a feature filed by one
   *  unread press of the primary — the same objection as a pre-selected role on
   *  the People drawer, and worse here, because a feature is what photographs
   *  and expenses hang off. With nothing chosen the primary refuses, which is
   *  the honest state of a panel that has not been told what it is filing. */
  const [type, setType] = useState('');
  const [own, setOwn] = useState('');
  const [spec, setSpec] = useState('');
  const [condition, setCondition] = useState('');
  const [state, setState] = useState('unknown');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  /** Set once the feature exists, so a second press cannot create a duplicate
   *  when only the detail half failed. */
  const [filedId, setFiledId] = useState('');

  const label = (type === OWN_TYPE ? own : type).trim();
  const busy = addFeature.isPending || editFeature.isPending;
  const detail = !!(spec.trim() || condition.trim() || note.trim() || state !== 'unknown');
  const dirty = !!(type || own.trim() || spec.trim() || condition.trim() || note.trim())
    || state !== 'unknown';

  const file = async () => {
    if (!label || busy) return;
    setErr('');
    let id = filedId;
    try {
      if (!id) {
        const res = await addFeature.mutateAsync({ recordId, label });
        id = res.web.addFeature;
        // addFeature refuses by resolving '' rather than by raising — a label it
        // will not take, or a record that is not this account's. Returning in
        // silence is what made a chip press look as though it were swallowed.
        if (!id) {
          setErr('That feature could not be filed. Reload the page and try again.');
          return;
        }
        setFiledId(id);
      }
      // Only if there is anything to say. A feature filed as a name alone needs
      // no second write, and sending one would be an edit nobody made.
      if (detail) {
        const res = await editFeature.mutateAsync({
          featureId: id,
          label,
          spec: spec.trim(),
          condition: condition.trim(),
          conditionState: state,
          note: note.trim(),
        });
        if (!res.web.updateFeature) {
          setErr(`${label} was filed, but its detail was not saved. Press Save the detail to`
            + ' try that half again, or close this and use the pencil on its card.');
          return;
        }
      }
      onFiled(id);
      onClose();
    } catch {
      setErr(id
        ? `${label} was filed, but its detail was not saved. What you typed is still here.`
        : 'That feature did not save. What you typed is still here — try again.');
    }
  };

  return (
    <Drawer
      eyebrow={drawerEyebrow(recordTitle, 'Features')}
      title="Add a feature"
      sub="A bore, a fence, a shed. It becomes a pin, a photo slot and a repair history of its own."
      onClose={onClose}
      onSubmit={() => void file()}
      busy={busy}
      dirty={dirty && !filedId}
      discardCopy={{
        title: 'Discard this feature?',
        body: 'Nothing has been filed yet. Closing this panel loses the detail you have entered.',
      }}
      // The type chips, because picking one is the first thing to do and
      // nothing is picked for you. Not the Close button, which is what the
      // first-focusable fallback would land on.
      initialFocus="#fa-kinds button"
      returnFocus={returnFocus}
      primary={(
        <DrawerAction
          label={filedId ? 'Save the detail' : 'Add the feature'}
          working="Filing…"
          pending={busy}
          paused={addFeature.isPaused || editFeature.isPaused}
          disabled={!label}
        />
      )}
    >
      {/* Names, not kinds: the API reads the kind and the icon off the name
          (`_classify_feature`), so the chip row and the typed box cannot drift
          into classifying the same word two different ways. */}
      <div className="field">
        <label>What it is</label>
        <div className="row tight" id="fa-kinds">
          {[...TYPES, OWN_TYPE].map((t) => (
            <Chip key={t} active={type === t} onClick={() => setType(type === t ? '' : t)}>
              {t}
            </Chip>
          ))}
        </div>
      </div>

      {type === OWN_TYPE && (
        <div className="field">
          <label htmlFor="fa-own">Name it</label>
          <input id="fa-own" type="text" value={own} placeholder="Something else…"
                 onChange={(e) => setOwn(e.target.value)} />
        </div>
      )}

      <div className="field">
        <label htmlFor="fa-spec">Size, depth, year</label>
        <input id="fa-spec" type="text" value={spec} placeholder="420 ft · 5 in · 2005"
               onChange={(e) => setSpec(e.target.value)} />
      </div>

      {/* "Not checked" is pre-selected and says so. A feature nobody has looked
          at must not start life with a green dot beside it. */}
      <div className="field">
        <label htmlFor="fa-cond">Condition</label>
        <input id="fa-cond" type="text" value={condition}
               placeholder="Working · Yield dropped · Locked"
               onChange={(e) => setCondition(e.target.value)} />
        <span className="row tight" style={{ marginTop: '0.25rem' }}>
          {STATES.map((s) => (
            <Chip key={s.key} active={state === s.key}
                  tone={s.key === 'bad' ? 'alert' : undefined}
                  onClick={() => setState(s.key)}>
              {s.label}
            </Chip>
          ))}
        </span>
      </div>

      <div className="field">
        <label htmlFor="fa-note">Note</label>
        <textarea id="fa-note" rows={3} value={note}
                  placeholder="What a visitor should know."
                  onChange={(e) => setNote(e.target.value)} />
      </div>

      <p className="note" style={{ margin: 0 }}>
        Its pin is set on the Location tab, and its photos are filed on Media. What a repair
        or a bill cost is a row in this record&rsquo;s ledger, hung off this feature.
      </p>

      {err && (
        <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{err}</p>
      )}
    </Drawer>
  );
}

export function RecordFeatures() {
  const rec = useRecordCtx();
  const { data, isLoading, error, refetch } = useFeatures(rec.id);
  const [cat, setCat] = useState('all');
  const delFeature = useDeleteFeature();
  const editFeature = useUpdateFeature();
  const [adding, setAdding] = useState(false);
  const [confirmId, setConfirmId] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const {
    data: orders, isPending: ordersPending, error: ordersError, refetch: refetchOrders,
  } = useOrders(rec.id);
  const editTriggers = useRef(new Map<string, HTMLButtonElement>());
  const removeTriggers = useRef(new Map<string, HTMLButtonElement>());
  const addTrigger = useRef<HTMLButtonElement>(null);
  // One highlight, addressed by a feature's id: the card the drawer just filed.
  // It used to also take the literal 'add', for the dashed card the header
  // button scrolled to — there is no such card to point at now.
  const [flash, setFlash] = useState('');
  // Every write on this page used to fail into silence. The shared mutation
  // hook raises a toast when one throws, but a refused write does not throw —
  // this API answers a refusal with a falsy value — so the reason is kept
  // here, beside the control that asked for it. The delete's reason carries
  // the id of the card it belongs to: `delFeature` is one instance shared by
  // every card, and an unattributed message would print on all of them.
  // Filing's own reason went with the form, into the drawer.
  const [saveErr, setSaveErr] = useState('');
  const [delErr, setDelErr] = useState<{ id: string; msg: string } | null>(null);

  const restoreRowFocus = (buttons: Map<string, HTMLButtonElement>, id: string) => {
    requestAnimationFrame(() => buttons.get(id)?.focus());
  };

  /** Ring the card the drawer just filed. The grid is sorted worst-condition
   *  first, so a new feature does not necessarily land at the end of it — this
   *  is what says which one is yours. Dropping the category filter first,
   *  because a feature filed while a filter is on may not be in the filtered
   *  set at all, and a flash on a card nobody can see says nothing. */
  const filed = (id: string) => {
    setCat('all');
    setFlash(id);
    window.setTimeout(() => setFlash((f) => (f === id ? '' : f)), 1600);
  };

  const save = async (d: Draft) => {
    if (!d.label.trim()) return;
    setSaveErr('');
    try {
      // The whole form goes, every field of it. A cleared spec is an edit —
      // sending only what is non-empty is what made a typo permanent.
      const res = await editFeature.mutateAsync({
        featureId: d.id, label: d.label.trim(), spec: d.spec.trim(),
        condition: d.condition.trim(), conditionState: d.conditionState, note: d.note.trim(),
      });
      // updateFeature answers false for a row that is not this account's, and
      // the hook in api.ts does not declare a result type — so the payload
      // arrives as unknown and has to be read for its answer here. Closing the
      // editor on a false would put the old text back on the card as though
      // the edit had been saved.
      if (!res.web.updateFeature) {
        setSaveErr('That change was not saved. Reload the page and try again.');
        return;
      }
      setCat('all');
      setDraft(null);
      restoreRowFocus(editTriggers.current, d.id);
    } catch {
      setSaveErr('That change could not be saved. What you typed is still here.');
    }
  };

  /** Remove a feature, with the confirm row held open until it is gone.
   *
   *  Closing the row first was worse than saying nothing: the row shut, the
   *  card stayed exactly where it was, and there was no longer a control to
   *  press — which reads as "Remove does not work". */
  const remove = async (id: string) => {
    setDelErr(null);
    try {
      const res = await delFeature.mutateAsync({ featureId: id });
      if (!res.web.deleteFeature) {
        setDelErr({ id, msg: 'That feature could not be removed. Reload the page and try again.' });
        return;
      }
      setConfirmId('');
      // The card that held the pressed control is gone, so focus goes to the
      // one control on this screen that is always there.
      requestAnimationFrame(() => addTrigger.current?.focus());
    } catch {
      setDelErr({ id, msg: 'That feature could not be removed. It is still filed here.' });
    }
  };

  /** Where "Ask for a check" goes: into the order flow, at its first step,
   *  carrying the two things this screen already knows.
   *
   *  This page used to file the ₹1,200 site visit itself, from a confirm
   *  dialog — one tap, no review of what was being bought, no receipt to come
   *  back to, no idempotency key, and nothing checking that the record can even
   *  say where the land is. A visit ordered against a parcel with no pin and no
   *  boundary is a trip nobody can make. The flow at `/order` asks all of that
   *  before it takes money, so the button's job here is to hand over, not to
   *  buy.
   *
   *  `a.check=General+condition` is the prefill for the catalogue's own `check`
   *  field — the same answer that used to be sent as `params` — because from
   *  the features list the brief is not in question: the features are what
   *  needs looking at.
   *
   *  `why=features` is the provenance. It used to be the literal note on the
   *  mutation ("Asked for from the features list"); it now travels as this one
   *  word and `noteFor` in orderFlow.ts turns it back into that same sentence
   *  when the order is actually placed, so the words live in one file instead
   *  of being retyped on every hanger that orders a visit. */
  const orderCheck = `/app/records/${rec.id}/order`
    + '?service=site_visit&step=pick&a.check=General+condition&why=features';

  // A failed read is not an empty record. Keeping `!data` means a background
  // refetch that fails leaves the cached features on screen rather than
  // replacing a working page with an error panel.
  const failed = !!error && !data;
  const existingCheck = orders?.find((o) => o.kind === 'site_visit');
  const checkOrdered = !!existingCheck;
  // Nothing about this record's orders is known yet, or the attempt to find
  // out failed. Either way the duplicate guard below cannot be trusted, so the
  // control has to be inert rather than hopeful — see the comment on it.
  const ordersUnknown = ordersPending || !orders || !!ordersError;
  // A chip the server no longer offers cannot be un-pressed: fix the last
  // broken feature and "Needs repair" disappears from the row while `cat`
  // still holds its key — the grid then empties with nothing on screen saying
  // a filter is on. A selection the data no longer offers is not a filter.
  const options = (data?.categories ?? []).filter((c) => c.count > 0);
  const active = options.some((o) => o.key === cat) ? cat : 'all';

  const shown = (data?.features ?? []).filter((f) => (
    active === 'all' ? true
      : active === 'needs_repair' ? f.conditionState === 'bad'
        : active === 'unchecked' ? f.conditionState === 'unknown'
          : f.category === active));

  // "2 features · 1 not checked · worst condition first". The sort order is
  // part of the sentence because it is the reason the first card is the first
  // card — it used to be asserted in a note off to the right of the chips.
  const unchecked = (data?.features ?? []).filter((f) => f.conditionState === 'unknown').length;
  // A feature with no coordinates cannot be walked to, and one with no photo
  // cannot be checked from a desk. Counted off the features rather than the
  // record: the parcel having a pin says nothing about where the bore is.
  const unpinned = (data?.features ?? []).filter((f) => !f.lat && !f.lon).length;
  const unphotographed = (data?.features ?? []).filter((f) => f.photoCount === 0).length;
  const featuresSub = data && [
    plural(data.total, 'feature'),
    data.needsRepair > 0 && `${data.needsRepair} need${data.needsRepair === 1 ? 's' : ''} repair`,
    unchecked > 0 && `${unchecked} not checked`,
    'worst condition first',
    data.walkedOn && `walked ${ddmmyyyy(data.walkedOn)}${data.walkedBy ? ` by ${data.walkedBy}` : ''}`,
  ].filter(Boolean).join(' · ');

  return (
    <>
      <SectionHead
        title="What is on this land"
        sub={featuresSub}
        actions={(
          <>
          {/* Three shapes, and only the third is a link.

              A visit costs money, so the control still refuses to start a
              second one once an order has actually been filed — it used to
              stay live under a label saying the check was already ordered,
              which bought two.

              The middle branch is why this is not a link in every state. While
              the orders read is in flight, or came back failed, there is no
              answer to "do you already have one of these", and a <Link> has no
              `disabled` — a class that greys it out still navigates on click,
              on Enter, and on a middle-click into a new tab. So the inert state
              is a real disabled <button>, which the browser refuses for us.
              While the read is still running the label says so itself; once it
              has failed, the sentence under this header says so. */}
          {checkOrdered ? (
            <Link className="btn" to={`/app/records/${rec.id}/services`}>
              <ChecklistOutlined sx={{ fontSize: 16 }} /> Open ordered check
            </Link>
          ) : ordersUnknown ? (
            <button type="button" className="btn" disabled>
              <ChecklistOutlined sx={{ fontSize: 16 }} />
              {ordersPending ? 'Checking orders…' : `Ask for a check · ${inr(1200)}`}
            </button>
          ) : (
            <Link className="btn" to={orderCheck}>
              <ChecklistOutlined sx={{ fontSize: 16 }} /> Ask for a check · {inr(1200)}
            </Link>
          )}
          {/* Opens the drawer, like every other "add a thing" on this record.
              It used to scroll the page to a dashed card at the end of the grid
              and flash a ring at it, which is the one add affordance in the app
              that never opened anything.

              Still hidden while the read is failed: filing against a record
              that would not load is not a safe offer. */}
          {!failed && (
            <button ref={addTrigger} type="button" className="btn primary" disabled={isLoading}
                    aria-haspopup="dialog" aria-expanded={adding}
                    onClick={() => setAdding(true)}>
              <AddOutlined sx={{ fontSize: 17 }} /> Add a feature
            </button>
          )}
          </>
        )}
      />

      {adding && (
        <FeatureDrawer
          recordId={rec.id}
          recordTitle={rec.title}
          returnFocus={addTrigger}
          onFiled={filed}
          onClose={() => setAdding(false)}
        />
      )}

      <div className="split">
        <div>
          {ordersError && !orders && (
            <p className="note" role="alert"
               style={{ color: 'var(--w-danger)', marginTop: 'var(--space-sm)' }}>
              Existing orders could not be checked, so another paid visit is disabled.
              {' '}<button type="button" className="linkbtn" onClick={() => void refetchOrders()}>Try again</button>
            </p>
          )}

          {/* The sort order and the per-feature promise moved into the heading's
              own line, so this row is now only the filters it always was. */}
          <div className="row between" style={{ margin: '0 0 var(--space-md)', gap: 'var(--space-lg)' }}>
            <span className="row tight">
              {/* A chip for a category with nothing in it is a filter that leads
                  nowhere — and a red "Needs repair 0" reads as an alarm. Which is
                  why the pressed chip is read from `active` and not from `cat`:
                  the one the server has stopped offering is not on screen to be
                  pressed again. */}
              {options.map((c) => (
                <Chip key={c.key} active={active === c.key} count={c.count}
                      tone={c.key === 'needs_repair' ? 'alert' : undefined}
                      onClick={() => setCat(c.key)}>
                  {c.label}
                </Chip>
              ))}
            </span>
            <span className="note" style={{ textAlign: 'right', flex: '1 1 16rem', minWidth: 0 }}>
              Every one carries its own pin and its own photos
            </span>
          </div>

          {/* One of three, never two at once. The skeleton used to sit above a
              fully live "Add a feature" card, which filed features into a list
              nobody could see yet; and a failed read drew that same card alone,
              which is a page claiming this land has nothing on it. Filing against
              a record that would not load is not a safe offer. */}
          {isLoading ? (
            <Loading h="20rem" />
          ) : failed ? (
            <Failed what="What is on this land" error={error} boxed h="20rem"
                    onRetry={() => void refetch()} />
          ) : (
          /* Four across on a laptop, as drawn. A feature card carries a spec line,
             a condition, a note, coordinates and two actions — squeezed narrower
             than this, every one of those wraps. */
          <>
          <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 21rem), 1fr))' }}>
            {shown.map((f) => (
              <article key={f.id}
                       className={`card ${f.conditionState === 'bad' ? 'alert' : ''}`
                         + (flash === f.id ? ' flash' : '')}
                       style={{ display: 'grid', gap: '0.5rem', alignContent: 'start' }}>
                {draft?.id === f.id ? (
                  /* The editor takes the whole card rather than a row of it: the
                     fields it holds are the card, and typing a spec beside a stale
                     copy of the same spec is how two of them end up disagreeing. */
                  <form className="stack sm"
                        onSubmit={(e) => { e.preventDefault(); void save(draft); }}>
                    <div className="field">
                      <label htmlFor={`fe-name-${f.id}`}>Name</label>
                      <input id={`fe-name-${f.id}`} type="text" value={draft.label} autoFocus
                             aria-label="Name"
                             onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
                    </div>
                    <div className="field">
                      <label htmlFor={`fe-spec-${f.id}`}>What it is</label>
                      <input id={`fe-spec-${f.id}`} type="text" value={draft.spec}
                             aria-label="What it is" placeholder="420 ft · 5 in · 2005"
                             onChange={(e) => setDraft({ ...draft, spec: e.target.value })} />
                    </div>
                    <div className="field">
                      <label htmlFor={`fe-cond-${f.id}`}>Condition</label>
                      <input id={`fe-cond-${f.id}`} type="text" value={draft.condition}
                             aria-label="Condition" placeholder="Working · Yield dropped · Locked"
                             onChange={(e) => setDraft({ ...draft, condition: e.target.value })} />
                      <span className="row tight" style={{ marginTop: '0.25rem' }}>
                        {STATES.map((s) => (
                          <Chip key={s.key} active={draft.conditionState === s.key}
                                tone={s.key === 'bad' ? 'alert' : undefined}
                                onClick={() => setDraft({ ...draft, conditionState: s.key })}>
                            {s.label}
                          </Chip>
                        ))}
                      </span>
                    </div>
                    <div className="field">
                      <label htmlFor={`fe-note-${f.id}`}>Note</label>
                      <textarea id={`fe-note-${f.id}`} rows={3} value={draft.note}
                                aria-label="Note" placeholder="What a visitor should know."
                                onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
                    </div>
                    {/* A refused save left the editor open with the button back on
                        "Save" and nothing else changed, so the only thing to do
                        was press it again. The reason stays above the button that
                        asked for it until the form is closed or reopened. */}
                    {saveErr && (
                      <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>{saveErr}</p>
                    )}
                    <div className="row tight">
                      <button type="submit" className="btn sm primary"
                              disabled={!draft.label.trim() || editFeature.isPending}>
                        {editFeature.isPending ? 'Saving…' : 'Save'}
                      </button>
                      <button type="button" className="btn sm"
                              onClick={() => {
                                const id = draft.id;
                                setSaveErr('');
                                setDraft(null);
                                restoreRowFocus(editTriggers.current, id);
                              }}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="row between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                      <span className="row tight" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                        <span className="muted" style={{ display: 'flex', paddingTop: '0.125rem', color: 'var(--w-info)' }}>
                          <Icon name={f.icon} size={19} />
                        </span>
                        <span>
                          <h3>{f.label}</h3>
                          {/* An empty spec line is a blank gap that reads as a
                              rendering fault. A feature nobody has specified simply
                              has no spec line. */}
                          {f.spec && (
                            <span className="note mono" style={{ display: 'block', marginTop: '0.1875rem' }}>
                              {f.spec}
                            </span>
                          )}
                        </span>
                      </span>
                    </div>

                    {/* A dot with no word beside it says nothing at all — and a
                        green one says something false. Until somebody looks, the
                        card says that in as many words. */}
                    <State state={f.conditionState || 'unknown'}>
                      {f.condition
                        || STATES.find((s) => s.key === (f.conditionState || 'unknown'))?.label
                        || 'Not checked yet'}
                    </State>
                    {f.note && <p className="note" style={{ color: 'var(--w-ink-2)' }}>{f.note}</p>}

                    <div className="row between" style={{ flexWrap: 'nowrap' }}>
                      <span className="note row tight">
                        {f.lat ? (
                          <>
                            <PlaceOutlined sx={{ fontSize: 13 }} aria-hidden />
                            <span className="num">{f.lat.toFixed(4)}, {f.lon.toFixed(4)}</span>
                          </>
                        ) : (
                          <>
                            <MyLocationOutlined sx={{ fontSize: 13 }} aria-hidden /> {f.pinLabel || 'No pin yet'}
                          </>
                        )}
                      </span>
                      {f.photoCount > 0 && (
                        <Link to={`/app/records/${rec.id}/photos?feature=${f.id}`}
                              className="note row tight accent" style={{ textDecoration: 'none' }}>
                          <VisibilityOutlined sx={{ fontSize: 14 }} aria-hidden />{' '}
                          {f.photoCount} photo{f.photoCount === 1 ? '' : 's'}
                        </Link>
                      )}
                    </div>

                    <div className="row tight">
                      {/* These labels come from the record's own data and each names
                          a screen of its own — a bill history, the lease, this
                          feature's photos. A label is drawn only where destOf can
                          name that screen; the rest were disabled buttons whose
                          reason lived in a title attribute no browser renders, and
                          the footnote under the grid says where they happen. */}
                      {f.actions.map((a) => {
                        const to = destOf(a, rec.id, f);
                        return to ? <Link key={a} className="btn sm" to={to}>{a}</Link> : null;
                      })}
                      <span className="grow" />
                      {/* Edit in place, and remove behind a second tap — a feature is
                          what a photo and a repair history hang off, so one stray click
                          should not take it. */}
                      {confirmId === f.id ? (
                        <>
                          {/* `delFeature` is one mutation shared by every card, so
                              the pending state has to be matched to the card that
                              started it — otherwise one Remove greys out all of
                              them. */}
                          <button type="button" className="btn sm danger"
                                  disabled={delFeature.isPending
                                    && delFeature.variables?.featureId === f.id}
                                  onClick={() => void remove(f.id)}>
                            {delFeature.isPending && delFeature.variables?.featureId === f.id
                              ? 'Removing…' : 'Remove'}
                          </button>
                          <button type="button" className="btn sm" onClick={() => {
                            setConfirmId('');
                            restoreRowFocus(removeTriggers.current, f.id);
                          }}>Keep</button>
                        </>
                      ) : (
                        <>
                          <button ref={(node) => { if (node) editTriggers.current.set(f.id, node); }}
                                  type="button" className="iconbtn" aria-label={`Edit ${f.label}`}
                                  onClick={() => { setConfirmId(''); setSaveErr(''); setDraft(draftOf(f)); }}
                                  style={{ border: 0, background: 'none' }}>
                            <EditOutlined sx={{ fontSize: 16 }} />
                          </button>
                          <button ref={(node) => { if (node) removeTriggers.current.set(f.id, node); }}
                                  type="button" className="iconbtn" aria-label={`Remove ${f.label}`}
                                  onClick={() => { setDelErr(null); setConfirmId(f.id); }}
                                  style={{ border: 0, background: 'none' }}>
                            <DeleteOutlineOutlined sx={{ fontSize: 16 }} />
                          </button>
                        </>
                      )}
                    </div>

                    {/* Named to this card, because the message belongs to the one
                        feature that would not go. */}
                    {delErr?.id === f.id && (
                      <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>{delErr.msg}</p>
                    )}
                  </>
                )}
              </article>
            ))}

            {/* The invitation stays at the end of the grid, where the list it
                joins can be seen — a record with nothing on it needs the
                shortest path from here to a filed feature. What changed is that
                it is one control opening the drawer rather than a live form: the
                chip row here filed a feature on a single press, under a bare
                name, before anyone had said what condition it was in. */}
            <button type="button" className="card dashed addcard" aria-haspopup="dialog"
                    onClick={() => setAdding(true)}>
              <h3 className="row tight accent">
                <AddOutlined sx={{ fontSize: 18 }} /> Add a feature
              </h3>
              <p className="note">
                A bore, a fence, a shed. It becomes a pin, a photo slot and a repair history.
              </p>
            </button>
          </div>

          {/* Where the dropped action labels actually happen. Said once, under the
              grid, rather than drawn a dozen times as buttons that refuse — the
              people list footnotes its own dropped labels the same way. It goes
              with the cards: on a record whose only card is "Add a feature" there
              is nothing on screen for any of these sentences to be about. */}
          {(data?.features.length ?? 0) > 0 && (
          <p className="note" style={{ marginTop: 'var(--space-md)' }}>
            Changing what a feature is, or the condition it is in, is the pencil on its own
            card. A power bill, the income a feature earns and what a repair cost are rows in
            this record&rsquo;s{' '}
            <Link className="accent" to={`/app/records/${rec.id}/expenses`}>ledger</Link>, each
            hanging off the feature it was spent on, and a lease, a sanction order or a deed
            clause is filed on the{' '}
            <Link className="accent" to={`/app/records/${rec.id}`}>Papers</Link> tab. Pattadar
            books a site visit — Ask for a check, at the top of this page — but does not
            arrange a repair, a fencing crew or a silt clearing yet.
          </p>
          )}
          </>
          )}
        </div>

        <aside className="stack">
          {/* What state the land is in, counted off the features themselves.
              A record can hold twelve features and still be unknown ground:
              the condition on a card is somebody's last look at it, and
              "Not checked" is the row that says how much of this is memory. */}
          {data && data.total > 0 && (
            <Card title="Condition" className="railcard">
              <KV rows={STATES.map((s) => ({
                k: s.label,
                v: (
                  <span className="num">
                    {data.features.filter((f) => (f.conditionState || 'unknown') === s.key).length}
                  </span>
                ),
              }))} />
              {/* Named as a date rather than a count, because the question an
                  owner is really asking is how old the answer above is. */}
              <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
                {data.walkedOn
                  ? `Last checked on the ground ${ddmmyyyy(data.walkedOn)}`
                    + `${data.walkedBy ? ` by ${data.walkedBy}` : ''}.`
                  : 'Nothing here has been checked on the ground yet — every condition'
                    + ' above is from memory.'}
              </p>
            </Card>
          )}

          {/* The two things that turn a condition from a claim into something a
              stranger can verify. Both are counts out of the same total, so the
              card says how far off the record is rather than only that it is. */}
          {data && data.total > 0 && (unpinned > 0 || unphotographed > 0) && (
            <Card title="Not filled in yet" className="railcard">
              <ul className="railnotes">
                {unpinned > 0 && (
                  <li>{data.total - unpinned} of {plural(data.total, 'feature')} pinned</li>
                )}
                {unphotographed > 0 && (
                  <li>
                    {data.total - unphotographed} of {plural(data.total, 'feature')} photographed
                  </li>
                )}
              </ul>
              <p className="note" style={{ margin: 'var(--space-sm) 0 0' }}>
                A pin sends a checker to the right spot. A dated photograph is what makes
                the condition above checkable by somebody who was not there.
              </p>
              <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
                <Link className="btn sm" to={`/app/records/${rec.id}/map`}>Location</Link>
                <Link className="btn sm" to={`/app/records/${rec.id}/photos`}>Media</Link>
              </div>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
