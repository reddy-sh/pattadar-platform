/** The parcel on real ground — Leaflet over OpenStreetMap and Esri imagery.
 *
 *  Two rules hold this component together.
 *
 *  It DRAWS, it does not MEASURE. Every figure on the screen — extent, side
 *  lengths, the area-versus-sheet verdict — is computed server-side from the
 *  sheet's projected corner table. Recomputing here from the same ring in
 *  degrees costs 0.30 acres on Field No. 01: five decimal places of latitude
 *  is about a metre, and nine corners of that is a third of an acre. Close
 *  enough to look right, wrong enough to argue with in a revenue office.
 *
 *  It never invents ground. A record with no surveyed ring gets a pin and a
 *  sentence saying so — not a boundary traced over imagery, which is the one
 *  thing a land record must never do.
 *
 *  Colours cross into Leaflet as class names, never as values: Leaflet paints
 *  with SVG presentation attributes, which lose to the CSS in w360.css, so the
 *  tokens keep working and the light/dark toggle keeps following.
 */
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Ref } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { checkLocation, cornerLabel } from '@pattadar/core';

import { loadVillage } from './villageIndex';

/** Two states, because a basemap is what is UNDER the parcel and there are
 *  only two answers: the road map, or the ground. The FMB was a third option
 *  here and should never have been — it is a document, not a tile layer, and
 *  what it contributes is the boundary itself, which is drawn on either. */
export type Basemap = 'street' | 'satellite';

export interface MapMark {
  id: string;
  seq: number;
  lat: number;
  lon: number;
  /** 'moved' draws in the alarm hue, matching the mark list beside the map. */
  state?: string;
  label?: string;
}

export interface MapHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  /** Back to the whole parcel — what the recentre button means here. */
  fit: () => void;
}

export interface MapCanvasProps {
  /** The boundary in [lat, lon], open or closed. Fewer than three corners is
   *  "not surveyed" and draws no shape. */
  ring?: Array<[number, number]>;
  /** The record's own pin. Used to centre when there is no ring. */
  pin?: { lat: number; lon: number } | null;
  marks?: MapMark[];
  basemap: Basemap;
  activeMarkId?: string | null;
  onMarkClick?: (id: string) => void;
  /** Named on the pin and read out to screen readers. */
  title?: string;
  /** Where to look when the record has neither a pin nor a survey: place names
   *  most specific first (village, mandal, district, state). Framed as an AREA
   *  and never as a boundary — "approximately here" is a true thing to say. */
  place?: string[];
  /** The mandal and district this record is filed in. A geocoder searches by
   *  NAME and village names repeat, so a hit is only accepted when its own
   *  hierarchy mentions one of these. */
  placeWithin?: string[];
  /** Which of those names the geocoder actually settled on, or null when none
   *  did. The caller names it on screen, so it must be the resolved place and
   *  not the one that was asked for first — "Katragunta" and "Markapur" are
   *  20 km apart, and only one of them is what the map is showing. */
  onPlace?: (label: string | null, suspectMessage?: string) => void;
  /** Armed: the next click on the map reports where it landed, so the owner
   *  can correct a pin instead of only being told it is wrong. */
  picking?: boolean;
  onPick?: (lat: number, lon: number) => void;
  /** Label every side of the saved boundary with its length, on the map.
   *  Strings are formatted by the caller, which owns the unit switch — this
   *  component draws, it does not decide what a metre is. */
  sideLabels?: string[];
  /** Which side the rail is pointing at, so map and table light together. */
  activeSide?: number | null;
  /** Clicking a side on the map selects it, the same as clicking its row. */
  onSideClick?: (index: number) => void;
  /** Clicking a corner selects the corner ITSELF — one point, not the edge it
   *  happens to start. A node and an edge are different questions. */
  onCornerClick?: (index: number) => void;
  activeCorner?: number | null;
  /** Darken everything outside the boundary. A parcel is read against its own
   *  ground, and at the zoom a boundary is checked at, the neighbours are the
   *  larger part of the picture. */
  dimOutside?: boolean;
  /** HTML for the tip. The caller decides whether it is about a side or a
   *  single corner; this component only shows it. Since the tip is bolted to
   *  one corner of the panel it no longer needs to know what it describes. */
  tip?: string | null;
  /** Play the one-time reveal: the outline drawn corner by corner. */
  introduce?: boolean;
  /** The revenue village the record is filed in. Always pass it, whether or
   *  not the plots are being drawn: where a shape file exists it is also the
   *  most reliable way to LOCATE the record — see the locating effect. */
  village?: string | null;
  /** Draw the village's plots under the record. */
  showVillage?: boolean;
  /** Clicking a plot in that map reports its number and its ring, so a record
   *  with no FMB can adopt the shape the survey department already has. */
  onVillagePlot?: (plot: { lp: string; ac?: string; ring: Array<[number, number]> }) => void;
  /** Which plot to draw as chosen. */
  activePlot?: string | null;
  /** A plot number to go and find among the village's thousands. When it
   *  matches, the map zooms to it and reports it through onVillagePlot. */
  findPlot?: string | null;
  /** Told how many plots there are, and whether the search found one. */
  onVillageState?: (state: { count: number; found: boolean }) => void;
  /** Drawing a boundary: every click drops a corner, every corner can be
   *  dragged, and the ring so far is reported after each change so the panel
   *  can show the area growing and enable Save at three. */
  drawing?: boolean;
  /** Retain the draft preview while a save is in flight, without accepting
   *  corners or moves that the pending request cannot include. */
  editDisabled?: boolean;
  draft?: Array<[number, number]>;
  onDraft?: (ring: Array<[number, number]>) => void;
  /** A thumbnail: real ground, but nothing to drive. Every gesture is off, so
   *  the map never swallows a click meant for the link wrapping it, and a
   *  scroll over the card scrolls the page instead of zooming the map. */
  still?: boolean;
  ref?: Ref<MapHandle>;
}

/** Andhra Pradesh and Telangana together — the two states this app files in —
 *  wide enough that nothing on screen reads as a plot. The opening view, and
 *  the last resort when a record says nothing about where it is. */
const AP_TG: [number, number] = [16.9, 79.4];
const AP_TG_ZOOM = 6;

/** OpenStreetMap's own geocoder — same key-free service the Bloom GeoMap uses
 *  for `autoLocate`, and the same progressive fallback: village, then mandal,
 *  then district, then the state. */
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

interface Place {
  center: [number, number];
  box: [[number, number], [number, number]] | null;
  label: string;
  /** The full hierarchy OSM returned — "Chinthagunta, Venkatagiri, Tirupati,
   *  Andhra Pradesh, India". Kept so a hit can be checked against the district
   *  and mandal the record is actually filed in. */
  display: string;
}

/** Resolve one place name, or null. Cached per tab: browsing ten records of
 *  the same village must not be ten calls to a free service that asks for one
 *  request a second. A miss is cached too, or every render retries it. */
async function geocode(q: string): Promise<Place | null> {
  const key = `w360-geo:${q}`;
  try {
    const hit = sessionStorage.getItem(key);
    if (hit) return JSON.parse(hit) as Place | null;
  } catch { /* private mode: just don't cache */ }
  try {
    const res = await fetch(
      `${NOMINATIM}?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(q)}`,
      { headers: { 'Accept-Language': 'en' } });
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    let out: Place | null = null;
    if (row) {
      const bb = (row.boundingbox ?? []).map(Number);
      out = {
        center: [Number(row.lat), Number(row.lon)],
        box: bb.length === 4 && bb.every(Number.isFinite)
          ? [[bb[0], bb[2]], [bb[1], bb[3]]] : null,
        label: String(row.display_name ?? q).split(',').slice(0, 2).join(',').trim(),
        display: String(row.display_name ?? ''),
      };
    }
    try { sessionStorage.setItem(key, JSON.stringify(out)); } catch { /* ignore */ }
    return out;
  } catch {
    return null;          // offline is not an error here; the map just stays wide
  }
}

/** Canvas cannot be styled by a stylesheet, so the village layer is the one
 *  place a colour has to cross into Leaflet as a value. Read it off the live
 *  tokens rather than hard-coding, or the layer stops following the theme. */
function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

const OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ESRI =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

