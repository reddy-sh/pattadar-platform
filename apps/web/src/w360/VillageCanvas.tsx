/**
 * The village map itself — thousands of survey plots on real ground.
 *
 * Deliberately NOT MapCanvas. That component answers "where is this record and
 * what shape is it", and it carries a record's ring, its corner marks, side
 * lengths, a draft editor and a pin picker. This one answers a different
 * question — "which of these thousands is mine, and what is next to it" — and
 * needs things the record map has no business growing: three ways of shading a
 * cadastre, a label pass that decides what fits, a measuring tape, and a
 * selection that stays in step with a list beside it.
 *
 * Every polygon is canvas-rendered. Munagapadu is 2,729 plots; as SVG paths
 * that is tens of thousands of DOM nodes and the map stops panning.
 */
import { useEffect, useImperativeHandle, useRef } from 'react';
import type { Ref } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { cornerLabel } from '@pattadar/core';

import type { PlotFacts } from './villageGeom';
import { measureVillageTape } from './villageMeasure';

export type VillageMode = 'satellite' | 'street' | 'extent' | 'boundaries';

export interface VillageCanvasHandle {
  /** Frame the whole village again. */
  fit: () => void;
  /** Frame one plot. False when the village has no such number. */
  goTo: (lp: string) => boolean;
  /** Remove only the last point from the active tape. */
  undoMeasure: () => void;
  /** Empty the active tape without leaving measure mode. */
  clearMeasure: () => void;
  retryTiles: () => void;
}

export interface MeasureState {
  points: number;
  metres: number;
  /** Enclosed area once three points are down — a plot is a shape, not a line. */
  acres: number | null;
  /** A crossed or degenerate closed tape has distance, but no usable area. */
  error?: string;
  /** The points themselves, so what was walked can be costed as well as read. */
  ring: Array<[number, number]>;
}

/** A village as the mandal map knows it, without opening its plots. */
export interface VillageMark {
  village: string;
  key: string;
  plots?: number;
  acres?: number;
  centre?: [number, number];
  outline?: Array<Array<[number, number]>>;
}

export interface VillageCanvasProps {
  village: string;
  plots: PlotFacts[];
  /** Every village on record, drawn instead of plots. This is the landing
   *  state: the question there is "which village", and the answer is a map of
   *  all of them rather than a list of names. */
  overview?: VillageMark[];
  onPickVillage?: (village: string) => void;
  /** Segments of the village's own edge, drawn dashed. */
  outline: Array<Array<[number, number]>>;
  mode: VillageMode;
  /** Plot numbers written on the plots. Off is for reading the ground. */
  numbers: boolean;
  selected: string | null;
  hovered: string | null;
  measuring: boolean;
  onSelect: (lp: string | null) => void;
  onHover: (lp: string | null) => void;
  onZoom?: (zoom: number) => void;
  onMeasure?: (state: MeasureState) => void;
  onTilesFailed?: (failed: boolean) => void;
  ref?: Ref<VillageCanvasHandle>;
}

const ESRI =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const BLANK =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// Every colour below is drawn onto a Leaflet canvas over map imagery, not onto
// app paper (design.md § App-surface rules names this map/SVG-over-imagery case
// alongside FmbMapViewer). They are literals by necessity — the canvas renderer
// cannot resolve a CSS var — so each is named with its Bloom provenance and
// carries a Bloom value, never a stray triplet. Colour carries meaning here:
// the blue ramp is magnitude, amber is the selection, the paler amber is hover.

/** Plot size, in one hue light-to-dark — the encoding for a magnitude. Steps
 *  are the validated blue ramp, ordered dim-to-bright because they are read
 *  against imagery rather than paper: on dark ground the darkest step is the
 *  one that recedes. Blue and not the accent, so a shaded plot is never
 *  mistaken for the selected one. Each clears AA against the imagery beneath;
 *  the pair is checked by scripts/contrast-tests.ts. */
