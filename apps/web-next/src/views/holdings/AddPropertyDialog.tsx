'use client';

/**
 * Add-Property flow — functional port of the rhub pattadar app's
 * AddPropertyModal. Drop up to 5 deeds/allotment letters (or enter manually);
 * each file is mirrored to My Drive then read by
 * POST /api/gateway/pattadar/extract-property. Agricultural deeds are routed
 * to the parcel register (createRegisteredDocument → createParcelFromDocument
 * when exactly one passbook matches); everything else prefills the
 * type-adaptive property form. Saving creates the property and attaches the
 * mirrored document.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import Alert from '@mui/material/Alert';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import { apiFetch, gql } from '../../api/client';
import { CREATE_DOCUMENT_MUT, CREATE_PROPERTY_MUT, mirrorToDrive } from '../../data/pattadarActions';
import { PROPERTY_TYPES, attributeFieldsFor, classifierToType, propertyTypeDef } from './propertyTypes';
import { mapExtractionToForm, matchPassbook } from './propertyImport';
import type { PropertyFormValues } from './propertyImport';

type DraftStatus = 'reading' | 'ready' | 'manual' | 'error' | 'saving' | 'saved' | 'failed';

interface Draft {
  id: string;
  fileName: string;
  status: DraftStatus;
  fileRef: string;
  extracted: any;
  values: PropertyFormValues;
  agricultural?: boolean;
  error?: string;
  reason?: string;
}

// Rotating copy for the "reading" spinner — land-deed-specific (verbatim).
const READING_MESSAGES = [
  'Reading your document…',
  'Finding the plot number and extent…',
  'Opening the schedule — this is where the boundaries live…',
  'Measuring the four boundaries…',
  'Working out the plot dimensions…',
  'Identifying the buyer and seller…',
  'Noting the SRO, document number and date…',
  'Cross-checking the area against the measurements…',
  'Almost there — putting it together…',
];

function useReadingMessage(active: boolean): string {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const t = setInterval(() => {
      setIndex((i) => {
        const next = Math.min(i + 1, READING_MESSAGES.length - 1);
        if (next === READING_MESSAGES.length - 1) clearInterval(t);
        return next;
      });
    }, 2800);
    return () => clearInterval(t);
  }, [active]);
  return READING_MESSAGES[index];
}

// Cap concurrent /extract-property calls (heavy vision-LLM requests) and drafts.
const EXTRACT_CONCURRENCY = 2;
const MAX_DRAFTS = 5;
async function runPool<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Attributes JSON from attr_ fields + boundaries + stamp_duty/registration_fee
 * /deed_type, areaBasis-gated land/builtup areas (verbatim from source).
 */
function buildPropertyVariables(vals: PropertyFormValues) {
  const attributes: Record<string, unknown> = {};
  for (const fld of attributeFieldsFor(vals.type)) {
    const v = vals[`attr_${fld.key}`];
    if (v !== undefined && v !== '') attributes[fld.key] = v;
  }
  const boundaries: Record<string, string> = {};
  for (const [k, fk] of [
    ['north', 'boundaryNorth'],
    ['south', 'boundarySouth'],
    ['east', 'boundaryEast'],
    ['west', 'boundaryWest'],
  ] as const) {
    if (vals[fk]) boundaries[k] = String(vals[fk]);
  }
  if (Object.keys(boundaries).length) attributes.boundaries = boundaries;
  if (Number(vals.stampDuty) > 0) attributes.stamp_duty = Number(vals.stampDuty);
  if (Number(vals.regFee) > 0) attributes.registration_fee = Number(vals.regFee);
  if (vals.deedType) attributes.deed_type = String(vals.deedType);
  const areaBasis = propertyTypeDef(vals.type).areaBasis;
  const landArea = areaBasis === 'land' || areaBasis === 'both' ? Number(vals.landArea) || 0 : 0;
  const builtupArea = areaBasis === 'builtup' || areaBasis === 'both' ? Number(vals.builtupArea) || 0 : 0;
  return {
    type: vals.type,
    label: vals.label,
    city: vals.city || '',
    district: vals.district || '',
    landArea,
    landUnit: vals.landUnit || 'Sq.yd',
    builtupArea,
    builtupUnit: vals.builtupUnit || 'Sq.ft',
    acquisitionMode: vals.acquisitionMode || 'purchase',
    attributes: JSON.stringify(attributes),
    purchasePrice: Number(vals.purchasePrice) || 0,
    purchaseDate: vals.purchaseDate || '',
    regDocNo: vals.regDocNo || '',
    sro: vals.sro || '',
    regDate: vals.regDate || '',
    sellerName: vals.sellerName || '',
    buyerName: vals.buyerName || '',
  };
}

