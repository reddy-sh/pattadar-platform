import { schemeById } from '@pattadar/tokens';
import { useThemeChoice } from '../useThemeChoice';

/**
 * The active scheme's six categorical chart series, in its fixed slot order
 * (never cycled): 1 brand · 2 teal · 3 coral · 4 green · 5 plum · 6 slate.
 * Read from the scheme itself, so Pattadar Gold and High Contrast get their
 * own (today Light's validated series) rather than whatever their mode has.
 */
export function useChartColors(): readonly string[] {
  return schemeById(useThemeChoice().choice).palette.chart;
}

/** Status hues (good/warning/serious/critical) — reserved, never series colors. */
export function useStatusColors() {
  return schemeById(useThemeChoice().choice).palette.status;
}
