import { memo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import type { RecordView, ViewCell } from '../types';

const RATE_KEYS = ['median_rate', 'avg_rate'] as const;
const BAR_HEIGHT = 10;
const MAX_BARS = 12;

function num(value: ViewCell | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function rupees(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

/** A price-rate table: one row per extent unit with a median or average rate. */
export function isRateView(view: RecordView): boolean {
  if (view.kind !== 'table') return false;
  const keys = new Set((view.columns ?? []).map((column) => column.key));
  return keys.has('extent_unit') && RATE_KEYS.some((key) => keys.has(key))
    && (view.rows ?? []).some((row) => RATE_KEYS.some((key) => num(row[key]) !== null));
}

interface Bar {
  label: string;
  unit: string;
  rate: number;
  min: number | null;
  max: number | null;
  deeds: number | null;
}

function barsOf(view: RecordView, rateKey: (typeof RATE_KEYS)[number]): Bar[] {
  const labelKeys = (view.columns ?? [])
    .map((column) => column.key)
    .filter((key) => key !== 'extent_unit' && (view.rows ?? []).every((row) => row[key] == null || (typeof row[key] === 'string' && num(row[key]) === null)));
  const bars: Bar[] = [];
  for (const row of view.rows ?? []) {
    const rate = num(row[rateKey]);
    if (rate === null) continue;
    const unit = row.extent_unit == null ? 'unit' : String(row.extent_unit);
    const context = labelKeys.map((key) => row[key]).filter((part) => part != null && part !== '').join(' · ');
    bars.push({
      label: context ? `${context} · per ${unit}` : `Per ${unit}`,
      unit: unit.toLowerCase(),
      rate,
      min: num(row.min_rate),
      max: num(row.max_rate),
      deeds: num(row.n) ?? num(row.record_count),
    });
  }
  return bars.slice(0, MAX_BARS);
}

/**
 * Median rate per extent unit as horizontal bars. Units are never converted, so
 * rows in different units are each drawn against their own lowest–highest range
 * rather than one shared axis that would invite a false comparison.
 */
function RateChartView({ view }: { view: RecordView }) {
  const theme = useTheme();
  // CSS-variable references follow the live light/dark scheme; theme.palette alone is one fixed scheme.
  const palette = (theme.vars ?? theme).palette;
  const rateKey = RATE_KEYS.find((key) => (view.rows ?? []).some((row) => num(row[key]) !== null)) ?? 'median_rate';
  const bars = barsOf(view, rateKey);
  if (bars.length === 0) return null;
  const sharedScale = new Set(bars.map((bar) => bar.unit)).size === 1;
  const globalMax = Math.max(...bars.map((bar) => Math.max(bar.rate, bar.max ?? 0)));
  const rateWord = rateKey === 'median_rate' ? 'Median' : 'Average';
  const summary = `${rateWord} rate per unit: ${bars.map((bar) => `${bar.label}, ${rupees(bar.rate)}`).join('; ')}.`;
  const pct = (value: number, scale: number) => `${scale > 0 ? Math.max(0, Math.min(100, (value / scale) * 100)) : 0}%`;

  // Labels are HTML so a long one wraps beside its figure instead of running
  // under it; the bars stay inline SVG.
  return (
    <Box sx={{ px: 1.25, pt: 1, pb: 0.75, borderBottom: 1, borderColor: 'divider' }}>
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 0.5 }}>
        {rateWord} rate · {sharedScale ? 'shaded band is the lowest–highest range' : 'units differ, so each bar is drawn against its own lowest–highest range'}
      </Typography>
      <Box role="img" aria-label={summary} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {bars.map((bar, index) => {
          const scale = sharedScale ? globalMax : Math.max(bar.max ?? bar.rate, bar.rate);
          const detail = [
            `${rateWord} ${rupees(bar.rate)}`,
            bar.min !== null && bar.max !== null ? `range ${rupees(bar.min)}–${rupees(bar.max)}` : null,
            bar.deeds !== null ? `${bar.deeds.toLocaleString('en-IN')} deeds` : null,
          ].filter(Boolean).join(' · ');
          return (
            <Box key={`${bar.label}-${index}`} title={`${bar.label}: ${detail}`} sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.5, fontSize: 12, lineHeight: 1.35 }}>
                <Box component="span" sx={{ flex: '1 1 auto', minWidth: 0, color: 'text.secondary', overflowWrap: 'anywhere' }}>
                  {bar.label}
                  {bar.deeds !== null && ` (${bar.deeds.toLocaleString('en-IN')})`}
                </Box>
                <Box component="span" sx={{ flexShrink: 0, fontWeight: 700, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
                  {rupees(bar.rate)}
                </Box>
              </Box>
              <svg width="100%" height={BAR_HEIGHT} aria-hidden focusable="false" style={{ display: 'block', overflow: 'visible' }}>
                <rect x={0} y={0} width="100%" height={BAR_HEIGHT} rx={BAR_HEIGHT / 2} style={{ fill: palette.action.hover }} />
                {bar.min !== null && bar.max !== null && bar.max > bar.min && (
                  <rect
                    x={pct(bar.min, scale)}
                    y={0}
                    width={pct(bar.max - bar.min, scale)}
                    height={BAR_HEIGHT}
                    rx={BAR_HEIGHT / 2}
                    style={{ fill: palette.action.selected }}
                  />
                )}
                <rect x={0} y={0} width={pct(bar.rate, scale)} height={BAR_HEIGHT} rx={BAR_HEIGHT / 2} style={{ fill: palette.primary.main }} />
              </svg>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/** Memoised: a streamed token re-renders the panel, never an unchanged RateChart. */
export const RateChart = memo(RateChartView);
