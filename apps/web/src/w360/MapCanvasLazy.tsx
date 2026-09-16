/** Lazy seam for MapCanvas. Leaflet is ~150 kB and only two of the fifteen
 *  screens draw a map, so it loads when one of them opens and not before —
 *  the same split GeoMapLazy makes on the Bloom side of the app. */
import { Suspense, lazy } from 'react';
import type { Ref } from 'react';
import type { MapCanvasProps, MapHandle } from './MapCanvas';
import { Loading } from './ui';

const Impl = lazy(() => import('./MapCanvas'));

export type { MapCanvasProps, MapHandle, MapMark, Basemap } from './MapCanvas';

export function MapCanvas(props: MapCanvasProps & { ref?: Ref<MapHandle> }) {
  return (
    <Suspense fallback={<Loading h="100%" />}>
      <Impl {...props} />
    </Suspense>
  );
}
