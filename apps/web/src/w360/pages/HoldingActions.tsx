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
import { GraphQLRequestError } from '../../api/client';
import type { GeoPdfReading } from '@pattadar/core';
import {
  useAddJointFmb, useCreateHolding, useDeleteHolding, useRenameHolding,
  useSetBoundary, useSetHoldingMembers, useSetHoldingStake, useSaveHoldingExpense, OWN_NAME,
  useDeleteImpact,
} from '../api';
import type { HoldingCard, RecordCard } from '../api';
import { MAX_UPLOAD_BYTES, mb } from '../filePhotos';
import { readGeoPdfFile } from '../geoPdfFile';
import { uploadToDrive } from '../../pages/documents/storage';
import { Chip, inr, inrFull, num, plural } from '../ui';
import { canCombine, combineStakeFor, stakeOf } from './holdingStake';
import type { CombineStake } from './holdingStake';

export { canCombine, combineStakeFor, stakeOf } from './holdingStake';
export type { CombineStake } from './holdingStake';

const STAKE_PHRASE: Record<CombineStake, string> = {
  owned: 'you own',
  managed: 'you manage',
};

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

  const stake = useMemo(() => combineStakeFor(records), [records]);
  const eligible = useMemo(
    () => (stake ? records.filter((r) => canCombine(r, stake)) : []), [records, stake]);
  const watched = useMemo(() => records.filter((r) => !canCombine(r)), [records]);
  const otherStake = useMemo(
    () => records.filter((r) => canCombine(r) && !eligible.includes(r)), [records, eligible]);
  const acres = eligible
    .filter((r) => r.extentUnit === 'ac')
    .reduce((sum, r) => sum + r.extent, 0);
  /** How many holders the properties being combined have. WHO holds each one
   *  and WHICH holding it is part of are separate facts (decision memo
   *  06/10/2026): a farm can take in a parcel the grandfather's estate holds,
   *  so more than one holder is said, not refused. '' is "In your own name",
   *  which is a holder like any group. */
  const holders = useMemo(() => new Set(eligible.map((r) => r.groupId)).size, [eligible]);
  const mixedHolders = holders > 1;

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
        setErr('These properties could not be combined. One of them may already be '
          + 'part of another holding. Reload the list and try again.');
        return;
      }
      onDone(id);
    } catch (e) {
      // The api refuses with a sentence the owner can act on (one stake per
      // holding, already in another holding, …); anything else is the network.
      setErr(e instanceof GraphQLRequestError && e.message
        ? e.message
        : 'That did not go through. Nothing has been combined.');
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
            {create.isPending ? 'Combining…' : `Combine ${plural(eligible.length, 'property', 'properties')}`}
          </button>
        </>
      )}
    >
      <div className="field">
        <label htmlFor="cp-name">What do you call it</label>
        <input id="cp-name" type="text" value={name} maxLength={120}
               onChange={(e) => setName(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
               placeholder="Kondapur family plots" />
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
                {[r.placeLine, r.khataNo && `Khata ${r.khataNo}`,
                  // Named on every row only when they differ, so the note
                  // below can be checked against the list it describes.
                  mixedHolders && (r.holderLabel || OWN_NAME)].filter(Boolean).join(' · ')}
              </small>
            </span>
            <span className="num">{extentWord(r)}</span>
          </div>
        ))}
      </div>
      {acres > 0 && (
        <p className="note num">
          {num(acres, 2)} ac across {plural(eligible.length, 'property', 'properties')}.
        </p>
      )}

      {stake && eligible.length > 0 && (
        <p className="note">
          A holding keeps one stake: these are all land {STAKE_PHRASE[stake]}.
        </p>
      )}
      {mixedHolders && (
        <p className="note" data-testid="combine-mixed-holders">
          These properties have {holders} holders. That is fine for one farm; who holds each
          one does not change.
        </p>
      )}
      {watched.length > 0 && (
        <p className="note" data-testid="combine-left-out-watched" style={{ color: 'var(--w-warn)' }}>
          Left out: land you are watching. Watched land is never part of a holding:{' '}
          {watched.map((r) => r.title).join(', ')}.
        </p>
      )}
      {stake && otherStake.length > 0 && (
        <p className="note" data-testid="combine-left-out-stake" style={{ color: 'var(--w-warn)' }}>
          Left out: a different stake from the rest
          ({stake === 'owned' ? 'land you manage' : 'land you own'}).
          A holding never mixes owned and managed land:{' '}
          {otherStake.map((r) => r.title).join(', ')}.
        </p>
      )}
      {!enough && (
        <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>
          A holding needs at least two properties with the same stake: all land you
          own, or all land you manage.
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
  const setStake = useSetHoldingStake(false);
  const [name, setName] = useState(holding.name);
  const [note, setNote] = useState(holding.note);
  const [picked, setPicked] = useState<ReadonlySet<string>>(
    () => new Set(holding.members.map((m) => m.recordId)),
  );
  const [err, setErr] = useState('');

  // The holding's one stake is its current members' (rule 3, amended
  // 2026-10-04), so only records of that same stake are offered to add. A
  // holding made before the amendment may be mixed; then no stake is current
  // and the owner picks the one every member takes.
  const memberRecords = useMemo(
    () => candidates.filter((r) => holding.members.some((m) => m.recordId === r.id)),
    [candidates, holding.members],
  );
  const currentStake = useMemo((): CombineStake | null => {
    const kinds = new Set(memberRecords.map(stakeOf));
    const only = kinds.size === 1 ? [...kinds][0] : null;
    return only === 'owned' || only === 'managed' ? only : null;
  }, [memberRecords]);
  const mixed = memberRecords.length > 0 && !currentStake;
  const [stakeChoice, setStakeChoice] = useState<CombineStake | null>(currentStake);
  const holdingStake = stakeChoice ?? currentStake ?? combineStakeFor(memberRecords);
  const restaked = stakeChoice !== null && stakeChoice !== currentStake;
  const mine = useMemo(
    () => candidates.filter((r) => canCombine(r, holdingStake ?? undefined) || picked.has(r.id)),
    [candidates, picked, holdingStake],
  );
  const busy = rename.isPending || setMembers.isPending || setStake.isPending;
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
      if (restaked && stakeChoice) {
        // First, so records of the new stake can then be added to it.
        const ok = (await setStake.mutateAsync({ id: holding.id, stake: stakeChoice })).web.setCombinedStake;
        if (!ok) {
          setErr('The stake could not be changed. Nothing has changed.');
          return;
        }
      }
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
            ? 'The name was saved, but the properties were not changed. One of them '
              + 'may already be in another holding.'
            : 'Those properties could not be saved. One of them may already be in '
              + 'another holding. Nothing was changed.');
          return;
        }
      }
      onClose();
    } catch (e) {
      setErr(e instanceof GraphQLRequestError && e.message
        ? e.message
        : 'That did not go through. Nothing was changed.');
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
                    || (!renamed && !remembered && !restaked)}
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

      <fieldset className="share-paper-picker" aria-describedby="cp-edit-stake-note">
        <legend>Every property in it is</legend>
        {(['owned', 'managed'] as const).map((value) => (
          <label key={value}>
            <input type="radio" name="cp-edit-stake" checked={holdingStake === value && (!mixed || stakeChoice !== null)}
                   onChange={() => setStakeChoice(value)} />
            <span><strong>{value === 'owned' ? 'Owned' : 'Managed'}</strong></span>
          </label>
        ))}
        <p className="note" id="cp-edit-stake-note">
          {mixed
            ? 'These properties have different stakes, from before a holding had to be one stake. Choose the one they all take.'
            : 'A holding keeps one stake. Changing it here changes every property in it, and keeps the holding and its expenses.'}
        </p>
      </fieldset>

      <fieldset className="share-paper-picker">
        <legend>Which properties are in it</legend>
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
          <p className="note">There are no properties with this holding’s stake to combine.</p>
        )}
      </fieldset>
      {!enough && (
        <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>
          Keep at least two properties, or delete the holding instead.
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
/** The holdings a property delete takes with it, said before the press.
 *
 *  A holding goes with its last property (web360 drop_emptied_holdings), and
 *  its shared expenses go with the holding. Deleting the holding itself says
 *  "₹X in shared expenses is deleted with it"; deleting its last property
 *  takes the same money, so it says the same thing. The server answers which
 *  holdings (`deleteImpact`) — the screen does not guess from the cards. */
export function HoldingsGoToo({ ids }: { ids: string[] }) {
  const impact = useDeleteImpact(ids);
  if (impact.isError) {
    return (
      <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-warn)' }}>
        Whether this empties a holding could not be checked. A holding left with no
        property is deleted with its shared expenses.
      </p>
    );
  }
  const gone = impact.data ?? [];
  if (gone.length === 0) return null;
  const last = ids.length === 1 ? 'This is the last property' : 'These are the last properties';
  return (
    <>
      {gone.map((h) => (
        <p key={h.id} className="note" role="alert" data-testid="delete-empties-holding"
           style={{ margin: 0, color: 'var(--w-warn)' }}>
          {last} in <strong>{h.name}</strong>.{' '}
          {h.expenseTotal > 0
            ? <>The holding and its {inrFull(h.expenseTotal)} in shared expenses are deleted too.</>
            : <>The holding is deleted too.</>}
        </p>
      ))}
    </>
  );
}

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
        setErr('That holding could not be deleted. It may already be gone. Reload the page.');
        return;
      }
      onDone();
    } catch {
      setErr('That did not go through. Nothing was deleted.');
    }
  };

  return (
    <Dialog
      title={`Delete the holding ${holding.name}?`}
      onClose={onClose}
      busy={del.isPending}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn danger" disabled={del.isPending}
                  onClick={() => void go()}>
            {del.isPending ? 'Deleting…' : 'Delete holding'}
          </button>
        </>
      )}
    >
      <p className="note" style={{ margin: 0 }}>
        {plural(holding.memberCount, 'property', 'properties')} {holding.memberCount === 1 ? 'goes' : 'go'} back
        to standing on {holding.memberCount === 1 ? 'its' : 'their'} own.
      </p>
      <p className="note" style={{ margin: 0 }}>
        Documents, boundaries, photos, people and each property’s own expenses all
        stay with their properties.
      </p>
      {holding.combinedSpend > 0 && (
        <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-warn)' }}>
          {inr(holding.combinedSpend)} in shared expenses is deleted with it.
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
        setErr('That expense was not saved. Reload the page and try again.');
        return;
      }
      onClose();
    } catch {
      setErr('That did not go through. Nothing was saved.');
    }
  };

  return (
    <Dialog
      title="Add a shared expense"
      onClose={onClose}
      busy={save.isPending}
      dismissable={false}
      initialFocus="#cpe-title"
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={!valid || save.isPending}
                  onClick={() => void submit()}>
            {save.isPending ? 'Adding…' : 'Add the expense'}
          </button>
        </>
      )}
    >
      <p className="note" style={{ marginTop: 0 }}>
        For all {holding.extentLine} of <strong>{holding.name}</strong>.
        This expense is not divided between its properties.
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
          {([['capital', 'Improvement'], ['running', 'Upkeep'],
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
        setErr('The sheet was uploaded but not saved. One of those properties may have '
          + 'left this holding. Reload the page and try again.');
        return;
      }
    } catch {
      setErr('The sheet was uploaded but not saved. Try again.');
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
            {uploading ? 'Uploading…' : add.isPending ? 'Saving…' : 'Add to properties'}
          </button>
        </>
      )}
    >
      <p className="note" style={{ marginTop: 0 }}>
        One sheet that covers more than one survey number. A copy is saved on
        every property you tick, marked as a joint FMB. If the PDF carries map
        positions, you then match its outlines to the properties.
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
        <legend>Which properties it covers</legend>
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
          Tick at least two properties. A sheet for one property is added on that
          property&apos;s own Maps tab.
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
      title="Match the sheet's outlines to properties"
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
        This sheet carries map positions. {plural(reading.outlines.length, 'outline')} could be
        read from its survey lines. Say which property each one is; leave the rest as
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
              <select aria-label={`Property for outline ${i + 1}`} value={assign[i]} disabled={saving}
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
