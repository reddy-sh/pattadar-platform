'use client';

/**
 * THE map. One editing axis, one set of heights, one toolbar of real buttons,
 * and a handle that makes remounting a map unnecessary.
 *
 * Three screens draw a map today and no two of them agree on what a map is.
 * The parcel page arms drawing through `drawMode`, the property page freezes
 * the same engine with `readOnly`, and the holdings dialog drives it through
 * the older `mode` prop — three spellings of one idea, sitting in `GeoMapProps`
 * at `GeoMap.tsx:25-52` because each screen was written against whichever one
 * existed that week. `MapSurface` offers exactly one: `mode` is `view | pin |
 * draw`, and the engine's trio becomes an implementation detail nobody outside
 * this file has to hold in their head.
 *
 * TWO OF THOSE SCREENS REMOUNT THE MAP TO CHANGE ITS MIND.
 * `ParcelDetailPage.tsx:1036` keys `GeoSection` on `p.geoPoint`, so saving a
 * boundary throws the map away and builds a new one: the pan and zoom the
 * reader just spent a minute on, the tiles, the Nominatim call that placed the
 * view, and any focus inside the map all go with it. `LocationDialog.tsx:80`
 * keys on `mapMode`, so merely switching from pin to polygon does the same —
 * and because it remounts with `value={target.geoPoint}` while edits accumulate
 * in a separate `geo` state, the dialog can display one shape and save another.
 * `MapSurfaceHandle` is the answer to both: `fitTo`, `invalidate`, `focus`,
 * `undoPoint` and `clear` are commands, not a new component tree, and `value`
 * is always controlled and always re-synced so what is on screen is what will
 * be written.
 *
 * ALL CHROME IN ONE TOOLBAR, AND NO GLYPH IN A NAME. The controls were
 * scattered across three layers: Leaflet's own search box and footer buttons
 * (`GeoMap.tsx:514-531`, `:584-593` — ~25px tall, hand-rolled `<input>` and
 * `<button>` with no hover, focus or disabled state), the parcel page's row of
 * `✏️ Draw boundary` / `📍 Drop pin` / `🎯 Use my location` above it
 * (`:424-452`), and a second inline bar below. This file renders one row, every
 * control an `Action` or `IconAction`, in a fixed order — `[modes] [locate]
 * [search] | [undo] [clear]` — with the glyphs moved into `startIcon` where a
 * screen reader will not read "pencil" in the middle of a button's name. The
 * accessible-name contract is `Draw boundary` / `Edit boundary`, `Drop pin` /
 * `Move pin`, and `Use my location`; those names are spelled here exactly.
 *
 * ONE CONTAINER, ONE READOUT, ONE PLACEHOLDER. The map's frame was a 12px
 * radius with a primary-coloured hairline (`GeoMap.tsx:556-564`) that matched
 * nothing else in the app, preceded by a 380px dashed box at a 24px radius
 * holding a lone spinner (`GeoMapLazy.tsx:18-31`) — so every detail view jumped
 * twice, once in height and once in shape, before it settled. Here the frame is
 * the kit's card and the placeholder is `MapSkeleton` at the map's own height
 * and radius. The measurements were doubled too: the engine's footer prints
 * guntas while the parcel page prints cents from `formatArea`, two unit systems
 * for one boundary on one screen. `measurements` renders acres through
 * `@pattadar/core`, once, and is independent of `mode` so a read-only map can
 * still state its area — the gap at `PropertyDetailPage.tsx:544`, where the map
 * is search-less, readout-less and offers no way to set a location at all.
 *
 * A MAP MUST NOT EAT THE PAGE. `scrollWheelZoom` was hardcoded on
 * (`GeoMap.tsx:187`), which is why scrolling past a parcel's map zooms it
 * instead of scrolling the page. `scrollZoom` defaults to false and a wheel
 * over the map raises a hint naming the controls that do zoom, rather than a
 * gesture the engine has switched off.
 *
 * `popup` is a `ReactNode`, never an HTML string: the engine's `label` prop is
 * `bindPopup(html)`, i.e. `innerHTML` of a string a screen concatenated out of
 * record fields (`ParcelDetailPage.tsx:383-391`). The node renders in a real
 * overlay card instead, which also gives it a close button and an Esc key.
 *
 * KNOWN SEAMS THIS DOES NOT CLOSE, so the next reader does not assume the map
 * is finished: Leaflet still owns the search implementation underneath (this
 * file disables the engine's box and calls Nominatim itself, but the geocoder
 * is the same one); Leaflet's marker and vertex handles are `tabindex 0`
 * `role="button"` elements with no accessible name, so a boundary still cannot
 * be edited from the keyboard; `GeoMap`'s private `ringAreaSqM` / `ringPerimM`
 * (`:83-119`) still duplicate `packages/core/src/land/landcalc.ts`, whose own
 * comment reads "(Mirrors GeoMap.)" — this file measures through core, the
 * engine still measures through its copy; and the base-layer switcher is still
 * Leaflet's, because the engine reads `layer` once at init and exposes no way
 * to change it afterwards (see `LAYER CONTROL` below).
 *
 * Extracted from `src/components/GeoMap.tsx:25-52`, `:187-188`, `:514-531`,
 * `:539-554`, `:556-564`, `:584-601`; `src/components/GeoMapLazy.tsx:18-31`;
 * `src/views/detail/ParcelDetailPage.tsx:299-521` and `:1036`;
 * `src/views/detail/PropertyDetailPage.tsx:529-546`;
 * `src/views/holdings/LocationDialog.tsx:63-90`.
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import { Component, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Fade from '@mui/material/Fade';
import LinearProgress from '@mui/material/LinearProgress';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useColorScheme } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import PanToolOutlinedIcon from '@mui/icons-material/PanToolOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import PolylineOutlinedIcon from '@mui/icons-material/PolylineOutlined';
import SearchIcon from '@mui/icons-material/Search';
import UndoIcon from '@mui/icons-material/Undo';

import { parsePolygonRing, ringAreaSqM, ringPerimM, toAcres } from '@pattadar/core';

import type { GeoMapHandle } from '../GeoMap';
import { GeoMap } from '../GeoMapLazy';
import { Action, IconAction } from './Action';
import { useConfirm } from './ConfirmDialog';
import { area, metres, num } from './format';
import { MapSkeleton } from './KitSkeletons';
import { Section } from './Section';
import { StatusChip } from './StatusChip';
import { GAP, PAD, RADIUS, actionClusterSx, focusRingSx } from './tokens';
import { ZeroState } from './ZeroState';
import type {
  ConfirmSpec,
  MapControls,
  MapError,
  MapErrorKind,
  MapFeature,
  MapHeight,
  MapLayer,
  MapMeasurement,
  MapMode,
  MapSurfaceHandle,
  MapSurfaceRef,
  StatusTone,
  ZeroSpec,
} from './types';

/* ── Scale ───────────────────────────────────────────────────────────── */

