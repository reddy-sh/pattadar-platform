/**
 * Shared GraphQL operations — the exact documents the web app sends (copied
 * verbatim from apps/web/src/data/hooks.ts so both heads stay in lockstep;
 * the wire is camelCase everywhere: Strawberry auto_camel_case is ON).
 *
 * Mobile v1 uses the read set + the invitation/verify mutations. The web app
 * still owns its local copies; migrating it to import from here is a
 * follow-up cleanup, not a runtime change.
 */

/** Dashboard mega-query — one round trip for the whole home screen. */
export const DASHBOARD_QUERY = `query {
  dashboardStats { totalPassbooks totalParcels totalDocuments totalBeneficiaries pendingInvitations estimatedValue totalExtent totalGroups }
  me { name lastActiveAt }
  parcels { id ref passbookId surveyNo subdivision extent unit classification status label geoPoint currentOwner purchasePrice purchaseDate guidelineValue marketValue loanAmount regDocNo sro regDate ecStatus ecDate taxPaidUpto litigation createdAt }
  passbooks { id ref pattadarNo ownerName fatherHusbandName state district mandal village photo totalExtent groupId createdAt }
  properties { id type label city district landArea landUnit builtupArea builtupUnit holdingStatus currentValue marketValue guidelineValue purchasePrice litigation taxPaidUpto ecStatus ecDate attributes createdAt }
  groups { id ownerUserId type name description myRole memberCount landCount totalExtent totalShare createdAt }
  pendingInvitations { id scopeType scopeId role inviteeContact token expiry status createdAt }
  recentAuditEvents { id actor action target details timestamp }
  serviceRequests { id reqType parcelId status details createdAt }
  documents { id fileRef docType parcelId passbookId }
}`;

/** Holdings list — parcels + properties normalized client-side into one list. */
export const HOLDINGS_QUERY = `query {
  parcels { id surveyNo subdivision extent unit classification status litigation stake currentOwner purchasePrice marketValue passbookId createdAt geoPoint }
  passbooks { id pattadarNo ownerName village mandal district groupId }
  properties { id type label city district landArea landUnit builtupArea builtupUnit holdingStatus stake currentValue currentOwner groupId createdAt }
  documents { parcelId propertyId docType tags fileRef }
  groups { id name }
}`;

/** Passbooks page — verbatim from web usePassbooks (parcels feed per-khata
 * count + acquisition-cost aggregation). */
export const PASSBOOKS_QUERY = `query { passbooks { id ref ownerUserId pattadarNo ownerName fatherHusbandName state district mandal village photo totalExtent groupId createdAt } parcels { passbookId purchasePrice } groups { id name } }`;

/** Family groups list. */
export const GROUPS_QUERY = `query { groups { id ownerUserId type name description myRole memberCount landCount totalExtent totalShare createdAt } }`;

/**
 * Members of one group (the web useGroups selection). The server does NOT
 * return groupId — the caller stamps it client-side.
 */
export const GROUP_MEMBERS_QUERY = `query($gid: String!) { members(groupId: $gid) { id name relation gender dob phone email role isSelf isBeneficiary sharePct status inviteStatus inviteToken aadhaarMasked phoneVerified emailVerified } }`;

/** Lightweight per-group member states for dashboard rings. */
export const GROUP_MEMBER_STATES_QUERY = `query($gid: String!) { members(groupId: $gid) { isSelf status } }`;

/** Top-level invitations (scoped to the caller's passbooks/parcels). */
export const INVITATIONS_QUERY = `query { invitations { id scopeType scopeId role inviteeContact token expiry status createdAt } }`;

/**
 * Invitation status transition. UI contract: 'accepted' only from pending,
 * 'revoked' from pending|accepted. NEVER send 'verified' from a client —
 * that transition belongs exclusively to the verify-token landing.
 */
export const UPDATE_INVITATION_STATUS_MUTATION = `mutation($id: String!, $status: String!) { updateInvitationStatus(id: $id, status: $status) { id } }`;

export const DELETE_INVITATION_MUTATION = `mutation($id: String!) { deleteInvitation(id: $id) }`;

/**
 * Public verify landing. The mutation NAME matters beyond the schema: the
 * gateway's only unauthenticated carve-out is a POST /graphql whose body
 * contains the substring "verifyBeneficiary" (verifyMember is an API alias
 * but is NOT carved out and 401s without a token). The resolver returns a
 * BeneficiaryType object, so a selection set is REQUIRED — without one the
 * document fails GraphQL validation before executing.
 */
export const VERIFY_BENEFICIARY_MUTATION = `mutation($token: String!) { verifyBeneficiary(token: $token) { id status } }`;

