/** The Hydrogeology layer on a Leaflet map: drainage lines with arrowheads,
 *  the area draining to the main stream, and the numbered bore points. One
 *  drawing for both maps — a property's Maps tab (MapCanvas) and the Maps
 *  page (VillageCanvas) — so the layer reads the same wherever it is on
 *  (docs/specs/2026-10-25-pattadar-maps.md). The key is FlowKey in
 *  WaterFlowCard.tsx. */
import * as L from 'leaflet';

import { FLOW_INK } from './flowInk';

/** One drainage line, downstream order, [lat, lon]. `ha` drains through it;
 *  `agree` is how many of the 3 independent maps put a line there. */
export interface FlowLine { coords: Array<[number, number]>; ha: number; agree: number }
export interface FlowPinMark { rank: number; lat: number; lon: number; confidence: 'high' | 'medium' | 'low' }
/** The Hydrogeology layer. Areas are polygon rings in [lat, lon]. */
export interface WaterFlowLayer {
  lines: FlowLine[];
  mainArea?: Array<[number, number]> | null;
  pinArea?: Array<[number, number]> | null;
  pins: FlowPinMark[];
  selected?: number | null;
  /** Colour lines by how many maps agree. */
  byAgreement: boolean;
  /** The other maps' lines, drawn faintly underneath for comparison. */
  others?: FlowLine[] | null;
  /** Which map the lines come from, for the legend, in owner words ("NASA radar"). */
  label: string;
}

export interface FlowRenderers { svg: L.SVG; canvas: L.Canvas }

/** Water flow paints in a pane of its own under the overlay pane (400), so a
 *  boundary and its corners always draw on top of the lines. Canvas first, so
 *  the faint comparison lines it draws sit under the SVG. */
export function addFlowRenderers(map: L.Map): FlowRenderers {
  if (!map.getPane('w-flow')) map.createPane('w-flow').style.zIndex = '350';
  const canvas = L.canvas({ pane: 'w-flow', padding: 0.3 }).addTo(map);
  const svg = L.svg({ pane: 'w-flow' }).addTo(map);
  return { svg, canvas };
}

const placed = (p: { lat: number; lon: number }) =>
  Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180
  && (p.lat !== 0 || p.lon !== 0);

/** Filled triangles pointing downstream along a line: one at its middle, and
 *  one every `every` metres on longer lines. `metres` is each head's length. */
function arrowheads(coords: Array<[number, number]>, metres: number, every: number): Array<Array<[number, number]>> {
  const kx = Math.cos((coords[0][0] * Math.PI) / 180);
  const seg = (i: number) => Math.hypot((coords[i + 1][1] - coords[i][1]) * kx, coords[i + 1][0] - coords[i][0]) * 111_320;
  let total = 0;
  for (let i = 0; i + 1 < coords.length; i += 1) total += seg(i);
  if (total < metres * 2) return [];
  const marks = total < every * 1.5 ? [total / 2] : Array.from({ length: Math.floor(total / every) }, (_, k) => (k + 0.5) * every);
  const out: Array<Array<[number, number]>> = [];
  const deg = metres / 111_320;
  let i = 0;
  let walked = 0;
  for (const at of marks) {
    while (i + 1 < coords.length && walked + seg(i) < at) { walked += seg(i); i += 1; }
    if (i + 1 >= coords.length) break;
    const [a, b] = [coords[i], coords[i + 1]];
    const f = (at - walked) / (seg(i) || 1);
    const tip: [number, number] = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    const dx = (b[1] - a[1]) * kx;
    const dy = b[0] - a[0];
    const len = Math.hypot(dx, dy);
    if (!len) continue;
    const [ux, uy] = [dx / len, dy / len];
    const back = (side: number): [number, number] => {
      const x = -ux * deg + -uy * side * deg * 0.55;
      const y = -uy * deg + ux * side * deg * 0.55;
      return [tip[0] + y, tip[1] + x / kx];
    };
    out.push([back(1), tip, back(-1)]);
  }
  return out;
}

/** Lines (thin under 10 ha, medium to 100 ha, thick over) with filled
 *  arrowheads pointing downstream, the land draining to the main stream, and
 *  — when asked — the other maps' lines faintly underneath. Drawn small-first
 *  so big streams sit on top. Returns the cleanup for the zoom handler that
 *  resizes the arrowheads. */
