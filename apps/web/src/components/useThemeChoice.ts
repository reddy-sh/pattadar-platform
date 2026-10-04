/**
 * The one colour-scheme choice, for every theme menu in the app.
 *
 * W360's top bar and the previous app's shell both read and change the choice
 * through this hook, so they cannot disagree: MUI holds it (THEME_STORAGE),
 * the provider writes it to <html data-scheme>, and every MUI surface —
 * including the ones portalled to <body> — wears it. The menu's entries, their
 * order and their labels come from the palette registry.
 */
import { useColorScheme } from '@mui/material/styles';
import { applyChoice, choiceOf, menuItems, type SchemeId, type ThemeMenuItem } from '@pattadar/tokens';

export interface ThemeChoice {
  /** The scheme showing now. */
  choice: SchemeId;
  /** Switch to `id`, and save it. */
  choose: (id: SchemeId) => void;
  /** What the menu offers, in order. */
  options: ThemeMenuItem[];
}

export function useThemeChoice(): ThemeChoice {
  const { mode, colorScheme, setMode, setColorScheme } = useColorScheme();
  return {
    choice: choiceOf({ mode, colorScheme }),
    choose: (id) => applyChoice(id, { setMode, setColorScheme }),
    options: menuItems(),
  };
}
