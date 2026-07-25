import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Shown when the view is rendering the bundled sample dataset. */
  sample?: boolean;
  /** Right-aligned actions (buttons, toggles). */
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, sample, actions }: PageHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 1.5,
        mb: 2.5,
      }}
    >
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
          <Typography variant="h2" component="h1">
            {title}
          </Typography>
          {sample && (
            <Tooltip title="The live service is not reachable — showing bundled sample data.">
              <Chip size="small" variant="outlined" color="secondary" label="Sample data" />
            </Tooltip>
          )}
        </Box>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{actions}</Box>}
    </Box>
  );
}
