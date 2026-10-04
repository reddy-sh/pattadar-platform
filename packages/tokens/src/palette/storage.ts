/**
 * MUI's colour-scheme storage, with the palette registry's defaults — the
 * `storageManager` apps/web and apps/university both give their
 * ThemeProvider.
 *
 * MUI falls back to 'light' and 'dark' for its two mode slots when nothing has
 * been saved. This hands it the registry's own defaults instead, the same ones
 * theme-init.js applies before the bundle loads, so the first paint and MUI's
 * first render always agree — including the day an app's default becomes a
 * scheme of its own. Otherwise it behaves like MUI's localStorage manager:
 * plain strings, a refused storage is silently skipped, and another tab's
 * change arrives through the `storage` event. It imports nothing from MUI.
 */
import { THEME_STORAGE, themeDefaults, type ThemeApp } from './choice';

interface StorageManagerOptions {
  key: string;
  storageWindow?: Window | null;
}

export function themeStorageManager(app: ThemeApp) {
  const d = themeDefaults(app);
  const fallback: Record<string, string> = {
    [THEME_STORAGE.mode]: d.mode,
    [`${THEME_STORAGE.scheme}-light`]: d.light,
    [`${THEME_STORAGE.scheme}-dark`]: d.dark,
  };
  return ({ key, storageWindow }: StorageManagerOptions) => {
    const win = storageWindow ?? (typeof window === 'undefined' ? undefined : window);
    return {
      get(defaultValue: unknown) {
        if (!win) return defaultValue;
        let value: string | null = null;
        try { value = win.localStorage.getItem(key); } catch { /* storage refused */ }
        return value || fallback[key] || defaultValue;
      },
      set(value: unknown) {
        if (!win) return;
        try { win.localStorage.setItem(key, String(value)); } catch { /* storage refused */ }
      },
      subscribe(handler: (value: unknown) => void) {
        if (!win) return () => {};
        const listener = (event: StorageEvent) => {
          if (event.key === key) handler(event.newValue);
        };
        win.addEventListener('storage', listener);
        return () => win.removeEventListener('storage', listener);
      },
    };
  };
}
