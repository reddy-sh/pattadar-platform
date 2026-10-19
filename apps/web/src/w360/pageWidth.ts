/** The viewer's page width — Centred (default) or Full-width — per device
 *  (design.md § One frame). One store, so the theme menu in Shell and the
 *  Display card on Profile change the same value and each redraws the other
 *  at once; a `useState` per screen only met again after a reload. */
import { useSyncExternalStore } from 'react';

export type PageWidth = 'centred' | 'full';
const KEY = 'w360.width';
const listeners = new Set<() => void>();

const read = (): PageWidth => {
  try { return localStorage.getItem(KEY) === 'full' ? 'full' : 'centred'; } catch { return 'centred'; }
};
let current = read();

export function setPageWidth(w: PageWidth): void {
  current = w;
  try { localStorage.setItem(KEY, w); } catch { /* the choice still holds for this visit */ }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const usePageWidth = (): PageWidth =>
  useSyncExternalStore(subscribe, () => current, () => 'centred');
