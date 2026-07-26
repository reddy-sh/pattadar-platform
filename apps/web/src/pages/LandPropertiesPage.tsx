/**
 * Land & Properties — functional-parity port of the rhub pattadar app's
 * combined HoldingsView + AllHoldingsView: "<n> holdings" header, per-tab
 * stat tiles, All / Land Parcels / Properties tabs, search, quick filters
 * (kind / status / stake / family / passbook), List/Grid modes, CSV/Excel/PDF
 * export, status+stake badges on emerald hero cards, and the Add flows
 * (AI-classified Add for properties/deeds, manual Add Parcel).
 *
 * Deep links: /app/parcels?pb=<passbookId> lands on Land Parcels filtered to
 * that khata; ?group=<groupId> pre-filters by family; ?tab=properties opens
 * the Properties tab (the old /app/properties route redirects here).
 */
import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import FilterListIcon from '@mui/icons-material/FilterList';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import SearchIcon from '@mui/icons-material/Search';
import ViewListOutlinedIcon from '@mui/icons-material/ViewListOutlined';
import { formatArea } from '@pattadar/core';
import { CardActionsMenu, CardHero, EmptyLanding, StatCard, StatRow, clickableCardSx, parcelPill, stakePill } from '../components/holdingCards';
import { CardGridSkeleton, HeaderSkeleton, StatRowSkeleton } from '../components/Skeletons';
import { stickyHeadSx } from '../components/tableSx';
import { PageHeader } from '../components/PageHeader';
import { ExportMenu } from '../export/ExportMenu';
import type { ExportBrand, ExportCol } from '../export/ExportMenu';
import { useHoldings } from '../data/hooks';
import { deleteParcel, deleteProperty } from '../data/pattadarActions';
import { STORAGE_OFFLINE_MSG, uploadCoverPhoto } from './documents/storage';
import { AddParcelDialog } from './holdings/AddParcelDialog';
import { AddPropertyDialog } from './holdings/AddPropertyDialog';
import { LocationDialog } from './holdings/LocationDialog';
import type { LocationTarget } from './holdings/LocationDialog';
import { StakeDialog } from './holdings/StakeDialog';
import type { StakeTarget } from './holdings/StakeDialog';
import { propertyTypeDef } from './holdings/propertyTypes';

/** One normalized row — a land parcel and a property render the same way. */
interface Holding {
  id: string;
  kind: 'parcel' | 'property';
  title: string;
  owner: string;
  location: string;
  extentLabel: string;
  value: number;
  perAc: number;
  status: string;
  litigation: boolean;
  stake: string;
  typeLabel: string;
  typeColor: 'success' | 'info';
  icon: string;
  cover?: string;
  createdAt: string;
  geoPoint: string;
  passbookId: string;
  passbook: string;
  khata: string;
  groupName: string;
}

interface Toast {
  msg: string;
  severity: 'success' | 'error' | 'warning' | 'info';
}


const shortName = (name: string) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  let out = parts.slice(0, 2).join(' ');
  if (parts.length > 2) out += '…';
  return out.length > 25 ? out.slice(0, 24) + '…' : out;
};

