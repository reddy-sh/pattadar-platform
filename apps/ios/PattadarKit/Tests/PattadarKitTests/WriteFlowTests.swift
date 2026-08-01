import Foundation
import Testing

@testable import PattadarKit

/// The write paths, end to end against the running API.
///
/// Compiling proves nothing about whether a mutation's arguments match the
/// schema — a wrong name or a missing required argument fails at RUNTIME with
/// a GraphQL error and an empty screen. These run the real thing and clean up
/// after themselves.
private func liveAPI() async -> PattadarAPI? {
    let base = URL(string: "http://127.0.0.1:8080")!
    var probe = URLRequest(url: base.appendingPathComponent("health"))
    probe.timeoutInterval = 2
    guard let (_, r) = try? await URLSession.shared.data(for: probe),
          (r as? HTTPURLResponse)?.statusCode == 200 else { return nil }
    return PattadarAPI(config: .init(baseURL: base, userID: "u01"))
}

private struct MadeProperty: Decodable { let createProperty: IDPayload? }
private struct MadeDoc: Decodable { let createRegisteredDocument: IDPayload? }
private struct Deleted: Decodable { let deleteProperty: Bool? }

@Test("A property can be created, linked to a document, and deleted")
func propertyWriteRoundTrip() async throws {
    guard let api = await liveAPI() else { return }

    let made = try await api.query(Mutations.createProperty, variables: [
        "type": "open_plot", "label": "ios write-flow smoke", "address": "", "locality": "",
        "city": "Nallapadu", "district": "Guntur", "landArea": 418.5, "landUnit": "Sq.yd",
        "builtupArea": 0.0, "builtupUnit": "Sq.ft", "acquisitionMode": "purchase",
        "projectId": "", "groupId": "", "attributes": "", "purchasePrice": 84000.0,
        "purchaseDate": "", "regDocNo": "", "sro": "", "regDate": "",
        "sellerName": "", "buyerName": "",
    ], as: MadeProperty.self)
    let propertyID = try #require(made.createProperty?.id)

    // The payload is what the extractor returns, summary and caveats included.
    let payload = """
    {"doc_type":"Sale Deed","village":"Nallapadu","survey_no":"418-1/2",\
    "headline":"Smoke test deed","summary":"First para.\\n\\nSecond para.",\
    "key_points":["one","two"],"caveats":["check this"]}
    """
    let filed = try await api.query(Mutations.createRegisteredDocument,
                                    variables: ["fileRef": "", "payload": payload], as: MadeDoc.self)
    let docID = try #require(filed.createRegisteredDocument?.id)

    _ = try await api.query(Mutations.linkDocumentProperty,
                            variables: ["id": docID, "prop": propertyID], as: AnyMutationResult.self)

    // It must come back through the SAME query the app uses.
    let docs = try await api.query(Queries.documents, as: DocumentsResponse.self)
    let found = try #require(docs.registeredDocuments.first { $0.id == docID })
    #expect(found.propertyId == propertyID)
    #expect(found.headline == "Smoke test deed")
    #expect(found.keyPointList.count == 2)
    #expect(found.caveatList.count == 1)
    #expect(found.summary.components(separatedBy: "\n\n").count == 2, "paragraphs must survive")

    // Deleting the property takes the deed with it — cascade, verified.
    _ = try await api.query(Mutations.deleteProperty, variables: ["id": propertyID], as: Deleted.self)
    let after = try await api.query(Queries.documents, as: DocumentsResponse.self)
    #expect(!after.registeredDocuments.contains { $0.id == docID },
            "the deed should have gone with its property")
}

@Test("A parcel's extent is written in canonical acres")
func parcelExtentIsConverted() async throws {
    guard let api = await liveAPI() else { return }
    let books = try await api.query(Queries.passbooks, as: PassbooksResponse.self)
    guard let khata = books.passbooks.first else { return }

    struct MadeParcel: Decodable { let createParcel: IDPayload? }
    struct DeletedParcel: Decodable { let deleteParcel: Bool? }
    // 40 guntas is ONE acre. Writing 40 with unit "Guntas" is the forty-fold
    // overstatement this conversion exists to stop.
    let made = try await api.query(Mutations.createParcel, variables: [
        "passbookId": khata.id, "surveyNo": "ios-smoke", "subdivision": "",
        "extent": toAcres(40, .gunta), "unit": UnitKey.gunta.label,
        "classification": "agri", "acquisitionSource": "", "parentParcelId": "", "source": "ios-test",
    ], as: MadeParcel.self)
    let id = try #require(made.createParcel?.id)

    let holdings = try await api.query(Queries.holdings, as: HoldingsResponse.self)
    let parcel = try #require(holdings.parcels.first { $0.id == id })
    #expect(abs(parcel.extent - 1.0) < 1e-9, "40 guntas must persist as 1 acre, got \(parcel.extent)")

    _ = try await api.query(Mutations.deleteParcel, variables: ["id": id], as: DeletedParcel.self)
}
