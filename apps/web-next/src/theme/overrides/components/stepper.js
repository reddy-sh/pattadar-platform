// ----------------------------------------------------------------------

export function stepper(theme) {
  return {
    MuiStepConnector: {
      styleOverrides: {
        line: {
          borderColor: theme.vars.palette.divider,
        },
      },
    },
  };
}
