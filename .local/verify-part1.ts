/**
 * Part-1 live gate: run the two pages' underlying GraphQL queries through the
 * Vite dev proxy (http://localhost:5173 → pattadar API :8080, x-user-id
 * injected by the proxy) and assert the founder's real numbers:
 *   passbooks = 5, parcels = 32, and the computed header extent string from
 *   the @pattadar/core formatArea port = "102 Acres 81 Cents".
 *
 * Run: bun .local/verify-part1.ts
 */
import { formatArea } from '../packages/core/src/index';

const PROXY = 'http://localhost:5173/api/gateway/pattadar/graphql';

// Exact query used by usePassbooks (apps/web/src/data/hooks.ts).
const PASSBOOKS_QUERY = `query { passbooks { id ref ownerUserId pattadarNo ownerName fatherHusbandName state district mandal village photo totalExtent groupId createdAt } parcels { passbookId purchasePrice } groups { id name } }`;

// Exact query used by useHoldings (apps/web/src/data/hooks.ts).
const HOLDINGS_QUERY = `query {
      parcels { id surveyNo subdivision extent unit classification status litigation stake currentOwner purchasePrice marketValue passbookId createdAt }
      passbooks { id pattadarNo ownerName village mandal district groupId }
      properties { id type label city district landArea landUnit builtupArea builtupUnit holdingStatus stake currentValue currentOwner groupId createdAt }
      documents { parcelId propertyId docType tags fileRef }
      groups { id name }
    }`;

async function gql(query: string) {
  const res = await fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(`GQL errors: ${JSON.stringify(body.errors)}`);
  return body.data;
}

let failures = 0;
function assertEq(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
}

const pb = await gql(PASSBOOKS_QUERY);
assertEq('passbooks page — passbooks count', pb.passbooks.length, 5);

const totalExtent = pb.passbooks.reduce((s: number, p: { totalExtent: number }) => s + (Number(p.totalExtent) || 0), 0);
assertEq('passbooks page — header extent (formatArea of Σ totalExtent)', formatArea(totalExtent), '102 Acres 81 Cents');

const h = await gql(HOLDINGS_QUERY);
assertEq('land & properties page — parcels count', h.parcels.length, 32);

const parcelAcres = h.parcels.reduce((s: number, p: { extent: number }) => s + (Number(p.extent) || 0), 0);
assertEq('land & properties page — farmland extent (formatArea of Σ parcel extents)', formatArea(parcelAcres), '102 Acres 81 Cents');

console.log(`\nproperties count (informational): ${h.properties.length}`);
console.log(failures === 0 ? '\nALL ASSERTIONS PASSED' : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
