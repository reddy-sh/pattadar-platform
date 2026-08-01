import Foundation

/// GraphQL documents, kept as literals matching `packages/core/src/api/operations.ts`.
///
/// A selection set naming a field the schema does not have fails the WHOLE
/// query, not just that field — widening one of these to fetch `propertyId`
/// blanked an entire screen on the RN client, because the column existed and
/// the resolver set it but the type never declared it. Add fields against the
/// schema, not against the database.
public enum Queries {
    public static let holdings = """
    query {
      parcels { id passbookId surveyNo subdivision extent unit classification acquisitionSource status label address geoPoint boundary stake currentOwner boundaryNorth boundarySouth boundaryEast boundaryWest purchasePrice purchaseDate guidelineValue marketValue stampDuty loanAmount encumbranceStatus regDocNo sro regDate ecStatus ecDate mutationStatus taxPaidUpto litigation litigationNote createdAt }
      passbooks { id pattadarNo ownerName village mandal district groupId }
      properties { id type label address locality city district geoPoint boundary landArea landUnit builtupArea builtupUnit acquisitionMode holdingStatus stake currentOwner groupId purchasePrice purchaseDate guidelineValue marketValue currentValue regDocNo sro regDate ghmcAssessmentNo khataNo reraNo ecStatus ecDate mutationStatus taxPaidUpto litigation litigationNote notes attributes createdAt }
    }
    """

    /// An empty value leaves the stored one, so a form cannot blank a field it
    /// did not ask about.
    public static let workRequests = """
    query {
      workRequests {
        id kind title entityType entityId assignee cost stage needsYou note dueDate closed createdAt
      }
    }
    """

    public static let landExpenses = """
    query { landExpenses { id entityType entityId category title amount spentOn vendor note createdAt } }
    """

    public static let landFeatures = """
    query($entityType:String!,$entityId:String!){
      landFeatures(entityType:$entityType, entityId:$entityId){
        id entityType entityId category label value unit reference vendor condition note createdAt
      }
    }
    """

    public static let documents = """
    query {
      registeredDocuments {
        id ref fileRef docType documentNo regYear sro village district surveyNo plotNo
        extent consideration registrationDate passbookId parcelId propertyId
        headline summary keyPointList caveatList createdAt
      }
    }
    """

    public static let dashboard = """
    query {
      dashboardStats { totalPassbooks totalParcels totalDocuments totalBeneficiaries pendingInvitations estimatedValue totalExtent totalGroups }
      me { name email }
      recentAuditEvents { id actor action target details timestamp }
    }
    """

    public static let passbooks = """
    query { passbooks { id ref pattadarNo ownerName fatherHusbandName state district mandal village totalExtent groupId createdAt } }
    """

    public static let groups = """
    query { groups { id type name description memberCount landCount totalExtent totalShare createdAt } }
    """

    public static let members = """
    query($gid:String!){ members(groupId:$gid){ id name relation gender dob phone role isSelf isBeneficiary sharePct status } }
    """

    /// Everything hanging off ONE parcel: its owner chain, photographs,
    /// notes and its own slice of the audit trail. Fetched per-record rather
    /// than with the list, because a list of 22 parcels does not need 22
    /// owner histories.
    public static let favourites = """
    query { favourites { id entityType entityId createdAt } }
    """

    public static let parcelDossier = """
    query($id:String!,$target:String!){
      parcels { id owners { id ownerName acquisitionSource extent mutationType mutationDate isCurrent } }
      parcelPhotos(parcelId:$id) { id parcelId fileRef category caption latitude longitude heading capturedAt capturedBy isCover createdAt }
      notes(entityType:"parcel", entityId:$id) { id body createdAt }
      auditEvents(target:$target) { id actor action target details timestamp }
    }
    """

    public static let propertyDossier = """
    query($target:String!){
      notes(entityType:"property", entityId:$target) { id body createdAt }
      auditEvents(target:$target) { id actor action target details timestamp }
    }
    """

    public static let updateParcelGeo = """
    mutation($id:String!,$geoPoint:String!){ updateParcelGeo(parcelId:$id, geoPoint:$geoPoint){ id } }
    """

    public static let updatePropertyGeo = """
    mutation($id:String!,$geoPoint:String!){ updatePropertyGeo(propertyId:$id, geoPoint:$geoPoint){ id } }
    """

    public static let updateParcelBoundary = """
    mutation($id:String!,$boundary:String!){ updateParcelBoundary(parcelId:$id, boundary:$boundary){ id } }
    """

    public static let updatePropertyBoundary = """
    mutation($id:String!,$boundary:String!){ updatePropertyBoundary(propertyId:$id, boundary:$boundary){ id } }
    """
}

