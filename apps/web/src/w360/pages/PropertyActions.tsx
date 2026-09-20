/** W02's write surfaces — the add/edit drawer and the small confirm/tag
 *  dialogs the list's actions open.
 *
 *  One drawer serves both kinds and both modes. In edit mode it sends ONLY the
 *  fields that differ from the card it was opened with: the server leaves an
 *  omitted field alone, so a form that never touched the khata can never blank
 *  it. Deleting is a dialog, not a menu tap — it takes papers, photos and the
 *  ledger with it, and the copy says so before the red button does it.
 *
 *  Adding is document-first. The drawer opens on ScanFirst, not on the form:
 *  the deed is in the person's hand and the machine can read it, so the form
 *  is what they fall back to, not what they are shown. See ScanFirst for the
 *  three states.
 *
 *  The drawer is a modal in fact and not only in appearance: focus moves into
 *  it, Tab cannot leave it, the page behind it is `inert` rather than merely
 *  covered, and Escape or a slipped click on the scrim asks before throwing
 *  away a half-typed record. A panel that a keyboard can walk straight out of
 *  is a panel a keyboard user cannot tell is open.
 *
 *  All of that was written out here, and the expense drawer had grown its own
 *  copy of the focus trap beside it. It is the shared Drawer now (Drawer.tsx),
 *  which every "add a thing" on a record opens — so this file holds the form and
 *  its rules about what may be sent, and nothing about being a panel. */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router';

import { parseAreaSqYd } from '@pattadar/core';

import { useAddPaper, useSaveRecord } from '../api';
import type { RecordCard, RecordInput } from '../api';
import { Dialog } from '../Dialog';
import { Drawer, DrawerAction, drawerEyebrow } from '../Drawer';
import { ScanFirst } from '../ScanFirst';
import type { DeedRead } from '../ScanFirst';
import { describeReading } from '../paperFiling';
import { STORAGE_OFFLINE_MSG, uploadToDrive } from '../../pages/documents/storage';
import { Chip, inGroup } from '../ui';

const PROP_TYPES = [
  { key: 'flat', label: 'Flat' },
  { key: 'shop', label: 'Shop' },
  { key: 'open_plot', label: 'Open plot' },
];

const unitFor = (kind: string, classification: string) =>
  kind === 'parcel' ? 'ac' : classification === 'open_plot' ? 'sq.yd' : 'sq.ft';
const UNIT_WORD: Record<string, string> = { ac: 'Acres', 'sq.yd': 'Sq.yd', 'sq.ft': 'Sq.ft' };

/** What unit this form should measure in. An edit STARTS from the unit the
 *  record is actually stored in and only moves when the user changes the kind
 *  of thing it is. Deriving it from the classification alone was a data bug:
 *  a shop filed with no built-up area reads in sq.yd, so merely renaming it
 *  would have re-sent its extent as sq.ft and silently turned 850 yards into
 *  850 feet. */
const startUnit = (card: RecordCard | null) =>
  card ? card.extentUnit : unitFor('parcel', 'agri');

/** Which of this form's three units a deed is naming, if it names one.
 *
 *  A deed writes square yards half a dozen ways — "Sq.Yds", "sq. yards",
 *  "square yard", "gajam". The first cut of this matched `yds?` only, so
 *  "418-1/2 sq. yards" named no unit it recognised, fell through to the form's
 *  own, and filed 418.5 ACRES. The e2e case below is that failure. */
const UNIT_IN_WORDS: [RegExp, string][] = [
  [/(?:sq\.?\s*|square\s*)y(?:ds?|ards?)\b|\b(?:gajam|gajalu)\b/, 'sq.yd'],
  [/(?:sq\.?\s*|square\s*)f(?:t|eet)\b/, 'sq.ft'],
  [/\b(?:ac|acs|acres?|cents?)\b/, 'ac'],
];

/** Units this form has no box for. */
const UNIT_UNSHOWABLE = /\b(guntas?|guntha|hectares?|hect|ankanam)\b/;

