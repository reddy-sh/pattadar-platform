/** Home v3 insight helpers — pure and testable (CL-237/243/250/255). */

/** CL-250: distinguishable single-hue alpha steps for n segments (n≥1). */
export function tintAlphas(n: number): number[] {
  if (n <= 1) return [1];
  const span = 0.65; // 1.0 → 0.35
  return Array.from({ length: n }, (_, i) => Math.round((1 - (i * span) / (n - 1)) * 100) / 100);
}

export interface MoneyInput {
  estimatedValue: number;
  totalPurchase: number;
  totalLoans: number;
}
export interface MoneyLine {
  kind: 'value' | 'cta';
  value?: number;
  gainPct?: number | null;
  loans?: number;
}
/** CL-237/255: real numbers when present; a CTA — never a blank ₹0 — when not. */
export function heroMoney(m: MoneyInput): MoneyLine {
  if (m.estimatedValue > 0 || m.totalPurchase > 0) {
    const gainPct =
      m.estimatedValue > 0 && m.totalPurchase > 0
        ? Math.round(((m.estimatedValue - m.totalPurchase) / m.totalPurchase) * 100)
        : null;
    return { kind: 'value', value: m.estimatedValue || m.totalPurchase, gainPct, loans: m.totalLoans };
  }
  return { kind: 'cta' };
}

export interface UpcomingItem {
  label: string;
  href: string;
  daysOver: number;
}
/** CL-243: forward-looking items from the dates the schema already records. */
export function upcomingFromRecords(
  parcels: { id: string; surveyNo?: string | null; taxPaidUpto?: string | null; ecDate?: string | null }[],
  now: Date,
): UpcomingItem[] {
  const out: UpcomingItem[] = [];
  const day = 86_400_000;
  for (const p of parcels) {
    if (p.taxPaidUpto) {
      const d = new Date(p.taxPaidUpto);
      if (!Number.isNaN(d.getTime()) && d.getTime() < now.getTime()) {
        out.push({
          label: `Land revenue: paid only up to ${d.getFullYear()} (Sy ${p.surveyNo ?? '—'})`,
          href: `/holding/${p.id}?kind=parcel`,
          daysOver: Math.floor((now.getTime() - d.getTime()) / day),
        });
      }
    }
    if (p.ecDate) {
      const d = new Date(p.ecDate);
      if (!Number.isNaN(d.getTime()) && now.getTime() - d.getTime() > 365 * day) {
        out.push({
          label: `EC is over a year old (Sy ${p.surveyNo ?? '—'}) — consider a fresh one`,
          href: `/holding/${p.id}?kind=parcel`,
          daysOver: Math.floor((now.getTime() - d.getTime()) / day) - 365,
        });
      }
    }
  }
  return out.sort((a, b) => b.daysOver - a.daysOver).slice(0, 4);
}
