/**
 * New-Passbook flow — functional port of the rhub pattadar app's
 * PassbookCreateModal. Two steps: "choose" (drop up to 5 passbook photos /
 * PDFs, or enter manually) and "batch" (left: draft list; right: what the AI
 * read + the editable form, or a rotating "reading" spinner).
 *
 * Each file is mirrored to My Drive (best-effort) then sent to
 * POST /api/gateway/pattadar/import-passbook; the extracted khata, owner and
 * parcels prefill the form. Saving creates the passbook, its parcels and
 * attaches the mirrored document.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
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
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import { formatArea } from '@pattadar/core';
import { apiFetch, gql } from '../../api/client';
import {
  CREATE_DOCUMENT_MUT,
  CREATE_PARCEL_MUT,
  CREATE_PASSBOOK_MUT,
  mirrorToDrive,
} from '../../data/pattadarActions';

type DraftStatus = 'reading' | 'ready' | 'manual' | 'error' | 'saving' | 'saved' | 'failed';

interface DraftValues {
  pattadarNo?: string;
  ownerName?: string;
  fatherHusbandName?: string;
  state?: string;
  district?: string;
  mandal?: string;
  village?: string;
}

interface ExtractedParcel {
  survey_no?: string;
  subdivision?: string;
  extent?: number;
  unit?: string;
  classification?: string;
  acquisition_source?: string;
}

interface Draft {
  id: string;
  fileName: string;
  status: DraftStatus;
  fileRef: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extracted: any;
  values: DraftValues;
  parcels: ExtractedParcel[];
  error?: string;
  reason?: string;
}

// Rotating copy for the "reading" spinner — passbook-flavored (verbatim).
const READING_MESSAGES = [
  'Reading your passbook…',
  'Finding the khata number…',
  "Reading the pattadar's name…",
  'Locating the village and mandal…',
  'Listing the survey numbers…',
  "Measuring each parcel's extent…",
  'Checking the land classification…',
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

// Heavy vision-LLM calls: cap concurrency and total drafts per batch.
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
  if (d.status === 'error' || d.status === 'failed')
    return <Chip size="small" color="error" label={d.error || 'Error'} />;
  if (d.status === 'manual') return <Chip size="small" label="Needs details" />;
  return (
    <Chip size="small" color="success" label={d.parcels?.length ? `${d.parcels.length} parcel(s)` : 'Ready'} />
  );
}

interface RefRow {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  /** Surface a toast in the host page. */
  notify: (msg: string, severity?: 'success' | 'error' | 'warning' | 'info') => void;
}

