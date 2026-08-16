import Foundation
import Testing

@testable import PattadarKit

/// The offline layer's load-bearing walls: the cache never leaks across
/// identities, the outbox never loses an entry, and the weather/rejection
/// split never retries a rejection or parks the weather.
struct OfflineStoreTests {

    private func tempDir() -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("offline-tests-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    // MARK: - ResponseCache

    @Test func cacheRoundTripsBytesVerbatim() async {
        let cache = ResponseCache(directory: tempDir())
        let body = Data(#"{"data":{"parcels":[{"id":"p1"}]}}"#.utf8)
        await cache.store(user: "u01", document: "query{parcels}", variables: [:],
                          body: body, epoch: 0)
        let hit = await cache.lookup(user: "u01", document: "query{parcels}", variables: [:])
        #expect(hit?.body == body)
        #expect(hit.map { abs($0.storedAt.timeIntervalSinceNow) < 10 } == true)
    }

    @Test func cacheIsPartitionedByUser() async {
        // u01's holdings must never render under another signed-in identity.
        let cache = ResponseCache(directory: tempDir())
        await cache.store(user: "u01", document: "q", variables: [:],
                          body: Data("a".utf8), epoch: 0)
        #expect(await cache.lookup(user: "u02", document: "q", variables: [:]) == nil)
        #expect(await cache.lookup(user: "u01", document: "q", variables: [:]) != nil)
    }

    @Test func cacheIsPartitionedByVariables() async {
        let cache = ResponseCache(directory: tempDir())
        await cache.store(user: "u01", document: "q", variables: ["id": "a"],
                          body: Data("a".utf8), epoch: 0)
        #expect(await cache.lookup(user: "u01", document: "q", variables: ["id": "b"]) == nil)
        #expect(await cache.lookup(user: "u01", document: "q", variables: ["id": "a"]) != nil)
    }

    @Test func clearForgetsEverything() async {
        let cache = ResponseCache(directory: tempDir())
        await cache.store(user: "u01", document: "q", variables: [:],
                          body: Data("a".utf8), epoch: 0)
        await cache.clear()
        #expect(await cache.lookup(user: "u01", document: "q", variables: [:]) == nil)
    }

    @Test func aStoreFromBeforeTheClearIsDropped() async {
        // The sign-out race: a read in flight when clear() runs must not
        // write the signed-out user's records back onto the cleared disk.
        let cache = ResponseCache(directory: tempDir())
        let staleEpoch = await cache.currentEpoch
        await cache.clear()
        await cache.store(user: "u01", document: "q", variables: [:],
                          body: Data("a".utf8), epoch: staleEpoch)
        #expect(await cache.lookup(user: "u01", document: "q", variables: [:]) == nil)
    }

    @Test func mutationsAreNeverCacheable() {
        // Replaying an old ack as a fresh success is the one lie the offline
        // layer must not tell — writes go through the outbox, never the cache.
        #expect(PattadarAPI.isMutationDocument(Mutations.createRegisteredDocument))
        #expect(PattadarAPI.isMutationDocument(Mutations.toggleFavourite))
        // The narrow mutations that live in `Queries` count too.
        #expect(PattadarAPI.isMutationDocument(Queries.updateParcelSides))
        #expect(!PattadarAPI.isMutationDocument(Queries.holdings))
        #expect(!PattadarAPI.isMutationDocument(Queries.documents))
    }

    // MARK: - Offline fallback policy

    @Test func onlyWeatherServesTheCache() {
        // Transport and HTTP failures are the network being absent or broken.
        #expect(PattadarAPI.servesCacheOn(PattadarAPI.APIError.transport("offline")))
        #expect(PattadarAPI.servesCacheOn(PattadarAPI.APIError.http(503, "")))
        // A GraphQL error is the server ANSWERING — never papered over.
        #expect(!PattadarAPI.servesCacheOn(PattadarAPI.APIError.graphQL(["no"])))
        #expect(!PattadarAPI.servesCacheOn(PattadarAPI.APIError.cancelled))
        // So is 401/403: a dead session hidden behind warm cached data would
        // read forever while every queued write silently failed.
        #expect(!PattadarAPI.servesCacheOn(PattadarAPI.APIError.http(401, "")))
        #expect(!PattadarAPI.servesCacheOn(PattadarAPI.APIError.http(403, "")))
    }

    // MARK: - WriteQueue persistence

    private func scratchFile(named name: String = "scan.pdf") throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID())-\(name)")
        try Data("deed bytes".utf8).write(to: url)
        return url
    }

