import { useSyncExternalStore } from 'react';

/** CL-109: the FAB is portalled, so it floats above ANY sheet or modal unless
 * told otherwise. Every overlay sets this while open — the More sheet included,
 * which is how the FAB ended up sitting inside its icon grid. */
let open = false;
const listeners = new Set<() => void>();

export function setDrawerOpen(v: boolean) {
  open = v;
  listeners.forEach((l) => l());
}

export function useDrawerOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => open,
  );
}
