/**
 * Land-record field registry (CL-289/290/291).
 *
 * ONE definition of what a complete record means, shared by web and mobile so
 * neither head can drift. Field `key`s are persisted identifiers — renaming one
 * after data exists requires a migration, so they are deliberately boring and
 * descriptive. Keys are AP-specific (Bhu Bharati re-survey, 22A, CCRC) and
 * should be reviewed by a local document writer before the first production
 * write; `REGISTRY_VERSION` exists so that review can be tracked.
 */

export const REGISTRY_VERSION = 1;

export type HoldingKind = 'agri' | 'plot' | 'house_site' | 'commercial';
export type FieldTier = 1 | 2 | 3;
export type FieldType =
  | 'doc'
  | 'doc[]'
  | 'text'
  | 'date'
  | 'number'
  | 'money'
  | 'geo'
  | 'enum'
  | 'bool'
  | 'image[]'
  | 'ref'
  | 'group';
/** unknown ≠ not_available: only `unknown` counts as missing (CL-289). */
export type FieldState = 'filled' | 'not_available' | 'unknown';
export type FieldSource = 'manual' | 'govt_api' | 'ocr' | 'imported';

export type FieldGroup =
  | 'title'
  | 'boundary'
  | 'legal'
  | 'dues'
  | 'cultivation'
  | 'assets'
  | 'financial'
  | 'succession';

export interface FieldDef {
  key: string;
  label: string;
  tier: FieldTier;
  group: FieldGroup;
  appliesTo: HoldingKind[];
  type: FieldType;
  /** Contribution to the completeness score. Tier 1 title work dominates. */
  weight: number;
  /** Field carries an expiry the Upcoming module should watch (CL-243/297). */
  expires?: boolean;
  options?: string[];
  help?: string;
}

export const GROUP_LABELS: Record<FieldGroup, string> = {
  title: 'Title & ownership',
  boundary: 'Boundary & survey',
  legal: 'Legal status',
  dues: 'Dues & payments',
  cultivation: 'Cultivation & schemes',
  assets: 'Assets & access',
  financial: 'Financial',
  succession: 'Succession',
};

export const GROUP_ORDER: FieldGroup[] = [
  'title',
  'boundary',
  'legal',
  'dues',
  'cultivation',
  'assets',
  'financial',
  'succession',
];

const AGRI: HoldingKind[] = ['agri'];
const BUILT: HoldingKind[] = ['plot', 'house_site', 'commercial'];
const ALL: HoldingKind[] = ['agri', 'plot', 'house_site', 'commercial'];

