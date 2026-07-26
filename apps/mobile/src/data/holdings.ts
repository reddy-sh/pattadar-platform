/**
 * Holdings normalization — parcels and properties flattened into one list row,
 * ported from apps/web/src/pages/LandPropertiesPage.tsx (same titles, same
 * value fallbacks, same status/litigation precedence).
 */
import { formatArea } from '@pattadar/core';
import type { Parcel, Property } from '@pattadar/core';

import type { HoldingsData } from './hooks';

export interface Holding {
  id: string;
  kind: 'parcel' | 'property';
  title: string;
  owner: string;
  location: string;
  extentLabel: string;
  value: number;
  status: string;
  litigation: boolean;
  stake: string;
  typeLabel: string;
  isAgri: boolean;
  khata: string;
  groupName: string;
  createdAt: string;
  /** Owning passbook id for parcels ('' for properties) — khata filtering. */
  passbookId: string;
}

/** Verbatim from apps/web/src/pages/holdings/propertyTypes.ts PROPERTY_TYPES. */
const PROPERTY_TYPE_LABELS: Record<string, string> = {
  open_plot: 'Open Plot / Site',
  flat: 'Flat / Apartment',
  independent_house: 'Independent House',
  villa: 'Villa',
  commercial: 'Commercial Building',
  rental: 'Rental Building',
  other: 'Other',
};
/** Web propertyTypeDef falls back to PROPERTY_TYPES[0]. */
const PROPERTY_TYPE_FALLBACK = PROPERTY_TYPE_LABELS.open_plot;

function parcelRow(
  p: Parcel,
  pb: HoldingsData['passbooks'][number] | undefined,
  groupName: string,
): Holding {
  return {
    id: p.id,
    kind: 'parcel',
    title: `Sy ${p.surveyNo}${p.subdivision ? `/${p.subdivision}` : ''}`,
    owner: p.currentOwner || '—',
    location: pb
      ? [pb.village, pb.mandal, pb.district].filter(Boolean).join(', ') || '—'
      : '—',
    extentLabel: formatArea(Number(p.extent) || 0),
    value: Number(p.marketValue) || Number(p.purchasePrice) || 0,
    status: p.status || 'owned',
    litigation: p.litigation === true,
    stake: p.stake || 'owned',
    typeLabel: p.classification === 'agri' ? 'agri' : 'non-agri',
    isAgri: p.classification === 'agri',
    khata: pb?.pattadarNo || '—',
    groupName,
    createdAt: p.createdAt,
    passbookId: p.passbookId,
  };
}

function propertyRow(p: Property, groupName: string): Holding {
  return {
    id: p.id,
    kind: 'property',
    title: p.label || '—',
    owner: p.currentOwner || '—',
    location: [p.city, p.district].filter(Boolean).join(', ') || '—',
    extentLabel: p.landArea
      ? `${p.landArea} ${p.landUnit}`
      : p.builtupArea
        ? `${p.builtupArea} ${p.builtupUnit}`
        : '—',
    value: Number(p.currentValue) || 0,
    status: p.holdingStatus || 'owned',
    litigation: false,
    stake: p.stake || 'owned',
    typeLabel: PROPERTY_TYPE_LABELS[p.type] ?? PROPERTY_TYPE_FALLBACK,
    isAgri: false,
    khata: '',
    groupName,
    createdAt: p.createdAt,
    passbookId: '',
  };
}

export function normalizeHoldings(d: HoldingsData): Holding[] {
  const pbById = new Map(d.passbooks.map((pb) => [pb.id, pb]));
  const groupName = new Map(d.groups.map((g) => [g.id, g.name]));
  const parcelRows = d.parcels.map((p) => {
    const pb = pbById.get(p.passbookId);
    return parcelRow(p, pb, (pb?.groupId && groupName.get(pb.groupId)) || '');
  });
  const propertyRows = d.properties.map((p) =>
    propertyRow(p, (p.groupId && groupName.get(p.groupId)) || ''),
  );
  return [...parcelRows, ...propertyRows];
}

/** Litigation preempts status — same precedence as the web status pill. */
export function holdingStatusLabel(h: Holding): string {
  return h.litigation ? 'Litigation' : (h.status || 'owned').replace(/-/g, ' ');
}
