import Foundation

/// Wire shapes. camelCase throughout — Strawberry's auto_camel_case is on, so
/// no key-decoding strategy is needed or wanted.
public struct Parcel: Decodable, Identifiable, Sendable {
    public let id: String
    public let passbookId: String
    public let surveyNo: String
    public let subdivision: String
    /// Canonical DECIMAL ACRES. `unit` below is a provenance label only.
    public let extent: Double
    public let unit: String
    public let classification: String
    public let acquisitionSource: String
    public let status: String
    public let label: String
    public let address: String
    public let geoPoint: String
    /// The surveyed outline: corner-ordered "lat,lng;…" from an FMB table.
    public let boundary: String
    public let stake: String
    public let currentOwner: String
    // The chuttupakkala haddulu — what the deed says the land abuts.
    public let boundaryNorth: String
    public let boundarySouth: String
    public let boundaryEast: String
    public let boundaryWest: String
    public let purchasePrice: Double
    public let purchaseDate: String
    public let guidelineValue: Double
    public let marketValue: Double
    public let stampDuty: Double
    public let loanAmount: Double
    public let encumbranceStatus: String
    public let regDocNo: String
    public let sro: String
    public let regDate: String
    public let ecStatus: String
    public let ecDate: String
    public let mutationStatus: String
    public let taxPaidUpto: String
    public let litigation: Bool
    public let litigationNote: String
    public let createdAt: String
}

public struct Passbook: Decodable, Identifiable, Sendable {
    public let id: String
    public let pattadarNo: String
    public let ownerName: String
    public let village: String
    public let mandal: String
    public let district: String
}

public struct Property: Decodable, Identifiable, Sendable {
    public let id: String
    public let type: String
    public let label: String
    public let address: String
    public let locality: String
    public let city: String
    public let district: String
    public let geoPoint: String
    /// Corner-ordered "lat,lng;…" — same convention as the parcel's.
    public let boundary: String
    public let landArea: Double
    public let landUnit: String
    public let builtupArea: Double
    public let builtupUnit: String
    public let acquisitionMode: String
    public let holdingStatus: String
    public let stake: String
    public let currentOwner: String
    public let groupId: String
    public let purchasePrice: Double
    public let purchaseDate: String
    public let guidelineValue: Double
    public let marketValue: Double
    public let currentValue: Double
    public let regDocNo: String
    public let sro: String
    public let regDate: String
    /// Municipal assessment number — a flat's tax identity.
    public let ghmcAssessmentNo: String
    public let khataNo: String
    public let reraNo: String
    public let ecStatus: String
    public let ecDate: String
    public let mutationStatus: String
    public let taxPaidUpto: String
    public let litigation: Bool
    public let litigationNote: String
    public let notes: String
    /// JSON blob of type-specific extras (plot_no, bhk, facing, road_width…).
    public let attributes: String
    public let createdAt: String
}

public struct RegisteredDocument: Decodable, Identifiable, Sendable {
    public let id: String
    public let ref: String
    public let documentNo: String
    public let docType: String
    public let sro: String
    public let village: String
    public let surveyNo: String
    public let plotNo: String
    public let extent: String
    public let consideration: Double
    /// Already on the wire and previously discarded. The year a document was
    /// registered is how a person recognises it among five deeds for the same
    /// village, so it belongs in what they see and in what they send on.
    public let regYear: String
    public let registrationDate: String
    public let propertyId: String
    public let parcelId: String
    public let passbookId: String
    /// What the AI read, written as a news report and stored ON this row, so it
    /// cannot outlive the document it describes.
    public let headline: String
    public let summary: String
    public let keyPointList: [String]
    public let caveatList: [String]
    public let createdAt: String
    /// The full extraction, verbatim JSON — the document viewer's source of
    /// truth. Empty on documents filed before it existed.
    public let reading: String
}

public struct HoldingsResponse: Decodable, Sendable {
    public let parcels: [Parcel]
    public let passbooks: [Passbook]
    public let properties: [Property]
}

public struct DocumentsResponse: Decodable, Sendable {
    public let registeredDocuments: [RegisteredDocument]
}

