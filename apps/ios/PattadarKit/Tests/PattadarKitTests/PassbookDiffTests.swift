import Foundation
import Testing

@testable import PattadarKit

/// The rules that decide whether a re-scanned passbook is the SAME passbook,
/// and what it changed. Getting this wrong either duplicates a holding or
/// quietly deletes land, so each rule is pinned.

private func parcel(_ id: String, _ survey: String, _ acres: Double,
                    sub: String = "", classification: String = "agri") -> Parcel {
    Parcel(id: id, passbookId: "pb", surveyNo: survey, subdivision: sub, extent: acres,
           unit: "Acres", classification: classification, acquisitionSource: "", status: "",
           label: "", address: "", geoPoint: "", boundary: "", stake: "", currentOwner: "",
           boundaryNorth: "", boundarySouth: "", boundaryEast: "", boundaryWest: "",
           purchasePrice: 0, purchaseDate: "", guidelineValue: 0, marketValue: 0,
           stampDuty: 0, loanAmount: 0, encumbranceStatus: "", regDocNo: "", sro: "",
           regDate: "", ecStatus: "", ecDate: "", mutationStatus: "", taxPaidUpto: "",
           litigation: false, litigationNote: "", createdAt: "")
}

private func book(_ no: String, village: String, owner: String = "Sankara Reddy Telukutla",
                  father: String = "", mandal: String = "", district: String = "",
                  state: String = "Andhra Pradesh") -> PassbookDetail {
    PassbookDetail(id: "pb", ref: "", pattadarNo: no, ownerName: owner,
                   fatherHusbandName: father, state: state, district: district,
                   mandal: mandal, village: village, totalExtent: 0, groupId: "", createdAt: "")
}

// MARK: - Identity

@Test("A khata number is only unique inside its village")
func khataNeedsItsVillage() {
    let mine = [book("5001", village: "Mangala Kunta")]
    // The same number in a different village is a DIFFERENT passbook. Matching
    // on the number alone would merge two people's land.
    #expect(findExistingPassbook(mine, pattadarNo: "5001", village: "Katragunta") == nil)
    #expect(findExistingPassbook(mine, pattadarNo: "5001", village: "Mangala Kunta") != nil)
    // Spelling and case vary between readings of the same paper.
    #expect(findExistingPassbook(mine, pattadarNo: "5001", village: "mangala kunta") != nil)
    #expect(findExistingPassbook(mine, pattadarNo: " 5001 ", village: "MangalaKunta") != nil)
    // An unreadable khata number matches nothing rather than everything.
    #expect(findExistingPassbook(mine, pattadarNo: "", village: "Mangala Kunta") == nil)
}

@Test("A survey number written three ways is one survey number")
func surveyNumbersNormalize() {
    let existing = [parcel("p1", "1-C1B", 5)]
    let d = diffPassbook(existing: book("5001", village: "V"), parcels: existing,
                         scanned: ScannedPassbook(pattadarNo: "5001", village: "V",
                                                  parcels: [ScannedParcel(surveyNo: "1 c1b", acres: 5)]))
    #expect(d.added.isEmpty, "\"1 c1b\" must not be filed as a second copy of \"1-C1B\"")
    #expect(d.unchanged.count == 1)
}

// MARK: - What changed

@Test("A re-scan reports additions, corrections and absences separately")
func diffSeparatesTheThreeCases() {
    let existing = [parcel("p1", "1-C1B", 5), parcel("p2", "1-D", 25), parcel("p3", "9", 2)]
    let scan = ScannedPassbook(
        pattadarNo: "5001", village: "Mangala Kunta",
        parcels: [
            ScannedParcel(surveyNo: "1-C1B", acres: 5),      // unchanged
            ScannedParcel(surveyNo: "1-D", acres: 20),       // partitioned since
            ScannedParcel(surveyNo: "14-A", acres: 3),       // newly acquired
        ])                                                    // Sy 9 not on this scan
    let d = diffPassbook(existing: book("5001", village: "Mangala Kunta"),
                         parcels: existing, scanned: scan)
    #expect(d.unchanged.count == 1)
    #expect(d.changed.count == 1)
    #expect(d.added.count == 1)
    #expect(d.missing.count == 1)
    #expect(!d.isIdentical)
}

