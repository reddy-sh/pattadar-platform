import Foundation
import Testing

@testable import PattadarKit

/// Photos per holding: the wire contract against the running API, and the
/// outbox's photo entries offline.
private func liveAPI() async -> PattadarAPI? {
    let base = URL(string: "http://127.0.0.1:8080")!
    var probe = URLRequest(url: base.appendingPathComponent("health"))
    probe.timeoutInterval = 2
    guard let (_, r) = try? await URLSession.shared.data(for: probe),
          (r as? HTTPURLResponse)?.statusCode == 200 else { return nil }
    return PattadarAPI(config: .init(baseURL: base, userID: "u01"))
}

private struct MadeProperty: Decodable { let createProperty: IDPayload? }
private struct AddedPropertyPhoto: Decodable { let addPropertyPhoto: IDPayload? }
private struct DeletedProperty: Decodable { let deleteProperty: Bool? }
private struct DeletedPhoto: Decodable { let deletePropertyPhoto: Bool? }
private struct SetCover: Decodable { let setPropertyCoverPhoto: Bool? }

@Test("A property photo travels add → dossier → cover → delete on the app's own documents")
func propertyPhotoRoundTrip() async throws {
    guard let api = await liveAPI() else { return }

    let made = try await api.query(Mutations.createProperty, variables: [
        "type": "open_plot", "label": "ios photo smoke", "address": "", "locality": "",
        "city": "Nallapadu", "district": "Guntur", "landArea": 100.0, "landUnit": "Sq.yd",
        "builtupArea": 0.0, "builtupUnit": "Sq.ft", "acquisitionMode": "purchase",
        "projectId": "", "groupId": "", "attributes": "", "purchasePrice": 0.0,
        "purchaseDate": "", "regDocNo": "", "sro": "", "regDate": "",
        "sellerName": "", "buyerName": "",
    ], as: MadeProperty.self)
    let propertyID = try #require(made.createProperty?.id)

    let added = try await api.query(Mutations.addPropertyPhoto, variables: [
        "propertyId": propertyID, "fileRef": "smoke-node", "category": "boundary",
        "caption": "north stone", "latitude": 16.306, "longitude": 80.436,
        "capturedAt": "2026-08-14T02:00:00",
    ], as: AddedPropertyPhoto.self)
    let photoID = try #require(added.addPropertyPhoto?.id)

    // Back through the SAME dossier document the screen runs.
    let dossier = try await api.query(Queries.propertyDossier,
                                      variables: ["target": propertyID], as: PropertyDossier.self)
    let photo = try #require(dossier.propertyPhotos.first { $0.id == photoID })
    #expect(dossier.propertyPhotos.count == 1)
    #expect(photo.propertyId == propertyID)
    #expect(photo.caption == "north stone")
    #expect(photo.isCover == false, "a photo must never auto-cover")
    #expect(photo.latitude != nil)

    let cover = try await api.query(Mutations.setPropertyCoverPhoto,
                                    variables: ["id": photoID], as: SetCover.self)
    #expect(cover.setPropertyCoverPhoto == true)

    let gone = try await api.query(Mutations.deletePropertyPhoto,
                                   variables: ["id": photoID], as: DeletedPhoto.self)
    #expect(gone.deletePropertyPhoto == true)

    // Inline, not deferred — a Task racing process exit left smoke rows behind.
    _ = try? await api.query(Mutations.deleteProperty,
                             variables: ["id": propertyID], as: DeletedProperty.self)
}

