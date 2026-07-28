'use client';

/**
 * Property 360 — functional-parity port of the predecessor pattadar app's
 * PropertyDetailView + EditPropertyModal (properties/*.tsx): header with
 * type icon/status chips + tax/EC attention badges, photo strip, property
 * record with type-driven attributes (TEXT JSON, ISO dates shown DD/MM/YYYY),
 * location, at-a-glance, financials, legal & compliance, owners table,
 * linked documents (property scope, My Drive preview/download), notes,
 * audit log, the full Edit dialog (updateProperty — field set + attribute
 * merge verbatim) and Delete (files → Trash, then back to Properties).
 */
import { useCallback, useMemo, useState } from 'react';
import { useParams, useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';
import { useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { sampleDocuments, sampleGroups, sampleProperties } from '@pattadar/core';
import { gql } from '../../api/client';
import { GeoMap } from '../../components/GeoMapLazy';
import { useLiveOrSample } from '../../data/useLiveOrSample';
import { deleteProperty } from '../../data/pattadarActions';
import { attributeFieldsFor, propertyTypeDef } from '../holdings/propertyTypes';
import {
  AuditTrailPanel,
  Field,
  FieldGrid,
  MediaHero,
  NotFoundCard,
  NotesPanel,
  SectionCard,
  StatusChip,
  dashVal,
  fmtDMY,
  money,
} from './common';
import { HeaderSkeleton, HeroSkeleton, TableSkeleton } from '../../components/Skeletons';
import type { LinkedDoc } from './common';
import { PropertyFilesPanel } from './PropertyFilesPanel';

// Field selection verbatim from the source PropertyDetailView (+ groupId so
// the Family / group row resolves — the API returns it for properties).
const FIELDS =
  'id type label address locality city district geoPoint landArea landUnit builtupArea builtupUnit acquisitionMode holdingStatus purchasePrice purchaseDate guidelineValue marketValue currentValue regDocNo sro regDate ghmcAssessmentNo khataNo reraNo ecStatus ecDate mutationStatus taxPaidUpto litigation litigationNote attributes notes createdAt groupId';

interface PropertyDetail {
  id: string;
  type: string;
  label: string;
  address: string;
  locality: string;
  city: string;
  district: string;
  geoPoint: string;
  landArea: number;
  landUnit: string;
  builtupArea: number;
  builtupUnit: string;
  acquisitionMode: string;
  holdingStatus: string;
  purchasePrice: number;
  purchaseDate: string;
  guidelineValue: number;
  marketValue: number;
  currentValue: number;
  regDocNo: string;
  sro: string;
  regDate: string;
  ghmcAssessmentNo: string;
  khataNo: string;
  reraNo: string;
  ecStatus: string;
  ecDate: string;
  mutationStatus: string;
  taxPaidUpto: string;
  litigation: boolean;
  litigationNote: string;
  attributes: string;
  notes: string;
  createdAt: string;
  groupId: string;
}

interface OwnerRow {
  id: string;
  ownerName: string;
  sharePct: number;
  role: string;
}

interface PropertyDetailData {
  property: PropertyDetail | null;
  owners: OwnerRow[];
  docs: LinkedDoc[];
  groupName: string;
}

function sampleFor(id: string): PropertyDetailData {
  const p = sampleProperties.find((x) => x.id === id);
  if (!p) return { property: null, owners: [], docs: [], groupName: '' };
  return {
    property: {
      id: p.id,
      type: p.type,
      label: p.label,
      address: '',
      locality: '',
      city: p.city,
      district: p.district,
      geoPoint: '',
      landArea: p.landArea,
      landUnit: p.landUnit,
      builtupArea: p.builtupArea,
      builtupUnit: p.builtupUnit,
      acquisitionMode: '',
      holdingStatus: p.holdingStatus,
      purchasePrice: p.purchasePrice,
      purchaseDate: '',
      guidelineValue: p.guidelineValue,
      marketValue: p.marketValue,
      currentValue: p.currentValue,
      regDocNo: '',
      sro: '',
      regDate: '',
      ghmcAssessmentNo: '',
      khataNo: '',
      reraNo: '',
      ecStatus: p.ecStatus,
      ecDate: p.ecDate,
      mutationStatus: '',
      taxPaidUpto: p.taxPaidUpto,
      litigation: p.litigation,
      litigationNote: '',
      attributes: p.attributes,
      notes: '',
      createdAt: p.createdAt,
      groupId: p.groupId || '',
    },
    owners: [],
    docs: sampleDocuments
      .filter((d) => d.propertyId === id)
      .map((d) => ({ id: d.id, docType: d.docType, fileRef: d.fileRef, tags: d.tags, createdAt: d.createdAt })),
    groupName: p.groupId ? sampleGroups.find((g) => g.id === p.groupId)?.name || '' : '',
  };
}

function usePropertyDetail(id: string) {
  return useLiveOrSample<PropertyDetailData>(
    `property:${id}`,
    async () => {
      const d = await gql<{
        property: PropertyDetail | null;
        propertyOwners: OwnerRow[];
        propertyDocuments: LinkedDoc[];
        groups: { id: string; name: string }[];
      }>(
        `query($id:String!){ property(id:$id){ ${FIELDS} } propertyOwners(propertyId:$id){ id ownerName sharePct role } propertyDocuments(propertyId:$id){ id docType tags fileRef } groups { id name } }`,
        { id },
      );
      return {
        property: d.property ?? null,
        owners: d.propertyOwners ?? [],
        docs: d.propertyDocuments ?? [],
        groupName: (d.groups ?? []).find((g) => g.id === (d.property?.groupId || ''))?.name || '',
      };
    },
    sampleFor(id),
  );
}

/** Days until an ISO date (negative = past); null when unset/invalid. */
function daysUntil(iso: string, today: Date): number | null {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  if (isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/** Tax/EC/litigation attention badges (rules from the source dashboard). */
function attentionBadges(p: PropertyDetail): { text: string; color: 'error' | 'warning' }[] {
  const out: { text: string; color: 'error' | 'warning' }[] = [];
  const today = new Date();
  if (p.litigation) out.push({ text: '⚖ litigation flagged', color: 'error' });
  const d = daysUntil(p.taxPaidUpto, today);
  if (d !== null && d < 0) out.push({ text: '🧾 property tax overdue', color: 'error' });
  else if (d !== null && d <= 60) out.push({ text: `🗓 tax due in ${d} days`, color: 'warning' });
  const ec = daysUntil(p.ecDate, today);
  if (p.ecDate && ec !== null && ec < -365) out.push({ text: '📄 EC check older than a year', color: 'warning' });
  return out;
}

// ── edit dialog (updateProperty verbatim, incl. attribute merge) ─────────

const HOLDING_STATUSES = ['under_purchase', 'agreement', 'registered', 'possession', 'owned', 'disputed', 'sold'];
const ACQUISITION_MODES = ['purchase', 'inherited', 'gift', 'settlement', 'self_built'];

const UPDATE_PROPERTY_MUT =
  `mutation($id:String!,$label:String,$address:String,$locality:String,$city:String,$district:String,` +
  `$landArea:Float,$builtupArea:Float,$holdingStatus:String,$acquisitionMode:String,` +
  `$purchasePrice:Float,$guidelineValue:Float,$marketValue:Float,$currentValue:Float,$purchaseDate:String,` +
  `$regDocNo:String,$sro:String,$regDate:String,$ghmcAssessmentNo:String,$khataNo:String,$reraNo:String,` +
  `$ecStatus:String,$ecDate:String,$mutationStatus:String,$taxPaidUpto:String,` +
  `$litigation:Boolean,$litigationNote:String,$attributes:String,$notes:String){ ` +
  `updateProperty(id:$id,label:$label,address:$address,locality:$locality,city:$city,district:$district,` +
  `landArea:$landArea,builtupArea:$builtupArea,holdingStatus:$holdingStatus,acquisitionMode:$acquisitionMode,` +
  `purchasePrice:$purchasePrice,guidelineValue:$guidelineValue,marketValue:$marketValue,currentValue:$currentValue,purchaseDate:$purchaseDate,` +
  `regDocNo:$regDocNo,sro:$sro,regDate:$regDate,ghmcAssessmentNo:$ghmcAssessmentNo,khataNo:$khataNo,reraNo:$reraNo,` +
  `ecStatus:$ecStatus,ecDate:$ecDate,mutationStatus:$mutationStatus,taxPaidUpto:$taxPaidUpto,` +
  `litigation:$litigation,litigationNote:$litigationNote,attributes:$attributes,notes:$notes){ id } }`;

type EditVals = Record<string, string> & { litigation?: never };

function editValsFrom(p: PropertyDetail): { vals: EditVals; litigation: boolean } {
  let attrs: Record<string, unknown> = {};
  try {
    attrs = p.attributes ? (JSON.parse(p.attributes) as Record<string, unknown>) : {};
  } catch {
    attrs = {};
  }
  const vals: EditVals = {
    label: p.label || '',
    address: p.address || '',
    locality: p.locality || '',
    city: p.city || '',
    district: p.district || '',
    holdingStatus: p.holdingStatus || '',
    acquisitionMode: p.acquisitionMode || '',
    landArea: Number(p.landArea) > 0 ? String(p.landArea) : '',
    builtupArea: Number(p.builtupArea) > 0 ? String(p.builtupArea) : '',
    purchasePrice: Number(p.purchasePrice) > 0 ? String(p.purchasePrice) : '',
    guidelineValue: Number(p.guidelineValue) > 0 ? String(p.guidelineValue) : '',
    marketValue: Number(p.marketValue) > 0 ? String(p.marketValue) : '',
    currentValue: Number(p.currentValue) > 0 ? String(p.currentValue) : '',
    purchaseDate: (p.purchaseDate || '').slice(0, 10),
    regDocNo: p.regDocNo || '',
    sro: p.sro || '',
    regDate: (p.regDate || '').slice(0, 10),
    ghmcAssessmentNo: p.ghmcAssessmentNo || '',
    khataNo: p.khataNo || '',
    reraNo: p.reraNo || '',
    ecStatus: p.ecStatus || '',
    ecDate: (p.ecDate || '').slice(0, 10),
    mutationStatus: p.mutationStatus || '',
    taxPaidUpto: (p.taxPaidUpto || '').slice(0, 10),
    litigationNote: p.litigationNote || '',
    notes: p.notes || '',
  };
  for (const f of attributeFieldsFor(p.type)) {
    if (attrs[f.key] !== undefined) vals[`attr_${f.key}`] = String(attrs[f.key]);
  }
  return { vals, litigation: !!p.litigation };
}

function EditPropertyDialog({
  property,
  open,
  onClose,
  onSaved,
  notify,
}: {
  property: PropertyDetail;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  notify: (m: string, err?: boolean) => void;
}) {
  const seeded = useMemo(() => editValsFrom(property), [property]);
  const [v, setV] = useState<EditVals>(seeded.vals);
  const [litigation, setLitigation] = useState(seeded.litigation);
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setV((old) => ({ ...old, [k]: e.target.value }));

  const [seedKey, setSeedKey] = useState('');
  if (open && seedKey !== property.id + String(open)) {
    setSeedKey(property.id + String(open));
    setV(editValsFrom(property).vals);
    setLitigation(!!property.litigation);
  }

  const save = async () => {
    if (!v.label.trim()) {
      notify('Name / label is required', true);
      return;
    }
    setSaving(true);
    try {
      // Preserve non-type-field attribute keys (boundaries, deed_type, …)
      // written by Add Property — start from the original blob, then
      // overlay/clear the editable type fields (verbatim source logic).
      let attributes: Record<string, unknown> = {};
      try {
        attributes = property.attributes ? (JSON.parse(property.attributes) as Record<string, unknown>) : {};
      } catch {
        attributes = {};
      }
      for (const f of attributeFieldsFor(property.type)) {
        const val = v[`attr_${f.key}`];
        if (val !== undefined && val !== '') attributes[f.key] = f.input === 'number' ? Number(val) || val : val;
        else delete attributes[f.key];
      }
      await gql(UPDATE_PROPERTY_MUT, {
        id: property.id,
        label: v.label || '',
        address: v.address || '',
        locality: v.locality || '',
        city: v.city || '',
        district: v.district || '',
        landArea: Number(v.landArea) || 0,
        builtupArea: Number(v.builtupArea) || 0,
        holdingStatus: v.holdingStatus || '',
        acquisitionMode: v.acquisitionMode || '',
        purchasePrice: Number(v.purchasePrice) || 0,
        guidelineValue: Number(v.guidelineValue) || 0,
        marketValue: Number(v.marketValue) || 0,
        currentValue: Number(v.currentValue) || 0,
        purchaseDate: v.purchaseDate || '',
        regDocNo: v.regDocNo || '',
        sro: v.sro || '',
        regDate: v.regDate || '',
        ghmcAssessmentNo: v.ghmcAssessmentNo || '',
        khataNo: v.khataNo || '',
        reraNo: v.reraNo || '',
        ecStatus: v.ecStatus || '',
        ecDate: v.ecDate || '',
        mutationStatus: v.mutationStatus || '',
        taxPaidUpto: v.taxPaidUpto || '',
        litigation,
        litigationNote: v.litigationNote || '',
        attributes: JSON.stringify(attributes),
        notes: v.notes || '',
      });
      notify('Property saved');
      onSaved();
      onClose();
    } catch {
      notify('Could not save changes', true);
    } finally {
      setSaving(false);
    }
  };

  const attrFields = attributeFieldsFor(property.type);
  const def = propertyTypeDef(property.type);
  const half = { flex: '1 1 46%', minWidth: 200 };
  const row = { display: 'flex', gap: 1.5, flexWrap: 'wrap' as const, mb: 1.5 };
  const dateProps = { type: 'date' as const, slotProps: { inputLabel: { shrink: true } } };
  const section = (t: string) => (
    <Divider textAlign="left" sx={{ my: 1.5 }}>
      <Typography variant="caption" color="text.secondary">
        {t}
      </Typography>
    </Divider>
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Edit property</DialogTitle>
      <DialogContent dividers sx={{ maxHeight: '70vh' }}>
        {section('Identity')}
        <Box sx={row}>
          <TextField required size="small" label="Name / Label" value={v.label} onChange={set('label')} sx={half} />
          <TextField size="small" label="Address" value={v.address} onChange={set('address')} sx={half} />
          <TextField size="small" label="Locality" value={v.locality} onChange={set('locality')} sx={half} />
          <TextField size="small" label="City" value={v.city} onChange={set('city')} sx={half} />
          <TextField size="small" label="District" value={v.district} onChange={set('district')} sx={half} />
          <TextField select size="small" label="Holding Status" value={v.holdingStatus} onChange={set('holdingStatus')} sx={half}>
            <MenuItem value="">—</MenuItem>
            {HOLDING_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label="Acquisition Mode" value={v.acquisitionMode} onChange={set('acquisitionMode')} sx={half}>
            <MenuItem value="">—</MenuItem>
            {ACQUISITION_MODES.map((s) => (
              <MenuItem key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        {section('Area')}
        <Box sx={row}>
          <TextField size="small" type="number" label="Land Area (Sq.yd)" value={v.landArea} onChange={set('landArea')} sx={half} />
          <TextField size="small" type="number" label="Built-up Area (Sq.ft)" value={v.builtupArea} onChange={set('builtupArea')} sx={half} />
        </Box>
        {section('Valuation (₹)')}
        <Box sx={row}>
          <TextField size="small" type="number" label="Purchase Price" value={v.purchasePrice} onChange={set('purchasePrice')} sx={half} />
          <TextField size="small" type="number" label="Guideline Value" value={v.guidelineValue} onChange={set('guidelineValue')} sx={half} />
          <TextField size="small" type="number" label="Market Value" value={v.marketValue} onChange={set('marketValue')} sx={half} />
          <TextField size="small" type="number" label="Current Value" value={v.currentValue} onChange={set('currentValue')} sx={half} />
          <TextField size="small" label="Purchase Date" value={v.purchaseDate} onChange={set('purchaseDate')} sx={half} {...dateProps} />
        </Box>
        {section('Registration')}
        <Box sx={row}>
          <TextField size="small" label="Registration Doc No." value={v.regDocNo} onChange={set('regDocNo')} sx={half} />
          <TextField size="small" label="SRO" value={v.sro} onChange={set('sro')} sx={half} />
          <TextField size="small" label="Registration Date" value={v.regDate} onChange={set('regDate')} sx={half} {...dateProps} />
        </Box>
        {section('Municipal & legal')}
        <Box sx={row}>
          <TextField size="small" label="GHMC Assessment No." value={v.ghmcAssessmentNo} onChange={set('ghmcAssessmentNo')} sx={half} />
          <TextField size="small" label="Khata No." value={v.khataNo} onChange={set('khataNo')} sx={half} />
          <TextField size="small" label="RERA No." value={v.reraNo} onChange={set('reraNo')} sx={half} />
          <TextField size="small" label="EC Status" helperText="'clear' = no encumbrance" value={v.ecStatus} onChange={set('ecStatus')} sx={half} />
          <TextField size="small" label="EC Date" value={v.ecDate} onChange={set('ecDate')} sx={half} {...dateProps} />
          <TextField size="small" label="Mutation Status" value={v.mutationStatus} onChange={set('mutationStatus')} sx={half} />
          <TextField size="small" label="Property tax paid up to" value={v.taxPaidUpto} onChange={set('taxPaidUpto')} sx={half} {...dateProps} />
        </Box>
        <FormControlLabel
          control={<Checkbox checked={litigation} onChange={(e) => setLitigation(e.target.checked)} />}
          label="Under litigation"
        />
        <TextField fullWidth size="small" label="Litigation Note" value={v.litigationNote} onChange={set('litigationNote')} sx={{ mt: 1, mb: 0.5 }} />
        {attrFields.length > 0 && (
          <>
            {section(`${def.label} details`)}
            <Box sx={row}>
              {attrFields.map((f) => (
                <TextField
                  key={f.key}
                  size="small"
                  type={f.input === 'number' ? 'number' : 'text'}
                  label={f.label}
                  value={v[`attr_${f.key}`] ?? ''}
                  onChange={set(`attr_${f.key}`)}
                  sx={half}
                />
              ))}
            </Box>
          </>
        )}
        {section('Notes')}
        <TextField fullWidth size="small" multiline minRows={2} value={v.notes} onChange={set('notes')} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── page ─────────────────────────────────────────────────────────────────

export function PropertyDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isSample, isLoading } = usePropertyDetail(id);
  const [tab, setTab] = useState('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);

  const notify = useCallback((msg: string, err = false) => setToast({ msg, err }), []);
  const refresh = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: ['pattadar'] }),
    [queryClient],
  );

  // Shaped loading state (M3: no lone spinners) — header, hero, fields.
  if (isLoading)
    return (
      <>
        <HeaderSkeleton />
        <HeroSkeleton height={240} />
        <TableSkeleton rows={4} />
      </>
    );
  const p = data.property;
  if (!p)
    return <NotFoundCard what="Property" backTo="/app/parcels?tab=properties" backLabel="Back to Land & Properties" />;

  const def = propertyTypeDef(p.type);
  let attrs: Record<string, unknown> = {};
  try {
    attrs = p.attributes ? (JSON.parse(p.attributes) as Record<string, unknown>) : {};
  } catch {
    attrs = {};
  }
  const attrRows = def.attributeFields.filter((f) => attrs[f.key] !== undefined);
  const isPhoto = (d: LinkedDoc) => d.docType === 'photo' || d.tags === 'photo';
  const isVideo = (d: LinkedDoc) => d.docType === 'video' || d.tags === 'video';
  const photos = data.docs.filter((d) => isPhoto(d) && d.fileRef).map((d) => ({ fileRef: d.fileRef, name: 'Photo' })).reverse();
  const videos = data.docs.filter((d) => isVideo(d) && d.fileRef).map((d) => ({ fileRef: d.fileRef, name: 'Video' })).reverse();
  const extentLabel = p.landArea
    ? `${p.landArea} ${p.landUnit}`
    : p.builtupArea
      ? `${p.builtupArea} ${p.builtupUnit}`
      : '—';
  const addressLine = [p.address, p.locality, p.city, p.district].filter(Boolean).join(', ') || '—';
  const ownerName = data.owners.find((o) => o.role === 'owner')?.ownerName || data.owners[0]?.ownerName || 'You';
  const badges = attentionBadges(p);
  // Most-specific-first candidates — GeoMap stops at the first that geocodes
  // (source parity: PropertyDetailView mapQuery).
  const mapQuery = [
    [p.address, p.locality, p.city],
    [p.locality, p.city, p.district],
    [p.city, p.district],
    [p.district],
  ]
    .map((parts) => parts.filter(Boolean).join(', '))
    .filter((s, i, a) => s && a.indexOf(s) === i)
    .map((s) => `${s}, India`);

  const mapTab = (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {p.geoPoint ? 'Stored location.' : `Approximate area — ${addressLine}.`}
      </Typography>
      <GeoMap value={p.geoPoint || undefined} readOnly showSearch={false} height={430} label={p.label || 'Property'} autoLocate={mapQuery} />
    </Box>
  );

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
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' }, gap: 1.5 }}>
        <SectionCard title="Property record">
          <FieldGrid>
            <Field label="Name / label">{dashVal(p.label)}</Field>
            <Field label="Type">
              <Chip size="small" color="info" label={def.label} />
            </Field>
            {p.landArea ? <Field label="Land area">{`${p.landArea} ${p.landUnit}`}</Field> : null}
            {p.builtupArea ? <Field label="Built-up area">{`${p.builtupArea} ${p.builtupUnit}`}</Field> : null}
            <Field label="Status">
              <StatusChip status={p.holdingStatus} />
            </Field>
            <Field label="Current owner">{ownerName}</Field>
            <Field label="Family / group">
              {data.groupName ? (
                <Link component={RouterLink} href="/app/groups">
                  👪 {data.groupName}
                </Link>
              ) : (
                'Personal'
              )}
            </Field>
            <Field label="Acquisition">{String(p.acquisitionMode || 'purchase').replace(/_/g, ' ')}</Field>
            <Field label="Khata no.">{dashVal(p.khataNo)}</Field>
            <Field label="GHMC assessment">{dashVal(p.ghmcAssessmentNo)}</Field>
            <Field label="Added on">{fmtDMY(String(p.createdAt || '').slice(0, 10))}</Field>
          </FieldGrid>
          {attrRows.length > 0 && (
            <>
              <Typography sx={{ fontWeight: 600, fontSize: 13, mt: 1.25, mb: 0.5 }}>{def.label} details</Typography>
              <FieldGrid>
                {attrRows.map((f) => (
                  <Field key={f.key} label={f.label}>
                    {String(attrs[f.key])}
                  </Field>
                ))}
              </FieldGrid>
            </>
          )}
        </SectionCard>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <SectionCard title="Location">
            <FieldGrid columns={1}>
              {p.address ? <Field label="Street / door">{p.address}</Field> : null}
              {p.locality ? <Field label="Locality">{p.locality}</Field> : null}
              <Field label="City">{dashVal(p.city)}</Field>
              <Field label="District">{dashVal(p.district)}</Field>
            </FieldGrid>
          </SectionCard>
          <SectionCard title="At a glance">
            <Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap' }}>
              {glance(data.owners.length, 'Owners on record', 'owners')}
              {glance(data.docs.length, 'Files', 'files')}
            </Box>
          </SectionCard>
        </Box>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 1.5, mt: 1.5 }}>
        <SectionCard title="Financials">
          <FieldGrid columns={1}>
            <Field label="Purchase price (invested)">{money(p.purchasePrice)}</Field>
            <Field label="Purchase date">{fmtDMY(p.purchaseDate)}</Field>
            <Field label="Guideline (SRO) value">{money(p.guidelineValue)}</Field>
            <Field label="Current market value">{money(p.marketValue || p.currentValue)}</Field>
            <Field label="Tax paid upto">{fmtDMY(p.taxPaidUpto)}</Field>
          </FieldGrid>
        </SectionCard>
        <SectionCard title="Legal & compliance">
          <FieldGrid columns={1}>
            <Field label="Registration doc no.">{`${dashVal(p.regDocNo)}${p.sro ? ` · ${p.sro}` : ''}${p.regDate ? ` · ${fmtDMY(p.regDate)}` : ''}`}</Field>
            <Field label="EC status">{`${dashVal(p.ecStatus)}${p.ecDate ? ` · ${fmtDMY(p.ecDate)}` : ''}`}</Field>
            <Field label="Mutation status">{dashVal(p.mutationStatus)}</Field>
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
      {p.notes ? (
        <Box sx={{ mt: 1.5 }}>
          <SectionCard title="Record notes">
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {p.notes}
            </Typography>
          </SectionCard>
        </Box>
      ) : null}
    </Box>
  );

  const ownersTab =
    data.owners.length === 0 ? (
      <Typography variant="body2" color="text.secondary">
        No owners on record
      </Typography>
    ) : (
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Owner</TableCell>
            <TableCell>Role</TableCell>
            <TableCell>Share %</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.owners.map((o) => (
            <TableRow key={o.id}>
              <TableCell>{o.ownerName || 'You'}</TableCell>
              <TableCell>{o.role}</TableCell>
              <TableCell>{o.sharePct}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {/* The record page's single <h1>. */}
          <Typography variant="h6" component="h1">
            {def.icon} {p.label || 'Property'}
          </Typography>
          <StatusChip status={p.holdingStatus} />
          <Chip size="small" color="info" label={def.label} />
          <Typography variant="body2" color="text.secondary">
            {extentLabel}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            · {addressLine}
          </Typography>
          {badges.map((b) => (
            <Chip key={b.text} size="small" color={b.color} variant="outlined" label={b.text} />
          ))}
          {isSample && (
            <Tooltip title="The live service is not reachable — showing bundled sample data.">
              <Chip size="small" variant="outlined" color="secondary" label="Sample data" />
            </Tooltip>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => setEditOpen(true)}>
            Edit details
          </Button>
          <Button color="error" onClick={() => setDeleteOpen(true)}>
            Delete
          </Button>
        </Box>
      </Box>
      {/* Newest photo/video as a full-width cover above the tabs (source parity). */}
      <MediaHero photos={photos} videos={videos} fallbackIcon={def.icon || '🏢'} onGoFiles={() => setTab('files')} />
      <Tabs value={tab} onChange={(_e, val) => setTab(val)} sx={{ mb: 1.5, minHeight: 38, '& .MuiTab-root': { minHeight: 38, py: 0.5 } }} variant="scrollable" allowScrollButtonsMobile>
        <Tab label="Overview" value="overview" />
        <Tab label="Map" value="map" />
        <Tab label={`Files (${data.docs.length})`} value="files" />
        <Tab label="Owners" value="owners" />
        <Tab label="Notes" value="notes" />
        <Tab label="Audit log" value="audit" />
      </Tabs>
      {tab === 'overview' && overview}
      {tab === 'map' && mapTab}
      {tab === 'files' && <PropertyFilesPanel scope={{ kind: 'property', propertyId: id }} />}
      {tab === 'owners' && ownersTab}
      {tab === 'notes' && <NotesPanel entityType="property" entityId={id} />}
      {tab === 'audit' && <AuditTrailPanel target={id} />}
      <Box sx={{ mt: 2 }}>
        <Link component="button" variant="body2" onClick={() => router.push('/app/parcels?tab=properties')}>
          ← Back to Land &amp; Properties
        </Link>
      </Box>
      <EditPropertyDialog property={p} open={editOpen} onClose={() => setEditOpen(false)} onSaved={refresh} notify={notify} />
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Delete {p.label || 'this property'}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Its documents are also removed — files go to My Drive Trash. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleting}
            onClick={() => {
              setDeleting(true);
              void deleteProperty(id)
                .then(() => {
                  refresh();
                  router.push('/app/parcels?tab=properties');
                })
                .catch(() => notify("Couldn't delete — try again", true))
                .finally(() => {
                  setDeleting(false);
                  setDeleteOpen(false);
                });
            }}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={Boolean(toast)} autoHideDuration={4000} onClose={() => setToast(null)}>
        <Alert severity={toast?.err ? 'error' : 'success'} onClose={() => setToast(null)}>
          {toast?.msg}
        </Alert>
      </Snackbar>
    </>
  );
}
