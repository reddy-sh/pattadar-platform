import Foundation
import Testing

@testable import PattadarKit

/// Whether a document belongs to a holding. A wrong attachment does not look
/// wrong afterwards — it looks like provenance — so these rules are strict about
/// what counts as evidence.

private func mangalakunta() -> HoldingIdentity {
    HoldingIdentity(surveyNo: "1-C1B", village: "Mangala Kunta",
                    mandal: "Tarlapadu", acres: 5)
}

@Test("A number and a village together are enough to suggest changes")
func numberPlusVillageIsStrong() {
    let m = matchDocument(mangalakunta(), fields: [
        "survey_no": "1 c1b", "village": "Mangalakunta", "extent": "5.00 acres",
    ])
    #expect(m.level == .strong)
    #expect(m.isSafeToSuggest)
    #expect(m.conflicts.isEmpty)
}

@Test("The village alone is never enough")
func villageAloneIsWeak() {
    // True of every plot in the village. Suggesting edits off this would let a
    // neighbour's deed rewrite your extent.
    let m = matchDocument(mangalakunta(), fields: ["village": "Mangala Kunta"])
    #expect(m.level == .weak)
    #expect(!m.isSafeToSuggest)
}

@Test("The same survey number in another village is a mismatch")
func sameNumberDifferentVillageIsRejected() {
    // Survey 1-C1B exists in every village in the state.
    let m = matchDocument(mangalakunta(), fields: [
        "survey_no": "1-C1B", "village": "Katragunta",
    ])
    #expect(m.level == .mismatch)
    #expect(m.conflicts.contains { $0.contains("Katragunta") })
}

@Test("A deed for the next survey number is a mismatch")
func differentNumberIsRejected() {
    let m = matchDocument(mangalakunta(), fields: [
        "survey_no": "1-D", "village": "Mangala Kunta",
    ])
    #expect(m.level == .mismatch)
    #expect(m.conflicts.contains { $0.contains("1-D") })
}

@Test("A plot number identifies a site the way a survey number identifies land")
func plotNumbersMatch() {
    let site = HoldingIdentity(plotNo: "70A", village: "Nallapadu", acres: 0.0865)
    let m = matchDocument(site, fields: [
        "plot_nos": ["53", "70A", "70B"], "village": "Nallapadu",
    ])
    #expect(m.level == .strong)

    // The plot next door in the same layout is the classic wrong attachment.
    let neighbour = matchDocument(HoldingIdentity(plotNo: "150", village: "Nallapadu"),
                                  fields: ["plot_nos": ["70A"], "village": "Nallapadu"])
    #expect(neighbour.level == .mismatch)
}

@Test("A smaller extent on the deed is reported, not rejected")
func partialExtentIsNotAMismatch() {
    // A deed conveys what was sold, which is often a part of the holding. That
    // is worth saying out loud and is not evidence of the wrong land.
    let m = matchDocument(mangalakunta(), fields: [
        "survey_no": "1-C1B", "village": "Mangala Kunta", "extent": "2.50 acres",
    ])
    #expect(m.level == .strong)
    #expect(m.agreements.contains { $0.contains("Extent differs") })
}

@Test("An extent off by orders of magnitude is a mismatch")
func wildExtentIsRejected() {
    let m = matchDocument(mangalakunta(), fields: [
        "survey_no": "1-C1B", "village": "Mangala Kunta", "extent": "418 sq. yards",
    ])
    // 418 sq yd against 5 acres is not a partition, it is a different record.
    #expect(m.level == .mismatch)
}

@Test("A document that says nothing identifying is weak, never strong")
func silentDocumentIsWeak() {
    let m = matchDocument(mangalakunta(), fields: ["doc_type": "Tax Receipt"])
    #expect(m.level == .weak)
    #expect(m.agreements.isEmpty)
    #expect(m.conflicts.isEmpty)
}
