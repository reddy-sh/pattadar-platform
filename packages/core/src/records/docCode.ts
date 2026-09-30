/**
 * The two-glyph code a paper wears on its spine, and the year beside it.
 *
 * "SD 1998" answers which sale deed before the row is read. The rules are
 * ported case-for-case from the Swift `documentMono` in
 * PattadarKit/Format/DocSpine.swift, in the same order, because the order is
 * the rule: "Sale agreement" is an agreement (AG) before it is a sale (SD).
 * Web only for now; iOS keeps its own copy until the two are synced.
 */

/** The spine code for a paper, from its type or title. */
export function documentCode(docType: string): string {
  const t = docType.toLowerCase();
  if (t.includes('adangal') || t.includes('pahani')) return 'AD';
  if (t.includes('passbook') || t.includes('1b') || t.includes('1-b') || t.includes('ror')) return '1B';
  if (t.includes('mutation')) return 'MU';
  if (t.includes('fmb') || t.includes('tippon') || t.includes('map') || t.includes('sketch')) return 'FM';
  if (t.includes('encumbrance') || t === 'ec' || t.startsWith('ec ')) return 'EC';
  if (t.includes('aadhaar') || t.includes('aadhar')) return 'AA';
  if (t === 'pan' || t.includes('pan card') || t.includes('permanent account')) return 'PA';
  if (t.includes('tax') || t.includes('receipt') || t.includes('kist') || t.includes('challan')) return '₹';
  if (t.includes('sethwar')) return 'SE';
  if (t.includes('khasra')) return 'KH';
  if (t.includes('gpa') || t.includes('attorney')) return 'GP';
  if (t.includes('gift')) return 'GD';
  if (t.includes('partition')) return 'PD';
  if (t.includes('will') || t.includes('testament')) return 'WL';
  if (t.includes('agreement')) return 'AG';
  if (t.includes('sale') || t.includes('deed') || t.includes('conveyance')) return 'SD';
  const initials = docType
    .split(/[^\p{L}]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return initials || '?';
}

// A four-digit year, optionally a revenue year ("2025-26"). The two-digit
// tail only counts when nothing follows it, so a date ("2026-08-02") reads
// as its year, 2026, never as the revenue year "2026-08".
const YEAR = /(?<!\d)(1[89]\d{2}|20\d{2})(?:-(\d{2})(?![\d-]))?(?!\d)/;

/**
 * The year a paper names, read from its title first and its detail line
 * second: "1998" from "Sale deed 4412 of 1998", "2025-26" from "Adangal
 * 2025-26". Empty when neither says one — a spine never guesses a year.
 */
export function documentYear(title: string, detail = ''): string {
  for (const text of [title, detail]) {
    const m = YEAR.exec(text || '');
    if (m) return m[2] ? `${m[1]}-${m[2]}` : m[1];
  }
  return '';
}
