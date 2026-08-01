import Foundation
import Testing

@testable import PattadarKit

/// Flattening a deed reading for storage. Built from the real Nallapadu deed,
/// because the shapes that break this are the ones a real document produces.

private func nallapaduFields() -> [String: Any] { [
    "layout_name": "Punnareddy Plot",
    "plot_nos": ["53", "70A", "70B"],
    "rate_per_unit": 200.0,
    "rate_unit": "Sq.yard",
    "parent_survey_extent": "8-74 Cents",
    "total_pages": 12,
    "boundaries": ["north": "30 ft wide road", "south": "20 ft wide road",
                   "east": "land sold to Challa Sridevi", "west": ""],
    "boundary_lengths": ["north": "71", "south": "46", "east": "66", "west": "68"],
    "stamp_papers": [
        "total_value": 9250, "serials": "110 to 119", "count": 10,
        "denominations": [["value": 5000, "count": 1], ["value": 1000, "count": 4],
                          ["value": 100, "count": 2]],
        "purchased_by": "Chinthalapudi Swetha", "purchased_for": "SELF",
    ],
    "prior_document_details": [
        "number": "10024/1981", "registration_date": "1981-09-09",
        "office": "Guntur Registrar Office", "book_volume_pages": "Book 1, Vol 1488, Pages 168-171",
        "original_seller": "Satyanarayana Reddy", "original_buyer": "Dasaratharamayya",
    ],
    "attachments": [
        "route_map": true,
        "landmarks": ["Guntur Polytechnic College", "Nallapadu Railway Track"],
        "identity_verification": "thumbprints and photographs under Section 32A",
        "declaration": "Section 27 and 64 of the Indian Stamp Act",
    ],
] }

@Test("Nested groups are flattened, never left to stringify themselves")
func nothingRendersAsSwiftDebugOutput() {
    let a = deedAttributes(nallapaduFields())
    // The reader stringifies whatever it finds. A dictionary left in place
    // would reach the screen as `["north": "30 ft wide road"]`.
    for (key, value) in a {
        #expect(!value.contains("["), "\(key) leaked a collection: \(value)")
        #expect(!value.contains("__C."), "\(key) leaked a bridged type: \(value)")
        #expect(!value.contains("Optional("), "\(key) leaked an optional: \(value)")
    }
    #expect(!a.isEmpty)
}

@Test("A boundary carries what abuts it and how long that side is")
func boundariesKeepBothFacts() {
    let a = deedAttributes(nallapaduFields())
    #expect(a["Boundary north"] == "30 ft wide road (71)")
    #expect(a["Boundary east"] == "land sold to Challa Sridevi (66)")
    // A side with a measurement but no description still reports the
    // measurement rather than vanishing.
    #expect(a["Boundary west"] == "(68)")
}

@Test("The whole survey extent is never mistaken for the plot")
func parentExtentIsLabelledApart() {
    let a = deedAttributes(nallapaduFields())
    let label = try! #require(a.keys.first { $0.contains("Survey extent") })
    #expect(a[label] == "8-74 Cents")
    // It must not be labelled simply "Extent", which is the plot's own figure
    // and would overstate the holding many times over.
    #expect(a["Extent"] == nil)
}

@Test("Lists and money read as a person would write them")
func listsAndMoneyAreReadable() {
    let a = deedAttributes(nallapaduFields())
    #expect(a["Plot numbers"] == "53, 70A, 70B")
    #expect(a["Rate"] == "₹200 per Sq.yard")
    #expect(a["Stamp papers denominations"] == "₹5000 × 1, ₹1000 × 4, ₹100 × 2")
    #expect(a["Attached landmarks"] == "Guntur Polytechnic College, Nallapadu Railway Track")
    #expect(a["Attached route map"] == "Yes")
}

@Test("Blank, zero and false values are dropped rather than stored")
func emptiesAreDropped() {
    let a = deedAttributes([
        "layout_name": "", "rate_per_unit": 0.0, "total_pages": 0,
        "attachments": ["route_map": false, "declaration": ""],
    ])
    #expect(a.isEmpty)
    // Nothing worth storing means no blob, so no empty section on screen.
    #expect(deedAttributesJSON(["layout_name": ""]) == "")
}

