import Foundation
import Testing
@testable import PattadarKit

@MainActor
@Test("Pending readings persist under their original account across switching and relaunch")
func pendingReadingsAreOwned() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let source = directory.appendingPathComponent("scan.pdf")
    try Data("private deed".utf8).write(to: source)
    let legacy = directory.appendingPathComponent("pending-reviews.json")
    try Data("legacy owner unknown".utf8).write(to: legacy)
    let archive = ReviewArchive(directory: directory)
    #expect(archive.hasUnassignedLegacyReadings)
    #expect(archive.entries(for: "bob").isEmpty)
    let id = try archive.add(ownerID: "alice", fieldsJSON: "{}", documentPath: source.path, originalName: "deed.pdf")
    let kept = try #require(archive.entries(for: "alice").first?.documentPath)
    #expect(archive.entries(for: "bob").isEmpty)
    #expect(archive.entries(for: "").isEmpty)
    try archive.remove(id, ownerID: "bob")
    #expect(FileManager.default.fileExists(atPath: kept))
    #expect(archive.entries(for: "alice").count == 1)
    let relaunched = ReviewArchive(directory: directory)
    #expect(relaunched.entries(for: "alice").map(\.id) == [id])
    #expect(relaunched.entries(for: "bob").isEmpty)
    try relaunched.remove(id, ownerID: "alice")
    #expect(relaunched.entries(for: "alice").isEmpty)
    #expect(!FileManager.default.fileExists(atPath: kept))
    #expect(try String(contentsOf: legacy, encoding: .utf8) == "legacy owner unknown")
    #expect(FileManager.default.fileExists(atPath: source.path))
}