export function PassbookCreateDialog({ open, onClose, onCreated, notify }: Props) {
  const [step, setStep] = useState<'choose' | 'batch'>('choose');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [saving, setSaving] = useState(false);
  const uidRef = useRef(0);
  const draftsRef = useRef<Draft[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [states, setStates] = useState<RefRow[]>([]);
  const [districts, setDistricts] = useState<RefRow[]>([]);
  const [mandals, setMandals] = useState<RefRow[]>([]);
  const [villages, setVillages] = useState<RefRow[]>([]);

  const selected = drafts.find((d) => d.id === selectedId);
  const readingMessage = useReadingMessage(selected?.status === 'reading');
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const uid = () => `d${++uidRef.current}-${Date.now()}`;

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const d = await gql<{ states: (RefRow & { code?: string })[] }>('query { states { id name code } }').catch(
        () => ({ states: [] as RefRow[] }),
      );
      setStates((d?.states ?? []).map((s) => ({ id: s.id, name: s.name })));
    })();
  }, [open]);

  const loadDistricts = useCallback(async (stateId: string) => {
    const d = await gql<{ districtsByState: RefRow[] }>(
      'query($stateId: String!) { districtsByState(stateId: $stateId) { id name } }',
      { stateId },
    ).catch(() => ({ districtsByState: [] as RefRow[] }));
    setDistricts(d?.districtsByState ?? []);
    setMandals([]);
    setVillages([]);
  }, []);
  const loadMandals = useCallback(async (districtId: string) => {
    const d = await gql<{ mandalsByDistrict: RefRow[] }>(
      'query($districtId: String!) { mandalsByDistrict(districtId: $districtId) { id name } }',
      { districtId },
    ).catch(() => ({ mandalsByDistrict: [] as RefRow[] }));
    setMandals(d?.mandalsByDistrict ?? []);
    setVillages([]);
  }, []);
  const loadVillages = useCallback(async (mandalId: string) => {
    const d = await gql<{ villagesByMandal: RefRow[] }>(
      'query($mandalId: String!) { villagesByMandal(mandalId: $mandalId) { id name } }',
      { mandalId },
    ).catch(() => ({ villagesByMandal: [] as RefRow[] }));
    setVillages(d?.villagesByMandal ?? []);
  }, []);

  const reset = useCallback(() => {
    setDrafts([]);
    draftsRef.current = [];
    setSelectedId('');
    setStep('choose');
    setSaving(false);
  }, []);
  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const patchDraft = useCallback((id: string, patch: Partial<Draft>) => {
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);
  const setValue = useCallback(
    (key: keyof DraftValues, value: string) => {
      if (!selectedId) return;
      setDrafts((ds) =>
        ds.map((d) => (d.id === selectedId ? { ...d, values: { ...d.values, [key]: value } } : d)),
      );
    },
    [selectedId],
  );

  // Read one file into its draft: mirror to My Drive + /import-passbook.
  const extractOne = useCallback(
    async (file: File, draftId: string) => {
      const fileRef = await mirrorToDrive(file);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await apiFetch('/api/gateway/pattadar/import-passbook', { method: 'POST', body: fd });
        if (!res.ok) {
          let reason = "Couldn't read this document — please fill in the details below.";
          try {
            const body = await res.json();
            if (body?.error) reason = body.error;
          } catch {
            /* keep fallback */
          }
          patchDraft(draftId, { status: 'error', reason, fileRef });
          return;
        }
        let f = (await res.json())?.fields || {};
        if (!f.pattadar_no && !f.owner_name && !f.village) {
          // Empty result can be a transient model hiccup — retry once.
          const fd2 = new FormData();
          fd2.append('file', file);
          const res2 = await apiFetch('/api/gateway/pattadar/import-passbook', { method: 'POST', body: fd2 });
          f = res2.ok ? (await res2.json())?.fields || {} : {};
        }
        if (f.pattadar_no || f.owner_name || f.village) {
          patchDraft(draftId, {
            status: 'ready',
            extracted: f,
            fileRef,
            reason: undefined,
            parcels: Array.isArray(f.parcels) ? f.parcels : [],
            values: {
              pattadarNo: f.pattadar_no || undefined,
              ownerName: f.owner_name || undefined,
              fatherHusbandName: f.father_husband_name || undefined,
              state: f.state || undefined,
              district: f.district || undefined,
              mandal: f.mandal || undefined,
              village: f.village || undefined,
            },
          });
          return;
        }
        patchDraft(draftId, {
          status: 'manual',
          reason: "Couldn't read this document confidently — please fill in the details below.",
          fileRef,
        });
      } catch {
        patchDraft(draftId, { status: 'manual', fileRef });
      }
    },
    [patchDraft],
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
      const newDrafts: Draft[] = files.map((f) => ({
        id: uid(),
        fileName: f.name,
        status: 'reading',
        fileRef: '',
        extracted: null,
        values: {},
        parcels: [],
      }));
      setDrafts((ds) => [...ds, ...newDrafts]);
      if (firstBatch) {
        setSelectedId(newDrafts[0].id);
        setStep('batch');
      }
      void runPool(files, EXTRACT_CONCURRENCY, (file, i) => extractOne(file, newDrafts[i].id));
    },
    [extractOne, notify],
  );

  const addManual = useCallback(() => {
    const id = uid();
    setDrafts((ds) => [
      ...ds,
      { id, fileName: 'Manual entry', status: 'manual', fileRef: '', extracted: null, values: {}, parcels: [] },
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

  // Create one passbook + its imported parcels + attach the mirrored document.
  const saveOne = useCallback(
    async (draft: Draft): Promise<boolean> => {
      const v = draft.values || {};
      if (!v.pattadarNo || !v.state || !v.district || !v.mandal || !v.village) {
        patchDraft(draft.id, { status: 'error', error: 'Needs khata number and location' });
        return false;
      }
      try {
        const data = await gql<{ createPassbook: { id: string } | null }>(CREATE_PASSBOOK_MUT, {
          pattadarNo: v.pattadarNo,
          ownerName: v.ownerName || '',
          fatherHusbandName: v.fatherHusbandName || '',
          state: v.state,
          district: v.district,
          mandal: v.mandal,
          village: v.village,
        });
        const pbId = data?.createPassbook?.id;
        if (!pbId) return false;
        for (const p of draft.parcels || []) {
          await gql(CREATE_PARCEL_MUT, {
            passbookId: pbId,
            surveyNo: String(p.survey_no ?? ''),
            subdivision: String(p.subdivision ?? ''),
            extent: Number(p.extent) || 0,
            unit: p.unit || 'Acres-Guntas',
            classification: p.classification === 'non-agri' ? 'non-agri' : 'agri',
            acquisitionSource: p.acquisition_source || 'sale',
            source: `passbook:${pbId}`,
          });
        }
        if (draft.fileRef) {
          try {
            const docRes = await gql<{ createDocument: { id: string } | null }>(CREATE_DOCUMENT_MUT, {
              parcelId: '',
              passbookId: pbId,
              propertyId: '',
              docType: 'passbook',
              fileRef: draft.fileRef,
              docNo: v.pattadarNo || '',
              sroCode: '',
              regYear: '',
              source: 'upload',
              tags: '',
            });
            if (!docRes?.createDocument?.id)
              notify("Passbook saved — but couldn't attach the document.", 'warning');
          } catch {
            notify("Passbook saved — but couldn't attach the document.", 'warning');
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
    const bad = list.find(
      (d) => !d.values?.pattadarNo || !d.values?.state || !d.values?.district || !d.values?.mandal || !d.values?.village,
    );
    if (bad) {
      patchDraft(bad.id, { status: 'error', error: 'Needs khata number and location' });
      setSelectedId(bad.id);
      notify('One draft still needs its khata number and location — opened it for you.', 'error');
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
      notify(`Added ${total} passbook${total === 1 ? '' : 's'}`, 'success');
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
    handleFiles(Array.from(e.dataTransfer.files || []));
  };
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    handleFiles(Array.from(e.target.files || []));
    e.target.value = '';
  };
  const dropzone = (compact: boolean) => (
    <Box
      onClick={() => fileInputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      sx={{
        border: '1.5px dashed',
        borderColor: 'divider',
        borderRadius: 2,
        textAlign: 'center',
        p: compact ? 1 : 3,
        cursor: 'pointer',
        '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
      }}
    >
      {compact ? (
        <>
          <Typography variant="caption" color="primary">
            ＋ Add more
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            up to 5 at a time
          </Typography>
        </>
      ) : (
        <>
          <UploadFileOutlinedIcon color="primary" sx={{ fontSize: 30 }} />
          <Typography sx={{ fontWeight: 600, mt: 1 }}>Drop one or more passbooks, or click to upload</Typography>
          <Typography variant="caption" color="text.secondary">
            Passbook, Meebhoomi or 1-B PDF, screenshot or photo (English or Telugu). I&apos;ll read each — khata,
            owner and parcels — and fill the form. PDF / JPG / PNG · one per passbook · up to 5 at a time.
          </Typography>
        </>
      )}
    </Box>
  );

  // ── form ────────────────────────────────────────────────────────────────
  const v = selected?.values || {};
  const refSelect = (
    label: string,
    key: keyof DraftValues,
    options: RefRow[],
    onSelect?: (row: RefRow) => void,
    required = true,
  ) => (
    <Autocomplete
      freeSolo
      options={options.map((o) => o.name)}
      inputValue={v[key] || ''}
      onInputChange={(_e, value) => {
        setValue(key, value);
        const row = options.find((o) => o.name === value);
        if (row && onSelect) onSelect(row);
      }}
      renderInput={(params) => <TextField {...params} label={label} required={required} size="small" />}
    />
  );

  const form = (
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
      <TextField
        label="Pattadar / Khata Number"
        required
        size="small"
        value={v.pattadarNo || ''}
        onChange={(e) => setValue('pattadarNo', e.target.value)}
      />
      <TextField
        label="Owner / Pattadar Name"
        size="small"
        value={v.ownerName || ''}
        onChange={(e) => setValue('ownerName', e.target.value)}
      />
      <Box sx={{ gridColumn: '1 / -1' }}>
        <TextField
          label="Father / Husband Name"
          size="small"
          fullWidth
          value={v.fatherHusbandName || ''}
          onChange={(e) => setValue('fatherHusbandName', e.target.value)}
        />
      </Box>
      <Box sx={{ gridColumn: '1 / -1' }}>
        {refSelect('State', 'state', states, (row) => {
          setValue('district', '');
          setValue('mandal', '');
          setValue('village', '');
          void loadDistricts(row.id);
        })}
      </Box>
      {refSelect('District', 'district', districts, (row) => {
        setValue('mandal', '');
        setValue('village', '');
        void loadMandals(row.id);
      })}
      {refSelect('Mandal', 'mandal', mandals, (row) => {
        setValue('village', '');
        void loadVillages(row.id);
      })}
      <Box sx={{ gridColumn: '1 / -1' }}>{refSelect('Village', 'village', villages)}</Box>
    </Box>
  );

  const n = drafts.length;

  return (
    <Dialog open={open} onClose={close} maxWidth={step === 'choose' ? 'sm' : 'lg'} fullWidth>
      <DialogTitle>Create Passbook</DialogTitle>
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
            {dropzone(false)}
            <Box sx={{ textAlign: 'center', mt: 1.5 }}>
              <Button startIcon={<EditOutlinedIcon />} onClick={addManual}>
                or enter the details manually →
              </Button>
            </Box>
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
              {dropzone(true)}
            </Box>
            <Box>
              {showsForm(selected?.status) ? (
                <>
                  {selected?.extracted && (
                    <Card variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        What I read
                      </Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
                        <Typography variant="body2">
                          <b>Khata:</b> {selected.extracted?.pattadar_no || '—'}
                        </Typography>
                        <Typography variant="body2">
                          <b>Owner:</b> {selected.extracted?.owner_name || '—'}
                        </Typography>
                        <Typography variant="body2">
                          <b>Village:</b> {selected.extracted?.village || '—'}
                        </Typography>
                        <Typography variant="body2">
                          <b>Parcels:</b> {selected.parcels?.length || 0}
                        </Typography>
                      </Box>
                      {(selected.parcels?.length || 0) > 0 && (
                        <Box sx={{ maxHeight: 150, overflowY: 'auto', mt: 0.75, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                          {selected.parcels.map((p, i) => (
                            <Box key={i} sx={{ px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider', display: 'flex', gap: 1, alignItems: 'center' }}>
                              <Chip size="small" label={`${p.survey_no}${p.subdivision ? '/' + p.subdivision : ''}`} />
                              <Typography variant="caption" color="text.secondary">
                                {formatArea(Number(p.extent))}
                              </Typography>
                              <Chip
                                size="small"
                                color={p.classification === 'non-agri' ? 'info' : 'success'}
                                variant="outlined"
                                label={p.classification || 'agri'}
                              />
                            </Box>
                          ))}
                        </Box>
                      )}
                    </Card>
                  )}
                  {(selected?.status === 'manual' || selected?.status === 'error') && selected?.reason && (
                    <Alert severity={selected.status === 'error' ? 'error' : 'warning'} sx={{ mb: 1.5 }}>
                      {selected.reason}
                    </Alert>
                  )}
                  {form}
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
            {saving ? 'Saving…' : n === 1 ? 'Save passbook' : `Save ${n} passbooks`}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
