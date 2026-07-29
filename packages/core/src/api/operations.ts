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
  me { name lastActiveAt kycRefMasked }
  parcels { id ref passbookId surveyNo subdivision extent unit classification status label geoPoint currentOwner purchasePrice purchaseDate guidelineValue marketValue loanAmount regDocNo sro regDate ecStatus ecDate taxPaidUpto litigation createdAt }
  passbooks { id ref pattadarNo ownerName fatherHusbandName state district mandal village photo totalExtent groupId createdAt }
  properties { id type label city district geoPoint landArea landUnit builtupArea builtupUnit holdingStatus currentValue marketValue guidelineValue purchasePrice litigation taxPaidUpto ecStatus ecDate attributes createdAt }
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
  properties { id type label city district geoPoint landArea landUnit builtupArea builtupUnit holdingStatus stake currentValue currentOwner groupId createdAt }
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
export const GROUP_MEMBERS_QUERY = `query($gid: String!) { members(groupId: $gid) { id name relation gender dob phone email bio presentAddress photo role isSelf isBeneficiary sharePct status inviteStatus inviteToken aadhaarMasked phoneVerified emailVerified } }`;

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

export const CREATE_PROPERTY_MUTATION = `mutation($type:String!,$label:String!,$address:String!,$locality:String!,$city:String!,$district:String!,$landArea:Float!,$landUnit:String!,$builtupArea:Float!,$builtupUnit:String!,$acquisitionMode:String!,$projectId:String!,$groupId:String!,$attributes:String!,$purchasePrice:Float!,$purchaseDate:String!,$regDocNo:String!,$sro:String!,$regDate:String!,$sellerName:String!,$buyerName:String!){ createProperty(type:$type,label:$label,address:$address,locality:$locality,city:$city,district:$district,landArea:$landArea,landUnit:$landUnit,builtupArea:$builtupArea,builtupUnit:$builtupUnit,acquisitionMode:$acquisitionMode,projectId:$projectId,groupId:$groupId,attributes:$attributes,purchasePrice:$purchasePrice,purchaseDate:$purchaseDate,regDocNo:$regDocNo,sro:$sro,regDate:$regDate,sellerName:$sellerName,buyerName:$buyerName){ id } }`;

/** Set/replace a parcel's location pin — "lat,lng" (web GeoMap convention). */
export const UPDATE_PARCEL_GEO_MUTATION = `mutation($id:String!,$geoPoint:String!){ updateParcelGeo(parcelId:$id, geoPoint:$geoPoint){ id } }`;

/** Documents page (web useDocuments) + the registered-deeds register. */
export const DOCUMENTS_QUERY = `query { documents { id fileRef docType parcelId passbookId propertyId } parcels { id surveyNo subdivision } passbooks { id pattadarNo ownerName village } registeredDocuments { id ref fileRef docType documentNo regYear sro village district surveyNo plotNo extent consideration registrationDate passbookId parcelId propertyId headline summary keyPointList caveatList createdAt } }`;

/** File a classified deed: payload = JSON string of /import-registered-document fields. */
export const CREATE_REGISTERED_DOCUMENT_MUTATION = `mutation($fileRef:String!,$payload:String!){ createRegisteredDocument(fileRef:$fileRef,payload:$payload){ id } }`;

/** Agricultural deed → parcel under the matched khata (web routeToParcel). */
export const CREATE_PARCEL_FROM_DOCUMENT_MUTATION = `mutation($d:String!,$p:String!){ createParcelFromDocument(documentId:$d,passbookId:$p){ id ref } }`;

// `updateProperty` has no geoPoint argument — this document was never a valid
// query, so saving a property pin failed validation every time it was tried.
// A property gets the same dedicated, narrowly-scoped geo mutation a parcel
// has, rather than routing a pin through the general-purpose field updater.
export const UPDATE_PROPERTY_GEO_MUTATION = `mutation($id:String!,$geoPoint:String!){ updatePropertyGeo(propertyId:$id, geoPoint:$geoPoint){ id } }`;

export const CREATE_DOCUMENT_MUTATION = `mutation($parcelId:String!,$passbookId:String!,$propertyId:String!,$docType:String!,$fileRef:String!,$docNo:String!,$sroCode:String!,$regYear:String!,$source:String!,$tags:String!){ createDocument(parcelId:$parcelId,passbookId:$passbookId,propertyId:$propertyId,docType:$docType,fileRef:$fileRef,docNo:$docNo,sroCode:$sroCode,regYear:$regYear,source:$source,tags:$tags){ id } }`;

export const CREATE_GROUP_MUTATION = `mutation($t:String!,$n:String!,$d:String!){ createGroup(type:$t,name:$n,description:$d){ id } }`;

export const UPDATE_GROUP_MUTATION = `mutation($id:String!,$n:String!,$d:String!){ updateGroup(id:$id,name:$n,description:$d){ id } }`;
export const DELETE_GROUP_MUTATION = `mutation($id:String!){ deleteGroup(id:$id) }`;

export const RECORD_PARCEL_MUTATION_MUTATION = `mutation($id:String!,$newOwner:String!,$src:String!,$type:String!){ recordParcelMutation(parcelId:$id, newOwner:$newOwner, acquisitionSource:$src, mutationType:$type){ id } }`;