@Test("The blob is valid JSON that survives a round trip")
func jsonRoundTrips() {
    let text = deedAttributesJSON(nallapaduFields())
    let data = try! #require(text.data(using: .utf8))
    let back = try! #require(
        (try? JSONSerialization.jsonObject(with: data)) as? [String: String])
    #expect(back["Prior deed no."] == "10024/1981")
    #expect(back["Stamp papers serials"] == "110 to 119")
    #expect(back.count == deedAttributes(nallapaduFields()).count)
}

@Test("A yes/no from the deed reads as a yes, never as a 1")
func booleansAreNotNumbers() {
    // JSON `true` arrives as an NSNumber, which casts to Int as readily as to
    // Bool — so the route-map row rendered as "1".
    let json = #"{"attachments":{"route_map":true,"identity_verification":""}}"#
    let fields = (try? JSONSerialization.jsonObject(
        with: Data(json.utf8))) as? [String: Any] ?? [:]
    #expect(deedAttributes(fields)["Attached route map"] == "Yes")

    // And a genuine count is still a number.
    let counted = #"{"total_pages":12}"#
    let cf = (try? JSONSerialization.jsonObject(with: Data(counted.utf8))) as? [String: Any] ?? [:]
    #expect(deedAttributes(cf)["Total pages"] == "12")
}

@Test("Boundaries are grouped, clockwise from north")
func boundariesGroupInCompassOrder() {
    let groups = deedAttributeGroups(deedAttributes(nallapaduFields()))
    #expect(groups.boundaries.map(\.0) == ["North", "East", "South", "West"],
            "alphabetical put east first, which is nobody's mental model of a compass")
    // And they are NOT left in the general list to interleave with attachments.
    #expect(!groups.rest.contains { $0.0.hasPrefix("Boundary") })
    #expect(groups.rest.contains { $0.0 == "Plot numbers" })
}

@Test("A side with nothing recorded is not invented")
func missingSidesAreOmitted() {
    let groups = deedAttributeGroups(["Boundary north": "30 ft road", "Boundary south": ""])
    #expect(groups.boundaries.map(\.0) == ["North"])
}


@Test("Parties keep the detail that actually identifies a person")
func partiesCarryTheirDetails() {
    let fields: [String: Any] = [
        "survey_no": "563/5",
        "parties": [
            ["role": "seller", "name": "Kanigalpula Dasaratharamaiah",
             "parentage": "S/o Anjaneyulu", "age": "45",
             "address": "Krishna Nagar, 4th Line, Guntur", "is_gpa": false],
            ["role": "buyer", "name": "Chinthalapudi Swetha",
             "parentage": "D/o Ranga Subba Reddy", "age": "19",
             "address": "L.I.G. 164, Housing Board Colony, Guntur", "is_gpa": false],
        ],
    ]
    let a = deedAttributes(fields)
    #expect(a["Seller"] == "Kanigalpula Dasaratharamaiah")
    #expect(a["Seller parentage"] == "S/o Anjaneyulu")
    #expect(a["Seller age"] == "45")
    #expect(a["Buyer address"] == "L.I.G. 164, Housing Board Colony, Guntur")
    // The survey number has no column on a property and would be lost.
    #expect(a["Survey no."] == "563/5")
}

@Test("The present owner is named first")
func partiesReadOwnerFirst() {
    let fields: [String: Any] = ["parties": [
        ["role": "seller", "name": "Dasaratharamaiah", "age": "45"],
        ["role": "buyer", "name": "Swetha", "age": "19"],
    ]]
    let groups = deedAttributeGroups(deedAttributes(fields))
    // On a record of what somebody owns, the buyer is the current owner — the
    // answer to "whose land is this now".
    #expect(groups.parties.first?.0 == "Buyer")
    #expect(groups.parties.map(\.0).contains("Seller"))
    // And they do not also appear in the general list.
    #expect(!groups.rest.contains { $0.0 == "Seller" })
}

@Test("A GPA holder is named as an agent, not as the owner")
func gpaHolderIsFlagged() {
    // The signature on the page may not be the owner's. Treating the agent as
    // the party is how a record ends up naming the wrong owner.
    let fields: [String: Any] = ["parties": [
        ["role": "seller", "name": "Chakka Seetharamlakshmi", "is_gpa": true],
    ]]
    let a = deedAttributes(fields)
    #expect(a["Seller acting as"] == "General Power of Attorney holder")
}