/** A 1×1 transparent PNG, shown in place of a tile that never arrived —
 *  otherwise the browser paints its broken-image glyph across the map, which
 *  is what a phone in a field would show.
 *
 *  It must be a PNG, and specifically NOT the 1×1 GIF every snippet reaches
 *  for: that exact string is Leaflet's internal `emptyImageUrl` sentinel
 *  (leaflet-src.js:211), and TileLayer._tileReady returns early for any tile
 *  whose src equals it (:12294). Setting errorTileUrl to the same GIF makes
 *  Leaflet swap the src in _tileOnError and then silently swallow its own
 *  `tileerror` event — so the offline notice can never fire. */
const BLANK =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** The panel's furniture is opaque and sits over the map: the hint top-left,
 *  the caption and Leaflet's scale bottom-left, the zoom cluster bottom-right.
 *  A corner framed symmetrically lands under it, and its tooltip opens behind
 *  it — the map pane is a transformed stacking context, so nothing inside the
 *  map can be raised above the panel. Reserve the real footprint instead. */
const FIT = { paddingTopLeft: [36, 36] as [number, number],
              paddingBottomRight: [56, 96] as [number, number],
              // One recorded stone is a zero-size bounds, and fitBounds answers
              // that by going to maxZoom — a screen of blank imagery.
              maxZoom: 18 };
/** The panel's padding is furniture-sized and taller than a thumbnail, which
 *  leaves fitBounds nothing to fit. A card gets a hairline of breathing room. */
const FIT_STILL = { padding: [10, 10] as [number, number], maxZoom: 18 };

/** Editing furniture wraps on phones. Reserve its measured footprint when
 *  framing a draft so its corner handles remain reachable above the save bar
 *  and below the tools. Measuring only on explicit fits preserves every pan
 *  and drag between those actions. */
function fitOptions(map: L.Map, still = false): L.FitBoundsOptions {
  if (still) return FIT_STILL;
  const container = map.getContainer();
  const panel = container.closest('.plot');
  const frame = container.getBoundingClientRect();
  if (!panel || !frame.width || !frame.height) return FIT;
  const tools = panel.querySelector('.maptools')?.getBoundingClientRect();
  const message = panel.querySelector('.mapsays')?.getBoundingClientRect();
  let top = Math.max(FIT.paddingTopLeft[1], tools?.height ? tools.bottom - frame.top + 24 : 0);
  let bottom = Math.max(FIT.paddingBottomRight[1], message?.height ? frame.bottom - message.top + 24 : 0);
  // Very short windows still need a positive space for Leaflet to fit into.
  const available = Math.max(0, frame.height - Math.min(96, frame.height * 0.3));
  if (top + bottom > available) {
    const ratio = available / (top + bottom);
    top *= ratio;
    bottom *= ratio;
  }
  return {
    paddingTopLeft: [Math.min(36, frame.width * 0.2), top],
    paddingBottomRight: [Math.min(56, frame.width * 0.2), bottom],
    maxZoom: 18,
  };
}

const validPoint = ([lat, lon]: [number, number]) =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/** Keep the saved shape and the ruler on the same open ring. Imported rings
 *  often repeat their first coordinate to close the polygon. */
const openRing = (ring: Array<[number, number]> = []) =>
  ring.length > 1 && ring[0][0] === ring[ring.length - 1][0]
    && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;

const usable = (r?: Array<[number, number]>) => {
  const corners = openRing(r);
  return corners.length >= 3 && corners.every(validPoint);
};

/** A divIcon's `html` is assigned as innerHTML, and a record title is typed by
 *  the owner — "Sy 14/2" today, an <img onerror> the day someone tries. Hand
 *  Leaflet an element whose text was set as text. */
function textIcon(
  className: string, text: string, anchor?: [number, number],
  offset?: [number, number],
): L.DivIcon {
  const el = document.createElement('span');
  el.textContent = text;
  // The nudge is applied in CSS rather than through iconAnchor, because the
  // element's size is not known until it has text in it — and a label that is
  // centred on its own box is the only way to push it cleanly off a line.
  if (offset) {
    el.style.setProperty('--ox', `${offset[0]}px`);
    el.style.setProperty('--oy', `${offset[1]}px`);
  }
  return L.divIcon({ className, html: el, iconSize: undefined, iconAnchor: anchor });
}

/** Is a [lat, lon] point inside this ring? Ray casting, on the ring as Leaflet
 *  holds it. Used to place a label, not to decide anything about the land, so
 *  the vertex cases do not matter. */
function insideRing(pt: [number, number], ring: Array<[number, number]>): boolean {
  const [y, x] = pt;
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i += 1) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if ((yi > y) !== (yj > y)
        && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi) hit = !hit;
  }
  return hit;
}

/** Where to write a plot's number so that it lands ON that plot.
 *
 *  The middle of the bounding box, which is the middle of the plot for the
 *  rectangles most of these are. A plot bent into an L has its own centre
 *  outside itself, and a number floating over the neighbour's field is worse
 *  than no number — so for those, the widest span of the plot along that same
 *  line, and the middle of that. */
function labelPoint(ring: Array<[number, number]>): [number, number] {
  let minLat = Infinity; let maxLat = -Infinity;
  let minLon = Infinity; let maxLon = -Infinity;
  for (const [lat, lon] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  const y = (minLat + maxLat) / 2;
  const middle: [number, number] = [y, (minLon + maxLon) / 2];
  if (insideRing(middle, ring)) return middle;

  const cuts: number[] = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i += 1) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if ((yi > y) !== (yj > y)) cuts.push(xi + ((y - yi) * (xj - xi)) / ((yj - yi) || 1e-12));
  }
  cuts.sort((a, b) => a - b);
  let widest = -1;
  let at = middle[1];
  for (let k = 0; k + 1 < cuts.length; k += 2) {
    const span = cuts[k + 1] - cuts[k];
    if (span > widest) { widest = span; at = (cuts[k] + cuts[k + 1]) / 2; }
  }
  return [y, at];
}

const placed = (p?: { lat: number; lon: number } | null) =>
  !!p && validPoint([p.lat, p.lon]) && (p.lat !== 0 || p.lon !== 0);

