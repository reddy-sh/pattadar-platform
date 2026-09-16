import Foundation

/// Durable readings partitioned by authenticated principal. The old ownerless
/// file is never opened: its owner cannot be inferred from a last-user setting.
@MainActor
public final class ReviewArchive {
    public struct Entry: Codable, Identifiable, Sendable {
        public let id: String
        public let ownerID: String
        public let fieldsJSON: String
        public let documentPath: String
        public let originalName: String
        public let readAt: Date
    }
    private let directory: URL
    private var all: [Entry]
    private var file: URL { directory.appendingPathComponent("pending-reviews-owned-v1.json") }

    public init(directory: URL) {
        self.directory = directory
        let file = directory.appendingPathComponent("pending-reviews-owned-v1.json")
        all = (try? Data(contentsOf: file)).flatMap { try? JSONDecoder().decode([Entry].self, from: $0) } ?? []
    }
    public var hasUnassignedLegacyReadings: Bool {
        FileManager.default.fileExists(atPath: directory.appendingPathComponent("pending-reviews.json").path)
    }
    public func entries(for ownerID: String) -> [Entry] {
        guard !ownerID.isEmpty else { return [] }
        return all.filter { $0.ownerID == ownerID }
    }
    @discardableResult
    public func add(ownerID: String, fieldsJSON: String, documentPath: String, originalName: String) throws -> String {
        guard !ownerID.isEmpty else { throw CocoaError(.userCancelled) }
        let keptDirectory = directory.appendingPathComponent("PendingScans", isDirectory: true)
        try FileManager.default.createDirectory(at: keptDirectory, withIntermediateDirectories: true)
        let id = UUID().uuidString
        let source = URL(fileURLWithPath: documentPath)
        let kept = keptDirectory.appendingPathComponent("\(id)-\(source.lastPathComponent)")
        try FileManager.default.copyItem(at: source, to: kept)
        let entry = Entry(id: id, ownerID: ownerID, fieldsJSON: fieldsJSON,
                          documentPath: kept.path, originalName: originalName, readAt: Date())
        var next = all
        next.append(entry)
        do { try save(next) }
        catch { try? FileManager.default.removeItem(at: kept); throw error }
        return id
    }
    public func remove(_ id: String, ownerID: String) throws {
        guard let entry = all.first(where: { $0.id == id && $0.ownerID == ownerID }) else { return }
        try save(all.filter { $0.id != id })
        try? FileManager.default.removeItem(atPath: entry.documentPath)
    }
    private func save(_ entries: [Entry]) throws {
        let data = try JSONEncoder().encode(entries)
        try data.write(to: file, options: .atomic)
        all = entries
    }
}
