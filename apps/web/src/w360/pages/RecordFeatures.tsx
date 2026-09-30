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
import { useMemo, useRef, useState } from 'react';
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
  useServicesOffered, useUpdateFeature,
} from '../api';
import type { FacetFilterGroup } from '../ui';
import {
  Card, Chip, Empty, FacetFilter, Failed, Icon, KV, Loading, State, ddmmyyyy, inr, plural,
} from '../ui';
import { Drawer, DrawerAction, drawerEyebrow } from '../Drawer';
import { useRecordCtx } from './Record';
import { SectionHead } from './RecordHead';
import { ConfirmDialog } from './PropertyActions';
import { MAX_UPLOAD_BYTES, mb } from '../filePhotos';
import { uploadToDrive } from '../../pages/documents/storage';

/** The four things a feature's condition can be, in the owner's words rather
 *  than the database's — one word each, everywhere on this tab: the drawer's
 *  chips, the card, the filter and the rail. ("Needs repair" was a second word
 *  for Broken.) "Not checked" is the one that matters: it is what a feature is
 *  until somebody has stood next to it, and "check" on this tab only ever
 *  means that — a look at the thing on the ground. The paid visit is called
 *  what the catalogue calls it, a site visit. */
const STATES: { key: string; label: string }[] = [
  { key: 'good', label: 'Working' },
  { key: 'warn', label: 'Watch it' },
  { key: 'bad', label: 'Broken' },
  { key: 'unknown', label: 'Not checked' },
];

/** A feature's condition key; an empty one is a feature nobody has looked at. */
const stateOf = (f: Feature) => f.conditionState || 'unknown';
const stateWord = (key: string) => STATES.find((s) => s.key === (key || 'unknown'))?.label ?? 'Not checked';

/** The filter's two groups. The API's category facet also carries "All",
 *  "Needs repair" and "Not checked" — condition keys dressed as categories, in
 *  one single-select row, so a category and a condition could not be
 *  combined. Condition is its own group now, in STATES' words. */
const CONDITION_FACETS = new Set(['all', 'needs_repair', 'unchecked']);

/** `coords` is a value that is wrong; `location` is the device refusing to
 *  say where it is. Both print under the Location card, and only the first
 *  marks the two boxes invalid. */
type FieldKey = 'type' | 'name' | 'coords' | 'location' | 'amount' | 'receipt';