/**
 * The three map heights, as numbers rather than adjectives typed per screen.
 * `standard` is the 430 the two detail pages already use; `compact` is for a
 * map that shares a panel; `tall` is for a map that IS the screen. `'fill'` is
 * measured against the viewport by the engine, which is the only place that
 * can call `invalidateSize()` after the height moves.
 */
export const MAP_HEIGHTS = { compact: 280, standard: 430, tall: 560 } as const;

function resolveHeight(height: MapHeight): number | 'fill' {
  if (typeof height === 'number') return height;
  if (height === 'fill') return 'fill';
  return MAP_HEIGHTS[height];
}

/**
 * Leaflet's own panes sit at z-index 400 and its controls at 800-1000, inside
 * a container that does not create a stacking context — so anything this file
 * lays over the map has to clear 1000 to be seen at all. It stays well under
 * MUI's modal layer, because a dialog must still cover the map.
 */
const OVER_MAP = 1100;

/**
 * `top` / `right` / `bottom` / `left` are the sx properties that are NOT
 * spacing-aware, so the 4px grid is spelled in pixels for them — derived from
 * the same tokens rather than typed as new numbers.
 */
const INSET = { edge: GAP.control * 8, corner: GAP.tight * 8 } as const;

/* ── Geometry ────────────────────────────────────────────────────────── */

type GeometryKind = 'none' | 'point' | 'polygon';

/**
 * What the persisted string actually holds. The screens test this with
 * `draft.includes('Point')`, which is also true of a polygon stored inside a
 * feature whose name happens to contain the word — parsing costs nothing here
 * and cannot be fooled.
 */
