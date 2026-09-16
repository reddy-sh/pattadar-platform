/** How a read document becomes a filed paper.
 *
 *  This lived inside RecordPapers, which was fine while the Papers screen was
 *  the only place a file could enter a record. The add-a-record drawer now
 *  reads a deed too, and a deed filed on the way IN must land under the same
 *  name, on the same shelf, as the identical deed dropped on the Papers screen
 *  five minutes later. Two copies of this logic would have drifted the first
 *  time either one was touched.
 */
import { familyOfType } from '../pages/documents/docTypes';
import type { Reading } from '../pages/documents/upload';

/** dd/mm/yyyy for a freshly filed paper's one-line detail. */
export const filedToday = (): string => {
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/** The core families and the Papers screen's shelf keys agree on all but two. */
const SHELF_OF_FAMILY: Record<string, string> = {
  old_record: 'old', photo: 'photos',
};

export interface PaperRow {
  name: string; subtitle: string; shelf: string; pageCount: number;
}

/** What to file a paper as when nothing could be read from it: its own
 *  filename, today's date, and Unsorted — which is exactly where a person can
 *  find it and sort it by hand. */
export const unreadRow = (name: string, mimeType: string): PaperRow => ({
  name, subtitle: `Filed ${filedToday()}`, shelf: '',
  pageCount: mimeType.startsWith('image/') ? 1 : 0,
});

/** Turn a reading into the row a filed paper should be.
 *
 *  The seeded papers read "Partition deed 853/2025 / Registered 26/08/2013 ·
 *  SRO Tarlupadu / Title". An upload that lands as "Family Partitions.pdf /
 *  Filed 23/08/2026 / Unsorted" is the same drawer holding two different
 *  vocabularies, and the filename is the least useful thing known about the
 *  file. So the reading names it the way the register does.
 *
 *  Everything is a fallback: a classifier that returns nothing must still
 *  leave a filed paper, under its own filename, in Unsorted. */
export function describeReading(r: Reading, file: File): PaperRow {
  const f = r.fields as Record<string, unknown>;
  const str = (k: string) => String(f[k] ?? '').trim();
  const label = r.docTypeLabel || '';
  const no = str('document_no');
  const yr = str('reg_year');

  // "Partition Deed 853/2025" — how a deed is actually referred to.
  const named = label && no && yr ? `${label} ${no}/${yr}`
    : label && no ? `${label} ${no}`
    : label || '';

  const bits = [
    str('registration_date') ? `Registered ${str('registration_date')}` : '',
    str('sro'),
    str('village'),
  ].filter(Boolean);

  const family = familyOfType(r.docType, file.type);
  return {
    name: named || file.name,
    subtitle: bits.join(' · ') || `Filed ${filedToday()}`,
    shelf: SHELF_OF_FAMILY[family] ?? family,
    pageCount: file.type.startsWith('image/') ? 1 : 0,
  };
}
