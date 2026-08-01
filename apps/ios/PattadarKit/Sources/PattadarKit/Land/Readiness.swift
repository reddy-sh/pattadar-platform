import Foundation

/// Record-ready: would these papers stand up if a bank or a buyer asked today?
///
/// A count of documents answers nothing — ten receipts and no title deed is a
/// full folder and an unsellable field. So the score is the proportion of checks
/// a holding PASSES, and every failure carries the sentence a person would say
/// about it ("mutation still pending", "no title document on file").
///
/// Every check is backed by a field the records actually hold. Nothing here is
/// inferred from a document count or a vibe, because a readiness score that
/// cannot say WHY it is 79% is a number that gets ignored the second time it is
/// seen.
public struct ReadinessCheck: Sendable, Identifiable {
    public let id: String
    /// What it means when this fails, in words.
    public let problem: String
    public let passed: Bool
    /// Failing this makes the holding unsellable rather than merely untidy.
    public let blocking: Bool
}

public struct Readiness: Sendable {
    public let checks: [ReadinessCheck]

    public var failures: [ReadinessCheck] { checks.filter { !$0.passed } }
    public var blocking: [ReadinessCheck] { failures.filter(\.blocking) }

    /// 0–100, the share of checks passed. Rounded down: 99% must mean "one
    /// thing left", never "close enough".
    public var score: Int {
        guard !checks.isEmpty else { return 0 }
        return Int((Double(checks.count - failures.count) / Double(checks.count)) * 100)
    }

    public var isReady: Bool { failures.isEmpty }
}

/// What a holding needs before somebody else would accept it.
public struct ReadinessInput: Sendable {
    public var hasTitleDocument: Bool
    public var hasLocation: Bool
    public var hasRegistrationNumber: Bool
    public var mutationStatus: String
    public var ecStatus: String
    public var taxPaidUpto: String
    public var litigation: Bool

    public init(hasTitleDocument: Bool = false, hasLocation: Bool = false,
                hasRegistrationNumber: Bool = false, mutationStatus: String = "",
                ecStatus: String = "", taxPaidUpto: String = "", litigation: Bool = false) {
        self.hasTitleDocument = hasTitleDocument
        self.hasLocation = hasLocation
        self.hasRegistrationNumber = hasRegistrationNumber
        self.mutationStatus = mutationStatus
        self.ecStatus = ecStatus
        self.taxPaidUpto = taxPaidUpto
        self.litigation = litigation
    }
}

/// A tax year like "2025-26" or "FY 2025-26" is current if it is this year or
/// last. Two years unpaid is what a buyer's advocate notices.
public func taxIsCurrent(_ raw: String, thisYear: Int) -> Bool {
    guard let m = firstMatch(#"(20\d{2})"#, in: raw), let year = Int(m[1]) else { return false }
    return year >= thisYear - 1
}

public func assessReadiness(_ input: ReadinessInput, thisYear: Int) -> Readiness {
    let mutation = input.mutationStatus.lowercased()
    let ec = input.ecStatus.lowercased()

    let checks: [ReadinessCheck] = [
        // The single thing without which nothing else matters.
        .init(id: "title", problem: "No title document on file",
              passed: input.hasTitleDocument, blocking: true),
        // Land that has not been mutated is still the seller's on the revenue
        // record, whatever the deed says.
        .init(id: "mutation", problem: mutation.contains("pend")
                ? "Mutation still pending" : "Mutation not recorded",
              passed: mutation.contains("done") || mutation.contains("complet")
                   || mutation.contains("record"),
              blocking: true),
        .init(id: "ec", problem: ec.isEmpty ? "No encumbrance certificate"
                : "Encumbrance certificate needs refreshing",
              passed: ec.contains("nil") || ec.contains("clear") || ec.contains("clean"),
              blocking: false),
        .init(id: "tax", problem: input.taxPaidUpto.isEmpty
                ? "No land tax receipt on file" : "Land tax is behind",
              passed: taxIsCurrent(input.taxPaidUpto, thisYear: thisYear), blocking: false),
        .init(id: "location", problem: "Not pinned on the map",
              passed: input.hasLocation, blocking: false),
        .init(id: "registration", problem: "No registered document number",
              passed: input.hasRegistrationNumber, blocking: false),
        // Stated as a check so it lands in the same list rather than being a
        // separate warning somebody has to notice on its own.
        .init(id: "litigation", problem: "Under litigation",
              passed: !input.litigation, blocking: true),
    ]
    return Readiness(checks: checks)
}

/// The one line the dashboard shows: how many holdings would not survive
/// scrutiny, and what is wrong with the worst of them.
///
/// Names the holdings rather than counting them. "Three parcels need attention"
/// sends somebody hunting; "Kondapur's mutation is pending" is a thing to do.
public func readinessBlurb(_ items: [(name: String, readiness: Readiness)]) -> String {
    let failing = items.filter { !$0.readiness.isReady }
    guard !failing.isEmpty else {
        return items.isEmpty
            ? "Nothing recorded yet."
            : "Every holding on file would stand up to scrutiny today."
    }
    let named = failing.prefix(3).map { item -> String in
        let worst = item.readiness.blocking.first ?? item.readiness.failures.first
        let problem = (worst?.problem ?? "needs attention")
        return "\(item.name) — \(problem.prefix(1).lowercased() + problem.dropFirst())"
    }
    let count = failing.count
    let noun = count == 1 ? "holding" : "holdings"
    let more = count > 3 ? ", and \(count - 3) more" : ""
    return "\(count) \(noun) would not survive a bank's scrutiny today: "
        + named.joined(separator: "; ") + more + "."
}
