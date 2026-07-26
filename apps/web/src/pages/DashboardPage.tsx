/**
 * "Land Portfolio" dashboard — the flagship view, at functional parity with
 * the current rhub dashboard.ts + DashboardView:
 *   gold-glass hero (extent-led asset-class summary, est. value ₹ on the
 *   AP-IGRS guideline basis, gain-since-purchase, net-of-loans, farm/property
 *   split strip, hide-values toggle, last visit, inactivity-watch chip),
 *   quick actions, four health rings (records / succession / tax / members),
 *   category holdings (largest parcels · plots & sites · buildings),
 *   needs-attention feed, by-village + by-city bars, service-requests hub,
 *   recent activity. Value/summary math is ported from rhub dashboard.ts;
 *   ring/attention/village helpers come from data/portfolio (same formulas).
 */
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddHomeWorkOutlinedIcon from '@mui/icons-material/AddHomeWorkOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import FenceOutlinedIcon from '@mui/icons-material/FenceOutlined';
import GrassOutlinedIcon from '@mui/icons-material/GrassOutlined';
import HandymanOutlinedIcon from '@mui/icons-material/HandymanOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import SquareFootOutlinedIcon from '@mui/icons-material/SquareFootOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { formatArea, formatDate, formatDateTime, formatINR, formatINRCompact, parseISOToDisplay } from '@pattadar/core';
import { motion, schemes } from '@pattadar/tokens';
import { gql } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { HeaderSkeleton, HeroSkeleton, StatRowSkeleton, TableSkeleton } from '../components/Skeletons';
import { BarList } from '../components/charts/BarList';
import { HealthRing } from '../components/charts/HealthRing';
import { useChartColors, useStatusColors } from '../components/charts/chartColors';
import { useSchemeMode } from '../components/useSchemeMode';
import { humanEntity } from '../lib/format';
import { useDashboard } from '../data/hooks';
import {
  actionLabel,
  attentionItems,
  gainSincePurchase,
  membersVerified,
  parcelValue,
  propertyValue,
  recordsHealth,
  successionCover,
  taxCompliance,
} from '../data/portfolio';
import type { DashParcel, DashProperty } from '../data/portfolio';

/* ── Pure summaries ported from rhub dashboard.ts ─────────────────────── */

/** Extent-led hero summary — what the owner actually knows, by asset class. */
interface HoldingsSummary {
  farmAcres: number;
  farmCost: number;
  parcels: number;
  plotSqyd: number;
  plotCost: number;
  plots: number;
  resSqft: number;
  resCost: number;
  comSqft: number;
  comCost: number;
  comCount: number;
  rentMonthly: number;
  rentals: number;
}

function holdingsSummary(parcels: DashParcel[], properties: DashProperty[]): HoldingsSummary {
  const s: HoldingsSummary = {
    farmAcres: 0, farmCost: 0, parcels: parcels.length,
    plotSqyd: 0, plotCost: 0, plots: 0,
    resSqft: 0, resCost: 0,
    comSqft: 0, comCost: 0, comCount: 0,
    rentMonthly: 0, rentals: 0,
  };
  for (const p of parcels) {
    s.farmAcres += Number(p.extent) || 0;
    s.farmCost += Number(p.purchasePrice) || 0;
  }
  for (const p of properties) {
    const cost = Number(p.purchasePrice) || 0;
    const commercial = p.type === 'commercial' || p.type === 'rental';
    const builtup = Number(p.builtupArea) || 0;
    const land = Number(p.landArea) || 0;
    try {
      const a = p.attributes ? JSON.parse(p.attributes) : {};
      const rent = Number(a.monthly_rent) || Number(a.rent) || 0;
      if (rent > 0) {
        s.rentMonthly += rent;
        s.rentals += 1;
      }
    } catch {
      /* malformed attributes never break the hero */
    }
    if (commercial && builtup > 0) {
      s.comSqft += builtup;
      s.comCost += cost;
      s.comCount += 1;
    } else if (builtup > 0) {
      s.resSqft += builtup;
      s.resCost += cost;
    }
    if (land > 0) {
      s.plotSqyd += land;
      s.plots += builtup > 0 ? 0 : 1;
      if (builtup === 0) s.plotCost += cost;
    }
  }
  return s;
}

function totalLoans(parcels: DashParcel[]): number {
  return parcels.reduce((s, p) => s + (p.loanAmount || 0), 0);
}

function splitShares(farm: number, prop: number) {
  const total = farm + prop;
  if (total <= 0) return { farmPct: 0, propPct: 0 };
  const farmPct = Math.round((farm / total) * 100);
  return { farmPct, propPct: 100 - farmPct };
}

