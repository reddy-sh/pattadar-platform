import { chipClasses } from '@mui/material/Chip';

import { varAlpha } from '../../css';

// ----------------------------------------------------------------------

const COLORS = ['primary', 'secondary', 'info', 'success', 'warning', 'error'];

const GREY_CHANNEL = '145 158 171'; // grey[500], scheme-invariant

// ----------------------------------------------------------------------

export function chip(theme) {
  const rootStyles = (ownerState) => {
    const defaultColor = ownerState.color === 'default';

    const filledVariant = ownerState.variant === 'filled';

    const outlinedVariant = ownerState.variant === 'outlined';

    const softVariant = ownerState.variant === 'soft';

    const defaultStyle = {
      [`& .${chipClasses.deleteIcon}`]: {
        opacity: 0.48,
        color: 'currentColor',
        '&:hover': {
          opacity: 1,
          color: 'currentColor',
        },
      },

      ...(defaultColor && {
        [`& .${chipClasses.avatar}`]: {
          color: theme.vars.palette.text.primary,
        },
        // FILLED
        ...(filledVariant && {
          color: theme.palette.common.white,
          backgroundColor: theme.vars.palette.text.primary,
          '&:hover': {
            backgroundColor: theme.palette.grey[700],
          },
          [`& .${chipClasses.icon}`]: {
            color: theme.palette.common.white,
          },
          ...theme.applyStyles('dark', {
            color: theme.palette.grey[800],
            '&:hover': {
              backgroundColor: theme.palette.grey[100],
            },
            [`& .${chipClasses.icon}`]: {
              color: theme.palette.grey[800],
            },
          }),
        }),
        // OUTLINED
        ...(outlinedVariant && {
          border: `solid 1px ${varAlpha(GREY_CHANNEL, 0.32)}`,
        }),
        // SOFT
        ...(softVariant && {
          color: theme.vars.palette.text.primary,
          backgroundColor: varAlpha(GREY_CHANNEL, 0.16),
          '&:hover': {
            backgroundColor: varAlpha(GREY_CHANNEL, 0.32),
          },
        }),
      }),
    };

    const colorStyle = COLORS.map((color) => ({
      ...(ownerState.color === color && {
        [`& .${chipClasses.avatar}`]: {
          color: theme.vars.palette[color].lighter,
          backgroundColor: theme.vars.palette[color].dark,
        },
        // SOFT
        ...(softVariant && {
          color: theme.vars.palette[color].dark,
          backgroundColor: varAlpha(theme.vars.palette[color].mainChannel, 0.16),
          '&:hover': {
            backgroundColor: varAlpha(theme.vars.palette[color].mainChannel, 0.32),
          },
          ...theme.applyStyles('dark', {
            color: theme.vars.palette[color].light,
          }),
        }),
      }),
    }));

    const disabledState = {
      [`&.${chipClasses.disabled}`]: {
        opacity: 1,
        color: theme.vars.palette.action.disabled,
        [`& .${chipClasses.icon}`]: {
          color: theme.vars.palette.action.disabled,
        },
        [`& .${chipClasses.avatar}`]: {
          color: theme.vars.palette.action.disabled,
          backgroundColor: theme.vars.palette.action.disabledBackground,
        },
        // FILLED
        ...(filledVariant && {
          backgroundColor: theme.vars.palette.action.disabledBackground,
        }),
        // OUTLINED
        ...(outlinedVariant && {
          borderColor: theme.vars.palette.action.disabledBackground,
        }),
        // SOFT
        ...(softVariant && {
          backgroundColor: theme.vars.palette.action.disabledBackground,
        }),
      },
    };

    return [
      defaultStyle,
      ...colorStyle,
      disabledState,
      {
        fontWeight: 500,
        borderRadius: theme.shape.borderRadius,
      },
    ];
  };

  return {
    MuiChip: {
      styleOverrides: {
        root: ({ ownerState }) => rootStyles(ownerState),
      },
    },
  };
}
