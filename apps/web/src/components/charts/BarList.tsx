/**
 * Horizontal bar list (hand-built HTML). One nominal series → every bar wears
 * the SAME hue (bar length already encodes the value; color does identity
 * only). Thin 12px marks, square at the baseline, 4px rounded data-end,
 * recessive track, direct value labels in text tokens, tooltip on hover.
 */
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

export interface BarListRow {
  id: string;
  label: string;
  value: number;
  /** Display string, e.g. "2 Acres 50 Cents" or "₹1.25 Cr". */
  display: string;
}

interface BarListProps {
  rows: BarListRow[];
  color: string;
  onRowClick?: (row: BarListRow) => void;
}

export function BarList({ rows, color, onRowClick }: BarListProps) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {rows.map((row) => (
        <Tooltip key={row.id} title={`${row.label} — ${row.display}`} placement="top">
          <Box
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            sx={{
              display: 'grid',
              gridTemplateColumns: '96px 1fr auto',
              alignItems: 'center',
              gap: 1.25,
              cursor: onRowClick ? 'pointer' : 'default',
              '&:hover .bar-fill': { filter: 'brightness(1.08)' },
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {row.label}
            </Typography>
            <Box sx={{ height: 12, borderRadius: '0 4px 4px 0', bgcolor: 'action.hover', position: 'relative' }}>
              <Box
                className="bar-fill"
                sx={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: `${Math.max(2, (row.value / max) * 100)}%`,
                  borderRadius: '0 4px 4px 0',
                  bgcolor: color,
                }}
              />
            </Box>
            <Typography variant="caption" sx={{ fontWeight: 600, textAlign: 'right', minWidth: 72 }}>
              {row.display}
            </Typography>
          </Box>
        </Tooltip>
      ))}
    </Box>
  );
}
