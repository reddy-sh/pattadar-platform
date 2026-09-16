/** Lazy seam for VillageCanvas — the same split MapCanvasLazy makes. Leaflet
 *  is ~150 kB and this is one screen of fifteen. */
import { Suspense, lazy } from 'react';
import type { Ref } from 'react';
import type { VillageCanvasHandle, VillageCanvasProps } from './VillageCanvas';
import { Loading } from './ui';

const Impl = lazy(() => import('./VillageCanvas'));

export type { VillageCanvasHandle, VillageCanvasProps, VillageMode, MeasureState } from './VillageCanvas';
export { BANDS, bandOf } from './VillageCanvas';

export function VillageCanvas(props: VillageCanvasProps & { ref?: Ref<VillageCanvasHandle> }) {
  return (
    <Suspense fallback={<Loading h="100%" />}>
      <Impl {...props} />
    </Suspense>
  );
}
