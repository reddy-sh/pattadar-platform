import { memo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { RecordSummary } from '../types';

/** ₹ in the Indian system: full figure below a lakh, then lakh / crore. */
export function inrCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e7) return `₹${(value / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`;
  if (abs >= 1e5) return `₹${(value / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 2 })} L`;
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

/** dd/mm/yyyy from an ISO-ish date string; anything unparseable is shown as given. */
export function shortDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function period(first: string | null, last: string | null): { value: string; detail?: string } | null {
  if (!first && !last) return null;
  const a = first ?? last!;
  const b = last ?? first!;
  const yearA = a.slice(0, 4);
  const yearB = b.slice(0, 4);
  if (a.slice(0, 10) === b.slice(0, 10)) return { value: shortDate(a) };
  return {
    value: yearA === yearB ? yearA : `${yearA}–${yearB}`,
    detail: `${shortDate(a)} – ${shortDate(b)}`,
  };
}

interface Stat {
  label: string;
  value: string;
  detail?: string;
  title?: string;
}

function stats(summary: RecordSummary): Stat[] {
  const count = (n: number) => n.toLocaleString('en-IN');
  const out: Stat[] = [
    { label: 'Matches', value: count(summary.total_matches) },
    { label: 'Exact name', value: count(summary.exact_matches) },
    { label: 'As buyer', value: count(summary.as_buyer) },
    { label: 'As seller', value: count(summary.as_seller) },
  ];
  if (typeof summary.consideration_total === 'number') {
    out.push({
      label: 'Consideration',
      value: inrCompact(summary.consideration_total),
      title: `₹${summary.consideration_total.toLocaleString('en-IN')}`,
    });
  }
  const span = period(summary.first_date, summary.last_date);
  if (span) out.push({ label: 'Period', ...span });
  // The service sends the village names; tolerate a bare count from older saved views.
  const villages: unknown = summary.villages;
  const names = Array.isArray(villages) ? villages.filter((name): name is string => typeof name === 'string' && name !== '') : [];
  const villageCount = typeof villages === 'number' && Number.isFinite(villages) ? villages : names.length;
  out.push({
    label: villageCount === 1 ? 'Village' : 'Villages',
    value: count(villageCount),
    title: names.length ? names.join(', ') : undefined,
  });
  return out;
}

/** The headline figures for a party search, drawn above its table. */
function SummaryCardsView({ summary }: { summary: RecordSummary }) {
  const items = stats(summary);
  return (
    <Box
      component="dl"
      role="group"
      aria-label="Summary of these results"
      sx={{
        m: 0,
        px: 1.25,
        py: 1,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
        gap: 0.75,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      {items.map((item) => (
        <Box
          key={item.label}
          title={item.title ?? item.detail}
          sx={{
            minWidth: 0,
            px: 1,
            py: 0.75,
            borderRadius: 1.5,
            border: 1,
            borderColor: 'divider',
            bgcolor: 'background.raised',
          }}
        >
          <Typography component="dt" variant="caption" sx={{ display: 'block', color: 'text.secondary', lineHeight: 1.3 }} noWrap>
            {item.label}
          </Typography>
          <Typography
            component="dd"
            sx={{ m: 0, fontWeight: 700, fontSize: '1rem', lineHeight: 1.35, fontVariantNumeric: 'tabular-nums', color: 'text.primary' }}
            noWrap
          >
            {item.value}
            {item.detail && (
              <Typography component="span" variant="caption" sx={{ display: 'block', fontWeight: 400, color: 'text.secondary', lineHeight: 1.3, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                {item.detail}
              </Typography>
            )}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

/** Memoised: a streamed token re-renders the panel, never an unchanged SummaryCards. */
export const SummaryCards = memo(SummaryCardsView);
