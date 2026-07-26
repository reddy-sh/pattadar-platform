/**
 * Passbook record — functional-parity port of the rhub pattadar app's
 * PassbookDetailView (RemoteApp.tsx): holder header card (photo upload →
 * square-crop → setPassbookPhoto, owner + khata + father/husband + address +
 * ref), stat tiles (Parcels / Total extent / Land type / Created), the
 * linked-parcels table (survey links, extents via formatArea, cost/acre,
 * class, owner, location, owners count + extent total), CSV/Excel/PDF export
 * and the fixed-khata Add-parcel dialog (createParcel + optional cost/acre →
 * purchasePrice).
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import { formatArea, sampleParcels, samplePassbooks, toAcres, unitKey } from '@pattadar/core';
import type { UnitKey } from '@pattadar/core';
import { gql } from '../../api/client';
import { avaColor, fmtLocal } from '../../lib/format';
import { useLiveOrSample } from '../../data/useLiveOrSample';
import { CREATE_PARCEL_MANUAL_MUT } from '../../data/pattadarActions';
import { StatCard } from '../../components/holdingCards';
import { ExportMenu } from '../../export/ExportMenu';
import type { ExportBrand, ExportCol } from '../../export/ExportMenu';
import { NotFoundCard } from './common';

const PARCEL_UNIT_OPTIONS: { value: UnitKey; label: string }[] = [
  { value: 'acre', label: 'Acres' },
  { value: 'cent', label: 'Cents' },
  { value: 'gunta', label: 'Guntas' },
  { value: 'sqyd', label: 'Sq. yards' },
  { value: 'sqft', label: 'Sq. feet' },
  { value: 'hectare', label: 'Hectares' },
  { value: 'ankanam', label: 'Ankanam' },
];

const ACQUISITION_SOURCES = ['sale', 'gift', 'inheritance', 'partition', 'will', 'grant'];

interface PbRecord {
  id: string;
  ref: string;
  pattadarNo: string;
  ownerName: string;
  fatherHusbandName: string;
  state: string;
  district: string;
  mandal: string;
  village: string;
  photo: string;
  createdAt: string;
}

interface PbParcel {
  id: string;
  ref: string;
  surveyNo: string;
  subdivision: string;
  extent: number;
  unit: string;
  classification: string;
  acquisitionSource: string;
  geoPoint: string;
  currentOwner: string;
  purchasePrice: number;
  marketValue: number;
  status: string;
  litigation: boolean;
  owners: { ownerName: string; isCurrent: boolean }[];
}

interface PassbookDetailData {
  passbook: PbRecord | null;
  parcels: PbParcel[];
}

// Query verbatim from the source PassbookDetailView.load.
const PASSBOOK_QUERY = `query($id: String!) {
  passbook(id: $id) { id ref pattadarNo ownerName fatherHusbandName state district mandal village photo createdAt }
  parcelsByPassbook(passbookId: $id) { id ref surveyNo subdivision extent unit classification acquisitionSource geoPoint currentOwner purchasePrice marketValue status litigation owners { ownerName isCurrent } }
}`;

/** Parcel extents are normalized to acres, so cost/acre is price ÷ extent. */
const costPerAcre = (price: number, acres: number): number =>
  Number(price) > 0 && Number(acres) > 0 ? Math.round(Number(price) / Number(acres)) : 0;

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

/** Centre-crop an image file to a square JPEG data-URL (source shared.ts). */
function cropSquareDataUrl(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('no ctx'));
        return;
      }
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('load failed'));
    };
    img.src = url;
  });
}

function sampleFor(id: string): PassbookDetailData {
  const b = samplePassbooks.find((x) => x.id === id);
  if (!b) return { passbook: null, parcels: [] };
  return {
    passbook: {
      id: b.id,
      ref: b.ref,
      pattadarNo: b.pattadarNo,
      ownerName: b.ownerName,
      fatherHusbandName: b.fatherHusbandName,
      state: b.state,
      district: b.district,
      mandal: b.mandal,
      village: b.village,
      photo: b.photo,
      createdAt: b.createdAt,
    },
    parcels: sampleParcels
      .filter((p) => p.passbookId === id)
      .map((p) => ({
        id: p.id,
        ref: p.ref,
        surveyNo: p.surveyNo,
        subdivision: p.subdivision,
        extent: p.extent,
        unit: p.unit,
        classification: p.classification,
        acquisitionSource: '',
        geoPoint: p.geoPoint || '',
        currentOwner: p.currentOwner,
        purchasePrice: p.purchasePrice,
        marketValue: p.marketValue,
        status: p.status,
        litigation: p.litigation,
        owners: [],
      })),
  };
}

function usePassbookDetail(id: string) {
  return useLiveOrSample<PassbookDetailData>(
    `passbook:${id}`,
    async () => {
      const d = await gql<{ passbook: PbRecord | null; parcelsByPassbook: PbParcel[] }>(PASSBOOK_QUERY, { id });
      return { passbook: d.passbook ?? null, parcels: d.parcelsByPassbook ?? [] };
    },
    sampleFor(id),
  );
}

// ── fixed-khata Add-parcel dialog ────────────────────────────────────────

