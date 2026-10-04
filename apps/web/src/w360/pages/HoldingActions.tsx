/** The dialogs a holding is made, unmade and filed into with.
 *
 *  All of them are Dialogs rather than the record drawer: each is one short form or
 *  one decision, and the thing being acted on has to stay visible behind it —
 *  the list of records you just ticked, or the holding you are about to ungroup.
 *
 *  Every one of them reads the server's answer instead of assuming success. The
 *  mutations return a falsy value on refusal, so a dialog that closed on
 *  resolution alone would report a holding that was never created.
 */
import { useMemo, useRef, useState } from 'react';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';

import { Dialog } from '../Dialog';
import type { GeoPdfReading } from '@pattadar/core';
import {
  useAddJointFmb, useCreateHolding, useDeleteHolding, useRenameHolding,
  useSetBoundary, useSetHoldingMembers, useSaveHoldingExpense,
} from '../api';
import type { HoldingCard, RecordCard } from '../api';
import { MAX_UPLOAD_BYTES, mb } from '../filePhotos';
import { readGeoPdfFile } from '../geoPdfFile';
import { uploadToDrive } from '../../pages/documents/storage';
import { Chip, inr, num, plural } from '../ui';

/** Records that may be combined, and why the rest may not.
 *
 *  `stake` is the whole test, and it is the server's test too: combining land is
 *  a statement about your own holding, so land you only manage or watch for
 *  somebody else is not yours to group and its costs are not yours to total. It
 *  is explained in the dialog rather than silently filtered, because a record
 *  the owner ticked and cannot find again is worse than a refusal.
 */
export const canCombine = (rec: RecordCard) => (rec.stake || 'owned') === 'owned';

const extentWord = (rec: { extent: number; extentUnit: string }) =>
  (rec.extentUnit === 'ac' ? `${num(rec.extent, 2)} ac` : `${num(rec.extent)} ${rec.extentUnit}`);

/**
 * Combine the records that are selected on the Properties screen.
 *
 * The records are shown, not chosen, here: choosing them is what the selection
 * on the list already is, and a second picker inside this dialog would be the
 * same decision asked twice. The only thing it asks for is the name, because
 * that is the one fact the holding has that its members do not.
 */
