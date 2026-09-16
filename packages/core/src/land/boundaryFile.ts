/**
 * Reading a boundary out of a file the owner already has.
 *
 * A farmer who wants their land on the map should not have to click twenty
 * corners. What they usually have is a file — a KML from a surveyor's GPS or
 * from Google Earth, or a GeoJSON exported from a mapping tool — and every one
 * of those already holds the ring. This turns any of them into the same thing:
 * a list of [lat, lon] corners.
 *
 * The one trap that matters, and the reason this is a shared function rather
 * than three inline parsers: KML and GeoJSON both write **longitude first**.
 * Read them as lat-first and every parcel in Andhra Pradesh lands in the sea
 * off Somalia — 79°N, 15°E is the Barents Sea — which looks like a broken map
 * rather than a swapped pair.
 */

import { ringAreaSqM } from './landcalc';

export interface ParsedBoundary {
  /** Corners as [lat, lon], open (no repeated closing corner). */
  ring: Array<[number, number]>;
  /** 'kml' | 'geojson' — what it was read as, for the message shown after. */
  format: 'kml' | 'geojson';
  /** A name carried in the file, when it has one. */
  name: string;
}

export class BoundaryFileError extends Error {}

/** Longitude and latitude are only telling apart by range: latitude cannot
 *  exceed 90. A file whose "latitude" is 79 and "longitude" is 15 is either
 *  the Barents Sea or, far more likely, a swapped pair. */
const inRange = (lat: number, lon: number) =>
  Number.isFinite(lat) && Number.isFinite(lon)
  && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/** Drop a repeated closing corner: a ring is stored open, and both formats
 *  close theirs. */
function open(ring: Array<[number, number]>): Array<[number, number]> {
  if (ring.length > 1) {
    const [a, b] = [ring[0], ring[ring.length - 1]];
    if (a[0] === b[0] && a[1] === b[1]) return ring.slice(0, -1);
  }
  return ring;
}

/** Consecutive identical corners carry no shape and break area maths. */
function dedupe(ring: Array<[number, number]>): Array<[number, number]> {
  return ring.filter((p, i) => i === 0 || p[0] !== ring[i - 1][0] || p[1] !== ring[i - 1][1]);
}

function finish(
  pairs: Array<[number, number]>, format: 'kml' | 'geojson', name: string,
): ParsedBoundary {
  const ring = dedupe(open(pairs));
  if (ring.length < 3) {
    throw new BoundaryFileError(
      'That file has fewer than three corners, so it does not enclose any land.');
  }
  return { ring, format, name };
}

/** KML writes "lon,lat[,altitude]" triples separated by whitespace. */
function kmlCoordinates(block: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
  for (const token of block.trim().split(/\s+/)) {
    if (!token) continue;
    const parts = token.split(',');
    const [lonText = '', latText = ''] = parts;
    const lon = Number(lonText);
    const lat = Number(latText);
    if (parts.length < 2 || parts.length > 3 || !numeric.test(lonText)
      || !numeric.test(latText) || !inRange(lat, lon)) {
      throw new BoundaryFileError('That KML contains an invalid corner. Check every longitude and latitude before importing it.');
    }
    out.push([lat, lon]);
  }
  return out;
}

function parseKml(text: string): ParsedBoundary {
  // Deliberately not DOMParser: this runs the same way in a browser, in a
  // test runner and on a server, and the shape being read is one tag deep.
  // A <Polygon> wins over a bare <LineString> when a file has both, because a
  // surveyor's KML often carries the track walked as well as the parcel.
  const polygon = /<Polygon\b[\s\S]*?<\/Polygon>/i.exec(text)?.[0];
  const scope = polygon ?? text;
  const block = /<coordinates>([\s\S]*?)<\/coordinates>/i.exec(scope)?.[1];
  if (!block) {
    throw new BoundaryFileError('That KML has no <coordinates> in it.');
  }
  const name = /<name>([\s\S]*?)<\/name>/i.exec(text)?.[1]?.trim() ?? '';
  return finish(kmlCoordinates(block), 'kml', name);
}

/** A damaged corner must never be skipped and its neighbours joined. */
function geoJsonCoordinates(value: unknown): number[][] {
  if (!Array.isArray(value) || value.some((c) => !Array.isArray(c)
    || c.length < 2 || typeof c[0] !== 'number' || typeof c[1] !== 'number'
    || !inRange(c[1], c[0]))) {
    throw new BoundaryFileError('That GeoJSON contains an invalid corner. Check every longitude and latitude before importing it.');
  }
  return value as number[][];
}

