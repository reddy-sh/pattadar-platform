import Foundation
import Testing

@testable import PattadarKit

/// The banner is often the ONLY thing seen about a read, because the read now
/// finishes while the app is closed. Its wording is the interface.

@Test("The banner names what was read, not that the machine finished")
func titleNamesTheDocument() {
    let n = readReadyNotification([
        "doc_type": "Sale Deed",
        "headline": "Chakka Seetharamlakshmi sold 191 sq yd plot in Ankireddipalem for Rs 1,91,000",
    ])
    #expect(n.title == "Sale Deed ready to review")
    // "Document read" answered neither "read as what" nor "is it saved".
    #expect(n.title != "Document read")
}

@Test("The banner never implies the record was saved")
func nothingIsClaimedToBeSaved() {
    let n = readReadyNotification(["doc_type": "Sale Deed", "headline": "X sold Y to Z"])
    // Nothing is written until a person accepts the reading. A banner that
    // reads like a confirmation lets somebody walk away believing their deed is
    // filed and find out months later that it never was.
    #expect(n.body.contains("nothing has been saved yet"))
    #expect(n.body.contains("X sold Y to Z"))
}

@Test("A passbook says how many holdings it listed")
func passbookReportsItsCount() {
    let n = readReadyNotification([
        "doc_type": "ROR/Adangal",
        "headline": "Sankara Reddy Telukutla holds land in Mangala Kunta",
        "parcels": [["survey_no": "1-C1B"], ["survey_no": "1-D"]],
    ])
    // The count is what tells you whether the reading is complete against the
    // paper in your hand.
    #expect(n.body.contains("2 survey numbers"))
    #expect(readReadyNotification([
        "doc_type": "ROR/Adangal", "parcels": [["survey_no": "1"]],
    ]).body.contains("1 survey number"), "singular, not \"1 survey numbers\"")
}

@Test("With no headline, the identifying facts stand in")
func fallbackSummaryIdentifiesTheDocument() {
    let n = readReadyNotification([
        "doc_type": "Pattadar Passbook",
        "extent": "30.00 acres", "village": "Mangala Kunta", "mandal": "Tarlapadu",
        "pattadar_no": "5001", "owner_name": "Sankara Reddy Telukutla",
    ])
    #expect(n.body.contains("30.00 acres"))
    #expect(n.body.contains("Mangala Kunta"))
    #expect(n.body.contains("Khata 5001"))
    // No stray country name from the place helper.
    #expect(!n.body.contains("India"))
}

@Test("An unnamed document still gets a usable title")
func unknownTypeStillReads() {
    let n = readReadyNotification([:])
    #expect(n.title == "Document ready to review")
    #expect(n.body.contains("nothing has been saved yet"))
}

@Test("A failure names the cause and says nothing changed")
func failureIsInterpretable() {
    let n = readFailedNotification("The network connection was lost.")
    #expect(n.title == "Couldn’t read the document")
    #expect(n.body.contains("The network connection was lost."))
    #expect(n.body.contains("Nothing was saved"))
    // A blank reason must not produce a blank banner.
    #expect(!readFailedNotification("   ").body.isEmpty)
}