export function CombineDialog({ records, onDone, onClose }: {
  records: RecordCard[];
  onDone: (id: string) => void;
  onClose: () => void;
}) {
  const create = useCreateHolding(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

  const eligible = useMemo(() => records.filter(canCombine), [records]);
  const excluded = useMemo(() => records.filter((r) => !canCombine(r)), [records]);
  const acres = eligible
    .filter((r) => r.extentUnit === 'ac')
    .reduce((sum, r) => sum + r.extent, 0);

  const enough = eligible.length >= 2;

  const submit = async () => {
    if (!name.trim() || !enough || create.isPending) return;
    setErr('');
    try {
      const id = (await create.mutateAsync({
        name: name.trim(), recordIds: eligible.map((r) => r.id), note: note.trim(),
      })).web.createCombinedProperty;
      if (!id) {
        // The server refuses for reasons this screen cannot always see — one of
        // these records is already in another holding, or stopped being this
        // account's between the tick and the press.
        setErr('These records could not be combined. One of them may already be '
          + 'part of another holding. Reload the list and try again.');
        return;
      }
      onDone(id);
    } catch {
      setErr('That did not go through. Nothing has been combined.');
    }
  };

  return (
    <Dialog
      title="Combine into one holding"
      onClose={onClose}
      busy={create.isPending}
      // A typed name is typed work: a pointer that slips onto the scrim must
      // not throw it away. Cancel and Escape still close.
      dismissable={false}
      initialFocus="#cp-name"
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary"
                  disabled={!name.trim() || !enough || create.isPending}
                  onClick={() => void submit()}>
            {create.isPending ? 'Combining…' : `Combine ${eligible.length} records`}
          </button>
        </>
      )}
    >
      <div className="field">
        <label htmlFor="cp-name">What do you call it</label>
        <input id="cp-name" type="text" value={name} maxLength={120}
               onChange={(e) => setName(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
               placeholder="Kondapur Estate" />
      </div>
      <div className="field">
        <label htmlFor="cp-note">Anything to remember (optional)</label>
        <input id="cp-note" type="text" value={note} maxLength={500}
               onChange={(e) => setNote(e.target.value)}
               placeholder="Two khatas, one fence" />
      </div>

      <div className="rows boxed" style={{ marginTop: 'var(--space-sm)' }}>
        {eligible.map((r) => (
          <div className="row" key={r.id}>
            <span className="grow">
              <strong>{r.title}</strong>
              <small className="note" style={{ display: 'block' }}>
                {[r.placeLine, r.khataNo && `Khata ${r.khataNo}`].filter(Boolean).join(' · ')}
              </small>
            </span>
            <span className="num">{extentWord(r)}</span>
          </div>
        ))}
      </div>
      {acres > 0 && (
        <p className="note num">
          {num(acres, 2)} ac across {plural(eligible.length, 'record')}.
        </p>
      )}

      {excluded.length > 0 && (
        <p className="note" style={{ color: 'var(--w-warn)' }}>
          Left out — not held in your own name:{' '}
          {excluded.map((r) => r.title).join(', ')}.
        </p>
      )}
      {!enough && (
        <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>
          A holding needs at least two records you hold in your own name.
        </p>
      )}
      {err && (
        <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>{err}</p>
      )}
    </Dialog>
  );
}

/**
 * Rename the holding, and change which records are in it.
 *
 * One dialog for both because they are one sentence to the owner — "this is
 * what it is and this is what is in it" — but two writes underneath, so a
 * rename that succeeds is not undone by a membership change that is refused.
 * The list is every record you hold in your own name, with the ones already in
 * another holding shown as unavailable rather than missing.
 */
export function HoldingEditDialog({ holding, candidates, onClose }: {
  holding: HoldingCard;
  /** Every record the account holds, from the same query the Properties list
   *  runs — so this picker can never disagree with that screen. */
  candidates: RecordCard[];
  onClose: () => void;
}) {
  const rename = useRenameHolding(false);
  const setMembers = useSetHoldingMembers(false);
  const [name, setName] = useState(holding.name);
  const [note, setNote] = useState(holding.note);
  const [picked, setPicked] = useState<ReadonlySet<string>>(
    () => new Set(holding.members.map((m) => m.recordId)),
  );
  const [err, setErr] = useState('');

  const mine = useMemo(
    () => candidates.filter((r) => canCombine(r) || picked.has(r.id)),
    [candidates, picked],
  );
  const busy = rename.isPending || setMembers.isPending;
  const enough = picked.size >= 2;
  const renamed = name.trim() !== holding.name || note.trim() !== holding.note;
  const remembered = [...picked].sort().join(',')
    !== holding.members.map((m) => m.recordId).sort().join(',');

  const toggle = (id: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const submit = async () => {
    if (!name.trim() || !enough || busy) return;
    setErr('');
    try {
      if (renamed) {
        const ok = (await rename.mutateAsync({
          id: holding.id, name: name.trim(), note: note.trim(),
        })).web.updateCombinedProperty;
        if (!ok) {
          setErr('That name could not be saved. Nothing has changed.');
          return;
        }
      }
      if (remembered) {
        // Order matters only for the reader: the records are sent in the order
        // this account already lists them, so the holding keeps the order the
        // owner thinks of it in rather than being re-sorted by survey number.
        const wanted = mine.filter((r) => picked.has(r.id)).map((r) => r.id);
        const ok = (await setMembers.mutateAsync({
          id: holding.id, recordIds: wanted,
        })).web.setCombinedMembers;
        if (!ok) {
          setErr(renamed
            ? 'The name was saved, but the records were not changed — one of them '
              + 'may already be in another holding.'
            : 'Those records could not be saved. One of them may already be in '
              + 'another holding. Nothing was changed.');
          return;
        }
      }
      onClose();
    } catch {
      setErr('That did not go through. Nothing was changed.');
    }
  };

  return (
    <Dialog
      title={`Edit ${holding.name}`}
      onClose={onClose}
      busy={busy}
      dismissable={false}
      wide
      initialFocus="#cp-edit-name"
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary"
                  disabled={!name.trim() || !enough || busy
                    || (!renamed && !remembered)}
                  onClick={() => void submit()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      )}
    >
      <div className="field">
        <label htmlFor="cp-edit-name">What do you call it</label>
        <input id="cp-edit-name" type="text" value={name} maxLength={120}
               onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="cp-edit-note">Anything to remember</label>
        <input id="cp-edit-note" type="text" value={note} maxLength={500}
               onChange={(e) => setNote(e.target.value)} />
      </div>

      <fieldset className="share-paper-picker">
        <legend>Which records are in it</legend>
        {mine.map((r) => (
          <label key={r.id}>
            <input type="checkbox" checked={picked.has(r.id)}
                   onChange={() => toggle(r.id)} />
            <span>
              <strong>{r.title}</strong>
              <small>
                {[r.placeLine, extentWord(r)].filter(Boolean).join(' · ')}
              </small>
            </span>
          </label>
        ))}
        {mine.length === 0 && (
          <p className="note">There are no records held in your own name to combine.</p>
        )}
      </fieldset>
      {!enough && (
        <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>
          Keep at least two records, or remove the holding instead.
        </p>
      )}
      {err && (
        <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>{err}</p>
      )}
    </Dialog>
  );
}

/**
 * Ungroup the holding.
 *
 * The copy is the whole safety here: this is the one action on the screen that
 * destroys something, and what it destroys is narrow — the grouping and the
 * costs recorded against the WHOLE holding, which have nowhere else to live.
 * Every record survives. The dialog counts both, out loud, before the button.
 */
export function HoldingDeleteDialog({ holding, onDone, onClose }: {
  holding: HoldingCard;
  onDone: () => void;
  onClose: () => void;
}) {
  const del = useDeleteHolding(false);
  const [err, setErr] = useState('');

  const go = async () => {
    setErr('');
    try {
      const ok = (await del.mutateAsync({ id: holding.id })).web.deleteCombinedProperty;
      if (!ok) {
        setErr('That holding could not be removed — it may already be gone. Reload the page.');
        return;
      }
      onDone();
    } catch {
      setErr('That did not go through. Nothing was removed.');
    }
  };

  return (
    <Dialog
      title={`Remove the holding ${holding.name}?`}
      onClose={onClose}
      busy={del.isPending}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn danger" disabled={del.isPending}
                  onClick={() => void go()}>
            {del.isPending ? 'Removing…' : 'Remove'}
          </button>
        </>
      )}
    >
      <p className="note" style={{ margin: 0 }}>
        {plural(holding.memberCount, 'record')} {holding.memberCount === 1 ? 'goes' : 'go'} back
        to standing on {holding.memberCount === 1 ? 'its' : 'their'} own.
      </p>
      <p className="note" style={{ margin: 0 }}>
        Papers, boundaries, photographs, people, and each record’s own costs all stay
        with their records.
      </p>
      {holding.combinedSpend > 0 && (
        <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-warn)' }}>
          {inr(holding.combinedSpend)} recorded as shared costs is deleted
          with it.
        </p>
      )}
      {err && (
        <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{err}</p>
      )}
    </Dialog>
  );
}

