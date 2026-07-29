/** CL-139: extent bars are magnitude, not completion — cap at 70% width so
 * nothing reads as "full", floor at 8% so tiny holdings stay visible. */
export function barFraction(extent: number, maxExtent: number): number {
  if (!(maxExtent > 0) || !(extent > 0)) return 0;
  return Math.max(0.08, Math.min(1, extent / maxExtent)) * 0.7;
}
