/** The layers both maps offer — Maps and a property's Maps tab — and the rules
 *  between them (docs/specs/2026-10-25-pattadar-maps.md). Pure: no React, no
 *  Leaflet, so every rule is unit-tested in mapLayers.test.ts.
 *
 *  The reader's choice (`LayerChoice`) changes only when the reader clicks,
 *  through `chooseBase`, `toggleOverlay` and `chooseInsight`. What can be drawn
 *  right now is worked out from it by `resolveLayers`, so a conflict or a tool
 *  pauses a layer and never unticks it. */

export type BaseId = 'satellite' | 'street' | 'boundaries';
export type OverlayId = 'cadastral' | 'numbers' | 'properties' | 'measurements';
export type InsightId = 'extent' | 'suitability' | 'hydrogeology' | 'climate';
export type LayerId = OverlayId | InsightId;

export interface LayerDef {
  id: LayerId;
  group: 'overlay' | 'insight';
  label: string;
  /** What it shows, said under it when nothing is in its way. */
  about: string;
  /** Drawn on this layer, so turning it on turns this on too. */
  needs?: OverlayId;
  /** Coloured for this map type, so it shows only on it. */
  base?: BaseId;
  /** A parcel-scale layer is too small to see at the district zoom Climate
   *  needs. */
  scale: 'parcel' | 'district';
}

export const BASES: Array<{ id: BaseId; label: string }> = [
  { id: 'satellite', label: 'Satellite' },
  { id: 'street', label: 'Street map' },
  { id: 'boundaries', label: 'Boundaries' },
];

/** In the order the panel lists them. */
export const LAYERS: LayerDef[] = [
  { id: 'cadastral', group: 'overlay', label: 'Cadastral map', about: 'The village’s survey parcels', scale: 'parcel' },
  { id: 'numbers', group: 'overlay', label: 'Parcel numbers', about: 'On each parcel with room for one', needs: 'cadastral', scale: 'parcel' },
  { id: 'properties', group: 'overlay', label: 'Your properties', about: 'Outlined, or pinned where there is no boundary', scale: 'parcel' },
  { id: 'measurements', group: 'overlay', label: 'Measurements', about: 'Side lengths and corner letters', scale: 'parcel' },
  { id: 'extent', group: 'insight', label: 'Extent', about: 'Parcels shaded by size', needs: 'cadastral', base: 'satellite', scale: 'parcel' },
  { id: 'suitability', group: 'insight', label: 'Suitability', about: 'Parcels graded for field crops', needs: 'cadastral', base: 'satellite', scale: 'parcel' },
  { id: 'hydrogeology', group: 'insight', label: 'Hydrogeology', about: 'Where rainwater runs, and bore points', scale: 'parcel' },
  { id: 'climate', group: 'insight', label: 'Climate', about: 'Rain, heat, soil moisture or crop health, district-wide', scale: 'district' },
];

const DEF = new Map(LAYERS.map((l) => [l.id, l]));
export const layerLabel = (id: LayerId) => DEF.get(id)?.label ?? id;
export const ALL_LAYERS: LayerId[] = LAYERS.map((l) => l.id);

export interface LayerChoice {
  base: BaseId;
  overlays: OverlayId[];
  insight: InsightId | null;
}

/** Something the reader is doing that needs the map a certain way: measuring,
 *  marking land, editing a boundary. Applied over the choice, never into it. */
export interface LayerTool {
  /** For the reasons: "Paused while you measure." */
  doing: string;
  /** The map type it holds. */
  base?: BaseId;
  pauses: LayerId[];
}

export interface LayerPlace {
  /** The layers this kind of place lists. One it cannot have at all is left
   *  out; one it cannot have yet is offered and named in `unavailable`. */
  offers: LayerId[];
  /** Why each offered layer cannot be had here yet, in the reader's words. */
  unavailable?: Partial<Record<LayerId, string>>;
  tool?: LayerTool | null;
}