/**
 * One cost against the whole holding.
 *
 * Deliberately not divided between the members. A fence around sixty acres is
 * one cost; splitting it thirty–thirty would be inventing a split nobody agreed
 * and would make the per-survey ledgers wrong in a way nothing could undo. The
 * form says which scope it is filing at, above the fields.
 */
export function HoldingExpenseDialog({ holding, onClose }: {
  holding: HoldingCard;
  onClose: () => void;
}) {
  const save = useSaveHoldingExpense(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [spentOn, setSpentOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [kind, setKind] = useState<'capital' | 'running' | 'income'>('running');
  const [category, setCategory] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [err, setErr] = useState('');

  const rupees = Number(amount);
  const valid = title.trim() !== '' && Number.isFinite(rupees) && rupees >= 0 && !!spentOn;

  const submit = async () => {
    if (!valid || save.isPending) return;
    setErr('');
    try {
      const id = (await save.mutateAsync({
        combinedId: holding.id, title: title.trim(), amount: rupees, spentOn,
        kind, category: category.trim() || 'other', paidBy: paidBy.trim(),
        vendor: '', note: '', recoverable: false,
      })).web.saveCombinedExpense;
      if (!id) {
        setErr('That cost was not recorded. Reload the page and try again.');
        return;
      }
      onClose();
    } catch {
      setErr('That did not go through. Nothing was recorded.');
    }
  };

  return (
    <Dialog
      title="Record a shared cost"
      onClose={onClose}
      busy={save.isPending}
      dismissable={false}
      initialFocus="#cpe-title"
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={!valid || save.isPending}
                  onClick={() => void submit()}>
            {save.isPending ? 'Recording…' : 'Record cost'}
          </button>
        </>
      )}
    >
      <p className="note" style={{ marginTop: 0 }}>
        Filed against all {holding.extentLine} of <strong>{holding.name}</strong>.
        This cost is not divided between its records.
      </p>
      <div className="field">
        <label htmlFor="cpe-title">What was it</label>
        <input id="cpe-title" type="text" value={title} maxLength={120}
               onChange={(e) => setTitle(e.target.value)}
               placeholder="Boundary fence" />
      </div>
      <div className="row tight">
        <div className="field grow">
          <label htmlFor="cpe-amount">How much (₹)</label>
          <input id="cpe-amount" type="number" min="0" step="1" value={amount}
                 onChange={(e) => setAmount(e.target.value)} placeholder="180000" />
        </div>
        <div className="field grow">
          <label htmlFor="cpe-date">When</label>
          <input id="cpe-date" type="date" value={spentOn}
                 onChange={(e) => setSpentOn(e.target.value)} />
        </div>
      </div>
      <fieldset className="field">
        <legend>What kind of money</legend>
        <div className="row tight">
          {([['capital', 'One-off work'], ['running', 'Running cost'],
             ['income', 'Money in']] as const).map(([key, word]) => (
            <Chip key={key} active={kind === key} onClick={() => setKind(key)}>{word}</Chip>
          ))}
        </div>
      </fieldset>
      <div className="row tight">
        <div className="field grow">
          <label htmlFor="cpe-category">Put it under (optional)</label>
          <input id="cpe-category" type="text" value={category} maxLength={40}
                 onChange={(e) => setCategory(e.target.value)} placeholder="fencing" />
        </div>
        <div className="field grow">
          <label htmlFor="cpe-paid">Who paid (optional)</label>
          <input id="cpe-paid" type="text" value={paidBy} maxLength={60}
                 onChange={(e) => setPaidBy(e.target.value)} placeholder="You" />
        </div>
      </div>
      {err && (
        <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>{err}</p>
      )}
    </Dialog>
  );
}

