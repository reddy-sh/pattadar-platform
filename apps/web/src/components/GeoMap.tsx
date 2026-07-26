/**
 * GeoMap — port of the rhub design-system GeoMap (Leaflet + OpenStreetMap /
 * Esri satellite, fully open source, no API key), restyled for the Emerald &
 * Gold theme (rounded emerald-bordered container, emerald shapes/pins; colors
 * resolve from the MUI CSS theme variables so dark mode follows along).
 *
 * Industry-standard building blocks, all key-free:
 *  - Place search via Nominatim (OpenStreetMap geocoder).
 *  - Street (OSM) + Satellite (Esri World Imagery) base layers, toggleable.
 *  - Draw a boundary and DRAG its vertices to reshape, with live area readout.
 *
 * Value is a GeoJSON string (Point or Polygon); emitted via onChange on edit.
 *
 * Import via GeoMapLazy (React.lazy) so Leaflet stays in its own chunk.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface GeoMapProps {
  value?: string | null;
  onChange?: (geojson: string) => void;
  center?: [number, number];
  zoom?: number;
  /** Map height: a number (px), any CSS length string, or "fill" to stretch the
   *  map down to a standard gutter above the viewport bottom (auto-resizes). */
  height?: number | string;
  readOnly?: boolean;
  mode?: 'marker' | 'polygon';
  /** Interactive "unified" drawing: arms/disarms clicks on a stable, always-mounted
   *  map WITHOUT recentering. "off" = pan/zoom only (view); "marker"/"polygon" =
   *  clicks draw. Toggling never remounts, so the map keeps its view + layer.
   *  When set, this supersedes readOnly/mode. Reacts to external `value` changes. */
  drawMode?: 'off' | 'marker' | 'polygon';
  label?: string;
  /** Show the place-search box (default true). */
  showSearch?: boolean;
  /** Extra read-only geometries (GeoJSON strings) to display; fits bounds to all. */
  geometries?: string[];
  /** Read-only geometries with info shown on hover (tooltip) / click (popup or callback). */
  features?: Array<{ geojson: string; popup?: string; title?: string; id?: string }>;
  /** If set, clicking a feature with an id calls this instead of opening its popup. */
  onFeatureClick?: (id: string) => void;
  /** If there is no value, geocode this place on mount and center there. Pass an
   *  array to try each candidate in order (e.g. village → mandal → district → state)
   *  and stop at the first that resolves. */
  autoLocate?: string | string[];
}

/** Emerald accent from the MUI theme CSS variables (Leaflet SVG layers need a
 *  resolved color string — presentation attributes can't read var()). */
function accent(): string {
  if (typeof document === 'undefined') return '#146C43';
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue('--mui-palette-primary-main')
    .trim();
  return v || '#146C43';
}

