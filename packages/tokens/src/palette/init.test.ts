/**
 * theme-init.js, executed against a stand-in document and localStorage — the
 * same text the browser runs, not a re-implementation of it.
 */
import { describe, expect, test } from 'bun:test';

import { themeInitCss, themeInitSource } from './init';

type Store = Record<string, string>;

function run(
  app: 'web' | 'university',
  initial: Store,
  opts: { prefersDark?: boolean; brokenStorage?: boolean; url?: string } = {},
) {
  const store: Store = { ...initial };
  const href = opts.url ?? 'https://app.test/app';
  const replaced: string[] = [];
  const attrs: Record<string, string> = {};
  const styles: Array<{ attrs: Record<string, string>; textContent: string }> = [];
  const localStorage = {
    getItem: (k: string) => {
      if (opts.brokenStorage) throw new Error('SecurityError');
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
    },
    setItem: (k: string, v: string) => {
      if (opts.brokenStorage) throw new Error('SecurityError');
      store[k] = String(v);
    },
  };
  const window = {
    localStorage,
    matchMedia: (q: string) => ({ matches: q === '(prefers-color-scheme: dark)' && !!opts.prefersDark }),
    location: { href, search: new URL(href).search },
    history: { state: null, replaceState: (_s: unknown, _t: string, u: string) => { replaced.push(u); } },
  };
  const document = {
    documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } },
    createElement: () => {
      const el = { attrs: {} as Record<string, string>, textContent: '', setAttribute(k: string, v: string) { el.attrs[k] = v; } };
      return el;
    },
    head: { appendChild: (el: { attrs: Record<string, string>; textContent: string }) => { styles.push(el); } },
  };
  new Function('window', 'document', themeInitSource(app))(window, document);
  return { scheme: attrs['data-scheme'], store, styles, replaced };
}

const MODE = 'pattadar-mode-v2';
const LIGHT = 'pattadar-color-scheme-v1-light';
const DARK = 'pattadar-color-scheme-v1-dark';
const MIGRATED = 'pattadar-theme-migrated-v1';

