/**
 * Parcels — farmland holdings. Card grid ↔ table toggle; survey no,
 * village/mandal/district (via passbook), extent in acres-cents, geo chip,
 * per-parcel value and share info, litigation/tax badges.
 */
import { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import GrassOutlinedIcon from '@mui/icons-material/GrassOutlined';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import TableRowsOutlinedIcon from '@mui/icons-material/TableRowsOutlined';
import {
  formatArea,
  formatINRCompact,
  parseISOToDisplay,
  toAcres,
  unitKey,
} from '@pattadar/core';
import type { Parcel, Passbook } from '@pattadar/core';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { useParcels } from '../data/hooks';
import { parcelValue } from '../data/portfolio';

function geoLabel(geoPoint: string): string {
  if (!geoPoint) return '';
  try {
    const g = JSON.parse(geoPoint) as { type?: string; coordinates?: [number, number] };
    if (g.type === 'Point' && Array.isArray(g.coordinates)) {
      const [lng, lat] = g.coordinates;
      return `${(+lat).toFixed(4)}, ${(+lng).toFixed(4)}`;
    }
  } catch {
    /* ignore malformed geo */
  }
  return 'Location set';
}

function placeLine(pb?: Passbook): string {
  if (!pb) return '';
  return [pb.village, pb.mandal, pb.district].filter(Boolean).join(' · ');
}

export function ParcelsPage() {
  const { data, isSample } = useParcels();
  const [view, setView] = useState<'grid' | 'table'>('grid');

  const pbOf = new Map(data.passbooks.map((b) => [b.id, b]));
  const groupName = new Map(data.groups.map((g) => [g.id, g.name]));
  const parcels = data.parcels;
  const totalAcres = parcels.reduce((s, p) => s + toAcres(p.extent || 0, unitKey(p.unit)), 0);
  const invested = parcels.reduce((s, p) => s + (p.purchasePrice || 0), 0);
  const attention = parcels.filter((p) => p.litigation).length;

  const shareInfo = (p: Parcel): string => {
    const pb = pbOf.get(p.passbookId);
    const g = pb?.groupId ? groupName.get(pb.groupId) : '';
    return g ? `Held via ${g}` : p.currentOwner || '';
  };

  return (
    <>
      <PageHeader
        title="Parcels"
        subtitle={`${parcels.length} parcel${parcels.length !== 1 ? 's' : ''} · ${formatArea(totalAcres)} · ${formatINRCompact(invested)} invested${attention ? ` · ${attention} need${attention === 1 ? 's' : ''} attention` : ''}`}
        sample={isSample}
        actions={
          <ToggleButtonGroup
            size="small"
            exclusive
            value={view}
            onChange={(_, v: 'grid' | 'table' | null) => v && setView(v)}
            aria-label="View"
          >
            <ToggleButton value="grid" aria-label="Card view">
              <GridViewOutlinedIcon fontSize="small" />
            </ToggleButton>
            <ToggleButton value="table" aria-label="Table view">
              <TableRowsOutlinedIcon fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>
        }
      />

      {parcels.length === 0 ? (
        <Card>
          <EmptyState
            icon={<GrassOutlinedIcon />}
            title="No parcels yet"
            description="Add your first survey number, or upload a deed and let the details fill themselves in."
          />
        </Card>
      ) : view === 'grid' ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' },
            gap: 1.5,
          }}
        >
          {parcels.map((p) => {
            const pb = pbOf.get(p.passbookId);
            const geo = geoLabel(p.geoPoint);
            return (
              <Card key={p.id}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                    <Box>
                      <Typography variant="h4" component="h2">
                        Sy {p.surveyNo}
                      </Typography>
                      {p.label && (
                        <Typography variant="caption" color="text.secondary">
                          {p.label}
                        </Typography>
                      )}
                    </Box>
                    <Chip
                      size="small"
                      label={p.classification || 'Unclassified'}
                      color={p.classification === 'Wet' ? 'primary' : 'default'}
                      variant="outlined"
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {placeLine(pb) || '—'}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mt: 1.5, flexWrap: 'wrap' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      {formatArea(toAcres(p.extent || 0, unitKey(p.unit)))}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {parcelValue(p) > 0 ? formatINRCompact(parcelValue(p)) : 'Value not set'}
                    </Typography>
                  </Box>
                  {shareInfo(p) && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      {shareInfo(p)}
                    </Typography>
                  )}
                  <Box sx={{ display: 'flex', gap: 0.75, mt: 1.5, flexWrap: 'wrap' }}>
                    {geo ? (
                      <Chip size="small" variant="outlined" icon={<PlaceOutlinedIcon />} label={geo} />
                    ) : (
                      <Tooltip title="Set the field's location to see it on a map">
                        <Chip size="small" variant="outlined" icon={<PlaceOutlinedIcon />} label="No location" />
                      </Tooltip>
                    )}
                    {p.litigation && <Chip size="small" color="error" variant="outlined" label="Litigation" />}
                    {p.taxPaidUpto && (
                      <Chip size="small" variant="outlined" label={`Tax paid to ${parseISOToDisplay(p.taxPaidUpto)}`} />
                    )}
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      ) : (
        <Card>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Survey no</TableCell>
                  <TableCell>Village</TableCell>
                  <TableCell>Class</TableCell>
                  <TableCell align="right">Extent</TableCell>
                  <TableCell align="right">Value</TableCell>
                  <TableCell>Tax paid upto</TableCell>
                  <TableCell>EC</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {parcels.map((p) => {
                  const pb = pbOf.get(p.passbookId);
                  return (
                    <TableRow key={p.id} hover>
                      <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Sy {p.surveyNo}</TableCell>
                      <TableCell>{placeLine(pb)}</TableCell>
                      <TableCell>{p.classification || '—'}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {formatArea(toAcres(p.extent || 0, unitKey(p.unit)))}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {parcelValue(p) > 0 ? formatINRCompact(parcelValue(p)) : '—'}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {p.taxPaidUpto ? parseISOToDisplay(p.taxPaidUpto) : '—'}
                      </TableCell>
                      <TableCell>{p.ecStatus || '—'}</TableCell>
                      <TableCell>
                        {p.litigation ? (
                          <Chip size="small" color="error" variant="outlined" label="Litigation" />
                        ) : (
                          <Chip size="small" color="success" variant="outlined" label="Owned" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
    </>
  );
}
