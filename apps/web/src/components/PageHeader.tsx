import type { ElementType, ReactNode } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

interface PageHeaderProps {
  title: string;
  /** Overline eyebrow above the title (M3 label style). */
  eyebrow?: string;
  subtitle?: string;
  /** Shown when the view is rendering the bundled sample dataset. */
  sample?: boolean;
  /** Small chips inline with the title (counts etc.). */
  titleChips?: ReactNode;
  /** Right-aligned actions (buttons, toggles). */
  actions?: ReactNode;
  /**
   * Heading element. Pages own exactly ONE `<h1>` (the default); in-page
   * section scaffolds pass 'h2'/'h3' with the smaller variant.
   */
  component?: ElementType;
  /** Visual size — 'h2' page headline (h4 scale) or 'h3' section title (h6 scale). */
  variant?: 'h2' | 'h3';
}

/**
 * The one page-scaffold header: eyebrow (overline) + headline + subtitle on
 * the left, actions right — adopted by every view so titles, spacing and
 * action placement read identically across the app.
 */
export function PageHeader({
  title,
  eyebrow,
  subtitle,
  sample,
  titleChips,
  actions,
  component = 'h1',
  variant = 'h2',
}: PageHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 1.5,
        mb: 3,
      }}
    >
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        {eyebrow && (
          <Typography variant="overline" color="text.secondary" component="div" sx={{ mb: 0.25 }}>
            {eyebrow}
          </Typography>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
          <Typography variant={variant === 'h2' ? 'h4' : 'h6'} component={component}>
            {title}
          </Typography>
          {titleChips}
          {sample && (
            <Tooltip title="The live service is not reachable — showing bundled sample data.">
              <Chip size="small" variant="outlined" color="secondary" label="Sample data" />
            </Tooltip>
          )}
        </Box>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 720 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>{actions}</Box>
      )}
    </Box>
  );
}