/// "lat,lng" — the storage convention shared with the web app. Tolerates the
/// spaces and brackets older rows picked up.
public func parseGeoPoint(_ raw: String) -> LatLng? {
    let cleaned = raw.replacingOccurrences(of: "[", with: "")
        .replacingOccurrences(of: "]", with: "")
        .replacingOccurrences(of: " ", with: "")
    let parts = cleaned.split(separator: ",")
    guard parts.count == 2, let lat = Double(parts[0]), let lng = Double(parts[1]),
          lat != 0 || lng != 0 else { return nil }
    return LatLng(latitude: lat, longitude: lng)
}

// MARK: - Dashboard

public struct DashboardStats: Decodable, Sendable {
    public let totalPassbooks: Int
    public let totalParcels: Int
    public let totalDocuments: Int
    public let totalBeneficiaries: Int
    public let pendingInvitations: Int
    public let estimatedValue: Double
    public let totalExtent: Double
    public let totalGroups: Int
}

public struct Me: Decodable, Sendable {
    public let name: String
    public let email: String
}

public struct AuditEvent: Decodable, Identifiable, Sendable {
    public let id: String
    public let actor: String
    public let action: String
    public let target: String
    public let details: String
    public let timestamp: String
}

public struct DashboardResponse: Decodable, Sendable {
    public let dashboardStats: DashboardStats
    public let me: Me?
    public let recentAuditEvents: [AuditEvent]
}

// MARK: - Passbooks, groups, members

public struct PassbookDetail: Decodable, Identifiable, Sendable {
    public let id: String
    public let ref: String
    public let pattadarNo: String
    public let ownerName: String
    public let fatherHusbandName: String
    public let state: String
    public let district: String
    public let mandal: String
    public let village: String
    public let totalExtent: Double
    public let groupId: String
    public let createdAt: String
}

public struct PassbooksResponse: Decodable, Sendable {
    public let passbooks: [PassbookDetail]
}

/// Named `FamilyGroup` because SwiftUI owns `Group`, and a domain type that
/// shadows a view builder makes every use site ambiguous.
public struct FamilyGroup: Decodable, Identifiable, Sendable {
    public let id: String
    public let type: String
    public let name: String
    public let description: String
    public let memberCount: Int
    public let landCount: Int
    public let totalExtent: Double
    public let totalShare: Double
    public let createdAt: String
}

public struct GroupsResponse: Decodable, Sendable {
    public let groups: [FamilyGroup]
}

public struct Member: Decodable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let relation: String
    public let gender: String
    public let dob: String
    public let phone: String
    public let role: String
    public let isSelf: Bool
    public let isBeneficiary: Bool
    public let sharePct: Double
    public let status: String
}

public struct MembersResponse: Decodable, Sendable {
    public let members: [Member]
}


// MARK: - The dossier hanging off one holding

/// One link in the chain of title. `isCurrent` marks the present holder; the
/// rest are who held it before, and how it changed hands.
public struct ParcelOwner: Decodable, Identifiable, Sendable {
    public let id: String
    public let ownerName: String
    public let acquisitionSource: String
    public let extent: Double
    public let mutationType: String
    public let mutationDate: String
    public let isCurrent: Bool
}

/// A photograph as EVIDENCE: where it was taken, which way the camera faced,
/// and when. A picture of a field with no coordinates proves very little.
public struct ParcelPhoto: Decodable, Identifiable, Sendable {
    public let id: String
    public let parcelId: String
    public let fileRef: String
    public let category: String
    public let caption: String
    /// nil, never 0 — 0,0 is a real place in the Atlantic.
    public let latitude: Double?
    public let longitude: Double?
    public let heading: Double?
    public let capturedAt: String
    public let capturedBy: String
    public let isCover: Bool
    public let createdAt: String
}

public struct Note: Decodable, Identifiable, Sendable {
    public let id: String
    public let body: String
    public let createdAt: String
}

public struct ParcelWithOwners: Decodable, Identifiable, Sendable {
    public let id: String
    public let owners: [ParcelOwner]
}

public struct ParcelDossier: Decodable, Sendable {
    public let parcels: [ParcelWithOwners]
    public let parcelPhotos: [ParcelPhoto]
    public let notes: [Note]
    public let auditEvents: [AuditEvent]
}

public struct PropertyDossier: Decodable, Sendable {
    public let notes: [Note]
    public let auditEvents: [AuditEvent]
}


/// A starred record. Generic on purpose: a parcel, a property, a passbook or a
/// group can all be starred without another table.
public struct Favourite: Decodable, Identifiable, Sendable {
    public let id: String
    public let entityType: String
    public let entityId: String
    public let createdAt: String
}

