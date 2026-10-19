/** The blinking bar at the end of a reply while it streams. Decorative only. */
import Box from '@mui/material/Box';
import { keyframes } from '@mui/material/styles';

const blink = keyframes`
  0%, 45% { opacity: 1; }
  55%, 100% { opacity: 0; }
`;

export function StreamingCaret() {
  return (
    <Box
      component="span"
      aria-hidden
      data-streaming-caret=""
      sx={{
        display: 'inline-block',
        width: '2px',
        height: '1.05em',
        ml: '2px',
        verticalAlign: '-0.15em',
        borderRadius: '1px',
        bgcolor: 'text.primary',
        animation: `${blink} 1s steps(1, end) infinite`,
        '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 0.6 },
      }}
    />
  );
}