function geometryKind(raw: string): GeometryKind {
  if (raw.trim() === '') return 'none';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 'none';
  }
  if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) return 'none';
  const { type } = parsed;
  if (type === 'Point') return 'point';
  if (type === 'Polygon') return 'polygon';
  return 'none';
}

function pointGeoJson(lng: number, lat: number): string {
  return JSON.stringify({ type: 'Point', coordinates: [lng, lat] });
}

function finiteNumber(value: unknown): number | null {
  const n = typeof value === 'string' || typeof value === 'number' ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

/** The one shape this file reads out of a Nominatim hit: `[lat, lon]`. */
function hitLatLon(hit: unknown): [number, number] | null {
  if (typeof hit !== 'object' || hit === null) return null;
  if (!('lat' in hit) || !('lon' in hit)) return null;
  const lat = finiteNumber(hit.lat);
  const lon = finiteNumber(hit.lon);
  return lat === null || lon === null ? null : [lat, lon];
}

/* ── Mode vocabulary ─────────────────────────────────────────────────── */

/** The one axis, mapped onto the engine's arm state. Neither ever remounts. */
const DRAW_MODE: Record<MapMode, 'off' | 'marker' | 'polygon'> = {
  view: 'off',
  pin: 'marker',
  draw: 'polygon',
};

const MODE_ICON: Record<MapMode, ReactNode> = {
  view: <PanToolOutlinedIcon />,
  pin: <PlaceOutlinedIcon />,
  draw: <PolylineOutlinedIcon />,
};

/**
 * The button's words. `Edit boundary` and `Move pin` are not decoration: a
 * reader who already has a shape is being offered a change, not a first act,
 * and the e2e suite asserts both halves of each pair.
 */
function modeLabel(mode: MapMode, kind: GeometryKind): string {
  if (mode === 'draw') return kind === 'polygon' ? 'Edit boundary' : 'Draw boundary';
  if (mode === 'pin') return kind === 'point' ? 'Move pin' : 'Drop pin';
  return 'View';
}

const MODE_HINT: Record<MapMode, string> = {
  view: '',
  pin: 'Click the map to place the pin, then drag it to fine-tune.',
  draw: 'Click the map to add boundary points, then drag any point to reshape.',
};

/** Erasing a stored boundary is never a two-click act; this is the default ask. */
const CLEAR_CONFIRM: ConfirmSpec = {
  title: 'Clear this boundary?',
  body: 'The outline on this record will be removed. You can draw it again afterwards.',
  confirmLabel: 'Clear',
  destructive: true,
};

/* ── Engine chrome ───────────────────────────────────────────────────── */

/**
 * What the engine still draws for itself, corrected from the outside.
 *
 * The map box carries a 12px radius and a primary hairline as INLINE styles
 * (`GeoMap.tsx:556-564`), which no class can outrank — hence `!important`,
 * used here and nowhere else in the kit. The frame belongs to the card around
 * it now, so the engine's own is cancelled rather than nested inside a second
 * one.
 *
 * The footer (`:584-593`) is the engine's mode hint, its raw `Undo point` /
 * `Clear` buttons and its guntas readout. It renders whenever the map is not
 * `readOnly`, and `readOnly` cannot be used to suppress it because the same
 * flag also disables the vertex handles a boundary is reshaped by. So it is
 * hidden here: this surface renders all three itself, in the toolbar and the
 * readout below, and two of everything is worse than one of anything.
 */
const engineChromeSx: SxProps<Theme> = {
  height: '100%',
  '& .leaflet-container': {
    border: 'none !important',
    borderRadius: '0 !important',
    '&:focus-visible': { ...focusRingSx, outlineOffset: '-2px' },
  },
  // Scoped to this box, which holds nothing but the engine: `> div` is the
  // engine's own root, and the div beside the map inside it is the footer.
  // Everything this file lays over the map is a sibling of this box, out of
  // reach of both rules.
  '& > div': { height: '100%' },
  '& > div > div:not(.leaflet-container)': { display: 'none' },
};

/* ── Lazy-chunk boundary ─────────────────────────────────────────────── */

interface ChunkBoundaryProps {
  children: ReactNode;
  onFail: (message: string) => void;
  renderFallback: (retry: () => void) => ReactNode;
}

/**
 * Leaflet is ~150 kB in a chunk of its own, and a chunk can fail to arrive.
 * Without this the failure is React's, which means the tab — or the whole
 * record — goes blank. The retry re-mounts the children, which re-requests the
 * chunk; there is nothing to reload the page for.
 */
class ChunkBoundary extends Component<ChunkBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    this.props.onFail(error.message);
  }

  retry = (): void => {
    this.setState({ failed: false });
  };

  render(): ReactNode {
    if (this.state.failed) return this.props.renderFallback(this.retry);
    return this.props.children;
  }
}

