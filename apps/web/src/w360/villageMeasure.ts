import { haversineKm, ringAreaSqM, SQ_M_PER_ACRE } from '@pattadar/core';
import { checkBoundaryDraft } from './pages/boundaryDraft';

/** Two points are a distance; three or more are a closed parcel perimeter. */
export function measureVillageTape(ring: Array<[number, number]>) {
  const closed = ring.length >= 3;
  // A crossed outline still has a measurable path, but its signed area is
  // not an enclosed parcel and must not become a fencing estimate.
  const error = closed ? checkBoundaryDraft(ring).error : '';
  let metres = 0;
  const sides = closed ? ring.length : Math.max(0, ring.length - 1);
  for (let i = 0; i < sides; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    metres += haversineKm({ latitude: a[0], longitude: a[1] },
      { latitude: b[0], longitude: b[1] }) * 1000;
  }
  return {
    points: ring.length,
    metres,
    acres: closed && !error ? ringAreaSqM(ring) / SQ_M_PER_ACRE : null,
    error,
    ring: ring.map((p) => [...p] as [number, number]),
  };
}
