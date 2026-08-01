import Foundation

/// Re-scanning a passbook you already hold.
///
/// A pattadar passbook is a LIVING record: land is partitioned, sold, inherited
/// and re-surveyed, and the owner re-photographs the same khata a year later.
/// Creating a second passbook for it would split one holding into two — the
/// dashboard would double-count the acres and neither copy would be the truth.
///
/// So a repeat scan is treated as an UPDATE to be reviewed, never as a new
/// record and never as a silent overwrite. This computes what changed; the
/// person decides, row by row, what to accept.
///
/// The one rule that is not the person's to choose by default: a survey number
/// on file but absent from today's photograph is NOT deleted. A page that did
/// not fit in frame is far more likely than land that ceased to exist.

// MARK: - What a scan produced

public struct ScannedParcel: Sendable, Equatable {
    public let surveyNo: String
    public let subdivision: String
    /// Canonical decimal acres, already converted from whatever the paper said.
    public let acres: Double
    /// Provenance label — what the paper wrote, e.g. "Acres".
    public let unit: String
    public let classification: String
    public let acquisitionSource: String

    public init(surveyNo: String, subdivision: String = "", acres: Double,
                unit: String = "Acres", classification: String = "agri",
                acquisitionSource: String = "") {
        self.surveyNo = surveyNo
        self.subdivision = subdivision
        self.acres = acres
        self.unit = unit
        self.classification = classification
        self.acquisitionSource = acquisitionSource
    }
}

public struct ScannedPassbook: Sendable {
    public var pattadarNo: String
    public var ownerName: String
    public var fatherHusbandName: String
    public var state: String
    public var district: String
    public var mandal: String
    public var village: String
    public var parcels: [ScannedParcel]

    public init(pattadarNo: String, ownerName: String = "", fatherHusbandName: String = "",
                state: String = "", district: String = "", mandal: String = "",
                village: String = "", parcels: [ScannedParcel] = []) {
        self.pattadarNo = pattadarNo
        self.ownerName = ownerName
        self.fatherHusbandName = fatherHusbandName
        self.state = state
        self.district = district
        self.mandal = mandal
        self.village = village
        self.parcels = parcels
    }
}

// MARK: - Identity

/// A khata number identifies a passbook only WITHIN its village: number 5001
/// exists in every village in the state. Both halves, or the match is wrong.
///
/// Comparison ignores case, spacing and punctuation, because "1-C1B", "1 C1B"
/// and "1c1b" are one survey number written by three people.
public func normalizeKey(_ s: String) -> String {
    s.lowercased().filter { $0.isLetter || $0.isNumber }
}

public func passbookMatches(_ p: PassbookDetail, pattadarNo: String, village: String) -> Bool {
    !normalizeKey(pattadarNo).isEmpty
        && normalizeKey(p.pattadarNo) == normalizeKey(pattadarNo)
        && normalizeKey(p.village) == normalizeKey(village)
}

/// The passbook this scan is a new reading OF, if you already hold it.
public func findExistingPassbook(_ all: [PassbookDetail],
                                 pattadarNo: String, village: String) -> PassbookDetail? {
    all.first { passbookMatches($0, pattadarNo: pattadarNo, village: village) }
}

private func parcelKey(surveyNo: String, subdivision: String) -> String {
    let sub = normalizeKey(subdivision)
    return normalizeKey(surveyNo) + (sub.isEmpty ? "" : "/" + sub)
}

// MARK: - The diff

/// One survey number, and what this scan says about it.
public enum ParcelChange: Sendable, Identifiable {
    /// On the paper, not yet on file.
    case added(ScannedParcel)
    /// On both, but the extent or classification moved.
    case changed(existing: Parcel, scanned: ScannedParcel)
    /// On both and identical. Shown, but nothing to decide.
    case unchanged(existing: Parcel)
    /// On file, absent from this scan. NOT a deletion by default.
    case missing(existing: Parcel)

    public var id: String {
        switch self {
        case .added(let s): "add:" + parcelKey(surveyNo: s.surveyNo, subdivision: s.subdivision)
        case .changed(let e, _): "chg:" + e.id
        case .unchanged(let e): "same:" + e.id
        case .missing(let e): "gone:" + e.id
        }
    }

