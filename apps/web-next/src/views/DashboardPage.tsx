'use client';

/**
 * "Land Portfolio" dashboard — founder-approved layout (26/07/2026 mock,
 * rendered in the stock theme's colors, NOT the mock's green):
 *   greeting header (with Telugu line) · dark hero card (extent-led stats,
 *   estimated-value-so-far with hide toggle, Add land / Upload a deed, an
 *   honest guideline-basis note) · "things need your attention" with action
 *   buttons + green all-clear list · record completeness bar · tools grid ·
 *   family & heirs bars · your land village-by-village with deed chips ·
 *   AP-IGRS footer note. Value math is unchanged from rhub dashboard.ts.
 */
import { useState } from 'react';
import { useRouter } from 'src/routes/hooks';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { formatArea, formatDateTime, formatINRCompact } from '@pattadar/core';
import { openFileViewer } from '../components/FileViewer';
import { PageHeader } from '../components/PageHeader';
import { HeaderSkeleton, HeroSkeleton, StatRowSkeleton, TableSkeleton } from '../components/Skeletons';
import { useDashboard } from '../data/hooks';
import {
  membersVerified,
  propertyValue,
  recordsHealth,
  successionCover,
  taxCompliance,
} from '../data/portfolio';
import type { DashParcel } from '../data/portfolio';
import { fetchFileBlob, isStorageRef } from './documents/storage';

/* Dark hero island — light ink for every child, in BOTH color modes. */
const heroSx = {
  mb: 2.5,
  borderRadius: '16px',
  p: { xs: 2.5, sm: 3 },
  background: 'linear-gradient(150deg, #14202f 0%, #182a40 60%, #1b3252 100%)',
  color: '#eef2f6',
  '& .MuiTypography-root': { color: '#eef2f6' },
  '& .MuiTypography-caption, & .MuiTypography-overline': { color: 'rgba(238, 242, 246, 0.72)' },
  '& .MuiDivider-root': { borderColor: 'rgba(255, 255, 255, 0.16)' },
} as const;

const sideCardSx = { p: 2.5, mb: 2.5 } as const;

interface AttnRow {
  n: number;
  sev: 'red' | 'amber';
  title: string;
  body: string;
  action: string;
  go: string;
}