export default function MapCanvas({
  ring, pin, marks = [], basemap, activeMarkId, onMarkClick, title = '', dimOutside = false,
  place, placeWithin, onPlace, picking = false, onPick, sideLabels, activeSide = null,
  onSideClick, onCornerClick, activeCorner = null, tip, introduce = false,
  village, showVillage = false, onVillagePlot, activePlot = null,
  findPlot = null, onVillageState,
  drawing = false, editDisabled = false, draft, onDraft, still = false, ref,
}: MapCanvasProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const streetRef = useRef<L.TileLayer | null>(null);
  const imageryRef = useRef<L.TileLayer | null>(null);
  const shapeRef = useRef<L.LayerGroup | null>(null);
  const boundsRef = useRef<L.LatLngBounds | null>(null);
  const fittedRef = useRef(false);
  // Which parcel the view was framed for. Two surveyed records in a row reuse
  // one MapCanvas, and without this the second inherits the first's viewport.
  const fittedForRef = useRef('');
  // Selecting a mark must not rebuild the layer under the cursor, so the dots
  // are kept and restyled in place.
  const markLayersRef = useRef(new Map<string, L.CircleMarker>());
  const tileStatusRef = useRef(new Map<L.TileLayer, { loaded: number; failed: number }>());
  const clickRef = useRef(onMarkClick);
  clickRef.current = onMarkClick;
  const placeRef = useRef(onPlace);
  placeRef.current = onPlace;
  // Read through refs so arming does not re-bind the handler or remount the
  // map — the owner arms it while looking at the spot they mean to click.
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const pickingRef = useRef(picking);
  pickingRef.current = picking;
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  const editDisabledRef = useRef(editDisabled);
  editDisabledRef.current = editDisabled;
  const draftRef = useRef(draft ?? []);
  draftRef.current = draft ?? [];
  const onDraftRef = useRef(onDraft);
  onDraftRef.current = onDraft;
  /** The in-progress outline and its draggable corners, kept apart from the
   *  saved ring so cancelling leaves nothing behind. */
  const draftLayerRef = useRef<L.LayerGroup | null>(null);
  const draftRenderRef = useRef<{
    handles: L.Marker[];
    dots: L.CircleMarker[];
    outline?: { setLatLngs(latlngs: L.LatLngExpression[]): unknown };
  } | null>(null);
  const drawingStartedRef = useRef(false);
  /** Side-length labels, their own layer so toggling them never redraws the
   *  boundary underneath and loses the owner's pan. */
  const rulerRef = useRef<L.LayerGroup | null>(null);
  const villageRef = useRef<L.LayerGroup | null>(null);
  const villageCanvas = useRef<L.Canvas | null>(null);
  const plotClickRef = useRef(onVillagePlot);
  plotClickRef.current = onVillagePlot;
  const villageStateRef = useRef(onVillageState);
  villageStateRef.current = onVillageState;
  /** The plot number the search last acted on, so typing does not re-zoom on
   *  every unrelated redraw. */
  const foundRef = useRef<string | null>(null);
  const [villageCount, setVillageCount] = useState<number | null>(null);
  /** Which village the view has been framed for. */
  const villageFittedRef = useRef<string | null>(null);
  /** Map handlers the village layer installs — thinning the mesh, and writing
   *  the plot numbers. Held so they can be taken off again: the village layer
   *  is redrawn whenever the basemap or the picked plot changes, and a handler
   *  left behind would be restyling a group that has since been cleared. */
  const villageOnRef = useRef<Array<[string, () => void]>>([]);
  const weightRef = useRef<number | null>(null);
  /** The plot numbers, in their own group: they are DOM, the plots are canvas,
   *  and only the ones on screen and big enough to read are ever built. */
  const villageLabelRef = useRef<L.LayerGroup | null>(null);
  /** Bumped on every zoom, because which sides have room for a label is a
   *  screen-space question and the answer changes with the scale. */
  const [zoomTick, setZoomTick] = useState(0);
  const sideClickRef = useRef(onSideClick);
  sideClickRef.current = onSideClick;
  const cornerClickRef = useRef(onCornerClick);
  cornerClickRef.current = onCornerClick;
  /** The tip that opens on a selected side. Leaflet owns its lifecycle, so it
   *  is kept out of React's tree entirely. */
  const tipElRef = useRef<HTMLDivElement | null>(null);

  const [tilesFailed, setTilesFailed] = useState(false);
  // Set when the record's own coordinates were overruled by its village.
  const [offPlace, setOffPlace] = useState('');
  /** True once the map has settled on a named place. The caller says which
   *  place on screen, so this component's own "no location yet" would be a
   *  second box saying almost the same thing. */
  const [located, setLocated] = useState(false);

  const hasRing = usable(ring);
  const hasPin = placed(pin);
  const anyMarks = marks.some((m) => placed({ lat: m.lat, lon: m.lon }));

  /** All map geometry shares the active tool: a click on an old corner or
   *  village plot must place a new point just like a click on empty ground. */
  const editAt = (e: L.LeafletMouseEvent): boolean => {
    if (still) return false;
    if (editDisabledRef.current && (drawingRef.current || pickingRef.current)) return true;
    const coordinate = e.latlng.wrap();
    if (drawingRef.current) {
      // Leaflet emits two clicks before a double-click. Keep the first corner
      // and ignore the second, including touch events with no click detail.
      if (e.originalEvent?.detail > 1) return true;
      const point: [number, number] = [coordinate.lat, coordinate.lng];
      const previous = draftRef.current.at(-1);
      if (previous && mapRef.current && mapRef.current.distance(previous, point) < 0.05) return true;
      const next = [...draftRef.current, point];
      draftRef.current = next;
      onDraftRef.current?.(next);
      return true;
    }
    if (!pickingRef.current) return false;
    pickRef.current?.(coordinate.lat, coordinate.lng);
    return true;
  };

  useImperativeHandle(ref, () => ({
    zoomIn: () => mapRef.current?.zoomIn(),
    zoomOut: () => mapRef.current?.zoomOut(),
    fit: () => {
      const map = mapRef.current;
      if (!map) return;
      const draftPoints = draftRef.current.filter(validPoint);
      const options = fitOptions(map, still);
      if (drawingRef.current && draftPoints.length) map.fitBounds(L.latLngBounds(draftPoints), options);
      else if (boundsRef.current) map.fitBounds(boundsRef.current, options);
      else if (hasPin && pin) map.setView([pin.lat, pin.lon], 17);
    },
  }), [hasPin, pin, still]);

  // One map for the life of the panel. Switching basemap or redrawing the
  // boundary must never remount it — a remount throws away the pan and zoom
  // the owner just did to look at a corner.
  useEffect(() => {
    if (!boxRef.current || mapRef.current) return;
    const map = L.map(boxRef.current, {
      // The panel draws its own zoom cluster in the Bloom style; Leaflet's
      // would be a second, differently-shaped one in the same corner.
      zoomControl: false,
      scrollWheelZoom: !still,
      maxZoom: 19,
      ...(still
        ? {
            dragging: false, touchZoom: false, doubleClickZoom: false,
            boxZoom: false, keyboard: false,
            // A thumbnail is not a landmark to tab to; the link around it is.
            attributionControl: false,
          }
        : {}),
    });
    mapRef.current = map;

    streetRef.current = L.tileLayer(OSM, {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
      className: 'w-tiles-street',
      errorTileUrl: BLANK,
    });
    imageryRef.current = L.tileLayer(ESRI, {
      attribution: 'Imagery &copy; Esri',
      maxZoom: 19,
      className: 'w-tiles-imagery',
      errorTileUrl: BLANK,
    });
    // Track each layer and each request batch separately. Street tiles loading
    // successfully must not hide unavailable imagery after a basemap switch.
    for (const layer of [streetRef.current, imageryRef.current]) {
      const status = { loaded: 0, failed: 0 };
      tileStatusRef.current.set(layer, status);
      layer.on('loading', () => {
        status.loaded = 0;
        status.failed = 0;
        if (map.hasLayer(layer)) setTilesFailed(false);
      });
      layer.on('tileerror', () => {
        status.failed += 1;
        if (map.hasLayer(layer) && !status.loaded) setTilesFailed(true);
      });
      layer.on('tileload', (e: L.TileEvent) => {
        // The error placeholder also fires tileload; it is not real imagery.
        if ((e.tile as HTMLImageElement).src === BLANK) return;
        status.loaded += 1;
        if (map.hasLayer(layer)) setTilesFailed(false);
      });
    }

    map.on('click', editAt);
    draftLayerRef.current = L.layerGroup().addTo(map);
    rulerRef.current = L.layerGroup().addTo(map);
    // A canvas renderer for the village, and only for the village: 2,100
    // polygons as SVG paths is ~30,000 DOM nodes and the map stops panning.
    // Everything else stays SVG so the CSS tokens keep styling it.
    villageRef.current = L.layerGroup().addTo(map);
    villageLabelRef.current = L.layerGroup().addTo(map);
    map.on('zoomend', () => setZoomTick((n) => n + 1));

    L.control.scale({ imperial: false, metric: true, position: 'bottomleft' }).addTo(map);
    shapeRef.current = L.layerGroup().addTo(map);
    // Leaflet needs a view before a layer can be added, and this one is a
    // placeholder in the strictest sense: the whole state, at a zoom where no
    // parcel is legible. It used to be [15.66, 79.32] at zoom 15 — Mangalakunta,
    // one real village at street level — so a record in Katragunta opened on
    // somebody else's fields and looked authoritative doing it. A record with
    // no pin and no survey is located by `place` below, or not at all.
    map.setView(AP_TG, AP_TG_ZOOM);

    return () => {
      map.remove();
      mapRef.current = null;
      streetRef.current = null;
      imageryRef.current = null;
      shapeRef.current = null;
      boundsRef.current = null;
      villageCanvas.current = null;
      fittedRef.current = false;
      drawingStartedRef.current = false;
      draftRenderRef.current = null;
      tileStatusRef.current.clear();
    };
  }, []);

  // Basemap: roads, or the ground. The parcel is drawn on top of whichever.
  useEffect(() => {
    const map = mapRef.current;
    const street = streetRef.current;
    const imagery = imageryRef.current;
    if (!map || !street || !imagery) return;
    const wantStreet = basemap === 'street';
    const wantImagery = basemap === 'satellite';
    if (wantStreet && !map.hasLayer(street)) street.addTo(map);
    if (!wantStreet && map.hasLayer(street)) map.removeLayer(street);
    if (wantImagery && !map.hasLayer(imagery)) imagery.addTo(map);
    if (!wantImagery && map.hasLayer(imagery)) map.removeLayer(imagery);
    // Panes keep the boundary above the tiles whichever way they were added.
    imagery.setZIndex(1);
    street.setZIndex(2);
    const status = tileStatusRef.current.get(wantStreet ? street : imagery);
    setTilesFailed(!!status?.failed && !status.loaded);
  }, [basemap]);

  // The boundary and its numbered corners. Redrawn wholesale — a parcel has
  // single-digit corners, so diffing them would be more code than it saves.
  useEffect(() => {
    const map = mapRef.current;
    const group = shapeRef.current;
    if (!map || !group) return;
    group.clearLayers();
    markLayersRef.current.clear();

    // A different parcel deserves a fresh frame; the same parcel redrawn must
    // keep whatever the owner panned to.
    const ringKey = hasRing ? (ring ?? []).map((c) => c.join(',')).join(';')
      : marks.filter((m) => placed(m)).map((m) => `${m.lat},${m.lon}`).join(';')
        || (hasPin && pin ? `${pin.lat},${pin.lon}` : '');
    if (fittedForRef.current !== ringKey) {
      fittedForRef.current = ringKey;
      fittedRef.current = false;
      if (!ringKey) map.setView(AP_TG, AP_TG_ZOOM);
    }

    // The boundary is drawn on either basemap. It used to be hidden on
    // "Satellite" so the sheet could be checked against bare ground, which
    // only made sense while a third option existed to put them back together
    // — and seeing your own boundary on the imagery is the reason most people
    // switch to it at all.
    const showRing = hasRing;

    // Marks stand on their own. A record with no survey still knows where its
    // stones are — those are real readings someone took standing on them — and
    // they used to be drawn only alongside a ring, so the screens that needed
    // them most showed nothing. They are NOT joined into a polygon: four
    // points do not assert a boundary, and the order they were filed in is not
    // the order they enclose. Marks 1 and 4 on a real record here are 11 m
    // apart and the labels disagree with the compass; a line through them
    // would draw a bowtie and call it land.
    const placedMarks = marks.filter((m) => placed({ lat: m.lat, lon: m.lon }));
    // "Satellite" clears the overlay so a tracing can be checked against bare
    // ground — but only where there IS a tracing. On a record whose only
    // location information is its stones, that rule emptied the screen and
    // answered nothing.
    const showMarks = !drawing && placedMarks.length > 0;

    // What "recentre" means is the whole parcel, and that does not change
    // when the ring is hidden to look at bare ground.
    const corners = hasRing && ring ? openRing(ring) : null;
    // Framing falls back the same way the drawing does: the ring, then the
    // stones, then nothing (and the pin/place effects take it from there).
    boundsRef.current = corners
      ? L.latLngBounds(corners)
      : placedMarks.length
        ? L.latLngBounds(placedMarks.map((m) => [m.lat, m.lon] as L.LatLngTuple))
        : null;

    if (showRing && corners) {
      if (dimOutside) {
        // A polygon of the whole world with the parcel punched out of it.
        // Leaflet takes the second ring as a hole, and `fill-rule: evenodd`
        // in the stylesheet is what makes the hole a hole rather than a
        // second dark shape.
        L.polygon([
          [[-89, -179], [-89, 179], [89, 179], [89, -179]] as L.LatLngTuple[],
          corners,
        ], { className: 'w-dim', interactive: false }).addTo(group);
      }
      L.polygon(corners, { className: 'w-ring', interactive: false }).addTo(group);
    } else if (!hasRing && !placedMarks.length && hasPin && pin) {
      // Only an UNSURVEYED record with no stones recorded gets a lone pin. On
      // a surveyed one, "Satellite" means bare ground on purpose — leaving a
      // marker behind would keep answering the question the view exists to
      // stop answering. And where marks exist they say more than the pin, so
      // a fifth unnumbered dot would only be ambiguous.
      L.circleMarker([pin.lat, pin.lon], {
        className: 'w-mark', radius: 7, interactive: false,
      }).addTo(group);
      if (title) {
        L.marker([pin.lat, pin.lon], {
          icon: textIcon('w-mark-no', title),
          interactive: false,
          keyboard: false,
        }).addTo(group);
      }
    }

    if (showMarks) {
      for (const m of placedMarks) {
        const moved = m.state === 'moved';
        const dot = L.circleMarker([m.lat, m.lon], {
          className: `w-mark${moved ? ' moved' : ''}`,
          radius: 6,
          interactive: !still,
          bubblingMouseEvents: false,
        });
        if (m.label) {
          const label = document.createElement('span');
          label.textContent = `${m.seq} · ${m.label}`;
          dot.bindTooltip(label, { direction: 'top' });
        }
        dot.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stop(e);
          if (!editAt(e)) clickRef.current?.(m.id);
        });
        dot.addTo(group);
        markLayersRef.current.set(m.id, dot);
        L.marker([m.lat, m.lon], {
          icon: textIcon(`w-mark-no${moved ? ' moved' : ''}`, String(m.seq), [-8, 8]),
          interactive: false,
          keyboard: false,
        }).addTo(group);
      }
    }

    // Frame the parcel once, when there is something to frame. Later renders
    // (a mark accepted, the basemap switched) must leave the view alone —
    // re-fitting would yank the map back every time the owner zoomed to a
    // corner and then touched anything.
    if (!fittedRef.current) {
      if (boundsRef.current) {
        map.fitBounds(boundsRef.current, still ? FIT_STILL : FIT);
        fittedRef.current = true;
      } else if (hasPin && pin) {
        map.setView([pin.lat, pin.lon], 17);
        fittedRef.current = true;
      }
    }
  }, [ring, marks, hasRing, hasPin, pin, title, dimOutside, drawing]);

  // Where to look, in the order this record can be trusted:
  //
  //   1. a surveyed FMB ring — the only thing that IS the parcel
  //   2. its own stones or pin, BUT only where they agree with the village
  //      written on the record
  //   3. the village itself, as an area
  //   4. the two states this app files in
  //
  // Step 2's condition is the one that earns its keep. A pin is still a pin
  // when it is 189 km out to sea, and framing it shows open water and calls it
  // land — which reads as a broken satellite layer rather than as bad data.
  // checkLocation already encodes this judgement for the rest of the app.
  useEffect(() => {
    if (drawing || picking) return;
    setLocated(false);
    setOffPlace('');
    placeRef.current?.(null, '');
    if (hasRing) return;                       // the survey outranks everything
    const names = (place ?? []).map((x) => x.trim()).filter(Boolean);
    if (!names.length && !village) return;
    let dropped = false;
    (async () => {
      // The village's own shape file first, when there is one.
      //
      // A geocoder searches by NAME, and village names repeat: asked for
      // "Chinthagunta" it returned Chinthagunta in Venkatagiri — a real place,
      // 200 km from the Chinthagunta in Markapuram this record is filed in,
      // with nothing on screen to say so. The shape file has no such ambiguity;
      // it IS the village. So where one exists it decides, and Nominatim is
      // only asked about villages we have no map for.
      if (village) {
        const plots = await loadVillage(village);
        if (dropped || drawingRef.current || pickingRef.current) return;
        if (plots && plots.length) {
          const map = mapRef.current;
          if (!map) return;
          const bounds = L.latLngBounds(plots.flatMap((x) => x.ring as L.LatLngTuple[]));
          if (bounds.isValid()) {
            const mine = hasPin && pin ? { latitude: pin.lat, longitude: pin.lon } : null;
            // A pin inside the village is more exact than the whole village.
            if (mine && bounds.contains([mine.latitude, mine.longitude])) {
              placeRef.current?.(null, '');
              return;
            }
            map.fitBounds(bounds, still ? FIT_STILL : FIT);
            fittedRef.current = true;
            villageFittedRef.current = village;
            boundsRef.current = bounds;
            placeRef.current?.(`${village}, from the village map`, '');
            setLocated(true);
            return;
          }
        }
      }
      const within = (placeWithin ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean);
      for (const q of names) {
        const hit = await geocode(q);
        if (dropped || drawingRef.current || pickingRef.current) return;
        if (!hit) continue;

        // The hit has to be in the right part of the state. Nominatim returns
        // its whole hierarchy, so a Chinthagunta in Venkatagiri simply does
        // not mention Markapuram or Konakalamitla, and is refused. Only a bare
        // state query — the last resort — skips this, since it cannot match a
        // district by definition.
        const isStateOnly = q.split(',').length <= 1;
        if (within.length && !isStateOnly) {
          const hay = hit.display.toLowerCase();
          if (!within.some((w) => hay.includes(w))) continue;
        }

        const map = mapRef.current;
        if (!map) return;
        const village = { latitude: hit.center[0], longitude: hit.center[1] };

        // What the record itself claims: the middle of its stones, or its pin.
        const mine = boundsRef.current
          ? { latitude: boundsRef.current.getCenter().lat,
              longitude: boundsRef.current.getCenter().lng }
          : hasPin && pin ? { latitude: pin.lat, longitude: pin.lon } : null;
        // A pin is only "suspect" against a reference precise enough to judge
        // it. When every village and mandal name failed and the only thing
        // that resolved was the bare STATE, `hit.center` is the centroid of a
        // region hundreds of km across: a correct pin is routinely 400+ km
        // from it, so measuring that distance and printing "…where you are
        // standing, not where the land is" is a false alarm — the very thing
        // this hanger opened on. `checkLocation` already refuses to call a pin
        // wrong against an unknown reference; a state centroid is unknown
        // enough for the same reason, so a state-only hit still frames the map
        // but never accuses the pin.
        const verdict = isStateOnly
          ? { suspect: false, distanceKm: 0, message: '' }
          : checkLocation(mine, village, hit.label);

        if (mine && !verdict.suspect) {
          // The record's own points agree with its village. They are more
          // precise than the village, so leave the frame where they put it.
          placeRef.current?.(null, '');
          return;
        }

        if (hit.box) map.fitBounds(hit.box, { maxZoom: 13, padding: [8, 8] });
        else map.setView(hit.center, 12);
        fittedRef.current = true;
        setOffPlace(verdict.suspect ? verdict.message : '');
        placeRef.current?.(hit.label, verdict.suspect ? verdict.message : '');
        setLocated(true);
        return;
      }
      if (!dropped) placeRef.current?.(null, '');   // nothing resolved
    })();
    return () => { dropped = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRing, hasPin, anyMarks, drawing, picking, pin?.lat, pin?.lon,
      marks.map((mark) => `${mark.lat},${mark.lon}`).join(';'), village, (place ?? []).join('|'),
      (placeWithin ?? []).join('|')]);

  // The village's own plots. Drawn under everything else, on a canvas, and
  // only when asked for — it is another map's worth of geometry and it exists
  // to answer one question: which of these shapes is mine?
  useEffect(() => {
    const map = mapRef.current;
    const group = villageRef.current;
    if (!map || !group) return;
    group.clearLayers();
    villageLabelRef.current?.clearLayers();
    if (!village || !showVillage) { setVillageCount(null); return; }

    let dropped = false;
    void loadVillage(village).then((plots) => {
      if (dropped || !plots) {
        if (!dropped) {
          setVillageCount(0);
          villageStateRef.current?.({ count: 0, found: false });
        }
        return;
      }
      const g = villageRef.current;
      const m = mapRef.current;
      if (!g || !m) return;
      if (!villageCanvas.current) villageCanvas.current = L.canvas({ padding: 0.3 });
      const onImagery = basemap === 'satellite';
      const fine: Array<{ poly: L.Polygon; chosen: boolean }> = [];
      /** One entry per plot: where its number goes, and the box it has to fit
       *  in. Computed once here rather than on every pan — 2,729 ray casts per
       *  drag is the difference between a map and a slideshow. */
      const tags: Array<{
        lp: string; ac?: string; at: [number, number];
        sw: [number, number]; ne: [number, number];
      }> = [];
      for (const plot of plots) {
        const chosen = activePlot != null && plot.lp === activePlot;
        const poly = L.polygon(plot.ring as L.LatLngTuple[], {
          renderer: villageCanvas.current,
          // Canvas cannot read the stylesheet, so these are the only colours
          // in this component given as values. The ink is read off the
          // resolved tokens so the light/dark toggle still reaches it.
          //
          // On imagery it is white, and not a token. A hairline of --w-ink-3
          // at half opacity — what this drew before — is the exact grey-brown
          // of a ploughed field in Prakasam, and 89 plots over Esri's tiles
          // came out as a photograph of farmland with nothing on it. A
          // cadastral mesh has to sit ON TOP of the ground it divides, so on
          // satellite it is the one colour the ground never is.
          color: chosen ? cssVar('--w-accent', '#fe860f')
            : onImagery ? '#ffffff' : cssVar('--w-ink-3', '#8a8a8a'),
          weight: chosen ? 2.5 : onImagery ? 1 : 0.9,
          opacity: chosen ? 1 : onImagery ? 0.9 : 0.75,
          fill: true,
          fillColor: cssVar('--w-accent', '#fe860f'),
          fillOpacity: chosen ? 0.25 : 0,
          interactive: !still,
          bubblingMouseEvents: false,
        });
        fine.push({ poly, chosen });
        if (plot.lp) {
          const b = poly.getBounds();
          tags.push({
            lp: plot.lp, ac: plot.ac, at: labelPoint(plot.ring),
            sw: [b.getSouth(), b.getWest()], ne: [b.getNorth(), b.getEast()],
          });
        }
        if (!still) {
          poly.on('click', (e) => {
            L.DomEvent.stop(e);
            if (!editAt(e)) plotClickRef.current?.({ lp: plot.lp, ac: plot.ac, ring: plot.ring });
          });
          // A tooltip given as a string is assigned as innerHTML, and a plot
          // number is whatever a <name> in an uploaded KMZ said it was. Same
          // rule as textIcon and the mark labels above: it goes in as text.
          const tip = document.createElement('span');
          tip.textContent = plot.ac ? `Plot ${plot.lp} · ${plot.ac} ac` : `Plot ${plot.lp}`;
          poly.bindTooltip(tip, { sticky: true });
        }
        poly.addTo(g);
      }
      setVillageCount(plots.length);

      // A line has a width in pixels and land does not. Framed on the whole of
      // Munagapadu — 2,729 plots across 6 km — a 1 px outline per plot is
      // wider than the gaps between them and the town core comes out as a
      // white block. So the mesh thins while it is zoomed out past the point
      // where one plot can be told from the next, and comes back at the zoom
      // where somebody is actually looking for theirs.
      //
      // Two buckets, not a curve: one restyle pass when z14 is crossed, rather
      // than 2,729 style writes on every wheel notch.
      const others = fine.filter((x) => !x.chosen).map((x) => x.poly);
      const thin = () => {
        const w = m.getZoom() < 14 ? 0.45 : 1;
        if (weightRef.current === w) return;
        weightRef.current = w;
        for (const poly of others) poly.setStyle({ weight: w });
      };
      weightRef.current = null;
      thin();

      // The number, written on the plot — but only once the plot is big enough
      // on screen to hold it. Zoom is the wrong test for that: at any one zoom
      // these plots run from a tenth of an acre to six hundred, so the rule is
      // the plot's own size in pixels. A plot wide enough for the number gets
      // the number; wide enough for both gets the extent as well; anything
      // smaller is left clean, because a label nobody can read is just ink over
      // the ground it is describing.
      //
      // Only what is on screen is built, and never more than a few hundred at
      // once. A village is thousands of plots and every label is a DOM node.
      const LABEL_CAP = 400;
      // The chip is mono at 10px: ~5.7px a character, plus its padding, and a
      // line is ~12px tall. Close enough to reserve space with, and measuring
      // 300 DOM nodes per pan to do better is not close to worth it.
      const chip = (text: string) => {
        const lines = text.split('\n');
        return [Math.max(...lines.map((l) => l.length)) * 5.7 + 9,
                lines.length * 12 + 5];
      };
      const writeTags = () => {
        const g = villageLabelRef.current;
        if (!g) return;
        g.clearLayers();
        const view = m.getBounds().pad(0.05);

        // Biggest plot first. Where two numbers cannot both fit, the one that
        // survives should be the one whose plot you can actually see — a
        // sliver at the edge of the frame does not get to hide its neighbour's
        // number.
        const seen: Array<[number, number, number, number]> = [];
        const near = tags
          .filter((t) => view.contains(t.at as L.LatLngTuple))
          .map((t) => {
            const nw = m.latLngToContainerPoint([t.ne[0], t.sw[1]]);
            const se = m.latLngToContainerPoint([t.sw[0], t.ne[1]]);
            const at = m.latLngToContainerPoint(t.at as L.LatLngTuple);
            return { t, at, w: se.x - nw.x, h: se.y - nw.y };
          })
          .filter((c) => c.w >= 26 && c.h >= 14)
          .sort((a, b) => b.w * b.h - a.w * a.h);

        let made = 0;
        for (const c of near) {
          if (made >= LABEL_CAP) break;
          // The extent goes UNDER the number, not beside it. Side by side,
          // "839 · 4.893 ac" needs ~74 px of width and a plot at the zoom
          // where a village is readable is nearer 40 — so the acres only ever
          // appeared once you were almost on top of one plot, which is not
          // when you want to be told how big it is. Stacked, the widest line
          // is the figure alone and the whole thing fits in half the width.
          //
          // Then a ladder, each rung narrower than the last: both lines, the
          // figure without its unit, the number alone, nothing. A label
          // written over another label answers neither question.
          const options = c.t.ac
            ? [`${c.t.lp}\n${c.t.ac} ac`, `${c.t.lp}\n${c.t.ac}`, c.t.lp]
            : [c.t.lp];
          for (const text of options) {
            const [w, h] = chip(text);
            if (h > c.h || w > c.w * 1.35) continue;   // it would spill its plot
            const box: [number, number, number, number] = [
              c.at.x - w / 2, c.at.y - h / 2, c.at.x + w / 2, c.at.y + h / 2];
            if (seen.some((o) => box[0] < o[2] && box[2] > o[0]
                              && box[1] < o[3] && box[3] > o[1])) continue;
            seen.push(box);
            L.marker(c.t.at as L.LatLngTuple, {
              icon: textIcon('w-plot-no', text),
              interactive: false,        // the plot underneath takes the click
              keyboard: false,
            }).addTo(g);
            made += 1;
            break;
          }
        }
      };
      writeTags();

      m.on('zoomend', thin);
      m.on('zoomend', writeTags);
      m.on('moveend', writeTags);
      villageOnRef.current = [['zoomend', thin], ['zoomend', writeTags],
                              ['moveend', writeTags]];

      // Find a plot by its number. A village is thousands of shapes and an
      // owner knows exactly one thing about theirs: what it is called on the
      // paper. Typing that is a better search than hunting the map.
      if (drawingRef.current || pickingRef.current) return;
      const wanted = (findPlot ?? '').trim();
      if (wanted) {
        const hit = plots.find((x) => x.lp === wanted);
        villageStateRef.current?.({ count: plots.length, found: !!hit });
        const searchKey = `${village}:${wanted}`;
        if (hit && foundRef.current !== searchKey) {
          foundRef.current = searchKey;
          const b = L.latLngBounds(hit.ring as L.LatLngTuple[]);
          if (b.isValid()) {
            m.fitBounds(b, { paddingTopLeft: [40, 40], paddingBottomRight: [60, 100],
                             maxZoom: 18 });
            fittedRef.current = true;
          }
          plotClickRef.current?.({ lp: hit.lp, ac: hit.ac, ring: hit.ring });
          return;                        // framed on the plot; do not re-fit
        }
        if (hit) return;                  // a selection redraw keeps that frame
      } else {
        foundRef.current = null;
        villageStateRef.current?.({ count: plots.length, found: false });
      }

      // Frame the village, unless the record already knows better.
      //
      // A shape file is surveyed geometry; a village NAME is a guess a
      // geocoder made. Asked for "Chinthagunta" the geocoder returned a place
      // 185 km from these plots, so turning the village map on showed an empty
      // field somewhere else entirely. Where the record has its own boundary
      // that still wins — it is the most exact thing on the record — and where
      // it has nothing, the village is a far better answer than the name.
      // Framed once per village, not gated on fittedRef: that flag is set by
      // the first-frame effect whether or not anything was actually framed,
      // so checking it here meant the village never got its own fit. Once per
      // village also means a pan is never yanked back on a redraw.
      if (!hasRing && villageFittedRef.current !== village) {
        villageFittedRef.current = village;
        const bounds = L.latLngBounds(plots.flatMap((x) => x.ring as L.LatLngTuple[]));
        if (bounds.isValid()) {
          m.fitBounds(bounds, still ? FIT_STILL : FIT);
          fittedRef.current = true;
          boundsRef.current = bounds;      // "recentre" now means the village
        }
      }
    });
    return () => {
      dropped = true;
      for (const [event, fn] of villageOnRef.current) map.off(event, fn);
      villageOnRef.current = [];
    };
    // `basemap` is a dependency because the plots are drawn in a colour that
    // depends on it — leave it out and switching to imagery keeps the ink
    // outlines that are invisible on it.
  }, [village, showVillage, activePlot, findPlot, basemap]);

  // Side lengths, written along the boundary itself. Own layer, own effect:
  // switching metres to feet must not touch the ring or the view.
  useEffect(() => {
    const group = rulerRef.current;
    const map = mapRef.current;
    if (!group || !map) return;
    group.clearLayers();
    const corners = openRing(ring);
    if (!sideLabels?.length || corners.length < 2) return;
    if (!corners.every(validPoint)) return;

    // Which way is "out" of this parcel, so a length can be written beside its
    // edge rather than across the field — or worse, on top of a corner.
    const cLat = corners.reduce((t, c) => t + c[0], 0) / corners.length;
    const cLon = corners.reduce((t, c) => t + c[1], 0) / corners.length;
    const OUT = 17;
    // Every corner in screen space, so a label can be told to get out of the
    // way of one. Computed once rather than per label.
    const discs = corners.map((c) => map.latLngToContainerPoint(c as L.LatLngTuple));
    /** Where labels have already landed, so they do not stack on each other. */
    const taken: L.Point[] = [];

    sideLabels.forEach((text, i) => {
      const a = corners[i];
      const b = corners[(i + 1) % corners.length];
      if (!a || !b) return;
      const pa = map.latLngToContainerPoint(a as L.LatLngTuple);
      const pb = map.latLngToContainerPoint(b as L.LatLngTuple);
      const at: L.LatLngTuple = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      // Push the label off its own edge, along that edge's perpendicular, on
      // whichever side faces away from the middle of the parcel.
      //
      // Pushing straight away from the centroid is the obvious version and it
      // is wrong on a concave shape: on a parcel with a notch, "away from the
      // centre" can point along the edge instead of off it, and the label
      // lands on the next corner anyway. The edge's own normal cannot.
      const ex = pb.x - pa.x;
      const ey = pb.y - pa.y;
      const elen = Math.hypot(ex, ey) || 1;
      let nx = -ey / elen;
      let ny = ex / elen;
      const mid = map.latLngToContainerPoint(at);
      const centre = map.latLngToContainerPoint([cLat, cLon] as L.LatLngTuple);
      if ((mid.x - centre.x) * nx + (mid.y - centre.y) * ny < 0) { nx = -nx; ny = -ny; }

      // EVERY side gets its length. A short side has no room beside itself —
      // its midpoint sits inside both corner discs at once — so rather than
      // dropping the label, walk it outward until it is clear and run a
      // hairline back to the edge it belongs to. That is what a surveyor's
      // sheet does with a cramped dimension, and it beats a number that is
      // simply missing: the earlier rule hid five of this parcel's thirteen.
      const halfW = (text.length * 6 + 12) / 2;
      const halfH = 9;
      const clearOf = (ox: number, oy: number, others: L.Point[]) => others.every((d) =>
        Math.abs(mid.x + ox - d.x) > halfW + 11 || Math.abs(mid.y + oy - d.y) > halfH + 11);

      let ox = nx * OUT;
      let oy = ny * OUT;
      let placed = false;
      // Outward first, then the other side, then further out on each — a
      // label belongs beside its own edge before it belongs anywhere else.
      for (const dist of [OUT, OUT + 12, OUT + 24, OUT + 38]) {
        for (const sign of [1, -1]) {
          const tx = nx * dist * sign;
          const ty = ny * dist * sign;
          if (clearOf(tx, ty, [...discs, ...taken])) { ox = tx; oy = ty; placed = true; break; }
        }
        if (placed) break;
      }
      // Remember where this one landed, so the next label does not sit on it.
      taken.push(L.point(mid.x + ox, mid.y + oy));

      // A leader line, only when the label had to travel to find room.
      if (Math.hypot(ox, oy) > OUT + 6) {
        const end = map.containerPointToLatLng(L.point(mid.x + ox * 0.72, mid.y + oy * 0.72));
        L.polyline([at, [end.lat, end.lng]], {
          className: 'w-side-leader', interactive: false,
        }).addTo(group);
      }

      L.marker(at, {
        icon: textIcon(`w-side${activeSide === i ? ' active' : ''}`, text, [0, 0], [ox, oy]),
        interactive: false,
        keyboard: false,
      }).addTo(group);
    });

    // An invisible fat line over each side, so a side can be clicked at all:
    // the ring is one polygon and a 2px stroke is not a target anyone can hit.
    // The selected one is drawn again, visibly, with a travelling dash.
    sideLabels.forEach((_, i) => {
      const a = corners[i];
      const b = corners[(i + 1) % corners.length];
      if (!a || !b) return;
      const seg = [a, b] as L.LatLngTuple[];
      L.polyline(seg, {
        className: 'w-side-hit', weight: 18, opacity: 0,
        interactive: !still,
        bubblingMouseEvents: false,
      }).addTo(group).on('click', (e) => {
        L.DomEvent.stop(e);              // never let this also drop a corner
        if (!editAt(e)) sideClickRef.current?.(i);
      });
      if (activeSide === i) {
        // Two strokes: a bold glowing line that stays, and a short spark that
        // runs it end to end. pathLength=1 normalises the dash maths so the
        // spark takes the same time on a 63 m side as on a 241 m one —
        // otherwise the short sides flicker and the long ones crawl.
        const lit = L.polyline(seg, { className: 'w-side-lit', interactive: false }).addTo(group);
        const spark = L.polyline(seg, { className: 'w-side-spark', interactive: false }).addTo(group);
        lit.getElement()?.setAttribute('pathLength', '1');
        spark.getElement()?.setAttribute('pathLength', '1');
      }
    });

    // The corners, numbered. Without these the table's "1 → 2" names two
    // points that appear nowhere on the map, and a side length cannot be tied
    // to the edge it belongs to. Numbering runs 1..N in ring order, which is
    // exactly the numbering ringSides() uses, so the two cannot disagree.
    //
    // Deliberately NOT the same treatment as a boundary mark: a mark is a
    // stone someone walked to and photographed, a corner is a vertex of a
    // drawn shape. Showing them alike would claim the outline had been
    // surveyed on the ground.
    corners.forEach((c, i) => {
      // A corner lights when it is picked itself, or when it is an endpoint of
      // the picked side — the side's two ends are part of what a side IS.
      const onSide = activeSide === i || activeSide === (i - 1 + corners.length) % corners.length;
      const picked = activeCorner === i;
      // ONE thing per corner: a numbered disc centred on the point. It used to
      // be a dot with the number floating beside it, which put a bare "13"
      // next to a bare "446 ft" and made them read as the same kind of label.
      const dot = L.marker(c as L.LatLngTuple, {
        icon: textIcon(
          `w-corner-no${picked ? ' picked' : onSide ? ' active' : ''}`, cornerLabel(i), [0, 0]),
        interactive: !still,
        keyboard: !still && !!cornerClickRef.current,
        title: `Corner ${cornerLabel(i)}`,
        alt: `Corner ${cornerLabel(i)}`,
        bubblingMouseEvents: false,
        // Above the side hit-lines, so clicking a corner asks about the corner
        // rather than about whichever edge happens to pass under it.
        zIndexOffset: 1000,
      }).addTo(group);
      dot.on('click', (e) => {
        L.DomEvent.stop(e);
        if (!editAt(e)) cornerClickRef.current?.(i);
      });
    });
  }, [ring, sideLabels, activeSide, activeCorner, zoomTick]);

  // When the panel's box changes — the window resized, the rail grew, the
  // phone rotated — Leaflet has to be told, or it keeps drawing at the old
  // size and every click maps to the wrong coordinate. invalidateSize() alone
  // preserves the top-left, so the centre is saved and put back: whatever the
  // owner was looking at stays where they left it.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const map = mapRef.current;
      if (!map) return;
      const centre = map.getCenter();
      const zoom = map.getZoom();
      map.invalidateSize({ animate: false });
      map.setView(centre, zoom, { animate: false });
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  // The tip on the selected side sits in ONE place: the panel's top-left.
  //
  // It has now been two other things, and both were worse. A Leaflet popup
  // anchored to the side ran off the edge of the panel, and Leaflet's only
  // cure is autoPan, which moves the map out from under the owner. Panel
  // furniture positioned from the side and clamped did stay inside — but it
  // jumped to a new place on every selection and slid on every pan, so
  // reading two sides in a row meant hunting for where the card had gone.
  //
  // A readout you consult is easier to use bolted down. You learn where it is
  // once; after that your eye goes straight to it, and the map underneath is
  // the only thing that moves.
  const showTip = !!tip;

  // The one-time reveal: the outline drawn on, corner by corner, the first
  // time anyone opens this screen. It is a flourish, so it is also strictly
  // optional — the ring is already on the map and this only animates its
  // stroke, so if it never runs nothing is missing.
  useEffect(() => {
    if (!introduce || !hasRing) return;
    const extra: SVGPathElement[] = [];
    const timers: number[] = [];
    const paint = () => {
      const path = boxRef.current?.querySelector('path.w-ring') as SVGPathElement | null;
      if (!path) return false;
      const len = path.getTotalLength?.() ?? 0;
      if (!len) return false;
      path.style.setProperty('--w-ring-len', String(len));
      path.classList.add('drawing');
      // Long enough to read as deliberate, short enough that nobody waits.
      timers.push(window.setTimeout(() => path.classList.remove('drawing'), 1600));

      return true;
    };
    // The path exists only after Leaflet has rendered the layer.
    const t = window.setTimeout(() => { if (!paint()) timers.push(window.setTimeout(paint, 200)); }, 80);
    return () => {
      window.clearTimeout(t);
      for (const id of timers) window.clearTimeout(id);
      for (const el of extra) el.remove();
    };
  }, [introduce, hasRing]);

  // The ambient light: a scatter of points along the boundary and one soft head
  // that travels it, once, when you arrive. Two clones of the ring's own path,
  // so they trace the parcel exactly and cost no geometry.
  //
  // Its own effect, and NOT the once-ever reveal above. That reveal is a
  // first-run explanation — it says "this line is your boundary" and saying it
  // twice would be talking down to somebody. This is ambient light: the point
  // of it is that it greets you every time you walk in, the way a car's
  // headliner does. Once per landing, never a loop.
  //
  // pathLength="1" is set on the clones, so every dash figure in the
  // stylesheet is a FRACTION of this parcel's own perimeter and the lap takes
  // the same time round a 300 m boundary as a 3 km one. Without it the
  // animation is a function of size: a smallholding flickers, an estate crawls.
  useEffect(() => {
    if (!hasRing) return undefined;
    const lights: SVGPathElement[] = [];
    const timers: number[] = [];
    const light = () => {
      const path = boxRef.current?.querySelector('path.w-ring') as SVGPathElement | null;
      if (!path) return false;
      for (const cls of ['w-ring-stars', 'w-ring-glow']) {
        const lit = path.cloneNode(false) as SVGPathElement;
        lit.setAttribute('class', cls);
        lit.setAttribute('pathLength', '1');
        lit.removeAttribute('style');
        path.parentNode?.insertBefore(lit, path.nextSibling);
        lights.push(lit);
      }
      // Taken out again when it has finished. This is a screen people keep
      // open for a long time, and decoration that stays is furniture.
      timers.push(window.setTimeout(() => {
        for (const el of lights) el.remove();
        lights.length = 0;
      }, 3600));
      return true;
    };
    const t = window.setTimeout(() => { if (!light()) timers.push(window.setTimeout(light, 220)); }, 90);
    return () => {
      window.clearTimeout(t);
      for (const id of timers) window.clearTimeout(id);
      for (const el of lights) el.remove();
    };
  }, [hasRing]);

  // Toggle the editing cursor on the ELEMENT, never through React's
  // className.
  //
  // Leaflet writes its own classes onto this same div imperatively —
  // leaflet-container, leaflet-grab, leaflet-touch, and the rest. React owns
  // the class attribute wholesale, so re-rendering with a computed className
  // wiped every one of them. What that broke was not obvious: losing
  // `leaflet-container` un-matched the stylesheet rule that keeps Leaflet's
  // own SVGs at their natural size, so the attribution's little Ukrainian flag
  // inflated to 317x212 and sat over the middle of the map, eating the clicks
  // meant for it. Drawing a boundary simply stopped working.
  useEffect(() => {
    boxRef.current?.classList.toggle('picking', picking || drawing);
    const map = mapRef.current;
    if (!map) return;
    if (picking || drawing || still) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
  }, [picking, drawing, still]);

  // An imported boundary needs its own frame when its preview opens. Later
  // clicks and drags preserve the view so tracing never fights the owner.
  useEffect(() => {
    if (!drawing) {
      drawingStartedRef.current = false;
      return;
    }
    if (drawingStartedRef.current) return;
    drawingStartedRef.current = true;
    const points = (draft ?? []).filter(validPoint);
    const map = mapRef.current;
    if (points.length && map) map.fitBounds(L.latLngBounds(points), fitOptions(map));
  }, [drawing, draft]);

  // Keep the active marker alive during a drag. Recreating it on each React
  // update tears down Leaflet's drag handler before the owner lets go.
  useEffect(() => {
    const group = draftLayerRef.current;
    const map = mapRef.current;
    if (!group || !map) return;
    const pts = draft ?? [];
    const current = draftRenderRef.current;
    if (drawing && pts.every(validPoint) && current && current.handles.length === pts.length) {
      current.outline?.setLatLngs(pts);
      pts.forEach((point, index) => {
        current.handles[index].setLatLng(point);
        const handle = current.handles[index];
        if (editDisabled) handle.dragging?.disable();
        else handle.dragging?.enable();
        handle.getElement()?.setAttribute('tabindex', editDisabled ? '-1' : '0');
        current.dots[index].setLatLng(point);
      });
      return;
    }
    group.clearLayers();
    draftRenderRef.current = null;
    if (!drawing || pts.length === 0 || !pts.every(validPoint)) return;

    let outline: { setLatLngs(latlngs: L.LatLngExpression[]): unknown } | undefined;
    if (pts.length >= 3) {
      outline = L.polygon(pts, { className: 'w-draft', interactive: false }).addTo(group);
    } else if (pts.length === 2) {
      outline = L.polyline(pts, { className: 'w-draft', interactive: false }).addTo(group);
    }
    const handles: L.Marker[] = [];
    const dots: L.CircleMarker[] = [];
    draftRenderRef.current = { handles, dots, outline };

    pts.forEach((p, i) => {
      // Draggable so a corner put down roughly can be walked onto the stone,
      // which is how anyone actually traces a field off imagery.
      const handle = L.marker(p as L.LatLngTuple, {
        icon: textIcon('w-draft-no', String(i + 1), [18, 18]),
        draggable: !editDisabled,
        keyboard: !editDisabled,
        bubblingMouseEvents: false,
        title: `Corner ${i + 1}: drag or use arrow keys to move`,
        alt: `Corner ${i + 1}: drag or use arrow keys to move`,
      }).addTo(group);
      // A usable touch target, with the number beside the actual coordinate.
      const element = handle.getElement();
      if (element) {
        element.style.width = '36px';
        element.style.height = '36px';
        const label = element.firstElementChild as HTMLElement | null;
        if (label) {
          label.style.position = 'absolute';
          label.style.left = '25px';
          label.style.top = '2px';
        }
      }
      const dot = L.circleMarker(p, {
        className: 'w-draft-dot', radius: 5, interactive: false,
      }).addTo(group);
      handles.push(handle);
      dots.push(dot);
      const moveCorner = () => {
        if (editDisabledRef.current) return;
        const ll = handle.getLatLng().wrap();
        const next = [...draftRef.current];
        next[i] = [ll.lat, ll.lng];
        draftRef.current = next;
        outline?.setLatLngs(next);
        dot.setLatLng(ll);
        onDraftRef.current?.(next);
      };
      handle.on('drag', moveCorner);
      handle.on('dragend', moveCorner);
      handle.on('click', (e) => L.DomEvent.stop(e));
      if (element) L.DomEvent.on(element, 'keydown', (event) => {
        const e = event as KeyboardEvent;
        if (editDisabledRef.current) return;
        const direction = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0],
          ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[e.key];
        if (!direction) return;
        L.DomEvent.stop(e);
        const at = map.latLngToContainerPoint(handle.getLatLng());
        const step = e.shiftKey ? 10 : 1;
        handle.setLatLng(map.containerPointToLatLng([at.x + direction[0] * step, at.y + direction[1] * step]));
        moveCorner();
      });
    });
  }, [drawing, draft, editDisabled]);

  // Selection restyles the existing dots. Rebuilding them instead — which is
  // what putting activeMarkId in the redraw effect above did — destroyed the
  // layer under the pointer, so the tooltip you were reading vanished on the
  // click that selected it and could not be reopened without moving away and
  // back.
  useEffect(() => {
    for (const [id, dot] of markLayersRef.current) {
      const el = dot.getElement();
      const on = id === activeMarkId;
      if (el) el.classList.toggle('active', on);
      dot.setRadius(on ? 8 : 6);
    }
  }, [activeMarkId, marks, basemap, drawing]);

  // First frame: the panel is often still being laid out when the map mounts,
  // so the initial fit happens here, once, with real dimensions.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => {
      map.invalidateSize();
      if (boundsRef.current) map.fitBounds(boundsRef.current, still ? FIT_STILL : FIT);
      else if (hasPin && pin) map.setView([pin.lat, pin.lon], 17);
      fittedRef.current = true;
    }, 60);
    return () => clearTimeout(t);
    // Fit to the parcel this panel opened on, not to every later change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRing, hasPin]);

  return (
    <>
      <div
        ref={boxRef}
        className="map"
        role={still ? 'img' : 'application'}
        aria-label={title ? `Map of ${title}` : 'Parcel map'}
        aria-description={!still ? 'Arrow keys pan the map. Plus and minus zoom. Drawn corners can be dragged or moved with arrow keys.' : undefined}
      />
      {/* Panel-sized sentences do not fit a card, and the card says where the
          record is in its own words directly below. A thumbnail that draws a
          pin and no boundary is still not inventing one. */}
      {/* Positioned from the side's midpoint, then clamped to the panel by
          the layout effect below, so it can never leave the map. */}
      {showTip && (
        <div
          ref={tipElRef}
          className="w-tip"
          role="dialog"
          aria-label="Side details"
          dangerouslySetInnerHTML={{ __html: tip as string }}
        />
      )}

      {village && villageCount != null && (
        <span className="vmnote">
          {villageCount > 0
            ? `${village} · ${villageCount.toLocaleString('en-IN')} plots`
            : `No village map on file for ${village}`}
        </span>
      )}

      {/* North. Web Mercator never rotates, so this is always up — which is
          exactly why it is worth printing: a surveyor reading "ENE" off the
          table needs to know the map is not oriented to the sheet, or to the
          direction they happen to be facing. */}
      {!still && (
        <span className="northrose" aria-label="North is up">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
            <path d="M12 3 L15 13 L12 11 L9 13 Z" />
          </svg>
          N
        </span>
      )}

      {/* One notice, from the component that knows what it actually drew. The
          panel used to add its own alongside this, and the two disagreed:
          this one said "the pin is where it was filed from" while the map was
          showing numbered stones and no pin. */}
      {!still && !drawing && !picking && !hasRing && !located && (
        <p className="nogeo">
          {offPlace
            // The record HAS coordinates; they just cannot be right. Say the
            // distance, because "somewhere near the village" is the honest
            // answer and the wrong pin is the thing worth fixing.
            ? `${offPlace} The map is showing the village on the record instead.`
            : anyMarks
              ? 'No surveyed boundary on this record. The numbered stones are where they were recorded — nothing joins them, because a handful of readings is not a boundary. Order a survey and the corners are set with a GPS.'
              : hasPin
                ? 'No surveyed boundary on this record — the pin is where it was filed from. Order a survey and the corners are set on the ground.'
                : 'This record has no location yet. Move the pin, or order a survey.'}
        </p>
      )}
      {!still && tilesFailed && (
        <p className="nogeo low">
          {basemap === 'satellite'
            ? 'Satellite imagery is unavailable here. Try Street view or zoom out.'
            : 'Street map tiles are unavailable. Try Satellite or check your connection.'}
          {' '}Your saved boundary and any drawing remain visible.
        </p>
      )}
    </>
  );
}