function cityValues(properties: DashProperty[]) {
  const acc = new Map<string, number>();
  for (const p of properties) {
    const c = p.city || '—';
    acc.set(c, (acc.get(c) || 0) + propertyValue(p));
  }
  return [...acc.entries()]
    .map(([name, value]) => ({ name, value, hasValue: value > 0 }))
    .sort((a, b) => b.value - a.value);
}

/** Acres per village — top 3 + a "+N more" row (rhub dashboard.ts shape). */
function villageExtents3(parcels: DashParcel[], passbooks: { id: string; village: string }[]) {
  const villageOf = new Map(passbooks.map((b) => [b.id, b.village || '—']));
  const acc = new Map<string, number>();
  for (const p of parcels) {
    const v = villageOf.get(p.passbookId) || '—';
    acc.set(v, (acc.get(v) || 0) + (Number(p.extent) || 0));
  }
  const rows = [...acc.entries()].map(([name, acres]) => ({ name, acres })).sort((a, b) => b.acres - a.acres);
  const top = rows.slice(0, 3);
  const rest = rows.slice(3);
  return { top, moreCount: rest.length, moreAcres: rest.reduce((s, r) => s + r.acres, 0) };
}

function bySizeThenValue<T>(items: T[], value: (t: T) => number, size: (t: T) => number, n: number): T[] {
  return [...items]
    .sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (va !== vb) return vb - va;
      return size(b) - size(a);
    })
    .slice(0, n);
}

const topParcels = (parcels: DashParcel[], n: number) =>
  bySizeThenValue(parcels, parcelValue, (p) => Number(p.extent) || 0, n);
const BUILDING_TYPES = new Set(['flat', 'independent_house', 'villa', 'commercial', 'rental', 'other']);
const topPlots = (properties: DashProperty[], n: number) =>
  bySizeThenValue(properties.filter((p) => p.type === 'open_plot'), propertyValue, (p) => p.landArea || 0, n);
const topBuildings = (properties: DashProperty[], n: number) =>
  bySizeThenValue(
    properties.filter((p) => BUILDING_TYPES.has(p.type)),
    propertyValue,
    (p) => p.builtupArea || p.landArea || 0,
    n,
  );

function assetGainPct(value: number, purchasePrice: number): number | null {
  if (!(value > 0) || !(purchasePrice > 0)) return null;
  return Math.round(((value - purchasePrice) / purchasePrice) * 100);
}

/* ── View ─────────────────────────────────────────────────────────────── */

const REQ_META: Record<string, { label: string; icon: ReactElement }> = {
  site_photos: { label: 'Site photos', icon: <CameraAltOutlinedIcon fontSize="small" /> },
  fencing: { label: 'Fencing', icon: <FenceOutlinedIcon fontSize="small" /> },
  survey: { label: 'Boundary survey', icon: <SquareFootOutlinedIcon fontSize="small" /> },
  repair: { label: 'Repair', icon: <HandymanOutlinedIcon fontSize="small" /> },
  EC: { label: 'Encumbrance certificate', icon: <DescriptionOutlinedIcon fontSize="small" /> },
  CC: { label: 'Certified copy', icon: <DescriptionOutlinedIcon fontSize="small" /> },
  marketvalue: { label: 'Market value', icon: <AccountBalanceOutlinedIcon fontSize="small" /> },
  duty: { label: 'Stamp duty', icon: <CalculateOutlinedIcon fontSize="small" /> },
};

function fmtWhen(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return iso.includes('T') ? formatDateTime(d) : formatDate(d);
}

