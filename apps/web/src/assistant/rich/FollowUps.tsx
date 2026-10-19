import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import type { RecordView } from '../types';

export function FollowUps({ views, extra, disabled, onAsk }: {
  views?: RecordView[];
  /** Chat-level follow-ups sent with the reply's usage event (or stored on it). */
  extra?: Array<{ label: string; prompt: string }>;
  disabled: boolean;
  onAsk: (prompt: string) => void;
}) {
  const seen = new Set<string>();
  const items = [...(views ?? []).flatMap((view) => view.follow_ups ?? []), ...(extra ?? [])].filter((item) => {
    if (!item?.label || !item.prompt || seen.has(item.prompt)) return false;
    seen.add(item.prompt);
    return true;
  }).slice(0, 4);
  if (!items.length) return null;
  return (
    <Box sx={{ mt: 1.25, whiteSpace: 'normal' }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Ask next</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        {items.map((item) => (
          <Chip
            key={item.prompt}
            label={item.label}
            onClick={() => onAsk(item.prompt)}
            disabled={disabled}
            variant="outlined"
            color="primary"
            sx={{ maxWidth: '100%', height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }}
          />
        ))}
      </Box>
    </Box>
  );
}
