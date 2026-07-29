/**
 * Every delete mutation, exercised against the running API.
 * `bun run scripts/delete-smoke.ts`
 *
 * A typecheck cannot see inside an SQL string. `delete_parcel` shipped reading
 * `parcels.village`, a column that does not exist, and deletion failed at
 * runtime for every parcel — while every static check passed. The only way to
 * know these work is to run them.
 *
 * Everything is created and destroyed under a scratch user, so this never
 * touches real records.
 */
const API = process.env.API ?? 'http://127.0.0.1:8080';
const UID = 'delete.smoke.scratch';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) {
    failures += 1;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

async function gql<T = Record<string, unknown>>(query: string): Promise<{ data: T | null; error: string }> {
  const r = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-id': UID },
    body: JSON.stringify({ query }),
  });
  const j = (await r.json()) as { data?: T; errors?: { message: string }[] };
  return { data: j.data ?? null, error: j.errors?.[0]?.message ?? '' };
}

const id = (o: unknown, k: string) => ((o as Record<string, { id: string }>)?.[k]?.id ?? '');

// ── build a small world ─────────────────────────────────────────────────────
const pb = await gql(
  `mutation{ createPassbook(pattadarNo:"SMOKE-1", state:"AP", district:"Prakasam", mandal:"K", village:"Smoketown"){ id } }`,
);
check('created a passbook', !!id(pb.data, 'createPassbook'), pb.error);
const passbookId = id(pb.data, 'createPassbook');

const pc = await gql(
  `mutation{ createParcel(passbookId:"${passbookId}", surveyNo:"7", subdivision:"A", extent:1.5, unit:"acres", classification:"agri", acquisitionSource:"", parentParcelId:"", source:"manual"){ id } }`,
);
check('created a parcel', !!id(pc.data, 'createParcel'), pc.error);
const parcelId = id(pc.data, 'createParcel');

const gr = await gql(`mutation{ createGroup(type:"family", name:"Smoke Family"){ id } }`);
check('created a group', !!id(gr.data, 'createGroup'), gr.error);
const groupId = id(gr.data, 'createGroup');

const mem = await gql(
  `mutation{ addMember(groupId:"${groupId}", name:"Smoke Member", relation:"other", role:"Member", gender:"", dob:"", phone:"", email:"", bio:"", photo:"", fatherId:"", motherId:"", spouseId:"", isBeneficiary:false, sharePct:0, kind:"family", parcelId:"", presentAddress:"", aadhaar:"", guardianName:"", guardianContact:"", maritalStatus:"", spouseName:"", spouseContact:"", spouseStatus:""){ id } }`,
);
check('created a member', !!id(mem.data, 'addMember'), mem.error);
const memberId = id(mem.data, 'addMember');

const prop = await gql(
  `mutation{ createProperty(type:"open_plot", label:"Smoke Plot", city:"X", district:"Y", landArea:100, purchasePrice:0){ id } }`,
);
check('created a property', !!id(prop.data, 'createProperty'), prop.error);
const propertyId = id(prop.data, 'createProperty');

// ── the mutations under test ────────────────────────────────────────────────
// Parcel first: deleting the passbook would take it with it.
if (parcelId) {
  const r = await gql(`mutation{ deleteParcel(id:"${parcelId}") }`);
  check('deleteParcel succeeds', !r.error && (r.data as never as { deleteParcel: boolean })?.deleteParcel === true, r.error);
}
if (memberId) {
  const r = await gql(`mutation{ removeMember(id:"${memberId}") }`);
  check('removeMember succeeds', !r.error, r.error);
}
if (groupId) {
  const r = await gql(`mutation{ deleteGroup(id:"${groupId}") }`);
  check('deleteGroup succeeds', !r.error, r.error);
}
if (propertyId) {
  const r = await gql(`mutation{ deleteProperty(id:"${propertyId}") }`);
  check('deleteProperty succeeds', !r.error, r.error);
}
if (passbookId) {
  const r = await gql(`mutation{ deletePassbook(id:"${passbookId}") }`);
  check('deletePassbook succeeds', !r.error && (r.data as never as { deletePassbook: boolean })?.deletePassbook === true, r.error);
}

// ── and the audit rows they wrote actually name what was deleted ────────────
const audit = await gql<{ recentAuditEvents: { action: string; details: string }[] }>(
  `query{ recentAuditEvents{ action details } }`,
);
const rows = audit.data?.recentAuditEvents ?? [];
for (const action of ['delete_parcel', 'delete_passbook', 'delete_group', 'remove_member', 'delete_property']) {
  const row = rows.find((r) => r.action === action);
  check(`${action} recorded a name`, !!row && row.details.trim().length > 0, row ? '(empty details)' : '(no audit row)');
}

console.log(failures === 0 ? 'DELETE SMOKE PASSES' : `DELETE SMOKE FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
