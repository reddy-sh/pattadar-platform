import Foundation
import Testing
@testable import PattadarKit

/// The cache holds whole records at rest, so it carries the outbox's file
/// protection rather than the default class. On iOS that is an attribute the
/// kernel enforces; here the check is that asking for it did not cost the
/// cache its ability to store and answer.
@Test("Cached bodies survive the protected write and read back byte-identical")
func protectedCacheRoundTrips() async throws {
    let root = FileManager.default.temporaryDirectory
        .appendingPathComponent("ResponseCacheTest-\(UUID())", isDirectory: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let cache = ResponseCache(directory: root)

    let body = Data(#"{"data":{"holdings":[{"id":"p1"}]}}"#.utf8)
    let epoch = await cache.currentEpoch
    await cache.store(user: "u01", document: "q", variables: ["id": "p1"],
                      body: body, epoch: epoch)

    let hit = try #require(await cache.lookup(user: "u01", document: "q",
                                              variables: ["id": "p1"]))
    #expect(hit.body == body)
    #expect(await cache.lookup(user: "u02", document: "q", variables: ["id": "p1"]) == nil)

    #if os(iOS)
    let attrs = try FileManager.default.attributesOfItem(atPath: root.path)
    #expect(attrs[.protectionKey] as? FileProtectionType == .completeUnlessOpen)
    #endif

    await cache.clear()
    #expect(await cache.lookup(user: "u01", document: "q", variables: ["id": "p1"]) == nil)
}

/// The hand-mirrored twin of `ADD_MEMBER_MUTATION` in packages/core. Every
/// variable the document declares is required, so a missing one is not a
/// degraded write — the whole mutation fails validation.
@Test("addMember declares and forwards the Aadhaar extraction candidate")
func addMemberCarriesTheAadhaarCandidate() {
    #expect(Mutations.addMember.contains("$aadhaarCandidateId:String!"))
    #expect(Mutations.addMember.contains("aadhaarCandidateId:$aadhaarCandidateId"))
}