export function LandPropertiesPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isSample, isLoading } = useHoldings();

  const pb0 = searchParams.get('pb') || undefined;
  const g0 = searchParams.get('group') || undefined;
  const tab0 = searchParams.get('tab');
  const [tab, setTab] = useState<'all' | 'parcels' | 'properties'>(
    pb0 ? 'parcels' : tab0 === 'properties' ? 'properties' : tab0 === 'parcels' ? 'parcels' : 'all',
  );
  const [view, setView] = useState<'list' | 'grid'>('grid');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [fKind, setFKind] = useState<string | undefined>(undefined);
  const [fStatus, setFStatus] = useState<string | undefined>(undefined);
  const [fStake, setFStake] = useState<string | undefined>(undefined);
  const [fGroup, setFGroup] = useState<string | undefined>(() => {
    // ?group=<id> — resolved to a name once data lands (see effect below).
    return undefined;
  });
  const [fPb, setFPb] = useState<string | undefined>(pb0);
  const [addOpen, setAddOpen] = useState(false);
  const [addParcelOpen, setAddParcelOpen] = useState(false);
  const [stakeTarget, setStakeTarget] = useState<StakeTarget>(null);
  const [locTarget, setLocTarget] = useState<LocationTarget>(null);
  const [deleteTarget, setDeleteTarget] = useState<Holding | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [rowMenu, setRowMenu] = useState<{ anchor: HTMLElement; row: Holding } | null>(null);
  // Hidden picker behind the "Add / Change cover photo" card action
  // (source parity: useCoverUpload in AllHoldingsView / PropertiesView).
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const coverTargetRef = useRef<{ kind: 'parcel' | 'property'; id: string } | null>(null);

  const notify = (msg: string, severity: Toast['severity'] = 'success') => setToast({ msg, severity });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['pattadar'] });

  // ── normalize rows (verbatim semantics from AllHoldingsView) ────────────
  const gname = useMemo(() => new Map(data.groups.map((g) => [g.id, g.name])), [data.groups]);
  const holdings = useMemo<Holding[]>(() => {
    const pbLoc = new Map(
      data.passbooks.map((b) => [b.id, [b.village, b.mandal, b.district].filter(Boolean).join(', ')]),
    );
    const pbGroup = new Map(data.passbooks.map((b) => [b.id, gname.get(b.groupId || '') || '']));
    const pbLabel = new Map(
      data.passbooks.map((b) => [b.id, [b.pattadarNo, b.village].filter(Boolean).join(' · ')]),
    );
    const pbKhata = new Map(data.passbooks.map((b) => [b.id, b.pattadarNo || '']));
    const cov: Record<string, string> = {};
    for (const doc of data.documents) {
      if (doc.docType === 'photo' || doc.tags === 'photo') {
        const key = doc.parcelId || doc.propertyId;
        if (key && doc.fileRef) cov[key] = doc.fileRef;
      }
    }
    const parcels: Holding[] = data.parcels.map((p) => {
      const val = Number(p.marketValue) || Number(p.purchasePrice) || 0;
      const acres = Number(p.extent) || 0;
      return {
        id: p.id,
        kind: 'parcel',
        title: `Sy ${p.surveyNo}${p.subdivision ? '/' + p.subdivision : ''}`,
        passbookId: p.passbookId || '',
        passbook: pbLabel.get(p.passbookId) || '',
        khata: pbKhata.get(p.passbookId) || '',
        groupName: pbGroup.get(p.passbookId) || '',
        owner: p.currentOwner || '',
        location: pbLoc.get(p.passbookId) || '',
        extentLabel: formatArea(acres),
        value: val,
        perAc: val > 0 && acres > 0 ? Math.round(val / acres) : 0,
        status: p.status || 'owned',
        litigation: !!p.litigation,
        stake: p.stake || 'owned',
        typeLabel: p.classification === 'agri' ? 'agri' : 'non-agri',
        typeColor: p.classification === 'agri' ? 'success' : 'info',
        icon: p.classification === 'agri' ? '🌾' : '🏗️',
        cover: cov[p.id],
        createdAt: p.createdAt || '',
        geoPoint: p.geoPoint || '',
      };
    });
    const properties: Holding[] = data.properties.map((p) => {
      const def = propertyTypeDef(p.type);
      return {
        id: p.id,
        kind: 'property',
        title: p.label || '—',
        passbookId: '',
        passbook: '',
        khata: '',
        groupName: gname.get(p.groupId || '') || '',
        owner: p.currentOwner || '',
        location: [p.city, p.district].filter(Boolean).join(', '),
        extentLabel: p.landArea
          ? `${p.landArea} ${p.landUnit}`
          : p.builtupArea
            ? `${p.builtupArea} ${p.builtupUnit}`
            : '—',
        value: Number(p.currentValue) || 0,
        perAc: 0,
        status: p.holdingStatus || 'owned',
        litigation: false,
        stake: p.stake || 'owned',
        typeLabel: def.label,
        typeColor: 'info',
        icon: def.icon || '🏢',
        cover: cov[p.id],
        createdAt: p.createdAt || '',
        geoPoint: '',
      };
    });
    return [...parcels, ...properties];
  }, [data, gname]);

  // ?group=<id> deep link → group-name filter once groups arrive.
  const g0Name = g0 ? gname.get(g0) : undefined;
  if (g0Name && !fGroup) setFGroup(g0Name);

  // ── summary tiles (verbatim from HoldingsView.loadSum) ──────────────────
  const t = useMemo(() => {
    const ps = data.parcels;
    const prs = data.properties;
    return {
      parcels: ps.length,
      properties: prs.length,
      acres: ps.reduce((a, p) => a + (Number(p.extent) || 0), 0),
      invested: ps.reduce((a, p) => a + (Number(p.purchasePrice) || 0), 0),
      attention: ps.filter((p) => p.litigation || (p.status && p.status !== 'owned')).length,
      passbooks: data.passbooks.length,
      plots: prs.filter((p) => p.type === 'open_plot').length,
      sqyd: prs.reduce((a, p) => a + (Number(p.landArea) || 0), 0),
      sqft: prs.reduce((a, p) => a + (Number(p.builtupArea) || 0), 0),
      value:
        prs.reduce((a, p) => a + (Number(p.currentValue) || 0), 0) +
        ps.reduce((a, p) => a + (Number(p.marketValue) || Number(p.purchasePrice) || 0), 0),
      managed: ps.filter((p) => p.stake === 'managed').length + prs.filter((p) => p.stake === 'managed').length,
      watch: ps.filter((p) => p.stake === 'watch').length + prs.filter((p) => p.stake === 'watch').length,
    };
  }, [data]);

  // ── filtering ───────────────────────────────────────────────────────────
  const activeFilters = [fKind, fStatus, fStake, fGroup, fPb].filter(Boolean).length;
  const clearFilters = () => {
    setFKind(undefined);
    setFStatus(undefined);
    setFStake(undefined);
    setFGroup(undefined);
    setFPb(undefined);
  };
  const q = search.trim().toLowerCase();
  const shown = useMemo(
    () =>
      holdings.filter(
        (h) =>
          (tab === 'all' || (tab === 'parcels' ? h.kind === 'parcel' : h.kind === 'property')) &&
          (!fKind || h.kind === fKind) &&
          (!fStatus || h.status === fStatus) &&
          (!fStake || h.stake === fStake) &&
          (!fGroup || h.groupName === fGroup) &&
          (!fPb || h.passbookId === fPb) &&
          (!q ||
            [h.title, h.owner, h.location, h.passbook, h.groupName, h.typeLabel, h.khata, h.status]
              .join(' ')
              .toLowerCase()
              .includes(q)),
      ),
    [holdings, tab, fKind, fStatus, fStake, fGroup, fPb, q],
  );

  // ── export (verbatim cols from AllHoldingsView) ─────────────────────────
  const exportCols: ExportCol<Holding>[] = [
    { key: 'title', title: 'Name' },
    { key: 'kind', title: 'Kind', fmt: (v) => (v === 'parcel' ? 'Land parcel' : 'Property') },
    { key: 'typeLabel', title: 'Type' },
    { key: 'owner', title: 'Owner' },
    { key: 'location', title: 'Location' },
    { key: 'passbook', title: 'Passbook' },
    { key: 'groupName', title: 'Family / Group' },
    { key: 'extentLabel', title: 'Extent' },
    { key: 'value', title: 'Value (₹)', fmt: (v) => (Number(v) ? Number(v).toLocaleString('en-IN') : '') },
    { key: 'status', title: 'Status' },
  ];
  const exportBrand: ExportBrand = {
    brand: 'Pattadar',
    title: 'Land & Properties Register',
    subtitle: 'Andhra Pradesh / Telangana Land Records',
    watermark: 'PATTADAR',
  };
  const exportName =
    tab === 'parcels' ? 'pattadar-parcels' : tab === 'properties' ? 'pattadar-properties' : 'pattadar-holdings';

  // ── actions ─────────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === 'property') await deleteProperty(deleteTarget.id);
      else await deleteParcel(deleteTarget.id);
      notify('Deleted — files moved to Trash');
      refresh();
    } catch {
      notify("Couldn't delete — try again", 'error');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const onCoverFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const target = coverTargetRef.current;
    if (!file || !target) return;
    const res = await uploadCoverPhoto(
      file,
      target.kind === 'property' ? { propertyId: target.id } : { parcelId: target.id },
    );
    if (res === 'ok') {
      notify('Cover photo updated');
      refresh();
    } else if (res === 'storage') notify(STORAGE_OFFLINE_MSG, 'info');
    else notify("Couldn't upload the photo — try again", 'error');
  };

  // Parcels open the parcel 360, properties the property detail (source parity).
  const openDetail = (h: Holding) =>
    navigate(`/app/${h.kind === 'parcel' ? 'parcels' : 'properties'}/${h.id}`);

  const rowActions = (h: Holding) => [
    { key: 'open', label: 'Open', onClick: () => openDetail(h) },
    {
      key: 'cover',
      label: h.cover ? 'Change cover photo' : 'Add cover photo',
      onClick: () => {
        coverTargetRef.current = { kind: h.kind, id: h.id };
        coverInputRef.current?.click();
      },
    },
    {
      key: 'stake',
      label: 'My stake…',
      onClick: () => setStakeTarget({ kind: h.kind, id: h.id, title: h.title, stake: h.stake || 'owned' }),
    },
    // Location on the open-source map — parcels only (source parity: ParcelLocationModal).
    ...(h.kind === 'parcel'
      ? [
          {
            key: 'location',
            label: 'Location…',
            onClick: () =>
              setLocTarget({
                id: h.id,
                title: h.title,
                geoPoint: h.geoPoint,
                autoLocate: h.location ? `${h.location}, India` : '',
              }),
          },
        ]
      : []),
    { key: 'delete', label: 'Delete', danger: true, onClick: () => setDeleteTarget(h) },
  ];

  const firstRun = !isLoading && holdings.length === 0;

  const flabel = (txt: string) => (
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', mb: 0.5, fontSize: 11 }}
    >
      {txt}
    </Typography>
  );
  const filterSelect = (
    label: string,
    value: string | undefined,
    onChange: (v: string | undefined) => void,
    options: { value: string; label: string }[],
    placeholder: string,
  ) => (
    <Box sx={{ minWidth: 170, flex: 1 }}>
      {flabel(label)}
      <TextField
        select
        size="small"
        fullWidth
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        slotProps={{ select: { displayEmpty: true } }}
      >
        <MenuItem value="">{placeholder}</MenuItem>
        {options.map((o) => (
          <MenuItem key={o.value} value={o.value}>
            {o.label}
          </MenuItem>
        ))}
      </TextField>
    </Box>
  );

  const pbOptions = data.passbooks.map((b) => ({
    value: b.id,
    label: `📗 ${b.pattadarNo} · ${shortName(b.ownerName || '') || '—'}`,
  }));
  const groupOptions = data.groups.map((g) => ({ value: g.name, label: `👪 ${g.name}` }));

  // Shaped loading state — never paint the sample dataset uncredited.
  if (isLoading)
    return (
      <>
        <HeaderSkeleton />
        <StatRowSkeleton />
        <CardGridSkeleton />
      </>
    );

  return (
    <>
      {firstRun ? (
        <>
        <PageHeader eyebrow="Your holdings" title="Land & Properties" />
        <EmptyLanding
          icon="🌍"
          title="Add your first holding"
          body="Farmland parcels, plots, flats or commercial spaces — upload the deed, passbook or allotment letter and it's read, classified and filed in the right place automatically."
          ctaText="＋ Add a holding"
          onCta={() => setAddOpen(true)}
        />
        </>
      ) : (
        <>
          {/* Header: eyebrow + title + holdings chip + composition subtitle. */}
          <PageHeader
            eyebrow="Your holdings"
            title="Land & Properties"
            sample={isSample}
            titleChips={<Chip size="small" color="primary" label={`${t.parcels + t.properties} holdings`} />}
            subtitle={`${t.parcels} land parcel${t.parcels !== 1 ? 's' : ''} (${formatArea(t.acres)}) · ${t.properties} propert${t.properties !== 1 ? 'ies' : 'y'}${t.managed ? ` · ${t.managed} managed` : ''}${t.watch ? ` · ${t.watch} watched` : ''}.`}
          />

          {/* Stat row — per-tab sets, verbatim from source. */}
          <StatRow>
            {tab === 'parcels' ? (
              <>
                <StatCard label="Parcels" value={t.parcels} />
                <StatCard label="Total Extent" value={t.acres > 0 ? formatArea(t.acres) : '—'} />
                <StatCard label="Passbooks" value={t.passbooks} />
                <StatCard label="Needs Attention" value={t.attention} />
              </>
            ) : tab === 'properties' ? (
              <>
                <StatCard label="Properties" value={t.properties} />
                <StatCard
                  label="Plots & Sites"
                  value={t.sqyd > 0 ? `${t.sqyd.toLocaleString('en-IN')} Sq.yd` : '—'}
                />
                <StatCard label="Built-up" value={t.sqft > 0 ? `${t.sqft.toLocaleString('en-IN')} sq.ft` : '—'} />
                <StatCard label="Plots" value={t.plots} />
              </>
            ) : (
              <>
                <StatCard label="Holdings" value={t.parcels + t.properties} />
                <StatCard label="Farmland" value={t.acres > 0 ? formatArea(t.acres) : '—'} />
                <StatCard
                  label="Plots & Sites"
                  value={t.sqyd > 0 ? `${t.sqyd.toLocaleString('en-IN')} Sq.yd` : '—'}
                />
                <StatCard label="Passbooks" value={t.passbooks} />
              </>
            )}
          </StatRow>

          {/* Tabs + toolbar. */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
            <Tabs value={tab} onChange={(_e, val) => setTab(val)} sx={{ minHeight: 38, '& .MuiTab-root': { minHeight: 38, py: 0.5 } }}>
              <Tab label="All" value="all" />
              <Tab label="Land Parcels" value="parcels" />
              <Tab label="Properties" value="properties" />
            </Tabs>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField
                size="small"
                placeholder="Search holdings…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ minWidth: 190 }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <ToggleButtonGroup size="small" exclusive value={view} onChange={(_e, val) => val && setView(val)} aria-label="View mode">
                <ToggleButton value="list" aria-label="List view">
                  <ViewListOutlinedIcon fontSize="small" sx={{ mr: 0.5 }} /> List
                </ToggleButton>
                <ToggleButton value="grid" aria-label="Grid view">
                  <GridViewOutlinedIcon fontSize="small" sx={{ mr: 0.5 }} /> Grid
                </ToggleButton>
              </ToggleButtonGroup>
              <Button
                variant={activeFilters ? 'contained' : 'outlined'}
                color={activeFilters ? 'primary' : 'inherit'}
                startIcon={<FilterListIcon />}
                onClick={() => setShowFilters((v) => !v)}
              >
                Filters{activeFilters ? ` (${activeFilters})` : ''}
              </Button>
              <ExportMenu filename={exportName} brand={exportBrand} cols={exportCols} rows={shown} />
              {tab === 'parcels' ? (
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddParcelOpen(true)}>
                  Add Parcel
                </Button>
              ) : (
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
                  Add
                </Button>
              )}
            </Box>
          </Box>

          {/* Filters panel. */}
          {showFilters && (
            <Card variant="outlined" sx={{ p: 1.75, mb: 1.5, bgcolor: 'background.default' }}>
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                {tab === 'all' &&
                  filterSelect('Kind', fKind, setFKind, [
                    { value: 'parcel', label: '🌾 Land parcels' },
                    { value: 'property', label: '🏢 Properties' },
                  ], 'All kinds')}
                {filterSelect(
                  'Status',
                  fStatus,
                  setFStatus,
                  ['owned', 'for-sale', 'sold', 'disputed'].map((x) => ({ value: x, label: x.replace(/-/g, ' ') })),
                  'All statuses',
                )}
                {filterSelect('My stake', fStake, setFStake, [
                  { value: 'owned', label: 'Owned' },
                  { value: 'managed', label: 'Managed' },
                  { value: 'watch', label: 'Watch' },
                ], 'All stakes')}
                {filterSelect('Family / group', fGroup, setFGroup, groupOptions, 'All families')}
                {tab !== 'properties' && filterSelect('Passbook', fPb, setFPb, pbOptions, 'All passbooks')}
                <Button disabled={!activeFilters} onClick={clearFilters}>
                  Clear
                </Button>
              </Box>
            </Card>
          )}

          {/* Collapsed "Filtered by" chips. */}
          {!showFilters && activeFilters > 0 && (
            <Card variant="outlined" sx={{ px: 1.5, py: 1, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', bgcolor: 'background.default' }}>
              <Typography variant="caption" color="text.secondary">
                Filtered by
              </Typography>
              {fKind && (
                <Chip size="small" onDelete={() => setFKind(undefined)} label={fKind === 'parcel' ? '🌾 Land parcels' : '🏢 Properties'} />
              )}
              {fStatus && <Chip size="small" onDelete={() => setFStatus(undefined)} label={fStatus.replace(/-/g, ' ')} />}
              {fStake && (
                <Chip
                  size="small"
                  onDelete={() => setFStake(undefined)}
                  label={fStake === 'managed' ? 'Managed' : fStake === 'watch' ? 'Watch' : 'Owned'}
                />
              )}
              {fGroup && <Chip size="small" onDelete={() => setFGroup(undefined)} label={`👪 ${fGroup}`} />}
              {fPb && (
                <Chip
                  size="small"
                  onDelete={() => setFPb(undefined)}
                  label={`📗 ${(() => {
                    const b = data.passbooks.find((x) => x.id === fPb);
                    return b ? `${b.pattadarNo} · ${shortName(b.ownerName || '')}` : 'Passbook';
                  })()}`}
                />
              )}
              <Box sx={{ ml: 'auto', display: 'flex', gap: 1.5 }}>
                <Link component="button" variant="caption" onClick={() => setShowFilters(true)}>
                  Edit ›
                </Link>
                <Link component="button" variant="caption" onClick={clearFilters}>
                  Clear all
                </Link>
              </Box>
            </Card>
          )}

          {view === 'grid' ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' }, gap: 3 }}>
              {shown.map((r) => (
                <Card
                  key={`${r.kind}-${r.id}`}
                  role="link"
                  tabIndex={0}
                  aria-label={`Open ${r.title}`}
                  onClick={() => openDetail(r)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target === e.currentTarget) openDetail(r);
                  }}
                  sx={clickableCardSx}
                >
                  <CardActionsMenu actions={rowActions(r)} />
                  <CardHero fileRef={r.cover} fallbackIcon={r.icon} pill={parcelPill(r.status, r.litigation)} pill2={stakePill(r.stake)} />
                  <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1, flexGrow: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.title}
                      </Typography>
                      <Chip size="small" color={r.typeColor} label={r.typeLabel} sx={{ flexShrink: 0 }} />
                    </Box>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {r.owner || '—'}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, color: 'text.secondary' }}>
                      <PlaceOutlinedIcon sx={{ fontSize: 16, ml: -0.25, flexShrink: 0 }} />
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {r.location || '—'}
                      </Typography>
                    </Box>
                    {(r.kind === 'parcel' || r.groupName) && (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.25 }}>
                        {r.kind === 'parcel' && (
                          <Chip
                            size="small"
                            label={`Khata ${r.khata || '—'}`}
                            onClick={
                              r.passbookId
                                ? (e) => {
                                    e.stopPropagation();
                                    setTab('parcels');
                                    setFPb(r.passbookId);
                                  }
                                : undefined
                            }
                            sx={(th) => ({
                              bgcolor: (th.vars ?? th).palette.primary.container,
                              color: (th.vars ?? th).palette.primary.onContainer,
                              fontWeight: 600,
                              '&:hover': {
                                bgcolor: `color-mix(in srgb, ${(th.vars ?? th).palette.primary.main} 8%, ${(th.vars ?? th).palette.primary.container})`,
                              },
                            })}
                          />
                        )}
                        {r.groupName && (
                          <Chip
                            size="small"
                            variant="outlined"
                            label={`👪 ${r.groupName}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setFGroup(r.groupName);
                            }}
                          />
                        )}
                      </Box>
                    )}
                    <Box sx={{ mt: 'auto', pt: 1.5, borderTop: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
                      <Typography className="tnum" sx={{ fontSize: 17, fontWeight: 700 }} noWrap>
                        {r.extentLabel}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {r.kind === 'parcel' ? 'Land parcel' : r.typeLabel}
                      </Typography>
                    </Box>
                  </Box>
                </Card>
              ))}
            </Box>
          ) : (
            <TableContainer component={Card} sx={stickyHeadSx}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Kind</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Owner</TableCell>
                    <TableCell>Location</TableCell>
                    <TableCell>Passbook</TableCell>
                    <TableCell>Family / Group</TableCell>
                    <TableCell>Extent</TableCell>
                    <TableCell>Value (₹)</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {shown.map((r) => (
                    <TableRow key={`${r.kind}-${r.id}`} hover>
                      <TableCell>
                        <Link
                          component="button"
                          underline="hover"
                          onClick={() => openDetail(r)}
                          sx={{ fontWeight: 600 }}
                        >
                          {r.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={r.kind === 'parcel' ? 'success' : 'info'}
                          variant="outlined"
                          label={r.kind === 'parcel' ? 'Land parcel' : 'Property'}
                        />
                      </TableCell>
                      <TableCell>{r.typeLabel}</TableCell>
                      <TableCell>{r.owner || '—'}</TableCell>
                      <TableCell>{r.location || '—'}</TableCell>
                      <TableCell>{r.passbook ? `📗 ${r.passbook}` : '—'}</TableCell>
                      <TableCell>
                        {r.groupName ? (
                          <Chip size="small" variant="outlined" label={`👪 ${r.groupName}`} />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>{r.extentLabel}</TableCell>
                      <TableCell>{r.value ? `₹${r.value.toLocaleString('en-IN')}` : '—'}</TableCell>
                      <TableCell>
                        {r.litigation ? (
                          <Chip size="small" color="error" label="litigation" />
                        ) : (
                          <Chip size="small" variant="outlined" label={String(r.status || 'owned').replace(/-/g, ' ')} />
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <IconButton className="rowActions" size="small" aria-label="Row actions" onClick={(e) => setRowMenu({ anchor: e.currentTarget, row: r })}>
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {/* Row-action menu (list view). */}
      <Menu anchorEl={rowMenu?.anchor ?? null} open={Boolean(rowMenu)} onClose={() => setRowMenu(null)}>
        {rowMenu &&
          rowActions(rowMenu.row).map((a) => (
            <MenuItem
              key={a.key}
              onClick={() => {
                setRowMenu(null);
                a.onClick();
              }}
              sx={a.danger ? { color: 'error.main' } : undefined}
            >
              {a.label}
            </MenuItem>
          ))}
      </Menu>

      {/* Kind-aware delete confirmation. */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete {deleteTarget?.title}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Its documents are also removed — files go to My Drive Trash. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={() => void confirmDelete()} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* The AI uploader classifies each document — agricultural deeds are
          filed as land parcels, everything else as properties. */}
      <AddPropertyDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false);
          refresh();
        }}
        notify={notify}
      />
      <AddParcelDialog
        open={addParcelOpen}
        onClose={() => setAddParcelOpen(false)}
        onCreated={refresh}
        passbooks={data.passbooks.map((b) => ({ id: b.id, pattadarNo: b.pattadarNo, village: b.village }))}
        notify={notify}
      />
      <StakeDialog target={stakeTarget} onClose={() => setStakeTarget(null)} onDone={refresh} notify={notify} />
      <LocationDialog target={locTarget} onClose={() => setLocTarget(null)} onDone={refresh} notify={notify} />

      {/* Hidden picker for the cover-photo card action. */}
      <input ref={coverInputRef} type="file" accept="image/*" hidden onChange={(e) => void onCoverFile(e)} />

      <Snackbar open={Boolean(toast)} autoHideDuration={4000} onClose={() => setToast(null)}>
        <Alert severity={toast?.severity ?? 'success'} onClose={() => setToast(null)}>
          {toast?.msg}
        </Alert>
      </Snackbar>
    </>
  );
}
