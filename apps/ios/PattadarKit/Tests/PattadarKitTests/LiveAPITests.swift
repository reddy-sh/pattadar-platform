import Foundation
import Testing

@testable import PattadarKit

/// Talks to the API actually running on this machine.
///
/// Skipped when nothing is listening, so the suite stays green on a laptop with
/// no backend up — but when the API IS up, these are the tests that prove the
/// Swift client speaks the same protocol as the RN one rather than merely
/// compiling.
private func liveAPI() async -> PattadarAPI? {
    let base = URL(string: "http://127.0.0.1:8080")!
    var probe = URLRequest(url: base.appendingPathComponent("health"))
    probe.timeoutInterval = 2
    guard let (_, r) = try? await URLSession.shared.data(for: probe),
          (r as? HTTPURLResponse)?.statusCode == 200 else { return nil }
    return PattadarAPI(config: .init(baseURL: base, userID: "u01"))
}

@Test("Holdings decode from the live schema")
func holdingsDecode() async throws {
    guard let api = await liveAPI() else { return }
    let r = try await api.query(Queries.holdings, as: HoldingsResponse.self)
    #expect(!r.passbooks.isEmpty, "seeded database should have passbooks")
    // Extent is canonical acres; a parcel claiming thousands means the unit
    // label was written into the number somewhere upstream.
    for p in r.parcels {
        #expect(p.extent < 10_000, "parcel \(p.surveyNo) extent \(p.extent) is not plausible acres")
    }
}

@Test("Documents decode, including the AI summary fields")
func documentsDecode() async throws {
    guard let api = await liveAPI() else { return }
    let r = try await api.query(Queries.documents, as: DocumentsResponse.self)
    // The selection set names headline/keyPointList/caveatList; if the schema
    // lacks any of them the WHOLE query fails, which is what this catches.
    #expect(r.registeredDocuments.count >= 0)
}

@Test("A GraphQL error surfaces as an error, not as empty data")
func graphQLErrorsSurface() async throws {
    guard let api = await liveAPI() else { return }
    struct Nothing: Decodable {}
    await #expect(throws: PattadarAPI.APIError.self) {
        _ = try await api.query("query { fieldThatDoesNotExist }", as: Nothing.self)
    }
}

@Test("Geo points round-trip through the storage convention")
func geoPointParsing() {
    #expect(parseGeoPoint("16.500000,80.600000") == LatLng(latitude: 16.5, longitude: 80.6))
    #expect(parseGeoPoint("[15.55, 79.28]") == LatLng(latitude: 15.55, longitude: 79.28))
    // An empty pin and 0,0 both mean "not set" — 0,0 is a real place in the
    // Atlantic and must never render as a location.
    #expect(parseGeoPoint("") == nil)
    #expect(parseGeoPoint("0,0") == nil)
}
