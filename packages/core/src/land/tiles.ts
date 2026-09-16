/**
 * Web Mercator, the slippy-tile arithmetic, and nothing else.
 *
 * Written out so a map can be DRAWN without a map library. The property grid
 * shows every card the ground it stands on, and forty Leaflet instances on the
 * landing screen is not a thumbnail, it is forty maps: measured, forty
 * `still` MapCanvases cost 949 DOM nodes, 80 ResizeObservers and 107 tile
 * requests against 235 nodes and 39 tiles for the same forty pictures built
 * from these four functions. A card thumbnail is not a map; it is a picture of
 * one.
 *
 * This is EPSG:3857 with 256 px tiles — the same projection and tile scheme
 * Leaflet uses — so the two agree to the sub-pixel. That agreement is the risk
 * this file carries: a second projection in one repo is a second answer to the
 * same question the day someone edits one of them. `scripts/geo-tests.ts`
 * pins it against Leaflet's own numbers, and that test is the reason this is
 * allowed to exist.
 */

/** One tile's edge, in pixels. Every tile server this app talks to serves 256. */
export const TILE_PX = 256;

export interface WorldPoint {
  /** Pixels east of the antimeridian, at this zoom. */
  x: number;
  /** Pixels south of the top of the projection, at this zoom. */
  y: number;
}

/** Where a coordinate lands in the whole world's pixel grid at one zoom.
 *
 *  Latitude runs through the Mercator log so that a square on the ground stays
 *  a square on the screen — which is why the projection cannot reach the poles
 *  and why every slippy map stops around ±85°. */
export function lonLatToPixel(lat: number, lon: number, z: number): WorldPoint {
  const world = TILE_PX * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * world,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * world,
  };
}

/** The inverse, for reading a click back off a drawn tile grid. */
export function pixelToLonLat(x: number, y: number, z: number): { lat: number; lon: number } {
  const world = TILE_PX * 2 ** z;
  const n = Math.PI - 2 * Math.PI * (y / world);
  return {
    lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
    lon: (x / world) * 360 - 180,
  };
}

/** The largest zoom at which a lat/lon box still fits a pixel box.
 *
 *  Leaflet's `getBoundsZoom`, written out. Returned as a real number so the
 *  caller can floor it, or — better — snap it to a ladder: neighbouring
 *  parcels in one village share tiles only when they share a zoom, and forty
 *  cards each fitted to their own parcel forfeit every one of those hits.
 *
 *  Returns 0 for a box with no extent, which is a single point: there is no
 *  "zoom that fits" a point, and the caller must choose one. */
export function boundsZoom(
  minLat: number, minLon: number, maxLat: number, maxLon: number,
  width: number, height: number, padding = 0,
): number {
  const w = Math.max(1, width - 2 * padding);
  const h = Math.max(1, height - 2 * padding);
  // Normalised 0..1 Mercator, so the two axes can be compared before a zoom
  // has been picked.
  const mercY = (lat: number) => {
    const s = Math.sin((lat * Math.PI) / 180);
    return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  };
  const dx = Math.abs(maxLon - minLon) / 360;
  const dy = Math.abs(mercY(minLat) - mercY(maxLat));
  if (!(dx > 0) && !(dy > 0)) return 0;
  const zx = dx > 0 ? Math.log2(w / (TILE_PX * dx)) : Infinity;
  const zy = dy > 0 ? Math.log2(h / (TILE_PX * dy)) : Infinity;
  return Math.min(zx, zy);
}

/** Snap a zoom to a rung, so neighbours share tiles.
 *
 *  The saving is not theoretical: measured over one village, forty cards at
 *  laddered zooms issue 114 tile requests that collapse to 39 distinct URLs in
 *  the browser cache, because parcels next to each other sit on the same
 *  tiles. Per-card zooms share nothing. A single fixed zoom would share the
 *  most of all and is still wrong — the founder's largest parcel is 355 m
 *  across, which at z16 overflows a 104 px band — so a short ladder is the
 *  trade: never clipped, mostly shared. */
export function snapZoom(z: number, rungs: readonly number[]): number {
  let best = rungs[0];
  for (const r of rungs) if (r <= z && r > best) best = r;
  // Below the lowest rung the parcel does not fit any of them; the lowest is
  // the least wrong, and it clips a boundary rather than losing it entirely.
  return z < rungs[0] ? rungs[0] : best;
}
