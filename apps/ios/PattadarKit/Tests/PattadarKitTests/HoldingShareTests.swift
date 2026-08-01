import Foundation
import Testing

@testable import PattadarKit

/// What leaves the app when somebody shares a holding — and what must not.

@Test("A shared holding reads as the facts somebody needs")
func shareTextIsTheFacts() {
    let s = HoldingShare(title: "30 Acres farmland", extent: "30 Acres",
                         place: "Mangalakunta · Tarlapadu · Prakasam",
                         reference: "Sy 1 · Khata 567",
                         owner: "Telukutla Sankar Reddy",
                         pin: LatLng(latitude: 15.670059, longitude: 79.322765))
    let lines = s.text.split(separator: "\n").map(String.init)
    #expect(lines.first == "30 Acres farmland")
    #expect(lines.contains("Sy 1 · Khata 567"))
    #expect(lines.contains("Mangalakunta · Tarlapadu · Prakasam"))
    #expect(lines.contains("Owner: Telukutla Sankar Reddy"))
    #expect(s.text.contains("maps.apple.com"))
    #expect(s.text.contains("15.670059,79.322765"))
}

@Test("The extent is not repeated when the title already carries it")
func extentIsNotSaidTwice() {
    let s = HoldingShare(title: "418.5 Sq. yards plot", extent: "418.5 Sq. yards",
                         place: "Nallapadu · Guntur")
    #expect(s.text.components(separatedBy: "418.5 Sq. yards").count - 1 == 1,
            "the extent appears once, not once in the title and once beneath it")
}

@Test("Blanks are omitted rather than shared as empty lines")
func blanksAreOmitted() {
    let s = HoldingShare(title: "30 Acres farmland")
    #expect(s.text == "30 Acres farmland")
    #expect(!s.text.contains("Owner:"))
    #expect(!s.text.contains("\n\n"))
}

@Test("A location becomes a link anyone can open")
func pinBecomesALink() {
    let s = HoldingShare(title: "Sy 1", pin: LatLng(latitude: 15.5, longitude: 79.5))
    // A bare coordinate pair asks the recipient to know what to do with it.
    #expect(s.text.contains("https://maps.apple.com/?ll=15.500000,79.500000"))
    #expect(HoldingShare(title: "Sy 1").text.contains("maps.apple.com") == false)
}

@Test("Nothing private travels with a share")
func moneyAndIdentityNeverLeave() {
    // There is no field to carry them. This test exists so that adding one is
    // a deliberate act with a failing test attached, not a convenience.
    let s = HoldingShare(title: "418.5 Sq. yards plot", extent: "418.5 Sq. yards",
                         place: "Nallapadu · Guntur", reference: "Sy 191",
                         owner: "Telukutla Sankar Reddy",
                         pin: LatLng(latitude: 16.3, longitude: 80.4))
    let text = s.text.lowercased()
    #expect(!text.contains("₹"))
    #expect(!text.contains("aadhaar"))
    #expect(!text.contains("84,000"))
    #expect(!text.contains("purchase price"))
}
