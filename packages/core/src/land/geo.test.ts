import { describe, expect, test } from 'bun:test';
import { navigateLink, pointInRing } from './geo';

// FIELD_01 in the seed: a real Prakasam coordinate, not a made-up one.
const FIELD = { latitude: 15.662204, longitude: 79.321775 };

describe('navigateLink — Navigate opens Google Maps directions', () => {
  test('is a Google Maps directions URL to the point', () => {
    expect(navigateLink(FIELD)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=15.662204,79.321775',
    );
  });

  test('trims float noise to six decimals', () => {
    expect(navigateLink({ latitude: 15.66026000000001, longitude: 79.3 })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=15.66026,79.3',
    );
  });

  test('carries the coordinate only — no label, search, origin or travel mode', () => {
    const url = navigateLink(FIELD);
    expect(url).not.toContain('q=');
    expect(url).not.toContain('origin');
    expect(url).not.toContain('travelmode');
    expect(new URL(url).searchParams.get('destination')).toBe('15.662204,79.321775');
  });

  test('is empty for a point that is not a place', () => {
    expect(navigateLink({ latitude: NaN, longitude: 79.3 })).toBe('');
    expect(navigateLink({ latitude: 15.6, longitude: Infinity })).toBe('');
    expect(navigateLink({ latitude: 0, longitude: 0 })).toBe('');
  });
});

describe('pointInRing', () => {
  const square = [
    { latitude: 15.0, longitude: 79.0 },
    { latitude: 15.0, longitude: 79.01 },
    { latitude: 15.01, longitude: 79.01 },
    { latitude: 15.01, longitude: 79.0 },
  ];
  test('inside', () => {
    expect(pointInRing({ latitude: 15.005, longitude: 79.005 }, square)).toBe(true);
  });
  test('outside', () => {
    expect(pointInRing({ latitude: 15.02, longitude: 79.005 }, square)).toBe(false);
  });
});
