/**
 * Health ring — a single-value progress ring (hand-built SVG). Rounded
 * data-end, recessive track, % in the centre in text tokens, a one-line
 * "gap" caption naming what's missing. Animates once on mount; respects
 * prefers-reduced-motion.
 */
import { useEffect, useState } from 'react';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

const SIZE = 84;
const R = 33;
const C = 2 * Math.PI * R;

interface HealthRingProps {
  pct: number;
  color: string;
  title: string;
  gap: string;
  onClick?: () => void;
}

export function HealthRing({ pct, color, title, gap, onClick }: HealthRingProps) {
  const clamped = Math.min(100, Math.max(0, pct));
  const [offset, setOffset] = useState(C);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOffset(C * (1 - clamped / 100)));
    return () => cancelAnimationFrame(id);
  }, [clamped]);

  const body = (
    <Box sx={{ textAlign: 'center', p: 2 }}>
      <Box sx={{ position: 'relative', width: SIZE, height: SIZE, mx: 'auto' }}>
        <Box
          component="svg"
          width={SIZE}
          height={SIZE}
          role="img"
          aria-label={`${title}: ${Math.round(clamped)}%`}
          sx={{ transform: 'rotate(-90deg)' }}
        >
          <Box
            component="circle"
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            strokeWidth={8}
            sx={(t) => ({ stroke: (t.vars ?? t).palette.divider })}
          />
          <Box
            component="circle"
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            strokeWidth={8}
            stroke={color}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            sx={{
              transition: 'stroke-dashoffset 0.6s ease-out',
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          />
        </Box>
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <Typography className="tnum" sx={{ fontWeight: 600, fontSize: 20 }}>
            {Math.round(clamped)}%
          </Typography>
        </Box>
      </Box>
      <Typography sx={{ mt: 1, fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
        {gap}
      </Typography>
    </Box>
  );

  return (
    <Card sx={{ height: '100%' }}>
      {onClick ? (
        <Tooltip title="Open">
          <CardActionArea onClick={onClick} sx={{ height: '100%' }}>
            {body}
          </CardActionArea>
        </Tooltip>
      ) : (
        body
      )}
    </Card>
  );
}