/* ── Mode button ─────────────────────────────────────────────────────── */

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * One segment of the mode control.
 *
 * `aria-pressed` is what makes a segmented control announce as a set of toggles
 * rather than as three buttons that happen to look different, and it is the
 * only honest replacement for the conditional `variant="contained"` at
 * `ParcelDetailPage.tsx:424` — a filled button says "do this", not "this is
 * on". `Action`'s prop list is closed by design (a `role` decides the
 * spelling), so the attribute is stamped onto the rendered button instead of
 * widening that API from here; `Action` is still the thing that renders, which
 * is what keeps the focus ring, the touch target and the region accounting.
 */
function ModeButton({
  label,
  icon,
  pressed,
  disabled,
  onSelect,
}: {
  label: string;
  icon: ReactNode;
  pressed: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    const button = host?.querySelector('button');
    if (button) button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  });

  return (
    <Box component="span" ref={setHost} sx={{ display: 'inline-flex' }}>
      <Action
        label={label}
        icon={icon}
        role={pressed ? 'secondary' : 'tertiary'}
        disabled={disabled}
        onClick={onSelect}
      />
    </Box>
  );
}

/* ── Measurement readout ─────────────────────────────────────────────── */

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="overline" component="div" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body1" className="tnum">
        {value}
      </Typography>
    </Box>
  );
}

/* ── MapSurface ──────────────────────────────────────────────────────── */

export interface MapSurfaceProps {
  /** Always controlled. A GeoJSON Point or Polygon STRING — the persisted contract. */
  value?: string | null;
  onChange?: (geojson: string) => void;

  /** ONE editing axis. Changing it NEVER remounts the map. Default 'view'. */
  mode?: MapMode;
  onModeChange?: (mode: MapMode) => void;
  /** Which mode buttons to offer. [] hides the mode control entirely. Default []. */
  allowedModes?: MapMode[];

  height?: MapHeight;
  /** Ranked geocode candidates, most specific first. Caller-built, never derived. */
  autoLocate?: string[];

  controls?: MapControls;
  defaultLayer?: MapLayer;
  /** Default FALSE. A map must not trap page scroll; the kit shows a zoom hint. */
  scrollZoom?: boolean;

  /** Routed through ConfirmDialog. Without it, no Clear button is rendered. */
  onClear?: () => void;
  clearConfirm?: ConfirmSpec;

  /** Independent of mode, so a read-only map can still show its area. */
  measurements?: 'none' | 'inline' | 'external';
  onMeasure?: (m: MapMeasurement) => void;

  /** One typographic role for the line above the map. */
  caption?: ReactNode;
  status?: { tone: StatusTone; label: string };

  features?: MapFeature[];
  onFeatureClick?: (id: string) => void;
  /** ReactNode, not an HTML string — GeoMap's `label` prop is an injection seam. */
  popup?: ReactNode;

  /** Shown INSTEAD of the map chrome when there is no value and nothing to locate. */
  empty?: ZeroSpec;
  busy?: boolean;
  onError?: (e: MapError) => void;

  /** REQUIRED. Names the map region, e.g. "Boundary of Sy 214/2". */
  ariaLabel: string;
  ref?: MapSurfaceRef;
}

