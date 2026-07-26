/**
 * Market Value — the AP guideline-rate lookup (rhub MarketValueView) with a
 * district → mandal → village cascade over the marketValues reference table.
 * Selecting down the cascade narrows the rows; a village selection surfaces
 * its rates as highlight cards.
 */
import { useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { formatNumberIN, parseISOToDisplay } from '@pattadar/core';
import { TableSkeleton } from '../../components/Skeletons';
import { useMarketValues } from '../../data/hooks';

const ALL = '__all__';

export function MarketValueTool() {
  const { data: rows, isSample, isLoading } = useMarketValues();
  const [district, setDistrict] = useState(ALL);
  const [mandal, setMandal] = useState(ALL);
  const [village, setVillage] = useState(ALL);

  const districts = useMemo(() => [...new Set(rows.map((r) => r.district))].sort(), [rows]);
  const mandals = useMemo(
    () =>
      [...new Set(rows.filter((r) => district === ALL || r.district === district).map((r) => r.mandal))].sort(),
    [rows, district],
  );
  const villages = useMemo(
    () =>
      [
        ...new Set(
          rows
            .filter((r) => (district === ALL || r.district === district) && (mandal === ALL || r.mandal === mandal))
            .map((r) => r.village),
        ),
      ].sort(),
    [rows, district, mandal],
  );

  const shown = rows.filter(
    (r) =>
      (district === ALL || r.district === district) &&
      (mandal === ALL || r.mandal === mandal) &&
      (village === ALL || r.village === village),
  );

  const cascade = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    options: string[],
    allLabel: string,
  ) => (
    <TextField select size="small" label={label} value={value} onChange={(e) => onChange(e.target.value)} sx={{ minWidth: 200 }}>
      <MenuItem value={ALL}>{allLabel}</MenuItem>
      {options.map((o) => (
        <MenuItem key={o} value={o}>
          {o}
        </MenuItem>
      ))}
    </TextField>
  );

  // Shaped loading state — never show sample guideline rates uncredited.
  if (isLoading) return <TableSkeleton rows={6} />;

  return (
    <>
      <Alert severity="info" sx={{ mb: 2 }}>
        These are reference guideline values published by the AP Registration &amp; Stamps department.
        Actual market values may vary.
      </Alert>

      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        {cascade('District', district, (v) => { setDistrict(v); setMandal(ALL); setVillage(ALL); }, districts, 'All districts')}
        {cascade('Mandal', mandal, (v) => { setMandal(v); setVillage(ALL); }, mandals, 'All mandals')}
        {cascade('Village', village, setVillage, villages, 'All villages')}
      </Box>

      {village !== ALL && shown.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: `repeat(${Math.min(3, shown.length)}, 1fr)` }, gap: 1.5, mb: 2 }}>
          {shown.map((r) => (
            <Card key={r.id}>
              <CardContent>
                <Chip
                  size="small"
                  variant="outlined"
                  color={r.classification === 'agri' ? 'success' : 'info'}
                  label={r.classification}
                  sx={{ mb: 1 }}
                />
                <Typography variant="h6" component="p">
                  ₹{formatNumberIN(r.ratePerUnit)}
                  <Typography component="span" variant="body2" color="text.secondary">
                    {' '}
                    / {r.unit}
                  </Typography>
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {r.village}, {r.mandal} · effective {parseISOToDisplay(r.effectiveFrom)}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      <Card>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>District</TableCell>
                <TableCell>Mandal</TableCell>
                <TableCell>Village</TableCell>
                <TableCell>Classification</TableCell>
                <TableCell align="right">Rate / Unit (₹)</TableCell>
                <TableCell>Unit</TableCell>
                <TableCell>Effective From</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{r.district}</TableCell>
                  <TableCell>{r.mandal}</TableCell>
                  <TableCell>{r.village}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      variant="outlined"
                      color={r.classification === 'agri' ? 'success' : 'info'}
                      label={r.classification}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    ₹{formatNumberIN(r.ratePerUnit)}
                  </TableCell>
                  <TableCell>{r.unit}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{parseISOToDisplay(r.effectiveFrom)}</TableCell>
                </TableRow>
              ))}
              {shown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                      No guideline rates match this selection.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
      {isSample && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Sample data — the live service is not reachable.
        </Typography>
      )}
    </>
  );
}
