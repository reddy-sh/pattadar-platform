/**
 * Column widths for the assistant's split view (conversations · thread ·
 * results). The reader drags the two separators; the thread never drops
 * below its readable minimum, on a drag or a window resize.
 */
export const SPLIT_SIDEBAR_MIN = 200;
export const SPLIT_SIDEBAR_MAX = 400;
export const SPLIT_SIDEBAR_DEFAULT = 264;
export const SPLIT_PANE_MIN = 360;
export const SPLIT_THREAD_MIN = 420;
/** The backdrop gap around and between the rounded panes; each separator sits in one. */
export const SPLIT_GUTTER = 10;
export const SPLIT_STEP = 16;
const SPLIT_KEY = 'pattadar.assistant.splitWidths';

/** `pane: null` follows the default (46% of the room, never under the thread minimum). */
export type SplitWidths = { sidebar: number; pane: number | null };

export type SplitFit = { sidebar: number; sidebarMax: number; pane: number; paneMax: number };

const clamp = (value: number, min: number, max: number) => Math.round(Math.min(Math.max(value, min), Math.max(min, max)));

/** The widths to draw in a grid `container` px wide, gutters included. */
export function fitSplit(saved: SplitWidths, container: number, sidebarShown: boolean, paneShown: boolean): SplitFit {
  const room = container - SPLIT_GUTTER * (2 + (sidebarShown ? 1 : 0) + (paneShown ? 1 : 0));
  const sidebarMax = Math.min(SPLIT_SIDEBAR_MAX, room - SPLIT_THREAD_MIN - (paneShown ? SPLIT_PANE_MIN : 0));
  const sidebar = clamp(saved.sidebar, SPLIT_SIDEBAR_MIN, sidebarMax);
  const paneMax = room - (sidebarShown ? sidebar : 0) - SPLIT_THREAD_MIN;
  const pane = clamp(saved.pane ?? Math.max(SPLIT_THREAD_MIN, room * 0.46), SPLIT_PANE_MIN, paneMax);
  return { sidebar, sidebarMax: Math.max(SPLIT_SIDEBAR_MIN, sidebarMax), pane, paneMax: Math.max(SPLIT_PANE_MIN, paneMax) };
}

export function savedSplitWidths(): SplitWidths {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SPLIT_KEY) ?? 'null') as Partial<SplitWidths> | null;
    return {
      sidebar: typeof parsed?.sidebar === 'number' ? parsed.sidebar : SPLIT_SIDEBAR_DEFAULT,
      pane: typeof parsed?.pane === 'number' ? parsed.pane : null,
    };
  } catch {
    return { sidebar: SPLIT_SIDEBAR_DEFAULT, pane: null };
  }
}

export function saveSplitWidths(widths: SplitWidths) {
  try {
    window.localStorage.setItem(SPLIT_KEY, JSON.stringify(widths));
  } catch {
    // Per-browser convenience only; the defaults are fine without storage.
  }
}
