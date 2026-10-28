/** Rainfall on a record's Location tab: area rainfall for the NASA POWER grid
 *  square the land sits in (services/api/src/weather.py).
 *
 *  It is said as AREA rainfall every time, because that is what it is: POWER's
 *  grid is about 55 × 65 km here and runs a few days behind. A card that let
 *  "42 mm" read as a gauge on this field would be claiming a measurement
 *  nobody took. There is no forecast in this source, so the card shows none. */
import { parseISOToDisplay } from '@pattadar/core';

import { useRainfall, useRetryRainfall } from './api';
import type { RainfallView } from './api';
import { Card, Failed, KV } from './ui';
import { SkRowItems } from './skeletons';

const mm = (v: number | null) => (v == null ? '—' : `${Math.round(v).toLocaleString('en-IN')} mm`);

/** The season against its normal, in words. Within 5% is inside the spread
 *  of a normal year, so it is not called above or below. */
function againstNormal(pct: number | null): string {
  if (pct == null) return '—';
  if (Math.abs(pct) < 5) return 'Close to normal';
  return `${Math.abs(pct)}% ${pct < 0 ? 'below' : 'above'} normal`;
}

function Figures({ v }: { v: RainfallView }) {
  const temps = v.tMax7 != null && v.tMin7 != null
    ? `${Math.round(v.tMax7)} °C / ${Math.round(v.tMin7)} °C` : '—';
  return (
    <>
      <KV
        rows={[
          { k: 'Last 7 days', v: mm(v.last7Mm) },
          { k: 'Last 30 days', v: mm(v.last30Mm) },
          { k: `Since ${parseISOToDisplay(v.seasonFrom)}`, v: mm(v.seasonMm) },
          { k: 'Normal to date', v: mm(v.normalMm) },
          { k: 'Season', v: againstNormal(v.seasonPct), highlight: true },
          { k: 'High / low, last 7 days', v: temps },
        ]}
      />
      <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
        Area rainfall for the ~60 km grid square at {v.cellLabel}, not a gauge on this land.
        {' '}Normal is the 1991–2020 average. {v.source}, data to {parseISOToDisplay(v.asOf)}.
      </p>
    </>
  );
}

/** `located` is false for a record with neither a pin nor a boundary: there
 *  is no place to ask about, and the card is not drawn at all. */
export function RainfallCard({ recordId, located }: { recordId: string; located: boolean }) {
  const { data, isLoading, error } = useRainfall(recordId, located);
  const retry = useRetryRainfall(recordId);
  if (!located || data === null || data?.status === 'unavailable') return null;
  return (
    <Card title="Rainfall" className="railcard" busy={isLoading}>
      {isLoading ? (
        <div className="rows" aria-hidden><SkRowItems rows={4} /></div>
      ) : error || !data || data.status === 'failed' ? (
        <Failed what="Rainfall" error={data?.reason} onRetry={retry} />
      ) : (
        <Figures v={data} />
      )}
    </Card>
  );
}
