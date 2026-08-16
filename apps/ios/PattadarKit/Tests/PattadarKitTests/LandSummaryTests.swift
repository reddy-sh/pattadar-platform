import Foundation
import Testing

@testable import PattadarKit

/// The arithmetic behind the dashboard AND the Home Screen widget.
///
/// It is pinned here because the widget draws it in a different process from a
/// snapshot written hours earlier. If these rules drift, the phone shows one
/// acreage on Home and another on the Home Screen — for the same land, at the
/// same moment — and there is no screen on which that disagreement is visible.

// MARK: - Fixtures

private func parcel(_ id: String, survey: String, acres: Double,
                    subdivision: String = "",
                    classification: String = "agri", passbook: String = "pb1",
                    geoPoint: String = "17.4,78.4", regDocNo: String = "1/2020",
                    mutation: String = "done", ec: String = "nil",
                    taxPaidUpto: String = "2025-26", litigation: Bool = false) -> Parcel {
    Parcel(id: id, passbookId: passbook, surveyNo: survey, subdivision: subdivision, extent: acres,
           unit: "Acres", classification: classification, acquisitionSource: "", status: "",
           label: "", address: "", geoPoint: geoPoint, boundary: "", stake: "", currentOwner: "",
           boundaryNorth: "", boundarySouth: "", boundaryEast: "", boundaryWest: "",
           purchasePrice: 0, purchaseDate: "", guidelineValue: 0, marketValue: 0,
           stampDuty: 0, loanAmount: 0, encumbranceStatus: "", regDocNo: regDocNo, sro: "",
           regDate: "", ecStatus: ec, ecDate: "", mutationStatus: mutation,
           taxPaidUpto: taxPaidUpto, litigation: litigation, litigationNote: "", createdAt: "")
}

private func property(_ id: String, type: String, label: String = "",
                      city: String = "", landArea: Double = 0, landUnit: String = "Sq.yd",
                      builtupArea: Double = 0, builtupUnit: String = "Sq.ft") -> Property {
    Property(id: id, type: type, label: label, address: "", locality: "", city: city,
             district: "", geoPoint: "", boundary: "", landArea: landArea, landUnit: landUnit,
             builtupArea: builtupArea, builtupUnit: builtupUnit, acquisitionMode: "",
             holdingStatus: "", stake: "", currentOwner: "", groupId: "", purchasePrice: 0,
             purchaseDate: "", guidelineValue: 0, marketValue: 0, currentValue: 0,
             regDocNo: "", sro: "", regDate: "", ghmcAssessmentNo: "", khataNo: "",
             reraNo: "", ecStatus: "", ecDate: "", mutationStatus: "", taxPaidUpto: "",
             litigation: false, litigationNote: "", notes: "", attributes: "", createdAt: "")
}

private func passbook(_ id: String, village: String) -> Passbook {
    Passbook(id: id, pattadarNo: "5001", ownerName: "Sankara Reddy Telukutla",
             village: village, mandal: "", district: "")
}

private func document(parcelID: String = "", propertyID: String = "") -> RegisteredDocument {
    RegisteredDocument(id: UUID().uuidString, ref: "", documentNo: "", docType: "sale_deed",
                       sro: "", village: "", mandal: "", district: "",
                       boundaryNorth: "", boundarySouth: "", boundaryEast: "", boundaryWest: "",
                       surveyNo: "", plotNo: "", extent: "", consideration: 0, regYear: "",
                       registrationDate: "", propertyId: propertyID, parcelId: parcelID,
                       passbookId: "", headline: "", summary: "", keyPointList: [],
                       caveatList: [], createdAt: "", reading: "")
}

private func stats(extent: Double = 0, parcels: Int = 0, passbooks: Int = 0,
                   documents: Int = 0) -> DashboardStats {
    DashboardStats(totalPassbooks: passbooks, totalParcels: parcels, totalDocuments: documents,
                   totalBeneficiaries: 0, pendingInvitations: 0, estimatedValue: 0,
                   totalExtent: extent, totalGroups: 0)
}

