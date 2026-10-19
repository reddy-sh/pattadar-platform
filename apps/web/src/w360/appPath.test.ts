import { expect, test } from 'bun:test';
import { isAppPath } from './appPath';

test('known sections pass, with or without a tail', () => {
  for (const p of ['/home', '/properties', '/properties/0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b/location?draw=1',
    '/papers?folder=x', '/services/42/pay', '/order#top']) {
    expect(isAppPath(p)).toBe(true);
  }
});

test('other origins, schemes and look-alikes are refused', () => {
  for (const p of ['', '/', '//evil.example', '///evil.example', 'https://evil.example/home',
    'javascript:alert(1)', '/homeX', '/home\\evil.example', '/legacy/passbooks', '/app/properties',
    'home', '/%2F/evil.example', null, undefined]) {
    expect(isAppPath(p)).toBe(false);
  }
});
