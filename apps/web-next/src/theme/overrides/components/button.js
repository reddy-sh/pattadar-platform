import { buttonClasses } from '@mui/material/Button';

import { varAlpha } from '../../css';

// ----------------------------------------------------------------------

const COLORS = ['primary', 'secondary', 'info', 'success', 'warning', 'error'];

const GREY_CHANNEL = '145 158 171'; // grey[500], scheme-invariant

// ----------------------------------------------------------------------

export function button(theme) {
  const rootStyles = (ownerState) => {
    const inheritColor = ownerState.color === 'inherit';

    const containedVariant = ownerState.variant === 'contained';

    const outlinedVariant = ownerState.variant === 'outlined';

    const textVariant = ownerState.variant === 'text';

    const softVariant = ownerState.variant === 'soft';

    const smallSize = ownerState.size === 'small';

    const mediumSize = ownerState.size === 'medium';

    const largeSize = ownerState.size === 'large';

    const defaultStyle = {
      ...(inheritColor && {
        // CONTAINED
        ...(containedVariant && {
          color: theme.palette.common.white,
          backgroundColor: theme.palette.grey[800],
          '&:hover': {
            backgroundColor: theme.palette.grey[700],
          },
          ...theme.applyStyles('dark', {
            color: theme.palette.grey[800],
            backgroundColor: theme.palette.common.white,
            '&:hover': {
              backgroundColor: theme.palette.grey[400],
            },
          }),
        }),
        // OUTLINED
        ...(outlinedVariant && {
          borderColor: varAlpha(GREY_CHANNEL, 0.32),
          '&:hover': {
            backgroundColor: theme.vars.palette.action.hover,
          },
        }),
        // TEXT
        ...(textVariant && {
          '&:hover': {
            backgroundColor: theme.vars.palette.action.hover,
          },
        }),
        // SOFT
        ...(softVariant && {
          color: theme.vars.palette.text.primary,
          backgroundColor: varAlpha(GREY_CHANNEL, 0.08),
          '&:hover': {
            backgroundColor: varAlpha(GREY_CHANNEL, 0.24),
          },
        }),
      }),
      ...(outlinedVariant && {
        '&:hover': {
          borderColor: 'currentColor',
          boxShadow: '0 0 0 0.5px currentColor',
        },
      }),
    };

    const colorStyle = COLORS.map((color) => ({
      ...(ownerState.color === color && {
        // CONTAINED
        ...(containedVariant && {
          '&:hover': {
            boxShadow: theme.customShadows[color],
          },
        }),
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
      [`&.${buttonClasses.disabled}`]: {
        // SOFT
        ...(softVariant && {
          backgroundColor: theme.vars.palette.action.disabledBackground,
        }),
      },
    };

    const size = {
      ...(smallSize && {
        height: 30,
        fontSize: 13,
        paddingLeft: 8,
        paddingRight: 8,
        ...(textVariant && {
          paddingLeft: 4,
          paddingRight: 4,
        }),
      }),
      ...(mediumSize && {
        paddingLeft: 12,
        paddingRight: 12,
        ...(textVariant && {
          paddingLeft: 8,
          paddingRight: 8,
        }),
      }),
      ...(largeSize && {
        height: 48,
        fontSize: 15,
        paddingLeft: 16,
        paddingRight: 16,
        ...(textVariant && {
          paddingLeft: 10,
          paddingRight: 10,
        }),
      }),
    };

    return [defaultStyle, ...colorStyle, disabledState, size];
  };

  return {
    MuiButton: {
      styleOverrides: {
        root: ({ ownerState }) => rootStyles(ownerState),
      },
    },
  };
}
