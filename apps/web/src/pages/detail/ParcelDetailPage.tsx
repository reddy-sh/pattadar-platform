/**
 * Parcel 360 — functional-parity port of the rhub pattadar app's
 * Parcel360Content (RemoteApp.tsx): header (survey/status/class/extent),
 * photo strip, parcel record + location & boundaries + at-a-glance cards,
 * financials, legal & compliance, family share/heir summary, geo section
 * (stored GeoJSON → area/perimeter/fence estimate via @pattadar/core
 * landcalc; paste/edit like the Tools Map-Area tab; updateParcelGeo), linked
 * documents (My Drive preview/download), ownership timeline, notes and audit
 * log, and the full Edit-details dialog (updateParcel — field set verbatim).
 */
import { useCallback, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import {
  fenceEstimate,
  formatArea,
  fromAcres,
  parsePolygonRing,
  ringAreaSqM,
  ringPerimM,
  round2,
  sampleDocuments,
  sampleGroups,
  sampleParcels,
  samplePassbooks,
  unitKey,
  unitLabel,
} from '@pattadar/core';
import { gql } from '../../api/client';
import { fmtLocal } from '../../lib/format';
import { useLiveOrSample } from '../../data/useLiveOrSample';
import {
  AuditTrailPanel,
  DocumentsList,
  Field,
  FieldGrid,
  NotFoundCard,
  NotesPanel,
  PhotoStrip,
  SectionCard,
  StatusChip,
  dashVal,
  money,
} from './common';
import type { LinkedDoc } from './common';

// ── data shapes (field names verbatim from the source query) ─────────────

interface OwnerRow {
  ownerName: string;
  acquisitionSource: string;
  mutationType: string;
  mutationDate: string;
  isCurrent: boolean;
}

interface ParcelDetail {
  id: string;
  ref: string;
  passbookRef: string;
  surveyNo: string;
  subdivision: string;
  extent: number;
  unit: string;
  classification: string;
  acquisitionSource: string;
  source: string;
  geoPoint: string;
  currentOwner: string;
  createdAt: string;
  status: string;
  label: string;
  address: string;
  boundaryNorth: string;
  boundarySouth: string;
  boundaryEast: string;
  boundaryWest: string;
  purchasePrice: number;
  purchaseDate: string;
  guidelineValue: number;
  marketValue: number;
  stampDuty: number;
  loanAmount: number;
  encumbranceStatus: string;
  regDocNo: string;
  sro: string;
  regDate: string;
  ecStatus: string;
  ecDate: string;
  mutationStatus: string;
  taxPaidUpto: string;
  reraNo: string;
  litigation: boolean;
  litigationNote: string;
  location: { village: string; mandal: string; district: string; state: string } | null;
  owners: OwnerRow[];
}

interface DocRow extends LinkedDoc {
  parcelId: string;
}

interface DeedRow {
  id: string;
  ref: string;
  docType: string;
  documentNo: string;
  regYear: string;
  sro: string;
  parcelId: string;
}

interface FamilyMember {
  name: string;
  relation: string;
  isSelf: boolean;
  isBeneficiary: boolean;
  sharePct: number;
  status: string;
}

interface ParcelDetailData {
  parcel: ParcelDetail | null;
  docs: DocRow[];
  deeds: DeedRow[];
  passbookId: string;
  groupName: string;
  members: FamilyMember[];
}

const PARCEL_QUERY = `query($id: String!) {
  parcel(id: $id) { id ref passbookRef surveyNo subdivision extent unit classification acquisitionSource source geoPoint currentOwner createdAt
    status label address boundaryNorth boundarySouth boundaryEast boundaryWest
    purchasePrice purchaseDate guidelineValue marketValue stampDuty loanAmount encumbranceStatus
    regDocNo sro regDate ecStatus ecDate mutationStatus taxPaidUpto reraNo litigation litigationNote
    location { village mandal district state } owners { ownerName acquisitionSource mutationType mutationDate isCurrent } }
  documents { id parcelId docType fileRef tags createdAt }
  registeredDocuments { id ref docType documentNo regYear sro parcelId }
  passbooks { id ref groupId }
  groups { id name }
}`;

const UPDATE_PARCEL_MUT = `mutation($id:String!,$status:String,$label:String,$address:String,$boundaryNorth:String,$boundarySouth:String,$boundaryEast:String,$boundaryWest:String,$purchasePrice:Float,$purchaseDate:String,$guidelineValue:Float,$marketValue:Float,$stampDuty:Float,$loanAmount:Float,$encumbranceStatus:String,$regDocNo:String,$sro:String,$regDate:String,$ecStatus:String,$ecDate:String,$mutationStatus:String,$taxPaidUpto:String,$reraNo:String,$litigation:Boolean,$litigationNote:String){ updateParcel(id:$id,status:$status,label:$label,address:$address,boundaryNorth:$boundaryNorth,boundarySouth:$boundarySouth,boundaryEast:$boundaryEast,boundaryWest:$boundaryWest,purchasePrice:$purchasePrice,purchaseDate:$purchaseDate,guidelineValue:$guidelineValue,marketValue:$marketValue,stampDuty:$stampDuty,loanAmount:$loanAmount,encumbranceStatus:$encumbranceStatus,regDocNo:$regDocNo,sro:$sro,regDate:$regDate,ecStatus:$ecStatus,ecDate:$ecDate,mutationStatus:$mutationStatus,taxPaidUpto:$taxPaidUpto,reraNo:$reraNo,litigation:$litigation,litigationNote:$litigationNote){ id } }`;

/** Human label for a parcel's provenance source (verbatim from source). */
function sourceLabel(s?: string): string {
  const v = String(s || 'manual');
  if (v.startsWith('passbook:')) return 'Passbook upload';
  if (v.startsWith('document:')) return 'Deed upload';
  return 'Manual entry';
}

/** Short "lat, lng" label from a GeoJSON Point/Polygon string. */
function geoLabel(gp?: string): string {
  if (!gp) return '';
  try {
    const g = JSON.parse(gp) as { type?: string; coordinates?: unknown };
    if (g.type === 'Point') {
      const [lng, lat] = g.coordinates as [number, number];
      return `${(+lat).toFixed(5)}, ${(+lng).toFixed(5)}`;
    }
    if (g.type === 'Polygon') {
      const ring = (g.coordinates as number[][][])[0];
      const n = ring.length - 1;
      let la = 0;
      let lo = 0;
      for (let i = 0; i < n; i++) {
        lo += ring[i][0];
        la += ring[i][1];
      }
      return `${(la / n).toFixed(5)}, ${(lo / n).toFixed(5)} · ${n}pt`;
    }
  } catch {
    /* ignore */
  }
  return 'set';
}

/** Bundled-sample fallback shaped like the live query result. */
function sampleFor(id: string): ParcelDetailData {
  const p = sampleParcels.find((x) => x.id === id);
  if (!p) return { parcel: null, docs: [], deeds: [], passbookId: '', groupName: '', members: [] };
  const pb = samplePassbooks.find((b) => b.id === p.passbookId);
  return {
    parcel: {
      id: p.id,
      ref: p.ref,
      passbookRef: pb?.ref || '',
      surveyNo: p.surveyNo,
      subdivision: p.subdivision,
      extent: p.extent,
      unit: p.unit,
      classification: p.classification,
      acquisitionSource: '',
      source: 'manual',
      geoPoint: p.geoPoint || '',
      currentOwner: p.currentOwner,
      createdAt: p.createdAt,
      status: p.status,
      label: p.label,
      address: '',
      boundaryNorth: '',
      boundarySouth: '',
      boundaryEast: '',
      boundaryWest: '',
      purchasePrice: p.purchasePrice,
      purchaseDate: p.purchaseDate,
      guidelineValue: p.guidelineValue,
      marketValue: p.marketValue,
      stampDuty: 0,
      loanAmount: p.loanAmount,
      encumbranceStatus: '',
      regDocNo: p.regDocNo,
      sro: p.sro,
      regDate: p.regDate,
      ecStatus: p.ecStatus,
      ecDate: p.ecDate,
      mutationStatus: '',
      taxPaidUpto: p.taxPaidUpto,
      reraNo: '',
      litigation: p.litigation,
      litigationNote: '',
      location: pb ? { village: pb.village, mandal: pb.mandal, district: pb.district, state: pb.state } : null,
      owners: [],
    },
    docs: sampleDocuments
      .filter((d) => d.parcelId === id)
      .map((d) => ({ id: d.id, parcelId: d.parcelId, docType: d.docType, fileRef: d.fileRef, tags: d.tags, createdAt: d.createdAt })),
    deeds: [],
    passbookId: pb?.id || '',
    groupName: pb ? sampleGroups.find((g) => g.id === pb.groupId)?.name || '' : '',
    members: [],
  };
}

function useParcelDetail(id: string) {
  return useLiveOrSample<ParcelDetailData>(
    `parcel:${id}`,
    async () => {
      const d = await gql<{
        parcel: ParcelDetail | null;
        documents: DocRow[];
        registeredDocuments: DeedRow[];
        passbooks: { id: string; ref: string; groupId: string }[];
        groups: { id: string; name: string }[];
      }>(PARCEL_QUERY, { id });
      const pbRow = (d.passbooks ?? []).find((b) => b.ref === d.parcel?.passbookRef);
      const groupId = pbRow?.groupId || '';
      let members: FamilyMember[] = [];
      if (groupId) {
        members = await gql<{ members: FamilyMember[] }>(
          `query($gid: String!) { members(groupId: $gid) { name relation isSelf isBeneficiary sharePct status } }`,
          { gid: groupId },
        )
          .then((r) => r.members ?? [])
          .catch(() => []);
      }
      return {
        parcel: d.parcel ?? null,
        docs: (d.documents ?? []).filter((x) => x.parcelId === id),
        deeds: (d.registeredDocuments ?? []).filter((x) => x.parcelId === id),
        passbookId: pbRow?.id || '',
        groupName: (d.groups ?? []).find((g) => g.id === groupId)?.name || '',
        members,
      };
    },
    sampleFor(id),
  );
}

// ── geo section (Tools Map-Area approach + updateParcelGeo) ──────────────

function GeoSection({ parcel, notify, refresh }: { parcel: ParcelDetail; notify: (m: string, err?: boolean) => void; refresh: () => void }) {
  const [draft, setDraft] = useState(parcel.geoPoint || '');
  const [saving, setSaving] = useState(false);
  const [spacing, setSpacing] = useState('8');
  const [strands, setStrands] = useState('3');

  const ring = useMemo(() => parsePolygonRing(draft), [draft]);
  const acres = ringAreaSqM(ring) / 4046.8564;
  const perimM = ringPerimM(ring);
  const perimFt = perimM * 3.280839895;
  const fence = fenceEstimate(perimFt, Number(spacing) || 0, Number(strands) || 0);
  const isPoint = draft.includes('Point');
  const dirty = draft !== (parcel.geoPoint || '');

  const persist = useCallback(
    async (geo: string) => {
      setSaving(true);
      try {
        await gql(`mutation($id:String!,$geo:String!){ updateParcelGeo(parcelId:$id, geoPoint:$geo){ id } }`, {
          id: parcel.id,
          geo,
        });
        notify(geo ? 'Boundary saved' : 'Boundary removed');
        refresh();
      } catch {
        notify('Could not save location', true);
      } finally {
        setSaving(false);
      }
    },
    [parcel.id, notify, refresh],
  );

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {parcel.geoPoint
          ? `Stored location: ${parcel.geoPoint.includes('Polygon') ? 'Exact boundary' : 'Point set'} · 📍 ${geoLabel(parcel.geoPoint)}`
          : 'No boundary stored yet — paste the plot boundary as GeoJSON (a Polygon of [longitude, latitude] corners from any GPS/mapping tool).'}
      </Typography>
      <TextField
        fullWidth
        multiline
        minRows={5}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder='{"type":"Polygon","coordinates":[[[80.648,16.506],[80.650,16.506],[80.650,16.508],[80.648,16.508],[80.648,16.506]]]}'
        slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 13 } } }}
      />
      <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
        <Button size="small" variant="contained" disabled={!dirty || saving} onClick={() => void persist(draft)}>
          Save location
        </Button>
        {parcel.geoPoint && (
          <Button size="small" color="error" disabled={saving} onClick={() => { setDraft(''); void persist(''); }}>
            Remove boundary
          </Button>
        )}
        {dirty && (
          <Button size="small" disabled={saving} onClick={() => setDraft(parcel.geoPoint || '')}>
            Cancel
          </Button>
        )}
      </Box>
      {ring.length >= 3 ? (
        <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
          <SectionCard title="Boundary measurements">
            <Field label="Area">{`${formatArea(acres)} (${round2(fromAcres(acres, 'sqyd')).toLocaleString('en-IN')} sq.yd)`}</Field>
            <Field label="Perimeter">{`${round2(perimM).toLocaleString('en-IN')} m · ${round2(perimFt).toLocaleString('en-IN')} ft`}</Field>
            <Field label="Corners">{String(ring.length)}</Field>
            {parcel.extent > 0 && (
              <Field label="Recorded extent">{`${formatArea(Number(parcel.extent))} ${Math.abs(acres - Number(parcel.extent)) / Number(parcel.extent) > 0.1 ? '⚠ differs from drawn boundary' : '✓ matches drawn boundary'}`}</Field>
            )}
          </SectionCard>
          <SectionCard title="Fencing estimate">
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <TextField size="small" type="number" label="Post spacing (ft)" value={spacing} onChange={(e) => setSpacing(e.target.value)} sx={{ width: 150 }} />
              <TextField size="small" type="number" label="Wire strands" value={strands} onChange={(e) => setStrands(e.target.value)} sx={{ width: 130 }} />
            </Box>
            <Field label="Posts">{fence.posts.toLocaleString('en-IN')}</Field>
            <Field label="Wire">{`${round2(fence.wire).toLocaleString('en-IN')} ft`}</Field>
          </SectionCard>
        </Box>
      ) : isPoint ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          A point pin is stored ({geoLabel(draft)}) — paste a Polygon to measure area, perimeter and fencing.
        </Typography>
      ) : null}
    </Box>
  );
}