export const BANDS: Array<{ key: string; label: string; hex: string; min: number }> = [
  { key: 'xs', label: 'Under 1 ac', hex: '#184f95', min: 0 },
  { key: 's', label: '1 – 3 ac', hex: '#256abf', min: 1 },
  { key: 'm', label: '3 – 10 ac', hex: '#5598e7', min: 3 },
  { key: 'l', label: '10 ac and over', hex: '#b7d3f6', min: 10 },
];

export const bandOf = (acres: number) =>
  BANDS[acres >= 10 ? 3 : acres >= 3 ? 2 : acres >= 1 ? 1 : 0];

const ACCENT = '#fe860f'; // --color-accent · the selected plot
const HOVER = '#ffa03c'; // --color-focus · the hovered plot, one step lighter

// Plot and village edges. On street tiles they read against a light basemap, so
// they are the dark Bloom paper end; over satellite imagery they are the warm
// ink end so a hairline survives against dark ground. Both are Bloom paper/ink
// values, literal only because they paint onto the canvas over imagery.
const EDGE_ON_STREET = '#234d38'; // deep Bloom green — visible on a light basemap
const EDGE_ON_IMAGERY = '#f6ead8'; // warm paper tint — visible over satellite ground

/** What the scale bar is reading, in metres.
 *
 *  Leaflet's own arithmetic, repeated rather than scraped out of the control:
 *  the ground distance across 100 px, rounded down to the largest 1, 2, 3 or 5
 *  times a power of ten that fits. Repeating it is what lets a rule be written
 *  in the units on the screen — "not above 200 m" — instead of in a zoom level
 *  that means a different distance in every district. */
const scaleBar = (map: L.Map): number => {
  const y = map.getSize().y / 2;
  const across = map.distance(map.containerPointToLatLng([0, y]),
                              map.containerPointToLatLng([100, y]));
  if (!(across > 0)) return Infinity;
  const pow10 = 10 ** Math.floor(Math.log(across) / Math.LN10);
  const d = across / pow10;
  return (d >= 10 ? 10 : d >= 5 ? 5 : d >= 3 ? 3 : d >= 2 ? 2 : 1) * pow10;
};

/** The extent is only written on a plot once the map is at 200 m or closer.
 *  Further out it is a figure nobody is reading — you are looking for where
 *  your land IS at that distance, not how big it is — and it is 60% more
 *  label to fit in a frame that already cannot hold the numbers. */
const ACRES_AT = 200;

/** The smallest convex ring containing these points — Andrew's monotone chain.
 *  Used ONLY as a click target for a village on the mandal map: a hull fills
 *  the bays a real boundary cuts into, so it is never drawn as one. */
