/**
 * Rupee formatting — Indian digit grouping (₹12,34,567) via Intl 'en-IN'.
 * Pure functions, no dependencies.
 */

const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const numberIN = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** Full rupee amount with Indian grouping: 1234567 → "₹12,34,567". */
export function formatINR(value: number): string {
  return inrWhole.format(Math.round(Number(value) || 0));
}

/** Plain Indian-grouped number (no currency symbol): 1234567 → "12,34,567". */
export function formatNumberIN(value: number): string {
  return numberIN.format(Math.round(Number(value) || 0));
}

/**
 * Compact rupee amount in Indian units: ≥1 crore → "₹1.24 Cr",
 * ≥1 lakh → "₹8.5 L", else full grouping.
 */
export function formatINRCompact(value: number): string {
  const n = Math.round(Number(value) || 0);
  const trim = (x: number) => x.toFixed(2).replace(/\.?0+$/, '');
  if (Math.abs(n) >= 1e7) return `₹${trim(n / 1e7)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${trim(n / 1e5)} L`;
  return inrWhole.format(n);
}