/** Pull the first polygon ring out of any GeoJSON shape. */
function geoJsonRing(node: unknown): number[][] | null {
  if (!node || typeof node !== 'object') return null;
  const o = node as Record<string, unknown>;
  const type = String(o.type ?? '');
  if (type === 'FeatureCollection' && Array.isArray(o.features)) {
    for (const f of o.features) {
      const hit = geoJsonRing(f);
      if (hit) return hit;
    }
    return null;
  }
  if (type === 'Feature') return geoJsonRing(o.geometry);
  if (type === 'Polygon' && Array.isArray(o.coordinates)) {
    return geoJsonCoordinates(o.coordinates[0]);
  }
  if (type === 'MultiPolygon' && Array.isArray(o.coordinates)) {
    // The largest ring, not the first: a MultiPolygon of a parcel and its
    // well-house should give the parcel.
    const rings = o.coordinates.map((p: unknown) => geoJsonCoordinates(Array.isArray(p) ? p[0] : undefined));
    const area = (ring: number[][]) => ringAreaSqM(ring.map(([lon, lat]) => [lat, lon]));
    return rings.sort((a, b) => area(b) - area(a))[0] ?? null;
  }
  if (type === 'LineString' && Array.isArray(o.coordinates)) {
    return geoJsonCoordinates(o.coordinates);
  }
  return null;
}

function parseGeoJson(text: string): ParsedBoundary {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    throw new BoundaryFileError('That file is not readable as KML or GeoJSON.');
  }
  const coords = geoJsonRing(root);
  if (!coords) {
    throw new BoundaryFileError('That GeoJSON has no polygon in it.');
  }
  const pairs: Array<[number, number]> = [];
  for (const c of coords) {
    const [lon, lat] = c;                       // GeoJSON is lon-first
    pairs.push([lat, lon]);
  }
  const props = (root as { properties?: Record<string, unknown> })?.properties;
  const name = String(props?.name ?? props?.village ?? '').trim();
  return finish(pairs, 'geojson', name);
}

/**
 * Read a boundary from a KML or GeoJSON file's text.
 *
 * Throws `BoundaryFileError` with a sentence fit to show the owner — "that
 * file has fewer than three corners" is something they can act on, where a
 * stack trace is not.
 */
export function parseBoundaryFile(text: string, fileName = ''): ParsedBoundary {
  const body = (text ?? '').trim();
  if (!body) throw new BoundaryFileError('That file is empty.');
  const looksKml = /^</.test(body) || /\.kml$/i.test(fileName);
  return looksKml ? parseKml(body) : parseGeoJson(body);
}

/** What a record knows about itself, for the file's properties block. */
export interface BoundaryExportMeta {
  title?: string;
  village?: string;
  khataNo?: string;
  ownerName?: string;
  areaAcres?: number;
  perimeterM?: number;
}

/**
 * The boundary as a GeoJSON Feature, ready to hand to a surveyor.
 *
 * The mirror of parseBoundaryFile, and it has the same trap in reverse:
 * GeoJSON is **longitude first**, and our rings are [lat, lon] everywhere else
 * because that is the order people read coordinates in. Getting this backwards
 * produces a file that opens without complaint and puts the parcel in the
 * Barents Sea.
 *
 * The ring is CLOSED here — the first corner repeated as the last — because
 * RFC 7946 requires it of a Polygon, even though we store it open.
 */
export function toBoundaryGeoJson(
  ring: Array<[number, number]>, meta: BoundaryExportMeta = {},
): string {
  // Named `corners`, not `open`: there is already a module-level open() that
  // strips a repeated closing corner, and shadowing it here would read as a
  // call to the wrong thing.
  const corners = ring.filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
  if (corners.length < 3) {
    throw new BoundaryFileError('A boundary needs three corners before it can be exported.');
  }
  const lonLat = corners.map(([lat, lon]) => [lon, lat]);
  lonLat.push(lonLat[0]);                       // RFC 7946: rings are closed

  const properties: Record<string, unknown> = {};
  if (meta.title) properties.survey_no = meta.title;
  if (meta.village) properties.village = meta.village;
  if (meta.khataNo) properties.khata_no = meta.khataNo;
  if (meta.ownerName) properties.owner_name = meta.ownerName;
  // Rounded where the number stops being real: a ring traced over imagery is
  // good to a few metres, so two decimals of an acre is the honest limit and
  // centimetres of perimeter would be invention.
  if (meta.areaAcres != null) properties.area_ac = Math.round(meta.areaAcres * 100) / 100;
  if (meta.perimeterM != null) properties.perimeter_m = Math.round(meta.perimeterM * 10) / 10;
  properties.corners = corners.length;

  return JSON.stringify({
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [lonLat] },
    properties,
  }, null, 2);
}

/** A filename a person can find again: "Sy 71-2 Konakanamitla boundary.geojson".
 *  The survey number's slash cannot survive a filesystem. */
export function boundaryFileName(title = '', village = ''): string {
  const stem = [title, village].filter(Boolean).join(' ')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  // A record with no name gets "boundary.geojson", not "boundary boundary".
  return stem ? `${stem} boundary.geojson` : 'boundary.geojson';
}
