import { useColorScheme } from '@mui/material/styles';

/** Effective color scheme ('light' | 'dark'), resolving mode 'system'. */
export function useSchemeMode(): 'light' | 'dark' {
  const { mode, systemMode } = useColorScheme();
  const m = mode === 'system' ? systemMode : mode;
  return m === 'dark' ? 'dark' : 'light';
}
