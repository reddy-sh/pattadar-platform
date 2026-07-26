import { sliderClasses } from '@mui/material/Slider';

// ----------------------------------------------------------------------

export function slider(theme) {
  return {
    MuiSlider: {
      styleOverrides: {
        root: {
          [`&.${sliderClasses.disabled}`]: {
            color: theme.vars.palette.action.disabled,
          },
        },
        rail: {
          opacity: 0.32,
        },
        markLabel: {
          fontSize: 13,
          color: theme.vars.palette.text.disabled,
        },
        valueLabel: {
          borderRadius: 8,
          backgroundColor: theme.palette.grey[800],
          ...theme.applyStyles('dark', {
            backgroundColor: theme.palette.grey[700],
          }),
        },
      },
    },
  };
}
