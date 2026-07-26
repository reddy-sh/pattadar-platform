import { memo } from 'react';
import dynamic from 'next/dynamic';

import { alpha, styled } from '@mui/material/styles';

import { varAlpha } from 'src/theme/css';

// ----------------------------------------------------------------------

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

// Scheme-adaptive blurred tooltip background.
const tooltipBlur = (theme) => ({
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  backgroundColor: varAlpha(theme.vars.palette.background.defaultChannel, 0.8),
});

const Chart = styled(ApexChart)(({ theme }) => ({
  '& .apexcharts-canvas': {
    // Tooltip
    '& .apexcharts-tooltip': {
      ...tooltipBlur(theme),
      color: theme.vars.palette.text.primary,
      boxShadow: theme.customShadows.dropdown,
      borderRadius: theme.shape.borderRadius * 1.25,
      '&.apexcharts-theme-light': {
        borderColor: 'transparent',
        ...tooltipBlur(theme),
      },
    },
    '& .apexcharts-xaxistooltip': {
      ...tooltipBlur(theme),
      borderColor: 'transparent',
      color: theme.vars.palette.text.primary,
      boxShadow: theme.customShadows.dropdown,
      borderRadius: theme.shape.borderRadius * 1.25,
      '&:before': {
        borderBottomColor: alpha(theme.palette.grey[500], 0.24),
      },
      '&:after': {
        borderBottomColor: varAlpha(theme.vars.palette.background.defaultChannel, 0.8),
      },
    },
    '& .apexcharts-tooltip-title': {
      textAlign: 'center',
      fontWeight: theme.typography.fontWeightBold,
      backgroundColor: alpha(theme.palette.grey[500], 0.08),
      color: theme.vars.palette.text.secondary,
      ...theme.applyStyles('dark', {
        color: theme.vars.palette.text.primary,
      }),
    },

    // LEGEND
    '& .apexcharts-legend': {
      padding: 0,
    },
    '& .apexcharts-legend-series': {
      display: 'inline-flex !important',
      alignItems: 'center',
    },
    '& .apexcharts-legend-marker': {
      marginRight: 8,
    },
    '& .apexcharts-legend-text': {
      lineHeight: '18px',
      textTransform: 'capitalize',
    },
  },
}));

export default memo(Chart);
