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

const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ESRI =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const BLANK =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

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
  selected?: string | null;
  hovered?: string | null;
  onHover?: (id: string | null) => void;
  onSelect?: (id: string | null) => void;
  /** A second click, or a click on the name, opens the record. */
  onOpen?: (id: string) => void;
  ref?: Ref<PortfolioCanvasHandle>;
}

/** Andhra Pradesh and Telangana together — the same opening view MapCanvas
 *  falls back to, so a portfolio with nothing locatable in it lands somewhere
 *  recognisable rather than in the Atlantic. */
const AP_TG: L.LatLngTuple = [16.9, 79.4];

export function PortfolioCanvas({
  records, satellite = false, selected = null, hovered = null,
  onHover, onSelect, onOpen, ref,
}: PortfolioCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const streetTiles = useRef<L.TileLayer | null>(null);
  const imageryTiles = useRef<L.TileLayer | null>(null);
  const shapeLayer = useRef<L.LayerGroup | null>(null);
  const labelBox = useRef<HTMLDivElement | null>(null);
  const watcher = useRef<ResizeObserver | null>(null);
  const kill = useRef<number | null>(null);
  /** Which set of records the view was framed for. Re-framing on every draw
   *  would yank the map back the moment anyone panned or picked a card. */
  const fittedFor = useRef('');
  const boxes = useRef(new Map<string, L.Path | L.CircleMarker>());
  const [tilesFailed, setTilesFailed] = useState(false);
  const activeTiles = useRef<L.TileLayer | null>(null);
  const failedTiles = useRef(new Map<L.TileLayer, Set<HTMLElement>>());

  /** Handlers read through a ref so the draw effect does not have to re-run —
   *  and re-create every layer — each time the page hands it a new closure. */
  const live = useRef({ records, selected, hovered, onHover, onSelect, onOpen });
  live.current = { records, selected, hovered, onHover, onSelect, onOpen };
  // The caller filters its records on every render. An equivalent array must
  // not replace the focused SVG path merely because a label was hovered.
  const recordsKey = JSON.stringify(records);

  useImperativeHandle(ref, () => ({
    fit: () => { fittedFor.current = ''; fitNow(); },
    goTo: (id: string) => {
      const map = mapRef.current;
      const rec = live.current.records.find((r) => r.id === id);
      if (!map || !rec || !isLocated(rec)) return false;
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

    // Labels are a plain overlay, not a Leaflet pane: they are wanted above
    // everything, they must never take a click, and they are hidden wholesale
    // during a pan rather than recomputed frame by frame.
    const box = document.createElement('div');
    box.className = 'pf-labels';
    host.appendChild(box);
    labelBox.current = box;

    map.on('click', () => live.current.onSelect?.(null));
    map.on('movestart zoomstart', () => box.classList.add('moving'));
    map.on('moveend zoomend', () => { box.classList.remove('moving'); place(); });

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
    if (!map || !box) return;
    const { records: currentRecords, selected: currentSelected, hovered: currentHovered } = live.current;
    box.textContent = '';
    const taken: Array<{ x: number; y: number; w: number; h: number }> = [];
    // The picked record is placed first so it never loses to a neighbour.
    const order = [...currentRecords.filter(isLocated)].sort((a, b) =>
      Number(b.id === currentSelected) - Number(a.id === currentSelected));
    const size = map.getSize();
    for (const r of order) {
      const p = map.latLngToContainerPoint(centreOf(r) as L.LatLngTuple);
      if (p.x < 0 || p.y < 0 || p.x > size.x || p.y > size.y) continue;

      // Measured, not estimated. A width guessed from the character count was
      // the first attempt and it let "Sy 402/1" and "Khata 30877" overlap:
      // survey numbers are proportionally spaced even in a mono face once the
      // padding and border are counted, and two numbers written over each
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
      const hit = { x: p.x - w / 2, y: p.y - h / 2, w, h };
      if (hit.x < 0 || hit.y < 0 || hit.x + w > size.x || hit.y + h > size.y
        || taken.some((t) => hit.x < t.x + t.w && hit.x + hit.w > t.x
                         && hit.y < t.y + t.h && hit.y + hit.h > t.y)) {
        el.remove();
        continue;
      }
      taken.push(hit);
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
        ? L.polygon(r.ring as L.LatLngTuple[], { className: `pf-shape ${tone}`, bubblingMouseEvents: false })
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
    <div className="pf-map" ref={hostRef} role="region" aria-label="Map of your properties" />
    {tilesFailed && (
      <p className="nogeo pf-map-error" role="status" style={{ top: '4rem', right: '3rem', zIndex: 500, pointerEvents: 'auto' }}>
        {satellite ? 'Satellite imagery' : 'Street map'} could not be fully loaded. Your saved locations are still shown.
        {' '}<button type="button" className="btn sm" onClick={retryTiles}>Retry map</button>
      </p>
    )}
  </>;
}

export default PortfolioCanvas;