// ── edit dialog (updateParcel field set verbatim) ────────────────────────

interface EditVals {
  status: string;
  label: string;
  address: string;
  boundaryNorth: string;
  boundarySouth: string;
  boundaryEast: string;
  boundaryWest: string;
  purchasePrice: string;
  purchaseDate: string;
  guidelineValue: string;
  marketValue: string;
  stampDuty: string;
  loanAmount: string;
  encumbranceStatus: string;
  regDocNo: string;
  sro: string;
  regDate: string;
  ecStatus: string;
  ecDate: string;
  mutationStatus: string;
  taxPaidUpto: string;
  reraNo: string;
  litigation: boolean;
  litigationNote: string;
}

function editValsFrom(p: ParcelDetail): EditVals {
  const s = (v?: string) => v || '';
  const n = (v?: number) => (Number(v) > 0 ? String(v) : '');
  return {
    status: p.status || 'owned',
    label: s(p.label),
    address: s(p.address),
    boundaryNorth: s(p.boundaryNorth),
    boundarySouth: s(p.boundarySouth),
    boundaryEast: s(p.boundaryEast),
    boundaryWest: s(p.boundaryWest),
    purchasePrice: n(p.purchasePrice),
    purchaseDate: s(p.purchaseDate),
    guidelineValue: n(p.guidelineValue),
    marketValue: n(p.marketValue),
    stampDuty: n(p.stampDuty),
    loanAmount: n(p.loanAmount),
    encumbranceStatus: s(p.encumbranceStatus),
    regDocNo: s(p.regDocNo),
    sro: s(p.sro),
    regDate: s(p.regDate),
    ecStatus: s(p.ecStatus),
    ecDate: s(p.ecDate),
    mutationStatus: s(p.mutationStatus),
    taxPaidUpto: s(p.taxPaidUpto),
    reraNo: s(p.reraNo),
    litigation: !!p.litigation,
    litigationNote: s(p.litigationNote),
  };
}