@Test("A photo picked with no EXIF location reads as missing, never as 0,0")
func missingCoordinatesStayMissing() async throws {
    guard let api = await liveAPI() else { return }
    let made = try await api.query(Mutations.createProperty, variables: [
        "type": "open_plot", "label": "ios photo nil-gps smoke", "address": "", "locality": "",
        "city": "Nallapadu", "district": "Guntur", "landArea": 1.0, "landUnit": "Sq.yd",
        "builtupArea": 0.0, "builtupUnit": "Sq.ft", "acquisitionMode": "purchase",
        "projectId": "", "groupId": "", "attributes": "", "purchasePrice": 0.0,
        "purchaseDate": "", "regDocNo": "", "sro": "", "regDate": "",
        "sellerName": "", "buyerName": "",
    ], as: MadeProperty.self)
    let propertyID = try #require(made.createProperty?.id)

    // latitude/longitude simply not sent — the document's nullable variables.
    let added = try await api.query(Mutations.addPropertyPhoto, variables: [
        "propertyId": propertyID, "fileRef": "n", "category": "general",
        "caption": "", "capturedAt": "",
    ], as: AddedPropertyPhoto.self)
    let photoID = try #require(added.addPropertyPhoto?.id)
    let dossier = try await api.query(Queries.propertyDossier,
                                      variables: ["target": propertyID], as: PropertyDossier.self)
    let photo = try #require(dossier.propertyPhotos.first { $0.id == photoID })
    #expect(photo.latitude == nil)
    #expect(photo.longitude == nil)
    _ = try? await api.query(Mutations.deletePropertyPhoto,
                             variables: ["id": photoID], as: DeletedPhoto.self)
    _ = try? await api.query(Mutations.deleteProperty,
                             variables: ["id": propertyID], as: DeletedProperty.self)
}

// ── The outbox's photo entries, fully offline ─────────────────────────

@Test("An outbox written before photos existed still decodes")
func legacyEntryDecodes() throws {
    let legacy = """
    {"id":"6F1F5E4E-0000-4000-8000-000000000001","user":"u01","fieldsJSON":"{}",
     "storedFile":"x.pdf","originalName":"x.pdf","displayName":"Deed","link":{"none":{}},
     "createdAt":776000000,"attempts":1,"nextAttemptAt":776000500,"needsReview":false}
    """.replacingOccurrences(of: "\n", with: "")
    let entry = try JSONDecoder().decode(WriteQueue.Entry.self, from: Data(legacy.utf8))
    #expect(entry.photo == nil)
    #expect(entry.isPhoto == false)
}

@Test("A photo entry survives the round trip with its evidence intact")
func photoEntryRoundTrips() throws {
    let details = WriteQueue.PhotoDetails(
        target: .property("prop-1"), category: "boundary", caption: "west stone",
        latitude: 16.3, longitude: 80.4, heading: 270, capturedAt: "2026-08-14T02:10:00")
    var entry = WriteQueue.Entry(
        id: UUID(), user: "u01", fieldsJSON: "", storedFile: "p.jpg",
        originalName: "p.jpg", displayName: "Photo", link: details.target, createdAt: Date())
    entry.photo = details

    let decoded = try JSONDecoder().decode(
        WriteQueue.Entry.self, from: JSONEncoder().encode(entry))
    #expect(decoded.photo == details)
    #expect(decoded.isPhoto)
}

@Test("enqueuePhoto is durable first: entry and bytes both on disk")
func enqueuePhotoIsDurable() async throws {
    let dir = FileManager.default.temporaryDirectory
        .appendingPathComponent("photo-queue-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: dir) }

    let image = dir.appendingPathComponent("shot.jpg")
    try Data([0xFF, 0xD8, 0xFF, 0xE0]).write(to: image)

    let queue = WriteQueue(directory: dir)
    let entry = try await queue.enqueuePhoto(
        user: "u01", fileURL: image,
        details: .init(target: .parcel("par-1"), capturedAt: "now"),
        displayName: "Land photo")

    let pending = await queue.pending(for: "u01")
    #expect(pending.map(\.id) == [entry.id])
    #expect(pending.first?.photo?.target == .parcel("par-1"))
    let stored = await queue.documentURL(for: entry)
    #expect(FileManager.default.fileExists(atPath: stored.path))

    // A second queue over the same directory — a relaunch — sees the entry.
    let relaunched = WriteQueue(directory: dir)
    let after = await relaunched.pending(for: "u01")
    #expect(after.map(\.id) == [entry.id])
}
