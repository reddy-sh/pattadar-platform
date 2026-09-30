import type { HTMLAttributes, ReactNode } from 'react';

import {
  LENGTH_FT, SQ_M_PER_ACRE, compassPoint, cornerLabel, formatExtent,
} from '@pattadar/core';
import { Card, KV, num } from './ui';

export interface BoundaryMeasurementSide {
  from: number;
  to: number;
  metres: number;
  bearing: number;
}

export interface BoundaryMeasurementComparison {
  diff: number;
  pct: number;
  band: 'close' | 'check' | 'wrong';
}

/** The one Measurements card used beside every saved boundary.
 *
 * Record Location owns the interaction with an individual side, while combined
 * holdings pass static rows because their shared map highlights whole surveys.
 * The figures, unit switch, area treatment, comparison wording, and table stay
 * identical because both screens render them here. */
export function BoundaryMeasurementsCard({
  sides,
  perimeterM,
  areaAc,
  onRecord,
  lengthUnit,
  onLengthUnit,
  comparison,
  showApproximation = true,
  rowProps,
  renderSideLabel,
}: {
  sides: BoundaryMeasurementSide[];
  perimeterM: number;
  areaAc: number;
  onRecord: string;
  lengthUnit: 'm' | 'ft';
  onLengthUnit: (unit: 'm' | 'ft') => void;
  comparison?: BoundaryMeasurementComparison | null;
  /** Combined FMB deliberately omits this one line at the owner's request. */
  showApproximation?: boolean;
  /* No hide control of its own. Record Location's Measure chip over the map
     is the one control that shows and hides this card; a second × here, with
     the same title, was two controls for one destination. Combined uses its
     survey chooser. */
  rowProps?: (side: BoundaryMeasurementSide, index: number) => HTMLAttributes<HTMLTableRowElement>;
  renderSideLabel?: (
    side: BoundaryMeasurementSide,
    index: number,
    label: string,
  ) => ReactNode;
}) {
  const len = (metres: number) => (lengthUnit === 'm'
    ? `${Math.round(metres).toLocaleString('en-IN')} m`
    : `${Math.round(metres * LENGTH_FT.m).toLocaleString('en-IN')} ft`);

  return (
    <Card
      title="Measurements"
      aside={
        <span className="segmented" role="group" aria-label="Length unit">
          {(['m', 'ft'] as const).map((unit) => (
            <button key={unit} type="button" aria-pressed={lengthUnit === unit}
                    onClick={() => onLengthUnit(unit)}>
              {unit === 'm' ? 'Metres' : 'Feet'}
            </button>
          ))}
        </span>
      }
    >
      <KV rows={[
        { k: 'Sides', v: String(sides.length) },
        { k: 'Around', v: len(perimeterM) },
        { k: 'Area', v: areaAc < 1 / 40
          ? `${num(areaAc * SQ_M_PER_ACRE, 0)} m²`
          : formatExtent(Math.round(areaAc * 40) / 40, 'acres-guntas') },
        { k: 'On record', v: onRecord },
      ]} />
      {showApproximation && (
        <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
          Approximate measurements from the saved outline.
        </p>
      )}
      {comparison && (
        <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
          {comparison.band === 'close'
            ? `Within ${Math.abs(comparison.pct).toFixed(1)}% of the extent on record.`
            : comparison.band === 'check'
              ? `${Math.abs(comparison.pct).toFixed(1)}% ${comparison.diff > 0 ? 'larger' : 'smaller'} than the extent on record.`
              : `${Math.abs(comparison.pct).toFixed(0)}% ${comparison.diff > 0 ? 'larger' : 'smaller'} than the extent on record. Check the outline.`}
        </p>
      )}

      <table className="sidetable" style={{ marginTop: 'var(--space-md)' }}>
        <thead>
          <tr><th>Side</th><th>Length</th><th>Direction</th></tr>
        </thead>
        <tbody>
          {sides.map((side, index) => {
            const label = `${cornerLabel(side.from - 1)} → ${cornerLabel(side.to - 1)}`;
            return (
              <tr key={`${side.from}-${side.to}`} {...rowProps?.(side, index)}>
                <td className="num">
                  {renderSideLabel ? renderSideLabel(side, index, label) : label}
                </td>
                <td className="num">{len(side.metres)}</td>
                <td className="num">{compassPoint(side.bearing)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