describe('theme-init.js on the web', () => {
  test('a first visit opens in Dark and paints every scheme ground', () => {
    const r = run('web', {});
    expect(r.scheme).toBe('dark');
    expect(r.styles).toHaveLength(1);
    expect(r.styles[0].attrs).toEqual({ 'data-theme-init': '' });
    expect(r.styles[0].textContent).toBe(themeInitCss());
    expect(r.styles[0].textContent).toContain('html[data-scheme="dark"]{background-color:#0d0504;color-scheme:dark}');
    expect(r.styles[0].textContent).toContain('html[data-scheme="light"]{background-color:#f9f6f2;color-scheme:light}');
    expect(r.styles[0].textContent).toContain('html[data-scheme="highContrast"]{background-color:#ffffff;color-scheme:light}');
    expect(r.styles[0].textContent).toContain('html[data-scheme="pattadar"]{background-color:#eceeeb;color-scheme:light}');
    // Nothing to carry over; the marker is set so this never runs again.
    expect(r.store).toEqual({ [MIGRATED]: '1' });
  });

  test("carries W360's choice into MUI's keys once, and leaves the old key in place", () => {
    const r = run('web', { 'w360.scheme': 'highContrast' });
    expect(r.scheme).toBe('highContrast');
    expect(r.store).toEqual({ 'w360.scheme': 'highContrast', [MODE]: 'light', [LIGHT]: 'highContrast', [MIGRATED]: '1' });
  });

  test("W360's choice wins over what the previous app had saved", () => {
    const r = run('web', { 'w360.scheme': 'light', [MODE]: 'dark', [DARK]: 'dark' });
    expect(r.scheme).toBe('light');
    expect(r.store[MODE]).toBe('light');
    expect(r.store[LIGHT]).toBe('light');
  });

  test('once carried over, a later choice survives the old key being written again', () => {
    // The sealed e2e harness re-seeds w360.scheme before every load.
    const r = run('web', { 'w360.scheme': 'highContrast', [MIGRATED]: '1', [MODE]: 'dark', [DARK]: 'dark' });
    expect(r.scheme).toBe('dark');
    expect(r.store[MODE]).toBe('dark');
  });

  test("respects MUI's keys when there is nothing older", () => {
    expect(run('web', { [MODE]: 'light', [LIGHT]: 'light' }).scheme).toBe('light');
    expect(run('web', { [MODE]: 'light', [LIGHT]: 'highContrast' }).scheme).toBe('highContrast');
    expect(run('web', { [MODE]: 'light' }).scheme).toBe('light');
    expect(run('web', { [MODE]: 'dark' }).scheme).toBe('dark');
  });

  test("'system' follows the device", () => {
    expect(run('web', { [MODE]: 'system' }, { prefersDark: true }).scheme).toBe('dark');
    expect(run('web', { [MODE]: 'system' }, { prefersDark: false }).scheme).toBe('light');
  });

  test('never writes an unregistered or prototype value into the page', () => {
    expect(run('web', { [MODE]: 'light', [LIGHT]: 'toString' }).scheme).toBe('light');
    expect(run('web', { [MODE]: 'dark', [DARK]: '"><script>' }).scheme).toBe('dark');
    expect(run('web', { [MODE]: 'constructor' }).scheme).toBe('dark');
    const odd = run('web', { 'w360.scheme': 'constructor' });
    expect(odd.scheme).toBe('dark');
    expect(odd.store[MODE]).toBeUndefined();
  });

  test('refused storage leaves the default, without throwing', () => {
    const r = run('web', {}, { brokenStorage: true });
    expect(r.scheme).toBe('dark');
    expect(r.styles).toHaveLength(1);
  });

  test('?scheme= opens a registered scheme, saves it, and leaves the address', () => {
    const r = run('web', { [MODE]: 'dark', [DARK]: 'dark' }, { url: 'https://app.test/app/papers?scheme=pattadar&q=sy#top' });
    expect(r.scheme).toBe('pattadar');
    expect(r.store[MODE]).toBe('light');
    expect(r.store[LIGHT]).toBe('pattadar');
    // Taken off, everything else kept, so a reload shows the saved choice.
    expect(r.replaced).toEqual(['/app/papers?q=sy#top']);
  });

  test('?scheme= with anything but a registered id is ignored, and the address is left alone', () => {
    for (const asked of ['toString', '"><script>', 'constructor', 'gold', '']) {
      const r = run('web', { [MODE]: 'light', [LIGHT]: 'light' }, { url: `https://app.test/app?scheme=${encodeURIComponent(asked)}` });
      expect({ asked, scheme: r.scheme, replaced: r.replaced }).toEqual({ asked, scheme: 'light', replaced: [] });
      expect(r.store[LIGHT]).toBe('light');
    }
  });

  test('no ?scheme= leaves the address alone', () => {
    expect(run('web', {}, { url: 'https://app.test/app?q=sy' }).replaced).toEqual([]);
  });

  test('?scheme= still shows when storage is refused, for that page only', () => {
    const r = run('web', {}, { brokenStorage: true, url: 'https://app.test/app?scheme=highContrast' });
    expect(r.scheme).toBe('highContrast');
    expect(r.replaced).toEqual(['/app']);
  });
});

describe('theme-init.js on University', () => {
  test('a first visit opens in Light', () => {
    expect(run('university', {}).scheme).toBe('light');
  });

  test("University's old 'contrast' is High Contrast", () => {
    const r = run('university', { 'pattadar.university.theme': 'contrast' });
    expect(r.scheme).toBe('highContrast');
    expect(r.store[LIGHT]).toBe('highContrast');
  });
});

describe('the script text', () => {
  test('reads nothing from the URL but scheme, and touches no key but the theme keys', () => {
    const src = themeInitSource('web');
    expect(src).not.toMatch(/document\.cookie|fetch\(|XMLHttpRequest|eval\(|innerHTML|location\.(assign|replace)|location\s*=/);
    expect([...src.matchAll(/\.get\('([^']+)'\)/g)].map((m) => m[1])).toEqual(['scheme']);
    // Storage keys only: "pattadar" alone is a scheme id, not a key.
    const keys = new Set([...src.matchAll(/"([\w.-]+)"/g)].map((m) => m[1]).filter((k) => /^pattadar-|^w360\.scheme$/.test(k)));
    expect([...keys].sort()).toEqual(['pattadar-color-scheme-v1', 'pattadar-mode-v2', 'pattadar-theme-migrated-v1', 'w360.scheme']);
  });

  test('is ES2017: no optional chaining or nullish coalescing', () => {
    const src = themeInitSource('web');
    expect(src).not.toMatch(/\?\.|\?\?/);
    expect(() => new Function(src)).not.toThrow();
  });
});
