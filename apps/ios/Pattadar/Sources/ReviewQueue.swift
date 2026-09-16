import Foundation
import PattadarKit
import UserNotifications

/// The on-screen projection of the durable account-partitioned archive.
@MainActor
@Observable
final class ReviewQueue {
    static let shared = ReviewQueue()
    typealias Entry = ReviewArchive.Entry
    private let archive = ReviewArchive(directory: FileManager.default.urls(
        for: .applicationSupportDirectory, in: .userDomainMask)[0])
    private var ownerID = ""
    private(set) var entries: [Entry] = []
    private init() {}

    func activate(ownerID: String) {
        self.ownerID = ownerID
        refresh()
    }
    @discardableResult
    func add(ownerID: String, fields: [String: Any], documentPath: String, originalName: String) -> String? {
        guard let data = try? JSONSerialization.data(withJSONObject: fields, options: [.sortedKeys]),
              let json = String(data: data, encoding: .utf8),
              let id = try? archive.add(ownerID: ownerID, fieldsJSON: json,
                                        documentPath: documentPath, originalName: originalName) else { return nil }
        refresh()
        return id
    }
    func remove(_ id: String) {
        try? archive.remove(id, ownerID: ownerID)
        refresh()
    }
    private func refresh() {
        entries = archive.entries(for: ownerID)
        UNUserNotificationCenter.current().setBadgeCount(entries.count)
    }
}

extension ReviewArchive.Entry {
    var fields: [String: Any] {
        (try? JSONSerialization.jsonObject(with: Data(fieldsJSON.utf8))) as? [String: Any] ?? [:]
    }
    var scan: ScanResult {
        ScanResult(fields: fields, fileURL: URL(fileURLWithPath: documentPath), originalName: originalName)
    }
}
