import Foundation
import PattadarKit

/// Documents that have been read but not yet turned into records.
///
/// A read now finishes while the app is closed, and the result was held only in
/// memory. So the notification arrived, the app was opened, and the property was
/// not there — the reading had died with the process that requested it. The
/// person had paid ninety seconds and an API call for nothing, and the only
/// clue was a banner about a document that no longer existed anywhere.
///
/// A finished reading is therefore written to disk and kept until somebody
/// either saves it or throws it away. Nothing is created automatically: a deed
/// read by a machine is a proposal, and the whole design of this app is that a
/// human accepts it before it becomes a land record.
@MainActor
@Observable
final class ReviewQueue {
    static let shared = ReviewQueue()

    struct Entry: Codable, Identifiable {
        let id: String
        /// The extraction, as JSON — the same payload the document row stores.
        let fieldsJSON: String
        let documentPath: String
        let originalName: String
        let readAt: Date

        var fields: [String: Any] {
            guard let data = fieldsJSON.data(using: .utf8),
                  let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { return [:] }
            return raw
        }

        var scan: ScanResult {
            ScanResult(fields: fields,
                       fileURL: URL(fileURLWithPath: documentPath),
                       originalName: originalName)
        }
    }

    // Not state, just a path — and `lazy` cannot live under @Observable's
    // macro without being told so.
    @ObservationIgnored private lazy var fileURL: URL = {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory,
                                           in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("pending-reviews.json")
    }()

    private(set) var entries: [Entry] = []

    private init() { load() }

    private func load() {
        guard let data = try? Data(contentsOf: fileURL),
              let list = try? JSONDecoder().decode([Entry].self, from: data)
        else { entries = []; return }
        // A reading whose document has been deleted cannot be reviewed, and a
        // row pointing at a missing file would fail silently at save time.
        entries = list.filter { FileManager.default.fileExists(atPath: $0.documentPath) }
        if entries.count != list.count { save() }
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(entries) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }

    /// Called from the upload delegate, which may be running in an app that was
    /// relaunched purely to receive this.
    @discardableResult
    func add(fields: [String: Any], documentPath: String, originalName: String) -> String? {
        guard let data = try? JSONSerialization.data(withJSONObject: fields, options: [.sortedKeys]),
              let json = String(data: data, encoding: .utf8)
        else { return nil }
        // The document itself lives in the app's own storage, not the temporary
        // directory the scan wrote it to — a temp file is gone by the time
        // somebody comes back to review it tomorrow.
        let kept = keepDocument(at: documentPath) ?? documentPath
        let entry = Entry(id: UUID().uuidString, fieldsJSON: json,
                          documentPath: kept, originalName: originalName,
                          readAt: Date())
        entries.append(entry)
        save()
        return entry.id
    }

    func remove(_ id: String) {
        guard let i = entries.firstIndex(where: { $0.id == id }) else { return }
        // The kept copy goes with it; leaving it would accumulate 14 MB scans
        // nothing points at.
        try? FileManager.default.removeItem(atPath: entries[i].documentPath)
        entries.remove(at: i)
        save()
    }

    /// Move the scan out of `tmp`, which iOS empties without warning.
    private func keepDocument(at path: String) -> String? {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory,
                                           in: .userDomainMask)[0]
            .appendingPathComponent("PendingScans", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let source = URL(fileURLWithPath: path)
        let dest = dir.appendingPathComponent("\(UUID().uuidString)-\(source.lastPathComponent)")
        do {
            try FileManager.default.copyItem(at: source, to: dest)
            return dest.path
        } catch {
            return nil
        }
    }
}
