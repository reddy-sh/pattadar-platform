/**
 * Geographic sanity checks for land records.
 *
 * CL-565: a parcel in Mangala Kunta was saved with a pin in Sunnyvale,
 * California — 13,000 km away, next to a Home Depot. The "Use my location"
 * button captured the *device's* position, and the app accepted it without a
 * word. That is the normal case, not an edge case: people file land records at
 * home, at an office, or abroad. They are almost never standing on the land.
 *
 * So a captured coordinate is treated as a claim to be checked against what the
 * record already says about itself, never as ground truth.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * How far a pin may sit from its village centre before we object.
 *
 * A village geocode resolves to the settlement, while farmland belongs to the
 * revenue village and can lie several kilometres out. 50 km is loose enough to
 * never nag about legitimately outlying fields, and tight enough that another
 * district — let alone another continent — always trips it.
 */
export const PLAUSIBLE_RADIUS_KM = 50;

export interface LocationSanity {
  /** True when the pin is implausibly far from where the record says it is. */
  suspect: boolean;
  distanceKm: number;
  /** Ready-to-render sentence, '' when nothing is wrong. */
  message: string;
}

/** Human distance: "1,200 km", "12 km", "800 m". */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString('en-IN')} km`;
}

/**
 * Check a coordinate against the record's own locality.
 *
 * `centroid` is the geocoded village/mandal. When it is unknown the answer is
 * "not suspect" — an unverifiable pin must not be reported as a wrong one.
 */
export function checkLocation(
  pin: LatLng | null | undefined,
  centroid: LatLng | null | undefined,
  placeName = '',
  radiusKm = PLAUSIBLE_RADIUS_KM,
): LocationSanity {
  if (!pin || !centroid) return { suspect: false, distanceKm: 0, message: '' };
  const distanceKm = haversineKm(pin, centroid);
  if (distanceKm <= radiusKm) return { suspect: false, distanceKm, message: '' };
  const where = placeName ? ` from ${placeName}` : ' from this record’s village';
  return {
    suspect: true,
    distanceKm,
    message: `This location is ${formatDistance(distanceKm)}${where}. Phones report where you are standing, not where the land is.`,
  };
}
