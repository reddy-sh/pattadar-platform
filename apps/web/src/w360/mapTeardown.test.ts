import { expect, test } from 'bun:test';

import { removeMap } from './mapTeardown';

test('a map removed mid-zoom is stopped and its zoom-end timer disarmed first', () => {
  const calls: string[] = [];
  const map = {
    _animatingZoom: true,
    stop() { calls.push('stop'); },
    off() { calls.push('off'); },
    remove() { calls.push(`remove animating=${this._animatingZoom}`); },
  };
  removeMap(map);
  expect(calls).toEqual(['stop', 'off', 'remove animating=false']);
  // Leaflet's pending _onZoomTransitionEnd returns early on this flag.
  expect(map._animatingZoom).toBe(false);
});

test('nothing to remove is not an error', () => {
  expect(() => removeMap(null)).not.toThrow();
});
