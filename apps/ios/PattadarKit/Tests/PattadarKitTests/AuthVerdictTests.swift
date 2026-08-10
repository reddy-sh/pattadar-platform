import Foundation
import PattadarKit
import Testing

/// The bug this pins: an access token expired during a phone call, the
/// refresh request failed on flaky cellular, and the catch-all treated the
/// transient failure as a dead refresh token — deleting the Keychain session
/// and leaving every screen answering 401 "Missing Bearer token".
struct AuthVerdictTests {
    @Test func onlyCognitosOwnVerdictSignsOut() {
        // The definitive answer: the refresh token is revoked or aged out.
        #expect(refreshFailureMeansSignedOut("invalid_grant"))
    }

    @Test func weatherIsNotRevocation() {
        // A gateway hiccup, a throttle, a mid-call network drop (URLError
        // has no Cognito error body at all) — the session must survive.
        #expect(!refreshFailureMeansSignedOut("Token exchange answered 502."))
        #expect(!refreshFailureMeansSignedOut("Token exchange answered 0."))
        #expect(!refreshFailureMeansSignedOut(nil))
        #expect(!refreshFailureMeansSignedOut(""))
    }
}
