import { chartCategorical, status } from '@pattadar/tokens';
import { useSchemeMode } from '../useSchemeMode';

/**
 * Validated categorical chart palette for the active scheme.
 * Fixed slot order (never cycled): emerald, gold, teal, terracotta, plum, slate.
 */
export function useChartColors(): readonly string[] {
  const mode = useSchemeMode();
  return chartCategorical[mode];
}

/** Status hues (good/warning/serious/critical) — reserved, never series colors. */
export function useStatusColors() {
  const mode = useSchemeMode();
  return status[mode];
}
