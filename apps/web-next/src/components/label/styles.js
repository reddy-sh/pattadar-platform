import Box from '@mui/material/Box';
import { styled } from '@mui/material/styles';

// ----------------------------------------------------------------------

export const StyledLabel = styled(Box)(({ theme, ownerState }) => {
  const filledVariant = ownerState.variant === 'filled';

  const outlinedVariant = ownerState.variant === 'outlined';

  const softVariant = ownerState.variant === 'soft';

  const defaultStyle = {
    ...(ownerState.color === 'default' && {
      // FILLED
      ...(filledVariant && {
        color: theme.palette.common.white,
        backgroundColor: theme.vars.palette.text.primary,
        ...theme.applyStyles('dark', {
          color: theme.palette.grey[800],
        }),
      }),
      // OUTLINED
      ...(outlinedVariant && {
        backgroundColor: 'transparent',
        color: theme.vars.palette.text.primary,
        border: `2px solid ${theme.vars.palette.text.primary}`,
      }),
      // SOFT
      ...(softVariant && {
        color: theme.vars.palette.text.secondary,
        backgroundColor: 'rgba(145 158 171 / 0.16)', // grey[500]
      }),
    }),
  };

  const colorStyle = {
    ...(ownerState.color !== 'default' && {
      // FILLED
      ...(filledVariant && {
        color: theme.vars.palette[ownerState.color].contrastText,
        backgroundColor: theme.vars.palette[ownerState.color].main,
      }),
      // OUTLINED
      ...(outlinedVariant && {
        backgroundColor: 'transparent',
        color: theme.vars.palette[ownerState.color].main,
        border: `2px solid ${theme.vars.palette[ownerState.color].main}`,
      }),
      // SOFT
      ...(softVariant && {
        color: theme.vars.palette[ownerState.color].dark,
        backgroundColor: `rgba(${theme.vars.palette[ownerState.color].mainChannel} / 0.16)`,
        ...theme.applyStyles('dark', {
          color: theme.vars.palette[ownerState.color].light,
        }),
      }),
    }),
  };

  return {
    height: 24,
    minWidth: 24,
    lineHeight: 0,
    borderRadius: 6,
    cursor: 'default',
    alignItems: 'center',
    whiteSpace: 'nowrap',
    display: 'inline-flex',
    justifyContent: 'center',
    textTransform: 'capitalize',
    padding: theme.spacing(0, 0.75),
    fontSize: theme.typography.pxToRem(12),
    fontWeight: theme.typography.fontWeightBold,
    transition: theme.transitions.create('all', {
      duration: theme.transitions.duration.shorter,
    }),
    ...defaultStyle,
    ...colorStyle,
  };
});
