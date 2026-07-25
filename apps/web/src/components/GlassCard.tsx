/**
 * GlassCard — the "gold glassy, shiny" surface. Used SPARINGLY: the portfolio
 * hero, the wallet balance card, and key stat tiles. Everything else in the
 * app stays clean matte (bordered Cards, elevation 0).
 *
 * Anatomy:
 *  - translucent surface + backdrop-filter blur(14px)
 *  - 1px gold gradient border (border-box gradient trick: two backgrounds,
 *    padding-box surface over border-box gradient, transparent border)
 *  - a soft radial sheen highlight (::before), pointer-events none
 *  - graceful fallback: when backdrop-filter is unsupported the surface goes
 *    near-opaque so text stays readable.
 */
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import { glass } from '@pattadar/tokens';
import type { GlassToneName } from '@pattadar/tokens';
import { useSchemeMode } from './useSchemeMode';

interface GlassCardProps {
  tone?: GlassToneName;
  children: ReactNode;
  sx?: SxProps<Theme>;
}

export function GlassCard({ tone = 'gold', children, sx = {} }: GlassCardProps) {
  const mode = useSchemeMode();
  const t = glass[mode][tone];
  const [b0, b1, b2] = t.borderStops;
  const borderGradient = `linear-gradient(135deg, ${b0}, ${b1} 45%, ${b2})`;
  return (
    <Box
      sx={[
        {
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '16px',
          p: { xs: 2.5, sm: 3 },
          border: '1px solid transparent',
          background: `linear-gradient(${t.surface}, ${t.surface}) padding-box, ${borderGradient} border-box`,
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          boxShadow: t.shadow,
          '@supports not ((backdrop-filter: blur(14px)) or (-webkit-backdrop-filter: blur(14px)))': {
            background: `linear-gradient(${t.surfaceFallback}, ${t.surfaceFallback}) padding-box, ${borderGradient} border-box`,
          },
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: '-40% -20% auto -20%',
            height: '90%',
            background: `radial-gradient(60% 60% at 30% 30%, ${t.sheen}, transparent 70%)`,
            pointerEvents: 'none',
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box sx={{ position: 'relative' }}>{children}</Box>
    </Box>
  );
}
