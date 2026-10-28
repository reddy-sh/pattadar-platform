/** "Your properties" on a Leaflet map: each property with a saved boundary as
 *  a dashed outline, each with only a pin as a dot. One drawing for both maps
 *  (docs/specs/2026-10-25-pattadar-maps.md), in the gold every map uses for
 *  "your boundary" (--w-ground-ring, see flowInk.ts) and dashed, so another of
 *  your properties is never mistaken for the one the page is about.
 *
 *  SVG and classed, not canvas, so the colour stays in w360.css and follows
 *  the scheme. A title is the owner's own text and goes in as text. */
import * as L from 'leaflet';

export interface PropertyMark {
  id: string;
  title: string;
  /** The saved boundary, [lat, lon]; empty when there is none. */
  ring: Array<[number, number]>;
  /** The pin, where there is no boundary to draw. */
  at: [number, number] | null;
}

/** `onOpen` null draws them still: a tool that takes clicks on the map is
 *  armed, and a property under the pointer must not swallow its click.
 *
 *  A boundary smaller on screen than a fingertip — any parcel on the district
 *  or mandal map — is also given a dot at its middle, or "Your properties" is
 *  on and nothing can be seen. The dot comes and goes with the zoom; the
 *  returned function takes that handler off again. */
export function drawProperties(
  map: L.Map, group: L.LayerGroup, items: PropertyMark[], onOpen: ((id: string) => void) | null,
  renderer?: L.Renderer, active: string | null = null,
): () => void {
  group.clearLayers();
  const small: Array<{ bounds: L.LatLngBounds; dot: L.CircleMarker }> = [];
  const options = { renderer, interactive: !!onOpen, bubblingMouseEvents: false };
  const wire = (layer: L.Path, p: PropertyMark) => {
    if (!onOpen) return;
    const tip = document.createElement('span');
    tip.textContent = p.title;
    layer.bindTooltip(tip, { sticky: true });
    layer.on('click', (e) => { L.DomEvent.stop(e); onOpen(p.id); });
  };
  for (const p of items) {
    // The picked one (the Maps list) is drawn solid and on top.
    const on = p.id === active ? ' on' : '';
    if (p.ring.length >= 3) {
      const ring = L.polygon(p.ring, { ...options, className: `w-prop${on}` });
      wire(ring, p);
      ring.addTo(group);
      const bounds = ring.getBounds();
      const dot = L.circleMarker(bounds.getCenter(), { ...options, radius: on ? 8 : 6, className: `w-prop-pin${on}` });
      wire(dot, p);
      small.push({ bounds, dot });
    } else if (p.at) {
      const dot = L.circleMarker(p.at, { ...options, radius: on ? 8 : 6, className: `w-prop-pin${on}` });
      wire(dot, p);
      dot.addTo(group);
    }
  }
  const fit = () => {
    for (const { bounds, dot } of small) {
      const a = map.latLngToLayerPoint(bounds.getNorthWest());
      const b = map.latLngToLayerPoint(bounds.getSouthEast());
      const tiny = Math.max(b.x - a.x, b.y - a.y) < 14;
      if (tiny && !group.hasLayer(dot)) dot.addTo(group);
      else if (!tiny && group.hasLayer(dot)) group.removeLayer(dot);
    }
  };
  fit();
  map.on('zoomend', fit);
  return () => { map.off('zoomend', fit); };
}