// MARK: - Totals

@Test("Acres and square yards are never added together")
func unitsStayApart() {
    let totals = landTotals(
        parcels: [parcel("p1", survey: "121", acres: 8.2)],
        properties: [property("s1", type: "open_plot", landArea: 418.5)],
        passbooks: [passbook("pb1", village: "Katraguntla")])

    let farmland = try! #require(totals.first { $0.kind == .farmland })
    let plots = try! #require(totals.first { $0.kind == .plot })
    #expect(farmland.amount == 8.2)
    #expect(plots.amount == 418.5)
}

@Test("An acre-measured property is farmland, whatever table it is filed in")
func acreMeasuredPropertyIsFarmland() {
    // A 25-acre field bought on a deed arrives as a "property". Counting it in
    // square yards on the plots card produced 1,21,000 — a number nobody says.
    let totals = landTotals(
        parcels: [],
        properties: [property("f1", type: "agri_land", landArea: 25, landUnit: "Acres")],
        passbooks: [])

    #expect(totals.count == 1)
    #expect(totals.first?.kind == .farmland)
    #expect(totals.first?.amount == 25)
}

@Test("A passbook that is not on file is a broken link, not a fifth khata")
func danglingPassbookIsNotCounted() {
    let totals = landTotals(
        parcels: [parcel("p1", survey: "121", acres: 1, passbook: "ghost")],
        properties: [],
        passbooks: [passbook("pb1", village: "Katraguntla")])

    #expect(totals.first?.passbooks == 0)
}

// MARK: - How one holding reads

@Test("A site is quoted in square yards, even though it is stored in acres")
func siteReadsInYards() {
    // `extent` is canonical acres for every parcel. Printing it raw put
    // "0.05 Acres" under a 240 sq. yd plot — right, and useless.
    let plot = parcel("p1", survey: "123", acres: 0.049586777, classification: "non-agri")
    let assessed = assessHoldings(parcels: [plot], properties: [], passbooks: [],
                                  documents: [], thisYear: 2026)

    #expect(assessed.first?.line.kind == .plot)
    #expect(assessed.first?.line.extent == "240 Sq. yards")
}

@Test("Two subdivisions of one survey number are told apart")
func subdivisionsAreNamed() {
    // The widget's picker lists these by name; two entries both called
    // "Sy 45" are a coin toss rather than a choice.
    let assessed = assessHoldings(
        parcels: [parcel("p1", survey: "45", acres: 1, subdivision: "1"),
                  parcel("p2", survey: "45", acres: 1, subdivision: "2")],
        properties: [], passbooks: [], documents: [], thisYear: 2026)

    #expect(assessed.map(\.line.name) == ["Sy 45/1", "Sy 45/2"])
}

// MARK: - Readiness

@Test("Readiness is the share of every check, not an average of averages")
func readinessIsPooled() {
    // One flawless parcel beside one that fails everything. Averaging the two
    // scores says 50%; pooling the checks says what is actually outstanding.
    let good = parcel("p1", survey: "1", acres: 1)
    let bad = parcel("p2", survey: "2", acres: 1, geoPoint: "", regDocNo: "",
                     mutation: "pending", ec: "", taxPaidUpto: "", litigation: true)
    let snapshot = LandSnapshot.build(
        stats: stats(extent: 2, parcels: 2),
        holdings: HoldingsResponse(parcels: [good, bad], passbooks: [passbook("pb1", village: "K")],
                                   properties: []),
        documents: [document(parcelID: "p1")])

    let assessed = assessHoldings(parcels: [good, bad], properties: [],
                                  passbooks: [], documents: [document(parcelID: "p1")],
                                  thisYear: Calendar.current.component(.year, from: Date()))
    let checks = assessed.reduce(0) { $0 + $1.line.checks }
    let passed = assessed.reduce(0) { $0 + $1.line.passed }
    #expect(snapshot.readiness == Int((Double(passed) / Double(checks)) * 100))
    #expect(snapshot.attention == 1)
    #expect(snapshot.blocking == 1)
}

