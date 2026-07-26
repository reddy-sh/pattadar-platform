// ----------------------------------------------------------------------

export function tooltip(theme) {
  return {
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: theme.palette.grey[800],
          ...theme.applyStyles('dark', {
            backgroundColor: theme.palette.grey[700],
          }),
        },
        arrow: {
          color: theme.palette.grey[800],
          ...theme.applyStyles('dark', {
            color: theme.palette.grey[700],
          }),
        },
      },
    },
  };
}
