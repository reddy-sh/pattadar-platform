/** Remove a Leaflet map without leaving an animation to fire into the void.
 *
 *  Leaflet 1.9 schedules the end of a zoom animation on a 250 ms timer
 *  (Map._animateZoom) and never cancels it in `remove()`. If the map is removed
 *  while a fitBounds, flyToBounds or wheel zoom is still animating — leaving
 *  Cadastral maps for the next section straight after it framed a village —
 *  that timer runs `_onZoomTransitionEnd` on a map whose panes are gone and
 *  throws "Cannot read properties of undefined (reading '_leaflet_pos')" as an
 *  uncaught page error. `stop()` ends a pan or fly; clearing `_animatingZoom`
 *  makes the pending timer return at its first line. */
export interface RemovableMap {
  stop(): unknown;
  off(): unknown;
  remove(): unknown;
}

export function removeMap(map: RemovableMap | null | undefined): void {
  if (!map) return;
  map.stop();
  (map as unknown as { _animatingZoom?: boolean })._animatingZoom = false;
  map.off();
  map.remove();
}
