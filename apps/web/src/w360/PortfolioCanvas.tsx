/**
 * Everything you own, on one map.
 *
 * Deliberately NOT MapCanvas, and for the reason VillageCanvas gives in its own
 * header: that component answers "where is THIS record and what shape is it".
 * Half its props are structurally singular — `sideLabels` index into one ring,
 * `dimOutside` punches one hole in a world polygon, the reveal and the ambient
 * light both `querySelector` the first `path.w-ring` — so a multi-record mode
 * inside it would not be a prop, it would be a second component sharing a file.
 *
 * Not VillageCanvas either. That one has no pin at all (every layer is a
 * polygon), keys its shapes on a plot number that repeats across villages, and
 * is imagery-only. This map's records are scattered over districts, most of
 * them are a pin rather than a shape, and it has to say so.
 *
 * SVG, not canvas. VillageCanvas renders to canvas because Munagapadu is 2,729
 * plots; a portfolio is eight to forty, which is few enough to keep the DOM —
 * and keeping it is what lets every colour on this map come from a design token
 * that follows the light and dark schemes, instead of a hex literal frozen into
 * a canvas fill.
 */
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Ref } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { centreOf, hasBoundaryRing, isLocated } from './portfolioGeo';
import { drawSurveyBoundaryLayer, sharedCornerOffsets } from './surveyBoundaryLayer';

const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ESRI =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const BLANK =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const openRing = (ring: Array<[number, number]>) =>
  ring.length > 1
  && ring[0][0] === ring[ring.length - 1][0]
  && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1) : ring;

/** A label's box, in the map container's pixels. */
interface Box { x: number; y: number; w: number; h: number }

const clearOf = (s: Box, others: Box[]) => !others.some((t) =>
  s.x < t.x + t.w && s.x + s.w > t.x && s.y < t.y + t.h && s.y + s.h > t.y);

const within = (s: Box, b: Box) =>
  s.x >= b.x && s.y >= b.y && s.x + s.w <= b.x + b.w && s.y + s.h <= b.y + b.h;

/** Where a survey map may move a name off the middle of its outline, in label
 *  widths and heights, nearest first. */
const NAME_SPOTS: Array<[number, number]> = [
  [0, 0], [0, -1], [0, 1],
  [-0.25, 0], [0.25, 0], [-0.25, -1], [0.25, -1], [-0.25, 1], [0.25, 1],
  [-0.5, 0], [0.5, 0], [-0.5, -1], [0.5, -1], [-0.5, 1], [0.5, 1],
];