export function drawFlowLines(
  map: L.Map, group: L.LayerGroup, { svg: renderer, canvas }: FlowRenderers,
  flow: Pick<WaterFlowLayer, 'lines' | 'mainArea' | 'others' | 'byAgreement'>,
): () => void {
  group.clearLayers();
  for (const line of flow.others ?? []) {
    if (line.coords.length < 2) continue;
    L.polyline(line.coords, {
      pane: 'w-flow', renderer: canvas, color: FLOW_INK.other, weight: 1.2, opacity: 0.55,
      interactive: false,
    }).addTo(group);
  }
  if (flow.mainArea && flow.mainArea.length >= 3) {
    L.polygon(flow.mainArea, {
      pane: 'w-flow', renderer, color: FLOW_INK.main, weight: 2.5, fillColor: FLOW_INK.main,
      fillOpacity: 0.18, interactive: false,
    }).addTo(group);
  }
  for (const line of [...flow.lines].sort((a, b) => a.ha - b.ha)) {
    if (line.coords.length < 2) continue;
    const weight = line.ha > 100 ? 4.5 : line.ha >= 10 ? 3 : 1.5;
    const faint = flow.byAgreement && line.agree <= 1;
    const opacity = !flow.byAgreement || line.agree >= 3 ? 1 : line.agree === 2 ? 0.7 : 0.5;
    const path = L.polyline(line.coords, {
      pane: 'w-flow', renderer, color: FLOW_INK.line, weight, opacity, className: 'w-flow-line',
      dashArray: faint ? '4 5' : undefined, lineCap: 'round', lineJoin: 'round',
      bubblingMouseEvents: false,
    });
    const acres = line.ha * 2.4711;
    const tip = document.createElement('span');
    tip.textContent = `About ${acres < 10 ? acres.toFixed(1) : Math.round(acres).toLocaleString('en-IN')} ac of land drains through here`;
    path.bindTooltip(tip, { sticky: true });
    path.addTo(group);
  }
  // Every arrowhead in one filled path: thousands of triangles, one node.
  // Sized in screen pixels, so they are rebuilt (cheaply) after each zoom.
  let heads: L.Polygon | null = null;
  const drawHeads = () => {
    if (heads) group.removeLayer(heads);
    const mPerPx = 40_075_016 * Math.cos((map.getCenter().lat * Math.PI) / 180) / 2 ** (map.getZoom() + 8);
    const rings: Array<Array<Array<[number, number]>>> = [];
    for (const line of flow.lines) {
      if (line.coords.length < 2) continue;
      const px = line.ha > 100 ? 13 : line.ha >= 10 ? 11 : 9;
      for (const h of arrowheads(line.coords, px * mPerPx, 90 * mPerPx)) rings.push([h]);
    }
    heads = rings.length ? L.polygon(rings, {
      pane: 'w-flow', renderer, stroke: false, fillColor: FLOW_INK.line, fillOpacity: 1,
      className: 'w-flow-line', interactive: false,
    }).addTo(group) : null;
  };
  drawHeads();
  map.on('zoomend', drawHeads);
  return () => { map.off('zoomend', drawHeads); };
}

/** Every placed bore point, for framing the parcel with its pins. */
export const flowPinPoints = (flow: Pick<WaterFlowLayer, 'pins'>): Array<[number, number]> =>
  flow.pins.filter(placed).map((p) => [p.lat, p.lon]);

/** The numbered bore points and the chosen one's draining area. A click on a
 *  point reports its rank; the caller decides whether a click means that right
 *  now (an armed edit tool on the property map takes it instead). */
export function drawFlowPins(
  group: L.LayerGroup, renderer: L.SVG, flow: Pick<WaterFlowLayer, 'pins' | 'pinArea' | 'selected'>,
  onPin: (rank: number, e: L.LeafletMouseEvent) => void,
): void {
  group.clearLayers();
  if (flow.pinArea && flow.pinArea.length >= 3) {
    L.polygon(flow.pinArea, {
      pane: 'w-flow', renderer, color: FLOW_INK.pinArea, weight: 2.5, fillColor: FLOW_INK.pinArea,
      fillOpacity: 0.22, interactive: false,
    }).addTo(group);
  }
  for (const p of flow.pins) {
    if (!placed(p)) continue;
    // The number goes in as text: a divIcon's `html` string is innerHTML.
    const disc = document.createElement('span');
    disc.textContent = String(p.rank);
    disc.style.background = FLOW_INK[p.confidence];
    disc.style.color = FLOW_INK.onPin;
    const marker = L.marker([p.lat, p.lon], {
      icon: L.divIcon({
        className: `w-flow-pin${p.rank === flow.selected ? ' active' : ''}`,
        html: disc, iconSize: undefined, iconAnchor: [0, 0],
      }),
      title: `Bore point ${p.rank}, ${p.confidence} confidence`,
      alt: `Bore point ${p.rank}`,
      keyboard: true,
      // Above the corner discs (1000): a bore point is what the owner came to see.
      zIndexOffset: 2000 + (p.rank === flow.selected ? 10 : -p.rank),
      bubblingMouseEvents: false,
    });
    marker.on('click', (e) => {
      L.DomEvent.stop(e);
      onPin(p.rank, e);
    });
    marker.addTo(group);
  }
}
