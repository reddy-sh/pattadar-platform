/**
 * Photo categories for land parcels (CL-562).
 *
 * These are not decorative tags. Each one answers a question that gets asked in
 * a real dispute, a loan application, or an insurance claim, so the list is
 * deliberately closed — free-text tagging would give us a thousand spellings of
 * "boundary" and nothing queryable.
 */
export interface PhotoCategory {
  key: string;
  label: string;
  icon: string;
  /** Shown while choosing, so the choice is informed rather than guessed. */
  why: string;
}

export const PHOTO_CATEGORIES: PhotoCategory[] = [
  {
    key: 'boundary',
    label: 'Boundary / survey stone',
    icon: 'image-filter-center-focus-strong-outline',
    why: 'Proves demarcation — the most disputed thing about rural land',
  },
  { key: 'overview', label: 'Overall view', icon: 'panorama-outline', why: 'General identification of the parcel' },
  {
    key: 'crop',
    label: 'Crop / cultivation',
    icon: 'sprout-outline',
    why: 'Supports e-Crop, insurance claims and possession evidence',
  },
  {
    key: 'water',
    label: 'Water source',
    icon: 'water-outline',
    why: 'Borewell, well or canal — affects value materially',
  },
  {
    key: 'access',
    label: 'Access road / pathway',
    icon: 'road-variant',
    why: 'A landlocked parcel is an expensive surprise',
  },
  { key: 'structure', label: 'Structures', icon: 'home-outline', why: 'Shed, fencing, pump house' },
  {
    key: 'dispute',
    label: 'Encroachment / dispute',
    icon: 'alert-outline',
    why: 'Dated evidence for litigation',
  },
  {
    key: 'landmark',
    label: 'Neighbouring landmark',
    icon: 'sign-direction',
    why: 'Helps someone find the parcel on the ground',
  },
  { key: 'general', label: 'General', icon: 'dots-horizontal-circle-outline', why: 'Anything else' },
];

export function photoCategory(key: string): PhotoCategory {
  return PHOTO_CATEGORIES.find((c) => c.key === key) ?? PHOTO_CATEGORIES[PHOTO_CATEGORIES.length - 1];
}

/** Compass heading → "facing NE". '' when the phone gave no heading. */
export function headingLabel(heading?: number | null): string {
  if (heading === null || heading === undefined || !Number.isFinite(heading)) return '';
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((heading % 360) + 360) % 360) / 45) % 8;
  return `facing ${points[idx]}`;
}