/** A field's own message, under it, and linked to it by id. */
function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null;
  return (
    <p className="note" id={id} role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>
      {children}
    </p>
  );
}

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
 *  that answers it; the rest are dropped. RecordPeople.destOf does the same
 *  for `actions` on a person.
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
  // agreement, the right of way. Each is a document filed on this record, and
  // Documents is the record's own index tab.
  if (/^papers\b/i.test(label) || label === 'Lease' || label === 'Deed clause') {
    return `/app/records/${recordId}`;
  }
  // "Update" and "Update count" are the pencil on this card. "Fix it", "Order
  // fencing" and "Order clearing" are work Pattadar does not book — the
  // catalogue sells records, surveys, opinions and site visits, nothing that
  // mends a fence — so they draw nothing.
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
  /** The server's answer, for the whole form: a refusal is not about one box. */
  const [err, setErr] = useState('');
  /** Every reason that IS about one box prints under that box. They used to
   *  share the one alert line after Note, so "Enter both latitude and
   *  longitude" appeared a screen away from the coordinates it was about. */
  const [fieldErr, setFieldErr] = useState<Partial<Record<FieldKey, string>>>({});
  const flag = (key: FieldKey, msg: string, focus: string) => {
    setFieldErr({ [key]: msg });
    requestAnimationFrame(() => document.querySelector<HTMLElement>(focus)?.focus());
  };
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
      setFieldErr({ location: 'This browser cannot read the device location. Enter the coordinates instead.' });
      return;
    }
    setLocating(true);
    setFieldErr((have) => ({ ...have, location: undefined }));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude.toFixed(6));
        setLon(position.coords.longitude.toFixed(6));
        setAccuracy(position.coords.accuracy || 0);
        setPinSource('device');
        setLocating(false);
      },
      () => {
        setFieldErr({ location: 'The device location was not available. Allow location access or enter it manually.' });
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };

  const file = async () => {
    if (busy) return;
    setErr('');
    setFieldErr({});
    // The primary is never greyed for want of a type or a name: pressing it
    // answers the question under the control that settles it, and puts the
    // focus there, instead of leaving a dead button to work out.
    if (!schema) {
      flag('type', 'Choose what it is first.', '#fa-kinds button');
      return;
    }
    if (!label.trim()) {
      flag('name', 'Give it a name on this property.', '#fa-name');
      return;
    }
    const latitude = lat.trim() ? Number(lat) : 0;
    const longitude = lon.trim() ? Number(lon) : 0;
    const costAmount = Number(amount || 0);
    const hasPoint = !!(lat.trim() && lon.trim());
    if ((lat.trim() && !lon.trim()) || (!lat.trim() && lon.trim())
        || (lat.trim() && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90))
        || (lon.trim() && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
      flag('coords', 'Enter both latitude and longitude using valid coordinates.', '#fa-lat');
      return;
    }
    if (hasPoint && latitude === 0 && longitude === 0) {
      flag('coords', 'The location 0, 0 is not a usable land pin.', '#fa-lat');
      return;
    }
    if (receipt && receipt.size > MAX_UPLOAD_BYTES) {
      flag('receipt', `${receipt.name} is ${mb(receipt.size)}. The limit is ${mb(MAX_UPLOAD_BYTES)}.`, '#fa-receipt');
      return;
    }
    if (addCost && (!Number.isFinite(costAmount) || costAmount < 0)) {
      flag('amount', 'Enter a valid cost amount.', '#fa-amount');
      return;
    }
    if (addCost && (!(costAmount > 0) && !receipt && !uploaded)) {
      flag('amount', 'Enter a cost amount or attach the receipt before saving this cost.', '#fa-amount');
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
      setErr('That feature did not save. Try again.');
    }
  };

  return (
    <Drawer
      eyebrow={drawerEyebrow(recordTitle, 'Site features')}
      title={feature ? `Edit ${feature.label}` : 'Add a feature'}
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
      // Enabled from the start: a missing type or name is answered under its
      // own control when this is pressed (see `file`), never by a greyed
      // button with no reason beside it.
      primary={(
        <DrawerAction
          label={feature ? 'Save changes' : 'Add the feature'}
          working="Saving…"
          pending={busy}
          paused={addFeature.isPaused || editFeature.isPaused || saveCost.isPaused}
        />
      )}
    >
      {/* Chosen chips wash rather than fill: a choice is not an action, and
          the drawer's one amber fill is the button that saves. */}
      <div className="field">
        <label id="fa-kinds-l">What it is</label>
        <div className="row tight" id="fa-kinds" role="group" aria-labelledby="fa-kinds-l"
             aria-describedby={fieldErr.type ? 'fa-kinds-err' : undefined}>
          {types.map((item) => (
            <Chip key={item.key} wash active={typeKey === item.key}
                  onClick={() => { chooseType(item); setFieldErr((have) => ({ ...have, type: undefined })); }}>
              {item.label}
            </Chip>
          ))}
        </div>
        <FieldError id="fa-kinds-err">{fieldErr.type}</FieldError>
      </div>

      {schema && (
        <div className="field">
          <label htmlFor="fa-name">Name on this property</label>
          <input id="fa-name" type="text" value={label} placeholder={schema.label}
                 aria-invalid={fieldErr.name ? true : undefined}
                 aria-describedby={fieldErr.name ? 'fa-name-err' : undefined}
                 onChange={(e) => setLabel(e.target.value)} />
          <FieldError id="fa-name-err">{fieldErr.name}</FieldError>
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
                     aria-invalid={fieldErr.coords ? true : undefined}
                     aria-describedby={fieldErr.coords || fieldErr.location ? 'fa-loc-err' : undefined}
                     onChange={(e) => { setLat(e.target.value); setPinSource('manual'); }} />
            </div>
            <div className="field">
              <label htmlFor="fa-lon">Longitude</label>
              <input id="fa-lon" inputMode="decimal" value={lon}
                     aria-invalid={fieldErr.coords ? true : undefined}
                     aria-describedby={fieldErr.coords || fieldErr.location ? 'fa-loc-err' : undefined}
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
                setFieldErr((have) => ({ ...have, coords: undefined, location: undefined }));
              }}>Clear pin</button>
            )}
          </div>
          {accuracy > 0 && <span className="note">Device accuracy: about {Math.round(accuracy)} m</span>}
          <FieldError id="fa-loc-err">{fieldErr.coords || fieldErr.location}</FieldError>
        </div>
      )}

      {/* One input for the condition: the four chips, in the same four words
          the card, the filter and the rail use. The typed box used to be a
          second one — the card printed "Needs repair" from it while the rail
          counted the chip's "Watch it" — so what is typed is now only the
          detail under the chip's word. "Not checked" is pre-selected and says
          so: a feature nobody has looked at must not start life with a green
          dot beside it. */}
      <div className="field">
        <label id="fa-state-l">Condition</label>
        <span className="row tight" role="group" aria-labelledby="fa-state-l">
          {STATES.map((s) => (
            <Chip key={s.key} wash active={state === s.key}
                  tone={s.key === 'bad' ? 'alert' : undefined}
                  onClick={() => setState(s.key)}>
              {s.label}
            </Chip>
          ))}
        </span>
      </div>
      <div className="field">
        <label htmlFor="fa-cond">Condition detail</label>
        <input id="fa-cond" type="text" value={condition}
               placeholder="Yield dropped · Locked"
               onChange={(e) => setCondition(e.target.value)} />
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
                         aria-invalid={fieldErr.amount ? true : undefined}
                         aria-describedby={fieldErr.amount ? 'fa-amount-err' : undefined}
                         onChange={(e) => setAmount(e.target.value)} />
                  <FieldError id="fa-amount-err">{fieldErr.amount}</FieldError>
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
                       aria-invalid={fieldErr.receipt ? true : undefined}
                       aria-describedby={fieldErr.receipt ? 'fa-receipt-err' : undefined}
                       onChange={(e) => {
                         setReceipt(e.target.files?.[0] || null);
                         setUploaded(null);
                         setFieldErr((have) => ({ ...have, receipt: undefined }));
                       }} />
                <span className="note">
                  {receipt ? `${receipt.name} · ${mb(receipt.size)}` : `Photo or PDF, up to ${mb(MAX_UPLOAD_BYTES)}`}
                </span>
                <FieldError id="fa-receipt-err">{fieldErr.receipt}</FieldError>
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

