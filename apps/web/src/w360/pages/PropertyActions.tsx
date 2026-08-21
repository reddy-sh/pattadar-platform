/** W02's write surfaces — the add/edit drawer and the small confirm/tag
 *  dialogs the list's actions open.
 *
 *  One drawer serves both kinds and both modes. In edit mode it sends ONLY the
 *  fields that differ from the card it was opened with: the server leaves an
 *  omitted field alone, so a form that never touched the khata can never blank
 *  it. Deleting is a dialog, not a menu tap — it takes papers, photos and the
 *  ledger with it, and the copy says so before the red button does it. */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import CloseOutlined from '@mui/icons-material/CloseOutlined';

import { useSaveRecord } from '../api';
import type { RecordCard, RecordInput } from '../api';
import { Chip, inGroup } from '../ui';

function useEscape(onClose: () => void) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
}

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

export function RecordDrawer({ card, onClose }: {
  card: RecordCard | null;          // null = add a new record
  onClose: () => void;
}) {
  const save = useSaveRecord();
  const editing = !!card;

  const [kind, setKind] = useState(card?.kind ?? 'parcel');
  const [title, setTitle] = useState(card?.title ?? '');
  const [classification, setClassification] = useState(
    card?.classification ?? (kind === 'parcel' ? 'agri' : 'flat'));
  const [unit, setUnit] = useState(startUnit(card));
  const [status, setStatus] = useState(
    card && card.status !== 'archived' ? card.status : 'owned');
  const [stake, setStake] = useState(card?.stake ?? 'owned');
  const [khata, setKhata] = useState(card?.khataNo ?? '');
  const [owner, setOwner] = useState(card?.ownerName ?? '');
  const [village, setVillage] = useState(card?.village ?? '');
  const [mandal, setMandal] = useState(card?.mandal ?? '');
  const [district, setDistrict] = useState(card?.district ?? '');
  const [extent, setExtent] = useState(card ? String(card.extent) : '');
  const [extentTouched, setExtentTouched] = useState(false);
  const [market, setMarket] = useState(card ? String(Math.round(card.marketValue)) : '');
  const [paid, setPaid] = useState('');
  const [err, setErr] = useState('');

  useEscape(onClose);

  const isParcel = kind === 'parcel';
  const canSave = title.trim().length > 0 && !save.isPending;

  /** Changing what the thing IS changes what it is measured in. */
  const reclassify = (next: string, nextKind = kind) => {
    setClassification(next);
    setKind(nextKind);
    setUnit(unitFor(nextKind, next));
  };

  const submit = async () => {
    setErr('');
    const input: RecordInput = { kind };
    if (editing && card) {
      input.id = card.id;
      // Only what changed leaves the form.
      if (title.trim() !== card.title) input.title = title.trim();
      if (classification !== card.classification) input.classification = classification;
      const status0 = card.status === 'archived' ? 'owned' : card.status;
      if (status !== status0) input.status = status;
      if (stake !== card.stake) input.stake = stake;
      if (khata.trim() !== card.khataNo) input.khataNo = khata.trim();
      if (owner.trim() !== card.ownerName) input.ownerName = owner.trim();
      if (village.trim() !== card.village) input.village = village.trim();
      if (mandal.trim() !== card.mandal) input.mandal = mandal.trim();
      if (district.trim() !== card.district) input.district = district.trim();
      // Only a deliberate edit of the extent field travels. A property can
      // carry BOTH a land area and a built-up one while the card shows only
      // the built figure, so re-sending that figure under a newly-chosen unit
      // would write 1,500 sq.ft into the land column and wipe the real 200
      // sq.yd — a reclassification must not re-measure anything.
      if (extentTouched) {
        input.extent = Number(extent) || 0;
        input.extentUnit = unit;
      }
      const mv = Number(market) || 0;
      if (mv !== Math.round(card.marketValue)) input.marketValue = mv;
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
      input.marketValue = Number(market) || 0;
      input.purchasePrice = Number(paid) || 0;
    }
    try {
      await save.mutateAsync({ input });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The record did not save. Try again.');
    }
  };

  return (
    <>
      <button type="button" className="scrim" aria-label="Close" onClick={onClose} />
      <aside className="drawer" aria-label={editing ? `Edit ${card?.title}` : 'Add a record'}>
        <div className="row between">
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>
              {editing ? 'This record' : 'Your properties'}
            </p>
            <h2>{editing ? `Edit ${card?.title}` : 'Add a record'}</h2>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Close">
            <CloseOutlined sx={{ fontSize: 18 }} />
          </button>
        </div>

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
          <div className="field grow">
            <label htmlFor="rd-status">Status</label>
            <select id="rd-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="owned">Owned</option>
              <option value="for_sale">For sale</option>
              <option value="disputed">Disputed</option>
            </select>
          </div>
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
          <div className="field grow">
            <label htmlFor="rd-market">Worth today</label>
            <input id="rd-market" type="text" value={`₹${inGroup(Number(market) || 0)}`}
                   onChange={(e) => setMarket(e.target.value.replace(/[^\d]/g, ''))} />
          </div>
          {!editing && (
            <div className="field grow">
              <label htmlFor="rd-paid">What you paid</label>
              <input id="rd-paid" type="text" value={`₹${inGroup(Number(paid) || 0)}`}
                     onChange={(e) => setPaid(e.target.value.replace(/[^\d]/g, ''))} />
            </div>
          )}
        </div>

        {err && <p className="note" style={{ color: 'var(--w-danger)' }}>{err}</p>}

        <div className="row" style={{ gap: 'var(--space-sm)', flexWrap: 'nowrap' }}>
          <button type="button" className="btn grow" style={{ justifyContent: 'center' }}
                  onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary grow" style={{ justifyContent: 'center' }}
                  disabled={!canSave} onClick={submit}>
            {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add record'}
          </button>
        </div>
      </aside>
    </>
  );
}

export function ConfirmDialog({ title, body, actionLabel, danger, busy, error, onConfirm, onClose }: {
  title: string; body: ReactNode; actionLabel: string; danger?: boolean;
  busy?: boolean; error?: string; onConfirm: () => void; onClose: () => void;
}) {
  useEscape(onClose);
  // The dialog opens from a kebab item that unmounts on click; without this,
  // focus falls to <body> and Tab walks the background the dialog claims is
  // inert. Cancel takes focus, so the safe choice is the one under the thumb.
  const safe = useRef<HTMLButtonElement>(null);
  useEffect(() => { safe.current?.focus(); }, []);

  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}
           onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p className="note" style={{ margin: 0 }}>{body}</p>
        {error && <p className="note" style={{ margin: 0, color: 'var(--w-danger)' }}>{error}</p>}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
          <button ref={safe} type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className={danger ? 'btn danger' : 'btn primary'}
                  disabled={busy} onClick={onConfirm}>
            {busy ? 'Working…' : actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TagDialog({ count, existing, busy, error, onApply, onClose }: {
  count: number; existing: string[]; busy?: boolean; error?: string;
  onApply: (tag: string) => void; onClose: () => void;
}) {
  const [tag, setTag] = useState('');
  useEscape(onClose);
  // Enter must respect `busy` exactly as the button does — key-repeat on a
  // held Enter would otherwise fire a mutation (and a full refetch) per tick.
  const apply = () => { if (tag.trim() && !busy) onApply(tag.trim()); };

  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Tag records"
           onClick={(e) => e.stopPropagation()}>
        <h2>Tag {count} record{count === 1 ? '' : 's'}</h2>
        <div className="field">
          <label htmlFor="tg-word">Your tag</label>
          <input id="tg-word" type="text" value={tag} autoFocus
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
        {error && <p className="note" style={{ margin: 0, color: 'var(--w-danger)' }}>{error}</p>}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={!tag.trim() || busy}
                  onClick={apply}>
            {busy ? 'Tagging…' : 'Apply tag'}
          </button>
        </div>
      </div>
    </div>
  );
}
