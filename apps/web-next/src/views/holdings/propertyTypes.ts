/**
 * Pure type-definition data for the non-agricultural property register
 * (ported verbatim from the predecessor pattadar app's propertyTypes.ts). Drives
 * the type-adaptive Add-Property form.
 */
export interface AttrField {
  key: string;
  label: string;
  input: 'text' | 'number';
}
export interface PropertyTypeDef {
  type: string;
  label: string;
  icon: string; // emoji used on cards/nav chips
  areaBasis: 'land' | 'builtup' | 'both';
  attributeFields: AttrField[];
}

const FLAT_FIELDS: AttrField[] = [
  { key: 'tower_block', label: 'Tower / Block', input: 'text' },
  { key: 'unit_no', label: 'Flat / Unit No.', input: 'text' },
  { key: 'floor', label: 'Floor', input: 'text' },
  { key: 'facing', label: 'Facing', input: 'text' },
  { key: 'bhk', label: 'BHK', input: 'text' },
  { key: 'carpet_area', label: 'Carpet Area (sq.ft)', input: 'number' },
  { key: 'super_builtup_area', label: 'Super Built-up (sq.ft)', input: 'number' },
  { key: 'uds', label: 'Undivided Share (sq.yd)', input: 'number' },
  { key: 'parking_slots', label: 'Parking Slots', input: 'number' },
];
const PLOT_FIELDS: AttrField[] = [
  { key: 'plot_no', label: 'Plot No.', input: 'text' },
  { key: 'dimensions', label: 'Dimensions (e.g. 30x75)', input: 'text' },
  { key: 'corner', label: 'Corner (yes/no)', input: 'text' },
  { key: 'road_width', label: 'Road Width (ft)', input: 'number' },
  { key: 'layout', label: 'Layout / Colony', input: 'text' },
];
const BUILDING_FIELDS: AttrField[] = [
  { key: 'floors', label: 'Floors', input: 'number' },
  { key: 'total_units', label: 'Rentable Units', input: 'number' },
  { key: 'monthly_rent', label: 'Monthly Rent (₹)', input: 'number' },
  { key: 'lift', label: 'Lift (yes/no)', input: 'text' },
  { key: 'power_load', label: 'Power Load (kW)', input: 'number' },
];
const HOUSE_FIELDS: AttrField[] = [...BUILDING_FIELDS, { key: 'layout', label: 'Layout / Colony', input: 'text' }];

export const PROPERTY_TYPES: PropertyTypeDef[] = [
  { type: 'open_plot', label: 'Open Plot / Site', icon: '🟩', areaBasis: 'land', attributeFields: PLOT_FIELDS },
  { type: 'flat', label: 'Flat / Apartment', icon: '🏢', areaBasis: 'builtup', attributeFields: FLAT_FIELDS },
  { type: 'independent_house', label: 'Independent House', icon: '🏠', areaBasis: 'both', attributeFields: HOUSE_FIELDS },
  { type: 'villa', label: 'Villa', icon: '🏡', areaBasis: 'both', attributeFields: HOUSE_FIELDS },
  { type: 'commercial', label: 'Commercial Building', icon: '🏬', areaBasis: 'builtup', attributeFields: BUILDING_FIELDS },
  { type: 'rental', label: 'Rental Building', icon: '🏨', areaBasis: 'builtup', attributeFields: BUILDING_FIELDS },
  { type: 'other', label: 'Other', icon: '📦', areaBasis: 'both', attributeFields: [] },
];

export function propertyTypeDef(type: string): PropertyTypeDef {
  return PROPERTY_TYPES.find((t) => t.type === type) || PROPERTY_TYPES[0];
}
export function attributeFieldsFor(type: string): AttrField[] {
  return propertyTypeDef(type).attributeFields;
}

/** Classifier display label (from the AI extraction) → doc_type key. */
const TYPE_MAP: Record<string, string> = {
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

export function classifierToType(raw: string): string {
  return TYPE_MAP[String(raw || '').trim().toLowerCase()] || 'other';
}
