/**
 * "Land Portfolio" dashboard — the flagship view.
 * Gold-glass hero (total value, gain chip, last visit), four health rings,
 * category-holdings donut + legend list, needs-attention feed, by-village
 * bars, service-requests strip, recent activity.
 */
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import HandymanOutlinedIcon from '@mui/icons-material/HandymanOutlined';
import SquareFootOutlinedIcon from '@mui/icons-material/SquareFootOutlined';
import {
  formatArea,
  formatDate,
  formatDateTime,
  formatINR,
  formatINRCompact,
  parseISOToDisplay,
} from '@pattadar/core';
import { GlassCard } from '../components/GlassCard';
import { PageHeader } from '../components/PageHeader';
import { BarList } from '../components/charts/BarList';
import { Donut } from '../components/charts/Donut';
import { HealthRing } from '../components/charts/HealthRing';
import { useChartColors, useStatusColors } from '../components/charts/chartColors';
import { useDashboard } from '../data/hooks';
import {
  actionLabel,
  attentionItems,
  gainSincePurchase,
  holdingCategories,
  membersVerified,
  recordsHealth,
  successionCover,
  taxCompliance,
  totalExtentAcres,
  totalPortfolioValue,
  villageExtents,
} from '../data/portfolio';

const REQ_META: Record<string, { label: string; icon: ReactElement }> = {
  site_photos: { label: 'Site photos', icon: <CameraAltOutlinedIcon fontSize="small" /> },
  survey: { label: 'Boundary survey', icon: <SquareFootOutlinedIcon fontSize="small" /> },
  EC: { label: 'Encumbrance certificate', icon: <DescriptionOutlinedIcon fontSize="small" /> },
};

