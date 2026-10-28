/** Extent: a cadastral parcel shaded by its size. Shared by both maps — the
 *  Maps page (VillageCanvas) and a property's Maps tab (MapCanvas) — and by
 *  the key (ParcelKeys), so it holds no Leaflet and the keys never pull the
 *  map chunk in.
 *
 *  Plot size, in one hue light-to-dark — the encoding for a magnitude. Steps
 *  are the validated blue ramp, ordered dim-to-bright because they are read
 *  against imagery rather than paper: on dark ground the darkest step is the
 *  one that recedes (which is why Extent shows on Satellite only — see
 *  mapLayers.ts). Blue and not the accent, so a shaded parcel is never
 *  mistaken for the selected one. Each clears AA against the imagery beneath;
 *  the pair is checked by scripts/contrast-tests.ts. */
export const BANDS: Array<{ key: string; label: string; hex: string; min: number }> = [
  { key: 'xs', label: 'Under 1 ac', hex: '#184f95', min: 0 },
  { key: 's', label: '1 – 3 ac', hex: '#256abf', min: 1 },
  { key: 'm', label: '3 – 10 ac', hex: '#5598e7', min: 3 },
  { key: 'l', label: '10 ac and over', hex: '#b7d3f6', min: 10 },
];

export const bandOf = (acres: number) =>
  BANDS[acres >= 10 ? 3 : acres >= 3 ? 2 : acres >= 1 ? 1 : 0];
