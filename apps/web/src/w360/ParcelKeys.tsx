/** The keys for the two insights that shade cadastral parcels — Extent and
 *  Suitability — the same on Maps and on a property's Maps tab
 *  (docs/specs/2026-10-25-pattadar-maps.md). */
import { parseISOToDisplay } from '@pattadar/core';

import { BANDS } from './parcelShade';
import { GRADES } from './suitability';
import type { Suitability } from './suitability';
import { num } from './ui';

/** `counts` per band where the page has the parcels to count. */
export function ExtentKey({ counts }: { counts?: Map<string, number> }) {
  return (
    <div className="vc-legend">
      <span className="eyebrow">Extent</span>
      {BANDS.map((b) => (
        <span key={b.key} className="row tight">
          <i style={{ background: b.hex }} aria-hidden />
          <span className="grow">{b.label}</span>
          {counts && <span className="num">{num(counts.get(b.key) ?? 0)}</span>}
        </span>
      ))}
    </div>
  );
}

export function SuitabilityKey({ suit }: { suit: Suitability }) {
  return (
    <div className="vc-legend vc-suit">
      <span className="eyebrow">Suitability · field crops</span>
      {GRADES.map((g) => (
        <span key={g.key} className="row tight">
          <i style={{ background: g.hex }} aria-hidden />
          <span className="grow">{g.label}</span>
          <span className="num">{num(Math.round(suit.areas[g.key] ?? 0))} ac</span>
        </span>
      ))}
      <span className="row tight">
        <i className="none" aria-hidden />
        <span className="grow">Not assessed</span>
        <span className="num">{num(Math.round(suit.areas.none ?? 0))} ac</span>
      </span>
      <span className="note">
        An estimate from public maps: soil at 250 m, rain at ~5 km. A soil test
        of a field will be more accurate. Built {parseISOToDisplay(suit.built)}.
      </span>
      {/* The data's licences ask for this credit (CC BY 4.0). */}
      <span className="note">{suit.sources.join(' · ')}</span>
    </div>
  );
}
