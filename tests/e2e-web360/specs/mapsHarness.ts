import type { APIRequestContext, Locator } from '@playwright/test';
export { test, expect, BLANK_TILE } from './harness';

export async function mapsGql(request: APIRequestContext, query: string, variables: Record<string, unknown> = {}) {
  const response = await request.post('/api/gateway/pattadar/graphql', { data: { query, variables } });
  if (!response.ok()) throw new Error(`Maps GraphQL returned ${response.status()}`);
  const result = await response.json();
  if (result.errors?.length) throw new Error(JSON.stringify(result.errors));
  return result.data.web;
}

export async function createMapRecord(request: APIRequestContext, overrides: Record<string, unknown> = {}): Promise<string> {
  const result = await mapsGql(request,
    'mutation($input:RecordInput!) { web { saveRecord(input:$input) } }', {
      input: {
        kind: 'parcel', title: `Maps test ${Date.now()}`, classification: 'agri',
        status: 'owned', stake: 'owned', ownerName: 'Maps regression',
        village: 'Maps fixture', mandal: 'Map test mandal', district: 'Map test district',
        extent: 1, extentUnit: 'ac', ...overrides,
      },
    });
  return result.saveRecord;
}

export async function deleteMapRecords(request: APIRequestContext, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await mapsGql(request, 'mutation($ids:[String!]!) { web { deleteRecords(ids:$ids) } }', { ids });
}

export async function readMapBoundary(request: APIRequestContext, id: string): Promise<number[]> {
  const result = await mapsGql(request, 'query($id:String!) { web { boundary(recordId:$id) { ring } } }', { id });
  return result.boundary.ring;
}

/**
 * The bounding box of a map element once it has stopped moving.
 *
 * Entering redraw calls `map.fitBounds`, and Leaflet animates that — `FIT` in
 * MapCanvas.tsx sets no `animate: false`. A corner marker exists as soon as the
 * draft renders, so `toHaveCount(4)` resolves while the frame is still sliding
 * underneath it. Pixel coordinates taken at that instant are a snapshot of an
 * animation, which is why a drag measured against them was off by a few pixels
 * in a full run and exact when the spec ran alone.
 */
export async function restingBox(locator: Locator) {
  let previous = await locator.boundingBox();
  for (let attempt = 0; attempt < 40; attempt++) {
    await locator.page().waitForTimeout(50);
    const current = await locator.boundingBox();
    if (previous && current
        && Math.abs(current.x - previous.x) < 0.5
        && Math.abs(current.y - previous.y) < 0.5) return current;
    previous = current;
  }
  throw new Error('The map never stopped moving, so no pixel measurement is trustworthy.');
}