public struct FavouritesResponse: Decodable, Sendable {
    public let favourites: [Favourite]
}


/// Something physically on the land, as opposed to something the papers say.
///
/// A borewell's depth, the electricity service number, which corner stone is
/// which. None of it is on any deed, all of it is expensive to rediscover, and
/// it usually lives in one person's memory — so a 320 ft borewell becomes
/// "about 300, ask the man who drilled it" the moment they are not around.
public struct LandFeature: Decodable, Identifiable, Sendable {
    public let id: String
    public let entityType: String
    public let entityId: String
    public let category: String
    public let label: String
    public let value: Double
    public let unit: String
    /// A service number or connection id.
    public let reference: String
    /// Who drilled it, built it, wound the motor.
    public let vendor: String
    /// "Yields 1.5 inch after summer" — how it is doing, not what it is.
    public let condition: String
    public let note: String
    public let createdAt: String

    /// "320 ft", or the reference when there is no measurement.
    public var amount: String {
        if value != 0 {
            let n = value == value.rounded() ? String(Int(value)) : String(value)
            return unit.isEmpty ? n : "\(n) \(unit)"
        }
        return reference
    }
}

public struct LandFeaturesResponse: Decodable, Sendable {
    public let landFeatures: [LandFeature]
}

/// The kinds of thing worth recording, in the order they are asked about.
public enum FeatureCategory: String, CaseIterable, Sendable, Identifiable {
    case water, power, corners, access, structure, crop, other
    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .water: "Water"
        case .power: "Power"
        case .corners: "Boundary corners"
        case .access: "Access"
        case .structure: "Structures"
        case .crop: "Crops and trees"
        case .other: "Other"
        }
    }

    public var icon: String {
        switch self {
        case .water: "drop.fill"
        case .power: "bolt.fill"
        case .corners: "mappin.and.ellipse"
        case .access: "road.lanes"
        case .structure: "building.columns.fill"
        case .crop: "leaf.fill"
        case .other: "square.grid.2x2.fill"
        }
    }

    /// What people actually record under this heading, offered as suggestions
    /// so nobody has to invent a vocabulary.
    public var examples: [String] {
        switch self {
        case .water: ["Borewell", "Open well", "Channel", "Tank bund", "Pump"]
        case .power: ["Electricity service", "Transformer", "Motor"]
        case .corners: ["Corner A stone", "Corner B stone", "Bund line", "Fence"]
        case .access: ["Road frontage", "Access track", "Gate", "Right of way"]
        case .structure: ["Shed", "Compound wall", "Farm house", "Cattle shed"]
        case .crop: ["Mango trees", "Teak", "Coconut", "Standing crop"]
        case .other: []
        }
    }

    /// The unit this kind is usually measured in — a borewell is feet deep, a
    /// motor is horsepower, frontage is feet.
    public var units: [String] {
        switch self {
        case .water: ["ft", "HP", "inches"]
        case .power: ["HP", "kW", "units"]
        case .corners: ["ft", "m"]
        case .access: ["ft", "m"]
        case .structure: ["Sq.ft", "ft"]
        case .crop: ["trees", "acres"]
        case .other: ["ft", "m", "Sq.ft"]
        }
    }

    public static func of(_ raw: String) -> FeatureCategory {
        FeatureCategory(rawValue: raw.lowercased()) ?? .other
    }
}


public struct WorkRequest: Decodable, Identifiable, Sendable {
    public let id: String
    public let kind: String
    public let title: String
    public let entityType: String
    public let entityId: String
    public let assignee: String
    public let cost: Double
    public let stage: Int
    public let needsYou: Bool
    public let note: String
    public let dueDate: String
    public let closed: Bool
    public let createdAt: String
}

public struct WorkRequestsResponse: Decodable, Sendable {
    public let workRequests: [WorkRequest]
}


public struct LandExpense: Decodable, Identifiable, Sendable {
    public let id: String
    public let entityType: String
    public let entityId: String
    public let category: String
    public let title: String
    public let amount: Double
    public let spentOn: String
    public let vendor: String
    public let note: String
    public let createdAt: String
}

public struct LandExpensesResponse: Decodable, Sendable {
    public let landExpenses: [LandExpense]
}
