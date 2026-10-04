/**
 * University's colour-scheme choice: the same one the web app keeps, read and
 * changed through the palette pack's functions (packages/tokens choice.ts).
 * MUI holds it under THEME_STORAGE and writes it to <html data-scheme>;
 * theme-init.js put it there before this bundle loaded, and carried the old
 * `pattadar.university.theme` key (its 'contrast' is High Contrast) into it
 * once.
 */
import { useColorScheme } from '@mui/material/styles';
import { applyChoice, choiceOf, menuItems, type SchemeId, type ThemeMenuItem } from '@pattadar/tokens';

/** The switcher's own words where they differ from the registry's: it has
 *  always said "High contrast" (copy freeze). */
const LABEL: Partial<Record<SchemeId, string>> = { highContrast: 'High contrast' };

export interface ThemeChoice {
  /** The scheme showing now. */
  choice: SchemeId;
  /** Switch to `id`, and save it. */
  choose: (id: SchemeId) => void;
  /** What the switcher offers, in the registry's order. */
  options: ThemeMenuItem[];
}

export function useThemeChoice(): ThemeChoice {
  const { mode, colorScheme, setMode, setColorScheme } = useColorScheme();
  return {
    choice: choiceOf({ mode, colorScheme }, 'university'),
    choose: (id) => applyChoice(id, { setMode, setColorScheme }),
    options: menuItems().map((o) => ({ ...o, label: LABEL[o.id] ?? o.label })),
  };
}
