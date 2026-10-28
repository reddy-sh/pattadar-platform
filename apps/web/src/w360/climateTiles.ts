/** The Climate chip's tiles on a Leaflet map: one NASA GIBS layer, with the
 *  newest-date-first fallback. Shared by the property map (MapCanvas) and the
 *  cadastral map (VillageCanvas). Kept apart from climateLayers.ts so the key,
 *  which renders outside the lazy map chunk, never pulls Leaflet in. */
import * as L from 'leaflet';

import { CLIMATE_MAX_TRIES, climateLayer, climateTileUrl, istDate, newestDate } from './climateLayers';
import type { ClimateId } from './climateLayers';

/** The picture's date once its tiles load, and whether NASA itself said it is
 *  the newest it has (`newest`) or it was found by trying dates. 'failed':
 *  nothing in the last CLIMATE_MAX_TRIES days. null while loading. */
export type ClimateState = { date: string; newest: boolean } | 'failed' | null;

const BLANK =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** The pane climate tiles draw in: above the basemap (tile pane, 200) and
 *  under everything drawn on the map (overlay pane, 400). */
export const CLIMATE_PANE = 'w-climate';

export function ensureClimatePane(map: L.Map): void {
  if (!map.getPane(CLIMATE_PANE)) map.createPane(CLIMATE_PANE).style.zIndex = '300';
}

/** Adds the layer and reports which date loaded. The date is the newest NASA
 *  says it has published (newestDate) — no tile is asked for until that is
 *  known, so none is fetched for a day that does not exist yet. Where NASA
 *  cannot be asked, or that day's tiles all fail, the older way takes over: a
 *  missing date fails every tile, so the day before is tried, up to
 *  CLIMATE_MAX_TRIES. */
export function addClimateLayer(
  map: L.Map, id: ClimateId, report: (state: ClimateState) => void,
): L.TileLayer {
  ensureClimatePane(map);
  const def = climateLayer(id);
  let tries = 0;
  let date = istDate(def.lagDays);
  let loaded = 0;
  let failed = 0;
  /** True while the date on screen is the one NASA named as its newest. */
  let vouched = false;
  /** Tiles are blank until the date is settled. */
  let asked = false;
  report(null);
  const layer = L.tileLayer(BLANK, {
    pane: CLIMATE_PANE,
    maxNativeZoom: def.nativeZoom,
    maxZoom: 19,
    opacity: 0.7,
    className: 'w-tiles-climate',
    errorTileUrl: BLANK,
    attribution: 'Climate &copy; NASA GIBS',
  });
  layer.on('loading', () => { loaded = 0; failed = 0; });
  layer.on('tileerror', () => { failed += 1; });
  layer.on('tileload', (e: L.TileEvent) => {
    if ((e.tile as HTMLImageElement).src !== BLANK) loaded += 1;
  });
  layer.on('load', () => {
    if (!asked) return;
    if (loaded > 0) { report({ date, newest: vouched }); return; }
    if (!failed) return;
    vouched = false;
    tries += 1;
    if (tries >= CLIMATE_MAX_TRIES) { report('failed'); return; }
    date = istDate(def.lagDays + tries);
    layer.setUrl(climateTileUrl(def, date));
  });
  void newestDate(def).then((newest) => {
    // Turned off, or another layer chosen, while NASA was being asked.
    if (!map.hasLayer(layer)) return;
    if (newest) { date = newest; vouched = true; }
    asked = true;
    layer.setUrl(climateTileUrl(def, date));
  });
  return layer.addTo(map);
}
