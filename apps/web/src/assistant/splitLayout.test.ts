import { expect, test } from 'bun:test';
import { SPLIT_GUTTER, SPLIT_PANE_MIN, SPLIT_THREAD_MIN, fitSplit } from './splitLayout';

const thread = (container: number, fit: ReturnType<typeof fitSplit>, sidebar: boolean, pane: boolean) =>
  container - SPLIT_GUTTER * (2 + (sidebar ? 1 : 0) + (pane ? 1 : 0)) - (sidebar ? fit.sidebar : 0) - (pane ? fit.pane : 0);

test('a wide results pane is capped so the thread keeps 420px', () => {
  const fit = fitSplit({ sidebar: 264, pane: 5000 }, 1600, true, true);
  expect(thread(1600, fit, true, true)).toBe(SPLIT_THREAD_MIN);
  expect(fit.pane).toBe(fit.paneMax);
});

test('a window shrunk after a drag clamps the saved widths, never the thread', () => {
  const fit = fitSplit({ sidebar: 400, pane: 900 }, 1200, true, true);
  expect(fit.pane).toBeGreaterThanOrEqual(SPLIT_PANE_MIN);
  expect(thread(1200, fit, true, true)).toBeGreaterThanOrEqual(SPLIT_THREAD_MIN);
});

test('defaults: sidebar as saved, pane 46% of the room and never under 420px', () => {
  const fit = fitSplit({ sidebar: 264, pane: null }, 1600, false, true);
  expect(fit.pane).toBe(Math.round((1600 - 3 * SPLIT_GUTTER) * 0.46));
  expect(fitSplit({ sidebar: 100, pane: 10 }, 1600, true, true)).toMatchObject({ sidebar: 200, pane: SPLIT_PANE_MIN });
});