/** What a deed says the land measures, and in what.
 *
 *  Two things were wrong here. Stripping every non-digit — which is what this
 *  did — turns "418-1/2 sq. yards" into 418.12 and "8-74 Cents" into 874;
 *  core's parseAreaSqYd exists because of exactly that failure and this form
 *  was simply not using it. And the figure was always written under the FORM's
 *  unit, so a deed measured in square yards landed in an acres box: the same
 *  number, four thousand times too much land.
 *
 *  So the unit comes from the paper whenever the paper names one this form can
 *  show — the same rule the phone's add-parcel keeps, and for the same reason:
 *  set the unit to what was written rather than silently reinterpret the
 *  number. A unit with no box here — guntas, hectares — fills nothing, because
 *  an empty field somebody types into beats a confident wrong measurement in a
 *  land record. */
function deedExtent(raw: unknown, formUnit: string): { value: number; unit: string } | null {
  const s = String(raw ?? '').toLowerCase();
  if (!s.trim() || UNIT_UNSHOWABLE.test(s)) return null;
  const value = parseAreaSqYd(s);
  if (!(value > 0)) return null;
  return { value, unit: UNIT_IN_WORDS.find(([re]) => re.test(s))?.[1] ?? formUnit };
}

/** A rupee box that is allowed to be empty.
 *
 *  This used to render `₹${inGroup(Number(value) || 0)}`, which had no way to
 *  say "I don't know what it is worth". An untouched field opened at ₹0;
 *  selecting the contents and pressing Backspace put ₹0 straight back, because
 *  the empty string collapsed to the number zero before it was ever formatted;
 *  and every new record was therefore filed with an explicit price of nothing.
 *  A figure nobody entered is not a figure. So the blank STATE renders blank —
 *  the test is on the string, which leaves a deliberately typed 0 showing ₹0.
 *
 *  The caret is put back by digit count rather than by offset. React restores
 *  the raw offset for us, and that is precisely what leaves the caret one place
 *  behind every time a comma is inserted ahead of it; counting digits ignores
 *  the grouping entirely, so editing the middle of an amount stays where the
 *  person's eye is. */
function MoneyField({ id, label, value, onChange }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
}) {
  const box = useRef<HTMLInputElement>(null);
  /** Digits to the LEFT of the caret, counted before the value was regrouped. */
  const want = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    const n = want.current;
    want.current = null;
    // Only while the person is actually in the box: a re-render from anywhere
    // else must not move a caret nobody put there.
    if (!el || n === null || document.activeElement !== el) return;
    let seen = 0;
    let i = 0;
    for (; i < el.value.length && seen < n; i += 1) {
      if (el.value[i] >= '0' && el.value[i] <= '9') seen += 1;
    }
    el.setSelectionRange(i, i);
  }, [value]);

  const typed = (e: ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const before = el.value.slice(0, el.selectionStart ?? el.value.length);
    want.current = (before.match(/\d/g) ?? []).length;
    onChange(el.value.replace(/[^\d]/g, ''));
  };

  return (
    <div className="field grow">
      <label htmlFor={id}>{label}</label>
      <input ref={box} id={id} type="text" placeholder="Not known"
             value={value ? `₹${inGroup(Number(value))}` : ''} onChange={typed} />
    </div>
  );
}

