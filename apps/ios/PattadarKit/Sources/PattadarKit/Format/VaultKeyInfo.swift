import Foundation

/// The one line a vault row shows: the facts a person recognises THAT KIND
/// of paper by.
///
/// Different papers are known by different facts. A sale deed is known by
/// its number, year, extent and who it made the owner; a passbook or 1-B by
/// the khata and whose name is on it; an FMB by the village and the extent
/// it draws; an Aadhaar by the name and date of birth. One generic line for
/// all of them showed each kind's least interesting fields — and the row's
/// caveats, which belong on the detail screen, drowned what little it said.
public func vaultKeyInfo(
    docType: String,
    documentNo: String = "",
    regYear: String = "",
    village: String = "",
    surveyNo: String = "",
    extent: String = "",
    reading: [String: Any] = [:]
) -> String {
    let kind = docType.lowercased()
    func str(_ key: String) -> String {
        (reading[key] as? String ?? "").trimmingCharacters(in: .whitespaces)
    }
    /// The party who ENDED UP with the land — the current owner as this
    /// deed tells it.
    func buyer() -> String {
        guard let parties = reading["parties"] as? [[String: Any]] else { return "" }
        let buyer = parties.first { ($0["role"] as? String)?.lowercased() == "buyer" }
        return (buyer?["name"] as? String ?? "").trimmingCharacters(in: .whitespaces)
    }
    func joined(_ parts: [String]) -> String {
        parts.filter { !$0.isEmpty }.joined(separator: " · ")
    }
    let docNoLine = documentNo.isEmpty ? ""
        : (regYear.isEmpty ? "Doc \(documentNo)" : "Doc \(documentNo)/\(regYear)")

    // Deeds: the number, the land, the person it made the owner.
    if kind.contains("deed") || kind.contains("gpa") || kind.contains("mortgage") {
        return joined([docNoLine, extent, buyer()])
    }
    // Revenue records: the khata, whose name is on it, where.
    if kind.contains("ror") || kind.contains("adangal") || kind.contains("passbook")
        || kind.contains("pahani") || kind.contains("1-b") || kind.contains("1b") {
        let khata = [str("pattadar_no"), str("khata_no")].first { !$0.isEmpty } ?? ""
        let holder = [str("owner_name"), buyer()].first { !$0.isEmpty } ?? ""
        return joined([khata.isEmpty ? "" : "Khata \(khata)", holder, village])
    }
    // Survey drawings: which land, how much it draws.
    if kind.contains("fmb") || kind.contains("map") || kind.contains("field measurement") {
        return joined([village, surveyNo.isEmpty ? "" : "Sy \(surveyNo)", extent])
    }
    // Identity papers: who, born when.
    if kind.contains("aadhaar") || kind.contains("aadhar") {
        return joined([str("name"), str("dob")])
    }
    // Encumbrance: the number and the land it certifies.
    if kind.contains("encumbrance") || kind == "ec" {
        return joined([docNoLine, surveyNo.isEmpty ? "" : "Sy \(surveyNo)", village])
    }

    // Unknown kind: find the key facts automatically — the first few
    // identifying things the reading actually contains, in a stable order.
    let auto = [
        surveyNo.isEmpty ? "" : "Sy \(surveyNo)",
        str("pattadar_no").isEmpty ? "" : "Khata \(str("pattadar_no"))",
        [str("owner_name"), buyer(), str("name")].first { !$0.isEmpty } ?? "",
        extent,
        docNoLine,
        village,
    ]
    return joined(Array(auto.filter { !$0.isEmpty }.prefix(3)))
}
