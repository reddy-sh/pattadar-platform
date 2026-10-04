/**
 * The saved colour-scheme choice: where it is kept, what it defaults to, and
 * how a theme menu reads and changes it.
 *
 * MUI keeps the choice itself — a mode ('light' | 'dark') and, for each mode,
 * which of that mode's schemes is active — under the keys in THEME_STORAGE.
 * Every theme menu in an app goes through these functions, so W360, the
 * previous app and anything added later read and write one choice.
 * theme-init.js (init.ts) applies the same rules before the app has loaded.
 */
import { isSchemeId, menuSchemes, registry, schemeById, type SchemeIcon, type SchemeId } from './registry';

/** MUI's storage keys. MUI appends `-light` and `-dark` to `scheme`. Each app
 *  is on its own origin, so the same names never collide. */
export const THEME_STORAGE = {
  mode: 'pattadar-mode-v2',
  scheme: 'pattadar-color-scheme-v1',
  /** Set once the keys below have been carried into MUI's. */
  migrated: 'pattadar-theme-migrated-v1',
} as const;

/** Where each app kept its choice before MUI held it, and how its values map
 *  onto scheme ids. Read once (theme-init.js) and left in place for one
 *  release, so a rolled-back bundle still finds the choice it knew. */
export const LEGACY_THEME_KEYS = {
  web: [{ key: 'w360.scheme', values: { light: 'light', dark: 'dark', highContrast: 'highContrast' } }],
  university: [{ key: 'pattadar.university.theme', values: { light: 'light', dark: 'dark', contrast: 'highContrast' } }],
} as const satisfies Record<string, ReadonlyArray<{ key: string; values: Record<string, SchemeId> }>>;

export type ThemeApp = keyof typeof LEGACY_THEME_KEYS;

export interface ThemeDefaults {
  /** The scheme a first visit opens in. */
  scheme: SchemeId;
  /** Its mode, which is MUI's `defaultMode`. */
  mode: 'light' | 'dark';
  /** What each mode slot holds before anybody has chosen. */
  light: SchemeId;
  dark: SchemeId;
}

/** What an app shows before anybody has chosen, from the registry. */
export function themeDefaults(app: ThemeApp): ThemeDefaults {
  const entry = schemeById(registry.defaults[app]);
  return {
    scheme: entry.id,
    mode: entry.mode,
    light: entry.mode === 'light' ? entry.id : 'light',
    dark: entry.mode === 'dark' ? entry.id : 'dark',
  };
}

/** The scheme a MUI colour-scheme state is showing. */
export function choiceOf(state: { mode?: string; colorScheme?: string }, app: ThemeApp = 'web'): SchemeId {
  if (isSchemeId(state.colorScheme)) return state.colorScheme;
  const d = themeDefaults(app);
  if (state.mode === 'light') return d.light;
  if (state.mode === 'dark') return d.dark;
  return d.scheme;
}

export interface ColorSchemeSetters {
  setMode: (mode: 'light' | 'dark') => void;
  setColorScheme: (value: { light: SchemeId } | { dark: SchemeId }) => void;
}

/** Make `id` the active scheme, through MUI's own setters: the scheme goes
 *  into its mode's slot, then the mode switches to it. */
export function applyChoice(id: SchemeId, setters: ColorSchemeSetters): void {
  const { mode } = schemeById(id);
  setters.setColorScheme(mode === 'dark' ? { dark: id } : { light: id });
  setters.setMode(mode);
}

export interface ThemeMenuItem {
  id: SchemeId;
  label: string;
  icon: SchemeIcon;
}

/** What a theme menu lists, in order. */
export function menuItems(): ThemeMenuItem[] {
  return menuSchemes().map((s) => ({ id: s.id, label: s.label, icon: s.icon }));
}
