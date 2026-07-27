/**
 * GlassCard — formerly the gold-glass surface; now a plain elevated Paper
 * (stock MUI theme, founder decision 2026-07-26). The component name and API
 * are kept so call sites (wallet balance, dashboard hero) stay untouched;
 * `tone` is accepted and ignored.
 */
import type { ReactNode } from 'react';
import Paper from '@mui/material/Paper';
import type { SxProps, Theme } from '@mui/material/styles';

interface GlassCardProps {
  tone?: 'gold' | 'sky';
  children: ReactNode;
  sx?: SxProps<Theme>;
}

export function GlassCard({ children, sx = {} }: GlassCardProps) {
  return (
    <Paper elevation={2} sx={[{ p: { xs: 2.5, sm: 3 } }, ...(Array.isArray(sx) ? sx : [sx])]}>
      {children}
    </Paper>
  );
}
