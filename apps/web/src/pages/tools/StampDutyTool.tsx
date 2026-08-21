/**
 * Stamp Duty & Fee Calculator — functional port of the rhub StampDutyView:
 * deed type comes from the 115-row AP-IGRS fee schedule (the fee-row id is
 * the value so the resolver applies the exact real rates), consideration +
 * market/guideline value, and a full duty & fee breakup. Calculation runs
 * through the live calculateStampDuty query; if the service is unreachable
 * the same math runs locally via @pattadar/core calcStampDuty with the
 * selected row's rates (duty on the higher of consideration / market value).
 */
import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import { calcStampDuty, formatINR } from '@pattadar/core';
import type { FeeScheduleRow } from '@pattadar/core';
import { gql } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/Skeletons';
import { useFeeSchedule } from '../../data/hooks';

interface DutyResult {
  deedType: string;
  consideration: number;
  marketValue: number;
  stampDuty: number;
  transferDuty: number;
  registrationFee: number;
  userCharges: number;
  total: number;
}

export function StampDutyTool() {
  const { data: fees, isSample, isLoading } = useFeeSchedule();
  const [deed, setDeed] = useState<FeeScheduleRow | null>(null);
  const [consideration, setConsideration] = useState('');
  const [marketValue, setMarketValue] = useState('');
  const [result, setResult] = useState<DutyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const calculate = async () => {
    const c = Number(consideration);
    const m = Number(marketValue);
    if (!deed || !(c >= 0) || !(m >= 0) || (!c && !m)) {
      setError('Pick a deed type and enter the consideration and market value.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const d = await gql<{ calculateStampDuty: DutyResult | null }>(
        'query($deedType: String!, $consideration: Float!, $marketValue: Float!) { calculateStampDuty(deedType: $deedType, consideration: $consideration, marketValue: $marketValue) { deedType consideration marketValue stampDuty transferDuty registrationFee userCharges total } }',
        { deedType: deed.id, consideration: c, marketValue: m },
      );
      if (d?.calculateStampDuty) setResult(d.calculateStampDuty);
      else throw new Error('empty');
    } catch {
      // Same math locally — duty on the higher of consideration / market value.
      const b = calcStampDuty(c, m, deed);
      setResult({
        deedType: `${deed.natureEn} — ${deed.regTypeEn}`,
        consideration: c,
        marketValue: m,
        stampDuty: b.stampDuty,
        transferDuty: b.transferDuty,
        registrationFee: b.registrationFee,
        userCharges: b.userCharges,
        total: b.total,
      });
    }
    setLoading(false);
  };

  const line = (label: string, value: string, strong = false) => (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75 }}>
      <Typography variant="body2" color={strong ? 'text.primary' : 'text.secondary'} sx={{ fontWeight: strong ? 700 : 400 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: strong ? 700 : 600, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
    </Box>
  );

  // Shaped loading state — never offer the sample fee schedule uncredited.
  if (isLoading) return <TableSkeleton rows={4} />;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 2 }}>
      <Card>
        <CardContent>
          <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
            Stamp Duty & Fee Calculator
          </Typography>
          <Autocomplete
            options={fees}
            value={deed}
            onChange={(_e, v) => setDeed(v)}
            getOptionLabel={(o) => `${o.natureEn} — ${o.regTypeEn}`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                label="Deed Type"
                placeholder={`Search & select deed type (${fees.length} AP deed types)`}
              />
            )}
            sx={{ mb: 2 }}
          />
          <TextField
            size="small"
            fullWidth
            type="number"
            label="Consideration Amount (₹)"
            placeholder="e.g. 5000000"
            value={consideration}
            onChange={(e) => setConsideration(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            size="small"
            fullWidth
            type="number"
            label="Market / Guideline Value (₹)"
            placeholder="e.g. 6000000"
            value={marketValue}
            onChange={(e) => setMarketValue(e.target.value)}
            sx={{ mb: 2 }}
          />
          {error && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Button variant="contained" fullWidth disabled={loading} onClick={() => void calculate()}>
            {loading ? 'Calculating…' : 'Calculate'}
          </Button>
          {isSample && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Working from the bundled fee schedule — the live service is not reachable.
            </Typography>
          )}
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardContent>
            <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>
              Duty & Fee Breakup
            </Typography>
            {line('Deed Type', result.deedType.replace(/_/g, ' '))}
            {line('Consideration', formatINR(result.consideration))}
            {line('Market Value', formatINR(result.marketValue))}
            <Divider sx={{ my: 1 }} />
            {line('Stamp Duty', formatINR(result.stampDuty))}
            {line('Transfer Duty', formatINR(result.transferDuty))}
            {line('Registration Fee', formatINR(result.registrationFee))}
            {line('User Charges', formatINR(result.userCharges))}
            <Divider sx={{ my: 1 }} />
            {line('TOTAL', formatINR(result.total), true)}
            <Alert severity="warning" sx={{ mt: 2 }}>
              Online payment for stamp duty will be available in a future release.
            </Alert>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={<CalculateOutlinedIcon />}
            title="Enter values and click Calculate"
            description="Duty is charged on the higher of the consideration and the guideline market value."
          />
        </Card>
      )}
    </Box>
  );
}
