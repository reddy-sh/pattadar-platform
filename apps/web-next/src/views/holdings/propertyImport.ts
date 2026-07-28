/**
 * Pure helpers for the Add-Property AI import flow (ported verbatim from the
 * predecessor pattadar app's properties/propertyImport.ts). No React imports.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { PROPERTY_TYPES, attributeFieldsFor } from './propertyTypes';

const norm = (s: unknown) => String(s || '').trim().toLowerCase();
const KNOWN_TYPES = new Set(PROPERTY_TYPES.map((t) => t.type));

export interface PropertyFormValues {
  type: string;
  label?: string;
  city?: string;
  district?: string;
  landArea?: number;
  landUnit?: string;
  builtupArea?: number;
  builtupUnit?: string;
  acquisitionMode?: string;
  purchasePrice?: number;
  purchaseDate?: string;
  deedType?: string;
  regDocNo?: string;
  sro?: string;
  regDate?: string;
  sellerName?: string;
  buyerName?: string;
  boundaryNorth?: string;
  boundarySouth?: string;
  boundaryEast?: string;
  boundaryWest?: string;
  stampDuty?: number;
  regFee?: number;
  [attrKey: string]: unknown;
}

/** First party name matching a role (buyer/seller), tolerant of deed synonyms. "" if none. */
export function partyByRole(parties: any, role: 'seller' | 'buyer'): string {
  if (!Array.isArray(parties)) return '';
  const re = role === 'buyer' ? /buyer|vendee|purchaser|donee/i : /seller|vendor|executant|donor/i;
  const p = parties.find((x: any) => re.test(x?.role || ''));
  return p?.name ? String(p.name) : '';
}

/**
 * Extraction fields -> form values for AddPropertyDialog. Only attr keys
 * valid for the resolved type are carried over.
 */
export function mapExtractionToForm(fields: Record<string, any>): PropertyFormValues {
  const rawType = String(fields?.property_type || '');
  const type = KNOWN_TYPES.has(rawType) ? rawType : 'open_plot';
  const out: PropertyFormValues = { type, acquisitionMode: 'purchase' };
  if (fields?.label) out.label = String(fields.label);
  if (fields?.city) out.city = String(fields.city);
  if (fields?.district) out.district = String(fields.district);
  if (Number(fields?.land_area) > 0) {
    out.landArea = Number(fields.land_area);
    out.landUnit = fields.land_unit || 'Sq.yd';
  }
  if (Number(fields?.builtup_area) > 0) {
    out.builtupArea = Number(fields.builtup_area);
    out.builtupUnit = fields.builtup_unit || 'Sq.ft';
  }
  const validAttrs = new Set(attributeFieldsFor(type).map((f) => f.key));
  const attrs = fields?.attributes && typeof fields.attributes === 'object' ? fields.attributes : {};
  for (const [k, val] of Object.entries(attrs)) {
    if (validAttrs.has(k) && val !== '' && val !== 0 && val != null) out[`attr_${k}`] = val;
  }
  // transaction / registration facts
  if (fields?.acquisition_mode) out.acquisitionMode = String(fields.acquisition_mode);
  if (Number(fields?.consideration) > 0) out.purchasePrice = Number(fields.consideration);
  const _regDate = fields?.registration_date || fields?.execution_date || '';
  if (_regDate) {
    out.regDate = String(_regDate);
    out.purchaseDate = String(_regDate);
  }
  if (fields?.doc_type) out.deedType = String(fields.doc_type);
  if (fields?.document_no)
    out.regDocNo = String(fields.document_no) + (fields?.reg_year ? '/' + String(fields.reg_year) : '');
  if (fields?.sro) out.sro = String(fields.sro);
  const _seller = partyByRole(fields?.parties, 'seller');
  if (_seller) out.sellerName = _seller;
  const _buyer = partyByRole(fields?.parties, 'buyer');
  if (_buyer) out.buyerName = _buyer;
  const _b = fields?.boundaries && typeof fields.boundaries === 'object' ? fields.boundaries : {};
  if (_b.north) out.boundaryNorth = String(_b.north);
  if (_b.south) out.boundarySouth = String(_b.south);
  if (_b.east) out.boundaryEast = String(_b.east);
  if (_b.west) out.boundaryWest = String(_b.west);
  if (Number(fields?.stamp_duty) > 0) out.stampDuty = Number(fields.stamp_duty);
  if (Number(fields?.registration_fee) > 0) out.regFee = Number(fields.registration_fee);
  return out;
}

/**
 * Match an agricultural extraction to exactly one of the user's passbooks.
 * Requires a confident OWNER-name match (shared name token, not a loose
 * substring) and, when a village is present, a village match too. Returns ""
 * unless exactly one matches — so the caller safely falls back to "saved as
 * deed, pick the khata" rather than guessing.
 */
export function matchPassbook(
  fields: Record<string, any>,
  passbooks: Array<{ id: string; ownerName?: string; village?: string }>,
): string {
  const party = Array.isArray(fields?.parties)
    ? fields.parties.find((p: any) => /buyer|vendee|purchaser/i.test(p?.role || ''))
    : null;
  const owner = norm(party?.name || fields?.owner_name);
  if (!owner) return ''; // no owner extracted -> cannot confidently attribute ownership
  const ownerTokens = owner.split(/\s+/).filter(Boolean);
  const nameShares = (pbName?: string) => {
    const toks = new Set(norm(pbName).split(/\s+/).filter(Boolean));
    return ownerTokens.some((t) => toks.has(t));
  };
  let cands = passbooks.filter((pb) => pb.ownerName && nameShares(pb.ownerName));
  if (fields?.village) {
    cands = cands.filter((pb) => norm(pb.village) === norm(fields.village));
  }
  return cands.length === 1 ? cands[0].id : '';
}
