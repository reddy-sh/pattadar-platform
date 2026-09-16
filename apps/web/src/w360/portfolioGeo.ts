/** What "located" means, kept out of PortfolioCanvas so the page can ask
 *  without loading Leaflet.
 *
 *  The page needs this to say the honest sentence under the map — how many of
 *  your records it could actually draw — and that sentence must agree with the
 *  map exactly. Two copies of this rule, one in the panel and one in the
 *  caption, would drift the first time either changed and the caption would
 *  start counting a different set from the one on screen. */

/** The shape of a record as the portfolio map reads it. */
export interface Located {
  ring: Array<[number, number]>;
  lat: number;
  lon: number;
}

/** A record is drawable when it has a surveyed outline or a real pin.
 *
 *  A pin at 0,0 is not a pin. That is null island in the Gulf of Guinea, and
 *  it is exactly what an empty `geo_point` parses to — plotting a record there
 *  has not failed to locate it, it has located it wrongly, which is the worse
 *  of the two failures. The 0.01° tolerance is about 1.1 km, and there is no
 *  land record in Andhra Pradesh or Telangana within a thousand kilometres of
 *  the origin, so nothing real is being excluded. */
export const validCoordinate = (lat: number, lon: number) =>
  Number.isFinite(lat) && Number.isFinite(lon)
  && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/** Reject a damaged outline as a whole. Dropping a bad corner and joining its
 * neighbours would silently change the land the owner is looking at. */
export const hasBoundaryRing = (ring: ReadonlyArray<readonly [number, number]>) =>
  ring.length >= 3
  && ring.every(([lat, lon]) => validCoordinate(lat, lon))
  && new Set(ring.map(([lat, lon]) => `${lat},${lon}`)).size >= 3;

export const isLocated = (r: Located) =>
  hasBoundaryRing(r.ring)
  || (validCoordinate(r.lat, r.lon) && (Math.abs(r.lat) > 0.01 || Math.abs(r.lon) > 0.01));

/** Where to write its name, and where to put its pin.
 *
 *  For a surveyed record this is the average of the corners, which for the
 *  closed convex shapes a parcel is lands inside the parcel. */
export const centreOf = (r: Located): [number, number] => {
  if (hasBoundaryRing(r.ring)) {
    // GeoJSON repeats the first corner to close a polygon. Count it once so
    // otherwise identical open and closed rings put the name in the same place.
    const first = r.ring[0];
    const last = r.ring[r.ring.length - 1];
    const corners = first[0] === last[0] && first[1] === last[1]
      ? r.ring.slice(0, -1) : r.ring;
    const lat = corners.reduce((t, c) => t + c[0], 0) / corners.length;
    const lon = corners.reduce((t, c) => t + c[1], 0) / corners.length;
    return [lat, lon];
  }
  return [r.lat, r.lon];
};

/** The wire carries a ring flat — [lat, lon, lat, lon, …] — for the same
 *  reason `shape` is flat: one list crosses, and the client pairs it up. An
 *  odd trailing number is a half-written corner and is dropped with its pair,
 *  never rounded into a corner that was never surveyed. */
export const pairRing = (flat: readonly number[]): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    if (!validCoordinate(flat[i], flat[i + 1])) return [];
    out.push([flat[i], flat[i + 1]]);
  }
  if (out.length >= 3 && !hasBoundaryRing(out)) return [];
  return out;
};