/// Mutations. Every argument the API declares is required — the convention is
/// to pass "" / 0 / false for unused ones rather than omit them.
public enum Mutations {
    public static let createPassbook = """
    mutation($pattadarNo:String!,$state:String!,$district:String!,$mandal:String!,$village:String!,$ownerName:String!,$fatherHusbandName:String!,$groupId:String!){
      createPassbook(pattadarNo:$pattadarNo,state:$state,district:$district,mandal:$mandal,village:$village,ownerName:$ownerName,fatherHusbandName:$fatherHusbandName,groupId:$groupId){ id }
    }
    """

    public static let createParcel = """
    mutation($passbookId:String!,$surveyNo:String!,$subdivision:String!,$extent:Float!,$unit:String!,$classification:String!,$acquisitionSource:String!,$parentParcelId:String!,$source:String!){
      createParcel(passbookId:$passbookId,surveyNo:$surveyNo,subdivision:$subdivision,extent:$extent,unit:$unit,classification:$classification,acquisitionSource:$acquisitionSource,parentParcelId:$parentParcelId,source:$source){ id }
    }
    """

    public static let createProperty = """
    mutation($type:String!,$label:String!,$address:String!,$locality:String!,$city:String!,$district:String!,$landArea:Float!,$landUnit:String!,$builtupArea:Float!,$builtupUnit:String!,$acquisitionMode:String!,$projectId:String!,$groupId:String!,$attributes:String!,$purchasePrice:Float!,$purchaseDate:String!,$regDocNo:String!,$sro:String!,$regDate:String!,$sellerName:String!,$buyerName:String!){
      createProperty(type:$type,label:$label,address:$address,locality:$locality,city:$city,district:$district,landArea:$landArea,landUnit:$landUnit,builtupArea:$builtupArea,builtupUnit:$builtupUnit,acquisitionMode:$acquisitionMode,projectId:$projectId,groupId:$groupId,attributes:$attributes,purchasePrice:$purchasePrice,purchaseDate:$purchaseDate,regDocNo:$regDocNo,sro:$sro,regDate:$regDate,sellerName:$sellerName,buyerName:$buyerName){ id }
    }
    """

    /// `payload` is the JSON string of the extraction fields — summary,
    /// caveats and every extracted value travel with it, so the reading is
    /// kept rather than thrown away once the form is filled.
    public static let createRegisteredDocument = """
    mutation($fileRef:String!,$payload:String!){ createRegisteredDocument(fileRef:$fileRef,payload:$payload){ id } }
    """

    public static let linkDocumentProperty = """
    mutation($id:String!,$prop:String!){ linkDocumentProperty(documentId:$id, propertyId:$prop){ id } }
    """
    public static let linkDocumentParcel = """
    mutation($id:String!,$parcel:String!){ linkDocumentParcel(documentId:$id, parcelId:$parcel){ id } }
    """
    public static let linkDocumentPassbook = """
    mutation($id:String!,$pb:String!){ linkDocumentPassbook(documentId:$id, passbookId:$pb){ id } }
    """

    // ── edits ────────────────────────────────────────────────────────────
    // Every argument is optional server-side and only non-nil values are
    // written, so a screen that edits four fields cannot blank the other
    // twenty. update_group is the exception: it takes both name AND
    // description positionally, so both must always be sent or the one left
    // out is erased.
    public static let updateParcel = """
    mutation($id:String!,$surveyNo:String!,$subdivision:String!,$extent:Float!,$unit:String!,$classification:String!){
      updateParcel(id:$id,surveyNo:$surveyNo,subdivision:$subdivision,extent:$extent,unit:$unit,classification:$classification){ id }
    }
    """

    public static let updateProperty = """
    mutation($id:String!,$label:String!,$locality:String!,$city:String!,$district:String!,$landArea:Float!,$purchasePrice:Float!){
      updateProperty(id:$id,label:$label,locality:$locality,city:$city,district:$district,landArea:$landArea,purchasePrice:$purchasePrice){ id }
    }
    """

    /// Just the extent. The API treats an omitted argument as "leave it", so a
    /// narrow mutation cannot wipe the fields it does not mention — which the
    /// wide `updateParcel` document would, since it sends "" for each.
    public static let updateParcelExtent = """
    mutation($id:String!,$extent:Float!,$unit:String!){
      updateParcel(id:$id,extent:$extent,unit:$unit){ id }
    }
    """

    public static let updatePropertyArea = """
    mutation($id:String!,$landArea:Float!,$landUnit:String!){
      updateProperty(id:$id,landArea:$landArea,landUnit:$landUnit){ id }
    }
    """

    public static let addWorkRequest = """
    mutation($kind:String!,$title:String!,$entityType:String!,$entityId:String!,$assignee:String!,$cost:Float!,$note:String!,$dueDate:String!){
      addWorkRequest(kind:$kind,title:$title,entityType:$entityType,entityId:$entityId,assignee:$assignee,cost:$cost,note:$note,dueDate:$dueDate){ id }
    }
    """

