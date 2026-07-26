import { alertClasses } from '@mui/material/Alert';

import { varAlpha } from '../../css';

// ----------------------------------------------------------------------

const COLORS = ['info', 'success', 'warning', 'error'];

// ----------------------------------------------------------------------

export function alert(theme) {
  const rootStyles = (ownerState) => {
    const standardVariant = ownerState.variant === 'standard';

    const filledVariant = ownerState.variant === 'filled';

    const outlinedVariant = ownerState.variant === 'outlined';

    const colorStyle = COLORS.map((color) => ({
      ...(ownerState.severity === color && {
        // STANDARD
        ...(standardVariant && {
          color: theme.vars.palette[color].darker,
          backgroundColor: theme.vars.palette[color].lighter,
          [`& .${alertClasses.icon}`]: {
            color: theme.vars.palette[color].main,
          },
          ...theme.applyStyles('dark', {
            color: theme.vars.palette[color].lighter,
            backgroundColor: theme.vars.palette[color].darker,
            [`& .${alertClasses.icon}`]: {
              color: theme.vars.palette[color].light,
            },
          }),
        }),
        // FILLED
        ...(filledVariant && {
          color: theme.vars.palette[color].contrastText,
          backgroundColor: theme.vars.palette[color].main,
        }),
        // OUTLINED
        ...(outlinedVariant && {
          backgroundColor: varAlpha(theme.vars.palette[color].mainChannel, 0.08),
          color: theme.vars.palette[color].dark,
          border: `solid 1px ${varAlpha(theme.vars.palette[color].mainChannel, 0.16)}`,
          [`& .${alertClasses.icon}`]: {
            color: theme.vars.palette[color].main,
          },
          ...theme.applyStyles('dark', {
            color: theme.vars.palette[color].light,
          }),
        }),
      }),
    }));

    return [...colorStyle];
  };

  return {
    MuiAlert: {
      styleOverrides: {
        root: ({ ownerState }) => rootStyles(ownerState),
        icon: {
          opacity: 1,
        },
      },
    },
    MuiAlertTitle: {
      styleOverrides: {
        root: {
          marginBottom: theme.spacing(0.5),
          fontWeight: theme.typography.fontWeightSemiBold,
        },
      },
    },
  };
}
