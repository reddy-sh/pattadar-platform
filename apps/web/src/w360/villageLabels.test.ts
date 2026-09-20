import { expect, test } from 'bun:test';
import { plotExtent, plotNumber } from './villageIndex';

test('every plot number a real village map carries survives unchanged', () => {
  for (const lp of ['262', '262/1', '12-A', '839/2A', '1.2', '262 A']) {
    expect(plotNumber(lp)).toBe(lp);
  }
  for (const ac of ['4.893', '0.25', '1,200.5']) {
    expect(plotExtent(ac)).toBe(ac.replace(',', ''));
  }
});

test('markup in an uploaded KMZ name cannot reach a label as markup', () => {
  expect(plotNumber('<img src=x onerror=alert(1)>')).toBe('img srcx onerroralert1');
  expect(plotNumber('<script>fetch("//e.example")</script>'))
    .toBe('scriptfetch//e.example/script');
  expect(plotNumber('262" onmouseover="steal()')).toBe('262 onmouseoversteal');
  expect(plotExtent('4.9<svg onload=alert(1)>')).toBe('4.9svg onloadale');
  for (const hostile of ['<', '>', '"', "'", '&', '`', '=', '(', ')']) {
    expect(plotNumber(`262${hostile}`)).toBe('262');
  }
});

test('a name long enough to paper over the map is cut, and a missing one is empty', () => {
  expect(plotNumber('9'.repeat(400))).toHaveLength(32);
  expect(plotExtent('9'.repeat(400))).toHaveLength(16);
  expect(plotNumber(undefined)).toBe('');
  expect(plotNumber(null)).toBe('');
  expect(plotExtent(undefined)).toBe('');
});