const FORM_STATUSES = new Set<DraftStatus>(['ready', 'manual', 'error']);
const showsForm = (s?: DraftStatus) => !!s && FORM_STATUSES.has(s);

function DraftBadge({ d }: { d: Draft }) {
  if (d.status === 'reading')
    return (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        <CircularProgress size={11} /> Reading…
      </Typography>
    );
  if (d.status === 'saving') return <Chip size="small" label="Saving…" />;
  if (d.status === 'saved') return <Chip size="small" color="success" label="Saved" />;
  if (d.status === 'error' || d.status === 'failed') return <Chip size="small" color="error" label={d.error || 'Error'} />;
  if (d.status === 'manual') return <Chip size="small" label="Needs details" />;
  if (d.agricultural) return <Chip size="small" color="warning" label="Agricultural?" />;
  const c = d.extracted?.confidence;
  const color = c === 'high' ? 'success' : c === 'low' ? 'warning' : 'info';
  return <Chip size="small" color={color} label={c ? `${c} confidence` : 'Ready'} />;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  notify: (msg: string, severity?: 'success' | 'error' | 'warning' | 'info') => void;
}

export function AddPropertyDialog({ open, onClose, onCreated, notify }: Props) {
  const [step, setStep] = useState<'choose' | 'batch'>('choose');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [saving, setSaving] = useState(false);
  // Lone single file: stay on the compact "choose" spinner until its kind is
  // known, so a lone agricultural deed can auto-route without flashing the
  // wide batch UI.
  const [readingLone, setReadingLone] = useState(false);
  const uidRef = useRef(0);
  const draftsRef = useRef<Draft[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selected = drafts.find((d) => d.id === selectedId);
  const readingMessage = useReadingMessage(selected?.status === 'reading');
  const loneReadingMessage = useReadingMessage(readingLone);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const uid = () => `d${++uidRef.current}-${Date.now()}`;

  const reset = useCallback(() => {
    setDrafts([]);
    draftsRef.current = [];
    setSelectedId('');
    setStep('choose');
    setSaving(false);
    setReadingLone(false);
  }, []);
  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const patchDraft = useCallback((id: string, patch: Partial<Draft>) => {
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);
  const setVal = useCallback(
    (key: string, value: unknown) => {
      if (!selectedId) return;
      setDrafts((ds) =>
        ds.map((d) => (d.id === selectedId ? { ...d, values: { ...d.values, [key]: value } } : d)),
      );
    },
    [selectedId],
  );

  // Agricultural land: create the deed, try to create the parcel. (Detail
  // routes arrive in a later part — we land back on the Land Parcels tab.)
  const routeToParcel = useCallback(
    async (f: any) => {
      try {
        const did = (
          await gql<{ createRegisteredDocument: { id: string } | null }>(
            'mutation($fileRef:String!,$payload:String!){ createRegisteredDocument(fileRef:$fileRef,payload:$payload){ id } }',
            { fileRef: '', payload: JSON.stringify(f) },
          )
        )?.createRegisteredDocument?.id;
        if (!did) {
          notify("Couldn't file this agricultural document.", 'error');
          return;
        }
        const pbs =
          (await gql<{ passbooks: { id: string; ownerName?: string; village?: string }[] }>(
            'query { passbooks { id ownerName village } }',
          ))?.passbooks ?? [];
        const pbId = matchPassbook(f, pbs);
        if (pbId) {
          const par = (
            await gql<{ createParcelFromDocument: { id: string; ref: string } | null }>(
              'mutation($d:String!,$p:String!){ createParcelFromDocument(documentId:$d,passbookId:$p){ id ref } }',
              { d: did, p: pbId },
            )
          )?.createParcelFromDocument;
          if (par?.id) {
            notify('This is agricultural land — filed it as a parcel, not a property.', 'success');
            close();
            onCreated();
            return;
          }
        }
        notify(
          "This is agricultural land — saved as a registered deed; pick the owner's khata there to create the parcel.",
          'info',
        );
        close();
        onCreated();
      } catch {
        notify("Couldn't file this agricultural document.", 'error');
      }
    },
    [close, notify, onCreated],
  );

  // Read one file into its draft: mirror to My Drive + /extract-property.
  const extractOne = useCallback(
    async (file: File, draftId: string, lone: boolean) => {
      const fileRef = await mirrorToDrive(file);
      const applyDraft = (patch: Partial<Draft>) => {
        patchDraft(draftId, patch);
        setReadingLone(false);
        setStep('batch');
      };
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await apiFetch('/api/gateway/pattadar/extract-property', { method: 'POST', body: fd });
        if (!res.ok) {
          let reason = "Couldn't read this document — please fill in the details below.";
          try {
            const body = await res.json();
            if (body?.error) reason = body.error;
          } catch {
            /* keep fallback */
          }
          applyDraft({ status: 'error', reason, fileRef });
          return;
        }
        let f = (await res.json())?.fields || {};
        if (f.kind !== 'parcel' && f.kind !== 'property') {
          // Empty/unusable result can be a transient model hiccup — retry once.
          const fd2 = new FormData();
          fd2.append('file', file);
          const res2 = await apiFetch('/api/gateway/pattadar/extract-property', { method: 'POST', body: fd2 });
          f = res2.ok ? (await res2.json())?.fields || {} : {};
        }
        if (f.kind === 'parcel') {
          if (lone) {
            await routeToParcel(f); // lone agricultural deed → auto-route
            return;
          }
          applyDraft({ status: 'ready', agricultural: true, extracted: f, values: mapExtractionToForm(f), fileRef, reason: undefined });
          return;
        }
        if (f.kind === 'property') {
          applyDraft({ status: 'ready', extracted: f, values: mapExtractionToForm(f), fileRef, reason: undefined });
          return;
        }
        applyDraft({
          status: 'manual',
          reason: "Couldn't read this document confidently — please fill in the details below.",
          fileRef,
        });
      } catch {
        applyDraft({ status: 'manual', fileRef });
      }
    },
    [patchDraft, routeToParcel],
  );

  const handleFiles = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      const available = MAX_DRAFTS - draftsRef.current.length;
      if (available <= 0) {
        notify('You can add up to 5 documents at a time. Remove one to add another.', 'warning');
        return;
      }
      if (files.length > available) {
        notify(`You can add up to 5 at a time — added ${available}, skipped ${files.length - available}.`, 'warning');
        files = files.slice(0, available);
      }
      const firstBatch = draftsRef.current.length === 0;
      const lone = firstBatch && files.length === 1;
      const newDrafts: Draft[] = files.map((f) => ({
        id: uid(),
        fileName: f.name,
        status: 'reading',
        fileRef: '',
        extracted: null,
        values: { type: 'open_plot', acquisitionMode: 'purchase' },
      }));
      setDrafts((ds) => [...ds, ...newDrafts]);
      if (firstBatch) {
        setSelectedId(newDrafts[0].id);
        if (lone) setReadingLone(true);
        else setStep('batch');
      }
      void runPool(files, EXTRACT_CONCURRENCY, (file, i) => extractOne(file, newDrafts[i].id, lone));
    },
    [extractOne, notify],
  );

  const addManual = useCallback(() => {
    const id = uid();
    setDrafts((ds) => [
      ...ds,
      {
        id,
        fileName: 'Manual entry',
        status: 'manual',
        fileRef: '',
        extracted: null,
        values: { type: 'open_plot', acquisitionMode: 'purchase', landUnit: 'Sq.yd', builtupUnit: 'Sq.ft' },
      },
    ]);
    setStep('batch');
    setSelectedId(id);
  }, []);

  const deleteDraft = useCallback(
    (id: string) => {
      const remaining = draftsRef.current.filter((d) => d.id !== id);
      setDrafts((ds) => ds.filter((d) => d.id !== id));
      if (selectedId === id) {
        if (remaining.length) setSelectedId(remaining[0].id);
        else {
          setSelectedId('');
          setStep('choose');
        }
      }
    },
    [selectedId],
  );

  // Create one property (+ attach its mirrored doc). Minimal validation: type + label.
  const saveOne = useCallback(
    async (draft: Draft): Promise<boolean> => {
      const vals = draft.values || ({} as PropertyFormValues);
      if (!vals.type || !vals.label) {
        patchDraft(draft.id, { status: 'error', error: 'Needs a type and a name' });
        return false;
      }
      try {
        const data = await gql<{ createProperty: { id: string } | null }>(
          CREATE_PROPERTY_MUT,
          buildPropertyVariables(vals),
        );
        if (!data?.createProperty) return false;
        const newId = data.createProperty.id;
        if (draft.fileRef) {
          const docType = classifierToType(String(vals.deedType || draft.extracted?.doc_type || ''));
          try {
            const docRes = await gql<{ createDocument: { id: string } | null }>(CREATE_DOCUMENT_MUT, {
              parcelId: '',
              passbookId: '',
              propertyId: newId,
              docType,
              fileRef: draft.fileRef,
              docNo: '',
              sroCode: '',
              regYear: '',
              source: 'upload',
              tags: '',
            });
            if (!docRes?.createDocument?.id)
              notify("Property saved — but couldn't attach the document. Add it from the Documents tab.", 'warning');
          } catch {
            notify("Property saved — but couldn't attach the document. Add it from the Documents tab.", 'warning');
          }
        }
        return true;
      } catch {
        return false;
      }
    },
    [notify, patchDraft],
  );

  const handleSaveAll = useCallback(async () => {
    const list = draftsRef.current;
    if (!list.length) return;
    if (list.some((d) => d.status === 'reading')) {
      notify('Still reading a document — one moment.', 'info');
      return;
    }
    const bad = list.find((d) => !d.values?.type || !d.values?.label);
    if (bad) {
      patchDraft(bad.id, { status: 'error', error: 'Needs a type and a name' });
      setSelectedId(bad.id);
      notify('One draft still needs a type and a name — opened it for you.', 'error');
      return;
    }
    setSaving(true);
    const results: { id: string; ok: boolean }[] = [];
    for (const d of list) {
      patchDraft(d.id, { status: 'saving', error: undefined });
      const ok = await saveOne(d);
      results.push({ id: d.id, ok });
      patchDraft(d.id, { status: ok ? 'saved' : 'failed', error: ok ? undefined : "Couldn't save this one" });
    }
    setSaving(false);
    const okCount = results.filter((r) => r.ok).length;
    const total = results.length;
    if (okCount === total) {
      notify(`Added ${total} propert${total === 1 ? 'y' : 'ies'}`, 'success');
      reset();
      onCreated();
      return;
    }
    const failedIds = new Set(results.filter((r) => !r.ok).map((r) => r.id));
    setDrafts(
      list.filter((d) => failedIds.has(d.id)).map((d) => ({ ...d, status: 'error' as const, error: "Couldn't save this one" })),
    );
    const firstFailed = list.find((d) => failedIds.has(d.id));
    if (firstFailed) setSelectedId(firstFailed.id);
    notify(`Saved ${okCount} of ${total} — fix the rest`, 'error');
  }, [notify, onCreated, patchDraft, reset, saveOne]);

  // ── dropzone ────────────────────────────────────────────────────────────
  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    if (!readingLone) handleFiles(Array.from(e.dataTransfer.files || []));
  };
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    handleFiles(Array.from(e.target.files || []));
    e.target.value = '';
  };

  // ── form ────────────────────────────────────────────────────────────────
  const v = (selected?.values || { type: 'open_plot' }) as PropertyFormValues;
  const def = propertyTypeDef(v.type);
  const attrFields = attributeFieldsFor(v.type);
  const text = (key: string, label: string, opts?: { placeholder?: string; required?: boolean; number?: boolean }) => (
    <TextField
      size="small"
      fullWidth
      label={label}
      required={opts?.required}
      placeholder={opts?.placeholder}
      type={opts?.number ? 'number' : 'text'}
      value={(v[key] as string | number | undefined) ?? ''}
      onChange={(e) => setVal(key, opts?.number ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
    />
  );

  const propertyForm = (
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
      <TextField
        select
        size="small"
        label="Property Type"
        required
        value={v.type}
        onChange={(e) => setVal('type', e.target.value)}
      >
        {PROPERTY_TYPES.map((t) => (
          <MenuItem key={t.type} value={t.type}>
            {t.icon} {t.label}
          </MenuItem>
        ))}
      </TextField>
      {text('label', 'Name / Label', { placeholder: 'e.g. Neopolis 250-sqyd plot', required: true })}
      {text('city', 'City', { placeholder: 'Hyderabad' })}
      {text('district', 'District')}
      {(def.areaBasis === 'land' || def.areaBasis === 'both') && text('landArea', 'Land Area (Sq.yd)', { number: true })}
      {(def.areaBasis === 'builtup' || def.areaBasis === 'both') &&
        text('builtupArea', 'Built-up Area (Sq.ft)', { number: true })}
      {attrFields.map((f) => (
        <Box key={f.key}>{text(`attr_${f.key}`, f.label, { number: f.input === 'number' })}</Box>
      ))}
      <Box sx={{ gridColumn: '1 / -1', borderTop: 1, borderColor: 'divider', pt: 1 }}>
        <Typography variant="subtitle2">Purchase &amp; registration</Typography>
      </Box>
      <TextField
        select
        size="small"
        label="Acquisition"
        value={v.acquisitionMode || 'purchase'}
        onChange={(e) => setVal('acquisitionMode', e.target.value)}
      >
        {[
          { value: 'purchase', label: 'Purchase' },
          { value: 'gift', label: 'Gift' },
          { value: 'inheritance', label: 'Inheritance' },
          { value: 'partition', label: 'Partition' },
          { value: 'other', label: 'Other' },
        ].map((o) => (
          <MenuItem key={o.value} value={o.value}>
            {o.label}
          </MenuItem>
        ))}
      </TextField>
      {text('purchaseDate', 'Registration / purchase date', { placeholder: 'DD/MM/YYYY' })}
      {text('purchasePrice', 'Sale price (₹)', { number: true })}
      {text('sellerName', 'Seller (previous owner)')}
      {text('buyerName', 'Buyer (current owner)', { placeholder: 'you, if left blank' })}
      {text('deedType', 'Deed type', { placeholder: 'Sale Deed' })}
      {text('regDocNo', 'Doc No./Year')}
      {text('sro', 'SRO')}
      {text('regDate', 'Reg date', { placeholder: 'DD/MM/YYYY' })}
      <Box sx={{ gridColumn: '1 / -1' }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Boundaries
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 1.5 }}>
          {text('boundaryNorth', 'North')}
          {text('boundarySouth', 'South')}
          {text('boundaryEast', 'East')}
          {text('boundaryWest', 'West')}
        </Box>
      </Box>
      <Box sx={{ gridColumn: '1 / -1' }}>
        <Accordion disableGutters elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2">More (stamp duty &amp; fees)</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              {text('stampDuty', 'Stamp duty (₹)', { number: true })}
              {text('regFee', 'Registration fee (₹)', { number: true })}
            </Box>
          </AccordionDetails>
        </Accordion>
      </Box>
    </Box>
  );

  const n = drafts.length;

  return (
    <Dialog open={open} onClose={close} maxWidth={step === 'choose' ? 'sm' : 'lg'} fullWidth>
      <DialogTitle>Add Property</DialogTitle>
      <DialogContent>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          style={{ display: 'none' }}
          onChange={onPick}
        />
        {step === 'choose' ? (
          <Box sx={{ py: 1 }}>
            <Box
              onClick={() => !readingLone && fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              sx={{
                border: '1.5px dashed',
                borderColor: 'divider',
                borderRadius: 2,
                textAlign: 'center',
                p: 3,
                cursor: readingLone ? 'default' : 'pointer',
                '&:hover': readingLone ? {} : { borderColor: 'primary.main', bgcolor: 'action.hover' },
              }}
            >
              {readingLone ? (
                <CircularProgress size={28} />
              ) : (
                <UploadFileOutlinedIcon color="primary" sx={{ fontSize: 30 }} />
              )}
              <Typography sx={{ fontWeight: 600, mt: 1 }}>
                {readingLone ? loneReadingMessage : 'Drop one or more documents, or click to upload'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Allotment letter, sale deed, flat agreement… I&apos;ll read each and fill the form. PDF / JPG /
                PNG · one PDF per property · up to 5 at a time.
              </Typography>
            </Box>
            {!readingLone && (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>
                  Got a single document covering several properties? Add those manually.
                </Typography>
                <Box sx={{ textAlign: 'center', mt: 1.25 }}>
                  <Button startIcon={<EditOutlinedIcon />} onClick={addManual}>
                    or enter the details manually →
                  </Button>
                </Box>
              </>
            )}
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '260px 1fr' }, gap: 2.5 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {drafts.map((d) => {
                const isSel = d.id === selectedId;
                return (
                  <Box
                    key={d.id}
                    onClick={() => setSelectedId(d.id)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 1.25,
                      py: 1,
                      borderRadius: 2,
                      cursor: 'pointer',
                      border: 1,
                      borderColor: isSel ? 'primary.main' : 'divider',
                      bgcolor: isSel ? 'action.selected' : 'background.paper',
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                        {d.fileName}
                      </Typography>
                      <Box sx={{ mt: 0.25 }}>
                        <DraftBadge d={d} />
                      </Box>
                      {(d.status === 'manual' || d.status === 'error') && d.reason && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {d.reason}
                        </Typography>
                      )}
                    </Box>
                    <IconButton
                      size="small"
                      aria-label="Remove draft"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteDraft(d.id);
                      }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Box>
                );
              })}
              <Box
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                sx={{
                  border: '1.5px dashed',
                  borderColor: 'divider',
                  borderRadius: 2,
                  textAlign: 'center',
                  p: 1,
                  cursor: 'pointer',
                  '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                }}
              >
                <Typography variant="caption" color="primary">
                  ＋ Add more
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  up to 5 at a time
                </Typography>
              </Box>
            </Box>
            <Box>
              {showsForm(selected?.status) ? (
                <>
                  {selected?.extracted && (
                    <Card variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        What I read
                      </Typography>
                      <Typography variant="body2">
                        <b>Type:</b> {propertyTypeDef(selected.extracted?.property_type || 'open_plot').label}
                      </Typography>
                      <Typography variant="body2">
                        <b>Plot / Unit:</b>{' '}
                        {selected.extracted?.attributes?.plot_no || selected.extracted?.attributes?.unit_no || '—'}
                      </Typography>
                      <Typography variant="body2">
                        <b>Area:</b> {selected.extracted?.land_area || selected.extracted?.builtup_area || '—'}
                      </Typography>
                      <Typography variant="body2">
                        <b>City:</b> {selected.extracted?.city || '—'}
                      </Typography>
                      <Box sx={{ mt: 0.5 }}>
                        <Chip
                          size="small"
                          color={
                            selected.extracted?.confidence === 'high'
                              ? 'success'
                              : selected.extracted?.confidence === 'low'
                                ? 'warning'
                                : 'info'
                          }
                          label={`confidence: ${selected.extracted?.confidence || '—'}`}
                        />
                      </Box>
                    </Card>
                  )}
                  {selected?.agricultural && (
                    <Alert severity="warning" sx={{ mb: 1.25 }}>
                      This looks like <b>agricultural land</b>. Save it as a property, or delete it and register
                      it under Parcels.
                    </Alert>
                  )}
                  {(selected?.status === 'manual' || selected?.status === 'error') && selected?.reason && (
                    <Alert severity={selected.status === 'error' ? 'error' : 'warning'} sx={{ mb: 1.5 }}>
                      {selected.reason}
                    </Alert>
                  )}
                  {propertyForm}
                </>
              ) : (
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 260,
                    color: 'text.secondary',
                  }}
                >
                  <CircularProgress size={30} />
                  <Typography sx={{ mt: 1.5 }}>
                    {selected?.status === 'saving' ? 'Saving…' : readingMessage}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        )}
      </DialogContent>
      {step === 'batch' && (
        <DialogActions>
          <Button onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button variant="contained" disabled={!n || saving} onClick={() => void handleSaveAll()}>
            {saving ? 'Saving…' : n === 1 ? 'Save property' : `Save ${n} properties`}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