    @Test func enqueueIsDurableAcrossRelaunch() async throws {
        let dir = tempDir()
        let queue = WriteQueue(directory: dir)
        let entry = try await queue.enqueueFiling(
            user: "u01", fieldsJSON: "{}", fileURL: scratchFile(),
            originalName: "scan.pdf", displayName: "Sale Deed.pdf", link: .parcel("p1"))
        #expect(await queue.pending(for: "u01").count == 1)

        // A new instance over the same directory is a relaunch.
        let relaunched = WriteQueue(directory: dir)
        let recovered = await relaunched.pending(for: "u01")
        #expect(recovered.map(\.id) == [entry.id])
        #expect(recovered.first?.link == .parcel("p1"))
        // The bytes were copied out of tmp and are openable before sync.
        let bytes = await relaunched.documentURL(for: recovered[0])
        #expect(FileManager.default.fileExists(atPath: bytes.path))
    }

    @Test func entriesWhoseBytesVanishedAreDropped() async throws {
        let dir = tempDir()
        let queue = WriteQueue(directory: dir)
        let entry = try await queue.enqueueFiling(
            user: "u01", fieldsJSON: "{}", fileURL: scratchFile(),
            originalName: "scan.pdf", displayName: "Deed.pdf", link: .none)
        try FileManager.default.removeItem(at: await queue.documentURL(for: entry))
        // Filing a document that can never be opened is worse than dropping it.
        #expect(await WriteQueue(directory: dir).pending(for: "u01").isEmpty)
    }

    @Test func discardRemovesEntryAndBytes() async throws {
        let dir = tempDir()
        let queue = WriteQueue(directory: dir)
        let entry = try await queue.enqueueFiling(
            user: "u01", fieldsJSON: "{}", fileURL: scratchFile(),
            originalName: "scan.pdf", displayName: "Deed.pdf", link: .none)
        let bytes = await queue.documentURL(for: entry)
        // The wrong identity cannot discard someone else's queued filing.
        await queue.discard(entry.id, for: "u02")
        #expect(await queue.pending(for: "u01").count == 1)
        await queue.discard(entry.id, for: "u01")
        #expect(await queue.pending(for: "u01").isEmpty)
        #expect(!FileManager.default.fileExists(atPath: bytes.path))
    }

    @Test func queueIsPartitionedByUser() async throws {
        let queue = WriteQueue(directory: tempDir())
        _ = try await queue.enqueueFiling(
            user: "u01", fieldsJSON: "{}", fileURL: scratchFile(),
            originalName: "a.pdf", displayName: "A.pdf", link: .none)
        #expect(await queue.pending(for: "u02").isEmpty)
        #expect(await queue.pending(for: "u01").count == 1)
    }

    // MARK: - The weather/rejection split

    @Test func weatherRetriesWithWideningGaps() {
        // 2s, 8s, 30s, 2m, 10m, 1h — then the hour repeats forever.
        let expected: [TimeInterval] = [2, 8, 30, 120, 600, 3600, 3600]
        for (attempt, wait) in expected.enumerated() {
            let action = WriteQueue.classify(
                PattadarAPI.APIError.transport("offline"), attempts: attempt + 1)
            #expect(action == .retry(after: wait))
        }
    }

    @Test func serverErrorsAreWeather() {
        for code in [500, 502, 503, 504] {
            let action = WriteQueue.classify(PattadarAPI.APIError.http(code, ""), attempts: 1)
            #expect(action == .retry(after: 2))
        }
    }

    @Test func authAndContentionAreWeatherNotRejection() {
        // A token that expired offline is cured by the next sign-in; a 404 is
        // a dead tunnel answering for a live stack; a 409 is the idempotency
        // layer saying "in flight" — all retry, never park.
        for code in [401, 403, 404, 408, 409, 425, 429] {
            let action = WriteQueue.classify(PattadarAPI.APIError.http(code, ""), attempts: 1)
            #expect(action == .retry(after: 2))
        }
    }

    @Test func rejectionsParkForAHuman() {
        // A 4xx the server meant, a too-large upload, a semantic GraphQL no,
        // the idempotency layer's 410 "landed once, answer gone" — retrying
        // forever is how a queue becomes a poison pill.
        for error in [PattadarAPI.APIError.http(400, ""),
                      PattadarAPI.APIError.http(410, ""),
                      PattadarAPI.APIError.http(413, ""),
                      PattadarAPI.APIError.http(422, "")] {
            if case .retry = WriteQueue.classify(error, attempts: 1) {
                Issue.record("\(error) must park, not retry")
            }
        }
        if case .retry = WriteQueue.classify(
            PattadarAPI.APIError.graphQL(["the document was not created"]), attempts: 1) {
            Issue.record("a GraphQL rejection must park, not retry")
        }
    }
}