type FeatureFilters = { category: string[]; condition: string[] };
const noFilters = (): FeatureFilters => ({ category: [], condition: [] });

export function RecordFeatures() {
  const rec = useRecordCtx();
  const { data, isLoading, error, refetch } = useFeatures(rec.id);
  const [sel, setSel] = useState<FeatureFilters>(noFilters);
  const delFeature = useDeleteFeature();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Feature | null>(null);
  const [confirmId, setConfirmId] = useState('');
  const {
    data: orders, isPending: ordersPending, error: ordersError, refetch: refetchOrders,
  } = useOrders(rec.id);
  // The visit's price is the catalogue's, not a number typed into this file:
  // the same query (and cache entry) the Documents tab reads its prices from.
  const offers = useServicesOffered('', '', true, rec.id);
  const visitPrice = offers.data?.find((o) => o.key === 'site_visit')?.price ?? 0;
  const editTriggers = useRef(new Map<string, HTMLButtonElement>());
  const editReturnFocus = useRef<HTMLButtonElement>(null);
  const removeTriggers = useRef(new Map<string, HTMLButtonElement>());
  const addTrigger = useRef<HTMLButtonElement>(null);
  // One highlight, addressed by a feature's id: the card the drawer just filed.
  const [flash, setFlash] = useState('');
  // A refused write does not throw — this API answers a refusal with a falsy
  // value — so the delete's reason is kept here and printed inside the
  // confirmation that asked for it, which holds open until the answer comes.
  // Filing's own reasons live in the drawer, under their fields.
  const [delErr, setDelErr] = useState('');

  const restoreRowFocus = (buttons: Map<string, HTMLButtonElement>, id: string) => {
    requestAnimationFrame(() => buttons.get(id)?.focus());
  };

  /** Ring the card the drawer just filed. The grid is sorted worst-condition
   *  first, so a new feature does not necessarily land at the end of it — this
   *  is what says which one is yours. Dropping the filters first, because a
   *  feature filed while a filter is on may not be in the filtered set at all,
   *  and a flash on a card nobody can see says nothing. */
  const filed = (id: string) => {
    setSel(noFilters());
    setFlash(id);
    window.setTimeout(() => setFlash((f) => (f === id ? '' : f)), 1600);
  };

  const confirmFeature = data?.features.find((f) => f.id === confirmId);
  const closeRemove = () => {
    const id = confirmId;
    setDelErr('');
    setConfirmId('');
    restoreRowFocus(removeTriggers.current, id);
  };

  /** Remove a feature, with the confirmation held open until it is gone.
   *
   *  Closing it first was worse than saying nothing: the card stayed exactly
   *  where it was and there was no longer a control to press — which reads as
   *  "Remove does not work". */
  const remove = async (id: string) => {
    setDelErr('');
    try {
      const res = await delFeature.mutateAsync({ featureId: id });
      if (!res.web.deleteFeature) {
        setDelErr('That feature could not be removed. Reload the page and try again.');
        return;
      }
      setConfirmId('');
      // The card that held the pressed control is gone, so focus goes to the
      // one control on this screen that is always there.
      requestAnimationFrame(() => addTrigger.current?.focus());
    } catch {
      setDelErr('That feature could not be removed. It is still filed here.');
    }
  };

  /** Where "Ask for a site visit" goes: into the order flow, at its first
   *  step, carrying the two things this screen already knows.
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

  const features = useMemo(() => data?.features ?? [], [data]);
  // The two filter groups, counted off the features themselves so an option
  // can never promise more cards than it shows. The category words are the
  // API's; the condition words are STATES'. An option with nothing in it is a
  // filter that leads nowhere, so none is drawn.
  const groups = useMemo<FacetFilterGroup[]>(() => {
    const catLabel = new Map((data?.categories ?? [])
      .filter((c) => !CONDITION_FACETS.has(c.key)).map((c) => [c.key, c.label]));
    const count = (keyOf: (f: Feature) => string) => {
      const n = new Map<string, number>();
      features.forEach((f) => n.set(keyOf(f), (n.get(keyOf(f)) ?? 0) + 1));
      return n;
    };
    const byCat = count((f) => f.category);
    const byState = count(stateOf);
    return [
      {
        key: 'category', label: 'Category',
        options: [...byCat].map(([key, c]) => ({
          key, count: c, label: catLabel.get(key) ?? key.replace(/^./, (x) => x.toUpperCase()),
        })),
      },
      {
        key: 'condition', label: 'Condition',
        options: STATES.filter((s) => byState.has(s.key))
          .map((s) => ({ key: s.key, label: s.label, count: byState.get(s.key) ?? 0 })),
      },
    ];
  }, [data, features]);
  // A selection the data no longer offers is not a filter: fix the last
  // broken feature and "Broken" leaves the options, so it leaves the
  // selection too, rather than emptying the grid with nothing to un-press.
  const offered = (group: keyof FeatureFilters, key: string) =>
    groups.find((g) => g.key === group)?.options.some((o) => o.key === key) ?? false;
  const active: FeatureFilters = {
    category: sel.category.filter((k) => offered('category', k)),
    condition: sel.condition.filter((k) => offered('condition', k)),
  };
  const narrowed = active.category.length > 0 || active.condition.length > 0;
  const toggle = (group: string, key: string) => {
    const g = group as keyof FeatureFilters;
    setSel((have) => ({
      ...have,
      [g]: have[g].includes(key) ? have[g].filter((k) => k !== key) : [...have[g], key],
    }));
  };

  const shown = features.filter((f) => (
    (active.category.length === 0 || active.category.includes(f.category))
    && (active.condition.length === 0 || active.condition.includes(stateOf(f)))));

  // Each fact once. The sub is the total; the condition counts and the date
  // somebody was last on the ground are the rail's Condition card, and the
  // filter's options carry their own counts. (It used to say the total, the
  // broken count, the not-checked count and the walk date here as well, so
  // one tab told the same three facts two and three times.) The order —
  // worst condition first — is what the grid is, and is said at the top of
  // this file rather than on screen.
  //
  // A feature with no coordinates cannot be walked to, and one with no photo
  // cannot be looked at from a desk. Counted off the features rather than the
  // record: the parcel having a pin says nothing about where the bore is.
  const unpinned = features.filter((f) => !f.lat && !f.lon).length;
  const unphotographed = features.filter((f) => f.photoCount === 0).length;
  const featuresSub = data && plural(data.total, 'site feature');
  const hasRail = !!data && features.length > 0;

  return (
    <>
      <SectionHead
        title="Site features"
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
              has failed, the sentence under this header says so.

              Named for the catalogue's service, a site visit, with the
              catalogue's price once it has loaded: "check" on this tab is the
              look somebody takes at a feature, not a thing you buy. */}
          {checkOrdered ? (
            <Link className="btn" to={`/app/records/${rec.id}/services`}>
              <ChecklistOutlined sx={{ fontSize: 16 }} /> Open the site visit order
            </Link>
          ) : ordersUnknown ? (
            <button type="button" className="btn" disabled>
              <ChecklistOutlined sx={{ fontSize: 16 }} />
              {ordersPending ? 'Looking up your orders…'
                : `Ask for a site visit${visitPrice ? ` · ${inr(visitPrice)}` : ''}`}
            </button>
          ) : (
            <Link className="btn" to={orderCheck}>
              <ChecklistOutlined sx={{ fontSize: 16 }} /> Ask for a site visit
              {visitPrice > 0 && <> · {inr(visitPrice)}</>}
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

      {confirmFeature && (
        <ConfirmDialog
          title={`Remove ${confirmFeature.label}?`}
          // What delete_feature actually does (web360.py): the feature row is
          // deleted; photos keep their feature_id and costs stay in the ledger.
          body={'Its details, condition and pin are deleted and cannot be brought back.'
            + ' Photos of it stay in Media, and its costs stay in Money.'}
          actionLabel="Remove"
          danger
          busy={delFeature.isPending}
          error={delErr}
          onConfirm={() => void remove(confirmFeature.id)}
          onClose={closeRemove}
        />
      )}

      {/* No rail while there is nothing for it to count — empty, loading or
          failed — so the one column is the whole width instead of a blank
          22rem gutter beside it. */}
      <div className={`split${hasRail ? '' : ' no-rail'}`}>
        <div>
          {ordersError && !orders && (
            <p className="note" role="alert"
               style={{ color: 'var(--w-danger)', marginTop: 'var(--space-sm)' }}>
              {/* Says why "Ask for a site visit" is greyed: without the orders
                  there is no telling whether one is already running, and a
                  second visit costs money. */}
              Your existing orders did not load, so a site visit cannot be ordered yet.
              {' '}<button type="button" className="linkbtn" onClick={() => void refetchOrders()}>Try again</button>
            </p>
          )}

          {/* The one filter surface list pages share, with the categories and
              the conditions as two groups that combine, washed rather than
              filled, and a tally only while it is narrowing. */}
          {data && features.length > 0 && (
            <FacetFilter
              groups={groups}
              selected={active}
              onToggle={toggle}
              onClear={() => setSel(noFilters())}
              tally={narrowed ? `${shown.length} of ${features.length} shown` : undefined}
              ariaLabel="Filter site features"
            />
          )}

          {/* One of four, never two at once. Filing against a record that
              would not load is not a safe offer, so a failed read draws no way
              in; and a record with nothing on it says so in a sentence, with
              no second "Add a feature" (the header's is the one flow). */}
          {isLoading ? (
            <Loading h="20rem" what="site features" />
          ) : failed ? (
            <Failed what="Site features" error={error} boxed h="20rem"
                    onRetry={() => void refetch()} />
          ) : features.length === 0 ? (
            <Empty boxed h="16rem" icon="feature" title="No site features recorded yet" />
          ) : shown.length === 0 ? (
            <Empty boxed h="12rem" icon="search" title="No site features match these filters" />
          ) : (
          /* Two across beside the rail at 1512, one on a phone. A feature card
             carries a spec line, a condition, a note, coordinates and two
             actions — squeezed narrower than 21rem, every one of those wraps. */
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
                        green one says something false. The word is always the
                        chip's (STATES), so the card, the filter and the rail
                        count the same thing; what was typed is its detail. */}
                    <State state={stateOf(f)}>{stateWord(stateOf(f))}</State>
                    {f.condition && f.condition !== stateWord(stateOf(f)) && (
                      <p className="note" style={{ margin: 0 }}>{f.condition}</p>
                    )}
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
                          reason lived in a title attribute no browser renders. */}
                      {f.actions.map((a) => {
                        const to = destOf(a, rec.id, f);
                        return to ? <Link key={a} className="btn sm" to={to}>{a}</Link> : null;
                      })}
                      <span className="grow" />
                      {/* Edit in place, and remove behind the shared confirmation
                          naming the feature — a feature is what a photo and a
                          repair history hang off, so one stray click should not
                          take it. No inline border/background on these: the
                          module's .iconbtn already draws none, and the inline
                          override was what cancelled its hover wash. */}
                      <button ref={(node) => { if (node) editTriggers.current.set(f.id, node); }}
                              type="button" className="iconbtn" aria-label={`Edit ${f.label}`}
                              onClick={(event) => {
                                editReturnFocus.current = event.currentTarget;
                                setConfirmId('');
                                setEditing(f);
                              }}>
                        <EditOutlined sx={{ fontSize: 16 }} />
                      </button>
                      <button ref={(node) => { if (node) removeTriggers.current.set(f.id, node); }}
                              type="button" className="iconbtn" aria-label={`Remove ${f.label}`}
                              aria-haspopup="dialog"
                              onClick={() => { setDelErr(''); setConfirmId(f.id); }}>
                        <DeleteOutlineOutlined sx={{ fontSize: 16 }} />
                      </button>
                    </div>
                </>
              </article>
            ))}

            {/* No dashed "Add a feature" card at the end of the grid any more:
                the section head already opens the same drawer, and one flow
                belongs on the screen once (design-system-governance, step 4). */}
          </div>
          </>
          )}
        </div>

        <aside className="stack">
          {/* What state the land is in, counted off the features themselves.
              A record can hold twelve features and still be unknown ground:
              the condition on a card is somebody's last look at it, and
              "Not checked" is the row that says how much of this is memory. */}
          {hasRail && (
            <Card title="Condition" className="railcard">
              <KV rows={STATES.map((s) => ({
                k: s.label,
                v: (
                  <span className="num">
                    {features.filter((f) => stateOf(f) === s.key).length}
                  </span>
                ),
              }))} />
              {/* Named as a date rather than a count, because the question an
                  owner is really asking is how old the answer above is. The
                  one place the date is said. */}
              <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
                {data.walkedOn
                  ? `Last checked on the ground ${ddmmyyyy(data.walkedOn)}`
                    + `${data.walkedBy ? ` by ${data.walkedBy}` : ''}.`
                  : 'Not checked on the ground yet.'}
              </p>
            </Card>
          )}

          {/* The two things that turn a condition from a claim into something a
              stranger can verify. Both are counts out of the same total, so the
              card says how far off the record is rather than only that it is.
              No buttons: a feature's pin is set in its own Edit drawer, and
              the tab strip already reaches Location and Media. */}
          {hasRail && (unpinned > 0 || unphotographed > 0) && (
            <Card title="Missing details" className="railcard">
              <ul className="railnotes">
                {unpinned > 0 && (
                  <li>{features.length - unpinned} of {plural(features.length, 'site feature')} pinned</li>
                )}
                {unphotographed > 0 && (
                  <li>
                    {features.length - unphotographed} of {plural(features.length, 'site feature')} photographed
                  </li>
                )}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