function pinIcon(): L.DivIcon {
  return L.divIcon({
    className: 'ui-geo-pin',
    html: `<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:${accent()};transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 18],
    popupAnchor: [0, -18],
  });
}
function vertexIcon(): L.DivIcon {
  return L.divIcon({
    className: 'ui-geo-vtx',
    html: `<div style="width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid ${accent()};box-shadow:0 0 2px rgba(0,0,0,.5)"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

// Spherical polygon area (m²) — ring is [[lat,lng],...].
function ringAreaSqM(ring: Array<[number, number]>): number {
  if (ring.length < 3) return 0;
  const R = 6378137;
  const rad = (d: number) => (d * Math.PI) / 180;
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lat1, lng1] = ring[i];
    const [lat2, lng2] = ring[(i + 1) % ring.length];
    sum += (rad(lng2) - rad(lng1)) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((sum * R * R) / 2);
}
function fmtArea(sqm: number): string {
  if (!sqm) return '';
  const acres = sqm / 4046.8564;
  const ac = Math.floor(acres);
  const guntas = Math.round((acres - ac) * 40);
  return `${ac} ac ${guntas} gunta · ${acres.toFixed(2)} acres`;
}

// Haversine length of one segment (m); ring is [[lat,lng],...].
function segLenM(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
// Perimeter (m): closed ring when 3+ points, open path length otherwise.
function ringPerimM(ring: Array<[number, number]>): number {
  if (ring.length < 2) return 0;
  let sum = 0;
  const last = ring.length >= 3 ? ring.length : ring.length - 1;
  for (let i = 0; i < last; i++) sum += segLenM(ring[i], ring[(i + 1) % ring.length]);
  return sum;
}
function fmtLen(m: number): string {
  if (!m) return '';
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

export default function GeoMap(props: GeoMapProps) {
  const {
    value,
    onChange,
    center = [16.5, 80.6],
    zoom = 6,
    height = 380,
    readOnly = false,
    mode = 'marker',
    drawMode,
    label,
    showSearch = true,
    geometries,
    features,
    onFeatureClick,
    autoLocate,
  } = props;
  const interactive = drawMode !== undefined;
  const onFeatureClickRef = useRef(onFeatureClick);
  onFeatureClickRef.current = onFeatureClick;

  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const shapeRef = useRef<L.Layer | null>(null); // polygon/polyline or marker
  const vertsRef = useRef<Array<[number, number]>>([]);
  const handlesRef = useRef<L.Marker[]>([]); // draggable vertex markers
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [area, setArea] = useState(0);
  const [perim, setPerim] = useState(0);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const footerRef = useRef<HTMLDivElement>(null);
  const [fillH, setFillH] = useState<number | null>(null);
  const isFill = height === 'fill';

  // Interactive drawing state. drawModeRef lets the (once-attached) click handler
  // read the live arm state without re-binding. currentRenderedRef/lastEmittedRef
  // let the value-sync effect tell external `value` changes (delete/cancel/GPS)
  // apart from the component's own edits, so drawing-in-progress is never wiped.
  const drawModeRef = useRef(drawMode);
  const currentRenderedRef = useRef<string>('');
  const lastEmittedRef = useRef<string | null>(null);
  const renderValueRef = useRef<((raw: string, opts?: { focus?: boolean }) => void) | null>(null);
  const applyDrawModeRef = useRef<((dm?: string) => void) | null>(null);
  const emit = (gj: string) => {
    currentRenderedRef.current = gj;
    lastEmittedRef.current = gj;
    onChangeRef.current?.(gj);
  };

  useEffect(() => {
    if (!boxRef.current || mapRef.current) return;
    const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    });
    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles &copy; Esri', maxZoom: 19 },
    );
    const map = L.map(boxRef.current, { layers: [street], scrollWheelZoom: true }).setView(center, zoom);
    L.control.layers({ Street: street, Satellite: satellite }, {}, { collapsed: false }).addTo(map);
    mapRef.current = map;
    const shapeColor = accent();

    const canEdit = interactive || !readOnly;
    const emitPoint = (ll: L.LatLng) => emit(JSON.stringify({ type: 'Point', coordinates: [ll.lng, ll.lat] }));

    const setMarker = (ll: L.LatLng, doEmit: boolean) => {
      if (shapeRef.current) map.removeLayer(shapeRef.current);
      const m = L.marker(ll, { icon: pinIcon(), draggable: canEdit });
      if (label) m.bindPopup(label);
      m.addTo(map);
      if (canEdit) m.on('dragend', () => emitPoint(m.getLatLng()));
      shapeRef.current = m;
      if (doEmit) emitPoint(ll);
    };

    const emitPolygon = () => {
      const pts = vertsRef.current;
      setArea(ringAreaSqM(pts));
      setPerim(ringPerimM(pts));
      if (pts.length >= 3) {
        const ring = [...pts.map((p) => [p[1], p[0]]), [pts[0][1], pts[0][0]]];
        emit(JSON.stringify({ type: 'Polygon', coordinates: [ring] }));
      } else if (pts.length === 0) {
        emit('');
      }
    };
    const drawPolygon = () => {
      if (shapeRef.current) map.removeLayer(shapeRef.current);
      const pts = vertsRef.current;
      shapeRef.current = (pts.length >= 3
        ? L.polygon(pts, { color: shapeColor, weight: 2, fillOpacity: 0.15 })
        : L.polyline(pts, { color: shapeColor, weight: 2 })
      ).addTo(map);
    };
    const clearHandles = () => {
      handlesRef.current.forEach((h) => map.removeLayer(h));
      handlesRef.current = [];
    };
    const addHandles = () => {
      clearHandles();
      if (readOnly) return;
      vertsRef.current.forEach((p, i) => {
        const h = L.marker(p, { icon: vertexIcon(), draggable: true }).addTo(map);
        h.on('drag', () => {
          const ll = h.getLatLng();
          vertsRef.current[i] = [ll.lat, ll.lng];
          drawPolygon();
        });
        h.on('dragend', () => {
          drawPolygon();
          emitPolygon();
        });
        handlesRef.current.push(h);
      });
    };

    // Show/hide draggable vertex handles + pin dragging for the current arm state
    // (interactive mode only; legacy edit keeps its always-on handles).
    const applyDrawMode = (dm?: string) => {
      if (dm === 'polygon' && vertsRef.current.length) addHandles();
      else clearHandles();
      const s = shapeRef.current as L.Marker | null;
      if (s && s.dragging) {
        if (dm === 'marker') s.dragging.enable();
        else s.dragging.disable();
      }
    };
    applyDrawModeRef.current = applyDrawMode;

    // (Re)draw the shape from a GeoJSON string. Used on mount and whenever the
    // parent pushes a new `value` externally (delete / cancel / GPS / edit-load).
    const renderValue = (raw: string, opts?: { focus?: boolean }) => {
      clearHandles();
      if (shapeRef.current) {
        map.removeLayer(shapeRef.current);
        shapeRef.current = null;
      }
      vertsRef.current = [];
      setArea(0);
      setPerim(0);
      currentRenderedRef.current = raw || '';
      if (!raw) return;
      try {
        const gj = JSON.parse(raw);
        if (gj.type === 'Point') {
          const [lng, lat] = gj.coordinates;
          setMarker(L.latLng(lat, lng), false);
          if (opts?.focus) map.setView([lat, lng], Math.max(zoom, 16));
        } else if (gj.type === 'Polygon') {
          const ring = (gj.coordinates[0] as number[][]).slice(0, -1).map((c) => [c[1], c[0]] as [number, number]);
          vertsRef.current = ring;
          drawPolygon();
          setArea(ringAreaSqM(ring));
          setPerim(ringPerimM(ring));
          if (!interactive) addHandles();
          if (opts?.focus && ring.length) map.fitBounds(ring, { padding: [24, 24] });
        }
      } catch {
        /* ignore malformed value */
      }
      if (interactive) applyDrawMode(drawModeRef.current);
    };
    renderValueRef.current = renderValue;

    // Render an existing value on mount.
    if (value) renderValue(value, { focus: true });

    // Read-only display of extra geometries (e.g. every parcel of a passbook).
    const allBounds: Array<[number, number]> = [];
    const addDisplayGeo = (gj: { type?: string; coordinates?: unknown }, opts?: { popup?: string; title?: string; id?: string }) => {
      const isInteractive = !!(opts && (opts.popup || opts.title || opts.id));
      let layer: L.Layer | null = null;
      if (gj.type === 'Point') {
        const [lng, lat] = gj.coordinates as [number, number];
        layer = L.marker([lat, lng], { icon: pinIcon(), interactive: isInteractive });
        allBounds.push([lat, lng]);
      } else if (gj.type === 'Polygon') {
        const ring = ((gj.coordinates as number[][][])[0]).slice(0, -1).map((c) => [c[1], c[0]] as [number, number]);
        layer = L.polygon(ring, { color: shapeColor, weight: 2, fillOpacity: 0.15, interactive: isInteractive });
        ring.forEach((p) => allBounds.push(p));
      }
      if (!layer) return;
      if (opts?.title) layer.bindTooltip(opts.title, { sticky: true });
      if (opts?.id && onFeatureClickRef.current) layer.on('click', () => onFeatureClickRef.current?.(opts.id as string));
      else if (opts?.popup) layer.bindPopup(opts.popup);
      layer.addTo(map);
    };
    (geometries || []).forEach((gs) => {
      try {
        addDisplayGeo(JSON.parse(gs));
      } catch {
        /* skip */
      }
    });
    (features || []).forEach((f) => {
      try {
        addDisplayGeo(JSON.parse(f.geojson), { popup: f.popup, title: f.title, id: f.id });
      } catch {
        /* skip */
      }
    });
    if (allBounds.length) map.fitBounds(allBounds, { padding: [24, 24] });

    // Auto-center on a named place when we have nothing to show yet. Given a list,
    // try each candidate in order (most specific first) and stop at the first hit.
    if (!value && !(geometries && geometries.length) && !(features && features.length) && autoLocate) {
      const candidates = (Array.isArray(autoLocate) ? autoLocate : [autoLocate]).map((s) => (s || '').trim()).filter(Boolean);
      (async () => {
        for (let i = 0; i < candidates.length; i++) {
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(candidates[i])}`,
              { headers: { 'Accept-Language': 'en' } },
            );
            const data = await res.json();
            if (data && data[0] && mapRef.current) {
              const hit = data[0];
              const lat = parseFloat(hit.lat);
              const lng = parseFloat(hit.lon);
              // The matched feature's own bounding box is the right viewport —
              // a village match zooms tight, a district match shows the district,
              // regardless of which fallback candidate produced it.
              const bb = (hit.boundingbox || []).map((v: string) => parseFloat(v));
              if (bb.length === 4 && bb.every((v: number) => Number.isFinite(v))) {
                mapRef.current.fitBounds(
                  [
                    [bb[0], bb[2]],
                    [bb[1], bb[3]],
                  ],
                  { maxZoom: 15, padding: [24, 24] },
                );
              } else {
                mapRef.current.setView([lat, lng], Math.max(7, 14 - i * 2));
              }
              // Soft indicator so the tab shows WHERE, not an anonymous map.
              const place = String(hit.display_name || candidates[i]).split(',').slice(0, 2).join(',');
              L.circleMarker([lat, lng], { radius: 9, color: shapeColor, weight: 2, fillColor: shapeColor, fillOpacity: 0.25 })
                .addTo(mapRef.current)
                .bindTooltip(`Approximate — ${place}`, { direction: 'top', offset: [0, -8] });
              return;
            }
          } catch {
            /* try next candidate */
          }
        }
      })();
    }

    if (interactive || !readOnly) {
      map.on('click', (e: L.LeafletMouseEvent) => {
        const dm = interactive ? drawModeRef.current : mode;
        if (dm === 'polygon') {
          vertsRef.current.push([e.latlng.lat, e.latlng.lng]);
          drawPolygon();
          addHandles();
          emitPolygon();
        } else if (dm === 'marker') {
          setMarker(e.latlng, true);
        }
        // interactive + "off" → clicks pan/zoom only (viewing)
      });
    }

    const t = setTimeout(() => map.invalidateSize(), 60);
    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
      shapeRef.current = null;
      handlesRef.current = [];
      vertsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // height="fill": size the map so its bottom sits a standard gutter above the
  // viewport bottom, adapting to any window height (a fixed calc(100vh - Npx)
  // guesses wrong on other screen sizes). Leaflet needs invalidateSize() after
  // a height change, so this lives inside the component.
  useEffect(() => {
    if (!isFill) return;
    const GUTTER = 24;
    const recompute = () => {
      const box = boxRef.current;
      if (!box) return;
      const top = box.getBoundingClientRect().top;
      const footerH = footerRef.current?.offsetHeight ?? 0;
      setFillH(Math.max(260, Math.round(window.innerHeight - top - footerH - GUTTER)));
      requestAnimationFrame(() => mapRef.current?.invalidateSize());
    };
    recompute();
    const t = setTimeout(recompute, 80);
    window.addEventListener('resize', recompute);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', recompute);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFill]);

  // Arm/disarm drawing when the parent toggles drawMode — no remount, view kept.
  useEffect(() => {
    drawModeRef.current = drawMode;
    if (interactive) applyDrawModeRef.current?.(drawMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawMode]);

  // Re-render when the parent pushes an external `value` (delete / cancel / GPS /
  // edit-load). Skip the component's own edits so drawing-in-progress isn't wiped.
  useEffect(() => {
    if (!interactive) return;
    const v = value || '';
    if (v === currentRenderedRef.current) return;
    renderValueRef.current?.(v, { focus: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const clearShape = () => {
    const map = mapRef.current;
    if (!map) return;
    handlesRef.current.forEach((h) => map.removeLayer(h));
    handlesRef.current = [];
    if (shapeRef.current) map.removeLayer(shapeRef.current);
    shapeRef.current = null;
    vertsRef.current = [];
    setArea(0);
    setPerim(0);
    emit('');
  };

  const undoVertex = () => {
    const map = mapRef.current;
    if (!map || !vertsRef.current.length) return;
    vertsRef.current.pop();
    handlesRef.current.forEach((h) => map.removeLayer(h));
    handlesRef.current = [];
    if (shapeRef.current) map.removeLayer(shapeRef.current);
    shapeRef.current = null;
    const pts = vertsRef.current;
    const shapeColor = accent();
    if (pts.length) {
      shapeRef.current = (pts.length >= 3
        ? L.polygon(pts, { color: shapeColor, weight: 2, fillOpacity: 0.15 })
        : L.polyline(pts, { color: shapeColor, weight: 2 })
      ).addTo(map);
      pts.forEach((p, i) => {
        const h = L.marker(p, { icon: vertexIcon(), draggable: true }).addTo(map);
        h.on('drag', () => {
          const ll = h.getLatLng();
          vertsRef.current[i] = [ll.lat, ll.lng];
          if (shapeRef.current) (shapeRef.current as L.Polygon).setLatLngs(vertsRef.current);
        });
        h.on('dragend', () => {
          setArea(ringAreaSqM(vertsRef.current));
          setPerim(ringPerimM(vertsRef.current));
        });
        handlesRef.current.push(h);
      });
    }
    setArea(ringAreaSqM(pts));
    setPerim(ringPerimM(pts));
    if (pts.length >= 3) {
      const ring = [...pts.map((p) => [p[1], p[0]]), [pts[0][1], pts[0][0]]];
      emit(JSON.stringify({ type: 'Polygon', coordinates: [ring] }));
    } else emit('');
  };

  const geocode = async () => {
    const query = q.trim();
    if (!query || !mapRef.current) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(query)}`,
        { headers: { 'Accept-Language': 'en' } },
      );
      const data = await res.json();
      if (data && data[0]) mapRef.current.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 16);
    } catch {
      /* geocode best-effort */
    }
    setSearching(false);
  };

  const inputStyle: CSSProperties = {
    flex: 1,
    padding: '5px 10px',
    border: '1px solid var(--mui-palette-divider, #d9d9d9)',
    background: 'var(--mui-palette-background-paper, #fff)',
    color: 'var(--mui-palette-text-primary, #222)',
    borderRadius: 8,
    fontSize: 13,
  };
  const btnStyle: CSSProperties = {
    cursor: 'pointer',
    border: '1px solid var(--mui-palette-divider, #d9d9d9)',
    background: 'var(--mui-palette-background-paper, #fff)',
    color: 'var(--mui-palette-text-primary, #222)',
    borderRadius: 8,
    padding: '4px 12px',
    fontSize: 13,
  };
  // The mode currently driving the map: the live arm in interactive mode, else the legacy `mode`.
  const activeMode = interactive ? drawMode : readOnly ? undefined : mode;

  return (
    <div>
      {showSearch ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void geocode();
              }
            }}
            placeholder="Search a village / town / address…"
            style={inputStyle}
          />
          <button type="button" onClick={() => void geocode()} style={{ ...btnStyle, opacity: searching ? 0.6 : 1 }}>
            {searching ? '…' : 'Search'}
          </button>
        </div>
      ) : null}
      <div
        ref={boxRef}
        style={{
          height: isFill ? (fillH ?? '70vh') : height,
          width: '100%',
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid var(--mui-palette-primary-main, #146C43)',
        }}
      />
      {!readOnly ? (
        <div
          ref={footerRef}
          style={{
            marginTop: 6,
            fontSize: 12,
            color: 'var(--mui-palette-text-secondary, #8c8c8c)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          {activeMode === 'polygon' ? (
            <span>Click to add boundary points; drag any point to reshape.</span>
          ) : activeMode === 'marker' ? (
            <span>Click to set the location; drag the pin to fine-tune.</span>
          ) : null}
          {activeMode === 'polygon' ? (
            <>
              <button type="button" onClick={undoVertex} style={btnStyle}>
                Undo point
              </button>
              <button type="button" onClick={clearShape} style={btnStyle}>
                Clear
              </button>
            </>
          ) : null}
          {area > 0 ? (
            <span style={{ color: 'var(--mui-palette-primary-main, #146C43)', fontWeight: 600 }}>
              Area {fmtArea(area)}
              {perim > 0 ? ` · Perimeter ${fmtLen(perim)}` : ''}
            </span>
          ) : perim > 0 ? (
            <span style={{ color: 'var(--mui-palette-primary-main, #146C43)', fontWeight: 600 }}>Length {fmtLen(perim)}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
