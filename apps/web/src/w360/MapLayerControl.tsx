/** The one layer control both maps wear — Maps and a property's Maps tab
 *  (docs/specs/2026-10-25-pattadar-maps.md). The map type stays one click, as
 *  three chips; every other layer is behind Layers, where each row says what
 *  it shows or, when it is not showing, why. The rules themselves are
 *  mapLayers.ts; this only draws what `resolveLayers` decided. */
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import FullscreenOutlined from '@mui/icons-material/FullscreenOutlined';
import FullscreenExitOutlined from '@mui/icons-material/FullscreenExitOutlined';

import { BASES } from './mapLayers';
import type { BaseId, InsightId, LayerRow, OverlayId, ResolvedLayers } from './mapLayers';

export function MapLayerControl({ resolved, onBase, onOverlay, onInsight, fullscreen, children }: {
  resolved: ResolvedLayers;
  onBase: (base: BaseId) => void;
  onOverlay: (id: OverlayId) => void;
  onInsight: (id: InsightId | null) => void;
  /** The map's own big screen (ui.tsx `useFullscreen`); not drawn where the
   *  browser cannot give one (Safari on an iPhone). */
  fullscreen?: { on: boolean; toggle: () => void; supported: boolean };
  /** More chips for the same row (a page's own view switches). */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // A click anywhere else puts the panel away; one inside it never does, so
  // several layers can be changed in one visit.
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const overlays = resolved.rows.filter((r) => r.def.group === 'overlay');
  const insights = resolved.rows.filter((r) => r.def.group === 'insight');
  /** What is on, said on the map with the panel shut, the way a list page
   *  shows its filters: the insight first, then the rest. One that cannot be
   *  had here is never ticked (mapLayers.ts), so it has no chip; one that is
   *  only paused says so, and why on hover — the panel says it in full. */
  const applied = [...insights, ...overlays].filter((r) => r.chosen);
  const turnOff = (r: LayerRow) => (r.def.group === 'insight'
    ? onInsight(null) : onOverlay(r.def.id as OverlayId));

  const row = (r: LayerRow, input: ReactNode) => (
    <div key={r.def.id} className={`w-layer${r.def.group === 'overlay' && r.def.needs ? ' sub' : ''}`}>
      <label>{input}{r.def.label}</label>
      <span className="note" id={`${id}-${r.def.id}`}>{r.why || r.def.about}</span>
    </div>
  );

  return (
    // One box for the chips and the panel, so the panel floats over whatever
    // is under the chips (a page's tools, a key) instead of pushing it down.
    <div className="w-layers" ref={box}>
      <span className="row tight mapchips" role="group" aria-label="Map type">
        {BASES.map((b) => (
          <button key={b.id} type="button" className="chip wash"
                  aria-pressed={resolved.base === b.id}
                  disabled={!!resolved.baseHeld}
                  title={resolved.baseHeld || undefined}
                  onClick={() => onBase(b.id)}>
            {b.label}
          </button>
        ))}
        <button type="button" className="chip wash w-layers-btn" ref={button}
                aria-expanded={open} aria-controls={id}
                onClick={() => setOpen((o) => !o)}>
          Layers
        </button>
        {/* As on a holding's map: the label says what a press does. */}
        {fullscreen?.supported && (
          <button type="button" className="chip" onClick={fullscreen.toggle}
                  title={fullscreen.on ? 'Back to the page (Esc)' : 'Fill the screen with the map'}>
            {fullscreen.on
              ? <FullscreenExitOutlined sx={{ fontSize: 14 }} />
              : <FullscreenOutlined sx={{ fontSize: 14 }} />}
            {fullscreen.on ? 'Exit full screen' : 'View full screen'}
          </button>
        )}
        {children}
      </span>
      {applied.length > 0 && (
        <span className="row tight w-layers-on" role="group" aria-label="Layers on">
          {applied.map((r) => (
            <span key={r.def.id} className={`w-layer-chip${r.on ? '' : ' paused'}`} title={r.why || undefined}>
              {r.def.group === 'insight' && <span className="grp">Insight</span>}
              <span className="val">{r.def.label}{r.on ? '' : ' · paused'}</span>
              {/* Not while a tool holds it: the tool gives it back. */}
              {!r.locked && (
                <button type="button" aria-label={`Turn off ${r.def.label}`} onClick={() => turnOff(r)}>×</button>
              )}
            </span>
          ))}
        </span>
      )}
      {open && (
        <div id={id} className="w-layers-panel" role="group" aria-label="Layers"
             onKeyDown={(e) => {
               if (e.key !== 'Escape') return;
               // The page's own Escape (the tape, a selection) waits its turn.
               e.stopPropagation();
               setOpen(false);
               button.current?.focus();
             }}>
          {overlays.length > 0 && (
            <fieldset>
              <legend className="eyebrow">On the map</legend>
              {overlays.map((r) => row(r, (
                <input type="checkbox" checked={r.chosen} disabled={r.locked}
                       aria-describedby={`${id}-${r.def.id}`}
                       onChange={() => onOverlay(r.def.id as OverlayId)} />
              )))}
            </fieldset>
          )}
          {insights.length > 0 && (
            <fieldset>
              <legend className="eyebrow">Insight · one at a time</legend>
              <div className="w-layer">
                <label>
                  <input type="radio" name={`${id}-insight`} checked={!insights.some((r) => r.chosen)}
                         onChange={() => onInsight(null)} />
                  None
                </label>
              </div>
              {insights.map((r) => row(r, (
                <input type="radio" name={`${id}-insight`} checked={r.chosen} disabled={r.locked}
                       aria-describedby={`${id}-${r.def.id}`}
                       onChange={() => onInsight(r.def.id as InsightId)} />
              )))}
            </fieldset>
          )}
        </div>
      )}
    </div>
  );
}
