/**
 * Content-shaped loading skeletons (M3: no lone spinners). Each mirrors the
 * layout it replaces so nothing jumps when live data lands — and sample data
 * is NEVER painted uncredited while the live fetch is still pending.
 */
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Skeleton from '@mui/material/Skeleton';

/** A stat-row placeholder: one soft container with N label/figure pairs. */
export function StatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Card sx={{ display: 'flex', flexWrap: 'wrap', px: 2.5, py: 2, mb: 2, gap: 3 }}>
      {Array.from({ length: count }, (_, i) => (
        <Box key={i} sx={{ flex: 1, minWidth: 120 }}>
          <Skeleton width={80} height={16} />
          <Skeleton width={110} height={30} />
        </Box>
      ))}
    </Card>
  );
}

/** A table placeholder: header band + 52px rows. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Card sx={{ px: 2, py: 1 }}>
      <Box sx={{ py: 1.5 }}>
        <Skeleton width="34%" height={16} />
      </Box>
      {Array.from({ length: rows }, (_, i) => (
        <Box
          key={i}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            height: 52,
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Skeleton variant="circular" width={26} height={26} />
          <Skeleton width="28%" height={18} />
          <Skeleton width="18%" height={18} />
          <Skeleton width="14%" height={18} sx={{ ml: 'auto' }} />
        </Box>
      ))}
    </Card>
  );
}

/** A card-grid placeholder (khata / holding cards). */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' },
        gap: 3,
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <Card key={i}>
          <Skeleton variant="rectangular" height={140} />
          <Box sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Skeleton variant="circular" width={40} height={40} />
              <Skeleton width="55%" height={22} />
            </Box>
            <Skeleton width="70%" height={18} sx={{ mt: 1 }} />
            <Skeleton width="50%" height={18} sx={{ mt: 0.5 }} />
            <Skeleton width="40%" height={26} sx={{ mt: 1.5 }} />
          </Box>
        </Card>
      ))}
    </Box>
  );
}

/** A page-header placeholder: eyebrow + headline + subtitle. */
export function HeaderSkeleton() {
  return (
    <Box sx={{ mb: 3 }}>
      <Skeleton width={90} height={14} />
      <Skeleton width={240} height={36} />
      <Skeleton width={320} height={18} />
    </Box>
  );
}

/** A hero-band placeholder (dashboard / detail cover). */
export function HeroSkeleton({ height = 200 }: { height?: number }) {
  return <Skeleton variant="rounded" height={height} sx={{ borderRadius: 4, mb: 2 }} />;
}
