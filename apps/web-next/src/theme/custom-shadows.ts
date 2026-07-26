import { alpha } from '@mui/material/styles';

import { common } from './palette';
import { SHADOW_CHANNEL } from './shadows';

// ----------------------------------------------------------------------
// Minimals custom shadows. Scheme-adaptive via CSS variables: neutral
// shadows use `palette.shadowChannel`, colored shadows use the
// auto-generated `<color>.mainChannel` variables, so one definition is
// correct in both light and dark.
// ----------------------------------------------------------------------

export interface CustomShadows {
  z1?: string;
  z4?: string;
  z8?: string;
  z12?: string;
  z16?: string;
  z20?: string;
  z24?: string;
  primary?: string;
  secondary?: string;
  info?: string;
  success?: string;
  warning?: string;
  error?: string;
  card?: string;
  dialog?: string;
  dropdown?: string;
}

const colorShadow = (color: string) => `0 8px 16px 0 rgba(var(--mui-palette-${color}-mainChannel) / 0.24)`;

export function customShadows(): CustomShadows {
  const transparent = `rgba(${SHADOW_CHANNEL} / 0.16)`;

  return {
    z1: `0 1px 2px 0 ${transparent}`,
    z4: `0 4px 8px 0 ${transparent}`,
    z8: `0 8px 16px 0 ${transparent}`,
    z12: `0 12px 24px -4px ${transparent}`,
    z16: `0 16px 32px -4px ${transparent}`,
    z20: `0 20px 40px -4px ${transparent}`,
    z24: `0 24px 48px 0 ${transparent}`,
    //
    card: `0 0 2px 0 rgba(${SHADOW_CHANNEL} / 0.2), 0 12px 24px -4px rgba(${SHADOW_CHANNEL} / 0.12)`,
    dropdown: `0 0 2px 0 rgba(${SHADOW_CHANNEL} / 0.24), -20px 20px 40px -4px rgba(${SHADOW_CHANNEL} / 0.24)`,
    dialog: `-40px 40px 80px -8px ${alpha(common.black, 0.24)}`,
    //
    primary: colorShadow('primary'),
    info: colorShadow('info'),
    secondary: colorShadow('secondary'),
    success: colorShadow('success'),
    warning: colorShadow('warning'),
    error: colorShadow('error'),
  };
}
