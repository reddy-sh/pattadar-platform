/**
 * Land-area units (ported from the rhub pattadar app's units.ts concepts).
 * Canonical unit is the ACRE: `parcel.extent` is decimal acres and `unit` is
 * only a provenance label. Pure functions, no dependencies.
 */

export type UnitKey =
  | 'acre'
  | 'cent'
  | 'gunta'
  | 'sqyd'
  | 'sqft'
  | 'sqm'
  | 'hectare'
  | 'ankanam';

/** Square feet per 1 unit (unambiguous base). */
export const UNIT_SQFT: Record<UnitKey, number> = {
  sqft: 1,
  sqyd: 9,
  sqm: 10.7639104,
  ankanam: 72, // AP/Telangana common value
  cent: 435.6, // 43560 / 100
  gunta: 1089, // 43560 / 40 (= 2.5 cents)
  acre: 43560,
  hectare: 107639.104,
};

const SQFT_PER_ACRE = 43560;

export const round2 = (n: number): number =>
  Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;

export function toAcres(value: number, unit: UnitKey): number {
  return ((Number(value) || 0) * UNIT_SQFT[unit]) / SQFT_PER_ACRE;
}

export function fromAcres(acres: number, unit: UnitKey): number {
  return ((Number(acres) || 0) * SQFT_PER_ACRE) / UNIT_SQFT[unit];
}

/** "2 Acres 50 Cents" — cents keep a decimal only when non-integer. */
export function formatArea(acres: number): string {
  const a0 = Number(acres) || 0;
  if (a0 <= 0) return '0 Cents';
  const totalCents = round2(a0 * 100);
  const ac = Math.floor(totalCents / 100 + 1e-9);
  const ct = round2(totalCents - ac * 100);
  const parts: string[] = [];
  if (ac > 0) parts.push(`${ac} ${ac === 1 ? 'Acre' : 'Acres'}`);
  if (ct > 0 || ac === 0) parts.push(`${round2(ct)} ${ct === 1 ? 'Cent' : 'Cents'}`);
  return parts.join(' ');
}

/** "4 Acres 34 Guntas" — the guntas view of an acre value (40 guntas/acre). */
export function formatAcresGuntas(acres: number): string {
  const a0 = Number(acres) || 0;
  if (a0 <= 0) return '0 Guntas';
  const totalGuntas = round2(a0 * 40);
  const ac = Math.floor(totalGuntas / 40 + 1e-9);
  const g = round2(totalGuntas - ac * 40);
  const parts: string[] = [];
  if (ac > 0) parts.push(`${ac} ${ac === 1 ? 'Acre' : 'Acres'}`);
  if (g > 0 || ac === 0) parts.push(`${round2(g)} ${g === 1 ? 'Gunta' : 'Guntas'}`);
  return parts.join(' ');
}

/** Map a stored unit label (legacy compound or key) to a UnitKey. */
export function unitKey(label: string | null | undefined): UnitKey {
  const s = String(label || '')
    .toLowerCase()
    .trim();
  if ((s as UnitKey) in UNIT_SQFT) return s as UnitKey;
  if (s.includes('acre')) return 'acre'; // legacy "Acres-Guntas" is decimal acres
  if (s.includes('gunta')) return 'gunta';
  if (s.includes('cent')) return 'cent';
  if (s.includes('hect')) return 'hectare';
  if (s.includes('ankan')) return 'ankanam';
  if (s.includes('yard') || s.includes('sq.yd') || s.includes('sqyd')) return 'sqyd';
  if (s.includes('metre') || s.includes('meter') || s.includes('sq.m') || s.includes('sqm')) return 'sqm';
  if (s.includes('feet') || s.includes('sq.ft') || s.includes('sqft')) return 'sqft';
  return 'acre';
}
