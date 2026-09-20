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
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';

import type { Feature, FeatureFieldDefinition, FeatureTypeDefinition } from '../api';
import {
  useAddFeature, useDeleteFeature, useFeatures, useOrders, useSaveFeatureCost,
  useUpdateFeature,
} from '../api';
import { Card, Chip, Failed, Icon, KV, Loading, State, ddmmyyyy, inr, plural } from '../ui';
import { Drawer, DrawerAction, drawerEyebrow } from '../Drawer';
import { useRecordCtx } from './Record';
import { SectionHead } from './RecordHead';
import { MAX_UPLOAD_BYTES, mb } from '../filePhotos';
import { uploadToDrive } from '../../pages/documents/storage';

/** The starter kit on the "Add a feature" card. Naming your own is the last
 *  chip because most land has something the list did not think of.
 *
 *  These are names, not kinds: the API reads the kind off the name, so the
 *  chip row and the free-text box cannot drift into classifying the same word
 *  two different ways. */
/** The four things a feature's condition can be, in the owner's words rather
 *  than the database's. "Not checked" is the one that matters: it is what a
 *  feature is until somebody has stood next to it. */
const STATES: { key: string; label: string }[] = [
  { key: 'good', label: 'Working' },
  { key: 'warn', label: 'Watch it' },
  { key: 'bad', label: 'Broken' },
  { key: 'unknown', label: 'Not checked' },
];

type FeatureAttributes = Record<string, string | number | boolean>;

const attributesOf = (feature?: Feature): FeatureAttributes => {
  try {
    const value = JSON.parse(feature?.attributes || '{}') as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as FeatureAttributes : {};
  } catch {
    return {};
  }
};

const fieldIsVisible = (field: FeatureFieldDefinition, values: FeatureAttributes) => (
  !field.dependsOn || String(values[field.dependsOn] ?? '').toLowerCase() === field.dependsValue
);

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
 * New features are one transaction, including an optional first cost. Existing
 * features use the same form and an optimistic version so one stale browser
 * cannot quietly overwrite another visit's measurements.
 */
