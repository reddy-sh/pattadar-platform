import Foundation

/// A permanent local copy of every document the user files.
///
/// The API stores bytes in My Drive behind the gateway, which needs a Cognito
/// access token this client does not have yet. Without a local copy a filed
/// document would be a row with nothing to open — which is exactly the state
/// the RN app spent a day in. So the file is copied into the app's Documents
/// directory, keyed by document id, and opening never depends on the network.
public struct LocalFile: Codable, Sendable {
    /// Filename on disk — unique, not for display.
    public let file: String
    /// Human name: "Sale Deed - Nallapadu - 29-07-2026.pdf".
    public let name: String
}

public enum LocalFiles {
    private static let indexName = "local-files.json"

    private static var documents: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }
    private static var indexURL: URL { documents.appendingPathComponent(indexName) }

    public static func all() -> [String: LocalFile] {
        guard let data = try? Data(contentsOf: indexURL),
              let map = try? JSONDecoder().decode([String: LocalFile].self, from: data)
        else { return [:] }
        return map
    }

    public static func url(for documentID: String) -> URL? {
        guard let entry = all()[documentID] else { return nil }
        let url = documents.appendingPathComponent(entry.file)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    /// Copy a picked file in and remember it. Returns the stored URL.
    @discardableResult
    public static func save(documentID: String, from source: URL, displayName: String) throws -> URL {
        let ext = source.pathExtension.isEmpty ? "pdf" : source.pathExtension
        let stored = "doc-\(documentID).\(ext)"
        let dest = documents.appendingPathComponent(stored)
        if FileManager.default.fileExists(atPath: dest.path) {
            try FileManager.default.removeItem(at: dest)
        }
        try FileManager.default.copyItem(at: source, to: dest)
        var map = all()
        map[documentID] = LocalFile(file: stored, name: displayName)
        try JSONEncoder().encode(map).write(to: indexURL, options: .atomic)
        return dest
    }

    /// Forget a document's file. Called when the document itself is deleted, so
    /// bytes do not outlive the record that explains them.
    public static func remove(documentID: String) {
        var map = all()
        if let entry = map.removeValue(forKey: documentID) {
            try? FileManager.default.removeItem(at: documents.appendingPathComponent(entry.file))
        }
        try? JSONEncoder().encode(map).write(to: indexURL, options: .atomic)
    }
}

/// "Sale Deed - Nallapadu - Sy 418 - 29-07-2026.pdf"
///
/// Named from what was READ, not from whatever the picker called it, so the
/// file is findable a year later instead of being `IMG_4821.pdf`.
public func documentFileName(docType: String, village: String, surveyNo: String,
                             originalName: String) -> String {
    let ext = (originalName as NSString).pathExtension
    let f = DateFormatter()
    f.dateFormat = "dd-MM-yyyy"
    let parts = [docType, village, surveyNo.isEmpty ? "" : "Sy \(surveyNo)", f.string(from: Date())]
        .filter { !$0.isEmpty }
    let base = parts.isEmpty ? (originalName as NSString).deletingPathExtension : parts.joined(separator: " - ")
    return ext.isEmpty ? base : "\(base).\(ext)"
}
