/** Lazy seam for PortfolioCanvas — the same split MapCanvasLazy makes, and
 *  load-bearing here rather than merely tidy: Properties is the busiest screen
 *  in the app and it lands in the card grid. Importing this eagerly would put
 *  Leaflet's ~150 kB in front of every visit for the sake of a view most of
 *  them never switch to. */
import { Suspense, lazy } from 'react';
import type { Ref } from 'react';
import type { PortfolioCanvasProps, PortfolioCanvasHandle } from './PortfolioCanvas';
import { Loading } from './ui';

const Impl = lazy(() => import('./PortfolioCanvas'));

export type { PortfolioCanvasProps, PortfolioCanvasHandle, PortfolioPin } from './PortfolioCanvas';

export function PortfolioCanvas(
  props: PortfolioCanvasProps & { ref?: Ref<PortfolioCanvasHandle> },
) {
  return (
    <Suspense fallback={<Loading h="100%" />}>
      <Impl {...props} />
    </Suspense>
  );
}
