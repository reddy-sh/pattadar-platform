import Foundation

/// Is this paper already in the vault?
///
/// A passbook has recognised its own repeat scan for a while
/// (`findExistingPassbook`); a document never did. Every filing created a row,
/// so scanning one FMB sheet twice put two identical lines in the vault —
/// same survey, same extent, nothing to tell them apart and no way to know
/// which one to keep.
///
/// Identity is decided per family, because papers differ in what identifies
/// them. A registered deed is its number, its year and the office that
/// registered it. An FMB sheet carries no number at all: it is identified by
/// the land it maps, which is why a rule written only on numbers would have
/// missed the very case this exists for.
///
/// Nothing is decided automatically — same rule `DocumentMatch` follows. This
/// says what it found and why; a person chooses what happens to it.

/// What a scan claims this paper is.
public struct ScannedDocumentIdentity: Sendable {
    public var docType: String
    public var documentNo: String
    public var regYear: String
    public var sro: String
    public var village: String
    public var surveyNo: String

    public init(docType: String = "", documentNo: String = "", regYear: String = "",
                sro: String = "", village: String = "", surveyNo: String = "") {
        self.docType = docType
        self.documentNo = documentNo
        self.regYear = regYear
        self.sro = sro
        self.village = village
        self.surveyNo = surveyNo
    }

    /// Built from an extraction, using the keys the reader actually emits.
    public init(fields: [String: Any]) {
        func s(_ key: String) -> String {
            ((fields[key] as? String)
                ?? (fields[key] as? Int).map(String.init)
                ?? "").trimmingCharacters(in: .whitespaces)
        }
        self.init(docType: s("doc_type"),
                  documentNo: s("document_no"),
                  regYear: s("reg_year"),
                  sro: s("sro"),
                  village: s("village"),
                  surveyNo: s("survey_no"))
    }
}

/// A paper already on file that this scan appears to be.
public struct FiledDocumentMatch: Sendable {
    public enum Confidence: Sendable, Equatable {
        /// The identifying facts agree. This is the same paper.
        case same
        /// They agree as far as they go, and one side is missing something.
        case likely
    }

    public let existing: RegisteredDocument
    public let confidence: Confidence
    /// Why, in words. A verdict a person can check beats a yes they must trust.
    public let because: String
}

/// The paper in `all` that this scan already is, or nil.
public func findFiledDocument(_ all: [RegisteredDocument],
                              like scan: ScannedDocumentIdentity) -> FiledDocumentMatch? {
    // A confident answer anywhere in the vault beats a hesitant one, so the
    // strongest evidence is reported rather than whichever row came first.
    var fallback: FiledDocumentMatch?
    for candidate in all {
        guard let found = compare(candidate, scan) else { continue }
        if found.confidence == .same { return found }
        if fallback == nil { fallback = found }
    }
    return fallback
}

private func compare(_ existing: RegisteredDocument,
                     _ scan: ScannedDocumentIdentity) -> FiledDocumentMatch? {
    let scanNo = normalizeKey(scan.documentNo)
    let filedNo = normalizeKey(existing.documentNo)

    // A registered paper: the registrar's own identity for it.
    if !scanNo.isEmpty, !filedNo.isEmpty {
        guard scanNo == filedNo else { return nil }
        let scanYear = normalizeKey(scan.regYear)
        let filedYear = normalizeKey(existing.regYear)
        // Numbering restarts every year, so 6337/2019 and 6337/2024 are two
        // different transactions on quite possibly two different fields.
        if !scanYear.isEmpty, !filedYear.isEmpty, scanYear != filedYear { return nil }
        let label = scanYear.isEmpty ? scan.documentNo : "\(scan.documentNo) / \(scan.regYear)"
        return FiledDocumentMatch(
            existing: existing,
            confidence: scanYear.isEmpty || filedYear.isEmpty ? .likely : .same,
            because: "Document \(label) is already in your vault.")
    }

    // An unregistered paper — an FMB sheet, an adangal — is the land it maps.
    // Same family rather than same wording: "FMB" and "FMB sheet" are one kind
    // of paper, and a sale deed is never an adangal.
    let scanFamily = documentFamily(scan.docType)
    let filedFamily = documentFamily(existing.docType)
    guard !scanFamily.isEmpty, scanFamily == filedFamily else { return nil }

    let scanSurvey = normalizeKey(scan.surveyNo)
    let filedSurvey = normalizeKey(existing.surveyNo)
    // Nothing identifying is claimed for nothing identifying. Two FMB sheets
    // with no survey between them are not evidence of anything.
    guard !scanSurvey.isEmpty, scanSurvey == filedSurvey else { return nil }

    let scanVillage = normalizeKey(scan.village)
    let filedVillage = normalizeKey(existing.village)
    // Sy 1 exists in every village; the place carries as much of the identity
    // as the number does.
    if !scanVillage.isEmpty, !filedVillage.isEmpty, scanVillage != filedVillage { return nil }

    let where_ = [existing.village, existing.surveyNo.isEmpty ? "" : "Sy \(existing.surveyNo)"]
        .filter { !$0.isEmpty }.joined(separator: " · ")
    let complete = !scanVillage.isEmpty && !filedVillage.isEmpty
    return FiledDocumentMatch(
        existing: existing,
        confidence: complete ? .same : .likely,
        because: complete
            ? "A \(existing.docType) for \(where_) is already in your vault."
            : "A \(existing.docType) for \(where_) may be this same sheet — this reading did not name the village.")
}
