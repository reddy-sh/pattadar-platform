import type { ElementType, ReactNode } from 'react';
import Box from '@mui/material/Box';
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
 * B5 placeholder for the route skeleton — prop shape matches
 * apps/web/src/components/PageHeader.tsx exactly (eyebrow/titleChips/sample
 * accepted but not yet rendered) so every stub page already compiles against
 * the final signature. A later Phase C task ports the full component
 * (eyebrow overline, title chips, "service unreachable" sample banner) in
 * place of this file — call sites don't change.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  component = 'h1',
  variant = 'h2',
}: PageHeaderProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1.5, mb: 3 }}>
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Typography variant={variant === 'h2' ? 'h4' : 'h6'} component={component}>
          {title}
        </Typography>
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
