import Box from '@mui/material/Box';
import Fade from '@mui/material/Fade';
import IconButton from '@mui/material/IconButton';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { focusRingSx, prefersReducedMotion } from './focusRing';

export interface JumpToLatestProps {
  /** Shown when false (the reader has scrolled away from the newest message). */
  atBottom: boolean;
  onClick: () => void;
  /** True while a reply streams: the label says new text is arriving. */
  streaming?: boolean;
}

/**
 * A round button floating over the bottom of the conversation that returns to
 * the newest message. Place it inside a `position: relative` box that wraps the
 * scroll container (not inside the scroller itself).
 */
export function JumpToLatest({ atBottom, onClick, streaming = false }: JumpToLatestProps) {
  const label = streaming ? 'Jump to latest (reply in progress)' : 'Jump to latest';
  return (
    <Fade in={!atBottom} timeout={prefersReducedMotion() ? 0 : 120} unmountOnExit>
      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          bottom: 12,
          transform: 'translateX(-50%)',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      >
        <IconButton
          aria-label={label}
          title={label}
          onClick={onClick}
          sx={(theme) => ({
            pointerEvents: 'auto',
            width: 36,
            height: 36,
            border: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            color: 'text.primary',
            boxShadow: theme.shadows[2],
            '&:hover': { bgcolor: 'background.paper', borderColor: 'text.secondary' },
            ...focusRingSx(theme),
          })}
        >
          <ArrowDownwardIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>
    </Fade>
  );
}