@Test("A holding's widget verdict is the same verdict its own screen reaches")
func verdictsAgree() {
    let year = Calendar.current.component(.year, from: Date())
    let blocked = parcel("p1", survey: "1", acres: 1, mutation: "pending")
    let untidy = parcel("p2", survey: "2", acres: 1, taxPaidUpto: "")
    let ready = parcel("p3", survey: "3", acres: 1)
    let docs = [document(parcelID: "p1"), document(parcelID: "p2"), document(parcelID: "p3")]

    for assessed in assessHoldings(parcels: [blocked, untidy, ready], properties: [],
                                   passbooks: [], documents: docs, thisYear: year) {
        // The line carries counts, not a score, precisely so this holds.
        #expect(assessed.line.verdict == assessed.readiness.verdict)
    }
}

@Test("The worst problem is named, and it is a blocking one where there is one")
func worstNamesTheHolding() {
    let snapshot = LandSnapshot.build(
        stats: stats(extent: 1, parcels: 1),
        holdings: HoldingsResponse(parcels: [parcel("p1", survey: "121/2", acres: 1,
                                                    mutation: "pending")],
                                   passbooks: [], properties: []),
        documents: [document(parcelID: "p1")])

    #expect(snapshot.worst == "Sy 121/2 — mutation still pending")
}

@Test("Nothing outstanding leaves nothing to say")
func silenceWhenInOrder() {
    let snapshot = LandSnapshot.build(
        stats: stats(extent: 1, parcels: 1),
        holdings: HoldingsResponse(parcels: [parcel("p1", survey: "1", acres: 1)],
                                   passbooks: [], properties: []),
        documents: [document(parcelID: "p1")])

    #expect(snapshot.worst.isEmpty)
    #expect(snapshot.verdict == .ready)
    #expect(snapshot.attention == 0)
}

// MARK: - What the widget is given

@Test("Starred holdings survive the cap, because they are what gets pinned")
func starredComeFirst() {
    let parcels = (0..<(LandSnapshot.holdingCap + 10)).map {
        parcel("p\($0)", survey: "\($0)", acres: 1)
    }
    let starred = "parcel:p\(LandSnapshot.holdingCap + 5)"
    let snapshot = LandSnapshot.build(
        stats: stats(extent: 1, parcels: parcels.count),
        holdings: HoldingsResponse(parcels: parcels, passbooks: [], properties: []),
        documents: [], favourites: [starred])

    #expect(snapshot.holdings.count == LandSnapshot.holdingCap)
    #expect(snapshot.holdings.first?.id == starred)
    #expect(snapshot.holdings.first?.starred == true)
}

@Test("An empty record says so rather than reporting nought acres")
func emptyIsEmpty() {
    let snapshot = LandSnapshot.build(
        stats: stats(),
        holdings: HoldingsResponse(parcels: [], passbooks: [], properties: []),
        documents: [])

    #expect(snapshot.isEmpty)
}

// MARK: - Where a tap lands

@Test("Every widget link survives the round trip through a URL")
func linksRoundTrip() {
    let links: [WidgetLink] = [
        .home, .vault, .file,
        .holdings(.all), .holdings(.agricultural), .holdings(.plots),
        .holdings(.attention), .holdings(.favourites),
        .holding("parcel:9E1F-4A"), .holding("property:7C22-01"),
    ]
    for link in links {
        #expect(WidgetLink(link.url) == link, "\(link.url) did not survive")
    }
}

@Test("A URL that is not ours is left alone")
func foreignURLsAreRefused() {
    // The Cognito sign-in callback comes back on this very scheme and belongs
    // to the auth session. Swallowing it here would break signing in.
    #expect(WidgetLink(URL(string: "pattadar://auth?code=abc")!) == nil)
    #expect(WidgetLink(URL(string: "https://pattadar.com/home")!) == nil)
    #expect(WidgetLink(URL(string: "pattadar://holding")!) == nil)
}
