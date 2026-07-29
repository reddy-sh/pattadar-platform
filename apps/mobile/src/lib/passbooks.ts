/** CL-176/179: summary arithmetic as a pure, testable function. */
export function summarizePassbooks(
  rows: { id: string; totalExtent: number | string | null }[],
  agg: Map<string, { count: number; cost: number }>,
): { passbooks: number; parcels: number; extent: number } {
  return {
    passbooks: rows.length,
    parcels: rows.reduce((s, pb) => s + (agg.get(pb.id)?.count ?? 0), 0),
    extent: rows.reduce((s, pb) => s + (Number(pb.totalExtent) || 0), 0),
  };
}
