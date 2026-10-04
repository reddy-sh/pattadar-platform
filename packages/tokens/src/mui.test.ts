/**
 * The adapter, with a stand-in for MUI's createTheme. apps/web/src/theme.test.ts
 * runs the same path through the real MUI.
 */
import { describe, expect, test } from 'bun:test';

import { muiColorSchemes, muiPaletteInput } from './mui';
import { registry, schemeById } from './palette/registry';

/** Stands in for createTheme: echoes the input with the defaults MUI adds. */
const calls: Array<Record<string, unknown>> = [];
const fakeCreateTheme = (options: { palette: Record<string, any> }) => {
  calls.push(options.palette);
  const augment = (c: Record<string, string>) => ({ ...c, light: `${c.main}-light`, dark: `${c.main}-dark` });
  const p = options.palette;
  return {
    palette: {
      ...p,
      common: { black: '#000', white: '#fff' },
      grey: { 100: '#f5f5f5' },
      action: { hover: 'x' },
      primary: augment(p.primary), secondary: augment(p.secondary), error: augment(p.error),
      warning: augment(p.warning), info: augment(p.info), success: augment(p.success),
    },
  };
};

describe('muiPaletteInput', () => {
  test('maps the roles onto MUI slots', () => {
    const light = schemeById('light');
    expect(muiPaletteInput(light)).toEqual({
      mode: 'light',
      primary: { main: '#aa5910', contrastText: '#ffffff' },
      secondary: { main: '#b23645', contrastText: '#ffffff' },
      error: { main: '#be222a', contrastText: '#ffffff' },
      warning: { main: '#905d00', contrastText: '#ffffff' },
      info: { main: '#3d6a7f', contrastText: '#ffffff' },
      success: { main: '#27762f', contrastText: '#ffffff' },
      background: { default: '#f9f6f2', paper: '#fdfcf9' },
      text: { primary: '#261d1a', secondary: '#615956' },
      divider: '#e3ddd8',
    });
  });
});

describe('muiColorSchemes', () => {
  calls.length = 0;
  const schemes = muiColorSchemes(registry, fakeCreateTheme);

  test('builds every registered scheme through createTheme, custom ones included', () => {
    expect(Object.keys(schemes).sort()).toEqual(registry.schemes.map((s) => s.id).sort());
    expect(calls.map((c) => c.mode)).toEqual(registry.schemes.map((s) => s.mode));
  });

  test("keeps what createTheme filled in and adds the pack's own roles", () => {
    for (const entry of registry.schemes) {
      const p = schemes[entry.id].palette as unknown as Record<string, any>;
      expect(p.common).toEqual({ black: '#000', white: '#fff' });
      expect(p.grey[100]).toBe('#f5f5f5');
      expect(p.action.hover).toBe('x');
      expect(p.primary.light).toBe(`${entry.palette.accent}-light`);
      expect(p.primary.container).toBe(entry.palette.accentWash);
      expect(p.primary.onContainer).toBe(entry.palette.onAccentWash);
      expect(p.secondary.container).toBe(entry.palette.secondaryWash);
      expect(p.secondary.onContainer).toBe(entry.palette.onSecondaryWash);
      expect(p.error.container).toBe(entry.palette.dangerWash);
      expect(p.background).toEqual({ default: entry.palette.ground, paper: entry.palette.surface, raised: entry.palette.raised });
      expect(p.text).toEqual({ primary: entry.palette.ink, secondary: entry.palette.ink2, muted: entry.palette.ink3 });
      expect(p.dividerStrong).toBe(entry.palette.lineStrong);
      expect(p.focus).toBe(entry.palette.focus);
      expect(p.focusHalo).toBe(entry.palette.focusHalo);
      expect(p.chrome).toEqual(entry.palette.chrome);
      expect(p.decor).toEqual(entry.palette.decor);
    }
  });

  test('the chrome and decor it emits are copies, not the pack objects', () => {
    const dark = schemes.dark.palette as unknown as Record<string, any>;
    expect(dark.chrome).not.toBe(schemeById('dark').palette.chrome);
    expect(dark.decor).not.toBe(schemeById('dark').palette.decor);
    expect(Object.hasOwn(schemes.light.palette, 'decor')).toBe(false);
  });
});