export const FIELDS: FieldDef[] = [
  // ── Tier 1 · Title ────────────────────────────────────────────────────────
  { key: 'sale_deed', label: 'Sale deed', tier: 1, group: 'title', appliesTo: ALL, type: 'doc', weight: 10 },
  { key: 'parent_documents', label: 'Parent documents', tier: 1, group: 'title', appliesTo: ALL, type: 'doc[]', weight: 6,
    help: 'The prior title chain a buyer’s advocate will ask for.' },
  { key: 'pattadar_passbook', label: 'Pattadar passbook', tier: 1, group: 'title', appliesTo: AGRI, type: 'doc', weight: 8 },
  { key: 'title_deed_booklet', label: 'Title deed booklet', tier: 1, group: 'title', appliesTo: AGRI, type: 'doc', weight: 5 },
  { key: 'ror_1b', label: 'ROR 1-B', tier: 1, group: 'title', appliesTo: AGRI, type: 'doc', weight: 7 },
  { key: 'adangal_pahani', label: 'Adangal / Pahani', tier: 1, group: 'title', appliesTo: AGRI, type: 'doc', weight: 6 },
  { key: 'ec_certificate', label: 'Encumbrance certificate', tier: 1, group: 'title', appliesTo: ALL, type: 'doc', weight: 8, expires: true },
  { key: 'mutation_order', label: 'Mutation order', tier: 1, group: 'title', appliesTo: ALL, type: 'doc', weight: 6 },
  { key: 'prohibited_22a', label: 'Section 22A status', tier: 1, group: 'title', appliesTo: ALL, type: 'enum', weight: 6,
    options: ['not_listed', 'listed'], help: 'Listed properties cannot be registered.' },

  // ── Tier 1 · Boundary ─────────────────────────────────────────────────────
  { key: 'fmb_sketch', label: 'FMB sketch', tier: 1, group: 'boundary', appliesTo: AGRI, type: 'doc', weight: 8 },
  { key: 'resurvey_record', label: 'Re-survey record (Bhu Bharati)', tier: 1, group: 'boundary', appliesTo: AGRI, type: 'doc', weight: 5 },
  { key: 'boundary_north', label: 'Boundary — north', tier: 2, group: 'boundary', appliesTo: ALL, type: 'text', weight: 2 },
  { key: 'boundary_south', label: 'Boundary — south', tier: 2, group: 'boundary', appliesTo: ALL, type: 'text', weight: 2 },
  { key: 'boundary_east', label: 'Boundary — east', tier: 2, group: 'boundary', appliesTo: ALL, type: 'text', weight: 2 },
  { key: 'boundary_west', label: 'Boundary — west', tier: 2, group: 'boundary', appliesTo: ALL, type: 'text', weight: 2 },
  { key: 'gps_point', label: 'GPS location', tier: 1, group: 'boundary', appliesTo: ALL, type: 'geo', weight: 4 },
  { key: 'boundary_polygon', label: 'Boundary outline', tier: 2, group: 'boundary', appliesTo: ALL, type: 'geo', weight: 3 },
  { key: 'demarcation_photos', label: 'Demarcation photos', tier: 3, group: 'boundary', appliesTo: ALL, type: 'image[]', weight: 2 },

  // ── Tier 2 · Legal status ─────────────────────────────────────────────────
  { key: 'land_classification', label: 'Land classification', tier: 2, group: 'legal', appliesTo: AGRI, type: 'enum', weight: 6,
    options: ['patta', 'assigned_dform', 'inam', 'endowment', 'bhoodan', 'govt'] },
  { key: 'assigned_restriction', label: 'Assigned-land restriction', tier: 2, group: 'legal', appliesTo: AGRI, type: 'bool', weight: 3 },
  { key: 'agency_area_ltr', label: 'Agency area (LTR)', tier: 2, group: 'legal', appliesTo: AGRI, type: 'bool', weight: 3 },
  { key: 'ceiling_clearance', label: 'Ceiling clearance', tier: 2, group: 'legal', appliesTo: AGRI, type: 'doc', weight: 2 },
  { key: 'litigation', label: 'Litigation', tier: 2, group: 'legal', appliesTo: ALL, type: 'group', weight: 4 },
  { key: 'mortgage', label: 'Mortgage', tier: 2, group: 'legal', appliesTo: ALL, type: 'group', weight: 4 },
  { key: 'nala_conversion', label: 'NALA conversion', tier: 2, group: 'legal', appliesTo: ALL, type: 'doc', weight: 3 },

  // ── Tier 2 · Dues ─────────────────────────────────────────────────────────
  { key: 'land_revenue_receipts', label: 'Land revenue receipts', tier: 2, group: 'dues', appliesTo: AGRI, type: 'doc[]', weight: 4, expires: true },
  { key: 'water_cess_receipts', label: 'Water cess receipts', tier: 2, group: 'dues', appliesTo: AGRI, type: 'doc[]', weight: 2, expires: true },
  { key: 'municipal_property_tax', label: 'Property tax', tier: 2, group: 'dues', appliesTo: BUILT, type: 'doc', weight: 4, expires: true },

  // ── Tier 2 · Cultivation ──────────────────────────────────────────────────
  { key: 'ecrop_booking', label: 'e-Crop booking', tier: 2, group: 'cultivation', appliesTo: AGRI, type: 'group', weight: 4, expires: true },
  { key: 'ccrc', label: 'CCRC (cultivator card)', tier: 2, group: 'cultivation', appliesTo: AGRI, type: 'doc', weight: 2 },
  { key: 'lease_agreement', label: 'Lease agreement', tier: 2, group: 'cultivation', appliesTo: ALL, type: 'group', weight: 3, expires: true },
  { key: 'rythu_bharosa', label: 'Rythu Bharosa', tier: 3, group: 'cultivation', appliesTo: AGRI, type: 'enum', weight: 2,
    options: ['enrolled', 'not_enrolled'] },
  { key: 'pm_kisan', label: 'PM-KISAN', tier: 3, group: 'cultivation', appliesTo: AGRI, type: 'enum', weight: 2,
    options: ['enrolled', 'not_enrolled'] },
  { key: 'crop_insurance_pmfby', label: 'Crop insurance (PMFBY)', tier: 3, group: 'cultivation', appliesTo: AGRI, type: 'group', weight: 2, expires: true },
  { key: 'soil_health_card', label: 'Soil health card', tier: 3, group: 'cultivation', appliesTo: AGRI, type: 'doc', weight: 1 },

  // ── Tier 3 · Assets & access ──────────────────────────────────────────────
  { key: 'borewells', label: 'Borewells', tier: 3, group: 'assets', appliesTo: AGRI, type: 'group', weight: 2 },
  { key: 'electricity_service_no', label: 'Electricity service no.', tier: 3, group: 'assets', appliesTo: ALL, type: 'text', weight: 1 },
  { key: 'pump_set', label: 'Pump set', tier: 3, group: 'assets', appliesTo: AGRI, type: 'text', weight: 1 },
  { key: 'irrigation_source', label: 'Irrigation source', tier: 3, group: 'assets', appliesTo: AGRI, type: 'enum', weight: 2,
    options: ['canal', 'borewell', 'rainfed', 'lift', 'tank'] },
  { key: 'access_road_right', label: 'Access / road right', tier: 2, group: 'assets', appliesTo: ALL, type: 'enum', weight: 4,
    options: ['direct', 'pathway_right', 'landlocked'] },
  { key: 'fencing', label: 'Fencing', tier: 3, group: 'assets', appliesTo: ALL, type: 'bool', weight: 1 },
  { key: 'farm_shed', label: 'Farm shed', tier: 3, group: 'assets', appliesTo: AGRI, type: 'bool', weight: 1 },
  { key: 'well', label: 'Well', tier: 3, group: 'assets', appliesTo: AGRI, type: 'bool', weight: 1 },
  { key: 'tree_plantation_inventory', label: 'Trees / plantation', tier: 3, group: 'assets', appliesTo: AGRI, type: 'text', weight: 1 },

  // ── Tier 3 · Financial ────────────────────────────────────────────────────
  { key: 'purchase_price', label: 'Purchase price', tier: 3, group: 'financial', appliesTo: ALL, type: 'money', weight: 2 },
  { key: 'purchase_date', label: 'Purchase date', tier: 3, group: 'financial', appliesTo: ALL, type: 'date', weight: 2 },
  { key: 'stamp_duty_paid', label: 'Stamp duty paid', tier: 3, group: 'financial', appliesTo: ALL, type: 'money', weight: 1 },
  { key: 'sro_guideline_value', label: 'SRO guideline value', tier: 3, group: 'financial', appliesTo: ALL, type: 'money', weight: 2 },
  { key: 'market_estimate', label: 'Market estimate', tier: 3, group: 'financial', appliesTo: ALL, type: 'money', weight: 2 },
  { key: 'annual_lease_income', label: 'Annual lease income', tier: 3, group: 'financial', appliesTo: ALL, type: 'money', weight: 1 },
  { key: 'outstanding_loan', label: 'Outstanding loan', tier: 3, group: 'financial', appliesTo: ALL, type: 'money', weight: 2 },

  // ── Tier 3 · Succession ───────────────────────────────────────────────────
  { key: 'nominee_heir', label: 'Nominee / heir', tier: 2, group: 'succession', appliesTo: ALL, type: 'ref', weight: 4 },
  { key: 'will_partition_deed', label: 'Will / partition deed', tier: 2, group: 'succession', appliesTo: ALL, type: 'doc', weight: 4 },
  { key: 'legal_heir_certificate', label: 'Legal heir certificate', tier: 3, group: 'succession', appliesTo: ALL, type: 'doc', weight: 2 },
  { key: 'heir_shares_registered', label: 'Heir shares legally recorded', tier: 3, group: 'succession', appliesTo: ALL, type: 'bool', weight: 2,
    help: 'Shares noted in Pattadar are not the same as shares recorded in law.' },

  // ── Built-property specifics (CL-291) ─────────────────────────────────────
  { key: 'layout_approval', label: 'Layout approval', tier: 1, group: 'title', appliesTo: BUILT, type: 'doc', weight: 8 },
  { key: 'lp_number', label: 'LP number', tier: 2, group: 'title', appliesTo: BUILT, type: 'text', weight: 3 },
  { key: 'dtcp_hmda_approval', label: 'DTCP / HMDA approval', tier: 1, group: 'title', appliesTo: BUILT, type: 'doc', weight: 8 },
  { key: 'building_permission', label: 'Building permission', tier: 2, group: 'legal', appliesTo: BUILT, type: 'doc', weight: 4 },
  { key: 'water_sewerage_connection', label: 'Water / sewerage connection', tier: 3, group: 'assets', appliesTo: BUILT, type: 'text', weight: 2 },
  { key: 'plot_dimensions', label: 'Plot dimensions', tier: 2, group: 'boundary', appliesTo: BUILT, type: 'group', weight: 4 },
];

/** CL-291/301: a plot must never be scored against FMB, Adangal or e-Crop. */
export function fieldsFor(kind: HoldingKind): FieldDef[] {
  return FIELDS.filter((f) => f.appliesTo.includes(kind));
}

export function fieldByKey(key: string): FieldDef | undefined {
  return FIELDS.find((f) => f.key === key);
}
