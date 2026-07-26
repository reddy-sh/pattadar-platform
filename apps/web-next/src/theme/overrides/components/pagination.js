import { paginationItemClasses } from '@mui/material/PaginationItem';

import { varAlpha } from '../../css';

// ----------------------------------------------------------------------

const COLORS = ['primary', 'secondary', 'info', 'success', 'warning', 'error'];

const GREY_CHANNEL = '145 158 171'; // grey[500], scheme-invariant

// ----------------------------------------------------------------------

export function pagination(theme) {
  const rootStyles = (ownerState) => {
    const defaultColor = ownerState.color === 'standard';

    const filledVariant = ownerState.variant === 'text';

    const outlinedVariant = ownerState.variant === 'outlined';

    const softVariant = ownerState.variant === 'soft';

    const defaultStyle = {
      [`& .${paginationItemClasses.root}`]: {
        ...(outlinedVariant && {
          borderColor: varAlpha(GREY_CHANNEL, 0.24),
        }),

        [`&.${paginationItemClasses.selected}`]: {
          fontWeight: theme.typography.fontWeightSemiBold,
          ...(outlinedVariant && {
            borderColor: 'currentColor',
          }),

          ...(defaultColor && {
            backgroundColor: varAlpha(GREY_CHANNEL, 0.08),
            ...(filledVariant && {
              color: theme.palette.common.white,
              backgroundColor: theme.vars.palette.text.primary,
              '&:hover': {
                backgroundColor: theme.palette.grey[700],
              },
              ...theme.applyStyles('dark', {
                color: theme.palette.grey[800],
                '&:hover': {
                  backgroundColor: theme.palette.grey[100],
                },
              }),
            }),
          }),
        },
      },
    };

    const colorStyle = COLORS.map((color) => ({
      ...(ownerState.color === color && {
        [`& .${paginationItemClasses.root}`]: {
          [`&.${paginationItemClasses.selected}`]: {
            ...(ownerState.color === color && {
              // SOFT
              ...(softVariant && {
                color: theme.vars.palette[color].dark,
                backgroundColor: varAlpha(theme.vars.palette[color].mainChannel, 0.08),
                '&:hover': {
                  backgroundColor: varAlpha(theme.vars.palette[color].mainChannel, 0.16),
                },
                ...theme.applyStyles('dark', {
                  color: theme.vars.palette[color].light,
                }),
              }),
            }),
          },
        },
      }),
    }));

    return [defaultStyle, ...colorStyle];
  };

  return {
    MuiPagination: {
      styleOverrides: {
        root: ({ ownerState }) => rootStyles(ownerState),
      },
    },
  };
}