function EditParcelDialog({
  parcel,
  open,
  onClose,
  onSaved,
  notify,
}: {
  parcel: ParcelDetail;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  notify: (m: string, err?: boolean) => void;
}) {
  const [v, setV] = useState<EditVals>(() => editValsFrom(parcel));
  const [saving, setSaving] = useState(false);
  const set = (k: keyof EditVals) => (e: { target: { value: string } }) => setV((old) => ({ ...old, [k]: e.target.value }));

  // Re-seed the form whenever the dialog opens on fresh data.
  const [seedKey, setSeedKey] = useState('');
  if (open && seedKey !== parcel.id + String(open)) {
    setSeedKey(parcel.id + String(open));
    setV(editValsFrom(parcel));
  }

  const save = async () => {
    setSaving(true);
    try {
      await gql(UPDATE_PARCEL_MUT, {
        id: parcel.id,
        status: v.status,
        label: v.label,
        address: v.address,
        boundaryNorth: v.boundaryNorth,
        boundarySouth: v.boundarySouth,
        boundaryEast: v.boundaryEast,
        boundaryWest: v.boundaryWest,
        purchasePrice: Number(v.purchasePrice) || 0,
        purchaseDate: v.purchaseDate,
        guidelineValue: Number(v.guidelineValue) || 0,
        marketValue: Number(v.marketValue) || 0,
        stampDuty: Number(v.stampDuty) || 0,
        loanAmount: Number(v.loanAmount) || 0,
        encumbranceStatus: v.encumbranceStatus,
        regDocNo: v.regDocNo,
        sro: v.sro,
        regDate: v.regDate,
        ecStatus: v.ecStatus,
        ecDate: v.ecDate,
        mutationStatus: v.mutationStatus,
        taxPaidUpto: v.taxPaidUpto,
        reraNo: v.reraNo,
        litigation: !!v.litigation,
        litigationNote: v.litigationNote,
      });
      notify('Parcel details saved');
      onSaved();
      onClose();
    } catch {
      notify('Save failed', true);
    } finally {
      setSaving(false);
    }
  };

  const half = { flex: '1 1 46%', minWidth: 200 };
  const row = { display: 'flex', gap: 1.5, flexWrap: 'wrap' as const, mb: 1.5 };
  const section = (t: string) => (
    <Divider textAlign="left" sx={{ my: 1.5 }}>
      <Typography variant="caption" color="text.secondary">
        {t}
      </Typography>
    </Divider>
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        Edit parcel details · Survey {parcel.surveyNo}
        {parcel.subdivision ? '/' + parcel.subdivision : ''}
      </DialogTitle>
      <DialogContent dividers sx={{ maxHeight: '70vh' }}>
        {section('Identity & status')}
        <Box sx={row}>
          <TextField select size="small" label="Status" value={v.status} onChange={set('status')} sx={half}>
            {['owned', 'for-sale', 'sold', 'disputed'].map((s) => (
              <MenuItem key={s} value={s}>
                {s.replace(/-/g, ' ')}
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" label="Label / nickname" placeholder="e.g. Roadside plot" value={v.label} onChange={set('label')} sx={half} />
        </Box>
        <TextField fullWidth size="small" multiline minRows={2} label="Address" placeholder="Door no / street / landmark" value={v.address} onChange={set('address')} sx={{ mb: 1.5 }} />
        {section('Boundary schedule')}
        <Box sx={row}>
          <TextField size="small" label="North" value={v.boundaryNorth} onChange={set('boundaryNorth')} sx={half} />
          <TextField size="small" label="South" value={v.boundarySouth} onChange={set('boundarySouth')} sx={half} />
          <TextField size="small" label="East" value={v.boundaryEast} onChange={set('boundaryEast')} sx={half} />
          <TextField size="small" label="West" value={v.boundaryWest} onChange={set('boundaryWest')} sx={half} />
        </Box>
        {section('Financials')}
        <Box sx={row}>
          <TextField size="small" type="number" label="Purchase price / invested (₹)" value={v.purchasePrice} onChange={set('purchasePrice')} sx={half} />
          <TextField size="small" label="Purchase date" placeholder="DD/MM/YYYY" value={v.purchaseDate} onChange={set('purchaseDate')} sx={half} />
          <TextField size="small" type="number" label="Guideline (SRO) value (₹)" value={v.guidelineValue} onChange={set('guidelineValue')} sx={half} />
          <TextField size="small" type="number" label="Current market value (₹)" value={v.marketValue} onChange={set('marketValue')} sx={half} />
          <TextField size="small" type="number" label="Stamp duty (₹)" value={v.stampDuty} onChange={set('stampDuty')} sx={half} />
          <TextField size="small" type="number" label="Loan amount (₹)" value={v.loanAmount} onChange={set('loanAmount')} sx={half} />
          <TextField select size="small" label="Encumbrance" value={v.encumbranceStatus} onChange={set('encumbranceStatus')} sx={half}>
            <MenuItem value="">—</MenuItem>
            {['clear', 'mortgaged', 'lien'].map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        {section('Legal & compliance')}
        <Box sx={row}>
          <TextField size="small" label="Registration doc no." value={v.regDocNo} onChange={set('regDocNo')} sx={half} />
          <TextField size="small" label="SRO" value={v.sro} onChange={set('sro')} sx={half} />
          <TextField size="small" label="Registration date" placeholder="DD/MM/YYYY" value={v.regDate} onChange={set('regDate')} sx={half} />
          <TextField select size="small" label="Mutation status" value={v.mutationStatus} onChange={set('mutationStatus')} sx={half}>
            <MenuItem value="">—</MenuItem>
            {['completed', 'pending', 'not-applied'].map((s) => (
              <MenuItem key={s} value={s}>
                {s.replace(/-/g, ' ')}
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label="EC status" value={v.ecStatus} onChange={set('ecStatus')} sx={half}>
            <MenuItem value="">—</MenuItem>
            {['clear', 'pending', 'encumbered'].map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" label="EC as-of date" placeholder="DD/MM/YYYY" value={v.ecDate} onChange={set('ecDate')} sx={half} />
          <TextField size="small" label="Tax paid upto" placeholder="DD/MM/YYYY" value={v.taxPaidUpto} onChange={set('taxPaidUpto')} sx={half} />
          <TextField size="small" label="RERA no." value={v.reraNo} onChange={set('reraNo')} sx={half} />
        </Box>
        <FormControlLabel
          control={<Checkbox checked={v.litigation} onChange={(e) => setV((old) => ({ ...old, litigation: e.target.checked }))} />}
          label="Under litigation"
        />
        <TextField fullWidth size="small" label="Litigation note" placeholder="Case / court / status" value={v.litigationNote} onChange={set('litigationNote')} sx={{ mt: 1 }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save details'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── page ─────────────────────────────────────────────────────────────────

export function ParcelDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isSample, isLoading } = useParcelDetail(id);
  const [tab, setTab] = useState('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);

  const notify = useCallback((msg: string, err = false) => setToast({ msg, err }), []);
  const refresh = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: ['pattadar'] }),
    [queryClient],
  );

  if (isLoading)
    return (
      <Box sx={{ minHeight: '40vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress aria-label="Loading" />
      </Box>
    );
  const p = data.parcel;
  if (!p) return <NotFoundCard what="Parcel" backTo="/app/parcels" backLabel="Back to Land & Properties" />;

  const loc = p.location || { village: '', mandal: '', district: '', state: '' };
  const addressLine = [loc.village, loc.mandal, loc.district, loc.state].filter(Boolean).join(', ') || '—';
  const sub = p.subdivision ? '/' + p.subdivision : '';
  const isPhoto = (d: DocRow) => d.docType === 'photo' || d.tags === 'photo';
  const isVideo = (d: DocRow) => d.docType === 'video' || d.tags === 'video';
  // Newest first — the hero/cover is the most recently added photo (source parity).
  const photos = data.docs.filter((d) => isPhoto(d) && d.fileRef).map((d) => ({ fileRef: d.fileRef, name: 'Photo' })).reverse();
  const videos = data.docs.filter((d) => isVideo(d) && d.fileRef).map((d) => ({ fileRef: d.fileRef, name: 'Video' })).reverse();
  const fileDocs = data.docs.filter((d) => !isPhoto(d));
  const hasGeo = !!p.geoPoint;
  const boundaryLabel = !hasGeo ? 'Not drawn yet' : p.geoPoint.includes('Polygon') ? 'Exact boundary' : 'Point set';
  const uk = unitKey(p.unit);
  const recordedAs = uk !== 'acre' && uk !== 'cent' ? ` (recorded as ${round2(fromAcres(Number(p.extent), uk))} ${unitLabel(p.unit)})` : '';
  const beneficiaries = data.members.filter((m) => m.isBeneficiary);
  const heirShare = beneficiaries.reduce((s, m) => s + (Number(m.sharePct) || 0), 0);

  const glance = (count: number, label: string, tabKey: string) => (
    <Box onClick={() => setTab(tabKey)} sx={{ cursor: 'pointer', minWidth: 84 }}>
      <Typography sx={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2 }}>{count}</Typography>
      <Link component="span" variant="caption">
        {label} ›
      </Link>
    </Box>
  );

  const overview = (
    <Box>
      <PhotoStrip photos={photos} videos={videos} onGoFiles={() => setTab('files')} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' }, gap: 1.5 }}>
        <SectionCard title="Parcel record">
          <FieldGrid>
            <Field label="Survey number">{`${p.surveyNo}${sub}`}</Field>
            <Field label="Extent">{`${formatArea(Number(p.extent))}${recordedAs}`}</Field>
            <Field label="Classification">
              <Chip size="small" color={p.classification === 'agri' ? 'success' : 'info'} label={p.classification || 'agri'} />
            </Field>
            <Field label="Status">
              <StatusChip status={p.status} />
            </Field>
            <Field label="Current owner">{dashVal(p.currentOwner)}</Field>
            <Field label="Family / group">
              {data.groupName ? (
                <Link component={RouterLink} to="/app/groups">
                  👪 {data.groupName}
                </Link>
              ) : (
                'Personal'
              )}
            </Field>
            <Field label="Pattadar passbook">
              {data.passbookId ? (
                <Link component={RouterLink} to={`/app/passbooks/${data.passbookId}`}>
                  {p.passbookRef}
                </Link>
              ) : (
                dashVal(p.passbookRef)
              )}
            </Field>
            <Field label="Acquisition">{p.acquisitionSource ? String(p.acquisitionSource).replace(/_/g, ' ') : '—'}</Field>
            <Field label="Record source">{sourceLabel(p.source)}</Field>
            <Field label="Added on">{fmtLocal(p.createdAt)}</Field>
          </FieldGrid>
          <Field label="Parcel ref">
            <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
              {p.ref}
            </Typography>
          </Field>
        </SectionCard>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <SectionCard
            title="Location & boundaries"
            action={
              <Link component="button" variant="caption" onClick={() => setTab('geo')}>
                Boundary & measurements ›
              </Link>
            }
          >
            <FieldGrid columns={1}>
              {p.address ? <Field label="Street / door">{p.address}</Field> : null}
              <Field label="Village">{dashVal(loc.village)}</Field>
              <Field label="Mandal">{dashVal(loc.mandal)}</Field>
              <Field label="District">{dashVal(loc.district)}</Field>
              <Field label="State">{dashVal(loc.state)}</Field>
              {(p.boundaryNorth || p.boundarySouth || p.boundaryEast || p.boundaryWest) && (
                <Field label="Boundaries">{`N: ${p.boundaryNorth || '—'} · S: ${p.boundarySouth || '—'} · E: ${p.boundaryEast || '—'} · W: ${p.boundaryWest || '—'}`}</Field>
              )}
              <Field label="Boundary on map">{hasGeo ? `${boundaryLabel} · 📍 ${geoLabel(p.geoPoint)}` : 'Not drawn yet'}</Field>
            </FieldGrid>
          </SectionCard>
          <SectionCard title="At a glance">
            <Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap' }}>
              {glance((p.owners || []).length, 'Owners on record', 'ownership')}
              {glance(fileDocs.length + data.deeds.length + photos.length, 'Files', 'files')}
            </Box>
          </SectionCard>
        </Box>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 1.5, mt: 1.5 }}>
        <SectionCard title="Financials">
          <FieldGrid columns={1}>
            <Field label="Purchase price (invested)">{money(p.purchasePrice)}</Field>
            <Field label="Purchase date">{dashVal(p.purchaseDate)}</Field>
            <Field label="Guideline (SRO) value">{money(p.guidelineValue)}</Field>
            <Field label="Current market value">{money(p.marketValue)}</Field>
            <Field label="Stamp duty">{money(p.stampDuty)}</Field>
            <Field label="Loan / encumbrance">
              {p.loanAmount ? money(p.loanAmount) : dashVal(p.encumbranceStatus)}
              {p.loanAmount && p.encumbranceStatus ? ` · ${p.encumbranceStatus}` : ''}
            </Field>
          </FieldGrid>
        </SectionCard>
        <SectionCard title="Legal & compliance">
          <FieldGrid columns={1}>
            <Field label="Registration doc no.">{`${dashVal(p.regDocNo)}${p.sro ? ` · ${p.sro}` : ''}${p.regDate ? ` · ${p.regDate}` : ''}`}</Field>
            <Field label="EC status">{`${dashVal(p.ecStatus)}${p.ecDate ? ` · ${p.ecDate}` : ''}`}</Field>
            <Field label="Mutation status">{dashVal(p.mutationStatus)}</Field>
            <Field label="Tax paid upto">{dashVal(p.taxPaidUpto)}</Field>
            <Field label="RERA">{dashVal(p.reraNo)}</Field>
            <Field label="Litigation">
              {p.litigation ? (
                <Chip size="small" color="error" label={`flagged${p.litigationNote ? ` · ${p.litigationNote}` : ''}`} />
              ) : (
                <Chip size="small" color="success" label="clear" />
              )}
            </Field>
          </FieldGrid>
        </SectionCard>
      </Box>
      {data.groupName && (
        <Box sx={{ mt: 1.5 }}>
          <SectionCard
            title={`Family — ${data.groupName}`}
            action={
              <Link component={RouterLink} to="/app/groups" variant="caption">
                Open group ›
              </Link>
            }
          >
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {data.members.length} member{data.members.length !== 1 ? 's' : ''} · {beneficiaries.length} heir
              {beneficiaries.length !== 1 ? 's' : ''} nominated
              {beneficiaries.length > 0 ? ` · ${round2(heirShare)}% share allocated` : ''}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {data.members.map((m, i) => (
                <Tooltip key={i} title={`${m.relation || 'member'} · ${m.status || 'pending'}`}>
                  <Chip
                    size="small"
                    variant="outlined"
                    color={m.isBeneficiary ? 'primary' : 'default'}
                    label={`${m.isSelf ? '⭐ ' : ''}${m.name}${m.isBeneficiary && m.sharePct ? ` · ${round2(m.sharePct)}%` : ''}`}
                  />
                </Tooltip>
              ))}
            </Box>
          </SectionCard>
        </Box>
      )}
    </Box>
  );

  const ownershipTab =
    (p.owners || []).length === 0 ? (
      <Typography variant="body2" color="text.secondary">
        No history
      </Typography>
    ) : (
      <Box>
        {(p.owners || []).map((o, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 1.25, py: 0.75 }}>
            <Box
              sx={{
                mt: 0.9,
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: o.isCurrent ? 'primary.main' : 'action.disabled',
                flexShrink: 0,
              }}
            />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {o.ownerName || '—'}{' '}
                {o.isCurrent && <Chip size="small" color="success" label="current" sx={{ ml: 0.5 }} />}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {o.mutationType}
                {o.mutationDate ? ' · ' + o.mutationDate : ''}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    );

  const filesTab = (
    <Box>
      <DocumentsList docs={[...photos.map((ph, i) => ({ id: `photo-${i}`, docType: 'photo', fileRef: ph.fileRef })), ...fileDocs]} emptyText="No documents linked to this parcel yet — upload from the Documents section." />
      {data.deeds.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography sx={{ fontWeight: 600, fontSize: 13, mb: 0.5 }}>Registered documents</Typography>
          {data.deeds.map((d) => (
            <Typography key={d.id} variant="body2" sx={{ py: 0.4 }}>
              📜 {String(d.docType || 'deed').replace(/_/g, ' ')} · Doc {d.documentNo}
              {d.regYear ? `/${d.regYear}` : ''}
              {d.sro ? ` · ${d.sro}` : ''}{' '}
              <Typography component="span" variant="caption" color="text.secondary">
                {d.ref}
              </Typography>
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 700, fontSize: 18 }}>
            Survey {p.surveyNo}
            {sub}
          </Typography>
          <StatusChip status={p.status} />
          <Chip size="small" color={p.classification === 'agri' ? 'success' : 'info'} label={p.classification || 'agri'} />
          <Typography variant="body2" color="text.secondary">
            {formatArea(Number(p.extent))}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            · {addressLine}
          </Typography>
          {isSample && (
            <Tooltip title="The live service is not reachable — showing bundled sample data.">
              <Chip size="small" variant="outlined" color="secondary" label="Sample data" />
            </Tooltip>
          )}
        </Box>
        <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => setEditOpen(true)}>
          Edit details
        </Button>
      </Box>
      <Tabs value={tab} onChange={(_e, val) => setTab(val)} sx={{ mb: 1.5, minHeight: 38, '& .MuiTab-root': { minHeight: 38, py: 0.5 } }} variant="scrollable" allowScrollButtonsMobile>
        <Tab label="Overview" value="overview" />
        <Tab label="Boundary & map" value="geo" />
        <Tab label={`Files (${fileDocs.length + data.deeds.length + photos.length})`} value="files" />
        <Tab label="Ownership history" value="ownership" />
        <Tab label="Notes" value="notes" />
        <Tab label="Audit log" value="audit" />
      </Tabs>
      {tab === 'overview' && overview}
      {tab === 'geo' && <GeoSection key={p.geoPoint} parcel={p} notify={notify} refresh={refresh} />}
      {tab === 'files' && filesTab}
      {tab === 'ownership' && ownershipTab}
      {tab === 'notes' && <NotesPanel entityType="parcel" entityId={id} />}
      {tab === 'audit' && <AuditTrailPanel target={id} />}
      <Box sx={{ mt: 2 }}>
        <Link component="button" variant="body2" onClick={() => navigate('/app/parcels')}>
          ← Back to Land &amp; Properties
        </Link>
      </Box>
      <EditParcelDialog parcel={p} open={editOpen} onClose={() => setEditOpen(false)} onSaved={refresh} notify={notify} />
      <Snackbar open={Boolean(toast)} autoHideDuration={4000} onClose={() => setToast(null)}>
        <Alert severity={toast?.err ? 'error' : 'success'} onClose={() => setToast(null)}>
          {toast?.msg}
        </Alert>
      </Snackbar>
    </>
  );
}
