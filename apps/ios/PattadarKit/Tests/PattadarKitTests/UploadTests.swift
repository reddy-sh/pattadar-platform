import Foundation
import Testing

@testable import PattadarKit

/// The real thing: a 12 MB scanned deed, streamed from disk, read by the API.
///
/// Skipped when the file or the API is absent, so this stays green anywhere —
/// but on this machine it is the test that proves the Swift client can do what
/// the RN one could not until it was rewritten.
@Test("A real deed uploads, streams progress, and comes back read")
func realDeedUploads() async throws {
    let path = NSString(string: "~/Downloads/pattadar docs/Guntur Sites/Site At Nallapadu School 418.pdf")
        .expandingTildeInPath
    guard FileManager.default.fileExists(atPath: path) else { return }
    let base = URL(string: "http://127.0.0.1:8080")!
    var probe = URLRequest(url: base.appendingPathComponent("health"))
    probe.timeoutInterval = 2
    guard let (_, r) = try? await URLSession.shared.data(for: probe),
          (r as? HTTPURLResponse)?.statusCode == 200 else { return }

    // Its own user: earlier write tests ran as a real account and left rows
    // in an append-only audit log.
    let api = PattadarAPI(config: .init(baseURL: base, userID: "ios.crud.test"))
    let fileSize = (try FileManager.default.attributesOfItem(atPath: path)[.size] as? Int64) ?? 0
    let progress = ProgressBox()

    // A 12 MB upload to a third-party model occasionally drops mid-body
    // (ReadError from the API). That is the network, not the client, and a
    // suite that goes red on it teaches everyone to ignore red. One retry,
    // then a real failure.
    var fields: [String: Any] = [:]
    var lastError: Error?
    for attempt in 1...2 {
        do {
            fields = try await api.extract(.registeredDocument, fileURL: URL(fileURLWithPath: path)) { p in
                Task { await progress.record(sent: p.sent, total: p.total) }
            }
            lastError = nil
            break
        } catch {
            lastError = error
            if attempt == 1 { try? await Task.sleep(for: .seconds(2)) }
        }
    }
    if let lastError {
        // A depleted Anthropic balance is not a defect in this client. Say so
        // and skip, rather than failing a suite nobody can turn green.
        if "\(lastError)".contains("credit balance is too low") {
            print("SKIPPED: Anthropic credit exhausted — top up to run this test")
            return
        }
        throw lastError
    }

    // Progress must be REAL — reported by the OS as bytes leave, not a timer.
    //
    // The COUNT of callbacks is not asserted: over loopback the whole 12 MB
    // goes out in a single write, so exactly one arrives. Over a tunnel or
    // cellular there are many. What is guaranteed either way is that the total
    // matches the file and the last report is complete.
    let seen = await progress.samples
    #expect(!seen.isEmpty, "no progress was reported at all")
    #expect(seen.last?.sent == seen.last?.total, "the upload should finish complete")
    let reportedTotal = seen.last?.total ?? 0
    #expect(reportedTotal >= fileSize,
            "reported total \(reportedTotal) should cover the \(fileSize)-byte file plus the multipart envelope")

    #expect(!(fields["headline"] as? String ?? "").isEmpty, "the reader should produce a headline")
    #expect((fields["key_points"] as? [Any])?.isEmpty == false)
    // The extent must parse to 418.5, not 41812 — the bug that shipped once.
    #expect(parseAreaSqYd(fields["extent"] as? String) == 418.5)
}

private actor ProgressBox {
    var samples: [(sent: Int64, total: Int64)] = []
    func record(sent: Int64, total: Int64) { samples.append((sent, total)) }
}
