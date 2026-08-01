import Foundation

/// Work that needs somebody standing on the land or queueing at an office.
///
/// This is a TRACKER, not a marketplace. Nothing here takes payment or dispatches
/// anybody. It records what was asked for, who is doing it, what it costs and how
/// far along it is — because that is the part people lose. A title opinion that
/// has sat at "papers sent" for two months is invisible until somebody asks, and
/// by then the registration deadline has moved.
///
/// The prices are INDICATIVE and say so. Quoting a firm figure for work nobody
/// here is contracted to do would be an invention.
public enum RequestKind: String, CaseIterable, Sendable, Identifiable {
    case survey, legal, drafting, photos, errand, rent
    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .survey: "Land survey"
        case .legal: "Title check"
        case .drafting: "Document drafting"
        case .photos: "Site photos"
        case .errand: "Office errand"
        case .rent: "Rent collection"
        }
    }

    public var hint: String {
        switch self {
        case .survey: "Licensed surveyor, chain measurement"
        case .legal: "Advocate opinion before you buy"
        case .drafting: "Sale, gift, partition, lease"
        case .photos: "Someone visits and shoots it"
        case .errand: "MRO, SRO, EC, certified copies"
        case .rent: "Follow up and receipt it"
        }
    }

    /// What this usually costs, as a guide. Never presented as a quote.
    public var priceHint: String {
        switch self {
        case .survey: "usually from ₹4,000/acre"
        case .legal: "usually from ₹8,000"
        case .drafting: "usually from ₹3,500"
        case .photos: "usually about ₹400 a visit"
        case .errand: "usually from ₹1,200"
        case .rent: "usually about 2% of rent"
        }
    }

    public var icon: String {
        switch self {
        case .survey: "map.fill"
        case .legal: "building.columns.fill"
        case .drafting: "signature"
        case .photos: "camera.fill"
        case .errand: "doc.text.fill"
        case .rent: "indianrupeesign.circle.fill"
        }
    }

    /// The steps this kind of work actually goes through, in order.
    ///
    /// Named per kind rather than a generic "pending / in progress / done",
    /// because "papers sent" and "opinion drafted" are different problems: one
    /// is waiting on the advocate, the other is waiting on you.
    public var stages: [String] {
        switch self {
        case .survey: ["Asked", "Accepted", "Measured", "Report"]
        case .legal: ["Asked", "Papers sent", "Opinion drafted", "Signed"]
        case .drafting: ["Asked", "Drafted", "Reviewed", "Registered"]
        case .photos: ["Asked", "Assigned", "Visited", "Photos in"]
        case .errand: ["Asked", "At office", "Noted", "Updated"]
        case .rent: ["Asked", "Followed up", "Collected", "Receipted"]
        }
    }

    public static func of(_ raw: String) -> RequestKind {
        RequestKind(rawValue: raw.lowercased()) ?? .errand
    }
}

/// Where a request has got to, in words rather than a number.
public struct RequestProgress: Sendable, Equatable {
    public let stageIndex: Int
    public let stageName: String
    public let isDone: Bool
    /// The badge: what a person should read at a glance.
    public let status: String
}

public func requestProgress(kind: RequestKind, stage: Int,
                            needsYou: Bool, closed: Bool) -> RequestProgress {
    let stages = kind.stages
    // A stage index beyond the list means finished, however it got there.
    let clamped = max(0, min(stage, stages.count - 1))
    let done = closed || stage >= stages.count - 1

    let status: String
    if closed { status = "Done" }
    // "Needs you" outranks the stage name, because a request waiting on the
    // owner looks identical to one moving along — and only one of them is
    // going to stall for a month.
    else if needsYou { status = "Needs you" }
    else if clamped == 0 { status = "Asked" }
    else { status = stages[clamped] }

    return RequestProgress(stageIndex: clamped, stageName: stages[clamped],
                           isDone: done, status: status)
}

/// The Home chip: how much is outstanding, and whether any of it is on you.
public func openRequestSummary(_ items: [(needsYou: Bool, closed: Bool)]) -> String {
    let open = items.filter { !$0.closed }
    guard !open.isEmpty else { return "Get it done" }
    let waiting = open.filter(\.needsYou).count
    // The count alone reads as a badge to clear. The part waiting on YOU is the
    // part that will not move on its own.
    return waiting > 0
        ? "Get it done · \(open.count), \(waiting) on you"
        : "Get it done · \(open.count)"
}