/** An outline's box on screen. */
function screenBox(map: L.Map, ring: Array<[number, number]>): Box {
  const pts = ring.map((corner) => map.latLngToContainerPoint(corner as L.LatLngTuple));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** One record as this map needs it. Everything else about it — worth, khata,
 *  tags — belongs on the card, and putting it here would only mean two places
 *  to change when a figure moves. */
export interface PortfolioPin {
  id: string;
  title: string;
  /** Village and mandal, already joined by the caller. */
  where: string;
  /** owned | for_sale | disputed | … — colour is status, as on the cards. */
  status: string;
  /** The surveyed outline, or empty. Fewer than three corners is not a shape. */
  ring: Array<[number, number]>;
  /** Already-formatted dimensions in ring order. Present only when this map is
   * being used as a survey map rather than as the portfolio overview. */
  sideLabels?: string[];
  lat: number;
  lon: number;
}

export interface PortfolioCanvasHandle {
  /** Frame everything again — what the recentre button means here. */
  fit: () => void;
  /** Frame one record. False when it has nowhere to go. */
  goTo: (id: string) => boolean;
}

export interface PortfolioCanvasProps {
  records: PortfolioPin[];
  satellite?: boolean;
  /** Portfolio colours statuses; surveyed uses the Location map's orange
   * boundary, corner letters, and dimensions for every ring. */
  appearance?: 'portfolio' | 'surveyed';
  selected?: string | null;
  hovered?: string | null;
  onHover?: (id: string | null) => void;
  onSelect?: (id: string | null) => void;
  /** A second click (or Enter) on the picked record. Properties opens the
   *  record; the combined map zooms to it instead. */
  onOpen?: (id: string) => void;
  /** The map region's accessible name. Properties' map is the whole
   *  portfolio; a combined view's holds only its own records. */
  label?: string;
  ref?: Ref<PortfolioCanvasHandle>;
}

/** Andhra Pradesh and Telangana together — the same opening view MapCanvas
 *  falls back to, so a portfolio with nothing locatable in it lands somewhere
 *  recognisable rather than in the Atlantic. */
const AP_TG: L.LatLngTuple = [16.9, 79.4];

export function PortfolioCanvas({
  records, satellite = false, appearance = 'portfolio', selected = null, hovered = null,
  onHover, onSelect, onOpen, label = 'Map of your properties', ref,
}: PortfolioCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const streetTiles = useRef<L.TileLayer | null>(null);
  const imageryTiles = useRef<L.TileLayer | null>(null);
  const shapeLayer = useRef<L.LayerGroup | null>(null);
  const rulerLayer = useRef<L.LayerGroup | null>(null);
  const labelBox = useRef<HTMLDivElement | null>(null);
  const watcher = useRef<ResizeObserver | null>(null);
  const kill = useRef<number | null>(null);
  /** Which set of records the view was framed for. Re-framing on every draw
   *  would yank the map back the moment anyone panned or picked a card. */
  const fittedFor = useRef('');
  const boxes = useRef(new Map<string, L.Path | L.CircleMarker>());
  const [tilesFailed, setTilesFailed] = useState(false);
  const [zoomTick, setZoomTick] = useState(0);
  const activeTiles = useRef<L.TileLayer | null>(null);
  const failedTiles = useRef(new Map<L.TileLayer, Set<HTMLElement>>());

  /** Handlers read through a ref so the draw effect does not have to re-run —
   *  and re-create every layer — each time the page hands it a new closure. */
  const live = useRef({ records, selected, hovered, onHover, onSelect, onOpen, appearance });
  live.current = { records, selected, hovered, onHover, onSelect, onOpen, appearance };
  // The caller filters its records on every render. An equivalent array must
  // not replace the focused SVG path merely because a label was hovered.
  const recordsKey = JSON.stringify([appearance, records]);

  // Both measure the box before framing. Right after a size change — a stage
  // going full screen, or coming back — Leaflet still holds the old size, and a
  // frame computed from it lands off centre.
  useImperativeHandle(ref, () => ({
    fit: () => {
      mapRef.current?.invalidateSize({ pan: false });
      fittedFor.current = '';
      fitNow();
    },
    goTo: (id: string) => {
      const map = mapRef.current;
      const rec = live.current.records.find((r) => r.id === id);
      if (!map || !rec || !isLocated(rec)) return false;
      map.invalidateSize({ pan: false });
      if (hasBoundaryRing(rec.ring)) {
        map.fitBounds(L.latLngBounds(rec.ring as L.LatLngTuple[]), { padding: [60, 60], maxZoom: 19 });
      } else {
        map.setView(centreOf(rec) as L.LatLngTuple, Math.max(map.getZoom(), 15));
      }
      return true;
    },
  }));

  // ── The map itself, once ────────────────────────────────────────────
  useEffect(() => {
    if (kill.current !== null) {
      // A StrictMode remount arriving before the deferred teardown ran. Cancel
      // it: letting it fire would tear down the map this pass just built.
      cancelAnimationFrame(kill.current);
      kill.current = null;
    }
    const host = hostRef.current;
    if (!host) return undefined;
    if (mapRef.current) return teardown;

    // An explicit centre and zoom, because fitBounds against a 0×0 container
    // computes zoom 0 and lands the map in the Atlantic. Real framing happens
    // once the container reports a size, below.
    const map = L.map(host, {
      center: AP_TG, zoom: 7, zoomControl: false, attributionControl: true,
    });
    mapRef.current = map;
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ imperial: false, metric: true, position: 'bottomleft' }).addTo(map);
    streetTiles.current = L.tileLayer(OSM, {
      maxZoom: 19, attribution: '© OpenStreetMap contributors',
      errorTileUrl: BLANK,
    });
    imageryTiles.current = L.tileLayer(ESRI, {
      maxZoom: 19, attribution: 'Imagery © Esri', errorTileUrl: BLANK,
    });
    for (const layer of [streetTiles.current, imageryTiles.current]) {
      const failures = new Set<HTMLElement>();
      failedTiles.current.set(layer, failures);
      const update = () => {
        if (activeTiles.current === layer) setTilesFailed(failures.size > 0);
      };
      layer.on('tileerror', (e: L.TileErrorEvent) => { failures.add(e.tile); update(); });
      layer.on('tileload', (e: L.TileEvent) => {
        // A failed tile loads its transparent replacement next. That is not
        // the imagery recovering and must not dismiss the explanation.
        if ((e.tile as HTMLImageElement).src === BLANK) return;
        failures.delete(e.tile);
        update();
      });
      layer.on('tileunload', (e: L.TileEvent) => { failures.delete(e.tile); update(); });
    }
    shapeLayer.current = L.layerGroup().addTo(map);
    rulerLayer.current = L.layerGroup().addTo(map);

    // Labels are a plain overlay, not a Leaflet pane: they are wanted above
    // everything, they must never take a click, and they are hidden wholesale
    // during a pan rather than recomputed frame by frame.
    const box = document.createElement('div');
    box.className = 'pf-labels';
    host.appendChild(box);
    labelBox.current = box;

    map.on('click', () => live.current.onSelect?.(null));
    map.on('movestart zoomstart', () => box.classList.add('moving'));
    map.on('moveend', () => { box.classList.remove('moving'); place(); });
    map.on('zoomend', () => {
      box.classList.remove('moving');
      place();
      setZoomTick((tick) => tick + 1);
    });

    // Framing waits for a size: the panel is laid out after the map mounts and
    // is 0×0 for a frame or two.
    const seen = new ResizeObserver(() => {
      const el = hostRef.current;
      if (!el || !el.clientWidth || !el.clientHeight) return;
      map.invalidateSize({ pan: false });
      fitNow();
      place();
    });
    seen.observe(host);
    watcher.current = seen;
    return teardown;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Reads the refs rather than the effect's own locals, so the cleanup a
   *  re-run installs still points at the live map. Deferred a frame because
   *  StrictMode mounts, unmounts and remounts in the same tick. */
  const teardown = () => {
    kill.current = requestAnimationFrame(() => {
      kill.current = null;
      watcher.current?.disconnect();
      watcher.current = null;
      labelBox.current?.remove();
      labelBox.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      shapeLayer.current = null;
      rulerLayer.current = null;
      boxes.current.clear();
      failedTiles.current.clear();
      activeTiles.current = null;
      fittedFor.current = '';
    });
  };

  const fitNow = () => {
    const map = mapRef.current;
    if (!map) return;
    const drawn = live.current.records.filter(isLocated);
    const key = JSON.stringify(drawn.map((r) => [r.id,
      hasBoundaryRing(r.ring) ? r.ring : [r.lat, r.lon]]).sort(([a], [b]) => String(a).localeCompare(String(b))));
    if (!drawn.length || key === fittedFor.current) return;
    const host = hostRef.current;
    if (!host?.clientWidth || !host.clientHeight) return;
    const pts: L.LatLngTuple[] = drawn.flatMap((r) =>
      (hasBoundaryRing(r.ring) ? (r.ring as L.LatLngTuple[]) : [centreOf(r) as L.LatLngTuple]));
    const b = L.latLngBounds(pts);
    if (!b.isValid()) return;
    fittedFor.current = key;
    // A single pin has no extent, so fitBounds would zoom to the tile server's
    // maximum and show one roof. A portfolio of one is still a portfolio.
    if (drawn.length === 1 && !hasBoundaryRing(drawn[0].ring)) {
      map.setView(pts[0], 15);
      return;
    }
    map.fitBounds(b, { padding: [36, 36], maxZoom: 17 });
  };

  /** Names on the map, and the reason this is an overlay rather than N Leaflet
   *  markers: a label that collides with one already placed is DROPPED, and
   *  deciding that needs every label's screen box at once. Two survey numbers
   *  written over each other read as a third number that does not exist. */
  const place = () => {
    const map = mapRef.current;
    const box = labelBox.current;
    const host = hostRef.current;
    if (!map || !box || !host) return;
    const { records: currentRecords, selected: currentSelected, hovered: currentHovered } = live.current;
    box.textContent = '';
    // A survey map's corner letters and side lengths are text too, and a name
    // set down on one read as a longer label — "Sy 214/2" over half of "89 m".
    // They are obstacles the names step around, measured from the DOM like the
    // names themselves. The portfolio map draws neither, so nothing changes there.
    const surveyed = live.current.appearance === 'surveyed';
    const origin = host.getBoundingClientRect();
    const marks: Box[] = Array.from(
      host.querySelectorAll<HTMLElement>('.w-side > span, .w-corner-no > span'),
    ).map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
    }).filter((t) => t.w > 0 && t.h > 0);
    const placed: Box[] = [];
    // The picked record is placed first so it never loses to a neighbour.
    const order = [...currentRecords.filter(isLocated)].sort((a, b) =>
      Number(b.id === currentSelected) - Number(a.id === currentSelected));
    const size = map.getSize();
    for (const r of order) {
      const p = map.latLngToContainerPoint(centreOf(r) as L.LatLngTuple);
      if (p.x < 0 || p.y < 0 || p.x > size.x || p.y > size.y) continue;

      // Measured, not estimated. A width guessed from the character count was
      // the first attempt and it let "Sy 402/1" and "Khata 30877" overlap:
      // survey numbers are proportionally spaced in the one face, and the
      // padding and border count too; two numbers written over each
      // other read as a third number that does not exist. So the label is
      // appended, measured, and taken away again if it landed on one already
      // placed — a layout read per label, on a set of eight to forty, at the
      // end of a pan.
      const el = document.createElement('span');
      el.className = `pf-label${r.id === currentSelected ? ' on' : ''}${r.id === currentHovered ? ' lit' : ''}`;
      el.textContent = r.title;
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      box.appendChild(el);

      const w = el.offsetWidth + 4;        // +4: a hair of air between two names
      const h = el.offsetHeight + 4;
      const spotAt = (dx: number, dy: number) => ({ x: p.x + dx - w / 2, y: p.y + dy - h / 2, w, h, dx, dy });
      const inWindow = (s: Box) => s.x >= 0 && s.y >= 0 && s.x + s.w <= size.x && s.y + s.h <= size.y;
      // On a survey map the middle of an outline is where the lengths of a
      // shared edge and the letters of a shared corner land. So a few nearby
      // spots are tried, nearest first and never outside the outline's own box.
      // An outline smaller than its name, lengths and letters together cannot
      // carry all of them without printing text over text, so there the name
      // waits for the next zoom: the rail, the tooltip and the pick panel still
      // name it. The portfolio map keeps its one position: a pin's name moved
      // off its pin names nothing.
      let hit: (Box & { dx: number; dy: number }) | undefined;
      if (surveyed) {
        const bounds = hasBoundaryRing(r.ring) ? screenBox(map, r.ring) : null;
        hit = NAME_SPOTS.map(([fx, fy]) => spotAt(fx * w, fy * h)).find((s) => inWindow(s)
          && clearOf(s, placed) && clearOf(s, marks)
          && ((s.dx === 0 && s.dy === 0) || !bounds || within(s, bounds)));
      } else {
        const centre = spotAt(0, 0);
        if (inWindow(centre) && clearOf(centre, placed)) hit = centre;
      }
      if (!hit) {
        el.remove();
        continue;
      }
      if (hit.dx || hit.dy) {
        el.style.left = `${p.x + hit.dx}px`;
        el.style.top = `${p.y + hit.dy}px`;
      }
      placed.push(hit);
    }
  };

  // ── Basemap ─────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const street = streetTiles.current;
    const imagery = imageryTiles.current;
    if (!map || !street || !imagery) return;
    const want = satellite ? imagery : street;
    const drop = satellite ? street : imagery;
    activeTiles.current = want;
    setTilesFailed((failedTiles.current.get(want)?.size ?? 0) > 0);
    if (map.hasLayer(drop)) map.removeLayer(drop);
    if (!map.hasLayer(want)) want.addTo(map);
    want.setZIndex(1);
  }, [satellite]);

  // ── The records ─────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const group = shapeLayer.current;
    if (!map || !group) return;
    group.clearLayers();
    boxes.current.clear();

    for (const r of records) {
      if (!isLocated(r)) continue;
      const tone = `pf-${r.status === 'disputed' ? 'disputed'
        : r.status === 'for_sale' ? 'sale' : 'owned'}`;
      const layer: L.Path = hasBoundaryRing(r.ring)
        ? L.polygon(r.ring as L.LatLngTuple[], {
          className: appearance === 'surveyed'
            ? 'w-ring pf-survey' : `pf-shape ${tone}`,
          bubblingMouseEvents: false,
        })
        // A pin, and shaped as one deliberately: a record with no survey has a
        // POSITION and not an extent, and drawing it as a little square would
        // claim a boundary the record does not have.
        : L.circleMarker(centreOf(r) as L.LatLngTuple, {
          radius: 7, className: `pf-pin ${tone}`, bubblingMouseEvents: false,
        });

      const tooltip = document.createElement('span');
      tooltip.textContent = [r.title, r.where].filter(Boolean).join(' · ');
      layer.bindTooltip(tooltip, { direction: 'top', opacity: 1 });
      layer.on('mouseover', () => live.current.onHover?.(r.id));
      layer.on('mouseout', () => live.current.onHover?.(null));
      layer.on('click', () => {
        if (r.id === live.current.selected) live.current.onOpen?.(r.id);
        else live.current.onSelect?.(r.id);
      });
      layer.addTo(group);
      const element = layer.getElement();
      if (element) {
        element.setAttribute('tabindex', '0');
        element.setAttribute('role', 'button');
        element.setAttribute('aria-label', `Select ${r.title}`);
        element.addEventListener('keydown', (e) => {
          const key = (e as KeyboardEvent).key;
          if (key !== 'Enter' && key !== ' ') return;
          e.preventDefault();
          e.stopPropagation();
          if (r.id === live.current.selected) live.current.onOpen?.(r.id);
          else live.current.onSelect?.(r.id);
        });
      }
      boxes.current.set(r.id, layer);
    }

    fitNow();
    place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordsKey]);

  // Combined FMB uses the same ruler grammar as one record's Location map:
  // every selected outline carries its corner letters and side lengths. This
  // layer is separate from the polygons so a zoom can recompute screen-space
  // label offsets without replacing the focusable survey paths underneath.
  useEffect(() => {
    const map = mapRef.current;
    const group = rulerLayer.current;
    if (!map || !group) return;
    group.clearLayers();
    if (appearance !== 'surveyed') return;

    const surveyed = records.filter((record) =>
      hasBoundaryRing(record.ring) && record.sideLabels?.length);
    const rings = surveyed.map((record) => openRing(record.ring));
    // Where two outlines share a corner, each disc steps into its own outline
    // so both letters can be read; the lengths then avoid the discs where they
    // are actually drawn.
    const offsets = sharedCornerOffsets(map, rings);
    const collisionPoints = rings.flatMap((ring, r) => ring.map((corner, i) => {
      const p = map.latLngToContainerPoint(corner as L.LatLngTuple);
      const nudge = offsets[r][i];
      return nudge ? L.point(p.x + nudge[0], p.y + nudge[1]) : p;
    }));
    const taken: L.Point[] = [];
    surveyed.forEach((record, r) => {
      drawSurveyBoundaryLayer({
        map,
        group,
        ring: rings[r],
        sideLabels: record.sideLabels ?? [],
        collisionPoints,
        taken,
        cornerOffsets: offsets[r],
      });
    });
    // The names avoid the discs and lengths just drawn, so they are placed
    // again now rather than against the ones this redraw replaced.
    place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appearance, recordsKey, zoomTick]);

  useEffect(() => {
    for (const [id, layer] of boxes.current) {
      const element = layer.getElement();
      element?.classList.toggle('on', id === selected);
      element?.classList.toggle('lit', id === hovered);
      element?.setAttribute('aria-pressed', String(id === selected));
      if (id === selected || id === hovered) layer.bringToFront();
    }
    place();
  }, [recordsKey, selected, hovered]);

  const retryTiles = () => {
    const layer = activeTiles.current;
    if (!layer) return;
    failedTiles.current.get(layer)?.clear();
    setTilesFailed(false);
    layer.redraw();
  };

  return <>
    <div className="pf-map" ref={hostRef} role="region" aria-label={label} />
    {tilesFailed && (
      <p className="nogeo low pf-map-error" role="status" style={{ right: '3rem', zIndex: 500, pointerEvents: 'auto' }}>
        {satellite ? 'Satellite imagery' : 'Street map'} could not be fully loaded.
        {' '}<button type="button" className="btn sm" onClick={retryTiles}>Retry map</button>
      </p>
    )}
  </>;
}

export default PortfolioCanvas;