@Test("Conversion noise is never reported as a change to someone's land")
func epsilonSwallowsFloatNoise() {
    let existing = [parcel("p1", "1", 30)]
    // 30 acres re-derived through guntas and back.
    let noisy = toAcres(fromAcres(30, .gunta), .gunta)
    let d = diffPassbook(existing: book("5001", village: "V"), parcels: existing,
                         scanned: ScannedPassbook(pattadarNo: "5001", village: "V",
                                                  parcels: [ScannedParcel(surveyNo: "1", acres: noisy)]))
    #expect(d.changed.isEmpty)
    #expect(d.isIdentical)
}

@Test("A second scan of an unchanged passbook asks for nothing")
func identicalScanIsIdentical() {
    let existing = [parcel("p1", "1-C1B", 5), parcel("p2", "1-D", 25)]
    let d = diffPassbook(
        existing: book("5001", village: "Mangala Kunta", owner: "Sankara Reddy Telukutla"),
        parcels: existing,
        scanned: ScannedPassbook(pattadarNo: "5001", ownerName: "Sankara Reddy Telukutla",
                                 village: "Mangala Kunta",
                                 parcels: [ScannedParcel(surveyNo: "1-C1B", acres: 5),
                                           ScannedParcel(surveyNo: "1-D", acres: 25)]))
    #expect(d.isIdentical, "re-scanning an unchanged passbook must not invent work")
}

// MARK: - Header fields

@Test("A blank scan field is not evidence the record is wrong")
func emptyScanFieldIsNotAChange() {
    // The reader could not make out the father's name. That is not a claim
    // that the name on file is wrong, and must not be offered as one.
    let d = diffPassbook(existing: book("5001", village: "V", father: "Nasara Reddy Telukutla"),
                         parcels: [],
                         scanned: ScannedPassbook(pattadarNo: "5001", fatherHusbandName: "", village: "V"))
    #expect(d.fields.isEmpty)
}

@Test("Filling a blank is safe by default; overwriting a value is not")
func fieldDefaultsProtectEnteredData() {
    let d = diffPassbook(existing: book("5001", village: "V", owner: "Telukutla Sankar Reddy", father: ""),
                         parcels: [],
                         scanned: ScannedPassbook(pattadarNo: "5001",
                                                  ownerName: "Sankara Reddy Telukutla",
                                                  fatherHusbandName: "Nasara Reddy Telukutla",
                                                  village: "V"))
    let owner = try! #require(d.fields.first { $0.field == "ownerName" })
    let father = try! #require(d.fields.first { $0.field == "fatherHusbandName" })
    #expect(father.fillsABlank)
    #expect(defaultDecision(for: father), "a blank field should take the reading")
    #expect(!owner.fillsABlank)
    #expect(!defaultDecision(for: owner), "a name someone entered is not overwritten unasked")
}

// MARK: - The rule that protects land

@Test("Land missing from a scan is never removed by default")
func missingParcelsAreNeverAutoDeleted() {
    let gone = ParcelChange.missing(existing: parcel("p3", "9", 2))
    #expect(!defaultDecision(for: gone),
            "a page that did not fit in frame looks exactly like a sold parcel")
    #expect(defaultDecision(for: .added(ScannedParcel(surveyNo: "14-A", acres: 3))))
    #expect(defaultDecision(for: .changed(existing: parcel("p2", "1-D", 25),
                                          scanned: ScannedParcel(surveyNo: "1-D", acres: 20))))
    #expect(!defaultDecision(for: .unchanged(existing: parcel("p1", "1", 5))))
}
