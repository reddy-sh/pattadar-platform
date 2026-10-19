import { schemeById } from '@pattadar/tokens';

/** The water-flow overlay's colours. It is drawn on satellite imagery, which
 *  looks the same whatever the page's scheme, so it always takes the Dark
 *  scheme's validated hues: bright on the ground, as the simulator draws them.
 *  Its own module, so the card can read it without pulling Leaflet in. */
export const FLOW_INK = (() => {
  const p = schemeById('dark').palette;
  return {
    line: p.chart[1], main: p.chart[2], pinArea: p.chart[4], other: p.chart[5],
    // Medium is the chart orange, not the status gold: the gold is the
    // boundary ring below. Low is the card's neutral grey ("unknown" chip),
    // not a blue beside the other maps' blue lines: one hue per state.
    high: p.status.good, medium: p.chart[0], low: p.ink2, onPin: p.onWarn,
    /** The parcel's own outline over imagery: a bright gold that holds up on
     *  dark scrub and pale fields alike, with a dark casing under it. */
    ring: p.status.warning,
  };
})();
