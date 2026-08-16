import Foundation
import PattadarKit
import Testing

/// What a failure SAYS. The person reading it is standing in a field or a
/// queue; markup and status-code trivia are never the message.
struct APIErrorTests {
    @Test func htmlErrorPagesAreNeverShown() {
        let ngrok = PattadarAPI.APIError.http(503, "<!DOCTYPE html>\n<html class=\"h-full\" lang=\"en-US\"><head>…")
        #expect(!ngrok.description.contains("<"))
        #expect(ngrok.description.contains("briefly unavailable"))

        // A non-gateway code with an HTML body still hides the markup.
        let odd = PattadarAPI.APIError.http(418, "<html><body>teapot</body></html>")
        #expect(!odd.description.contains("<"))
        #expect(odd.description.contains("418"))
    }

    @Test func plainBodiesStillCarryTheirMessage() {
        let e = PattadarAPI.APIError.http(500, "database connection refused")
        #expect(e.description.contains("500"))
        #expect(e.description.contains("database connection refused"))
    }

    @Test("Stopping a read is a stop, not a failure — on both upload paths")
    func cancellationIsNeverAFailure() {
        // What a background upload task actually reports when Stop is pressed.
        // Reaching a screen untranslated, this printed
        // `Error Domain=NSURLErrorDomain Code=-999 … UserInfo={…}` in red, and
        // never matched the `.cancelled` branch that returns the card to idle.
        let stopped = PattadarAPI.APIError.from(URLError(.cancelled))
        guard case .cancelled = stopped else {
            Issue.record("a cancelled task must become .cancelled, got \(stopped)")
            return
        }
        #expect(stopped.description == "Stopped.")

        guard case .cancelled = PattadarAPI.APIError.from(CancellationError()) else {
            Issue.record("a Swift cancellation must become .cancelled")
            return
        }
    }

    @Test("A dead server is said in a sentence, never as an NSError dump")
    func transportFailuresAreReadable() {
        // The laptop bridge being down is the everyday case: the phone points
        // at a LAN address with nothing on it.
        let dead = PattadarAPI.APIError.from(URLError(.cannotConnectToHost))
        guard case .transport = dead else {
            Issue.record("a transport failure must become .transport, got \(dead)")
            return
        }
        #expect(!dead.description.contains("NSURLErrorDomain"))
        #expect(!dead.description.contains("UserInfo"))
        #expect(!dead.description.contains("Code="))
        #expect(dead.description == "Couldn’t reach the server.")

        // An unlocalised error must not leak its NSError fallback either —
        // "The operation couldn't be completed. (NSURLErrorDomain error -1.)"
        // is machine text wearing a full stop.
        let obscure = PattadarAPI.APIError.from(URLError(.init(rawValue: -1)))
        #expect(!obscure.description.contains("NSURLErrorDomain"))
        #expect(!obscure.description.contains("error -"))
    }

    @Test("Translating an APIError leaves it alone")
    func alreadyTranslatedIsNotDoubleWrapped() {
        let original = PattadarAPI.APIError.emptyExtraction("passbook")
        let again = PattadarAPI.APIError.from(original)
        #expect(again.description == original.description)
    }
}
