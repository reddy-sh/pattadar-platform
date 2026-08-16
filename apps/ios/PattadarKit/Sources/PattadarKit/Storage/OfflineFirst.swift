import Foundation

/// An answer that may have come from disk instead of the wire.
public struct CachedAnswer<T: Sendable>: Sendable {
    public let value: T
    /// When the answer was stored — nil when it came fresh off the network.
    /// Non-nil drives the quiet "as of …" line; staleness is said, not hidden.
    public let asOf: Date?
}

extension PattadarAPI {
    /// The offline-first read: network when it answers, the last good answer
    /// when it does not.
    ///
    /// Only network weather falls back — a transport error or an HTTP
    /// failure. A GraphQL error is the server ANSWERING, and an answer, even
    /// an unwelcome one, must never be papered over with old data.
    public func queryCached<T: Decodable & Sendable>(
        _ document: String,
        variables: [String: any Sendable] = [:],
        as: T.Type = T.self
    ) async throws -> CachedAnswer<T> {
        // A WRITE is never cached and never answered from a cache: replaying
        // an old ack as a fresh success would tell someone their edit landed
        // when it did not — the one lie an offline layer must not tell. The
        // outbox is the offline story for writes; this path is reads only.
        if Self.isMutationDocument(document) {
            let body = try await queryBody(document, variables: variables)
            return CachedAnswer(value: try Self.decodeEnvelope(body), asOf: nil)
        }
        // Capture the epoch BEFORE the request: a sign-out mid-flight bumps
        // it, and this response then belongs to a dead session — storing it
        // would resurrect cleared records onto a signed-out phone.
        let epoch = await ResponseCache.shared.currentEpoch
        do {
            let body = try await queryBody(document, variables: variables)
            await ResponseCache.shared.store(
                user: config.userID, document: document, variables: variables,
                body: body, epoch: epoch)
            return CachedAnswer(value: try Self.decodeEnvelope(body), asOf: nil)
        } catch {
            guard Self.servesCacheOn(error),
                  let hit = await ResponseCache.shared.lookup(
                      user: config.userID, document: document, variables: variables),
                  let value: T = try? Self.decodeEnvelope(hit.body)
            else { throw error }
            return CachedAnswer(value: value, asOf: hit.storedAt)
        }
    }

    /// Every document in `Mutations` (and the narrow ones living in `Queries`)
    /// begins with the keyword; anything else is a read.
    static func isMutationDocument(_ document: String) -> Bool {
        document.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("mutation")
    }

    /// Same decode the online path uses — offline and online cannot disagree.
    static func decodeEnvelope<T: Decodable>(_ data: Data) throws -> T {
        let env = try JSONDecoder().decode(GraphQLEnvelope<T>.self, from: data)
        guard let payload = env.data else { throw APIError.graphQL(["no data returned"]) }
        return payload
    }

    /// Weather, not answers: transport failures and HTTP-level failures are
    /// the network being absent or broken; everything else is the server
    /// speaking and must be heard. 401/403 are the server speaking too — an
    /// expired session hidden behind warm cached data would read forever
    /// while every queued write silently failed; the sign-in door must show.
    static func servesCacheOn(_ error: Error) -> Bool {
        switch error {
        case APIError.http(401, _), APIError.http(403, _): false
        case APIError.transport, APIError.http: true
        default: false
        }
    }
}
