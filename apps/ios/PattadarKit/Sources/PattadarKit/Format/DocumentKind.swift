import Foundation

/// What kind of paper a document is, for the icon that stands in front of it.
///
/// A list where every row carries the same grey page icon makes the reader
/// parse text to find anything: a sale deed, a passbook and an EC all look
/// identical until you read them. In a land record the KIND is the first thing
/// that matters — it decides what the document proves — so it gets the glyph.
///
/// The classification is here rather than in the view because it is a rule, not
/// a layout: "1-B", "ROR" and "Adangal" are the same kind of paper, and that
/// fact should be tested, not buried in a `switch` inside a row.
public enum DocumentKind: String, Sendable, CaseIterable {
    case saleDeed, giftDeed, partition, will, powerOfAttorney
    case passbook, encumbrance, mutation, taxReceipt, identity, other

    /// SF Symbol. Every one is verified by `check-symbols.sh` — a name that
    /// does not exist renders as a blank space, which is worse than the grey
    /// page it replaced.
    public var icon: String {
        switch self {
        case .saleDeed: "doc.text.fill"
        case .giftDeed: "gift.fill"
        case .partition: "square.split.2x1.fill"
        case .will: "scroll.fill"
        case .powerOfAttorney: "person.text.rectangle.fill"
        case .passbook: "book.closed.fill"
        case .encumbrance: "checkmark.seal.fill"
        case .mutation: "arrow.triangle.2.circlepath"
        case .taxReceipt: "indianrupeesign.circle.fill"
        case .identity: "person.crop.rectangle.fill"
        case .other: "doc.fill"
        }
    }

    /// Named rather than a `Color`, so this stays free of SwiftUI and testable.
    public var tint: String {
        switch self {
        case .saleDeed: "blue"
        case .giftDeed: "pink"
        case .partition: "orange"
        case .will: "brown"
        case .powerOfAttorney: "purple"
        case .passbook: "green"
        case .encumbrance: "teal"
        case .mutation: "indigo"
        case .taxReceipt: "mint"
        case .identity: "gray"
        case .other: "secondary"
        }
    }

    /// Shown when the document has no type of its own to state.
    public var label: String {
        switch self {
        case .saleDeed: "Sale deed"
        case .giftDeed: "Gift deed"
        case .partition: "Partition"
        case .will: "Will"
        case .powerOfAttorney: "Power of attorney"
        case .passbook: "Passbook"
        case .encumbrance: "Encumbrance certificate"
        case .mutation: "Mutation"
        case .taxReceipt: "Tax receipt"
        case .identity: "Identity"
        case .other: "Document"
        }
    }
}

/// Read the kind out of whatever the document calls itself.
///
/// The type is free text from an AI reading — "Sale Deed", "SALE DEED (ABSOLUTE)",
/// "ROR/Adangal", "1-B Register" — so it is matched on substrings rather than
/// compared, and the ORDER of the tests matters where words overlap.
public func documentKind(_ docType: String) -> DocumentKind {
    let s = docType.lowercased()

    // Tested before "deed": a General Power of Attorney is frequently written
    // "GPA deed", and it does NOT transfer title the way a sale deed does.
    if s.contains("power of attorney") || s.contains("gpa") || s.contains("attorney") {
        return .powerOfAttorney
    }
    // Before "sale": a settlement or gift is not a purchase, and conflating
    // them misstates how the land was acquired.
    if s.contains("gift") || s.contains("settlement") || s.contains("dana") { return .giftDeed }
    if s.contains("partition") || s.contains("bhagam") { return .partition }
    if s.contains("will") || s.contains("testament") { return .will }
    if s.contains("passbook") || s.contains("ror") || s.contains("adangal")
        || s.contains("1-b") || s.contains("1b") || s.contains("pahani") { return .passbook }
    if s.contains("encumbrance") || s.contains("ec ") || s == "ec" { return .encumbrance }
    if s.contains("mutation") { return .mutation }
    if s.contains("tax") || s.contains("receipt") || s.contains("challan") { return .taxReceipt }
    if s.contains("aadhaar") || s.contains("aadhar") || s.contains("pan")
        || s.contains("identity") { return .identity }
    if s.contains("sale") || s.contains("deed") || s.contains("conveyance") { return .saleDeed }
    return .other
}