    /// Whether accepting it writes anything.
    public var isActionable: Bool {
        if case .unchanged = self { return false }
        return true
    }
}

/// A header field whose new reading disagrees with what is on file.
public struct FieldChange: Sendable, Identifiable {
    public let field: String
    public let label: String
    public let existing: String
    public let scanned: String
    public var id: String { field }
    /// Filling a blank is safe. Replacing a value someone entered is not, so
    /// it is offered rather than assumed.
    public var fillsABlank: Bool { existing.trimmingCharacters(in: .whitespaces).isEmpty }
}

public struct PassbookDiff: Sendable, Identifiable {
    public var id: String { passbook.id }
    public let passbook: PassbookDetail
    public let fields: [FieldChange]
    public let parcels: [ParcelChange]

    public var added: [ParcelChange] { parcels.filter { if case .added = $0 { true } else { false } } }
    public var changed: [ParcelChange] { parcels.filter { if case .changed = $0 { true } else { false } } }
    public var missing: [ParcelChange] { parcels.filter { if case .missing = $0 { true } else { false } } }
    public var unchanged: [ParcelChange] { parcels.filter { if case .unchanged = $0 { true } else { false } } }

    /// Nothing to decide — the scan agrees with the record in every particular.
    public var isIdentical: Bool { fields.isEmpty && parcels.allSatisfy { !$0.isActionable } }
}

/// Two extents are the same holding if they agree to well under a square yard.
/// Floating-point conversion noise must not be reported to a person as a change
/// to their land.
private let acreEpsilon = 1e-6

public func diffPassbook(existing: PassbookDetail,
                         parcels existingParcels: [Parcel],
                         scanned: ScannedPassbook) -> PassbookDiff {
    var fields: [FieldChange] = []
    func compare(_ field: String, _ label: String, _ was: String, _ now: String) {
        let a = was.trimmingCharacters(in: .whitespaces)
        let b = now.trimmingCharacters(in: .whitespaces)
        // A scan that read nothing is not evidence that the field is empty.
        guard !b.isEmpty, a.caseInsensitiveCompare(b) != .orderedSame else { return }
        fields.append(FieldChange(field: field, label: label, existing: a, scanned: b))
    }
    compare("ownerName", "Owner", existing.ownerName, scanned.ownerName)
    compare("fatherHusbandName", "Father / husband", existing.fatherHusbandName, scanned.fatherHusbandName)
    compare("mandal", "Mandal", existing.mandal, scanned.mandal)
    compare("district", "District", existing.district, scanned.district)
    compare("state", "State", existing.state, scanned.state)

    var changes: [ParcelChange] = []
    var seen = Set<String>()
    let onFile = Dictionary(
        existingParcels.map { (parcelKey(surveyNo: $0.surveyNo, subdivision: $0.subdivision), $0) },
        uniquingKeysWith: { a, _ in a })

    for s in scanned.parcels {
        let key = parcelKey(surveyNo: s.surveyNo, subdivision: s.subdivision)
        seen.insert(key)
        guard let e = onFile[key] else {
            changes.append(.added(s))
            continue
        }
        let sameExtent = abs(e.extent - s.acres) < acreEpsilon
        let sameClass = e.classification.caseInsensitiveCompare(s.classification) == .orderedSame
            || s.classification.isEmpty
        changes.append(sameExtent && sameClass ? .unchanged(existing: e) : .changed(existing: e, scanned: s))
    }
    for e in existingParcels where !seen.contains(parcelKey(surveyNo: e.surveyNo, subdivision: e.subdivision)) {
        changes.append(.missing(existing: e))
    }

    return PassbookDiff(passbook: existing, fields: fields, parcels: changes)
}

/// What happens to a row unless the person says otherwise.
///
/// Additions and corrections are accepted, because that is why the passbook was
/// re-scanned. Removals are NOT: land disappearing from a record is the one
/// outcome that cannot be undone from the phone, and a missed page looks
/// exactly like a sold parcel.
public func defaultDecision(for change: ParcelChange) -> Bool {
    switch change {
    case .added, .changed: true
    case .unchanged, .missing: false
    }
}

public func defaultDecision(for field: FieldChange) -> Bool { field.fillsABlank }
