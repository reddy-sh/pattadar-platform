import Foundation
import Testing

@testable import PattadarKit

/// The archive has to open, and it has to contain what the person selected.
/// A zip that shares cleanly but arrives empty — or arrives with one document
/// silently overwriting another because they had the same name — is worse than
/// refusing to build one.

@Test("Several documents become one archive that unzips")
func filesBecomeAnArchive() throws {
    let dir = FileManager.default.temporaryDirectory
        .appendingPathComponent("archive-test-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: dir) }

    let a = dir.appendingPathComponent("a.pdf")
    let b = dir.appendingPathComponent("b.pdf")
    try Data("deed one".utf8).write(to: a)
    try Data("deed two".utf8).write(to: b)

    let zip = try VaultArchive.zip([("Sale Deed.pdf", a), ("Passbook.pdf", b)],
                                   archiveNamed: "test-vault.zip")
    defer { try? FileManager.default.removeItem(at: zip) }

    #expect(FileManager.default.fileExists(atPath: zip.path))
    #expect(zip.lastPathComponent == "test-vault.zip")

    // Read it back with the system unzip rather than trusting our own writer.
    let out = dir.appendingPathComponent("out", isDirectory: true)
    let unzip = Process()
    unzip.executableURL = URL(fileURLWithPath: "/usr/bin/unzip")
    unzip.arguments = ["-qq", "-o", zip.path, "-d", out.path]
    try unzip.run()
    unzip.waitUntilExit()
    #expect(unzip.terminationStatus == 0, "the archive did not open")

    let found = FileManager.default.enumerator(at: out, includingPropertiesForKeys: nil)?
        .compactMap { ($0 as? URL)?.lastPathComponent } ?? []
    #expect(found.contains("Sale Deed.pdf"))
    #expect(found.contains("Passbook.pdf"))
}

@Test("A selection with no stored files refuses rather than shipping an empty zip")
func nothingToArchive() {
    let missing = FileManager.default.temporaryDirectory
        .appendingPathComponent("does-not-exist-\(UUID().uuidString).pdf")
    #expect(throws: VaultArchive.Failure.self) {
        _ = try VaultArchive.zip([("Gone.pdf", missing)])
    }
}

@Test("Two documents named the same do not overwrite each other")
func collidingNamesAreMadeUnique() {
    #expect(VaultArchive.uniqueNames(["Sale Deed.pdf", "Sale Deed.pdf"])
            == ["Sale Deed.pdf", "Sale Deed (2).pdf"])
    #expect(VaultArchive.uniqueNames(["a.pdf", "a.pdf", "a.pdf"])
            == ["a.pdf", "a (2).pdf", "a (3).pdf"])
    // The suffix goes BEFORE the extension, or the file will not open.
    #expect(VaultArchive.uniqueNames(["scan", "scan"]) == ["scan", "scan (2)"])
}

@Test("A name cannot decide where the extractor writes it")
func namesCannotEscape() {
    #expect(VaultArchive.uniqueNames(["../../etc/passwd"]) == ["etc-passwd"])
    #expect(VaultArchive.uniqueNames(["a/b.pdf"]) == ["a-b.pdf"])
    #expect(VaultArchive.uniqueNames([""]) == ["document"])
}

@Test("The archive is named for the day it was made")
func archiveIsDated() {
    var parts = DateComponents()
    parts.year = 2026; parts.month = 8; parts.day = 14
    let when = Calendar.current.date(from: parts)!
    #expect(VaultArchive.archiveName(when) == "pattadar-vault-2026-08-14.zip")
}
