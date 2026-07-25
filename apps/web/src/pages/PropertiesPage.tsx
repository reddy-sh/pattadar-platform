/**
 * Properties — non-agricultural holdings (plots, flats, houses, commercial,
 * rental). The properties domain wears AMBER-GOLD accents (never orange —
 * orange is reserved for warnings). Type-adaptive attribute lines follow the
 * rhub propertyTypes.ts concepts.
 */
import type { ReactElement } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import CropSquareOutlinedIcon from '@mui/icons-material/CropSquareOutlined';
import HolidayVillageOutlinedIcon from '@mui/icons-material/HolidayVillageOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import HomeWorkOutlinedIcon from '@mui/icons-material/HomeWorkOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import { formatINRCompact, formatNumberIN, parseISOToDisplay } from '@pattadar/core';
import type { Property } from '@pattadar/core';
import { gold } from '@pattadar/tokens';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { useProperties } from '../data/hooks';
import { daysUntil, propertyValue } from '../data/portfolio';

const TYPE_META: Record<string, { label: string; icon: ReactElement }> = {
  open_plot: { label: 'Open plot / site', icon: <CropSquareOutlinedIcon /> },
  flat: { label: 'Flat / apartment', icon: <ApartmentOutlinedIcon /> },
  independent_house: { label: 'Independent house', icon: <HomeOutlinedIcon /> },
  villa: { label: 'Villa', icon: <HolidayVillageOutlinedIcon /> },
  commercial: { label: 'Commercial building', icon: <StorefrontOutlinedIcon /> },
  rental: { label: 'Rental building', icon: <HomeWorkOutlinedIcon /> },
  other: { label: 'Property', icon: <HomeWorkOutlinedIcon /> },
};

/** Human attribute line from the TEXT-JSON attributes blob. */
function attributeLine(p: Property): string {
  let a: Record<string, unknown> = {};
  try {
    a = p.attributes ? (JSON.parse(p.attributes) as Record<string, unknown>) : {};
  } catch {
    return '';
  }
  const parts: string[] = [];
  if (p.type === 'flat') {
    if (a.bhk) parts.push(`${a.bhk} BHK`);
    if (a.tower_block && a.unit_no) parts.push(`${a.tower_block}-${String(a.unit_no).replace(/^.*-/, '')}`);
    if (a.floor) parts.push(`floor ${a.floor}`);
    if (a.facing) parts.push(`${String(a.facing).toLowerCase()} facing`);
  } else if (p.type === 'open_plot') {
    if (a.plot_no) parts.push(`Plot ${a.plot_no}`);
    if (a.dimensions) parts.push(String(a.dimensions));
    if (a.corner === 'yes') parts.push('corner');
    if (a.road_width) parts.push(`${a.road_width} ft road`);
    if (a.layout) parts.push(String(a.layout));
  } else {
    if (a.floors) parts.push(`${a.floors} floor${Number(a.floors) !== 1 ? 's' : ''}`);
    if (a.total_units && Number(a.total_units) > 1) parts.push(`${a.total_units} units`);
    if (a.monthly_rent && Number(a.monthly_rent) > 0)
      parts.push(`rent ₹${formatNumberIN(Number(a.monthly_rent))}/mo`);
    if (a.layout) parts.push(String(a.layout));
  }
  return parts.join(' · ');
}

function areaLine(p: Property): string {
  const parts: string[] = [];
  if (p.landArea > 0) parts.push(`${formatNumberIN(p.landArea)} sq.yd land`);
  if (p.builtupArea > 0) parts.push(`${formatNumberIN(p.builtupArea)} sq.ft built-up`);
  return parts.join(' · ');
}

export function PropertiesPage() {
  const { data: properties, isSample } = useProperties();
  const today = new Date();
  const totalValue = properties.reduce((s, p) => s + propertyValue(p), 0);
  const attention = properties.filter((p) => {
    const d = daysUntil(p.taxPaidUpto, today);
    return p.litigation || (d !== null && d < 0);
  }).length;

  return (
    <>
      <PageHeader
        title="Properties"
        subtitle={`${properties.length} propert${properties.length !== 1 ? 'ies' : 'y'} · ${formatINRCompact(totalValue)} estimated value${attention ? ` · ${attention} need${attention === 1 ? 's' : ''} attention` : ''}`}
        sample={isSample}
      />
      {properties.length === 0 ? (
        <Card>
          <EmptyState
            icon={<HomeWorkOutlinedIcon />}
            title="No properties yet"
            description="Add a flat, plot, house or commercial building to see it alongside your farmland."
          />
        </Card>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' },
            gap: 1.5,
          }}
        >
          {properties.map((p) => {
            const meta = TYPE_META[p.type] ?? TYPE_META.other;
            const taxDays = daysUntil(p.taxPaidUpto, today);
            const attrs = attributeLine(p);
            return (
              <Card
                key={p.id}
                sx={(t) => ({
                  borderTop: `3px solid ${gold[500]}`,
                  ...t.applyStyles('dark', { borderTop: `3px solid ${gold[300]}` }),
                })}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                    <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', minWidth: 0 }}>
                      <Box
                        sx={(t) => ({
                          width: 40,
                          height: 40,
                          borderRadius: 2,
                          display: 'grid',
                          placeItems: 'center',
                          bgcolor: gold[100],
                          color: gold[800],
                          flexShrink: 0,
                          ...t.applyStyles('dark', {
                            bgcolor: 'rgba(240, 194, 75, 0.14)',
                            color: gold[300],
                          }),
                        })}
                      >
                        {meta.icon}
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
                          {p.label || meta.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {meta.label} · {[p.city, p.district].filter(Boolean).join(', ')}
                        </Typography>
                      </Box>
                    </Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {propertyValue(p) > 0 ? formatINRCompact(propertyValue(p)) : '—'}
                    </Typography>
                  </Box>
                  {areaLine(p) && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                      {areaLine(p)}
                    </Typography>
                  )}
                  {attrs && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      {attrs}
                    </Typography>
                  )}
                  <Box sx={{ display: 'flex', gap: 0.75, mt: 1.5, flexWrap: 'wrap' }}>
                    {p.litigation && <Chip size="small" color="error" variant="outlined" label="Litigation" />}
                    {taxDays !== null && taxDays < 0 && (
                      <Chip size="small" color="warning" variant="outlined" label="Tax overdue" />
                    )}
                    {taxDays !== null && taxDays >= 0 && (
                      <Chip size="small" variant="outlined" label={`Tax paid to ${parseISOToDisplay(p.taxPaidUpto)}`} />
                    )}
                    {p.ecStatus && (
                      <Chip
                        size="small"
                        variant="outlined"
                        color={/pending/i.test(p.ecStatus) ? 'warning' : 'default'}
                        label={p.ecStatus}
                      />
                    )}
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
    </>
  );
}
