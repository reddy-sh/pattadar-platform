/**
 * Land-area units (ported from the predecessor's pattadar app's units.ts concepts).
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

/** Display order for pickers / converter grid. */
export const UNITS: { key: UnitKey; label: string; short: string }[] = [
  { key: 'acre', label: 'Acres', short: 'ac' },
  { key: 'cent', label: 'Cents', short: 'ct' },
  { key: 'gunta', label: 'Guntas', short: 'g' },
  { key: 'sqyd', label: 'Sq. yards', short: 'sq.yd' },
  { key: 'sqft', label: 'Sq. feet', short: 'sq.ft' },
  { key: 'sqm', label: 'Sq. metres', short: 'sq.m' },
  { key: 'hectare', label: 'Hectares', short: 'ha' },
  { key: 'ankanam', label: 'Ankanam', short: 'ank' },
];

export const round2 = (n: number): number =>
  Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;

export function toAcres(value: number, unit: UnitKey): number {
  return ((Number(value) || 0) * UNIT_SQFT[unit]) / SQFT_PER_ACRE;
}

export function fromAcres(acres: number, unit: UnitKey): number {
  return ((Number(acres) || 0) * SQFT_PER_ACRE) / UNIT_SQFT[unit];
}

export function convert(value: number, from: UnitKey, to: UnitKey): number {
  return fromAcres(toAcres(value, from), to);
}

export function acresToAll(acres: number): { key: UnitKey; label: string; value: number }[] {
  return UNITS.map((u) => ({ key: u.key, label: u.label, value: fromAcres(acres, u.key) }));
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

export function unitLabel(label: string): string {
  const u = UNITS.find((x) => x.key === unitKey(label));
  return u ? u.label : label;
}

/** Global extent-display preference (CL-13). */
export type ExtentPref = 'acres-cents' | 'acres-guntas' | 'cents' | 'sqyd';

/** THE extent formatter (CL-14) — every surface renders through this. */
export function formatExtent(acres: number, pref: ExtentPref = 'acres-cents'): string {
  const a = Number(acres) || 0;
  switch (pref) {
    case 'acres-guntas':
      return formatAcresGuntas(a);
    case 'cents':
      return `${round2(a * 100).toLocaleString('en-IN')} Cents`;
    case 'sqyd':
      return `${Math.round(a * 4840).toLocaleString('en-IN')} Sq.yd`;
    default:
      return formatArea(a);
  }
}

/** Natural sort for survey numbers: numeric-aware, treats "/" and "-" alike
 * ("1/2" < "1/10"; "126/2" == "126-2" positionally). */
export function naturalCompare(a: string, b: string): number {
  const split = (s: string) => (s || '').split(/[\/\-.]/).map((p) => p.trim());
  const pa = split(a);
  const pb = split(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? '';
    const y = pb[i] ?? '';
    if (x === y) continue;
    const nx = Number(x);
    const ny = Number(y);
    if (Number.isFinite(nx) && Number.isFinite(ny)) return nx - ny;
    return x.localeCompare(y, undefined, { numeric: true });
  }
  return 0;
}