export function MapSurface({
  value,
  onChange,
  mode,
  onModeChange,
  allowedModes = [],
  height = 'standard',
  autoLocate,
  controls,
  defaultLayer = 'street',
  scrollZoom = false,
  onClear,
  clearConfirm,
  measurements = 'none',
  onMeasure,
  caption,
  status,
  features,
  onFeatureClick,
  popup,
  empty,
  busy = false,
  onError,
  ariaLabel,
  ref,
}: MapSurfaceProps) {
  const { mode: schemeMode, systemMode } = useColorScheme();
  /** The engine bakes a RESOLVED accent into marker HTML; this is its cue to repaint. */
  const accentKey = (schemeMode === 'system' ? systemMode : schemeMode) ?? 'light';

  const geoRef = useRef<GeoMapHandle | null>(null);
  const [ready, setReady] = useState(false);

  /* ── Callbacks held in refs, so effects and the engine never chase an
        identity a caller re-declares inline on every render. ─────────── */
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onModeChangeRef = useRef(onModeChange);
  onModeChangeRef.current = onModeChange;
  const onMeasureRef = useRef(onMeasure);
  onMeasureRef.current = onMeasure;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const report = useCallback((kind: MapErrorKind, message: string) => {
    onErrorRef.current?.({ kind, message });
  }, []);

  /**
   * The value is the parent's, and the map's own edits are the exception that
   * has to survive one render of lag: `drawn` holds what the engine last
   * emitted, and any new `value` from the parent retires it. Adjusted during
   * render rather than in an effect (React's documented "adjust state when a
   * prop changes"), so the map never paints a frame of the older shape — the
   * display-vs-save divergence `LocationDialog.tsx:34,48-51` lives with.
   */
  const pushed = value ?? '';
  const [seen, setSeen] = useState(pushed);
  const [drawn, setDrawn] = useState<string | null>(null);
  const pushedIsNew = pushed !== seen;
  if (pushedIsNew) {
    setSeen(pushed);
    setDrawn(null);
  }
  const geo = pushedIsNew ? pushed : (drawn ?? pushed);
  const kind = geometryKind(geo);

  const commit = useCallback((next: string) => {
    setDrawn(next);
    onChangeRef.current?.(next);
  }, []);

  /** Controlled when the parent passes `mode`, self-driving when it does not —
   *  either way the toolbar's buttons do something, which a dead segment would not. */
  const [armed, setArmed] = useState<MapMode>(mode ?? 'view');
  const [seenMode, setSeenMode] = useState<MapMode | undefined>(mode);
  const modeIsNew = mode !== undefined && mode !== seenMode;
  if (modeIsNew) {
    setSeenMode(mode);
    setArmed(mode);
  }
  const activeMode: MapMode = modeIsNew && mode !== undefined ? mode : armed;

  const selectMode = useCallback((next: MapMode) => {
    setArmed(next);
    onModeChangeRef.current?.(next);
  }, []);

  /* ── Measurement ─────────────────────────────────────────────────── */

  /**
   * Measured through `@pattadar/core`, in acres, once. The engine measures the
   * same ring with its own copy of the same formulas and prints guntas; the
   * parcel page prints cents beside it. One boundary, one number.
   */
  const measurement = useMemo<MapMeasurement>(() => {
    const ring = parsePolygonRing(geo);
    if (ring.length >= 2) {
      return {
        areaSqM: ring.length >= 3 ? ringAreaSqM(ring) : 0,
        perimeterM: ringPerimM(ring),
        points: ring.length,
      };
    }
    return { areaSqM: 0, perimeterM: 0, points: geometryKind(geo) === 'point' ? 1 : 0 };
  }, [geo]);

  useEffect(() => {
    if (measurements === 'none') return;
    onMeasureRef.current?.(measurement);
  }, [measurement, measurements]);

  /* ── Engine wiring ───────────────────────────────────────────────── */

  const handleReady = useCallback((handle: GeoMapHandle) => {
    geoRef.current = handle;
    setReady(true);
  }, []);

  useImperativeHandle(
    ref,
    (): MapSurfaceHandle => ({
      fitTo: (geojson?: string) => geoRef.current?.fitTo(geojson),
      invalidate: () => geoRef.current?.invalidate(),
      focus: () => geoRef.current?.focus(),
      undoPoint: () => geoRef.current?.undoPoint(),
      clear: () => geoRef.current?.clear(),
    }),
    [],
  );

  /**
   * A feature is clickable only when there is something for a click to do. An
   * id the caller did not give is synthetic and never reaches `onFeatureClick`:
   * it exists so a node popup can be found again, not so a screen can be handed
   * a key it never issued.
   */
  const engineFeatures = useMemo(
    () =>
      features?.map((feature, index) => ({
        geojson: feature.geojson,
        title: feature.title,
        id: feature.id ?? (feature.popup !== undefined ? `kit-feature-${index}` : undefined),
      })),
    [features],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleFeatureClick = useCallback(
    (id: string) => {
      const hit = features?.find(
        (feature, index) => (feature.id ?? `kit-feature-${index}`) === id,
      );
      if (hit === undefined) return;
      // Same precedence as the engine's: a caller who handles the click owns it.
      if (hit.id !== undefined && onFeatureClick !== undefined) {
        onFeatureClick(hit.id);
        return;
      }
      if (hit.popup !== undefined) setSelectedId(id);
    },
    [features, onFeatureClick],
  );

  const selectedFeature = useMemo(
    () =>
      selectedId === null
        ? undefined
        : features?.find((feature, index) => (feature.id ?? `kit-feature-${index}`) === selectedId),
    [features, selectedId],
  );

  const overlayNode = selectedFeature?.popup ?? (kind === 'none' ? undefined : popup);
  const overlayIsFeature = selectedFeature !== undefined;

  /* ── Controls ────────────────────────────────────────────────────── */

  const editable = allowedModes.length > 0;
  const showSearch = controls?.search ?? true;
  const showLocate = controls?.locate ?? editable;
  const showUndo = (controls?.undo ?? editable) && activeMode === 'draw';
  const showClear = (controls?.clear ?? true) && onClear !== undefined;

  const { ask, element: confirmElement } = useConfirm();

  const runClear = useCallback(() => {
    const handle = geoRef.current;
    if (handle) handle.clear();
    else commit('');
    onClear?.();
  }, [commit, onClear]);

  const [locating, setLocating] = useState(false);

  const handleLocate = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      report('geocode', 'This browser cannot share your location.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const point = pointGeoJson(position.coords.longitude, position.coords.latitude);
        commit(point);
        selectMode('pin');
        geoRef.current?.fitTo(point);
      },
      () => {
        setLocating(false);
        report('geocode', 'Could not read your location — allow location access and try again.');
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, [commit, report, selectMode]);

  /* ── Search ──────────────────────────────────────────────────────── */

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (q === '' || searching) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(q)}`,
        { headers: { 'Accept-Language': 'en' } },
      );
      if (!res.ok) throw new Error(`Place search returned ${res.status}`);
      const body: unknown = await res.json();
      const first: unknown = Array.isArray(body) ? body[0] : undefined;
      const found = hitLatLon(first);
      // A search that matched nothing used to look exactly like one that worked.
      if (found === null) {
        report('search-empty', 'No place matched that search.');
        return;
      }
      geoRef.current?.fitTo(pointGeoJson(found[1], found[0]));
    } catch {
      report('geocode', 'Place search is unavailable right now.');
    } finally {
      setSearching(false);
    }
  }, [query, report, searching]);

  const submitSearch = useCallback(() => {
    void runSearch();
  }, [runSearch]);

  const onSearchKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      void runSearch();
    },
    [runSearch],
  );

  /* ── Scroll hint ─────────────────────────────────────────────────── */

  const [hinting, setHinting] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleWheel = useCallback(() => {
    // Nothing is prevented here: the wheel belongs to the page, always.
    if (scrollZoom) return;
    setHinting(true);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHinting(false), 1400);
  }, [scrollZoom]);

  useEffect(() => () => clearTimeout(hintTimer.current), []);

  /* ── Esc closes the feature popup ────────────────────────────────── */

  /**
   * Window-level, not a handler on the stage: the stage is a `role="region"`
   * div with no `tabIndex`, so the moment a reader clicks the popup's body text
   * — or anything else outside the map — focus sits on an element the stage is
   * not an ancestor of, and a React `onKeyDown` there never fires. `Esc closes
   * every overlay` is a non-negotiable, so the listener lives where every Esc
   * passes. It is armed only while a feature is selected, and stands down when
   * a dialog, menu or popover is mounted above the map — that overlay owns Esc
   * first, exactly as `useRowSelection.tsx:172-181` gates its own.
   */
  useEffect(() => {
    if (selectedId === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"], .MuiModal-root') !== null) return;
      setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  /* ── Geometry of the stage ───────────────────────────────────────── */

  const resolved = resolveHeight(height);
  const isFill = resolved === 'fill';
  const stageHeight = typeof resolved === 'number' ? resolved : undefined;
  const skeletonHeight = typeof resolved === 'number' ? resolved : MAP_HEIGHTS.standard;

  /* ── Nothing to show ─────────────────────────────────────────────── */

  /**
   * Empty replaces the chrome, it does not decorate it: a toolbar of controls
   * over a grey rectangle is the "full screen of chrome for nothing" the
   * zero-state standard forbids. `mode` is part of the test because a reader
   * who has armed drawing has asked for the map — otherwise the state that
   * offers "Add a location" would be the thing hiding the place to add it.
   */
  if (
    empty !== undefined &&
    kind === 'none' &&
    (features?.length ?? 0) === 0 &&
    (autoLocate?.length ?? 0) === 0 &&
    activeMode === 'view'
  ) {
    return (
      <Section variant="card">
        <ZeroState {...empty} placement="panel" />
      </Section>
    );
  }

  const modeButtons = allowedModes.map((candidate) => (
    <ModeButton
      key={candidate}
      label={modeLabel(candidate, kind)}
      icon={MODE_ICON[candidate]}
      pressed={activeMode === candidate}
      disabled={busy}
      onSelect={() => selectMode(candidate)}
    />
  ));

  const hasViewCluster = modeButtons.length > 0 || showLocate || showSearch;
  const hasEditCluster = showUndo || showClear;

  return (
    <Section variant="card">
      {(caption !== undefined || status !== undefined) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: GAP.control,
            mb: GAP.control,
          }}
        >
          {caption !== undefined && (
            <Typography variant="body2" color="text.secondary">
              {caption}
            </Typography>
          )}
          {status !== undefined && <StatusChip label={status.label} tone={status.tone} />}
        </Box>
      )}

      <ChunkBoundary
        onFail={(message) => report('chunk', message)}
        renderFallback={(retry) => (
          <ZeroState
            variant="error"
            placement="panel"
            title="The map could not be loaded"
            body="The map component did not finish downloading. Everything else on this record is unaffected."
            primaryAction={{ label: 'Try again', onClick: retry }}
          />
        )}
      >
        {/* ONE toolbar: [modes] [locate] [search] | [undo] [clear]. */}
        <Box sx={{ ...actionClusterSx, mb: GAP.control }}>
          {modeButtons.length > 0 && (
            <Box role="group" aria-label="Map mode" sx={{ display: 'flex', gap: GAP.tight, flexWrap: 'wrap' }}>
              {modeButtons}
            </Box>
          )}

          {showLocate && (
            <Action
              label="Use my location"
              icon={<MyLocationIcon />}
              onClick={handleLocate}
              busy={locating}
              busyLabel="Locating…"
              disabled={busy}
            />
          )}

          {showSearch && (
            <Box
              role="search"
              sx={{ display: 'flex', alignItems: 'center', gap: GAP.tight, flexGrow: 1, minWidth: 200, maxWidth: 320 }}
            >
              <TextField
                size="small"
                fullWidth
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder="Search a village or address…"
                disabled={busy}
                slotProps={{ htmlInput: { 'aria-label': 'Search a place' } }}
              />
              <IconAction
                label="Search"
                icon={<SearchIcon />}
                onClick={submitSearch}
                disabled={busy || searching || query.trim() === ''}
                disabledReason={query.trim() === '' ? 'Type a place to search for.' : undefined}
              />
            </Box>
          )}

          {hasViewCluster && hasEditCluster && (
            <Divider orientation="vertical" flexItem sx={{ mx: GAP.tight }} />
          )}

          {showUndo && (
            <Action
              label="Undo point"
              icon={<UndoIcon />}
              onClick={() => geoRef.current?.undoPoint()}
              disabled={busy || measurement.points === 0}
              disabledReason={measurement.points === 0 ? 'There is no point to undo yet.' : undefined}
            />
          )}

          {showClear && (
            <Action
              label="Clear"
              role="destructive"
              icon={<DeleteOutlinedIcon />}
              onClick={() => ask(clearConfirm ?? CLEAR_CONFIRM, runClear)}
              disabled={busy || kind === 'none'}
              disabledReason={kind === 'none' ? 'There is nothing on the map to clear.' : undefined}
            />
          )}
        </Box>

        <Box
          role="region"
          aria-label={ariaLabel}
          aria-busy={busy || undefined}
          onWheel={handleWheel}
          sx={{
            position: 'relative',
            height: stageHeight,
            minHeight: isFill ? MAP_HEIGHTS.compact : undefined,
            borderRadius: RADIUS.card,
            overflow: 'hidden',
            bgcolor: 'background.neutral',
          }}
        >
          <Box sx={engineChromeSx}>
            <GeoMap
              value={geo}
              onChange={commit}
              drawMode={DRAW_MODE[activeMode]}
              height={isFill ? 'fill' : (stageHeight ?? MAP_HEIGHTS.standard)}
              showSearch={false}
              scrollWheelZoom={scrollZoom}
              layer={defaultLayer}
              /* LAYER CONTROL. The one control this surface does NOT take over.
                 The engine reads `layer` once, when it builds the map, and
                 offers nothing to change the base layer afterwards — so a kit
                 button here could only pretend, and a control that pretends is
                 the defect this kit exists to remove. Leaflet's own switcher
                 stays until the engine's handle grows a `setLayer`; `controls
                 .layers === false` still hides it, so the prop is not a lie
                 either. There is exactly one layer switcher on screen. */
              showLayerControl={controls?.layers ?? true}
              accentKey={accentKey}
              autoLocate={autoLocate}
              features={engineFeatures}
              onFeatureClick={handleFeatureClick}
              onReady={handleReady}
              onError={(engineError) => report(engineError.kind, engineError.message)}
            />
          </Box>

          {busy && (
            <LinearProgress
              aria-hidden
              sx={{ position: 'absolute', insetInline: 0, top: 0, zIndex: OVER_MAP }}
            />
          )}

          {!ready && (
            <Box sx={{ position: 'absolute', inset: 0, zIndex: OVER_MAP }}>
              <MapSkeleton height={skeletonHeight} toolbar={false} />
            </Box>
          )}

          {overlayNode !== undefined && overlayNode !== null && (
            <Box
              sx={(t) => ({
                position: 'absolute',
                left: INSET.edge,
                bottom: INSET.edge,
                right: { xs: INSET.edge, sm: 'auto' },
                zIndex: OVER_MAP,
                maxWidth: { xs: 'none', sm: 280 },
                p: PAD.quiet,
                borderRadius: RADIUS.control,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
                boxShadow: t.customShadows.z8,
              })}
            >
              {overlayIsFeature && (
                <Box sx={{ position: 'absolute', top: INSET.corner, right: INSET.corner }}>
                  <IconAction
                    label="Close details"
                    icon={<CloseIcon fontSize="small" />}
                    onClick={() => setSelectedId(null)}
                  />
                </Box>
              )}
              <Box sx={{ pr: overlayIsFeature ? 4 : 0 }}>{overlayNode}</Box>
            </Box>
          )}

          {/* Honest about the gesture: with wheel zoom off, ctrl+scroll does not
              zoom either — the handler is disabled inside Leaflet — so the hint
              names the controls that do work. */}
          <Fade in={hinting} unmountOnExit>
            <Box
              aria-hidden
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                pointerEvents: 'none',
                zIndex: OVER_MAP,
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  px: GAP.block,
                  py: GAP.control,
                  borderRadius: RADIUS.pill,
                  bgcolor: 'primary.container',
                  color: 'primary.onContainer',
                }}
              >
                Use + and − to zoom — the page keeps scrolling
              </Typography>
            </Box>
          </Fade>
        </Box>

        {MODE_HINT[activeMode] !== '' && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: GAP.control }}>
            {MODE_HINT[activeMode]}
          </Typography>
        )}

        {measurements === 'inline' && measurement.points >= 3 && (
          <Box sx={{ mt: GAP.block, display: 'flex', flexWrap: 'wrap', gap: GAP.page }}>
            <Figure label="Area" value={area(toAcres(measurement.areaSqM, 'sqm'))} />
            <Figure label="Perimeter" value={metres(measurement.perimeterM)} />
            <Figure label="Corners" value={num(measurement.points)} />
          </Box>
        )}

        {measurements === 'inline' && measurement.points < 3 && kind === 'point' && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: GAP.control }}>
            A pin marks this location. Draw a boundary to measure area and perimeter.
          </Typography>
        )}
      </ChunkBoundary>

      {confirmElement}
    </Section>
  );
}
