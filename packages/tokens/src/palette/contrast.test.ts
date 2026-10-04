import { describe, expect, test } from 'bun:test';

import { composite, contrastRatio, parseColour, relativeLuminance, sameColour, toHex } from './contrast';

describe('parseColour', () => {
  test('reads every hex form and both rgb() syntaxes', () => {
    expect(parseColour('#abc')).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc, a: 1 });
    expect(parseColour('#AABBCC')).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc, a: 1 });
    expect(parseColour('#aabbcc80').a).toBeCloseTo(128 / 255, 5);
    expect(parseColour('#abcd').a).toBeCloseTo(0xdd / 255, 5);
    expect(parseColour('rgb(1, 2, 3)')).toEqual({ r: 1, g: 2, b: 3, a: 1 });
    expect(parseColour('rgba(170, 89, 16, 0.14)')).toEqual({ r: 170, g: 89, b: 16, a: 0.14 });
    expect(parseColour('rgb(1 2 3 / 50%)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
  });

  test('refuses what MUI cannot do channel maths on', () => {
    expect(() => parseColour('oklch(74% 0.18 55)')).toThrow();
    expect(() => parseColour('red')).toThrow();
    expect(() => parseColour('#12345')).toThrow();
    expect(() => parseColour('var(--w-accent)')).toThrow();
  });
});

describe('contrastRatio', () => {
  test('matches the WCAG reference pairs', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.5);
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5);
  });

  test('composites a translucent foreground over its background first', () => {
    // Half-black on white paints a mid grey (127.5), 3.98:1 against white.
    expect(contrastRatio('rgba(0, 0, 0, 0.5)', '#ffffff')).toBeCloseTo(3.98, 2);
    // A fully transparent foreground is invisible.
    expect(contrastRatio('rgba(0, 0, 0, 0)', '#ffffff')).toBeCloseTo(1, 5);
  });

  test('a translucent background is measured over white', () => {
    expect(contrastRatio('#000000', 'rgba(255, 255, 255, 0.5)')).toBeCloseTo(21, 5);
  });
});

describe('composite and toHex', () => {
  test('paints a wash the way a browser does', () => {
    const wash = composite(parseColour('rgba(170, 89, 16, 0.14)'), parseColour('#f9f6f2'));
    // 170·0.14 + 249·0.86 = 237.94 → ee; 89·0.14 + 246·0.86 = 224.02 → e0;
    // 16·0.14 + 242·0.86 = 210.36 → d2.
    expect(toHex(wash)).toBe('#eee0d2');
    expect(wash.a).toBe(1);
  });

  test('relative luminance anchors', () => {
    expect(relativeLuminance(parseColour('#ffffff'))).toBeCloseTo(1, 5);
    expect(relativeLuminance(parseColour('#000000'))).toBe(0);
  });

  test('sameColour tolerates only the steps it is told to', () => {
    expect(sameColour('#fff', '#ffffff')).toBe(true);
    expect(sameColour('#fe860f', '#ff860f')).toBe(false);
    expect(sameColour('#fe860f', '#ff860f', 1)).toBe(true);
    expect(sameColour('rgba(0, 0, 0, 0.87)', 'rgba(0,0,0,0.87)')).toBe(true);
    expect(sameColour('rgba(0, 0, 0, 0.5)', '#000000')).toBe(false);
  });
});
