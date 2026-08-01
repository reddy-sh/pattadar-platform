import Foundation

/// What the notification says when a document has finished being read.
///
/// The read now finishes while the app is closed, so this banner is often the
/// ONLY thing a person sees about it — which makes its wording the whole
/// interface for that moment. "Document read" described the machine's state and
/// left two questions unanswered: read as WHAT, and is it saved?
///
/// The second question is the important one. Nothing has been written to the
/// records at this point: the reading is a proposal waiting on a human. A banner
/// that reads like a confirmation invites somebody to walk away believing their
/// deed is filed, and discover months later that it never was.
public struct ReadNotification: Sendable, Equatable {
    public let title: String
    public let body: String
}

/// The banner for a finished read.
public func readReadyNotification(_ fields: [String: Any]) -> ReadNotification {
    let docType = (fields["doc_type"] as? String) ?? ""
    let kind = documentKind(docType)
    // The document names itself where it can; the kind is the fallback.
    let what = docType.trimmingCharacters(in: .whitespaces).isEmpty ? kind.label : docType

    let headline = ((fields["headline"] as? String) ?? "")
        .trimmingCharacters(in: .whitespacesAndNewlines)

    var summary = headline
    if summary.isEmpty { summary = fallbackSummary(fields) }

    // A passbook's point is how many holdings it lists, and that number decides
    // whether the reading looks complete against the paper in your hand.
    let parcels = (fields["parcels"] as? [[String: Any]] ?? []).count
    if parcels > 0 {
        let count = "\(parcels) survey \(parcels == 1 ? "number" : "numbers")"
        summary = summary.isEmpty ? count : summary + " · " + count
    }

    let action = "Tap to check it — nothing has been saved yet."
    let body = summary.isEmpty ? action : summary + " " + action
    return ReadNotification(title: "\(what) ready to review", body: body)
}

/// When the reader produced no headline, the facts most likely to identify the
/// document to the person who photographed it.
private func fallbackSummary(_ fields: [String: Any]) -> String {
    let s = { (k: String) in ((fields[k] as? String) ?? "").trimmingCharacters(in: .whitespaces) }
    var parts: [String] = []
    if !s("extent").isEmpty { parts.append(s("extent")) }
    let place = placeQuery([s("village"), s("mandal")], country: "")
    if !place.isEmpty { parts.append("in " + place) }
    if !s("pattadar_no").isEmpty { parts.append("Khata " + s("pattadar_no")) }
    if !s("owner_name").isEmpty { parts.append(s("owner_name")) }
    return parts.joined(separator: " · ")
}

/// The banner when a read failed. Names the cause, and says plainly that
/// nothing changed — a failure people cannot interpret gets re-tried blindly.
public func readFailedNotification(_ reason: String) -> ReadNotification {
    let trimmed = reason.trimmingCharacters(in: .whitespacesAndNewlines)
    let cause = trimmed.isEmpty ? "The read did not finish." : trimmed
    return ReadNotification(
        title: "Couldn’t read the document",
        body: String(cause.prefix(140)) + " Nothing was saved — the document is still on your phone.")
}
