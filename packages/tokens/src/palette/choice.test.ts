import { describe, expect, test } from 'bun:test';

import { applyChoice, choiceOf, LEGACY_THEME_KEYS, menuItems, THEME_STORAGE, themeDefaults } from './choice';
import { isSchemeId, type SchemeId } from './registry';

describe('themeDefaults', () => {
  test('the web opens in Dark; each mode slot starts on its own built-in scheme', () => {
    expect(themeDefaults('web')).toEqual({ scheme: 'dark', mode: 'dark', light: 'light', dark: 'dark' });
  });

  test('University opens in Light', () => {
    expect(themeDefaults('university')).toEqual({ scheme: 'light', mode: 'light', light: 'light', dark: 'dark' });
  });
});

describe('choiceOf', () => {
  test('reads the active scheme', () => {
    expect(choiceOf({ mode: 'light', colorScheme: 'highContrast' })).toBe('highContrast');
    expect(choiceOf({ mode: 'dark', colorScheme: 'dark' })).toBe('dark');
  });

  test('falls back to the mode slot, then to the app default, for anything unregistered', () => {
    expect(choiceOf({ mode: 'light', colorScheme: 'sepia' })).toBe('light');
    expect(choiceOf({ mode: 'dark', colorScheme: undefined })).toBe('dark');
    expect(choiceOf({})).toBe('dark');
    expect(choiceOf({}, 'university')).toBe('light');
  });
});

describe('applyChoice', () => {
  const record = () => {
    const calls: unknown[][] = [];
    return {
      calls,
      setters: {
        setMode: (m: 'light' | 'dark') => { calls.push(['mode', m]); },
        setColorScheme: (v: { light: SchemeId } | { dark: SchemeId }) => { calls.push(['scheme', v]); },
      },
    };
  };

  test('a dark scheme goes into the dark slot, then the mode turns dark', () => {
    const { calls, setters } = record();
    applyChoice('dark', setters);
    expect(calls).toEqual([['scheme', { dark: 'dark' }], ['mode', 'dark']]);
  });

  test('High Contrast is a light-mode scheme', () => {
    const { calls, setters } = record();
    applyChoice('highContrast', setters);
    expect(calls).toEqual([['scheme', { light: 'highContrast' }], ['mode', 'light']]);
  });

  test('so is Light', () => {
    const { calls, setters } = record();
    applyChoice('light', setters);
    expect(calls).toEqual([['scheme', { light: 'light' }], ['mode', 'light']]);
  });

  test('and so is Pattadar Gold, which takes the light slot from Light', () => {
    const { calls, setters } = record();
    applyChoice('pattadar', setters);
    expect(calls).toEqual([['scheme', { light: 'pattadar' }], ['mode', 'light']]);
    expect(choiceOf({ mode: 'light', colorScheme: 'pattadar' })).toBe('pattadar');
  });
});

describe('menuItems', () => {
  test('lists the registered menu schemes in order, with their glyphs', () => {
    expect(menuItems()).toEqual([
      { id: 'light', label: 'Light', icon: 'light' },
      { id: 'dark', label: 'Dark', icon: 'dark' },
      { id: 'pattadar', label: 'Pattadar Gold', icon: 'gold' },
      { id: 'highContrast', label: 'High Contrast', icon: 'contrast' },
    ]);
  });
});

describe('storage keys', () => {
  test("are MUI's, as apps/web has always stored them", () => {
    expect(THEME_STORAGE).toEqual({
      mode: 'pattadar-mode-v2',
      scheme: 'pattadar-color-scheme-v1',
      migrated: 'pattadar-theme-migrated-v1',
    });
  });

  test('every older value maps onto a registered scheme', () => {
    for (const keys of Object.values(LEGACY_THEME_KEYS)) {
      for (const { values } of keys) for (const id of Object.values(values)) expect(isSchemeId(id)).toBe(true);
    }
  });
});
