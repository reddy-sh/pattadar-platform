/** Where an old Holdings link now lives. `/app/combined…` was the address
 *  until 03/10/2026; the id and tab after it are kept, and anything that only
 *  starts with the same letters (`/app/combinedx`) is left alone.
 *
 *  Its own module with no imports, because `routes.tsx` loads it eagerly and
 *  `holdingList.ts` would pull the whole of `ui.tsx` into the first chunk. */
export function holdingsPathFrom(pathname: string): string {
  return pathname.replace(/^\/app\/combined(?=\/|$)/, '/app/holdings');
}