function convexHull(points: Array<[number, number]>): Array<[number, number]> {
  const pts = [...new Map(points.map((p) => [`${p[0]},${p[1]}`, p])).values()]
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const p of pts) {
    while (lower.length >= 2
      && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Array<[number, number]> = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2
      && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** A divIcon's `html` is assigned as innerHTML, so the text goes in as text.
 *  Same helper as the record map's, for the same reason. */
function textIcon(className: string, text: string, offset?: [number, number]): L.DivIcon {
  const el = document.createElement('span');
  el.textContent = text;
  if (offset) {
    el.style.setProperty('--ox', `${offset[0]}px`);
    el.style.setProperty('--oy', `${offset[1]}px`);
  }
  return L.divIcon({ className, html: el, iconSize: undefined, iconAnchor: [0, 0] });
}

/** Rough width of a mono label at 10px, and its height. Measuring the real DOM
 *  for three hundred candidates on every pan costs more than it buys. */
const chipBox = (text: string): [number, number] => {
  const lines = text.split('\n');
  return [Math.max(...lines.map((l) => l.length)) * 5.7 + 10, lines.length * 12 + 6];
};

export default function VillageCanvas({
  village, plots, outline, mode, numbers, selected, hovered, measuring,
  overview, onPickVillage, onSelect, onHover, onZoom, onMeasure, onTilesFailed, ref,
}: VillageCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const plotLayer = useRef<L.LayerGroup | null>(null);
  const edgeLayer = useRef<L.LayerGroup | null>(null);
  const tapeLayer = useRef<L.LayerGroup | null>(null);
  const renderer = useRef<L.Canvas | null>(null);
  const imagery = useRef<L.TileLayer | null>(null);
  const street = useRef<L.TileLayer | null>(null);
  const activeTiles = useRef<L.TileLayer | null>(null);
  const failedTiles = useRef(new Map<L.TileLayer, Set<HTMLElement>>());
  const labelBox = useRef<HTMLDivElement | null>(null);
  const shapes = useRef<Map<string, L.Polygon>>(new Map());
  /** A plot's extent, by its number. Restyling one polygon has to be a lookup
   *  and not a scan of the village: Munagapadu is 2,729 plots and the pointer
   *  crossing one fires this twice. */
  const acresOf = useRef<Map<string, number>>(new Map());
  /** What the last hover/selection pass painted, so the next one repaints
   *  those polygons instead of all of them. */
  const lit = useRef<{ selected: string | null; hovered: string | null }>(
    { selected: null, hovered: null });
  const fittedFor = useRef<string>('');
  const tape = useRef<Array<[number, number]>>([]);
  const watcher = useRef<ResizeObserver | null>(null);
  /** A teardown waiting for the next frame — see the init effect. */
  const kill = useRef<number | null>(null);

  // Props the map's own handlers read. They are installed once, and a handler
  // that closed over the first render's props would report the first render's
  // selection for the life of the map.
  const live = useRef({ measuring, onSelect, onHover, onMeasure, onTilesFailed, plots, overview, onPickVillage });
  live.current = { measuring, onSelect, onHover, onMeasure, onTilesFailed, plots, overview, onPickVillage };

  // ── The map, once ───────────────────────────────────────────────────
  useEffect(() => {
    // StrictMode mounts, unmounts and mounts again. Tearing a Leaflet map down
    // in between is not free: the canvas renderer has a redraw booked on the
    // next frame, and it runs against a context that no longer exists —
    // "Cannot read properties of undefined (reading 'clearRect')", once per
    // visit. So the teardown is itself deferred a frame and cancelled if the
    // component comes back, which turns the discarded pass into a no-op and
    // leaves a real unmount doing exactly what it did before.
    if (kill.current !== null) {
      cancelAnimationFrame(kill.current);
      kill.current = null;
    }
    const host = hostRef.current;
    if (!host) return undefined;
    if (mapRef.current) return teardown;

    // An explicit centre and zoom, because fitBounds against a 0×0 container
    // silently computes zoom 0 and lands the map in the Atlantic. The real
    // framing happens once the container reports a size, below.
    const map = L.map(host, {
      center: [15.9, 79.8], zoom: 12, zoomControl: false,
      attributionControl: true, preferCanvas: true,
    });
    mapRef.current = map;
    // Bottom right, out of the way of the mode chips and the plot search. The
    // top-left corner of a cadastral map belongs to the controls that change
    // what it is showing.
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    imagery.current = L.tileLayer(ESRI, { maxZoom: 19, attribution: 'Imagery © Esri', errorTileUrl: BLANK });
    street.current = L.tileLayer(OSM, { maxZoom: 19, attribution: '© OpenStreetMap contributors', errorTileUrl: BLANK });
    for (const layer of [imagery.current, street.current]) {
      const failures = new Set<HTMLElement>();
      failedTiles.current.set(layer, failures);
      const update = () => {
        if (activeTiles.current === layer) live.current.onTilesFailed?.(failures.size > 0);
      };
      layer.on('tileerror', (e: L.TileErrorEvent) => { failures.add(e.tile); update(); });
      layer.on('tileload', (e: L.TileEvent) => {
        if ((e.tile as HTMLImageElement).src === BLANK) return;
        failures.delete(e.tile);
        update();
      });
      layer.on('tileunload', (e: L.TileEvent) => { failures.delete(e.tile); update(); });
    }
    // Added to the map itself, not left to the first polygon that uses it.
    // Leaflet attaches a renderer when a layer needs it and detaches it when
    // the last one goes — and clearing the group to redraw a village did
    // exactly that, leaving the next draw calling clearRect on a canvas with
    // no context.
    renderer.current = L.canvas({ padding: 0.3 }).addTo(map);
    edgeLayer.current = L.layerGroup().addTo(map);
    plotLayer.current = L.layerGroup().addTo(map);
    tapeLayer.current = L.layerGroup().addTo(map);
    L.control.scale({ imperial: false, metric: true, position: 'bottomleft' }).addTo(map);

    // The labels are a plain overlay, not a Leaflet pane: they are wanted on
    // top of everything, they must never take a click, and they are hidden
    // wholesale during a pan rather than recomputed frame by frame.
    const box = document.createElement('div');
    box.className = 'vc-labels';
    host.appendChild(box);
    labelBox.current = box;

    map.on('click', () => {
      if (live.current.measuring) return;
      live.current.onSelect(null);
    });
    map.on('zoomend', () => onZoom?.(map.getZoom()));

    // Framing waits for a size. The map lives in a flex column, and on first
    // paint the container is 0×0 for a frame or two.
    const seen = new ResizeObserver(() => {
      const el = hostRef.current;
      if (!el || !el.clientWidth || !el.clientHeight) return;
      map.invalidateSize({ pan: false });
      // A drawer or a rotating phone changes the viewport, not which village
      // the owner chose. Preserve a deliberate pan/zoom on subsequent resizes.
      if (!fittedFor.current) fitNow();
    });
    seen.observe(host);

    watcher.current = seen;
    return teardown;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Reads the refs rather than the effect's own locals, so the cleanup a
   *  re-run installs still points at the live map. */
  const teardown = () => {
    kill.current = requestAnimationFrame(() => {
      kill.current = null;
      watcher.current?.disconnect();
      watcher.current = null;
      labelBox.current?.remove();
      labelBox.current = null;
      activeTiles.current = null;
      failedTiles.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
      shapes.current.clear();
      fittedFor.current = '';
    });
  };

  const fitNow = () => {
    const map = mapRef.current;
    const marks = live.current.overview;
    const pts: L.LatLngTuple[] = marks?.length
      ? marks.flatMap((m) => (m.outline ?? []).flat() as L.LatLngTuple[])
      : live.current.plots.flatMap((p) => p.ring as L.LatLngTuple[]);
    if (!map || !pts.length) return;
    const b = L.latLngBounds(pts);
    if (!b.isValid()) return;
    const host = hostRef.current;
    if (!host?.clientWidth || !host.clientHeight) return;
    fittedFor.current = marks?.length ? 'mandal' : village;
    map.fitBounds(b, { padding: [26, 26] });
  };

  // ── Basemap ─────────────────────────────────────────────────────────
  //
  // "Boundaries" has no basemap at all, and that is the mode, not a fallback:
  // it exists to read the geometry without a photograph underneath it, and the
  // panel's own surface is a better nothing than a tile server's. (A dark
  // street layer sat here first — CARTO's, which now answers every request
  // with API KEY REQUIRED stamped across the tile.)
  useEffect(() => {
    const map = mapRef.current;
    const photo = imagery.current;
    const roads = street.current;
    if (!map || !photo || !roads) return;
    const wanted = mode === 'boundaries' ? null : mode === 'street' ? roads : photo;
    activeTiles.current = wanted;
    live.current.onTilesFailed?.(!!wanted && (failedTiles.current.get(wanted)?.size ?? 0) > 0);
    for (const tiles of [photo, roads]) {
      if (tiles === wanted && !map.hasLayer(tiles)) tiles.addTo(map);
      else if (tiles !== wanted && map.hasLayer(tiles)) map.removeLayer(tiles);
      tiles.setZIndex(1);
    }
  }, [mode]);

  /** What a plot wears when it is neither selected nor hovered. */
  const plainStyle = (lp: string): L.PathOptions => {
    const shaded = mode === 'extent';
    const band = shaded ? bandOf(acresOf.current.get(lp) ?? 0).hex : '';
    return {
      color: shaded ? band
        : mode === 'street' ? EDGE_ON_STREET
        : mode === 'boundaries' ? 'rgba(255,255,255,0.68)' : 'rgba(255,255,255,0.52)',
      weight: shaded ? 0.7 : 0.9,
      fillColor: shaded ? band : '#ffffff',
      // Never zero. A polygon with no fill at all is not hit-tested, and the
      // whole screen is built on being able to click a field.
      fillOpacity: shaded ? 0.46 : 0.001,
    };
  };

  /** The selected plot, and the hovered one a step lighter. */
  const litStyle = (isSelected: boolean): L.PathOptions => ({
    color: isSelected ? ACCENT : HOVER,
    weight: isSelected ? 2.6 : 2,
    fillColor: isSelected ? ACCENT : HOVER,
    fillOpacity: isSelected ? 0.34 : 0.16,
  });

  // ── The plots ───────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const group = plotLayer.current;
    const edges = edgeLayer.current;
    if (!map || !group || !edges) return;
    group.clearLayers();
    edges.clearLayers();
    shapes.current.clear();
    acresOf.current = new Map(plots.map((p) => [p.lp, p.acres]));
    lit.current = { selected: null, hovered: null };

    // ── The mandal: every village on record, none of them opened ──────
    if (overview?.length) {
      for (const m of overview) {
        const segs = m.outline ?? [];
        for (const seg of segs) {
          L.polyline(seg as L.LatLngTuple[], {
            renderer: renderer.current ?? undefined,
            color: mode === 'street' ? EDGE_ON_STREET : EDGE_ON_IMAGERY, weight: 1.3, opacity: 0.8, dashArray: '7 6',
            interactive: false,
          }).addTo(edges);
        }
        // A village needs a shape to be hovered and clicked, and its outline
        // is a heap of loose segments. The hull of those segments is a hit
        // target and nothing else — it is never drawn as the boundary, which
        // it is not: it fills every bay the real edge cuts into.
        const hull = convexHull(segs.flat());
        if (hull.length >= 3) {
          const area = L.polygon(hull as L.LatLngTuple[], {
            renderer: renderer.current ?? undefined,
            color: 'transparent', weight: 0,
            fill: true, fillColor: ACCENT, fillOpacity: 0.001,
            interactive: true,
          });
          area.on('mouseover', () => { area.setStyle({ fillOpacity: 0.16 }); });
          area.on('mouseout', () => { area.setStyle({ fillOpacity: 0.001 }); });
          area.on('click', (e) => {
            L.DomEvent.stop(e);
            live.current.onPickVillage?.(m.village);
          });
          area.addTo(group);
        }
      }
      if (fittedFor.current !== 'mandal') {
        fitNow();
      }
      paintLabels();
      return;
    }

    for (const seg of outline) {
      L.polyline(seg as L.LatLngTuple[], {
        renderer: renderer.current ?? undefined,
        color: mode === 'street' ? EDGE_ON_STREET : EDGE_ON_IMAGERY, weight: 1.4, opacity: 0.75, dashArray: '7 6', interactive: false,
      }).addTo(edges);
    }

    for (const p of plots) {
      const isSelected = p.lp === selected;
      const isHot = !isSelected && p.lp === hovered;
      const poly = L.polygon(p.ring as L.LatLngTuple[], {
        renderer: renderer.current ?? undefined,
        fill: true,
        ...(isSelected || isHot ? litStyle(isSelected) : plainStyle(p.lp)),
      });
      poly.on('mouseover', () => live.current.onHover(p.lp));
      poly.on('mouseout', () => live.current.onHover(null));
      poly.on('click', (e) => {
        if (live.current.measuring) return;
        L.DomEvent.stop(e);
        live.current.onSelect(p.lp);
      });
      poly.addTo(group);
      if (isSelected || isHot) poly.bringToFront();
      if (!shapes.current.has(p.lp)) shapes.current.set(p.lp, poly);
    }
    lit.current = { selected, hovered };

    if (fittedFor.current !== village) {
      fitNow();
    }
    paintLabels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plots, outline, mode, village, overview]);

  // ── Hover and selection, restyled in place ──────────────────────────
  //
  // Only the plots that changed. Walking all of them was a full canvas repaint
  // per pointer move — and the pointer crossing one plot fires this twice,
  // once for the mouseout of the plot it left and once for the mouseover of
  // the one it entered. A mode change does not come through here at all: the
  // plots effect above rebuilds every polygon in the new mode already.
  //
  // The labels are not repainted either. They are written from `selected`, and
  // the label effect below already has `selected` in its deps; a hover
  // repainted the whole overlay to produce the identical DOM.
  useEffect(() => {
    const was = lit.current;
    lit.current = { selected, hovered };
    for (const lp of new Set([was.selected, was.hovered, selected, hovered])) {
      if (!lp) continue;
      const poly = shapes.current.get(lp);
      if (!poly) continue;
      const isSelected = lp === selected;
      const isHot = !isSelected && lp === hovered;
      if (!isSelected && !isHot) {
        poly.setStyle(plainStyle(lp));
        continue;
      }
      poly.setStyle(litStyle(isSelected));
      poly.bringToFront();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, hovered]);

  // ── Labels ──────────────────────────────────────────────────────────
  const paintLabels = () => {
    const map = mapRef.current;
    const box = labelBox.current;
    if (!map || !box) return;
    box.textContent = '';
    if (!numbers) return;

    const view = map.getBounds();
    const size = map.getSize();
    const acresToo = scaleBar(map) <= ACRES_AT;
    const taken: Array<[number, number, number, number]> = [];

    // On the mandal map the labels are the villages themselves. Same ladder as
    // a plot's: the whole label, then the name alone, then nothing — because
    // these villages are 25 km apart north to south and a few hundred metres
    // apart in the middle, so zoomed out to hold all of them the middle ones
    // sit on top of each other. Biggest first, so the one that survives a
    // collision is the one with most ground under it, and the panel beside the
    // map lists every village whatever the map can fit.
    if (overview?.length) {
      for (const m of [...overview].sort((a, b) => (b.plots ?? 0) - (a.plots ?? 0))) {
        if (!m.centre) continue;
        const at = map.latLngToContainerPoint(m.centre as L.LatLngTuple);
        const sub = `${(m.plots ?? 0).toLocaleString('en-IN')} plots`
          + (m.acres ? ` · ${Math.round(m.acres).toLocaleString('en-IN')} ac` : '');
        for (const withSub of [true, false]) {
          // Mono at 11px with 0.08em of tracking is nearer 7.6px a character
          // than 6.4, and the box is what keeps two village names apart — an
          // estimate that runs narrow lets them touch. Generous on purpose,
          // with a margin on top: the cost of being wrong the other way is a
          // name that could have fitted and did not.
          const w = Math.max(m.village.length * 7.6, withSub ? sub.length * 5.8 : 0) + 14;
          const h = (withSub ? 28 : 16) + 6;
          const rect: [number, number, number, number] =
            [at.x - w / 2, at.y - h / 2, at.x + w / 2, at.y + h / 2];
          if (taken.some((o) => rect[0] < o[2] && rect[2] > o[0]
                             && rect[1] < o[3] && rect[3] > o[1])) continue;
          taken.push(rect);
          const el = document.createElement('span');
          el.className = 'vc-village';
          const name = document.createElement('strong');
          name.textContent = m.village;
          el.append(name);
          if (withSub) {
            const line = document.createElement('span');
            line.textContent = sub;
            el.append(line);
          }
          el.style.left = `${at.x}px`;
          el.style.top = `${at.y}px`;
          box.appendChild(el);
          break;
        }
      }
      return;
    }

    const write = (p: PlotFacts, force: boolean) => {
      if (!force && !view.contains(p.centre as L.LatLngTuple)) return;
      const nw = map.latLngToContainerPoint([p.box[2], p.box[1]]);
      const se = map.latLngToContainerPoint([p.box[0], p.box[3]]);
      const w = se.x - nw.x;
      const h = se.y - nw.y;
      if (!force && (w < 26 || h < 14)) return;
      const at = map.latLngToContainerPoint(p.centre as L.LatLngTuple);
      const acres = p.acres.toFixed(p.acres >= 10 ? 1 : 2);
      // Stacked, not side by side: "839 · 4.89 ac" on one line needs about
      // twice the width, so the acres only ever appeared once you were on top
      // of a single plot. Then a ladder, each rung narrower than the last.
      const ladder = acresToo
        ? [`${p.lp}\n${acres} ac`, `${p.lp}\n${acres}`, p.lp]
        : [p.lp];
      for (const text of ladder) {
        const [cw, ch] = chipBox(text);
        if (!force && (ch > h || cw > w * 1.35)) continue;
        const rect: [number, number, number, number] =
          [at.x - cw / 2, at.y - ch / 2, at.x + cw / 2, at.y + ch / 2];
        // Off the edge of the map is worse than absent: half a number reads as
        // a different number.
        if (rect[0] < 2 || rect[1] < 2 || rect[2] > size.x - 2 || rect[3] > size.y - 2) {
          if (!force) continue;
        }
        if (!force && taken.some((o) => rect[0] < o[2] && rect[2] > o[0]
                                     && rect[1] < o[3] && rect[3] > o[1])) continue;
        taken.push(rect);
        const el = document.createElement('span');
        el.className = force ? 'vc-label on' : 'vc-label';
        el.textContent = text;                 // never innerHTML: a plot number
        el.style.left = `${at.x}px`;           // comes out of an uploaded file
        el.style.top = `${at.y}px`;
        box.appendChild(el);
        return;
      }
    };

    // The selected plot is written first and unconditionally. It is the one
    // thing on screen the reader has asked about; losing its number to a
    // collision with a neighbour's would be the one unacceptable outcome.
    const chosen = selected ? plots.find((p) => p.lp === selected) : null;
    if (chosen) write(chosen, true);

    let n = 0;
    for (const p of [...plots].sort((a, b) => b.acres - a.acres)) {
      if (n >= 400) break;
      if (p === chosen) continue;
      const before = taken.length;
      write(p, false);
      if (taken.length > before) n += 1;
    }
  };

  useEffect(() => {
    const map = mapRef.current;
    const box = labelBox.current;
    if (!map || !box) return;
    const hide = () => { box.style.opacity = '0'; };
    const show = () => { box.style.opacity = '1'; paintLabels(); };
    map.on('movestart', hide);
    map.on('zoomstart', hide);
    map.on('moveend', show);
    map.on('zoomend', show);
    paintLabels();
    return () => {
      map.off('movestart', hide);
      map.off('zoomstart', hide);
      map.off('moveend', show);
      map.off('zoomend', show);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numbers, plots, selected, overview]);

  // ── The tape ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const group = tapeLayer.current;
    if (!map || !group) return;
    if (!measuring) {
      tape.current = [];
      group.clearLayers();
      live.current.onMeasure?.({ points: 0, metres: 0, acres: null, ring: [] });
      return;
    }
    const drop = (e: L.LeafletMouseEvent) => {
      const point = e.latlng.wrap();
      const last = tape.current[tape.current.length - 1];
      if (last && map.distance(last, point) < 0.02) return;
      tape.current = [...tape.current, [point.lat, point.lng]];
      redrawTape();
    };
    // Screen-space offsets have to be recomputed when the screen moves.
    const again = () => redrawTape();
    map.on('click', drop);
    map.on('zoomend', again);
    map.on('moveend', again);
    const zoomedOnDoubleClick = map.doubleClickZoom.enabled();
    map.doubleClickZoom.disable();
    L.DomUtil.addClass(map.getContainer(), 'vc-measuring');
    return () => {
      map.off('click', drop);
      map.off('zoomend', again);
      map.off('moveend', again);
      if (zoomedOnDoubleClick) map.doubleClickZoom.enable();
      L.DomUtil.removeClass(map.getContainer(), 'vc-measuring');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measuring]);

  const redrawTape = () => {
    const map = mapRef.current;
    const group = tapeLayer.current;
    if (!map || !group) return;
    group.clearLayers();
    const pts = tape.current;
    const closed = pts.length >= 3;
    if (pts.length) {
      L.polyline((closed ? [...pts, pts[0]] : pts) as L.LatLngTuple[], {
        color: ACCENT, weight: 2.4, dashArray: '6 5', interactive: false,
      }).addTo(group);
    }

    // The corners get letters and the sides get their lengths — the same two
    // labels the record's own boundary wears, because they are the same two
    // facts. Letters and not numbers: a boundary screen is already covered in
    // numbers, and "13" beside "136 m" is two numbers you have to think about.
    //
    // Redrawn on every zoom and pan: the offsets that keep a length off its
    // own corner are in screen space, and screen space moves.
    const discs = pts.map((p) => map.latLngToContainerPoint(p as L.LatLngTuple));
    const cx = discs.reduce((t, d) => t + d.x, 0) / (discs.length || 1);
    const cy = discs.reduce((t, d) => t + d.y, 0) / (discs.length || 1);

    const sides: Array<[number, number]> = [];
    for (let i = 1; i < pts.length; i += 1) sides.push([i - 1, i]);
    if (closed) sides.push([pts.length - 1, 0]);

    for (const [i, j] of sides) {
      const a = pts[i];
      const b = pts[j];
      const d = map.distance(a as L.LatLngTuple, b as L.LatLngTuple);
      const at: L.LatLngTuple = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const pa = discs[i];
      const pb = discs[j];
      const ex = pb.x - pa.x;
      const ey = pb.y - pa.y;
      const len = Math.hypot(ex, ey) || 1;
      // The edge's own normal, turned to face away from the middle of the
      // shape. Pushing straight out from the centre is the obvious version and
      // it lands on the next corner as soon as the shape is not convex.
      let nx = -ey / len;
      let ny = ex / len;
      const mx = (pa.x + pb.x) / 2;
      const my = (pa.y + pb.y) / 2;
      if ((mx - cx) * nx + (my - cy) * ny < 0) { nx = -nx; ny = -ny; }
      let ox = nx * 16;
      let oy = ny * 16;
      // A short side has no room beside itself — its midpoint sits inside both
      // corner discs at once — so the label walks outward until it is clear.
      for (const away of [16, 28, 40]) {
        const tx = nx * away;
        const ty = ny * away;
        if (discs.every((p2) => Math.hypot(mx + tx - p2.x, my + ty - p2.y) > 18)) {
          ox = tx;
          oy = ty;
          break;
        }
      }
      L.marker(at, {
        icon: textIcon('w-side', d < 1000 ? `${d.toFixed(1)} m` : `${(d / 1000).toFixed(2)} km`,
                       [ox, oy]),
        interactive: false,
      }).addTo(group);
    }

    pts.forEach((p, i) => {
      L.marker(p as L.LatLngTuple, {
        icon: textIcon('w-corner-no', cornerLabel(i)),
        interactive: false,
        zIndexOffset: 1000,
      }).addTo(group);
    });
    if (pts.length >= 3) {
      L.polygon(pts as L.LatLngTuple[], {
        color: ACCENT, weight: 0, fillColor: ACCENT, fillOpacity: 0.14, interactive: false,
      }).addTo(group);
    }
    live.current.onMeasure?.(measureVillageTape(pts));
  };

  useImperativeHandle(ref, () => ({
    fit: () => { fitNow(); },
    undoMeasure: () => { tape.current = tape.current.slice(0, -1); redrawTape(); },
    clearMeasure: () => { tape.current = []; redrawTape(); },
    retryTiles: () => {
      const layer = activeTiles.current;
      if (!layer) return;
      failedTiles.current.get(layer)?.clear();
      live.current.onTilesFailed?.(false);
      layer.redraw();
    },
    goTo: (lp: string) => {
      const map = mapRef.current;
      const hit = plots.find((p) => p.lp === lp);
      if (!map || !hit) return false;
      const b = L.latLngBounds(hit.ring as L.LatLngTuple[]);
      if (!b.isValid()) return false;
      const framed = b.pad(1.4);
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        map.fitBounds(framed, { maxZoom: 17.5, animate: false });
      } else {
        map.flyToBounds(framed, { maxZoom: 17.5, duration: 0.6 });
      }
      return true;
    },
  }), [plots]);

  return <div className="vc-map" ref={hostRef} />;
}