function fmtWhen(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return iso.includes('T') ? formatDateTime(d) : formatDate(d);
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: d, isSample } = useDashboard();
  const colors = useChartColors();
  const statusColors = useStatusColors();

  const today = new Date();
  const { farm, prop, total } = totalPortfolioValue(d.parcels, d.properties);
  const gain = gainSincePurchase(d.parcels, d.properties);
  const acres = totalExtentAcres(d.parcels);
  const hour = today.getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstRun = d.parcels.length === 0 && d.properties.length === 0;

  const docsRing = recordsHealth(d.parcels, d.passbooks, d.documents);
  const verifyRing = membersVerified(d.members);
  const taxRing = taxCompliance(d.parcels, d.properties, today);
  const familyRing = successionCover(d.parcels, d.passbooks, d.groups);
  const rings = [
    docsRing && {
      pct: docsRing.pct,
      color: colors[0],
      title: 'Documents',
      gap: docsRing.gaps[0] || 'All records complete',
      go: '/app/documents',
    },
    verifyRing && {
      pct: verifyRing.pct,
      color: colors[2],
      title: 'Verification',
      gap: verifyRing.pending
        ? `${verifyRing.pending} member${verifyRing.pending > 1 ? 's' : ''} pending`
        : 'All members verified',
      go: '/app/groups',
    },
    taxRing && {
      pct: taxRing.pct,
      color: colors[1],
      title: 'Tax & EC',
      gap: taxRing.overdue
        ? `${taxRing.overdue} payment${taxRing.overdue > 1 ? 's' : ''} overdue`
        : 'All taxes current',
      go: '/app/parcels',
    },
    familyRing && {
      pct: familyRing.pct,
      color: colors[4],
      title: 'Family coverage',
      gap: familyRing.uncovered
        ? `${familyRing.uncovered} parcel${familyRing.uncovered > 1 ? 's' : ''} without heirs`
        : 'Every parcel has heirs',
      go: '/app/groups',
    },
  ].filter((r): r is { pct: number; color: string; title: string; gap: string; go: string } => Boolean(r));

  const cats = holdingCategories(d.parcels, d.properties, d.documents.length);
  const attention = attentionItems(
    {
      pendingInvites: d.invitations.length,
      membersPending: d.members.filter((m) => !m.isSelf && m.status !== 'verified').length,
      parcels: d.parcels,
      properties: d.properties,
    },
    today,
  );
  const villages = villageExtents(d.parcels, d.passbooks);
  const splitFarm = total > 0 ? Math.round((farm / total) * 100) : 0;

  const countChips = [
    { label: `${d.stats.totalPassbooks} passbooks`, go: '/app/passbooks' },
    { label: `${d.stats.totalParcels} parcels`, go: '/app/parcels' },
    { label: `${d.properties.length} properties`, go: '/app/properties' },
    { label: `${d.stats.totalDocuments} documents`, go: '/app/documents' },
    { label: `${d.stats.totalGroups} groups`, go: '/app/groups' },
  ];

  return (
    <>
      <PageHeader
        title="Land Portfolio"
        subtitle="Everything you own — farmland, plots and buildings — in one place."
        sample={isSample}
      />

      {/* ── Gold-glass hero ─────────────────────────────────────────── */}
      <GlassCard tone="gold" sx={{ mb: 2.5 }}>
        {firstRun ? (
          <Box>
            <Typography variant="h3" component="p">
              Welcome{d.meName ? `, ${d.meName}` : ''} — let&apos;s set up your land portfolio
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
              Three small steps and this page comes to life.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button variant="contained" onClick={() => navigate('/app/passbooks')}>
                1 · Create your first passbook
              </Button>
              <Button variant="outlined" onClick={() => navigate('/app/parcels')}>
                2 · Add a parcel or property
              </Button>
              <Button variant="outlined" onClick={() => navigate('/app/documents')}>
                3 · Upload your deed
              </Button>
            </Box>
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
            </Box>
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              Total portfolio value
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap' }}>
              <Typography
                component="p"
                sx={{ fontSize: { xs: 36, sm: 48 }, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em' }}
              >
                {formatINR(total)}
              </Typography>
              {gain.counted > 0 && (
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
            </Box>
            <Typography variant="caption" color="text.secondary">
              Guideline basis — estimated from AP-IGRS market-value rates · {formatArea(acres)} of farmland
            </Typography>
            {total > 0 && (
              <>
                <Box
                  sx={{
                    display: 'flex',
                    gap: '2px',
                    height: 9,
                    borderRadius: '5px',
                    overflow: 'hidden',
                    maxWidth: 520,
                    mt: 1.5,
                  }}
                >
                  <Box sx={{ flexGrow: Math.max(splitFarm, 2), bgcolor: colors[0] }} />
                  <Box sx={{ flexGrow: Math.max(100 - splitFarm, 2), bgcolor: colors[1] }} />
                </Box>
                <Box sx={{ display: 'flex', gap: 2, mt: 0.75, flexWrap: 'wrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: colors[0] }} />
                    <Typography variant="caption" color="text.secondary">
                      Farmland {formatINRCompact(farm)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: colors[1] }} />
                    <Typography variant="caption" color="text.secondary">
                      Properties {formatINRCompact(prop)}
                    </Typography>
                  </Box>
                </Box>
              </>
            )}
            <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
              {countChips.map((c) => (
                <Chip key={c.label} size="small" variant="outlined" label={c.label} onClick={() => navigate(c.go)} />
              ))}
            </Box>
          </Box>
        )}
      </GlassCard>

      {/* ── Health rings ────────────────────────────────────────────── */}
      {rings.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', md: `repeat(${rings.length}, 1fr)` },
            gap: 1.5,
            mb: 2.5,
          }}
        >
          {rings.map((r) => (
            <HealthRing key={r.title} pct={r.pct} color={r.color} title={r.title} gap={r.gap} onClick={() => navigate(r.go)} />
          ))}
        </Box>
      )}

      {/* ── Holdings donut + attention ──────────────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' }, gap: 1.5, mb: 2.5 }}>
        <Card>
          <CardContent>
            <Typography variant="h4" component="h2" sx={{ mb: 2 }}>
              Your holdings by category
            </Typography>
            <Box sx={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>
              <Donut
                slices={cats.map((c, i) => ({
                  label: c.label,
                  value: c.value,
                  display: formatINRCompact(c.value),
                  color: colors[i],
                }))}
                centerLabel={formatINRCompact(total)}
                centerSub="all holdings"
              />
              {/* Legend list — swatch + label + detail + value. */}
              <Box sx={{ flexGrow: 1, minWidth: 240 }}>
                {cats.map((c, i) => (
                  <Box
                    key={c.key}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.25,
                      py: 1,
                      borderBottom: 1,
                      borderColor: 'divider',
                      '&:last-of-type': { borderBottom: 0 },
                    }}
                  >
                    <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: colors[i], flexShrink: 0 }} />
                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {c.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {c.detail}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {c.value > 0 ? formatINRCompact(c.value) : '—'}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h4" component="h2" sx={{ mb: 1.5 }}>
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

      {/* ── By village + activity ───────────────────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 1.5, mb: 2.5 }}>
        {villages.length > 0 && (
          <Card>
            <CardContent>
              <Typography variant="h4" component="h2" sx={{ mb: 0.5 }}>
                Farmland by village
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                {formatArea(acres)} across {d.stats.totalParcels} parcel{d.stats.totalParcels !== 1 ? 's' : ''}
              </Typography>
              <BarList
                rows={villages.map((v) => ({
                  id: v.name,
                  label: v.name,
                  value: v.acres,
                  display: formatArea(v.acres),
                }))}
                color={colors[0]}
                onRowClick={() => navigate('/app/parcels')}
              />
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1.5 }}>
              <Typography variant="h4" component="h2">
                Recent activity
              </Typography>
              <Button size="small" onClick={() => navigate('/app/audit')}>
                Full history
              </Button>
            </Box>
            {d.audit.slice(0, 6).map((a) => (
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
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: colors[0], mt: '7px', flexShrink: 0 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2">
                    <Box component="span" sx={{ fontWeight: 600 }}>
                      {actionLabel(a.action)}
                    </Box>
                    {a.target ? ` · ${a.target}` : ''}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {(a.actor || '').split('@')[0] || '—'} · {fmtWhen(a.timestamp)}
                  </Typography>
                </Box>
              </Box>
            ))}
          </CardContent>
        </Card>
      </Box>

      {/* ── Service requests strip ──────────────────────────────────── */}
      <Typography variant="h4" component="h2" sx={{ mb: 1.5 }}>
        Service requests
      </Typography>
      {d.requests.length === 0 ? (
        <Card>
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              No requests yet — site photos, boundary surveys, fencing and record copies will appear here.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: `repeat(${Math.min(3, d.requests.length)}, 1fr)` },
            gap: 1.5,
          }}
        >
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
                  : { label: 'Waiting', color: 'default' as const };
            return (
              <Card key={r.id}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
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
    </>
  );
}
