'use client';

/**
 * Hand-built SVG donut (no chart library). Dataviz rules applied:
 * thin ring, 2px surface gaps between segments, hover tooltip, text in text
 * tokens (never series colors). The legend is rendered by the caller
 * (categories with swatches + values double as the legend).
 */
import { useState } from 'react';
import type { MouseEvent } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export interface DonutSlice {
  label: string;
  value: number;
  /** Display string for tooltips (e.g. "₹62,50,000"). */
  display: string;
  color: string;
}

interface DonutProps {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}

const polar = (cx: number, cy: number, r: number, a: number): [number, number] => [
  cx + r * Math.cos(a),
  cy + r * Math.sin(a),
];

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export function Donut({ slices, size = 190, thickness = 20, centerLabel, centerSub }: DonutProps) {
  const [hover, setHover] = useState<number | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const visible = slices.filter((s) => s.value > 0);
  const total = visible.reduce((s, d) => s + d.value, 0);
  const c = size / 2;
  const r = (size - thickness) / 2;
  const gapAngle = visible.length > 1 ? 2.5 / r : 0; // ≈2px surface gap
  const fullCircle = Math.PI * 2;

  let angle = -Math.PI / 2;
  const arcs = visible.map((s) => {
    const sweep = total > 0 ? (s.value / total) * fullCircle : 0;
    const a0 = angle + gapAngle / 2;
    const a1 = Math.max(a0 + 0.01, angle + sweep - gapAngle / 2);
    angle += sweep;
    return { ...s, a0, a1, pct: total > 0 ? Math.round((s.value / total) * 100) : 0 };
  });

  const onMove = (e: MouseEvent<SVGElement>) => {
    const host = e.currentTarget.closest('[data-donut-host]');
    if (!host) return;
    const rect = host.getBoundingClientRect();
    setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const hovered = hover !== null ? arcs[hover] : null;

  return (
    <Box data-donut-host sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg
        width={size}
        height={size}
        role="img"
        aria-label={visible.map((s) => `${s.label} ${s.display}`).join(', ') || 'No data'}
      >
        {visible.length === 0 && (
          <circle cx={c} cy={c} r={r} fill="none" strokeWidth={thickness} stroke="rgba(128,128,128,0.14)" />
        )}
        {visible.length === 1 && (
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            strokeWidth={thickness}
            stroke={visible[0].color}
            onMouseEnter={() => setHover(0)}
            onMouseLeave={() => { setHover(null); setTip(null); }}
            onMouseMove={onMove}
          />
        )}
        {visible.length > 1 &&
          arcs.map((a, i) => (
            <path
              key={a.label}
              d={arcPath(c, c, r, a.a0, a.a1)}
              fill="none"
              stroke={a.color}
              strokeWidth={hover === i ? thickness + 3 : thickness}
              strokeLinecap="butt"
              opacity={hover === null || hover === i ? 1 : 0.4}
              style={{ transition: 'opacity 0.15s ease, stroke-width 0.15s ease', cursor: 'default' }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => { setHover(null); setTip(null); }}
              onMouseMove={onMove}
            />
          ))}
      </svg>
      {(centerLabel || centerSub) && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            px: 3,
            pointerEvents: 'none',
          }}
        >
          {centerLabel && (
            <Typography sx={{ fontWeight: 700, fontSize: 18, lineHeight: 1.2 }}>{centerLabel}</Typography>
          )}
          {centerSub && (
            <Typography variant="caption" color="text.secondary">
              {centerSub}
            </Typography>
          )}
        </Box>
      )}
      {hovered && tip && (
        <Box
          sx={{
            position: 'absolute',
            left: Math.min(tip.x + 12, size - 10),
            top: tip.y + 12,
            zIndex: 2,
            pointerEvents: 'none',
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'divider',
            borderRadius: 1.5,
            px: 1.25,
            py: 0.75,
            boxShadow: 3,
            whiteSpace: 'nowrap',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: hovered.color }} />
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {hovered.label}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {hovered.display} · {hovered.pct}%
          </Typography>
        </Box>
      )}
    </Box>
  );
}