interface HoldingRow {
  id: string;
  title: string;
  sub: string;
  value: number;
  gainPct: number | null;
  litigation: boolean;
  go: string;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: d, isSample, isLoading } = useDashboard();
  const colors = useChartColors();
  const statusColors = useStatusColors();
  const mode = useSchemeMode();
  // Semantic ring colour: complete = primary emerald, gaps = warning amber,
  // nothing actionable = neutral. Never a decorative chart-series hue.
  const ringColor = (pct: number, actionable: boolean) =>
    pct >= 100 ? schemes[mode].primary : actionable ? statusColors.warning : schemes[mode].textDisabled;
  const [masked, setMasked] = useState(() => localStorage.getItem('pattadar-hide-values') === '1');

  const today = new Date();
  const hour = today.getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstRun = d.stats.totalPassbooks === 0 && d.properties.length === 0;

  // ── dashboard.ts value model: farm total is the AP-IGRS estimate from the
  // API (dashboardStats.estimatedValue); properties add their own values. ──
  const farmTotal = d.stats.estimatedValue ?? 0;
  const propTotal = d.properties.reduce((s, p) => s + propertyValue(p), 0);
  const total = farmTotal + propTotal;
  const gain = gainSincePurchase(d.parcels, d.properties);
  const hs = holdingsSummary(d.parcels, d.properties);
  const loans = totalLoans(d.parcels);
  const split = splitShares(farmTotal, propTotal);
  const money = (v: number) => (masked ? '₹ ••••' : formatINRCompact(v));
  const toggleMask = () => {
    const next = !masked;
    setMasked(next);
    localStorage.setItem('pattadar-hide-values', next ? '1' : '0');
  };

  // Inactivity-watch chip — notifier count across groups (best-effort).
  const notifierQ = useQuery({
    queryKey: ['pattadar', 'dash-notifiers', d.groups.map((g) => g.id).join(',')],
    enabled: !isSample && d.groups.length > 0,
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      const per = await Promise.all(
        d.groups.map((g) =>
          gql<{ notifiers: { memberId: string }[] }>(
            'query($gid: String!) { notifiers(groupId: $gid) { memberId } }',
            { gid: g.id },
          ).catch(() => ({ notifiers: [] as { memberId: string }[] })),
        ),
      );
      return per.reduce((n, r) => n + (r.notifiers?.length ?? 0), 0);
    },
  });
  const notifierCount = notifierQ.data ?? 0;

  // ── health rings (same formulas as rhub dashboard.ts) ─────────────────
  const rHealth = recordsHealth(d.parcels, d.passbooks, d.documents);
  const sCover = successionCover(d.parcels, d.passbooks, d.groups);
  const tax = taxCompliance(d.parcels, d.properties, today);
  const mVer = membersVerified(d.members);
  const rings = [
    rHealth && {
      pct: rHealth.pct,
      color: ringColor(rHealth.pct, rHealth.gaps.length > 0),
      title: 'Records health',
      gap: rHealth.gaps[0] || 'All records complete',
      go: '/app/parcels',
    },
    sCover && {
      pct: sCover.pct,
      color: ringColor(sCover.pct, sCover.uncovered > 0),
      title: 'Succession cover',
      gap: sCover.uncovered
        ? `${sCover.uncovered} parcel${sCover.uncovered > 1 ? 's' : ''} without heirs`
        : 'Every parcel has nominated heirs',
      go: '/app/groups',
    },
    tax && {
      pct: tax.pct,
      color: ringColor(tax.pct, tax.overdue > 0),
      title: 'Tax compliance',
      gap: tax.overdue ? `${tax.overdue} overdue` : 'All taxes current',
      go: '/app/parcels',
    },
    mVer && {
      pct: mVer.pct,
      color: ringColor(mVer.pct, mVer.pending > 0),
      title: 'Members verified',
      gap: mVer.pending ? `${mVer.pending} pending` : 'All members verified',
      go: '/app/groups',
    },
  ].filter((r): r is { pct: number; color: string; title: string; gap: string; go: string } => Boolean(r));

  const attention = attentionItems(
    {
      pendingInvites: d.invitations.length,
      membersPending: d.members.filter((m) => !m.isSelf && m.status !== 'verified').length,
      parcels: d.parcels,
      properties: d.properties,
    },
    today,
  );

  const villages = villageExtents3(d.parcels, d.passbooks);
  const cities = cityValues(d.properties);

  // ── category holdings (dashboard.ts holdingCats) ──────────────────────
  const villageOf = new Map(d.passbooks.map((b) => [b.id, b.village]));
  const holdingCats: { key: string; title: string; rows: HoldingRow[]; addGo: string; addLabel: string }[] = [
    {
      key: 'parcels',
      title: 'Largest parcels',
      rows: topParcels(d.parcels, 3).map((p) => ({
        id: p.id,
        title: `Sy ${p.surveyNo}${villageOf.get(p.passbookId) ? ` · ${villageOf.get(p.passbookId)}` : ''}`,
        sub: [p.classification, formatArea(Number(p.extent) || 0)].filter(Boolean).join(' · '),
        value: parcelValue(p),
        gainPct: assetGainPct(parcelValue(p), p.purchasePrice),
        litigation: p.litigation,
        go: '/app/parcels',
      })),
      addGo: '/app/parcels',
      addLabel: '+ Add a parcel',
    },
    {
      key: 'plots',
      title: 'Largest plots & sites',
      rows: topPlots(d.properties, 3).map((p) => ({
        id: p.id,
        title: `${p.label || 'Plot'}${p.city ? ` · ${p.city}` : ''}`,
        sub: p.landArea ? `${p.landArea} ${p.landUnit}` : '',
        value: propertyValue(p),
        gainPct: assetGainPct(propertyValue(p), p.purchasePrice),
        litigation: p.litigation,
        go: '/app/parcels?tab=properties',
      })),
      addGo: '/app/parcels?tab=properties',
      addLabel: '+ Add a plot',
    },
    {
      key: 'buildings',
      title: 'Buildings',
      rows: topBuildings(d.properties, 3).map((p) => ({
        id: p.id,
        title: `${p.label || p.type}${p.city ? ` · ${p.city}` : ''}`,
        sub: p.builtupArea ? `${p.builtupArea} ${p.builtupUnit} built-up` : '',
        value: propertyValue(p),
        gainPct: assetGainPct(propertyValue(p), p.purchasePrice),
        litigation: p.litigation,
        go: '/app/parcels?tab=properties',
      })),
      addGo: '/app/parcels?tab=properties',
      addLabel: '+ Add a building',
    },
  ].filter((c) => c.rows.length > 0);

  const reqCounts = {
    active: d.requests.filter((r) => r.status === 'pending').length,
    prog: d.requests.filter((r) => r.status === 'in_progress').length,
    done: d.requests.filter((r) => r.status === 'completed').length,
  };

  const quickActions = [
    { label: 'New Passbook', icon: <MenuBookOutlinedIcon />, go: '/app/passbooks' },
    { label: 'Add Parcel', icon: <GrassOutlinedIcon />, go: '/app/parcels' },
    { label: 'Add Property', icon: <AddHomeWorkOutlinedIcon />, go: '/app/parcels?tab=properties' },
    { label: 'Upload Deed', icon: <UploadFileOutlinedIcon />, go: '/app/documents' },
    { label: 'Find SRO', icon: <AccountBalanceOutlinedIcon />, go: '/app/tools?tab=sro' },
    { label: 'Stamp Duty', icon: <CalculateOutlinedIcon />, go: '/app/tools?tab=stamp-duty' },
  ];

  const countChips = [
    { label: `${d.stats.totalPassbooks} passbook${d.stats.totalPassbooks !== 1 ? 's' : ''}`, go: '/app/passbooks' },
    { label: `${d.stats.totalGroups} group${d.stats.totalGroups !== 1 ? 's' : ''}`, go: '/app/groups' },
    {
      label: `${d.stats.totalBeneficiaries} beneficiar${d.stats.totalBeneficiaries !== 1 ? 'ies' : 'y'}`,
      go: '/app/groups',
    },
    { label: `${d.stats.totalDocuments} document${d.stats.totalDocuments !== 1 ? 's' : ''}`, go: '/app/documents' },
  ];

  // Hero asset-class lines (dashboard.ts extent-led summary).
  const heroLines: { key: string; big: string; rest: string }[] = [];
  if (hs.farmAcres > 0)
    heroLines.push({
      key: 'farm',
      big: formatArea(hs.farmAcres),
      rest: `farmland · ${hs.parcels} parcel${hs.parcels !== 1 ? 's' : ''}${hs.farmCost > 0 && !masked ? ` · ${formatINRCompact(hs.farmCost)} invested` : ''}`,
    });
  if (hs.plotSqyd > 0)
    heroLines.push({
      key: 'plots',
      big: `${hs.plotSqyd.toLocaleString('en-IN')} Sq.yd`,
      rest: `plots & sites · ${hs.plots}${hs.plotCost > 0 && !masked ? ` · ${formatINRCompact(hs.plotCost)} invested` : ''}`,
    });
  if (hs.resSqft > 0)
    heroLines.push({
      key: 'res',
      big: `${hs.resSqft.toLocaleString('en-IN')} sq.ft`,
      rest: `residential built-up${hs.resCost > 0 && !masked ? ` · ${formatINRCompact(hs.resCost)} invested` : ''}`,
    });
  if (hs.comSqft > 0)
    heroLines.push({
      key: 'com',
      big: `${hs.comSqft.toLocaleString('en-IN')} sq.ft`,
      rest: `commercial · ${hs.comCount}${hs.comCost > 0 && !masked ? ` · ${formatINRCompact(hs.comCost)} invested` : ''}`,
    });
  if (hs.rentMonthly > 0 && !masked)
    heroLines.push({
      key: 'rent',
      big: formatINRCompact(hs.rentMonthly),
      rest: `/ month rental income · ${hs.rentals} unit${hs.rentals !== 1 ? 's' : ''}`,
    });
  if (heroLines.length === 0)
    heroLines.push({ key: 'extent', big: formatArea(d.stats.totalExtent), rest: 'recorded extent' });

  // Shaped loading state — never paint the sample dataset uncredited.
  if (isLoading)
    return (
      <>
        <HeaderSkeleton />
        <HeroSkeleton height={220} />
        <StatRowSkeleton />
        <TableSkeleton rows={4} />
      </>
    );

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Land Portfolio"
        subtitle="Everything you own — farmland, plots and buildings — in one place."
        sample={isSample}
      />

      {/* ── Portfolio hero — dark premium card in both modes ────────── */}
      <Box
        sx={{
          mb: 2.5,
          borderRadius: '20px',
          p: '1px',
          background:
            'linear-gradient(135deg, rgba(100,181,246,0.55), rgba(255,255,255,0.10) 45%, rgba(25,118,210,0.45))',
          boxShadow: '0 26px 60px -30px rgba(13, 71, 161, 0.5)',
        }}
      >
        <Box
          sx={{
            borderRadius: '19px',
            p: { xs: 2.5, sm: 3 },
            position: 'relative',
            overflow: 'hidden',
            background: 'linear-gradient(150deg, #0c1524 0%, #0d1e33 55%, #10294a 100%)',
            // Dark-island: children consume MUI vars, so redefining them here
            // flips the subtree to dark ink without touching any child.
            '--mui-palette-text-primary': '#e8eaed',
            '--mui-palette-text-secondary': 'rgba(232, 234, 237, 0.72)',
            '--mui-palette-divider': 'rgba(255, 255, 255, 0.18)',
            '--mui-palette-primary-main': '#90caf9',
            '--mui-palette-primary-contrastText': 'rgba(0, 0, 0, 0.87)',
            '--mui-palette-primary-container': 'rgba(144, 202, 249, 0.16)',
            '--mui-palette-primary-onContainer': '#90caf9',
            '--mui-palette-action-hover': 'rgba(255, 255, 255, 0.08)',
            // Blanket ink flip — Typography color props resolve statically in
            // places, so enforce light ink classwise inside the island.
            color: '#e8eaed',
            '& .MuiTypography-root': { color: '#e8eaed' },
            '& .MuiTypography-caption, & .MuiTypography-overline': { color: 'rgba(232, 234, 237, 0.72)' },
            '& .MuiTypography-body2': { color: 'rgba(232, 234, 237, 0.8)' },
            '& .MuiIconButton-root': { color: 'rgba(232, 234, 237, 0.85)' },
            '&::after': {
              content: '""',
              position: 'absolute',
              right: '-18%',
              top: '-55%',
              width: 520,
              height: 420,
              pointerEvents: 'none',
              background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(100, 181, 246, 0.18), transparent 70%)',
            },
          }}
        >
        {firstRun ? (
          /* First run = upload only. The classifier reads whatever comes in
             and routes it — the user never has to decide what to create. */
          <Box sx={{ maxWidth: 720 }}>
            <Typography variant="h6" component="p">
              Welcome{d.meName ? `, ${d.meName}` : ''} — start with one upload
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Take a photo of your pattadar passbook or sale deed, or upload a PDF — English or
              Telugu. Pattadar reads it and does the rest:
            </Typography>
            <Box component="ul" sx={{ my: 1.5, pl: 2.5, '& li': { mb: 0.75 } }}>
              <Typography component="li" variant="body2">
                <b>Passbook, Meebhoomi or 1-B</b> — your khata, owner details and every land parcel
                are created for you.
              </Typography>
              <Typography component="li" variant="body2">
                <b>Sale deed</b> — survey numbers, extents and registration details are read into a
                parcel record.
              </Typography>
              <Typography component="li" variant="body2">
                <b>EC, tax receipts and photos</b> — recognised, named and filed with the land they
                belong to.
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button variant="contained" onClick={() => navigate('/app/passbooks')}>
                Upload your passbook
              </Button>
              <Button variant="text" onClick={() => navigate('/app/documents')}>
                or upload a deed / other documents
              </Button>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              Everything stays in your own secure drive — nothing is shared unless you share it.
            </Typography>
          </Box>
        ) : (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
              <Typography variant="body2" color="text.secondary">
                {greet}
                {d.meName ? `, ${d.meName}` : ''}
              </Typography>
              {d.lastVisit && (
                <Typography variant="caption" color="text.secondary">
                  · Last visit {fmtWhen(d.lastVisit)}
                </Typography>
              )}
              {notifierCount > 0 ? (
                <Chip
                  size="small"
                  color="primary"
                  label={`Watch armed · ${notifierCount} notifier${notifierCount > 1 ? 's' : ''}`}
                />
              ) : (
                <Chip
                  size="small"
                  color="primary"
                  label="Set up inactivity watch →"
                  onClick={() => navigate('/app/groups')}
                />
              )}
            </Box>

            {/* Extent-led asset-class lines */}
            <Box sx={{ mt: 1.5 }}>
              <Typography variant="overline" color="text.secondary">
                Your land &amp; property
              </Typography>
              {heroLines.map((l) => (
                <Typography
                  key={l.key}
                  className="tnum"
                  sx={{ fontSize: { xs: 20, sm: 24 }, fontWeight: 700, lineHeight: 1.35, letterSpacing: '-0.01em', color: 'text.primary' }}
                >
                  {l.big}
                  <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1, fontWeight: 600 }}>
                    {l.rest}
                  </Typography>
                </Typography>
              ))}
            </Box>

            {/* Est. value + gain + mask toggle */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mt: 1 }}>
              <Typography variant="body1" className="tnum" sx={{ fontWeight: 600 }}>
                Est. value {total > 0 ? (masked ? '₹ ••••' : formatINR(total)) : '—'}
                <Typography component="span" variant="caption" color="text.secondary">
                  {' '}
                  · guideline basis
                </Typography>
              </Typography>
              {total > 0 && !masked && gain.counted > 0 && (
                <Tooltip title={`On ${gain.counted} of ${gain.total} assets with purchase records`}>
                  <Chip
                    size="small"
                    label={`${gain.gain >= 0 ? '▲' : '▼'} ${formatINRCompact(Math.abs(gain.gain))} · ${gain.pct >= 0 ? '+' : ''}${gain.pct}% since purchase`}
                    sx={{
                      fontWeight: 600,
                      color: gain.gain >= 0 ? statusColors.good : statusColors.critical,
                      bgcolor: 'transparent',
                      border: 1,
                      borderColor: 'divider',
                    }}
                  />
                </Tooltip>
              )}
              <Tooltip title={masked ? 'Show values' : 'Hide values'}>
                <IconButton size="small" onClick={toggleMask} aria-label={masked ? 'Show values' : 'Hide values'}>
                  {masked ? <VisibilityOutlinedIcon fontSize="small" /> : <VisibilityOffOutlinedIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            </Box>
            {loans > 0 && total > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                Net of {money(loans)} loans: <b>{money(total - loans)}</b>
              </Typography>
            )}

            {/* Farm / property split strip */}
            {total > 0 && propTotal > 0 && (
              <>
                <Box sx={{ display: 'flex', gap: '2px', height: 9, borderRadius: '5px', overflow: 'hidden', maxWidth: 520, mt: 1.5 }}>
                  <Box sx={{ flexGrow: Math.max(split.farmPct, 2), bgcolor: colors[0] }} />
                  <Box sx={{ flexGrow: Math.max(split.propPct, 2), bgcolor: colors[1] }} />
                </Box>
                <Box sx={{ display: 'flex', gap: 2, mt: 0.75, flexWrap: 'wrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: colors[0] }} />
                    <Typography variant="caption" color="text.secondary">
                      Farmland {money(farmTotal)} · {d.stats.totalParcels} parcels
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: colors[1] }} />
                    <Typography variant="caption" color="text.secondary">
                      Properties {money(propTotal)} · {d.properties.length} asset{d.properties.length !== 1 ? 's' : ''}
                    </Typography>
                  </Box>
                </Box>
              </>
            )}

            <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              {countChips.map((c) => (
                <Chip key={c.label} size="small" color="primary" label={c.label} onClick={() => navigate(c.go)} />
              ))}
              {total > 0 ? (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                  Estimated from AP-IGRS market-value rates · guideline basis
                </Typography>
              ) : (
                <Button size="small" variant="tonal" sx={{ ml: 'auto' }} onClick={() => navigate('/app/parcels')}>
                  Add market values
                </Button>
              )}
            </Box>
          </Box>
        )}
        </Box>
      </Box>

      {/* ── Quick actions (hidden on first run — upload is the one door) ── */}
      {!firstRun && (
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr', lg: 'repeat(6, 1fr)' }, gap: 1.5, mb: 2.5 }}>
        {quickActions.map((a) => (
          <Card
            key={a.label}
            sx={{
              cursor: 'pointer',
              transition: `transform ${motion.duration.standard}ms ${motion.easing}, border-color ${motion.duration.standard}ms ${motion.easing}`,
              '&:hover': { borderColor: 'primary.main', transform: 'translateY(-2px)' },
            }}
            onClick={() => navigate(a.go)}
          >
            <CardContent sx={{ textAlign: 'center', py: 1.5, '&:last-child': { pb: 1.5 } }}>
              {/* 48px icon area, 24px optical icon */}
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  mx: 'auto',
                  mb: 0.5,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'primary.main',
                  bgcolor: 'rgba(25, 118, 210, 0.08)',
                }}
              >
                {a.icon}
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {a.label}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
      )}

      {/* ── Everything below is data-driven — nothing renders until the
          portfolio has content (no hollow sections on first run). ── */}
      {!firstRun && (
      <>
      {/* ── Health rings ────────────────────────────────────────────── */}
      {rings.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: `repeat(${rings.length}, 1fr)` }, gap: 1.5, mb: 2.5 }}>
          {rings.map((r) => (
            <HealthRing key={r.title} pct={r.pct} color={r.color} title={r.title} gap={r.gap} onClick={() => navigate(r.go)} />
          ))}
        </Box>
      )}

      {/* ── Category holdings + attention ───────────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' }, gap: 1.5, mb: 2.5 }}>
        <Box>
          <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>
            Top holdings
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: `repeat(${Math.max(1, holdingCats.length)}, 1fr)` },
              gap: 1.5,
            }}
          >
            {holdingCats.length === 0 ? (
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">
                    Add parcels or properties to see your largest holdings here.
                  </Typography>
                </CardContent>
              </Card>
            ) : (
              holdingCats.map((c) => (
                <Card key={c.key}>
                  <CardContent>
                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                      {c.title}
                    </Typography>
                    {c.rows.map((r) => (
                      <Box
                        key={r.id}
                        onClick={() => navigate(r.go)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          minHeight: 52,
                          py: 0.75,
                          borderBottom: 1,
                          borderColor: 'divider',
                          cursor: 'pointer',
                          '&:last-of-type': { borderBottom: 0 },
                        }}
                      >
                        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }} noWrap>
                            {r.title}
                          </Typography>
                          {r.sub && (
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                              {r.sub}
                            </Typography>
                          )}
                        </Box>
                        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                          {r.value <= 0 && !r.litigation ? (
                            <Button
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(r.go);
                              }}
                            >
                              Add value
                            </Button>
                          ) : (
                            <>
                              <Typography variant="body2" className="tnum" sx={{ fontWeight: 600 }}>
                                {r.value > 0 ? money(r.value) : '—'}
                              </Typography>
                              <Typography
                                variant="caption"
                                className="tnum"
                                sx={{
                                  color: r.litigation
                                    ? statusColors.critical
                                    : r.gainPct !== null && r.gainPct >= 0
                                      ? statusColors.good
                                      : statusColors.critical,
                                }}
                              >
                                {r.litigation
                                  ? 'litigation'
                                  : r.gainPct !== null && !masked
                                    ? `${r.gainPct >= 0 ? '▲' : '▼'} ${Math.abs(r.gainPct)}%`
                                    : ''}
                              </Typography>
                            </>
                          )}
                        </Box>
                      </Box>
                    ))}
                    {c.rows.length < 3 && (
                      <Button size="small" sx={{ mt: 1 }} onClick={() => navigate(c.addGo)}>
                        {c.addLabel}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </Box>
        </Box>

        <Card sx={{ alignSelf: 'start' }}>
          <CardContent>
            <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>
              Needs attention
            </Typography>
            {attention.map((a, i) => (
              <Box
                key={i}
                onClick={a.path ? () => navigate(a.path as string) : undefined}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.25,
                  py: 0.9,
                  mb: 0.75,
                  borderRadius: 2,
                  bgcolor: 'action.hover',
                  cursor: a.path ? 'pointer' : 'default',
                  '&:hover': a.path ? { bgcolor: 'action.selected' } : undefined,
                }}
              >
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    flexShrink: 0,
                    bgcolor:
                      a.severity === 'red'
                        ? statusColors.critical
                        : a.severity === 'amber'
                          ? statusColors.warning
                          : statusColors.good,
                  }}
                />
                <Typography variant="body2">{a.text}</Typography>
              </Box>
            ))}
          </CardContent>
        </Card>
      </Box>

      {/* ── By village + by city ────────────────────────────────────── */}
      {(d.parcels.length > 0 || cities.length > 0) && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 1.5, mb: 2.5 }}>
          {d.parcels.length > 0 && (
            <Card>
              <CardContent>
                <Typography variant="h6" component="h2" sx={{ mb: 0.5 }}>
                  Farmland by village
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                  {farmTotal > 0 ? `${money(farmTotal)} · ` : ''}
                  {d.stats.totalParcels} parcel{d.stats.totalParcels !== 1 ? 's' : ''} ·{' '}
                  {formatArea(d.stats.totalExtent)}
                </Typography>
                <BarList
                  rows={[
                    ...villages.top.map((v) => ({
                      id: v.name,
                      label: v.name,
                      value: v.acres,
                      display: formatArea(v.acres),
                    })),
                    ...(villages.moreCount > 0
                      ? [
                          {
                            id: '__more__',
                            label: `+ ${villages.moreCount} more`,
                            value: villages.moreAcres,
                            display: formatArea(villages.moreAcres),
                          },
                        ]
                      : []),
                  ]}
                  color={colors[0]}
                  onRowClick={() => navigate('/app/parcels')}
                />
              </CardContent>
            </Card>
          )}
          {cities.length > 0 && (
            <Card>
              <CardContent>
                <Typography variant="h6" component="h2" sx={{ mb: 0.5 }}>
                  Properties by city
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                  {propTotal > 0 ? `${money(propTotal)} · ` : ''}
                  {d.properties.length} asset{d.properties.length !== 1 ? 's' : ''} · {cities.length}{' '}
                  cit{cities.length !== 1 ? 'ies' : 'y'}
                </Typography>
                <BarList
                  rows={cities.map((c) => ({
                    id: c.name,
                    label: c.name,
                    value: c.value,
                    display: c.hasValue ? (masked ? '₹ ••••' : formatINRCompact(c.value)) : 'Add value',
                  }))}
                  color={colors[1]}
                  onRowClick={() => navigate('/app/parcels?tab=properties')}
                />
              </CardContent>
            </Card>
          )}
        </Box>
      )}

      {/* ── Service requests hub + recent activity ──────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 1.5 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="h6" component="h2">
              Service requests
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {reqCounts.active} active · {reqCounts.prog} in progress · {reqCounts.done} completed
            </Typography>
          </Box>
          {d.requests.length === 0 ? (
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  No requests yet — site photos, boundary surveys, fencing and record copies will
                  appear here.
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 1.5 }}>
              {d.requests.slice(0, 3).map((r) => {
                const meta = REQ_META[r.reqType] ?? {
                  label: r.reqType || 'Request',
                  icon: <HandymanOutlinedIcon fontSize="small" />,
                };
                const chip =
                  r.status === 'completed'
                    ? { label: 'Completed', color: 'success' as const }
                    : r.status === 'in_progress'
                      ? { label: 'In progress', color: 'info' as const }
                      : { label: 'Active', color: 'default' as const };
                return (
                  <Card key={r.id}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                        <Box sx={{ color: 'text.secondary' }}>{meta.icon}</Box>
                        <Chip size="small" label={chip.label} color={chip.color} variant="outlined" />
                      </Box>
                      <Typography variant="subtitle2">{meta.label}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {parseISOToDisplay(r.createdAt)} — {r.details}
                      </Typography>
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          )}
        </Box>

        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1.5 }}>
              <Typography variant="h6" component="h2">
                Recent activity
              </Typography>
              <Button size="small" onClick={() => navigate('/app/audit')}>
                Audit log
              </Button>
            </Box>
            {d.audit.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No recent activity
              </Typography>
            ) : (
              d.audit.slice(0, 8).map((a) => {
                // Humanised entity — a raw UUID is never user-facing copy; when
                // no human label exists in the event, the id is omitted entirely.
                const entity = humanEntity(a.target, a.details);
                return (
                <Box
                  key={a.id}
                  sx={{
                    display: 'flex',
                    gap: 1.25,
                    py: 0.9,
                    borderBottom: 1,
                    borderColor: 'divider',
                    '&:last-of-type': { borderBottom: 0 },
                  }}
                >
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      mt: '7px',
                      flexShrink: 0,
                      bgcolor: /delete|remove/.test(a.action)
                        ? statusColors.critical
                        : /create|add|upload/.test(a.action)
                          ? statusColors.good
                          : colors[2],
                    }}
                  />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2">
                      <Box component="span" sx={{ fontWeight: 600 }}>
                        {actionLabel(a.action)}
                      </Box>
                      {entity ? ` · ${entity}` : ''}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {(a.actor || '').split('@')[0] || '—'} · {fmtWhen(a.timestamp)}
                    </Typography>
                  </Box>
                </Box>
                );
              })
            )}
          </CardContent>
        </Card>
      </Box>
      </>
      )}
    </>
  );
}