    public static let updateWorkRequest = """
    mutation($id:String!,$stage:Int!,$needsYou:Boolean!,$closed:Boolean!){
      updateWorkRequest(id:$id,stage:$stage,needsYou:$needsYou,closed:$closed){ id stage closed }
    }
    """

    public static let deleteWorkRequest = """
    mutation($id:String!){ deleteWorkRequest(id:$id) }
    """

    public static let addLandExpense = """
    mutation($title:String!,$amount:Float!,$category:String!,$entityType:String!,$entityId:String!,$spentOn:String!,$vendor:String!,$note:String!){
      addLandExpense(title:$title,amount:$amount,category:$category,entityType:$entityType,entityId:$entityId,spentOn:$spentOn,vendor:$vendor,note:$note){ id }
    }
    """

    public static let deleteLandExpense = """
    mutation($id:String!){ deleteLandExpense(id:$id) }
    """

    public static let addLandFeature = """
    mutation($entityType:String!,$entityId:String!,$category:String!,$label:String!,$value:Float!,$unit:String!,$reference:String!,$vendor:String!,$condition:String!,$note:String!){
      addLandFeature(entityType:$entityType,entityId:$entityId,category:$category,label:$label,value:$value,unit:$unit,reference:$reference,vendor:$vendor,condition:$condition,note:$note){ id }
    }
    """

    public static let deleteLandFeature = """
    mutation($id:String!){ deleteLandFeature(id:$id) }
    """

    public static let updateMe = """
    mutation($name:String!,$email:String!){ updateMe(name:$name,email:$email){ id name email } }
    """

    public static let updatePassbook = """
    mutation($id:String!,$pattadarNo:String!,$ownerName:String!,$fatherHusbandName:String!,$state:String!,$district:String!,$mandal:String!,$village:String!){
      updatePassbook(id:$id,pattadarNo:$pattadarNo,ownerName:$ownerName,fatherHusbandName:$fatherHusbandName,state:$state,district:$district,mandal:$mandal,village:$village){ id }
    }
    """

    public static let createGroup = """
    mutation($t:String!,$n:String!,$d:String!){ createGroup(type:$t,name:$n,description:$d){ id } }
    """
    public static let updateGroup = """
    mutation($id:String!,$n:String!,$d:String!){ updateGroup(id:$id,name:$n,description:$d){ id } }
    """
    public static let deleteGroup = "mutation($id:String!){ deleteGroup(id:$id) }"

    public static let addMember = """
    mutation($groupId:String!,$name:String!,$relation:String!,$role:String!,$gender:String!,$dob:String!,$phone:String!,$email:String!,$bio:String!,$photo:String!,$fatherId:String!,$motherId:String!,$spouseId:String!,$isBeneficiary:Boolean!,$sharePct:Float!,$kind:String!,$parcelId:String!,$presentAddress:String!,$aadhaar:String!,$guardianName:String!,$guardianContact:String!,$maritalStatus:String!,$spouseName:String!,$spouseContact:String!,$spouseStatus:String!){
      addMember(groupId:$groupId,name:$name,relation:$relation,role:$role,gender:$gender,dob:$dob,phone:$phone,email:$email,bio:$bio,photo:$photo,fatherId:$fatherId,motherId:$motherId,spouseId:$spouseId,isBeneficiary:$isBeneficiary,sharePct:$sharePct,kind:$kind,parcelId:$parcelId,presentAddress:$presentAddress,aadhaar:$aadhaar,guardianName:$guardianName,guardianContact:$guardianContact,maritalStatus:$maritalStatus,spouseName:$spouseName,spouseContact:$spouseContact,spouseStatus:$spouseStatus){ id }
    }
    """
    public static let removeMember = "mutation($id:String!){ removeMember(id:$id) }"

    /// Returns the state AFTER the toggle, so the caller never has to guess.
    public static let toggleFavourite = """
    mutation($type:String!,$id:String!){ toggleFavourite(entityType:$type, entityId:$id) }
    """

    public static let addNote = """
    mutation($entityType:String!,$entityId:String!,$body:String!){
      addNote(entityType:$entityType, entityId:$entityId, body:$body){ id }
    }
    """
    public static let deleteNote = "mutation($id:String!){ deleteNote(id:$id) }"

    public static let deleteRegisteredDocument = """
    mutation($id:String!){ deleteRegisteredDocument(id:$id) }
    """
    public static let deleteParcel = "mutation($id:String!){ deleteParcel(id:$id) }"
    public static let deleteProperty = "mutation($id:String!){ deleteProperty(id:$id) }"
    public static let deletePassbook = "mutation($id:String!){ deletePassbook(id:$id) }"
}

/// A mutation that returns only `{ id }`, or a bare Boolean.
public struct IDPayload: Decodable, Sendable { public let id: String }
public struct AnyMutationResult: Decodable, Sendable {
    // GraphQL wraps the result under the mutation name; callers that only need
    // "did it work" decode this and ignore the shape.
    public init(from decoder: Decoder) throws { _ = decoder }
}
