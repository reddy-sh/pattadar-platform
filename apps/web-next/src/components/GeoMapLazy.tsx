'use client';

/**
 * Lazy seam for GeoMap: Leaflet (~150 kB) loads only when a map actually
 * renders, keeping it out of the landing/main bundles, and never during SSR
 * (leaflet touches `window`/DOM on import). next/dynamic replaces the
 * source's React.lazy + Suspense for this — see .superpowers/sdd/phase-C-recipe.md.
 */
import dynamic from 'next/dynamic';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import type { GeoMapProps } from './GeoMap';

export type { GeoMapProps };

export const GeoMap = dynamic<GeoMapProps>(() => import('./GeoMap'), {
  ssr: false,
  loading: () => (
    <Box
      sx={{
        height: 380,
        display: 'grid',
        placeItems: 'center',
        borderRadius: 3,
        border: '1px dashed',
        borderColor: 'divider',
      }}
    >
      <CircularProgress size={28} aria-label="Loading map" />
    </Box>
  ),
});
