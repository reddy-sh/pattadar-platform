import * as L from 'leaflet';

import { cornerLabel } from '@pattadar/core';

/** Safe text-only Leaflet label. Survey titles and dimensions can originate in
 * owner records, so none of them cross through an HTML string. */
function textIcon(
  className: string,
  text: string,
  anchor?: [number, number],
  offset?: [number, number],
): L.DivIcon {
  const el = document.createElement('span');
  el.textContent = text;
  if (offset) {
    el.style.setProperty('--ox', `${offset[0]}px`);
    el.style.setProperty('--oy', `${offset[1]}px`);
  }
  return L.divIcon({ className, html: el, iconSize: undefined, iconAnchor: anchor });
}

export interface SurveyBoundaryLayerOptions {
  map: L.Map;
  group: L.LayerGroup;
  ring: Array<[number, number]>;
  sideLabels: string[];
  activeSide?: number | null;
  activeCorner?: number | null;
  interactive?: boolean;
  onSideClick?: (index: number, event: L.LeafletMouseEvent) => void;
  onCornerClick?: (index: number, event: L.LeafletMouseEvent) => void;
  /** All corners on a multi-survey map, so one survey's dimensions avoid the
   * next survey's corner discs as well as its own. */
  collisionPoints?: L.Point[];
  /** Shared across surveys so dimensions from different outlines do not stack. */
  taken?: L.Point[];
  /** Screen-space nudges for corner discs, by corner index — from
   * `sharedCornerOffsets` on a map of several outlines. Unset on a single
   * record's map, where every disc sits exactly on its corner. */
  cornerOffsets?: ReadonlyArray<readonly [number, number] | null>;
}

/** How far a disc moves off a shared corner, and how close two corners of
 *  different outlines must be to count as one point. A disc is 18px across. */
const NUDGE = 16;
const CLOSE = 18;

/** Where two outlines meet at a corner, move each disc into its own outline.
 *
 *  Two surveys sharing a boundary share its two ends, and the second disc was
 *  drawn over the first: the shared corners of two adjoining squares read
 *  "A A B" over "D D C", and one letter of each pair was simply gone. Each disc
 *  that lands on another outline's corner moves a few pixels along its own
 *  corner's inward bisector, so both letters stay readable and each sits on the
 *  side of the line it belongs to. Screen space, so it is recomputed on every
 *  zoom, like the side lengths. */
export function sharedCornerOffsets(
  map: L.Map,
  rings: ReadonlyArray<ReadonlyArray<[number, number]>>,
): Array<Array<[number, number] | null>> {
  const points = rings.map((ring) =>
    ring.map((corner) => map.latLngToContainerPoint(corner as L.LatLngTuple)));
  return points.map((pts, r) => {
    const cx = pts.reduce((total, p) => total + p.x, 0) / (pts.length || 1);
    const cy = pts.reduce((total, p) => total + p.y, 0) / (pts.length || 1);
    return pts.map((p, i) => {
      const shared = points.some((other, o) => o !== r
        && other.some((q) => q.distanceTo(p) < CLOSE));
      if (!shared) return null;
      const unit = (x: number, y: number): [number, number] => {
        const length = Math.hypot(x, y);
        return length ? [x / length, y / length] : [0, 0];
      };
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const next = pts[(i + 1) % pts.length];
      const a = unit(prev.x - p.x, prev.y - p.y);
      const b = unit(next.x - p.x, next.y - p.y);
      let [dx, dy] = unit(a[0] + b[0], a[1] + b[1]);
      const toCentre = unit(cx - p.x, cy - p.y);
      // A straight run has no bisector, and a reflex corner's points out of the
      // outline; the middle of the outline is the fallback for both.
      if ((dx === 0 && dy === 0) || dx * toCentre[0] + dy * toCentre[1] < 0) {
        [dx, dy] = toCentre;
      }
      return [dx * NUDGE, dy * NUDGE];
    });
  });
}

/** Draw the Location map's side lengths and corner letters around one boundary.
 *
 * The caller owns the polygon and map lifecycle. This gives Combined FMB the
 * visual grammar established by the single-record Location map. */
