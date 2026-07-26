/**
 * Portfolio valuation primitives — ported from apps/web/src/data/portfolio.ts
 * so both heads compute identical numbers.
 *
 * DELIBERATE ASYMMETRIES (do not "fix"):
 * - The dashboard hero's farm total is the SERVER's dashboardStats.estimatedValue
 *   (AP-IGRS guideline basis), NOT Σ parcelValue — the two can disagree.
 * - propertyValue falls back to purchasePrice, but the gain calculation's
 *   property arm excludes that fallback (otherwise gain would always be zero).
 */

interface ParcelLike {
  marketValue?: number | null;
  guidelineValue?: number | null;
  purchasePrice?: number | null;
  loanAmount?: number | null;
}

interface PropertyLike {
  currentValue?: number | null;
  marketValue?: number | null;
  guidelineValue?: number | null;
  purchasePrice?: number | null;
}

export function parcelValue(p: ParcelLike): number {
  return p.marketValue || p.guidelineValue || 0;
}

export function propertyValue(p: PropertyLike): number {
  return p.currentValue || p.marketValue || p.guidelineValue || p.purchasePrice || 0;
}

export function totalLoans(parcels: ParcelLike[]): number {
  return parcels.reduce((s, p) => s + (p.loanAmount || 0), 0);
}

/** Farm/property split for the hero bar; propPct forced complement of farmPct. */
export function splitShares(farm: number, prop: number): { farmPct: number; propPct: number } {
  const total = farm + prop;
  if (total <= 0) return { farmPct: 0, propPct: 0 };
  const farmPct = Math.round((farm / total) * 100);
  return { farmPct, propPct: 100 - farmPct };
}

/** Per-asset appreciation percent, null when either side is unknown. */
export function assetGainPct(value: number, purchasePrice: number): number | null {
  return value > 0 && purchasePrice > 0
    ? Math.round(((value - purchasePrice) / purchasePrice) * 100)
    : null;
}
