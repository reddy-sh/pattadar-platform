import { drawerClasses } from '@mui/material/Drawer';

import { paper } from '../../css';

// ----------------------------------------------------------------------

export function drawer(theme) {
  const shadowColor = `rgba(${theme.vars.palette.shadowChannel} / 0.24)`;

  return {
    MuiDrawer: {
      styleOverrides: {
        root: ({ ownerState }) => ({
          ...(ownerState.variant === 'temporary' && {
            [`& .${drawerClasses.paper}`]: {
              ...paper({ theme }),
              ...(ownerState.anchor === 'left' && {
                boxShadow: `40px 40px 80px -8px ${shadowColor}`,
              }),
              ...(ownerState.anchor === 'right' && {
                boxShadow: `-40px 40px 80px -8px ${shadowColor}`,
              }),
            },
          }),
        }),
      },
    },
  };
}
