import Foundation

/// Several documents leave the phone as ONE file.
///
/// Sharing six deeds used to mean six trips through the share sheet, which is
/// six chances to send the wrong one and no way for the person on the other end
/// to tell what arrived together. A selection is one thing somebody asked for,
/// so it travels as one thing.
///
/// The zip comes from the platform: `NSFileCoordinator`'s `.forUploading` reads
/// a directory as a single archive. No dependency, and it is the same mechanism
/// Files.app uses for "Compress", so what lands on a Mac or a Windows machine is
/// an ordinary zip.
public enum VaultArchive {
    public enum Failure: LocalizedError {
        case nothingToArchive
        case couldNotBuild(String)

        public var errorDescription: String? {
            switch self {
            case .nothingToArchive:
                "None of those documents have a file stored on this phone."
            case .couldNotBuild(let why):
                "Couldn’t build the archive — \(why)"
            }
        }
    }

    /// Two documents can carry the same name — the vault lists records, not
    /// filenames, and nothing stops a person naming two scans "Sale Deed".
    /// Colliding names inside one archive overwrite each other in most
    /// extractors, so they are made unique the way the uploader does it.
    public static func uniqueNames(_ names: [String]) -> [String] {
        var seen = Set<String>()
        return names.map { raw in
            // A name is user-controlled: a path separator would let a member
            // decide where the extractor writes it.
            var safe = raw.replacingOccurrences(of: "/", with: "-")
                .replacingOccurrences(of: "\\", with: "-")
                .trimmingCharacters(in: CharacterSet(charactersIn: " .-"))
            if safe.isEmpty { safe = "document" }
            if seen.insert(safe).inserted { return safe }

            let ext = (safe as NSString).pathExtension
            let stem = (safe as NSString).deletingPathExtension
            var n = 2
            while true {
                let candidate = ext.isEmpty ? "\(stem) (\(n))" : "\(stem) (\(n)).\(ext)"
                if seen.insert(candidate).inserted { return candidate }
                n += 1
            }
        }
    }

    /// "pattadar-vault-2026-08-14.zip"
    public static func archiveName(_ now: Date = Date()) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return "pattadar-vault-\(f.string(from: now)).zip"
    }

    /// Stage the given files under their display names and zip the lot.
    ///
    /// Returns a URL in the temporary directory; the caller hands it to a
    /// `ShareLink` and the system cleans it up. Throws rather than returning a
    /// half-built archive — a partial download of somebody's land records is
    /// worse than a refused one.
    public static func zip(_ files: [(name: String, url: URL)],
                           archiveNamed archive: String? = nil) throws -> URL {
        let readable = files.filter { FileManager.default.fileExists(atPath: $0.url.path) }
        guard !readable.isEmpty else { throw Failure.nothingToArchive }

        let fm = FileManager.default
        // The staging directory's NAME becomes the folder inside the archive,
        // so it is named for what it holds rather than a UUID.
        let stem = (archive ?? archiveName()).replacingOccurrences(of: ".zip", with: "")
        let staging = fm.temporaryDirectory
            .appendingPathComponent("archive-\(UUID().uuidString)", isDirectory: true)
            .appendingPathComponent(stem, isDirectory: true)
        try fm.createDirectory(at: staging, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: staging.deletingLastPathComponent()) }

        let names = uniqueNames(readable.map(\.name))
        for (i, file) in readable.enumerated() {
            try fm.copyItem(at: file.url, to: staging.appendingPathComponent(names[i]))
        }

        var coordinationError: NSError?
        var built: URL?
        var copyError: Error?
        // `.forUploading` hands back a zip of the directory at a URL that is
        // only valid INSIDE this block, so it is copied out before returning.
        NSFileCoordinator().coordinate(readingItemAt: staging, options: [.forUploading],
                                       error: &coordinationError) { zipped in
            let dest = fm.temporaryDirectory.appendingPathComponent(archive ?? archiveName())
            do {
                try? fm.removeItem(at: dest)
                try fm.copyItem(at: zipped, to: dest)
                built = dest
            } catch {
                copyError = error
            }
        }
        if let coordinationError { throw Failure.couldNotBuild(coordinationError.localizedDescription) }
        if let copyError { throw Failure.couldNotBuild(copyError.localizedDescription) }
        guard let built else { throw Failure.couldNotBuild("the system produced no archive") }
        return built
    }
}
