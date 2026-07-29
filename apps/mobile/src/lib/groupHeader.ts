/** CL-230/233: group-header content model, pure and testable. */
export interface HeaderRow {
  village: string;
  owner: string;
}

/** Dominant canonical village; "+N" when the khata spans several (CL-233). */
export function villageLabel(rows: HeaderRow[]): string {
  const freq = new Map<string, number>();
  for (const r of rows) {
    const v = r.village.trim();
    if (v && v !== '—') freq.set(v, (freq.get(v) || 0) + 1);
  }
  if (freq.size === 0) return '';
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const extra = sorted.length - 1;
  return extra > 0 ? `${sorted[0][0]} +${extra}` : sorted[0][0];
}

/** "12 parcels · Telukatla Saraswathi" — count first, owner reduced (CL-230). */
export function headerSubtitle(count: number, owner: string): string {
  const parcels = `${count} parcel${count === 1 ? '' : 's'}`;
  const o = owner.trim();
  return o && o !== '—' ? `${parcels} · ${o}` : parcels;
}
