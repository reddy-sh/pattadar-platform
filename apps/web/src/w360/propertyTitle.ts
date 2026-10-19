/** The browser tab's name on a property page: "LP 262/1 · 2.40 acres", so a
 *  row of tabs says which parcel each one is. PageHead adds " · Pattadar". */
const UNIT_WORD: Record<string, string> = { ac: 'acres', 'sq.yd': 'sq yds', 'sq.ft': 'sq ft' };

export function propertyTabTitle(rec: {
  title: string; surveyNo: string; extent: number; extentUnit: string;
}): string {
  const lp = (rec.surveyNo ?? '').trim();
  const name = lp ? `LP ${lp}` : rec.title;
  if (!(rec.extent > 0)) return name;
  // Formatted as the extent chip in RecordHead writes it: acres to two places.
  const dp = rec.extentUnit === 'ac' ? 2 : 0;
  const n = rec.extent.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const unit = rec.extentUnit === 'ac' && rec.extent === 1 ? 'acre' : (UNIT_WORD[rec.extentUnit] ?? rec.extentUnit);
  return `${name} · ${n} ${unit}`;
}