export function RecordDrawer({ card, onClose, onCreated }: {
  card: RecordCard | null;          // null = add a new record
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const nav = useNavigate();
  const save = useSaveRecord();
  const addPaper = useAddPaper();
  const editing = !!card;
  /** The list hands an archived record the status 'archived' — web360.py
   *  substitutes it so one status test covers both worlds — and this form has
   *  no such option. It answered that by showing "Owned": a statement about
   *  somebody's land that was not true, could not be corrected, and was never
   *  sent, because the same substitution was used as the baseline to compare
   *  against. The form now says what the record is and does not pretend it can
   *  be changed from here. */
  const archived = card?.status === 'archived';

  const [kind, setKind] = useState(card?.kind ?? 'parcel');
  const [title, setTitle] = useState(card?.title ?? '');
  const [classification, setClassification] = useState(
    card?.classification ?? (kind === 'parcel' ? 'agri' : 'flat'));
  const [unit, setUnit] = useState(startUnit(card));
  const [status, setStatus] = useState(card?.status ?? 'owned');
  const [stake, setStake] = useState(card?.stake ?? 'owned');
  const [khata, setKhata] = useState(card?.khataNo ?? '');
  const [owner, setOwner] = useState(card?.ownerName ?? '');
  const [village, setVillage] = useState(card?.village ?? '');
  const [mandal, setMandal] = useState(card?.mandal ?? '');
  const [district, setDistrict] = useState(card?.district ?? '');
  const [extent, setExtent] = useState(card ? String(card.extent) : '');
  const [extentTouched, setExtentTouched] = useState(false);
  /** Only a real figure seeds the box. A stored zero is "not known" rather
   *  than a valuation, and seeding it would put back the unclearable ₹0 the
   *  money fields were fixed to be rid of. */
  const [market, setMarket] = useState(
    card && card.marketValue > 0 ? String(Math.round(card.marketValue)) : '');
  const [paid, setPaid] = useState('');
  /** The hand-entry form. An edit IS the form — there is nothing to read when
   *  the record already exists. An add starts folded and opens on request, on
   *  a successful read, or on a failed one. */
  const [manualOpen, setManualOpen] = useState(editing);
  /** The deed this record was read from, kept so it can be FILED with the
   *  record. Without it the scan produced a record and threw the evidence
   *  away — the record then said it had no papers about the very document it
   *  was made from, and the summary just shown became unreachable. */
  const [scanned, setScanned] = useState<DeedRead | null>(null);
  const [filing, setFiling] = useState('');
  /** Set once the record exists, so a second press cannot create a duplicate
   *  when only the filing half failed. */
  const [savedId, setSavedId] = useState('');
  const [err, setErr] = useState('');

  const isParcel = kind === 'parcel';
  const canSave = title.trim().length > 0 && !save.isPending && !filing;

  /** Changing what the thing IS changes what it is measured in. */
  const reclassify = (next: string, nextKind = kind) => {
    setClassification(next);
    setKind(nextKind);
    setUnit(unitFor(nextKind, next));
  };

  /** Exactly what an edit would send: the fields that differ from the card the
   *  drawer was opened with.
   *
   *  One computation, not two. The drawer asks this twice — once on Save, to
   *  decide what leaves the form, and once when Escape or the scrim wants to
   *  know whether there is anything in here worth losing — and two copies of
   *  the same comparison would drift apart. */
  const edits = useMemo(() => {
    const d: RecordInput = {};
    if (!card) return d;
    if (title.trim() !== card.title) d.title = title.trim();
    if (classification !== card.classification) d.classification = classification;
    if (!archived && status !== card.status) d.status = status;
    if (stake !== card.stake) d.stake = stake;
    if (khata.trim() !== card.khataNo) d.khataNo = khata.trim();
    if (owner.trim() !== card.ownerName) d.ownerName = owner.trim();
    if (village.trim() !== card.village) d.village = village.trim();
    if (mandal.trim() !== card.mandal) d.mandal = mandal.trim();
    if (district.trim() !== card.district) d.district = district.trim();
    // Only a deliberate edit of the extent field travels. A property can
    // carry BOTH a land area and a built-up one while the card shows only
    // the built figure, so re-sending that figure under a newly-chosen unit
    // would write 1,500 sq.ft into the land column and wipe the real 200
    // sq.yd — a reclassification must not re-measure anything.
    if (extentTouched) {
      d.extent = Number(extent) || 0;
      d.extentUnit = unit;
    }
    // A blank money box means "not known", so it leaves the stored valuation
    // alone. Sending `Number('') || 0` silently wrote ₹0 over a real figure
    // the moment anyone cleared the box to see what was in it.
    if (market && Number(market) !== Math.round(card.marketValue)) d.marketValue = Number(market);
    return d;
  }, [card, archived, title, classification, status, stake, khata, owner, village,
      mandal, district, extentTouched, extent, unit, market]);

  /** Is there anything here that closing the drawer would throw away?
   *
   *  "A field has something in it" is the wrong question: an edit drawer opens
   *  full of the record's own values, so that test would nag about discarding
   *  a drawer nobody touched. What matters in edit mode is whether anything
   *  DIFFERS from what is filed, which is what `edits` already holds. An add
   *  drawer starts empty, so there it is anything typed, a deed that was read,
   *  or any of the four choosers moved off its default. */
  const dirty = editing
    ? Object.keys(edits).length > 0
    : !!scanned
      || [title, khata, owner, village, mandal, district, extent, market, paid]
        .some((v) => v.trim().length > 0)
      || kind !== 'parcel' || classification !== 'agri'
      || status !== 'owned' || stake !== 'owned';

  /** Everything that made this panel modal — focus in on open and back to the
   *  opener on close, Tab trapped inside, `inert` on the page behind rather than
   *  a scrim over it, the scroll lock, and the ask-before-discarding that keeps
   *  an Escape aimed at a browser autofill dropdown from destroying a
   *  half-filled record — is the shared Drawer's now (Drawer.tsx). This file
   *  carried all of it, and a second copy of the focus trap lived in the expense
   *  drawer; both are gone.
   *
   *  What is left here is what only this drawer knows: that a saved record whose
   *  deed would not file is ALSO something worth asking about before closing,
   *  because this panel is the one place that says so. */
  const askAbout = savedId
    ? {
      title: 'Close this notice?',
      body: 'The record is saved. This notice is the only place that says its deed was not filed with it — closing leaves the record without that paper until you add it from Papers.',
      keep: 'Keep it open',
      discard: 'Close',
    }
    : {
      title: editing ? 'Discard these changes?' : 'Discard this record?',
      body: editing
        ? 'What you have changed here has not been saved. Closing the drawer loses it.'
        : 'Nothing has been saved yet. Closing the drawer loses everything you have entered.',
      keep: 'Keep editing',
      discard: 'Discard',
    };

  /** File the deed the record was read from, against the record it just made.
   *
   *  Best effort on purpose, and deliberately AFTER the record exists: the
   *  record is already saved, and a storage gateway that is down must not undo
   *  that or turn a successful save into a failure. It throws so the caller can
   *  say what happened instead of navigating away from the message. */
  async function fileDeed(recordId: string, read: DeedRead) {
    const node = await uploadToDrive(read.file);
    if (!node) throw new Error(STORAGE_OFFLINE_MSG);
    const row = describeReading(read.reading, read.file);
    const res = await addPaper.mutateAsync({
      recordId, fileRef: node.id, name: row.name, subtitle: row.subtitle,
      shelf: row.shelf, pageCount: row.pageCount,
      mimeType: node.mimeType, sizeBytes: node.sizeBytes,
    });
    if (!res.web.addPaper) throw new Error('the record would not accept it');
  }

  /** The map is the third way into this drawer: instead of reading a deed or
   *  typing the survey number, find the plot's own shape on Village Maps and
   *  add it from there — the same "Add to Properties" that screen already
   *  offers. Nothing here has been saved yet, so this leaves the same way
   *  Cancel does: at once, with no discard prompt. */
  const pickFromMap = () => {
    onClose();
    nav('/app/villages');
  };

  const submit = async () => {
    // The record already exists and only its deed failed to file; the button
    // is now just a way out, not a second save.
    if (savedId) { if (onCreated) onCreated(savedId); else onClose(); return; }
    setErr('');
    const input: RecordInput = { kind };
    if (editing && card) {
      input.id = card.id;
      // Only what changed leaves the form — the same comparison the drawer
      // uses to decide whether there is anything here to lose.
      Object.assign(input, edits);
      if (Object.keys(input).length <= 2) { onClose(); return; }   // kind + id only
    } else {
      input.title = title.trim();
      input.classification = classification;
      input.status = status;
      input.stake = stake;
      input.khataNo = khata.trim();
      input.ownerName = owner.trim();
      input.village = village.trim();
      input.mandal = mandal.trim();
      input.district = district.trim();
      input.extent = Number(extent) || 0;
      input.extentUnit = unit;
      // An empty money box is a question nobody answered, not ₹0, so it is
      // left out of the input entirely. (The server still stores 0.0 for an
      // omitted price — see web360.py's `_f` — so "unknown" is only as honest
      // as the column, which cannot yet hold NULL.)
      if (market) input.marketValue = Number(market);
      if (paid) input.purchasePrice = Number(paid);
    }
    let newId = '';
    try {
      newId = (await save.mutateAsync({ input })).web.saveRecord;
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The record did not save. Try again.');
      return;
    }
    if (!editing && scanned && newId) {
      setFiling('Filing the deed…');
      try {
        await fileDeed(newId, scanned);
      } catch (e) {
        // Closing here would carry the message away with the drawer. The
        // record IS saved, so the drawer becomes a report of what happened.
        setSavedId(newId);
        setErr(`The record was saved, but its deed could not be filed — ${
          e instanceof Error ? e.message : 'the file did not reach storage'
        }. You can add it from the record's Papers.`);
        return;
      } finally {
        setFiling('');
      }
    }
    if (!editing && newId && onCreated) onCreated(newId);
    else onClose();
  };

  /** Take what a deed says and offer it to the form.
   *
   *  Only empty boxes are filled. Someone who has already typed a survey
   *  number meant it, and a machine's reading is not grounds for overwriting
   *  what a person put there. Returns the plain words for what it filled, so
   *  ScanFirst can say so rather than the form silently rewriting itself. */
  function applyReading(read: DeedRead): string[] {
    setScanned(read);
    const f = read.reading.fields as Record<string, unknown>;
    const str = (k: string) => String(f[k] ?? '').trim();
    /** Whoever bought it, out of the parties list — a deed names both sides,
     *  and the one that becomes this record's owner is the buyer. */
    const buyerIn = (o: Record<string, unknown>): string => {
      const list = Array.isArray(o.parties) ? (o.parties as Record<string, unknown>[]) : [];
      const buyer = list.find((x) => String(x?.role ?? '').toLowerCase() === 'buyer');
      return String(buyer?.name ?? '').trim();
    };
    const fill = (val: string, cur: string, set: (v: string) => void, label: string) => {
      if (!val || cur.trim()) return null;
      set(val);
      return label;
    };
    // The keys are the reader's own, checked against the extraction prompt in
    // main.py. Two of these used to be invented: the khata was read from
    // `khata_no`/`khata` and the owner from `buyer`, and the reader emits
    // neither — it writes `pattadar_no` on a passbook and puts the buyer in
    // `parties`. Both boxes were therefore dead on every real document, and
    // the e2e stub fed the fictional keys, so the suite stayed green over a
    // mapping production never took.
    const got = [
      fill(str('survey_no'), title, setTitle, 'survey number'),
      fill(str('pattadar_no'), khata, setKhata, 'khata'),
      fill(str('owner_name') || buyerIn(f), owner, setOwner, "owner's name"),
      fill(str('village'), village, setVillage, 'village'),
      fill(str('mandal'), mandal, setMandal, 'mandal'),
      fill(str('district'), district, setDistrict, 'district'),
    ].filter(Boolean) as string[];

    const area = deedExtent(f.extent, unit);
    if (area && !extent.trim()) {
      setExtent(String(area.value));
      setUnit(area.unit);
      setExtentTouched(true);
      got.push('extent');
    }
    const cons = Number(String(f.consideration ?? '').replace(/[^\d]/g, ''));
    if (cons > 0 && !paid.trim()) { setPaid(String(cons)); got.push('what you paid'); }

    return got;
  }

  return (
    <Drawer
      eyebrow={editing ? drawerEyebrow(card?.title ?? '', 'Details') : 'Your properties'}
      title={editing ? `Edit ${card?.title}` : 'Add a record'}
      sub={editing
        ? 'Only what you change is sent, so a field this form never touched cannot be blanked by saving.'
        : 'Read it off the deed, or fill it in by hand. Nothing is filed until you press Add record.'}
      onClose={onClose}
      busy={save.isPending || !!filing}
      dirty={dirty || !!savedId}
      discardCopy={askAbout}
      // An edit IS the form, so it opens on the first field. An add opens on
      // ScanFirst, where the deed is — `#rd-title` is not mounted yet, and the
      // scan is the thing to do, so the scan's own button takes focus.
      initialFocus={editing ? '#rd-title' : '.scanbox button'}
      primary={(
        <DrawerAction
          submit={false}
          label={savedId ? 'Done' : editing ? 'Save changes' : 'Add record'}
          working={filing || 'Saving…'}
          pending={save.isPending || !!filing}
          paused={save.isPaused}
          disabled={!canSave && !savedId}
          onClick={submit}
        />
      )}
    >
        {archived && (
          <p className="note" style={{ margin: 0 }}>
            This record is archived. It stays out of your lists, your map and every
            total until you unarchive it from its menu on Properties. Everything
            else here can still be edited.
          </p>
        )}

        {/* Reading the deed instead of typing it. It only fills empty boxes,
            and writes nothing until the person presses Add record — the same
            rule the iOS vault keeps: a machine's reading never becomes a
            record without somebody saying so. */}
        {!editing && (
          <ScanFirst manualOpen={manualOpen} onManualOpenChange={setManualOpen}
                     onRead={applyReading} onPickFromMap={pickFromMap} />
        )}

        {manualOpen && (
          <>
            {!editing && (
              <div className="field">
                <label>What kind of record</label>
                <div className="choice">
                  <button type="button" aria-pressed={isParcel}
                          onClick={() => reclassify('agri', 'parcel')}>
                    Land parcel
                    <small>A survey number with a khata, measured in acres.</small>
                  </button>
                  <button type="button" aria-pressed={!isParcel}
                          onClick={() => reclassify('flat', 'property')}>
                    Built property
                    <small>A flat, a shop or an open plot in a town.</small>
                  </button>
                </div>
              </div>
            )}

            <div className="field">
              <label htmlFor="rd-title">{isParcel ? 'Survey number' : 'What it is called'}</label>
              <input id="rd-title" type="text" value={title}
                     onChange={(e) => setTitle(e.target.value)}
                     placeholder={isParcel ? 'Sy 214/2' : 'Flat 4B · Skyline Heights'} />
            </div>

            {!isParcel && (
              <div className="field">
                <label>Type</label>
                <div className="row tight">
                  {PROP_TYPES.map((t) => (
                    <Chip key={t.key} active={classification === t.key}
                          onClick={() => reclassify(t.key)}>
                      {t.label}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            <div className="row" style={{ gap: 'var(--space-sm)', flexWrap: 'nowrap' }}>
              <div className="field grow">
                <label htmlFor="rd-owner">Owner's name</label>
                <input id="rd-owner" type="text" value={owner}
                       onChange={(e) => setOwner(e.target.value)} placeholder="As the record reads" />
              </div>
              <div className="field" style={{ width: '8rem', flex: 'none' }}>
                <label htmlFor="rd-khata">Khata no</label>
                <input id="rd-khata" type="text" value={khata}
                       onChange={(e) => setKhata(e.target.value)} placeholder="593" />
              </div>
            </div>

            <div className="row" style={{ gap: 'var(--space-sm)', flexWrap: 'nowrap' }}>
              <div className="field grow">
                <label htmlFor="rd-village">{isParcel ? 'Village' : 'Locality'}</label>
                <input id="rd-village" type="text" value={village}
                       onChange={(e) => setVillage(e.target.value)} />
              </div>
              <div className="field grow">
                <label htmlFor="rd-mandal">{isParcel ? 'Mandal' : 'City'}</label>
                <input id="rd-mandal" type="text" value={mandal}
                       onChange={(e) => setMandal(e.target.value)} />
              </div>
            </div>

            <div className="row" style={{ gap: 'var(--space-sm)', flexWrap: 'nowrap' }}>
              <div className="field grow">
                <label htmlFor="rd-district">District</label>
                <input id="rd-district" type="text" value={district}
                       onChange={(e) => setDistrict(e.target.value)} />
              </div>
              <div className="field" style={{ width: '9rem', flex: 'none' }}>
                <label htmlFor="rd-extent">Extent · {UNIT_WORD[unit]}</label>
                <input id="rd-extent" type="number" min="0" step={unit === 'ac' ? '0.01' : '1'}
                       value={extent}
                       onChange={(e) => { setExtent(e.target.value); setExtentTouched(true); }} />
              </div>
            </div>

            <div className="row" style={{ gap: 'var(--space-sm)', flexWrap: 'nowrap' }}>
              {archived ? (
                /* No select, because there is nothing honest for one to show:
                   the status this record carries is 'archived', which is not
                   one of the three options, and a status set here would not be
                   applied while the record is out of the lists. Said in words
                   rather than as a greyed-out control with a tooltip. */
                <div className="field grow">
                  <label>Status</label>
                  <p className="note" style={{ margin: 0 }}>
                    Archived. Unarchive the record to give it a status again.
                  </p>
                </div>
              ) : (
                <div className="field grow">
                  <label htmlFor="rd-status">Status</label>
                  <select id="rd-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="owned">Owned</option>
                    <option value="for_sale">For sale</option>
                    <option value="disputed">Disputed</option>
                  </select>
                </div>
              )}
              <div className="field grow">
                <label htmlFor="rd-stake">Your stake</label>
                <select id="rd-stake" value={stake} onChange={(e) => setStake(e.target.value)}>
                  <option value="owned">Owned</option>
                  <option value="managed">Managed</option>
                  <option value="watch">Watch</option>
                </select>
              </div>
            </div>

            <div className="row" style={{ gap: 'var(--space-sm)', flexWrap: 'nowrap' }}>
              <MoneyField id="rd-market" label="Worth today" value={market} onChange={setMarket} />
              {!editing && (
                <MoneyField id="rd-paid" label="What you paid" value={paid} onChange={setPaid} />
              )}
            </div>

            {err && <p className="note" style={{ color: 'var(--w-danger)' }}>{err}</p>}
          </>
        )}

        {/* The footer is pinned by the shared shell, so it is on screen while
            the form is still folded behind ScanFirst. A disabled primary with
            nothing said about it is the pattern this file removed everywhere
            else, so it says why. */}
        {!manualOpen && (
          <p className="note" style={{ margin: 0 }}>
            Read the deed above, open the form to fill it in by hand, or find the plot on the map.
          </p>
        )}
    </Drawer>
  );
}

/** Both of these were `.overlay` boxes that announced `aria-modal="true"` and
 *  then trapped nothing: Tab walked out into the page they told a screen
 *  reader to ignore, and TagDialog left focus on `<body>` when it closed, so
 *  the next Tab started again from the top of the document. They are the
 *  shared Dialog now, which is the WAI-ARIA pattern in one place. */
export function ConfirmDialog({ title, body, actionLabel, danger, busy, error, onConfirm, onClose }: {
  title: string; body: ReactNode; actionLabel: string; danger?: boolean;
  busy?: boolean; error?: string; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      busy={busy}
      // Cancel comes first in the footer, so Dialog's opening focus lands on
      // it: the safe choice is the one under the thumb.
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className={danger ? 'btn danger' : 'btn primary'}
                  disabled={busy} onClick={onConfirm}>
            {busy ? 'Working…' : actionLabel}
          </button>
        </>
      )}
    >
      <p className="note" style={{ margin: 0 }}>{body}</p>
      {error && (
        <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{error}</p>
      )}
    </Dialog>
  );
}

export function TagDialog({ count, existing, busy, error, onApply, onClose }: {
  count: number; existing: string[]; busy?: boolean; error?: string;
  onApply: (tag: string) => void; onClose: () => void;
}) {
  const [tag, setTag] = useState('');
  // Enter must respect `busy` exactly as the button does — key-repeat on a
  // held Enter would otherwise fire a mutation (and a full refetch) per tick.
  const apply = () => { if (tag.trim() && !busy) onApply(tag.trim()); };

  return (
    <Dialog
      title={`Tag ${count} record${count === 1 ? '' : 's'}`}
      onClose={onClose}
      busy={busy}
      // A typed tag is typed work, so a pointer that slips onto the scrim does
      // not throw it away; Cancel and Escape still do.
      dismissable={false}
      initialFocus="#tg-word"
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={!tag.trim() || busy}
                  onClick={apply}>
            {busy ? 'Tagging…' : 'Apply tag'}
          </button>
        </>
      )}
    >
      <div className="field">
        <label htmlFor="tg-word">Your tag</label>
        <input id="tg-word" type="text" value={tag}
               onChange={(e) => setTag(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter') apply(); }}
               placeholder="give to lawyer" />
      </div>
      {existing.length > 0 && (
        <div className="row tight">
          {existing.map((t) => (
            <Chip key={t} active={tag.trim() === t} onClick={() => setTag(t)}>{t}</Chip>
          ))}
        </div>
      )}
      {error && (
        <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{error}</p>
      )}
    </Dialog>
  );
}