function FeatureDrawer({ recordId, recordTitle, types, feature, onClose, onSaved, returnFocus }: {
  recordId: string;
  recordTitle: string;
  types: FeatureTypeDefinition[];
  feature?: Feature;
  onClose: () => void;
  onSaved: (id: string) => void;
  returnFocus: React.RefObject<HTMLButtonElement | null>;
}) {
  const addFeature = useAddFeature();
  const editFeature = useUpdateFeature();
  const saveCost = useSaveFeatureCost();
  const [typeKey, setTypeKey] = useState(feature?.typeKey || '');
  const [label, setLabel] = useState(feature?.label || '');
  const [attributes, setAttributes] = useState<FeatureAttributes>(attributesOf(feature));
  const [condition, setCondition] = useState(feature?.condition || '');
  const [state, setState] = useState(feature?.conditionState || 'unknown');
  const [note, setNote] = useState(feature?.note || '');
  const [lat, setLat] = useState(feature?.lat ? String(feature.lat) : '');
  const [lon, setLon] = useState(feature?.lon ? String(feature.lon) : '');
  const [pinSource, setPinSource] = useState(feature?.lat ? 'manual' : '');
  const [accuracy, setAccuracy] = useState(0);
  const [locating, setLocating] = useState(false);
  const [addCost, setAddCost] = useState(false);
  const [costKind, setCostKind] = useState('capital');
  const [costTitle, setCostTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [purchasedOn, setPurchasedOn] = useState('');
  const [vendor, setVendor] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [warrantyUntil, setWarrantyUntil] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<{
    id: string; name: string; mimeType: string; sizeBytes: number;
  } | null>(null);
  const [version, setVersion] = useState(feature?.version || 0);
  const [err, setErr] = useState('');
  const schema = types.find((item) => item.key === typeKey);
  const busy = addFeature.isPending || editFeature.isPending || saveCost.isPending;
  const dirty = feature ? (
    typeKey !== feature.typeKey || label !== feature.label
    || JSON.stringify(attributes) !== JSON.stringify(attributesOf(feature))
    || condition !== feature.condition || state !== (feature.conditionState || 'unknown')
    || note !== feature.note || lat !== (feature.lat ? String(feature.lat) : '')
    || lon !== (feature.lon ? String(feature.lon) : '') || addCost
  ) : !!(typeKey || label.trim() || Object.keys(attributes).length || condition.trim()
    || note.trim() || lat || lon || addCost || state !== 'unknown');

  const chooseType = (next: FeatureTypeDefinition) => {
    if (next.key === typeKey) return;
    setTypeKey(next.key);
    setAttributes({});
    if (!label.trim() || types.some((item) => item.label === label)) {
      setLabel(next.key === 'custom' ? '' : next.label);
    }
  };

  const setAttribute = (key: string, value: string | number | boolean) => {
    setAttributes((current) => {
      const next = { ...current };
      if (value === '') delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setErr('This browser cannot read the device location. Enter the coordinates instead.');
      return;
    }
    setLocating(true);
    setErr('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude.toFixed(6));
        setLon(position.coords.longitude.toFixed(6));
        setAccuracy(position.coords.accuracy || 0);
        setPinSource('device');
        setLocating(false);
      },
      () => {
        setErr('The device location was not available. Allow location access or enter it manually.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };

  const file = async () => {
    if (!schema || !label.trim() || busy) return;
    setErr('');
    const latitude = lat.trim() ? Number(lat) : 0;
    const longitude = lon.trim() ? Number(lon) : 0;
    const costAmount = Number(amount || 0);
    const hasPoint = !!(lat.trim() && lon.trim());
    if ((lat.trim() && !lon.trim()) || (!lat.trim() && lon.trim())
        || (lat.trim() && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90))
        || (lon.trim() && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
      setErr('Enter both latitude and longitude using valid coordinates.');
      return;
    }
    if (hasPoint && latitude === 0 && longitude === 0) {
      setErr('The location 0, 0 is not a usable land pin.');
      return;
    }
    if (receipt && receipt.size > MAX_UPLOAD_BYTES) {
      setErr(`${receipt.name} is ${mb(receipt.size)}. The limit is ${mb(MAX_UPLOAD_BYTES)}.`);
      return;
    }
    if (addCost && (!Number.isFinite(costAmount) || costAmount < 0)) {
      setErr('Enter a valid cost amount.');
      return;
    }
    if (addCost && (!(costAmount > 0) && !receipt && !uploaded)) {
      setErr('Enter a cost amount or attach the receipt before saving this cost.');
      return;
    }
    try {
      let stored = uploaded;
      if (addCost && receipt && !stored) {
        stored = await uploadToDrive(receipt);
        setUploaded(stored);
      }
      const geometry = hasPoint ? JSON.stringify({
        type: 'Point', coordinates: [longitude, latitude], source: pinSource || 'manual',
        ...(accuracy > 0 ? { accuracyM: accuracy } : {}),
      }) : '{}';
      const cost = {
        purchaseKind: addCost ? costKind : '',
        purchaseTitle: addCost ? costTitle.trim() : '',
        purchaseAmount: addCost ? costAmount : 0,
        purchasedOn: addCost ? purchasedOn : '',
        vendor: addCost ? vendor.trim() : '',
        invoiceNo: addCost ? invoiceNo.trim() : '',
        warrantyUntil: addCost ? warrantyUntil : '',
        receiptFileRef: addCost ? stored?.id || '' : '',
        receiptFileName: addCost ? stored?.name || '' : '',
        receiptMimeType: addCost ? stored?.mimeType || '' : '',
        receiptSizeBytes: addCost ? stored?.sizeBytes || 0 : 0,
      };
      let id = feature?.id || '';
      if (!feature) {
        const res = await addFeature.mutateAsync({
          recordId, label: label.trim(), typeKey: schema.key,
          schemaVersion: schema.schemaVersion, attributes: JSON.stringify(attributes), geometry,
          pinLabel: hasPoint ? (pinSource === 'device' ? 'Device location' : 'Entered location') : '',
          condition: condition.trim(), conditionState: state, note: note.trim(), ...cost,
        });
        id = res.web.addFeature;
        if (!id) {
          setErr('The feature details were not accepted. Check the values and try again.');
          return;
        }
      } else {
        const res = await editFeature.mutateAsync({
          featureId: feature.id, label: label.trim(), typeKey: schema.key,
          schemaVersion: schema.schemaVersion, attributes: JSON.stringify(attributes), geometry,
          pinLabel: hasPoint ? (pinSource === 'device' ? 'Device location' : 'Entered location') : '',
          condition: condition.trim(), conditionState: state, note: note.trim(),
          expectedVersion: version,
        });
        if (!res.web.updateFeature) {
          setErr('This feature changed elsewhere or the values were not accepted. Reload and try again.');
          return;
        }
        setVersion((current) => current + 1);
        if (addCost) {
          const saved = await saveCost.mutateAsync({
            featureId: feature.id, title: costTitle.trim(), amount: costAmount,
            purchasedOn, kind: costKind, vendor: vendor.trim(), invoiceNo: invoiceNo.trim(),
            warrantyUntil, receiptFileRef: stored?.id || '', receiptFileName: stored?.name || '',
            receiptMimeType: stored?.mimeType || '', receiptSizeBytes: stored?.sizeBytes || 0,
          });
          if (!saved.web.saveFeatureCost) {
            setErr('The feature was updated, but its cost was not recorded. Check the amount or receipt.');
            return;
          }
        }
      }
      onSaved(id);
      onClose();
    } catch {
      setErr('That feature did not save. What you entered is still here; try again.');
    }
  };

  return (
    <Drawer
      eyebrow={drawerEyebrow(recordTitle, 'Features')}
      title={feature ? `Edit ${feature.label}` : 'Add a feature'}
      sub="Keep its details, exact pin, receipts and repair history together."
      onClose={onClose}
      onSubmit={() => void file()}
      busy={busy}
      dirty={dirty}
      discardCopy={{
        title: feature ? 'Discard these changes?' : 'Discard this feature?',
        body: 'Closing this panel loses the details entered here.',
      }}
      // The type chips, because picking one is the first thing to do and
      // nothing is picked for you. Not the Close button, which is what the
      // first-focusable fallback would land on.
      initialFocus="#fa-kinds button"
      returnFocus={returnFocus}
      primary={(
        <DrawerAction
          label={feature ? 'Save changes' : 'Add the feature'}
          working="Saving…"
          pending={busy}
          paused={addFeature.isPaused || editFeature.isPaused || saveCost.isPaused}
          disabled={!schema || !label.trim()}
        />
      )}
    >
      <div className="field">
        <label>What it is</label>
        <div className="row tight" id="fa-kinds">
          {types.map((item) => (
            <Chip key={item.key} active={typeKey === item.key} onClick={() => chooseType(item)}>
              {item.label}
            </Chip>
          ))}
        </div>
      </div>

      {schema && (
        <div className="field">
          <label htmlFor="fa-name">Name on this record</label>
          <input id="fa-name" type="text" value={label} placeholder={schema.label}
                 onChange={(e) => setLabel(e.target.value)} />
        </div>
      )}

      {schema?.fields.filter((field) => fieldIsVisible(field, attributes)).map((field) => (
        <div className="field" key={field.key}>
          {field.kind === 'boolean' ? (
            <label className="check" htmlFor={`fa-${field.key}`}>
              <input id={`fa-${field.key}`} type="checkbox"
                     checked={attributes[field.key] === true}
                     onChange={(e) => setAttribute(field.key, e.target.checked)} />
              <span>{field.label}</span>
            </label>
          ) : (
            <>
              <label htmlFor={`fa-${field.key}`}>
                {field.label}{field.unit ? ` (${field.unit})` : ''}
              </label>
              {field.kind === 'select' ? (
                <select id={`fa-${field.key}`} value={String(attributes[field.key] ?? '')}
                        onChange={(e) => setAttribute(field.key, e.target.value)}>
                  <option value="">Not specified</option>
                  {field.options.map((option) => <option key={option}>{option}</option>)}
                </select>
              ) : (
                <input id={`fa-${field.key}`} type={field.kind} min={field.kind === 'number' ? 0 : undefined}
                       value={String(attributes[field.key] ?? '')} placeholder={field.placeholder}
                       onChange={(e) => setAttribute(field.key, e.target.value)} />
              )}
            </>
          )}
        </div>
      ))}

      {schema && (
        <div className="card" style={{ display: 'grid', gap: 'var(--space-sm)' }}>
          <h3>Location</h3>
          <div className="two">
            <div className="field">
              <label htmlFor="fa-lat">Latitude</label>
              <input id="fa-lat" inputMode="decimal" value={lat}
                     onChange={(e) => { setLat(e.target.value); setPinSource('manual'); }} />
            </div>
            <div className="field">
              <label htmlFor="fa-lon">Longitude</label>
              <input id="fa-lon" inputMode="decimal" value={lon}
                     onChange={(e) => { setLon(e.target.value); setPinSource('manual'); }} />
            </div>
          </div>
          <div className="row tight">
            <button type="button" className="btn sm" onClick={locate} disabled={locating}>
              <MyLocationOutlined sx={{ fontSize: 15 }} />
              {locating ? 'Finding location…' : 'Use current location'}
            </button>
            {(lat || lon) && (
              <button type="button" className="btn sm" onClick={() => {
                setLat(''); setLon(''); setPinSource(''); setAccuracy(0);
              }}>Clear pin</button>
            )}
          </div>
          {accuracy > 0 && <span className="note">Device accuracy: about {Math.round(accuracy)} m</span>}
        </div>
      )}

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

      {schema && (
        <div className="card" style={{ display: 'grid', gap: 'var(--space-sm)' }}>
          <label className="check" htmlFor="fa-cost">
            <input id="fa-cost" type="checkbox" checked={addCost}
                   onChange={(e) => setAddCost(e.target.checked)} />
            <span>Add a purchase, service cost or receipt</span>
          </label>
          {addCost && (
            <>
              <div className="two">
                <div className="field">
                  <label htmlFor="fa-cost-kind">Cost type</label>
                  <select id="fa-cost-kind" value={costKind} onChange={(e) => setCostKind(e.target.value)}>
                    <option value="capital">Purchase or installation</option>
                    <option value="running">Service or repair</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="fa-amount">Amount (₹)</label>
                  <input id="fa-amount" type="number" min="0" step="0.01" value={amount}
                         onChange={(e) => setAmount(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="fa-cost-title">What was purchased or serviced</label>
                <input id="fa-cost-title" value={costTitle} placeholder={`${label || schema.label} purchase`}
                       onChange={(e) => setCostTitle(e.target.value)} />
              </div>
              <div className="two">
                <div className="field">
                  <label htmlFor="fa-vendor">Shop or company</label>
                  <input id="fa-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="fa-invoice">Invoice number</label>
                  <input id="fa-invoice" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
                </div>
              </div>
              <div className="two">
                <div className="field">
                  <label htmlFor="fa-purchased">Purchased or serviced on</label>
                  <input id="fa-purchased" type="date" value={purchasedOn}
                         onChange={(e) => setPurchasedOn(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="fa-warranty">Warranty until</label>
                  <input id="fa-warranty" type="date" value={warrantyUntil}
                         onChange={(e) => setWarrantyUntil(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="fa-receipt">Receipt</label>
                <input id="fa-receipt" type="file" accept="image/*,application/pdf"
                       onChange={(e) => { setReceipt(e.target.files?.[0] || null); setUploaded(null); }} />
                <span className="note">
                  {receipt ? `${receipt.name} · ${mb(receipt.size)}` : `Photo or PDF, up to ${mb(MAX_UPLOAD_BYTES)}`}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      <div className="field">
        <label htmlFor="fa-note">Note</label>
        <textarea id="fa-note" rows={3} value={note}
                  placeholder="What a visitor should know."
                  onChange={(e) => setNote(e.target.value)} />
      </div>

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
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Feature | null>(null);
  const [confirmId, setConfirmId] = useState('');
  const {
    data: orders, isPending: ordersPending, error: ordersError, refetch: refetchOrders,
  } = useOrders(rec.id);
  const editTriggers = useRef(new Map<string, HTMLButtonElement>());
  const editReturnFocus = useRef<HTMLButtonElement>(null);
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
          types={data?.types ?? []}
          returnFocus={addTrigger}
          onSaved={filed}
          onClose={() => setAdding(false)}
        />
      )}

      {editing && (
        <FeatureDrawer
          recordId={rec.id}
          recordTitle={rec.title}
          types={data?.types ?? []}
          feature={editing}
          returnFocus={editReturnFocus}
          onSaved={(id) => { filed(id); setEditing(null); }}
          onClose={() => setEditing(null)}
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

                    {f.costCount > 0 && (
                      <Link to={`/app/records/${rec.id}/expenses`}
                            className="note row tight accent" style={{ textDecoration: 'none' }}>
                        <ReceiptLongOutlined sx={{ fontSize: 14 }} aria-hidden />
                        {inr(f.costTotal)} · {plural(f.costCount, 'cost')}
                        {f.receiptCount > 0 && ` · ${plural(f.receiptCount, 'receipt')}`}
                      </Link>
                    )}

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
                                  onClick={(event) => {
                                    editReturnFocus.current = event.currentTarget;
                                    setConfirmId('');
                                    setEditing(f);
                                  }}
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
