import Foundation
import Testing

@testable import PattadarKit

/// The same paper, filed twice, is not two papers.
///
/// Passbooks have recognised a repeat scan for a while (`findExistingPassbook`).
/// Documents never did: every filing made a row, so scanning one FMB sheet
/// twice put two identical "FMB · Sy. 1 sheet · 59.9 ac mapped" lines in the
/// vault with nothing to tell them apart, and no way to know which to keep.

private func filed(
    id: String = "d1", docType: String = "Sale Deed", documentNo: String = "",
    regYear: String = "", sro: String = "", village: String = "", surveyNo: String = ""
) -> RegisteredDocument {
    RegisteredDocument(
        id: id, ref: "", documentNo: documentNo, docType: docType, sro: sro,
        village: village, mandal: "", district: "",
        boundaryNorth: "", boundarySouth: "", boundaryEast: "", boundaryWest: "",
        surveyNo: surveyNo, plotNo: "", extent: "", consideration: 0, regYear: regYear,
        registrationDate: "", propertyId: "", parcelId: "", passbookId: "",
        headline: "", summary: "", keyPointList: [], caveatList: [],
        createdAt: "", reading: "")
}

@Suite("Filing a paper that is already in the vault")
struct DocumentDuplicateTests {
    @Test("A registered deed is its number and year")
    func registeredDeedMatchesOnNumberAndYear() {
        let vault = [filed(id: "a", documentNo: "6337", regYear: "2024", village: "Mangalakunta")]
        let again = ScannedDocumentIdentity(
            docType: "Sale Deed", documentNo: "6337", regYear: "2024")

        let hit = findFiledDocument(vault, like: again)
        #expect(hit?.existing.id == "a")
        #expect(hit?.confidence == .same)
        // A verdict a person can check beats a yes they have to trust.
        #expect(hit?.because.contains("6337") == true)
    }

    @Test("The same number in a different year is a different paper")
    func numbersAreNotUniqueAcrossYears() {
        let vault = [filed(id: "a", documentNo: "6337", regYear: "2024")]
        let other = ScannedDocumentIdentity(
            docType: "Sale Deed", documentNo: "6337", regYear: "2019")
        // Registrars restart numbering every year; 6337/2019 and 6337/2024 are
        // two different transactions on, quite possibly, two different fields.
        #expect(findFiledDocument(vault, like: other) == nil)
    }

    @Test("A sheet with no number is the land it maps")
    func unregisteredPapersMatchOnPlace() {
        // The founder's case: one FMB sheet for Sy 1 in Mangalakunta, filed
        // twice. An FMB has no registration number at all, so a rule written
        // only on numbers would never catch it — which is exactly what
        // happened.
        let vault = [filed(id: "a", docType: "FMB", village: "Mangalakunta", surveyNo: "1")]
        let again = ScannedDocumentIdentity(
            docType: "FMB", village: "Mangalakunta", surveyNo: "1")

        let hit = findFiledDocument(vault, like: again)
        #expect(hit?.existing.id == "a")
        #expect(hit?.confidence == .same)
    }

    @Test("The same survey number in the next village is not the same sheet")
    func placeMattersAsMuchAsSurvey() {
        let vault = [filed(id: "a", docType: "FMB", village: "Mangalakunta", surveyNo: "1")]
        let elsewhere = ScannedDocumentIdentity(
            docType: "FMB", village: "Kondapur", surveyNo: "1")
        // Land records are full of near-misses; Sy 1 exists in every village.
        #expect(findFiledDocument(vault, like: elsewhere) == nil)
    }

    @Test("A missing village is a maybe, never a yes")
    func incompleteEvidenceIsOnlyLikely() {
        let vault = [filed(id: "a", docType: "FMB", village: "Mangalakunta", surveyNo: "1")]
        let unsure = ScannedDocumentIdentity(docType: "FMB", surveyNo: "1")

        let hit = findFiledDocument(vault, like: unsure)
        #expect(hit?.existing.id == "a")
        #expect(hit?.confidence == .likely)
    }

    @Test("Two kinds of paper about one field are not duplicates")
    func differentPapersAboutTheSameLandCoexist() {
        // The whole point of a vault: an FMB sheet and an Adangal for Sy 1 are
        // both wanted, and neither replaces the other.
        let vault = [filed(id: "a", docType: "FMB", village: "Mangalakunta", surveyNo: "1")]
        let adangal = ScannedDocumentIdentity(
            docType: "ROR/Adangal", village: "Mangalakunta", surveyNo: "1")
        #expect(findFiledDocument(vault, like: adangal) == nil)
    }

    @Test("Spelling and spacing do not make a second paper")
    func matchingIsNormalised() {
        let vault = [filed(id: "a", docType: "FMB", village: "Mangalakunta", surveyNo: "1")]
        let messy = ScannedDocumentIdentity(
            docType: "  fmb ", village: "mangalakunta", surveyNo: " 1 ")
        #expect(findFiledDocument(vault, like: messy)?.confidence == .same)
    }

    @Test("Nothing identifying means nothing is claimed")
    func anEmptyReadingNeverMatches() {
        let vault = [filed(id: "a", docType: "FMB", village: "Mangalakunta", surveyNo: "1")]
        #expect(findFiledDocument(vault, like: ScannedDocumentIdentity(docType: "FMB")) == nil)
        #expect(findFiledDocument(vault, like: ScannedDocumentIdentity()) == nil)
    }

    @Test("Reads the keys the extraction actually emits")
    func buildsFromScannedFields() {
        let id = ScannedDocumentIdentity(fields: [
            "doc_type": "FMB", "village": "Mangalakunta", "survey_no": "1",
        ])
        #expect(id.docType == "FMB")
        #expect(id.village == "Mangalakunta")
        #expect(id.surveyNo == "1")
    }
}