/** Server-side invite fan-out (email/WhatsApp/SMS via notify seam). */
export const INVITE_MEMBER_MUTATION = `mutation($id:String!){ inviteMember(id:$id){ id } }`;

// --- create mutations (API convention: every arg required; '' for unused) ----

export const CREATE_PASSBOOK_MUTATION = `mutation($pattadarNo: String!, $state: String!, $district: String!, $mandal: String!, $village: String!, $ownerName: String!, $fatherHusbandName: String!, $groupId: String!) {
  createPassbook(pattadarNo: $pattadarNo, state: $state, district: $district, mandal: $mandal, village: $village, ownerName: $ownerName, fatherHusbandName: $fatherHusbandName, groupId: $groupId) { id }
}`;

export const CREATE_PARCEL_MUTATION = `mutation($passbookId: String!, $surveyNo: String!, $subdivision: String!, $extent: Float!, $unit: String!, $classification: String!, $acquisitionSource: String!, $parentParcelId: String!, $source: String!) {
  createParcel(passbookId: $passbookId, surveyNo: $surveyNo, subdivision: $subdivision, extent: $extent, unit: $unit, classification: $classification, acquisitionSource: $acquisitionSource, parentParcelId: $parentParcelId, source: $source) { id }
}`;

/** Web parity: cost-per-acre is stored only as the derived total price. */
export const UPDATE_PARCEL_PRICE_MUTATION = `mutation($id: String!, $purchasePrice: Float!) { updateParcel(id: $id, purchasePrice: $purchasePrice) { id } }`;

// --- delete flows (ported from apps/web/src/data/pattadarActions.ts) --------
// Order matters: document ROWS go before the parcel/passbook row (ownership
// checks); deleteProperty cascades its own doc rows server-side. Moving file
// bytes to Trash is a separate gateway/storage call (web does it best-effort;
// clients without a storage session skip it — files stay in My Drive).

export const DELETE_DOCUMENT_MUTATION = `mutation($id:String!){ deleteDocument(id:$id) }`;
export const DELETE_PARCEL_MUTATION = `mutation($id: String!) { deleteParcel(id: $id) }`;
export const DELETE_PASSBOOK_MUTATION = `mutation($id: String!) { deletePassbook(id: $id) }`;
export const DELETE_PROPERTY_MUTATION = `mutation($id: String!) { deleteProperty(id: $id) }`;

/** Doc refs for the parcel-delete cascade (filter client-side by parcelId). */
export const DOCUMENT_REFS_QUERY = `query { documents { id parcelId fileRef } }`;
/** Khata-level AND parcel-level docs of one passbook. */
export const PASSBOOK_DOCUMENTS_QUERY = `query($id:String!){ passbookDocuments(passbookId:$id){ id fileRef } }`;
export const PROPERTY_DOCUMENTS_QUERY = `query($id:String!){ propertyDocuments(propertyId:$id){ id fileRef } }`;

/** My relationship to a holding: owned / managed / watch. */
export const SET_STAKE_MUTATION = `mutation($k:String!,$id:String!,$s:String!){ setStake(kind:$k, id:$id, stake:$s) }`;

/** Full 24-arg member write (every arg required by the schema; '' / false / 0
 * for unused). Server auto-creates the invite token when isBeneficiary. */
export const ADD_MEMBER_MUTATION = `mutation($groupId:String!,$name:String!,$relation:String!,$role:String!,$gender:String!,$dob:String!,$phone:String!,$email:String!,$bio:String!,$photo:String!,$fatherId:String!,$motherId:String!,$spouseId:String!,$isBeneficiary:Boolean!,$sharePct:Float!,$kind:String!,$parcelId:String!,$presentAddress:String!,$aadhaar:String!,$guardianName:String!,$guardianContact:String!,$maritalStatus:String!,$spouseName:String!,$spouseContact:String!,$spouseStatus:String!){ addMember(groupId:$groupId,name:$name,relation:$relation,role:$role,gender:$gender,dob:$dob,phone:$phone,email:$email,bio:$bio,photo:$photo,fatherId:$fatherId,motherId:$motherId,spouseId:$spouseId,isBeneficiary:$isBeneficiary,sharePct:$sharePct,kind:$kind,parcelId:$parcelId,presentAddress:$presentAddress,aadhaar:$aadhaar,guardianName:$guardianName,guardianContact:$guardianContact,maritalStatus:$maritalStatus,spouseName:$spouseName,spouseContact:$spouseContact,spouseStatus:$spouseStatus){ id inviteToken } }`;

export const REMOVE_MEMBER_MUTATION = `mutation($id:String!){ removeMember(id:$id) }`;
