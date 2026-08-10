import Foundation

/// Whether a failed token refresh means the person is actually signed out.
///
/// Only Cognito's own verdict — `invalid_grant`, the refresh token revoked
/// or aged out — kills a session. Everything else a refresh can hit (a
/// dropped connection in a phone call, a timeout, a 5xx, DNS on a train) is
/// weather, and weather is not revocation. Treating weather as revocation
/// deleted the founder's session mid-call and turned every screen into a
/// 401 until they signed in again.
public func refreshFailureMeansSignedOut(_ cognitoError: String?) -> Bool {
    cognitoError == "invalid_grant"
}
