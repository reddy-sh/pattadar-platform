import { switchClasses } from '@mui/material/Switch';

import { varAlpha } from '../../css';

const GREY_CHANNEL = '145 158 171'; // grey[500], scheme-invariant

// ----------------------------------------------------------------------

export function switches(theme) {
  const rootStyles = (ownerState) => {
    const { color } = ownerState;

    return {
      width: 58,
      height: 38,
      padding: '9px 13px 9px 12px',
      [`& .${switchClasses.thumb}`]: {
        width: 14,
        height: 14,
        boxShadow: 'none',
        color: theme.palette.common.white,
      },
      [`& .${switchClasses.track}`]: {
        opacity: 1,
        borderRadius: 14,
        backgroundColor: varAlpha(GREY_CHANNEL, 0.48),
      },
      [`& .${switchClasses.switchBase}`]: {
        left: 3,
        padding: 12,
        [`&.${switchClasses.checked}`]: {
          transform: 'translateX(13px)',
          [`& .${switchClasses.thumb}`]: {
            ...(color === 'default' &&
              theme.applyStyles('dark', {
                color: theme.palette.grey[800],
              })),
          },
          [`&+.${switchClasses.track}`]: {
            opacity: 1,
            ...(color === 'default' && {
              backgroundColor: theme.vars.palette.text.primary,
            }),
          },
        },
        [`&.${switchClasses.disabled}`]: {
          [`& .${switchClasses.thumb}`]: {
            opacity: 1,
            ...theme.applyStyles('dark', {
              opacity: 0.48,
            }),
          },
          [`&+.${switchClasses.track}`]: {
            opacity: 0.48,
          },
        },
      },
      // Small
      [`&.${switchClasses.sizeSmall}`]: {
        padding: '4px 8px 4px 7px',
        width: 40,
        height: 24,
        [`& .${switchClasses.thumb}`]: {
          width: 10,
          height: 10,
        },
        [`& .${switchClasses.switchBase}`]: {
          padding: 7,
          [`&.${switchClasses.checked}`]: {
            transform: 'translateX(9px)',
          },
        },
      },
    };
  };

  return {
    MuiSwitch: {
      styleOverrides: {
        root: ({ ownerState }) => rootStyles(ownerState),
      },
    },
  };
}
