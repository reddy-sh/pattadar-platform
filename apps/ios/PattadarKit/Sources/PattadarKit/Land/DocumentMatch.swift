import Foundation

/// Does this document belong to that holding?
///
/// A passbook parcel starts with no deed: the passbook proves the holding, and
/// the sale deed turns up later, in a different folder, years afterwards. So a
/// document has to be attachable to land that already exists — and when it is
/// attached, what it says should be able to correct what was typed from the
/// passbook.
///
/// The danger is attaching the wrong paper. Land records are full of near-misses:
/// the same survey number in the next village, an adjacent subdivision, a deed
/// for the plot next door in the same layout. A wrong attachment does not look
/// wrong afterwards — it looks like provenance — so the match is EVIDENCE-BASED
/// and its reasons are shown rather than reduced to a yes.
///
/// Nothing is ever applied automatically. The verdict decides what the app
/// SUGGESTS; a person decides what is written.
public struct HoldingIdentity: Sendable {
    public var surveyNo: String
    public var subdivision: String
    public var plotNo: String
    public var village: String
    public var mandal: String
    /// Canonical acres, or 0 when unknown.
    public var acres: Double

    public init(surveyNo: String = "", subdivision: String = "", plotNo: String = "",
                village: String = "", mandal: String = "", acres: Double = 0) {
        self.surveyNo = surveyNo
        self.subdivision = subdivision
        self.plotNo = plotNo
        self.village = village
        self.mandal = mandal
        self.acres = acres
    }
}

public struct DocumentMatch: Sendable {
    public enum Level: Sendable {
        /// The survey or plot number AND the village agree. Safe to suggest.
        case strong
        /// Something agrees, but not enough to be sure — usually the village
        /// alone, which is true of every plot in it.
        case weak
        /// Something positively disagrees. Not the same land.
        case mismatch
    }
    public let level: Level
    /// What agreed, in plain words, shown to the person deciding.
    public let agreements: [String]
    /// What disagreed. A single entry here is enough to make it a mismatch.
    public let conflicts: [String]

    public var isSafeToSuggest: Bool { level == .strong }
}

/// Compare a reading against a holding.
public func matchDocument(_ identity: HoldingIdentity, fields: [String: Any]) -> DocumentMatch {
    let s = { (k: String) in ((fields[k] as? String) ?? "").trimmingCharacters(in: .whitespaces) }
    var agreements: [String] = []
    var conflicts: [String] = []

    // Survey number, normalised — "1-C1B", "1 C1B" and "1c1b" are one number.
    let docSurvey = normalizeKey(s("survey_no"))
    let mySurvey = normalizeKey(identity.surveyNo)
    var numberAgrees = false
    if !docSurvey.isEmpty && !mySurvey.isEmpty {
        if docSurvey == mySurvey {
            agreements.append("Survey number \(s("survey_no"))")
            numberAgrees = true
        } else {
            conflicts.append("This deed is for survey \(s("survey_no")), not \(identity.surveyNo)")
        }
    }

    // A plot number is the identity of a site the way a survey number is the
    // identity of farmland.
    let docPlots = plotNumbers(fields).map(normalizeKey).filter { !$0.isEmpty }
    let myPlot = normalizeKey(identity.plotNo)
    if !docPlots.isEmpty && !myPlot.isEmpty {
        if docPlots.contains(myPlot) {
            agreements.append("Plot number \(identity.plotNo)")
            numberAgrees = true
        } else {
            conflicts.append("This deed is for plot \(plotNumbers(fields).joined(separator: ", ")), not \(identity.plotNo)")
        }
    }

    // The village, allowing for the spelling drift between a passbook and a deed.
    var villageAgrees = false
    let docVillage = s("village")
    if !docVillage.isEmpty && !identity.village.isEmpty {
        if villageNamesMatch(docVillage, identity.village) {
            agreements.append("Village \(docVillage)")
            villageAgrees = true
        } else {
            conflicts.append("This deed is in \(docVillage), not \(identity.village)")
        }
    }

    // The extent, generously: a deed states what was conveyed, which may be a
    // part of the holding, so a difference is worth SAYING but is not proof of
    // the wrong land.
    let docExtent = parseExtent(s("extent"), default: .sqyd)
    if docExtent.value > 0 && identity.acres > 0 {
        let docAcres = toAcres(docExtent.value, docExtent.unit)
        let ratio = docAcres / identity.acres
        if abs(docAcres - identity.acres) < 1e-4 {
            agreements.append("Extent \(areaText(identity.acres, .acre))")
        } else if ratio > 0.02 && ratio < 50 {
            // Same order of magnitude: plausibly a part, or a re-survey.
            agreements.append("Extent differs — \(areaText(docAcres, .acre)) on the deed against \(areaText(identity.acres, .acre)) on file")
        } else {
            conflicts.append("Extent is far off — \(areaText(docAcres, .acre)) against \(areaText(identity.acres, .acre))")
        }
    }

    if !conflicts.isEmpty { return DocumentMatch(level: .mismatch, agreements: agreements, conflicts: conflicts) }
    // A number AND a village is the bar for suggesting changes. The village
    // alone is true of every plot in it, so it is only ever weak.
    let level: DocumentMatch.Level = (numberAgrees && villageAgrees) ? .strong
        : (numberAgrees || villageAgrees) ? .weak : .weak
    return DocumentMatch(level: level, agreements: agreements, conflicts: conflicts)
}

private func plotNumbers(_ fields: [String: Any]) -> [String] {
    if let list = fields["plot_nos"] as? [String], !list.isEmpty { return list }
    let single = ((fields["plot_no"] as? String) ?? "").trimmingCharacters(in: .whitespaces)
    return single.isEmpty ? [] : [single]
}
