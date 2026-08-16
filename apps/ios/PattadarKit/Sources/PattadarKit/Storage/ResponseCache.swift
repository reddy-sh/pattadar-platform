import CryptoKit
import Foundation

/// The last good answer for every query, kept as the raw wire bytes.
///
/// This is what a screen renders in a field with no signal: not a mock, not a
/// placeholder — the same bytes the server sent last time, re-decoded through
/// the same envelope path, so offline and online cannot disagree about shape.
/// Bytes rather than decoded models on purpose: the wire structs are
/// Decodable-only and drop fields their screens do not read (a cache of
/// structs would silently lose them; the bytes lose nothing).
///
/// Partitioned by user id — locally u01…u06 own different seeded records, and
/// one identity's holdings must never surface under another after a switch.
///
/// An actor, not `LocalFiles`' unlocked static enum: refreshes land from
/// several screens at once and a torn index is a blank tab.
public actor ResponseCache {
    public static let shared = ResponseCache()

    /// A cache answer: the stored body plus when it was stored, which drives
    /// the "as of" line — staleness is shown to the person, never hidden.
    public struct Hit: Sendable {
        public let body: Data
        public let storedAt: Date
    }

    private let root: URL
    /// Bumped by `clear()`. A store whose request began in an earlier epoch
    /// is dropped: without this, a read in flight at sign-out would write the
    /// signed-out user's records straight back onto the cleared disk.
    public private(set) var currentEpoch = 0

    public init(directory: URL? = nil) {
        root = directory ?? FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ResponseCache", isDirectory: true)
    }

    /// One file per (user, document, variables); mtime is the stored-at stamp,
    /// so there is no index to tear or repair.
    private func fileURL(user: String, document: String, variables: [String: any Sendable]) -> URL {
        let vars = (try? JSONSerialization.data(
            withJSONObject: variables, options: [.sortedKeys])) ?? Data()
        var hasher = SHA256()
        hasher.update(data: Data(user.utf8))
        hasher.update(data: Data([0]))
        hasher.update(data: Data(document.utf8))
        hasher.update(data: Data([0]))
        hasher.update(data: vars)
        let key = hasher.finalize().map { String(format: "%02x", $0) }.joined().prefix(40)
        return root.appendingPathComponent("\(key).json")
    }

    /// `epoch` is the value of `currentEpoch` captured BEFORE the network
    /// call that produced `body`; a mismatch means a `clear()` happened in
    /// between and this answer belongs to a session that no longer exists.
    public func store(user: String, document: String,
                      variables: [String: any Sendable], body: Data, epoch: Int) {
        guard epoch == currentEpoch else { return }
        let url = fileURL(user: user, document: document, variables: variables)
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try? body.write(to: url, options: .atomic)
    }

    public func lookup(user: String, document: String,
                       variables: [String: any Sendable]) -> Hit? {
        let url = fileURL(user: user, document: document, variables: variables)
        guard let body = try? Data(contentsOf: url) else { return nil }
        let attrs = try? FileManager.default.attributesOfItem(atPath: url.path)
        return Hit(body: body, storedAt: attrs?[.modificationDate] as? Date ?? .distantPast)
    }

    /// Everything, all users. Sign-out calls this: a cache that outlives the
    /// session is a copy of someone's land records on a shared phone. The
    /// epoch bump makes the clear stick — see `store`.
    public func clear() {
        currentEpoch += 1
        try? FileManager.default.removeItem(at: root)
    }
}