export interface LayerRow {
  def: LayerDef;
  /** Ticked. Never for a layer this place cannot have: a tick there reads as
   *  "on" over a map that does not show it. The choice is kept all the same,
   *  and the layer comes on by itself once the place can have it (a village
   *  opened, one of your properties selected). */
  chosen: boolean;
  /** Drawn right now. */
  on: boolean;
  /** Why it is not drawn although chosen, or why it cannot be chosen. */
  why: string;
  /** This place cannot have it yet (`LayerPlace.unavailable`). */
  unavailable: boolean;
  /** Cannot be pressed: unavailable here, or held by a tool. */
  locked: boolean;
}

export interface ResolvedLayers {
  base: BaseId;
  /** Why the map type cannot be changed, or ''. */
  baseHeld: string;
  shown: Set<LayerId>;
  /** The insight drawn right now, or null. */
  insight: InsightId | null;
  rows: LayerRow[];
}

export function resolveLayers(choice: LayerChoice, place: LayerPlace): ResolvedLayers {
  const offers = new Set(place.offers);
  const tool = place.tool ?? null;
  const base = tool?.base ?? choice.base;
  const chosen = (id: LayerId) => (choice.overlays as LayerId[]).includes(id) || choice.insight === id;
  const memo = new Map<LayerId, string>();

  /** Why a chosen, offered layer is not drawn — '' when it is. Unavailable
   *  first, then a tool, then scale, then what it is drawn on. */
  const block = (id: LayerId): string => {
    const hit = memo.get(id);
    if (hit !== undefined) return hit;
    const def = DEF.get(id)!;
    const out = !offers.has(id) || !chosen(id) ? 'off'
      : place.unavailable?.[id]
        ?? (tool?.pauses.includes(id) ? `Paused while ${tool.doing}.`
          : def.scale === 'parcel' && drawn('climate')
            ? 'Paused while Climate is on: too small to see at district zoom.'
            : def.needs && !drawn(def.needs) ? `Paused: shows with ${layerLabel(def.needs)}.`
              : def.base && base !== def.base
                ? `Paused: shows on ${BASES.find((b) => b.id === def.base)!.label}.`
                : id === 'measurements' && drawn('hydrogeology')
                  ? 'Paused while Hydrogeology is on: its labels would sit on the bore points.'
                  : '');
    memo.set(id, out);
    return out;
  };
  function drawn(id: LayerId) { return block(id) === ''; }

  const shown = new Set(ALL_LAYERS.filter(drawn));
  const rows = LAYERS.filter((def) => offers.has(def.id)).map((def): LayerRow => {
    const unavailable = place.unavailable?.[def.id] ?? '';
    const why = block(def.id);
    return {
      def,
      chosen: chosen(def.id) && !unavailable,
      on: why === '',
      why: unavailable || (why === 'off' ? '' : why),
      unavailable: !!unavailable,
      locked: !!unavailable || !!tool?.pauses.includes(def.id),
    };
  });
  return {
    base,
    baseHeld: tool?.base ? `Held while ${tool.doing}.` : '',
    shown,
    insight: choice.insight && shown.has(choice.insight) ? choice.insight : null,
    rows,
  };
}

/** A map-type chip is a switch: pressing the one that is on flips it — the
 *  ground off is Boundaries, anything else off is back to Satellite. */
export function chooseBase(choice: LayerChoice, base: BaseId): LayerChoice {
  const next = base !== choice.base ? base : base === 'satellite' ? 'boundaries' : 'satellite';
  return { ...choice, base: next };
}

/** On brings what it is drawn on; off pauses whatever was drawn on it. */
export function toggleOverlay(choice: LayerChoice, id: OverlayId): LayerChoice {
  if (choice.overlays.includes(id)) return { ...choice, overlays: choice.overlays.filter((o) => o !== id) };
  const needs = DEF.get(id)?.needs;
  return { ...choice, overlays: [...new Set([...choice.overlays, ...(needs ? [needs] : []), id])] };
}

/** One insight at a time. Choosing one brings the layer it colours and the
 *  map type it is coloured for; null is None. */
export function chooseInsight(choice: LayerChoice, id: InsightId | null): LayerChoice {
  if (!id) return { ...choice, insight: null };
  const def = DEF.get(id)!;
  return {
    base: def.base ?? choice.base,
    overlays: def.needs && !choice.overlays.includes(def.needs)
      ? [...choice.overlays, def.needs] : choice.overlays,
    insight: id,
  };
}
