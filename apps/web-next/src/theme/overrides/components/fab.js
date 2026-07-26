import { fabClasses } from '@mui/material/Fab';

import { varAlpha } from '../../css';

// ----------------------------------------------------------------------

const COLORS = ['primary', 'secondary', 'info', 'success', 'warning', 'error'];

const GREY_CHANNEL = '145 158 171'; // grey[500], scheme-invariant

// ----------------------------------------------------------------------

export function fab(theme) {
  const rootStyles = (ownerState) => {
    const defaultColor = ownerState.color === 'default';

    const inheritColor = ownerState.color === 'inherit';

    const circularVariant = ownerState.variant === 'circular';

    const extendedVariant = ownerState.variant === 'extended';

    const outlinedVariant = ownerState.variant === 'outlined';

    const outlinedExtendedVariant = ownerState.variant === 'outlinedExtended';

    const softVariant = ownerState.variant === 'soft';

    const softExtendedVariant = ownerState.variant === 'softExtended';

    const defaultStyle = {
      '&:hover, &:active': {
        boxShadow: 'none',
      },
      // FILLED
      ...((circularVariant || extendedVariant) && {
        ...((defaultColor || inheritColor) && {
          boxShadow: theme.customShadows.z8,
        }),
        ...(inheritColor && {
          backgroundColor: theme.vars.palette.text.primary,
          color: theme.palette.common.white,
          '&:hover': {
            backgroundColor: theme.palette.grey[700],
          },
          ...theme.applyStyles('dark', {
            color: theme.palette.grey[800],
            '&:hover': {
              backgroundColor: theme.palette.grey[400],
            },
          }),
        }),
      }),
      // OUTLINED
      ...((outlinedVariant || outlinedExtendedVariant) && {
        boxShadow: 'none',
        backgroundColor: 'transparent',
        ...((defaultColor || inheritColor) && {
          border: `solid 1px ${varAlpha(GREY_CHANNEL, 0.32)}`,
        }),
        ...(defaultColor && {
          ...theme.applyStyles('dark', {
            color: theme.vars.palette.text.secondary,
          }),
        }),

        '&:hover': {
          borderColor: 'currentColor',
          boxShadow: '0 0 0 0.5px currentColor',
          backgroundColor: theme.vars.palette.action.hover,
        },
      }),
      // SOFT
      ...((softVariant || softExtendedVariant) && {
        boxShadow: 'none',
        ...(defaultColor && {
          color: theme.palette.grey[800],
          backgroundColor: theme.palette.grey[300],
          '&:hover': {
            backgroundColor: theme.palette.grey[400],
          },
        }),
        ...(inheritColor && {
          backgroundColor: varAlpha(GREY_CHANNEL, 0.08),
          '&:hover': {
            backgroundColor: varAlpha(GREY_CHANNEL, 0.24),
          },
        }),
      }),
    };

    const colorStyle = COLORS.map((color) => ({
      ...(ownerState.color === color && {
        // FILLED
        ...((circularVariant || extendedVariant) && {
          boxShadow: theme.customShadows[color],
          '&:hover': {
            backgroundColor: theme.vars.palette[color].dark,
          },
        }),
        // OUTLINED
        ...((outlinedVariant || outlinedExtendedVariant) && {
          color: theme.vars.palette[color].main,
          border: `solid 1px ${varAlpha(theme.vars.palette[color].mainChannel, 0.48)}`,
          '&:hover': {
            backgroundColor: varAlpha(theme.vars.palette[color].mainChannel, 0.08),
          },
        }),
        // SOFT
        ...((softVariant || softExtendedVariant) && {
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
      [`&.${fabClasses.disabled}`]: {
        ...((outlinedVariant || outlinedExtendedVariant) && {
          backgroundColor: 'transparent',
          border: `solid 1px ${theme.vars.palette.action.disabledBackground}`,
        }),
      },
    };

    const size = {
      ...((extendedVariant || outlinedExtendedVariant || softExtendedVariant) && {
        width: 'auto',
        '& svg': {
          marginRight: theme.spacing(1),
        },
        ...(ownerState.size === 'small' && {
          height: 34,
          minHeight: 34,
          borderRadius: 17,
          padding: theme.spacing(0, 1),
        }),
        ...(ownerState.size === 'medium' && {
          height: 40,
          minHeight: 40,
          borderRadius: 20,
          padding: theme.spacing(0, 2),
        }),
        ...(ownerState.size === 'large' && {
          height: 48,
          minHeight: 48,
          borderRadius: 24,
          padding: theme.spacing(0, 2),
        }),
      }),
    };

    return [defaultStyle, ...colorStyle, disabledState, size];
  };

  return {
    MuiFab: {
      styleOverrides: {
        root: ({ ownerState }) => rootStyles(ownerState),
      },
    },
  };
}