export function drawSurveyBoundaryLayer({
  map,
  group,
  ring: corners,
  sideLabels,
  activeSide = null,
  activeCorner = null,
  interactive = false,
  onSideClick,
  onCornerClick,
  collisionPoints,
  taken = [],
  cornerOffsets,
}: SurveyBoundaryLayerOptions): void {
  if (corners.length < 3 || sideLabels.length === 0) return;

  const cLat = corners.reduce((total, corner) => total + corner[0], 0) / corners.length;
  const cLon = corners.reduce((total, corner) => total + corner[1], 0) / corners.length;
  const out = 17;
  const discs = collisionPoints
    ?? corners.map((corner) => map.latLngToContainerPoint(corner as L.LatLngTuple));

  sideLabels.forEach((text, index) => {
    const a = corners[index];
    const b = corners[(index + 1) % corners.length];
    if (!a || !b) return;
    const pa = map.latLngToContainerPoint(a as L.LatLngTuple);
    const pb = map.latLngToContainerPoint(b as L.LatLngTuple);
    const at: L.LatLngTuple = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const ex = pb.x - pa.x;
    const ey = pb.y - pa.y;
    const edgeLength = Math.hypot(ex, ey) || 1;
    let nx = -ey / edgeLength;
    let ny = ex / edgeLength;
    const middle = map.latLngToContainerPoint(at);
    const centre = map.latLngToContainerPoint([cLat, cLon] as L.LatLngTuple);
    if ((middle.x - centre.x) * nx + (middle.y - centre.y) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }

    const halfWidth = (text.length * 6 + 12) / 2;
    const halfHeight = 9;
    const clearOf = (ox: number, oy: number, others: L.Point[]) => others.every((point) =>
      Math.abs(middle.x + ox - point.x) > halfWidth + 11
      || Math.abs(middle.y + oy - point.y) > halfHeight + 11);

    let ox = nx * out;
    let oy = ny * out;
    let placed = false;
    for (const distance of [out, out + 12, out + 24, out + 38]) {
      for (const sign of [1, -1]) {
        const tx = nx * distance * sign;
        const ty = ny * distance * sign;
        if (clearOf(tx, ty, [...discs, ...taken])) {
          ox = tx;
          oy = ty;
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
    taken.push(L.point(middle.x + ox, middle.y + oy));

    if (Math.hypot(ox, oy) > out + 6) {
      const end = map.containerPointToLatLng(
        L.point(middle.x + ox * 0.72, middle.y + oy * 0.72),
      );
      L.polyline([at, [end.lat, end.lng]], {
        className: 'w-side-leader', interactive: false,
      }).addTo(group);
    }

    L.marker(at, {
      icon: textIcon(
        `w-side${activeSide === index ? ' active' : ''}`,
        text,
        [0, 0],
        [ox, oy],
      ),
      interactive: false,
      keyboard: false,
    }).addTo(group);
  });

  sideLabels.forEach((_, index) => {
    const a = corners[index];
    const b = corners[(index + 1) % corners.length];
    if (!a || !b) return;
    const segment = [a, b] as L.LatLngTuple[];
    const hit = L.polyline(segment, {
      className: 'w-side-hit',
      weight: 18,
      opacity: 0,
      interactive,
      bubblingMouseEvents: false,
    }).addTo(group);
    if (interactive && onSideClick) {
      hit.on('click', (event) => {
        L.DomEvent.stop(event);
        onSideClick(index, event);
      });
    }
    if (activeSide === index) {
      const lit = L.polyline(segment, {
        className: 'w-side-lit', interactive: false,
      }).addTo(group);
      const spark = L.polyline(segment, {
        className: 'w-side-spark', interactive: false,
      }).addTo(group);
      lit.getElement()?.setAttribute('pathLength', '1');
      spark.getElement()?.setAttribute('pathLength', '1');
    }
  });

  corners.forEach((corner, index) => {
    const onSide = activeSide === index
      || activeSide === (index - 1 + corners.length) % corners.length;
    const picked = activeCorner === index;
    const nudge = cornerOffsets?.[index];
    const dot = L.marker(corner as L.LatLngTuple, {
      icon: textIcon(
        `w-corner-no${picked ? ' picked' : onSide ? ' active' : ''}`,
        cornerLabel(index),
        [0, 0],
        nudge ? [nudge[0], nudge[1]] : undefined,
      ),
      interactive,
      keyboard: interactive && !!onCornerClick,
      title: `Corner ${cornerLabel(index)}`,
      alt: `Corner ${cornerLabel(index)}`,
      bubblingMouseEvents: false,
      zIndexOffset: 1000,
    }).addTo(group);
    if (interactive && onCornerClick) {
      dot.on('click', (event) => {
        L.DomEvent.stop(event);
        onCornerClick(index, event);
      });
    }
  });
}
