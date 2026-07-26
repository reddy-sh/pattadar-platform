/**
 * Lazy seam for GeoMap: Leaflet (~150 kB) loads only when a map actually
 * renders, keeping it out of the landing/main bundles. `import type` keeps
 * the props contract without pulling the implementation into this chunk.
 */
import { Suspense, lazy } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import type { GeoMapProps } from './GeoMap';

const GeoMapImpl = lazy(() => import('./GeoMap'));

export type { GeoMapProps };

export function GeoMap(props: GeoMapProps) {
  const h = props.height === 'fill' ? '70vh' : (props.height ?? 380);
  return (
    <Suspense
      fallback={
        <Box
          sx={{
            height: h,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 3,
            border: '1px dashed',
            borderColor: 'divider',
          }}
        >
          <CircularProgress size={28} aria-label="Loading map" />
        </Box>
      }
    >
      <GeoMapImpl {...props} />
    </Suspense>
  );
}