export function DashboardPage() {
  const router = useRouter();
  const { data: d, isSample, isLoading } = useDashboard();
  const [masked, setMasked] = useState(() => localStorage.getItem('pattadar-hide-values') === '1');
  const [openVillage, setOpenVillage] = useState<string | null>(null);

  const today = new Date();
  const hour = today.getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstRun = d.stats.totalPassbooks === 0 && d.properties.length === 0;

  // ── value model (unchanged from rhub dashboard.ts) ────────────────────
  const farmTotal = d.stats.estimatedValue ?? 0;
  const propTotal = d.properties.reduce((s, p) => s + propertyValue(p), 0);
  const total = farmTotal + propTotal;
  const money = (v: number) => (masked ? '₹ ••••' : formatINRCompact(v));
  const toggleMask = () => {
    const next = !masked;
    setMasked(next);
    localStorage.setItem('pattadar-hide-values', next ? '1' : '0');
  };

  // ── extents, villages, deeds ──────────────────────────────────────────
  const farmAcres = d.parcels.reduce((s, p) => s + (Number(p.extent) || 0), 0);
  const plotSqyd = d.properties.reduce((s, p) => s + (Number(p.landArea) || 0), 0);
  const plotCity = d.properties.find((p) => p.city)?.city || '';

  const villageOf = new Map(d.passbooks.map((b) => [b.id, b.village || '—']));
  const withDoc = new Set(d.documents.map((doc) => doc.parcelId).filter(Boolean));
  const viewableByParcel = new Map<string, { name: string; load: () => Promise<Blob> }[]>();
  for (const doc of d.documents) {
    if (!doc.parcelId || !doc.fileRef || !isStorageRef(doc.fileRef)) continue;
    if (!viewableByParcel.has(doc.parcelId)) viewableByParcel.set(doc.parcelId, []);
    viewableByParcel.get(doc.parcelId)!.push({
      name: doc.docType || 'Document',
      load: () => fetchFileBlob(doc.fileRef),
    });
  }
  const byVillage = new Map<string, DashParcel[]>();
  for (const p of d.parcels) {
    const v = villageOf.get(p.passbookId) || '—';
    if (!byVillage.has(v)) byVillage.set(v, []);
    byVillage.get(v)!.push(p);
  }
  const villageAcres = (ps: DashParcel[]) => ps.reduce((s, p) => s + (Number(p.extent) || 0), 0);
  const villagesSorted = [...byVillage.entries()]
    .map(([name, ps]) => ({ name, parcels: [...ps].sort((a, b) => (Number(b.extent) || 0) - (Number(a.extent) || 0)) }))
    .sort((a, b) => villageAcres(b.parcels) - villageAcres(a.parcels));
  const namedVillages = villagesSorted.slice(0, 2);
  const otherVillages = villagesSorted.slice(2);
  const otherParcels = otherVillages.flatMap((v) => v.parcels);
  const expandedVillage = openVillage ?? namedVillages[0]?.name ?? null;

  // ── health + attention ────────────────────────────────────────────────
  const rHealth = recordsHealth(d.parcels, d.passbooks, d.documents);
  const sCover = successionCover(d.parcels, d.passbooks, d.groups);
  const tax = taxCompliance(d.parcels, d.properties, today);
  const mVer = membersVerified(d.members);

  const missingDeed = d.parcels.filter((p) => !withDoc.has(p.id)).length;
  const parcelsWithDeed = d.parcels.length - missingDeed;
  const litigation =
    d.parcels.filter((p) => p.litigation).length + d.properties.filter((p) => p.litigation).length;
  const invites = d.invitations.length;
  const membersPending = mVer?.pending ?? 0;

  const attnRows: AttnRow[] = [];
  if (missingDeed > 0)
    attnRows.push({
      n: missingDeed,
      sev: 'red',
      title: `${missingDeed} parcel${missingDeed !== 1 ? 's are' : ' is'} missing ${missingDeed !== 1 ? 'their' : 'its'} deed`,
      body: 'Without a deed copy, proving ownership later is much harder.',
      action: 'Upload deeds',
      go: '/app/documents',
    });
  if (litigation > 0)
    attnRows.push({
      n: litigation,
      sev: 'red',
      title: `${litigation} holding${litigation !== 1 ? 's are' : ' is'} flagged in litigation`,
      body: 'Keep the court papers beside the land record so decisions stay informed.',
      action: 'Review',
      go: '/app/parcels',
    });
  if (invites > 0)
    attnRows.push({
      n: invites,
      sev: 'amber',
      title: `${invites} family invitation${invites !== 1 ? 's are' : ' is'} waiting`,
      body: "People you invited haven't joined yet. A reminder usually helps.",
      action: 'Send reminder',
      go: '/app/invitations',
    });
  if (membersPending > 0)
    attnRows.push({
      n: membersPending,
      sev: 'amber',
      title: `${membersPending} family member${membersPending !== 1 ? 's aren’t' : ' isn’t'} verified yet`,
      body: 'Verified members can be named as heirs on your parcels.',
      action: 'Verify now',
      go: '/app/groups',
    });

  const allClear: string[] = [];
  if (sCover && sCover.uncovered === 0) allClear.push('Every parcel has nominated heirs');
  if (litigation === 0) allClear.push('No litigation on any holding');
  if (tax && tax.overdue === 0) allClear.push('All recorded land tax is current');

  // Shaped loading state — never paint fake data.
  if (isLoading)
    return (
      <>
        <HeaderSkeleton />
        <HeroSkeleton height={220} />
        <StatRowSkeleton />
        <TableSkeleton rows={4} />
      </>
    );

  const parcelRow = (p: DashParcel) => {
    const files = viewableByParcel.get(p.id) || [];
    return (
      <Box
        key={p.id}
        onClick={() => router.push(`/app/parcels/${p.id}`)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          py: 1,
          px: 0.5,
          borderBottom: '1px dashed',
          borderColor: 'divider',
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
          '&:last-child': { borderBottom: 0 },
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 64 }}>
          Sy {p.surveyNo}
        </Typography>
        <Typography variant="body2">Farmland</Typography>
        {files.length > 0 ? (
          /* In-portal preview of this parcel's files — never a new tab. */
          <Chip
            size="small"
            icon={<VisibilityOutlinedIcon />}
            label={`Preview ${files.length > 1 ? `(${files.length})` : ''}`.trim()}
            variant="outlined"
            color="primary"
            onClick={(e) => {
              e.stopPropagation();
              openFileViewer(files.map((f) => ({ name: `${f.name} · Sy ${p.surveyNo}`, load: f.load })));
            }}
          />
        ) : (
          !withDoc.has(p.id) && <Chip size="small" label="deed missing" color="warning" variant="outlined" />
        )}
        <Typography variant="body2" className="tnum" sx={{ ml: 'auto', fontWeight: 600 }}>
          {formatArea(Number(p.extent) || 0)}
        </Typography>
      </Box>
    );
  };

  const villageHeader = (name: string, parcels: DashParcel[], open: boolean) => (
    <Box
      onClick={() => setOpenVillage(open ? '' : name)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        py: 1.5,
        cursor: 'pointer',
        '&:hover': { bgcolor: 'action.hover' },
        borderRadius: 1,
      }}
    >
      {open ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        {name}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto', fontWeight: 600 }}>
        {parcels.length} parcel{parcels.length !== 1 ? 's' : ''} · {formatArea(villageAcres(parcels))}
      </Typography>
    </Box>
  );

  const tools = [
    { label: 'New passbook', icon: <MenuBookOutlinedIcon fontSize="small" />, go: '/app/passbooks' },
    { label: 'Add parcel', icon: <AddOutlinedIcon fontSize="small" />, go: '/app/parcels' },
    { label: 'Upload deed', icon: <UploadFileOutlinedIcon fontSize="small" />, go: '/app/documents' },
    { label: 'Find SRO office', icon: <AccountBalanceOutlinedIcon fontSize="small" />, go: '/app/tools?tab=sro' },
    { label: 'Stamp duty', icon: <CalculateOutlinedIcon fontSize="small" />, go: '/app/tools?tab=stamp-duty' },
    { label: 'History', icon: <HistoryOutlinedIcon fontSize="small" />, go: '/app/audit' },
  ];

  return (
    <>
      <PageHeader
        title={`${greet}, ${d.meName}`}
        subtitle="Here's everything you own, in one place."
        sample={isSample}
      />

      {firstRun ? (
        /* First run = upload only. The classifier reads whatever comes in
           and routes it — the user never has to decide what to create. */
        <Card sx={{ p: { xs: 2.5, sm: 3 }, maxWidth: 760 }}>
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
            <Button variant="contained" onClick={() => router.push('/app/passbooks')}>
              Upload your passbook
            </Button>
            <Button variant="text" onClick={() => router.push('/app/documents')}>
              or upload a deed / other documents
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            Everything stays in your own secure drive — nothing is shared unless you share it.
          </Typography>
        </Card>
      ) : (
        <>
          {/* ── Hero — the one dark card ───────────────────────────────── */}
          <Box sx={heroSx}>
            <Typography variant="overline" component="p" sx={{ letterSpacing: 2, mb: 1.5 }}>
              Your land &amp; property
            </Typography>
            <Box sx={{ display: 'flex', gap: { xs: 3, md: 6 }, flexWrap: 'wrap' }}>
              {farmAcres > 0 && (
                <Box>
                  <Typography className="tnum" sx={{ fontSize: { xs: 26, sm: 32 }, fontWeight: 700, lineHeight: 1.2 }}>
                    {formatArea(farmAcres)}
                  </Typography>
                  <Typography variant="body2">
                    Farmland · {d.parcels.length} parcel{d.parcels.length !== 1 ? 's' : ''} ·{' '}
                    {villagesSorted.length} village{villagesSorted.length !== 1 ? 's' : ''}
                  </Typography>
                </Box>
              )}
              {plotSqyd > 0 && (
                <Box>
                  <Typography className="tnum" sx={{ fontSize: { xs: 26, sm: 32 }, fontWeight: 700, lineHeight: 1.2 }}>
                    {plotSqyd.toLocaleString('en-IN')} <Box component="span" sx={{ fontSize: 18 }}>sq.yd</Box>
                  </Typography>
                  <Typography variant="body2">
                    {d.properties.length} house plot{d.properties.length !== 1 ? 's' : ''}
                    {plotCity ? ` · ${plotCity}` : ''}
                  </Typography>
                </Box>
              )}
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                  <Typography className="tnum" sx={{ fontSize: { xs: 26, sm: 32 }, fontWeight: 700, lineHeight: 1.2 }}>
                    {total > 0 ? money(total) : '—'}
                  </Typography>
                  <Chip
                    size="small"
                    label={masked ? 'Show' : 'Hide'}
                    onClick={toggleMask}
                    sx={{ bgcolor: 'rgba(255,255,255,0.14)', color: '#eef2f6', fontWeight: 600 }}
                  />
                </Box>
                <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  Estimated value so far
                  <Tooltip title="From AP-IGRS government guideline rates — the official basis. True market value is hard to know in India.">
                    <InfoOutlinedIcon sx={{ fontSize: 15 }} />
                  </Tooltip>
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 1.5, mt: 2.5, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                onClick={() => router.push('/app/parcels')}
                sx={{ bgcolor: '#fff', color: '#14202f', '&:hover': { bgcolor: '#e3f2fd' } }}
              >
                + Add land
              </Button>
              <Button
                onClick={() => router.push('/app/documents')}
                sx={{ color: '#eef2f6', bgcolor: 'rgba(255,255,255,0.12)', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}
              >
                Upload a deed
              </Button>
            </Box>

            <Divider sx={{ my: 2 }} />
            <Typography variant="body2">
              {farmTotal === 0 && propTotal > 0 ? (
                <>
                  Value is based on government guideline rates and covers only your plot — your{' '}
                  {d.parcels.length} farmland parcels haven&apos;t been valued yet.{' '}
                  <Box
                    component="span"
                    onClick={() => router.push('/app/parcels')}
                    sx={{ fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Add farmland values →
                  </Box>
                </>
              ) : (
                <>Values are estimated from AP-IGRS government guideline rates — the official basis, not a market quote.</>
              )}
            </Typography>
          </Box>

          {/* ── Main grid ──────────────────────────────────────────────── */}
          <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', lg: '5fr 3fr' }, alignItems: 'start' }}>
            {/* LEFT column */}
            <Box>
              {/* Attention */}
              <Card sx={{ p: 2.5, mb: 2.5 }}>
                <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
                  {attnRows.length > 0
                    ? `${attnRows.length} thing${attnRows.length !== 1 ? 's' : ''} need your attention`
                    : 'Your records are in good shape'}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: attnRows.length ? 2 : 1 }}>
                  {attnRows.length > 0
                    ? 'Finish these to keep your records safe and complete.'
                    : 'Nothing needs your attention right now.'}
                </Typography>
                {attnRows.map((r) => (
                  <Box key={r.title} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', mb: 2.5 }}>
                    <Box
                      sx={{
                        minWidth: 44,
                        height: 44,
                        borderRadius: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 18,
                        color: r.sev === 'red' ? 'error.main' : 'warning.main',
                        bgcolor: r.sev === 'red' ? 'rgba(211, 47, 47, 0.1)' : 'rgba(237, 108, 2, 0.12)',
                      }}
                      className="tnum"
                    >
                      {r.n}
                    </Box>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography variant="body1" sx={{ fontWeight: 700 }}>
                        {r.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {r.body}
                      </Typography>
                    </Box>
                    <Button variant="tonal" size="small" onClick={() => router.push(r.go)} sx={{ flexShrink: 0 }}>
                      {r.action}
                    </Button>
                  </Box>
                ))}
                {allClear.length > 0 && (
                  <Box sx={{ borderRadius: 2, bgcolor: 'rgba(46, 125, 50, 0.08)', px: 2, py: 1.5 }}>
                    {allClear.map((t) => (
                      <Typography key={t} variant="body2" sx={{ color: 'success.main', fontWeight: 600, py: 0.25 }}>
                        ✓ {t}
                      </Typography>
                    ))}
                  </Box>
                )}
              </Card>

              {/* Village by village */}
              <Card sx={{ p: 2.5 }}>
                <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
                  Your land, village by village
                </Typography>
                {namedVillages.map((v) => (
                  <Box key={v.name} sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    {villageHeader(v.name, v.parcels, expandedVillage === v.name)}
                    <Collapse in={expandedVillage === v.name}>
                      <Box sx={{ pl: 4, pb: 1 }}>{v.parcels.map(parcelRow)}</Box>
                    </Collapse>
                  </Box>
                ))}
                {otherParcels.length > 0 && (
                  <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    {villageHeader('Other villages', otherParcels, expandedVillage === 'Other villages')}
                    <Collapse in={expandedVillage === 'Other villages'}>
                      <Box sx={{ pl: 4, pb: 1 }}>
                        {otherVillages.map((v) => (
                          <Box key={v.name} sx={{ mb: 1 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                              {v.name}
                            </Typography>
                            {v.parcels.map(parcelRow)}
                          </Box>
                        ))}
                      </Box>
                    </Collapse>
                  </Box>
                )}
                {d.properties.map((p) => (
                  <Box
                    key={p.id}
                    onClick={() => router.push(`/app/properties/${p.id}`)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      mt: 2,
                      p: 1.5,
                      borderRadius: 2,
                      bgcolor: 'rgba(25, 118, 210, 0.05)',
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.1)' },
                    }}
                  >
                    <Box sx={{ fontSize: 22 }}>🏠</Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body1" sx={{ fontWeight: 700 }}>
                        {p.label || 'Plot'}{p.city ? ` at ${p.city}` : ''}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {p.landArea ? `${Number(p.landArea).toLocaleString('en-IN')} ${p.landUnit || 'sq.yd'}` : p.type}
                      </Typography>
                    </Box>
                    <Box sx={{ ml: 'auto', textAlign: 'right' }}>
                      <Typography variant="body1" className="tnum" sx={{ fontWeight: 700 }}>
                        {propertyValue(p) > 0 ? money(propertyValue(p)) : '—'}
                      </Typography>
                      {Number(p.purchasePrice) > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          you paid {money(Number(p.purchasePrice))}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                ))}
                <Box sx={{ textAlign: 'center', mt: 2 }}>
                  <Button variant="text" onClick={() => router.push('/app/parcels')}>
                    See all {d.parcels.length + d.properties.length} holdings →
                  </Button>
                </Box>
              </Card>
            </Box>

            {/* RIGHT column */}
            <Box>
              {rHealth && d.parcels.length > 0 && (
                <Card sx={sideCardSx}>
                  <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
                    Record completeness
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    How many parcels have their deed on file.
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <Typography variant="body1" sx={{ fontWeight: 700 }} className="tnum">
                      {parcelsWithDeed} of {d.parcels.length} parcels
                    </Typography>
                    <Typography variant="body2" color="text.secondary" className="tnum">
                      {d.parcels.length > 0 ? Math.round((parcelsWithDeed / d.parcels.length) * 100) : 0}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={d.parcels.length > 0 ? (parcelsWithDeed / d.parcels.length) * 100 : 0}
                    sx={{ my: 1, height: 8, borderRadius: 4 }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    Each deed you upload moves this bar. Start with your largest parcels.
                  </Typography>
                </Card>
              )}

              <Card sx={sideCardSx}>
                <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
                  Tools
                </Typography>
                <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: '1fr 1fr' }}>
                  {tools.map((t) => (
                    <Button
                      key={t.label}
                      variant="outlined"
                      color="inherit"
                      startIcon={t.icon}
                      onClick={() => router.push(t.go)}
                      sx={{ justifyContent: 'flex-start', borderColor: 'divider', color: 'text.primary' }}
                    >
                      {t.label}
                    </Button>
                  ))}
                </Box>
              </Card>

              {(sCover || mVer) && (
                <Card sx={sideCardSx}>
                  <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
                    Family &amp; heirs
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Who inherits what, at a glance.
                  </Typography>
                  {sCover && (
                    <>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          Heirs nominated
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700 }} className="tnum">
                          {sCover.uncovered === 0
                            ? `All ${d.parcels.length} ✓`
                            : `${d.parcels.length - sCover.uncovered} of ${d.parcels.length}`}
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        color={sCover.uncovered === 0 ? 'success' : 'primary'}
                        value={sCover.pct}
                        sx={{ mt: 0.75, mb: 2, height: 8, borderRadius: 4 }}
                      />
                    </>
                  )}
                  {mVer && (
                    <>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          Members verified
                        </Typography>
                        <Typography variant="body2" color="text.secondary" className="tnum">
                          {mVer.total - mVer.pending} of {mVer.total}
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={mVer.pct}
                        sx={{ mt: 0.75, height: 8, borderRadius: 4 }}
                      />
                    </>
                  )}
                </Card>
              )}
            </Box>
          </Box>

          <Typography variant="caption" color="text.secondary" component="p" sx={{ textAlign: 'center', mt: 3, mb: 1 }}>
            Values estimated from AP-IGRS guideline rates · Last updated {formatDateTime(today)}
          </Typography>
        </>
      )}
    </>
  );
}
