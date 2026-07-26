import { MaterialDesignContent } from 'notistack';

import { styled } from '@mui/material/styles';

// ----------------------------------------------------------------------

export const StyledNotistack = styled(MaterialDesignContent)(({ theme }) => ({
  '& #notistack-snackbar': {
    ...theme.typography.subtitle2,
    padding: 0,
    flexGrow: 1,
  },
  '&.notistack-MuiContent': {
    color: theme.vars.palette.text.primary,
    boxShadow: theme.customShadows.z8,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(0.5, 2, 0.5, 0.5),
    backgroundColor: theme.vars.palette.background.paper,
  },
  '&.notistack-MuiContent-default': {
    padding: theme.spacing(1, 2, 1, 1),
    color: theme.palette.common.white,
    backgroundColor: theme.palette.grey[800],
    ...theme.applyStyles('dark', {
      color: theme.palette.grey[800],
      backgroundColor: theme.palette.common.white,
    }),
  },
  // '&.notistack-MuiContent-info': {},
  // '&.notistack-MuiContent-success': {},
  // '&.notistack-MuiContent-warning': {},
  // '&.notistack-MuiContent-error': {},
}));

// ----------------------------------------------------------------------

export const StyledIcon = styled('span')(({ color, theme }) => ({
  width: 44,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: theme.spacing(1.5),
  color: theme.vars.palette[color].main,
  borderRadius: theme.shape.borderRadius,
  backgroundColor: `rgba(${theme.vars.palette[color].mainChannel} / 0.16)`,
}));