/**
 * File one FMB sheet that covers several of the holding's surveys — a joint FMB.
 *
 * The survey office often issues one sketch for adjoining survey numbers. It is
 * uploaded once and filed as a flagged copy on EVERY survey ticked here, so each
 * record's own Documents and Location screens find it like any other sheet.
 *
 * It is not sent to the paid reader. When it is a georeferenced PDF, its
 * outlines are read in the browser afterwards and the owner assigns each one
 * to a survey (JointOutlinesDialog); nothing is saved as a boundary until then.
 */
export function JointFmbDialog({ holding, onClose }: {
  holding: HoldingCard;
  onClose: () => void;
}) {
  const add = useAddJointFmb(false);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(
    () => new Set(holding.members.map((m) => m.recordId)),
  );
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const [outlines, setOutlines] = useState<GeoPdfReading | null>(null);

  const busy = uploading || add.isPending;
  const enough = picked.size >= 2;

  const toggle = (id: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const choose = (f: File | undefined) => {
    setErr('');
    if (!f) return;
    if (f.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      setErr(`${f.name} is ${mb(f.size)}. The limit is ${mb(MAX_UPLOAD_BYTES)}.`);
      return;
    }
    setFile(f);
  };

  const submit = async () => {
    if (!file || !enough || busy) return;
    setErr('');
    setUploading(true);
    let node;
    try {
      node = await uploadToDrive(file);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The sheet could not be uploaded. Try again.');
      return;
    } finally {
      setUploading(false);
    }
    try {
      const recordIds = holding.members
        .filter((m) => picked.has(m.recordId)).map((m) => m.recordId);
      const id = (await add.mutateAsync({
        combinedId: holding.id, fileRef: node.id, name: node.name || file.name,
        mimeType: node.mimeType || file.type || '', sizeBytes: node.sizeBytes || file.size,
        recordIds,
      })).web.addJointFmb;
      if (!id) {
        setErr('The sheet was uploaded but not filed. One of those records may have '
          + 'left this holding — reload the page and try again.');
        return;
      }
    } catch {
      setErr('The sheet was uploaded but not filed. Try again.');
      return;
    }
    // A georeferenced PDF (QGIS, ArcGIS) carries its survey lines as vector
    // paths tied to the ground. Read them here, locally and for free, and let
    // the owner say which outline is which survey.
    const geo = await readGeoPdfFile(file);
    if (geo) setOutlines(geo);
    else onClose();
  };

  if (outlines) {
    return <JointOutlinesDialog holding={holding} reading={outlines} onClose={onClose} />;
  }

  return (
    <Dialog
      title="Add a joint FMB"
      onClose={onClose}
      busy={busy}
      dismissable={false}
      wide
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn primary" disabled={!file || !enough || busy}
                  onClick={() => void submit()}>
            {uploading ? 'Uploading…' : add.isPending ? 'Filing…' : 'Add to records'}
          </button>
        </>
      )}
    >
      <p className="note" style={{ marginTop: 0 }}>
        One sheet that covers more than one survey number. A copy is filed on
        every record you tick, marked as a joint FMB. If it is a georeferenced
        PDF, you then match its outlines to the records.
      </p>
      <div className="field">
        <label htmlFor="jf-file">The sheet (PDF or photo)</label>
        <input ref={input} id="jf-file" type="file" accept="application/pdf,image/*" hidden
               onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }} />
        <div className="row tight">
          <button type="button" className="btn" disabled={busy}
                  onClick={() => input.current?.click()}>
            <UploadFileOutlined sx={{ fontSize: 16 }} /> {file ? 'Choose another' : 'Choose a file'}
          </button>
          {file && <span className="note">{file.name} · {mb(file.size)}</span>}
        </div>
      </div>

      <fieldset className="share-paper-picker">
        <legend>Which records it covers</legend>
        {holding.members.map((m) => (
          <label key={m.recordId}>
            <input type="checkbox" checked={picked.has(m.recordId)}
                   disabled={busy} onChange={() => toggle(m.recordId)} />
            <span>
              <strong>{m.title}</strong>
              <small>{[m.placeLine, extentWord(m)].filter(Boolean).join(' · ')}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {!enough && (
        <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>
          Tick at least two records. A sheet for one record is added on that
          record&apos;s own Location tab.
        </p>
      )}
      {err && (
        <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>{err}</p>
      )}
    </Dialog>
  );
}

/** Suggest which survey each outline is, by area — only where one survey is
 *  clearly the nearest (within 10%) and nobody else wants it. A suggestion is
 *  a pre-filled choice the owner can see and change, never a save. */
function suggest(reading: GeoPdfReading, holding: HoldingCard): string[] {
  const out = reading.outlines.map(() => '');
  const taken = new Set<string>();
  const pairs: Array<{ o: number; id: string; off: number }> = [];
  reading.outlines.forEach((o, i) => {
    for (const m of holding.members) {
      if (m.extentUnit !== 'ac' || !(m.extent > 0)) continue;
      pairs.push({ o: i, id: m.recordId, off: Math.abs(o.areaAc - m.extent) / m.extent });
    }
  });
  pairs.sort((a, b) => a.off - b.off);
  for (const p of pairs) {
    if (p.off > 0.1 || out[p.o] || taken.has(p.id)) continue;
    out[p.o] = p.id;
    taken.add(p.id);
  }
  return out;
}

/** The outlines as a small numbered picture, so "outline 2" means something.
 *  Drawn in a local plane (longitude scaled by the cosine of the latitude), so
 *  the shapes keep their proportions. */
function OutlinePreview({ reading, active }: { reading: GeoPdfReading; active: number | null }) {
  const all = reading.outlines.flatMap((o) => o.ring);
  const lat0 = all.reduce((s, p) => s + p[0], 0) / Math.max(1, all.length);
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = all.map((p) => p[1] * k);
  const ys = all.map((p) => p[0]);
  const x0 = Math.min(...xs);
  const y1 = Math.max(...ys);
  const span = Math.max(Math.max(...xs) - x0, y1 - Math.min(...ys)) || 1;
  const W = 280;
  const at = ([lat, lon]: [number, number]) =>
    [((lon * k - x0) / span) * (W - 20) + 10, ((y1 - lat) / span) * (W - 20) + 10];
  const h = ((y1 - Math.min(...ys)) / span) * (W - 20) + 20;
  return (
    <svg viewBox={`0 0 ${W} ${h}`} width="100%" style={{ maxHeight: '16rem' }} role="img"
         aria-label={`${plural(reading.outlines.length, 'outline')} read from the sheet`}>
      {reading.outlines.map((o, i) => {
        const pts = o.ring.map(at);
        const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        const on = active === i;
        return (
          <g key={i}>
            <polygon points={pts.map((p) => p.join(',')).join(' ')}
                     fill={on ? 'var(--w-accent-wash)' : 'var(--w-surface-2)'}
                     stroke={on ? 'var(--w-accent)' : 'var(--w-ink-3)'} strokeWidth={on ? 2 : 1} />
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
                  className="num" fill="var(--w-ink)">{i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Match the outlines read off a georeferenced joint FMB to the surveys.
 *
 * The sheet says where each outline is on the ground; it does not say, in any
 * way a program can read, which survey number each one is — the labels are
 * drawn, not typed. So the owner says, outline by outline, with the areas
 * beside each to go on. Only the outlines given a survey are saved, each as
 * that record's own boundary, exactly as a KML import would be; a survey that
 * already has a saved boundary is marked, because this replaces it.
 */
export function JointOutlinesDialog({ holding, reading, onClose }: {
  holding: HoldingCard;
  reading: GeoPdfReading;
  onClose: () => void;
}) {
  const setBoundary = useSetBoundary();
  const [assign, setAssign] = useState<string[]>(() => suggest(reading, holding));
  const [active, setActive] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const chosen = assign.filter(Boolean).length;
  const byId = new Map(holding.members.map((m) => [m.recordId, m]));

  const pick = (i: number, id: string) => setAssign((prev) =>
    prev.map((v, j) => (j === i ? id : v === id && id ? '' : v)));

  const save = async () => {
    if (!chosen || saving) return;
    setErr('');
    setSaving(true);
    const failed: string[] = [];
    for (let i = 0; i < assign.length; i += 1) {
      const id = assign[i];
      if (!id) continue;
      try {
        const ok = (await setBoundary.mutateAsync({
          recordId: id, ring: reading.outlines[i].ring.flat(),
        })).web.setBoundary;
        if (!ok) failed.push(byId.get(id)?.title ?? id);
      } catch {
        failed.push(byId.get(id)?.title ?? id);
      }
    }
    setSaving(false);
    if (failed.length) {
      setErr(`The boundary could not be saved for ${failed.join(', ')}. The others were saved.`);
      return;
    }
    onClose();
  };

  return (
    <Dialog
      title="Match the sheet's outlines to records"
      onClose={onClose}
      busy={saving}
      dismissable={false}
      wide
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Not now
          </button>
          <button type="button" className="btn primary" disabled={!chosen || saving}
                  onClick={() => void save()}>
            {saving ? 'Saving…' : `Save ${plural(chosen, 'boundary', 'boundaries')}`}
          </button>
        </>
      )}
    >
      <p className="note" style={{ marginTop: 0 }}>
        This sheet is georeferenced. {plural(reading.outlines.length, 'outline')} could be
        read from its survey lines. Say which record each one is; leave the rest as
        &ldquo;Not one of these&rdquo;.
      </p>
      <OutlinePreview reading={reading} active={active} />
      <div className="rows">
        {reading.outlines.map((o, i) => {
          const m = assign[i] ? byId.get(assign[i]) : undefined;
          return (
            <div className="row" key={i}
                 onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
              <span className="grow">
                <strong>Outline {i + 1}</strong>
                <small className="note" style={{ display: 'block' }}>
                  <span className="num">{num(o.areaAc, 2)} ac</span> measured · {o.ring.length} corners
                  {m && m.extentUnit === 'ac' && m.extent > 0 && (
                    <> · {m.title} is <span className="num">{num(m.extent, 2)} ac</span> on record</>
                  )}
                  {m?.ground === 'surveyed' && <> · replaces its saved boundary</>}
                </small>
              </span>
              <select aria-label={`Record for outline ${i + 1}`} value={assign[i]} disabled={saving}
                      onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                      onChange={(e) => pick(i, e.target.value)}>
                <option value="">Not one of these</option>
                {holding.members.map((mm) => (
                  // Two members can share a title ("Sy 1" in two villages), so
                  // the extent rides along to tell them apart.
                  <option key={mm.recordId} value={mm.recordId}>
                    {mm.title} · {extentWord(mm)}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      {err && (
        <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>{err}</p>
      )}
    </Dialog>
  );
}