export const LINK_DOCUMENT_PASSBOOK_MUTATION = `mutation($id:String!,$pb:String!){ linkDocumentPassbook(documentId:$id, passbookId:$pb){ id } }`;
/** Attach a deed to the property it describes (the passbook counterpart of
 * LINK_DOCUMENT_PASSBOOK — without it, a plot made by scanning a deed could
 * not keep the deed). */
export const LINK_DOCUMENT_PARCEL_MUTATION = `mutation($id:String!,$parcel:String!){ linkDocumentParcel(documentId:$id, parcelId:$parcel){ id } }`;
export const LINK_DOCUMENT_PROPERTY_MUTATION = `mutation($id:String!,$prop:String!){ linkDocumentProperty(documentId:$id, propertyId:$prop){ id } }`;

export const DELETE_REGISTERED_DOCUMENT_MUTATION = `mutation($id:String!){ deleteRegisteredDocument(id:$id) }`;

export const SET_MEMBER_SHARE_MUTATION = `mutation($id:String!,$pct:Float!){ setMemberShare(id:$id, sharePct:$pct){ id sharePct } }`;

/** Full-field member edit. Every field must be supplied — the resolver writes
 * them all — so callers MUST send current values for anything unchanged.
 * (The API preserves the stored Aadhaar when `aadhaar` is sent empty.) */
export const UPDATE_MEMBER_MUTATION = `mutation($id:String!,$name:String!,$relation:String!,$role:String!,$gender:String!,$dob:String!,$phone:String!,$email:String!,$bio:String!,$photo:String!,$isBeneficiary:Boolean!,$sharePct:Float!,$presentAddress:String!,$aadhaar:String!){ updateMember(id:$id,name:$name,relation:$relation,role:$role,gender:$gender,dob:$dob,phone:$phone,email:$email,bio:$bio,photo:$photo,isBeneficiary:$isBeneficiary,sharePct:$sharePct,presentAddress:$presentAddress,aadhaar:$aadhaar){ id } }`;

export const REVEAL_AADHAAR_MUTATION = `mutation($id:String!){ revealMemberAadhaar(id:$id) }`;

export const UPDATE_PROFILE_AADHAAR_MUTATION = `mutation($kyc:String!){ updateProfile(language:"",districtsOfInterest:"",notificationPrefs:"",kycRef:$kyc,mfaEnabled:false){ id kycRefMasked } }`;
export const REVEAL_MY_AADHAAR_MUTATION = `mutation { revealMyAadhaar }`;

/** CL-545: the way back out of a wrong card — applyMyKyc only ever writes. */
export const CLEAR_MY_KYC_MUTATION = `mutation { clearMyKyc { id name kycRefMasked } }`;
export const APPLY_MY_KYC_MUTATION =`mutation($name:String!,$dob:String!,$gender:String!,$address:String!,$aadhaar:String!){ applyMyKyc(name:$name,dob:$dob,gender:$gender,address:$address,aadhaar:$aadhaar){ id name kycRefMasked } }`;

// --- parcel photos (CL-561..563/568) -----------------------------------------
// Every field the record needs travels in one query: a photo without its
// coordinates, heading and capture date is just a picture of some grass.
export const PARCEL_PHOTO_FIELDS =
  'id parcelId fileRef category caption latitude longitude heading capturedAt capturedBy isCover createdAt';
export const PARCEL_PHOTOS_QUERY = `query($parcelId:String!){ parcelPhotos(parcelId:$parcelId){ ${PARCEL_PHOTO_FIELDS} } }`;
/** Every photo the caller owns — list screens need covers without N round trips. */
export const ALL_PARCEL_PHOTOS_QUERY = `query{ parcelPhotos{ ${PARCEL_PHOTO_FIELDS} } }`;
export const ADD_PARCEL_PHOTO_MUTATION = `mutation($parcelId:String!,$fileRef:String!,$category:String!,$caption:String!,$latitude:Float,$longitude:Float,$heading:Float,$capturedAt:String!){ addParcelPhoto(parcelId:$parcelId,fileRef:$fileRef,category:$category,caption:$caption,latitude:$latitude,longitude:$longitude,heading:$heading,capturedAt:$capturedAt){ ${PARCEL_PHOTO_FIELDS} } }`;
export const UPDATE_PARCEL_PHOTO_MUTATION = `mutation($id:String!,$category:String,$caption:String){ updateParcelPhoto(id:$id,category:$category,caption:$caption){ ${PARCEL_PHOTO_FIELDS} } }`;
export const SET_COVER_PHOTO_MUTATION = `mutation($id:String!){ setCoverPhoto(id:$id) }`;
export const DELETE_PARCEL_PHOTO_MUTATION = `mutation($id:String!){ deleteParcelPhoto(id:$id) }`;

/** A deed that is not farmland creates a PLOT, not a parcel (Plots tab). */
export const CREATE_PROPERTY_FROM_DOCUMENT_MUTATION = `mutation($documentId:String!){ createPropertyFromDocument(documentId:$documentId){ id label type } }`;
