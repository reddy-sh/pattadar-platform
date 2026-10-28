/** The Climate key, on the map: which picture, what its colours mean, and —
 *  in so many words — how current it is. The date says whether NASA itself
 *  named it the newest it has, how many days ago that is, and what one day's
 *  picture is (a day's average, one satellite pass…), because "24/10" alone
 *  left an owner asking whether this is the latest. The colours are NASA's
 *  (climateLayers.ts reads them from GIBS), so the bar always matches the
 *  tiles under it. */
import { parseISOToDisplay } from '@pattadar/core';

import { CLIMATE_LAYERS, CLIMATE_MAX_TRIES, climateLayer, daysAgo, useClimateKey } from './climateLayers';
import type { ClimateId } from './climateLayers';
import type { ClimateState } from './climateTiles';

export function ClimateKey({ layer, state, onLayer, here = 'The ringed dot is this property.' }: {
  layer: ClimateId;
  state: ClimateState;
  onLayer: (id: ClimateId) => void;
  /** What marks the place being looked at, said after the layer's note. */
  here?: string;
}) {
  const def = climateLayer(layer);
  const key = useClimateKey(def);
  return (
    <div className="w-climate-key" role="group" aria-label="Climate layer and key"
         onClick={(e) => e.stopPropagation()}>
      <div className="row tight w-climate-pick" role="group" aria-label="Climate layer">
        {CLIMATE_LAYERS.map((l) => (
          <button key={l.id} type="button" className="chip wash" aria-pressed={l.id === layer}
                  onClick={() => onLayer(l.id)}>
            {l.label}
          </button>
        ))}
      </div>
      <span className="w-climate-measure">{def.measure}</span>
      {key.data ? (
        <>
          <span className="w-climate-bar" aria-hidden style={{ background: key.data.gradient }} />
          <span className="w-climate-ticks" aria-label={`From ${key.data.low} to ${key.data.high}`}>
            <span>{key.data.low}</span><span>{key.data.mid}</span><span>{key.data.high}</span>
          </span>
        </>
      ) : key.isError ? (
        <span>The colour key did not load.</span>
      ) : (
        <span className="w-climate-bar skeleton" aria-hidden />
      )}
      <span role="status" className="w-climate-when">
        {state === 'failed'
          ? `NASA has no picture for this layer in the last ${CLIMATE_MAX_TRIES} days.`
          : state
            ? (
              <>
                <strong>
                  {state.newest ? 'Newest from NASA' : 'Picture of'} {parseISOToDisplay(state.date)}
                </strong>
                {' · '}{daysAgo(state.date)}
              </>
            )
            : 'Asking NASA for its newest picture…'}
      </span>
      {state && state !== 'failed' && (
        <span className="w-climate-note">
          {def.when}
          {state.newest ? '' : ' NASA could not say whether there is a newer one.'}
        </span>
      )}
      <span className="w-climate-note">{def.note}{here ? ` ${here}` : ''}</span>
    </div>
  );
}
