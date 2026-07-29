/**
 * Give a classified document a name a human can find later.
 *
 * `doc-3c8f1a2e…` tells the owner nothing. Once the AI has read the file we
 * know its type and usually its village, survey number or owner, so the name
 * can say what the document IS: "ROR-Adangal · Katragunta · Sy 71-2 ·
 * 27-07-2026". Slashes and other path-hostile characters are stripped because
 * this becomes a real filename on disk.
 */

const SAFE = (s?: string | null) =>
  String(s ?? '')
    .replace(/[\/\\:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

function dmy(iso?: string | null): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const s = String(iso ?? '').trim();
  // A date-only string is a CALENDAR date, not an instant: `new Date('2026-07-27')`
  // parses as UTC midnight and renders as the 26th anywhere west of Greenwich.
  const dateOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) return `${dateOnly[3]}-${dateOnly[2]}-${dateOnly[1]}`;
  const d = s ? new Date(s) : new Date();
  const use = Number.isNaN(d.getTime()) ? new Date() : d;
  return `${p(use.getDate())}-${p(use.getMonth() + 1)}-${use.getFullYear()}`;
}

export interface DocNameParts {
  docType?: string | null;
  village?: string | null;
  surveyNo?: string | null;
  ownerName?: string | null;
  documentNo?: string | null;
  regYear?: string | null;
  date?: string | null;
}

/** Human-facing display name, no extension. */
export function documentDisplayName(p: DocNameParts): string {
  const type = SAFE(p.docType) || 'Document';
  const bits: string[] = [type];
  const where = SAFE(p.village);
  if (where) bits.push(where);
  const sy = SAFE(p.surveyNo);
  if (sy) bits.push(`Sy ${sy}`);
  else if (SAFE(p.ownerName)) bits.push(SAFE(p.ownerName));
  const docNo = SAFE(p.documentNo);
  if (docNo) bits.push(`No ${docNo}${p.regYear ? `-${SAFE(p.regYear)}` : ''}`);
  bits.push(dmy(p.date));
  return bits.join(' · ');
}

/** Filename for the on-disk copy: same name, path-safe, with the extension kept. */
export function documentFileName(p: DocNameParts, originalName: string): string {
  const ext = (originalName.match(/\.[A-Za-z0-9]{1,5}$/) ?? [''])[0].toLowerCase();
  const base = documentDisplayName(p).replace(/ · /g, ' - ').replace(/[^\w\-. ]+/g, '');
  return `${base}${ext}`.slice(0, 120);
}


/**
 * CL-483/498/513: display form for a stored Aadhaar reference.
 *
 * The stored value uses ASCII hyphens ("XXXX-XXXX-8203"); the app font renders
 * those long enough to read as en-dashes, which has been reported three times.
 * Spaces remove the ambiguity and match the format printed on the card.
 */
export function formatAadhaarMask(masked?: string | null): string {
  return String(masked ?? '').replace(/[-\u2013\u2014]/g, ' ').replace(/\s+/g, ' ').trim();
}


/**
 * Drop a leading document-type prefix from a display name when the type is
 * already shown beside it (as a chip).
 *
 * The filename keeps the type — it is useful once a file leaves the app — but
 * on screen "Aadhaar · Aadhaar - Sankara Reddy Telukutla" spends the row's
 * width saying the same word twice and truncates the part that identifies WHO
 * it belongs to.
 */
export function stripTypePrefix(name: string, docType?: string | null): string {
  const n = String(name ?? '').trim();
  const t = String(docType ?? '').trim();
  if (!n || !t) return n;
  // Compare loosely: "ROR/Adangal" is written "ROR-Adangal" in a filename.
  const loose = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const seps = [' - ', ' · ', ' — ', '-', '·'];
  for (const sep of seps) {
    const idx = n.indexOf(sep);
    if (idx > 0 && loose(n.slice(0, idx)) === loose(t)) {
      return n.slice(idx + sep.length).trim();
    }
  }
  return loose(n) === loose(t) ? n : n;
}
