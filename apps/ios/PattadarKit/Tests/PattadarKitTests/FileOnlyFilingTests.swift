import Foundation
import Testing

@testable import PattadarKit

/// Keeping a paper and having it read are different wants.
///
/// Every add on the phone used to go through the reader, so a person who just
/// wanted a tax receipt kept somewhere safe paid for an extraction to get it.
/// `enqueueFile` is the other door: bytes in, no model, no credit — and it has
/// to be exactly as durable as the scan path, because a filing that is only
/// "probably" saved is worse than one that visibly failed.

@Test("A file-only entry is not a scan and not a photo")
func fileOnlyEntryIsItsOwnKind() throws {
    var entry = WriteQueue.Entry(
        id: UUID(), user: "u01", fieldsJSON: "", storedFile: "receipt.pdf",
        originalName: "receipt.pdf", displayName: "Receipt", link: .none, createdAt: Date())
    entry.fileOnly = true
    entry.sizeBytes = 4096
    entry.mimeType = "application/pdf"

    let decoded = try JSONDecoder().decode(
        WriteQueue.Entry.self, from: JSONEncoder().encode(entry))
    #expect(decoded.isFileOnly)
    #expect(decoded.isPhoto == false)
    #expect(decoded.sizeBytes == 4096)
    #expect(decoded.mimeType == "application/pdf")
}

@Test("An outbox written before file-only filing existed decodes as a scan")
func legacyEntryIsAScan() throws {
    // The synthesized decoder demands a key for every NON-optional property,
    // default value or not. A `Bool = false` here would make every outbox
    // written before today fail to decode — silently dropping filings people
    // are waiting on. This is the guard on that.
    let legacy = """
    {"id":"6F1F5E4E-0000-4000-8000-000000000002","user":"u01","fieldsJSON":"{\\"doc_type\\":\\"Sale Deed\\"}",
     "storedFile":"deed.pdf","originalName":"deed.pdf","displayName":"Sale Deed","link":{"none":{}},
     "createdAt":776000000,"attempts":0,"nextAttemptAt":776000500,"needsReview":false}
    """.replacingOccurrences(of: "\n", with: "")
    let entry = try JSONDecoder().decode(WriteQueue.Entry.self, from: Data(legacy.utf8))
    #expect(entry.isFileOnly == false, "a legacy entry carried a reading — it is a scan")
    #expect(entry.fieldsJSON.contains("Sale Deed"))
}

@Test("enqueueFile is durable first: entry and bytes both on disk")
func enqueueFileIsDurable() async throws {
    let dir = FileManager.default.temporaryDirectory
        .appendingPathComponent("file-queue-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: dir) }

    let source = dir.appendingPathComponent("tax-receipt.pdf")
    try Data(repeating: 7, count: 2048).write(to: source)

    let queue = WriteQueue(directory: dir)
    let entry = try await queue.enqueueFile(
        user: "u01", fileURL: source, displayName: "Tax receipt", link: .none)

    #expect(entry.isFileOnly)
    // The size is read off the COPY in the outbox, so the row can state the
    // file's weight without asking the storage gateway what it stored.
    #expect(entry.sizeBytes == 2048)
    #expect(entry.mimeType == "application/pdf")

    // Durable means durable: the index and the bytes are both on disk before
    // any network is attempted.
    let indexed = try JSONDecoder().decode(
        [WriteQueue.Entry].self,
        from: Data(contentsOf: dir.appendingPathComponent("outbox.json")))
    #expect(indexed.count == 1)
    #expect(indexed[0].isFileOnly)
    #expect(FileManager.default.fileExists(
        atPath: dir.appendingPathComponent("Outbox")
            .appendingPathComponent(indexed[0].storedFile).path))
}

@Test("A file kept without reading carries no extraction")
func fileOnlyCarriesNoFields() async throws {
    let dir = FileManager.default.temporaryDirectory
        .appendingPathComponent("file-queue-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: dir) }
    let source = dir.appendingPathComponent("photocopy.pdf")
    try Data(repeating: 1, count: 16).write(to: source)

    let entry = try await WriteQueue(directory: dir).enqueueFile(
        user: "u01", fileURL: source, displayName: "Photocopy", link: .parcel("parcel-1"))

    // Nothing read it, so it claims nothing about itself. The vault shows it
    // as unsorted rather than dressing it in a type nobody confirmed.
    #expect(entry.fieldsJSON.isEmpty)
    #expect(entry.link == .parcel("parcel-1"))
}
