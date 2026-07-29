/**
 * Parsing an area written by a person, not a machine.
 *
 * A registered deed states extent as free text: "240", "1,200 Sq.Yds",
 * "418-1/2 sq. yards", "83.5 sq yards". Stripping every non-digit — which is
 * what both the app and the API did — turns "418-1/2" into 41812, writing a
 * hundredfold-wrong area into a land record. Vernacular fractions like
 * "418-1/2" (418 and a half) are ordinary in AP deeds, not an edge case.
 */

/** Square yards from a deed's extent string; 0 when nothing usable is present. */
export function parseAreaSqYd(raw: unknown): number {
  const s = String(raw ?? '')
    .toLowerCase()
    .replace(/,/g, '')
    .trim();
  if (!s) return 0;

  // "418-1/2" or "418 1/2" — a whole number and a vulgar fraction.
  const mixed = s.match(/(\d+)\s*[-\s]\s*(\d+)\s*\/\s*(\d+)/);
  if (mixed) {
    const [, whole, num, den] = mixed;
    const d = Number(den);
    return d ? Number(whole) + Number(num) / d : Number(whole);
  }

  // A bare fraction: "1/2".
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)/);
  if (frac) {
    const d = Number(frac[2]);
    return d ? Number(frac[1]) / d : 0;
  }

  // Otherwise the FIRST number in the string — never a concatenation of every
  // digit that happens to appear in it.
  const first = s.match(/\d+(?:\.\d+)?/);
  return first ? Number(first[0]) : 0;
}
