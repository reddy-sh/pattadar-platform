/**
 * Doc-type taxonomy — the `doc_type` KEYS, their labels, and the classifier
 * map (ported from the rhub pattadar app). Pure data/functions, no React.
 *
 * The shelves these group into live in @pattadar/core so the phone and the web
 * agree; see the note above `familyOfType` at the bottom of this file.
 */
import { documentFamily as coreDocumentFamily } from '@pattadar/core';

export interface DocCategory {
  key: string;
  label: string;
  group: 'deed' | 'ec' | 'record' | 'survey' | 'legal' | 'photo' | 'other';
}

export const DOC_CATEGORIES: DocCategory[] = [
  { key: 'sale_deed', label: 'Sale Deed', group: 'deed' },
  { key: 'gift_deed', label: 'Gift Deed', group: 'deed' },
  { key: 'partition_deed', label: 'Partition Deed', group: 'deed' },
  { key: 'settlement_deed', label: 'Settlement Deed', group: 'deed' },
  { key: 'gpa', label: 'GPA', group: 'deed' },
  { key: 'mortgage', label: 'Mortgage', group: 'deed' },
  { key: 'ec', label: 'Encumbrance Certificate', group: 'ec' },
  { key: 'passbook', label: 'Pattadar Passbook', group: 'record' },
  { key: 'ror_1b', label: 'ROR / Adangal (1-B)', group: 'record' },
  { key: 'fmb', label: 'FMB', group: 'survey' },
  { key: 'map', label: 'Map / Survey Sketch', group: 'survey' },
  { key: 'tax_receipt', label: 'Tax Receipt', group: 'record' },
  { key: 'legal_heir', label: 'Legal Heir / Death Cert', group: 'legal' },
  { key: 'court_order', label: 'Court Order', group: 'legal' },
  { key: 'photo', label: 'Photo', group: 'photo' },
  { key: 'video', label: 'Video', group: 'photo' },
  { key: 'other', label: 'Other', group: 'other' },
];

export const DEED_GROUP = new Set([
  'sale_deed',
  'gift_deed',
  'partition_deed',
  'settlement_deed',
  'gpa',
  'mortgage',
]);

/** Classifier display label (from /import-registered-document) → doc_type key. */
export const TYPE_MAP: Record<string, string> = {
  'sale deed': 'sale_deed',
  'gift deed': 'gift_deed',
  'partition deed': 'partition_deed',
  'settlement deed': 'settlement_deed',
  gpa: 'gpa',
  mortgage: 'mortgage',
  'encumbrance certificate': 'ec',
  ec: 'ec',
  'pattadar passbook': 'passbook',
  passbook: 'passbook',
  'ror/adangal': 'ror_1b',
  ror: 'ror_1b',
  adangal: 'ror_1b',
  pahani: 'ror_1b',
  fmb: 'fmb',
  'tax receipt': 'tax_receipt',
  map: 'map',
  'legal heir certificate': 'legal_heir',
  'court order': 'court_order',
  photo: 'photo',
  video: 'video',
  other: 'other',
};

const LABEL_OF: Record<string, string> = Object.fromEntries(
  DOC_CATEGORIES.map((c) => [c.key, c.label]),
);

export function labelOfType(type: string): string {
  return LABEL_OF[type] || 'Other';
}

export function classifierToType(raw: string): string {
  return TYPE_MAP[String(raw || '').trim().toLowerCase()] || 'other';
}

export function isDeedType(type: string): boolean {
  return DEED_GROUP.has(type);
}

/**
 * Which shelf a document sits on.
 *
 * This used to be its own taxonomy — `Deeds · EC · Records · Survey · Legal ·
 * Photos · Other` — while the phone shelved the same papers as `Title ·
 * Revenue record · Map · Identity · Search & tax · Old record · Unsorted`. One
 * vault, two filing cabinets. The shared set in @pattadar/core is now the only
 * one, and `documentFamily` there reads free text, so it can shelve a file
 * nothing has read yet.
 *
 * `DOC_CATEGORIES` above still stands: those keys ARE the `doc_type` column,
 * and the "Change type…" picker offers them. Only the grouping above them
 * moved.
 */
export { DOC_FAMILIES, documentFamily, familyBlurb, familyLabel, familyTint } from '@pattadar/core';
export type { DocFamily } from '@pattadar/core';

/** The label a category's key resolves to on a shelf. */
export function familyOfType(type: string, mimeType = ''): string {
  return coreDocumentFamily(type === 'other' ? '' : labelOfType(type), mimeType);
}
