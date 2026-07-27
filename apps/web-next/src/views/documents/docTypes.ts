/**
 * Doc-type taxonomy — ported verbatim from the rhub pattadar app's
 * docTypes.ts + documentClassify.ts (keys, labels, groups, classifier map).
 * Pure data/functions, no React imports.
 */

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

/** Family names for the filter chips (group → display family). */
const GROUP_FAMILY: Record<DocCategory['group'], string> = {
  deed: 'Deeds',
  ec: 'EC',
  record: 'Records',
  survey: 'Survey',
  legal: 'Legal',
  photo: 'Photos',
  other: 'Other',
};

const FAMILY_OF: Record<string, string> = Object.fromEntries(
  DOC_CATEGORIES.map((c) => [c.key, GROUP_FAMILY[c.group]]),
);

export const FAMILIES = ['All', 'Deeds', 'EC', 'Records', 'Survey', 'Legal', 'Photos', 'Other'];

export function familyOfType(type: string): string {
  return FAMILY_OF[type] || 'Other';
}