function AddParcelHereDialog({
  passbookId,
  khata,
  open,
  onClose,
  onCreated,
  notify,
}: {
  passbookId: string;
  khata: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  notify: (m: string, err?: boolean) => void;
}) {
  const [v, setV] = useState({
    surveyNo: '',
    subdivision: '',
    extent: '',
    unit: 'acre' as UnitKey,
    classification: 'agri',
    acquisitionSource: 'sale',
    costPerAcre: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((old) => ({ ...old, [k]: e.target.value }));

  const save = async () => {
    if (!v.surveyNo.trim() || !(Number(v.extent) > 0)) {
      notify('Survey number and extent are required', true);
      return;
    }
    setSaving(true);
    try {
      const extentAcres = toAcres(parseFloat(v.extent), unitKey(v.unit));
      const data = await gql<{ createParcel: { id: string } }>(CREATE_PARCEL_MANUAL_MUT, {
        passbookId,
        surveyNo: v.surveyNo,
        subdivision: v.subdivision || '',
        extent: extentAcres,
        unit: v.unit,
        classification: v.classification,
        acquisitionSource: v.acquisitionSource,
      });
      const pid = data?.createParcel?.id;
      if (pid && Number(v.costPerAcre) > 0) {
        await gql(`mutation($id: String!, $purchasePrice: Float!) { updateParcel(id: $id, purchasePrice: $purchasePrice) { id } }`, {
          id: pid,
          purchasePrice: Math.round(Number(v.costPerAcre) * extentAcres),
        });
      }
      notify('Parcel added');
      setV({ surveyNo: '', subdivision: '', extent: '', unit: 'acre', classification: 'agri', acquisitionSource: 'sale', costPerAcre: '' });
      onCreated();
      onClose();
    } catch {
      notify("Couldn't add the parcel — try again", true);
    } finally {
      setSaving(false);
    }
  };

  const half = { flex: '1 1 46%', minWidth: 180 };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Add parcel · Khata {khata}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 0.5 }}>
          <TextField required size="small" label="Survey Number" value={v.surveyNo} onChange={set('surveyNo')} sx={half} />
          <TextField size="small" label="Sub-division" value={v.subdivision} onChange={set('subdivision')} sx={half} />
          <TextField required size="small" type="number" label="Extent" value={v.extent} onChange={set('extent')} sx={half} />
          <TextField select size="small" label="Unit" value={v.unit} onChange={set('unit')} sx={half}>
            {PARCEL_UNIT_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label="Classification" value={v.classification} onChange={set('classification')} sx={half}>
            <MenuItem value="agri">Agricultural</MenuItem>
            <MenuItem value="non-agri">Non-Agricultural</MenuItem>
          </TextField>
          <TextField select size="small" label="Acquisition Source" value={v.acquisitionSource} onChange={set('acquisitionSource')} sx={half}>
            {ACQUISITION_SOURCES.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            type="number"
            label="Cost per acre (₹)"
            helperText="Optional — saved as acquisition cost (extent × cost/acre)"
            value={v.costPerAcre}
            onChange={set('costPerAcre')}
            sx={half}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void save()} disabled={saving}>
          {saving ? 'Adding…' : 'Add parcel'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── page ─────────────────────────────────────────────────────────────────

export function PassbookDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isSample, isLoading } = usePassbookDetail(id);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const notify = useCallback((msg: string, err = false) => setToast({ msg, err }), []);
  const refresh = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: ['pattadar'] }),
    [queryClient],
  );

  const uploadPhoto = useCallback(
    async (file: File) => {
      try {
        const dataUrl = await cropSquareDataUrl(file, 256);
        await gql(`mutation($id:String!,$photo:String!){ setPassbookPhoto(id:$id, photo:$photo) }`, {
          id,
          photo: dataUrl,
        });
        notify('Photo updated');
        refresh();
      } catch {
        notify('Could not process image', true);
      }
    },
    [id, notify, refresh],
  );

  const parcels = data.parcels;
  const totalExtent = useMemo(() => parcels.reduce((s, p) => s + (Number(p.extent) || 0), 0), [parcels]);
  const landType = useMemo(() => {
    const cls = Array.from(new Set(parcels.map((p) => p.classification).filter(Boolean)));
    if (cls.length === 0) return '—';
    if (cls.length === 1) return cls[0] === 'agri' ? 'Agricultural' : String(cls[0]);
    return 'Mixed';
  }, [parcels]);

  if (isLoading)
    return (
      <Box sx={{ minHeight: '40vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress aria-label="Loading" />
      </Box>
    );
  const pb = data.passbook;
  if (!pb) return <NotFoundCard what="Passbook" backTo="/app/passbooks" backLabel="Back to Passbooks" />;

  const address = [pb.village, pb.mandal, pb.district, pb.state].filter(Boolean).join(', ') || '—';

  const exportCols: ExportCol<PbParcel>[] = [
    { key: 'surveyNo', title: 'Survey No.', fmt: (_v, r) => `${r.surveyNo}${r.subdivision ? '/' + r.subdivision : ''}` },
    { key: 'extent', title: 'Extent', fmt: (_v, r) => formatArea(Number(r.extent)) },
    {
      key: 'purchasePrice',
      title: 'Cost / Acre (₹)',
      fmt: (_v, r) => {
        const c = costPerAcre(r.purchasePrice, r.extent);
        return c ? c.toLocaleString('en-IN') : '';
      },
    },
    { key: 'classification', title: 'Class' },
    { key: 'currentOwner', title: 'Current Owner' },
    { key: 'geoPoint', title: 'Location', fmt: (v) => (v ? geoLabel(String(v)) : '') },
  ];
  const exportBrand: ExportBrand = {
    brand: 'Pattadar',
    title: `Passbook ${pb.pattadarNo} — Parcel Register`,
    subtitle: 'Andhra Pradesh / Telangana Land Records',
    watermark: 'PATTADAR',
  };

  return (
    <>
      {/* Holder header card. */}
      <Card sx={{ p: 2.25, mb: 1.5 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Tooltip title="Click to set / replace photo">
            <Avatar
              variant="rounded"
              src={pb.photo || undefined}
              onClick={() => photoInputRef.current?.click()}
              sx={{
                width: 72,
                height: 72,
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 28,
                bgcolor: avaColor(pb.ownerName || '?'),
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              }}
            >
              {(pb.ownerName || '?').slice(0, 1).toUpperCase()}
            </Avatar>
          </Tooltip>
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography sx={{ fontWeight: 700, fontSize: 20 }}>
                {pb.ownerName || '(owner not set)'}
              </Typography>
              <Chip size="small" color="info" label={`Khata ${pb.pattadarNo}`} />
              {isSample && (
                <Tooltip title="The live service is not reachable — showing bundled sample data.">
                  <Chip size="small" variant="outlined" color="secondary" label="Sample data" />
                </Tooltip>
              )}
            </Box>
            {pb.fatherHusbandName && (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                <Typography component="span" variant="body2" color="text.secondary">
                  Father / Husband:{' '}
                </Typography>
                {pb.fatherHusbandName}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              📍 {address}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block', overflowWrap: 'anywhere' }}>
              {pb.ref}
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
            Add parcel
          </Button>
        </Box>
      </Card>

      {/* Stat tiles. */}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
        <StatCard label="Parcels" value={parcels.length} />
        <StatCard label="Total extent" value={formatArea(totalExtent)} />
        <StatCard label="Land type" value={landType} />
        <StatCard label="Created" value={fmtLocal(pb.createdAt, { dateOnly: true })} />
      </Box>

      {/* Linked parcels table with totals + export. */}
      <Card sx={{ p: 1.75 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 1 }}>
          <Typography sx={{ fontWeight: 600, fontSize: 14 }}>Land parcels ({parcels.length})</Typography>
          <ExportMenu filename={`pattadar-passbook-${pb.pattadarNo}`} brand={exportBrand} cols={exportCols} rows={parcels} />
        </Box>
        {parcels.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No parcels under this passbook yet — upload a deed to add one
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Survey No.</TableCell>
                  <TableCell>Extent</TableCell>
                  <TableCell>Cost / Acre</TableCell>
                  <TableCell>Class</TableCell>
                  <TableCell>Current Owner</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell>Owners</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {parcels.map((r) => {
                  const c = costPerAcre(r.purchasePrice, r.extent);
                  return (
                    <TableRow key={r.id} hover>
                      <TableCell>
                        <Link component={RouterLink} to={`/app/parcels/${r.id}`} underline="hover" sx={{ fontWeight: 600 }}>
                          {r.surveyNo}
                          {r.subdivision ? '/' + r.subdivision : ''}
                        </Link>
                      </TableCell>
                      <TableCell>{formatArea(Number(r.extent))}</TableCell>
                      <TableCell>{c ? `₹${c.toLocaleString('en-IN')}` : '—'}</TableCell>
                      <TableCell>
                        <Chip size="small" color={r.classification === 'agri' ? 'success' : 'info'} variant="outlined" label={r.classification || 'agri'} />
                      </TableCell>
                      <TableCell>{r.currentOwner || '—'}</TableCell>
                      <TableCell>{r.geoPoint ? `📍 ${geoLabel(r.geoPoint)}` : '—'}</TableCell>
                      <TableCell>{(r.owners || []).length}</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Total</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{formatArea(totalExtent)}</TableCell>
                  <TableCell colSpan={5} />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
        <Link component="button" variant="body2" onClick={() => navigate('/app/passbooks')}>
          ← Back to Passbooks
        </Link>
        <Link component="button" variant="body2" onClick={() => navigate(`/app/parcels?pb=${id}`)}>
          Open land parcels ›
        </Link>
      </Box>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void uploadPhoto(f);
        }}
      />
      <AddParcelHereDialog
        passbookId={id}
        khata={pb.pattadarNo}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={refresh}
        notify={notify}
      />
      <Snackbar open={Boolean(toast)} autoHideDuration={4000} onClose={() => setToast(null)}>
        <Alert severity={toast?.err ? 'error' : 'success'} onClose={() => setToast(null)}>
          {toast?.msg}
        </Alert>
      </Snackbar>
    </>
  );
}
