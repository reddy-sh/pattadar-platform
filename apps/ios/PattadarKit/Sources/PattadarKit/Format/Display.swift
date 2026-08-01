import Foundation

/// Display helpers ported from `packages/core/src/format`.
///
/// These are copy rules, not arithmetic, so they are not vector-pinned — but
/// they carry the same hard-won behaviour, and the comments say why so the next
/// person does not "simplify" them back into the bugs they fix.

/// ₹1,91,000 — Indian grouping, which is how a deed writes it.
public func rupees(_ amount: Double) -> String {
    guard amount != 0 else { return "—" }
    let f = NumberFormatter()
    f.numberStyle = .decimal
    f.locale = Locale(identifier: "en_IN")
    f.maximumFractionDigits = 0
    return "₹" + (f.string(from: NSNumber(value: amount)) ?? "\(Int(amount))")
}

/// Audit timestamps arrive as `datetime.utcnow().isoformat()` — UTC with NO
/// zone marker. Parsed naively they are read as LOCAL time, which in Los
/// Angeles put every event seven hours in the future: everything said "just
/// now" and some rows landed on the wrong calendar day.
public func parseAuditTime(_ iso: String) -> Date? {
    let s = iso.trimmingCharacters(in: .whitespaces)
    guard !s.isEmpty else { return nil }
    let zoned = s.hasSuffix("Z") || s.range(of: #"[+-]\d{2}:?\d{2}$"#, options: .regularExpression) != nil
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = f.date(from: zoned ? s : s + "Z") { return d }
    f.formatOptions = [.withInternetDateTime]
    return f.date(from: zoned ? s : s + "Z")
}

/// "2h ago" / "Yesterday" / "3 Jul".
public func relativeTime(_ iso: String, now: Date = Date()) -> String {
    guard let d = parseAuditTime(iso) else { return iso }
    let mins = Int(now.timeIntervalSince(d) / 60)
    if mins < 1 { return "just now" }
    if mins < 60 { return "\(mins)m ago" }
    let hours = mins / 60
    if hours < 24 { return "\(hours)h ago" }
    let days = hours / 24
    if days == 1 { return "Yesterday" }
    if days < 7 { return "\(days)d ago" }
    let f = DateFormatter()
    f.dateFormat = "d MMM"
    return f.string(from: d)
}

/// Schema vocabulary is not user copy: `open_plot` → `Open plot`.
public func humanize(_ token: String) -> String {
    guard !token.isEmpty else { return "" }
    let words = token.replacingOccurrences(of: "_", with: " ")
    return words.prefix(1).uppercased() + words.dropFirst()
}

private let actionLabels: [String: String] = [
    "create_passbook": "Created a passbook", "delete_passbook": "Deleted a passbook",
    "create_parcel": "Added a parcel", "delete_parcel": "Removed a parcel",
    "update_parcel_geo": "Set a parcel’s location", "update_property_geo": "Set a property’s location",
    "create_document": "Added a document", "upload_document": "Uploaded a document",
    "delete_document": "Deleted a document",
    // "registered document" is a term of art at the sub-registrar's office; to
    // the person holding the phone these are all just documents.
    "create_registered_document": "Added a document", "delete_registered_document": "Deleted a document",
    "link_document_property": "Attached a document", "link_document_parcel": "Attached a document",
    "create_property": "Added a property", "delete_property": "Deleted a property",
    "create_group": "Created a group", "delete_group": "Deleted a group",
    "add_member": "Added a member", "remove_member": "Removed a member",
    "reveal_aadhaar": "Viewed an Aadhaar number", "update_profile": "Updated your profile",
]

public func actionLabel(_ action: String) -> String {
    actionLabels[action] ?? humanize(action)
}

/// Destructive actions read differently and must be coloured as such wherever
/// the feed appears. Derived from the verb so a new `delete_*` mutation is
/// covered the day it ships, not the day someone remembers to list it.
public func isDestructive(_ action: String) -> Bool {
    action.hasPrefix("delete_") || action.hasPrefix("remove_") || action.hasPrefix("revoke_")
}

private let uuidPattern = #"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"#

/// The object an audit row acted on, or "" when the row can only restate
/// itself. A raw UUID is NEVER user-facing copy.
public func eventEntity(action: String, target: String, details: String) -> String {
    for candidate in [details, target] {
        let t = candidate.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty,
              t.range(of: uuidPattern, options: [.regularExpression, .caseInsensitive]) == nil
        else { continue }
        // A detail that merely restates the label earns nothing: the log used
        // to read "Delete registered document · Deleted registered document".
        let label = actionLabel(action).lowercased()
        let stem = { (w: String) in w.replacingOccurrences(of: #"(ed|d|s)$"#, with: "", options: .regularExpression) }
        let labelWords = Set(label.split(whereSeparator: { !$0.isLetter }).map { stem(String($0)) })
        // Stemmed like the detail is, or "cleared" never matches "clear" and
        // the row reads "Set a parcel's location · Location cleared" — the
        // label and the detail saying the same thing, which is the bug this
        // whole function exists to prevent.
        let generic = Set(["a", "an", "the", "registered", "document", "property", "passbook",
                           "parcel", "member", "group", "profile", "location", "set", "cleared",
                           "updated", "added", "created", "removed", "stake"].map(stem))
        let informative = t.lowercased().split(whereSeparator: { !$0.isLetter && !$0.isNumber })
            .map { stem(String($0)) }
            .contains { !labelWords.contains($0) && !generic.contains($0) }
        if informative { return humanize(t) }
    }
    return ""
}

/// A date as a person writes it: "19 July 2009".
///
/// Registration dates arrive as "2003-01-04" from the reader and are shown
/// verbatim, which reads as a database value on a page a person is checking
/// against paper. Worse, "04-01-2003" and "2003-01-04" are both in circulation —
/// and in a land record the difference between 4 January and 1 April is the
/// difference between two deeds.
///
/// Only unambiguous shapes are reformatted. Anything else is returned exactly as
/// it came, because guessing which half is the month is how a date silently
/// becomes the wrong date.
public func humanDate(_ raw: String) -> String {
    let s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !s.isEmpty else { return "" }

    let out = DateFormatter()
    out.locale = Locale(identifier: "en_IN")
    out.dateFormat = "d MMMM yyyy"

    // ISO, which is what the reader is asked for: year first, unambiguous.
    if let m = firstMatch(#"^(\d{4})-(\d{2})-(\d{2})"#, in: s), m.count == 4 {
        var c = DateComponents()
        c.year = Int(m[1]); c.month = Int(m[2]); c.day = Int(m[3])
        if let d = Calendar(identifier: .gregorian).date(from: c),
           (1...12).contains(c.month ?? 0), (1...31).contains(c.day ?? 0) {
            return out.string(from: d)
        }
    }
    // "04-01-2003" or "04/01/2003" — Indian convention is day first, and the
    // reader is told to emit ISO, so this only appears when a value came
    // straight off the page.
    if let m = firstMatch(#"^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$"#, in: s), m.count == 4 {
        let day = Int(m[1]) ?? 0, month = Int(m[2]) ?? 0
        // A day above 12 proves which half is which. Below that it is genuinely
        // ambiguous, and the raw text is the honest answer.
        guard day > 12, (1...12).contains(month) else { return s }
        var c = DateComponents()
        c.year = Int(m[3]); c.month = month; c.day = day
        if let d = Calendar(identifier: .gregorian).date(from: c) {
            return out.string(from: d)
        }
    }
    return s
}
