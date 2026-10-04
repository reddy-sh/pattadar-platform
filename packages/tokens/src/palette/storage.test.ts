import { describe, expect, test } from 'bun:test';

import { themeStorageManager } from './storage';

function fakeWindow(initial: Record<string, string> = {}, refuse = false) {
  const store = { ...initial };
  const listeners: Array<(e: { key: string; newValue: string | null }) => void> = [];
  return {
    store,
    fire: (key: string, newValue: string | null) => listeners.forEach((l) => l({ key, newValue })),
    win: {
      localStorage: {
        getItem: (k: string) => { if (refuse) throw new Error('SecurityError'); return k in store ? store[k] : null; },
        setItem: (k: string, v: string) => { if (refuse) throw new Error('SecurityError'); store[k] = v; },
      },
      addEventListener: (_: string, l: (e: { key: string; newValue: string | null }) => void) => { listeners.push(l); },
      removeEventListener: (_: string, l: (e: { key: string; newValue: string | null }) => void) => {
        listeners.splice(listeners.indexOf(l), 1);
      },
    } as unknown as Window,
  };
}

describe('themeStorageManager', () => {
  test("hands University its own defaults: Light", () => {
    const { win } = fakeWindow();
    const manager = themeStorageManager('university');
    expect(manager({ key: 'pattadar-mode-v2', storageWindow: win }).get('dark')).toBe('light');
    expect(manager({ key: 'pattadar-color-scheme-v1-light', storageWindow: win }).get('x')).toBe('light');
  });

  test("hands MUI the registry's defaults when nothing is saved", () => {
    const { win } = fakeWindow();
    const manager = themeStorageManager('web');
    expect(manager({ key: 'pattadar-mode-v2', storageWindow: win }).get('light')).toBe('dark');
    expect(manager({ key: 'pattadar-color-scheme-v1-light', storageWindow: win }).get('x')).toBe('light');
    expect(manager({ key: 'pattadar-color-scheme-v1-dark', storageWindow: win }).get('x')).toBe('dark');
  });

  test('a saved value wins, and set writes plain strings', () => {
    const { win, store } = fakeWindow({ 'pattadar-color-scheme-v1-light': 'highContrast' });
    const light = themeStorageManager('web')({ key: 'pattadar-color-scheme-v1-light', storageWindow: win });
    expect(light.get('light')).toBe('highContrast');
    light.set('light');
    expect(store['pattadar-color-scheme-v1-light']).toBe('light');
  });

  test('a refused storage reads as the default and writes nothing, without throwing', () => {
    const { win } = fakeWindow({}, true);
    const mode = themeStorageManager('web')({ key: 'pattadar-mode-v2', storageWindow: win });
    expect(mode.get('light')).toBe('dark');
    expect(() => mode.set('light')).not.toThrow();
  });

  test("another tab's change to this key reaches the subscriber, and unsubscribing stops it", () => {
    const { win, fire } = fakeWindow();
    const seen: unknown[] = [];
    const unsubscribe = themeStorageManager('web')({ key: 'pattadar-mode-v2', storageWindow: win }).subscribe((v) => seen.push(v));
    fire('pattadar-mode-v2', 'light');
    fire('somebody-else', 'x');
    unsubscribe();
    fire('pattadar-mode-v2', 'dark');
    expect(seen).toEqual(['light']);
  });
});
