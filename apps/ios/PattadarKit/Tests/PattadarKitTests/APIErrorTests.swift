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
}
